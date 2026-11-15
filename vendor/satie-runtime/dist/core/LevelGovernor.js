import { displayNameOf } from './Statement.js';
import { propertySpec } from './Properties.js';
import { mapFollow } from './Signals.js';
import { PARAM_SMOOTHING } from './audioParams.js';
import { sampleSourceExtent } from '../spatial/SourceExtent.js';
import { receivedSplDb, sourceGain, windowCull, windowTopStep, volumeTrimDb, dbToGain, DEFAULT_SPL_DB, WINDOW_DB, WINDOW_TOP_MIN_DB, eventCapDb, distanceLossDb, } from '../spatial/LevelModel.js';
/** The `spl` spec's clamp, applied again to what a `spl follow` binding maps to. */
const SPL_CLAMP = propertySpec('spl').clamp;
const clampSpl = (db) => (db < SPL_CLAMP[0] ? SPL_CLAMP[0] : db > SPL_CLAMP[1] ? SPL_CLAMP[1] : db);
/** Governor writes are skipped under this relative change of the gain target (and an absolute floor). */
const LEVEL_WRITE_REL = 0.005;
const LEVEL_WRITE_ABS = 1e-5;
/** A voice quieter than this from activity gating does not drive the window top. */
const LEVEL_ACTIVITY_MIN = 0.01;
/** Auto level anchor bounds: a whisper-quiet scene still gets a full-scale reference, a loud one is not pinned above real loudness. */
export const AUTO_ANCHOR_MIN_DB = 50;
export const AUTO_ANCHOR_MAX_DB = 85;
export class LevelGovernor {
    host;
    extentScratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
    /**
     * Level model state. `_calibrated` is true while the loaded script states
     * an `spl` anywhere (statement or entity): then every voice's gain is
     * `sourceGain(emission, top) × windowCull(received, top)` and the HDR
     * window governs the scene. Uncalibrated, the window is inert and `volume`
     * is the gain, as it always was. `_windowTopDb` is the window top
     * (received dB SPL) — -Infinity until the first calibrated voice sets it;
     * `_loudestReceivedDb` is the per-tick scratch the governor chases.
     */
    _calibrated = false;
    sourcePreviews = new Map();
    _windowTopDb = -Infinity;
    _loudestReceivedDb = -Infinity;
    /**
     * A FIXED window top in dB SPL, or null for the adaptive window. The adaptive
     * window pins whatever is loudest at the ear to TOP_LUFS — a mixing aid — so
     * walking up to the loudest source changes nothing but everything else
     * (Mateo, 2026-09-08: "I get close to the water and the volume is not
     * changing"). A game wants physics: with an anchor, a source received at the
     * anchor level plays at TOP_LUFS, quieter ones proportionally quieter, and
     * approaching anything makes it louder. Events keep their headroom cap.
     */
    _levelAnchorDb = null;
    /**
     * 'auto': the anchor is taken from the SCENE — the loudest loop received at
     * the start, clamped to [AUTO_ANCHOR_MIN_DB, AUTO_ANCHOR_MAX_DB] — then held.
     * A fixed 75 suited a harbour with a diesel van and buried a dollhouse whose
     * loudest thing is a TV murmur at 55 (Mateo, 2026-09-08: "can't hear shit").
     */
    _levelAnchorAuto = false;
    /** Scratch path for `receivedSplDb` — mutated per voice, never allocated in the tick. */
    _pathScratch = { distanceM: 0, bed: false, field: false, line: false, occlusion01: 0 };
    /** Separate scratch for {@link levelReport} estimates, so a report can never race the governed tick's. */
    _reportPathScratch = { distanceM: 0, bed: false, field: false, line: false, occlusion01: 0 };
    constructor(host) {
        this.host = host;
    }
    get calibrated() { return this._calibrated; }
    /** Set by `loadScript`: whether anything in the scene states an emission level. */
    calibrate(on) { this._calibrated = on; this.sourcePreviews.clear(); }
    /** Forget the window top (a script reload); the first calibrated voice to sound sets it again. */
    resetWindow() { this._windowTopDb = -Infinity; }
    /** Start of a spatial tick: the loudest received level is re-collected by `levelPathTick`. */
    beginTick() { this._loudestReceivedDb = -Infinity; }
    /** Absolute source-level preview through the full propagation/headroom law. Cancel leaves authored SPL and automation intact. */
    previewSourceDb(index, value, ctxTime) {
        if (value === null || !Number.isFinite(value))
            this.sourcePreviews.delete(index);
        else
            this.sourcePreviews.set(index, clampSpl(value));
        for (const track of this.host.tracks()) {
            if (track.statementIndex !== index)
                continue;
            const gain = this.host.isTrackAudible(track) ? this.levelGain(track, track.volume) : 0;
            this.writeVoiceGain(track, gain, ctxTime);
        }
    }
    /**
     * Fix the window at `dbSpl` (a received level that plays at TOP_LUFS; 75 is
     * a sensible game default), `'auto'` for the scene's loudest loop as first
     * heard, or null for the adaptive window. Takes effect on the next tick.
     */
    setAnchor(dbSpl) {
        if (dbSpl === 'auto') {
            this._levelAnchorAuto = true;
            this._levelAnchorDb = null; // resolved on the first spatial tick that hears a loop
            return;
        }
        this._levelAnchorAuto = false;
        this._levelAnchorDb = dbSpl === null ? null : Math.max(WINDOW_TOP_MIN_DB, dbSpl);
        if (this._levelAnchorDb !== null)
            this._windowTopDb = this._levelAnchorDb;
    }
    get anchorDb() { return this._levelAnchorDb; }
    get anchorAuto() { return this._levelAnchorAuto; }
    /** Sample the emission the script states for a voice (once), or read its follow signal. */
    ensureSpl(track) {
        const stmt = track.statement;
        if (stmt.splFollow) {
            const x = this.host.signalValue(track, stmt.splFollow.signal);
            // Before the signal reads (no body yet), sit at the binding's input floor.
            if (!isNaN(x) || isNaN(track._splDb))
                track._splDb = clampSpl(mapFollow(stmt.splFollow, isNaN(x) ? stmt.splFollow.inMin : x));
            return;
        }
        if (isNaN(track._splDb))
            track._splDb = stmt.spl.isNull ? DEFAULT_SPL_DB : clampSpl(stmt.spl.sample(this.host.rng));
    }
    /**
     * Recompute a voice's emission (spl + volume trim) and received level from
     * its current path: the listener distance the spatial tick measured (or
     * the distance from its position before audio has played), bed/field/line,
     * and the composed occlusion the muffle chain uses. No allocation.
     */
    updateLevelPath(track, volume01) {
        if (isNaN(track._splDb))
            this.ensureSpl(track);
        const emission = (this.sourcePreviews.get(track.statementIndex) ?? track._splDb) + volumeTrimDb(volume01) + this.heardInDb(track);
        track._emissionDb = emission;
        const received = this.receivedThroughPath(track, emission, this._pathScratch);
        track._receivedDb = received;
        // What the path costs, linear — the reverb send is scaled by it (sendGainFor).
        track._pathGain = emission === -Infinity ? 1 : dbToGain(received - emission);
    }
    /**
     * The received level a given emission leaves at the ear through this
     * voice's CURRENT path — distance (measured, or from position before audio
     * played), bed/field/line, composed occlusion. Pure over the track: writes
     * only into the passed scratch, so the level report can estimate without
     * disturbing governed state.
     */
    receivedThroughPath(track, emissionDb, path) {
        const stmt = track.statement;
        sampleSourceExtent(track, this.host.listenerPos(), this.extentScratch);
        const dist = this.extentScratch.surfaceDistM;
        const occRaw = track._zoneOcclusion > track.occlusion ? track._zoneOcclusion : track.occlusion;
        const occ = occRaw > track._foliage ? occRaw : track._foliage;
        path.distanceM = dist;
        path.bed = track._bed;
        path.field = stmt.field;
        path.line = stmt.line;
        path.occlusion01 = occ;
        path.distanceProfile = stmt.distanceProfile;
        return receivedSplDb(emissionDb, path);
    }
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
    heardInDb(track) {
        const list = track.statement.heardIn;
        if (!list)
            return 0;
        let db = 0;
        for (const e of list) {
            const x = this.host.signalValue(track, e.signal);
            const w = Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
            db += e.db * (e.invert ? 1 - w : w);
        }
        return db;
    }
    levelGain(track, volume01) {
        if (!this._calibrated)
            return volume01 * dbToGain(this.heardInDb(track));
        this.updateLevelPath(track, volume01);
        // The first calibrated voice to sound sets the top; the governor takes over
        // (or the anchor holds it, see setLevelAnchorDb).
        if (this._levelAnchorDb !== null)
            this._windowTopDb = this._levelAnchorDb;
        else if (!isFinite(this._windowTopDb))
            this._windowTopDb = Math.max(WINDOW_TOP_MIN_DB, track._receivedDb);
        const top = this._windowTopDb;
        return this.governedGain(track, top);
    }
    /**
     * A voice's gain at a window top: emission against the top, culled under
     * the floor; an EVENT (anything but a loop) is capped `EVENT_HEADROOM_DB`
     * over the top instead of moving it — see LevelModel.eventCapDb.
     */
    governedGain(track, top) {
        // The cull keeps the ADAPTIVE window's dynamic range bounded; it reads the
        // untrimmed received level (the fader is a trim, not a distance), and an
        // anchored scene is never culled: quiet stays quiet instead of vanishing
        // (Mateo's harbour water, faded to 0.17, dropped under the floor and "kept failing").
        const cull = this.cullGain(track._receivedDb, track.volume, top);
        let g = sourceGain(track._emissionDb, top) * cull;
        if (track.statement.kind !== 'loop') {
            // With a fixed reference, cap emission before propagation. Capping the
            // received level boosts the source as the listener walks away, cancelling
            // distance loss until it falls below the ceiling.
            const cap = eventCapDb(this._levelAnchorDb !== null ? track._emissionDb : track._receivedDb, top);
            if (cap > 0)
                g *= dbToGain(-cap);
        }
        return g;
    }
    /** The report and the gain writer must describe the same cull, including anchor and fader policy. */
    cullGain(receivedDb, volume, top) {
        if (this._levelAnchorDb !== null)
            return 1;
        return windowCull(volume > 0 ? receivedDb - volumeTrimDb(volume) : receivedDb, top);
    }
    /**
     * Write a voice's gain target. Uncalibrated this is the plain de-clicked
     * write it always was; calibrated, a write during the voice's fade-in
     * re-aims the ramp at the new target so the fade survives the window
     * moving underneath it.
     */
    writeVoiceGain(track, g, ctxTime) {
        track._levelGain = g;
        if (track.virtual)
            return;
        // Calibrated: the level lives on its own post-DSP node, so the fade
        // envelope on gainNode is never disturbed by the window moving.
        const p = this._calibrated ? track.levelNode.gain : track.gainNode.gain;
        // A rebalance inside a version crossfade glides with it (spec 012 E2); otherwise the usual smoothing.
        const tau = track._glideUntil !== undefined && ctxTime < track._glideUntil ? (track._glideTau ?? PARAM_SMOOTHING) : PARAM_SMOOTHING;
        p.setTargetAtTime(g * (this.host.previewGain?.(track) ?? 1), ctxTime, tau);
    }
    /** A voice with a per-frame volume writer (interpolation, group envelope, follow) re-levels itself every frame. */
    static hasVolumeWriter(stmt) {
        return !!(stmt.volumeInterpolation || stmt.groupVolumeModulation || stmt.volumeFollow);
    }
    /**
     * Per spatial tick, per sounding voice: re-read a `spl follow` emission
     * from its signal, refresh the path (voices with a per-frame writer did so
     * this frame already), and offer the received level to the window.
     */
    levelPathTick(track, stmt) {
        if ((!track.sourceNode && !track.virtual) || track.stopping || this.host.now() >= track._sourceEndT)
            return;
        // An unresolved placement is absent from the scene, not a muted monitor.
        // It cannot set the playback window and suppress the real background.
        if (stmt.hostRef && !track.pinned && !track.entityInstance)
            return;
        if (stmt.splFollow)
            this.ensureSpl(track);
        if (stmt.splFollow || !LevelGovernor.hasVolumeWriter(stmt))
            this.updateLevelPath(track, track.volume);
        // Only STEADY sources (loops) set the top; events are capped over it instead (governedGain).
        // Mute and solo are MONITORING: a soloed voice is heard at its in-mix
        // level, not promoted to the top and pinned at full loudness (which is
        // what made a soloed 45 dB wind bed deafening whatever its slider said).
        // Zone muting is scene state and does move the window.
        // The window follows the PHYSICS (spl through the path), not the fader:
        // `volume` is offered untrimmed, so pulling the loudest voice down lowers
        // that voice and nothing else (a monotonic mixer), instead of dragging the
        // window top with it and bringing everything else up.
        const offered = track.volume > 0 ? track._receivedDb - volumeTrimDb(track.volume) : -Infinity;
        if (stmt.kind === 'loop'
            && offered > this._loudestReceivedDb && !track._zoneMuted
            && track._activity > LEVEL_ACTIVITY_MIN)
            this._loudestReceivedDb = offered;
    }
    /**
     * Once per spatial tick: step the window top toward the loudest received
     * level (fast attack, slow release, never below WINDOW_TOP_MIN_DB), then
     * re-level every governed voice whose target moved — write-skipped when
     * flat, so a static scene costs one compare per voice. Voices with a
     * per-frame volume writer pick the new top up next frame on their own.
     * The reverb send follows the path loss the same way.
     */
    governWindow(ctxTime, dtSec) {
        // Auto anchor: the scene's loudest loop as first heard sets the reference, once.
        if (this._levelAnchorAuto && this._levelAnchorDb === null && isFinite(this._loudestReceivedDb)) {
            this._levelAnchorDb = Math.min(AUTO_ANCHOR_MAX_DB, Math.max(AUTO_ANCHOR_MIN_DB, this._loudestReceivedDb));
        }
        this._windowTopDb = this._levelAnchorDb ?? windowTopStep(this._windowTopDb, this._loudestReceivedDb, dtSec);
        const top = this._windowTopDb;
        for (const track of this.host.tracks()) {
            if (!track.sourceNode || track.stopping)
                continue;
            const stmt = track.statement;
            if (!LevelGovernor.hasVolumeWriter(stmt)) {
                const g = this.host.isTrackAudible(track) ? this.governedGain(track, top) : 0;
                const last = track._levelGain;
                const d = Math.abs(g - last);
                if (d > LEVEL_WRITE_ABS && d > LEVEL_WRITE_REL * (g > last ? g : last))
                    this.writeVoiceGain(track, g, ctxTime);
            }
            if (track.reverbSend && Math.abs(track._pathGain - track._lastPathGain) > 0.01 * track._lastPathGain) {
                track._lastPathGain = track._pathGain;
                track.reverbSend.gain.setTargetAtTime(this.host.currentSendGain(track), ctxTime, PARAM_SMOOTHING);
            }
        }
    }
    /**
     * Per-voice level report for the UI and the timeline (allocates — UI rate).
     * Sorted by received level, loudest first. Where the governed tick has not
     * stated a received level (uncalibrated scene, a voice yet to sound), the
     * row carries a MODEL ESTIMATE through the same propagation math — the
     * stated `spl` midpoint (or the default emission) plus the volume trim,
     * through the voice's current path — computed against a report-only
     * scratch, never writing governed track state.
     */
    levelReport() {
        const calibrated = this._calibrated;
        const top = calibrated && isFinite(this._windowTopDb) ? this._windowTopDb : NaN;
        const now = this.host.now();
        const voices = [];
        for (const track of this.host.tracks()) {
            const stmt = track.statement;
            const audible = this.host.isTrackAudible(track);
            const gain = calibrated ? track._levelGain : (audible ? track.volume : 0);
            const governed = calibrated && isFinite(track._receivedDb);
            let emissionDb = track._emissionDb;
            let receivedDb = track._receivedDb;
            if (!governed) {
                const spl = !isNaN(track._splDb) ? track._splDb
                    : stmt.spl.isNull ? DEFAULT_SPL_DB : (stmt.spl.min + stmt.spl.max) / 2;
                emissionDb = spl + volumeTrimDb(track.volume);
                receivedDb = this.receivedThroughPath(track, emissionDb, this._reportPathScratch);
            }
            const culled = calibrated && isFinite(top) && this.cullGain(receivedDb, track.volume, top) <= 0;
            const sourcePlaying = !!track.sourceNode && !track.stopping && now < track._sourceEndT;
            const sounding = audible && sourcePlaying;
            const pathReceived = this.receivedThroughPath(track, emissionDb, this._reportPathScratch);
            const path = this._reportPathScratch;
            const nonSpatial = !!(path.bed || path.field);
            const distanceLoss = nonSpatial ? 0 : distanceLossDb(path.distanceM, path.line, path.distanceProfile);
            // Evaluate a zero-dB reference through the same model so volume=0 (-Infinity)
            // still yields useful finite loss terms, without re-deriving occlusion's law.
            const totalLoss = -receivedSplDb(0, path);
            const playback = {
                source: track.stopping ? 'stopping' : track.dormant ? 'deferred' : track.pending ? 'pending'
                    : track.virtual ? 'virtual' : sourcePlaying ? 'playing' : 'waiting',
                hostResolved: !stmt.hostRef || !!track.pinned || !!track.entityInstance,
                zoneMuted: track._zoneMuted, activityGain: track._activity, volume: track.volume,
            };
            voices.push({
                key: track.key,
                statementIndex: track.statementIndex,
                statementId: stmt.statementId,
                label: displayNameOf(stmt),
                emissionDb,
                receivedDb,
                gain,
                culled,
                sounding,
                audible: sounding && !track._zoneMuted && track._activity > 0 && !culled && gain > 1e-4,
                active: sourcePlaying && !track._zoneMuted && track._activity > 0 && track.volume > 1e-4,
                playback,
                path: { distanceProfile: stmt.distanceProfile ?? 'legacy_v1', distanceM: path.distanceM, distanceLossDb: distanceLoss,
                    occlusionLossDb: totalLoss - distanceLoss, receivedDb: pathReceived, nonSpatial,
                    filterCutoffHz: track.occlusionFilter && Number.isFinite(track._lastCutoffHz) ? track._lastCutoffHz : null },
            });
        }
        voices.sort((a, b) => {
            const an = isNaN(a.receivedDb), bn = isNaN(b.receivedDb);
            if (an || bn)
                return an === bn ? 0 : an ? 1 : -1;
            return b.receivedDb - a.receivedDb;
        });
        return { calibrated, topDb: top, floorDb: isFinite(top) ? top - WINDOW_DB : NaN, voices };
    }
}
//# sourceMappingURL=LevelGovernor.js.map