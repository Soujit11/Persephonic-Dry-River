/**
 * The one place an export says where it came from.
 *
 * "Made with Satie" was DOM chrome only: the embed watermark and the public
 * sketch view. Every file that actually leaves the app carried nothing (WAV,
 * the captured video, the render manifest) or its own hand-written string
 * (ADM's programme name, IAMF's handler name, USDZ's `doc`, the Unity README).
 * A rendered scene that reaches someone else is the export that matters most,
 * and it was the one with no trace of the tool.
 *
 * Formats differ in what they will hold, so this module offers the same fact
 * at three lengths rather than pretending one string fits all:
 *
 *   `SATIE_SOFTWARE`    a RIFF `ISFT` / a file's "written by" field
 *   `SATIE_ATTRIBUTION` the human sentence, for a comment or a README line
 *   `SATIE_URL`         where to go
 *
 * These are attribution, not a licence and not a claim of authorship: the
 * scene belongs to whoever wrote it. Nothing here asserts rights over the
 * audio, and none of it is a watermark — it is plain metadata a user can
 * strip with any tagger.
 */
import { RUNTIME_VERSION } from '../integration/contracts.js';
/** Where Satie lives. */
export const SATIE_URL = 'https://www.satie.world';
/** Producing software, the RIFF `ISFT` convention: name plus version. */
export const SATIE_SOFTWARE = `Satie ${RUNTIME_VERSION}`;
/** The human sentence, for a comment field or a README line. */
export const SATIE_ATTRIBUTION = `Made with Satie (${SATIE_URL})`;
/**
 * The shortest form, for burning into a video frame. Matches the DOM watermark
 * on the embed and the public sketch view word for word, so a shared recording
 * and a shared link say the same thing.
 */
export const SATIE_WATERMARK = 'Made with Satie';
export const DEFAULT_ATTRIBUTION = {
    software: SATIE_SOFTWARE,
    attribution: SATIE_ATTRIBUTION,
    url: SATIE_URL,
};
//# sourceMappingURL=Attribution.js.map