/**
 * Entity agents — an individual of a population as a world-anchored AGENT,
 * not an emitter that rides the listener.
 *
 * A bird does not follow you. It sings from a perch it chose, moves perch to
 * perch now and then, and flies off when you come too close. This module is
 * the REPRESENTATION of that: a small per-individual state machine, the
 * world's own anchor points to sit on, a segment trajectory between two of
 * them, a turn-taking arbiter so a population does not call in unison, and
 * the ladder that decides which individuals are near enough to be voices
 * (the rest stay in the world, positioned and behaving, without a panner).
 *
 * Nothing here knows a species. Every number — how long a bout lasts, how
 * far a relocation goes, at what distance the thing startles, how many may
 * call at once — is a script property with a neutral default (Entities.ts
 * `AgentParams`), and the anchors are whatever the WorldSpec host resolves
 * to: every object of a class, a fixture, points along a strip or a patch
 * rim, seeded dry ground points. No enum of kinds, no table of animals: an
 * oak is a porous blob and a robin is `dwell 40to180 relocate 8to30 startle 6`.
 *
 *   silent ──dwell──▶ relocate? ──segment──▶ perch ──▶ calling | silent
 *   calling ─dwell─▶ (same)
 *   any perched ──listener / event within startle──▶ fleeing ──▶ perch ──hush──▶ bout
 *
 * Pure and allocation-light: the engine owns the instances and calls
 * `stepAgent` per spatial tick with a seeded rng; the offline renderer runs
 * the same engine headlessly, so the same seed reproduces the same flights.
 */
import type { Vec3 } from '../core/Statement';
import { type RealizedWorld, type WorldObject } from './worldRealize.js';
import type { Attach } from './worldSpec';
export type AgentTravel = 'fly' | 'walk' | 'auto';
/**
 * The behavioural numbers of one entity, from its block's own lines. Ranges
 * are `[min, max]`, drawn per use with the engine's rng. The defaults
 * reproduce a population that never moves, never startles, calls whenever
 * its members' timers say and voices every individual — exactly what an
 * entity block did before agents existed.
 */
export interface AgentParams {
    /** Perch-to-perch relocation on (`dwell` / `relocate` / `move` written). */
    relocates: boolean;
    /** Seconds a bout at a perch lasts before the agent relocates or starts a new bout. */
    dwellS: [number, number];
    /** How far a relocation goes, metres (an anchor within this band of the current one). */
    relocateM: [number, number];
    /** Shape of a relocation segment: an arc through the air, a walk on the ground, or inferred from the perch height. */
    travel: AgentTravel;
    /** Relocation speed, m/s, drawn once per instance. */
    speedMs: [number, number];
    /** Flee when the listener (or a positioned event) comes within this many metres on the ground plane; 0 = never. */
    startleM: number;
    /** Silence after a flight, seconds. */
    hushS: [number, number];
    /** Probability that a perch bout is a calling bout (else silent). */
    callChance: number;
    /** Max individuals of the entity calling at once; 0 = unlimited. */
    callers: number;
    /** Minimum seconds between two call starts across the entity. */
    gapS: [number, number];
    /** Localised voice budget: the nearest N individuals within `windowM` get tracks; 0 = all. */
    voices: number;
    /** Listener distance beyond which an individual is demoted into the bed, metres. */
    windowM: number;
    /**
     * `sway <metres>` — how far a PERCHED body shifts while it stands there.
     *
     * A standing person is not still: they shift their weight, turn, take half
     * a step and take it back. A body frozen to the centimetre between
     * relocations reads as a statue, which is the last thing that separates a
     * crowd from a set of markers.
     *
     * Default 0, and that matters: a bird on a branch really is still, and
     * every population written before this must behave exactly as it did.
     */
    swayM: number;
}
export declare const AGENT_DWELL_DEFAULT: [number, number];
export declare const AGENT_RELOCATE_DEFAULT_M: [number, number];
export declare const AGENT_SPEED_DEFAULT_MS: [number, number];
export declare const AGENT_HUSH_DEFAULT_S: [number, number];
/** Effective detection radius of a forest bird is ~128 m (Haupert et al. 2023); the window defaults there. */
export declare const AGENT_WINDOW_DEFAULT_M = 120;
export declare function defaultAgentParams(): AgentParams;
/** Draw from a `[min, max]` band. */
export declare function drawRange(r: [number, number], rng: () => number): number;
export interface Anchor {
    x: number;
    y: number;
    z: number;
    /** The world object this anchor is on (`hostId`), null for a ground / feature point. */
    id: string | null;
    /** Terrain height under the anchor — a raised anchor (y − groundY > RAISED_M) is flown to, not walked to. */
    groundY: number;
}
/** Spacing of anchors along a strip's centreline / a patch's rim, metres. */
export declare const ANCHOR_SPACING_M = 4;
/** Most anchors a feature contributes (a long river is sampled coarser). */
export declare const ANCHOR_FEATURE_MAX = 96;
/** Ground anchors drawn for a `ground` host, and the band (from the origin) they land in. */
export declare const ANCHOR_GROUND_COUNT = 32;
export declare const ANCHOR_GROUND_MIN_M = 4;
export declare const ANCHOR_GROUND_MAX_M = 30;
/** A perch this far above the terrain is reached by flight when `travel` is `auto`. */
export declare const RAISED_M = 1;
/** Clearance a walked or ground-perched body keeps above the terrain. */
export declare const WALK_CLEARANCE_M = 0.3;
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
export declare const AREA_RESIDENT_SPACING_M = 0.7;
/**
 * `count` points spread over a disc (a sunflower spiral), out to `radius`:
 * every resident of an area gets its own place inside it, not a share of one
 * rim point (2026-10-02: four cafe customers on a 0.7 m patch stood on one
 * anchor and drew as one person).
 */
export declare function areaResidentPoints(centre: readonly [number, number], radius: number, count: number): [number, number][];
export declare function resolveAnchors(world: RealizedWorld | null, hostRef: string | null, attach: Attach, rng: () => number, relocation?: [number, number], count?: number, geometry?: {
    attachOf(o: WorldObject, attach: Attach): Vec3;
    groundHalfM(): number;
}): Anchor[];
/** Index of the anchor on object `id`, else the nearest anchor to (x, y, z); −1 when there are none. */
export declare function nearestAnchor(anchors: readonly Anchor[], x: number, y: number, z: number, id?: string | null): number;
/**
 * An unoccupied anchor within `[min, max]` metres of the current one, drawn
 * at random among the candidates (reservoir sample — no allocation). −1 when
 * none qualifies; the caller then stays for another bout.
 */
export declare function chooseRelocation(anchors: readonly Anchor[], from: number, band: [number, number], occupied: ReadonlySet<number>, rng: () => number): number;
/**
 * Where to flee: an unoccupied anchor FARTHER from the threat (on the
 * ground plane — the threat walks, the perch is up a tree) than the
 * current perch and beyond `clearM` of it, within twice the relocation
 * band's reach, preferring the ones that gain the most distance (drawn
 * among the best three so a flock does not converge on one tree). −1 when
 * nothing qualifies — the agent then hushes where it sits.
 */
export declare function chooseFlight(anchors: readonly Anchor[], from: number, threatX: number, threatY: number, threatZ: number, band: [number, number], occupied: ReadonlySet<number>, rng: () => number, clearM?: number): number;
export interface Segment {
    x0: number;
    y0: number;
    z0: number;
    x1: number;
    y1: number;
    z1: number;
    /** Peak rise of a flown arc above the straight line, metres (0 for a walk). */
    lift: number;
    /**
     * Peak sideways offset of the route from the straight line, metres, drawn
     * per segment. A body that walks the exact line between two points reads as
     * sliding along a rail; a person going the same way twice does not take the
     * same path.
     */
    bend: number;
    /**
     * Whether the route eases in and out. True for an ordinary walk; FALSE for
     * a flight from a threat — a startled body leaves at full speed, and easing
     * into a bolt is exactly wrong.
     */
    eased: boolean;
    /** True for a walk: y follows the terrain (`groundY`) instead of the line. */
    walk: boolean;
    /** Clock time the segment began and how long it takes at the drawn speed. */
    t0: number;
    durS: number;
}
/** A flight rises by a fifth of its length, between these bounds, so it clears what it flies over. */
export declare const FLIGHT_LIFT_MIN_M = 1;
export declare const FLIGHT_LIFT_MAX_M = 6;
/** A route bends by up to this fraction of its own length, capped in metres. */
export declare const SEGMENT_BEND_FRACTION = 0.18;
export declare const SEGMENT_BEND_MAX_M = 4;
/**
 * Ease-in-out along a segment.
 *
 * A body used to cover its route at a constant speed, so it snapped from rest
 * to walking pace and stopped dead on arrival. Smoothstep starts and ends at
 * zero speed, which is what walking does — and because `gait` derives its
 * cadence from speed, the footsteps slow into a stop and build out of one
 * without anything saying so.
 */
export declare function easeSegment(u: number): number;
/**
 * Speed along the eased route as a multiple of the average, 0 at both ends
 * and 1.5 in the middle (the derivative of `easeSegment`). What `stepAgent`
 * reports as `velocity`, so every `follow velocity` binding and the gait see
 * the real pace rather than a constant.
 */
export declare function easeSegmentRate(u: number): number;
/** The pace multiplier for a segment at `u` — 1 throughout when it does not ease. */
export declare function segmentRate(s: Segment, u: number): number;
/** Shortest segment (a hop to the next branch is not instantaneous). */
export declare const SEGMENT_MIN_S = 0.4;
export declare function makeSegment(from: Anchor, to: Anchor, travel: AgentTravel, speedMs: number, t0: number, bend?: number, eased?: boolean): Segment;
/** Straight-line length of a segment, metres. */
export declare function segmentLength(s: Segment): number;
/**
 * The body's position at clock time `now` along the segment, written into
 * `out`: a linear glide with a sine lift for a flight, the terrain's height
 * plus clearance for a walk (`groundY` — the world's heightfield; null =
 * the straight line). Returns the progress 0..1 (1 = arrived).
 */
export declare function segmentPositionInto(s: Segment, now: number, out: Vec3, groundY: ((x: number, z: number) => number) | null): number;
export type AgentState = 'silent' | 'calling' | 'relocating' | 'fleeing';
/**
 * What an agent did — the label every transition is logged under (EventLog
 * kind `agent`) and the event name the instance's own `on <label>` members
 * answer: `perch` (arrived at an anchor), `call` / `hush` (a bout began),
 * `relocate` (set off perch to perch), `startle` (fled), `promote` /
 * `demote` (the ladder gave or took its voice).
 */
export type AgentTransition = 'perch' | 'call' | 'hush' | 'relocate' | 'startle' | 'promote' | 'demote';
/**
 * What an individual is trying to do: the goal layer over its state. `call` and
 * `rest` are perch bouts, `roam` a relocation, `flee` a flight. The runtime's
 * utility pick is the authored numbers (`call` chance, `dwell`, `relocate`,
 * `startle`); a forced goal from the inspector or the states timeline overrides
 * the pick until it is cleared ("model understands, code executes").
 */
export type AgentGoal = 'call' | 'rest' | 'roam' | 'flee';
export declare const AGENT_GOALS: readonly AgentGoal[];
export declare function agentGoal(a: Pick<Agent, 'state'>): AgentGoal;
/** The plan in one line: what it is doing, for how long, and what comes next. */
export declare function describePlan(a: Pick<Agent, 'state' | 'until' | 'fled' | 'seg'>, p: Pick<AgentParams, 'relocates'>, now: number, forced?: AgentGoal | null): string;
export interface Agent {
    state: AgentState;
    /** Index into the runtime's anchors, −1 when the world offered none. */
    anchor: number;
    /** Clock time the current bout / hush ends (Infinity = a bout that never ends on its own). */
    until: number;
    seg: Segment | null;
    /** True from a startle until its hush ends: the arrival is a hush, and the hush ends in a bout, never a relocation. */
    fled: boolean;
    /** Relocation speed drawn once for this individual, m/s. */
    speedMs: number;
    /** Whether the ladder currently gives this individual member tracks. */
    voiced: boolean;
    /** Phase of this body's idle sway, drawn once so no two shift in unison. */
    phase: number;
}
export declare function newAgent(anchor: number, speedMs: number, phase?: number): Agent;
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
export declare function swayInto(out: Vec3, base: Anchor, swayM: number, now: number, phase: number): void;
/** What `stepAgent` needs from the engine each tick (no allocation: one object reused). */
export interface AgentContext {
    now: number;
    listenerX: number;
    listenerY: number;
    listenerZ: number;
    rng: () => number;
    /** The world's terrain, for walked segments; null without a world. */
    groundY: ((x: number, z: number) => number) | null;
}
/**
 * Begin a perch bout at the current anchor: calling with probability
 * `callChance`, else silent, for a drawn `dwell`. Returns the transition.
 */
export declare function beginBout(agent: Agent, p: AgentParams, now: number, rng: () => number, forced?: AgentGoal | null): AgentTransition;
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
export declare function steerAgent(agent: Agent, p: AgentParams, anchors: readonly Anchor[], occupied: Set<number>, position: Vec3, tx: number, ty: number, tz: number, now: number, rng?: () => number): boolean;
/** A startled body moves this much faster than its relocation speed. */
export declare const FLEE_SPEED_FACTOR = 1.6;
/**
 * Flee from a threat at (tx, ty, tz): to a farther free anchor when the
 * world has one, else a hush in place. Only a perched agent can be
 * startled — one already in the air keeps its flight. Returns the
 * transition, or null when nothing happened.
 */
export declare function startleAgent(agent: Agent, p: AgentParams, anchors: readonly Anchor[], occupied: Set<number>, position: Vec3, tx: number, ty: number, tz: number, ctx: AgentContext): AgentTransition | null;
/**
 * Advance one agent by one tick. Writes the body's `position` and returns
 * its speed along the segment (0 at a perch) in `velocityOut[0]`; every
 * transition it makes is pushed to `transitions` (cleared by the caller).
 */
export declare function stepAgent(agent: Agent, p: AgentParams, anchors: readonly Anchor[], occupied: Set<number>, position: Vec3, ctx: AgentContext, transitions: AgentTransition[], forced?: AgentGoal | null): number;
/**
 * Per-entity turn-taking: at most `callers` individuals sounding a timed
 * call at once, and at least `gap` seconds between two call starts. A
 * refused call is retried by the engine a moment later, never dropped —
 * the chorus thins, it does not lose voices. Configured by number only;
 * a chorus of crickets is `callers 0` (everyone), a duetting pair
 * `callers 1 gap 2to5`.
 */
export declare class ChorusArbiter {
    /** Instance number → clock time its current call ends. */
    private busy;
    private lastStart;
    private nextGap;
    /** May instance `n` start a call at `now`? */
    mayCall(_n: number, now: number, p: AgentParams): boolean;
    /** Instance `n` started a call at `now` that lasts `durS`. */
    noteCall(n: number, now: number, durS: number, p: AgentParams, rng: () => number): void;
    /** How many individuals are mid-call at `now`. */
    activeCallers(now: number): number;
    forget(n: number): void;
    clear(): void;
}
/** A refused call is retried after this long (a band, so retries de-phase). */
export declare const CALL_RETRY_S: [number, number];
/** A voiced individual keeps its voice out to this multiple of the window (no flapping at the edge). */
export declare const LADDER_HYSTERESIS = 1.15;
/** An unvoiced individual displaces a voiced one only when it is this much nearer, metres. */
export declare const LADDER_SWAP_M = 3;
/**
 * Which individuals should have voices: at most `budget` of them, the
 * nearest within the window. `distances[i]` is the listener
 * distance of individual i, `voiced[i]` its current state; the decision is
 * written to `out[i]`. Sticky by design: a voiced individual counts as
 * `LADDER_SWAP_M` nearer than it is and keeps its voice out to
 * `LADDER_HYSTERESIS × window`, so a listener standing still never hears
 * the ladder hunt. `order` is scratch (indices, length ≥ n).
 */
export declare function ladderSelect(distances: readonly number[], voiced: readonly boolean[], budget: number, windowM: number, out: boolean[], order: number[]): void;
//# sourceMappingURL=EntityAgents.d.ts.map