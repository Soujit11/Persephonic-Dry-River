/**
 * Ground-truth annotations for machine listening — every render becomes a
 * labeled training sample.
 *
 * A Satie render already knows, exactly, what sounded and where: the manifest
 * captures every scheduled voice with its sampled start, duration and motion
 * seed, and `VoicePositions` evaluates the same functions the audio pass used.
 * That tuple — source identity + 3D position over time, rendered to first-order
 * ambisonics — is precisely a DCASE SELD training pair. The field currently
 * trains almost entirely on simulation with linear-interpolated trajectories;
 * what it lacks is human-authored spatial scenes, which is the one thing every
 * Satie export is.
 *
 * This module is pure. It reads a `RenderManifest` and produces annotations;
 * it never renders, never touches audio, and cannot drift from the audio pass
 * because it evaluates the same `positionAt` on the same seeds.
 *
 * On taxonomy: DCASE CSV wants an integer class index, but Satie has no fixed
 * sound taxonomy and should not grow one — labels are open vocabulary (a clip
 * name or a generation prompt). So the class map is derived FROM the scene,
 * sorted for determinism, and emitted alongside the CSV. The code holds the
 * representation; the vocabulary stays the author's.
 */
import { positionAt } from './VoicePositions.js';
import { listenerPoseAt, toListenerFrame, DEFAULT_LISTENER_POSE, ENVELOPING } from './ListenerPath.js';
import { clipAudibleAt, resolveClipActivity } from './ClipActivity.js';
/** DCASE convention: 100 ms hops. */
export const SELD_DEFAULT_FPS = 10;
/**
 * Satie scene frame → DCASE polar.
 *
 * Satie's scene frame is +Z ahead, +X right, +Y up. DCASE's is +x front,
 * +y LEFT, +z up. So front = z_scene, left = −x_scene, up = y_scene, and the
 * sign flip on X is the whole conversion. Getting it backwards mirrors every
 * label left-to-right — silently, since the audio is unaffected and the CSV
 * still looks well-formed. That is the failure this function exists to make
 * impossible to introduce twice; it is tested against hand-computed bearings.
 *
 * Note this is a DIFFERENT boundary conversion from `toPlaybackFrame`, which
 * flips Z for Web Audio. Both start from the scene frame; neither composes
 * with the other.
 */
export function scenePositionToPolar(p) {
    const front = p.z;
    const left = -p.x;
    const up = p.y;
    const horizontal = Math.hypot(front, left);
    return {
        azimuthDeg: toDeg(Math.atan2(left, front)),
        elevationDeg: horizontal === 0 && up === 0 ? 0 : toDeg(Math.atan2(up, horizontal)),
        distanceM: Math.hypot(horizontal, up),
    };
}
function toDeg(rad) {
    return round3(rad * 180 / Math.PI);
}
function round3(v) {
    // Keep files small and diffable; 0.001° is far below any localization JND.
    return Math.round(v * 1000) / 1000;
}
/**
 * The open-vocabulary label for a voice: its generation prompt when it has
 * one (that is the author's own description of the sound), else the clip name
 * with generation indices and underscores stripped, matching how the viewport
 * labels the same voice.
 */
export function voiceLabel(v) {
    const raw = v.stmt.genPrompt ?? v.stmt.clip;
    return raw
        .replace(/^generation\//, '')
        .replace(/_\d+(_\d+)?$/, '')
        .replace(/_/g, ' ')
        .trim();
}
/**
 * Sample the manifest into per-frame ground truth.
 *
 * A voice contributes to every frame in `[startTime, startTime + duration)`.
 * Position is evaluated at the frame's own time, so a moving source traces a
 * real trajectory rather than the linear interpolation the public corpora are
 * built from.
 */
export function buildSeldAnnotations(manifest, options = {}) {
    const fps = options.fps ?? SELD_DEFAULT_FPS;
    if (!(fps > 0))
        throw new Error(`SELD fps must be positive, got ${fps}`);
    const labels = [...new Set(manifest.voices.map(voiceLabel))].sort();
    const classMap = {};
    labels.forEach((label, i) => { classMap[label] = i; });
    // DCASE's "source number" separates concurrent sources of the same class.
    // Assign per label in manifest order so it is stable across runs.
    const perLabelCount = new Map();
    const sourceIndexOf = new Map();
    for (const v of manifest.voices) {
        const label = voiceLabel(v);
        const n = perLabelCount.get(label) ?? 0;
        sourceIndexOf.set(v, n);
        perLabelCount.set(label, n + 1);
    }
    const frameCount = Math.ceil(manifest.duration * fps);
    const events = [];
    const path = options.listenerPath;
    for (let frame = 0; frame < frameCount; frame++) {
        const t = frame / fps;
        // One listener pose per frame, shared by every source in it.
        const pose = path && path.length ? listenerPoseAt(path, t) : DEFAULT_LISTENER_POSE;
        for (const v of manifest.voices) {
            const elapsed = t - v.startTime;
            if (elapsed < 0 || elapsed >= v.voiceDuration)
                continue;
            if (!clipAudibleAt(resolveClipActivity(options.clipActivity, v.clip ?? v.stmt.clip), elapsed, v.startOffset, v.pitch, v.stmt.kind === 'loop'))
                continue;
            const label = voiceLabel(v);
            // A bed envelops the listener: distance 0, no bearing, wherever the listener stands.
            const polar = scenePositionToPolar(v.stmt.bed ? ENVELOPING : toListenerFrame(positionAt(v, elapsed), pose));
            events.push({
                frame,
                label,
                classIndex: classMap[label],
                sourceIndex: sourceIndexOf.get(v),
                azimuthDeg: polar.azimuthDeg,
                elevationDeg: polar.elevationDeg,
                distanceM: round3(polar.distanceM),
            });
        }
    }
    return { fps, durationS: manifest.duration, frameCount, classMap, events };
}
/**
 * DCASE-style CSV: `frame,class,source,azimuth,elevation,distance`, no header
 * (the challenge format has none), distance in CENTIMETRES as DCASE 2024+
 * expects. The class map needed to read the integers back is not in this file
 * — write `seldClassMapJson` beside it.
 */
export function seldToCsv(a) {
    const lines = [];
    for (const e of a.events) {
        lines.push([
            e.frame, e.classIndex, e.sourceIndex,
            e.azimuthDeg, e.elevationDeg, Math.round(e.distanceM * 100),
        ].join(','));
    }
    return lines.join('\n') + (lines.length ? '\n' : '');
}
/**
 * Full-fidelity sidecar: the open-vocabulary class map, the frame rate, and
 * the frame-to-second mapping a consumer needs to align the CSV with the WAV.
 * Distances stay in metres here — the CSV's centimetres are a DCASE quirk, not
 * Satie's unit.
 */
export function seldClassMapJson(a) {
    return JSON.stringify({
        format: 'satie-seld/1',
        fps: a.fps,
        durationS: a.durationS,
        frameCount: a.frameCount,
        coordinates: {
            azimuthDeg: '0 = ahead, positive = left (counterclockwise from above), [-180,180]',
            elevationDeg: 'positive = up, [-90,90]',
            distance: 'metres in this file; centimetres in the CSV, per DCASE',
        },
        classMap: a.classMap,
    }, null, 2);
}
//# sourceMappingURL=SeldAnnotations.js.map