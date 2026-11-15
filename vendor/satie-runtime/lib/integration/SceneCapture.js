import { AUDIO_CLOCK_TOLERANCE_S, AUDIO_CLOCK_WARNING, CAPTURE_CAPS, RUNTIME_VERSION } from './contracts.js';
export { AUDIO_CLOCK_TOLERANCE_S, AUDIO_CLOCK_WARNING };
/** Local, bounded capture. No network, account, upload, or automatic training contribution. */
export class SceneCapture {
    engine;
    now;
    data = null;
    started = 0;
    sessionStarted = 0;
    audioStarted = 0;
    audioClockWarned = false;
    eventVersion = 0;
    warningBaseline = new Set();
    lastFrame = -Infinity;
    options = {};
    segment = 0;
    session = '';
    /** Host moves since the last 10 Hz tick; the last position per host wins (A.1, 2026-11-08). */
    pendingMoves = new Map();
    recordedPositions = new Map();
    /** Signal changes since the last 10 Hz tick; the last value per signal wins. A signal eased every frame
     *  (storm intensity, tension) otherwise fills the action cap in about a minute (spec 011 dogfood, 2026-11-09). */
    pendingSignals = new Map();
    recordedSignals = new Map();
    rolling = false;
    constructor(engine, now = () => performance.now() / 1000) {
        this.engine = engine;
        this.now = now;
    }
    begin(options = {}) {
        this.options = options;
        this.segment = 0;
        this.session = sessionId();
        this.sessionStarted = this.now();
        this.pendingMoves.clear();
        this.recordedPositions.clear();
        this.pendingSignals.clear();
        this.recordedSignals.clear();
        this.open();
    }
    open() {
        this.started = this.now();
        this.audioStarted = this.engine.audioContext.currentTime;
        this.audioClockWarned = false;
        this.eventVersion = this.engine.eventLog.version;
        this.warningBaseline = new Set(this.engine.runtimeWarnings);
        this.lastFrame = -Infinity;
        const options = this.options;
        this.data = {
            version: 'satie.playthrough/v2', durationS: 0, frames: [], events: [], warnings: [...this.engine.runtimeWarnings], actions: [],
            assets: options.assets?.map(asset => ({ ...asset })) ?? [],
            provenance: { runtimeVersion: RUNTIME_VERSION, sceneRevision: options.revision ?? null, seed: options.seed ?? null,
                ...(options.seedSource ? { seedSource: options.seedSource } : {}),
                clock: 'capture-relative-monotonic-seconds', levelAnchorDb: options.levelAnchorDb ?? 75, audioEvidence: 'runtime-model',
                segment: this.segment, segmentStartS: Math.max(0, this.started - this.sessionStarted), session: this.session },
            truncated: false,
            truncation: { frames: 0, events: 0, actions: 0 },
        };
    }
    get active() { return this.data !== null; }
    /** The 0-based index of the open segment. */
    get currentSegment() { return this.segment; }
    invalidateRevision() {
        if (!this.data?.provenance)
            return;
        this.data.provenance.sceneRevision = null;
        if (!this.data.warnings.includes('Script changed during capture; recapture the new revision.'))
            this.data.warnings.push('Script changed during capture; recapture the new revision.');
    }
    get time() { return Math.max(0, this.now() - this.started); }
    /** Keep input and output clocks explicit; a physics tick count is not a wall clock. */
    fromHostTime(time) { return time - this.started; }
    /** Seconds since this segment opened, on the audio clock. */
    get audioTime() { return this.engine.audioContext.currentTime - this.audioStarted; }
    /**
     * Wall-clock seconds since the segment opened minus audio-clock seconds since it opened. About
     * zero while the clocks run together; it grows while the audio clock is frozen (a stalled
     * render thread, a suspension) and stays grown after a suspension.
     */
    get audioClockOffset() { return this.time - this.audioTime; }
    /**
     * An audio-clock time as seconds since the segment opened, on the audio clock. Always returned,
     * also when the clocks disagree: the capture keeps every timing with the offset at that moment
     * (`audioClockOffsetS`) and the per-frame `audioT`, so a reader can realign or reject it later.
     */
    fromAudioTime(time) {
        this.checkAudioClock();
        return time - this.audioStarted;
    }
    /**
     * Warn once per segment when the clocks are more than 0.1 s apart; nothing is dropped. Pass the offset
     * a caller already read, so the value that is stored is the one that was checked.
     */
    checkAudioClock(offset = this.audioClockOffset) {
        if (!this.audioClockWarned && this.data && Math.abs(offset) > AUDIO_CLOCK_TOLERANCE_S) {
            this.audioClockWarned = true;
            this.data.warnings.push(AUDIO_CLOCK_WARNING);
        }
        return offset;
    }
    /**
     * Record what the game did. `clocks` carries the action's times on their own clocks; they are made
     * segment-relative here, with the audio clock offset at this moment (`audioClockOffsetS`).
     */
    action(action, clocks) {
        if (!this.data)
            return;
        this.drain();
        if (action.kind === 'bind' && action.position)
            this.recordedPositions.set(action.name, [...action.position]);
        if (action.kind === 'unbind') {
            this.pendingMoves.delete(action.name);
            this.recordedPositions.delete(action.name);
        }
        if (action.kind === 'signal' && typeof action.value === 'number') {
            this.pendingSignals.delete(action.name);
            this.recordedSignals.set(action.name, action.value);
        }
        this.push(action, this.time, clocks);
    }
    /** A signal changed; recorded as one `signal` per name at the next 10 Hz tick, the last value winning, like host motion. */
    signalChanged(name, value) {
        if (!this.data)
            return;
        this.pendingSignals.set(name, value);
    }
    /** A host moved; recorded as one `host-position` per host at the next 10 Hz tick, not per call. */
    hostMoved(id, position) {
        if (!this.data)
            return;
        const pending = this.pendingMoves.get(id);
        if (pending) {
            pending[0] = position[0];
            pending[1] = position[1];
            pending[2] = position[2];
        }
        else
            this.pendingMoves.set(id, [position[0], position[1], position[2]]);
    }
    push(action, t, clocks) {
        if (!this.data)
            return;
        if (this.data.actions.length >= CAPTURE_CAPS.actions) {
            if (!this.rollover()) {
                this.data.truncation.actions++;
                this.data.truncated = true;
                return;
            }
            t = this.time;
        }
        // After the rollover above, so the times below are measured from the segment the action lands in.
        this.data.actions.push({ ...action, ...(action.position ? { position: [...action.position] } : {}), ...(clocks ? this.segmentTimes(clocks) : {}), t });
    }
    segmentTimes(clocks) {
        const audio = clocks.audioStartTime != null || clocks.estimatedOnsetTime != null;
        return {
            ...(clocks.occurredAt != null ? { occurredAt: clocks.occurredAt - this.started } : {}),
            ...(clocks.audioStartTime != null ? { audioStartedAt: clocks.audioStartTime - this.audioStarted } : {}),
            ...(clocks.estimatedOnsetTime != null ? { estimatedAudibleOnsetAt: clocks.estimatedOnsetTime - this.audioStarted } : {}),
            ...(audio ? { audioClockOffsetS: this.checkAudioClock() } : {}),
        };
    }
    flushMoves(t) {
        if (!this.pendingMoves.size)
            return;
        for (const [id, position] of this.pendingMoves) {
            const last = this.recordedPositions.get(id);
            if (last && last[0] === position[0] && last[1] === position[1] && last[2] === position[2])
                continue;
            this.recordedPositions.set(id, [position[0], position[1], position[2]]);
            this.push({ kind: 'host-position', name: id, position }, t);
        }
        this.pendingMoves.clear();
    }
    flushSignals(t) {
        if (!this.pendingSignals.size)
            return;
        for (const [name, value] of this.pendingSignals) {
            if (this.recordedSignals.get(name) === value)
                continue;
            this.recordedSignals.set(name, value);
            this.push({ kind: 'signal', name, value }, t);
        }
        this.pendingSignals.clear();
    }
    /** Called each update; snapshot construction is deferred until the 10 Hz capture tick. */
    frame(read) {
        if (!this.data)
            return;
        const t = this.time;
        if (t - this.lastFrame < 0.1 - 1e-6)
            return; // 10 Hz, tolerant to float noise in a fixed-step clock
        this.lastFrame = t;
        const segment = this.segment;
        this.drain();
        this.flushMoves(t);
        this.flushSignals(t);
        if (!this.data)
            return;
        if (segment === this.segment && this.data.frames.length >= CAPTURE_CAPS.frames && !this.rollover()) {
            this.data.truncation.frames++;
            this.data.truncated = true;
            return;
        }
        // A rollover above opened a new segment: its opener may have recorded the first frame already.
        if (segment !== this.segment && this.data.frames.length)
            return;
        // One reading of each clock for this frame: what is checked is what is stored.
        const frameT = segment === this.segment ? t : this.time;
        const audioT = this.audioTime;
        this.checkAudioClock(frameT - audioT);
        this.data.frames.push({ ...read(), t: frameT, audioT });
    }
    drain() {
        if (!this.data)
            return;
        const log = this.engine.eventLog;
        const count = Math.max(0, log.version - this.eventVersion);
        const snapshot = log.snapshot();
        if (count > snapshot.length) {
            this.data.truncation.events += count - snapshot.length;
            this.data.truncated = true;
        }
        if (count)
            for (const event of snapshot.slice(-Math.min(count, snapshot.length))) {
                if (this.data.events.length >= CAPTURE_CAPS.events) {
                    if (!this.rollover()) {
                        this.data.truncation.events++;
                        this.data.truncated = true;
                        continue;
                    }
                }
                // Preserve the scene-log timestamp separately from PCM-estimated audio onset.
                this.data.events.push({ t: Math.max(0, Math.min(this.time, this.time - (this.engine.currentTime - event.t))), kind: event.kind, label: event.label,
                    key: event.key, take: event.take, position: [event.x, event.y, event.z],
                    ...(event.sourceId ? { sourceId: event.sourceId } : {}),
                    ...(event.bufferKey ? { bufferKey: event.bufferKey } : {}),
                    ...(event.audioStartTime != null ? { audioStartedAt: event.audioStartTime - this.audioStarted } : {}),
                    ...(event.estimatedOnsetTime != null ? { estimatedAudibleOnsetAt: event.estimatedOnsetTime - this.audioStarted,
                        onsetOffsetSeconds: event.bufferOffsetSeconds, timingBasis: 'pcm-onset-estimate' } : {}),
                    // The offset when the capture COLLECTS the event (this call), up to one 10 Hz tick after it fired:
                    // the engine logs no wall-clock time. frames[].audioT traces the clocks in between.
                    ...(event.audioStartTime != null || event.estimatedOnsetTime != null ? { audioClockOffsetS: this.checkAudioClock() } : {}) });
            }
        this.eventVersion = log.version;
        for (const warning of this.engine.runtimeWarnings) {
            if (!this.warningBaseline.has(warning) && !this.data.warnings.includes(warning))
                this.data.warnings.push(warning);
        }
    }
    /**
     * Close the open segment and open the next one. Returns false (and changes nothing) when
     * no `onSegment` listener would receive the closed segment, or during a rollover.
     */
    rollover() {
        if (!this.data || !this.options.onSegment || this.rolling)
            return false;
        this.rolling = true;
        try {
            const closed = this.close();
            this.segment++;
            this.recordedPositions.clear();
            this.pendingMoves.clear();
            this.recordedSignals.clear();
            this.pendingSignals.clear();
            this.open();
            this.options.onSegment(closed);
            this.options.onSegmentOpen?.();
        }
        finally {
            this.rolling = false;
        }
        return true;
    }
    close() {
        const result = this.data;
        result.durationS = this.time;
        this.data = null;
        return result;
    }
    end() {
        if (!this.data)
            throw new Error('No capture is active. Call beginCapture first.');
        this.drain();
        this.flushMoves(this.time);
        this.flushSignals(this.time);
        const result = this.close();
        this.pendingMoves.clear();
        this.recordedPositions.clear();
        this.pendingSignals.clear();
        this.recordedSignals.clear();
        this.options.onSegment?.(result);
        return result;
    }
}
function sessionId() {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}
//# sourceMappingURL=SceneCapture.js.map