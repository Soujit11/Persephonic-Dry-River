/**
 * Triangle soup → occupancy grid of REACHABLE free space, for `segmentRooms`.
 *
 * The three.js-free half of `lib/colliderVoxels.ts`, split out so the whole
 * room-graph build (voxelize → erode → label → dilate) can run in a Web
 * Worker: a 2M-voxel world takes long enough that doing it on the main
 * thread would freeze the viewport for a beat just as the world appears.
 * Workers cannot receive an Object3D; they can receive a Float32Array.
 *
 * The subtlety is that Marble colliders are **open shells, not closed
 * manifolds**: reconstructions with holes, missing floors and one-sided
 * geometry. Every textbook voxelizer decides "inside" by ray parity, and on an
 * open shell that answer is noise — a ray escaping through a hole flips the
 * whole column of voxels. So free space is not "inside the mesh" but
 * **"reachable from where the listener actually stands"**: mark the surfaces
 * solid, then flood fill outward from a seed. For acoustics that definition is
 * the correct one, not a workaround — a sealed void the listener can never
 * occupy is not part of their room, whatever the geometry says.
 *
 * Surfaces are marked by sampling each triangle rather than by an exact
 * triangle/box overlap test. Slight over-marking is a FEATURE: it thickens
 * walls into watertight barriers, and a flood fill that leaks through a
 * one-voxel crack merges two rooms into one and silently destroys the whole
 * segmentation downstream.
 */
import { type VoxelGrid } from './VoxelRooms';
export interface VoxelizeOptions {
    /** Target edge length of a voxel, metres. Coarsened if the grid is too big. */
    voxelM?: number;
    /**
     * World point known to be in free space — the listener's own position. The
     * flood fill starts here, which is what makes "free" mean "reachable".
     */
    seed?: {
        x: number;
        y: number;
        z: number;
    };
    /** Padding around the geometry bounds, metres. */
    marginM?: number;
    /** Hard ceiling on total voxels; voxelM is coarsened until the grid fits. */
    maxVoxels?: number;
    /**
     * How far from the seed the grid reaches, metres: horizontal half-extent,
     * and separately up and down. A Marble collider carries a far shell 60 m
     * out; gridding all of it blew the voxel cap and coarsened the alley to
     * 0.84 m voxels, where a doorway is one voxel and cannot exist. Rooms and
     * portals are a local question — what can this listener walk through — so
     * the grid stops here and the world beyond it is out of bounds (solid).
     */
    reachM?: number;
    reachUpM?: number;
    reachDownM?: number;
}
export interface VoxelizeResult {
    grid: VoxelGrid;
    /** Actual voxel size used — larger than requested if the grid was coarsened. */
    voxelM: number;
    /** True when `maxVoxels` forced a coarser grid than asked for. */
    coarsened: boolean;
    /** Voxels reachable from the seed. */
    freeCount: number;
    /** Triangles sampled. Zero means the geometry was empty. */
    triangleCount: number;
}
export declare const DEFAULT_VOXEL_M = 0.25;
/** Grid reach around the seed (see VoxelizeOptions.reachM). 20 m out, 12 m up,
 * 6 m down at 0.25 m is ~1.8 M voxels — inside the cap, at full resolution. */
export declare const DEFAULT_REACH_M = 20;
export declare const DEFAULT_REACH_UP_M = 12;
export declare const DEFAULT_REACH_DOWN_M = 6;
/**
 * Voxelize world-space triangles (9 floats each: ax ay az bx by bz cx cy cz)
 * into a grid of reachable free space.
 *
 * Returns null when there is no geometry, or when the seed lands inside
 * solid geometry (the listener is buried — better to report nothing than to
 * flood fill from an arbitrary substitute point and hand back a confident,
 * wrong room graph).
 */
export declare function voxelizeTriangles(triangles: Float32Array, options?: VoxelizeOptions): VoxelizeResult | null;
//# sourceMappingURL=VoxelizeTriangles.d.ts.map