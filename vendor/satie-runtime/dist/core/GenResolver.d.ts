/**
 * How a `gen` statement's audio gets made: the generation resolver.
 *
 * Owns the request policy and its state — the priority queue (`GenQueue`),
 * the in-flight map that coalesces repeat requests for one clip, the
 * permanent-failure latch (401 / 402: stop spending until the next play or
 * load), the library-first / stand-in / background-upgrade rules and the
 * two hooks the app wires (`onGenerateAudio`, `onSearchCommunity`). It
 * decides WHAT to request, in what order, and what a failure means.
 *
 * Collaborators (`GenResolverHost`) — what stays the engine's business:
 *   reads   `rng` (sampling gen options), `hasBuffer` / `takeLanded` (the
 *           buffer registry and pooled takes), `demandWithinHorizon` (lazy
 *           generation's activity/follow evaluation over the world state)
 *   actions `decode` (the AudioContext), `registerBuffer` (the one ingress
 *           into `audioBuffers`, loudness-normalized there), `swapBufferSmooth`
 *           (fade a live loop onto an upgraded take), `retriggerIfLive`
 *           (start a voice whose buffer just landed, if it still exists and
 *           playback is on), `warn` (runtime warnings)
 * The resolver never touches tracks, the scheduler or the graph; the dormant
 * bookkeeping (`wakeDormant`, the demand tick) stays in the engine because it
 * is evaluated over tracks, world and signals.
 */
import type { Statement } from './Statement.js';
import { type GenOptions } from './GenRequests.js';
/** One request handed to the `onGenerateAudio` hook. */
export interface GenerateAudioRequest {
    prompt: string;
    clipName: string;
    isLoop: boolean;
    options: GenOptions;
}
export type GenerateAudioHook = (req: GenerateAudioRequest) => Promise<AudioBuffer | ArrayBuffer | null>;
export interface CommunitySoundContract {
    loop: boolean;
    sourceRole?: 'ambience' | 'source';
    everyS?: [number, number];
}
export declare function communitySoundContract(stmt: Statement): CommunitySoundContract;
export type SearchCommunityHook = (prompt: string, rank?: number, contract?: CommunitySoundContract) => Promise<ArrayBuffer | null>;
/**
 * Generation scheduling (`GenQueue`): at most this many generation requests
 * in flight; the rest wait in priority order (beds/fields, then placed
 * loops, then overdue events, then idle events, pool fills, upgrades) so the
 * audible floor of a fresh scene lands first instead of racing fifty
 * requests at once.
 */
export declare const GEN_CONCURRENCY = 3;
/**
 * Hard cap on the community-sample lookup. The search chains Supabase
 * queries + a server embedding call; when the library has no match the
 * voice would otherwise wait out the WHOLE search before generation even
 * starts. Past this deadline we generate immediately.
 */
export declare const COMMUNITY_SEARCH_TIMEOUT_MS = 15000;
/** The generator's own errors for states no retry can fix: 401 not signed in, 402 out of credits. */
export declare function isPermanentGenerationFailure(message: string): boolean;
export interface GenResolverHost {
    /** The engine's RNG (replaceable by tests), for sampling a statement's gen ranges. */
    rng: () => number;
    /** Whether a clip path has a decoded buffer. */
    hasBuffer(clipPath: string): boolean;
    /** Whether the k-th pooled take of a statement has landed (k = 0 is the base clip). */
    takeLanded(stmt: Statement, k: number): boolean;
    /** Lazy generation: the statement's demand now or within the horizon (0 = nobody would hear it). */
    demandWithinHorizon(stmt: Statement): number;
    decode(data: ArrayBuffer): Promise<AudioBuffer>;
    registerBuffer(clipPath: string, buffer: AudioBuffer): void;
    swapBufferSmooth(clipPath: string, buffer: AudioBuffer): void;
    /** Start the voice `key` on `stmt` if it still exists and playback is on. */
    retriggerIfLive(key: string, stmt: Statement): void;
    warn(message: string): void;
}
export type GenPriorityOpts = {
    poolFill?: boolean;
    demanded?: boolean;
    upgrade?: boolean;
};
export declare class GenResolver {
    private readonly host;
    /** Audio generator for `gen` statements. The engine talks to no external service; the app wires this (src/lib/AudioGen). Null: gen voices stay pending with one warning. */
    onGenerateAudio: GenerateAudioHook | null;
    /**
     * Community search by gen prompt. `rank` asks for the k-th best match
     * (0 = best): a pooled take (`variants`) may be satisfied by a DIFFERENT
     * library sample; a host that ignores it returns its best match and the
     * pool generates the rest.
     */
    onSearchCommunity: SearchCommunityHook | null;
    /** When true, try community samples before calling the generator for gen statements. */
    preferCommunitySamples: boolean;
    /**
     * Lazy, predictive generation (default off — embedders see no change).
     * When on, a gen voice whose DEMAND is 0 — nobody would hear it in the
     * current state, nor in the state predicted a horizon ahead — is created
     * dormant and requested only when the engine's demand tick wakes it.
     */
    lazyGeneration: boolean;
    /**
     * When a dormant voice is woken by the demand tick, start it from a
     * library match and upgrade to the generated take in the background, even
     * for users who keep `preferCommunitySamples` off: a predicted sound must
     * be heard within a second of the state needing it. Needs `onSearchCommunity`.
     */
    standInForPredicted: boolean;
    /**
     * When true (and a community match was used for a gen voice), still
     * generate the bespoke audio in the background and swap it in when it
     * arrives — instant start from the library, a unique take moments later.
     */
    upgradeGeneratedAudio: boolean;
    /** Every request flows through here: `GEN_CONCURRENCY` in flight, the rest ranked by `genPriority` from what the statement IS. */
    private readonly queue;
    /** In-flight requests keyed by clipPath — one promise per clip, repeat requests await it. */
    private readonly inFlight;
    /** Set on a permanent failure (401 / 402) — no further requests until `reset()`. */
    private disabled;
    /** One-shot warning latch for a missing `onGenerateAudio`. */
    private noGeneratorWarned;
    constructor(host: GenResolverHost);
    /** Sounds requested but not yet landed (queued + in flight) — for "N on the way" UI. */
    get queueDepth(): number;
    /** Observe queue transitions (fires at request/settle time, never per frame). */
    set onQueueChange(cb: ((queued: number, inFlight: number) => void) | null);
    /** True while generation is latched off by a permanent failure. */
    get isDisabled(): boolean;
    isInFlight(clipPath: string): boolean;
    /** The pending result for a clip, if a request is in flight. */
    pending(clipPath: string): Promise<AudioBuffer | null> | undefined;
    /**
     * Lift the failure latch and the missing-generator warning. play() and
     * loadScript() call this: a latch tripped by one transient 401/402 (an
     * outage, a stale token blip) must not kill generation for the session; if
     * the cause persists the first attempt re-latches, bounded by voice count.
     */
    reset(): void;
    /** Drop every request still WAITING (they reject as cancelled, quietly); in-flight ones finish and land. */
    cancelQueued(): void;
    /** Library before generator? Load-time requests follow `preferCommunitySamples`; a predicted (demand-tick) request also on `standInForPredicted`. */
    standInFirst(predicted: boolean): boolean;
    /** Priority for generating this statement's audio, from what it IS. */
    priorityFor(stmt: Statement, opts?: GenPriorityOpts): number;
    /** A fire found no buffer: re-rank an already-queued request for the clip as overdue. */
    bumpDemanded(clipPath: string, stmt: Statement): void;
    /** True when generation can proceed right now; warns once when it can't. */
    available(): boolean;
    /** Sample gen options from statement ranges (`GenRequests.genOptionsFor`, with the engine's rng). */
    optionsFor(stmt: Statement, variant?: number): GenOptions;
    /**
     * Queue the generation hook and normalize its result to an AudioBuffer.
     * The request waits its turn under `priority`; a repeat request for the
     * same clip coalesces onto (and may re-rank) the first.
     */
    private run;
    /** null is a completed miss; a failed search must not authorize synthesis. */
    searchCommunityBounded(prompt: string, rank?: number, stmt?: Statement): Promise<ArrayBuffer | null>;
    /**
     * Record a failed generation. A permanent failure (not signed in, out of
     * credits) latches generation off and drains the queue; the warning text is
     * shared across every path so the deduped warnings strip shows one line.
     */
    noteFailure(e: unknown, what: string): void;
    /** Track a request under its clip path until it settles. */
    private track;
    /** Decode an exact supplied asset, deduplicating loads without any generation fallback. */
    resolveSupplied(clipPath: string, load: () => Promise<ArrayBuffer | null>, current: () => boolean): Promise<AudioBuffer | null>;
    /** Generate a clip into the registry without touching any voice (prewarm, pool fill). */
    fallbackGenerate(prompt: string, clipPath: string, stmt: Statement, variant?: number): void;
    /**
     * A fire found no buffer: generate the clip (overdue priority) and start
     * the voice when it lands. A request already in flight is re-ranked and
     * awaited instead of duplicated.
     */
    generateAndRetrigger(key: string, stmt: Statement, clipPath: string, variant?: number): Promise<void>;
    /** Library first: a match starts the voice at once (and may upgrade in the background); no match falls back to the generator. */
    communityThenGenerate(key: string, stmt: Statement, clipPath: string, variant?: number, predicted?: boolean): Promise<void>;
    /**
     * After a community sample started a gen voice instantly, generate the
     * bespoke take in the background and swap it in when it lands. No-op
     * unless `upgradeGeneratedAudio` is on and generation is allowed. `force`
     * (a predicted voice's library stand-in) upgrades regardless of the flag:
     * the stand-in is a placeholder for the sound the state asked for, not the
     * sound itself. Count-multiplied variants ("4 * oneshot gen shot") always
     * upgrade when they can: the shared community sample would leave every
     * copy identical.
     */
    upgradeInBackground(prompt: string, clipPath: string, stmt: Statement, variant?: number, force?: boolean): void;
    /**
     * Request every take of a pool that is neither landed nor in flight. The
     * first missing take restarts the voice when it lands (the usual
     * generate-then-retrigger path); the others only fill the pool, so a late
     * take never re-fires a sound that is already playing.
     */
    requestVariantTakes(key: string, stmt: Statement, predicted?: boolean): void;
    /** Resolve one pooled take into the registry without touching the voice: library k-th match first, else a unique generated take. */
    private fillVariantTake;
    /**
     * Eagerly request every gen clip a script wants (on play(); never blocks
     * playback). Count-multiplied voices are expanded by the parser into
     * variant clips that each generate their OWN audio — genuinely different
     * takes per copy. Community samples are the exception: a match is searched
     * and decoded ONCE per prompt (and pool rank) and shared by every copy;
     * per-voice volume/pitch/move randomization differentiates the instances.
     * Jobs are dispatched in priority order so the queue's first slot-grabs
     * are also the sounds the scene misses most.
     */
    preGenerateAll(statements: readonly Statement[]): void;
    /**
     * Generate + cache a template trigger take. The fire that requested it
     * stays silent; every later fire on the same text plays from cache. Bank
     * takes share one prompt but must each be a DISTINCT recording —
     * `uniqueTake` forbids the generator's prompt-level cache from aliasing
     * them; the bank slot is the take's rank in the server pool. Takes are
     * events: tight clips unless the gen block authored a duration.
     */
    generateTriggerTake(stmt: Statement, prompt: string, clipPath: string, bankIndex?: number): void;
}
//# sourceMappingURL=GenResolver.d.ts.map