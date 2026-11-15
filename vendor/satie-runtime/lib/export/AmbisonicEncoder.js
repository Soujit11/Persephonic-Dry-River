/**
 * Ambisonic encoding using AmbiX convention (ACN channel order, SN3D
 * normalization), first and second order.
 *
 * FOA channels: W (omni), Y (left-right), Z (up-down), X (front-back).
 * Second order appends ACN 4–8: V, T, R, S, U.
 */
/**
 * Compute FOA encoding gains for a source at Cartesian position (x, y, z)
 * relative to the listener at the origin.
 *
 * Uses AmbiX convention (ACN channel ordering, SN3D normalization):
 *   Channel 0 (W) = 1                                    (omni)
 *   Channel 1 (Y) = sin(azimuth) * cos(elevation)        (left-right)
 *   Channel 2 (Z) = sin(elevation)                       (up-down)
 *   Channel 3 (X) = cos(azimuth) * cos(elevation)        (front-back)
 */
export function computeFOAGains(x, y, z) {
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (dist < 1e-8) {
        // Source at listener position — encode as omnidirectional
        return { w: 1, y: 0, z: 0, x: 0 };
    }
    // Normalize direction
    const nx = x / dist;
    const ny = y / dist;
    const nz = z / dist;
    // Spherical coordinates. The Web Audio listener faces -Z (+X right, +Y up),
    // while AmbiX azimuth is 0 at front, increasing counterclockwise (toward the
    // listener's left). So front = -Z maps to azimuth 0 and left = -X to +90°.
    // elevation: angle from XZ plane toward +Y (up)
    const azimuth = Math.atan2(-nx, -nz);
    const horizontalDist = Math.sqrt(nx * nx + nz * nz);
    const elevation = Math.atan2(ny, horizontalDist);
    const cosElev = Math.cos(elevation);
    return {
        w: 1, // W: omni (SN3D normalization = 1 for order 0)
        y: Math.sin(azimuth) * cosElev, // Y: left-right
        z: Math.sin(elevation), // Z: up-down
        x: Math.cos(azimuth) * cosElev, // X: front-back
    };
}
/** Channel count for an ambisonic order: (order + 1)². */
export function ambisonicChannelCount(order) {
    return (order + 1) * (order + 1);
}
const SQRT3_2 = Math.sqrt(3) / 2;
/**
 * Ambisonic encoding gains in ACN order with SN3D normalization, up to the
 * requested order. Order 1 returns exactly `computeFOAGains` as an array
 * [W, Y, Z, X]; order 2 appends ACN 4–8:
 *
 *   ACN4 (V) = (√3/2) · sin(2·az) · cos²(el)
 *   ACN5 (T) = (√3/2) · sin(az) · sin(2·el)
 *   ACN6 (R) = (3·sin²(el) − 1) / 2
 *   ACN7 (S) = (√3/2) · cos(az) · sin(2·el)
 *   ACN8 (U) = (√3/2) · cos(2·az) · cos²(el)
 *
 * Same frame convention as `computeFOAGains`: Web Audio listener faces −Z,
 * AmbiX azimuth 0 at front increasing toward the listener's left.
 */
export function computeHOAGains(x, y, z, order) {
    const foa = computeFOAGains(x, y, z);
    const gains = [foa.w, foa.y, foa.z, foa.x];
    if (order === 1)
        return gains;
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (dist < 1e-8) {
        // Omni: every directional component (all orders) is zero.
        gains.push(0, 0, 0, 0, 0);
        return gains;
    }
    const nx = x / dist, ny = y / dist, nz = z / dist;
    const azimuth = Math.atan2(-nx, -nz);
    const elevation = Math.atan2(ny, Math.sqrt(nx * nx + nz * nz));
    const cosEl = Math.cos(elevation);
    const sinEl = Math.sin(elevation);
    const cosEl2 = cosEl * cosEl;
    const sin2El = 2 * sinEl * cosEl;
    gains.push(SQRT3_2 * Math.sin(2 * azimuth) * cosEl2, // ACN4 V
    SQRT3_2 * Math.sin(azimuth) * sin2El, // ACN5 T
    (3 * sinEl * sinEl - 1) / 2, // ACN6 R
    SQRT3_2 * Math.cos(azimuth) * sin2El, // ACN7 S
    SQRT3_2 * Math.cos(2 * azimuth) * cosEl2);
    return gains;
}
/**
 * Per-ACN-channel spherical-harmonic ORDER (0, 1 or 2) — used to widen a
 * source in the SH domain: order-n components scale by pointFactorⁿ, so a
 * fully wide source degenerates to pure W while a point keeps full sharpness.
 */
export function acnOrder(channel) {
    return Math.floor(Math.sqrt(channel));
}
/**
 * Distance attenuation using inverse distance model.
 * Returns a gain multiplier in [0, 1].
 */
export function distanceAttenuation(distance, refDistance = 1, rolloff = 1) {
    // Web Audio's inverse distance model clamps only at refDistance — there is
    // no upper clamp (maxDistance applies to the linear model only), so distant
    // sources keep attenuating exactly like the live HRTF panner.
    const d = Math.max(distance, refDistance);
    return refDistance / (refDistance + rolloff * (d - refDistance));
}
//# sourceMappingURL=AmbisonicEncoder.js.map