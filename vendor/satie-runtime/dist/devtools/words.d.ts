/**
 * Every product noun the mixer, its chat and the edit panel show, in one table (Huanxing's product
 * model, brain/projects/satie-product-model.md, Part 2b, 2026-11-11). Change a word here, not in a
 * string. Code identifiers keep their old names (`version`, `variants`, `bank`, `place`).
 *
 *   world › soundscape › sound and its takes
 */
export declare const WORDS: {
    /** The macro level: the whole game. */
    readonly world: readonly ["world", "worlds"];
    /** The meso level: a self-contained ecology of sounds in a world. Was "place", briefly "site". */
    readonly soundscape: readonly ["soundscape", "soundscapes"];
    /** The micro level: one sound (an entity), heard through its takes. */
    readonly sound: readonly ["sound", "sounds"];
    /** One recording a sound plays. The mixer used to call these "versions". */
    readonly take: readonly ["take", "takes"];
    /** An alternative set of takes for a sound, or of sounds for a soundscape. Was "version". */
    readonly variant: readonly ["variant", "variants"];
    /** A composed work in the web app's Chat. Was "soundscape". */
    readonly piece: readonly ["piece", "pieces"];
    /** A game object a sound is on (the contract's object). Not "place", which now means soundscape. */
    readonly thing: readonly ["thing", "things"];
    /** One step in history (what undo takes back). Not "version", which now means variant. */
    readonly change: readonly ["change", "changes"];
};
export type Word = keyof typeof WORDS;
/** The singular or plural of a word for `n` of it: `word('take', 2)` → "takes". */
export declare const word: (w: Word, n?: number) => string;
/** A count and its word: `count(3, 'take')` → "3 takes". */
export declare const count: (n: number, w: Word) => string;
/** Words the product no longer shows, and what replaced them (the words test fails on them in the mixer's strings). */
export declare const RETIRED: Record<string, string>;
//# sourceMappingURL=words.d.ts.map