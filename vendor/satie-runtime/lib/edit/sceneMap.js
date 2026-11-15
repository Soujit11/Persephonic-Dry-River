import { HostRegistry } from '../core/HostRegistry.js';
import { fallbackName } from '../core/voiceNames.js';
/**
 * `# @group <name>: <source_id> …`: a group you made in the mixer, kept in the script as a metadata
 * comment (the parser skips comments, so the language does not change), so it travels with the scene
 * and goes back with undo. One line per group.
 */
export const GROUP_LINE = /^\s*#\s*@group\s+([^:\n]+?)\s*:\s*(.*?)\s*$/;
const groupId = (label) => `g_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'group'}`;
export function readGroupLines(script) {
    const out = [];
    for (const line of script.split('\n')) {
        const m = line.match(GROUP_LINE);
        if (!m)
            continue;
        const label = m[1].trim(), sourceIds = m[2].split(/\s+/).filter(id => /^[a-zA-Z0-9_.-]+$/.test(id));
        if (label && sourceIds.length && !out.some(g => g.label === label))
            out.push({ id: groupId(label), label, sourceIds });
    }
    return out;
}
/** The script with exactly these groups (every old group line goes; the new ones head the script). */
export function writeGroupLines(script, groups) {
    const rest = script.split('\n').filter(l => !GROUP_LINE.test(l));
    while (rest.length && !rest[0].trim())
        rest.shift();
    const lines = groups.filter(g => g.label.trim() && g.sourceIds.length).map(g => `# @group ${g.label.replace(/[:\n]/g, ' ').trim()}: ${g.sourceIds.join(' ')}`);
    return lines.length ? `${lines.join('\n')}\n${rest.length ? '\n' : ''}${rest.join('\n')}` : rest.join('\n');
}
/** `# @name <words>`: a sound's own name, above its block. */
export const NAME_LINE = /^\s*#\s*@name\s+(.+?)\s*$/;
/** The `# @name` given above each statement's block, by statement index. */
export function namesFromScript(script, statements) {
    const lines = script.split('\n'), out = new Map();
    statements.forEach((st, i) => {
        for (let k = st.sourceLine - 1; k >= 0; k--) {
            const t = lines[k] ?? '';
            if (!t.trim())
                break;
            const m = t.match(NAME_LINE);
            if (m) {
                out.set(i, m[1]);
                break;
            }
            if (!/^\s*#/.test(t))
                break;
        }
    });
    return out;
}
/** The id a voice is addressed by: its `source_id`, else its line (as the director has always written it). */
export const voiceId = (st) => st.sourceId ?? `line_${st.sourceLine + 1}`;
/**
 * What a voice plays, as one key: voices with the same key play from the same takes. A recording is
 * its clip; a generated voice is its description (count copies `_1…_N` of one statement share it).
 */
export function audioKey(st) {
    return st.isGenerated && st.genPrompt ? `gen:${st.genPrompt.trim().replace(/\s+/g, ' ').toLowerCase()}` : `clip:${st.clip.replace(/_\d+$/, '')}`;
}
/** Ids that form a class (`cypress_1 … cypress_n`, two or more members), by class name, members in order. */
export function hostClassesOf(ids, exclude = new Set()) {
    const groups = new Map();
    for (const id of ids) {
        if (exclude.has(id))
            continue;
        const cls = HostRegistry.classOf(id);
        if (!cls)
            continue;
        const list = groups.get(cls) ?? [];
        list.push(id);
        groups.set(cls, list);
    }
    for (const [cls, list] of groups) {
        if (list.length < 2)
            groups.delete(cls);
        else
            list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return groups;
}
/**
 * The parts of one thing, by id (2026-11-12): `train_engine`, `train_horn` and `train_bogie_rear` are parts of
 * the train when one host is the train, by id (`train`) or by label (`train_body`, labelled "train"). A
 * part maps to its whole; a whole and a host with no whole are left out. `crossing_bell_north` and
 * `crossing_gate_north` stay two things: nothing is called "crossing".
 */
export function partsOf(hosts) {
    const ids = new Set(hosts.map(h => h.id)), byLabel = new Map();
    for (const h of hosts) {
        const l = h.label?.trim().toLowerCase().replace(/\s+/g, '_');
        if (l && h.id.startsWith(`${l}_`) && !byLabel.has(l))
            byLabel.set(l, h.id);
    }
    const out = new Map();
    for (const h of hosts) {
        const bits = h.id.split('_');
        for (let n = bits.length - 1; n >= 1; n--) {
            const p = bits.slice(0, n).join('_'), whole = ids.has(p) ? p : byLabel.get(p);
            if (whole && whole !== h.id) {
                out.set(h.id, whole);
                break;
            }
        }
    }
    // a whole is never itself a part (a chain resolves to its top)
    for (const [part, whole] of out) {
        let w = whole;
        for (let k = 0; k < 8 && out.has(w); k++)
            w = out.get(w);
        out.set(part, w);
    }
    return out;
}
/** Object-first navigation ignores mix folders: they are collections, not ownership. */
export function objectKeyFor(st, ctx) {
    if (!st.entityId && st.attachRef === 'listener')
        return ctx.listenerHost ? `host:${ctx.listenerHost}` : 'listener';
    // an event on no thing: with a kind of thing (the horn of whichever car you drive), it is that kind's in the
    // class view and, done by the player, theirs one by one (which car is not fixed); with nothing, done by the
    // player (a step), it is theirs
    if (!st.entityId && !st.hostRef && st.eventName) {
        const w = ctx.withOf?.(st.eventName), by = ctx.byOf?.(st.eventName), mine = !!ctx.listenerHost && by === ctx.listenerHost;
        if (w && ctx.families.has(w))
            return `family:${w}`;
        if (w && ctx.kinds?.has(w))
            return mine ? `host:${ctx.listenerHost}` : 'scene';
        if (!w && mine)
            return `host:${ctx.listenerHost}`;
    }
    const key = groupKeyFor({ ...st, sourceId: null }, { ...ctx, groups: [] });
    if (!key.startsWith('host:') || key === `host:${ctx.listenerHost}`)
        return key;
    const host = ctx.wholeOf?.(key.slice(5)) ?? key.slice(5);
    if (host !== key.slice(5))
        return `host:${host}`;
    for (const [family, members] of ctx.families) {
        if (host === family || members.includes(host))
            return `family:${family}`;
    }
    return key;
}
/** A family selection highlights objects; only selecting within one object exposes its sounds. */
export function revealObjectSounds(members, selected, editing) {
    return editing.some(i => members.includes(i)) || (selected.length > 0 && selected.every(i => members.includes(i)));
}
export function fullObjectLabel(members, selected, editing, hovered, nearby) {
    return hovered || nearby || revealObjectSounds(members, selected, editing);
}
/**
 * Which group a voice sits in, in this order: a group made in the mixer, its entity, the thing an
 * interaction happens with ("drink · by you" under the vending machine), the thing it is on, the scene.
 */
export function groupKeyFor(st, ctx) {
    const custom = st.sourceId ? ctx.groups.find(g => g.sourceIds.includes(st.sourceId)) : undefined;
    if (custom)
        return `mix:${custom.id}`;
    if (st.entityId)
        return `entity:${st.entityId}`;
    const withHost = st.eventName && st.hostRef && st.hostRef === ctx.listenerHost ? ctx.withOf?.(st.eventName) : undefined;
    if (withHost)
        return `host:${withHost}`;
    return st.hostRef ? `host:${st.hostRef}` : 'scene';
}
/** Build the map. Pure: same input, same map. */
export function buildSceneMap(input) {
    const objects = (input.objects ?? []).map(o => ({ id: o.id, label: o.label ?? o.id.replace(/_/g, ' '), moves: !!o.moves, line: !!o.line }));
    const objectIds = new Set(objects.map(o => o.id));
    const classes = [...hostClassesOf(objects.map(o => o.id), input.listenerHost ? new Set([input.listenerHost]) : undefined)].map(([id, members]) => ({ id, members }));
    const classOfMember = new Map(classes.flatMap(c => c.members.map(m => [m, c.id])));
    const outObjects = objects.map(o => ({ ...o, ...(classOfMember.has(o.id) ? { class: classOfMember.get(o.id) } : {}) }));
    const lineIds = new Set(objects.filter(o => o.line).map(o => o.id));
    const label = (id) => objects.find(o => o.id === id)?.label ?? id.replace(/_/g, ' ');
    const ctx = { groups: input.groups ?? [], listenerHost: input.listenerHost, withOf: input.withOf };
    const name = input.nameOf ?? ((st) => fallbackName(st, { hostLabel: label }));
    const byId = new Map();
    input.statements.forEach((st, i) => {
        const id = voiceId(st);
        const seen = byId.get(id);
        if (seen) {
            seen.indices.push(i);
            return;
        } // count copies share one voice entry
        const host = st.hostRef ?? undefined;
        const hostKind = !host ? 'none' : host === input.listenerHost ? 'listener' : lineIds.has(host) || st.hostMotion === 'pass' ? 'strip'
            : objectIds.has(host) ? 'object' : classes.some(c => c.id === host) ? 'class' : 'unknown';
        const withHost = st.eventName && host && host === input.listenerHost ? input.withOf?.(st.eventName) : undefined;
        byId.set(id, {
            id, name: name(st, i), kind: st.kind, indices: [i],
            ...(host ? { host } : {}), hostKind, ...(withHost ? { with: withHost } : {}),
            group: groupKeyFor(st, ctx), ...(st.eventName ? { event: st.eventName } : {}),
            ...(!st.every.isNull ? { every: st.every.toString() } : {}),
            shares: [], audio: audioKey(st),
            ...(input.heardOf?.(st, i) ? { heard: input.heardOf(st, i) } : {}),
            ...(input.liveOf?.(st, i) ? { live: input.liveOf(st, i) } : {}),
        });
    });
    const voices = [...byId.values()];
    const byAudio = new Map();
    for (const v of voices)
        byAudio.set(v.audio, [...(byAudio.get(v.audio) ?? []), v.id]);
    for (const v of voices)
        v.shares = (byAudio.get(v.audio) ?? []).filter(x => x !== v.id);
    const groupLabel = (key) => key.startsWith('mix:') ? ctx.groups.find(g => `mix:${g.id}` === key)?.label ?? key
        : key.startsWith('host:') ? (key.slice(5) === input.listenerHost ? 'you' : label(key.slice(5))) : key.startsWith('entity:') ? key.slice(7).replace(/_/g, ' ') : 'the scene';
    const groups = new Map();
    for (const v of voices) {
        const g = groups.get(v.group) ?? { key: v.group, label: groupLabel(v.group), voices: [] };
        g.voices.push(v.id);
        groups.set(v.group, g);
    }
    return { objects: outObjects, classes, groups: [...groups.values()], voices };
}
/** Voices that sound different from each other: one per shared recording (the first id of each). */
export function distinctAudio(map, ids) {
    const out = new Map();
    for (const id of ids) {
        const v = map.voices.find(x => x.id === id);
        const key = v?.audio ?? `id:${id}`;
        out.set(key, [...(out.get(key) ?? []), id]);
    }
    return [...out.values()];
}
/**
 * What can be said about one thing the person named: is it separate objects (a class), one
 * object, one line source with nothing inside it, or unknown. The check behind a "that needs your
 * coding agent": only a thing with no separate objects can need the game to expose them.
 */
export function thingKind(map, id) {
    const cls = map.classes.find(c => c.id === id);
    if (cls)
        return { kind: 'class', members: cls.members };
    const obj = map.objects.find(o => o.id === id);
    if (obj)
        return obj.line ? { kind: 'line' } : obj.class ? { kind: 'class', members: map.classes.find(c => c.id === obj.class).members } : { kind: 'object' };
    return { kind: 'unknown' };
}
/** The map as the text table a model reads. Bounded: `maxVoices` rows, then a count. */
export function sceneMapText(map, opts = {}) {
    const maxVoices = opts.maxVoices ?? 160, maxObjects = opts.maxObjects ?? 80;
    const out = [];
    if (map.classes.length) {
        out.push('CLASSES (separate objects of one kind; `at <class>` plays from a random member each fire, a loop from the nearest):');
        for (const c of map.classes)
            out.push(`- ${c.id} ×${c.members.length}: ${c.members.slice(0, 4).join(', ')}${c.members.length > 4 ? ', …' : ''}`);
    }
    const loose = map.objects.filter(o => !o.class);
    if (loose.length) {
        out.push('OBJECTS:');
        for (const o of loose.slice(0, maxObjects))
            out.push(`- ${o.id}: "${o.label}"${o.moves ? ', moves' : ''}${o.line ? ', ONE line source (nothing separate inside it)' : ''}`);
        if (loose.length > maxObjects)
            out.push(`- … ${loose.length - maxObjects} more`);
    }
    out.push('SOUNDS (id · name · kind · on · group; "same takes as" = they sound identical):');
    for (const v of map.voices.slice(0, maxVoices)) {
        const on = v.host ? `${v.hostKind === 'listener' ? 'the listener' : v.host}${v.hostKind === 'class' ? ' (a class)' : v.hostKind === 'strip' ? ' (a line)' : ''}${v.with ? `, with ${v.with}` : ''}` : 'no object';
        const parts = [v.id, `"${v.name}"`, `${v.kind}${v.event ? ` on ${v.event}` : ''}${v.every ? ` every ${v.every}` : ''}${v.indices.length > 1 ? ` ×${v.indices.length} copies` : ''}`, on, `group ${v.group}`];
        if (v.shares.length)
            parts.push(`same takes as ${v.shares.slice(0, 6).join(', ')}`);
        if (v.heard)
            parts.push(`heard: ${v.heard.slice(0, 160)}`);
        if (v.live)
            parts.push(v.live);
        out.push(`- ${parts.join(' · ')}`);
    }
    if (map.voices.length > maxVoices)
        out.push(`- … ${map.voices.length - maxVoices} more sounds`);
    return out.join('\n');
}
//# sourceMappingURL=sceneMap.js.map