const cache = new WeakMap();
/** Cached per immutable decoded buffer; call at admission, not repeatedly on contact. */
export function measureTriggerOnset(buffer) {
    const previous = cache.get(buffer);
    if (previous)
        return previous;
    const result = {
        onsetSeconds: 0, offsetSeconds: 0, analysis: 'rms-relative-40db',
        windowSeconds: 0.005, prerollSeconds: 0.002, detected: false,
    };
    cache.set(buffer, result);
    if (!(buffer.length > 0) || !(buffer.sampleRate > 0) || !(buffer.numberOfChannels > 0)
        || typeof buffer.getChannelData !== 'function')
        return result;
    const window = Math.max(1, Math.round(buffer.sampleRate * result.windowSeconds));
    const energies = new Float64Array(Math.ceil(buffer.length / window));
    // Max channel energy retains a transient in either ear without cancellation.
    let max = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const samples = buffer.getChannelData(ch);
        for (let i = 0, b = 0; i < buffer.length; i += window, b++) {
            const end = Math.min(buffer.length, i + window);
            let sum = 0;
            for (let j = i; j < end; j++)
                sum += samples[j] * samples[j];
            const energy = sum / (end - i);
            if (energy > energies[b])
                energies[b] = energy;
            if (energy > max)
                max = energy;
        }
    }
    if (!(max > 1e-12))
        return result;
    const threshold = max * 0.0001; // -40 dB in power.
    const first = energies.findIndex(energy => energy >= threshold);
    result.detected = first >= 0;
    if (first >= 0) {
        result.onsetSeconds = first * window / buffer.sampleRate;
        result.offsetSeconds = Math.max(0, result.onsetSeconds - result.prerollSeconds);
    }
    return result;
}
//# sourceMappingURL=TriggerOnset.js.map