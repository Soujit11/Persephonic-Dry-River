/**
 * The sounds an editor is working on, held audible. A game gates most of its sounds on its own
 * state (the crossing bell follows `crossing_bells`, 0 until a train comes; a cicada only plays
 * in the afternoon), so a sound being edited is usually silent at the moment you edit it. While
 * held, a voice ignores those gates: `volume follow` and `spl follow` read the input that gives
 * their loudest output, and `active` hours and `quiet` gates pass. Nothing is written; the hold
 * is keyed by `source_id`, so it survives the reload every save makes.
 */
import type { Statement } from './Statement.js';
export declare class EditHold {
    private ids;
    /** Replace the held set (null or empty: nothing held). */
    set(sourceIds: readonly string[] | null): void;
    get any(): boolean;
    held(stmt: Statement | null | undefined): boolean;
    /** The value a held voice reads for `signal` (its level follows it), else undefined: read the real signal. */
    signalFor(stmt: Statement, signal: string): number | undefined;
}
//# sourceMappingURL=EditHold.d.ts.map