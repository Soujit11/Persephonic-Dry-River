import { mulberry32, fnv1a } from '../core/Random.js';
// ─── Value normalization (0-1 OR real units → real audio ranges) ────
//
// Two dialects, disambiguated by magnitude. The DSL, the docs, and the AI
// system prompt have always taught REAL units — `cutoff 800` (Hz), `eq low 3`
// (dB), `drive 2`, `resonance 2` (Q) — while these maps clamped everything to
// [0,1]: every generated script's lowpass sat wide open at 20 kHz, a highpass
// at "200 Hz" cut everything below 20 kHz to near-silence, EQ railed at
// ±12 dB, and any drive ≥ 1 hit the curve maximum. Values ≤ 1 keep the
// legacy normalized mapping (old scripts and hand-authored 0-1 values);
// anything outside that range is taken at face value in real units.
/** ≤1: normalized 20Hz-20kHz (exponential). >1: literal Hz. */
export function mapCutoff(n) {
    if (n > 1)
        return Math.max(20, Math.min(20000, n));
    return 20 * Math.pow(1000, Math.max(0, n)); // 20 * 1000^n → 20Hz to 20000Hz
}
/** ≤1: normalized 0.1-20 (exponential). >1: literal Q. */
export function mapResonance(n) {
    if (n > 1)
        return Math.min(20, n);
    return 0.1 * Math.pow(200, Math.max(0, n)); // 0.1 to 20
}
/** ≤1: normalized 0.1-50 (exponential). >1: literal drive amount. */
export function mapDrive(n) {
    if (n > 1)
        return Math.min(50, n);
    return 0.1 * Math.pow(500, Math.max(0, n)); // 0.1 to 50
}
/** 0-1: normalized -12..+12dB (0.5 = 0dB). Outside that: literal dB. */
export function mapEQGain(n) {
    if (n < 0 || n > 1)
        return Math.max(-12, Math.min(12, n));
    return (n - 0.5) * 24; // -12 to +12
}
/**
 * Map 0-1 speed for fly/walk (sine wander) — exponential curve that
 * stays useful for high inputs because the engine scales by 0.01·2π
 * before driving the sines.
 * 0 = nearly still (0.005 Hz), 0.5 ≈ 0.1 Hz, 1.0 = 2.0 Hz.
 */
export function mapSpeed(n) {
    const clamped = Math.max(0, Math.min(1, n));
    return 0.005 * Math.pow(400, clamped);
}
/**
 * Map 0-1 speed for trajectory wander (spiral, orbit, lorenz, custom LUT).
 * Trajectories visit far more spatial ground per parametric cycle than
 * fly's smooth sines, so they need a flatter curve — Math.pow(400, n)
 * blows up at high inputs and produces unusable sub-second LUT cycles.
 * This curve keeps `speed 0.05–0.1` near the historical "feels right"
 * range (~150 s cycle) while capping `speed 1` at a usable 17 s cycle.
 * 0 → 0.005 Hz (200 s), 0.5 → 0.017 Hz (58 s), 1.0 → 0.06 Hz (17 s).
 */
export function mapTrajectorySpeed(n) {
    const clamped = Math.max(0, Math.min(1, n));
    return 0.005 * Math.pow(12, clamped);
}
// ─── Filter ───────────────────────────────────────────
function createFilter(ctx, params) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const modeMap = {
        lowpass: 'lowpass',
        highpass: 'highpass',
        bandpass: 'bandpass',
        notch: 'notch',
        peak: 'peaking',
    };
    filter.type = modeMap[params.mode] ?? 'lowpass';
    filter.frequency.value = mapCutoff(params.cutoff.sample());
    filter.Q.value = mapResonance(params.resonance.sample());
    const w = params.dryWet.sample();
    dry.gain.value = 1 - w;
    wet.gain.value = w;
    // input → dry → output
    // input → filter → wet → output
    input.connect(dry);
    dry.connect(output);
    input.connect(filter);
    filter.connect(wet);
    wet.connect(output);
    return { filter, wet, dry, input, output, nodes: [input, output, dry, wet, filter] };
}
// ─── Distortion (WaveShaperNode) ──────────────────────
// Distortion curve cache — avoid reallocating Float32Arrays every update frame
const _curveCache = new Map();
const CURVE_CACHE_MAX = 64;
/** Buckets for drive quantization in normalized (pre-mapDrive) 0-1 space. */
const DRIVE_BUCKETS = 64;
/**
 * Quantize a normalized (pre-mapDrive) drive value to its curve-cache bucket.
 * The engine uses this to skip WaveShaper curve reassignment when a drive
 * fade hasn't crossed into a new bucket.
 */
export function driveBucket(n) {
    // Literal-unit drives (>1, see mapDrive) fold into the same normalized
    // space the buckets are defined in — the same inversion _curveCacheKey
    // uses. Clamping them to 1 instead froze literal drive fades in bucket 63.
    const clamped = n > 1
        ? Math.log(Math.min(50, n) / 0.1) / Math.log(500)
        : Math.max(0, Math.min(1, n));
    return Math.round(clamped * (DRIVE_BUCKETS - 1));
}
function _curveCacheKey(mode, drive) {
    // Quantize in normalized pre-map space — keying on the mapped 0.1-50 value
    // produced thousands of distinct keys during drive fades, defeating the cache.
    const n = Math.log(Math.max(drive, 0.1) / 0.1) / Math.log(500); // invert mapDrive
    return `${mode}:${driveBucket(n)}`;
}
export function makeDistortionCurve(mode, drive, samples = 1024) {
    const key = _curveCacheKey(mode, drive);
    const cached = _curveCache.get(key);
    if (cached && cached.length === samples)
        return cached;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        switch (mode) {
            case 'softclip':
                curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
                break;
            case 'hardclip':
                curve[i] = Math.max(-1, Math.min(1, x * drive));
                break;
            case 'tanh':
                curve[i] = Math.tanh(x * drive);
                break;
            case 'cubic':
                curve[i] = x - (drive * x * x * x) / 3;
                break;
            case 'asymmetric':
                curve[i] = x > 0
                    ? (1 - Math.exp(-x * drive))
                    : -(1 - Math.exp(x * drive)) * 0.8;
                break;
            default: // softclip fallback
                curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
                break;
        }
    }
    // Evict oldest entries if cache gets too large
    if (_curveCache.size >= CURVE_CACHE_MAX) {
        const first = _curveCache.keys().next().value;
        if (first)
            _curveCache.delete(first);
    }
    _curveCache.set(key, curve);
    return curve;
}
function createDistortion(ctx, params) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const drive = mapDrive(params.drive.sample());
    shaper.curve = makeDistortionCurve(params.mode, drive);
    shaper.oversample = '2x'; // 2x is the best balance of quality vs. CPU cost
    const w = params.dryWet.sample();
    dry.gain.value = 1 - w;
    wet.gain.value = w;
    input.connect(dry);
    dry.connect(output);
    input.connect(shaper);
    shaper.connect(wet);
    wet.connect(output);
    return { shaper, wet, dry, input, output, nodes: [input, output, dry, wet, shaper] };
}
// ─── Delay ────────────────────────────────────────────
function createDelay(ctx, params) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delayTime = params.time.sample();
    const feedback = params.feedback.sample();
    const w = params.dryWet.sample();
    dry.gain.value = 1 - w;
    wet.gain.value = w;
    if (params.pingPong) {
        // Stereo ping-pong: L→R→L
        const delayL = ctx.createDelay(5);
        const delayR = ctx.createDelay(5);
        const fbGain = ctx.createGain();
        const merger = ctx.createChannelMerger(2);
        delayL.delayTime.value = delayTime;
        delayR.delayTime.value = delayTime;
        fbGain.gain.value = feedback;
        // input → delayL → merger[0]
        //          delayL → delayR → merger[1]
        //                   delayR → fbGain → delayL (feedback loop)
        input.connect(dry);
        dry.connect(output);
        input.connect(delayL);
        delayL.connect(merger, 0, 0);
        delayL.connect(delayR);
        delayR.connect(merger, 0, 1);
        delayR.connect(fbGain);
        fbGain.connect(delayL);
        merger.connect(wet);
        wet.connect(output);
        return { delays: [delayL, delayR], fbGain, wet, dry, input, output, nodes: [input, output, dry, wet, delayL, delayR, fbGain, merger] };
    }
    else {
        // Simple mono delay with feedback
        const delay = ctx.createDelay(5);
        const fbGain = ctx.createGain();
        delay.delayTime.value = delayTime;
        fbGain.gain.value = feedback;
        input.connect(dry);
        dry.connect(output);
        input.connect(delay);
        delay.connect(fbGain);
        fbGain.connect(delay); // feedback loop
        delay.connect(wet);
        wet.connect(output);
        return { delays: [delay], fbGain, wet, dry, input, output, nodes: [input, output, dry, wet, delay, fbGain] };
    }
}
// ─── Reverb (ConvolverNode with generated impulse response) ──
// Impulse-response cache — generating an IR is expensive (up to ~288k frames
// of noise per channel) and it runs synchronously per voice. Params are
// quantized to 0.05 steps; one AudioBuffer is safely shared across ConvolverNodes.
//
// One LRU PER CONTEXT (WeakMap), not per sample rate: the scene simulation
// runs the engine on a `NullAudioContext` whose `createBuffer` returns a stub,
// and a module-wide cache keyed by sample rate handed that stub to the real
// OfflineAudioContext's ConvolverNode on the export that followed ("Failed to
// convert value to 'AudioBuffer'" on every simulated scene with a voice
// reverb). Found by scripts/eval-spatial-adherence.mts, 2026-09-09.
const _irCaches = new WeakMap();
const IR_CACHE_MAX = 8;
function irCacheFor(ctx) {
    let cache = _irCaches.get(ctx);
    if (!cache) {
        cache = new Map();
        _irCaches.set(ctx, cache);
    }
    return cache;
}
function _irCacheKey(sampleRate, roomSize, damping) {
    return `${sampleRate}|${Math.round(roomSize * 20)}|${Math.round(damping * 20)}`;
}
/** ln(1000): an amplitude of exp(-DECAY_60DB) is exactly -60 dB. */
const DECAY_60DB = 6.907755278982137;
export function generateImpulseResponse(ctx, roomSize, damping) {
    const key = _irCacheKey(ctx.sampleRate, roomSize, damping);
    const _irCache = irCacheFor(ctx);
    const cached = _irCache.get(key);
    if (cached) {
        // Refresh LRU recency
        _irCache.delete(key);
        _irCache.set(key, cached);
        return cached;
    }
    // Room size maps to decay time: 0.3s (tiny) to 6s (cathedral)
    const decayTime = 0.3 + roomSize * 5.7;
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * decayTime);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    // Noise seeded from the cache key: the IR was already shared across voices
    // via the cache, so pinning it makes renders reproducible at no cost.
    const rand = mulberry32(fnv1a(key));
    for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Exponential decay to exactly -60 dB at `decayTime`, which is what the
            // buffer length above already assumes. ln(10^3) = 6.907755: an amplitude
            // of exp(-6.907755) is 10^-3, i.e. -60 dB. This was `exp(-t / (decayTime
            // * 0.4))` = exp(-2.5t/T), which decays 2.76x too slowly and left the
            // envelope at -21.7 dB where the buffer is cut. Measured against the
            // renderer, a room asked for 0.6 s delivered 1.17 s and one asked for
            // 2.5 s delivered 4.96 s, a near-constant factor of two across the range
            // (docs/reviews/2026-09-11-room-rt60-calibration.md).
            const envelope = Math.exp((-t * DECAY_60DB) / decayTime);
            // High-frequency damping: roll off noise at higher time offsets
            const dampFactor = 1 - damping * (t / decayTime);
            // White noise modulated by envelope
            data[i] = (rand() * 2 - 1) * envelope * Math.max(0, dampFactor);
        }
    }
    if (_irCache.size >= IR_CACHE_MAX) {
        const oldest = _irCache.keys().next().value;
        if (oldest)
            _irCache.delete(oldest);
    }
    _irCache.set(key, buffer);
    return buffer;
}
// ─── EQ (3-band: low shelf + mid peaking + high shelf) ──
function createEQ(ctx, params) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 320;
    low.gain.value = mapEQGain(params.lowGain.sample());
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.5;
    mid.gain.value = mapEQGain(params.midGain.sample());
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 3200;
    high.gain.value = mapEQGain(params.highGain.sample());
    // Series: input → low → mid → high → output
    input.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(output);
    return { low, mid, high, input, output, nodes: [input, output, low, mid, high] };
}
// ─── Build full DSP chain ─────────────────────────────
export function buildDSPChain(ctx, opts) {
    // Collect active effects in processing order
    const effects = [];
    const filterResult = opts.filter ? createFilter(ctx, opts.filter) : null;
    const distortionResult = opts.distortion ? createDistortion(ctx, opts.distortion) : null;
    const delayResult = opts.delay ? createDelay(ctx, opts.delay) : null;
    const eqResult = opts.eq ? createEQ(ctx, opts.eq) : null;
    if (filterResult)
        effects.push(filterResult);
    if (distortionResult)
        effects.push(distortionResult);
    if (delayResult)
        effects.push(delayResult);
    if (eqResult)
        effects.push(eqResult);
    if (effects.length === 0)
        return null;
    // Wire effects in series
    for (let i = 0; i < effects.length - 1; i++) {
        effects[i].output.connect(effects[i + 1].input);
    }
    const allNodes = effects.flatMap(e => e.nodes);
    const result = {
        input: effects[0].input,
        output: effects[effects.length - 1].output,
        nodes: allNodes,
    };
    // Attach refs for runtime interpolation
    if (filterResult)
        result.filterRef = { filter: filterResult.filter, wet: filterResult.wet, dry: filterResult.dry };
    if (distortionResult)
        result.distortionRef = { shaper: distortionResult.shaper, wet: distortionResult.wet, dry: distortionResult.dry, mode: opts.distortion.mode };
    if (delayResult)
        result.delayRef = { delays: delayResult.delays, fbGain: delayResult.fbGain, wet: delayResult.wet, dry: delayResult.dry };
    if (eqResult)
        result.eqRef = { low: eqResult.low, mid: eqResult.mid, high: eqResult.high };
    return result;
}
/**
 * Disconnect and release all nodes in a DSP chain.
 */
export function destroyDSPChain(chain) {
    for (const node of chain.nodes) {
        try {
            node.disconnect();
        }
        catch { /* already disconnected */ }
    }
}
//# sourceMappingURL=DSPChain.js.map