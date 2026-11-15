/**
 * Sample-accurate timing using Web Audio's AudioContext.currentTime.
 * Ported from SatieDSPClock.cs — replaces AudioSettings.dspTime.
 */
export declare class SatieDSPClock {
    private ctx;
    private startTime;
    private started;
    constructor(ctx: AudioContext);
    get currentTime(): number;
    get currentSample(): number;
    get absoluteTime(): number;
    get sampleRate(): number;
    start(): void;
    /**
     * Start the scene clock already `offsetS` seconds in, so `currentTime`
     * immediately reads `offsetS`.
     *
     * Backdating the origin is the whole trick behind replaying from a point:
     * the scheduler compares event times against `currentSample`, so a clock that
     * starts at 30 s makes everything authored before 30 s already past. The
     * caller is responsible for not SCHEDULING those (`SatieEngine.scheduleAll`
     * skips a oneshot that already fired and clamps everything else to the
     * offset) -- the scheduler consumes anything at or before now, so a past
     * event left in the queue would fire the whole first half of the scene at
     * once.
     */
    startAt(offsetS: number): void;
    reset(): void;
    secondsToSamples(seconds: number): number;
    samplesToSeconds(samples: number): number;
    getScheduledTime(offsetSeconds: number): number;
}
//# sourceMappingURL=SatieDSPClock.d.ts.map