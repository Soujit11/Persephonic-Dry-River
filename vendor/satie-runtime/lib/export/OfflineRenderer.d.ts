import type { ReplayAction } from '../integration/ReplayActions.js';
/**
 * Offline audio renderer for Satie compositions.
 *
 * Two ways to know what to render, one graph to render it through:
 *   - the SEED-DRIVEN manifest (`buildRenderManifest`): every random value
 *     sampled once up front, motion from pure seed functions. Exact for a
 *     plain script of placed / wandering voices, and the path the golden
 *     tests pin.
 *   - the TRACE-DRIVEN manifest (`SceneSimulation`): the live engine run
 *     headlessly, its per-frame state recorded. The reference: it covers the
 *     `world` block, `at` hosts, passing traffic, entities, the signal bus,
 *     pooled takes, Doppler and foliage, which the sampler never modelled.
 *     Chosen automatically (`RenderOptions.simulate`, default 'auto') whenever
 *     the script uses any of that — see `needsSimulation`.
 *
 * Renders a Satie script to an AudioBuffer using OfflineAudioContext.
 * Supports three modes:
 *   - stereo: 2ch with equalpower panning
 *   - binaural: 2ch with HRTF panning
 *   - ambisonic-foa: 4ch First-Order Ambisonics (AmbiX: W, Y, Z, X)
 *
 * This renderer faithfully replicates the live engine's behavior:
 *   - Parameter interpolation (volume, pitch, DSP automation)
 *   - Noise perturbation on trajectories
 *   - Matched rolloff/distance model
 *   - Proper loop timing
 *   - The reverb ladder: a voice's own `reverb` > the room it is `in` > the
 *     script's first declared `room` > the world room (`RenderOptions.
 *     worldRoom`, else the trace's) — see `roomForVoice` in RenderManifest.
 *
 * Randomness: all per-voice sampling happens up front in buildRenderManifest
 * through one RNG (seeded via RenderOptions.seed for reproducible renders,
 * Math.random otherwise). Position math lives in VoicePositions and is pure
 * given the manifest's seeds, so metadata exporters (ADM/USDZ) can re-derive
 * the exact position timeline the audio used.
 *
 * Coordinates: statements are authored in Satie's scene frame (+Z = ahead).
 * Web Audio treats −Z as front, so positions are converted with
 * toPlaybackFrame() at the panner/FOA boundary — without this, `place ahead`
 * voices render behind the listener (the live engine doesn't hit this because
 * the camera is the listener there).
 */
import { type ParseResult } from '../core/SatieParser.js';
import { InterpolationData } from '../core/InterpolationData';
import { type DistanceProfile } from '../spatial/WorldAcoustics.js';
import { RenderManifest, RenderedVoice } from './RenderManifest.js';
import { type SceneTrace, type WorldRoom, type SceneStateOptions } from './SceneSimulation.js';
import { type LineSource } from '../spatial/SourceExtent.js';
import { type ListenerKeyframe } from './ListenerPath.js';
export type RenderMode = 'stereo' | 'binaural' | 'ambisonic-foa' | 'ambisonic-soa' | 'quad' | '7.1.2' | '7.1.4';
/** Channel count per render mode (speaker modes follow SPEAKER_LAYOUTS). */
export declare function renderModeChannels(mode: RenderMode): number;
export interface RenderOptions {
    /** Linear output gain, frozen by a take; default matches live headroom. */
    masterGain?: number;
    /** Captured transport state at take time zero. */
    initialPlaying?: boolean;
    /** Frozen host/event/signal/state input; forces the simulation path. */
    actions?: readonly ReplayAction[];
    script: string;
    /** Raw ArrayBuffer data (will be decoded into the offline context) */
    sampleBuffers: Map<string, ArrayBuffer>;
    /** Pre-decoded AudioBuffers from the live engine (used as-is if sample rates match, re-encoded otherwise) */
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    sampleRate?: number;
    mode: RenderMode;
    /**
     * Seed for deterministic rendering — same script + seed → identical render
     * and manifest. Omit for live-like randomized renders.
     */
    seed?: number;
    /**
     * Receives the manifest this render actually used, before any audio is
     * scheduled. The way to get ground-truth annotations (`SeldAnnotations`)
     * that provably match the rendered audio: rebuilding a manifest afterwards
     * would only agree if the caller replayed the RNG stream exactly, and would
     * not agree at all for an unseeded render.
     */
    onManifest?: (manifest: RenderManifest) => void;
    /**
     * Path the listener walks during the render. Omitted: the listener stands
     * still at `DEFAULT_LISTENER_POSE` — the origin at ear height (1.6 m),
     * facing +Z — which is where the live listener stands when nobody walks.
     *
     * Note a path makes STATIC voices move relative to the listener, so they
     * need position automation too — a source standing still is only
     * motionless if the listener is as well.
     */
    listenerPath?: ListenerKeyframe[];
    /**
     * The listener's scene state for `zone`-scoped voices (`setSceneState`
     * on the headless engine before the run): a non-matching `strict` voice
     * renders silent, a non-matching soft voice occluded by `isolation`.
     * Omitted: no state, so every zone matches and zoned voices render clear —
     * the same thing the live engine does before anything sets a state.
     * A script with any `zone` always takes the trace path.
     */
    sceneState?: SceneStateOptions;
    /**
     * Simulate the scene in the live engine and render from the trace (see
     * SceneSimulation) instead of the sampled manifest. 'auto' (the default)
     * simulates whenever the script has a `world` block, entities, hosted
     * voices, signal bindings, activity gates, take pools, `chance` or `emit`;
     * a plain script keeps the seed-driven path, which already renders it
     * exactly. `true`/`false` force either path.
     */
    simulate?: boolean | 'auto';
    /**
     * The world room the listener stood in at export time
     * (`SatieEngine.getWorldRoom()` — a Marble enclosure measured by the
     * viewport, or a procedural world's ambient room). Voices with no script
     * reverb (no `reverb`, no `in <room>`, no declared `room`) send into it
     * exactly as live. Omitted or null: a simulated render falls back to the
     * room the headless engine ended in (`SceneTrace.worldRoom`); a sampled
     * render has none.
     */
    worldRoom?: WorldRoom | null;
}
export interface RenderProgress {
    phase: 'parsing' | 'decoding' | 'simulating' | 'rendering' | 'done';
    progress: number;
}
export { computeStartTimes, computeVoiceDuration, computeStartOffset, buildRenderManifest } from './RenderManifest.js';
export type { RenderManifest, RenderedVoice } from './RenderManifest.js';
export { buildSeldAnnotations, scenePositionToPolar, voiceLabel, seldToCsv, seldClassMapJson, SELD_DEFAULT_FPS, } from './SeldAnnotations.js';
export { listenerPoseAt, toListenerFrame, pathDuration, walkPath, DEFAULT_LISTENER_POSE, } from './ListenerPath.js';
export type { ListenerKeyframe, ListenerPose } from './ListenerPath.js';
export { planBatch, surfacesForVariant, batchManifestJson } from './BatchRender.js';
export type { BatchVariant, BatchOptions } from './BatchRender.js';
export { tetrahedralArray, circularArray, captureAt, tdoa, maxTdoaS, SPEED_OF_SOUND } from './MicArray.js';
export type { MicArrayGeometry, Capsule, CapsuleSignal } from './MicArray.js';
export type { SeldAnnotations, SeldFrameEvent, SeldOptions } from './SeldAnnotations.js';
/**
 * Decode/resample every available clip into the given context's sample rate.
 * Shared by renderOffline and the stem renderer.
 */
export declare function decodeAllBuffers(ctx: OfflineAudioContext, sampleBuffers: Map<string, ArrayBuffer>, decodedAudioBuffers: ReadonlyMap<string, AudioBuffer> | undefined, sampleRate: number, onProgress?: (fraction: number) => void): Promise<Map<string, AudioBuffer>>;
/** Buffer-duration map consumed by buildRenderManifest. */
export declare function bufferDurations(buffers: Map<string, AudioBuffer>): Map<string, number>;
export interface ManifestPrepOptions {
    initialPlaying?: boolean;
    actions?: readonly ReplayAction[];
    script: string;
    /** `parseScene(script)`, when the caller already has it. */
    scene?: ParseResult;
    decodedBuffers: Map<string, AudioBuffer>;
    duration: number;
    seed?: number;
    simulate?: boolean | 'auto';
    listenerPath?: ListenerKeyframe[];
    /** See `RenderOptions.sceneState` (trace path only). */
    sceneState?: SceneStateOptions;
    /** See `RenderOptions.worldRoom`. */
    worldRoom?: WorldRoom | null;
    /** Simulation progress, 0..1 (only called on the trace path). */
    onSimulating?: (fraction: number) => void;
}
/** Should this render simulate? Resolves 'auto' against the script. */
export declare function shouldSimulate(scene: ParseResult, simulate: boolean | 'auto' | undefined): boolean;
/**
 * The one recipe every export format shares: parse → (simulate) → manifest.
 * Trace or sampler is decided here (`shouldSimulate`), so stereo, HOA,
 * speaker layouts, stems, ADM, USDZ, the mic array and the annotators all
 * agree on which path a script takes. Returns the trace too, for callers
 * that want the entity marks and event broadcasts.
 *
 * The manifest also carries the render's rooms (`RenderManifest.rooms`):
 * the script's declared `room`s derived as the engine derives them, and the
 * world room — the caller's (`worldRoom`, the room the listener stood in at
 * export time) over the trace's (the room the headless run ended in).
 */
export declare function prepareRenderManifest(opts: ManifestPrepOptions): Promise<{
    manifest: RenderManifest;
    trace: SceneTrace | null;
    scene: ParseResult;
}>;
/**
 * Render a Satie script offline to an AudioBuffer.
 */
export declare function renderOffline(options: RenderOptions, onProgress?: (p: RenderProgress) => void): Promise<AudioBuffer>;
/**
 * The offline muffle for an authored `occlusion` value: the live law
 * (`applyMuffle`) with no zone, foliage or distance term — lowpass cutoff and
 * direct-path gain. Exported so the number the export bakes is testable.
 */
export declare function occlusionMuffleParams(occlusion01: number): {
    cutoffHz: number;
    gain: number;
};
/**
 * Render one mono stem per manifest voice: everything the mix applies EXCEPT
 * spatialization — envelope, volume/pitch automation, 1/√count scaling, DSP,
 * the 0.5 master gain, plus baked distance attenuation. Distance is baked
 * because object renderers (Dolby Atmos) apply no distance law of their own:
 * without it, far sources would come back dramatically louder than in every
 * other Satie export. Direction stays fully renderer-controlled. No limiter —
 * it can't be distributed across independent object tracks (documented
 * loudness-parity caveat vs the stereo master).
 *
 * Voices are batched onto the channels of shared OfflineAudioContexts
 * (`discrete` interpretation, one merger input per voice).
 *
 * The returned array is index-aligned with `manifest.voices`.
 */
export interface ObjectStemOptions {
    /**
     * Bake the live distance law into each stem (default true — ADM/USDZ).
     * False leaves stems at reference distance for hosts that apply their own
     * rolloff from the manifest's positions (the Unity bundle).
     */
    bakeDistance?: boolean;
}
export declare function renderObjectStems(manifest: RenderManifest, buffers: Map<string, AudioBuffer>, duration: number, sampleRate: number, onProgress?: (fraction: number) => void, listenerPath?: ListenerKeyframe[], opts?: ObjectStemOptions): Promise<Float32Array[]>;
/** Sampled extent shape for one rendered voice. */
export interface VoiceExtent {
    distanceProfile?: DistanceProfile | null;
    radiusM: number;
    ringM: number;
    bed: boolean;
    /** A `line` voice's line in SCENE frame (from the trace, or the placed box's long axis); null otherwise. */
    line: LineSource | null;
    /** Animated size (`radius fade …` / `ring fade …`); null = the sampled constant above stands. */
    radiusMod: InterpolationData | null;
    ringMod: InterpolationData | null;
    /** Cycle lengths for those modulations, drawn once per render. */
    radiusEvery: number;
    ringEvery: number;
    /** Absolute time the modulations are measured from — the live engine's voice start. */
    spawn: number;
    /** `scale` — uniform scalar multiplying the extent, mirroring the live engine. */
    scale: number;
}
/**
 * Sample a voice's extent shape once per render. Draws from a sub-seed
 * disjoint from voiceRngSeed's stream so adding extent to a script never
 * shifts any other sampled value in a seeded render.
 */
export declare function sampleVoiceExtent(voice: RenderedVoice): VoiceExtent;
/**
 * Extent geometry at one listener-frame source position (listener at the
 * origin by construction). Returns the equal-power crossfade with the wide
 * leg's manual distance law folded in — the panner leg attenuates itself.
 */
/**
 * A voice's extent size at absolute playback time `t` — the constant it was
 * sampled with, or the modulation driving it. Offline mirror of the live
 * engine's `updateExtentSize`; elapsed is measured from spawn so every
 * retriggered copy agrees on the phase, as volume and pitch already do.
 */
export declare function extentSizeAt(ext: VoiceExtent, t: number): {
    radiusM: number;
    ringM: number;
};
/** Fade multiplier at `elapsed` seconds into a voice. Exported for tests. */
export declare function envelopeFactor(elapsed: number, voiceDuration: number, fadeInDur: number, fadeOutDur: number): number;
//# sourceMappingURL=OfflineRenderer.d.ts.map