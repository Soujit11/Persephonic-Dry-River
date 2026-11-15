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
/** Bounds of the `pow` curve exponent. */
export const FOLLOW_CURVE_MIN = 0.1;
export const FOLLOW_CURVE_MAX = 6;
/**
 * Signals the runtime measures itself, with what each reads. One table: the parser checks names
 * against it, and the sound director, the composer and the audit read the meanings from it, so a
 * channel the engine gains is known everywhere at once (2026-10-16).
 */
export const MEASURED_SIGNALS = [
    { name: 'distance', meaning: 'listener to the sound, metres' },
    { name: 'closing', meaning: 'how fast the sound approaches, m/s (negative when it moves away)' },
    { name: 'speed', meaning: 'the listener\'s speed, m/s' },
    { name: 'gaze', meaning: 'how directly the listener looks at the sound, -1..1 (1 = dead ahead)' },
    { name: 'velocity', meaning: 'an entity body\'s speed along its route, m/s' },
    { name: 'accel', meaning: 'an entity body\'s acceleration, m/s² (negative while braking)' },
    { name: 'progress', meaning: 'an entity body\'s position along its route, 0..1' },
    { name: 'age', meaning: 'seconds since an entity instance spawned' },
    { name: 'depth', meaning: 'the water column under the listener, metres (0 on dry ground)' },
    { name: 'submerged', meaning: 'how far the listener\'s head is under a liquid surface, 0..1' },
    { name: 'liquid', meaning: '1 while the listener stands on a liquid feature, else 0' },
    { name: 'indoors', meaning: '1 while the listener is inside any placed room, eased at its walls, else 0' },
    { name: 'in_<room>', meaning: '1 while the listener is inside that placed room, eased at its walls, else 0' },
];
/** Signal names the runtime can measure. The parser warns on anything else — a signal nothing
 * measures (or the game supplies) can never drive a property. */
export const KNOWN_SIGNALS = MEASURED_SIGNALS.map(s => s.name);
/**
 * Map a signal sample through a binding: position within the input range
 * (clamped 0..1, raised to the binding's `curve` when one is set) projected
 * onto the output range. A degenerate input range acts as a threshold at inMin.
 */
export function mapFollow(b, x) {
    const span = b.inMax - b.inMin;
    const t = span === 0 ? (x >= b.inMin ? 1 : 0) : (x - b.inMin) / span;
    let c = t < 0 ? 0 : t > 1 ? 1 : t;
    const k = b.curve;
    if (k !== undefined && k !== 1)
        c = Math.pow(c, k);
    return b.outMin + (b.outMax - b.outMin) * c;
}
//# sourceMappingURL=Signals.js.map