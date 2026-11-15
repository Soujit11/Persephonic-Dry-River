/**
 * Place archetypes: what the engine knows about kinds of PLACE before a model
 * says anything. A brief that names one ("a forest with birds", "a beach at
 * dusk") gets a complete, playable sketch in milliseconds: the archetype owns
 * the geometry skeleton, the ambience slots that ARE the place, the life that
 * belongs there, and the dormant layers the weather sliders raise. Every
 * number comes from the catalog (`catalog.ts`); the brief adds the sources it
 * names and sets the hour and weather it states. A model refines the sketch
 * afterwards; it never gates it.
 */
import { type CatalogRow } from './catalog.js';
import { type WorldSpec } from './worldSpec.js';
export interface ArchetypeSource {
    /** Catalog row id. */
    catalog: string;
    /** A host id from the archetype's geometry, or a geometric host. */
    host: string;
    attach?: 'body' | 'top' | 'base' | 'inside';
    extent?: 'point' | 'radius' | 'ring' | 'bed' | 'line';
    /** A living population of this class, this many individuals. */
    population?: number;
    /** Silent at the described state, rising with this signal. */
    dormantOn?: 'rain' | 'wind';
    /** An event card the sketch pre-picks. */
    defaultOn?: boolean;
    /** The library bed this candidate plays (bed slot only). */
    bedClip?: string;
}
export interface Archetype {
    id: string;
    label: string;
    /** Whole-word triggers in a brief. */
    keywords: string[];
    biome: string;
    sizeM: number;
    terrain: {
        reliefM: number;
        roughness: number;
    };
    ground: {
        material: string;
        weight: number;
    }[];
    objects: Record<string, unknown>[];
    strips: Record<string, unknown>[];
    patches: Record<string, unknown>[];
    fixtures: Record<string, unknown>[];
    interior?: Record<string, unknown>;
    /** The continuous layers that are the place, in order of importance. */
    ambience: ArchetypeSource[];
    /** What lives there continuously (base slots). */
    life: ArchetypeSource[];
    /** What happens now and then (event cards), some pre-picked. */
    events: ArchetypeSource[];
    /** The other ends of the weather dimensions, declared once. */
    dormant: ArchetypeSource[];
    /** Local hour the place is described at when the brief says nothing. */
    hour: number;
    /** The library query for a whole-place ambience recording. */
    bedQuery: string;
}
export declare const ARCHETYPES: readonly Archetype[];
/** The archetype a brief names, longest keyword first, or null. */
export declare function matchArchetype(brief: string): Archetype | null;
/** Hour and weather a brief states, when it states them. */
export declare function readBriefState(brief: string): {
    hour?: number;
    rain?: number;
    wind?: number;
    fog?: number;
};
/** Catalog rows the brief names outright, beyond the archetype. */
export declare function briefSources(brief: string): CatalogRow[];
/**
 * The archetype's dormant weather material as ecology entries, for a planned
 * world: a loop that follows `rain` or `wind`, silent until the knob moves.
 * Only entries whose host the world actually has (2026-10-01: a planned cafe
 * carried no voice that followed rain, so the rain slider moved in silence).
 */
export declare function dormantWeatherEntries(a: Pick<Archetype, 'dormant'>, hostIds: ReadonlySet<string>): Record<string, unknown>[];
export interface SketchOptions {
    seed?: number;
    /** A whole-place ambience recording from the library, as a script clip token, with the level it should play at the ear. */
    bed?: {
        clip: string;
        label: string;
    };
}
/** The model interprets the brief once; code resolves these catalog ids. */
export interface SketchIntent {
    archetype: string;
    state: {
        hour?: number;
        rain?: number;
        wind?: number;
        fog?: number;
    };
    include: string[];
    exclude: string[];
    events: string[];
}
/** A card the sketch offers: the shape of a survey candidate, plus the source it stands for. */
export interface SketchCandidate {
    id: string;
    label: string;
    soundPrompt: string;
    where: string;
    slot: string;
    loop: boolean;
    detail?: string;
    splDb?: number;
    /** The exact library recording this card IS (a bed). */
    library?: string;
    libraryOrigin?: string;
    sketch: ArchetypeSource;
}
export interface SketchBedOption {
    name: string;
    label: string;
    clip: string;
    origin?: string;
}
/** A card for a catalog row on the archetype's best host, for a suggestion the model named by id. Exported for the suggest path. */
export declare function catalogCandidate(rowId: string, a: Archetype, id: string, stage: 'base' | 'events'): SketchCandidate | null;
/** A card for a source the catalog does not know: a plain voice with a stated emission on a sensible host. Exported for the suggest path. */
export declare function freeCandidate(a: Archetype, id: string, label: string, soundPrompt: string, where: string, loop: boolean, splDb?: number): SketchCandidate;
/**
 * The cards a brief's sketch offers: base slots (the library beds as one
 * slot with alternatives, then each ambience and life source, then what the
 * brief names) and event cards (the archetype's events plus what the brief
 * names that happens). Deterministic; the model is not involved.
 */
export declare function sketchCandidates(brief: string, a: Archetype, beds?: readonly SketchBedOption[], intent?: SketchIntent): {
    base: SketchCandidate[];
    events: SketchCandidate[];
};
/**
 * The spec for a set of picks over the sketch's cards, plus the archetype's
 * dormant layers. `phase` base leaves the events out. Cards the source
 * cascade resolved to a recording play that recording (`sources`).
 */
export declare function sketchSpecFromPicks(brief: string, a: Archetype, cards: {
    base: readonly SketchCandidate[];
    events: readonly SketchCandidate[];
}, picks: {
    base: readonly string[];
    events: readonly string[];
}, phase: 'base' | 'full', seed: number, sources?: Record<string, {
    kind: string;
    clip?: string;
}>, intent?: SketchIntent): {
    spec: WorldSpec;
    sources: string[];
};
/**
 * The archetype's sketch of the brief with the default picks: every base
 * card's first flavour, the pre-picked events. Exported for tests and the
 * MCP; the wizard path uses `sketchCandidates` + `sketchSpecFromPicks`.
 */
export declare function sketchSpec(brief: string, a: Archetype, opts?: SketchOptions): {
    spec: WorldSpec;
    sources: string[];
};
/** The first flavour of every base slot and the pre-picked events. */
export declare function defaultPicks(cards: {
    base: readonly SketchCandidate[];
    events: readonly SketchCandidate[];
}): {
    base: string[];
    events: string[];
};
//# sourceMappingURL=archetypes.d.ts.map