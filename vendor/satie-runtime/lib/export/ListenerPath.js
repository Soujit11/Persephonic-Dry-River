import { orientationAxes, orientationFromYawPitch, interpolateOrientation, validateListenerQuaternion } from './ListenerOrientation.js';
export { orientationFromVectors, validateListenerQuaternion } from './ListenerOrientation.js';
/**
 * Where the ear is when nothing says otherwise: 1.6 m above the scene floor.
 *
 * One number, owned by the engine so it cannot drift from the UI: the walk
 * body (`ui/playerController.ts`, `EYE_HEIGHT_M`) pushes this height to
 * `engine.setListenerPosition` live, and the headless simulation and every
 * offline consumer (renderer, mic array, SELD / STAIRS26 / scene-graph labels)
 * fall back to it when no listener path is given.
 */
export const LISTENER_EAR_HEIGHT_M = 1.6;
/**
 * The listener pose a render uses when it is given no path: at the origin,
 * ear height, facing +Z. This is "where the ear is", not the scene origin —
 * a source `place`d at `0 0 3` is 3.4 m away and 28° below the horizon from
 * here, which is what the live listener heard.
 */
export const DEFAULT_LISTENER_POSE = Object.freeze({ x: 0, y: LISTENER_EAR_HEIGHT_M, z: 0, yaw: 0 });
/**
 * Where a `bed` is, in the listener's frame: nowhere in particular. A bed
 * envelops the listener (no distance law, no direction — the wide leg only),
 * and its trace position is the scene origin, which is only "at the listener"
 * while the listener stands there. Along a path that origin turns into a
 * phantom bearing (3.6 m to the left-behind, say) on every label file, so the
 * emitters substitute this: distance 0, azimuth 0, elevation 0 — what the
 * fixed-listener corpus always carried, and what `seld/data.py` drops as
 * "no direction".
 */
export const ENVELOPING = { x: 0, y: 0, z: 0 };
/** Shortest signed angular difference, so a path may wrap past ±π freely. */
function angleDelta(from, to) {
    let d = (to - from) % (2 * Math.PI);
    if (d > Math.PI)
        d -= 2 * Math.PI;
    if (d < -Math.PI)
        d += 2 * Math.PI;
    return d;
}
/**
 * Fold an angle into (−π, π].
 *
 * Every yaw this module returns is normalized, interpolated and clamped alike.
 * Without it the endpoint clamp hands back a keyframe's RAW yaw, which can sit
 * a full turn away from where interpolation was heading — so a segment ending
 * at −3 rad after interpolating toward +3.28 would jump 2π on its final
 * sample. Rotation is 2π-periodic so the transform is unaffected either way,
 * but anything that differences yaw (a velocity estimate, a turn-rate label)
 * would read a phantom spin.
 */
function normalizeAngle(a) {
    let x = a % (2 * Math.PI);
    if (x > Math.PI)
        x -= 2 * Math.PI;
    if (x <= -Math.PI)
        x += 2 * Math.PI;
    return x;
}
/**
 * Listener pose at time `t`, linearly interpolated between keyframes and
 * clamped at both ends.
 *
 * Yaw interpolates the SHORT way around. Interpolating it numerically would
 * make a listener crossing the ±π seam spin most of a full turn in one step —
 * which is inaudible in the render but catastrophic in the labels, since every
 * bearing would sweep through the whole circle for a frame.
 */
export function listenerPoseAt(path, t) {
    if (path.length === 0)
        return DEFAULT_LISTENER_POSE;
    if (path.length === 1 || t <= path[0].t)
        return poseOfKeyframe(path[0]);
    const last = path[path.length - 1];
    if (t >= last.t)
        return poseOfKeyframe(last);
    let i = 0;
    while (i < path.length - 2 && path[i + 1].t <= t)
        i++;
    const a = path[i];
    const b = path[i + 1];
    const span = b.t - a.t;
    const u = span > 0 ? (t - a.t) / span : 0;
    const yawA = a.yaw ?? 0;
    // Pitch is bounded (a head cannot look past straight up), so it interpolates
    // numerically; it is carried only when a keyframe of the segment states it,
    // so paths written before pitch existed yield the poses they always did.
    const hasPitch = a.pitch !== undefined || b.pitch !== undefined;
    const pitchA = a.pitch ?? 0;
    const orientation = a.orientation || b.orientation ? interpolateOrientation(a.orientation ? validateListenerQuaternion(a.orientation) : orientationFromYawPitch(a.yaw ?? 0, a.pitch ?? 0), b.orientation ? validateListenerQuaternion(b.orientation) : orientationFromYawPitch(b.yaw ?? 0, b.pitch ?? 0), u) : undefined;
    return {
        ...(a.coordinateFrame ? { coordinateFrame: a.coordinateFrame } : {}),
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        z: a.z + (b.z - a.z) * u,
        yaw: normalizeAngle(yawA + angleDelta(yawA, b.yaw ?? 0) * u),
        ...(hasPitch ? { pitch: pitchA + ((b.pitch ?? 0) - pitchA) * u } : {}),
        ...(orientation ? { orientation, ...anglesOf(orientation) } : {}),
    };
}
/** A keyframe as a pose: yaw folded, pitch and frame carried only when stated. */
function poseOfKeyframe(k) {
    const orientation = k.orientation ? validateListenerQuaternion(k.orientation) : undefined;
    return {
        x: k.x, y: k.y, z: k.z, yaw: normalizeAngle(k.yaw ?? 0),
        ...(k.pitch !== undefined ? { pitch: k.pitch } : {}),
        ...(k.coordinateFrame ? { coordinateFrame: k.coordinateFrame } : {}),
        ...(orientation ? { orientation, ...anglesOf(orientation) } : {}),
    };
}
function anglesOf(q) {
    const f = orientationAxes(q).forward;
    return { yaw: Math.atan2(f[0], f[2]), pitch: Math.asin(Math.max(-1, Math.min(1, f[1]))) };
}
export function listenerAxes(pose) {
    return orientationAxes(pose.orientation ?? orientationFromYawPitch(pose.yaw, pose.pitch ?? 0));
}
/**
 * A source's scene position expressed in the listener's frame: translate by
 * the listener's position, then rotate by minus its heading, then by minus
 * its pitch about the listener's own X.
 *
 * The result is what a listener at the origin facing +Z with a level gaze
 * would experience, so everything downstream (the panner, the FOA encoder,
 * the SELD labels) keeps working unchanged against a moving listener. A
 * source ahead and above a listener who looks up at it lands at elevation 0.
 */
export function toListenerFrame(source, pose) {
    return rotateToListenerFrame({ x: source.x - pose.x, y: source.y - pose.y, z: source.z - pose.z }, pose);
}
/**
 * The rotation half of `toListenerFrame` alone: a scene-frame DIRECTION (a
 * velocity, an offset) expressed along the listener's axes, no translation.
 * `toListenerFrame` is this applied to the source minus the listener.
 */
export function rotateToListenerFrame(v, pose) {
    const right = pose.coordinateFrame === 'three' ? -1 : 1;
    if (pose.orientation) {
        const axes = listenerAxes(pose);
        const dot = (a) => v.x * a[0] + v.y * a[1] + v.z * a[2];
        return { x: right * dot(axes.right), y: dot(axes.up), z: dot(axes.forward) };
    }
    let x = v.x, y = v.y, z = v.z;
    if (pose.yaw !== 0) {
        // Rotate by −yaw about Y. Scene frame is +Z ahead, +X right, so a listener
        // turning toward +X must swing sources toward −X.
        const c = Math.cos(-pose.yaw);
        const s = Math.sin(-pose.yaw);
        const rx = x * c + z * s;
        z = -x * s + z * c;
        x = rx;
    }
    const pitch = pose.pitch ?? 0;
    if (pitch !== 0) {
        // Rotate by −pitch about the listener's X (after yaw): looking up by θ
        // brings a source θ above the horizon down to it.
        const c = Math.cos(pitch);
        const s = Math.sin(pitch);
        const ry = y * c - z * s;
        z = y * s + z * c;
        y = ry;
    }
    return { x: x * right, y, z };
}
/** Total duration a path covers, 0 for an empty or single-point path. */
export function pathDuration(path) {
    if (path.length < 2)
        return 0;
    return Math.max(0, path[path.length - 1].t - path[0].t);
}
/**
 * Straight walk between two points — the common case, and the one a
 * machine-listening corpus wants most: a listener crossing a scene at a
 * constant speed while sources stay put.
 */
export function walkPath(from, to, durationS, yaw = 0) {
    return [
        { t: 0, ...from, yaw },
        { t: Math.max(0, durationS), ...to, yaw },
    ];
}
//# sourceMappingURL=ListenerPath.js.map