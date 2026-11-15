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
import { gridIndex } from './VoxelRooms';
export const DEFAULT_VOXEL_M = 0.25;
const DEFAULT_MARGIN_M = 1;
/** Grid reach around the seed (see VoxelizeOptions.reachM). 20 m out, 12 m up,
 * 6 m down at 0.25 m is ~1.8 M voxels — inside the cap, at full resolution. */
export const DEFAULT_REACH_M = 20;
export const DEFAULT_REACH_UP_M = 12;
export const DEFAULT_REACH_DOWN_M = 6;
/** ~2M voxels: a 40 m world at 0.25 m fits; anything wilder coarsens. */
const DEFAULT_MAX_VOXELS = 2_000_000;
const NEIGHBOURS = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
/**
 * Mark every voxel a triangle passes through, by sampling its surface at
 * roughly half-voxel spacing in barycentric coordinates.
 */
function markTriangle(solid, g, origin, voxelM, tri, o) {
    const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
    const bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5];
    const cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
    const ab = Math.hypot(bx - ax, by - ay, bz - az);
    const ac = Math.hypot(cx - ax, cy - ay, cz - az);
    const bc = Math.hypot(cx - bx, cy - by, cz - bz);
    const steps = Math.max(2, Math.ceil((2 * Math.max(ab, ac, bc)) / voxelM));
    for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
            const u = i / steps;
            const v = j / steps;
            const w = 1 - u - v;
            const px = ax * w + bx * u + cx * v;
            const py = ay * w + by * u + cy * v;
            const pz = az * w + bz * u + cz * v;
            const x = Math.round((px - origin.x) / voxelM);
            const y = Math.round((py - origin.y) / voxelM);
            const z = Math.round((pz - origin.z) / voxelM);
            if (x < 0 || y < 0 || z < 0 || x >= g.nx || y >= g.ny || z >= g.nz)
                continue;
            solid[gridIndex(g, x, y, z)] = 1;
        }
    }
}
/**
 * Voxelize world-space triangles (9 floats each: ax ay az bx by bz cx cy cz)
 * into a grid of reachable free space.
 *
 * Returns null when there is no geometry, or when the seed lands inside
 * solid geometry (the listener is buried — better to report nothing than to
 * flood fill from an arbitrary substitute point and hand back a confident,
 * wrong room graph).
 */
export function voxelizeTriangles(triangles, options = {}) {
    const triangleCount = Math.floor(triangles.length / 9);
    if (triangleCount === 0)
        return null;
    const margin = options.marginM ?? DEFAULT_MARGIN_M;
    const maxVoxels = options.maxVoxels ?? DEFAULT_MAX_VOXELS;
    const seed = options.seed ?? { x: 0, y: 1.6, z: 0 };
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < triangleCount * 9; i += 3) {
        const x = triangles[i], y = triangles[i + 1], z = triangles[i + 2];
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
    if (!Number.isFinite(minX))
        return null;
    minX -= margin;
    minY -= margin;
    minZ -= margin;
    maxX += margin;
    maxY += margin;
    maxZ += margin;
    // The listener must be inside the grid even if they stand outside the mesh.
    minX = Math.min(minX, seed.x);
    maxX = Math.max(maxX, seed.x);
    minY = Math.min(minY, seed.y);
    maxY = Math.max(maxY, seed.y);
    minZ = Math.min(minZ, seed.z);
    maxZ = Math.max(maxZ, seed.z);
    // ...and no further from the listener than the reach.
    const reach = options.reachM ?? DEFAULT_REACH_M;
    const up = options.reachUpM ?? DEFAULT_REACH_UP_M;
    const down = options.reachDownM ?? DEFAULT_REACH_DOWN_M;
    minX = Math.max(minX, seed.x - reach);
    maxX = Math.min(maxX, seed.x + reach);
    minZ = Math.max(minZ, seed.z - reach);
    maxZ = Math.min(maxZ, seed.z + reach);
    minY = Math.max(minY, seed.y - down);
    maxY = Math.min(maxY, seed.y + up);
    const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    let voxelM = options.voxelM ?? DEFAULT_VOXEL_M;
    let coarsened = false;
    const dims = () => ({
        nx: Math.max(1, Math.ceil(size.x / voxelM) + 1),
        ny: Math.max(1, Math.ceil(size.y / voxelM) + 1),
        nz: Math.max(1, Math.ceil(size.z / voxelM) + 1),
    });
    // Coarsen rather than allocate gigabytes. A too-large world still gets a
    // usable segmentation, just at lower resolution — and the caller is told.
    let d = dims();
    while (d.nx * d.ny * d.nz > maxVoxels) {
        voxelM *= 1.5;
        coarsened = true;
        d = dims();
    }
    const origin = { x: minX, y: minY, z: minZ };
    const g = { nx: d.nx, ny: d.ny, nz: d.nz };
    const solid = new Uint8Array(d.nx * d.ny * d.nz);
    // 1. Rasterize every triangle into the occupancy grid.
    for (let t = 0; t < triangleCount; t++)
        markTriangle(solid, g, origin, voxelM, triangles, t * 9);
    // 2. Flood fill free space from the seed. "Free" means REACHABLE — the only
    //    definition that survives an open shell.
    const sx = Math.round((seed.x - origin.x) / voxelM);
    const sy = Math.round((seed.y - origin.y) / voxelM);
    const sz = Math.round((seed.z - origin.z) / voxelM);
    if (sx < 0 || sy < 0 || sz < 0 || sx >= d.nx || sy >= d.ny || sz >= d.nz)
        return null;
    const seedIndex = gridIndex(g, sx, sy, sz);
    if (solid[seedIndex])
        return null; // listener is inside geometry
    const free = new Uint8Array(solid.length);
    free[seedIndex] = 1;
    let freeCount = 1;
    const stack = [sx, sy, sz];
    while (stack.length) {
        const z = stack.pop(), y = stack.pop(), x = stack.pop();
        for (const [dx, dy, dz] of NEIGHBOURS) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            if (nx < 0 || ny < 0 || nz < 0 || nx >= d.nx || ny >= d.ny || nz >= d.nz)
                continue;
            const ni = gridIndex(g, nx, ny, nz);
            if (solid[ni] || free[ni])
                continue;
            free[ni] = 1;
            freeCount++;
            stack.push(nx, ny, nz);
        }
    }
    return {
        grid: { nx: d.nx, ny: d.ny, nz: d.nz, voxelM, origin, free },
        voxelM,
        coarsened,
        freeCount,
        triangleCount,
    };
}
//# sourceMappingURL=VoxelizeTriangles.js.map