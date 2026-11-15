/**
 * Authored waypoint paths — `path <name>` blocks (scene-graph spec §6).
 *
 * A path is 5–15 `waypoint x y z [t]` lines a hand can grab: the curve runs
 * THROUGH every waypoint (centripetal Catmull-Rom — provably no cusps or
 * self-intersection between unevenly spaced points, which hand-placed
 * waypoints always are), and playback traverses it by ARC LENGTH, never by
 * parameter — parameter-space speed wobble is audible in a spatial-audio
 * tool, not just visible. The compiled result is the engine's existing
 * normalized-LUT trajectory form, so live playback and every export path
 * consume a drawn path through machinery that already exists.
 *
 * No tangent handles, by design: centripetal Catmull-Rom is "auto mode
 * always" — the right ceiling for a line-per-waypoint plaintext format.
 */
export interface PathWaypoint {
    x: number;
    y: number;
    z: number;
    /** Arrive at this many seconds into the cycle; null = spaced by arc length. */
    t: number | null;
}
export type PathLoopMode = 'repeat' | 'bounce' | 'once';
export interface PathDef {
    name: string;
    waypoints: PathWaypoint[];
    /** Seconds for one full traversal (mutually exclusive with speedMs). */
    cycleS: number | null;
    /** Metres per second along the curve (mutually exclusive with cycleS). */
    speedMs: number | null;
    loop: PathLoopMode;
    closed: boolean;
    /** 1-based original script line of the `path <name>` header. */
    lineNumber: number;
}
export interface CompiledPath {
    /** Interleaved xyz, NORMALIZED to [0,1]³ within the bbox — the LUT form. */
    lut: Float32Array;
    pointCount: number;
    bboxMin: {
        x: number;
        y: number;
        z: number;
    };
    bboxMax: {
        x: number;
        y: number;
        z: number;
    };
    /** Curve length in metres (there-and-back for bounce). */
    lengthM: number;
    /** Cycles per second the voice should traverse at. */
    cycleHz: number;
}
/**
 * Compile a path definition into the normalized-LUT trajectory form.
 *
 * Pacing: constant arc-length speed by default; a waypoint with a time pins
 * the traversal (arrive there at t seconds), with untimed spans between pins
 * paced by their arc-length share. `bounce` bakes the return leg into the
 * LUT, so one cycle is there-and-back. For `once`, live and offline callers
 * clamp phase and ask the LUT to hold its terminal sample.
 */
export declare function compilePath(def: PathDef): CompiledPath | null;
//# sourceMappingURL=Paths.d.ts.map