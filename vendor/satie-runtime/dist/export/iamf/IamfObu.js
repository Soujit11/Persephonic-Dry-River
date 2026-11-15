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
/** obu_type values (§3.2). */
export const ObuType = {
    CodecConfig: 0,
    AudioElement: 1,
    MixPresentation: 2,
    ParameterBlock: 3,
    TemporalDelimiter: 4,
    AudioFrame: 5,
    /** OBU_IA_Audio_Frame_ID0 … ID17 carry substream ids 0…17 implicitly. */
    AudioFrameId0: 6,
    SequenceHeader: 31,
};
/** The highest substream id that gets its own implicit-id OBU type. */
export const MAX_IMPLICIT_SUBSTREAM_ID = 17;
/** audio_element_type (§3.6). */
export const AudioElementType = { ChannelBased: 0, SceneBased: 1 };
/** primary_profile / additional_profile (§3.4). */
export const Profile = { Simple: 0, Base: 1, BaseEnhanced: 2 };
/** ambisonics_mode (§3.6.4). LPCM substreams are always MONO. */
export const AmbisonicsMode = { Mono: 0, Projection: 1 };
/** layout_type (§3.7.3). */
export const LayoutType = { Loudspeakers: 2, Binaural: 3 };
/**
 * sound_system values for Layout() (§3.7.3). Only the ones Satie can render
 * are named; the numbering is ITU-R BS.2051-3 sound systems A…J.
 */
export const SoundSystem = {
    /** A (0+2+0) — stereo. Every sub-mix must carry loudness for this one. */
    Stereo: 0,
    /** J (4+7+0) — 7.1.4. */
    SS_7_1_4: 9,
    /** "same as loudspeaker_layout 6" — 7.1.2. */
    SS_7_1_2: 10,
};
/** loudspeaker_layout values for ChannelAudioLayerConfig (§3.6.2). */
export const LoudspeakerLayout = {
    Mono: 0, Stereo: 1, L5_1: 2, L5_1_2: 3, L5_1_4: 4,
    L7_1: 5, L7_1_2: 6, L7_1_4: 7, L3_1_2: 8, Binaural: 9,
};
/** headphones_rendering_mode in RenderingConfig (§3.7.1). */
export const HeadphonesRenderingMode = { Stereo: 0, Binaural: 1 };
/** Growable big-endian byte writer. IAMF is big-endian except LPCM samples. */
export class ByteWriter {
    buf;
    len = 0;
    constructor(capacity = 256) {
        this.buf = new Uint8Array(new ArrayBuffer(Math.max(16, capacity)));
    }
    need(extra) {
        if (this.len + extra <= this.buf.length)
            return;
        let size = this.buf.length * 2;
        while (size < this.len + extra)
            size *= 2;
        const next = new Uint8Array(new ArrayBuffer(size));
        next.set(this.buf.subarray(0, this.len));
        this.buf = next;
    }
    u8(value) {
        this.need(1);
        this.buf[this.len++] = value & 0xff;
        return this;
    }
    u16(value) {
        return this.u8(value >>> 8).u8(value);
    }
    u32(value) {
        return this.u8(value >>> 24).u8(value >>> 16).u8(value >>> 8).u8(value);
    }
    /** 16-bit two's complement, big-endian. */
    i16(value) {
        return this.u16(value < 0 ? value + 0x10000 : value);
    }
    /** Four-character code, e.g. 'iamf', 'ipcm'. */
    fourcc(code) {
        if (code.length !== 4)
            throw new Error(`fourcc must be 4 chars: "${code}"`);
        for (let i = 0; i < 4; i++)
            this.u8(code.charCodeAt(i));
        return this;
    }
    /**
     * leb128() (§8): 7 bits per byte, least significant group first, high bit
     * set on every byte but the last. Values are limited to 32 bits.
     */
    leb128(value) {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
            throw new Error(`leb128 value out of range: ${value}`);
        }
        let v = value >>> 0;
        for (;;) {
            const group = v & 0x7f;
            v >>>= 7;
            if (v === 0)
                return this.u8(group);
            this.u8(group | 0x80);
        }
    }
    /** string (§8): null-terminated UTF-8, at most 128 bytes including the null. */
    string(value) {
        const utf8 = new TextEncoder().encode(value);
        if (utf8.length > 127)
            throw new Error(`IAMF string exceeds 128 bytes: "${value}"`);
        this.bytes(utf8);
        return this.u8(0);
    }
    /**
     * Pack consecutive bitfields, most significant first, into whole bytes.
     * Widths must sum to a multiple of 8 — every IAMF bitfield group does.
     */
    bitfields(...fields) {
        let total = 0;
        for (const [, width] of fields)
            total += width;
        if (total % 8 !== 0)
            throw new Error(`bitfields must fill whole bytes, got ${total} bits`);
        let acc = 0;
        let filled = 0;
        for (const [value, width] of fields) {
            const max = (1 << width) - 1;
            if (value < 0 || value > max) {
                throw new Error(`value ${value} does not fit in ${width} bits`);
            }
            acc = (acc << width) | value;
            filled += width;
            while (filled >= 8) {
                filled -= 8;
                this.u8(acc >>> filled);
            }
            acc &= (1 << filled) - 1;
        }
        return this;
    }
    bytes(data) {
        this.need(data.length);
        this.buf.set(data, this.len);
        this.len += data.length;
        return this;
    }
    get length() { return this.len; }
    /** A copy of the written bytes. */
    finish() {
        return this.buf.slice(0, this.len);
    }
}
/** Number of bytes leb128 uses for a value — needed to pre-size OBU payloads. */
export function leb128Size(value) {
    let n = 1;
    let v = value >>> 0;
    while (v > 0x7f) {
        v >>>= 7;
        n++;
    }
    return n;
}
/**
 * dB → the Q7.8 signed fixed-point the spec uses for mix gains and loudness
 * (§3.7.2, §3.7.4): 16-bit two's complement with 8 fractional bits.
 */
export function toQ7_8(db) {
    if (!Number.isFinite(db))
        throw new Error(`Q7.8 value must be finite, got ${db}`);
    const clamped = Math.max(-128, Math.min(127.99609375, db));
    return Math.round(clamped * 256);
}
/** The largest OBU the profiles allow (§4): 2 MB including the header. */
export const MAX_OBU_BYTES = 1 << 21;
/**
 * Wrap a payload in an OBU header (§3.2). obu_size covers the trimming fields
 * as well as the payload, so the header is assembled after they are known.
 */
export function writeObu(type, payload, options = {}) {
    const trimStart = options.trimStart ?? 0;
    const trimEnd = options.trimEnd ?? 0;
    const trimming = trimStart > 0 || trimEnd > 0;
    if (trimming && type !== ObuType.AudioFrame &&
        !(type >= ObuType.AudioFrameId0 && type <= ObuType.AudioFrameId0 + MAX_IMPLICIT_SUBSTREAM_ID)) {
        throw new Error(`obu_trimming_status_flag is only valid on audio frames (type ${type})`);
    }
    // num_samples_to_trim_at_end precedes _at_start (§3.2).
    const trim = new ByteWriter(16);
    if (trimming)
        trim.leb128(trimEnd).leb128(trimStart);
    const trimBytes = trim.finish();
    const size = trimBytes.length + payload.length;
    const out = new ByteWriter(size + 8);
    out.bitfields([type, 5], [options.redundant ? 1 : 0, 1], [trimming ? 1 : 0, 1], [0, 1]);
    out.leb128(size);
    out.bytes(trimBytes);
    out.bytes(payload);
    const obu = out.finish();
    if (obu.length > MAX_OBU_BYTES) {
        throw new Error(`OBU of ${obu.length} bytes exceeds the ${MAX_OBU_BYTES}-byte profile limit`);
    }
    return obu;
}
/** IA Sequence Header OBU payload (§3.4). */
export function sequenceHeaderPayload(primaryProfile, additionalProfile) {
    return new ByteWriter(8).fourcc('iamf').u8(primaryProfile).u8(additionalProfile).finish();
}
/** Sample rates the LPCM decoder config may declare (§3.11.4). */
export const LPCM_SAMPLE_RATES = [16000, 32000, 44100, 48000, 96000];
/**
 * Codec Config OBU payload for LPCM (§3.5, §3.11.4). audio_roll_distance is 0:
 * PCM carries no decoder state, so no frame needs a predecessor.
 */
export function lpcmCodecConfigPayload(config) {
    if (!LPCM_SAMPLE_RATES.includes(config.sampleRate)) {
        throw new Error(`IAMF LPCM does not allow a sample rate of ${config.sampleRate} Hz`);
    }
    return new ByteWriter(32)
        .leb128(config.codecConfigId)
        .fourcc('ipcm')
        .leb128(config.numSamplesPerFrame)
        .i16(0) // audio_roll_distance
        .u8(1) // sample_format_flags: little-endian
        .u8(config.sampleSize)
        .u32(config.sampleRate)
        .finish();
}
/** Audio Element OBU payload (§3.6). num_parameters is 0 for a static mix. */
export function audioElementPayload(spec) {
    const { config } = spec;
    const w = new ByteWriter(64);
    w.leb128(spec.audioElementId);
    w.bitfields([config.kind === 'ambisonics' ? AudioElementType.SceneBased : AudioElementType.ChannelBased, 3], [0, 5]);
    w.leb128(spec.codecConfigId);
    w.leb128(spec.substreamIds.length);
    for (const id of spec.substreamIds)
        w.leb128(id);
    w.leb128(0); // num_parameters — no demixing or recon gain for a single layer
    if (config.kind === 'ambisonics') {
        if (config.channelMapping.length !== config.outputChannelCount) {
            throw new Error('channel_mapping must have one entry per ambisonic channel');
        }
        if (config.outputChannelCount > 255 || spec.substreamIds.length > 255) {
            throw new Error('ambisonics config counts are 8-bit fields');
        }
        w.leb128(AmbisonicsMode.Mono);
        w.u8(config.outputChannelCount);
        w.u8(spec.substreamIds.length); // substream_count
        for (const m of config.channelMapping)
            w.u8(m);
    }
    else {
        if (config.substreamCount !== spec.substreamIds.length) {
            throw new Error('substream_count must match the number of substream ids');
        }
        w.bitfields([1, 3], [0, 5]); // num_layers = 1
        w.bitfields([config.loudspeakerLayout, 4], [0, 1], // output_gain_is_present_flag
        [0, 1], // recon_gain_is_present_flag — never needed for lossless LPCM
        [0, 2]);
        w.u8(config.substreamCount);
        w.u8(config.coupledSubstreamCount);
    }
    return w.finish();
}
/**
 * MixGainParamDefinition (§3.6.1 + §3.7.2) with param_definition_mode = 1, so
 * the definition carries no duration fields and `default_mix_gain` governs
 * for as long as no Parameter Block claims the id.
 */
function writeMixGainParamDefinition(w, parameterId, rate, gainDb) {
    w.leb128(parameterId);
    w.leb128(rate);
    w.bitfields([1, 1], [0, 7]); // param_definition_mode = 1, reserved
    w.i16(toQ7_8(gainDb));
}
/** Mix Presentation OBU payload (§3.7), one sub-mix over one Audio Element. */
export function mixPresentationPayload(spec) {
    if (spec.layouts.length === 0)
        throw new Error('a sub-mix needs at least the stereo loudness layout');
    const w = new ByteWriter(128);
    w.leb128(spec.mixPresentationId);
    w.leb128(1); // count_label
    w.string(spec.annotationsLanguage);
    w.string(spec.presentationAnnotation);
    w.leb128(1); // num_sub_mixes
    w.leb128(1); // num_audio_elements
    w.leb128(spec.audioElementId);
    w.string(spec.elementAnnotation);
    // RenderingConfig (§3.7.1)
    w.bitfields([spec.headphonesRenderingMode, 2], [0, 6]);
    w.leb128(0); // rendering_config_extension_size
    writeMixGainParamDefinition(w, spec.elementMixGainParameterId, spec.parameterRate, spec.elementMixGainDb);
    writeMixGainParamDefinition(w, spec.outputMixGainParameterId, spec.parameterRate, spec.outputMixGainDb);
    w.leb128(spec.layouts.length);
    for (const layout of spec.layouts) {
        if (layout.binaural) {
            w.bitfields([LayoutType.Binaural, 2], [0, 6]);
        }
        else {
            if (layout.soundSystem === undefined)
                throw new Error('a loudspeaker layout needs a sound_system');
            w.bitfields([LayoutType.Loudspeakers, 2], [layout.soundSystem, 4], [0, 2]);
        }
        const infoType = layout.truePeakDbfs === undefined ? 0 : 1;
        w.u8(infoType);
        w.i16(toQ7_8(layout.integratedLoudnessLkfs));
        w.i16(toQ7_8(layout.digitalPeakDbfs));
        if (layout.truePeakDbfs !== undefined)
            w.i16(toQ7_8(layout.truePeakDbfs));
    }
    // MixPresentationTags is optional and only recognised when obu_size runs
    // past the sub-mix loop, so leaving it out is the way to omit it.
    return w.finish();
}
/**
 * Audio Frame OBU (§3.9). Substream ids 0…17 use the dedicated OBU types that
 * carry the id implicitly; anything higher writes it into the payload.
 */
export function audioFrameObu(substreamId, frame, options = {}) {
    if (substreamId <= MAX_IMPLICIT_SUBSTREAM_ID) {
        return writeObu(ObuType.AudioFrameId0 + substreamId, frame, options);
    }
    const payload = new ByteWriter(frame.length + 8).leb128(substreamId).bytes(frame).finish();
    return writeObu(ObuType.AudioFrame, payload, options);
}
//# sourceMappingURL=IamfObu.js.map