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
export interface WavOptions {
    /** 16 or 24 bit PCM (default 16). */
    bitDepth?: 16 | 24;
    /** Scene title, written to `INAM`. */
    title?: string;
    /** Scene author, written to `IART`. */
    artist?: string;
    /**
     * Write the `LIST`/`INFO` attribution chunk (default true). Set false only
     * where a byte-exact fixture is the point — a render whose PCM is compared
     * hash-for-hash still matches, since the chunk sits outside `data`.
     */
    attribution?: boolean;
}
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
export declare function encodeWAV(buffer: AudioBuffer, options?: (16 | 24) | WavOptions): Blob;
/**
 * Trigger a file download in the browser. DOM required.
 */
export declare function downloadBlob(blob: Blob, filename: string): void;
//# sourceMappingURL=WAVEncoder.d.ts.map