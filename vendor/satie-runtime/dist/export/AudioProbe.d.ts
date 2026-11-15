/** Independent measurements of rendered AmbiX PCM; no scene graph or encoder imports. */
export interface AudioProbeFrame {
    t: number;
    rmsDb: number | null;
    direction: {
        azimuth: number;
        elevation: number;
    } | null;
    /** Directional coherence, useful diagnostically; not a source-extent ground truth. */
    coherence: number;
}
export declare function probeFOA(channels: readonly Float32Array[], sampleRate: number, windowS?: number): AudioProbeFrame[];
/** Great-circle error; the target is an independently specified test condition. */
export declare function angularError(a: {
    azimuth: number;
    elevation: number;
}, b: {
    azimuth: number;
    elevation: number;
}): number;
export declare function compareDirection(frames: readonly AudioProbeFrame[], expected: (t: number) => {
    azimuth: number;
    elevation: number;
}, toleranceDeg: number): {
    measuredFrames: number;
    totalFrames: number;
    coverage: number;
    meanErrorDeg: number | null;
    maxErrorDeg: number | null;
    passed: boolean;
};
/** Schroeder decay diagnostics for an isolated impulse response, not an arbitrary music clip. */
export declare function probeImpulseResponse(pcm: Float32Array, sampleRate: number): {
    t20S: null;
    rt60EstimateS: null;
    earlyEnergyFraction: null;
} | {
    t20S: number | null;
    rt60EstimateS: number | null;
    earlyEnergyFraction: number;
};
//# sourceMappingURL=AudioProbe.d.ts.map