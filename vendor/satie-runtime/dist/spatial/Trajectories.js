/**
 * Named trajectory patterns for Satie spatial movement.
 * Normalized [0,1] output — remapped to areaMin/areaMax by the engine.
 */
/**
 * Analytical trajectory — computes position directly from t, no storage.
 */
class AnalyticalTrajectory {
    fn;
    constructor(fn) {
        this.fn = fn;
    }
    evaluate(t) { return this.fn(t); }
}
/**
 * LUT trajectory — pre-computes points lazily, lerps at runtime.
 */
class LUTTrajectory {
    xs = null;
    ys = null;
    zs = null;
    size;
    generate;
    constructor(size, generate) {
        this.size = size;
        this.generate = generate;
    }
    evaluate(t, clamp) {
        if (!this.xs) {
            const data = this.generate();
            this.xs = data.xs;
            this.ys = data.ys;
            this.zs = data.zs;
        }
        // Wrap t to [0,1)
        t = clamp ? Math.max(0, Math.min(1, t)) : t - Math.floor(t);
        const idx = t * (this.size - 1);
        const i0 = idx | 0;
        const i1 = i0 + 1 < this.size ? i0 + 1 : 0;
        const frac = idx - i0;
        return {
            x: this.xs[i0] + (this.xs[i1] - this.xs[i0]) * frac,
            y: this.ys[i0] + (this.ys[i1] - this.ys[i0]) * frac,
            z: this.zs[i0] + (this.zs[i1] - this.zs[i0]) * frac,
        };
    }
}
// ── Trajectory implementations ──
const TWO_PI = 2 * Math.PI;
const spiral = new AnalyticalTrajectory((t) => {
    const angle = TWO_PI * t * 4; // 4 revolutions per cycle
    return {
        x: (Math.cos(angle) + 1) * 0.5, // [0,1]
        y: (Math.sin(TWO_PI * t) + 1) * 0.5, // smooth sine oscillation
        z: (Math.sin(angle) + 1) * 0.5, // [0,1]
    };
});
const orbit = new AnalyticalTrajectory((t) => {
    const angle = TWO_PI * t;
    return {
        x: (Math.cos(angle) + 1) * 0.5,
        y: 0.5,
        z: (Math.sin(angle) + 1) * 0.5,
    };
});
const LUT_SIZE = 4096;
function generateLorenzLUT() {
    const sigma = 10, rho = 28, beta = 8 / 3;
    const dt = 0.005;
    const steps = LUT_SIZE;
    const xs = new Float32Array(steps);
    const ys = new Float32Array(steps);
    const zs = new Float32Array(steps);
    // Initial conditions
    let x = 1, y = 1, z = 1;
    // Warm up (skip transient)
    for (let i = 0; i < 1000; i++) {
        // RK4
        const k1x = sigma * (y - x);
        const k1y = x * (rho - z) - y;
        const k1z = x * y - beta * z;
        const x1 = x + 0.5 * dt * k1x, y1 = y + 0.5 * dt * k1y, z1 = z + 0.5 * dt * k1z;
        const k2x = sigma * (y1 - x1);
        const k2y = x1 * (rho - z1) - y1;
        const k2z = x1 * y1 - beta * z1;
        const x2 = x + 0.5 * dt * k2x, y2 = y + 0.5 * dt * k2y, z2 = z + 0.5 * dt * k2z;
        const k3x = sigma * (y2 - x2);
        const k3y = x2 * (rho - z2) - y2;
        const k3z = x2 * y2 - beta * z2;
        const x3 = x + dt * k3x, y3 = y + dt * k3y, z3 = z + dt * k3z;
        const k4x = sigma * (y3 - x3);
        const k4y = x3 * (rho - z3) - y3;
        const k4z = x3 * y3 - beta * z3;
        x += dt * (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
        y += dt * (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
        z += dt * (k1z + 2 * k2z + 2 * k3z + k4z) / 6;
    }
    // Collect points
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < steps; i++) {
        const k1x = sigma * (y - x);
        const k1y = x * (rho - z) - y;
        const k1z = x * y - beta * z;
        const x1 = x + 0.5 * dt * k1x, y1 = y + 0.5 * dt * k1y, z1 = z + 0.5 * dt * k1z;
        const k2x = sigma * (y1 - x1);
        const k2y = x1 * (rho - z1) - y1;
        const k2z = x1 * y1 - beta * z1;
        const x2 = x + 0.5 * dt * k2x, y2 = y + 0.5 * dt * k2y, z2 = z + 0.5 * dt * k2z;
        const k3x = sigma * (y2 - x2);
        const k3y = x2 * (rho - z2) - y2;
        const k3z = x2 * y2 - beta * z2;
        const x3 = x + dt * k3x, y3 = y + dt * k3y, z3 = z + dt * k3z;
        const k4x = sigma * (y3 - x3);
        const k4y = x3 * (rho - z3) - y3;
        const k4z = x3 * y3 - beta * z3;
        x += dt * (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
        y += dt * (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
        z += dt * (k1z + 2 * k2z + 2 * k3z + k4z) / 6;
        xs[i] = x;
        ys[i] = y;
        zs[i] = z;
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    // Normalize to [0,1]
    const rxRange = maxX - minX || 1;
    const ryRange = maxY - minY || 1;
    const rzRange = maxZ - minZ || 1;
    for (let i = 0; i < steps; i++) {
        xs[i] = (xs[i] - minX) / rxRange;
        ys[i] = (ys[i] - minY) / ryRange;
        zs[i] = (zs[i] - minZ) / rzRange;
    }
    return { xs, ys, zs };
}
const lorenz = new LUTTrajectory(LUT_SIZE, generateLorenzLUT);
// Linear traverses — used by the semantic `move pass/approach/recede` verbs.
// One-way with wrap: the source crosses the placed region, then re-enters from
// the start edge (reads as "the next one passing through"). The constant axes
// sit at 0.5 so the line runs through the centre of the placed region.
const lineLR = new AnalyticalTrajectory((t) => ({ x: t, y: 0.5, z: 0.5 })); // left → right
const lineRL = new AnalyticalTrajectory((t) => ({ x: 1 - t, y: 0.5, z: 0.5 })); // right → left
const lineToward = new AnalyticalTrajectory((t) => ({ x: 0.5, y: 0.5, z: 1 - t })); // far → near
const lineAway = new AnalyticalTrajectory((t) => ({ x: 0.5, y: 0.5, z: t })); // near → far
// ── Registry ──
// `line_*` are produced only by the semantic `move pass/approach/recede` verbs,
// never referenced by name in scripts — kept builtin so they can't be unregistered.
const BUILTIN_NAMES = new Set([
    'spiral', 'orbit', 'lorenz',
    'line_lr', 'line_rl', 'line_toward', 'line_away',
]);
const TRAJECTORY_REGISTRY = new Map([
    ['spiral', spiral],
    ['orbit', orbit],
    ['lorenz', lorenz],
    ['line_lr', lineLR],
    ['line_rl', lineRL],
    ['line_toward', lineToward],
    ['line_away', lineAway],
]);
export function getTrajectory(name) {
    return TRAJECTORY_REGISTRY.get(name);
}
export function isTrajectoryName(name) {
    return TRAJECTORY_REGISTRY.has(name);
}
export function isBuiltinTrajectory(name) {
    return BUILTIN_NAMES.has(name);
}
/** Register a custom trajectory from a pre-computed LUT (interleaved xyz Float32Array). */
export function registerTrajectoryFromLUT(name, points, pointCount) {
    // Deinterleave into separate xyz arrays for LUTTrajectory
    const xs = new Float32Array(pointCount);
    const ys = new Float32Array(pointCount);
    const zs = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
        xs[i] = points[i * 3];
        ys[i] = points[i * 3 + 1];
        zs[i] = points[i * 3 + 2];
    }
    const traj = new LUTTrajectory(pointCount, () => ({ xs, ys, zs }));
    // Force evaluation so the LUT is immediately available
    traj.evaluate(0);
    TRAJECTORY_REGISTRY.set(name, traj);
}
/** Remove a custom trajectory (cannot remove builtins). */
export function unregisterTrajectory(name) {
    if (BUILTIN_NAMES.has(name))
        return false;
    return TRAJECTORY_REGISTRY.delete(name);
}
/** List all registered trajectory names. */
export function listTrajectoryNames() {
    return Array.from(TRAJECTORY_REGISTRY.keys());
}
export { LUTTrajectory };
//# sourceMappingURL=Trajectories.js.map