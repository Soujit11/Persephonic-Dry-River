import type { Statement } from '../core/Statement.js';
import { type PlaceDef, type PlaceMove } from './place.js';
import type { LibraryTake, VariantLibrary } from './variety.js';
/** One sound as the planner reads it. */
export interface InventorySound {
    id: string;
    /** What it is: its library name or its generation prompt, in words. */
    is: string;
    /** steady: plays all the time; moment: the game or a timer starts it (a door, a bell, a crow every half minute). */
    role: 'steady' | 'moment';
    db: number | null;
    /** Seconds between plays, for a timed moment. */
    every?: [number, number];
    instances: number;
    at?: string;
    /** What in the game drives it (an event, a signal it follows to silence): the game's, never a variant's. */
    drivenBy?: string;
    /** The state it plays only in (the dusk state, the rain): the game decides whether and when, the cast is Satie's. */
    playsOnlyIn?: string;
    /** It belongs to a group Satie spawns (an `entity`): a flock of `n` at their perches, or bodies passing along a route. */
    group?: {
        id: string;
        kind: 'population';
        n: number;
    } | {
        id: string;
        kind: 'route';
        every: [number, number];
    };
}
/** What one soundscape is, for the planner. */
export interface SoundscapeInventory {
    id: string;
    label: string;
    kind?: string;
    share?: string;
    why?: string;
    sounds: InventorySound[];
    /** Its objects; `quiet` are the ones with no sound yet. */
    objects: string[];
    quiet: string[];
    /** The world layer as heard here (`outside` moves change all of it, or one that the game does not drive). */
    outside: Array<{
        id: string;
        is: string;
        db: number | null;
        drivenBy?: string;
        playsOnlyIn?: string;
    }>;
    rooms: Array<{
        name: string;
        rt60?: number;
        walls?: string;
    }>;
    /** The conditions the world already has (weather, hour, crowd, traffic...): the only ones a variant may lean on. */
    conditions: string[];
}
/** One change a planner asks for, in its own terms. Ids are the inventory's. */
export type PlannedChange = {
    op: 'level';
    id: string;
    db: number;
} | {
    op: 'often';
    id: string;
    factor: number;
} | {
    op: 'leave_out';
    id: string;
} | {
    op: 'bring_back';
    id: string;
} | {
    op: 'replace';
    id: string;
    query: string;
} | {
    op: 'retake';
    id: string;
} | {
    op: 'add';
    query: string;
    like: string;
    at?: string;
    db?: number;
    every?: [number, number];
} | {
    op: 'instances';
    id: string;
    n: number;
} | {
    op: 'spread';
    id: string;
    semitones: number;
}
/** How loud the world comes in here: all of it, or one world sound by `id` (the evening chorus up, the afternoon down). */
 | {
    op: 'outside';
    db: number;
    id?: string;
} | {
    op: 'room';
    room: string;
    rt60_factor: number;
};
export interface PlannedVariant {
    /** What a person would call it, 2 to 5 words ("Evening comes in"). */
    label: string;
    /** What you would hear, one line. */
    line?: string;
    changes: PlannedChange[];
}
/**
 * Whether each recording the library offered is the sound that was asked for, in order: the same
 * kind of source, not one that only sounds alike (run 6: a door knock offered for a hollow bamboo
 * knock, slippers on hardwood for steps on stone). A model's judgment; see `src/lib/ai/variantPlan.ts`.
 */
export type TakeVetter = (asks: ReadonlyArray<{
    asked: string;
    clip: string;
    name?: string;
}>) => Promise<boolean[]>;
/**
 * A variant's name and line again, saying only what the changes left do (run 7: "Birdier valley"
 * promised reeds and the insects gone, neither of which could be made). It names, never judges:
 * whether enough is left is the count's to say (run 9: a model judge dropped "More frogs" for
 * two refused crow changes). A model's call; see variantPlan.ts.
 */
export type Reworder = (v: {
    label: string;
    line: string;
    left: readonly PlannedChange[];
    refused: readonly PlannedChange[];
    /** What each of the soundscape's own sounds is, and what is heard there that no variant changes (the world as heard there). */
    sounds?: ReadonlyArray<{
        id: string;
        is: string;
    }>;
    untouched?: readonly string[];
}) => Promise<{
    label: string;
    line: string;
}>;
/**
 * The planner: up to `count` variants of one soundscape. `vet`, when it has one, checks the
 * library's picks; `reword` names a variant again for what is left of it.
 */
export type VariantPlanner = ((inventory: SoundscapeInventory, count: number) => Promise<PlannedVariant[]>) & {
    vet?: TakeVetter;
    reword?: Reworder;
};
export declare const namesPeople: (text: string) => boolean;
/** Seasons: what time of year a world is, not a state its game switches; a name may say the one it has. */
export declare const SEASONS: readonly string[];
/** The conditions a script already has: in its sounds, its prompts, its soundscapes and its zones. */
export declare function conditionsIn(script: string): string[];
/** The conditions `text` names that are not in `have`. */
export declare function newConditions(text: string, have: readonly string[]): string[];
/** A soundscape's own presence signal (`in_<soundscape>`, spec 014): Satie's, never the game's. */
export declare const isSatieSignal: (signal: string) => boolean;
export declare const isWorldSignal: (signal: string) => boolean;
/** A signal the game itself sets (a train's speed, the crossing bells): neither Satie's nor the world's state. */
export declare const isGameSignal: (signal: string) => boolean;
/**
 * What in the game starts or switches a sound, or null (Huanxing, 2026-11-12: the game decides what
 * happens, physics how sound travels, and a variant only the cast of sounds Satie designs). The game
 * drives an `on <event>` voice, a `when` gate on a game signal, and a volume it can turn down to
 * silence (the crossing bells, the train). A variant gives such a sound only another recording. A
 * follow that only shapes a sound (the wind swaying the bamboo, never silent) and anything on
 * Satie's own `in_<soundscape>` signal are not the game: the recording and the base level are
 * Satie's to vary. A sound that plays only in a state (`gatedBy`) is not driven either.
 */
export declare function drivenBy(st: Statement): string | null;
/**
 * The state a sound plays only in, or null: a `zone` (the dusk frogs, the afternoon cicadas), or a
 * gate on the world's own hour or weather (Huanxing, 2026-11-13). The game decides whether and when
 * it plays, so a variant never leaves it out or brings it back; while it plays it is ambience like
 * any other, so how many, how loud, which recording and what else lives there then are Satie's.
 */
export declare function gatedBy(st: Statement): string | null;
/** A level change smaller than this (dB) is not heard as a different place: a planned one is raised to it. */
export declare const LEAST_HEARD_DB = 4;
/** An added sound quieter than this under the sound it is built like is not heard: a planned one is raised to it. */
export declare const ADD_FLOOR_DB = -12;
/** What one soundscape is, read from the script, for the planner. */
export declare function inventoryOf(script: string, place: PlaceDef, world?: readonly string[]): SoundscapeInventory;
/** A plan turned into moves: what was written, what it needs from the library, and what was refused and why. */
export interface Resolved {
    moves: PlaceMove[];
    takes: Record<string, LibraryTake>;
    refused: Array<{
        change: PlannedChange;
        why: string;
    }>;
    /** Changes written bigger than asked, and why (a 2 dB change is raised to `LEAST_HEARD_DB`). */
    raised: Array<{
        change: PlannedChange;
        why: string;
    }>;
    /**
     * The conditions the sounds it changes play in (the frogs that sing only at dusk: evening): a
     * label or line may name them, since it describes those sounds, not a state it brings about.
     */
    states: string[];
}
/**
 * Turn one planned variant into moves on `script`, keeping it true to the world: only the
 * soundscape's own sounds change (the world layer only by how loud it is heard here), nothing
 * moves, an added sound goes at one of its objects or beside one of its sounds, no change names a
 * condition the world lacks, and a recording comes from the library or the change is refused.
 * A moment the game starts keeps its timing: the game decides when it sounds.
 */
export declare function resolvePlan(variant: PlannedVariant, ctx: {
    script: string;
    place: PlaceDef;
    world?: readonly string[];
    library?: VariantLibrary;
    soundscape?: string;
    held?: ReadonlySet<string>;
    vet?: TakeVetter;
}): Promise<Resolved>;
//# sourceMappingURL=plan.d.ts.map