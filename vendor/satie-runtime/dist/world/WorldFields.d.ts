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
import { type RealizedWorld } from './worldRealize.js';
export interface FieldSample {
    /** Liquid depth of the water column at (x, z), metres; 0 on dry ground. */
    depth: number;
    /** 0 (in air) → 1 (fully under): how far the sampled height y lies beneath the liquid surface. */
    submerged: number;
    /** 1 when (x, z) lies on a liquid feature, else 0. */
    liquid: number;
    /** Free-text surface material at (x, z); null when the world cannot say. */
    surface: string | null;
}
/** Something that can measure the fields at a point (allocation-free: writes into `out`). */
export interface FieldProvider {
    sampleInto(x: number, y: number, z: number, out: FieldSample): void;
}
/**
 * A head is "fully under" this far below the surface — the ramp over which
 * `submerged` runs 0 → 1, so breaking the surface reads as a crossfade, not a
 * switch. Was the viewport's medium probe constant before the engine took
 * the measurement over.
 */
export declare const HEAD_UNDER_M = 0.3;
/** The numeric fields an event payload carries and the listener publishes as signals. */
export declare const FIELD_SIGNALS: readonly (keyof Pick<FieldSample, 'depth' | 'submerged' | 'liquid'>)[];
export declare function newFieldSample(): FieldSample;
export declare function clearFieldSample(out: FieldSample): void;
/**
 * Water column at (x, z): the liquid feature's surface level there minus the
 * terrain it was carved into, metres. 0 where no liquid feature lies under
 * the point, or where the bed rises above the surface (a bank).
 */
export declare function liquidDepthAt(world: RealizedWorld, x: number, z: number): number;
/** How far a point at height y sits under the liquid surface at (x, z), 0..1 over `HEAD_UNDER_M`. */
export declare function submergedAt(world: RealizedWorld, x: number, y: number, z: number): number;
/** The world's own material text at (x, z): a feature's surface, else the ground layer. */
export declare function surfaceAt(world: RealizedWorld, x: number, z: number): string;
/** A provider over a realized procedural world. One feature lookup per sample. */
export declare function proceduralFields(world: RealizedWorld): FieldProvider;
//# sourceMappingURL=WorldFields.d.ts.map