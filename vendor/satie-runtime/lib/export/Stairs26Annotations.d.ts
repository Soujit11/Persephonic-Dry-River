/**
 * STAIRS26-format annotations — DCASE's "semantic acoustic imaging" ground
 * truth, emitted analytically from the scene graph.
 *
 * DCASE 2026 Task 3 moved SELD from point-DOA regression to per-event-instance
 * ENERGY MAPS on the sphere: each active source is a polygon of
 * [x, y, intensity] triplets on an equirectangular grid (x azimuth 0-359,
 * y elevation 0-179), 10 fps, with class, score and optional distance (cm).
 * That representation finally carries what Satie's DSL already encodes —
 * source EXTENT (`radius`/`ring`) — and where the challenge's own ground
 * truth is inferred by a super-resolution model from mic signals, ours is
 * exact: the scene graph KNOWS each source's position and extent, so the
 * blob is computed, not estimated.
 *
 * Pure module, same contract as SeldAnnotations: reads a RenderManifest,
 * evaluates the same positionAt on the same seeds as the audio pass, never
 * touches audio. Classes stay open vocabulary (label → sorted index emitted
 * alongside), matching the SELD emitter's taxonomy stance; each annotation
 * additionally carries its `label`, a superset of the challenge schema.
 *
 * Pixel mapping (documented in the emitted file, since the challenge page
 * does not pin the origin): image centre x=180 is straight ahead, x grows to
 * the listener's RIGHT (matching Satie's pano convention: left edge = hard
 * left of behind); y=0 is straight up, y=90 the horizon. DCASE azimuth is
 * positive-LEFT, so x = (180 − az) mod 360; y = 90 − el.
 */
import type { RenderManifest } from './RenderManifest';
import { type ListenerKeyframe } from './ListenerPath.js';
import { type ClipActivity } from './ClipActivity.js';
export interface Stairs26Options {
    /** Annotation frames per second (default 10 — the challenge hop). */
    fps?: number;
    /** Listener path — MUST match the audio render's (see SeldAnnotations). */
    listenerPath?: ListenerKeyframe[];
    /** Vertices per blob polygon (default 12). */
    polygonPoints?: number;
    /** Per-clip audibility — see SeldOptions.clipActivity. */
    clipActivity?: Map<string, ClipActivity>;
}
/** One event instance active in one frame — the STAIRS26 annotation shape. */
export interface Stairs26Annotation {
    metadata_frame_index: number;
    category_id: number;
    /** Ground truth: always 1. */
    score: number;
    /** Straight-line range, centimetres (the challenge unit). */
    distance: number;
    /** Polygon of [x 0-359, y 0-179, intensity 0-1] triplets at the blob edge. */
    segmentation: [number, number, number][];
    /** Satie superset: the open-vocabulary label behind category_id. */
    label: string;
    /** Satie superset: separates concurrent sources sharing a label. */
    source_index: number;
}
export interface Stairs26File {
    format: 'satie-stairs26/1';
    fps: number;
    durationS: number;
    frameCount: number;
    coordinates: Record<string, string>;
    classMap: Record<string, number>;
    annotations: Stairs26Annotation[];
}
/** DCASE polar → equirect pixel. Exported for tests: the mapping is the part
 * a sign error would silently mirror. */
export declare function polarToPixel(azimuthDeg: number, elevationDeg: number): {
    x: number;
    y: number;
};
/** The angular half-width a physical extent subtends at a distance. */
export declare function angularRadiusDeg(extentM: number, distanceM: number): number;
/** Sample the manifest into STAIRS26 per-frame instances. */
export declare function buildStairs26(manifest: RenderManifest, options?: Stairs26Options): Stairs26File;
/** The emitted JSON, one file per rendered recording. */
export declare function stairs26Json(manifest: RenderManifest, options?: Stairs26Options): string;
//# sourceMappingURL=Stairs26Annotations.d.ts.map