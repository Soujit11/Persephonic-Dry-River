/**
 * Elevation cues — what tells the ear how HIGH a thing is.
 *
 * Every direction Satie renders comes out of one generic HRTF (the browser's
 * PannerNode: one non-individualised head, 15° elevation steps, nothing below
 * -45°). Its azimuth cues are fine; its elevation cues are the weakest cue
 * class there is, because pinna spectra transfer badly between people. The
 * real world adds two things the panner cannot, and this module supplies both:
 *
 *   1. THE GROUND REFLECTION. A source over a floor reaches the ear twice:
 *      the direct path and the image path bounced off the plane. The path
 *      difference is a delay of a few milliseconds, and direct + delayed copy
 *      is a comb filter whose notch spacing depends on the heights of source
 *      and listener. This "ground effect" is the height cue that survives a
 *      generic HRTF — it is spectral shape the listener's OWN ears never had
 *      to learn. `groundReflection` computes the image-source delay and gain
 *      (Allen & Berkley image method, first order, one plane); the same math
 *      with the plane flipped gives an interior's CEILING reflection.
 *      The reflection is summed INTO THE SAME PANNER as the direct path, not
 *      into a second one: the comb is the cue, and at one panner per voice the
 *      cost is a delay, a lowpass and two gains. The direct leg is trimmed by
 *      1/(1+g) so the low-frequency sum (where the two paths are in phase)
 *      keeps the source's level — the notches cut relative to it, the way the
 *      ground effect is measured relative to free field.
 *
 *   2. A MONITORING ELEVATION GAIN. Generic-HRTF listeners under-read
 *      elevation; a source at +20° is heard as "a little brighter". Monitoring
 *      can exaggerate the rendered angle (`exaggerateElevation`) while the
 *      SCENE keeps its true positions — this is a headphone lens, applied at
 *      the panner write and nowhere else. Exports, annotations and the corpus
 *      never see it.
 *
 * Pure math plus one Web Audio node builder. No engine state, no React.
 */
import { PANNER_REF_M, PANNER_ROLLOFF, SPEED_OF_SOUND_MS, OCCLUSION_OPEN_HZ } from './WorldAcoustics.js';
import { lookupAbsorption } from './AbsorptionLookup.js';
/**
 * Ground whose material nobody stated: firm, mostly reflective, a mild
 * high-frequency loss. Not a claim about any particular ground — the value a
 * caller gets when the table has no answer (outdoor surfaces are largely
 * outside the absorption table's vocabulary by design; see AbsorptionLookup).
 */
// Soft ground (soil, grass, worn stone with people on it), not a mirror. The
// leg sums a delayed copy of the voice into the SAME panner, so its gain is
// the depth of a comb filter heard at the ear: 0.7 carved notches 12 dB deep
// that swept as the listener walked (a phaser on every voice); 0.35 keeps the
// ground cue at a third of that depth, below 3 kHz where a real ground
// reflection lives. A world's own materials still set their own surfaces.
export const DEFAULT_GROUND_SURFACE = { coefficient: 0.35, cutoffHz: 3000 };
/** Longest image-path delay the leg can carry (s): 0.25 s ≈ 86 m of path difference. */
export const REFLECTION_MAX_DELAY_S = 0.25;
/**
 * Below this height over the plane (either the source or the listener) the
 * image path coincides with the direct path: no delay, so no comb — only a
 * coherent level doubling, which the level model already accounts for in the
 * stated emission. The leg is silent there rather than a fixed +3 dB.
 */
export const REFLECTION_MIN_HEIGHT_M = 0.1;
/** Fully open lowpass for a surface with no measurable high-frequency loss. */
const SURFACE_OPEN_HZ = OCCLUSION_OPEN_HZ;
/**
 * Reflection character from octave-band absorption (125..4k, RoomAcoustics
 * order). Amplitude coefficient = sqrt(1 - alpha) at 500/1k (the bands the
 * comb's first notches live in); the high-frequency loss beyond that maps to
 * a lowpass corner — a first-order lowpass is what the leg has, and a
 * spectral tilt is what absorption rising with frequency produces.
 */
export function surfaceFromAbsorption(alpha) {
    const a = (i) => Math.min(1, Math.max(0, alpha[i] ?? alpha[alpha.length - 1] ?? 0));
    const mid = (a(2) + a(3)) / 2;
    const coefficient = Math.sqrt(1 - mid);
    // Extra absorption at 2k/4k over the mid bands: 0 → open, 1 → ~2 kHz corner.
    const hfLoss = Math.max(0, (a(4) + a(5)) / 2 - mid);
    const cutoffHz = hfLoss <= 0.02 ? SURFACE_OPEN_HZ : Math.max(2000, SURFACE_OPEN_HZ * Math.exp(-2.3 * hfLoss));
    return { coefficient, cutoffHz };
}
const _surfaceCache = new Map();
/**
 * The reflection character of a free-text surface label ("wet cobbles",
 * "carpet"), through the absorption table; `DEFAULT_GROUND_SURFACE` when the
 * table cannot say. Memoised per label — the spatial tick asks every voice
 * every tick.
 */
export function surfaceForLabel(label) {
    if (!label)
        return DEFAULT_GROUND_SURFACE;
    const hit = _surfaceCache.get(label);
    if (hit)
        return hit;
    const m = lookupAbsorption(label);
    const s = m ? surfaceFromAbsorption(m.absorption) : DEFAULT_GROUND_SURFACE;
    _surfaceCache.set(label, s);
    return s;
}
/** The panner's own inverse distance law, for a given rolloff. */
function inverseLaw(d, rolloff) {
    const dd = Math.max(d, PANNER_REF_M);
    return PANNER_REF_M / (PANNER_REF_M + rolloff * (dd - PANNER_REF_M));
}
/**
 * First-order image-source reflection off a horizontal plane at `planeY`.
 *
 * `above` false: the plane is a FLOOR (the image lies below it); true: a
 * CEILING (the image lies above). Silent when either the source or the
 * listener is within `REFLECTION_MIN_HEIGHT_M` of the plane, or on the far
 * side of it (no ground reflection from under the ground).
 *
 * The gain is relative to the DIRECT path as the same panner renders it: the
 * panner applies its inverse law at the direct distance, so the leg carries
 * the ratio law(image)/law(direct) times the surface's coefficient. `rolloff`
 * is the voice's own (2, or 1 for a `line` source).
 */
export function groundReflection(source, listener, planeY, surface, out, above = false, rolloff = PANNER_ROLLOFF, ownPanner = false) {
    const sign = above ? -1 : 1;
    const hs = (source.y - planeY) * sign;
    const hl = (listener.y - planeY) * sign;
    if (hs < REFLECTION_MIN_HEIGHT_M || hl < REFLECTION_MIN_HEIGHT_M || surface.coefficient <= 0) {
        out.delayS = 0;
        out.gain = 0;
        return out;
    }
    const dx = source.x - listener.x;
    const dz = source.z - listener.z;
    const horiz2 = dx * dx + dz * dz;
    const direct = Math.sqrt(horiz2 + (hs - hl) * (hs - hl));
    const image = Math.sqrt(horiz2 + (hs + hl) * (hs + hl));
    out.delayS = Math.min(REFLECTION_MAX_DELAY_S, (image - direct) / SPEED_OF_SOUND_MS);
    // A leg with its OWN panner at the image point gets the image distance's law
    // from that panner; a leg sharing the direct panner carries the ratio.
    out.gain = ownPanner
        ? surface.coefficient
        : surface.coefficient * inverseLaw(image, rolloff) / inverseLaw(direct, rolloff);
    return out;
}
/** The mirror image of `source` about a horizontal plane at `planeY`, written into `out`. */
export function imagePoint(source, planeY, out) {
    out.x = source.x;
    out.y = 2 * planeY - source.y;
    out.z = source.z;
    return out;
}
/**
 * The direct-leg trim that keeps the in-phase (low-frequency) sum of direct +
 * reflection at the source's own level: 1/(1+g).
 */
export function directTrimFor(reflectionGain) {
    return 1 / (1 + Math.max(0, reflectionGain));
}
export function createReflectionLeg(ctx, from, to, imagePanner = null) {
    const delay = ctx.createDelay(REFLECTION_MAX_DELAY_S);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = SURFACE_OPEN_HZ;
    filter.Q.value = 0.0001;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    from.connect(delay);
    delay.connect(filter);
    filter.connect(gain);
    if (imagePanner) {
        gain.connect(imagePanner);
        imagePanner.connect(to);
    }
    else
        gain.connect(to);
    return { delay, filter, gain, imagePanner, _lastDelayS: NaN, _lastGain: NaN, _lastCutoffHz: NaN };
}
/** A panner for a reflection's image point, configured like the voice's own. */
export function createImagePanner(ctx, like) {
    const p = ctx.createPanner();
    p.panningModel = like.panningModel;
    p.distanceModel = like.distanceModel;
    p.refDistance = like.refDistance;
    p.rolloffFactor = like.rolloffFactor;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    p.coneOuterGain = 0;
    return p;
}
/**
 * Drive a leg from freshly computed params. Smoothed writes (a moving source
 * sweeps the delay, which is the reflection's own Doppler); skipped when
 * nothing changed beyond hearing.
 */
export function applyReflectionLeg(leg, p, surface, ctxTime, smoothing = 0.02, immediate = false) {
    if (immediate) {
        leg._lastDelayS = p.delayS;
        leg._lastGain = p.gain;
        leg._lastCutoffHz = surface.cutoffHz;
        leg.delay.delayTime.setValueAtTime(p.delayS, ctxTime);
        leg.gain.gain.setValueAtTime(p.gain, ctxTime);
        leg.filter.frequency.setValueAtTime(surface.cutoffHz, ctxTime);
        return;
    }
    if (!(Math.abs(p.delayS - leg._lastDelayS) < 2e-5)) {
        leg._lastDelayS = p.delayS;
        leg.delay.delayTime.setTargetAtTime(p.delayS, ctxTime, smoothing);
    }
    if (!(Math.abs(p.gain - leg._lastGain) < 0.003)) {
        leg._lastGain = p.gain;
        leg.gain.gain.setTargetAtTime(p.gain, ctxTime, smoothing * 2);
    }
    if (!(Math.abs(surface.cutoffHz - leg._lastCutoffHz) < 1)) {
        leg._lastCutoffHz = surface.cutoffHz;
        leg.filter.frequency.setTargetAtTime(surface.cutoffHz, ctxTime, smoothing * 2);
    }
}
export function disposeReflectionLeg(leg) {
    try {
        leg.imagePanner?.disconnect();
    }
    catch { /* ok */ }
    try {
        leg.delay.disconnect();
    }
    catch { /* ok */ }
    try {
        leg.filter.disconnect();
    }
    catch { /* ok */ }
    try {
        leg.gain.disconnect();
    }
    catch { /* ok */ }
}
// ── Monitoring elevation gain ──────────────────────────────────────────
/** Elevation gain the monitor toggle applies (2× the angle, saturating at the poles). */
export const MONITOR_ELEVATION_GAIN = 2;
/**
 * Rotate `p` about the listener so its elevation angle is multiplied by
 * `gain`, keeping its distance and azimuth. Gain 1 copies; a point straight
 * over the head stays there. Writes into `out` (allocation-free) and returns
 * it. A point AT the listener is returned unchanged.
 */
export function exaggerateElevation(p, listener, gain, out) {
    const vx = p.x - listener.x, vy = p.y - listener.y, vz = p.z - listener.z;
    const horiz = Math.sqrt(vx * vx + vz * vz);
    const d = Math.sqrt(horiz * horiz + vy * vy);
    if (gain === 1 || d < 1e-6 || horiz < 1e-6) {
        out.x = p.x;
        out.y = p.y;
        out.z = p.z;
        return out;
    }
    const el = Math.atan2(vy, horiz);
    const el2 = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, el * gain));
    const h2 = d * Math.cos(el2);
    const k = h2 / horiz;
    out.x = listener.x + vx * k;
    out.y = listener.y + d * Math.sin(el2);
    out.z = listener.z + vz * k;
    return out;
}
//# sourceMappingURL=ElevationCues.js.map