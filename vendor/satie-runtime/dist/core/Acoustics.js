/**
 * What the listener's SURROUNDINGS do to each voice on its way in: the
 * obstruction muffle (geometry occlusion, zone isolation, foliage, the
 * air/water interface), placed rooms the listener can walk into, doorway
 * redirects, air absorption and Doppler with distance, the floor / ceiling
 * reflection legs, the headphone elevation lens, and the MEDIUM stage on the
 * master chain (what the listener's own head is under).
 *
 * Collaborators (`AcousticsHost`) — what stays the engine's business:
 *   reads   `now()`, `listenerPos()`, `tracks()` / `trackFor(key)` (the
 *           engine owns the voices and their nodes), `world()` and
 *           `hostingEnabled()` (foliage bodies, the interior, ground
 *           material), `listenerInsideInterior()` (the routing pass's
 *           verdict), `fieldProvider()` (a source's own submersion),
 *           `namedRoom(name)` (a placed room's declared reverb),
 *           `masterGain` / `limiter` / `masterConnected()` (where the medium
 *           stage splices in)
 *   actions `setListenerRoom(room)` (the ambient ladder step this module
 *           decides), `applyLiveReverb(track, stmt, t)` (re-point a voice's
 *           send when the listener changes room), `setSignal(name, value)`
 *           (`submerged` is an open signal scripts can follow)
 * The engine still creates each voice's panner and gain graph; this module
 * inserts the muffle chain and the reflection legs on demand and drives them.
 */
import { soundscapeShares, soundscapeHere, dbToPower } from '../spatial/SoundscapeShare.js';
import { WanderType } from './Statement.js';
import { sampleSourceExtent } from '../spatial/SourceExtent.js';
import { materialAt } from '../world/worldRealize.js';
import { newFieldSample } from '../world/WorldFields.js';
import { combinedCutoffHz, occlusionGain, dopplerRatio as dopplerRatioFor, OCCLUSION_OPEN_HZ, AIR_ABSORPTION_REF_M, distanceRolloff, mediumCutoffHz, mediumGain, mediumWarbleDepthS, mediumSpatialCollapse, airAbsorptionScale, surfaceTransmissionGain, MEDIUM_WARBLE_HZ, MEDIUM_WARBLE_BASE_S, MEDIUM_XFADE_S, } from '../spatial/WorldAcoustics.js';
import { createReflectionLeg, createImagePanner, applyReflectionLeg, disposeReflectionLeg, groundReflection, imagePoint, surfaceForLabel, exaggerateElevation, directTrimFor, DEFAULT_GROUND_SURFACE, } from '../spatial/ElevationCues.js';
import { clamp01 } from './math.js';
/** Crossfade constant for a placed room's boundary flip — walking through a
 * doorway takes a couple of strides, and so does the wall's muffle changing
 * sides (0.3 s read as an abrupt dunk at a store's 0.85 wall). */
export const ROOM_OCC_SMOOTH_S = 0.7;
/** Hysteresis on leaving a placed room, metres — a head bobbing on the
 * threshold must not flap the whole acoustic state. */
export const PLACED_ROOM_EXIT_MARGIN_M = 0.25;
/** Foliage on the path never muffles harder than this (0..1 occlusion units). */
export const FOLIAGE_MAX_OCCLUSION = 0.35;
/** How long `in_<room>` / `indoors` take to go from 0 to 1 (and back) as you cross the room's edge. */
export const ROOM_PRESENCE_EASE_S = 0.6;
/** Metres of crown along the path that reach FOLIAGE_MAX_OCCLUSION. */
export const FOLIAGE_FULL_M = 40;
/** A strict zone boundary at full isolation: how much of a voice outside it gets through (dB). */
export const ZONE_ISOLATION_MAX_DB = 30;
/** Level cut for a voice across a scene-state boundary (wall law: deeper than a passing obstacle). */
export function zoneIsolationGain(isolation) {
    if (isolation <= 0)
        return 1;
    return Math.pow(10, -(isolation * ZONE_ISOLATION_MAX_DB) / 20);
}
export class Acoustics {
    ctx;
    host;
    extentScratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
    placedRoomList = [];
    /** The placed room the listener currently stands in, lowercased — null outside all. */
    listenerRoom = null;
    /** Monitoring elevation gain: 1 = the scene's own angles. Never reaches exports. */
    elevationGain = 1;
    /**
     * Floor / ceiling reflection legs. OFF by default since 2026-09-07: Mateo
     * heard the leg as a phaser on water in every scene ("the water still has
     * the phaser sound"). On, a point voice's reflection now arrives from its
     * own image-point panner (see ElevationCues), which is the honest cue; the
     * devtools overlay and `setGroundReflection` switch it for an A/B.
     */
    reflectionLegs = false;
    warpScratch = { x: 0, y: 0, z: 0 };
    reflScratch = { delayS: 0, gain: 0 };
    imageScratch = { x: 0, y: 0, z: 0 };
    fieldScratch = newFieldSample();
    /** How far the listener's head is under a fluid surface, 0 (air) → 1. */
    submergedNow = 0;
    /** HF scale on the air-absorption distance (water absorbs ~100× less per metre). */
    airScale = 1;
    medium = null;
    constructor(ctx, host) {
        this.ctx = ctx;
        this.host = host;
    }
    // ── Placed rooms: walk into the sound ─────────────────────────────
    // A `room` block with a `place` line stands somewhere. When the listener's
    // head is inside its box, the boundary the author wrote flips sides: the
    // room's own voices lose their occlusion (you are with them now), voices
    // outside gain the same wall's worth of muffle, and the ambient reverb
    // becomes the room's. All values are AUTHORED — the boundary muffle is the
    // max `occlusion` the room's voices carried, never an engine constant.
    get placedRooms() { return this.placedRoomList; }
    get listenerRoomName() { return this.listenerRoom; }
    /**
     * Where the listener is, as signals a sound can follow: `in_<room>` for each placed room and
     * `indoors` for any, 0 outside and 1 inside, eased over ROOM_PRESENCE_EASE_S so walking in fades
     * rather than jumps. "The cicadas softer when I am inside" is then
     * `volume follow in_tatami_room 0to1 1to0.35`: a condition the script can state, with no game code.
     */
    roomPresence = new Map();
    publishRoomPresence(dtSec) {
        const k = 1 - Math.exp(-Math.max(0, dtSec) / (ROOM_PRESENCE_EASE_S / 3));
        let any = 0;
        for (const r of this.placedRoomList) {
            const target = r.name === this.listenerRoom ? 1 : 0;
            const was = this.roomPresence.get(r.name) ?? target;
            let v = was + (target - was) * k;
            if (Math.abs(v - target) < 0.01)
                v = target;
            if (v !== this.roomPresence.get(r.name)) {
                this.roomPresence.set(r.name, v);
                this.host.setSignal(`in_${r.name}`, v);
            }
            any = Math.max(any, v);
        }
        if (any !== this.roomPresence.get('*')) {
            this.roomPresence.set('*', any);
            this.host.setSignal('indoors', any);
        }
        this.publishSoundscapeShares();
    }
    // ── Soundscapes (spec 014, phase 2) ──
    // `in_<soundscape>`: an enclosed one is as present as its rooms; the rest is shared among the
    // open ones by the power their own steady, positioned sounds deliver at the ear.
    soundscapeList = [];
    soundscapeShare = new Map();
    enclosedSoundscapes = new Set();
    here = null;
    /** The script's soundscapes (the `kind world` block is the world layer and publishes nothing). */
    buildSoundscapes(list) {
        this.soundscapeList = list.filter(sc => sc.kind !== 'world');
        this.enclosedSoundscapes = new Set(this.soundscapeList.filter(sc => sc.kind === 'enclosed' || (!sc.kind && sc.rooms.length)).map(sc => sc.id));
        this.soundscapeShare.clear();
        this.here = null;
    }
    /** The soundscape a voice belongs to: by object, by source id, by `in <room>`. Null when none. */
    soundscapeOf(stmt) {
        for (const sc of this.soundscapeList) {
            if (stmt.hostRef && sc.objects.includes(stmt.hostRef))
                return sc.id;
            if (stmt.sourceId && sc.sounds.includes(stmt.sourceId))
                return sc.id;
            if (stmt.roomName && sc.rooms.includes(stmt.roomName))
                return sc.id;
        }
        // A bed fading in with `in_<id>` is that soundscape's own (the list reads it the same way).
        for (const f of [stmt.volumeFollow, stmt.splFollow]) {
            const sc = f?.signal?.startsWith('in_') ? this.soundscapeList.find(s => `in_${s.id}` === f.signal) : undefined;
            if (sc)
                return sc.id;
        }
        return null;
    }
    /** True when the script declares soundscapes (the engine ticks them even with no placed room). */
    get hasSoundscapes() { return this.soundscapeList.length > 0; }
    /** Publish `in_<soundscape>` and update "here". Runs with the room presence, or alone when no room is placed. */
    publishSoundscapeShares() {
        if (!this.soundscapeList.length)
            return;
        const power = new Map();
        for (const t of this.host.tracks()) {
            const st = t.statement;
            if (st.kind !== 'loop' || st.bed || st.field)
                continue;
            // Only what is sounding now: a loop still waiting for its recording (or stopping, or held
            // at zero) already carries a received level, which must not count.
            if (!t.sourceNode || t.stopping || t.volume <= 0 || t._zoneMuted || t._activity <= 0)
                continue;
            const id = this.soundscapeOf(st);
            if (id)
                power.set(id, (power.get(id) ?? 0) + dbToPower(t._receivedDb));
        }
        const enclosed = this.soundscapeList.filter(sc => this.enclosedSoundscapes.has(sc.id))
            .map(sc => ({ id: sc.id, presence: Math.max(0, ...sc.rooms.map(r => this.roomPresence.get(r) ?? 0)) }));
        const open = this.soundscapeList.filter(sc => !this.enclosedSoundscapes.has(sc.id)).map(sc => ({ id: sc.id, powerLin: power.get(sc.id) ?? 0 }));
        for (const [id, v0] of soundscapeShares({ enclosed, open })) {
            const v = Math.round(v0 * 1000) / 1000;
            if (v !== this.soundscapeShare.get(id)) {
                this.soundscapeShare.set(id, v);
                this.host.setSignal(`in_${id}`, v);
            }
        }
        this.here = soundscapeHere(this.soundscapeShare, this.enclosedSoundscapes, this.here);
    }
    /** Each soundscape's current share, 0..1. */
    get soundscapeShares() { return this.soundscapeShare; }
    /** The soundscape the listener is in (`soundscapeHere`: rooms by their walls, the open ones with a hold). */
    get soundscapeHere() { return this.here; }
    /** Derive the placed-room boxes + their boundary muffle from the scene. */
    buildPlacedRooms(rooms, statements) {
        this.placedRoomList = [];
        for (const r of rooms) {
            if (!r.placeM || !r.sizeM)
                continue;
            const name = r.name.toLowerCase();
            let boundary = 0;
            for (const s of statements) {
                if (s.roomName === name && s.occlusionBase > boundary)
                    boundary = s.occlusionBase;
            }
            this.placedRoomList.push({
                name,
                cx: r.placeM.x, cy: r.placeM.y, cz: r.placeM.z,
                hx: r.sizeM.x / 2, hy: r.sizeM.y / 2, hz: r.sizeM.z / 2,
                boundary,
            });
        }
        if (!this.placedRoomList.length) {
            this.listenerRoom = null;
            this.host.setListenerRoom(null);
        }
    }
    /**
     * Which placed room holds the listener — with a little hysteresis (leaving
     * takes an extra step) so a head bobbing on the threshold does not flap the
     * whole acoustic state. On a CHANGE, re-point the ambient reverb of every
     * voice that rides the scene room (own `reverb` and `in <room>` voices keep
     * theirs — the ladder above them is untouched).
     */
    updateListenerRoom(ctxTime, dtSec = 0) {
        this.publishRoomPresence(dtSec);
        const lp = this.host.listenerPos();
        let inRoom = null;
        for (const r of this.placedRoomList) {
            const m = r.name === this.listenerRoom ? PLACED_ROOM_EXIT_MARGIN_M : 0;
            if (Math.abs(lp.x - r.cx) <= r.hx + m
                && Math.abs(lp.y - r.cy) <= r.hy + m
                && Math.abs(lp.z - r.cz) <= r.hz + m) {
                inRoom = r.name;
                break;
            }
        }
        if (inRoom === this.listenerRoom)
            return;
        this.listenerRoom = inRoom;
        this.host.setListenerRoom(inRoom ? this.host.namedRoom(inRoom) : null);
        for (const track of this.host.tracks()) {
            const s = track.statement;
            if (!s.reverbParams && !s.roomName && track.reverbSend)
                this.host.applyLiveReverb(track, s, ctxTime);
        }
    }
    /**
     * Per-track, per-spatial-tick: smooth the occlusion floor toward which side
     * of the boundary the listener stands on, and re-assert the muffle when it
     * moved. `k` is the shared per-tick smoothing fraction (~0.3 s constant).
     * A geometry raycast pass may still raise `track.occlusion` above the floor
     * on its next visit — the floor only says what the WALL is worth.
     */
    tickPlacedRoomFloor(track, k, ctxTime) {
        const stmt = track.statement;
        if (stmt.occlusionFollow)
            return; // a binding owns its property
        const R = this.listenerRoom;
        let target;
        if (R === null) {
            target = stmt.occlusionBase;
        }
        else if (stmt.roomName === R) {
            target = 0; // same side of the wall as the listener
        }
        else {
            const room = this.placedRoomList.find(r => r.name === R);
            const b = room ? room.boundary : 0;
            target = stmt.occlusionBase > b ? stmt.occlusionBase : b;
        }
        const cur = track._roomOccFloor;
        if (cur === target)
            return;
        let next = cur + (target - cur) * k;
        if (Math.abs(next - target) < 0.004)
            next = target;
        track._roomOccFloor = next;
        // Move the audible value only where the floor is what drives it: raising
        // always wins (a floor can only add), lowering only follows when the
        // current occlusion WAS the old floor — a higher geometry-raycast value
        // keeps standing until that pass re-reads its own rays.
        const floorDriven = track.occlusion === cur || track.occlusion < next;
        if (floorDriven && next !== track.occlusion) {
            track.occlusion = next;
            this.applyMuffle(track, ctxTime, 0.15);
        }
    }
    // ── Obstruction ───────────────────────────────────────────────────
    /**
     * Set geometry-driven occlusion for a voice (0 = clear, 1 = behind a wall).
     * Called by the UI layer after raycasting listener→voice against a world
     * collider mesh. Lazily inserts a lowpass between panner and master the
     * first time a voice is actually occluded; smoothed to avoid zipper noise.
     */
    setOcclusion(track, amount) {
        // The authored/semantic occlusion (`occlusion 0.55` in the script, or an
        // interior tag from world grounding) is a FLOOR the per-frame geometry
        // raycast can add to but never erase — a clear sight line to the outside
        // of a wall must not un-muffle the fireplace behind it. The floor itself
        // is owned by the placed-room system (track._roomOccFloor), which lowers
        // it to 0 when the listener stands INSIDE the voice's placed room — the
        // wall is no longer between them — and equals `occlusionBase` otherwise.
        const floor = track._roomOccFloor;
        const raw = amount < 0 ? 0 : amount > 1 ? 1 : amount;
        const clamped = raw > floor ? raw : floor;
        if (Math.abs(clamped - track.occlusion) < 0.01)
            return;
        track.occlusion = clamped;
        if (!track.occlusionFilter && clamped === 0)
            return; // never muffled — keep the direct path
        this.applyMuffle(track, this.host.now(), 0.08);
    }
    /**
     * Raise a voice's semantic occlusion floor at runtime — how world grounding
     * marks a source as INTERIOR (a fireplace inside the house, heard from the
     * lane). Writes the statement's own `occlusionBase`, so it survives
     * incremental reloads (statement identity is preserved) and the per-frame
     * raycast can never undercut it (see setOcclusion).
     */
    raiseOcclusionFloor(track, floor01) {
        const f = clamp01(floor01);
        if (f > track.statement.occlusionBase) {
            track.statement.occlusionBase = f;
            if (f > track._roomOccFloor)
                track._roomOccFloor = f;
        }
        this.setOcclusion(track, track.occlusion);
    }
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
    setDiffraction(track, apparent) {
        // An explicit redirect claims the register: the interior routing pass
        // only ever updates or clears an apparent it set itself.
        track._interiorRouted = false;
        if (!apparent) {
            if (track.apparent) {
                track.apparent = null;
                this.writePannerPosition(track, track.position, this.host.now());
            }
            return;
        }
        if (track.apparent) {
            track.apparent.x = apparent.x;
            track.apparent.y = apparent.y;
            track.apparent.z = apparent.z;
        }
        else {
            track.apparent = { x: apparent.x, y: apparent.y, z: apparent.z };
        }
        this.writePannerPosition(track, track.apparent, this.host.now());
    }
    /**
     * Set the world-geometry floor under a voice (terrain conform). Static
     * voices are lifted immediately; moving voices are clamped every spatial
     * tick. Pass null to clear when the world goes away.
     */
    setFloor(track, minY) {
        track.floorY = minY ?? Math.min(0, track.statement.areaMin.y);
        // Static voices never enter the spatial branch — lift them here
        const isStatic = !track.pinned && track.statement.wanderType === WanderType.None;
        if (isStatic && track.position.y < track.floorY) {
            track.position.y = track.floorY;
            this.writePannerPosition(track, track.apparent ?? track.position, this.host.now());
        }
    }
    /**
     * The one place a voice's panner position is written from a scene point.
     * Records the TRUE point (`_heard`, what the reflections mirror and what
     * the scene reports) and writes the MONITORED one — the same point unless
     * the elevation lens is on (`setMonitorElevationGain`).
     */
    writePannerPosition(track, p, ctxTime, immediate = false) {
        const h = track._heard;
        h.x = p.x;
        h.y = p.y;
        h.z = p.z;
        if (track.virtual)
            return;
        const w = this.elevationGain === 1 ? p : exaggerateElevation(p, this.host.listenerPos(), this.elevationGain, this.warpScratch);
        if (immediate) {
            for (const param of [track.pannerNode.positionX, track.pannerNode.positionY, track.pannerNode.positionZ])
                param.cancelScheduledValues(ctxTime);
            track.pannerNode.positionX.setValueAtTime(w.x, ctxTime);
            track.pannerNode.positionY.setValueAtTime(w.y, ctxTime);
            track.pannerNode.positionZ.setValueAtTime(w.z, ctxTime);
            return;
        }
        track.pannerNode.positionX.setTargetAtTime(w.x, ctxTime, 0.020);
        track.pannerNode.positionY.setTargetAtTime(w.y, ctxTime, 0.020);
        track.pannerNode.positionZ.setTargetAtTime(w.z, ctxTime, 0.020);
    }
    /** Insert the lowpass + gain pair between the panner and the master the first time a voice is muffled. */
    ensureMuffleChain(track) {
        if (track.occlusionFilter)
            return;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = OCCLUSION_OPEN_HZ;
        filter.Q.value = 0.0001;
        const gain = this.ctx.createGain();
        try {
            track.pannerNode.disconnect(this.host.masterGain);
        }
        catch { /* already rerouted */ }
        track.pannerNode.connect(filter);
        // The reflections' image panners are heard through the same wall.
        for (const leg of [track.floorLeg, track.ceilingLeg]) {
            if (!leg?.imagePanner)
                continue;
            try {
                leg.imagePanner.disconnect(this.host.masterGain);
            }
            catch { /* ok */ }
            leg.imagePanner.connect(filter);
        }
        filter.connect(gain);
        gain.connect(this.host.masterGain);
        track.occlusionFilter = filter;
        track.occlusionGainNode = gain;
    }
    /**
     * Drive the muffle chain from the current occlusion + listener distance.
     * Zone gating rides the same chain: geometry occlusion and the scene
     * state's isolation compose via max, and a strict-zone mute takes the
     * level to zero (crossfade length = the caller's smoothing).
     */
    applyMuffle(track, ctxTime, smoothing, immediate = false) {
        if (track.virtual)
            return;
        sampleSourceExtent(track, this.host.listenerPos(), this.extentScratch);
        const dist = this.extentScratch.surfaceDistM;
        const occRaw = track._zoneOcclusion > track.occlusion ? track._zoneOcclusion : track.occlusion;
        // Foliage on the path (procedural world) muffles the top end like a soft
        // obstacle — it never cuts as deep as a wall (FOLIAGE_MAX_OCCLUSION).
        const occ = occRaw > track._foliage ? occRaw : track._foliage;
        const cutoff = combinedCutoffHz(occ, dist * this.airScale);
        // Level: geometry occlusion (grazing law) × enclosure isolation (wall
        // law) — a state boundary cuts far deeper than a passing obstacle.
        const occForGain = track.occlusion > track._foliage * 0.6 ? track.occlusion : track._foliage * 0.6;
        // The air/water interface between the listener's medium and the
        // source's (WorldFields immersion): ~30 dB across, unity within one.
        track._lastMediumSub = this.submergedNow;
        const g = track._zoneMuted ? 0 : occlusionGain(occForGain) * zoneIsolationGain(track._zoneOcclusion) * surfaceTransmissionGain(this.submergedNow, track._immersion);
        // Filter creation is deferred until something actually muffles this voice
        if (!track.occlusionFilter && cutoff >= OCCLUSION_OPEN_HZ * 0.975 && g > 0.995)
            return;
        this.ensureMuffleChain(track);
        // Skip writes when effectively unchanged (~1% cutoff, 0.005 gain) — this
        // runs every spatial tick for far/occluded voices. NaN caches (fresh
        // track) fail the < comparison and fall through to the write.
        if (immediate || !(Math.abs(cutoff - track._lastCutoffHz) < track._lastCutoffHz * 0.01)) {
            track._lastCutoffHz = cutoff;
            if (immediate)
                track.occlusionFilter.frequency.setValueAtTime(cutoff, ctxTime);
            else
                track.occlusionFilter.frequency.setTargetAtTime(cutoff, ctxTime, smoothing);
        }
        if (immediate || !(Math.abs(g - track._lastOccGain) < 0.005)) {
            track._lastOccGain = g;
            if (immediate)
                track.occlusionGainNode.gain.setValueAtTime(g, ctxTime);
            else
                track.occlusionGainNode.gain.setTargetAtTime(g, ctxTime, smoothing);
        }
    }
    // ── Distance ──────────────────────────────────────────────────────
    /**
     * Per-spatial-tick distance acoustics: air absorption (highs fall off with
     * distance) and Doppler (radial motion bends pitch). Physically lawful and
     * deliberately subtle — clamped to about a semitone, transparent inside
     * AIR_ABSORPTION_REF_M.
     */
    updateDistance(track, ctxTime, dtSec) {
        // Virtual loops retain physical history for pitch/distance controls and
        // phase integration; unresolved buffers still have no propagation history.
        if (!track.sourceNode && !track.virtual)
            return;
        // Beds have no location: no air absorption, no Doppler — roomtone does
        // not whoosh when the listener runs.
        if (track._bed)
            return;
        const lp = this.host.listenerPos();
        const dx = track.position.x - lp.x;
        const dy = track.position.y - lp.y;
        const dz = track.position.z - lp.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Air absorption — reuse the occlusion muffle chain (min of both cutoffs).
        // Only touch nodes when the voice is far enough for it to matter, or a
        // chain already exists (then keep it tracking, including back to open).
        sampleSourceExtent(track, lp, this.extentScratch);
        if (this.extentScratch.surfaceDistM > AIR_ABSORPTION_REF_M || track.occlusionFilter) {
            this.applyMuffle(track, ctxTime, 0.15);
        }
        // Doppler — needs a previous distance sample and a sane tick delta
        if (track._lastDistM >= 0 && dtSec > 0.001) {
            const radialV = (dist - track._lastDistM) / dtSec; // + = receding
            track._radialV = radialV;
            // `doppler <strength>` scales the physical shift (0 disables it)
            // A digital program owns its source clock. Doppler implemented by
            // per-emitter source-rate changes would permanently desynchronize it.
            // Retarded-time propagation is not implemented for programs yet.
            const target = track.statement.programId ? 1 : dopplerRatioFor(radialV * track.statement.dopplerStrength);
            track.doppler += (target - track.doppler) * 0.3;
            const active = Math.abs(track.doppler - 1) > 0.003;
            // Voices with pitch modulation/bindings fold doppler in every frame already
            const modulated = track.statement.pitchInterpolation || track.statement.groupPitchModulation
                || track.statement.pitchFollow;
            if (!modulated && track.sourceNode) {
                if (active) {
                    track.sourceNode.playbackRate.setTargetAtTime(track.pitch * track.doppler, ctxTime, 0.05);
                    track._dopplerActive = true;
                }
                else if (track._dopplerActive) {
                    track.sourceNode.playbackRate.setTargetAtTime(track.pitch, ctxTime, 0.05);
                    track._dopplerActive = false;
                    track.doppler = 1;
                }
            }
        }
        track._lastDistM = dist;
    }
    /**
     * Foliage attenuation: the length of the listener→voice path that runs
     * through tree crowns (chords through crown spheres, height-checked)
     * becomes a soft occlusion — ISO 9613-2 gives foliage ~0.1 dB/m in the top
     * octave, so FOLIAGE_FULL_M of canopy reaches FOLIAGE_MAX_OCCLUSION and
     * never the wall law.
     */
    updateFoliage(track, ctxTime) {
        const w = this.host.world();
        if (!w)
            return;
        const lp = this.host.listenerPos();
        const lx = lp.x, ly = lp.y, lz = lp.z;
        const sx = track.position.x, sy = track.position.y, sz = track.position.z;
        const dx = sx - lx, dz = sz - lz;
        const len2 = dx * dx + dz * dz;
        let through = 0;
        if (len2 > 1e-4) {
            for (const o of w.objects) {
                // Porous bodies (foliage, hedges, scaffolding) — solid ones are the collider's job.
                if (o.porous < 0.3)
                    continue;
                const r = o.radiusM;
                const ox = o.position.x - lx, oz = o.position.z - lz;
                const t = (ox * dx + oz * dz) / len2;
                if (t < 0 || t > 1)
                    continue;
                const px = t * dx - ox, pz = t * dz - oz;
                const d2 = px * px + pz * pz;
                if (d2 >= r * r)
                    continue;
                // The path's height where it passes must be inside the body's band.
                const y = ly + (sy - ly) * t;
                const lo = o.position.y + o.bodyBaseM;
                const hi = o.position.y + o.heightM;
                if (y < lo || y > hi)
                    continue;
                through += 2 * Math.sqrt(r * r - d2) * o.porous;
            }
        }
        const f = Math.min(FOLIAGE_MAX_OCCLUSION, (through / FOLIAGE_FULL_M) * FOLIAGE_MAX_OCCLUSION);
        if (Math.abs(f - track._foliage) < 0.01)
            return;
        track._foliage = f;
        this.applyMuffle(track, ctxTime, 0.25);
    }
    /**
     * Measure how far the voice's source sits under a liquid surface (the
     * world's `submerged` field at its position) and recompose the muffle
     * chain when that — or the listener's own submersion since this voice
     * last composed it — has moved: `applyMuffle` folds the interface loss in.
     */
    updateImmersion(track, ctxTime) {
        const fp = this.host.fieldProvider();
        let im = 0;
        if (fp) {
            const s = this.fieldScratch;
            fp.sampleInto(track.position.x, track.position.y, track.position.z, s);
            im = s.submerged;
        }
        if (Math.abs(im - track._immersion) < 0.01 && track._lastMediumSub === this.submergedNow)
            return;
        track._immersion = im;
        this.applyMuffle(track, ctxTime, 0.25);
    }
    // ── Elevation cues (spatial/ElevationCues.ts) ──
    /**
     * A headphone LENS: multiply every rendered elevation angle by `gain`
     * (2 reads a +20° bird as +40°), keeping distance and azimuth. The scene,
     * the trace and every export keep their true positions — only the panner
     * writes change. Re-aims every playing voice at once.
     */
    setMonitorElevationGain(gain) {
        const g = Number.isFinite(gain) && gain > 0 ? gain : 1;
        if (g === this.elevationGain)
            return;
        this.elevationGain = g;
        const t = this.host.now();
        for (const track of this.host.tracks())
            this.writePannerPosition(track, track._heard, t);
    }
    get monitorElevationGain() { return this.elevationGain; }
    /** Switch the floor / ceiling reflection legs on or off (legs go silent, the direct trim returns to 1). */
    setGroundReflection(enabled) {
        if (enabled === this.reflectionLegs)
            return;
        this.reflectionLegs = enabled;
        if (enabled)
            return; // the next spatial tick re-drives every leg
        const t = this.host.now();
        const silent = { delayS: 0, gain: 0 };
        for (const track of this.host.tracks()) {
            if (track.virtual)
                continue;
            if (track.floorLeg)
                applyReflectionLeg(track.floorLeg, silent, DEFAULT_GROUND_SURFACE, t);
            if (track.ceilingLeg)
                applyReflectionLeg(track.ceilingLeg, silent, DEFAULT_GROUND_SURFACE, t);
            this.writeDirectTrim(track, 1, t);
        }
    }
    get groundReflection() { return this.reflectionLegs; }
    writeDirectTrim(track, trim, ctxTime, immediate = false) {
        if (track.virtual || (!immediate && Math.abs(trim - track._lastDirectTrim) < 0.003))
            return;
        track._lastDirectTrim = trim;
        if (immediate)
            track.directTrim.gain.setValueAtTime(trim, ctxTime);
        else
            track.directTrim.gain.setTargetAtTime(trim, ctxTime, 0.04);
    }
    /**
     * Per spatial tick: the floor reflection under the heard point (the world's
     * terrain floor and ground material where there is one, the scene plane
     * otherwise) and, with the listener and the source inside the world's
     * interior, the ceiling reflection too. A voice heard through an aperture
     * (`apparent` set) has no clean image path — its legs stay silent.
     */
    updateElevationCues(track, stmt, ctxTime, immediate = false) {
        if (track.virtual)
            return;
        const leg = track.floorLeg;
        if (!leg)
            return;
        // Un-placed voices never enter the position branch; with the lens on,
        // the listener's movement still changes their monitored angle.
        if (this.elevationGain !== 1 && stmt.wanderType === WanderType.None && !track.pinned && !stmt.field) {
            this.writePannerPosition(track, track._heard, ctxTime);
        }
        const p = this.reflScratch;
        const lp = this.host.listenerPos();
        const heard = track._heard;
        const rolloff = distanceRolloff(stmt.line, stmt.distanceProfile);
        const world = this.host.world();
        const it = world?.interior;
        const inside = !!it && this.host.listenerInsideInterior()
            && Math.abs(heard.x) <= it.sizeM[0] / 2 + 0.25 && Math.abs(heard.z) <= it.sizeM[2] / 2 + 0.25
            && heard.y <= it.sizeM[1] + 0.3 && heard.y >= -0.3;
        let floorSurface = DEFAULT_GROUND_SURFACE;
        if (inside && it)
            floorSurface = surfaceForLabel(it.floor);
        else if (world && this.host.hostingEnabled())
            floorSurface = surfaceForLabel(materialAt(world, heard.x, heard.z));
        let total = 0;
        if (!this.reflectionLegs || track.apparent) {
            p.delayS = 0;
            p.gain = 0;
        }
        else {
            groundReflection(heard, lp, track.floorY, floorSurface, p, false, rolloff, !!leg.imagePanner);
            if (leg.imagePanner)
                this.aimImagePanner(leg.imagePanner, imagePoint(heard, track.floorY, this.imageScratch), ctxTime, immediate);
        }
        applyReflectionLeg(leg, p, floorSurface, ctxTime, 0.02, immediate);
        total += p.gain;
        if (inside && it && this.reflectionLegs && !track.apparent) {
            if (!track.ceilingLeg) {
                const to = track.occlusionFilter ?? this.host.masterGain;
                track.ceilingLeg = createReflectionLeg(this.ctx, track.directTrim, to, createImagePanner(this.ctx, track.pannerNode));
            }
            const ceilingSurface = surfaceForLabel(it.ceiling);
            groundReflection(heard, lp, it.sizeM[1], ceilingSurface, p, true, rolloff, !!track.ceilingLeg.imagePanner);
            if (track.ceilingLeg.imagePanner)
                this.aimImagePanner(track.ceilingLeg.imagePanner, imagePoint(heard, it.sizeM[1], this.imageScratch), ctxTime, immediate);
            applyReflectionLeg(track.ceilingLeg, p, ceilingSurface, ctxTime, 0.02, immediate);
            total += p.gain;
        }
        else if (track.ceilingLeg) {
            p.delayS = 0;
            p.gain = 0;
            applyReflectionLeg(track.ceilingLeg, p, DEFAULT_GROUND_SURFACE, ctxTime, 0.02, immediate);
        }
        this.writeDirectTrim(track, directTrimFor(total), ctxTime, immediate);
    }
    /** Move a reflection's image-point panner (smoothed like the direct panner). */
    aimImagePanner(p, at, ctxTime, immediate = false) {
        if (immediate) {
            p.positionX.setValueAtTime(at.x, ctxTime);
            p.positionY.setValueAtTime(at.y, ctxTime);
            p.positionZ.setValueAtTime(at.z, ctxTime);
            return;
        }
        p.positionX.setTargetAtTime(at.x, ctxTime, 0.020);
        p.positionY.setTargetAtTime(at.y, ctxTime, 0.020);
        p.positionZ.setTargetAtTime(at.z, ctxTime, 0.020);
    }
    disposeElevationLegs(track) {
        try {
            track.directTrim.disconnect();
        }
        catch { /* ok */ }
        if (track.floorLeg) {
            disposeReflectionLeg(track.floorLeg);
            track.floorLeg = null;
        }
        if (track.ceilingLeg) {
            disposeReflectionLeg(track.ceilingLeg);
            track.ceilingLeg = null;
        }
    }
    // ── Medium — what the listener is standing in ──
    get submerged() { return this.submergedNow; }
    /** HF scale on the air-absorption distance for the listener's current medium. */
    get airAbsorptionScale() { return this.airScale; }
    /** The medium stage once built (tests read it); null in open air until first submersion. */
    get mediumStage() { return this.medium; }
    /** Where the master gain feeds: the medium stage once it exists, else the limiter. */
    masterOut() {
        return this.medium ? this.medium.lowpass : this.host.limiter;
    }
    /**
     * The medium stage on the master chain (spatial/WorldAcoustics "Medium"):
     * built on first use, between the master gain and the limiter — a lowpass
     * (open air → 500 Hz), the level cut, the slow delay warble that actually
     * reads as "under", and a stereo → mono collapse (interaural cues stop
     * working under water). Step into a river and every sound changes at once,
     * because the medium is the LISTENER's, not any voice's.
     */
    ensureMedium() {
        if (this.medium)
            return this.medium;
        const ctx = this.ctx;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 20000;
        lowpass.Q.value = 0.0001;
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = MEDIUM_WARBLE_HZ;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 0;
        lfo.connect(lfoDepth);
        lfoDepth.connect(delay.delayTime);
        try {
            lfo.start();
        }
        catch { /* already started / null context */ }
        const level = ctx.createGain();
        level.gain.value = 1;
        const stereo = ctx.createGain();
        stereo.gain.value = 1;
        const mono = ctx.createGain();
        mono.gain.value = 0;
        const splitter = ctx.createChannelSplitter(2);
        const sum = ctx.createGain();
        sum.gain.value = 0.5;
        const merger = ctx.createChannelMerger(2);
        // Re-route the master through the stage — only if it is connected now;
        // a stopped engine reconnects through masterOut() on play().
        const { masterGain, limiter } = this.host;
        if (this.host.masterConnected()) {
            try {
                masterGain.disconnect(limiter);
            }
            catch { /* ok */ }
            masterGain.connect(lowpass);
        }
        lowpass.connect(delay);
        delay.connect(level);
        level.connect(stereo);
        stereo.connect(limiter);
        level.connect(splitter);
        splitter.connect(sum, 0);
        splitter.connect(sum, 1);
        sum.connect(merger, 0, 0);
        sum.connect(merger, 0, 1);
        merger.connect(mono);
        mono.connect(limiter);
        this.medium = { lowpass, delay, lfo, lfoDepth, level, stereo, mono, splitter, sum, merger };
        return this.medium;
    }
    /**
     * Set how far under a fluid surface the listener's head is (0 air → 1
     * fully under). Published as the open signal `submerged` so a script can
     * `volume follow submerged …` (an underwater bed, a muffled shore).
     */
    setSubmerged(submerged01) {
        const s = clamp01(submerged01);
        if (Math.abs(s - this.submergedNow) < 0.005 && (s === 0 || this.medium))
            return;
        this.submergedNow = s;
        this.host.setSignal('submerged', s);
        this.airScale = airAbsorptionScale(s);
        if (s === 0 && !this.medium)
            return;
        const m = this.ensureMedium();
        const t = this.host.now(), tc = MEDIUM_XFADE_S / 3;
        m.lowpass.frequency.setTargetAtTime(mediumCutoffHz(s), t, tc);
        m.level.gain.setTargetAtTime(mediumGain(s), t, tc);
        m.delay.delayTime.setTargetAtTime(s > 0 ? MEDIUM_WARBLE_BASE_S : 0, t, tc);
        m.lfoDepth.gain.setTargetAtTime(mediumWarbleDepthS(s), t, tc);
        const collapse = mediumSpatialCollapse(s);
        m.stereo.gain.setTargetAtTime(Math.cos(collapse * Math.PI / 2), t, tc);
        m.mono.gain.setTargetAtTime(Math.sin(collapse * Math.PI / 2), t, tc);
    }
}
//# sourceMappingURL=Acoustics.js.map