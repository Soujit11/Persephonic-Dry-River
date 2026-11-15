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
/**
 * Headroom trim on every bus output. Reverberant sends from N voices sum
 * incoherently (~sqrt(N) growth) into one convolver, and unlike the dry path
 * they never attenuate with distance — so a dense scene can present the master
 * limiter with far more sustained energy than the old per-voice wet did. This
 * buys back enough headroom that the limiter shapes transients instead of
 * riding the bed. It is a mix constant, not a room property.
 */
export declare const REVERB_BUS_TRIM = 0.8;
export interface ReverbBus {
    /** Connect a voice's send gain here. */
    readonly input: GainNode;
    readonly convolver: ConvolverNode;
    readonly output: GainNode;
    readonly roomSize: number;
    readonly damping: number;
    /** Voices currently sending into this bus. */
    refCount: number;
}
/**
 * Owns the set of live reverb buses for one audio graph. The engine holds one
 * pool; the offline renderer builds its own so exports render the same rooms.
 */
export declare class ReverbBusPool {
    private readonly ctx;
    /** Where bus output lands — the master gain, NOT a panner. */
    private readonly destination;
    private buses;
    private tails;
    constructor(ctx: AudioContext, 
    /** Where bus output lands — the master gain, NOT a panner. */
    destination: AudioNode);
    /**
     * Get the bus for a room, creating it on first use. Every acquire must be
     * paired with a release, or the bus outlives the scene that needed it.
     */
    acquire(roomSize: number, damping: number): ReverbBus;
    /** Drop a voice's claim; the bus is torn down when the last one leaves. */
    release(bus: ReverbBus, preserveTail?: boolean): void;
    /** Tear down every bus — called when the engine stops or the graph resets. */
    dispose(): void;
    /** Live bus count — for tests and diagnostics. */
    get size(): number;
}
//# sourceMappingURL=ReverbBus.d.ts.map