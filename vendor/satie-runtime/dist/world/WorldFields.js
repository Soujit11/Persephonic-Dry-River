/**
 * World fields — what the world IS at a point, measured, for anything that
 * has to react to it. Three consumers ask the same question:
 *
 *   the listener — what medium is my head in, how deep is the water under my
 *                  feet (published as the `submerged` / `depth` / `liquid`
 *                  signals every spatial tick);
 *   a voice      — does my source sit under a liquid surface (so the
 *                  air/water interface loss applies between it and a listener
 *                  in the other medium);
 *   an event     — what did this footstep land on, and how deep (the payload
 *                  of `fireEvent` is enriched with the fields at its point, so
 *                  `on step when depth 0.4to1.3 gen …` selects the wading take
 *                  and `{text}` names the surface).
 *
 * A field is a MEASUREMENT of geometry, never knowledge: `depth` is the water
 * column at (x, z) in metres, `submerged` how far a point at height y is
 * beneath a liquid surface (0..1 over HEAD_UNDER_M), `surface` the world's own
 * free-text material there. A procedural world answers from its realized
 * features (`proceduralFields`); a captured world (Marble) answers through a
 * provider the UI registers from its survey grid + collider. The engine only
 * ever asks a `FieldProvider` — it does not know which kind of world it is
 * standing in, nor what "water" means beyond a surface a body sinks below.
 */
import { featureAt, featureSurfaceYAt, heightAt, materialAt } from './worldRealize.js';
/**
 * A head is "fully under" this far below the surface — the ramp over which
 * `submerged` runs 0 → 1, so breaking the surface reads as a crossfade, not a
 * switch. Was the viewport's medium probe constant before the engine took
 * the measurement over.
 */
export const HEAD_UNDER_M = 0.3;
/** The numeric fields an event payload carries and the listener publishes as signals. */
export const FIELD_SIGNALS = ['depth', 'submerged', 'liquid'];
export function newFieldSample() {
    return { depth: 0, submerged: 0, liquid: 0, surface: null };
}
export function clearFieldSample(out) {
    out.depth = 0;
    out.submerged = 0;
    out.liquid = 0;
    out.surface = null;
}
/**
 * Water column at (x, z): the liquid feature's surface level there minus the
 * terrain it was carved into, metres. 0 where no liquid feature lies under
 * the point, or where the bed rises above the surface (a bank).
 */
export function liquidDepthAt(world, x, z) {
    const f = featureAt(world, x, z);
    if (!f || !f.liquid)
        return 0;
    const d = featureSurfaceYAt(f, x, z) - heightAt(world.heightfield, x, z);
    return d > 0 ? d : 0;
}
/** How far a point at height y sits under the liquid surface at (x, z), 0..1 over `HEAD_UNDER_M`. */
export function submergedAt(world, x, y, z) {
    const f = featureAt(world, x, z);
    if (!f || !f.liquid)
        return 0;
    const under = (featureSurfaceYAt(f, x, z) - y) / HEAD_UNDER_M;
    return under < 0 ? 0 : under > 1 ? 1 : under;
}
/** The world's own material text at (x, z): a feature's surface, else the ground layer. */
export function surfaceAt(world, x, z) {
    const f = featureAt(world, x, z);
    return f ? f.material : materialAt(world, x, z);
}
/** A provider over a realized procedural world. One feature lookup per sample. */
export function proceduralFields(world) {
    return {
        sampleInto(x, y, z, out) {
            const f = featureAt(world, x, z);
            if (f && f.liquid) {
                const surfaceY = featureSurfaceYAt(f, x, z);
                const d = surfaceY - heightAt(world.heightfield, x, z);
                out.depth = d > 0 ? d : 0;
                const under = (surfaceY - y) / HEAD_UNDER_M;
                out.submerged = under < 0 ? 0 : under > 1 ? 1 : under;
                out.liquid = 1;
            }
            else {
                out.depth = 0;
                out.submerged = 0;
                out.liquid = 0;
            }
            out.surface = f ? f.material : materialAt(world, x, z);
        },
    };
}
//# sourceMappingURL=WorldFields.js.map