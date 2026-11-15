/** Route kinematics: deceleration into a halt and acceleration out of it, m/s². */
export const ROUTE_BRAKE_MS2 = 3;
export const ROUTE_ACCEL_MS2 = 2;
/** A route instance sits this far above the strip's surface (a liquid strip: at the surface). */
export const ROUTE_HEIGHT_M = 0.8;
export const ROUTE_HEIGHT_LIQUID_M = 0.1;
/** Default spawn interval when a route entity declares no `every`. */
export const ROUTE_EVERY_DEFAULT = [6, 14];
/** Default halt length when `stop` names a chance but no range. */
export const ROUTE_STOP_DEFAULT = [2, 6];
/** The halt point is drawn uniformly along this middle fraction of the strip. */
export const ROUTE_STOP_BAND = 0.7;
/** A once-per-life (`chance`) sound of a route instance lands within this middle fraction of the run. */
export const ROUTE_CHANCE_BAND = 0.6;
/** A once-per-life sound of a population instance lands within its first N seconds. */
export const POPULATION_CHANCE_WINDOW_S = 60;
/** Per-instance pitch offset band: every member's pitch × (1 ± this). */
export const ENTITY_PITCH_SPREAD = 0.04;
/** Live-instance caps: per entity and across the scene (the panner budget). */
export const ENTITY_MAX_PER_CLASS = 6;
export const ENTITY_MAX_TOTAL = 24;
/** Route entities are seeded with up to this many instances at play, so the strip is not empty at t = 0. */
export const ROUTE_SEED_INSTANCES = 2;
/** Seeds land uniformly within this leading fraction of the strip (never on the exit). */
export const ROUTE_SEED_PROGRESS_MAX = 0.85;
/** Below this activity (`active` hours × `quiet` gates) an entity spawns nothing. */
export const ENTITY_ACTIVITY_MIN = 0.05;
/**
 * Population `count` bound. Raised from 12 when individuals became agents:
 * the count is how many bodies live in the world, `voices` how many of
 * them are localised at once — the panner budget bounds the latter.
 */
export const POPULATION_COUNT_MAX = 48;
/** Members fade out over this long when their instance retires. */
export const ENTITY_RETIRE_FADE_S = 0.25;
/** A voice-budget demotion crossfades over this long (spec 006, FR-007): never a cut on an audible body. */
export const ENTITY_UNVOICE_FADE_S = 2;
/**
 * Longest step the kinematics will integrate. The first tick after play()
 * and a stalled tab hand the engine a dt of seconds; a body must not
 * teleport off its strip because the browser was busy.
 */
export const ROUTE_MAX_STEP_S = 0.25;
/** Route cruise speed from the strip's `flow` when the entity names no `speed`: (4 + 16·flow) × 0.7..1.3. */
export const ROUTE_FLOW_SPEED_MIN_MS = 4;
export const ROUTE_FLOW_SPEED_MAX_MS = 20;
export const ROUTE_FLOW_SPEED_SPREAD = 0.3;
/**
 * Stride bounds, metres. The low end is a shuffle, the high end a stride no
 * body has — they exist so a typo (`gait 700`) fails loudly at parse rather
 * than silently producing a body that never steps.
 */
export const GAIT_STRIDE_MIN_M = 0.05;
export const GAIT_STRIDE_MAX_M = 20;
/**
 * Footfalls one tick may produce, however long the tick was. The first tick
 * after `play()` and a stalled tab hand the engine a dt of seconds; a body
 * must not fire forty steps to catch up on distance nobody heard it cover.
 */
export const GAIT_MAX_FALLS_PER_TICK = 2;
/** Fraction of the run completed in the direction of travel. */
export function routeProgress(arc, dir, len) {
    if (!(len > 0))
        return 0;
    const p = dir > 0 ? arc / len : 1 - arc / len;
    return p < 0 ? 0 : p > 1 ? 1 : p;
}
/**
 * Advance a route instance's kinematics by `dt` seconds at clock time `now`
 * (no allocation). Phases: cruise → (brake → idle → accelerate →) cruise →
 * done once the body leaves the strip's end in its direction of travel.
 * Returns true while the instance is still on the strip.
 */
export function advanceRoute(inst, dt, now) {
    if (inst.phase === 'done')
        return false;
    if (!(dt > 0))
        return true;
    if (dt > ROUTE_MAX_STEP_S)
        dt = ROUTE_MAX_STEP_S;
    const v0 = inst.velocity;
    let v = v0;
    switch (inst.phase) {
        case 'cruise': {
            if (inst.stopArc >= 0) {
                // Begin braking when the stopping distance at ROUTE_BRAKE_MS2 reaches the halt point.
                const ahead = inst.dir > 0 ? inst.stopArc - inst.arc : inst.arc - inst.stopArc;
                const stopDist = (v * v) / (2 * ROUTE_BRAKE_MS2);
                if (ahead >= 0 && ahead <= stopDist + v * dt)
                    inst.phase = 'brake';
            }
            break;
        }
        case 'brake': {
            v -= ROUTE_BRAKE_MS2 * dt;
            if (v <= 0) {
                v = 0;
                inst.phase = 'idle';
                inst.idleUntil = now + inst.idleS;
                inst.stopArc = -1;
            }
            break;
        }
        case 'idle': {
            v = 0;
            if (now >= inst.idleUntil)
                inst.phase = 'accelerate';
            break;
        }
        case 'accelerate': {
            v += ROUTE_ACCEL_MS2 * dt;
            if (v >= inst.cruise) {
                v = inst.cruise;
                inst.phase = 'cruise';
            }
            break;
        }
    }
    inst.velocity = v;
    inst.accel = (v - v0) / dt;
    // Mean speed over the step keeps the position consistent with the ramp.
    inst.arc += inst.dir * (v0 + v) * 0.5 * dt;
    inst.progress = routeProgress(inst.arc, inst.dir, inst.len);
    // Off once past the strip AND its roll-out (spec 006): the body recedes beyond earshot before it goes.
    const beyond = inst.rollOutM ?? 0;
    const off = inst.dir > 0 ? inst.arc > inst.len + beyond : inst.arc < -beyond;
    if (off) {
        inst.phase = 'done';
        return false;
    }
    return true;
}
/**
 * Advance a body's gait by one tick and return how many footfalls it made.
 *
 * A footfall is a distance event, not a timer: the body accumulates the
 * metres it actually travelled and puts a foot down every `stride` of them.
 * Everything a footstep system usually needs a binding for falls out of
 * that — a body that speeds up steps faster, a body braking into a halt
 * slows its steps and then stops, and a body standing still is silent —
 * without the script stating a rate anywhere.
 *
 * Pure and allocation-free; the engine turns each returned footfall into a
 * positioned event on the instance's own `on step` members, and the offline
 * renderer runs the same call, so a seed reproduces the same footfalls.
 */
export function advanceGait(inst, dt, distanceM) {
    if (!(inst.stride > 0) || !(dt > 0))
        return 0;
    const v = Math.abs(inst.velocity);
    if (!(v > 0) && distanceM === undefined)
        return 0;
    inst.strideAccum += distanceM === undefined
        ? v * (dt > ROUTE_MAX_STEP_S ? ROUTE_MAX_STEP_S : dt)
        : Math.max(0, distanceM);
    let falls = 0;
    while (inst.strideAccum >= inst.stride && falls < GAIT_MAX_FALLS_PER_TICK) {
        inst.strideAccum -= inst.stride;
        falls++;
    }
    // Distance past the cap is dropped rather than banked: a long tick is a
    // gap in the simulation, and banking it would fire those steps late, in a
    // burst, at a position the body has already left.
    if (inst.strideAccum >= inst.stride)
        inst.strideAccum = 0;
    inst.strideIndex = ((inst.strideIndex ?? 0) + falls) % 2;
    return falls;
}
//# sourceMappingURL=Entities.js.map