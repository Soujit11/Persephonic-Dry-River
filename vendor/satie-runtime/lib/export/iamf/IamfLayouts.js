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
import { AmbisonicsMode, HeadphonesRenderingMode, LoudspeakerLayout, SoundSystem, } from './IamfObu.js';
export const IAMF_RENDER_MODES = ['stereo', 'ambisonic-foa', 'ambisonic-soa', '7.1.2', '7.1.4'];
export function isIamfRenderMode(mode) {
    return IAMF_RENDER_MODES.includes(mode);
}
/** ACN channel count for an ambisonic order: (order + 1)². */
function ambisonicChannels(order) {
    return (order + 1) * (order + 1);
}
/**
 * Scene-based element: every ACN channel is its own mono LPCM substream, so
 * channel_mapping is the identity (RFC 8486 mapping family 2) and the
 * substream order is the ACN order.
 */
function ambisonicLayout(order) {
    const channels = ambisonicChannels(order);
    return {
        label: order === 1 ? 'First-order Ambisonics (AmbiX)' : 'Second-order Ambisonics (AmbiX)',
        channelCount: channels,
        config: {
            kind: 'ambisonics',
            outputChannelCount: channels,
            channelMapping: Array.from({ length: channels }, (_, i) => i),
        },
        substreamChannels: Array.from({ length: channels }, (_, i) => [i]),
        // Scene-based loudness is measured on the stereo decode, not on the
        // ambisonic channels, so the roles here describe that decode.
        loudnessRoles: ['front', 'front'],
        headphonesRenderingMode: HeadphonesRenderingMode.Binaural,
    };
}
const SURROUND_7_1 = ['front', 'front', 'front', 'lfe', 'surround', 'surround', 'surround', 'surround'];
/**
 * Channel-based 7.1.x. Coupled stereo pairs come first — front, then side,
 * then rear, then the top pairs — followed by the mono Centre and LFE
 * substreams, matching `CollectBaseChannelGroupLabels` in iamf-tools.
 */
const LAYOUTS = {
    stereo: {
        label: 'Stereo',
        channelCount: 2,
        config: {
            kind: 'channel',
            loudspeakerLayout: LoudspeakerLayout.Stereo,
            substreamCount: 1,
            coupledSubstreamCount: 1,
        },
        substreamChannels: [[0, 1]],
        loudnessRoles: ['front', 'front'],
        headphonesRenderingMode: HeadphonesRenderingMode.Stereo,
    },
    'ambisonic-foa': ambisonicLayout(1),
    'ambisonic-soa': ambisonicLayout(2),
    '7.1.2': {
        label: '7.1.2',
        channelCount: 10,
        config: {
            kind: 'channel',
            loudspeakerLayout: LoudspeakerLayout.L7_1_2,
            substreamCount: 6,
            coupledSubstreamCount: 4,
        },
        //          L/R    Lss/Rss  Lrs/Rrs  Ltf/Rtf   C     LFE
        substreamChannels: [[0, 1], [4, 5], [6, 7], [8, 9], [2], [3]],
        loudnessRoles: [...SURROUND_7_1, 'height', 'height'],
        nativeSoundSystem: SoundSystem.SS_7_1_2,
        headphonesRenderingMode: HeadphonesRenderingMode.Binaural,
    },
    '7.1.4': {
        label: '7.1.4',
        channelCount: 12,
        config: {
            kind: 'channel',
            loudspeakerLayout: LoudspeakerLayout.L7_1_4,
            substreamCount: 7,
            coupledSubstreamCount: 5,
        },
        //          L/R    Lss/Rss  Lrs/Rrs  Ltf/Rtf  Ltb/Rtb   C     LFE
        substreamChannels: [[0, 1], [4, 5], [6, 7], [8, 9], [10, 11], [2], [3]],
        loudnessRoles: [...SURROUND_7_1, 'height', 'height', 'height', 'height'],
        nativeSoundSystem: SoundSystem.SS_7_1_4,
        headphonesRenderingMode: HeadphonesRenderingMode.Binaural,
    },
};
export function iamfLayout(mode) {
    const layout = LAYOUTS[mode];
    if (!layout)
        throw new Error(`no IAMF layout for render mode "${mode}"`);
    return layout;
}
/** True when the element is scene-based (Ambisonics). */
export function isSceneBased(layout) {
    return layout.config.kind === 'ambisonics';
}
/** The ambisonics_mode a scene-based layout uses. LPCM is always MONO. */
export const SCENE_AMBISONICS_MODE = AmbisonicsMode.Mono;
/** 3 dB down, the fold-down gain the IAMF down-mix chain uses throughout. */
const P = 0.707;
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
export function foldToStereo(mode, channels) {
    const length = channels[0]?.length ?? 0;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    if (mode === 'stereo') {
        left.set(channels[0].subarray(0, length));
        right.set(channels[1].subarray(0, length));
        return [left, right];
    }
    if (mode === 'ambisonic-foa' || mode === 'ambisonic-soa') {
        const w = channels[0];
        const y = channels[1]; // ACN 1
        for (let i = 0; i < length; i++) {
            left[i] = 0.5 * (w[i] + y[i]);
            right[i] = 0.5 * (w[i] - y[i]);
        }
        return [left, right];
    }
    // 7.1.2 / 7.1.4: L R C LFE Lss Rss Lrs Rrs Ltf Rtf [Ltb Rtb]. LFE is
    // excluded, exactly as BS.1770 excludes it from the measurement.
    const [l, r, c, , lss, rss, lrs, rrs, ltf, rtf] = channels;
    const ltb = channels[10];
    const rtb = channels[11];
    for (let i = 0; i < length; i++) {
        const ls5 = P * lss[i] + P * lrs[i];
        const rs5 = P * rss[i] + P * rrs[i];
        const topL = ltb ? ltf[i] + P * ltb[i] : ltf[i];
        const topR = rtb ? rtf[i] + P * rtb[i] : rtf[i];
        left[i] = l[i] + P * ls5 + P * c[i] + P * topL;
        right[i] = r[i] + P * rs5 + P * c[i] + P * topR;
    }
    return [left, right];
}
//# sourceMappingURL=IamfLayouts.js.map