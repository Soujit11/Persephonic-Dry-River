/**
 * An edit made outside the mixer (a coding agent, an editor) and the developer's own mix
 * (2026-11-11, Part B). The open game takes the file as it is now; this says which of its changes
 * undo something the developer set themselves (by ear in the mixer, or by hand in its script tab),
 * and puts those values back on request, one property at a time, without touching anything else.
 *
 * Pure: the mixer owns the history, the engine and the banner.
 */
import { tryParse } from '../core/SatieParser.js';
import { describeVoiceChanges } from '../edit/voiceChanges.js';
import { upsertVoiceProperty, removeVoiceProperty, voiceLocatorFor } from '../edit/scriptEdit.js';
/** One voice across two parses: its source id, else what it is, plays and sits on. */
export const voiceKey = (v) => v.sourceId ? `id:${v.sourceId}` : `${v.kind}|${v.sound}|${v.host ?? ''}`;
const propKey = (v, prop) => `${voiceKey(v)}#${prop}`;
export function makerOf(kind) {
    if (kind === 'external')
        return 'outside the mixer';
    if (kind.startsWith('chat') || kind === 'describe')
        return 'SATIE';
    if (kind.startsWith('agent'))
        return 'your coding agent';
    return 'you';
}
/** A step that is the developer's own (not the first composition, SATIE, an agent or an outside write). */
const isMine = (kind) => kind !== 'start' && makerOf(kind) === 'you';
/**
 * The developer's own settings among `wanted` property keys, newest step first (the history's spine,
 * head first). A later outside or SATIE step that changed the same property ends the claim: the
 * developer did not set what is there now. `diff` is injectable for tests and for a cache.
 */
export function mySettings(spine, wanted, diff = describeVoiceChanges) {
    const out = new Map();
    const settled = new Set();
    for (const step of spine) {
        if (settled.size === wanted.size)
            break;
        if (step.parentScript === null)
            continue;
        const changes = diff(step.parentScript, step.script)?.changes ?? [];
        for (const c of changes) {
            if (c.change !== 'set' && c.change !== 'unset')
                continue;
            const k = propKey(c.voice, c.prop);
            if (!wanted.has(k) || settled.has(k))
                continue;
            settled.add(k);
            if (isMine(step.kind))
                out.set(k, { value: c.to, at: step.at, label: step.label, kind: step.kind });
        }
    }
    return out;
}
/** The outside edit's changes that touch a property the developer set, with what they had set it to. */
export function clashes(before, after, spine, diff = describeVoiceChanges) {
    const changes = diff(before, after)?.changes ?? [];
    const sets = changes.filter((c) => (c.change === 'set' || c.change === 'unset') && c.origin === 'own'); // a value written on the voice itself, not inherited from a group
    if (!sets.length)
        return { changes, clashes: [] };
    const mine = mySettings(spine, new Set(sets.map(c => propKey(c.voice, c.prop))), diff);
    const out = [];
    for (const c of sets) {
        const m = mine.get(propKey(c.voice, c.prop));
        if (m && m.value !== c.to)
            out.push({ change: c, mine: m });
    }
    return { changes, clashes: out };
}
/**
 * The script with the developer's values put back over the outside edit, one property each, by
 * the same surgery the mixer's faders use. null when a voice can no longer be found or the result
 * would not parse; everything else the outside edit did stays.
 */
export function putMineBack(script, picked) {
    let text = script;
    for (const { change, mine } of picked) {
        const parsed = tryParse(text);
        if (!parsed.success || !parsed.statements)
            return null;
        const sts = parsed.statements;
        const st = sts.find(s => change.voice.sourceId ? s.sourceId === change.voice.sourceId : s.sourceLine === change.voice.line);
        if (!st)
            return null;
        const loc = voiceLocatorFor(st, sts);
        const next = mine.value === null ? removeVoiceProperty(text, loc, change.prop) : upsertVoiceProperty(text, loc, change.prop, mine.value);
        if (next === null || next === undefined)
            return null;
        text = next;
    }
    return tryParse(text).success ? text : null;
}
/** "Kessler buzzer: level 70 → 76" in the mixer's words (`name` turns a voice into its shown name). */
export function clashLine(c, name) {
    const prop = c.change.prop === 'spl' ? 'level' : c.change.prop.replace(/_/g, ' ');
    return `${name(c.change.voice)}: ${prop} ${c.mine.value ?? '(none)'} → ${c.change.to ?? '(none)'}`;
}
//# sourceMappingURL=OutsideEdits.js.map