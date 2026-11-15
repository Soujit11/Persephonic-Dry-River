/**
 * Every product noun the mixer, its chat and the edit panel show, in one table (Huanxing's product
 * model, brain/projects/satie-product-model.md, Part 2b, 2026-11-11). Change a word here, not in a
 * string. Code identifiers keep their old names (`version`, `variants`, `bank`, `place`).
 *
 *   world › soundscape › sound and its takes
 */
export const WORDS = {
    /** The macro level: the whole game. */
    world: ['world', 'worlds'],
    /** The meso level: a self-contained ecology of sounds in a world. Was "place", briefly "site". */
    soundscape: ['soundscape', 'soundscapes'],
    /** The micro level: one sound (an entity), heard through its takes. */
    sound: ['sound', 'sounds'],
    /** One recording a sound plays. The mixer used to call these "versions". */
    take: ['take', 'takes'],
    /** An alternative set of takes for a sound, or of sounds for a soundscape. Was "version". */
    variant: ['variant', 'variants'],
    /** A composed work in the web app's Chat. Was "soundscape". */
    piece: ['piece', 'pieces'],
    /** A game object a sound is on (the contract's object). Not "place", which now means soundscape. */
    thing: ['thing', 'things'],
    /** One step in history (what undo takes back). Not "version", which now means variant. */
    change: ['change', 'changes'],
};
/** The singular or plural of a word for `n` of it: `word('take', 2)` → "takes". */
export const word = (w, n = 1) => WORDS[w][n === 1 ? 0 : 1];
/** A count and its word: `count(3, 'take')` → "3 takes". */
export const count = (n, w) => `${n} ${word(w, n)}`;
/** Words the product no longer shows, and what replaced them (the words test fails on them in the mixer's strings). */
export const RETIRED = {
    site: 'soundscape',
    version: 'take (one recording), variant (an alternative set) or change (a step in history)',
    'the place': 'the soundscape (the meso level) or the thing (an object)',
};
//# sourceMappingURL=words.js.map