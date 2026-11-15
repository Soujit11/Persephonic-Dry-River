/**
 * IAMF Open Bitstream Unit (OBU) writer — AOM "Immersive Audio Model and
 * Formats" v1.1.0, the version YouTube ingests as Eclipsa Audio.
 *
 * Scope: the descriptor OBUs and Audio Frame OBUs needed to write a static
 * mix — a single Audio Element (scene-based Ambisonics or channel-based
 * loudspeakers), one Mix Presentation, one sub-mix, no Parameter Blocks. Mix
 * gains are carried as `default_mix_gain` on parameter ids that no Parameter
 * Block ever defines, which is how the reference encoder's own PCM templates
 * express "this gain never changes" (iamf-tools
 * `textproto_templates/*_pcm24bit.textproto`).
 *
 * Everything here is byte-aligned: every bitfield the spec defines packs
 * exactly into one byte, so a plain byte writer is enough and there is no
 * partial-byte state to get wrong.
 *
 * Section references in comments are to the v1.1.0 specification.
 */
/** Uint8Array backed by a plain ArrayBuffer (Blob-compatible). */
export type ByteArray = Uint8Array<ArrayBuffer>;
/** obu_type values (§3.2). */
export declare const ObuType: {
    readonly CodecConfig: 0;
    readonly AudioElement: 1;
    readonly MixPresentation: 2;
    readonly ParameterBlock: 3;
    readonly TemporalDelimiter: 4;
    readonly AudioFrame: 5;
    /** OBU_IA_Audio_Frame_ID0 … ID17 carry substream ids 0…17 implicitly. */
    readonly AudioFrameId0: 6;
    readonly SequenceHeader: 31;
};
/** The highest substream id that gets its own implicit-id OBU type. */
export declare const MAX_IMPLICIT_SUBSTREAM_ID = 17;
/** audio_element_type (§3.6). */
export declare const AudioElementType: {
    readonly ChannelBased: 0;
    readonly SceneBased: 1;
};
/** primary_profile / additional_profile (§3.4). */
export declare const Profile: {
    readonly Simple: 0;
    readonly Base: 1;
    readonly BaseEnhanced: 2;
};
/** ambisonics_mode (§3.6.4). LPCM substreams are always MONO. */
export declare const AmbisonicsMode: {
    readonly Mono: 0;
    readonly Projection: 1;
};
/** layout_type (§3.7.3). */
export declare const LayoutType: {
    readonly Loudspeakers: 2;
    readonly Binaural: 3;
};
/**
 * sound_system values for Layout() (§3.7.3). Only the ones Satie can render
 * are named; the numbering is ITU-R BS.2051-3 sound systems A…J.
 */
export declare const SoundSystem: {
    /** A (0+2+0) — stereo. Every sub-mix must carry loudness for this one. */
    readonly Stereo: 0;
    /** J (4+7+0) — 7.1.4. */
    readonly SS_7_1_4: 9;
    /** "same as loudspeaker_layout 6" — 7.1.2. */
    readonly SS_7_1_2: 10;
};
/** loudspeaker_layout values for ChannelAudioLayerConfig (§3.6.2). */
export declare const LoudspeakerLayout: {
    readonly Mono: 0;
    readonly Stereo: 1;
    readonly L5_1: 2;
    readonly L5_1_2: 3;
    readonly L5_1_4: 4;
    readonly L7_1: 5;
    readonly L7_1_2: 6;
    readonly L7_1_4: 7;
    readonly L3_1_2: 8;
    readonly Binaural: 9;
};
/** headphones_rendering_mode in RenderingConfig (§3.7.1). */
export declare const HeadphonesRenderingMode: {
    readonly Stereo: 0;
    readonly Binaural: 1;
};
/** Growable big-endian byte writer. IAMF is big-endian except LPCM samples. */
export declare class ByteWriter {
    private buf;
    private len;
    constructor(capacity?: number);
    private need;
    u8(value: number): this;
    u16(value: number): this;
    u32(value: number): this;
    /** 16-bit two's complement, big-endian. */
    i16(value: number): this;
    /** Four-character code, e.g. 'iamf', 'ipcm'. */
    fourcc(code: string): this;
    /**
     * leb128() (§8): 7 bits per byte, least significant group first, high bit
     * set on every byte but the last. Values are limited to 32 bits.
     */
    leb128(value: number): this;
    /** string (§8): null-terminated UTF-8, at most 128 bytes including the null. */
    string(value: string): this;
    /**
     * Pack consecutive bitfields, most significant first, into whole bytes.
     * Widths must sum to a multiple of 8 — every IAMF bitfield group does.
     */
    bitfields(...fields: readonly (readonly [value: number, width: number])[]): this;
    bytes(data: Uint8Array): this;
    get length(): number;
    /** A copy of the written bytes. */
    finish(): ByteArray;
}
/** Number of bytes leb128 uses for a value — needed to pre-size OBU payloads. */
export declare function leb128Size(value: number): number;
/**
 * dB → the Q7.8 signed fixed-point the spec uses for mix gains and loudness
 * (§3.7.2, §3.7.4): 16-bit two's complement with 8 fractional bits.
 */
export declare function toQ7_8(db: number): number;
/** The largest OBU the profiles allow (§4): 2 MB including the header. */
export declare const MAX_OBU_BYTES: number;
export interface ObuOptions {
    /** obu_redundant_copy — set on repeated descriptors mid-sequence. */
    redundant?: boolean;
    /** Samples the decoder must drop from the start of this audio frame. */
    trimStart?: number;
    /** Samples the decoder must drop from the end of this audio frame. */
    trimEnd?: number;
}
/**
 * Wrap a payload in an OBU header (§3.2). obu_size covers the trimming fields
 * as well as the payload, so the header is assembled after they are known.
 */
export declare function writeObu(type: number, payload: Uint8Array, options?: ObuOptions): ByteArray;
/** IA Sequence Header OBU payload (§3.4). */
export declare function sequenceHeaderPayload(primaryProfile: number, additionalProfile: number): ByteArray;
export interface LpcmCodecConfig {
    codecConfigId: number;
    numSamplesPerFrame: number;
    /** 16, 24 or 32 (§3.11.4). */
    sampleSize: 16 | 24 | 32;
    /** One of 44100, 16000, 32000, 48000, 96000 (§3.11.4). */
    sampleRate: number;
}
/** Sample rates the LPCM decoder config may declare (§3.11.4). */
export declare const LPCM_SAMPLE_RATES: readonly number[];
/**
 * Codec Config OBU payload for LPCM (§3.5, §3.11.4). audio_roll_distance is 0:
 * PCM carries no decoder state, so no frame needs a predecessor.
 */
export declare function lpcmCodecConfigPayload(config: LpcmCodecConfig): ByteArray;
/** Scene-based (Ambisonics) element config, MONO mode (§3.6.4). */
export interface AmbisonicsElementConfig {
    kind: 'ambisonics';
    /** (order + 1)² channels, in AmbiX ACN/SN3D order. */
    outputChannelCount: number;
    /**
     * channel_mapping[i] is the substream index carrying ACN channel i, or 255
     * for a channel that is not transmitted (RFC 8486 mapping family 2).
     */
    channelMapping: readonly number[];
}
/** Channel-based element config, a single non-scalable layer (§3.6.2). */
export interface ChannelElementConfig {
    kind: 'channel';
    loudspeakerLayout: number;
    substreamCount: number;
    coupledSubstreamCount: number;
}
export type AudioElementConfig = AmbisonicsElementConfig | ChannelElementConfig;
export interface AudioElementSpec {
    audioElementId: number;
    codecConfigId: number;
    /** One id per substream, in the order §3.6.3.3 requires. */
    substreamIds: readonly number[];
    config: AudioElementConfig;
}
/** Audio Element OBU payload (§3.6). num_parameters is 0 for a static mix. */
export declare function audioElementPayload(spec: AudioElementSpec): ByteArray;
/** A Layout() plus the LoudnessInfo() measured on it (§3.7.3, §3.7.4). */
export interface LoudnessLayout {
    /** Omit for the binaural layout. */
    soundSystem?: number;
    binaural?: boolean;
    /** Program integrated loudness, LKFS. */
    integratedLoudnessLkfs: number;
    /** Sampled peak, dBFS. */
    digitalPeakDbfs: number;
    /** True peak, dBFS. Written only when present (info_type bit 0). */
    truePeakDbfs?: number;
}
export interface MixPresentationSpec {
    mixPresentationId: number;
    /** BCP-47 tag for the annotations, e.g. 'en-us'. */
    annotationsLanguage: string;
    presentationAnnotation: string;
    elementAnnotation: string;
    audioElementId: number;
    headphonesRenderingMode: number;
    /** parameter_id for element_mix_gain — deliberately never defined by a block. */
    elementMixGainParameterId: number;
    /** parameter_id for output_mix_gain — likewise undefined. */
    outputMixGainParameterId: number;
    /** Ticks per second for the mix-gain parameter definitions. */
    parameterRate: number;
    elementMixGainDb: number;
    outputMixGainDb: number;
    /** Must include the stereo layout: every sub-mix is required to carry it. */
    layouts: readonly LoudnessLayout[];
}
/** Mix Presentation OBU payload (§3.7), one sub-mix over one Audio Element. */
export declare function mixPresentationPayload(spec: MixPresentationSpec): ByteArray;
/**
 * Audio Frame OBU (§3.9). Substream ids 0…17 use the dedicated OBU types that
 * carry the id implicitly; anything higher writes it into the payload.
 */
export declare function audioFrameObu(substreamId: number, frame: Uint8Array, options?: ObuOptions): ByteArray;
//# sourceMappingURL=IamfObu.d.ts.map