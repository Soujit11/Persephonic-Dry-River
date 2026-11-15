import { ReverbBusPool } from '../dsp/ReverbBus.js';
import { reverbSendGain } from '../spatial/WorldAcoustics.js';
import { transmissionGain } from '../spatial/RoomAcoustics.js';
import { rt60ForSize01 } from '../dsp/FdnCoefficients.js';
import { clamp01 } from './math.js';
/**
 * How long a new world room takes to replace the one before it. Long enough
 * that a doorway reads as a transition rather than a cut, short enough that
 * the room has arrived by the time you have walked through it.
 */
export const WORLD_ROOM_XFADE_S = 1.2;
/**
 * Wet level lent to voices whose script asked for no reverb, when a world room
 * is active and the caller did not measure one. Matches the floor of
 * `reverbFromEnclosure` (0.08 in fully open air) so an unscripted voice is
 * quietly present in the room rather than either bone dry or swimming.
 */
export const DEFAULT_WORLD_WET = 0.08;
/**
 * How far the measured enclosure must move before the room is rebuilt.
 * Walking produces a continuously varying measurement; without a deadband
 * every step would synthesize a fresh impulse response (up to ~288k frames,
 * synchronously) and thrash the IR cache. This bounds the churn to actual
 * movement between distinct spaces.
 */
export const WORLD_ROOM_HYSTERESIS = 0.12;
/**
 * Crossfade an AudioParam along an equal-POWER curve. Two reverb tails are
 * uncorrelated, so their powers sum: a linear gain fade dips about 3 dB
 * through the midpoint, which is audible as a hole in the middle of a doorway.
 */
function rampEqualPower(param, from, to, startTime, duration) {
    const STEPS = 33;
    const curve = new Float32Array(STEPS);
    for (let i = 0; i < STEPS; i++) {
        const x = i / (STEPS - 1);
        // cos/sin quarter-circle: from²+to² stays 1 across the fade.
        curve[i] = from * Math.cos((x * Math.PI) / 2) + to * Math.sin((x * Math.PI) / 2);
    }
    try {
        param.cancelScheduledValues(startTime);
        param.setValueCurveAtTime(curve, startTime, duration);
    }
    catch {
        // Overlapping curve automation (rooms swapped faster than a fade) — fall
        // back to a linear ramp rather than dropping the transition entirely.
        param.linearRampToValueAtTime(to, startTime + duration);
    }
}
export class WorldRoom {
    ctx;
    output;
    host;
    /** Shared room reverbs — one convolver per distinct (size, damping). */
    pool;
    /**
     * The room the LISTENER is standing in, measured from world geometry as the
     * player walks (null outside world scenes). It claims only the voices whose
     * script asked for no room.
     */
    measuredRoom = null;
    /**
     * Room derived from the SCRIPT's own `room`/`material` declarations — the
     * authored counterpart of the measured world room. A declared room is
     * authorship (it makes `_hasScriptReverb` true on the voices it covers), so
     * the world room never overrides it.
     */
    declared = null;
    /** Per-room reverb for `in <room>` membership (lowercased name → reverb). */
    declaredByName = new Map();
    /** The placed room the listener stands in — the ambient override while inside. */
    listenerRoom = null;
    /** Every world-room send lands here, so a room change rewires 2 nodes, not N. */
    input = null;
    /**
     * The room currently fading UP. Rooms on their way out are held only by
     * their release timer — they keep sounding (and keep their bus refcount)
     * until the crossfade ends, so mid-transition the pool holds two buses
     * while this holds one.
     */
    layers = [];
    /**
     * Parametric world room. When present, the room's decay is a coefficient
     * written every tick instead of an impulse response crossfaded between —
     * so `WORLD_ROOM_HYSTERESIS` is not applied on this path, because there is
     * nothing left to quantize. Null when the worklet is unavailable or still
     * loading, in which case the convolver path runs unchanged.
     */
    fdnNode = null;
    /** null = not tried, true = loading/loaded, false = unavailable, use convolvers. */
    fdnAvailable = null;
    constructor(ctx, 
    /** Where every room's output lands — the master gain, NOT a panner. */
    output, host) {
        this.ctx = ctx;
        this.output = output;
        this.host = host;
        this.pool = new ReverbBusPool(ctx, output);
    }
    // ── Declared rooms ──
    setDeclared(room, byName) {
        this.declared = room;
        this.declaredByName = byName;
    }
    get declaredRoom() { return this.declared; }
    get declaredRoomsByName() { return this.declaredByName; }
    namedRoom(name) { return this.declaredByName.get(name) ?? null; }
    setListenerRoom(room) { this.listenerRoom = room; }
    get listenerRoomReverb() { return this.listenerRoom; }
    // ── The ladder ──
    /**
     * Which room a statement's send belongs to. Precedence, top down: the voice's
     * own `reverb` > its `in <room>` > the placed room the listener stands in >
     * the scene's declared room. Anything below that is the measured world room
     * (`hasScriptReverb` false), which claims only voices that never asked.
     */
    resolve(stmt) {
        const namedRoom = stmt.roomName ? this.namedRoom(stmt.roomName) : null;
        const ambientRoom = this.listenerRoom ?? this.declared;
        if (stmt.reverbParams) {
            const rng = () => this.host.rng();
            return {
                hasScriptReverb: true,
                roomSize: stmt.reverbParams.roomSize.sample(rng),
                damping: stmt.reverbParams.damping.sample(rng),
                wet: stmt.reverbParams.dryWet.sample(rng),
            };
        }
        const room = namedRoom ?? ambientRoom;
        if (room)
            return { hasScriptReverb: true, roomSize: room.size, damping: room.damping, wet: room.wet };
        return { hasScriptReverb: false, roomSize: 0, damping: 0, wet: 0 };
    }
    /**
     * Where a resolved room's send connects and how loud. A scripted room gets
     * its own bus (the author wins, and keeps it while a world room is active);
     * an unscripted voice rides the world room's input while there is one, and
     * is silent otherwise — nothing to feed.
     */
    sendTarget(room, profile = null) {
        if (room.hasScriptReverb) {
            const bus = this.pool.acquire(room.roomSize, room.damping);
            return { bus, node: bus.input, gain: reverbSendGain(room.wet, room.roomSize, profile) };
        }
        if (this.measuredRoom) {
            return { bus: null, node: this.ensureInput(), gain: reverbSendGain(this.measuredRoom.wet01, this.measuredRoom.size01, profile) };
        }
        return { bus: null, node: null, gain: 0 };
    }
    // ── Send level ──
    /**
     * The one place a send level is computed: critical-distance scaling for the
     * room, times transmission loss for how separated this source is from it.
     * Calibrated scenes: the room hears the RECEIVED level, not the
     * emission-relative pre-panner gain — otherwise a loud source far outside
     * the room (thunder 3 km off) would pour into the listener's room as if it
     * stood inside it. `_pathGain` is 1 while uncalibrated.
     */
    sendGainFor(track, wet01, roomSize01) {
        return reverbSendGain(wet01, roomSize01, track.statement?.distanceProfile) * transmissionGain(track._transmissionBlocked) * track._pathGain;
    }
    /** The send gain a voice should carry right now — its room's wet/size under the author-wins ladder. */
    currentSendGain(track) {
        const wet = Number.isNaN(track._lastReverbWet) ? track._reverbWet : track._lastReverbWet;
        const size = track._hasScriptReverb
            ? track._reverbRoomSize : (this.measuredRoom?.size01 ?? track._reverbRoomSize);
        const effectiveWet = track._hasScriptReverb ? wet : (this.measuredRoom?.wet01 ?? 0);
        return this.sendGainFor(track, effectiveWet, size);
    }
    // ── The measured world room ──
    /** A copy of the measured room, in the same unit fields the setter took; null outside any room. */
    get measured() {
        return this.measuredRoom ? { ...this.measuredRoom } : null;
    }
    /**
     * Set the room the listener is standing in, measured from world geometry at
     * the player's position. Safe to call at the walk loop's rate — changes below
     * `WORLD_ROOM_HYSTERESIS` are ignored on the convolver path, so only actually
     * moving between spaces costs anything.
     *
     * The new room crossfades in over `WORLD_ROOM_XFADE_S` with an equal-power
     * curve. Every unscripted voice's send is re-levelled at the same time,
     * because the new room's critical distance moves the point where direct and
     * reverberant energy cross over.
     */
    set(size01, damping01, wet01 = DEFAULT_WORLD_WET) {
        const size = clamp01(size01);
        const damping = clamp01(damping01);
        const wet = clamp01(wet01);
        this.ensureFdn();
        // The hysteresis exists ONLY to protect the convolver path: every distinct
        // room there means acquiring another bus and crossfading a whole impulse
        // response, so the parameter has to be quantized (~0.128 of size01, about
        // 14 JND of reverb time per tread). The FDN has nothing to quantize — its
        // decay is a coefficient — so applying the deadband on that path would
        // reintroduce the staircase for no reason at all.
        if (!this.fdnNode && this.measuredRoom
            && Math.abs(size - this.measuredRoom.size01) < WORLD_ROOM_HYSTERESIS
            && Math.abs(damping - this.measuredRoom.damping01) < WORLD_ROOM_HYSTERESIS
            && Math.abs(wet - this.measuredRoom.wet01) < WORLD_ROOM_HYSTERESIS) {
            return;
        }
        const entering = !this.measuredRoom;
        this.measuredRoom = { size01: size, damping01: damping, wet01: wet };
        const input = this.ensureInput();
        // First world room: connect the UNSCRIPTED voices to the shared input.
        // Voices with authored reverb stay on their own buses — the author wins;
        // the room only fills the gap for voices that never asked for a space.
        if (entering) {
            for (const track of this.host.tracks()) {
                if (!track.reverbSend || track._hasScriptReverb)
                    continue;
                try {
                    track.reverbSend.disconnect();
                }
                catch { /* not connected */ }
                track.reverbSend.connect(input);
            }
        }
        if (this.fdnNode) {
            if (entering)
                input.connect(this.fdnNode);
            this.writeFdnRoom(size, damping);
        }
        else {
            this.swapLayer(this.pool.acquire(size, damping));
        }
        this.relevelSends(size, wet);
    }
    /**
     * Leave the world room — voices fall back to the rooms their scripts asked
     * for. Called when a world is unloaded or walk mode ends.
     */
    clear() {
        if (!this.measuredRoom)
            return;
        this.measuredRoom = null;
        for (const track of this.host.tracks()) {
            // Scripted voices never left their own bus under author-wins precedence;
            // touching them here would disconnect a room the author still holds.
            if (!track.reverbSend || track._hasScriptReverb)
                continue;
            try {
                track.reverbSend.disconnect();
            }
            catch { /* not connected */ }
            // Nothing to fall back to — the room was the only reason it was wet.
            if (!track.virtual)
                track.reverbSend.gain.setTargetAtTime(0, this.ctx.currentTime, WORLD_ROOM_XFADE_S / 3);
        }
        this.teardownInput();
    }
    /** Release everything: the measured room, its layers and input, and the pool. */
    dispose() {
        this.measuredRoom = null;
        this.teardownInput();
        this.pool.dispose();
    }
    /** The FDN worklet node, when loaded (read by tests). */
    get fdn() { return this.fdnNode; }
    /** The convolver layers currently held (read by tests). */
    get convolverLayers() { return this.layers; }
    /**
     * Load the FDN worklet, once, in the background.
     *
     * Deliberately fire-and-forget: `set` runs at walk rate and cannot await
     * anything. The first world room after a cold start therefore uses the
     * convolver path and the FDN takes over on a later call — a one-off
     * transition nobody will hear, and far preferable to blocking the walk loop
     * or dropping the room entirely while a module loads.
     *
     * Any failure (no `audioWorklet`, blocked module, older browser) latches
     * `fdnAvailable = false` and the convolver path runs unchanged forever. The
     * FDN is an improvement to the world room, not a requirement for having one.
     */
    ensureFdn() {
        if (this.fdnAvailable !== null)
            return;
        const worklet = this.ctx.audioWorklet;
        if (!worklet || typeof AudioWorkletNode === 'undefined') {
            this.fdnAvailable = false;
            return;
        }
        this.fdnAvailable = true;
        const url = new URL('../dsp/fdn-processor.js', import.meta.url);
        worklet.addModule(url)
            .then(() => {
            if (this.fdnAvailable === false)
                return; // destroyed while loading
            const node = new AudioWorkletNode(this.ctx, 'satie-fdn-reverb', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });
            node.connect(this.output);
            this.fdnNode = node;
            // Adopt whatever room is already standing.
            if (this.measuredRoom) {
                this.ensureInput().connect(node);
                this.writeFdnRoom(this.measuredRoom.size01, this.measuredRoom.damping01);
                this.teardownLayers();
            }
        })
            .catch(() => { this.fdnAvailable = false; });
    }
    /** Write a room into the FDN's parameters. Continuous — no quantization. */
    writeFdnRoom(size01, damping01) {
        if (!this.fdnNode)
            return;
        const t = this.ctx.currentTime;
        const rt60 = this.fdnNode.parameters.get('rt60');
        const damping = this.fdnNode.parameters.get('damping');
        // Short ramps rather than steps: the coefficient is continuous, but a
        // discontinuous *write* would still click.
        rt60?.setTargetAtTime(rt60ForSize01(size01), t, 0.12);
        damping?.setTargetAtTime(clamp01(damping01), t, 0.12);
    }
    ensureInput() {
        if (!this.input)
            this.input = this.ctx.createGain();
        return this.input;
    }
    /**
     * Fade the incoming room up and every room already sounding down. The
     * outgoing bus is released on a wall-clock timer, not the scheduler: a room
     * change can happen while playback is stopped (walking a world in silence),
     * and the scheduler only advances while the engine ticks.
     */
    swapLayer(bus) {
        const t0 = this.ctx.currentTime;
        const fade = this.ctx.createGain();
        fade.gain.value = 0;
        this.ensureInput().connect(fade);
        fade.connect(bus.input);
        rampEqualPower(fade.gain, 0, 1, t0, WORLD_ROOM_XFADE_S);
        const outgoing = this.layers;
        this.layers = [{ bus, fade }];
        for (const layer of outgoing) {
            rampEqualPower(layer.fade.gain, 1, 0, t0, WORLD_ROOM_XFADE_S);
            // Release only after the tail has actually faded, or the room would cut.
            setTimeout(() => {
                try {
                    layer.fade.disconnect();
                }
                catch { /* ok */ }
                this.pool.release(layer.bus);
            }, (WORLD_ROOM_XFADE_S + 0.2) * 1000);
        }
    }
    /** Re-level every world-room send for the new room's critical distance. */
    relevelSends(size01, worldWet01) {
        const t = this.ctx.currentTime;
        for (const track of this.host.tracks()) {
            // Scripted voices are on their own buses and their sends already carry
            // the authored room's critical distance — a world-room change is none of
            // their business. Re-levelling them against the WORLD room's size was
            // the audible half of the old precedence.
            if (!track.reverbSend || track._hasScriptReverb || track.virtual)
                continue;
            track.reverbSend.gain.setTargetAtTime(this.sendGainFor(track, worldWet01, size01), t, WORLD_ROOM_XFADE_S / 3);
        }
    }
    /**
     * Release the convolver layers without touching the input. Used when the
     * FDN finishes loading and takes over a room the convolvers were already
     * sounding — the input keeps feeding, only what it feeds changes.
     */
    teardownLayers() {
        for (const layer of this.layers) {
            try {
                layer.fade.disconnect();
            }
            catch { /* ok */ }
            this.pool.release(layer.bus);
        }
        this.layers = [];
    }
    teardownInput() {
        this.teardownLayers();
        if (this.input) {
            try {
                this.input.disconnect();
            }
            catch { /* ok */ }
            this.input = null;
        }
    }
}
//# sourceMappingURL=WorldRoom.js.map