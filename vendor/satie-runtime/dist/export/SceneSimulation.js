import { applyReplayAction, createReplayState, validateReplay } from '../integration/ReplayActions.js';
import { seamlessLoopOf } from '../dsp/SeamlessLoop.js';
/**
 * Scene simulation — run the LIVE engine headlessly and write down what it did.
 *
 * The offline renderer used to re-implement playback from a sampled manifest:
 * start times, volumes, pitches and seed-driven motion, evaluated by pure
 * functions. That covers a script of placed and wandering voices exactly, and
 * nothing else: the `world` block, `at` hosts, passing traffic, the signal
 * bus (`follow`, `pace`, `active`, `quiet`), pooled takes, Doppler, foliage
 * and the entity layer all live only in `SatieEngine`. Re-implementing them a
 * second time would drift by construction.
 *
 * So instead: simulate once with the real engine on a `NullAudioContext`
 * (no sound, a writable clock), step it `fps` times per scene second with
 * `SatieEngine.advance`, and RECORD per frame what every live source would
 * have fed its audio nodes — position, level, playback rate, muffle. Sources
 * come from the engine's own EventLog (every `start`/`fire` opens one on its
 * track key, a `stop` or the take's own length closes it). The renderer then
 * plays that trace back through real audio nodes. The trace is the reference:
 * whatever the engine does, the export does, including things this file has
 * never heard of.
 *
 * Determinism: the engine's `rng` is `mulberry32(seed)`, the world's own RNG
 * is seeded by the spec, and the only async in a headless run is the caller's
 * cooperative yields — so the same seed reproduces the same trace, and the
 * metadata pass (ADM blocks, USD timeSamples, SELD labels) reads the very
 * arrays the audio pass rendered from.
 *
 * Rooms: the trace records the WORLD ROOM the headless engine ended the run
 * in (`SceneTrace.worldRoom` — a procedural `world`'s ambient room, from
 * `applyWorldAmbientRoom`), so voices without script reverb send into it on
 * playback exactly as live. The script's declared `room`s are not recorded —
 * the renderer derives them from the parsed scene, the same way the engine
 * does (`ScriptRoom.ts`). A room the LISTENER stood in at export time (a
 * Marble enclosure measured by the viewport) is not observable here; the
 * export panel passes it as `RenderOptions.worldRoom`, which outranks the
 * trace's.
 *
 * Not in the trace (and therefore not in the export): UI-driven raycast
 * occlusion and diffraction from Marble geometry, and runtime mixer
 * mute/solo. Fade lengths are re-sampled from the statement per source — the
 * engine's own draw is not observable.
 */
import { SatieEngine } from '../core/SatieEngine.js';
import { parseScene } from '../core/SatieParser.js';
import { takeClipPath } from '../core/GenRequests.js';
import { mulberry32, hashSeed } from '../core/Random.js';
import { ENTITY_RETIRE_FADE_S } from '../core/Entities.js';
import { OCCLUSION_OPEN_HZ } from '../spatial/WorldAcoustics.js';
import { NullAudioContext } from './NullAudioContext.js';
import { listenerPoseAt, listenerAxes } from './ListenerPath.js';
export const SIMULATION_DEFAULT_FPS = 30;
const DEFAULT_CHUNK_FRAMES = 300;
/**
 * Does this script need the live engine to render correctly? True for
 * anything the sampled manifest cannot express: a `world` block, entities,
 * hosted voices, signal bindings, activity gates, take pools, chance members
 * and event emitters. A plain script of placed / wandering voices returns
 * false and keeps the seed-driven path, which renders it exactly already.
 */
export function needsSimulation(scene) {
    if (typeof scene.levelReferenceDb === 'number')
        return true;
    if (scene.world || scene.entities.length)
        return true;
    for (const s of scene.statements) {
        if (s.programId)
            return true; // Shared source clock/take cannot be sampled independently.
        if (s.hostRef || s.volumeFollow || s.pitchFollow || s.occlusionFollow || s.paceFollow)
            return true;
        // `zone` gating is runtime state (`setSceneState`); the sampler has no
        // notion of a scene state, so a zoned voice would export audible whatever
        // the state said.
        if (s.zones)
            return true;
        // Attached / following voices pin to runtime state (another voice, an
        // entity instance, the listener) — only the live engine resolves that.
        if (s.attachRef || s.followTarget)
            return true;
        if (s.quietGates.length || s.activeHours || s.variants > 1 || s.recordings !== null || s.chance !== null || s.emit)
            return true;
        // A calibrated scene: the HDR window governs every gain (spatial/LevelModel.ts).
        if (!s.spl.isNull || s.splFollow)
            return true;
    }
    return false;
}
export { takeClipPath } from '../core/GenRequests.js';
/** A per-source recorder: eight channels, grown by doubling, never per frame. */
class SourceRecorder {
    n = 0;
    positions;
    gain;
    rate;
    occlusion;
    cutoffHz;
    muffleGain;
    emissionDb;
    receivedDb;
    times;
    constructor(capacity, timed = false) {
        const c = Math.max(4, capacity | 0);
        this.positions = new Float32Array(c * 3);
        if (timed)
            this.times = new Float64Array(c);
        this.gain = new Float32Array(c);
        this.rate = new Float32Array(c);
        this.occlusion = new Float32Array(c);
        this.cutoffHz = new Float32Array(c);
        this.muffleGain = new Float32Array(c);
        this.emissionDb = new Float32Array(c);
        this.receivedDb = new Float32Array(c);
    }
    grow() {
        const c = this.gain.length * 2;
        const g = (a, stride) => { const b = new Float32Array(c * stride); b.set(a); return b; };
        this.positions = g(this.positions, 3);
        if (this.times) {
            const times = new Float64Array(c);
            times.set(this.times);
            this.times = times;
        }
        this.gain = g(this.gain, 1);
        this.rate = g(this.rate, 1);
        this.occlusion = g(this.occlusion, 1);
        this.cutoffHz = g(this.cutoffHz, 1);
        this.muffleGain = g(this.muffleGain, 1);
        this.emissionDb = g(this.emissionDb, 1);
        this.receivedDb = g(this.receivedDb, 1);
    }
    push(t, x, y, z, gain, rate, occ, cutoff, muffle, emissionDb, receivedDb) {
        if (this.times && this.n > 0 && this.times[this.n - 1] === t)
            this.n--;
        if (this.n >= this.gain.length)
            this.grow();
        if (this.times)
            this.times[this.n] = t;
        const k = this.n * 3;
        this.positions[k] = x;
        this.positions[k + 1] = y;
        this.positions[k + 2] = z;
        this.gain[this.n] = gain;
        this.rate[this.n] = rate;
        this.occlusion[this.n] = occ;
        this.cutoffHz[this.n] = cutoff;
        this.muffleGain[this.n] = muffle;
        this.emissionDb[this.n] = emissionDb;
        this.receivedDb[this.n] = receivedDb;
        this.n++;
    }
    finish(fps, frame0, extent) {
        const n = this.n;
        return {
            fps, frame0, extent, ...(this.times ? { times: this.times.subarray(0, n) } : {}),
            positions: this.positions.subarray(0, n * 3),
            gain: this.gain.subarray(0, n),
            rate: this.rate.subarray(0, n),
            occlusion: this.occlusion.subarray(0, n),
            cutoffHz: this.cutoffHz.subarray(0, n),
            muffleGain: this.muffleGain.subarray(0, n),
            emissionDb: this.emissionDb.subarray(0, n),
            receivedDb: this.receivedDb.subarray(0, n),
        };
    }
}
/**
 * A hosted voice with nowhere to be: its host is not bound, and the engine keeps it silent rather than
 * play it at the origin (SatieEngine.isTrackAudible). It has no label interval until it is placed.
 */
const unplaced = (track) => !!track.statement.hostRef && !track.pinned && !track.entityInstance;
/**
 * The engine's gain law, minus the fade envelope. Calibrated (any `spl`):
 * the governed level the engine last wrote — emission against the HDR
 * window's top, culled under its floor (`_levelGain`) — × activity, so the
 * trace carries the window's decisions. Uncalibrated: modulation × activity.
 */
function traceGainOf(track, elapsed, calibrated) {
    const stmt = track.statement;
    if (calibrated)
        return track._levelGain * track._activity * (track.triggerGainNode?.gain.value ?? 1);
    let vol = track.volume;
    if (!stmt.volumeFollow && (stmt.volumeInterpolation || stmt.groupVolumeModulation)) {
        vol = stmt.volumeInterpolation ? evalCached(track, stmt.volumeInterpolation, elapsed) : track.volume;
        if (stmt.groupVolumeModulation)
            vol *= evalCached(track, stmt.groupVolumeModulation, elapsed);
    }
    return vol * track._activity * (track.triggerGainNode?.gain.value ?? 1);
}
/** The engine's playbackRate law: pitch (× instance offset) × modulation × Doppler. */
function traceRateOf(track, elapsed) {
    const stmt = track.statement;
    const modulated = !!(stmt.pitchInterpolation || stmt.groupPitchModulation || stmt.pitchFollow);
    let pitch = track.pitch;
    if (!stmt.pitchFollow && (stmt.pitchInterpolation || stmt.groupPitchModulation)) {
        pitch = stmt.pitchInterpolation ? evalCached(track, stmt.pitchInterpolation, elapsed) * track._pitchScale : track.pitch;
        if (stmt.groupPitchModulation)
            pitch *= evalCached(track, stmt.groupPitchModulation, elapsed);
    }
    return modulated || track._dopplerActive ? pitch * track.doppler : pitch;
}
function evalCached(track, mod, elapsed) {
    const every = track._cachedDurations.get(mod) ?? 0;
    return SatieEngine.evalModulation(mod, elapsed, every);
}
/**
 * Run the script for `durationS` scene seconds in a headless engine and
 * return everything the renderer and the annotators need. Cooperative:
 * yields to the event loop every `chunkFrames` frames so a 600 s scene does
 * not freeze a UI thread; nothing else in the run is asynchronous, so the
 * yields do not perturb determinism.
 */
export async function simulateScene(options) {
    const fps = options.fps ?? SIMULATION_DEFAULT_FPS;
    if (!(fps > 0))
        throw new Error(`Simulation fps must be positive, got ${fps}`);
    const durationS = Math.max(0, options.durationS);
    const frameCount = Math.ceil(durationS * fps);
    const actions = validateReplay(options.actions ?? [], durationS);
    let actionIndex = 0;
    const replayState = createReplayState();
    let clockOffset = 0;
    const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const chunk = options.chunkFrames ?? DEFAULT_CHUNK_FRAMES;
    const dt = 1 / fps;
    // Parse first so a syntax error throws here rather than loading as an empty scene.
    if (!options.scene)
        parseScene(options.script);
    const ctx = new NullAudioContext();
    const engine = new SatieEngine({ audioContext: ctx, headless: true });
    engine.rng = mulberry32(seed);
    engine.preferCommunitySamples = false;
    for (const [name, buf] of options.buffers)
        engine.setAudioBuffer(name, buf);
    engine.loadScript(options.script);
    const statements = engine.scriptStatements;
    // State outlives the script in the live engine (a voice spawning into an
    // active state starts gated), so set it before anything spawns.
    const sceneState = options.sceneState;
    if (sceneState)
        engine.setSceneState(sceneState.name, { isolation: sceneState.isolation, fadeS: sceneState.fadeS });
    const buffers = options.buffers;
    const resolveBuffer = (stmt, take) => {
        const clip = takeClipPath(stmt, take);
        const buffer = buffers.get(clip) ?? (take <= 0 && !stmt.recordings?.takes ? buffers.get(stmt.clip) : undefined);
        return buffer ? { clip, buffer } : null;
    };
    const missing = [];
    const seenMissing = new Set();
    for (const stmt of statements) {
        if (stmt.mute || stmt.kind === 'trigger')
            continue;
        if (resolveBuffer(stmt, 0))
            continue;
        if (!seenMissing.has(stmt.clip)) {
            seenMissing.add(stmt.clip);
            missing.push(stmt.clip);
        }
    }
    const sources = [];
    const spawns = [];
    const retires = [];
    const behaviors = [];
    const events = [];
    const open = new Map();
    const openList = [];
    /** Voices whose interval ended because their host went away; the track lives on and may be placed again. */
    const parked = new Map();
    let sourceCount = 0;
    // Track lookup by key, rebuilt only when the engine's array is replaced.
    let lastArr = null;
    const byKey = new Map();
    const refreshTracks = () => {
        const arr = engine.getTracksArray();
        if (arr === lastArr)
            return;
        lastArr = arr;
        byKey.clear();
        for (const t of arr)
            byKey.set(t.key, t);
    };
    const finalize = (o, t1) => {
        open.delete(o.src.key);
        const i = openList.indexOf(o);
        if (i >= 0)
            openList.splice(i, 1);
        const src = o.src;
        src.t1 = Math.max(o.src.t0, Math.min(t1, durationS, o.closeAt));
        const stmt = src.stmt;
        src.trace = o.rec.finish(fps, o.frame0, {
            radiusM: o.track._radiusM, ringM: o.track._ringM, bed: o.track._bed, field: stmt.field, line: stmt.line, lineSource: o.track._line,
        });
    };
    /** The fade the engine applies when it stops this track now. */
    const fadeOutFor = (track, rng) => {
        const stmt = track.statement;
        const inst = track.entityInstance;
        if (inst && inst.phase === 'done')
            return ENTITY_RETIRE_FADE_S;
        let fade = 0;
        if (!stmt.duration.isNull)
            fade = stmt.fadeOut.isNull ? 0 : stmt.fadeOut.sample(rng);
        else if (!stmt.end.isNull)
            fade = stmt.endFade.isNull ? 0 : stmt.endFade.sample(rng);
        return Math.max(fade, 0.005);
    };
    /**
     * Sources that began before the recording named their host's lifetime, by host. A lifetime lasts from
     * the object's creation to its destroy, and the replay learns its id from the first action that carries
     * it; the sounds the host made before that action are that lifetime's too.
     */
    const unnamed = new Map();
    const onEvent = (e, frame) => {
        switch (e.kind) {
            case 'start':
            case 'fire': {
                refreshTracks();
                const track = byKey.get(e.key);
                if (!track)
                    return;
                const stmt = track.statement;
                // Event playback names its exact bank recording, including per-text takes.
                const eventBuffer = e.bufferKey ? buffers.get(e.bufferKey) : undefined;
                const resolved = eventBuffer && e.bufferKey ? { clip: e.bufferKey, buffer: eventBuffer }
                    : stmt.kind === 'trigger' && stmt.genPrompt?.includes('{') ? null : resolveBuffer(stmt, e.take);
                if (!resolved)
                    return;
                const prev = open.get(e.key);
                if (prev)
                    finalize(prev, e.t); // a retrigger replaces the source
                parked.delete(e.key);
                const index = sourceCount++;
                const rng = mulberry32(hashSeed(seed, index));
                const loop = stmt.kind === 'loop';
                // Contact release is scheduled on the audio thread, not emitted as a
                // track stop (the trigger remains reusable). Capture the live engine's
                // sampled deadline; otherwise export plays a long recording until its
                // next contact despite a short authored duration.
                const startTime = e.t + (e.startDelaySeconds ?? 0);
                const contactEnd = e.playbackDurationSeconds === undefined ? Infinity : startTime + e.playbackDurationSeconds;
                const contactRelease = e.releaseSeconds ?? 0;
                const capacity = loop
                    ? frameCount - frame + 1
                    : Math.ceil((resolved.buffer.duration / Math.max(0.05, track.pitch)) * fps) + 2;
                // The engine and the renderer loop the same seamless copy; a resumed loop's phase is counted on its length.
                const wrapS = loop
                    ? seamlessLoopOf(resolved.buffer, (channels, length, sampleRate) => { try {
                        return ctx.createBuffer(channels, length, sampleRate);
                    }
                    catch {
                        return null;
                    } }, NullAudioContext).duration
                    : resolved.buffer.duration;
                const o = {
                    src: {
                        key: e.key, statementIndex: e.statementIndex, stmt, voiceIndex: track.voiceIndex,
                        objectInstanceId: replayState.objectInstances.get(e.emitterId ?? track.hostId ?? stmt.hostRef ?? ''),
                        sourceId: e.sourceId ?? stmt.sourceId, objectId: e.emitterId ?? track.hostId ?? stmt.hostRef,
                        entity: e.entity, instance: e.instance, take: e.take, clip: resolved.clip, label: e.label,
                        bufferDuration: resolved.buffer.duration, startOffset: e.bufferOffsetSeconds ?? 0, t0: startTime, t1: durationS, loop,
                        fadeIn: stmt.fadeIn.isNull ? 0 : stmt.fadeIn.sample(rng), fadeOut: contactRelease,
                    },
                    track, rec: new SourceRecorder(capacity, actions.length > 0), frame0: frame, closeAt: contactEnd, played: e.bufferOffsetSeconds ?? 0, lastT: startTime, index, wrapS,
                };
                open.set(e.key, o);
                openList.push(o);
                sources.push(o.src); // in start order; finalize fills `trace`
                if (o.src.objectId && !o.src.objectInstanceId)
                    unnamed.set(o.src.objectId, [...(unnamed.get(o.src.objectId) ?? []), o.src]);
                return;
            }
            case 'stop': {
                parked.delete(e.key);
                const o = open.get(e.key);
                if (!o)
                    return;
                const rng = mulberry32(hashSeed(seed, o.index, 1));
                const fade = fadeOutFor(o.track, rng);
                if (e.t + fade < o.closeAt) {
                    o.src.fadeOut = fade;
                    o.closeAt = e.t + fade;
                }
                return;
            }
            case 'spawn':
                spawns.push({ t: e.t, entity: e.entity, instance: e.instance, x: e.x, y: e.y, z: e.z });
                return;
            case 'retire':
                retires.push({ t: e.t, entity: e.entity, instance: e.instance, x: e.x, y: e.y, z: e.z });
                return;
            case 'event':
                events.push({ t: e.t, name: e.label, x: e.x, y: e.y, z: e.z });
                return;
            case 'agent':
                behaviors.push({ t: e.t, entity: e.entity, instance: e.instance, label: e.label, x: e.x, y: e.y, z: e.z });
                return;
        }
    };
    let seenVersion = 0;
    const harvest = (frame) => {
        const log = engine.eventLog;
        if (log.version === seenVersion)
            return;
        const n = Math.min(log.version - seenVersion, log.size);
        seenVersion = log.version;
        const snap = log.snapshot();
        for (let i = snap.length - n; i < snap.length; i++)
            onEvent(clockOffset ? { ...snap[i], t: snap[i].t + clockOffset } : snap[i], frame);
    };
    const record = (t) => {
        refreshTracks();
        // A parked voice keeps playing under the silence. Once its host is bound again it gets a new
        // interval, at the phase the clip has reached and under the lifetime the host has now.
        for (const [key, p] of parked) {
            const track = p.track;
            if (byKey.get(key) !== track || open.has(key) || t > p.closeAt) {
                parked.delete(key);
                continue;
            }
            p.played += Math.max(0, traceRateOf(track, engine.currentTime - track.startedAt)) * Math.max(0, t - p.lastT);
            p.lastT = t;
            if (!p.src.loop && p.played >= p.src.bufferDuration) {
                parked.delete(key);
                continue;
            }
            if (unplaced(track))
                continue;
            parked.delete(key);
            const host = track.hostId ?? p.src.objectId;
            const src = { ...p.src, objectId: host, objectInstanceId: host ? replayState.objectInstances.get(host) : p.src.objectInstanceId,
                t0: t, t1: durationS, startOffset: p.src.loop ? p.played % p.wrapS : p.played, fadeIn: 0 };
            const o = { ...p, src, rec: new SourceRecorder(frameCount + 1, actions.length > 0), frame0: Math.floor(t * fps + 1e-9), lastT: t, sounded: false };
            // An interval that never sounded is dropped at the end; its successor takes its place in start order,
            // so the other sources keep their index (a voice's render seed is hashed from it).
            const slot = p.sounded ? -1 : sources.indexOf(p.src);
            if (slot >= 0)
                sources[slot] = src;
            else
                sources.push(src);
            open.set(key, o);
            openList.push(o);
        }
        for (let i = openList.length - 1; i >= 0; i--) {
            let o = openList[i];
            const track = o.track;
            const host = track.hostId;
            const instanceId = host ? replayState.objectInstances.get(host) : undefined;
            // A loop can retain its audio track when a host alias is rebound to a new body.
            // Split its label interval while preserving playback phase at the boundary.
            if (o.src.loop && instanceId && instanceId !== o.src.objectInstanceId && t > o.src.t0) {
                finalize(o, t);
                const src = { ...o.src, objectId: host, objectInstanceId: instanceId,
                    t0: t, t1: durationS, startOffset: o.played % o.wrapS, fadeIn: 0 };
                o.src.fadeOut = 0;
                o = { ...o, src, rec: new SourceRecorder(frameCount + 1, true), frame0: Math.floor(t * fps), lastT: t };
                sources.push(src);
                open.set(src.key, o);
                openList.push(o);
            }
            if (byKey.get(o.src.key) !== track) {
                finalize(o, o.lastT);
                continue;
            }
            if (t > o.closeAt) {
                finalize(o, o.closeAt);
                continue;
            }
            const p = track.apparent ?? track.position;
            const elapsed = engine.currentTime - track.startedAt;
            const gain = traceGainOf(track, elapsed, engine.calibrated);
            const rate = traceRateOf(track, elapsed);
            const occ = Math.max(track.occlusion, track._zoneOcclusion, track._foliage);
            const cutoff = isNaN(track._lastCutoffHz) ? OCCLUSION_OPEN_HZ : track._lastCutoffHz;
            const muffle = track._zoneMuted ? 0 : isNaN(track._lastOccGain) ? 1 : track._lastOccGain;
            // Level model (calibrated scenes): what the source emits and what the
            // path leaves at the listener. NaN when the scene has no `spl` at all.
            const emissionDb = engine.calibrated ? track._emissionDb : NaN;
            const receivedDb = engine.calibrated ? track._receivedDb : NaN;
            o.rec.push(t, p.x, p.y, p.z, gain, rate, occ, cutoff, muffle, emissionDb, receivedDb);
            o.played += Math.max(0, rate) * Math.max(0, t - Math.max(o.lastT, o.src.t0));
            o.lastT = t;
            if (unplaced(track)) {
                // The sample just recorded is the silence the engine wrote, so the interval ends as the audio does.
                // An interval that was never placed is dropped (t1 = t0).
                o.src.fadeOut = 0;
                finalize(o, o.sounded ? t : o.src.t0);
                parked.set(o.src.key, o);
                continue;
            }
            o.sounded = true;
            if (!o.src.loop) {
                if (o.played >= o.src.bufferDuration) {
                    const over = rate > 0 ? (o.played - o.src.bufferDuration) / rate : 0;
                    finalize(o, Math.min(t - over, o.closeAt));
                }
            }
            else {
                o.lastT = t;
            }
        }
    };
    const path = options.listenerPath && options.listenerPath.length ? options.listenerPath : null;
    // Read at the END of the run, before destroy() drops it: the ambient room a
    // procedural world implies is applied when the world is installed and can
    // change with hosting; the room the run settled in is the one to export.
    let worldRoom = null;
    // With no path the listener still has to STAND somewhere: `listenerPoseAt`
    // of an empty path is `DEFAULT_LISTENER_POSE` (ear height), and leaving the
    // engine's listener at its constructor default (the floor) would compute
    // every distance-bound level from a vantage the labels do not describe.
    const applyListener = (t) => {
        if (!path && t > 0)
            return; // stationary: placed once, before play()
        const pose = listenerPoseAt(path ?? [], t);
        engine.setListenerPosition(pose.x, pose.y, pose.z);
        const { forward, up } = listenerAxes(pose);
        engine.setListenerOrientation(...forward, ...up);
    };
    try {
        ctx.currentTime = 0;
        applyListener(0);
        // Install initial non-event controls before spawning, preserving simultaneous action order.
        while (actionIndex < actions.length && actions[actionIndex].t === 0
            && ['bind', 'host-position', 'signal', 'state', 'object-state', 'object-state-clear', 'object-state-schema', 'object-tracking', 'capture-gap'].includes(actions[actionIndex].kind)) {
            await applyReplayAction(engine, actions[actionIndex++], replayState);
        }
        if (options.initialPlaying !== false)
            await engine.play();
        harvest(0);
        let advancedTo = 0;
        const advanceTo = (t) => {
            ctx.currentTime = t;
            applyListener(t);
            engine.advance(Math.max(0, t - advancedTo));
            advancedTo = t;
        };
        const actionsThrough = async (t, frame) => {
            while (actionIndex < actions.length && actions[actionIndex].t <= t) {
                const action = actions[actionIndex++];
                advanceTo(action.t);
                harvest(frame);
                if (actions.length)
                    record(action.t);
                if (action.kind === 'stop' && action.accepted !== false) {
                    for (let i = openList.length - 1; i >= 0; i--)
                        finalize(openList[i], action.t);
                }
                if (action.objectInstanceId && action.accepted !== false) {
                    const host = action.bodyId ?? action.name;
                    for (const src of unnamed.get(host) ?? [])
                        src.objectInstanceId = action.objectInstanceId;
                    unnamed.delete(host);
                }
                await applyReplayAction(engine, action, replayState);
                if (action.kind === 'start' && action.accepted !== false)
                    clockOffset = ctx.currentTime - engine.currentTime;
                engine.advance(0);
                harvest(frame);
                record(action.t);
            }
        };
        for (let frame = 0; frame < frameCount; frame++) {
            const t = frame * dt;
            if (actionIndex < actions.length && actions[actionIndex].t <= t)
                await actionsThrough(t, frame);
            advanceTo(t);
            options.observeBodies?.(t, engine.entityInstances());
            if (options.observeFrame)
                await options.observeFrame(t, engine);
            harvest(frame);
            record(t);
            if (chunk > 0 && frame > 0 && frame % chunk === 0) {
                options.onProgress?.(frame / frameCount);
                await new Promise((r) => setTimeout(r, 0));
            }
        }
        if (actionIndex < actions.length)
            await actionsThrough(durationS, frameCount);
        // Loops (and anything still fading) run to the export's end.
        for (let i = openList.length - 1; i >= 0; i--)
            finalize(openList[i], durationS);
        worldRoom = engine.getWorldRoom();
    }
    finally {
        engine.destroy();
    }
    options.onProgress?.(1);
    return {
        fps, durationS, frameCount, seed, statements, worldRoom,
        ...(actions.length ? { objectStates: Object.fromEntries([...replayState.objectStates].map(([id, axes]) => [id, Object.fromEntries(axes)])) } : {}),
        sources: sources.filter((s) => !!s.trace && s.t1 > s.t0),
        spawns, retires, behaviors, events,
        missingClips: missing,
        listenerPath: path ?? undefined,
        sceneState,
    };
}
//# sourceMappingURL=SceneSimulation.js.map