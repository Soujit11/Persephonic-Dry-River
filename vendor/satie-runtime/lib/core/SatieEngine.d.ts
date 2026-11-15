/**
 * Satie Web Audio Engine — the main runtime.
 * Uses SatieDSPClock + SatieScheduler for sample-accurate event timing.
 *
 * Performance architecture:
 * - Engine tick runs at RAF (~60fps) but only mutates track state objects in-place
 * - React UI is notified at a throttled rate (UI_NOTIFY_HZ) for non-critical state
 * - Three.js reads track state directly via refs (no React re-render needed)
 * - Discrete events (play/stop/script load) notify immediately
 */
import { type PlaybackSource } from '../synth/LiveSynthSource.js';
import { EventLog } from './EventLog.js';
import { Statement, Vec3 } from './Statement.js';
import { type PathSeeds } from '../spatial/SpatialPath.js';
import { InterpolationData } from './InterpolationData.js';
import { type LevelReport } from './LevelGovernor.js';
import { type LoopVoiceBudgetOptions, type LoopVoiceReport } from './LoopVoiceBudget.js';
export { AUTO_ANCHOR_MIN_DB, AUTO_ANCHOR_MAX_DB } from './LevelGovernor.js';
export type { LevelReport, LevelReportVoice } from './LevelGovernor.js';
export { displayNameOf } from './Statement.js';
import type { EntityDef, EntityInstance } from './Entities.js';
import { type DSPNodes } from '../dsp/DSPChain.js';
import type { ReverbBus } from '../dsp/ReverbBus.js';
import { type ReverbSuggestion, type DistanceProfile } from '../spatial/WorldAcoustics.js';
import { type LineSource } from '../spatial/SourceExtent.js';
import { type ScatterOffset } from '../spatial/Scatter.js';
import { type TriggerOnsetMeasure } from '../dsp/TriggerOnset.js';
import { type GenerateAudioHook, type SearchCommunityHook } from './GenResolver.js';
import { type MeasuredWorldRoom } from './WorldRoom.js';
import type { AgentGoal } from '../world/EntityAgents.js';
import { type HostGeometry } from './HostRegistry.js';
import { type RealizedWorld } from '../world/worldRealize.js';
import { type ReflectionLeg } from '../spatial/ElevationCues.js';
import { type FieldProvider } from '../world/WorldFields.js';
/** Generation parameters sampled from a gen statement's ranges. */
/**
 * Payload delivered with a runtime event (SatieEngine.fireEvent): where it
 * happened and, optionally, open-vocab text for `{text}` template prompts.
 */
export interface EventPayload {
    /** Route to this authored source_id only. Omitted preserves broadcast semantics. */
    sourceId?: string;
    /** Contact-point playback stays at payload coordinates; host-follow is an explicit alternative. */
    positionMode?: 'contact' | 'host';
    /** Stable physical body identity; independent bodies have independent cooldowns. */
    emitterId?: string;
    /** Originating Satie actor, used by bounded social responses to exclude self. */
    actorId?: string;
    /** Per-contact intensity, 0..1. Held for this take, independent of later signals. */
    gain?: number;
    x?: number;
    y?: number;
    z?: number;
    /** Open-vocab description of what the event happened on (`{text}` in template prompts). Filled from the world's `surface` field when the caller gives none. */
    text?: string;
    /**
     * The world fields at the event's point (WorldFields.ts), filled by
     * `fireEvent` when a field provider is active: a `when depth …` /
     * `when submerged …` / `when liquid …` on an `on` voice reads these before
     * the listener's own signal.
     */
    depth?: number;
    submerged?: number;
    liquid?: number;
}
export declare function normalizeOnArrival(buffer: AudioBuffer): void;
export type { GenOptions } from './GenRequests.js';
export type { GenerateAudioRequest } from './GenResolver.js';
/** Construction options for embedding the engine in an existing audio graph. */
export interface SatieEngineOptions {
    /**
     * Use an existing AudioContext instead of creating one. The engine will NOT
     * close a supplied context on destroy().
     */
    audioContext?: AudioContext;
    /** Route the engine's output into this node instead of ctx.destination. */
    destination?: AudioNode;
    /**
     * Headless: `play()` does not start the animation-frame tick loop; the
     * embedder steps the scene itself with `advance(dtSec)` after moving the
     * context's clock (see `export/SceneSimulation.ts` + `NullAudioContext`).
     */
    headless?: boolean;
    /** Interactive `on` events skip measured leading noise by default; preserve keeps authored buffer timing. */
    triggerOnsetAlignment?: 'align' | 'preserve';
    /** Opt-in native continuous-voice limit. Logical loops continue while virtual; events bypass it. */
    loopVoiceBudget?: LoopVoiceBudgetOptions;
}
/**
 * The public, read-only per-frame view of a voice — what an external renderer
 * (three.js spheres, a world viewer) needs to draw it. `TrackState` extends
 * this with Web Audio node handles and hot-path caches; prefer TrackView in
 * embedding code. Objects are mutated in place at the spatial tick rate —
 * read them each frame, don't snapshot or hold across loadScript().
 */
export interface TrackView {
    readonly key: string;
    /** Resolved host identity (including the selected member of a host class). */
    readonly hostId: string | null;
    readonly statementIndex: number;
    readonly voiceIndex: number;
    readonly statement: Statement;
    readonly position: Readonly<Vec3>;
    readonly pinned: Readonly<Vec3> | null;
    readonly pending: boolean;
    readonly isPlaying: boolean;
    /** Logical loop exists, but its native source and authored DSP are suspended by an opt-in budget. */
    readonly virtual: boolean;
    readonly volume: number;
    readonly pitch: number;
    readonly color: string;
    readonly alpha: number;
    readonly occlusion: number;
    readonly floorY: number;
    readonly doppler: number;
    /** Distance to the currently rendered finite source surface, not its host origin. */
    readonly surfaceDistanceM: number;
    readonly sourceExtentDeg: number;
}
/** The ladder (which individuals are voices) runs every this many spatial ticks (~5 Hz). */
/** @internal Full live track record — prefer {@link TrackView} in new code. */
export interface TrackState {
    key: string;
    /** Index of the owning statement — stored once so hot paths never parse the key. */
    statementIndex: number;
    /** Copy index within a count-multiplied statement. */
    voiceIndex: number;
    statement: Statement;
    sourceNode: PlaybackSource | null;
    gainNode: GainNode;
    /** Trigger-only contact intensity, independent from follow/envelope writes. */
    triggerGainNode: GainNode | null;
    /** Temporary overlapping contact graph; kept outside broadcast candidate enumeration. */
    _triggerSpareFamily: string | null;
    /** An explicit gameplay contact position survives subsequent host transform updates. */
    _triggerAtContact: boolean;
    surfaceDistanceM: number;
    sourceExtentDeg: number;
    /**
     * Static attenuator between gainNode and the DSP/panner chain.
     * When N voices share an AudioBuffer (count-multiplied statements), we scale
     * each by 1/sqrt(N) so coherent summing doesn't blow the limiter into pumping.
     */
    scaleGain: GainNode;
    pannerNode: PannerNode;
    /**
     * Elevation cues (spatial/ElevationCues.ts). `directTrim` sits between the
     * point leg and the panner; the floor (and, inside an interior, ceiling)
     * reflection legs branch off it into the SAME panner, so direct + delayed
     * image comb-filter exactly as a ground reflection does at the ear. Beds
     * and fields (no location / no distance) carry no legs.
     */
    directTrim: GainNode;
    floorLeg: ReflectionLeg | null;
    ceilingLeg: ReflectionLeg | null;
    /** The TRUE point last written to the panner (before any monitor warp) — what the reflections mirror. */
    _heard: Vec3;
    _lastDirectTrim: number;
    position: Vec3;
    /**
     * User-pinned position (viewport drag). When set, the spatial tick uses it
     * verbatim instead of evaluating the wander/trajectory for this voice.
     */
    pinned: Vec3 | null;
    /**
     * True while the voice has no audio buffer yet (generation/community search
     * in flight). The viewport renders pending voices dimmed + labeled so the
     * scene visibly assembles instead of showing silent "ready" spheres.
     */
    pending: boolean;
    /**
     * Lazy generation (`lazyGeneration`) created this gen voice without
     * requesting its clip: the state did not need it (demand 0 now and within
     * the horizon). Pending, no source, no request — the demand tick clears
     * the flag and requests the clip the moment demand rises. A buffer that
     * arrives by any other route (a sibling statement's clip) clears it too.
     */
    dormant: boolean;
    /**
     * Set by stopTrack the moment the fade-out ramp is scheduled. The track
     * stays in `tracks` until cleanup fires, and the tick loop's volume writes
     * (modulation, follow bindings) would re-assert full gain every frame and
     * turn the fade into a hold-then-click. While stopping, the ramp owns the
     * gain param.
     */
    stopping: boolean;
    isPlaying: boolean;
    virtual: boolean;
    startedAt: number;
    volume: number;
    pitch: number;
    color: string;
    alpha: number;
    seed: number;
    wanderHz: number;
    dspChain: DSPNodes | null;
    /**
     * Reverb as a send to a shared room bus rather than an in-chain crossfade.
     * `reverbDry` attenuates the direct path by (1 - wet) ahead of the panner;
     * `reverbSend` feeds the bus at a distance-INDEPENDENT level and bypasses
     * the panner entirely, so the reverberant field neither fades with distance
     * nor localizes at the source.
     *
     * Built for EVERY voice, including those whose script asked for no reverb —
     * a source standing in a room excites that room whether or not its author
     * thought about it. Unscripted voices simply sit at wet 0 (send silent, dry
     * at unity) until a world room arrives and lends them its own wet.
     */
    reverbSend: GainNode | null;
    reverbDry: GainNode | null;
    /**
     * Did the script ask for reverb? Decides whose `wet` wins in a world room
     * (the author's) and what happens on leaving one (scripted voices return to
     * their own bus; unscripted voices go dry again).
     */
    _hasScriptReverb: boolean;
    /**
     * How separated this source is from the listener's enclosure, 0–1. Drives a
     * gain on the SEND leg, which is the half of the obstruction/occlusion split
     * the engine was missing: the dry-path muffle handles obstruction, and this
     * handles transmission through a wall, where the energy never reaches the
     * listener's room to reverberate in the first place.
     */
    _transmissionBlocked: number;
    /** Cached last written send-leg gain, for write skipping. */
    _lastTransmissionGain: number;
    /**
     * The voice's own script room. Null while a world room is active — then the
     * send feeds the engine's shared world-room input instead, and the room the
     * listener is standing in decides the impulse response.
     */
    reverbBus: ReverbBus | null;
    /** Sampled script room — kept so a world room can be entered and left again. */
    _reverbRoomSize: number;
    _reverbDamping: number;
    /** Sampled `wet` — the send level is recomputed from it when the room changes. */
    _reverbWet: number;
    /**
     * Geometry-driven occlusion lowpass (world-scene collider raycasts).
     * Created lazily on first setTrackOcclusion — non-world scenes never pay
     * for the extra node. Sits between the panner and the master bus.
     */
    /**
     * Source-extent crossfade (SourceExtent.ts). `pointGain` scales the HRTF
     * panner leg, `wideGain` the send into the shared decorrelated wide bus.
     * Every voice has both: even a point source widens into stereo at the head
     * (near-field rule) instead of hard-flipping ear to ear.
     */
    pointGain: GainNode;
    wideGain: GainNode;
    /**
     * The governed level (calibrated scenes: emission against the HDR window,
     * `writeVoiceGain`), applied AFTER the DSP chain so a +40 dB pre-panner
     * gain never drives a waveshaper hot; `gainNode` keeps the fade envelope
     * and, uncalibrated, the volume. Unity when uncalibrated.
     */
    levelNode: GainNode;
    /**
     * The place channel (spec 012, E1): unity except while a version crossfade moves this voice in
     * or out. After `levelNode`, so the dry path, the wet send and the wide leg all follow it and a
     * reverb tail fades with its voice. Optional only for hand-built test tracks.
     */
    placeGain?: GainNode | null;
    /** Until this context time, level writes glide with `_glideTau` (a crossfaded rebalance). */
    _glideUntil?: number;
    _glideTau?: number;
    /**
     * `rotate` — the source's yaw in radians (0 = facing +Z, positive toward
     * +X). Composes an attached child's local offset; reserved for panner
     * directivity later (cones are neutral today).
     */
    yawRad: number;
    /** Sampled `radius` in meters (0 = point). For rings, the band thickness. */
    _radiusM: number;
    /**
     * `scatter` — this instance's offset from the placed position, in metres.
     * Drawn once for a loop, redrawn every fire for a one-shot. Null when the
     * voice does not scatter (the overwhelming majority), so the position path
     * pays nothing for the feature existing.
     */
    _scatter: ScatterOffset | null;
    /** Sampled `ring` radius in meters (0 = no ring). */
    _ringM: number;
    /**
     * `line` voices: the line itself (a strip's centreline and half width from
     * the world, or the long axis of a placed box), and how far its diffuse
     * field reaches (`LINE_DIFFUSE_REACH_M` for a paved strip, 0 for a liquid
     * one or a placed line). Null until known — a hosted line learns it when
     * its strip is found. SourceExtent.sampleLineExtent.
     */
    _line: LineSource | null;
    /** `bed` — non-localized layer: wide leg only, no distance behavior. */
    _bed: boolean;
    /** Write-skip caches for the crossfade gains. */
    _lastPointG: number;
    _lastWideG: number;
    occlusionFilter: BiquadFilterNode | null;
    /** Level cut paired with the occlusion filter (walls block energy, not just highs). */
    occlusionGainNode: GainNode | null;
    occlusion: number;
    /**
     * The placed-room system's smoothed occlusion FLOOR for this voice —
     * `occlusionBase` re-read through which side of a placed room's boundary
     * the listener stands on (inside with the voice → 0; outside while the
     * voice is inside → the room's boundary muffle). Owns the floor that
     * `setTrackOcclusion` clamps to; the geometry raycast can add, never erase.
     * Tracks with an `occlusion follow` binding are skipped — a binding owns
     * its property.
     */
    _roomOccFloor: number;
    /**
     * Where the sound APPEARS to come from when it reaches the listener by
     * bending through a doorway rather than in a straight line (diffraction —
     * see spatial/Diffraction.ts). Set by the world layer from the room/portal
     * graph; null = the panner sits at the true position. `position` stays the
     * true position: the viewport orb, Doppler, `distance` signals and the
     * script all describe where the thing IS, only the panner hears the door.
     */
    apparent: Vec3 | null;
    /**
     * True while `apparent` is owned by the INTERIOR routing pass (a listener
     * inside a shell hearing this exterior voice through an aperture), so the
     * pass can clear only what it set and never clobber a diffraction redirect
     * written by `setTrackDiffraction`.
     */
    _interiorRouted: boolean;
    /**
     * World-geometry floor: the voice's Y is clamped to stay above this
     * (terrain conform — no voice sounds from under the ground). -Infinity
     * when no world is active.
     */
    floorY: number;
    /** Smoothed Doppler playback-rate ratio (1 = no shift). */
    doppler: number;
    /** Listener distance at the previous spatial tick (-1 = unknown). */
    _lastDistM: number;
    /**
     * Where the listener stood when this copy of a class-hosted loop was bound
     * to its instance (NaN = not a class-hosted copy). A distributed source
     * (`N * loop … at tree`) occupies the N instances nearest the listener,
     * and re-occupies once the listener has walked `CLASS_REBIND_M` from here:
     * the wind is in every tree, so it stays around the walker.
     */
    _hostBindX: number;
    _hostBindZ: number;
    /** Radial velocity at the last spatial tick (m/s, + = receding) — feeds
     * the `closing` signal for follow bindings. */
    _radialV: number;
    /** `when` edge state: true while the signal sits inside the band. */
    _whenInside: boolean;
    /** Listener distance at the previous `when` evaluation (-1 = unknown) —
     * kept separately from _lastDistM, which only updates while audio plays. */
    _whenLastDist: number;
    /** How far the SOURCE sits under a liquid surface, 0..1 — the world's
     * `submerged` field at its position (WorldFields), measured on the
     * staggered world tick (`updateImmersion`). */
    _immersion: number;
    /** The listener's submersion the muffle chain last composed the
     * air/water interface loss against (NaN = never). */
    _lastMediumSub: number;
    /** True while a Doppler shift is applied to playbackRate (needs reset to pitch). */
    _dopplerActive: boolean;
    /** Last cutoff/gain written to the muffle chain — skip writes when flat. */
    _lastCutoffHz: number;
    _lastOccGain: number;
    /** Scene-state gating (`zone … strict`): crossfaded to silence via the
     * muffle chain while the engine's scene state matches none of the voice's
     * zones. Recomputed by applyZoneState on every setSceneState. */
    _zoneMuted: boolean;
    /** Scene-state occlusion for non-strict zoned voices (the state's isolation
     * — a wall's worth of muffle, composed with geometry occlusion via max). */
    _zoneOcclusion: number;
    /**
     * Generation counter for the oneshot retrigger chain. Async buffer arrivals
     * call retriggerAudio concurrently with the scheduled chain — each schedule
     * bumps this so superseded chain events become no-ops instead of doubling
     * the retrigger rate.
     */
    _retriggerGen: number;
    /** World object this voice is currently hosted on (`at …`), null when unhosted. */
    hostId: string | null;
    /**
     * The entity instance this voice is a member of (Entities.ts), null for a
     * free-standing voice. Members are pinned to the instance's body every
     * spatial tick and read its kinematics as signals (`velocity`, `accel`,
     * `progress`, `age`).
     */
    entityInstance: EntityInstance<TrackState> | null;
    /** Member ordinal within the instance (index into `def.memberIndices`), -1 for non-members. */
    _member: number;
    /** Multiplier on every pitch this voice plays — the instance's pitch offset (1 for non-members). */
    _pitchScale: number;
    /** Count-scaling base for `scaleGain` (1/√count); activity multiplies it. */
    _scaleBase: number;
    /** World-state activity 0..1 (`active` hours × `quiet` weather), last written. */
    _activity: number;
    /** Foliage on the path to the listener, 0..FOLIAGE_MAX_OCCLUSION (procedural world). */
    _foliage: number;
    /** Pooled take (`variants`) that last played, -1 before the first fire. */
    _variant: number;
    /**
     * Level model (spatial/LevelModel.ts) — meaningful in a CALIBRATED scene
     * (some statement or entity states `spl`); NaN / inert otherwise.
     * `_splDb` is the emission the script states: sampled once at creation, or
     * re-read every spatial tick from a `spl follow` signal. `_emissionDb` adds
     * the `volume` trim; `_receivedDb` is what propagation leaves at the ear;
     * `_levelGain` the last gain target written for the voice (write-skip
     * cache for the governor); `_pathGain` the linear path loss the reverb send
     * is scaled by, with its own last-written cache.
     */
    _splDb: number;
    _emissionDb: number;
    _receivedDb: number;
    _levelGain: number;
    _pathGain: number;
    _lastPathGain: number;
    /**
     * Context time the current fade-in ramp ends. A governed level write that
     * lands before then re-aims the ramp at the new target instead of cutting
     * it short — the window moving during a 4 s bed fade-in must duck the bed,
     * not kill its fade.
     */
    _fadeEndT: number;
    /** Clock time the current take ends (Infinity for a loop) — a fired event stops governing the window there, whether or not `onended` has run (headless runs never signal it). */
    _sourceEndT: number;
    /**
     * `at <strip> pass` — the voice is travelling the strip's polyline right
     * now: arc-length start, direction (+1/-1 along the line), speed (m/s),
     * the clock time it set off and the strip's arc length, all fixed at the
     * fire so the spatial tick only evaluates a line.
     */
    _passActive: boolean;
    _passArc0: number;
    _passDir: number;
    _passSpeed: number;
    _passT0: number;
    /** Clock time the take (and so the run) is over; Infinity for a loop. */
    _passEnd: number;
    _passLen: number;
    _lastFilterCutoff: number;
    _lastFilterQ: number;
    _lastFilterWet: number;
    _lastDriveBucket: number;
    _lastDistWet: number;
    _lastDelayTime: number;
    _lastDelayFeedback: number;
    _lastDelayWet: number;
    _lastReverbWet: number;
    _lastEQLow: number;
    _lastEQMid: number;
    _lastEQHigh: number;
    _cachedDurations: Map<InterpolationData, number>;
    _staticColorR: number;
    _staticColorG: number;
    _staticColorB: number;
    _seeds: PathSeeds;
    _wanderSpeed: number;
    _trajectoryPhase: number;
}
export interface EngineState {
    isPlaying: boolean;
    currentTime: number;
    tracks: TrackState[];
    statements: Statement[];
    errors: string | null;
}
/** Lightweight snapshot for React UI — only scalar values that change slowly */
export interface EngineUIState {
    isPlaying: boolean;
    currentTime: number;
    trackCount: number;
    statements: Statement[];
    errors: string | null;
    runtimeWarnings: string[];
    mutedIndices: ReadonlySet<number>;
    soloedIndices: ReadonlySet<number>;
    genStatus: GenStatus;
    /** The script's realized procedural world (identity changes only when the `world` block does). */
    world: RealizedWorld | null;
}
/** Progress of gen-voice audio resolution (community match or ElevenLabs). */
export interface GenStatus {
    /** Loaded take slots, separately from voices ready on their first take. */
    takes?: {
        ready: number;
        requested: number;
    };
    /** Gen voices in the script. */
    total: number;
    /** Gen voices with a decoded buffer (sounding or ready to sound). */
    ready: number;
    /**
     * Gen voices lazy generation is holding back (`lazyGeneration`): the
     * state does not need them now or within the demand horizon, so nothing
     * was requested. Not counted in `missing` — "N of M ready" is about what
     * the state actually needs. The engine always writes it; optional only so
     * a UI's zero-state literal (`useSatieEngine`) predates it harmlessly.
     */
    dormant?: number;
    /** Display names of voices still waiting on audio (deduped; dormant voices excluded). */
    missing: string[];
}
type EngineListener = (state: EngineState) => void;
type UIListener = (state: EngineUIState) => void;
/**
 * How far the listener walks before the copies of a class-hosted loop are
 * re-bound to the instances now nearest. Under this, the bound trees still
 * surround the walker and their levels change with every step; past it, the
 * grove has been left and the source follows into the next one.
 */
export declare const CLASS_REBIND_M = 10;
/**
 * An equal-power crossfade leg (spec 012 E2): `out` falls from `from` along cos, `in` rises from
 * `from` to 1 along sin, so two legs that start together keep cos² + sin² = 1. The same curve as
 * `crossfadeGains` (point and wide legs of an extended source), over time instead of extent.
 */
export declare function equalPowerCurve(from: number, dir: 'in' | 'out', points?: number): Float32Array;
export declare class SatieEngine {
    private ctx;
    private clock;
    private scheduler;
    private audioTickObservers;
    /** Runs prepared control work on live/headless audio-clock ticks; unsubscribe on adapter disposal. */
    subscribeAudioTick(callback: (time: number) => void): () => void;
    private masterGain;
    private readonly takePool;
    /**
     * Where the master bus should rest: the constructor's headroom until the app
     * dials in the user's own level. Tracked rather than read back off the node,
     * so a fade can ramp TO it without reading a value the fade itself is moving.
     */
    private _masterVolume;
    /**
     * The rooms voices send into (see {@link WorldRoom}): the measured world
     * room, the script's declared rooms, the placed room the listener stands
     * in, and the shared reverb bus pool. Created in the constructor once the
     * master gain exists.
     */
    private readonly _rooms;
    /** The surroundings' effect on each voice: obstruction, placed rooms, distance, reflections, the medium (see Acoustics.ts). */
    private readonly _acoustics;
    /** Read-only views the behavior suites peek at. */
    private get reverbBuses();
    private get worldRoom();
    private get scriptRoom();
    private get scriptRoomsByName();
    /** The placed rooms the listener can walk into (read-only view; owned by {@link Acoustics}). */
    private get _placedRooms();
    /** The placed room the listener currently stands in, lowercased — null outside all. */
    private get _listenerRoomName();
    /** How much the listener is in each soundscape, 0..1 (spec 014): the `in_<soundscape>` signals. */
    get soundscapeShares(): ReadonlyMap<string, number>;
    /** The soundscape the listener is in: a room by its walls; outdoors, whose own steady sounds are loudest, held until another is 3 dB louder. Null before anything sounds or with no soundscape. */
    get soundscapeHere(): string | null;
    /** The soundscape a statement belongs to (by object, source id, or `in <room>`), or null. */
    soundscapeOf(stmt: Statement): string | null;
    /** The rooms a listener can walk into (placed `room` blocks): each publishes `in_<room>`, and any of them `indoors`. */
    get placedRoomNames(): string[];
    /** The placed room the listener is in now, or null (spec 012 E0; read-only). */
    get listenerRoom(): string | null;
    /** Every placed room's box: centre and half-extents in metres (spec 012 E0; read-only). */
    get placedRooms(): ReadonlyArray<{
        name: string;
        centre: Vec3;
        half: Vec3;
    }>;
    /** The medium stage once built (read-only view for the medium suite). */
    private get medium();
    /** That room's reverb — the ambient override while inside (ladder: voice > named > THIS > scene room). */
    private get _listenerRoomReverb();
    /**
     * Shared decorrelated stereo bus for every voice's wide layer (SourceExtent).
     * One velvet-noise convolver pair serves all voices — decorrelation is
     * linear, so decorrelating the summed sends equals decorrelating each voice.
     * Created lazily on the first voice.
     */
    private wideBus;
    /** Preallocated extent scratch — the tick loop must not allocate. */
    private _extentScratch;
    private get fdnNode();
    private get worldRoomLayers();
    private limiter;
    private tracks;
    /** What sounded, when, where — the timeline's past half (EventLog.ts). */
    private _log;
    /** The loaded script's `entity` blocks (Entities.ts) and their live runtimes. */
    private entityDefs;
    /** The entity layer (see {@link EntityRuntime}); the engine lends it voices, the scheduler and the trigger ledger. */
    private readonly _entities;
    /** Shared array updated in-place. Three.js reads this directly via ref. */
    private _tracksArray;
    private _tracksArrayDirty;
    private audioBuffers;
    private audioByteHashes;
    private statements;
    private errors;
    private animFrameId;
    private listeners;
    private uiListeners;
    private _isPlaying;
    private _lastUINotify;
    private _lastSpatialUpdate;
    /** Runtime warnings (missing samples, generation failures, etc.) */
    private _runtimeWarnings;
    private readonly _programs;
    private _runtimeWarningsMax;
    /** The level model / HDR window (see {@link LevelGovernor}); the engine feeds it the tracks, the clock and the listener. */
    private readonly _levels;
    /** Live audition trims by statement index (a fader being dragged): heard at once, never written to the script. */
    private readonly _previewGain;
    /** The sounds an editor is working on, heard whatever the game's state (see {@link holdAudible}). */
    private readonly _editHold;
    /** Runtime mixer state (independent of parsed mute/solo) */
    private _mutedIndices;
    private _soloedIndices;
    /**
     * Voices whose buffers weren't loaded when their start event fired.
     * Drained when `loadAudioBuffer`/`loadAudioFile` registers a matching buffer.
     * Keyed by both `pathFor(clip)` and the raw clip name — buffers can be
     * stored under either form depending on the caller.
     */
    private _pendingVoices;
    /**
     * Hard inventory of every BufferSource we've started.
     * `track.sourceNode` is the *intended* reference, but the engine has enough
     * async paths (drainPendingVoices, generateAndRetrigger, resolveAndRetrigger,
     * communityThenGenerate) that a source can survive a missed cleanup if a
     * track-keyed reference goes stale. teardownAll iterates this set as a
     * second pass so no source escapes stop().
     */
    private _activeSources;
    /**
     * Whether masterGain is currently wired to the limiter. stop() severs this
     * connection as a final hard-kill: even if a stray source slips past the
     * per-track teardown, no audio reaches the destination once masterGain is
     * disconnected. play() reconnects.
     */
    private _masterConnected;
    /** Callback for resolving missing audio buffers (e.g. community samples). */
    onMissingBuffer: ((clipName: string) => Promise<ArrayBuffer | null>) | null;
    /**
     * How gen audio gets made (see {@link GenResolver}): the queue, the in-flight
     * map, the failure latch and the library-first / upgrade policy. The engine
     * hands it the buffer registry, the decoder, the demand evaluation and the
     * voice restart; the hooks and flags below are its public face.
     */
    private readonly _gen;
    /**
     * Audio generator for `gen` statements. The engine itself talks to no
     * external service — the app wires this to ElevenLabs (src/lib/AudioGen);
     * embedders may supply their own generator or leave it null, in which case
     * gen voices stay pending with a single runtime warning.
     */
    get onGenerateAudio(): GenerateAudioHook | null;
    set onGenerateAudio(hook: GenerateAudioHook | null);
    /**
     * Callback to search community samples by a gen prompt (e.g. "gentle rain").
     * Returns an ArrayBuffer if a matching community sample is found; `rank`
     * asks for the k-th best match (see {@link GenResolver}).
     */
    get onSearchCommunity(): SearchCommunityHook | null;
    set onSearchCommunity(hook: SearchCommunityHook | null);
    /** When true, try community samples before calling the generator for gen statements. */
    get preferCommunitySamples(): boolean;
    set preferCommunitySamples(v: boolean);
    /** Lazy, predictive generation (default off): dormant voices are woken by the demand tick. See {@link GenResolver.lazyGeneration} and `demandOf`. */
    get lazyGeneration(): boolean;
    set lazyGeneration(v: boolean);
    /** Start a demand-woken voice from a library stand-in and upgrade in the background. See {@link GenResolver.standInForPredicted}. */
    get standInForPredicted(): boolean;
    set standInForPredicted(v: boolean);
    /** Generate the bespoke take behind a community stand-in and swap it in. See {@link GenResolver.upgradeGeneratedAudio}. */
    get upgradeGeneratedAudio(): boolean;
    set upgradeGeneratedAudio(v: boolean);
    /** Sounds requested but not yet landed (queued + in flight) — for "N on the way" UI. */
    get generationQueueDepth(): number;
    /** Observe queue transitions (fires at request/settle time, never per frame). */
    set onGenQueueChange(cb: ((queued: number, inFlight: number) => void) | null);
    /** True when the engine created (and therefore owns/closes) its context. */
    private _ownsContext;
    /** No RAF loop — the embedder drives the scene with `advance()`. */
    private readonly headless;
    /**
     * Every random draw the engine makes (range samples, voice seeds, take
     * picks, entity constants, humanize, random start offsets) goes through
     * this. Live playback keeps `Math.random`; a headless simulation installs
     * `mulberry32(seed)` so a run is reproducible — the offline export's
     * metadata pass and audio pass must agree, and batch datasets vary by seed.
     */
    rng: () => number;
    private readonly triggerOnsetAlignment;
    private readonly _loopVoiceBudget;
    constructor(options?: SatieEngineOptions);
    get audioContext(): AudioContext;
    /** The node every sketch sound flows through on its way to the destination (capture taps connect here). */
    get outputNode(): AudioNode;
    get isPlaying(): boolean;
    get currentTime(): number;
    /** Allocating diagnostic snapshot: real native loops versus retained logical voices. */
    loopVoiceReport(): LoopVoiceReport;
    private loopReceivedGain;
    private loopPlaybackRate;
    private suspendLoopVoice;
    private resumeLoopVoice;
    /** Get all decoded audio buffers (for offline export). */
    getAudioBuffers(): ReadonlyMap<string, AudioBuffer>;
    /** PCM onset estimate for a decoded clip; never a hardware/output latency measurement. */
    bufferOnset(clip: string): TriggerOnsetMeasure | null;
    /**
     * Play a UI-triggered one-shot buffer (footsteps, interaction sounds)
     * through the master chain, so the master gain, limiter, and stop() all
     * apply — a separate AudioContext would keep making noise after mute.
     * Non-spatial by design (self-sounds have no direction); `pan` gives step
     * alternation its slight left/right sway.
     */
    playOneShotBuffer(buffer: AudioBuffer, opts?: {
        volume?: number;
        playbackRate?: number;
        pan?: number;
        maxDurationS?: number;
        offsetSeconds?: number;
    }): void;
    /**
     * Play a buffer AT a world position — the spatial sibling of
     * playOneShotBuffer, for world sounds the player perceives (an approached
     * shoreline, a passed object) rather than self-sounds. Same HRTF panner
     * settings as scene voices so distance attenuation matches the mix, same
     * master-chain routing so mute/stop/limiter apply. Supports looping for
     * sustained ambience; the returned handle fades out and frees the nodes.
     */
    playOneShotAt(buffer: AudioBuffer, x: number, y: number, z: number, opts?: {
        volume?: number;
        playbackRate?: number;
        loop?: boolean;
        fadeInS?: number;
        maxDurationS?: number;
        distanceProfile?: DistanceProfile;
    }): {
        stop: (fadeS?: number) => void;
    };
    /**
     * playOneShotAt, heard through the SIMULATION's acoustics — for previews of
     * a voice that carries treatment (`in <room>` + `occlusion`). The sample
     * stays dry; the same math the engine applies to scene voices shapes the
     * preview: occlusion through the muffle law (combinedCutoffHz lowpass +
     * occlusionGain), the room through a shared reverb bus (acquired from the
     * scene pool, so a playing scene's identical room reuses one convolver).
     * Space is never baked into the sample — it is applied here, live.
     *
     * `room` names a room the CURRENT script declares (resolved via the same
     * derivation as `in <room>` voices); explicit `reverb` params win over it.
     */
    playOneShotTreated(buffer: AudioBuffer, x: number, y: number, z: number, opts?: {
        volume?: number;
        loop?: boolean;
        fadeInS?: number;
        maxDurationS?: number;
        occlusion?: number;
        reverb?: ReverbSuggestion;
        room?: string;
        distanceProfile?: DistanceProfile | null;
        line?: boolean;
        /** Beds preserve their channel image and bypass the point panner. */
        spatial?: boolean;
        onEnded?: () => void;
    }): {
        stop: (fadeS?: number) => void;
    };
    /** Last listener position fed in — read by the spatial tick for distance acoustics. */
    private _listenerPos;
    /** Listener position at the previous spatial tick + measured speed (m/s) —
     * feeds the `speed` signal for follow bindings. */
    private _lastListenerTickPos;
    private _listenerSpeed;
    /** Last orientation written to the AudioListener (Web Audio defaults). */
    private _listenerFwd;
    private _listenerUp;
    /**
     * Minimum per-axis delta before listener automation is written. Both setters
     * are called unconditionally every R3F frame — with a still camera that was
     * ~540 pointless automation events/sec. Compared against the last *written*
     * values so slow pans still accumulate past the threshold.
     */
    private static readonly LISTENER_EPS;
    /** Sync the AudioListener to the camera/observer position (smoothed to avoid artifacts). */
    setListenerPosition(x: number, y: number, z: number): void;
    /** Sync the AudioListener orientation (smoothed to avoid artifacts on rapid head turns). */
    setListenerOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
    /**
     * Sync the listener from a column-major 4×4 world matrix (three.js:
     * `camera.matrixWorld.elements`). Allocation-free; per-frame safe — the
     * underlying setters are epsilon-gated. Scale in the matrix is normalized
     * out of the direction vectors.
     */
    setListenerFromMatrix(m: ArrayLike<number>): void;
    /** Pure matrix → listener pose decomposition (exposed for tests). */
    static listenerPoseFromMatrix(m: ArrayLike<number>): {
        px: number;
        py: number;
        pz: number;
        fx: number;
        fy: number;
        fz: number;
        ux: number;
        uy: number;
        uz: number;
    };
    /**
     * Public per-frame read surface: the same in-place-mutated track objects as
     * getTracksArray, narrowed to the read-only {@link TrackView} fields.
     */
    getTrackViews(): readonly TrackView[];
    /** Where the listener is now (world metres, +Y up), for tools that describe the scene from there. */
    get listenerPosition(): Readonly<{
        x: number;
        y: number;
        z: number;
    }>;
    /** Where the listener faces now (unit vector), for tools that say what is in front of you. */
    get listenerForward(): Readonly<{
        x: number;
        y: number;
        z: number;
    }>;
    /**
     * What a live track is playing right now, for analysis (the mixer's audibility model):
     * the take's buffer and the cutoff of its path low-pass (air absorption, occlusion), if any.
     */
    trackSignal(key: string): {
        buffer: AudioBuffer | null;
        cutoffHz: number | null;
    } | null;
    /** Get the shared tracks array. Updated in-place — no allocation per frame. */
    /** The scene event log: starts, fires, stops, spawns, retires, broadcast events. */
    get eventLog(): EventLog;
    /**
     * Queued re-fires due within `horizonS` (clock seconds) — the timeline's
     * future half. Only the scheduler's retrigger events, labelled by clip.
     */
    upcomingFires(horizonS: number): {
        t: number;
        key: string;
        statementIndex: number;
        label: string;
    }[];
    /** Record a scene event (allocates one small object; not per tick). */
    private logEvent;
    getTracksArray(): TrackState[];
    subscribe(listener: EngineListener): () => void;
    /** Subscribe to throttled UI-only updates (currentTime, trackCount). */
    subscribeUI(listener: UIListener): () => void;
    private notify;
    private notifyUI;
    /** Memoized gen status — notifyUI calls at 8 Hz and status rarely changes. */
    private _genStatusCache;
    private _genStatusStatements;
    private _genStatusBufferCount;
    private _genStatusDormantVersion;
    /** Bumped whenever a track's `dormant` flag changes — the gen-status memo's third key. */
    private _dormantVersion;
    /** Snapshot of gen-voice audio progress for the UI (runs at UI notify rate). */
    private getGenStatus;
    /** Add a runtime warning (surfaced to editor UI). */
    private addRuntimeWarning;
    /** Clear runtime warnings (called on play/stop). */
    private clearRuntimeWarnings;
    /** Decode the exact bytes we hash. Missing Web Crypto leaves identity unverified. */
    decodeAudioAsset(data: ArrayBuffer, expectedSha256?: string): Promise<AudioBuffer>;
    /** Identity of encoded bytes decoded for this buffer, before normalization/effects. */
    getAudioAssetHash(buffer: AudioBuffer): string | undefined;
    loadAudioFile(name: string, url: string): Promise<void>;
    /**
     * True when the context needs a resume() to produce sound. iOS Safari adds a
     * non-standard 'interrupted' state (phone call, backgrounding, Siri) that
     * behaves like 'suspended' but never matches it — without this check an
     * interrupted context stays silent forever.
     */
    private ctxNeedsResume;
    loadAudioBuffer(name: string, data: ArrayBuffer, opts?: {
        maxDurationS?: number;
    }): Promise<void>;
    /**
     * Register an already-decoded AudioBuffer under a clip name. The decoded
     * ingress for embedders who own their own loading pipeline — no fetch, no
     * decode, no context-resume dance.
     */
    setAudioBuffer(name: string, buffer: AudioBuffer): void;
    /**
     * Put another buffer under a clip name and hear it at once: a loop playing it crossfades onto
     * the new one (`swapBufferSmooth`, 0.3 s); a one-shot plays it from its next fire. What an
     * editor uses to audition a candidate where the sound plays (and to put the old one back).
     * `setAudioBuffer` alone only wakes voices waiting for a buffer: a playing loop keeps its own.
     */
    replaceAudioBuffer(name: string, buffer: AudioBuffer): void;
    /**
     * Forget the buffer under a clip name (a take replaced or taken back: a template bank must not
     * keep playing the take it replaced). Voices already playing it finish; later fires do not find it.
     */
    removeAudioBuffer(name: string): boolean;
    /**
     * The single ingress into `audioBuffers`: every buffer is loudness-normalized
     * once on arrival (normalizeOnArrival), whatever path it came by.
     */
    private registerBuffer;
    /**
     * Retrigger any voices that were waiting for this clip's buffer to arrive.
     * Called from loadAudioBuffer/loadAudioFile so that voices scheduled before
     * decode finished don't silently miss their cue.
     */
    private drainPendingVoices;
    getLoadedAudioNames(): string[];
    /**
     * Replace the scene.
     *
     * On a PLAYING engine this is a diff by default, and that is the mixer's
     * contract: moving one fader must not fade the rain out and start it again.
     *
     * `restart: true` is the other intent — "play me the scene again, from the
     * top". A chat edit means that and a diff cannot express it: an unchanged
     * statement keeps its live track untouched, and a oneshot that has already
     * rung has no track and no queued events, so the diff reads it as finished
     * and skips it forever. Ask for the cat fight and the breaking vase, edit the
     * curtain, and the fight never happens again. `restart` takes the same
     * `teardownAll` + `scheduleAll` path a parse error already used, which
     * re-starts the clock and so re-schedules every `start` from scene zero
     * (`scheduleAll` uses absolute scene time; the diff's `scheduleNew` uses
     * `now + start`, which is a different and deliberate meaning).
     *
     * It deliberately does NOT `stop()` first: `stop()` suspends the
     * AudioContext, and a chat edit resolves after an `await`, so there is no
     * user gesture left to resume it. Tearing down without suspending keeps the
     * context running. Nothing is re-bought either — `audioBuffers` survives and
     * `preGenerateAll` skips every take already decoded.
     */
    loadScript(script: string, opts?: {
        restart?: boolean;
        crossfade?: number;
    }): void;
    private preGenerateEligible;
    play(): Promise<void>;
    /**
     * Fire-and-forget resume for UI gesture handlers. Call synchronously inside
     * a real user gesture (click/keydown), BEFORE any await — resume() only
     * reliably succeeds during transient activation.
     */
    /**
     * Replay the current scene from `offsetS` seconds in.
     *
     * The timeline's click-to-replay. It is the same teardown-and-reschedule
     * `loadScript(..., { restart: true })` uses, with the clock started already
     * `offsetS` in (`scheduleAll(fromS)` above decides what that means per
     * voice), and it deliberately does not `stop()`: suspending the
     * AudioContext would need a fresh user gesture to undo.
     *
     * Honest about its limits -- this is REPLAY FROM A POINT, not a seek. Loops
     * created at the offset start at their own beginning rather than mid-phase,
     * interpolations start from their heads, and trajectory state starts fresh.
     * What it does get right is the thing a listener actually asks for: the
     * oneshots land where they belong relative to each other, and the ones that
     * already happened before that point stay unfired.
     *
     * A no-op when nothing is playing; `play()` is how a stopped scene starts.
     */
    restartAt(offsetS?: number): void;
    resumeContext(): void;
    /** Removes the gesture-unlock listeners, if installed. Null when not armed. */
    private _gestureUnlockCleanup;
    /**
     * Window-level one-shot unlock: resume the context on the next user
     * gesture, then remove the listeners once the context leaves 'suspended'.
     * Plain DOM APIs only — the engine must stay React-free.
     */
    private installGestureUnlock;
    stop(): void;
    setMasterVolume(vol: number): void;
    /**
     * Bring the master bus up from silence over `seconds`, then leave it at the
     * level the app asked for. A scene that starts at full level arrives as a
     * slap: forty voices, beds included, all landing on the same sample. The
     * ramp is exponential, which is linear in dB, so it reads to the ear as an
     * even rise rather than a rush at the end.
     *
     * Safe to schedule on a suspended context: `currentTime` is frozen while
     * suspended and resumes from there, so the ramp plays out from the moment
     * audio actually starts, not from the moment it was scheduled.
     */
    fadeInMaster(seconds?: number): void;
    /**
     * Take the master bus down to silence over `seconds` — the mirror of
     * {@link fadeInMaster}, and the half that was missing: `stop()` is a hard
     * kill (teardown, disconnect, suspend), so swapping one scene for another
     * cut the outgoing one off mid-sample.
     *
     * This only SCHEDULES the ramp; it never stops the engine. The caller waits
     * out `seconds` and then stops, so a fade and a teardown stay separable.
     * Same exponential shape and same -66 dB floor as the fade in, since an
     * exponential ramp can neither start from nor reach zero.
     */
    /**
     * Park the master bus at the inaudible floor, with no ramp.
     *
     * The gap between "the scene is loaded" and "the scene is making sound" is
     * not free: a heavy scene spends it building dozens of voice chains while
     * the page may also be decoding a captured world. Arming a fade-IN before
     * that work starts its clock at the moment the context resumes, so the
     * first sample that actually sounds arrives part-way up the curve and the
     * scene seems to snap on. Silence first, then ramp once it is running.
     */
    silenceMaster(): void;
    fadeOutMaster(seconds?: number): void;
    toggleMute(statementIndex: number): void;
    toggleSolo(statementIndex: number): void;
    /**
     * Replace the solo set wholesale (search-highlight: solo every matched
     * voice at once). An empty array clears all solos.
     */
    setSoloIndices(indices: number[]): void;
    /**
     * The loaded script's statements — live objects, not a copy. World
     * re-grounding places STATEMENTS (mutating their area pins every current
     * and future spawn), so it must see voices whose tracks don't exist yet
     * (start-delayed groups, still-generating audio). Read-only by contract.
     */
    get scriptStatements(): readonly Statement[];
    /** Runtime warnings so far (failed loads, generation failures), deduplicated by message. */
    get runtimeWarnings(): readonly string[];
    get mutedIndices(): ReadonlySet<number>;
    get soloedIndices(): ReadonlySet<number>;
    /**
     * Live per-statement volume (mixer slider). The slider is a MANUAL
     * OVERRIDE: it takes the property away from every automation — the voice's
     * own fade, the group's modulation envelope, and a `follow` binding — and
     * sets the gain right now (PARAM_SMOOTHING is a de-click, not a fade).
     * Leaving any of those live meant the tick loop kept fighting the hand on
     * the fader and the slider read as broken. Updates the statement so future
     * retriggers agree, and moves every live track of that statement.
     */
    /**
     * Hear a level change while it is being made: a dB trim layered on the voice's
     * written gain, leaving its script, its `follow` bindings and the level model
     * untouched. null clears it. The mixer commits the real edit on release.
     */
    /** The dB a level change being made adds to a voice right now (0 when none): labels follow the drag. */
    statementPreviewDb(statementIndex: number): number;
    /**
     * Hold sounds audible while they are edited (by `source_id`; null lets go). A game gates most
     * sounds on its own state, so the one being edited is usually silent right then: a held voice
     * reads its `volume follow` / `spl follow` at their loudest and passes its `active` hours and
     * `quiet` gates. Nothing is written, and the hold survives the reload every save makes.
     */
    holdAudible(sourceIds: readonly string[] | null): void;
    setStatementPreviewDb(statementIndex: number, db: number | null): void;
    /** Audition an absolute source SPL, without taking ownership of its written value or follow binding. */
    setStatementPreviewSpl(statementIndex: number, db: number | null): void;
    setStatementVolume(statementIndex: number, volume: number): void;
    /**
     * Preview an uncommitted edit while a control is being dragged: parse
     * `script` and push only what a running scene absorbs in place. For a
     * statement that is its live fields (transform, extent, mix, look,
     * acoustics, DSP values); for an entity, its body's `rotate` and `scale`.
     * Nothing restarts and nothing is recorded; the caller commits the same
     * script on release, which then reloads as a no-op. Returns false when the
     * edit is structural and can only be heard after that commit.
     */
    previewEdit(script: string, target: {
        statement: number;
    } | {
        entity: string;
    }): boolean;
    /** Check if a track is audible given current mute/solo state. */
    private isTrackAudible;
    /** Recalculate which tracks are audible based on mute/solo state. */
    private applyMixerState;
    /**
     * Schedule the whole scene from `fromS` (default 0, the top).
     *
     * At a non-zero offset each voice is one of three things. A voice authored to
     * begin LATER keeps its absolute time, so the rest of the scene still unfolds
     * on schedule. A voice that would already be sounding is created AT the
     * offset rather than at its own `start` -- clamping, not skipping, because
     * dropping it would leave a scene of silence with a few late events in it.
     * And a oneshot that fires once and already fired is skipped: it happened
     * before the point you jumped to, which is the same rule the incremental
     * diff applies to a finished oneshot.
     *
     * What this does NOT do is reconstruct mid-scene state: a loop created at the
     * offset starts at its own beginning rather than 30 s into its phase, and
     * interpolations start from their heads. This is "replay from here", not a
     * seek.
     */
    private scheduleAll;
    /** Monotonic generation for diff-scheduled voice keys — keys embed the
     * statement index, which an edit can reuse, so uniqueness needs a nonce. */
    private _spawnGeneration;
    /** Seconds of the version crossfade the current diff runs under; 0 outside `loadScript({ crossfade })`. */
    private _crossfadeS;
    /** Statements scheduled by a crossfading diff: their voices fade in on the incoming curve. */
    private _crossfadeIns;
    /** Buffers a caller holds ready (decoded versions): never evicted by a script that does not name them (E3). */
    private _retained;
    /** Keep these decoded buffers through later script loads (a place's versions), or release them with `false`. */
    retainBuffers(names: Iterable<string>, retain?: boolean): void;
    /**
     * Fade a voice out on the outgoing equal-power curve, from wherever its channel is now (a second
     * switch mid-fade continues from the current gain, never jumping), then retire it.
     */
    private crossfadeOut;
    /** A voice born of a crossfading diff starts on the incoming curve, at the point the fade has reached. */
    private crossfadeIn;
    /**
     * Apply an edited script to a RUNNING scene without restarting it.
     *
     * Identity is (kind, clip, genPrompt) with duplicate occurrences matched in
     * order; equality is the full statement fingerprint. Three outcomes:
     *
     *   - unchanged  → the OLD Statement object is spliced back into the array,
     *     so live tracks and queued scheduler closures stay valid by object
     *     identity (createVoice self-heals the index from the array). Audio is
     *     untouched — this is the whole point.
     *   - changed    → the old voice fades out quickly, its queued events are
     *     cancelled, and the new version schedules from NOW (its `start` becomes
     *     an offset from the edit, which is what "I changed the rain" means
     *     mid-listen).
     *   - added / removed → schedule from now / fade out and cancel.
     *
     * A finished oneshot whose statement is unchanged is deliberately NOT
     * rescheduled — replaying a bell that already rang because an unrelated
     * voice was edited would be a worse artefact than the restart this replaces.
     *
     * A changed `room`/`material` declaration does NOT restart: `roomsChanged`
     * re-points every voice's wet send in place (`applyLiveReverb`). This comment
     * claimed a full-restart bail-out until 2026-09-15; there has been no such
     * branch here for some time. A caller that wants the scene from the top asks
     * for it: `loadScript(script, { restart: true })`.
     */
    private applyScriptDiff;
    /**
     * The properties a live track can absorb WITHOUT restarting: mix, transform,
     * extent, look, acoustics, pitch and the repeat interval — everything either re-read per tick,
     * read at the next fire (`every`), or writable onto the existing nodes (a pitch slider is heard
     * as you drag it; it used to restart the voice on every frame). Everything else (the clip, the prompt, the kind,
     * motion, timing, counts, interpolation envelopes) is structural: that voice
     * restarts, alone. Keys are Statement toJSON field names.
     */
    private static readonly LIVE_APPLY_KEYS;
    /** The statement with its live fields blanked — what must be EQUAL for an in-place edit. */
    private structuralFingerprint;
    /**
     * Whether `next` differs from `prevSt` only in ways a running voice can
     * absorb. DSP topology is baked at voice creation (one chain per voice), so
     * an effect appearing/disappearing — or a filter/distortion MODE, which
     * lives in the node and its curve — stays structural. Members of explicit
     * physical bodies can absorb the same live parameters; EntityRuntime owns
     * structural component replacement without restarting the body.
     */
    private canLiveApply;
    /**
     * Absorb an edit into the RUNNING voice: copy the live fields onto the OLD
     * statement object (which stays the identity everywhere — live tracks and
     * queued scheduler closures hold it), splice it in at the new index, and
     * push the values that were sampled at creation into the live nodes. The
     * source keeps playing throughout.
     */
    private liveApplyEdit;
    /** Push creation-sampled values into a live track; per-tick reads need nothing. */
    private applyLiveParams;
    /**
     * Re-derive a live voice's reverb rung (voice reverb > named room > scene
     * room > world room) and re-point its send. The dry path is untouched — the
     * voice keeps sounding; only the wet leg re-routes.
     */
    private applyLiveReverb;
    /**
     * Write changed STATIC effect values onto the existing chain (topology and
     * mode verified equal by canLiveApply). Interpolated parameters are owned by
     * the tick (updateDSPInterpolations) and skipped here.
     */
    private applyLiveDsp;
    /** `logStops` false on a replay (`restartAt`): those voices never happened after the new now, so no end is written. */
    private teardownAll;
    private tick;
    /**
     * One headless step: run the scheduler's due events, then one spatial
     * tick of `dtSec` (hosting, entities, kinematics, follow bindings,
     * activity gates, Doppler, foliage — everything the RAF tick does for the
     * audio state; no UI notification). The caller advances the audio
     * context's clock by `dtSec` BEFORE calling this, so scheduled events and
     * elapsed-time modulation see the same time the tick does. Idle unless
     * playing. Not rate-limited: every call is a spatial tick.
     */
    advance(dtSec: number): void;
    private createVoice;
    /** Cache the sampled 'every' duration for a modulation. */
    private cacheInterpolation;
    private voiceSource;
    private updateSynthControls;
    private writeSynthControl;
    /**
     * `fire` distinguishes a trigger voice's two lifecycles: buffer arrival
     * (load + go quiet, pending → ready) vs an actual event fire (start audio).
     * `clipOverride` plays a different cached buffer through the same track —
     * used by template trigger voices whose gen prompt substitutes `{text}`.
     */
    private retriggerAudio;
    /** Clip path of the k-th pooled take (`variants`): the base clip for k = 0, `<base>#k+1` beyond. */
    private variantClipPath;
    /** Decoded buffer of the k-th pooled take, if it has landed. */
    /**
     * Hear ONE voice on demand, wherever it sits, whether or not the scene is
     * playing.
     *
     * Solo only works while the transport runs and still leaves you listening to
     * the whole mix's level window; the mixer's actual question is "what does
     * that one sound like". This plays the voice's own take through
     * `playOneShotTreated`, so it arrives from its authored position with the
     * scene's occlusion and room on it -- the sound as the scene has it, not a
     * bare file.
     *
     * Buffer resolution lives HERE rather than in the panel because a pooled
     * voice's take is `variantBuffer`'s business: a caller reaching into
     * `getAudioBuffers()` with a hand-built `path#k` would be a second copy of
     * the take-pool rule, and it would silently miss for every `variants` voice.
     *
     * Returns a stop handle, or null when the voice has no audio yet (a `gen`
     * take still in flight) -- the caller shows that rather than playing silence.
     */
    /** True only inside {@link fireNow}: its fire is logged as an `audition`, not a game fire. */
    private _auditionFire;
    /**
     * Fire a one-shot or event voice NOW through its own track: the same path a scheduled fire
     * takes (its level, pitch, effects, panner and place, and the next version from its take
     * pool), so an editor hears exactly what it is changing. Unlike `auditionStatement` (a
     * separate dry-ish one-shot at the voice's position), every setting of the voice applies.
     * Logged as `audition`, never `fire`. `'silent'` when there is nothing to fire: the scene is
     * stopped, the voice is a loop, has no live track (outside its zone, not placed yet), or has
     * no audio loaded.
     */
    fireNow(statementIndex: number): 'fired' | 'silent';
    auditionStatement(statementIndex: number, opts?: {
        maxDurationS?: number;
    }): {
        stop: (fadeS?: number) => void;
    } | null;
    /** Loaded contact takes, without firing actor events or resolving/purchasing audio. */
    getContactRecordings(eventName: string): {
        description: string;
        buffers: AudioBuffer[];
    }[];
    private variantBuffer;
    /**
     * Which pooled take plays this fire: a loop keeps the one it settled on;
     * a oneshot draws at random among the landed takes, excluding the last
     * one whenever there is a choice. -1 when nothing has landed yet.
     */
    private pickVariant;
    /**
     * A random LANDED take of a pool, never `avoid` when there is a choice
     * (the take that just played; the take the previous instance drew). -1
     * when nothing has landed.
     */
    private drawTake;
    /**
     * Replace a clip's buffer and gently restart any live looping voices on it:
     * fade the old source down, then retrigger (which fades the new one in).
     * Oneshot voices pick up the new buffer on their next retrigger naturally.
     */
    private swapBufferSmooth;
    /**
     * Pin a voice at an exact position (viewport drag). The spatial tick uses
     * the pin instead of the wander/trajectory until the script is reloaded.
     */
    /** Geometry-driven occlusion for a voice (0 clear → 1 behind a wall); see {@link Acoustics.setOcclusion}. */
    setTrackOcclusion(key: string, amount: number): void;
    /** Raise a voice's semantic occlusion floor (world grounding marks a source INTERIOR); see {@link Acoustics.raiseOcclusionFloor}. */
    setTrackOcclusionFloor(key: string, floor01: number): void;
    /** Redirect a voice to the doorway its sound bends through, or clear it; see {@link Acoustics.setDiffraction}. */
    setTrackDiffraction(key: string, apparent: Vec3 | null): void;
    /** The world-geometry floor under a voice (terrain conform); see {@link Acoustics.setFloor}. */
    setTrackFloor(key: string, minY: number | null): void;
    /** Headphone elevation lens; see {@link Acoustics.setMonitorElevationGain}. */
    setMonitorElevationGain(gain: number): void;
    get monitorElevationGain(): number;
    /** Switch the floor / ceiling reflection legs on or off; see {@link Acoustics.setGroundReflection}. */
    setGroundReflection(enabled: boolean): void;
    get groundReflection(): boolean;
    /**
     * Set the room the listener is standing in, measured from world geometry at
     * the player's position (see `probeEnclosure` in `lib/worldGrounding.ts`).
     * Safe to call at the walk loop's rate; see {@link WorldRoom.set}.
     */
    setWorldRoom(size01: number, damping01: number, wet01?: number): void;
    /**
     * The world room the listener is standing in right now — the room every
     * voice WITHOUT script reverb sends into — or null outside any room. Read by
     * the export panel so an offline render hears the room the listener stood
     * in (`RenderOptions.worldRoom`), and by the headless simulation to record
     * a procedural world's ambient room on the trace.
     */
    getWorldRoom(): MeasuredWorldRoom | null;
    /**
     * Leave the world room — voices fall back to the rooms their scripts asked
     * for. Called when a world is unloaded or walk mode ends.
     */
    clearWorldRoom(): void;
    private sendGainFor;
    private currentSendGain;
    /**
     * How separated a voice is from the listener's enclosure, 0–1.
     *
     * This is the transmission half of the obstruction/occlusion split.
     * `setTrackOcclusion` handles obstruction — something in the way of the
     * direct path, dry attenuated, room untouched. This handles a source in
     * ANOTHER space: its energy never enters the listener's room, so the
     * reverberant contribution has to go too. Driven by room membership (see the
     * room/portal graph), not by ray hits.
     */
    setTrackTransmission(key: string, blocked01: number): void;
    /**
     * Drop a voice's reverb send and its claim on the shared room bus. The bus
     * itself survives while other voices still send into it, and is torn down by
     * the pool when the last one leaves.
     */
    /**
     * Detach every audio node a track owns and hand its reverb bus back. The
     * one exit path for a voice: teardown, stop, and a one-shot's own end all
     * come through here, so no node is left wired to the master bus.
     */
    private disposeTrackNodes;
    private releaseTrackReverb;
    /**
     * Spawn a RUNTIME voice — a real track outside the script (the live world
     * audio layer's path). Unlike `playOneShotAt` (bare source→panner→master),
     * a runtime voice goes through `createVoice`, so EVERY acoustic system
     * applies for free: the point/wide extent split, world-room membership,
     * geometry occlusion raycasts (it lives in `tracks`, which the world layer
     * iterates), transmission, Doppler, air absorption, and a viewport orb.
     *
     * Its synthetic statement is never in `this.statements`, so incremental
     * script reloads leave it alone; a full teardown (stop, parse error, room
     * change) removes it like everything else, and the caller respawns it.
     * Returns null when the engine is not playing or the id is already live.
     */
    addRuntimeVoice(id: string, buffer: AudioBuffer, opts: {
        x: number;
        y: number;
        z: number;
        volume?: number;
        loop?: boolean;
        fadeInS?: number;
        /** Physical size of the emitter (SourceExtent sphere), meters. */
        radiusM?: number;
        distanceProfile?: DistanceProfile;
        /** Semantic muffle floor (interior source heard through a wall). */
        occlusionBase?: number;
        color?: string;
    }): {
        key: string;
        stop: (fadeS?: number) => void;
    } | null;
    /**
     * Give a voice a measured physical size at runtime — how world grounding
     * hands the collider's knowledge of the emitting object to the extent
     * model ("the water surface under this anchor is 8 m wide"). The author
     * wins: a voice whose script declared `radius`, `ring` or `bed` keeps it.
     */
    setTrackExtent(key: string, radiusM: number): void;
    /** Host-measured centreline in metres. Refresh after host updates, including after play/reload. */
    setHostLine(id: string, line: LineSource): void;
    /** Lazily build the shared wide bus and hang it off the master gain. */
    private ensureWideBus;
    /**
     * Per-spatial-tick source extent: aim the panner at the closest point on
     * the source's shape and rebalance the point/wide crossfade. Runs for
     * every voice — near-field widening applies even to zero-radius sources,
     * so nothing can hard-flip ear to ear at the head.
     *
     * The wide leg bypasses the post-panner muffle chain, so the occlusion /
     * zone LEVEL is composed into its gain here; the muffle's lowpass color
     * stays point-leg-only (the wide leg is diffuse — level is the cue that
     * matters, and zone mutes must silence both legs).
     */
    /**
     * Animated extent: evaluate `radius`/`ring` modulation into the track's
     * live size. Runs at the spatial rate, immediately before
     * `updateSourceExtent` consumes it — a source that swells from a point to
     * an enveloping field is one property, not a rebuilt voice.
     */
    private updateExtentSize;
    private updateSourceExtent;
    /**
     * Game/scene-supplied signal channels — an OPEN namespace the built-in
     * measured signals shadow. Owned by {@link SignalBus}; the engine supplies
     * the two world facts prediction needs (the hour's clock rate, a scene
     * control's range).
     */
    private readonly _signalBus;
    /** @internal The published signals, for tests and the devtools. */
    private get _signals();
    /**
     * Publish a scene-defined signal (`satie.set('danger', 0.7)` over a game
     * bridge, a sensor, an LFO — the engine routes numbers, it does not know
     * what danger is). Any `follow`/`when` binding naming it reads the latest
     * value each spatial tick; unset signals read NaN and bindings hold.
     */
    setSignal(name: string, value: number): void;
    /** Withdraw an external channel and its prediction history. Bindings hold until it is published again. */
    clearSignal(name: string): void;
    /** Where a published signal will be `horizonS` seconds from now (see {@link SignalBus.predicted}); NaN for measured or never-published channels. */
    predictedSignal(name: string, horizonS: number): number;
    /** The world's hour `horizonS` ahead at its `clockRate` (world minutes per real minute); NaN without a world. */
    private predictedHour;
    /**
     * How much the world's state needs this statement's sound, 0..1: the
     * larger of NOW and the state predicted `horizonS` ahead, each
     * `activity × followLevel` — activity being `active` hours × `quiet`
     * gates (`activityOf`), followLevel the `volume follow` mapping's output
     * at the signal (1 without a follow). A signal the engine cannot read or
     * predict (NaN — an entity member's body, an unpublished channel) counts
     * as 1: no guessing. Lazy generation (`lazyGeneration`) holds a gen
     * voice back while this is 0 and requests it the moment it rises.
     */
    demandOf(stmt: Statement, horizonS: number): number;
    private demandFor;
    /** The `volume follow` output at the signal's current (`horizonS` 0) or predicted value, clamped 0..1; 1 without a follow or without a readable signal. */
    private followLevel;
    /** A gen voice lazy generation may hold back: generated, prompted, and not a per-fire template trigger. */
    private isLazyCandidate;
    /** Whether any take of the statement's clip (the base, or a pooled `#k`) has landed. */
    private hasAnyTake;
    /** audioBuffers.size at the last pending-voice reconciliation (see updateTracks). */
    private _pendingSweepBufferCount;
    /** Real seconds accumulated toward the next demand tick (`DEMAND_TICK_S`). */
    private _demandAccumS;
    /**
     * The demand tick (once per `DEMAND_TICK_S`, from the spatial tick — no
     * timer of its own, no allocation): every dormant voice whose demand
     * within `DEMAND_HORIZON_S` has risen above 0 is woken — a `predict`
     * event is logged with the demand, and its clip is requested exactly as
     * load would have (pool takes included), library stand-in first when
     * `standInFirst(true)`; when the buffer lands the usual arrival path
     * starts a loop / arms a oneshot or trigger. Demand falling back to 0
     * never puts a voice back to sleep: a landed clip stays, and the follow /
     * gates silence it as they always did.
     */
    private wakeDormant;
    /**
     * Sample a measured signal for a voice (Signals.ts). NaN = unavailable this
     * tick (no distance sample yet, listener on top of the voice) — the binding
     * simply holds its last value rather than jumping.
     */
    private signalValue;
    /** The realized world of the loaded script (null = no `world` block). */
    private _world;
    /** Serialized spec of `_world`, so an unchanged block keeps the same object identity. */
    private _worldKey;
    private _worldById;
    /** Seeded picker for class hosts (`at oak`) — same seed, same chorus. */
    private _worldRng;
    /** The realized world, if the script declared one. */
    get world(): RealizedWorld | null;
    /**
     * Whether voices are hosted on the procedural geometry. Off while a
     * CAPTURED world (Marble) is grounding the scene instead: the state bus
     * (hour / weather signals, `active` / `quiet`) keeps running, but hosts,
     * the terrain floor, foliage and the ambient room step aside so the
     * reground pins and the measured room own the voices.
     */
    private _hostingEnabled;
    /** Any live voice attaches or follows — gates the per-tick pass. */
    private _hasAttachments;
    /** Aperture centres of the world's interior (empty = no interior): the routing pass's candidates. */
    private _interiorApertureCentres;
    /** Whether the listener stood inside the interior's shell at the last spatial tick. */
    private _listenerInsideInterior;
    /** True when the listener is within the interior's footprint (small margin, floor at y = 0). */
    private listenerInsideInterior;
    /**
     * Interior routing (scene: the listener inside a shell, the source beyond
     * it): the voice is heard FROM the aperture with the shortest bent path,
     * at that path's full length — the same apparent-point convention as
     * spatial/Diffraction.ts. Writes `track.apparent` in place and clears only
     * what it set (`_interiorRouted`), so a Marble diffraction redirect from
     * `setTrackDiffraction` is never clobbered. Allocation-free after the
     * first route of a track.
     */
    private routeThroughInterior;
    /**
     * Pin every attached / following voice to its target, one level deep.
     * `attach`: the voice's `place` is a PARENT-RELATIVE offset, rotated by the
     * parent's yaw and scaled with it — adoption. `follow`: the stated offset
     * in the target's yaw frame, scale NOT adopted — pursuit. Targets resolve
     * to the listener, a live entity instance (by id), or another voice (by
     * clip token, exact or the segment after the last '/'); an attached voice
     * never serves as a parent (the one-level rule). A missing target leaves
     * the voice where it is. Allocation-free after the first pin.
     */
    private resolveAttachments;
    /**
     * The voice a ref names: the WRITTEN clip token (a gen block's name — the
     * address that survives clip resolution), the resolved clip, or the
     * segment after its last '/'. Skips the seeker itself and any track that
     * is itself attached or following (one level deep).
     */
    private findTrackByRef;
    /** The loaded procedural world's fields (WorldFields.ts), rebuilt in setWorld. */
    private _worldFields;
    /** A provider the host registered (a captured world's survey + collider) — wins over the procedural one. */
    private _externalFields;
    /** Scratch sample for every field read (no allocation on the tick or the event path). */
    private _fieldScratch;
    /**
     * Register how the world answers "what is here" (WorldFields.ts) when the
     * engine cannot measure it from geometry of its own — a captured (Marble)
     * world's survey grid + collider. Null unregisters; a procedural world's
     * own fields take over again. The engine reads the provider every spatial
     * tick at the listener (the `depth` / `liquid` / `submerged` signals and
     * the medium), on a staggered tick at every voice (its side of the
     * air/water interface) and at each `fireEvent` point (the payload's
     * fields and, when the caller gave no `text`, the surface).
     */
    setFieldProvider(provider: FieldProvider | null): void;
    /** The active field provider: the registered one, else the procedural world's while hosting is on. */
    private fieldProvider;
    /** The embedder's objects `at <id>` voices sit on, and their classes (see HostRegistry.ts). */
    private readonly _hosts;
    /** Whether an `at <ref>` voice has anything to sit on right now. */
    private hostAvailable;
    /**
     * The seamless copy of a looped buffer. The cache lives in the SeamlessLoop
     * module, not here, so the offline renderer loops the identical treated
     * buffer and an export sounds like what was heard.
     */
    private seamlessLoopOf;
    /** How many OTHER loop voices are playing this very buffer right now. */
    private liveLoopsOn;
    /** Ids of the registered external hosts of a class (`cypress` → cypress_1 …), empty when there is no such class. */
    externalHostsOf(cls: string): readonly string[];
    /**
     * Place or move an external host. Every `at <id>` voice re-pins to it
     * (entity members excepted — their body owns them). Call it whenever the
     * embedder's object moves; per frame is fine, the panner still updates at
     * the spatial rate. Scene frame: +Z ahead, +Y up, metres.
     */
    setHostPosition(id: string, x: number, y: number, z: number): void;
    /** Forget a host: reassign class slots or world features; unresolved voices become silent. */
    clearHost(id: string): void;
    /**
     * Fix the level window at `dbSpl` (a received level that plays at TOP_LUFS;
     * 75 is a sensible game default: a fountain at arm's length is full scale,
     * a 45 dB wind bed sits 30 dB under it) or pass null to return to the
     * adaptive window. Takes effect on the next spatial tick.
     */
    setLevelAnchorDb(dbSpl: number | 'auto' | null): void;
    get levelAnchorDb(): number | null;
    get levelAnchorAuto(): boolean;
    /**
     * The world's ground material under a point (what an NPC's `on step … {text}`
     * gets), or null with no world: the text a game should fire the player's own
     * steps with, so the surfaces match the block instead of a guess in the glue.
     */
    groundMaterialAt(x: number, z: number): string | null;
    /** Ids of the external hosts currently registered. */
    get externalHosts(): readonly string[];
    /** Where an external host is now (`setHostPosition`), or the first member of a host class; undefined when unknown. */
    hostPositionOf(id: string): Readonly<Vec3> | undefined;
    setWorldHosting(enabled: boolean): void;
    get worldHosting(): boolean;
    /** Spatial ticks since load — staggers per-voice world work. */
    private _spatialTicks;
    /** Seconds since the world's `hour` signal was last published (clock). */
    private _clockAccumS;
    /** Spatial ticks since the `canopy` signal was last measured. */
    private _canopyTicks;
    /**
     * Realize (or drop) the script's `world` block. Idempotent on the
     * GEOMETRY: the identity key leaves weather, time and the scene controls
     * out (state, not geometry — and the control SET is geometry-neutral too),
     * so a knob that changes the hour, the rain or `traffic` updates the live
     * world's state and republishes the signals without rebuilding meshes or
     * re-hosting voices.
     */
    private applyWorldSpec;
    /**
     * The world's own clock and the listener-relative signals, once per
     * spatial tick: `hour` advances at `clockRate` world-minutes per real
     * minute (published at 2 Hz — half-hour ramps make finer steps inaudible),
     * `canopy` is the crown cover over the listener (~5 Hz).
     */
    private advanceWorld;
    /**
     * `pace follow <signal> …` — the interval multiplier read at schedule time.
     * An unavailable signal leaves the interval as written.
     */
    private paceFactor;
    /** A point on the horizon: random bearing, 1.5–3 km out, 100–400 m up (see `HORIZON_*`). */
    private drawHorizonPointInto;
    /** Air absorption + Doppler for one voice (see {@link Acoustics.updateDistance}); the extent suite drives it directly. */
    private updateDistanceAcoustics;
    /** Foliage on the listener→voice path (see {@link Acoustics.updateFoliage}); the world-state suite drives it directly. */
    private updateFoliage;
    get submerged(): number;
    /** Where the master gain feeds: the medium stage once it exists, else the limiter. */
    private masterOut;
    /** How far under a fluid surface the listener's head is (0 air → 1); see {@link Acoustics.setSubmerged}. */
    setSubmerged(submerged01: number): void;
    /**
     * The outdoor "room" a procedural world implies — a forest of trunks is a
     * diffuse scatterer with a short, dense tail; open ground has none. Sized
     * from stem density so the tail thickens with the wood. Declared `room`s
     * still win (author-wins ladder), and an enclosure the listener walks into
     * (a hut) is measured by the viewport and applied over this.
     */
    applyWorldAmbientRoom(): void;
    /**
     * Install a realized world directly (the script path goes through
     * `applyWorldSpec`). Publishes the world's state as signals — `wind`,
     * `rain`, `fog`, `hour`, `temp` — so `follow`, `active` and `quiet` can
     * read them, and re-hosts every `at` voice onto the new geometry.
     */
    setWorld(world: RealizedWorld | null): void;
    /**
     * Change the world's weather / time at runtime (a UI knob, a game clock)
     * without rebuilding geometry. Values are clamped; the signals update
     * immediately and `active` / `quiet` voices fade over the next second.
     */
    setWorldState(state: {
        rain?: number;
        wind?: number;
        fog?: number;
        hour?: number;
        temperatureC?: number;
        clockRate?: number;
        /** Scene control id → value, clamped to that control's `[min, max]`; unknown ids are ignored. */
        controls?: Record<string, number>;
    }): void;
    /**
     * The world's state onto the signal bus: the physical state every place
     * has (`wind`, `rain`, `fog`, `hour`, `temp`) and the scene's own controls,
     * each under its id — the engine routes the numbers and never knows what
     * `traffic` or `sea_state` means.
     */
    private publishWorldState;
    /**
     * Resolve `at <ref>` for a voice and pin it there. Fixed ids pin to the
     * object's emit point; classes pick (oneshot: random per call; loop: the
     * nearest to the listener); `ground` picks a random dry ground point 4–18 m
     * out; `water` / `canopy` are live and only seeded here.
     */
    private rehostTrack;
    /**
     * Where a sound attaches on a world object: the drawn geometry when the graphics reported it
     * (`setHostGeometry`), else the procedural shape. The graphics dictate the sound (2026-10-09).
     */
    private attachPointFor;
    /** An external host's attach point: its drawn box when reported, else the registered point. */
    private externalAttach;
    /**
     * What the graphics drew for a host, as a world-space box in metres: the drawn crown is where a
     * bird perches, the drawn centre is where a body sounds. Every voice and body on that host moves to
     * the drawn geometry at once; ground anchors reach as far as the drawing (`drawnHalfExtentM`).
     * The drawing's extent also widens the ground draw for `at ground` voices.
     */
    setHostGeometry(id: string, bounds: {
        center: readonly [number, number, number];
        size: readonly [number, number, number];
    }): void;
    /** The drawn boxes the graphics reported so far, by host id. */
    hostGeometry(id: string): HostGeometry | undefined;
    /** A random dry ground point from the listener, 4 m to as far as the place reaches (18 m, or the drawing's extent), written into `out` (false when every draw hit water). */
    private drawGroundPointInto;
    /** `at water`: nearest point of the water body; `at canopy`: nearest crown over the listener. */
    private followDynamicHost;
    /**
     * `at <strip> pass`: set a voice off along its strip for this take. A
     * random direction; a start chosen so the run crosses the point of the
     * strip nearest the listener at mid-clip (clamped to the strip's ends);
     * speed from the strip's `flow` (0 → walking pace, 1 → fast traffic). A
     * loop travels continuously, turning back at the ends. Everything the
     * spatial tick needs is fixed here so `followPassHost` only evaluates a
     * line — no allocation, no search.
     */
    private beginPass;
    /** Per spatial tick: where along its strip a passing voice is now (writes the pin, no allocation). */
    private followPassHost;
    /**
     * `active` hours × `quiet` gates → 0..1. Half-hour ramps at window edges;
     * every `quiet` gate reads its signal off the bus (`rain` and `wind` are
     * published there by the world like any scene control, so the gate never
     * knows which is which) with a 0.15 ramp below the threshold in the
     * signal's units; an unpublished signal holds open. Shared by voices
     * (`updateActivity`) and entity spawners (`entityActivity`).
     */
    private activityOf;
    /**
     * The activity multiplied into a voice's count-scaling gain, smoothed
     * over ~1 s so nothing pops.
     */
    private updateActivity;
    /** The loaded script's entity definitions. */
    get entities(): readonly EntityDef[];
    /** Send one population individual to the free anchor nearest a point (see {@link EntityRuntime.steer}). */
    steerInstance(entityId: string, instanceN: number, x: number, y: number, z: number): boolean;
    /** Every live instance of every entity (the NPC layer and the tests read it). */
    /** Force a goal on every individual of an entity (call, rest, roam, flee), or clear it with null. */
    setEntityGoal(entityId: string, goal: AgentGoal | null): void;
    entityGoal(entityId: string): AgentGoal | null;
    /** Accepted holds take effect at the next safe action boundary; an active relocation finishes first. */
    setEntityAction(entityId: string, instanceN: number, action: string | null): boolean;
    entityInstances(): EntityInstance<TrackState>[];
    /** A refused call tries again in CALL_RETRY_S — generation-guarded like the retrigger chain, so it never doubles. */
    private scheduleCallRetry;
    /** Current exclusive scene state (null = no state → every zone matches). */
    private _sceneState;
    /** Isolation of the current state's enclosure 0..1 — how much of a wall
     * sits between this state and elsewhere (wood ≈ 0.7, stone ≈ 0.95). */
    private _sceneIsolation;
    /** Current scene state, for HUDs and callers that need to reconcile. */
    get sceneState(): string | null;
    /**
     * Declare the listener's current scene state — an OPEN name the scene/game
     * defines ('cabin', 'cave', 'underdeck'). Voices scoped with `zone`:
     * matching voices play clear; non-matching strict voices crossfade to
     * silence; non-matching soft voices are occluded by `isolation` — the
     * acoustic weight of whatever separates the states (a wooden wall muffles
     * the rain, it does not delete it). Zone-less voices are untouched.
     */
    setSceneState(name: string | null, opts?: {
        isolation?: number;
        fadeS?: number;
    }): void;
    /** Recompute a voice's zone gating against the current scene state. */
    private applyZoneState;
    /** Drive `follow`-bound properties from their signals (spatial rate). */
    private applyFollowBindings;
    /** Family key: a count-multiplied trigger statement expands into variants —
     * distinct takes of ONE conceptual voice. Fire picks one, not all. */
    private static triggerFamilyKey;
    /** A member trigger's family is per instance: each body has its own cooldown. */
    private static memberFamilyKey;
    /** Last fire time (ctx seconds) per trigger family — cooldown state. */
    private _triggerLastFired;
    private _triggerLastTake;
    /** Forget a despawned body's contact cooldowns. Already sounding releases finish naturally. */
    releaseEmitter(id: string): void;
    /** Scratch for landed take paths during a fire (no per-fire allocation). */
    private _takeScratch;
    /** True when the loaded script declares an `on <name>` voice — lets the UI
     * keep its own fallback (e.g. built-in footsteps) out of the way. Scene
     * scope excludes entity members, whose contacts belong to their own body. */
    hasTrigger(name: string, scope?: 'all' | 'scene'): boolean;
    /**
     * Fire a runtime event into the script's trigger voices. Event names are an
     * OPEN vocabulary — this routes strings, it does not know what a footstep
     * is. The payload carries where it happened and, optionally, open-vocab
     * text (`{text}` substitutes into template gen prompts, keyed per text so
     * every surface/description gets its own cached takes).
     *
     * `scope: 'scene'` routes only non-entity voices (player/self contacts).
     * The default remains broadcast for world/social events.
     * Returns whether the event was audibly handled: true when at least one
     * trigger voice played (or is in its cooldown from a recent play — silence
     * that is intentional). False means nothing sounded and nothing recent did
     * — the engine is stopped, no voice matched, the template has no text yet,
     * or the take is still generating — so a caller with its own fallback
     * (e.g. built-in footsteps) knows to use it instead of going mute.
     */
    fireEvent(name: string, payload?: EventPayload, scope?: 'all' | 'scene'): boolean;
    /**
     * Route one event to the `on <event>` voices among `candidates`: drop the
     * zone-muted, apply each voice's `when` band (read at the EVENT's point
     * when the payload carries the field, else the voice's own) and its
     * `within` radius, group per family, let a `when`-gated voice REPLACE its
     * ungated siblings, and fire. Returns whether anything sounded.
     *
     * Two callers scan different candidate sets for the same rules: a
     * broadcast (`fireEvent`) scans every live track, a footfall scans only
     * the walking body's own members — a step is heard from the body that
     * took it, and must not answer for every other body in the scene.
     */
    private dispatchTriggers;
    private fireTriggerFamily;
    /** Generate + cache a template trigger take (see {@link GenResolver.generateTriggerTake}); the requesting fire stays silent. */
    private generateTriggerTake;
    /**
     * Signal sample for `when` conditions. Unlike signalValue, distance/closing
     * are measured fresh from positions — _lastDistM only updates while a
     * source plays, and a parked trigger voice has none.
     */
    private whenSignalValue;
    setTrackPosition(key: string, x: number, y: number, z: number): void;
    private resolveAndRetrigger;
    private stopTrack;
    private updateTracks;
    /**
     * True while the loaded script states an `spl` anywhere. Then `volume` is a
     * dB trim on each voice's emission, propagation is the engine's, and the
     * window governs every gain; otherwise the level model is inert.
     */
    get calibrated(): boolean;
    /** Per-voice level report for the UI and the timeline (allocates — UI rate). See {@link LevelGovernor.levelReport}. */
    levelReport(): LevelReport;
    /**
     * Drive an interpolating `reverb wet` on both sides of the split: the send
     * into the room bus and the dry attenuation ahead of the panner. The send
     * keeps its critical-distance scaling, so automating wetness changes how
     * much room you hear without disturbing where the crossover sits.
     */
    private updateReverbSend;
    /** Caches describe writes to a particular node graph, not the logical voice. */
    private resetDSPWriteCache;
    private updateDSPInterpolations;
    /** Evaluate modulation (fade/jump) using cached 'every' duration. */
    private evalInterpCached;
    /** Static evaluation for fade/jump modulation. */
    static evalModulation(mod: InterpolationData, elapsed: number, every: number): number;
    private static evalFade;
    private static evalJump;
    /** Public evaluation — uses uncached path. */
    evaluateInterpolation(mod: InterpolationData, elapsed: number): number;
    /**
     * One instance's `scatter` offset, or null. Hosted and entity-member
     * voices never scatter: a body already decides where they are, and two
     * placement systems arguing produces birds inside tree trunks. A `bed` has
     * no position to offset either.
     */
    private drawScatter;
    /**
     * Draw a one-shot a fresh point from its distribution. A voice with no
     * placement path never recomputes its position, so the delta is applied
     * directly for that case; everything else picks it up on the next tick.
     */
    private redrawScatter;
    /**
     * Add this instance's scatter offset to the position the placement/wander
     * maths just wrote. Called at the end of both position paths rather than
     * folded into the box, so a scattered voice still WANDERS around its own
     * point instead of the flock collapsing onto one path.
     */
    private applyScatter;
    private calculateWanderPositionInPlace;
    private calculateTrajectoryPositionInPlace;
    private sampleInitialColor;
    destroy(): void;
}
/**
 * Copy the first `maxDurationS` seconds of a buffer into a new AudioBuffer.
 * Returns the original buffer untouched when it is already short enough.
 * Used to cap decoded memory for user-dropped stems (a 5-minute stereo stem
 * decodes to ~100MB of Float32 PCM).
 */
export declare function trimAudioBuffer(buffer: AudioBuffer, maxDurationS: number, ctx: BaseAudioContext): AudioBuffer;
//# sourceMappingURL=SatieEngine.d.ts.map