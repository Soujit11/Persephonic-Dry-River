/**
 * The `world` block — WorldSpec written as Satie DSL, so the recipe for a
 * procedural world lives INSIDE the script next to the voices it hosts.
 *
 *   world temperate broadleaf forest
 *     seed 41
 *     size 100
 *     terrain relief 5 roughness 0.5
 *     ground leaf litter weight 1
 *     ground grass weight 0.8 slope 0to12
 *     strip brook mountain stream width 4 material clear water over pebbles carve 1 liquid flow 0.4 edge wet mud
 *     patch pond still pond radius 6 material dark water carve 1.2 liquid edge mud
 *     object oak blob old oak density 2 height 8to14 radius 2.5to4 material broad leaves porous 0.7 raised 0.45 stem 0.15to0.4 away brook 3
 *     object tower box office tower density 0.5 height 30to70 radius 10to16 material limestone away avenue 4
 *     fixture campfire campfire size 1x0.6x1 material wood and ash near listener 4 bearing 30
 *     fixture bench park bench size 1.8x0.9x0.5 material slatted wood at 3,-2 rotate 90
 *     instance kids 1 at 4.5,-3
 *     weather rain 0.1 wind 0.3 fog 0.2
 *     time 05:30 season late spring temp 12 clock 20
 *     control traffic avenue traffic value 0.7 range 0to1
 *     control crowd how crowded the sidewalk is value 0.5 range 0to1 step 0.05 unit %
 *
 * Every line is `<kind> [id] [shape] <free text…> [key value]…`: the free
 * text runs until the first keyword of that line kind. Labels and materials
 * are open vocabulary; the keywords are geometry and acoustics. `control`
 * lines are the scene's OWN state dimensions (the model's, per place); each
 * is published as a signal by id. Ecology is NOT in the block — it is the
 * voices themselves (`at <host>`), which is the whole point. Version-1 lines
 * (`water`, `road`, `scatter … tree|shrub|rock|plant|building`) still parse
 * and map onto strips / patches / objects.
 *
 * Transforms (2026-10-02, docs/architecture/scene-objects-contract.md): a
 * fixture's `rotate <deg>` is its yaw about +Y (three.js `rotation.y` sense,
 * written only when nonzero); `instance <entity> <n> at x,z` pins the n-th
 * individual (0-based) of an entity population to a ground position. The
 * entity itself stays a script block whose `at` names a HOST, never a place,
 * so a pin is the only per-person position the document carries.
 * `updateWorldBlockEntry` rewrites exactly one of these lines in place and
 * `readWorldBlockEntry` reads one back, so an edit and its inverse are both
 * byte-exact on the untouched parts of the line.
 *
 * `parseWorldBlock` and `formatWorldBlock` round-trip: a spec formatted then
 * parsed is the same spec (ecology aside).
 */
import { type EcologyEntry, type Ground2, type WorldSpec } from './worldSpec.js';
/**
 * Parse a `world` block. `head` is the text after the `world` keyword (the
 * biome); `lines` are the trimmed, indented lines beneath it. Never throws —
 * unknown lines are ignored, bad values fall back through normalizeWorldSpec.
 */
export declare function parseWorldBlock(head: string, lines: string[]): WorldSpec;
/** Format a spec as a `world` block (two-space indented body). Ecology is not written — it is the voices. */
export declare function formatWorldBlock(spec: WorldSpec): string;
/** The state a knob may write back: the physical state every place has, plus the scene's own controls by id. */
export interface WorldBlockState {
    rain?: number;
    wind?: number;
    fog?: number;
    hour?: number;
    temperatureC?: number;
    clockRate?: number;
    /** Control id → new value; ids not in the block are ignored. */
    controls?: Record<string, number>;
}
/**
 * Rewrite the `weather` / `time` / `control` lines of a script's `world`
 * block in place (the UI knobs write back here so the script stays the single
 * artifact). A control's `value` is rewritten, its label / range / step /
 * unit kept. Returns the script unchanged when it has no `world` block.
 */
export declare function updateWorldBlockState(script: string, state: WorldBlockState): string;
export type { EcologyEntry };
/** What the room card may change on the world block's interior; every field optional. */
export interface InteriorPatch {
    sizeM?: [number, number, number];
    floor?: string;
    walls?: string;
    ceiling?: string; /** null clears an override back to derived. */
    rt60S?: number | null;
}
/**
 * What one room card field writes on the interior line, or null when the value cannot be
 * written (a size that is not three positive numbers, an rt60 that is not a positive
 * number, a surface cleared to nothing): the caller then leaves the world block alone.
 * `rt60` with a null value clears the override. Before 2026-10-03 the page built this
 * inline: a non-numeric rt60 became NaN and cleared the override, and a malformed size
 * sent an empty patch that still rewrote the line.
 */
export declare function interiorPatchFor(field: 'size' | 'floor' | 'ceiling' | 'walls' | 'rt60', value: string | null): InteriorPatch | null;
/**
 * Rewrite the `interior size WxHxD floor … walls … ceiling … [rt60 s] [elevation m]`
 * line of a script's `world` block in place. The room card used to write only the
 * acoustic `room interior` block, so a size change moved the reverb and not the
 * walls the viewport draws (2026-10-02: "I make changes and the scene doesn't
 * change"). Returns the script unchanged when it has no world block or no interior.
 */
export declare function updateWorldBlockInterior(script: string, patch: InteriorPatch): string;
/** The world block things a transform edit addresses; `entity` means an `instance <entity> <n>` pin line. */
export type WorldEntryKind = 'fixture' | 'patch' | 'strip' | 'aperture' | 'entity';
/** The fields a transform edit may set or clear. `position` is the whole placement slot of its kind. */
export type WorldEntryField = 'position' | 'elevation' | 'yawDeg' | 'sizeM' | 'radiusM' | 'wall';
/** A fixture's relative placement, `near <ref> <m> [bearing <deg>]`. */
export interface WorldEntryNear {
    ref: string;
    distanceM: number;
    bearingDeg?: number;
}
/**
 * What one transform edit writes. Every field is optional; a field a kind has
 * no use for throws (a patch has no yaw, a strip only moves). Per kind:
 * fixture `position` -> `at x,z` (replacing `near … bearing …`), `near` ->
 * `near ref m [bearing deg]` (replacing `at`), `elevation`, `yawDeg` ->
 * `rotate`, `sizeM` -> `size WxHxD`; patch `position` -> `centre x,z` (keeps a
 * `center` spelling), `radiusM` -> `radius`; strip `position` shifts every
 * point of its `path` by the delta from the current centroid (no path: a 16 m
 * path through the point along +X, clamped to the terrain); aperture
 * `position[0]` -> `along`, `sizeM` -> `size WxH`, `wall` -> `wall <id | deg>` (`along`
 * only places an opening whose wall is named by id; a wall given as a bearing ignores
 * it, so a move writes both: the wall's id and the metres along it); entity `position` -> the
 * `at x,z` of the `instance <entity> <n>` line (created when missing; clearing
 * it deletes the line). `clear` removes keys, which is how an inverse undoes a
 * key the line did not have.
 */
export interface WorldEntryPatch {
    position?: Ground2;
    elevation?: number;
    yawDeg?: number;
    /** [w, h, d] for a fixture; [w, h] for an aperture (a third value is ignored). */
    sizeM?: readonly number[];
    radiusM?: number;
    /** Aperture only: the wall it sits in, as written (`front`, a plan wall's id, or a bearing in degrees). */
    wall?: string;
    near?: WorldEntryNear;
    clear?: readonly WorldEntryField[];
    /** Entity only: the 0-based individual the pin addresses. Required for `entity`. */
    instance?: number;
}
/** What a line currently says, in the same terms as `WorldEntryPatch`; absent = the line has no such key. */
export interface WorldEntryValues {
    position?: Ground2;
    near?: WorldEntryNear;
    elevation?: number;
    yawDeg?: number;
    sizeM?: number[];
    radiusM?: number;
    wall?: string;
}
/**
 * Read one world block thing's transform fields as they are written, or null
 * when the script has no world block or no such line (for an entity, no pin
 * for that instance). The inverse of a transform edit is built from this.
 */
export declare function readWorldBlockEntry(script: string, kind: WorldEntryKind, id: string, instance?: number): WorldEntryValues | null;
/**
 * Rewrite exactly one `fixture | patch | strip | aperture | instance` line of
 * a script's `world` block in place, keeping every other key on the line and
 * every other line untouched (see `WorldEntryPatch` for the field mapping).
 * Returns null when the script has no world block or no such line; returns
 * the script unchanged when the patch asks for nothing. Throws when a field
 * does not apply to the kind, or when an entity is addressed without an
 * `instance`: an entity's own `at` names its host, never a place.
 */
export declare function updateWorldBlockEntry(script: string, kind: WorldEntryKind, id: string, patch: WorldEntryPatch): string | null;
//# sourceMappingURL=WorldBlock.d.ts.map