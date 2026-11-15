import { parseEntityBehavior } from '../core/EntityBehavior.js';
import { clamp } from '../core/math.js';
import { CONTACT_TAKE_DURATION_S } from '../core/GenRequests.js';
import { parseEntityBody } from '../core/EntityBody.js';
/**
 * An opening in an interior's shell: a window is a glass aperture with a
 * small `open`, a door a wood aperture, a hatch a ceiling one — no kind enum,
 * the material and the numbers say which is which. What is beyond it (`to`)
 * is `outside` or an adjacent space id, and the compiler derives the
 * occlusion of everything heard through this boundary from `open`.
 */
/** The names of a box room's walls, in footprint order (back is -Z, front is +Z ahead of the listener). */
export const BOX_WALL_IDS = ['back', 'right', 'front', 'left'];
/** Contact transients must not overlap as multi-second footsteps. No implicit speech/loop cap. */
export function ecologySoundDurationS(sound) {
    return sound.durationS ?? (sound.mode === 'on' && !sound.voiceId && (sound.on === 'step' || sound.on === 'land') ? CONTACT_TAKE_DURATION_S : undefined);
}
// ── Limits (representation, not content) ─────────────────────────────
export const WORLD_SIZE_MIN_M = 12;
export const WORLD_SIZE_MAX_M = 240;
/**
 * Small by default — like a captured (Marble) world, a place is the tens of
 * metres a listener can hear from where they stand. Bigger only when asked.
 */
export const WORLD_SIZE_DEFAULT_M = 60;
/** Hard cap on scattered instances so the realizer and the renderer stay bounded. */
export const MAX_SCATTER_INSTANCES = 2500;
export const MAX_OBJECT_CLASSES = 16;
export const MAX_FEATURES = 8;
export const MAX_FIXTURES = 24;
/** Pinned individuals (`instance` lines) in one world block. */
export const MAX_INSTANCE_PINS = 64;
/** Openings in an interior's shell. */
export const MAX_APERTURES = 8;
/** Adjacent spaces beyond an interior's boundaries. */
export const MAX_SPACES = 6;
/**
 * Ecology entries. A spec carries the place's whole STATE SPACE — the sources
 * of the described moment plus those silent now that rise with rain, wind,
 * the hour and each control — so it needs room beyond the moment's 10–24.
 */
export const MAX_ECOLOGY = 48;
export const MAX_CONTROLS = 8;
/** Sounds in one entity's repertoire. */
export const MAX_REPERTOIRE = 6;
/** Instances in one population entity. */
export const MAX_POPULATION = 48;
/** Spawn interval of a route entity when the entry names none (s). */
export const DEFAULT_ROUTE_EVERY_S = [6, 14];
/**
 * Signal names the engine publishes or measures itself; a control may not
 * take one of them (its value would shadow, or be shadowed by, the built-in).
 * `velocity` / `accel` / `progress` / `age` are the per-instance signals an
 * entity's members read; `depth` / `submerged` / `liquid` the world fields
 * under the listener (WorldFields.ts).
 */
export const RESERVED_SIGNALS = new Set([
    'hour', 'rain', 'wind', 'fog', 'temp', 'overhead', 'canopy', 'exposure', 'distance', 'closing', 'speed', 'gaze',
    'velocity', 'accel', 'progress', 'age', 'depth', 'submerged', 'liquid',
]);
const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
const str = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const pair = (v, fallback) => {
    if (Array.isArray(v) && v.length === 2) {
        const a = num(v[0], fallback[0]);
        const b = num(v[1], fallback[1]);
        return a <= b ? [a, b] : [b, a];
    }
    if (typeof v === 'number' && isFinite(v))
        return [v, v];
    return fallback;
};
const slug = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
const points = (v) => {
    if (!Array.isArray(v))
        return undefined;
    const out = v.filter((p) => Array.isArray(p) && p.length === 2).map(p => [num(p[0], 0), num(p[1], 0)]);
    return out.length >= 2 ? out : undefined;
};
function normalizeSignalMap(v) {
    if (!v || typeof v !== 'object')
        return undefined;
    const m = v;
    const signal = str(m.signal, '').toLowerCase().split(/\s+/)[0];
    if (!signal)
        return undefined;
    const inR = Array.isArray(m.in) && m.in.length === 2 ? [num(m.in[0], 0), num(m.in[1], 1)] : [0, 1];
    const outR = Array.isArray(m.out) && m.out.length === 2 ? [num(m.out[0], 0), num(m.out[1], 1)] : [0, 1];
    const out = { signal, in: inR, out: outR };
    // `pow` is accepted as an alias — it is the word on the compiled line.
    const curve = typeof m.curve === 'number' ? m.curve : typeof m.pow === 'number' ? m.pow : undefined;
    if (curve !== undefined && isFinite(curve) && curve !== 1)
        out.curve = clamp(curve, 0.1, 6);
    return out;
}
/** Hour windows `[[from, to], …]` clamped into 0–24; undefined when none survive. */
function normalizeHours(v) {
    if (!Array.isArray(v))
        return undefined;
    const windows = v
        .filter((w) => Array.isArray(w) && w.length === 2)
        .map(w => [clamp(num(w[0], 0), 0, 24), clamp(num(w[1], 24), 0, 24)]);
    return windows.length ? windows : undefined;
}
/** Open `{ [signal]: threshold }` map — `rain`, `wind`, or any control id; undefined when empty. */
function normalizeSuppressedBy(v) {
    if (!v || typeof v !== 'object')
        return undefined;
    const s = v;
    const sup = {};
    for (const key of Object.keys(s)) {
        const t = s[key];
        const sigName = key.trim().toLowerCase().split(/\s+/)[0];
        if (sigName && typeof t === 'number' && isFinite(t))
            sup[sigName] = t;
    }
    return Object.keys(sup).length ? sup : undefined;
}
/** The representable emission range, dB SPL at 1 m (the parser's `spl` clamp). */
export const SPL_MAX_DB = 140;
/** An emission in dB SPL at 1 m, clamped into 0–`SPL_MAX_DB`; undefined when absent or not a number. */
function normalizeSpl(v) {
    return typeof v === 'number' && isFinite(v) ? clamp(v, 0, SPL_MAX_DB) : undefined;
}
/** Event names (`emits`, `on`) are lowercase slugs. */
const eventName = (v) => {
    const t = str(v, '');
    return t ? slug(t) : undefined;
};
/**
 * One repertoire member from untrusted input, or null when it has no prompt
 * (or names no event for mode `on`). Ids are slugged and made unique within
 * the entry by the caller's `uniq`.
 */
function normalizeSound(raw, uniq) {
    if (!raw || typeof raw !== 'object')
        return null;
    const s = raw;
    const soundPrompt = str(s.soundPrompt, '');
    if (!soundPrompt)
        return null;
    const mode = s.mode === 'oneshot' || s.mode === 'on' ? s.mode : 'loop';
    const on = mode === 'on' ? eventName(s.on) : undefined;
    if (mode === 'on' && !on)
        return null;
    const label = typeof s.label === 'string' && s.label.trim() ? s.label.trim() : undefined;
    const out = {
        id: uniq(str(s.id, label ?? (on ? `on_${on}` : mode))),
        soundPrompt,
        mode,
        level: clamp(num(s.level, 0.5), 0, 1),
    };
    if (label)
        out.label = label;
    if (typeof s.durationS === 'number' && Number.isFinite(s.durationS) && s.durationS > 0)
        out.durationS = clamp(s.durationS, 0.05, 22);
    if (s.sourceRole === 'ambience' || s.sourceRole === 'source')
        out.sourceRole = s.sourceRole;
    if (typeof s.clip === 'string' && /^[\w/.,'()-]+$/.test(s.clip.trim()) && s.clip.trim().length <= 120)
        out.clip = s.clip.trim();
    if (typeof s.catalog === 'string' && /^[a-z0-9_]+$/.test(s.catalog))
        out.catalog = s.catalog;
    if (on) {
        out.on = on;
        if (typeof s.withinM === 'number' && isFinite(s.withinM))
            out.withinM = clamp(s.withinM, 0.5, 200);
        if (typeof s.responders === 'number' && isFinite(s.responders))
            out.responders = clamp(Math.floor(s.responders), 0, 48);
        if (typeof s.respondChance === 'number' && isFinite(s.respondChance))
            out.respondChance = clamp(s.respondChance, 0, 1);
    }
    if (Array.isArray(s.spreadS) && s.spreadS.length === 2 && s.spreadS.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 30) && s.spreadS[0] <= s.spreadS[1])
        out.spreadS = [s.spreadS[0], s.spreadS[1]];
    // An opaque provider handle: check only the shape it can have, since an
    // unknown one falls back to the scene default server-side.
    if (typeof s.voiceId === 'string' && /^[A-Za-z0-9]{8,40}$/.test(s.voiceId.trim()))
        out.voiceId = s.voiceId.trim();
    if (mode === 'oneshot') {
        if (Array.isArray(s.everyS) || typeof s.everyS === 'number')
            out.everyS = pair(s.everyS, [4, 12]).map(v => Math.max(0.2, v));
        if (typeof s.chance === 'number' && isFinite(s.chance))
            out.chance = clamp(s.chance, 0, 1);
        const pace = normalizeSignalMap(s.pace);
        if (pace && out.everyS)
            out.pace = pace;
    }
    const spl = normalizeSpl(s.splDb ?? s.spl);
    if (spl !== undefined)
        out.splDb = spl;
    const splFollows = normalizeSignalMap(s.splFollows);
    if (splFollows)
        out.splFollows = { ...splFollows, out: [clamp(splFollows.out[0], 0, SPL_MAX_DB), clamp(splFollows.out[1], 0, SPL_MAX_DB)] };
    const follows = normalizeSignalMap(s.follows);
    if (follows)
        out.follows = follows;
    const pitch = normalizeSignalMap(s.pitchFollows);
    if (pitch)
        out.pitchFollows = pitch;
    if (typeof s.variants === 'number' && isFinite(s.variants))
        out.variants = clamp(Math.round(s.variants), 1, 8);
    const emits = eventName(s.emits);
    if (emits)
        out.emits = emits;
    if (typeof s.cooldownS === 'number' && isFinite(s.cooldownS) && s.cooldownS > 0)
        out.cooldownS = s.cooldownS;
    if (typeof s.radiusM === 'number' && isFinite(s.radiusM))
        out.radiusM = clamp(s.radiusM, 0.1, 200);
    const sup = normalizeSuppressedBy(s.suppressedBy);
    if (sup)
        out.suppressedBy = sup;
    const hours = normalizeHours(s.activeHours);
    if (hours)
        out.activeHours = hours;
    return out;
}
/**
 * How an entry with a repertoire compiles: a ROUTE (instances spawned on a
 * strip and travelling it), a POPULATION (instances each perched on its own
 * host object / ground point), or null — no repertoire, or a host that is
 * not a body (`listener`, `air`, `overhead`, a patch's rim), which the
 * compiler renders as plain voices instead.
 */
export function repertoireKind(entry, spec) {
    if (!entry.sounds?.length && !entry.body)
        return null;
    const host = entry.host.toLowerCase();
    if (host === 'listener' || host === 'air' || host === 'overhead' || host === 'horizon')
        return null;
    if (spec.patches.some(p => p.id === host))
        return (entry.population ?? 0) > 0 ? 'population' : null;
    if (spec.strips.some(s => s.id === host))
        return entry.motion === 'line' ? 'population' : 'route';
    return 'population';
}
function normalizeRef(v) {
    if (!v || typeof v !== 'object')
        return undefined;
    const r = v;
    const id = str(r.id, '').toLowerCase();
    if (!id)
        return undefined;
    return { id: id === 'listener' ? 'listener' : slug(id), m: Math.max(0, num(r.m, 0)) };
}
/**
 * Normalize a mask. Also accepts the version-1 fields (`nearWaterM`,
 * `awayFromWaterM`, `nearRoadM`, `awayFromRoadM`, `clearingM`) and maps them
 * onto feature references (`water` / `road` / `listener`).
 */
function normalizeMask(v) {
    if (!v || typeof v !== 'object')
        return undefined;
    const m = v;
    const out = {};
    if (typeof m.slopeMaxDeg === 'number')
        out.slopeMaxDeg = clamp(m.slopeMaxDeg, 0, 90);
    if (typeof m.slopeMinDeg === 'number')
        out.slopeMinDeg = clamp(m.slopeMinDeg, 0, 90);
    if (Array.isArray(m.altitudeM))
        out.altitudeM = pair(m.altitudeM, [-1e9, 1e9]);
    const near = normalizeRef(m.near);
    if (near)
        out.near = near;
    const away = normalizeRef(m.away);
    if (away)
        out.away = away;
    if (typeof m.nearWaterM === 'number')
        out.near = { id: 'water', m: Math.max(0, m.nearWaterM) };
    if (typeof m.awayFromWaterM === 'number')
        out.away = { id: 'water', m: Math.max(0, m.awayFromWaterM) };
    if (typeof m.nearRoadM === 'number')
        out.near = { id: 'road', m: Math.max(0, m.nearRoadM) };
    if (typeof m.awayFromRoadM === 'number')
        out.away = { id: 'road', m: Math.max(0, m.awayFromRoadM) };
    if (typeof m.clearingM === 'number')
        out.away = { id: 'listener', m: Math.max(0, m.clearingM) };
    return Object.keys(out).length ? out : undefined;
}
/**
 * Version-1 object kinds expressed in the representational vocabulary. This
 * is a compatibility map from an old closed enum to geometry, not a taxonomy:
 * new specs describe shape and porosity directly.
 */
const LEGACY_KINDS = {
    tree: { shape: 'blob', porous: 0.7, raised: 0.45, stem: [0.15, 0.4], h: [6, 14], r: [2, 4] },
    shrub: { shape: 'blob', porous: 0.6, raised: 0, stem: [0, 0], h: [0.8, 2], r: [0.6, 1.4] },
    rock: { shape: 'blob', porous: 0, raised: 0, stem: [0, 0], h: [0.4, 1.5], r: [0.4, 1.2] },
    plant: { shape: 'blob', porous: 0.8, raised: 0, stem: [0, 0], h: [0.2, 0.8], r: [0.2, 0.5] },
    building: { shape: 'box', porous: 0, raised: 0, stem: [0, 0], h: [10, 30], r: [6, 12] },
};
function normalizeObjectClass(s, uniq) {
    const legacy = typeof s.kind === 'string' ? LEGACY_KINDS[s.kind] : undefined;
    const shape = s.shape === 'blob' || s.shape === 'column' || s.shape === 'box' ? s.shape : legacy?.shape ?? 'blob';
    const label = str(s.label, typeof s.kind === 'string' ? s.kind : shape);
    const h = pair(s.heightM, legacy?.h ?? [1, 3]);
    const r = pair(s.radiusM, legacy?.r ?? [0.5, 1.5]);
    const stem = pair(s.stemRadiusM, legacy?.stem ?? [0, 0]);
    const density = clamp(num(s.densityPer100m2, 1), 0, 60);
    if (density <= 0)
        return null;
    const out = {
        id: uniq(str(s.id, label)),
        label,
        material: str(s.material, label),
        shape,
        porous: clamp(num(s.porous, legacy?.porous ?? 0), 0, 1),
        densityPer100m2: density,
        heightM: [Math.max(0.05, h[0]), Math.max(0.05, h[1])],
        radiusM: [Math.max(0.05, r[0]), Math.max(0.05, r[1])],
        raised: clamp(num(s.raised, legacy?.raised ?? 0), 0, 0.9),
        stemRadiusM: [Math.max(0, stem[0]), Math.max(0, stem[1])],
    };
    const mask = normalizeMask(s.mask);
    if (mask)
        out.mask = mask;
    return out;
}
function normalizeStrip(s, uniq, defaults = {}) {
    const label = str(s.label, defaults.label ?? 'strip');
    const out = {
        id: uniq(str(s.id, defaults.id ?? label)),
        label,
        widthM: clamp(num(s.widthM, defaults.widthM ?? 6), 0.5, 200),
        material: str(s.material, defaults.material ?? label),
        carveM: clamp(num(s.carveM, defaults.carveM ?? 0), 0, 30),
        liquid: bool(s.liquid, defaults.liquid ?? false),
        flow: clamp(num(s.flow, defaults.flow ?? 0.3), 0, 1),
    };
    const path = points(s.path);
    if (path)
        out.path = path;
    if (s.fill === 'left' || s.fill === 'right')
        out.fill = s.fill;
    else if (defaults.fill)
        out.fill = defaults.fill;
    const edge = typeof s.edgeMaterial === 'string' && s.edgeMaterial.trim() ? s.edgeMaterial.trim() : defaults.edgeMaterial;
    if (edge)
        out.edgeMaterial = edge;
    return out;
}
function normalizePatch(s, uniq, defaults = {}) {
    const label = str(s.label, defaults.label ?? 'patch');
    const out = {
        id: uniq(str(s.id, defaults.id ?? label)),
        label,
        radiusM: clamp(num(s.radiusM, defaults.radiusM ?? 6), 0.5, 120),
        material: str(s.material, defaults.material ?? label),
        carveM: clamp(num(s.carveM, defaults.carveM ?? 0), 0, 30),
        liquid: bool(s.liquid, defaults.liquid ?? false),
    };
    if (Array.isArray(s.centre) && s.centre.length === 2)
        out.centre = [num(s.centre[0], 0), num(s.centre[1], 0)];
    else if (defaults.centre)
        out.centre = defaults.centre;
    const edge = typeof s.edgeMaterial === 'string' && s.edgeMaterial.trim() ? s.edgeMaterial.trim() : defaults.edgeMaterial;
    if (edge)
        out.edgeMaterial = edge;
    return out;
}
/**
 * Controls: ids slugged and unique among controls (their own namespace — a
 * control `traffic` may coexist with a source `traffic`), never a built-in
 * signal name; `value` clamped into `[min, max]`; a missing label is the id.
 */
function normalizeControls(v) {
    const out = [];
    const seen = new Set();
    for (const raw of (Array.isArray(v) ? v : [])) {
        if (!raw || typeof raw !== 'object' || out.length >= MAX_CONTROLS)
            continue;
        const c = raw;
        const label = str(c.label, str(c.id, ''));
        if (!label)
            continue;
        const base = slug(str(c.id, label));
        let id = base;
        let n = 2;
        while (seen.has(id) || RESERVED_SIGNALS.has(id))
            id = `${base}${n++}`;
        seen.add(id);
        let min = num(c.min, 0);
        let max = num(c.max, 1);
        if (min > max)
            [min, max] = [max, min];
        if (min === max)
            max = min + 1;
        const ctl = { id, label, value: clamp(num(c.value, min), min, max), min, max };
        if (typeof c.step === 'number' && isFinite(c.step) && c.step > 0)
            ctl.step = c.step;
        if (typeof c.unit === 'string' && c.unit.trim())
            ctl.unit = c.unit.trim();
        if (typeof c.description === 'string' && c.description.trim())
            ctl.description = c.description.trim();
        out.push(ctl);
    }
    return out;
}
/** Most walls a plan may hold. */
export const MAX_WALLS = 24;
/**
 * The room's footprint on the floor as a closed polygon, listener frame:
 * the plan's corners, or the shoebox's four. Every consumer that asks "is
 * this point in the room" or "where does this bearing meet a wall" works from
 * this, so the box and the plan are one code path.
 */
export function interiorFootprint(it) {
    if (it.plan && it.plan.length >= 3)
        return it.plan.map(w => w.a);
    const hx = it.sizeM[0] / 2, hz = it.sizeM[2] / 2;
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
}
/** Point-in-polygon (even-odd) on the floor. Allocation-free. */
export function pointInFootprint(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
            inside = !inside;
    }
    return inside;
}
/** Shortest distance from a floor point to the polygon's edges, metres. */
export function distanceToFootprintEdge(poly, x, z) {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, az] = poly[j], [bx, bz] = poly[i];
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (d < best)
            best = d;
    }
    return best;
}
/** Signed area (shoelace); positive when the corners run counter-clockwise seen from above (+y). */
export function footprintArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    return a / 2;
}
export function footprintPerimeter(poly) {
    let p = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        p += Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
    return p;
}
/**
 * The interior from untrusted input, or undefined when none is declared.
 * Aperture and space ids share the host namespace (`uniq`), since ecology
 * entries host on them like on any fixture. An aperture whose `to` names an
 * unknown space leads outside — a boundary must lead somewhere.
 */
function normalizeInterior(v, uniq) {
    if (!v || typeof v !== 'object')
        return undefined;
    const raw = v;
    let size = Array.isArray(raw.sizeM) && raw.sizeM.length === 3
        ? [clamp(num(raw.sizeM[0], 4), 1.5, 40), clamp(num(raw.sizeM[1], 2.6), 1.8, 12), clamp(num(raw.sizeM[2], 5), 1.5, 40)]
        : [4, 2.6, 5];
    // The plan: walls in order, closed by chaining (each b is the next a), at
    // least three, ids unique in the host namespace. Width and depth then come
    // from its bounding box; a plan that does not contain the origin is moved
    // so its bbox centre does — the listener is inside by definition.
    let plan;
    if (Array.isArray(raw.plan)) {
        const pt = (q) => Array.isArray(q) && q.length === 2 && isFinite(Number(q[0])) && isFinite(Number(q[1]))
            ? [clamp(Number(q[0]), -40, 40), clamp(Number(q[1]), -40, 40)] : null;
        const corners = [];
        for (const w of raw.plan) {
            if (!w || typeof w !== 'object' || corners.length >= MAX_WALLS)
                continue;
            const r = w;
            const a = pt(r.a);
            if (!a)
                continue;
            corners.push({ a, raw: r });
        }
        if (corners.length >= 3) {
            const poly = corners.map(c => c.a);
            if (!pointInFootprint(poly, 0, 0)) {
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                for (const [x, z] of poly) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minZ = Math.min(minZ, z);
                    maxZ = Math.max(maxZ, z);
                }
                const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
                for (const c of corners)
                    c.a = [c.a[0] - cx, c.a[1] - cz];
            }
            plan = corners.map((c, i) => {
                const next = corners[(i + 1) % corners.length].a;
                const wall = { id: uniq(str(c.raw.id, `wall${i + 1}`)), a: c.a, b: [next[0], next[1]] };
                if (typeof c.raw.material === 'string' && c.raw.material.trim())
                    wall.material = c.raw.material.trim();
                if (typeof c.raw.heightM === 'number' && isFinite(c.raw.heightM) && c.raw.heightM > 0)
                    wall.heightM = clamp(c.raw.heightM, 1.8, 12);
                return wall;
            });
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const w of plan) {
                minX = Math.min(minX, w.a[0]);
                maxX = Math.max(maxX, w.a[0]);
                minZ = Math.min(minZ, w.a[1]);
                maxZ = Math.max(maxZ, w.a[1]);
            }
            size = [Math.max(1.5, maxX - minX), size[1], Math.max(1.5, maxZ - minZ)];
        }
    }
    // A box room's four walls answer to the names the realizer gives them (`realizeWalls`), so an
    // opening can be placed `along` one of them without a `plan` (2026-10-03: moving a door needs it).
    const wallIds = new Set(plan ? plan.map(w => w.id) : BOX_WALL_IDS);
    const wallOf = (w) => {
        if (w === 'ceiling' || w === 'floor')
            return w;
        if (typeof w === 'number' && isFinite(w))
            return w;
        if (typeof w === 'string') {
            const id = slug(w);
            if (wallIds.has(id))
                return id;
            const n = Number(w);
            if (isFinite(n))
                return n;
        }
        return 0;
    };
    const spaces = [];
    for (const s of (Array.isArray(raw.spaces) ? raw.spaces : [])) {
        if (!s || typeof s !== 'object' || spaces.length >= MAX_SPACES)
            continue;
        const r = s;
        const label = str(r.label, 'space');
        const dir = r.direction === 'above' || r.direction === 'below' ? r.direction
            : typeof r.direction === 'number' && isFinite(r.direction) ? r.direction : 0;
        const space = {
            id: uniq(str(r.id, label)),
            label,
            direction: dir,
            material: str(r.material, label),
        };
        if (typeof r.depthM === 'number' && isFinite(r.depthM) && r.depthM > 0)
            space.depthM = clamp(r.depthM, 0.5, 60);
        spaces.push(space);
    }
    const apertures = [];
    for (const a of (Array.isArray(raw.apertures) ? raw.apertures : [])) {
        if (!a || typeof a !== 'object' || apertures.length >= MAX_APERTURES)
            continue;
        const r = a;
        const label = str(r.label, 'aperture');
        const sz = Array.isArray(r.sizeM) && r.sizeM.length === 2
            ? [clamp(num(r.sizeM[0], 1), 0.1, 20), clamp(num(r.sizeM[1], 1.2), 0.1, 10)]
            : [1, 1.2];
        const toRaw = slug(str(r.to, 'outside'));
        const ap = {
            id: uniq(str(r.id, label)),
            label,
            wall: wallOf(r.wall),
            sizeM: sz,
            material: str(r.material, label),
            open: clamp(num(r.open, 0), 0, 1),
            to: toRaw !== 'outside' && spaces.some(s => s.id === toRaw) ? toRaw : 'outside',
        };
        if (typeof r.sillM === 'number' && isFinite(r.sillM))
            ap.sillM = clamp(r.sillM, 0, size[1]);
        if (typeof ap.wall === 'string' && ap.wall !== 'ceiling' && ap.wall !== 'floor' && typeof r.alongM === 'number' && isFinite(r.alongM)) {
            const wall = plan?.find(w => w.id === ap.wall);
            // A box room's back and front walls are its width long, its side walls its depth.
            const lengthM = wall ? Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) : ap.wall === 'back' || ap.wall === 'front' ? size[0] : size[2];
            ap.alongM = clamp(r.alongM, 0, lengthM);
        }
        apertures.push(ap);
    }
    const out = {
        sizeM: size,
        ...(plan ? { plan } : {}),
        floor: str(raw.floor, 'floor'),
        walls: str(raw.walls, 'walls'),
        ceiling: str(raw.ceiling, 'ceiling'),
        elevationM: clamp(num(raw.elevationM, 0), 0, 100),
        apertures,
        spaces,
    };
    if (typeof raw.rt60S === 'number' && isFinite(raw.rt60S) && raw.rt60S > 0)
        out.rt60S = clamp(raw.rt60S, 0.05, 12);
    return out;
}
/**
 * Coerce an untrusted object (LLM output, script text, a version-1 spec) into
 * a valid WorldSpec. Never throws: bad fields fall back to neutral
 * representation defaults, bad list entries are dropped. Ids are slugged and
 * made unique. Version-1 `water` / `road` / `scatter` are mapped onto
 * strips / patches / object classes with the ids `water`, `road`.
 */
export function normalizeWorldSpec(input) {
    const raw = (input && typeof input === 'object' ? input : {});
    const seen = new Set();
    const uniq = (base) => {
        let id = slug(base);
        let n = 2;
        // `outside` is what an aperture's `to` names beyond the shell — an id
        // taking it would make a space unreachable, like the geometric anchors.
        while (seen.has(id) || id === 'listener' || id === 'air' || id === 'ground' || id === 'overhead' || id === 'horizon' || id === 'outside')
            id = `${slug(base)}${n++}`;
        seen.add(id);
        return id;
    };
    const terrainRaw = (raw.terrain ?? {});
    const weatherRaw = (raw.weather ?? {});
    const timeRaw = (raw.time ?? {});
    const ground = (Array.isArray(raw.ground) ? raw.ground : [])
        .filter((g) => !!g && typeof g === 'object')
        .map(g => {
        const layer = { material: str(g.material, 'ground'), weight: Math.max(0, num(g.weight, 1)) };
        const mask = normalizeMask(g.mask);
        if (mask)
            layer.mask = mask;
        return layer;
    })
        .filter(g => g.weight > 0);
    if (!ground.length)
        ground.push({ material: 'ground', weight: 1 });
    const strips = [];
    const patches = [];
    const objects = [];
    // Version-1 water: a river is a carved liquid strip, a pool a liquid patch,
    // a sea a liquid strip with a filled side.
    if (raw.water && typeof raw.water === 'object') {
        const w = raw.water;
        const kind = w.kind;
        const bank = typeof w.bankMaterial === 'string' ? w.bankMaterial : undefined;
        if (kind === 'river') {
            strips.push(normalizeStrip(w, uniq, { id: 'water', label: 'river', widthM: 4, carveM: Math.max(0.4, Math.min(3, num(w.widthM, 4) * 0.25)), liquid: true, flow: 0.3, edgeMaterial: bank }));
        }
        else if (kind === 'pool') {
            patches.push(normalizePatch({ ...w, radiusM: num(w.widthM, 12) / 2 }, uniq, { id: 'water', label: 'pool', carveM: Math.max(0.4, Math.min(3, num(w.widthM, 12) * 0.25)), liquid: true, edgeMaterial: bank }));
        }
        else if (kind === 'sea') {
            strips.push(normalizeStrip({ ...w, fill: 'right' }, uniq, { id: 'water', label: 'sea', widthM: num(w.widthM, 10), carveM: 2, liquid: true, flow: 0.5, edgeMaterial: bank }));
        }
    }
    // Version-1 road: a flat paved strip.
    if (raw.road && typeof raw.road === 'object') {
        strips.push(normalizeStrip(raw.road, uniq, { id: 'road', label: 'road', widthM: 8, carveM: 0, liquid: false, flow: 0.5, material: 'paving' }));
    }
    for (const s of (Array.isArray(raw.strips) ? raw.strips : [])) {
        if (s && typeof s === 'object' && strips.length < MAX_FEATURES)
            strips.push(normalizeStrip(s, uniq));
    }
    for (const p of (Array.isArray(raw.patches) ? raw.patches : [])) {
        if (p && typeof p === 'object' && patches.length < MAX_FEATURES)
            patches.push(normalizePatch(p, uniq));
    }
    for (const list of [raw.objects, raw.scatter]) {
        for (const s of (Array.isArray(list) ? list : [])) {
            if (!s || typeof s !== 'object' || objects.length >= MAX_OBJECT_CLASSES)
                continue;
            const o = normalizeObjectClass(s, uniq);
            if (o)
                objects.push(o);
        }
    }
    const fixtures = (Array.isArray(raw.fixtures) ? raw.fixtures : [])
        .filter((f) => !!f && typeof f === 'object')
        .map(f => {
        const label = str(f.label, 'fixture');
        const size = Array.isArray(f.sizeM) && f.sizeM.length === 3
            ? [clamp(num(f.sizeM[0], 1), 0.005, 60), clamp(num(f.sizeM[1], 1), 0.005, 60), clamp(num(f.sizeM[2], 1), 0.005, 60)]
            : [1, 1, 1];
        const fx = { id: uniq(str(f.id, label)), label, sizeM: size, material: str(f.material, label) };
        if (typeof f.porous === 'number')
            fx.porous = clamp(f.porous, 0, 1);
        if (Array.isArray(f.position) && f.position.length === 2)
            fx.position = [num(f.position[0], 0), num(f.position[1], 0)];
        if (typeof f.support === 'string' && f.support.trim())
            fx.support = slug(f.support);
        if (typeof f.elevationM === 'number' && Number.isFinite(f.elevationM))
            fx.elevationM = clamp(f.elevationM, -20, 100);
        if (typeof f.yawDeg === 'number' && Number.isFinite(f.yawDeg)) {
            const yaw = clamp(f.yawDeg, -360, 360);
            if (yaw !== 0)
                fx.yawDeg = yaw;
        }
        if (f.relativeTo && typeof f.relativeTo === 'object') {
            const r = f.relativeTo;
            const ref = str(r.ref, 'listener').toLowerCase();
            fx.relativeTo = { ref: ref === 'listener' ? 'listener' : slug(ref), distanceM: Math.max(0.5, num(r.distanceM, 5)) };
            if (typeof r.bearingDeg === 'number')
                fx.relativeTo.bearingDeg = r.bearingDeg;
        }
        if (f.enclosure === true)
            fx.enclosure = true;
        if (f.outside === true)
            fx.outside = true;
        return fx;
    })
        .slice(0, MAX_FIXTURES);
    const interior = normalizeInterior(raw.interior, uniq);
    // One pin per entity#index, the last stated wins; order of first appearance kept.
    const pinsByKey = new Map();
    for (const p of (Array.isArray(raw.instancePins) ? raw.instancePins : [])) {
        if (!p || typeof p !== 'object')
            continue;
        const r = p;
        const entity = slug(str(r.entity, ''));
        const index = typeof r.index === 'number' && Number.isFinite(r.index) ? Math.max(0, Math.floor(r.index)) : NaN;
        const pos = Array.isArray(r.position) && r.position.length === 2 ? r.position : null;
        if (!entity || !Number.isFinite(index) || !pos || !pos.every(n => typeof n === 'number' && Number.isFinite(n)))
            continue;
        pinsByKey.set(`${entity}#${index}`, { entity, index, position: [pos[0], pos[1]] });
    }
    const instancePins = [...pinsByKey.values()].slice(0, MAX_INSTANCE_PINS);
    const ecology = (Array.isArray(raw.ecology) ? raw.ecology : [])
        .filter((e) => !!e && typeof e === 'object')
        .map(e => {
        const label = str(e.label, 'source');
        let host = str(e.host, 'ground').toLowerCase();
        // Version-1 geometric anchor: rain on the canopy is rain on whatever is overhead.
        if (host === 'canopy')
            host = 'overhead';
        if (!['listener', 'air', 'ground', 'overhead', 'horizon'].includes(host))
            host = slug(host);
        // A repertoire makes the entry an entity: its own prompt goes unused and
        // its level is a multiplier over the members (so it defaults to 1, not 0.5).
        const sounds = [];
        if (Array.isArray(e.sounds)) {
            const seenSounds = new Set();
            const uniqSound = (base) => {
                let id = slug(base);
                let n = 2;
                while (seenSounds.has(id))
                    id = `${slug(base)}${n++}`;
                seenSounds.add(id);
                return id;
            };
            for (const raw of e.sounds) {
                if (sounds.length >= MAX_REPERTOIRE)
                    break;
                const sound = normalizeSound(raw, uniqSound);
                if (sound)
                    sounds.push(sound);
            }
        }
        const body = parseEntityBody(e.body);
        const entity = sounds.length > 0 || !!body;
        const entry = {
            id: uniq(str(e.id, label)),
            label,
            soundPrompt: str(e.soundPrompt, label),
            host,
            mode: e.mode === 'oneshot' ? 'oneshot' : 'loop',
            level: clamp(num(e.level, entity ? 1 : 0.5), 0, 1),
        };
        if (e.attach === 'body' || e.attach === 'top' || e.attach === 'base' || e.attach === 'inside')
            entry.attach = e.attach;
        if (e.sourceRole === 'ambience' || e.sourceRole === 'source')
            entry.sourceRole = e.sourceRole;
        if (typeof e.concept === 'string' && slug(e.concept))
            entry.concept = slug(e.concept);
        // A clip binding is one script token, including recording-name punctuation —
        // anything else (whitespace, prose) is not a token and is dropped.
        if (typeof e.clip === 'string') {
            const clip = e.clip.trim();
            if (/^[\w/.,'()-]+$/.test(clip) && clip.length <= 120)
                entry.clip = clip;
        }
        if (typeof e.catalog === 'string' && /^[a-z0-9_]+$/.test(e.catalog))
            entry.catalog = e.catalog;
        if (e.motion === 'pass' || e.motion === 'line')
            entry.motion = e.motion;
        if (e.music === true && !entity)
            entry.music = true;
        if (Array.isArray(e.states)) {
            const states = [];
            for (const raw of e.states.slice(0, 8)) {
                const st = raw;
                const name = typeof st?.name === 'string' ? st.name.trim().slice(0, 60) : '';
                const h = Array.isArray(st?.hours) && st.hours.length === 2 && st.hours.every(n => typeof n === 'number' && Number.isFinite(n)) ? st.hours : null;
                if (!name)
                    continue;
                const sounds = Array.isArray(st.sounds) ? st.sounds.filter((x) => typeof x === 'string').map(x => x.trim()).filter(Boolean) : undefined;
                // No hours: a state reached only by an edit, which means nothing without the sounds it makes.
                if (!h && !sounds?.length)
                    continue;
                states.push({ name, ...(h ? { hours: [clamp(h[0], 0, 24), clamp(h[1], 0, 24)] } : {}), ...(sounds?.length ? { sounds } : {}) });
            }
            if (states.length)
                entry.states = states;
        }
        if (entity)
            entry.sounds = sounds;
        if (body)
            entry.body = body;
        if (entity && e.behavior !== undefined) {
            const behavior = parseEntityBehavior(e.behavior);
            if (behavior) {
                entry.behavior = behavior;
                delete entry.states;
            }
        }
        const kind = repertoireKind({ ...entry, population: typeof e.population === 'number' ? e.population : undefined }, { strips, patches });
        // A gait belongs to BOTH shapes: a route body walking its strip and a
        // population individual walking between anchors both cover ground, and
        // both should put a foot down every stride of it. It lived in the route
        // branch, so turning the presets' people into populations silently
        // dropped their footsteps.
        // Bounded like the DSL's `gait` (Entities.ts GAIT_STRIDE_*): a stride
        // outside that band is a typo, and a body that silently never steps is
        // worse than one that never had a gait.
        if (kind && (Array.isArray(e.gaitM) || typeof e.gaitM === 'number')) {
            entry.gaitM = pair(e.gaitM, [0.75, 0.75]).map(v => clamp(v, 0.05, 20));
        }
        if (kind === 'route') {
            // The entry's interval is the route's spawn interval.
            entry.everyS = pair(e.everyS, DEFAULT_ROUTE_EVERY_S).map(v => Math.max(0.2, v));
            if (Array.isArray(e.speedMs) || typeof e.speedMs === 'number')
                entry.speedMs = pair(e.speedMs, [1, 1]).map(v => clamp(v, 0.1, 80));
            if (e.stop && typeof e.stop === 'object') {
                const st = e.stop;
                const chance = clamp(num(st.chance, 0), 0, 1);
                if (chance > 0)
                    entry.stop = { chance, s: pair(st.s, [3, 12]).map(v => Math.max(0.2, v)) };
            }
        }
        else if (kind === 'population') {
            if (typeof e.population === 'number' && isFinite(e.population))
                entry.population = clamp(Math.round(e.population), 1, MAX_POPULATION);
            // The individuals' behaviour, all numbers, each optional (see EcologyEntry).
            const bandOf = (v, lo, hi) => {
                if (!(Array.isArray(v) || typeof v === 'number'))
                    return undefined;
                const b = pair(v, [lo, lo]).map(x => clamp(x, lo, hi));
                return b[0] <= b[1] ? b : [b[1], b[0]];
            };
            const speed = bandOf(e.speedMs, 0.1, 80);
            if (speed)
                entry.speedMs = speed;
            const dwell = bandOf(e.dwellS, 0.2, 3600);
            if (dwell)
                entry.dwellS = dwell;
            const reloc = bandOf(e.relocateM, 0, 500);
            if (reloc && reloc[1] > 0)
                entry.relocateM = reloc;
            if (e.travel === 'fly' || e.travel === 'walk')
                entry.travel = e.travel;
            if (typeof e.startleM === 'number' && isFinite(e.startleM) && e.startleM > 0)
                entry.startleM = clamp(e.startleM, 0, 500);
            const hush = bandOf(e.hushS, 0, 3600);
            if (hush)
                entry.hushS = hush;
            if (typeof e.callChance === 'number' && isFinite(e.callChance))
                entry.callChance = clamp(e.callChance, 0, 1);
            if (typeof e.callers === 'number' && isFinite(e.callers) && e.callers > 0)
                entry.callers = clamp(Math.round(e.callers), 1, MAX_POPULATION);
            const gap = bandOf(e.gapS, 0, 3600);
            if (gap && gap[1] > 0)
                entry.gapS = gap;
            if (typeof e.voices === 'number' && isFinite(e.voices) && e.voices > 0)
                entry.voices = clamp(Math.round(e.voices), 1, MAX_POPULATION);
            if (typeof e.windowM === 'number' && isFinite(e.windowM) && e.windowM > 0)
                entry.windowM = clamp(e.windowM, 1, 5000);
            if (typeof e.swayM === 'number' && isFinite(e.swayM) && e.swayM > 0)
                entry.swayM = clamp(e.swayM, 0, 5);
        }
        else if (entry.mode === 'oneshot') {
            entry.everyS = pair(e.everyS, [4, 12]).map(v => Math.max(0.2, v));
        }
        const hours = normalizeHours(e.activeHours);
        if (hours)
            entry.activeHours = hours;
        // Open map: `{ rain, wind }` as before, or any signal / control id.
        const sup = normalizeSuppressedBy(e.suppressedBy);
        if (sup)
            entry.suppressedBy = sup;
        if (e.extent === 'point' || e.extent === 'radius' || e.extent === 'ring' || e.extent === 'bed' || e.extent === 'line')
            entry.extent = e.extent;
        if (typeof e.radiusM === 'number')
            entry.radiusM = clamp(e.radiusM, 0.1, 200);
        const spl = normalizeSpl(e.splDb ?? e.spl);
        if (spl !== undefined)
            entry.splDb = spl;
        const follows = normalizeSignalMap(e.follows);
        if (follows)
            entry.follows = follows;
        const pace = normalizeSignalMap(e.pace);
        if (pace)
            entry.pace = pace;
        if (typeof e.variants === 'number' && isFinite(e.variants))
            entry.variants = clamp(Math.round(e.variants), 1, 8);
        return entry;
    })
        .slice(0, MAX_ECOLOGY);
    return {
        version: 2,
        biome: str(raw.biome, 'open ground'),
        seed: Math.floor(num(raw.seed, 1)) >>> 0,
        sizeM: clamp(num(raw.sizeM, WORLD_SIZE_DEFAULT_M), WORLD_SIZE_MIN_M, WORLD_SIZE_MAX_M),
        terrain: {
            reliefM: clamp(num(terrainRaw.reliefM, 4), 0, 60),
            roughness: clamp(num(terrainRaw.roughness, 0.4), 0, 1),
        },
        ground,
        strips,
        patches,
        objects,
        fixtures,
        ...(interior ? { interior } : {}),
        weather: {
            rain: clamp(num(weatherRaw.rain, 0), 0, 1),
            wind: clamp(num(weatherRaw.wind, 0.2), 0, 1),
            fog: clamp(num(weatherRaw.fog, 0), 0, 1),
        },
        time: {
            hour: clamp(num(timeRaw.hour, 10), 0, 24),
            season: str(timeRaw.season, 'summer'),
            temperatureC: clamp(num(timeRaw.temperatureC, 18), -40, 50),
            clockRate: clamp(num(timeRaw.clockRate, 0), 0, 1440),
        },
        controls: normalizeControls(raw.controls),
        ecology,
        ...(instancePins.length ? { instancePins } : {}),
    };
}
/** Stable JSON for embedding in a script / hashing (sorted keys, no whitespace). */
export function serializeWorldSpec(spec) {
    const sortKeys = (v) => {
        if (Array.isArray(v))
            return v.map(sortKeys);
        if (v && typeof v === 'object') {
            const o = v;
            return Object.keys(o).sort().reduce((acc, k) => {
                if (o[k] !== undefined)
                    acc[k] = sortKeys(o[k]);
                return acc;
            }, {});
        }
        return v;
    };
    return JSON.stringify(sortKeys(spec));
}
/** Parse a JSON string (possibly wrapped in prose / fences) into a WorldSpec, or null when no object is found. */
export function parseWorldSpecJSON(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start)
        return null;
    try {
        return normalizeWorldSpec(JSON.parse(text.slice(start, end + 1)));
    }
    catch {
        return null;
    }
}
/** The geometric anchors a host may name besides a feature / class / fixture id. */
export const GEOMETRIC_HOSTS = ['listener', 'air', 'ground', 'overhead', 'horizon'];
/** The per-instance body signals only a ROUTE's members can meaningfully read. */
const BODY_MOTION_SIGNALS = new Set(['velocity', 'accel', 'progress']);
/**
 * Structural problems `normalizeWorldSpec` cannot silently fix — category
 * errors that survive normalization and produce a scene that LOOKS valid but
 * cannot do what it says (the Boston failure: a "passing car" perched on a
 * window fixture, members reading `velocity` on a body that never moves).
 * `generateWorldSpec` quotes these back to the model for one repair round;
 * they are sentences addressed to it, not error codes.
 */
export function worldSpecIssues(spec) {
    const issues = [];
    const knownHost = (host) => {
        const h = host.toLowerCase();
        return GEOMETRIC_HOSTS.includes(h)
            || spec.strips.some(s => s.id === h)
            || spec.patches.some(p => p.id === h)
            || spec.objects.some(o => o.id === h)
            || spec.fixtures.some(f => f.id === h)
            || !!spec.interior?.apertures.some(a => a.id === h)
            || !!spec.interior?.spaces.some(s => s.id === h);
    };
    for (const entry of spec.ecology) {
        if (!knownHost(entry.host)) {
            issues.push(`"${entry.id}" hosts on "${entry.host}", which nothing in the spec defines — it will fall back to an arbitrary nearby point. Host it on a real strip / patch / object class / fixture / aperture / space id, or a geometric anchor.`);
        }
        const kind = repertoireKind(entry, spec);
        if (kind !== 'route') {
            // A population that relocates (it travels, dwells or relocates: an agent) HAS a speed and an
            // acceleration while it moves between perches; only `progress` belongs to a route alone. Until
            // 2026-10-03 every non-route reader was refused and the model was told to put the body on a
            // strip, which turned a flock that flies into passing traffic that can never fly: the "birds
            // flying" request then failed, and no repair could satisfy both rules.
            const moves = !!(entry.travel || entry.dwellS || entry.relocateM);
            const dead = (signal) => signal === 'progress' || (!moves && BODY_MOTION_SIGNALS.has(signal));
            const signals = [...new Set((entry.sounds ?? []).flatMap(sd => [sd.splFollows, sd.follows, sd.pitchFollows]).filter(m => m && dead(m.signal)).map(m => m.signal))];
            if (signals.length) {
                issues.push(`"${entry.id}" has members reading ${signals.join('/')}, but it never moves along a route, so ${signals.length === 1 ? 'that signal stays' : 'those signals stay'} 0. ${signals.includes('progress') ? 'Only a body passing along a strip (motion "pass") has progress; read velocity instead. ' : ''}To make it move where it lives, give it travel ("fly" or "walk") with relocateM, dwellS and speedMs so it moves between perches; if it passes by and is gone, host it on a strip with motion "pass".`);
            }
        }
    }
    // Loudness is physics: every source states its emission. A plain entry
    // needs `splDb`; an entity's members inherit the entry's default, so a
    // member is covered by its own `splDb` / `splFollows` or that default.
    // One sentence names the whole list — the model fixes it in one round.
    const unstated = spec.ecology
        .filter(entry => entry.sounds
        ? entry.splDb === undefined && entry.sounds.some(sd => sd.splDb === undefined && !sd.splFollows)
        : entry.splDb === undefined)
        .map(entry => entry.id);
    if (unstated.length) {
        issues.push(`No stated emission for: ${unstated.join(', ')}. Loudness is physics — every source (and every repertoire member, or its entry-level default) states splDb, the dB SPL at 1 m of what the thing IS; the engine computes what arrives from distance and walls.`);
    }
    // Source density is a brief-dependent composition decision. A continuous
    // recording can contain natural variation; forcing extra events here
    // made a quiet shore impossible to author. The final scene review judges fit.
    return issues;
}
//# sourceMappingURL=worldSpec.js.map