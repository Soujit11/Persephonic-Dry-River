/**
 * NullAudioContext — a headless `BaseAudioContext` stand-in.
 *
 * The engine's scene logic (scheduling, hosting, entities, the signal bus,
 * Doppler, occlusion) is entangled with Web Audio only through node
 * construction and AudioParam writes. This context accepts every one of
 * those calls and produces no sound: every `create*` returns a node whose
 * `connect` returns its destination, whose AudioParams hold a `.value` that
 * the LAST write sets (no automation timeline — `setValueAtTime`,
 * `setTargetAtTime`, the ramps all just store), and whose `currentTime` is a
 * plain writable number the caller advances between `SatieEngine.advance`
 * steps. That is enough to run a whole scene faster than realtime and read
 * the engine's state per frame — what `SceneSimulation` does to give the
 * offline export parity with live playback.
 *
 * It is also the stub the engine tests used to carry in each file; they now
 * import it from here (`installNullAudioGlobals` covers the two globals
 * Node lacks that `play()` touches: `AudioBuffer` for the generator's
 * `instanceof`, `requestAnimationFrame` for the tick loop).
 *
 * `decodeAudioData` rejects unless the context was given a `decodeAs`
 * function — nothing headless ever decodes; tests that feed
 * `loadAudioBuffer` supply one.
 */
/** Minimal AudioBuffer: real channel arrays so IR synthesis can write into them. */
export class NullAudioBuffer {
    numberOfChannels;
    sampleRate;
    length;
    channels;
    constructor(opts = {}) {
        this.numberOfChannels = opts.numberOfChannels ?? 1;
        this.sampleRate = opts.sampleRate ?? 48000;
        this.length = opts.length ?? Math.max(1, Math.round((opts.durationS ?? 4) * this.sampleRate));
        this.channels = [];
        for (let c = 0; c < this.numberOfChannels; c++)
            this.channels.push(new Float32Array(this.length));
    }
    get duration() { return this.length / this.sampleRate; }
    getChannelData(ch) { return this.channels[ch] ?? this.channels[0]; }
    copyToChannel(src, ch, offset = 0) { this.getChannelData(ch).set(src.subarray(0, this.length - offset), offset); }
    copyFromChannel(dst, ch, offset = 0) { dst.set(this.getChannelData(ch).subarray(offset, offset + dst.length)); }
}
const NOOP_METHODS = new Set([
    'disconnect', 'start', 'stop', 'addEventListener', 'removeEventListener',
    'setPosition', 'setOrientation', 'setPeriodicWave',
]);
/** An AudioParam that remembers the last value written, nothing else. */
export function nullAudioParam(initial = 0) {
    const p = {
        value: initial,
        defaultValue: initial,
        minValue: -3.4028234663852886e38,
        maxValue: 3.4028234663852886e38,
        automationRate: 'a-rate',
        setValueAtTime(v) { p.value = v; return p; },
        linearRampToValueAtTime(v) { p.value = v; return p; },
        exponentialRampToValueAtTime(v) { p.value = v; return p; },
        setTargetAtTime(v) { p.value = v; return p; },
        setValueCurveAtTime(values) { if (values.length)
            p.value = values[values.length - 1]; return p; },
        cancelScheduledValues() { return p; },
        cancelAndHoldAtTime() { return p; },
    };
    return p;
}
/**
 * A node that tolerates any property access: unknown properties become
 * AudioParams on first touch (`panner.positionX`, `filter.frequency`,
 * `source.playbackRate`), `connect` returns its destination so chains read
 * naturally, and the usual lifecycle methods are no-ops.
 */
export function nullAudioNode() {
    const target = {};
    return new Proxy(target, {
        get(t, prop) {
            if (prop in t)
                return t[prop];
            if (typeof prop === 'symbol')
                return undefined;
            if (prop === 'connect')
                return (dst) => dst;
            if (NOOP_METHODS.has(prop))
                return () => { };
            t[prop] = nullAudioParam();
            return t[prop];
        },
        set(t, prop, v) { t[prop] = v; return true; },
    });
}
export class NullAudioContext {
    /** Plain writable clock — the caller advances it before each engine step. */
    currentTime = 0;
    sampleRate;
    state = 'running';
    destination = nullAudioNode();
    listener = nullAudioNode();
    decodeAs;
    constructor(opts = {}) {
        this.sampleRate = opts.sampleRate ?? 48000;
        this.decodeAs = opts.decodeAs ?? null;
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    addEventListener() { }
    removeEventListener() { }
    decodeAudioData(data) {
        if (this.decodeAs)
            return Promise.resolve(this.decodeAs(data));
        return Promise.reject(new Error('NullAudioContext cannot decode audio; install decoded buffers with setAudioBuffer'));
    }
    createBuffer(numberOfChannels, length, sampleRate) {
        return new NullAudioBuffer({ numberOfChannels, length, sampleRate });
    }
    createGain() { return nullAudioNode(); }
    createDynamicsCompressor() { return nullAudioNode(); }
    createStereoPanner() { return nullAudioNode(); }
    createBufferSource() { return nullAudioNode(); }
    createPanner() { return nullAudioNode(); }
    createBiquadFilter() { return nullAudioNode(); }
    createWaveShaper() { return nullAudioNode(); }
    createDelay() { return nullAudioNode(); }
    createConvolver() { return nullAudioNode(); }
    createChannelMerger() { return nullAudioNode(); }
    createChannelSplitter() { return nullAudioNode(); }
    createAnalyser() { return nullAudioNode(); }
    createOscillator() { return nullAudioNode(); }
    createConstantSource() { return nullAudioNode(); }
}
/**
 * Define the browser globals a headless run of `SatieEngine.play()` touches
 * when they are missing (Node): `AudioBuffer` (the generator hook's
 * `instanceof`) and the animation-frame pair (the tick loop, which a
 * `headless` engine never starts but `stop()` still cancels). Idempotent.
 */
export function installNullAudioGlobals() {
    const g = globalThis;
    if (!('AudioBuffer' in g))
        g.AudioBuffer = NullAudioBuffer;
    if (typeof g.requestAnimationFrame !== 'function')
        g.requestAnimationFrame = () => 0;
    if (typeof g.cancelAnimationFrame !== 'function')
        g.cancelAnimationFrame = () => { };
}
//# sourceMappingURL=NullAudioContext.js.map