/** Snap distance when chaining wall endpoints into the polygon, metres. RoomPlan's own drift is a few centimetres per wall. */
export const ROOMPLAN_SNAP_M = 0.35;
function num(v, d = 0) { return typeof v === 'number' && isFinite(v) ? v : d; }
function readVec3(v) {
    if (Array.isArray(v) && v.length >= 3)
        return [num(v[0]), num(v[1]), num(v[2])];
    if (v && typeof v === 'object') {
        const o = v;
        if ('x' in o)
            return [num(o.x), num(o.y), num(o.z)];
        if ('width' in o)
            return [num(o.width), num(o.height), num(o.depth)];
    }
    return null;
}
/** Column-major 4×4 → centre (column 3) and the unit x axis (column 0). */
function readTransform(v) {
    let m = null;
    if (Array.isArray(v) && v.length === 16 && v.every(n => typeof n === 'number'))
        m = v;
    else if (Array.isArray(v) && v.length === 4 && v.every(c => Array.isArray(c) && c.length === 4))
        m = v.flat();
    else if (v && typeof v === 'object' && 'columns' in v) {
        const cols = v.columns;
        if (Array.isArray(cols) && cols.length === 4)
            m = cols.map(c => readVec3(c) ? [...readVec3(c), num(c?.w ?? (Array.isArray(c) ? c[3] : 0))] : [0, 0, 0, 0]).flat();
    }
    if (!m || m.length !== 16)
        return null;
    const ax = [m[0], m[1], m[2]];
    const len = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    return { centre: [m[12], m[13], m[14]], axisX: [ax[0] / len, ax[1] / len, ax[2] / len] };
}
/** `{"door":{"isOpen":true}}`, `{"wall":{}}`, or `"wall"` → the word (+ isOpen). */
function readCategory(v) {
    if (typeof v === 'string' && v.trim())
        return { category: v.trim().toLowerCase() };
    if (v && typeof v === 'object') {
        const keys = Object.keys(v);
        if (keys.length === 1) {
            const inner = v[keys[0]];
            const out = { category: keys[0].toLowerCase() };
            if (inner && typeof inner === 'object' && typeof inner.isOpen === 'boolean')
                out.isOpen = inner.isOpen;
            return out;
        }
    }
    return null;
}
function readSurface(v, fallbackCategory, index) {
    if (!v || typeof v !== 'object')
        return null;
    const o = v;
    const t = readTransform(o.transform);
    const dims = readVec3(o.dimensions);
    if (!t || !dims)
        return null;
    const cat = readCategory(o.category) ?? { category: fallbackCategory };
    const parent = typeof o.parentIdentifier === 'string' ? o.parentIdentifier : null;
    const s = {
        id: typeof o.identifier === 'string' && o.identifier ? o.identifier : `${fallbackCategory}-${index}`,
        category: cat.category, parentId: parent, centre: t.centre, axisX: t.axisX,
        dimensions: [Math.abs(dims[0]), Math.abs(dims[1]), Math.abs(dims[2])],
    };
    if (cat.isOpen !== undefined)
        s.isOpen = cat.isOpen;
    return s;
}
/**
 * Read a RoomPlan `CapturedRoom` (or a `CapturedStructure`'s first room)
 * from parsed JSON. Null when it is not one: needs a `walls` array with at
 * least one readable wall.
 */
export function parseRoomPlan(json) {
    if (!json || typeof json !== 'object')
        return null;
    let root = json;
    if (!Array.isArray(root.walls) && Array.isArray(root.rooms) && root.rooms.length)
        root = root.rooms[0];
    if (!Array.isArray(root.walls))
        return null;
    const list = (key, fallback) => (Array.isArray(root[key]) ? root[key] : []).map((v, i) => readSurface(v, fallback, i)).filter((s) => !!s);
    const walls = list('walls', 'wall');
    if (!walls.length)
        return null;
    return { walls, doors: list('doors', 'door'), windows: list('windows', 'window'), openings: list('openings', 'opening'), objects: list('objects', 'object') };
}
/** RoomPlan (x right, y up, −z ahead) → Satie's listener frame (x right, y up, +z ahead). */
function toSatie(p) { return [p[0], p[1], -p[2]]; }
/** A wall's floor-line endpoints in Satie's frame, ordered along its own x axis. */
function wallSegment(w) {
    const c = toSatie(w.centre);
    const ax = toSatie(w.axisX);
    const half = w.dimensions[0] / 2;
    return {
        id: w.id,
        a: [c[0] - ax[0] * half, c[2] - ax[2] * half],
        b: [c[0] + ax[0] * half, c[2] + ax[2] * half],
        heightM: w.dimensions[1],
        floorY: c[1] - w.dimensions[1] / 2,
    };
}
const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
/**
 * Chain wall segments end to end into one loop: from the longest wall, keep
 * taking the unused wall whose nearer endpoint is closest to the loop's open
 * end (flipping it as needed), stop when the open end returns to the start
 * or nothing is within reach. Walls not on the loop — partitions, a second
 * room's walls in a structure scan — are left out. Returns the loop's walls
 * in order, endpoints snapped to their neighbours.
 */
export function chainWalls(segments) {
    if (segments.length < 3)
        return [];
    const used = new Set();
    const cur = segments.reduce((best, s, i) => (d2(s.a, s.b) > d2(segments[best].a, segments[best].b) ? i : best), 0);
    const loop = [{ ...segments[cur] }];
    used.add(cur);
    const start = loop[0].a;
    for (let guard = 0; guard < segments.length; guard++) {
        const end = loop[loop.length - 1].b;
        if (loop.length >= 3 && d2(end, start) <= ROOMPLAN_SNAP_M)
            break;
        let bestI = -1, bestD = Infinity, flip = false;
        segments.forEach((s, i) => {
            if (used.has(i))
                return;
            const da = d2(end, s.a), db = d2(end, s.b);
            if (da < bestD) {
                bestD = da;
                bestI = i;
                flip = false;
            }
            if (db < bestD) {
                bestD = db;
                bestI = i;
                flip = true;
            }
        });
        if (bestI < 0 || bestD > ROOMPLAN_SNAP_M * 3)
            break;
        const s = segments[bestI];
        const next = flip ? { ...s, a: s.b, b: s.a } : { ...s };
        // Snap the joint: the previous wall's end becomes this wall's start.
        loop[loop.length - 1].b = [(end[0] + next.a[0]) / 2, (end[1] + next.a[1]) / 2];
        next.a = loop[loop.length - 1].b;
        loop.push(next);
        used.add(bestI);
    }
    if (loop.length < 3)
        return [];
    // Close the loop at the start.
    const last = loop[loop.length - 1];
    const joint = [(last.b[0] + start[0]) / 2, (last.b[1] + start[1]) / 2];
    last.b = joint;
    loop[0].a = joint;
    return loop;
}
function slugId(s, fallback) {
    const id = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return id || fallback;
}
/**
 * The capture as a partial WorldSpec: the interior's plan, its apertures on
 * their walls, and the furniture as fixtures, everything translated so the
 * listener stands at the floor polygon's centroid. Null when the walls do
 * not make a room. Pass the result to `normalizeWorldSpec` (which closes the
 * plan, derives the size and uniques the ids).
 */
export function roomPlanToWorldSpec(capture, opts = {}) {
    const loop = chainWalls(capture.walls.map(wallSegment));
    if (loop.length < 3)
        return null;
    const floorY = loop.reduce((s, w) => s + w.floorY, 0) / loop.length;
    const heightM = Math.max(1.8, ...loop.map(w => w.heightM));
    // Centroid of the polygon (area-weighted), the listener's spot.
    let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < loop.length; i++) {
        const p = loop[i].a, q = loop[(i + 1) % loop.length].a;
        const cross = p[0] * q[1] - q[0] * p[1];
        area += cross;
        cx += (p[0] + q[0]) * cross;
        cz += (p[1] + q[1]) * cross;
    }
    if (Math.abs(area) < 1e-6) {
        cx = loop.reduce((s, w) => s + w.a[0], 0) / loop.length;
        cz = loop.reduce((s, w) => s + w.a[1], 0) / loop.length;
    }
    else {
        cx /= 3 * area;
        cz /= 3 * area;
    }
    const shift = (p) => [+(p[0] - cx).toFixed(3), +(p[1] - cz).toFixed(3)];
    const usedIds = new Set();
    const uniq = (base) => { let id = base, n = 2; while (usedIds.has(id))
        id = `${base}${n++}`; usedIds.add(id); return id; };
    const plan = loop.map((w, i) => {
        const wall = { id: uniq(`wall${i + 1}`), a: shift(w.a), b: shift(w.b) };
        if (Math.abs(w.heightM - heightM) > 0.05)
            wall.heightM = +w.heightM.toFixed(2);
        return wall;
    });
    const byCapturedId = new Map(loop.map((w, i) => [w.id, i]));
    // An opening goes on its parent wall when that wall made the loop, else on
    // the loop wall nearest its centre; `alongM` is the centre projected onto
    // the wall from its first end.
    const placeOn = (s) => {
        const c = toSatie(s.centre);
        const p = shift([c[0], c[2]]);
        let wi = s.parentId !== null ? (byCapturedId.get(s.parentId) ?? -1) : -1;
        if (wi < 0) {
            let best = Infinity;
            plan.forEach((w, i) => {
                const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
                const len2 = dx * dx + dz * dz || 1;
                const t = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dz) / len2));
                const d = Math.hypot(p[0] - (w.a[0] + dx * t), p[1] - (w.a[1] + dz * t));
                if (d < best) {
                    best = d;
                    wi = i;
                }
            });
        }
        const w = plan[wi];
        const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
        const len = Math.hypot(dx, dz) || 1;
        const along = ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dz) / len;
        return { wall: wi, alongM: +Math.max(0, Math.min(len, along)).toFixed(2) };
    };
    const apertures = [];
    const addAperture = (s, kind) => {
        const { wall, alongM } = placeOn(s);
        const c = toSatie(s.centre);
        const w = s.dimensions[0], h = s.dimensions[1];
        const sill = Math.max(0, c[1] - h / 2 - floorY);
        const a = {
            id: uniq(slugId(s.category === kind ? kind : `${s.category}_${kind}`, kind)),
            label: kind === 'door' ? (s.isOpen ? 'open door' : 'door') : kind === 'window' ? 'window' : 'open doorway',
            wall: plan[wall].id, alongM, sizeM: [+w.toFixed(2), +h.toFixed(2)], sillM: +sill.toFixed(2),
            material: kind === 'window' ? 'window glass' : kind === 'door' ? 'door' : 'open air',
            open: kind === 'opening' ? 1 : kind === 'door' ? (s.isOpen ? 1 : 0) : 0,
            to: 'outside',
        };
        apertures.push(a);
    };
    for (const d of capture.doors)
        addAperture(d, 'door');
    for (const w of capture.windows)
        addAperture(w, 'window');
    for (const o of capture.openings)
        addAperture(o, 'opening');
    const fixtures = capture.objects.map((o) => {
        const c = toSatie(o.centre);
        const [x, z] = shift([c[0], c[2]]);
        return {
            id: uniq(slugId(o.category, 'object')), label: o.category, material: o.category,
            sizeM: [+o.dimensions[0].toFixed(2), +o.dimensions[1].toFixed(2), +o.dimensions[2].toFixed(2)],
            position: [x, z],
        };
    });
    const name = opts.name?.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return {
        biome: name ? `${name}, a scanned room` : 'a scanned room',
        sizeM: 40,
        terrain: { reliefM: 0, roughness: 0 },
        ground: [{ material: 'ground', weight: 1 }],
        strips: [], patches: [], objects: [],
        fixtures,
        interior: {
            sizeM: [1, +heightM.toFixed(2), 1],
            plan, floor: 'floor', walls: 'walls', ceiling: 'ceiling', elevationM: 0,
            apertures, spaces: [],
        },
        ecology: [],
    };
}
/** One line for the chat: what the capture held. */
export function describeRoomPlan(capture, spec) {
    const it = spec.interior;
    const walls = it?.plan?.length ?? 0;
    const parts = [`${walls} wall${walls === 1 ? '' : 's'}`];
    const n = (k, one, many) => { const c = capture[k].length; if (c)
        parts.push(`${c} ${c === 1 ? one : many}`); };
    n('doors', 'door', 'doors');
    n('windows', 'window', 'windows');
    n('openings', 'opening', 'openings');
    n('objects', 'piece of furniture', 'pieces of furniture');
    return parts.join(', ');
}
//# sourceMappingURL=roomPlan.js.map