/**
 * World realizer — WorldSpec → RealizedWorld, deterministically from the seed.
 *
 * Pure data in, pure data out (no three.js): a heightfield, a per-cell ground
 * MATERIAL grid, line and area features (strips / patches — carved or paved,
 * liquid or not; the polyline a line source follows), object instances placed
 * by density × masks (a shape, solid or porous, maybe raised on a stem), and
 * fixtures resolved from relative placement with a small overlap-repair pass.
 * Everything the renderer draws and everything the acoustic compiler binds to
 * comes from this one object, so the visible world and the audible one cannot
 * disagree. Nothing here knows what any of it IS — a river and a road are both
 * strips, an oak and a tower are both objects; the spec says which is which.
 *
 * Frame: +Y up, ground under the listener at y = 0, listener at the origin,
 * DSL "ahead" = +Z. The patch is the square [-sizeM/2, sizeM/2]².
 */
import { createNoise2D, createRng, fbm, rngRange } from './worldNoise.js';
import { MAX_SCATTER_INSTANCES, interiorFootprint, pointInFootprint, distanceToFootprintEdge, footprintArea, BOX_WALL_IDS, } from './worldSpec.js';
/** The walls of an interior spec, box or plan, with outward normals. */
export function realizeWalls(it) {
    const poly = interiorFootprint(it);
    const ccw = footprintArea(poly) > 0;
    const specWalls = it.plan && it.plan.length >= 3 ? it.plan : [null, null, null, null];
    const ids = it.plan && it.plan.length >= 3 ? it.plan.map(w => w.id) : BOX_WALL_IDS;
    return poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.max(1e-6, Math.hypot(dx, dz));
        const ux = dx / len, uz = dz / len;
        // Interior is to the left of travel when counter-clockwise; outward is the other side.
        const nx = ccw ? uz : -uz;
        const nz = ccw ? -ux : ux;
        const w = specWalls[i];
        return { id: ids[i], a, b, nx, nz, ux, uz, lengthM: len, heightM: w?.heightM ?? it.sizeM[1], material: w?.material ?? it.walls };
    });
}
/** True when a ground point lies within the interior's footprint (+`marginM`). */
export function insideInteriorFootprint(interior, x, z, marginM = 0) {
    if (pointInFootprint(interior.footprint, x, z))
        return true;
    return marginM > 0 && distanceToFootprintEdge(interior.footprint, x, z) <= marginM;
}
// ── Interior collision ────────────────────────────────────────────────
//
// The shell is solid from BOTH sides: a plate along every wall of the plan,
// a floor plate at y = 0 and a ceiling plate at y = sizeM[1], each
// WALL_THICKNESS_M thick. The only ways through are apertures a BODY fits
// through. The thresholds below are body physics — shoulder width, ducking
// headroom, a sill low enough to step over — not scene rules: whether a
// given aperture passes is decided entirely by the spec's own numbers, in
// either direction (you can leave through an open door and come back).
/** An aperture admits a body only this far open (a half-open door does). */
export const APERTURE_PASS_MIN_OPEN = 0.5;
/** Shoulder width: an opening narrower than this admits no body. */
export const APERTURE_PASS_MIN_WIDTH_M = 0.6;
/** Ducking headroom for a wall opening — a window is not a door. */
export const APERTURE_PASS_MIN_HEIGHT_M = 1.5;
/** A sill this high is climbed, not stepped over — impassable here. */
export const APERTURE_PASS_MAX_SILL_M = 0.6;
/** Shell plate thickness; matches the realized aperture band depth. */
export const WALL_THICKNESS_M = 0.15;
/**
 * Where an aperture sits: its wall (index into `walls`), its centre along
 * that wall, and the centre's floor point and outward normal. A wall id
 * addresses the wall directly (`alongM` or the midpoint); a bearing is a ray
 * from the origin to the first wall it meets. Ground plane only.
 */
export function aperturePlacement(walls, wall, alongM) {
    if (typeof wall === 'string') {
        const i = Math.max(0, walls.findIndex(w => w.id === wall));
        const w = walls[i];
        const t = Math.max(0, Math.min(w.lengthM, alongM ?? w.lengthM / 2));
        return { wall: i, t, x: w.a[0] + w.ux * t, z: w.a[1] + w.uz * t, nx: w.nx, nz: w.nz };
    }
    const hit = wallHit(walls, wall);
    return { wall: hit.wall, t: hit.t, x: hit.x, z: hit.z, nx: hit.nx, nz: hit.nz };
}
/** The shell's holes, from the spec's own apertures (the same placement the realizer uses; ceiling/floor hatches centred on the origin). */
export function interiorOpenings(it, walls = realizeWalls(it)) {
    const roomH = it.sizeM[1];
    const out = [];
    for (const a of it.apertures) {
        const w = a.sizeM[0];
        const h = Math.min(a.sizeM[1], roomH);
        if (a.wall === 'ceiling' || a.wall === 'floor') {
            out.push({
                kind: a.wall, wall: -1, centreT: 0, halfW: w / 2, baseY: 0, topY: 0,
                halfDX: w / 2, halfDZ: h / 2,
                passable: a.open >= APERTURE_PASS_MIN_OPEN && w >= APERTURE_PASS_MIN_WIDTH_M && h >= APERTURE_PASS_MIN_WIDTH_M,
            });
        }
        else {
            const place = aperturePlacement(walls, a.wall, a.alongM);
            const sill = Math.max(0, Math.min(a.sillM ?? (roomH - h) / 2, roomH - h));
            out.push({
                kind: 'wall', wall: place.wall, centreT: place.t, halfW: w / 2,
                baseY: sill, topY: sill + h, halfDX: 0, halfDZ: 0,
                passable: a.open >= APERTURE_PASS_MIN_OPEN && w >= APERTURE_PASS_MIN_WIDTH_M &&
                    h >= APERTURE_PASS_MIN_HEIGHT_M && sill < APERTURE_PASS_MAX_SILL_M,
            });
        }
    }
    return out;
}
/**
 * One wall's plate against a move `from` → `to` (both mutated in place only
 * through `to`). The plate is the wall's segment thickened by
 * WALL_THICKNESS_M and the body radius, within the wall's extent and height;
 * beyond its ends or above its top there is no wall. A move that ends in the
 * plate or straddles it is clamped to the face on the side it came from —
 * along the wall's normal only, so the tangential motion proceeds: that IS
 * the slide. A crossing through a passable opening at the crossing point's
 * along-wall coordinate and height is let through.
 */
function resolveWall(w, wi, from, to, r, openings) {
    const half = WALL_THICKNESS_M / 2 + r;
    const dFrom = (from.x - w.a[0]) * w.nx + (from.z - w.a[1]) * w.nz;
    const dTo = (to.x - w.a[0]) * w.nx + (to.z - w.a[1]) * w.nz;
    const ends = dTo > -half && dTo < half;
    const straddles = Math.min(dFrom, dTo) < -half && Math.max(dFrom, dTo) > half;
    if (!ends && !straddles)
        return;
    // Where the move meets the wall's plane (or `to` itself when it ends inside the plate).
    const span = dTo - dFrom;
    const s = Math.abs(span) > 1e-9 ? Math.max(0, Math.min(1, -dFrom / span)) : 1;
    const cx = from.x + (to.x - from.x) * s, cz = from.z + (to.z - from.z) * s, cy = from.y + (to.y - from.y) * s;
    const t = (cx - w.a[0]) * w.ux + (cz - w.a[1]) * w.uz;
    if (t < -WALL_THICKNESS_M || t > w.lengthM + WALL_THICKNESS_M)
        return; // past the corners
    if (cy < -WALL_THICKNESS_M || cy > w.heightM + WALL_THICKNESS_M)
        return; // over the roofline
    for (const o of openings) {
        if (o.kind !== 'wall' || o.wall !== wi || !o.passable)
            continue;
        if (Math.abs(t - o.centreT) <= Math.max(0.05, o.halfW - r) && cy >= o.baseY && cy <= o.topY)
            return;
    }
    let face;
    if (dFrom <= -half)
        face = -half;
    else if (dFrom >= half)
        face = half;
    else
        face = dTo - dFrom < 0 ? -half : half; // began inside the plate: push out the way it was heading
    const push = face - dTo;
    to.x += w.nx * push;
    to.z += w.nz * push;
}
/** The floor (y = 0) and ceiling (y = roomH) plates, within the footprint. */
function resolvePlates(it, x, z, p, target, r) {
    if (!insideInteriorFootprint(it, x, z, WALL_THICKNESS_M))
        return target;
    const roomH = it.sizeM[1];
    // Vertical padding stays small so a low camera can still hover near the floor.
    const rV = Math.min(r, 0.1);
    for (let plate = 0; plate < 2; plate++) {
        const kind = plate === 0 ? 'floor' : 'ceiling';
        const lo = plate === 0 ? -WALL_THICKNESS_M - rV : roomH - rV;
        const hi = plate === 0 ? rV : roomH + WALL_THICKNESS_M + rV;
        const ends = target > lo && target < hi;
        const straddles = Math.min(p, target) < lo && Math.max(p, target) > hi;
        if (!ends && !straddles)
            continue;
        let through = false;
        for (const o of it.openings) {
            if (o.kind !== kind || !o.passable)
                continue;
            if (Math.abs(x) <= Math.max(0.05, o.halfDX - r) && Math.abs(z) <= Math.max(0.05, o.halfDZ - r)) {
                through = true;
                break;
            }
        }
        if (through)
            continue;
        if (p <= lo)
            target = lo;
        else if (p >= hi)
            target = hi;
        else
            target = target - p < 0 ? lo : hi;
    }
    return target;
}
/**
 * Clamp a movement segment `from` → `to` against the interior shell, writing
 * the permitted end position back into `to` (no allocation — safe to call
 * per frame). Each wall clamps along its own normal while the tangential
 * motion proceeds, which gives wall SLIDE rather than a dead stop; walls are
 * resolved twice so a corner holds; the straddle test catches any step size,
 * so a fast dolly or a teleport cannot tunnel through a wall.
 */
export function resolveInteriorMove(it, from, to, radiusM) {
    const pad = WALL_THICKNESS_M + radiusM + 0.01;
    const roomH = it.sizeM[1];
    // Both endpoints beyond the footprint's box on the same side, or both above
    // the roofline → the segment cannot touch the shell. This is the whole
    // cost for exterior flight.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of it.footprint) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    if ((from.x > maxX + pad && to.x > maxX + pad) || (from.x < minX - pad && to.x < minX - pad) ||
        (from.z > maxZ + pad && to.z > maxZ + pad) || (from.z < minZ - pad && to.z < minZ - pad) ||
        (from.y > roomH + pad && to.y > roomH + pad))
        return;
    for (let round = 0; round < 2; round++) {
        for (let i = 0; i < it.plan.length; i++)
            resolveWall(it.plan[i], i, from, to, radiusM, it.openings);
    }
    to.y = resolvePlates(it, to.x, to.z, from.y, to.y, radiusM);
}
// ── Heightfield queries ───────────────────────────────────────────────
const GRID_STEP_M = 1;
function sampleAt(hf, i, j) {
    const ci = i < 0 ? 0 : i >= hf.res ? hf.res - 1 : i;
    const cj = j < 0 ? 0 : j >= hf.res ? hf.res - 1 : j;
    return hf.data[cj * hf.res + ci];
}
/** Bilinear terrain height at (x, z); outside the patch clamps to the edge. */
export function heightAt(hf, x, z) {
    const half = hf.sizeM / 2;
    const fx = (x + half) / hf.step;
    const fz = (z + half) / hf.step;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = sampleAt(hf, i, j);
    const h10 = sampleAt(hf, i + 1, j);
    const h01 = sampleAt(hf, i, j + 1);
    const h11 = sampleAt(hf, i + 1, j + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}
/** Slope in degrees at (x, z) from central differences. */
export function slopeDegAt(hf, x, z) {
    const d = hf.step;
    const dx = (heightAt(hf, x + d, z) - heightAt(hf, x - d, z)) / (2 * d);
    const dz = (heightAt(hf, x, z + d) - heightAt(hf, x, z - d)) / (2 * d);
    return Math.atan(Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI);
}
/** Free-text ground material under (x, z). */
export function materialAt(world, x, z) {
    // Inside the room, the room's floor is the ground (2026-10-01: a cafe's listener
    // stepped on the archetype's concrete and the street's asphalt from the wood floor).
    if (world.interior && pointInFootprint(world.interior.footprint, x, z))
        return world.interior.floor;
    // Foley follows the actual feature footprint, not its rounded raster cell.
    // The render grid remains useful for terrain colours; it must not move a
    // pool/road boundary by half a cell under the listener's feet.
    for (const feature of world.features) {
        const distance = distanceToRealizedFeature(feature, x, z);
        if (distance <= 0)
            return feature.material;
        if (feature.edgeMaterial && distance <= Math.max(1, feature.halfM * 0.4))
            return feature.edgeMaterial;
    }
    const g = world.ground;
    const half = g.sizeM / 2;
    const i = Math.max(0, Math.min(g.res - 1, Math.round((x + half) / g.step)));
    const j = Math.max(0, Math.min(g.res - 1, Math.round((z + half) / g.step)));
    return g.palette[(g.baseIndex ?? g.index)[j * g.res + i]];
}
// ── Feature queries ───────────────────────────────────────────────────
function distToSegment2(px, pz, ax, az, bx, bz) {
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (ax + vx * t);
    const dz = pz - (az + vz * t);
    return Math.sqrt(dx * dx + dz * dz);
}
function polylineDistance(poly, x, z) {
    if (poly.length === 0)
        return Infinity;
    if (poly.length === 1)
        return Math.hypot(x - poly[0].x, z - poly[0].z);
    let best = Infinity;
    for (let k = 0; k + 1 < poly.length; k++) {
        const d = distToSegment2(x, z, poly[k].x, poly[k].z, poly[k + 1].x, poly[k + 1].z);
        if (d < best)
            best = d;
    }
    return best;
}
function polylineNearest(poly, x, z) {
    if (poly.length === 0)
        return null;
    if (poly.length === 1)
        return { ...poly[0] };
    let best = { ...poly[0] };
    let bestD = Infinity;
    for (let k = 0; k + 1 < poly.length; k++) {
        const a = poly[k], b = poly[k + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const len2 = vx * vx + vz * vz;
        let t = len2 > 0 ? ((x - a.x) * vx + (z - a.z) * vz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + vx * t, qz = a.z + vz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (d < bestD) {
            bestD = d;
            best = { x: qx, y: a.y + (b.y - a.y) * t, z: qz };
        }
    }
    return best;
}
/** A feature by id (strip or patch), or null. */
export function featureById(world, id) {
    return world.features.find(f => f.id === id) ?? null;
}
/**
 * Signed distance from (x, z) to a feature's EDGE: negative inside (on the
 * strip, in the patch, on the filled side), positive outside. Infinity when
 * the id is unknown.
 */
export function distanceToFeature(world, id, x, z) {
    const f = featureById(world, id);
    return f ? distanceToRealizedFeature(f, x, z) : Infinity;
}
/** Allocation-free distance when the caller already has the feature. */
function distanceToRealizedFeature(f, x, z) {
    if (f.kind === 'patch') {
        return Math.hypot(x - (f.centre?.[0] ?? 0), z - (f.centre?.[1] ?? 0)) - f.halfM;
    }
    const d = polylineDistance(f.polyline, x, z) - f.halfM;
    if (f.fill) {
        // Past the line on the filled side the feature continues forever.
        const s = (x - f.fill.ox) * f.fill.nx + (z - f.fill.oz) * f.fill.nz;
        if (s > 0)
            return Math.min(d, -s);
    }
    return d;
}
/** True when (x, z) is on / in the feature. */
export function insideFeature(world, id, x, z) {
    return distanceToFeature(world, id, x, z) <= 0;
}
/** The surface owner at (x, z): first match, strips before patches, then authored order. Terrain and surface meshes use the same priority. */
export function featureAt(world, x, z) {
    for (const f of world.features)
        if (insideFeature(world, f.id, x, z))
            return f;
    return null;
}
/** Nearest point of a feature's line (strip centreline / patch rim) to (x, z) — where a line source is heard from. */
export function nearestFeaturePoint(world, id, x, z) {
    const f = featureById(world, id);
    return f ? polylineNearest(f.polyline, x, z) : null;
}
/** Allocation-free `nearestFeaturePoint` for the engine's spatial tick: writes into `out`, returns false when the id is unknown. */
export function nearestFeaturePointInto(world, id, x, z, out) {
    const f = featureById(world, id);
    if (!f || f.polyline.length === 0)
        return false;
    const poly = f.polyline;
    if (poly.length === 1) {
        out.x = poly[0].x;
        out.y = poly[0].y;
        out.z = poly[0].z;
        return true;
    }
    let bestD = Infinity;
    for (let k = 0; k + 1 < poly.length; k++) {
        const a = poly[k], b = poly[k + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const len2 = vx * vx + vz * vz;
        let t = len2 > 0 ? ((x - a.x) * vx + (z - a.z) * vz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + vx * t, qz = a.z + vz * t;
        const dx = x - qx, dz = z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) {
            bestD = d2;
            out.x = qx;
            out.y = a.y + (b.y - a.y) * t;
            out.z = qz;
        }
    }
    return true;
}
/** Arc length (metres, in the ground plane) of a feature's line — a strip's centreline or a patch's rim. */
export function featureArcLength(f) {
    const poly = f.polyline;
    let len = 0;
    for (let k = 0; k + 1 < poly.length; k++) {
        const dx = poly[k + 1].x - poly[k].x, dz = poly[k + 1].z - poly[k].z;
        len += Math.sqrt(dx * dx + dz * dz);
    }
    return len;
}
/** Arc-length position (0..featureArcLength) of the point of a feature's line nearest (x, z). */
export function featureArcNearest(f, x, z) {
    const poly = f.polyline;
    if (poly.length < 2)
        return 0;
    let bestD = Infinity;
    let bestS = 0;
    let acc = 0;
    for (let k = 0; k + 1 < poly.length; k++) {
        const a = poly[k], b = poly[k + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const len2 = vx * vx + vz * vz;
        const len = Math.sqrt(len2);
        let t = len2 > 0 ? ((x - a.x) * vx + (z - a.z) * vz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (a.x + vx * t), dz = z - (a.z + vz * t);
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) {
            bestD = d2;
            bestS = acc + len * t;
        }
        acc += len;
    }
    return bestS;
}
/**
 * The point at arc length `s` along a feature's line (clamped to its ends),
 * written into `out` with no allocation — the engine's per-tick path for a
 * voice travelling along a strip (`at <strip> pass`). False for an empty line.
 */
export function featurePointAtArcInto(f, s, out) {
    const poly = f.polyline;
    if (poly.length === 0)
        return false;
    if (poly.length === 1) {
        out.x = poly[0].x;
        out.y = poly[0].y;
        out.z = poly[0].z;
        return true;
    }
    if (s <= 0) {
        out.x = poly[0].x;
        out.y = poly[0].y;
        out.z = poly[0].z;
        return true;
    }
    let acc = 0;
    for (let k = 0; k + 1 < poly.length; k++) {
        const a = poly[k], b = poly[k + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (s <= acc + len) {
            const t = len > 0 ? (s - acc) / len : 0;
            out.x = a.x + dx * t;
            out.y = a.y + (b.y - a.y) * t;
            out.z = a.z + dz * t;
            return true;
        }
        acc += len;
    }
    const last = poly[poly.length - 1];
    out.x = last.x;
    out.y = last.y;
    out.z = last.z;
    return true;
}
/**
 * Like `featurePointAtArcInto`, but an arc beyond either end continues along that end's tangent
 * (spec 006): a route body born or retired beyond earshot travels the strip's line extended, so
 * it approaches from where the road would come from and recedes where it would go.
 */
export function featurePointAtArcExtrapolatedInto(f, s, out) {
    const poly = f.polyline;
    if (poly.length < 2)
        return featurePointAtArcInto(f, s, out);
    if (s >= 0) {
        const len = featureArcLength(f);
        if (s <= len)
            return featurePointAtArcInto(f, s, out);
        const a = poly[poly.length - 2], b = poly[poly.length - 1];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const u = s - len;
        out.x = b.x + (dx / l) * u;
        out.y = b.y;
        out.z = b.z + (dz / l) * u;
        return true;
    }
    const a = poly[0], b = poly[1];
    const dx = a.x - b.x, dz = a.z - b.z, l = Math.hypot(dx, dz) || 1;
    out.x = a.x + (dx / l) * -s;
    out.y = a.y;
    out.z = a.z + (dz / l) * -s;
    return true;
}
/** Outward unit tangent at a strip's start (arc 0) or end (arc = length), in the ground plane. */
export function featureEndTangentInto(f, atEnd, out) {
    const poly = f.polyline;
    if (poly.length < 2)
        return false;
    const a = atEnd ? poly[poly.length - 2] : poly[1], b = atEnd ? poly[poly.length - 1] : poly[0];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l;
    out.z = dz / l;
    return true;
}
/**
 * The feature's surface height at (x, z): a strip's polyline level
 * interpolated at the nearest segment (a brook descends along its path —
 * `surfaceY` is only its median), a patch's constant level.
 */
export function featureSurfaceYAt(f, x, z) {
    if (f.kind !== 'strip' || f.polyline.length < 2)
        return f.surfaceY;
    let best = Infinity, y = f.surfaceY;
    for (let i = 0; i < f.polyline.length - 1; i++) {
        const a = f.polyline[i], b = f.polyline[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z;
        const len2 = abx * abx + abz * abz;
        let t = len2 > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) {
            best = d2;
            y = a.y + (b.y - a.y) * t;
        }
    }
    return y;
}
/** Any liquid feature under (x, z). */
export function isLiquidAt(world, x, z) {
    const f = featureAt(world, x, z);
    return !!f && f.liquid;
}
// ── Object queries ────────────────────────────────────────────────────
/**
 * Horizontal containment of a point by an object's body. An axis-aligned box
 * uses its bounding square (a bound, not a hit test); a turned fixture (a
 * `rotate` line) is tested in its own frame so cover follows the rotation.
 */
function bodyContains(o, x, z) {
    const dx = x - o.position.x, dz = z - o.position.z;
    if (o.shape === 'box') {
        if (o.yaw && o.sizeM) {
            const [lx, lz] = fixtureLocalOffset(o, x, z);
            return Math.abs(lx) <= o.sizeM[0] / 2 && Math.abs(lz) <= o.sizeM[2] / 2 ? 1 : 0;
        }
        const inside = Math.abs(dx) <= o.radiusM && Math.abs(dz) <= o.radiusM;
        return inside ? 1 : 0;
    }
    const d = Math.hypot(dx, dz);
    if (d >= o.radiusM)
        return 0;
    return 1 - (d / o.radiusM) * 0.5;
}
/**
 * The lowest body above (x, z, y): what rain lands on and what sits over
 * the listener's head. `cover` is 1 under the body's centre, 0.5 at its edge.
 */
export function overheadAt(world, x, z, y = 0) {
    let best = null;
    for (const o of world.objects) {
        const c = bodyContains(o, x, z);
        if (c <= 0)
            continue;
        const underside = o.position.y + o.bodyBaseM;
        if (underside <= y)
            continue;
        if (!best || underside < best.underside)
            best = { object: o, cover: c, underside };
    }
    return best;
}
/** Cover 0..1 over (x, z) — 0 in the open. */
export function overheadCoverAt(world, x, z, y = 0) {
    return overheadAt(world, x, z, y)?.cover ?? 0;
}
/** Objects of one class / fixture id, or one exact object id. */
export function objectsOf(world, ref) {
    return world.objects.filter(o => o.classId === ref || o.id === ref);
}
/**
 * Where a sound attaches to an object: the body's centre (default), its top,
 * its base on the ground, or inside it (same point as the body; the engine
 * treats `inside` as heard through the walls).
 */
export function attachPoint(o, attach = 'body') {
    const { x, y, z } = o.position;
    switch (attach) {
        case 'base': return { x, y: y + 0.2, z };
        case 'top': return { x, y: y + o.heightM, z };
        default: return { x, y: y + o.bodyBaseM + (o.heightM - o.bodyBaseM) * 0.5, z };
    }
}
// ── Realization ───────────────────────────────────────────────────────
function buildHeightfield(spec) {
    const res = Math.round(spec.sizeM / GRID_STEP_M) + 1;
    const step = spec.sizeM / (res - 1);
    const data = new Float32Array(res * res);
    const noise = createNoise2D(spec.seed);
    const half = spec.sizeM / 2;
    // Rough terrain = shorter wavelengths and more octaves; smooth = one long swell.
    const wavelength = 60 - spec.terrain.roughness * 40;
    const octaves = 2 + Math.round(spec.terrain.roughness * 3);
    for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
            const x = -half + i * step;
            const z = -half + j * step;
            data[j * res + i] = fbm(noise, x / wavelength, z / wavelength, octaves) * spec.terrain.reliefM;
        }
    }
    const hf = { sizeM: spec.sizeM, res, step, data };
    // Walkable: cap the steepest slope at MAX_SLOPE (fBm at high relief and
    // short wavelengths produces 45° hillsides that put the listener's eye in
    // the ground), then flatten a clearing around the listener so the place
    // starts level underfoot and eases into the relief over CLEARING_M.
    let maxGrad = 0;
    for (let j = 0; j < res; j++) {
        for (let i = 1; i < res; i++) {
            const gx = Math.abs(data[j * res + i] - data[j * res + i - 1]) / step;
            if (gx > maxGrad)
                maxGrad = gx;
            if (j > 0) {
                const gz = Math.abs(data[j * res + i] - data[(j - 1) * res + i]) / step;
                if (gz > maxGrad)
                    maxGrad = gz;
            }
        }
    }
    if (maxGrad > MAX_SLOPE) {
        const k = MAX_SLOPE / maxGrad;
        for (let q = 0; q < data.length; q++)
            data[q] *= k;
    }
    // The ground under the listener is the DSL's y = 0.
    const origin = heightAt(hf, 0, 0);
    for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
            const x = -half + i * step;
            const z = -half + j * step;
            const d = Math.hypot(x, z);
            const t = d <= CLEARING_FLAT_M ? 0 : d >= CLEARING_M ? 1 : (() => { const u = (d - CLEARING_FLAT_M) / (CLEARING_M - CLEARING_FLAT_M); return u * u * (3 - 2 * u); })();
            const q = j * res + i;
            data[q] = (data[q] - origin) * t;
        }
    }
    // An interior's floor is the frame's y = 0; the exterior ground sits its
    // elevation below (a third-floor room: the street at −7). Applied after the
    // origin shift, so heightAt(0, 0) === −elevationM by construction.
    const drop = spec.interior?.elevationM ?? 0;
    if (drop > 0)
        for (let q = 0; q < data.length; q++)
            data[q] -= drop;
    return hf;
}
/** Steepest terrain gradient allowed (rise/run): ~20° — hills, not cliffs. */
const MAX_SLOPE = 0.36;
/** The listener's clearing is level out to this radius (m)… */
const CLEARING_FLAT_M = 4;
/** …and eases into the relief by this radius (m). */
const CLEARING_M = 14;
const smoothstep = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
};
/** A gently wobbling line across the patch, its nearest stretch `offset` metres from the listener. */
function defaultPath(spec, rng, salt, offset, wobbleM) {
    const half = spec.sizeM / 2;
    const bearing = rngRange(rng, 0, Math.PI * 2);
    const side = rng() < 0.5 ? -1 : 1;
    const dx = Math.cos(bearing), dz = Math.sin(bearing);
    const nx = -dz, nz = dx;
    const noise = createNoise2D(spec.seed ^ salt);
    const pts = [];
    const n = 24;
    for (let k = 0; k <= n; k++) {
        const t = -half * 1.2 + (k / n) * spec.sizeM * 1.2;
        const wobble = noise(t / 25, 0.5) * wobbleM;
        pts.push([dx * t + nx * (side * offset + wobble), dz * t + nz * (side * offset + wobble)]);
    }
    return pts;
}
/** Carve / pave a strip into the heightfield and return its realized form. */
function realizeStrip(spec, s, hf, path) {
    const half = spec.sizeM / 2;
    const w = s.widthM;
    const depth = s.carveM;
    // Levels along the path: a carved liquid strip flows downhill (running
    // minimum); a paved strip rides the terrain.
    const levels = [];
    let level = Infinity;
    for (let k = 0; k < path.length; k++) {
        const h = heightAt(hf, path[k][0], path[k][1]);
        if (s.liquid && depth > 0) {
            level = Math.min(level - 0.02, h - depth * 0.4);
            levels.push(level);
        }
        else
            levels.push(h);
    }
    let fill;
    if (s.fill) {
        const a = path[0], b = path[path.length - 1];
        const tx = b[0] - a[0], tz = b[1] - a[1];
        const len = Math.hypot(tx, tz) || 1;
        // Satie's frame is +X right, +Y up, +Z AHEAD (left-handed): facing +X, your
        // right hand points to −Z. So "right" of travel = (tz, −tx). The previous
        // formula was three.js-handed (right = +Z for +X travel) and mirrored every
        // filled sea against the documented frame (2026-09-08, the harbour's basin
        // landed on the market).
        const sgn = s.fill === 'right' ? 1 : -1;
        fill = { nx: (tz / len) * sgn, nz: (-tx / len) * sgn, ox: a[0], oz: a[1] };
    }
    if (depth > 0 || fill) {
        for (let j = 0; j < hf.res; j++) {
            for (let i = 0; i < hf.res; i++) {
                const x = -half + i * hf.step;
                const z = -half + j * hf.step;
                let best = Infinity;
                let bestLevel = 0;
                for (let k = 0; k + 1 < path.length; k++) {
                    const d = distToSegment2(x, z, path[k][0], path[k][1], path[k + 1][0], path[k + 1][1]);
                    if (d < best) {
                        best = d;
                        bestLevel = Math.min(levels[k], levels[k + 1]);
                    }
                }
                const idx = j * hf.res + i;
                if (fill) {
                    const sd = (x - fill.ox) * fill.nx + (z - fill.oz) * fill.nz; // signed distance past the line
                    if (sd > -w) {
                        const t = smoothstep(-w, w, sd);
                        const target = bestLevel - Math.max(depth, 0.3) * smoothstep(0, w * 2, sd) - 0.05;
                        hf.data[idx] = hf.data[idx] * (1 - t) + target * t;
                    }
                    continue;
                }
                if (best > w * 1.5)
                    continue;
                const bed = bestLevel - depth * (1 - smoothstep(0, w / 2, best));
                const blend = 1 - smoothstep(w / 2, w * 1.5, best);
                const target = best <= w / 2 ? bed : bestLevel;
                hf.data[idx] = hf.data[idx] * (1 - blend) + target * blend;
            }
        }
    }
    const polyline = path.map(([x, z], k) => ({ x, y: levels[k], z }));
    const feature = {
        id: s.id, kind: 'strip', label: s.label, material: s.material, liquid: s.liquid, flow: s.flow, carveM: depth,
        halfM: w / 2, polyline, surfaceY: levels[Math.floor(levels.length / 2)],
    };
    if (s.edgeMaterial)
        feature.edgeMaterial = s.edgeMaterial;
    if (fill)
        feature.fill = fill;
    return feature;
}
/** Carve / pave a patch and return its realized form (rim polyline). */
function realizePatch(spec, p, hf, centre) {
    const half = spec.sizeM / 2;
    const r = p.radiusM;
    const depth = p.carveM;
    const surfaceY = heightAt(hf, centre[0], centre[1]) - (p.liquid && depth > 0 ? depth * 0.3 : 0);
    if (depth > 0) {
        for (let j = 0; j < hf.res; j++) {
            for (let i = 0; i < hf.res; i++) {
                const x = -half + i * hf.step;
                const z = -half + j * hf.step;
                const d = Math.hypot(x - centre[0], z - centre[1]);
                if (d > r * 1.6)
                    continue;
                const idx = j * hf.res + i;
                const bed = surfaceY - depth * (1 - smoothstep(0, r, d));
                const blend = 1 - smoothstep(r, r * 1.6, d);
                const target = d <= r ? bed : surfaceY;
                hf.data[idx] = hf.data[idx] * (1 - blend) + target * blend;
            }
        }
    }
    else {
        // A flat patch is levelled to its centre height so a plaza reads as a floor.
        for (let j = 0; j < hf.res; j++) {
            for (let i = 0; i < hf.res; i++) {
                const x = -half + i * hf.step;
                const z = -half + j * hf.step;
                const d = Math.hypot(x - centre[0], z - centre[1]);
                if (d > r * 1.3)
                    continue;
                const idx = j * hf.res + i;
                const blend = 1 - smoothstep(r, r * 1.3, d);
                hf.data[idx] = hf.data[idx] * (1 - blend) + surfaceY * blend;
            }
        }
    }
    const polyline = [];
    const n = 24;
    for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        polyline.push({ x: centre[0] + Math.cos(a) * r, y: surfaceY, z: centre[1] + Math.sin(a) * r });
    }
    const feature = {
        id: p.id, kind: 'patch', label: p.label, material: p.material, liquid: p.liquid, flow: 0, carveM: depth,
        halfM: r, polyline, surfaceY, centre,
    };
    if (p.edgeMaterial)
        feature.edgeMaterial = p.edgeMaterial;
    return feature;
}
function maskPasses(mask, world, x, z, defaultClearingM) {
    const listenerAway = mask?.away?.id === 'listener' ? mask.away.m : defaultClearingM;
    if (listenerAway > 0 && Math.hypot(x, z) < listenerAway)
        return false;
    if (!mask)
        return true;
    if (mask.slopeMaxDeg !== undefined || mask.slopeMinDeg !== undefined) {
        const s = slopeDegAt(world.heightfield, x, z);
        if (mask.slopeMaxDeg !== undefined && s > mask.slopeMaxDeg)
            return false;
        if (mask.slopeMinDeg !== undefined && s < mask.slopeMinDeg)
            return false;
    }
    if (mask.altitudeM) {
        const h = heightAt(world.heightfield, x, z);
        if (h < mask.altitudeM[0] || h > mask.altitudeM[1])
            return false;
    }
    if (mask.near) {
        const d = mask.near.id === 'listener' ? Math.hypot(x, z) : distanceToFeature(world, mask.near.id, x, z);
        if (d > mask.near.m)
            return false;
    }
    if (mask.away && mask.away.id !== 'listener') {
        const d = distanceToFeature(world, mask.away.id, x, z);
        if (d < mask.away.m)
            return false;
    }
    return true;
}
function buildGround(spec, world) {
    const hf = world.heightfield;
    const palette = [];
    const paletteIndex = (name) => {
        let i = palette.indexOf(name);
        if (i < 0) {
            i = palette.length;
            palette.push(name);
        }
        return i;
    };
    const index = new Uint8Array(hf.res * hf.res);
    const baseIndex = new Uint8Array(hf.res * hf.res);
    const noise = createNoise2D(spec.seed ^ 0x7777);
    const half = spec.sizeM / 2;
    const layers = spec.ground.map((g, k) => ({ ...g, idx: paletteIndex(g.material), phase: k * 17.3 }));
    const features = world.features.map(f => ({
        f,
        idx: paletteIndex(f.material),
        edgeIdx: f.edgeMaterial ? paletteIndex(f.edgeMaterial) : -1,
        edgeM: Math.max(1, f.halfM * 0.4),
    }));
    for (let j = 0; j < hf.res; j++) {
        for (let i = 0; i < hf.res; i++) {
            const x = -half + i * hf.step;
            const z = -half + j * hf.step;
            // Keep the coherent underlying ground even beneath painted features.
            // Outside an exact feature boundary this prevents the nearest raster
            // cell from leaking gravel/water onto neighbouring soil or paving.
            let pick = layers[0].idx;
            let best = -Infinity;
            for (const layer of layers) {
                if (!maskPasses(layer.mask, world, x, z, 0))
                    continue;
                const v = layer.weight * (0.55 + 0.45 * noise(x / 9 + layer.phase, z / 9 - layer.phase));
                if (v > best) {
                    best = v;
                    pick = layer.idx;
                }
            }
            baseIndex[j * hf.res + i] = pick;
            for (const { f, idx, edgeIdx, edgeM } of features) {
                const d = distanceToFeature(world, f.id, x, z);
                if (d <= 0) {
                    pick = idx;
                    break;
                }
                if (edgeIdx >= 0 && d <= edgeM) {
                    pick = edgeIdx;
                    break;
                }
            }
            index[j * hf.res + i] = pick;
        }
    }
    return { sizeM: spec.sizeM, res: hf.res, step: hf.step, index, baseIndex, palette };
}
class SpatialHash {
    cell;
    cells = new Map();
    constructor(cell) {
        this.cell = cell;
    }
    key(x, z) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
    add(o) {
        const k = this.key(o.position.x, o.position.z);
        const arr = this.cells.get(k);
        if (arr)
            arr.push(o);
        else
            this.cells.set(k, [o]);
    }
    overlaps(x, z, r, classId, stemRadius) {
        const cx = Math.floor(x / this.cell);
        const cz = Math.floor(z / this.cell);
        const reach = Math.ceil(r / this.cell) + 1;
        for (let dz = -reach; dz <= reach; dz++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const arr = this.cells.get(`${cx + dx},${cz + dz}`);
                if (!arr)
                    continue;
                for (const o of arr) {
                    // Keep same-class crown spacing stable, while different vegetation
                    // layers can share ground beneath raised crowns without sharing trunks.
                    const min = o.classId === classId ? (r + o.radiusM) * 0.6
                        : ((stemRadius || r) + (o.bodyBaseM > 0 ? Math.max(o.stemRadiusM * 2, 0.3) : o.radiusM)) * 0.6;
                    if (Math.hypot(x - o.position.x, z - o.position.z) < min)
                        return true;
                }
            }
        }
        return false;
    }
}
/** True when a body of radius r at (x, z) would stand on any feature (its footprint for solid bodies). */
function onAnyFeature(world, x, z, footprintM, allowedPatch) {
    const owner = allowedPatch ? featureAt(world, x, z) : undefined;
    const onAllowedHost = owner?.id === allowedPatch && owner?.kind === 'patch' && !owner.liquid;
    for (const f of world.features) {
        // An explicit dry ground host may contain its authored vegetation. A
        // near-patch placement mask must not simultaneously ban that whole patch.
        if (!f.liquid && f.kind === 'patch' && (f.id === allowedPatch || onAllowedHost))
            continue;
        if (distanceToFeature(world, f.id, x, z) < footprintM)
            return true;
    }
    return false;
}
function scatterObjects(spec, world, rng) {
    const half = spec.sizeM / 2;
    const area100 = (spec.sizeM * spec.sizeM) / 100;
    const requested = spec.objects.reduce((n, s) => n + s.densityPer100m2 * area100, 0);
    const scale = requested > MAX_SCATTER_INSTANCES ? MAX_SCATTER_INSTANCES / requested : 1;
    const dropped = Math.max(0, Math.round(requested - requested * scale));
    const hash = new SpatialHash(6);
    const objects = [];
    for (const s of spec.objects) {
        const density = s.densityPer100m2 * scale;
        if (density <= 0)
            continue;
        const cell = Math.sqrt(100 / density);
        // An overhead crown does not occupy the listener's ground footprint.
        // Keep a metre beyond the largest trunk when every crown begins above
        // head height; low crowns still reserve their actual horizontal body.
        // Explicit away-listener masks remain authoritative in maskPasses.
        const highCrown = s.raised > 0 && s.heightM[0] * s.raised >= 2.2;
        const defaultClearing = highCrown ? 1 + s.stemRadiusM[1]
            : s.raised > 0 ? 1 + s.radiusM[1] : s.porous < 0.5 ? 2 + s.radiusM[1] : 1;
        const solid = s.porous < 0.5;
        let n = 0;
        for (let z = -half + cell / 2; z < half; z += cell) {
            for (let x = -half + cell / 2; x < half; x += cell) {
                const px = x + rngRange(rng, -cell * 0.45, cell * 0.45);
                const pz = z + rngRange(rng, -cell * 0.45, cell * 0.45);
                const h = rngRange(rng, s.heightM[0], s.heightM[1]);
                const r = rngRange(rng, s.radiusM[0], s.radiusM[1]);
                const stem = rngRange(rng, s.stemRadiusM[0], s.stemRadiusM[1]);
                const yaw = rngRange(rng, 0, Math.PI * 2);
                if (Math.abs(px) > half || Math.abs(pz) > half)
                    continue;
                // Nothing grows through the room the listener is in.
                if (world.interior && insideInteriorFootprint(world.interior, px, pz, 1 + r))
                    continue;
                // Nothing stands on a feature; a solid body keeps its whole footprint off it.
                if (onAnyFeature(world, px, pz, solid || s.raised === 0 ? r : stem, s.mask?.near?.id))
                    continue;
                if (!maskPasses(s.mask, world, px, pz, defaultClearing))
                    continue;
                if (hash.overlaps(px, pz, r, s.id, s.raised > 0 ? Math.max(stem * 2, 0.3) : 0))
                    continue;
                const o = {
                    id: `${s.id}_${n++}`,
                    kind: 'object',
                    classId: s.id,
                    label: s.label,
                    material: s.material,
                    shape: s.shape,
                    porous: s.porous,
                    position: { x: px, y: heightAt(world.heightfield, px, pz), z: pz },
                    heightM: h,
                    radiusM: r,
                    bodyBaseM: s.raised > 0 ? h * s.raised : 0,
                    stemRadiusM: s.raised > 0 ? Math.max(stem, 0.05) : 0,
                    yaw,
                };
                hash.add(o);
                objects.push(o);
            }
        }
    }
    return { objects, dropped };
}
/**
 * Centre and the four corners of a fixture's actual oriented footprint
 * (`[centre, (-x,-z), (-x,+z), (+x,-z), (+x,+z)]` in the fixture's local
 * frame, turned by its yaw). Axis-aligned when the yaw is 0.
 */
export function fixtureFootprint(o) {
    const hx = (o.sizeM?.[0] ?? o.radiusM * 2) / 2, hz = (o.sizeM?.[2] ?? o.radiusM * 2) / 2;
    const { x: px, z: pz } = o.position;
    if (!o.yaw)
        return [[px, pz], [px - hx, pz - hz], [px - hx, pz + hz], [px + hx, pz - hz], [px + hx, pz + hz]];
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    return [[0, 0], [-hx, -hz], [-hx, hz], [hx, -hz], [hx, hz]].map(([x, z]) => [px + x * c + z * s, pz - x * s + z * c]);
}
/** Half extents of the axis-aligned box that bounds a `hx` by `hz` rectangle turned by `yaw`. */
function rotatedHalfExtents(hx, hz, yaw) {
    if (!yaw)
        return [hx, hz];
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    return [hx * c + hz * s, hx * s + hz * c];
}
/** A world offset from a fixture's centre expressed in the fixture's local (unrotated) frame. */
function fixtureLocalOffset(o, x, z) {
    const dx = x - o.position.x, dz = z - o.position.z;
    if (!o.yaw)
        return [dx, dz];
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
}
/** Rectangle/feature intersection, using the fixture's own local frame. */
export function fixtureIntersectsFeature(o, f) {
    const hx = (o.sizeM?.[0] ?? o.radiusM * 2) / 2, hz = (o.sizeM?.[2] ?? o.radiusM * 2) / 2;
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    const local = (x, z) => { const dx = x - o.position.x, dz = z - o.position.z; return [dx * c - dz * s, dx * s + dz * c]; };
    if (f.kind === 'patch') {
        const [x, z] = local(...(f.centre ?? [0, 0]));
        return Math.hypot(Math.max(0, Math.abs(x) - hx), Math.max(0, Math.abs(z) - hz)) < f.halfM;
    }
    if (f.fill && fixtureFootprint(o).some(([x, z]) => (x - f.fill.ox) * f.fill.nx + (z - f.fill.oz) * f.fill.nz >= 0))
        return true;
    // Slab intersection against the strip's expanded rectangle. This is
    // conservative only at rounded strip ends; it never misses a crossing.
    const bx = hx + f.halfM, bz = hz + f.halfM;
    for (let i = 1; i < f.polyline.length; i++) {
        const a = local(f.polyline[i - 1].x, f.polyline[i - 1].z), b = local(f.polyline[i].x, f.polyline[i].z);
        let lo = 0, hi = 1;
        for (let axis = 0; axis < 2; axis++) {
            const limit = axis ? bz : bx, d = b[axis] - a[axis];
            if (Math.abs(d) < 1e-9) {
                if (Math.abs(a[axis]) > limit) {
                    hi = -1;
                    break;
                }
            }
            else {
                const t1 = (-limit - a[axis]) / d, t2 = (limit - a[axis]) / d;
                lo = Math.max(lo, Math.min(t1, t2));
                hi = Math.min(hi, Math.max(t1, t2));
            }
        }
        if (lo <= hi)
            return true;
    }
    return false;
}
function placeFixtures(spec, world, rng) {
    const half = spec.sizeM / 2;
    const placed = [];
    const byId = new Map();
    const resolveRef = (ref) => {
        if (ref === 'listener')
            return { x: 0, y: 0, z: 0 };
        const feature = featureById(world, ref);
        if (feature)
            return nearestFeaturePoint(world, ref, 0, 0);
        const fx = byId.get(ref);
        if (fx)
            return fx.position;
        // An object class: the nearest instance of it to the listener.
        let best = null;
        let bestD = Infinity;
        for (const o of world.objects) {
            if (o.classId !== ref)
                continue;
            const d = Math.hypot(o.position.x, o.position.z);
            if (d < bestD) {
                bestD = d;
                best = o;
            }
        }
        return best ? best.position : null;
    };
    const interior = world.interior;
    for (const f of spec.fixtures) {
        let x;
        let z;
        if (f.position) {
            [x, z] = f.position;
        }
        else {
            const rel = f.relativeTo ?? { ref: 'listener', distanceM: interior && !f.outside ? 2 : 6 };
            const origin = resolveRef(rel.ref) ?? { x: 0, y: 0, z: 0 };
            const bearing = ((rel.bearingDeg ?? rngRange(rng, 0, 360)) * Math.PI) / 180;
            x = origin.x + Math.sin(bearing) * rel.distanceM;
            z = origin.z + Math.cos(bearing) * rel.distanceM;
        }
        const radius = Math.max(f.sizeM[0], f.sizeM[2]) / 2;
        // `rotate <deg>`: the footprint, the colliders and the cover all turn with it.
        const yaw = ((f.yawDeg ?? 0) * Math.PI) / 180;
        const yawFields = f.yawDeg ? { yaw, yawDeg: f.yawDeg } : { yaw: 0 };
        if (interior && !f.outside) {
            // Solve the complete rectangular footprint at once. Radius-based pushes
            // can oscillate between a table, chair and wall and finish intersecting.
            if (!f.position) {
                const preferredX = x, preferredZ = z, [hx, hz] = rotatedHalfExtents(f.sizeM[0] / 2, f.sizeM[2] / 2, yaw);
                const support = f.support ? byId.get(f.support) : null;
                const baseY = (support ? support.position.y + support.heightM : 0) + (f.elevationM ?? 0);
                const valid = (px, pz) => {
                    const corners = fixtureFootprint({ position: { x: px, y: 0, z: pz }, sizeM: f.sizeM, radiusM: radius, yaw }).slice(1);
                    if (!corners.every(([qx, qz]) => pointInFootprint(interior.footprint, qx, qz) && distanceToFootprintEdge(interior.footprint, qx, qz) >= 0.04))
                        return false;
                    if (baseY < 1.8 && baseY + f.sizeM[1] > 0 && Math.hypot(Math.max(0, Math.abs(px) - hx), Math.max(0, Math.abs(pz) - hz)) < 0.6)
                        return false;
                    if (support && !corners.every(([qx, qz]) => Math.abs(qx - support.position.x) <= (support.sizeM?.[0] ?? 0) / 2 && Math.abs(qz - support.position.z) <= (support.sizeM?.[2] ?? 0) / 2))
                        return false;
                    return !placed.some(o => o.id !== f.support && baseY < o.position.y + o.heightM - 1e-6 && o.position.y < baseY + f.sizeM[1] - 1e-6
                        && Math.abs(px - o.position.x) < hx + (o.sizeM?.[0] ?? o.radiusM * 2) / 2 + 0.1
                        && Math.abs(pz - o.position.z) < hz + (o.sizeM?.[2] ?? o.radiusM * 2) / 2 + 0.1);
                };
                if (!valid(x, z)) {
                    let best = Infinity;
                    const xs = interior.footprint.map(p => p[0]), zs = interior.footprint.map(p => p[1]);
                    for (let px = Math.min(...xs) + hx + 0.05; px <= Math.max(...xs) - hx - 0.05; px += 0.2)
                        for (let pz = Math.min(...zs) + hz + 0.05; pz <= Math.max(...zs) - hz - 0.05; pz += 0.2) {
                            const cost = (px - preferredX) ** 2 + (pz - preferredZ) ** 2;
                            if (cost < best && valid(px, pz)) {
                                best = cost;
                                x = px;
                                z = pz;
                            }
                        }
                }
            }
            // Explicit compound pieces preserve their authored placement. An elevated
            // tabletop or window frame is not a floor-standing solid block.
            const supportFixture = f.support ? byId.get(f.support) : null;
            const onSupport = supportFixture && Math.abs(x - supportFixture.position.x) <= (supportFixture.sizeM?.[0] ?? 0) / 2
                && Math.abs(z - supportFixture.position.z) <= (supportFixture.sizeM?.[2] ?? 0) / 2;
            const baseY = onSupport ? supportFixture.position.y + supportFixture.heightM : 0;
            const o = {
                id: f.id, kind: 'fixture', classId: f.id, label: f.label, material: f.material,
                shape: 'box', porous: f.porous ?? 0,
                position: { x, y: baseY + (f.elevationM ?? 0), z },
                heightM: f.sizeM[1], radiusM: radius, bodyBaseM: 0, stemRadiusM: 0, sizeM: f.sizeM, ...yawFields,
            };
            if (f.enclosure)
                o.enclosure = true;
            placed.push(o);
            byId.set(f.id, o);
            continue;
        }
        // Explicit coordinates are authored placements, including docks over water
        // and objects resting on other fixtures. Repair only automatic placement.
        if (!f.position) {
            const preferredX = x, preferredZ = z;
            const [hx, hz] = rotatedHalfExtents(f.sizeM[0] / 2, f.sizeM[2] / 2, yaw);
            const valid = (px, pz) => {
                if (Math.abs(px) + hx > half - 0.1 || Math.abs(pz) + hz > half - 0.1)
                    return false;
                if (Math.hypot(Math.max(0, Math.abs(px) - hx), Math.max(0, Math.abs(pz) - hz)) < 1.2)
                    return false;
                const probe = { id: f.id, classId: f.id, label: f.label, material: f.material, kind: 'fixture', shape: 'box', porous: 0,
                    position: { x: px, y: 0, z: pz }, sizeM: f.sizeM, heightM: f.sizeM[1], radiusM: radius, yaw, bodyBaseM: 0, stemRadiusM: 0 };
                if (interior && fixtureFootprint(probe).some(([qx, qz]) => insideInteriorFootprint(interior, qx, qz, 0.4)))
                    return false;
                if (world.features.some(feat => (feat.liquid || (feat.kind === 'strip' && !feat.fill)) && feat.id !== f.support && fixtureIntersectsFeature(probe, feat)))
                    return false;
                if (f.support) {
                    const feature = featureById(world, f.support), host = byId.get(f.support);
                    if (feature && !fixtureFootprint(probe).every(([qx, qz]) => featureAt(world, qx, qz)?.id === feature.id))
                        return false;
                    if (host && !fixtureFootprint(probe).every(([qx, qz]) => Math.abs(qx - host.position.x) <= (host.sizeM?.[0] ?? 0) / 2 && Math.abs(qz - host.position.z) <= (host.sizeM?.[2] ?? 0) / 2))
                        return false;
                    if (!feature && !host)
                        return false;
                }
                return !placed.some(o => o.id !== f.support && Math.abs(px - o.position.x) < hx + (o.sizeM?.[0] ?? o.radiusM * 2) / 2 + 0.3 && Math.abs(pz - o.position.z) < hz + (o.sizeM?.[2] ?? o.radiusM * 2) / 2 + 0.3);
            };
            // Evaluate complete constraints atomically. A later push cannot undo an
            // earlier boundary/water constraint, as the old iterative solver did.
            if (!valid(x, z)) {
                let best = Infinity;
                for (let px = -half + hx + 0.1; px <= half - hx - 0.1; px += 0.4)
                    for (let pz = -half + hz + 0.1; pz <= half - hz - 0.1; pz += 0.4) {
                        const cost = (px - preferredX) ** 2 + (pz - preferredZ) ** 2;
                        if (cost < best && valid(px, pz)) {
                            best = cost;
                            x = px;
                            z = pz;
                        }
                    }
                // No feasible footprint stays visibly invalid for admission to report;
                // never silently shrink, omit, or move it outside the world.
            }
        }
        const supportFeature = f.support ? featureById(world, f.support) : null;
        const supportFixture = f.support ? byId.get(f.support) : null;
        const supportY = supportFeature && insideFeature(world, supportFeature.id, x, z)
            ? featureSurfaceYAt(supportFeature, x, z)
            : supportFixture && Math.abs(x - supportFixture.position.x) <= (supportFixture.sizeM?.[0] ?? 0) / 2
                && Math.abs(z - supportFixture.position.z) <= (supportFixture.sizeM?.[2] ?? 0) / 2
                ? supportFixture.position.y + supportFixture.heightM
                : featureAt(world, x, z) ? featureSurfaceYAt(featureAt(world, x, z), x, z) : heightAt(world.heightfield, x, z);
        const o = {
            id: f.id,
            kind: 'fixture',
            classId: f.id,
            label: f.label,
            material: f.material,
            shape: 'box',
            porous: f.porous ?? 0,
            position: { x, y: supportY + (f.elevationM ?? 0), z },
            heightM: f.sizeM[1],
            radiusM: radius,
            bodyBaseM: 0,
            stemRadiusM: 0,
            sizeM: f.sizeM,
            ...yawFields,
        };
        if (f.enclosure)
            o.enclosure = true;
        placed.push(o);
        byId.set(f.id, o);
    }
    // Fixtures displace scattered objects that would stand inside them (tested
    // in each fixture's own frame, so a turned fixture clears what it covers).
    world.objects = world.objects.filter(o => !placed.some(p => {
        const [lx, lz] = fixtureLocalOffset(p, o.position.x, o.position.z);
        return Math.hypot(Math.max(0, Math.abs(lx) - (p.sizeM?.[0] ?? p.radiusM * 2) / 2), Math.max(0, Math.abs(lz) - (p.sizeM?.[2] ?? p.radiusM * 2) / 2))
            < Math.max(o.stemRadiusM, o.porous < 0.5 ? o.radiusM : 0) + 0.3;
    }));
    return placed;
}
/**
 * The point where a ray from the origin at `bearingDeg` meets the walls, the
 * outward normal of the wall it meets, its index, the distance along that
 * wall and the ray length. Ground plane only. Falls back to the farthest
 * wall's midpoint when the ray meets nothing (a degenerate plan).
 */
export function wallHit(walls, bearingDeg) {
    const rad = (bearingDeg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dz = Math.cos(rad);
    let best = null;
    walls.forEach((w, i) => {
        // Ray o + s·d against segment a + t·u, s ≥ 0, 0 ≤ t ≤ len.
        const den = dx * w.uz - dz * w.ux;
        if (Math.abs(den) < 1e-9)
            return;
        const ax = w.a[0], az = w.a[1];
        const sRay = (ax * w.uz - az * w.ux) / den;
        const tWall = (ax * dz - az * dx) / den;
        if (sRay <= 1e-6 || tWall < -1e-6 || tWall > w.lengthM + 1e-6)
            return;
        if (!best || sRay < best.rayM)
            best = { x: dx * sRay, z: dz * sRay, nx: w.nx, nz: w.nz, t: Math.max(0, Math.min(w.lengthM, tWall)), wall: i, rayM: sRay };
    });
    if (best)
        return best;
    const w = walls[0];
    return { x: w.a[0] + w.ux * w.lengthM / 2, z: w.a[1] + w.uz * w.lengthM / 2, nx: w.nx, nz: w.nz, t: w.lengthM / 2, wall: 0, rayM: Math.hypot(w.a[0] + w.ux * w.lengthM / 2, w.a[1] + w.uz * w.lengthM / 2) };
}
/**
 * Apertures and spaces as WorldObjects, so `at <id>` binding, `attachPoint`
 * and the anchor machinery reach them like any fixture. An aperture's raised
 * band is the opening (`bodyBaseM` = sill, `heightM` = sill + h) so `body`
 * attaches at its centre; its `porous` is its `open`. A space's band sits
 * beyond the boundary it is heard through.
 */
function realizeInteriorObjects(spec, walls) {
    const it = spec.interior;
    if (!it)
        return [];
    const [, roomH] = it.sizeM;
    const out = [];
    for (const a of it.apertures) {
        const w = a.sizeM[0];
        const h = Math.min(a.sizeM[1], roomH);
        const base = {
            id: a.id, kind: 'aperture', classId: a.id, label: a.label, material: a.material,
            shape: 'box', porous: a.open, radiusM: w / 2, stemRadiusM: 0,
        };
        if (a.wall === 'ceiling') {
            out.push({ ...base, position: { x: 0, y: 0, z: 0 }, bodyBaseM: roomH - 0.075, heightM: roomH + 0.075, sizeM: [w, 0.15, h], yaw: 0 });
        }
        else if (a.wall === 'floor') {
            out.push({ ...base, position: { x: 0, y: -0.15, z: 0 }, bodyBaseM: 0, heightM: 0.15, sizeM: [w, 0.15, h], yaw: 0 });
        }
        else {
            const place = aperturePlacement(walls, a.wall, a.alongM);
            const sill = Math.max(0, Math.min(a.sillM ?? (roomH - h) / 2, roomH - h));
            out.push({
                ...base,
                position: { x: place.x, y: 0, z: place.z },
                bodyBaseM: sill, heightM: sill + h, sizeM: [w, h, 0.15],
                yaw: Math.atan2(place.nx, place.nz),
            });
        }
    }
    for (const s of it.spaces) {
        const base = {
            id: s.id, kind: 'space', classId: s.id, label: s.label, material: s.material,
            shape: 'box', porous: 0, radiusM: Math.max(1, (s.depthM ?? 3) / 2), stemRadiusM: 0,
        };
        if (s.direction === 'above') {
            out.push({ ...base, position: { x: 0, y: 0, z: 0 }, bodyBaseM: roomH + 0.3, heightM: roomH + 2.3, yaw: 0 });
        }
        else if (s.direction === 'below') {
            out.push({ ...base, position: { x: 0, y: -2.7, z: 0 }, bodyBaseM: 0, heightM: 2.4, yaw: 0 });
        }
        else {
            const hit = wallHit(walls, s.direction);
            const reach = hit.rayM + (s.depthM ?? 3) / 2 + 0.4;
            const rad = (s.direction * Math.PI) / 180;
            out.push({
                ...base,
                position: { x: Math.sin(rad) * reach, y: 0, z: Math.cos(rad) * reach },
                bodyBaseM: 0, heightM: 2.4,
                yaw: Math.atan2(hit.nx, hit.nz),
            });
        }
    }
    return out;
}
/** Build the world. Deterministic in `spec` (including `spec.seed`). */
export function realizeWorld(spec) {
    const rng = createRng(spec.seed);
    const heightfield = buildHeightfield(spec);
    const world = {
        spec,
        heightfield,
        ground: { sizeM: spec.sizeM, res: heightfield.res, step: heightfield.step, index: new Uint8Array(0), palette: [] },
        features: [],
        objects: [],
        droppedInstances: 0,
    };
    if (spec.interior) {
        const it = spec.interior;
        const plan = realizeWalls(it);
        world.interior = { sizeM: it.sizeM, elevationM: it.elevationM, floor: it.floor, walls: it.walls, ceiling: it.ceiling, footprint: interiorFootprint(it), plan, openings: interiorOpenings(it, plan) };
        if (it.rt60S !== undefined)
            world.interior.rt60S = it.rt60S;
    }
    // Choose randomized footprints in the original order, preserving the RNG
    // stream for object placement. Apply terrain from the underlying surfaces
    // upward: the first feature owns an overlap, exactly as featureAt reports.
    // Otherwise a later flat patch refills a channel that still reports water.
    const surfaces = [];
    spec.strips.forEach((s, k) => surfaces.push({ kind: 'strip', source: s,
        path: s.path && s.path.length >= 2 ? s.path
            : defaultPath(spec, rng, 0x2222 + k * 0x1111, rngRange(rng, 5, 12) + s.widthM / 2, s.carveM > 0 ? 6 : 2) }));
    for (const p of spec.patches) {
        const centre = p.centre ?? (() => {
            const b = rngRange(rng, 0, Math.PI * 2), d = rngRange(rng, 8, 16) + p.radiusM;
            return [Math.cos(b) * d, Math.sin(b) * d];
        })();
        surfaces.push({ kind: 'patch', source: p, centre });
    }
    for (let i = surfaces.length - 1; i >= 0; i--) {
        const s = surfaces[i];
        world.features[i] = s.kind === 'strip' ? realizeStrip(spec, s.source, heightfield, s.path)
            : realizePatch(spec, s.source, heightfield, s.centre);
    }
    const { objects, dropped } = scatterObjects(spec, world, rng);
    world.objects = objects;
    world.droppedInstances = dropped;
    const fixtures = placeFixtures(spec, world, rng);
    world.objects = world.objects.concat(fixtures, realizeInteriorObjects(spec, world.interior?.plan ?? []));
    world.ground = buildGround(spec, world);
    return world;
}
//# sourceMappingURL=worldRealize.js.map