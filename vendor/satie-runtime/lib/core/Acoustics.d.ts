import type { SceneSoundscape } from './Scene.js';
import type { Statement, Vec3 } from './Statement.js';
import type { TrackState } from './SatieEngine.js';
import type { RealizedWorld } from '../world/worldRealize.js';
import type { FieldProvider } from '../world/WorldFields.js';
import type { ReverbSuggestion } from '../spatial/WorldAcoustics.js';
/** Crossfade constant for a placed room's boundary flip — walking through a
 * doorway takes a couple of strides, and so does the wall's muffle changing
 * sides (0.3 s read as an abrupt dunk at a store's 0.85 wall). */
export declare const ROOM_OCC_SMOOTH_S = 0.7;
/** Hysteresis on leaving a placed room, metres — a head bobbing on the
 * threshold must not flap the whole acoustic state. */
export declare const PLACED_ROOM_EXIT_MARGIN_M = 0.25;
/** Foliage on the path never muffles harder than this (0..1 occlusion units). */
export declare const FOLIAGE_MAX_OCCLUSION = 0.35;
/** How long `in_<room>` / `indoors` take to go from 0 to 1 (and back) as you cross the room's edge. */
export declare const ROOM_PRESENCE_EASE_S = 0.6;
/** Metres of crown along the path that reach FOLIAGE_MAX_OCCLUSION. */
export declare const FOLIAGE_FULL_M = 40;
/** A strict zone boundary at full isolation: how much of a voice outside it gets through (dB). */
export declare const ZONE_ISOLATION_MAX_DB = 30;
/** Level cut for a voice across a scene-state boundary (wall law: deeper than a passing obstacle). */
export declare function zoneIsolationGain(isolation: number): number;
/**
 * A `room` block that stands somewhere (`place` + `size` box). Half-extents
 * precomputed; `boundary` is the wall's worth of muffle, DERIVED from what the
 * room's own voices carried while you were outside (max authored `occlusion`
 * among `in <room>` statements) — never an engine constant.
 */
export interface PlacedRoom {
    name: string;
    cx: number;
    cy: number;
    cz: number;
    hx: number;
    hy: number;
    hz: number;
    boundary: number;
}
/** A scene's declared room as the parser hands it over (only placed, sized ones stand). */
export interface DeclaredRoomBox {
    name: string;
    sizeM: {
        x: number;
        y: number;
        z: number;
    } | null;
    placeM: {
        x: number;
        y: number;
        z: number;
    } | null;
}
/** The medium stage's nodes (spatial/WorldAcoustics "Medium"), built on first submersion. */
export interface MediumStage {
    lowpass: BiquadFilterNode;
    delay: DelayNode;
    lfo: OscillatorNode;
    lfoDepth: GainNode;
    level: GainNode;
    stereo: GainNode;
    mono: GainNode;
    splitter: ChannelSplitterNode;
    sum: GainNode;
    merger: ChannelMergerNode;
}
export interface AcousticsHost {
    now(): number;
    listenerPos(): Vec3;
    tracks(): Iterable<TrackState>;
    world(): RealizedWorld | null;
    hostingEnabled(): boolean;
    listenerInsideInterior(): boolean;
    fieldProvider(): FieldProvider | null;
    namedRoom(name: string): ReverbSuggestion | null;
    setListenerRoom(room: ReverbSuggestion | null): void;
    applyLiveReverb(track: TrackState, stmt: Statement, ctxTime: number): void;
    setSignal(name: string, value: number): void;
    masterGain: GainNode;
    limiter: AudioNode;
    masterConnected(): boolean;
}
export declare class Acoustics {
    private readonly ctx;
    private readonly host;
    private readonly extentScratch;
    private placedRoomList;
    /** The placed room the listener currently stands in, lowercased — null outside all. */
    private listenerRoom;
    /** Monitoring elevation gain: 1 = the scene's own angles. Never reaches exports. */
    private elevationGain;
    /**
     * Floor / ceiling reflection legs. OFF by default since 2026-09-07: Mateo
     * heard the leg as a phaser on water in every scene ("the water still has
     * the phaser sound"). On, a point voice's reflection now arrives from its
     * own image-point panner (see ElevationCues), which is the honest cue; the
     * devtools overlay and `setGroundReflection` switch it for an A/B.
     */
    private reflectionLegs;
    private readonly warpScratch;
    private readonly reflScratch;
    private readonly imageScratch;
    private readonly fieldScratch;
    /** How far the listener's head is under a fluid surface, 0 (air) → 1. */
    private submergedNow;
    /** HF scale on the air-absorption distance (water absorbs ~100× less per metre). */
    private airScale;
    private medium;
    constructor(ctx: AudioContext, host: AcousticsHost);
    get placedRooms(): readonly PlacedRoom[];
    get listenerRoomName(): string | null;
    /**
     * Where the listener is, as signals a sound can follow: `in_<room>` for each placed room and
     * `indoors` for any, 0 outside and 1 inside, eased over ROOM_PRESENCE_EASE_S so walking in fades
     * rather than jumps. "The cicadas softer when I am inside" is then
     * `volume follow in_tatami_room 0to1 1to0.35`: a condition the script can state, with no game code.
     */
    private roomPresence;
    private publishRoomPresence;
    private soundscapeList;
    private soundscapeShare;
    private enclosedSoundscapes;
    private here;
    /** The script's soundscapes (the `kind world` block is the world layer and publishes nothing). */
    buildSoundscapes(list: readonly SceneSoundscape[]): void;
    /** The soundscape a voice belongs to: by object, by source id, by `in <room>`. Null when none. */
    soundscapeOf(stmt: Statement): string | null;
    /** True when the script declares soundscapes (the engine ticks them even with no placed room). */
    get hasSoundscapes(): boolean;
    /** Publish `in_<soundscape>` and update "here". Runs with the room presence, or alone when no room is placed. */
    publishSoundscapeShares(): void;
    /** Each soundscape's current share, 0..1. */
    get soundscapeShares(): ReadonlyMap<string, number>;
    /** The soundscape the listener is in (`soundscapeHere`: rooms by their walls, the open ones with a hold). */
    get soundscapeHere(): string | null;
    /** Derive the placed-room boxes + their boundary muffle from the scene. */
    buildPlacedRooms(rooms: DeclaredRoomBox[], statements: Statement[]): void;
    /**
     * Which placed room holds the listener — with a little hysteresis (leaving
     * takes an extra step) so a head bobbing on the threshold does not flap the
     * whole acoustic state. On a CHANGE, re-point the ambient reverb of every
     * voice that rides the scene room (own `reverb` and `in <room>` voices keep
     * theirs — the ladder above them is untouched).
     */
    updateListenerRoom(ctxTime: number, dtSec?: number): void;
    /**
     * Per-track, per-spatial-tick: smooth the occlusion floor toward which side
     * of the boundary the listener stands on, and re-assert the muffle when it
     * moved. `k` is the shared per-tick smoothing fraction (~0.3 s constant).
     * A geometry raycast pass may still raise `track.occlusion` above the floor
     * on its next visit — the floor only says what the WALL is worth.
     */
    tickPlacedRoomFloor(track: TrackState, k: number, ctxTime: number): void;
    /**
     * Set geometry-driven occlusion for a voice (0 = clear, 1 = behind a wall).
     * Called by the UI layer after raycasting listener→voice against a world
     * collider mesh. Lazily inserts a lowpass between panner and master the
     * first time a voice is actually occluded; smoothed to avoid zipper noise.
     */
    setOcclusion(track: TrackState, amount: number): void;
    /**
     * Raise a voice's semantic occlusion floor at runtime — how world grounding
     * marks a source as INTERIOR (a fireplace inside the house, heard from the
     * lane). Writes the statement's own `occlusionBase`, so it survives
     * incremental reloads (statement identity is preserved) and the per-frame
     * raycast can never undercut it (see setOcclusion).
     */
    raiseOcclusionFloor(track: TrackState, floor01: number): void;
    /**
     * Redirect a voice to where its sound actually arrives from — the doorway
     * it bends through — or clear the redirect (null). Called by the world layer
     * at the occlusion-raycast rate from the room/portal graph
     * (spatial/Diffraction.ts); the muffle for the bend comes through
     * `setOcclusion` as usual, this only moves the panner.
     *
     * The next spatial tick writes `apparent` instead of `position` to the
     * panner, so the change smooths at the tick's own 20 ms constant and moving
     * voices keep their motion (the apparent point is recomputed from the true
     * one). The stored point is reused in place — no per-call allocation.
     */
    setDiffraction(track: TrackState, apparent: Vec3 | null): void;
    /**
     * Set the world-geometry floor under a voice (terrain conform). Static
     * voices are lifted immediately; moving voices are clamped every spatial
     * tick. Pass null to clear when the world goes away.
     */
    setFloor(track: TrackState, minY: number | null): void;
    /**
     * The one place a voice's panner position is written from a scene point.
     * Records the TRUE point (`_heard`, what the reflections mirror and what
     * the scene reports) and writes the MONITORED one — the same point unless
     * the elevation lens is on (`setMonitorElevationGain`).
     */
    writePannerPosition(track: TrackState, p: Vec3, ctxTime: number, immediate?: boolean): void;
    /** Insert the lowpass + gain pair between the panner and the master the first time a voice is muffled. */
    ensureMuffleChain(track: TrackState): void;
    /**
     * Drive the muffle chain from the current occlusion + listener distance.
     * Zone gating rides the same chain: geometry occlusion and the scene
     * state's isolation compose via max, and a strict-zone mute takes the
     * level to zero (crossfade length = the caller's smoothing).
     */
    applyMuffle(track: TrackState, ctxTime: number, smoothing: number, immediate?: boolean): void;
    /**
     * Per-spatial-tick distance acoustics: air absorption (highs fall off with
     * distance) and Doppler (radial motion bends pitch). Physically lawful and
     * deliberately subtle — clamped to about a semitone, transparent inside
     * AIR_ABSORPTION_REF_M.
     */
    updateDistance(track: TrackState, ctxTime: number, dtSec: number): void;
    /**
     * Foliage attenuation: the length of the listener→voice path that runs
     * through tree crowns (chords through crown spheres, height-checked)
     * becomes a soft occlusion — ISO 9613-2 gives foliage ~0.1 dB/m in the top
     * octave, so FOLIAGE_FULL_M of canopy reaches FOLIAGE_MAX_OCCLUSION and
     * never the wall law.
     */
    updateFoliage(track: TrackState, ctxTime: number): void;
    /**
     * Measure how far the voice's source sits under a liquid surface (the
     * world's `submerged` field at its position) and recompose the muffle
     * chain when that — or the listener's own submersion since this voice
     * last composed it — has moved: `applyMuffle` folds the interface loss in.
     */
    updateImmersion(track: TrackState, ctxTime: number): void;
    /**
     * A headphone LENS: multiply every rendered elevation angle by `gain`
     * (2 reads a +20° bird as +40°), keeping distance and azimuth. The scene,
     * the trace and every export keep their true positions — only the panner
     * writes change. Re-aims every playing voice at once.
     */
    setMonitorElevationGain(gain: number): void;
    get monitorElevationGain(): number;
    /** Switch the floor / ceiling reflection legs on or off (legs go silent, the direct trim returns to 1). */
    setGroundReflection(enabled: boolean): void;
    get groundReflection(): boolean;
    private writeDirectTrim;
    /**
     * Per spatial tick: the floor reflection under the heard point (the world's
     * terrain floor and ground material where there is one, the scene plane
     * otherwise) and, with the listener and the source inside the world's
     * interior, the ceiling reflection too. A voice heard through an aperture
     * (`apparent` set) has no clean image path — its legs stay silent.
     */
    updateElevationCues(track: TrackState, stmt: Statement, ctxTime: number, immediate?: boolean): void;
    /** Move a reflection's image-point panner (smoothed like the direct panner). */
    private aimImagePanner;
    disposeElevationLegs(track: TrackState): void;
    get submerged(): number;
    /** HF scale on the air-absorption distance for the listener's current medium. */
    get airAbsorptionScale(): number;
    /** The medium stage once built (tests read it); null in open air until first submersion. */
    get mediumStage(): MediumStage | null;
    /** Where the master gain feeds: the medium stage once it exists, else the limiter. */
    masterOut(): AudioNode;
    /**
     * The medium stage on the master chain (spatial/WorldAcoustics "Medium"):
     * built on first use, between the master gain and the limiter — a lowpass
     * (open air → 500 Hz), the level cut, the slow delay warble that actually
     * reads as "under", and a stereo → mono collapse (interaural cues stop
     * working under water). Step into a river and every sound changes at once,
     * because the medium is the LISTENER's, not any voice's.
     */
    private ensureMedium;
    /**
     * Set how far under a fluid surface the listener's head is (0 air → 1
     * fully under). Published as the open signal `submerged` so a script can
     * `volume follow submerged …` (an underwater bed, a muffled shore).
     */
    setSubmerged(submerged01: number): void;
}
//# sourceMappingURL=Acoustics.d.ts.map