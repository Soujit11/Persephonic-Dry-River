/**
 * usda text authoring for USDZ export.
 *
 * Emits one UsdMediaSpatialAudio prim per voice under a root Xform, with
 * animated `xformOp:translate` timeSamples for moving voices and an optional
 * child Sphere marker so AR Quick Look shows something aimable. All level
 * changes are baked into the clips, so `gain` stays 1 and every prim plays
 * `onceFromStart` — the only playbackMode Apple's runtimes are known to honor
 * reliably.
 *
 * Stage convention: Y-up, meters, 30 timeCodesPerSecond (matching the
 * engine's automation cadence). Positions arrive already converted to USD's
 * frame (−Z front) by the exporter.
 */
import { SATIE_ATTRIBUTION } from './Attribution.js';
export const USD_TIMECODES_PER_SECOND = 30;
/** Satie accent green as USD displayColor. */
const MARKER_COLOR = '(0.1, 0.23, 0.16)';
const MARKER_RADIUS = 0.05;
/** USD prim names: [A-Za-z0-9_], must not start with a digit. */
export function sanitizePrimName(raw) {
    const cleaned = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'voice';
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}
const num = (v) => {
    const s = Number(v.toFixed(4));
    return Object.is(s, -0) ? '0' : String(s);
};
const vec = (p) => `(${num(p[0])}, ${num(p[1])}, ${num(p[2])})`;
function marker(indent) {
    return `${indent}def Sphere "Marker"
${indent}{
${indent}    double radius = ${MARKER_RADIUS}
${indent}    color3f[] primvars:displayColor = [${MARKER_COLOR}]
${indent}}`;
}
function voicePrim(v) {
    const lines = [];
    lines.push(`    def SpatialAudio "${v.primName}"`);
    lines.push('    {');
    lines.push(`        uniform asset filePath = @${v.clipHref}@`);
    lines.push('        uniform token auralMode = "spatial"');
    lines.push('        uniform token playbackMode = "onceFromStart"');
    if (v.startTimeCode > 0) {
        lines.push(`        uniform timecode startTime = ${v.startTimeCode}`);
    }
    lines.push('        double gain = 1');
    if (v.positionTimeSamples && v.positionTimeSamples.length > 0) {
        lines.push('');
        lines.push('        float3 xformOp:translate.timeSamples = {');
        for (const [tc, p] of v.positionTimeSamples) {
            lines.push(`            ${num(tc)}: ${vec(p)},`);
        }
        lines.push('        }');
        lines.push('        uniform token[] xformOpOrder = ["xformOp:translate"]');
    }
    else if (v.staticPosition) {
        lines.push('');
        lines.push(`        float3 xformOp:translate = ${vec(v.staticPosition)}`);
        lines.push('        uniform token[] xformOpOrder = ["xformOp:translate"]');
    }
    if (v.includeMarker) {
        lines.push('');
        lines.push(marker('        '));
    }
    lines.push('    }');
    return lines.join('\n');
}
/** Build the complete default-layer usda text. */
export function buildUSDA(spec) {
    const endTimeCode = Math.ceil(spec.durationSeconds * USD_TIMECODES_PER_SECOND);
    const prims = spec.voices.map(voicePrim).join('\n\n');
    return `#usda 1.0
(
    defaultPrim = "SatieScene"
    metersPerUnit = 1
    upAxis = "Y"
    timeCodesPerSecond = ${USD_TIMECODES_PER_SECOND}
    startTimeCode = 0
    endTimeCode = ${endTimeCode}
    doc = "${SATIE_ATTRIBUTION}"
)

def Xform "SatieScene"
{
${prims}
}
`;
}
//# sourceMappingURL=USDAWriter.js.map