/**
 * How variants differ (spec 012), pure apart from the library it is handed: no DOM, no audio.
 *
 * What a soundscape sounds like is what plays all the time there: its own steady sounds (loops,
 * beds, fields nothing switches off) and the world layer as heard there (`heard_in`). Moments (a
 * door, the shrine bell, a crow every half minute, the crossing bells that ring only while the gate
 * is down) are rare, so they never count toward how different a variant is, however loud they are
 * written (Huanxing and world correctness, 2026-11-12: the farmhouse is its
 * walls and the muffled outside, not its doors).
 *
 * - `varyNear`: the one rule for new variants near another (More like N, and the compose step's
 *   presets). Each aims to change 15% to 60% of the steady sound: first by re-picking its own steady
 *   sounds from their own region of the library; where those cannot reach it, by how loud the
 *   outside comes in (the world layer, louder in one, quieter in the other); where only one loud
 *   sound can, by that sound alone. Each may also re-pick one event, as an accent. Positions stay.
 * - `presetVariants`: variants 2 and 3 of every soundscape from the first draft, library only.
 * - `variantDistance`: the share of the steady sound that differs between two scripts, and which
 *   events changed.
 *
 * Not heard yet (2026-11-12): the band, 3 re-picks, 6 dB as a full change and 3 dB as the least
 * outside change are a first guess for the listening check to correct.
 */
import { parse, parseScene } from '../core/SatieParser.js';
import { applyMoves, instancesOf } from './place.js';
import { inventoryOf, isGameSignal, newConditions, resolvePlan, SEASONS } from './plan.js';
/** Steady sounds re-picked per new variant, at most: few enough that it stays near the one it came from. */
export const REPICKS_PER_VARIANT = 3;
/** Events re-picked per new variant, at most (an accent; never counted toward the band). */
export const EVENT_ACCENTS = 1;
/** A level change this large (dB) counts as the whole sound changed, in `variantDistance`. */
export const FULL_CHANGE_DB = 6;
/** The least change to how loud the outside comes in that a variant makes (dB): less is not heard. */
export const LEAST_OUTSIDE_DB = 3;
/** Where a variant's distance from the one it came from should sit (share of the steady sound). Unverified. */
export const VARIETY_BAND = { min: 0.15, max: 0.6 };
/** A volume this low (0..1) counts as silent: a sound the game can turn down to it is a moment. */
const SILENT_VOLUME = 0.05;
/**
 * Steady: plays all the time (a loop, bed or field nothing can switch off). A oneshot, an `on <event>`
 * voice, a loop gated by `when`, or one whose volume follows a signal down to silence (the crossing
 * bells, a passing train) is a moment.
 */
const isSteady = (st) => st.kind === 'loop' && !(st.whenCondition && isGameSignal(st.whenCondition.signal))
    && !(st.volumeFollow && isGameSignal(st.volumeFollow.signal) && Math.min(st.volumeFollow.outMin, st.volumeFollow.outMax) <= SILENT_VOLUME);
const levelOf = (st) => (!st ? null : st.splFollow ? (st.splFollow.outMin + st.splFollow.outMax) / 2 : st.spl.isNull ? null : (st.spl.min + st.spl.max) / 2);
const voice = (ss, id) => ss.find(s => s.sourceId === id && s.entityId === null) ?? ss.find(s => s.sourceId === id);
/** The `heard_in` dB this sound has for `signal` (positive form), 0 when none. */
const heardDb = (st, signal) => (signal && st.heardIn?.find(e => e.signal === signal.toLowerCase() && !e.invert)?.db) || 0;
/** Decibels to power, a sound without a stated level weighing as the average of the others. */
function powerOf(dbs) {
    const stated = dbs.filter((v) => v !== null);
    const fallback = stated.length ? stated.reduce((s, v) => s + v, 0) / stated.length : 60;
    return d => 10 ** ((d ?? fallback) / 10);
}
function steadyHeard(stmts, place, world, entities = []) {
    const out = [];
    for (const id of [...place.sourceIds, ...[...world].filter(w => !place.sourceIds.includes(w))]) {
        const st = voice(stmts, id);
        if (!st || st.mute || !isSteady(st))
            continue;
        const w = world.has(id) && !place.sourceIds.includes(id);
        const base = levelOf(st);
        out.push({ id, st, world: w, db: base === null ? null : base + (w ? heardDb(st, place.signal) : 0), n: instancesOf(stmts, id, entities) || 1 });
    }
    return out;
}
function shares(heard) {
    const power = powerOf(heard.map(h => h.db));
    const total = heard.reduce((s, h) => s + h.n * power(h.db), 0);
    return new Map(heard.map(h => [h.id, total ? h.n * power(h.db) / total : 0]));
}
/** The soundscape with the sounds either script has that the other lacks (a variant's additions), world sounds aside. */
function withAdded(place, a, b, world) {
    const inA = new Set(a.map(s => s.sourceId)), inB = new Set(b.map(s => s.sourceId));
    const extra = [...new Set([...a, ...b].map(s => s.sourceId).filter((id) => !!id && !(inA.has(id) && inB.has(id)) && !world.has(id) && !place.sourceIds.includes(id)))];
    return extra.length ? { ...place, sourceIds: [...place.sourceIds, ...extra] } : place;
}
/**
 * The plans for `count` new variants near a variant, as it sounds in `heardAs`. Re-pick candidates
 * are the soundscape's own sounds playing there, unlocked, with one recording (a take bank keeps its
 * own). For each new variant, in turn:
 *   1. its own steady sounds, loudest first, sounds no earlier new variant re-picked first, at most
 *      `REPICKS_PER_VARIANT`, skipping one that would take it past the band's top, until it reaches
 *      the band's bottom;
 *   2. short of it, how loud the outside comes in (every unlocked world-layer steady sound on the
 *      soundscape's signal, louder in the first new variant, quieter in the second, at least
 *      `LEAST_OUTSIDE_DB`), when the soundscape has a signal;
 *   3. still short, the one loud own steady sound that reaches it, alone (an audible change beats
 *      an inaudible one);
 *   4. one event, as an accent, loudest first among those no earlier new variant re-picked.
 * A sound never gets a recording in `had(id, clip)`.
 */
export async function varyNear(opts) {
    const { soundscape, place, heardAs, library, count } = opts;
    const world = opts.world ?? new Set(), held = opts.held ?? new Set();
    const plans = Array.from({ length: count }, () => ({ picks: [], moves: [] }));
    if (count < 1)
        return plans;
    let stmts = [];
    try {
        stmts = parse(heardAs);
    }
    catch {
        return plans;
    }
    const heard = steadyHeard(stmts, place, world);
    const share = shares(heard);
    const w = (id) => share.get(id) ?? 0;
    const seen = new Set();
    const own = stmts.filter(st => {
        const id = st.sourceId;
        if (!id || seen.has(id) || !place.sourceIds.includes(id) || world.has(id) || held.has(id) || st.mute || !(st.clip || st.genPrompt) || st.recordings?.takes?.length)
            return false;
        seen.add(id);
        return true;
    });
    const loud = (a, b) => (b.spl.isNull ? -Infinity : b.spl.max) - (a.spl.isNull ? -Infinity : a.spl.max);
    const steady = own.filter(isSteady).sort((a, b) => w(b.sourceId) - w(a.sourceId) || loud(a, b)).slice(0, REPICKS_PER_VARIANT * count);
    const events = own.filter(st => !isSteady(st)).sort(loud).slice(0, EVENT_ACCENTS * count);
    const offer = async (st) => {
        const playsNow = st.clip || st.genPrompt;
        const shown = [...new Set([playsNow, ...(opts.had?.(st.sourceId, playsNow) ?? [])])];
        try {
            const takes = await library.near({ soundscape, sourceId: st.sourceId, clip: playsNow, loop: st.kind === 'loop', shown, limit: count });
            return { id: st.sourceId, takes: takes.filter(t => t.clip && !shown.includes(t.clip)) };
        }
        catch {
            return { id: st.sourceId, takes: [] };
        }
    };
    const [steadyOffers, eventOffers] = await Promise.all([Promise.all(steady.map(offer)), Promise.all(events.map(offer))]);
    const used = new Map();
    const takeOf = (o) => o.takes[used.get(o.id) ?? 0];
    const fresh = (o) => (used.has(o.id) ? 1 : 0);
    const take = (o, accent = false) => { const r = { id: o.id, take: takeOf(o), ...(accent ? { accent } : {}) }; used.set(o.id, (used.get(o.id) ?? 0) + 1); return r; };
    const { min, max } = VARIETY_BAND;
    for (let k = 0; k < count; k++) {
        const plan = plans[k];
        // 1. own steady sounds toward the band
        const avail = steadyOffers.filter(o => o.takes.length && takeOf(o));
        const order = [...avail].sort((a, b) => fresh(a) - fresh(b) || w(b.id) - w(a.id));
        let chosen = [], got = 0;
        for (const o of order) {
            if (chosen.length >= REPICKS_PER_VARIANT || got >= min)
                break;
            if (got + w(o.id) > max)
                continue;
            chosen.push(o);
            got += w(o.id);
        }
        // (how much of the outside comes in is physics, not a variant: Huanxing, 2026-11-12)
        // 3. still short: the one loud own steady sound that reaches the band, alone
        if (got < min) {
            const single = avail.filter(o => w(o.id) >= min).sort((a, b) => fresh(a) - fresh(b) || w(a.id) - w(b.id))[0];
            if (single)
                chosen = [single];
        }
        plan.picks = chosen.map(o => take(o));
        // 4. an event as an accent
        const accents = eventOffers.filter(o => o.takes.length && takeOf(o)).sort((a, b) => fresh(a) - fresh(b)).slice(0, EVENT_ACCENTS);
        for (const o of accents)
            plan.picks.push(take(o, true));
    }
    return plans;
}
/** A new variant's moves: the one it came from, with this plan's re-picks and outside levels in place of its own. */
export function movesWithPlan(like, plan) {
    const repicked = new Set(plan.picks.map(p => p.id));
    const worldKey = (m) => (m.op === 'world' ? `${m.sound}|${m.signal}` : null);
    const replaced = new Set(plan.moves.map(worldKey).filter((x) => !!x));
    return [
        ...like.filter(m => !((m.op === 'take' || m.op === 'swap') && repicked.has(m.sound)) && !replaced.has(worldKey(m) ?? '')),
        ...plan.moves,
        ...plan.picks.map(p => ({ op: 'take', sound: p.id, clip: p.take.clip })),
    ];
}
/**
 * A planned variant changing less than this share of the steady sound, and adding no sound, is too
 * timid to offer (Huanxing, 2026-11-12: a shrine variant at 1 to 4 dB passed 10% and was the same
 * place by ear). Unverified.
 */
export const AUDIBLE_STEP = 0.25;
/** Two planned variants closer than this (and with the same moments changed) are one variant. */
export const APART_MIN = 0.05;
/**
 * Variants 2 and 3 (by default) of every soundscape, near its first draft: what the compose step
 * writes beside the script. Library only, so nothing is generated or charged; a soundscape the rule
 * finds nothing for gets fewer. `prepare`, when the library has it, may refuse a take (no audio to
 * fetch), which leaves it out.
 */
export async function presetVariants(script, soundscapes, library, opts = {}) {
    const count = opts.count ?? 2;
    const world = new Set(soundscapes.world ?? []);
    const out = { version: 'satie.soundscapes/1', versions: [], takes: {} };
    const notes = [];
    for (const place of soundscapes.places) {
        if (count < 1)
            continue;
        // with a planner, only planned variants: fewer rather than mechanical ones (Huanxing, 2026-11-12)
        if (opts.planner) {
            await planned(script, place, world, library, count, opts.planner, out, notes);
            continue;
        }
        const plans = await varyNear({ soundscape: place.id, place, heardAs: script, world, library, count });
        let n = 1;
        for (const plan of plans) {
            const picks = [];
            for (const p of plan.picks)
                if (!library.prepare || await library.prepare(p.take).catch(() => false))
                    picks.push(p);
            if (!picks.length && !plan.moves.length)
                continue;
            n++;
            out.versions.push({ id: `${place.id}/v${n}`, place: place.id, parent: `${place.id}/v1`, round: 1, label: 'Other recordings', why: picks.map(p => p.id).join(', '), moves: movesWithPlan([], { picks, moves: plan.moves }) });
            for (const p of picks)
                out.takes[p.take.clip] = p.take;
        }
    }
    if (notes.length)
        out.notes = notes;
    return out;
}
/**
 * The planner's variants for one soundscape, written into `out`: each resolved against the world
 * (`resolvePlan`), applied, and measured; one too timid to hear, or a copy of one already kept, is
 * left out with a note. False when the planner gave nothing usable (the rule makes them instead).
 */
async function planned(script, place, world, library, count, planner, out, notes) {
    let plans = [];
    const inv = inventoryOf(script, place, [...world]);
    // the world's own season is no state the game switches: "the summer cicadas swell" may say so
    const seasons = inv.conditions.filter(c => SEASONS.includes(c));
    try {
        plans = await planner(inv, count);
    }
    catch (e) {
        notes.push(`${place.id}: the planner failed (${e instanceof Error ? e.message : String(e)}); no variants`);
        return false;
    }
    const kept = [];
    const versions = [];
    const takes = {};
    // every planned variant resolves at once; they are then kept in the planner's order
    const resolved = await Promise.all(plans.slice(0, count + 2).map(p => resolvePlan(p, { script, place, world: [...world], library, soundscape: place.id, ...(planner.vet ? { vet: planner.vet } : {}) })));
    for (const [i, p] of plans.slice(0, count + 2).entries()) {
        if (versions.length >= count)
            break;
        const r = resolved[i];
        // a variant is never a state the game already switches (an hour, the weather): Huanxing, 2026-11-12;
        // naming the state its own sounds play in describes them ("More frogs": the evening frogs, run 6)
        const states = newConditions(`${p.label} ${p.line ?? ''}`, [...r.states, ...seasons]);
        if (states.length) {
            notes.push(`${place.id} "${p.label}": names a state the game switches (${states.join(', ')}); left out`);
            continue;
        }
        for (const x of r.raised)
            notes.push(`${place.id} "${p.label}": ${x.change.op}${'id' in x.change && x.change.id ? ` ${x.change.id}` : ''} ${x.why}`);
        for (const x of r.refused)
            notes.push(`${place.id} "${p.label}": ${x.change.op}${'id' in x.change ? ` ${x.change.id}` : ''} left out: ${x.why}`);
        // its idea is the game's when half or more of what it asks is a sound the game drives ("after the train")
        const gameOwned = r.refused.filter(x => /^the game (drives|switches|decides)/.test(x.why)).length;
        if (gameOwned && gameOwned * 2 >= p.changes.length) {
            notes.push(`${place.id} "${p.label}": its idea is the game's (${gameOwned} of ${p.changes.length} changes are sounds the game drives); left out`);
            continue;
        }
        // what is left of it no longer says what its name and line say ("Busier shrine", run 6: its life left out, the cedars quieter)
        if (r.refused.length * 2 >= p.changes.length) {
            notes.push(`${place.id} "${p.label}": ${r.refused.length} of ${p.changes.length} changes left out, so what is left is not what it says; left out`);
            continue;
        }
        if (!r.moves.length) {
            notes.push(`${place.id} "${p.label}": nothing in it could be written`);
            continue;
        }
        const applied = applyMoves(script, r.moves);
        const moves = r.moves.filter(m => !applied.dropped.includes(m));
        const d = variantDistance(script, applied.script, place, [...world]);
        const adds = moves.some(m => m.op === 'add');
        if (d.share < AUDIBLE_STEP && !adds) {
            notes.push(`${place.id} "${p.label}": too small to hear (${Math.round(d.share * 100)}%)`);
            continue;
        }
        const events = d.events.slice().sort().join(',');
        if (kept.some(k => k.events === events && variantDistance(k.script, applied.script, place, [...world]).share < APART_MIN)) {
            notes.push(`${place.id} "${p.label}": the same as another`);
            continue;
        }
        // its name and line are checked against what it does, said again for what is left when some was
        // refused (run 7, "Birdier valley"), and kept to its own sounds (run 8: "and cicadas", the world's)
        let label = p.label, line = p.line ?? '';
        if (planner.reword) {
            const refused = r.refused.map(x => x.change);
            let w = null;
            try {
                w = await planner.reword({ label, line, left: p.changes.filter(c => !refused.includes(c)), refused,
                    sounds: inv.sounds.map(x => ({ id: x.id, is: x.is })), untouched: inv.outside.map(o => o.is) });
            }
            catch {
                w = null;
            }
            if (w && w.label.trim() && (w.label !== label || w.line !== line)) {
                const named = newConditions(`${w.label} ${w.line}`, [...r.states, ...seasons]);
                if (named.length) {
                    notes.push(`${place.id} "${p.label}": named again for what is left, it names a state the game switches (${named.join(', ')}); left out`);
                    continue;
                }
                notes.push(`${place.id} "${p.label}": named "${w.label}" for what is left (${w.line})`);
                label = w.label;
                line = w.line;
            }
        }
        kept.push({ script: applied.script, events });
        const n = versions.length + 2;
        versions.push({ id: `${place.id}/v${n}`, place: place.id, parent: `${place.id}/v1`, round: 1, label: label.trim().slice(0, 60), why: line.trim().slice(0, 140), moves });
        for (const m of moves)
            if ((m.op === 'take' || m.op === 'add') && r.takes[m.clip])
                takes[m.clip] = r.takes[m.clip];
    }
    if (!versions.length)
        return false;
    out.versions.push(...versions);
    Object.assign(out.takes, takes);
    return true;
}
/**
 * How much of what plays all the time in `place` differs between two scripts, weighted by
 * loudness: its own steady sounds and, with `world`, the world layer as heard there (`heard_in` on
 * the soundscape's signal). A new recording or a sound gone counts in full; a level change in
 * proportion up to `FULL_CHANGE_DB`. A sound without a stated level weighs as the average of the
 * others. Events are listed, not weighed: they are rare, however loud. Pure.
 */
export function variantDistance(a, b, soundscape, world = []) {
    let sa = [], sb = [];
    try {
        sa = parse(a);
        sb = parse(b);
    }
    catch {
        return { share: 0, sounds: [], events: [] };
    }
    let ea = [], eb = [];
    try {
        ea = parseScene(a).entities;
        eb = parseScene(b).entities;
    }
    catch { /* parse read them: no groups */ }
    const ws = new Set(world);
    const place = withAdded(soundscape, sa, sb, ws);
    const ha = steadyHeard(sa, place, ws, ea), hb = steadyHeard(sb, place, ws, eb);
    const power = powerOf([...ha, ...hb].map(h => h.db));
    const fallbackDb = 10 * Math.log10(power(null));
    const recording = (st) => `${st.genPrompt ?? st.clip}|${(st.recordings?.takes ?? []).map(t => (typeof t === 'string' ? t : JSON.stringify(t))).join(',')}`;
    let total = 0, changed = 0;
    const sounds = [];
    for (const id of [...new Set([...ha, ...hb].map(h => h.id))]) {
        const x = ha.find(h => h.id === id), y = hb.find(h => h.id === id);
        const wgt = Math.max(x ? power(x.db) : 0, y ? power(y.db) : 0);
        total += wgt * Math.max(x?.n ?? 0, y?.n ?? 0);
        const part = !x || !y ? 1
            : recording(x.st) !== recording(y.st) ? 1
                : Math.min(1, Math.abs((x.db ?? fallbackDb) - (y.db ?? fallbackDb)) / FULL_CHANGE_DB);
        // more or fewer instances: the difference in power, as a share of the larger
        const nPart = x && y && x.n !== y.n ? Math.abs(x.n - y.n) / Math.max(x.n, y.n) : 0;
        const p = Math.max(part, nPart);
        if (p > 0) {
            changed += wgt * Math.max(x?.n ?? 0, y?.n ?? 0) * p;
            sounds.push(id);
        }
    }
    const events = place.sourceIds.filter(id => {
        const x = voice(sa, id), y = voice(sb, id);
        if ((x && isSteady(x)) || (y && isSteady(y)))
            return false;
        const onA = !!x && !x.mute, onB = !!y && !y.mute;
        const group = (es, st) => es.find(e => e.id === st.entityId);
        const timing = (st, es) => { const g = group(es, st); return st.every.isNull ? (g?.hostMotion === 'pass' ? `${g.every.min}/${g.every.max}` : '') : `${st.every.min}/${st.every.max}`; };
        return onA !== onB || (onA && onB && (recording(x) !== recording(y) || instancesOf(sa, id, ea) !== instancesOf(sb, id, eb) || timing(x, ea) !== timing(y, eb) || Math.abs((levelOf(x) ?? 0) - (levelOf(y) ?? 0)) >= LEAST_OUTSIDE_DB));
    });
    return { share: total ? changed / total : 0, sounds, events };
}
//# sourceMappingURL=variety.js.map