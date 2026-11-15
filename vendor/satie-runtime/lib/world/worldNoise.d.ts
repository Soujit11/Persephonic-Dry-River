/**
 * Seeded randomness for the procedural world — a tiny PRNG and 2-D simplex
 * noise, dependency-free so the realizer runs identically in a worker, in
 * tests and in the browser. Same seed → same sequence, always.
 */
/** mulberry32 — 32-bit state, good enough distribution for placement. */
export declare function createRng(seed: number): () => number;
/** Uniform in [lo, hi). */
export declare function rngRange(rng: () => number, lo: number, hi: number): number;
export interface Noise2D {
    /** Simplex noise in roughly [-1, 1]. */
    (x: number, y: number): number;
}
/** 2-D simplex noise with a seeded permutation table. */
export declare function createNoise2D(seed: number): Noise2D;
/**
 * Fractal Brownian motion over a noise function: `octaves` layers, each at
 * `lacunarity`× the frequency and `gain`× the amplitude. Normalised to ~[-1, 1].
 */
export declare function fbm(noise: Noise2D, x: number, y: number, octaves: number, lacunarity?: number, gain?: number): number;
//# sourceMappingURL=worldNoise.d.ts.map