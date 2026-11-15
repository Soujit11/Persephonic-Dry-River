/**
 * Authored waypoint paths — `path <name>` blocks (scene-graph spec §6).
 *
 * A path is 5–15 `waypoint x y z [t]` lines a hand can grab: the curve runs
 * THROUGH every waypoint (centripetal Catmull-Rom — provably no cusps or
 * self-intersection between unevenly spaced points, which hand-placed
 * waypoints always are), and playback traverses it by ARC LENGTH, never by
 * parameter — parameter-space speed wobble is audible in a spatial-audio
 * tool, not just visible. The compiled result is the engine's existing
 * normalized-LUT trajectory form, so live playback and every export path
 * consume a drawn path through machinery that already exists.
 *
 * No tangent handles, by design: centripetal Catmull-Rom is "auto mode
 * always" — the right ceiling for a line-per-waypoint plaintext format.
 */
/** Default traversal pace when the path states neither cycle nor speed. */
const DEFAULT_SPEED_MS = 1.4; // a walking pace
/** LUT resolution — lerped at runtime, so this is plenty for hand paths. */
const PATH_LUT_POINTS = 1024;
function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
/**
 * Centripetal Catmull-Rom between p1 and p2 (p0/p3 are neighbours), at
 * u ∈ [0,1]. Standard Barry–Goldman pyramid with alpha = 0.5 knots.
 */
function catmullRom(p0, p1, p2, p3, u, out) {
    const alpha = 0.5;
    const t0 = 0;
    const t1 = t0 + Math.max(Math.pow(dist(p0, p1), alpha), 1e-6);
    const t2 = t1 + Math.max(Math.pow(dist(p1, p2), alpha), 1e-6);
    const t3 = t2 + Math.max(Math.pow(dist(p2, p3), alpha), 1e-6);
    const t = t1 + u * (t2 - t1);
    const lerpAxis = (a, b, ta, tb) => tb - ta < 1e-9 ? a : a + ((t - ta) / (tb - ta)) * (b - a);
    const a1x = lerpAxis(p0.x, p1.x, t0, t1), a1y = lerpAxis(p0.y, p1.y, t0, t1), a1z = lerpAxis(p0.z, p1.z, t0, t1);
    const a2x = lerpAxis(p1.x, p2.x, t1, t2), a2y = lerpAxis(p1.y, p2.y, t1, t2), a2z = lerpAxis(p1.z, p2.z, t1, t2);
    const a3x = lerpAxis(p2.x, p3.x, t2, t3), a3y = lerpAxis(p2.y, p3.y, t2, t3), a3z = lerpAxis(p2.z, p3.z, t2, t3);
    const lerpT = (a, b, ta, tb) => tb - ta < 1e-9 ? a : a + ((t - ta) / (tb - ta)) * (b - a);
    const b1x = lerpT(a1x, a2x, t0, t2), b1y = lerpT(a1y, a2y, t0, t2), b1z = lerpT(a1z, a2z, t0, t2);
    const b2x = lerpT(a2x, a3x, t1, t3), b2y = lerpT(a2y, a3y, t1, t3), b2z = lerpT(a2z, a3z, t1, t3);
    out.x = lerpT(b1x, b2x, t1, t2);
    out.y = lerpT(b1y, b2y, t1, t2);
    out.z = lerpT(b1z, b2z, t1, t2);
}
/**
 * Sample the whole spline densely: `segments × SUBDIV` points from waypoint 0
 * to the last (wrapping through it for a closed path).
 */
function sampleSpline(wps, closed) {
    const n = wps.length;
    const SUBDIV = 32;
    const pts = [];
    /** Index into `pts` where each waypoint lands. */
    const wpIndex = [];
    const segs = closed ? n : n - 1;
    const at = (i) => {
        if (closed)
            return wps[((i % n) + n) % n];
        return wps[Math.max(0, Math.min(n - 1, i))];
    };
    const scratch = { x: 0, y: 0, z: 0 };
    for (let s = 0; s < segs; s++) {
        wpIndex.push(pts.length);
        for (let k = 0; k < SUBDIV; k++) {
            catmullRom(at(s - 1), at(s), at(s + 1), at(s + 2), k / SUBDIV, scratch);
            pts.push({ x: scratch.x, y: scratch.y, z: scratch.z });
        }
    }
    // Terminal waypoint (open path) or explicit closure point (closed).
    const last = closed ? wps[0] : wps[n - 1];
    wpIndex.push(pts.length);
    pts.push({ x: last.x, y: last.y, z: last.z });
    return { pts, wpIndex };
}
/**
 * Compile a path definition into the normalized-LUT trajectory form.
 *
 * Pacing: constant arc-length speed by default; a waypoint with a time pins
 * the traversal (arrive there at t seconds), with untimed spans between pins
 * paced by their arc-length share. `bounce` bakes the return leg into the
 * LUT, so one cycle is there-and-back. For `once`, live and offline callers
 * clamp phase and ask the LUT to hold its terminal sample.
 */
export function compilePath(def) {
    if (def.waypoints.length < 2)
        return null;
    const { pts, wpIndex } = sampleSpline(def.waypoints, def.closed);
    // Cumulative arc length at every dense sample.
    const cum = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++)
        cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
    const total = cum[pts.length - 1] || 1e-6;
    // Map traversal TIME fraction → arc fraction. Untimed = identity; timed
    // waypoints pin (timeFrac at the waypoint = its stated share of the cycle).
    const timed = def.waypoints.some(w => w.t !== null);
    let arcAtTime;
    let cycleFromTimes = null;
    if (timed) {
        const lastTimed = [...def.waypoints].reverse().find(w => w.t !== null);
        const fullCycleS = def.cycleS ?? Math.max(lastTimed.t, 0.1) * (def.loop === 'bounce' ? 2 : 1);
        const traversalS = fullCycleS / (def.loop === 'bounce' ? 2 : 1);
        cycleFromTimes = fullCycleS;
        const pins = [{ a: 0, tf: 0 }];
        for (let i = 0; i < def.waypoints.length; i++) {
            const w = def.waypoints[i];
            if (w.t === null)
                continue;
            const a = cum[wpIndex[Math.min(i, wpIndex.length - 1)]] / total;
            const tf = Math.min(1, Math.max(0, w.t / traversalS));
            // Equal arc positions at different times are an authored pause.
            if (a >= pins[pins.length - 1].a && tf > pins[pins.length - 1].tf)
                pins.push({ a, tf });
        }
        if (pins[pins.length - 1].tf < 1)
            pins.push({ a: 1, tf: 1 });
        arcAtTime = tf => {
            for (let i = 1; i < pins.length; i++)
                if (tf <= pins[i].tf) {
                    const u = (tf - pins[i - 1].tf) / (pins[i].tf - pins[i - 1].tf);
                    return pins[i - 1].a + u * (pins[i].a - pins[i - 1].a);
                }
            return pins[pins.length - 1].a;
        };
    }
    else
        arcAtTime = tf => tf;
    // Resample uniformly in TIME: for each time step find the arc position via
    // the inverse mapping (monotone, so a forward scan works).
    const oneWay = PATH_LUT_POINTS;
    const bounce = def.loop === 'bounce';
    const pointCount = bounce ? oneWay * 2 : oneWay;
    const lut = new Float32Array(pointCount * 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const sampleAtArc = (arcFrac, outIdx) => {
        const target = arcFrac * total;
        // Binary search cum for target.
        let lo = 0, hi = pts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] < target)
                lo = mid + 1;
            else
                hi = mid;
        }
        const i1 = Math.max(1, lo);
        const i0 = i1 - 1;
        const span = cum[i1] - cum[i0] || 1e-9;
        const u = (target - cum[i0]) / span;
        const x = pts[i0].x + u * (pts[i1].x - pts[i0].x);
        const y = pts[i0].y + u * (pts[i1].y - pts[i0].y);
        const z = pts[i0].z + u * (pts[i1].z - pts[i0].z);
        lut[outIdx * 3] = x;
        lut[outIdx * 3 + 1] = y;
        lut[outIdx * 3 + 2] = z;
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    };
    for (let i = 0; i < oneWay; i++)
        sampleAtArc(arcAtTime(i / (oneWay - 1)), i);
    if (bounce) {
        for (let i = 0; i < oneWay; i++) {
            const src = (oneWay - 1 - i) * 3;
            const dst = (oneWay + i) * 3;
            lut[dst] = lut[src];
            lut[dst + 1] = lut[src + 1];
            lut[dst + 2] = lut[src + 2];
        }
    }
    // Normalize into the bbox ([0,1]³ — the engine remaps via areaMin/Max).
    const rx = maxX - minX, ry = maxY - minY, rz = maxZ - minZ;
    for (let i = 0; i < pointCount; i++) {
        lut[i * 3] = rx > 1e-9 ? (lut[i * 3] - minX) / rx : 0;
        lut[i * 3 + 1] = ry > 1e-9 ? (lut[i * 3 + 1] - minY) / ry : 0;
        lut[i * 3 + 2] = rz > 1e-9 ? (lut[i * 3 + 2] - minZ) / rz : 0;
    }
    const lengthM = bounce ? total * 2 : total;
    const cycleS = def.cycleS
        ?? cycleFromTimes
        ?? (def.speedMs ? lengthM / Math.max(def.speedMs, 1e-3) : lengthM / DEFAULT_SPEED_MS);
    const cycleHz = 1 / Math.max(cycleS, 0.1);
    return {
        lut,
        pointCount,
        bboxMin: { x: minX, y: minY, z: minZ },
        bboxMax: { x: maxX, y: maxY, z: maxZ },
        lengthM,
        cycleHz,
    };
}
//# sourceMappingURL=Paths.js.map