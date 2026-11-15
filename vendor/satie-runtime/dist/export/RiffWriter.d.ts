/**
 * RIFF/BW64 chunk-list writer.
 *
 * The original WAV encoder wrote one linear buffer with hardcoded offsets,
 * which can't grow extra chunks. ADM BWF needs `chna` + `axml` chunks (and a
 * ds64/JUNK placeholder), so this module models a file as a list of chunks
 * and assembles the parts for a Blob — no single giant contiguous copy of the
 * sample data is required beyond the interleave buffers themselves.
 *
 * Spec notes honored here:
 * - Odd-sized chunk payloads are followed by a zero pad byte (word alignment);
 *   the pad is NOT counted in the chunk's size field but IS in the RIFF size.
 * - 'RIFF' files carry real 32-bit sizes; 'BW64'/'RF64' set the outer size and
 *   the data chunk size to 0xFFFFFFFF and rely on a ds64 chunk (BS.2088),
 *   which the caller supplies as an ordinary chunk.
 */
/** Uint8Array backed by a plain ArrayBuffer (Blob-compatible). */
export type ByteArray = Uint8Array<ArrayBuffer>;
export interface RiffChunk {
    /** 4-character chunk id, e.g. 'fmt ', 'data', 'chna', 'axml'. */
    id: string;
    payload: ByteArray | ByteArray[];
    /**
     * Override for the size FIELD only (payload bytes are written as given).
     * Used by BW64 writers to set the data chunk's size field to 0xFFFFFFFF.
     */
    sizeFieldOverride?: number;
}
export declare function payloadSize(payload: ByteArray | ByteArray[]): number;
/** Total on-disk size of a chunk list (headers + payloads + pad bytes). */
export declare function riffTotalSize(chunks: RiffChunk[]): number;
/**
 * Assemble a RIFF/BW64 file as Blob parts.
 * Returns the parts array and the total byte size.
 */
export declare function buildRiff(fourcc: 'RIFF' | 'BW64' | 'RF64', chunks: RiffChunk[]): {
    parts: ByteArray[];
    totalSize: number;
};
/**
 * A `LIST`/`INFO` payload: the standard RIFF place for "who wrote this file".
 *
 * Entries are four-character INFO ids (`ISFT` producing software, `ICMT`
 * comment, `INAM` title, `IART` artist) mapped to NUL-terminated ASCII, each
 * sub-chunk padded to an even length like every other RIFF chunk. Readers that
 * do not know INFO skip the whole LIST by its size field, so this is safe to
 * add to any WAV — including the multichannel ambisonic files whose consumers
 * are fussy about the fmt chunk.
 *
 * Non-ASCII is dropped rather than mangled: INFO predates any encoding
 * declaration, and a tagger showing mojibake is worse than one showing less.
 */
export declare function buildListInfoChunk(entries: Record<string, string>): ByteArray;
export interface FmtOptions {
    channels: number;
    sampleRate: number;
    bitDepth: 16 | 24;
}
/**
 * Build a plain 16-byte PCM fmt chunk payload for any channel count.
 * WAVE_FORMAT_EXTENSIBLE is deliberately not used: Pro Tools mishandles
 * extensible files with dwChannelMask=0 (4ch FOA imports as mono), and plain
 * PCM fmt is also the ADM/Atmos master convention for N > 2 channels.
 */
export declare function buildFmtChunk(opts: FmtOptions): ByteArray;
/**
 * Interleave planar float channels into little-endian PCM bytes.
 * Rounds instead of truncating toward zero (avoids crossover distortion).
 */
export declare function interleavePcm(channels: Float32Array[], bitDepth: 16 | 24): ByteArray;
//# sourceMappingURL=RiffWriter.d.ts.map