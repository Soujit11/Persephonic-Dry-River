/**
 * Seeded batch rendering — one script, N samples.
 *
 * A Satie script is already a distribution rather than a fixed rendering:
 * `RangeOrValue` makes volumes, pitches, intervals and motion seeds random
 * variables, and `RenderOptions.seed` makes a draw from that distribution
 * reproducible. One script plus N seeds is therefore a corpus generator, and
 * that is an accident of the DSL's original design that happens to be exactly
 * the right primitive for training data.
 *
 * ## Why the material spread is part of this
 *
 * Absorption coefficients are not knowable to better than ±0.05 even between
 * accredited laboratories (`ABSORPTION_SD_R`), and the deviation is systematic
 * per-lab bias rather than noise that averages away. For perceptual accuracy
 * that is a hard floor. For TRAINING DATA it inverts: a model fitted to one
 * precise coefficient overfits it, and what you actually want is coverage of
 * the plausible range. Sampling within the measured spread IS domain
 * randomization, with an empirically grounded distribution instead of an
 * invented one.
 *
 * So a batch varies the seed *and* the material draw, and records both — a
 * sample whose generating parameters are unknown is not training data, it is
 * just audio.
 */
import { type RoomSurface } from '../spatial/RoomAcoustics.js';
import type { ListenerKeyframe } from './ListenerPath';
export interface BatchVariant {
    /** Index within the batch, 0-based. */
    index: number;
    /** RNG seed for this render — pass as `RenderOptions.seed`. */
    seed: number;
    /**
     * Material perturbation for this render, in units of ABSORPTION_SD_R.
     * 0 is the published coefficients; ±1 is one between-lab deviation.
     */
    materialK: number;
    /** Listener path for this render, when the batch varies it. */
    listenerPath?: ListenerKeyframe[];
}
export interface BatchOptions {
    /** How many variants to generate. */
    count: number;
    /** Base seed; variant seeds are derived deterministically from it. */
    seed?: number;
    /**
     * Half-width of the material sweep in SD_R units. 0 disables material
     * randomization (every variant uses the published coefficients).
     */
    materialSpread?: number;
    /** Called per variant to build its listener path. */
    listenerPathFor?: (index: number, count: number) => ListenerKeyframe[];
}
/**
 * Plan a batch. Pure — it decides the parameters, the caller does the
 * rendering, so a batch can be inspected, logged or resumed without touching
 * audio.
 *
 * The material sweep is deterministic and evenly spaced across
 * [−spread, +spread] rather than randomly sampled: with the small N a corpus
 * build actually uses, random draws leave gaps and clump, and stratified
 * coverage of a known range is what domain randomization wants anyway.
 */
export declare function planBatch(options: BatchOptions): BatchVariant[];
/** Apply a variant's material draw to a room's surfaces. */
export declare function surfacesForVariant(surfaces: RoomSurface[], variant: BatchVariant): RoomSurface[];
/**
 * The manifest a corpus needs alongside its audio: what every sample was
 * generated from. Written beside the renders so a training run can filter,
 * stratify, or reproduce any single sample.
 */
export declare function batchManifestJson(variants: BatchVariant[], scriptHash: string): string;
//# sourceMappingURL=BatchRender.d.ts.map