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
const ZERO = { x: 0, y: 0, z: 0 };
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
export function sampleScatter(spec, rnd) {
    if (!spec)
        return ZERO;
    const [a, b] = spec.dims;
    switch (spec.shape) {
        case 'box': {
            const [hx, hy, hz] = spec.dims;
            return {
                x: (rnd() * 2 - 1) * hx,
                y: (rnd() * 2 - 1) * hy,
                z: (rnd() * 2 - 1) * hz,
            };
        }
        case 'disc': {
            // Uniform over the area: r ∝ √u, else the centre is over-weighted.
            const r = a * Math.sqrt(rnd());
            const th = rnd() * Math.PI * 2;
            return { x: r * Math.cos(th), y: 0, z: r * Math.sin(th) };
        }
        case 'sphere':
            return onSphere(a * Math.cbrt(rnd()), rnd);
        case 'shell': {
            const inner = Math.min(a, b || a);
            const outer = Math.max(a, b || a);
            if (outer <= 0)
                return ZERO;
            // Uniform by volume between the two radii (inner³ … outer³).
            const i3 = inner * inner * inner;
            const o3 = outer * outer * outer;
            return onSphere(Math.cbrt(i3 + (o3 - i3) * rnd()), rnd);
        }
    }
}
/**
 * A point at radius `r` in a direction drawn uniformly over the sphere. The
 * z = 1 − 2u / azimuth construction is the standard area-preserving one;
 * drawing two angles uniformly instead crowds the poles, which puts a flock's
 * birds above and below the listener rather than around them.
 */
function onSphere(r, rnd) {
    const cosPhi = 1 - 2 * rnd();
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const th = rnd() * Math.PI * 2;
    return { x: r * sinPhi * Math.cos(th), y: r * cosPhi, z: r * sinPhi * Math.sin(th) };
}
/** The farthest an offset from this distribution can land, metres. */
export function scatterReach(spec) {
    if (!spec)
        return 0;
    const [a, b, c] = spec.dims;
    switch (spec.shape) {
        case 'box': return Math.sqrt(a * a + b * b + c * c);
        case 'disc':
        case 'sphere': return a;
        case 'shell': return Math.max(a, b || a);
    }
}
//# sourceMappingURL=Scatter.js.map