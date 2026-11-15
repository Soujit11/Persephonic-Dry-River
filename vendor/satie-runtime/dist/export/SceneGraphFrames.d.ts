/**
 * Scene-graph frames — the training target only an AUTHORED scene can carry.
 *
 * SELD says where a class is; STAIRS26 adds its extent. Neither says that the
 * glass broke behind a wall, that the drip is in the kitchen while the
 * traffic is at the window, how loud the thing IS versus how loud it ARRIVED,
 * or which body a sound belongs to. All of that is in the render manifest
 * and the simulation trace already; this module writes it out per 100 ms per
 * source, versioned (`satie-scene-graph/2`, schema in
 * scripts/experiments/corpus/schema/scene.v2.json; `/1` files stay valid
 * against scene.v1.json), so a model can be trained on, and a QA generator
 * can ask about, the scene rather than the mix.
 *
 * Same pure contract as the SELD / STAIRS26 emitters: reads a RenderManifest
 * (and the parsed scene for room declarations), evaluates the same
 * `positionAt` on the same seeds and the same listener path as the audio
 * pass, never touches audio. Classes stay open vocabulary.
 *
 * Level fields are the engine's own where a calibrated (`spl`) scene was
 * simulated (the trace's `emissionDb` / `receivedDb` channels) and null
 * otherwise; `receivedAnalyticDb` is always present, computed from the same
 * `receivedSplDb` law over the frame's listener-relative range and occlusion
 * (assuming `DEFAULT_SPL_DB` when the scene states no emission).
 *
 * Version 2 (2026-11-08, spec 011 Track B) states the BASIS of every
 * estimate beside it (`audibleBasis`, `emissionBasis`, the `bases` block),
 * names what the trace path re-draws (`resampled`), carries the listener's
 * pitch, per-source velocities (`vxyz`), the clips the render played
 * (`assets`, copied from the job), the frame the job actually used
 * (`coordinates.frame` and friends) and, when the caller measured the
 * rendered stems, the received level as it came out of the renderer
 * (`receivedMeasuredDbfs`, basis `output-measured-stem`). Salience, portal
 * redirects and the HDR window's top are not emitted yet (WS5).
 */
import type { RenderManifest } from './RenderManifest';
import { type ScenePosition, type VoiceMotion } from './VoicePositions.js';
import { type ListenerKeyframe } from './ListenerPath.js';
import { type ClipActivity } from './ClipActivity.js';
import type { ParseResult } from '../core/SatieParser';
import type { DistanceProfile } from '../spatial/WorldAcoustics.js';
import type { MeasuredStemLevels } from './StemLevels';
export declare const SCENE_GRAPH_FORMAT = "satie-scene-graph/2";
/** The basis of `audible`: the clip's own RMS envelope against its peak (ClipActivity), or the scheduled span when no activity was given. */
export type AudibleBasis = 'clip-rms-40dB-dry' | 'scheduled-span';
/** Where the emission behind `receivedAnalyticDb` came from: the engine's trace, the script's `spl`, or the model default. */
export type EmissionBasis = 'trace' | 'spl' | 'assumed-default';
/** How a field was obtained: read off the rendered output, implied by the manifest the audio was rendered from, or modelled. */
export type FieldBasis = 'measured' | 'by-construction' | 'estimated';
/** Scene axes a job can express positions in; `toListenerFrame` brings both into the same listener frame. */
export type SceneCoordinateFrame = 'satie' | 'three';
/**
 * What the trace path re-draws from the statement instead of reading from
 * the engine's run (the engine's own draws are not observable there): the
 * fade lengths (`SceneSimulation`), a start offset when the trace carries
 * none (`buildTraceManifest`), a voice's own `reverb` parameters, the extent
 * shape (`sampleVoiceExtent`) and DSP interpolation cycle lengths
 * (`buildVoiceChain`). All seeded from the trace seed, so deterministic, but
 * not the engine's numbers. The sampled path has no trace to disagree with.
 */
export declare const TRACE_RESAMPLED: readonly string[];
/**
 * One clip the render played, as the job knew it: the realize map's entry
 * (`samples.json`) reduced to provenance. Copied through untouched by
 * `buildSceneGraph`; the job emitter (spec 011 Track C) fills it.
 */
export interface SceneGraphAsset {
    /** The clip key as the script names it (the `samples` map key). */
    clip: string;
    /** SHA-256 of the file's bytes, lowercase hex; null when the job did not know it. */
    sha256: string | null;
    source: 'library' | 'generated' | 'provided';
    /** `CC0`, `generated:<provider>`, `provided`, a library licence string; null when unknown. */
    licence: string | null;
    durationS: number | null;
    /** Loudness normalization the asset carries, when known (the renderer itself normalizes every decoded clip to CLIP_LUFS on arrival). */
    loudness: {
        targetLufs: number | null;
        measuredLufs: number | null;
        gainDb: number | null;
    } | null;
    /** Generated takes: who made them. Absent or null for library and provided clips. */
    generator?: {
        provider: string;
        model: string | null;
        voiceId: string | null;
    } | null;
}
export interface SceneGraphOptions {
    /** Frames per second (default 10 — the SELD hop, so frames align across the three label files). */
    fps?: number;
    /** Listener path — MUST match the audio render's. */
    listenerPath?: ListenerKeyframe[];
    /** Per-clip audibility (see SeldOptions.clipActivity); drives `audible`. */
    clipActivity?: Map<string, ClipActivity>;
    /** The parsed scene, for room declarations (names, sizes, materials, rt60). */
    scene?: Pick<ParseResult, 'rooms' | 'materials'>;
    /** The job's assets, copied through as `assets`. */
    assets?: SceneGraphAsset[];
    /**
     * Received level measured from the rendered stems (`measureStemLevels`),
     * indexed like `manifest.voices`; fills `receivedMeasuredDbfs`. Omitted:
     * null, basis null.
     */
    measured?: MeasuredStemLevels;
    /**
     * The scene frame the job's positions are in. Default: `three` when any
     * keyframe of `listenerPath` says `coordinateFrame: 'three'`, else `satie`.
     */
    coordinateFrame?: SceneCoordinateFrame;
}
/** One source of the scene, static facts. */
export interface SceneGraphSource {
    /** Stable within the scene/session across retriggers; occurrences retain separate indices. */
    emitterId: string;
    objectId: string | null;
    objectInstanceId: string | null;
    sourceId: string | null;
    trackKey: string | null;
    occurrenceId: string;
    identityBasis: 'declared-source' | 'statement-copy';
    /** Identifies the model behind received-level labels, including mixed-profile scenes. */
    distanceProfile: DistanceProfile;
    /** Index into `frames[].sources[].i`. */
    index: number;
    /** Open-vocabulary label (`voiceLabel`). */
    label: string;
    /** Buffer key the take played from. */
    clip: string;
    kind: 'loop' | 'oneshot' | 'trigger';
    statementIndex: number;
    copyIndex: number;
    repIndex: number;
    /** Entity class + instance for a body's sounds; null for a free-standing voice. */
    entity: string | null;
    instance: number | null;
    /** Pooled take index, null when not pooled. */
    take: number | null;
    /** Trajectory id: `static`, `walk`, `fly`, `spiral`, `orbit`, `lorenz`, `custom:<name>`, or `trace` for engine-driven motion with no scripted mover. */
    trajectory: string;
    /** The room the voice is `in`, else the scene's first declared room, else null. */
    room: string | null;
    extent: {
        radiusM: number;
        ringM: number;
        bed: boolean;
        field: boolean;
        line: boolean;
    };
    /** Emission the script states (`spl`), as its range, or null when unstated. */
    splDb: [number, number] | null;
    /** Authored occlusion at rest (0–1). */
    occlusionBase: number;
    startTime: number;
    endTime: number;
}
/** One source in one frame. */
export interface SceneGraphFrameSource {
    i: number;
    /** DCASE polar in the listener's frame: azimuth positive-left, elevation up, metres. */
    az: number;
    el: number;
    dist: number;
    /** Listener-frame position (scene axes: +Z ahead, +X right, +Y up). */
    x: number;
    y: number;
    z: number;
    /** The source's own velocity in the listener's axes (m/s), central difference of `positionAt`; [0,0,0] for a bed. */
    vxyz: [number, number, number];
    /** Scheduled to be playing at this frame. */
    active: boolean;
    /** Its clip actually sounds at this frame (ClipActivity); equals `active` when no activity was given. */
    audible: boolean;
    audibleBasis: AudibleBasis;
    /** Composed occlusion 0–1 (trace) or the authored base. */
    occlusion: number;
    /** Engine level model (calibrated, simulated scenes) — null otherwise. */
    emissionDb: number | null;
    receivedDb: number | null;
    /** `receivedSplDb` over this frame's range and occlusion, from the emission (trace's, else `spl` mid, else DEFAULT_SPL_DB). */
    receivedAnalyticDb: number;
    /** Which emission `receivedAnalyticDb` was computed from. */
    emissionBasis: EmissionBasis;
    /** Received level read off the rendered stem at the array centre (dBFS, RMS over the frame); null when no stem was measured. */
    receivedMeasuredDbfs: number | null;
    receivedMeasuredBasis: 'output-measured-stem' | null;
    /** The engine's governed gain (trace) — null on the sampled path. */
    gain: number | null;
    /** Playback rate incl. Doppler (trace) — null on the sampled path. */
    rate: number | null;
    /** Muffle cutoff (trace) — null on the sampled path. */
    cutoffHz: number | null;
}
/** The listener in one frame: scene-frame position, yaw and pitch (radians). */
export interface SceneGraphListener {
    /** Full precision unit quaternion [x,y,z,w]; authoritative when present. */
    orientation?: [number, number, number, number];
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
}
export interface SceneGraphFrame {
    frame: number;
    t: number;
    listener: SceneGraphListener;
    sources: SceneGraphFrameSource[];
}
export interface SceneGraphRoom {
    name: string;
    sizeM: {
        x: number;
        y: number;
        z: number;
    } | null;
    surfaces: {
        floor?: string;
        ceiling?: string;
        walls?: string;
    };
    rt60S: number | null;
    /** The engine-facing reverb derived for it (null when it only names a space). */
    derived: {
        wet: number;
        size: number;
        damping: number;
    } | null;
}
export interface SceneGraphFile {
    format: typeof SCENE_GRAPH_FORMAT;
    fps: number;
    durationS: number;
    frameCount: number;
    seed: number | null;
    /** True when the frames come from a headless simulation (the reference path). */
    simulated: boolean;
    /** True when the trace carries the level model (any `spl` in the script). */
    calibrated: boolean;
    /** What the trace path re-drew instead of reading from the engine (empty on the sampled path). */
    resampled: string[];
    /** How each per-frame field was obtained. */
    bases: Record<string, FieldBasis>;
    listenerPath: ListenerKeyframe[];
    rooms: SceneGraphRoom[];
    materials: {
        name: string;
        absorption: number[];
    }[];
    worldRoom: {
        size01: number;
        damping01: number;
        wet01: number;
    } | null;
    spawns: {
        t: number;
        entity: string;
        instance: number;
        x: number;
        y: number;
        z: number;
    }[];
    retires: {
        t: number;
        entity: string;
        instance: number;
        x: number;
        y: number;
        z: number;
    }[];
    events: {
        t: number;
        name: string;
        x: number;
        y: number;
        z: number;
    }[];
    /** The clips the render played, as the job described them (empty when the job said nothing). */
    assets: SceneGraphAsset[];
    sources: SceneGraphSource[];
    frames: SceneGraphFrame[];
    coordinates: Record<string, string>;
}
/**
 * The source's scene-frame velocity `elapsed` seconds in, as a central
 * difference of `positionAt` over `h` either side, falling back to a
 * one-sided difference at the voice's first and last `h`. Exported for tests.
 */
export declare function velocityAt(v: VoiceMotion, elapsed: number, h: number): ScenePosition;
/** The scene frame a path's keyframes declare (`three` when any says so), else Satie's. */
export declare function sceneFrameOf(path: readonly ListenerKeyframe[] | undefined): SceneCoordinateFrame;
/** Sample the manifest into per-frame scene-graph ground truth. */
export declare function buildSceneGraph(manifest: RenderManifest, options?: SceneGraphOptions): SceneGraphFile;
/** The emitted JSON, one file per rendered recording (`<stem>.scene.json`). */
export declare function sceneGraphJson(manifest: RenderManifest, options?: SceneGraphOptions): string;
//# sourceMappingURL=SceneGraphFrames.d.ts.map