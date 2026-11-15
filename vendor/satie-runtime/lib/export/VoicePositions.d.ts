/**
 * Pure per-voice position math, shared by every export path.
 *
 * Extracted from OfflineRenderer so the audio pass (panner/FOA scheduling),
 * the ADM metadata pass and the USDZ timeSample pass all evaluate the SAME
 * functions with the SAME seeds — the exported position timeline is exact,
 * not an approximation of what the audio did.
 *
 * All positions are in Satie's scene frame: +Z = ahead, +X = right, +Y = up,
 * meters, listener at the origin. That frame is left-handed relative to Web
 * Audio (which treats −Z as front), so anything feeding a PannerNode or the
 * FOA encoder must convert via toPlaybackFrame() at the boundary. Format
 * exporters (ADM/USD) do their own axis mapping from the scene frame.
 */
import { Statement } from '../core/Statement.js';
import type { ScatterOffset } from '../spatial/Scatter';
import type { LineSource } from '../spatial/SourceExtent';
export interface ScenePosition {
    x: number;
    y: number;
    z: number;
}
/**
 * Scene frame → Web Audio playback frame. A pure reflection (z → −z): scene
 * "ahead" (+Z) becomes Web Audio front (−Z) while right (+X) and up (+Y) keep
 * their meaning. Distances are unchanged.
 */
export declare function toPlaybackFrame(p: ScenePosition): ScenePosition;
/** Walk/fly wander: sum-of-sines path derived entirely from the seed. */
export declare function computeWanderPosition(stmt: Statement, elapsed: number, wanderSpeed: number, seed: number): ScenePosition;
/** Spiral/orbit/lorenz/custom trajectory position at `elapsed` seconds. */
export declare function computeTrajectoryPosition(stmt: Statement, elapsed: number, seed: number, wanderHz: number): ScenePosition;
/** Resting position for static voices (None → box center, Fixed → areaMin). */
export declare function computeStaticPosition(stmt: Statement): ScenePosition;
/**
 * What one source did per frame in a headless run of the live engine
 * (`SceneSimulation.simulateScene`) — the trace-driven alternative to the
 * seed-driven motion below. Frames are `fps` per second, absolute frame
 * `frame0 + k` holds sample k; every array has the same frame count
 * (`positions` is xyz-interleaved, so 3× as long). Positions are absolute
 * scene-frame metres — the listener path is applied by the consumer, as for
 * seed-driven voices. `gain` is the engine's own level (volume × modulation
 * × activity × follow), WITHOUT the fade envelope; `rate` is playbackRate
 * (pitch × Doppler); `cutoffHz`/`muffleGain` are the muffle chain the engine
 * wrote (occlusion, zone, foliage, air absorption); `occlusion` is the
 * geometric total behind them, kept for annotations.
 */
export interface VoiceTrace {
    /** Optional exact sample times for replay interventions between regular frames. */
    times?: Float64Array;
    fps: number;
    frame0: number;
    positions: Float32Array;
    gain: Float32Array;
    rate: Float32Array;
    occlusion: Float32Array;
    cutoffHz: Float32Array;
    muffleGain: Float32Array;
    /**
     * Level-model channels (calibrated scenes only — NaN otherwise): the
     * source's EMISSION (`spl` + volume trim, dB SPL at 1 m) and the RECEIVED
     * level the engine's path model left at the listener (`receivedSplDb`:
     * distance law, line/bed/field, occlusion). Optional so pre-existing trace
     * fixtures stay valid; the scene-graph emitter reads them.
     */
    emissionDb?: Float32Array;
    receivedDb?: Float32Array;
    /** Static source extent the engine sampled at voice creation. */
    extent: {
        radiusM: number;
        ringM: number;
        bed: boolean;
        field: boolean;
        line: boolean;
        /** The line itself for a `line` voice (a strip's centreline, half width, diffuse reach) — the engine's `_line`. */
        lineSource?: LineSource | null;
    };
}
/** The minimum a caller must know about a voice to evaluate its motion. */
export interface VoiceMotion {
    stmt: Statement;
    startTime: number;
    voiceDuration: number;
    /** Motion seed (0..1000) — replaces the old per-render Math.random()*1000. */
    motionSeed: number;
    /** Mapped speed (post mapSpeed/mapTrajectorySpeed). */
    wanderHz: number;
    /** When set, motion (and level/rate/muffle) come from the simulated trace, not the seed. */
    trace?: VoiceTrace;
    /**
     * This instance's `scatter` offset, drawn once per rendered voice — so a
     * one-shot's repetitions each get their own point, exactly as the live
     * engine redraws on every fire. Applied by `positionAt`, which every
     * consumer goes through (audio, SELD/STAIRS labels, the scene graph, USDZ,
     * the mic array), so a scattered flock cannot be labelled at one spot and
     * rendered at another.
     */
    scatter?: ScatterOffset | null;
}
/** Number of frames a trace holds. */
export declare function traceFrameCount(trace: VoiceTrace): number;
/** Linear interpolation of one trace channel at `elapsed` seconds after the voice's start. */
export declare function traceValueAt(v: VoiceMotion, channel: Float32Array, elapsed: number): number;
/** Interpolated scene-frame position from a trace at `elapsed` seconds after the voice's start. */
export declare function tracePositionAt(v: VoiceMotion, elapsed: number): ScenePosition;
/** Position of a voice `elapsed` seconds after its start, in the scene frame. */
export declare function positionAt(v: VoiceMotion, elapsed: number): ScenePosition;
/** True when the voice's position never changes over its lifetime (seed-driven motion only). */
export declare function isStaticVoice(stmt: Statement): boolean;
/**
 * True when the voice's position never changes: for a traced voice, when
 * every frame sits within a millimetre of the first (a hosted loop on its
 * perch); for a seed-driven one, when its motion type is static.
 */
export declare function isStaticMotion(v: VoiceMotion): boolean;
export interface TimelinePoint {
    /** Seconds relative to the voice's start. */
    t: number;
    x: number;
    y: number;
    z: number;
}
/**
 * Sample a voice's full position timeline at `fps` (default 30 — the same
 * cadence the audio render bakes at). Static voices return a single point.
 */
export declare function sampleVoicePositionTimeline(v: VoiceMotion, fps?: number): TimelinePoint[];
//# sourceMappingURL=VoicePositions.d.ts.map