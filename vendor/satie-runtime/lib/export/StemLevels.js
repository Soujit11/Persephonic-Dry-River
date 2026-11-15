/** Where a frame with no signal lands, dBFS (about 4 bits under 16-bit quantization noise). */
export const STEM_LEVEL_FLOOR_DBFS = -120;
/**
 * Per-frame RMS level of each stem over `[frame / fps, (frame + 1) / fps)`,
 * in dBFS, for `frameCount = ceil(durationS * fps)` frames. Frames outside
 * the voice's window read the stem anyway (it is silent there), so a late
 * reverb tail is measured where it sounds. `stems[i]` undefined gives a null
 * row: that voice was not rendered (missing buffer).
 */
export function measureStemLevels(stems, voices, sampleRate, durationS, fps) {
    if (!(fps > 0))
        throw new Error(`stem levels fps must be positive, got ${fps}`);
    const frameCount = Math.ceil(durationS * fps);
    const dbfs = new Array(voices.length).fill(null);
    for (let vi = 0; vi < voices.length; vi++) {
        const stem = stems[vi];
        if (!stem)
            continue;
        const row = new Float32Array(frameCount);
        for (let f = 0; f < frameCount; f++) {
            const n0 = Math.min(stem.length, Math.floor((f / fps) * sampleRate));
            const n1 = Math.min(stem.length, Math.floor(((f + 1) / fps) * sampleRate));
            let acc = 0;
            for (let n = n0; n < n1; n++)
                acc += stem[n] * stem[n];
            const count = n1 - n0;
            const rms = count > 0 ? Math.sqrt(acc / count) : 0;
            row[f] = rms > 0 ? Math.max(STEM_LEVEL_FLOOR_DBFS, 20 * Math.log10(rms)) : STEM_LEVEL_FLOOR_DBFS;
        }
        dbfs[vi] = row;
    }
    return { basis: 'output-measured-stem', fps, dbfs };
}
//# sourceMappingURL=StemLevels.js.map