import { type ReplayAction } from '../integration/ReplayActions.js';
/**
 * Scene simulation — run the LIVE engine headlessly and write down what it did.
 *
 * The offline renderer used to re-implement playback from a sampled manifest:
 * start times, volumes, pitches and seed-driven motion, evaluated by pure
 * functions. That covers a script of placed and wandering voices exactly, and
 * nothing else: the `world` block, `at` hosts, passing traffic, the signal
 * bus (`follow`, `pace`, `active`, `quiet`), pooled takes, Doppler, foliage
 * and the entity layer all live only in `SatieEngine`. Re-implementing them a
 * second time would drift by construction.
 *
 * So instead: simulate once with the real engine on a `NullAudioContext`
 * (no sound, a writable clock), step it `fps` times per scene second with
 * `SatieEngine.advance`, and RECORD per frame what every live source would
 * have fed its audio nodes — position, level, playback rate, muffle. Sources
 * come from the engine's own EventLog (every `start`/`fire` opens one on its
 * track key, a `stop` or the take's own length closes it). The renderer then
 * plays that trace back through real audio nodes. The trace is the reference:
 * whatever the engine does, the export does, including things this file has
 * never heard of.
 *
 * Determinism: the engine's `rng` is `mulberry32(seed)`, the world's own RNG
 * is seeded by the spec, and the only async in a headless run is the caller's
 * cooperative yields — so the same seed reproduces the same trace, and the
 * metadata pass (ADM blocks, USD timeSamples, SELD labels) reads the very
 * arrays the audio pass rendered from.
 *
 * Rooms: the trace records the WORLD ROOM the headless engine ended the run
 * in (`SceneTrace.worldRoom` — a procedural `world`'s ambient room, from
 * `applyWorldAmbientRoom`), so voices without script reverb send into it on
 * playback exactly as live. The script's declared `room`s are not recorded —
 * the renderer derives them from the parsed scene, the same way the engine
 * does (`ScriptRoom.ts`). A room the LISTENER stood in at export time (a
 * Marble enclosure measured by the viewport) is not observable here; the
 * export panel passes it as `RenderOptions.worldRoom`, which outranks the
 * trace's.
 *
 * Not in the trace (and therefore not in the export): UI-driven raycast
 * occlusion and diffraction from Marble geometry, and runtime mixer
 * mute/solo. Fade lengths are re-sampled from the statement per source — the
 * engine's own draw is not observable.
 */
import { SatieEngine } from '../core/SatieEngine.js';
import { type ParseResult } from '../core/SatieParser.js';
import { Statement } from '../core/Statement';
import type { EntityInstance } from '../core/Entities.js';
import { type ListenerKeyframe } from './ListenerPath.js';
import type { VoiceTrace } from './VoicePositions';
/** One rendered source: a take that sounded on a track, from `t0` to `t1`. */
export interface TraceSource {
    /** Resolved identities of this occurrence, including dispatched contact emitters. */
    sourceId?: string | null;
    objectId?: string | null;
    objectInstanceId?: string | null;
    /** Engine track key (`<clip>_<stmt>_<copy>`, `e:<entity>:<n>:<stmt>`). */
    key: string;
    statementIndex: number;
    stmt: Statement;
    /** Count-copy index of the track (0 for entity members). */
    voiceIndex: number;
    /** Entity class id + instance number, '' / -1 for a free-standing voice. */
    entity: string;
    instance: number;
    /** Pooled take index (`variants`), -1 when not pooled. */
    take: number;
    /** Buffer key the take played from (`pathFor(clip)` or `<base>#k`). */
    clip: string;
    /** Display label the engine logged (clip name / entity label). */
    label: string;
    /** Decoded length of `clip`, seconds. */
    bufferDuration: number;
    /** Actual engine-chosen offset, including interactive onset alignment. */
    startOffset?: number;
    t0: number;
    /** End of the source (exclusive); the export's end for a loop that never stopped. */
    t1: number;
    loop: boolean;
    /** Fade lengths for the renderer's envelope (re-sampled from the statement). */
    fadeIn: number;
    fadeOut: number;
    trace: VoiceTrace;
}
/** An entity instance coming into being or leaving, for annotations. */
export interface TraceMark {
    t: number;
    entity: string;
    instance: number;
    x: number;
    y: number;
    z: number;
}
/** A runtime event broadcast (`emit`), with where it happened. */
export interface TraceEvent {
    t: number;
    name: string;
    x: number;
    y: number;
    z: number;
}
/**
 * An entity agent's transition (EventLog kind `agent`): what an individual
 * did — `perch`, `call`, `hush`, `relocate`, `startle`, `promote`, `demote`
 * — and where its body was. The behaviour tags of the exported corpus:
 * the listener approached, the bird startled, the flight call receded.
 */
export interface TraceBehavior extends TraceMark {
    label: string;
}
/**
 * A world room in the engine's own terms — what `SatieEngine.setWorldRoom`
 * takes and `getWorldRoom` returns. Voices with no script reverb send into
 * it at `reverbSendGain(wet01, size01)`; the bus is keyed on size/damping.
 */
export interface WorldRoom {
    size01: number;
    damping01: number;
    wet01: number;
}
export interface SceneTrace {
    /** Final independent host state axes, retained by replay without changing the global mix. */
    objectStates?: Record<string, Record<string, string>>;
    fps: number;
    durationS: number;
    frameCount: number;
    /** The engine seed this trace was produced with. */
    seed: number;
    /**
     * The world room the headless engine stood in when the run ended — a
     * procedural `world`'s ambient room (facade / trunk density, nearly dry),
     * null when the script implies none. The renderer's fallback when the
     * caller passes no `worldRoom` of its own.
     */
    worldRoom: WorldRoom | null;
    /** The engine's statements — `TraceSource.statementIndex` indexes these. */
    statements: readonly Statement[];
    sources: TraceSource[];
    spawns: TraceMark[];
    /** Entity agent transitions, in order (EventLog kind `agent`). */
    behaviors: TraceBehavior[];
    retires: TraceMark[];
    events: TraceEvent[];
    /** Non-muted, non-trigger statements whose clip had no buffer (they stayed silent). */
    missingClips: string[];
    listenerPath?: ListenerKeyframe[];
    /** The scene state the run was gated by, when one was given. */
    sceneState?: SceneStateOptions;
}
/**
 * The listener's scene state for a run — the arguments of
 * `SatieEngine.setSceneState(name, { isolation, fadeS })`, as one object so a
 * render job can carry it. `name` is the OPEN state name `zone` lines refer to
 * (`'cabin'`, `'cave'`); `null` is "no state", every zone matches.
 */
export interface SceneStateOptions {
    name: string | null;
    /** Isolation of the state's enclosure 0..1 (default 1 — a solid wall). */
    isolation?: number;
    /** Audible transition length, s. Irrelevant headless (applied before the run) but accepted for parity. */
    fadeS?: number;
}
export interface SimulateOptions {
    /** Defaults to playing; a captured initially stopped take must explicitly set false. */
    initialPlaying?: boolean;
    /** Synchronous read-only observation of live bodies, including silent ones. References are ephemeral. */
    /** Export frame consumer; awaited only when supplied, with the live simulation as its oracle. */
    observeFrame?: (time: number, engine: SatieEngine) => void | Promise<void>;
    observeBodies?: (time: number, instances: readonly EntityInstance[]) => void;
    actions?: readonly ReplayAction[];
    script: string;
    /** Already-parsed scene of `script` (saves a parse; used only to validate). */
    scene?: ParseResult;
    durationS: number;
    /** Decoded buffers keyed exactly as the live engine keys them (`pathFor(clip)`, `<base>#k`). */
    buffers: ReadonlyMap<string, AudioBuffer>;
    /** Trace frames per scene second (default 30 — the engine's spatial rate). */
    fps?: number;
    /**
     * Where the listener is over the run. Omitted: standing at
     * `DEFAULT_LISTENER_POSE` (origin, ear height, facing +Z) — the engine's
     * listener is placed there before `play()`, so distance signals, Doppler,
     * air absorption and the level model see the same vantage the live
     * listener has when nobody walks.
     */
    listenerPath?: ListenerKeyframe[];
    /**
     * Scene state applied (`engine.setSceneState`) before the run, so `zone`
     * voices are gated exactly as live: a non-matching `strict` voice is muted
     * (trace muffle 0), a non-matching soft voice occluded by `isolation`.
     * Omitted: no state — every zone matches.
     */
    sceneState?: SceneStateOptions;
    /** Engine seed. Omitted draws one; the trace reports what was used. */
    seed?: number;
    onProgress?: (fraction: number) => void;
    /** Frames per cooperative yield (default 300 — 10 s of scene). 0 never yields. */
    chunkFrames?: number;
}
export declare const SIMULATION_DEFAULT_FPS = 30;
/**
 * Does this script need the live engine to render correctly? True for
 * anything the sampled manifest cannot express: a `world` block, entities,
 * hosted voices, signal bindings, activity gates, take pools, chance members
 * and event emitters. A plain script of placed / wandering voices returns
 * false and keeps the seed-driven path, which renders it exactly already.
 */
export declare function needsSimulation(scene: ParseResult): boolean;
export { takeClipPath } from '../core/GenRequests.js';
/**
 * Run the script for `durationS` scene seconds in a headless engine and
 * return everything the renderer and the annotators need. Cooperative:
 * yields to the event loop every `chunkFrames` frames so a 600 s scene does
 * not freeze a UI thread; nothing else in the run is asynchronous, so the
 * yields do not perturb determinism.
 */
export declare function simulateScene(options: SimulateOptions): Promise<SceneTrace>;
//# sourceMappingURL=SceneSimulation.d.ts.map