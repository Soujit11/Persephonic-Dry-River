/**
 * Planned variants (spec 012): a planner (a model, in `src/lib/ai/variantPlan.ts`) reads what one
 * soundscape is and proposes the most telling ways it could sound different, each a coordinated
 * set of changes; this module turns a plan into moves the script can take, and refuses what would
 * not be true to the world. "Model understands, code executes."
 *
 * Pure apart from the library it is handed: no DOM, no audio, no model.
 */
import { parse, parseScene } from '../core/SatieParser.js';
import { MAX_GROUP, MAX_INSTANCES, instancesOf } from './place.js';
/** Conditions a variant may not invent: each is allowed only when the script already has it. */
const CONDITIONS = {
    rain: /\b(rain\w*|drizzl\w*|downpour|puddles?|raindrops?)\b/,
    storm: /\b(storms?|stormy|thunder\w*|lightning)\b/,
    snow: /\b(snow\w*|blizzard|sleet)\b/,
    // not "nightingale" or "nightjar": birds, not the hour
    night: /\b(night|nights|nighttime|night-time|nightfall|midnight|nocturnal|owls?)\b/,
    morning: /\b(dawn|sunrise|daybreak|morning|dawn chorus)\b/,
    evening: /\b(dusk|sunset|evening|twilight)\b/,
    // people, not birds: "sparrows chattering" is no crowd, nor "a crowd of cicadas" or "crowded cedars" (run 6)
    crowd: /\b(crowds?(?! of (?!people|voices|visitors|tourists|commuters))|throng|people (talking|chatting)|voices chatting|crowd chatter|human chatter)\b/,
    traffic: /\b(traffic|cars?|honk\w*|motorbikes?|scooters?)\b/,
    sea: /\b(sea|ocean|surf|waves|seagulls?|gulls?)\b/,
    gale: /\b(gales?|gusts?|howling wind|windstorm)\b/,
    // the season: a summer world has no late-autumn crickets (run 8)
    spring: /\b(spring ?time|springtime|vernal|in spring|early spring|late spring)\b/,
    summer: /\b(summer\w*|midsummer)\b/,
    autumn: /\b(autumn\w*|fall foliage|late fall)\b/,
    winter: /\b(winter\w*|wintry|midwinter)\b/,
};
/**
 * People are the game's characters (who is there, who walks, who talks): a variant adds only unseen
 * life and things, never a person (run 6: footsteps added on the shrine steps).
 */
const PEOPLE = /\b(foot ?steps?|footfalls?|voices?|people|persons?|someone|man|woman|men|women|child(ren)?|kids?|talking|chatting|conversation|laugh\w*|cough\w*|monks?|priests?|visitors?|walkers?|worshipp?ers?|tourists?)\b/;
export const namesPeople = (text) => PEOPLE.test(words(text));
/** Seasons: what time of year a world is, not a state its game switches; a name may say the one it has. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const words = (s) => ` ${s.toLowerCase().replace(/[_\-/.]+/g, ' ')} `;
/** The conditions a script already has: in its sounds, its prompts, its soundscapes and its zones. */
export function conditionsIn(script) {
    const text = words(script);
    return Object.keys(CONDITIONS).filter(c => CONDITIONS[c].test(text));
}
/** The conditions `text` names that are not in `have`. */
export function newConditions(text, have) {
    const t = words(text);
    return Object.keys(CONDITIONS).filter(c => !have.includes(c) && CONDITIONS[c].test(t));
}
/** A soundscape's own presence signal (`in_<soundscape>`, spec 014): Satie's, never the game's. */
export const isSatieSignal = (signal) => /^!?in_[a-z0-9_]+$/i.test(signal);
/** The world's own conditions (the hour, the weather): a gate on one is a state of the world, like a `zone`. */
const WORLD_SIGNALS = new Set(['hour', 'rain', 'wind', 'fog', 'temp', 'overhead', 'canopy', 'exposure']);
export const isWorldSignal = (signal) => WORLD_SIGNALS.has(signal.replace(/^!/, '').toLowerCase());
/** A signal the game itself sets (a train's speed, the crossing bells): neither Satie's nor the world's state. */
export const isGameSignal = (signal) => !isSatieSignal(signal) && !isWorldSignal(signal);
const silences = (st) => !!st.volumeFollow && !isSatieSignal(st.volumeFollow.signal)
    && Math.min(st.volumeFollow.outMin, st.volumeFollow.outMax) <= 0.05;
/** A volume binding the game can turn down to silence (a follow on Satie's own signal or the weather is not one). */
const gameSilences = (st) => silences(st) && isGameSignal(st.volumeFollow.signal);
const isSteady = (st) => st.kind === 'loop' && !(st.whenCondition && isGameSignal(st.whenCondition.signal)) && !gameSilences(st);
/**
 * What in the game starts or switches a sound, or null (Huanxing, 2026-11-12: the game decides what
 * happens, physics how sound travels, and a variant only the cast of sounds Satie designs). The game
 * drives an `on <event>` voice, a `when` gate on a game signal, and a volume it can turn down to
 * silence (the crossing bells, the train). A variant gives such a sound only another recording. A
 * follow that only shapes a sound (the wind swaying the bamboo, never silent) and anything on
 * Satie's own `in_<soundscape>` signal are not the game: the recording and the base level are
 * Satie's to vary. A sound that plays only in a state (`gatedBy`) is not driven either.
 */
export function drivenBy(st) {
    if (st.kind === 'trigger')
        return `the ${st.eventName ?? 'game'} event`;
    if (st.whenCondition && isGameSignal(st.whenCondition.signal))
        return `${st.whenCondition.signal}`;
    if (gameSilences(st))
        return `${st.volumeFollow.signal}`;
    return null;
}
/**
 * The state a sound plays only in, or null: a `zone` (the dusk frogs, the afternoon cicadas), or a
 * gate on the world's own hour or weather (Huanxing, 2026-11-13). The game decides whether and when
 * it plays, so a variant never leaves it out or brings it back; while it plays it is ambience like
 * any other, so how many, how loud, which recording and what else lives there then are Satie's.
 */
export function gatedBy(st) {
    if (drivenBy(st))
        return null;
    if (st.zones?.length)
        return `the ${st.zones.join(' / ')} state`;
    if (st.whenCondition && isWorldSignal(st.whenCondition.signal))
        return `the ${st.whenCondition.signal.replace(/^!/, '')}`;
    if (silences(st))
        return `the ${st.volumeFollow.signal.replace(/^!/, '')}`;
    return null;
}
/** A level change smaller than this (dB) is not heard as a different place: a planned one is raised to it. */
export const LEAST_HEARD_DB = 4;
/** Its level in dB: the middle of its range, or of the range it follows a signal through. */
const levelOf = (st) => {
    const f = st.splFollow;
    const mid = f ? (f.outMin + f.outMax) / 2 : st.spl.isNull ? null : (st.spl.min + st.spl.max) / 2;
    return mid === null ? null : Math.round(mid * 10) / 10;
};
/** An added sound quieter than this under the sound it is built like is not heard: a planned one is raised to it. */
export const ADD_FLOOR_DB = -12;
const whatItIs = (st) => (st.genPrompt ? st.genPrompt.slice(0, 140) : (st.clip ?? '').replace(/^community\//, '').replace(/[-_]+/g, ' '));
const firstOf = (stmts, id) => stmts.find(s => s.sourceId === id && s.entityId === null) ?? stmts.find(s => s.sourceId === id);
/** What one soundscape is, read from the script, for the planner. */
export function inventoryOf(script, place, world = []) {
    let stmts = [];
    let rooms = [];
    try {
        stmts = parse(script);
    }
    catch { /* an unreadable script has no sounds */ }
    let entities = [];
    try {
        const scene = parseScene(script);
        rooms = scene.rooms;
        entities = scene.entities;
    }
    catch { /* nor rooms */ }
    const sounds = [];
    for (const id of place.sourceIds) {
        const st = firstOf(stmts, id);
        if (!st)
            continue;
        const every = st.every.isNull ? undefined : [st.every.min, st.every.max];
        const driven = drivenBy(st), gated = gatedBy(st);
        const def = st.entityId ? entities.find(e => e.id === st.entityId) : undefined;
        sounds.push({
            id, is: whatItIs(st), role: isSteady(st) ? 'steady' : 'moment', db: levelOf(st),
            ...(every && !isSteady(st) ? { every } : {}),
            instances: instancesOf(stmts, id, entities),
            ...(st.hostRef ?? def?.hostRef ? { at: (st.hostRef ?? def?.hostRef) } : {}),
            ...(driven ? { drivenBy: driven } : {}),
            ...(gated ? { playsOnlyIn: gated } : {}),
            ...(def ? { group: def.hostMotion === 'pass'
                    ? { id: def.id, kind: 'route', every: [def.every.min, def.every.max] }
                    : { id: def.id, kind: 'population', n: def.count } } : {}),
        });
    }
    const objects = place.objects ?? [];
    const voiced = new Set(sounds.map(s => s.at).filter(Boolean));
    const outside = world.map(id => firstOf(stmts, id)).filter((st) => !!st && isSteady(st))
        .map(st => { const d = drivenBy(st), g = gatedBy(st); return { id: st.sourceId, is: whatItIs(st), db: levelOf(st), ...(d ? { drivenBy: d } : {}), ...(g ? { playsOnlyIn: g } : {}) }; });
    return {
        id: place.id, label: place.label,
        ...(place.kind ? { kind: place.kind } : {}), ...(place.share ? { share: place.share } : {}), ...(place.why ? { why: place.why } : {}),
        sounds, objects, quiet: objects.filter(o => !voiced.has(o)), outside,
        rooms: rooms.filter(r => place.rooms?.includes(r.name)).map(r => ({ name: r.name, ...(r.rt60S ? { rt60: r.rt60S } : {}), ...(r.surfaces?.walls ? { walls: r.surfaces.walls } : {}) })),
        conditions: conditionsIn(script),
    };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sound';
/**
 * Turn one planned variant into moves on `script`, keeping it true to the world: only the
 * soundscape's own sounds change (the world layer only by how loud it is heard here), nothing
 * moves, an added sound goes at one of its objects or beside one of its sounds, no change names a
 * condition the world lacks, and a recording comes from the library or the change is refused.
 * A moment the game starts keeps its timing: the game decides when it sounds.
 */
export async function resolvePlan(variant, ctx) {
    const { script, place } = ctx;
    const world = new Set(ctx.world ?? []);
    const held = ctx.held ?? new Set();
    let stmts = [];
    try {
        stmts = parse(script);
    }
    catch {
        return { moves: [], takes: {}, refused: variant.changes.map(change => ({ change, why: 'the script does not read' })), raised: [], states: [] };
    }
    let entities = [];
    try {
        entities = parseScene(script).entities;
    }
    catch { /* parse read it; no groups then */ }
    const groupOf = (st) => (st.entityId ? entities.find(e => e.id === st.entityId) ?? null : null);
    const have = conditionsIn(script);
    const own = new Set(place.sourceIds.filter(id => !world.has(id)));
    const ids = new Set(stmts.map(s => s.sourceId).filter(Boolean));
    const out = { moves: [], takes: {}, refused: [], raised: [], states: [] };
    const refuse = (change, why) => { out.refused.push({ change, why }); };
    /** A level step big enough to hear: at least `LEAST_HEARD_DB`, in the direction asked. */
    const heard = (change, db, lo, hi) => {
        let v = Math.round(clamp(db, lo, hi) * 2) / 2;
        if (v !== 0 && Math.abs(v) < LEAST_HEARD_DB) {
            out.raised.push({ change, why: `${v} dB raised to ${Math.sign(v) * LEAST_HEARD_DB}: smaller is not heard` });
            v = Math.sign(v) * LEAST_HEARD_DB;
        }
        return v;
    };
    /** Changes the game's own sounds take: only another recording; a sound that plays only in a state, anything but whether it plays. */
    const gameOwns = (change, st) => {
        const d = drivenBy(st);
        if (d && change.op !== 'retake') {
            refuse(change, `the game drives it (${d}); a variant leaves it to the game`);
            return true;
        }
        const g = gatedBy(st);
        if (g && (change.op === 'leave_out' || change.op === 'bring_back')) {
            refuse(change, `the game decides whether it plays (${g}); a variant changes only how it sounds then`);
            return true;
        }
        return false;
    };
    const touched = new Set();
    const ownSound = (change, id) => {
        if (!own.has(id)) {
            refuse(change, world.has(id) ? 'a world sound changes only by how loud it is heard here (outside)' : `${id} is not one of this soundscape's sounds`);
            return null;
        }
        if (held.has(id)) {
            refuse(change, `${id} is locked`);
            return null;
        }
        const st = firstOf(stmts, id);
        if (!st) {
            refuse(change, `${id} is not in the script`);
            return null;
        }
        return st;
    };
    const playsNow = (st) => st.clip || st.genPrompt || '';
    // every recording already heard in this soundscape (its own sounds and the world as heard there):
    // a variant never brings one in again (world correctness, run 887df1de: "Creaking bamboo" retook
    // the culms and added a rub, both with the leaf rustle the bamboo already plays)
    const heardHere = [...new Set(stmts.filter(st => st.sourceId && (place.sourceIds.includes(st.sourceId) || world.has(st.sourceId))).map(st => st.clip).filter((c) => !!c))];
    const find = async (query, loop, sourceId) => {
        if (!ctx.library)
            return [];
        // the library adapters read a clip with spaces in it as words to search for
        const phrase = /\s/.test(query.trim()) ? query.trim() : `${query.trim().replace(/[-_]+/g, ' ')} sound`;
        try {
            const takes = await ctx.library.near({ soundscape: ctx.soundscape ?? place.id, sourceId, clip: phrase, loop, shown: heardHere, limit: 3 });
            // a recording named for a condition the world lacks is not this world's ("few-late-autumn-crickets" in summer, run 8)
            return takes.filter(t => t.clip && !/\s/.test(t.clip) && !heardHere.includes(t.clip) && !newConditions(`${t.clip} ${t.name ?? ''}`, have).length);
        }
        catch {
            return [];
        }
    };
    /** The first offer no other change in this variant took. */
    const picked = new Set();
    const pick = (takes) => { const t = takes.find(x => !picked.has(x.clip)) ?? null; if (t)
        picked.add(t.clip); return t; };
    // every library search starts at once (a compose gives each soundscape a time limit); a change
    // refused below simply does not use its answer
    const asked = (change) => {
        if (change.op === 'replace' || change.op === 'retake') {
            const st = own.has(change.id) ? firstOf(stmts, change.id) : undefined;
            if (!st)
                return null;
            const query = change.op === 'replace' ? change.query : playsNow(st);
            return { query, loop: st.kind === 'loop', id: change.id, asked: change.op === 'replace' ? query : `another recording of ${whatItIs(st)}` };
        }
        if (change.op === 'add') {
            const like = own.has(change.like) ? firstOf(stmts, change.like) : undefined;
            return like ? { query: change.query, loop: like.kind === 'loop', id: change.like, asked: change.query } : null;
        }
        return null;
    };
    const asks = variant.changes.map(asked);
    /** Per change, the first offer the vetter said is another kind of sound (for the refusal). */
    const wrongKind = [];
    const searches = await (async () => {
        const raw = asks.map(a => (a ? find(a.query, a.loop, a.id) : null));
        if (!ctx.vet)
            return raw;
        const lists = await Promise.all(raw);
        const pairs = lists.flatMap((offers, i) => (offers ?? []).map(t => ({ i, clip: t.clip, ask: { asked: asks[i].asked, clip: t.clip, ...(t.name ? { name: t.name } : {}) } })));
        if (!pairs.length)
            return raw;
        let ok = null;
        // fails open: without a verdict the offers stand as the library ranked them
        try {
            ok = await ctx.vet(pairs.map(p => p.ask));
        }
        catch {
            ok = null;
        }
        if (!ok)
            return raw;
        const no = new Set(pairs.filter((_, k) => ok[k] === false).map(p => `${p.i}|${p.clip}`));
        return lists.map((offers, i) => {
            if (!offers)
                return null;
            wrongKind[i] = offers.find(t => no.has(`${i}|${t.clip}`))?.clip;
            return Promise.resolve(offers.filter(t => !no.has(`${i}|${t.clip}`)));
        });
    })();
    const noTake = (i, offers) => (wrongKind[i] && !offers.length
        ? `the library's nearest (${wrongKind[i]}) is another kind of sound`
        : offers.length ? 'the library only has recordings this place already plays' : 'the library has nothing new for it');
    // the conditions the sounds it changes play in: a label naming them describes those sounds
    for (const change of variant.changes) {
        const id = 'id' in change ? change.id : change.op === 'add' ? change.like : undefined;
        const st = id && own.has(id) ? firstOf(stmts, id) : undefined;
        const g = st ? gatedBy(st) : null;
        if (g)
            for (const c of newConditions(`${g} ${id}`, []))
                if (!out.states.includes(c))
                    out.states.push(c);
    }
    for (const [i, change] of variant.changes.entries()) {
        switch (change.op) {
            case 'level': {
                const st = ownSound(change, change.id);
                if (!st || gameOwns(change, st))
                    break;
                // a level that follows the wind keeps following it, louder or quieter at every wind (run 7: the bamboo interior)
                if (st.spl.isNull && !st.splFollow) {
                    refuse(change, 'it has no level written');
                    break;
                }
                out.moves.push({ op: 'level', sound: change.id, db: heard(change, change.db, -18, 12) });
                break;
            }
            case 'often': {
                const st = ownSound(change, change.id);
                if (!st || gameOwns(change, st))
                    break;
                const route = groupOf(st)?.hostMotion === 'pass';
                if (st.every.isNull && !route) {
                    refuse(change, st.kind === 'loop' ? 'it plays all the time' : 'the game decides when it sounds');
                    break;
                }
                out.moves.push({ op: 'density', sound: change.id, factor: clamp(change.factor, 0.25, 4) });
                break;
            }
            case 'leave_out': {
                const st = ownSound(change, change.id);
                if (st && !gameOwns(change, st))
                    out.moves.push({ op: 'silence', sound: change.id });
                break;
            }
            case 'bring_back': {
                const st = ownSound(change, change.id);
                if (st && !gameOwns(change, st))
                    out.moves.push({ op: 'restore', sound: change.id });
                break;
            }
            case 'replace':
            case 'retake': {
                const st = ownSound(change, change.id);
                if (!st || gameOwns(change, st))
                    break;
                if (st.recordings?.takes?.length) {
                    refuse(change, 'it plays a set of recordings of its own');
                    break;
                }
                if (touched.has(change.id)) {
                    refuse(change, 'its recording is already changed in this variant');
                    break;
                }
                const query = change.op === 'replace' ? change.query : playsNow(st);
                if (change.op === 'replace') {
                    const bad = newConditions(query, have);
                    if (bad.length) {
                        refuse(change, `the world has no ${bad.join(', ')}`);
                        break;
                    }
                    if (namesPeople(query)) {
                        refuse(change, 'people are the game\'s characters; a variant adds only unseen life and things');
                        break;
                    }
                }
                const offers = (await searches[i]) ?? [];
                const take = pick(offers);
                if (!take) {
                    refuse(change, noTake(i, offers));
                    break;
                }
                touched.add(change.id);
                out.moves.push({ op: 'take', sound: change.id, clip: take.clip });
                out.takes[take.clip] = take;
                break;
            }
            case 'add': {
                const like = ownSound(change, change.like);
                if (!like)
                    break;
                if (like.entityId) {
                    refuse(change, `it is one of the ${like.entityId} group's sounds: vary the group (how many) instead`);
                    break;
                }
                if (drivenBy(like)) {
                    refuse(change, `a copy of ${change.like} would be driven by the game too (${drivenBy(like)}); build it like a sound the game does not drive`);
                    break;
                }
                if (change.at && !(place.objects ?? []).includes(change.at) && !stmts.some(s => s.hostRef === change.at && own.has(s.sourceId ?? ''))) {
                    refuse(change, `${change.at} is not an object of this soundscape`);
                    break;
                }
                const bad = newConditions(change.query, have);
                if (bad.length) {
                    refuse(change, `the world has no ${bad.join(', ')}`);
                    break;
                }
                if (namesPeople(change.query)) {
                    refuse(change, 'people are the game\'s characters; a variant adds only unseen life and things');
                    break;
                }
                const offers = (await searches[i]) ?? [];
                const take = pick(offers);
                if (!take) {
                    refuse(change, noTake(i, offers));
                    break;
                }
                let id = slug(change.query);
                for (let n = 2; ids.has(id); n++)
                    id = `${slug(change.query)}_${n}`;
                ids.add(id);
                const every = change.every && change.every[0] > 0 && change.every[1] >= change.every[0] ? change.every : undefined;
                let db = change.db ? clamp(change.db, -18, 12) : 0;
                if (db < ADD_FLOOR_DB) {
                    out.raised.push({ change, why: `${db} dB under ${change.like} raised to ${ADD_FLOOR_DB}: quieter is not heard` });
                    db = ADD_FLOOR_DB;
                }
                out.moves.push({ op: 'add', sound: id, like: change.like, clip: take.clip, ...(change.at ? { at: change.at } : {}), ...(db ? { db } : {}), ...(every && like.kind !== 'loop' ? { every } : {}) });
                out.takes[take.clip] = take;
                break;
            }
            case 'instances': {
                const st = ownSound(change, change.id);
                if (!st || gameOwns(change, st))
                    break;
                const group = groupOf(st);
                if (group?.hostMotion === 'pass') {
                    refuse(change, `the ${group.id} come one after another along their route: vary how often they come`);
                    break;
                }
                out.moves.push({ op: 'count', sound: change.id, n: Math.round(clamp(change.n, 1, group ? MAX_GROUP : MAX_INSTANCES)) });
                break;
            }
            case 'spread': {
                const st = ownSound(change, change.id);
                if (!st || gameOwns(change, st))
                    break;
                if (st.pitchFollow) {
                    refuse(change, 'its pitch follows the game');
                    break;
                }
                const r = 2 ** (clamp(change.semitones, 0, 4) / 12);
                out.moves.push({ op: 'pitch', sound: change.id, range: change.semitones > 0 ? [Math.round(100 / r) / 100, Math.round(100 * r) / 100] : null });
                break;
            }
            case 'outside': {
                refuse(change, 'physics decides how much of the outside reaches here (its walls and distance), not a variant');
                break;
            }
            case 'room': {
                refuse(change, "physics decides how a room rings (its size and materials), not a variant");
                break;
            }
        }
    }
    return out;
}
//# sourceMappingURL=plan.js.map