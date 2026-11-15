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
import { perturbAbsorption } from '../spatial/RoomAcoustics.js';
const DEFAULT_MATERIAL_SPREAD = 1;
/**
 * Deterministic integer hash — a variant's seed must depend only on the base
 * seed and its index, never on iteration order or wall-clock time, or a batch
 * cannot be regenerated and the corpus stops being reproducible.
 */
function hashVariantSeed(base, index) {
    let h = (base ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (index + 0x85ebca6b), 0xcc9e2d51) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x1b873593) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
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
export function planBatch(options) {
    const count = Math.max(0, Math.floor(options.count));
    const base = options.seed ?? 0;
    const spread = options.materialSpread ?? DEFAULT_MATERIAL_SPREAD;
    const variants = [];
    for (let i = 0; i < count; i++) {
        // Evenly spaced over the spread; a single-variant batch sits at nominal.
        const u = count === 1 ? 0.5 : i / (count - 1);
        variants.push({
            index: i,
            seed: hashVariantSeed(base, i),
            materialK: spread === 0 ? 0 : (u * 2 - 1) * spread,
            listenerPath: options.listenerPathFor?.(i, count),
        });
    }
    return variants;
}
/** Apply a variant's material draw to a room's surfaces. */
export function surfacesForVariant(surfaces, variant) {
    return variant.materialK === 0 ? surfaces : perturbAbsorption(surfaces, variant.materialK);
}
/**
 * The manifest a corpus needs alongside its audio: what every sample was
 * generated from. Written beside the renders so a training run can filter,
 * stratify, or reproduce any single sample.
 */
export function batchManifestJson(variants, scriptHash) {
    return JSON.stringify({
        format: 'satie-batch/1',
        scriptHash,
        count: variants.length,
        variants: variants.map((v) => ({
            index: v.index,
            seed: v.seed,
            materialK: Number(v.materialK.toFixed(4)),
            listenerKeyframes: v.listenerPath?.length ?? 0,
        })),
    }, null, 2);
}
//# sourceMappingURL=BatchRender.js.map