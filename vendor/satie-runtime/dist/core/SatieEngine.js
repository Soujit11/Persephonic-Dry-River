/**
 * Satie Web Audio Engine — the main runtime.
 * Uses SatieDSPClock + SatieScheduler for sample-accurate event timing.
 *
 * Performance architecture:
 * - Engine tick runs at RAF (~60fps) but only mutates track state objects in-place
 * - React UI is notified at a throttled rate (UI_NOTIFY_HZ) for non-critical state
 * - Three.js reads track state directly via refs (no React re-render needed)
 * - Discrete events (play/stop/script load) notify immediately
 */
import { LiveSynthSource } from '../synth/LiveSynthSource.js';
import { decodeSynthAudio, synthAssetFor, copySynthAsset } from '../synth/asset.js';
import { entityActionAllowsSound } from './EntityBehavior.js';
import { bedTiltDb, BED_SHELF_HZ } from '../spatial/LevelModel.js';
import { SatieDSPClock } from './SatieDSPClock.js';
import { TakePool } from './TakePool.js';
import { SynchronizedPrograms } from './SynchronizedPrograms.js';
import { SatieScheduler, AudioEventType } from './SatieScheduler.js';
import { EventLog } from './EventLog.js';
import { Statement, WanderType, isTrajectoryWanderType, displayNameOf } from './Statement.js';
import { pathSeedsFor, resolveTrajectory, wanderPositionInto, trajectoryPositionInto } from '../spatial/SpatialPath.js';
import { parseScene, pathFor, sanitizeForClipName } from './SatieParser.js';
import { rgbToHex, hexToRgb, clampChannel, DEFAULT_VOICE_COLOR } from './color.js';
import { clamp01 } from './math.js';
import { recordingBank } from './RecordingBanks.js';
import { CONTACT_TAKE_DURATION_S, takeClipPath, takeCount, recordingReferences, templateBankSize, templateTake, templateRecording, legacyTemplateTake, templateBankPrefix, isTemplatePrompt } from './GenRequests.js';
import { ModulationType, LoopMode } from './InterpolationData.js';
import { RangeOrValue } from './RangeOrValue.js';
import { mapFollow } from './Signals.js';
import { SignalBus } from './SignalBus.js';
import { LevelGovernor } from './LevelGovernor.js';
import { EditHold } from './EditHold.js';
import { LoopVoiceBudget, clearLoopAutomation } from './LoopVoiceBudget.js';
import { PARAM_SMOOTHING } from './audioParams.js';
export { AUTO_ANCHOR_MIN_DB, AUTO_ANCHOR_MAX_DB } from './LevelGovernor.js';
export { displayNameOf } from './Statement.js';
import { buildDSPChain, destroyDSPChain, makeDistortionCurve, driveBucket, mapCutoff, mapResonance, mapDrive, mapEQGain, mapSpeed, mapTrajectorySpeed } from '../dsp/DSPChain.js';
import { combinedCutoffHz, occlusionGain, reverbSendGain, PANNER_REF_M, distanceRolloff, directPathGain } from '../spatial/WorldAcoustics.js';
import { sampleSourceExtent, crossfadeGains, createWideBus, lineFromBox, LINE_DIFFUSE_REACH_M } from '../spatial/SourceExtent.js';
import { sampleScatter } from '../spatial/Scatter.js';
import { normalizeBufferLoudness } from '../dsp/Loudness.js';
import { seamlessLoopOf } from '../dsp/SeamlessLoop.js';
import { measureTriggerOnset } from '../dsp/TriggerOnset.js';
import { GenResolver } from './GenResolver.js';
import { deriveScriptRoom, deriveScriptRoomsByName } from '../spatial/ScriptRoom.js';
import { WorldRoom, DEFAULT_WORLD_WET } from './WorldRoom.js';
import { EntityRuntime } from './EntityRuntime.js';
import { Acoustics, zoneIsolationGain, ROOM_OCC_SMOOTH_S } from './Acoustics.js';
import { HostRegistry, attachFromGeometry } from './HostRegistry.js';
import { realizeWorld, heightAt, materialAt, nearestFeaturePointInto, featureById, isLiquidAt, overheadAt, overheadCoverAt, attachPoint, featureArcLength, featureArcNearest, featurePointAtArcInto } from '../world/worldRealize.js';
import { createReflectionLeg, createImagePanner } from '../spatial/ElevationCues.js';
import { serializeWorldSpec, pointInFootprint, distanceToFootprintEdge } from '../world/worldSpec.js';
import { createRng } from '../world/worldNoise.js';
import { proceduralFields, newFieldSample } from '../world/WorldFields.js';
import { drawRange, CALL_RETRY_S } from '../world/EntityAgents.js';
import { foldToPlaceable } from './audioBuffers.js';
/** A numeric field carried by an event payload, by signal name; undefined when the payload has none. */
function payloadField(p, name) {
    if (!p)
        return undefined;
    switch (name) {
        case 'depth': return p.depth;
        case 'submerged': return p.submerged;
        case 'liquid': return p.liquid;
        default: return undefined;
    }
}
/** Default minimum spacing between fires of an `on <event>` voice (seconds).
 * Tight — repeated physical events (strides) arrive fast; scripts override
 * with `cooldown`. */
const TRIGGER_EVENT_COOLDOWN_S = 0.1;
/**
 * The event a body's `gait` fires on each footfall. Event names are an open
 * vocabulary, but the gait has to name one, and this is the name the player's
 * own footsteps already use — so a script's single `on step` voice answers
 * for the listener and for every walking body in the scene.
 */
/** Default cooldown for `when`-condition voices — a boundary-straddling
 * listener re-enters the band on collider jitter; edge detection plus this
 * keeps it from machine-gunning. */
const TRIGGER_WHEN_COOLDOWN_S = 0.5;
/** Default per-fire humanization for trigger voices whose script authored NO
 * variation range: pitch multiplied by a random factor in [1−…, 1+…], level
 * offset by ±half the delta. Subtle by design — authored ranges override. */
/**
 * Ceiling on `spread`'s per-instance start delay, seconds. A flock startles
 * over a fraction of a second; a minute of "spread" is a `start` range, and
 * silently holding a voice back that long would read as a broken scene.
 */
/**
 * The level a master fade starts from and returns to. Below -60 dB it is
 * inaudible, and an exponential ramp can neither begin at nor reach zero, so
 * it needs a real floor to climb from.
 */
const MASTER_FADE_FLOOR = 0.0005;
/**
 * Where a fade IN starts, which is not the same thing.
 *
 * The silence floor is 66 dB down, and an exponential ramp is linear in dB,
 * so a 2.8 s rise from there spends its first second below anything a room
 * lets you hear and then delivers the whole audible 40 dB in the remaining
 * 1.7 s — about 24 dB/s. A scene that fades itself in (Soundscape carries
 * `volume fade 0 …` on half its voices) hides that; a calibrated scene that
 * starts at full level (Alley: thirty voices, no envelopes of its own) has
 * only this ramp between silence and the mix, and a rush at the end of it is
 * exactly the "it just comes on" complaint. Starting 34 dB down instead
 * spends the whole duration in the audible range, at about 12 dB/s.
 */
const MASTER_FADE_IN_FLOOR = 0.02;
const SPREAD_MAX_S = 60;
const TRIGGER_HUMANIZE_PITCH = 0.2; // pitch × 0.8..1.2
const TRIGGER_HUMANIZE_LEVEL = 0.1; // volume ± 0.05
/**
 * Buffers already brought to CLIP_LUFS. Every buffer that enters
 * `audioBuffers` — decoded uploads, generation results, community matches,
 * pooled takes, trigger take banks, embedder-supplied buffers — is
 * loudness-normalized IN PLACE exactly once (dsp/Loudness.ts). This is the
 * reference that makes `volume` (and `spl`) mean the same thing for every
 * clip: a generated cricket and a generated thunder used to land at the same
 * peak. Carry-forward across script reloads and pool/community reuse hand
 * the same objects back, so the set keeps a second registration from
 * re-scaling them. Uncalibrated scenes get this too — the balance of
 * existing sketches changes because of it, by design.
 */
const normalizedBuffers = new WeakSet();
export function normalizeOnArrival(buffer) {
    if (normalizedBuffers.has(buffer))
        return;
    normalizedBuffers.add(buffer);
    // A stub without PCM (a test double, an embedder's placeholder) has nothing to measure.
    if (typeof buffer.getChannelData !== 'function' || !(buffer.length > 0) || !(buffer.numberOfChannels > 0))
        return;
    normalizeBufferLoudness(buffer);
}
/** How often to notify React UI listeners (Hz). 3D reads tracks directly. */
const UI_NOTIFY_HZ = 8;
const UI_NOTIFY_INTERVAL = 1000 / UI_NOTIFY_HZ;
/** Spatial position update rate limit — 30fps is plenty for perception */
const SPATIAL_HZ = 30;
/** How far above the procedural terrain a voice is kept (metres). */
const WORLD_FLOOR_CLEARANCE_M = 0.3;
/** Scratch point for the live-host path (no per-tick allocation). */
const HOST_SCRATCH = { x: 0, y: 0, z: 0 };
/**
 * How far the listener walks before the copies of a class-hosted loop are
 * re-bound to the instances now nearest. Under this, the bound trees still
 * surround the walker and their levels change with every step; past it, the
 * grove has been left and the source follows into the next one.
 */
export const CLASS_REBIND_M = 10;
/**
 * The `horizon` host: something far beyond the place — distant thunder, a
 * far ship's horn, a train miles off. A random bearing at 1.5–3 km, 100–400 m
 * up (a cloud base), so the panner's distance law takes ~70 dB off a stated
 * emission and thunder can say its true 120 dB and arrive at ~48. Needs no
 * world: the horizon is wherever the listener is not.
 */
const HORIZON_MIN_M = 1500;
const HORIZON_MAX_M = 3000;
const HORIZON_Y_MIN_M = 100;
const HORIZON_Y_MAX_M = 400;
/** An outdoor ambient room never exceeds this wet / size — outdoors is nearly dry. */
const OUTDOOR_WET_MAX = 0.07;
const OUTDOOR_SIZE_MAX = 0.5;
/**
 * Speed of a thing travelling a strip (`at <strip> pass`), m/s, mapped from the
 * strip's `flow`: 0 = walking pace, 1 = fast traffic.
 */
const PASS_SPEED_MIN_MS = 4;
const PASS_SPEED_MAX_MS = 20;
const SPATIAL_INTERVAL = 1000 / SPATIAL_HZ;
/**
 * Minimum change (in normalized pre-map units) before a DSP interpolation
 * value is re-written to its AudioParam. Interp values are flat between
 * segments (especially Jump modulation) — skipping identical writes avoids
 * flooding the audio thread with redundant automation events.
 */
const DSP_EPS = 1e-3;
/**
 * How many unreferenced decoded AudioBuffers survive a loadScript eviction.
 * Buffers are large (~9 MB for 24 s stereo 48 kHz); the tail keeps undo/redo
 * and quick script edits fast without accumulating forever.
 */
const BUFFER_EVICT_TAIL = 16;
/**
 * An equal-power crossfade leg (spec 012 E2): `out` falls from `from` along cos, `in` rises from
 * `from` to 1 along sin, so two legs that start together keep cos² + sin² = 1. The same curve as
 * `crossfadeGains` (point and wide legs of an extended source), over time instead of extent.
 */
export function equalPowerCurve(from, dir, points = 64) {
    const a = Math.min(1, Math.max(0, from));
    const out = new Float32Array(points);
    if (dir === 'out') {
        for (let i = 0; i < points; i++)
            out[i] = a * Math.cos((i / (points - 1)) * Math.PI / 2);
    }
    else {
        const start = Math.asin(a);
        for (let i = 0; i < points; i++)
            out[i] = Math.sin(start + (i / (points - 1)) * (Math.PI / 2 - start));
    }
    return out;
}
const HOLD_GAP_S = 0.003;
/** Freeze an AudioParam at its current value, cancelling what was scheduled, and return that value. */
function holdAt(p, now) {
    const v = p.value;
    const hold = p.cancelAndHoldAtTime;
    if (hold)
        hold.call(p, now);
    else {
        p.cancelScheduledValues(now);
        p.setValueAtTime(v, now);
    }
    return v;
}
/** Can this active template actually address a preloaded per-text bank key? */
function templateReferencesBuffer(stmt, name) {
    const match = /^Audio\/generation\/(.*)__t(0|[1-9]\d*)$/.exec(name);
    if (!match || !stmt.genPrompt || Number(match[2]) >= templateBankSize(stmt))
        return false;
    if (name.startsWith(templateBankPrefix(stmt.genPrompt)))
        return true;
    // a key from before 2026-09-30 (legacyTemplateTake)
    const stem = match[1];
    if (stmt.genKey) {
        const prefix = `${stmt.clip.slice('generation/'.length)}__`;
        return stem.startsWith(prefix) && /^[a-f0-9]{1,8}$/.test(stem.slice(prefix.length));
    }
    if (sanitizeForClipName(stem) !== stem)
        return false;
    const bank = Number(match[2]);
    // A nonempty witness covers placeholders beyond the clip-name length limit.
    if (legacyTemplateTake(stmt.genPrompt, 'a', bank) === name)
        return true;
    // The first substitution reveals a substring (possibly truncated). Verify
    // bounded candidates through playback's exact derivation: repeated placeholders,
    // suffixes and contextual Unicode casing need no separate matching grammar.
    // One extra character completes text truncated after visible whitespace.
    for (let start = 0; start < stem.length; start++)
        for (let length = 1; length <= stem.length - start + 1; length++) {
            const text = stem.slice(start, start + length).padEnd(length, 'a');
            if (legacyTemplateTake(stmt.genPrompt, text, bank) === name)
                return true;
        }
    return false;
}
/**
 * Lazy generation (`lazyGeneration`): how far ahead the demand tick looks
 * when it asks whether a dormant gen voice will be needed, and how often it
 * asks. Five seconds is short of a generation's latency — the point is not
 * to have the clip ready before the state arrives (a library stand-in does
 * that), but to have asked before the slider settles, so the bespoke take
 * lands seconds after rain is heard rather than a full generation later.
 */
const DEMAND_HORIZON_S = 5;
const DEMAND_TICK_S = 1;
/**
 * An event fired AT its host's own position (the glue passed where the thing is, as a flock's
 * takeoff does) is the host sounding: it follows. Any offset is a contact where it happened, a foot
 * a hand's width from the body included (0.75 m swallowed foot plants and froze them onto the body).
 * The tolerance is rounding, not distance; a glue that means "on the thing" elsewhere says `positionMode: 'host'`.
 */
const HOST_POINT_M = 0.01;
function copyStatementField(from, to, key) {
    to[key] = from[key];
}
export class SatieEngine {
    ctx;
    clock;
    scheduler;
    audioTickObservers = new Set();
    /** Runs prepared control work on live/headless audio-clock ticks; unsubscribe on adapter disposal. */
    subscribeAudioTick(callback) {
        this.audioTickObservers.add(callback);
        return () => { this.audioTickObservers.delete(callback); };
    }
    masterGain;
    takePool = new TakePool();
    /**
     * Where the master bus should rest: the constructor's headroom until the app
     * dials in the user's own level. Tracked rather than read back off the node,
     * so a fade can ramp TO it without reading a value the fade itself is moving.
     */
    _masterVolume = 0.5;
    /**
     * The rooms voices send into (see {@link WorldRoom}): the measured world
     * room, the script's declared rooms, the placed room the listener stands
     * in, and the shared reverb bus pool. Created in the constructor once the
     * master gain exists.
     */
    _rooms;
    /** The surroundings' effect on each voice: obstruction, placed rooms, distance, reflections, the medium (see Acoustics.ts). */
    _acoustics;
    /** Read-only views the behavior suites peek at. */
    get reverbBuses() { return this._rooms.pool; }
    get worldRoom() { return this._rooms.measured; }
    get scriptRoom() { return this._rooms.declaredRoom; }
    get scriptRoomsByName() { return this._rooms.declaredRoomsByName; }
    /** The placed rooms the listener can walk into (read-only view; owned by {@link Acoustics}). */
    get _placedRooms() { return this._acoustics.placedRooms; }
    /** The placed room the listener currently stands in, lowercased — null outside all. */
    get _listenerRoomName() { return this._acoustics.listenerRoomName; }
    /** How much the listener is in each soundscape, 0..1 (spec 014): the `in_<soundscape>` signals. */
    get soundscapeShares() { return this._acoustics.soundscapeShares; }
    /** The soundscape the listener is in: a room by its walls; outdoors, whose own steady sounds are loudest, held until another is 3 dB louder. Null before anything sounds or with no soundscape. */
    get soundscapeHere() { return this._acoustics.soundscapeHere; }
    /** The soundscape a statement belongs to (by object, source id, or `in <room>`), or null. */
    soundscapeOf(stmt) { return this._acoustics.soundscapeOf(stmt); }
    /** The rooms a listener can walk into (placed `room` blocks): each publishes `in_<room>`, and any of them `indoors`. */
    get placedRoomNames() { return this._acoustics.placedRooms.map(r => r.name); }
    /** The placed room the listener is in now, or null (spec 012 E0; read-only). */
    get listenerRoom() { return this._listenerRoomName; }
    /** Every placed room's box: centre and half-extents in metres (spec 012 E0; read-only). */
    get placedRooms() {
        return this._acoustics.placedRooms.map(r => ({ name: r.name, centre: { x: r.cx, y: r.cy, z: r.cz }, half: { x: r.hx, y: r.hy, z: r.hz } }));
    }
    /** The medium stage once built (read-only view for the medium suite). */
    get medium() { return this._acoustics.mediumStage; }
    /** That room's reverb — the ambient override while inside (ladder: voice > named > THIS > scene room). */
    get _listenerRoomReverb() { return this._rooms.listenerRoomReverb; }
    /**
     * Shared decorrelated stereo bus for every voice's wide layer (SourceExtent).
     * One velvet-noise convolver pair serves all voices — decorrelation is
     * linear, so decorrelating the summed sends equals decorrelating each voice.
     * Created lazily on the first voice.
     */
    wideBus = null;
    /** Preallocated extent scratch — the tick loop must not allocate. */
    _extentScratch = {
        aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0,
    };
    get fdnNode() { return this._rooms.fdn; }
    get worldRoomLayers() { return this._rooms.convolverLayers; }
    limiter;
    tracks = new Map();
    /** What sounded, when, where — the timeline's past half (EventLog.ts). */
    _log = new EventLog();
    /** The loaded script's `entity` blocks (Entities.ts) and their live runtimes. */
    entityDefs = [];
    /** The entity layer (see {@link EntityRuntime}); the engine lends it voices, the scheduler and the trigger ledger. */
    _entities = new EntityRuntime({
        rng: () => this.rng(),
        now: () => this.clock.currentTime,
        isPlaying: () => this._isPlaying,
        statements: () => this.statements,
        world: () => this._world,
        worldObjectById: (id) => this._worldById.get(id),
        attachPointOf: (o, attach) => this.attachPointFor(o, attach),
        externalHostMembers: (cls) => this._hosts.membersOf(cls),
        hostGeometryOf: (id) => this._hosts.geometryOf(id),
        groundHalfM: () => Math.max((this._world?.spec.sizeM ?? 0) / 2, this._hosts.drawnHalfExtentM()),
        worldRng: () => this._worldRng(),
        hostingEnabled: () => this._hostingEnabled,
        listenerPos: () => this._listenerPos,
        spatialTicks: () => this._spatialTicks,
        trackFor: (key) => this.tracks.get(key),
        activityOf: (hours, gates) => this.activityOf(hours, gates, null),
        signalValue: (name) => this.signalValue(null, name),
        drawTake: (stmt, avoid) => this.drawTake(stmt, avoid, !(stmt.takesInOrder && stmt.kind === 'trigger')),
        drawGroundPointInto: (out) => this.drawGroundPointInto(out),
        sampleField: (x, y, z) => {
            const fp = this.fieldProvider();
            if (!fp)
                return null;
            fp.sampleInto(x, y, z, this._fieldScratch);
            return this._fieldScratch;
        },
        memberFamilyKey: (stmt, inst) => SatieEngine.memberFamilyKey(stmt, inst),
        scheduleAfter: (delayS, trackKey, label, fn) => this.scheduler.schedule({
            scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(delayS),
            type: AudioEventType.Callback,
            trackKey,
            debugLabel: label,
            onExecute: fn,
        }),
        cancelTrackEvents: (key) => this.scheduler.cancelTrackEvents(key),
        createVoice: (key, stmt, index, member) => this.createVoice(key, stmt, index, 0, member),
        stopTrack: (key, fadeS) => this.stopTrack(key, fadeS),
        retriggerAudio: (key, stmt, fire) => this.retriggerAudio(key, stmt, fire),
        setSignal: (name, value) => this.setSignal(name, value),
        logEvent: (kind, label, pos, meta) => this.logEvent(kind, null, label, pos, meta),
        fireTriggerFamily: (family, candidates, payload) => { this.fireTriggerFamily(family, candidates, payload); },
        dispatchTriggers: (candidates, event, payload) => { this.dispatchTriggers(candidates, event, payload, true); },
        forgetTriggerFamily: (family) => { this._triggerLastFired.delete(family); },
    });
    /** Shared array updated in-place. Three.js reads this directly via ref. */
    _tracksArray = [];
    _tracksArrayDirty = true;
    audioBuffers = new Map();
    // Encoded source bytes, not the normalized/processed PCM or a manifest assertion.
    audioByteHashes = new WeakMap();
    statements = [];
    errors = null;
    animFrameId = null;
    listeners = new Set();
    uiListeners = new Set();
    _isPlaying = false;
    _lastUINotify = 0;
    _lastSpatialUpdate = 0;
    /** Runtime warnings (missing samples, generation failures, etc.) */
    _runtimeWarnings = [];
    _programs = new SynchronizedPrograms();
    _runtimeWarningsMax = 20;
    /** The level model / HDR window (see {@link LevelGovernor}); the engine feeds it the tracks, the clock and the listener. */
    _levels = new LevelGovernor({
        rng: () => this.rng(),
        now: () => this.clock.currentTime,
        listenerPos: () => this._listenerPos,
        tracks: () => this.tracks.values(),
        signalValue: (track, name) => this._editHold.signalFor(track.statement, name) ?? this.signalValue(track, name),
        isTrackAudible: (track) => this.isTrackAudible(track),
        currentSendGain: (track) => this.currentSendGain(track),
        previewGain: (track) => this._previewGain.get(track.statementIndex) ?? 1,
    });
    /** Live audition trims by statement index (a fader being dragged): heard at once, never written to the script. */
    _previewGain = new Map();
    /** The sounds an editor is working on, heard whatever the game's state (see {@link holdAudible}). */
    _editHold = new EditHold();
    /** Runtime mixer state (independent of parsed mute/solo) */
    _mutedIndices = new Set();
    _soloedIndices = new Set();
    /**
     * Voices whose buffers weren't loaded when their start event fired.
     * Drained when `loadAudioBuffer`/`loadAudioFile` registers a matching buffer.
     * Keyed by both `pathFor(clip)` and the raw clip name — buffers can be
     * stored under either form depending on the caller.
     */
    _pendingVoices = new Map();
    /**
     * Hard inventory of every BufferSource we've started.
     * `track.sourceNode` is the *intended* reference, but the engine has enough
     * async paths (drainPendingVoices, generateAndRetrigger, resolveAndRetrigger,
     * communityThenGenerate) that a source can survive a missed cleanup if a
     * track-keyed reference goes stale. teardownAll iterates this set as a
     * second pass so no source escapes stop().
     */
    _activeSources = new Set();
    /**
     * Whether masterGain is currently wired to the limiter. stop() severs this
     * connection as a final hard-kill: even if a stray source slips past the
     * per-track teardown, no audio reaches the destination once masterGain is
     * disconnected. play() reconnects.
     */
    _masterConnected = true;
    /** Callback for resolving missing audio buffers (e.g. community samples). */
    onMissingBuffer = null;
    /**
     * How gen audio gets made (see {@link GenResolver}): the queue, the in-flight
     * map, the failure latch and the library-first / upgrade policy. The engine
     * hands it the buffer registry, the decoder, the demand evaluation and the
     * voice restart; the hooks and flags below are its public face.
     */
    _gen = new GenResolver({
        rng: () => this.rng(),
        hasBuffer: (clipPath) => this.audioBuffers.has(clipPath),
        takeLanded: (stmt, k) => !!this.variantBuffer(stmt, k),
        demandWithinHorizon: (stmt) => this.demandFor(stmt, null, DEMAND_HORIZON_S),
        decode: (data) => decodeSynthAudio(this.ctx, data),
        registerBuffer: (clipPath, buffer) => this.registerBuffer(clipPath, buffer),
        swapBufferSmooth: (clipPath, buffer) => this.swapBufferSmooth(clipPath, buffer),
        retriggerIfLive: (key, stmt) => {
            // Several waiters can observe the same bank arrival. Only the first
            // resolves readiness; later callbacks must not restart a live take.
            if (this._isPlaying && this.tracks.get(key)?.pending)
                this.retriggerAudio(key, stmt);
        },
        warn: (message) => this.addRuntimeWarning(message),
    });
    /**
     * Audio generator for `gen` statements. The engine itself talks to no
     * external service — the app wires this to ElevenLabs (src/lib/AudioGen);
     * embedders may supply their own generator or leave it null, in which case
     * gen voices stay pending with a single runtime warning.
     */
    get onGenerateAudio() { return this._gen.onGenerateAudio; }
    set onGenerateAudio(hook) { this._gen.onGenerateAudio = hook; }
    /**
     * Callback to search community samples by a gen prompt (e.g. "gentle rain").
     * Returns an ArrayBuffer if a matching community sample is found; `rank`
     * asks for the k-th best match (see {@link GenResolver}).
     */
    get onSearchCommunity() { return this._gen.onSearchCommunity; }
    set onSearchCommunity(hook) { this._gen.onSearchCommunity = hook; }
    /** When true, try community samples before calling the generator for gen statements. */
    get preferCommunitySamples() { return this._gen.preferCommunitySamples; }
    set preferCommunitySamples(v) { this._gen.preferCommunitySamples = v; }
    /** Lazy, predictive generation (default off): dormant voices are woken by the demand tick. See {@link GenResolver.lazyGeneration} and `demandOf`. */
    get lazyGeneration() { return this._gen.lazyGeneration; }
    set lazyGeneration(v) { this._gen.lazyGeneration = v; }
    /** Start a demand-woken voice from a library stand-in and upgrade in the background. See {@link GenResolver.standInForPredicted}. */
    get standInForPredicted() { return this._gen.standInForPredicted; }
    set standInForPredicted(v) { this._gen.standInForPredicted = v; }
    /** Generate the bespoke take behind a community stand-in and swap it in. See {@link GenResolver.upgradeGeneratedAudio}. */
    get upgradeGeneratedAudio() { return this._gen.upgradeGeneratedAudio; }
    set upgradeGeneratedAudio(v) { this._gen.upgradeGeneratedAudio = v; }
    /** Sounds requested but not yet landed (queued + in flight) — for "N on the way" UI. */
    get generationQueueDepth() { return this._gen.queueDepth; }
    /** Observe queue transitions (fires at request/settle time, never per frame). */
    set onGenQueueChange(cb) { this._gen.onQueueChange = cb; }
    /** True when the engine created (and therefore owns/closes) its context. */
    _ownsContext = true;
    /** No RAF loop — the embedder drives the scene with `advance()`. */
    headless;
    /**
     * Every random draw the engine makes (range samples, voice seeds, take
     * picks, entity constants, humanize, random start offsets) goes through
     * this. Live playback keeps `Math.random`; a headless simulation installs
     * `mulberry32(seed)` so a run is reproducible — the offline export's
     * metadata pass and audio pass must agree, and batch datasets vary by seed.
     */
    rng = Math.random;
    triggerOnsetAlignment;
    _loopVoiceBudget;
    constructor(options) {
        this.ctx = options?.audioContext ?? new AudioContext();
        this._ownsContext = !options?.audioContext;
        this.headless = !!options?.headless;
        this.triggerOnsetAlignment = options?.triggerOnsetAlignment ?? 'align';
        this._loopVoiceBudget = new LoopVoiceBudget(options?.loopVoiceBudget, {
            now: () => this.ctx.currentTime,
            receivedGain: track => this.loopReceivedGain(track),
            playbackRate: track => this.loopPlaybackRate(track),
            suspend: track => this.suspendLoopVoice(track),
            resume: (track, buffer, offset, rate) => this.resumeLoopVoice(track, buffer, offset, rate),
        });
        this.clock = new SatieDSPClock(this.ctx);
        this.scheduler = new SatieScheduler(this.clock);
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5; // -6 dB headroom before limiter
        // Master limiter — brick-wall prevents clipping when many voices overlap
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -2; // start limiting at -2 dB
        this.limiter.knee.value = 0; // hard knee for true brick-wall
        this.limiter.ratio.value = 20; // near-brick-wall ratio
        this.limiter.attack.value = 0.0005; // 0.5ms attack — catch transients before they clip
        this.limiter.release.value = 0.05; // 50ms release for transparency
        this.masterGain.connect(this.limiter);
        this.limiter.connect(options?.destination ?? this.ctx.destination);
        // The listener starts in air; scripts may `volume follow submerged`.
        this.setSignal('submerged', 0);
        // Room buses land on the master directly — never through a panner, which
        // is what keeps the reverberant field diffuse and distance-independent.
        this._rooms = new WorldRoom(this.ctx, this.masterGain, {
            tracks: () => this.tracks.values(),
            rng: () => this.rng(),
        });
        this._acoustics = new Acoustics(this.ctx, {
            now: () => this.ctx.currentTime,
            listenerPos: () => this._listenerPos,
            tracks: () => this.tracks.values(),
            world: () => this._world,
            hostingEnabled: () => this._hostingEnabled,
            listenerInsideInterior: () => this._listenerInsideInterior,
            fieldProvider: () => this.fieldProvider(),
            namedRoom: (name) => this._rooms.namedRoom(name),
            setListenerRoom: (room) => this._rooms.setListenerRoom(room),
            applyLiveReverb: (track, stmt, t) => this.applyLiveReverb(track, stmt, t),
            setSignal: (name, v) => this.setSignal(name, v),
            masterGain: this.masterGain,
            limiter: this.limiter,
            masterConnected: () => this._masterConnected,
        });
    }
    get audioContext() { return this.ctx; }
    /** The node every sketch sound flows through on its way to the destination (capture taps connect here). */
    get outputNode() { return this.masterOut(); }
    get isPlaying() { return this._isPlaying; }
    get currentTime() { return this.clock.currentTime; }
    /** Allocating diagnostic snapshot: real native loops versus retained logical voices. */
    loopVoiceReport() { return this._loopVoiceBudget.report(); }
    loopReceivedGain(track) {
        if (!this.isTrackAudible(track) || track._zoneMuted || track.volume <= 0 || track._activity <= 0)
            return 0;
        const stmt = track.statement;
        let volume = track.volume;
        if (!stmt.volumeFollow && stmt.groupVolumeModulation)
            volume *= this.evalInterpCached(track, stmt.groupVolumeModulation, this.clock.currentTime - track.startedAt);
        const level = this._levels.levelGain(track, volume);
        track._levelGain = level;
        const obstruction = occlusionGain(Math.max(track.occlusion, track._foliage)) * zoneIsolationGain(track._zoneOcclusion);
        const distance = stmt.bed || stmt.field ? 1 : directPathGain(track.surfaceDistanceM, stmt.line, stmt.distanceProfile);
        // Rank the direct path and room send together: a muffled source can still
        // contribute an audible reverberant field. This is a model, not a meter.
        const wet = Number.isNaN(track._lastReverbWet) ? track._reverbWet : track._lastReverbWet;
        const dry = distance * obstruction * (1 - wet);
        const send = this.currentSendGain(track);
        return level * track._scaleBase * track._activity * Math.hypot(dry, send);
    }
    loopPlaybackRate(track) {
        const stmt = track.statement, elapsed = this.clock.currentTime - track.startedAt;
        let pitch = track.pitch;
        if (!stmt.pitchFollow && stmt.groupPitchModulation && !stmt.voiceId)
            pitch *= this.evalInterpCached(track, stmt.groupPitchModulation, elapsed);
        return Math.max(.05, pitch * track.doppler);
    }
    suspendLoopVoice(track) {
        if (track.sourceNode) {
            try {
                track.sourceNode.stop();
            }
            catch { /* prepared but never started */ }
            track.sourceNode.disconnect();
            this._activeSources.delete(track.sourceNode);
            track.sourceNode = null;
        }
        // Disconnect the graph input and all authored effect edges. Gain=0 alone
        // does not bound native BufferSource/HRTF/DSP processing on large scenes.
        track.gainNode.disconnect();
        track.scaleGain.disconnect();
        if (track.dspChain) {
            destroyDSPChain(track.dspChain);
            track.dspChain = null;
        }
        clearLoopAutomation(track, this.ctx.currentTime);
    }
    resumeLoopVoice(track, buffer, offset, rate) {
        const stmt = track.statement, now = this.ctx.currentTime;
        // Live edits can rebuild an effect while the loop is virtual. Replace that
        // disconnected graph too, so waking never retains duplicate effect edges.
        track.gainNode.disconnect();
        track.scaleGain.disconnect();
        if (track.dspChain)
            destroyDSPChain(track.dspChain);
        track.dspChain = buildDSPChain(this.ctx, { filter: stmt.filterParams, distortion: stmt.distortionParams, delay: stmt.delayParams, eq: stmt.eqParams });
        track.gainNode.connect(track.scaleGain);
        if (track.dspChain) {
            track.scaleGain.connect(track.dspChain.input);
            track.dspChain.output.connect(track.levelNode);
            this.resetDSPWriteCache(track);
            this.updateDSPInterpolations(track, stmt, this.clock.currentTime - track.startedAt, now);
        }
        else
            track.scaleGain.connect(track.levelNode);
        // Virtual voices advance their model only. Reconcile all retained native
        // nodes once, before any sample can enter the graph, without replaying history.
        clearLoopAutomation(track, now);
        track.virtual = false;
        track.scaleGain.gain.setValueAtTime(track._scaleBase * track._activity, now);
        this._acoustics.writePannerPosition(track, track._heard, now, true);
        this.updateSourceExtent(track, now, true);
        this._acoustics.applyMuffle(track, now, PARAM_SMOOTHING, true);
        this._acoustics.updateElevationCues(track, stmt, now, true);
        const wet = Number.isNaN(track._lastReverbWet) ? track._reverbWet : track._lastReverbWet;
        track.reverbDry?.gain.setValueAtTime(1 - wet, now);
        track.reverbSend?.gain.setValueAtTime(this.currentSendGain(track), now);
        track._lastPathGain = track._pathGain;
        track._lastTransmissionGain = this.currentSendGain(track);
        const source = this.voiceSource(track, buffer);
        source.buffer = buffer;
        source.loop = true;
        source.playbackRate.setValueAtTime(rate, now);
        source.connect(track.gainNode);
        const fade = Math.max(.005, track._fadeEndT - now);
        track.gainNode.gain.cancelScheduledValues(now);
        track.gainNode.gain.setValueAtTime(0, now);
        if (this._levels.calibrated)
            track.levelNode.gain.setValueAtTime(track._levelGain, now);
        track.gainNode.gain.linearRampToValueAtTime(this._levels.calibrated ? 1 : track._levelGain, now + fade);
        track.sourceNode = source;
        this._activeSources.add(source);
        source.start(now, offset);
    }
    /** Get all decoded audio buffers (for offline export). */
    getAudioBuffers() { return this.audioBuffers; }
    /** PCM onset estimate for a decoded clip; never a hardware/output latency measurement. */
    bufferOnset(clip) {
        const buffer = this.audioBuffers.get(clip) ?? this.audioBuffers.get(pathFor(clip));
        return buffer ? measureTriggerOnset(buffer) : null;
    }
    /**
     * Play a UI-triggered one-shot buffer (footsteps, interaction sounds)
     * through the master chain, so the master gain, limiter, and stop() all
     * apply — a separate AudioContext would keep making noise after mute.
     * Non-spatial by design (self-sounds have no direction); `pan` gives step
     * alternation its slight left/right sway.
     */
    playOneShotBuffer(buffer, opts) {
        // One-shots must be audible regardless of transport: stop() severs
        // masterGain→limiter as a hard-kill, which silently ate footsteps when
        // walking a stopped scene. Re-wiring here is safe — teardown removed all
        // scene sources, and MUTE still applies (it zeroes the gain, not the
        // connection).
        if (!this._masterConnected) {
            this.masterGain.connect(this.masterOut());
            this._masterConnected = true;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = opts?.playbackRate ?? 1;
        const gain = this.ctx.createGain();
        gain.gain.value = opts?.volume ?? 1;
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, opts?.pan ?? 0));
        source.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
        };
        // start() must precede the scheduled stop(): stop-before-start throws
        // InvalidStateError, which silently ate the whole one-shot.
        const offset = opts?.offsetSeconds ?? 0;
        source.start(this.ctx.currentTime, Number.isFinite(offset) ? Math.max(0, Math.min(buffer.duration, offset)) : 0);
        // Cap over-long clips (generated one-shots can carry a room tail):
        // quick fade from maxDurationS, hard stop shortly after.
        const max = opts?.maxDurationS;
        if (max && max > 0) {
            const t = this.ctx.currentTime;
            gain.gain.setTargetAtTime(0, t + max, 0.04);
            source.stop(t + max + 0.2);
        }
    }
    /**
     * Play a buffer AT a world position — the spatial sibling of
     * playOneShotBuffer, for world sounds the player perceives (an approached
     * shoreline, a passed object) rather than self-sounds. Same HRTF panner
     * settings as scene voices so distance attenuation matches the mix, same
     * master-chain routing so mute/stop/limiter apply. Supports looping for
     * sustained ambience; the returned handle fades out and frees the nodes.
     */
    playOneShotAt(buffer, x, y, z, opts) {
        if (!this._masterConnected) {
            this.masterGain.connect(this.masterOut());
            this._masterConnected = true;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = opts?.loop ?? false;
        source.playbackRate.value = opts?.playbackRate ?? 1;
        const gain = this.ctx.createGain();
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.rolloffFactor = distanceRolloff(false, opts?.distanceProfile);
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
        source.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);
        const t0 = this.ctx.currentTime;
        const volume = opts?.volume ?? 1;
        const fadeIn = opts?.fadeInS ?? 0;
        if (fadeIn > 0) {
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.linearRampToValueAtTime(volume, t0 + fadeIn);
        }
        else {
            gain.gain.value = volume;
        }
        let ended = false;
        const cleanup = () => {
            if (ended)
                return;
            ended = true;
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
        };
        source.onended = cleanup;
        // start before scheduling the stop: stop() on a source that has not started throws
        source.start();
        const max = opts?.maxDurationS;
        if (!source.loop && max && max > 0) {
            gain.gain.setTargetAtTime(0, t0 + max, 0.04);
            source.stop(t0 + max + 0.2);
        }
        return {
            stop: (fadeS = 0) => {
                if (ended)
                    return;
                const t = this.ctx.currentTime;
                if (fadeS > 0) {
                    gain.gain.cancelScheduledValues(t);
                    gain.gain.setTargetAtTime(0, t, fadeS / 3);
                    source.stop(t + fadeS + 0.1);
                }
                else {
                    source.stop(t);
                }
            },
        };
    }
    /**
     * playOneShotAt, heard through the SIMULATION's acoustics — for previews of
     * a voice that carries treatment (`in <room>` + `occlusion`). The sample
     * stays dry; the same math the engine applies to scene voices shapes the
     * preview: occlusion through the muffle law (combinedCutoffHz lowpass +
     * occlusionGain), the room through a shared reverb bus (acquired from the
     * scene pool, so a playing scene's identical room reuses one convolver).
     * Space is never baked into the sample — it is applied here, live.
     *
     * `room` names a room the CURRENT script declares (resolved via the same
     * derivation as `in <room>` voices); explicit `reverb` params win over it.
     */
    playOneShotTreated(buffer, x, y, z, opts) {
        if (!this._masterConnected) {
            this.masterGain.connect(this.masterOut());
            this._masterConnected = true;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = opts?.loop ?? false;
        const gain = this.ctx.createGain();
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.rolloffFactor = distanceRolloff(opts?.line, opts?.distanceProfile);
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
        // The dry-path muffle, exactly as applyMuffle computes it for a voice at
        // this occlusion and distance (the preview does not move, so once).
        const occ = Math.max(0, Math.min(1, opts?.occlusion ?? 0));
        const extras = [];
        let last = gain;
        source.connect(gain);
        if (occ > 0.005) {
            const dist = Math.hypot(x - this._listenerPos.x, y - this._listenerPos.y, z - this._listenerPos.z);
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = combinedCutoffHz(occ, dist * this._acoustics.airAbsorptionScale);
            filter.Q.value = 0.5;
            const occGain = this.ctx.createGain();
            occGain.gain.value = occlusionGain(occ);
            last.connect(filter);
            filter.connect(occGain);
            extras.push(filter, occGain);
            last = occGain;
        }
        if (opts?.spatial === false)
            last.connect(this.masterGain);
        else {
            last.connect(panner);
            panner.connect(this.masterGain);
        }
        // The room: a shared bus (diffuse, unpanned), fed post-muffle the way a
        // scene voice sends — the wall muffles the reverberant path too.
        const reverb = opts?.reverb
            ?? (opts?.room ? this._rooms.namedRoom(opts.room.toLowerCase()) ?? undefined : undefined);
        let bus = null;
        let send = null;
        if (reverb && reverb.wet > 0.005) {
            bus = this.reverbBuses.acquire(reverb.size, reverb.damping);
            send = this.ctx.createGain();
            send.gain.value = reverbSendGain(reverb.wet, reverb.size, opts?.distanceProfile);
            last.connect(send);
            send.connect(bus.input);
        }
        const t0 = this.ctx.currentTime;
        const volume = opts?.volume ?? 1;
        const fadeIn = opts?.fadeInS ?? 0;
        if (fadeIn > 0) {
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.linearRampToValueAtTime(volume, t0 + fadeIn);
        }
        else {
            gain.gain.value = volume;
        }
        let ended = false;
        const cleanup = () => {
            if (ended)
                return;
            ended = true;
            try {
                source.disconnect();
                gain.disconnect();
                panner.disconnect();
            }
            catch { /* torn down */ }
            for (const n of extras) {
                try {
                    n.disconnect();
                }
                catch { /* torn down */ }
            }
            try {
                send?.disconnect();
            }
            catch { /* torn down */ }
            if (bus)
                this.reverbBuses.release(bus);
            opts?.onEnded?.();
        };
        source.onended = cleanup;
        // start before scheduling the stop: stop() on a source that has not started throws
        source.start();
        const max = opts?.maxDurationS;
        if (max && max > 0) {
            gain.gain.setTargetAtTime(0, t0 + max, 0.04);
            source.stop(t0 + max + 0.2);
        }
        return {
            stop: (fadeS = 0) => {
                if (ended)
                    return;
                const t = this.ctx.currentTime;
                if (fadeS > 0) {
                    gain.gain.cancelScheduledValues(t);
                    gain.gain.setTargetAtTime(0, t, fadeS / 3);
                    source.stop(t + fadeS + 0.1);
                }
                else {
                    source.stop(t);
                }
            },
        };
    }
    /** Last listener position fed in — read by the spatial tick for distance acoustics. */
    _listenerPos = { x: 0, y: 0, z: 0 };
    /** Listener position at the previous spatial tick + measured speed (m/s) —
     * feeds the `speed` signal for follow bindings. */
    _lastListenerTickPos = { x: 0, y: 0, z: 0, valid: false };
    _listenerSpeed = 0;
    /** Last orientation written to the AudioListener (Web Audio defaults). */
    _listenerFwd = { x: 0, y: 0, z: -1 };
    _listenerUp = { x: 0, y: 1, z: 0 };
    /**
     * Minimum per-axis delta before listener automation is written. Both setters
     * are called unconditionally every R3F frame — with a still camera that was
     * ~540 pointless automation events/sec. Compared against the last *written*
     * values so slow pans still accumulate past the threshold.
     */
    static LISTENER_EPS = 1e-4;
    /** Sync the AudioListener to the camera/observer position (smoothed to avoid artifacts). */
    setListenerPosition(x, y, z) {
        const eps = SatieEngine.LISTENER_EPS;
        const p = this._listenerPos;
        if (Math.abs(x - p.x) < eps && Math.abs(y - p.y) < eps && Math.abs(z - p.z) < eps)
            return;
        p.x = x;
        p.y = y;
        p.z = z;
        const l = this.ctx.listener;
        const t = this.ctx.currentTime;
        if (l.positionX) {
            l.positionX.setTargetAtTime(x, t, 0.010);
            l.positionY.setTargetAtTime(y, t, 0.010);
            l.positionZ.setTargetAtTime(z, t, 0.010);
        }
        else {
            l.setPosition(x, y, z);
        }
    }
    /** Sync the AudioListener orientation (smoothed to avoid artifacts on rapid head turns). */
    setListenerOrientation(fx, fy, fz, ux, uy, uz) {
        const eps = SatieEngine.LISTENER_EPS;
        const f = this._listenerFwd;
        const u = this._listenerUp;
        if (Math.abs(fx - f.x) < eps && Math.abs(fy - f.y) < eps && Math.abs(fz - f.z) < eps &&
            Math.abs(ux - u.x) < eps && Math.abs(uy - u.y) < eps && Math.abs(uz - u.z) < eps)
            return;
        f.x = fx;
        f.y = fy;
        f.z = fz;
        u.x = ux;
        u.y = uy;
        u.z = uz;
        const l = this.ctx.listener;
        const t = this.ctx.currentTime;
        if (l.forwardX) {
            l.forwardX.setTargetAtTime(fx, t, 0.010);
            l.forwardY.setTargetAtTime(fy, t, 0.010);
            l.forwardZ.setTargetAtTime(fz, t, 0.010);
            l.upX.setTargetAtTime(ux, t, 0.010);
            l.upY.setTargetAtTime(uy, t, 0.010);
            l.upZ.setTargetAtTime(uz, t, 0.010);
        }
        else {
            l.setOrientation(fx, fy, fz, ux, uy, uz);
        }
    }
    /**
     * Sync the listener from a column-major 4×4 world matrix (three.js:
     * `camera.matrixWorld.elements`). Allocation-free; per-frame safe — the
     * underlying setters are epsilon-gated. Scale in the matrix is normalized
     * out of the direction vectors.
     */
    setListenerFromMatrix(m) {
        const p = SatieEngine.listenerPoseFromMatrix(m);
        this.setListenerPosition(p.px, p.py, p.pz);
        this.setListenerOrientation(p.fx, p.fy, p.fz, p.ux, p.uy, p.uz);
    }
    /** Pure matrix → listener pose decomposition (exposed for tests). */
    static listenerPoseFromMatrix(m) {
        // Column-major: basis X = m[0..2], Y = m[4..6], Z = m[8..10], pos = m[12..14]
        let fx = -m[8], fy = -m[9], fz = -m[10]; // camera looks down −Z
        let ux = m[4], uy = m[5], uz = m[6];
        const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
        const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
        if (fl > 1e-12) {
            fx /= fl;
            fy /= fl;
            fz /= fl;
        }
        if (ul > 1e-12) {
            ux /= ul;
            uy /= ul;
            uz /= ul;
        }
        return { px: m[12], py: m[13], pz: m[14], fx, fy, fz, ux, uy, uz };
    }
    /**
     * Public per-frame read surface: the same in-place-mutated track objects as
     * getTracksArray, narrowed to the read-only {@link TrackView} fields.
     */
    getTrackViews() {
        return this.getTracksArray();
    }
    /** Where the listener is now (world metres, +Y up), for tools that describe the scene from there. */
    get listenerPosition() { return this._listenerPos; }
    /** Where the listener faces now (unit vector), for tools that say what is in front of you. */
    get listenerForward() { return this._listenerFwd; }
    /**
     * What a live track is playing right now, for analysis (the mixer's audibility model):
     * the take's buffer and the cutoff of its path low-pass (air absorption, occlusion), if any.
     */
    trackSignal(key) {
        const t = this.getTracksArray().find(x => x.key === key);
        if (!t)
            return null;
        return { buffer: t.sourceNode?.buffer ?? null, cutoffHz: t.occlusionFilter ? t.occlusionFilter.frequency.value : null };
    }
    /** Get the shared tracks array. Updated in-place — no allocation per frame. */
    /** The scene event log: starts, fires, stops, spawns, retires, broadcast events. */
    get eventLog() { return this._log; }
    /**
     * Queued re-fires due within `horizonS` (clock seconds) — the timeline's
     * future half. Only the scheduler's retrigger events, labelled by clip.
     */
    upcomingFires(horizonS) {
        const out = [];
        for (const e of this.scheduler.upcoming(horizonS)) {
            if (!e.label.startsWith('retrigger:'))
                continue;
            const track = this.tracks.get(e.trackKey);
            out.push({ t: e.t, key: e.trackKey, statementIndex: track ? track.statementIndex : -1, label: e.label.slice('retrigger:'.length) });
        }
        return out;
    }
    /** Record a scene event (allocates one small object; not per tick). */
    logEvent(kind, track, label, pos, extra) {
        const p = pos ?? track?.position ?? null;
        const e = {
            t: this.clock.currentTime,
            kind: kind === 'fire' && this._auditionFire ? 'audition' : kind,
            key: track?.key ?? '',
            statementIndex: track ? track.statementIndex : -1,
            label,
            entity: extra?.entity ?? '',
            instance: extra?.instance ?? -1,
            take: extra?.take ?? (track ? track._variant : -1),
            demand: extra?.demand ?? -1,
            x: p ? p.x : 0, y: p ? p.y : 0, z: p ? p.z : 0,
        };
        if (track?.statement.sourceId)
            e.sourceId = track.statement.sourceId;
        if (track?.statement.eventName)
            e.eventName = track.statement.eventName;
        if (extra)
            Object.assign(e, extra);
        this._log.record(e);
    }
    getTracksArray() {
        if (this._tracksArrayDirty) {
            this._tracksArray = Array.from(this.tracks.values());
            this._tracksArrayDirty = false;
        }
        return this._tracksArray;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** Subscribe to throttled UI-only updates (currentTime, trackCount). */
    subscribeUI(listener) {
        this.uiListeners.add(listener);
        return () => this.uiListeners.delete(listener);
    }
    notify() {
        const tracks = this.getTracksArray();
        const state = {
            isPlaying: this._isPlaying,
            currentTime: this.clock.currentTime,
            tracks,
            statements: this.statements,
            errors: this.errors,
        };
        for (const listener of this.listeners)
            listener(state);
        // Also push to UI listeners on discrete events
        this.notifyUI();
    }
    notifyUI() {
        const uiState = {
            isPlaying: this._isPlaying,
            currentTime: this.clock.currentTime,
            trackCount: this.tracks.size,
            statements: this.statements,
            errors: this.errors,
            runtimeWarnings: this._runtimeWarnings,
            mutedIndices: this._mutedIndices,
            soloedIndices: this._soloedIndices,
            genStatus: this.getGenStatus(),
            world: this._world,
        };
        for (const listener of this.uiListeners)
            listener(uiState);
    }
    /** Memoized gen status — notifyUI calls at 8 Hz and status rarely changes. */
    _genStatusCache = null;
    _genStatusStatements = null;
    _genStatusBufferCount = -1;
    _genStatusDormantVersion = -1;
    /** Bumped whenever a track's `dormant` flag changes — the gen-status memo's third key. */
    _dormantVersion = 0;
    /** Snapshot of gen-voice audio progress for the UI (runs at UI notify rate). */
    getGenStatus() {
        // Statements array is replaced on loadScript; buffer count changes on any
        // add/evict; dormancy has its own version — together they cover
        // everything the status depends on.
        if (this._genStatusCache &&
            this._genStatusStatements === this.statements &&
            this._genStatusBufferCount === this.audioBuffers.size &&
            this._genStatusDormantVersion === this._dormantVersion) {
            return this._genStatusCache;
        }
        let total = 0;
        let ready = 0;
        let dormant = 0;
        let readyTakes = 0, requestedTakes = 0;
        const missing = [];
        const seen = new Set();
        // A statement is dormant while any of its voices is (lazy generation
        // holding the request back) — it is not "missing": nobody asked for it.
        const dormantStatements = new Set();
        for (const t of this.tracks.values())
            if (t.dormant)
                dormantStatements.add(t.statementIndex);
        for (let i = 0; i < this.statements.length; i++) {
            const stmt = this.statements[i];
            if (!stmt.isGenerated || !stmt.genPrompt || isTemplatePrompt(stmt.genPrompt))
                continue;
            // Template events resolve a concrete material on fire; the literal {text} is never a missing take.
            total++;
            // A pooled voice (`variants`) is ready on its FIRST landed take; the
            // rest join the pool as they arrive without holding playback.
            let has = false;
            const unique = new Set();
            for (let k = 0; k < takeCount(stmt); k++) {
                const buffer = this.variantBuffer(stmt, k);
                if (buffer) {
                    has = true;
                    unique.add(buffer);
                }
            }
            if (!dormantStatements.has(i)) {
                requestedTakes += takeCount(stmt);
                readyTakes += unique.size;
            }
            if (has) {
                ready++;
                continue;
            }
            if (dormantStatements.has(i)) {
                dormant++;
                continue;
            }
            // Same display-name cleanup the viewport labels use
            const name = displayNameOf(stmt);
            if (!seen.has(name)) {
                seen.add(name);
                missing.push(name);
            }
        }
        this._genStatusStatements = this.statements;
        this._genStatusBufferCount = this.audioBuffers.size;
        this._genStatusDormantVersion = this._dormantVersion;
        this._genStatusCache = { total, ready, dormant, missing, takes: { ready: readyTakes, requested: requestedTakes } };
        return this._genStatusCache;
    }
    /** Add a runtime warning (surfaced to editor UI). */
    addRuntimeWarning(msg) {
        // Avoid duplicates
        if (this._runtimeWarnings.includes(msg))
            return;
        this._runtimeWarnings.push(msg);
        if (this._runtimeWarnings.length > this._runtimeWarningsMax) {
            this._runtimeWarnings.shift();
        }
    }
    /** Clear runtime warnings (called on play/stop). */
    clearRuntimeWarnings() {
        this._runtimeWarnings = [];
    }
    // ── Audio loading ──
    /** Decode the exact bytes we hash. Missing Web Crypto leaves identity unverified. */
    async decodeAudioAsset(data, expectedSha256) {
        const bytes = data.slice(0); // Own a copy: neither caller mutation nor decode detachment can change the digest.
        const digest = globalThis.crypto?.subtle
            ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
            : undefined;
        if (expectedSha256 && digest !== expectedSha256)
            throw new Error('Sample checksum mismatch or unavailable verification.');
        const buffer = await decodeSynthAudio(this.ctx, bytes);
        if (digest)
            this.audioByteHashes.set(buffer, digest);
        return buffer;
    }
    /** Identity of encoded bytes decoded for this buffer, before normalization/effects. */
    getAudioAssetHash(buffer) { return this.audioByteHashes.get(buffer); }
    async loadAudioFile(name, url) {
        if (this.audioBuffers.has(name))
            return;
        try {
            const response = await fetch(url);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.decodeAudioAsset(arrayBuffer);
            this.registerBuffer(name, audioBuffer);
            this.drainPendingVoices(name);
        }
        catch (e) {
            this.addRuntimeWarning(`Failed to load audio: ${name} (${e.message ?? 'unknown error'})`);
        }
    }
    /**
     * True when the context needs a resume() to produce sound. iOS Safari adds a
     * non-standard 'interrupted' state (phone call, backgrounding, Siri) that
     * behaves like 'suspended' but never matches it — without this check an
     * interrupted context stays silent forever.
     */
    ctxNeedsResume() {
        const s = this.ctx.state;
        return s === 'suspended' || s === 'interrupted';
    }
    async loadAudioBuffer(name, data, opts) {
        // Resume context if suspended — decodeAudioData can hang on suspended contexts in some browsers.
        // Race against a timeout: outside a user gesture resume() itself can stay
        // pending forever, which would block sample loading entirely.
        if (this.ctxNeedsResume()) {
            let timer;
            await Promise.race([
                this.ctx.resume().catch(() => { }),
                new Promise(resolve => { timer = setTimeout(resolve, 250); }),
            ]).finally(() => clearTimeout(timer));
        }
        let audioBuffer = await decodeSynthAudio(this.ctx, data.slice(0));
        if (opts?.maxDurationS) {
            const trimmed = trimAudioBuffer(audioBuffer, opts.maxDurationS, this.ctx);
            copySynthAsset(audioBuffer, trimmed);
            audioBuffer = trimmed;
        }
        this.registerBuffer(name, audioBuffer);
        this.drainPendingVoices(name);
    }
    /**
     * Register an already-decoded AudioBuffer under a clip name. The decoded
     * ingress for embedders who own their own loading pipeline — no fetch, no
     * decode, no context-resume dance.
     */
    setAudioBuffer(name, buffer) {
        this.registerBuffer(name, buffer);
        this.drainPendingVoices(name);
    }
    /**
     * Put another buffer under a clip name and hear it at once: a loop playing it crossfades onto
     * the new one (`swapBufferSmooth`, 0.3 s); a one-shot plays it from its next fire. What an
     * editor uses to audition a candidate where the sound plays (and to put the old one back).
     * `setAudioBuffer` alone only wakes voices waiting for a buffer: a playing loop keeps its own.
     */
    replaceAudioBuffer(name, buffer) {
        this.swapBufferSmooth(name, buffer);
        this.drainPendingVoices(name);
    }
    /**
     * Forget the buffer under a clip name (a take replaced or taken back: a template bank must not
     * keep playing the take it replaced). Voices already playing it finish; later fires do not find it.
     */
    removeAudioBuffer(name) {
        return this.audioBuffers.delete(name);
    }
    /**
     * The single ingress into `audioBuffers`: every buffer is loudness-normalized
     * once on arrival (normalizeOnArrival), whatever path it came by.
     */
    registerBuffer(name, buffer) {
        // A four-channel field or a surround file folds to mono first: a placed source has one channel.
        const placeable = foldToPlaceable(buffer, (ch, len, sr) => { try {
            return this.ctx.createBuffer(ch, len, sr);
        }
        catch {
            return null;
        } });
        copySynthAsset(buffer, placeable);
        normalizeOnArrival(placeable);
        measureTriggerOnset(placeable);
        this.audioBuffers.set(name, placeable);
    }
    /**
     * Retrigger any voices that were waiting for this clip's buffer to arrive.
     * Called from loadAudioBuffer/loadAudioFile so that voices scheduled before
     * decode finished don't silently miss their cue.
     */
    drainPendingVoices(bufferName) {
        const candidates = new Set([bufferName, pathFor(bufferName)]);
        for (const key of candidates) {
            const queue = this._pendingVoices.get(key);
            if (!queue || queue.length === 0)
                continue;
            this._pendingVoices.delete(key);
            for (const { key: voiceKey, stmt } of queue) {
                // Only retrigger if the voice still exists and we're still playing.
                // Otherwise the user has stopped or the track was torn down.
                const track = this.tracks.get(voiceKey);
                if (this._isPlaying && track && !track.stopping && track.statement === stmt && this.statements.includes(stmt)
                    && (!stmt.recordings?.takes || track.pending)) {
                    this.retriggerAudio(voiceKey, stmt);
                }
            }
        }
    }
    getLoadedAudioNames() {
        return Array.from(this.audioBuffers.keys());
    }
    // ── Script / transport ──
    /**
     * Replace the scene.
     *
     * On a PLAYING engine this is a diff by default, and that is the mixer's
     * contract: moving one fader must not fade the rain out and start it again.
     *
     * `restart: true` is the other intent — "play me the scene again, from the
     * top". A chat edit means that and a diff cannot express it: an unchanged
     * statement keeps its live track untouched, and a oneshot that has already
     * rung has no track and no queued events, so the diff reads it as finished
     * and skips it forever. Ask for the cat fight and the breaking vase, edit the
     * curtain, and the fight never happens again. `restart` takes the same
     * `teardownAll` + `scheduleAll` path a parse error already used, which
     * re-starts the clock and so re-schedules every `start` from scene zero
     * (`scheduleAll` uses absolute scene time; the diff's `scheduleNew` uses
     * `now + start`, which is a different and deliberate meaning).
     *
     * It deliberately does NOT `stop()` first: `stop()` suspends the
     * AudioContext, and a chat edit resolves after an `await`, so there is no
     * user gesture left to resume it. Tearing down without suspending keeps the
     * context running. Nothing is re-bought either — `audioBuffers` survives and
     * `preGenerateAll` skips every take already decoded.
     */
    loadScript(script, opts) {
        // audition trims name statement indices of the old script
        this._previewGain.clear();
        // A new script is a fresh chance, same as a fresh play(): chat sessions
        // load scripts mid-play and never call play() again, so a latch tripped
        // by one transient 401/402 (an ElevenLabs outage, a stale token blip)
        // used to kill generation for the rest of the session. If the cause
        // persists, the first attempt re-latches — bounded by voice count.
        this._gen.reset();
        // Snapshot existing gen prompt → audio buffer mappings before re-parse.
        // Keyed by lowercased prompt so the matching below never re-lowercases
        // old prompts in the inner loop.
        const prevGenBuffers = new Map();
        for (const stmt of this.statements) {
            if (!stmt.isGenerated || !stmt.genPrompt || stmt.recordings?.takes)
                continue;
            const cp = pathFor(stmt.clip);
            const buf = this.audioBuffers.get(cp) ?? this.audioBuffers.get(stmt.clip);
            if (buf)
                prevGenBuffers.set(stmt.genPrompt.toLowerCase(), buf);
            // Pooled takes carry under `<prompt>#k` so a reworded script keeps its pool.
            for (let k = 1; k < takeCount(stmt); k++) {
                const vb = this.audioBuffers.get(this.variantClipPath(stmt, k));
                if (vb)
                    prevGenBuffers.set(`${stmt.genPrompt.toLowerCase()}#${k}`, vb);
            }
        }
        const prevStatements = this.statements;
        const prevScriptRoom = this.scriptRoom;
        const prevRoomsByName = new Map(this.scriptRoomsByName);
        const prevEntityDefs = this.entityDefs;
        try {
            const scene = parseScene(script);
            if (scene.levelReferenceDb !== undefined)
                this._levels.setAnchor(scene.levelReferenceDb);
            this.statements = scene.statements;
            this._programs.configure(this.statements);
            this.entityDefs = scene.entities;
            this._rooms.setDeclared(deriveScriptRoom(scene.rooms, scene.materials), deriveScriptRoomsByName(scene.rooms, scene.materials));
            this._acoustics.buildPlacedRooms(scene.rooms, scene.statements);
            this._acoustics.buildSoundscapes(scene.soundscapes);
            this.applyWorldSpec(scene.world);
            // A scene is calibrated when anything in it states an emission level.
            this._levels.calibrate(scene.statements.some(s => !s.spl.isNull || s.splFollow !== null)
                || scene.entities.some(e => !e.spl.isNull || e.splFollow !== null));
            this.errors = null;
        }
        catch (e) {
            this.errors = e.message;
            this.statements = [];
            this._programs.configure([]);
            this.entityDefs = [];
            this._levels.calibrate(false);
            this._rooms.setDeclared(null, new Map());
            this._acoustics.buildPlacedRooms([], []);
            this._acoustics.buildSoundscapes([]);
        }
        // Carry forward audio buffers for gen voices whose prompts match previous ones,
        // even if clip paths changed (e.g. AI reworded the script but kept same sounds)
        for (const stmt of this.statements) {
            if (!stmt.isGenerated || !stmt.genPrompt || stmt.recordings?.takes)
                continue;
            const cp = pathFor(stmt.clip);
            if (this.audioBuffers.has(cp) || this.audioBuffers.has(stmt.clip))
                continue;
            const newPrompt = stmt.genPrompt.toLowerCase();
            // Exact match first
            let existing = prevGenBuffers.get(newPrompt);
            // Fuzzy match: if the new prompt contains an old prompt (or vice versa), reuse it
            if (!existing) {
                for (const [oldPrompt, buf] of prevGenBuffers) {
                    if (newPrompt.includes(oldPrompt) || oldPrompt.includes(newPrompt)) {
                        existing = buf;
                        break;
                    }
                }
            }
            if (existing) {
                this.registerBuffer(cp, existing);
            }
            for (let k = 1; k < takeCount(stmt); k++) {
                const vp = this.variantClipPath(stmt, k);
                const vb = prevGenBuffers.get(`${newPrompt}#${k}`);
                if (vb && !this.audioBuffers.has(vp))
                    this.registerBuffer(vp, vb);
            }
        }
        // Evict decoded buffers the new script no longer references — they are
        // large (~9 MB for 24 s stereo) and used to accumulate forever across
        // chat generations / undo / sketch loads. An insertion-order tail is kept
        // so undo/redo restores recent scripts without re-decoding. Skipped on
        // parse errors: a transient syntax error must not flush the cache.
        if (this.errors === null) {
            const referenced = new Set();
            // Entity members are present in this same flattened statement list.
            const templates = this.statements.filter(stmt => stmt.kind === 'trigger' && isTemplatePrompt(stmt.genPrompt));
            for (const stmt of this.statements) {
                referenced.add(pathFor(stmt.clip));
                referenced.add(stmt.clip);
                for (let k = 0; k < takeCount(stmt); k++)
                    referenced.add(this.variantClipPath(stmt, k));
                for (const clip of recordingReferences(stmt))
                    referenced.add(clip);
            }
            const unreferenced = [];
            for (const name of this.audioBuffers.keys()) {
                if (!referenced.has(name) && !this._retained.has(name) && !templates.some(stmt => templateReferencesBuffer(stmt, name)))
                    unreferenced.push(name);
            }
            for (let i = 0; i < unreferenced.length - BUFFER_EVICT_TAIL; i++) {
                this.audioBuffers.delete(unreferenced[i]);
            }
        }
        // If playing, apply the edit INCREMENTALLY: an edit to one voice must not
        // restart the scene. Two things override that — a parse error (the
        // statements are gone; there is nothing to diff against) and an explicit
        // `restart`, which is a caller saying "from the top" rather than "patch
        // this in".
        if (this._isPlaying) {
            if (this.errors !== null || opts?.restart) {
                this.teardownAll();
                // From the top is a new timeline: what the previous scene did is not this scene's past.
                if (opts?.restart)
                    this._log.clear();
                this.scheduleAll();
            }
            else {
                // A version switch (spec 012 E2): changed voices cross on equal-power curves instead of cutting.
                this._crossfadeS = opts?.crossfade && opts.crossfade > 0 ? Math.min(4, opts.crossfade) : 0;
                if (!this._crossfadeS)
                    this._crossfadeIns.clear();
                try {
                    this.applyScriptDiff(prevStatements, prevScriptRoom, prevRoomsByName, prevEntityDefs);
                }
                finally {
                    this._crossfadeS = 0;
                }
            }
            // Chat applies edits while playing. An already audible first take must
            // not suppress the newly requested bank: fire() only requests missing
            // audio when no take is available at all. Fill the bank without restarting.
            if (this.errors === null)
                this.preGenerateEligible();
        }
        // Recover exact accepted assets after cache eviction / undo, including
        // surface banks which cannot be addressed through the source's base clip.
        const resolve = this.onMissingBuffer;
        if (resolve && this.errors === null) {
            const references = new Set(this.statements.flatMap(recordingReferences));
            for (const clip of references)
                if (!this.audioBuffers.has(clip)) {
                    void this._gen.resolveSupplied(clip, () => resolve(clip), () => this.statements.some(s => recordingReferences(s).includes(clip)))
                        .then(buffer => { if (buffer) {
                        this.drainPendingVoices(clip);
                        this.notify();
                    } });
                }
        }
        this.notify();
    }
    preGenerateEligible() {
        this._gen.preGenerateAll(this.statements.filter(s => !s.programId || !this._programs.issue(s.programId)));
    }
    async play() {
        if (this._isPlaying)
            return;
        // A fresh play is a fresh chance: the generation-disabled latch exists to
        // stop hammering the API mid-scene after a 401/402, but latching for the
        // whole SESSION turned one stale-token blip into "generation dead until
        // reload". If the cause persists (really signed out, really no credits),
        // the first attempt re-latches immediately — bounded by voice count.
        this._gen.reset();
        // Try to resume a suspended context, but NEVER block setup on it.
        // Outside transient user activation (e.g. play() fires tens of seconds
        // after the triggering keypress, once AI generation finishes), browsers —
        // Brave especially — can leave resume()'s promise pending indefinitely.
        // Awaiting it unconditionally means play() never proceeds: total silence,
        // no error. Setup below is safe on a suspended context: the clock derives
        // from ctx.currentTime, which freezes while suspended, so everything
        // scheduled now simply starts when the context actually resumes.
        if (this.ctxNeedsResume()) {
            let timer;
            await Promise.race([
                this.ctx.resume().catch(() => { }),
                new Promise(resolve => { timer = setTimeout(resolve, 250); }),
            ]).finally(() => clearTimeout(timer));
        }
        // Re-wire masterGain → limiter if a previous stop() severed it.
        if (!this._masterConnected) {
            this.masterGain.connect(this.masterOut());
            this._masterConnected = true;
        }
        this.clearRuntimeWarnings();
        this._gen.reset();
        this._isPlaying = true;
        this.clock.start();
        this.scheduler.reset();
        // The window top is set by the first voice to sound and governed from there.
        this._levels.resetWindow();
        this._demandAccumS = 0;
        // Eager pre-generation: kick off all gen audio requests in parallel
        this.preGenerateEligible();
        this.scheduleAll();
        if (!this.headless)
            this.tick();
        this.notify();
        // Still suspended? The resume above hung or was denied. Arm a one-shot
        // unlock so the next real user gesture starts the audio.
        if (this.ctxNeedsResume())
            this.installGestureUnlock();
    }
    /**
     * Fire-and-forget resume for UI gesture handlers. Call synchronously inside
     * a real user gesture (click/keydown), BEFORE any await — resume() only
     * reliably succeeds during transient activation.
     */
    /**
     * Replay the current scene from `offsetS` seconds in.
     *
     * The timeline's click-to-replay. It is the same teardown-and-reschedule
     * `loadScript(..., { restart: true })` uses, with the clock started already
     * `offsetS` in (`scheduleAll(fromS)` above decides what that means per
     * voice), and it deliberately does not `stop()`: suspending the
     * AudioContext would need a fresh user gesture to undo.
     *
     * Honest about its limits -- this is REPLAY FROM A POINT, not a seek. Loops
     * created at the offset start at their own beginning rather than mid-phase,
     * interpolations start from their heads, and trajectory state starts fresh.
     * What it does get right is the thing a listener actually asks for: the
     * oneshots land where they belong relative to each other, and the ones that
     * already happened before that point stay unfired.
     *
     * A no-op when nothing is playing; `play()` is how a stopped scene starts.
     */
    restartAt(offsetS = 0) {
        if (!this._isPlaying)
            return;
        const target = Math.max(0, offsetS);
        const rewoundS = Math.max(0, this.clock.currentTime - target);
        // Everything the log holds at or after the target has not happened in the
        // replayed timeline -- and its entries are stamped in SCENE time, so
        // leaving them would put the whole recorded past at a `t` greater than the
        // new now: a timeline view draws your own history to the right of the now
        // line, as the future. That is what made clicking back read as broken.
        this.eventLog.dropFrom(target);
        // The world clock is real elapsed time made into a time of day, and it
        // advances monotonically in `advanceWorld` -- nothing here was rewinding
        // it, so the sound replayed while the scene stayed at the hour it had
        // reached, and the timeline's own clock strip disagreed with what you
        // heard. Wind it back by the same span, at the same rate it went forward.
        const w = this._world;
        if (w && rewoundS > 0) {
            const rate = w.spec.time.clockRate;
            if (rate > 0) {
                const worldHours = ((rewoundS / 60) * rate) / 60;
                w.spec.time.hour = ((w.spec.time.hour - worldHours) % 24 + 24) % 24;
                this.setSignal('hour', w.spec.time.hour);
            }
        }
        this.teardownAll(false);
        this.scheduleAll(target);
        this.notify();
    }
    resumeContext() {
        if (this.ctxNeedsResume()) {
            this.ctx.resume().catch(() => { });
        }
    }
    /** Removes the gesture-unlock listeners, if installed. Null when not armed. */
    _gestureUnlockCleanup = null;
    /**
     * Window-level one-shot unlock: resume the context on the next user
     * gesture, then remove the listeners once the context leaves 'suspended'.
     * Plain DOM APIs only — the engine must stay React-free.
     */
    installGestureUnlock() {
        if (this._gestureUnlockCleanup || typeof window === 'undefined')
            return;
        const onGesture = () => {
            if (this.ctxNeedsResume()) {
                this.ctx.resume().catch(() => { });
            }
            else {
                cleanup();
            }
        };
        const onStateChange = () => {
            if (!this.ctxNeedsResume())
                cleanup();
        };
        const cleanup = () => {
            window.removeEventListener('pointerdown', onGesture, true);
            window.removeEventListener('keydown', onGesture, true);
            window.removeEventListener('touchstart', onGesture, true);
            this.ctx.removeEventListener('statechange', onStateChange);
            this._gestureUnlockCleanup = null;
        };
        window.addEventListener('pointerdown', onGesture, true);
        window.addEventListener('keydown', onGesture, true);
        window.addEventListener('touchstart', onGesture, true);
        this.ctx.addEventListener('statechange', onStateChange);
        this._gestureUnlockCleanup = cleanup;
    }
    stop() {
        this._isPlaying = false;
        if (this.animFrameId !== null) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        this.teardownAll();
        // Hard kill: sever masterGain from the limiter. Any source that somehow
        // dodged teardownAll (orphaned reference, async retrigger that fired after
        // tracks were cleared, etc.) still routes through masterGain — disconnecting
        // here cuts the only path to the destination. play() re-establishes it.
        if (this._masterConnected) {
            try {
                this.masterGain.disconnect();
            }
            catch { /* already disconnected */ }
            this._masterConnected = false;
        }
        // Belt-and-suspenders: suspend the audio context so no audio can leak through
        // a stale automation event. play() resumes.
        if (this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => { });
        }
        this.notify();
    }
    setMasterVolume(vol) {
        this._masterVolume = vol;
        // Cancel first: a fade still in flight would otherwise keep ramping over
        // the value just set, and the slider would spring back under the user.
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
    }
    /**
     * Bring the master bus up from silence over `seconds`, then leave it at the
     * level the app asked for. A scene that starts at full level arrives as a
     * slap: forty voices, beds included, all landing on the same sample. The
     * ramp is exponential, which is linear in dB, so it reads to the ear as an
     * even rise rather than a rush at the end.
     *
     * Safe to schedule on a suspended context: `currentTime` is frozen while
     * suspended and resumes from there, so the ramp plays out from the moment
     * audio actually starts, not from the moment it was scheduled.
     */
    fadeInMaster(seconds = 2.2) {
        const gain = this.masterGain.gain;
        const now = this.ctx.currentTime;
        gain.cancelScheduledValues(now);
        // Muted (volume 0) has no fade to perform, and an exponential ramp cannot
        // target zero.
        if (this._masterVolume <= 0 || seconds <= 0) {
            gain.setValueAtTime(this._masterVolume, now);
            return;
        }
        // exponentialRampToValueAtTime cannot START from zero either; -66 dB is
        // inaudible and gives the ramp a real floor to climb from.
        gain.setValueAtTime(this._masterVolume * MASTER_FADE_IN_FLOOR, now);
        gain.exponentialRampToValueAtTime(this._masterVolume, now + seconds);
    }
    /**
     * Take the master bus down to silence over `seconds` — the mirror of
     * {@link fadeInMaster}, and the half that was missing: `stop()` is a hard
     * kill (teardown, disconnect, suspend), so swapping one scene for another
     * cut the outgoing one off mid-sample.
     *
     * This only SCHEDULES the ramp; it never stops the engine. The caller waits
     * out `seconds` and then stops, so a fade and a teardown stay separable.
     * Same exponential shape and same -66 dB floor as the fade in, since an
     * exponential ramp can neither start from nor reach zero.
     */
    /**
     * Park the master bus at the inaudible floor, with no ramp.
     *
     * The gap between "the scene is loaded" and "the scene is making sound" is
     * not free: a heavy scene spends it building dozens of voice chains while
     * the page may also be decoding a captured world. Arming a fade-IN before
     * that work starts its clock at the moment the context resumes, so the
     * first sample that actually sounds arrives part-way up the curve and the
     * scene seems to snap on. Silence first, then ramp once it is running.
     */
    silenceMaster() {
        const gain = this.masterGain.gain;
        const now = this.ctx.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(this._masterVolume <= 0 ? this._masterVolume : this._masterVolume * MASTER_FADE_FLOOR, now);
    }
    fadeOutMaster(seconds = 1.1) {
        const gain = this.masterGain.gain;
        const now = this.ctx.currentTime;
        gain.cancelScheduledValues(now);
        // Already silent, or asked for no ramp: nothing to fade.
        if (this._masterVolume <= 0 || seconds <= 0) {
            gain.setValueAtTime(this._masterVolume, now);
            return;
        }
        gain.setValueAtTime(this._masterVolume, now);
        gain.exponentialRampToValueAtTime(this._masterVolume * MASTER_FADE_FLOOR, now + seconds);
    }
    // ── Mixer: runtime mute/solo ──
    toggleMute(statementIndex) {
        // Create new Set so React memo detects the reference change
        const next = new Set(this._mutedIndices);
        if (next.has(statementIndex)) {
            next.delete(statementIndex);
        }
        else {
            next.add(statementIndex);
        }
        this._mutedIndices = next;
        this.applyMixerState();
        this.notifyUI();
    }
    toggleSolo(statementIndex) {
        const next = new Set(this._soloedIndices);
        if (next.has(statementIndex)) {
            next.delete(statementIndex);
        }
        else {
            next.add(statementIndex);
        }
        this._soloedIndices = next;
        this.applyMixerState();
        this.notifyUI();
    }
    /**
     * Replace the solo set wholesale (search-highlight: solo every matched
     * voice at once). An empty array clears all solos.
     */
    setSoloIndices(indices) {
        this._soloedIndices = new Set(indices);
        this.applyMixerState();
        this.notifyUI();
    }
    /**
     * The loaded script's statements — live objects, not a copy. World
     * re-grounding places STATEMENTS (mutating their area pins every current
     * and future spawn), so it must see voices whose tracks don't exist yet
     * (start-delayed groups, still-generating audio). Read-only by contract.
     */
    get scriptStatements() { return this.statements; }
    /** Runtime warnings so far (failed loads, generation failures), deduplicated by message. */
    get runtimeWarnings() { return this._runtimeWarnings; }
    get mutedIndices() { return this._mutedIndices; }
    get soloedIndices() { return this._soloedIndices; }
    /**
     * Live per-statement volume (mixer slider). The slider is a MANUAL
     * OVERRIDE: it takes the property away from every automation — the voice's
     * own fade, the group's modulation envelope, and a `follow` binding — and
     * sets the gain right now (PARAM_SMOOTHING is a de-click, not a fade).
     * Leaving any of those live meant the tick loop kept fighting the hand on
     * the fader and the slider read as broken. Updates the statement so future
     * retriggers agree, and moves every live track of that statement.
     */
    /**
     * Hear a level change while it is being made: a dB trim layered on the voice's
     * written gain, leaving its script, its `follow` bindings and the level model
     * untouched. null clears it. The mixer commits the real edit on release.
     */
    /** The dB a level change being made adds to a voice right now (0 when none): labels follow the drag. */
    statementPreviewDb(statementIndex) {
        const g = this._previewGain.get(statementIndex);
        return g === undefined ? 0 : g > 0 ? 20 * Math.log10(g) : -120;
    }
    /**
     * Hold sounds audible while they are edited (by `source_id`; null lets go). A game gates most
     * sounds on its own state, so the one being edited is usually silent right then: a held voice
     * reads its `volume follow` / `spl follow` at their loudest and passes its `active` hours and
     * `quiet` gates. Nothing is written, and the hold survives the reload every save makes.
     */
    holdAudible(sourceIds) {
        this._editHold.set(sourceIds);
    }
    setStatementPreviewDb(statementIndex, db) {
        if (db === null || !Number.isFinite(db) || db === 0)
            this._previewGain.delete(statementIndex);
        else
            this._previewGain.set(statementIndex, Math.pow(10, db / 20));
        for (const track of this.tracks.values()) {
            if (track.statementIndex === statementIndex)
                this._levels.writeVoiceGain(track, track._levelGain, this.ctx.currentTime);
        }
    }
    /** Audition an absolute source SPL, without taking ownership of its written value or follow binding. */
    setStatementPreviewSpl(statementIndex, db) {
        if (!this.statements[statementIndex])
            return;
        this._levels.previewSourceDb(statementIndex, db, this.ctx.currentTime);
    }
    setStatementVolume(statementIndex, volume) {
        const stmt = this.statements[statementIndex];
        if (!stmt)
            return;
        stmt.volume = RangeOrValue.single(volume);
        stmt.volumeInterpolation = null;
        stmt.groupVolumeModulation = null;
        stmt.volumeFollow = null;
        for (const track of this.tracks.values()) {
            if (track.statementIndex !== statementIndex)
                continue;
            track.volume = volume;
            const target = this.isTrackAudible(track) ? this._levels.levelGain(track, volume) : 0;
            this._levels.writeVoiceGain(track, target, this.ctx.currentTime);
        }
    }
    /**
     * Preview an uncommitted edit while a control is being dragged: parse
     * `script` and push only what a running scene absorbs in place. For a
     * statement that is its live fields (transform, extent, mix, look,
     * acoustics, DSP values); for an entity, its body's `rotate` and `scale`.
     * Nothing restarts and nothing is recorded; the caller commits the same
     * script on release, which then reloads as a no-op. Returns false when the
     * edit is structural and can only be heard after that commit.
     */
    previewEdit(script, target) {
        let scene;
        try {
            scene = parseScene(script);
        }
        catch {
            return false;
        }
        if (scene.statements.length !== this.statements.length)
            return false;
        if ('entity' in target) {
            const live = this.entityDefs.find(def => def.id === target.entity);
            const next = scene.entities.find(def => def.id === target.entity);
            if (!live || !next)
                return false;
            // Instances and runtimes hold this same object, so every frame reads the new pose.
            live.rotateDeg = next.rotateDeg;
            live.scaleFactor = next.scaleFactor;
            return true;
        }
        const j = target.statement, prev = this.statements[j], next = scene.statements[j];
        if (!prev || !next || !this.canLiveApply(prev, next))
            return false;
        this.liveApplyEdit(prev, next, j);
        return true;
    }
    /** Check if a track is audible given current mute/solo state. */
    isTrackAudible(track) {
        // A host declaration is a placement contract: unresolved slots must never
        // emit at the fallback origin (including surplus class-count voices).
        if (track.statement.hostRef && !track.pinned && !track.entityInstance)
            return false;
        const stmtIndex = track.statementIndex;
        if (this._mutedIndices.has(stmtIndex))
            return false;
        if (this._soloedIndices.size > 0 && !this._soloedIndices.has(stmtIndex))
            return false;
        return true;
    }
    /** Recalculate which tracks are audible based on mute/solo state. */
    applyMixerState() {
        for (const track of this.tracks.values()) {
            const targetGain = this.isTrackAudible(track) ? this._levels.levelGain(track, track.volume) : 0;
            this._levels.writeVoiceGain(track, targetGain, this.ctx.currentTime);
        }
    }
    // ── Internal: schedule all statements ──
    /**
     * Schedule the whole scene from `fromS` (default 0, the top).
     *
     * At a non-zero offset each voice is one of three things. A voice authored to
     * begin LATER keeps its absolute time, so the rest of the scene still unfolds
     * on schedule. A voice that would already be sounding is created AT the
     * offset rather than at its own `start` -- clamping, not skipping, because
     * dropping it would leave a scene of silence with a few late events in it.
     * And a oneshot that fires once and already fired is skipped: it happened
     * before the point you jumped to, which is the same rule the incremental
     * diff applies to a finished oneshot.
     *
     * What this does NOT do is reconstruct mid-scene state: a loop created at the
     * offset starts at its own beginning rather than 30 s into its phase, and
     * interpolations start from their heads. This is "replay from here", not a
     * seek.
     */
    scheduleAll(fromS = 0) {
        if (fromS > 0)
            this.clock.startAt(fromS);
        else
            this.clock.start();
        this.scheduler.reset();
        for (let i = 0; i < this.statements.length; i++) {
            const stmt = this.statements[i];
            if (stmt.mute)
                continue;
            // Entity members are spawned per instance by their entity, not here.
            if (stmt.entityId !== null)
                continue;
            for (let c = 0; c < stmt.count; c++) {
                const key = `${stmt.clip}_${i}_${c}`;
                const startSeconds = stmt.start.sample(this.rng);
                // Fires once and already fired: it belongs to the part being skipped.
                const firesOnce = stmt.kind === 'oneshot' && stmt.every.isNull;
                if (fromS > 0 && firesOnce && startSeconds < fromS)
                    continue;
                this.scheduler.schedule({
                    scheduledSample: this.clock.secondsToSamples(Math.max(startSeconds, fromS)),
                    type: AudioEventType.Callback,
                    trackKey: key,
                    debugLabel: `create:${stmt.clip}`,
                    onExecute: () => this.createVoice(key, stmt, i, c),
                });
            }
        }
        this._entities.start(this.entityDefs);
    }
    /** Monotonic generation for diff-scheduled voice keys — keys embed the
     * statement index, which an edit can reuse, so uniqueness needs a nonce. */
    _spawnGeneration = 0;
    // ── Version crossfades (spec 012 E2, E5) ──
    /** Seconds of the version crossfade the current diff runs under; 0 outside `loadScript({ crossfade })`. */
    _crossfadeS = 0;
    /** Statements scheduled by a crossfading diff: their voices fade in on the incoming curve. */
    _crossfadeIns = new Map();
    /** Buffers a caller holds ready (decoded versions): never evicted by a script that does not name them (E3). */
    _retained = new Set();
    /** Keep these decoded buffers through later script loads (a place's versions), or release them with `false`. */
    retainBuffers(names, retain = true) {
        for (const n of names) {
            if (retain)
                this._retained.add(n);
            else
                this._retained.delete(n);
        }
    }
    /**
     * Fade a voice out on the outgoing equal-power curve, from wherever its channel is now (a second
     * switch mid-fade continues from the current gain, never jumping), then retire it.
     */
    crossfadeOut(key, seconds) {
        const track = this.tracks.get(key);
        if (!track)
            return;
        const p = track.placeGain?.gain;
        if (!p) {
            this.stopTrack(key, seconds);
            return;
        }
        const now = this.ctx.currentTime;
        const from = holdAt(p, now);
        // the curve starts just after the hold event, which a curve may not overlap
        p.setValueCurveAtTime(equalPowerCurve(from, 'out'), now + HOLD_GAP_S, seconds);
        this.scheduler.cancelTrackEvents(key);
        track.stopping = true;
        this.logEvent('stop', track, displayNameOf(track.statement));
        this.scheduler.schedule({
            scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(seconds + 0.02),
            type: AudioEventType.Callback,
            trackKey: key + '_cleanup',
            debugLabel: `crossfade-out:${key}`,
            onExecute: () => {
                if (this.tracks.get(key) !== track)
                    return;
                this.disposeTrackNodes(track);
                if (track.dormant)
                    this._dormantVersion++;
                this.tracks.delete(key);
                this._tracksArrayDirty = true;
            },
        });
    }
    /** A voice born of a crossfading diff starts on the incoming curve, at the point the fade has reached. */
    crossfadeIn(track) {
        const entry = this._crossfadeIns.get(track.statement);
        const p = track.placeGain?.gain;
        if (!entry || !p)
            return;
        const now = this.ctx.currentTime, end = entry.t0 + entry.seconds;
        if (now >= end) {
            this._crossfadeIns.delete(track.statement);
            return;
        }
        const done = Math.max(0, (now - entry.t0) / entry.seconds);
        p.cancelScheduledValues(now);
        p.setValueCurveAtTime(equalPowerCurve(Math.sin(done * Math.PI / 2), 'in'), now, end - now);
    }
    /**
     * Apply an edited script to a RUNNING scene without restarting it.
     *
     * Identity is (kind, clip, genPrompt) with duplicate occurrences matched in
     * order; equality is the full statement fingerprint. Three outcomes:
     *
     *   - unchanged  → the OLD Statement object is spliced back into the array,
     *     so live tracks and queued scheduler closures stay valid by object
     *     identity (createVoice self-heals the index from the array). Audio is
     *     untouched — this is the whole point.
     *   - changed    → the old voice fades out quickly, its queued events are
     *     cancelled, and the new version schedules from NOW (its `start` becomes
     *     an offset from the edit, which is what "I changed the rain" means
     *     mid-listen).
     *   - added / removed → schedule from now / fade out and cancel.
     *
     * A finished oneshot whose statement is unchanged is deliberately NOT
     * rescheduled — replaying a bell that already rang because an unrelated
     * voice was edited would be a worse artefact than the restart this replaces.
     *
     * A changed `room`/`material` declaration does NOT restart: `roomsChanged`
     * re-points every voice's wet send in place (`applyLiveReverb`). This comment
     * claimed a full-restart bail-out until 2026-09-15; there has been no such
     * branch here for some time. A caller that wants the scene from the top asks
     * for it: `loadScript(script, { restart: true })`.
     */
    applyScriptDiff(prev, prevRoom, prevRoomsByName, prevEntityDefs = []) {
        const roomsFp = (m) => JSON.stringify([...(m ?? new Map())].sort((a, b) => a[0] < b[0] ? -1 : 1));
        const roomsChanged = JSON.stringify(prevRoom) !== JSON.stringify(this.scriptRoom)
            || roomsFp(prevRoomsByName) !== roomsFp(this.scriptRoomsByName);
        // Existing dry voices keep their source, phase and schedule. Repoint only
        // their wet send; the reverb pool owns outgoing bus tails.
        if (roomsChanged)
            for (const track of this.tracks.values())
                this.applyLiveReverb(track, track.statement, this.ctx.currentTime);
        const fingerprint = (st) => JSON.stringify(st);
        const idOf = (st) => `${st.entityId ?? ''}|${st.sourceId ? `source:${st.sourceId}` : `${st.kind}|${st.clip}|${st.genPrompt ?? ''}`}`;
        // An entity is unchanged when its own lines AND its members (in order)
        // are: then its live instances carry on — the members below take the
        // exact-match path, which splices the old statement objects back in.
        // A physical body's component changes are reconciled separately below;
        // its unchanged members still take the exact/live-edit matching path.
        const entityFp = (def, stmts) => JSON.stringify({ ...def, memberIndices: undefined, lineNumber: undefined, members: def.memberIndices.map(i => fingerprint(stmts[i])) });
        const prevDefById = new Map(prevEntityDefs.map(d => [d.id, d]));
        const unchangedEntities = new Map();
        for (const def of this.entityDefs) {
            const old = prevDefById.get(def.id);
            if (old && entityFp(old, prev) === entityFp(def, this.statements))
                unchangedEntities.set(def.id, def);
        }
        const pool = new Map();
        prev.forEach((st, index) => {
            const k = idOf(st);
            if (!pool.has(k))
                pool.set(k, []);
            pool.get(k).push({ stmt: st, index, fp: fingerprint(st), used: false });
        });
        this._spawnGeneration++;
        const gen = this._spawnGeneration;
        const oldKeysOf = (entry) => {
            const keys = [];
            for (let c = 0; c < entry.stmt.count; c++)
                keys.push(`${entry.stmt.clip}_${entry.index}_${c}`);
            return keys;
        };
        const stopOld = (entry) => {
            for (const key of oldKeysOf(entry)) {
                this.scheduler.cancelTrackEvents(key);
                this._pendingVoices.delete(key);
            }
            for (const [key, track] of this.tracks) {
                // Member tracks belong to their instance — the entity pass below retires them as a body.
                if (track.statement === entry.stmt && !track.entityInstance) {
                    if (this._crossfadeS > 0)
                        this.crossfadeOut(key, this._crossfadeS);
                    else
                        this.stopTrack(key, 0.15);
                }
            }
        };
        const scheduleNew = (st, index) => {
            if (st.mute)
                return; // triggers still need a parked graph before events can fire
            if (this._crossfadeS > 0)
                this._crossfadeIns.set(st, { t0: this.ctx.currentTime, seconds: this._crossfadeS });
            if (st.entityId !== null)
                return; // members are spawned by their entity
            for (let c = 0; c < st.count; c++) {
                const key = `${st.clip}_${index}_${c}g${gen}`;
                const startSeconds = st.start.sample(this.rng);
                this.scheduler.schedule({
                    scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(startSeconds),
                    type: AudioEventType.Callback,
                    trackKey: key,
                    debugLabel: `create:${st.clip}`,
                    onExecute: () => this.createVoice(key, st, index, c),
                });
            }
        };
        // Members of an unchanged entity are paired by ORDINAL with the old
        // entity's members, not by the greedy identity match below — two `loop
        // car` members would otherwise be handed to whichever old `loop car`
        // came first, and a live instance's tracks would point at statement
        // objects the array no longer holds.
        for (const [id, def] of unchangedEntities) {
            const old = prevDefById.get(id);
            for (let m = 0; m < def.memberIndices.length; m++) {
                const oldStmt = prev[old.memberIndices[m]];
                const j = def.memberIndices[m];
                this.statements[j] = oldStmt;
                const entry = (pool.get(idOf(oldStmt)) ?? []).find(o => o.stmt === oldStmt);
                if (entry)
                    entry.used = true;
                for (const track of this.tracks.values()) {
                    if (track.statement === oldStmt)
                        track.statementIndex = j;
                }
            }
        }
        for (let j = 0; j < this.statements.length; j++) {
            const next = this.statements[j];
            if (next.entityId !== null && unchangedEntities.has(next.entityId))
                continue; // paired above
            const candidates = pool.get(idOf(next)) ?? [];
            const nextFp = fingerprint(next);
            const exact = candidates.find((o) => !o.used && o.fp === nextFp);
            if (exact) {
                exact.used = true;
                this.statements[j] = exact.stmt; // object reuse keeps closures valid
                for (const track of this.tracks.values()) {
                    if (track.statement === exact.stmt)
                        track.statementIndex = j;
                }
                // A statement with no live track is not sounding. Pending events
                // (start still in the future) are left to fire — createVoice heals the
                // index. NO events and no track means it already finished; leave it.
                continue;
            }
            const edited = candidates.find((o) => !o.used);
            if (edited) {
                edited.used = true;
                // A change a running voice can ABSORB — mix, transform, extent, look,
                // acoustics — is pushed into the live nodes instead of restarting the
                // voice. A fader move must never re-fire the rain.
                if (this.canLiveApply(edited.stmt, next)) {
                    this.liveApplyEdit(edited.stmt, next, j);
                    continue;
                }
                stopOld(edited);
            }
            scheduleNew(next, j);
        }
        for (const entries of pool.values()) {
            for (const entry of entries) {
                if (!entry.used)
                    stopOld(entry); // removed from the script
            }
        }
        // EntityRuntime preserves physical bodies while reconciling their sound
        // components. Only a changed host topology replaces a physical body.
        this._entities.reconcile(this.entityDefs, new Set(unchangedEntities.keys()));
        this._tracksArrayDirty = true;
    }
    // ── Live edits: absorb a property change without restarting the voice ──
    /**
     * The properties a live track can absorb WITHOUT restarting: mix, transform,
     * extent, look, acoustics, pitch and the repeat interval — everything either re-read per tick,
     * read at the next fire (`every`), or writable onto the existing nodes (a pitch slider is heard
     * as you drag it; it used to restart the voice on every frame). Everything else (the clip, the prompt, the kind,
     * motion, timing, counts, interpolation envelopes) is structural: that voice
     * restarts, alone. Keys are Statement toJSON field names.
     */
    static LIVE_APPLY_KEYS = [
        'volume', 'volumeFollow', 'spl', 'splFollow',
        'areaMin', 'areaMax', 'rotateDeg', 'scaleFactor', 'radius', 'ringRadius',
        'staticColor', 'staticAlpha', 'visual', 'visualSize',
        'occlusionBase', 'occlusionFollow',
        'reverbParams', 'delayParams', 'filterParams', 'distortionParams', 'eqParams',
        'pitch', 'every', 'heardIn',
        'synthBrightness', 'synthBrightnessFollow', 'synthBrightnessInterpolation',
        'synthTempo', 'synthTempoFollow', 'synthTempoInterpolation',
    ];
    /** The statement with its live fields blanked — what must be EQUAL for an in-place edit. */
    structuralFingerprint(st) {
        const o = st.toJSON();
        for (const k of SatieEngine.LIVE_APPLY_KEYS)
            delete o[k];
        return JSON.stringify(o);
    }
    /**
     * Whether `next` differs from `prevSt` only in ways a running voice can
     * absorb. DSP topology is baked at voice creation (one chain per voice), so
     * an effect appearing/disappearing — or a filter/distortion MODE, which
     * lives in the node and its curve — stays structural. Members of explicit
     * physical bodies can absorb the same live parameters; EntityRuntime owns
     * structural component replacement without restarting the body.
     */
    canLiveApply(prevSt, next) {
        if (next.entityId !== null && !this.entityDefs.some(def => def.id === next.entityId && def.body))
            return false;
        if (this.structuralFingerprint(prevSt) !== this.structuralFingerprint(next))
            return false;
        if (!!prevSt.filterParams !== !!next.filterParams
            || !!prevSt.distortionParams !== !!next.distortionParams
            || !!prevSt.delayParams !== !!next.delayParams
            || !!prevSt.eqParams !== !!next.eqParams)
            return false;
        if (prevSt.filterParams && prevSt.filterParams.mode !== next.filterParams.mode)
            return false;
        if (prevSt.distortionParams && prevSt.distortionParams.mode !== next.distortionParams.mode)
            return false;
        if (prevSt.delayParams && prevSt.delayParams.pingPong !== next.delayParams.pingPong)
            return false;
        // a one-shot that starts or stops repeating is a different schedule (once vs every)
        if (prevSt.every.isNull !== next.every.isNull)
            return false;
        return true;
    }
    /**
     * Absorb an edit into the RUNNING voice: copy the live fields onto the OLD
     * statement object (which stays the identity everywhere — live tracks and
     * queued scheduler closures hold it), splice it in at the new index, and
     * push the values that were sampled at creation into the live nodes. The
     * source keeps playing throughout.
     */
    liveApplyEdit(oldSt, next, j) {
        const changed = new Set();
        for (const k of SatieEngine.LIVE_APPLY_KEYS) {
            const a = JSON.stringify(oldSt[k] ?? null);
            const b = JSON.stringify(next[k] ?? null);
            if (a !== b)
                changed.add(k);
            copyStatementField(next, oldSt, k);
        }
        this.statements[j] = oldSt;
        const ctxTime = this.ctx.currentTime;
        for (const track of this.tracks.values()) {
            if (track.statement !== oldSt)
                continue;
            track.statementIndex = j;
            // A rebalance inside a version switch glides over the same window as the crossfade.
            if (this._crossfadeS > 0) {
                track._glideUntil = ctxTime + this._crossfadeS * 1.5;
                track._glideTau = this._crossfadeS / 4;
            }
            this.applyLiveParams(track, oldSt, changed, ctxTime);
        }
    }
    /** Push creation-sampled values into a live track; per-tick reads need nothing. */
    applyLiveParams(track, stmt, changed, ctxTime) {
        // The sampled emission belongs to the authored SPL contract. Keep it for
        // unrelated edits, but discard it when the value, range or binding changes.
        const splChanged = changed.has('spl') || changed.has('splFollow');
        if (splChanged)
            track._splDb = NaN;
        if ((changed.has('volume') || changed.has('volumeFollow'))
            && !stmt.volumeFollow && !stmt.volumeInterpolation && !stmt.groupVolumeModulation) {
            track.volume = stmt.volume.sample(this.rng);
            this._levels.writeVoiceGain(track, this.isTrackAudible(track) ? this._levels.levelGain(track, track.volume) : 0, ctxTime);
        }
        if (changed.has('rotateDeg'))
            track.yawRad = stmt.rotateDeg * (Math.PI / 180);
        // a static pitch is heard at once (a modulated or followed one is the tick's); `every` needs
        // nothing here: the next fire reads it when it schedules the one after
        if (changed.has('pitch') && !stmt.pitchInterpolation && !stmt.pitchFollow) {
            track.pitch = stmt.voiceId ? 1 : stmt.pitch.sample(this.rng) * track._pitchScale;
            track.sourceNode?.playbackRate.setTargetAtTime(Math.max(0.05, track.pitch * track.doppler), ctxTime, PARAM_SMOOTHING);
        }
        if (changed.has('scaleFactor') || changed.has('radius') || changed.has('ringRadius')) {
            const extentScale = stmt.scaleFactor;
            track._radiusM = (stmt.radiusInterpolation
                ? Math.max(0, stmt.radiusInterpolation.minValue)
                : (stmt.radius.isNull ? 0 : Math.max(0, stmt.radius.sample(this.rng)))) * extentScale;
            track._ringM = (stmt.ringInterpolation
                ? Math.max(0, stmt.ringInterpolation.minValue)
                : (stmt.ringRadius.isNull ? 0 : Math.max(0, stmt.ringRadius.sample(this.rng)))) * extentScale;
        }
        if (changed.has('areaMin') || changed.has('areaMax')) {
            track.floorY = Math.min(0, stmt.areaMin.y);
            // A new `place` overrides a drag pin; hosted voices keep their perch.
            if (!stmt.hostRef)
                track.pinned = null;
        }
        if (changed.has('staticColor') || changed.has('staticAlpha')) {
            [track._staticColorR, track._staticColorG, track._staticColorB] = hexToRgb(stmt.staticColor ?? DEFAULT_VOICE_COLOR);
            if (!stmt.colorRedRange && !stmt.colorGreenRange && !stmt.colorBlueRange && stmt.staticColor) {
                track.color = stmt.staticColor;
            }
            track.alpha = stmt.staticAlpha;
        }
        if (changed.has('occlusionBase')) {
            track.occlusion = stmt.occlusionBase;
            // The placed-room tick re-smooths from the new authored value.
            track._roomOccFloor = stmt.occlusionBase;
            this._acoustics.applyMuffle(track, ctxTime, 0.08);
        }
        if (changed.has('reverbParams'))
            this.applyLiveReverb(track, stmt, ctxTime);
        if (changed.has('filterParams') || changed.has('distortionParams')
            || changed.has('delayParams') || changed.has('eqParams')) {
            this.applyLiveDsp(track, stmt, changed, ctxTime);
        }
        if (this._levels.calibrated && (splChanged || changed.has('volume'))) {
            this._levels.updateLevelPath(track, track.volume);
            this._levels.writeVoiceGain(track, this.isTrackAudible(track) ? this._levels.levelGain(track, track.volume) : 0, ctxTime);
        }
    }
    /**
     * Re-derive a live voice's reverb rung (voice reverb > named room > scene
     * room > world room) and re-point its send. The dry path is untouched — the
     * voice keeps sounding; only the wet leg re-routes.
     */
    applyLiveReverb(track, stmt, ctxTime) {
        if (!track.reverbSend || !track.reverbDry)
            return;
        const room = this._rooms.resolve(stmt);
        const { hasScriptReverb, roomSize, damping, wet } = room;
        if (!track.virtual)
            track.reverbDry.gain.setTargetAtTime(1 - wet, ctxTime, PARAM_SMOOTHING);
        try {
            track.reverbSend.disconnect();
        }
        catch { /* ok */ }
        if (track.reverbBus) {
            this.reverbBuses.release(track.reverbBus, true);
            track.reverbBus = null;
        }
        const target = this._rooms.sendTarget(room, stmt.distanceProfile);
        track.reverbBus = target.bus;
        if (!track.virtual)
            track.reverbSend.gain.setTargetAtTime(target.gain, ctxTime, PARAM_SMOOTHING);
        if (target.node)
            track.reverbSend.connect(target.node);
        track._hasScriptReverb = hasScriptReverb;
        track._reverbRoomSize = roomSize;
        track._reverbDamping = damping;
        track._reverbWet = wet;
        track._lastReverbWet = NaN;
    }
    /**
     * Write changed STATIC effect values onto the existing chain (topology and
     * mode verified equal by canLiveApply). Interpolated parameters are owned by
     * the tick (updateDSPInterpolations) and skipped here.
     */
    applyLiveDsp(track, stmt, changed, ctxTime) {
        const dsp = track.dspChain;
        if (!dsp)
            return;
        if (changed.has('filterParams') && stmt.filterParams && dsp.filterRef) {
            const fp = stmt.filterParams;
            if (!fp.cutoffInterpolation) {
                const v = fp.cutoff.sample(this.rng);
                track._lastFilterCutoff = v;
                dsp.filterRef.filter.frequency.setTargetAtTime(mapCutoff(v), ctxTime, PARAM_SMOOTHING);
            }
            if (!fp.resonanceInterpolation) {
                const v = fp.resonance.sample(this.rng);
                track._lastFilterQ = v;
                dsp.filterRef.filter.Q.setTargetAtTime(mapResonance(v), ctxTime, PARAM_SMOOTHING);
            }
            if (!fp.dryWetInterpolation) {
                const w = clamp01(fp.dryWet.sample(this.rng));
                track._lastFilterWet = w;
                dsp.filterRef.wet.gain.setTargetAtTime(w, ctxTime, PARAM_SMOOTHING);
                dsp.filterRef.dry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
            }
        }
        if (changed.has('distortionParams') && stmt.distortionParams && dsp.distortionRef) {
            const dp = stmt.distortionParams;
            if (!dp.driveInterpolation) {
                const n = dp.drive.sample(this.rng);
                const bucket = driveBucket(n);
                if (bucket !== track._lastDriveBucket) {
                    track._lastDriveBucket = bucket;
                    dsp.distortionRef.shaper.curve = makeDistortionCurve(dsp.distortionRef.mode, mapDrive(n));
                }
            }
            if (!dp.dryWetInterpolation) {
                const w = clamp01(dp.dryWet.sample(this.rng));
                track._lastDistWet = w;
                dsp.distortionRef.wet.gain.setTargetAtTime(w, ctxTime, PARAM_SMOOTHING);
                dsp.distortionRef.dry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
            }
        }
        if (changed.has('delayParams') && stmt.delayParams && dsp.delayRef) {
            const dlp = stmt.delayParams;
            if (!dlp.timeInterpolation) {
                const t = dlp.time.sample(this.rng);
                track._lastDelayTime = t;
                for (const d of dsp.delayRef.delays)
                    d.delayTime.setTargetAtTime(t, ctxTime, PARAM_SMOOTHING);
            }
            if (!dlp.feedbackInterpolation) {
                const v = dlp.feedback.sample(this.rng);
                track._lastDelayFeedback = v;
                dsp.delayRef.fbGain.gain.setTargetAtTime(v, ctxTime, PARAM_SMOOTHING);
            }
            if (!dlp.dryWetInterpolation) {
                const w = clamp01(dlp.dryWet.sample(this.rng));
                track._lastDelayWet = w;
                dsp.delayRef.wet.gain.setTargetAtTime(w, ctxTime, PARAM_SMOOTHING);
                dsp.delayRef.dry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
            }
        }
        if (changed.has('eqParams') && stmt.eqParams && dsp.eqRef) {
            const eq = stmt.eqParams;
            if (!eq.lowGainInterpolation) {
                const v = eq.lowGain.sample(this.rng);
                track._lastEQLow = v;
                dsp.eqRef.low.gain.setTargetAtTime(mapEQGain(v), ctxTime, PARAM_SMOOTHING);
            }
            if (!eq.midGainInterpolation) {
                const v = eq.midGain.sample(this.rng);
                track._lastEQMid = v;
                dsp.eqRef.mid.gain.setTargetAtTime(mapEQGain(v), ctxTime, PARAM_SMOOTHING);
            }
            if (!eq.highGainInterpolation) {
                const v = eq.highGain.sample(this.rng);
                track._lastEQHigh = v;
                dsp.eqRef.high.gain.setTargetAtTime(mapEQGain(v), ctxTime, PARAM_SMOOTHING);
            }
        }
    }
    /** `logStops` false on a replay (`restartAt`): those voices never happened after the new now, so no end is written. */
    teardownAll(logStops = true) {
        this._programs.reset();
        this.scheduler.reset();
        this._pendingVoices.clear();
        // Requests still WAITING serve voices that may not survive this teardown —
        // drop them (they reject as cancelled, quietly). In-flight ones finish and
        // land in audioBuffers, still valid if the voice returns. A voice that
        // lives on re-requests at its next demand, or via play()'s prewarm.
        this._gen.cancelQueued();
        this._triggerLastFired.clear();
        this._triggerLastTake.clear();
        // Entity instances die with their tracks; their spawner chains are
        // already gone with the scheduler, and orphaned closures see `alive` off.
        this._entities.dropAll();
        // Every voice ends here, and the timeline must see it end: a bar opened by
        // `start` with no `stop` reads as playing now, forever (2026-10-01: a cafe's
        // timeline listed the landing page's jungle and city loops as live lanes).
        for (const track of this.tracks.values()) {
            if (logStops && !track.stopping)
                this.logEvent('stop', track, displayNameOf(track.statement));
            this.disposeTrackNodes(track);
        }
        this.tracks.clear();
        this._tracksArrayDirty = true;
        this._hasAttachments = false;
        // Second pass: force-stop any source that wasn't reachable through a track
        // (e.g. an async retrigger created a source then the track was cleared, or
        // an orphan was never assigned to track.sourceNode for some reason). This is
        // a safety net — the per-track loop above should normally cover everything.
        for (const src of this._activeSources) {
            try {
                src.stop();
            }
            catch { /* ok — already stopped or never started */ }
            try {
                src.disconnect();
            }
            catch { /* ok */ }
        }
        this._activeSources.clear();
    }
    // ── Tick loop ──
    tick = () => {
        if (!this._isPlaying)
            return;
        const now = performance.now();
        for (const callback of this.audioTickObservers)
            callback(this.currentTime);
        // Process any due scheduler events
        this.scheduler.process();
        // Update continuous track state (spatial, interpolation)
        // Spatial updates are rate-limited; interpolation runs every frame for smoothness
        const doSpatial = now - this._lastSpatialUpdate >= SPATIAL_INTERVAL;
        this.updateTracks(doSpatial, (now - this._lastSpatialUpdate) / 1000);
        if (doSpatial)
            this._lastSpatialUpdate = now;
        // Throttle React UI notifications
        if (now - this._lastUINotify >= UI_NOTIFY_INTERVAL) {
            this._lastUINotify = now;
            this.notifyUI();
        }
        this.animFrameId = requestAnimationFrame(this.tick);
    };
    /**
     * One headless step: run the scheduler's due events, then one spatial
     * tick of `dtSec` (hosting, entities, kinematics, follow bindings,
     * activity gates, Doppler, foliage — everything the RAF tick does for the
     * audio state; no UI notification). The caller advances the audio
     * context's clock by `dtSec` BEFORE calling this, so scheduled events and
     * elapsed-time modulation see the same time the tick does. Idle unless
     * playing. Not rate-limited: every call is a spatial tick.
     */
    advance(dtSec) {
        if (!this._isPlaying)
            return;
        for (const callback of this.audioTickObservers)
            callback(this.currentTime);
        this.scheduler.process();
        this.updateTracks(true, dtSec);
    }
    // ── Voice lifecycle ──
    createVoice(key, stmt, statementIndex, voiceIndex, member) {
        // Scheduled closures capture the index the statement had when they were
        // queued; an incremental reload can move statements. The array holds the
        // SAME object across reloads for unchanged voices (applyScriptDiff reuses
        // them for exactly this reason), so identity lookup self-heals the index.
        const liveIndex = this.statements.indexOf(stmt);
        if (liveIndex >= 0)
            statementIndex = liveIndex;
        if (!this._isPlaying)
            return;
        // A member of a retired instance (its phase-delayed creation outlived the body) never starts.
        if (member && member.inst.phase === 'done')
            return;
        const gainNode = this.ctx.createGain();
        // Static attenuator: when N voices share an AudioBuffer (count-multiplied
        // statements), coherent summing produces N× amplitude. The master limiter
        // then pumps the entire signal. Scaling each voice by 1/sqrt(N) keeps
        // perceived loudness similar while letting the limiter only catch transients.
        const scaleGain = this.ctx.createGain();
        scaleGain.gain.value = stmt.count > 1 && !stmt.programId ? 1 / Math.sqrt(stmt.count) : 1;
        const pannerNode = this.ctx.createPanner();
        pannerNode.panningModel = 'HRTF';
        pannerNode.distanceModel = 'inverse';
        pannerNode.refDistance = PANNER_REF_M;
        // No maxDistance: it is part of the `linear` distance formula only and is
        // inert under `inverse`. See the note in WorldAcoustics.
        pannerNode.rolloffFactor = distanceRolloff(stmt.line, stmt.distanceProfile);
        pannerNode.coneInnerAngle = 360;
        pannerNode.coneOuterAngle = 360;
        pannerNode.coneOuterGain = 0;
        // Field voices are spatially extended (rain, wind): direction without
        // distance attenuation — the tick pins their position to the listener at
        // the scripted offset, and rolloff 0 removes the point-source falloff.
        if (stmt.field)
            pannerNode.rolloffFactor = 0;
        // Lines use the same reduced inverse rolloff in both legs and reports.
        // This is an authored propagation approximation, not a calibrated line integral.
        // Use positionX/Y/Z AudioParams instead of deprecated setPosition
        pannerNode.positionX.value = 0;
        pannerNode.positionY.value = 0;
        pannerNode.positionZ.value = 0;
        // Build DSP chain from statement params (native Web Audio nodes — zero JS overhead)
        const dspChain = buildDSPChain(this.ctx, {
            filter: stmt.filterParams,
            distortion: stmt.distortionParams,
            delay: stmt.delayParams,
            eq: stmt.eqParams,
        });
        // Audio routing: source → gain → scaleGain → [DSP chain] → tap
        const triggerGainNode = stmt.kind === 'trigger' ? this.ctx.createGain() : null;
        if (triggerGainNode) {
            gainNode.connect(triggerGainNode);
            triggerGainNode.connect(scaleGain);
        }
        else
            gainNode.connect(scaleGain);
        if (dspChain)
            scaleGain.connect(dspChain.input);
        // The governed level sits after the DSP chain (see TrackState.levelNode).
        const levelNode = this.ctx.createGain();
        levelNode.gain.value = 1;
        (dspChain ? dspChain.output : scaleGain).connect(levelNode);
        // The place channel (spec 012 E1): every leg below leaves from here.
        const placeGain = this.ctx.createGain();
        placeGain.gain.value = 1;
        levelNode.connect(placeGain);
        const tap = placeGain;
        // Reverb splits the tap in two: a dry path that keeps travelling through
        // the panner (distance + HRTF), and a send that skips the panner for the
        // shared room bus. The send is tapped pre-occlusion — occlusion is a
        // property of the listener's line of sight, not of how much energy the
        // source pours into the room.
        // Ladder (WorldRoom.resolve): voice reverb > named room > the placed room
        // the listener stands in > scene room > measured world room. A declared
        // room is authorship too, so the world room leaves those voices alone.
        const room = this._rooms.resolve(stmt);
        const { hasScriptReverb, roomSize, damping, wet } = room;
        let reverbBus = null;
        // Every voice gets the split, scripted or not. Building it only for voices
        // with `reverb` meant a world's ambience bed and its `on step` / `on land`
        // body voices stayed bone dry in every room, because world scripts put
        // `reverb` on the `scene` group alone.
        const reverbSend = this.ctx.createGain();
        const reverbDry = this.ctx.createGain();
        reverbDry.gain.value = 1 - wet;
        // Source extent (SourceExtent.ts): the dry path splits into a POINT leg
        // (through the HRTF panner, today's behavior) and a WIDE leg (into the
        // shared decorrelated stereo bus), crossfaded equal-power by how much of
        // the auditory scene the source occupies. Sampled per voice:
        // A modulated size owns the parameter: its first value is the size at
        // t=0, and the spatial tick drives it from there (see updateExtentSize).
        // `scale` multiplies the source's EXTENT and nothing else (scene-graph
        // spec §3): a 2× fountain is a bigger ring, never a louder one.
        const extentScale = stmt.scaleFactor;
        const radiusM = (stmt.radiusInterpolation
            ? Math.max(0, stmt.radiusInterpolation.minValue)
            : (stmt.radius.isNull ? 0 : Math.max(0, stmt.radius.sample(this.rng)))) * extentScale;
        const ringM = (stmt.ringInterpolation
            ? Math.max(0, stmt.ringInterpolation.minValue)
            : (stmt.ringRadius.isNull ? 0 : Math.max(0, stmt.ringRadius.sample(this.rng)))) * extentScale;
        const isBed = stmt.bed;
        const pointGain = this.ctx.createGain();
        const wideGain = this.ctx.createGain();
        // Beds are wide-only from the first sample; everything else starts as a
        // point and the first spatial tick takes over.
        pointGain.gain.value = isBed ? 0 : 1;
        wideGain.gain.value = isBed ? 1 : 0;
        tap.connect(reverbDry);
        reverbDry.connect(pointGain);
        // Ground reflection: the point leg reaches the panner twice — straight,
        // and through the image path off the floor (ElevationCues). The trim
        // keeps the in-phase sum at the source's level; the tick drives both.
        const directTrim = this.ctx.createGain();
        directTrim.gain.value = 1;
        pointGain.connect(directTrim);
        directTrim.connect(pannerNode);
        // No leg for beds, fields, or EXTENDED sources (radius / ring / line): a
        // fountain or a shoreline reflects from everywhere at once, incoherently;
        // one clean image of it is a comb, not a cue. Points (a bird, a bell) get
        // the leg, through its own panner at the image point (ElevationCues).
        const extended = !stmt.radius.isNull || !stmt.ringRadius.isNull || stmt.line || !!stmt.radiusInterpolation || !!stmt.ringInterpolation;
        const floorLeg = (isBed || stmt.field || extended) ? null : createReflectionLeg(this.ctx, directTrim, this.masterGain, createImagePanner(this.ctx, pannerNode));
        reverbDry.connect(wideGain);
        // Bed colour (spec 006): a bed is dark the way recordings are, a high shelf on its wide leg.
        const bedShelf = isBed && bedTiltDb(stmt.tilt) !== 0 ? this.ctx.createBiquadFilter() : null;
        if (bedShelf) {
            bedShelf.type = 'highshelf';
            bedShelf.frequency.value = BED_SHELF_HZ;
            bedShelf.gain.value = bedTiltDb(stmt.tilt);
            wideGain.connect(bedShelf);
            bedShelf.connect(this.ensureWideBus().input);
        }
        else {
            wideGain.connect(this.ensureWideBus().input);
        }
        tap.connect(reverbSend);
        // Precedence: THE AUTHOR WINS, MEASUREMENT FILLS THE GAPS — the same rule
        // as everywhere else in the pipeline. A voice whose script asked for
        // `reverb` keeps its own room even while a world room is active: an
        // authored space is a creative decision, and realism must not overwrite
        // it. The world room claims only the voices that never asked for one
        // (ambience beds, footsteps), which is exactly where measurement belongs.
        // (This used to be inverted — "a world room outranks the script's" — which
        // made composing inside a world impossible.)
        const sendTarget = this._rooms.sendTarget(room, stmt.distanceProfile);
        reverbBus = sendTarget.bus;
        reverbSend.gain.value = sendTarget.gain;
        if (sendTarget.node)
            reverbSend.connect(sendTarget.node);
        pannerNode.connect(this.masterGain);
        // Pre-parse static color channels once
        const [scR, scG, scB] = hexToRgb(stmt.staticColor ?? DEFAULT_VOICE_COLOR);
        const seed = this.rng() * 1000;
        // Fly/walk and trajectories use different speed curves — mapSpeed's
        // aggressive exponential is unusable for LUT trajectories at high inputs.
        // A compiled `path` states its exact traversal rate (cycles/sec); the
        // sample() is still drawn so seeded RNG streams stay aligned either way.
        const wanderSample = stmt.wanderHz.sample(this.rng);
        const wanderHz = isTrajectoryWanderType(stmt.wanderType)
            ? (stmt.trajectoryCycleHz ?? mapTrajectorySpeed(wanderSample))
            : mapSpeed(wanderSample);
        const track = {
            key,
            statementIndex,
            voiceIndex,
            statement: stmt,
            sourceNode: null,
            virtual: false,
            gainNode,
            triggerGainNode,
            _triggerSpareFamily: null,
            _triggerAtContact: false,
            surfaceDistanceM: 0,
            sourceExtentDeg: 0,
            scaleGain,
            pannerNode,
            position: { x: 0, y: 0, z: 0 },
            apparent: null,
            _interiorRouted: false,
            pinned: null,
            pending: false,
            dormant: false,
            stopping: false,
            isPlaying: true,
            startedAt: this.clock.currentTime,
            volume: stmt.volume.sample(this.rng),
            pitch: stmt.voiceId ? 1 : stmt.pitch.sample(this.rng),
            color: this.sampleInitialColor(stmt),
            alpha: stmt.staticAlpha,
            dspChain,
            reverbSend,
            reverbDry,
            reverbBus,
            pointGain,
            wideGain,
            levelNode,
            placeGain,
            directTrim,
            floorLeg,
            ceilingLeg: null,
            _heard: { x: 0, y: 0, z: 0 },
            _lastDirectTrim: 1,
            yawRad: stmt.rotateDeg * (Math.PI / 180),
            _radiusM: radiusM,
            _ringM: ringM,
            _scatter: this.drawScatter(stmt, member ? true : false),
            _line: stmt.line && !stmt.hostRef ? lineFromBox(stmt.areaMin, stmt.areaMax) : null,
            _bed: isBed,
            _lastPointG: isBed ? 0 : 1,
            _lastWideG: isBed ? 1 : 0,
            _hasScriptReverb: hasScriptReverb,
            _transmissionBlocked: stmt.transmissionBlocked,
            _lastTransmissionGain: 1,
            _reverbRoomSize: roomSize,
            _reverbDamping: damping,
            _reverbWet: wet,
            occlusionFilter: null,
            occlusionGainNode: null,
            occlusion: stmt.occlusionBase,
            _roomOccFloor: stmt.occlusionBase,
            // Scene ground plane at y=0; authored negative bounds opt out (cave/underwater)
            floorY: Math.min(0, stmt.areaMin.y),
            doppler: 1,
            _lastDistM: -1,
            _hostBindX: NaN,
            _hostBindZ: NaN,
            _radialV: 0,
            _whenInside: false,
            _whenLastDist: -1,
            _immersion: 0,
            _lastMediumSub: NaN,
            _dopplerActive: false,
            _lastCutoffHz: NaN,
            _lastOccGain: NaN,
            _zoneMuted: false,
            _zoneOcclusion: 0,
            _retriggerGen: 0,
            _lastFilterCutoff: NaN, _lastFilterQ: NaN, _lastFilterWet: NaN,
            _lastDriveBucket: -1, _lastDistWet: NaN,
            _lastDelayTime: NaN, _lastDelayFeedback: NaN, _lastDelayWet: NaN,
            _lastReverbWet: NaN,
            _lastEQLow: NaN, _lastEQMid: NaN, _lastEQHigh: NaN,
            seed,
            wanderHz,
            // Pre-cache interpolation durations and ease functions
            _cachedDurations: new Map(),
            _staticColorR: scR,
            _staticColorG: scG,
            _staticColorB: scB,
            // Pre-compute wander phase offsets
            _seeds: pathSeedsFor(seed),
            _wanderSpeed: wanderHz * 0.01 * 2 * Math.PI,
            // An authored path starts at its first waypoint; the draw still happens
            // so adding a path to a script never shifts any other seeded value.
            _trajectoryPhase: stmt.trajectoryPhaseZero ? (this.rng(), 0) : this.rng(),
            hostId: null,
            entityInstance: null,
            _member: -1,
            _pitchScale: 1,
            _scaleBase: stmt.count > 1 && !stmt.programId ? 1 / Math.sqrt(stmt.count) : 1,
            _activity: 1,
            _foliage: 0,
            _variant: -1,
            _splDb: NaN,
            _emissionDb: NaN,
            _receivedDb: NaN,
            _levelGain: 0,
            _pathGain: 1,
            _lastPathGain: 1,
            _fadeEndT: 0,
            _sourceEndT: Infinity,
            _passActive: false,
            _passArc0: 0,
            _passDir: 1,
            _passSpeed: 0,
            _passT0: 0,
            _passEnd: 0,
            _passLen: 0,
        };
        // Pre-cache durations for all modulations on this voice
        this.cacheInterpolation(track, stmt.volumeInterpolation);
        this.cacheInterpolation(track, stmt.pitchInterpolation);
        this.cacheInterpolation(track, stmt.groupVolumeModulation);
        this.cacheInterpolation(track, stmt.groupPitchModulation);
        this.cacheInterpolation(track, stmt.radiusInterpolation);
        this.cacheInterpolation(track, stmt.ringInterpolation);
        this.cacheInterpolation(track, stmt.colorRedInterpolation);
        this.cacheInterpolation(track, stmt.colorGreenInterpolation);
        this.cacheInterpolation(track, stmt.colorBlueInterpolation);
        this.cacheInterpolation(track, stmt.colorAlphaInterpolation);
        // DSP interpolations
        if (stmt.filterParams) {
            this.cacheInterpolation(track, stmt.filterParams.cutoffInterpolation);
            this.cacheInterpolation(track, stmt.filterParams.resonanceInterpolation);
            this.cacheInterpolation(track, stmt.filterParams.dryWetInterpolation);
        }
        if (stmt.distortionParams) {
            this.cacheInterpolation(track, stmt.distortionParams.driveInterpolation);
            this.cacheInterpolation(track, stmt.distortionParams.dryWetInterpolation);
        }
        if (stmt.delayParams) {
            this.cacheInterpolation(track, stmt.delayParams.timeInterpolation);
            this.cacheInterpolation(track, stmt.delayParams.feedbackInterpolation);
            this.cacheInterpolation(track, stmt.delayParams.dryWetInterpolation);
        }
        if (stmt.reverbParams) {
            this.cacheInterpolation(track, stmt.reverbParams.dryWetInterpolation);
        }
        if (stmt.eqParams) {
            this.cacheInterpolation(track, stmt.eqParams.lowGainInterpolation);
            this.cacheInterpolation(track, stmt.eqParams.midGainInterpolation);
            this.cacheInterpolation(track, stmt.eqParams.highGainInterpolation);
        }
        this.tracks.set(key, track);
        if (this._crossfadeIns.size)
            this.crossfadeIn(track);
        this._tracksArrayDirty = true;
        if (stmt.attachRef || stmt.followTarget)
            this._hasAttachments = true;
        // Apply mixer mute/solo state to new voice
        if (!this.isTrackAudible(track)) {
            track.gainNode.gain.value = 0;
        }
        // A voice spawning into an active scene state (or with a static base
        // occlusion) starts already gated — no first-tick pop.
        this.applyZoneState(track);
        if (track._zoneMuted || track._zoneOcclusion > 0 || track.occlusion > 0) {
            this._acoustics.applyMuffle(track, this.ctx.currentTime, 0.05);
        }
        // A scattered voice with no placement at all (`scatter` and no `place`,
        // no `move`) never enters the position path, so seat it on its point here.
        if (track._scatter && stmt.wanderType === WanderType.None)
            this.applyScatter(track);
        // Hosted voices sit on their object from the first frame, buffer or not,
        // so the viewport shows a pending bird in its tree rather than at the origin.
        if (this.hostAvailable(stmt.hostRef))
            this.rehostTrack(track, stmt);
        // An entity member is pinned to its instance's body from the first
        // frame and carries the instance's pitch offset into every take.
        if (member) {
            const inst = member.inst;
            track.entityInstance = inst;
            track._member = member.m;
            track._pitchScale = stmt.voiceId ? 1 : inst.pitchOffset;
            track.pinned = { x: inst.position.x, y: inst.position.y, z: inst.position.z };
            track.position.x = inst.position.x;
            track.position.y = inst.position.y;
            track.position.z = inst.position.z;
            inst.tracks[member.m] = track;
            if (inst.behavior) {
                track._activity = this._editHold.held(stmt) ? 1 : this.activityOf(stmt.activeHours, stmt.quietGates, track);
                track.scaleGain.gain.value = track._scaleBase * track._activity;
            }
        }
        // Level model: the emission the script states, and this voice's path —
        // after the member pin, so a `spl follow velocity` reads its body. A
        // placed / moving voice is put where it starts first: its received level
        // seeds the window top when it is the first to sound, and a reading from
        // the origin would hold the top too high for a release time.
        if (this._levels.calibrated) {
            if (!track.pinned && !stmt.field && stmt.wanderType !== WanderType.None) {
                if (isTrajectoryWanderType(stmt.wanderType))
                    this.calculateTrajectoryPositionInPlace(track, stmt, 0);
                else
                    this.calculateWanderPositionInPlace(track, stmt, 0);
            }
            this._levels.updateLevelPath(track, track.volume);
        }
        // Fire first audio trigger — unless lazy generation finds the state does
        // not need this sound now or within the horizon: then the voice is
        // DORMANT (a track with a position and a label, no request, no source)
        // until the demand tick wakes it. A clip that already landed costs
        // nothing to play, so it is never held back.
        if (this.lazyGeneration && this.isLazyCandidate(stmt) && !this.hasAnyTake(stmt) && this.demandFor(stmt, track, DEMAND_HORIZON_S) <= 0) {
            track.dormant = true;
            track.pending = true;
            this._dormantVersion++;
        }
        else {
            this.retriggerAudio(key, stmt);
        }
        // Schedule voice end
        if (stmt.kind !== 'trigger' && !stmt.duration.isNull) {
            const dur = stmt.duration.sample(this.rng);
            const fadeOut = !stmt.fadeOut.isNull ? stmt.fadeOut.sample(this.rng) : 0;
            this.scheduler.schedule({
                scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(dur),
                type: AudioEventType.Callback,
                trackKey: key,
                debugLabel: `end:${stmt.clip}`,
                onExecute: () => this.stopTrack(key, fadeOut),
            });
        }
        else if (!stmt.end.isNull) {
            const endTime = stmt.end.sample(this.rng);
            const endFade = !stmt.endFade.isNull ? stmt.endFade.sample(this.rng) : 0;
            this.scheduler.schedule({
                scheduledSample: this.clock.secondsToSamples(endTime),
                type: AudioEventType.Callback,
                trackKey: key,
                debugLabel: `end:${stmt.clip}`,
                onExecute: () => this.stopTrack(key, endFade),
            });
        }
    }
    /** Cache the sampled 'every' duration for a modulation. */
    cacheInterpolation(track, interp) {
        if (!interp)
            return;
        track._cachedDurations.set(interp, interp.every.sample(this.rng));
    }
    voiceSource(track, buffer) {
        const asset = synthAssetFor(buffer);
        if (track.statement.synth && asset && !this.headless) {
            return new LiveSynthSource(this.ctx, asset, message => {
                this.addRuntimeWarning(`${displayNameOf(track.statement)}: ${message}`);
            });
        }
        if (track.statement.synth && !asset)
            this.addRuntimeWarning(`${displayNameOf(track.statement)}: this older synth take is baked audio. Regenerate it for live synthesis.`);
        return this.ctx.createBufferSource();
    }
    updateSynthControls(track, elapsed) {
        const source = track.sourceNode;
        if (!(source instanceof LiveSynthSource) || track.stopping)
            return;
        this.writeSynthControl(track, source, 'brightness', elapsed);
        this.writeSynthControl(track, source, 'tempo', elapsed);
    }
    writeSynthControl(track, source, name, elapsed) {
        const stmt = track.statement;
        const range = name === 'brightness' ? stmt.synthBrightness : stmt.synthTempo;
        const follow = name === 'brightness' ? stmt.synthBrightnessFollow : stmt.synthTempoFollow;
        const interp = name === 'brightness' ? stmt.synthBrightnessInterpolation : stmt.synthTempoInterpolation;
        let value = source.sampleControl(name, range, this.rng);
        if (follow) {
            const signal = this.signalValue(track, follow.signal);
            if (Number.isFinite(signal))
                value = mapFollow(follow, signal);
        }
        else if (interp)
            value = this.evalInterpCached(track, interp, elapsed);
        source.setControl(name, value);
    }
    // ── Audio clip triggering ──
    /**
     * `fire` distinguishes a trigger voice's two lifecycles: buffer arrival
     * (load + go quiet, pending → ready) vs an actual event fire (start audio).
     * `clipOverride` plays a different cached buffer through the same track —
     * used by template trigger voices whose gen prompt substitutes `{text}`.
     */
    retriggerAudio(key, stmt, fire = false, clipOverride, predicted = false, eventPayload, programEvent) {
        if (!this._isPlaying)
            return;
        const programIssue = stmt.programId ? this._programs.issue(stmt.programId) : undefined;
        if (programIssue) {
            this.addRuntimeWarning(programIssue);
            return;
        }
        const track = this.tracks.get(key);
        if (!track)
            return;
        const clipPath = clipOverride ?? takeClipPath(stmt, 0);
        const currentProgram = stmt.programId ? this._programs.current(stmt, key, programEvent) : undefined;
        let buffer = currentProgram?.buffer ?? this.audioBuffers.get(clipPath) ?? (!stmt.recordings?.takes && !clipOverride ? this.audioBuffers.get(stmt.clip) : undefined);
        if (currentProgram)
            track._variant = currentProgram.take;
        // A clip that landed by any route (a sibling statement's request, the
        // library) ends dormancy — there is nothing left to hold back.
        if (buffer && track.dormant) {
            track.dormant = false;
            this._dormantVersion++;
        }
        // A pooled voice (`variants N`) plays whichever of its takes has landed:
        // a random one per oneshot fire, never the one that just played; a loop
        // settles on one at load. Missing takes never hold the first sound back.
        if (!currentProgram && takeCount(stmt) > 1 && !clipOverride) {
            const k = this.pickVariant(track, stmt, fire || stmt.kind !== 'trigger');
            buffer = k >= 0 ? this.variantBuffer(stmt, k) : undefined;
            if (k >= 0)
                track._variant = k;
        }
        // Trigger voices load their audio like anyone else but only SOUND when
        // fired — a buffer arriving is not an event.
        if (buffer && stmt.kind === 'trigger' && !fire) {
            track.pending = false;
            return;
        }
        // Template trigger voices ({text} in the prompt) resolve audio per fire;
        // there is nothing to pre-load, so they are "ready" as parked.
        if (!buffer && stmt.kind === 'trigger' && !fire && stmt.genPrompt?.includes('{')) {
            track.pending = false;
            return;
        }
        if (!buffer) {
            // Supplied banks wait for their exact assets. Neither the authored prompt nor
            // an obsolete base clip may replace an accepted recording.
            if (!clipOverride && stmt.recordings?.takes) {
                track.pending = stmt.recordings.takes.length > 0;
                for (const clip of stmt.recordings.takes) {
                    const queue = this._pendingVoices.get(clip) ?? [];
                    if (!queue.some(p => p.key === key)) {
                        queue.push({ key, stmt });
                        this._pendingVoices.set(clip, queue);
                    }
                }
                return;
            }
            track.pending = true;
            // Dormant: the state does not need this sound yet. The demand tick
            // is the only path that requests it (it clears the flag first).
            if (track.dormant)
                return;
            // A take pool requests every missing take; the first to land starts the voice.
            if (stmt.isGenerated && stmt.genPrompt && stmt.variants > 1 && !clipOverride) {
                this._gen.requestVariantTakes(key, stmt, predicted);
                return;
            }
            // If generation is already in-flight for this clip, don't re-request —
            // but a fire finding no buffer means the sound is overdue: re-rank a
            // request still waiting in the queue.
            if (this._gen.isInFlight(clipPath)) {
                this._gen.bumpDemanded(clipPath, stmt);
                return;
            }
            if (stmt.isGenerated && stmt.genPrompt) {
                // Community-first: try finding a matching community sample before generating
                if (this._gen.standInFirst(predicted))
                    void this._gen.communityThenGenerate(key, stmt, clipPath, 0, predicted);
                else
                    void this._gen.generateAndRetrigger(key, stmt, clipPath);
                return;
            }
            // Try resolving via onMissingBuffer callback (e.g. community samples)
            if (this.onMissingBuffer) {
                this.resolveAndRetrigger(key, stmt, clipPath);
                return;
            }
            // Buffer is from a plain user-uploaded sample that hasn't finished
            // decoding yet (common when the user hits Run immediately after opening
            // a sketch with a long MP3). Queue this voice to retry when the buffer
            // arrives via loadAudioBuffer/loadAudioFile.
            const queue = this._pendingVoices.get(clipPath) ?? [];
            if (!queue.some(p => p.key === key)) {
                queue.push({ key, stmt });
                this._pendingVoices.set(clipPath, queue);
            }
            return;
        }
        // A timed call of a population individual sounds only from a calling
        // bout, and only when the entity's chorus arbiter has a slot for it
        // (callers / gap): otherwise it waits and asks again in a moment.
        if (stmt.kind === 'oneshot' && !stmt.every.isNull && track.entityInstance?.agent && !this._entities.agentMayCall(track.entityInstance)) {
            track.pending = false;
            this.scheduleCallRetry(key, stmt, track);
            return;
        }
        if (track.sourceNode) {
            try {
                track.sourceNode.stop();
            }
            catch { /* ok */ }
            try {
                track.sourceNode.disconnect();
            }
            catch { /* ok */ }
            this._activeSources.delete(track.sourceNode);
            track.sourceNode = null;
        }
        // A hosted voice sits on a world object: oneshots re-pick a class
        // instance every fire (the chorus moves between trees), loops settle once.
        if (!track._triggerAtContact && this.hostAvailable(stmt.hostRef) && (stmt.kind !== 'loop' || !track.pinned)) {
            this.rehostTrack(track, stmt);
        }
        // Same rule for `scatter`, and it is what makes an emitter: a one-shot
        // draws a new point from its distribution on every fire, so twenty leaves
        // a second come from twenty places rather than one.
        this.redrawScatter(track, stmt);
        const sourceNode = this.voiceSource(track, buffer);
        // A looping voice plays the seamless version of its buffer (dsp/SeamlessLoop):
        // trimmed of MP3 padding, ended where it matches its start, tail crossfaded
        // into head. Made once per buffer; one-shots play the original.
        let playBuffer = currentProgram?.buffer ?? (stmt.kind === 'loop' && !stmt.synth ? this.seamlessLoopOf(buffer) : buffer);
        sourceNode.loop = stmt.kind === 'loop';
        sourceNode.connect(track.gainNode);
        this._activeSources.add(sourceNode);
        // Phase stagger for count-multiplied voices sharing this buffer.
        // Without it, N coherent copies sum 1:1 in phase → comb filtering and limiter
        // pumping. We offset each voice by a tiny fraction of the buffer (≤ 30ms, ≤
        // 5% of duration, only for buffers > 1s so percussive hits stay tight).
        // User-set `randomstart` overrides this — their intent wins.
        let startOffsetSeconds = 0;
        // Several LOOPS on one buffer (separate statements with the same prompt,
        // or copies whose takes collapsed to one) must not run in phase: coherent
        // copies from different positions sum as a comb filter, heard as a phaser
        // that sweeps as the listener walks. Every further loop on a buffer that is
        // already playing starts at a decorrelated point of it (golden-ratio
        // spacing keeps N starts as far apart as N allows).
        const alreadyLooping = sourceNode.loop && playBuffer.duration > 2 ? this.liveLoopsOn(playBuffer, track) : 0;
        if (!stmt.programId && !stmt.randomStart && alreadyLooping > 0) {
            startOffsetSeconds = ((alreadyLooping * 0.6180339887) % 1) * playBuffer.duration;
        }
        else if (!stmt.programId && !stmt.randomStart && stmt.count > 1 && playBuffer.duration > 1 && track.voiceIndex > 0) {
            const maxStagger = Math.min(playBuffer.duration * 0.05, 0.03);
            startOffsetSeconds = (track.voiceIndex / stmt.count) * maxStagger;
        }
        let volume = stmt.volume.sample(this.rng);
        if (stmt.volumeFollow) {
            const signal = this._editHold.signalFor(stmt, stmt.volumeFollow.signal) ?? this.signalValue(track, stmt.volumeFollow.signal);
            if (!isNaN(signal))
                volume = mapFollow(stmt.volumeFollow, signal);
            // an event that fires while its level's signal maps to zero plays silent: say so, once per message
            if (stmt.kind === 'trigger' && stmt.eventName && volume <= 1e-3)
                this.addRuntimeWarning(`on ${stmt.eventName} fired at zero level: its volume follows ${stmt.volumeFollow.signal} (${Math.round(signal * 100) / 100} when it fired). Set that signal after firing the event, or do not tie this sound's level to it.`);
        }
        // An entity member's pitch is the statement's sample times its
        // instance's offset — one voice per body, consistent for its whole life.
        // a loudness range varies per play (it was drawn once per voice, so every bark was as loud)
        if (fire && !stmt.programId && !stmt.splFollow && !stmt.spl.isNull && stmt.spl.min !== stmt.spl.max) {
            track._splDb = NaN;
            if (this._levels.calibrated)
                this._levels.updateLevelPath(track, track.volume);
        }
        let pitch = currentProgram?.pitch ?? stmt.pitch.sample(this.rng) * track._pitchScale;
        if (stmt.pitchFollow) {
            const signal = this.signalValue(track, stmt.pitchFollow.signal);
            if (!isNaN(signal))
                pitch = mapFollow(stmt.pitchFollow, signal) * track._pitchScale;
        }
        // Fired events humanize by default: when the script authored no variation
        // range of its own, every fire gets a subtle random pitch/level offset so
        // repeated events never sound stamped from one mold. Authored ranges win
        // (they already resample per fire, just above).
        if (fire && !stmt.programId) {
            if (!stmt.pitch.isRange && !stmt.pitchFollow) {
                pitch *= 1 - TRIGGER_HUMANIZE_PITCH + this.rng() * 2 * TRIGGER_HUMANIZE_PITCH;
            }
            if (!stmt.volume.isRange && !stmt.volumeFollow) {
                volume = Math.max(0, volume + (this.rng() - 0.5) * TRIGGER_HUMANIZE_LEVEL);
            }
        }
        // A voice line plays at the pitch it was spoken: a shifted voice is the
        // first thing listeners name as fake (places-v3, 2026-10-20).
        if (stmt.voiceId)
            pitch = 1;
        // `spread` — this instance's start DELAY. Without it, `40 * oneshot crow`
        // fires forty crows on the same sample and the flock reads as one loud
        // bird; a few hundred milliseconds of scatter in TIME is what makes a
        // group of sources sound like a group. Everything below is anchored on
        // `now`, so shifting it delays the envelope and the source together —
        // starting the buffer late against an envelope that already began would
        // drop the voice in partway through its own fade.
        let spreadS = currentProgram || stmt.spread.isNull
            ? 0
            : Math.max(0, Math.min(SPREAD_MAX_S, stmt.spread.sample(this.rng)));
        let now = this.ctx.currentTime + spreadS;
        const onset = stmt.kind === 'trigger' ? measureTriggerOnset(buffer) : null;
        if (stmt.kind === 'trigger' && !stmt.randomStart && this.triggerOnsetAlignment === 'align') {
            startOffsetSeconds = onset.offsetSeconds;
        }
        if (stmt.randomStart && !currentProgram)
            startOffsetSeconds = this.rng() * playBuffer.duration;
        let program;
        if (stmt.programId) {
            program = this._programs.join(stmt, key, this.ctx.currentTime, {
                buffer: playBuffer, bufferKey: clipOverride ?? (track._variant >= 0 ? this.variantClipPath(stmt, track._variant) : clipPath),
                take: track._variant, pitch, offsetSeconds: startOffsetSeconds, startsAt: now,
            }, programEvent);
            if (program.expired) {
                sourceNode.disconnect();
                this._activeSources.delete(sourceNode);
                track.sourceNode = null;
                track.pending = false;
                track.isPlaying = false;
                track._sourceEndT = this.clock.currentTime;
                return;
            }
            playBuffer = program.buffer;
            startOffsetSeconds = program.offsetSeconds;
            pitch = program.pitch;
            now = program.startsAt;
            spreadS = Math.max(0, now - this.ctx.currentTime);
            track._variant = program.take;
        }
        sourceNode.buffer = playBuffer; // A BufferSource accepts a non-null buffer only once.
        const playbackDuration = Math.max(0, playBuffer.duration - startOffsetSeconds) / Math.max(0.05, pitch);
        if (track.triggerGainNode) {
            track.triggerGainNode.gain.setValueAtTime(eventPayload?.gain ?? 1, now);
            // A contact starts where it occurred, not at the pool voice's previous
            // location followed by a 20 ms glide. Reset historical Doppler as well.
            track._lastDistM = -1;
            track.doppler = 1;
            track._dopplerActive = false;
            this.updateSourceExtent(track, now, true);
            this._acoustics.applyMuffle(track, now, 0.001);
        }
        // A thing going by on a strip sets off now: the run is sized to this
        // take so it passes the listener's stretch of the road at mid-clip.
        if (stmt.hostMotion === 'pass' && stmt.hostRef && this._world && this._hostingEnabled) {
            this.beginPass(track, stmt, buffer, pitch);
        }
        // Always start at zero to avoid click, then ramp up
        track.gainNode.gain.cancelScheduledValues(now);
        track.gainNode.gain.setValueAtTime(0, now);
        sourceNode.playbackRate.setValueAtTime(pitch, now);
        track.volume = volume;
        track.pitch = pitch;
        track.sourceNode = sourceNode;
        this.updateSynthControls(track, this.clock.currentTime - track.startedAt);
        track.pending = false;
        const inst = track.entityInstance;
        // A timed call takes its turn in the chorus for as long as the take lasts.
        if (inst && inst.agent && stmt.kind === 'oneshot' && !stmt.every.isNull) {
            this._entities.noteCall(inst, this.clock.currentTime, buffer.duration / Math.max(0.05, pitch));
        }
        // `emit <event>`: a sound that starts is something that HAPPENED here —
        // broadcast it from the voice's position so `on <event>` voices (a
        // population's `within` reactions) can answer. Re-entrancy is bounded
        // by the trigger cooldown: an `on x` voice that emits `x` re-fires at
        // most once per cooldown, never in the same call.
        if (stmt.emit)
            this.fireEvent(stmt.emit, { x: track.position.x, y: track.position.y, z: track.position.z,
                ...(track.entityInstance ? { actorId: `${track.entityInstance.def.id}:${track.entityInstance.n}` } : {}) });
        // Fade in — explicit AudioParam automation (runs on audio thread).
        // Respect runtime mute/solo: recurring one-shots retrigger every few
        // seconds, and ramping to full volume here would audibly un-mute them
        // on every retrigger. track.volume keeps the real level so unmuting
        // via applyMixerState restores it.
        // The ramp target must also carry the CURRENT modulation value: during a
        // group fade-in, ramping to the un-modulated base fired every recurring
        // one-shot at full level for the ~30 ms until the tick pulled it down —
        // and for percussive material that transient IS the sound.
        let modulated = volume;
        if (!stmt.volumeFollow) {
            const modElapsed = this.clock.currentTime - track.startedAt;
            if (stmt.volumeInterpolation) {
                modulated = this.evalInterpCached(track, stmt.volumeInterpolation, modElapsed);
            }
            if (stmt.groupVolumeModulation) {
                modulated *= this.evalInterpCached(track, stmt.groupVolumeModulation, modElapsed);
            }
        }
        // In a calibrated scene the ramp target is the governed level, not the
        // volume: `volume` is a trim on the emission and the window sets the gain.
        const audibleVolume = this.isTrackAudible(track) ? this._levels.levelGain(track, modulated) : 0;
        track._levelGain = audibleVolume;
        const implicitContactDuration = stmt.genDuration.isNull && !stmt.voiceId && (stmt.eventName === 'step' || stmt.eventName === 'land')
            ? CONTACT_TAKE_DURATION_S : Infinity;
        const triggerDuration = stmt.kind === 'trigger'
            ? Math.min(playbackDuration, stmt.duration.isNull ? implicitContactDuration : Math.max(0.01, stmt.duration.sample(this.rng)))
            : undefined;
        const triggerRelease = triggerDuration === undefined ? undefined
            : Math.min(triggerDuration, stmt.fadeOut.isNull ? 0.005 : Math.max(0.005, stmt.fadeOut.sample(this.rng)));
        this.logEvent(stmt.kind === 'loop' ? 'start' : 'fire', track, displayNameOf(stmt), null, {
            ...(inst ? { entity: inst.def.id, instance: inst.n } : {}),
            ...(eventPayload?.emitterId ? { emitterId: eventPayload.emitterId } : {}),
            ...(stmt.kind === 'loop' && !stmt.synth && this._loopVoiceBudget.enabled ? {} : { audioStartTime: now }),
            effectiveGain: stmt.kind === 'loop' && !stmt.synth && this._loopVoiceBudget.enabled ? 0 : audibleVolume * (eventPayload?.gain ?? 1) * track.scaleGain.gain.value * (this._masterConnected ? this.masterGain.gain.value : 0),
            bufferKey: program?.bufferKey ?? clipOverride ?? (track._variant >= 0 ? this.variantClipPath(stmt, track._variant) : clipPath),
            ...(stmt.programId && program ? { programId: stmt.programId, programStartTime: program.epoch } : {}),
            ...(stmt.kind === 'trigger' ? { eventGain: eventPayload?.gain ?? 1 } : {}),
            bufferOffsetSeconds: startOffsetSeconds,
            ...(triggerDuration === undefined ? {} : { playbackDurationSeconds: triggerDuration, releaseSeconds: triggerRelease, startDelaySeconds: spreadS }),
            ...(onset?.detected ? {
                detectedOnsetSeconds: onset.onsetSeconds,
                estimatedOnsetTime: now + Math.max(0, onset.onsetSeconds - startOffsetSeconds) / Math.max(0.05, pitch),
                timingBasis: 'pcm-onset-estimate',
            } : {}),
        });
        // Without `fade_in`, a 5ms micro-fade to eliminate click on start
        const fadeTime = !stmt.fadeIn.isNull ? stmt.fadeIn.sample(this.rng) : 0.005;
        track._fadeEndT = now + fadeTime;
        track._sourceEndT = stmt.kind === 'loop' ? Infinity : this.clock.currentTime + spreadS + playbackDuration;
        if (this._levels.calibrated) {
            // Envelope on gainNode (0 → 1), the governed level on levelNode.
            track.levelNode.gain.setValueAtTime(audibleVolume, now);
            track.gainNode.gain.linearRampToValueAtTime(1, now + fadeTime);
        }
        else {
            track.gainNode.gain.linearRampToValueAtTime(audibleVolume, now + fadeTime);
        }
        // Event duration is relative to EACH fire; its track stays available after release.
        // Prepare all gain automation before starting the source on the audio thread.
        if (stmt.kind === 'trigger') {
            const duration = triggerDuration;
            const release = triggerRelease;
            const end = now + duration;
            track._sourceEndT = this.clock.currentTime + spreadS + duration;
            const target = this._levels.calibrated ? 1 : audibleVolume;
            track.gainNode.gain.setValueAtTime(target, Math.max(now + Math.min(fadeTime, duration - release), end - release));
            track.gainNode.gain.linearRampToValueAtTime(0, end);
        }
        if (stmt.kind === 'loop' && !stmt.synth && this._loopVoiceBudget.enabled) {
            this._loopVoiceBudget.prepare(track, playBuffer, now, startOffsetSeconds, pitch);
        }
        else if (startOffsetSeconds > 0) {
            sourceNode.start(now, startOffsetSeconds);
        }
        else {
            sourceNode.start(now);
        }
        if (stmt.kind === 'trigger')
            sourceNode.stop(now + Math.max(0.01, track._sourceEndT - this.clock.currentTime - spreadS));
        // Schedule next retrigger — tagged with a generation so async buffer
        // arrivals (drainPendingVoices, generation, community swap) that call back
        // into retriggerAudio supersede any chain already scheduled instead of
        // spawning a second self-perpetuating one (which would permanently double
        // the retrigger rate). Superseded events fire as no-ops.
        if (stmt.kind === 'oneshot' && !stmt.every.isNull) {
            const gen = ++track._retriggerGen;
            const everySeconds = stmt.every.sample(this.rng) * this.paceFactor(track, stmt);
            this.scheduler.schedule({
                scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(everySeconds),
                type: AudioEventType.Callback,
                trackKey: key,
                debugLabel: `retrigger:${stmt.clip}`,
                onExecute: () => {
                    if (this.tracks.get(key) !== track || track._retriggerGen !== gen)
                        return;
                    this.retriggerAudio(key, stmt);
                },
            });
        }
        // Trigger takes end quietly: release the source but KEEP the track —
        // it must be able to fire again.
        if (stmt.kind === 'trigger') {
            sourceNode.onended = () => {
                this._activeSources.delete(sourceNode);
                if (track.sourceNode === sourceNode) {
                    try {
                        sourceNode.disconnect();
                    }
                    catch { /* ok */ }
                    track.sourceNode = null;
                    if (track._triggerSpareFamily) {
                        this.disposeTrackNodes(track);
                        this.tracks.delete(track.key);
                        this._tracksArrayDirty = true;
                    }
                }
            };
        }
        if (stmt.kind === 'oneshot' && stmt.every.isNull) {
            sourceNode.onended = () => {
                if (track.sourceNode !== sourceNode)
                    return;
                track.isPlaying = false;
                this._activeSources.delete(sourceNode);
                this.disposeTrackNodes(track);
                if (track.dormant)
                    this._dormantVersion++;
                this.tracks.delete(key);
                this._tracksArrayDirty = true;
            };
        }
    }
    // ── Async audio generation for gen statements ──
    /** Clip path of the k-th pooled take (`variants`): the base clip for k = 0, `<base>#k+1` beyond. */
    variantClipPath(stmt, k) {
        return takeClipPath(stmt, k);
    }
    /** Decoded buffer of the k-th pooled take, if it has landed. */
    /**
     * Hear ONE voice on demand, wherever it sits, whether or not the scene is
     * playing.
     *
     * Solo only works while the transport runs and still leaves you listening to
     * the whole mix's level window; the mixer's actual question is "what does
     * that one sound like". This plays the voice's own take through
     * `playOneShotTreated`, so it arrives from its authored position with the
     * scene's occlusion and room on it -- the sound as the scene has it, not a
     * bare file.
     *
     * Buffer resolution lives HERE rather than in the panel because a pooled
     * voice's take is `variantBuffer`'s business: a caller reaching into
     * `getAudioBuffers()` with a hand-built `path#k` would be a second copy of
     * the take-pool rule, and it would silently miss for every `variants` voice.
     *
     * Returns a stop handle, or null when the voice has no audio yet (a `gen`
     * take still in flight) -- the caller shows that rather than playing silence.
     */
    /** True only inside {@link fireNow}: its fire is logged as an `audition`, not a game fire. */
    _auditionFire = false;
    /**
     * Fire a one-shot or event voice NOW through its own track: the same path a scheduled fire
     * takes (its level, pitch, effects, panner and place, and the next version from its take
     * pool), so an editor hears exactly what it is changing. Unlike `auditionStatement` (a
     * separate dry-ish one-shot at the voice's position), every setting of the voice applies.
     * Logged as `audition`, never `fire`. `'silent'` when there is nothing to fire: the scene is
     * stopped, the voice is a loop, has no live track (outside its zone, not placed yet), or has
     * no audio loaded.
     */
    fireNow(statementIndex) {
        if (!this._isPlaying)
            return 'silent';
        const stmt = this.statements[statementIndex];
        if (!stmt || stmt.kind === 'loop')
            return 'silent';
        let track;
        for (const t of this.tracks.values()) {
            if (t.statementIndex === statementIndex && t._member <= 0 && !t.virtual) {
                track = t;
                break;
            }
        }
        if (!track)
            return 'silent';
        const before = track.sourceNode;
        this._auditionFire = true;
        try {
            this.retriggerAudio(track.key, track.statement, true);
        }
        finally {
            this._auditionFire = false;
        }
        return track.sourceNode && track.sourceNode !== before ? 'fired' : 'silent';
    }
    auditionStatement(statementIndex, opts) {
        const stmt = this.statements[statementIndex];
        if (!stmt)
            return null;
        // Prefer the take the live voice settled on, so what you hear is what the
        // scene is playing; fall back to the first take for a voice not yet up.
        let live;
        for (const t of this.tracks.values()) {
            if (t.statementIndex === statementIndex && t._member <= 0) {
                live = t;
                break;
            }
        }
        const buffer = this.variantBuffer(stmt, live?._variant ?? 0) ?? this.variantBuffer(stmt, 0);
        if (!buffer)
            return null;
        const pos = live?.position;
        const p = pos ?? { x: 0, y: 0, z: 0 };
        return this.playOneShotTreated(buffer, p.x, p.y, p.z, {
            loop: false,
            fadeInS: 0.05,
            maxDurationS: opts?.maxDurationS ?? 8,
            occlusion: live?.occlusion ?? 0,
            room: stmt.roomName ?? undefined,
            distanceProfile: stmt.distanceProfile, line: stmt.line,
        });
    }
    /** Loaded contact takes, without firing actor events or resolving/purchasing audio. */
    getContactRecordings(eventName) {
        return this.statements.filter(stmt => stmt.kind === 'trigger' && stmt.eventName === eventName)
            .map(stmt => ({ description: stmt.genPrompt ?? stmt.clip,
            buffers: Array.from({ length: takeCount(stmt) }, (_, k) => this.variantBuffer(stmt, k))
                .filter((buffer) => !!buffer) }));
    }
    variantBuffer(stmt, k) {
        if (k === 0 && !stmt.recordings?.takes)
            return this.audioBuffers.get(pathFor(stmt.clip)) ?? this.audioBuffers.get(stmt.clip);
        return this.audioBuffers.get(this.variantClipPath(stmt, k));
    }
    /**
     * Which pooled take plays this fire: a loop keeps the one it settled on;
     * a oneshot draws at random among the landed takes, excluding the last
     * one whenever there is a choice. -1 when nothing has landed yet.
     */
    pickVariant(track, stmt, commit = true) {
        // An entity member plays ITS instance's take for its whole life: the one
        // drawn at spawn if it has landed, else the first landed take, adopted.
        const inst = track.entityInstance;
        if (inst && track._member >= 0) {
            // A body's steady voice IS its identity — this car's engine, this
            // bird's song — so a loop, and a once-per-life oneshot, keep the take
            // drawn at spawn for life. A trigger is not identity: it is a repeated
            // CONTACT the body makes with the world, and a walker whose every
            // footfall played the one clip is exactly the machine `variants`
            // exists to avoid. So a trigger member draws per fire, never repeating
            // the take it just played, and `takes[m]` holds that last take.
            if (stmt.kind === 'trigger' || (stmt.kind === 'oneshot' && !stmt.every.isNull)) {
                const drawn = this.drawTake(stmt, inst.takes[track._member], commit);
                if (drawn >= 0 && commit)
                    inst.takes[track._member] = drawn;
                return drawn;
            }
            const own = inst.takes[track._member];
            if (own >= 0 && this.variantBuffer(stmt, own))
                return own;
            const adopted = this.drawTake(stmt, -1);
            if (adopted >= 0)
                inst.takes[track._member] = adopted;
            return adopted;
        }
        if (stmt.kind === 'loop' && track._variant >= 0 && this.variantBuffer(stmt, track._variant))
            return track._variant;
        return this.drawTake(stmt, track._variant, commit);
    }
    /**
     * A random LANDED take of a pool, never `avoid` when there is a choice
     * (the take that just played; the take the previous instance drew). -1
     * when nothing has landed.
     */
    drawTake(stmt, avoid, commit = true) {
        const available = [];
        const seen = new Set();
        for (let k = 0; k < takeCount(stmt); k++) {
            const buffer = this.variantBuffer(stmt, k);
            if (buffer && !seen.has(buffer)) {
                available.push(k);
                seen.add(buffer);
            }
        }
        return stmt.takesInOrder ? this.takePool.inOrder(stmt, available, commit) : this.takePool.draw(stmt, available, avoid, this.rng);
    }
    /**
     * Replace a clip's buffer and gently restart any live looping voices on it:
     * fade the old source down, then retrigger (which fades the new one in).
     * Oneshot voices pick up the new buffer on their next retrigger naturally.
     */
    swapBufferSmooth(clipPath, buffer) {
        this.registerBuffer(clipPath, buffer);
        if (!this._isPlaying)
            return;
        const FADE_SECONDS = 0.3;
        const registered = this.audioBuffers.get(clipPath);
        const swapKey = `__buffer_swap:${clipPath}`;
        this.scheduler.cancelTrackEvents(swapKey);
        // A pooled take (`<base>#k`) only restarts the loops settled on that take.
        const poolMatch = clipPath.match(/^(.*)#(\d+)$/);
        const matches = (track) => {
            const stmt = track.statement;
            if (poolMatch) {
                if (pathFor(stmt.clip) !== poolMatch[1] || track._variant !== Number(poolMatch[2]) - 1)
                    return false;
            }
            else if (pathFor(stmt.clip) !== clipPath && stmt.clip !== clipPath)
                return false;
            return stmt.kind === 'loop' && !!track.sourceNode;
        };
        for (const track of this.tracks.values()) {
            if (matches(track))
                track.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, FADE_SECONDS / 4);
        }
        // One boundary for every current member, including speakers added during
        // the fade. A registry update alone must not split a live program's bank.
        this.scheduler.schedule({
            scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(FADE_SECONDS),
            type: AudioEventType.Callback,
            trackKey: swapKey,
            debugLabel: `swap:${clipPath}`,
            onExecute: () => {
                if (!this._isPlaying || this.audioBuffers.get(clipPath) !== registered)
                    return;
                this._programs.invalidateBuffer(pathFor(clipPath));
                for (const [key, track] of this.tracks)
                    if (matches(track))
                        this.retriggerAudio(key, track.statement);
            },
        });
    }
    // ── Direct position control (viewport drag) ──
    /**
     * Pin a voice at an exact position (viewport drag). The spatial tick uses
     * the pin instead of the wander/trajectory until the script is reloaded.
     */
    /** Geometry-driven occlusion for a voice (0 clear → 1 behind a wall); see {@link Acoustics.setOcclusion}. */
    setTrackOcclusion(key, amount) {
        const track = this.tracks.get(key);
        if (track)
            this._acoustics.setOcclusion(track, amount);
    }
    /** Raise a voice's semantic occlusion floor (world grounding marks a source INTERIOR); see {@link Acoustics.raiseOcclusionFloor}. */
    setTrackOcclusionFloor(key, floor01) {
        const track = this.tracks.get(key);
        if (track)
            this._acoustics.raiseOcclusionFloor(track, floor01);
    }
    /** Redirect a voice to the doorway its sound bends through, or clear it; see {@link Acoustics.setDiffraction}. */
    setTrackDiffraction(key, apparent) {
        const track = this.tracks.get(key);
        if (track)
            this._acoustics.setDiffraction(track, apparent);
    }
    /** The world-geometry floor under a voice (terrain conform); see {@link Acoustics.setFloor}. */
    setTrackFloor(key, minY) {
        const track = this.tracks.get(key);
        if (track)
            this._acoustics.setFloor(track, minY);
    }
    /** Headphone elevation lens; see {@link Acoustics.setMonitorElevationGain}. */
    setMonitorElevationGain(gain) { this._acoustics.setMonitorElevationGain(gain); }
    get monitorElevationGain() { return this._acoustics.monitorElevationGain; }
    /** Switch the floor / ceiling reflection legs on or off; see {@link Acoustics.setGroundReflection}. */
    setGroundReflection(enabled) { this._acoustics.setGroundReflection(enabled); }
    get groundReflection() { return this._acoustics.groundReflection; }
    /**
     * Set the room the listener is standing in, measured from world geometry at
     * the player's position (see `probeEnclosure` in `lib/worldGrounding.ts`).
     * Safe to call at the walk loop's rate; see {@link WorldRoom.set}.
     */
    setWorldRoom(size01, damping01, wet01 = DEFAULT_WORLD_WET) {
        this._rooms.set(size01, damping01, wet01);
    }
    /**
     * The world room the listener is standing in right now — the room every
     * voice WITHOUT script reverb sends into — or null outside any room. Read by
     * the export panel so an offline render hears the room the listener stood
     * in (`RenderOptions.worldRoom`), and by the headless simulation to record
     * a procedural world's ambient room on the trace.
     */
    getWorldRoom() {
        return this._rooms.measured;
    }
    /**
     * Leave the world room — voices fall back to the rooms their scripts asked
     * for. Called when a world is unloaded or walk mode ends.
     */
    clearWorldRoom() {
        this._rooms.clear();
    }
    sendGainFor(track, wet01, roomSize01) {
        return this._rooms.sendGainFor(track, wet01, roomSize01);
    }
    currentSendGain(track) {
        return this._rooms.currentSendGain(track);
    }
    /**
     * How separated a voice is from the listener's enclosure, 0–1.
     *
     * This is the transmission half of the obstruction/occlusion split.
     * `setTrackOcclusion` handles obstruction — something in the way of the
     * direct path, dry attenuated, room untouched. This handles a source in
     * ANOTHER space: its energy never enters the listener's room, so the
     * reverberant contribution has to go too. Driven by room membership (see the
     * room/portal graph), not by ray hits.
     */
    setTrackTransmission(key, blocked01) {
        const track = this.tracks.get(key);
        if (!track || !track.reverbSend)
            return;
        const b = clamp01(blocked01);
        // Statement too, so a spawn that hasn't happened yet inherits the wall
        // (mirrors setTrackOcclusionFloor's persistence contract).
        track.statement.transmissionBlocked = b;
        if (Math.abs(b - track._transmissionBlocked) < 0.01)
            return;
        track._transmissionBlocked = b;
        if (track.virtual)
            return;
        // Author-wins: a scripted voice computes against its own room; only
        // unscripted voices ride the world room.
        const g = this.currentSendGain(track);
        if (Math.abs(g - track._lastTransmissionGain) < 1e-4)
            return;
        track._lastTransmissionGain = g;
        track.reverbSend.gain.setTargetAtTime(g, this.ctx.currentTime, PARAM_SMOOTHING);
    }
    /**
     * Drop a voice's reverb send and its claim on the shared room bus. The bus
     * itself survives while other voices still send into it, and is torn down by
     * the pool when the last one leaves.
     */
    /**
     * Detach every audio node a track owns and hand its reverb bus back. The
     * one exit path for a voice: teardown, stop, and a one-shot's own end all
     * come through here, so no node is left wired to the master bus.
     */
    disposeTrackNodes(track) {
        this._loopVoiceBudget.forget(track);
        if (track.sourceNode) {
            try {
                track.sourceNode.stop();
            }
            catch { /* not started, or already ended */ }
            try {
                track.sourceNode.disconnect();
            }
            catch { /* never connected */ }
            this._activeSources.delete(track.sourceNode);
            track.sourceNode = null;
        }
        if (track.dspChain)
            destroyDSPChain(track.dspChain);
        const nodes = [
            track.gainNode, track.triggerGainNode, track.scaleGain, track.pannerNode, track.pointGain, track.wideGain, track.levelNode, track.placeGain ?? null,
            track.occlusionFilter, track.occlusionGainNode,
        ];
        for (const node of nodes) {
            if (node)
                try {
                    node.disconnect();
                }
                catch { /* never connected */ }
        }
        track.occlusionFilter = null;
        track.occlusionGainNode = null;
        this._acoustics.disposeElevationLegs(track);
        this.releaseTrackReverb(track);
    }
    releaseTrackReverb(track) {
        if (track.reverbSend) {
            try {
                track.reverbSend.disconnect();
            }
            catch { /* ok */ }
            track.reverbSend = null;
        }
        if (track.reverbDry) {
            try {
                track.reverbDry.disconnect();
            }
            catch { /* ok */ }
            track.reverbDry = null;
        }
        if (track.reverbBus) {
            this.reverbBuses.release(track.reverbBus);
            track.reverbBus = null;
        }
    }
    /**
     * Spawn a RUNTIME voice — a real track outside the script (the live world
     * audio layer's path). Unlike `playOneShotAt` (bare source→panner→master),
     * a runtime voice goes through `createVoice`, so EVERY acoustic system
     * applies for free: the point/wide extent split, world-room membership,
     * geometry occlusion raycasts (it lives in `tracks`, which the world layer
     * iterates), transmission, Doppler, air absorption, and a viewport orb.
     *
     * Its synthetic statement is never in `this.statements`, so incremental
     * script reloads leave it alone; a full teardown (stop, parse error, room
     * change) removes it like everything else, and the caller respawns it.
     * Returns null when the engine is not playing or the id is already live.
     */
    addRuntimeVoice(id, buffer, opts) {
        if (!this._isPlaying)
            return null;
        const clip = `__rt_${id.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
        const key = `${clip}_rt_0`;
        if (this.tracks.has(key))
            return null;
        this.registerBuffer(pathFor(clip), buffer);
        const stmt = new Statement();
        stmt.kind = opts.loop === false ? 'oneshot' : 'loop';
        stmt.clip = clip;
        stmt.distanceProfile = opts.distanceProfile ?? null;
        stmt.volume = RangeOrValue.single(opts.volume ?? 1);
        stmt.fadeIn = RangeOrValue.single(opts.fadeInS ?? 0.4);
        if (opts.radiusM && opts.radiusM > 0)
            stmt.radius = RangeOrValue.single(opts.radiusM);
        if (opts.occlusionBase && opts.occlusionBase > 0)
            stmt.occlusionBase = clamp01(opts.occlusionBase);
        if (opts.color)
            stmt.staticColor = opts.color;
        this.createVoice(key, stmt, -1, 0);
        const track = this.tracks.get(key);
        if (!track)
            return null;
        this.setTrackPosition(key, opts.x, opts.y, opts.z);
        return { key, stop: (fadeS = 0.5) => this.stopTrack(key, fadeS) };
    }
    /**
     * Give a voice a measured physical size at runtime — how world grounding
     * hands the collider's knowledge of the emitting object to the extent
     * model ("the water surface under this anchor is 8 m wide"). The author
     * wins: a voice whose script declared `radius`, `ring` or `bed` keeps it.
     */
    setTrackExtent(key, radiusM) {
        const track = this.tracks.get(key);
        if (!track)
            return;
        const stmt = track.statement;
        if (!stmt.radius.isNull || !stmt.ringRadius.isNull || stmt.bed)
            return;
        // An animated size is an authored decision too — measurement must not
        // pin a radius the modulation would overwrite on the next tick anyway.
        if (stmt.radiusInterpolation || stmt.ringInterpolation)
            return;
        const r = Math.max(0, Math.min(100, radiusM));
        if (r <= 0)
            return;
        // Write the statement too, so the measurement survives incremental
        // reloads (statement identity is preserved for unchanged voices).
        stmt.radius = RangeOrValue.single(r);
        track._radiusM = r;
    }
    /** Host-measured centreline in metres. Refresh after host updates, including after play/reload. */
    setHostLine(id, line) {
        if (line.polyline.length < 2 || !Number.isFinite(line.halfM) || line.halfM < 0 ||
            !Number.isFinite(line.reachM) || line.reachM < 0 ||
            line.polyline.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
            throw new Error('Host line requires finite points, width and reach.');
        }
        for (const track of this.tracks.values()) {
            if (track.statement.line && (track.hostId === id || track.statement.hostRef === id))
                track._line = line;
        }
    }
    /** Lazily build the shared wide bus and hang it off the master gain. */
    ensureWideBus() {
        if (!this.wideBus) {
            this.wideBus = createWideBus(this.ctx);
            this.wideBus.output.connect(this.masterGain);
        }
        return this.wideBus;
    }
    /**
     * Per-spatial-tick source extent: aim the panner at the closest point on
     * the source's shape and rebalance the point/wide crossfade. Runs for
     * every voice — near-field widening applies even to zero-radius sources,
     * so nothing can hard-flip ear to ear at the head.
     *
     * The wide leg bypasses the post-panner muffle chain, so the occlusion /
     * zone LEVEL is composed into its gain here; the muffle's lowpass color
     * stays point-leg-only (the wide leg is diffuse — level is the cue that
     * matters, and zone mutes must silence both legs).
     */
    /**
     * Animated extent: evaluate `radius`/`ring` modulation into the track's
     * live size. Runs at the spatial rate, immediately before
     * `updateSourceExtent` consumes it — a source that swells from a point to
     * an enveloping field is one property, not a rebuilt voice.
     */
    updateExtentSize(track, stmt, elapsed) {
        if (stmt.radiusInterpolation) {
            track._radiusM = Math.max(0, this.evalInterpCached(track, stmt.radiusInterpolation, elapsed)) * stmt.scaleFactor;
        }
        if (stmt.ringInterpolation) {
            track._ringM = Math.max(0, this.evalInterpCached(track, stmt.ringInterpolation, elapsed)) * stmt.scaleFactor;
        }
    }
    updateSourceExtent(track, ctxTime, immediate = false) {
        const stmt = track.statement;
        // Occlusion/zone level for the wide leg (mirrors applyMuffle's law).
        const occG = track._zoneMuted
            ? 0
            : occlusionGain(track.occlusion) * zoneIsolationGain(track._zoneOcclusion);
        if (track._bed) {
            track.surfaceDistanceM = 0;
            track.sourceExtentDeg = 360;
            if (track.virtual)
                return;
            // Wide-only, no distance behavior; just track occlusion/zone level.
            const wideT = occG;
            if (immediate || !(Math.abs(wideT - track._lastWideG) < 0.005)) {
                track._lastWideG = wideT;
                if (immediate)
                    track.wideGain.gain.setValueAtTime(wideT, ctxTime);
                else
                    track.wideGain.gain.setTargetAtTime(wideT, ctxTime, 0.05);
            }
            return;
        }
        // Field voices keep their own extended-source model (offset rides the
        // listener, rolloff 0) — the crossfade stays parked at point.
        if (stmt.field)
            return;
        const lp = this._listenerPos;
        const scratch = this._extentScratch;
        sampleSourceExtent(track, lp, scratch);
        let extent = scratch.extent;
        const surfaceDist = scratch.surfaceDistM;
        track.surfaceDistanceM = surfaceDist;
        track.sourceExtentDeg = extent;
        const aimed = !!(track.apparent || track._line || track._ringM > 0 || track._radiusM > 0);
        // An OCCLUDED source must not envelop: it radiates through an aperture
        // (a window, a doorway), so its apparent width shrinks with how blocked
        // it is. Without this, standing at the facade of a house put its
        // fireplace all around the head — a bright, head-locked wide layer the
        // post-panner muffle never touches, read as "reverb over the whole
        // world". Continuous in occlusion, so raycast changes cannot step it.
        const occ01 = Math.min(1, Math.max(track.occlusion, track._zoneOcclusion));
        if (occ01 > 0)
            extent *= 1 - 0.85 * occ01;
        // Shaped sources aim the panner at the closest surface point — level
        // reads the shore of the pond, not its middle. Written after the position
        // branch each tick, so this write wins for moving voices too.
        if (aimed || immediate)
            this._acoustics.writePannerPosition(track, scratch.aim, ctxTime, immediate);
        if (track.virtual)
            return;
        const g = crossfadeGains(extent);
        // The panner attenuates its own leg by distance; the wide leg mirrors the
        // same inverse law by hand, so the crossfade never changes loudness.
        const pointT = g.point;
        const wideT = g.wide * directPathGain(surfaceDist, stmt.line, stmt.distanceProfile) * occG;
        if (immediate) {
            track.pointGain.gain.cancelScheduledValues(ctxTime);
            track.wideGain.gain.cancelScheduledValues(ctxTime);
            track.pointGain.gain.setValueAtTime(pointT, ctxTime);
            track.wideGain.gain.setValueAtTime(wideT, ctxTime);
            track._lastPointG = pointT;
            track._lastWideG = wideT;
            return;
        }
        if (!(Math.abs(pointT - track._lastPointG) < 0.005)) {
            track._lastPointG = pointT;
            track.pointGain.gain.setTargetAtTime(pointT, ctxTime, 0.05);
        }
        // A fixed 0.005 deadband discarded the whole wide path at quiet/far
        // sources. Bound relative error while avoiding immaterial writes.
        if (!(Math.abs(wideT - track._lastWideG) < Math.max(1e-6, Math.abs(wideT) * 0.005))) {
            track._lastWideG = wideT;
            track.wideGain.gain.setTargetAtTime(wideT, ctxTime, 0.05);
        }
    }
    /**
     * Game/scene-supplied signal channels — an OPEN namespace the built-in
     * measured signals shadow. Owned by {@link SignalBus}; the engine supplies
     * the two world facts prediction needs (the hour's clock rate, a scene
     * control's range).
     */
    _signalBus = new SignalBus({
        now: () => this.ctx.currentTime,
        predictHour: (horizonS) => (this._world ? this.predictedHour(horizonS) : null),
        controlRange: (key) => {
            if (!this._world)
                return null;
            const controls = this._world.spec.controls;
            for (let i = 0; i < controls.length; i++)
                if (controls[i].id === key)
                    return [controls[i].min, controls[i].max];
            return null;
        },
    });
    /** @internal The published signals, for tests and the devtools. */
    get _signals() { return this._signalBus.snapshot; }
    /**
     * Publish a scene-defined signal (`satie.set('danger', 0.7)` over a game
     * bridge, a sensor, an LFO — the engine routes numbers, it does not know
     * what danger is). Any `follow`/`when` binding naming it reads the latest
     * value each spatial tick; unset signals read NaN and bindings hold.
     */
    setSignal(name, value) {
        this._signalBus.set(name, value);
    }
    /** Withdraw an external channel and its prediction history. Bindings hold until it is published again. */
    clearSignal(name) {
        this._signalBus.delete(name);
    }
    /** Where a published signal will be `horizonS` seconds from now (see {@link SignalBus.predicted}); NaN for measured or never-published channels. */
    predictedSignal(name, horizonS) {
        return this._signalBus.predicted(name, horizonS);
    }
    /** The world's hour `horizonS` ahead at its `clockRate` (world minutes per real minute); NaN without a world. */
    predictedHour(horizonS) {
        const w = this._world;
        if (!w)
            return NaN;
        const rate = w.spec.time.clockRate;
        return rate > 0 ? (w.spec.time.hour + ((horizonS / 60) * rate) / 60) % 24 : w.spec.time.hour;
    }
    /**
     * How much the world's state needs this statement's sound, 0..1: the
     * larger of NOW and the state predicted `horizonS` ahead, each
     * `activity × followLevel` — activity being `active` hours × `quiet`
     * gates (`activityOf`), followLevel the `volume follow` mapping's output
     * at the signal (1 without a follow). A signal the engine cannot read or
     * predict (NaN — an entity member's body, an unpublished channel) counts
     * as 1: no guessing. Lazy generation (`lazyGeneration`) holds a gen
     * voice back while this is 0 and requests it the moment it rises.
     */
    demandOf(stmt, horizonS) {
        return this.demandFor(stmt, null, horizonS);
    }
    demandFor(stmt, track, horizonS) {
        if (this._editHold.held(stmt))
            return 1;
        const now = Math.min(1, this.activityOf(stmt.activeHours, stmt.quietGates, track) * this.followLevel(stmt, track, 0));
        if (now >= 1 || horizonS <= 0)
            return now;
        const ahead = Math.min(1, this.activityOf(stmt.activeHours, stmt.quietGates, track, horizonS) * this.followLevel(stmt, track, horizonS));
        return ahead > now ? ahead : now;
    }
    /** The `volume follow` output at the signal's current (`horizonS` 0) or predicted value, clamped 0..1; 1 without a follow or without a readable signal. */
    followLevel(stmt, track, horizonS) {
        const b = stmt.volumeFollow;
        if (!b)
            return 1;
        const x = this._editHold.signalFor(stmt, b.signal) ?? (horizonS > 0 ? this.predictedSignal(b.signal, horizonS) : this.signalValue(track, b.signal));
        if (isNaN(x))
            return 1;
        const v = mapFollow(b, x);
        return v <= 0 ? 0 : v >= 1 ? 1 : v;
    }
    /** A gen voice lazy generation may hold back: generated, prompted, and not a per-fire template trigger. */
    isLazyCandidate(stmt) {
        return stmt.isGenerated && !stmt.recordings?.takes && !!stmt.genPrompt && !(stmt.kind === 'trigger' && stmt.genPrompt.includes('{'));
    }
    /** Whether any take of the statement's clip (the base, or a pooled `#k`) has landed. */
    hasAnyTake(stmt) {
        for (let k = 0; k < takeCount(stmt); k++)
            if (this.variantBuffer(stmt, k))
                return true;
        return false;
    }
    /** audioBuffers.size at the last pending-voice reconciliation (see updateTracks). */
    _pendingSweepBufferCount = -1;
    /** Real seconds accumulated toward the next demand tick (`DEMAND_TICK_S`). */
    _demandAccumS = 0;
    /**
     * The demand tick (once per `DEMAND_TICK_S`, from the spatial tick — no
     * timer of its own, no allocation): every dormant voice whose demand
     * within `DEMAND_HORIZON_S` has risen above 0 is woken — a `predict`
     * event is logged with the demand, and its clip is requested exactly as
     * load would have (pool takes included), library stand-in first when
     * `standInFirst(true)`; when the buffer lands the usual arrival path
     * starts a loop / arms a oneshot or trigger. Demand falling back to 0
     * never puts a voice back to sleep: a landed clip stays, and the follow /
     * gates silence it as they always did.
     */
    wakeDormant() {
        for (const track of this.tracks.values()) {
            if (!track.dormant || track.stopping)
                continue;
            const stmt = track.statement;
            const d = this.demandFor(stmt, track, DEMAND_HORIZON_S);
            if (d <= 0)
                continue;
            track.dormant = false;
            this._dormantVersion++;
            this.logEvent('predict', track, displayNameOf(stmt), null, { demand: d });
            this.retriggerAudio(track.key, stmt, false, undefined, true);
        }
    }
    /**
     * Sample a measured signal for a voice (Signals.ts). NaN = unavailable this
     * tick (no distance sample yet, listener on top of the voice) — the binding
     * simply holds its last value rather than jumping.
     */
    signalValue(track, name) {
        switch (name) {
            case 'distance':
                return track && track._lastDistM >= 0 ? track._lastDistM : NaN;
            case 'closing':
                return track ? -track._radialV : NaN; // + = approaching
            case 'speed':
                return this._listenerSpeed;
            // An entity member's own body (Entities.ts) — measured from the
            // instance's motion; a free-standing voice has none of these.
            case 'velocity':
                return track?.entityInstance ? track.entityInstance.velocity : NaN;
            case 'accel':
                return track?.entityInstance ? track.entityInstance.accel : NaN;
            case 'progress':
                return track?.entityInstance ? track.entityInstance.progress : NaN;
            case 'age':
                return track?.entityInstance ? this.clock.currentTime - track.entityInstance.spawnedAt : NaN;
            case 'gaze': {
                if (!track)
                    return NaN;
                const dx = track.position.x - this._listenerPos.x;
                const dy = track.position.y - this._listenerPos.y;
                const dz = track.position.z - this._listenerPos.z;
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (len < 1e-4)
                    return NaN;
                const f = this._listenerFwd;
                return (dx * f.x + dy * f.y + dz * f.z) / len;
            }
            default:
                // Open namespace: scene-supplied channels (setSignal)
                return this._signalBus.get(name);
        }
    }
    // ── Procedural world: `world` block → geometry the voices live on ──
    /** The realized world of the loaded script (null = no `world` block). */
    _world = null;
    /** Serialized spec of `_world`, so an unchanged block keeps the same object identity. */
    _worldKey = null;
    _worldById = new Map();
    /** Seeded picker for class hosts (`at oak`) — same seed, same chorus. */
    _worldRng = createRng(1);
    /** The realized world, if the script declared one. */
    get world() { return this._world; }
    /**
     * Whether voices are hosted on the procedural geometry. Off while a
     * CAPTURED world (Marble) is grounding the scene instead: the state bus
     * (hour / weather signals, `active` / `quiet`) keeps running, but hosts,
     * the terrain floor, foliage and the ambient room step aside so the
     * reground pins and the measured room own the voices.
     */
    _hostingEnabled = true;
    // ── Attachments (scene-graph spec §3): `attach <ref>` / `follow <ref>` ──
    /** Any live voice attaches or follows — gates the per-tick pass. */
    _hasAttachments = false;
    /** Aperture centres of the world's interior (empty = no interior): the routing pass's candidates. */
    _interiorApertureCentres = [];
    /** Whether the listener stood inside the interior's shell at the last spatial tick. */
    _listenerInsideInterior = false;
    /** True when the listener is within the interior's footprint (small margin, floor at y = 0). */
    listenerInsideInterior() {
        const it = this._world?.interior;
        if (!it)
            return false;
        const lp = this._listenerPos;
        return lp.y >= -0.5 && lp.y <= it.sizeM[1] + 0.5
            && (pointInFootprint(it.footprint, lp.x, lp.z) || distanceToFootprintEdge(it.footprint, lp.x, lp.z) <= 0.3);
    }
    /**
     * Interior routing (scene: the listener inside a shell, the source beyond
     * it): the voice is heard FROM the aperture with the shortest bent path,
     * at that path's full length — the same apparent-point convention as
     * spatial/Diffraction.ts. Writes `track.apparent` in place and clears only
     * what it set (`_interiorRouted`), so a Marble diffraction redirect from
     * `setTrackDiffraction` is never clobbered. Allocation-free after the
     * first route of a track.
     */
    routeThroughInterior(track) {
        const it = this._world?.interior;
        const stmt = track.statement;
        const clear = () => {
            if (track._interiorRouted) {
                track._interiorRouted = false;
                track.apparent = null;
            }
        };
        if (!it || !this._listenerInsideInterior || stmt.bed || stmt.field) {
            clear();
            return;
        }
        const p = track.position;
        const outside = p.y > it.sizeM[1] + 0.3 || p.y < -0.3
            || (!pointInFootprint(it.footprint, p.x, p.z) && distanceToFootprintEdge(it.footprint, p.x, p.z) > 0.25);
        if (!outside) {
            clear();
            return;
        }
        const lp = this._listenerPos;
        let bestCost = Infinity;
        let bx = 0, by = 0, bz = 0, bLeg = 0;
        for (const ap of this._interiorApertureCentres) {
            const dl = Math.hypot(ap.x - lp.x, ap.y - lp.y, ap.z - lp.z);
            const ds = Math.hypot(p.x - ap.x, p.y - ap.y, p.z - ap.z);
            if (dl + ds < bestCost) {
                bestCost = dl + ds;
                bx = ap.x;
                by = ap.y;
                bz = ap.z;
                bLeg = dl;
            }
        }
        if (bLeg < 1e-3 || !isFinite(bestCost)) {
            clear();
            return;
        } // in the aperture, or no apertures
        const inv = bestCost / bLeg;
        const ax = lp.x + (bx - lp.x) * inv;
        const ay = lp.y + (by - lp.y) * inv;
        const az = lp.z + (bz - lp.z) * inv;
        if (track.apparent && track._interiorRouted) {
            track.apparent.x = ax;
            track.apparent.y = ay;
            track.apparent.z = az;
        }
        else if (!track.apparent) {
            track.apparent = { x: ax, y: ay, z: az };
            track._interiorRouted = true;
        }
        // An `apparent` owned by setTrackDiffraction is left alone.
    }
    /**
     * Pin every attached / following voice to its target, one level deep.
     * `attach`: the voice's `place` is a PARENT-RELATIVE offset, rotated by the
     * parent's yaw and scaled with it — adoption. `follow`: the stated offset
     * in the target's yaw frame, scale NOT adopted — pursuit. Targets resolve
     * to the listener, a live entity instance (by id), or another voice (by
     * clip token, exact or the segment after the last '/'); an attached voice
     * never serves as a parent (the one-level rule). A missing target leaves
     * the voice where it is. Allocation-free after the first pin.
     */
    resolveAttachments() {
        for (const track of this.getTracksArray()) {
            const stmt = track.statement;
            const isAttach = stmt.attachRef !== null;
            const ref = isAttach ? stmt.attachRef : stmt.followTarget?.ref;
            if (!ref)
                continue;
            let px, py, pz;
            let yaw = 0;
            let parentScale = 1;
            if (ref === 'listener') {
                px = this._listenerPos.x;
                py = this._listenerPos.y;
                pz = this._listenerPos.z;
            }
            else {
                const inst = this._entities.count ? this._entities.instanceById(ref) : null;
                if (inst) {
                    px = inst.position.x;
                    py = inst.position.y;
                    pz = inst.position.z;
                }
                else {
                    const parent = this.findTrackByRef(ref, track);
                    if (!parent)
                        continue;
                    const pp = parent.pinned ?? parent.position;
                    px = pp.x;
                    py = pp.y;
                    pz = pp.z;
                    yaw = parent.yawRad;
                    if (isAttach)
                        parentScale = parent.statement.scaleFactor;
                }
            }
            // Local offset: an attached voice's `place` (a point — areaMin of a
            // placed voice), a follower's stated offset.
            const off = isAttach ? stmt.areaMin : stmt.followTarget.offset;
            const cos = Math.cos(yaw), sin = Math.sin(yaw);
            const wx = px + (off.x * cos + off.z * sin) * parentScale;
            const wy = py + off.y * parentScale;
            const wz = pz + (-off.x * sin + off.z * cos) * parentScale;
            if (!track.pinned)
                track.pinned = { x: wx, y: wy, z: wz };
            else {
                track.pinned.x = wx;
                track.pinned.y = wy;
                track.pinned.z = wz;
            }
        }
    }
    /**
     * The voice a ref names: the WRITTEN clip token (a gen block's name — the
     * address that survives clip resolution), the resolved clip, or the
     * segment after its last '/'. Skips the seeker itself and any track that
     * is itself attached or following (one level deep).
     */
    findTrackByRef(ref, seeker) {
        for (const t of this.getTracksArray()) {
            if (t === seeker)
                continue;
            const s = t.statement;
            if (s.attachRef || s.followTarget)
                continue;
            if (s.clipToken === ref)
                return t;
            const clip = s.clip.toLowerCase();
            if (clip === ref)
                return t;
            const slash = clip.lastIndexOf('/');
            if (slash >= 0 && clip.slice(slash + 1) === ref)
                return t;
        }
        return null;
    }
    /** The loaded procedural world's fields (WorldFields.ts), rebuilt in setWorld. */
    _worldFields = null;
    /** A provider the host registered (a captured world's survey + collider) — wins over the procedural one. */
    _externalFields = null;
    /** Scratch sample for every field read (no allocation on the tick or the event path). */
    _fieldScratch = newFieldSample();
    /**
     * Register how the world answers "what is here" (WorldFields.ts) when the
     * engine cannot measure it from geometry of its own — a captured (Marble)
     * world's survey grid + collider. Null unregisters; a procedural world's
     * own fields take over again. The engine reads the provider every spatial
     * tick at the listener (the `depth` / `liquid` / `submerged` signals and
     * the medium), on a staggered tick at every voice (its side of the
     * air/water interface) and at each `fireEvent` point (the payload's
     * fields and, when the caller gave no `text`, the surface).
     */
    setFieldProvider(provider) { this._externalFields = provider; }
    /** The active field provider: the registered one, else the procedural world's while hosting is on. */
    fieldProvider() {
        return this._externalFields ?? (this._hostingEnabled ? this._worldFields : null);
    }
    /** The embedder's objects `at <id>` voices sit on, and their classes (see HostRegistry.ts). */
    _hosts = new HostRegistry();
    /** Whether an `at <ref>` voice has anything to sit on right now. */
    hostAvailable(ref) {
        if (!ref)
            return false;
        if (this._hosts.knows(ref))
            return true;
        return !!this._world && this._hostingEnabled;
    }
    /**
     * The seamless copy of a looped buffer. The cache lives in the SeamlessLoop
     * module, not here, so the offline renderer loops the identical treated
     * buffer and an export sounds like what was heard.
     */
    seamlessLoopOf(buffer) {
        return seamlessLoopOf(buffer, (channels, length, sampleRate) => {
            try {
                return this.ctx.createBuffer(channels, length, sampleRate);
            }
            catch {
                return null;
            }
        }, this.headless ? this.ctx.constructor : undefined);
    }
    /** How many OTHER loop voices are playing this very buffer right now. */
    liveLoopsOn(buffer, except) {
        if (this._loopVoiceBudget.enabled)
            return this._loopVoiceBudget.countBuffer(buffer, except);
        let n = 0;
        for (const t of this.tracks.values()) {
            if (t !== except && t.sourceNode && t.sourceNode.buffer === buffer && t.statement.kind === 'loop')
                n++;
        }
        return n;
    }
    /** Ids of the registered external hosts of a class (`cypress` → cypress_1 …), empty when there is no such class. */
    externalHostsOf(cls) {
        return this._hosts.memberIds(cls);
    }
    /**
     * Place or move an external host. Every `at <id>` voice re-pins to it
     * (entity members excepted — their body owns them). Call it whenever the
     * embedder's object moves; per frame is fine, the panner still updates at
     * the spatial rate. Scene frame: +Z ahead, +Y up, metres.
     */
    setHostPosition(id, x, y, z) {
        const { fresh, cls } = this._hosts.set(id, x, y, z);
        for (const track of this.tracks.values()) {
            const stmt = track.statement;
            if ((stmt.hostRef !== id && stmt.hostRef !== cls) || track.entityInstance || track._triggerAtContact)
                continue;
            // A newly registered host adopts its voices; a moved one carries the
            // voices already pinned to it (a oneshot re-picks on its next fire anyway).
            if (fresh || track.hostId === id)
                this.rehostTrack(track, stmt);
        }
    }
    /** Forget a host: reassign class slots or world features; unresolved voices become silent. */
    clearHost(id) {
        const { removed, cls } = this._hosts.delete(id);
        if (!removed)
            return;
        for (const track of this.tracks.values()) {
            if ((track.hostId !== id && track.statement.hostRef !== cls) || track.entityInstance || track._triggerAtContact)
                continue;
            track.hostId = null;
            track.pinned = null;
            if (this.hostAvailable(track.statement.hostRef))
                this.rehostTrack(track, track.statement);
            if (!this.isTrackAudible(track))
                this._levels.writeVoiceGain(track, 0, this.ctx.currentTime);
        }
    }
    /**
     * Fix the level window at `dbSpl` (a received level that plays at TOP_LUFS;
     * 75 is a sensible game default: a fountain at arm's length is full scale,
     * a 45 dB wind bed sits 30 dB under it) or pass null to return to the
     * adaptive window. Takes effect on the next spatial tick.
     */
    setLevelAnchorDb(dbSpl) {
        this._levels.setAnchor(dbSpl);
        this.applyMixerState();
    }
    get levelAnchorDb() { return this._levels.anchorDb; }
    get levelAnchorAuto() { return this._levels.anchorAuto; }
    /**
     * The world's ground material under a point (what an NPC's `on step … {text}`
     * gets), or null with no world: the text a game should fire the player's own
     * steps with, so the surfaces match the block instead of a guess in the glue.
     */
    groundMaterialAt(x, z) {
        const world = this._world;
        if (!world)
            return null;
        const m = materialAt(world, x, z);
        return m ? String(m) : null;
    }
    /** Ids of the external hosts currently registered. */
    get externalHosts() { return this._hosts.ids(); }
    /** Where an external host is now (`setHostPosition`), or the first member of a host class; undefined when unknown. */
    hostPositionOf(id) { return this._hosts.get(id) ?? this._hosts.get(this._hosts.memberIds(id)[0] ?? ''); }
    setWorldHosting(enabled) {
        if (this._hostingEnabled === enabled)
            return;
        this._hostingEnabled = enabled;
        if (!enabled) {
            for (const track of this.tracks.values()) {
                // Members stay pinned to their body — the entity owns their position.
                if (track.hostId && !track.entityInstance) {
                    track.hostId = null;
                    track.pinned = null;
                }
                track._passActive = false;
                if (track._foliage > 0) {
                    track._foliage = 0;
                    this._acoustics.applyMuffle(track, this.ctx.currentTime, 0.25);
                }
            }
            this.clearWorldRoom();
            this._entities.retireRoutes();
        }
        else if (this._world) {
            this.applyWorldAmbientRoom();
            for (const track of this.tracks.values())
                if (track.statement.hostRef)
                    this.rehostTrack(track, track.statement);
        }
    }
    get worldHosting() { return this._hostingEnabled; }
    /** Spatial ticks since load — staggers per-voice world work. */
    _spatialTicks = 0;
    /** Seconds since the world's `hour` signal was last published (clock). */
    _clockAccumS = 0;
    /** Spatial ticks since the `canopy` signal was last measured. */
    _canopyTicks = 0;
    /**
     * Realize (or drop) the script's `world` block. Idempotent on the
     * GEOMETRY: the identity key leaves weather, time and the scene controls
     * out (state, not geometry — and the control SET is geometry-neutral too),
     * so a knob that changes the hour, the rain or `traffic` updates the live
     * world's state and republishes the signals without rebuilding meshes or
     * re-hosting voices.
     */
    applyWorldSpec(spec) {
        if (!spec) {
            this.setWorld(null);
            return;
        }
        const key = serializeWorldSpec({ ...spec, weather: { rain: 0, wind: 0, fog: 0 }, time: { hour: 0, season: '', temperatureC: 0, clockRate: 0 }, controls: [] });
        if (key === this._worldKey && this._world) {
            this._world.spec.weather = { ...spec.weather };
            this._world.spec.time = { ...spec.time };
            this._world.spec.controls = spec.controls.map(c => ({ ...c }));
            this.publishWorldState();
            return;
        }
        this._worldKey = key;
        this.setWorld(realizeWorld(spec));
    }
    /**
     * The world's own clock and the listener-relative signals, once per
     * spatial tick: `hour` advances at `clockRate` world-minutes per real
     * minute (published at 2 Hz — half-hour ramps make finer steps inaudible),
     * `canopy` is the crown cover over the listener (~5 Hz).
     */
    advanceWorld(dtSec) {
        const w = this._world;
        if (!w)
            return;
        const rate = w.spec.time.clockRate;
        if (rate > 0 && dtSec > 0 && dtSec < 5) {
            // real seconds → real minutes → world minutes (× rate) → world hours
            w.spec.time.hour = (w.spec.time.hour + ((dtSec / 60) * rate) / 60) % 24;
            this._clockAccumS += dtSec;
            if (this._clockAccumS >= 0.5) {
                this._clockAccumS = 0;
                this.setSignal('hour', w.spec.time.hour);
            }
        }
        if (this._hostingEnabled && ++this._canopyTicks >= 6) {
            this._canopyTicks = 0;
            const cover = overheadCoverAt(w, this._listenerPos.x, this._listenerPos.z, this._listenerPos.y);
            this.setSignal('overhead', cover);
            this.setSignal('canopy', cover); // version-1 name
        }
    }
    /**
     * `pace follow <signal> …` — the interval multiplier read at schedule time.
     * An unavailable signal leaves the interval as written.
     */
    paceFactor(track, stmt) {
        if (!stmt.paceFollow)
            return 1;
        const x = this.signalValue(track, stmt.paceFollow.signal);
        if (isNaN(x))
            return 1;
        const f = mapFollow(stmt.paceFollow, x);
        return f > 0.05 ? f : 0.05;
    }
    /** A point on the horizon: random bearing, 1.5–3 km out, 100–400 m up (see `HORIZON_*`). */
    drawHorizonPointInto(p) {
        const theta = this.rng() * Math.PI * 2;
        const r = HORIZON_MIN_M + this.rng() * (HORIZON_MAX_M - HORIZON_MIN_M);
        p.x = Math.sin(theta) * r;
        p.z = Math.cos(theta) * r;
        p.y = HORIZON_Y_MIN_M + this.rng() * (HORIZON_Y_MAX_M - HORIZON_Y_MIN_M);
    }
    /** Air absorption + Doppler for one voice (see {@link Acoustics.updateDistance}); the extent suite drives it directly. */
    updateDistanceAcoustics(track, ctxTime, dtSec) {
        this._acoustics.updateDistance(track, ctxTime, dtSec);
    }
    /** Foliage on the listener→voice path (see {@link Acoustics.updateFoliage}); the world-state suite drives it directly. */
    updateFoliage(track, ctxTime) {
        this._acoustics.updateFoliage(track, ctxTime);
    }
    // ── Medium — what the listener is standing in (owned by Acoustics) ──
    get submerged() { return this._acoustics.submerged; }
    /** Where the master gain feeds: the medium stage once it exists, else the limiter. */
    masterOut() { return this._acoustics.masterOut(); }
    /** How far under a fluid surface the listener's head is (0 air → 1); see {@link Acoustics.setSubmerged}. */
    setSubmerged(submerged01) { this._acoustics.setSubmerged(submerged01); }
    /**
     * The outdoor "room" a procedural world implies — a forest of trunks is a
     * diffuse scatterer with a short, dense tail; open ground has none. Sized
     * from stem density so the tail thickens with the wood. Declared `room`s
     * still win (author-wins ladder), and an enclosure the listener walks into
     * (a hut) is measured by the viewport and applied over this.
     */
    applyWorldAmbientRoom() {
        const w = this._world;
        if (!w)
            return;
        if (this.scriptRoom)
            return;
        if (!this._hostingEnabled) {
            this.clearWorldRoom();
            return;
        }
        const area100 = (w.spec.sizeM * w.spec.sizeM) / 100;
        // Two acoustic populations, read from geometry alone: tall SOLID bodies
        // (walls — reflect) and POROUS bodies (foliage — scatter). Which species
        // or building they are never enters.
        let walls = 0, porous = 0;
        for (const o of w.objects) {
            if (o.kind !== 'object')
                continue;
            if (o.porous < 0.3 && o.heightM >= 3)
                walls++;
            else if (o.porous >= 0.3 && o.heightM >= 2)
                porous++;
        }
        const wallDensity = walls / area100;
        const porousDensity = porous / area100;
        // OUTDOORS IS NEARLY DRY. A street or a wood adds a hint of early energy
        // from facades or trunks, never a hall: the first version put a 0.24-wet,
        // 0.75-size tail on every voice of a city block and the whole scene rang
        // like a cathedral. Caps: wet ≤ OUTDOOR_WET_MAX, size ≤ OUTDOOR_SIZE_MAX.
        if (wallDensity >= 0.15) {
            // Hard facades: a little brighter and longer than trunks, still slight.
            const size01 = Math.min(OUTDOOR_SIZE_MAX, 0.3 + wallDensity * 0.12);
            const wet01 = Math.min(OUTDOOR_WET_MAX, 0.03 + wallDensity * 0.03);
            this.setWorldRoom(size01, 0.55, wet01);
            return;
        }
        if (porousDensity < 0.05) {
            this.clearWorldRoom();
            return;
        }
        // Scatterers: a short, dark, barely-there tail.
        const size01 = Math.min(0.4, 0.2 + porousDensity * 0.05);
        const wet01 = Math.min(OUTDOOR_WET_MAX * 0.6, 0.015 + porousDensity * 0.012);
        this.setWorldRoom(size01, 0.9, wet01);
    }
    /**
     * Install a realized world directly (the script path goes through
     * `applyWorldSpec`). Publishes the world's state as signals — `wind`,
     * `rain`, `fog`, `hour`, `temp` — so `follow`, `active` and `quiet` can
     * read them, and re-hosts every `at` voice onto the new geometry.
     */
    setWorld(world) {
        this._world = world;
        this._worldFields = world ? proceduralFields(world) : null;
        this._worldById.clear();
        this._interiorApertureCentres = world
            ? world.objects.filter(o => o.kind === 'aperture').map(o => attachPoint(o, 'body'))
            : [];
        if (!world) {
            this._worldKey = null;
            for (const track of this.tracks.values()) {
                // A voice perched on an embedder's object keeps its perch — that host is not the world's.
                const ref = track.statement.hostRef;
                if (ref && track.hostId && !this._hosts.has(ref)) {
                    track.hostId = null;
                    track.pinned = null;
                }
                track._passActive = false;
            }
            // A route needs its strip: the bodies on it retire (their spawners
            // keep polling and resume when a world returns). Populations keep
            // sounding where they perch.
            this._entities.retireRoutes();
            return;
        }
        for (const o of world.objects)
            this._worldById.set(o.id, o);
        this._worldRng = createRng(world.spec.seed ^ 0x51ed);
        this._spatialTicks = 0;
        this._canopyTicks = 6; // measure canopy on the first tick
        this.publishWorldState();
        this.applyWorldAmbientRoom();
        for (const track of this.tracks.values()) {
            const stmt = track.statement;
            if (stmt.hostRef)
                this.rehostTrack(track, stmt);
        }
        // Populations that were sitting at the origin (no world yet) take their
        // perches; a new world means new anchors for every agent.
        this._entities.rehostAll();
    }
    /**
     * Change the world's weather / time at runtime (a UI knob, a game clock)
     * without rebuilding geometry. Values are clamped; the signals update
     * immediately and `active` / `quiet` voices fade over the next second.
     */
    setWorldState(state) {
        if (!this._world)
            return;
        const spec = this._world.spec;
        const c01 = (v) => Math.max(0, Math.min(1, v));
        if (state.clockRate !== undefined && isFinite(state.clockRate))
            spec.time.clockRate = Math.max(0, Math.min(1440, state.clockRate));
        if (state.rain !== undefined && isFinite(state.rain))
            spec.weather.rain = c01(state.rain);
        if (state.wind !== undefined && isFinite(state.wind))
            spec.weather.wind = c01(state.wind);
        if (state.fog !== undefined && isFinite(state.fog))
            spec.weather.fog = c01(state.fog);
        if (state.hour !== undefined && isFinite(state.hour))
            spec.time.hour = ((state.hour % 24) + 24) % 24;
        if (state.temperatureC !== undefined && isFinite(state.temperatureC))
            spec.time.temperatureC = state.temperatureC;
        if (state.controls) {
            for (const ctl of spec.controls) {
                const v = state.controls[ctl.id];
                if (v !== undefined && isFinite(v))
                    ctl.value = Math.max(ctl.min, Math.min(ctl.max, v));
            }
        }
        this.publishWorldState();
    }
    /**
     * The world's state onto the signal bus: the physical state every place
     * has (`wind`, `rain`, `fog`, `hour`, `temp`) and the scene's own controls,
     * each under its id — the engine routes the numbers and never knows what
     * `traffic` or `sea_state` means.
     */
    publishWorldState() {
        const w = this._world;
        if (!w)
            return;
        this.setSignal('wind', w.spec.weather.wind);
        this.setSignal('rain', w.spec.weather.rain);
        this.setSignal('fog', w.spec.weather.fog);
        this.setSignal('hour', w.spec.time.hour);
        this.setSignal('temp', w.spec.time.temperatureC);
        for (const ctl of w.spec.controls)
            this.setSignal(ctl.id, ctl.value);
    }
    /**
     * Resolve `at <ref>` for a voice and pin it there. Fixed ids pin to the
     * object's emit point; classes pick (oneshot: random per call; loop: the
     * nearest to the listener); `ground` picks a random dry ground point 4–18 m
     * out; `water` / `canopy` are live and only seeded here.
     */
    rehostTrack(track, stmt) {
        const world = this._world;
        const ref = stmt.hostRef;
        const pin = (p, id) => {
            track.hostId = id;
            if (track.pinned) {
                track.pinned.x = p.x;
                track.pinned.y = p.y;
                track.pinned.z = p.z;
            }
            else
                track.pinned = { x: p.x, y: p.y, z: p.z };
            track.position.x = p.x;
            track.position.y = p.y;
            track.position.z = p.z;
        };
        // The horizon needs no world — a fresh far bearing per fire.
        if (ref === 'horizon') {
            this.drawHorizonPointInto(HOST_SCRATCH);
            pin(HOST_SCRATCH, null);
            return;
        }
        // An embedder's object (`setHostPosition`) wins over a world feature of the same id.
        const ext = ref ? this._hosts.get(ref) : undefined;
        if (ext && ref) {
            pin(this.externalAttach(ref, ext, stmt.hostAttach), ref);
            return;
        }
        const members = ref ? this._hosts.membersOf(ref) : undefined;
        if (members && members.length) {
            // Copies of a count take the members in turn (copy k on member k); a
            // single loop sits on the nearest; a oneshot fires from any of them.
            // A gen count voice is expanded by the parser into count-variant
            // statements (countIndex), a clip count voice stays one statement
            // (voiceIndex): either way copy k takes member k.
            let m = members[0];
            if (stmt.count > 1 || stmt.isCountVariant) {
                const index = stmt.count > 1 ? track.voiceIndex : stmt.countIndex;
                if (index >= members.length) {
                    track.hostId = null;
                    track.pinned = null;
                    return;
                }
                m = members[index];
            }
            else if (stmt.kind === 'loop') {
                let best = Infinity;
                for (const c of members) {
                    const d = Math.hypot(c.p.x - this._listenerPos.x, c.p.z - this._listenerPos.z);
                    if (d < best) {
                        best = d;
                        m = c;
                    }
                }
            }
            else
                m = members[Math.min(members.length - 1, Math.floor(this.rng() * members.length))];
            pin(this.externalAttach(m.id, m.p, stmt.hostAttach), m.id);
            return;
        }
        if (!world || !ref)
            return;
        // Live hosts: a feature's nearest stretch, or whatever is overhead.
        if (ref === 'overhead' || featureById(world, ref)) {
            this.followDynamicHost(track, stmt);
            return;
        }
        if (ref === 'ground') {
            if (this.drawGroundPointInto(HOST_SCRATCH))
                pin(HOST_SCRATCH, null);
            return;
        }
        const exact = this._worldById.get(ref);
        if (exact) {
            pin(this.attachPointFor(exact, stmt.hostAttach), exact.id);
            return;
        }
        // A class or fixture id — including fixtures NAMED as a class (`cypress_1 …
        // cypress_4` from a developer's manifest), so `at cypress` works in a world
        // with no external hosts bound yet.
        const candidates = world.objects.filter(o => o.classId === ref || HostRegistry.classOf(o.id) === ref);
        if (!candidates.length)
            return;
        let chosen;
        track._hostBindX = NaN;
        track._hostBindZ = NaN;
        if (stmt.count > 1 || stmt.isCountVariant) {
            const index = stmt.count > 1 ? track.voiceIndex : stmt.countIndex;
            let sorted;
            if (stmt.kind === 'loop') {
                // A DISTRIBUTED continuous source (wind in the trees, rain on the
                // roofs): copy k occupies the k-th NEAREST instance, so the field is
                // around the listener and every step changes what arrives; the tick
                // re-occupies once the listener has walked CLASS_REBIND_M (2026-09-17:
                // copies by id sat on the first N instances of a 120 m world, up to
                // 60 m away, and moving through the place changed nothing).
                const lx = this._listenerPos.x, lz = this._listenerPos.z;
                const d2 = (o) => { const dx = o.position.x - lx, dz = o.position.z - lz; return dx * dx + dz * dz; };
                sorted = [...candidates].sort((a, b) => d2(a) - d2(b) || a.id.localeCompare(b.id, undefined, { numeric: true }));
                track._hostBindX = lx;
                track._hostBindZ = lz;
            }
            else {
                // Copies of a oneshot take the members in turn, as with external host classes.
                sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
            }
            if (index >= sorted.length) {
                track.hostId = null;
                track.pinned = null;
                return;
            }
            chosen = sorted[index];
        }
        else if (stmt.kind === 'loop') {
            chosen = candidates[0];
            let best = Infinity;
            for (const o of candidates) {
                const d = Math.hypot(o.position.x - this._listenerPos.x, o.position.z - this._listenerPos.z);
                if (d < best) {
                    best = d;
                    chosen = o;
                }
            }
        }
        else {
            chosen = candidates[Math.min(candidates.length - 1, Math.floor(this._worldRng() * candidates.length))];
        }
        pin(this.attachPointFor(chosen, stmt.hostAttach), chosen.id);
    }
    /**
     * Where a sound attaches on a world object: the drawn geometry when the graphics reported it
     * (`setHostGeometry`), else the procedural shape. The graphics dictate the sound (2026-10-09).
     */
    attachPointFor(o, attach) {
        const g = this._hosts.geometryOf(o.id);
        return g ? attachFromGeometry(g, attach) : attachPoint(o, attach);
    }
    /** An external host's attach point: its drawn box when reported, else the registered point. */
    externalAttach(id, p, attach) {
        const g = this._hosts.geometryOf(id);
        return g ? attachFromGeometry(g, attach) : p;
    }
    /**
     * What the graphics drew for a host, as a world-space box in metres: the drawn crown is where a
     * bird perches, the drawn centre is where a body sounds. Every voice and body on that host moves to
     * the drawn geometry at once; ground anchors reach as far as the drawing (`drawnHalfExtentM`).
     * The drawing's extent also widens the ground draw for `at ground` voices.
     */
    setHostGeometry(id, bounds) {
        if (![...bounds.center, ...bounds.size].every(Number.isFinite))
            return;
        this._hosts.setGeometry(id, { x: bounds.center[0], y: bounds.center[1], z: bounds.center[2] }, { x: Math.abs(bounds.size[0]), y: Math.abs(bounds.size[1]), z: Math.abs(bounds.size[2]) });
        const cls = HostRegistry.classOf(id);
        for (const track of this.tracks.values()) {
            const stmt = track.statement;
            if (track.entityInstance || track._triggerAtContact)
                continue;
            if (track.hostId === id || (!track.hostId && (stmt.hostRef === id || (cls && stmt.hostRef === cls))))
                this.rehostTrack(track, stmt);
        }
        this._entities.rehostOn(id);
    }
    /** The drawn boxes the graphics reported so far, by host id. */
    hostGeometry(id) { return this._hosts.geometryOf(id); }
    /** A random dry ground point from the listener, 4 m to as far as the place reaches (18 m, or the drawing's extent), written into `out` (false when every draw hit water). */
    drawGroundPointInto(out) {
        const world = this._world;
        if (!world)
            return false;
        const reach = Math.max(14, this._hosts.drawnHalfExtentM() - 4);
        for (let attempt = 0; attempt < 12; attempt++) {
            const a = this._worldRng() * Math.PI * 2;
            const d = 4 + this._worldRng() * reach;
            const x = this._listenerPos.x + Math.sin(a) * d;
            const z = this._listenerPos.z + Math.cos(a) * d;
            if (isLiquidAt(world, x, z))
                continue;
            out.x = x;
            out.y = heightAt(world.heightfield, x, z) + WORLD_FLOOR_CLEARANCE_M;
            out.z = z;
            return true;
        }
        return false;
    }
    /** `at water`: nearest point of the water body; `at canopy`: nearest crown over the listener. */
    followDynamicHost(track, stmt) {
        const world = this._world;
        if (!world)
            return;
        // Spatial-tick path: no allocations — the result is written straight
        // into the track's pin (a scratch Vec3 carries the feature point).
        const ref = stmt.hostRef ?? '';
        const feature = featureById(world, ref);
        const p = HOST_SCRATCH;
        let found = false;
        if (feature) {
            // The nearest stretch of a strip / point of a patch rim; a liquid
            // surface is heard at the surface, a paved one a little above it.
            if (nearestFeaturePointInto(world, ref, this._listenerPos.x, this._listenerPos.z, p)) {
                p.y += feature.liquid ? 0.1 : 0.8;
                found = true;
            }
            // A `line` voice on a strip is heard along the strip's whole length; a
            // paved one carries the city's diffuse field (reach), a liquid one is a
            // true line you can walk away from.
            if (stmt.line && feature.kind === 'strip' && (!track._line || track._line.polyline !== feature.polyline)) {
                track._line = { polyline: feature.polyline, halfM: feature.halfM, reachM: feature.liquid ? 0 : LINE_DIFFUSE_REACH_M };
            }
        }
        else if (ref === 'overhead') {
            // Whatever body is above the listener; failing that, the nearest raised body.
            const over = overheadAt(world, this._listenerPos.x, this._listenerPos.z, this._listenerPos.y);
            if (over) {
                p.x = this._listenerPos.x;
                p.y = over.underside + (over.object.heightM - over.object.bodyBaseM) * 0.3;
                p.z = this._listenerPos.z;
                track.hostId = over.object.id;
                found = true;
            }
            else {
                let best = null;
                let bestD = Infinity;
                for (const o of world.objects) {
                    if (o.bodyBaseM <= 0.5)
                        continue;
                    const dx = o.position.x - this._listenerPos.x, dz = o.position.z - this._listenerPos.z;
                    const d = dx * dx + dz * dz;
                    if (d < bestD) {
                        bestD = d;
                        best = o;
                    }
                }
                if (best) {
                    p.x = best.position.x;
                    p.y = best.position.y + best.bodyBaseM + (best.heightM - best.bodyBaseM) * 0.5;
                    p.z = best.position.z;
                    track.hostId = best.id;
                    found = true;
                }
            }
        }
        if (!found)
            return;
        if (track.pinned) {
            track.pinned.x = p.x;
            track.pinned.y = p.y;
            track.pinned.z = p.z;
        }
        else
            track.pinned = { x: p.x, y: p.y, z: p.z };
    }
    /**
     * `at <strip> pass`: set a voice off along its strip for this take. A
     * random direction; a start chosen so the run crosses the point of the
     * strip nearest the listener at mid-clip (clamped to the strip's ends);
     * speed from the strip's `flow` (0 → walking pace, 1 → fast traffic). A
     * loop travels continuously, turning back at the ends. Everything the
     * spatial tick needs is fixed here so `followPassHost` only evaluates a
     * line — no allocation, no search.
     */
    beginPass(track, stmt, buffer, pitch) {
        const world = this._world;
        if (!world || !stmt.hostRef)
            return;
        const f = featureById(world, stmt.hostRef);
        if (!f || f.kind !== 'strip')
            return;
        const len = featureArcLength(f);
        if (!(len > 0))
            return;
        const flow = f.flow < 0 ? 0 : f.flow > 1 ? 1 : f.flow;
        const speed = PASS_SPEED_MIN_MS + (PASS_SPEED_MAX_MS - PASS_SPEED_MIN_MS) * flow;
        const near = featureArcNearest(f, this._listenerPos.x, this._listenerPos.z);
        const dir = this._worldRng() < 0.5 ? -1 : 1;
        // Half the run: a oneshot is on the road for the length of its take.
        const takeS = stmt.kind === 'loop' ? Infinity : buffer.duration / Math.max(0.05, pitch);
        const half = stmt.kind === 'loop' ? 0 : speed * takeS / 2;
        let arc0 = near - dir * half;
        if (arc0 < 0)
            arc0 = 0;
        else if (arc0 > len)
            arc0 = len;
        track._passActive = true;
        track._passLen = len;
        track._passDir = dir;
        track._passSpeed = speed;
        track._passArc0 = arc0;
        track._passT0 = this.clock.currentTime;
        track._passEnd = track._passT0 + takeS;
        this.followPassHost(track, stmt, track._passT0);
    }
    /** Per spatial tick: where along its strip a passing voice is now (writes the pin, no allocation). */
    followPassHost(track, stmt, now) {
        const world = this._world;
        if (!world || !stmt.hostRef)
            return;
        const f = featureById(world, stmt.hostRef);
        if (!f) {
            track._passActive = false;
            return;
        }
        const len = track._passLen;
        let s = track._passArc0 + track._passDir * track._passSpeed * (now - track._passT0);
        if (stmt.kind === 'loop') {
            // Back and forth along the strip — no jump at the ends.
            const period = 2 * len;
            s = ((s % period) + period) % period;
            if (s > len)
                s = period - s;
        }
        else {
            // The run is over when the take is, or once it has left the strip's
            // end in its direction of travel — the pin holds there until the next
            // fire re-hosts the voice. (A start clamped ONTO an end is not "off" it.)
            const off = track._passDir > 0 ? s > len : s < 0;
            if (s < 0)
                s = 0;
            else if (s > len)
                s = len;
            if (off || now >= track._passEnd)
                track._passActive = false;
        }
        const p = HOST_SCRATCH;
        if (!featurePointAtArcInto(f, s, p))
            return;
        p.y += f.liquid ? 0.1 : 0.8;
        if (track.pinned) {
            track.pinned.x = p.x;
            track.pinned.y = p.y;
            track.pinned.z = p.z;
        }
        else
            track.pinned = { x: p.x, y: p.y, z: p.z };
    }
    /**
     * `active` hours × `quiet` gates → 0..1. Half-hour ramps at window edges;
     * every `quiet` gate reads its signal off the bus (`rain` and `wind` are
     * published there by the world like any scene control, so the gate never
     * knows which is which) with a 0.15 ramp below the threshold in the
     * signal's units; an unpublished signal holds open. Shared by voices
     * (`updateActivity`) and entity spawners (`entityActivity`).
     */
    activityOf(activeHours, gates, track, horizonS = 0) {
        const w = this._world;
        let a = entityActionAllowsSound(track?.entityInstance?.behavior, track?.statement.sourceId ?? null) ? 1 : 0;
        if (activeHours && w) {
            // `horizonS` > 0 reads the PREDICTED state (demand): the clock run ahead, the signals extrapolated.
            const h = horizonS > 0 ? this.predictedHour(horizonS) : w.spec.time.hour;
            let best = 0;
            for (const [s, e] of activeHours) {
                const inside = s <= e ? (h >= s && h <= e) : (h >= s || h <= e);
                if (inside) {
                    // Distance to the nearest edge, in hours, wrapped.
                    const dIn = Math.min(((h - s + 24) % 24), ((e - h + 24) % 24));
                    best = Math.max(best, Math.min(1, dIn / 0.5));
                }
            }
            a *= best;
        }
        for (let i = 0; i < gates.length; i++) {
            const level = horizonS > 0 ? this.predictedSignal(gates[i].signal, horizonS) : this.signalValue(track, gates[i].signal);
            if (isNaN(level))
                continue;
            a *= 1 - Math.max(0, Math.min(1, (level - (gates[i].threshold - 0.15)) / 0.15));
        }
        return a;
    }
    /**
     * The activity multiplied into a voice's count-scaling gain, smoothed
     * over ~1 s so nothing pops.
     */
    updateActivity(track, stmt, ctxTime) {
        const a = this._editHold.held(stmt) ? 1 : this.activityOf(stmt.activeHours, stmt.quietGates, track);
        if (Math.abs(a - track._activity) < 0.005)
            return;
        track._activity = a;
        if (!track.virtual)
            track.scaleGain.gain.setTargetAtTime(track._scaleBase * a, ctxTime, 0.4);
    }
    // ── Entities: bodies with kinematics and a repertoire (EntityRuntime.ts) ──
    /** The loaded script's entity definitions. */
    get entities() { return this.entityDefs; }
    /** Send one population individual to the free anchor nearest a point (see {@link EntityRuntime.steer}). */
    steerInstance(entityId, instanceN, x, y, z) {
        return this._entities.steer(entityId, instanceN, x, y, z);
    }
    /** Every live instance of every entity (the NPC layer and the tests read it). */
    /** Force a goal on every individual of an entity (call, rest, roam, flee), or clear it with null. */
    setEntityGoal(entityId, goal) { this._entities.setGoal(entityId, goal); }
    entityGoal(entityId) { return this._entities.goalOf(entityId); }
    /** Accepted holds take effect at the next safe action boundary; an active relocation finishes first. */
    setEntityAction(entityId, instanceN, action) { return this._entities.setAction(entityId, instanceN, action); }
    entityInstances() {
        return this._entities.instances();
    }
    /** A refused call tries again in CALL_RETRY_S — generation-guarded like the retrigger chain, so it never doubles. */
    scheduleCallRetry(key, stmt, track) {
        const gen = ++track._retriggerGen;
        this.scheduler.schedule({
            scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(drawRange(CALL_RETRY_S, this.rng)),
            type: AudioEventType.Callback,
            trackKey: key,
            debugLabel: `retry:${stmt.clip}`,
            onExecute: () => {
                if (this.tracks.get(key) !== track || track._retriggerGen !== gen)
                    return;
                this.retriggerAudio(key, stmt);
            },
        });
    }
    // ── Scene state: `zone` gating (setSceneState) ──
    /** Current exclusive scene state (null = no state → every zone matches). */
    _sceneState = null;
    /** Isolation of the current state's enclosure 0..1 — how much of a wall
     * sits between this state and elsewhere (wood ≈ 0.7, stone ≈ 0.95). */
    _sceneIsolation = 1;
    /** Current scene state, for HUDs and callers that need to reconcile. */
    get sceneState() {
        return this._sceneState;
    }
    /**
     * Declare the listener's current scene state — an OPEN name the scene/game
     * defines ('cabin', 'cave', 'underdeck'). Voices scoped with `zone`:
     * matching voices play clear; non-matching strict voices crossfade to
     * silence; non-matching soft voices are occluded by `isolation` — the
     * acoustic weight of whatever separates the states (a wooden wall muffles
     * the rain, it does not delete it). Zone-less voices are untouched.
     */
    setSceneState(name, opts) {
        const state = name ? name.toLowerCase() : null;
        const isolation = Math.max(0, Math.min(1, opts?.isolation ?? 1));
        if (state === this._sceneState && isolation === this._sceneIsolation)
            return;
        this._sceneState = state;
        this._sceneIsolation = isolation;
        // fadeS is the audible transition length; setTargetAtTime reaches ~95%
        // at 3× the time constant.
        const smoothing = Math.max(0.05, opts?.fadeS ?? 1.2) / 3;
        const ctxTime = this.ctx.currentTime;
        for (const track of this.tracks.values()) {
            this.applyZoneState(track);
            this._acoustics.applyMuffle(track, ctxTime, smoothing);
        }
    }
    /** Recompute a voice's zone gating against the current scene state. */
    applyZoneState(track) {
        const zones = track.statement.zones;
        if (!zones) {
            track._zoneMuted = false;
            track._zoneOcclusion = 0;
            return;
        }
        const match = this._sceneState === null || zones.includes(this._sceneState);
        track._zoneMuted = !match && track.statement.zoneStrict;
        track._zoneOcclusion = match || track.statement.zoneStrict ? 0 : this._sceneIsolation;
    }
    /** Drive `follow`-bound properties from their signals (spatial rate). */
    applyFollowBindings(track, stmt, ctxTime) {
        if (stmt.volumeFollow && !track.stopping) {
            const x = this._editHold.signalFor(stmt, stmt.volumeFollow.signal) ?? this.signalValue(track, stmt.volumeFollow.signal);
            if (!isNaN(x)) {
                const val = mapFollow(stmt.volumeFollow, x);
                track.volume = val;
                this._levels.writeVoiceGain(track, this.isTrackAudible(track) ? this._levels.levelGain(track, val) : 0, ctxTime);
            }
        }
        if (stmt.pitchFollow && !stmt.voiceId) {
            const x = this.signalValue(track, stmt.pitchFollow.signal);
            if (!isNaN(x)) {
                const val = mapFollow(stmt.pitchFollow, x) * track._pitchScale;
                track.pitch = val;
                // Doppler composes with the bound pitch (ratio 1 when nothing moves)
                track.sourceNode?.playbackRate.setTargetAtTime(val * track.doppler, ctxTime, PARAM_SMOOTHING);
            }
        }
        if (stmt.occlusionFollow) {
            const x = this.signalValue(track, stmt.occlusionFollow.signal);
            if (!isNaN(x)) {
                const val = mapFollow(stmt.occlusionFollow, x);
                const clamped = val < 0 ? 0 : val > 1 ? 1 : val;
                if (Math.abs(clamped - track.occlusion) > 0.005) {
                    track.occlusion = clamped;
                    this._acoustics.applyMuffle(track, ctxTime, 0.15);
                }
            }
        }
    }
    // ── Event bus: trigger voices (`on <event>` / `when <signal>`) ──
    /** Family key: a count-multiplied trigger statement expands into variants —
     * distinct takes of ONE conceptual voice. Fire picks one, not all. */
    static triggerFamilyKey(stmt) {
        return `${stmt.sourceId ?? stmt.hostRef ?? ''}|${stmt.eventName ?? ''}|${stmt.whenCondition ? `${stmt.whenCondition.signal}:${stmt.whenCondition.min}:${stmt.whenCondition.max}` : ''}|${stmt.genPrompt ?? stmt.clip.replace(/_\d+$/, '')}`;
    }
    /** A member trigger's family is per instance: each body has its own cooldown. */
    static memberFamilyKey(stmt, inst) {
        return `${SatieEngine.triggerFamilyKey(stmt)}|${inst.def.id}:${inst.n}`;
    }
    /** Last fire time (ctx seconds) per trigger family — cooldown state. */
    _triggerLastFired = new Map();
    _triggerLastTake = new Map();
    /** Forget a despawned body's contact cooldowns. Already sounding releases finish naturally. */
    releaseEmitter(id) {
        const suffix = `|body:${encodeURIComponent(id)}`;
        for (const key of this._triggerLastFired.keys())
            if (key.endsWith(suffix))
                this._triggerLastFired.delete(key);
    }
    /** Scratch for landed take paths during a fire (no per-fire allocation). */
    _takeScratch = new Array(8).fill('');
    /** True when the loaded script declares an `on <name>` voice — lets the UI
     * keep its own fallback (e.g. built-in footsteps) out of the way. Scene
     * scope excludes entity members, whose contacts belong to their own body. */
    hasTrigger(name, scope = 'all') {
        const event = name.toLowerCase();
        return this.statements.some(s => s.kind === 'trigger' && s.eventName === event && (scope === 'all' || s.entityId === null));
    }
    /**
     * Fire a runtime event into the script's trigger voices. Event names are an
     * OPEN vocabulary — this routes strings, it does not know what a footstep
     * is. The payload carries where it happened and, optionally, open-vocab
     * text (`{text}` substitutes into template gen prompts, keyed per text so
     * every surface/description gets its own cached takes).
     *
     * `scope: 'scene'` routes only non-entity voices (player/self contacts).
     * The default remains broadcast for world/social events.
     * Returns whether the event was audibly handled: true when at least one
     * trigger voice played (or is in its cooldown from a recent play — silence
     * that is intentional). False means nothing sounded and nothing recent did
     * — the engine is stopped, no voice matched, the template has no text yet,
     * or the take is still generating — so a caller with its own fallback
     * (e.g. built-in footsteps) knows to use it instead of going mute.
     */
    fireEvent(name, payload, scope = 'all') {
        if (!this._isPlaying)
            return false;
        if (payload?.gain !== undefined && (!Number.isFinite(payload.gain) || payload.gain < 0 || payload.gain > 1)) {
            throw new Error('Event gain must be finite and between 0 and 1.');
        }
        const event = name.toLowerCase();
        const hasPos = !!payload && payload.x !== undefined && payload.z !== undefined;
        // The world at the event's point (WorldFields): the surface it happened
        // on (`{text}`, unless the caller already described it) and the fields a
        // `when` on the answering voices selects by — the wading take for a
        // stride that landed in 0.6 m of water. A copy: the caller's object is
        // never mutated.
        const fp = hasPos ? this.fieldProvider() : null;
        if (fp) {
            const s = this._fieldScratch;
            fp.sampleInto(payload.x, payload.y ?? 0, payload.z, s);
            payload = { ...payload, depth: s.depth, submerged: s.submerged, liquid: s.liquid };
            if (!payload.text && s.surface)
                payload.text = s.surface;
        }
        this.logEvent('event', null, event, hasPos ? { x: payload.x, y: payload.y ?? 0, z: payload.z } : null, fp ? { depth: payload.depth, liquid: payload.liquid } : undefined);
        // Something happened HERE: perched agents within their startle radius flee.
        if (hasPos && this._entities.count)
            this._entities.startleNear(payload.x, payload.y ?? 0, payload.z);
        return this.dispatchTriggers(this.tracks.values(), event, payload, hasPos, scope);
    }
    /**
     * Route one event to the `on <event>` voices among `candidates`: drop the
     * zone-muted, apply each voice's `when` band (read at the EVENT's point
     * when the payload carries the field, else the voice's own) and its
     * `within` radius, group per family, let a `when`-gated voice REPLACE its
     * ungated siblings, and fire. Returns whether anything sounded.
     *
     * Two callers scan different candidate sets for the same rules: a
     * broadcast (`fireEvent`) scans every live track, a footfall scans only
     * the walking body's own members — a step is heard from the body that
     * took it, and must not answer for every other body in the scene.
     */
    dispatchTriggers(candidates, event, payload, hasPos, scope = 'all') {
        let programEvent;
        // A local map, deliberately: firing a voice that carries `emit` re-enters
        // this method through fireEvent, and a shared scratch would be cleared
        // out from under the iteration below.
        const families = new Map();
        let gated = false;
        for (const track of candidates) {
            const stmt = track.statement;
            if (stmt.kind !== 'trigger' || stmt.eventName !== event || track._triggerSpareFamily || track.stopping)
                continue;
            // Player/self contacts address scene-level foley, never every actor's feet.
            if (scope === 'scene' && (stmt.entityId !== null || track.entityInstance))
                continue;
            if (payload?.sourceId && stmt.sourceId !== payload.sourceId)
                continue;
            if (stmt.responders > 0 && track.entityInstance && payload?.actorId === `${track.entityInstance.def.id}:${track.entityInstance.n}`)
                continue;
            // A zone-muted trigger cannot sound — report unhandled so the caller's
            // fallback (or a matching voice in the current zone) covers it.
            if (track._zoneMuted)
                continue;
            // A `when` condition on an `on` voice gates the event — read at the
            // event's point when the payload carries the field, else the voice's.
            if (stmt.whenCondition) {
                const c = stmt.whenCondition;
                const fromPayload = payloadField(payload, c.signal);
                const x = fromPayload !== undefined ? fromPayload : this.whenSignalValue(track, c.signal, 0);
                if (isNaN(x) || x < c.min || x > c.max)
                    continue;
                gated = true;
            }
            // `within <m>`: only an event that happened near THIS voice reaches it.
            // A voice with no place of its own (no host, attachment, placement or
            // scatter) has nothing to measure from: it sits at the default spawn,
            // and a `within` there gated every event more than a few metres from the
            // world origin (courtyard-keeper, 2026-10-11). Such a voice answers the
            // event wherever it happened; the fire pins it to the contact point.
            if (stmt.within !== null && hasPos && (stmt.hostRef !== null || stmt.attachRef !== null || stmt.followTarget !== null || stmt.hasPlacement || stmt.scatter !== null || !!track.entityInstance)) {
                const dx = track.position.x - payload.x;
                const dy = track.position.y - (payload.y ?? track.position.y);
                const dz = track.position.z - payload.z;
                if (dx * dx + dy * dy + dz * dz > stmt.within * stmt.within)
                    continue;
            }
            // Entity members answer per INSTANCE — every body within range reacts,
            // not one delegate per script line.
            const fam = stmt.programId ? `program:${track.key}`
                : track.entityInstance ? SatieEngine.memberFamilyKey(stmt, track.entityInstance) : SatieEngine.triggerFamilyKey(stmt);
            const list = families.get(fam);
            if (list)
                list.push(track);
            else
                families.set(fam, [track]);
        }
        // Specific beats general: once a `when`-gated voice answers this event,
        // its ungated siblings stay silent — `on step when depth 0.4to1.3 …`
        // REPLACES the plain `on step …` in the water rather than doubling it.
        if (gated) {
            for (const [fam, list] of families)
                if (!list[0].statement.whenCondition)
                    families.delete(fam);
        }
        let handled = false;
        const responses = new Map();
        for (const pair of families) {
            const stmt = pair[1][0].statement;
            const group = responses.get(stmt) ?? [];
            group.push(pair);
            responses.set(stmt, group);
        }
        for (const [stmt, options] of responses) {
            if (stmt.programId)
                programEvent ??= new Map();
            if (stmt.respondChance < 1 && this.rng() >= stmt.respondChance)
                continue;
            const count = stmt.responders > 0 ? Math.max(1, Math.floor(stmt.responders)) : options.length;
            // Sample without replacement: at most N nearby bodies respond, not N
            // independently successful probability tests that can become a chorus.
            for (let i = 0; i < count && options.length; i++) {
                const index = stmt.responders > 0 ? Math.floor(this.rng() * options.length) : 0;
                const [fam, group] = options.splice(index, 1)[0];
                if (this.fireTriggerFamily(fam, group, payload, programEvent) !== 'silent')
                    handled = true;
            }
        }
        return handled;
    }
    fireTriggerFamily(familyKey, candidates, payload, programEvent) {
        const stmt = candidates[0].statement;
        // A body dispatch may give only its primary member; include its independent
        // release graphs without letting those graphs answer broadcasts twice.
        candidates = [...candidates];
        for (const t of this.tracks.values())
            if (t._triggerSpareFamily === familyKey)
                candidates.push(t);
        const now = this.ctx.currentTime;
        const cooldown = !stmt.cooldown.isNull
            ? stmt.cooldown.sample(this.rng)
            : (stmt.eventName ? TRIGGER_EVENT_COOLDOWN_S : TRIGGER_WHEN_COOLDOWN_S);
        const cooldownKey = payload?.emitterId ? `${familyKey}|body:${encodeURIComponent(payload.emitterId)}` : familyKey;
        const last = this._triggerLastFired.get(cooldownKey) ?? -Infinity;
        if (now - last < cooldown)
            return 'cooldown';
        // Prefer an idle take so overlapping fires rotate through variants
        const idle = candidates.filter(t => !t.sourceNode || t._sourceEndT <= this.clock.currentTime);
        let track = idle.length ? idle[Math.floor(this.rng() * idle.length)] : undefined;
        // Real simultaneous contacts keep their own gain, position and release.
        // A bounded pool grows only when needed; it never queues a late impact.
        if (!track && candidates.length < 8) {
            const template = candidates[0];
            const key = `${template.key}_overlap_${++this._spawnGeneration}`;
            this.createVoice(key, stmt, template.statementIndex, template.voiceIndex);
            track = this.tracks.get(key);
            if (track) {
                track._triggerSpareFamily = familyKey;
                track.entityInstance = template.entityInstance;
                track._member = template._member;
                track._pitchScale = template._pitchScale;
                track.position.x = template.position.x;
                track.position.y = template.position.y;
                track.position.z = template.position.z;
                track.pinned = { ...template.position };
            }
        }
        if (!track) {
            this.logEvent('drop', candidates[0], stmt.eventName ?? 'trigger', payload?.x !== undefined && payload.z !== undefined
                ? { x: payload.x, y: payload.y ?? 0, z: payload.z } : null, { reason: 'voice-capacity', ...(payload?.emitterId ? { emitterId: payload.emitterId } : {}) });
            return 'silent';
        }
        // The event's location pins the voice — a fire IS a position statement.
        // Voices without payload coordinates keep their scripted placement, and
        // a voice that has a body of its own (hosted on a world object, or a
        // member of an entity) answers from where it IS: the pigeons flush from
        // their ledge, not from the car that honked.
        // A point AT the thing the voice is on is the thing itself sounding: it rides along (a flock's call
        // keeps flying with the flock; it stayed where the birds took off). A point elsewhere is a contact
        // where it happened (a step below the camera, a hit on a wall). Physical, not by name; an explicit
        // `positionMode` always wins.
        const hostAt = stmt.hostRef && !track.entityInstance ? this._hosts.get(track.hostId ?? stmt.hostRef) : undefined;
        const atOwnHost = !!hostAt && !!payload && payload.x !== undefined && payload.z !== undefined
            && Math.hypot(payload.x - hostAt.x, (payload.y ?? hostAt.y) - hostAt.y, payload.z - hostAt.z) < HOST_POINT_M;
        const atContact = !stmt.programId && !!payload && payload.x !== undefined && payload.z !== undefined && payload.positionMode !== 'host'
            && !(payload.positionMode === undefined && atOwnHost)
            && (!track.entityInstance || payload.positionMode === 'contact' || !!payload.sourceId);
        track._triggerAtContact = atContact;
        if (atContact)
            this.setTrackPosition(track.key, payload.x, payload.y ?? 0, payload.z);
        // Template prompts resolve per fire: `{text}` → the payload's open-vocab
        // description, one cached take BANK per distinct substitution — several
        // distinct takes, a random one per fire, so a repeated event (strides)
        // never machine-guns one sample. Silent fires do NOT stamp the cooldown —
        // a phantom cooldown would suppress the first audible take right after
        // generation lands, and would make the silence read as "handled" to
        // fallback-owning callers.
        if (stmt.genPrompt && stmt.genPrompt.includes('{')) {
            const text = (payload?.text ?? '').trim();
            if (!text)
                return 'silent'; // nothing to describe: stay silent rather than literal "{text}"
            const shared = stmt.programId ? this._programs.current(stmt, track.key, programEvent) : undefined;
            if (shared) {
                // A broadcast consumes one bank turn, not one per speaker. Reuse the
                // cohort's chosen recording before touching template-bank history.
                this._triggerLastFired.set(cooldownKey, now);
                this.retriggerAudio(track.key, stmt, true, shared.bufferKey, false, payload, programEvent);
                return 'played';
            }
            const { prompt } = templateTake(stmt.genPrompt, text, 0);
            const explicit = recordingBank(stmt.recordings, text);
            const size = templateBankSize(stmt, text);
            let landedCount = 0;
            for (let i = 0; i < size; i++) {
                const takePath = templateRecording(stmt, text, i).clipPath;
                if (this.audioBuffers.has(takePath)) {
                    this._takeScratch[landedCount++] = takePath;
                }
                else if (explicit === undefined && !stmt.genKey && this.audioBuffers.has(legacyTemplateTake(stmt.genPrompt, text, i))) {
                    const legacy = legacyTemplateTake(stmt.genPrompt, text, i);
                    this._takeScratch[landedCount++] = legacy; // a scene saved before the full-text keys
                }
                else if (explicit === undefined) {
                    this.generateTriggerTake(stmt, prompt, takePath, i);
                }
            }
            if (landedCount > 0) {
                this._triggerLastFired.set(cooldownKey, now);
                const bankKey = JSON.stringify([familyKey, text]);
                let history = this._triggerLastTake.get(bankKey);
                if (!history) {
                    history = [];
                    this._triggerLastTake.set(bankKey, history);
                }
                if (stmt.takesInOrder) {
                    const last = history.at(-1);
                    let prior = -1;
                    const landedKey = (i) => {
                        const key = templateRecording(stmt, text, i).clipPath;
                        if (this.audioBuffers.has(key))
                            return key;
                        const legacy = legacyTemplateTake(stmt.genPrompt, text, i);
                        return explicit === undefined && !stmt.genKey && this.audioBuffers.has(legacy) ? legacy : undefined;
                    };
                    for (let i = 0; i < size; i++)
                        if (landedKey(i) === last && last !== undefined) {
                            prior = i;
                            break;
                        }
                    let selected = this._takeScratch[0];
                    for (let i = prior + 1; i < size; i++) {
                        const candidate = landedKey(i);
                        if (candidate) {
                            selected = candidate;
                            break;
                        }
                    }
                    history.length = 0;
                    history.push(selected);
                    this.retriggerAudio(track.key, stmt, true, selected, false, payload, programEvent);
                    return 'played';
                }
                // Exclude recent performances, not just the last one. With enough
                // authored takes this also prevents an obvious A-B-A-B alternation.
                const memory = Math.min(landedCount - 1, Math.ceil(landedCount / 2));
                while (history.length > memory)
                    history.shift();
                let choices = landedCount;
                for (let i = 0; i < choices;) {
                    if (history.includes(this._takeScratch[i]))
                        this._takeScratch[i] = this._takeScratch[--choices];
                    else
                        i++;
                }
                const selected = this._takeScratch[Math.floor(this.rng() * choices)];
                history.push(selected);
                this.retriggerAudio(track.key, stmt, true, selected, false, payload, programEvent);
                return 'played';
            }
            return 'silent';
        }
        // Fixed-clip trigger: a fire with no buffer yet only kicks off loading /
        // generation inside retriggerAudio — audible only once the buffer exists.
        const ready = this.hasAnyTake(stmt);
        if (ready)
            this._triggerLastFired.set(cooldownKey, now);
        this.retriggerAudio(track.key, stmt, true, undefined, false, payload, programEvent);
        return ready ? 'played' : 'silent';
    }
    /** Generate + cache a template trigger take (see {@link GenResolver.generateTriggerTake}); the requesting fire stays silent. */
    generateTriggerTake(stmt, prompt, clipPath, bankIndex = 0) {
        this._gen.generateTriggerTake(stmt, prompt, clipPath, bankIndex);
    }
    /**
     * Signal sample for `when` conditions. Unlike signalValue, distance/closing
     * are measured fresh from positions — _lastDistM only updates while a
     * source plays, and a parked trigger voice has none.
     */
    whenSignalValue(track, name, dtSec) {
        if (name === 'distance' || name === 'closing') {
            const dx = track.position.x - this._listenerPos.x;
            const dy = track.position.y - this._listenerPos.y;
            const dz = track.position.z - this._listenerPos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const lastDist = track._whenLastDist;
            track._whenLastDist = dist;
            if (name === 'distance')
                return dist;
            return lastDist >= 0 && dtSec > 0.001 ? (lastDist - dist) / dtSec : 0; // + = approaching
        }
        return this.signalValue(track, name);
    }
    setTrackPosition(key, x, y, z) {
        const track = this.tracks.get(key);
        if (!track)
            return;
        if (track.pinned) {
            track.pinned.x = x;
            track.pinned.y = y;
            track.pinned.z = z;
        }
        else {
            track.pinned = { x, y, z };
        }
        track.position.x = x;
        track.position.y = y;
        track.position.z = z;
        // A drag moves the TRUE position; the next world tick re-derives the
        // apparent one from it, so a stale doorway redirect is never kept.
        this._acoustics.writePannerPosition(track, track.apparent ?? track.position, this.ctx.currentTime);
    }
    async resolveAndRetrigger(key, stmt, clipPath) {
        if (!this.onMissingBuffer)
            return;
        try {
            const data = await this.onMissingBuffer(stmt.clip);
            if (!data) {
                this.addRuntimeWarning(`Audio not found: ${stmt.clip}`);
                return;
            }
            const audioBuffer = await decodeSynthAudio(this.ctx, data.slice(0)); // slice to avoid detach
            this.registerBuffer(clipPath, audioBuffer);
            // Retry playback if still playing
            if (this._isPlaying && this.tracks.has(key)) {
                this.retriggerAudio(key, stmt);
            }
        }
        catch (e) {
            this.addRuntimeWarning(`Failed to resolve audio "${stmt.clip}": ${e.message}`);
        }
    }
    // ── Stop a single track ──
    stopTrack(key, fadeOutTime = 0) {
        const track = this.tracks.get(key);
        if (!track)
            return;
        this.scheduler.cancelTrackEvents(key);
        const cleanup = () => {
            this.disposeTrackNodes(track);
            if (track.dormant)
                this._dormantVersion++;
            this.tracks.delete(key);
            this._tracksArrayDirty = true;
        };
        // Always use at least a 5ms micro-fade to avoid click on stop
        const effectiveFade = Math.max(fadeOutTime, 0.005);
        track.stopping = true; // the ramp owns the gain from here — tick writes stand down
        this.logEvent('stop', track, displayNameOf(track.statement));
        const now = this.ctx.currentTime;
        track.gainNode.gain.cancelScheduledValues(now);
        track.gainNode.gain.setValueAtTime(track.gainNode.gain.value, now);
        track.gainNode.gain.linearRampToValueAtTime(0, now + effectiveFade);
        this.scheduler.schedule({
            scheduledSample: this.clock.currentSample + this.clock.secondsToSamples(effectiveFade + 0.01),
            type: AudioEventType.Callback,
            trackKey: key + '_cleanup',
            debugLabel: `cleanup:${key}`,
            onExecute: cleanup,
        });
    }
    // ── Continuous per-frame updates ──
    updateTracks(doSpatial, spatialDtSec) {
        const now = this.clock.currentTime;
        const ctxTime = this.ctx.currentTime;
        if (doSpatial && this._world) {
            this._spatialTicks++;
            this.advanceWorld(spatialDtSec);
        }
        // Lazy generation's demand tick rides the spatial tick, once a second.
        if (doSpatial && this.lazyGeneration) {
            this._demandAccumS += spatialDtSec;
            if (this._demandAccumS >= DEMAND_TICK_S) {
                this._demandAccumS = 0;
                this.wakeDormant();
            }
        }
        // A voice waiting on a generated buffer is started by the one-shot
        // callback on its generation promise. If that callback is missed — the
        // scene reloaded mid-flight, playback was paused as it resolved — the
        // buffer sits in audioBuffers while the voice stays silent forever, and
        // only an unrelated re-Run brings it in. So reconcile here: whenever the
        // buffer set grows, give every still-pending voice another chance to
        // start. Gated on the count so a steady state costs one integer compare.
        const buffersChanged = this.audioBuffers.size !== this._pendingSweepBufferCount;
        if (buffersChanged)
            this._pendingSweepBufferCount = this.audioBuffers.size;
        // Listener speed — measured once per spatial tick, feeds the `speed`
        // signal for follow bindings on every track.
        if (doSpatial && spatialDtSec > 0.001) {
            const lp = this._listenerPos;
            const lt = this._lastListenerTickPos;
            if (lt.valid) {
                const dx = lp.x - lt.x, dy = lp.y - lt.y, dz = lp.z - lt.z;
                this._listenerSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz) / spatialDtSec;
            }
            lt.x = lp.x;
            lt.y = lp.y;
            lt.z = lp.z;
            lt.valid = true;
        }
        // The world under the listener (WorldFields): the medium the head is in
        // and the water under the feet, published every spatial tick — the
        // `depth` / `liquid` signals, and `submerged` through the medium stage.
        if (doSpatial) {
            const fp = this.fieldProvider();
            if (fp) {
                const s = this._fieldScratch;
                fp.sampleInto(this._listenerPos.x, this._listenerPos.y, this._listenerPos.z, s);
                this.setSignal('depth', s.depth);
                this.setSignal('liquid', s.liquid);
                this.setSubmerged(s.submerged);
            }
        }
        // Entity bodies move first, so the member tracks' pins below are this tick's.
        if (doSpatial && this._entities.count)
            this._entities.advance(now, spatialDtSec);
        // Attached / following voices pin to their target after bodies moved —
        // one level deep, so a parent's own position (static, or last tick's
        // motion) is current enough (scene-graph spec §3).
        if (doSpatial && this._hasAttachments)
            this.resolveAttachments();
        if (doSpatial && this._interiorApertureCentres.length)
            this._listenerInsideInterior = this.listenerInsideInterior();
        // Placed rooms: which side of each authored boundary is the head on?
        if (doSpatial && this._placedRooms.length)
            this._acoustics.updateListenerRoom(ctxTime, spatialDtSec);
        else if (doSpatial && this._acoustics.hasSoundscapes)
            this._acoustics.publishSoundscapeShares();
        const roomK = doSpatial && this._placedRooms.length
            ? 1 - Math.exp(-spatialDtSec / ROOM_OCC_SMOOTH_S) : 0;
        if (doSpatial)
            this._levels.beginTick();
        for (const track of this.tracks.values()) {
            const stmt = track.statement;
            const elapsed = now - track.startedAt;
            if (track._triggerSpareFamily && now >= track._sourceEndT) {
                this.disposeTrackNodes(track);
                this.tracks.delete(track.key);
                this._tracksArrayDirty = true;
                continue;
            }
            // Spatial position — rate-limited to 30fps with smoothing. Runs even
            // for pending voices: the viewport renders their position while the
            // buffer loads or generates.
            // Live hosts (`at water` / `at canopy`) follow the listener: the
            // nearest point of the water, the nearest crown overhead.
            if (doSpatial && !track._triggerAtContact && stmt.hostRef && this._world && this._hostingEnabled && (stmt.hostRef === 'overhead' || featureById(this._world, stmt.hostRef))) {
                // A thing going by on a strip runs its own line; between runs (and
                // while its take is still generating) it waits at the nearest stretch.
                if (track._passActive)
                    this.followPassHost(track, stmt, now);
                else
                    this.followDynamicHost(track, stmt);
            }
            else if (doSpatial && !track._triggerAtContact && track.pinned && this._world && this._hostingEnabled && !isNaN(track._hostBindX)) {
                // A copy of a distributed loop follows the listener through its class.
                const bx = this._listenerPos.x - track._hostBindX, bz = this._listenerPos.z - track._hostBindZ;
                if (bx * bx + bz * bz > CLASS_REBIND_M * CLASS_REBIND_M)
                    this.rehostTrack(track, stmt);
            }
            if (doSpatial && (stmt.field || track.pinned || stmt.wanderType !== WanderType.None)) {
                if (track.pinned) {
                    track.position.x = track.pinned.x;
                    track.position.y = track.pinned.y;
                    track.position.z = track.pinned.z;
                }
                else if (isTrajectoryWanderType(stmt.wanderType)) {
                    this.calculateTrajectoryPositionInPlace(track, stmt, elapsed);
                }
                else {
                    this.calculateWanderPositionInPlace(track, stmt, elapsed);
                }
                // Field voices ride the listener: the scripted position (static or
                // wandering) becomes an OFFSET from the head, so the source keeps its
                // direction at constant distance — rain overhead everywhere. With
                // rolloff 0 (set at creation) that reads as a spatially-extended
                // source rather than a point in the world.
                if (stmt.field && !track.pinned) {
                    track.position.x += this._listenerPos.x;
                    track.position.y += this._listenerPos.y;
                    track.position.z += this._listenerPos.z;
                }
                // Terrain conform: wander/trajectory/pinned positions never dip below
                // the world floor (birds circle over hills, not through them)
                if (track.position.y < track.floorY)
                    track.position.y = track.floorY;
                // A procedural world knows its own terrain: no raycast needed.
                if (this._world && this._hostingEnabled && !stmt.bed) {
                    const ground = heightAt(this._world.heightfield, track.position.x, track.position.z) + WORLD_FLOOR_CLEARANCE_M;
                    if (track.position.y < ground)
                        track.position.y = ground;
                }
                // A listener inside an interior hears an exterior voice THROUGH the
                // best aperture: the pass rewrites `apparent` (and only its own).
                if (this._interiorApertureCentres.length)
                    this.routeThroughInterior(track);
                // Smooth position transitions with 20ms time constant to avoid
                // stepping artifacts. A diffracted voice is heard at its apparent
                // point (the doorway), never at the true one behind the wall.
                this._acoustics.writePannerPosition(track, track.apparent ?? track.position, ctxTime);
            }
            // Placed-room boundary: every voice, every spatial tick (the listener
            // may have crossed a threshold even when the voice never moves).
            if (doSpatial && this._placedRooms.length)
                this._acoustics.tickPlacedRoomFloor(track, roomK, ctxTime);
            // Pending voices have no source yet — gain/DSP/acoustics writes would
            // be wasted until the buffer arrives. retriggerAudio re-checks the
            // buffer and is a no-op (beyond an in-flight guard) when it is absent.
            if (track.pending && !track.sourceNode) {
                if (buffersChanged)
                    this.retriggerAudio(track.key, stmt);
                continue;
            }
            this.updateSynthControls(track, elapsed);
            // Volume modulation — multiply per-voice with group modulation
            // (a `follow` binding owns the property instead — see below).
            // A stopping track's gain belongs to its fade-out ramp.
            if (!track.stopping && !stmt.volumeFollow && (stmt.volumeInterpolation || stmt.groupVolumeModulation)) {
                let val = stmt.volumeInterpolation
                    ? this.evalInterpCached(track, stmt.volumeInterpolation, elapsed)
                    : track.volume;
                if (stmt.groupVolumeModulation) {
                    val *= this.evalInterpCached(track, stmt.groupVolumeModulation, elapsed);
                }
                // Write back only when the voice owns an interpolation. In the
                // static-volume case track.volume IS the base the group modulation
                // multiplies, so storing the product would compound it every tick.
                if (stmt.volumeInterpolation)
                    track.volume = val;
                const audibleVal = this.isTrackAudible(track) ? this._levels.levelGain(track, val) : 0;
                this._levels.writeVoiceGain(track, audibleVal, ctxTime);
            }
            // Pitch modulation — multiply per-voice with group modulation
            if (!stmt.pitchFollow && !stmt.voiceId && (stmt.pitchInterpolation || stmt.groupPitchModulation)) {
                let val = stmt.pitchInterpolation
                    ? this.evalInterpCached(track, stmt.pitchInterpolation, elapsed) * track._pitchScale
                    : track.pitch;
                if (stmt.groupPitchModulation) {
                    val *= this.evalInterpCached(track, stmt.groupPitchModulation, elapsed);
                }
                // Doppler composes with musical pitch (ratio 1 when nothing moves)
                track.sourceNode?.playbackRate.setTargetAtTime(val * track.doppler, ctxTime, PARAM_SMOOTHING);
                // Same write-back rule as volume: track.pitch is the base in the
                // static case — storing the product would compound the modulation.
                if (stmt.pitchInterpolation)
                    track.pitch = val;
            }
            // Distance acoustics (air absorption + Doppler) — spatial rate
            if (doSpatial) {
                // `quiet` gates read the signal bus, so they work with or without a world (setSignal channels).
                if (track.entityInstance || stmt.quietGates.length || (this._world && stmt.activeHours))
                    this.updateActivity(track, stmt, ctxTime);
                if (this._world) {
                    // Foliage between the listener and the voice, at ~5 Hz per voice
                    // (staggered by voice index so the cost spreads across ticks).
                    if (this._hostingEnabled && !stmt.bed && !stmt.field && (this._spatialTicks + track.voiceIndex + track.statementIndex) % 6 === 0) {
                        this.updateFoliage(track, ctxTime);
                    }
                }
                // The source's own medium (WorldFields): a voice under the surface
                // heard from the bank, or the bank heard from under the surface,
                // crosses the air/water interface. Same stagger as foliage, offset
                // so the two never land on one tick; beds have no place to sample.
                if (!stmt.bed && (this._spatialTicks + track.voiceIndex + track.statementIndex) % 6 === 3) {
                    this._acoustics.updateImmersion(track, ctxTime);
                }
                this.updateDistanceAcoustics(track, ctxTime, spatialDtSec);
                // Animated size, written before the crossfade that reads it. The
                // viewport reads `_radiusM`/`_ringM` off tracksRef in its own frame
                // loop, so the sphere in the scene grows with the sound for free.
                if (stmt.radiusInterpolation || stmt.ringInterpolation) {
                    this.updateExtentSize(track, stmt, elapsed);
                }
                // Source extent rides the same rate (and must follow the position
                // write above so a shaped source's aim wins for moving voices).
                this.updateSourceExtent(track, ctxTime);
                // Floor / ceiling reflections mirror whatever point the panner was
                // just aimed at (position, apparent, or a shaped source's surface).
                this._acoustics.updateElevationCues(track, stmt, ctxTime);
                // Signal bindings ride the same rate; PARAM_SMOOTHING bridges ticks.
                if (stmt.volumeFollow || stmt.pitchFollow || stmt.occlusionFollow) {
                    this.applyFollowBindings(track, stmt, ctxTime);
                }
                // Level model (calibrated scenes): a follow-driven emission, this
                // voice's path from the distance just measured, and the loudest
                // received level the window chases after the loop.
                if (this._levels.calibrated)
                    this._levels.levelPathTick(track, stmt);
                // `when`-only trigger voices: fire on the signal ENTERING the band.
                // (`on` voices with a `when` are gated at fireEvent instead.)
                if (stmt.kind === 'trigger' && !stmt.eventName && stmt.whenCondition) {
                    const cond = stmt.whenCondition;
                    const x = this.whenSignalValue(track, cond.signal, spatialDtSec);
                    if (!isNaN(x)) {
                        const inside = x >= cond.min && x <= cond.max;
                        if (inside && !track._whenInside) {
                            this.fireTriggerFamily(SatieEngine.triggerFamilyKey(stmt), [track]);
                        }
                        track._whenInside = inside;
                    }
                }
            }
            // Interpolated color — only compute when interpolation exists
            if (stmt.colorRedInterpolation || stmt.colorGreenInterpolation || stmt.colorBlueInterpolation) {
                const r = stmt.colorRedInterpolation
                    ? clampChannel(Math.round(this.evalInterpCached(track, stmt.colorRedInterpolation, elapsed) * 255))
                    : track._staticColorR;
                const g = stmt.colorGreenInterpolation
                    ? clampChannel(Math.round(this.evalInterpCached(track, stmt.colorGreenInterpolation, elapsed) * 255))
                    : track._staticColorG;
                const b = stmt.colorBlueInterpolation
                    ? clampChannel(Math.round(this.evalInterpCached(track, stmt.colorBlueInterpolation, elapsed) * 255))
                    : track._staticColorB;
                track.color = rgbToHex(r, g, b);
            }
            // Interpolated alpha
            if (stmt.colorAlphaInterpolation) {
                track.alpha = clamp01(this.evalInterpCached(track, stmt.colorAlphaInterpolation, elapsed));
            }
            // DSP parameter interpolation — spatial rate (30 Hz). PARAM_SMOOTHING
            // bridges the gaps; 60 Hz automation was inaudible extra load.
            if (doSpatial && track.dspChain) {
                this.updateDSPInterpolations(track, stmt, elapsed, ctxTime);
            }
            // Reverb lives outside the chain, so it interpolates outside it too —
            // a voice whose only effect is reverb has no chain at all. Only dryWet
            // moves; roomSize/damping would need a new impulse response.
            if (doSpatial && track.reverbSend && stmt.reverbParams?.dryWetInterpolation) {
                this.updateReverbSend(track, stmt.reverbParams.dryWetInterpolation, elapsed, ctxTime);
            }
        }
        // The HDR window: once per spatial tick, chase the loudest received level
        // and re-level every governed voice against the new top.
        if (doSpatial && this._levels.calibrated)
            this._levels.governWindow(ctxTime, spatialDtSec);
        if (doSpatial)
            this._loopVoiceBudget.update();
    }
    // ── Level model: emission → received → HDR window (spatial/LevelModel.ts) ──
    /**
     * True while the loaded script states an `spl` anywhere. Then `volume` is a
     * dB trim on each voice's emission, propagation is the engine's, and the
     * window governs every gain; otherwise the level model is inert.
     */
    get calibrated() { return this._levels.calibrated; }
    /** Per-voice level report for the UI and the timeline (allocates — UI rate). See {@link LevelGovernor.levelReport}. */
    levelReport() { return this._levels.levelReport(); }
    // ── DSP interpolation (spatial rate, writes skipped while values are flat) ──
    /**
     * Drive an interpolating `reverb wet` on both sides of the split: the send
     * into the room bus and the dry attenuation ahead of the panner. The send
     * keeps its critical-distance scaling, so automating wetness changes how
     * much room you hear without disturbing where the crossover sits.
     */
    updateReverbSend(track, interp, elapsed, ctxTime) {
        const w = clamp01(this.evalInterpCached(track, interp, elapsed));
        if (Math.abs(w - track._lastReverbWet) < DSP_EPS)
            return;
        track._lastReverbWet = w;
        if (track.virtual)
            return;
        // Author-wins: a scripted voice is always on its own bus, so its critical
        // distance is its own room's regardless of any world room.
        const roomSize = track._reverbRoomSize;
        track.reverbSend.gain.setTargetAtTime(this.sendGainFor(track, w, roomSize), ctxTime, PARAM_SMOOTHING);
        track.reverbDry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
    }
    /** Caches describe writes to a particular node graph, not the logical voice. */
    resetDSPWriteCache(track) {
        track._lastFilterCutoff = track._lastFilterQ = track._lastFilterWet = NaN;
        track._lastDriveBucket = -1;
        track._lastDistWet = NaN;
        track._lastDelayTime = track._lastDelayFeedback = track._lastDelayWet = NaN;
        track._lastEQLow = track._lastEQMid = track._lastEQHigh = NaN;
        // Reverb wet is logical state; surviving sends are restored separately.
    }
    updateDSPInterpolations(track, stmt, elapsed, ctxTime) {
        const dsp = track.dspChain;
        // Change detection compares normalized pre-map values against the last
        // written one; NaN caches (fresh track) fail `< DSP_EPS` and write through.
        // Filter (values are 0-1 normalized, map to real ranges)
        if (stmt.filterParams && dsp.filterRef) {
            const fp = stmt.filterParams;
            if (fp.cutoffInterpolation) {
                const v = this.evalInterpCached(track, fp.cutoffInterpolation, elapsed);
                if (!(Math.abs(v - track._lastFilterCutoff) < DSP_EPS)) {
                    track._lastFilterCutoff = v;
                    dsp.filterRef.filter.frequency.setTargetAtTime(mapCutoff(v), ctxTime, PARAM_SMOOTHING);
                }
            }
            if (fp.resonanceInterpolation) {
                const v = this.evalInterpCached(track, fp.resonanceInterpolation, elapsed);
                if (!(Math.abs(v - track._lastFilterQ) < DSP_EPS)) {
                    track._lastFilterQ = v;
                    dsp.filterRef.filter.Q.setTargetAtTime(mapResonance(v), ctxTime, PARAM_SMOOTHING);
                }
            }
            if (fp.dryWetInterpolation) {
                const w = clamp01(this.evalInterpCached(track, fp.dryWetInterpolation, elapsed));
                if (!(Math.abs(w - track._lastFilterWet) < DSP_EPS)) {
                    track._lastFilterWet = w;
                    dsp.filterRef.wet.gain.setTargetAtTime(w, ctxTime, PARAM_SMOOTHING);
                    dsp.filterRef.dry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
                }
            }
        }
        // Distortion — curve reassignment forces the audio thread to rebuild
        // oversampling tables, so it only happens when the drive crosses into a
        // new quantization bucket (matching the curve cache in DSPChain).
        if (stmt.distortionParams && dsp.distortionRef) {
            const dp = stmt.distortionParams;
            if (dp.driveInterpolation) {
                const n = this.evalInterpCached(track, dp.driveInterpolation, elapsed);
                const bucket = driveBucket(n);
                if (bucket !== track._lastDriveBucket) {
                    track._lastDriveBucket = bucket;
                    dsp.distortionRef.shaper.curve = makeDistortionCurve(dsp.distortionRef.mode, mapDrive(n));
                }
            }
            if (dp.dryWetInterpolation) {
                const w = clamp01(this.evalInterpCached(track, dp.dryWetInterpolation, elapsed));
                if (!(Math.abs(w - track._lastDistWet) < DSP_EPS)) {
                    track._lastDistWet = w;
                    dsp.distortionRef.wet.gain.setTargetAtTime(w, ctxTime, PARAM_SMOOTHING);
                    dsp.distortionRef.dry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
                }
            }
        }
        // Delay
        if (stmt.delayParams && dsp.delayRef) {
            const dlp = stmt.delayParams;
            if (dlp.timeInterpolation) {
                const t = this.evalInterpCached(track, dlp.timeInterpolation, elapsed);
                if (!(Math.abs(t - track._lastDelayTime) < DSP_EPS)) {
                    track._lastDelayTime = t;
                    const delays = dsp.delayRef.delays;
                    for (let i = 0; i < delays.length; i++) {
                        delays[i].delayTime.setTargetAtTime(t, ctxTime, PARAM_SMOOTHING);
                    }
                }
            }
            if (dlp.feedbackInterpolation) {
                const v = this.evalInterpCached(track, dlp.feedbackInterpolation, elapsed);
                if (!(Math.abs(v - track._lastDelayFeedback) < DSP_EPS)) {
                    track._lastDelayFeedback = v;
                    dsp.delayRef.fbGain.gain.setTargetAtTime(v, ctxTime, PARAM_SMOOTHING);
                }
            }
            if (dlp.dryWetInterpolation) {
                const w = clamp01(this.evalInterpCached(track, dlp.dryWetInterpolation, elapsed));
                if (!(Math.abs(w - track._lastDelayWet) < DSP_EPS)) {
                    track._lastDelayWet = w;
                    dsp.delayRef.wet.gain.setTargetAtTime(w, ctxTime, PARAM_SMOOTHING);
                    dsp.delayRef.dry.gain.setTargetAtTime(1 - w, ctxTime, PARAM_SMOOTHING);
                }
            }
        }
        // EQ (0-1 normalized → -12dB to +12dB)
        if (stmt.eqParams && dsp.eqRef) {
            const eq = stmt.eqParams;
            if (eq.lowGainInterpolation) {
                const v = this.evalInterpCached(track, eq.lowGainInterpolation, elapsed);
                if (!(Math.abs(v - track._lastEQLow) < DSP_EPS)) {
                    track._lastEQLow = v;
                    dsp.eqRef.low.gain.setTargetAtTime(mapEQGain(v), ctxTime, PARAM_SMOOTHING);
                }
            }
            if (eq.midGainInterpolation) {
                const v = this.evalInterpCached(track, eq.midGainInterpolation, elapsed);
                if (!(Math.abs(v - track._lastEQMid) < DSP_EPS)) {
                    track._lastEQMid = v;
                    dsp.eqRef.mid.gain.setTargetAtTime(mapEQGain(v), ctxTime, PARAM_SMOOTHING);
                }
            }
            if (eq.highGainInterpolation) {
                const v = this.evalInterpCached(track, eq.highGainInterpolation, elapsed);
                if (!(Math.abs(v - track._lastEQHigh) < DSP_EPS)) {
                    track._lastEQHigh = v;
                    dsp.eqRef.high.gain.setTargetAtTime(mapEQGain(v), ctxTime, PARAM_SMOOTHING);
                }
            }
        }
    }
    // ── Interpolation (cached per-track) ──
    /** Evaluate modulation (fade/jump) using cached 'every' duration. */
    evalInterpCached(track, mod, elapsed) {
        const every = track._cachedDurations.get(mod) ?? mod.every.sample(this.rng);
        return SatieEngine.evalModulation(mod, elapsed, every);
    }
    /** Static evaluation for fade/jump modulation. */
    static evalModulation(mod, elapsed, every) {
        const n = mod.values.length;
        if (n === 0)
            return 0;
        if (n === 1)
            return mod.values[0];
        if (every <= 0)
            return mod.values[0];
        if (mod.modulationType === ModulationType.Fade) {
            return SatieEngine.evalFade(mod.values, elapsed, every, mod.loopMode);
        }
        else {
            return SatieEngine.evalJump(mod.values, elapsed, every, mod.loopMode);
        }
    }
    static evalFade(values, elapsed, every, loop) {
        const n = values.length;
        const segments = n - 1;
        if (loop === LoopMode.None) {
            const totalDur = segments * every;
            if (elapsed >= totalDur)
                return values[n - 1];
            const seg = Math.min((elapsed / every) | 0, segments - 1);
            const t = (elapsed - seg * every) / every;
            return values[seg] + (values[seg + 1] - values[seg]) * t;
        }
        if (loop === LoopMode.Restart) {
            // Cycle through all values and wrap: 0→1→2→0→1→2→...
            const cycleDur = n * every;
            const cycleT = elapsed % cycleDur;
            const seg = (cycleT / every) | 0;
            const t = (cycleT - seg * every) / every;
            const from = seg % n;
            const to = (seg + 1) % n;
            return values[from] + (values[to] - values[from]) * t;
        }
        // Bounce: 0→1→2→1→0→1→2→...
        const bounceSeg = 2 * (n - 1);
        const cycleDur = bounceSeg * every;
        const cycleT = elapsed % cycleDur;
        const seg = (cycleT / every) | 0;
        const t = (cycleT - seg * every) / every;
        let fromIdx, toIdx;
        if (seg < n - 1) {
            fromIdx = seg;
            toIdx = seg + 1;
        }
        else {
            const backSeg = seg - (n - 1);
            fromIdx = (n - 1) - backSeg;
            toIdx = fromIdx - 1;
        }
        return values[fromIdx] + (values[toIdx] - values[fromIdx]) * t;
    }
    static evalJump(values, elapsed, every, loop) {
        const n = values.length;
        if (loop === LoopMode.None) {
            const idx = Math.min((elapsed / every) | 0, n - 1);
            return values[idx];
        }
        if (loop === LoopMode.Restart) {
            const idx = ((elapsed / every) | 0) % n;
            return values[idx];
        }
        // Bounce: 0,1,2,1,0,1,2,1,...
        const bounceSeg = 2 * (n - 1);
        const seg = ((elapsed / every) | 0) % bounceSeg;
        const idx = seg < n ? seg : bounceSeg - seg;
        return values[idx];
    }
    /** Public evaluation — uses uncached path. */
    evaluateInterpolation(mod, elapsed) {
        const every = mod.every.sample(this.rng);
        return SatieEngine.evalModulation(mod, elapsed, every);
    }
    // ── Scatter (spawn distributions) ──
    /**
     * One instance's `scatter` offset, or null. Hosted and entity-member
     * voices never scatter: a body already decides where they are, and two
     * placement systems arguing produces birds inside tree trunks. A `bed` has
     * no position to offset either.
     */
    drawScatter(stmt, isMember) {
        if (!stmt.scatter || stmt.bed || stmt.hostRef || isMember)
            return null;
        return sampleScatter(stmt.scatter, this.rng);
    }
    /**
     * Draw a one-shot a fresh point from its distribution. A voice with no
     * placement path never recomputes its position, so the delta is applied
     * directly for that case; everything else picks it up on the next tick.
     */
    redrawScatter(track, stmt) {
        const prev = track._scatter;
        if (!prev || !stmt.scatter || stmt.kind === 'loop')
            return;
        const next = sampleScatter(stmt.scatter, this.rng);
        track._scatter = next;
        if (stmt.wanderType === WanderType.None && !track.pinned) {
            track.position.x += next.x - prev.x;
            track.position.y += next.y - prev.y;
            track.position.z += next.z - prev.z;
        }
    }
    /**
     * Add this instance's scatter offset to the position the placement/wander
     * maths just wrote. Called at the end of both position paths rather than
     * folded into the box, so a scattered voice still WANDERS around its own
     * point instead of the flock collapsing onto one path.
     */
    applyScatter(track) {
        const sc = track._scatter;
        if (!sc)
            return;
        track.position.x += sc.x;
        track.position.y += sc.y;
        track.position.z += sc.z;
    }
    // ── Spatial wander (in-place, no allocation) ──
    calculateWanderPositionInPlace(track, stmt, elapsed) {
        wanderPositionInto(stmt, elapsed, track._wanderSpeed, track._seeds, track.position);
        this.applyScatter(track);
    }
    calculateTrajectoryPositionInPlace(track, stmt, elapsed) {
        const trajectory = resolveTrajectory(stmt);
        if (!trajectory)
            return;
        // wanderHz is already cycles-per-second (mapTrajectorySpeed or the path's own rate).
        trajectoryPositionInto(stmt, trajectory, elapsed, track.wanderHz, track._trajectoryPhase, track._seeds, track.position);
        this.applyScatter(track);
    }
    sampleInitialColor(stmt) {
        if (stmt.colorRedRange || stmt.colorGreenRange || stmt.colorBlueRange) {
            const r = stmt.colorRedRange ? clampChannel(Math.round(stmt.colorRedRange.sample(this.rng) * 255)) : 0;
            const g = stmt.colorGreenRange ? clampChannel(Math.round(stmt.colorGreenRange.sample(this.rng) * 255)) : 0;
            const b = stmt.colorBlueRange ? clampChannel(Math.round(stmt.colorBlueRange.sample(this.rng) * 255)) : 0;
            return rgbToHex(r, g, b);
        }
        return stmt.staticColor ?? '#1a3a2a';
    }
    destroy() {
        this.stop();
        this.audioTickObservers.clear();
        // The world room survives stop() and loadScript() — a regenerated script
        // is still standing in the same world — so only a full destroy drops it.
        this._rooms.dispose();
        this._gestureUnlockCleanup?.();
        // Only close a context the engine created — an injected context belongs
        // to the embedding app's audio graph.
        if (this._ownsContext && this.ctx.state !== 'closed') {
            this.ctx.close().catch(() => { });
        }
    }
}
/**
 * Copy the first `maxDurationS` seconds of a buffer into a new AudioBuffer.
 * Returns the original buffer untouched when it is already short enough.
 * Used to cap decoded memory for user-dropped stems (a 5-minute stereo stem
 * decodes to ~100MB of Float32 PCM).
 */
export function trimAudioBuffer(buffer, maxDurationS, ctx) {
    if (buffer.duration <= maxDurationS)
        return buffer;
    const length = Math.max(1, Math.floor(maxDurationS * buffer.sampleRate));
    const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        out.copyToChannel(buffer.getChannelData(ch).subarray(0, length), ch);
    }
    return out;
}
//# sourceMappingURL=SatieEngine.js.map