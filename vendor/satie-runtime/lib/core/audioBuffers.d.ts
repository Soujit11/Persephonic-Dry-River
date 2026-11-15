/**
 * Decoded audio the engine can place. A recording with more than two
 * channels (a four-channel ambisonic field, a quad or surround file) cannot
 * be a point source: the browser's channel interpretation folds four
 * channels as quad, which turns B-format (W, X, Y, Z) into W+Y on the left
 * and X+Z on the right, a phasey smear that reads as a sample-rate fault.
 * A spatial SOURCE is mono by nature (the engine positions it), so anything
 * beyond stereo folds to one channel here, at the one door every buffer
 * enters through. Stereo and mono pass untouched.
 */
/**
 * Which channels make the mono, and how. Four channels whose first channel is
 * at least as loud as every other read as first-order ambisonic (W is the
 * omni and the largest under either SN3D or FuMa): W alone IS the mono. Any
 * other multichannel layout averages every channel. Exported for tests.
 */
export declare function foldPlan(channels: readonly Float32Array[]): {
    kind: 'ambisonic_w' | 'average';
    weights: number[];
};
/** Whether a buffer needs folding: anything beyond stereo. */
export declare function needsFold(buffer: AudioBuffer): boolean;
/**
 * The buffer the engine keeps: itself when it is mono or stereo, otherwise a
 * new mono buffer at the same rate and length. `create` is the context's
 * `createBuffer` (or a test stub); a null from it keeps the original.
 */
export declare function foldToPlaceable(buffer: AudioBuffer, create: (channels: number, length: number, sampleRate: number) => AudioBuffer | null): AudioBuffer;
//# sourceMappingURL=audioBuffers.d.ts.map