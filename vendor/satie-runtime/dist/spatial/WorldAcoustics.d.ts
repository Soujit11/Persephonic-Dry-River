/**
 * Geometry-informed acoustics — pure math, no Web Audio, no three.js.
 *
 * Turns coarse world geometry (ray-hit distances against a collider mesh,
 * or a simple room-size estimate) into Satie DSP parameters:
 *   - enclosure estimation → reverb wet/size/damping
 *   - occlusion amount → lowpass cutoff frequency
 *
 * The UI layer does the raycasting (it owns the three.js scene); the engine
 * consumes the resulting scalars (SatieEngine.setTrackOcclusion).
 */
import { type MeasuredRoom, type BandValues } from './RoomAcoustics.js';
export interface EnclosureEstimate {
    /** 0 = tiny room, 1 = vast space. */
    size01: number;
    /** 0 = fully enclosed, 1 = open air (most rays escaped). */
    openness01: number;
}
/**
 * Estimate the enclosure around the listener from ray-hit distances.
 * `hitDistances` holds one entry per probe ray: the distance at which the ray
 * hit geometry, or Infinity (or any value >= maxDistance) if it escaped.
 */
export declare function estimateEnclosure(hitDistances: number[], maxDistance: number): EnclosureEstimate;
export interface ReverbSuggestion {
    wet: number;
    size: number;
    damping: number;
}
/**
 * Map an enclosure estimate to Satie reverb parameters (all 0-1, matching
 * the DSL's `reverb wet X size Y damping Z`).
 *
 * Enclosed spaces get wetter as they grow (cathedral); open air keeps only a
 * faint ambience tail regardless of size.
 */
export declare function reverbFromEnclosure(e: EnclosureEstimate): ReverbSuggestion;
/** Convenience: reverb from a bare room-size guess (e.g. VLM output). */
export declare function reverbFromRoom(roomSize01: number, indoor: boolean): ReverbSuggestion;
/**
 * Surface absorption assumed for a world whose materials have not been
 * identified yet — a lightly furnished interior, mid-band. This is the
 * PLACEHOLDER the vision-segmentation stage replaces with per-surface values;
 * it exists so the measured-geometry path can run before materials land, and
 * it is one number on purpose: inventing a per-band curve here would dress a
 * guess up as a measurement.
 */
export declare const DEFAULT_WORLD_ALPHA = 0.15;
/**
 * Reverb parameters from MEASURED room geometry — the physics path, replacing
 * the `size01` heuristic curve for worlds.
 *
 * `reverbFromEnclosure` maps ray statistics onto an invented curve
 * (`wet = 0.08 + enclosed·(0.15 + 0.45·size)` …). This instead runs Eyring
 * over the measured volume, solid surface and aperture area — apertures at
 * α = 1, so openness IS the energy balance — and inverts the engine's own
 * decay law so the FDN reproduces the computed RT60 exactly.
 *
 *   - `size` carries the measured decay: `size01ForRt60(midFrequency(Eyring))`.
 *   - `damping` comes from the band tilt of the measured decay
 *     (1 − RT60_4k/RT60_mid). With the flat placeholder α it is 0 — a bright
 *     tail whose decay time is exactly the measured one — and it becomes
 *     meaningful the moment per-band materials arrive, with no code change.
 *   - `wet` keeps `reverbFromEnclosure`'s envelope-of-plausibility, driven by
 *     the measured enclosed fraction: how much room you hear is perceptual
 *     mix territory, not physics, and continuity with the old behaviour there
 *     is a feature.
 *
 * Null when the geometry has nothing to describe (nothing hit), matching
 * `eyringFromMeasuredRoom`.
 */
export declare function reverbFromMeasuredRoom(room: MeasuredRoom, alpha?: BandValues): ReverbSuggestion | null;
/** Fully open lowpass — the "not occluded" cutoff. */
export declare const OCCLUSION_OPEN_HZ = 20000;
/** Fully occluded cutoff — heavy wall muffle. */
export declare const OCCLUSION_CLOSED_HZ = 400;
/**
 * Map occlusion 0-1 to a lowpass cutoff in Hz (exponential — perceptually
 * even muffling). 0 → 20 kHz (transparent), 1 → 400 Hz (behind a wall).
 * Fractional values (partial line-of-sight from volumetric raycasts) land
 * in between — an obstruction-style soft muffle rather than a wall.
 */
export declare function occlusionCutoffHz(occlusion01: number): number;
/**
 * Level cut for an occluded voice (linear gain). A wall blocks energy, not
 * just brightness: full occlusion halves the direct level (~-6 dB) on top of
 * the lowpass. Partial occlusion scales linearly.
 */
export declare function occlusionGain(occlusion01: number): number;
/** Distance below which air absorption is inaudible (cutoff stays open). */
export declare const AIR_ABSORPTION_REF_M = 8;
/**
 * The cutoff never falls below this: air takes the highs, not the lows. A
 * halving law with no floor reaches 0.3 Hz at 300 m and silences anything on
 * the horizon (`at horizon`, 1.5–3 km); real distant thunder, a far horn, a
 * train miles off are low rumbles, not nothing.
 */
export declare const AIR_ABSORPTION_MIN_HZ = 250;
/**
 * High-frequency air absorption as a lowpass cutoff falling with distance.
 * Air soaks up highs before lows: transparent up to ~8 m, then the cutoff
 * halves every 18 m (≈10 kHz at 26 m, ≈5 kHz at 44 m — subtle, natural),
 * down to `AIR_ABSORPTION_MIN_HZ`.
 */
export declare function airAbsorptionCutoffHz(distanceM: number): number;
/**
 * Combined muffle for a voice: whichever of occlusion and air absorption
 * darkens it more wins (they don't stack — both model HF loss on the path).
 */
export declare function combinedCutoffHz(occlusion01: number, distanceM: number): number;
/**
 * The PannerNode distance settings every Satie voice uses. Kept here so the
 * live engine, the offline renderer and the reverb-send math all read one
 * definition instead of four copies of the same three numbers.
 */
export declare const PANNER_REF_M = 1;
export declare const PANNER_ROLLOFF = 2;
/** Explicit, persisted distance semantics. Missing declarations retain the legacy sound. */
export type DistanceProfile = 'legacy_v1' | 'free_field_v1';
/** Point pressure is 1/r in free_field_v1. The existing line approximation stays unchanged. */
export declare function distanceRolloff(line?: boolean, profile?: DistanceProfile | null): number;
/**
 * There is deliberately no `PANNER_MAX_M`. `maxDistance` appears ONLY in Web
 * Audio's `linear` distance formula — under the `inverse` model every Satie
 * voice uses, setting it does nothing at all. It used to be set to 50 in both
 * the live engine and the offline renderer, and comments elsewhere reasoned
 * about "the panner's maxDistance" as a real audible horizon. It never was
 * one: `inverse` attenuates without bound, which is exactly what
 * `directPathGain` below and `AmbisonicEncoder` already model.
 */
/**
 * Gain of the DIRECT path at a distance, mirroring the PannerNode's `inverse`
 * distance model exactly: ref / (ref + rolloff * (d - ref)), clamped below at
 * the reference distance. This is the curve the dry signal already travels;
 * the reverb send needs it to place the critical distance correctly.
 */
export declare function directPathGain(distanceM: number, line?: boolean, profile?: DistanceProfile | null): number;
/**
 * Critical distance: where the direct sound and the reverberant field carry
 * equal energy. Inside it you hear the source, outside it you hear the room —
 * and the ratio between the two is the dominant auditory distance cue, the one
 * that works independently of how loud the source happens to be.
 *
 * Classic Sabine relation d_c = 0.057 * sqrt(V / RT60), fed from the room size
 * the rest of the engine already agrees on:
 *   - mean dimension L = 2 * 20^size01 — the inverse of estimateEnclosure's
 *     mapping (2 m room → 0, 40 m hall → 1), so a MEASURED enclosure and an
 *     authored `reverb size` land on the same geometry.
 *   - RT60 = 0.3 + 5.7 * size01 — the decay DSPChain's impulse response
 *     actually generates, so the send agrees with the tail it feeds.
 *
 * Bedroom ≈ 0.3 m, hall ≈ 0.9 m, cathedral ≈ 5.9 m.
 */
export declare function criticalDistanceM(roomSize01: number): number;
/**
 * Level for a voice's send into the shared reverb bus.
 *
 * The bus bypasses the panner, so this gain is CONSTANT IN DISTANCE — that is
 * the whole point. A diffuse field does not get quieter as you walk away from
 * a source inside it; only the direct sound does. Setting the send to
 * `wet * directPathGain(d_c)` makes direct and reverberant energy cross over
 * exactly at the critical distance, so the ratio the script asked for (`wet`)
 * is what you hear standing at d_c, and it shifts wet as you retreat and dry
 * as you approach — for free, with no per-frame work.
 *
 * Large rooms push d_c out, which lowers the send: up close in a cathedral you
 * still hear the source, not the room. Open air pushes it out far enough that
 * the send falls away to nothing, which is correct — outdoors has no
 * reverberant field to stand in.
 */
export declare function reverbSendGain(wet01: number, roomSize01: number, profile?: DistanceProfile | null): number;
/**
 * The listener's medium is a property of WHERE THE LISTENER IS, not of any
 * voice: step into a river and every sound changes at once, including sounds
 * whose own position never moved. So these take `submerged01` — how far the
 * listener's head is below a fluid surface, 0 at the surface, 1 fully under —
 * and describe one stage on the master chain.
 *
 * The parameter values come from the EAX/I3DL2 `UNDERWATER` preset that every
 * major engine still ships (OpenAL Soft's efx-presets.h; FMOD's
 * FMOD_PRESET_UNDERWATER; Wwise practitioner LPF 55-65 ≈ 350-800 Hz), because
 * inventing them would be inventing a sound nobody has ever heard.
 */
/** Fully-submerged lowpass cutoff. FMOD's UNDERWATER HighCut is exactly 500. */
export declare const MEDIUM_UNDERWATER_HZ = 500;
/** Fully-submerged level. EAX UNDERWATER Gain 0.3162 = −10 dB. */
export declare const MEDIUM_UNDERWATER_GAIN = 0.3162;
/**
 * Warble rate. EAX ModulationTime 1.18 s → 1/1.18 ≈ 0.85 Hz. This slow
 * modulation — not the lowpass — is what actually reads as "submerged";
 * a filter alone sounds like a blanket over the speaker.
 */
export declare const MEDIUM_WARBLE_HZ = 0.85;
/** Peak delay swing of the warble at full submersion (EAX ModulationDepth 0.348). */
export declare const MEDIUM_WARBLE_DEPTH_S = 0.003;
/** Base delay the warble modulates around — must exceed the swing. */
export declare const MEDIUM_WARBLE_BASE_S = 0.008;
/** Medium transitions crossfade over this. Unity ships 0.2-0.5 s; Unreal's 0.5 drags on water entry. */
export declare const MEDIUM_XFADE_S = 0.4;
/** Loss crossing the air/water boundary. The interface reflects almost everything. */
export declare const SURFACE_TRANSMISSION_GAIN = 0.0316;
/**
 * Master lowpass for the listener's medium: open air → fully submerged,
 * exponential so the sweep is perceptually even.
 */
export declare function mediumCutoffHz(submerged01: number): number;
/** Master level for the medium — unity in air, −10 dB fully under. */
export declare function mediumGain(submerged01: number): number;
/** Warble delay swing (seconds) at this submersion. Zero in air = no modulation. */
export declare function mediumWarbleDepthS(submerged01: number): number;
/**
 * How much to COLLAPSE spatialization, 0 = full HRTF, 1 = effectively omni.
 *
 * This is the cue nearly every game omits. Underwater the speed of sound goes
 * 343 → ~1500 m/s, so the maximum interaural time difference falls from about
 * 656 µs to ~150 µs; skull impedance nearly matches water, so the head stops
 * casting an acoustic shadow and interaural level differences go with it.
 * Measured minimum audible angle underwater is ~21.5° at 3.5 kHz against 1-2°
 * in air. Localization genuinely stops working — so it should stop working
 * here too, rather than being merely darkened.
 */
export declare function mediumSpatialCollapse(submerged01: number): number;
/**
 * Scale factor on distance-based air absorption for the current medium.
 *
 * Counterintuitive but load-bearing: water absorbs high frequencies roughly
 * 100× LESS per metre than air (≈0.96 dB/km at 10 kHz). Underwater muffling is
 * a property of the receiver — bone conduction, no head shadow — not of
 * propagation. So the distance-dependent HF loss must be REMOVED as the
 * listener submerges, and replaced by the fixed receiver-side cutoff above.
 * Leaving both in place would double-count a loss that physically reverses.
 */
export declare function airAbsorptionScale(submerged01: number): number;
/**
 * Level for a source on the far side of the air/water boundary from the
 * listener. Crossing the interface costs ~30 dB: below the surface you hear
 * the world above as a rumour, and from the bank a source under the water is
 * as faint. Both sides are how far under THEIR surface they are (0..1, the
 * listener's `submerged`, the voice's own immersion — WorldFields), so the
 * loss scales with the difference and breaking the surface brings the other
 * medium back smoothly. Same medium (both under, both in air) = unity.
 *
 * Deliberately NOT modelling refraction (the 13.4° Snell cone): no shipping
 * engine does, and bending a direction we have just made unlocalizable via
 * mediumSpatialCollapse would buy nothing.
 */
export declare function surfaceTransmissionGain(listenerSubmerged01: number, sourceSubmerged01: number): number;
/** Speed of sound (m/s) for Doppler. */
export declare const SPEED_OF_SOUND_MS = 343;
/** Radial speeds above this (m/s) are treated as teleports, not motion. */
export declare const DOPPLER_TELEPORT_MS = 40;
/**
 * Doppler playback-rate ratio from radial velocity (m/s, positive = source
 * receding from the listener). Approaching sources pitch up, receding pitch
 * down. Teleports (retriggers, trajectory jumps) return 1 — no artifact.
 */
export declare function dopplerRatio(radialVelocityMs: number): number;
//# sourceMappingURL=WorldAcoustics.d.ts.map