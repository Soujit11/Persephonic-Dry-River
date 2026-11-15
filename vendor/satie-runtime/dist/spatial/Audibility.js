/**
 * Audibility (spec 006, FR-006): how far a source can be heard over the place's bed, and how far
 * beyond a strip's end a route body must be born or retired so that nothing appears or vanishes
 * within earshot. Pure functions over the same distance model the panner uses (`directPathGain`).
 */
import { PANNER_REF_M } from './WorldAcoustics.js';
import { DEFAULT_SPL_DB } from './LevelModel.js';
/** The floor a scene has when no bed states one: still air at the ear. */
export const DEFAULT_FLOOR_DB = 35;
/** Bounds on the radius: a whisper is still born a few metres off; a horn is not born a kilometre off. */
export const AUDIBILITY_MIN_M = 4;
export const AUDIBILITY_MAX_M = 300;
/** The rolloff the radius assumes. Free field (1/r) gives the larger radius, so a legacy scene (1/r²) is covered too. */
const RADIUS_ROLLOFF = 1;
/**
 * Distance at which a source emitting `emissionDb` at 1 m falls to `floorDb` at the ear:
 * the inverse-distance model solved for distance, clamped to the bounds.
 */
export function audibilityRadiusM(emissionDb = DEFAULT_SPL_DB, floorDb = DEFAULT_FLOOR_DB) {
    const loss = emissionDb - floorDb;
    if (!(loss > 0))
        return AUDIBILITY_MIN_M;
    const gain = Math.pow(10, -loss / 20);
    const d = PANNER_REF_M + (PANNER_REF_M / gain - PANNER_REF_M) / RADIUS_ROLLOFF;
    return Math.min(AUDIBILITY_MAX_M, Math.max(AUDIBILITY_MIN_M, d));
}
/**
 * How far beyond a strip's end point (ex, ez), along the outward unit tangent (tx, tz), a body must
 * stand to be `radiusM` from the listener (lx, lz). Zero when the end itself is already that far.
 * The smallest non-negative root of |E + t·u − L| = R.
 */
export function rollBeyondM(ex, ez, tx, tz, lx, lz, radiusM) {
    const wx = ex - lx, wz = ez - lz;
    const w2 = wx * wx + wz * wz;
    if (w2 >= radiusM * radiusM)
        return 0;
    const b = wx * tx + wz * tz;
    const disc = b * b - (w2 - radiusM * radiusM);
    if (!(disc >= 0))
        return radiusM;
    const u = -b + Math.sqrt(disc);
    return u > 0 ? u : 0;
}
//# sourceMappingURL=Audibility.js.map