/** Controlled dry excerpts. Completion means scheduled playback ended, not that a human heard it. */
export class TakeComparison {
    context;
    a;
    b;
    options;
    durationS;
    source = null;
    gain = null;
    cancel = null;
    generation = 0;
    disposed = false;
    completed = new Set();
    constructor(context, a, b, options = {}) {
        this.context = context;
        this.a = a;
        this.b = b;
        this.options = options;
        this.durationS = Math.min(options.durationS ?? 5, a.duration, b.duration);
        if (!Number.isFinite(this.durationS) || !Number.isFinite(options.gain ?? 0.3) || (options.gain ?? 0.3) < 0)
            throw new Error('Invalid comparison duration or gain.');
        if (!(this.durationS > 0))
            throw new Error('Comparison needs nonempty audio.');
    }
    /** Freeze at most five seconds so later caller mutations cannot change a pinned excerpt. */
    static excerpt(context, buffer) {
        const length = Math.min(buffer.length, Math.floor(buffer.sampleRate * 5));
        const copy = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
        for (let c = 0; c < buffer.numberOfChannels; c++)
            copy.getChannelData(c).set(buffer.getChannelData(c).subarray(0, length));
        return copy;
    }
    async play(side) {
        this.stop();
        if (this.disposed)
            return false;
        const generation = this.generation;
        await this.context.resume();
        if (generation !== this.generation || this.disposed || this.context.state !== 'running')
            return false;
        return new Promise((resolve, reject) => {
            const source = this.context.createBufferSource(), gain = this.context.createGain();
            source.buffer = side === 'A' ? this.a : this.b;
            gain.gain.value = this.options.gain ?? 0.3;
            source.connect(gain);
            gain.connect(this.context.destination);
            this.source = source;
            this.gain = gain;
            this.cancel = () => resolve(false);
            const start = this.context.currentTime;
            source.onended = () => {
                if (this.source !== source)
                    return;
                const complete = this.context.currentTime - start >= this.durationS - 0.01;
                source.disconnect();
                gain.disconnect();
                this.source = null;
                this.gain = null;
                this.cancel = null;
                if (complete)
                    this.completed.add(side);
                resolve(complete);
            };
            try {
                source.start(0, 0, this.durationS);
            }
            catch (error) {
                this.cancel = null;
                this.stop();
                reject(error);
            }
        });
    }
    stop() {
        this.generation++;
        const source = this.source;
        this.source = null;
        if (source) {
            source.onended = null;
            try {
                source.stop();
            }
            catch { /* start may have failed */ }
            source.disconnect();
        }
        this.gain?.disconnect();
        this.gain = null;
        this.cancel?.();
        this.cancel = null;
    }
    destroy() { this.disposed = true; this.stop(); }
}
//# sourceMappingURL=TakeComparison.js.map