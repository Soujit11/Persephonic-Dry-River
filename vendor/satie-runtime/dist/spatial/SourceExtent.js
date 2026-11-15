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
import { PANNER_REF_M } from './WorldAcoustics.js';
import { mulberry32 } from '../core/Random.js';
// Re-exported: tests pin IRs through the same RNG the IR generator uses.
export { mulberry32 };
/**
 * Minimum apparent source radius applied to every voice (FMOD auto-envelopment
 * rule: sound size = 2 × min distance, i.e. radius = min distance). Keeps
 * close approaches continuous: by the time a source reaches the head it has
 * already widened past hard left/right flipping.
 */
export const NEAR_FIELD_RADIUS_M = PANNER_REF_M;
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
export function extentDeg(radiusM, distM) {
    const r = Math.max(radiusM, 1e-6);
    if (distM <= 0)
        return 360;
    if (distM <= r)
        return 180 + 180 * (1 - distM / r);
    return (2 * Math.asin(r / distM) * 180) / Math.PI;
}
/**
 * Equal-power crossfade between the point (HRTF panner) and wide
 * (decorrelated stereo) layers. point² + wide² = 1 at every extent, so total
 * energy is constant through the transition.
 */
export function crossfadeGains(extent) {
    const theta = (Math.min(360, Math.max(0, extent)) / 360) * (Math.PI / 2);
    return { point: Math.cos(theta), wide: Math.sin(theta) };
}
/**
 * Sample a SPHERE source: aim at the closest surface point (center pulled
 * toward the listener by r), extent from center distance. Inside the sphere
 * the aim point is the listener itself — surface distance 0, but the point
 * layer is nearly silent there anyway (extent > 180°).
 */
export function sampleSphereExtent(center, radiusM, listener, out) {
    const dx = center.x - listener.x;
    const dy = center.y - listener.y;
    const dz = center.z - listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    out.extent = extentDeg(radiusM, d);
    if (d <= radiusM || d < 1e-6) {
        out.aim.x = listener.x;
        out.aim.y = listener.y;
        out.aim.z = listener.z;
        out.surfaceDistM = 0;
        return;
    }
    const pull = radiusM / d;
    out.aim.x = center.x - dx * pull;
    out.aim.y = center.y - dy * pull;
    out.aim.z = center.z - dz * pull;
    out.surfaceDistM = d - radiusM;
}
/** @deprecated Finite sources no longer acquire an infinite diffuse floor. */
export const LINE_DIFFUSE_REACH_M = 30;
/**
 * A placed `line` voice (no world strip to follow): the long axis of its
 * box is the line, the short half-span its half width. Reach 0 — only a
 * paved strip of a world carries a diffuse field.
 */
export function lineFromBox(areaMin, areaMax) {
    const sx = areaMax.x - areaMin.x, sz = areaMax.z - areaMin.z;
    const cy = (areaMin.y + areaMax.y) / 2;
    const cx = (areaMin.x + areaMax.x) / 2, cz = (areaMin.z + areaMax.z) / 2;
    const alongX = sx >= sz;
    const polyline = alongX
        ? [{ x: areaMin.x, y: cy, z: cz }, { x: areaMax.x, y: cy, z: cz }]
        : [{ x: cx, y: cy, z: areaMin.z }, { x: cx, y: cy, z: areaMax.z }];
    return { polyline, halfM: Math.max(0, (alongX ? sz : sx) / 2), reachM: 0 };
}
/** The angular span (degrees, 0..360) the polyline's vertices subtend from a point, on the horizontal plane. */
export function polylineSpanDeg(polyline, x, z) {
    if (polyline.length < 2)
        return 0;
    // Unwrap bearings so a road passing beside the listener reads ~180°, not the
    // short way round through the back.
    let prev = Math.atan2(polyline[0].x - x, polyline[0].z - z);
    let lo = 0, hi = 0, acc = 0;
    for (let i = 1; i < polyline.length; i++) {
        const b = Math.atan2(polyline[i].x - x, polyline[i].z - z);
        let d = b - prev;
        if (d > Math.PI)
            d -= 2 * Math.PI;
        else if (d < -Math.PI)
            d += 2 * Math.PI;
        acc += d;
        prev = b;
        if (acc < lo)
            lo = acc;
        if (acc > hi)
            hi = acc;
    }
    return Math.min(360, (hi - lo) * 180 / Math.PI);
}
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
export function sampleLineExtent(line, listener, out, yOffset = 0) {
    const poly = line.polyline;
    const n = poly.length;
    if (n === 0) {
        out.aim.x = listener.x;
        out.aim.y = listener.y;
        out.aim.z = listener.z;
        out.surfaceDistM = 0;
        out.extent = 360;
        return;
    }
    // Nearest point on the polyline (horizontal).
    let bestD2 = Infinity, bx = poly[0].x, by = poly[0].y, bz = poly[0].z;
    for (let i = 0; i < Math.max(1, n - 1); i++) {
        const a = poly[i], b = poly[Math.min(i + 1, n - 1)];
        const abx = b.x - a.x, abz = b.z - a.z;
        const len2 = abx * abx + abz * abz;
        let t = len2 > 0 ? ((listener.x - a.x) * abx + (listener.z - a.z) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = a.x + abx * t, pz = a.z + abz * t;
        const dx = px - listener.x, dz = pz - listener.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
            bestD2 = d2;
            bx = px;
            bz = pz;
            by = a.y + (b.y - a.y) * t;
        }
    }
    const d = Math.sqrt(bestD2);
    const half = Math.max(0, line.halfM);
    const pull = d > 0 ? Math.min(1, half / d) : 0;
    out.aim.x = bx + (listener.x - bx) * pull;
    out.aim.y = by + yOffset;
    out.aim.z = bz + (listener.z - bz) * pull;
    out.surfaceDistM = Math.hypot(out.aim.x - listener.x, out.aim.y - listener.y, out.aim.z - listener.z);
    const span = polylineSpanDeg(poly, listener.x, listener.z);
    if (d < half) {
        // On the line: from its span at the edge to all around at the centre.
        const t = half > 0 ? 1 - d / half : 1;
        out.extent = span + (360 - span) * t;
        return;
    }
    out.extent = span;
}
/** Sample one source's audible surface without allocating or using stale tick distances. */
export function sampleSourceExtent(source, listener, out) {
    if (source.apparent) {
        out.aim.x = source.apparent.x;
        out.aim.y = source.apparent.y;
        out.aim.z = source.apparent.z;
    }
    else if (source._line) {
        sampleLineExtent(source._line, listener, out);
        return;
    }
    else if (source._ringM > 0) {
        sampleRingExtent(source.position, source._ringM, Math.max(source._radiusM || 1, NEAR_FIELD_RADIUS_M), listener, out);
        return;
    }
    else if (source._radiusM > 0) {
        sampleSphereExtent(source.position, Math.max(source._radiusM, NEAR_FIELD_RADIUS_M), listener, out);
        return;
    }
    else {
        out.aim.x = source.position.x;
        out.aim.y = source.position.y;
        out.aim.z = source.position.z;
    }
    out.surfaceDistM = Math.hypot(out.aim.x - listener.x, out.aim.y - listener.y, out.aim.z - listener.z);
    out.extent = extentDeg(NEAR_FIELD_RADIUS_M, out.surfaceDistM);
}
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
export function sampleRingExtent(center, ringR, tubeR, listener, out) {
    const dxc = center.x - listener.x;
    const dyc = center.y - listener.y;
    const dzc = center.z - listener.z;
    const dCenter = Math.sqrt(dxc * dxc + dyc * dyc + dzc * dzc);
    out.extent = extentDeg(ringR, dCenter);
    // Closest point on the horizontal circle.
    const hx = listener.x - center.x;
    const hz = listener.z - center.z;
    const hd = Math.sqrt(hx * hx + hz * hz);
    let cx, cz;
    if (hd < 1e-6) {
        cx = center.x + ringR;
        cz = center.z;
    }
    else {
        cx = center.x + (hx / hd) * ringR;
        cz = center.z + (hz / hd) * ringR;
    }
    const cy = center.y;
    // Pull in by the tube radius toward the listener, like the sphere surface.
    const tx = listener.x - cx, ty = listener.y - cy, tz = listener.z - cz;
    const td = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (td <= tubeR || td < 1e-6) {
        out.aim.x = listener.x;
        out.aim.y = listener.y;
        out.aim.z = listener.z;
        out.surfaceDistM = 0;
        return;
    }
    const pull = tubeR / td;
    out.aim.x = cx + tx * pull;
    out.aim.y = cy + ty * pull;
    out.aim.z = cz + tz * pull;
    out.surfaceDistM = td - tubeR;
}
/**
 * Velvet-noise decorrelation FIR: sparse ±1 impulses at ~densityHz average
 * rate with jittered positions and exponential decay. Perceptually transparent
 * decorrelation at a fraction of dense-FIR cost (DAFx-17). Two IRs from
 * different seeds are mutually incoherent — that pair IS the stereo wide
 * layer.
 *
 * Energy-normalized so convolution is roughly unity loudness.
 */
export function velvetNoiseIR(sampleRate, seconds = 0.03, densityHz = 1000, seed = 1) {
    const len = Math.max(8, Math.round(seconds * sampleRate));
    const ir = new Float32Array(len);
    const rand = mulberry32(seed);
    const grid = sampleRate / densityHz; // samples per impulse slot
    const slots = Math.floor(len / grid);
    for (let s = 0; s < slots; s++) {
        const pos = Math.min(len - 1, Math.floor(s * grid + rand() * grid));
        const sign = rand() < 0.5 ? -1 : 1;
        // Exponential decay across the IR keeps the tail from smearing transients.
        const decay = Math.exp((-3 * pos) / len);
        ir[pos] = sign * decay;
    }
    // NO unit tap at t=0. A dominant direct copy in the "decorrelated" leg
    // is not decorrelated at all: it sums against the HRTF panner leg (whose
    // interaural delays offset it by fractions of a millisecond) and produces
    // a moving comb — audible flanging whenever both legs are comparably loud,
    // which is exactly the near-field widening case. Shipped that way once;
    // walking up to a pinned voice sounded like a chorus pedal. The first
    // random tap lands within ~1/densityHz (≈1 ms) anyway, so onset latency
    // is imperceptible without an anchor.
    let energy = 0;
    for (let i = 0; i < len; i++)
        energy += ir[i] * ir[i];
    if (energy < 1e-12) {
        ir[Math.floor(grid / 2)] = 1;
        energy = 1;
    } // degenerate params
    const norm = 1 / Math.sqrt(energy);
    for (let i = 0; i < len; i++)
        ir[i] *= norm;
    return ir;
}
/**
 * Build the wide-layer bus: input → velvet FIR (seed L) → left, input →
 * velvet FIR (seed R) → right. ONE pair of convolvers serves every voice —
 * decorrelation is linear, so applying the same L/R pair to the summed sends
 * is equivalent to decorrelating each voice separately, at flat cost.
 */
export function createWideBus(ctx) {
    const input = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    const irs = [velvetNoiseIR(ctx.sampleRate, 0.03, 1000, 101),
        velvetNoiseIR(ctx.sampleRate, 0.03, 1000, 202)];
    // Two mutually-incoherent unit-energy IRs deliver DOUBLE the power of the
    // single leg the point²+wide²=1 crossfade assumes (incoherent channels add
    // in power). 1/√2 per channel brings the wide leg back to unity total.
    for (const ir of irs)
        for (let i = 0; i < ir.length; i++)
            ir[i] *= Math.SQRT1_2;
    for (let ch = 0; ch < 2; ch++) {
        const conv = ctx.createConvolver();
        const buf = ctx.createBuffer(1, irs[ch].length, ctx.sampleRate);
        buf.getChannelData(0).set(irs[ch]);
        // ORDER MATTERS: the spec computes the normalization scale at the moment
        // `buffer` is assigned — setting `normalize` afterwards is a no-op. With
        // the flag set late, the browser's IR normalization (~0.044 for a unit-
        // energy 30 ms velvet IR) stayed active on top of our own energy
        // normalization and the whole wide/bed leg ran ~27 dB down: beds were
        // inaudible, and near-field widening DUCKED sources on approach because
        // the crossfade handed their energy to a dead leg.
        conv.normalize = false; // we normalize by energy ourselves (in the IR)
        conv.buffer = buf;
        input.connect(conv);
        conv.connect(merger, 0, ch);
    }
    return { input, output: merger };
}
//# sourceMappingURL=SourceExtent.js.map