/**
 * Surgical text edits on Satie scripts — used by the viewport to write a
 * dragged voice's position back into the script, and by the editor to jump
 * from a 3D voice to its statement line.
 *
 * Targeting is PARSER-BACKED (scene-graph spec §4): the script is re-parsed
 * and the target found among parsed statements, whose `sourceLine` /
 * `propertySpans` anchor every edit to the exact lines the author wrote.
 * The old fuzzy line-shape matching could not locate trigger voices at all,
 * counted occurrences on a different basis than its callers, and silently
 * wrote to the wrong voice on multi-clip lines; matching parsed statements
 * against parsed statements removes the whole class.
 */
import { tryParse, getRegisteredFolder, parseFolderClip, parseWithWarnings } from '../core/SatieParser.js';
import { isCountSourceGroup } from './SourceIdentity.js';
/**
 * The locator for a parsed statement: its shape plus which occurrence of that
 * shape it is among `statements` (the engine's script statements or the UI
 * snapshot — both come from the same parse). `line` rides along for records.
 */
export function voiceLocatorFor(stmt, statements) {
    const shape = { kind: stmt.kind, clip: stmt.clip, genPrompt: stmt.genPrompt };
    let occurrence = 0;
    for (const s of statements) {
        if (s === stmt)
            break;
        if (locatorMatches(s, shape))
            occurrence++;
    }
    return {
        ...shape, occurrence,
        ...(stmt.sourceId ? { sourceId: stmt.sourceId } : {}),
        ...(stmt.sourceLine >= 0 ? { line: stmt.sourceLine } : {}),
    };
}
/** Leading-whitespace length, tabs counted as 4 (mirrors the parser). */
function indentOf(line) {
    let n = 0;
    for (const ch of line) {
        if (ch === ' ')
            n += 1;
        else if (ch === '\t')
            n += 4;
        else
            break;
    }
    return n;
}
function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
/** Does this parsed statement match the locator? Both sides come from the same parser. */
function locatorMatches(st, loc) {
    const k = normalize(loc.kind);
    const onMatch = k.match(/^on (\w+)$/);
    if (onMatch) {
        // A reactive head: the parser stores kind 'trigger' + eventName.
        if (st.kind !== 'trigger' || (st.eventName ?? '').toLowerCase() !== onMatch[1])
            return false;
    }
    else if (st.kind !== k) {
        return false;
    }
    if (loc.genPrompt && st.genPrompt)
        return normalize(st.genPrompt) === normalize(loc.genPrompt);
    return st.clip.toLowerCase() === loc.clip.toLowerCase();
}
/**
 * Parse the script and find the statement the locator names. Occurrence is
 * counted over PARSED statements — the same basis callers use to compute it
 * (scanning engine.scriptStatements), so the two sides can no longer desync.
 * Overflow clamps to the last match as a safety net.
 */
function findTarget(script, loc) {
    const parsed = tryParse(script);
    if (!parsed.success || !parsed.statements)
        return null;
    if (loc.sourceId) {
        const identified = parsed.statements.filter(s => s.sourceId === loc.sourceId);
        return identified.length === 1 || isCountSourceGroup(identified) ? identified[0] : null;
    }
    const matches = parsed.statements.filter(s => locatorMatches(s, loc));
    if (matches.length === 0)
        return null;
    const want = Math.max(0, loc.occurrence ?? 0);
    const st = matches[Math.min(want, matches.length - 1)];
    return st.sourceLine >= 0 ? st : null;
}
/**
 * Find the 0-based line index of the statement declaring this voice.
 * Returns -1 when not found. Trigger voices (`on step`, `when`-converted
 * oneshots) locate like any other — pass `kind: 'trigger'` (what the parsed
 * statement carries) or the written head (`'on step'`); both match.
 */
export function findVoiceLine(script, loc) {
    return findTarget(script, loc)?.sourceLine ?? -1;
}
/** Last line (0-based) of the voice's property block, by the parser's indent rule. */
function blockEnd(lines, headIdx) {
    const headIndent = indentOf(lines[headIdx]);
    let end = headIdx;
    for (let i = headIdx + 1; i < lines.length; i++) {
        if (!lines[i].trim() || indentOf(lines[i]) <= headIndent)
            break;
        end = i;
    }
    return end;
}
/**
 * A multi-clip or folder-glob line mints several statements from one line of
 * text, so a per-voice edit must first SPLIT it: one statement block per
 * clip, each with its own copy of the shared property block. Mirrors the
 * parser's expandMultiClip segmentation exactly. Returns the split script,
 * or null when the line can't be split safely.
 */
function splitSharedLine(script, headIdx) {
    const lines = script.split('\n');
    const head = lines[headIdx];
    const trimmed = head.trimStart();
    const indent = head.substring(0, head.length - trimmed.length);
    const header = trimmed.match(/^((?:\d+\s*\*\s*)?)(loop|oneshot|on\s+\w+)\s+(.+)$/i);
    if (!header)
        return null;
    const countPrefix = header[1];
    const kindWord = header[2];
    let rest = header[3];
    let everyClause = '';
    const everyMatch = rest.match(/\s+every\s+\S+$/i);
    if (everyMatch) {
        everyClause = everyMatch[0];
        rest = rest.substring(0, rest.length - everyMatch[0].length);
    }
    // Expand a registered folder glob to its explicit `and` form first.
    rest = rest.replace(/(^|\s)([a-z0-9_]+)\/\*(?=\s|$)/gi, (whole, lead, slug) => {
        const ref = parseFolderClip(`${slug}/*`);
        const tokens = ref ? getRegisteredFolder(ref.slug) : null;
        if (!tokens || tokens.length === 0)
            return whole;
        return lead + tokens.map(t => `${ref.slug}/${t}`).join(' and ');
    });
    const startsWithGen = rest.toLowerCase().startsWith('gen ');
    const segments = startsWithGen
        ? rest.split(/\s+and\s+(?=gen\s)/i)
        : rest.split(/\s+and\s+/);
    if (segments.length < 2)
        return null;
    const end = blockEnd(lines, headIdx);
    const block = lines.slice(headIdx + 1, end + 1);
    const replacement = [];
    for (const seg of segments) {
        replacement.push(`${indent}${countPrefix}${kindWord} ${seg.trim()}${everyClause}`);
        replacement.push(...block);
    }
    lines.splice(headIdx, end - headIdx + 1, ...replacement);
    return lines.join('\n');
}
/**
 * Resolve a locator to an UNSHARED statement, splitting a multi-clip /
 * folder-glob line first when needed. Returns the (possibly rewritten)
 * script and the target, or null.
 */
function resolveEditable(script, loc) {
    let st = findTarget(script, loc);
    if (!st)
        return null;
    if (st.sourceShared) {
        const split = splitSharedLine(script, st.sourceLine);
        if (split === null)
            return null;
        script = split;
        st = findTarget(script, loc);
        if (!st || st.sourceShared)
            return null;
    }
    return { script, st };
}
/** Format a coordinate for script text: max 2 decimals, no trailing zeros. */
function fmt(v) {
    return String(Math.round(v * 100) / 100);
}
/**
 * Write `<key> <value>` into the voice's property block — replacing an
 * existing `<key>` line (block property or inline `and <key> …`), or
 * inserting a new property line right under the statement. Returns the
 * updated script, or null when the voice's line can't be located.
 */
export function upsertVoiceProperty(script, loc, key, value) {
    const resolved = resolveEditable(script, loc);
    if (!resolved)
        return null;
    const { st } = resolved;
    const lines = resolved.script.split('\n');
    const headIdx = st.sourceLine;
    const voiceIndent = indentOf(lines[headIdx]);
    const propLine = value ? `${key} ${value}` : key;
    const keyLower = key.toLowerCase();
    const span = st.propertySpans.get(keyLower);
    const keyRx = new RegExp(`^${key}(\\s|$)`, 'i');
    // The value lives inside an `and <key> …` clause — edit it in place on the
    // line the span anchors to (usually the head line).
    if (span?.origin === 'inline') {
        const inlineRx = new RegExp(`\\band\\s+${key}\\s+.*?(?=\\s+and\\s+|$)`, 'i');
        const target = lines[span.line];
        if (inlineRx.test(target)) {
            lines[span.line] = target.replace(inlineRx, `and ${propLine}`);
            return lines.join('\n');
        }
        // Span said inline but the clause isn't there (shouldn't happen) — fail
        // rather than guess.
        return null;
    }
    // The voice's own block line — replace at the anchored line, then drop any
    // FURTHER lines for the same key in this block: a voice can carry both
    // `volume 0.35` and `volume follow exposure …`, and an explicit write (the
    // mixer slider) is a manual override of every automation line for that
    // property, not just the first.
    // Own block line: replace the FIRST line for the key and delete every
    // other one — a voice can carry both `volume 0.35` and `volume follow
    // exposure …`, and an explicit write (the mixer slider) is a manual
    // override of every automation line for that property, not just the
    // first. Scanned textually rather than via the span: the span anchors the
    // LAST parse of a duplicated key, and a first-block-line `every` is
    // absorbed by the statement header's own every-clause and gets no span at
    // all.
    let blockIndent = null;
    // The header recurrence is parsed before block properties. Update it as
    // well, otherwise an identity edit can leave two competing schedules.
    const headerEvery = keyLower === 'every' && /\s+every\s+\S+\s*$/i.test(lines[headIdx]);
    if (headerEvery)
        lines[headIdx] = lines[headIdx].replace(/\s+every\s+\S+\s*$/i, ` ${propLine}`);
    let replaced = headerEvery;
    let j = headIdx + 1;
    while (j < lines.length) {
        const line = lines[j];
        if (!line.trim() || indentOf(line) <= voiceIndent)
            break;
        const trimmed = line.trimStart();
        if (blockIndent === null && !trimmed.startsWith('-')) {
            blockIndent = line.slice(0, line.length - trimmed.length);
        }
        if (keyRx.test(trimmed)) {
            if (!replaced) {
                lines[j] = line.slice(0, line.length - trimmed.length) + propLine;
                replaced = true;
                j++;
            }
            else {
                lines.splice(j, 1);
            }
        }
        else {
            j++;
        }
    }
    if (replaced)
        return lines.join('\n');
    // No own line (absent, group-inherited, or entity-inherited) — insert a new
    // property line right under the statement, using the block's existing
    // indentation. A group value stays on the group's line untouched: this
    // voice's new own line overrides it, siblings keep the inherited value.
    void span;
    const indent = blockIndent ?? ' '.repeat(voiceIndent + 4);
    lines.splice(headIdx + 1, 0, indent + propLine);
    return lines.join('\n');
}
/**
 * Write `place <x> <y> <z>` into the voice's property block (viewport drag,
 * mixer position pad). Thin wrapper over upsertVoiceProperty.
 */
export function upsertVoicePlace(script, loc, pos) {
    return upsertVoiceProperty(script, loc, 'place', `${fmt(pos.x)} ${fmt(pos.y)} ${fmt(pos.z)}`);
}
/**
 * Remove a property line (block or inline `and …`) from the voice. Returns
 * the updated script; null when the voice can't be located. A missing
 * property is not an error — the script comes back unchanged.
 */
export function removeVoiceProperty(script, loc, key) {
    const resolved = resolveEditable(script, loc);
    if (!resolved)
        return null;
    const { st } = resolved;
    const lines = resolved.script.split('\n');
    const span = st.propertySpans.get(key.toLowerCase());
    // Only the voice's OWN text can be removed: no span means nothing to
    // delete, and a group/entity-inherited value lives on a line shared with
    // siblings — removing it there would strip them too.
    if (span?.origin === 'inline') {
        const inlineRx = new RegExp(`\\s+and\\s+${key}(?=\\s|$).*?(?=\\s+and\\s+|$)`, 'i');
        if (inlineRx.test(lines[span.line])) {
            lines[span.line] = lines[span.line].replace(inlineRx, '');
        }
        return lines.join('\n');
    }
    if (span?.origin === 'own' && span.line > st.sourceLine) {
        lines.splice(span.line, 1);
        return lines.join('\n');
    }
    return lines.join('\n');
}
/**
 * Flip a voice between `loop` and `oneshot` in place (mixer kind toggle).
 * Returns the updated script, or null when the voice can't be located.
 * Only the HEAD TOKEN is rewritten — a `loop` or `oneshot` appearing inside
 * a gen prompt on the same line is never touched.
 */
export function setVoiceKind(script, loc, kind) {
    const resolved = resolveEditable(script, loc);
    if (!resolved)
        return null;
    const lines = resolved.script.split('\n');
    const idx = resolved.st.sourceLine;
    lines[idx] = lines[idx].replace(/^(\s*(?:\d+\s*\*\s*)?)(loop|oneshot)\b/i, `$1${kind}`);
    return lines.join('\n');
}
/** Rewrite only the playback head, including an existing event head. */
export function setVoiceTrigger(script, loc, to) {
    const head = typeof to === 'string' ? to : /^\w{1,128}$/.test(to.event) ? `on ${to.event.toLowerCase()}` : null;
    if (!head || (typeof to === 'string' && to !== 'loop' && to !== 'oneshot'))
        return null;
    const resolved = resolveEditable(script, loc);
    if (!resolved)
        return null;
    const lines = resolved.script.split('\n');
    const idx = resolved.st.sourceLine;
    if (!/^(\s*(?:\d+\s*\*\s*)?)(loop|oneshot|trigger|on\s+\w+)\b/i.test(lines[idx]))
        return null;
    lines[idx] = lines[idx].replace(/^(\s*(?:\d+\s*\*\s*)?)(loop|oneshot|trigger|on\s+\w+)\b/i, `$1${head}`);
    return lines.join('\n');
}
/** A collision-free authoring identity for a copied sound. */
export function uniqueSourceId(script, base) {
    const used = new Set((tryParse(script).statements ?? []).map(statement => statement.sourceId));
    const stem = base.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'sound';
    if (!used.has(stem))
        return stem;
    for (let n = 2;; n++)
        if (!used.has(`${stem}_${n}`))
            return `${stem}_${n}`;
}
/** Copy the authored block in its existing group; assets and banks stay shared. */
export function duplicateVoiceBlock(script, loc, destination) {
    const to = typeof destination === 'string' ? { sourceId: destination } : destination;
    const sourceId = to.sourceId;
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(sourceId) || tryParse(script).statements?.some(s => s.sourceId === sourceId))
        return null;
    const resolved = resolveEditable(script, loc);
    if (!resolved || resolved.st.entityId)
        return null;
    const lines = resolved.script.split('\n');
    const head = resolved.st.sourceLine, end = blockEnd(lines, head);
    const block = lines.slice(head, end + 1);
    const gap = indentOf(lines[head]) === 0 ? [''] : [];
    const copiedLine = end + 1 + gap.length;
    lines.splice(end + 1, 0, ...gap, ...block);
    const next = lines.join('\n');
    const parsed = tryParse(next).statements;
    const copied = parsed?.find(statement => statement.sourceLine === copiedLine);
    if (!copied || !parsed)
        return null;
    // The copied block temporarily has the original ID. Shape/occurrence targets
    // this one copy until the surgeon installs its independent identity.
    const copiedLocator = { kind: copied.kind, clip: copied.clip, genPrompt: copied.genPrompt };
    const occurrence = parsed.filter(statement => locatorMatches(statement, copiedLocator)).indexOf(copied);
    let out = upsertVoiceProperty(next, { ...copiedLocator, occurrence }, 'source_id', sourceId);
    if (!out)
        return null;
    const target = { ...copiedLocator, sourceId };
    if (to.at) {
        out = removeVoiceProperty(out, target, 'place');
        return out && upsertVoiceProperty(out, target, 'at', to.at);
    }
    if (to.place) {
        out = removeVoiceProperty(out, target, 'at');
        return out && upsertVoiceProperty(out, target, 'place', to.place.map(fmt).join(' '));
    }
    return out;
}
/**
 * Delete a voice's whole statement block (head line + indented properties).
 * A multi-clip / folder-glob line is SPLIT first so exactly one voice dies.
 * Returns the updated script, or null when the voice can't be located.
 */
export function deleteVoiceBlock(script, loc) {
    const resolved = resolveEditable(script, loc);
    if (!resolved)
        return null;
    const lines = resolved.script.split('\n');
    const headIdx = resolved.st.sourceLine;
    const end = blockEnd(lines, headIdx);
    lines.splice(headIdx, end - headIdx + 1);
    // A blank line the block left behind at its position reads fine; collapse a
    // doubled blank so deletes stay tidy.
    if (headIdx > 0 && headIdx < lines.length && !lines[headIdx].trim() && !lines[headIdx - 1].trim()) {
        lines.splice(headIdx, 1);
    }
    return lines.join('\n');
}
/**
 * Replace what a voice PLAYS, in place: a gen voice's prompt (`loop gen <new
 * prompt>`) or a clip voice's clip token — every property line, position, and
 * binding stays. This is the mixer's "change the sound". Returns null when
 * the voice can't be located or its head can't be rewritten safely.
 */
export function setVoiceSource(script, loc, source) {
    const withoutBank = removeVoiceProperty(script, loc, 'recordings');
    if (withoutBank === null)
        return null;
    const resolved = resolveEditable(withoutBank, loc);
    if (!resolved)
        return null;
    const lines = resolved.script.split('\n');
    const idx = resolved.st.sourceLine;
    const synth = source.synth ?? ('genPrompt' in source && resolved.st.synth);
    const removeLines = new Set();
    // The head makes the choice explicit. Remove old own flags so switching back cannot inherit them.
    for (const key of ['synth', ...(synth ? ['music'] : [])]) {
        const span = resolved.st.propertySpans.get(key);
        if (span?.origin === 'group' || span?.origin === 'entity')
            return null;
        if (span?.origin === 'inline')
            lines[span.line] = lines[span.line].replace(new RegExp(`\\s+and\\s+${key}(?=\\s|$).*?(?=\\s+and\\s+|$)`, 'i'), '');
        else if (span?.origin === 'own' && span.line > idx)
            removeLines.add(span.line);
    }
    const next = replaceHeadSound(lines[idx], resolved.st, 'genPrompt' in source ? `${synth ? 'synth' : 'gen'} ${source.genPrompt.trim()}` : source.clip.trim());
    if (next === null)
        return null;
    lines[idx] = next;
    const kept = lines.filter((_, i) => !removeLines.has(i));
    if ('clip' in source && synth)
        kept.splice(idx + 1, 0, `${lines[idx].match(/^\s*/)?.[0] ?? ''}  synth`);
    return kept.join('\n');
}
/**
 * A head line playing `sound` (a clip token or `gen <prompt>`) instead of what it plays now.
 * The text replaced is exactly what the parser read as the sound: `gen <prompt>` for a
 * voice written inline, the token otherwise (a clip, or the name of a `gen <name>` block). Everything
 * around it (count, kind, `every`, inline `and <property>` clauses) stays as written, so no
 * second copy of the grammar decides where the sound ends. Null when that text is not on the line.
 */
export function replaceHeadSound(head, st, sound) {
    const m = head.match(/^(\s*(?:\d+\s*\*\s*)?(?:loop|oneshot|trigger|on\s+\w+)\s+)(.*)$/i);
    if (!m || !sound.trim() || sound.trim() === 'gen')
        return null;
    const rest = m[2];
    let span;
    const g = rest.match(/^(?:gen|synth)\s+/i);
    if (g) {
        // an inline generated voice: the prompt the parser read follows `gen`
        if (!st.genPrompt || !rest.slice(g[0].length).startsWith(st.genPrompt))
            return null;
        span = g[0].length + st.genPrompt.length;
    }
    else {
        // a clip token, or the name of a `gen <name>` block (a generated voice written by name)
        const token = rest.match(/^\S+/);
        if (!token)
            return null;
        span = token[0].length;
    }
    return `${m[1]}${sound.trim()}${rest.slice(span)}`;
}
/**
 * Append a top-level voice block (statement line + indented properties) to a
 * script — used when a sample is dropped into the scene. Handles empty
 * scripts and scripts ending inside a group (a blank line ends the group's
 * block, so the appended voice is always top-level).
 */
export function appendVoiceBlock(script, block) {
    const base = script.trimEnd();
    return base ? `${base}\n\n${block.trimEnd()}\n` : `${block.trimEnd()}\n`;
}
// ── Path blocks (scene-graph spec §6 — the drawn route stays editable) ──
/** 0-based header line of `path <name>`, or -1. */
export function findPathLine(script, pathName) {
    const rx = new RegExp(`^\\s*path\\s+${pathName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    const lines = script.split('\n');
    for (let i = 0; i < lines.length; i++)
        if (rx.test(lines[i]))
            return i;
    return -1;
}
/** The 0-based line indices of a path's `waypoint` lines, in order. */
function pathWaypointLines(lines, headerIdx) {
    const headerIndent = indentOf(lines[headerIdx]);
    const out = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim())
            continue; // scene blocks span blank lines
        if (indentOf(line) <= headerIndent)
            break;
        if (/^waypoint(\s|$)/i.test(line.trimStart()))
            out.push(i);
    }
    return out;
}
/**
 * Move one waypoint of a `path <name>` block — the viewport's handle drag.
 * Rewrites `waypoint x y z [t]` in place, preserving a trailing time pin.
 * Returns null when the path or the waypoint doesn't exist.
 */
export function upsertPathWaypoint(script, pathName, waypointIndex, pos) {
    const headerIdx = findPathLine(script, pathName);
    if (headerIdx < 0)
        return null;
    const lines = script.split('\n');
    const wps = pathWaypointLines(lines, headerIdx);
    const target = wps[waypointIndex];
    if (target === undefined)
        return null;
    const line = lines[target];
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);
    const toks = trimmed.split(/\s+/);
    const t = toks.length > 4 ? ` ${toks[4]}` : '';
    lines[target] = `${indent}waypoint ${fmt(pos.x)} ${fmt(pos.y)} ${fmt(pos.z)}${t}`;
    return lines.join('\n');
}
/**
 * Remove one waypoint (refuses to go below two — a path needs a line).
 * Returns null when the path/waypoint doesn't exist or only two remain.
 */
export function deletePathWaypoint(script, pathName, waypointIndex) {
    const headerIdx = findPathLine(script, pathName);
    if (headerIdx < 0)
        return null;
    const lines = script.split('\n');
    const wps = pathWaypointLines(lines, headerIdx);
    if (wps.length <= 2 || wps[waypointIndex] === undefined)
        return null;
    lines.splice(wps[waypointIndex], 1);
    return lines.join('\n');
}
/**
 * Replace a declared path's waypoints wholesale — a redraw. The block's other
 * lines (`cycle`, `speed`, `loop`, `closed`) survive: the hand tuned those
 * once and a new shape shouldn't reset the pace. Returns null when the path
 * isn't declared.
 */
export function replacePathBlock(script, pathName, waypoints) {
    const headerIdx = findPathLine(script, pathName);
    if (headerIdx < 0)
        return null;
    const lines = script.split('\n');
    const wps = pathWaypointLines(lines, headerIdx);
    const indent = wps.length
        ? lines[wps[0]].slice(0, lines[wps[0]].length - lines[wps[0]].trimStart().length)
        : '  ';
    const fresh = waypoints.map(w => `${indent}waypoint ${fmt(w.x)} ${fmt(w.y)} ${fmt(w.z)}`);
    if (wps.length) {
        // Contiguity is not guaranteed (blank lines, a cycle line between) — remove
        // old waypoint lines back to front, then splice the fresh run where the
        // first one sat.
        const first = wps[0];
        for (let i = wps.length - 1; i >= 0; i--)
            lines.splice(wps[i], 1);
        lines.splice(first, 0, ...fresh);
    }
    else {
        lines.splice(headerIdx + 1, 0, ...fresh);
    }
    return lines.join('\n');
}
/**
 * The one write behind BOTH path gestures (stroke draw and waypoint drop):
 * a voice that already follows a declared path gets that path REDRAWN in
 * place (name and pace kept — no sibling blocks minted); a voice without one
 * gets a fresh block appended under the supplied unique legal name, and its
 * `move` pointed at it. Pure — the caller supplies the CURRENT script, the
 * voice's current path name (null when it has none), and the block builder
 * (pathDraw's buildPathBlock; injected to keep this module parser-side only).
 */
export function writeVoicePath(script, loc, currentPathName, freshName, waypoints, buildBlock) {
    if (currentPathName && findPathLine(script, currentPathName) >= 0) {
        const replacedScript = replacePathBlock(script, currentPathName, waypoints);
        if (!replacedScript)
            return null;
        const next = upsertVoiceProperty(replacedScript, loc, 'move', currentPathName);
        return next ? { script: next, name: currentPathName, replaced: true } : null;
    }
    const appended = appendVoiceBlock(script, buildBlock(freshName, waypoints));
    const next = upsertVoiceProperty(appended, loc, 'move', freshName);
    return next ? { script: next, name: freshName, replaced: false } : null;
}
/** Header line of a scene-level `room <name>` block (the parser's sceneMatch, narrowed to rooms). */
function roomHeaderRx(name) {
    return new RegExp(`^\\s*room\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
}
/**
 * 0-based line index of the `room <name>` header, or -1. Names compare
 * case-insensitively, as the engine's room lookup does.
 */
export function findRoomLine(script, roomName) {
    const rx = roomHeaderRx(roomName);
    const lines = script.split('\n');
    for (let i = 0; i < lines.length; i++)
        if (rx.test(lines[i]))
            return i;
    return -1;
}
/**
 * Write `<field> <value>` inside a `room <name>` block (the mixer's room
 * view): replaces the existing line for that field, else inserts one right
 * under the header. `value: null` removes the field (an `rt60` override
 * cleared back to "derived"). `walls` also matches a `wall` line, as the
 * parser does. Returns the updated script, or null when no such room exists.
 *
 * The block extends over blank lines to the first non-blank line at the
 * header's indent or less — the parser's own rule for scene blocks, which
 * differs from a voice's property block (that one stops at a blank line).
 */
export function upsertRoomField(script, roomName, field, value) {
    const headerIdx = findRoomLine(script, roomName);
    if (headerIdx < 0)
        return null;
    const lines = script.split('\n');
    const headerIndent = indentOf(lines[headerIdx]);
    const keyRx = field === 'walls' ? /^walls?(\s|$)/i : new RegExp(`^${field}(\\s|$)`, 'i');
    const propLine = value === null ? null : `${field} ${value}`;
    let blockIndent = null;
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim())
            continue;
        if (indentOf(line) <= headerIndent)
            break;
        const trimmed = line.trimStart();
        if (blockIndent === null)
            blockIndent = line.slice(0, line.length - trimmed.length);
        if (keyRx.test(trimmed)) {
            if (propLine === null)
                lines.splice(i, 1);
            else
                lines[i] = line.slice(0, line.length - trimmed.length) + propLine;
            return lines.join('\n');
        }
    }
    if (propLine === null)
        return lines.join('\n');
    const indent = blockIndent ?? ' '.repeat(headerIndent + 2);
    lines.splice(headerIdx + 1, 0, indent + propLine);
    return lines.join('\n');
}
/**
 * Append a top-level `room <name>` block with the given fields (the mixer's
 * "add a room" chip, "pin the world room"). A blank line separates it from
 * whatever came before, so it never reads as part of a preceding block.
 */
export function appendRoomBlock(script, name, fields = {}) {
    const body = [`room ${name}`];
    if (fields.size)
        body.push(`  size ${fields.size.map(fmt).join(' ')}`);
    if (fields.floor)
        body.push(`  floor ${fields.floor}`);
    if (fields.ceiling)
        body.push(`  ceiling ${fields.ceiling}`);
    if (fields.walls)
        body.push(`  walls ${fields.walls}`);
    if (fields.rt60 != null)
        body.push(`  rt60 ${fmt(fields.rt60)}`);
    return appendVoiceBlock(script, body.join('\n'));
}
// ── Entities: a thing in the world, its body and everything it does ──
/** A member statement's head: what ends an entity's own lines (the parser's StmtStartRx). */
const ENTITY_MEMBER_RX = /^(?:\d+\s*\*\s*)?(?:loop|oneshot|on\s+\w+)\b/i;
/**
 * The lines of entity `id`: its header, the end of its own property lines (before the first
 * sound), and its last line (`endentity`, or the line before the first one indented no deeper
 * than the header, the parser's rule). Null when the script does not parse or has no such entity.
 */
export function entityBlockRange(script, id) {
    let def;
    try {
        def = parseWithWarnings(script).entities.find(e => e.id === id.toLowerCase());
    }
    catch {
        return null;
    }
    if (!def?.lineNumber)
        return null;
    const lines = script.split('\n');
    const head = def.lineNumber - 1;
    const indent = lines[head].length - lines[head].trimStart().length;
    let end = head, ownEnd = head;
    let inOwn = true;
    // its own lines sit at the block's first indent and are not a sound's head, wherever they are in the
    // block (the parser reads them after its sounds too); a sound's own properties are indented deeper
    let blockIndent = -1;
    const own = [];
    for (let j = head + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (!t)
            continue;
        if (/^endentity\b/i.test(t)) {
            end = j;
            break;
        }
        const ind = lines[j].length - lines[j].trimStart().length;
        if (ind <= indent)
            break;
        if (blockIndent < 0)
            blockIndent = ind;
        const member = ENTITY_MEMBER_RX.test(t);
        if (member)
            inOwn = false;
        if (inOwn)
            ownEnd = j;
        if (!member && ind === blockIndent && !t.startsWith('#') && !t.startsWith('-'))
            own.push(j);
        end = j;
    }
    return { head, ownEnd, end, own };
}
/** Delete entity `id` whole: its body, its behaviour and every sound on it. Null when not found. */
export function deleteEntityBlock(script, id) {
    const r = entityBlockRange(script, id);
    if (!r)
        return null;
    const lines = script.split('\n');
    lines.splice(r.head, r.end - r.head + 1);
    if (r.head > 0 && r.head < lines.length && !lines[r.head].trim() && !lines[r.head - 1].trim())
        lines.splice(r.head, 1);
    return lines.join('\n');
}
/** Set one of entity `id`'s own lines (`speed 4to6`, `count 3`): replaced in place, else added after the header. */
export function upsertEntityProperty(script, id, key, value) {
    const r = entityBlockRange(script, id);
    if (!r)
        return null;
    const lines = script.split('\n');
    const keyRx = new RegExp(`^${key}\\b`, 'i');
    const at = r.own.find(j => keyRx.test(lines[j].trim()));
    const pad = (lines[r.head + 1] ?? '').match(/^\s*/)?.[0] || `${lines[r.head].match(/^\s*/)?.[0] ?? ''}  `;
    if (at !== undefined)
        lines[at] = `${lines[at].match(/^\s*/)?.[0] ?? pad}${key} ${value}`;
    else
        lines.splice(r.head + 1, 0, `${pad}${key} ${value}`);
    return lines.join('\n');
}
/** Remove one of entity `id`'s own lines (`hold`). The script unchanged when absent; null when the entity is not found. */
export function removeEntityProperty(script, id, key) {
    const r = entityBlockRange(script, id);
    if (!r)
        return null;
    const lines = script.split('\n');
    const keyRx = new RegExp(`^${key}\\b`, 'i');
    for (const j of [...r.own].reverse())
        if (keyRx.test(lines[j].trim()))
            lines.splice(j, 1);
    return lines.join('\n');
}
//# sourceMappingURL=scriptEdit.js.map