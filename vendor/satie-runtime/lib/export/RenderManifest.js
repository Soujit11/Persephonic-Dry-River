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
import { isTrajectoryWanderType } from '../core/Statement.js';
import { SATIE_SOFTWARE } from './Attribution.js';
import { sampleScatter } from '../spatial/Scatter.js';
import { pathFor } from '../core/SatieParser.js';
import { mapSpeed, mapTrajectorySpeed } from '../dsp/DSPChain.js';
import { hashSeed, mulberry32 } from '../core/Random.js';
import { deriveScriptRoom, deriveScriptRoomsByName } from '../spatial/ScriptRoom.js';
/**
 * Derive the render's rooms from the parsed scene — the same
 * `deriveScriptRoom` / `deriveScriptRoomsByName` the engine runs in
 * `loadScript` — plus the world room the caller knows about.
 */
export function resolveRenderRooms(scene, world) {
    return {
        scene: deriveScriptRoom(scene.rooms, scene.materials),
        byName: deriveScriptRoomsByName(scene.rooms, scene.materials),
        world: world ?? null,
    };
}
/**
 * The room a voice WITHOUT its own `reverb` sends into, or null when there is
 * none (silent send, as live). Mirrors `SatieEngine.createVoice`: a named
 * room the statement is `in` > the scene's first room > the world room. A
 * voice with `reverbParams` never reaches this — the caller samples those.
 */
export function roomForVoice(stmt, rooms) {
    if (!rooms)
        return null;
    const named = stmt.roomName ? rooms.byName.get(stmt.roomName) ?? null : null;
    const script = named ?? rooms.scene;
    if (script)
        return { roomSize: script.size, damping: script.damping, wet: script.wet, scripted: true };
    if (rooms.world) {
        return { roomSize: rooms.world.size01, damping: rooms.world.damping01, wet: rooms.world.wet01, scripted: false };
    }
    return null;
}
/**
 * Start times for one voice copy: the sampled first start plus `every`-spaced
 * retriggers (oneshots only — the live engine never retriggers loops). The
 * interval is re-sampled per repetition, matching live scheduling.
 * Exported for tests (re-exported by OfflineRenderer).
 */
export function computeStartTimes(stmt, firstStart, totalDuration, rng = Math.random) {
    const times = [firstStart];
    if (stmt.kind === 'oneshot' && !stmt.every.isNull) {
        let interval = stmt.every.sample(rng);
        let t = firstStart + interval;
        while (interval > 0 && t < totalDuration) {
            times.push(t);
            interval = stmt.every.sample(rng);
            t += interval;
        }
    }
    return times;
}
/** Exported for tests (re-exported by OfflineRenderer). */
export function computeVoiceDuration(stmt, bufferDuration, remainingTime, pitch, rng = Math.random) {
    if (!stmt.duration.isNull) {
        return Math.min(stmt.duration.sample(rng), remainingTime);
    }
    if (!stmt.end.isNull) {
        return Math.min(stmt.end.sample(rng) - stmt.start.sample(rng), remainingTime);
    }
    // Loops and persistent voices play until end of composition
    if (stmt.kind === 'loop' || stmt.persistent) {
        return remainingTime;
    }
    // playbackRate stretches wall-clock playing time: a one-shot at pitch 0.5
    // needs bufferDuration / 0.5 seconds to finish.
    const rate = pitch > 0 ? pitch : 1;
    return Math.min(bufferDuration / rate, remainingTime);
}
/**
 * Buffer offset a voice starts playing from. Mirrors the live engine:
 * `randomstart` wins; otherwise count-multiplied voices sharing a buffer get
 * a tiny phase stagger (≤ 30ms, ≤ 5% of duration, buffers > 1s only) so
 * coherent copies don't comb-filter. Exported for tests.
 */
export function computeStartOffset(stmt, voiceIdx, bufferDuration, rng = Math.random) {
    if (stmt.randomStart)
        return rng() * bufferDuration;
    if (voiceIdx > 0 && stmt.count > 1 && bufferDuration > 1) {
        const maxStagger = Math.min(bufferDuration * 0.05, 0.03);
        return (voiceIdx / stmt.count) * maxStagger;
    }
    return 0;
}
function resolveDuration(durations, clip) {
    return durations.get(pathFor(clip)) ?? durations.get(clip);
}
/**
 * Sample every voice the render will schedule. Sampling order per voice is
 * fixed (start → every-repeats → volume → pitch → motion seed → speed →
 * duration → fades → offset → sub-seed) so a given RNG stream always yields
 * the same manifest.
 *
 * @param bufferDurations decoded buffer durations in seconds, keyed by clip
 *   name (raw or pathFor'd). Statements whose clip is missing are skipped and
 *   reported in `missingClips`.
 */
/** Ceiling on `spread`, seconds — mirrors `SatieEngine.SPREAD_MAX_S`. */
const SPREAD_MAX_S = 60;
export function buildRenderManifest(statements, duration, rng, bufferDurations, trace) {
    if (trace)
        return buildTraceManifest(trace, duration);
    const voices = [];
    const missingClips = [];
    const baseSeed = Math.floor(rng() * 0xffffffff);
    for (let stmtIndex = 0; stmtIndex < statements.length; stmtIndex++) {
        const stmt = statements[stmtIndex];
        if (stmt.mute)
            continue;
        // Trigger voices (`on`/`when`) fire from a live listener's events — an
        // offline render has no player, so they are silent by design (not
        // "missing"; the export panel documents this).
        if (stmt.kind === 'trigger')
            continue;
        const bufferDuration = resolveDuration(bufferDurations, stmt.clip);
        if (bufferDuration === undefined) {
            missingClips.push(stmt.clip);
            continue;
        }
        for (let c = 0; c < stmt.count; c++) {
            const first = stmt.start.sample(rng);
            const starts = computeStartTimes(stmt, first, duration, rng);
            for (let r = 0; r < starts.length; r++) {
                // `spread` — this instance's start delay. Drawn only when the
                // property is present, so adding it to one voice cannot shift the
                // sampled values of a seeded render's other voices.
                const spreadS = stmt.spread.isNull
                    ? 0
                    : Math.max(0, Math.min(SPREAD_MAX_S, stmt.spread.sample(rng)));
                const t = starts[r] + spreadS;
                if (t >= duration)
                    continue;
                const volume = stmt.volume.sample(rng);
                const pitch = stmt.pitch.sample(rng);
                const motionSeed = rng() * 1000;
                const wanderHz = isTrajectoryWanderType(stmt.wanderType)
                    ? mapTrajectorySpeed(stmt.wanderHz.sample(rng))
                    : mapSpeed(stmt.wanderHz.sample(rng));
                const voiceDuration = computeVoiceDuration(stmt, bufferDuration, duration - t, pitch, rng);
                const fadeIn = !stmt.fadeIn.isNull ? stmt.fadeIn.sample(rng) : 0;
                const fadeOut = !stmt.fadeOut.isNull ? stmt.fadeOut.sample(rng) : 0;
                const startOffset = computeStartOffset(stmt, c, bufferDuration, rng);
                // Drawn per REPETITION, which is the live engine's rule: a loop has
                // one repetition and keeps its point, a one-shot gets a new one on
                // every fire. Hosted voices never scatter (a body places them).
                const scatter = stmt.scatter && !stmt.hostRef ? sampleScatter(stmt.scatter, rng) : null;
                voices.push({
                    stmtIndex,
                    copyIndex: c,
                    repIndex: r,
                    stmt,
                    startTime: t,
                    spawnTime: starts[0],
                    startOffset,
                    voiceDuration,
                    volume,
                    pitch,
                    fadeIn,
                    fadeOut,
                    motionSeed,
                    wanderHz,
                    voiceRngSeed: hashSeed(baseSeed, stmtIndex, c, r),
                    modRngSeed: hashSeed(baseSeed, stmtIndex, c, 0),
                    scatter,
                });
            }
        }
    }
    return { voices, duration, missingClips, producedBy: SATIE_SOFTWARE };
}
/**
 * The trace-driven manifest: one RenderedVoice per simulated source, in the
 * order the engine started them. Nothing is sampled here — start, end, take,
 * motion, level, rate and muffle are the engine's own — except the
 * seed-derived sub-streams the render functions still draw from (DSP
 * interpolation cycles, reverb params, extent shape, random start offsets),
 * which hash from the trace's seed and the source index so a seeded
 * simulation stays a seeded render.
 */
export function buildTraceManifest(trace, duration) {
    const voices = [];
    const reps = new Map();
    const spawnAt = new Map();
    for (let k = 0; k < trace.sources.length; k++) {
        const src = trace.sources[k];
        if (src.t0 >= duration)
            continue;
        const end = Math.min(src.t1, duration);
        const voiceDuration = end - src.t0;
        if (!(voiceDuration > 0))
            continue;
        const rep = reps.get(src.key) ?? 0;
        reps.set(src.key, rep + 1);
        if (!spawnAt.has(src.key))
            spawnAt.set(src.key, src.t0);
        const voiceRngSeed = hashSeed(trace.seed, k);
        const startOffset = src.startOffset ?? computeStartOffset(src.stmt, src.voiceIndex, src.bufferDuration, mulberry32(voiceRngSeed ^ 0x0ff5));
        const tr = src.trace;
        voices.push({
            stmtIndex: src.statementIndex,
            copyIndex: src.voiceIndex,
            repIndex: rep,
            stmt: src.stmt,
            startTime: src.t0,
            spawnTime: spawnAt.get(src.key),
            startOffset,
            voiceDuration,
            volume: tr.gain.length ? tr.gain[0] : 1,
            pitch: tr.rate.length ? tr.rate[0] : 1,
            fadeIn: src.fadeIn,
            fadeOut: src.fadeOut,
            motionSeed: 0,
            wanderHz: 0,
            voiceRngSeed,
            modRngSeed: hashSeed(trace.seed, src.statementIndex, src.voiceIndex, 0),
            trace: tr,
            clip: src.clip,
            key: src.key,
            sourceId: src.sourceId, objectId: src.objectId, objectInstanceId: src.objectInstanceId,
            entity: src.entity || undefined,
            instance: src.entity ? src.instance : undefined,
            take: src.take,
        });
    }
    return {
        voices, duration, missingClips: trace.missingClips.slice(),
        simulated: true, seed: trace.seed, producedBy: SATIE_SOFTWARE,
        spawns: trace.spawns, retires: trace.retires, events: trace.events, behaviors: trace.behaviors,
    };
}
//# sourceMappingURL=RenderManifest.js.map