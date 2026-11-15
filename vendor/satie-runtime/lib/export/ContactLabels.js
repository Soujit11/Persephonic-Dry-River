import { listenerPoseAt, toListenerFrame, DEFAULT_LISTENER_POSE } from './ListenerPath.js';
import { scenePositionToPolar } from './SeldAnnotations.js';
import { SELD_DEFAULT_FPS } from './SeldAnnotations.js';
export const CONTACT_LABELS_FORMAT = 'satie-contacts/1';
/** `contact:<act>:<contact>:<material>` → its parts; null for any other behaviour label. */
export function parseContactLabel(label) {
    if (!label.startsWith('contact:'))
        return null;
    const rest = label.slice('contact:'.length);
    const first = rest.indexOf(':');
    if (first < 0)
        return null;
    const second = rest.indexOf(':', first + 1);
    const act = rest.slice(0, first);
    const contact = second < 0 ? rest.slice(first + 1) : rest.slice(first + 1, second);
    const material = second < 0 ? '' : rest.slice(second + 1);
    return { act, contact, material };
}
const round3 = (v) => Math.round(v * 1000) / 1000;
/** The contact rows of a simulated render; a manifest without behaviours gives none. */
export function buildContactLabels(manifest, options = {}) {
    const fps = options.fps ?? SELD_DEFAULT_FPS;
    if (!(fps > 0))
        throw new Error(`contact label fps must be positive, got ${fps}`);
    const path = options.listenerPath;
    const rows = [];
    for (const b of manifest.behaviors ?? []) {
        const parsed = parseContactLabel(b.label);
        if (!parsed)
            continue;
        const pose = path && path.length ? listenerPoseAt(path, b.t) : DEFAULT_LISTENER_POSE;
        const polar = scenePositionToPolar(toListenerFrame({ x: b.x, y: b.y, z: b.z }, pose));
        rows.push({
            t: round3(b.t), frame: Math.floor(b.t * fps), entity: b.entity, instance: b.instance,
            act: parsed.act, contact: parsed.contact, material: parsed.material,
            position: [round3(b.x), round3(b.y), round3(b.z)],
            azimuthDeg: polar.azimuthDeg, elevationDeg: polar.elevationDeg, distanceM: round3(polar.distanceM),
        });
    }
    rows.sort((a, b) => a.t - b.t || a.entity.localeCompare(b.entity) || a.instance - b.instance);
    return { format: CONTACT_LABELS_FORMAT, fps, durationS: manifest.duration, rows };
}
/** The sidecar, with its field guide inside it, so the file explains itself to whoever edits the format. */
export function contactLabelsJson(labels) {
    return JSON.stringify({
        format: labels.format,
        fps: labels.fps,
        durationS: labels.durationS,
        joins: 'frame matches the SELD CSV frame column (same fps); position is world metres; the bearing uses the SELD convention',
        fields: {
            t: 'seconds from the start of the render',
            frame: 'floor(t * fps), the SELD frame',
            entity: 'the entity class of the body (a person, a cart)',
            instance: 'which body of that class, 0-based',
            act: 'what the body was doing: sit, stand, pick_up, set_down, shift, walk, or an authored act name',
            contact: 'the contact within the act; equal to act for clips with one contact',
            material: 'what the body touched, as the world declared it; empty when unknown',
            position: '[x, y, z] world metres, +Y up',
            azimuthDeg: '0 ahead, positive to the left, [-180, 180], from the listener at t',
            elevationDeg: 'positive up, [-90, 90]',
            distanceM: 'straight-line range from the listener, metres',
        },
        rows: labels.rows,
    }, null, 1);
}
//# sourceMappingURL=ContactLabels.js.map