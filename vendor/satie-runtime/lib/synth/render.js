/**
 * The synthesizer: a patch (`patch.ts`) becomes stereo audio, offline, with no
 * model and no vendor. Deterministic for a given patch, length and seed.
 *
 * Three sources per layer (a wavetable of harmonics, a few inharmonic partials
 * that ring, or filtered noise), an envelope per note, one low-pass per layer,
 * slow periodic motion on pitch, cutoff and level, and one reverb for the take.
 *
 * A LOOP is periodic by construction, not by crossfade: every held frequency
 * and every motion is snapped to a whole number of cycles in the take, note
 * tails that pass the end are written back at the start, and filters and the
 * reverb are run in from the end of the take before the part that is kept. The
 * last sample therefore leads into the first.
 *
 * Pure: typed arrays in, typed arrays out. No Web Audio, no Node APIs.
 */
import { mulberry32 } from '../core/Random.js';
import { LIMITS, partialsOf } from './patch.js';
const TAU = Math.PI * 2;
const TABLE = 2048;
const OUT_PEAK = 0.7;
const SINE = (() => { const t = new Float32Array(TABLE + 1); for (let i = 0; i <= TABLE; i++)
    t[i] = Math.sin(TAU * i / TABLE); return t; })();
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** One cycle of a harmonic spectrum, band-limited for the pitch it will play at. */
function harmonicTable(partials, hz, sampleRate) {
    const t = new Float32Array(TABLE + 1);
    for (const p of partials) {
        if (p.ratio * hz > 0.45 * sampleRate)
            continue;
        for (let i = 0; i <= TABLE; i++)
            t[i] += p.amp * Math.sin(TAU * p.ratio * i / TABLE);
    }
    let peak = 0;
    for (let i = 0; i <= TABLE; i++)
        peak = Math.max(peak, Math.abs(t[i]));
    if (peak > 0)
        for (let i = 0; i <= TABLE; i++)
            t[i] /= peak;
    return t;
}
function componentsFor(layer, hz, sampleRate) {
    const partials = layer.partials ?? partialsOf(layer.wave);
    if (partials.every(p => Number.isInteger(p.ratio)))
        return [{ table: harmonicTable(partials, hz, sampleRate), ratio: 1, amp: 1, ring: 1 }];
    const audible = partials.filter(p => p.ratio * hz < 0.45 * sampleRate);
    const total = audible.reduce((s, p) => s + p.amp, 0) || 1;
    return audible.map(p => ({ table: SINE, ratio: p.ratio, amp: p.amp / total, ring: 1 + 0.6 * Math.max(0, p.ratio - 1) }));
}
/** A period that divides the take, so a motion comes back to where it began. */
const wholePeriod = (period, seconds, loop) => (loop ? seconds / Math.max(1, Math.round(seconds / period)) : period);
function notesFor(layer, root, seconds, loop, rng) {
    const p = layer.play;
    const out = [];
    const touch = () => 0.85 + 0.3 * rng();
    if (p.kind === 'hold') {
        const g = 1 / Math.sqrt(p.notes.length);
        for (const n of p.notes)
            out.push({ midi: root + n, start: 0, gate: seconds, gain: g, held: true });
    }
    else if (p.kind === 'chords') {
        const beats = p.chords.reduce((s, c) => s + c.beats, 0);
        let at = 0;
        for (const c of p.chords) {
            const dur = seconds * c.beats / beats;
            const g = 1 / Math.sqrt(c.notes.length);
            for (const n of c.notes)
                out.push({ midi: root + n, start: at, gate: dur, gain: g, held: false });
            at += dur;
        }
    }
    else if (p.kind === 'loops') {
        for (const n of p.notes) {
            const every = wholePeriod(n.every, seconds, loop);
            for (let t = n.at % every; t < seconds - 1e-6; t += every)
                out.push({ midi: root + n.note, start: t, gate: n.length, gain: touch(), held: false });
        }
    }
    else {
        const cycle = p.steps.length * p.step;
        const step = loop ? seconds / (Math.max(1, Math.round(seconds / cycle)) * p.steps.length) : p.step;
        const count = Math.min(4000, Math.floor(seconds / step + 1e-6));
        for (let i = 0; i < count; i++) {
            const n = p.steps[i % p.steps.length];
            if (n !== null)
                out.push({ midi: root + n, start: i * step, gate: Math.min(p.length, step * 4), gain: touch(), held: false });
        }
    }
    return out;
}
/** Equal-power pan gains for a position in -1..1. */
function panGains(pan) {
    const a = (Math.min(1, Math.max(-1, pan)) + 1) * Math.PI / 4;
    return [Math.cos(a), Math.sin(a)];
}
function addNote(L, R, layer, note, o, rng) {
    const N = L.length, sr = o.sampleRate, D = o.seconds;
    const hz = midiHz(note.midi);
    const sustained = note.held && o.loop;
    const comps = componentsFor(layer, hz, sr);
    const pm = layer.pitchMotion;
    const pmPeriod = pm ? wholePeriod(pm.period, D, o.loop) : 1;
    const pmPhase = rng() * TAU;
    // A held one-shot still has to start and stop.
    const gate = note.held ? Math.max(0.01, D - layer.release) : note.gate;
    const life = sustained ? D : gate + layer.release;
    const n = sustained ? N : Math.min(Math.ceil(life * sr), o.loop ? 4 * N : N - Math.floor(note.start * sr));
    if (n <= 0)
        return;
    const startIndex = Math.floor(note.start * sr);
    const voiceGain = note.gain / Math.sqrt(layer.voices);
    for (let v = 0; v < layer.voices; v++) {
        const spread = layer.voices > 1 ? (v / (layer.voices - 1)) * 2 - 1 : 0;
        const [gl, gr] = panGains(layer.pan + spread * layer.width * 0.8);
        const detuned = hz * Math.pow(2, (spread * layer.detune) / 1200);
        for (const c of comps) {
            let f = detuned * c.ratio;
            if (sustained)
                f = Math.max(1, Math.round(f * D)) / D;
            const inc = f / sr;
            // Vibrato as a phase offset, in cycles: it returns to zero after a whole motion period.
            const pmCycles = pm ? (f * (Math.pow(2, pm.depth / 1200) - 1) * pmPeriod) / TAU : 0;
            const pmInc = TAU / (pmPeriod * sr);
            const decay = layer.decay > 0 ? layer.decay / c.ring : 0;
            let phase = rng();
            const amp = c.amp * voiceGain;
            for (let i = 0; i < n; i++) {
                let env = 1;
                if (!sustained) {
                    const t = i / sr;
                    if (t < layer.attack)
                        env = 0.5 - 0.5 * Math.cos(Math.PI * t / layer.attack);
                    else if (decay > 0)
                        env = layer.sustain + (1 - layer.sustain) * Math.exp(-(t - layer.attack) / decay);
                    if (t > gate) {
                        const r = 1 - (t - gate) / layer.release;
                        env *= r > 0 ? r * r : 0;
                    }
                }
                let ph = phase + (pm ? pmCycles * Math.sin(pmInc * (startIndex + i) + pmPhase) : 0);
                ph -= Math.floor(ph);
                const x = ph * TABLE, k = x | 0;
                const s = (c.table[k] + (c.table[k + 1] - c.table[k]) * (x - k)) * amp * env;
                let at = startIndex + i;
                if (at >= N) {
                    if (!o.loop)
                        break;
                    at %= N;
                }
                L[at] += s * gl;
                R[at] += s * gr;
                phase += inc;
                if (phase >= 1)
                    phase -= 1;
            }
        }
    }
}
const motionAt = (m, period, t, phase) => (m ? Math.sin(TAU * t / period + phase) : 0);
/**
 * A state-variable filter over one channel, its corner moving with `cutoffAt`.
 * In a loop it is first run over the end of the take so its state at sample 0
 * is the state it will have when the take comes round again.
 */
function filter(x, sr, loop, band, resonance, cutoffAt) {
    const N = x.length;
    const k = band ? Math.max(0.05, 1.6 * (1 - resonance)) : Math.max(0.1, 2 * (1 - resonance));
    let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
    const set = (i) => {
        const fc = Math.min(Math.max(cutoffAt(i / sr), 30), 0.45 * sr);
        const g = Math.tan(Math.PI * fc / sr);
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
    };
    const run = (from, to, write) => {
        for (let i = from; i < to; i++) {
            if ((i & 63) === 0 || i === from)
                set(i);
            const v3 = x[i] - ic2;
            const v1 = a1 * ic1 + a2 * v3;
            const v2 = ic2 + a2 * ic1 + a3 * v3;
            ic1 = 2 * v1 - ic1;
            ic2 = 2 * v2 - ic2;
            if (write)
                x[i] = band ? v1 * k : v2;
        }
    };
    if (loop)
        run(Math.max(0, N - 2 * sr), N, false);
    run(0, N, true);
}
function peakOf(...channels) {
    let p = 0;
    for (const c of channels)
        for (let i = 0; i < c.length; i++) {
            const a = Math.abs(c[i]);
            if (a > p)
                p = a;
        }
    return p;
}
function renderLayer(layer, patch, o, rng) {
    const sr = o.sampleRate, N = Math.round(o.seconds * sr);
    const L = new Float64Array(N), R = new Float64Array(N);
    const noise = layer.wave === 'noise' && !layer.partials;
    if (noise) {
        for (let i = 0; i < N; i++) {
            const a = rng() * 2 - 1, b = rng() * 2 - 1;
            L[i] = a;
            R[i] = a * (1 - layer.width) + b * layer.width;
        }
    }
    else {
        for (const note of notesFor(layer, patch.root, o.seconds, o.loop, rng))
            addNote(L, R, layer, note, o, rng);
    }
    const cm = layer.cutoffMotion;
    if (noise || cm || layer.cutoff < 16000) {
        const period = cm ? wholePeriod(cm.period, o.seconds, o.loop) : 1;
        const phase = rng() * TAU;
        const cutoffAt = (t) => layer.cutoff * Math.pow(2, (cm?.depth ?? 0) * motionAt(cm, period, t, phase));
        filter(L, sr, o.loop, noise, layer.resonance, cutoffAt);
        filter(R, sr, o.loop, noise, layer.resonance, cutoffAt);
    }
    const lm = layer.levelMotion;
    const lmPeriod = lm ? wholePeriod(lm.period, o.seconds, o.loop) : 1;
    const lmPhase = rng() * TAU;
    const peak = peakOf(L, R);
    const [nl, nr] = noise ? panGains(layer.pan) : [1, 1];
    const gain = peak > 0 ? Math.pow(10, layer.level / 20) / peak : 0;
    for (let i = 0; i < N; i++) {
        const g = gain * (lm ? 1 - lm.depth * (0.5 + 0.5 * motionAt(lm, lmPeriod, i / sr, lmPhase)) : 1);
        L[i] *= g * (noise ? nl * Math.SQRT2 : 1);
        R[i] *= g * (noise ? nr * Math.SQRT2 : 1);
    }
    return [L, R];
}
/** Removes any offset below hearing; run in from the end of a loop like the filters. */
function dcBlock(x, sr, loop) {
    const r = 1 - TAU * 20 / sr;
    let px = 0, py = 0;
    const run = (from, write) => {
        for (let i = from; i < x.length; i++) {
            const y = x[i] - px + r * py;
            px = x[i];
            py = y;
            if (write)
                x[i] = y;
        }
    };
    if (loop)
        run(Math.max(0, x.length - sr), false);
    run(0, true);
}
const FDN_MS = [31.7, 37.9, 43.3, 47.9, 55.1, 61.3, 68.9, 76.7];
const ALLPASS_MS = [[5.3, 12.7], [6.1, 14.3]];
/** An eight-line feedback delay network with two allpasses in front of each side. Returns the wet signal only. */
function reverb(L, R, sr, loop, seconds, tone) {
    const N = L.length;
    const wetL = new Float64Array(N), wetR = new Float64Array(N);
    const lens = FDN_MS.map(ms => Math.max(8, Math.round(ms * sr / 1000)));
    const lines = lens.map(n => new Float64Array(n));
    const pos = lens.map(() => 0);
    const gains = lens.map(n => Math.pow(10, (-3 * n) / (seconds * sr)));
    const damp = 0.05 + 0.6 * (1 - tone);
    const lp = lens.map(() => 0);
    const aps = ALLPASS_MS.map(side => side.map(ms => ({ buf: new Float64Array(Math.max(4, Math.round(ms * sr / 1000))), at: 0 })));
    const allpass = (side, x) => {
        for (const ap of aps[side]) {
            const d = ap.buf[ap.at];
            const y = d - 0.6 * x;
            ap.buf[ap.at] = x + 0.6 * y;
            ap.at = (ap.at + 1) % ap.buf.length;
            x = y;
        }
        return x;
    };
    const out = new Float64Array(8);
    // In a loop the tail of the previous cycle is already ringing when the take starts.
    const passes = loop ? (seconds > N / sr ? 3 : 2) : 1;
    for (let pass = 0; pass < passes; pass++) {
        const keep = pass === passes - 1;
        for (let i = 0; i < N; i++) {
            const inL = allpass(0, L[i]), inR = allpass(1, R[i]);
            let sum = 0;
            for (let j = 0; j < 8; j++) {
                lp[j] += (1 - damp) * (lines[j][pos[j]] - lp[j]);
                out[j] = lp[j];
                sum += out[j];
            }
            sum *= 0.25;
            for (let j = 0; j < 8; j++) {
                lines[j][pos[j]] = (j < 4 ? inL : inR) + (out[j] - sum) * gains[j];
                pos[j] = (pos[j] + 1) % lens[j];
            }
            if (keep) {
                wetL[i] = out[0] - out[2] + out[4] - out[6];
                wetR[i] = out[1] - out[3] + out[5] - out[7];
            }
        }
    }
    return [wetL, wetR];
}
function rmsOf(...channels) {
    let s = 0, n = 0;
    for (const c of channels) {
        for (let i = 0; i < c.length; i++)
            s += c[i] * c[i];
        n += c.length;
    }
    return n ? Math.sqrt(s / n) : 0;
}
export function renderPatch(patch, options) {
    const o = {
        seconds: Math.min(Math.max(options.seconds, LIMITS.minSeconds), LIMITS.maxSeconds),
        loop: options.loop,
        seed: options.seed ?? 1,
        sampleRate: options.sampleRate ?? 44100,
    };
    const sr = o.sampleRate, N = Math.round(o.seconds * sr);
    const rng = mulberry32(o.seed);
    const L = new Float64Array(N), R = new Float64Array(N);
    for (const layer of patch.layers) {
        const [l, r] = renderLayer(layer, patch, o, rng);
        for (let i = 0; i < N; i++) {
            L[i] += l[i];
            R[i] += r[i];
        }
    }
    dcBlock(L, sr, o.loop);
    dcBlock(R, sr, o.loop);
    const { seconds: tail, mix, tone } = patch.reverb;
    if (mix > 0.01 && tail > 0.05) {
        const [wl, wr] = reverb(L, R, sr, o.loop, tail, tone);
        const dry = rmsOf(L, R), wet = rmsOf(wl, wr);
        if (wet > 0 && dry > 0) {
            const g = Math.min(20, (mix / (1 - mix)) * dry / wet);
            for (let i = 0; i < N; i++) {
                L[i] += wl[i] * g;
                R[i] += wr[i] * g;
            }
        }
    }
    if (!o.loop) {
        const fade = Math.min(N, Math.round(0.08 * sr));
        for (let i = 0; i < fade; i++) {
            const g = i / fade;
            L[N - 1 - i] *= g;
            R[N - 1 - i] *= g;
        }
    }
    let nonFinite = false;
    for (let i = 0; i < N; i++)
        if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) {
            nonFinite = true;
            L[i] = 0;
            R[i] = 0;
        }
    const rawPeak = peakOf(L, R);
    const gain = rawPeak > 0 ? OUT_PEAK / rawPeak : 0;
    const left = new Float32Array(N), right = new Float32Array(N);
    let sumL = 0, sumR = 0, step = 0;
    for (let i = 0; i < N; i++) {
        left[i] = L[i] * gain;
        right[i] = R[i] * gain;
        sumL += left[i];
        sumR += right[i];
        if (i)
            step = Math.max(step, Math.abs(left[i] - left[i - 1]), Math.abs(right[i] - right[i - 1]));
    }
    const jump = Math.max(Math.abs(left[0] - left[N - 1]), Math.abs(right[0] - right[N - 1]));
    return {
        left, right, sampleRate: sr,
        stats: {
            rawPeak, peak: rawPeak > 0 ? OUT_PEAK : 0, rms: rmsOf(L, R) * gain,
            dc: Math.max(Math.abs(sumL / N), Math.abs(sumR / N)), nonFinite,
            seam: step > 0 ? jump / step : 0,
        },
    };
}
/** Why a render must not be kept, in plain words; null when it is fine. */
export function refusal(stats) {
    if (stats.nonFinite)
        return 'the render produced invalid samples';
    if (stats.rawPeak < 1e-4)
        return 'the patch made no sound';
    if (stats.dc > 0.1)
        return 'the render has a DC offset';
    return null;
}
/** 16-bit stereo WAV bytes, for the encoder that follows and for listening to a render directly. */
export function wavBytes(r) {
    const n = r.left.length;
    const bytes = new Uint8Array(44 + n * 4);
    const v = new DataView(bytes.buffer);
    const tag = (at, s) => { for (let i = 0; i < s.length; i++)
        bytes[at + i] = s.charCodeAt(i); };
    tag(0, 'RIFF');
    v.setUint32(4, 36 + n * 4, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, r.sampleRate, true);
    v.setUint32(28, r.sampleRate * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    tag(36, 'data');
    v.setUint32(40, n * 4, true);
    const put = (at, x) => v.setInt16(at, Math.round(Math.max(-1, Math.min(1, x)) * 32767), true);
    for (let i = 0; i < n; i++) {
        put(44 + i * 4, r.left[i]);
        put(46 + i * 4, r.right[i]);
    }
    return bytes;
}
//# sourceMappingURL=render.js.map