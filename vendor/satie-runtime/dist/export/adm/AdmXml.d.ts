/**
 * BS.2076-1 ADM XML builder (objects-only programme), conforming to the
 * Dolby Atmos Master ADM Profile v1.0 — the subset Pro Tools' ADM import
 * actually accepts (arbitrary valid BS.2076 files fail silently there).
 *
 * Emits the full reference chain — audioProgramme → audioContent →
 * audioObject → audioPackFormat → audioChannelFormat (+ audioBlockFormat
 * position blocks) and audioStreamFormat/audioTrackFormat/audioTrackUID.
 * Common Definitions are not referenced: they cover channel beds, and this
 * export is objects-only.
 *
 * Dolby-profile conformance points (the ones that are easy to violate):
 * - Every audioObject has start="00:00:00.00000" and duration equal to the
 *   full programme length — voices that begin mid-programme are represented
 *   by their full-length stems, not by object timing.
 * - audioObjectID for Objects type lives in [0x100b, 0x1080].
 * - Every audioBlockFormat carries <jumpPosition interpolationLength=...>1
 *   (0 samples for the first block, 250 samples for the rest): blocks are
 *   discrete sampled position events, NOT block-length interpolation ramps.
 *   Importers draw straight lines only between events < 30 ms apart, so the
 *   exporter feeds this builder a dense (10 ms) event grid during motion.
 *
 * Timing: event times arrive on a 10 ms grid (integer centiseconds), which
 * renders exactly in 5-fractional-digit timecodes — consecutive blocks tile
 * the programme with zero string-rounding drift.
 *
 * String templating on purpose: no DOM dependency, runs under Node in tests.
 */
import type { AdmPosition } from './AdmCoordinates';
export interface AdmBlock {
    /** Seconds relative to the object (= programme) start. */
    rtime: number;
    /** Seconds until the next event (blocks tile the programme). */
    duration: number;
    position: AdmPosition;
}
export interface AdmObjectSpec {
    /** Human-readable name, e.g. "s02_c00_r00_rain". */
    name: string;
    /** Position events; programme-absolute, tiling [0, programme duration]. */
    blocks: AdmBlock[];
}
export interface AdmXmlOptions {
    programmeName?: string;
    /** Full programme length in seconds. */
    durationSeconds: number;
    sampleRate: number;
    bitDepth: number;
}
export interface AdmTrackRefs {
    uid: string;
    trackRef: string;
    packRef: string;
}
/**
 * IDs for object k (0-based). Format IDs use the 0x1001+k convention;
 * audioObjectIDs start at 0x100b — the Dolby profile reserves the Objects
 * range [0x100b, 0x1080] (0x1001–0x100a belong to DirectSpeakers beds).
 */
export declare function admIdsFor(k: number): AdmTrackRefs & {
    objectId: string;
    packId: string;
    channelId: string;
    streamId: string;
    trackId: string;
};
/** Format seconds as an ADM timecode: hh:mm:ss.zzzzz (5 fractional digits). */
export declare function admTimecode(seconds: number): string;
/** Build the complete `axml` payload for an objects-only ADM programme. */
export declare function buildAdmXml(objects: AdmObjectSpec[], opts: AdmXmlOptions): string;
/**
 * Convert a position-event timeline into ADM blocks (Dolby event semantics).
 *
 * Each point is a discrete event: its position takes effect AT its rtime
 * (via jumpPosition with a 250-sample ramp), and its block lasts until the
 * next event. An event at t=0 is synthesized when the timeline starts later
 * (the voice's audio is silent before then, but the object must still have a
 * pinned position), consecutive events at the same position are merged, and
 * the final block holds to the full object duration — so the blocks always
 * tile [0, objectDuration] contiguously.
 */
export declare function blocksFromTimeline(points: Array<{
    t: number;
    position: AdmPosition;
}>, objectDuration: number): AdmBlock[];
//# sourceMappingURL=AdmXml.d.ts.map