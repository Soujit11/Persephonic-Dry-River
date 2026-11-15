export function probeFOA(channels, sampleRate, windowS = 0.05) {
    if (channels.length !== 4 || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(windowS) || windowS <= 0
        || !channels[0].length || channels.some(c => c.length !== channels[0].length))
        throw new Error('Expected nonempty, equal-length AmbiX W,Y,Z,X channels.');
    const size = Math.max(1, Math.round(sampleRate * windowS));
    const result = [];
    for (let start = 0; start < channels[0].length; start += size) {
        const end = Math.min(start + size, channels[0].length);
        let w2 = 0, spatial2 = 0, y = 0, z = 0, x = 0;
        for (let i = start; i < end; i++) {
            const w = channels[0][i], cy = channels[1][i], cz = channels[2][i], cx = channels[3][i];
            if (![w, cy, cz, cx].every(Number.isFinite))
                throw new Error('Non-finite audio sample.');
            w2 += w * w;
            spatial2 += cy * cy + cz * cz + cx * cx;
            y += w * cy;
            z += w * cz;
            x += w * cx;
        }
        const length = Math.hypot(x, y, z);
        const coherence = w2 > 1e-16 && spatial2 > 1e-16 ? Math.min(1, length / Math.sqrt(w2 * spatial2)) : 0;
        result.push({ t: (start + end) / (2 * sampleRate), rmsDb: w2 > 1e-16 ? 10 * Math.log10(w2 / (end - start)) : null,
            coherence, direction: coherence > 0.2 && length > 1e-12 ? {
                azimuth: Math.atan2(y, x) * 180 / Math.PI,
                elevation: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI,
            } : null });
    }
    return result;
}
/** Great-circle error; the target is an independently specified test condition. */
export function angularError(a, b) {
    const rad = Math.PI / 180;
    const cosine = Math.sin(a.elevation * rad) * Math.sin(b.elevation * rad)
        + Math.cos(a.elevation * rad) * Math.cos(b.elevation * rad) * Math.cos((a.azimuth - b.azimuth) * rad);
    return Math.acos(Math.max(-1, Math.min(1, cosine))) / rad;
}
export function compareDirection(frames, expected, toleranceDeg) {
    if (!(toleranceDeg >= 0) || !Number.isFinite(toleranceDeg))
        throw new Error('Invalid angle tolerance.');
    const errors = frames.flatMap(f => f.direction ? [angularError(f.direction, expected(f.t))] : []);
    return { measuredFrames: errors.length, totalFrames: frames.length, coverage: frames.length ? errors.length / frames.length : 0,
        meanErrorDeg: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
        maxErrorDeg: errors.length ? Math.max(...errors) : null,
        passed: errors.length === frames.length && errors.length > 0 && errors.every(e => e <= toleranceDeg) };
}
/** Schroeder decay diagnostics for an isolated impulse response, not an arbitrary music clip. */
export function probeImpulseResponse(pcm, sampleRate) {
    if (!pcm.length || !(sampleRate > 0) || !Number.isFinite(sampleRate))
        throw new Error('Invalid impulse response.');
    const energy = new Float64Array(pcm.length);
    let total = 0;
    for (let i = pcm.length - 1; i >= 0; i--) {
        if (!Number.isFinite(pcm[i]))
            throw new Error('Non-finite impulse response.');
        total += pcm[i] ** 2;
        energy[i] = total;
    }
    if (total <= 1e-16)
        return { t20S: null, rt60EstimateS: null, earlyEnergyFraction: null };
    const first = pcm.findIndex(v => v * v > total * 1e-8);
    const crossing = (db) => energy.findIndex((v, i) => i >= first && v <= total * 10 ** (db / 10));
    const a = crossing(-5), b = crossing(-25);
    const t20S = a >= 0 && b > a ? (b - a) / sampleRate : null;
    const earlyEnd = Math.min(pcm.length - 1, first + Math.round(.08 * sampleRate));
    return { t20S, rt60EstimateS: t20S === null ? null : t20S * 3,
        earlyEnergyFraction: (total - energy[earlyEnd]) / total };
}
//# sourceMappingURL=AudioProbe.js.map