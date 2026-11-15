/**
 * Microphone arrays — because robots have arrays, not ears.
 *
 * Every render path Satie has produces something shaped for a human listener:
 * HRTF binaural, or ambisonics that assumes a head at the origin. A robot
 * localizes with a rigid array of omni capsules and infers direction from the
 * time and level differences between them. A corpus rendered only to HRTF
 * teaches a model about one particular pair of pinnae, which no robot has.
 *
 * Pure geometry and physics: capsule layout in, per-capsule delay and gain
 * out. Rendering is the caller's job, at the same seam `AmbisonicEncoder`
 * occupies, and this module never touches Web Audio.
 */
/** Speed of sound at 20 °C, m/s — the same constant the Doppler path uses. */
export const SPEED_OF_SOUND = 343;
/**
 * Tetrahedral array — four capsules on the vertices of a regular tetrahedron.
 *
 * The standard first-order layout (the physical arrangement behind an A-format
 * ambisonic mic) and the usual choice on a robot, because four capsules is the
 * minimum that resolves direction in three dimensions rather than only in the
 * horizontal plane.
 */
export function tetrahedralArray(radiusM = 0.042) {
    // Alternate vertices of a cube, normalized — a regular tetrahedron.
    const k = radiusM / Math.sqrt(3);
    return {
        name: 'tetrahedral',
        radiusM,
        capsules: [
            { x: +k, y: +k, z: +k, label: 'FLU' },
            { x: +k, y: -k, z: -k, label: 'FRD' },
            { x: -k, y: +k, z: -k, label: 'BLD' },
            { x: -k, y: -k, z: +k, label: 'BRU' },
        ],
    };
}
/**
 * Legacy regular tetrahedron mounted flush on a rigid sphere.
 * Keeps historical capsule positions and channel order for stored renders.
 * Use dcaseMicArray() for the published DCASE MIC angles and M1–M4 order.
 */
export function eigenmikeSubsetArray(radiusM = 0.042) {
    const base = tetrahedralArray(radiusM);
    return { ...base, name: 'eigenmike-subset', baffle: { kind: 'rigid-sphere', radiusM } };
}
/**
 * DCASE 2023 / STARSS23 MIC, in published M1–M4 channel order.
 * https://dcase.community/challenge2023/task-sound-event-localization-and-detection-evaluated-in-real-spatial-sound-scenes
 * Azimuth is positive left; this listener frame is +X right, +Y up, +Z ahead.
 * Radius and elevations follow the published specification (35 degrees).
 * The rigid-sphere response uses RigidSphere.ts's converged modal expansion.
 */
export function dcaseMicArray() {
    const radiusM = 0.042;
    const angles = [[45, 35], [-45, -35], [135, -35], [-135, 35]];
    return {
        name: 'dcase-mic', radiusM, baffle: { kind: 'rigid-sphere', radiusM },
        capsules: angles.map(([azimuth, elevation], i) => {
            const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
            return { x: -radiusM * Math.cos(el) * Math.sin(az),
                y: radiusM * Math.sin(el), z: radiusM * Math.cos(el) * Math.cos(az), label: `M${i + 1}` };
        }),
    };
}
/**
 * The geometry a render should use. `undefined` is the historical default —
 * the free-air tetrahedron — so every job written before this existed
 * renders exactly what it always did.
 */
export function micArrayGeometryFor(choice, radiusM = 0.042) {
    if (choice === 'dcase-mic') {
        if (radiusM !== 0.042)
            throw new Error('DCASE MIC requires a 0.042 m radius');
        return dcaseMicArray();
    }
    return choice === 'rigid-sphere' ? eigenmikeSubsetArray(radiusM) : tetrahedralArray(radiusM);
}
/**
 * Outward unit normal of a flush capsule — for a sphere it is simply the
 * capsule's own direction from the centre. The angle between this and the
 * source direction is the ONE parameter the sphere's response depends on.
 */
export function capsuleNormal(c) {
    const r = Math.hypot(c.x, c.y, c.z);
    if (r < 1e-12)
        return { x: 0, y: 0, z: 1 };
    return { x: c.x / r, y: c.y / r, z: c.z / r };
}
/**
 * Circular horizontal array of `count` capsules — the common robot and
 * smart-speaker layout (DCASE's own recordings use one).
 *
 * Deliberately planar: it cannot distinguish up from down, and that ambiguity
 * is a real property of the hardware rather than a shortcoming here. A corpus
 * rendered through it should carry that limitation, not hide it.
 */
export function circularArray(count = 6, radiusM = 0.05) {
    const n = Math.max(1, Math.floor(count));
    const capsules = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        capsules.push({
            x: Math.sin(a) * radiusM,
            y: 0,
            z: Math.cos(a) * radiusM,
            label: `M${i + 1}`,
        });
    }
    return { name: `circular-${n}`, radiusM, capsules };
}
/**
 * Per-capsule delay and gain for a source at `source`, in the array's frame
 * (listener-relative — see `toListenerFrame`).
 *
 * Delay is absolute time of flight, not a difference. Absolute delays keep the
 * array's response correct as a source approaches: with only differences, a
 * source moving toward the array would show changing TDOA but no changing
 * arrival time, and any model trained to use both would learn a contradiction.
 *
 * Gain follows the same inverse law as the panner, measured per capsule rather
 * than from the array centre, and clamped at the same 1 m reference distance
 * the engine uses everywhere else. Inside that reference every capsule sits at
 * unity — level differences carry no information there, and TDOA is the only
 * direction cue an array has in the near field. Beyond it the per-capsule
 * difference is real but small; TDOA remains the dominant cue at any distance,
 * which is why the delays are the part worth getting exactly right.
 */
export function captureAt(geometry, source) {
    return geometry.capsules.map((c) => {
        const dx = source.x - c.x;
        const dy = source.y - c.y;
        const dz = source.z - c.z;
        const distanceM = Math.hypot(dx, dy, dz);
        return {
            label: c.label,
            distanceM,
            delayS: distanceM / SPEED_OF_SOUND,
            gain: 1 / Math.max(distanceM, 1),
        };
    });
}
/**
 * Time difference of arrival between two capsules, seconds. Positive means
 * `a` heard it first. The quantity a localization model actually consumes.
 */
export function tdoa(signals, a, b) {
    const sa = signals.find((s) => s.label === a);
    const sb = signals.find((s) => s.label === b);
    if (!sa || !sb)
        return 0;
    return sb.delayS - sa.delayS;
}
/**
 * Largest TDOA the geometry can physically produce — its resolution ceiling,
 * reached when a source lies on the line through the two furthest capsules.
 *
 * Worth having explicitly: a measured TDOA beyond this is impossible, so it is
 * the sanity bound for anything consuming a rendered corpus.
 */
export function maxTdoaS(geometry) {
    let widest = 0;
    const cs = geometry.capsules;
    for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
            widest = Math.max(widest, Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y, cs[i].z - cs[j].z));
        }
    }
    return widest / SPEED_OF_SOUND;
}
//# sourceMappingURL=MicArray.js.map