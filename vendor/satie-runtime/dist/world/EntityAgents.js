import { ROUTE_HEIGHT_LIQUID_M, ROUTE_HEIGHT_M } from '../core/Entities.js';
import { attachPoint, featureArcLength, featureById, featurePointAtArcInto, heightAt, isLiquidAt, objectsOf } from './worldRealize.js';
export const AGENT_DWELL_DEFAULT = [60, 240];
export const AGENT_RELOCATE_DEFAULT_M = [5, 30];
export const AGENT_SPEED_DEFAULT_MS = [2, 6];
export const AGENT_HUSH_DEFAULT_S = [8, 20];
/** Effective detection radius of a forest bird is ~128 m (Haupert et al. 2023); the window defaults there. */
export const AGENT_WINDOW_DEFAULT_M = 120;
export function defaultAgentParams() {
    return {
        relocates: false,
        dwellS: [AGENT_DWELL_DEFAULT[0], AGENT_DWELL_DEFAULT[1]],
        relocateM: [AGENT_RELOCATE_DEFAULT_M[0], AGENT_RELOCATE_DEFAULT_M[1]],
        travel: 'auto',
        speedMs: [AGENT_SPEED_DEFAULT_MS[0], AGENT_SPEED_DEFAULT_MS[1]],
        startleM: 0,
        hushS: [AGENT_HUSH_DEFAULT_S[0], AGENT_HUSH_DEFAULT_S[1]],
        callChance: 1,
        callers: 0,
        gapS: [0, 0],
        voices: 0,
        windowM: AGENT_WINDOW_DEFAULT_M,
        swayM: 0,
    };
}
/** Draw from a `[min, max]` band. */
export function drawRange(r, rng) {
    return r[0] === r[1] ? r[0] : r[0] + (r[1] - r[0]) * rng();
}
/** Spacing of anchors along a strip's centreline / a patch's rim, metres. */
export const ANCHOR_SPACING_M = 4;
/** Most anchors a feature contributes (a long river is sampled coarser). */
export const ANCHOR_FEATURE_MAX = 96;
/** Ground anchors drawn for a `ground` host, and the band (from the origin) they land in. */
export const ANCHOR_GROUND_COUNT = 32;
export const ANCHOR_GROUND_MIN_M = 4;
export const ANCHOR_GROUND_MAX_M = 30;
/** A perch this far above the terrain is reached by flight when `travel` is `auto`. */
export const RAISED_M = 1;
/** Clearance a walked or ground-perched body keeps above the terrain. */
export const WALK_CLEARANCE_M = 0.3;
const SCRATCH = { x: 0, y: 0, z: 0 };
/**
 * Every point of the world an individual of this host may sit on. Resolved
 * the way `at` resolves a host — by looking the id up, never by what it
 * means: a class or fixture id → the attach point of every object of it; a
 * strip / patch id → points every `ANCHOR_SPACING_M` along its polyline (a
 * liquid feature 0.1 m above the surface, a paved one 0.8 m); `ground` →
 * `ANCHOR_GROUND_COUNT` seeded dry points 4–30 m from the origin. Anything
 * else (no world, no host, an unknown id) → none: the individual sits where
 * the engine put it and never relocates.
 */
/** Standing room per resident inside an area, metres between anchors. */
export const AREA_RESIDENT_SPACING_M = 0.7;
/**
 * `count` points spread over a disc (a sunflower spiral), out to `radius`:
 * every resident of an area gets its own place inside it, not a share of one
 * rim point (2026-10-02: four cafe customers on a 0.7 m patch stood on one
 * anchor and drew as one person).
 */
export function areaResidentPoints(centre, radius, count) {
    const out = [];
    if (count <= 0)
        return out;
    if (count === 1)
        return [[centre[0], centre[1]]];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const r = radius * Math.sqrt((i + 0.5) / count);
        const a = i * golden;
        out.push([centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r]);
    }
    return out;
}
export function resolveAnchors(world, hostRef, attach, rng, relocation, count = 1, geometry) {
    const out = [];
    if (!world || !hostRef)
        return out;
    if (hostRef === 'ground') {
        // The ground reaches as far as the drawing does (2026-10-09): a sound world sized 24 m under a
        // drawn forest 80 m across kept every ground anchor within 11 m of the origin.
        const half = Math.max(world.spec.sizeM / 2, geometry?.groundHalfM() ?? 0);
        const maxR = Math.min(ANCHOR_GROUND_MAX_M, half * 0.9);
        for (let n = 0, attempts = 0; n < ANCHOR_GROUND_COUNT && attempts < ANCHOR_GROUND_COUNT * 4; attempts++) {
            const a = rng() * Math.PI * 2;
            const d = ANCHOR_GROUND_MIN_M + rng() * Math.max(0, maxR - ANCHOR_GROUND_MIN_M);
            const x = Math.sin(a) * d, z = Math.cos(a) * d;
            if (isLiquidAt(world, x, z))
                continue;
            const g = heightAt(world.heightfield, x, z);
            out.push({ x, y: g + WALK_CLEARANCE_M, z, id: null, groundY: g });
            n++;
        }
        return out;
    }
    const objects = objectsOf(world, hostRef);
    if (objects.length) {
        for (const o of objects) {
            const p = geometry ? geometry.attachOf(o, attach) : attachPoint(o, attach);
            out.push({ x: p.x, y: p.y, z: p.z, id: o.id, groundY: o.position.y });
        }
        return out;
    }
    const f = featureById(world, hostRef);
    if (f) {
        const len = featureArcLength(f);
        if (!(len > 0))
            return out;
        // Small walking steps need reachable destinations. A fixed four-metre
        // lattice stranded every actor whose maximum relocation was shorter.
        const spacing = relocation && relocation[1] > 0
            ? Math.min(ANCHOR_SPACING_M, Math.max(0.1, (relocation[0] + relocation[1]) / 2))
            : ANCHOR_SPACING_M;
        const n = Math.max(1, Math.min(ANCHOR_FEATURE_MAX, (relocation ? Math.ceil(len / spacing) : Math.floor(len / spacing))));
        // A population on an area: one place each, inside it. The rim lattice below is for
        // lines and for movers with room to move; a small patch gives it fewer points than
        // there are bodies, whether they stand (2026-10-02) or walk about it (2026-10-03: a
        // population given a walk for its footsteps went back to two points for four bodies).
        // Bodies that move need somewhere free to go: a relocating population gets twice as many places
        // as bodies (one each was every place taken and nobody ever moving, 2026-10-03).
        const places = relocation ? Math.min(ANCHOR_FEATURE_MAX, count * 2) : count;
        if (f.kind === 'patch' && f.centre && f.halfM > 0 && (count > 1 || relocation) && (!relocation || n < places)) {
            const reach = Math.max(0.15, f.halfM - 0.25);
            const fit = Math.max(places, Math.floor(len / ANCHOR_SPACING_M));
            for (const [x, z] of areaResidentPoints(f.centre, Math.max(reach, Math.min(f.halfM, AREA_RESIDENT_SPACING_M * Math.sqrt(count) / 2)), fit)) {
                const g = heightAt(world.heightfield, x, z);
                out.push({ x, y: (f.surfaceY ?? g) + (f.liquid ? ROUTE_HEIGHT_LIQUID_M : ROUTE_HEIGHT_M), z, id: null, groundY: g });
            }
            return out;
        }
        const lift = f.liquid ? ROUTE_HEIGHT_LIQUID_M : ROUTE_HEIGHT_M;
        for (let i = 0; i < n; i++) {
            const s = n === 1 ? len / 2 : (i + 0.5) * (len / n);
            if (!featurePointAtArcInto(f, s, SCRATCH))
                continue;
            // Moving residents occupy the area, not its exact boundary. Leave room
            // for the bounded bend between anchors so a wader cannot step onto the
            // dry deck while travelling between two water anchors.
            if (relocation && f.kind === 'patch' && f.centre && f.halfM > 0) {
                const inset = Math.min(f.halfM * 0.5, Math.max(0.25, relocation[1] * SEGMENT_BEND_FRACTION));
                const scale = 1 - inset / f.halfM;
                SCRATCH.x = f.centre[0] + (SCRATCH.x - f.centre[0]) * scale;
                SCRATCH.z = f.centre[1] + (SCRATCH.z - f.centre[1]) * scale;
            }
            const g = heightAt(world.heightfield, SCRATCH.x, SCRATCH.z);
            out.push({ x: SCRATCH.x, y: SCRATCH.y + lift, z: SCRATCH.z, id: null, groundY: g });
        }
    }
    return out;
}
/** Index of the anchor on object `id`, else the nearest anchor to (x, y, z); −1 when there are none. */
export function nearestAnchor(anchors, x, y, z, id = null) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        if (id !== null && a.id === id)
            return i;
        const dx = a.x - x, dy = a.y - y, dz = a.z - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    return best;
}
function dist3(a, x, y, z) {
    const dx = a.x - x, dy = a.y - y, dz = a.z - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Ground-plane distance — how a threat on foot relates to a perch up a tree. */
function dist2(a, x, z) {
    const dx = a.x - x, dz = a.z - z;
    return Math.sqrt(dx * dx + dz * dz);
}
/**
 * An unoccupied anchor within `[min, max]` metres of the current one, drawn
 * at random among the candidates (reservoir sample — no allocation). −1 when
 * none qualifies; the caller then stays for another bout.
 */
export function chooseRelocation(anchors, from, band, occupied, rng) {
    if (from < 0 || from >= anchors.length)
        return -1;
    const a = anchors[from];
    let chosen = -1, seen = 0;
    for (let i = 0; i < anchors.length; i++) {
        if (i === from || occupied.has(i))
            continue;
        const d = dist3(anchors[i], a.x, a.y, a.z);
        if (d < band[0] || d > band[1])
            continue;
        seen++;
        if (rng() * seen < 1)
            chosen = i;
    }
    return chosen;
}
/**
 * Where to flee: an unoccupied anchor FARTHER from the threat (on the
 * ground plane — the threat walks, the perch is up a tree) than the
 * current perch and beyond `clearM` of it, within twice the relocation
 * band's reach, preferring the ones that gain the most distance (drawn
 * among the best three so a flock does not converge on one tree). −1 when
 * nothing qualifies — the agent then hushes where it sits.
 */
export function chooseFlight(anchors, from, threatX, threatY, threatZ, band, occupied, rng, clearM = 0) {
    void threatY;
    if (from < 0 || from >= anchors.length)
        return -1;
    const a = anchors[from];
    const here = dist2(a, threatX, threatZ);
    const reach = Math.max(band[1] * 2, band[0]);
    // Best three by distance gained, insertion-sorted in fixed slots.
    let b0 = -1, b1 = -1, b2 = -1, g0 = 0, g1 = 0, g2 = 0;
    for (let i = 0; i < anchors.length; i++) {
        if (i === from || occupied.has(i))
            continue;
        const hop = dist3(anchors[i], a.x, a.y, a.z);
        if (hop < band[0] || hop > reach)
            continue;
        const away = dist2(anchors[i], threatX, threatZ);
        const gain = away - here;
        if (gain <= 0 || away <= clearM)
            continue;
        if (gain > g0) {
            b2 = b1;
            g2 = g1;
            b1 = b0;
            g1 = g0;
            b0 = i;
            g0 = gain;
        }
        else if (gain > g1) {
            b2 = b1;
            g2 = g1;
            b1 = i;
            g1 = gain;
        }
        else if (gain > g2) {
            b2 = i;
            g2 = gain;
        }
    }
    const n = b0 < 0 ? 0 : b1 < 0 ? 1 : b2 < 0 ? 2 : 3;
    if (n === 0)
        return -1;
    const k = Math.min(n - 1, Math.floor(rng() * n));
    return k === 0 ? b0 : k === 1 ? b1 : b2;
}
/** A flight rises by a fifth of its length, between these bounds, so it clears what it flies over. */
export const FLIGHT_LIFT_MIN_M = 1;
export const FLIGHT_LIFT_MAX_M = 6;
/** A route bends by up to this fraction of its own length, capped in metres. */
export const SEGMENT_BEND_FRACTION = 0.18;
export const SEGMENT_BEND_MAX_M = 4;
/**
 * Ease-in-out along a segment.
 *
 * A body used to cover its route at a constant speed, so it snapped from rest
 * to walking pace and stopped dead on arrival. Smoothstep starts and ends at
 * zero speed, which is what walking does — and because `gait` derives its
 * cadence from speed, the footsteps slow into a stop and build out of one
 * without anything saying so.
 */
export function easeSegment(u) {
    return u * u * (3 - 2 * u);
}
/**
 * Speed along the eased route as a multiple of the average, 0 at both ends
 * and 1.5 in the middle (the derivative of `easeSegment`). What `stepAgent`
 * reports as `velocity`, so every `follow velocity` binding and the gait see
 * the real pace rather than a constant.
 */
export function easeSegmentRate(u) {
    return 6 * u * (1 - u);
}
/** The pace multiplier for a segment at `u` — 1 throughout when it does not ease. */
export function segmentRate(s, u) {
    return s.eased ? easeSegmentRate(u) : 1;
}
/** Shortest segment (a hop to the next branch is not instantaneous). */
export const SEGMENT_MIN_S = 0.4;
export function makeSegment(from, to, travel, speedMs, t0, bend = 0, eased = true) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const raised = from.y - from.groundY > RAISED_M || to.y - to.groundY > RAISED_M;
    const walk = travel === 'walk' || (travel === 'auto' && !raised);
    const lift = walk ? 0 : Math.min(FLIGHT_LIFT_MAX_M, Math.max(FLIGHT_LIFT_MIN_M, len * 0.2));
    return {
        x0: from.x, y0: from.y, z0: from.z, x1: to.x, y1: to.y, z1: to.z,
        lift, bend, eased, walk, t0, durS: Math.max(SEGMENT_MIN_S, len / Math.max(0.1, speedMs)),
    };
}
/** Straight-line length of a segment, metres. */
export function segmentLength(s) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, dz = s.z1 - s.z0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/**
 * The body's position at clock time `now` along the segment, written into
 * `out`: a linear glide with a sine lift for a flight, the terrain's height
 * plus clearance for a walk (`groundY` — the world's heightfield; null =
 * the straight line). Returns the progress 0..1 (1 = arrived).
 */
export function segmentPositionInto(s, now, out, groundY) {
    let u = s.durS > 0 ? (now - s.t0) / s.durS : 1;
    if (u < 0)
        u = 0;
    else if (u > 1)
        u = 1;
    // Eased along the route, and bent off the straight line — the two things
    // that separate a person walking somewhere from a point being interpolated.
    // The RAW u is still what is returned, because arrival is a fact about the
    // clock, not about the easing.
    const e = s.eased ? easeSegment(u) : u;
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
    out.x = s.x0 + dx * e;
    out.z = s.z0 + dz * e;
    if (s.bend !== 0) {
        const flat = Math.sqrt(dx * dx + dz * dz);
        if (flat > 1e-6) {
            // Perpendicular in the ground plane, peaking at the midpoint.
            const off = s.bend * Math.sin(Math.PI * e);
            out.x += (-dz / flat) * off;
            out.z += (dx / flat) * off;
        }
    }
    if (s.walk && groundY)
        out.y = groundY(out.x, out.z) + WALK_CLEARANCE_M;
    else
        out.y = s.y0 + (s.y1 - s.y0) * e + s.lift * Math.sin(Math.PI * e);
    return u;
}
export const AGENT_GOALS = ['call', 'rest', 'roam', 'flee'];
export function agentGoal(a) {
    return a.state === 'calling' ? 'call' : a.state === 'silent' ? 'rest' : a.state === 'fleeing' ? 'flee' : 'roam';
}
/** The plan in one line: what it is doing, for how long, and what comes next. */
export function describePlan(a, p, now, forced = null) {
    const left = Number.isFinite(a.until) ? Math.max(0, Math.round(a.until - now)) : null;
    const next = forced ? `then ${forced === 'call' ? 'calls' : forced === 'rest' ? 'rests' : forced === 'roam' ? 'moves on' : 'flees'} (forced)` : a.fled ? 'then a bout here' : p.relocates ? 'then moves to another perch' : 'then a new bout';
    switch (a.state) {
        case 'calling': return left === null ? 'calling from its perch' : `calling for ${left} s, ${next}`;
        case 'silent': return left === null ? 'resting on its perch' : `${a.fled ? 'hushed' : 'resting'} for ${left} s, ${next}`;
        case 'relocating': return `moving to its next perch${left === null ? '' : `, ${left} s`}`;
        case 'fleeing': return `fleeing${left === null ? '' : `, ${left} s`}`;
    }
}
export function newAgent(anchor, speedMs, phase = 0) {
    return { state: 'calling', anchor, until: Infinity, seg: null, fled: false, speedMs, voiced: true, phase };
}
/**
 * Where a perched body actually stands at `now`: its anchor, plus a slow
 * shift of up to `swayM`.
 *
 * A SUM OF INCOMMENSURATE SINES, not noise. Their periods share no common
 * multiple, so the motion never visibly repeats, and it is a pure function of
 * (time, phase) — no state, no rng, nothing to reproduce, so a seeded run
 * still renders identically. Borrowed from the crowd sim in
 * `attractor-labs/apps/Social Sims/finc-demo-day` (`sim.ts`), which needed
 * the same thing for the same reason.
 *
 * It deliberately does NOT touch `velocity`: swaying is not travelling, and a
 * body whose sway counted as speed would step forever on the spot, since
 * `gait` turns distance covered into footfalls.
 */
export function swayInto(out, base, swayM, now, phase) {
    out.x = base.x + swayM * (0.62 * Math.sin(now / 1.9 + phase) + 0.34 * Math.sin(now / 0.73 + phase * 2.3));
    out.y = base.y;
    out.z = base.z + swayM * (0.5 * Math.sin(now / 1.5 + phase * 1.4) + 0.25 * Math.sin(now / 0.64 + phase));
}
/**
 * Begin a perch bout at the current anchor: calling with probability
 * `callChance`, else silent, for a drawn `dwell`. Returns the transition.
 */
export function beginBout(agent, p, now, rng, forced = null) {
    const calling = forced === 'call' ? true : forced === 'rest' ? false : p.callChance >= 1 || (p.callChance > 0 && rng() < p.callChance);
    agent.state = calling ? 'calling' : 'silent';
    agent.until = now + drawRange(p.dwellS, rng);
    agent.seg = null;
    return calling ? 'call' : 'hush';
}
/**
 * Send the agent to anchor `to` along a segment from where it is. Marks the
 * new anchor occupied and frees the old one.
 */
function depart(agent, anchors, to, p, occupied, position, now, flee, rng) {
    const from = agent.anchor >= 0
        ? anchors[agent.anchor]
        : { x: position.x, y: position.y, z: position.z, id: null, groundY: position.y };
    occupied.delete(agent.anchor);
    // A flight from a threat is a straight line — nobody curves away from a
    // bang. An ordinary walk bends, by a different amount every time.
    const dx = anchors[to].x - from.x, dz = anchors[to].z - from.z;
    const flat = Math.sqrt(dx * dx + dz * dz);
    const bend = flee || !rng
        ? 0
        : (rng() - 0.5) * 2 * Math.min(SEGMENT_BEND_MAX_M, flat * SEGMENT_BEND_FRACTION);
    agent.seg = makeSegment(from, anchors[to], p.travel, flee ? agent.speedMs * FLEE_SPEED_FACTOR : agent.speedMs, now, bend, !flee);
    agent.anchor = to;
    occupied.add(to);
    agent.state = flee ? 'fleeing' : 'relocating';
    agent.until = now + agent.seg.durS;
    agent.fled = flee;
}
/**
 * Send an agent to the anchor nearest a point — a body going somewhere
 * because it DECIDED to, rather than because the rng picked a perch.
 *
 * The relocation machinery is unchanged: it departs along a real segment at
 * the individual's own speed, arrives, and begins a bout there, so a steered
 * walk is indistinguishable from a wandered one except in where it ends up.
 *
 * Refuses (returns false) while the body is already in flight — interrupting
 * a segment would teleport it — and when the host offers no free anchor near
 * the point.
 */
export function steerAgent(agent, p, anchors, occupied, position, tx, ty, tz, now, rng) {
    if (agent.state === 'relocating' || agent.state === 'fleeing')
        return false;
    if (!anchors.length)
        return false;
    // Nearest FREE anchor to the target: the one they asked for may be taken,
    // and standing on someone is worse than standing near them.
    let best = -1, bestD = Infinity;
    for (let i = 0; i < anchors.length; i++) {
        if (i === agent.anchor || occupied.has(i))
            continue;
        const a = anchors[i];
        const dx = a.x - tx, dy = a.y - ty, dz = a.z - tz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    if (best < 0)
        return false;
    depart(agent, anchors, best, p, occupied, position, now, false, rng);
    return true;
}
/** A startled body moves this much faster than its relocation speed. */
export const FLEE_SPEED_FACTOR = 1.6;
/**
 * Flee from a threat at (tx, ty, tz): to a farther free anchor when the
 * world has one, else a hush in place. Only a perched agent can be
 * startled — one already in the air keeps its flight. Returns the
 * transition, or null when nothing happened.
 */
export function startleAgent(agent, p, anchors, occupied, position, tx, ty, tz, ctx) {
    if (agent.state === 'relocating' || agent.state === 'fleeing')
        return null;
    const to = chooseFlight(anchors, agent.anchor, tx, ty, tz, p.relocateM, occupied, ctx.rng, p.startleM);
    if (to >= 0) {
        depart(agent, anchors, to, p, occupied, position, ctx.now, true, ctx.rng);
    }
    else {
        agent.state = 'silent';
        agent.until = ctx.now + drawRange(p.hushS, ctx.rng);
        agent.fled = true;
    }
    return 'startle';
}
/**
 * Advance one agent by one tick. Writes the body's `position` and returns
 * its speed along the segment (0 at a perch) in `velocityOut[0]`; every
 * transition it makes is pushed to `transitions` (cleared by the caller).
 */
export function stepAgent(agent, p, anchors, occupied, position, ctx, transitions, forced = null) {
    const now = ctx.now;
    let velocity = 0;
    if (agent.state === 'relocating' || agent.state === 'fleeing') {
        const seg = agent.seg;
        const u = segmentPositionInto(seg, now, position, ctx.groundY);
        // The eased pace, not the average: `follow velocity` bindings and the
        // gait both read this, so footsteps build out of a standstill and slow
        // into one without anything in the script saying so.
        velocity = (segmentLength(seg) / seg.durS) * segmentRate(seg, u);
        if (u >= 1) {
            const a = anchors[agent.anchor];
            if (a) {
                position.x = a.x;
                position.y = a.y;
                position.z = a.z;
            }
            transitions.push('perch');
            velocity = 0;
            if (agent.fled) {
                agent.state = 'silent';
                agent.until = now + drawRange(p.hushS, ctx.rng);
                agent.seg = null;
                transitions.push('hush');
            }
            else {
                transitions.push(beginBout(agent, p, now, ctx.rng, forced));
            }
        }
        return velocity;
    }
    // Perched: shift on the spot, if this body does that at all. Written before
    // the startle test so a swaying body is still tested against where it
    // actually is.
    if (p.swayM > 0 && agent.anchor >= 0 && agent.anchor < anchors.length) {
        swayInto(position, anchors[agent.anchor], p.swayM, now, agent.phase);
    }
    // Perched: the listener closing within the startle radius comes first —
    // measured on the ground plane, since a perch is up a tree and the
    // threat walks under it.
    if (p.startleM > 0) {
        const dx = position.x - ctx.listenerX, dz = position.z - ctx.listenerZ;
        if (dx * dx + dz * dz <= p.startleM * p.startleM) {
            const t = startleAgent(agent, p, anchors, occupied, position, ctx.listenerX, ctx.listenerY, ctx.listenerZ, ctx);
            if (t)
                transitions.push(t);
            const seg = agent.seg;
            if (seg) {
                const u = segmentPositionInto(seg, now, position, ctx.groundY);
                return (segmentLength(seg) / seg.durS) * segmentRate(seg, u);
            }
            return 0;
        }
    }
    if (now >= agent.until) {
        // A forced flight: away from the listener, startle radius or not, once per bout.
        if (forced === 'flee' && !agent.fled) {
            const t = startleAgent(agent, p, anchors, occupied, position, ctx.listenerX, ctx.listenerY, ctx.listenerZ, ctx);
            if (t) {
                transitions.push(t);
                const seg = agent.seg;
                if (seg) {
                    const u = segmentPositionInto(seg, now, position, ctx.groundY);
                    return (segmentLength(seg) / seg.durS) * segmentRate(seg, u);
                }
                return 0;
            }
        }
        // A hush ends in a bout at this perch; relocation waits for the bout.
        if (agent.fled) {
            agent.fled = false;
            transitions.push(beginBout(agent, p, now, ctx.rng, forced));
            return 0;
        }
        // A forced roam relocates even a population that never moves on its own; a forced bout never relocates.
        if ((p.relocates && forced !== 'call' && forced !== 'rest') || forced === 'roam') {
            const to = chooseRelocation(anchors, agent.anchor, p.relocateM, occupied, ctx.rng);
            if (to >= 0) {
                depart(agent, anchors, to, p, occupied, position, now, false, ctx.rng);
                transitions.push('relocate');
                const u = segmentPositionInto(agent.seg, now, position, ctx.groundY);
                return (segmentLength(agent.seg) / agent.seg.durS) * segmentRate(agent.seg, u);
            }
        }
        transitions.push(beginBout(agent, p, now, ctx.rng, forced));
    }
    return 0;
}
// ── Chorus arbiter: turn-taking, by number ─────────────────────────────
/**
 * Per-entity turn-taking: at most `callers` individuals sounding a timed
 * call at once, and at least `gap` seconds between two call starts. A
 * refused call is retried by the engine a moment later, never dropped —
 * the chorus thins, it does not lose voices. Configured by number only;
 * a chorus of crickets is `callers 0` (everyone), a duetting pair
 * `callers 1 gap 2to5`.
 */
export class ChorusArbiter {
    /** Instance number → clock time its current call ends. */
    busy = new Map();
    lastStart = -Infinity;
    nextGap = 0;
    /** May instance `n` start a call at `now`? */
    mayCall(_n, now, p) {
        if (p.callers > 0) {
            // The caller's own unfinished call counts: a call is its take, and a
            // body cannot renew its slot every `every` and hold the floor for good.
            let active = 0;
            for (const [k, until] of this.busy) {
                if (until <= now)
                    this.busy.delete(k);
                else
                    active++;
            }
            if (active >= p.callers)
                return false;
        }
        if (now - this.lastStart < this.nextGap)
            return false;
        return true;
    }
    /** Instance `n` started a call at `now` that lasts `durS`. */
    noteCall(n, now, durS, p, rng) {
        this.busy.set(n, now + Math.max(0, durS));
        this.lastStart = now;
        this.nextGap = drawRange(p.gapS, rng);
    }
    /** How many individuals are mid-call at `now`. */
    activeCallers(now) {
        let active = 0;
        for (const until of this.busy.values())
            if (until > now)
                active++;
        return active;
    }
    forget(n) { this.busy.delete(n); }
    clear() { this.busy.clear(); this.lastStart = -Infinity; this.nextGap = 0; }
}
/** A refused call is retried after this long (a band, so retries de-phase). */
export const CALL_RETRY_S = [0.5, 1.5];
// ── Representation ladder: bed ↔ localised voice ───────────────────────
/** A voiced individual keeps its voice out to this multiple of the window (no flapping at the edge). */
export const LADDER_HYSTERESIS = 1.15;
/** An unvoiced individual displaces a voiced one only when it is this much nearer, metres. */
export const LADDER_SWAP_M = 3;
/**
 * Which individuals should have voices: at most `budget` of them, the
 * nearest within the window. `distances[i]` is the listener
 * distance of individual i, `voiced[i]` its current state; the decision is
 * written to `out[i]`. Sticky by design: a voiced individual counts as
 * `LADDER_SWAP_M` nearer than it is and keeps its voice out to
 * `LADDER_HYSTERESIS × window`, so a listener standing still never hears
 * the ladder hunt. `order` is scratch (indices, length ≥ n).
 */
export function ladderSelect(distances, voiced, budget, windowM, out, order) {
    const n = distances.length;
    for (let i = 0; i < n; i++)
        order[i] = i;
    const eff = (i) => (voiced[i] ? distances[i] - LADDER_SWAP_M : distances[i]);
    // Insertion sort: n is a population (≤ 48), and it is nearly sorted between ticks.
    for (let i = 1; i < n; i++) {
        const v = order[i], e = eff(v);
        let j = i - 1;
        while (j >= 0 && eff(order[j]) > e) {
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = v;
    }
    let taken = 0;
    for (let k = 0; k < n; k++) {
        const i = order[k];
        const limit = voiced[i] ? windowM * LADDER_HYSTERESIS : windowM;
        const fits = distances[i] <= limit && taken < budget;
        out[i] = fits;
        if (fits)
            taken++;
    }
}
//# sourceMappingURL=EntityAgents.js.map