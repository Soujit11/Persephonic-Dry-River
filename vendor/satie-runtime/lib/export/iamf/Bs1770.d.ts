/**
 * The loudness an IAMF Mix Presentation has to carry (§3.7.4), expressed in
 * terms of the engine's existing BS.1770-4 meter.
 *
 * `dsp/Loudness.ts` already owns the measurement — K-weighting designed for
 * the sample rate, 400 ms blocks at 75% overlap, the absolute then relative
 * gate — and it is the same meter that normalizes every clip on arrival. This
 * module adds only what IAMF needs on top: the per-channel weights a
 * loudspeaker layout implies, and the dBFS framing the LoudnessInfo fields
 * use. There is no second BS.1770 here on purpose; two of them would drift.
 */
/** IAMF export is fixed at 48 kHz (what YouTube asks for). */
export declare const IAMF_LOUDNESS_RATE = 48000;
/**
 * A channel's weighting class in BS.1770-4 Table 3: the front channels count
 * once, the surround channels are lifted, and LFE is excluded. BS.1770-4 does
 * not tabulate height channels; they are weighted 1, which is what the
 * BS.2051 layouts in common use assume.
 */
export type ChannelRole = 'front' | 'surround' | 'height' | 'lfe';
export declare function channelWeight(role: ChannelRole): number;
export interface LoudnessResult {
    /** Gated program loudness, LKFS. -Infinity for silence. */
    integratedLkfs: number;
    /** Largest absolute sample across the measured channels, dBFS. */
    digitalPeakDbfs: number;
    /** Inter-sample peak, dBFS. */
    truePeakDbfs: number;
}
/**
 * Measure a rendered layout. `roles` gives each channel's weighting class and
 * must be the same length as `channels`; LFE is excluded from the loudness but
 * still counted for the peaks, which is what a peak meter reports.
 */
export declare function measureLayoutLoudness(channels: readonly Float32Array[], roles: readonly ChannelRole[], sampleRate: number): LoudnessResult;
//# sourceMappingURL=Bs1770.d.ts.map