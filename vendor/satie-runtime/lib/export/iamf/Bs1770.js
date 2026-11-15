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
import { measureLoudness, truePeak } from '../../dsp/Loudness.js';
/** IAMF export is fixed at 48 kHz (what YouTube asks for). */
export const IAMF_LOUDNESS_RATE = 48000;
export function channelWeight(role) {
    switch (role) {
        case 'surround': return 1.41;
        case 'lfe': return 0;
        default: return 1;
    }
}
/** Bare Float32Arrays as the shape the meter reads. */
function asPcm(channels, sampleRate) {
    return {
        numberOfChannels: channels.length,
        sampleRate,
        length: channels[0]?.length ?? 0,
        getChannelData: (ch) => channels[ch],
    };
}
/**
 * Measure a rendered layout. `roles` gives each channel's weighting class and
 * must be the same length as `channels`; LFE is excluded from the loudness but
 * still counted for the peaks, which is what a peak meter reports.
 */
export function measureLayoutLoudness(channels, roles, sampleRate) {
    if (channels.length !== roles.length) {
        throw new Error(`measureLayoutLoudness: ${channels.length} channels but ${roles.length} roles`);
    }
    if (sampleRate !== IAMF_LOUDNESS_RATE) {
        throw new Error(`IAMF loudness is measured at 48 kHz only, got ${sampleRate}`);
    }
    if (channels.length === 0) {
        return { integratedLkfs: -Infinity, digitalPeakDbfs: -Infinity, truePeakDbfs: -Infinity };
    }
    const { lufs, peak } = measureLoudness(asPcm(channels, sampleRate), {
        channelWeights: roles.map(channelWeight),
    });
    const interSample = channels.reduce((p, ch) => Math.max(p, truePeak(ch)), 0);
    return {
        integratedLkfs: lufs,
        digitalPeakDbfs: toDbfs(peak),
        truePeakDbfs: toDbfs(interSample),
    };
}
function toDbfs(amplitude) {
    return amplitude <= 0 ? -Infinity : 20 * Math.log10(amplitude);
}
//# sourceMappingURL=Bs1770.js.map