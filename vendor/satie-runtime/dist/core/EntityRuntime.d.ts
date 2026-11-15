import type { Statement } from './Statement.js';
import type { Vec3 } from './Statement.js';
import { type HostGeometry } from './HostRegistry.js';
import type { Attach } from '../world/worldSpec.js';
import type { SceneEvent } from './EventLog.js';
import type { TrackState, EventPayload } from './SatieEngine.js';
import { type EntityDef, type EntityInstance } from './Entities.js';
import { type AgentGoal, ChorusArbiter, type Anchor } from '../world/EntityAgents.js';
import { type RealizedWorld, type WorldObject } from '../world/worldRealize.js';
import type { FieldSample } from '../world/WorldFields.js';
/** The trigger event a footfall dispatches to the body's own `on step` members. */
export declare const STEP_EVENT = "step";
export interface EntityHost {
    rng(): number;
    now(): number;
    isPlaying(): boolean;
    statements(): readonly Statement[];
    world(): RealizedWorld | null;
    worldObjectById(id: string): WorldObject | undefined;
    /** Where a sound attaches on an object: the drawn geometry when the graphics reported it, else the procedural shape. */
    attachPointOf(o: WorldObject, attach: Attach): Vec3;
    /** The embedder's or the drawing's hosts of a class (`tree` → tree_1 …), for a population the procedural world cannot seat. */
    externalHostMembers(cls: string): readonly {
        id: string;
        p: Vec3;
    }[];
    hostGeometryOf(id: string): HostGeometry | undefined;
    /** How far ground anchors may reach: the sound world's half size, or further when the drawing is larger. */
    groundHalfM(): number;
    worldRng(): number;
    hostingEnabled(): boolean;
    listenerPos(): Vec3;
    spatialTicks(): number;
    trackFor(key: string): TrackState | undefined;
    activityOf(activeHours: [number, number][] | null, gates: {
        signal: string;
        threshold: number;
    }[]): number;
    signalValue(name: string): number;
    drawTake(stmt: Statement, avoid: number): number;
    drawGroundPointInto(out: Vec3): boolean;
    sampleField(x: number, y: number, z: number): FieldSample | null;
    memberFamilyKey(stmt: Statement, inst: EntityInstance<TrackState>): string;
    scheduleAfter(delayS: number, trackKey: string, label: string, fn: () => void): void;
    cancelTrackEvents(trackKey: string): void;
    createVoice(key: string, stmt: Statement, statementIndex: number, member: {
        inst: EntityInstance<TrackState>;
        m: number;
    }): void;
    stopTrack(key: string, fadeS: number): void;
    retriggerAudio(key: string, stmt: Statement, fire: boolean): void;
    setSignal(name: string, value: number): void;
    logEvent(kind: SceneEvent['kind'], label: string, pos: Vec3 | null, meta: {
        entity: string;
        instance: number;
    }): void;
    fireTriggerFamily(familyKey: string, candidates: TrackState[], payload: EventPayload): void;
    dispatchTriggers(candidates: TrackState[], event: string, payload: EventPayload): void;
    forgetTriggerFamily(familyKey: string): void;
}
/**
 * One entity class at runtime: its definition, member statements (by
 * ordinal), live instances, the running instance number, and the pooling
 * state that makes consecutive instances differ (the takes the previous one
 * drew per member, the host cursor of a population). `spawnGen` tags the
 * spawner chain so a superseded chain's events become no-ops.
 */
export interface EntityClassState {
    def: EntityDef;
    stmts: Statement[];
    /** An empty or entirely muted repertoire does not reserve a voice slot. */
    hasPlayableMembers: boolean;
    /** Fresh member keys keep a retiring recording separate from its replacement. */
    memberRevision: number;
    instances: EntityInstance<TrackState>[];
    nextN: number;
    lastTakes: number[];
    /** Shuffled candidate order for a class host; instances take turns along it. */
    hostOrder: number[];
    hostCursor: number;
    spawnGen: number;
    alive: boolean;
    /**
     * The agent layer of a population (world/EntityAgents.ts): the world's
     * anchors for this host (null until resolved against the current world),
     * which of them a body sits on or is heading to, the entity's turn-taking
     * arbiter, and the ladder's scratch arrays (no allocation per tick).
     */
    anchors: Anchor[] | null;
    occupied: Set<number>;
    chorus: ChorusArbiter;
    ladderDist: number[];
    ladderVoiced: boolean[];
    ladderOut: boolean[];
    ladderOrder: number[];
}
export declare class EntityRuntime {
    private readonly host;
    /** Goals forced from the inspector or the states timeline, by entity id; absent = the authored pick. */
    private readonly goals;
    /** Force (or clear) a goal for every individual of an entity; the current bout ends at the next tick so the change is heard now. */
    setGoal(entityId: string, goal: AgentGoal | null): void;
    goalOf(entityId: string): AgentGoal | null;
    /** Hold one admitted action on one body, or return it to its local policy. */
    setAction(entityId: string, instanceN: number, action: string | null): boolean;
    private runtimes;
    /** Rebuilt only when membership changes, so a viewport read allocates nothing per frame. */
    private instanceSnapshot;
    private readonly rng;
    private readonly behaviorSignal;
    constructor(host: EntityHost);
    /**
     * Send one population individual to the free anchor nearest a point.
     *
     * The relocation machinery is unchanged — it walks or flies a real segment
     * at the body's own speed and begins a bout on arrival — so a steered walk
     * is a wandered one with the destination chosen. This is what lets an
     * outside decision (an NPC's) reach a body; without it a decision to cross
     * to the cart is a sentence nobody acts on.
     *
     * False when the entity is a route (it has no anchors, only its strip),
     * when the body is already mid-flight, or when nothing is free near the
     * point.
     */
    steer(entityId: string, instanceN: number, x: number, y: number, z: number): boolean;
    /** Every live instance of every entity (objects mutated in place at spatial rate — read, don't hold). */
    instances(): EntityInstance<TrackState>[];
    /** Bring every entity of a freshly loaded script to life. */
    start(defs: readonly EntityDef[]): void;
    /**
     * After an incremental reload: unchanged entities keep their instances
     * (rebound to the new def object, whose member indices point at the
     * spliced-in old statements). Explicit bodies also survive component
     * edits when their host topology is unchanged. Removed/rehosted bodies
     * and changed legacy audio-only entities retire and start afresh.
     */
    reconcile(defs: readonly EntityDef[], unchanged: ReadonlySet<string>): void;
    /** Change components without discarding the body's physical state. */
    private reconcileBody;
    private reconcileMotion;
    /** Stop: instances die with their tracks; orphaned spawner closures see `alive` off. */
    dropAll(): void;
    /** How many entity classes are running (0 means the tick can skip the layer). */
    get count(): number;
    /** First live instance of the entity with this id, or null. */
    instanceById(id: string): EntityInstance<TrackState> | null;
    /**
     * A new world (or hosting toggled): populations that were sitting at the
     * origin take their perches; a new world means new anchors for every agent.
     */
    rehostAll(): void;
    /**
     * Bring one entity class to life: a population spawns its `count` bodies
     * at once; a physical route seeds its steady occupancy along the path
     * (the road is not empty at t = 0) and runs its spawner. Physical bodies
     * live independently of their repertoire. Legacy audio-only routes still
     * use their activity as the spawn gate.
     */
    private startEntity;
    /** Steady route occupancy follows travel time and arrival cadence, independently of voice limits. */
    private initialRoutePopulation;
    /** `active` × `quiet` of the entity itself — the spawner's gate (members carry the same gates on their own tracks). */
    private entityActivity;
    /**
     * Explicit bodies are simulation objects: muting their acoustic activity
     * cannot erase them. Audio-only scripts retain the old route-spawn gate;
     * members in both forms still inherit the entity's acoustic gates.
     */
    private maySpawn;
    /**
     * The route spawner: one scheduler event per interval (`every` × `pace`),
     * tagged with the runtime's generation so a retired or restarted entity's
     * chain fires as no-ops. A spawn a cap or a gate refuses is simply skipped;
     * the next one is scheduled regardless, so a road that has no strip yet
     * (world still loading) fills as soon as it does.
     */
    private scheduleEntitySpawn;
    /** Instances holding member tracks — the panner budget (a demoted individual costs nothing). */
    private liveInstanceCount;
    /**
     * Bring one instance into being: draw its constants (cruise speed, halt
     * plan, pitch offset, its take of every pooled member — never the previous
     * instance's when there is a choice — and when its once-per-life sounds
     * land), host it (perch or strip), create its member tracks, log `spawn`.
     * A seed specifies legacy travel progress or a physical position along the path.
     * Null when a cap holds or a route has no strip to run.
     */
    /** The loudest thing this entity emits at 1 m (its members' `spl`, the default when none states one). */
    private loudestEmissionDb;
    /** The place's floor at the ear: the loudest bed the scene states, else still air. */
    private sceneFloorDb;
    private spawnInstance;
    /**
     * Give an instance its member tracks: loops, triggers (`on …`, chance
     * members) and repeating oneshots — the last on a phase of their own, so
     * a population never fires in unison and a road's horns are not
     * metronomic. Called at a route body's spawn and when the ladder promotes
     * a population individual.
     */
    private voiceInstance;
    private scheduleMember;
    /**
     * Take an instance's member tracks away — the ladder demoting an
     * individual into the bed. The body stays: position, agent state, log
     * labels; only the panners go (faded like a retirement), along with any
     * member creation still queued and the body's trigger cooldowns.
     */
    private unvoiceInstance;
    /** A timed call took its turn in the entity's chorus for as long as the take lasts. */
    noteCall(inst: EntityInstance<TrackState>, now: number, durationS: number): void;
    /** The runtime an instance belongs to (a handful of entities: a linear scan, no map). */
    private runtimeOf;
    /**
     * The representation ladder (EntityAgents.ladderSelect): the nearest
     * `voices` individuals within `window` metres of the listener hold member
     * tracks; the rest are demoted into the bed — still in the world,
     * positioned and behaving, without a panner — and their number is
     * published as `<entity>_far` for a bed voice to `volume follow`. The
     * scene's panner budget (`ENTITY_MAX_TOTAL`) bounds the voiced count
     * across entities. Runs at play and every LADDER_EVERY_TICKS ticks.
     */
    private applyLadder;
    /** Scratch for the agent step (one object, rewritten per tick). */
    private _agentCtx;
    private _agentTransitions;
    private _agentGroundY;
    /**
     * An agent did something (EntityAgents.AgentTransition): log it as an
     * `agent` event — the behaviour tag the export corpus carries — and fire
     * the instance's OWN `on <transition>` members (the wings on `startle`,
     * the landing rustle on `perch`). Other bodies hear nothing unless such
     * a member `emit`s an event of its own — alarm spreads by the script's
     * choice, not by a rule.
     */
    private onAgentTransition;
    /** Candidate tracks of one footfall — refilled per footfall, never held. */
    private _footfallTracks;
    /**
     * The body touched something as part of its action (the seat as it sits,
     * the table as it grasps, the floor as the chair drags): fire ITS OWN
     * `on <contact>` members from the body, with the material of what it
     * touched as `{text}`, so one `on sit gen "settling onto {text}"` line covers
     * every seat. The material is the host object the body is at (the chair it
     * was perched on), else the ground under it, else nothing, which the
     * template reports as unresolved rather than inventing a surface. Logged
     * as an `agent` event with the contact's name, so the render's event log
     * carries the cause (entity, instance, action, contact) the Ludwig labels need.
     */
    private fireContact;
    /**
     * One body put a foot down: fire ITS OWN `on step` members from where it
     * is standing, with the world under that point — the surface as `{text}`
     * (so one `on step gen "a footstep on {text}"` line covers every ground
     * the body crosses, keyed per surface like any template take) and the
     * water there as `depth` / `liquid` (so a `when`-gated wading take
     * replaces the dry one).
     *
     * Scoped to the instance on purpose. A step is heard from the body that
     * took it: broadcasting it would make twenty pedestrians answer each
     * other's strides, and would put twenty positioned events per second
     * through the whole track list.
     *
     * It does NOT startle nearby agents. Same doctrine as `onAgentTransition`:
     * other bodies hear nothing unless the script says so — put `emit` on the
     * `on step` member and the pigeons flush, because the script asked, not
     * because a rule fired.
     *
     * Not logged as an `event` either — the member's own `fire` already lands
     * in the log with the entity, the instance, the take and the position, and
     * a second row per footfall would push real events out of the ring.
     */
    private fireFootfall;
    /**
     * A positioned event (a footstep, an `emit`) startles every perched
     * agent within its entity's `startle` radius of the point — the Phase 1
     * event bus as the second startle source beside the listener's approach.
     * A body already in flight ignores it (startleAgent).
     */
    startleNear(x: number, y: number, z: number): void;
    /**
     * May this timed-oneshot member sound now? Its body must be in a calling
     * bout and the entity's chorus arbiter must have a slot (callers / gap).
     */
    agentMayCall(inst: EntityInstance<TrackState>): boolean;
    /** A visible ground-hosted body stands on terrain, including the submerged pool
     * floor. Audio-only anchors, object perches and flying bodies keep their
     * historical placement. This is kinematic support, not a foot-bone solver. */
    private walkingSupportY;
    private groundWalkingBody;
    /** A route body's position from its arc along the strip (no allocation). */
    private routePositionInto;
    /**
     * Perch a population body on its own host: a fixed object id; a distinct
     * member of a class (a shuffled order the instances take turns along, so
     * fewer objects than bodies round-robin); a random point of a strip or
     * patch; a random dry ground point 4–18 m out; or — without a world, or
     * with no host — the origin. Members already created move with it.
     */
    private hostPopulationInstance;
    /** Every member track sits where the body is. */
    private pinMembersTo;
    /**
     * The graphics reported (or changed) a host's geometry: every body perched on it moves to the
     * drawn attach point, its anchor follows, and a class that could not be seated before (no
     * procedural object, external hosts since registered) takes its perches now.
     */
    rehostOn(hostId: string): void;
    /** Fade an instance's members out, drop its cooldowns, log `retire`, forget it. */
    private retireInstance;
    /** Retire every instance of a runtime and silence its spawner. */
    private retireRuntime;
    /** Routes cannot run without their strip (world gone, hosting off): their bodies retire; the spawners keep polling. */
    retireRoutes(): void;
    /**
     * Per spatial tick, allocation-free: advance every route body's
     * kinematics, write its position from the strip, retire it past the end;
     * pin every member track to its body; fire once-per-life (`chance`)
     * members that have come due — from the body, with the instance's take.
     */
    advance(now: number, dt: number): void;
}
//# sourceMappingURL=EntityRuntime.d.ts.map