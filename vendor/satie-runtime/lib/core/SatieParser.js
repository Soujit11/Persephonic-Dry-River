/**
 * Satie Language Parser — full port from SatieParser.cs
 * Parses .satie scripts into Statement objects.
 */
import { ENTITY_RIGS } from './EntityRig.js';
import { parseEntityBehavior } from './EntityBehavior.js';
import { parseRecordingBanks } from './RecordingBanks.js';
import { RangeOrValue } from './RangeOrValue.js';
import { inspectPrograms } from './SynchronizedPrograms.js';
import { parseEntityBody } from './EntityBody.js';
import { InterpolationData, ModulationType, LoopMode } from './InterpolationData.js';
import { SCENE_BAND_COUNT, MIC_FORMATS, MIC_ARRAY_FORMATS, MIC_DEFAULT_RADIUS_M, } from './Scene.js';
import { Statement, WanderType, generationIdentity, } from './Statement.js';
import { fnv1a } from './Random.js';
import { isTrajectoryName, isBuiltinTrajectory, registerTrajectoryFromLUT, getTrajectory } from '../spatial/Trajectories.js';
import { parseColorValue, parseColorToken } from './color.js';
import { clamp, clamp01 } from './math.js';
import { compilePath } from '../spatial/Paths.js';
import { KNOWN_SIGNALS, FOLLOW_CURVE_MIN, FOLLOW_CURVE_MAX } from './Signals.js';
import { parseWorldBlock } from '../world/WorldBlock.js';
import { defaultAgentParams } from '../world/EntityAgents.js';
import { extractModuleBlocks, parseOverrideBlock, parseBindingBlock, parseAutomationBlock } from './SceneVisual.js';
import { KNOWN_PROPERTIES, PROPERTY_KEYWORDS, STANDALONE_FLAGS, ENTITY_PROPERTY_NAMES, propertySpec, } from './Properties.js';
import { ROUTE_EVERY_DEFAULT, ROUTE_STOP_DEFAULT, POPULATION_COUNT_MAX, GAIT_STRIDE_MIN_M, GAIT_STRIDE_MAX_M, } from './Entities.js';
import { SECTORS, DEPTHS, HEIGHTS, EXTENTS, SEMANTIC_MOTIONS, isSemanticMotion, resolvePlacement, defaultRegionFor, } from '../spatial/Placement.js';
export class SatieSyntaxError extends Error {
    propertyName;
    invalidValue;
    sourceLine;
    lineNumber;
    constructor(message, propertyName, invalidValue, sourceLine, lineNumber) {
        super(message);
        this.name = 'SatieSyntaxError';
        this.propertyName = propertyName ?? null;
        this.invalidValue = invalidValue ?? null;
        this.sourceLine = sourceLine ?? null;
        this.lineNumber = lineNumber ?? -1;
    }
}
/**
 * Everything one parse collects or consults. Created at the top of a parse
 * call and threaded through the block and property parsers, so two parses
 * never share warnings, scene declarations or folder resolution.
 */
// Counts expand generated voices during parsing and ordinary voices at runtime.
// Bound both an individual prefix and the whole script before allocating copies.
const MAX_STATEMENT_COPIES = 2000;
const MAX_SCRIPT_VOICES = 10_000;
class ParseContext {
    folders;
    levelReferenceDb;
    warnings = [];
    materials = [];
    rooms = [];
    soundscapes = [];
    mics = [];
    world = null;
    entities = [];
    paths = [];
    modules = [];
    overrides = [];
    bindings = [];
    automations = [];
    expandedVoices = 0;
    /**
     * The ORIGINAL-script line (0-based) of the property line parseSingle is
     * currently dispatching, or -2 when no provenance is available. Property-level
     * warnings historically passed lineNumber -1 ("unknown"); with provenance
     * threaded through the pre-passes, `warn` resolves those to the real line.
     */
    propOrigin = -2;
    constructor(folders) {
        this.folders = folders;
    }
    warn(message, lineNumber, suggestion, severity = 'warning') {
        if (lineNumber === -1 && this.propOrigin >= 0)
            lineNumber = this.propOrigin + 1;
        this.warnings.push({ message, lineNumber, severity, suggestion });
    }
}
/**
 * `material <name>` block. Either explicit octave-band coefficients:
 *
 *     material carpet
 *       absorption 0.08 0.24 0.57 0.69 0.71 0.73
 *
 * or a bare name, left for the absorption table to resolve later by string
 * similarity. Resolution is deliberately NOT done here: the parser must stay
 * pure and synchronous, and the table lives in the spatial layer.
 */
function parseMaterialBlock(ctx, name, block, line) {
    for (const raw of block) {
        const m = raw.match(/^absorption\s+(.+)$/i);
        if (!m) {
            ctx.warn(`Unrecognised line in material '${name}': '${raw}'`, line);
            continue;
        }
        const nums = m[1].trim().split(/[\s,]+/).map(Number);
        if (nums.length !== SCENE_BAND_COUNT || nums.some((n) => !Number.isFinite(n))) {
            ctx.warn(`material '${name}': absorption needs ${SCENE_BAND_COUNT} numbers (125 Hz–4 kHz), got ${nums.length}`, line, `e.g. absorption 0.08 0.24 0.57 0.69 0.71 0.73`);
            continue;
        }
        return {
            name,
            absorption: nums.map((n) => Math.min(1, Math.max(0, n))),
            source: 'declared',
        };
    }
    return { name, absorption: [], source: 'resolved' };
}
/**
 * `room <name>` block:
 *
 *     room kitchen
 *       size 5 3 4
 *       floor tile
 *       walls concrete
 *       rt60 0.6
 *
 * Every field is optional — whatever the script omits, measured geometry
 * supplies. A room that declares nothing is still meaningful: it names a space
 * for voices to belong to.
 */
/**
 * `mic <name>` — a microphone the scene is captured by.
 *
 *     mic ears
 *       place 0 1.6 0
 *       aim 30
 *       format binaural
 *
 *     mic array
 *       place 0 1.6 0
 *       format tetrahedral 0.042
 *       sphere
 *
 *     mic walk
 *       format soa
 *       move 0 0 1.6 0 aim 0
 *       move 12 8 1.6 -4 aim 90
 *
 * `move <t> <x> <y> <z> [aim <deg>]` lines make the mic a PATH — which is
 * what `ListenerPath` was, only hand-built by the caller instead of said in
 * the script. Returns null (with a warning) when the block names no format:
 * a mic that captures nothing is a typo, not a default.
 */
function parseMicBlock(ctx, name, block, line) {
    const mic = { name: name.toLowerCase(), format: 'binaural', path: [], line };
    let sawFormat = false;
    let place = null;
    let aimRad = null;
    for (const raw of block) {
        const [key, ...rest] = raw.trim().split(/\s+/);
        const k = (key ?? '').toLowerCase();
        switch (k) {
            case 'format': {
                const f = (rest[0] ?? '').toLowerCase();
                if (!MIC_FORMATS.has(f)) {
                    ctx.warn(`mic '${name}': unknown format '${rest[0] ?? ''}': one of ${[...MIC_FORMATS].join(', ')}`, line);
                    break;
                }
                mic.format = f;
                sawFormat = true;
                // `format circular <n> [r]` — count then radius; every other array
                // format takes only a radius.
                const nums = rest.slice(1).map(Number).filter(n => !isNaN(n));
                if (f === 'circular') {
                    if (nums.length)
                        mic.capsules = Math.max(2, Math.min(64, Math.round(nums[0])));
                    if (nums.length > 1)
                        mic.radiusM = clampMicRadius(nums[1]);
                }
                else if (nums.length) {
                    mic.radiusM = clampMicRadius(nums[0]);
                }
                break;
            }
            case 'place': {
                const n = rest.map(Number);
                if (n.length < 3 || n.some(isNaN)) {
                    ctx.warn(`mic '${name}': 'place' takes three numbers: x y z, in metres`, line);
                    break;
                }
                place = { x: n[0], y: n[1], z: n[2] };
                break;
            }
            case 'aim': {
                const deg = Number(rest[0]);
                if (isNaN(deg)) {
                    ctx.warn(`mic '${name}': 'aim' takes degrees (0 = facing ahead, +Z)`, line);
                    break;
                }
                aimRad = (deg * Math.PI) / 180;
                break;
            }
            case 'move': {
                const kf = parseMicKeyframe(ctx, name, rest, line);
                if (kf)
                    mic.path.push(kf);
                break;
            }
            case 'sphere':
                mic.rigidSphere = true;
                break;
            default:
                ctx.warn(`mic '${name}': unknown line '${k}' (expected place / aim / move / format / sphere)`, line);
        }
    }
    if (!sawFormat) {
        ctx.warn(`mic '${name}' declares no 'format': nothing to capture, so it is ignored`, line);
        return null;
    }
    if (mic.rigidSphere && !MIC_ARRAY_FORMATS.has(mic.format)) {
        ctx.warn(`mic '${name}': 'sphere' only means something for a capsule array, ignored for '${mic.format}'`, line);
        mic.rigidSphere = false;
    }
    // `place`/`aim` seed the path when no `move` line did. A mic that says
    // neither sits at the origin facing ahead, which is what every render did
    // before mics existed.
    if (!mic.path.length) {
        mic.path.push({ t: 0, x: place?.x ?? 0, y: place?.y ?? 0, z: place?.z ?? 0, heading: aimRad ?? 0 });
    }
    else {
        mic.path.sort((a, b) => a.t - b.t);
    }
    if (MIC_ARRAY_FORMATS.has(mic.format) && mic.radiusM === undefined) {
        mic.radiusM = MIC_DEFAULT_RADIUS_M;
    }
    return mic;
}
/** `move <t> <x> <y> <z> [aim <deg>]` — one pose along a mic's path. */
function parseMicKeyframe(ctx, name, rest, line) {
    const aimIdx = rest.findIndex(t => t.toLowerCase() === 'aim');
    const nums = (aimIdx >= 0 ? rest.slice(0, aimIdx) : rest).map(Number);
    if (nums.length < 4 || nums.some(isNaN)) {
        ctx.warn(`mic '${name}': 'move' takes a time and a position: "move <t> <x> <y> <z> [aim <deg>]"`, line);
        return null;
    }
    let heading = 0;
    if (aimIdx >= 0) {
        const deg = Number(rest[aimIdx + 1]);
        if (isNaN(deg)) {
            ctx.warn(`mic '${name}': 'move … aim' takes degrees`, line);
        }
        else {
            heading = (deg * Math.PI) / 180;
        }
    }
    return { t: Math.max(0, nums[0]), x: nums[1], y: nums[2], z: nums[3], heading };
}
/** Capsule radius, metres — a body, not a room. */
function clampMicRadius(r) {
    return Math.max(0.001, Math.min(1, r));
}
function parseRoomBlock(ctx, name, block, line) {
    const room = { name, sizeM: null, surfaces: {}, rt60S: null, placeM: null };
    for (const raw of block) {
        const [key, ...rest] = raw.split(/\s+/);
        const value = rest.join(' ').trim();
        switch (key.toLowerCase()) {
            case 'size': {
                const n = value.split(/[\s,]+/).map(Number);
                if (n.length === 3 && n.every((v) => Number.isFinite(v) && v > 0)) {
                    room.sizeM = { x: n[0], y: n[1], z: n[2] };
                }
                else {
                    ctx.warn(`room '${name}': size needs three positive numbers (w h d)`, line);
                }
                break;
            }
            case 'place': {
                // The centre of the size box, scene metres — a placed room is
                // enterable (the engine flips its boundary when the listener is in).
                const n = value.split(/[\s,]+/).map(Number);
                if (n.length === 3 && n.every((v) => Number.isFinite(v))) {
                    room.placeM = { x: n[0], y: n[1], z: n[2] };
                }
                else {
                    ctx.warn(`room '${name}': place needs three numbers (x y z, the box centre)`, line);
                }
                break;
            }
            case 'floor':
                room.surfaces.floor = value;
                break;
            case 'ceiling':
                room.surfaces.ceiling = value;
                break;
            case 'walls':
            case 'wall':
                room.surfaces.walls = value;
                break;
            case 'rt60': {
                const v = Number(value);
                if (Number.isFinite(v) && v > 0)
                    room.rt60S = v;
                else
                    ctx.warn(`room '${name}': rt60 needs a positive number of seconds`, line);
                break;
            }
            default:
                ctx.warn(`Unrecognised line in room '${name}': '${raw}'`, line);
        }
    }
    return room;
}
const SOUNDSCAPE_KINDS = ['open', 'enclosed', 'moving', 'world'];
/**
 * `soundscape <id>` block (spec 014, phase 2):
 *
 *     soundscape crossing
 *       label The crossing and the courtyard
 *       share rural level crossing among rice paddies
 *       kind open
 *       regions crossing courtyard
 *       objects crossing_bell_north crossing_bell_south train_body
 *       sounds paddy_drone
 *       why the bell and the passing train carry into the courtyard
 *
 *     soundscape farmhouse
 *       kind enclosed
 *       rooms genkan tatami_room
 *
 *     soundscape everywhere
 *       kind world
 *       sounds cicadas
 *
 * A block of `kind world` is not a soundscape: it lists the world layer.
 * `objects` (manifest ids: every voice `at` one is a member), `sounds` (source ids, for beds and
 * placed sounds) and `regions` may repeat; their lists add up. `follows <object>` makes it move with
 * an object (a train car).
 */
function parseSoundscapeBlock(ctx, id, block, line) {
    const sc = { id: id.toLowerCase(), regions: [], rooms: [], objects: [], sounds: [] };
    const words = (v) => v.split(/[\s,]+/).filter(Boolean);
    for (const raw of block) {
        const [key, ...rest] = raw.split(/\s+/);
        const value = rest.join(' ').trim();
        switch (key.toLowerCase()) {
            case 'label':
                if (value)
                    sc.label = value;
                else
                    ctx.warn(`soundscape '${id}': label needs a name`, line);
                break;
            case 'share':
                if (value)
                    sc.share = value;
                else
                    ctx.warn(`soundscape '${id}': share needs a description`, line);
                break;
            case 'kind': {
                const k = value.toLowerCase();
                if (SOUNDSCAPE_KINDS.includes(k))
                    sc.kind = k;
                else
                    ctx.warn(`soundscape '${id}': kind is one of ${SOUNDSCAPE_KINDS.join(', ')}`, line);
                break;
            }
            case 'regions':
            case 'region':
                sc.regions.push(...words(value));
                break;
            case 'rooms':
            case 'room':
                sc.rooms.push(...words(value).map(w => w.toLowerCase()));
                break;
            case 'objects':
            case 'object':
                sc.objects.push(...words(value));
                break;
            case 'sounds':
            case 'sound':
                sc.sounds.push(...words(value));
                break;
            case 'follows':
                if (value)
                    sc.follows = words(value)[0];
                else
                    ctx.warn(`soundscape '${id}': follows needs an object id`, line);
                break;
            case 'why':
                if (value)
                    sc.why = value;
                break;
            default: ctx.warn(`Unrecognised line in soundscape '${id}': '${raw}'`, line);
        }
    }
    sc.regions = [...new Set(sc.regions)];
    sc.rooms = [...new Set(sc.rooms)];
    sc.objects = [...new Set(sc.objects)];
    sc.sounds = [...new Set(sc.sounds)];
    return sc;
}
/**
 * Compute Levenshtein distance between two strings.
 * Used for "did you mean?" suggestions on property typos.
 */
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}
function suggestProperty(typo) {
    let best;
    let bestDist = Infinity;
    for (const prop of KNOWN_PROPERTIES) {
        const d = levenshtein(typo, prop);
        if (d < bestDist && d <= 2) {
            best = prop;
            bestDist = d;
        }
    }
    return best;
}
/**
 * Monotonic statement identity, unique across a session and deliberately NOT
 * per parse: the engine's incremental reload pairs statements across parses by
 * it, so two parses of one session must never mint the same id.
 */
let _nextStatementId = 1;
// Regex patterns (compiled once)
// `loop gen <words>` buys or finds a sample; `loop synth <words>` is played by Satie's synthesizer.
const GenRx = /^(?<prefix>(?:\d+\s*\*\s*)?)(?<kind>loop|oneshot|on\s+\w+)\s+(?<source>gen|synth)\s+(?<prompt>.+?)(?=\s+every\s+|$)/i;
// The `d` flag exposes match indices: parseSingle uses the block group's start
// offset to map property lines back to their source lines (the header's
// trailing `\s*` can swallow whitespace-only lines, so "block starts on line
// 1" is not a safe assumption).
const StmtRx = /^(?:(?<count>\d+)\s*\*\s*)?(?<kind>loop|oneshot|on\s+\w+)\s+(?<clip>\S+)\s*(?:every\s+(?:(?<e1>-?\d+\.?\d*)to(?<e2>-?\d+\.?\d*)|(?<e>-?\d+\.?\d*)))?\s*\r?\n(?<block>(?:[ \t]+.*\r?\n?)*)/imd;
const StmtStartRx = /^(?:\d+\s*\*\s*)?(?:loop|oneshot|on\s+\w+)\b/i;
function srcLine(text, origin, shared = false, inline = false) {
    return { text, origin, shared, inline };
}
function countIndent(line) {
    let n = 0;
    while (n < line.length && (line[n] === ' ' || line[n] === '\t'))
        n++;
    return n;
}
function stripBlockComments(text) {
    const lines = text.split('\n');
    const result = [];
    let inBlockComment = false;
    // Commented lines become EMPTY lines rather than disappearing: parseSingle
    // maps each property line back to its source line by index, and dropping
    // lines here would shift every property below a comment off its origin.
    for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed.toLowerCase().startsWith('comment')) {
            inBlockComment = true;
            result.push('');
            continue;
        }
        if (trimmed.toLowerCase().startsWith('endcomment')) {
            inBlockComment = false;
            result.push('');
            continue;
        }
        if (inBlockComment) {
            result.push('');
            continue;
        }
        result.push(line);
    }
    return result.join('\n');
}
/**
 * Strip dash comments from a line:
 * - Full line comments: line starts with '-' (after whitespace)
 * - Inline comments: ' - ' (space-dash-space) where text after dash doesn't start with a digit
 *   (to avoid matching negative numbers like 'x -5to5')
 */
function hasLiteralPropertyValue(line) {
    return propertySpec(line.trimStart().split(/\s+/, 1)[0].toLowerCase())?.literalValue === true;
}
function stripDashComment(line) {
    if (hasLiteralPropertyValue(line))
        return line;
    const trimmed = line.trimStart();
    // Full line comment — but a leading negative number is content, not a comment.
    // Mirrors the `(?!\d)` guard on the inline form below, so a bare coordinate
    // line like `-5 0 -5` survives while `- a note to self` is still stripped.
    if (trimmed.startsWith('-') && !/^-\.?\d/.test(trimmed))
        return null;
    // Inline comment: find ' - ' pattern where next non-space char is not a digit or dot
    const inlineMatch = line.match(/^(.*?)\s+-\s+(?!\d)/);
    if (inlineMatch)
        return inlineMatch[1];
    return line;
}
/** Legal `scatter` shapes, and the largest dimension one may name. */
const SCATTER_SHAPES = new Set(['box', 'disc', 'sphere', 'shell']);
const SCATTER_MAX_M = 500;
function hasModulation(v) {
    return /\bfade\b/.test(v) || /\bjump\b/.test(v);
}
function isFollow(v) {
    return /^follow\b/i.test(v.trim());
}
/**
 * Parse a `follow` value form: `follow <signal> <inLo>to<inHi> <outLo>to<outHi>`
 * e.g. `volume follow distance 60to5 0.05to0.7`. Returns null (with a warning)
 * when malformed or when the signal is one nothing measures.
 */
function parseFollow(ctx, prop, v) {
    const tokens = v.trim().split(/\s+/);
    const signal = (tokens[1] || '').toLowerCase();
    if (tokens.length < 4 || !signal) {
        ctx.warn(`'${prop} follow' needs a signal and two ranges, e.g. "${prop} follow distance 60to5 0.05to0.7"`, -1);
        return null;
    }
    // Signals are an OPEN vocabulary: beyond the built-in measured channels
    // (KNOWN_SIGNALS), any name the scene/game supplies via
    // SatieEngine.setSignal is legal — the parser cannot know what exists at
    // runtime, so it accepts any identifier. An unset signal simply reads NaN
    // and the binding holds its last value.
    if (!/^\w+$/.test(signal)) {
        ctx.warn(`'${prop} follow' signal must be a bare name (built-ins: ${KNOWN_SIGNALS.join(', ')}, or any game-supplied signal)`, -1);
        return null;
    }
    const [inMin, inMax] = parseRange(tokens[2]);
    const [outMin, outMax] = parseRange(tokens[3]);
    if ([inMin, inMax, outMin, outMax].some((n) => isNaN(n))) {
        ctx.warn(`'${prop} follow ${signal}' has a malformed range: use numbers like 60to5 0.05to0.7`, -1);
        return null;
    }
    const binding = { signal, inMin, inMax, outMin, outMax };
    // Optional response curve: `… pow 1.5` (clamped FOLLOW_CURVE_MIN..MAX).
    if (tokens.length > 4) {
        const k = tokens[4].toLowerCase() === 'pow' ? parseFloat(tokens[5] ?? '') : NaN;
        if (isNaN(k)) {
            ctx.warn(`'${prop} follow ${signal}': after the two ranges only \`pow <k>\` is understood (e.g. "pow 1.5")`, -1);
        }
        else {
            binding.curve = Math.max(FOLLOW_CURVE_MIN, Math.min(FOLLOW_CURVE_MAX, k));
        }
    }
    return binding;
}
function parseRange(str) {
    str = str.trim();
    if (str.includes('to')) {
        const parts = str.split('to');
        return [parseFloat(parts[0]), parseFloat(parts[1])];
    }
    const val = parseFloat(str);
    return [val, val];
}
export function sanitizeForClipName(prompt) {
    // '.' must be replaced too: pathFor treats everything after the last dot as
    // a file extension, so a dot in a clip name breaks the buffer-key lookup.
    let sanitized = prompt.replace(/[<>:"/\\|?*.]/g, '_').replace(/ /g, '_').toLowerCase();
    if (sanitized.length > 30)
        sanitized = sanitized.substring(0, 30);
    return sanitized;
}
export function pathFor(clip) {
    if (!clip || !clip.trim())
        return '';
    let c = clip.replace(/\\/g, '/').replace(/^\//, '');
    const dot = c.lastIndexOf('.');
    if (dot >= 0)
        c = c.substring(0, dot);
    if (!c.startsWith('Audio/'))
        c = `Audio/${c}`;
    return c;
}
// Preprocess gen keyword
function preprocessGen(line) {
    const m = line.match(GenRx);
    if (!m?.groups)
        return { line, prompt: null, isGen: false, isSynth: false };
    const prefix = m.groups.prefix;
    const kind = m.groups.kind;
    const prompt = m.groups.prompt.trim();
    const isSynth = m.groups.source.toLowerCase() === 'synth';
    // A synth voice and a sample with the same words are different sounds, so they get different buffer names.
    const clipName = `generation/${isSynth ? 'synth_' : ''}${sanitizeForClipName(prompt)}`;
    const remainder = line.substring(m[0].length);
    const rewritten = `${prefix}${kind} ${clipName}${remainder}`;
    return { line: rewritten, prompt, isGen: true, isSynth };
}
// Parse a single statement block
/**
 * `at <ref> [body|top|base|inside] [pass]` — the host (an object id, a class,
 * a strip / patch id, or a geometric anchor), where on it the sound attaches,
 * and `pass` for a thing travelling along a strip.
 */
function parseAt(ctx, s, v) {
    const toks = v.trim().toLowerCase().split(/\s+/);
    const ref = toks[0] ?? '';
    if (!ref) {
        ctx.warnings.push({ message: '`at` needs a host: an object id or class, a strip / patch id, listener, air, ground, overhead or horizon', lineNumber: -1, severity: 'warning' });
        return;
    }
    // Version-1 anchor: rain on the canopy is rain on whatever is overhead.
    s.hostRef = ref === 'canopy' ? 'overhead' : ref;
    for (let i = 1; i < toks.length; i++) {
        const tok = toks[i];
        if (tok === 'pass')
            s.hostMotion = 'pass';
        else if (tok === 'top' || tok === 'base' || tok === 'inside' || tok === 'body')
            s.hostAttach = tok;
        else
            ctx.warnings.push({ message: `\`at ${ref} ${tok}\`: expected an attach point (body, top, base, inside) or \`pass\``, lineNumber: -1, severity: 'warning' });
    }
}
/** `variants <n>` — how many distinct takes to pool for a gen voice (2–8; 1 = a single take). */
function parseVariants(ctx, s, v) {
    const n = parseScalarProp(ctx, 'variants', v);
    if (n === null) {
        ctx.warn(`'variants' takes a whole number 2–8: how many distinct takes to pool`, -1);
        return;
    }
    s.variants = Math.max(1, Math.min(8, Math.round(n)));
}
/** `active <a>to<b> [<a>to<b>…]` — hour windows, 0–24. */
function parseActive(ctx, s, v) {
    const windows = [];
    for (const tok of v.trim().split(/\s+/)) {
        const m = tok.match(/^(\d*\.?\d+)to(\d*\.?\d+)$/i);
        if (!m)
            continue;
        const a = Math.max(0, Math.min(24, parseFloat(m[1])));
        const b = Math.max(0, Math.min(24, parseFloat(m[2])));
        windows.push([a, b]);
    }
    if (!windows.length) {
        ctx.warnings.push({ message: '`active` needs hour windows like `4.5to9`', lineNumber: -1, severity: 'warning' });
        return;
    }
    s.activeHours = windows;
}
/**
 * `quiet <signal> <threshold> [<signal> <threshold>…]` — the signal level
 * above which the voice fades out. Open vocabulary: `rain` / `wind` from the
 * world's weather, or any scene control the `world` block defines (`quiet
 * traffic 0.9`). Thresholds are in the signal's own units (not clamped — a
 * control may run 0..100). A repeated signal keeps the last threshold.
 */
function parseQuiet(ctx, s, v) {
    const toks = v.trim().toLowerCase().split(/\s+/);
    const gates = [];
    for (let i = 0; i + 1 < toks.length; i += 2) {
        const signal = toks[i];
        const n = parseFloat(toks[i + 1]);
        if (!/^\w+$/.test(signal) || !isFinite(n))
            continue;
        const existing = gates.find(g => g.signal === signal);
        if (existing)
            existing.threshold = n;
        else
            gates.push({ signal, threshold: n });
    }
    if (!gates.length) {
        ctx.warnings.push({ message: '`quiet` needs `<signal> <threshold>` pairs, e.g. `quiet rain 0.5` or `quiet traffic 0.9`', lineNumber: -1, severity: 'warning' });
        return;
    }
    s.quietGates = gates;
}
// ============ PROPERTY DISPATCH ============
//
// A property is declared once, in `PROPERTIES` (Properties.ts). Its `parse`
// kind is either declarative (the field it writes) or `custom`, in which case
// the handler is registered here under the property's canonical name. The
// conformance test asserts the two tables agree. `unset` is what a group
// checks before handing its value to a child: "the child said nothing".
function parseWhen(ctx, s, v) {
    // `when <signal> <lo>to<hi>` — edge-triggered: the voice fires when the
    // signal ENTERS the band (and again only after leaving it + cooldown).
    // Turns any statement into a signal-triggered voice.
    const tokens = v.trim().split(/\s+/);
    const signal = (tokens[0] || '').toLowerCase();
    // Open vocabulary — built-ins plus any game-supplied setSignal channel.
    if (tokens.length < 2 || !/^\w+$/.test(signal)) {
        ctx.warn(`'when' needs a signal and a band, e.g. "when distance 0to3" (built-ins: ${KNOWN_SIGNALS.join(', ')}, or any game-supplied signal)`, -1);
        return;
    }
    const [lo, hi] = parseRange(tokens[1]);
    if (isNaN(lo) || isNaN(hi)) {
        ctx.warn(`'when ${signal}' has a malformed band: use numbers like 0to3`, -1);
        return;
    }
    s.whenCondition = { signal, min: Math.min(lo, hi), max: Math.max(lo, hi) };
}
function parseEmit(ctx, s, v) {
    const name = v.trim().toLowerCase().split(/\s+/)[0] ?? '';
    if (/^\w+$/.test(name))
        s.emit = name;
    else
        ctx.warn(`'emit' needs an event name (letters, digits, _), e.g. "emit horn"`, -1);
}
function parseAuthoringId(ctx, s, v, field, property) {
    if (/^[a-zA-Z0-9_.-]{1,128}$/.test(v))
        s[field] = v;
    else
        ctx.warn(`${property} requires a stable identifier (letters, digits, _, . or -)`, -1);
}
function parseAttach(ctx, s, v) {
    const ref = v.trim().toLowerCase().split(/\s+/)[0] ?? '';
    if (/^\w+$/.test(ref))
        s.attachRef = ref;
    else
        ctx.warn(`'attach' needs a target: another voice's clip token or "listener", e.g. "attach ferry"`, -1);
}
/** `follow <ref> [offset x y z]` — the LINE-key form. (The VALUE form `volume follow …` is dispatched by key.) */
function parseFollowTarget(ctx, s, v) {
    const m = v.trim().match(/^(\w+)(?:\s+offset\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+))?\s*$/i);
    if (!m) {
        ctx.warn(`'follow' needs a target and optional offset, e.g. "follow porter offset 0 0 -1.5"`, -1);
        return;
    }
    s.followTarget = {
        ref: m[1].toLowerCase(),
        offset: m[2] !== undefined
            ? { x: parseFloat(m[2]), y: parseFloat(m[3]), z: parseFloat(m[4]) }
            : { x: 0, y: 0, z: 0 },
    };
}
function parsePace(ctx, s, v) {
    if (isFollow(v))
        s.paceFollow = parseFollow(ctx, 'pace', v);
    else
        ctx.warnings.push({ message: '`pace` takes the follow form: `pace follow temp 10to30 3to0.6`', lineNumber: -1, severity: 'warning' });
}
/** `voice <id>` — render this voice as SPEECH with the named upstream voice (an opaque provider handle, so only the shape is checked). */
function parseVoiceId(ctx, s, v) {
    const id = v.trim();
    if (!id) {
        ctx.warn(`'voice' needs a speech voice id, e.g. "voice JBFqnCBsd6RMkjVDRZzb"`, -1);
        return;
    }
    if (!/^[A-Za-z0-9]{8,40}$/.test(id)) {
        ctx.warn(`'voice ${id}' is not a voice id (letters and digits, 8-40 characters), ignored`, -1);
        return;
    }
    s.voiceId = id;
}
/** `zone <name> [name…] [strict]` — open scene-state names; `strict` mutes outside the zone instead of occluding. */
function parseZone(ctx, s, v) {
    const names = v.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const strictIdx = names.indexOf('strict');
    if (strictIdx >= 0) {
        s.zoneStrict = true;
        names.splice(strictIdx, 1);
    }
    if (names.length === 0) {
        ctx.warn(`'zone' needs at least one state name, e.g. "zone forest porch" or "zone cabin strict"`, -1);
        return;
    }
    s.zones = names;
}
/** `in <room>` — acoustic membership in a declared room (first token only; room names are single words). */
function parseIn(ctx, s, v) {
    const name = v.trim().toLowerCase().split(/\s+/)[0] ?? '';
    if (name)
        s.roomName = name;
    else
        ctx.warn(`'in' needs a room name, e.g. "in kitchen"`, -1);
}
/** `heard_in <signal> <dB>[, <signal> <dB>…]`: a per-soundscape level, weighted by each signal (spec 012). */
export function parseHeardIn(v) {
    const out = [];
    for (const part of v.split(',')) {
        const m = part.trim().match(/^(!?)([a-z_][a-z0-9_]*)\s+([+-]?\d+(?:\.\d+)?)$/i);
        if (!m)
            return null;
        out.push({ signal: m[2].toLowerCase(), invert: m[1] === '!', db: Math.max(-60, Math.min(24, Number(m[3]))) });
    }
    return out.length ? out : null;
}
/** The text `heard_in` is written as (the inverse of `parseHeardIn`). */
export function formatHeardIn(list) {
    return list.map(e => `${e.invert ? '!' : ''}${e.signal} ${Math.round(e.db * 10) / 10}`).join(', ');
}
/** Handlers for every `parse: { kind: 'custom' }` property, by canonical name. */
const CUSTOM_PROPERTY_PARSERS = {
    heard_in: { parse: (ctx, s, v) => {
            const list = parseHeardIn(v);
            if (list)
                s.heardIn = list;
            else
                ctx.warn(`'heard_in' takes a signal and a dB, e.g. "heard_in indoors -12" or "heard_in !indoors -6, in_shrine -14"`, -1);
        }, unset: s => s.heardIn === null },
    gen_key: { parse: (ctx, s, v) => {
            if (/^[a-zA-Z0-9_-]{1,128}$/.test(v))
                s.genKey = v;
            else
                ctx.warn('gen_key requires 1–128 letters, digits, underscores or hyphens', -1);
        }, unset: s => s.genKey === null },
    recordings: { parse: (ctx, s, v) => {
            try {
                s.recordings = parseRecordingBanks(v, pathFor);
            }
            catch (error) {
                // A malformed supplied bank must never fall through to a paid generation path.
                s.recordings = { takes: [] };
                ctx.warn(`Invalid recordings: ${error instanceof Error ? error.message : 'invalid bank'}. This source is silent until corrected.`, -1);
            }
        }, unset: s => s.recordings === null },
    distance_model: { parse: (ctx, s, v) => {
            if (v === 'legacy_v1' || v === 'free_field_v1')
                s.distanceProfile = v;
            else
                ctx.warn('distance_model requires legacy_v1 or free_field_v1', -1);
        }, unset: s => s.distanceProfile === null },
    program: { parse: (ctx, s, v) => parseAuthoringId(ctx, s, v, 'programId', 'program'), unset: s => s.programId === null },
    source_id: { parse: (ctx, s, v) => parseAuthoringId(ctx, s, v, 'sourceId', 'source_id'), unset: s => s.sourceId === null },
    catalog_ref: { parse: (ctx, s, v) => parseAuthoringId(ctx, s, v, 'catalogRef', 'catalog_ref'), unset: s => s.catalogRef === null },
    source_role: { parse: (ctx, s, v) => {
            if (v === 'ambience' || v === 'source')
                s.sourceRole = v;
            else
                ctx.warn('source_role requires ambience or source', -1);
        }, unset: s => s.sourceRole === null },
    spl: { parse: parseSpl, unset: s => s.spl.isNull && !s.splFollow },
    end: { parse: (_ctx, s, v) => parseEnd(s, v), unset: s => s.end.isNull },
    place: { parse: parsePlace, unset: s => !s.hasPlacement },
    move: { parse: parseMove, unset: s => s.wanderType === WanderType.None },
    scatter: { parse: parseScatter, unset: s => !s.scatter },
    voice: { parse: parseVoiceId, unset: s => s.voiceId === null },
    zone: { parse: parseZone, unset: s => !s.zones },
    in: { parse: parseIn, unset: s => !s.roomName },
    occlusion: { parse: parseOcclusion, unset: s => !s.occlusionFollow && s.occlusionBase === 0 },
    variants: { parse: parseVariants, unset: s => s.variants === 1 },
    doppler: { parse: parseDoppler, unset: s => s.dopplerStrength === 1 },
    when: { parse: parseWhen, unset: s => s.whenCondition === null },
    emit: { parse: parseEmit, unset: s => !s.emit },
    influence: { parse: (_ctx, s, v) => parseInfluence(s, v), unset: s => s.genInfluence.isNull },
    visual: { parse: parseVisual, unset: s => s.visual.length === 0 },
    color: { parse: (_ctx, s, v) => parseColor(s, v), unset: () => false }, // groups merge color bespokely (`group: 'special'`)
    alpha: { parse: parseAlpha, unset: s => !s.colorAlphaInterpolation && s.staticAlpha === 1 },
    background: { parse: (_ctx, s, v) => parseBackground(s, v), unset: s => !s.background },
    reverb: { parse: (_ctx, s, v) => parseReverb(s, v), unset: s => !s.reverbParams },
    delay: { parse: (_ctx, s, v) => parseDelay(s, v), unset: s => !s.delayParams },
    filter: { parse: (_ctx, s, v) => parseFilter(s, v), unset: s => !s.filterParams },
    distortion: { parse: (_ctx, s, v) => parseDistortion(s, v), unset: s => !s.distortionParams },
    eq: { parse: (_ctx, s, v) => parseEQ(s, v), unset: s => !s.eqParams },
    attach: { parse: parseAttach, unset: s => s.attachRef === null },
    follow: { parse: parseFollowTarget, unset: s => s.followTarget === null },
    at: { parse: parseAt, unset: s => !s.hostRef },
    active: { parse: parseActive, unset: s => !s.activeHours },
    pace: { parse: parsePace, unset: s => !s.paceFollow },
    quiet: { parse: parseQuiet, unset: s => !s.quietGates.length },
};
/** The custom handlers' names — the conformance test checks them against the registry. */
export const CUSTOM_PROPERTY_NAMES = new Set(Object.keys(CUSTOM_PROPERTY_PARSERS));
/** Apply one property value to a statement, by its registry declaration. */
function applyProperty(ctx, s, spec, v) {
    const k = spec.parse;
    switch (k.kind) {
        case 'flag':
            s[k.field] = true;
            break;
        case 'range':
            s[k.field] = RangeOrValue.parse(v);
            break;
        case 'modulated':
            // Size is a played parameter: `radius fade 2 40 every 20` grows the
            // source from a point to something you stand inside.
            if (hasModulation(v))
                s[k.interpolation] = InterpolationData.parse(v);
            else
                s[k.field] = RangeOrValue.parse(v);
            break;
        case 'bound':
            if (isFollow(v))
                s[k.follow] = parseFollow(ctx, spec.name, v);
            else if (hasModulation(v))
                s[k.interpolation] = InterpolationData.parse(v);
            else
                s[k.field] = RangeOrValue.parse(v);
            break;
        case 'scalar': {
            const n = parseScalarProp(ctx, spec.name, v);
            if (n === null)
                ctx.warn(k.hint, -1);
            else
                s[k.field] = n;
            break;
        }
        case 'custom': {
            const handler = CUSTOM_PROPERTY_PARSERS[spec.name];
            if (!handler)
                throw new Error(`property '${spec.name}' is declared custom but has no registered parser`);
            handler.parse(ctx, s, v);
            break;
        }
    }
}
/** Whether a statement left this property unset — the condition for a group's value to apply. */
function propertyUnset(s, spec) {
    const k = spec.parse;
    switch (k.kind) {
        case 'flag': return !s[k.field];
        case 'range': return k.unset === 'zero-singleton' ? s[k.field] === RangeOrValue.Zero : s[k.field].isNull;
        case 'modulated': return s[k.field].isNull && !s[k.interpolation];
        case 'bound': return s[k.field].isNull && !s[k.interpolation] && !s[k.follow];
        case 'scalar': return s[k.field] === new Statement()[k.field];
        case 'custom': return CUSTOM_PROPERTY_PARSERS[spec.name]?.unset(s) ?? false;
    }
}
function parseSingle(ctx, block, srcLines) {
    const m = block.match(StmtRx);
    if (!m?.groups)
        throw new SatieSyntaxError('Failed to match statement pattern', null, block, null, srcLines?.[0] ? srcLines[0].origin + 1 : undefined);
    const s = new Statement();
    s.statementId = _nextStatementId++;
    const head = m.groups.kind.toLowerCase();
    const onMatch = head.match(/^on\s+(\w+)$/);
    if (onMatch)
        s.eventName = onMatch[1];
    s.kind = onMatch ? 'trigger' : head === 'oneshot' ? 'oneshot' : 'loop';
    s.clip = m.groups.clip.trim();
    // `gen` is a keyword, never a clip. A bare `loop gen` (mid-typing in the
    // live editor, or a missing description) used to fall through as a voice
    // whose clip is literally "gen" — a phantom the engine then reported as
    // "Audio not found: gen". Failing the parse instead means the live editor
    // keeps the previous scene and Monaco shows a real validation message.
    if (s.clip.toLowerCase() === 'synth') {
        throw new SatieSyntaxError('synth needs a description: e.g. "loop synth low warm drone"', 'synth', block.trim().split('\n')[0]);
    }
    if (s.clip.toLowerCase() === 'gen') {
        throw new SatieSyntaxError('gen needs a sound description: e.g. "loop gen deep drone"', 'gen', block.trim().split('\n')[0]);
    }
    s.count = m.groups.count ? parseInt(m.groups.count, 10) : 1;
    if (!Number.isSafeInteger(s.count) || s.count > MAX_STATEMENT_COPIES) {
        throw new Error(`Statement count exceeds ${MAX_STATEMENT_COPIES} copies. Reduce the N * prefix.`);
    }
    // `on <event>` — a trigger voice: fired by the runtime event bus, never
    // self-scheduled. The event name is an OPEN string; the emitter side (body
    // physics, perception layer, UI) decides what exists.
    if (m.groups.e1) {
        s.every = RangeOrValue.range(parseFloat(m.groups.e1), parseFloat(m.groups.e2));
    }
    else if (m.groups.e) {
        s.every = RangeOrValue.single(parseFloat(m.groups.e));
    }
    const propsBlock = stripBlockComments(m.groups.block || '');
    // Map each property line back to its source: propsBlock line k came from
    // srcLines[k + headerLines]. The header usually spans one line, but its
    // trailing `\s*` swallows whitespace-only lines (blanked comments), so the
    // real block offset comes from the match indices rather than assumption.
    const blockStartOffset = m
        .indices?.groups?.block?.[0];
    let headerLines = 1;
    if (blockStartOffset !== undefined) {
        headerLines = 0;
        for (let ci = 0; ci < blockStartOffset; ci++)
            if (block.charCodeAt(ci) === 10)
                headerLines++;
    }
    let scanPos = 0;
    let scanLine = 0;
    const blockLineOf = (charIndex) => {
        while (scanPos < charIndex) {
            if (propsBlock.charCodeAt(scanPos) === 10)
                scanLine++;
            scanPos++;
        }
        return scanLine;
    };
    let propMatch;
    const propRx = /^[ \t]*(?<key>\w+)(?:[ \t]+(?<val>[^\r\n]+))?/gm;
    while ((propMatch = propRx.exec(propsBlock)) !== null) {
        const k = propMatch.groups.key.toLowerCase();
        const isFlag = STANDALONE_FLAGS.has(k);
        const v = (!isFlag && propMatch.groups.val) ? propMatch.groups.val.trim() : '';
        const srcOfProp = srcLines?.[blockLineOf(propMatch.index) + headerLines];
        ctx.propOrigin = srcOfProp ? srcOfProp.origin : -2;
        if (srcOfProp && srcOfProp.origin >= 0) {
            s.propertySpans.set(k, { line: srcOfProp.origin, origin: srcOfProp.inline ? 'inline' : 'own' });
        }
        const spec = propertySpec(k);
        if (spec)
            applyProperty(ctx, s, spec, v);
        else {
            // Unknown property — try to suggest a correction
            const suggestion = suggestProperty(k);
            ctx.warn(suggestion ? `Unknown property '${k}'. Did you mean '${suggestion}'?` : `Unknown property '${k}'`, -1, suggestion);
        }
    }
    ctx.propOrigin = -2;
    // `when` turns a oneshot into a signal-triggered voice (loops keep playing
    // continuously — a condition-gated loop is not a thing yet).
    if (s.whenCondition) {
        if (s.kind === 'oneshot')
            s.kind = 'trigger';
        else if (s.kind === 'loop') {
            ctx.warn(`'when' only applies to oneshot or 'on' voices, ignored on a loop`, -1);
            s.whenCondition = null;
        }
    }
    // Trigger voices fire from events/conditions, never from a timer.
    if (s.kind === 'trigger' && !s.every.isNull) {
        ctx.warn(`'${s.eventName ? `on ${s.eventName}` : 'when'}' voices fire from their event: 'every' is ignored`, -1);
        s.every = RangeOrValue.Null;
    }
    return s;
}
/**
 * `noise <0–1>` inside a `move` value — one regex for all five call sites.
 * The range alternative is matched so that `move walk noise 0.2to0.5` reports a
 * clear diagnostic instead of leaving `to0.5` stranded, which used to make the
 * whole `move` fail with a misleading "Invalid move syntax" error.
 */
const NOISE_RX = /\bnoise\s+(-?[\d.]+(?:\s*to\s*-?[\d.]+)?)/i;
/** Clamp a matched `noise` argument to 0–1, warning if a range was written. */
function noiseValue(ctx, raw) {
    if (looksLikeRange(raw)) {
        ctx.warn(`'move … noise' takes a single number, not a range, using ${parseFloat(raw)}. Ranges are not supported in this slot yet.`, -1);
    }
    return Math.max(0, Math.min(1, parseFloat(raw) || 0));
}
/** Does this value look like a `min`to`max` range? */
function looksLikeRange(v) {
    return /^-?[\d.]+\s*to\s*-?[\d.]+$/.test(v.trim());
}
/**
 * Parse a `scalar` property value, clamped to the range its spec declares.
 *
 * A range written here is NOT silently truncated to its minimum (the old
 * behavior) — it warns. Scalar slots are resolved once at parse time, and
 * `OfflineRenderer`, `USDZExporter` and `AdmExporter` each call `parse(script)`
 * independently, so sampling a range here with `Math.random` would desync the
 * exported ADM/USDZ position metadata from the rendered audio. Supporting
 * ranges in these slots needs a deterministic per-voice seed; until then the
 * author gets told rather than quietly given the minimum.
 */
function parseScalarProp(ctx, prop, v) {
    const trimmed = v.trim();
    if (looksLikeRange(trimmed)) {
        ctx.warn(`'${prop}' takes a single number, not a range, using ${parseFloat(trimmed)}. Ranges are not supported in this slot yet.`, -1);
    }
    const n = parseFloat(trimmed);
    if (isNaN(n))
        return null;
    const clamp = propertySpec(prop)?.clamp;
    return clamp ? Math.max(clamp[0], Math.min(clamp[1], n)) : n;
}
/**
 * `spl <dB>` / `spl <a>to<b>` / `spl follow <signal> <in> <out> [pow k]` —
 * the source's emission level, dB SPL at 1 m (spatial/LevelModel.ts). Values
 * are clamped to the spec's range (0–140); a follow binding's outputs are
 * clamped by the engine when it maps them. Garbage warns and leaves the
 * statement uncalibrated rather than silently assuming a level.
 */
function parseSpl(ctx, s, v) {
    if (isFollow(v)) {
        s.splFollow = parseFollow(ctx, 'spl', v);
        return;
    }
    const r = RangeOrValue.parse(v);
    if (r.isNull) {
        ctx.warn(`'spl' takes the emission level in dB SPL at 1 m (0–140): a value, a range, or a follow binding, e.g. "spl 80", "spl 75to85", "spl follow velocity 0to18 40to85"`, -1);
        return;
    }
    const [lo, hi] = propertySpec('spl').clamp;
    const clampVal = (n) => Math.max(lo, Math.min(hi, n));
    s.spl = r.isRange ? RangeOrValue.range(clampVal(r.min), clampVal(r.max)) : RangeOrValue.single(clampVal(r.min));
}
/** Bare `doppler` keeps the physical strength (1); a value scales or disables it. */
function parseDoppler(ctx, s, v) {
    const d = parseScalarProp(ctx, 'doppler', v);
    s.dopplerStrength = d ?? 1;
}
function parseOcclusion(ctx, s, v) {
    if (isFollow(v)) {
        s.occlusionFollow = parseFollow(ctx, 'occlusion', v);
        return;
    }
    const o = parseScalarProp(ctx, 'occlusion', v);
    if (o === null)
        ctx.warn(`'occlusion' needs a 0..1 value or a follow binding`, -1);
    else
        s.occlusionBase = o;
}
function parseAlpha(ctx, s, v) {
    if (hasModulation(v)) {
        s.colorAlphaInterpolation = InterpolationData.parse(v);
        return;
    }
    const a = parseScalarProp(ctx, 'alpha', v);
    if (a !== null)
        s.staticAlpha = a;
}
function parseInfluence(s, v) {
    const inf = RangeOrValue.parse(v);
    if (inf.isNull)
        return;
    const clampVal = (n) => Math.max(0, Math.min(1, n));
    s.genInfluence = inf.isRange
        ? RangeOrValue.range(clampVal(inf.min), clampVal(inf.max))
        : RangeOrValue.single(clampVal(inf.min));
}
function parseEnd(s, v) {
    const timeMatch = v.match(/^(.+?)(?=\s+fade\s+|$)/i);
    if (timeMatch)
        s.end = RangeOrValue.parse(timeMatch[1].trim());
    const fadeMatch = v.match(/\bfade\s+(.+?)$/i);
    if (fadeMatch)
        s.endFade = RangeOrValue.parse(fadeMatch[1].trim());
}
const VALID_VISUAL_TOKENS = new Set(['trail', 'sphere', 'cube', 'none']);
function parseVisual(ctx, s, v) {
    if (!v.trim())
        return;
    // Support both "visual trail sphere" and legacy "visual trail and sphere"
    const cleaned = v.replace(/\band\b/gi, ' ');
    const tokens = cleaned.trim().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
        const lower = tokens[i].toLowerCase();
        if (!lower)
            continue;
        // `glyph <number>` — the visual size multiplier. Canonical spelling
        // (frees `size` from colliding with the transform `scale` and the DSP
        // param, scene-graph spec §9); `size` stays a permanent alias.
        if ((lower === 'glyph' || lower === 'size') && i + 1 < tokens.length) {
            const raw = tokens[i + 1];
            if (looksLikeRange(raw)) {
                ctx.warn(`'visual ${lower}' takes a single number, not a range, using ${parseFloat(raw)}. Ranges are not supported in this slot yet.`, -1);
            }
            const sizeVal = parseFloat(raw);
            if (!isNaN(sizeVal)) {
                s.visualSize = Math.max(0.01, Math.min(10, sizeVal));
                i++; // skip next token
                continue;
            }
        }
        // Only accept standard visual tokens
        if (VALID_VISUAL_TOKENS.has(lower)) {
            s.visual.push(lower);
        }
    }
}
/**
 * Build the rewrite hint for the removed comma dialect. Argument tokens are
 * copied through untouched, so a range argument rewrites as a range — every
 * numeric slot in the language takes `<n>` or `<min>to<max>` alike.
 */
function rewriteCommaForm(mode, args) {
    const a = args.split(',').map(t => t.trim()).filter(Boolean);
    let hint;
    if (mode === 'pos') {
        hint = `place ${a[0] ?? '0'} ${a[1] ?? '0'} ${a[2] ?? '0'}`;
    }
    else if (mode === 'fly') {
        hint = `move fly x ${a[0] ?? '-5to5'} y ${a[1] ?? '0to5'} z ${a[2] ?? '-5to5'}`
            + (a[3] ? ` speed ${a[3]}` : '');
    }
    else {
        hint = `move walk x ${a[0] ?? '-5to5'} z ${a[1] ?? '-5to5'}`
            + (a[2] ? ` speed ${a[2]}` : '');
    }
    return `Comma syntax has been removed from 'move'. Write instead: ${hint}`;
}
const SPEED_RX = /(?:at\s+)?speed\s+(.+?)(?=\s+(?:x|y|z|noise)\s+|$)/i;
const AXIS_BOUNDS_RX = /\b([xyz])\s+(-?[\d.]+)to(-?[\d.]+)/gi;
/** Default motion box: 10 m across, standing on the ground plane. */
function defaultMotionBounds() {
    return { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 5, z: 5 } };
}
/** Remove a `noise <n>` clause, recording it on the statement. */
function takeNoise(ctx, s, text) {
    const m = text.match(NOISE_RX);
    if (!m)
        return text;
    s.noise = noiseValue(ctx, m[1]);
    return (text.substring(0, m.index).trim() + ' ' + text.substring(m.index + m[0].length).trim()).trim();
}
/** Remove a `[at] speed <value|interpolation>` clause, recording it on the statement. */
function takeSpeed(s, text) {
    const m = text.match(SPEED_RX);
    if (!m)
        return { text, parsed: false };
    const speedInterp = InterpolationData.parse(m[1].trim());
    if (speedInterp) {
        s.moveSpeedInterpolation = speedInterp;
        s.wanderHz = RangeOrValue.single(speedInterp.minValue);
    }
    else {
        s.wanderHz = RangeOrValue.parse(m[1].trim());
    }
    return { text: (text.substring(0, m.index).trim() + ' ' + text.substring(m.index + m[0].length).trim()).trim(), parsed: true };
}
/** Remove `x AtoB` / `y AtoB` / `z AtoB` clauses; unstated axes keep the default box. */
function takeAxisBounds(text) {
    const { min, max } = defaultMotionBounds();
    const rest = text.replace(AXIS_BOUNDS_RX, (_m, axis, lo, hi) => {
        const a = axis.toLowerCase();
        min[a] = parseFloat(lo);
        max[a] = parseFloat(hi);
        return ' ';
    });
    return { min, max, text: rest.replace(/\s+/g, ' ').trim() };
}
/**
 * The modifiers every named motion accepts after its head word —
 * `noise`, `speed`, and per-axis bounds — recorded on the statement. Returns
 * the unconsumed text (a gen trajectory's description).
 */
function parseMotionModifiers(ctx, s, text) {
    const { min, max, text: rest } = takeAxisBounds(takeSpeed(s, takeNoise(ctx, s, text)).text);
    s.areaMin = min;
    s.areaMax = max;
    return rest;
}
function parseMove(ctx, s, v) {
    v = v.trim();
    // Semantic motion verbs (drift, dart, pass, …) — resolve to engine motion via
    // the shared Placement table. Bounds come from a prior `place`, else defaults.
    const verb = v.split(/\s+/)[0].toLowerCase();
    if (isSemanticMotion(verb)) {
        parseSemanticMove(ctx, s, verb, v.substring(verb.length).trim());
        return;
    }
    // The comma dialect (`move walk, -5to5, -5to5, 0.3`) is gone. Match it
    // narrowly — on the leading mode word, never on a bare comma — so a `move gen`
    // description may still contain commas as prose.
    const commaForm = v.match(/^(walk|fly|pos)\s*,(.*)$/is);
    if (commaForm) {
        throw new SatieSyntaxError(rewriteCommaForm(commaForm[1].toLowerCase(), commaForm[2]), 'move', v);
    }
    // `move path <name>` — an explicit reference to a declared `path` block.
    // The bare `move <name>` form also works for letter-leading identifiers;
    // this form is unambiguous and accepts any \w+ name (a path derived from a
    // numerically named clip, e.g. "1.wav" → p1_route, or a legacy 1_route).
    const pathRef = v.match(/^path\s+(\w+)\s*$/i);
    if (pathRef) {
        s.wanderType = WanderType.Custom;
        s.customTrajectoryName = pathRef[1].toLowerCase();
        return;
    }
    // Gen trajectory — "move gen <description> [speed X] [noise X] [x Xto X] [y ...] [z ...]"
    const genMatch = v.match(/^gen\s+(.+)$/i);
    if (genMatch) {
        // What remains after the modifiers is the description prompt.
        const description = parseMotionModifiers(ctx, s, genMatch[1]);
        s.wanderType = WanderType.Custom;
        s.customTrajectoryName = description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        s.isGenTrajectory = true;
        s.genTrajectoryPrompt = description;
        return;
    }
    // Trajectory types — named movement patterns (builtins + custom registry)
    const trajectoryMatch = v.match(/^(spiral|orbit|lorenz)\b\s*/i);
    if (trajectoryMatch) {
        const trajName = trajectoryMatch[1].toLowerCase();
        switch (trajName) {
            case 'spiral':
                s.wanderType = WanderType.Spiral;
                break;
            case 'orbit':
                s.wanderType = WanderType.Orbit;
                break;
            case 'lorenz':
                s.wanderType = WanderType.Lorenz;
                break;
        }
        parseMotionModifiers(ctx, s, v.substring(trajectoryMatch[0].length));
        return;
    }
    // Custom trajectory by name — check the registry for non-builtin trajectories
    const firstWord = v.split(/\s+/)[0].toLowerCase();
    if (!['walk', 'fly', 'gen'].includes(firstWord) && isTrajectoryName(firstWord) && !isBuiltinTrajectory(firstWord)) {
        s.wanderType = WanderType.Custom;
        s.customTrajectoryName = firstWord;
        parseMotionModifiers(ctx, s, v.substring(firstWord.length));
        return;
    }
    // New flexible syntax — detect and strip leading walk/fly keyword before axis parsing
    let detectedType = null;
    const typeMatch = v.match(/^(walk|fly)\b\s*/i);
    if (typeMatch) {
        detectedType = typeMatch[1].toLowerCase();
        v = v.substring(typeMatch[0].length);
    }
    // Noise applies to walk/fly/axis moves alike.
    v = takeNoise(ctx, s, v);
    let xMin = -5, xMax = 5, yMin = 0, yMax = 5, zMin = -5, zMax = 5;
    let speed = 1;
    let moveType = WanderType.None;
    let hasX = false, hasY = false, hasZ = false;
    const taken = takeSpeed(s, v);
    const speedParsed = taken.parsed;
    v = taken.text;
    if (speedParsed)
        speed = s.wanderHz.min;
    // Check for bare "walk" or "fly" (no axes remaining after stripping)
    if (!v.trim() || v.toLowerCase() === 'walk' || v.toLowerCase() === 'fly') {
        const isFly = detectedType === 'fly' || v.toLowerCase() === 'fly';
        if (isFly) {
            s.wanderType = WanderType.Fly;
            s.areaMin = { x: -5, y: 0, z: -5 };
            s.areaMax = { x: 5, y: 4, z: 5 };
        }
        else {
            s.wanderType = WanderType.Walk;
            s.areaMin = { x: -5, y: 0, z: -5 };
            s.areaMax = { x: 5, y: 0, z: 5 };
        }
        if (!speedParsed)
            s.wanderHz = RangeOrValue.single(speed);
        return;
    }
    // Remove "and" between axes
    v = v.replace(/\s+and\s+(?=(?:x|y|z)\s+)/gi, ' ');
    // Parse each axis
    const parseAxis = (axis, otherAxes) => {
        const axisRx = new RegExp(`${axis}\\s+(.+?)(?=\\s+(?:${otherAxes}|speed)\\s+|$)`, 'i');
        const match = v.match(axisRx);
        if (!match)
            return { min: -5, max: 5, minInterp: null, maxInterp: null, found: false };
        const axisValue = match[1].trim();
        let minVal = -5, maxVal = 5;
        let minInterp = null;
        let maxInterp = null;
        const rangeMatch = axisValue.match(/^(.+?)\s*to\s*(.+?)$/);
        if (rangeMatch && !axisValue.startsWith('goto') && !axisValue.startsWith('gobetween')) {
            const leftPart = rangeMatch[1].trim();
            const rightPart = rangeMatch[2].trim();
            const leftInterp = InterpolationData.parse(leftPart);
            const rightInterp = InterpolationData.parse(rightPart);
            minVal = leftInterp ? leftInterp.minValue : parseFloat(leftPart);
            maxVal = rightInterp ? rightInterp.minValue : parseFloat(rightPart);
            minInterp = leftInterp;
            maxInterp = rightInterp;
        }
        else {
            const interp = InterpolationData.parse(axisValue);
            if (interp) {
                minInterp = interp;
                maxInterp = interp;
                minVal = interp.minValue;
                maxVal = interp.maxValue;
            }
            else {
                [minVal, maxVal] = parseRange(axisValue);
            }
        }
        return { min: minVal, max: maxVal, minInterp, maxInterp, found: true };
    };
    const xResult = parseAxis('x', 'y|z');
    if (xResult.found) {
        hasX = true;
        xMin = xResult.min;
        xMax = xResult.max;
        s.moveXMinInterpolation = xResult.minInterp;
        s.moveXMaxInterpolation = xResult.maxInterp;
    }
    const yResult = parseAxis('y', 'x|z');
    if (yResult.found) {
        hasY = true;
        yMin = yResult.min;
        yMax = yResult.max;
        s.moveYMinInterpolation = yResult.minInterp;
        s.moveYMaxInterpolation = yResult.maxInterp;
    }
    const zResult = parseAxis('z', 'x|y');
    if (zResult.found) {
        hasZ = true;
        zMin = zResult.min;
        zMax = zResult.max;
        s.moveZMinInterpolation = zResult.minInterp;
        s.moveZMaxInterpolation = zResult.maxInterp;
    }
    // Determine movement type
    if (hasX && hasY && hasZ) {
        moveType = WanderType.Fly;
    }
    else if (hasX && hasZ && !hasY) {
        moveType = WanderType.Walk;
        yMin = 0;
        yMax = 0;
    }
    else if ((hasX && hasY) || (hasY && hasZ)) {
        moveType = WanderType.Fly;
        if (!hasX) {
            xMin = -5;
            xMax = 5;
        }
        if (!hasY) {
            yMin = 0;
            yMax = 5;
        }
        if (!hasZ) {
            zMin = -5;
            zMax = 5;
        }
    }
    else if (hasX || hasZ) {
        moveType = WanderType.Walk;
        yMin = 0;
        yMax = 0;
        if (!hasX) {
            xMin = 0;
            xMax = 0;
        }
        if (!hasZ) {
            zMin = 0;
            zMax = 0;
        }
    }
    else if (hasY) {
        // Height-band form ("move fly y 2to5") — keep the default horizontal spread
        moveType = WanderType.Fly;
    }
    if (moveType !== WanderType.None) {
        s.wanderType = moveType;
        s.areaMin = { x: xMin, y: yMin, z: zMin };
        s.areaMax = { x: xMax, y: yMax, z: zMax };
        if (!speedParsed)
            s.wanderHz = RangeOrValue.single(speed);
    }
    else if (detectedType === null && /^\w+/.test(v.trim())) {
        // Unrecognized name — treat as a pending custom trajectory (may match a gen block)
        const pendingName = v.trim().split(/\s+/)[0].toLowerCase();
        s.wanderType = WanderType.Custom;
        s.customTrajectoryName = pendingName;
        s.areaMin = { x: -5, y: 0, z: -5 };
        s.areaMax = { x: 5, y: 5, z: 5 };
    }
    else {
        throw new SatieSyntaxError("Invalid move syntax. Use 'move fly', 'move walk', or specify axes like 'move x -5to5 z -10to10'", 'move', v);
    }
}
/**
 * `place <sector> <depth> [height] [extent]` — semantic placement.
 * Tokens are order-independent; each resolves into a coordinate region.
 * Sets the region (areaMin/areaMax); makes the voice static unless a `move`
 * gives it motion. `place` always owns the region, so it wins over any bounds
 * a semantic `move` set, regardless of property order.
 */
/**
 * `scatter <shape> <dims…>` — the spawn distribution instances draw an
 * offset from. `box <hx> [hy] [hz]` (one number = a cube), `disc <r>`,
 * `sphere <r>`, `shell <inner> [outer]`. Unknown shapes and missing
 * dimensions warn and leave the voice unscattered rather than guessing a
 * size: a silently wrong scatter radius is a scene nobody can debug.
 */
function parseScatter(ctx, s, v) {
    const tokens = v.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shape = tokens[0] ?? '';
    if (!SCATTER_SHAPES.has(shape)) {
        ctx.warn(`'scatter' needs a shape first: one of ${[...SCATTER_SHAPES].join(', ')} (e.g. "scatter sphere 25")`, -1);
        return;
    }
    const nums = [];
    for (const t of tokens.slice(1)) {
        const n = parseFloat(t);
        if (isNaN(n)) {
            ctx.warn(`'scatter ${shape}' takes numbers in metres: '${t}' is not one`, -1);
            return;
        }
        nums.push(Math.max(0, Math.min(SCATTER_MAX_M, n)));
    }
    if (!nums.length) {
        ctx.warn(`'scatter ${shape}' needs a size in metres, e.g. "scatter ${shape} 25"`, -1);
        return;
    }
    // A box given one number is a cube; given two, the second is height and
    // depth. Every other shape reads only what it uses.
    const dims = shape === 'box'
        ? [nums[0], nums[1] ?? nums[0], nums[2] ?? nums[1] ?? nums[0]]
        : [nums[0], nums[1] ?? 0, 0];
    s.scatter = { shape: shape, dims };
}
function parsePlace(ctx, s, v) {
    const tokens = v.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // Numeric form: `place <x> <y> <z>` — exact coordinates. Written by the
    // viewport when a voice is dragged; also hand-writable for precise layouts.
    // Each axis takes a value OR a `min`to`max` range, like every other numeric
    // slot: `place 1to3 0 -2` is a static voice spread over a region, which is
    // what the removed `move pos, ...` form used to express.
    const NUM_OR_RANGE = /^-?\d+(\.\d+)?(to-?\d+(\.\d+)?)?$/;
    if (tokens.length === 3 && tokens.every(t => NUM_OR_RANGE.test(t))) {
        const [[xMin, xMax], [yMin, yMax], [zMin, zMax]] = tokens.map(parseRange);
        s.areaMin = { x: xMin, y: yMin, z: zMin };
        s.areaMax = { x: xMax, y: yMax, z: zMax };
        s.hasPlacement = true;
        if (s.wanderType === WanderType.None)
            s.wanderType = WanderType.Fixed;
        return;
    }
    let sector = null;
    let depth = null;
    let height = null;
    let extent = null;
    for (const t of tokens) {
        if (SECTORS.has(t))
            sector = t;
        else if (DEPTHS.has(t))
            depth = t;
        else if (HEIGHTS.has(t))
            height = t;
        else if (EXTENTS.has(t))
            extent = t;
        else
            ctx.warn(`Unknown place keyword '${t}'`, -1);
    }
    const { min, max } = resolvePlacement((sector ?? 'ahead'), (depth ?? 'mid'), (height ?? 'level'), (extent ?? 'narrow'));
    s.areaMin = min;
    s.areaMax = max;
    s.hasPlacement = true;
    if (s.wanderType === WanderType.None)
        s.wanderType = WanderType.Fixed;
    // An EXPLICIT `wide`/`surround` word is a statement about the SOURCE, not
    // just its roam region — "place left mid low wide" means a broad directional
    // bed, and rendering it as a point emitter inside a wide box is exactly the
    // "ambience from a single point" failure the extent model exists to kill.
    // Derive a source radius from the box (half the larger horizontal span) so
    // the author's word compiles into real width; an authored radius/ring/bed
    // wins regardless of property order (later lines overwrite, earlier lines
    // make this a no-op via the isNull guards). Motion-archetype DEFAULT regions
    // never do this — a darting bird roams a wide region but emits from a point.
    if ((extent === 'wide' || extent === 'surround' || sector === 'surround')
        && s.radius.isNull && s.ringRadius.isNull && !s.bed && !s.field) {
        const r = Math.round(Math.max(max.x - min.x, max.z - min.z) / 2 * 100) / 100;
        if (r > 0)
            s.radius = RangeOrValue.single(r);
    }
}
/**
 * Semantic motion verb (drift/dart/pass/…) → engine motion. Sets wanderType,
 * speed and noise from the archetype; uses the placed region for bounds, or the
 * archetype's default region when no `place` is present. Optional `speed`/`noise`
 * tokens override the archetype defaults; `pass` accepts a direction (lr/rl).
 */
function parseSemanticMove(ctx, s, verb, rest) {
    const spec = SEMANTIC_MOTIONS[verb];
    let r = rest;
    let customName = spec.customName;
    // Direction for `pass` (default left→right).
    if (verb === 'pass') {
        const dirMatch = r.match(/^(lr|rl|left-?to-?right|right-?to-?left|leftward|rightward|left|right)\b/i);
        if (dirMatch) {
            const d = dirMatch[1].toLowerCase();
            customName = (d === 'rl' || d.startsWith('right')) ? 'line_rl' : 'line_lr';
            r = r.substring(dirMatch[0].length).trim();
        }
    }
    // Optional noise override.
    let noise = spec.noise;
    const noiseMatch = r.match(NOISE_RX);
    if (noiseMatch) {
        noise = noiseValue(ctx, noiseMatch[1]);
        r = (r.substring(0, noiseMatch.index) + r.substring(noiseMatch.index + noiseMatch[0].length)).trim();
    }
    // Optional speed override (number or range).
    let hz = RangeOrValue.single(spec.hz);
    const speedMatch = r.match(/(?:at\s+)?speed\s+([\d.]+(?:to[\d.]+)?)/i);
    if (speedMatch) {
        hz = RangeOrValue.parse(speedMatch[1]);
    }
    s.wanderType = spec.wanderType;
    s.noise = noise;
    if (spec.wanderType === WanderType.Custom && customName) {
        s.customTrajectoryName = customName;
    }
    if (spec.wanderType !== WanderType.Fixed) {
        s.wanderHz = hz;
    }
    // Bounds: keep the placed region if one exists, else use the archetype default.
    if (!s.hasPlacement) {
        const { min, max } = defaultRegionFor(spec);
        s.areaMin = min;
        s.areaMax = max;
    }
}
function parseColor(s, v) {
    v = v.trim();
    if (!v)
        return;
    // Color modulation: fade/jump <colors...> every <dur> [loop bounce|restart]
    const modMatch = v.match(/^(fade|jump)\s+(.+?)\s+every\s+(\S+)(?:\s+loop\s+(bounce|restart))?$/i);
    if (modMatch) {
        const modType = modMatch[1].toLowerCase() === 'fade' ? ModulationType.Fade : ModulationType.Jump;
        const colorTokens = modMatch[2].trim().split(/\s+/);
        const every = RangeOrValue.parse(modMatch[3]);
        const loop = modMatch[4] ? modMatch[4].toLowerCase() : LoopMode.None;
        const rgbValues = [];
        for (const token of colorTokens) {
            const rgb = parseColorToken(token);
            if (rgb)
                rgbValues.push(rgb);
        }
        if (rgbValues.length >= 2) {
            s.colorRedInterpolation = new InterpolationData(rgbValues.map(c => c[0] / 255), every, modType, loop);
            s.colorGreenInterpolation = new InterpolationData(rgbValues.map(c => c[1] / 255), every, modType, loop);
            s.colorBlueInterpolation = new InterpolationData(rgbValues.map(c => c[2] / 255), every, modType, loop);
        }
        return;
    }
    // Named channel syntax: red fade 0 1 every 5 green 0.5 alpha fade 0 1 every 3
    if (v.includes('red ') || v.includes('green ') || v.includes('blue ') || v.includes('alpha ')) {
        const normalized = v.replace(/ and /g, ' ');
        const parseChannel = (channel, otherChannels) => {
            const rx = new RegExp(`${channel}\\s+(.+?)(?=\\s+(?:${otherChannels})\\s+|$)`, 'i');
            const match = normalized.match(rx);
            if (match)
                parseColorChannel(s, channel, match[1].trim());
        };
        parseChannel('red', 'green|blue|alpha');
        parseChannel('green', 'red|blue|alpha');
        parseChannel('blue', 'red|green|alpha');
        parseChannel('alpha', 'red|green|blue');
        return;
    }
    // Static: hex, rgb triple, grayscale or a named colour.
    const hex = parseColorValue(v);
    if (hex)
        s.staticColor = hex;
}
/** Parse `background` property — the same colour forms as `color` (hex, RGB, grayscale, named). */
function parseBackground(s, v) {
    const hex = parseColorValue(v);
    if (hex)
        s.background = hex;
}
function parseColorChannel(s, channelName, value) {
    const isAlpha = channelName.toLowerCase() === 'alpha';
    // Alpha: don't normalize 0-255 → 0-1, it's already 0-1
    if (isAlpha) {
        if (hasModulation(value)) {
            s.colorAlphaInterpolation = InterpolationData.parse(value);
        }
        else {
            const v = parseFloat(value);
            if (!isNaN(v))
                s.staticAlpha = Math.max(0, Math.min(1, v));
        }
        return;
    }
    if (hasModulation(value)) {
        let interp = InterpolationData.parse(value);
        if (interp) {
            // Normalize 0-255 to 0-1 if values are > 1
            const maxVal = Math.max(...interp.values);
            if (maxVal > 1) {
                interp = new InterpolationData(interp.values.map(v => v / 255), interp.every, interp.modulationType, interp.loopMode);
            }
            switch (channelName.toLowerCase()) {
                case 'red':
                    s.colorRedInterpolation = interp;
                    break;
                case 'green':
                    s.colorGreenInterpolation = interp;
                    break;
                case 'blue':
                    s.colorBlueInterpolation = interp;
                    break;
            }
        }
    }
    else {
        // Plain value or range (e.g. "128" or "0to255")
        // Store as a RangeOrValue so each voice can sample independently
        const range = RangeOrValue.parse(value);
        // Normalize 0-255 to 0-1
        const normalizedRange = (range.max > 1 || range.min > 1)
            ? (range.isRange ? RangeOrValue.range(range.min / 255, range.max / 255) : RangeOrValue.single(range.min / 255))
            : range;
        switch (channelName.toLowerCase()) {
            case 'red':
                s.colorRedRange = normalizedRange;
                break;
            case 'green':
                s.colorGreenRange = normalizedRange;
                break;
            case 'blue':
                s.colorBlueRange = normalizedRange;
                break;
        }
    }
}
// DSP effect parsers
function parseDSPParam(v, paramRx) {
    const match = v.match(paramRx);
    if (!match)
        return null;
    const val = match[1].trim();
    if (hasModulation(val))
        return { range: RangeOrValue.Null, interp: InterpolationData.parse(val) };
    return { range: RangeOrValue.parse(val), interp: null };
}
function parseReverb(s, v) {
    const wet = parseDSPParam(v, /\b(?:wet|drywet)\s+(.+?)(?=\s+(?:size|roomsize|damp|damping)\s+|$)/i);
    const size = parseDSPParam(v, /\b(?:size|roomsize)\s+(.+?)(?=\s+(?:wet|drywet|damp|damping)\s+|$)/i);
    const damp = parseDSPParam(v, /\b(?:damp|damping)\s+(.+?)(?=\s+(?:wet|drywet|size|roomsize)\s+|$)/i);
    s.reverbParams = {
        dryWet: wet?.range ?? RangeOrValue.single(0.33),
        roomSize: size?.range ?? RangeOrValue.single(0.5),
        damping: damp?.range ?? RangeOrValue.single(0.5),
        dryWetInterpolation: wet?.interp ?? null,
        roomSizeInterpolation: size?.interp ?? null,
        dampingInterpolation: damp?.interp ?? null,
    };
}
function parseDelay(s, v) {
    const wet = parseDSPParam(v, /\b(?:wet|drywet)\s+(.+?)(?=\s+(?:time|feedback|pingpong)\s+|$)/i);
    const time = parseDSPParam(v, /\btime\s+(.+?)(?=\s+(?:wet|drywet|feedback|pingpong)\s+|$)/i);
    const fb = parseDSPParam(v, /\bfeedback\s+(.+?)(?=\s+(?:wet|drywet|time|pingpong)\s+|$)/i);
    const pp = parseDSPParam(v, /\bpingpong\s+(.+?)(?=\s+(?:wet|drywet|time|feedback)\s+|$)/i);
    s.delayParams = {
        dryWet: wet?.range ?? RangeOrValue.single(0.5),
        time: time?.range ?? RangeOrValue.single(0.375),
        feedback: fb?.range ?? RangeOrValue.single(0.5),
        pingPong: pp ? pp.range.sample() > 0.5 : false,
        dryWetInterpolation: wet?.interp ?? null,
        timeInterpolation: time?.interp ?? null,
        feedbackInterpolation: fb?.interp ?? null,
    };
}
function parseFilter(s, v) {
    // Support both 'filter lowpass ...' (new) and 'filter mode lowpass ...' (legacy)
    const directModeMatch = v.match(/^(lowpass|highpass|bandpass|notch|peak)\b/i);
    const legacyModeMatch = v.match(/\bmode\s+(lowpass|highpass|bandpass|notch|peak)/i);
    const mode = directModeMatch ? directModeMatch[1].toLowerCase() :
        legacyModeMatch ? legacyModeMatch[1].toLowerCase() : 'lowpass';
    const cutoff = parseDSPParam(v, /\b(?:cutoff|freq)\s+(.+?)(?=\s+(?:mode|resonance|q|wet|drywet|lowpass|highpass|bandpass|notch|peak)\s+|$)/i);
    const res = parseDSPParam(v, /\b(?:resonance|q)\s+(.+?)(?=\s+(?:mode|cutoff|freq|wet|drywet|lowpass|highpass|bandpass|notch|peak)\s+|$)/i);
    const wet = parseDSPParam(v, /\b(?:wet|drywet)\s+(.+?)(?=\s+(?:mode|cutoff|freq|resonance|q|lowpass|highpass|bandpass|notch|peak)\s+|$)/i);
    s.filterParams = {
        mode,
        cutoff: cutoff?.range ?? RangeOrValue.single(0.5), // 0-1, maps to ~632Hz
        resonance: res?.range ?? RangeOrValue.single(0.25), // 0-1, maps to ~Q 1.2
        dryWet: wet?.range ?? RangeOrValue.single(1),
        cutoffInterpolation: cutoff?.interp ?? null,
        resonanceInterpolation: res?.interp ?? null,
        dryWetInterpolation: wet?.interp ?? null,
    };
}
function parseDistortion(s, v) {
    // Support both 'distortion softclip ...' (new) and 'distortion mode softclip ...' (legacy)
    const directModeMatch = v.match(/^(softclip|hardclip|tanh|cubic|asymmetric)\b/i);
    const legacyModeMatch = v.match(/\bmode\s+(softclip|hardclip|tanh|cubic|asymmetric)/i);
    const mode = directModeMatch ? directModeMatch[1].toLowerCase() :
        legacyModeMatch ? legacyModeMatch[1].toLowerCase() : 'softclip';
    const drive = parseDSPParam(v, /\bdrive\s+(.+?)(?=\s+(?:mode|wet|drywet|softclip|hardclip|tanh|cubic|asymmetric)\s+|$)/i);
    const wet = parseDSPParam(v, /\b(?:wet|drywet)\s+(.+?)(?=\s+(?:mode|drive|softclip|hardclip|tanh|cubic|asymmetric)\s+|$)/i);
    s.distortionParams = {
        mode,
        drive: drive?.range ?? RangeOrValue.single(0.3), // 0-1, maps to ~drive 3.6
        dryWet: wet?.range ?? RangeOrValue.single(1),
        driveInterpolation: drive?.interp ?? null,
        dryWetInterpolation: wet?.interp ?? null,
    };
}
function parseEQ(s, v) {
    const low = parseDSPParam(v, /\blow\s+(.+?)(?=\s+(?:mid|high)\s+|$)/i);
    const mid = parseDSPParam(v, /\bmid\s+(.+?)(?=\s+(?:low|high)\s+|$)/i);
    const high = parseDSPParam(v, /\bhigh\s+(.+?)(?=\s+(?:low|mid)\s+|$)/i);
    s.eqParams = {
        lowGain: low?.range ?? RangeOrValue.single(0.5), // 0-1, 0.5 = 0dB (flat)
        midGain: mid?.range ?? RangeOrValue.single(0.5),
        highGain: high?.range ?? RangeOrValue.single(0.5),
        lowGainInterpolation: low?.interp ?? null,
        midGainInterpolation: mid?.interp ?? null,
        highGainInterpolation: high?.interp ?? null,
    };
}
// Flush group properties into children
function flushGroup(ctx, dst, g) {
    const hasVol = g.props.has('volume');
    const hasPitch = g.props.has('pitch');
    const hasColor = g.props.has('color');
    let groupVolInterp = null;
    let groupPitchInterp = null;
    let groupVolFollow = null;
    let groupPitchFollow = null;
    let gVolRange = RangeOrValue.One;
    let gPitchRange = RangeOrValue.One;
    if (hasVol) {
        const vRaw = g.props.get('volume').val;
        if (isFollow(vRaw))
            groupVolFollow = parseFollow(ctx, 'volume', vRaw);
        else if (hasModulation(vRaw))
            groupVolInterp = InterpolationData.parse(vRaw);
        else
            gVolRange = RangeOrValue.parse(vRaw);
    }
    if (hasPitch) {
        const pRaw = g.props.get('pitch').val;
        if (isFollow(pRaw))
            groupPitchFollow = parseFollow(ctx, 'pitch', pRaw);
        else if (hasModulation(pRaw))
            groupPitchInterp = InterpolationData.parse(pRaw);
        else
            gPitchRange = RangeOrValue.parse(pRaw);
    }
    // Group color
    let groupColorR = null;
    let groupColorG = null;
    let groupColorB = null;
    let groupStaticColor = null;
    if (hasColor) {
        const tempStmt = new Statement();
        parseColor(tempStmt, g.props.get('color').val);
        groupStaticColor = tempStmt.staticColor;
        groupColorR = tempStmt.colorRedInterpolation;
        groupColorG = tempStmt.colorGreenInterpolation;
        groupColorB = tempStmt.colorBlueInterpolation;
    }
    for (const s of g.children) {
        // Signal bindings inherit as defaults — a child's own binding wins.
        if (groupVolFollow && !s.volumeFollow)
            s.volumeFollow = groupVolFollow;
        if (groupPitchFollow && !s.pitchFollow)
            s.pitchFollow = groupPitchFollow;
        // Group modulation is ALWAYS a separate multiplier on top of the child's
        // own volume/pitch — interpolated or static. It used to be assigned as
        // the child's own interpolation when the child had none, but a voice's
        // interpolation REPLACES its static value, so a group-level
        // `volume fade 0 1 every 20` (a scene fade-in) silently discarded every
        // child's authored mix level and converged the whole group to full scale.
        if (groupVolInterp)
            s.groupVolumeModulation = groupVolInterp;
        if (groupPitchInterp)
            s.groupPitchModulation = groupPitchInterp;
        if (hasColor) {
            if (groupStaticColor && !s.staticColor)
                s.staticColor = groupStaticColor;
            if (groupColorR && !s.colorRedInterpolation)
                s.colorRedInterpolation = groupColorR;
            if (groupColorG && !s.colorGreenInterpolation)
                s.colorGreenInterpolation = groupColorG;
            if (groupColorB && !s.colorBlueInterpolation)
                s.colorBlueInterpolation = groupColorB;
        }
        // Volume and pitch multiply with group values (sample per statement for unique randoms)
        const gVol = gVolRange.sample();
        const gPitch = gPitchRange.sample();
        if (hasVol && !groupVolInterp) {
            s.volume = !s.volume.isNull ? s.volume.mul(gVol) : RangeOrValue.single(gVol);
        }
        if (hasPitch && !groupPitchInterp) {
            s.pitch = !s.pitch.isNull ? s.pitch.mul(gPitch) : RangeOrValue.single(gPitch);
        }
        // Every other group property applies by its registry rule: a flag ORs
        // into the child, a value applies only when the child said nothing
        // (`propertyUnset` — the declaration's own notion of unset, e.g. `start`'s
        // Zero singleton). Volume, pitch and color were merged above.
        for (const [key, entry] of g.props) {
            const spec = propertySpec(key);
            if (spec && spec.group !== 'none' && spec.group !== 'multiply' && spec.group !== 'special') {
                if (spec.parse.kind === 'flag' || propertyUnset(s, spec))
                    applyProperty(ctx, s, spec, entry.val);
            }
            // Provenance: a group value the child did not state itself anchors to
            // the GROUP's line — the inspector shows it as inherited, and a per-voice
            // override knows it must write a new own-block line, not edit the group.
            if (entry.origin >= 0 && !s.propertySpans.has(key)) {
                s.propertySpans.set(key, { line: entry.origin, origin: 'group' });
            }
        }
        dst.push(s);
    }
}
// ============ AND PRE-PASS ============
/**
 * Pre-pass: expand ` and <keyword>` into indented newlines.
 * `and` is only treated as a separator when followed by a property keyword.
 * e.g. `visual trail sphere` keeps `and` as literal since `sphere` is not a keyword.
 */
function expandAndSeparators(lines) {
    const result = [];
    for (const line of lines) {
        if (hasLiteralPropertyValue(line.text)) {
            result.push(line);
            continue;
        }
        const trimmed = line.text.trimStart();
        const indent = line.text.substring(0, line.text.length - trimmed.length);
        // Only expand on statement lines or indented property lines
        // Split on ` and ` where the next word is a property keyword
        // Use a global regex to find all ` and <word>` occurrences and split at keyword ones
        const parts = [];
        const andRx = /\s+and\s+(\w+)/gi;
        let lastSplitEnd = 0;
        let m;
        while ((m = andRx.exec(trimmed)) !== null) {
            const nextWord = m[1].toLowerCase();
            if (PROPERTY_KEYWORDS.has(nextWord)) {
                parts.push(trimmed.substring(lastSplitEnd, m.index));
                lastSplitEnd = m.index + m[0].length - m[1].length; // keep the keyword
            }
        }
        parts.push(trimmed.substring(lastSplitEnd));
        if (parts.length === 1) {
            result.push(line);
        }
        else {
            // First part keeps original indent, subsequent parts get extra indent.
            // The carved-out parts keep the origin line and are flagged `inline` —
            // in the author's text they live inside an `and <key> …` clause.
            result.push(srcLine(indent + parts[0], line.origin, line.shared, line.inline));
            const propIndent = indent + (indent.length > 0 ? '  ' : '    ');
            for (let i = 1; i < parts.length; i++) {
                result.push(srcLine(propIndent + parts[i], line.origin, line.shared, true));
            }
        }
    }
    return result;
}
// ============ VARIABLE EXTRACTION & SUBSTITUTION ============
/** Words that cannot be used as variable names. */
const RESERVED_WORDS = new Set([
    'level_reference',
    ...PROPERTY_KEYWORDS,
    'loop', 'oneshot', 'on', 'group', 'endgroup', 'gen', 'synth', 'comment', 'endcomment', 'let',
    'entity', 'endentity',
    'and', 'in', 'as', 'for', 'ever', 'at', 'to', 'fade', 'follow',
    'walk', 'fly', 'fixed', 'spiral', 'orbit', 'lorenz',
    'fade', 'jump', 'bounce', 'restart',
    'x', 'y', 'z',
    'wet', 'drywet', 'size', 'roomsize', 'damping', 'damp', 'time',
    'feedback', 'pingpong', 'mode', 'cutoff', 'freq', 'resonance',
    'drive', 'low', 'mid', 'high', 'speed',
    'lowpass', 'highpass', 'bandpass', 'notch', 'peak',
    'softclip', 'hardclip', 'tanh', 'cubic', 'asymmetric',
    'red', 'green', 'blue', 'white', 'black', 'yellow', 'cyan', 'magenta', 'gray', 'grey',
    'sphere', 'trail', 'object', 'audio',
    // Reserved ahead of the acoustic-spaces work (rooms, portals, materials).
    // Without these, `room kitchen` is silently consumed as a variable definition
    // rather than reaching the statement dispatcher or the unrecognised-line warning.
    'room', 'portal', 'material', 'space', 'surface', 'listener', 'scene',
    // `soundscape <id>` blocks (spec 014): reserved so `soundscape crossing` is not read as a variable.
    'soundscape',
    // `mic <name>` blocks and their own lines — without these the bare-variable
    // pre-pass swallows `mic ears` as a variable definition before the scene
    // dispatcher ever sees it (the same trap `room` fell into).
    'mic', 'aim', 'format',
    'bus', 'send', 'absorption', 'scattering', 'transmission', 'rt60',
    // The procedural world block (engine/world/WorldBlock): `world <biome…>`.
    'world',
    // `path <name>` blocks and their own lines — reserved BEFORE use (the
    // `room kitchen` trap): without these the bare-variable pre-pass would
    // silently consume `path dock_run` as a variable definition and delete it.
    'path', 'waypoint', 'cycle', 'closed',
    // Visual blocks (core/SceneVisual.ts): the module fence and the node declarations.
    'module', 'endmodule', 'override', 'binding', 'automation',
]);
/**
 * Extract variable definitions (`let name value` or bare `name value` at top level)
 * and substitute references in all other lines.
 *
 * Clip name positions in statement lines are protected from substitution.
 * Variable names cannot be reserved words.
 */
function extractAndSubstituteVariables(ctx, lines) {
    const vars = new Map();
    const varLineIndices = new Set();
    // Pass 1: collect variable definitions
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].text;
        const trimmed = line.trimStart();
        if (!trimmed || trimmed.startsWith('-'))
            continue;
        if (countIndent(line) > 0)
            continue; // variables must be top-level
        // Skip structural keywords
        if (/^(?:loop|oneshot|group|endgroup|entity|endentity|gen|comment|endcomment)\b/i.test(trimmed))
            continue;
        // `let name value` syntax
        let varMatch = trimmed.match(/^let\s+([a-zA-Z_]\w*)\s+(.+?)$/);
        if (!varMatch) {
            // Bare `name value` syntax — name must not be a reserved word.
            //
            // This form swallows ANY unrecognised two-token top-level line, so a typo
            // (`flurble 3`) or an unsupported statement keyword becomes a silent no-op:
            // the definition line is deleted here, long before the main loop's
            // "Unrecognised line" warning could ever see it. Reserved words alone can't
            // fix that — the set can never cover every typo — so the bare form warns.
            // `let` is the unambiguous spelling and stays silent.
            varMatch = trimmed.match(/^([a-zA-Z_]\w*)\s+(.+?)$/);
            if (varMatch && RESERVED_WORDS.has(varMatch[1].toLowerCase())) {
                varMatch = null;
            }
            else if (varMatch) {
                ctx.warn(`Reading '${varMatch[1]}' as a variable definition`, lines[i].origin + 1, `If that's intended, write 'let ${varMatch[1]} ${varMatch[2].trim()}'. If it was meant to be a statement or property, it is being ignored.`, 'info');
            }
        }
        if (varMatch) {
            vars.set(varMatch[1], varMatch[2].trim());
            varLineIndices.add(i);
        }
    }
    if (vars.size === 0)
        return lines;
    // Build a single regex matching any variable name (longest first for safety)
    const varNames = Array.from(vars.keys()).sort((a, b) => b.length - a.length);
    const varRx = new RegExp(`\\b(${varNames.map(escapeRegex).join('|')})\\b`, 'g');
    // Pass 2: substitute references, remove definition lines
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        if (varLineIndices.has(i))
            continue;
        if (hasLiteralPropertyValue(lines[i].text)) {
            result.push(lines[i]);
            continue;
        }
        let line = lines[i].text;
        const trimmed = line.trimStart();
        // For statement lines, protect the clip name from substitution
        const stmtMatch = trimmed.match(/^((?:\d+\s*\*\s*)?(?:loop|oneshot)\s+)(\S+)(.*)/i);
        if (stmtMatch) {
            const indent = line.substring(0, line.length - trimmed.length);
            const rest = stmtMatch[3].replace(varRx, (m) => vars.get(m) ?? m);
            line = indent + stmtMatch[1] + stmtMatch[2] + rest;
        }
        else {
            line = line.replace(varRx, (m) => vars.get(m) ?? m);
        }
        result.push(srcLine(line, lines[i].origin, lines[i].shared, lines[i].inline));
    }
    return result;
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ============ MULTI-CLIP EXPANSION ============
// ============ FOLDER NAMESPACES ============
//
// A folder of sounds is a NAMESPACE in a script: `yosemite/creek` is the
// sound "creek" in the folder "yosemite", and `yosemite/*` is every sound in
// it. The parser knows nothing about the database — the app registers each
// folder's contents here (its own folders at sign-in, a referenced public one
// on demand) and the parser expands `slug/*` into the multi-clip `and` form,
// so one folder line becomes one voice per sound, sharing the property block.
const FolderSlugRx = /^[a-z0-9][a-z0-9_]{0,39}$/;
/** Prefixes that look like `x/y` but are not folders. */
const RESERVED_NAMESPACES = new Set(['community', 'generation', 'audio']);
const folderRegistry = new Map();
/**
 * Register (or replace) the sound tokens of a folder, by slug — and the
 * folder's effects block (`dsp`: Satie property lines such as `eq low -3`,
 * `reverb wet 0.3 size 0.6`), which every voice playing one of its sounds
 * inherits as defaults (see `applyFolderDsp`).
 */
export function registerFolderContents(slug, tokens, dsp = '') {
    folderRegistry.set(slug.toLowerCase(), { tokens: tokens.map(t => t.toLowerCase()), dsp: dsp.trim() });
}
export function clearFolderRegistry() {
    folderRegistry.clear();
}
/** The registered sound tokens of a folder, or null when unknown. */
export function getRegisteredFolder(slug) {
    return folderRegistry.get(slug.toLowerCase())?.tokens ?? null;
}
/** The registered effects block of a folder; null when unknown or empty. */
export function getRegisteredFolderDsp(slug) {
    const dsp = folderRegistry.get(slug.toLowerCase())?.dsp;
    return dsp ? dsp : null;
}
/** Split `slug/sound` (or `slug/*`) into its parts; null for any other clip. */
export function parseFolderClip(clip) {
    const i = clip.indexOf('/');
    if (i <= 0 || i === clip.length - 1)
        return null;
    const slug = clip.slice(0, i).toLowerCase();
    if (RESERVED_NAMESPACES.has(slug) || !FolderSlugRx.test(slug))
        return null;
    const sound = clip.slice(i + 1);
    if (sound.includes('/'))
        return null;
    return { slug, sound };
}
/** Every folder slug a script references (`slug/sound` or `slug/*`), deduped. */
export function folderRefsIn(script) {
    const out = new Set();
    const rx = /^\s*(?:\d+\s*\*\s*)?(?:loop|oneshot)\s+(.+)$/gim;
    let m;
    while ((m = rx.exec(script))) {
        for (const tok of m[1].split(/\s+/)) {
            const ref = parseFolderClip(tok);
            if (ref)
                out.add(ref.slug);
        }
    }
    return [...out];
}
/**
 * Apply each referenced folder's effects block as DEFAULTS: a voice that
 * plays `slug/sound` gets the folder's `eq` / `filter` / `distortion` /
 * `delay` / `reverb` wherever it wrote none of its own — the same rule a
 * group uses for its children. The block is parsed once per folder through
 * the ordinary property parser (a synthetic statement), so its syntax is
 * exactly a script's. An unreadable block warns and is skipped.
 */
function applyFolderDsp(ctx, statements) {
    const templates = new Map();
    for (const st of statements) {
        const ref = parseFolderClip(st.clip);
        if (!ref)
            continue;
        const dsp = ctx.folders.get(ref.slug)?.dsp;
        if (!dsp)
            continue;
        let tpl = templates.get(ref.slug);
        if (tpl === undefined) {
            try {
                const block = `loop folder_dsp\n${dsp.split('\n').map(l => `    ${l.trim()}`).filter(l => l.trim()).join('\n')}`;
                tpl = parseSingle(ctx, block);
            }
            catch {
                ctx.warn(`Folder "${ref.slug}" has an effects block that could not be read; its voices play dry.`, 0);
                tpl = null;
            }
            templates.set(ref.slug, tpl);
        }
        if (!tpl)
            continue;
        if (!st.reverbParams && tpl.reverbParams)
            st.reverbParams = { ...tpl.reverbParams };
        if (!st.delayParams && tpl.delayParams)
            st.delayParams = { ...tpl.delayParams };
        if (!st.filterParams && tpl.filterParams)
            st.filterParams = { ...tpl.filterParams };
        if (!st.distortionParams && tpl.distortionParams)
            st.distortionParams = { ...tpl.distortionParams };
        if (!st.eqParams && tpl.eqParams)
            st.eqParams = { ...tpl.eqParams };
    }
}
/**
 * Rewrite `slug/*` clip tokens on statement headers into `slug/a and slug/b …`
 * from the registry. Unknown or empty folders are left as written — the
 * engine then reports "Audio not found: slug/*" for that voice.
 */
function expandFolderGlobs(ctx, lines) {
    return lines.map(line => {
        if (!line.text.includes('/*'))
            return line;
        const trimmed = line.text.trimStart();
        const header = trimmed.match(/^((?:\d+\s*\*\s*)?(?:loop|oneshot)\s+)(.+)$/i);
        if (!header)
            return line;
        const indent = line.text.substring(0, line.text.length - trimmed.length);
        const rest = header[2].replace(/(^|\s)([a-z0-9_]+)\/\*(?=\s|$)/gi, (whole, lead, slug) => {
            const ref = parseFolderClip(`${slug}/*`);
            const tokens = ref ? ctx.folders.get(ref.slug)?.tokens ?? null : null;
            if (!tokens || tokens.length === 0)
                return whole;
            return lead + tokens.map(t => `${ref.slug}/${t}`).join(' and ');
        });
        // Text-only rewrite; expandMultiClip flags the mint of sibling statements.
        return rest === header[2] ? line : srcLine(`${indent}${header[1]}${rest}`, line.origin, line.shared, line.inline);
    });
}
/**
 * Expand multi-clip `and` syntax into separate statements.
 *
 * `oneshot bird and rain and lizard every 5` becomes three separate oneshot statements.
 * `loop gen bird and gen rain every 5` becomes two separate gen statements.
 *
 * Each segment must be either a single word (plain clip) or start with `gen ` (gen clip).
 * If any segment is ambiguous, the line is left unchanged.
 */
function expandMultiClip(lines) {
    const result = [];
    let i = 0;
    while (i < lines.length) {
        const src = lines[i];
        const line = src.text;
        const trimmed = line.trimStart();
        const lineIndent = line.substring(0, line.length - trimmed.length);
        // Match statement header
        const headerMatch = trimmed.match(/^((?:\d+\s*\*\s*)?)(loop|oneshot)\s+(.+)$/i);
        if (headerMatch && headerMatch[3].includes(' and ')) {
            const countPrefix = headerMatch[1];
            const kind = headerMatch[2];
            let rest = headerMatch[3];
            // Strip every clause (value is a single non-space token like 5 or 5to10)
            let everyClause = '';
            const everyMatch = rest.match(/\s+every\s+\S+$/i);
            if (everyMatch) {
                everyClause = everyMatch[0];
                rest = rest.substring(0, rest.length - everyMatch[0].length);
            }
            // rest is now the clips area
            // If clips area starts with `gen `, only split on ` and gen ` or ` and <single-word>`
            // to avoid breaking multi-word gen prompts containing `and`
            const startsWithGen = rest.toLowerCase().startsWith('gen ');
            const segments = startsWithGen
                ? rest.split(/\s+and\s+(?=gen\s)/i) // only split before another `gen`
                : rest.split(/\s+and\s+/);
            // Validate: each segment is a single word (plain clip) or starts with `gen `
            const allValid = segments.length > 1 && segments.every(seg => {
                const s = seg.trim();
                return s.length > 0 && (!s.includes(' ') || s.toLowerCase().startsWith('gen '));
            });
            if (allValid) {
                // Collect indented property block
                const stmtIndent = countIndent(line);
                const block = [];
                let j = i + 1;
                while (j < lines.length && countIndent(lines[j].text) > stmtIndent) {
                    block.push(lines[j]);
                    j++;
                }
                // Emit one statement per clip. Every emitted line — header AND the
                // duplicated block — is flagged `shared`: one original line now
                // backs several statements, so a per-voice text edit must split it.
                for (const seg of segments) {
                    result.push(srcLine(`${lineIndent}${countPrefix}${kind} ${seg.trim()}${everyClause}`, src.origin, true, src.inline));
                    for (const blockLine of block) {
                        result.push(srcLine(blockLine.text, blockLine.origin, true, blockLine.inline));
                    }
                }
                i = j;
                continue;
            }
        }
        result.push(src);
        i++;
    }
    return result;
}
// ============ GEN BLOCK EXTRACTION ============
const GenBlockRx = /^gen\s+(\w+)\s*$/i;
/**
 * Pull every `gen <name>` block out of the line stream. One scan classifies
 * each block by its properties: a block naming any of `smoothing` /
 * `resolution` / `seed` / `ground` / `variation` is a TRAJECTORY gen, every
 * other one an AUDIO gen (`prompt`, `length`/`duration`, `influence`,
 * `loopable`). Both kinds share the head syntax; only the property set differs.
 */
const TRAJECTORY_GEN_KEYWORDS = new Set(['smoothing', 'smooth', 'resolution', 'seed', 'ground', 'variation']);
function readGenBlockProps(lines, from, blockIndent) {
    const props = [];
    let i = from;
    while (i < lines.length) {
        const lineIndent = countIndent(lines[i].text);
        const lineTrimmed = lines[i].text.trimStart();
        if (!lineTrimmed || lineTrimmed.startsWith('-')) {
            i++;
            continue;
        }
        if (lineIndent <= blockIndent)
            break;
        const propMatch = lineTrimmed.match(/^(\w+)(?:\s+(.+))?$/);
        if (propMatch)
            props.push({ key: propMatch[1].toLowerCase(), val: propMatch[2]?.trim() ?? '', origin: lines[i].origin });
        i++;
    }
    return { props, next: i };
}
function audioGenDefinition(name, props, headOrigin) {
    let prompt = '';
    let duration = RangeOrValue.Null;
    let influence = RangeOrValue.Null;
    let loopable = false;
    for (const { key, val } of props) {
        switch (key) {
            case 'prompt':
                prompt = val;
                break;
            // `length` is the canonical spelling — on a voice, `duration` means
            // playback length, and one word should mean one thing (scene-graph
            // spec §9). `duration` stays a permanent alias.
            case 'length':
            case 'duration':
                duration = RangeOrValue.parse(val);
                break;
            case 'influence':
                influence = RangeOrValue.parse(val);
                break;
            case 'loopable':
                loopable = true;
                break;
            default:
                console.warn(`[Satie] Unknown gen property '${key}' in gen block '${name}'`);
        }
    }
    if (!prompt) {
        throw new SatieSyntaxError(`Gen block '${name}' is missing a 'prompt' property`, 'prompt', null, `gen ${name}`, headOrigin + 1);
    }
    const clampDuration = (v) => clamp(v, 0.5, 22);
    if (!duration.isNull) {
        duration = duration.isRange
            ? RangeOrValue.range(clampDuration(duration.min), clampDuration(duration.max))
            : RangeOrValue.single(clampDuration(duration.min));
    }
    if (!influence.isNull) {
        influence = influence.isRange
            ? RangeOrValue.range(clamp01(influence.min), clamp01(influence.max))
            : RangeOrValue.single(clamp01(influence.min));
    }
    return { name, prompt, duration, influence, loopable };
}
function trajectoryGenDefinition(name, props, headOrigin) {
    let prompt = '';
    let duration = 30;
    let resolution = 8192;
    let smoothing = 0;
    let seed = 0;
    let ground = false;
    let variation = 0.5;
    for (const { key, val } of props) {
        switch (key) {
            case 'prompt':
                prompt = val;
                break;
            case 'duration': {
                const n = parseFloat(val);
                if (!isNaN(n))
                    duration = clamp(n, 1, 120);
                break;
            }
            case 'resolution': {
                const n = parseInt(val);
                if (!isNaN(n))
                    resolution = clamp(n, 256, 32768);
                break;
            }
            case 'smooth':
            case 'smoothing': {
                const n = parseFloat(val);
                if (!isNaN(n))
                    smoothing = clamp01(n);
                break;
            }
            case 'seed': {
                const n = parseInt(val);
                if (!isNaN(n))
                    seed = n;
                break;
            }
            case 'ground':
                ground = true;
                break;
            case 'variation': {
                const n = parseFloat(val);
                if (!isNaN(n))
                    variation = clamp01(n);
                break;
            }
            default:
                console.warn(`[Satie] Unknown trajectory gen property '${key}' in gen block '${name}'`);
        }
    }
    if (!prompt) {
        throw new SatieSyntaxError(`Trajectory gen block '${name}' is missing a 'prompt' property`, 'prompt', null, `gen ${name}`, headOrigin + 1);
    }
    return { name, prompt, duration, resolution, smoothing, seed, ground, variation };
}
function extractGenBlocks(lines) {
    const genDefs = new Map();
    const trajGenDefs = new Map();
    const remaining = [];
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].text.trimStart().match(GenBlockRx);
        if (!m) {
            remaining.push(lines[i]);
            i++;
            continue;
        }
        const name = m[1];
        const headOrigin = lines[i].origin;
        const { props, next } = readGenBlockProps(lines, i + 1, countIndent(lines[i].text));
        i = next;
        if (props.some(p => TRAJECTORY_GEN_KEYWORDS.has(p.key))) {
            trajGenDefs.set(name, trajectoryGenDefinition(name, props, headOrigin));
        }
        else {
            if (genDefs.has(name))
                console.warn(`[Satie] Duplicate gen definition '${name}' — last one wins`);
            genDefs.set(name, audioGenDefinition(name, props, headOrigin));
        }
    }
    return { genDefs, trajGenDefs, remaining };
}
// ============ MAIN PARSE FUNCTION ============
/**
 * Parse with warnings — returns both statements and non-fatal warnings.
 * This is the preferred parse function for editor integration.
 */
export function parseWithWarnings(script, options) {
    const ctx = new ParseContext(options?.folders ?? folderRegistry);
    const statements = parseScript(ctx, script);
    return {
        statements, warnings: ctx.warnings, materials: ctx.materials, rooms: ctx.rooms, soundscapes: ctx.soundscapes,
        mics: ctx.mics, world: ctx.world, entities: ctx.entities, paths: ctx.paths,
        modules: ctx.modules, overrides: ctx.overrides, bindings: ctx.bindings, automations: ctx.automations,
        ...(ctx.levelReferenceDb !== undefined ? { levelReferenceDb: ctx.levelReferenceDb } : {}),
    };
}
/**
 * Parse into a full scene: voices PLUS the spaces they live in.
 *
 * `parse()` still returns `Statement[]` and is unchanged, so the engine, the
 * three exporters, the editor and the AI repair path all keep working against
 * the shape they already know. Only callers that care about spaces opt in.
 */
export function parseScene(script, options) {
    return parseWithWarnings(script, options);
}
export function parse(script, options) {
    return parseScript(new ParseContext(options?.folders ?? folderRegistry), script);
}
/** The parse proper: every pre-pass, the statement loop and the post-passes, over one context. */
function parseScript(ctx, script) {
    // Pre-pass -1: lift `module … endmodule` fences out whole, before any comment
    // stripping touches their JavaScript. Fenced lines become blank so every other
    // line keeps its number (core/SceneVisual.ts).
    const extracted = extractModuleBlocks(script.replace(/\r\n/g, '\n').split('\n'), (message, lineNumber) => ctx.warn(message, lineNumber));
    ctx.modules = extracted.modules;
    const rawLines = extracted.lines;
    // Pre-pass 0: strip dash comments (line comments and inline comments).
    // This is also where provenance begins: every working line remembers its
    // 0-based index in the original text, and the later pre-passes carry that
    // origin through every insert, delete, split, and duplication.
    const commentStripped = [];
    for (let li = 0; li < rawLines.length; li++) {
        const result = stripDashComment(rawLines[li]);
        // A stripped full-line comment keeps its INDENTATION: an indented
        // `- note` inside a property block used to blank to column 0, which
        // ended block collection and silently dropped every property below it.
        const kept = result !== null
            ? result
            : rawLines[li].substring(0, rawLines[li].length - rawLines[li].trimStart().length);
        commentStripped.push(srcLine(kept, li));
    }
    // Pre-pass 1: expand `and <keyword>` into indented property lines
    const expandedLines = expandAndSeparators(commentStripped);
    // Pre-pass 2: extract variable definitions and substitute references
    const substitutedLines = extractAndSubstituteVariables(ctx, expandedLines);
    // Pre-pass 2.5: `folder/*` → `folder/a and folder/b …` (registered folders)
    const globExpanded = expandFolderGlobs(ctx, substitutedLines);
    // Pre-pass 3: expand multi-clip `and` into separate statements
    const multiClipLines = expandMultiClip(globExpanded);
    // Pre-pass 4: extract gen blocks — audio and trajectory, told apart by their properties
    const { genDefs, trajGenDefs, remaining: lines } = extractGenBlocks(multiClipLines);
    const outList = [];
    const sceneMaterials = ctx.materials;
    const sceneRooms = ctx.rooms;
    let grp = null;
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].text;
        const lineOrigin = lines[i].origin;
        const trimmed = raw.trimStart();
        if (trimmed.toLowerCase().startsWith('comment')) {
            inBlockComment = true;
            continue;
        }
        if (trimmed.toLowerCase().startsWith('endcomment')) {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment)
            continue;
        // Dash comments are already blanked by pre-pass 0; this guard only catches
        // what survived. Use the same negative-number exemption so a leading
        // coordinate reaches the dispatcher (and its warning) instead of vanishing.
        if (!raw.trim() || (trimmed.startsWith('-') && !/^-\.?\d/.test(trimmed)))
            continue;
        const indent = countIndent(raw);
        const body = trimmed;
        if (/^level_reference\b/i.test(body)) {
            const match = /^level_reference\s+(adaptive|\d+(?:\.\d+)?)\s*$/i.exec(body);
            const value = match?.[1].toLowerCase() === 'adaptive' ? null : Number(match?.[1]);
            if (indent !== 0 || !match || (value !== null && (!Number.isFinite(value) || value < 20 || value > 120))) {
                throw new SatieSyntaxError('level_reference must be top-level: 20–120 dB or adaptive', 'level_reference', body, body, lineOrigin + 1);
            }
            ctx.levelReferenceDb = value;
            continue;
        }
        // Reject gen blocks inside groups
        if (grp !== null && GenBlockRx.test(body)) {
            throw new SatieSyntaxError('Gen blocks are not allowed inside groups', 'gen', null, body, lineOrigin + 1);
        }
        // Close group?
        const isEndgroup = /^endgroup\b/i.test(body);
        const hadGroup = grp !== null;
        if (grp !== null && indent === grp.indent &&
            (StmtStartRx.test(body) || body.toLowerCase().startsWith('group ') || body.toLowerCase() === 'group' || isEndgroup || /^entity\b/i.test(body))) {
            flushGroup(ctx, outList, grp);
            grp = null;
        }
        // `endgroup` is consumed whether it closed the group above or sits nested
        // inside one; only an `endgroup` with no group open at all is a mistake.
        if (isEndgroup) {
            if (!hadGroup)
                ctx.warn(`'endgroup' without an open group`, lineOrigin + 1);
            continue;
        }
        // Open group
        if (body.toLowerCase().startsWith('group ') || body.toLowerCase() === 'group') {
            grp = { props: new Map(), children: [], indent };
            continue;
        }
        // Scene-level declarations: `material <name>` / `room <name>`.
        //
        // These are NOT statements and deliberately do not go through parseSingle
        // — a room is not a voice, and making it one would have every downstream
        // filter (lintScript's "missing visual", its loudness denominators, the
        // below-ground check) treat a wall as a sound source. They accumulate in
        // separate collections on the parse result instead.
        // `override <nodeId>` / `binding <nodeId>` / `automation <nodeId>` — the
        // visual node declarations (core/SceneVisual.ts). Keyed by the ids the
        // module declares, so node ids may carry dots and hyphens.
        const visualMatch = body.match(/^(override|binding|automation)\s+([A-Za-z_][\w.-]*)\s*$/i);
        if (visualMatch) {
            const kind = visualMatch[1].toLowerCase();
            const nodeId = visualMatch[2];
            const block = [];
            let j = i + 1;
            while (j < lines.length && (!lines[j].text.trim() || countIndent(lines[j].text) > indent)) {
                if (lines[j].text.trim())
                    block.push(lines[j].text.trim());
                j++;
            }
            i = j - 1;
            const warn = (message, lineNumber) => ctx.warn(message, lineNumber);
            if (kind === 'override') {
                if (ctx.overrides.some(o => o.nodeId === nodeId)) {
                    ctx.warn(`Duplicate override '${nodeId}', last one wins`, lineOrigin + 1);
                    ctx.overrides = ctx.overrides.filter(o => o.nodeId !== nodeId);
                }
                ctx.overrides.push(parseOverrideBlock(nodeId, block, lineOrigin + 1, warn));
            }
            else if (kind === 'binding') {
                if (ctx.bindings.some(b => b.nodeId === nodeId)) {
                    ctx.warn(`Duplicate binding '${nodeId}', last one wins`, lineOrigin + 1);
                    ctx.bindings = ctx.bindings.filter(b => b.nodeId !== nodeId);
                }
                ctx.bindings.push(parseBindingBlock(nodeId, block, lineOrigin + 1, warn));
            }
            else {
                if (ctx.automations.some(a => a.nodeId === nodeId)) {
                    ctx.warn(`Duplicate automation '${nodeId}', last one wins`, lineOrigin + 1);
                    ctx.automations = ctx.automations.filter(a => a.nodeId !== nodeId);
                }
                ctx.automations.push(parseAutomationBlock(nodeId, block, lineOrigin + 1, warn));
            }
            continue;
        }
        const sceneMatch = body.match(/^(material|room|mic|soundscape)\s+([a-zA-Z_][\w-]*)\s*$/i);
        if (sceneMatch) {
            const kind = sceneMatch[1].toLowerCase();
            const name = sceneMatch[2];
            const block = [];
            let j = i + 1;
            while (j < lines.length && (!lines[j].text.trim() || countIndent(lines[j].text) > indent)) {
                if (lines[j].text.trim())
                    block.push(lines[j].text.trim());
                j++;
            }
            i = j - 1;
            // Anchor block diagnostics to the HEAD line the author wrote (the old
            // `i + 1` pointed past the end of the block in transformed coordinates).
            if (kind === 'material')
                sceneMaterials.push(parseMaterialBlock(ctx, name, block, lineOrigin + 1));
            else if (kind === 'soundscape') {
                const sc = parseSoundscapeBlock(ctx, name, block, lineOrigin + 1);
                if (ctx.soundscapes.some(o => o.id === sc.id)) {
                    ctx.warn(`Duplicate soundscape '${sc.id}', last one wins`, lineOrigin + 1);
                    ctx.soundscapes = ctx.soundscapes.filter(o => o.id !== sc.id);
                }
                ctx.soundscapes.push(sc);
            }
            else if (kind === 'mic') {
                const mic = parseMicBlock(ctx, name, block, lineOrigin + 1);
                if (mic) {
                    if (ctx.mics.some(m => m.name === mic.name)) {
                        ctx.warn(`Duplicate mic '${mic.name}', last one wins`, lineOrigin + 1);
                        ctx.mics = ctx.mics.filter(m => m.name !== mic.name);
                    }
                    ctx.mics.push(mic);
                }
            }
            else
                sceneRooms.push(parseRoomBlock(ctx, name, block, lineOrigin + 1));
            continue;
        }
        // `path <name>` — an authored waypoint trajectory (spatial/Paths.ts).
        // A scene-level declaration like `room`: not a voice, referenced by
        // `move <name>` / `move path <name>`, resolved in a post-pass
        // (applyPathDefs). Names accept any \w+ — clips are often numeric
        // ("1.wav"), and a digit-leading path name derived from one must not
        // fall through to per-line unknown-statement noise.
        const pathMatch = body.match(/^path\s+(\w+)\s*$/i);
        const pathish = !pathMatch && /^path\b/i.test(body);
        if (pathMatch || pathish) {
            const block = [];
            let j = i + 1;
            while (j < lines.length && (!lines[j].text.trim() || countIndent(lines[j].text) > indent)) {
                if (lines[j].text.trim())
                    block.push(lines[j].text.trim());
                j++;
            }
            i = j - 1;
            if (!pathMatch) {
                // A malformed header still owns its block — consume it so the
                // waypoint lines don't each warn on their own.
                ctx.warn(`'${body.trim()}': a path needs one \\w name, e.g. "path dock_run", block ignored`, lineOrigin + 1);
                continue;
            }
            const def = parsePathBlock(ctx, pathMatch[1], block, lineOrigin + 1);
            if (def) {
                if (ctx.paths.some(p => p.name === def.name)) {
                    ctx.warn(`Duplicate path '${def.name}', last one wins`, lineOrigin + 1);
                    ctx.paths = ctx.paths.filter(p => p.name !== def.name);
                }
                ctx.paths.push(def);
            }
            continue;
        }
        // `world <biome…>` — the procedural world's recipe (engine/world/WorldBlock).
        // Like rooms it is not a voice; the block is handed to the world parser whole.
        const worldMatch = body.match(/^world(?:\s+(.*))?$/i);
        if (worldMatch) {
            const block = [];
            let j = i + 1;
            while (j < lines.length && (!lines[j].text.trim() || countIndent(lines[j].text) > indent)) {
                if (lines[j].text.trim())
                    block.push(lines[j].text.trim());
                j++;
            }
            i = j - 1;
            ctx.world = parseWorldBlock(worldMatch[1] ?? '', block);
            continue;
        }
        // `entity <id>` — a body with kinematics and a repertoire (Entities.ts).
        // Its own lines configure the body; its member statements are parsed
        // like any voice and land in the statement list with `entityId` set.
        const entityMatch = body.match(/^entity(?:\s+(\S+))?\s*$/i);
        if (entityMatch) {
            if (grp !== null) {
                flushGroup(ctx, outList, grp);
                grp = null;
            }
            i = parseEntityBlock(ctx, entityMatch[1] ?? '', lines, i, indent, outList, genDefs);
            continue;
        }
        if (/^endentity\b/i.test(body)) {
            ctx.warn(`'endentity' without an open entity block`, lineOrigin + 1);
            continue;
        }
        // Statement
        if (StmtStartRx.test(body)) {
            const stmtIndent = indent;
            const sb = [srcLine(body, lineOrigin, lines[i].shared, lines[i].inline)];
            let j = i + 1;
            while (j < lines.length && countIndent(lines[j].text) > stmtIndent) {
                sb.push(lines[j]);
                j++;
            }
            i = j - 1;
            for (const st of parseStatementBlock(ctx, sb, genDefs)) {
                if (grp)
                    grp.children.push(st);
                else
                    outList.push(st);
            }
            continue;
        }
        // Property line (inside group)
        if (grp !== null) {
            const propRxSingle = /^[ \t]*(?<key>\w+)(?:[ \t]+(?<val>[^\r\n]+))?/;
            const pm = body.match(propRxSingle);
            if (pm?.groups) {
                const k = pm.groups.key.toLowerCase();
                const isFlag = STANDALONE_FLAGS.has(k);
                const rawVal = (!isFlag && pm.groups.val) ? pm.groups.val.trim() : '';
                grp.props.set(k, { val: rawVal, origin: lineOrigin });
                continue;
            }
        }
        // Don't warn for lines that are just '#' hash comments or '@' metadata
        if (!body.startsWith('#') && !body.startsWith('@')) {
            ctx.warn(`Unrecognised line: '${body}'`, lineOrigin + 1);
        }
    }
    if (grp)
        flushGroup(ctx, outList, grp);
    // Post-pass: apply trajectory gen definitions to statements with matching move names
    if (trajGenDefs.size > 0) {
        for (const st of outList) {
            applyTrajGenDef(st, trajGenDefs);
        }
    }
    // Post-pass: a folder's effects block is the default DSP of every voice
    // that plays one of its sounds (`slug/sound`, or `slug/*` expanded above).
    applyFolderDsp(ctx, outList);
    // Post-pass: resolve `move <name>` against `path <name>` blocks — compile
    // the waypoints to a LUT, register it, and hand the statement the path's
    // bounding box + traversal rate.
    applyPathDefs(ctx, outList);
    // Post-pass: traverse motions (pass/approach/recede) need room to travel.
    // Runs after groups + property parsing so it sees the final region.
    for (const st of outList) {
        orientDepthTraverse(st);
        stretchTraverseRegion(st);
        // A shared program buys one bank, even when generated count expansion
        // happened before group inheritance supplied its program id.
        if (st.programId && st.isGenerated && st.genPrompt) {
            st.clip = 'generation/' + sanitizeForClipName(st.genPrompt);
            st.isCountVariant = false;
            st.countIndex = 0;
        }
        if (st.isGenerated && st.genKey) {
            st.clip = `generation/${st.genKey}_${fnv1a(generationIdentity(st)).toString(16)}${st.isCountVariant ? `_${st.countIndex + 1}` : ''}`;
        }
    }
    for (const [id, issue] of inspectPrograms(outList).issues)
        ctx.warn(issue, outList.find(s => s.programId === id)?.sourceLine ?? -1);
    return outList;
}
/**
 * Parse one statement block — the statement line plus its indented property
 * lines — into the statements it expands to: a single voice, or the N
 * count-variants of a gen voice (`3 * loop gen …`, each its own take).
 * Shared by top-level / group statements and entity members.
 */
/** Stamp a statement's source range from the block lines that produced it. */
function applySourceSpan(st, sb) {
    st.sourceLine = sb[0].origin;
    st.sourceShared = sb[0].shared;
    let end = sb[0].origin;
    for (const l of sb)
        if (l.origin > end)
            end = l.origin;
    st.sourceEndLine = end;
}
function parseStatementBlock(ctx, sb, genDefs) {
    const { line: rewrittenBody, prompt: genPrompt, isGen, isSynth } = preprocessGen(sb[0].text);
    // The rewritten head keeps sb[0]'s provenance; parseSingle maps property
    // line k of the joined text to sb[k].
    const srcLines = [srcLine(rewrittenBody, sb[0].origin, sb[0].shared, sb[0].inline), ...sb.slice(1)];
    const src = srcLines.map(l => l.text).join('\n') + '\n';
    const st = parseSingle(ctx, src, srcLines);
    applySourceSpan(st, sb);
    ctx.expandedVoices += Math.max(1, st.count);
    if (ctx.expandedVoices > MAX_SCRIPT_VOICES) {
        throw new Error(`Script exceeds ${MAX_SCRIPT_VOICES} voices after count expansion. Reduce counts or split the scene.`);
    }
    const out = [];
    if (isGen) {
        // Inline gen statement
        st.isGenerated = true;
        st.synth = st.synth || isSynth;
        if (st.synth && !isSynth)
            st.clip = st.clip.replace('generation/', 'generation/synth_');
        st.genPrompt = genPrompt;
        promoteGenDuration(st);
        if (st.count > 1) {
            const n = st.count;
            const baseClip = st.clip;
            for (let v = 0; v < n; v++) {
                const variant = parseSingle(ctx, src, srcLines);
                applySourceSpan(variant, sb);
                variant.count = 1;
                variant.clip = `${baseClip}_${v + 1}`;
                variant.isGenerated = true;
                variant.synth = st.synth;
                variant.isCountVariant = true;
                variant.countIndex = v;
                variant.genPrompt = genPrompt;
                promoteGenDuration(variant);
                copyGenPropsFromStatement(st, variant);
                out.push(variant);
            }
            return out;
        }
    }
    else {
        // Check if clip name references a gen definition
        const genDef = genDefs.get(st.clip);
        if (genDef) {
            // The written name is the voice's ADDRESS (`attach <name>`) even after
            // clip resolution rewrites it to the generation path.
            st.clipToken = st.clip.toLowerCase();
            st.isGenerated = true;
            st.genPrompt = genDef.prompt;
            st.genDuration = genDef.duration;
            st.genInfluence = genDef.influence;
            st.genLoopable = genDef.loopable;
            const baseName = `generation/${st.synth ? 'synth_' : ''}${sanitizeForClipName(genDef.prompt)}`;
            st.clip = baseName;
            if (st.count > 1) {
                const n = st.count;
                for (let v = 0; v < n; v++) {
                    const variant = parseSingle(ctx, src, srcLines);
                    applySourceSpan(variant, sb);
                    variant.count = 1;
                    variant.clipToken = variant.clip.toLowerCase();
                    variant.clip = `${baseName}_${v + 1}`;
                    variant.isGenerated = true;
                    variant.isCountVariant = true;
                    variant.countIndex = v;
                    variant.genPrompt = genDef.prompt;
                    variant.genDuration = genDef.duration;
                    variant.genInfluence = genDef.influence;
                    variant.genLoopable = genDef.loopable;
                    out.push(variant);
                }
                return out;
            }
        }
    }
    out.push(st);
    return out;
}
// ============ ENTITY BLOCKS ============
const EntityIdRx = /^[a-z0-9_]+$/;
/**
 * `entity <id>` … `endentity`: the block's own lines (indented one level)
 * configure the body — `at`, `every`, `count`, `speed`, `stop`, `pace`,
 * `active`, `quiet`, `variants`, `visual`, `spl`, and a population's
 * behaviour as numbers (`dwell`, `relocate`, `move fly|walk`, `startle`,
 * `call`, `callers`, `gap`, `voices`, `window` — world/EntityAgents.ts) — and its member statements
 * (`loop` / `oneshot` / `on …`, with their usual property blocks) are the
 * repertoire. The block also closes at the first line indented no deeper
 * than the `entity` line. Returns the index of the last consumed line.
 */
function parseEntityBlock(ctx, rawId, lines, start, indent, outList, genDefs) {
    const lineNumber = lines[start].origin + 1;
    const id = rawId.toLowerCase();
    if (!EntityIdRx.test(id)) {
        throw new SatieSyntaxError(id ? `entity id '${rawId}' must be a slug: letters, digits and _ (e.g. "entity car")` : 'entity needs an id, e.g. "entity car"', 'entity', rawId || null, lines[start].text.trim(), lineNumber);
    }
    if (ctx.entities.some(e => e.id === id)) {
        throw new SatieSyntaxError(`entity '${id}' is declared twice; ids must be unique`, 'entity', id, lines[start].text.trim(), lineNumber);
    }
    const def = {
        id,
        hostRef: null, hostAttach: 'body', hostMotion: 'fixed',
        every: RangeOrValue.range(ROUTE_EVERY_DEFAULT[0], ROUTE_EVERY_DEFAULT[1]),
        count: 1,
        speed: RangeOrValue.Null,
        agent: defaultAgentParams(),
        stopChance: 0,
        stopS: RangeOrValue.range(ROUTE_STOP_DEFAULT[0], ROUTE_STOP_DEFAULT[1]),
        paceFollow: null,
        activeHours: null,
        quietGates: [],
        gait: RangeOrValue.Null,
        variants: 1,
        visual: 'sphere',
        rotateDeg: 0,
        scaleFactor: 1,
        spl: RangeOrValue.Null,
        splFollow: null,
        states: [],
        hold: null,
        memberIndices: [],
        lineNumber,
    };
    let visualSet = false;
    const members = [];
    let j = start + 1;
    while (j < lines.length) {
        const line = lines[j].text;
        const t = line.trim();
        if (!t) {
            j++;
            continue;
        }
        const ind = countIndent(line);
        if (/^endentity\b/i.test(t)) {
            j++;
            break;
        }
        if (ind <= indent)
            break;
        if (StmtStartRx.test(t)) {
            const sb = [srcLine(t, lines[j].origin, lines[j].shared, lines[j].inline)];
            let k = j + 1;
            while (k < lines.length && countIndent(lines[k].text) > ind) {
                sb.push(lines[k]);
                k++;
            }
            members.push({ sb, line: lines[j].origin + 1 });
            j = k;
            continue;
        }
        parseEntityProp(ctx, def, t, lines[j].origin + 1, (v) => { visualSet = true; def.visual = v; });
        j++;
    }
    if (def.hostMotion === 'pass' && !def.hostRef)
        def.hostMotion = 'fixed';
    if (!visualSet)
        def.visual = def.hostMotion === 'pass' ? 'trail' : 'sphere';
    if (!members.length && !def.body)
        ctx.warn(`entity '${id}' has no members: add loop / oneshot / on statements indented under it`, lineNumber);
    if (def.body?.rig && def.behavior) {
        const clips = ENTITY_RIGS[def.body.rig.asset].clips;
        for (const action of def.behavior.actions)
            if (action.animation && !clips.includes(action.animation))
                ctx.warn(`entity '${id}': animation '${action.animation}' is unavailable on rig '${def.body.rig.asset}'; default pose/locomotion will be used`, lineNumber);
    }
    if (def.behavior && def.states.length) {
        ctx.warn(`entity '${id}': behavior owns action sound gates; legacy state lines are ignored`, lineNumber);
        def.states = [];
    }
    if (def.hold && !def.states.some(s => s.name === def.hold) && !def.behavior?.actions.some(a => a.name === def.hold)) {
        ctx.warn(`entity '${id}': 'hold ${def.hold}' names no state (states: ${def.states.map(s => s.name).join(', ') || 'none'}); ignored`, lineNumber);
        def.hold = null;
    }
    for (const m of members) {
        for (const st of parseStatementBlock(ctx, m.sb, genDefs)) {
            adoptEntityMember(ctx, st, def, m.line);
            gateByState(st, def);
            def.memberIndices.push(outList.length);
            outList.push(st);
        }
    }
    ctx.entities.push(def);
    return j - 1;
}
/**
 * A member's part in its entity's states. Held: in the held state it sounds at every hour, in another
 * state it is silent. Not held: a member named only in hourless states (what the entity can do, not
 * what it does on its own) is silent. A member in no state is untouched.
 */
function gateByState(st, def) {
    if (!def.states.length || !st.sourceId)
        return;
    const soundId = st.sourceId.slice(st.sourceId.lastIndexOf('.') + 1);
    const named = def.states.filter(s => s.sounds.includes(soundId));
    if (!named.length)
        return;
    if (def.hold) {
        if (named.some(s => s.name === def.hold))
            st.activeHours = null;
        else
            st.mute = true;
    }
    else if (named.every(s => !s.hours.length))
        st.mute = true;
}
/** A parsed range as the ordered `[min, max]` band the agent layer draws from. */
function band(r) {
    return r.min <= r.max ? [r.min, r.max] : [r.max, r.min];
}
/** One of the entity block's own lines. */
function parseEntityProp(ctx, def, line, lineNumber, setVisual) {
    const m = line.match(/^(?<key>\w+)(?:\s+(?<val>.+))?$/);
    if (!m?.groups) {
        ctx.warn(`Unrecognised line in entity '${def.id}': '${line}'`, lineNumber);
        return;
    }
    const k = m.groups.key.toLowerCase();
    const v = (m.groups.val ?? '').trim();
    if (!ENTITY_PROPERTY_NAMES.has(k)) {
        ctx.warn(`Unknown entity property '${k}' in entity '${def.id}' (entity lines take: ${[...ENTITY_PROPERTY_NAMES].join(', ')}; sounds go in indented loop / oneshot / on statements)`, lineNumber);
        return;
    }
    const tmp = new Statement();
    switch (k) {
        case 'at':
            applyProperty(ctx, tmp, propertySpec('at'), v);
            def.hostRef = tmp.hostRef;
            def.hostAttach = tmp.hostAttach;
            def.hostMotion = tmp.hostMotion;
            break;
        case 'every': {
            const r = RangeOrValue.parse(v);
            if (r.isNull || !(r.min > 0))
                ctx.warn(`entity '${def.id}': 'every' needs positive seconds, e.g. "every 6to14"`, lineNumber);
            else
                def.every = r;
            break;
        }
        case 'count': {
            const n = parseFloat(v);
            if (!isFinite(n))
                ctx.warn(`entity '${def.id}': 'count' takes a whole number 1–${POPULATION_COUNT_MAX}`, lineNumber);
            else
                def.count = Math.max(1, Math.min(POPULATION_COUNT_MAX, Math.round(n)));
            break;
        }
        case 'speed': {
            const r = RangeOrValue.parse(v);
            if (r.isNull || !(r.min > 0) || !(r.max > 0))
                ctx.warn(`entity '${def.id}': 'speed' needs positive metres per second, e.g. "speed 6to18"`, lineNumber);
            else {
                def.speed = r;
                def.agent.speedMs = band(r);
            }
            break;
        }
        // The body walks: a footfall every `gait` metres travelled (Entities.ts
        // `advanceGait`). Route bodies and relocating population bodies both
        // have a velocity, so one property covers a pedestrian on a strip and a
        // person crossing a room.
        case 'gait': {
            const r = RangeOrValue.parse(v);
            if (r.isNull || !(r.min >= GAIT_STRIDE_MIN_M) || !(r.max <= GAIT_STRIDE_MAX_M)) {
                ctx.warn(`entity '${def.id}': 'gait' is the metres a body covers per stride, ${GAIT_STRIDE_MIN_M}–${GAIT_STRIDE_MAX_M} (a walking person is about 0.7to0.82)`, lineNumber);
            }
            else
                def.gait = r;
            break;
        }
        // ── A population's behaviour (world/EntityAgents.ts), all numbers ──
        case 'dwell': {
            const r = RangeOrValue.parse(v);
            if (r.isNull || !(r.min > 0) || !(r.max > 0))
                ctx.warn(`entity '${def.id}': 'dwell' needs positive seconds at a perch, e.g. "dwell 40to180"`, lineNumber);
            else {
                def.agent.dwellS = band(r);
                def.agent.relocates = true;
            }
            break;
        }
        case 'relocate': {
            const r = RangeOrValue.parse(v);
            if (r.isNull || !(r.min >= 0) || !(r.max > 0))
                ctx.warn(`entity '${def.id}': 'relocate' needs a distance band in metres, e.g. "relocate 8to30"`, lineNumber);
            else {
                def.agent.relocateM = band(r);
                def.agent.relocates = true;
            }
            break;
        }
        // `roam fly|walk` is the canonical spelling (relocation, not a wander
        // region — `move` means something different on a voice); `move` stays a
        // permanent alias so no existing script changes meaning.
        case 'roam':
        case 'move': {
            const tok = v.toLowerCase().split(/\s+/)[0] ?? '';
            if (tok === 'fly' || tok === 'walk') {
                def.agent.travel = tok;
                def.agent.relocates = true;
            }
            else
                ctx.warn(`entity '${def.id}': '${k}' on an entity is how a population relocates: "roam fly" or "roam walk" (a body never wanders; it moves perch to perch)`, lineNumber);
            break;
        }
        case 'startle': {
            const toks = v.split(/\s+/).filter(Boolean);
            const m = parseFloat(toks[0] ?? '');
            if (!isFinite(m) || m < 0) {
                ctx.warn(`entity '${def.id}': 'startle' takes a radius in metres and an optional hush range, e.g. "startle 6 10to30"`, lineNumber);
                break;
            }
            def.agent.startleM = m;
            if (toks[1] !== undefined) {
                const r = RangeOrValue.parse(toks[1]);
                if (r.isNull || !(r.min >= 0) || !(r.max >= 0))
                    ctx.warn(`entity '${def.id}': 'startle ${toks[0]}' hush range must be seconds like 10to30, using the default`, lineNumber);
                else
                    def.agent.hushS = band(r);
            }
            if (toks.length > 2)
                ctx.warn(`entity '${def.id}': 'startle' understands "<m> [<a>to<b>]", extra tokens ignored`, lineNumber);
            break;
        }
        case 'call': {
            const p = parseFloat(v);
            if (!isFinite(p))
                ctx.warn(`entity '${def.id}': 'call' takes a probability 0–1 that a perch bout is a calling bout`, lineNumber);
            else
                def.agent.callChance = Math.max(0, Math.min(1, p));
            break;
        }
        case 'callers': {
            const n = parseFloat(v);
            if (!isFinite(n) || n < 0)
                ctx.warn(`entity '${def.id}': 'callers' takes how many individuals may call at once (0 = unlimited)`, lineNumber);
            else
                def.agent.callers = Math.min(POPULATION_COUNT_MAX, Math.round(n));
            break;
        }
        case 'gap': {
            const r = RangeOrValue.parse(v);
            if (r.isNull || !(r.min >= 0) || !(r.max >= 0))
                ctx.warn(`entity '${def.id}': 'gap' needs seconds between two calls, e.g. "gap 1to4"`, lineNumber);
            else
                def.agent.gapS = band(r);
            break;
        }
        case 'voices': {
            const n = parseFloat(v);
            if (!isFinite(n) || n < 0)
                ctx.warn(`entity '${def.id}': 'voices' takes how many individuals are localised at once (0 = all)`, lineNumber);
            else
                def.agent.voices = Math.min(POPULATION_COUNT_MAX, Math.round(n));
            break;
        }
        case 'window': {
            const m = parseFloat(v);
            if (!isFinite(m) || !(m > 0))
                ctx.warn(`entity '${def.id}': 'window' takes the listener distance in metres beyond which an individual leaves the voice budget`, lineNumber);
            else
                def.agent.windowM = Math.min(5000, m);
            break;
        }
        case 'sway': {
            // How far a perched body shifts on the spot. Never travel — it does not
            // reach `gait`, so nobody walks in place.
            const m = parseFloat(v);
            if (!isFinite(m) || m < 0 || m > 5)
                ctx.warn(`entity '${def.id}': 'sway' takes the metres a standing body shifts on the spot, 0–5 (a person is about 0.2)`, -1);
            else
                def.agent.swayM = m;
            break;
        }
        case 'stop': {
            const toks = v.split(/\s+/).filter(Boolean);
            const p = parseFloat(toks[0] ?? '');
            if (!isFinite(p)) {
                ctx.warn(`entity '${def.id}': 'stop' takes a chance 0–1 and an optional idle range, e.g. "stop 0.25 2to6"`, lineNumber);
                break;
            }
            def.stopChance = Math.max(0, Math.min(1, p));
            if (toks[1] !== undefined) {
                const r = RangeOrValue.parse(toks[1]);
                if (r.isNull || !(r.min >= 0) || !(r.max >= 0))
                    ctx.warn(`entity '${def.id}': 'stop ${toks[0]}' idle range must be seconds like 2to6, using the default`, lineNumber);
                else
                    def.stopS = r;
            }
            if (toks.length > 2)
                ctx.warn(`entity '${def.id}': 'stop' understands "<chance> [<a>to<b>]", extra tokens ignored`, lineNumber);
            break;
        }
        case 'state': {
            // `state <name> [<h>to<h> …] sounds <id>,<id>`: hours are optional, sounds are not.
            const sm = v.match(/^(?<name>[a-z0-9_]+)\s*(?<hours>(?:[\d.]+to[\d.]+\s*)*)\s+sounds\s+(?<sounds>[\w,\s-]+)$/i);
            if (!sm?.groups) {
                ctx.warn(`entity '${def.id}': 'state' takes a slug name, optional hours and the sounds heard in it, e.g. "state honking sounds horn" or "state rush 8to10 sounds engine,horn"`, lineNumber);
                break;
            }
            const name = sm.groups.name.toLowerCase();
            if (def.states.some(s => s.name === name)) {
                ctx.warn(`entity '${def.id}': state '${name}' is declared twice; the first is kept`, lineNumber);
                break;
            }
            const hours = sm.groups.hours.trim().split(/\s+/).filter(Boolean).map(w => w.split('to').map(Number))
                .filter(([a, b]) => isFinite(a) && isFinite(b) && a >= 0 && a <= 24 && b >= 0 && b <= 24);
            const sounds = sm.groups.sounds.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
            def.states.push({ name, hours, sounds });
            break;
        }
        case 'hold': {
            const tok = v.toLowerCase().split(/\s+/)[0] ?? '';
            if (!/^[a-z0-9_]+$/.test(tok))
                ctx.warn(`entity '${def.id}': 'hold' takes the name of one of its states, e.g. "hold honking"`, lineNumber);
            else
                def.hold = tok;
            break;
        }
        case 'pace':
            if (isFollow(v))
                def.paceFollow = parseFollow(ctx, 'pace', v);
            else
                ctx.warn(`entity '${def.id}': 'pace' takes the follow form: "pace follow traffic 0to1 5to0.6"`, lineNumber);
            break;
        // Voice properties an entity shares: the same registered handler fills a scratch statement.
        case 'active':
            applyProperty(ctx, tmp, propertySpec('active'), v);
            def.activeHours = tmp.activeHours;
            break;
        case 'quiet':
            applyProperty(ctx, tmp, propertySpec('quiet'), v);
            def.quietGates = tmp.quietGates;
            break;
        case 'variants':
            applyProperty(ctx, tmp, propertySpec('variants'), v);
            def.variants = tmp.variants;
            break;
        case 'spl':
            applyProperty(ctx, tmp, propertySpec('spl'), v);
            def.spl = tmp.spl;
            def.splFollow = tmp.splFollow;
            break;
        // The body's own transform: the drawn body turns and scales, its sounds stay at it.
        case 'rotate':
            applyProperty(ctx, tmp, propertySpec('rotate'), v);
            def.rotateDeg = tmp.rotateDeg;
            break;
        case 'scale':
            applyProperty(ctx, tmp, propertySpec('scale'), v);
            def.scaleFactor = tmp.scaleFactor;
            break;
        case 'behavior': {
            let behavior = null;
            try {
                behavior = parseEntityBehavior(JSON.parse(v));
            }
            catch { /* diagnostic below */ }
            if (behavior)
                def.behavior = behavior;
            else
                ctx.warn(`entity '${def.id}': invalid behavior; needs identity, bounded conditions and 1–16 named actions with goal and duration`, lineNumber);
            break;
        }
        case 'body': {
            let body = null;
            try {
                body = parseEntityBody(JSON.parse(v));
            }
            catch { /* diagnostic below */ }
            if (body)
                def.body = body;
            else
                ctx.warn(`entity '${def.id}': body needs 1–12 box/ellipsoid parts in metres or a trusted rig with explicit heightM`, lineNumber);
            break;
        }
        case 'visual': {
            const tok = v.toLowerCase().split(/\s+/)[0] ?? '';
            if (tok === 'trail' || tok === 'sphere' || tok === 'none')
                setVisual(tok);
            else
                ctx.warn(`entity '${def.id}': 'visual' is trail, sphere or none (members inherit it)`, lineNumber);
            break;
        }
    }
}
/**
 * A member sits at its instance's body: placement and motion of its own are
 * ignored with a warning. It inherits the entity's `variants`, `visual`,
 * `active`, `quiet` and `spl` when it sets none. A oneshot member with `chance`
 * and no `every` becomes a parked trigger (no event name) that the engine
 * fires once per instance life.
 */
function adoptEntityMember(ctx, st, def, lineNumber) {
    st.entityId = def.id;
    if (st.hostRef) {
        ctx.warn(`entity '${def.id}': members sit at the entity's body; 'at ${st.hostRef}' on '${st.clip}' is ignored (put 'at' on the entity)`, lineNumber);
        st.hostRef = null;
        st.hostAttach = 'body';
        st.hostMotion = 'fixed';
    }
    // A member's `move walk` / `move fly` is how the BODY gets about: it lifts
    // onto the entity as its relocation mode (perch to perch — a body never
    // wanders round the listener). Any other placement or motion is ignored.
    if (st.wanderType === WanderType.Walk || st.wanderType === WanderType.Fly) {
        if (!def.agent.relocates) {
            def.agent.travel = st.wanderType === WanderType.Fly ? 'fly' : 'walk';
            def.agent.relocates = true;
        }
        st.wanderType = WanderType.None;
        st.customTrajectoryName = null;
        st.isGenTrajectory = false;
        st.areaMin = { x: 0, y: 0, z: 0 };
        st.areaMax = { x: 0, y: 0, z: 0 };
    }
    if (st.hasPlacement || st.wanderType !== WanderType.None) {
        ctx.warn(`entity '${def.id}': members sit at the entity's body; 'place' / 'move' on '${st.clip}' are ignored (a body relocates with 'move fly' / 'move walk' on the entity line)`, lineNumber);
        st.hasPlacement = false;
        st.wanderType = WanderType.None;
        st.customTrajectoryName = null;
        st.isGenTrajectory = false;
        st.areaMin = { x: 0, y: 0, z: 0 };
        st.areaMax = { x: 0, y: 0, z: 0 };
    }
    if (st.variants === 1 && def.variants > 1)
        st.variants = def.variants;
    if (st.visual.length === 0)
        parseVisual(ctx, st, def.visual);
    if (!st.activeHours && def.activeHours)
        st.activeHours = def.activeHours;
    if (!st.quietGates.length && def.quietGates.length)
        st.quietGates = def.quietGates;
    // The body's emission level is every member's unless the member states its own.
    if (st.spl.isNull && !st.splFollow && (!def.spl.isNull || def.splFollow)) {
        st.spl = def.spl;
        st.splFollow = def.splFollow;
    }
    if (st.chance !== null) {
        if (st.kind === 'oneshot' && st.every.isNull) {
            st.kind = 'trigger';
            st.eventName = null;
        }
        else {
            ctx.warn(st.kind === 'oneshot'
                ? `entity '${def.id}': 'chance' on '${st.clip}' is ignored because it has 'every' (a repeating member); drop 'every' for a once-per-life sound`
                : `entity '${def.id}': 'chance' only applies to oneshot members, ignored on '${st.clip}'`, lineNumber);
            st.chance = null;
        }
    }
}
/**
 * `path <name>` block body: ordered `waypoint x y z [t]` lines plus pacing
 * (`cycle <s>` XOR `speed <m/s>`), `loop repeat|bounce|once`, and `closed`.
 * Only the waypoint lines are the trajectory — everything else is one number
 * a hand can edit.
 */
function parsePathBlock(ctx, name, block, lineNumber) {
    const waypoints = [];
    let cycleS = null;
    let speedMs = null;
    let loop = 'repeat';
    let closed = false;
    for (const line of block) {
        const m = line.match(/^(\w+)(?:\s+(.+))?$/);
        if (!m)
            continue;
        const key = m[1].toLowerCase();
        const val = (m[2] ?? '').trim();
        switch (key) {
            case 'waypoint': {
                const toks = val.split(/\s+/).map(parseFloat);
                if (toks.length < 3 || toks.slice(0, 3).some(isNaN)) {
                    ctx.warn(`path '${name}': waypoint needs x y z [t], e.g. "waypoint -12 0 4"`, lineNumber);
                    break;
                }
                waypoints.push({ x: toks[0], y: toks[1], z: toks[2], t: toks.length > 3 && !isNaN(toks[3]) ? toks[3] : null });
                break;
            }
            case 'cycle': {
                const n = parseFloat(val);
                if (isFinite(n) && n > 0)
                    cycleS = n;
                else
                    ctx.warn(`path '${name}': 'cycle' takes seconds for one traversal, e.g. "cycle 14"`, lineNumber);
                break;
            }
            case 'speed': {
                const n = parseFloat(val);
                if (isFinite(n) && n > 0)
                    speedMs = n;
                else
                    ctx.warn(`path '${name}': 'speed' takes metres per second, e.g. "speed 1.5"`, lineNumber);
                break;
            }
            case 'loop': {
                const v = val.toLowerCase();
                if (v === 'repeat' || v === 'bounce' || v === 'once')
                    loop = v;
                else
                    ctx.warn(`path '${name}': 'loop' takes repeat, bounce, or once`, lineNumber);
                break;
            }
            case 'closed':
                closed = true;
                break;
            default:
                ctx.warn(`path '${name}': unknown key '${key}' (waypoint, cycle, speed, loop, closed)`, lineNumber);
        }
    }
    if (waypoints.length < 2) {
        ctx.warn(`path '${name}' needs at least 2 waypoints, ignored`, lineNumber);
        return null;
    }
    if (cycleS !== null && speedMs !== null) {
        ctx.warn(`path '${name}': 'cycle' and 'speed' are mutually exclusive, using cycle`, lineNumber);
        speedMs = null;
    }
    return { name: name.toLowerCase(), waypoints, cycleS, speedMs, loop, closed, lineNumber };
}
/** Registry namespace for compiled paths — keeps them apart from gen trajectories. */
function pathTrajectoryName(name) {
    return `path_${name}`;
}
/**
 * Resolve `move <name>` references against declared `path` blocks: compile
 * the waypoints once, register the LUT (module-level registry — live engine
 * and offline export both read it, so a path exports by construction), and
 * give the statement the path's bounding box, exact traversal rate, and a
 * zero starting phase (a path starts at its first waypoint).
 */
function applyPathDefs(ctx, stmts) {
    const byName = new Map(ctx.paths.map(p => [p.name, p]));
    const compiled = new Map();
    for (const st of stmts) {
        if (st.wanderType !== WanderType.Custom || !st.customTrajectoryName)
            continue;
        const def = byName.get(st.customTrajectoryName);
        if (!def) {
            // Runs after applyTrajGenDef, so a gen-block trajectory is already
            // claimed (isGenTrajectory); a registered custom LUT resolves at
            // engine time. What's left names NOTHING — say so instead of leaving
            // a silently static voice ("the script doesn't recognize the
            // trajectory" is exactly this, unsaid).
            if (!st.isGenTrajectory && !isTrajectoryName(st.customTrajectoryName)) {
                ctx.warn(`'move ${st.customTrajectoryName}' names no path or trajectory: declare "path ${st.customTrajectoryName}" with waypoint lines, or check the spelling`, st.sourceLine + 1);
            }
            continue;
        }
        let c = compiled.get(def.name);
        if (c === undefined) {
            c = compilePath(def);
            compiled.set(def.name, c);
            if (c)
                registerTrajectoryFromLUT(pathTrajectoryName(def.name), c.lut, c.pointCount);
        }
        if (!c)
            continue;
        st.customTrajectoryName = pathTrajectoryName(def.name);
        st.trajectoryContent = JSON.stringify({ ...def, lineNumber: undefined });
        Object.defineProperty(st, 'pathTrajectory', { value: getTrajectory(st.customTrajectoryName), enumerable: false, configurable: true });
        st.areaMin = { ...c.bboxMin };
        st.areaMax = { ...c.bboxMax };
        st.hasPlacement = true;
        st.trajectoryCycleHz = c.cycleHz;
        st.trajectoryOnce = def.loop === 'once';
        st.trajectoryPhaseZero = true;
    }
}
/** Traverse trajectories and the axis they travel along. */
const TRAVERSE_AXIS = {
    line_lr: 'x',
    line_rl: 'x',
    line_toward: 'z',
    line_away: 'z',
};
const TRAVERSE_VERB = {
    line_lr: 'pass',
    line_rl: 'pass',
    line_toward: 'approach',
    line_away: 'recede',
};
/**
 * `line_toward`/`line_away` are authored for regions in FRONT of the listener
 * (+Z in the scene frame): "toward" decreases z. For a region centered behind
 * the listener (center z < 0), decreasing z moves AWAY — so swap the two
 * shapes there to keep the approach/recede verbs' meaning. Runs before
 * stretchTraverseRegion so the decision uses the placed (or default) region,
 * not the stretched one.
 */
function orientDepthTraverse(s) {
    const name = s.customTrajectoryName;
    if (s.wanderType !== WanderType.Custom)
        return;
    if (name !== 'line_toward' && name !== 'line_away')
        return;
    const centerZ = (s.areaMin.z + s.areaMax.z) / 2;
    if (centerZ >= 0)
        return;
    s.customTrajectoryName = name === 'line_toward' ? 'line_away' : 'line_toward';
}
/**
 * A narrow `place` region strangles a traverse: "place left + move pass lr"
 * would squeeze the whole left→right sweep into a ~1.2m box, so the voice
 * barely moves. The placement should pick the *lane* the voice travels in
 * (the other axes), not shorten the journey — so widen the traverse axis to
 * at least the motion archetype's default span.
 */
function stretchTraverseRegion(s) {
    if (s.wanderType !== WanderType.Custom || !s.customTrajectoryName || !s.hasPlacement)
        return;
    const axis = TRAVERSE_AXIS[s.customTrajectoryName];
    if (!axis)
        return;
    const spec = SEMANTIC_MOTIONS[TRAVERSE_VERB[s.customTrajectoryName]];
    if (!spec)
        return;
    const def = defaultRegionFor(spec);
    s.areaMin[axis] = Math.min(s.areaMin[axis], def.min[axis]);
    s.areaMax[axis] = Math.max(s.areaMax[axis], def.max[axis]);
}
/** Apply trajectory gen definition to a statement if its customTrajectoryName matches. */
function applyTrajGenDef(st, trajGenDefs) {
    if (st.wanderType !== WanderType.Custom || !st.customTrajectoryName)
        return;
    const def = trajGenDefs.get(st.customTrajectoryName);
    if (!def)
        return;
    st.isGenTrajectory = true;
    st.genTrajectoryPrompt = def.prompt;
    st.genTrajectoryDuration = def.duration;
    st.genTrajectoryResolution = def.resolution;
    st.genTrajectorySmoothing = def.smoothing;
    st.genTrajectorySeed = def.seed;
    st.genTrajectoryGround = def.ground;
    st.genTrajectoryVariation = def.variation;
}
/** Copy gen-specific properties from a parsed statement to a variant. */
function copyGenPropsFromStatement(src, dst) {
    dst.genDuration = src.genDuration;
    dst.genInfluence = src.genInfluence;
    dst.genLoopable = src.genLoopable;
}
/**
 * For gen statements, if `duration` was set in the property block and `genDuration` is not,
 * move it to `genDuration` (generation length, not playback length).
 * Also clamp genDuration to 0.5–22s.
 */
function promoteGenDuration(s) {
    if (!s.duration.isNull && s.genDuration.isNull) {
        s.genDuration = s.duration;
        s.duration = RangeOrValue.Null;
    }
    if (!s.genDuration.isNull) {
        const clampVal = (v) => Math.max(0.5, Math.min(22, v));
        s.genDuration = s.genDuration.isRange
            ? RangeOrValue.range(clampVal(s.genDuration.min), clampVal(s.genDuration.max))
            : RangeOrValue.single(clampVal(s.genDuration.min));
    }
}
export function tryParse(script, options) {
    try {
        const statements = parse(script, options);
        return { success: true, statements, errors: null };
    }
    catch (e) {
        return { success: false, statements: null, errors: e instanceof Error ? e.message : String(e) };
    }
}
//# sourceMappingURL=SatieParser.js.map