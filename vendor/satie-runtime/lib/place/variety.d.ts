import { type PlaceDef, type PlaceMove, type PlaceVersion } from './place.js';
import { type VariantPlanner } from './plan.js';
/** One recording the library offers for a sound. */
export interface LibraryTake {
    clip: string;
    sampleId?: string;
    url?: string;
    name?: string;
    license?: string;
    attribution?: string | null;
}
export interface VariantLibrary {
    /**
     * Up to `limit` recordings near `clip` in the library, none of `shown` (clips this sound already
     * had in a variant). `loop`: only ones long enough to loop.
     */
    near(req: {
        soundscape: string;
        sourceId: string;
        clip: string;
        loop: boolean;
        shown: string[];
        limit: number;
    }): Promise<LibraryTake[]>;
    /** Make a take playable before a variant uses it (load its audio). False: leave it out. */
    prepare?(take: LibraryTake): Promise<boolean>;
}
/** Steady sounds re-picked per new variant, at most: few enough that it stays near the one it came from. */
export declare const REPICKS_PER_VARIANT = 3;
/** Events re-picked per new variant, at most (an accent; never counted toward the band). */
export declare const EVENT_ACCENTS = 1;
/** A level change this large (dB) counts as the whole sound changed, in `variantDistance`. */
export declare const FULL_CHANGE_DB = 6;
/** The least change to how loud the outside comes in that a variant makes (dB): less is not heard. */
export declare const LEAST_OUTSIDE_DB = 3;
/** Where a variant's distance from the one it came from should sit (share of the steady sound). Unverified. */
export declare const VARIETY_BAND: {
    readonly min: 0.15;
    readonly max: 0.6;
};
/** One re-pick: this sound plays this recording instead. */
export interface Repick {
    id: string;
    take: LibraryTake;
    accent?: boolean;
}
/** One new variant's plan: its re-picks, and its moves on how loud the world layer is heard here. */
export interface VaryPlan {
    picks: Repick[];
    moves: PlaceMove[];
}
/**
 * The plans for `count` new variants near a variant, as it sounds in `heardAs`. Re-pick candidates
 * are the soundscape's own sounds playing there, unlocked, with one recording (a take bank keeps its
 * own). For each new variant, in turn:
 *   1. its own steady sounds, loudest first, sounds no earlier new variant re-picked first, at most
 *      `REPICKS_PER_VARIANT`, skipping one that would take it past the band's top, until it reaches
 *      the band's bottom;
 *   2. short of it, how loud the outside comes in (every unlocked world-layer steady sound on the
 *      soundscape's signal, louder in the first new variant, quieter in the second, at least
 *      `LEAST_OUTSIDE_DB`), when the soundscape has a signal;
 *   3. still short, the one loud own steady sound that reaches it, alone (an audible change beats
 *      an inaudible one);
 *   4. one event, as an accent, loudest first among those no earlier new variant re-picked.
 * A sound never gets a recording in `had(id, clip)`.
 */
export declare function varyNear(opts: {
    soundscape: string;
    place: PlaceDef;
    heardAs: string;
    world?: ReadonlySet<string>;
    held?: ReadonlySet<string>;
    had?: (sourceId: string, playsNow: string) => string[];
    library: VariantLibrary;
    count: number;
}): Promise<VaryPlan[]>;
/** A new variant's moves: the one it came from, with this plan's re-picks and outside levels in place of its own. */
export declare function movesWithPlan(like: readonly PlaceMove[], plan: VaryPlan): PlaceMove[];
/** A variants-only file (`readSoundscapes` reads it; the soundscapes come from the script's blocks). */
export interface PresetFile {
    version: 'satie.soundscapes/1';
    versions: PlaceVersion[];
    /** The library recordings the variants use, by clip: the mixer loads them and writes one to `samples.json` when a variant using it is kept. */
    takes: Record<string, LibraryTake>;
    /** What the planner asked for that was refused or left out, and why (for the summary and the tests; the mixer ignores it). */
    notes?: string[];
}
/**
 * A planned variant changing less than this share of the steady sound, and adding no sound, is too
 * timid to offer (Huanxing, 2026-11-12: a shrine variant at 1 to 4 dB passed 10% and was the same
 * place by ear). Unverified.
 */
export declare const AUDIBLE_STEP = 0.25;
/** Two planned variants closer than this (and with the same moments changed) are one variant. */
export declare const APART_MIN = 0.05;
/**
 * Variants 2 and 3 (by default) of every soundscape, near its first draft: what the compose step
 * writes beside the script. Library only, so nothing is generated or charged; a soundscape the rule
 * finds nothing for gets fewer. `prepare`, when the library has it, may refuse a take (no audio to
 * fetch), which leaves it out.
 */
export declare function presetVariants(script: string, soundscapes: {
    places: readonly PlaceDef[];
    world?: readonly string[];
}, library: VariantLibrary, opts?: {
    count?: number;
    planner?: VariantPlanner;
}): Promise<PresetFile>;
/** How far apart two scripts are in one soundscape. */
export interface Distance {
    /** The share of the soundscape's steady sound that differs, 0..1 (power-weighted by level as heard there). */
    share: number;
    /** The steady sounds that differ (a new recording, gone or back, or heard at another level). */
    sounds: string[];
    /** The events with another recording, or gone or back: moments, not counted in `share`. */
    events: string[];
}
/**
 * How much of what plays all the time in `place` differs between two scripts, weighted by
 * loudness: its own steady sounds and, with `world`, the world layer as heard there (`heard_in` on
 * the soundscape's signal). A new recording or a sound gone counts in full; a level change in
 * proportion up to `FULL_CHANGE_DB`. A sound without a stated level weighs as the average of the
 * others. Events are listed, not weighed: they are rare, however loud. Pure.
 */
export declare function variantDistance(a: string, b: string, soundscape: PlaceDef, world?: readonly string[]): Distance;
//# sourceMappingURL=variety.d.ts.map