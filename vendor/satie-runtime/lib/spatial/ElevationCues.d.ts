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
import type { BandValues } from './RoomAcoustics';
import type { Vec3 } from '../core/Statement';
/** A reflecting plane's acoustic character, as the reflection leg needs it. */
export interface ReflectionSurface {
    /** Pressure reflection coefficient at mid frequencies (0..1, amplitude). */
    coefficient: number;
    /** Lowpass corner standing in for the surface's high-frequency absorption (Hz). */
    cutoffHz: number;
}
/**
 * Ground whose material nobody stated: firm, mostly reflective, a mild
 * high-frequency loss. Not a claim about any particular ground — the value a
 * caller gets when the table has no answer (outdoor surfaces are largely
 * outside the absorption table's vocabulary by design; see AbsorptionLookup).
 */
export declare const DEFAULT_GROUND_SURFACE: ReflectionSurface;
/** Longest image-path delay the leg can carry (s): 0.25 s ≈ 86 m of path difference. */
export declare const REFLECTION_MAX_DELAY_S = 0.25;
/**
 * Below this height over the plane (either the source or the listener) the
 * image path coincides with the direct path: no delay, so no comb — only a
 * coherent level doubling, which the level model already accounts for in the
 * stated emission. The leg is silent there rather than a fixed +3 dB.
 */
export declare const REFLECTION_MIN_HEIGHT_M = 0.1;
/**
 * Reflection character from octave-band absorption (125..4k, RoomAcoustics
 * order). Amplitude coefficient = sqrt(1 - alpha) at 500/1k (the bands the
 * comb's first notches live in); the high-frequency loss beyond that maps to
 * a lowpass corner — a first-order lowpass is what the leg has, and a
 * spectral tilt is what absorption rising with frequency produces.
 */
export declare function surfaceFromAbsorption(alpha: BandValues): ReflectionSurface;
/**
 * The reflection character of a free-text surface label ("wet cobbles",
 * "carpet"), through the absorption table; `DEFAULT_GROUND_SURFACE` when the
 * table cannot say. Memoised per label — the spatial tick asks every voice
 * every tick.
 */
export declare function surfaceForLabel(label: string | null | undefined): ReflectionSurface;
export interface ReflectionParams {
    /** Image-path delay beyond the direct path (s). 0 when the leg is silent. */
    delayS: number;
    /** Image-path amplitude relative to the direct path (0 = silent). */
    gain: number;
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
export declare function groundReflection(source: Vec3, listener: Vec3, planeY: number, surface: ReflectionSurface, out: ReflectionParams, above?: boolean, rolloff?: number, ownPanner?: boolean): ReflectionParams;
/** The mirror image of `source` about a horizontal plane at `planeY`, written into `out`. */
export declare function imagePoint(source: Vec3, planeY: number, out: {
    x: number;
    y: number;
    z: number;
}): {
    x: number;
    y: number;
    z: number;
};
/**
 * The direct-leg trim that keeps the in-phase (low-frequency) sum of direct +
 * reflection at the source's own level: 1/(1+g).
 */
export declare function directTrimFor(reflectionGain: number): number;
/**
 * One reflection path: `from` → delay → lowpass → gain → `to`. Built beside
 * the direct connection `from` → `to`; the caller owns `from`'s trim.
 */
export interface ReflectionLeg {
    readonly delay: DelayNode;
    readonly filter: BiquadFilterNode;
    readonly gain: GainNode;
    /**
     * The leg's own HRTF panner at the IMAGE point (below the floor, above the
     * ceiling), when the caller gave it one. One delayed copy summed into the
     * direct panner is a comb filter the ear hears as a phaser on any broadband
     * source (water, rain); from its own direction the head decorrelates it and
     * the reflection reads as height, which is what the leg is for.
     */
    readonly imagePanner: PannerNode | null;
    /** Last written values — write-skip caches for the spatial tick. */
    _lastDelayS: number;
    _lastGain: number;
    _lastCutoffHz: number;
}
export declare function createReflectionLeg(ctx: AudioContext, from: AudioNode, to: AudioNode, imagePanner?: PannerNode | null): ReflectionLeg;
/** A panner for a reflection's image point, configured like the voice's own. */
export declare function createImagePanner(ctx: AudioContext, like: PannerNode): PannerNode;
/**
 * Drive a leg from freshly computed params. Smoothed writes (a moving source
 * sweeps the delay, which is the reflection's own Doppler); skipped when
 * nothing changed beyond hearing.
 */
export declare function applyReflectionLeg(leg: ReflectionLeg, p: ReflectionParams, surface: ReflectionSurface, ctxTime: number, smoothing?: number, immediate?: boolean): void;
export declare function disposeReflectionLeg(leg: ReflectionLeg): void;
/** Elevation gain the monitor toggle applies (2× the angle, saturating at the poles). */
export declare const MONITOR_ELEVATION_GAIN = 2;
/**
 * Rotate `p` about the listener so its elevation angle is multiplied by
 * `gain`, keeping its distance and azimuth. Gain 1 copies; a point straight
 * over the head stays there. Writes into `out` (allocation-free) and returns
 * it. A point AT the listener is returned unchanged.
 */
export declare function exaggerateElevation(p: Vec3, listener: Vec3, gain: number, out: Vec3): Vec3;
//# sourceMappingURL=ElevationCues.d.ts.map