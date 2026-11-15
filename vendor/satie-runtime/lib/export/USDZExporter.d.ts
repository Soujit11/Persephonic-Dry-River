/**
 * USDZ export orchestrator: script → .usdz package with per-voice
 * UsdMediaSpatialAudio prims, baked mono clips and animated positions —
 * droppable into AR Quick Look (iOS 18.1+), RealityKit / Vision Pro and
 * generic USD tooling.
 *
 * Everything is baked into scene-length clips played `onceFromStart`:
 * retriggers re-sample volume/pitch per repeat (irreproducible via startTime
 * tricks), loops aren't cycle-stationary, and Apple's playbackMode coverage
 * beyond onceFromStart is undocumented. Distance attenuation is NOT baked —
 * positions are real meters and RealityKit applies its own distance model as
 * the user walks the scene (documented deviation from Satie's rolloff).
 *
 * Size lever: clips are silence-trimmed (head trim becomes the prim's
 * startTime; tail trim gets a short guard fade) and fully silent voices are
 * skipped.
 */
import type { RenderedVoice } from './RenderManifest';
import { RenderProgress } from './OfflineRenderer.js';
import type { WorldRoom } from './SceneSimulation';
import { ScenePosition } from './VoicePositions.js';
import { USDVoiceSpec } from './USDAWriter.js';
export interface USDZExportOptions {
    script: string;
    sampleBuffers: Map<string, ArrayBuffer>;
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    /** Clip sample rate — lower rates shrink the package. Default 48000. */
    clipSampleRate?: 24000 | 32000 | 48000;
    /** Child sphere per voice so Quick Look shows something. Default true. */
    includeMarkers?: boolean;
    /** Seed for reproducibility (same contract as the ADM exporter). */
    seed?: number;
    /** Simulate in the live engine and export the trace (default 'auto' — see RenderOptions.simulate). */
    simulate?: boolean | 'auto';
    /** The world room the listener stood in at export time — see RenderOptions.worldRoom. */
    worldRoom?: WorldRoom | null;
}
export interface USDZExportResult {
    blob: Blob;
    voiceCount: number;
    /** Voices dropped because their stems were fully silent. */
    skippedSilent: number;
    warnings: string[];
    seed: number;
}
export interface TrimResult {
    /** Seconds from stem start to the first audible sample. */
    startSeconds: number;
    samples: Float32Array;
}
/**
 * Trim leading/trailing silence. Returns null when the whole stem is silent.
 * The tail cut gets a short linear guard fade so it can't click.
 */
export declare function trimSilence(data: Float32Array, sampleRate: number, threshold?: number): TrimResult | null;
/** Scene frame (+Z ahead) → USD frame (−Z front): reflect z, reorder nothing. */
export declare function toUsdPosition(p: ScenePosition): [number, number, number];
/**
 * A voice's prim position: one static translate when it never moves, else
 * a timeSample per stage timecode across its life. Reads the manifest's
 * motion (seed math or the simulated trace) through `positionAt`, the same
 * function the stems were attenuated with. Pure, for tests.
 */
export declare function usdPositionsFor(voice: RenderedVoice): Pick<USDVoiceSpec, 'staticPosition' | 'positionTimeSamples'>;
export declare function exportUSDZ(options: USDZExportOptions, onProgress?: (p: RenderProgress) => void): Promise<USDZExportResult>;
//# sourceMappingURL=USDZExporter.d.ts.map