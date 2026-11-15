import { positionAt } from './VoicePositions.js';
import { listenerPoseAt, toListenerFrame, DEFAULT_LISTENER_POSE, ENVELOPING } from './ListenerPath.js';
import { scenePositionToPolar, voiceLabel, SELD_DEFAULT_FPS } from './SeldAnnotations.js';
import { clipAudibleAt, resolveClipActivity } from './ClipActivity.js';
/** Blob edges never collapse below this angular radius (a point source still
 * occupies ~a σ=6°-kernel's core on the challenge's evaluation grid). */
const MIN_ANGULAR_RADIUS_DEG = 3;
/** DCASE polar → equirect pixel. Exported for tests: the mapping is the part
 * a sign error would silently mirror. */
export function polarToPixel(azimuthDeg, elevationDeg) {
    const x = ((Math.round(180 - azimuthDeg) % 360) + 360) % 360;
    const y = Math.max(0, Math.min(179, Math.round(90 - elevationDeg)));
    return { x, y };
}
/** The angular half-width a physical extent subtends at a distance. */
export function angularRadiusDeg(extentM, distanceM) {
    const geometric = distanceM > 0 ? (Math.atan2(extentM, distanceM) * 180) / Math.PI : 90;
    return Math.max(MIN_ANGULAR_RADIUS_DEG, geometric);
}
/** A voice's physical extent radius in metres (0 = point). `radius` spheres
 * and `ring` perimeters both read as their radius; beds are enveloping and
 * clamp to the far pole of the blob scale. */
function extentOf(v) {
    const s = v.stmt;
    if (s.bed)
        return 50;
    if (!s.radius.isNull)
        return (s.radius.min + s.radius.max) / 2;
    if (!s.ringRadius.isNull)
        return (s.ringRadius.min + s.ringRadius.max) / 2;
    return 0;
}
/**
 * Circle of `points` vertices around a centre direction, drawn in azimuth/
 * elevation space and converted per-vertex. Azimuth spread is widened by
 * 1/cos(el) so the blob keeps its angular size away from the equator (the
 * classic equirect distortion); near the poles the cap is the whole band.
 * Vertex intensity is 0.5 — the blob's half-peak boundary; the challenge
 * binarizes ground truth at 10% of peak with a σ=6° kernel, so a half-peak
 * outline is a conservative, well-inside-threshold edge.
 */
function blobPolygon(azDeg, elDeg, radiusDeg, points) {
    const out = [];
    const cosEl = Math.max(0.05, Math.cos((elDeg * Math.PI) / 180));
    for (let i = 0; i < points; i++) {
        const phi = (i / points) * 2 * Math.PI;
        const el = elDeg + Math.sin(phi) * radiusDeg;
        const az = azDeg + (Math.cos(phi) * radiusDeg) / cosEl;
        const px = polarToPixel(az, Math.max(-90, Math.min(90, el)));
        out.push([px.x, px.y, 0.5]);
    }
    return out;
}
/** Sample the manifest into STAIRS26 per-frame instances. */
export function buildStairs26(manifest, options = {}) {
    const fps = options.fps ?? SELD_DEFAULT_FPS;
    if (!(fps > 0))
        throw new Error(`STAIRS26 fps must be positive, got ${fps}`);
    const points = options.polygonPoints ?? 12;
    const labels = [...new Set(manifest.voices.map(voiceLabel))].sort();
    const classMap = {};
    labels.forEach((label, i) => { classMap[label] = i; });
    const perLabelCount = new Map();
    const sourceIndexOf = new Map();
    for (const v of manifest.voices) {
        const label = voiceLabel(v);
        const n = perLabelCount.get(label) ?? 0;
        sourceIndexOf.set(v, n);
        perLabelCount.set(label, n + 1);
    }
    const frameCount = Math.ceil(manifest.duration * fps);
    const annotations = [];
    const path = options.listenerPath;
    for (let frame = 0; frame < frameCount; frame++) {
        const t = frame / fps;
        const pose = path && path.length ? listenerPoseAt(path, t) : DEFAULT_LISTENER_POSE;
        for (const v of manifest.voices) {
            const elapsed = t - v.startTime;
            if (elapsed < 0 || elapsed >= v.voiceDuration)
                continue;
            if (!clipAudibleAt(resolveClipActivity(options.clipActivity, v.clip ?? v.stmt.clip), elapsed, v.startOffset, v.pitch, v.stmt.kind === 'loop'))
                continue;
            const label = voiceLabel(v);
            const polar = scenePositionToPolar(v.stmt.bed ? ENVELOPING : toListenerFrame(positionAt(v, elapsed), pose));
            const radiusDeg = angularRadiusDeg(extentOf(v), polar.distanceM);
            annotations.push({
                metadata_frame_index: frame,
                category_id: classMap[label],
                score: 1,
                distance: Math.round(polar.distanceM * 100),
                segmentation: blobPolygon(polar.azimuthDeg, polar.elevationDeg, radiusDeg, points),
                label,
                source_index: sourceIndexOf.get(v),
            });
        }
    }
    return {
        format: 'satie-stairs26/1',
        fps,
        durationS: manifest.duration,
        frameCount,
        coordinates: {
            x: 'equirect azimuth pixel 0-359; 180 = straight ahead, grows to the listener\'s RIGHT (x = (180 - azDeg) mod 360, azDeg DCASE positive-left)',
            y: 'equirect elevation pixel 0-179; 0 = up, 90 = horizon (y = 90 - elDeg)',
            intensity: 'polygon vertices sit on the blob\'s half-peak boundary (0.5)',
            distance: 'centimetres, straight-line from the listener',
            score: 'always 1 — analytic ground truth, not an estimate',
        },
        classMap,
        annotations,
    };
}
/** The emitted JSON, one file per rendered recording. */
export function stairs26Json(manifest, options = {}) {
    return JSON.stringify(buildStairs26(manifest, options), null, 1);
}
//# sourceMappingURL=Stairs26Annotations.js.map