/**
 * Can you hear it in this mix? A critical-band masking model, so the answer
 * depends on pitch, not only on overall level: a low hum under high cicadas
 * comes through, a cicada under cicadas does not.
 *
 * Every constant is a published psychoacoustic value, none is tuned to a scene:
 *   - 24 critical bands (Zwicker 1961, the Bark scale);
 *   - threshold in quiet (Terhardt 1979, the curve MPEG psychoacoustic models use);
 *   - spreading of masking across bands (Schroeder, Atal & Hall 1979);
 *   - a noise masker hides a band's signal until the signal is within 5.5 dB of the
 *     masker's spread excitation (Johnston 1988; environmental maskers are noise-like);
 *   - specific loudness N' = 0.08 E^0.23 (Zwicker), taken as partial loudness: the
 *     loudness a sound adds on top of everything else in each band.
 *
 * Inputs are what the level model already knows: each source's level at your ear
 * and the spectrum of the take it plays (measured once per take). It is an
 * estimate of steady-state masking from average spectra, not a measurement of the
 * signal, and it ignores masking in time (a click right after a bang).
 */
/** Band edges in Hz (Zwicker's critical bands). */
export const BARK_EDGES = [20, 100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500];
export const BANDS = BARK_EDGES.length - 1;
export const BAND_CENTRES = BARK_EDGES.slice(0, -1).map((lo, b) => Math.sqrt(lo * BARK_EDGES[b + 1]));
/** Threshold in quiet, dB SPL (Terhardt 1979). */
export function thresholdInQuietDb(hz) {
    const k = Math.max(hz, 20) / 1000;
    return 3.64 * k ** -0.8 - 6.5 * Math.exp(-0.6 * (k - 3.3) ** 2) + 1e-3 * k ** 4;
}
const QUIET = BAND_CENTRES.map(f => 10 ** (thresholdInQuietDb(f) / 10));
/** Spreading of masking from band i to band j, as a power ratio (Schroeder et al. 1979), dz in Bark. */
function spread(dz) {
    const db = 15.81 + 7.5 * (dz + 0.474) - 17.5 * Math.sqrt(1 + (dz + 0.474) ** 2);
    return 10 ** (db / 10);
}
const SPREAD = Array.from({ length: BANDS }, (_, i) => Array.from({ length: BANDS }, (_, j) => spread(j - i)));
/** A noise masker's threshold sits this far under its spread excitation (Johnston 1988). */
export const NOISE_MASKING_OFFSET_DB = 5.5;
const OFFSET = 10 ** (-NOISE_MASKING_OFFSET_DB / 10);
// ── the take's spectrum: its energy share per band, measured once ──
function fftPower(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                re[i + k + len / 2] = re[i + k] - ar;
                im[i + k + len / 2] = im[i + k] - ai;
                re[i + k] += ar;
                im[i + k] += ai;
                const t = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = t;
            }
        }
    }
}
const spectra = new WeakMap();
const FRAME = 2048, FRAMES = 16;
/**
 * The share of a take's energy in each band (sums to 1; all-silent takes are flat).
 * Averaged over up to 16 Hann-windowed frames spread across the take; cached per buffer.
 */
export function bandSpectrum(buffer) {
    const hit = spectra.get(buffer);
    if (hit)
        return hit;
    const out = new Float32Array(BANDS);
    const n = Math.min(FRAME, 1 << Math.floor(Math.log2(Math.max(2, buffer.length))));
    const frames = Math.max(1, Math.min(FRAMES, Math.floor(buffer.length / n)));
    const step = frames > 1 ? (buffer.length - n) / (frames - 1) : 0;
    const re = new Float32Array(n), im = new Float32Array(n);
    const binHz = buffer.sampleRate / n;
    const bandOf = new Int16Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
        const f = k * binHz;
        let b = -1;
        for (let e = 0; e < BANDS; e++)
            if (f >= BARK_EDGES[e] && f < BARK_EDGES[e + 1]) {
                b = e;
                break;
            }
        bandOf[k] = b;
    }
    for (let fr = 0; fr < frames; fr++) {
        const at = Math.floor(fr * step);
        re.fill(0);
        im.fill(0);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const d = buffer.getChannelData(c);
            for (let k = 0; k < n; k++)
                re[k] += (d[at + k] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (n - 1)));
        }
        fftPower(re, im);
        for (let k = 1; k < n / 2; k++)
            if (bandOf[k] >= 0)
                out[bandOf[k]] += re[k] * re[k] + im[k] * im[k];
    }
    let total = 0;
    for (const v of out)
        total += v;
    if (total > 0)
        for (let b = 0; b < BANDS; b++)
            out[b] /= total;
    else
        out.fill(1 / BANDS);
    spectra.set(buffer, out);
    return out;
}
function bandLevels(s) {
    const e = new Float64Array(BANDS);
    const total = 10 ** (s.receivedDb / 10);
    for (let b = 0; b < BANDS; b++) {
        const lp = s.cutoffHz ? 1 / (1 + (BAND_CENTRES[b] / s.cutoffHz) ** 4) : 1;
        e[b] = total * s.spectrum[b] * lp;
    }
    return e;
}
/** Each source's audibility against everything else heard at the same place. */
export function audibility(sources) {
    const bands = sources.map(bandLevels);
    // each source's excitation, spread across bands
    const excite = bands.map(e => {
        const x = new Float64Array(BANDS);
        for (let j = 0; j < BANDS; j++) {
            let sum = 0;
            for (let i = 0; i < BANDS; i++)
                sum += e[i] * SPREAD[i][j];
            x[j] = sum;
        }
        return x;
    });
    const all = new Float64Array(BANDS);
    for (const x of excite)
        for (let b = 0; b < BANDS; b++)
            all[b] += x[b];
    const out = new Map();
    sources.forEach((s, k) => {
        let best = -Infinity, bestBand = -1, sones = 0;
        for (let b = 0; b < BANDS; b++) {
            const masker = all[b] - excite[k][b];
            const threshold = masker * OFFSET + QUIET[b];
            const own = bands[k][b];
            if (own > 0) {
                const m = 10 * Math.log10(own / threshold);
                if (m > best) {
                    best = m;
                    bestBand = b;
                }
            }
            sones += 0.08 * (Math.max(0, own + masker + QUIET[b]) ** 0.23 - (masker + QUIET[b]) ** 0.23);
        }
        let maskerId = null;
        if (bestBand >= 0) {
            let most = 0;
            sources.forEach((o, j) => { if (j !== k && excite[j][bestBand] > most) {
                most = excite[j][bestBand];
                maskerId = o.id;
            } });
            if (most * OFFSET < QUIET[bestBand])
                maskerId = null; // under the threshold in quiet, nothing else is covering it
        }
        out.set(s.id, { marginDb: Number.isFinite(best) ? best : -Infinity, sones: Math.max(0, sones), maskerId });
    });
    return out;
}
//# sourceMappingURL=Audibility.js.map