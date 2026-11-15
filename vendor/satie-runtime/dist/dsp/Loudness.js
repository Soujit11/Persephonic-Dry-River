/**
 * Loudness measurement (ITU-R BS.1770-4) and loudness normalization.
 *
 * A generated or uploaded clip carries no calibrated level: a cricket and a
 * thunder take land at the same peak. An emission level (`spl`,
 * spatial/LevelModel.ts) means nothing until every buffer is brought to one
 * reference loudness — so decoded buffers are measured here (K-weighting:
 * a +4 dB high shelf at ~1.5 kHz and a 38 Hz high-pass; 400 ms blocks at 75 %
 * overlap; absolute gate −70 LUFS and relative gate −10 LU) and scaled in
 * place to `CLIP_LUFS`, peak-limited so a spiky take never clips.
 *
 * Pure DSP on Float32Arrays — no Web Audio nodes, usable offline and in tests.
 */
import { CLIP_LUFS, dbToGain } from '../spatial/LevelModel.js';
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const BLOCK_S = 0.4;
const HOP_S = 0.1;
/** Peaks are kept under this (linear) when normalizing — −1 dBFS. */
export const PEAK_CEILING = dbToGain(-1);
/** The most a buffer is ever raised on arrival, dB: beyond this only the noise floor would come up. */
export const MAX_NORMALIZE_GAIN_DB = 24;
/** BS.1770 pre-filter (high shelf) for a sample rate. */
function shelf(fs) {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan(Math.PI * f0 / fs);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    return {
        b0: (Vh + Vb * K / Q + K * K) / a0,
        b1: 2 * (K * K - Vh) / a0,
        b2: (Vh - Vb * K / Q + K * K) / a0,
        a1: 2 * (K * K - 1) / a0,
        a2: (1 - K / Q + K * K) / a0,
    };
}
/** BS.1770 RLB weighting (high-pass) for a sample rate. */
function highpass(fs) {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const K = Math.tan(Math.PI * f0 / fs);
    const a0 = 1 + K / Q + K * K;
    return { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
}
/** K-weight one channel into `out` (direct form I, two stages). */
function kWeight(x, out, s, h) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // stage 1 state
    let u1 = 0, u2 = 0, v1 = 0, v2 = 0; // stage 2 state
    for (let i = 0; i < x.length; i++) {
        const xi = x[i];
        const y = s.b0 * xi + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2;
        x2 = x1;
        x1 = xi;
        y2 = y1;
        y1 = y;
        const v = h.b0 * y + h.b1 * u1 + h.b2 * u2 - h.a1 * v1 - h.a2 * v2;
        u2 = u1;
        u1 = y;
        v2 = v1;
        v1 = v;
        out[i] = v;
    }
}
/** Integrated loudness per BS.1770-4. Channel weights default to 1. */
export function measureLoudness(buffer, options = {}) {
    const fs = buffer.sampleRate;
    const n = buffer.length;
    const chans = buffer.numberOfChannels;
    let peak = 0;
    for (let c = 0; c < chans; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
            const a = Math.abs(d[i]);
            if (a > peak)
                peak = a;
        }
    }
    if (n === 0 || peak === 0)
        return { lufs: -Infinity, peak };
    const s = shelf(fs), h = highpass(fs);
    const block = Math.max(1, Math.round(BLOCK_S * fs));
    const hop = Math.max(1, Math.round(HOP_S * fs));
    // Short clips: one block over everything.
    const nBlocks = n < block ? 1 : Math.floor((n - block) / hop) + 1;
    const power = new Float64Array(nBlocks);
    const weighted = new Float32Array(n);
    const weights = options.channelWeights;
    if (weights && weights.length !== chans) {
        throw new Error(`measureLoudness: ${chans} channels but ${weights.length} weights`);
    }
    for (let c = 0; c < chans; c++) {
        const g = weights ? weights[c] : 1;
        if (g === 0)
            continue; // LFE contributes nothing to loudness
        kWeight(buffer.getChannelData(c), weighted, s, h);
        for (let b = 0; b < nBlocks; b++) {
            const start = b * hop;
            const end = Math.min(n, start + block);
            let sum = 0;
            for (let i = start; i < end; i++)
                sum += weighted[i] * weighted[i];
            power[b] += g * (sum / Math.max(1, end - start));
        }
    }
    const lk = (z) => (z <= 0 ? -Infinity : -0.691 + 10 * Math.log10(z));
    // Absolute gate
    let sum = 0, count = 0;
    for (let b = 0; b < nBlocks; b++)
        if (lk(power[b]) > ABSOLUTE_GATE_LUFS) {
            sum += power[b];
            count++;
        }
    if (!count)
        return { lufs: -Infinity, peak };
    // Relative gate
    const rel = lk(sum / count) + RELATIVE_GATE_LU;
    sum = 0;
    count = 0;
    for (let b = 0; b < nBlocks; b++)
        if (lk(power[b]) > rel) {
            sum += power[b];
            count++;
        }
    if (!count)
        return { lufs: -Infinity, peak };
    return { lufs: lk(sum / count), peak };
}
/**
 * Scale a buffer in place to `targetLufs` (default `CLIP_LUFS`), never
 * pushing its peak above `PEAK_CEILING`. Silence is left alone.
 */
export function normalizeBufferLoudness(buffer, targetLufs = CLIP_LUFS) {
    const m = measureLoudness(buffer);
    if (!isFinite(m.lufs))
        return { ...m, gainDb: 0, peakLimited: false };
    // A take that came back nearly silent (an audio model asked for something
    // "faint" and delivered almost nothing) has nothing but its noise floor to
    // raise: normalizing it fully turns hiss into the sound. The gain is capped;
    // such a take simply plays quiet, which is what it is.
    let gain = Math.min(dbToGain(MAX_NORMALIZE_GAIN_DB), dbToGain(targetLufs - m.lufs));
    let peakLimited = false;
    if (m.peak * gain > PEAK_CEILING) {
        gain = PEAK_CEILING / m.peak;
        peakLimited = true;
    }
    if (Math.abs(gain - 1) > 1e-4) {
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const d = buffer.getChannelData(c);
            for (let i = 0; i < d.length; i++)
                d[i] *= gain;
        }
    }
    return { lufs: m.lufs, peak: m.peak * gain, gainDb: 20 * Math.log10(gain), peakLimited };
}
/**
 * Inter-sample (true) peak by 4x oversampling, the rate BS.1770-4 Annex 2
 * specifies for content at 48 kHz. The interpolator is a Blackman-windowed
 * sinc rather than the Annex's exact FIR: the peak it reports lands within a
 * small fraction of a dB, which is all the consumers of it need.
 */
export function truePeak(samples) {
    const factor = 4;
    const halfTaps = 8;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak)
            peak = a;
    }
    for (let phase = 1; phase < factor; phase++) {
        const kernel = sincKernel(phase / factor, halfTaps);
        for (let i = 0; i < samples.length; i++) {
            let acc = 0;
            for (let k = -halfTaps + 1; k <= halfTaps; k++) {
                const idx = i + k;
                if (idx < 0 || idx >= samples.length)
                    continue;
                acc += samples[idx] * kernel[k + halfTaps - 1];
            }
            const a = Math.abs(acc);
            if (a > peak)
                peak = a;
        }
    }
    return peak;
}
/** Blackman-windowed sinc taps for a fractional delay of `offset` samples. */
function sincKernel(offset, halfTaps) {
    const taps = halfTaps * 2;
    const kernel = new Float64Array(taps);
    for (let k = -halfTaps + 1, n = 0; k <= halfTaps; k++, n++) {
        const x = k - offset;
        const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const t = (n + 0.5) / taps;
        const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * t) + 0.08 * Math.cos(4 * Math.PI * t);
        kernel[n] = sinc * window;
    }
    return kernel;
}
//# sourceMappingURL=Loudness.js.map