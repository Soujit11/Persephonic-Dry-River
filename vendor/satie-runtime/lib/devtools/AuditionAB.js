/**
 * Two renders of one scene on a single playhead.
 *
 * `TakeComparison` plays one side, then the other, from the top — the gap
 * between them is exactly where a small difference stops being audible. This
 * player starts BOTH buffers together, sample aligned and looping, and swaps
 * which one you hear with a short gain crossfade. The difference arrives at
 * the same moment in the material, which is the only way a listener can hear
 * a metre of position or a little more room.
 *
 * The two renders are near identical signals, so the crossfade is linear:
 * correlated material sums to constant amplitude, where an equal-power curve
 * would bump.
 */
const FADE_S = 0.012;
const PREROLL_S = 0.03;
export class AuditionAB {
    context;
    a;
    b;
    durationS;
    full;
    voices = [];
    startedAt = 0;
    current;
    generation = 0;
    disposed = false;
    constructor(context, a, b, options = {}) {
        this.context = context;
        this.a = a;
        this.b = b;
        this.durationS = Math.min(options.durationS ?? 5, a.duration, b.duration);
        if (!Number.isFinite(this.durationS) || !(this.durationS > 0))
            throw new Error('An A/B audition needs nonempty audio.');
        this.full = options.gain ?? 1;
        if (!Number.isFinite(this.full) || this.full < 0)
            throw new Error('Invalid audition gain.');
        this.current = options.side ?? 'B';
    }
    get side() { return this.current; }
    get playing() { return this.voices.length > 0; }
    /** Seconds into the looped excerpt; 0 while stopped. */
    get position() {
        if (!this.playing)
            return 0;
        return Math.max(0, this.context.currentTime - this.startedAt) % this.durationS;
    }
    async start(side = this.current) {
        this.stop();
        if (this.disposed)
            return false;
        const generation = this.generation;
        await this.context.resume();
        if (generation !== this.generation || this.disposed || this.context.state !== 'running')
            return false;
        this.current = side;
        const when = this.context.currentTime + PREROLL_S;
        for (const [name, buffer] of [['A', this.a], ['B', this.b]]) {
            const source = this.context.createBufferSource(), gain = this.context.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.loopStart = 0;
            source.loopEnd = this.durationS;
            gain.gain.value = name === side ? this.full : 0;
            source.connect(gain);
            gain.connect(this.context.destination);
            this.voices.push({ side: name, source, gain });
            try {
                source.start(when, 0);
            }
            catch (error) {
                this.stop();
                throw error;
            }
        }
        this.startedAt = when;
        return true;
    }
    /** Instant, click-free swap; the playhead never moves. */
    select(side) {
        if (side === this.current)
            return;
        const now = this.context.currentTime;
        this.current = side;
        for (const voice of this.voices) {
            const target = voice.side === side ? this.full : 0;
            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
            voice.gain.gain.linearRampToValueAtTime(target, now + FADE_S);
        }
    }
    stop() {
        this.generation++;
        for (const { source, gain } of this.voices.splice(0)) {
            source.onended = null;
            try {
                source.stop();
            }
            catch { /* start may have failed */ }
            source.disconnect();
            gain.disconnect();
        }
    }
    destroy() { this.disposed = true; this.stop(); }
}
//# sourceMappingURL=AuditionAB.js.map