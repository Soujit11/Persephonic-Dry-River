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
import { ABSORPTION_TABLE, NON_COEFFICIENT_IDS } from './absorptionTable.js';
/**
 * Below this, treat the match as "no idea" and degrade rather than use it.
 * Chosen so a single incidental shared word ("wood" in "wood floor" vs "wood
 * panelling on battens") does not by itself count as a match.
 */
export const ABSORPTION_MATCH_FLOOR = 0.34;
/** Words that carry no material information and would inflate every score. */
const STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'on', 'in', 'with', 'and', 'or', 'to', 'at', 'by',
    'per', 'mm', 'cm', 'm', 'surface', 'material', 'texture', 'looking', 'very',
]);
function tokenize(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}
/** Crude but adequate singularization — "planks" and "plank" must agree. */
function stem(w) {
    if (w.length > 4 && w.endsWith('ies'))
        return w.slice(0, -3) + 'y';
    if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses'))
        return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss'))
        return w.slice(0, -1);
    return w;
}
/**
 * Every stemmed token the table knows about, and how many rows use it. Built
 * once from the data — never hand-listed, so it tracks the table.
 */
const TABLE_VOCAB = (() => {
    const df = new Map();
    for (const e of ABSORPTION_TABLE) {
        const seen = new Set([...tokenize(e.name), ...tokenize(e.category)].map(stem));
        for (const t of seen)
            df.set(t, (df.get(t) ?? 0) + 1);
    }
    return df;
})();
/**
 * Inverse document frequency: a token in one row identifies a material
 * ("marble"); a token in twenty describes a whole shelf of them ("panel",
 * "acoustic"). Without this, generic words carry the same weight as specific
 * ones and "open water" matches "Open-cell acoustic foam".
 */
function idf(token) {
    const df = TABLE_VOCAB.get(token);
    if (!df)
        return 0;
    return Math.log(1 + ABSORPTION_TABLE.length / df);
}
/**
 * Fraction of a label's tokens the table has ANY word for.
 *
 * The out-of-domain detector, and the reason "open water" is refused: "open"
 * exists in the table, "water" does not, so half the label is vocabulary the
 * material set has never heard of. Architectural tables simply do not contain
 * water, sand, snow or foliage, and a label made mostly of unknown words is a
 * label about something the table cannot describe.
 */
export function inVocabularyFraction(label) {
    const q = tokenize(label).map(stem);
    if (q.length === 0)
        return 0;
    return q.filter((t) => TABLE_VOCAB.has(t)).length / q.length;
}
/**
 * Below this share of recognisable words, refuse outright regardless of how
 * well the recognisable ones happen to score.
 */
export const MIN_IN_VOCAB_FRACTION = 0.6;
/**
 * Similarity of a free-text label to a table entry, 0–1.
 *
 * IDF-weighted overlap over stemmed tokens, biased toward the QUERY: a
 * two-word label fully contained in a long entry name should score well, while
 * a long label brushing one generic word of a short entry should not. Category
 * text counts at low weight so "floor" nudges floor rows without dominating.
 */
export function scoreLabel(label, entry) {
    const q = new Set(tokenize(label).map(stem));
    if (q.size === 0)
        return 0;
    const nameTokens = new Set(tokenize(entry.name).map(stem));
    const catTokens = new Set(tokenize(entry.category).map(stem));
    let hitWeight = 0;
    let queryWeight = 0;
    for (const t of q) {
        const w = idf(t);
        queryWeight += w;
        if (nameTokens.has(t))
            hitWeight += w;
        else if (catTokens.has(t))
            hitWeight += w * 0.35;
    }
    if (hitWeight === 0 || queryWeight === 0)
        return 0;
    const coverage = hitWeight / queryWeight; // how much of the query matched
    const precision = hitWeight / Math.max([...nameTokens].reduce((s, t) => s + idf(t), 0), 1e-9);
    // Coverage matters more: naming a material is usually a subset of the row.
    return (coverage * 0.7) + (Math.min(precision, 1) * 0.3);
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
export function lookupAbsorption(label) {
    // Out-of-domain first: a label built mostly from words the table has never
    // seen is about something the table cannot describe, however well its one
    // familiar word happens to score.
    if (inVocabularyFraction(label) < MIN_IN_VOCAB_FRACTION)
        return null;
    let best = null;
    for (const entry of ABSORPTION_TABLE) {
        if (NON_COEFFICIENT_IDS.includes(entry.id))
            continue;
        const confidence = scoreLabel(label, entry);
        if (confidence > (best?.confidence ?? 0)) {
            best = { absorption: entry.absorption, id: entry.id, name: entry.name, confidence };
        }
    }
    return best && best.confidence >= ABSORPTION_MATCH_FLOOR ? best : null;
}
/** Ranked candidates — for debugging a bad match, and for a UI to show its work. */
export function rankAbsorptionCandidates(label, limit = 5) {
    return ABSORPTION_TABLE
        .filter((e) => !NON_COEFFICIENT_IDS.includes(e.id))
        .map((e) => ({
        absorption: e.absorption, id: e.id, name: e.name, confidence: scoreLabel(label, e),
    }))
        .filter((m) => m.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);
}
/**
 * Area- and confidence-weighted mean absorption across a set of labelled
 * surfaces — the Samosa recipe's aggregation step.
 *
 * Unmatched surfaces are EXCLUDED from the weighted mean and reported in
 * `unmatched` rather than being assigned a default. A room whose surfaces are
 * mostly unrecognised should be visibly unrecognised; averaging in an invented
 * coefficient would hide exactly the case that needs surfacing.
 */
export function weightedAbsorption(surfaces) {
    const bandCount = ABSORPTION_TABLE[0].absorption.length;
    const acc = new Array(bandCount).fill(0);
    let weightSum = 0;
    let matchedArea = 0;
    let totalArea = 0;
    const unmatched = [];
    for (const s of surfaces) {
        totalArea += s.areaM2;
        const m = lookupAbsorption(s.label);
        if (!m) {
            unmatched.push(s.label);
            continue;
        }
        const w = s.areaM2 * m.confidence;
        for (let b = 0; b < bandCount; b++)
            acc[b] += m.absorption[b] * w;
        weightSum += w;
        matchedArea += s.areaM2;
    }
    return {
        absorption: weightSum > 0 ? acc.map((v) => v / weightSum) : null,
        matchedAreaFraction: totalArea > 0 ? matchedArea / totalArea : 0,
        unmatched,
    };
}
//# sourceMappingURL=AbsorptionLookup.js.map