/** Scalar and 3-vector helpers the engine's hot paths share. Branch-based clamps: no `Math.min/max` call overhead per sample. */
export function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
/** Hermite smoothstep on [0,1]; inputs outside the range clamp. */
export function smoothstep01(t) {
    const u = clamp01(t);
    return u * u * (3 - 2 * u);
}
export function dist3(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
//# sourceMappingURL=math.js.map