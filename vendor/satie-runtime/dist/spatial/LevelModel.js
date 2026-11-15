/**
 * Level model — how loud a thing IS versus how loud it ARRIVES.
 *
 * Satie's `volume` conflated two things physics keeps apart. This module
 * separates them:
 *
 *   emission   dB SPL at 1 m — a property of the SOURCE (a robin ~80, a car
 *              horn ~110, thunder ~120 at the strike). World knowledge: the
 *              script / the model says it (`spl 80`); nothing here knows what
 *              a robin is.
 *   received   what propagation leaves at the ear: the panner's own inverse
 *              distance law (the same `directPathGain` the dry path travels),
 *              half the loss for a LINE source, none for a bed / field, a
 *              broadband cut for occlusion.
 *
 * A bird at 2 m arrives at ~70 dB; thunder 3 km away at ~45 dB. The bird is
 * louder at the ear — correctly. The ordering comes from physics, not from
 * a fader the model guessed.
 *
 * The physical range (footsteps at 35, thunder at 110) cannot be reproduced
 * on headphones, so the scene is governed by an HDR WINDOW (the games' answer
 * — DICE/Frostbite): a sliding window `WINDOW_DB` wide whose top follows the
 * loudest received level (fast attack, slow release), mapped to a fixed
 * playback loudness; sources under the window's floor are culled, which is
 * what masking does to the ear anyway. The top never sinks below
 * `WINDOW_TOP_MIN_DB`, a floor low enough that a quiet scene's loudest
 * voice still reaches the playback reference instead of playing under it.
 *
 * Calibration chain: every decoded buffer is normalized to `CLIP_LUFS`
 * (dsp/Loudness.ts); a source sitting AT the window top is played back at
 * `TOP_LUFS`; everything else is scaled by its emission relative to the top.
 * The panner then applies the distance law itself, so the engine's per-source
 * gain is `sourceGain(emission, top)` — distance is NOT folded in twice.
 *
 * Pure math, no Web Audio: shared by the live engine, the offline trace and
 * the council's level report.
 */
import { PANNER_REF_M, directPathGain } from './WorldAcoustics.js';
/** Loudness every decoded / generated buffer is normalized to (LUFS). */
export const CLIP_LUFS = -23;
/** Playback loudness of a source sitting at the window top (LUFS). */
export const TOP_LUFS = -18;
/** HDR window width: sources further under the top than this are culled. */
export const WINDOW_DB = 55;
/** Soft knee above the window floor over which a source fades to nothing. */
export const KNEE_DB = 6;
/**
 * The window top never sinks below this received level (dB SPL): a silent
 * bedroom at night. It used to be 40, and a quiet cafe whose loudest voice
 * arrived at 28 dB then played 12 dB under the reference: near silence on
 * speakers, with the wizard saying the background was playing. The scene's
 * loudest steady voice must reach `TOP_LUFS` however quiet the place is.
 */
export const WINDOW_TOP_MIN_DB = 20;
/** Emission assumed for a voice that declares no `spl` in a calibrated scene. */
export const DEFAULT_SPL_DB = 70;
/** Bed colour (spec 006): the shelf frequency and the default shelf gain for a `bed` voice with no `tilt`. Real beds measure highs about 15 dB under lows; Satie's were 8 dB too bright, so the default takes half the gap. */
export const BED_SHELF_HZ = 2000;
export const BED_TILT_DEFAULT_DB = -6;
/** The shelf gain a bed plays with: its `tilt` when stated, else the default. */
export function bedTiltDb(tilt) { return tilt === null || tilt === undefined ? BED_TILT_DEFAULT_DB : tilt; }
/** Window top smoothing: rises fast, falls slowly (seconds, time constants). */
export const WINDOW_ATTACK_S = 0.05;
export const WINDOW_RELEASE_S = 3.0;
/**
 * Events (oneshots, triggers) never move the window — only STEADY sources
 * (loops) do, or every bird call would duck the stream for seconds (the
 * classic HDR pumping). An event arriving above the top plays at most this
 * far over it: the excess is taken off its gain (`eventCapDb`). Thunder
 * over a 50 dB wood is loud, not clipping; a distant horn keeps its place.
 */
export const EVENT_HEADROOM_DB = 12;
/** Broadband level cut of a fully occluded path (dB) — the window's estimate, not the muffle chain's. */
export const OCCLUSION_FULL_DB = 24;
/** Reference distance the emission is stated at (m). */
export const SPL_REF_M = PANNER_REF_M;
export const dbToGain = (db) => (db === -Infinity ? 0 : Math.pow(10, db / 20));
export const gainToDb = (g) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
/** Linear gain applied to a source at the window top (CLIP_LUFS → TOP_LUFS). */
export const TOP_GAIN = dbToGain(TOP_LUFS - CLIP_LUFS);
/**
 * Distance loss in dB along the direct path — the PannerNode's `inverse`
 * model with the engine's reference and rolloff, clamped at the reference
 * distance; a line source uses half the rolloff, as `createVoice` sets it.
 */
export function distanceLossDb(distanceM, line = false, profile = null) {
    return -gainToDb(directPathGain(distanceM, line, profile));
}
/** Level at the ear (dB SPL) of a source emitting `emissionDb` at 1 m. */
export function receivedSplDb(emissionDb, path) {
    if (path.bed || path.field)
        return emissionDb;
    const occ = path.occlusion01 ? Math.min(1, Math.max(0, path.occlusion01)) : 0;
    return emissionDb - distanceLossDb(path.distanceM, path.line, path.distanceProfile) - occ * OCCLUSION_FULL_DB;
}
/** `volume <0..1>` as a trim in dB on top of the emission (0 → silence). */
export function volumeTrimDb(volume01) {
    return volume01 <= 0 ? -Infinity : 20 * Math.log10(volume01);
}
/**
 * One step of the window top: chase the loudest received level (never
 * below `WINDOW_TOP_MIN_DB`) with an attack time constant when rising and a
 * release time constant when falling.
 */
export function windowTopStep(prevTopDb, loudestReceivedDb, dtSec) {
    const target = Math.max(WINDOW_TOP_MIN_DB, isFinite(loudestReceivedDb) ? loudestReceivedDb : -Infinity);
    if (!isFinite(prevTopDb))
        return target;
    const tau = target > prevTopDb ? WINDOW_ATTACK_S : WINDOW_RELEASE_S;
    const k = dtSec <= 0 ? 1 : 1 - Math.exp(-dtSec / tau);
    return prevTopDb + (target - prevTopDb) * k;
}
/**
 * Gain for a source BEFORE the panner: its emission relative to the window
 * top, times the top's playback gain. Distance is left to the panner.
 */
export function sourceGain(emissionDb, topDb) {
    return dbToGain(emissionDb - topDb) * TOP_GAIN;
}
/**
 * Window culling factor 0..1 from the RECEIVED level: 1 inside the window,
 * fading over `KNEE_DB` to 0 at the floor (`top − WINDOW_DB`) and below.
 */
export function windowCull(receivedDb, topDb) {
    const floor = topDb - WINDOW_DB;
    const above = receivedDb - floor;
    if (above >= KNEE_DB)
        return 1;
    if (above <= 0)
        return 0;
    const t = above / KNEE_DB;
    return t * t * (3 - 2 * t);
}
/** dB an EVENT must be cut so it arrives no more than `EVENT_HEADROOM_DB` over the window top (0 inside the headroom). */
export function eventCapDb(receivedDb, topDb) {
    const excess = receivedDb - topDb - EVENT_HEADROOM_DB;
    return excess > 0 ? excess : 0;
}
//# sourceMappingURL=LevelModel.js.map