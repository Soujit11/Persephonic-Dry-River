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
/** RMS of one channel, sampled at a stride so a long file costs little. */
function rms(data, stride = 16) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += stride) {
        sum += data[i] * data[i];
        n++;
    }
    return n ? Math.sqrt(sum / n) : 0;
}
/**
 * Which channels make the mono, and how. Four channels whose first channel is
 * at least as loud as every other read as first-order ambisonic (W is the
 * omni and the largest under either SN3D or FuMa): W alone IS the mono. Any
 * other multichannel layout averages every channel. Exported for tests.
 */
export function foldPlan(channels) {
    if (channels.length === 4) {
        const levels = channels.map(c => rms(c));
        if (levels[0] > 0 && levels.slice(1).every(l => l <= levels[0]))
            return { kind: 'ambisonic_w', weights: [1, 0, 0, 0] };
    }
    const w = 1 / channels.length;
    return { kind: 'average', weights: channels.map(() => w) };
}
/** Whether a buffer needs folding: anything beyond stereo. */
export function needsFold(buffer) {
    return buffer.numberOfChannels > 2;
}
/**
 * The buffer the engine keeps: itself when it is mono or stereo, otherwise a
 * new mono buffer at the same rate and length. `create` is the context's
 * `createBuffer` (or a test stub); a null from it keeps the original.
 */
export function foldToPlaceable(buffer, create) {
    if (!needsFold(buffer))
        return buffer;
    const channels = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++)
        channels.push(buffer.getChannelData(ch));
    const plan = foldPlan(channels);
    const out = create(1, buffer.length, buffer.sampleRate);
    if (!out)
        return buffer;
    const mono = out.getChannelData(0);
    for (let ch = 0; ch < channels.length; ch++) {
        const w = plan.weights[ch];
        if (!w)
            continue;
        const src = channels[ch];
        for (let i = 0; i < mono.length; i++)
            mono[i] += src[i] * w;
    }
    return out;
}
//# sourceMappingURL=audioBuffers.js.map