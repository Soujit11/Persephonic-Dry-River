/**
 * Text surgery for the visual blocks (visual sonic designer, phase 2): find,
 * upsert, remove and replace `module`, `override`, `binding` and `automation`
 * blocks without reformatting anything else. Every function is pure
 * (script in, script out) and touches only the lines of the block it names, so
 * the three-way transaction can merge disjoint edits byte for byte.
 */
import { formatModuleBlock } from '../core/SceneVisual.js';
const INDENT = '  ';
function countIndent(line) { return line.length - line.trimStart().length; }
/** 0-based line of the `<kind> <nodeId>` header, or -1. Module fences are excluded from the search. */
export function findVisualBlockLine(script, kind, nodeId) {
    const lines = script.split('\n');
    let inModule = false;
    const rx = new RegExp(`^${kind}\\s+${escapeRx(nodeId)}\\s*$`, 'i');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!inModule && /^module\s+\S/i.test(trimmed) && countIndent(lines[i]) === 0) {
            inModule = true;
            continue;
        }
        if (inModule) {
            if (/^endmodule\s*$/i.test(trimmed) && countIndent(lines[i]) === 0)
                inModule = false;
            continue;
        }
        if (countIndent(lines[i]) === 0 && rx.test(trimmed))
            return i;
    }
    return -1;
}
/** [start, end) 0-based line range of a block: header plus its indented lines (trailing blanks excluded). */
export function visualBlockRange(script, kind, nodeId) {
    const start = findVisualBlockLine(script, kind, nodeId);
    if (start < 0)
        return null;
    const lines = script.split('\n');
    let end = start + 1;
    let lastContent = start;
    while (end < lines.length && (!lines[end].trim() || countIndent(lines[end]) > 0)) {
        if (lines[end].trim())
            lastContent = end;
        end++;
    }
    return [start, lastContent + 1];
}
/**
 * Set one field line in a block (`position 1 2 3`, `prop material.color #fff`),
 * creating the block when it is missing. For `prop` and `key` lines the match
 * key is `prop <path>` / `key <path> <time>`, so other props stay. `null`
 * removes the matching line and drops the block when nothing is left.
 */
export function upsertVisualBlockField(script, kind, nodeId, matchKey, line, at) {
    const lines = script.split('\n');
    const range = visualBlockRange(script, kind, nodeId);
    const matches = (text) => {
        const tokens = text.trim().split(/\s+/);
        const keyTokens = matchKey.split(/\s+/);
        return keyTokens.every((k, i) => tokens[i]?.toLowerCase() === k.toLowerCase());
    };
    if (!range) {
        if (line === null)
            return script;
        const block = [`${kind} ${nodeId}`, `${INDENT}${line}`];
        return insertBlock(script, block.join('\n'), at);
    }
    const [start, end] = range;
    const existing = [];
    for (let i = start + 1; i < end; i++)
        if (lines[i].trim() && matches(lines[i]))
            existing.push(i);
    if (line === null) {
        for (const i of existing.reverse())
            lines.splice(i, 1);
        const remaining = lines.slice(start + 1, end - existing.length).some(l => l.trim());
        if (!remaining)
            return removeVisualBlock(lines.join('\n'), kind, nodeId);
        return lines.join('\n');
    }
    if (existing.length) {
        lines[existing[0]] = `${INDENT}${line}`;
        for (const i of existing.slice(1).reverse())
            lines.splice(i, 1);
    }
    else {
        lines.splice(end, 0, `${INDENT}${line}`);
    }
    return lines.join('\n');
}
/** Remove a whole block (and one blank line that separated it). */
export function removeVisualBlock(script, kind, nodeId) {
    const range = visualBlockRange(script, kind, nodeId);
    if (!range)
        return script;
    const lines = script.split('\n');
    let [start, end] = range;
    if (end < lines.length && !lines[end].trim())
        end++;
    else if (start > 0 && !lines[start - 1].trim())
        start--;
    lines.splice(start, end - start);
    return lines.join('\n');
}
/** Replace a block's body entirely with the given formatted block text. */
export function replaceVisualBlock(script, kind, nodeId, formatted, at) {
    const range = visualBlockRange(script, kind, nodeId);
    if (!range)
        return insertBlock(script, formatted, at);
    const lines = script.split('\n');
    lines.splice(range[0], range[1] - range[0], ...formatted.split('\n'));
    return lines.join('\n');
}
/** 0-based [start, end] inclusive lines of a module fence, or null. */
export function moduleBlockRange(script, id) {
    const lines = script.split('\n');
    const rx = new RegExp(`^module\\s+${escapeRx(id)}(?:\\s|$)`, 'i');
    for (let i = 0; i < lines.length; i++) {
        if (countIndent(lines[i]) !== 0 || !rx.test(lines[i].trim()))
            continue;
        let j = i + 1;
        while (j < lines.length && !(/^endmodule\s*$/i.test(lines[j].trim()) && countIndent(lines[j]) === 0))
            j++;
        return [i, Math.min(j, lines.length - 1)];
    }
    return null;
}
/** Replace (or append) a module fence; the header's unknown meta keys ride along untouched when `meta` keeps them. */
export function replaceModuleBlock(script, block, at) {
    const formatted = formatModuleBlock(block);
    const range = moduleBlockRange(script, block.id);
    if (!range)
        return insertBlock(script, formatted, at);
    const lines = script.split('\n');
    lines.splice(range[0], range[1] - range[0] + 1, ...formatted.split('\n'));
    return lines.join('\n');
}
export function removeModuleBlock(script, id) {
    const range = moduleBlockRange(script, id);
    if (!range)
        return script;
    const lines = script.split('\n');
    let [start, end] = range;
    end += 1;
    if (end < lines.length && !lines[end].trim())
        end++;
    else if (start > 0 && !lines[start - 1].trim())
        start--;
    lines.splice(start, end - start);
    return lines.join('\n');
}
function appendBlock(script, block) {
    const trimmed = script.replace(/\s+$/, '');
    return `${trimmed}${trimmed ? '\n\n' : ''}${block}\n`;
}
/**
 * Put a block back where it was (`at`, 0-based line), with the blank line
 * removal took, so an inverse operation restores the script byte for byte.
 * Without `at`, or past the end, the block is appended.
 */
function insertBlock(script, block, at) {
    const lines = script.split('\n');
    if (at === undefined || at < 0 || at >= lines.length - 1)
        return appendBlock(script, block);
    const inserted = block.split('\n');
    if (lines[at].trim())
        inserted.push('');
    lines.splice(at, 0, ...inserted);
    return lines.join('\n');
}
function escapeRx(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
//# sourceMappingURL=visualEdit.js.map