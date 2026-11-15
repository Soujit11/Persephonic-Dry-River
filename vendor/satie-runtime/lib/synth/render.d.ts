import { type SynthPatch } from './patch.js';
export interface RenderOptions {
    seconds: number;
    /** A loop wraps seamlessly; a one-shot starts and ends in silence. */
    loop: boolean;
    seed?: number;
    sampleRate?: number;
}
export interface RenderStats {
    /** Peak of the mix before it was levelled: near zero means the patch made no sound. */
    rawPeak: number;
    peak: number;
    rms: number;
    /** Largest channel mean, as a share of full scale. */
    dc: number;
    nonFinite: boolean;
    /** Jump across the loop point over the largest sample-to-sample step inside the take; near or under 1 is seamless. */
    seam: number;
}
export interface Rendered {
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
    stats: RenderStats;
}
export declare function renderPatch(patch: SynthPatch, options: RenderOptions): Rendered;
/** Why a render must not be kept, in plain words; null when it is fine. */
export declare function refusal(stats: RenderStats): string | null;
/** 16-bit stereo WAV bytes, for the encoder that follows and for listening to a render directly. */
export declare function wavBytes(r: Pick<Rendered, 'left' | 'right' | 'sampleRate'>): Uint8Array;
//# sourceMappingURL=render.d.ts.map