/**
 * Speaker-layout rendering: per-voice panning gains for quad / 7.1.2 / 7.1.4
 * masters, written as plain multichannel PCM WAV in the layout's standard
 * channel order.
 *
 * Panning model — 2D pairwise VBAP (tangent law) on the ear-level ring, plus
 * an elevation split into the height ring where the layout has one:
 *
 *   - Source azimuth finds the adjacent ear-ring pair; tangent-law panning
 *     between them (constant power, the standard stereo-pair generalization).
 *   - Elevation above the plane crossfades energy into the height ring
 *     (equal-power, saturating at HEIGHT_FULL_EL). Below-plane sources stay
 *     on the ear ring — none of these layouts has floor speakers.
 *   - LFE receives nothing. Object/bed renders keep LFE for the mixer;
 *     a generated master that auto-fills LFE is a mastering mistake.
 *
 * Azimuth convention matches AmbisonicEncoder: 0 = front, positive toward
 * the listener's LEFT (counterclockwise from above), degrees.
 */
/** WAV channel order per layout (plain multichannel PCM, no extensible). */
export const SPEAKER_LAYOUTS = {
    // L R Ls Rs — the classic quadraphonic square.
    quad: [
        { name: 'FL', azDeg: 45, ring: 'ear' },
        { name: 'FR', azDeg: -45, ring: 'ear' },
        { name: 'BL', azDeg: 135, ring: 'ear' },
        { name: 'BR', azDeg: -135, ring: 'ear' },
    ],
    // 7.1.2: L R C LFE Lss Rss Lrs Rrs + two top-middle (Dolby order).
    '7.1.2': [
        { name: 'FL', azDeg: 30, ring: 'ear' },
        { name: 'FR', azDeg: -30, ring: 'ear' },
        { name: 'FC', azDeg: 0, ring: 'ear' },
        { name: 'LFE', azDeg: 0, ring: 'lfe' },
        { name: 'SL', azDeg: 90, ring: 'ear' },
        { name: 'SR', azDeg: -90, ring: 'ear' },
        { name: 'BL', azDeg: 150, ring: 'ear' },
        { name: 'BR', azDeg: -150, ring: 'ear' },
        { name: 'TL', azDeg: 90, ring: 'height' },
        { name: 'TR', azDeg: -90, ring: 'height' },
    ],
    // 7.1.4: same bed + four tops (front/rear pairs).
    '7.1.4': [
        { name: 'FL', azDeg: 30, ring: 'ear' },
        { name: 'FR', azDeg: -30, ring: 'ear' },
        { name: 'FC', azDeg: 0, ring: 'ear' },
        { name: 'LFE', azDeg: 0, ring: 'lfe' },
        { name: 'SL', azDeg: 90, ring: 'ear' },
        { name: 'SR', azDeg: -90, ring: 'ear' },
        { name: 'BL', azDeg: 150, ring: 'ear' },
        { name: 'BR', azDeg: -150, ring: 'ear' },
        { name: 'TFL', azDeg: 45, ring: 'height' },
        { name: 'TFR', azDeg: -45, ring: 'height' },
        { name: 'TBL', azDeg: 135, ring: 'height' },
        { name: 'TBR', azDeg: -135, ring: 'height' },
    ],
};
/** Elevation (degrees) at which the height ring carries all the energy. */
const HEIGHT_FULL_EL = 55;
const DEG = Math.PI / 180;
/** Wrap an angle to (−180, 180]. */
function wrapDeg(a) {
    let x = a % 360;
    if (x <= -180)
        x += 360;
    if (x > 180)
        x -= 360;
    return x;
}
/**
 * Tangent-law gains across one ring for a source azimuth. Finds the adjacent
 * speaker pair around the ring and splits constant-power between them.
 * Writes into `out` at each speaker's channel index; other ring channels 0.
 */
function panRing(layout, ring, azDeg, weight, out) {
    const members = [];
    for (let i = 0; i < layout.length; i++) {
        if (layout[i].ring === ring)
            members.push(i);
    }
    if (members.length === 0)
        return;
    if (members.length === 1) {
        out[members[0]] += weight;
        return;
    }
    // Sort ring members by azimuth and find the pair bracketing the source.
    members.sort((a, b) => layout[a].azDeg - layout[b].azDeg);
    const az = wrapDeg(azDeg);
    let left = members[members.length - 1]; // wraps around
    let right = members[0];
    for (let i = 0; i < members.length; i++) {
        const cur = members[i];
        const next = members[(i + 1) % members.length];
        const a0 = layout[cur].azDeg;
        let a1 = layout[next].azDeg;
        let a = az;
        if (i === members.length - 1) {
            // wrap segment: a1 sits one revolution up
            a1 += 360;
            if (a < a0)
                a += 360;
        }
        if (a >= a0 && a <= a1) {
            left = cur;
            right = next;
            break;
        }
    }
    const a0 = layout[left].azDeg;
    let a1 = layout[right].azDeg;
    let a = az;
    if (a1 <= a0)
        a1 += 360;
    if (a < a0)
        a += 360;
    const span = Math.max(1e-6, a1 - a0);
    const f = Math.min(1, Math.max(0, (a - a0) / span)); // 0 at left, 1 at right
    // Constant-power pair split.
    out[left] += weight * Math.cos((f * Math.PI) / 2);
    out[right] += weight * Math.sin((f * Math.PI) / 2);
}
/**
 * Panning gains for a source at Cartesian (x, y, z) in the playback frame
 * (listener at origin facing −Z, +X right, +Y up — same as the panner and
 * the ambisonic encoder). Distance attenuation is NOT included — callers
 * compose it exactly like the ambisonic path does.
 *
 * Returns one gain per layout channel, in WAV channel order.
 */
export function speakerGains(layout, x, y, z) {
    const out = new Float32Array(layout.length);
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (dist < 1e-8) {
        // Source at the head: no direction — spread equally over the ear ring.
        let ears = 0;
        for (const s of layout)
            if (s.ring === 'ear')
                ears++;
        const g = ears > 0 ? 1 / Math.sqrt(ears) : 0;
        for (let i = 0; i < layout.length; i++)
            if (layout[i].ring === 'ear')
                out[i] = g;
        return out;
    }
    const nx = x / dist, ny = y / dist, nz = z / dist;
    const azDeg = Math.atan2(-nx, -nz) / DEG; // 0 front, + left — matches AmbiX
    const elDeg = Math.atan2(ny, Math.sqrt(nx * nx + nz * nz)) / DEG;
    const hasHeight = layout.some((s) => s.ring === 'height');
    const el01 = hasHeight ? Math.min(1, Math.max(0, elDeg / HEIGHT_FULL_EL)) : 0;
    const earW = Math.cos((el01 * Math.PI) / 2);
    const topW = Math.sin((el01 * Math.PI) / 2);
    panRing(layout, 'ear', azDeg, earW, out);
    if (topW > 0)
        panRing(layout, 'height', azDeg, topW, out);
    return out;
}
/**
 * How the 2-channel decorrelated wide bus folds into a layout: left leg to
 * the left-hemisphere ear speakers, right leg to the right, each set at
 * equal power. Center and LFE receive nothing (a widened source has no
 * center image by construction). Returns per-channel gains for [L, R] legs.
 */
export function wideBusFanout(layout) {
    const left = new Float32Array(layout.length);
    const right = new Float32Array(layout.length);
    let nL = 0, nR = 0;
    for (const s of layout) {
        if (s.ring !== 'ear')
            continue;
        if (s.azDeg > 1)
            nL++;
        else if (s.azDeg < -1)
            nR++;
    }
    const gL = nL > 0 ? 1 / Math.sqrt(nL) : 0;
    const gR = nR > 0 ? 1 / Math.sqrt(nR) : 0;
    for (let i = 0; i < layout.length; i++) {
        const s = layout[i];
        if (s.ring !== 'ear')
            continue;
        if (s.azDeg > 1)
            left[i] = gL;
        else if (s.azDeg < -1)
            right[i] = gR;
    }
    return { left, right };
}
/**
 * Diffuse (reverb bus) fanout: equal power over every ear-ring speaker
 * except center — the speaker-layout mirror of the FOA path's W-only rule.
 */
export function diffuseFanout(layout) {
    const out = new Float32Array(layout.length);
    let n = 0;
    for (const s of layout)
        if (s.ring === 'ear' && Math.abs(s.azDeg) > 1)
            n++;
    const g = n > 0 ? 1 / Math.sqrt(n) : 0;
    for (let i = 0; i < layout.length; i++) {
        if (layout[i].ring === 'ear' && Math.abs(layout[i].azDeg) > 1)
            out[i] = g;
    }
    return out;
}
//# sourceMappingURL=SpeakerLayouts.js.map