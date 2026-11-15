/**
 * Scene-level declarations: the spaces a script describes, as opposed to the
 * voices it places in them.
 *
 * Until now `parse()` returned `Statement[]` and nothing else, so the one
 * existing scene-level concept — `background` — had to be smuggled onto every
 * voice and recovered by scanning. That does not scale to a named,
 * cross-referenced graph of rooms and materials, so those live here instead.
 *
 * ## `zone` and `room` are two concepts, deliberately
 *
 * They are easy to confuse and must not be merged:
 *
 *   - **`zone`** is AUTHORIAL. A voice's membership of a named scene state
 *     ("cave", "surface"), over an open vocabulary the scene or game defines,
 *     driven imperatively by `setSceneState`. It answers *what should be
 *     audible right now*, and its effect is gating — mute or duck.
 *   - **`room`** is PHYSICAL. Geometry and materials, from which decay follows.
 *     It answers *how sound behaves here*, and its effect is reverberation and
 *     transmission.
 *
 * They overlap in exactly one observable — both can attenuate a voice — which
 * is precisely why collapsing them is tempting and wrong. A zone can span
 * several rooms (a "forest" containing a clearing and a cave); a room can hold
 * voices from several zones. They compose: a voice has both.
 *
 * ## Precedence: the author wins, measurement fills the gaps
 *
 * The same rule the rest of the pipeline already follows — a measured
 * enclosure outranks the vision model's `room_size` guess, but an authored
 * `reverb wet` outranks the room's own. So a declared `room` is authoritative
 * for every value it states, geometry supplies whatever it leaves out, and a
 * script that declares nothing behaves exactly as today.
 */
import { OCTAVE_BANDS_HZ } from '../spatial/RoomAcoustics.js';
export const SCENE_BAND_COUNT = OCTAVE_BANDS_HZ.length;
/** Array formats — the ones that render through the capsule path. */
export const MIC_ARRAY_FORMATS = new Set(['tetrahedral', 'eigenmike', 'circular']);
export const MIC_FORMATS = new Set([
    'stereo', 'binaural', 'foa', 'soa', 'quad', '7.1.2', '7.1.4',
    'tetrahedral', 'eigenmike', 'circular',
]);
/** Default capsule radius for array mics, metres (an Eigenmike-class body). */
export const MIC_DEFAULT_RADIUS_M = 0.042;
/** Find a declared mic by name (case-insensitive). */
export function findMic(scene, name) {
    const n = name.toLowerCase();
    return scene.mics.find(m => m.name === n) ?? null;
}
export function findMaterial(scene, name) {
    const key = name.trim().toLowerCase();
    return scene.materials.find((m) => m.name.toLowerCase() === key) ?? null;
}
export function findRoom(scene, name) {
    const key = name.trim().toLowerCase();
    return scene.rooms.find((r) => r.name.toLowerCase() === key) ?? null;
}
//# sourceMappingURL=Scene.js.map