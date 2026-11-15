/**
 * The find block. Two things, both there: **marks** steer (More like this · Less like this on every
 * row; "Steering by" lists every mark so far, each removable), and **your shortlist** keeps your
 * final candidates, each with ▶ and Use, whatever the next round brings (+ Shortlist, or drag a row
 * in). After the first library round the main step is making new ones steered by the marks; its plan
 * is yours to edit (rewrite, remove or add lines, change what it aims for) before anything is
 * bought. Another library round is offered while the library still has close matches. Drawn on the
 * card and in the chat thread from the same `FindState`; it owns nothing.
 */
import type { FindCandidate, FindUseScope } from '../../find/types.js';
import { type FindState, type Verdict } from './findSession.js';
export interface FindViewActions {
    play(c: FindCandidate, btn: HTMLButtonElement): void;
    /** Unused by the block since the card plays candidates in place; kept for callers that still pass it. */
    alone?(c: FindCandidate, btn: HTMLButtonElement): void;
    shortlist(c: FindCandidate): void;
    unshortlist(sampleId: string): void;
    /** More like this / Less like this (the same again clears it). */
    mark(sampleId: string, verdict: Verdict): void;
    /** Out of Steering by. */
    unmark(sampleId: string): void;
    /** Another library round. */
    next(): void;
    /** The plan as edited; `repaint` false while typing (the owner must not rebuild the input under the caret). */
    editPlan(text: string, repaint: boolean): void;
    use(c: FindCandidate, scope: FindUseScope): void;
    close(): void;
    /** Make new ones: the free plan, then the capped make, or not now. */
    plan(): void;
    make(): void;
    dropPlan(): void;
}
export interface FindViewOptions {
    title: string;
    searchingFor?: string;
    /** "Use this · for both bells" and "only this bell" (null when the recording is not shared). */
    labels: {
        all: string;
        one: string | null;
    };
    /** The candidate playing in place now. */
    playing: string | null;
    busy: boolean;
    /** False where making new ones is not available: the next step is always the library. */
    canGenerate?: boolean;
}
export declare function findView(s: FindState, o: FindViewOptions, a: FindViewActions): HTMLElement;
//# sourceMappingURL=findView.d.ts.map