/**
 * Conservative PCM onset estimate for interactive events. This measures energy,
 * not semantic contact identity: a noisy or multi-impact take still needs review.
 * Never mutate the supplied recording or alter its provenance hash.
 */
import type { PcmLike } from './Loudness.js';
export interface TriggerOnsetMeasure {
    /** First 5 ms RMS window above -40 dB relative to the loudest window. */
    onsetSeconds: number;
    /** Safe playback offset, retaining 2 ms before that detected window. */
    offsetSeconds: number;
    analysis: 'rms-relative-40db';
    windowSeconds: 0.005;
    prerollSeconds: 0.002;
    /** False for silence, invalid PCM or a placeholder buffer. */
    detected: boolean;
}
/** Cached per immutable decoded buffer; call at admission, not repeatedly on contact. */
export declare function measureTriggerOnset(buffer: PcmLike): TriggerOnsetMeasure;
//# sourceMappingURL=TriggerOnset.d.ts.map