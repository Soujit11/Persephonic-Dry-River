import { takeCount } from './GenRequests.js';
/**
 * Entities at runtime: the bodies a script's `entity` blocks put in the world.
 *
 * Owns every entity class's live state (`EntityClassState`): instances and
 * their member tracks, the route spawner, the population ladder that decides
 * which individuals hold panners, the agent layer (perch bouts, relocation,
 * startle), footfalls and the once-per-life `chance` members. It decides WHEN
 * a body exists, WHERE it stands and WHICH of its members sound.
 *
 * Collaborators (`EntityHost`) — what stays the engine's business:
 *   reads   `rng`, `now`, `isPlaying`, `statements` (member statements by
 *           index), `world` / `worldObjectById` / `worldRng` / `hostingEnabled`
 *           (the procedural world and its hosting), `listenerPos`,
 *           `spatialTicks` (the ladder cadence), `trackFor`, `activityOf`
 *           (active/quiet gates), `signalValue` (pace follow), `drawTake`
 *           (pooled takes), `drawGroundPointInto`, `sampleField` (the world's
 *           surface / water under a foot), `memberFamilyKey`
 *   actions `scheduleAfter` / `cancelTrackEvents` (the scheduler), `createVoice`
 *           / `stopTrack` / `retriggerAudio` (voices are the engine's),
 *           `setSignal` (`<entity>_far`), `logEvent`, `fireTriggerFamily` /
 *           `dispatchTriggers` / `forgetTriggerFamily` (the trigger ledger)
 * The engine keeps the voices, the graph, the scheduler and the trigger
 * cooldowns; this module only drives them.
 */
import { createEntityBehavior, reconcileEntityBehavior, stepEntityBehavior } from './EntityBehavior.js';
import { entityBodyFloorY } from './EntityBody.js';
import { attachFromGeometry, HostRegistry } from './HostRegistry.js';
const classOfHost = (id) => HostRegistry.classOf(id);
import { mapFollow } from './Signals.js';
import { advanceRoute, advanceGait, ROUTE_HEIGHT_M, ROUTE_HEIGHT_LIQUID_M, ROUTE_STOP_BAND, ROUTE_CHANCE_BAND, POPULATION_CHANCE_WINDOW_S, ENTITY_PITCH_SPREAD, ENTITY_MAX_PER_CLASS, ENTITY_MAX_TOTAL, POPULATION_COUNT_MAX, ROUTE_SEED_INSTANCES, ENTITY_ACTIVITY_MIN, ENTITY_RETIRE_FADE_S, ROUTE_FLOW_SPEED_MIN_MS, ROUTE_FLOW_SPEED_MAX_MS, ROUTE_FLOW_SPEED_SPREAD, ROUTE_SEED_PROGRESS_MAX, ENTITY_UNVOICE_FADE_S } from './Entities.js';
import { resolveAnchors, nearestAnchor, newAgent, beginBout, stepAgent, startleAgent, steerAgent, drawRange, ChorusArbiter, ladderSelect, } from '../world/EntityAgents.js';
import { heightAt, featureById, featureArcLength, featurePointAtArcInto, featurePointAtArcExtrapolatedInto, featureEndTangentInto } from '../world/worldRealize.js';
import { audibilityRadiusM, rollBeyondM, DEFAULT_FLOOR_DB } from '../spatial/Audibility.js';
import { DEFAULT_SPL_DB } from '../spatial/LevelModel.js';
/** The trigger event a footfall dispatches to the body's own `on step` members. */
export const STEP_EVENT = 'step';
/** The population ladder runs every this many spatial ticks. */
const LADDER_EVERY_TICKS = 6;
const NO_ANCHORS = [];
/** Scratch for route positions (the tick allocates nothing). */
const HOST_SCRATCH = { x: 0, y: 0, z: 0 };
const TANGENT_SCRATCH = { x: 0, z: 0 };
export class EntityRuntime {
    host;
    /** Goals forced from the inspector or the states timeline, by entity id; absent = the authored pick. */
    goals = new Map();
    /** Force (or clear) a goal for every individual of an entity; the current bout ends at the next tick so the change is heard now. */
    setGoal(entityId, goal) {
        if (goal)
            this.goals.set(entityId, goal);
        else
            this.goals.delete(entityId);
        const rt = this.runtimes.find(r => r.def.id === entityId);
        if (!rt)
            return;
        for (const inst of rt.instances)
            if (inst.agent && !inst.agent.seg)
                inst.agent.until = -Infinity;
    }
    goalOf(entityId) { return this.goals.get(entityId) ?? null; }
    /** Hold one admitted action on one body, or return it to its local policy. */
    setAction(entityId, instanceN, action) {
        const instance = this.runtimes.find(r => r.def.id === entityId)?.instances.find(i => i.n === instanceN);
        const state = instance?.behavior;
        if (!state || (action !== null && !state.definition.actions.some(a => a.name === action)))
            return false;
        state.held = action;
        if (action === null)
            state.until = this.host.now();
        return true;
    }
    runtimes = [];
    /** Rebuilt only when membership changes, so a viewport read allocates nothing per frame. */
    instanceSnapshot = null;
    rng;
    behaviorSignal;
    constructor(host) {
        this.host = host;
        this.rng = () => host.rng();
        this.behaviorSignal = name => host.signalValue(name);
    }
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
    steer(entityId, instanceN, x, y, z) {
        const rt = this.runtimes.find(r => r.def.id === entityId);
        if (!rt || rt.def.hostMotion === 'pass')
            return false;
        const inst = rt.instances.find(i => i.n === instanceN);
        if (!inst?.agent)
            return false;
        const anchors = this.host.hostingEnabled() && rt.anchors ? rt.anchors : NO_ANCHORS;
        const moved = steerAgent(inst.agent, rt.def.agent, anchors, rt.occupied, inst.position, x, y, z, this.host.now(), this.rng);
        if (moved)
            this.onAgentTransition(rt, inst, 'relocate');
        return moved;
    }
    /** Every live instance of every entity (objects mutated in place at spatial rate — read, don't hold). */
    instances() {
        if (this.instanceSnapshot)
            return this.instanceSnapshot;
        const out = [];
        for (const rt of this.runtimes)
            for (const inst of rt.instances)
                out.push(inst);
        return this.instanceSnapshot = out;
    }
    /** Bring every entity of a freshly loaded script to life. */
    start(defs) {
        this.runtimes = [];
        this.instanceSnapshot = null;
        for (const def of defs)
            this.startEntity(def);
    }
    /**
     * After an incremental reload: unchanged entities keep their instances
     * (rebound to the new def object, whose member indices point at the
     * spliced-in old statements). Explicit bodies also survive component
     * edits when their host topology is unchanged. Removed/rehosted bodies
     * and changed legacy audio-only entities retire and start afresh.
     */
    reconcile(defs, unchanged) {
        this.instanceSnapshot = null;
        const keep = new Map();
        const nextById = new Map(defs.map(def => [def.id, def]));
        for (const rt of this.runtimes) {
            const next = nextById.get(rt.def.id);
            // Explicit physical bodies retain their life when their sounds or
            // behavior change. A different host/motion topology needs a new host
            // assignment; it replaces only that entity, with retire/spawn events.
            const sameBody = !!next && !!rt.def.body && !!next.body
                && rt.def.hostRef === next.hostRef && rt.def.hostAttach === next.hostAttach
                && rt.def.hostMotion === next.hostMotion;
            if (unchanged.has(rt.def.id) || sameBody)
                keep.set(rt.def.id, rt);
            else
                this.retireRuntime(rt);
        }
        this.runtimes = [];
        const statements = this.host.statements();
        for (const def of defs) {
            const rt = keep.get(def.id);
            if (!rt) {
                this.startEntity(def);
                continue;
            }
            if (!unchanged.has(def.id)) {
                this.reconcileBody(rt, def, def.memberIndices.map(i => statements[i]));
                this.runtimes.push(rt);
                continue;
            }
            rt.def = def;
            rt.stmts = def.memberIndices.map(i => statements[i]);
            rt.hasPlayableMembers = rt.stmts.some(s => !s.mute);
            for (const inst of rt.instances)
                inst.def = def;
            this.runtimes.push(rt);
        }
        // Recompute allocation after all retained/new classes are present; a
        // sound component added to a previously silent body can now be voiced.
        for (const rt of this.runtimes)
            if (rt.def.body)
                this.applyLadder(rt);
    }
    /** Change components without discarding the body's physical state. */
    reconcileBody(rt, def, stmts) {
        const before = rt.def;
        const oldStmts = rt.stmts;
        // The engine has already reused exact/live-edit Statement objects.
        // Stable source IDs carry per-life timing through a recording change.
        const retained = stmts.map(stmt => oldStmts.indexOf(stmt));
        const identity = stmts.map((stmt, m) => retained[m] >= 0 ? retained[m]
            : stmt.sourceId ? oldStmts.findIndex(old => old.sourceId === stmt.sourceId) : -1);
        const nextLastTakes = stmts.map((_stmt, m) => retained[m] >= 0 ? rt.lastTakes[retained[m]] : -1);
        const now = this.host.now();
        rt.memberRevision++;
        for (const inst of rt.instances) {
            const tracks = inst.tracks, keys = inst.keys, takes = inst.takes, chances = inst.chanceFireAt;
            const keepSlots = new Set(retained.filter(m => m >= 0));
            // A queued creation closes over its member ordinal. If a member moved
            // in the repertoire before creation, reschedule that component only.
            for (let oldM = 0; oldM < oldStmts.length; oldM++) {
                const newM = retained.indexOf(oldM);
                if (keepSlots.has(oldM) && (tracks[oldM] || newM === oldM))
                    continue;
                const track = tracks[oldM];
                if (track && this.host.trackFor(keys[oldM]) === track)
                    this.host.stopTrack(keys[oldM], ENTITY_RETIRE_FADE_S);
                else
                    this.host.cancelTrackEvents(keys[oldM]);
                if (oldStmts[oldM].kind === 'trigger' && oldStmts[oldM].eventName)
                    this.host.forgetTriggerFamily(this.host.memberFamilyKey(oldStmts[oldM], inst));
            }
            inst.tracks = stmts.map((_stmt, m) => retained[m] >= 0 ? tracks[retained[m]] : null);
            inst.keys = stmts.map((_stmt, m) => {
                const oldM = retained[m];
                return oldM >= 0 && (tracks[oldM] || oldM === m) ? keys[oldM]
                    : `e:${def.id}:${inst.n}:${def.memberIndices[m]}r${rt.memberRevision}`;
            });
            inst.takes = stmts.map((stmt, m) => {
                if (retained[m] >= 0)
                    return takes[retained[m]];
                const take = takeCount(stmt) > 1 ? this.host.drawTake(stmt, nextLastTakes[m]) : -1;
                if (take >= 0)
                    nextLastTakes[m] = take;
                return take;
            });
            inst.chanceFireAt = stmts.map((stmt, m) => {
                if (identity[m] >= 0 && stmt.chance === oldStmts[identity[m]].chance)
                    return chances[identity[m]];
                if (stmt.chance === null || this.rng() >= stmt.chance)
                    return Infinity;
                const remaining = def.hostMotion === 'pass' ? Math.max(0, (1 - inst.progress) * inst.len / inst.cruise) : POPULATION_CHANCE_WINDOW_S;
                return now + this.rng() * remaining;
            });
            if (def.behavior) {
                if (inst.behavior)
                    reconcileEntityBehavior(inst.behavior, def.behavior, now, this.rng, def.hold);
                else
                    inst.behavior = createEntityBehavior(def.behavior, now, this.rng, def.hold);
            }
            else
                inst.behavior = undefined;
            inst.def = def;
            for (let m = 0; m < inst.tracks.length; m++) {
                const track = inst.tracks[m];
                if (track) {
                    track._member = m;
                    track.statementIndex = def.memberIndices[m];
                }
            }
        }
        rt.def = def;
        // The anchors depend on how far a body relocates AND on how many bodies there are (a standing
        // population gets one place per resident): a raised count resolves them again, or the new
        // residents share the places resolved for the old count (2026-10-03).
        if (rt.anchors && (before.agent.relocates !== def.agent.relocates
            || before.agent.relocateM[0] !== def.agent.relocateM[0]
            || before.agent.relocateM[1] !== def.agent.relocateM[1]
            || before.count !== def.count)) {
            const previous = rt.anchors;
            const next = resolveAnchors(this.host.world(), def.hostRef, def.hostAttach, this.host.worldRng, def.agent.relocates ? def.agent.relocateM : undefined, def.count);
            rt.occupied.clear();
            // Keep occupied perches / in-flight destinations exactly where they are,
            // while replacing the free lattice. No teleport or unbounded cache growth.
            for (const inst of rt.instances) {
                const agent = inst.agent;
                if (!agent)
                    continue;
                const old = previous[agent.anchor];
                if (!old) {
                    agent.anchor = -1;
                    continue;
                }
                let index = next.findIndex(a => a.x === old.x && a.y === old.y && a.z === old.z);
                if (index < 0) {
                    index = next.length;
                    next.push(old);
                }
                agent.anchor = index;
                rt.occupied.add(index);
            }
            rt.anchors = next;
        }
        rt.stmts = stmts;
        rt.hasPlayableMembers = stmts.some(stmt => !stmt.mute);
        rt.lastTakes = nextLastTakes;
        for (const inst of rt.instances) {
            if (!rt.hasPlayableMembers) {
                inst.voiced = false;
                if (inst.agent)
                    inst.agent.voiced = false;
            }
            else if (inst.voiced) {
                for (let m = 0; m < stmts.length; m++) {
                    const oldM = retained[m];
                    if (!inst.tracks[m] && (oldM < 0 || oldM !== m))
                        this.scheduleMember(rt, inst, m);
                }
            }
            this.reconcileMotion(inst, before, def, now);
        }
        if (def.hostMotion === 'fixed') {
            while (rt.instances.length > def.count)
                this.retireInstance(rt, rt.instances[rt.instances.length - 1]);
            while (rt.instances.length < def.count)
                this.spawnInstance(rt);
        }
        else if (JSON.stringify(before.every) !== JSON.stringify(def.every) || JSON.stringify(before.paceFollow) !== JSON.stringify(def.paceFollow)) {
            this.host.cancelTrackEvents(`entity:${def.id}`);
            this.scheduleEntitySpawn(rt);
        }
    }
    reconcileMotion(inst, before, def, now) {
        const remap = (value, oldRange, nextRange) => {
            const fraction = oldRange[1] > oldRange[0] ? Math.max(0, Math.min(1, (value - oldRange[0]) / (oldRange[1] - oldRange[0]))) : 0.5;
            return nextRange[0] + fraction * (nextRange[1] - nextRange[0]);
        };
        const a = inst.agent;
        if (a) {
            if (JSON.stringify(before.agent.speedMs) !== JSON.stringify(def.agent.speedMs)) {
                const speed = Math.max(0.1, remap(a.speedMs, before.agent.speedMs, def.agent.speedMs));
                if (a.seg) {
                    const progress = Math.max(0, Math.min(1, (now - a.seg.t0) / a.seg.durS));
                    a.seg.durS *= a.speedMs / speed;
                    a.seg.t0 = now - progress * a.seg.durS;
                    a.until = a.seg.t0 + a.seg.durS;
                }
                a.speedMs = speed;
            }
            // Complete a flight already in progress. Updated travel/relocation
            // rules govern its next departure; changing rest length responds now.
            if (!a.seg && (before.agent.relocates !== def.agent.relocates
                || before.agent.callChance !== def.agent.callChance
                || JSON.stringify(before.agent.dwellS) !== JSON.stringify(def.agent.dwellS)))
                beginBout(a, def.agent, now, this.rng);
        }
        else if (!def.speed.isNull && JSON.stringify(before.speed) !== JSON.stringify(def.speed)) {
            const oldRange = before.speed.isNull ? [inst.cruise, inst.cruise] : [before.speed.min, before.speed.max];
            const cruise = Math.max(0.1, remap(inst.cruise, oldRange, [def.speed.min, def.speed.max]));
            if (inst.cruise > 0)
                inst.velocity *= cruise / inst.cruise;
            inst.cruise = cruise;
        }
        if (JSON.stringify(before.gait) !== JSON.stringify(def.gait)) {
            const fraction = inst.stride > 0 ? inst.strideAccum / inst.stride : 0;
            const oldRange = before.gait.isNull ? [inst.stride, inst.stride] : [before.gait.min, before.gait.max];
            inst.stride = def.gait.isNull ? 0 : remap(inst.stride, oldRange, [def.gait.min, def.gait.max]);
            inst.strideAccum = fraction * inst.stride;
        }
    }
    /** Stop: instances die with their tracks; orphaned spawner closures see `alive` off. */
    dropAll() {
        for (const rt of this.runtimes) {
            rt.alive = false;
            for (const inst of rt.instances)
                inst.phase = 'done';
        }
        this.runtimes = [];
        this.instanceSnapshot = null;
    }
    /** How many entity classes are running (0 means the tick can skip the layer). */
    get count() { return this.runtimes.length; }
    /** First live instance of the entity with this id, or null. */
    instanceById(id) {
        for (const rt of this.runtimes) {
            if (rt.def.id !== id)
                continue;
            if (rt.instances.length > 0)
                return rt.instances[0];
        }
        return null;
    }
    /**
     * A new world (or hosting toggled): populations that were sitting at the
     * origin take their perches; a new world means new anchors for every agent.
     */
    rehostAll() {
        for (const rt of this.runtimes) {
            rt.hostOrder = [];
            rt.hostCursor = 0;
            rt.anchors = null;
            rt.occupied.clear();
            if (rt.def.hostMotion === 'pass' || !rt.def.hostRef)
                continue;
            for (const inst of rt.instances)
                this.hostPopulationInstance(rt, inst);
        }
    }
    /**
     * Bring one entity class to life: a population spawns its `count` bodies
     * at once; a physical route seeds its steady occupancy along the path
     * (the road is not empty at t = 0) and runs its spawner. Physical bodies
     * live independently of their repertoire. Legacy audio-only routes still
     * use their activity as the spawn gate.
     */
    startEntity(def) {
        const stmts = def.memberIndices.map(i => this.host.statements()[i]);
        const rt = {
            def, stmts, hasPlayableMembers: stmts.some(s => !s.mute), memberRevision: 0, instances: [], nextN: 0,
            lastTakes: new Array(def.memberIndices.length).fill(-1), hostOrder: [], hostCursor: 0, spawnGen: 0, alive: true,
            anchors: null, occupied: new Set(), chorus: new ChorusArbiter(),
            ladderDist: [], ladderVoiced: [], ladderOut: [], ladderOrder: [],
        };
        this.runtimes.push(rt);
        if (!rt.stmts.length && !def.body)
            return;
        if (def.hostMotion === 'pass') {
            if (this.maySpawn(def)) {
                if (def.body) {
                    const count = this.initialRoutePopulation(def);
                    for (let k = 0; k < count; k++)
                        this.spawnInstance(rt, { arcFraction: (k + 0.25 + this.rng() * 0.5) / count });
                    this.applyLadder(rt);
                }
                else {
                    for (let k = 0; k < ROUTE_SEED_INSTANCES; k++)
                        this.spawnInstance(rt, { progress: this.rng() * ROUTE_SEED_PROGRESS_MAX });
                }
            }
            this.scheduleEntitySpawn(rt);
        }
        else {
            // Every individual comes into being; the ladder decides which are voices.
            for (let k = 0; k < def.count; k++)
                this.spawnInstance(rt);
            this.applyLadder(rt);
        }
    }
    /** Steady route occupancy follows travel time and arrival cadence, independently of voice limits. */
    initialRoutePopulation(def) {
        const world = this.host.world();
        const feature = world && def.hostRef && this.host.hostingEnabled() ? featureById(world, def.hostRef) : null;
        if (!feature || feature.kind !== 'strip')
            return 0;
        const speed = def.speed.isNull
            ? ROUTE_FLOW_SPEED_MIN_MS + (ROUTE_FLOW_SPEED_MAX_MS - ROUTE_FLOW_SPEED_MIN_MS) * Math.max(0, Math.min(1, feature.flow))
            : Math.max(0.1, (def.speed.min + def.speed.max) / 2);
        let interval = (def.every.min + def.every.max) / 2;
        if (def.paceFollow) {
            const signal = this.host.signalValue(def.paceFollow.signal);
            if (!isNaN(signal))
                interval *= Math.max(0.05, mapFollow(def.paceFollow, signal));
        }
        const duration = featureArcLength(feature) / speed + def.stopChance * (def.stopS.min + def.stopS.max) / 2;
        return Math.max(0, Math.min(POPULATION_COUNT_MAX, Math.round(duration / Math.max(0.05, interval))));
    }
    /** `active` × `quiet` of the entity itself — the spawner's gate (members carry the same gates on their own tracks). */
    entityActivity(def) {
        if (!def.activeHours && !def.quietGates.length)
            return 1;
        return this.host.activityOf(def.activeHours, def.quietGates);
    }
    /**
     * Explicit bodies are simulation objects: muting their acoustic activity
     * cannot erase them. Audio-only scripts retain the old route-spawn gate;
     * members in both forms still inherit the entity's acoustic gates.
     */
    maySpawn(def) {
        return !!def.body || this.entityActivity(def) >= ENTITY_ACTIVITY_MIN;
    }
    /**
     * The route spawner: one scheduler event per interval (`every` × `pace`),
     * tagged with the runtime's generation so a retired or restarted entity's
     * chain fires as no-ops. A spawn a cap or a gate refuses is simply skipped;
     * the next one is scheduled regardless, so a road that has no strip yet
     * (world still loading) fills as soon as it does.
     */
    scheduleEntitySpawn(rt) {
        const gen = ++rt.spawnGen;
        let every = rt.def.every.sample(this.rng);
        if (rt.def.paceFollow) {
            const x = this.host.signalValue(rt.def.paceFollow.signal);
            if (!isNaN(x))
                every *= Math.max(0.05, mapFollow(rt.def.paceFollow, x));
        }
        this.host.scheduleAfter(Math.max(0.05, every), `entity:${rt.def.id}`, `spawn:${rt.def.id}`, () => {
            if (!rt.alive || rt.spawnGen !== gen || !this.host.isPlaying())
                return;
            if (this.maySpawn(rt.def)) {
                this.spawnInstance(rt);
                if (rt.def.body)
                    this.applyLadder(rt);
            }
            this.scheduleEntitySpawn(rt);
        });
    }
    /** Instances holding member tracks — the panner budget (a demoted individual costs nothing). */
    liveInstanceCount() {
        let n = 0;
        for (const rt of this.runtimes)
            for (const inst of rt.instances)
                if (inst.voiced)
                    n++;
        return n;
    }
    /**
     * Bring one instance into being: draw its constants (cruise speed, halt
     * plan, pitch offset, its take of every pooled member — never the previous
     * instance's when there is a choice — and when its once-per-life sounds
     * land), host it (perch or strip), create its member tracks, log `spawn`.
     * A seed specifies legacy travel progress or a physical position along the path.
     * Null when a cap holds or a route has no strip to run.
     */
    /** The loudest thing this entity emits at 1 m (its members' `spl`, the default when none states one). */
    loudestEmissionDb(rt) {
        let top = -Infinity;
        for (const stmt of rt.stmts) {
            if (stmt.mute)
                continue;
            top = Math.max(top, stmt.spl.isNull ? DEFAULT_SPL_DB : stmt.spl.max);
        }
        return isFinite(top) ? top : DEFAULT_SPL_DB;
    }
    /** The place's floor at the ear: the loudest bed the scene states, else still air. */
    sceneFloorDb() {
        let floor = -Infinity;
        for (const stmt of this.host.statements())
            if (stmt.bed && !stmt.mute)
                floor = Math.max(floor, stmt.spl.isNull ? DEFAULT_FLOOR_DB : stmt.spl.max);
        return isFinite(floor) ? floor : DEFAULT_FLOOR_DB;
    }
    spawnInstance(rt, seed) {
        const def = rt.def;
        const isRoute = def.hostMotion === 'pass';
        // The per-class cap and the scene total bound a route's rolling spawns;
        // a population is bounded by its own `count` (parser-clamped) and its
        // VOICES by the ladder — an individual beyond the panner budget still
        // lives in the world, it just has no tracks.
        if (isRoute && rt.instances.length >= (def.body ? POPULATION_COUNT_MAX : ENTITY_MAX_PER_CLASS))
            return null;
        if (isRoute && !def.body && this.liveInstanceCount() >= ENTITY_MAX_TOTAL)
            return null;
        const now = this.host.now();
        const M = rt.stmts.length;
        const inst = {
            def, n: rt.nextN, tracks: new Array(M).fill(null), keys: new Array(M).fill(''),
            position: { x: 0, y: 0, z: 0 }, velocity: 0, accel: 0, progress: 0, spawnedAt: now,
            arc: 0, dir: 1, cruise: 0, len: 0, phase: 'cruise', stopArc: -1, idleUntil: 0, idleS: 0,
            pitchOffset: 1 - ENTITY_PITCH_SPREAD + this.rng() * 2 * ENTITY_PITCH_SPREAD,
            takes: new Array(M).fill(-1), chanceFireAt: new Array(M).fill(Infinity), hostId: null,
            agent: null, voiced: false,
            // This body's own stride, and a random fraction of it already walked:
            // bodies spawned on the same tick must not step in lockstep.
            stride: def.gait.isNull ? 0 : Math.max(0, def.gait.sample(this.rng)),
            strideAccum: 0,
        };
        if (inst.stride > 0)
            inst.strideAccum = this.rng() * inst.stride;
        let lifeS = Infinity;
        if (def.hostMotion === 'pass') {
            const world = this.host.world();
            const f = world && def.hostRef && this.host.hostingEnabled() ? featureById(world, def.hostRef) : null;
            if (!f || f.kind !== 'strip')
                return null;
            const len = featureArcLength(f);
            if (!(len > 0))
                return null;
            inst.len = len;
            inst.dir = this.rng() < 0.5 ? -1 : 1;
            if (def.speed.isNull) {
                // The strip's `flow` sets the pace: 0 → walking, 1 → fast traffic, ±30 % per body.
                const flow = f.flow < 0 ? 0 : f.flow > 1 ? 1 : f.flow;
                const base = ROUTE_FLOW_SPEED_MIN_MS + (ROUTE_FLOW_SPEED_MAX_MS - ROUTE_FLOW_SPEED_MIN_MS) * flow;
                inst.cruise = base * (1 - ROUTE_FLOW_SPEED_SPREAD + this.rng() * 2 * ROUTE_FLOW_SPEED_SPREAD);
            }
            else {
                inst.cruise = Math.max(0.1, def.speed.sample(this.rng));
            }
            inst.velocity = inst.cruise;
            const p0 = seed?.arcFraction === undefined ? seed?.progress ?? 0 : inst.dir > 0 ? seed.arcFraction : 1 - seed.arcFraction;
            inst.arc = inst.dir > 0 ? p0 * len : (1 - p0) * len;
            inst.progress = p0;
            // Born and retired beyond earshot (spec 006, FR-006): a fresh arrival starts where its loudest
            // member is under the place's bed at the listener, and leaves only once it is there again.
            // A seeded body (mid-stream at t = 0) is already on its way and keeps its place.
            {
                const radius = audibilityRadiusM(this.loudestEmissionDb(rt), this.sceneFloorDb());
                const L = this.host.listenerPos();
                const end = HOST_SCRATCH, tan = TANGENT_SCRATCH;
                const startAtEnd = inst.dir < 0;
                if (!seed && featurePointAtArcInto(f, startAtEnd ? len : 0, end) && featureEndTangentInto(f, startAtEnd, tan)) {
                    inst.rollInM = rollBeyondM(end.x, end.z, tan.x, tan.z, L.x, L.z, radius);
                    inst.arc = inst.dir > 0 ? -inst.rollInM : len + inst.rollInM;
                }
                // Every body, seeded or not, recedes out of earshot before it goes.
                if (featurePointAtArcInto(f, startAtEnd ? 0 : len, end) && featureEndTangentInto(f, !startAtEnd, tan)) {
                    inst.rollOutM = rollBeyondM(end.x, end.z, tan.x, tan.z, L.x, L.z, radius);
                }
            }
            if (def.stopChance > 0 && this.rng() < def.stopChance) {
                const s = len * ((1 - ROUTE_STOP_BAND) / 2 + this.rng() * ROUTE_STOP_BAND);
                // Only a halt still ahead of a seeded body counts.
                if (inst.dir > 0 ? s > inst.arc : s < inst.arc) {
                    inst.stopArc = s;
                    inst.idleS = Math.max(0, def.stopS.sample(this.rng));
                }
            }
            lifeS = ((1 - p0) * len + (inst.rollInM ?? 0) + (inst.rollOutM ?? 0)) / inst.cruise + (inst.stopArc >= 0 ? inst.idleS : 0);
            this.routePositionInto(inst, f);
        }
        else {
            // A population individual is an agent: its relocation speed is its
            // own for life, its perch an anchor of the host (hostPopulationInstance).
            // The sway phase is drawn from the engine's seeded rng, so a crowd never
            // shifts in unison and a seeded run still reproduces exactly — but ONLY
            // when the entity sways. A feature that is off must not consume
            // randomness: drawing unconditionally shifted the sequence for every
            // scene ever written, changing where existing populations perch.
            const speed = Math.max(0.1, drawRange(def.agent.speedMs, this.rng));
            inst.agent = newAgent(-1, speed, def.agent.swayM > 0 ? this.rng() * Math.PI * 2 : 0);
            inst.agent.voiced = false;
            this.hostPopulationInstance(rt, inst);
            // Its first bout: drawn like every later one when bouts matter (it
            // relocates, or some bouts are silent); a body that only ever calls
            // from one perch has nothing to wait for and keeps calling.
            if (def.agent.relocates || def.agent.callChance < 1 || this.goals.has(def.id))
                beginBout(inst.agent, def.agent, now, this.rng, this.goals.get(def.id) ?? null);
        }
        if (def.behavior) {
            inst.behavior = createEntityBehavior(def.behavior, now, this.rng, def.hold);
            if (inst.agent) {
                beginBout(inst.agent, def.agent, now, this.rng, inst.behavior.action.goal);
                if (inst.behavior.action.goal === 'roam' || inst.behavior.action.goal === 'flee')
                    inst.agent.until = -Infinity;
            }
        }
        for (let m = 0; m < M; m++) {
            const stmt = rt.stmts[m];
            if (takeCount(stmt) > 1) {
                const k = this.host.drawTake(stmt, rt.lastTakes[m]);
                inst.takes[m] = k;
                if (k >= 0)
                    rt.lastTakes[m] = k;
            }
            if (stmt.chance !== null && this.rng() < stmt.chance) {
                inst.chanceFireAt[m] = def.hostMotion === 'pass'
                    ? now + lifeS * ((1 - ROUTE_CHANCE_BAND) / 2 + this.rng() * ROUTE_CHANCE_BAND)
                    : now + this.rng() * POPULATION_CHANCE_WINDOW_S;
            }
            inst.keys[m] = `e:${def.id}:${inst.n}:${def.memberIndices[m]}`;
        }
        rt.nextN++;
        rt.instances.push(inst);
        this.instanceSnapshot = null;
        this.host.logEvent('spawn', def.id, inst.position, { entity: def.id, instance: inst.n });
        // Legacy routes are voices from birth. Explicit bodies and populations
        // use the ladder, independently of their physical instance count.
        if (isRoute && !def.body && rt.hasPlayableMembers && this.liveInstanceCount() < ENTITY_MAX_TOTAL)
            this.voiceInstance(rt, inst);
        return inst;
    }
    /**
     * Give an instance its member tracks: loops, triggers (`on …`, chance
     * members) and repeating oneshots — the last on a phase of their own, so
     * a population never fires in unison and a road's horns are not
     * metronomic. Called at a route body's spawn and when the ladder promotes
     * a population individual.
     */
    voiceInstance(rt, inst) {
        if (!rt.hasPlayableMembers)
            return;
        inst.voiced = true;
        if (inst.agent)
            inst.agent.voiced = true;
        for (let m = 0; m < rt.stmts.length; m++)
            this.scheduleMember(rt, inst, m);
    }
    scheduleMember(rt, inst, m) {
        const stmt = rt.stmts[m];
        if (stmt.mute)
            return;
        const key = inst.keys[m];
        const idx = rt.def.memberIndices[m];
        if (stmt.kind === 'oneshot' && !stmt.every.isNull) {
            const delay = this.rng() * stmt.every.sample(this.rng);
            this.host.scheduleAfter(delay, key, `create:${stmt.clip}`, () => this.host.createVoice(key, stmt, idx, { inst, m }));
        }
        else {
            this.host.createVoice(key, stmt, idx, { inst, m });
        }
    }
    /**
     * Take an instance's member tracks away — the ladder demoting an
     * individual into the bed. The body stays: position, agent state, log
     * labels; only the panners go (faded like a retirement), along with any
     * member creation still queued and the body's trigger cooldowns.
     */
    unvoiceInstance(rt, inst) {
        inst.voiced = false;
        if (inst.agent)
            inst.agent.voiced = false;
        for (let m = 0; m < inst.keys.length; m++) {
            const key = inst.keys[m];
            const track = inst.tracks[m];
            if (track && this.host.trackFor(key) === track)
                this.host.stopTrack(key, ENTITY_UNVOICE_FADE_S);
            else
                this.host.cancelTrackEvents(key);
            inst.tracks[m] = null;
            const stmt = rt.stmts[m];
            if (stmt && stmt.kind === 'trigger' && stmt.eventName)
                this.host.forgetTriggerFamily(this.host.memberFamilyKey(stmt, inst));
        }
        rt.chorus.forget(inst.n);
    }
    /** A timed call took its turn in the entity's chorus for as long as the take lasts. */
    noteCall(inst, now, durationS) {
        const rt = this.runtimeOf(inst);
        if (rt)
            rt.chorus.noteCall(inst.n, now, durationS, rt.def.agent, this.rng);
    }
    /** The runtime an instance belongs to (a handful of entities: a linear scan, no map). */
    runtimeOf(inst) {
        for (const rt of this.runtimes)
            if (rt.def === inst.def)
                return rt;
        return null;
    }
    /**
     * The representation ladder (EntityAgents.ladderSelect): the nearest
     * `voices` individuals within `window` metres of the listener hold member
     * tracks; the rest are demoted into the bed — still in the world,
     * positioned and behaving, without a panner — and their number is
     * published as `<entity>_far` for a bed voice to `volume follow`. The
     * scene's panner budget (`ENTITY_MAX_TOTAL`) bounds the voiced count
     * across entities. Runs at play and every LADDER_EVERY_TICKS ticks.
     */
    applyLadder(rt) {
        const insts = rt.instances;
        const n = insts.length;
        if (!n || !rt.hasPlayableMembers)
            return;
        const p = rt.def.agent;
        let voicedHere = 0;
        for (let i = 0; i < n; i++)
            if (insts[i].voiced)
                voicedHere++;
        const remaining = Math.max(0, ENTITY_MAX_TOTAL - (this.liveInstanceCount() - voicedHere));
        const budget = p.voices > 0 ? Math.min(p.voices, remaining) : remaining;
        const lx = this.host.listenerPos().x, ly = this.host.listenerPos().y, lz = this.host.listenerPos().z;
        const dist = rt.ladderDist, voiced = rt.ladderVoiced, out = rt.ladderOut, order = rt.ladderOrder;
        dist.length = n;
        voiced.length = n;
        out.length = n;
        order.length = n;
        for (let i = 0; i < n; i++) {
            const q = insts[i].position;
            const dx = q.x - lx, dy = q.y - ly, dz = q.z - lz;
            dist[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
            voiced[i] = insts[i].voiced;
        }
        ladderSelect(dist, voiced, budget, p.windowM, out, order);
        let far = 0;
        for (let i = 0; i < n; i++) {
            const inst = insts[i];
            if (out[i] && !inst.voiced) {
                this.voiceInstance(rt, inst);
                this.onAgentTransition(rt, inst, 'promote');
            }
            else if (!out[i] && inst.voiced) {
                this.unvoiceInstance(rt, inst);
                this.onAgentTransition(rt, inst, 'demote');
            }
            if (!inst.voiced)
                far++;
        }
        this.host.setSignal(`${rt.def.id}_far`, far);
    }
    /** Scratch for the agent step (one object, rewritten per tick). */
    _agentCtx = { now: 0, listenerX: 0, listenerY: 0, listenerZ: 0, rng: () => 0, groundY: null };
    _agentTransitions = [];
    _agentGroundY = (x, z) => { const w = this.host.world(); return w ? heightAt(w.heightfield, x, z) : 0; };
    /**
     * An agent did something (EntityAgents.AgentTransition): log it as an
     * `agent` event — the behaviour tag the export corpus carries — and fire
     * the instance's OWN `on <transition>` members (the wings on `startle`,
     * the landing rustle on `perch`). Other bodies hear nothing unless such
     * a member `emit`s an event of its own — alarm spreads by the script's
     * choice, not by a rule.
     */
    onAgentTransition(rt, inst, label) {
        this.host.logEvent('agent', label, inst.position, { entity: rt.def.id, instance: inst.n });
        if (!inst.voiced)
            return;
        for (let m = 0; m < rt.stmts.length; m++) {
            const stmt = rt.stmts[m];
            const track = inst.tracks[m];
            if (!track || stmt.kind !== 'trigger' || stmt.eventName !== label)
                continue;
            this.host.fireTriggerFamily(this.host.memberFamilyKey(stmt, inst), [track], { x: inst.position.x, y: inst.position.y, z: inst.position.z });
        }
    }
    /** Candidate tracks of one footfall — refilled per footfall, never held. */
    _footfallTracks = [];
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
    fireContact(rt, inst, contact) {
        const p = inst.position;
        const touched = inst.hostId ? this.host.worldObjectById(inst.hostId) : undefined;
        const material = touched?.material || this.host.sampleField(p.x, p.y, p.z)?.surface || '';
        // `contact:<act>:<contact>:<material>`: the row export/ContactLabels reads into Ludwig's labels.
        this.host.logEvent('agent', `contact:${inst.behavior?.action.name ?? ''}:${contact}:${material}`, inst.position, { entity: rt.def.id, instance: inst.n });
        if (!inst.voiced)
            return;
        const cands = this._footfallTracks;
        cands.length = 0;
        for (let m = 0; m < inst.tracks.length; m++) {
            const t = inst.tracks[m];
            if (t)
                cands.push(t);
        }
        if (!cands.length)
            return;
        const payload = { x: p.x, y: p.y, z: p.z, positionMode: 'contact' };
        if (material)
            payload.text = material;
        this.host.dispatchTriggers(cands, contact, payload);
    }
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
    fireFootfall(inst) {
        const cands = this._footfallTracks;
        cands.length = 0;
        for (let m = 0; m < inst.tracks.length; m++) {
            const t = inst.tracks[m];
            if (t)
                cands.push(t);
        }
        if (!cands.length)
            return;
        const p = inst.position;
        const feetY = this.walkingSupportY(inst) ?? p.y;
        const payload = { x: p.x, y: feetY, z: p.z, positionMode: 'contact' };
        const s = this.host.sampleField(p.x, feetY, p.z);
        if (s) {
            payload.depth = s.depth;
            payload.submerged = s.submerged;
            payload.liquid = s.liquid;
            if (s.surface)
                payload.text = s.surface;
        }
        this.host.dispatchTriggers(cands, STEP_EVENT, payload);
    }
    /**
     * A positioned event (a footstep, an `emit`) startles every perched
     * agent within its entity's `startle` radius of the point — the Phase 1
     * event bus as the second startle source beside the listener's approach.
     * A body already in flight ignores it (startleAgent).
     */
    startleNear(x, y, z) {
        const ctx = this._agentCtx;
        ctx.now = this.host.now();
        ctx.rng = this.rng;
        ctx.groundY = this.host.world() && this.host.hostingEnabled() ? this._agentGroundY : null;
        for (const rt of this.runtimes) {
            const p = rt.def.agent;
            if (rt.def.hostMotion === 'pass' || p.startleM <= 0)
                continue;
            const r2 = p.startleM * p.startleM;
            const anchors = this.host.hostingEnabled() && rt.anchors ? rt.anchors : NO_ANCHORS;
            for (const inst of rt.instances) {
                const a = inst.agent;
                if (!a || a.state === 'relocating' || a.state === 'fleeing')
                    continue;
                const q = inst.position;
                const dx = q.x - x, dz = q.z - z;
                if (dx * dx + dz * dz > r2)
                    continue; // ground-plane distance, like the listener's approach
                const t = startleAgent(a, p, anchors, rt.occupied, q, x, y, z, ctx);
                if (t)
                    this.onAgentTransition(rt, inst, t);
            }
        }
    }
    /**
     * May this timed-oneshot member sound now? Its body must be in a calling
     * bout and the entity's chorus arbiter must have a slot (callers / gap).
     */
    agentMayCall(inst) {
        const a = inst.agent;
        if (!a)
            return true;
        if (a.state !== 'calling')
            return false;
        const rt = this.runtimeOf(inst);
        return !rt || rt.chorus.mayCall(inst.n, this.host.now(), rt.def.agent);
    }
    /** A visible ground-hosted body stands on terrain, including the submerged pool
     * floor. Audio-only anchors, object perches and flying bodies keep their
     * historical placement. This is kinematic support, not a foot-bone solver. */
    walkingSupportY(inst) {
        const def = inst.def, world = this.host.world();
        if (!def.body || !world || !this.host.hostingEnabled() || inst.hostId
            || def.agent.travel === 'fly' || inst.agent?.seg?.walk === false)
            return null;
        if (def.hostRef !== 'ground' && (!def.hostRef || !featureById(world, def.hostRef)))
            return null;
        return heightAt(world.heightfield, inst.position.x, inst.position.z);
    }
    groundWalkingBody(inst) {
        const floor = this.walkingSupportY(inst);
        if (floor !== null && inst.def.body)
            inst.position.y = floor - entityBodyFloorY(inst.def.body);
    }
    /** A route body's position from its arc along the strip (no allocation). */
    routePositionInto(inst, f) {
        const p = HOST_SCRATCH;
        // Beyond the ends the body is on the strip's line extended (its roll-in and roll-out, spec 006).
        if (!featurePointAtArcExtrapolatedInto(f, inst.arc, p))
            return;
        inst.position.x = p.x;
        inst.position.y = p.y + (f.liquid ? ROUTE_HEIGHT_LIQUID_M : ROUTE_HEIGHT_M);
        inst.position.z = p.z;
        this.groundWalkingBody(inst);
    }
    /**
     * Perch a population body on its own host: a fixed object id; a distinct
     * member of a class (a shuffled order the instances take turns along, so
     * fewer objects than bodies round-robin); a random point of a strip or
     * patch; a random dry ground point 4–18 m out; or — without a world, or
     * with no host — the origin. Members already created move with it.
     */
    hostPopulationInstance(rt, inst) {
        const def = rt.def;
        const world = this.host.world();
        const p = inst.position;
        const agent = inst.agent;
        if (agent) {
            rt.occupied.delete(agent.anchor);
            agent.anchor = -1;
        }
        inst.hostId = null;
        p.x = 0;
        p.y = 0;
        p.z = 0;
        const ref = def.hostRef;
        if (world && ref && this.host.hostingEnabled()) {
            // The world's anchors for this host (EntityAgents.resolveAnchors) —
            // every object of the class, the fixture, points along the feature,
            // seeded ground points — resolved once per world.
            if (!rt.anchors)
                rt.anchors = resolveAnchors(world, ref, def.hostAttach, this.host.worldRng, def.agent.relocates ? def.agent.relocateM : undefined, def.count, { attachOf: (o, attach) => this.host.attachPointOf(o, attach), groundHalfM: () => this.host.groundHalfM() });
            const anchors = rt.anchors;
            const exact = this.host.worldObjectById(ref);
            const feature = exact ? null : featureById(world, ref);
            // A person placed by hand (the world block's `instance <entity> <n> at x,z`) stands where
            // they were put, and that place is their anchor: a relocating body sets out from it. Until
            // 2026-10-03 only the designer's selection box read the pin, so a dragged person's box
            // moved and the person did not.
            const pin = world.spec.instancePins?.find(q => q.entity === def.id && q.index === inst.n);
            if (pin) {
                const g = heightAt(world.heightfield, pin.position[0], pin.position[1]);
                p.x = pin.position[0];
                p.y = g + ROUTE_HEIGHT_M;
                p.z = pin.position[1];
                let k = anchors.findIndex(c => c.x === p.x && c.z === p.z);
                if (k < 0) {
                    k = anchors.length;
                    anchors.push({ x: p.x, y: p.y, z: p.z, id: null, groundY: g });
                }
                if (agent) {
                    agent.anchor = k;
                    rt.occupied.add(k);
                }
            }
            else if (ref === 'ground' || feature) {
                // A free anchor of the ground / the feature, drawn at random (any
                // anchor when all are taken; the old listener-relative draw when
                // the world offers none).
                let k = -1;
                if (anchors.length) {
                    const start = Math.floor(this.rng() * anchors.length);
                    for (let i = 0; i < anchors.length && k < 0; i++) {
                        const c = (start + i) % anchors.length;
                        if (!rt.occupied.has(c))
                            k = c;
                    }
                    if (k < 0)
                        k = start;
                    p.x = anchors[k].x;
                    p.y = anchors[k].y;
                    p.z = anchors[k].z;
                }
                else if (ref === 'ground') {
                    this.host.drawGroundPointInto(p);
                }
                if (agent && k >= 0) {
                    agent.anchor = k;
                    rt.occupied.add(k);
                }
            }
            else if (exact) {
                const a = this.host.attachPointOf(exact, def.hostAttach);
                p.x = a.x;
                p.y = a.y;
                p.z = a.z;
                inst.hostId = exact.id;
            }
            else {
                if (!rt.hostOrder.length) {
                    for (let i = 0; i < world.objects.length; i++)
                        if (world.objects[i].classId === ref)
                            rt.hostOrder.push(i);
                    for (let i = rt.hostOrder.length - 1; i > 0; i--) {
                        const j = Math.floor(this.rng() * (i + 1));
                        const t = rt.hostOrder[i];
                        rt.hostOrder[i] = rt.hostOrder[j];
                        rt.hostOrder[j] = t;
                    }
                }
                if (rt.hostOrder.length) {
                    const o = world.objects[rt.hostOrder[rt.hostCursor++ % rt.hostOrder.length]];
                    const a = this.host.attachPointOf(o, def.hostAttach);
                    p.x = a.x;
                    p.y = a.y;
                    p.z = a.z;
                    inst.hostId = o.id;
                }
                else {
                    // The procedural world has no object of this class, but the drawing or the embedder
                    // registered some (`tree_1 … tree_n` from an instanced forest): perch on those rather
                    // than falling silently to the origin (2026-10-09).
                    const members = this.host.externalHostMembers(ref);
                    if (members.length) {
                        const m = members[rt.hostCursor++ % members.length];
                        const g = this.host.hostGeometryOf(m.id);
                        const a = g ? attachFromGeometry(g, def.hostAttach) : m.p;
                        p.x = a.x;
                        p.y = a.y;
                        p.z = a.z;
                        inst.hostId = m.id;
                    }
                }
            }
            if (agent && agent.anchor < 0 && inst.hostId) {
                const k = nearestAnchor(anchors, p.x, p.y, p.z, inst.hostId);
                if (k >= 0) {
                    agent.anchor = k;
                    rt.occupied.add(k);
                }
            }
        }
        this.groundWalkingBody(inst);
        this.pinMembersTo(inst);
    }
    /** Every member track sits where the body is. */
    pinMembersTo(inst) {
        const p = inst.position;
        for (let m = 0; m < inst.tracks.length; m++) {
            const t = inst.tracks[m];
            if (!t || (t._triggerAtContact && t.sourceNode))
                continue;
            if (t.pinned) {
                t.pinned.x = p.x;
                t.pinned.y = p.y;
                t.pinned.z = p.z;
            }
            else
                t.pinned = { x: p.x, y: p.y, z: p.z };
            t.position.x = p.x;
            t.position.y = p.y;
            t.position.z = p.z;
        }
    }
    /**
     * The graphics reported (or changed) a host's geometry: every body perched on it moves to the
     * drawn attach point, its anchor follows, and a class that could not be seated before (no
     * procedural object, external hosts since registered) takes its perches now.
     */
    rehostOn(hostId) {
        const world = this.host.world();
        const cls = classOfHost(hostId);
        for (const rt of this.runtimes) {
            const def = rt.def;
            if (def.hostMotion === 'pass' || !def.hostRef)
                continue;
            // A class the procedural world lacks, seated on registered hosts: a new member means a fresh
            // round over all of them, so two bodies do not share the first tree that was reported.
            if (cls && def.hostRef === cls && !this.host.worldObjectById(hostId) && !(world?.objects.some(o => o.classId === cls))) {
                rt.hostCursor = 0;
                rt.anchors = null;
                rt.occupied.clear();
                for (const inst of rt.instances)
                    this.hostPopulationInstance(rt, inst);
                continue;
            }
            const o = this.host.worldObjectById(hostId);
            const g = this.host.hostGeometryOf(hostId);
            const point = o ? this.host.attachPointOf(o, def.hostAttach) : g ? attachFromGeometry(g, def.hostAttach) : null;
            if (point && rt.anchors)
                for (const a of rt.anchors)
                    if (a.id === hostId) {
                        a.x = point.x;
                        a.y = point.y;
                        a.z = point.z;
                    }
            for (const inst of rt.instances) {
                if (inst.hostId === hostId && point) {
                    inst.position.x = point.x;
                    inst.position.y = point.y;
                    inst.position.z = point.z;
                    this.pinMembersTo(inst);
                }
                else if (!inst.hostId && inst.agent?.anchor === -1 && (def.hostRef === hostId || def.hostRef === classOfHost(hostId))) {
                    this.hostPopulationInstance(rt, inst);
                }
            }
        }
    }
    /** Fade an instance's members out, drop its cooldowns, log `retire`, forget it. */
    retireInstance(rt, inst, fadeS = ENTITY_RETIRE_FADE_S) {
        inst.phase = 'done';
        for (let m = 0; m < inst.keys.length; m++) {
            const key = inst.keys[m];
            const track = inst.tracks[m];
            if (track && this.host.trackFor(key) === track)
                this.host.stopTrack(key, fadeS);
            else
                this.host.cancelTrackEvents(key); // a phase-delayed member that never started
            const stmt = rt.stmts[m];
            if (stmt && stmt.kind === 'trigger' && stmt.eventName)
                this.host.forgetTriggerFamily(this.host.memberFamilyKey(stmt, inst));
        }
        this.host.logEvent('retire', rt.def.id, inst.position, { entity: rt.def.id, instance: inst.n });
        if (inst.agent)
            rt.occupied.delete(inst.agent.anchor);
        rt.chorus.forget(inst.n);
        const i = rt.instances.indexOf(inst);
        if (i >= 0) {
            rt.instances.splice(i, 1);
            this.instanceSnapshot = null;
        }
    }
    /** Retire every instance of a runtime and silence its spawner. */
    retireRuntime(rt) {
        rt.alive = false;
        rt.spawnGen++;
        this.host.cancelTrackEvents(`entity:${rt.def.id}`);
        for (const inst of [...rt.instances])
            this.retireInstance(rt, inst);
    }
    /** Routes cannot run without their strip (world gone, hosting off): their bodies retire; the spawners keep polling. */
    retireRoutes() {
        for (const rt of this.runtimes) {
            if (rt.def.hostMotion !== 'pass')
                continue;
            for (const inst of [...rt.instances])
                this.retireInstance(rt, inst);
        }
    }
    /**
     * Per spatial tick, allocation-free: advance every route body's
     * kinematics, write its position from the strip, retire it past the end;
     * pin every member track to its body; fire once-per-life (`chance`)
     * members that have come due — from the body, with the instance's take.
     */
    advance(now, dt) {
        const world = this.host.world();
        const ctx = this._agentCtx;
        ctx.now = now;
        ctx.listenerX = this.host.listenerPos().x;
        ctx.listenerY = this.host.listenerPos().y;
        ctx.listenerZ = this.host.listenerPos().z;
        ctx.rng = this.rng;
        ctx.groundY = world && this.host.hostingEnabled() ? this._agentGroundY : null;
        const transitions = this._agentTransitions;
        const ladderTick = this.host.spatialTicks() % LADDER_EVERY_TICKS === 0;
        for (let r = 0; r < this.runtimes.length; r++) {
            const rt = this.runtimes[r];
            const isRoute = rt.def.hostMotion === 'pass';
            const f = isRoute && world && rt.def.hostRef ? featureById(world, rt.def.hostRef) : null;
            const anchors = this.host.hostingEnabled() && rt.anchors ? rt.anchors : NO_ANCHORS;
            for (let i = rt.instances.length - 1; i >= 0; i--) {
                const inst = rt.instances[i];
                const tracks = inst.tracks;
                const beforeX = inst.position.x, beforeZ = inst.position.z;
                const wasTravelling = inst.velocity > 0;
                if (inst.behavior) {
                    const changed = stepEntityBehavior(inst.behavior, now, this.rng, this.behaviorSignal, Math.hypot(inst.position.x - ctx.listenerX, inst.position.y - ctx.listenerY, inst.position.z - ctx.listenerZ), !inst.agent?.seg);
                    if (changed) {
                        this.host.logEvent('agent', `action:${inst.behavior.action.name}`, inst.position, { entity: rt.def.id, instance: inst.n });
                        if (inst.agent && !inst.agent.seg)
                            inst.agent.until = -Infinity;
                    }
                    for (const event of inst.behavior.events) {
                        // A clip contact (sit, stand, grasp, drag) is the body touching something: it
                        // sounds with that thing's material, like a footfall with its ground. An authored
                        // cue stays a plain transition.
                        const cue = inst.behavior.action.events.find(e => e.event === event);
                        if (cue?.contact)
                            this.fireContact(rt, inst, event);
                        else
                            this.onAgentTransition(rt, inst, event);
                    }
                }
                // Due once-per-life sounds fire BEFORE the body moves on, so one due
                // in the body's last tick on the strip is not lost to its retirement.
                // (A demoted individual's once-per-life sound is spent unheard.)
                for (let m = 0; m < tracks.length; m++) {
                    if (!(inst.chanceFireAt[m] <= now))
                        continue;
                    inst.chanceFireAt[m] = NaN;
                    const t = tracks[m];
                    if (t)
                        this.host.retriggerAudio(t.key, t.statement, true);
                }
                if (isRoute) {
                    if (!f || !advanceRoute(inst, dt, now)) {
                        this.retireInstance(rt, inst);
                        continue;
                    }
                    this.routePositionInto(inst, f);
                }
                else if (inst.agent) {
                    // The agent: a perch bout, a relocation along its segment, a
                    // startle when the listener closes in (EntityAgents.stepAgent).
                    const v = stepAgent(inst.agent, rt.def.agent, anchors, rt.occupied, inst.position, ctx, transitions, this.goals.get(rt.def.id) ?? inst.behavior?.action.goal ?? null);
                    inst.accel = dt > 0 ? (v - inst.velocity) / dt : 0;
                    inst.velocity = v;
                    this.groundWalkingBody(inst);
                    // The perch it sits on, or is heading to (a class host's object id).
                    if (inst.agent.anchor >= 0 && inst.agent.anchor < anchors.length)
                        inst.hostId = anchors[inst.agent.anchor].id;
                    if (transitions.length) {
                        for (let k = 0; k < transitions.length; k++)
                            this.onAgentTransition(rt, inst, transitions[k]);
                        transitions.length = 0;
                    }
                }
                for (let m = 0; m < tracks.length; m++) {
                    const t = tracks[m];
                    if (t && t.pinned && !(t._triggerAtContact && t.sourceNode)) {
                        t.pinned.x = inst.position.x;
                        t.pinned.y = inst.position.y;
                        t.pinned.z = inst.position.z;
                    }
                }
                // The body walks: the metres it just covered turn into footfalls,
                // fired AFTER its members are pinned so a step sounds from where the
                // foot landed rather than from the previous tick's position. A
                // body outside the voice budget has no member tracks and so makes no
                // sound — it still walks, and its stride keeps accumulating, so it
                // steps in stride the moment the ladder promotes it.
                // Sway is weight-shifting, not travel. Include the final arrival tick,
                // whose displacement is real even though stepAgent now reports rest.
                const movedM = wasTravelling || inst.velocity > 0
                    ? Math.hypot(inst.position.x - beforeX, inst.position.z - beforeZ) : 0;
                if (inst.stride > 0 && inst.voiced) {
                    const falls = advanceGait(inst, dt, movedM);
                    for (let k = 0; k < falls; k++)
                        this.fireFootfall(inst);
                }
                else if (inst.stride > 0) {
                    advanceGait(inst, dt, movedM);
                }
            }
            // Physical route bodies also survive a full audio budget. They can
            // acquire member voices later, without respawning or resetting motion.
            if ((!isRoute || rt.def.body) && ladderTick)
                this.applyLadder(rt);
        }
    }
}
//# sourceMappingURL=EntityRuntime.js.map