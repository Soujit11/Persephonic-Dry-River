import type { Statement } from '../core/Statement';
export interface VoiceLocator {
    /** When supplied, resolves uniquely by authoring identity; never falls back to clip matching. */
    sourceId?: string;
    kind: string;
    clip: string;
    genPrompt?: string | null;
    /** Which match to take when the same voice shape appears multiple times (0-based). */
    occurrence?: number;
    /** The statement's script line (`Statement.sourceLine`, 0-based) at the time of the act — informational, never used to locate. */
    line?: number;
}
/**
 * The locator for a parsed statement: its shape plus which occurrence of that
 * shape it is among `statements` (the engine's script statements or the UI
 * snapshot — both come from the same parse). `line` rides along for records.
 */
export declare function voiceLocatorFor(stmt: Statement, statements: readonly Statement[]): VoiceLocator;
/**
 * Find the 0-based line index of the statement declaring this voice.
 * Returns -1 when not found. Trigger voices (`on step`, `when`-converted
 * oneshots) locate like any other — pass `kind: 'trigger'` (what the parsed
 * statement carries) or the written head (`'on step'`); both match.
 */
export declare function findVoiceLine(script: string, loc: VoiceLocator): number;
/**
 * Write `<key> <value>` into the voice's property block — replacing an
 * existing `<key>` line (block property or inline `and <key> …`), or
 * inserting a new property line right under the statement. Returns the
 * updated script, or null when the voice's line can't be located.
 */
export declare function upsertVoiceProperty(script: string, loc: VoiceLocator, key: string, value: string): string | null;
/**
 * Write `place <x> <y> <z>` into the voice's property block (viewport drag,
 * mixer position pad). Thin wrapper over upsertVoiceProperty.
 */
export declare function upsertVoicePlace(script: string, loc: VoiceLocator, pos: {
    x: number;
    y: number;
    z: number;
}): string | null;
/**
 * Remove a property line (block or inline `and …`) from the voice. Returns
 * the updated script; null when the voice can't be located. A missing
 * property is not an error — the script comes back unchanged.
 */
export declare function removeVoiceProperty(script: string, loc: VoiceLocator, key: string): string | null;
/**
 * Flip a voice between `loop` and `oneshot` in place (mixer kind toggle).
 * Returns the updated script, or null when the voice can't be located.
 * Only the HEAD TOKEN is rewritten — a `loop` or `oneshot` appearing inside
 * a gen prompt on the same line is never touched.
 */
export declare function setVoiceKind(script: string, loc: VoiceLocator, kind: 'loop' | 'oneshot'): string | null;
export type VoiceTrigger = 'loop' | 'oneshot' | {
    event: string;
};
/** Rewrite only the playback head, including an existing event head. */
export declare function setVoiceTrigger(script: string, loc: VoiceLocator, to: VoiceTrigger): string | null;
/** A collision-free authoring identity for a copied sound. */
export declare function uniqueSourceId(script: string, base: string): string;
/** Copy the authored block in its existing group; assets and banks stay shared. */
export declare function duplicateVoiceBlock(script: string, loc: VoiceLocator, destination: string | {
    sourceId: string;
    at?: string;
    place?: [number, number, number];
}): string | null;
/**
 * Delete a voice's whole statement block (head line + indented properties).
 * A multi-clip / folder-glob line is SPLIT first so exactly one voice dies.
 * Returns the updated script, or null when the voice can't be located.
 */
export declare function deleteVoiceBlock(script: string, loc: VoiceLocator): string | null;
/**
 * Replace what a voice PLAYS, in place: a gen voice's prompt (`loop gen <new
 * prompt>`) or a clip voice's clip token — every property line, position, and
 * binding stays. This is the mixer's "change the sound". Returns null when
 * the voice can't be located or its head can't be rewritten safely.
 */
export declare function setVoiceSource(script: string, loc: VoiceLocator, source: {
    genPrompt: string;
    synth?: boolean;
} | {
    clip: string;
    synth?: boolean;
}): string | null;
/**
 * A head line playing `sound` (a clip token or `gen <prompt>`) instead of what it plays now.
 * The text replaced is exactly what the parser read as the sound: `gen <prompt>` for a
 * voice written inline, the token otherwise (a clip, or the name of a `gen <name>` block). Everything
 * around it (count, kind, `every`, inline `and <property>` clauses) stays as written, so no
 * second copy of the grammar decides where the sound ends. Null when that text is not on the line.
 */
export declare function replaceHeadSound(head: string, st: Pick<Statement, 'genPrompt' | 'clip'>, sound: string): string | null;
/**
 * Append a top-level voice block (statement line + indented properties) to a
 * script — used when a sample is dropped into the scene. Handles empty
 * scripts and scripts ending inside a group (a blank line ends the group's
 * block, so the appended voice is always top-level).
 */
export declare function appendVoiceBlock(script: string, block: string): string;
/** 0-based header line of `path <name>`, or -1. */
export declare function findPathLine(script: string, pathName: string): number;
/**
 * Move one waypoint of a `path <name>` block — the viewport's handle drag.
 * Rewrites `waypoint x y z [t]` in place, preserving a trailing time pin.
 * Returns null when the path or the waypoint doesn't exist.
 */
export declare function upsertPathWaypoint(script: string, pathName: string, waypointIndex: number, pos: {
    x: number;
    y: number;
    z: number;
}): string | null;
/**
 * Remove one waypoint (refuses to go below two — a path needs a line).
 * Returns null when the path/waypoint doesn't exist or only two remain.
 */
export declare function deletePathWaypoint(script: string, pathName: string, waypointIndex: number): string | null;
/**
 * Replace a declared path's waypoints wholesale — a redraw. The block's other
 * lines (`cycle`, `speed`, `loop`, `closed`) survive: the hand tuned those
 * once and a new shape shouldn't reset the pace. Returns null when the path
 * isn't declared.
 */
export declare function replacePathBlock(script: string, pathName: string, waypoints: {
    x: number;
    y: number;
    z: number;
}[]): string | null;
/**
 * The one write behind BOTH path gestures (stroke draw and waypoint drop):
 * a voice that already follows a declared path gets that path REDRAWN in
 * place (name and pace kept — no sibling blocks minted); a voice without one
 * gets a fresh block appended under the supplied unique legal name, and its
 * `move` pointed at it. Pure — the caller supplies the CURRENT script, the
 * voice's current path name (null when it has none), and the block builder
 * (pathDraw's buildPathBlock; injected to keep this module parser-side only).
 */
export declare function writeVoicePath(script: string, loc: VoiceLocator, currentPathName: string | null, freshName: string, waypoints: {
    x: number;
    y: number;
    z: number;
}[], buildBlock: (name: string, wps: {
    x: number;
    y: number;
    z: number;
}[]) => string): {
    script: string;
    name: string;
    replaced: boolean;
} | null;
/** The fields a `room <name>` block can carry (parser: parseRoomBlock). */
export type RoomField = 'size' | 'floor' | 'ceiling' | 'walls' | 'rt60';
/** Values for `appendRoomBlock` — every field optional, like the DSL. */
export interface RoomFields {
    /** Metres: width, height, depth. */
    size?: [number, number, number];
    floor?: string;
    ceiling?: string;
    walls?: string;
    /** Seconds. */
    rt60?: number;
}
/**
 * 0-based line index of the `room <name>` header, or -1. Names compare
 * case-insensitively, as the engine's room lookup does.
 */
export declare function findRoomLine(script: string, roomName: string): number;
/**
 * Write `<field> <value>` inside a `room <name>` block (the mixer's room
 * view): replaces the existing line for that field, else inserts one right
 * under the header. `value: null` removes the field (an `rt60` override
 * cleared back to "derived"). `walls` also matches a `wall` line, as the
 * parser does. Returns the updated script, or null when no such room exists.
 *
 * The block extends over blank lines to the first non-blank line at the
 * header's indent or less — the parser's own rule for scene blocks, which
 * differs from a voice's property block (that one stops at a blank line).
 */
export declare function upsertRoomField(script: string, roomName: string, field: RoomField, value: string | null): string | null;
/**
 * Append a top-level `room <name>` block with the given fields (the mixer's
 * "add a room" chip, "pin the world room"). A blank line separates it from
 * whatever came before, so it never reads as part of a preceding block.
 */
export declare function appendRoomBlock(script: string, name: string, fields?: RoomFields): string;
/**
 * The lines of entity `id`: its header, the end of its own property lines (before the first
 * sound), and its last line (`endentity`, or the line before the first one indented no deeper
 * than the header, the parser's rule). Null when the script does not parse or has no such entity.
 */
export declare function entityBlockRange(script: string, id: string): {
    head: number;
    ownEnd: number;
    end: number;
    own: number[];
} | null;
/** Delete entity `id` whole: its body, its behaviour and every sound on it. Null when not found. */
export declare function deleteEntityBlock(script: string, id: string): string | null;
/** Set one of entity `id`'s own lines (`speed 4to6`, `count 3`): replaced in place, else added after the header. */
export declare function upsertEntityProperty(script: string, id: string, key: string, value: string): string | null;
/** Remove one of entity `id`'s own lines (`hold`). The script unchanged when absent; null when the entity is not found. */
export declare function removeEntityProperty(script: string, id: string, key: string): string | null;
//# sourceMappingURL=scriptEdit.d.ts.map