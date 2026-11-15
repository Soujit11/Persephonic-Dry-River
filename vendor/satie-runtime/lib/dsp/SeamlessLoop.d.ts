/**
 * Perfect loops from imperfect files.
 *
 * Every take and most library recordings arrive as MP3, and MP3 pads both ends
 * with encoder delay / padding silence (tens of milliseconds); no generated
 * "seamless" take and no field recording ends where it began. Looped as-is, the
 * wrap is a gap and a click every cycle (Mateo, 2026-09-09: "I can hear the
 * audio files looping because it stops"). A sound designer fixes this by hand:
 * trim the silence, end the loop where the waveform matches the start, and
 * crossfade the tail into the head. This module does exactly that, once per
 * buffer, so `sourceNode.loop = true` wraps without a seam.
 */
/** Below this the edges count as padding, not content. */
export declare const LOOP_TRIM_DB = -60;
/** Longest crossfade, seconds; ambiences take the full length, short loops a tenth of their duration. */
export declare const LOOP_FADE_MAX_S = 1;
/** How far back from the trimmed end the best-matching loop point is searched, seconds. */
export declare const LOOP_SEARCH_S = 0.12;
/** Buffers shorter than this are left alone (a 1 s loop has nothing to crossfade). */
export declare const LOOP_MIN_S = 2;
export interface PcmLike {
    readonly numberOfChannels: number;
    readonly length: number;
    readonly sampleRate: number;
    readonly duration: number;
    getChannelData(c: number): Float32Array;
}
/** [start, end) sample bounds with leading / trailing near-silence removed (never empties the buffer). */
export declare function trimSilenceBounds(buffer: PcmLike, thresholdDb?: number): [number, number];
/**
 * The loop end within the last `searchS` seconds where the signal (value and
 * slope, summed over channels) best matches the start, so the wrap is as
 * continuous as the material allows before the crossfade smooths the rest.
 */
export declare function bestLoopEnd(buffer: PcmLike, start: number, end: number, searchS?: number): number;
/**
 * A copy of `buffer` that loops without a seam: trimmed, ended at the best
 * match to its start, and with its tail crossfaded (equal power) into its
 * head so the wrap is continuous. Returns the input untouched when it is too
 * short to treat or the context cannot allocate a buffer.
 */
export declare function makeSeamlessLoop(buffer: PcmLike, create: (channels: number, length: number, sampleRate: number) => PcmLike | null): PcmLike;
export declare function seamlessLoopOf<T extends PcmLike>(buffer: T, create: (channels: number, length: number, sampleRate: number) => PcmLike | null, cacheScope?: object): T;
/** The seam a loop would have: |last − first| plus slope mismatch, summed over channels (0 = continuous). */
export declare function loopSeam(buffer: PcmLike): number;
//# sourceMappingURL=SeamlessLoop.d.ts.map