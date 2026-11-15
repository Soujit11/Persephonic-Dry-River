/**
 * The bridge between Satie's render modes and IAMF Audio Elements: which
 * element type each mode becomes, how its channels are split into substreams,
 * which loudness layouts the Mix Presentation must carry, and how the mix is
 * folded to stereo for the loudness measurement.
 *
 * Channel orders line up by construction. Satie's `SPEAKER_LAYOUTS` write
 * 7.1.x as FL FR FC LFE SL SR BL BR + tops, which is exactly the input order
 * the IAMF reference encoder expects (L R C LFE Lss Rss Lrs Rrs Ltf Rtf
 * [Ltb Rtb]), and ambisonic renders are already AmbiX ACN/SN3D, which is the
 * only ambisonic convention IAMF defines.
 */
import { type AudioElementConfig } from './IamfObu.js';
import type { ChannelRole } from './Bs1770.js';
/** The Satie render modes that have an IAMF representation. */
export type IamfRenderMode = 'stereo' | 'ambisonic-foa' | 'ambisonic-soa' | '7.1.2' | '7.1.4';
export declare const IAMF_RENDER_MODES: readonly IamfRenderMode[];
export declare function isIamfRenderMode(mode: string): mode is IamfRenderMode;
export interface IamfLayoutSpec {
    /** How the layout is described to a person. */
    label: string;
    /** Rendered channel count, in Satie's channel order. */
    channelCount: number;
    /** The Audio Element config this layout becomes. */
    config: AudioElementConfig;
    /**
     * One entry per substream, listing the rendered channel indices it carries
     * (one for a mono substream, two for a coupled stereo pair) in the order
     * §3.6.3.3 requires: coupled substreams first, then the mono ones.
     */
    substreamChannels: readonly (readonly number[])[];
    /** BS.1770 weighting class per rendered channel. */
    loudnessRoles: readonly ChannelRole[];
    /**
     * sound_system values whose loudness the Mix Presentation reports, beyond
     * the stereo layout every sub-mix must include.
     */
    nativeSoundSystem?: number;
    /** headphones_rendering_mode for the RenderingConfig. */
    headphonesRenderingMode: number;
}
export declare function iamfLayout(mode: IamfRenderMode): IamfLayoutSpec;
/** True when the element is scene-based (Ambisonics). */
export declare function isSceneBased(layout: IamfLayoutSpec): boolean;
/** The ambisonics_mode a scene-based layout uses. LPCM is always MONO. */
export declare const SCENE_AMBISONICS_MODE: 0;
/**
 * Fold a rendered mix to stereo for the loudness measurement.
 *
 * Ambisonics decodes through a coincident virtual cardioid pair aimed at the
 * listener's left and right: with AmbiX SN3D, a plane wave from direction d
 * gives W = 1 and Y = d·left, so 0.5·(W ± Y) is exactly a cardioid at ±90°.
 * Components above first order do not reach a first-order virtual mic, so
 * second order folds down through the same two channels.
 *
 * Channel-based mixes follow the down-mix chain in Annex A2.2 with the
 * Mode 2 coefficients (α = β = δ = 0.707): the rear pair folds into the side
 * pair, that into L/R, and Centre enters at -3 dB. The one departure is the
 * height channels, which the spec's chain drops when the target has no height
 * layer; dropping them would under-report the loudness of a mix that puts
 * real content overhead, so they fold into their own side at -3 dB.
 *
 * IAMF leaves scene-based and reduced-layout rendering implementation-defined
 * (§7.3.2 admits "an implementation-specific renderer"), so this is a
 * documented choice, not a deviation from a normative matrix.
 */
export declare function foldToStereo(mode: IamfRenderMode, channels: readonly Float32Array[]): [Float32Array, Float32Array];
//# sourceMappingURL=IamfLayouts.d.ts.map