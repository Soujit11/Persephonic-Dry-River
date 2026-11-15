/**
 * Rigid-sphere scattering — what a capsule mounted ON a body actually hears.
 *
 * Satie's mic-array render models four omni capsules floating in free air:
 * a relative delay and a relative gain per capsule, nothing between them.
 * The array the machine-listening benchmarks are recorded on is not that.
 * STARSS23 (DCASE Task 3, MIC format) is a four-capsule subset of an
 * Eigenmike, and an Eigenmike's capsules sit FLUSH ON A RIGID SPHERE of the
 * same 4.2 cm radius. Sound does not pass through that sphere: it diffracts
 * around it, doubles against it on the lit side and is shadowed behind it.
 * A model trained on GCC-PHAT and level differences reads exactly those
 * quantities, so the free-field corpus and the real recording disagree about
 * the meaning of every feature (measured: 108.7° direction error zero-shot,
 * near chance — docs/research/2026-08-28-satie-scenes-v2-starss23.md).
 *
 * This module owns the physics and nothing else. Pure functions: angle and
 * frequency in, complex pressure out; angle grid in, FIR table out. No Web
 * Audio, no scene content, no knowledge of what is being rendered.
 *
 * ## The model
 *
 * A plane wave of unit amplitude, incident on a rigid sphere of radius `a`
 * from direction `û`. The pressure measured at a point ON the surface whose
 * outward normal makes angle Θ with `û`, referenced to the free-field
 * pressure at the sphere's CENTRE, is the classic modal series
 *
 *   H(Θ, ka) = (ka)^-2 · Σ_n (2n+1) · i^(n-1) · P_n(cos Θ) / h_n′(ka)
 *
 * with k = 2πf/c, `P_n` the Legendre polynomials and `h_n` the spherical
 * Hankel function of the SECOND kind. Derivation (also the reference this
 * follows): Rafaely, *Fundamentals of Spherical Array Processing*, 2nd ed.,
 * §2.4 "Scattering from a rigid sphere" and §4.2 (the `b_n(ka)` mode
 * strength, whose rigid-sphere form is `4π i^n · i/((ka)² h_n′(ka))` after
 * the Wronskian `j_n y_n′ − j_n′ y_n = 1/x²`); the same result is Williams,
 * *Fourier Acoustics*, §6.10. Expanding the incident wave as
 * `e^{ika û·r} = Σ (2n+1) i^n j_n(kr) P_n(cos Θ)`, adding an outgoing
 * scattered field and imposing `∂p/∂r = 0` at `r = a` gives the series above.
 *
 * ## Conventions, stated because they are sign traps
 *
 * - **Time convention `e^{+iωt}`.** Outgoing waves are therefore the SECOND
 *   kind, `h_n = j_n − i·y_n`, and a pure delay τ has transfer function
 *   `e^{−iωτ}`. (The `e^{−iωt}` literature writes `h_n^(1)` and the complex
 *   conjugate of everything here.) The DFT used to derive the FIRs matches:
 *   synthesis kernel `e^{+i2πkn/N}`, so a delay of m samples is `e^{−iω_k m}`.
 * - **Referenced to the array centre, not to the capsule.** `H` is the ratio
 *   of surface pressure to the free-field pressure that would exist at the
 *   sphere's centre. That is deliberately the same reference the free-field
 *   capsule mix uses (`MicArrayRender`), so the sphere response REPLACES the
 *   relative delay and relative gain rather than stacking on them — the
 *   modal solution already contains the propagation phase across the sphere,
 *   and applying the free-field delay too would count it twice.
 * - **Far field / plane wave.** A spherical wave from 1 m has 4 % curvature
 *   across a 4.2 cm sphere; the corpus's sources are ≥ 1 m and its median is
 *   3.2 m. The cost is that the ≤ 0.37 dB inter-capsule level difference
 *   pure 1/r spreading would give at 1 m is not modelled — swamped by the
 *   several-dB diffraction difference that is.
 * - **Flush, omnidirectional, point capsules.** No capsule directivity, no
 *   mounting cavity, no housing.
 *
 * ## Truncation
 *
 * The series is infinite; `modalOrderFor` picks where to stop from a bound
 * that does not depend on Θ. Since |P_n(cos Θ)| ≤ 1 for every angle,
 * |term_n| ≤ (2n+1)/((ka)²·|h_n′(ka)|), and `|h_n′|` grows super-exponentially
 * once n > ka. Summing that bound from the top down gives a rigorous
 * absolute error on the truncated `H`; the order returned is the smallest
 * whose tail bound is under `tol`. No magic constant — see the tests.
 */
/** Speed of sound at 20 °C, m/s. Mirrors `MicArray.SPEED_OF_SOUND`. */
import { SPEED_OF_SOUND } from './MicArray.js';
/**
 * Spherical Bessel `y_n(x)`, n = 0..nMax, by upward recurrence.
 *
 * Upward is the STABLE direction for the second solution: |y_n| grows with
 * n, so rounding error stays relatively small. (The opposite is true of
 * `j_n` — see below.)
 */
export function sphericalY(nMax, x) {
    const y = new Float64Array(nMax + 1);
    y[0] = -Math.cos(x) / x;
    if (nMax >= 1)
        y[1] = -Math.cos(x) / (x * x) - Math.sin(x) / x;
    for (let n = 1; n < nMax; n++) {
        const next = ((2 * n + 1) / x) * y[n] - y[n - 1];
        // For x << n, |y_n| ~ x^-(n+1) overflows. Saturate at Infinity rather
        // than letting Infinity - Infinity poison the rest as NaN: every term
        // that far out is exactly the one the truncation is there to drop.
        if (!Number.isFinite(next)) {
            y.fill(Infinity, n + 1);
            return y;
        }
        y[n + 1] = next;
    }
    return y;
}
/**
 * Spherical Bessel `j_n(x)`, n = 0..nMax, by Miller's DOWNWARD recurrence.
 *
 * Upward recurrence for `j_n` is catastrophically unstable once n > x (the
 * recurrence's growing solution is `y_n`, and any rounding error is that
 * solution). Miller's trick: start above the order needed with an arbitrary
 * seed, recur downward — where `j_n` is the growing solution and the error
 * is damped — then rescale by the known `j_0(x) = sin(x)/x`.
 */
export function sphericalJ(nMax, x) {
    const start = nMax + Math.ceil(Math.sqrt(40 * (nMax + 1))) + 20;
    let f1 = 0; // f_{n+1}
    let f0 = 1e-280; // f_n, arbitrary seed
    const f = new Float64Array(nMax + 1);
    for (let n = start; n >= 1; n--) {
        const fm = ((2 * n + 1) / x) * f0 - f1;
        f1 = f0;
        f0 = fm;
        if (n - 1 <= nMax)
            f[n - 1] = fm;
        if (Math.abs(f0) > 1e250) { // renormalize before overflow
            const s = 1e-250;
            f0 *= s;
            f1 *= s;
            for (let i = Math.max(0, n - 1); i <= nMax; i++)
                f[i] *= s;
        }
    }
    const scale = (Math.sin(x) / x) / f[0];
    for (let n = 0; n <= nMax; n++)
        f[n] *= scale;
    return f;
}
/**
 * Derivative of the spherical Hankel function of the second kind,
 * `h_n′(x)` for n = 0..nMax, with `h_n = j_n − i·y_n` (the `e^{+iωt}`
 * outgoing solution). Uses `f_n′ = f_{n−1} − ((n+1)/x)·f_n`, and
 * `h_0′ = −h_1`.
 */
export function hankel2Deriv(nMax, x) {
    const j = sphericalJ(nMax + 1, x);
    const y = sphericalY(nMax + 1, x);
    const out = new Array(nMax + 1);
    out[0] = { re: -j[1], im: y[1] };
    for (let n = 1; n <= nMax; n++) {
        const k = (n + 1) / x;
        // Once y_n has saturated (x << n) the whole Hankel derivative is
        // effectively infinite; say so explicitly instead of Inf − Inf = NaN.
        const im = Number.isFinite(y[n - 1]) && Number.isFinite(y[n])
            ? -(y[n - 1] - k * y[n]) : Infinity;
        out[n] = { re: j[n - 1] - k * j[n], im };
    }
    return out;
}
/**
 * Where the modal series has actually converged, for this `ka`.
 *
 * Returns the smallest order whose Θ-independent tail bound
 * `Σ_{n>N} (2n+1)/((ka)²|h_n′(ka)|)` is at or below `tol`, plus the bound
 * itself so a caller (or a test) can check rather than trust.
 */
export function modalOrderFor(ka, tol = 1e-10) {
    if (!(ka > 0))
        return { order: 0, tailBound: 0 };
    const ceiling = Math.ceil(ka) + 90;
    const hp = hankel2Deriv(ceiling, ka);
    const k2 = ka * ka;
    const bound = new Float64Array(ceiling + 1);
    for (let n = 0; n <= ceiling; n++) {
        const mag = Math.hypot(hp[n].re, hp[n].im);
        bound[n] = mag > 0 ? (2 * n + 1) / (k2 * mag) : Infinity;
    }
    let tail = 0;
    for (let n = ceiling; n >= 0; n--) {
        const next = tail + bound[n];
        if (next > tol)
            return { order: n, tailBound: tail };
        tail = next;
    }
    return { order: 0, tailBound: tail };
}
/**
 * `H(Θ, ka)` — surface pressure at a flush capsule whose outward normal is
 * Θ away from the incidence direction, referenced to the free-field
 * pressure at the sphere's centre.
 *
 * `cosTheta = 1` is the capsule facing the source (lit pole, pressure
 * doubling at high `ka`); `cosTheta = −1` is the antipode (deep shadow, and
 * the on-axis bright spot the theory insists on).
 */
export function rigidSphereResponse(cosTheta, ka, tol = 1e-10) {
    if (!(ka > 1e-6))
        return { re: 1, im: 0 }; // ka → 0: acoustically transparent
    const { order } = modalOrderFor(ka, tol);
    const hp = hankel2Deriv(order, ka);
    const t = Math.min(1, Math.max(-1, cosTheta));
    let pPrev = 1; // P_0
    let pCur = t; // P_1
    let re = 0, im = 0;
    for (let n = 0; n <= order; n++) {
        const legendre = n === 0 ? 1 : n === 1 ? t : pCur;
        // i^(n-1) — the quarter-turn cycle, no complex pow needed.
        const m = ((n - 1) % 4 + 4) % 4;
        const ur = m === 0 ? 1 : m === 2 ? -1 : 0;
        const ui = m === 1 ? 1 : m === 3 ? -1 : 0;
        // (2n+1) · i^(n-1) · P_n / h_n′
        const h = hp[n];
        const den = h.re * h.re + h.im * h.im;
        const w = (2 * n + 1) * legendre;
        const nr = w * ur, ni = w * ui;
        re += (nr * h.re + ni * h.im) / den;
        im += (ni * h.re - nr * h.im) / den;
        if (n >= 1) {
            const nxt = ((2 * n + 1) * t * pCur - n * pPrev) / (n + 1);
            pPrev = pCur;
            pCur = nxt;
        }
    }
    const s = 1 / (ka * ka);
    return { re: re * s, im: im * s };
}
/**
 * In-place iterative radix-2 FFT. `sign = +1` is the synthesis kernel
 * `e^{+i2πkn/N}` (inverse, unnormalized); `sign = −1` is analysis. Kept
 * local because the engine has no FFT and this one is used exactly once,
 * at table-build time.
 */
function fft(re, im, sign) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            let t = re[i];
            re[i] = re[j];
            re[j] = t;
            t = im[i];
            im[i] = im[j];
            im[j] = t;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (sign * 2 * Math.PI) / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const ur = re[i + k], ui = im[i + k];
                const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
                const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                re[i + k] = ur + vr;
                im[i + k] = ui + vi;
                re[i + k + len / 2] = ur - vr;
                im[i + k + len / 2] = ui - vi;
                const ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
    }
}
/**
 * Build the one-parameter family of FIRs.
 *
 * The design insight that makes the sphere cheap: by spherical symmetry the
 * surface response depends only on the SCALAR angle Θ between the source
 * direction and the capsule's own outward normal, and on frequency. Not on
 * the absolute direction, not on which capsule. So the entire effect is one
 * table of FIRs indexed by Θ, built once per (radius, sample rate) and
 * shared by every capsule of every source of every scene.
 */
export function buildSphereFirTable(radiusM, sampleRate, options = {}) {
    const stepDeg = options.stepDeg ?? 1;
    const tol = options.tol ?? 1e-10;
    const taperFrom = options.taperFrom ?? 0.9;
    const entries = Math.round(180 / stepDeg) + 1;
    const transitSamples = (radiusM / SPEED_OF_SOUND) * sampleRate; // a/c in samples
    // The response is symmetric about the centre reference: the lit pole leads
    // by a/c, the antipode's creeping wave trails by (π/2)a/c plus ringing.
    // ±11 transit times either side of centre is far past both (±1.35 ms at
    // r = 4.2 cm) and is what the measured error budget below is quoted at.
    const taps = Math.max(32, 2 * Math.round(11 * transitSamples));
    const preDelay = taps / 2;
    // Long enough that the circular convolution's own tail never wraps into
    // the window we keep.
    let fftSize = 512;
    while (fftSize < 8 * taps)
        fftSize *= 2;
    const half = fftSize / 2;
    const ka = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) {
        ka[k] = (2 * Math.PI * (k * sampleRate / fftSize) * radiusM) / SPEED_OF_SOUND;
    }
    let maxOrder = 0;
    for (let k = 1; k <= half; k++)
        maxOrder = Math.max(maxOrder, modalOrderFor(ka[k], tol).order);
    const fir = new Float32Array(entries * taps);
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    let worstTruncatedEnergy = 0;
    for (let e = 0; e < entries; e++) {
        const cosTheta = Math.cos((e * stepDeg * Math.PI) / 180);
        re.fill(0);
        im.fill(0);
        re[0] = 1;
        im[0] = 0; // DC: transparent
        for (let k = 1; k < half; k++) {
            const h = rigidSphereResponse(cosTheta, ka[k], tol);
            const frac = k / half;
            const g = frac > taperFrom
                ? 0.5 * (1 + Math.cos((Math.PI * (frac - taperFrom)) / (1 - taperFrom)))
                : 1;
            re[k] = h.re * g;
            im[k] = h.im * g;
            re[fftSize - k] = re[k];
            im[fftSize - k] = -im[k]; // Hermitian → real IR
        }
        re[half] = 0;
        im[half] = 0; // Nyquist: end of the taper
        fft(re, im, +1);
        let total = 0;
        for (let n = 0; n < fftSize; n++)
            total += (re[n] * re[n]) / (fftSize * fftSize);
        let kept = 0;
        const base = e * taps;
        for (let t = 0; t < taps; t++) {
            const src = ((t - preDelay) % fftSize + fftSize) % fftSize;
            const v = re[src] / fftSize;
            fir[base + t] = v;
            kept += v * v;
        }
        if (total > 0)
            worstTruncatedEnergy = Math.max(worstTruncatedEnergy, Math.max(0, 1 - kept / total));
    }
    return {
        radiusM, sampleRate, stepDeg, entries, taps, preDelay, fir, fftSize, maxOrder,
        taperFrom, worstTruncatedEnergy,
    };
}
const tableCache = new Map();
/**
 * Cached `buildSphereFirTable`. The table depends only on radius, rate and
 * grid, so a whole corpus render builds it once (~10 ms) and every block of
 * every capsule reads it.
 */
export function sphereFirTable(radiusM, sampleRate, options = {}) {
    const key = `${radiusM}|${sampleRate}|${options.stepDeg ?? 1}|${options.tol ?? 1e-10}|${options.taperFrom ?? 0.9}`;
    let t = tableCache.get(key);
    if (!t) {
        t = buildSphereFirTable(radiusM, sampleRate, options);
        tableCache.set(key, t);
    }
    return t;
}
/**
 * Write the FIR for an arbitrary angle into `out`, linearly interpolating
 * between the two grid entries either side. Over a 1° step the response's
 * group delay moves by under 0.06 samples, so tap-domain interpolation is
 * safe — there is no comb artefact to worry about at this grid.
 */
export function sphereFirAt(table, thetaDeg, out) {
    const clamped = Math.min(180, Math.max(0, thetaDeg));
    const pos = clamped / table.stepDeg;
    const i0 = Math.min(table.entries - 1, Math.floor(pos));
    const i1 = Math.min(table.entries - 1, i0 + 1);
    const f = pos - i0;
    const a = i0 * table.taps, b = i1 * table.taps;
    for (let t = 0; t < table.taps; t++) {
        const x = table.fir[a + t];
        out[t] = x + (table.fir[b + t] - x) * f;
    }
}
//# sourceMappingURL=RigidSphere.js.map