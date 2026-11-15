/**
 * Scene event log — what happened, when, where.
 *
 * The scheduler is a timeline with no memory: once an event has run it is
 * gone, and nothing records that a voice fired, which take it played, or
 * where it was. The log keeps the last `capacity` scene events in a ring so
 * a timeline view (ui/components/TimelinePanel) can draw lanes of what
 * sounded, and evaluation code can check causality ("every horn had a car
 * within 3 m"). Nothing here knows what an event means — it stores a kind, a
 * label, a position and the ids that let a reader join it back to the
 * script (statement index, track key, entity / instance).
 *
 * Allocation: one object per event; the ring reuses slots. Readers call
 * `snapshot()` (allocates) at UI rate, never per audio tick.
 */
export class EventLog {
    capacity;
    buf;
    head = 0;
    count = 0;
    /** Bumped on every record — cheap change detection for a polling reader. */
    _version = 0;
    constructor(capacity = 512) {
        this.capacity = capacity;
        this.buf = new Array(capacity);
    }
    get version() { return this._version; }
    get size() { return this.count; }
    record(e) {
        this.buf[this.head] = e;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity)
            this.count++;
        this._version++;
    }
    /** Oldest → newest copy. */
    snapshot() {
        const out = new Array(this.count);
        const start = (this.head - this.count + this.capacity) % this.capacity;
        for (let i = 0; i < this.count; i++)
            out[i] = this.buf[(start + i) % this.capacity];
        return out;
    }
    /**
     * Forget everything at or after scene time `t`.
     *
     * Replaying from a point rewinds the scene clock, and every entry here is
     * stamped in scene time -- so without this the whole recorded past sits at a
     * `t` GREATER than the new now, and a timeline view draws your history to the
     * right of the now line, as the future. Those events also genuinely have not
     * happened in the replayed timeline, so dropping them is the honest answer
     * rather than a drawing fix.
     *
     * Entries before `t` are kept: that stretch of the scene did happen and is
     * still the past.
     */
    dropFrom(t) {
        const kept = this.snapshot().filter(e => e.t < t);
        this.clear();
        for (const e of kept)
            this.record(e);
    }
    clear() {
        this.head = 0;
        this.count = 0;
        this._version++;
    }
}
//# sourceMappingURL=EventLog.js.map