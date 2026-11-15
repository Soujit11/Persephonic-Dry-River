/**
 * Deterministic PRNG utilities.
 *
 * Offline rendering and export need reproducible randomness: the same script +
 * seed must yield the same voice seeds, range samples and start offsets so a
 * metadata pass (ADM/USDZ position timelines) matches the rendered audio
 * exactly. Live playback keeps using Math.random via defaultRng().
 */
/** Standard mulberry32: fast 32-bit PRNG, uniform in [0, 1). */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Combine integer parts into a single 32-bit sub-seed (order-sensitive). */
export function hashSeed(...parts) {
    let h = 0x811c9dc5;
    for (const p of parts) {
        // Mix both halves so large and fractional inputs still disperse.
        const x = Math.floor(p) >>> 0;
        h = Math.imul(h ^ (x & 0xffff), 0x01000193);
        h = Math.imul(h ^ (x >>> 16), 0x01000193);
    }
    return h >>> 0;
}
/** FNV-1a hash of a string → 32-bit seed (used to pin noise to cache keys). */
export function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    }
    return h >>> 0;
}
/** Math.random wrapper — the unseeded default, preserving live behavior. */
export function defaultRng() {
    return () => Math.random();
}
//# sourceMappingURL=Random.js.map