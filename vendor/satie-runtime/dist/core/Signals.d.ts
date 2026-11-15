/**
 * Signal-driven property bindings — the `follow` value form.
 *
 * A binding maps a MEASURED channel (a signal) through a clamped linear range
 * map onto a property, every spatial tick:
 *
 *   volume follow distance 60to5 0.05to0.7
 *   pitch  follow closing -30to30 0.85to1.18
 *
 * Signals are pure kinematics the engine can measure — nothing here knows what
 * a plane or a footstep is; meaning lives in the script that chooses the
 * mapping. The set is closed over what the runtime can actually measure:
 *
 *   distance — listener ↔ voice, meters
 *   closing  — radial velocity, m/s, positive = approaching
 *   speed    — listener speed, m/s
 *   gaze     — view alignment with the voice, −1..1 (1 = dead ahead)
 *
 * Members of an entity (SatieEngine's `entity` blocks) also read their own
 * body's kinematics — measured by the engine from the instance's motion, so a
 * loop can be silent at rest and an engine can pitch with speed without the
 * script knowing anything about roads:
 *
 *   velocity — the body's speed along its route, m/s (0 for a population)
 *   accel    — its acceleration, m/s² (negative while braking)
 *   progress — 0..1 along the route in its direction of travel (0 for a population)
 *   age      — seconds since the instance spawned
 *
 * The world under the listener (WorldFields.ts — measured from geometry every
 * spatial tick when a world, procedural or captured, is loaded):
 *
 *   depth     — the water column under the listener, metres (0 on dry ground)
 *   submerged — how far the listener's head is under a liquid surface, 0..1
 *   liquid    — 1 while the listener stands on a liquid feature, else 0
 *
 * On an `on <event>` voice a `when` over one of these reads the field at the
 * EVENT's point (the payload) before the listener's — a stride that landed in
 * 0.6 m of water selects the wading take even if the head is dry.
 *
 * Input ranges may be inverted (`60to5`): the input low end maps to the output
 * low end by POSITION IN THE RANGE, not by numeric order — `60to5 0.05to0.7`
 * reads "at 60 m be 0.05, at 5 m be 0.7", which is how scripts think.
 */
export interface FollowBinding {
    /** Signal name (see KNOWN_SIGNALS). */
    signal: string;
    /** Input range — inMin may exceed inMax (inverted mapping). */
    inMin: number;
    inMax: number;
    /** Output range the property lands in. */
    outMin: number;
    outMax: number;
    /**
     * `pow <k>` — response curve: the clamped position in the input range is
     * raised to this power before projecting onto the output (1 = linear;
     * > 1 holds low, then rises steeply; < 1 rises early). Absent = 1.
     */
    curve?: number;
}
/** Bounds of the `pow` curve exponent. */
export declare const FOLLOW_CURVE_MIN = 0.1;
export declare const FOLLOW_CURVE_MAX = 6;
/**
 * Signals the runtime measures itself, with what each reads. One table: the parser checks names
 * against it, and the sound director, the composer and the audit read the meanings from it, so a
 * channel the engine gains is known everywhere at once (2026-10-16).
 */
export declare const MEASURED_SIGNALS: readonly {
    name: string;
    meaning: string;
}[];
/** Signal names the runtime can measure. The parser warns on anything else — a signal nothing
 * measures (or the game supplies) can never drive a property. */
export declare const KNOWN_SIGNALS: readonly string[];
/**
 * `when <signal> <lo>to<hi>` — an edge-triggered band over a signal: the
 * voice fires when the signal enters [min, max], and can fire again only
 * after leaving the band (plus its cooldown).
 */
export interface WhenCondition {
    signal: string;
    min: number;
    max: number;
}
/**
 * Map a signal sample through a binding: position within the input range
 * (clamped 0..1, raised to the binding's `curve` when one is set) projected
 * onto the output range. A degenerate input range acts as a threshold at inMin.
 */
export declare function mapFollow(b: FollowBinding, x: number): number;
//# sourceMappingURL=Signals.d.ts.map