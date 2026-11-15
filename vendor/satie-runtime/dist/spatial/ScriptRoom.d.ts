import { type ReverbSuggestion } from './WorldAcoustics.js';
import type { SceneRoom, SceneMaterial } from '../core/Scene';
/**
 * The engine-facing reverb for a script's declared rooms, or null when the
 * script declares none (the common case — every existing script).
 *
 * Only the FIRST room drives the scene-level reverb for now: per-voice room
 * membership needs a `in <room>` property that does not exist yet, and
 * silently averaging several rooms would be a guess wearing a number. An
 * explicit `rt60` on the room overrides the computed decay — the author wins
 * against their own geometry too.
 */
export declare function deriveScriptRoom(rooms: SceneRoom[], materials: SceneMaterial[]): ReverbSuggestion | null;
/**
 * Every declared room's reverb, by lowercased name — the lookup behind the
 * per-voice `in <room>` property. The scene-wide rung stays `deriveScriptRoom`
 * (first room); this map is what lets a second and third room exist at all:
 * a voice that says `in kitchen` gets the kitchen, everyone else keeps the
 * scene. Rooms that only name a space (no size, no rt60) derive nothing and
 * are omitted — membership in them is a no-op rather than a guess.
 */
export declare function deriveScriptRoomsByName(rooms: SceneRoom[], materials: SceneMaterial[]): Map<string, ReverbSuggestion>;
//# sourceMappingURL=ScriptRoom.d.ts.map