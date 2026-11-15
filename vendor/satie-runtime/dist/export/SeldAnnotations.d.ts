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
import type { RenderManifest, RenderedVoice } from './RenderManifest';
import { type ScenePosition } from './VoicePositions.js';
import { type ListenerKeyframe } from './ListenerPath.js';
import { type ClipActivity } from './ClipActivity.js';
/** DCASE convention: 100 ms hops. */
export declare const SELD_DEFAULT_FPS = 10;
export interface SeldOptions {
    /** Annotation frames per second (default 10 — the DCASE hop). */
    fps?: number;
    /**
     * The listener's path through the render. Omitted means the historical
     * behaviour: fixed at the origin facing +Z.
     *
     * Bearings are always relative to the listener, so a moving listener changes
     * every label. Passing the SAME path the audio was rendered with is not
     * optional — labels that disagree with the audio are worse than no labels,
     * because nothing downstream can detect the mismatch.
     */
    listenerPath?: ListenerKeyframe[];
    /**
     * Per-clip audibility (ClipActivity), keyed like the render's buffer map.
     * With it, a frame is labelled only while the clip actually SOUNDS at that
     * point of its playback (a one-shot's silent tail is not the event). Without
     * it, the historical behaviour: the whole scheduled span.
     */
    clipActivity?: Map<string, ClipActivity>;
}
/**
 * One source, active in one frame, in DCASE polar coordinates.
 *
 * `azimuthDeg` is 0 straight ahead and POSITIVE TO THE LEFT (counterclockwise
 * seen from above), in [-180, 180]. `elevationDeg` is positive up, in
 * [-90, 90]. `distanceM` is the straight-line range from the listener.
 */
export interface SeldFrameEvent {
    frame: number;
    label: string;
    classIndex: number;
    /** Distinguishes concurrent sources sharing a label (DCASE "source number"). */
    sourceIndex: number;
    azimuthDeg: number;
    elevationDeg: number;
    distanceM: number;
}
export interface SeldAnnotations {
    fps: number;
    durationS: number;
    frameCount: number;
    /** Label → class index, derived from this scene's own vocabulary. */
    classMap: Record<string, number>;
    events: SeldFrameEvent[];
}
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
export declare function scenePositionToPolar(p: ScenePosition): {
    azimuthDeg: number;
    elevationDeg: number;
    distanceM: number;
};
/**
 * The open-vocabulary label for a voice: its generation prompt when it has
 * one (that is the author's own description of the sound), else the clip name
 * with generation indices and underscores stripped, matching how the viewport
 * labels the same voice.
 */
export declare function voiceLabel(v: RenderedVoice): string;
/**
 * Sample the manifest into per-frame ground truth.
 *
 * A voice contributes to every frame in `[startTime, startTime + duration)`.
 * Position is evaluated at the frame's own time, so a moving source traces a
 * real trajectory rather than the linear interpolation the public corpora are
 * built from.
 */
export declare function buildSeldAnnotations(manifest: RenderManifest, options?: SeldOptions): SeldAnnotations;
/**
 * DCASE-style CSV: `frame,class,source,azimuth,elevation,distance`, no header
 * (the challenge format has none), distance in CENTIMETRES as DCASE 2024+
 * expects. The class map needed to read the integers back is not in this file
 * — write `seldClassMapJson` beside it.
 */
export declare function seldToCsv(a: SeldAnnotations): string;
/**
 * Full-fidelity sidecar: the open-vocabulary class map, the frame rate, and
 * the frame-to-second mapping a consumer needs to align the CSV with the WAV.
 * Distances stay in metres here — the CSV's centimetres are a DCASE quirk, not
 * Satie's unit.
 */
export declare function seldClassMapJson(a: SeldAnnotations): string;
//# sourceMappingURL=SeldAnnotations.d.ts.map