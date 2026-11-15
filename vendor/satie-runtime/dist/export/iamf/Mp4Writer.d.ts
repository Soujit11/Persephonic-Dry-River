/**
 * Minimal ISO-BMFF writer for a single IAMF audio track — the shape YouTube
 * ingests as Eclipsa Audio (IAMF §6, "ISO-BMFF based IAMF Container").
 *
 * Deliberately narrow: one non-fragmented `moov`, one track, one sample
 * description, one chunk holding every sample. That is enough for an export
 * that is written all at once and read from a file, and it keeps the index
 * boxes down to a handful of entries.
 *
 * The IAMF-specific parts are the `iamf` sample entry carrying an `iacb`
 * configuration box with the descriptor OBUs, and the rule that one sample is
 * one Temporal Unit with no Temporal Delimiter OBU inside it (§6.2.5).
 */
import { type ByteArray } from './IamfObu.js';
export interface Mp4Track {
    /** Descriptor OBUs: sequence header, codec config, audio element, mix presentation. */
    configObus: ByteArray;
    /** One entry per Temporal Unit: the concatenated Audio Frame OBUs. */
    samples: readonly ByteArray[];
    /** Duration of each sample in audio samples; the last may be shorter. */
    sampleDurations: readonly number[];
    /** Media timescale — the audio sample rate. */
    sampleRate: number;
}
/**
 * Assemble the file. `mdat` is written before `moov` so the single chunk
 * offset is known without a second pass.
 */
export declare function writeIamfMp4(track: Mp4Track): Blob;
//# sourceMappingURL=Mp4Writer.d.ts.map