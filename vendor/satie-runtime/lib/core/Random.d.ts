/**
 * Deterministic PRNG utilities.
 *
 * Offline rendering and export need reproducible randomness: the same script +
 * seed must yield the same voice seeds, range samples and start offsets so a
 * metadata pass (ADM/USDZ position timelines) matches the rendered audio
 * exactly. Live playback keeps using Math.random via defaultRng().
 */
/** Standard mulberry32: fast 32-bit PRNG, uniform in [0, 1). */
export declare function mulberry32(seed: number): () => number;
/** Combine integer parts into a single 32-bit sub-seed (order-sensitive). */
export declare function hashSeed(...parts: number[]): number;
/** FNV-1a hash of a string → 32-bit seed (used to pin noise to cache keys). */
export declare function fnv1a(str: string): number;
/** Math.random wrapper — the unseeded default, preserving live behavior. */
export declare function defaultRng(): () => number;
//# sourceMappingURL=Random.d.ts.map