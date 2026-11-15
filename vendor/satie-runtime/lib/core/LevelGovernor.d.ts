/**
 * The level model's governor: the HDR window every calibrated voice's gain
 * is judged against. A scene is CALIBRATED when any statement states an
 * `spl`; then a voice's gain is `sourceGain(emission, top) × windowCull(received, top)`
 * and the window top chases the loudest received loop (or a fixed / auto
 * anchor). Uncalibrated, the window is inert and `volume` is the gain.
 *
 * Collaborators (`LevelGovernorHost`): the engine's tracks, clock, listener
 * position, RNG, its measured-signal reader, and the mixer's audibility and
 * reverb-send laws. The governor writes only level state on tracks
 * (`_splDb`, `_emissionDb`, `_receivedDb`, `_pathGain`, `_levelGain`) and the
 * level AudioParam; it never creates or stops voices.
 */
import type { Statement } from './Statement.js';
import type { DistanceProfile } from '../spatial/WorldAcoustics.js';
import type { TrackState } from './SatieEngine.js';
/** Auto level anchor bounds: a whisper-quiet scene still gets a full-scale reference, a loud one is not pinned above real loudness. */
export declare const AUTO_ANCHOR_MIN_DB = 50;
export declare const AUTO_ANCHOR_MAX_DB = 85;
/**
 * One voice in {@link LevelGovernor.levelReport}. `receivedDb` is the governed
 * value where the level model computed one this tick; otherwise (uncalibrated
 * scene, or a voice that has not sounded yet) it is a MODEL ESTIMATE from the
 * same propagation math — stated/default emission through the voice's current
 * path — never a meter tap on the signal.
 */
export interface LevelReportVoice {
    key: string;
    statementIndex: number;
    /** The parsed statement's stable identity — what selection and the mixer key on. */
    statementId: number;
    /** `displayNameOf` the statement — what the viewport labels and the timeline show. */
    label: string;
    /** Emission after the `volume` trim, dB SPL at 1 m. */
    emissionDb: number;
    /** What propagation leaves at the ear, dB SPL (estimate when not governed — see above). */
    receivedDb: number;
    /** Last gain target written for the voice (the volume itself when uncalibrated). */
    gain: number;
    /** True when the window floor silenced the voice. */
    culled: boolean;
    /**
     * True while the voice is actually producing sound RIGHT NOW: a live source
     * that has not ended, not muted, not dimmed away by someone else's solo. A
     * oneshot between fires is not sounding; a playing bed always is.
     */
    sounding: boolean;
    /**
     * Sounding AND reaching the ear: not silenced by its scene zone (`zone … strict`
     * outside its state), not faded to nothing by its level (a `volume follow` at 0,
     * the bells between trains), not culled below the window floor. `sounding` alone
     * counts a live source even while a zone or a follow holds it silent.
     */
    audible: boolean;
    /**
     * Playing at all, wherever you stand: a live source its state lets through (zone, `volume follow` above 0),
     * regardless of distance or culling. The mixer's filled dot: playing; hollow: not playing now.
     */
    active: boolean;
    /** Optional for older report producers. Engine reports always include these UI-rate observations. */
    playback?: {
        source: 'playing' | 'waiting' | 'pending' | 'deferred' | 'virtual' | 'stopping';
        hostResolved: boolean;
        zoneMuted: boolean;
        activityGain: number;
        volume: number;
    };
    /** Current direct-path LEVEL MODEL, not a PCM meter or the full reverberant field. */
    path?: {
        distanceProfile?: DistanceProfile;
        distanceM: number;
        distanceLossDb: number;
        occlusionLossDb: number;
        receivedDb: number;
        nonSpatial: boolean;
        /** Last target of the actual path low-pass. Null means no such filter was installed. */
        filterCutoffHz?: number | null;
    };
}
/** The level model's view of the scene (allocates — read at UI rate). */
export interface LevelReport {
    calibrated: boolean;
    /** Window top / floor, dB SPL received; NaN while uncalibrated or before any voice sounded. */
    topDb: number;
    floorDb: number;
    /** Sorted by received level, loudest first (unknown levels last). */
    voices: LevelReportVoice[];
}
export interface LevelGovernorHost {
    /** The engine's RNG (replaceable by tests), for sampling a stated `spl` range once per voice. */
    rng: () => number;
    /** The DSP clock, seconds. */
    now(): number;
    listenerPos(): {
        x: number;
        y: number;
        z: number;
    };
    tracks(): Iterable<TrackState>;
    /** A measured or published signal for a `spl follow` binding (NaN when unreadable). */
    signalValue(track: TrackState, name: string): number;
    isTrackAudible(track: TrackState): boolean;
    /** The reverb send gain the voice should have at its current path loss. */
    currentSendGain(track: TrackState): number;
    /** A live audition trim (linear, 1 = none) layered on the written gain, never on the level model (a mixer fader while it is dragged). */
    previewGain?(track: TrackState): number;
}
export declare class LevelGovernor {
    private readonly host;
    private readonly extentScratch;
    /**
     * Level model state. `_calibrated` is true while the loaded script states
     * an `spl` anywhere (statement or entity): then every voice's gain is
     * `sourceGain(emission, top) × windowCull(received, top)` and the HDR
     * window governs the scene. Uncalibrated, the window is inert and `volume`
     * is the gain, as it always was. `_windowTopDb` is the window top
     * (received dB SPL) — -Infinity until the first calibrated voice sets it;
     * `_loudestReceivedDb` is the per-tick scratch the governor chases.
     */
    private _calibrated;
    private readonly sourcePreviews;
    private _windowTopDb;
    private _loudestReceivedDb;
    /**
     * A FIXED window top in dB SPL, or null for the adaptive window. The adaptive
     * window pins whatever is loudest at the ear to TOP_LUFS — a mixing aid — so
     * walking up to the loudest source changes nothing but everything else
     * (Mateo, 2026-09-08: "I get close to the water and the volume is not
     * changing"). A game wants physics: with an anchor, a source received at the
     * anchor level plays at TOP_LUFS, quieter ones proportionally quieter, and
     * approaching anything makes it louder. Events keep their headroom cap.
     */
    private _levelAnchorDb;
    /**
     * 'auto': the anchor is taken from the SCENE — the loudest loop received at
     * the start, clamped to [AUTO_ANCHOR_MIN_DB, AUTO_ANCHOR_MAX_DB] — then held.
     * A fixed 75 suited a harbour with a diesel van and buried a dollhouse whose
     * loudest thing is a TV murmur at 55 (Mateo, 2026-09-08: "can't hear shit").
     */
    private _levelAnchorAuto;
    /** Scratch path for `receivedSplDb` — mutated per voice, never allocated in the tick. */
    private readonly _pathScratch;
    /** Separate scratch for {@link levelReport} estimates, so a report can never race the governed tick's. */
    private readonly _reportPathScratch;
    constructor(host: LevelGovernorHost);
    get calibrated(): boolean;
    /** Set by `loadScript`: whether anything in the scene states an emission level. */
    calibrate(on: boolean): void;
    /** Forget the window top (a script reload); the first calibrated voice to sound sets it again. */
    resetWindow(): void;
    /** Start of a spatial tick: the loudest received level is re-collected by `levelPathTick`. */
    beginTick(): void;
    /** Absolute source-level preview through the full propagation/headroom law. Cancel leaves authored SPL and automation intact. */
    previewSourceDb(index: number, value: number | null, ctxTime: number): void;
    /**
     * Fix the window at `dbSpl` (a received level that plays at TOP_LUFS; 75 is
     * a sensible game default), `'auto'` for the scene's loudest loop as first
     * heard, or null for the adaptive window. Takes effect on the next tick.
     */
    setAnchor(dbSpl: number | 'auto' | null): void;
    get anchorDb(): number | null;
    get anchorAuto(): boolean;
    /** Sample the emission the script states for a voice (once), or read its follow signal. */
    private ensureSpl;
    /**
     * Recompute a voice's emission (spl + volume trim) and received level from
     * its current path: the listener distance the spatial tick measured (or
     * the distance from its position before audio has played), bed/field/line,
     * and the composed occlusion the muffle chain uses. No allocation.
     */
    updateLevelPath(track: TrackState, volume01: number): void;
    /**
     * The received level a given emission leaves at the ear through this
     * voice's CURRENT path — distance (measured, or from position before audio
     * played), bed/field/line, composed occlusion. Pure over the track: writes
     * only into the passed scratch, so the level report can estimate without
     * disturbing governed state.
     */
    private receivedThroughPath;
    /**
     * The gain target for a voice playing at `volume01`. Uncalibrated: the
     * volume itself, exactly as before. Calibrated: the voice's emission
     * relative to the window top, times the window cull on its received level
     * — distance is left to the panner, which applies the same law itself.
     */
    /**
     * `heard_in`: the dB a sound is heard louder or quieter in the soundscapes you are in, each
     * weighted by its 0..1 signal (an unpublished signal counts as 0). Spec 012.
     */
    heardInDb(track: TrackState): number;
    levelGain(track: TrackState, volume01: number): number;
    /**
     * A voice's gain at a window top: emission against the top, culled under
     * the floor; an EVENT (anything but a loop) is capped `EVENT_HEADROOM_DB`
     * over the top instead of moving it — see LevelModel.eventCapDb.
     */
    private governedGain;
    /** The report and the gain writer must describe the same cull, including anchor and fader policy. */
    private cullGain;
    /**
     * Write a voice's gain target. Uncalibrated this is the plain de-clicked
     * write it always was; calibrated, a write during the voice's fade-in
     * re-aims the ramp at the new target so the fade survives the window
     * moving underneath it.
     */
    writeVoiceGain(track: TrackState, g: number, ctxTime: number): void;
    /** A voice with a per-frame volume writer (interpolation, group envelope, follow) re-levels itself every frame. */
    static hasVolumeWriter(stmt: Statement): boolean;
    /**
     * Per spatial tick, per sounding voice: re-read a `spl follow` emission
     * from its signal, refresh the path (voices with a per-frame writer did so
     * this frame already), and offer the received level to the window.
     */
    levelPathTick(track: TrackState, stmt: Statement): void;
    /**
     * Once per spatial tick: step the window top toward the loudest received
     * level (fast attack, slow release, never below WINDOW_TOP_MIN_DB), then
     * re-level every governed voice whose target moved — write-skipped when
     * flat, so a static scene costs one compare per voice. Voices with a
     * per-frame volume writer pick the new top up next frame on their own.
     * The reverb send follows the path loss the same way.
     */
    governWindow(ctxTime: number, dtSec: number): void;
    /**
     * Per-voice level report for the UI and the timeline (allocates — UI rate).
     * Sorted by received level, loudest first. Where the governed tick has not
     * stated a received level (uncalibrated scene, a voice yet to sound), the
     * row carries a MODEL ESTIMATE through the same propagation math — the
     * stated `spl` midpoint (or the default emission) plus the volume trim,
     * through the voice's current path — computed against a report-only
     * scratch, never writing governed track state.
     */
    levelReport(): LevelReport;
}
//# sourceMappingURL=LevelGovernor.d.ts.map