/**
 * The next minute of a now-and-then sound, drawn as ticks under "how often" and "how regular",
 * so its rhythm is seen before it is heard. Pure and seeded: the same `every` always draws the
 * same strip (it moves only when a dial does), with each gap picked between the range's ends the
 * way the engine picks it (uniformly).
 */
/** A small deterministic generator (mulberry32). */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Where in the next `windowS` seconds it could play (s from now), at most 240 ticks. */
export function nextTicks(minS, maxS, windowS = 60, seed = 1) {
    const lo = Math.max(0.1, Math.min(minS, maxS)), hi = Math.max(lo, Math.max(minS, maxS));
    const r = rng(seed);
    const out = [];
    let t = lo + r() * (hi - lo);
    while (t <= windowS && out.length < 240) {
        out.push(t);
        t += lo + r() * (hi - lo);
    }
    return out;
}
//# sourceMappingURL=rhythm.js.map