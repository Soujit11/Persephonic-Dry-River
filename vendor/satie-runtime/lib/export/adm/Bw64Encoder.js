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
import { buildRiff, buildFmtChunk, interleavePcm } from '../RiffWriter.js';
const LE = true;
function asciiFixed(into, offset, str, len) {
    for (let i = 0; i < len; i++) {
        into[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
    }
}
/** Serialize the chna chunk: 4-byte header + one 40-byte record per track. */
export function buildChnaChunk(entries) {
    const payload = new Uint8Array(4 + entries.length * 40);
    const v = new DataView(payload.buffer);
    v.setUint16(0, entries.length, LE); // numTracks
    v.setUint16(2, entries.length, LE); // numUIDs (1 UID per track here)
    for (let i = 0; i < entries.length; i++) {
        const off = 4 + i * 40;
        v.setUint16(off, i + 1, LE); // trackIndex, 1-based
        asciiFixed(payload, off + 2, entries[i].uid, 12);
        asciiFixed(payload, off + 14, entries[i].trackRef, 14);
        asciiFixed(payload, off + 28, entries[i].packRef, 11);
        payload[off + 39] = 0; // pad
    }
    return payload;
}
/** Threshold above which the file must use the BW64 fourcc + real ds64. */
export const RIFF_32BIT_LIMIT = 0xffffffff;
/**
 * Size planning, separated for unit tests (a real ≥4 GB buffer can't be
 * allocated in tests). `chunkSizes` are the payload sizes of every non-data
 * chunk in file order (ds64/JUNK, fmt, chna, axml).
 */
export function planBw64Sizes(numTracks, numSamples, bytesPerSample, chunkSizes) {
    const dataSize = numTracks * numSamples * bytesPerSample;
    let totalSize = 12;
    for (const s of [...chunkSizes, dataSize]) {
        totalSize += 8 + s + (s % 2);
    }
    return { useBw64: totalSize > RIFF_32BIT_LIMIT, dataSize, totalSize };
}
/** ds64 payload: riffSize + dataSize + dummy as uint64 + empty table. */
function buildDs64(totalSize, dataSize) {
    const payload = new Uint8Array(28);
    const v = new DataView(payload.buffer);
    const writeU64 = (off, val) => {
        v.setUint32(off, val >>> 0, LE);
        v.setUint32(off + 4, Math.floor(val / 0x100000000), LE);
    };
    writeU64(0, totalSize - 8); // riffSize
    writeU64(8, dataSize); // dataSize
    writeU64(16, 0); // dummy
    v.setUint32(24, 0, LE); // table length
    return payload;
}
/** Interleave in ~1 s slabs so no single contiguous copy of the data exists. */
function interleaveSlabbed(tracks, bitDepth, sampleRate) {
    const numSamples = tracks[0]?.length ?? 0;
    const slab = sampleRate;
    const parts = [];
    for (let start = 0; start < numSamples; start += slab) {
        const end = Math.min(start + slab, numSamples);
        parts.push(interleavePcm(tracks.map((t) => t.subarray(start, end)), bitDepth));
    }
    return parts;
}
export function encodeBW64(opts) {
    const { tracks, sampleRate, bitDepth, axml, chna } = opts;
    if (tracks.length === 0)
        throw new Error('encodeBW64: no tracks');
    if (tracks.length !== chna.length) {
        throw new Error(`encodeBW64: ${tracks.length} tracks but ${chna.length} chna entries`);
    }
    const numSamples = tracks[0].length;
    const axmlBytes = new TextEncoder().encode(axml);
    const chnaBytes = buildChnaChunk(chna);
    const fmtBytes = buildFmtChunk({
        channels: tracks.length,
        sampleRate,
        bitDepth,
    });
    const plan = planBw64Sizes(tracks.length, numSamples, bitDepth / 8, [
        28, fmtBytes.byteLength, chnaBytes.byteLength, axmlBytes.byteLength,
    ]);
    const ds64OrJunk = plan.useBw64
        ? { id: 'ds64', payload: buildDs64(plan.totalSize, plan.dataSize) }
        : { id: 'JUNK', payload: new Uint8Array(28) };
    const dataChunk = {
        id: 'data',
        payload: interleaveSlabbed(tracks, bitDepth, sampleRate),
        ...(plan.useBw64 ? { sizeFieldOverride: 0xffffffff } : {}),
    };
    const { parts } = buildRiff(plan.useBw64 ? 'BW64' : 'RIFF', [
        ds64OrJunk,
        { id: 'fmt ', payload: fmtBytes },
        { id: 'chna', payload: chnaBytes },
        { id: 'axml', payload: axmlBytes },
        dataChunk,
    ]);
    return new Blob(parts, { type: 'audio/wav' });
}
//# sourceMappingURL=Bw64Encoder.js.map