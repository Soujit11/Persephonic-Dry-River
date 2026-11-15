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
import { WanderType, isTrajectoryWanderType } from '../core/Statement.js';
import { pathSeedsFor, resolveTrajectory, wanderPositionInto, trajectoryPositionInto } from '../spatial/SpatialPath.js';
/**
 * Scene frame → Web Audio playback frame. A pure reflection (z → −z): scene
 * "ahead" (+Z) becomes Web Audio front (−Z) while right (+X) and up (+Y) keep
 * their meaning. Distances are unchanged.
 */
export function toPlaybackFrame(p) {
    return { x: p.x, y: p.y, z: -p.z };
}
/** Walk/fly wander: sum-of-sines path derived entirely from the seed. */
export function computeWanderPosition(stmt, elapsed, wanderSpeed, seed) {
    const out = { x: 0, y: 0, z: 0 };
    wanderPositionInto(stmt, elapsed, wanderSpeed, pathSeedsFor(seed), out);
    return out;
}
/** Spiral/orbit/lorenz/custom trajectory position at `elapsed` seconds. */
export function computeTrajectoryPosition(stmt, elapsed, seed, wanderHz) {
    const trajectory = resolveTrajectory(stmt);
    if (!trajectory)
        return computeStaticPosition(stmt);
    // A compiled `path` starts at its first waypoint and states its exact rate
    // — mirrors the live engine's trajectoryPhaseZero / trajectoryCycleHz.
    const phase = stmt.trajectoryPhaseZero ? 0 : (seed / 1000) % 1;
    const hz = stmt.trajectoryCycleHz ?? wanderHz;
    const out = { x: 0, y: 0, z: 0 };
    trajectoryPositionInto(stmt, trajectory, elapsed, hz, phase, pathSeedsFor(seed), out);
    return out;
}
/** Resting position for static voices (None → box center, Fixed → areaMin). */
export function computeStaticPosition(stmt) {
    if (stmt.wanderType === WanderType.Fixed) {
        return { x: stmt.areaMin.x, y: stmt.areaMin.y, z: stmt.areaMin.z };
    }
    return {
        x: (stmt.areaMin.x + stmt.areaMax.x) / 2,
        y: (stmt.areaMin.y + stmt.areaMax.y) / 2,
        z: (stmt.areaMin.z + stmt.areaMax.z) / 2,
    };
}
/** Number of frames a trace holds. */
export function traceFrameCount(trace) {
    return trace.gain.length;
}
/**
 * Fractional frame index into a trace for `elapsed` seconds after the
 * voice's start, clamped to the trace's span. The trace's first frame is
 * the first frame boundary at or after the start, so an elapsed of 0 can
 * sit slightly before it (held at frame 0).
 */
function traceIndex(v, trace, elapsed) {
    const n = traceFrameCount(trace);
    if (n <= 1)
        return 0;
    if (trace.times?.length === n) {
        const times = trace.times, t = v.startTime + elapsed;
        if (t <= times[0])
            return 0;
        if (t >= times[n - 1])
            return n - 1;
        let low = 0, high = n - 1;
        while (high - low > 1) {
            const mid = (low + high) >>> 1;
            if (times[mid] <= t)
                low = mid;
            else
                high = mid;
        }
        return low + (t - times[low]) / (times[high] - times[low]);
    }
    const f = (v.startTime + elapsed) * trace.fps - trace.frame0;
    return f < 0 ? 0 : f > n - 1 ? n - 1 : f;
}
/** Linear interpolation of one trace channel at `elapsed` seconds after the voice's start. */
export function traceValueAt(v, channel, elapsed) {
    const trace = v.trace;
    const n = channel.length;
    if (n === 0)
        return 0;
    const f = traceIndex(v, trace, elapsed);
    const i = Math.floor(f);
    if (i >= n - 1)
        return channel[n - 1];
    const u = f - i;
    return channel[i] + (channel[i + 1] - channel[i]) * u;
}
/** Interpolated scene-frame position from a trace at `elapsed` seconds after the voice's start. */
export function tracePositionAt(v, elapsed) {
    const trace = v.trace;
    const p = trace.positions;
    const n = traceFrameCount(trace);
    if (n === 0)
        return { x: 0, y: 0, z: 0 };
    const f = traceIndex(v, trace, elapsed);
    const i = Math.floor(f);
    if (i >= n - 1) {
        const k = (n - 1) * 3;
        return { x: p[k], y: p[k + 1], z: p[k + 2] };
    }
    const u = f - i;
    const a = i * 3, b = a + 3;
    return {
        x: p[a] + (p[b] - p[a]) * u,
        y: p[a + 1] + (p[b + 1] - p[a + 1]) * u,
        z: p[a + 2] + (p[b + 2] - p[a + 2]) * u,
    };
}
/** Position of a voice `elapsed` seconds after its start, in the scene frame. */
export function positionAt(v, elapsed) {
    // A traced voice already carries the engine's own positions, scatter and all.
    if (v.trace)
        return tracePositionAt(v, elapsed);
    const { stmt } = v;
    let p;
    if (isTrajectoryWanderType(stmt.wanderType)) {
        p = computeTrajectoryPosition(stmt, elapsed, v.motionSeed, v.wanderHz);
    }
    else if (stmt.wanderType === WanderType.Walk || stmt.wanderType === WanderType.Fly) {
        const wanderSpeed = v.wanderHz * 0.01 * 2 * Math.PI;
        p = computeWanderPosition(stmt, elapsed, wanderSpeed, v.motionSeed);
    }
    else {
        p = computeStaticPosition(stmt);
    }
    const sc = v.scatter;
    return sc ? { x: p.x + sc.x, y: p.y + sc.y, z: p.z + sc.z } : p;
}
/** True when the voice's position never changes over its lifetime (seed-driven motion only). */
export function isStaticVoice(stmt) {
    if (isTrajectoryWanderType(stmt.wanderType))
        return false;
    return stmt.wanderType !== WanderType.Walk && stmt.wanderType !== WanderType.Fly;
}
/** Position tolerance below which a traced voice counts as motionless, metres. */
const TRACE_STATIC_EPS_M = 1e-3;
/**
 * True when the voice's position never changes: for a traced voice, when
 * every frame sits within a millimetre of the first (a hosted loop on its
 * perch); for a seed-driven one, when its motion type is static.
 */
export function isStaticMotion(v) {
    const trace = v.trace;
    if (!trace)
        return isStaticVoice(v.stmt);
    const p = trace.positions;
    const n = traceFrameCount(trace);
    for (let i = 1; i < n; i++) {
        const k = i * 3;
        if (Math.abs(p[k] - p[0]) > TRACE_STATIC_EPS_M || Math.abs(p[k + 1] - p[1]) > TRACE_STATIC_EPS_M || Math.abs(p[k + 2] - p[2]) > TRACE_STATIC_EPS_M)
            return false;
    }
    return true;
}
/**
 * Sample a voice's full position timeline at `fps` (default 30 — the same
 * cadence the audio render bakes at). Static voices return a single point.
 */
export function sampleVoicePositionTimeline(v, fps = 30) {
    if (isStaticMotion(v)) {
        const p = positionAt(v, 0);
        return [{ t: 0, ...p }];
    }
    const step = 1 / fps;
    const points = [];
    for (let elapsed = 0; elapsed < v.voiceDuration; elapsed += step) {
        points.push({ t: elapsed, ...positionAt(v, elapsed) });
    }
    return points;
}
//# sourceMappingURL=VoicePositions.js.map