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
import { type RenderProgress } from '../OfflineRenderer.js';
import type { RenderManifest } from '../RenderManifest.js';
import type { WorldRoom } from '../SceneSimulation.js';
import type { ListenerKeyframe } from '../ListenerPath.js';
import { type ByteArray } from './IamfObu.js';
import { type IamfRenderMode } from './IamfLayouts.js';
import { type LoudnessResult } from './Bs1770.js';
export { IAMF_RENDER_MODES, isIamfRenderMode, iamfLayout, type IamfRenderMode } from './IamfLayouts.js';
/** IAMF export is 48 kHz, always. */
export declare const IAMF_SAMPLE_RATE = 48000;
/**
 * Samples per Audio Frame OBU. 1024 is what the reference encoder's LPCM
 * templates use, and at 48 kHz it keeps every OBU far inside the 2 MB cap.
 */
export declare const IAMF_FRAME_SAMPLES = 1024;
export interface IamfSequenceOptions {
    mode: IamfRenderMode;
    bitDepth?: 16 | 24;
    /** Shown as the Mix Presentation's annotation. */
    title?: string;
}
export interface IamfLoudness {
    /** Loudness of the stereo fold-down, which every sub-mix must report. */
    stereo: LoudnessResult;
    /** Loudness measured on the delivered channels, when they form a sound system. */
    native?: LoudnessResult;
}
export interface IamfSequence {
    /** Descriptor OBUs, in the order §5.1.1 requires. Also the `iacb` payload. */
    descriptors: ByteArray;
    /** One entry per Temporal Unit: its Audio Frame OBUs, concatenated. */
    temporalUnits: ByteArray[];
    /** Presented duration of each Temporal Unit, in audio samples. */
    unitDurations: number[];
    loudness: IamfLoudness;
    substreamCount: number;
    channelCount: number;
    /** Samples of silence padded onto the final frame and trimmed on playback. */
    paddedSamples: number;
}
/**
 * Build the IA Sequence from already-rendered channels. Pure: no audio
 * context, no DOM, so the bitstream can be checked in a unit test.
 *
 * `channels` must be in Satie's channel order for the mode — the same order
 * `renderOffline` produces and `encodeWAV` writes.
 */
export declare function buildIamfSequence(channels: readonly Float32Array[], options: IamfSequenceOptions): IamfSequence;
/** Concatenate descriptors and Temporal Units into a standalone IA Sequence. */
export declare function toStandaloneIamf(sequence: IamfSequence): Blob;
export interface IamfExportOptions {
    script: string;
    sampleBuffers: Map<string, ArrayBuffer>;
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    mode: IamfRenderMode;
    bitDepth?: 16 | 24;
    /** Seed for reproducibility. Defaults to a random seed, reported back. */
    seed?: number;
    title?: string;
    /** Simulate in the live engine and render the trace (see RenderOptions.simulate). */
    simulate?: boolean | 'auto';
    worldRoom?: WorldRoom | null;
    listenerPath?: ListenerKeyframe[];
}
export interface IamfExportResult {
    /** The upload: an ISO-BMFF file with one IAMF track. */
    mp4: Blob;
    /** The same IA Sequence standalone, for tools that read raw IAMF. */
    iamf: Blob;
    mode: IamfRenderMode;
    /** Human-readable layout name, e.g. '7.1.4'. */
    layoutLabel: string;
    channelCount: number;
    substreamCount: number;
    sampleRate: number;
    bitDepth: 16 | 24;
    loudness: IamfLoudness;
    /** The rendered channels, for the preview player. */
    previewBuffer: AudioBuffer;
    manifest: RenderManifest | null;
    seed: number;
    warnings: string[];
}
/** Render a script and package it as IAMF. */
export declare function exportIamf(options: IamfExportOptions, onProgress?: (p: RenderProgress) => void): Promise<IamfExportResult>;
//# sourceMappingURL=IamfExporter.d.ts.map