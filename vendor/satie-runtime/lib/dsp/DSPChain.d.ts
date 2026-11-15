/**
 * DSP effect chain using native Web Audio API nodes.
 *
 * All processing runs on the browser's audio thread (C++/GPU),
 * so there's zero JS overhead per sample. No AudioWorklets needed.
 *
 * Chain order: source → [filter] → [distortion] → [delay] → [EQ] → output
 *
 * Reverb is deliberately NOT in this chain. It is a send to a shared bus that
 * bypasses the panner (see ReverbBus.ts) so the reverberant field stays diffuse
 * and distance-independent; this module only still owns the impulse response
 * the bus convolves with.
 *
 * VALUE NORMALIZATION:
 * The Satie DSL uses 0-1 for almost all parameters (except time and space).
 * This module maps normalized values to real audio ranges:
 *   - Filter cutoff:    0-1 → 20Hz-20000Hz (exponential)
 *   - Filter resonance: 0-1 → 0.1-20 (exponential)
 *   - Distortion drive: 0-1 → 0.1-50 (exponential)
 *   - EQ gain:          0-1 → -12dB to +12dB (linear, 0.5 = 0dB)
 *   - All wet/dry/feedback/damping etc: already 0-1
 */
import type { DelayParams, FilterParams, DistortionParams, EQParams } from '../core/Statement';
export interface DSPNodes {
    /** The node to connect the source into */
    input: AudioNode;
    /** The node that outputs the processed signal */
    output: AudioNode;
    /** All created nodes — for cleanup */
    nodes: AudioNode[];
    /** Exposed node references for runtime parameter interpolation */
    filterRef?: {
        filter: BiquadFilterNode;
        wet: GainNode;
        dry: GainNode;
    };
    distortionRef?: {
        shaper: WaveShaperNode;
        wet: GainNode;
        dry: GainNode;
        mode: string;
    };
    delayRef?: {
        delays: DelayNode[];
        fbGain: GainNode;
        wet: GainNode;
        dry: GainNode;
    };
    eqRef?: {
        low: BiquadFilterNode;
        mid: BiquadFilterNode;
        high: BiquadFilterNode;
    };
}
/** ≤1: normalized 20Hz-20kHz (exponential). >1: literal Hz. */
export declare function mapCutoff(n: number): number;
/** ≤1: normalized 0.1-20 (exponential). >1: literal Q. */
export declare function mapResonance(n: number): number;
/** ≤1: normalized 0.1-50 (exponential). >1: literal drive amount. */
export declare function mapDrive(n: number): number;
/** 0-1: normalized -12..+12dB (0.5 = 0dB). Outside that: literal dB. */
export declare function mapEQGain(n: number): number;
/**
 * Map 0-1 speed for fly/walk (sine wander) — exponential curve that
 * stays useful for high inputs because the engine scales by 0.01·2π
 * before driving the sines.
 * 0 = nearly still (0.005 Hz), 0.5 ≈ 0.1 Hz, 1.0 = 2.0 Hz.
 */
export declare function mapSpeed(n: number): number;
/**
 * Map 0-1 speed for trajectory wander (spiral, orbit, lorenz, custom LUT).
 * Trajectories visit far more spatial ground per parametric cycle than
 * fly's smooth sines, so they need a flatter curve — Math.pow(400, n)
 * blows up at high inputs and produces unusable sub-second LUT cycles.
 * This curve keeps `speed 0.05–0.1` near the historical "feels right"
 * range (~150 s cycle) while capping `speed 1` at a usable 17 s cycle.
 * 0 → 0.005 Hz (200 s), 0.5 → 0.017 Hz (58 s), 1.0 → 0.06 Hz (17 s).
 */
export declare function mapTrajectorySpeed(n: number): number;
/**
 * Quantize a normalized (pre-mapDrive) drive value to its curve-cache bucket.
 * The engine uses this to skip WaveShaper curve reassignment when a drive
 * fade hasn't crossed into a new bucket.
 */
export declare function driveBucket(n: number): number;
export declare function makeDistortionCurve(mode: string, drive: number, samples?: number): Float32Array;
export declare function generateImpulseResponse(ctx: AudioContext, roomSize: number, damping: number): AudioBuffer;
export declare function buildDSPChain(ctx: AudioContext, opts: {
    filter?: FilterParams | null;
    distortion?: DistortionParams | null;
    delay?: DelayParams | null;
    eq?: EQParams | null;
}): DSPNodes | null;
/**
 * Disconnect and release all nodes in a DSP chain.
 */
export declare function destroyDSPChain(chain: DSPNodes): void;
//# sourceMappingURL=DSPChain.d.ts.map