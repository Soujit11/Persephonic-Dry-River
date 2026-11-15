/**
 * Mic-array render — the AUDIO half of the machine-listening dataset pair.
 *
 * STAIRS26/SELD annotations describe what a rigid microphone array would
 * hear; this renders that array's actual capture. DCASE 2026 Task 3 infers
 * on a 4-capsule tetrahedral subset of an Eigenmike (r = 4.2 cm, 24 kHz),
 * and the cue its models consume is TDOA — inter-capsule time differences.
 * Ambisonic decodes fake directivity but carry ZERO time difference, so a
 * model trained on them never learns the array's real geometry. Here the
 * delays are physically true per capsule, per block, per source.
 *
 * Built as a pure mix pass over `renderObjectStems`:
 *   - stems already bake per-voice DSP, envelopes, reverb send and the
 *     listener-referenced DISTANCE ATTENUATION (OfflineRenderer applies
 *     `distanceAttenuation` per voice). So the capsule pass applies only the
 *     RELATIVE part: delay and gain of each capsule referenced to the array
 *     centre — `(d_capsule − d_centre)/c` seconds, `d_centre/d_capsule`
 *     gain. Applying absolute capsule distance would attenuate twice.
 *   - positions are evaluated per block with the same `positionAt` the audio
 *     and annotation passes use, so all three provably agree.
 *
 * TWO ARRAY MODELS, one job field apart. The historical default is free
 * air: capsules floating in the open, coupled only by the relative delay and
 * gain above. `geometry.baffle` mounts them FLUSH ON A RIGID SPHERE instead
 * — which is what the benchmark arrays physically are (STARSS23 / DCASE MIC
 * is four capsules of an Eigenmike, r = 4.2 cm) — and the capsule pass then
 * convolves each source with the sphere's exact modal transfer function for
 * the angle between that source and that capsule's outward normal
 * (`RigidSphere.ts`). The sphere response REPLACES the relative delay and
 * gain: it is referenced to the same array centre and already carries the
 * propagation phase across the sphere, so applying the free-field delay on
 * top would count it twice. Free field remains bit-identical (tested).
 *
 * Approximations, stated: the reverberant tail rides each voice's stem and
 * is delayed like its dry source (a real room's diffuse field would arrive
 * decorrelated at each capsule); delay changes step per block (block ≤ 128
 * samples ≈ 5 ms at 24 kHz — inaudible for scene-speed movers, and the
 * annotations quantize at 100 ms anyway). The array sits on the listener —
 * at the origin, or riding a `listenerPath`, the same pose the stems were
 * attenuated for and the annotations are expressed in.
 */
import { type VoiceMotion } from './VoicePositions.js';
import type { ReplayAction } from '../integration/ReplayActions.js';
import { type MicArrayGeometry } from './MicArray.js';
import { type ListenerKeyframe } from './ListenerPath.js';
import type { SceneStateOptions } from './SceneSimulation';
import type { WorldRoom } from './SceneSimulation';
import type { RenderManifest } from './RenderManifest';
/**
 * Mix full-length object stems into per-capsule signals. Pure — stems in,
 * capsule channels out; index-aligned with `geometry.capsules`.
 *
 * `stems[i]` must be the full-render-length signal of `voices[i]` (that is
 * exactly what `renderObjectStems` returns), so stem sample n corresponds to
 * output sample n and the only re-indexing is the capsule's relative delay.
 * Relative delays are sub-millisecond (±r/c), read with linear interpolation;
 * negative delays (capsule nearer than centre) read a few samples ahead,
 * which a fully-rendered stem always has.
 */
export declare function mixStemsToCapsules(stems: (Float32Array | undefined)[], voices: VoiceMotion[], geometry: MicArrayGeometry, sampleRate: number, durationS: number, listenerPath?: ListenerKeyframe[]): Float32Array[];
export interface MicArrayRenderOptions {
    /**
     * Array geometry (default: the free-air tetrahedron, r = 4.2 cm).
     * `eigenmikeSubsetArray()` is the same capsules on a rigid sphere.
     */
    geometry?: MicArrayGeometry;
    /**
     * Receives the per-source stems the capsule mix was built from (index-
     * aligned with `manifest.voices`, undefined where a voice had no buffer)
     * before they are mixed: the caller measures received levels off them
     * (`StemLevels.ts`) or keeps them for a job that asked (`stems: true`).
     * They are not retained otherwise.
     */
    onStems?: (stems: (Float32Array | undefined)[]) => void;
    /**
     * The listener's path — the array rides it. MUST be the path the manifest
     * was prepared with (a simulated trace already moved the engine's listener
     * along it); stems bake the listener-relative distance law, the capsule
     * mix applies the relative delays in the same frame. Omitted: the origin.
     */
    listenerPath?: ListenerKeyframe[];
    onProgress?: (fraction: number) => void;
}
/**
 * Render a manifest to a mic array's capture: object stems (same seeds, same
 * automation as every other render mode) mixed to capsules with true
 * relative delays. Returns one Float32Array per capsule, in capsule order.
 * The caller wraps them into an AudioBuffer / WAV (channel order = the
 * geometry's capsule order, FLU/FRD/BLD/BRU for the tetrahedron).
 */
export declare function renderMicArrayCapture(manifest: RenderManifest, buffers: Map<string, AudioBuffer>, duration: number, sampleRate: number, options?: MicArrayRenderOptions): Promise<Float32Array[]>;
export interface MicArrayExportOptions {
    script: string;
    sampleBuffers: Map<string, ArrayBuffer>;
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    /** DCASE's arrays record at 24 kHz; any rate renders. */
    sampleRate: number;
    /** Fixed seed → identical audio AND annotations (see RenderManifest). */
    seed?: number;
    /** Simulate in the live engine and render the trace (default 'auto' — see RenderOptions.simulate). */
    simulate?: boolean | 'auto';
    /** The world room the listener stood in at export time — see RenderOptions.worldRoom. */
    worldRoom?: WorldRoom | null;
    /** The listener's path through the render (see RenderOptions.listenerPath); the array rides it. */
    listenerPath?: ListenerKeyframe[];
    /** The listener's scene state for `zone` voices — see RenderOptions.sceneState. */
    sceneState?: SceneStateOptions;
    /** Frozen host/event/signal/state input replayed into the simulation (see RenderOptions.actions). */
    actions?: readonly ReplayAction[];
    /** Array geometry (default: the free-air tetrahedron) — see MicArrayRenderOptions. */
    geometry?: MicArrayGeometry;
    onManifest?: (manifest: RenderManifest) => void;
    /** The per-source stems behind the capsule mix, handed out before mixing (see MicArrayRenderOptions.onStems). */
    onStems?: (stems: (Float32Array | undefined)[]) => void;
    onProgress?: (p: {
        phase: string;
        progress: number;
    }) => void;
}
/**
 * Script → 4-channel tetrahedral capture, packaged as an AudioBuffer so the
 * existing WAV/preview plumbing applies. Same prepare recipe as the ADM
 * exporter: parse → decode into the target rate → seeded manifest → stems →
 * capsule mix. `onManifest` hands out the manifest BEFORE rendering, so
 * annotations derived from it provably match this audio.
 */
export declare function renderMicArray(options: MicArrayExportOptions): Promise<AudioBuffer>;
//# sourceMappingURL=MicArrayRender.d.ts.map