/**
 * Diffraction as portal redirect — where a sound comes FROM when a wall is in
 * the way.
 *
 * Geometry occlusion (the collider raycast) answers "is something between
 * me and the source" and muffles accordingly. It leaves the source panned at
 * its true position — behind the wall — so a kettle in the next room is heard
 * *through* the plaster, quieter, at the kettle's bearing. That is not what
 * ears report. Sound bends around the edges of an opening, and the listener
 * hears the doorway: the source appears AT the aperture, farther away than it
 * is (the path is longer), and muffled in proportion to how far the wave had
 * to turn to reach them.
 *
 * This module computes that from the cell-and-portal graph `VoxelRooms`
 * already segments:
 *
 *   1. Which room is the listener in, which room is the source in (`roomAt`).
 *      Same room → no diffraction, the raycast alone is the truth.
 *   2. The shortest chain of portals joining the two rooms — Dijkstra over
 *      portals, metric through their centroids. Scenes have a handful of
 *      doorways, so this is cheap enough to run per voice at the raycast rate.
 *   3. String-pulling: each crossing slides within its portal's rectangle to
 *      where the path from the previous point to the next one actually passes,
 *      iterated a few times. Centroids alone put every path through the middle
 *      of the door; this puts it through the edge the sound really bends round.
 *   4. The APPARENT source: the direction of the first crossing, at the full
 *      path length. The panner sits there; distance attenuation therefore
 *      follows the path the sound travelled, not the wall-piercing chord.
 *   5. The total BEND — the sum of turn angles along the path — mapped onto
 *      the engine's existing occlusion scalar (`diffractionOcclusion01`): a
 *      straight sight line through the door is transparent, a full turn
 *      around a corner is a heavy muffle, and a wall with no route stays
 *      whatever the raycast said.
 *
 * Nothing here traces rays. Pathing on a room graph is the model Wwise ships
 * (rooms-and-portals) and the one game audio has trusted for twenty years;
 * a full propagation solver would buy accuracy on geometry Marble
 * reconstructions do not have. Pure math: no three.js, no Web Audio.
 */
import { type VoxelGrid, type VoxelRoom, type VoxelPortal } from './VoxelRooms.js';
import type { Vec3 } from '../core/Statement.js';
export type { Vec3 };
export interface RoomGraph {
    grid: VoxelGrid;
    /** Per-voxel room id (segmentRooms' labels): >0 room, 0 portal/solid/outside. */
    labels: Int32Array;
    rooms: VoxelRoom[];
    portals: VoxelPortal[];
    /** room id → indices into `portals` touching that room. */
    adjacency: Map<number, number[]>;
}
export interface DiffractionPath {
    /** Every point the sound passes: listener, one per portal crossed, source. */
    points: Vec3[];
    /** Length of that polyline, metres — what the ear's distance cue hears. */
    lengthM: number;
    /**
     * Where to put the panner: along the bearing of the first crossing, at
     * the full path length. Direction from the doorway, level from the path.
     */
    apparent: Vec3;
    /** Total turning along the path, radians. 0 = straight through the door. */
    bendRad: number;
    /** Portal ids crossed, listener side first. */
    portalIds: number[];
}
/**
 * Smallest opening a sound is heard FROM, metres, on its narrower side.
 * Marble colliders are reconstructions: their shells have cracks, and the
 * segmentation faithfully reports every crack that joins two pockets of
 * free space as a "portal" (0.5 × 0.3 m holes on a real café). A crack is
 * not a doorway — nothing localizes to it — so the graph drops portals
 * narrower than this and the two spaces count as unjoined: no redirect, and
 * the raycast (which sees the wall) decides. Open windows and doorways pass.
 */
export declare const MIN_PORTAL_M = 0.5;
export declare function buildRoomGraph(grid: VoxelGrid, labels: Int32Array, rooms: VoxelRoom[], allPortals: VoxelPortal[], minPortalM?: number): RoomGraph;
/**
 * How far (in voxels) to look for a labelled voxel around a point that lands
 * on none — a source mounted ON a wall sits in a solid voxel, a listener in a
 * doorway stands on portal voxels. Three voxels is 0.75 m at the default
 * resolution: enough to reach the room a wall-mounted voice belongs to,
 * not enough to reach through the wall into the room behind it.
 */
export declare const ROOM_SEARCH_RADIUS_VOXELS = 3;
/**
 * The room a world point is in, or 0 when no room is within reach (outside
 * the grid's margin, or deep in solid geometry).
 */
export declare function roomAt(graph: RoomGraph, p: Vec3): number;
/**
 * Shortest chain of portals from the listener's room to the source's room,
 * as indices into `graph.portals`. Dijkstra over (portal, room-entered)
 * states with centroid-to-centroid metric costs. Null when no route exists —
 * the source is sealed away, and that is the raycast's case, not ours.
 */
export declare function shortestPortalChain(graph: RoomGraph, listener: Vec3, listenerRoom: number, source: Vec3, sourceRoom: number): number[] | null;
/**
 * Resolve how a source in another room reaches the listener. Null when the
 * two share a room (nothing to bend around), when either point is in no
 * room, or when no chain of portals joins them.
 */
export declare function resolveDiffraction(graph: RoomGraph, listener: Vec3, source: Vec3): DiffractionPath | null;
/**
 * Occlusion a path this bent should read as, on the engine's 0–1 scale
 * (`occlusionCutoffHz` / `occlusionGain` in WorldAcoustics). Ceiling below
 * a wall's 1.0 on purpose: a doorway always lets more through than plaster.
 *
 * A perceptual mapping, not a Fresnel integral: real edge diffraction loss
 * is frequency- and geometry-dependent in ways one lowpass cannot carry, so
 * this places the three cases people can hear — straight through (open),
 * around the jamb (~90°, a clearly darker room next door), and doubled back
 * (a corridor's worth of turning) — on the scalar the engine already muffles
 * with. Linear in the bend between them.
 */
export declare const DIFFRACTION_MAX_OCCLUSION = 0.7;
export declare function diffractionOcclusion01(bendRad: number): number;
//# sourceMappingURL=Diffraction.d.ts.map