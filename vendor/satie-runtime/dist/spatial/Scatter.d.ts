/**
 * Scatter — where MANY sources are, as opposed to how large ONE source is.
 *
 * `radius` answers "how big does this thing sound"; it is an extent, and a
 * flock is not one wide bird. Sound Particles' particle groups make the other
 * half of the question first-class: N sources instantiated at once over a
 * spawn distribution (box, circle, sphere surface), each varying on its own.
 * Satie could already express the box — `place 1to3 0 -2` spreads instances
 * over a region — and nothing else, so "forty crows in the canopy" was forty
 * lines of script, or one voice pretending to be a flock.
 *
 * `scatter <shape> <dims>` samples a per-instance OFFSET from the voice's
 * placed position. For a loop the offset is drawn once, at voice creation;
 * for a one-shot it is redrawn on every fire, which is the rate-based
 * emitter — `20 * oneshot leaf / every 1 / scatter shell 6 8` is twenty
 * particles a second, each from a different point of the shell — without a
 * second statement kind that `count` × `every` already spells.
 *
 * Pure math, no engine state: the live engine and the offline renderer both
 * call `sampleScatter` so an exported flock lands where the heard one did.
 */
/** Spawn distributions. Dimensions are metres, and their meaning is per-shape. */
export type ScatterShape = 'box' | 'disc' | 'sphere' | 'shell';
export interface ScatterSpec {
    shape: ScatterShape;
    /**
     * `box`   — half-extents on x, y, z (a single authored number gives a cube).
     * `disc`  — [radius, 0, 0]; a filled horizontal disc, no vertical spread.
     * `sphere`— [radius, 0, 0]; a filled ball.
     * `shell` — [inner, outer, 0]; the volume between two radii (inner = outer
     *           is the bare surface, which is Sound Particles' "sphere surface").
     */
    dims: [number, number, number];
}
export interface ScatterOffset {
    x: number;
    y: number;
    z: number;
}
/**
 * One offset from the distribution, drawn from `rnd` (a 0..1 generator, so
 * callers own their own seeded stream).
 *
 * Filled shapes are sampled UNIFORMLY BY VOLUME, not uniformly in the radius
 * parameter: drawing r linearly piles most of a flock into the middle of the
 * ball, which reads as one clumped source rather than a spread one. The cube
 * roots below are what make a `sphere` scatter actually look and sound like
 * an evenly filled volume.
 */
export declare function sampleScatter(spec: ScatterSpec | null, rnd: () => number): ScatterOffset;
/** The farthest an offset from this distribution can land, metres. */
export declare function scatterReach(spec: ScatterSpec | null): number;
//# sourceMappingURL=Scatter.d.ts.map