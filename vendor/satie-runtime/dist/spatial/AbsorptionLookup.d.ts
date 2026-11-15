/**
 * Open-vocabulary surface label → octave-band absorption.
 *
 * The world model describes surfaces in free text it wrote itself ("weathered
 * wet wooden planks", "polished concrete floor"). Nothing in the codebase
 * enumerates those, and nothing should: the table is representation, the
 * vocabulary belongs to the scene. So matching is generic string similarity
 * over the table's own names, never a hardcoded class list.
 *
 * The important output is not the coefficients — it is the CONFIDENCE. The
 * table is entirely architectural (see absorptionTable.ts), so an outdoor
 * label has no honest match, and silently returning the nearest carpet would
 * be worse than returning nothing. Callers are expected to degrade visibly on
 * a low score, the same way the world pipeline surfaces a missing collider
 * rather than quietly guessing.
 *
 * Pure and synchronous. A future embedding-backed matcher can replace
 * `scoreLabel` without changing this module's contract; the lexical matcher
 * stays as the always-available, deterministic, CI-testable baseline.
 */
import { type AbsorptionEntry } from './absorptionTable.js';
import type { BandValues } from './RoomAcoustics';
/**
 * Below this, treat the match as "no idea" and degrade rather than use it.
 * Chosen so a single incidental shared word ("wood" in "wood floor" vs "wood
 * panelling on battens") does not by itself count as a match.
 */
export declare const ABSORPTION_MATCH_FLOOR = 0.34;
/**
 * Fraction of a label's tokens the table has ANY word for.
 *
 * The out-of-domain detector, and the reason "open water" is refused: "open"
 * exists in the table, "water" does not, so half the label is vocabulary the
 * material set has never heard of. Architectural tables simply do not contain
 * water, sand, snow or foliage, and a label made mostly of unknown words is a
 * label about something the table cannot describe.
 */
export declare function inVocabularyFraction(label: string): number;
/**
 * Below this share of recognisable words, refuse outright regardless of how
 * well the recognisable ones happen to score.
 */
export declare const MIN_IN_VOCAB_FRACTION = 0.6;
/**
 * Similarity of a free-text label to a table entry, 0–1.
 *
 * IDF-weighted overlap over stemmed tokens, biased toward the QUERY: a
 * two-word label fully contained in a long entry name should score well, while
 * a long label brushing one generic word of a short entry should not. Category
 * text counts at low weight so "floor" nudges floor rows without dominating.
 */
export declare function scoreLabel(label: string, entry: AbsorptionEntry): number;
export interface AbsorptionMatch {
    absorption: BandValues;
    /** Table row that matched. */
    id: string;
    name: string;
    /** 0–1 similarity. Below ABSORPTION_MATCH_FLOOR the caller should degrade. */
    confidence: number;
}
/**
 * Best table entry for a free-text surface label, or `null` when nothing
 * clears the floor.
 *
 * Null is a real answer, not a failure to handle: the table has no outdoor
 * surfaces at all, so "wet sand" and "mossy rock" SHOULD come back empty. A
 * caller that needs a number anyway should say so explicitly and record that
 * it guessed — see the degradation pattern in the world pipeline.
 */
export declare function lookupAbsorption(label: string): AbsorptionMatch | null;
/** Ranked candidates — for debugging a bad match, and for a UI to show its work. */
export declare function rankAbsorptionCandidates(label: string, limit?: number): AbsorptionMatch[];
/**
 * Area- and confidence-weighted mean absorption across a set of labelled
 * surfaces — the Samosa recipe's aggregation step.
 *
 * Unmatched surfaces are EXCLUDED from the weighted mean and reported in
 * `unmatched` rather than being assigned a default. A room whose surfaces are
 * mostly unrecognised should be visibly unrecognised; averaging in an invented
 * coefficient would hide exactly the case that needs surfacing.
 */
export declare function weightedAbsorption(surfaces: {
    label: string;
    areaM2: number;
}[]): {
    absorption: BandValues | null;
    matchedAreaFraction: number;
    unmatched: string[];
};
//# sourceMappingURL=AbsorptionLookup.d.ts.map