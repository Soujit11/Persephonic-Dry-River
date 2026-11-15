/**
 * AudioParam smoothing time constant (seconds).
 * Used with setTargetAtTime for gain/pitch/DSP parameter changes.
 * After ~4τ (28ms) the value reaches 98% of target — fast enough to feel
 * instantaneous but smooth enough to avoid zipper noise.
 */
export declare const PARAM_SMOOTHING = 0.007;
//# sourceMappingURL=audioParams.d.ts.map