/**
 * ADM BWF export orchestrator: script → object-based Dolby-Atmos-compatible
 * master (BW64/RIFF WAV, 48 kHz / 24-bit, one mono track + one audioObject
 * per rendered voice, cartesian position blocks matching the audio exactly).
 *
 * Pipeline: parse → seeded render manifest (or the simulated trace — see
 * `prepareRenderManifest`) → per-voice mono stems (batched offline renders,
 * distance baked) → 100 Hz position timelines from the SAME manifest (seeds
 * or trace) → collapse static runs → ADM coordinates → Dolby-profile
 * BS.2076 XML + chna → BW64.
 */
import { RenderManifest } from '../RenderManifest';
import { RenderProgress } from '../OfflineRenderer.js';
import type { WorldRoom } from '../SceneSimulation';
import { AdmObjectSpec } from './AdmXml.js';
/** Dolby Atmos renderer limits (Atmos: 118 objects + bed on 128 tracks). */
export declare const ATMOS_MAX_OBJECTS = 118;
export declare const ATMOS_MAX_TRACKS = 128;
export interface AdmExportOptions {
    script: string;
    sampleBuffers: Map<string, ArrayBuffer>;
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    /** ADM masters are conventionally 48 kHz; other rates are allowed. */
    sampleRate?: number;
    /** Seed for reproducibility. Defaults to a random seed, reported back. */
    seed?: number;
    programmeName?: string;
    /** Meters per ADM room half-edge; auto-fitted from positions when unset. */
    roomScale?: number;
    /** Simulate in the live engine and export the trace (default 'auto' — see RenderOptions.simulate). */
    simulate?: boolean | 'auto';
    /** The world room the listener stood in at export time — see RenderOptions.worldRoom. */
    worldRoom?: WorldRoom | null;
}
export interface AdmExportResult {
    blob: Blob;
    objectCount: number;
    warnings: string[];
    manifest: RenderManifest;
    /** The seed actually used — pass back in to reproduce this exact master. */
    seed: number;
    roomScale: number;
    /** Mono sum of all object tracks (peak-normalized when >0 dBFS) for preview. */
    previewMono: Float32Array<ArrayBuffer>;
    sampleRate: number;
}
/**
 * The metadata pass, pure: every voice's position timeline at
 * ADM_METADATA_FPS from the manifest (seed math or the simulated trace —
 * `sampleVoicePositionTimeline` reads whichever the voice carries), the room
 * scale that fits them, and the Dolby-profile block lists. Separated from
 * the audio pass so it can be tested without an OfflineAudioContext.
 */
export declare function admObjectsFromManifest(manifest: RenderManifest, duration: number, roomScaleOverride?: number): {
    objects: AdmObjectSpec[];
    roomScale: number;
    clampedVoices: number;
};
export declare function renderAdmBwf(options: AdmExportOptions, onProgress?: (p: RenderProgress) => void): Promise<AdmExportResult>;
//# sourceMappingURL=AdmExporter.d.ts.map