import { DEFAULT_SPL_DB } from '../spatial/LevelModel.js';
import { GenQueue, genPriority, isGenCancelled, GenCancelledError } from '../audio/GenQueue.js';
import { genOptionsFor, takeClipPath, TRIGGER_TAKE_DURATION_S } from './GenRequests.js';
export function communitySoundContract(stmt) {
    return { loop: stmt.kind === 'loop', sourceRole: stmt.sourceRole ?? undefined,
        everyS: stmt.every.isNull ? undefined : [stmt.every.min, stmt.every.max] };
}
/**
 * Generation scheduling (`GenQueue`): at most this many generation requests
 * in flight; the rest wait in priority order (beds/fields, then placed
 * loops, then overdue events, then idle events, pool fills, upgrades) so the
 * audible floor of a fresh scene lands first instead of racing fifty
 * requests at once.
 */
export const GEN_CONCURRENCY = 3;
/**
 * Hard cap on the community-sample lookup. The search chains Supabase
 * queries + a server embedding call; when the library has no match the
 * voice would otherwise wait out the WHOLE search before generation even
 * starts. Past this deadline we generate immediately.
 */
export const COMMUNITY_SEARCH_TIMEOUT_MS = 15000;
/** The generator's own errors for states no retry can fix: 401 not signed in, 402 out of credits. */
export function isPermanentGenerationFailure(message) {
    return /\b40[12]\b|credits|Sign in/.test(message);
}
export class GenResolver {
    host;
    /** Audio generator for `gen` statements. The engine talks to no external service; the app wires this (src/lib/AudioGen). Null: gen voices stay pending with one warning. */
    onGenerateAudio = null;
    /**
     * Community search by gen prompt. `rank` asks for the k-th best match
     * (0 = best): a pooled take (`variants`) may be satisfied by a DIFFERENT
     * library sample; a host that ignores it returns its best match and the
     * pool generates the rest.
     */
    onSearchCommunity = null;
    /** When true, try community samples before calling the generator for gen statements. */
    preferCommunitySamples = false;
    /**
     * Lazy, predictive generation (default off — embedders see no change).
     * When on, a gen voice whose DEMAND is 0 — nobody would hear it in the
     * current state, nor in the state predicted a horizon ahead — is created
     * dormant and requested only when the engine's demand tick wakes it.
     */
    lazyGeneration = false;
    /**
     * When a dormant voice is woken by the demand tick, start it from a
     * library match and upgrade to the generated take in the background, even
     * for users who keep `preferCommunitySamples` off: a predicted sound must
     * be heard within a second of the state needing it. Needs `onSearchCommunity`.
     */
    standInForPredicted = true;
    /**
     * When true (and a community match was used for a gen voice), still
     * generate the bespoke audio in the background and swap it in when it
     * arrives — instant start from the library, a unique take moments later.
     */
    upgradeGeneratedAudio = false;
    /** Every request flows through here: `GEN_CONCURRENCY` in flight, the rest ranked by `genPriority` from what the statement IS. */
    queue = new GenQueue(GEN_CONCURRENCY);
    /** In-flight requests keyed by clipPath — one promise per clip, repeat requests await it. */
    inFlight = new Map();
    /** Set on a permanent failure (401 / 402) — no further requests until `reset()`. */
    disabled = false;
    /** One-shot warning latch for a missing `onGenerateAudio`. */
    noGeneratorWarned = false;
    constructor(host) {
        this.host = host;
    }
    // ── Queue observation ──
    /** Sounds requested but not yet landed (queued + in flight) — for "N on the way" UI. */
    get queueDepth() { return this.queue.depth; }
    /** Observe queue transitions (fires at request/settle time, never per frame). */
    set onQueueChange(cb) { this.queue.onChange = cb; }
    /** True while generation is latched off by a permanent failure. */
    get isDisabled() { return this.disabled; }
    isInFlight(clipPath) { return this.inFlight.has(clipPath); }
    /** The pending result for a clip, if a request is in flight. */
    pending(clipPath) { return this.inFlight.get(clipPath); }
    // ── Lifecycle ──
    /**
     * Lift the failure latch and the missing-generator warning. play() and
     * loadScript() call this: a latch tripped by one transient 401/402 (an
     * outage, a stale token blip) must not kill generation for the session; if
     * the cause persists the first attempt re-latches, bounded by voice count.
     */
    reset() {
        this.disabled = false;
        this.noGeneratorWarned = false;
    }
    /** Drop every request still WAITING (they reject as cancelled, quietly); in-flight ones finish and land. */
    cancelQueued() { this.queue.cancelQueued(); }
    // ── Policy ──
    /** Library before generator? Load-time requests follow `preferCommunitySamples`; a predicted (demand-tick) request also on `standInForPredicted`. */
    standInFirst(predicted) {
        return !!this.onSearchCommunity && (this.preferCommunitySamples || (predicted && this.standInForPredicted));
    }
    /** Priority for generating this statement's audio, from what it IS. */
    priorityFor(stmt, opts = {}) {
        const splDb = stmt.spl.isNull ? DEFAULT_SPL_DB : (stmt.spl.min + stmt.spl.max) / 2;
        return genPriority({
            enveloping: stmt.bed || stmt.field,
            isLoop: stmt.kind === 'loop',
            splDb,
            poolFill: !!opts.poolFill,
            demanded: !!opts.demanded,
            upgrade: !!opts.upgrade,
        });
    }
    /** A fire found no buffer: re-rank an already-queued request for the clip as overdue. */
    bumpDemanded(clipPath, stmt) {
        this.queue.bump(clipPath, this.priorityFor(stmt, { demanded: true }));
    }
    /** True when generation can proceed right now; warns once when it can't. */
    available() {
        if (this.disabled)
            return false;
        if (!this.onGenerateAudio) {
            if (!this.noGeneratorWarned) {
                this.noGeneratorWarned = true;
                // the usual case is a scene whose takes are made ahead (satie_realize, the mixer): say what to do
                this.host.warn('A sound is missing one of its takes, and this player does not make takes while it plays, so that take stays silent. Make it ahead: "make the missing" on the sound in the mixer, or satie_realize (an engine can also make them live with onGenerateAudio).');
            }
            return false;
        }
        return true;
    }
    /** Sample gen options from statement ranges (`GenRequests.genOptionsFor`, with the engine's rng). */
    optionsFor(stmt, variant = 0) {
        return genOptionsFor(stmt, variant, this.host.rng);
    }
    /**
     * Queue the generation hook and normalize its result to an AudioBuffer.
     * The request waits its turn under `priority`; a repeat request for the
     * same clip coalesces onto (and may re-rank) the first.
     */
    run(prompt, clipName, isLoop, options, priority) {
        if (!this.onGenerateAudio)
            return Promise.reject(new Error('Audio generation is not configured'));
        return this.queue.enqueue(clipName, priority, async () => {
            // Re-check at dequeue: a 402 while this waited means don't spend more.
            if (this.disabled)
                throw new GenCancelledError();
            if (!this.onGenerateAudio)
                throw new Error('Audio generation is not configured');
            const result = await this.onGenerateAudio({ prompt, clipName, isLoop, options });
            if (result === null)
                throw new Error(`Audio generator returned nothing for "${prompt}"`);
            if (result instanceof AudioBuffer)
                return result;
            return this.host.decode(result.slice(0));
        });
    }
    /** null is a completed miss; a failed search must not authorize synthesis. */
    searchCommunityBounded(prompt, rank = 0, stmt) {
        if (!this.onSearchCommunity)
            return Promise.resolve(null);
        let timer;
        return Promise.race([
            this.onSearchCommunity(prompt, rank, stmt ? communitySoundContract(stmt) : undefined),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Library search timed out. Retry to search again.')), COMMUNITY_SEARCH_TIMEOUT_MS);
            }),
        ]).finally(() => clearTimeout(timer));
    }
    /**
     * Record a failed generation. A permanent failure (not signed in, out of
     * credits) latches generation off and drains the queue; the warning text is
     * shared across every path so the deduped warnings strip shows one line.
     */
    noteFailure(e, what) {
        const message = e instanceof Error ? e.message : String(e);
        if (isPermanentGenerationFailure(message)) {
            this.disabled = true;
            this.queue.cancelQueued();
            this.host.warn(`Audio generation failed: ${message}`);
            return;
        }
        this.host.warn(`${what}: ${message}`);
    }
    /** Track a request under its clip path until it settles. */
    track(clipPath, promise) {
        const tracked = promise.finally(() => { this.inFlight.delete(clipPath); });
        this.inFlight.set(clipPath, tracked);
        return tracked;
    }
    // ── Requests ──
    /** Decode an exact supplied asset, deduplicating loads without any generation fallback. */
    resolveSupplied(clipPath, load, current) {
        const pending = this.inFlight.get(clipPath);
        if (pending)
            return pending;
        return this.track(clipPath, Promise.resolve().then(load).then(async (bytes) => {
            if (!current())
                return null;
            if (!bytes) {
                this.host.warn(`Supplied recording is missing: ${clipPath}`);
                return null;
            }
            const buffer = await this.host.decode(bytes.slice(0));
            if (!current())
                return null;
            this.host.registerBuffer(clipPath, buffer);
            return buffer;
        }).catch(() => { if (current())
            this.host.warn(`Could not load supplied recording: ${clipPath}`); return null; }));
    }
    /** Generate a clip into the registry without touching any voice (prewarm, pool fill). */
    fallbackGenerate(prompt, clipPath, stmt, variant = 0) {
        if (!this.available())
            return;
        if (this.inFlight.has(clipPath) || this.host.hasBuffer(clipPath))
            return;
        const opts = this.optionsFor(stmt, variant);
        // Prewarm ranks by what the statement is; extra pooled takes (variant > 0)
        // wait behind every voice's first take.
        const priority = this.priorityFor(stmt, { poolFill: variant > 0 });
        this.track(clipPath, this.run(prompt, clipPath, stmt.kind === 'loop', opts, priority)
            .then((audioBuffer) => {
            this.host.registerBuffer(clipPath, audioBuffer);
            return audioBuffer;
        })
            .catch((e) => {
            if (isGenCancelled(e))
                return null; // stop/reload/402 drained the queue — not a failure
            this.noteFailure(e, 'Audio generation failed');
            return null;
        }));
    }
    /**
     * A fire found no buffer: generate the clip (overdue priority) and start
     * the voice when it lands. A request already in flight is re-ranked and
     * awaited instead of duplicated.
     */
    async generateAndRetrigger(key, stmt, clipPath, variant = 0) {
        if (!this.available())
            return;
        const priority = this.priorityFor(stmt, { demanded: true });
        const existing = this.inFlight.get(clipPath);
        if (existing) {
            this.queue.bump(clipPath, priority);
            const buf = await existing;
            if (buf)
                this.host.retriggerIfLive(key, stmt);
            return;
        }
        const promise = (async () => {
            try {
                // Variant clips (_2, _3 from a count multiplier) each generate their
                // own audio — unique takes per copy is the point of "N * loop gen".
                const audioBuffer = await this.run(stmt.genPrompt, clipPath, stmt.kind === 'loop', this.optionsFor(stmt, variant), priority);
                this.host.registerBuffer(clipPath, audioBuffer);
                return audioBuffer;
            }
            catch (e) {
                if (isGenCancelled(e))
                    return null; // stop/reload/402 drained the queue — not a failure
                this.noteFailure(e, `Audio generation failed for "${stmt.genPrompt}"`);
                return null;
            }
        })();
        const buf = await this.track(clipPath, promise);
        if (buf)
            this.host.retriggerIfLive(key, stmt);
    }
    /** Library first: a match starts the voice at once (and may upgrade in the background); no match falls back to the generator. */
    async communityThenGenerate(key, stmt, clipPath, variant = 0, predicted = false) {
        if (stmt.synth) {
            void this.generateAndRetrigger(key, stmt, clipPath, variant);
            return;
        }
        try {
            const data = await this.searchCommunityBounded(stmt.genPrompt, variant, stmt);
            if (data) {
                const audioBuffer = await this.host.decode(data.slice(0));
                this.host.registerBuffer(clipPath, audioBuffer);
                this.host.retriggerIfLive(key, stmt);
                this.upgradeInBackground(stmt.genPrompt, clipPath, stmt, variant);
                return;
            }
        }
        catch (error) {
            // The library could not be asked (search job failed, embedding or RPC down). Say so, but a
            // voice that was just authored must not stay silent: generate its take instead.
            this.noteFailure(error, 'Library search unavailable; generating this sound instead');
        }
        void this.generateAndRetrigger(key, stmt, clipPath, variant);
    }
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
    upgradeInBackground(prompt, clipPath, stmt, variant = 0, force = false) {
        if (!force && !this.upgradeGeneratedAudio && !stmt.isCountVariant)
            return;
        if (!this.available()) {
            // Never silently: a count-variant stuck on the shared community sample
            // is "5 * gen makes 5 identical clones" from the user's side. The latch
            // resets on play/loadScript, so the next run retries.
            if (stmt.isCountVariant) {
                this.host.warn(`"${prompt}" copies are sharing one library sample: generation is unavailable, so unique takes could not be made.`);
            }
            return;
        }
        if (this.inFlight.has(clipPath))
            return;
        // A stand-in is already sounding — a quality upgrade waits behind every
        // request for a sound that is still silent.
        const priority = this.priorityFor(stmt, { upgrade: true });
        this.track(clipPath, this.run(prompt, clipPath, stmt.kind === 'loop', this.optionsFor(stmt, variant), priority)
            .then((audioBuffer) => {
            this.host.swapBufferSmooth(clipPath, audioBuffer);
            return audioBuffer;
        })
            .catch((e) => {
            if (isGenCancelled(e))
                return null; // stop/reload/402 drained the queue — not a failure
            // Best-effort (the community sample keeps playing) but NOT silent:
            // "4 * gen" voices stuck on one shared sample would look like a bug.
            this.noteFailure(e, 'Audio upgrade failed');
            return null;
        }));
    }
    /**
     * Request every take of a pool that is neither landed nor in flight. The
     * first missing take restarts the voice when it lands (the usual
     * generate-then-retrigger path); the others only fill the pool, so a late
     * take never re-fires a sound that is already playing.
     */
    requestVariantTakes(key, stmt, predicted = false) {
        if (stmt.recordings?.takes)
            return;
        let starter = false;
        let inFlight;
        for (let k = 0; k < stmt.variants; k++) {
            const cp = takeClipPath(stmt, k);
            if (this.host.takeLanded(stmt, k))
                continue;
            const pending = this.inFlight.get(cp);
            if (pending) {
                // The take that will START the voice is overdue — re-rank it if queued.
                if (!starter && !inFlight)
                    this.bumpDemanded(cp, stmt);
                inFlight ??= pending;
                continue;
            }
            if (!starter) {
                starter = true;
                if (this.standInFirst(predicted))
                    void this.communityThenGenerate(key, stmt, cp, k, predicted);
                else
                    void this.generateAndRetrigger(key, stmt, cp, k);
            }
            else {
                this.fillVariantTake(stmt, cp, k, predicted);
            }
        }
        // Every missing take was already in flight (the prewarm got there first):
        // the voice starts when the first of them lands, as for a single-take clip.
        if (!starter && inFlight) {
            inFlight.then(buf => { if (buf)
                this.host.retriggerIfLive(key, stmt); });
        }
    }
    /** Resolve one pooled take into the registry without touching the voice: library k-th match first, else a unique generated take. */
    fillVariantTake(stmt, clipPath, k, predicted = false) {
        const prompt = stmt.genPrompt;
        if (!stmt.synth && this.standInFirst(predicted)) {
            this.searchCommunityBounded(prompt, k, stmt)
                .then(data => data ? this.host.decode(data.slice(0)) : null)
                .then(ab => {
                if (ab) {
                    this.host.registerBuffer(clipPath, ab);
                    this.upgradeInBackground(prompt, clipPath, stmt, k);
                }
                else {
                    this.fallbackGenerate(prompt, clipPath, stmt, k);
                }
            }).catch(error => this.noteFailure(error, 'Library search unavailable'));
            return;
        }
        this.fallbackGenerate(prompt, clipPath, stmt, k);
    }
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
    preGenerateAll(statements) {
        const queued = new Set();
        const communityBuffers = new Map(); // basePrompt(#rank) → decoded match (or null)
        const jobs = [];
        for (const stmt of statements) {
            if (!stmt.isGenerated || !stmt.genPrompt || stmt.recordings?.takes)
                continue;
            // Template trigger prompts ({text}) resolve per fire — pre-generating
            // would synthesize the literal placeholder.
            if (stmt.kind === 'trigger' && stmt.genPrompt.includes('{'))
                continue;
            // Lazy generation: a sound the state needs neither now nor within the
            // horizon waits for its voice to be created dormant and woken.
            if (this.lazyGeneration && this.host.demandWithinHorizon(stmt) <= 0)
                continue;
            // A pooled voice (`variants N`) queues every take; the library is asked
            // for its k-th best match per take, so a pool can be served by N
            // DIFFERENT community samples before any credit is spent.
            for (let k = 0; k < stmt.variants; k++) {
                const clipPath = takeClipPath(stmt, k);
                if (this.host.takeLanded(stmt, k) || queued.has(clipPath))
                    continue;
                queued.add(clipPath);
                jobs.push({ stmt, k, clipPath, priority: this.priorityFor(stmt, { poolFill: k > 0 }) });
            }
        }
        jobs.sort((a, b) => a.priority - b.priority);
        for (const { stmt, k, clipPath } of jobs) {
            const basePrompt = stmt.genPrompt;
            if (stmt.synth || !(this.preferCommunitySamples && this.onSearchCommunity)) {
                this.fallbackGenerate(basePrompt, clipPath, stmt, k);
                continue;
            }
            // Community-first: one search+decode per prompt (and per pool rank), shared across copies.
            const searchKey = JSON.stringify([basePrompt, k, communitySoundContract(stmt)]);
            let bufPromise = communityBuffers.get(searchKey);
            if (!bufPromise) {
                bufPromise = this.searchCommunityBounded(basePrompt, k, stmt)
                    .then(data => data ? this.host.decode(data.slice(0)) : null);
                communityBuffers.set(searchKey, bufPromise);
            }
            bufPromise.then((ab) => {
                if (ab) {
                    this.host.registerBuffer(clipPath, ab);
                    this.upgradeInBackground(basePrompt, clipPath, stmt, k);
                }
                else {
                    this.fallbackGenerate(basePrompt, clipPath, stmt, k);
                }
            }).catch(error => this.noteFailure(error, 'Library search unavailable'));
        }
    }
    /**
     * Generate + cache a template trigger take. The fire that requested it
     * stays silent; every later fire on the same text plays from cache. Bank
     * takes share one prompt but must each be a DISTINCT recording —
     * `uniqueTake` forbids the generator's prompt-level cache from aliasing
     * them; the bank slot is the take's rank in the server pool. Takes are
     * events: tight clips unless the gen block authored a duration.
     */
    generateTriggerTake(stmt, prompt, clipPath, bankIndex = 0) {
        if (this.inFlight.has(clipPath) || !this.available())
            return;
        const options = { ...this.optionsFor(stmt), uniqueTake: true, takeIndex: bankIndex, priority: true };
        if (options.duration === undefined)
            options.duration = TRIGGER_TAKE_DURATION_S;
        // A template take is requested BY a fire — it is overdue by definition.
        this.track(clipPath, this.run(prompt, clipPath, false, options, this.priorityFor(stmt, { demanded: true }))
            .then((audioBuffer) => {
            this.host.registerBuffer(clipPath, audioBuffer);
            return audioBuffer;
        })
            .catch((e) => {
            if (isGenCancelled(e))
                return null; // stop/reload drained the queue — not a failure
            this.host.warn(`Trigger audio generation failed: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }));
    }
}
//# sourceMappingURL=GenResolver.js.map