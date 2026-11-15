/**
 * Render manifest: the single source of truth for everything an offline
 * render samples at random.
 *
 * The offline renderer used to draw volume/pitch/seeds/start times inline
 * with Math.random, which made a second (metadata) pass impossible — ADM and
 * USDZ export need position timelines that match the rendered audio exactly.
 * buildRenderManifest performs ALL per-voice sampling up front through one
 * injectable RNG and records the results; the audio pass and any metadata
 * pass then just read captured values. With a seeded RNG the whole render is
 * reproducible; unseeded (defaultRng) it behaves statistically like before.
 */
import { Statement } from '../core/Statement.js';
import { type ScatterOffset } from '../spatial/Scatter.js';
import { type ParseResult } from '../core/SatieParser.js';
import type { ReverbSuggestion } from '../spatial/WorldAcoustics';
import type { VoiceTrace } from './VoicePositions';
import type { SceneTrace, WorldRoom } from './SceneSimulation';
/** One scheduled voice: (statement copy, repetition) with sampled values. */
export interface RenderedVoice {
    sourceId?: string | null;
    objectId?: string | null;
    objectInstanceId?: string | null;
    stmtIndex: number;
    copyIndex: number;
    repIndex: number;
    stmt: Statement;
    startTime: number;
    /**
     * When this COPY first sounded — starts[0], shared by all its `every`
     * repetitions. Volume/pitch modulation evaluates against this, matching
     * the live engine (elapsed = now − track.startedAt, which retriggers never
     * reset). Evaluating against the repetition's own startTime restarted every
     * group fade-in per retrigger — a one-shot under a 30 s scene fade never
     * got past the first half-second of it, ~35 dB down for the whole export.
     */
    spawnTime: number;
    /** Buffer offset the source starts from (randomstart / count stagger). */
    startOffset: number;
    voiceDuration: number;
    volume: number;
    pitch: number;
    /** Sampled fade_in seconds (0 when unset — envelope applies 5ms micro-fade). */
    fadeIn: number;
    /** Sampled fade_out seconds (0 when unset). */
    fadeOut: number;
    /** Motion seed (0..1000) for wander/trajectory phase — see VoicePositions. */
    motionSeed: number;
    /** Mapped speed (post mapSpeed/mapTrajectorySpeed), cycles/s or wander rate. */
    wanderHz: number;
    /** Sub-seed for schedule-time samples (interpolation `every`, DSP params). */
    voiceRngSeed: number;
    /**
     * Rep-independent sub-seed (r = 0) for the volume/pitch modulation `every`
     * samples: modulation elapsed spans across `every` repetitions (see
     * spawnTime), so every repetition of a copy must agree on the cycle length
     * or the same fade evaluates differently per retrigger.
     */
    modRngSeed: number;
    /**
     * Trace-driven voice (SceneSimulation): position, level, rate and muffle
     * per frame come from a headless run of the live engine instead of the
     * seed-driven fields above (which are then placeholders — `motionSeed`
     * and `wanderHz` 0, `volume`/`pitch` the trace's first frame).
     */
    trace?: VoiceTrace;
    /** Buffer key the take plays from (pooled takes: `<base>#k`); defaults to the statement's clip. */
    clip?: string;
    /** Engine track key the source sounded on. */
    key?: string;
    /** Entity class id + instance number when the source belongs to an entity. */
    entity?: string;
    instance?: number;
    /** Pooled take index, -1 / undefined when not pooled. */
    take?: number;
    /**
     * `scatter` offset for this repetition, in metres — null when the voice
     * does not scatter. Consumed by `positionAt`, so audio and labels share it.
     */
    scatter?: ScatterOffset | null;
}
/**
 * The rooms a render's voices fall into when they carry no `reverb` of their
 * own — the live engine's author-wins ladder below the voice rung:
 * `in <room>` (byName) > the first declared room (scene) > the world room.
 * Derived once per render (`resolveRenderRooms`) and carried on the manifest
 * so every render mode, the stems and the mic array agree.
 */
export interface RenderRooms {
    /** The script's first declared `room` — the scene-wide rung (`deriveScriptRoom`). */
    scene: ReverbSuggestion | null;
    /** Every derived room by lowercased name, for `in <room>` (`deriveScriptRoomsByName`). */
    byName: ReadonlyMap<string, ReverbSuggestion>;
    /**
     * The world room the listener stood in — export-time (`RenderOptions.
     * worldRoom`) or the trace's — claimed only by voices with no script
     * reverb at all.
     */
    world: WorldRoom | null;
}
/** The room one voice sends into, in bus terms, plus which rung it came from. */
export interface VoiceRoom {
    roomSize: number;
    damping: number;
    wet: number;
    /**
     * True for a script room (voice `reverb` or a declared `room`): the dry
     * path is trimmed by `1 − wet`, as live. The world room never trims the
     * dry path — live, an unscripted voice's `reverbDry` stays at 1 and only
     * its send is levelled.
     */
    scripted: boolean;
}
export interface RenderManifest {
    voices: RenderedVoice[];
    duration: number;
    /** Clips that had no decoded buffer — their statements were skipped. */
    missingClips: string[];
    /** True when the voices came from a headless simulation (the reference path). */
    simulated?: boolean;
    /** The seed the simulation ran with (trace manifests only). */
    seed?: number;
    /** Entity lifecycle + event broadcasts, for annotations (trace manifests only). */
    spawns?: SceneTrace['spawns'];
    retires?: SceneTrace['retires'];
    events?: SceneTrace['events'];
    /** Entity agent transitions (behaviour tags), from a simulated trace. */
    behaviors?: SceneTrace['behaviors'];
    /** Rooms for voices without their own `reverb` (set by `prepareRenderManifest`). */
    rooms?: RenderRooms;
    /**
     * Producing software, so a manifest read years later says what wrote it
     * (`export/Attribution.ts`). Set by `buildRenderManifest`; a dataset job that
     * needs a byte-stable manifest can delete it.
     */
    producedBy?: string;
}
/**
 * Derive the render's rooms from the parsed scene — the same
 * `deriveScriptRoom` / `deriveScriptRoomsByName` the engine runs in
 * `loadScript` — plus the world room the caller knows about.
 */
export declare function resolveRenderRooms(scene: ParseResult, world: WorldRoom | null | undefined): RenderRooms;
/**
 * The room a voice WITHOUT its own `reverb` sends into, or null when there is
 * none (silent send, as live). Mirrors `SatieEngine.createVoice`: a named
 * room the statement is `in` > the scene's first room > the world room. A
 * voice with `reverbParams` never reaches this — the caller samples those.
 */
export declare function roomForVoice(stmt: Statement, rooms: RenderRooms | undefined): VoiceRoom | null;
/**
 * Start times for one voice copy: the sampled first start plus `every`-spaced
 * retriggers (oneshots only — the live engine never retriggers loops). The
 * interval is re-sampled per repetition, matching live scheduling.
 * Exported for tests (re-exported by OfflineRenderer).
 */
export declare function computeStartTimes(stmt: Statement, firstStart: number, totalDuration: number, rng?: () => number): number[];
/** Exported for tests (re-exported by OfflineRenderer). */
export declare function computeVoiceDuration(stmt: Statement, bufferDuration: number, remainingTime: number, pitch: number, rng?: () => number): number;
/**
 * Buffer offset a voice starts playing from. Mirrors the live engine:
 * `randomstart` wins; otherwise count-multiplied voices sharing a buffer get
 * a tiny phase stagger (≤ 30ms, ≤ 5% of duration, buffers > 1s only) so
 * coherent copies don't comb-filter. Exported for tests.
 */
export declare function computeStartOffset(stmt: Statement, voiceIdx: number, bufferDuration: number, rng?: () => number): number;
export declare function buildRenderManifest(statements: Statement[], duration: number, rng: () => number, bufferDurations: Map<string, number>, trace?: SceneTrace | null): RenderManifest;
/**
 * The trace-driven manifest: one RenderedVoice per simulated source, in the
 * order the engine started them. Nothing is sampled here — start, end, take,
 * motion, level, rate and muffle are the engine's own — except the
 * seed-derived sub-streams the render functions still draw from (DSP
 * interpolation cycles, reverb params, extent shape, random start offsets),
 * which hash from the trace's seed and the source index so a seeded
 * simulation stays a seeded render.
 */
export declare function buildTraceManifest(trace: SceneTrace, duration: number): RenderManifest;
//# sourceMappingURL=RenderManifest.d.ts.map