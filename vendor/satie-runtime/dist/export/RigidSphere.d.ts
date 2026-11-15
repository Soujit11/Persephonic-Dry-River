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
export interface Complex {
    re: number;
    im: number;
}
/**
 * Spherical Bessel `y_n(x)`, n = 0..nMax, by upward recurrence.
 *
 * Upward is the STABLE direction for the second solution: |y_n| grows with
 * n, so rounding error stays relatively small. (The opposite is true of
 * `j_n` — see below.)
 */
export declare function sphericalY(nMax: number, x: number): Float64Array;
/**
 * Spherical Bessel `j_n(x)`, n = 0..nMax, by Miller's DOWNWARD recurrence.
 *
 * Upward recurrence for `j_n` is catastrophically unstable once n > x (the
 * recurrence's growing solution is `y_n`, and any rounding error is that
 * solution). Miller's trick: start above the order needed with an arbitrary
 * seed, recur downward — where `j_n` is the growing solution and the error
 * is damped — then rescale by the known `j_0(x) = sin(x)/x`.
 */
export declare function sphericalJ(nMax: number, x: number): Float64Array;
/**
 * Derivative of the spherical Hankel function of the second kind,
 * `h_n′(x)` for n = 0..nMax, with `h_n = j_n − i·y_n` (the `e^{+iωt}`
 * outgoing solution). Uses `f_n′ = f_{n−1} − ((n+1)/x)·f_n`, and
 * `h_0′ = −h_1`.
 */
export declare function hankel2Deriv(nMax: number, x: number): Complex[];
export interface ModalTruncation {
    /** Highest term kept in the series. */
    order: number;
    /** Rigorous bound on |H_exact − H_truncated|, valid for EVERY Θ. */
    tailBound: number;
}
/**
 * Where the modal series has actually converged, for this `ka`.
 *
 * Returns the smallest order whose Θ-independent tail bound
 * `Σ_{n>N} (2n+1)/((ka)²|h_n′(ka)|)` is at or below `tol`, plus the bound
 * itself so a caller (or a test) can check rather than trust.
 */
export declare function modalOrderFor(ka: number, tol?: number): ModalTruncation;
/**
 * `H(Θ, ka)` — surface pressure at a flush capsule whose outward normal is
 * Θ away from the incidence direction, referenced to the free-field
 * pressure at the sphere's centre.
 *
 * `cosTheta = 1` is the capsule facing the source (lit pole, pressure
 * doubling at high `ka`); `cosTheta = −1` is the antipode (deep shadow, and
 * the on-axis bright spot the theory insists on).
 */
export declare function rigidSphereResponse(cosTheta: number, ka: number, tol?: number): Complex;
export interface SphereFirTable {
    radiusM: number;
    sampleRate: number;
    /** Angle grid step, degrees. Entry `i` is Θ = i·stepDeg. */
    stepDeg: number;
    /** Number of angle entries (Θ = 0 … 180 inclusive). */
    entries: number;
    /** Taps per entry. */
    taps: number;
    /**
     * Look-ahead baked into the table: tap `k` of an entry is the response at
     * lag `k − preDelay` samples. The lit pole ARRIVES EARLY (up to a/c before
     * the centre), so the impulse response is genuinely non-causal about the
     * centre reference; the renderer reads the stem `preDelay` samples ahead
     * to cancel it exactly, leaving no common delay between the sphere and
     * free-field paths.
     */
    preDelay: number;
    /** All entries, concatenated: entry i occupies [i·taps, (i+1)·taps). */
    fir: Float32Array;
    /** FFT length the responses were sampled at. */
    fftSize: number;
    /** Highest modal order any bin needed. */
    maxOrder: number;
    /** Fraction of Nyquist above which the guard-band taper runs (see below). */
    taperFrom: number;
    /** Worst-case fraction of impulse-response energy left outside `taps`. */
    worstTruncatedEnergy: number;
}
export interface SphereFirOptions {
    /** Angle grid step in degrees (default 1). */
    stepDeg?: number;
    /** Modal-series tail tolerance (default 1e-10). */
    tol?: number;
    /**
     * Fraction of Nyquist where the guard-band taper starts (default 0.9).
     *
     * A real impulse response needs a real value at Nyquist, and `H` there is
     * emphatically not real (|H| ≈ 2 on the lit pole at 12 kHz). Forcing it
     * puts a step in the spectrum whose truncation ripple spreads across the
     * WHOLE band — measured on this table: 1.4 dB at 11.6 kHz and 2 % at DC
     * with the same 64 taps. Rolling |H| smoothly to zero over the top 10 %
     * of the band instead costs only that guard band and drops the error to
     * 0.06 dB / 0.0004 samples everywhere below it (see the tests).
     */
    taperFrom?: number;
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
export declare function buildSphereFirTable(radiusM: number, sampleRate: number, options?: SphereFirOptions): SphereFirTable;
/**
 * Cached `buildSphereFirTable`. The table depends only on radius, rate and
 * grid, so a whole corpus render builds it once (~10 ms) and every block of
 * every capsule reads it.
 */
export declare function sphereFirTable(radiusM: number, sampleRate: number, options?: SphereFirOptions): SphereFirTable;
/**
 * Write the FIR for an arbitrary angle into `out`, linearly interpolating
 * between the two grid entries either side. Over a 1° step the response's
 * group delay moves by under 0.06 samples, so tap-domain interpolation is
 * safe — there is no comb artefact to worry about at this grid.
 */
export declare function sphereFirAt(table: SphereFirTable, thetaDeg: number, out: Float32Array): void;
//# sourceMappingURL=RigidSphere.d.ts.map