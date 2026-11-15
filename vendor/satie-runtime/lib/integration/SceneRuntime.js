import { orientationFromVectors, orientationAxes } from '../export/ListenerOrientation.js';
import { stateSignalsFor } from './StateAcoustics.js';
import { ObjectTracking } from './ObjectTracking.js';
import { ObjectStateSchemas } from './ObjectStateSchema.js';
import { ObjectIdentity } from './ObjectIdentity.js';
import { SceneOperations } from './SceneOperations.js';
export { CharacterMotor } from './CharacterMotor.js';
export { FootContactTracker } from './FootContactTracker.js';
export { HostAudioBridge } from './HostAudioBridge.js';
export { SceneOperations } from './SceneOperations.js';
import { SatieEngine } from '../core/SatieEngine.js';
import { recordingReferences, takeCount, takeClipPath, isTemplatePrompt, templateRecording, templateBankSize } from '../core/GenRequests.js';
import { parseScene } from '../core/SatieParser.js';
import { mulberry32 } from '../core/Random.js';
import { SceneCapture } from './SceneCapture.js';
/** Framework-free runtime bridge. Engine adapters supply matrices and host positions in metres. */
export class SceneRuntime {
    engine;
    capture;
    contract;
    disposed = false;
    operations = null;
    unsubscribeOperations = null;
    tracking = new ObjectTracking();
    stateSchemas = new ObjectStateSchemas();
    identities = new ObjectIdentity();
    hosts = new Map();
    signals = new Map();
    sceneState = null;
    listener = [0, 0, 0];
    forward = [0, 0, -1];
    up = [0, 1, 0];
    hasListener = false;
    /** World matrices (metres, column-major) of hosts whose adapter has one; copied in place each frame. */
    hostMatrices = new Map();
    listenerAnchor = null;
    objectStates = new Map();
    abort = new AbortController();
    /** Always set: the developer's seed or one the runtime drew (A.3, 2026-11-08). */
    seed;
    seedSource;
    levelAnchorDb;
    assets = [];
    loadedStatements = null;
    constructor(options = {}) {
        if (options.levelAnchorDb != null && (!Number.isFinite(options.levelAnchorDb) || options.levelAnchorDb < 20 || options.levelAnchorDb > 120))
            throw new Error('Invalid playback level reference');
        if (options.seed != null && (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff))
            throw new Error('Seed must be a 32-bit non-negative integer');
        this.contract = options.contract;
        const declaredHosts = new Set();
        for (const object of options.contract?.scene.objects ?? []) {
            if (declaredHosts.has(object.id))
                throw new Error(`Duplicate object ID: ${object.id}`);
            declaredHosts.add(object.id);
            this.identities.ensure(object.id);
        }
        this.engine = options.engine ?? new SatieEngine();
        this.seed = options.seed ?? drawSeed();
        this.seedSource = options.seed != null ? 'developer' : 'runtime';
        this.engine.rng = mulberry32(this.seed);
        this.levelAnchorDb = options.levelAnchorDb ?? 75;
        this.engine.setLevelAnchorDb(this.levelAnchorDb);
        this.capture = new SceneCapture(this.engine, options.now);
    }
    /** Assets are resolved at authoring time; this path never generates or authenticates. */
    async load(scriptUrl = '/satie/scene.satie', samplesUrl = '/satie/samples.json') {
        this.assertAlive();
        const get = async (url) => {
            const response = await fetch(url, { signal: this.abort.signal });
            if (!response.ok)
                throw new Error(`Satie could not load ${url}: HTTP ${response.status}`);
            return response;
        };
        try {
            const [script, samples] = await Promise.all([
                get(scriptUrl).then(r => r.text()),
                get(samplesUrl).then(r => r.json()),
            ]);
            if (this.contract?.scriptHash) {
                const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
                const scriptHash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
                if (scriptHash !== this.contract.scriptHash)
                    throw new Error('Script checksum differs from scene contract. Run npx satie-runtime rebind public/satie after editing; new prompts need their assets first.');
            }
            const loadedAssets = [];
            const entries = Object.entries(samples);
            // Bounded parallel fetch/decode keeps large event banks from delaying first play serially.
            for (let offset = 0; offset < entries.length; offset += 4) {
                await Promise.all(entries.slice(offset, offset + 4).map(async ([clip, sample], slot) => {
                    this.assertAlive();
                    if (!sample || typeof sample.url !== 'string')
                        throw new Error(`Missing sample URL: ${clip}`);
                    const bytes = await (await get(new URL(sample.url, new URL(samplesUrl, globalThis.location?.href ?? 'http://localhost')).href)).arrayBuffer();
                    const audio = await this.engine.decodeAudioAsset(bytes, sample.sha256);
                    this.assertAlive();
                    this.engine.setAudioBuffer(clip, audio);
                    loadedAssets[offset + slot] = { clipPath: clip, ...(sample.sampleId ? { sampleId: sample.sampleId } : {}),
                        ...(this.engine.getAudioAssetHash(audio) ? { sha256: this.engine.getAudioAssetHash(audio) } : {}) };
                }));
            }
            this.assertAlive();
            this.engine.loadScript(script);
            this.loadedStatements = this.engine.scriptStatements;
            this.assets = loadedAssets;
            this.enableOperations(script, this.contract?.revision ?? 'initial');
        }
        catch (error) {
            this.dispose();
            throw error;
        }
    }
    /** Enable revisioned changes for a preloaded scene. Does not re-load or restart it. */
    enableOperations(script, revision = 'initial') {
        this.assertAlive();
        this.unsubscribeOperations?.();
        this.loadedStatements = this.engine.scriptStatements;
        this.operations = new SceneOperations(script, revision, (change, next) => {
            if (this.engine.scriptStatements !== this.loadedStatements)
                throw new Error('Scene changed outside the operation contract; rebase first.');
            if (change.kind === 'source' || change.kind === 'script') {
                this.engine.loadScript(next);
                this.loadedStatements = this.engine.scriptStatements;
                this.capture.invalidateRevision();
            }
            else if (change.kind === 'event')
                this.event(change.name, change.position ? { x: change.position[0], y: change.position[1], z: change.position[2] } : undefined, change.text);
            else if (change.kind === 'signal')
                this.signal(change.name, change.value);
            else
                this.state(change.name, change.isolation);
        });
        this.unsubscribeOperations = this.engine.subscribeAudioTick(time => this.operations?.flush(time));
    }
    schedule(operation) {
        this.assertAlive();
        if (!this.operations)
            throw new Error('Load a scene before scheduling changes.');
        if (operation.change.kind === 'script') {
            const buffers = this.engine.getAudioBuffers();
            for (const statement of parseScene(operation.change.script).statements) {
                const references = recordingReferences(statement);
                if (isTemplatePrompt(statement.genPrompt)) {
                    const texts = this.contract?.scene.events?.find(event => event.name === statement.eventName)?.surfaces;
                    if (!texts?.length && statement.recordings?.takes === undefined)
                        throw new Error('Declare event surfaces before scheduling a template source.');
                    for (const text of texts ?? [])
                        for (let k = 0; k < templateBankSize(statement, text); k++)
                            references.push(templateRecording(statement, text, k).clipPath);
                }
                else
                    for (let k = 0; k < takeCount(statement); k++)
                        references.push(takeClipPath(statement, k));
                for (const clip of new Set(references)) {
                    if (!buffers.has(clip) && !(clip === takeClipPath(statement, 0) && !statement.recordings?.takes && buffers.has(statement.clip))) {
                        throw new Error(`Prepare the source asset before scheduling: ${clip}`);
                    }
                }
            }
        }
        this.operations.prepare(operation, this.engine.currentTime);
    }
    assertAlive() { if (this.disposed)
        throw new Error('Satie scene has been disposed.'); }
    /** Only state supplied through this adapter. Geometry/materials require a host callback. */
    authoringContext() {
        this.assertAlive();
        return { version: 'satie.authoring-context/v1', source: 'adapter-state', units: 'metres',
            ...(this.hasListener ? { listener: [...this.listener], listenerForward: [...this.forward], listenerUp: [...this.up] } : {}),
            hosts: Object.fromEntries([...this.hosts].map(([id, point]) => [id, [...point]])),
            signals: Object.fromEntries(this.signals), state: this.sceneState };
    }
    async start() {
        this.assertAlive();
        // Invoke play synchronously from the gesture; its first resume must not wait for fetching.
        this.capture.action({ kind: 'start', name: 'play' });
        const playing = this.engine.play();
        await playing;
        if (this.disposed)
            this.engine.stop();
    }
    stop() {
        this.capture.action({ kind: 'stop', name: 'stop' });
        this.engine.stop();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.abort.abort();
        this.unsubscribeOperations?.();
        if (this.capture.active)
            this.capture.end();
        this.hosts.clear();
        this.identities.clear();
        this.stateSchemas.clear();
        this.tracking.clear();
        this.hostMatrices.clear();
        this.objectStates.clear();
        this.engine.destroy();
    }
    setHostPosition(id, x, y, z) {
        this.assertAlive();
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
            throw new Error(`Invalid position for ${id}`);
        const objectInstanceId = this.objectInstanceId(id);
        if (this.tracking.get(id)?.reason === 'detached')
            this.recoverObjectTracking(id);
        let position = this.hosts.get(id);
        if (!position) {
            position = [x, y, z];
            this.hosts.set(id, position);
            this.capture.action({ kind: 'bind', name: id, objectInstanceId, position });
        }
        else if (position[0] !== x || position[1] !== y || position[2] !== z) {
            position[0] = x;
            position[1] = y;
            position[2] = z;
            // Coalesced: one host-position per host at the next 10 Hz tick, the last position winning.
            this.capture.hostMoved(id, position);
        }
        this.engine.setHostPosition(id, x, y, z);
    }
    /**
     * A bound host's world matrix in metres (16 numbers, column-major like three.js `Matrix4.elements`),
     * recorded in frames as `hostMatrices` for adapters that have one. Copied in place; no allocation per call.
     */
    setHostMatrix(id, elements) {
        this.assertAlive();
        if (elements.length !== 16)
            throw new Error(`Host matrix for ${id} needs 16 numbers`);
        let matrix = this.hostMatrices.get(id);
        if (!matrix) {
            matrix = new Array(16).fill(0);
            this.hostMatrices.set(id, matrix);
        }
        for (let i = 0; i < 16; i++)
            matrix[i] = elements[i];
    }
    /** Identity persists through detachment; destruction ends this lifetime. */
    objectInstanceId(id) { this.assertAlive(); return this.identities.ensure(id); }
    destroyObject(id) {
        this.assertAlive();
        const objectInstanceId = this.identities.get(id);
        this.unbind(id);
        this.identities.retire(id);
        this.stateSchemas.delete(id);
        this.tracking.delete(id);
        if (objectInstanceId)
            this.capture.action({ kind: 'object-destroy', name: id, objectInstanceId });
    }
    unbind(id) {
        this.assertAlive();
        this.hosts.delete(id);
        this.hostMatrices.delete(id);
        this.objectStates.delete(id);
        if (this.identities.get(id))
            this.tracking.set(id, { status: 'lost', reason: 'detached' });
        this.engine.clearHost(id);
        this.capture.action({ kind: 'unbind', name: id, objectInstanceId: this.identities.get(id) });
    }
    updateListener(matrix) {
        this.assertAlive();
        this.engine.setListenerFromMatrix(matrix);
        const pose = SatieEngine.listenerPoseFromMatrix(matrix);
        this.hasListener = true;
        this.listener[0] = pose.px;
        this.listener[1] = pose.py;
        this.listener[2] = pose.pz;
        this.forward[0] = pose.fx;
        this.forward[1] = pose.fy;
        this.forward[2] = pose.fz;
        this.up[0] = pose.ux;
        this.up[1] = pose.uy;
        this.up[2] = pose.uz;
    }
    /** The listener's full pose without a matrix: position, forward and up in metres (unit directions). */
    setListenerPose(position, forward, up = [0, 1, 0]) {
        this.assertAlive();
        if (![...position, ...forward, ...up].every(Number.isFinite))
            throw new Error('Listener pose must be finite');
        const axes = orientationAxes(orientationFromVectors(forward, up));
        const fl = Math.hypot(forward[0], forward[1], forward[2]), ul = Math.hypot(up[0], up[1], up[2]);
        if (fl < 1e-12 || ul < 1e-12)
            throw new Error('Listener forward and up must not be zero');
        this.hasListener = true;
        this.listener[0] = position[0];
        this.listener[1] = position[1];
        this.listener[2] = position[2];
        this.forward[0] = forward[0] / fl;
        this.forward[1] = forward[1] / fl;
        this.forward[2] = forward[2] / fl;
        this.up[0] = axes.up[0];
        this.up[1] = axes.up[1];
        this.up[2] = axes.up[2];
        this.engine.setListenerPosition(position[0], position[1], position[2]);
        this.engine.setListenerOrientation(this.forward[0], this.forward[1], this.forward[2], this.up[0], this.up[1], this.up[2]);
    }
    /** Adapter supplies the resolved world ear point; local offsets alone lose parent rotation. */
    setListenerAnchor(anchor) {
        if (this.disposed && !anchor)
            return;
        this.assertAlive();
        if (anchor && (!anchor.hostId || !anchor.position.every(Number.isFinite)))
            throw new Error('Invalid listener anchor');
        this.listenerAnchor = anchor;
    }
    loseObjectTracking(bodyId, reason = 'tracking-loss') {
        this.assertAlive();
        if (!reason || reason.length > 256)
            throw new Error('Tracking loss requires a bounded reason');
        const objectInstanceId = this.objectInstanceId(bodyId);
        this.objectStates.delete(bodyId);
        const tracking = { status: 'lost', reason };
        this.tracking.set(bodyId, tracking);
        this.capture.action({ kind: 'object-tracking', name: bodyId, bodyId, objectInstanceId, tracking });
    }
    recoverObjectTracking(bodyId) {
        this.assertAlive();
        const objectInstanceId = this.objectInstanceId(bodyId);
        this.objectStates.delete(bodyId);
        const tracking = { status: 'awaiting-report' };
        this.tracking.set(bodyId, tracking);
        this.capture.action({ kind: 'object-tracking', name: bodyId, bodyId, objectInstanceId, tracking });
    }
    reportCaptureGap(reason) {
        this.assertAlive();
        if (!reason || reason.length > 256)
            throw new Error('Capture gap requires a bounded reason');
        for (const bodyId of Object.keys(this.identities.snapshot())) {
            this.objectStates.delete(bodyId);
            this.tracking.set(bodyId, { status: 'lost', reason });
        }
        this.capture.action({ kind: 'capture-gap', name: reason });
    }
    objectStateIsCurrent(bodyId, group, value) {
        return this.tracking.get(bodyId)?.status === 'tracking' && this.objectStates.get(bodyId)?.get(group) === value;
    }
    declareObjectStates(bodyId, schema) {
        this.assertAlive();
        const objectInstanceId = this.objectInstanceId(bodyId);
        const stateSchema = this.stateSchemas.declare(bodyId, schema);
        this.capture.action({ kind: 'object-state-schema', name: bodyId, bodyId, objectInstanceId, stateSchema });
    }
    validateObjectStateReport(bodyId, group, value) {
        this.assertAlive();
        if (!bodyId || !group || !value)
            throw new Error('Object state requires body, group and value');
        this.tracking.assertReportable(bodyId);
        this.stateSchemas.validate(bodyId, group, value);
    }
    /** Preserve independent per-object state axes; these do not change the global scene mix. */
    objectState(bodyId, group, value) {
        this.validateObjectStateReport(bodyId, group, value);
        let states = this.objectStates.get(bodyId);
        if (!states) {
            states = new Map();
            this.objectStates.set(bodyId, states);
        }
        if (states.get(group) === value)
            return;
        const stateSignals = stateSignalsFor(this.stateSchemas.get(bodyId), group, value);
        // Validate every output before applying any of the transition.
        for (const [name, n] of Object.entries(stateSignals ?? {}))
            this.validateSignal(name, n);
        for (const [name, n] of Object.entries(stateSignals ?? {})) {
            this.engine.setSignal(name, n);
            this.signals.set(name, n);
        }
        states.set(group, value);
        this.tracking.set(bodyId, { status: 'tracking' });
        this.capture.action({ kind: 'object-state', bodyId, objectInstanceId: this.objectInstanceId(bodyId), name: group, text: value,
            ...(stateSignalsFor(this.stateSchemas.get(bodyId), group, value) !== undefined ? { stateSignals: { ...stateSignalsFor(this.stateSchemas.get(bodyId), group, value) } } : {}) });
    }
    clearObjectState(bodyId) {
        this.assertAlive();
        this.tracking.set(bodyId, { status: 'awaiting-report' });
        if (this.objectStates.delete(bodyId))
            this.capture.action({ kind: 'object-state-clear', name: '', bodyId, objectInstanceId: this.objectInstanceId(bodyId) });
    }
    entityAction(entityId, instance, action) {
        this.assertAlive();
        const accepted = this.engine.setEntityAction(entityId, instance, action);
        this.capture.action({ kind: 'entity-action', name: entityId, instance, text: action ?? '', accepted });
        return accepted;
    }
    steerEntity(entityId, instance, position) {
        this.assertAlive();
        if (!position.every(Number.isFinite))
            throw new Error('Entity destination must be finite');
        const accepted = this.engine.steerInstance(entityId, instance, ...position);
        this.capture.action({ kind: 'entity-steer', name: entityId, instance, position, accepted });
        return accepted;
    }
    captureFrame() {
        if (this.loadedStatements && this.engine.scriptStatements !== this.loadedStatements)
            this.capture.invalidateRevision();
        this.capture.frame(() => {
            const levels = new Map(this.engine.levelReport().voices.map(v => [v.key, v]));
            return {
                listener: [...this.listener], listenerForward: [...this.forward], listenerUp: [...this.up], hosts: [...this.hosts.keys()],
                ...(this.listenerAnchor ? { listenerAnchor: { ...this.listenerAnchor, position: [...this.listenerAnchor.position],
                        ...(this.listenerAnchor.hostMatrix ? { hostMatrix: [...this.listenerAnchor.hostMatrix] } : {}),
                        ...(this.listenerAnchor.offset ? { offset: [...this.listenerAnchor.offset] } : {}) } } : {}),
                objectInstances: this.identities.snapshot(),
                objectTracking: this.tracking.snapshot(Object.keys(this.identities.snapshot())),
                objectStateSchemas: this.stateSchemas.snapshot(Object.keys(this.identities.snapshot())),
                objectStates: Object.fromEntries([...this.objectStates].map(([id, states]) => [id, Object.fromEntries(states)])),
                hostPositions: Object.fromEntries([...this.hosts].map(([id, point]) => [id, [...point]])),
                ...(this.hostMatrices.size ? { hostMatrices: Object.fromEntries([...this.hostMatrices].filter(([id]) => this.hosts.has(id)).map(([id, m]) => [id, [...m]])) } : {}),
                signals: Object.fromEntries(this.signals), state: this.sceneState,
                tracks: this.engine.getTrackViews().map(track => {
                    const level = levels.get(track.key);
                    return { key: track.key, sourceId: track.statement.sourceId, label: track.statement.clip, statementIndex: track.statementIndex,
                        objectInstanceId: this.identities.get(track.hostId ?? track.statement.hostRef ?? ''),
                        host: track.hostId ?? track.statement.hostRef, pending: track.pending,
                        playing: level?.sounding ?? (track.isPlaying && !track.virtual), virtual: track.virtual,
                        position: [track.position.x, track.position.y, track.position.z],
                        occlusion: track.occlusion, gain: level?.gain ?? track.volume, pitch: track.pitch,
                        surfaceDistanceM: track.surfaceDistanceM, sourceExtentDeg: track.sourceExtentDeg,
                        ...(level && Number.isFinite(level.receivedDb) ? { receivedDb: level.receivedDb } : {}) };
                }),
            };
        });
    }
    /**
     * Start a capture. `onSegment` receives every closed segment (the last one included): with it a
     * channel at its cap (CAPTURE_CAPS) closes the segment and opens the next, each standing alone for
     * replay (the new segment begins with the bound hosts, signals, state and transport, and a frame).
     */
    beginCapture(options = {}) {
        this.assertAlive();
        this.capture.begin({ revision: this.contract?.revision, seed: this.seed, seedSource: this.seedSource, assets: this.assets, levelAnchorDb: this.levelAnchorDb,
            ...(options.onSegment ? { onSegment: options.onSegment, onSegmentOpen: () => this.recordSegmentStart() } : {}) });
        this.recordSegmentStart();
    }
    /** What a fresh segment must know to replay on its own: the state the previous segment left. */
    recordSegmentStart() {
        for (const [bodyId, stateSchema] of Object.entries(this.stateSchemas.snapshot(Object.keys(this.identities.snapshot())))) {
            if (stateSchema.basis === 'unknown')
                continue;
            this.capture.action({ kind: 'object-state-schema', name: bodyId, bodyId, objectInstanceId: this.objectInstanceId(bodyId), stateSchema });
        }
        for (const [bodyId, tracking] of Object.entries(this.tracking.snapshot(Object.keys(this.identities.snapshot())))) {
            if (tracking.status !== 'tracking' && this.tracking.get(bodyId))
                this.capture.action({ kind: 'object-tracking', name: bodyId, bodyId, objectInstanceId: this.objectInstanceId(bodyId), tracking });
        }
        for (const [id, position] of this.hosts)
            this.capture.action({ kind: 'bind', name: id, objectInstanceId: this.objectInstanceId(id), position });
        for (const [name, value] of this.signals)
            this.capture.action({ kind: 'signal', name, value });
        if (this.sceneState !== null)
            this.capture.action({ kind: 'state', name: this.sceneState, value: 0.5 });
        for (const [bodyId, states] of this.objectStates)
            for (const [group, value] of states)
                this.capture.action({ kind: 'object-state', bodyId, objectInstanceId: this.objectInstanceId(bodyId), name: group, text: value,
                    ...(stateSignalsFor(this.stateSchemas.get(bodyId), group, value) !== undefined ? { stateSignals: { ...stateSignalsFor(this.stateSchemas.get(bodyId), group, value) } } : {}) });
        if (this.engine.isPlaying)
            this.capture.action({ kind: 'start', name: 'play' });
        this.captureFrame();
    }
    /** Close the open segment now (delivered to `onSegment`) and continue in the next; false without a listener. */
    rolloverCapture() { return this.capture.rollover(); }
    endCapture() { return this.capture.end(); }
    event(name, at, text, evidence) {
        return this.eventAtMeters(name, at, text, evidence);
    }
    /** Explicit metre boundary for shared physical adapters, even on a scene-unit subclass. */
    eventAtMeters(name, at, text, evidence) {
        this.assertAlive();
        const event = this.contract?.scene.events?.find(e => e.name === name);
        if (this.contract?.scene.events && !event)
            throw new Error(`Undeclared Satie event: ${name}`);
        if (event?.surfaces?.length && (!text || !event.surfaces.includes(text)))
            throw new Error(`Event ${name} requires a declared surface.`);
        if (at && ![at.x, at.y, at.z].every(Number.isFinite))
            throw new Error('Event contact point must be finite');
        if (evidence?.occurredAt != null && !Number.isFinite(evidence.occurredAt))
            throw new Error('Event time must be finite');
        if (evidence?.gain != null && (!Number.isFinite(evidence.gain) || evidence.gain < 0 || evidence.gain > 1))
            throw new Error('Event gain must be in 0..1');
        const previousVersion = this.engine.eventLog.version;
        const accepted = this.engine.fireEvent(name, { ...at, ...(text != null ? { text } : {}),
            ...(evidence?.sourceId ? { sourceId: evidence.sourceId } : {}),
            ...(evidence?.bodyId ? { emitterId: evidence.bodyId } : {}), ...(evidence?.gain != null ? { gain: evidence.gain } : {}) });
        if (!this.capture.active)
            return accepted;
        const count = Math.min(this.engine.eventLog.version - previousVersion, this.engine.eventLog.size);
        const recent = count > 0 ? this.engine.eventLog.snapshot().slice(-count) : [];
        const fired = recent.find(entry => entry.kind === 'fire' && (!evidence?.sourceId || entry.sourceId === evidence.sourceId));
        this.capture.action({ kind: 'event', name, accepted, ...(at ? { position: [at.x, at.y, at.z] } : {}), ...(text != null ? { text } : {}),
            ...(evidence ? { objectInstanceId: evidence.bodyId ? this.objectInstanceId(evidence.bodyId) : undefined, bodyId: evidence.bodyId, contactId: evidence.contactId, cause: evidence.cause, simulationTime: evidence.simulationTime } : {}),
            ...(fired?.sourceId ? { sourceId: fired.sourceId } : {}),
            ...(fired?.bufferKey ? { bufferKey: fired.bufferKey } : {}),
            ...(fired ? { eventGain: fired.eventGain, effectiveGain: fired.effectiveGain } : {}),
            ...(fired?.estimatedOnsetTime != null ? { timingBasis: 'pcm-onset-estimate', onsetOffsetSeconds: fired.bufferOffsetSeconds } : {}) }, 
        // The capture makes these segment-relative when it stores the action, after any rollover this action causes.
        { ...(evidence?.occurredAt != null ? { occurredAt: evidence.occurredAt } : {}),
            ...(fired?.audioStartTime != null ? { audioStartTime: fired.audioStartTime } : {}),
            ...(fired?.estimatedOnsetTime != null ? { estimatedOnsetTime: fired.estimatedOnsetTime } : {}) });
        return accepted;
    }
    validateSignal(name, value) {
        this.assertAlive();
        const signal = this.contract?.scene.signals?.find(s => s.name === name);
        if (this.contract?.scene.signals && !signal)
            throw new Error(`Undeclared Satie signal: ${name}`);
        if (!Number.isFinite(value) || (signal?.min != null && value < signal.min) || (signal?.max != null && value > signal.max))
            throw new Error(`Signal ${name} is outside its declared range.`);
    }
    signal(name, value) {
        this.validateSignal(name, value);
        const changed = this.signals.get(name) !== value;
        this.engine.setSignal(name, value);
        this.signals.set(name, value);
        if (changed)
            this.capture.signalChanged(name, value);
    }
    state(name, isolation = 0.5) {
        this.assertAlive();
        if (name != null && this.contract?.scene.states && !this.contract.scene.states.some(s => s.name === name))
            throw new Error(`Undeclared Satie state: ${name}`);
        this.engine.setSceneState(name, { isolation });
        this.sceneState = name;
        this.capture.action({ kind: 'state', name: name ?? '', value: isolation });
    }
    /** Legacy listener-local convenience. For physical feet use HostAudioBridge with the actual contact point. */
    step(surface) {
        return this.eventAtMeters('step', { x: this.listener[0], y: this.listener[1], z: this.listener[2] }, surface);
    }
}
/** A 32-bit seed from the platform's randomness, so an unseeded runtime is still reproducible from its capture. */
function drawSeed() {
    const c = globalThis.crypto;
    if (c?.getRandomValues)
        return c.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 0x100000000);
}
//# sourceMappingURL=SceneRuntime.js.map