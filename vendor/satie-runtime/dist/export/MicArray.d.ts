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
import type { ScenePosition } from './VoicePositions';
/** Speed of sound at 20 °C, m/s — the same constant the Doppler path uses. */
export declare const SPEED_OF_SOUND = 343;
export interface Capsule {
    /** Offset from the array's centre, metres, in the listener frame. */
    x: number;
    y: number;
    z: number;
    label: string;
}
/**
 * A rigid body the capsules are mounted ON, rather than floating beside.
 *
 * Free air is the absence of one. A sphere is what every commercial
 * spherical array (Eigenmike, Zylia, Ambeo VR) actually is, and what the
 * machine-listening benchmarks are recorded with; sound diffracts around it
 * and is shadowed behind it, which is a large, frequency-dependent change to
 * exactly the inter-capsule level and time differences a localization model
 * reads. Physics in `RigidSphere.ts`.
 */
export interface MicArrayBaffle {
    kind: 'rigid-sphere';
    /** Sphere radius, metres. Capsules sit FLUSH on it. */
    radiusM: number;
}
export interface MicArrayGeometry {
    name: string;
    capsules: Capsule[];
    /** Radius used to build it, metres — the dominant parameter for TDOA. */
    radiusM: number;
    /**
     * The body the capsules are mounted on. Absent = the historical free-air
     * model: capsules floating in the open, coupled only by their relative
     * delay and 1/r gain.
     */
    baffle?: MicArrayBaffle;
}
export interface CapsuleSignal {
    label: string;
    /** Propagation delay from source to this capsule, seconds. */
    delayS: number;
    /** Inverse-distance gain at this capsule. */
    gain: number;
    /** Distance from source to capsule, metres. */
    distanceM: number;
}
/**
 * Tetrahedral array — four capsules on the vertices of a regular tetrahedron.
 *
 * The standard first-order layout (the physical arrangement behind an A-format
 * ambisonic mic) and the usual choice on a robot, because four capsules is the
 * minimum that resolves direction in three dimensions rather than only in the
 * horizontal plane.
 */
export declare function tetrahedralArray(radiusM?: number): MicArrayGeometry;
/**
 * Legacy regular tetrahedron mounted flush on a rigid sphere.
 * Keeps historical capsule positions and channel order for stored renders.
 * Use dcaseMicArray() for the published DCASE MIC angles and M1–M4 order.
 */
export declare function eigenmikeSubsetArray(radiusM?: number): MicArrayGeometry;
/**
 * DCASE 2023 / STARSS23 MIC, in published M1–M4 channel order.
 * https://dcase.community/challenge2023/task-sound-event-localization-and-detection-evaluated-in-real-spatial-sound-scenes
 * Azimuth is positive left; this listener frame is +X right, +Y up, +Z ahead.
 * Radius and elevations follow the published specification (35 degrees).
 * The rigid-sphere response uses RigidSphere.ts's converged modal expansion.
 */
export declare function dcaseMicArray(): MicArrayGeometry;
/** How an array's capsules are mounted. Selects a geometry by name. */
export type MicArrayChoice = 'free-field' | 'rigid-sphere' | 'dcase-mic';
/**
 * The geometry a render should use. `undefined` is the historical default —
 * the free-air tetrahedron — so every job written before this existed
 * renders exactly what it always did.
 */
export declare function micArrayGeometryFor(choice?: MicArrayChoice, radiusM?: number): MicArrayGeometry;
/**
 * Outward unit normal of a flush capsule — for a sphere it is simply the
 * capsule's own direction from the centre. The angle between this and the
 * source direction is the ONE parameter the sphere's response depends on.
 */
export declare function capsuleNormal(c: Capsule): {
    x: number;
    y: number;
    z: number;
};
/**
 * Circular horizontal array of `count` capsules — the common robot and
 * smart-speaker layout (DCASE's own recordings use one).
 *
 * Deliberately planar: it cannot distinguish up from down, and that ambiguity
 * is a real property of the hardware rather than a shortcoming here. A corpus
 * rendered through it should carry that limitation, not hide it.
 */
export declare function circularArray(count?: number, radiusM?: number): MicArrayGeometry;
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
export declare function captureAt(geometry: MicArrayGeometry, source: ScenePosition): CapsuleSignal[];
/**
 * Time difference of arrival between two capsules, seconds. Positive means
 * `a` heard it first. The quantity a localization model actually consumes.
 */
export declare function tdoa(signals: CapsuleSignal[], a: string, b: string): number;
/**
 * Largest TDOA the geometry can physically produce — its resolution ceiling,
 * reached when a source lies on the line through the two furthest capsules.
 *
 * Worth having explicitly: a measured TDOA beyond this is impossible, so it is
 * the sanity bound for anything consuming a rendered corpus.
 */
export declare function maxTdoaS(geometry: MicArrayGeometry): number;
//# sourceMappingURL=MicArray.d.ts.map