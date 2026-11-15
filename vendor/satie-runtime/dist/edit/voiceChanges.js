/**
 * What an edit did, per voice, in the DSL's own words: which authored voice
 * changed, which property, from what text to what text. Derived from two
 * parses, so it describes every script change the same way whichever surface
 * made it (a fader, a swap, the script tab, a model's rewrite).
 *
 * This is the typed layer of the edit log (`satie.edits/v3` `changes`): the
 * snapshot says what the scene became, this says what the person did to it.
 */
import { tryParse } from '../core/SatieParser.js';
/** At most this many entries; a larger rewrite is summarized by its counts. */
const MAX_CHANGES = 200;
function heads(script) {
    const parsed = tryParse(script);
    if (!parsed.success || !parsed.statements)
        return null;
    // one statement per authored block: a counted `8 * loop x` expands into copies on one head line
    const seen = new Set();
    return parsed.statements.filter(st => st.sourceLine >= 0 && !seen.has(st.sourceLine) && (seen.add(st.sourceLine), true));
}
const kindOf = (st) => (st.eventName ? `on ${st.eventName}` : st.kind);
const shapeOf = (st) => `${kindOf(st)}|${st.clip}|${st.genPrompt ?? ''}`;
/** Identity across the two parses: the source id, else the voice's shape and which occurrence of it. */
function keyed(sts) {
    const out = new Map();
    const occ = new Map();
    for (const st of sts) {
        if (st.sourceId) {
            out.set(`id:${st.sourceId}`, st);
            continue;
        }
        const shape = shapeOf(st);
        const n = occ.get(shape) ?? 0;
        occ.set(shape, n + 1);
        out.set(`shape:${shape}#${n}`, st);
    }
    return out;
}
function ref(st) {
    return {
        ...(st.sourceId ? { sourceId: st.sourceId } : {}),
        kind: kindOf(st), sound: st.genPrompt ?? st.clip,
        ...(st.hostRef ? { host: st.hostRef } : {}),
        line: st.sourceLine,
    };
}
/** The property's written value: its own line after the key, or the head line for an inline one. */
function valueOf(st, key, lines) {
    const span = st.propertySpans.get(key);
    if (!span || span.line < 0)
        return null;
    const text = (lines[span.line] ?? '').trim();
    if (span.origin === 'inline')
        return text;
    return text.startsWith(key) ? text.slice(key.length).trim() : text;
}
export function describeVoiceChanges(before, after) {
    const a = heads(before), b = heads(after);
    if (!a || !b)
        return null;
    const linesA = before.split('\n'), linesB = after.split('\n');
    const A = keyed(a), B = keyed(b);
    const changes = [];
    for (const [key, st] of A)
        if (!B.has(key))
            changes.push({ change: 'remove', voice: ref(st) });
    for (const [key, st] of B) {
        const was = A.get(key);
        if (!was) {
            changes.push({ change: 'add', voice: ref(st) });
            continue;
        }
        const headA = (linesA[was.sourceLine] ?? '').trim(), headB = (linesB[st.sourceLine] ?? '').trim();
        if (shapeOf(was) !== shapeOf(st) || was.count !== st.count)
            changes.push({ change: 'source', voice: ref(st), from: headA, to: headB });
        const props = new Set([...was.propertySpans.keys(), ...st.propertySpans.keys()]);
        for (const prop of props) {
            const from = valueOf(was, prop, linesA), to = valueOf(st, prop, linesB);
            if (from === to)
                continue;
            const origin = (st.propertySpans.get(prop) ?? was.propertySpans.get(prop)).origin;
            changes.push({ change: to === null ? 'unset' : 'set', voice: ref(to === null ? was : st), prop, from, to, origin });
        }
    }
    const truncated = Math.max(0, changes.length - MAX_CHANGES);
    return { changes: changes.slice(0, MAX_CHANGES), truncated };
}
//# sourceMappingURL=voiceChanges.js.map