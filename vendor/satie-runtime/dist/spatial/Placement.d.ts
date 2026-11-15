/**
 * Semantic spatial vocabulary for Satie.
 *
 * Maps human/AI-friendly placement words (sector × depth × height × extent) and
 * motion archetypes (drift, dart, pass, …) onto the engine's existing fields
 * (areaMin/areaMax + wanderType + wanderHz + noise). This is the deterministic
 * "compile" step: the model reasons in these words, the parser turns them into
 * coordinates the same way every time, so related elements stay spatially coherent.
 *
 * Frame: listener at the origin, +Z = ahead/forward, +X = right, +Y = up.
 * This is Satie's SCENE frame — shared by scripts, the viewport, world
 * grounding and the AI prompts. Note it differs from Web Audio's listener
 * frame (−Z = front): live playback is unaffected because the camera drives
 * the listener, but offline render/export must convert at the boundary via
 * VoicePositions.toPlaybackFrame (z → −z) or a format-specific axis map.
 * Distances are kept inside the ~1–8 m range the engine treats as musical.
 */
import { Vec3, WanderType } from '../core/Statement.js';
export type Sector = 'ahead' | 'behind' | 'left' | 'right' | 'ahead-left' | 'ahead-right' | 'behind-left' | 'behind-right' | 'surround' | 'overhead';
export type Depth = 'near' | 'mid' | 'far';
export type Height = 'low' | 'level' | 'high' | 'sky';
export type Extent = 'narrow' | 'wide' | 'surround';
export declare const SECTORS: Set<string>;
export declare const DEPTHS: Set<string>;
export declare const HEIGHTS: Set<string>;
export declare const EXTENTS: Set<string>;
/**
 * Resolve a semantic placement into a coordinate box (areaMin/areaMax).
 * Pure and deterministic — same words always yield the same region.
 */
export declare function resolvePlacement(sector: Sector, depth: Depth, height?: Height, extent?: Extent): {
    min: Vec3;
    max: Vec3;
};
/** A motion archetype: how a voice moves, decoupled from where it sits. */
export interface MotionSpec {
    wanderType: WanderType;
    hz: number;
    noise: number;
    /** For Custom (line) trajectories produced by pass/approach/recede. */
    customName?: string;
    /** Region used when the voice has no explicit `place`. */
    defaultPlace: [Sector, Depth, Height, Extent];
}
/**
 * Semantic motion verbs → engine motion. Bounds come from `place` when present;
 * otherwise `defaultPlace` gives a sensible region for the archetype.
 */
export declare const SEMANTIC_MOTIONS: Record<string, MotionSpec>;
export declare function isSemanticMotion(verb: string): boolean;
/** The default region for a motion verb when the voice has no explicit `place`. */
export declare function defaultRegionFor(spec: MotionSpec): {
    min: Vec3;
    max: Vec3;
};
//# sourceMappingURL=Placement.d.ts.map