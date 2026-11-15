/**
 * IAMF export orchestrator: script → an IAMF v1.1.0 IA Sequence, delivered
 * both standalone (`.iamf`) and wrapped in MP4 (`.mp4`), which is the file
 * YouTube ingests as Eclipsa Audio.
 *
 * Pipeline: parse → offline render at 48 kHz in the requested layout →
 * split the rendered channels into substreams → measure BS.1770 loudness for
 * the Mix Presentation → descriptor OBUs → LPCM Audio Frame OBUs, one
 * Temporal Unit per 1024 samples → container.
 *
 * Codec is LPCM (`ipcm`). It is lossless, needs no encoder in the browser,
 * and YouTube accepts both PCM and Opus flavours of Eclipsa Audio; a master
 * being uploaded for transcoding has nothing to gain from being lossy first.
 *
 * Everything is fixed at 48 kHz, which is what YouTube asks for.
 */
import { renderOffline } from '../OfflineRenderer.js';
import { interleavePcm } from '../RiffWriter.js';
import { ObuType, Profile, SoundSystem, ByteWriter, writeObu, sequenceHeaderPayload, lpcmCodecConfigPayload, audioElementPayload, mixPresentationPayload, audioFrameObu, } from './IamfObu.js';
import { iamfLayout, foldToStereo, isIamfRenderMode } from './IamfLayouts.js';
import { writeIamfMp4 } from './Mp4Writer.js';
import { measureLayoutLoudness, IAMF_LOUDNESS_RATE } from './Bs1770.js';
export { IAMF_RENDER_MODES, isIamfRenderMode, iamfLayout } from './IamfLayouts.js';
/** IAMF export is 48 kHz, always. */
export const IAMF_SAMPLE_RATE = IAMF_LOUDNESS_RATE;
/**
 * Samples per Audio Frame OBU. 1024 is what the reference encoder's LPCM
 * templates use, and at 48 kHz it keeps every OBU far inside the 2 MB cap.
 */
export const IAMF_FRAME_SAMPLES = 1024;
/**
 * Identifiers. The values match the reference encoder's templates so a
 * bitstream from Satie diffs cleanly against one from `iamf-tools`.
 */
const CODEC_CONFIG_ID = 200;
const AUDIO_ELEMENT_ID = 300;
const MIX_PRESENTATION_ID = 42;
/** Parameter ids no Parameter Block ever defines, so default_mix_gain governs. */
const ELEMENT_MIX_GAIN_PARAM_ID = 999;
const OUTPUT_MIX_GAIN_PARAM_ID = 998;
const ANNOTATIONS_LANGUAGE = 'en-us';
/**
 * Base Profile. Every layout Satie exports is a single Audio Element of at
 * most 12 channels, inside Base's budget of two elements and 18 channels, and
 * YouTube asks for Base or Base-Enhanced.
 */
const PRIMARY_PROFILE = Profile.Base;
/**
 * Build the IA Sequence from already-rendered channels. Pure: no audio
 * context, no DOM, so the bitstream can be checked in a unit test.
 *
 * `channels` must be in Satie's channel order for the mode — the same order
 * `renderOffline` produces and `encodeWAV` writes.
 */
export function buildIamfSequence(channels, options) {
    const layout = iamfLayout(options.mode);
    const bitDepth = options.bitDepth ?? 24;
    if (channels.length !== layout.channelCount) {
        throw new Error(`IAMF ${layout.label} needs ${layout.channelCount} channels, got ${channels.length}`);
    }
    const totalSamples = channels[0]?.length ?? 0;
    if (totalSamples === 0)
        throw new Error('IAMF export: nothing was rendered');
    // Loudness first: the measurement lands inside the Mix Presentation OBU,
    // which is itself part of the descriptors.
    const [left, right] = foldToStereo(options.mode, channels);
    const stereoLoudness = measureLayoutLoudness([left, right], ['front', 'front'], IAMF_SAMPLE_RATE);
    const nativeLoudness = layout.nativeSoundSystem === undefined
        ? undefined
        : measureLayoutLoudness(channels, layout.loudnessRoles, IAMF_SAMPLE_RATE);
    const layouts = [toLoudnessLayout(SoundSystem.Stereo, stereoLoudness)];
    if (layout.nativeSoundSystem !== undefined && nativeLoudness) {
        layouts.push(toLoudnessLayout(layout.nativeSoundSystem, nativeLoudness));
    }
    const substreamIds = layout.substreamChannels.map((_, i) => i);
    const descriptors = new ByteWriter(512);
    descriptors.bytes(writeObu(ObuType.SequenceHeader, sequenceHeaderPayload(PRIMARY_PROFILE, PRIMARY_PROFILE)));
    descriptors.bytes(writeObu(ObuType.CodecConfig, lpcmCodecConfigPayload({
        codecConfigId: CODEC_CONFIG_ID,
        numSamplesPerFrame: IAMF_FRAME_SAMPLES,
        sampleSize: bitDepth,
        sampleRate: IAMF_SAMPLE_RATE,
    })));
    descriptors.bytes(writeObu(ObuType.AudioElement, audioElementPayload({
        audioElementId: AUDIO_ELEMENT_ID,
        codecConfigId: CODEC_CONFIG_ID,
        substreamIds,
        config: layout.config,
    })));
    descriptors.bytes(writeObu(ObuType.MixPresentation, mixPresentationPayload({
        mixPresentationId: MIX_PRESENTATION_ID,
        annotationsLanguage: ANNOTATIONS_LANGUAGE,
        presentationAnnotation: clampAnnotation(options.title ?? 'Satie scene'),
        elementAnnotation: layout.label,
        audioElementId: AUDIO_ELEMENT_ID,
        headphonesRenderingMode: layout.headphonesRenderingMode,
        elementMixGainParameterId: ELEMENT_MIX_GAIN_PARAM_ID,
        outputMixGainParameterId: OUTPUT_MIX_GAIN_PARAM_ID,
        parameterRate: IAMF_SAMPLE_RATE,
        elementMixGainDb: 0,
        outputMixGainDb: 0,
        layouts,
    })));
    // Frames are fixed length, so the tail is padded with silence and the last
    // Temporal Unit carries num_samples_to_trim_at_end (§3.2).
    const unitCount = Math.ceil(totalSamples / IAMF_FRAME_SAMPLES);
    const paddedSamples = unitCount * IAMF_FRAME_SAMPLES - totalSamples;
    const temporalUnits = [];
    const unitDurations = [];
    for (let unit = 0; unit < unitCount; unit++) {
        const start = unit * IAMF_FRAME_SAMPLES;
        const isLast = unit === unitCount - 1;
        const trimEnd = isLast ? paddedSamples : 0;
        const writer = new ByteWriter(4096);
        for (let s = 0; s < layout.substreamChannels.length; s++) {
            const slices = layout.substreamChannels[s].map((ch) => frameSlice(channels[ch], start, IAMF_FRAME_SAMPLES));
            writer.bytes(audioFrameObu(substreamIds[s], interleavePcm(slices, bitDepth), { trimEnd }));
        }
        temporalUnits.push(writer.finish());
        // A sample's duration excludes what is trimmed off its end (§6.2.2).
        unitDurations.push(IAMF_FRAME_SAMPLES - trimEnd);
    }
    return {
        descriptors: descriptors.finish(),
        temporalUnits,
        unitDurations,
        loudness: { stereo: stereoLoudness, native: nativeLoudness },
        substreamCount: substreamIds.length,
        channelCount: layout.channelCount,
        paddedSamples,
    };
}
/** A fixed-length window of a channel, zero-filled past the end. */
function frameSlice(channel, start, length) {
    const out = new Float32Array(length);
    const available = Math.max(0, Math.min(length, channel.length - start));
    if (available > 0)
        out.set(channel.subarray(start, start + available));
    return out;
}
/**
 * -Infinity is not representable in the Q7.8 loudness fields, so silence is
 * reported at the bottom of the range rather than wrapping to a loud value.
 */
const Q7_8_FLOOR_DB = -128;
function toLoudnessLayout(soundSystem, loudness) {
    return {
        soundSystem,
        integratedLoudnessLkfs: finiteDb(loudness.integratedLkfs),
        digitalPeakDbfs: finiteDb(loudness.digitalPeakDbfs),
        truePeakDbfs: finiteDb(loudness.truePeakDbfs),
    };
}
function finiteDb(db) {
    return Number.isFinite(db) ? db : Q7_8_FLOOR_DB;
}
/** IAMF strings cap at 128 bytes including the terminator. */
function clampAnnotation(text) {
    let out = text.trim() || 'Satie scene';
    while (new TextEncoder().encode(out).length > 127)
        out = out.slice(0, -1);
    return out;
}
/** Concatenate descriptors and Temporal Units into a standalone IA Sequence. */
export function toStandaloneIamf(sequence) {
    return new Blob([sequence.descriptors, ...sequence.temporalUnits], {
        type: 'application/octet-stream',
    });
}
/** Render a script and package it as IAMF. */
export async function exportIamf(options, onProgress) {
    if (!isIamfRenderMode(options.mode)) {
        throw new Error(`IAMF export does not cover the "${options.mode}" layout`);
    }
    const layout = iamfLayout(options.mode);
    const bitDepth = options.bitDepth ?? 24;
    const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const warnings = [];
    const captured = { manifest: null };
    const rendered = await renderOffline({
        script: options.script,
        sampleBuffers: options.sampleBuffers,
        decodedAudioBuffers: options.decodedAudioBuffers,
        duration: options.duration,
        sampleRate: IAMF_SAMPLE_RATE,
        mode: options.mode,
        seed,
        simulate: options.simulate ?? 'auto',
        worldRoom: options.worldRoom,
        listenerPath: options.listenerPath,
        onManifest: (m) => { captured.manifest = m; },
    }, 
    // Packaging is quick next to rendering, so the render owns the bar up to 90%.
    (p) => onProgress?.({ ...p, progress: p.progress * 0.9 }));
    for (const clip of captured.manifest?.missingClips ?? []) {
        warnings.push(`No audio for "${clip}", statement skipped.`);
    }
    onProgress?.({ phase: 'rendering', progress: 0.9 });
    const channels = [];
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        channels.push(rendered.getChannelData(ch));
    }
    const sequence = buildIamfSequence(channels, {
        mode: options.mode,
        bitDepth,
        title: options.title,
    });
    if (sequence.loudness.stereo.truePeakDbfs > -1) {
        warnings.push(`True peak is ${sequence.loudness.stereo.truePeakDbfs.toFixed(1)} dBFS on the stereo fold-down. ` +
            'YouTube normalizes on loudness, not peak, so a hot master will be turned down after transcode.');
    }
    const mp4 = writeIamfMp4({
        configObus: sequence.descriptors,
        samples: sequence.temporalUnits,
        sampleDurations: sequence.unitDurations,
        sampleRate: IAMF_SAMPLE_RATE,
    });
    onProgress?.({ phase: 'done', progress: 1 });
    return {
        mp4,
        iamf: toStandaloneIamf(sequence),
        mode: options.mode,
        layoutLabel: layout.label,
        channelCount: sequence.channelCount,
        substreamCount: sequence.substreamCount,
        sampleRate: IAMF_SAMPLE_RATE,
        bitDepth,
        loudness: sequence.loudness,
        previewBuffer: rendered,
        manifest: captured.manifest,
        seed,
        warnings,
    };
}
//# sourceMappingURL=IamfExporter.js.map