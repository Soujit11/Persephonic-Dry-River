/**
 * BW64/RIFF encoder for ADM BWF masters.
 *
 * Layout: RIFF/WAVE (or BW64 for ≥4 GB) → JUNK-or-ds64 → fmt → chna → axml →
 * data. The ds64 placeholder is written as JUNK when sizes fit 32 bits (per
 * BS.2088, so a file can be upgraded in place); when they don't, the fourcc
 * becomes BW64, the outer and data size fields become 0xFFFFFFFF and the
 * placeholder becomes a real ds64 carrying 64-bit sizes.
 *
 * The fmt chunk is plain 16-byte PCM even for N > 2 channels — that is the
 * Dolby Atmos ADM master convention (not WAVE_FORMAT_EXTENSIBLE).
 */
import { ByteArray } from '../RiffWriter.js';
import type { AdmTrackRefs } from './AdmXml';
/** One `chna` record binding a data-chunk track to its ADM track UID/formats. */
export type ChnaEntry = AdmTrackRefs;
/** Serialize the chna chunk: 4-byte header + one 40-byte record per track. */
export declare function buildChnaChunk(entries: ChnaEntry[]): ByteArray;
/** Threshold above which the file must use the BW64 fourcc + real ds64. */
export declare const RIFF_32BIT_LIMIT = 4294967295;
export interface Bw64SizePlan {
    useBw64: boolean;
    dataSize: number;
    /** Total file size including all headers and pad bytes. */
    totalSize: number;
}
/**
 * Size planning, separated for unit tests (a real ≥4 GB buffer can't be
 * allocated in tests). `chunkSizes` are the payload sizes of every non-data
 * chunk in file order (ds64/JUNK, fmt, chna, axml).
 */
export declare function planBw64Sizes(numTracks: number, numSamples: number, bytesPerSample: number, chunkSizes: number[]): Bw64SizePlan;
export interface Bw64Options {
    /** One mono Float32Array per ADM object, all the same length. */
    tracks: Float32Array[];
    sampleRate: number;
    bitDepth: 16 | 24;
    /** Complete ADM XML (BS.2076) — stored in the axml chunk as UTF-8. */
    axml: string;
    chna: ChnaEntry[];
}
export declare function encodeBW64(opts: Bw64Options): Blob;
//# sourceMappingURL=Bw64Encoder.d.ts.map