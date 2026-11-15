/**
 * From `room` / `material` declarations to engine reverb — what makes the
 * spaces DSL audible.
 *
 * A declared room is treated exactly like a measured one, through the same
 * physics: shoebox surfaces from its dimensions, materials resolved to
 * octave-band absorption, Eyring, then the engine's own decay-law inverse.
 * One path for measurement and authorship means the two cannot drift into
 * describing different acoustics for the same numbers.
 *
 * Precedence note (the author-wins ladder, top down): a voice's explicit
 * `reverb` > the script's declared room > the measured world room. This module
 * only computes the middle rung.
 */
import { shoebox, flatBand, } from './RoomAcoustics.js';
import { lookupAbsorption } from './AbsorptionLookup.js';
import { reverbFromMeasuredRoom, DEFAULT_WORLD_ALPHA, } from './WorldAcoustics.js';
import { size01ForRt60 } from '../dsp/FdnCoefficients.js';
/**
 * Resolve one surface's material name: a `material` declared with explicit
 * coefficients wins; a bare declared name or an undeclared name falls back to
 * the absorption table's open-vocabulary lookup; nothing resolvable gets the
 * documented placeholder. Never throws — a script with a typo'd material
 * plays with the default rather than failing to load.
 */
function surfaceAlpha(name, materials) {
    if (!name)
        return flatBand(DEFAULT_WORLD_ALPHA);
    const declared = materials.find((m) => m.name.toLowerCase() === name.toLowerCase() && m.absorption.length > 0);
    if (declared)
        return declared.absorption;
    const looked = lookupAbsorption(name);
    return looked ? looked.absorption : flatBand(DEFAULT_WORLD_ALPHA);
}
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
export function deriveScriptRoom(rooms, materials) {
    const room = rooms[0];
    if (!room)
        return null;
    return deriveOneRoom(room, materials);
}
/**
 * Every declared room's reverb, by lowercased name — the lookup behind the
 * per-voice `in <room>` property. The scene-wide rung stays `deriveScriptRoom`
 * (first room); this map is what lets a second and third room exist at all:
 * a voice that says `in kitchen` gets the kitchen, everyone else keeps the
 * scene. Rooms that only name a space (no size, no rt60) derive nothing and
 * are omitted — membership in them is a no-op rather than a guess.
 */
export function deriveScriptRoomsByName(rooms, materials) {
    const map = new Map();
    for (const room of rooms) {
        const derived = deriveOneRoom(room, materials);
        if (derived)
            map.set(room.name.toLowerCase(), derived);
    }
    return map;
}
function deriveOneRoom(room, materials) {
    // No dimensions and no rt60: the room only names a space — nothing to compute.
    if (!room.sizeM && room.rt60S == null)
        return null;
    if (room.sizeM) {
        const { x: w, y: h, z: d } = room.sizeM;
        const geometry = shoebox(w, h, d, {
            floor: surfaceAlpha(room.surfaces.floor, materials),
            ceiling: surfaceAlpha(room.surfaces.ceiling, materials),
            walls: surfaceAlpha(room.surfaces.walls, materials),
        });
        const solid = geometry.surfaces.reduce((s, f) => s + f.areaM2, 0);
        const measured = {
            volumeM3: geometry.volumeM3,
            surfaceAreaM2: solid,
            apertureAreaM2: 0, // a declared room is a closed room unless told otherwise
            openFraction: 0,
            meanFreePathM: solid > 0 ? 4 * geometry.volumeM3 / solid : 0,
        };
        // Per-surface alphas → area-weighted mean happens inside the same bridge
        // the world room uses; authored rt60 overrides the computed size.
        const meanAlpha = geometry.surfaces.length
            ? geometry.surfaces[0].absorption.map((_, b) => geometry.surfaces.reduce((s, f) => s + f.areaM2 * f.absorption[b], 0) / solid)
            : flatBand(DEFAULT_WORLD_ALPHA);
        const suggestion = reverbFromMeasuredRoom(measured, meanAlpha);
        if (!suggestion)
            return null;
        if (room.rt60S != null) {
            return { ...suggestion, size: round2(size01ForRt60(room.rt60S)) };
        }
        return suggestion;
    }
    // rt60 only — no geometry to weigh, so wet/damping take neutral mids.
    return { wet: 0.25, size: round2(size01ForRt60(room.rt60S)), damping: 0.4 };
}
function round2(v) {
    return Math.round(v * 100) / 100;
}
//# sourceMappingURL=ScriptRoom.js.map