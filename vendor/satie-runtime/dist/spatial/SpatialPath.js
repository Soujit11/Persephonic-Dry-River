/**
 * Where a moving voice is at a moment: the sum-of-sines wander and the
 * trajectory (spiral/orbit/lorenz/path) evaluation, written into a caller's
 * vector so the live tick allocates nothing. The live engine and the offline
 * renderer both call these, so an exported render moves exactly as playback did.
 */
import { WanderType } from '../core/Statement.js';
import { clamp01 } from '../core/math.js';
import { getTrajectory } from './Trajectories.js';
export function pathSeedsFor(seed) {
    return { px1: seed * 1.0, px2: seed * 2.3, py1: seed * 3.7, py2: seed * 0.5, pz1: seed * 1.3, pz2: seed * 4.2 };
}
/** The trajectory a statement moves on: a compiled `path`, a custom LUT, or a builtin. */
export function resolveTrajectory(stmt) {
    const name = stmt.wanderType === WanderType.Custom ? stmt.customTrajectoryName : stmt.wanderType;
    return stmt.pathTrajectory ?? (name ? getTrajectory(name) : undefined);
}
/** Walk/fly wander: a seeded sum of sines inside the voice's area box (walk stays on the ground). */
export function wanderPositionInto(stmt, elapsed, wanderSpeed, s, out) {
    const t = elapsed * wanderSpeed;
    let nx = (Math.sin(t + s.px1) + Math.sin(t * 1.3 + s.px2) + Math.sin(t * 0.7 + s.px1 * 0.3)) / 6 + 0.5;
    let ny = (Math.sin(t * 0.8 + s.py1) + Math.sin(t * 1.1 + s.py2) + Math.sin(t * 0.6 + s.py1 * 0.4)) / 6 + 0.5;
    let nz = (Math.sin(t * 1.2 + s.pz1) + Math.sin(t * 0.7 + s.pz2) + Math.sin(t * 0.9 + s.pz1 * 0.6)) / 6 + 0.5;
    // High-frequency perturbation makes the path jittery/organic; it can
    // overshoot the unit range, so clamp to keep the voice inside its box.
    if (stmt.noise > 0) {
        const ht = elapsed * 3.7;
        const n = stmt.noise * 0.15;
        nx = clamp01(nx + (Math.sin(ht * 2.3 + s.px2 * 5) + Math.sin(ht * 3.1 + s.px1 * 7)) * n);
        ny = clamp01(ny + (Math.sin(ht * 1.9 + s.py2 * 5) + Math.sin(ht * 2.7 + s.py1 * 7)) * n);
        nz = clamp01(nz + (Math.sin(ht * 2.1 + s.pz2 * 5) + Math.sin(ht * 3.3 + s.pz1 * 7)) * n);
    }
    const minX = stmt.areaMin.x, minY = stmt.areaMin.y, minZ = stmt.areaMin.z;
    out.x = minX + (stmt.areaMax.x - minX) * nx;
    out.y = stmt.wanderType === WanderType.Walk ? 0 : minY + (stmt.areaMax.y - minY) * ny;
    out.z = minZ + (stmt.areaMax.z - minZ) * nz;
}
/**
 * Position along a trajectory at `elapsed` seconds. `hz` is cycles per second
 * and `phase` the voice's start offset in cycles; both are the caller's
 * because the live engine draws the phase from its RNG stream.
 */
export function trajectoryPositionInto(stmt, trajectory, elapsed, hz, phase, s, out) {
    const cycle = elapsed * hz + phase;
    const t = stmt.trajectoryOnce ? clamp01(cycle) : cycle % 1;
    const pt = trajectory.evaluate(t, stmt.trajectoryOnce);
    const minX = stmt.areaMin.x, minY = stmt.areaMin.y, minZ = stmt.areaMin.z;
    const rangeX = stmt.areaMax.x - minX, rangeY = stmt.areaMax.y - minY, rangeZ = stmt.areaMax.z - minZ;
    if (stmt.noise > 0) {
        // Per-voice sinusoidal noise: noise 1.0 is a ±50% perturbation, clamped to the box.
        const n = stmt.noise * 0.5;
        const nt = elapsed * 0.7;
        out.x = minX + rangeX * clamp01(pt.x + (Math.sin(nt + s.px1) + Math.sin(nt * 1.7 + s.px2)) * n);
        out.y = minY + rangeY * clamp01(pt.y + (Math.sin(nt * 0.9 + s.py1) + Math.sin(nt * 1.4 + s.py2)) * n);
        out.z = minZ + rangeZ * clamp01(pt.z + (Math.sin(nt * 1.1 + s.pz1) + Math.sin(nt * 1.6 + s.pz2)) * n);
        return;
    }
    out.x = minX + rangeX * pt.x;
    out.y = minY + rangeY * pt.y;
    out.z = minZ + rangeZ * pt.z;
}
//# sourceMappingURL=SpatialPath.js.map