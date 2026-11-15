/**
 * Sample-accurate timing using Web Audio's AudioContext.currentTime.
 * Ported from SatieDSPClock.cs — replaces AudioSettings.dspTime.
 */
export class SatieDSPClock {
    ctx;
    startTime = 0;
    started = false;
    constructor(ctx) {
        this.ctx = ctx;
    }
    get currentTime() {
        return this.started ? this.ctx.currentTime - this.startTime : 0;
    }
    get currentSample() {
        return Math.floor(this.currentTime * this.sampleRate);
    }
    get absoluteTime() {
        return this.ctx.currentTime;
    }
    get sampleRate() {
        return this.ctx.sampleRate;
    }
    start() {
        this.startTime = this.ctx.currentTime;
        this.started = true;
    }
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
    startAt(offsetS) {
        this.startTime = this.ctx.currentTime - Math.max(0, offsetS);
        this.started = true;
    }
    reset() {
        this.startTime = this.ctx.currentTime;
    }
    secondsToSamples(seconds) {
        return Math.floor(seconds * this.sampleRate);
    }
    samplesToSeconds(samples) {
        return samples / this.sampleRate;
    }
    getScheduledTime(offsetSeconds) {
        return this.absoluteTime + offsetSeconds;
    }
}
//# sourceMappingURL=SatieDSPClock.js.map