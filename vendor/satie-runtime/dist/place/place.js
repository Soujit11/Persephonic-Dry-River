/**
 * Places and their versions (spec 012), pure: no DOM, no audio, no engine instance.
 *
 * A place is a part of a world where the listener hears one situation; a version is one complete
 * way it can sound, written as moves against the committed script so edits elsewhere survive.
 * The Workshop keeps a checked JavaScript copy of the version rules; keep this module surface-free.
 */
import { parse, parseScene, formatHeardIn } from '../core/SatieParser.js';
import { voiceLocatorFor, upsertVoiceProperty, removeVoiceProperty, setVoiceSource, upsertRoomField, duplicateVoiceBlock, deleteVoiceBlock, appendVoiceBlock } from '../edit/scriptEdit.js';
/** Instances one voice may have in a variant. */
export const MAX_INSTANCES = 8;
/** Bodies a group Satie spawns (a population `entity`) may have in a variant: three crows become a flock. */
export const MAX_GROUP = 24;
/** How many of a sound play at once: its `N *` instances, or the size of the population it belongs to. */
export function instancesOf(stmts, sourceId, entities) {
    const own = stmts.filter(s => s.sourceId === sourceId);
    const def = own[0]?.entityId ? entities.find(e => e.id === own[0].entityId) : undefined;
    if (def)
        return def.hostMotion === 'pass' ? 1 : def.count;
    return own.reduce((t, s) => t + (s.count || 1), 0);
}
const entityOf = (script, st) => {
    if (!st.entityId)
        return null;
    try {
        return parseScene(script).entities.find(e => e.id === st.entityId) ?? null;
    }
    catch {
        return null;
    }
};
/**
 * Write one of an `entity` block's own lines (`count`, `every`): replaced where it is, else put
 * right under the `entity` line at its lines' indent. Member statements and their properties stay.
 */
function setEntityLine(script, id, key, value) {
    const lines = script.split('\n');
    const indent = (l) => l.length - l.trimStart().length;
    const head = lines.findIndex(l => new RegExp(`^\\s*entity\\s+${id}(\\s|$)`, 'i').test(l));
    if (head < 0)
        return null;
    let own = -1;
    for (let i = head + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t)
            continue;
        if (t === 'endentity' || indent(lines[i]) <= indent(lines[head]))
            break;
        if (own < 0)
            own = indent(lines[i]);
        if (indent(lines[i]) === own && new RegExp(`^${key}(\\s|$)`).test(t)) {
            lines[i] = `${lines[i].slice(0, own)}${key} ${value}`;
            return lines.join('\n');
        }
    }
    const pad = own < 0 ? `${lines[head].slice(0, indent(lines[head]))}    ` : ' '.repeat(own);
    lines.splice(head + 1, 0, `${pad}${key} ${value}`);
    return lines.join('\n');
}
const fmt = (n) => String(Math.round(n * 100) / 100);
const rangeText = (min, max) => (Math.abs(max - min) < 1e-9 ? fmt(min) : `${fmt(min)}to${fmt(max)}`);
/**
 * A voice's `spl` value moved by `db`, or null when it has none: a range shifts; a level that
 * follows a signal keeps following it and its whole response moves (louder at every wind).
 */
function splShifted(st, db) {
    const f = st.splFollow;
    if (f)
        return `follow ${f.signal} ${rangeText(f.inMin, f.inMax)} ${rangeText(f.outMin + db, f.outMax + db)}${f.curve && f.curve !== 1 ? ` pow ${fmt(f.curve)}` : ''}`;
    return st.spl.isNull ? null : rangeText(st.spl.min + db, st.spl.max + db);
}
/** Apply a version's moves to a script, in order. Version 1 (no moves) is the script itself. */
export function applyMoves(script, moves) {
    let out = script;
    const dropped = [];
    const inverse = [];
    for (const move of moves) {
        const undo = inverseOf(out, move);
        const next = applyMove(out, move);
        if (next === null || undo === null)
            dropped.push(move);
        else {
            out = next;
            if (next !== script || undo)
                inverse.unshift(undo);
        }
    }
    return { script: out, dropped, inverse };
}
/** The move that undoes `move` on `script`, read before it is applied; null when it cannot be undone. */
function inverseOf(script, move) {
    if (move.op === 'room') {
        let rooms = [];
        try {
            rooms = parseScene(script).rooms;
        }
        catch {
            return null;
        }
        const r = rooms.find(x => x.name === move.room);
        if (!r)
            return null;
        return {
            op: 'room', room: move.room,
            ...(move.rt60 !== undefined ? { rt60: r.rt60S ?? null } : {}),
            ...(move.walls !== undefined ? { walls: r.surfaces?.walls ?? null } : {}),
        };
    }
    if (move.op === 'add' || move.op === 'insert')
        return voiceOf(script, move.sound) ? null : { op: 'drop', sound: move.sound };
    const found = voiceOf(script, move.sound);
    if (!found)
        return null;
    const st = found.st;
    switch (move.op) {
        case 'drop': {
            const lines = script.split('\n');
            const end = blockEndOf(lines, st.sourceLine);
            const before = found.all.filter(x => x.sourceId && x.sourceId !== move.sound && x.sourceLine < st.sourceLine && x.entityId === null).sort((a, b) => b.sourceLine - a.sourceLine)[0];
            return { op: 'insert', sound: move.sound, block: lines.slice(st.sourceLine, end + 1).join('\n'), ...(before?.sourceId ? { after: before.sourceId } : {}) };
        }
        case 'count': return { op: 'count', sound: move.sound, n: countOf(script, st) };
        case 'pitch': {
            if (st.pitchFollow)
                return null;
            const p = st.pitch;
            return { op: 'pitch', sound: move.sound, range: p.isNull || (p.min === 1 && p.max === 1) ? null : [p.min, p.max] };
        }
        case 'level': return { op: 'level', sound: move.sound, db: -move.db };
        case 'world': {
            const k = heardKey(move.signal);
            const was = st.heardIn?.find(e => e.signal === k.signal && e.invert === k.invert)?.db ?? 0;
            return { op: 'world', sound: move.sound, signal: move.signal, db: was };
        }
        case 'silence': return st.mute ? { op: 'silence', sound: move.sound } : { op: 'restore', sound: move.sound };
        case 'restore': return st.mute ? { op: 'silence', sound: move.sound } : { op: 'restore', sound: move.sound };
        case 'density': return move.factor > 0 ? { op: 'density', sound: move.sound, factor: 1 / move.factor } : null;
        case 'take':
        case 'swap': {
            // back to exactly what the head line plays: a clip or a `gen` block's name, else its inline prompt
            const head = headToken(script, st);
            return head ? { op: 'swap', sound: move.sound, clip: head }
                : st.genPrompt ? { op: 'swap', sound: move.sound, genPrompt: st.genPrompt }
                    : { op: 'swap', sound: move.sound, clip: st.clip };
        }
    }
}
/** The sound token the head line plays, exactly as written (a clip name or a `gen` block name). */
function headToken(script, st) {
    const line = script.split('\n')[st.sourceLine] ?? '';
    const m = line.trim().match(/^(?:\d+\s*\*\s*)?(?:loop|oneshot|trigger|on\s+\S+)\s+(?:\d+\s+)?(\S+)/);
    return m && m[1] !== 'gen' ? m[1] : null;
}
function voiceOf(script, sound) {
    let all;
    try {
        all = parse(script);
    }
    catch {
        return null;
    }
    const st = all.find(s => s.sourceId === sound && s.entityId === null) ?? all.find(s => s.sourceId === sound);
    return st ? { st, all } : null;
}
function applyMove(script, move) {
    if (move.op === 'room') {
        let out = script;
        if (move.rt60 !== undefined)
            out = upsertRoomField(out, move.room, 'rt60', move.rt60 === null ? null : fmt(move.rt60));
        if (out !== null && move.walls !== undefined)
            out = upsertRoomField(out, move.room, 'walls', move.walls);
        return out;
    }
    if (move.op === 'add')
        return addVoice(script, move);
    if (move.op === 'insert') {
        if (voiceOf(script, move.sound))
            return null;
        const after = move.after ? voiceOf(script, move.after) : null;
        if (!after)
            return appendVoiceBlock(script, move.block);
        const lines = script.split('\n');
        // a top-level block sits after a blank line, as `drop` found it
        const top = !/^\s/.test(move.block);
        lines.splice(blockEndOf(lines, after.st.sourceLine) + 1, 0, ...(top ? [''] : []), ...move.block.split('\n'));
        return lines.join('\n');
    }
    const found = voiceOf(script, move.sound);
    if (!found)
        return null;
    const loc = voiceLocatorFor(found.st, found.all);
    switch (move.op) {
        case 'drop': return deleteVoiceBlock(script, loc);
        case 'count': {
            if (found.st.entityId) {
                const def = entityOf(script, found.st);
                if (!def || def.hostMotion === 'pass' || !(move.n >= 1 && move.n <= MAX_GROUP))
                    return null;
                return setEntityLine(script, def.id, 'count', String(Math.round(move.n)));
            }
            if (!(move.n >= 1 && move.n <= MAX_INSTANCES))
                return null;
            const lines = script.split('\n');
            const head = lines[found.st.sourceLine];
            const m = head.match(/^(\s*)(?:(\d+)\s*\*\s*)?(.*)$/);
            lines[found.st.sourceLine] = `${m[1]}${Math.round(move.n) > 1 ? `${Math.round(move.n)} * ` : ''}${m[3]}`;
            return lines.join('\n');
        }
        case 'pitch': {
            if (found.st.pitchFollow)
                return null;
            if (!move.range)
                return removeVoiceProperty(script, loc, 'pitch');
            const [a, b] = move.range;
            if (!(a > 0 && b > 0))
                return null;
            return upsertVoiceProperty(script, loc, 'pitch', rangeText(Math.min(a, b), Math.max(a, b)));
        }
        case 'level': {
            const spl = splShifted(found.st, move.db);
            return spl === null ? null : upsertVoiceProperty(script, loc, 'spl', spl);
        }
        case 'silence': return found.st.mute ? script : upsertVoiceProperty(script, loc, 'mute', '');
        case 'restore': return found.st.mute ? removeVoiceProperty(script, loc, 'mute') : script;
        case 'density': {
            const def = found.st.every.isNull ? entityOf(script, found.st) : null;
            if (def?.hostMotion === 'pass') {
                // a route's bodies: more often = shorter gaps between them
                if (!(move.factor > 0))
                    return null;
                return setEntityLine(script, def.id, 'every', rangeText(def.every.min / move.factor, def.every.max / move.factor));
            }
            const every = found.st.every;
            if (every.isNull || !(move.factor > 0))
                return null;
            // more often = shorter gaps: the middle divides by the factor, the spread scales with it
            return upsertVoiceProperty(script, loc, 'every', rangeText(every.min / move.factor, every.max / move.factor));
        }
        case 'world': {
            const k = heardKey(move.signal);
            const list = (found.st.heardIn ?? []).filter(e => !(e.signal === k.signal && e.invert === k.invert));
            if (move.db !== 0)
                list.push({ ...k, db: move.db });
            return list.length ? upsertVoiceProperty(script, loc, 'heard_in', formatHeardIn(list)) : removeVoiceProperty(script, loc, 'heard_in');
        }
        case 'take': return setVoiceSource(script, loc, { clip: move.clip });
        case 'swap': return move.genPrompt ? setVoiceSource(script, loc, { genPrompt: move.genPrompt })
            : move.clip ? setVoiceSource(script, loc, { clip: move.clip }) : null;
    }
}
/** The last line of the block whose head is `head` (the head line and its deeper-indented lines). */
function blockEndOf(lines, head) {
    const indent = (l) => l.length - l.trimStart().length;
    let end = head;
    for (let i = head + 1; i < lines.length; i++) {
        if (!lines[i].trim() || indent(lines[i]) <= indent(lines[head]))
            break;
        end = i;
    }
    return end;
}
/** The `N *` count a voice's head line carries (1 without one), or the size of its group. */
function countOf(script, st) {
    return entityOf(script, st)?.count ?? (st.count || 1);
}
/** Write an `add`: copy `like`, give it its own id and recording, then its object, level and timing. */
function addVoice(script, move) {
    if (voiceOf(script, move.sound) || !move.clip.trim() || /\s/.test(move.clip.trim()))
        return null;
    const like = voiceOf(script, move.like);
    if (!like || like.st.entityId)
        return null;
    let out = duplicateVoiceBlock(script, voiceLocatorFor(like.st, like.all), { sourceId: move.sound, ...(move.at ? { at: move.at } : {}) });
    const loc = () => { const v = out ? voiceOf(out, move.sound) : null; return v ? voiceLocatorFor(v.st, v.all) : null; };
    for (const key of ['variants', 'gen_key']) {
        const l = loc();
        if (out && l)
            out = removeVoiceProperty(out, l, key);
    }
    {
        const l = loc();
        out = out && l ? setVoiceSource(out, l, { clip: move.clip.trim() }) : null;
    }
    if (out && move.db) {
        const spl = splShifted(like.st, move.db), l = loc();
        if (spl !== null && l)
            out = upsertVoiceProperty(out, l, 'spl', spl);
    }
    if (out && move.every) {
        const [a, b] = move.every, l = loc();
        if (a > 0 && b >= a && l)
            out = upsertVoiceProperty(out, l, 'every', rangeText(a, b));
    }
    return out && voiceOf(out, move.sound) ? out : null;
}
const heardKey = (signal) => ({ signal: signal.replace(/^!/, '').toLowerCase(), invert: signal.startsWith('!') });
/** The place whose own sounds include this one, if any. */
export function placeOfSound(places, sound) {
    return places.find(p => p.sourceIds.includes(sound)) ?? null;
}
const titleCase = (id) => id.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
/**
 * The soundscapes a script's `soundscape` blocks declare, each sound given to one of them. With
 * `ownerOf` (the engine's `soundscapeOf`, spec 014) the engine decides; without it, the
 * world-correctness reading (`soundscapesOf`): a listed `source_id` first, then an object it plays
 * `at`, then the `in <room>` it sits in. Sounds in a `kind world` block, and beds or fields no
 * soundscape claims, are the world layer. `player` names the player's own sounds, which belong to
 * none. Null when the script declares no soundscape.
 */
export function soundscapesFromBlocks(statements, blocks, player = [], ownerOf) {
    const own = blocks.filter(b => b.kind !== 'world');
    if (!own.length)
        return null;
    const worldBlocks = blocks.filter(b => b.kind === 'world');
    const worldIds = new Set(worldBlocks.flatMap(b => b.sounds));
    const worldObjects = new Set(worldBlocks.flatMap(b => b.objects));
    const players = new Set(player);
    const owner = new Map();
    const ownIds = new Set(own.map(b => b.id));
    if (ownerOf) {
        for (const st of statements) {
            const id = st.sourceId, sc = st && ownerOf(st);
            if (id && sc && ownIds.has(sc) && !owner.has(id) && !players.has(id))
                owner.set(id, sc);
        }
    }
    else
        for (const b of own)
            for (const id of b.sounds)
                if (!owner.has(id) && !worldIds.has(id))
                    owner.set(id, b.id);
    const free = (st) => !!st.sourceId && !owner.has(st.sourceId) && !players.has(st.sourceId) && !worldIds.has(st.sourceId) && !(st.hostRef && worldObjects.has(st.hostRef));
    if (!ownerOf) {
        for (const b of own)
            for (const st of statements)
                if (free(st) && st.hostRef && b.objects.includes(st.hostRef))
                    owner.set(st.sourceId, b.id);
        for (const b of own)
            for (const st of statements)
                if (free(st) && st.roomName && b.rooms.includes(st.roomName.toLowerCase()))
                    owner.set(st.sourceId, b.id);
    }
    const world = [...new Set(statements.filter(st => st.sourceId && !owner.has(st.sourceId) && !players.has(st.sourceId)
            && (worldIds.has(st.sourceId) || (st.hostRef && worldObjects.has(st.hostRef)) || st.bed || st.field)).map(st => st.sourceId))];
    const places = own.map(b => {
        const members = statements.filter(st => st.sourceId && owner.get(st.sourceId) === b.id);
        const kind = b.kind && b.kind !== 'world' ? b.kind : b.follows ? 'moving' : b.rooms.length ? 'enclosed' : 'open';
        return {
            id: b.id, label: b.label ?? titleCase(b.id),
            sourceIds: [...new Set(members.map(st => st.sourceId))],
            ...(b.rooms.length ? { rooms: [...b.rooms] } : {}),
            kind, signal: `in_${b.id}`,
            beds: [...new Set(members.filter(st => st.bed || st.field).map(st => st.sourceId))],
            ...(b.objects.length ? { objects: [...b.objects] } : {}),
            ...(b.share ? { share: b.share } : {}),
            ...(b.why ? { why: b.why } : {}),
        };
    });
    return { places, world, player: [...players] };
}
/** The versions of one place, in order: the first draft (no moves) first. */
export function versionsOf(file, place) {
    const vs = file.versions.filter(v => v.place === place);
    const first = { id: `${place}/v1`, place, parent: null, round: 0, why: 'the first draft', moves: [] };
    return vs.some(v => v.moves.length === 0) ? vs : [first, ...vs];
}
/**
 * Read a variants file into the controller's shape: `satie.places/1` or `satie.soundscapes/1`, with
 * or without its own soundscape list (without one, the script's `soundscape` blocks supply it).
 */
export function readSoundscapes(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const o = raw;
    if (o.version !== 'satie.soundscapes/1' && o.version !== 'satie.places/1')
        return null;
    // a variants-only file is fine: the soundscapes then come from the script's own blocks
    const list = (o.version === 'satie.soundscapes/1' ? o.soundscapes : (o.places ?? o.soundscapes)) ?? [];
    if (!Array.isArray(list))
        return null;
    const places = list.filter(p => p && typeof p.id === 'string' && Array.isArray(p.sourceIds))
        .map(p => ({ id: p.id, label: p.label ?? p.id, sourceIds: p.sourceIds, ...(p.rooms ? { rooms: p.rooms } : {}), ...(p.kind ? { kind: p.kind } : {}), ...(p.signal ? { signal: p.signal } : {}), ...(p.beds ? { beds: p.beds } : {}) }));
    return { version: 'satie.places/1', places, versions: Array.isArray(o.versions) ? o.versions : [], ...(Array.isArray(o.world) ? { world: o.world } : {}), ...(Array.isArray(o.player) ? { player: o.player } : {}),
        ...(o.takes && typeof o.takes === 'object' && !Array.isArray(o.takes) ? { takes: o.takes } : {}) };
}
//# sourceMappingURL=place.js.map