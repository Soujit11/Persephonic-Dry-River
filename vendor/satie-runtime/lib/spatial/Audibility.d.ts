/** The floor a scene has when no bed states one: still air at the ear. */
export declare const DEFAULT_FLOOR_DB = 35;
/** Bounds on the radius: a whisper is still born a few metres off; a horn is not born a kilometre off. */
export declare const AUDIBILITY_MIN_M = 4;
export declare const AUDIBILITY_MAX_M = 300;
/**
 * Distance at which a source emitting `emissionDb` at 1 m falls to `floorDb` at the ear:
 * the inverse-distance model solved for distance, clamped to the bounds.
 */
export declare function audibilityRadiusM(emissionDb?: number, floorDb?: number): number;
/**
 * How far beyond a strip's end point (ex, ez), along the outward unit tangent (tx, tz), a body must
 * stand to be `radiusM` from the listener (lx, lz). Zero when the end itself is already that far.
 * The smallest non-negative root of |E + t·u − L| = R.
 */
export declare function rollBeyondM(ex: number, ez: number, tx: number, tz: number, lx: number, lz: number, radiusM: number): number;
//# sourceMappingURL=Audibility.d.ts.map