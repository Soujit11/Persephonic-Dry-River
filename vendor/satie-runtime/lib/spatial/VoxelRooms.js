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
const DEFAULT_EROSION_RADIUS = 5;
const DEFAULT_MIN_ROOM_VOXELS = 64;
/**
 * Widest opening that still counts as a DOORWAY rather than as open floor
 * between two parts of one room. Erosion by r voxels pinches off anything
 * narrower than 2r, so this fixes r for a given voxel size — the same number
 * on the main thread and in the worker that actually segments.
 */
export const DOORWAY_MAX_WIDTH_M = 1.5;
/** Erosion radius (voxels) that makes gaps up to DOORWAY_MAX_WIDTH_M portals. */
export function erosionRadiusForVoxel(voxelM) {
    return Math.max(1, Math.round(DOORWAY_MAX_WIDTH_M / (2 * voxelM)));
}
/**
 * Opening widths the wide passes look for, metres. Measured need (2026-09-06,
 * ten Marble worlds hand-labelled from their panoramas): ten of fourteen real
 * openings were wider than the doorway limit — archways and alley mouths
 * around 3 m, a cave mouth around 6 m. Two levels, fine to coarse; each can
 * only find openings between spaces wider than the opening, which is what an
 * opening IS.
 */
export const WIDE_OPENING_WIDTHS_M = [3, 6, 9];
/** A seam may run this much longer than the level's opening width before it is a split, not an opening. */
const SEAM_SPAN_SLACK = 1.5;
/**
 * Longest seam the DOORWAY pass may keep, metres. A doorway's seam is its
 * cross-section — a metre or two — and a tall gate is four. At full
 * resolution on a real collider, isotropic erosion also pinches thin sheets of
 * open air (the sky between rooftops and the grid's top) and hands back two
 * "rooms" meeting along a 16 m seam; that is a split of one space, not a door.
 */
export const DOORWAY_SEAM_MAX_SPAN_M = 5;
export function wideOpeningLevelsForVoxel(voxelM) {
    return WIDE_OPENING_WIDTHS_M.map((w) => ({
        erosionRadius: Math.max(1, Math.round(w / (2 * voxelM))),
        maxSpanM: w * SEAM_SPAN_SLACK,
    }));
}
export const UNLABELLED = 0;
export const SOLID = -1;
export function gridIndex(g, x, y, z) {
    return x + g.nx * (y + g.ny * z);
}
/** Centre of a voxel in world metres. */
export function voxelCentre(g, x, y, z) {
    return {
        x: g.origin.x + x * g.voxelM,
        y: g.origin.y + y * g.voxelM,
        z: g.origin.z + z * g.voxelM,
    };
}
/** The 6 face neighbours. Face connectivity, not 26: two rooms touching only
 * at a corner are not connected, and 26-connectivity would leak through it. */
const NEIGHBOURS = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
/** The 4 horizontal face neighbours — erosion that ignores height. */
const NEIGHBOURS_H = [
    [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
];
function inBounds(g, x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < g.nx && y < g.ny && z < g.nz;
}
/**
 * One erosion pass: a free voxel survives only if all six face neighbours are
 * free. Out-of-bounds counts as solid, so the grid edge erodes inward — the
 * world boundary is a wall. `horizontal` erodes in x and z only: a space's
 * height then never decides whether it survives, which the wide-opening
 * passes need (every indoor room is shorter than a 3 m opening is wide).
 */
export function erodeOnce(g, src, horizontal = false) {
    const out = new Uint8Array(src.length);
    const dirs = horizontal ? NEIGHBOURS_H : NEIGHBOURS;
    for (let z = 0; z < g.nz; z++) {
        for (let y = 0; y < g.ny; y++) {
            for (let x = 0; x < g.nx; x++) {
                const i = gridIndex(g, x, y, z);
                if (!src[i])
                    continue;
                let keep = 1;
                for (const [dx, dy, dz] of dirs) {
                    const nx = x + dx, ny = y + dy, nz = z + dz;
                    if (!inBounds(g, nx, ny, nz) || !src[gridIndex(g, nx, ny, nz)]) {
                        keep = 0;
                        break;
                    }
                }
                out[i] = keep;
            }
        }
    }
    return out;
}
/**
 * Label connected components of a boolean mask, 6-connected. Returns labels in
 * [1..n] for set voxels, 0 elsewhere. Iterative flood fill — a recursive one
 * blows the stack on any real world. With `within`, a component never crosses
 * into a voxel whose `within` value differs from its start voxel's.
 */
export function labelComponents(g, mask, within) {
    const labels = new Int32Array(mask.length);
    let next = 0;
    const stack = [];
    for (let z0 = 0; z0 < g.nz; z0++) {
        for (let y0 = 0; y0 < g.ny; y0++) {
            for (let x0 = 0; x0 < g.nx; x0++) {
                const start = gridIndex(g, x0, y0, z0);
                if (!mask[start] || labels[start])
                    continue;
                next++;
                labels[start] = next;
                stack.length = 0;
                stack.push(x0, y0, z0);
                while (stack.length) {
                    const z = stack.pop(), y = stack.pop(), x = stack.pop();
                    for (const [dx, dy, dz] of NEIGHBOURS) {
                        const nx = x + dx, ny = y + dy, nz = z + dz;
                        if (!inBounds(g, nx, ny, nz))
                            continue;
                        const ni = gridIndex(g, nx, ny, nz);
                        if (!mask[ni] || labels[ni])
                            continue;
                        if (within && within[ni] !== within[start])
                            continue;
                        labels[ni] = next;
                        stack.push(nx, ny, nz);
                    }
                }
            }
        }
    }
    return { labels, count: next };
}
/**
 * Grow labels back into the free space they were eroded from, breadth-first
 * and simultaneously, so every voxel joins the nearest core. Voxels equidistant
 * from two cores are left unlabelled — those are the doorway.
 */
function dilateLabels(g, labels, free, within) {
    const out = Int32Array.from(labels);
    let frontier = [];
    for (let i = 0; i < out.length; i++)
        if (out[i] > 0)
            frontier.push(i);
    while (frontier.length) {
        const next = [];
        // Claims made this round, resolved after it: a voxel reached by two
        // different labels in the SAME round is genuinely between them and must
        // stay unlabelled, or the winner would be decided by iteration order.
        const claim = new Map();
        const contested = new Set();
        for (const i of frontier) {
            const label = out[i];
            const x = i % g.nx;
            const y = Math.floor(i / g.nx) % g.ny;
            const z = Math.floor(i / (g.nx * g.ny));
            for (const [dx, dy, dz] of NEIGHBOURS) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (!inBounds(g, nx, ny, nz))
                    continue;
                const ni = gridIndex(g, nx, ny, nz);
                if (!free[ni] || out[ni] > 0)
                    continue;
                if (within && within[ni] !== within[i])
                    continue;
                const prior = claim.get(ni);
                if (prior === undefined)
                    claim.set(ni, label);
                else if (prior !== label)
                    contested.add(ni);
            }
        }
        for (const [i, label] of claim) {
            if (contested.has(i))
                continue;
            out[i] = label;
            next.push(i);
        }
        frontier = next;
    }
    return out;
}
function principalNormal(points, centroid) {
    // A doorway is thin in exactly one direction. Rather than a full eigen
    // solve, compare variance along the three axes — portals in built geometry
    // are overwhelmingly axis-aligned, and the thin axis IS the normal.
    let vx = 0, vy = 0, vz = 0;
    for (const p of points) {
        vx += (p.x - centroid.x) ** 2;
        vy += (p.y - centroid.y) ** 2;
        vz += (p.z - centroid.z) ** 2;
    }
    if (vx <= vy && vx <= vz)
        return { x: 1, y: 0, z: 0 };
    if (vy <= vx && vy <= vz)
        return { x: 0, y: 1, z: 0 };
    return { x: 0, y: 0, z: 1 };
}
/**
 * Seam voxels between labels, clustered — two kinds, one opening:
 *   (a) free, unclaimed, touching two different labels: the tie voxels
 *       dilation left when two fronts arrived in the same round;
 *   (b) SEAM voxels: labelled, with a face-neighbour of another label.
 *       This is the common case, not the exception. Fronts only tie on
 *       symmetric geometry; on a real world one front reaches the doorway a
 *       round earlier, claims it, and the rooms meet at a seam with no
 *       unclaimed voxel between them. Without (b) the alley of a real Marble
 *       collider segmented into two rooms and zero portals — two spaces that
 *       plainly join, that the graph called sealed.
 * With `within`, only labels inside the same `within` value meet — the
 * wide-opening passes look for seams between sub-rooms of one parent room.
 */
function findSeams(grid, labels, within) {
    // 1. Seam voxels, each with the set of labels it touches.
    const touching = new Map();
    for (let z = 0; z < grid.nz; z++) {
        for (let y = 0; y < grid.ny; y++) {
            for (let x = 0; x < grid.nx; x++) {
                const i = gridIndex(grid, x, y, z);
                if (!grid.free[i])
                    continue;
                const own = labels[i];
                const near = own > 0 ? [own] : [];
                for (const [dx, dy, dz] of NEIGHBOURS) {
                    const nx = x + dx, ny = y + dy, nz = z + dz;
                    if (!inBounds(grid, nx, ny, nz))
                        continue;
                    const ni = gridIndex(grid, nx, ny, nz);
                    if (within && within[ni] !== within[i])
                        continue;
                    const l = labels[ni];
                    if (l > 0 && !near.includes(l))
                        near.push(l);
                }
                if (near.length >= 2)
                    touching.set(i, near.sort((a, b) => a - b));
            }
        }
    }
    // 2. Group by PAIR. A voxel touching three labels belongs to three pairs.
    //    Clustering the seam mask as one blob instead would let a compact
    //    opening (a cave mouth) be swallowed by a long seam it happens to touch
    //    (the roofline) and never be judged on its own.
    const byPair = new Map();
    for (const [i, near] of touching) {
        for (let a = 0; a < near.length; a++)
            for (let b = a + 1; b < near.length; b++) {
                const key = `${near[a]}:${near[b]}`;
                let e = byPair.get(key);
                if (!e) {
                    e = { pair: [near[a], near[b]], voxels: new Set() };
                    byPair.set(key, e);
                }
                e.voxels.add(i);
            }
    }
    // 3. Per pair, connected clusters over that pair's voxels only (sparse BFS).
    const seams = [];
    const layer = grid.nx * grid.ny;
    const offsets = [1, -1, grid.nx, -grid.nx, layer, -layer];
    for (const { pair, voxels } of byPair.values()) {
        const seen = new Set();
        for (const start of voxels) {
            if (seen.has(start))
                continue;
            seen.add(start);
            const stack = [start];
            const points = [];
            const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
            while (stack.length) {
                const i = stack.pop();
                const x = i % grid.nx, y = Math.floor(i / grid.nx) % grid.ny, z = Math.floor(i / layer);
                const q = voxelCentre(grid, x, y, z);
                points.push(q);
                min.x = Math.min(min.x, q.x);
                max.x = Math.max(max.x, q.x);
                min.y = Math.min(min.y, q.y);
                max.y = Math.max(max.y, q.y);
                min.z = Math.min(min.z, q.z);
                max.z = Math.max(max.z, q.z);
                for (let k = 0; k < 6; k++) {
                    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0), nz = z + (k === 4 ? 1 : k === 5 ? -1 : 0);
                    if (!inBounds(grid, nx, ny, nz))
                        continue;
                    const j = i + offsets[k];
                    if (!voxels.has(j) || seen.has(j))
                        continue;
                    seen.add(j);
                    stack.push(j);
                }
            }
            seams.push({ pair, points, spanM: { x: max.x - min.x + grid.voxelM, y: max.y - min.y + grid.voxelM, z: max.z - min.z + grid.voxelM } });
        }
    }
    return seams;
}
/**
 * Split rooms of `labels` wherever `coreMask` holds two or more cores (each a
 * component of the mask confined to one room and to one `coreKey` value) of at
 * least `minCoreVoxels`. Keep a split only where the seam between two halves
 * is compact enough to be an opening — judged per PAIR over the union of its
 * seam clusters, because furniture chops a room-wide seam into small pieces
 * that would each pass — and merge the halves back everywhere else. Returns
 * new labels (ids not contiguous; the caller renumbers) or the input when
 * nothing split.
 */
function splitRooms(grid, labels, coreMask, coreKey, maxSpanM, minCoreVoxels, nextId, single = false) {
    const mask = new Uint8Array(labels.length);
    for (let i = 0; i < mask.length; i++)
        mask[i] = coreMask[i] && labels[i] > 0 ? 1 : 0;
    const { labels: cores, count } = labelComponents(grid, mask, coreKey);
    if (count < (single ? 1 : 2))
        return labels;
    const sizes = new Int32Array(count + 1);
    const parentOf = new Int32Array(count + 1);
    for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        if (c > 0) {
            sizes[c]++;
            parentOf[c] = labels[i];
        }
    }
    const coresPerParent = new Map();
    for (let c = 1; c <= count; c++) {
        if (sizes[c] < minCoreVoxels)
            continue;
        coresPerParent.set(parentOf[c], (coresPerParent.get(parentOf[c]) ?? 0) + 1);
    }
    const splitParents = new Set();
    for (const [parent, n] of coresPerParent)
        if (n >= (single ? 1 : 2))
            splitParents.add(parent);
    if (splitParents.size === 0)
        return labels;
    // Sub-room seeds in the split parents only, then dilation that cannot leave its parent.
    const subId = new Int32Array(count + 1);
    const seeded = new Int32Array(labels.length);
    for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        if (c <= 0 || sizes[c] < minCoreVoxels || !splitParents.has(parentOf[c]))
            continue;
        if (!subId[c])
            subId[c] = ++nextId.value;
        seeded[i] = subId[c];
    }
    const sub = dilateLabels(grid, seeded, grid.free, labels);
    // Per pair, the union extent of every seam cluster between the two halves.
    const pairSpan = new Map();
    for (const seam of findSeams(grid, sub, labels)) {
        const key = `${seam.pair[0]}:${seam.pair[1]}`;
        let e = pairSpan.get(key);
        if (!e) {
            e = { a: seam.pair[0], b: seam.pair[1], min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
            pairSpan.set(key, e);
        }
        for (const q of seam.points) {
            e.min.x = Math.min(e.min.x, q.x);
            e.max.x = Math.max(e.max.x, q.x);
            e.min.y = Math.min(e.min.y, q.y);
            e.max.y = Math.max(e.max.y, q.y);
            e.min.z = Math.min(e.min.z, q.z);
            e.max.z = Math.max(e.max.z, q.z);
        }
    }
    // A seam longer than allowed is a split of one space, not an opening: merge.
    const parentUF = new Map();
    const find = (a) => { let r = a; while (parentUF.get(r) !== undefined && parentUF.get(r) !== r)
        r = parentUF.get(r); parentUF.set(a, r); return r; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb)
        parentUF.set(ra, rb); };
    for (const e of pairSpan.values()) {
        const span = Math.max(e.max.x - e.min.x, e.max.y - e.min.y, e.max.z - e.min.z) + grid.voxelM;
        if (span > maxSpanM)
            union(e.a, e.b);
    }
    // New labels: sub-rooms (merged where the seam was rejected) replace their parent.
    const out = Int32Array.from(labels);
    for (let i = 0; i < out.length; i++) {
        if (!splitParents.has(labels[i]))
            continue;
        out[i] = sub[i] > 0 ? find(sub[i]) : 0;
    }
    // Tie voxels between halves that merged back belong to the merged room; tie
    // voxels between halves that stayed apart are the opening (left 0).
    for (let round = 0; round < 4; round++) {
        let changed = false;
        for (let z = 0; z < grid.nz; z++)
            for (let y = 0; y < grid.ny; y++)
                for (let x = 0; x < grid.nx; x++) {
                    const i = gridIndex(grid, x, y, z);
                    if (!grid.free[i] || out[i] !== 0 || !splitParents.has(labels[i]))
                        continue;
                    let only = 0, mixed = false;
                    for (const [dx, dy, dz] of NEIGHBOURS) {
                        const nx = x + dx, ny = y + dy, nz = z + dz;
                        if (!inBounds(grid, nx, ny, nz))
                            continue;
                        const ni = gridIndex(grid, nx, ny, nz);
                        if (labels[ni] !== labels[i])
                            continue;
                        const l = out[ni];
                        if (l <= 0)
                            continue;
                        if (only === 0)
                            only = l;
                        else if (only !== l) {
                            mixed = true;
                            break;
                        }
                    }
                    if (only && !mixed) {
                        out[i] = only;
                        changed = true;
                    }
                }
        if (!changed)
            break;
    }
    return out;
}
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
export function segmentRooms(grid, options = {}) {
    const erosionRadius = options.erosionRadius ?? DEFAULT_EROSION_RADIUS;
    const minRoomVoxels = options.minRoomVoxels ?? DEFAULT_MIN_ROOM_VOXELS;
    const levels = options.wideOpenings === false ? [] : (options.wideOpenings ?? wideOpeningLevelsForVoxel(grid.voxelM));
    // 1. Erode until doorways pinch off.
    let eroded = grid.free;
    for (let i = 0; i < erosionRadius; i++)
        eroded = erodeOnce(grid, eroded);
    // 2 + 3. Label the surviving cores and grow them back out — the same
    //        validated split as every later pass, applied to the whole free
    //        space as one parent. No core at all (erosion consumed everything)
    //        means no rooms.
    const whole = new Int32Array(grid.free.length);
    for (let i = 0; i < whole.length; i++)
        whole[i] = grid.free[i];
    const ids = { value: 1 };
    let labels = splitRooms(grid, whole, eroded, whole, DOORWAY_SEAM_MAX_SPAN_M, minRoomVoxels, ids, true);
    const nextId = ids.value;
    if (nextId === 1 && labels === whole)
        labels = new Int32Array(grid.free.length);
    // 3b. Wide openings, fine to coarse. Horizontal erosion is cumulative, so
    //     each level continues from the last rather than starting over.
    if (levels.length && nextId > 1) {
        const ordered = [...levels].sort((a, b) => a.erosionRadius - b.erosionRadius);
        let erodedH = grid.free;
        let radius = 0;
        for (const level of ordered) {
            for (; radius < level.erosionRadius; radius++)
                erodedH = erodeOnce(grid, erodedH, true);
            labels = splitRooms(grid, labels, erodedH, labels, level.maxSpanM, minRoomVoxels, ids);
        }
    }
    {
        // Renumber contiguously, in order of first appearance.
        const remap = new Map();
        for (let i = 0; i < labels.length; i++) {
            const l = labels[i];
            if (l <= 0)
                continue;
            let m = remap.get(l);
            if (m === undefined) {
                m = remap.size + 1;
                remap.set(l, m);
            }
            labels[i] = m;
        }
    }
    // 4. Accumulate room statistics.
    const voxelVol = grid.voxelM ** 3;
    const acc = new Map();
    for (let i = 0; i < labels.length; i++) {
        const l = labels[i];
        if (l <= 0)
            continue;
        const x = i % grid.nx;
        const y = Math.floor(i / grid.nx) % grid.ny;
        const z = Math.floor(i / (grid.nx * grid.ny));
        const c = voxelCentre(grid, x, y, z);
        let a = acc.get(l);
        if (!a) {
            a = { n: 0, sx: 0, sy: 0, sz: 0, min: { ...c }, max: { ...c } };
            acc.set(l, a);
        }
        a.n++;
        a.sx += c.x;
        a.sy += c.y;
        a.sz += c.z;
        a.min.x = Math.min(a.min.x, c.x);
        a.max.x = Math.max(a.max.x, c.x);
        a.min.y = Math.min(a.min.y, c.y);
        a.max.y = Math.max(a.max.y, c.y);
        a.min.z = Math.min(a.min.z, c.z);
        a.max.z = Math.max(a.max.z, c.z);
    }
    const rooms = [...acc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, a]) => ({
        id,
        voxelCount: a.n,
        volumeM3: a.n * voxelVol,
        centroid: { x: a.sx / a.n, y: a.sy / a.n, z: a.sz / a.n },
        minM: a.min,
        maxM: a.max,
    }));
    // 5. Portals: every seam between the final rooms — one cluster, one opening.
    const portals = [];
    for (const seam of findSeams(grid, labels)) {
        const pts = seam.points;
        const centroid = pts.reduce((a, q) => ({ x: a.x + q.x / pts.length, y: a.y + q.y / pts.length, z: a.z + q.z / pts.length }), { x: 0, y: 0, z: 0 });
        const normal = principalNormal(pts, centroid);
        // Extents in the two axes that are NOT the normal.
        const axes = ['x', 'y', 'z'].filter((a) => normal[a] === 0);
        const spans = axes.map((a) => seam.spanM[a]);
        const extentM = { x: grid.voxelM, y: grid.voxelM, z: grid.voxelM };
        axes.forEach((a, i) => { extentM[a] = spans[i]; });
        portals.push({
            id: portals.length + 1,
            rooms: seam.pair,
            centroid,
            normal,
            widthM: Math.max(spans[0], spans[1]),
            heightM: Math.min(spans[0], spans[1]),
            areaM2: spans[0] * spans[1],
            voxelCount: pts.length,
            extentM,
        });
    }
    return { rooms, portals, labels };
}
//# sourceMappingURL=VoxelRooms.js.map