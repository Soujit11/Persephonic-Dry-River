/**
 * Octave-band room acoustics from real geometry and real surfaces.
 *
 * `WorldAcoustics` derives reverb from a single `size01` proxy — a heuristic
 * curve over how far probe rays travel. This module is the replacement: volume
 * and surface area in, per-band decay out, via the same statistical acoustics
 * the whole field uses. It is deliberately NOT a wave solver, and the reason is
 * measured rather than pragmatic — see ABSORPTION_SD_R below.
 *
 * Everything here is pure and unit-testable; nothing touches Web Audio.
 */
/**
 * ISO octave-band centres used throughout. Six bands, 125 Hz–4 kHz: the range
 * where absorption data is actually reproducible and where room decay carries
 * perceptual weight. 8 kHz is omitted — air absorption dominates there and the
 * published coefficients scatter worst.
 */
export declare const OCTAVE_BANDS_HZ: readonly [125, 250, 500, 1000, 2000, 4000];
export declare const BAND_COUNT: 6;
/** Per-band values, index-aligned to OCTAVE_BANDS_HZ. */
export type BandValues = number[];
/**
 * Reproducibility standard deviation of absorption coefficients BETWEEN
 * accredited laboratories, pooled over seven rounds (2012–2024) of the AQUS
 * interlaboratory scheme, 13–17 ISO/IEC 17025 labs per round.
 *
 * Rosario & Martínez (2025), Forum Acusticum, DOI 10.61782/fa.2025.0027.
 *
 * This is the single most important number in the acoustics work, because it
 * bounds how good ANY prediction can be:
 *
 *   - Deviations are systematic per-lab bias, not per-sample noise (Prislan &
 *     Puljizević 2024, DOI 10.3397/in_2024_3817), so more measurements do not
 *     average them away.
 *   - Propagated through Sabine, a furnished room at ᾱ ≈ 0.15 with SD_R = 0.05
 *     lands near 33% T30 error — about 6.7 JND.
 *   - Therefore a wave solver cannot rescue a materials problem. Uncalibrated,
 *     every solver class sits at 5–7 JND; calibrated to a measured T30, the
 *     same solver reaches ~0.5 JND. Calibration is worth an order of magnitude
 *     and solver fidelity is not.
 *
 * It cuts the other way for training data: a model fitted to one precise
 * coefficient overfits it. Sampling within this band IS domain randomization,
 * with an empirically grounded spread rather than an invented one.
 *
 * The 125 Hz entry is the round robin's 100 Hz figure — the nearest published
 * band. Flagged rather than silently reindexed.
 */
export declare const ABSORPTION_SD_R: BandValues;
/**
 * Just-noticeable differences from ISO 3382-1, as reproduced in ODEON's ISRA
 * 2013 paper (Table 1). A metric without a perceptual threshold cannot decide
 * whether an approximation is good enough, which is what makes these the pass
 * criteria for the evaluation harness rather than decoration.
 *
 * `t30`/`t20`/`edt` are RELATIVE (5% of the value); the rest are absolute.
 *
 * Caveat worth keeping: Martellotta (2010) found JND(Ts) varies with T while
 * JND(C80) does not, so treat `centreTimeMs` more loosely than the others.
 */
export declare const ISO3382_JND: {
    /** Relative — 5% of the reference value. */
    readonly t30Relative: 0.05;
    readonly t20Relative: 0.05;
    readonly edtRelative: 0.05;
    /** Absolute, dB. */
    readonly c50Db: 1;
    readonly c80Db: 1;
    readonly strengthDb: 1;
    /** Absolute, dimensionless ratio. */
    readonly d50: 0.05;
    /** Absolute, milliseconds. */
    readonly centreTimeMs: 10;
};
/** One bounding surface of a room. */
export interface RoomSurface {
    /** Area in square metres. */
    areaM2: number;
    /** Per-band absorption coefficient, 0–1, index-aligned to OCTAVE_BANDS_HZ. */
    absorption: BandValues;
    /** Optional label — provenance for debugging, never used in the maths. */
    label?: string;
}
export interface RoomGeometry {
    volumeM3: number;
    surfaces: RoomSurface[];
}
/** Total bounding area, m². */
export declare function totalSurfaceArea(surfaces: RoomSurface[]): number;
/**
 * Total absorption A = Σ Sᵢ·αᵢ, per band, in metric sabins (m²).
 */
export declare function totalAbsorption(surfaces: RoomSurface[]): BandValues;
/**
 * Area-weighted mean absorption ᾱ = A / S_total, per band.
 *
 * This is the quantity the Samosa pipeline computes from vision — segment the
 * visible surfaces, weight each class by its area and the segmenter's
 * confidence, look up its coefficients. Nothing downstream cares where ᾱ came
 * from, which is exactly why vision is good enough: it competes with a ±0.05
 * prior, not with truth.
 */
export declare function meanAbsorption(surfaces: RoomSurface[]): BandValues;
/**
 * Sabine RT60 per band: T = 0.161·V / A.
 *
 * Valid for live rooms (ᾱ ≲ 0.2). It has a known structural flaw — as ᾱ → 1 it
 * predicts a finite decay where an anechoic room should decay instantly — so
 * prefer `eyringRT60` for anything absorptive. Kept because it is the relation
 * the rest of the engine already reasons in, and because the literature quotes
 * it constantly.
 */
export declare function sabineRT60(geometry: RoomGeometry): BandValues;
/**
 * Eyring–Norris RT60 per band: T = 0.161·V / (−S·ln(1 − ᾱ)).
 *
 * The default. Unlike Sabine it goes to zero as ᾱ → 1, which matters because
 * generated worlds regularly produce very absorptive or barely-enclosed spaces
 * where Sabine would keep predicting a tail that should not exist. Resonance
 * Audio and the Samosa pipeline both use Eyring for the same reason.
 */
export declare function eyringRT60(geometry: RoomGeometry): BandValues;
/**
 * Critical distance per band: d_c = 0.057·√(V / T60) — where direct and
 * reverberant energy cross over, and the dominant auditory distance cue.
 */
export declare function criticalDistanceFromRT60(volumeM3: number, rt60: BandValues): BandValues;
/**
 * Mean of the 500 Hz and 1 kHz bands — the conventional single-number T30 that
 * ISO 3382 reporting and every published comparison use. Anything quoted as
 * "the reverb time" without a band is this.
 */
export declare function midFrequencyAverage(bands: BandValues): number;
/** Is a predicted reverb time within one JND (5%) of the reference? */
export declare function withinRt60Jnd(predictedS: number, referenceS: number): boolean;
/** How many JNDs apart two reverb times are — the harness's error unit. */
export declare function rt60JndError(predictedS: number, referenceS: number): number;
/**
 * Perturb every surface's absorption by ±k·SD_R, clamped to a physical 0–1.
 *
 * Two uses, one mechanism:
 *
 *   - **The sensitivity gate.** Sweep `k` over ±1 and check the resulting T30
 *     spread BRACKETS the golden value. A predictor whose spread is TIGHTER
 *     than its own input uncertainty is overconfident — it is fitting noise,
 *     and the harness should fail it.
 *   - **Domain randomization.** Sampling `k` per render gives a training corpus
 *     that covers the plausible range instead of overfitting one coefficient,
 *     with a spread taken from the interlaboratory data rather than invented.
 *
 * `k` is in units of SD_R, so k = 1 is one between-lab standard deviation.
 * Because the real deviation is systematic per-lab bias, a single `k` is
 * applied coherently across all surfaces rather than drawn per surface.
 */
export declare function perturbAbsorption(surfaces: RoomSurface[], k: number): RoomSurface[];
export interface SensitivitySpread {
    /** Prediction with the published coefficients. */
    nominalS: number;
    /** Prediction at −1 SD_R (less absorptive → longer decay). */
    highS: number;
    /** Prediction at +1 SD_R (more absorptive → shorter decay). */
    lowS: number;
    /** Half-width of the spread as a fraction of nominal. */
    relativeSpread: number;
    /** The same, in JND units — how uncertain the answer is, perceptually. */
    jndSpread: number;
    /**
     * True when the between-lab spread is wider than the absorption itself, so
     * α could plausibly be zero and the decay is unbounded above.
     *
     * Not an error and not a numerical artefact: below roughly α = 0.06 the
     * 1 kHz SD_R (0.062) exceeds the nominal value, which means the reverb time
     * of a very reflective room simply cannot be predicted from published
     * coefficients at all. Reporting a finite spread there would be a lie.
     */
    unbounded: boolean;
}
/**
 * The uncertainty a prediction inherits from its materials alone, before any
 * solver error. Reported in JNDs so it is directly comparable to any accuracy
 * claim: a pipeline asserting sub-JND accuracy while this returns 6 JND is
 * asserting something its inputs cannot support.
 */
export declare function absorptionSensitivity(geometry: RoomGeometry, rt60?: typeof eyringRT60): SensitivitySpread;
/**
 * Shoebox helper: six surfaces from dimensions, each with its own coefficients.
 * The common case for a room recovered by PolyLayout (a Manhattan polygon plus
 * floor and ceiling heights) and the shape every published validation set uses.
 */
export declare function shoebox(widthM: number, heightM: number, depthM: number, materials: {
    floor: BandValues;
    ceiling: BandValues;
    walls: BandValues;
}): RoomGeometry;
/** Convenience for tests and defaults: one coefficient across every band. */
export declare function flatBand(value: number): BandValues;
/**
 * One probe ray that found a surface.
 *
 * `cosIncidence` is |n̂·r̂| at the hit — how obliquely the ray struck. It is
 * what turns a set of distances into an AREA: a ray hitting a wall head-on
 * represents a small patch, the same ray grazing it represents a large one.
 * Without it, surface area has to be guessed from volume, and an
 * equivalent-sphere guess underestimates a 10×3×8 m room's area by ~30% —
 * which is a ~6 JND error in RT60, as large as the entire material floor.
 */
export interface ProbeHit {
    distanceM: number;
    cosIncidence: number;
}
export interface MeasuredRoom {
    volumeM3: number;
    /** Solid bounding surface — the part made of actual material. */
    surfaceAreaM2: number;
    /**
     * Aperture area: the part of the boundary that is a hole.
     *
     * **An aperture is a surface with α = 1**, and that is exact rather than a
     * convenience. Energy that leaves through an opening does not come back, so
     * from inside the room a doorway, a window or a missing wall is a perfect
     * absorber. Treating openness this way turns it into an ordinary term in the
     * energy balance instead of a tuned curve with a cutoff — which is what it
     * physically is, and why the old `openFraction > 0.6 → no reverb` threshold
     * could be deleted rather than re-tuned.
     */
    apertureAreaM2: number;
    /** Share of probe rays that escaped — 0 sealed, 1 open sky. */
    openFraction: number;
    /** Mean free path 4V/S over the TOTAL boundary (solid + aperture), m. */
    meanFreePathM: number;
}
/**
 * Volume and surface area of the space around a point, from rays cast in
 * UNIFORMLY DISTRIBUTED directions.
 *
 * For a star-shaped region seen from an interior point, both are exact
 * integrals over the sphere, and uniform sampling turns each into a plain
 * mean over N rays:
 *
 *   V = (1/3)∮ r³ dΩ  ≈  (4π/3)·mean(r³)
 *   S = ∮ r²/|n̂·r̂| dΩ ≈  (4π)·mean(r²/|n̂·r̂|)
 *
 * **Uniformity is a precondition, not a detail.** Satie's legacy enclosure fan
 * (three elevation rings from −5.7° to +40°, plus zenith) never samples the
 * floor or the lower hemisphere at all; feeding it here would produce a
 * confident wrong number. Use a Fibonacci-sphere probe.
 *
 * Escaped rays carry no distance and are excluded from both integrals — an
 * unbounded direction has infinite volume, and averaging it in would swamp
 * everything. They are reported as `openFraction` instead, and a mostly-open
 * space should be treated as having no room rather than a very large one.
 */
export declare function measureRoomFromRays(hits: (ProbeHit | null)[]): MeasuredRoom;
/**
 * Unit direction vectors spread near-uniformly over the sphere by the
 * golden-angle (Fibonacci) spiral. Deterministic, works for any N, and has no
 * clustering at the poles — which is exactly what the ring-and-azimuth fan
 * gets wrong.
 */
export declare function fibonacciSphere(count: number): {
    x: number;
    y: number;
    z: number;
}[];
/**
 * Loss through a barrier, as a linear gain.
 *
 * The distinction this exists to serve is Wwise's, and Satie previously only
 * had half of it:
 *
 *   - **Obstruction** — something blocks the direct path but the source still
 *     pours energy into the listener's room (a pillar, a parked car). Attenuate
 *     the DRY path only; the reverberant field is untouched.
 *   - **Occlusion / transmission** — the source is in a different enclosure and
 *     its sound has to pass through a wall. Attenuate dry AND wet, because the
 *     energy never reaches this room at all.
 *
 * The engine's ray-driven muffle is obstruction and is correct as it stands
 * (the reverb send is deliberately tapped pre-occlusion). This is the missing
 * half, and it is driven by ROOM SEPARATION rather than by ray hits — which is
 * exactly what the room/portal graph now provides.
 *
 * `blocked01` is 0 for "same space" and 1 for "sealed behind a wall".
 * TRANSMISSION_MAX_DB is the loss at full separation.
 */
export declare const TRANSMISSION_MAX_DB = 36;
export declare function transmissionGain(blocked01: number): number;
/**
 * Attenuation for sound bending around an edge — what makes a doorway sound
 * like a doorway rather than a volume fade.
 *
 * **This is a calibrated approximation, not a port.** Steam Audio implements
 * genuine UTD (Tsingos, SIGGRAPH 2001) and is the reference; Wwise's
 * "diffraction" by contrast accumulates geometric angles and hands off to
 * designer-authored curves, with no analytic kernel anywhere in its SDK. The
 * curve here is fitted to two published characteristics of the UTD result —
 * roughly 4 dB of broadband loss and roughly 12 dB of additional high-frequency
 * tilt at 90° of bend — and is monotone, zero at zero bend, and saturating
 * beyond a right angle.
 *
 * Swapping in the real kernel is a drop-in: same signature, same two outputs.
 * Until then this must not be described as UTD.
 *
 * `bendRad` is the angle by which the path must turn at the edge, 0 = straight
 * through (in line of sight), π/2 = around a right-angled corner.
 */
export declare const DIFFRACTION_BROADBAND_DB_AT_90 = 4;
export declare const DIFFRACTION_TILT_DB_AT_90 = 12;
export declare function diffractionLoss(bendRad: number): {
    broadbandDb: number;
    highFrequencyTiltDb: number;
};
/**
 * The diffraction curve expressed the way the engine consumes it: a linear
 * gain plus a lowpass corner. The tilt becomes a cutoff because a first-order
 * lowpass is what the muffle chain already has, and a spectral tilt is what a
 * listener actually hears as "muffled by going around something".
 */
export declare function diffractionToFilter(bendRad: number, openCutoffHz: number): {
    gain: number;
    cutoffHz: number;
};
/**
 * Eyring decay for a measured room and a mean absorption — the whole point of
 * the geometry work, in one call.
 *
 * Returns null when the space is too open to have a reverberant field. That is
 * a real answer: outdoors there is no room, and a number here would invent one.
 */
export declare function eyringFromMeasuredRoom(room: MeasuredRoom, meanAlpha: BandValues): BandValues | null;
//# sourceMappingURL=RoomAcoustics.d.ts.map