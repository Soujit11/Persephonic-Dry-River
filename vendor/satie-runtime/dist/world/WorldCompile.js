/**
 * Acoustic compiler — WorldSpec (+ its realized world) → a Satie script.
 *
 * Emits the `world` block and one voice per ecology entry, bound to the thing
 * that makes the sound (`at oak`, `at brook`, `at avenue`, `at overhead`, `at horizon`),
 * with the representational consequences of each host: a strip is heard
 * along its length (`line`), a patch around its rim (`ring`), the listener's
 * own air is a bed, an air-dweller darts overhead. Hour windows and weather
 * thresholds become `active` / `quiet`; `follows` / `pace` become the
 * signal-bound forms. The output is deterministic and parses by
 * construction — no LLM repair round is needed for it.
 *
 * An entry with a repertoire (`sounds`) is not a clip on a timer but a BODY:
 * it compiles to a top-level `entity` block — a ROUTE (`at
 * <strip> pass`: instances spawned every `every`, travelling the strip with
 * real kinematics) or a POPULATION (`count` instances, each perched on its
 * own host object) — whose members are its sounds, heard from the instance's
 * own position and driven by its own state (`velocity`, `accel`, `progress`,
 * `age`). Hosts that are not bodies (`listener`, `air`, `overhead`, a patch
 * rim) cannot carry an entity: their sounds degrade to plain voices.
 *
 * Every voice states its EMISSION (`spl <dB>`, dB SPL at 1 m — the spec's
 * `splDb`, or `DEFAULT_SPL_DB` when the model said nothing), so a compiled
 * script is always CALIBRATED: the engine computes what arrives from where
 * the source is, and `volume` is a trim. A stated emission is not re-faded
 * by `level` (that fader is the guess the emission replaces); an unstated
 * one keeps `level` as its trim so the model's hierarchy survives.
 *
 * Content stays the model's: every label, prompt and material is copied
 * verbatim. Only the mapping from "where does this live" to DSL is code, and
 * it looks the host up by id — it never knows what kind of place this is.
 */
import { DEFAULT_SPL_DB, distanceLossDb } from '../spatial/LevelModel.js';
import { fnv1a } from '../core/Random.js';
import { PANNER_REF_M } from '../spatial/WorldAcoustics.js';
import { catalogRow } from './catalog.js';
import { attachPoint, realizeWorld } from './worldRealize.js';
import { formatWorldBlock } from './WorldBlock.js';
import { ecologySoundDurationS, repertoireKind, interiorFootprint, pointInFootprint, footprintArea, footprintPerimeter } from './worldSpec.js';
export { attachPoint as emitPointOf } from './worldRealize.js';
const fmt = (n, d = 2) => n.toFixed(d).replace(/\.?0+$/, '') || '0';
const range = (r) => (r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}to${fmt(r[1])}`);
/**
 * Relative level 0..1 → script volume. Beds sit lower than the loudest spot
 * source; the floor keeps a quiet source audible — but `0` means silent, so
 * a model that writes `level: 0` gets 0, not a whisper.
 */
export function volumeFor(level) {
    if (level <= 0)
        return 0;
    return Math.round((0.06 + level * 0.84) * 100) / 100;
}
/**
 * `<prop> follow <signal> <in> <out×scale> [pow <k>]` — the one signal-bound
 * form every binding compiles to. `curve` becomes `pow`.
 */
function followLine(prop, m, scale = 1) {
    const line = `${prop} follow ${m.signal} ${fmt(m.in[0])}to${fmt(m.in[1])} ${fmt(m.out[0] * scale)}to${fmt(m.out[1] * scale)}`;
    return m.curve !== undefined && m.curve !== 1 ? `${line} pow ${fmt(m.curve)}` : line;
}
/**
 * The level lines of a voice: its emission, then — where one applies — its
 * `volume` trim. A source that STATES an emission is calibrated by it: `level`
 * is not re-applied as a fader on top, so `volume` appears only as the
 * signal-bound trim (`follows`, `out` a fraction of the emission, 1 = as
 * stated) or as `volume 0` for a silenced source. A source with no emission
 * gets `DEFAULT_SPL_DB` (never a literal) and keeps `level` as its trim
 * (`volumeFor`), so a spec that states no emissions keeps its hierarchy —
 * and is still explicitly calibrated. `splFollows` wins over `splDb`.
 */
function levelLines(src, level, entitySplDb) {
    const out = [];
    const stated = !!src.splFollows || src.splDb !== undefined;
    if (src.splFollows)
        out.push(followLine('spl', src.splFollows));
    else if (src.splDb !== undefined) {
        if (src.splDb !== entitySplDb)
            out.push(`spl ${fmt(src.splDb)}`);
    }
    else if (entitySplDb === undefined)
        out.push(`spl ${fmt(DEFAULT_SPL_DB)}`);
    if (stated) {
        if (level <= 0)
            out.push('volume 0');
        else if (src.follows)
            out.push(followLine('volume', src.follows));
    }
    else {
        const vol = volumeFor(level);
        out.push(src.follows ? followLine('volume', src.follows, vol) : `volume ${fmt(vol)}`);
    }
    return out;
}
/** A member's emission when it states none: the entry's, else the engine default. */
const memberSplDb = (sound, entry) => sound.splFollows ? undefined : sound.splDb ?? entry.splDb ?? DEFAULT_SPL_DB;
/**
 * The one emission an entity's members all share (hoisted to the entity
 * line), or undefined when any member follows a signal or differs.
 */
function sharedSplDb(entry) {
    const sounds = entry.sounds ?? [];
    if (!sounds.length)
        return undefined;
    const first = memberSplDb(sounds[0], entry);
    if (first === undefined)
        return undefined;
    return sounds.every(sd => memberSplDb(sd, entry) === first) ? first : undefined;
}
/** Oneshots that fire at least this often (max interval, s) get a take pool by default. */
const FREQUENT_ONESHOT_MAX_S = 30;
/** Takes pooled for a frequent oneshot when the entry names no `variants`. */
const DEFAULT_POOL = 3;
/**
 * How many distinct takes a source gets when the entry does not say: things
 * passing on a strip always pool (every car is a different car); a class or
 * ground oneshot pools when it fires often enough that one clip would be
 * heard as a stamp. Loops and rare events stay single — generation budget.
 */
export function defaultVariants(entry, spec) {
    if (entry.mode !== 'oneshot')
        return 1;
    const host = entry.host.toLowerCase();
    if (spec.strips.some(s => s.id === host))
        return DEFAULT_POOL;
    const frequent = (entry.everyS?.[1] ?? 12) < FREQUENT_ONESHOT_MAX_S;
    const isClass = spec.objects.some(o => o.id === host) || spec.fixtures.some(f => f.id === host);
    return frequent && (host === 'ground' || isClass) ? DEFAULT_POOL : 1;
}
/**
 * The take pool of an entity's members when the entry names none: a route's
 * members always pool (each instance draws its own take, so no two passes
 * are the same body); a population's members pool only for oneshots that
 * repeat often enough to be heard as a stamp.
 */
function defaultEntityVariants(kind) {
    return kind === 'route' ? DEFAULT_POOL : 1;
}
function defaultMemberVariants(sound, kind) {
    // SPEECH never pools. A pool is N takes of one prompt so a repeated sound
    // is not the same clip twice; a spoken line is already unique per sentence
    // (the engine keys `{text}` takes by the text), so a pool here would buy
    // the same sentence N times from the speech vendor and play one of them.
    if (sound.voiceId)
        return 1;
    if (kind === 'route')
        return DEFAULT_POOL;
    if (sound.mode !== 'oneshot' || !sound.everyS)
        return 1;
    return sound.everyS[1] < FREQUENT_ONESHOT_MAX_S ? DEFAULT_POOL : 1;
}
/** The actual compiled take-bank size, also used before compilation by auditions. */
export function ecologyVariantsFor(entry, spec, sound) {
    if (!sound)
        return entry.variants ?? (entry.clip ? 1 : defaultVariants(entry, spec));
    const kind = repertoireKind(entry, spec);
    if (kind)
        return sound.variants ?? (sound.clip ? 1 : defaultMemberVariants(sound, kind));
    return ecologyVariantsFor({ ...entry, sounds: undefined, clip: sound.clip,
        variants: sound.variants ?? entry.variants, mode: sound.mode === 'on' ? 'oneshot' : sound.mode, everyS: sound.everyS }, spec);
}
/** Transmission through a shut boundary of the interior's shell (occlusion 0–1). */
export const WALL_OCCLUSION = 0.85;
/**
 * How occluded a source on this host is for a listener inside the interior:
 * 0 for the room's own air, its inside fixtures and its apertures (the
 * room-side face of the boundary); through-boundary for a space or the
 * exterior, eased by the widest aperture leading there (a shut door ≈ 0.85, a
 * cracked window ≈ 0.72, a flung-open one 0). A spec with no interior — or a
 * host the spec does not know, which the compiler places nearby — is 0.
 */
export function interiorOcclusion(spec, host, extent, world) {
    const it = spec.interior;
    if (!it)
        return 0;
    const h = host.toLowerCase();
    if (h === 'listener' || extent === 'bed')
        return 0;
    if (it.apertures.some(a => a.id === h))
        return 0;
    const openTo = (to) => it.apertures.filter(a => a.to === to).reduce((m, a) => Math.max(m, a.open), 0);
    const space = it.spaces.find(s => s.id === h);
    if (space)
        return Math.round(WALL_OCCLUSION * (1 - openTo(space.id)) * 100) / 100;
    if (spec.fixtures.some(f => f.id === h && !f.outside))
        return 0;
    // A strip or patch can be inside a room. Classifying every such host as
    // exterior gave indoor paths a closed wall between their actors and listener.
    // Use the realized source geometry, including height (a street underneath an
    // upstairs room remains outside), and check segments against concave walls.
    if (spec.strips.some(s => s.id === h) || spec.patches.some(p => p.id === h)) {
        const feature = (world ?? realizeWorld(spec)).features.find(f => f.id === h);
        const footprint = interiorFootprint(it);
        const points = feature?.polyline ?? [];
        const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const crossesBoundary = points.some((p, i) => {
            if (!i)
                return false;
            const a = [points[i - 1].x, points[i - 1].z], b = [p.x, p.z];
            return footprint.some((c, j) => {
                const d = footprint[(j + 1) % footprint.length];
                return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
            });
        });
        const sourceHeight = feature?.liquid ? 0.1 : 0.8;
        if (points.length && !crossesBoundary && points.every(p => pointInFootprint(footprint, p.x, p.z) && p.y + sourceHeight >= 0 && p.y + sourceHeight < it.sizeM[1]))
            return 0;
    }
    const exterior = spec.strips.some(s => s.id === h)
        || spec.patches.some(p => p.id === h)
        || spec.objects.some(o => o.id === h)
        || spec.fixtures.some(f => f.id === h && f.outside)
        || h === 'ground' || h === 'air' || h === 'overhead' || h === 'horizon';
    if (!exterior)
        return 0;
    return Math.round(WALL_OCCLUSION * (1 - openTo('outside')) * 100) / 100;
}
/**
 * The `room` block of an interior — the same physics as a measured room
 * (Eyring over size + materials via `deriveScriptRoom`), emitted so a
 * compiled interior scene is reverberant by construction.
 */
function roomBlockLines(spec) {
    const it = spec.interior;
    if (!it)
        return [];
    // A plan's room is emitted as the box with the same floor area AND the same
    // perimeter (Eyring sees volume and surface, not shape); the bounding box
    // stands in when no such box exists.
    let [w, , d] = it.sizeM;
    if (it.plan && it.plan.length >= 3) {
        const poly = interiorFootprint(it);
        const area = Math.abs(footprintArea(poly));
        const halfP = footprintPerimeter(poly) / 2;
        const disc = halfP * halfP - 4 * area;
        if (disc >= 0) {
            w = (halfP + Math.sqrt(disc)) / 2;
            d = (halfP - Math.sqrt(disc)) / 2;
        }
    }
    const out = [
        'room interior',
        `  size ${fmt(w)} ${fmt(it.sizeM[1])} ${fmt(d)}`,
        `  floor ${it.floor}`,
        `  walls ${it.walls}`,
        `  ceiling ${it.ceiling}`,
    ];
    if (it.rt60S !== undefined)
        out.push(`  rt60 ${fmt(it.rt60S)}`);
    return out;
}
function activeLine(hours) {
    if (!hours || !hours.length)
        return null;
    return `active ${hours.map(w => `${fmt(w[0])}to${fmt(w[1])}`).join(' ')}`;
}
/** Open map: `quiet rain 0.5 wind 0.8 traffic 0.9` — any signal, any control, in key order. */
function quietLine(sup) {
    if (!sup)
        return null;
    const parts = Object.keys(sup).map(sig => `${sig} ${fmt(sup[sig])}`);
    return parts.length ? `quiet ${parts.join(' ')}` : null;
}
/** How many instances of a class a distributed field occupies around the listener. */
export const DISTRIBUTED_FIELD_INSTANCES = 4;
/** Where the listener starts, for the compile-time distance of the nearest instance. */
const LISTENER_START = { x: 0, y: 1.6, z: 0 };
/**
 * A catalog row of kind `bed` hosted on an OBJECT CLASS is a FIELD, not a
 * point: wind is in every tree, rain on every roof, and its cited level is
 * what arrives at a listener standing among them (Bolin: vegetation noise
 * 45 to 65 dBA at the receiver). One voice on the nearest instance, stated at
 * that level "at 1 m", arrived 30 dB under it from a canopy fifteen metres
 * up and the place sounded like its bed alone. The field compiles as
 * `DISTRIBUTED_FIELD_INSTANCES` copies on the nearest instances (the engine
 * keeps them around the walker), each a sphere the size of the instance's
 * body, with the emission RAISED by the loss from the nearest body's surface
 * to the listener's start, so the field arrives at its cited level where the
 * listener stands and falls away as they leave the grove. Pure, exported
 * for the tests; `null` when the entry is not such a field.
 */
export function distributedField(entry, spec, world) {
    if (entry.mode !== 'loop' || entry.on)
        return null;
    const row = entry.catalog ? catalogRow(entry.catalog) : undefined;
    if (!row || row.kind !== 'bed')
        return null;
    const host = entry.host.toLowerCase();
    const cls = spec.objects.find(o => o.id === host);
    if (!cls)
        return null;
    const fieldDb = entry.splDb ?? row.emission.splDb;
    const radiusM = entry.radiusM ?? (cls.radiusM[0] + cls.radiusM[1]) / 2;
    const attach = entry.attach && entry.attach !== 'body' ? entry.attach : 'body';
    const instances = world ? world.objects.filter(o => o.classId === cls.id) : [];
    let nearestSurfaceM;
    if (instances.length) {
        let best = Infinity;
        for (const o of instances) {
            const p = attachPoint(o, attach);
            const dx = p.x - LISTENER_START.x, dy = p.y - LISTENER_START.y, dz = p.z - LISTENER_START.z;
            best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz) - o.radiusM);
        }
        nearestSurfaceM = best;
    }
    else {
        // No realized world yet: the class's own numbers stand in for its nearest body.
        const h = (cls.heightM[0] + cls.heightM[1]) / 2;
        const y = attach === 'top' ? h : attach === 'base' ? 0.2 : h * cls.raised + (h - h * cls.raised) * 0.5;
        const horizontal = cls.densityPer100m2 > 0 ? Math.sqrt(100 / cls.densityPer100m2) / 2 : 6;
        nearestSurfaceM = Math.hypot(horizontal, y - LISTENER_START.y) - radiusM;
    }
    const count = Math.max(1, Math.min(DISTRIBUTED_FIELD_INSTANCES, instances.length || DISTRIBUTED_FIELD_INSTANCES));
    const splDb = Math.round((fieldDb + distanceLossDb(Math.max(PANNER_REF_M, nearestSurfaceM))) * 10) / 10;
    return { count, radiusM: Math.round(radiusM * 10) / 10, splDb };
}
function voiceLines(entry, spec, world = null) {
    // A resolved `clip` binding plays that sample; otherwise inline gen — the
    // prompt IS the clip (`generation/<prompt>`), as every preset and the chat
    // generator write it. A degraded reaction keeps its `on <event>` head so
    // it still answers the event rather than a timer.
    const source = entry.clip ?? `gen ${entry.soundPrompt}`;
    const field = distributedField(entry, spec, world);
    const copies = field && field.count > 1 ? `${field.count} * ` : '';
    const head = entry.on ? `on ${entry.on} ${source}` : `${copies}${entry.mode === 'oneshot' ? 'oneshot' : 'loop'} ${source}`;
    const props = [`source_id world.${entry.id}`];
    if (entry.sourceRole)
        props.push(`source_role ${entry.sourceRole}`);
    if (entry.catalog)
        props.push(`catalog_ref ${entry.catalog}`);
    if (entry.mode === 'oneshot' && !entry.on)
        props.push(`every ${range(entry.everyS ?? [4, 12])}`);
    if (entry.cooldownS)
        props.push(`cooldown ${fmt(entry.cooldownS)}`);
    // Explicit banks can be preloaded recordings too. A lone clip does not
    // implicitly request generated variants, but must retain an authored bank.
    const variants = ecologyVariantsFor(entry, spec);
    if (variants > 1)
        props.push(`variants ${variants}`);
    if (entry.durationS !== undefined)
        props.push(`duration ${fmt(entry.durationS)}`);
    const host = entry.host.toLowerCase();
    const extent = entry.extent;
    const attach = entry.attach && entry.attach !== 'body' ? ` ${entry.attach}` : '';
    const strip = spec.strips.find(s => s.id === host);
    const patch = spec.patches.find(p => p.id === host);
    const isClass = spec.objects.some(o => o.id === host) || spec.fixtures.some(f => f.id === host)
        || !!spec.interior?.apertures.some(a => a.id === host) || !!spec.interior?.spaces.some(s => s.id === host);
    let follows = entry.follows;
    let moving = host === 'air';
    if (strip) {
        // A strip carries two kinds of sound: its continuous bed (traffic hum,
        // the river) heard along its length, and the things going BY on it (a
        // car, a boat, a train) — oneshots pass unless the entry says otherwise.
        const motion = entry.motion ?? (entry.mode === 'oneshot' ? 'pass' : 'line');
        if (motion === 'pass') {
            props.push(`at ${host} pass`);
            if (entry.radiusM)
                props.push(extent === 'ring' ? `ring ${fmt(entry.radiusM)}` : `radius ${fmt(entry.radiusM)}`);
            moving = true;
        }
        else {
            // Heard along its length: the nearest stretch is followed live, the
            // level falls 3 dB per doubling, the width gives the near-field extent.
            props.push(`at ${host}`);
            const r = entry.radiusM ?? Math.max(1, strip.widthM / 2);
            if (extent === 'ring')
                props.push(`ring ${fmt(r)}`);
            else
                props.push(`radius ${fmt(r)}`);
            if (extent !== 'ring')
                props.push('line');
        }
    }
    else if (patch) {
        // Heard around its rim (a pond's edge, a plaza's crowd).
        props.push(`at ${host}`);
        if (extent === 'radius')
            props.push(`radius ${fmt(entry.radiusM ?? patch.radiusM)}`);
        else
            props.push(`ring ${fmt(entry.radiusM ?? patch.radiusM)}`);
    }
    else if (host === 'overhead') {
        // Whatever is above the listener; fades with the cover over their head.
        props.push('at overhead');
        props.push(`radius ${fmt(entry.radiusM ?? 4)}`);
        follows = follows ?? { signal: 'overhead', in: [0, 1], out: [0.15, 1] };
    }
    else if (entry.music || host === 'listener' || extent === 'bed') {
        // A score is placed nowhere: a bed, generated as music.
        props.push('bed');
        if (entry.music)
            props.push('music');
    }
    else if (host === 'air') {
        // In the sky over the listener (12–30 m up), not a few metres overhead:
        // the emission is stated at 1 m and the distance law must have room to
        // work, or a gull "at 2 m" is the loudest thing on the corner.
        //
        // NOT `wide`. An explicit `wide` is a claim about the SOURCE — the parser
        // reads it as "this thing is that many metres across" and derives a
        // `radius` from the box (SatieParser, `place`), which the viewport then
        // draws as a shell. A bird is a point that ROAMS a wide region, which is
        // what `move dart` already says; claiming it was eight metres across put
        // a 16 m wireframe ball in the sky, and since `place overhead` is
        // listener-relative it rode above the listener everywhere they walked.
        props.push('place overhead sky');
        props.push(entry.mode === 'oneshot' ? 'move dart' : 'move drift');
    }
    else if (host === 'horizon') {
        // Far beyond the place — the engine draws a bearing 1.5–3 km out per
        // fire, so the emission can be the true one (thunder 120) and distance
        // does the rest (~48 at the ear). No world needed.
        props.push('at horizon');
    }
    else if (host === 'ground') {
        props.push('at ground');
        if (extent === 'ring')
            props.push(`ring ${fmt(entry.radiusM ?? 6)}`);
        else if (extent === 'radius')
            props.push(`radius ${fmt(entry.radiusM ?? 3)}`);
    }
    else if (isClass) {
        props.push(`at ${host}${attach}`);
        if (field)
            props.push(`radius ${fmt(field.radiusM)}`);
        else if (extent === 'radius' && entry.radiusM)
            props.push(`radius ${fmt(entry.radiusM)}`);
        else if (extent === 'ring' && entry.radiusM)
            props.push(`ring ${fmt(entry.radiusM)}`);
    }
    else {
        // Unknown host: keep the sound, place it on the ground nearby so nothing is lost.
        props.push('place ahead mid');
        if (extent === 'radius' && entry.radiusM)
            props.push(`radius ${fmt(entry.radiusM)}`);
    }
    props.push(...levelLines({ splDb: field ? field.splDb : entry.splDb, splFollows: entry.splFollows, follows }, entry.level));
    const occ = interiorOcclusion(spec, host, extent, world);
    if (occ > 0.01)
        props.push(`occlusion ${fmt(occ)}`);
    if (entry.pace && entry.mode === 'oneshot' && !entry.on)
        props.push(followLine('pace', entry.pace));
    const active = activeLine(entry.activeHours);
    if (active)
        props.push(active);
    const quiet = quietLine(entry.suppressedBy);
    if (quiet)
        props.push(quiet);
    props.push(moving ? 'visual trail' : 'visual sphere');
    if (!entry.clip)
        props.push(generationKey(entry.concept ?? entry.id));
    return [head, ...props.map(p => `  ${p}`)];
}
/** Source namespace; the parser adds the current full generation contract to the bank key. */
function generationKey(id) {
    return `gen_key ${id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}_${fnv1a(id).toString(16)}`;
}
/**
 * A repertoire whose host is not a body: one plain voice per member on the
 * entry's host, so the sounds survive even though there is nothing to move
 * or count. Loops and timed oneshots keep their timing; a chance-only
 * oneshot has no timer to fall back on and fires once.
 */
function degradedVoices(entry, spec, world = null) {
    const out = [`# ${entry.id}: ${entry.host} is not a body — its sounds are plain voices`];
    for (const sound of entry.sounds ?? []) {
        const src = {
            ...entry,
            id: `${entry.id}_${sound.id ?? sound.mode}`,
            soundPrompt: sound.soundPrompt,
            mode: sound.mode === 'on' ? 'oneshot' : sound.mode,
            level: entry.level * sound.level,
        };
        delete src.sounds;
        delete src.population;
        delete src.speedMs;
        delete src.stop;
        if (sound.clip)
            src.clip = sound.clip;
        else
            delete src.clip;
        if (sound.mode === 'on')
            src.on = sound.on;
        if (sound.splDb !== undefined)
            src.splDb = sound.splDb;
        if (sound.splFollows)
            src.splFollows = sound.splFollows;
        if (sound.everyS)
            src.everyS = sound.everyS;
        else
            delete src.everyS;
        if (sound.follows)
            src.follows = sound.follows;
        else
            delete src.follows;
        if (sound.pace)
            src.pace = sound.pace;
        else if (!sound.everyS)
            delete src.pace;
        if (sound.variants !== undefined)
            src.variants = sound.variants;
        src.durationS = ecologySoundDurationS(sound);
        if (sound.radiusM !== undefined) {
            src.radiusM = sound.radiusM;
            src.extent = src.extent ?? 'radius';
        }
        if (sound.cooldownS)
            src.cooldownS = sound.cooldownS;
        if (sound.activeHours)
            src.activeHours = sound.activeHours;
        if (sound.suppressedBy)
            src.suppressedBy = { ...(entry.suppressedBy ?? {}), ...sound.suppressedBy };
        out.push(...voiceLines(src, spec, world));
    }
    return out;
}
/** One member statement + its property block (relative indentation: head at 0, props at 2). */
function memberLines(sound, entry, spec, kind, entityVariants, entitySplDb, occlusionX = 0) {
    const source = sound.clip ?? `gen ${sound.soundPrompt}`;
    const head = sound.mode === 'on'
        ? `on ${sound.on} ${source}`
        : `${sound.mode} ${source}`;
    const props = [`source_id world.${entry.id}.${sound.id ?? entry.sounds?.indexOf(sound) ?? 0}`];
    if (sound.sourceRole ?? entry.sourceRole)
        props.push(`source_role ${sound.sourceRole ?? entry.sourceRole}`);
    if (sound.catalog)
        props.push(`catalog_ref ${sound.catalog}`);
    // Any mode, not just a oneshot: `voice` is what makes a member SPEECH, and
    // the speech case is an `on speak` member, which a oneshot-only branch
    // never reached.
    if (sound.voiceId)
        props.push(`voice ${sound.voiceId}`);
    if (sound.mode === 'oneshot') {
        // A repeating member has an interval; `chance` is a once-per-life sound's word and the
        // parser warns and ignores it beside `every` (2026-10-02: that warning failed a build
        // with "retry" as the only offer). The plan's intent is the repeat; the chance goes.
        if (sound.everyS)
            props.push(`every ${range(sound.everyS)}`);
        else if (sound.chance !== undefined)
            props.push(`chance ${fmt(sound.chance)}`);
    }
    if (sound.mode === 'on' && sound.withinM !== undefined)
        props.push(`within ${fmt(sound.withinM)}`);
    if (sound.mode === 'on' && sound.responders !== undefined)
        props.push(`responders ${sound.responders}`);
    if (sound.mode === 'on' && sound.respondChance !== undefined)
        props.push(`respond_chance ${fmt(sound.respondChance)}`);
    if (sound.spreadS)
        props.push(`spread ${range(sound.spreadS)}`);
    if (sound.cooldownS)
        props.push(`cooldown ${fmt(sound.cooldownS)}`);
    // Members inherit the entity's pool; say so only where a member differs.
    const variants = ecologyVariantsFor(entry, spec, sound);
    if (variants !== entityVariants)
        props.push(`variants ${variants}`);
    const durationS = ecologySoundDurationS(sound);
    if (durationS !== undefined)
        props.push(`duration ${fmt(durationS)}`);
    if (sound.emits)
        props.push(`emit ${sound.emits}`);
    if (sound.radiusM !== undefined)
        props.push(`radius ${fmt(sound.radiusM)}`);
    // The member's emission (its own, else the entry's — hoisted to the entity
    // line when every member shares it); the entry's level is the body's
    // overall level, each member's relative to it, as the trim when no
    // emission is stated.
    props.push(...levelLines({ splDb: sound.splDb ?? entry.splDb, splFollows: sound.splFollows, follows: sound.follows }, entry.level * sound.level, entitySplDb));
    if (occlusionX > 0.01)
        props.push(`occlusion ${fmt(occlusionX)}`);
    if (sound.pitchFollows)
        props.push(followLine('pitch', sound.pitchFollows));
    // `pace` only where `every` is: a timed member of a population inherits the
    // entry's pace; a route's entry-level pace scales the spawn interval instead.
    if (sound.mode === 'oneshot' && sound.everyS) {
        const pace = sound.pace ?? (kind === 'population' ? entry.pace : undefined);
        if (pace)
            props.push(followLine('pace', pace));
    }
    const active = activeLine(sound.activeHours);
    if (active)
        props.push(active);
    const quiet = quietLine(sound.suppressedBy);
    if (quiet)
        props.push(quiet);
    // The bank is the CONCEPT's (spec 006): the instances of a split group share one generated bank, so a
    // seven-person cafe buys one conversation bank, not seven, and the takes rotate across the people.
    if (!sound.clip)
        props.push(generationKey(`${entry.concept ?? entry.id}.${sound.id ?? entry.sounds?.indexOf(sound) ?? 0}`));
    return [head, ...props.map(p => `  ${p}`)];
}
/** A state name as a script slug: "dawn chorus" -> `dawn_chorus`. */
export function stateSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}
/**
 * The entry's states as `state` lines, so the script keeps them and an edit can hold one (the hours
 * themselves already sit on the members' `active` lines, from `settleStates`). Only sounds the entry has.
 */
function stateLines(entry) {
    const ids = new Set((entry.sounds ?? []).map(s => s.id).filter((x) => !!x));
    const out = [];
    const seen = new Set();
    for (const st of entry.states ?? []) {
        const name = stateSlug(st.name);
        const sounds = (st.sounds ?? []).filter(id => ids.has(id));
        if (!name || seen.has(name) || !sounds.length)
            continue;
        seen.add(name);
        const hours = st.hours ? ` ${fmt(st.hours[0])}to${fmt(st.hours[1])}` : '';
        out.push(`state ${name}${hours} sounds ${sounds.join(',')}`);
    }
    return out;
}
/**
 * An entity block for an entry with a repertoire: the body's host line, its
 * kinematics (route) or size (population), the gates that apply to the whole
 * body, then one member per sound. Top level, closed by `endentity`.
 */
function entityLines(entry, spec, kind, world) {
    const host = entry.host.toLowerCase();
    const props = [];
    if (kind === 'route') {
        props.push(`at ${host} pass`);
        props.push(`every ${range(entry.everyS ?? [6, 14])}`);
        if (entry.speedMs)
            props.push(`speed ${range(entry.speedMs)}`);
        if (entry.gaitM)
            props.push(`gait ${range(entry.gaitM)}`);
        if (entry.stop)
            props.push(`stop ${fmt(entry.stop.chance)} ${range(entry.stop.s)}`);
        if (entry.pace)
            props.push(followLine('pace', entry.pace));
    }
    else {
        const attach = entry.attach && entry.attach !== 'body' ? ` ${entry.attach}` : '';
        const isClass = spec.objects.some(o => o.id === host) || spec.fixtures.some(f => f.id === host);
        // A STRIP or PATCH host keeps its host: `resolveAnchors` lays anchors
        // along the feature every few metres, so a population on the sidewalk
        // perches and relocates ALONG the sidewalk. Collapsing it to `at ground`
        // threw that away and scattered them over the whole patch — pedestrians
        // wandering into the avenue. Only a host the world does not know falls
        // back to ground points.
        const isFeature = spec.strips.some(f => f.id === host) || spec.patches.some(f => f.id === host);
        props.push(isClass || isFeature ? `at ${host}${attach}` : 'at ground');
        if ((entry.population ?? 1) > 1)
            props.push(`count ${entry.population}`);
        // The individuals' behaviour (the agent layer — engine/world/EntityAgents.ts):
        // only what the entry states; the engine's defaults are a population
        // that never moves, never startles, always calls and voices everyone.
        if (entry.speedMs)
            props.push(`speed ${range(entry.speedMs)}`);
        if (entry.gaitM)
            props.push(`gait ${range(entry.gaitM)}`);
        if (entry.dwellS)
            props.push(`dwell ${range(entry.dwellS)}`);
        if (entry.relocateM)
            props.push(`relocate ${range(entry.relocateM)}`);
        if (entry.travel)
            props.push(`move ${entry.travel}`);
        if (entry.startleM)
            props.push(entry.hushS ? `startle ${fmt(entry.startleM)} ${range(entry.hushS)}` : `startle ${fmt(entry.startleM)}`);
        if (entry.callChance !== undefined && entry.callChance < 1)
            props.push(`call ${fmt(entry.callChance)}`);
        if (entry.callers)
            props.push(`callers ${entry.callers}`);
        if (entry.gapS)
            props.push(`gap ${range(entry.gapS)}`);
        if (entry.voices)
            props.push(`voices ${entry.voices}`);
        if (entry.windowM)
            props.push(`window ${fmt(entry.windowM)}`);
        if (entry.swayM)
            props.push(`sway ${fmt(entry.swayM)}`);
    }
    const active = activeLine(entry.activeHours);
    if (active)
        props.push(active);
    const quiet = quietLine(entry.suppressedBy);
    if (quiet)
        props.push(quiet);
    props.push(...stateLines(entry));
    const entityVariants = entry.variants ?? defaultEntityVariants(kind);
    if (entityVariants > 1)
        props.push(`variants ${entityVariants}`);
    // One emission shared by every member is the body's: said once, inherited.
    const entitySplDb = sharedSplDb(entry);
    if (entitySplDb !== undefined)
        props.push(`spl ${fmt(entitySplDb)}`);
    const moves = kind === 'route' || !!(entry.travel || entry.relocateM || entry.dwellS);
    if (entry.behavior)
        props.push(`behavior ${JSON.stringify(entry.behavior)}`);
    if (entry.body)
        props.push(`body ${JSON.stringify(entry.body)}`);
    props.push(moves ? 'visual trail' : 'visual sphere');
    const out = [`entity ${entry.id}`, ...props.map(p => `  ${p}`)];
    const occ = interiorOcclusion(spec, host, entry.extent, world);
    for (const sound of entry.sounds ?? []) {
        for (const line of memberLines(sound, entry, spec, kind, entityVariants, entitySplDb, occ))
            out.push(`  ${line}`);
    }
    out.push('endentity');
    return out;
}
function hourWords(h) {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
/** Plain sources are top-level unless a caller explicitly requests a named edit group. */
function ecologyLines(entries, spec, group, world = null) {
    const plain = [];
    const entities = [];
    for (const entry of entries) {
        const kind = repertoireKind(entry, spec);
        if (kind)
            entities.push(entityLines(entry, spec, kind, world));
        else if (entry.sounds?.length)
            plain.push(...degradedVoices(entry, spec, world));
        else
            plain.push(...voiceLines(entry, spec, world));
    }
    const out = [];
    if (plain.length && group) {
        out.push(`group ${group}`);
        for (const line of plain)
            out.push(`  ${line}`);
        out.push('endgroup');
    }
    else
        out.push(...plain);
    for (const block of entities) {
        if (out.length && out[out.length - 1] !== '')
            out.push('');
        out.push(...block);
    }
    return out;
}
/** Compile a subset for appending to an existing world; optional group is an explicit edit boundary. */
export function compileEcologyEntries(entries, spec, world = null, opts = {}) {
    const lines = ecologyLines(entries, spec, opts.group, world);
    return lines.length ? lines.join('\n') + '\n' : '';
}
/** Compile a world and its plain sources / entity blocks, without redundant grouping. */
export function compileWorldScript(spec, world = null) {
    if (spec.interior && !world)
        world = realizeWorld(spec);
    const out = [];
    out.push(`# ${spec.biome} — ${spec.time.season}, ${hourWords(spec.time.hour)}`);
    out.push('level_reference 70');
    out.push(formatWorldBlock(spec));
    const room = roomBlockLines(spec);
    if (room.length) {
        out.push('');
        out.push(...room);
    }
    out.push('');
    out.push(...ecologyLines(spec.ecology, spec, undefined, world));
    return out.join('\n') + '\n';
}
//# sourceMappingURL=WorldCompile.js.map