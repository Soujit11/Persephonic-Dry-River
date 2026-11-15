/**
 * Diffraction as portal redirect — where a sound comes FROM when a wall is in
 * the way.
 *
 * Geometry occlusion (the collider raycast) answers "is something between
 * me and the source" and muffles accordingly. It leaves the source panned at
 * its true position — behind the wall — so a kettle in the next room is heard
 * *through* the plaster, quieter, at the kettle's bearing. That is not what
 * ears report. Sound bends around the edges of an opening, and the listener
 * hears the doorway: the source appears AT the aperture, farther away than it
 * is (the path is longer), and muffled in proportion to how far the wave had
 * to turn to reach them.
 *
 * This module computes that from the cell-and-portal graph `VoxelRooms`
 * already segments:
 *
 *   1. Which room is the listener in, which room is the source in (`roomAt`).
 *      Same room → no diffraction, the raycast alone is the truth.
 *   2. The shortest chain of portals joining the two rooms — Dijkstra over
 *      portals, metric through their centroids. Scenes have a handful of
 *      doorways, so this is cheap enough to run per voice at the raycast rate.
 *   3. String-pulling: each crossing slides within its portal's rectangle to
 *      where the path from the previous point to the next one actually passes,
 *      iterated a few times. Centroids alone put every path through the middle
 *      of the door; this puts it through the edge the sound really bends round.
 *   4. The APPARENT source: the direction of the first crossing, at the full
 *      path length. The panner sits there; distance attenuation therefore
 *      follows the path the sound travelled, not the wall-piercing chord.
 *   5. The total BEND — the sum of turn angles along the path — mapped onto
 *      the engine's existing occlusion scalar (`diffractionOcclusion01`): a
 *      straight sight line through the door is transparent, a full turn
 *      around a corner is a heavy muffle, and a wall with no route stays
 *      whatever the raycast said.
 *
 * Nothing here traces rays. Pathing on a room graph is the model Wwise ships
 * (rooms-and-portals) and the one game audio has trusted for twenty years;
 * a full propagation solver would buy accuracy on geometry Marble
 * reconstructions do not have. Pure math: no three.js, no Web Audio.
 */
import { gridIndex } from './VoxelRooms.js';
import { clamp01 } from '../core/math.js';
/**
 * Smallest opening a sound is heard FROM, metres, on its narrower side.
 * Marble colliders are reconstructions: their shells have cracks, and the
 * segmentation faithfully reports every crack that joins two pockets of
 * free space as a "portal" (0.5 × 0.3 m holes on a real café). A crack is
 * not a doorway — nothing localizes to it — so the graph drops portals
 * narrower than this and the two spaces count as unjoined: no redirect, and
 * the raycast (which sees the wall) decides. Open windows and doorways pass.
 */
export const MIN_PORTAL_M = 0.5;
export function buildRoomGraph(grid, labels, rooms, allPortals, minPortalM = MIN_PORTAL_M) {
    const portals = allPortals.filter((p) => Math.min(p.widthM, p.heightM) >= minPortalM);
    const adjacency = new Map();
    portals.forEach((p, i) => {
        for (const r of p.rooms) {
            const list = adjacency.get(r);
            if (list)
                list.push(i);
            else
                adjacency.set(r, [i]);
        }
    });
    return { grid, labels, rooms, portals, adjacency };
}
/**
 * How far (in voxels) to look for a labelled voxel around a point that lands
 * on none — a source mounted ON a wall sits in a solid voxel, a listener in a
 * doorway stands on portal voxels. Three voxels is 0.75 m at the default
 * resolution: enough to reach the room a wall-mounted voice belongs to,
 * not enough to reach through the wall into the room behind it.
 */
export const ROOM_SEARCH_RADIUS_VOXELS = 3;
/**
 * The room a world point is in, or 0 when no room is within reach (outside
 * the grid's margin, or deep in solid geometry).
 */
export function roomAt(graph, p) {
    const g = graph.grid;
    const cx = clampInt(Math.round((p.x - g.origin.x) / g.voxelM), 0, g.nx - 1);
    const cy = clampInt(Math.round((p.y - g.origin.y) / g.voxelM), 0, g.ny - 1);
    const cz = clampInt(Math.round((p.z - g.origin.z) / g.voxelM), 0, g.nz - 1);
    const direct = graph.labels[gridIndex(g, cx, cy, cz)];
    if (direct > 0)
        return direct;
    let best = 0;
    let bestD = Infinity;
    const R = ROOM_SEARCH_RADIUS_VOXELS;
    for (let dz = -R; dz <= R; dz++) {
        const z = cz + dz;
        if (z < 0 || z >= g.nz)
            continue;
        for (let dy = -R; dy <= R; dy++) {
            const y = cy + dy;
            if (y < 0 || y >= g.ny)
                continue;
            for (let dx = -R; dx <= R; dx++) {
                const x = cx + dx;
                if (x < 0 || x >= g.nx)
                    continue;
                const l = graph.labels[gridIndex(g, x, y, z)];
                if (l <= 0)
                    continue;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < bestD) {
                    bestD = d;
                    best = l;
                }
            }
        }
    }
    return best;
}
/**
 * Shortest chain of portals from the listener's room to the source's room,
 * as indices into `graph.portals`. Dijkstra over (portal, room-entered)
 * states with centroid-to-centroid metric costs. Null when no route exists —
 * the source is sealed away, and that is the raycast's case, not ours.
 */
export function shortestPortalChain(graph, listener, listenerRoom, source, sourceRoom) {
    const start = graph.adjacency.get(listenerRoom);
    if (!start || start.length === 0)
        return null;
    const open = [];
    const settled = new Set();
    for (const pi of start) {
        const p = graph.portals[pi];
        const far = p.rooms[0] === listenerRoom ? p.rooms[1] : p.rooms[0];
        open.push({ portal: pi, room: far, dist: distance(listener, p.centroid), prev: null });
    }
    let best = null;
    let bestTotal = Infinity;
    while (open.length) {
        // Small frontier — a linear extract-min beats a heap's constant here.
        let mi = 0;
        for (let i = 1; i < open.length; i++)
            if (open[i].dist < open[mi].dist)
                mi = i;
        const node = open[mi];
        open[mi] = open[open.length - 1];
        open.pop();
        if (node.dist >= bestTotal)
            break;
        const key = `${node.portal}|${node.room}`;
        if (settled.has(key))
            continue;
        settled.add(key);
        if (node.room === sourceRoom) {
            const total = node.dist + distance(graph.portals[node.portal].centroid, source);
            if (total < bestTotal) {
                bestTotal = total;
                best = node;
            }
            continue;
        }
        const next = graph.adjacency.get(node.room);
        if (!next)
            continue;
        const from = graph.portals[node.portal].centroid;
        for (const qi of next) {
            if (qi === node.portal)
                continue;
            const q = graph.portals[qi];
            const far = q.rooms[0] === node.room ? q.rooms[1] : q.rooms[0];
            if (settled.has(`${qi}|${far}`))
                continue;
            open.push({ portal: qi, room: far, dist: node.dist + distance(from, q.centroid), prev: node });
        }
    }
    if (!best)
        return null;
    const chain = [];
    for (let n = best; n; n = n.prev)
        chain.push(n.portal);
    return chain.reverse();
}
/** How far inside the opening's edge a crossing stays, metres. */
const PORTAL_EDGE_INSET_M = 0.15;
/** String-pulling rounds. Converges in two on real doorways; three is safe. */
const PULL_ROUNDS = 3;
/**
 * Where the path from `prev` to `next` crosses this portal: the segment's
 * intersection with the portal plane (or the nearer endpoint's projection
 * when it never reaches the plane), clamped into the opening's rectangle.
 */
function crossingPoint(portal, prev, next, out) {
    const axis = normalAxis(portal.normal);
    const c = portal.centroid;
    const pn = prev[axis], nn = next[axis], cn = c[axis];
    let t;
    const denom = nn - pn;
    if (Math.abs(denom) < 1e-6)
        t = 0;
    else
        t = clamp01((cn - pn) / denom);
    out.x = prev.x + (next.x - prev.x) * t;
    out.y = prev.y + (next.y - prev.y) * t;
    out.z = prev.z + (next.z - prev.z) * t;
    for (const a of ['x', 'y', 'z']) {
        if (a === axis) {
            out[a] = cn;
            continue;
        }
        const half = Math.max(0, portal.extentM[a] / 2 - Math.min(PORTAL_EDGE_INSET_M, portal.extentM[a] / 4));
        const lo = c[a] - half, hi = c[a] + half;
        out[a] = out[a] < lo ? lo : out[a] > hi ? hi : out[a];
    }
    return out;
}
/**
 * Resolve how a source in another room reaches the listener. Null when the
 * two share a room (nothing to bend around), when either point is in no
 * room, or when no chain of portals joins them.
 */
export function resolveDiffraction(graph, listener, source) {
    if (graph.portals.length === 0)
        return null;
    const lr = roomAt(graph, listener);
    if (lr === 0)
        return null;
    const sr = roomAt(graph, source);
    if (sr === 0 || sr === lr)
        return null;
    const chain = shortestPortalChain(graph, listener, lr, source, sr);
    if (!chain || chain.length === 0)
        return null;
    const crossings = chain.map((pi) => ({ ...graph.portals[pi].centroid }));
    for (let round = 0; round < PULL_ROUNDS; round++) {
        for (let i = 0; i < crossings.length; i++) {
            const prev = i === 0 ? listener : crossings[i - 1];
            const next = i === crossings.length - 1 ? source : crossings[i + 1];
            crossingPoint(graph.portals[chain[i]], prev, next, crossings[i]);
        }
    }
    const points = [{ ...listener }, ...crossings, { ...source }];
    let lengthM = 0;
    let bendRad = 0;
    for (let i = 1; i < points.length; i++)
        lengthM += distance(points[i - 1], points[i]);
    for (let i = 1; i < points.length - 1; i++) {
        bendRad += turnAngle(points[i - 1], points[i], points[i + 1]);
    }
    // Bearing of the first crossing the listener can actually resolve — a
    // listener standing IN the doorway has a zero-length first leg.
    let dir = null;
    for (let i = 1; i < points.length; i++) {
        const d = distance(listener, points[i]);
        if (d > 1e-3) {
            dir = { x: (points[i].x - listener.x) / d, y: (points[i].y - listener.y) / d, z: (points[i].z - listener.z) / d };
            break;
        }
    }
    if (!dir)
        return null; // listener and source coincide
    const apparent = {
        x: listener.x + dir.x * lengthM,
        y: listener.y + dir.y * lengthM,
        z: listener.z + dir.z * lengthM,
    };
    return { points, lengthM, apparent, bendRad, portalIds: chain.map((pi) => graph.portals[pi].id) };
}
/**
 * Occlusion a path this bent should read as, on the engine's 0–1 scale
 * (`occlusionCutoffHz` / `occlusionGain` in WorldAcoustics). Ceiling below
 * a wall's 1.0 on purpose: a doorway always lets more through than plaster.
 *
 * A perceptual mapping, not a Fresnel integral: real edge diffraction loss
 * is frequency- and geometry-dependent in ways one lowpass cannot carry, so
 * this places the three cases people can hear — straight through (open),
 * around the jamb (~90°, a clearly darker room next door), and doubled back
 * (a corridor's worth of turning) — on the scalar the engine already muffles
 * with. Linear in the bend between them.
 */
export const DIFFRACTION_MAX_OCCLUSION = 0.7;
export function diffractionOcclusion01(bendRad) {
    const b = bendRad < 0 ? 0 : bendRad > Math.PI ? Math.PI : bendRad;
    return DIFFRACTION_MAX_OCCLUSION * (b / Math.PI);
}
// ── small vector helpers ──
function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Angle the path turns at `b` coming from `a` and leaving toward `c`. */
function turnAngle(a, b, c) {
    const ix = b.x - a.x, iy = b.y - a.y, iz = b.z - a.z;
    const ox = c.x - b.x, oy = c.y - b.y, oz = c.z - b.z;
    const il = Math.sqrt(ix * ix + iy * iy + iz * iz);
    const ol = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (il < 1e-6 || ol < 1e-6)
        return 0;
    const cos = (ix * ox + iy * oy + iz * oz) / (il * ol);
    return Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos);
}
function normalAxis(n) {
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ax >= ay && ax >= az)
        return 'x';
    if (ay >= ax && ay >= az)
        return 'y';
    return 'z';
}
function clampInt(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
//# sourceMappingURL=Diffraction.js.map