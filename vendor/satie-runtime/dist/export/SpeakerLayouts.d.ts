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
export interface Speaker {
    /** Channel label, for manifests/debugging. */
    name: string;
    /** Azimuth in degrees, 0 = front, + = listener's left. */
    azDeg: number;
    /** Elevation ring: 'ear' or 'height'. LFE is neither. */
    ring: 'ear' | 'height' | 'lfe';
}
/** WAV channel order per layout (plain multichannel PCM, no extensible). */
export declare const SPEAKER_LAYOUTS: Record<string, Speaker[]>;
export type SpeakerLayoutName = keyof typeof SPEAKER_LAYOUTS;
/**
 * Panning gains for a source at Cartesian (x, y, z) in the playback frame
 * (listener at origin facing −Z, +X right, +Y up — same as the panner and
 * the ambisonic encoder). Distance attenuation is NOT included — callers
 * compose it exactly like the ambisonic path does.
 *
 * Returns one gain per layout channel, in WAV channel order.
 */
export declare function speakerGains(layout: Speaker[], x: number, y: number, z: number): Float32Array;
/**
 * How the 2-channel decorrelated wide bus folds into a layout: left leg to
 * the left-hemisphere ear speakers, right leg to the right, each set at
 * equal power. Center and LFE receive nothing (a widened source has no
 * center image by construction). Returns per-channel gains for [L, R] legs.
 */
export declare function wideBusFanout(layout: Speaker[]): {
    left: Float32Array;
    right: Float32Array;
};
/**
 * Diffuse (reverb bus) fanout: equal power over every ear-ring speaker
 * except center — the speaker-layout mirror of the FOA path's W-only rule.
 */
export declare function diffuseFanout(layout: Speaker[]): Float32Array;
//# sourceMappingURL=SpeakerLayouts.d.ts.map