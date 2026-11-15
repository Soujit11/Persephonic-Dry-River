/**
 * Feedback-delay-network coefficient maths — the part that has to be right.
 *
 * Why an FDN at all: `ConvolverNode` cannot vary its decay. Changing RT60 means
 * building a new impulse response and crossfading to it, which is why the world
 * room quantizes `size01` into ~0.128 treads (about 14 JND of reverb time per
 * step — see the applied-room gate in SatieEngine.worldRoom.test.ts). In an FDN
 * the decay is a per-line feedback gain: a number you can write every tick at
 * no cost, so there is nothing left to quantize. Steam Audio, FMOD and Project
 * Triton all converged on interpolating parametric filters for this reason.
 *
 * This module is pure and holds no audio state, so the coefficient laws are
 * unit-testable. The processor that uses them is a thin ring-buffer loop.
 */
/**
 * Delay-line lengths in samples: mutually prime, spread over a plausible room's
 * early-reflection span.
 *
 * Coprimality matters audibly. Lengths sharing a factor make their echoes
 * coincide periodically, and the tail rings at that period instead of
 * smoothing into noise — the classic "metallic" FDN failure. Primes cannot
 * share a factor, which is the cheapest possible guarantee.
 */
export declare const FDN_PRIMES: readonly [1123, 1187, 1289, 1381, 1433, 1531, 1613, 1699];
export declare const FDN_ORDER: 8;
/**
 * Scale the delay lengths to the running context's rate, keeping them odd so
 * they stay pairwise coprime in practice at any sample rate.
 */
export declare function delayLengths(sampleRate: number): number[];
/**
 * Feedback gain for one delay line at a target decay time.
 *
 * A signal circulating a delay of L samples passes it `fs/L` times per second;
 * after RT60 seconds it must be 60 dB down. Solving per pass:
 *
 *   g = 10^(−3·L / (RT60·fs))
 *
 * Longer lines therefore take a LOWER gain per pass: they circulate fewer
 * times in the same seconds, so each pass must account for more of the 60 dB.
 * The per-second decay comes out identical across lines, which is the point —
 * they all arrive at −60 dB together. Using one gain for every line instead
 * would make short lines die first and leave the long ones ringing on alone.
 */
export declare function feedbackGain(delaySamples: number, rt60S: number, sampleRate: number): number;
/** Every line's feedback gain for a decay time. */
export declare function feedbackGains(rt60S: number, sampleRate: number): number[];
/**
 * One-pole lowpass coefficient placing a −3 dB corner at `cutoffHz`.
 *
 * Sits inside each feedback path so highs decay faster than lows — which is
 * what every real room does (air absorption plus soft furnishings), and what
 * separates a room from a metal plate. Returned as the feedback coefficient
 * `a` for `y[n] = (1−a)·x[n] + a·y[n−1]`.
 */
export declare function dampingCoefficient(cutoffHz: number, sampleRate: number): number;
/**
 * Map Satie's 0–1 `damping` to a damping corner in Hz.
 *
 * 0 keeps the tail bright (a tiled hall); 1 pulls it dark (heavy furnishing).
 * Exponential rather than linear because pitch perception is: a linear sweep
 * would spend most of its travel in an inaudible region up top.
 */
export declare function dampingCutoffHz(damping01: number): number;
/**
 * `damping 0` must be a genuine BYPASS, not a gentle lowpass.
 *
 * This was 16 kHz, which sounds like "no damping" and is not: fed broadband,
 * a one-pole has power gain (1−a)²/(1−a²), about 0.78 per pass at that corner.
 * Nothing compensated for it, so every tail decayed ~19% faster than asked —
 * measured in a real browser at 0.5 s, 1.5 s and 3 s, the same shortfall at
 * each, which is the signature of a constant per-pass loss rather than a
 * frequency effect. Above Nyquist `dampingCoefficient` returns exactly 0 and
 * the filter drops out, so the decay law holds on its own terms.
 */
export declare const DAMPING_BRIGHT_HZ = 24000;
export declare const DAMPING_DARK_HZ = 900;
/**
 * Satie's `size01` → RT60 seconds. Deliberately the SAME relation
 * `WorldAcoustics.criticalDistanceM` already assumes (0.3 + 5.7·size01), so a
 * measured enclosure, an authored `reverb size` and the FDN's actual decay all
 * describe one room rather than three that happen to sound similar.
 */
export declare function rt60ForSize01(size01: number): number;
/**
 * Inverse of `rt60ForSize01` — the bridge from MEASURED acoustics into the
 * engine's room vocabulary. A physically computed RT60 (Eyring over measured
 * volume, surfaces and apertures) maps to the `size01` that makes the FDN
 * reproduce exactly that decay, because the FDN applies the forward relation.
 * Clamped: a measured decay outside [0.3 s, 6 s] renders at the nearest
 * representable room rather than extrapolating the control past its range.
 */
export declare function size01ForRt60(rt60S: number): number;
/**
 * Normalization for an order-N Hadamard mixing matrix.
 *
 * The feedback matrix must be ORTHOGONAL — energy-preserving — or the network
 * is unstable in one direction and over-damped in the other, and the decay
 * stops matching the feedback gains that were so carefully computed. A
 * Hadamard matrix scaled by 1/√N is orthogonal, and its transform is N·log N
 * butterflies rather than an N² multiply.
 */
export declare function hadamardScale(order: number): number;
/**
 * In-place fast Walsh–Hadamard transform. `buf.length` must be a power of two.
 * Used as the FDN's mixing matrix; call `hadamardScale` to normalize.
 */
export declare function hadamardInPlace(buf: Float32Array | number[]): void;
//# sourceMappingURL=FdnCoefficients.d.ts.map