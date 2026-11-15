import type { Statement } from '../core/Statement.js';
import type { EntityDef } from '../core/Entities.js';
import type { LibraryTake } from './variety.js';
/**
 * One place: which sounds are its own. Every sound belongs to one place or to the world layer
 * (weather, time-of-day insects, a passing train: sounds that are everywhere). Membership is
 * authored (the game's rooms, and the places the composer names), never computed (spec 014).
 */
export interface PlaceDef {
    /** The place's name in the script; versions are keyed on it. */
    id: string;
    /** What the developer reads ("The crossing"); never "scene". */
    label: string;
    /** The sounds that are this place's own, by `source_id`. */
    sourceIds: string[];
    /** The placed rooms this place is made of (a house can be several rooms); their boxes are its walls on the map. */
    rooms?: string[];
    /** spec 014: enclosed (rooms), open (the share signal), moving (a box that travels). */
    kind?: 'enclosed' | 'open' | 'moving';
    /** spec 014: the signal that says how much you are in it (`in_<id>`, 0..1). */
    signal?: string;
    /** spec 014: its own beds, a subset of sourceIds. */
    beds?: string[];
    /** spec 014: the objects it is made of (manifest ids); a variant may add a sound `at` one of them. */
    objects?: string[];
    /** What kind of place it is, in a few words, no proper nouns (the block's `share`), for the planner. */
    share?: string;
    /** Why it is its own soundscape (the block's `why`), for the planner. */
    why?: string;
}
/** A move a version makes. Positions are never moved: they belong to the world. */
export type PlaceMove = {
    op: 'level';
    sound: string;
    db: number;
} | {
    op: 'silence';
    sound: string;
} | {
    op: 'restore';
    sound: string;
} | {
    op: 'density';
    sound: string;
    factor: number;
} | {
    op: 'take';
    sound: string;
    clip: string;
} | {
    op: 'swap';
    sound: string;
    clip?: string;
    genPrompt?: string;
}
/**
 * How loud a world-layer sound is heard in this soundscape (dB, weighted by `signal`; `!name` is
 * 1 minus it). Never which recording plays: the world layer is shared (Huanxing, 2026-11-11).
 */
 | {
    op: 'world';
    sound: string;
    signal: string;
    db: number;
}
/** `null` removes the field (an inverse of a move on a room that did not state it). */
 | {
    op: 'room';
    room: string;
    rt60?: number | null;
    walls?: string | null;
}
/**
 * A new voice: a copy of `like` (its kind, timing, level and position) playing `clip`, `at` an
 * object when given, `db` louder or quieter than `like`, `every` [min, max] seconds for an event.
 */
 | {
    op: 'add';
    sound: string;
    like: string;
    clip: string;
    at?: string;
    db?: number;
    every?: [number, number];
}
/** Take a voice out of the script (the inverse of `add`). */
 | {
    op: 'drop';
    sound: string;
}
/** Put a voice block back as written, after `after`'s block when it is there (the inverse of `drop`). */
 | {
    op: 'insert';
    sound: string;
    block: string;
    after?: string;
}
/** How many instances play at once (`N *`, 1 to 8): more birds in the grove. On a group's sound, how many the group has (its `count`, 1 to 24). */
 | {
    op: 'count';
    sound: string;
    n: number;
}
/** Each instance's playback rate drawn from this range (1 = as recorded): instances that differ; null removes it. */
 | {
    op: 'pitch';
    sound: string;
    range: [number, number] | null;
};
/** Instances one voice may have in a variant. */
export declare const MAX_INSTANCES = 8;
/** Bodies a group Satie spawns (a population `entity`) may have in a variant: three crows become a flock. */
export declare const MAX_GROUP = 24;
/** How many of a sound play at once: its `N *` instances, or the size of the population it belongs to. */
export declare function instancesOf(stmts: readonly Statement[], sourceId: string, entities: readonly EntityDef[]): number;
export interface PlaceVersion {
    id: string;
    place: string;
    /** The version it was made from (More like this), null for the first draft. */
    parent: string | null;
    round: number;
    /** Its number in the switcher (1 2 3, then 4 2 5 after More like 2). Given by the controller; never reused. */
    n?: number;
    /** One line for the switcher: how it differs, in sounds ("fridge up, clock gone"). */
    why: string;
    /** What a person would call it ("Evening comes in"), when a planner named it. */
    label?: string;
    moves: PlaceMove[];
}
/**
 * The soundscape list the controller reads. Prototype file: `satie.places/1` (key `places`), or
 * the world-correctness format `satie.soundscapes/1` (key `soundscapes`, spec 014), read through
 * `readSoundscapes`. Variants ride in `versions` until they are generated.
 */
export interface PlacesFile {
    version: 'satie.places/1';
    places: PlaceDef[];
    versions: PlaceVersion[];
    /** The world layer: sounds about equally loud everywhere (the time-of-day beds). No variant touches them. */
    world?: string[];
    /** The player's own sounds (they travel with the listener): no soundscape, not the world layer. */
    player?: string[];
    /** Library recordings the variants use, by clip (`presetVariants`): loaded at mount, written to samples.json when kept. */
    takes?: Record<string, LibraryTake>;
}
export interface Applied {
    script: string;
    /** Moves that could not be written (their sound is gone, or the value cannot be read); named, not hidden. */
    dropped: PlaceMove[];
    /** The moves that undo what was applied, in order: `applyMoves(result, inverse)` gives the input back. */
    inverse: PlaceMove[];
}
/** Apply a version's moves to a script, in order. Version 1 (no moves) is the script itself. */
export declare function applyMoves(script: string, moves: readonly PlaceMove[]): Applied;
/** The place whose own sounds include this one, if any. */
export declare function placeOfSound(places: readonly PlaceDef[], sound: string): PlaceDef | null;
/**
 * A `soundscape <id>` block as the script declares it (spec 014, world correctness: the parser's
 * `SceneSoundscape`). Restated structurally here so this module reads the blocks without depending
 * on the world-correctness branch; a block of `kind world` lists the world layer.
 */
export interface SoundscapeBlock {
    id: string;
    label?: string;
    kind?: 'open' | 'enclosed' | 'moving' | 'world';
    regions?: string[];
    rooms: string[];
    objects: string[];
    sounds: string[];
    follows?: string;
    why?: string;
    share?: string;
}
/**
 * The soundscapes a script's `soundscape` blocks declare, each sound given to one of them. With
 * `ownerOf` (the engine's `soundscapeOf`, spec 014) the engine decides; without it, the
 * world-correctness reading (`soundscapesOf`): a listed `source_id` first, then an object it plays
 * `at`, then the `in <room>` it sits in. Sounds in a `kind world` block, and beds or fields no
 * soundscape claims, are the world layer. `player` names the player's own sounds, which belong to
 * none. Null when the script declares no soundscape.
 */
export declare function soundscapesFromBlocks(statements: readonly Statement[], blocks: readonly SoundscapeBlock[], player?: readonly string[], ownerOf?: (st: Statement) => string | null): {
    places: PlaceDef[];
    world: string[];
    player: string[];
} | null;
/** The versions of one place, in order: the first draft (no moves) first. */
export declare function versionsOf(file: PlacesFile, place: string): PlaceVersion[];
/**
 * Read a variants file into the controller's shape: `satie.places/1` or `satie.soundscapes/1`, with
 * or without its own soundscape list (without one, the script's `soundscape` blocks supply it).
 */
export declare function readSoundscapes(raw: unknown): PlacesFile | null;
//# sourceMappingURL=place.d.ts.map