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
const LE = true;
export function payloadSize(payload) {
    if (payload instanceof Uint8Array)
        return payload.byteLength;
    let n = 0;
    for (const p of payload)
        n += p.byteLength;
    return n;
}
function ascii(into, offset, str) {
    for (let i = 0; i < str.length; i++)
        into.setUint8(offset + i, str.charCodeAt(i));
}
/** Total on-disk size of a chunk list (headers + payloads + pad bytes). */
export function riffTotalSize(chunks) {
    let total = 12; // fourcc + size + 'WAVE'
    for (const c of chunks) {
        const size = payloadSize(c.payload);
        total += 8 + size + (size % 2);
    }
    return total;
}
/**
 * Assemble a RIFF/BW64 file as Blob parts.
 * Returns the parts array and the total byte size.
 */
export function buildRiff(fourcc, chunks) {
    const totalSize = riffTotalSize(chunks);
    const parts = [];
    const header = new Uint8Array(12);
    const hv = new DataView(header.buffer);
    ascii(hv, 0, fourcc);
    hv.setUint32(4, fourcc === 'RIFF' ? totalSize - 8 : 0xffffffff, LE);
    ascii(hv, 8, 'WAVE');
    parts.push(header);
    const PAD = new Uint8Array(1);
    for (const c of chunks) {
        const size = payloadSize(c.payload);
        const ch = new Uint8Array(8);
        const cv = new DataView(ch.buffer);
        ascii(cv, 0, c.id);
        cv.setUint32(4, c.sizeFieldOverride ?? size, LE);
        parts.push(ch);
        if (c.payload instanceof Uint8Array)
            parts.push(c.payload);
        else
            parts.push(...c.payload);
        if (size % 2 === 1)
            parts.push(PAD);
    }
    return { parts, totalSize };
}
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
export function buildListInfoChunk(entries) {
    const subs = [];
    for (const [id, raw] of Object.entries(entries)) {
        if (id.length !== 4 || !raw)
            continue;
        const text = raw.replace(/[^\x20-\x7e]/g, '');
        if (!text)
            continue;
        const size = text.length + 1; // NUL terminator
        const bytes = new Uint8Array(8 + size + (size % 2));
        const view = new DataView(bytes.buffer);
        ascii(view, 0, id);
        view.setUint32(4, size, LE);
        ascii(view, 8, text);
        subs.push(bytes);
    }
    if (subs.length === 0)
        return new Uint8Array(0);
    let n = 4;
    for (const s of subs)
        n += s.byteLength;
    const payload = new Uint8Array(n);
    ascii(new DataView(payload.buffer), 0, 'INFO');
    let at = 4;
    for (const s of subs) {
        payload.set(s, at);
        at += s.byteLength;
    }
    return payload;
}
/**
 * Build a plain 16-byte PCM fmt chunk payload for any channel count.
 * WAVE_FORMAT_EXTENSIBLE is deliberately not used: Pro Tools mishandles
 * extensible files with dwChannelMask=0 (4ch FOA imports as mono), and plain
 * PCM fmt is also the ADM/Atmos master convention for N > 2 channels.
 */
export function buildFmtChunk(opts) {
    const { channels, sampleRate, bitDepth } = opts;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const payload = new Uint8Array(16);
    const v = new DataView(payload.buffer);
    v.setUint16(0, 1, LE); // WAVE_FORMAT_PCM
    v.setUint16(2, channels, LE);
    v.setUint32(4, sampleRate, LE);
    v.setUint32(8, byteRate, LE);
    v.setUint16(12, blockAlign, LE);
    v.setUint16(14, bitDepth, LE);
    return payload;
}
function clampSample(value) {
    return Math.max(-1, Math.min(1, value));
}
/**
 * Interleave planar float channels into little-endian PCM bytes.
 * Rounds instead of truncating toward zero (avoids crossover distortion).
 */
export function interleavePcm(channels, bitDepth) {
    const numChannels = channels.length;
    const numSamples = channels[0]?.length ?? 0;
    const out = new Uint8Array(numSamples * numChannels * (bitDepth / 8));
    const v = new DataView(out.buffer);
    let offset = 0;
    if (bitDepth === 16) {
        for (let i = 0; i < numSamples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = clampSample(channels[ch][i]);
                const value = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
                v.setInt16(offset, value, LE);
                offset += 2;
            }
        }
    }
    else {
        // 24-bit — mask to 24 bits handles negative values correctly
        for (let i = 0; i < numSamples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = clampSample(channels[ch][i]);
                const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
                const u = value & 0xffffff;
                out[offset] = u & 0xff;
                out[offset + 1] = (u >>> 8) & 0xff;
                out[offset + 2] = (u >>> 16) & 0xff;
                offset += 3;
            }
        }
    }
    return out;
}
//# sourceMappingURL=RiffWriter.js.map