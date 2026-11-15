/**
 * The variant mechanism (spec 012; product model 2026-11-11): one controller per world that every
 * surface drives. The place window, the edit panel and the first-run preview all hold the same
 * state through it, and none of them keeps its own copy.
 *
 * Per soundscape it knows:
 *   - which variant is playing, and which is in use (committed by Use);
 *   - how to get the committed script back to the first draft (the inverse of the one in use);
 *   - which sounds are locked: a locked sound keeps what it has whatever variant plays;
 *   - how long each variant was heard, so a Use records what was chosen over what was heard.
 *
 * A switch emits a `VariantSwitch` describing what enters, leaves and changes, timed on the audio
 * clock, so a view can move its stars in step with what is heard. No DOM, no audio of its own:
 * the host plays and commits. Code names stay "place"; people read "soundscape" and "variant".
 */
import { parse } from '../core/SatieParser.js';
import { applyMoves, versionsOf } from './place.js';
export const CROSSFADE_S = 1.5;
/** A listen of at least this long counts as heard (spec 012 §5). */
export const HEARD_MS = 2000;
/** Variants shown at once. */
export const SLOTS = 3;
const stateOf = (stmts, id) => {
    const st = stmts.find(s => s.sourceId === id && s.entityId === null) ?? stmts.find(s => s.sourceId === id);
    if (!st)
        return { present: false, clip: null, takes: [], db: null };
    const takes = st.recordings?.takes?.map(t => (typeof t === 'string' ? t : JSON.stringify(t))) ?? [];
    return { present: !st.mute, clip: st.genPrompt ?? st.clip, takes, db: st.spl.isNull ? null : (st.spl.min + st.spl.max) / 2 };
};
/** How each of `ids` differs between two scripts. Pure. */
export function soundChanges(before, after, ids) {
    let a = [], b = [];
    try {
        a = parse(before);
        b = parse(after);
    }
    catch {
        return [];
    }
    const out = [];
    for (const id of ids) {
        const from = stateOf(a, id), to = stateOf(b, id);
        if (!from.present && to.present)
            out.push({ sourceId: id, kind: 'enter', from, to });
        else if (from.present && !to.present)
            out.push({ sourceId: id, kind: 'leave', from, to });
        else if (from.present && to.present && (from.clip !== to.clip || from.takes.join('|') !== to.takes.join('|')))
            out.push({ sourceId: id, kind: 'retake', from, to });
        else if (from.present && to.present && from.db !== to.db)
            out.push({ sourceId: id, kind: 'level', from, to });
    }
    return out;
}
/** A move's sound, if it has one (a room move has none). */
const soundOf = (m) => ('sound' in m ? m.sound : null);
export function createVariantController(host, source) {
    // the controller's own copy: More like N appends variants to it
    const file = { ...source, versions: [...source.versions] };
    const numbers = new Map();
    const slots = new Map();
    const playing = new Map();
    const inUse = new Map();
    const toDraft = new Map();
    const locks = new Map();
    const heardMs = new Map();
    let listeningTo = null;
    let heardSince = performance.now();
    const switchCbs = new Set();
    const changeCbs = new Set();
    const def = (id) => file.places.find(p => p.id === id);
    const inUseId = (s) => inUse.get(s) ?? `${s}/v1`;
    const playingId = (s) => playing.get(s) ?? inUseId(s);
    const lockSet = (s) => { let l = locks.get(s); if (!l) {
        l = new Set();
        locks.set(s, l);
    } return l; };
    const changed = (s) => { for (const cb of changeCbs)
        cb(s); };
    /** Its variants, numbered in order the first time they are seen: 1 2 3, then 4 5 after them. */
    function all(s) {
        const vs = versionsOf(file, s);
        let next = Math.max(0, ...vs.map(v => numbers.get(v.id) ?? 0)) + 1;
        for (const v of vs)
            if (!numbers.has(v.id))
                numbers.set(v.id, next++);
        return vs.map(v => ({ ...v, n: numbers.get(v.id) }));
    }
    const numberOf = (s, id) => { all(s); return numbers.get(id) ?? 0; };
    function slotsOf(s) {
        let ids = slots.get(s);
        if (!ids) {
            ids = all(s).slice(0, SLOTS).map(v => v.id);
            slots.set(s, ids);
        }
        return ids.map(id => ({ id, n: numberOf(s, id) }));
    }
    /** N chosen over the variants heard for 2 s or more (spec 012 §5; product model: choosing is the signal). */
    function recordChoice(s, id, act, round) {
        const heard = [...heardMs].filter(([k, ms]) => k.startsWith(`${s}/`) && ms >= HEARD_MS);
        const l = host.listener?.();
        host.record('choice', {
            version: 1, level: 'place', act, origin: 'human', round,
            context: { placeId: s, revision: id }, chosen: { versionId: id }, rejected: [],
            passedOver: heard.filter(([k]) => k !== id).map(([versionId]) => ({ versionId })),
            auditioned: heard.map(([versionId, ms]) => ({ versionId, ms: Math.round(ms) })),
            pins: [...lockSet(s)],
            ...(l ? { listener: { position: [l.position.x, l.position.y, l.position.z], forward: [l.forward.x, l.forward.y, l.forward.z] } } : {}),
        });
        for (const k of [...heardMs.keys()])
            if (k.startsWith(`${s}/`))
                heardMs.delete(k);
    }
    function creditListen() {
        const now = performance.now();
        if (listeningTo)
            heardMs.set(listeningTo, (heardMs.get(listeningTo) ?? 0) + (now - heardSince));
        heardSince = now;
    }
    /**
     * One soundscape's step on a script: undo the variant in use, then apply `v`, skipping locked
     * sounds. Soundscapes own disjoint sounds (and their own rooms), so steps compose in any order.
     */
    function stepFor(base, s, v) {
        const committed = base;
        if (v.id === inUseId(s))
            return { script: committed, dropped: 0, inverse: toDraft.get(s) ?? [], heldByLock: [] };
        const held = lockSet(s);
        // the world layer is shared: a variant may set only how loud it is heard here, never which recording plays
        const world = new Set(file.world ?? []);
        const allowed = (m) => { const id = soundOf(m); return !id || !world.has(id) || m.op === 'world'; };
        // a locked sound keeps what it has now: neither the undo of the one in use nor this variant's moves touch it
        const undo = (toDraft.get(s) ?? []).filter(m => !held.has(soundOf(m) ?? ''));
        const moves = v.moves.filter(m => allowed(m) && !held.has(soundOf(m) ?? ''));
        const heldByLock = [...new Set(v.moves.map(soundOf).filter((x) => !!x && held.has(x)))];
        const draft = applyMoves(committed, undo).script;
        const { script, dropped, inverse } = applyMoves(draft, moves);
        // what is still to undo later: this variant's inverse, plus the locked sounds' old undo
        const keptUndo = (toDraft.get(s) ?? []).filter(m => held.has(soundOf(m) ?? ''));
        return { script, dropped: dropped.length, inverse: [...inverse, ...keptUndo], heldByLock };
    }
    /**
     * The world's script with every soundscape on the variant chosen for it: `override` puts one
     * soundscape on another variant. Previews in different soundscapes live together.
     */
    function worldScript(override) {
        let script = host.committed();
        let step = null;
        for (const p of file.places) {
            const v = override && override.s === p.id ? override.v : versionsOf(file, p.id).find(x => x.id === playingId(p.id));
            if (!v || v.id === inUseId(p.id)) {
                if (override?.s === p.id)
                    step = { script, dropped: 0, inverse: toDraft.get(p.id) ?? [], heldByLock: [] };
                continue;
            }
            const r = stepFor(script, p.id, v);
            script = r.script;
            if (override?.s === p.id)
                step = r;
        }
        return { script, step };
    }
    return {
        soundscapes: () => file.places,
        variants: (s) => all(s),
        state: (s) => ({ playing: playingId(s), inUse: inUseId(s), locks: [...lockSet(s)], previewing: playingId(s) !== inUseId(s), slots: slotsOf(s) }),
        switchTo(s, id) {
            const d = def(s), v = versionsOf(file, s).find(x => x.id === id);
            if (!d || !v || id === playingId(s))
                return null;
            creditListen();
            const before = worldScript().script;
            const { script, step } = worldScript({ s, v });
            const { dropped, heldByLock } = step;
            const at = host.audioTime();
            host.play(script, CROSSFADE_S);
            const from = playingId(s);
            if (id === inUseId(s))
                playing.delete(s);
            else
                playing.set(s, id);
            listeningTo = id;
            // the soundscape's sounds, and any a variant on either side adds
            const added = [...versionsOf(file, s).find(x => x.id === from)?.moves ?? [], ...v.moves].flatMap(m => (m.op === 'add' ? [m.sound] : []));
            const e = { soundscape: s, from, to: id, fromN: numberOf(s, from), toN: numberOf(s, id), at, seconds: CROSSFADE_S, changes: soundChanges(before, script, [...new Set([...d.sourceIds, ...added])]), heldByLock, dropped };
            host.record('place_switch', { place: s, version: id, dropped, heldByLock });
            for (const cb of switchCbs)
                cb(e);
            changed(s);
            return e;
        },
        use(s, label) {
            const id = playingId(s), v = versionsOf(file, s).find(x => x.id === id);
            if (!v || id === inUseId(s))
                return false;
            creditListen();
            // commit this soundscape's variant only: other soundscapes' previews stay previews
            const { script, inverse } = stepFor(host.committed(), s, v);
            const n = numberOf(s, id);
            if (!host.use(script, label ?? `${def(s)?.label ?? s}: ${n}`, { place: s, version: id, n }))
                return false;
            inUse.set(s, id);
            toDraft.set(s, inverse);
            playing.delete(s);
            // what plays is the committed script plus any other soundscape's preview
            const after = worldScript().script;
            if (after !== script)
                host.play(after, CROSSFADE_S);
            recordChoice(s, id, 'use', v.round);
            changed(s);
            return true;
        },
        choose(s, id) {
            const e = this.switchTo(s, id);
            if (playingId(s) !== inUseId(s))
                this.use(s);
            return e;
        },
        lock(s, id, on) {
            const l = lockSet(s);
            if (on === l.has(id))
                return;
            if (on)
                l.add(id);
            else
                l.delete(id);
            host.record('place_lock', { place: s, sound: id, on });
            changed(s);
        },
        creditListen,
        onSwitch(cb) { switchCbs.add(cb); return () => switchCbs.delete(cb); },
        onChange(cb) { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    };
}
//# sourceMappingURL=controller.js.map