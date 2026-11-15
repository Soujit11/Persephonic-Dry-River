/**
 * Apple RoomPlan → WorldSpec interior.
 *
 * RoomPlan (iOS 16+, LiDAR iPhone/iPad) scans a room on the device and hands
 * back a `CapturedRoom`: walls, doors, windows, openings, floors and a few
 * furniture classes, each a surface or box with a 4×4 transform and
 * dimensions, doors and windows pointing at their wall by `parentIdentifier`.
 * Encoded with Swift's JSONEncoder that is the JSON this module reads. It is
 * the one commercial-clean source of doors and windows we found
 * (docs/research/2026-09-06-scan-to-layout-availability.md), and its shape is
 * already the interior plan's: a wall is two endpoints, a height and a
 * material; an opening names its wall.
 *
 * What comes out: a partial `WorldSpec` whose `interior.plan` is the room's
 * walls chained into a closed polygon, `interior.apertures` its doors,
 * windows and openings on their walls, and `fixtures` its furniture, all in
 * Satie's listener frame (x right, y up, +Z ahead; RoomPlan's ARKit frame has
 * −z ahead, so z flips) with the listener at the floor polygon's centroid.
 * RoomPlan reports no materials: `floor` / `walls` / `ceiling` stay the
 * generic words for the model or the user to name ("the floor is oak").
 *
 * Pure: no React, no DOM, no fetch. Tolerant of the encoding's variants
 * (transform as 16 numbers or 4 columns; category as `{wall:{}}` or a
 * string; dimensions as an array or {x,y,z}); anything unreadable is skipped,
 * and fewer than three usable walls means no interior (`null`).
 */
import type { WorldSpec } from './worldSpec';
export interface RoomPlanSurface {
    id: string;
    /** Category word as RoomPlan names it (wall, door, window, opening, floor, table…). */
    category: string;
    /** Door only: RoomPlan's isOpen. */
    isOpen?: boolean;
    parentId: string | null;
    /** Centre in RoomPlan's frame (metres, y up, −z ahead). */
    centre: [number, number, number];
    /** Unit x axis of the surface's local frame in RoomPlan's frame — a wall's length direction. */
    axisX: [number, number, number];
    /** [width, height, depth] metres. */
    dimensions: [number, number, number];
}
export interface RoomPlanCapture {
    walls: RoomPlanSurface[];
    doors: RoomPlanSurface[];
    windows: RoomPlanSurface[];
    openings: RoomPlanSurface[];
    objects: RoomPlanSurface[];
}
/** Snap distance when chaining wall endpoints into the polygon, metres. RoomPlan's own drift is a few centimetres per wall. */
export declare const ROOMPLAN_SNAP_M = 0.35;
/**
 * Read a RoomPlan `CapturedRoom` (or a `CapturedStructure`'s first room)
 * from parsed JSON. Null when it is not one: needs a `walls` array with at
 * least one readable wall.
 */
export declare function parseRoomPlan(json: unknown): RoomPlanCapture | null;
interface Segment {
    id: string;
    a: [number, number];
    b: [number, number];
    heightM: number;
    floorY: number;
}
/**
 * Chain wall segments end to end into one loop: from the longest wall, keep
 * taking the unused wall whose nearer endpoint is closest to the loop's open
 * end (flipping it as needed), stop when the open end returns to the start
 * or nothing is within reach. Walls not on the loop — partitions, a second
 * room's walls in a structure scan — are left out. Returns the loop's walls
 * in order, endpoints snapped to their neighbours.
 */
export declare function chainWalls(segments: Segment[]): Segment[];
/**
 * The capture as a partial WorldSpec: the interior's plan, its apertures on
 * their walls, and the furniture as fixtures, everything translated so the
 * listener stands at the floor polygon's centroid. Null when the walls do
 * not make a room. Pass the result to `normalizeWorldSpec` (which closes the
 * plan, derives the size and uniques the ids).
 */
export declare function roomPlanToWorldSpec(capture: RoomPlanCapture, opts?: {
    name?: string;
}): Partial<WorldSpec> | null;
/** One line for the chat: what the capture held. */
export declare function describeRoomPlan(capture: RoomPlanCapture, spec: Partial<WorldSpec>): string;
export {};
//# sourceMappingURL=roomPlan.d.ts.map