/**
 * Entities — a body with kinematics and a repertoire of sounds.
 *
 * The unit of a simulation is not a clip on a timer at a point; it is a THING
 * that has a body, moves (or perches), and owns several sounds that follow
 * what it is doing. An `entity` block in a script declares one class of such
 * things; the engine spawns INSTANCES of it — each drawn once (its cruise
 * speed, its pitch offset, which take of every pooled sound is its own, when
 * its once-per-life sounds happen) and consistent with itself for its whole
 * life — and moves every member track as one body.
 *
 * Two shapes, decided by the body's host (`at …`):
 *
 *   route      — `at <strip> pass`: instances are spawned at one end of the
 *                strip every `every` seconds, travel it at their cruise speed
 *                (optionally halting once), and retire off the far end.
 *   population — anything else: `count` instances, each perched on its own
 *                host object — and each an AGENT (world/EntityAgents.ts):
 *                it may relocate perch to perch, flee the listener, take
 *                turns calling and drop out of the voice budget when far,
 *                by the numbers the block writes (`EntityDef.agent`).
 *
 * This file holds the DEFINITION (what the parser produces), the INSTANCE
 * state (what the engine mutates per tick), and the pure kinematics — all
 * allocation-free once an instance exists. Nothing here knows what a car or
 * a bird is: the script names the sounds and the mappings; this owns
 * container semantics, kinematics and pooling.
 */
import type { RangeOrValue } from './RangeOrValue';
import type { FollowBinding } from './Signals';
import type { Vec3 } from './Statement';
import type { Agent, AgentParams } from '../world/EntityAgents';
import type { EntityBody } from './EntityBody';
import type { EntityBehavior, EntityBehaviorState } from './EntityBehavior.js';
export interface EntityStateDef {
    name: string;
    /** Hour windows; empty = reached only by `hold`. */
    hours: [number, number][];
    /** Member sound ids heard in this state. */
    sounds: string[];
}
export interface EntityDef {
    /** Persistent visible body; does not inherit member volume, mute or voice allocation. */
    body?: EntityBody;
    /** Optional authored identity, conditions and action policy. */
    behavior?: EntityBehavior;
    /** Slug `[a-z0-9_]+`, unique per script. */
    id: string;
    /** The body's host: a strip id (route), a class / fixture / object id, `ground`, or null (the origin). */
    hostRef: string | null;
    hostAttach: 'body' | 'top' | 'base' | 'inside';
    /** `pass` on the host → a route entity; otherwise a population. */
    hostMotion: 'fixed' | 'pass';
    /** Route: seconds between spawns (default 6to14). Ignored for populations. */
    every: RangeOrValue;
    /** Population size (1–POPULATION_COUNT_MAX, default 1). Ignored for routes. */
    count: number;
    /** Route cruise speed, m/s, drawn per instance; Null = from the strip's `flow`. A population's relocation speed lands in `agent.speedMs`. */
    speed: RangeOrValue;
    /**
     * A population's behaviour as numbers (world/EntityAgents.ts): how long a
     * bout at a perch lasts, how far and how a relocation goes, the startle
     * radius and the hush after it, the calling odds, the chorus cap and gap,
     * the voice budget and window. Defaults = a population that never moves.
     */
    agent: AgentParams;
    /** Route: probability of one halt per pass (0 = never). */
    stopChance: number;
    /** Route: idle seconds at the halt (default 2to6). */
    stopS: RangeOrValue;
    /** Multiplies `every` at each spawn (same form as a oneshot's `pace`). */
    paceFollow: FollowBinding | null;
    /** Acoustic gates inherited by members. Legacy routes without an explicit body also gate spawning. */
    activeHours: [number, number][] | null;
    quietGates: {
        signal: string;
        threshold: number;
    }[];
    /**
     * `gait <metres>` — the body walks, and one footfall happens every this
     * many metres it travels. Drawn per instance, so two members of a
     * population have different strides and never step in unison. Null = the
     * body has no gait (a car, a bird on the wing): no footfall ever fires.
     *
     * Cadence is not a number the script states — it is `speed / stride`, so a
     * body that accelerates steps faster and a body at a halt stops stepping,
     * with no binding to write.
     */
    gait: RangeOrValue;
    /** Default take-pool size for gen members that set none (1 = single take). */
    variants: number;
    /** Members inherit this when they set no `visual`. */
    visual: 'trail' | 'sphere' | 'none';
    /**
     * `rotate <deg>` on the entity: the body's yaw while it stands where it was
     * placed (0 = facing +z). A body that has travelled faces its travel.
     */
    rotateDeg: number;
    /** `scale <x>` on the entity: uniform scale of the drawn body. */
    scaleFactor: number;
    /** Emission level (dB SPL at 1 m) members inherit when they state none; Null = not stated. */
    spl: RangeOrValue;
    /** `spl follow …` on the entity — inherited by members that state no `spl` of their own. */
    splFollow: FollowBinding | null;
    /**
     * `state <name> [<h>to<h> …] sounds <id>,<id>`: the named conditions the entity can be in and the
     * member sounds heard in each (the last segment of a member's `source_id`). A state with hours is on
     * the clock (the members' own `active` lines carry those hours); a state with no hours is one it CAN
     * be in, reached only by `hold`: a sound named only in such states is silent until held.
     */
    states: EntityStateDef[];
    /** `hold <state>`: the entity stays in this state; its members in it sound at every hour, its other state members are silent. */
    hold: string | null;
    /** Indices into `ParseResult.statements` of this entity's member statements, in script order. */
    memberIndices: number[];
    lineNumber: number;
}
/** Route kinematics: deceleration into a halt and acceleration out of it, m/s². */
export declare const ROUTE_BRAKE_MS2 = 3;
export declare const ROUTE_ACCEL_MS2 = 2;
/** A route instance sits this far above the strip's surface (a liquid strip: at the surface). */
export declare const ROUTE_HEIGHT_M = 0.8;
export declare const ROUTE_HEIGHT_LIQUID_M = 0.1;
/** Default spawn interval when a route entity declares no `every`. */
export declare const ROUTE_EVERY_DEFAULT: [number, number];
/** Default halt length when `stop` names a chance but no range. */
export declare const ROUTE_STOP_DEFAULT: [number, number];
/** The halt point is drawn uniformly along this middle fraction of the strip. */
export declare const ROUTE_STOP_BAND = 0.7;
/** A once-per-life (`chance`) sound of a route instance lands within this middle fraction of the run. */
export declare const ROUTE_CHANCE_BAND = 0.6;
/** A once-per-life sound of a population instance lands within its first N seconds. */
export declare const POPULATION_CHANCE_WINDOW_S = 60;
/** Per-instance pitch offset band: every member's pitch × (1 ± this). */
export declare const ENTITY_PITCH_SPREAD = 0.04;
/** Live-instance caps: per entity and across the scene (the panner budget). */
export declare const ENTITY_MAX_PER_CLASS = 6;
export declare const ENTITY_MAX_TOTAL = 24;
/** Route entities are seeded with up to this many instances at play, so the strip is not empty at t = 0. */
export declare const ROUTE_SEED_INSTANCES = 2;
/** Seeds land uniformly within this leading fraction of the strip (never on the exit). */
export declare const ROUTE_SEED_PROGRESS_MAX = 0.85;
/** Below this activity (`active` hours × `quiet` gates) an entity spawns nothing. */
export declare const ENTITY_ACTIVITY_MIN = 0.05;
/**
 * Population `count` bound. Raised from 12 when individuals became agents:
 * the count is how many bodies live in the world, `voices` how many of
 * them are localised at once — the panner budget bounds the latter.
 */
export declare const POPULATION_COUNT_MAX = 48;
/** Members fade out over this long when their instance retires. */
export declare const ENTITY_RETIRE_FADE_S = 0.25;
/** A voice-budget demotion crossfades over this long (spec 006, FR-007): never a cut on an audible body. */
export declare const ENTITY_UNVOICE_FADE_S = 2;
/**
 * Longest step the kinematics will integrate. The first tick after play()
 * and a stalled tab hand the engine a dt of seconds; a body must not
 * teleport off its strip because the browser was busy.
 */
export declare const ROUTE_MAX_STEP_S = 0.25;
/** Route cruise speed from the strip's `flow` when the entity names no `speed`: (4 + 16·flow) × 0.7..1.3. */
export declare const ROUTE_FLOW_SPEED_MIN_MS = 4;
export declare const ROUTE_FLOW_SPEED_MAX_MS = 20;
export declare const ROUTE_FLOW_SPEED_SPREAD = 0.3;
/**
 * Stride bounds, metres. The low end is a shuffle, the high end a stride no
 * body has — they exist so a typo (`gait 700`) fails loudly at parse rather
 * than silently producing a body that never steps.
 */
export declare const GAIT_STRIDE_MIN_M = 0.05;
export declare const GAIT_STRIDE_MAX_M = 20;
/**
 * Footfalls one tick may produce, however long the tick was. The first tick
 * after `play()` and a stalled tab hand the engine a dt of seconds; a body
 * must not fire forty steps to catch up on distance nobody heard it cover.
 */
export declare const GAIT_MAX_FALLS_PER_TICK = 2;
export type EntityPhase = 'cruise' | 'brake' | 'idle' | 'accelerate' | 'done';
/**
 * One live instance. Mutated in place every spatial tick; the member tracks
 * (`tracks`, one slot per member statement, null until created) are pinned to
 * `position`. `takes[m]` is the pooled take the instance settled on for member
 * m (-1 until one lands), `chanceFireAt[m]` the clock time its once-per-life
 * sound is due (Infinity = never, NaN = already fired).
 */
export interface EntityInstance<T = unknown> {
    def: EntityDef;
    behavior?: EntityBehaviorState;
    /** Instance number, monotonically increasing per entity. */
    n: number;
    /** Member tracks by member ordinal (the engine's TrackState), null until created. */
    tracks: (T | null)[];
    /** Member track keys by ordinal (`e:<entity>:<n>:<statementIndex>`), fixed at spawn. */
    keys: string[];
    position: Vec3;
    /** Body speed along the route, m/s (0 for a population). */
    velocity: number;
    /** m/s², negative while braking. */
    accel: number;
    /** 0..1 along the route in the direction of travel (0 for a population). */
    progress: number;
    /** Clock time of the spawn. */
    spawnedAt: number;
    /** Route: arc-length position on the strip, direction (+1/-1), cruise speed, strip length. */
    arc: number;
    dir: number;
    cruise: number;
    len: number;
    phase: EntityPhase;
    /** Route: the planned halt point (arc length), -1 when none (or already taken). */
    stopArc: number;
    /** Route: clock time the halt ends. */
    idleUntil: number;
    /** Route: how long the halt lasts, drawn at spawn. */
    idleS: number;
    /** Every member's pitch is multiplied by this (0.96..1.04). */
    pitchOffset: number;
    takes: number[];
    chanceFireAt: number[];
    /** The world object a population instance perches on, null for ground / origin / routes. */
    hostId: string | null;
    /** A population individual's behaviour (world/EntityAgents.ts); null for a route body. */
    agent: Agent | null;
    /** Whether the ladder currently gives this instance member tracks; independent of physical existence. */
    voiced: boolean;
    /**
     * This body's own stride, metres, drawn once at spawn from the entity's
     * `gait`; 0 when the entity states none (no gait, no footfalls).
     */
    stride: number;
    /**
     * Metres travelled since the last footfall. Seeded with a random fraction
     * of the stride at spawn — without it, a population that starts walking on
     * the same tick marches in lockstep, which is the one thing a crowd never
     * does.
     */
    strideAccum: number;
    /** Alternating foot, shared by contact scheduling and visible limb motion. */
    strideIndex?: number;
    /** Route only (spec 006): metres beyond the strip's ends the body travels before entering and after leaving, so it is born and retired beyond earshot. */
    rollInM?: number;
    rollOutM?: number;
}
/** Fraction of the run completed in the direction of travel. */
export declare function routeProgress(arc: number, dir: number, len: number): number;
/**
 * Advance a route instance's kinematics by `dt` seconds at clock time `now`
 * (no allocation). Phases: cruise → (brake → idle → accelerate →) cruise →
 * done once the body leaves the strip's end in its direction of travel.
 * Returns true while the instance is still on the strip.
 */
export declare function advanceRoute(inst: EntityInstance, dt: number, now: number): boolean;
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
export declare function advanceGait(inst: EntityInstance, dt: number, distanceM?: number): number;
//# sourceMappingURL=Entities.d.ts.map