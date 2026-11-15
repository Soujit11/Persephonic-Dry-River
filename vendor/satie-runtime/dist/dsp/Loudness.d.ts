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
/** Peaks are kept under this (linear) when normalizing — −1 dBFS. */
export declare const PEAK_CEILING: number;
/** The most a buffer is ever raised on arrival, dB: beyond this only the noise floor would come up. */
export declare const MAX_NORMALIZE_GAIN_DB = 24;
export interface LoudnessMeasure {
    /** Integrated loudness, LUFS; -Infinity for silence. */
    lufs: number;
    /** Absolute sample peak (linear). */
    peak: number;
}
/** Minimal buffer shape so the meter works on AudioBuffers and test stubs alike. */
export interface PcmLike {
    numberOfChannels: number;
    sampleRate: number;
    length: number;
    getChannelData(ch: number): Float32Array;
}
export interface LoudnessOptions {
    /**
     * Per-channel weight G_i from BS.1770-4 Table 3, one per channel. Defaults
     * to 1 for every channel, which is right for mono/stereo clips. Surround
     * channels take 1.41 and LFE takes 0; `export/iamf` passes those in when it
     * measures a 7.1.x bed for an IAMF Mix Presentation.
     */
    channelWeights?: readonly number[];
}
/** Integrated loudness per BS.1770-4. Channel weights default to 1. */
export declare function measureLoudness(buffer: PcmLike, options?: LoudnessOptions): LoudnessMeasure;
export interface NormalizeResult extends LoudnessMeasure {
    /** Gain applied, dB (0 when nothing was done). */
    gainDb: number;
    /** True when the peak ceiling held the gain short of the target. */
    peakLimited: boolean;
}
/**
 * Scale a buffer in place to `targetLufs` (default `CLIP_LUFS`), never
 * pushing its peak above `PEAK_CEILING`. Silence is left alone.
 */
export declare function normalizeBufferLoudness(buffer: PcmLike, targetLufs?: number): NormalizeResult;
/**
 * Inter-sample (true) peak by 4x oversampling, the rate BS.1770-4 Annex 2
 * specifies for content at 48 kHz. The interpolator is a Blackman-windowed
 * sinc rather than the Annex's exact FIR: the peak it reports lands within a
 * small fraction of a dB, which is all the consumers of it need.
 */
export declare function truePeak(samples: Float32Array): number;
//# sourceMappingURL=Loudness.d.ts.map