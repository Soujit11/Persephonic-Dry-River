/**
 * Satie scene frame → ADM cartesian coordinates.
 *
 * ADM (Dolby Atmos convention) uses a normalized room cube: X right [−1, 1],
 * Y front [−1, 1], Z height [0, 1] with the listener plane at Z = 0. Satie's
 * scene frame is +Z = ahead, +X = right, +Y = up in meters — so the axis map
 * is X = x/S, Y = z/S (scene-ahead → ADM front), Z = y/S clamped to [0, 1]
 * (Atmos can't represent below-plane sources; they land on the floor).
 *
 * We emit cartesian rather than polar because Satie is natively cartesian and
 * the Atmos toolchain expects `<cartesian>1</cartesian>` object metadata.
 */
import type { TimelinePoint } from '../VoicePositions';
export interface AdmPosition {
    x: number;
    y: number;
    z: number;
}
/** Never map tighter than a 5 m half-room, so small scenes keep proportion. */
export declare const ADM_MIN_ROOM_HALF = 5;
/**
 * Room scale (meters mapped to cube edge 1.0) that fits every sampled
 * position. Deterministic: derived only from the timelines.
 */
export declare function autoFitRoomScale(timelines: TimelinePoint[][]): number;
/** Map one scene-frame position (meters) into the ADM unit room. */
export declare function admPositionFromScene(p: {
    x: number;
    y: number;
    z: number;
}, roomScale: number): AdmPosition;
/** True when any part of the timeline sits below the listener plane. */
export declare function hasBelowPlanePositions(timeline: TimelinePoint[]): boolean;
/**
 * Collapse static runs of a (t → xyz) event timeline: keep a sample only when
 * it has moved more than `epsilon` (meters, per axis) since the last kept
 * sample. A static voice reduces to its first point; a moving voice keeps its
 * dense sample grid while it moves and drops samples while it holds.
 *
 * Line-fitting simplification (Ramer–Douglas–Peucker) is deliberately NOT
 * used: Dolby-profile ADM blocks are discrete position events, and importers
 * (Pro Tools) draw straight lines only between events under 30 ms apart —
 * sparse "line endpoint" events would render as stairsteps, not motion.
 */
export declare function collapseStaticRuns(points: TimelinePoint[], epsilon?: number): TimelinePoint[];
//# sourceMappingURL=AdmCoordinates.d.ts.map