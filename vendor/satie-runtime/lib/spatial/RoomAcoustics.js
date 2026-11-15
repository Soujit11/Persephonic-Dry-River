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
export const OCTAVE_BANDS_HZ = [125, 250, 500, 1000, 2000, 4000];
export const BAND_COUNT = OCTAVE_BANDS_HZ.length;
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
export const ABSORPTION_SD_R = [0.023, 0.040, 0.050, 0.062, 0.059, 0.070];
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
export const ISO3382_JND = {
    /** Relative — 5% of the reference value. */
    t30Relative: 0.05,
    t20Relative: 0.05,
    edtRelative: 0.05,
    /** Absolute, dB. */
    c50Db: 1,
    c80Db: 1,
    strengthDb: 1,
    /** Absolute, dimensionless ratio. */
    d50: 0.05,
    /** Absolute, milliseconds. */
    centreTimeMs: 10,
};
function assertBands(v, what) {
    if (v.length !== BAND_COUNT) {
        throw new Error(`${what} must have ${BAND_COUNT} bands, got ${v.length}`);
    }
}
/** Total bounding area, m². */
export function totalSurfaceArea(surfaces) {
    return surfaces.reduce((s, f) => s + f.areaM2, 0);
}
/**
 * Total absorption A = Σ Sᵢ·αᵢ, per band, in metric sabins (m²).
 */
export function totalAbsorption(surfaces) {
    const out = new Array(BAND_COUNT).fill(0);
    for (const s of surfaces) {
        assertBands(s.absorption, `surface "${s.label ?? '?'}" absorption`);
        for (let b = 0; b < BAND_COUNT; b++)
            out[b] += s.areaM2 * s.absorption[b];
    }
    return out;
}
/**
 * Area-weighted mean absorption ᾱ = A / S_total, per band.
 *
 * This is the quantity the Samosa pipeline computes from vision — segment the
 * visible surfaces, weight each class by its area and the segmenter's
 * confidence, look up its coefficients. Nothing downstream cares where ᾱ came
 * from, which is exactly why vision is good enough: it competes with a ±0.05
 * prior, not with truth.
 */
export function meanAbsorption(surfaces) {
    const total = totalSurfaceArea(surfaces);
    if (total <= 0)
        return new Array(BAND_COUNT).fill(0);
    const A = totalAbsorption(surfaces);
    return A.map((a) => a / total);
}
/** Metric Sabine constant, 0.161 s·m⁻¹ (24·ln10 / c at 20 °C). */
const SABINE_K = 0.161;
/**
 * Sabine RT60 per band: T = 0.161·V / A.
 *
 * Valid for live rooms (ᾱ ≲ 0.2). It has a known structural flaw — as ᾱ → 1 it
 * predicts a finite decay where an anechoic room should decay instantly — so
 * prefer `eyringRT60` for anything absorptive. Kept because it is the relation
 * the rest of the engine already reasons in, and because the literature quotes
 * it constantly.
 */
export function sabineRT60(geometry) {
    const A = totalAbsorption(geometry.surfaces);
    return A.map((a) => (a <= 0 ? Infinity : SABINE_K * geometry.volumeM3 / a));
}
/**
 * Eyring–Norris RT60 per band: T = 0.161·V / (−S·ln(1 − ᾱ)).
 *
 * The default. Unlike Sabine it goes to zero as ᾱ → 1, which matters because
 * generated worlds regularly produce very absorptive or barely-enclosed spaces
 * where Sabine would keep predicting a tail that should not exist. Resonance
 * Audio and the Samosa pipeline both use Eyring for the same reason.
 */
export function eyringRT60(geometry) {
    const S = totalSurfaceArea(geometry.surfaces);
    if (S <= 0)
        return new Array(BAND_COUNT).fill(Infinity);
    const alpha = meanAbsorption(geometry.surfaces);
    return alpha.map((a) => {
        if (a >= 1)
            return 0;
        if (a <= 0)
            return Infinity;
        const denom = -S * Math.log(1 - a);
        return SABINE_K * geometry.volumeM3 / denom;
    });
}
/**
 * Critical distance per band: d_c = 0.057·√(V / T60) — where direct and
 * reverberant energy cross over, and the dominant auditory distance cue.
 */
export function criticalDistanceFromRT60(volumeM3, rt60) {
    assertBands(rt60, 'rt60');
    return rt60.map((t) => (t <= 0 || !Number.isFinite(t) ? 0 : 0.057 * Math.sqrt(volumeM3 / t)));
}
/**
 * Mean of the 500 Hz and 1 kHz bands — the conventional single-number T30 that
 * ISO 3382 reporting and every published comparison use. Anything quoted as
 * "the reverb time" without a band is this.
 */
export function midFrequencyAverage(bands) {
    assertBands(bands, 'bands');
    const i500 = OCTAVE_BANDS_HZ.indexOf(500);
    const i1k = OCTAVE_BANDS_HZ.indexOf(1000);
    return (bands[i500] + bands[i1k]) / 2;
}
/** Is a predicted reverb time within one JND (5%) of the reference? */
export function withinRt60Jnd(predictedS, referenceS) {
    if (referenceS <= 0)
        return predictedS <= 0;
    return Math.abs(predictedS - referenceS) / referenceS <= ISO3382_JND.t30Relative;
}
/** How many JNDs apart two reverb times are — the harness's error unit. */
export function rt60JndError(predictedS, referenceS) {
    if (referenceS <= 0)
        return predictedS <= 0 ? 0 : Infinity;
    return Math.abs(predictedS - referenceS) / referenceS / ISO3382_JND.t30Relative;
}
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
export function perturbAbsorption(surfaces, k) {
    return surfaces.map((s) => {
        assertBands(s.absorption, `surface "${s.label ?? '?'}" absorption`);
        return {
            ...s,
            absorption: s.absorption.map((a, b) => Math.min(1, Math.max(0, a + k * ABSORPTION_SD_R[b]))),
        };
    });
}
/**
 * The uncertainty a prediction inherits from its materials alone, before any
 * solver error. Reported in JNDs so it is directly comparable to any accuracy
 * claim: a pipeline asserting sub-JND accuracy while this returns 6 JND is
 * asserting something its inputs cannot support.
 */
export function absorptionSensitivity(geometry, rt60 = eyringRT60) {
    const mid = (surfaces) => midFrequencyAverage(rt60({ ...geometry, surfaces }));
    const nominalS = mid(geometry.surfaces);
    // +SD_R is MORE absorption, hence a SHORTER decay: the labels are about the
    // resulting reverb time, not the coefficient.
    const lowS = mid(perturbAbsorption(geometry.surfaces, +1));
    const highS = mid(perturbAbsorption(geometry.surfaces, -1));
    const relativeSpread = nominalS > 0 && Number.isFinite(nominalS)
        ? (highS - lowS) / 2 / nominalS
        : Infinity;
    return {
        nominalS, highS, lowS,
        relativeSpread,
        jndSpread: relativeSpread / ISO3382_JND.t30Relative,
        unbounded: !Number.isFinite(highS),
    };
}
/**
 * Shoebox helper: six surfaces from dimensions, each with its own coefficients.
 * The common case for a room recovered by PolyLayout (a Manhattan polygon plus
 * floor and ceiling heights) and the shape every published validation set uses.
 */
export function shoebox(widthM, heightM, depthM, materials) {
    return {
        volumeM3: widthM * heightM * depthM,
        surfaces: [
            { areaM2: widthM * depthM, absorption: materials.floor, label: 'floor' },
            { areaM2: widthM * depthM, absorption: materials.ceiling, label: 'ceiling' },
            { areaM2: widthM * heightM * 2, absorption: materials.walls, label: 'walls-wd' },
            { areaM2: depthM * heightM * 2, absorption: materials.walls, label: 'walls-dh' },
        ],
    };
}
/** Convenience for tests and defaults: one coefficient across every band. */
export function flatBand(value) {
    return new Array(BAND_COUNT).fill(value);
}
/** Minimum grazing cosine — below this a single ray would claim absurd area. */
const MIN_COS_INCIDENCE = 0.15;
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
export function measureRoomFromRays(hits) {
    const empty = {
        volumeM3: 0, surfaceAreaM2: 0, apertureAreaM2: 0,
        openFraction: 1, meanFreePathM: 0,
    };
    const n = hits.length;
    if (n === 0)
        return empty;
    let sumR3 = 0;
    let sumArea = 0;
    let sumR = 0;
    let found = 0;
    for (const h of hits) {
        if (!h || !Number.isFinite(h.distanceM))
            continue;
        found++;
        const r = Math.max(h.distanceM, 0);
        sumR += r;
        sumR3 += r * r * r;
        sumArea += (r * r) / Math.max(Math.abs(h.cosIncidence), MIN_COS_INCIDENCE);
    }
    const openFraction = 1 - found / n;
    // Nothing was hit: there is no enclosure to describe. Not "a very large
    // room" — an unbounded direction has no boundary at any radius.
    if (found === 0)
        return empty;
    const solidAngleShare = (4 * Math.PI) / n;
    // Escaped directions are closed off at the MEAN HIT RADIUS rather than at the
    // probe's reach. The aperture belongs at the enclosure's own scale — a
    // doorway in a 4 m room is a 4 m-scale hole, not a 40 m one — and using the
    // probe limit would make every partially-open room read as enormous, with the
    // answer depending on how far the caller happened to cast.
    const meanR = sumR / found;
    const escaped = n - found;
    // Volume closes over the full sphere: solid directions at their own radius,
    // apertures at the mean. This is the volume of the equivalent CLOSED
    // enclosure, which is the quantity the energy balance needs.
    const volumeM3 = (solidAngleShare / 3) * (sumR3 + escaped * meanR ** 3);
    const surfaceAreaM2 = solidAngleShare * sumArea;
    // cos = 1: an aperture is a virtual surface square-on to the ray that left
    // through it, so there is no grazing correction to make.
    const apertureAreaM2 = solidAngleShare * escaped * meanR ** 2;
    const totalBoundary = surfaceAreaM2 + apertureAreaM2;
    return {
        volumeM3,
        surfaceAreaM2,
        apertureAreaM2,
        openFraction,
        meanFreePathM: totalBoundary > 0 ? 4 * volumeM3 / totalBoundary : 0,
    };
}
/**
 * Unit direction vectors spread near-uniformly over the sphere by the
 * golden-angle (Fibonacci) spiral. Deterministic, works for any N, and has no
 * clustering at the poles — which is exactly what the ring-and-azimuth fan
 * gets wrong.
 */
export function fibonacciSphere(count) {
    const out = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        // y from +1 to −1, sampled so equal steps carry equal solid angle.
        const y = count === 1 ? 0 : 1 - (2 * i) / (count - 1);
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        out.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
    }
    return out;
}
// ─── Barriers: transmission and diffraction ─────────────────────────────
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
export const TRANSMISSION_MAX_DB = 36;
export function transmissionGain(blocked01) {
    const b = Math.min(1, Math.max(0, blocked01));
    if (b <= 0)
        return 1;
    return Math.pow(10, (-TRANSMISSION_MAX_DB * b) / 20);
}
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
export const DIFFRACTION_BROADBAND_DB_AT_90 = 4;
export const DIFFRACTION_TILT_DB_AT_90 = 12;
export function diffractionLoss(bendRad) {
    const bend = Math.max(0, bendRad);
    // Saturating in the bend angle: the first few degrees around an edge cost
    // most of the loss, and past a right angle little more is available.
    const t = 1 - Math.exp(-bend / (Math.PI / 4));
    const tAt90 = 1 - Math.exp(-(Math.PI / 2) / (Math.PI / 4));
    const scale = t / tAt90;
    return {
        broadbandDb: DIFFRACTION_BROADBAND_DB_AT_90 * scale,
        highFrequencyTiltDb: DIFFRACTION_TILT_DB_AT_90 * scale,
    };
}
/**
 * The diffraction curve expressed the way the engine consumes it: a linear
 * gain plus a lowpass corner. The tilt becomes a cutoff because a first-order
 * lowpass is what the muffle chain already has, and a spectral tilt is what a
 * listener actually hears as "muffled by going around something".
 */
export function diffractionToFilter(bendRad, openCutoffHz) {
    const { broadbandDb, highFrequencyTiltDb } = diffractionLoss(bendRad);
    // Map tilt in dB to a corner frequency: 0 dB leaves the band open, and the
    // full 12 dB pulls it down to roughly telephone bandwidth.
    const tiltFraction = highFrequencyTiltDb / DIFFRACTION_TILT_DB_AT_90;
    const cutoffHz = openCutoffHz * Math.pow(2, -6 * Math.min(1, tiltFraction));
    return { gain: Math.pow(10, -broadbandDb / 20), cutoffHz };
}
/**
 * Eyring decay for a measured room and a mean absorption — the whole point of
 * the geometry work, in one call.
 *
 * Returns null when the space is too open to have a reverberant field. That is
 * a real answer: outdoors there is no room, and a number here would invent one.
 */
export function eyringFromMeasuredRoom(room, meanAlpha) {
    assertBands(meanAlpha, 'meanAlpha');
    if (room.volumeM3 <= 0)
        return null;
    const total = room.surfaceAreaM2 + room.apertureAreaM2;
    if (total <= 0)
        return null;
    return meanAlpha.map((a) => {
        const solidAlpha = Math.min(1, Math.max(0, a));
        // The whole point: apertures enter the absorption sum at α = 1 alongside
        // the real surfaces. Openness is no longer a special case with a cutoff —
        // it is just a very absorptive part of the boundary, which is what it is.
        const A = room.surfaceAreaM2 * solidAlpha + room.apertureAreaM2 * 1;
        const meanA = A / total;
        if (meanA >= 1)
            return 0; // fully open, or perfectly absorptive
        if (meanA <= 0)
            return Infinity; // sealed and perfectly reflective
        return SABINE_K * room.volumeM3 / (-total * Math.log(1 - meanA));
    });
}
//# sourceMappingURL=RoomAcoustics.js.map