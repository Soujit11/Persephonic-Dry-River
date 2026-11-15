/**
 * The `world` block — WorldSpec written as Satie DSL, so the recipe for a
 * procedural world lives INSIDE the script next to the voices it hosts.
 *
 *   world temperate broadleaf forest
 *     seed 41
 *     size 100
 *     terrain relief 5 roughness 0.5
 *     ground leaf litter weight 1
 *     ground grass weight 0.8 slope 0to12
 *     strip brook mountain stream width 4 material clear water over pebbles carve 1 liquid flow 0.4 edge wet mud
 *     patch pond still pond radius 6 material dark water carve 1.2 liquid edge mud
 *     object oak blob old oak density 2 height 8to14 radius 2.5to4 material broad leaves porous 0.7 raised 0.45 stem 0.15to0.4 away brook 3
 *     object tower box office tower density 0.5 height 30to70 radius 10to16 material limestone away avenue 4
 *     fixture campfire campfire size 1x0.6x1 material wood and ash near listener 4 bearing 30
 *     fixture bench park bench size 1.8x0.9x0.5 material slatted wood at 3,-2 rotate 90
 *     instance kids 1 at 4.5,-3
 *     weather rain 0.1 wind 0.3 fog 0.2
 *     time 05:30 season late spring temp 12 clock 20
 *     control traffic avenue traffic value 0.7 range 0to1
 *     control crowd how crowded the sidewalk is value 0.5 range 0to1 step 0.05 unit %
 *
 * Every line is `<kind> [id] [shape] <free text…> [key value]…`: the free
 * text runs until the first keyword of that line kind. Labels and materials
 * are open vocabulary; the keywords are geometry and acoustics. `control`
 * lines are the scene's OWN state dimensions (the model's, per place); each
 * is published as a signal by id. Ecology is NOT in the block — it is the
 * voices themselves (`at <host>`), which is the whole point. Version-1 lines
 * (`water`, `road`, `scatter … tree|shrub|rock|plant|building`) still parse
 * and map onto strips / patches / objects.
 *
 * Transforms (2026-10-02, docs/architecture/scene-objects-contract.md): a
 * fixture's `rotate <deg>` is its yaw about +Y (three.js `rotation.y` sense,
 * written only when nonzero); `instance <entity> <n> at x,z` pins the n-th
 * individual (0-based) of an entity population to a ground position. The
 * entity itself stays a script block whose `at` names a HOST, never a place,
 * so a pin is the only per-person position the document carries.
 * `updateWorldBlockEntry` rewrites exactly one of these lines in place and
 * `readWorldBlockEntry` reads one back, so an edit and its inverse are both
 * byte-exact on the untouched parts of the line.
 *
 * `parseWorldBlock` and `formatWorldBlock` round-trip: a spec formatted then
 * parsed is the same spec (ecology aside).
 */
import { normalizeWorldSpec, WORLD_SIZE_DEFAULT_M, } from './worldSpec.js';
/** Keywords that end the free-text run and introduce a value, per line kind. */
const MASK_KEYS = ['slope', 'altitude', 'near', 'away', 'clearing'];
const KEYS = {
    ground: ['weight', ...MASK_KEYS],
    strip: ['width', 'material', 'carve', 'liquid', 'flow', 'fill', 'edge', 'path'],
    patch: ['radius', 'material', 'carve', 'liquid', 'centre', 'center', 'edge'],
    object: ['density', 'height', 'radius', 'material', 'porous', 'raised', 'stem', 'rustle', ...MASK_KEYS],
    fixture: ['size', 'material', 'porous', 'at', 'near', 'bearing', 'enclosure', 'outside', 'support', 'elevation', 'rotate'],
    instance: ['at'],
    interior: ['size', 'floor', 'walls', 'ceiling', 'rt60', 'elevation'],
    aperture: ['wall', 'along', 'size', 'sill', 'material', 'open', 'to'],
    wall: ['from', 'to', 'height', 'material'],
    space: ['beyond', 'depth', 'material'],
    weather: ['rain', 'wind', 'fog'],
    time: ['season', 'temp', 'clock'],
    control: ['value', 'range', 'step', 'unit'],
    terrain: ['relief', 'roughness'],
    // Version-1 lines.
    water: ['width', 'flow', 'bank', 'path', 'centre', 'center', 'shore'],
    road: ['width', 'material', 'path'],
};
/**
 * Where each keyed run begins and ends in a token list: the free text is
 * `tokens[0, textEnd)`, then every range is a key and its value tokens up to
 * the next key. Shared by the parser (`splitKeyed`) and the line editor
 * (`updateWorldBlockEntry`) so both cut a line at the same places.
 */
function keyRanges(tokens, keys) {
    const isKey = (t) => keys.includes(t.toLowerCase());
    let i = 0;
    while (i < tokens.length && !isKey(tokens[i]))
        i++;
    const textEnd = i;
    const ranges = [];
    while (i < tokens.length) {
        const start = i;
        const key = tokens[i++].toLowerCase();
        // A reference occupies a grammar slot, even when its identifier is also
        // a property keyword (`near clearing 5`, `away height 2`). Splitting at
        // that identifier silently discarded the authored placement constraint.
        if (key === 'near' || key === 'away') {
            const count = tokens[i]?.toLowerCase() === 'from' ? 3 : 2;
            if (/^[a-z0-9_-]+$/i.test(tokens[i + count - 2] ?? '')
                && /^-?\d*\.?\d+$/.test(tokens[i + count - 1] ?? ''))
                i += count;
        }
        while (i < tokens.length && !isKey(tokens[i]))
            i++;
        ranges.push({ key, start, end: i });
    }
    return { textEnd, ranges };
}
/**
 * Split `<free text…> key value key value…` at the first occurrence of each
 * known key. Values run until the next key; a key with no value (a flag such
 * as `liquid`) maps to ''. Repeated keys keep the last.
 */
function splitKeyed(tokens, keys) {
    const { textEnd, ranges } = keyRanges(tokens, keys);
    const args = new Map();
    for (const r of ranges)
        args.set(r.key, tokens.slice(r.start + 1, r.end).join(' '));
    return { text: tokens.slice(0, textEnd).join(' '), args };
}
const numOr = (v, fallback) => {
    if (v === undefined)
        return fallback;
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
};
function rangeOf(v) {
    if (!v)
        return undefined;
    const m = v.trim().match(/^(-?\d*\.?\d+)\s*(?:to\s*(-?\d*\.?\d+))?$/i);
    if (!m)
        return undefined;
    const a = parseFloat(m[1]);
    const b = m[2] !== undefined ? parseFloat(m[2]) : a;
    return [Math.min(a, b), Math.max(a, b)];
}
function pointsOf(v) {
    if (!v)
        return undefined;
    const pts = [];
    for (const tok of v.split(/\s+/)) {
        const m = tok.match(/^(-?\d*\.?\d+),(-?\d*\.?\d+)$/);
        if (m)
            pts.push([parseFloat(m[1]), parseFloat(m[2])]);
    }
    return pts.length ? pts : undefined;
}
/** `near <id> <m>` / `away <id> <m>` — also the version-1 `near water 6` / `away from water 3`. */
function refOf(v) {
    if (!v)
        return undefined;
    const m = v.trim().match(/^(?:from\s+)?([a-z0-9_-]+)\s+(-?\d*\.?\d+)$/i);
    if (!m)
        return undefined;
    return { id: m[1].toLowerCase(), m: parseFloat(m[2]) };
}
function maskOf(args) {
    const mask = {};
    const slope = rangeOf(args.get('slope'));
    if (slope) {
        // `slope 12` = max 12°; `slope 5to30` = a band.
        if (slope[0] === slope[1])
            mask.slopeMaxDeg = slope[1];
        else {
            mask.slopeMinDeg = slope[0];
            mask.slopeMaxDeg = slope[1];
        }
    }
    const alt = rangeOf(args.get('altitude'));
    if (alt)
        mask.altitudeM = alt;
    const near = refOf(args.get('near'));
    if (near)
        mask.near = near;
    const away = refOf(args.get('away'));
    if (away)
        mask.away = away;
    // The legacy alias needs a numeric value; a free-text label ending in
    // "clearing" must not overwrite an explicit away constraint with zero.
    const clearing = args.get('clearing');
    if (clearing && /^-?\d*\.?\d+$/.test(clearing))
        mask.away = { id: 'listener', m: Number(clearing) };
    return Object.keys(mask).length ? mask : undefined;
}
function parseHour(v) {
    const m = v.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) {
        const n = parseFloat(v);
        return isFinite(n) ? n : 10;
    }
    return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 60 : 0);
}
/**
 * Parse a `world` block. `head` is the text after the `world` keyword (the
 * biome); `lines` are the trimmed, indented lines beneath it. Never throws —
 * unknown lines are ignored, bad values fall back through normalizeWorldSpec.
 */
export function parseWorldBlock(head, lines) {
    const raw = { biome: head.trim() || undefined };
    const ground = [];
    const strips = [];
    const patches = [];
    const objects = [];
    const fixtures = [];
    const controls = [];
    const apertures = [];
    const plan = [];
    const spaces = [];
    const pins = [];
    let interiorRaw = null;
    for (const line of lines) {
        const tokens = line.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length)
            continue;
        const kind = tokens[0].toLowerCase();
        const rest = tokens.slice(1);
        switch (kind) {
            case 'seed':
                raw.seed = numOr(rest[0], 1);
                break;
            case 'control': {
                // `control <id> <label…> value <v> range <min>to<max> [step <s>] [unit <text>]`
                const id = rest[0];
                if (!id)
                    break;
                const { text, args } = splitKeyed(rest.slice(1), KEYS.control);
                const c = { id, label: text || id, value: numOr(args.get('value'), NaN) };
                const r = rangeOf(args.get('range'));
                if (r) {
                    c.min = r[0];
                    c.max = r[1];
                }
                if (args.has('step'))
                    c.step = numOr(args.get('step'), NaN);
                if (args.get('unit'))
                    c.unit = args.get('unit');
                controls.push(c);
                break;
            }
            case 'size':
                raw.sizeM = numOr(rest[0], undefined);
                break;
            case 'terrain': {
                const { args } = splitKeyed(rest, KEYS.terrain);
                raw.terrain = { reliefM: numOr(args.get('relief'), 4), roughness: numOr(args.get('roughness'), 0.4) };
                break;
            }
            case 'ground': {
                const { text, args } = splitKeyed(rest, KEYS.ground);
                const g = { material: text, weight: numOr(args.get('weight'), 1) };
                const mask = maskOf(args);
                if (mask)
                    g.mask = mask;
                ground.push(g);
                break;
            }
            case 'strip': {
                const id = rest[0];
                const { text, args } = splitKeyed(rest.slice(1), KEYS.strip);
                const s = {
                    id, label: text || id,
                    widthM: numOr(args.get('width'), 6), material: args.get('material') || undefined,
                    carveM: numOr(args.get('carve'), 0), liquid: args.has('liquid'), flow: numOr(args.get('flow'), 0.3),
                };
                const fill = (args.get('fill') || '').toLowerCase();
                if (fill === 'left' || fill === 'right')
                    s.fill = fill;
                if (args.get('edge'))
                    s.edgeMaterial = args.get('edge');
                const path = pointsOf(args.get('path'));
                if (path)
                    s.path = path;
                strips.push(s);
                break;
            }
            case 'patch': {
                const id = rest[0];
                const { text, args } = splitKeyed(rest.slice(1), KEYS.patch);
                const p = {
                    id, label: text || id,
                    radiusM: numOr(args.get('radius'), 6), material: args.get('material') || undefined,
                    carveM: numOr(args.get('carve'), 0), liquid: args.has('liquid'),
                };
                const centre = pointsOf(args.get('centre') ?? args.get('center'));
                if (centre)
                    p.centre = centre[0];
                if (args.get('edge'))
                    p.edgeMaterial = args.get('edge');
                patches.push(p);
                break;
            }
            case 'object': {
                const id = rest[0];
                const shape = (rest[1] ?? '').toLowerCase();
                const { text, args } = splitKeyed(rest.slice(2), KEYS.object);
                const o = {
                    id, shape, label: text || id,
                    densityPer100m2: numOr(args.get('density'), 1), material: args.get('material') || undefined,
                    porous: numOr(args.get('porous'), 0), raised: numOr(args.get('raised'), 0),
                };
                const h = rangeOf(args.get('height'));
                if (h)
                    o.heightM = h;
                const r = rangeOf(args.get('radius'));
                if (r)
                    o.radiusM = r;
                const stem = rangeOf(args.get('stem'));
                if (stem)
                    o.stemRadiusM = stem;
                const mask = maskOf(args);
                if (mask)
                    o.mask = mask;
                objects.push(o);
                break;
            }
            case 'fixture': {
                const id = rest[0];
                const { text, args } = splitKeyed(rest.slice(1), KEYS.fixture);
                const f = { id, label: text || id, material: args.get('material') || undefined };
                const size = args.get('size');
                if (size) {
                    const parts = size.split(/x/i).map(parseFloat);
                    if (parts.length === 3 && parts.every(isFinite))
                        f.sizeM = [parts[0], parts[1], parts[2]];
                }
                if (args.has('porous'))
                    f.porous = numOr(args.get('porous'), 0);
                const at = pointsOf(args.get('at'));
                if (at)
                    f.position = at[0];
                const near = args.get('near');
                if (near) {
                    const m = near.match(/^(\S+)\s+(-?\d*\.?\d+)$/);
                    f.relativeTo = m ? { ref: m[1].toLowerCase(), distanceM: parseFloat(m[2]) } : { ref: near.toLowerCase(), distanceM: 5 };
                    if (args.has('bearing'))
                        f.relativeTo.bearingDeg = numOr(args.get('bearing'), 0);
                }
                if (args.has('support'))
                    f.support = args.get('support');
                if (args.has('elevation'))
                    f.elevationM = numOr(args.get('elevation'), 0);
                if (args.has('rotate'))
                    f.yawDeg = numOr(args.get('rotate'), 0);
                if (args.has('enclosure'))
                    f.enclosure = true;
                if (args.has('outside'))
                    f.outside = true;
                fixtures.push(f);
                break;
            }
            case 'instance': {
                // `instance <entity> <n> at <x>,<z>` — the n-th individual of a population, pinned.
                const entity = rest[0];
                const index = parseInt(rest[1] ?? '', 10);
                const { args } = splitKeyed(rest.slice(2), KEYS.instance);
                const at = pointsOf(args.get('at'));
                if (entity && Number.isFinite(index) && at)
                    pins.push({ entity, index, position: at[0] });
                break;
            }
            case 'interior': {
                // `interior size WxHxD floor <text> walls <text> ceiling <text> [rt60 <s>] [elevation <m>]`
                const { args } = splitKeyed(rest, KEYS.interior);
                const it = {
                    floor: args.get('floor') || undefined,
                    walls: args.get('walls') || undefined,
                    ceiling: args.get('ceiling') || undefined,
                    elevationM: numOr(args.get('elevation'), 0),
                };
                const size = args.get('size');
                if (size) {
                    const parts = size.split(/x/i).map(parseFloat);
                    if (parts.length === 3 && parts.every(isFinite))
                        it.sizeM = [parts[0], parts[1], parts[2]];
                }
                if (args.has('rt60'))
                    it.rt60S = numOr(args.get('rt60'), NaN);
                interiorRaw = { ...(interiorRaw ?? {}), ...it };
                break;
            }
            case 'wall': {
                // `wall <id> from <x>,<z> to <x>,<z> [height <m>] [material <text>]` — one wall of the plan, in order
                const id = rest[0];
                if (!id)
                    break;
                const { args } = splitKeyed(rest.slice(1), KEYS.wall);
                const xz = (v) => {
                    const parts = (v ?? '').split(',').map(parseFloat);
                    return parts.length === 2 && parts.every(isFinite) ? [parts[0], parts[1]] : undefined;
                };
                const w = { id, a: xz(args.get('from')), b: xz(args.get('to')) };
                if (args.has('height'))
                    w.heightM = numOr(args.get('height'), NaN);
                if (args.get('material'))
                    w.material = args.get('material');
                if (w.a)
                    plan.push(w);
                break;
            }
            case 'aperture': {
                // `aperture <id> <label…> wall <deg|ceiling|floor|wall id> [along <m>] size WxH [sill <m>] material <text> open <v> to <outside|space id>`
                const id = rest[0];
                if (!id)
                    break;
                const { text, args } = splitKeyed(rest.slice(1), KEYS.aperture);
                const wallRaw = (args.get('wall') || '').toLowerCase();
                const wallNum = Number(args.get('wall'));
                const a = {
                    id, label: text || id,
                    wall: wallRaw === 'ceiling' || wallRaw === 'floor' ? wallRaw : isFinite(wallNum) && wallRaw !== '' ? wallNum : wallRaw || 0,
                    material: args.get('material') || undefined,
                    open: numOr(args.get('open'), 0),
                    to: args.get('to') || undefined,
                };
                const size = args.get('size');
                if (size) {
                    const parts = size.split(/x/i).map(parseFloat);
                    if (parts.length === 2 && parts.every(isFinite))
                        a.sizeM = [parts[0], parts[1]];
                }
                if (args.has('sill'))
                    a.sillM = numOr(args.get('sill'), 0);
                if (args.has('along'))
                    a.alongM = numOr(args.get('along'), 0);
                apertures.push(a);
                break;
            }
            case 'space': {
                // `space <id> <label…> beyond <deg>|above|below [depth <m>] material <text>`
                // (a valued key, not bare `above`/`below` flags — a label like
                // "the unit above" must not have its last word eaten as a keyword)
                const id = rest[0];
                if (!id)
                    break;
                const { text, args } = splitKeyed(rest.slice(1), KEYS.space);
                const beyond = (args.get('beyond') || '').toLowerCase();
                const s = {
                    id, label: text || id,
                    direction: beyond === 'above' || beyond === 'below' ? beyond : numOr(args.get('beyond'), 0),
                    material: args.get('material') || undefined,
                };
                if (args.has('depth'))
                    s.depthM = numOr(args.get('depth'), 0);
                spaces.push(s);
                break;
            }
            case 'weather': {
                const { args } = splitKeyed(rest, KEYS.weather);
                raw.weather = { rain: numOr(args.get('rain'), 0), wind: numOr(args.get('wind'), 0.2), fog: numOr(args.get('fog'), 0) };
                break;
            }
            case 'time': {
                const { text, args } = splitKeyed(rest, KEYS.time);
                raw.time = { hour: parseHour(text), season: args.get('season') || undefined, temperatureC: numOr(args.get('temp'), 18), clockRate: numOr(args.get('clock'), 0) };
                break;
            }
            // ── Version-1 lines ──
            case 'water': {
                const wkind = (rest[0] ?? '').toLowerCase();
                const { text, args } = splitKeyed(rest.slice(1), KEYS.water);
                const w = { kind: wkind, label: text || wkind, widthM: numOr(args.get('width'), undefined), flow: numOr(args.get('flow'), undefined), bankMaterial: args.get('bank') || undefined };
                const path = pointsOf(args.get('path'));
                if (path)
                    w.path = path;
                const centre = pointsOf(args.get('centre') ?? args.get('center'));
                if (centre)
                    w.centre = centre[0];
                if (args.has('shore'))
                    w.shoreBearingDeg = numOr(args.get('shore'), 0);
                raw.water = w;
                break;
            }
            case 'road': {
                const { text, args } = splitKeyed(rest, KEYS.road);
                const rd = { label: text || 'road', widthM: numOr(args.get('width'), 8), material: args.get('material') || undefined };
                const path = pointsOf(args.get('path'));
                if (path)
                    rd.path = path;
                raw.road = rd;
                break;
            }
            case 'scatter': {
                const id = rest[0];
                const skind = (rest[1] ?? '').toLowerCase();
                const { text, args } = splitKeyed(rest.slice(2), KEYS.object);
                const s = { id, kind: skind, label: text || id, densityPer100m2: numOr(args.get('density'), 1), material: args.get('material') || undefined };
                const h = rangeOf(args.get('height'));
                if (h)
                    s.heightM = h;
                const r = rangeOf(args.get('radius'));
                if (r)
                    s.radiusM = r;
                const mask = maskOf(args);
                if (mask)
                    s.mask = mask;
                objects.push(s);
                break;
            }
            default: break;
        }
    }
    if (ground.length)
        raw.ground = ground;
    if (strips.length)
        raw.strips = strips;
    if (patches.length)
        raw.patches = patches;
    if (objects.length)
        raw.objects = objects;
    if (fixtures.length)
        raw.fixtures = fixtures;
    if (controls.length)
        raw.controls = controls;
    if (pins.length)
        raw.instancePins = pins;
    if (interiorRaw || apertures.length || spaces.length || plan.length) {
        raw.interior = { ...(interiorRaw ?? {}), apertures, spaces, ...(plan.length ? { plan } : {}) };
    }
    return normalizeWorldSpec(raw);
}
const fmt = (n, d = 2) => {
    const s = n.toFixed(d);
    return s.replace(/\.?0+$/, '') || '0';
};
const range = (r) => (r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}to${fmt(r[1])}`);
const hhmm = (h) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
function maskWords(mask) {
    if (!mask)
        return '';
    const w = [];
    if (mask.slopeMinDeg !== undefined && mask.slopeMaxDeg !== undefined)
        w.push(`slope ${fmt(mask.slopeMinDeg)}to${fmt(mask.slopeMaxDeg)}`);
    else if (mask.slopeMaxDeg !== undefined)
        w.push(`slope ${fmt(mask.slopeMaxDeg)}`);
    if (mask.altitudeM)
        w.push(`altitude ${range(mask.altitudeM)}`);
    if (mask.near)
        w.push(`near ${mask.near.id} ${fmt(mask.near.m)}`);
    if (mask.away)
        w.push(`away ${mask.away.id} ${fmt(mask.away.m)}`);
    return w.length ? ' ' + w.join(' ') : '';
}
/** Format a spec as a `world` block (two-space indented body). Ecology is not written — it is the voices. */
export function formatWorldBlock(spec) {
    const out = [`world ${spec.biome}`];
    out.push(`  seed ${spec.seed}`);
    out.push(`  size ${fmt(spec.sizeM)}`);
    out.push(`  terrain relief ${fmt(spec.terrain.reliefM)} roughness ${fmt(spec.terrain.roughness)}`);
    if (spec.interior) {
        const it = spec.interior;
        let line = `  interior size ${fmt(it.sizeM[0])}x${fmt(it.sizeM[1])}x${fmt(it.sizeM[2])} floor ${it.floor} walls ${it.walls} ceiling ${it.ceiling}`;
        if (it.rt60S !== undefined)
            line += ` rt60 ${fmt(it.rt60S)}`;
        if (it.elevationM > 0)
            line += ` elevation ${fmt(it.elevationM)}`;
        out.push(line);
        for (const w of it.plan ?? []) {
            let wl = `  wall ${w.id} from ${fmt(w.a[0])},${fmt(w.a[1])} to ${fmt(w.b[0])},${fmt(w.b[1])}`;
            if (w.heightM !== undefined)
                wl += ` height ${fmt(w.heightM)}`;
            if (w.material)
                wl += ` material ${w.material}`;
            out.push(wl);
        }
        for (const a of it.apertures) {
            let al = `  aperture ${a.id} ${a.label} wall ${typeof a.wall === 'number' ? fmt(a.wall) : a.wall}`;
            if (a.alongM !== undefined)
                al += ` along ${fmt(a.alongM)}`;
            al += ` size ${fmt(a.sizeM[0])}x${fmt(a.sizeM[1])}`;
            if (a.sillM !== undefined)
                al += ` sill ${fmt(a.sillM)}`;
            al += ` material ${a.material} open ${fmt(a.open)} to ${a.to}`;
            out.push(al);
        }
        for (const s of it.spaces) {
            let sl = `  space ${s.id} ${s.label} beyond ${typeof s.direction === 'number' ? fmt(s.direction) : s.direction}`;
            if (s.depthM !== undefined)
                sl += ` depth ${fmt(s.depthM)}`;
            sl += ` material ${s.material}`;
            out.push(sl);
        }
    }
    for (const g of spec.ground)
        out.push(`  ground ${g.material} weight ${fmt(g.weight)}${maskWords(g.mask)}`);
    for (const s of spec.strips) {
        let line = `  strip ${s.id} ${s.label} width ${fmt(s.widthM)} material ${s.material}`;
        if (s.carveM > 0)
            line += ` carve ${fmt(s.carveM)}`;
        if (s.liquid)
            line += ' liquid';
        line += ` flow ${fmt(s.flow)}`;
        if (s.fill)
            line += ` fill ${s.fill}`;
        if (s.edgeMaterial)
            line += ` edge ${s.edgeMaterial}`;
        if (s.path)
            line += ` path ${s.path.map(p => `${fmt(p[0], 1)},${fmt(p[1], 1)}`).join(' ')}`;
        out.push(line);
    }
    for (const p of spec.patches) {
        let line = `  patch ${p.id} ${p.label} radius ${fmt(p.radiusM)} material ${p.material}`;
        if (p.carveM > 0)
            line += ` carve ${fmt(p.carveM)}`;
        if (p.liquid)
            line += ' liquid';
        if (p.centre)
            line += ` centre ${fmt(p.centre[0], 1)},${fmt(p.centre[1], 1)}`;
        if (p.edgeMaterial)
            line += ` edge ${p.edgeMaterial}`;
        out.push(line);
    }
    for (const o of spec.objects) {
        let line = `  object ${o.id} ${o.shape} ${o.label} density ${fmt(o.densityPer100m2)} height ${range(o.heightM)} radius ${range(o.radiusM)} material ${o.material}`;
        if (o.porous > 0)
            line += ` porous ${fmt(o.porous)}`;
        if (o.raised > 0)
            line += ` raised ${fmt(o.raised)}`;
        if (o.stemRadiusM[1] > 0)
            line += ` stem ${range(o.stemRadiusM)}`;
        line += maskWords(o.mask);
        out.push(line);
    }
    for (const f of spec.fixtures) {
        let line = `  fixture ${f.id} ${f.label} size ${fmt(f.sizeM[0])}x${fmt(f.sizeM[1])}x${fmt(f.sizeM[2])} material ${f.material}`;
        if (f.porous !== undefined && f.porous > 0)
            line += ` porous ${fmt(f.porous)}`;
        if (f.position)
            line += ` at ${fmt(f.position[0])},${fmt(f.position[1])}`;
        else if (f.relativeTo) {
            line += ` near ${f.relativeTo.ref} ${fmt(f.relativeTo.distanceM)}`;
            if (f.relativeTo.bearingDeg !== undefined)
                line += ` bearing ${fmt(f.relativeTo.bearingDeg)}`;
        }
        if (f.support)
            line += ` support ${f.support}`;
        if (f.elevationM !== undefined)
            line += ` elevation ${fmt(f.elevationM)}`;
        if (f.yawDeg)
            line += ` rotate ${fmt(f.yawDeg)}`;
        if (f.enclosure)
            line += ' enclosure';
        if (f.outside)
            line += ' outside';
        out.push(line);
    }
    for (const p of spec.instancePins ?? [])
        out.push(`  instance ${p.entity} ${p.index} at ${fmt(p.position[0])},${fmt(p.position[1])}`);
    out.push(`  weather rain ${fmt(spec.weather.rain)} wind ${fmt(spec.weather.wind)} fog ${fmt(spec.weather.fog)}`);
    out.push(`  time ${hhmm(spec.time.hour)} season ${spec.time.season} temp ${fmt(spec.time.temperatureC)}${spec.time.clockRate > 0 ? ` clock ${fmt(spec.time.clockRate)}` : ''}`);
    for (const c of spec.controls)
        out.push(`  ${controlLine(c)}`);
    return out.join('\n');
}
/** `control <id> <label…> value <v> range <min>to<max> [step <s>] [unit <text>]` */
function controlLine(c) {
    let line = `control ${c.id} ${c.label} value ${fmt(c.value, 3)} range ${fmt(c.min, 3)}to${fmt(c.max, 3)}`;
    if (c.step !== undefined && c.step > 0)
        line += ` step ${fmt(c.step, 4)}`;
    if (c.unit)
        line += ` unit ${c.unit}`;
    return line;
}
/**
 * Rewrite the `weather` / `time` / `control` lines of a script's `world`
 * block in place (the UI knobs write back here so the script stays the single
 * artifact). A control's `value` is rewritten, its label / range / step /
 * unit kept. Returns the script unchanged when it has no `world` block.
 */
export function updateWorldBlockState(script, state) {
    const lines = script.split('\n');
    let inWorld = false;
    let indent = 0;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        const ind = raw.length - raw.trimStart().length;
        if (/^world\b/i.test(trimmed) && (!inWorld || ind <= indent)) {
            inWorld = true;
            indent = ind;
            continue;
        }
        if (!inWorld)
            continue;
        if (trimmed && ind <= indent) {
            inWorld = false;
            continue;
        }
        const pad = raw.slice(0, ind);
        if (/^weather\b/i.test(trimmed)) {
            const { args } = splitKeyed(trimmed.split(/\s+/).slice(1), KEYS.weather);
            const rain = state.rain ?? numOr(args.get('rain'), 0);
            const wind = state.wind ?? numOr(args.get('wind'), 0.2);
            const fog = state.fog ?? numOr(args.get('fog'), 0);
            lines[i] = `${pad}weather rain ${fmt(rain)} wind ${fmt(wind)} fog ${fmt(fog)}`;
        }
        else if (/^time\b/i.test(trimmed)) {
            const { text, args } = splitKeyed(trimmed.split(/\s+/).slice(1), KEYS.time);
            const hour = state.hour ?? parseHour(text);
            const season = args.get('season') || 'summer';
            const temp = state.temperatureC ?? numOr(args.get('temp'), 18);
            const clock = state.clockRate ?? numOr(args.get('clock'), 0);
            lines[i] = `${pad}time ${hhmm(hour)} season ${season} temp ${fmt(temp)}${clock > 0 ? ` clock ${fmt(clock)}` : ''}`;
        }
        else if (state.controls && /^control\b/i.test(trimmed)) {
            const toks = trimmed.split(/\s+/);
            const id = (toks[1] || '').toLowerCase();
            const next = state.controls[id];
            if (id && next !== undefined && isFinite(next)) {
                const { text, args } = splitKeyed(toks.slice(2), KEYS.control);
                const r = rangeOf(args.get('range')) ?? [0, 1];
                const value = Math.max(r[0], Math.min(r[1], next));
                let line = `${pad}control ${id} ${text || id} value ${fmt(value, 3)} range ${fmt(r[0], 3)}to${fmt(r[1], 3)}`;
                if (args.has('step'))
                    line += ` step ${args.get('step')}`;
                if (args.get('unit'))
                    line += ` unit ${args.get('unit')}`;
                lines[i] = line;
            }
        }
    }
    return lines.join('\n');
}
/**
 * What one room card field writes on the interior line, or null when the value cannot be
 * written (a size that is not three positive numbers, an rt60 that is not a positive
 * number, a surface cleared to nothing): the caller then leaves the world block alone.
 * `rt60` with a null value clears the override. Before 2026-10-03 the page built this
 * inline: a non-numeric rt60 became NaN and cleared the override, and a malformed size
 * sent an empty patch that still rewrote the line.
 */
export function interiorPatchFor(field, value) {
    if (field === 'rt60') {
        if (value === null)
            return { rt60S: null };
        const n = Number(value.trim());
        return value.trim() !== '' && isFinite(n) && n > 0 ? { rt60S: n } : null;
    }
    if (value === null || !value.trim())
        return null;
    if (field === 'size') {
        const n = value.trim().split(/\s+/).map(Number);
        return n.length === 3 && n.every(x => isFinite(x) && x > 0) ? { sizeM: n } : null;
    }
    return { [field]: value.trim() };
}
/**
 * Rewrite the `interior size WxHxD floor … walls … ceiling … [rt60 s] [elevation m]`
 * line of a script's `world` block in place. The room card used to write only the
 * acoustic `room interior` block, so a size change moved the reverb and not the
 * walls the viewport draws (2026-10-02: "I make changes and the scene doesn't
 * change"). Returns the script unchanged when it has no world block or no interior.
 */
export function updateWorldBlockInterior(script, patch) {
    const lines = script.split('\n');
    let inWorld = false, indent = 0;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], trimmed = raw.trim(), ind = raw.length - raw.trimStart().length;
        if (/^world\b/i.test(trimmed) && (!inWorld || ind <= indent)) {
            inWorld = true;
            indent = ind;
            continue;
        }
        if (!inWorld)
            continue;
        if (trimmed && ind <= indent) {
            inWorld = false;
            continue;
        }
        if (!/^interior\b/i.test(trimmed))
            continue;
        const { args } = splitKeyed(trimmed.split(/\s+/).slice(1), KEYS.interior);
        const size = patch.sizeM ?? (args.get('size') ?? '').split(/[x×]/i).map(Number);
        if (size.length !== 3 || size.some(n => !isFinite(n) || n <= 0))
            return script;
        const floor = patch.floor ?? args.get('floor') ?? 'floor';
        const walls = patch.walls ?? args.get('walls') ?? 'walls';
        const ceiling = patch.ceiling ?? args.get('ceiling') ?? 'ceiling';
        const rt60 = patch.rt60S === undefined ? numOr(args.get('rt60'), NaN) : (patch.rt60S ?? NaN);
        const elevation = numOr(args.get('elevation'), 0);
        let line = `${raw.slice(0, ind)}interior size ${fmt(size[0])}x${fmt(size[1])}x${fmt(size[2])} floor ${floor} walls ${walls} ceiling ${ceiling}`;
        if (isFinite(rt60))
            line += ` rt60 ${fmt(rt60)}`;
        if (elevation !== 0)
            line += ` elevation ${fmt(elevation)}`;
        lines[i] = line;
        return lines.join('\n');
    }
    return script;
}
const ENTRY_FIELDS = {
    fixture: ['position', 'elevation', 'yawDeg', 'sizeM'],
    patch: ['position', 'radiusM'],
    strip: ['position'],
    aperture: ['position', 'sizeM', 'wall'],
    entity: ['position'],
};
const FIELD_WORDS = { position: 'position', elevation: 'elevation', yawDeg: 'rotation', sizeM: 'size', radiusM: 'radius', wall: 'wall' };
/** Up to three decimals, trailing zeros dropped, never `-0`. */
const fmtN = (n) => { const s = fmt(n, 3); return s === '-0' ? '0' : s; };
const pointText = (p) => `${fmtN(p[0])},${fmtN(p[1])}`;
function tokenizeLine(raw) {
    const pad = raw.match(/^\s*/)[0];
    const trail = raw.trim() ? raw.match(/\s*$/)[0] : '';
    const core = raw.slice(pad.length, raw.length - trail.length);
    const words = [], gaps = [];
    for (const m of core.matchAll(/(\S+)(\s*)/g)) {
        words.push(m[1]);
        gaps.push(m[2]);
    }
    return { pad, words, gaps, trail };
}
/** The first `world` block of a script: its header line, indent and the indices of its non-empty body lines. */
function worldBody(lines) {
    let indent = 0, worldIndex = -1;
    const body = [];
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], trimmed = raw.trim(), ind = raw.length - raw.trimStart().length;
        if (worldIndex < 0) {
            if (/^world\b/i.test(trimmed)) {
                worldIndex = i;
                indent = ind;
            }
            continue;
        }
        if (trimmed && ind <= indent)
            break;
        if (trimmed)
            body.push(i);
    }
    return worldIndex < 0 ? null : { worldIndex, indent, body };
}
function findEntryLine(lines, body, kind, id, instance) {
    const keyword = kind === 'entity' ? 'instance' : kind;
    const head = kind === 'entity' ? 3 : 2;
    for (const i of body) {
        const tok = tokenizeLine(lines[i]);
        if (tok.words[0]?.toLowerCase() !== keyword || (tok.words[1] ?? '').toLowerCase() !== id.toLowerCase())
            continue;
        if (kind === 'entity' && parseInt(tok.words[2] ?? '', 10) !== instance)
            continue;
        return { ...tok, index: i, head, keyword };
    }
    return null;
}
/**
 * Rewrite the keyed runs of a line. Words outside the edited slots keep their
 * exact spacing; an edited slot is written single-spaced where the slot's first
 * key stood; a new slot is appended. Dead duplicates of an edited key go.
 */
function rewriteKeyed(line, head, keys, edits) {
    const tokens = line.words.slice(head);
    const { ranges } = keyRanges(tokens, keys);
    const out = line.words.slice(0, head).map((w, i) => ({ w, g: line.gaps[i] }));
    const copy = (from, to) => { for (let i = from; i < to; i++)
        out.push({ w: tokens[i], g: line.gaps[head + i] }); };
    const emit = (text, lastGap) => {
        const words = text.split(' ').filter(Boolean);
        words.forEach((w, i) => out.push({ w, g: i === words.length - 1 ? lastGap : ' ' }));
    };
    copy(0, ranges[0]?.start ?? tokens.length);
    const placed = new Set();
    for (const r of ranges) {
        const edit = edits.find(e => e.keys.includes(r.key));
        if (!edit) {
            copy(r.start, r.end);
            continue;
        }
        if (edit.text === null || placed.has(edit))
            continue;
        placed.add(edit);
        emit(edit.text, line.gaps[head + r.end - 1]);
    }
    for (const edit of edits) {
        if (edit.text === null || placed.has(edit))
            continue;
        if (out.length && !out[out.length - 1].g)
            out[out.length - 1].g = ' ';
        emit(edit.text, '');
    }
    if (out.length)
        out[out.length - 1].g = '';
    return line.pad + out.map(e => e.w + e.g).join('') + line.trail;
}
function sizeOf(v, count) {
    if (!v)
        return undefined;
    const parts = v.split(/[x×]/i).map(Number);
    return parts.length === count && parts.every(n => Number.isFinite(n)) ? parts : undefined;
}
function nearOf(v) {
    if (!v)
        return undefined;
    const m = v.match(/^(\S+)\s+(-?\d*\.?\d+)$/);
    return m ? { ref: m[1].toLowerCase(), distanceM: parseFloat(m[2]) } : { ref: v.toLowerCase(), distanceM: 5 };
}
function centroidOf(path) {
    return [path.reduce((s, p) => s + p[0], 0) / path.length, path.reduce((s, p) => s + p[1], 0) / path.length];
}
/**
 * Read one world block thing's transform fields as they are written, or null
 * when the script has no world block or no such line (for an entity, no pin
 * for that instance). The inverse of a transform edit is built from this.
 */
export function readWorldBlockEntry(script, kind, id, instance) {
    const lines = script.split('\n');
    const world = worldBody(lines);
    if (!world)
        return null;
    const found = findEntryLine(lines, world.body, kind, id, instance);
    if (!found)
        return null;
    const { args } = splitKeyed(found.words.slice(found.head), KEYS[found.keyword]);
    const v = {};
    switch (kind) {
        case 'fixture': {
            const at = pointsOf(args.get('at'));
            if (at)
                v.position = at[0];
            else if (args.get('near')) {
                const near = nearOf(args.get('near'));
                if (args.has('bearing'))
                    near.bearingDeg = numOr(args.get('bearing'), 0);
                v.near = near;
            }
            if (args.has('elevation'))
                v.elevation = numOr(args.get('elevation'), 0);
            if (args.has('rotate'))
                v.yawDeg = numOr(args.get('rotate'), 0);
            const size = sizeOf(args.get('size'), 3);
            if (size)
                v.sizeM = size;
            break;
        }
        case 'patch': {
            const centre = pointsOf(args.get('centre') ?? args.get('center'));
            if (centre)
                v.position = centre[0];
            if (args.has('radius'))
                v.radiusM = numOr(args.get('radius'), 6);
            break;
        }
        case 'strip': {
            const path = pointsOf(args.get('path'));
            if (path)
                v.position = centroidOf(path);
            break;
        }
        case 'aperture': {
            if (args.has('along'))
                v.position = [numOr(args.get('along'), 0), 0];
            if (args.get('wall'))
                v.wall = args.get('wall');
            const size = sizeOf(args.get('size'), 2);
            if (size)
                v.sizeM = size;
            break;
        }
        case 'entity': {
            const at = pointsOf(args.get('at'));
            if (at)
                v.position = at[0];
            break;
        }
    }
    return v;
}
/**
 * Rewrite exactly one `fixture | patch | strip | aperture | instance` line of
 * a script's `world` block in place, keeping every other key on the line and
 * every other line untouched (see `WorldEntryPatch` for the field mapping).
 * Returns null when the script has no world block or no such line; returns
 * the script unchanged when the patch asks for nothing. Throws when a field
 * does not apply to the kind, or when an entity is addressed without an
 * `instance`: an entity's own `at` names its host, never a place.
 */
export function updateWorldBlockEntry(script, kind, id, patch) {
    const lines = script.split('\n');
    const world = worldBody(lines);
    if (!world)
        return null;
    if (kind === 'entity' && patch.instance === undefined) {
        throw new Error(`An entity's own \`at\` names its host, not a place; to move one of ${id} name the instance.`);
    }
    const clear = new Set(patch.clear ?? []);
    const sets = {
        position: patch.position !== undefined || patch.near !== undefined,
        elevation: patch.elevation !== undefined, yawDeg: patch.yawDeg !== undefined,
        sizeM: patch.sizeM !== undefined, radiusM: patch.radiusM !== undefined, wall: patch.wall !== undefined,
    };
    for (const field of Object.keys(sets)) {
        if (!sets[field] && !clear.has(field))
            continue;
        if (!ENTRY_FIELDS[kind].includes(field))
            throw new Error(`A ${kind === 'entity' ? 'person' : kind} has no ${FIELD_WORDS[field]} to edit here.`);
        if (sets[field] && clear.has(field))
            throw new Error(`Cannot both set and clear the ${FIELD_WORDS[field]} in one edit.`);
    }
    if (patch.near && kind !== 'fixture')
        throw new Error('Only a fixture is placed near something.');
    if (patch.position && patch.near)
        throw new Error('A fixture is either at a point or near something, not both.');
    const found = findEntryLine(lines, world.body, kind, id, patch.instance);
    if (kind === 'entity') {
        if (clear.has('position')) {
            if (!found)
                return script;
            lines.splice(found.index, 1);
            return lines.join('\n');
        }
        if (!patch.position)
            return script;
        const text = `at ${pointText(patch.position)}`;
        if (found) {
            lines[found.index] = rewriteKeyed(found, found.head, KEYS.instance, [{ keys: ['at'], text }]);
            return lines.join('\n');
        }
        // A new pin goes after the last pin or fixture, else at the end of the block.
        const anchor = [...world.body].reverse().find(i => /^(instance|fixture)\b/i.test(lines[i].trim())) ?? world.body[world.body.length - 1] ?? world.worldIndex;
        const pad = world.body.length ? lines[world.body[0]].match(/^\s*/)[0] : ' '.repeat(world.indent + 2);
        lines.splice(anchor + 1, 0, `${pad}instance ${id} ${patch.instance} ${text}`);
        return lines.join('\n');
    }
    if (!found)
        return null;
    const keys = KEYS[found.keyword];
    const { args } = splitKeyed(found.words.slice(found.head), keys);
    const edits = [];
    const simple = (field, key, text) => {
        if (sets[field])
            edits.push({ keys: [key], text: text() });
        else if (clear.has(field))
            edits.push({ keys: [key], text: null });
    };
    switch (kind) {
        case 'fixture': {
            const slot = ['at', 'near', 'bearing'];
            if (patch.near)
                edits.push({ keys: slot, text: `near ${patch.near.ref} ${fmtN(patch.near.distanceM)}${patch.near.bearingDeg !== undefined ? ` bearing ${fmtN(patch.near.bearingDeg)}` : ''}` });
            else if (patch.position)
                edits.push({ keys: slot, text: `at ${pointText(patch.position)}` });
            else if (clear.has('position'))
                edits.push({ keys: slot, text: null });
            simple('elevation', 'elevation', () => `elevation ${fmtN(patch.elevation)}`);
            simple('yawDeg', 'rotate', () => `rotate ${fmtN(patch.yawDeg)}`);
            if (sets.sizeM && patch.sizeM.length < 3)
                throw new Error('A fixture size is width x height x depth.');
            simple('sizeM', 'size', () => `size ${patch.sizeM.slice(0, 3).map(fmtN).join('x')}`);
            break;
        }
        case 'patch': {
            const centreKey = args.has('center') && !args.has('centre') ? 'center' : 'centre';
            if (patch.position)
                edits.push({ keys: ['centre', 'center'], text: `${centreKey} ${pointText(patch.position)}` });
            else if (clear.has('position'))
                edits.push({ keys: ['centre', 'center'], text: null });
            simple('radiusM', 'radius', () => `radius ${fmtN(patch.radiusM)}`);
            break;
        }
        case 'strip': {
            if (patch.position) {
                const path = pointsOf(args.get('path'));
                const [x, z] = patch.position;
                let next;
                if (path) {
                    const c = centroidOf(path);
                    next = path.map(p => [p[0] + x - c[0], p[1] + z - c[1]]);
                }
                else {
                    const sizeLine = world.body.map(i => lines[i].trim()).find(l => /^size\b/i.test(l));
                    const half = numOr(sizeLine?.split(/\s+/)[1], WORLD_SIZE_DEFAULT_M) / 2;
                    const cl = (n) => Math.max(-half, Math.min(half, n));
                    next = [[cl(x - 8), cl(z)], [cl(x + 8), cl(z)]];
                }
                edits.push({ keys: ['path'], text: `path ${next.map(pointText).join(' ')}` });
            }
            else if (clear.has('position'))
                edits.push({ keys: ['path'], text: null });
            break;
        }
        case 'aperture': {
            if (sets.wall && !/^[a-z0-9_.-]+$/i.test(patch.wall))
                throw new Error('A wall is named by its id or a bearing in degrees.');
            simple('wall', 'wall', () => `wall ${patch.wall}`);
            if (patch.position)
                edits.push({ keys: ['along'], text: `along ${fmtN(patch.position[0])}` });
            else if (clear.has('position'))
                edits.push({ keys: ['along'], text: null });
            if (sets.sizeM && patch.sizeM.length < 2)
                throw new Error('An aperture size is width x height.');
            simple('sizeM', 'size', () => `size ${patch.sizeM.slice(0, 2).map(fmtN).join('x')}`);
            break;
        }
    }
    if (!edits.length)
        return script;
    lines[found.index] = rewriteKeyed(found, found.head, keys, edits);
    return lines.join('\n');
}
//# sourceMappingURL=WorldBlock.js.map