/**
 * Rooms and portals from an occupancy grid — cell-and-portal decomposition by
 * morphological opening and flood fill.
 *
 * No shipped tool does this. Wwise's rooms-and-portals is the canonical model
 * and its portals are hand-placed; Steam Audio has no rooms-and-portals
 * abstraction at all (it precomputes pathing between probes instead); SpatialLM
 * and Meta's SceneScript both emit doors and windows as structured language but
 * ship CC-BY-NC and academic-only weights respectively. So this is the one
 * piece of the acoustic scene graph with no reference implementation to check
 * against — which is also why it is worth owning.
 *
 * The algorithm is old and well grounded (morphological room segmentation of
 * 3D laser data; GPU-voxelization cell-portal graphs for navmeshes):
 *
 *   1. ERODE the free space. Narrow connections — doorways — vanish first.
 *   2. LABEL the connected components that survive. Those are room cores.
 *   3. DILATE the labels back out. Cores reclaim their rooms but cannot merge,
 *      because a voxel only joins a label it can reach without crossing another.
 *   4. Whatever is left over — free space adjacent to two different labels —
 *      is a PORTAL, by construction. The doorway is not detected; it is the
 *      residue of separating the rooms.
 *
 * Deliberately pure: it takes a boolean grid, not a mesh. The algorithm is
 * where the difficulty and the tests live, and keeping three.js out means the
 * whole thing runs in CI on synthetic grids whose right answers are known by
 * construction. Mesh sampling is a separate, much dumber problem.
 */
export interface VoxelGrid {
    nx: number;
    ny: number;
    nz: number;
    /** Edge length of one voxel, metres. */
    voxelM: number;
    /** World position of the centre of voxel (0,0,0). */
    origin: {
        x: number;
        y: number;
        z: number;
    };
    /** 1 = free space, 0 = solid or outside. Length nx*ny*nz, x fastest. */
    free: Uint8Array;
}
export interface VoxelRoom {
    id: number;
    voxelCount: number;
    volumeM3: number;
    centroid: {
        x: number;
        y: number;
        z: number;
    };
    minM: {
        x: number;
        y: number;
        z: number;
    };
    maxM: {
        x: number;
        y: number;
        z: number;
    };
}
export interface VoxelPortal {
    id: number;
    /** The two room ids this portal connects (ascending). */
    rooms: [number, number];
    centroid: {
        x: number;
        y: number;
        z: number;
    };
    /** Unit normal — the thin axis of the opening, i.e. what you walk through. */
    normal: {
        x: number;
        y: number;
        z: number;
    };
    /** Extents in the portal plane, metres. */
    widthM: number;
    heightM: number;
    areaM2: number;
    voxelCount: number;
    /**
     * Full span along each world axis, metres — the opening as a box. The thin
     * (normal) axis is one voxel. Diffraction needs the rectangle, not just its
     * two lengths: which axis is the wide one decides where a sound can pass.
     */
    extentM: {
        x: number;
        y: number;
        z: number;
    };
}
export interface SegmentationOptions {
    /**
     * Erosion radius in voxels. Sets the width of connection that counts as a
     * doorway rather than as open floor: anything narrower than 2·r voxels is
     * pinched off and becomes a portal. At 0.1 m voxels, r = 5 makes a 1 m gap
     * a doorway and a 2 m gap an opening between parts of one room.
     */
    erosionRadius?: number;
    /** Discard components smaller than this many voxels (measurement noise). */
    minRoomVoxels?: number;
    /**
     * Coarser passes that find WIDE openings — an archway, a cave mouth, the
     * passage past a café's glass partition — between spaces larger than the
     * opening. Default: `wideOpeningLevelsForVoxel(grid.voxelM)`; `false`
     * disables them (the doorway pass alone).
     */
    wideOpenings?: WideOpeningLevel[] | false;
}
/**
 * One wide-opening level: horizontal erosion by `erosionRadius` voxels pinches
 * any gap narrower than 2·r between spaces wider than 2·r, and a seam whose
 * longest extent exceeds `maxSpanM` is NOT an opening but an arbitrary split of
 * one space (the sky over an alley, cut at the roofline) — its two sides are
 * merged back.
 */
export interface WideOpeningLevel {
    erosionRadius: number;
    maxSpanM: number;
}
/**
 * Widest opening that still counts as a DOORWAY rather than as open floor
 * between two parts of one room. Erosion by r voxels pinches off anything
 * narrower than 2r, so this fixes r for a given voxel size — the same number
 * on the main thread and in the worker that actually segments.
 */
export declare const DOORWAY_MAX_WIDTH_M = 1.5;
/** Erosion radius (voxels) that makes gaps up to DOORWAY_MAX_WIDTH_M portals. */
export declare function erosionRadiusForVoxel(voxelM: number): number;
/**
 * Opening widths the wide passes look for, metres. Measured need (2026-09-06,
 * ten Marble worlds hand-labelled from their panoramas): ten of fourteen real
 * openings were wider than the doorway limit — archways and alley mouths
 * around 3 m, a cave mouth around 6 m. Two levels, fine to coarse; each can
 * only find openings between spaces wider than the opening, which is what an
 * opening IS.
 */
export declare const WIDE_OPENING_WIDTHS_M: readonly number[];
/**
 * Longest seam the DOORWAY pass may keep, metres. A doorway's seam is its
 * cross-section — a metre or two — and a tall gate is four. At full
 * resolution on a real collider, isotropic erosion also pinches thin sheets of
 * open air (the sky between rooftops and the grid's top) and hands back two
 * "rooms" meeting along a 16 m seam; that is a split of one space, not a door.
 */
export declare const DOORWAY_SEAM_MAX_SPAN_M = 5;
export declare function wideOpeningLevelsForVoxel(voxelM: number): WideOpeningLevel[];
export declare const UNLABELLED = 0;
export declare const SOLID = -1;
export declare function gridIndex(g: {
    nx: number;
    ny: number;
}, x: number, y: number, z: number): number;
/** Centre of a voxel in world metres. */
export declare function voxelCentre(g: VoxelGrid, x: number, y: number, z: number): {
    x: number;
    y: number;
    z: number;
};
/**
 * One erosion pass: a free voxel survives only if all six face neighbours are
 * free. Out-of-bounds counts as solid, so the grid edge erodes inward — the
 * world boundary is a wall. `horizontal` erodes in x and z only: a space's
 * height then never decides whether it survives, which the wide-opening
 * passes need (every indoor room is shorter than a 3 m opening is wide).
 */
export declare function erodeOnce(g: VoxelGrid, src: Uint8Array, horizontal?: boolean): Uint8Array;
/**
 * Label connected components of a boolean mask, 6-connected. Returns labels in
 * [1..n] for set voxels, 0 elsewhere. Iterative flood fill — a recursive one
 * blows the stack on any real world. With `within`, a component never crosses
 * into a voxel whose `within` value differs from its start voxel's.
 */
export declare function labelComponents(g: VoxelGrid, mask: Uint8Array, within?: Int32Array): {
    labels: Int32Array;
    count: number;
};
/**
 * Segment an occupancy grid into rooms connected by portals.
 *
 * Portals fall out of the separation rather than being searched for: they are
 * the free voxels that no room core could claim, adjacent to two different
 * rooms. A doorway is by definition the place two rooms meet and neither owns.
 *
 * Two scales. The doorway pass (isotropic erosion by `erosionRadius`) finds
 * openings up to DOORWAY_MAX_WIDTH_M. The wide-opening passes then re-split
 * each room with horizontal erosion at the `wideOpenings` levels, keeping a
 * split only where the seam is compact (an archway, a cave mouth) and merging
 * it back where it is long (the sky over an alley cut at the roofline). Every
 * seam between the final rooms is a portal.
 */
export declare function segmentRooms(grid: VoxelGrid, options?: SegmentationOptions): {
    rooms: VoxelRoom[];
    portals: VoxelPortal[];
    labels: Int32Array;
};
//# sourceMappingURL=VoxelRooms.d.ts.map