/**
 * Ambisonic encoding using AmbiX convention (ACN channel order, SN3D
 * normalization), first and second order.
 *
 * FOA channels: W (omni), Y (left-right), Z (up-down), X (front-back).
 * Second order appends ACN 4–8: V, T, R, S, U.
 */
export interface AmbisonicGains {
    w: number;
    y: number;
    z: number;
    x: number;
}
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
export declare function computeFOAGains(x: number, y: number, z: number): AmbisonicGains;
export type AmbisonicOrder = 1 | 2;
/** Channel count for an ambisonic order: (order + 1)². */
export declare function ambisonicChannelCount(order: AmbisonicOrder): number;
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
export declare function computeHOAGains(x: number, y: number, z: number, order: AmbisonicOrder): number[];
/**
 * Per-ACN-channel spherical-harmonic ORDER (0, 1 or 2) — used to widen a
 * source in the SH domain: order-n components scale by pointFactorⁿ, so a
 * fully wide source degenerates to pure W while a point keeps full sharpness.
 */
export declare function acnOrder(channel: number): number;
/**
 * Distance attenuation using inverse distance model.
 * Returns a gain multiplier in [0, 1].
 */
export declare function distanceAttenuation(distance: number, refDistance?: number, rolloff?: number): number;
//# sourceMappingURL=AmbisonicEncoder.d.ts.map