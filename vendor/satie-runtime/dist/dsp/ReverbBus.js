/**
 * Shared reverb buses — the room, rendered once instead of once per voice.
 *
 * WHY THIS EXISTS. Reverb used to be a per-voice wet/dry crossfade inside the
 * DSP chain, which fed the panner. That put the reverberant signal through the
 * same distance attenuation and the same HRTF localization as the direct
 * signal, with two consequences that read as "not a real space":
 *
 *   1. The direct-to-reverberant ratio never changed with distance. A source
 *      3 m away and the same source 30 m away sounded equally reverberant,
 *      just quieter — so the strongest distance cue humans have was flat.
 *   2. The tail arrived from the source's direction. A reverberant field is
 *      diffuse; hearing it as a point defeats the sense of being inside
 *      anything.
 *
 * A bus fixes both. Voices SEND into it (see WorldAcoustics.reverbSendGain —
 * a distance-independent level, because a diffuse field does not fade as you
 * walk away from a source inside it), and the bus output goes straight to the
 * master, bypassing the panner entirely. What comes back is a tail that stays
 * put while the direct sound falls off, and that arrives from everywhere.
 *
 * Diffuseness comes free from the impulse response: DSPChain generates it with
 * independent noise per channel, so a mono send convolved against it emerges
 * decorrelated across L/R. No panner, no width fudge.
 *
 * Voices sharing a room share a bus — one ConvolverNode for a scene instead of
 * one per voice, which is also why a 40-voice world stopped costing 40
 * convolutions. Rooms are keyed on quantized (size, damping), matching the
 * impulse-response cache's own 0.05 quantization.
 */
import { generateImpulseResponse } from './DSPChain.js';
/**
 * Headroom trim on every bus output. Reverberant sends from N voices sum
 * incoherently (~sqrt(N) growth) into one convolver, and unlike the dry path
 * they never attenuate with distance — so a dense scene can present the master
 * limiter with far more sustained energy than the old per-voice wet did. This
 * buys back enough headroom that the limiter shapes transients instead of
 * riding the bed. It is a mix constant, not a room property.
 */
export const REVERB_BUS_TRIM = 0.8;
/** Rooms within this quantum share a bus (matches the IR cache's own step). */
const ROOM_QUANTUM = 0.05;
function busKey(roomSize, damping) {
    return `${Math.round(roomSize / ROOM_QUANTUM)}|${Math.round(damping / ROOM_QUANTUM)}`;
}
/**
 * Owns the set of live reverb buses for one audio graph. The engine holds one
 * pool; the offline renderer builds its own so exports render the same rooms.
 */
export class ReverbBusPool {
    ctx;
    destination;
    buses = new Map();
    tails = new Map();
    constructor(ctx, 
    /** Where bus output lands — the master gain, NOT a panner. */
    destination) {
        this.ctx = ctx;
        this.destination = destination;
    }
    /**
     * Get the bus for a room, creating it on first use. Every acquire must be
     * paired with a release, or the bus outlives the scene that needed it.
     */
    acquire(roomSize, damping) {
        const key = busKey(roomSize, damping);
        const existing = this.buses.get(key);
        if (existing) {
            existing.refCount++;
            return existing;
        }
        const input = this.ctx.createGain();
        const convolver = this.ctx.createConvolver();
        const output = this.ctx.createGain();
        convolver.buffer = generateImpulseResponse(this.ctx, roomSize, damping);
        // Send levels carry the per-voice amount; the bus only trims for headroom.
        input.gain.value = 1;
        output.gain.value = REVERB_BUS_TRIM;
        input.connect(convolver);
        convolver.connect(output);
        output.connect(this.destination);
        const bus = { input, convolver, output, roomSize, damping, refCount: 1 };
        this.buses.set(key, bus);
        return bus;
    }
    /** Drop a voice's claim; the bus is torn down when the last one leaves. */
    release(bus, preserveTail = false) {
        bus.refCount--;
        if (bus.refCount > 0)
            return;
        const key = busKey(bus.roomSize, bus.damping);
        // Only delete the entry if it is still this bus (a re-acquire during
        // teardown would otherwise orphan the live one).
        if (this.buses.get(key) === bus)
            this.buses.delete(key);
        if (preserveTail) {
            // No new sends enter this bus. Keep its existing convolution decay,
            // bounded even during rapid room edits; stop/dispose clears every tail.
            const duration = bus.convolver.buffer?.duration ?? 0;
            if (Number.isFinite(duration) && duration > 0) {
                if (this.tails.size >= 16) {
                    const [old, timer] = this.tails.entries().next().value;
                    clearTimeout(timer);
                    disconnectBus(old);
                    this.tails.delete(old);
                }
                this.tails.set(bus, setTimeout(() => { disconnectBus(bus); this.tails.delete(bus); }, Math.min(12, duration + 0.05) * 1000));
                return;
            }
        }
        disconnectBus(bus);
    }
    /** Tear down every bus — called when the engine stops or the graph resets. */
    dispose() {
        for (const [bus, timer] of this.tails) {
            clearTimeout(timer);
            disconnectBus(bus);
        }
        this.tails.clear();
        for (const bus of this.buses.values())
            disconnectBus(bus);
        this.buses.clear();
    }
    /** Live bus count — for tests and diagnostics. */
    get size() {
        return this.buses.size;
    }
}
function disconnectBus(bus) {
    try {
        bus.input.disconnect();
    }
    catch { /* already disconnected */ }
    try {
        bus.convolver.disconnect();
    }
    catch { /* already disconnected */ }
    try {
        bus.output.disconnect();
    }
    catch { /* already disconnected */ }
}
//# sourceMappingURL=ReverbBus.js.map