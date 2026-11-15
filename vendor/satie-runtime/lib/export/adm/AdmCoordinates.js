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
import { clamp } from '../../core/math.js';
/** Never map tighter than a 5 m half-room, so small scenes keep proportion. */
export const ADM_MIN_ROOM_HALF = 5;
/**
 * Room scale (meters mapped to cube edge 1.0) that fits every sampled
 * position. Deterministic: derived only from the timelines.
 */
export function autoFitRoomScale(timelines) {
    let maxCoord = 0;
    for (const timeline of timelines) {
        for (const p of timeline) {
            const m = Math.max(Math.abs(p.x), Math.abs(p.z), Math.abs(p.y));
            if (m > maxCoord)
                maxCoord = m;
        }
    }
    return Math.max(ADM_MIN_ROOM_HALF, Math.ceil(maxCoord));
}
/** Map one scene-frame position (meters) into the ADM unit room. */
export function admPositionFromScene(p, roomScale) {
    return {
        x: clamp(p.x / roomScale, -1, 1),
        y: clamp(p.z / roomScale, -1, 1),
        z: clamp(p.y / roomScale, 0, 1),
    };
}
/** True when any part of the timeline sits below the listener plane. */
export function hasBelowPlanePositions(timeline) {
    return timeline.some((p) => p.y < 0);
}
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
export function collapseStaticRuns(points, epsilon = 0.01) {
    if (points.length <= 1)
        return points.slice();
    const kept = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        const last = kept[kept.length - 1];
        if (Math.abs(p.x - last.x) > epsilon ||
            Math.abs(p.y - last.y) > epsilon ||
            Math.abs(p.z - last.z) > epsilon) {
            kept.push(p);
        }
    }
    return kept;
}
//# sourceMappingURL=AdmCoordinates.js.map