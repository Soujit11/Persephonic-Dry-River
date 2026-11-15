/**
 * One find, as state: the retrieval session's "steer by listening" (`satie_find`), drawn by the
 * in-game mixer. Two things, both there (Huanxing, 2026-11-05): **marks** steer (More like this,
 * `closer`; Less like this, `less-close`; every mark so far is "Steering by"), and the
 * **shortlist** keeps your final candidates whatever the next round brings (it does not steer by
 * itself). Nothing calls the server until the next step: after the first library round that is
 * making new ones (`satie_vary`, steered by the marks, its plan editable before anything is
 * bought), with another library round offered while the library still has close matches
 * (`nextSteps`). Use binds one.
 *
 * Pure: the network is injected (`FindRoutes`), so the card, the chat thread and the tests all
 * drive the same state. The server is stateless: every round carries the whole find.
 */
import type { FindCandidate, FindFeedback, FindRequest, FindRound, FindStart, FindStatus, FindUseScope, FindLogRequest, FindVaryPlan, FindVaryResult, FindVariation } from '../../find/types.js';
import { type VoiceLocator } from '../../edit/scriptEdit.js';
export type Verdict = FindFeedback['verdict'];
export interface FindRoutes {
    find(req: FindRequest): Promise<FindRound>;
    /** Listens and the final Use this (best effort, never fails a find). */
    log?(req: FindLogRequest): Promise<void>;
    /** Generate variations (satie_vary): plan is free, make spends at most `maxCents`. */
    vary?(req: VaryRequest): Promise<FindVaryPlan | FindVaryResult>;
}
/** One `/__satie/vary` call: a free plan, or a make of exactly the planned variations within a cap. */
export type VaryRequest = {
    mode: 'plan';
    anchor?: string;
    heard?: string;
    text?: string;
    steer?: FindFeedback[];
    count: number;
    loop: boolean;
} | {
    mode: 'make';
    requestKey: string;
    variations: FindVariation[];
    maxCents: number;
    loop: boolean;
};
export interface FindState {
    start: FindStart;
    findId: string | null;
    round: number;
    candidates: FindCandidate[];
    status: FindStatus | 'starting';
    degraded: boolean;
    suggestGenerate: boolean;
    /** This round's marks (sent on Next round). */
    marks: Record<string, Verdict>;
    /** Every mark so far, in order (the server keeps nothing). */
    feedback: FindFeedback[];
    /** Every sample id shown so far (the next round brings new ones). */
    shown: string[];
    /** For an audio start: what Satie heard in it, echoed back as `start.heard`. */
    heard?: string;
    loop: boolean;
    /** The round failed to arrive (the route itself, not "nothing close"). */
    error?: string;
    /** Generate variations: the plan read before anything is bought, and the takes it made. */
    vary?: {
        plan?: FindVaryPlan;
        requestKey?: string;
        making?: boolean;
        error?: string;
        draft?: string;
    };
    /** Sample ids made by Generate in this find (their rows say "new"). */
    made?: string[];
    /** Your final candidates, kept across rounds independently of steering marks. */
    shortlist: FindCandidate[];
    /** A round came back short or not close: the library has nothing more like this, so the next step makes new ones. */
    libraryOut: boolean;
    /** Every sound this find has offered, by id (Steering by names marks from earlier rounds). */
    known: Record<string, FindCandidate>;
    /** The library name of the recording being replaced (its other takes may come back: "another take of the one playing now"). */
    replacing?: string;
}
/** A full round, as `satie_find` sends by default: fewer means the library is running out. */
export declare const ROUND_SIZE = 6;
/**
 * The shortlisted sound this candidate is another take of, or null: the server's `takeOf` when
 * it says, else the name rule (same name but for the take number).
 */
/** Two library names for one sound: the same name but for a take number (2, 3 …). */
export declare function sameSound(a: string, b: string): boolean;
export declare function takeOfKept(c: FindCandidate, kept: readonly FindCandidate[]): FindCandidate | null;
export declare function newFind(start: FindStart, opts: {
    loop: boolean;
}): FindState;
/** Round 0, from the start. */
export declare function startFind(start: FindStart, routes: FindRoutes, opts: {
    loop: boolean;
}): Promise<FindState>;
/**
 * Mark a sound More like this (`closer`) or Less like this (`less-close`); the same mark again,
 * or null, clears it; the other mark replaces it, even one an earlier round sent. No network:
 * marks go with the next step.
 */
export declare function mark(s: FindState, sampleId: string, verdict: Verdict | null): FindState;
/** Take a sound out of Steering by: its mark here and any an earlier round sent. */
export declare function unmark(s: FindState, sampleId: string): FindState;
/** Steering by: every sound marked so far, by its verdict now, in the order first marked. */
export declare function steering(s: FindState): {
    more: FindCandidate[];
    less: FindCandidate[];
};
/** Next round: this round's marks join every mark so far; every sound shown is left out. */
export declare function nextRound(s: FindState, routes: FindRoutes): Promise<FindState>;
/** Put a sound on your shortlist (your final candidates): it leaves the round list and stays. Twice is once. It does not steer by itself. */
export declare function shortlist(s: FindState, c: FindCandidate): FindState;
/** Take a sound off the shortlist: back at the top of the list. Its marks are untouched. */
export declare function unshortlist(s: FindState, sampleId: string): FindState;
/**
 * The next step, after the first (free, instant) library round: making new ones, steered by the
 * marks, is the main button (for most sounds the library holds a handful of near-identical earlier
 * generations, so a second library round has little range to steer through). Another library
 * round is offered beside it while the library still has close matches. Without generation, the
 * library is all there is.
 */
export declare function nextSteps(s: FindState, opts?: {
    canGenerate?: boolean;
}): {
    primary: 'library' | 'generate';
    library: boolean;
};
/**
 * The round has marks and none of them is Closer or Less close: About the same keeps the search
 * where it is, so the next round would barely move. The block says so.
 */
export declare function stalled(s: FindState): boolean;
/** What the find starts from, for the voice the card is on. */
export declare function startFor(voice: {
    sampleId?: string | null;
    audio?: {
        base64: string;
    } | null;
    name: string;
    words?: string | null;
}): FindStart;
/**
 * Use this, as script text: every voice in `voices` now plays the candidate's recording, named in
 * the script by its library name (never an opaque take id). A generated voice's own words and
 * versions go (it plays one recording now). Null when a voice cannot be found.
 */
export declare function useThisScript(script: string, voices: ReadonlyArray<{
    loc: VoiceLocator;
    generated: boolean;
    variants: number;
}>, candidate: Pick<FindCandidate, 'clip'>): string | null;
/** "Use this · for both bells", "only this bell", or just "Use this". */
export declare function useLabels(name: string, shared: number): {
    all: string;
    one: string | null;
};
/** How many variations Generate plans. */
export declare const VARY_COUNT = 4;
/** The most a plan may hold (`satie_vary`'s MAX_VARIATIONS). */
export declare const VARY_MAX = 8;
/**
 * The plan as you edit it: its lines (what each new sound changes), the aim line (`steer`, what
 * the marked sounds share), whether you changed either, and the price for that many lines.
 */
export declare function planDraft(s: FindState): {
    text: string;
    lines: string[];
    aim: string;
    edited: boolean;
    costCents: number;
} | null;
/** Keep the notepad verbatim; nothing is called until Make. */
export declare function editPlan(s: FindState, text: string): FindState;
/** Generate variations, step one (free): what each would change and what they would cost, steered by every mark so far. */
export declare function planVariations(s: FindState, routes: FindRoutes, newKey: () => string): Promise<FindState>;
/**
 * Generate variations, step two (spends): exactly the planned variations, capped at the plan's cost,
 * under the plan's one request key (a retry recovers the takes instead of paying twice). The new
 * takes join the round as candidates, marked new; failures say so.
 */
export declare function makeVariations(s: FindState, routes: FindRoutes): Promise<FindState>;
export type { FindUseScope };
//# sourceMappingURL=findSession.d.ts.map