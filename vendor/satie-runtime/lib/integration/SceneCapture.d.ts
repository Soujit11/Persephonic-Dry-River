import type { SatieEngine } from '../core/SatieEngine';
import { AUDIO_CLOCK_TOLERANCE_S, AUDIO_CLOCK_WARNING, type CaptureAction, type CaptureFrame, type PlaythroughTelemetry, type Point3 } from './contracts.js';
export { AUDIO_CLOCK_TOLERANCE_S, AUDIO_CLOCK_WARNING };
export interface CaptureBeginOptions {
    revision?: string;
    seed?: number;
    seedSource?: 'developer' | 'runtime';
    levelAnchorDb?: number;
    assets?: PlaythroughTelemetry['assets'];
    /**
     * Receives every closed segment, the last one included (end() returns it too). With it, a
     * channel that reaches its cap closes the segment and opens the next instead of dropping;
     * without it the capture drops and counts what it dropped in `truncation`.
     */
    onSegment?: (segment: PlaythroughTelemetry) => void;
    /** Called right after a new segment opens, so the owner can re-record the state the segment starts from. */
    onSegmentOpen?: () => void;
}
/**
 * An action's times as the game and the engine gave them, on their own clocks. The capture turns them
 * into segment-relative values when it stores the action, after any rollover the action itself caused,
 * so `t`, `occurredAt` and the audio times always share one segment's origin.
 */
export interface CaptureActionClocks {
    /** Host clock (the capture's `now`), seconds: when the contact happened. */
    occurredAt?: number;
    /** Audio clock (`AudioContext.currentTime`), seconds: when the sound was scheduled to start. */
    audioStartTime?: number;
    /** Audio clock, seconds: the estimated audible onset. */
    estimatedOnsetTime?: number;
}
/** Local, bounded capture. No network, account, upload, or automatic training contribution. */
export declare class SceneCapture {
    private readonly engine;
    private readonly now;
    private data;
    private started;
    private sessionStarted;
    private audioStarted;
    private audioClockWarned;
    private eventVersion;
    private warningBaseline;
    private lastFrame;
    private options;
    private segment;
    private session;
    /** Host moves since the last 10 Hz tick; the last position per host wins (A.1, 2026-11-08). */
    private readonly pendingMoves;
    private readonly recordedPositions;
    /** Signal changes since the last 10 Hz tick; the last value per signal wins. A signal eased every frame
     *  (storm intensity, tension) otherwise fills the action cap in about a minute (spec 011 dogfood, 2026-11-09). */
    private readonly pendingSignals;
    private readonly recordedSignals;
    private rolling;
    constructor(engine: SatieEngine, now?: () => number);
    begin(options?: CaptureBeginOptions): void;
    private open;
    get active(): boolean;
    /** The 0-based index of the open segment. */
    get currentSegment(): number;
    invalidateRevision(): void;
    get time(): number;
    /** Keep input and output clocks explicit; a physics tick count is not a wall clock. */
    fromHostTime(time: number): number;
    /** Seconds since this segment opened, on the audio clock. */
    get audioTime(): number;
    /**
     * Wall-clock seconds since the segment opened minus audio-clock seconds since it opened. About
     * zero while the clocks run together; it grows while the audio clock is frozen (a stalled
     * render thread, a suspension) and stays grown after a suspension.
     */
    get audioClockOffset(): number;
    /**
     * An audio-clock time as seconds since the segment opened, on the audio clock. Always returned,
     * also when the clocks disagree: the capture keeps every timing with the offset at that moment
     * (`audioClockOffsetS`) and the per-frame `audioT`, so a reader can realign or reject it later.
     */
    fromAudioTime(time: number): number;
    /**
     * Warn once per segment when the clocks are more than 0.1 s apart; nothing is dropped. Pass the offset
     * a caller already read, so the value that is stored is the one that was checked.
     */
    private checkAudioClock;
    /**
     * Record what the game did. `clocks` carries the action's times on their own clocks; they are made
     * segment-relative here, with the audio clock offset at this moment (`audioClockOffsetS`).
     */
    action(action: Omit<CaptureAction, 't'>, clocks?: CaptureActionClocks): void;
    /** A signal changed; recorded as one `signal` per name at the next 10 Hz tick, the last value winning, like host motion. */
    signalChanged(name: string, value: number): void;
    /** A host moved; recorded as one `host-position` per host at the next 10 Hz tick, not per call. */
    hostMoved(id: string, position: Point3): void;
    private push;
    private segmentTimes;
    private flushMoves;
    private flushSignals;
    /** Called each update; snapshot construction is deferred until the 10 Hz capture tick. */
    frame(read: () => Omit<CaptureFrame, 't'>): void;
    private drain;
    /**
     * Close the open segment and open the next one. Returns false (and changes nothing) when
     * no `onSegment` listener would receive the closed segment, or during a rollover.
     */
    rollover(): boolean;
    private close;
    end(): PlaythroughTelemetry;
}
//# sourceMappingURL=SceneCapture.d.ts.map