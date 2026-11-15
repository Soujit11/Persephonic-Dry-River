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
/** Facts the priority is computed from — representation only, no names. */
export interface GenJobFacts {
    /** `bed` or `field` — an enveloping/extended layer (the scene's floor). */
    enveloping: boolean;
    /** Continuous (`loop`) vs event (`oneshot`/`trigger`). */
    isLoop: boolean;
    /** Stated emission at 1 m (dB SPL); the level model's default when unstated. */
    splDb: number;
    /** An extra pooled take — the voice already has (or will get) a starter. */
    poolFill: boolean;
    /** An event whose fire just found no buffer — audibly overdue. */
    demanded: boolean;
    /** A quality upgrade behind a stand-in that is already sounding. */
    upgrade: boolean;
}
/** Lower = sooner. Band * 1000 minus the stated emission level. */
export declare function genPriority(f: GenJobFacts): number;
/** A queued job was cancelled before it ran (stop, reload, or generation disabled). */
export declare class GenCancelledError extends Error {
    constructor();
}
export declare function isGenCancelled(e: unknown): boolean;
export declare class GenQueue<T> {
    private readonly cap;
    /** Kept sorted: [0] runs next. Small (a scene's worth), sorted on insert. */
    private queued;
    /** In-flight jobs by key (their shared promise, for coalescing). */
    private running;
    /** Queued jobs by key (for coalescing + bump). */
    private queuedByKey;
    private seq;
    /** Called after every transition (enqueue, start, settle, cancel). */
    onChange: ((queued: number, inFlight: number) => void) | null;
    constructor(cap?: number);
    get queuedCount(): number;
    get inFlightCount(): number;
    /** Everything not yet settled — the "N sounds on the way" number. */
    get depth(): number;
    /**
     * Queue `run` under `key`. A key already queued or in flight returns the
     * existing promise — and a more urgent duplicate re-ranks the queued job
     * (coalescing IS the bump for repeat requests).
     */
    enqueue(key: string, priority: number, run: () => Promise<T>): Promise<T>;
    /** Raise a queued job's urgency (no-op for in-flight or unknown keys). */
    bump(key: string, priority: number): boolean;
    /**
     * Reject every QUEUED job with `GenCancelledError` (in-flight requests are
     * left to finish — their result is still a valid cache entry). Returns how
     * many were cancelled.
     */
    cancelQueued(): number;
    private rerank;
    /** Binary-insert keeping (priority, seq) order — FIFO within equal priority. */
    private insert;
    private pump;
    private settle;
    private notifyChange;
}
//# sourceMappingURL=GenQueue.d.ts.map