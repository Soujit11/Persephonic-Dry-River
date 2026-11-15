/**
 * Visual blocks of the `.satie` document (visual sonic designer, phase 2).
 *
 * Four scene-level declarations keep a Three.js visual inside the one
 * canonical document instead of beside it:
 *
 *   module <id> [key value ...]        the model-written Three.js module, raw
 *     ...javascript...                 lines, kept byte for byte (no comment
 *   endmodule                          stripping, no property parsing)
 *
 *   override <nodeId>                  edits applied to a visual node after the
 *     position x y z                   module's init: transform, visibility,
 *     rotation x y z   (degrees)       parent, removal, declared props
 *     scale s | x y z
 *     visible on|off
 *     parent <nodeId>|none
 *     removed
 *     prop <path> <value>
 *
 *   binding <nodeId>                   what a visual node IS physically; nothing
 *     body static|kinematic|dynamic    is inferred from pixels or names
 *          box WxHxD | sphere r | capsule h r | hull | mesh | none
 *     surface <material text>
 *     acoustic solid|none|porous <0..1>
 *     host <world host id>
 *     emitter
 *     decorative
 *     friction <n>  restitution <n>
 *
 *   automation <nodeId>                keyframes, read by the sequencer (phase 6)
 *     key <path> <time s> <value> [easing]
 *
 * Node ids are the ids the module declares (`userData.satie.id` or `name`),
 * so overrides and bindings survive renames of anything else in the script
 * (ADR-0004: overrides keyed by stable id, never by path).
 */
export const VISUAL_NODE_ID_RX = /^[A-Za-z_][\w.-]{0,127}$/;
const MODULE_HEADER_RX = /^module\s+([A-Za-z_][\w.-]*)(?:\s+(.*))?$/i;
const PROP_PATH_RX = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*){0,3}$/;
const EASINGS = new Set(['linear', 'ease', 'ease_in', 'ease_out', 'ease_in_out', 'step']);
/**
 * Lift `module ... endmodule` fences out of the raw script before any comment
 * stripping: JavaScript is full of ` - ` and `#`. Fenced lines become blank so
 * every other line keeps its number. An unterminated fence runs to the end and
 * warns; a header without an id is left alone for the statement loop to warn on.
 */
export function extractModuleBlocks(rawLines, warn) {
    const lines = [...rawLines];
    const modules = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const header = MODULE_HEADER_RX.exec(trimmed);
        if (!header || countIndent(lines[i]) !== 0)
            continue;
        const id = header[1];
        const meta = parseMeta(header[2] ?? '');
        const body = [];
        let j = i + 1;
        let closed = false;
        while (j < lines.length) {
            if (/^endmodule\s*$/i.test(lines[j].trim()) && countIndent(lines[j]) === 0) {
                closed = true;
                break;
            }
            body.push(lines[j]);
            j++;
        }
        if (!closed)
            warn(`module '${id}' has no endmodule; the block runs to the end of the script`, i + 1);
        if (modules.some(m => m.id === id))
            warn(`Duplicate module '${id}', last one wins`, i + 1);
        const block = { id, meta, source: body.join('\n'), lineNumber: i + 1, endLine: closed ? j + 1 : lines.length };
        const index = modules.findIndex(m => m.id === id);
        if (index >= 0)
            modules[index] = block;
        else
            modules.push(block);
        for (let k = i; k <= Math.min(j, lines.length - 1); k++)
            lines[k] = '';
        i = j;
    }
    return { lines, modules };
}
function parseMeta(text) {
    const meta = {};
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 1 < tokens.length; i += 2)
        meta[tokens[i].toLowerCase()] = tokens[i + 1];
    return meta;
}
function countIndent(line) { return line.length - line.trimStart().length; }
function numbers(tokens, count) {
    if (tokens.length !== count)
        return null;
    const out = tokens.map(Number);
    return out.every(Number.isFinite) ? out : null;
}
export function parsePropValue(raw) {
    const text = raw.trim();
    if (!text)
        return null;
    if (/^(on|true|yes)$/i.test(text))
        return true;
    if (/^(off|false|no)$/i.test(text))
        return false;
    if (/^-?\d+(?:\.\d+)?$/.test(text))
        return Number(text);
    const quoted = /^"((?:\\.|[^"\\])*)"$/.exec(text) ?? /^'((?:\\.|[^'\\])*)'$/.exec(text);
    if (quoted)
        return quoted[1].replace(/\\(.)/g, '$1');
    if (/^#[0-9a-f]{3,8}$/i.test(text) || /^[\w.-]+$/.test(text))
        return text;
    return null;
}
export function formatPropValue(value) {
    if (typeof value === 'boolean')
        return value ? 'on' : 'off';
    if (typeof value === 'number')
        return fmt(value);
    if (/^#[0-9a-f]{3,8}$/i.test(value) || /^[\w.-]+$/.test(value))
        return value;
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function fmt(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000); }
export function parseOverrideBlock(nodeId, block, lineNumber, warn) {
    const out = { nodeId, props: {}, lineNumber };
    block.forEach((line, offset) => {
        const at = lineNumber + offset + 1;
        const tokens = line.trim().split(/\s+/);
        const key = tokens[0].toLowerCase();
        const rest = tokens.slice(1);
        switch (key) {
            case 'position':
            case 'rotation': {
                const v = numbers(rest, 3);
                if (v)
                    out[key] = v;
                else
                    warn(`override '${nodeId}': ${key} needs x y z`, at);
                return;
            }
            case 'scale': {
                const v = numbers(rest, 3) ?? (rest.length === 1 && Number.isFinite(Number(rest[0])) ? [Number(rest[0]), Number(rest[0]), Number(rest[0])] : null);
                if (v)
                    out.scale = v;
                else
                    warn(`override '${nodeId}': scale needs one number or x y z`, at);
                return;
            }
            case 'visible': {
                const v = parsePropValue(rest.join(' '));
                if (typeof v === 'boolean')
                    out.visible = v;
                else
                    warn(`override '${nodeId}': visible is on or off`, at);
                return;
            }
            case 'parent': {
                if (rest.length === 1 && (rest[0] === 'none' || VISUAL_NODE_ID_RX.test(rest[0])))
                    out.parent = rest[0];
                else
                    warn(`override '${nodeId}': parent needs a node id or none`, at);
                return;
            }
            case 'removed': {
                if (rest.length === 0)
                    out.removed = true;
                else
                    warn(`override '${nodeId}': removed takes no value`, at);
                return;
            }
            case 'prop': {
                const path = rest[0];
                const value = parsePropValue(rest.slice(1).join(' '));
                if (path && PROP_PATH_RX.test(path) && value !== null)
                    out.props[path] = value;
                else
                    warn(`override '${nodeId}': prop needs <path> <value>`, at);
                return;
            }
            default: warn(`override '${nodeId}': unknown key '${key}' (position, rotation, scale, visible, parent, removed, prop)`, at);
        }
    });
    return out;
}
export function parseBindingBlock(nodeId, block, lineNumber, warn) {
    const out = { nodeId, emitter: false, decorative: false, lineNumber };
    block.forEach((line, offset) => {
        const at = lineNumber + offset + 1;
        const tokens = line.trim().split(/\s+/);
        const key = tokens[0].toLowerCase();
        const rest = tokens.slice(1);
        switch (key) {
            case 'body': {
                const motion = rest[0]?.toLowerCase();
                if (motion !== 'static' && motion !== 'kinematic' && motion !== 'dynamic') {
                    warn(`binding '${nodeId}': body needs static, kinematic or dynamic, then a shape`, at);
                    return;
                }
                const shape = parseShape(rest.slice(1));
                if (!shape) {
                    warn(`binding '${nodeId}': body shape is box WxHxD, sphere r, capsule h r, hull, mesh or none`, at);
                    return;
                }
                if (shape.type === 'mesh' && motion === 'dynamic') {
                    warn(`binding '${nodeId}': a mesh collider cannot be dynamic; use hull`, at);
                    return;
                }
                out.body = { motion, shape };
                return;
            }
            case 'surface': {
                if (rest.length)
                    out.surface = rest.join(' ');
                else
                    warn(`binding '${nodeId}': surface needs a material`, at);
                return;
            }
            case 'acoustic': {
                const kind = rest[0]?.toLowerCase();
                if (kind === 'solid' && rest.length === 1)
                    out.acoustic = { kind: 'solid' };
                else if (kind === 'none' && rest.length === 1)
                    out.acoustic = { kind: 'none' };
                else if (kind === 'porous' && rest.length === 2 && Number.isFinite(Number(rest[1])) && Number(rest[1]) >= 0 && Number(rest[1]) <= 1)
                    out.acoustic = { kind: 'porous', porous: Number(rest[1]) };
                else
                    warn(`binding '${nodeId}': acoustic is solid, none or porous <0..1>`, at);
                return;
            }
            case 'host': {
                if (rest.length === 1 && /^[\w.-]+$/.test(rest[0]))
                    out.host = rest[0];
                else
                    warn(`binding '${nodeId}': host needs one id`, at);
                return;
            }
            case 'emitter': {
                if (rest.length === 0)
                    out.emitter = true;
                else
                    warn(`binding '${nodeId}': emitter takes no value`, at);
                return;
            }
            case 'decorative': {
                if (rest.length === 0)
                    out.decorative = true;
                else
                    warn(`binding '${nodeId}': decorative takes no value`, at);
                return;
            }
            case 'friction':
            case 'restitution': {
                const v = numbers(rest, 1);
                if (v && v[0] >= 0 && v[0] <= 2)
                    out[key] = v[0];
                else
                    warn(`binding '${nodeId}': ${key} is a number from 0 to 2`, at);
                return;
            }
            default: warn(`binding '${nodeId}': unknown key '${key}' (body, surface, acoustic, host, emitter, decorative, friction, restitution)`, at);
        }
    });
    if (out.decorative && (out.body || out.acoustic?.kind === 'solid' || out.acoustic?.kind === 'porous'))
        warn(`binding '${nodeId}': decorative nodes carry no body or acoustic boundary; those lines are ignored`, lineNumber);
    if (out.decorative) {
        delete out.body;
        out.acoustic = { kind: 'none' };
    }
    return out;
}
function parseShape(tokens) {
    const kind = tokens[0]?.toLowerCase();
    if (kind === 'box' && tokens.length === 2) {
        const dims = tokens[1].toLowerCase().split('x').map(Number);
        if (dims.length === 3 && dims.every(d => Number.isFinite(d) && d > 0))
            return { type: 'box', size: dims };
        return null;
    }
    if (kind === 'sphere' && tokens.length === 2 && Number(tokens[1]) > 0)
        return { type: 'sphere', radius: Number(tokens[1]) };
    if (kind === 'capsule' && tokens.length === 3 && Number(tokens[1]) > 0 && Number(tokens[2]) > 0)
        return { type: 'capsule', height: Number(tokens[1]), radius: Number(tokens[2]) };
    if ((kind === 'hull' || kind === 'mesh' || kind === 'none') && tokens.length === 1)
        return { type: kind };
    return null;
}
function formatShape(shape) {
    switch (shape.type) {
        case 'box': return `box ${shape.size.map(fmt).join('x')}`;
        case 'sphere': return `sphere ${fmt(shape.radius)}`;
        case 'capsule': return `capsule ${fmt(shape.height)} ${fmt(shape.radius)}`;
        default: return shape.type;
    }
}
export function parseAutomationBlock(nodeId, block, lineNumber, warn) {
    const keys = [];
    block.forEach((line, offset) => {
        const at = lineNumber + offset + 1;
        const tokens = line.trim().split(/\s+/);
        if (tokens[0].toLowerCase() !== 'key') {
            warn(`automation '${nodeId}': unknown key '${tokens[0]}' (key <path> <time> <value> [easing])`, at);
            return;
        }
        const [path, timeText, ...rest] = tokens.slice(1);
        const easing = rest.length > 1 && EASINGS.has(rest[rest.length - 1].toLowerCase()) ? rest.pop().toLowerCase() : undefined;
        const time = Number(timeText), value = parsePropValue(rest.join(' '));
        if (!path || !PROP_PATH_RX.test(path) || !Number.isFinite(time) || time < 0 || value === null) {
            warn(`automation '${nodeId}': key needs <path> <time> <value> [easing]`, at);
            return;
        }
        keys.push({ path, time, value, ...(easing ? { easing } : {}) });
    });
    keys.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.time - b.time);
    return { nodeId, keys, lineNumber };
}
// ── Formatting (the inverse of parsing; two-space indent like every block) ──
export function formatModuleBlock(block) {
    const meta = Object.entries(block.meta).map(([k, v]) => ` ${k} ${v}`).join('');
    return `module ${block.id}${meta}\n${block.source}\nendmodule`;
}
export function formatOverrideBlock(o) {
    const lines = [`override ${o.nodeId}`];
    if (o.position)
        lines.push(`  position ${o.position.map(fmt).join(' ')}`);
    if (o.rotation)
        lines.push(`  rotation ${o.rotation.map(fmt).join(' ')}`);
    if (o.scale)
        lines.push(o.scale.every(s => s === o.scale[0]) ? `  scale ${fmt(o.scale[0])}` : `  scale ${o.scale.map(fmt).join(' ')}`);
    if (o.visible !== undefined)
        lines.push(`  visible ${o.visible ? 'on' : 'off'}`);
    if (o.parent !== undefined)
        lines.push(`  parent ${o.parent}`);
    if (o.removed)
        lines.push('  removed');
    for (const [path, value] of Object.entries(o.props))
        lines.push(`  prop ${path} ${formatPropValue(value)}`);
    return lines.join('\n');
}
export function formatBindingBlock(b) {
    const lines = [`binding ${b.nodeId}`];
    if (b.decorative)
        lines.push('  decorative');
    if (b.body)
        lines.push(`  body ${b.body.motion} ${formatShape(b.body.shape)}`);
    if (b.surface)
        lines.push(`  surface ${b.surface}`);
    if (b.acoustic && !b.decorative)
        lines.push(b.acoustic.kind === 'porous' ? `  acoustic porous ${fmt(b.acoustic.porous)}` : `  acoustic ${b.acoustic.kind}`);
    if (b.host)
        lines.push(`  host ${b.host}`);
    if (b.emitter)
        lines.push('  emitter');
    if (b.friction !== undefined)
        lines.push(`  friction ${fmt(b.friction)}`);
    if (b.restitution !== undefined)
        lines.push(`  restitution ${fmt(b.restitution)}`);
    return lines.join('\n');
}
export function formatAutomationBlock(a) {
    return [`automation ${a.nodeId}`, ...a.keys.map(k => `  key ${k.path} ${fmt(k.time)} ${formatPropValue(k.value)}${k.easing ? ` ${k.easing}` : ''}`)].join('\n');
}
/** Format a single override/binding/automation field line as the parser reads it (no indent). */
export const VISUAL_BLOCK_KINDS = ['override', 'binding', 'automation'];
//# sourceMappingURL=SceneVisual.js.map