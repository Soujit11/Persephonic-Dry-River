/**
 * The scene map: one picture of what a playing scene is made of, read by the mixer (its list and
 * groups) and by Satie (the text table its models read). Built by code from the parsed statements,
 * the scene contract's objects and, when the host has them, take names and live facts; nothing in
 * it is about a particular scene.
 *
 * It exists because the mixer and the director used to build two different pictures: the mixer
 * knew that two trains share one recording and that a drink belongs to the vending machine "with"
 * it; the director read raw script text and asked "northbound or southbound?".
 */
import type { Statement } from '../core/Statement';
/**
 * `# @group <name>: <source_id> …`: a group you made in the mixer, kept in the script as a metadata
 * comment (the parser skips comments, so the language does not change), so it travels with the scene
 * and goes back with undo. One line per group.
 */
export declare const GROUP_LINE: RegExp;
export interface SavedGroup {
    id: string;
    label: string;
    sourceIds: string[];
}
export declare function readGroupLines(script: string): SavedGroup[];
/** The script with exactly these groups (every old group line goes; the new ones head the script). */
export declare function writeGroupLines(script: string, groups: ReadonlyArray<{
    label: string;
    sourceIds: readonly string[];
}>): string;
/** `# @name <words>`: a sound's own name, above its block. */
export declare const NAME_LINE: RegExp;
/** The `# @name` given above each statement's block, by statement index. */
export declare function namesFromScript(script: string, statements: readonly Statement[]): Map<number, string>;
/** The id a voice is addressed by: its `source_id`, else its line (as the director has always written it). */
export declare const voiceId: (st: Pick<Statement, "sourceId" | "sourceLine">) => string;
/**
 * What a voice plays, as one key: voices with the same key play from the same takes. A recording is
 * its clip; a generated voice is its description (count copies `_1…_N` of one statement share it).
 */
export declare function audioKey(st: Pick<Statement, 'isGenerated' | 'genPrompt' | 'clip'>): string;
/** Ids that form a class (`cypress_1 … cypress_n`, two or more members), by class name, members in order. */
export declare function hostClassesOf(ids: readonly string[], exclude?: ReadonlySet<string>): Map<string, string[]>;
/**
 * The parts of one thing, by id (2026-11-12): `train_engine`, `train_horn` and `train_bogie_rear` are parts of
 * the train when one host is the train, by id (`train`) or by label (`train_body`, labelled "train"). A
 * part maps to its whole; a whole and a host with no whole are left out. `crossing_bell_north` and
 * `crossing_gate_north` stay two things: nothing is called "crossing".
 */
export declare function partsOf(hosts: ReadonlyArray<{
    id: string;
    label?: string;
}>): Map<string, string>;
export interface GroupContext {
    groups: readonly SavedGroup[];
    /** The listener's own host: an event the listener performs lives with the thing it happens "with". */
    listenerHost?: string | null;
    /** The object an event happens with (the scene contract's `events[].with`). */
    withOf?: (eventName: string) => string | undefined;
    /** Who performs an event (the scene contract's `events[].by`): the player's own steps or horn are theirs. */
    byOf?: (eventName: string) => string | undefined;
    /** The kinds of thing in the scene (car, palm): an event `with` a kind happens with whichever one of them. */
    kinds?: ReadonlySet<string>;
    /** The thing a host is a part of (`partsOf`): the train for its horn, engine and wheels. */
    wholeOf?: (host: string) => string | undefined;
}
/** Object-first navigation ignores mix folders: they are collections, not ownership. */
export declare function objectKeyFor(st: Pick<Statement, 'entityId' | 'eventName' | 'hostRef'> & Partial<Pick<Statement, 'attachRef'>>, ctx: Omit<GroupContext, 'groups'> & {
    families: ReadonlyMap<string, readonly string[]>;
}): string;
/** A family selection highlights objects; only selecting within one object exposes its sounds. */
export declare function revealObjectSounds(members: readonly number[], selected: readonly number[], editing: readonly number[]): boolean;
export declare function fullObjectLabel(members: readonly number[], selected: readonly number[], editing: readonly number[], hovered: boolean, nearby: boolean): boolean;
/**
 * Which group a voice sits in, in this order: a group made in the mixer, its entity, the thing an
 * interaction happens with ("drink · by you" under the vending machine), the thing it is on, the scene.
 */
export declare function groupKeyFor(st: Pick<Statement, 'sourceId' | 'entityId' | 'eventName' | 'hostRef'>, ctx: GroupContext): string;
export interface SceneObjectInfo {
    id: string;
    label?: string;
    moves?: boolean; /** A line source along the thing (a lane, a train), not a point. */
    line?: boolean;
}
export interface SceneMapInput extends Partial<GroupContext> {
    statements: readonly Statement[];
    /** The scene contract's objects (or the hosts the game registered). */
    objects?: readonly SceneObjectInfo[];
    /** A voice's display name; defaults to the fallback chain (`# @name` is the caller's to pass). */
    nameOf?: (st: Statement, i: number) => string;
    /** What the take check heard in the voice's take (`qa.heard`), when the host has it. */
    heardOf?: (st: Statement, i: number) => string | undefined;
    /** Live facts per voice ("62 dB here", "next in 14 s"), when the host has them. */
    liveOf?: (st: Statement, i: number) => string | undefined;
}
export interface MapVoice {
    id: string;
    name: string;
    kind: Statement['kind'];
    indices: number[];
    host?: string;
    hostKind: 'object' | 'class' | 'strip' | 'listener' | 'unknown' | 'none';
    with?: string;
    group: string;
    event?: string;
    every?: string;
    /** Other voices that play the same takes. */
    shares: string[];
    audio: string;
    heard?: string;
    live?: string;
}
export interface SceneMap {
    objects: Array<{
        id: string;
        label: string;
        moves: boolean;
        line: boolean;
        class?: string;
    }>;
    classes: Array<{
        id: string;
        members: string[];
    }>;
    groups: Array<{
        key: string;
        label: string;
        voices: string[];
    }>;
    voices: MapVoice[];
}
/** Build the map. Pure: same input, same map. */
export declare function buildSceneMap(input: SceneMapInput): SceneMap;
/** Voices that sound different from each other: one per shared recording (the first id of each). */
export declare function distinctAudio(map: SceneMap, ids: readonly string[]): string[][];
/**
 * What can be said about one thing the person named: is it separate objects (a class), one
 * object, one line source with nothing inside it, or unknown. The check behind a "that needs your
 * coding agent": only a thing with no separate objects can need the game to expose them.
 */
export declare function thingKind(map: SceneMap, id: string): {
    kind: 'class' | 'object' | 'line' | 'unknown';
    members?: string[];
};
/** The map as the text table a model reads. Bounded: `maxVoices` rows, then a count. */
export declare function sceneMapText(map: SceneMap, opts?: {
    maxVoices?: number;
    maxObjects?: number;
}): string;
//# sourceMappingURL=sceneMap.d.ts.map