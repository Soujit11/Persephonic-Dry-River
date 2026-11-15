/**
 * Opt-in bounded native rendering for looping recordings. Virtual voices retain
 * identity, placement, control and lifecycle. Phase integrates the current rate
 * at engine ticks; AudioParam smoothing and effect histories are not simulated.
 * Authored DSP restarts cold. Shared room tails already emitted may decay normally.
 * This class never owns, delays or steals trigger/one-shot voices.
 */
export class LoopVoiceBudget {
    host;
    enabled;
    limit;
    threshold;
    hysteresis;
    byTrack = new Map();
    entries = [];
    order = 0;
    constructor(options, host) {
        this.host = host;
        this.enabled = options !== undefined;
        this.limit = options?.maxRealVoices ?? 32;
        this.threshold = options?.silenceThresholdDb ?? -60;
        this.hysteresis = options?.hysteresisDb ?? 3;
        if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 512 ||
            !Number.isFinite(this.threshold) || this.threshold > 0 || this.threshold < -180 ||
            !Number.isFinite(this.hysteresis) || this.hysteresis < 0 || this.hysteresis > 24) {
            throw new Error('Invalid continuous loop voice budget');
        }
    }
    /** Register a logical start without allowing an unbounded native startup burst. */
    prepare(track, buffer, startsAt, offset, rate) {
        if (!this.enabled || track.statement.kind !== 'loop')
            return;
        let entry = this.byTrack.get(track);
        if (!entry) {
            entry = { track, buffer, startsAt, phase: offset, time: this.host.now(), rate,
                score: -Infinity, priority: -Infinity, selected: false, order: ++this.order };
            this.byTrack.set(track, entry);
            this.entries.push(entry);
        }
        else {
            entry.buffer = buffer;
            entry.startsAt = startsAt;
            entry.phase = offset;
            entry.time = this.host.now();
            entry.rate = rate;
        }
        this.host.suspend(track);
        track.virtual = true;
    }
    countBuffer(buffer, except) {
        let count = 0;
        for (const entry of this.entries)
            if (entry.track !== except && entry.buffer === buffer)
                count++;
        return count;
    }
    /** No per-tick arrays/objects: scratch order and scores live with the voices. */
    update() {
        if (!this.enabled)
            return;
        const now = this.host.now();
        for (const entry of this.entries) {
            const track = entry.track;
            const elapsed = Math.max(0, now - Math.max(entry.time, entry.startsAt));
            if (entry.buffer.duration > 0)
                entry.phase = (entry.phase + elapsed * entry.rate) % entry.buffer.duration;
            entry.time = now;
            entry.rate = Math.max(.05, this.host.playbackRate(track));
            const gain = track.pending || now < entry.startsAt ? 0 : this.host.receivedGain(track);
            if (!track.stopping)
                entry.score = Number.isFinite(gain) && gain > 0 ? 20 * Math.log10(gain) : -Infinity;
            else if (track.virtual)
                entry.score = -Infinity;
            entry.priority = track.stopping && !track.virtual ? Infinity : entry.score + (track.virtual ? 0 : this.hysteresis);
            entry.selected = false;
        }
        this.entries.sort(compareEntries);
        let remaining = this.limit;
        for (const entry of this.entries) {
            const threshold = this.threshold - (entry.track.virtual ? 0 : this.hysteresis);
            if (remaining > 0 && entry.score > threshold) {
                entry.selected = true;
                remaining--;
            }
        }
        // Evict first so even a complete change of selected voices never exceeds
        // the native-source limit. A hard budget discards individual effect tails.
        for (const entry of this.entries)
            if (!entry.selected && !entry.track.virtual) {
                this.host.suspend(entry.track);
                entry.track.virtual = true;
            }
        for (const entry of this.entries)
            if (entry.selected && entry.track.virtual) {
                this.host.resume(entry.track, entry.buffer, entry.phase, entry.rate);
                entry.track.virtual = false;
            }
    }
    forget(track) {
        const entry = this.byTrack.get(track);
        if (!entry)
            return;
        this.byTrack.delete(track);
        this.entries.splice(this.entries.indexOf(entry), 1);
        track.virtual = false;
    }
    report() {
        const voices = this.entries.map(({ track, score, phase }) => ({ key: track.key,
            sourceId: track.statement.sourceId ?? null, virtual: track.virtual, receivedGainDb: score, phaseSeconds: phase }));
        const real = voices.reduce((n, voice) => n + (voice.virtual ? 0 : 1), 0);
        return { enabled: this.enabled, limit: this.enabled ? this.limit : null, real,
            virtual: voices.length - real, voices };
    }
}
function compareEntries(a, b) {
    return b.priority - a.priority || a.order - b.order;
}
/**
 * A virtual voice retains nodes, not their automation history. Clear the whole
 * timeline, including past targets on nodes the browser may have stopped pulling.
 * Called only at transitions; shared room/master nodes never belong to a voice.
 */
export function clearLoopAutomation(track, now) {
    const clear = (param) => {
        if (!param)
            return;
        const value = param.value;
        param.cancelScheduledValues(0);
        param.setValueAtTime(value, now);
    };
    for (const param of [track.gainNode.gain, track.scaleGain.gain, track.levelNode.gain,
        track.pointGain.gain, track.wideGain.gain, track.directTrim.gain,
        track.reverbDry?.gain, track.reverbSend?.gain, track.occlusionFilter?.frequency,
        track.occlusionGainNode?.gain, track.pannerNode.positionX,
        track.pannerNode.positionY, track.pannerNode.positionZ])
        clear(param);
    for (const leg of [track.floorLeg, track.ceilingLeg]) {
        if (!leg)
            continue;
        for (const param of [leg.delay.delayTime, leg.filter.frequency, leg.gain.gain,
            leg.imagePanner?.positionX, leg.imagePanner?.positionY, leg.imagePanner?.positionZ])
            clear(param);
    }
}
//# sourceMappingURL=LoopVoiceBudget.js.map