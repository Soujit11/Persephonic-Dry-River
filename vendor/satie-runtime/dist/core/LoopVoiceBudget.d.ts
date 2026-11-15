import type { TrackState } from './SatieEngine.js';
export interface LoopVoiceBudgetOptions {
    /** Maximum simultaneously started continuous sources. Events have a separate pool. */
    maxRealVoices?: number;
    /** Estimated received linear gain, expressed in dB; not calibrated hearing threshold. */
    silenceThresholdDb?: number;
    /** Incumbent preference and separate sleep/wake thresholds prevent boundary chatter. */
    hysteresisDb?: number;
}
export interface LoopVoiceReport {
    enabled: boolean;
    limit: number | null;
    real: number;
    virtual: number;
    voices: Array<{
        key: string;
        sourceId: string | null;
        virtual: boolean;
        receivedGainDb: number;
        phaseSeconds: number;
    }>;
}
export interface LoopVoiceBudgetHost {
    now(): number;
    /** Fresh current control, mixer, activity and propagation estimate, including virtual voices. */
    receivedGain(track: TrackState): number;
    playbackRate(track: TrackState): number;
    /** Stop the native source and disconnect its authored DSP. Preserve logical track state. */
    suspend(track: TrackState): void;
    /** Reconnect a cold graph and start this same buffer at the integrated phase. */
    resume(track: TrackState, buffer: AudioBuffer, offset: number, rate: number): void;
}
/**
 * Opt-in bounded native rendering for looping recordings. Virtual voices retain
 * identity, placement, control and lifecycle. Phase integrates the current rate
 * at engine ticks; AudioParam smoothing and effect histories are not simulated.
 * Authored DSP restarts cold. Shared room tails already emitted may decay normally.
 * This class never owns, delays or steals trigger/one-shot voices.
 */
export declare class LoopVoiceBudget {
    private readonly host;
    readonly enabled: boolean;
    private readonly limit;
    private readonly threshold;
    private readonly hysteresis;
    private readonly byTrack;
    private readonly entries;
    private order;
    constructor(options: LoopVoiceBudgetOptions | undefined, host: LoopVoiceBudgetHost);
    /** Register a logical start without allowing an unbounded native startup burst. */
    prepare(track: TrackState, buffer: AudioBuffer, startsAt: number, offset: number, rate: number): void;
    countBuffer(buffer: AudioBuffer, except: TrackState): number;
    /** No per-tick arrays/objects: scratch order and scores live with the voices. */
    update(): void;
    forget(track: TrackState): void;
    report(): LoopVoiceReport;
}
/**
 * A virtual voice retains nodes, not their automation history. Clear the whole
 * timeline, including past targets on nodes the browser may have stopped pulling.
 * Called only at transitions; shared room/master nodes never belong to a voice.
 */
export declare function clearLoopAutomation(track: TrackState, now: number): void;
//# sourceMappingURL=LoopVoiceBudget.d.ts.map