/**
 * Where a moving voice is at a moment: the sum-of-sines wander and the
 * trajectory (spiral/orbit/lorenz/path) evaluation, written into a caller's
 * vector so the live tick allocates nothing. The live engine and the offline
 * renderer both call these, so an exported render moves exactly as playback did.
 */
import { Statement, type Vec3 } from '../core/Statement.js';
import { getTrajectory } from './Trajectories.js';
export type Trajectory = NonNullable<ReturnType<typeof getTrajectory>>;
/** Per-voice phase offsets derived from its motion seed; drawn once at spawn. */
export interface PathSeeds {
    px1: number;
    px2: number;
    py1: number;
    py2: number;
    pz1: number;
    pz2: number;
}
export declare function pathSeedsFor(seed: number): PathSeeds;
/** The trajectory a statement moves on: a compiled `path`, a custom LUT, or a builtin. */
export declare function resolveTrajectory(stmt: Statement): Trajectory | undefined;
/** Walk/fly wander: a seeded sum of sines inside the voice's area box (walk stays on the ground). */
export declare function wanderPositionInto(stmt: Statement, elapsed: number, wanderSpeed: number, s: PathSeeds, out: Vec3): void;
/**
 * Position along a trajectory at `elapsed` seconds. `hz` is cycles per second
 * and `phase` the voice's start offset in cycles; both are the caller's
 * because the live engine draws the phase from its RNG stream.
 */
export declare function trajectoryPositionInto(stmt: Statement, trajectory: Trajectory, elapsed: number, hz: number, phase: number, s: PathSeeds, out: Vec3): void;
//# sourceMappingURL=SpatialPath.d.ts.map