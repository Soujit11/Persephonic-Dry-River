/**
 * Where a scene's sounds sit on the library map (docs/specs/015-edit-panel). A sound whose take is a
 * library recording sits on that recording. A generated sound has no map position of its own, so it
 * sits among the recordings its words match best (name and tags), and those are its neighbours: the
 * candidates the panel names when you zoom in. Pure, so it is tested without a browser.
 */
/** One library recording on the map (the `/__satie/landscape` row). */
export interface MapSound {
    id: string;
    /** Library name (also the clip token). */
    n: string;
    x: number;
    y: number;
    /** Hover snippet path in the public bucket, null when not cut yet. */
    s: string | null;
    /** Full file path in the public bucket. */
    f: string;
    t: string[];
    d: number | null;
    l: string;
    /** The library's description of it, when it has one. */
    ds?: string;
}
/** A library map normalised to [0, 1] on both axes, with a word index for matching. */
export interface MapIndex {
    sounds: MapSound[];
    /** Normalised positions, interleaved x, y. */
    xy: Float32Array;
    byId: Map<string, number>;
    /** word → indices of the recordings whose name or tags contain it. */
    words: Map<string, number[]>;
}
/** Words worth matching on: lower case, no stop words, a plural reduced to its singular. */
export declare function wordsOf(text: string): string[];
/** A library description as the card shows it: its production notes left out, the rest as written. */
export declare function plainDescription(text: string): string;
export declare function indexMap(sounds: MapSound[]): MapIndex;
/** The recordings that best match these words, best first (rare words count most). */
export declare function matches(ix: MapIndex, text: string, limit?: number): Array<{
    i: number;
    score: number;
}>;
/** Where a sound sits, and its neighbours (library indices, best first). */
export interface Placed {
    u: number;
    v: number;
    near: number[];
    exact: boolean;
}
/**
 * A sound's place: on its own library take when it has one, else the weighted middle of the best few
 * matches for its words (and name). Null when nothing matches at all.
 */
export declare function placeSound(ix: MapIndex, s: {
    name: string;
    words: string | null;
    takes: Array<{
        sampleId: string | null;
        name: string;
    }>;
}): Placed | null;
/** The shortest tree joining points (Prim's): the bubble a thing draws round its sounds. */
export declare function spanningTree(pts: ReadonlyArray<readonly [number, number]>): Array<[number, number]>;
/** A group of search answers that sit together on the map, named by the words they share. */
export interface Cluster {
    label: string;
    idx: number[];
    u: number;
    v: number;
    r: number;
}
/**
 * The library's answers to a search, grouped where they sit on the map (2026-11-13): answers closer than `gap` join one
 * group (single linkage), the one with the best answer first, each named by the words its recordings share most that the search did not
 * say ("propeller", "jet flyby"), so you can tell the groups apart and go to the one you want. Pure.
 */
export declare function clusterResults(ix: MapIndex, idx: readonly number[], words: string, gap?: number): Cluster[];
//# sourceMappingURL=place.d.ts.map