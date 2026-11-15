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
export declare const BARK_EDGES: number[];
export declare const BANDS: number;
export declare const BAND_CENTRES: number[];
/** Threshold in quiet, dB SPL (Terhardt 1979). */
export declare function thresholdInQuietDb(hz: number): number;
/** A noise masker's threshold sits this far under its spread excitation (Johnston 1988). */
export declare const NOISE_MASKING_OFFSET_DB = 5.5;
export interface MonoSource {
    sampleRate: number;
    length: number;
    numberOfChannels: number;
    getChannelData(c: number): Float32Array;
}
/**
 * The share of a take's energy in each band (sums to 1; all-silent takes are flat).
 * Averaged over up to 16 Hann-windowed frames spread across the take; cached per buffer.
 */
export declare function bandSpectrum(buffer: MonoSource): Float32Array;
export interface HeardSource {
    id: number;
    /** Broadband level at the ear, dB SPL (the level model's receivedDb). */
    receivedDb: number;
    /** bandSpectrum of the take it plays. */
    spectrum: Float32Array;
    /** A low-pass the path applies (air absorption, occlusion), when there is one; 12 dB per octave. */
    cutoffHz?: number | null;
}
export interface Audibility {
    /** How far over its masked threshold the source is in its best band, dB; under 0 it is covered. */
    marginDb: number;
    /** Partial loudness in sones: what it adds to the mix, summed over bands. */
    sones: number;
    /** The source that contributes most masking in the band where this one comes closest to coming through. */
    maskerId: number | null;
}
/** Each source's audibility against everything else heard at the same place. */
export declare function audibility(sources: readonly HeardSource[]): Map<number, Audibility>;
//# sourceMappingURL=Audibility.d.ts.map