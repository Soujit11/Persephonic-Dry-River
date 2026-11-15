/**
 * The rooms voices send into: the measured WORLD room, the script's DECLARED
 * rooms, and the shared reverb bus pool they are realized on.
 *
 * Owns the author-wins ladder (a voice's own `reverb` > its `in <room>` >
 * the placed room the listener stands in > the scene's first declared room >
 * the measured world room), the measured room's crossfade / hysteresis /
 * FDN-worklet path, the shared world-room input, the send-level law
 * (critical distance × transmission × received level) and the bus pool.
 *
 * Collaborators (`WorldRoomHost`) — what stays the engine's business:
 *   reads   `tracks()` (every live voice, to enter, leave and re-level the
 *           world room; the engine owns the voices and their nodes),
 *           `rng()` (sampling a statement's authored reverb ranges)
 * The engine still builds each voice's send/dry split and rewires it; this
 * module only says WHERE a send goes and HOW LOUD, and owns the nodes the
 * room itself needs (input, fade layers, buses, the FDN node).
 */
import type { Statement } from './Statement.js';
import { ReverbBusPool, type ReverbBus } from '../dsp/ReverbBus.js';
import { type ReverbSuggestion, type DistanceProfile } from '../spatial/WorldAcoustics.js';
/**
 * How long a new world room takes to replace the one before it. Long enough
 * that a doorway reads as a transition rather than a cut, short enough that
 * the room has arrived by the time you have walked through it.
 */
export declare const WORLD_ROOM_XFADE_S = 1.2;
/**
 * Wet level lent to voices whose script asked for no reverb, when a world room
 * is active and the caller did not measure one. Matches the floor of
 * `reverbFromEnclosure` (0.08 in fully open air) so an unscripted voice is
 * quietly present in the room rather than either bone dry or swimming.
 */
export declare const DEFAULT_WORLD_WET = 0.08;
/**
 * How far the measured enclosure must move before the room is rebuilt.
 * Walking produces a continuously varying measurement; without a deadband
 * every step would synthesize a fresh impulse response (up to ~288k frames,
 * synchronously) and thrash the IR cache. This bounds the churn to actual
 * movement between distinct spaces.
 */
export declare const WORLD_ROOM_HYSTERESIS = 0.12;
/** The measured world room, in the unit ranges the enclosure probe produces. */
export interface MeasuredWorldRoom {
    size01: number;
    damping01: number;
    wet01: number;
}
/** What a voice's send needs to know about it, for the send-level law. */
export interface RoomSendTrack {
    statement?: Pick<Statement, "distanceProfile">;
    reverbSend: GainNode | null;
    /** A retained logical loop has no native parameter automation until wake. */
    virtual?: boolean;
    _hasScriptReverb: boolean;
    _transmissionBlocked: number;
    _pathGain: number;
    _lastReverbWet: number;
    _reverbWet: number;
    _reverbRoomSize: number;
}
export interface WorldRoomHost {
    tracks(): Iterable<RoomSendTrack>;
    rng(): number;
}
/** The room a statement's send belongs to, resolved down the author-wins ladder. */
export interface ResolvedRoom {
    /** True when the script (voice, named room or a declared scene room) chose the room. */
    hasScriptReverb: boolean;
    roomSize: number;
    damping: number;
    wet: number;
}
/** Where a send connects and at what gain; `bus` is held (and later released) by the voice. */
export interface SendTarget {
    bus: ReverbBus | null;
    node: AudioNode | null;
    gain: number;
}
export declare class WorldRoom {
    private readonly ctx;
    /** Where every room's output lands — the master gain, NOT a panner. */
    private readonly output;
    private readonly host;
    /** Shared room reverbs — one convolver per distinct (size, damping). */
    readonly pool: ReverbBusPool;
    /**
     * The room the LISTENER is standing in, measured from world geometry as the
     * player walks (null outside world scenes). It claims only the voices whose
     * script asked for no room.
     */
    private measuredRoom;
    /**
     * Room derived from the SCRIPT's own `room`/`material` declarations — the
     * authored counterpart of the measured world room. A declared room is
     * authorship (it makes `_hasScriptReverb` true on the voices it covers), so
     * the world room never overrides it.
     */
    private declared;
    /** Per-room reverb for `in <room>` membership (lowercased name → reverb). */
    private declaredByName;
    /** The placed room the listener stands in — the ambient override while inside. */
    private listenerRoom;
    /** Every world-room send lands here, so a room change rewires 2 nodes, not N. */
    private input;
    /**
     * The room currently fading UP. Rooms on their way out are held only by
     * their release timer — they keep sounding (and keep their bus refcount)
     * until the crossfade ends, so mid-transition the pool holds two buses
     * while this holds one.
     */
    private layers;
    /**
     * Parametric world room. When present, the room's decay is a coefficient
     * written every tick instead of an impulse response crossfaded between —
     * so `WORLD_ROOM_HYSTERESIS` is not applied on this path, because there is
     * nothing left to quantize. Null when the worklet is unavailable or still
     * loading, in which case the convolver path runs unchanged.
     */
    private fdnNode;
    /** null = not tried, true = loading/loaded, false = unavailable, use convolvers. */
    private fdnAvailable;
    constructor(ctx: AudioContext, 
    /** Where every room's output lands — the master gain, NOT a panner. */
    output: AudioNode, host: WorldRoomHost);
    setDeclared(room: ReverbSuggestion | null, byName: Map<string, ReverbSuggestion>): void;
    get declaredRoom(): ReverbSuggestion | null;
    get declaredRoomsByName(): ReadonlyMap<string, ReverbSuggestion>;
    namedRoom(name: string): ReverbSuggestion | null;
    setListenerRoom(room: ReverbSuggestion | null): void;
    get listenerRoomReverb(): ReverbSuggestion | null;
    /**
     * Which room a statement's send belongs to. Precedence, top down: the voice's
     * own `reverb` > its `in <room>` > the placed room the listener stands in >
     * the scene's declared room. Anything below that is the measured world room
     * (`hasScriptReverb` false), which claims only voices that never asked.
     */
    resolve(stmt: Statement): ResolvedRoom;
    /**
     * Where a resolved room's send connects and how loud. A scripted room gets
     * its own bus (the author wins, and keeps it while a world room is active);
     * an unscripted voice rides the world room's input while there is one, and
     * is silent otherwise — nothing to feed.
     */
    sendTarget(room: ResolvedRoom, profile?: DistanceProfile | null): SendTarget;
    /**
     * The one place a send level is computed: critical-distance scaling for the
     * room, times transmission loss for how separated this source is from it.
     * Calibrated scenes: the room hears the RECEIVED level, not the
     * emission-relative pre-panner gain — otherwise a loud source far outside
     * the room (thunder 3 km off) would pour into the listener's room as if it
     * stood inside it. `_pathGain` is 1 while uncalibrated.
     */
    sendGainFor(track: RoomSendTrack, wet01: number, roomSize01: number): number;
    /** The send gain a voice should carry right now — its room's wet/size under the author-wins ladder. */
    currentSendGain(track: RoomSendTrack): number;
    /** A copy of the measured room, in the same unit fields the setter took; null outside any room. */
    get measured(): MeasuredWorldRoom | null;
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
    set(size01: number, damping01: number, wet01?: number): void;
    /**
     * Leave the world room — voices fall back to the rooms their scripts asked
     * for. Called when a world is unloaded or walk mode ends.
     */
    clear(): void;
    /** Release everything: the measured room, its layers and input, and the pool. */
    dispose(): void;
    /** The FDN worklet node, when loaded (read by tests). */
    get fdn(): AudioWorkletNode | null;
    /** The convolver layers currently held (read by tests). */
    get convolverLayers(): readonly {
        bus: ReverbBus;
        fade: GainNode;
    }[];
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
    private ensureFdn;
    /** Write a room into the FDN's parameters. Continuous — no quantization. */
    private writeFdnRoom;
    private ensureInput;
    /**
     * Fade the incoming room up and every room already sounding down. The
     * outgoing bus is released on a wall-clock timer, not the scheduler: a room
     * change can happen while playback is stopped (walking a world in silence),
     * and the scheduler only advances while the engine ticks.
     */
    private swapLayer;
    /** Re-level every world-room send for the new room's critical distance. */
    private relevelSends;
    /**
     * Release the convolver layers without touching the input. Used when the
     * FDN finishes loading and takes over a room the convolvers were already
     * sounding — the input keeps feeding, only what it feeds changes.
     */
    private teardownLayers;
    private teardownInput;
}
//# sourceMappingURL=WorldRoom.d.ts.map