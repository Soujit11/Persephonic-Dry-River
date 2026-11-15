export var AudioEventType;
(function (AudioEventType) {
    AudioEventType["Play"] = "play";
    AudioEventType["Stop"] = "stop";
    AudioEventType["SetVolume"] = "setVolume";
    AudioEventType["SetPitch"] = "setPitch";
    AudioEventType["Callback"] = "callback";
})(AudioEventType || (AudioEventType = {}));
export class SatieScheduler {
    /** Sorted by scheduledSample ascending. Earliest events at the front. */
    timeline = [];
    clock;
    _totalScheduled = 0;
    _totalProcessed = 0;
    constructor(clock) {
        this.clock = clock;
    }
    get eventCount() {
        return this.timeline.length;
    }
    get totalScheduled() { return this._totalScheduled; }
    get totalProcessed() { return this._totalProcessed; }
    schedule(evt) {
        this._totalScheduled++;
        // Binary search insert to maintain sorted order
        const sample = evt.scheduledSample;
        const arr = this.timeline;
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (arr[mid].scheduledSample <= sample)
                lo = mid + 1;
            else
                hi = mid;
        }
        arr.splice(lo, 0, evt);
    }
    scheduleAt(evt, timeSeconds) {
        evt.scheduledSample = this.clock.secondsToSamples(timeSeconds);
        this.schedule(evt);
    }
    scheduleAfter(evt, offsetSeconds) {
        evt.scheduledSample = this.clock.currentSample + this.clock.secondsToSamples(offsetSeconds);
        this.schedule(evt);
    }
    /** Whether any pending event belongs to this track key. Used by the
     * incremental reload to tell "not started yet" from "already finished" —
     * rescheduling a finished oneshot would replay it. */
    hasTrackEvents(trackKey) {
        for (const evt of this.timeline)
            if (evt.trackKey === trackKey)
                return true;
        return false;
    }
    cancelTrackEvents(trackKey) {
        // Filter in-place to avoid allocation
        let write = 0;
        for (let read = 0; read < this.timeline.length; read++) {
            if (this.timeline[read].trackKey !== trackKey) {
                this.timeline[write++] = this.timeline[read];
            }
        }
        this.timeline.length = write;
    }
    cancelAll() {
        this.timeline.length = 0;
    }
    /**
     * The queued events due within `horizonSeconds`, earliest first — the
     * future half of a timeline view. Read-only; allocates (UI rate only).
     */
    upcoming(horizonSeconds, max = 256) {
        const out = [];
        const limit = this.clock.currentSample + this.clock.secondsToSamples(horizonSeconds);
        for (const evt of this.timeline) {
            if (evt.scheduledSample > limit || out.length >= max)
                break;
            out.push({ t: this.clock.samplesToSeconds(evt.scheduledSample), trackKey: evt.trackKey, label: evt.debugLabel ?? evt.type });
        }
        return out;
    }
    process() {
        const currentSample = this.clock.currentSample;
        const arr = this.timeline;
        // Since timeline is sorted, we consume from the front. Each event is
        // REMOVED before it runs: callbacks mutate the timeline (`stopTrack`
        // cancels its track's events and schedules the cleanup), and a deferred
        // splice by count used to throw away whatever a callback had just
        // scheduled at the front — the cleanup of every `duration`-ended voice.
        while (arr.length > 0 && arr[0].scheduledSample <= currentSample) {
            const evt = arr.shift();
            try {
                evt.onExecute?.();
                this._totalProcessed++;
            }
            catch (e) {
                console.error(`[Scheduler] Error executing event:`, e);
            }
        }
    }
    reset() {
        this.timeline.length = 0;
        this._totalScheduled = 0;
        this._totalProcessed = 0;
    }
}
//# sourceMappingURL=SatieScheduler.js.map