/**
 * SourceExtent — spatially-extended sources (the end of the point-source era).
 *
 * Every Satie voice used to be a single HRTF point. Real sources have size: a
 * river has a shoreline, a crowd fills a square, roomtone has no location at
 * all. The professional consensus (FMOD sound-size/envelopment, Wwise spread
 * curves, Meta XR Audio volumetric radius, ADM object width) converges on one
 * model, implemented here:
 *
 *   - A voice has a RADIUS (meters). The listener's distance d to the source
 *     gives an extent angle: the arc of the auditory scene the source occupies.
 *     Far away → point. Close or large → wraps around you. Inside → fully
 *     enveloping (indistinguishable from a bed).
 *   - Rendering is a two-layer equal-power crossfade keyed on extent: the
 *     existing HRTF panner (aimed at the CLOSEST POINT on the source surface)
 *     against a decorrelated stereo "wide layer". At extent 0 nothing changes
 *     from today; at 360° the point layer is fully out.
 *   - The wide layer must be DECORRELATED, not the dry signal panned center:
 *     blending raw dry against HRTF output comb-filters against the HRTF's
 *     interaural delay (Meta's engineering note on volumetric sounds). We use
 *     velvet-noise FIRs (Alary/Politis/Välimäki, DAFx-17) — sparse ±1 impulse
 *     responses, perceptually white, very cheap to convolve.
 *   - Every voice gets a minimum apparent size (FMOD's auto rule: sound size =
 *     2 × min distance), so a zero-radius fly-by widens smoothly into stereo
 *     instead of hard-flipping ear to ear at the head.
 *
 * Geometry note: extent uses distance to the source CENTER (the subtended
 * angle of a sphere of radius r seen from d), while level uses distance to the
 * closest SURFACE point — standing at the shore of a 10 m pond, the water is
 * 1 m away and sounds like it, but still only fills the forward arc.
 *
 * Pure math + Web Audio node builders. No React, no engine state.
 */
import { mulberry32 } from '../core/Random.js';
export { mulberry32 };
/**
 * Minimum apparent source radius applied to every voice (FMOD auto-envelopment
 * rule: sound size = 2 × min distance, i.e. radius = min distance). Keeps
 * close approaches continuous: by the time a source reaches the head it has
 * already widened past hard left/right flipping.
 */
export declare const NEAR_FIELD_RADIUS_M = 1;
/**
 * Extent angle (degrees, 0–360) subtended by a source of radius r at distance
 * d from its center.
 *
 * Outside (d > r): the geometric subtended angle of the sphere, 2·asin(r/d) —
 * exactly FMOD's sound-size arc. At the surface (d = r) this reaches 180°:
 * the source fills the entire front hemisphere.
 *
 * Inside (d ≤ r): the geometric formula is undefined, but perception is not —
 * the source is increasingly all around you. Continue linearly from 180° at
 * the surface to 360° at the center, which is continuous at d = r and matches
 * Meta's "smoothly blends from spatial to surround" behavior.
 */
export declare function extentDeg(radiusM: number, distM: number): number;
/**
 * Equal-power crossfade between the point (HRTF panner) and wide
 * (decorrelated stereo) layers. point² + wide² = 1 at every extent, so total
 * energy is constant through the transition.
 */
export declare function crossfadeGains(extent: number): {
    point: number;
    wide: number;
};
import type { Vec3 } from '../core/Statement.js';
export type { Vec3 };
/**
 * Spatial state of an extended source for one tick, written in place (the
 * engine's tick loop must not allocate).
 */
export interface ExtentSample {
    /** Where to aim the panner — closest point on the source surface. */
    aim: Vec3;
    /** Distance to that closest surface point (drives level). */
    surfaceDistM: number;
    /** Extent angle in degrees (drives the point/wide crossfade). */
    extent: number;
}
/**
 * Sample a SPHERE source: aim at the closest surface point (center pulled
 * toward the listener by r), extent from center distance. Inside the sphere
 * the aim point is the listener itself — surface distance 0, but the point
 * layer is nearly silent there anyway (extent > 180°).
 */
export declare function sampleSphereExtent(center: Vec3, radiusM: number, listener: Vec3, out: ExtentSample): void;
/** @deprecated Finite sources no longer acquire an infinite diffuse floor. */
export declare const LINE_DIFFUSE_REACH_M = 30;
/** A finite source strip, in metres. */
export interface LineSource {
    polyline: readonly Vec3[];
    halfM: number;
    /** @deprecated Retained for manifest/API compatibility; does not disable distance attenuation. */
    reachM: number;
}
/**
 * A placed `line` voice (no world strip to follow): the long axis of its
 * box is the line, the short half-span its half width. Reach 0 — only a
 * paved strip of a world carries a diffuse field.
 */
export declare function lineFromBox(areaMin: Vec3, areaMax: Vec3): LineSource;
/** The angular span (degrees, 0..360) the polyline's vertices subtend from a point, on the horizontal plane. */
export declare function polylineSpanDeg(polyline: readonly Vec3[], x: number, z: number): number;
/**
 * Sample a LINE source — a road, a river, a shoreline — as what it is: the
 * whole visible length, not a ball around its nearest point.
 *
 *   - aim: the nearest point on the finite strip's surface, including height.
 *   - extent: beside the line, the angle its length subtends (≈180° for a
 *     long road you stand next to, narrowing only as you walk AWAY from it,
 *     perpendicular); on the line itself (within halfM of the centreline)
 *     it grows to 360° at the centre, continuously — there is no surface to
 *     cross at the kerb. Outside the strip it narrows as distance increases.
 *   - surfaceDistM: the actual 3D distance to that same surface point. A
 *     legacy `reachM` must never turn a finite road or coast into an infinite,
 *     head-locked ambience. An independently authored diffuse bed is separate.
 *
 * The listener-height y of the aim comes from the polyline (its surface);
 * callers hosting the voice a little above the surface pass `yOffset`.
 */
export declare function sampleLineExtent(line: LineSource, listener: Vec3, out: ExtentSample, yOffset?: number): void;
/** The source geometry shared by rendering, air absorption and level reports. */
export interface ExtentSource {
    position: Vec3;
    apparent: Vec3 | null;
    _radiusM: number;
    _ringM: number;
    _line: LineSource | null;
}
/** Sample one source's audible surface without allocating or using stale tick distances. */
export declare function sampleSourceExtent(source: ExtentSource, listener: Vec3, out: ExtentSample): void;
/**
 * Sample a RING source (horizontal circle of radius ringR centered on the
 * voice position — "birds around the clearing", surf around an island):
 *
 *   - aim: the closest point on the circle to the listener (plus the tube
 *     radius pulled toward the listener, so level behaves like the sphere's
 *     surface distance).
 *   - extent: treat the ring as a sphere of radius ringR at the ring center.
 *     Far away, a ring subtends the same arc as a sphere that size; at the
 *     center it is genuinely all around you (360°); on the ring itself the
 *     two formulas meet at 180°. Continuous everywhere.
 *
 * Degenerate listener-on-axis case (horizontal distance ~0): the closest
 * point is ambiguous, so aim at a fixed azimuth (+x) — the point layer is
 * nearly silent there (extent ≈ 360°), so the choice is inaudible.
 */
export declare function sampleRingExtent(center: Vec3, ringR: number, tubeR: number, listener: Vec3, out: ExtentSample): void;
/**
 * Velvet-noise decorrelation FIR: sparse ±1 impulses at ~densityHz average
 * rate with jittered positions and exponential decay. Perceptually transparent
 * decorrelation at a fraction of dense-FIR cost (DAFx-17). Two IRs from
 * different seeds are mutually incoherent — that pair IS the stereo wide
 * layer.
 *
 * Energy-normalized so convolution is roughly unity loudness.
 */
export declare function velvetNoiseIR(sampleRate: number, seconds?: number, densityHz?: number, seed?: number): Float32Array;
/** The shared decorrelated stereo bus every voice's wide layer feeds. */
export interface WideBus {
    /** Mono sum in — per-voice wide gains connect here. */
    input: GainNode;
    /** Stereo decorrelated out — connect to the master gain. */
    output: AudioNode;
}
/**
 * Build the wide-layer bus: input → velvet FIR (seed L) → left, input →
 * velvet FIR (seed R) → right. ONE pair of convolvers serves every voice —
 * decorrelation is linear, so applying the same L/R pair to the summed sends
 * is equivalent to decorrelating each voice separately, at flat cost.
 */
export declare function createWideBus(ctx: BaseAudioContext): WideBus;
//# sourceMappingURL=SourceExtent.d.ts.map