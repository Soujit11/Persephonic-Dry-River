/**
 * GenQueue — the order in which missing sounds are made.
 *
 * Scene load used to fire every gen voice's request at once: fifty ElevenLabs
 * calls racing through a blind FIFO throttle, the audible floor of the scene
 * (its beds) waiting behind one-shot accents that would not fire for minutes.
 * This queue makes generation ordered and bounded instead: a small number of
 * requests in flight (default 3), everything else held in a priority order
 * derived from what each statement IS — never from what it is named.
 *
 * Priority bands (lower runs first; within a band, louder stated emission
 * first — a loud missing sound is more missed than a quiet one):
 *
 *   0  bed / field loops        — the enveloping floor; silence here is the
 *                                 scene not existing yet
 *   1  other loops              — placed continuous sources
 *   2  demanded events          — a one-shot/trigger whose fire just missed
 *                                 (it is audibly overdue)
 *   3  idle events              — prewarm for sounds whose first fire is
 *                                 still ahead; they never hold a slot while
 *                                 any loop is waiting
 *   4  pool fills               — extra `variants` takes beyond the one that
 *                                 starts the voice
 *   5  background upgrades      — a bespoke take replacing a community
 *                                 stand-in that is already playing
 *
 * The queue coalesces by key (one promise per clip, everyone awaits it),
 * lets urgency rise (`bump` re-ranks a queued job when a fire misses), and
 * cancels what is no longer wanted (`cancelQueued` on stop/reload/402 —
 * queued jobs reject with `GenCancelledError`; in-flight requests finish,
 * their result is still a valid cache entry). Queue operations happen at
 * request/completion time only — nothing here runs in the tick loop.
 */
/** Lower = sooner. Band * 1000 minus the stated emission level. */
export function genPriority(f) {
    let band;
    if (f.upgrade)
        band = 5;
    else if (f.poolFill)
        band = 4;
    else if (f.isLoop)
        band = f.enveloping ? 0 : 1;
    else
        band = f.demanded ? 2 : 3;
    const spl = Number.isFinite(f.splDb) ? Math.min(Math.max(f.splDb, 0), 140) : 0;
    return band * 1000 - spl;
}
/** A queued job was cancelled before it ran (stop, reload, or generation disabled). */
export class GenCancelledError extends Error {
    constructor() {
        super('generation cancelled');
        this.name = 'GenCancelledError';
    }
}
export function isGenCancelled(e) {
    return e instanceof GenCancelledError ||
        (e instanceof Error && e.name === 'GenCancelledError');
}
export class GenQueue {
    cap;
    /** Kept sorted: [0] runs next. Small (a scene's worth), sorted on insert. */
    queued = [];
    /** In-flight jobs by key (their shared promise, for coalescing). */
    running = new Map();
    /** Queued jobs by key (for coalescing + bump). */
    queuedByKey = new Map();
    seq = 0;
    /** Called after every transition (enqueue, start, settle, cancel). */
    onChange = null;
    constructor(cap = 3) {
        this.cap = Math.max(1, cap);
    }
    get queuedCount() { return this.queued.length; }
    get inFlightCount() { return this.running.size; }
    /** Everything not yet settled — the "N sounds on the way" number. */
    get depth() { return this.queued.length + this.running.size; }
    /**
     * Queue `run` under `key`. A key already queued or in flight returns the
     * existing promise — and a more urgent duplicate re-ranks the queued job
     * (coalescing IS the bump for repeat requests).
     */
    enqueue(key, priority, run) {
        const inFlight = this.running.get(key);
        if (inFlight)
            return inFlight;
        const waiting = this.queuedByKey.get(key);
        if (waiting) {
            if (priority < waiting.priority)
                this.rerank(waiting, priority);
            return waiting.promise;
        }
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        const job = { key, priority, seq: this.seq++, run, resolve, reject, promise };
        this.insert(job);
        this.queuedByKey.set(key, job);
        this.pump();
        this.notifyChange();
        return promise;
    }
    /** Raise a queued job's urgency (no-op for in-flight or unknown keys). */
    bump(key, priority) {
        const job = this.queuedByKey.get(key);
        if (!job || priority >= job.priority)
            return false;
        this.rerank(job, priority);
        return true;
    }
    /**
     * Reject every QUEUED job with `GenCancelledError` (in-flight requests are
     * left to finish — their result is still a valid cache entry). Returns how
     * many were cancelled.
     */
    cancelQueued() {
        const cancelled = this.queued.length;
        if (!cancelled)
            return 0;
        const jobs = this.queued;
        this.queued = [];
        this.queuedByKey.clear();
        for (const job of jobs)
            job.reject(new GenCancelledError());
        this.notifyChange();
        return cancelled;
    }
    rerank(job, priority) {
        const i = this.queued.indexOf(job);
        if (i >= 0)
            this.queued.splice(i, 1);
        job.priority = priority;
        this.insert(job);
    }
    /** Binary-insert keeping (priority, seq) order — FIFO within equal priority. */
    insert(job) {
        let lo = 0, hi = this.queued.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const q = this.queued[mid];
            if (q.priority < job.priority || (q.priority === job.priority && q.seq < job.seq))
                lo = mid + 1;
            else
                hi = mid;
        }
        this.queued.splice(lo, 0, job);
    }
    pump() {
        while (this.running.size < this.cap && this.queued.length > 0) {
            const job = this.queued.shift();
            this.queuedByKey.delete(job.key);
            const p = job.run().then((v) => { this.settle(job.key); job.resolve(v); return v; }, (e) => { this.settle(job.key); job.reject(e); throw e; });
            // The map holds the JOB's promise (already handled), so a coalescing
            // caller never sees an unhandled rejection from the raw run() chain.
            p.catch(() => { });
            this.running.set(job.key, job.promise);
            this.notifyChange();
        }
    }
    settle(key) {
        this.running.delete(key);
        // Pump on a fresh macrotask: a caller reacting to this settlement (a 402
        // disabling generation and cancelling the queue) sits several microtasks
        // down its promise chain, and must get to act before the next job is
        // committed to a slot. One timer tick is nothing next to a generation.
        setTimeout(() => this.pump(), 0);
        this.notifyChange();
    }
    notifyChange() {
        if (this.onChange)
            this.onChange(this.queued.length, this.running.size);
    }
}
//# sourceMappingURL=GenQueue.js.map