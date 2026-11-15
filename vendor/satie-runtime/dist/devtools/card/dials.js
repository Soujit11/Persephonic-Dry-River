import { distanceLossDb, DEFAULT_SPL_DB, OCCLUSION_FULL_DB } from '../../spatial/LevelModel.js';
/**
 * Loudness as people read it (2026-11-13, Huanxing: "normalize to 0 to 1, how game audio does it"): 0 is silence,
 * 1 as loud as sound gets (120 dB SPL). A whisper is about 0.25, talking 0.5, very loud 0.75. dB stays inside the
 * engine and the script (`spl`); everything a developer reads says this.
 */
export const LOUD_TOP_DB = 120;
export const loud01 = (db) => Math.max(0, Math.min(1, db / LOUD_TOP_DB));
export const fmtLoud = (db) => loud01(db).toFixed(2);
/** A change in level, on the same scale ("+0.05", "−0.10"). */
export const fmtLoudDelta = (dDb) => `${dDb > 0 ? '+' : dDb < 0 ? '−' : ''}${(Math.abs(dDb) / LOUD_TOP_DB).toFixed(2)}`;
export const HOW_LOUD = {
    id: 'howLoud',
    label: 'Volume',
    hint: "how loud it is where it comes from; that's also how far it carries",
    ends: ['quiet', 'loud'],
    tag: 'loudness · 0 to 1',
};
const num = (n) => String(Math.round(n * 100) / 100);
/** "how loud", from `spl`: a level, a range picked per play, or a level the game sets. */
export function readHowLoud(st) {
    if (st.splFollow) {
        const f = st.splFollow;
        return { kind: 'follows', text: `follows ${f.signal.replace(/_/g, ' ')} (${fmtLoud(f.outMin)} to ${fmtLoud(f.outMax)})`, exact: `spl follow ${f.signal} ${num(f.inMin)}to${num(f.inMax)} ${num(f.outMin)}to${num(f.outMax)}` };
    }
    if (st.spl.isNull)
        return { kind: 'unset', value: DEFAULT_SPL_DB, exact: `spl not set (loudness ${fmtLoud(DEFAULT_SPL_DB)})` };
    if (st.spl.isRange)
        return { kind: 'value', value: (st.spl.min + st.spl.max) / 2, exact: `spl ${num(st.spl.min)}to${num(st.spl.max)}` };
    return { kind: 'value', value: st.spl.min, exact: `spl ${num(st.spl.min)}` };
}
/**
 * The quietest a real place gets (dB SPL): below this even a calm outdoor spot covers a sound.
 * The level model's own floor is the bottom of its 55 dB window (often near 10 dB), which would
 * say a crossing bell carries 5 km; reach is measured to whichever floor is higher.
 */
export const QUIET_PLACE_DB = 30;
/**
 * How far a sound carries: the distance at which its direct path falls to the hearing floor (the
 * level model's window floor where you stand, never under {@link QUIET_PLACE_DB}), under the
 * engine's own distance law. Null when it cannot be said (no floor yet). Capped at 2 km.
 */
export function reachMeters(emissionDb, windowFloorDb, path = {}) {
    if (!Number.isFinite(emissionDb) || !Number.isFinite(windowFloorDb))
        return null;
    const floorDb = Math.max(windowFloorDb, QUIET_PLACE_DB);
    const occ = Math.min(1, Math.max(0, path.occlusion01 ?? 0)) * OCCLUSION_FULL_DB;
    const at = (d) => emissionDb - distanceLossDb(d, !!path.line, path.distanceProfile ?? null) - occ;
    if (at(1) < floorDb)
        return 0;
    let lo = 1, hi = 2000;
    if (at(hi) >= floorDb)
        return hi;
    // the loss only grows with distance: bisect to a metre
    while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (at(mid) >= floorDb)
            lo = mid;
        else
            hi = mid;
    }
    return lo;
}
/** A distance said the way people say it: "about 60 m", "under a metre". */
export function sayDistance(m) {
    if (m < 1)
        return 'under a metre';
    if (m >= 2000)
        return 'more than 2 km';
    if (m >= 1000)
        return `about ${Math.round(m / 100) / 10} km`;
    const r = m < 10 ? Math.round(m) : m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
    return `about ${r} m`;
}
/**
 * The "how loud" readout: what reaches you where you stand, and how far it carries.
 * `receivedDb` / `floorDb` come from the engine's level report; a background sound (all
 * around you) has no reach.
 */
export function howLoudReadout(o, opts = {}) {
    const parts = [];
    if (opts.db !== false && o.receivedDb !== null && Number.isFinite(o.receivedDb))
        parts.push(`loudness ${fmtLoud(o.receivedDb)} where you stand`);
    if (o.around)
        parts.push('all around you, the same everywhere');
    else if (o.emissionDb !== null && o.floorDb !== null) {
        const reach = reachMeters(o.emissionDb, o.floorDb, o.path);
        if (reach !== null)
            parts.push(reach === 0 ? 'too quiet to hear past its own spot' : `heard up to ${sayDistance(reach)}`);
    }
    return parts.join(' · ');
}
/** The emission (dB at 1 m) at which a sound carries exactly `reachM`: the inverse of {@link reachMeters}. */
export function emissionForReach(reachM, windowFloorDb, path = {}) {
    const floorDb = Math.max(windowFloorDb, QUIET_PLACE_DB);
    const occ = Math.min(1, Math.max(0, path.occlusion01 ?? 0)) * OCCLUSION_FULL_DB;
    return floorDb + distanceLossDb(Math.max(1, reachM), !!path.line, path.distanceProfile ?? null) + occ;
}
const round2 = (n) => Math.round(n * 100) / 100;
const placed = (ctx) => ctx.kind === 'place' || ctx.kind === 'moving' || ctx.kind === 'contact';
export const HOW_MUFFLED = {
    id: 'howMuffled', label: 'how muffled', hint: 'as if something stands between you and it',
    ends: ['clear', 'muffled, as through a wall'], tag: 'occlusion', owns: ['occlusion'],
    min: 0, max: 1, step: 0.01,
    appliesTo: (_st, ctx) => placed(ctx),
    read(st) {
        if (st.occlusionFollow) {
            const f = st.occlusionFollow;
            return { kind: 'follows', text: `follows ${f.signal.replace(/_/g, ' ')}`, exact: `occlusion follow ${f.signal} ${num(f.inMin)}to${num(f.inMax)} ${num(f.outMin)}to${num(f.outMax)}` };
        }
        return st.occlusionBase > 0 ? { kind: 'value', value: st.occlusionBase, exact: `occlusion ${num(st.occlusionBase)}` } : { kind: 'unset', value: 0, exact: 'occlusion not set (clear)' };
    },
    write: v => ({ key: 'occlusion', raw: v <= 0.005 ? null : String(round2(v)) }),
    // words, not a dB figure: how much a muffle takes off depends on the sound (it is mostly a high cut)
    say: v => v <= 0.005 ? 'nothing in the way' : v < 0.3 ? 'a little muffled, the highs softened' : v < 0.6 ? 'muffled, the highs cut' : 'muffled, as through a wall',
};
export const HOW_MUCH_ECHO = {
    id: 'howMuchEcho', label: 'how much it echoes', hint: 'the echo of the place around it',
    ends: ['no echo, outdoors', 'long echo, a big hall'], tag: 'reverb', owns: ['reverb'],
    min: 0, max: 1, step: 0.01,
    appliesTo: (_st, ctx) => placed(ctx) && !ctx.room,
    instead: (_st, ctx) => placed(ctx) && ctx.room ? `the echo comes from the ${ctx.room.replace(/_/g, ' ')}` : null,
    read(st) {
        const r = st.reverbParams;
        if (!r)
            return { kind: 'unset', value: 0, exact: 'no echo of its own' };
        const exact = `reverb wet ${rangeText(r.dryWet)} size ${rangeText(r.roomSize)} damping ${rangeText(r.damping)}`;
        if (r.dryWetInterpolation || r.roomSizeInterpolation)
            return { kind: 'moving', text: 'its echo changes over time', exact };
        return { kind: 'value', value: (r.dryWet.min + r.dryWet.max) / 2, exact };
    },
    // wet and size move together: more echo is also a bigger space; damping is kept
    write(v, st) {
        if (v <= 0.005)
            return { key: 'reverb', raw: null };
        const damping = st.reverbParams && !st.reverbParams.damping.isNull ? round2(st.reverbParams.damping.min) : 0.5;
        return { key: 'reverb', raw: `wet ${round2(v)} size ${round2(0.2 + 0.7 * v)} damping ${damping}` };
    },
    say: v => v <= 0.005 ? 'dry: no echo of its own' : v < 0.25 ? 'a little echo, a small room' : v < 0.55 ? 'a clear echo, a hall' : 'a long echo, a big hall',
};
function rangeText(r) { return r.isRange ? `${num(r.min)}to${num(r.max)}` : num(r.min); }
/** How far each play's pitch may stray from the voice's own (±6 %: past that it is a different sound). */
export const PITCH_SPREAD_MAX = 0.06;
/** A pitch centred this close to 1 is "its own pitch" (a deliberate shift keeps its registry row instead). */
const AT_ONE = 0.02;
const pitchCentre = (st) => (st.pitch.isNull ? 1 : (st.pitch.min + st.pitch.max) / 2);
export const HOW_MUCH_VARIES = {
    id: 'howMuchVaries', label: 'how much it varies', hint: 'whether it sounds exactly the same every time it plays',
    ends: ['the same every time', 'a bit different each time'], tag: 'takes · pitch spread', owns: ['pitch'],
    min: 0, max: PITCH_SPREAD_MAX, step: 0.002,
    // a spread wider than the dial shows (pitch .873to1.137) is deliberate: it keeps its own row
    appliesTo: st => !st.pitchFollow && !st.pitchInterpolation && !st.voiceId && Math.abs(pitchCentre(st) - 1) <= AT_ONE
        && (st.pitch.isNull || (st.pitch.max - st.pitch.min) / 2 <= PITCH_SPREAD_MAX + 1e-9),
    read(st) {
        if (st.pitch.isNull)
            return { kind: 'unset', value: 0, exact: 'pitch not set (its own, every time)' };
        const s = (st.pitch.max - st.pitch.min) / 2;
        return { kind: 'value', value: s, exact: st.pitch.isRange ? `pitch ${num(st.pitch.min)}to${num(st.pitch.max)}` : `pitch ${num(st.pitch.min)}` };
    },
    write: s => ({ key: 'pitch', raw: s < 0.002 ? null : `${Math.round((1 - s) * 1000) / 1000}to${Math.round((1 + s) * 1000) / 1000}` }),
    say: s => s < 0.002 ? 'the same pitch every time' : `a slightly different pitch each time (±${Math.round(s * 1000) / 10} %)`,
};
/** The slider dials, in card order (after "how loud"). */
export const SLIDER_DIALS = () => [HOW_MUFFLED, HOW_MUCH_ECHO, HOW_MUCH_VARIES];
/** The timing dials, drawn together with the next minute under them. */
export const TIMING_DIALS = () => [HOW_OFTEN, HOW_REGULAR];
/** The gaps a script may ask for (the registry's clamp starts at 0.1 s; 600 s is ten minutes). */
export const EVERY_MIN_S = 0.2, EVERY_MAX_S = 600;
/** A spread over this would let a gap reach 0. */
export const SPREAD_MAX = 0.9;
export function everyShape(min, max) {
    const m = (min + max) / 2;
    return { middleS: m, spread: m > 0 ? (max - min) / (max + min) : 0 };
}
/** A gap as the script writes it: tenths under 10 s, half seconds under 100 s, whole seconds above. */
const sec = (s) => (s < 10 ? Math.round(s * 10) / 10 : s < 100 ? Math.round(s * 2) / 2 : Math.round(s));
/** A gap as people say it. */
const saySec = (s) => (s < 10 ? Math.round(s * 10) / 10 : Math.round(s));
export function everyText(e) {
    const m = Math.min(EVERY_MAX_S, Math.max(EVERY_MIN_S, e.middleS));
    const s = Math.min(SPREAD_MAX, Math.max(0, e.spread));
    const lo = sec(Math.max(EVERY_MIN_S, m * (1 - s))), hi = sec(Math.min(EVERY_MAX_S, m * (1 + s)));
    return lo === hi ? String(lo) : `${lo}to${hi}`;
}
/** "how often" sits on a log scale: rarely (10 minutes) at the left, all the time (0.5 s) at the right. */
const LOG_RARE = Math.log(EVERY_MAX_S), LOG_OFTEN = Math.log(0.5);
export const oftenToPos = (middleS) => Math.min(1, Math.max(0, (Math.log(Math.min(EVERY_MAX_S, Math.max(0.5, middleS))) - LOG_RARE) / (LOG_OFTEN - LOG_RARE)));
export const posToOften = (pos) => Math.exp(LOG_RARE + Math.min(1, Math.max(0, pos)) * (LOG_OFTEN - LOG_RARE));
const nowAndThen = (st) => st.kind === 'oneshot';
const shapeOf = (st) => st.every.isNull ? null : everyShape(st.every.min, st.every.max);
export const HOW_OFTEN = {
    id: 'howOften', label: 'how often', hint: 'how long it waits, on average, before it plays again',
    ends: ['rarely', 'all the time'], tag: 'every', owns: ['every'],
    min: 0, max: 1, step: 0.005,
    appliesTo: st => nowAndThen(st),
    read(st) {
        const e = shapeOf(st);
        return e ? { kind: 'value', value: oftenToPos(e.middleS), exact: `every ${everyText(e)}` } : { kind: 'unset', value: oftenToPos(16.5), exact: 'every not set' };
    },
    write: (pos, st) => ({ key: 'every', raw: everyText({ middleS: posToOften(pos), spread: shapeOf(st)?.spread ?? 0.5 }) }),
    say: pos => { const m = posToOften(pos); return m >= 120 ? `about every ${Math.round(m / 60)} min` : `about every ${saySec(m)} s`; },
};
export const HOW_REGULAR = {
    id: 'howRegular', label: 'how regular', hint: 'whether it keeps time or comes when you do not expect it',
    ends: ['like clockwork', 'unpredictable'], tag: 'every range', owns: ['every'],
    min: 0, max: SPREAD_MAX, step: 0.01,
    appliesTo: st => nowAndThen(st),
    read(st) {
        const e = shapeOf(st);
        return e ? { kind: 'value', value: e.spread, exact: `every ${everyText(e)}` } : { kind: 'unset', value: 0.5, exact: 'every not set' };
    },
    write: (spread, st) => ({ key: 'every', raw: everyText({ middleS: shapeOf(st)?.middleS ?? 16.5, spread }) }),
    say: s => s < 0.05 ? 'like clockwork' : s < 0.3 ? 'a little uneven' : s < 0.6 ? 'uneven, now sooner, now later' : 'unpredictable',
};
/** "anywhere from 8 to 25 s apart", from a statement's every (the strip's caption). */
export function everyWords(min, max) {
    return Math.abs(max - min) < 0.05 ? `every ${saySec(min)} s, like clockwork` : `anywhere from ${saySec(min)} to ${saySec(max)} s apart`;
}
//# sourceMappingURL=dials.js.map