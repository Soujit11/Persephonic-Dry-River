import { type ListenerQuaternion } from './ListenerOrientation.js';
export { orientationFromVectors, validateListenerQuaternion } from './ListenerOrientation.js';
export type { ListenerQuaternion } from './ListenerOrientation.js';
/**
 * A moving listener for offline renders.
 *
 * The offline renderer's listener used to be nailed to the origin facing +Z,
 * which makes an export something other than what the user heard — and makes
 * a rendered walkthrough impossible. It also caps the machine-listening value
 * of a render at zero interesting cases: a robot that never moves is not a
 * robot, and every localization corpus worth training on is recorded while
 * moving.
 *
 * With no path the listener stands at `DEFAULT_LISTENER_POSE`: the scene
 * origin at EAR HEIGHT, facing +Z. The live listener has always stood at
 * `LISTENER_EAR_HEIGHT_M` (the walk body's eye height, `ui/playerController`
 * imports the same constant), so an export that put the ear on the floor
 * labelled every source's elevation and distance — and rendered every
 * distance-bound level and HRTF elevation — from a vantage nobody heard.
 *
 * Implemented by transforming SOURCES into the listener's frame rather than by
 * automating Web Audio's listener. Three reasons: the listener's AudioParams
 * are inconsistently supported across contexts and effectively untestable; the
 * transform is exact and pure; and the SELD annotations already need the same
 * listener-relative coordinates, so doing it once means the labels cannot
 * disagree with the audio.
 */
import type { ScenePosition } from './VoicePositions';
export interface ListenerKeyframe {
    /** Full orientation, authoritative when supplied; includes roll. */
    orientation?: ListenerQuaternion;
    /** Three.js world basis: looking toward +Z puts +X on the listener's left. Omitted retains the historical scene basis. */
    coordinateFrame?: 'three';
    /** Seconds from the start of the render. */
    t: number;
    x: number;
    y: number;
    z: number;
    /**
     * Heading in radians, 0 = facing +Z (scene "ahead"), increasing toward +X.
     * Omitted keyframes inherit 0 — a listener that translates without turning.
     */
    yaw?: number;
    /**
     * Pitch in radians, positive = looking up, applied AFTER yaw about the
     * listener's own X axis. Omitted keyframes inherit 0 (level gaze). Track C
     * derives it from a capture's forward vector as `asin(forward.y)` with the
     * forward unit length; yaw stays as above.
     */
    pitch?: number;
}
export interface ListenerPose {
    orientation?: ListenerQuaternion;
    coordinateFrame?: 'three';
    x: number;
    y: number;
    z: number;
    yaw: number;
    /** Pitch in radians, positive up; absent means 0 (a level gaze), as every pose was before 2026-11-08. */
    pitch?: number;
}
/**
 * Where the ear is when nothing says otherwise: 1.6 m above the scene floor.
 *
 * One number, owned by the engine so it cannot drift from the UI: the walk
 * body (`ui/playerController.ts`, `EYE_HEIGHT_M`) pushes this height to
 * `engine.setListenerPosition` live, and the headless simulation and every
 * offline consumer (renderer, mic array, SELD / STAIRS26 / scene-graph labels)
 * fall back to it when no listener path is given.
 */
export declare const LISTENER_EAR_HEIGHT_M = 1.6;
/**
 * The listener pose a render uses when it is given no path: at the origin,
 * ear height, facing +Z. This is "where the ear is", not the scene origin —
 * a source `place`d at `0 0 3` is 3.4 m away and 28° below the horizon from
 * here, which is what the live listener heard.
 */
export declare const DEFAULT_LISTENER_POSE: Readonly<ListenerPose>;
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
export declare const ENVELOPING: ScenePosition;
/**
 * Listener pose at time `t`, linearly interpolated between keyframes and
 * clamped at both ends.
 *
 * Yaw interpolates the SHORT way around. Interpolating it numerically would
 * make a listener crossing the ±π seam spin most of a full turn in one step —
 * which is inaudible in the render but catastrophic in the labels, since every
 * bearing would sweep through the whole circle for a frame.
 */
export declare function listenerPoseAt(path: ListenerKeyframe[], t: number): ListenerPose;
export declare function listenerAxes(pose: ListenerPose): {
    right: [number, number, number];
    up: [number, number, number];
    forward: [number, number, number];
};
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
export declare function toListenerFrame(source: ScenePosition, pose: ListenerPose): ScenePosition;
/**
 * The rotation half of `toListenerFrame` alone: a scene-frame DIRECTION (a
 * velocity, an offset) expressed along the listener's axes, no translation.
 * `toListenerFrame` is this applied to the source minus the listener.
 */
export declare function rotateToListenerFrame(v: ScenePosition, pose: ListenerPose): ScenePosition;
/** Total duration a path covers, 0 for an empty or single-point path. */
export declare function pathDuration(path: ListenerKeyframe[]): number;
/**
 * Straight walk between two points — the common case, and the one a
 * machine-listening corpus wants most: a listener crossing a scene at a
 * constant speed while sources stay put.
 */
export declare function walkPath(from: {
    x: number;
    y: number;
    z: number;
}, to: {
    x: number;
    y: number;
    z: number;
}, durationS: number, yaw?: number): ListenerKeyframe[];
//# sourceMappingURL=ListenerPath.d.ts.map