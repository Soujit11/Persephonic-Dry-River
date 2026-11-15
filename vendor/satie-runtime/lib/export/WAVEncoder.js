/**
 * Multi-channel WAV encoder.
 *
 * All channel counts use the plain 16-byte PCM fmt chunk. The AmbiX paper
 * suggests WAVE_FORMAT_EXTENSIBLE for >2 channels, but Pro Tools mishandles
 * extensible files with dwChannelMask=0 (a 4ch FOA file imports as mono),
 * while every ambisonic consumer (Pro Tools, Reaper, Unreal, Wwise) accepts
 * plain multichannel PCM — it's what Reaper itself writes.
 *
 * Supports 16-bit and 24-bit PCM output. Chunk assembly lives in RiffWriter
 * (shared with the BW64/ADM encoder).
 */
import { buildRiff, buildFmtChunk, buildListInfoChunk, interleavePcm } from './RiffWriter.js';
import { synthAssetFor, synthAssetBytes } from '../synth/asset.js';
import { SATIE_SOFTWARE, SATIE_ATTRIBUTION } from './Attribution.js';
/**
 * Encode an AudioBuffer to a WAV Blob.
 *
 * Every render leaving Satie goes through here — stereo, binaural, FOA, SOA,
 * quad, 7.1.2, 7.1.4 and the mic-array captures — so this is the one place
 * that has to say where the file came from (`export/Attribution.ts`).
 *
 * @param buffer - The AudioBuffer to encode
 * @param options - Bit depth and metadata; a bare `16` / `24` is still accepted
 * @returns A Blob containing the WAV file
 */
export function encodeWAV(buffer, options = 16) {
    const opts = typeof options === 'number' ? { bitDepth: options } : options;
    const bitDepth = opts.bitDepth ?? 16;
    const numChannels = buffer.numberOfChannels;
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }
    const chunks = [
        {
            id: 'fmt ',
            payload: buildFmtChunk({
                channels: numChannels,
                sampleRate: buffer.sampleRate,
                bitDepth,
            }),
        },
    ];
    if (opts.attribution !== false) {
        const info = buildListInfoChunk({
            ISFT: SATIE_SOFTWARE,
            ICMT: SATIE_ATTRIBUTION,
            INAM: opts.title ?? '',
            IART: opts.artist ?? '',
        });
        // Before `data`: a reader that stops at the data chunk still sees it.
        if (info.byteLength > 0)
            chunks.push({ id: 'LIST', payload: info });
    }
    const synth = synthAssetFor(buffer);
    if (synth)
        chunks.push({ id: 'stSy', payload: synthAssetBytes(synth) });
    chunks.push({ id: 'data', payload: interleavePcm(channels, bitDepth) });
    return new Blob(buildRiff('RIFF', chunks).parts, { type: 'audio/wav' });
}
/**
 * Trigger a file download in the browser. DOM required.
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
//# sourceMappingURL=WAVEncoder.js.map