import { upsertVoiceProperty, removeVoiceProperty } from '../../edit/scriptEdit.js';
/** Anchors that are not a thing the game moves (rain overhead, a point on the ground). */
const NOT_A_THING = new Set(['listener', 'overhead', 'ground', 'air', 'horizon']);
const r2 = (n) => Math.round(n * 100) / 100;
const pt = (v) => [r2(v.x), r2(v.y), r2(v.z)];
export function readMotion(st) {
    if (st.hostRef && !NOT_A_THING.has(st.hostRef))
        return { choice: 'rides', host: { id: st.hostRef, part: st.hostAttach } };
    const w = st.wanderType;
    if (w === 'walk' || w === 'fly') {
        return { choice: 'roams', area: { kind: 'area', min: pt(st.areaMin), max: pt(st.areaMax) }, air: w === 'fly', speed: { min: st.wanderHz.min, max: st.wanderHz.max } };
    }
    if (w === 'orbit')
        return { choice: 'circles' };
    if (!w || w === 'none' || w === 'fixed')
        return { choice: 'stays' };
    return { choice: 'other', word: w };
}
/** "drifts ↔ darts": 0 … 1 on a log scale of speed (0.05 … 3). */
const LOG_SLOW = Math.log(0.05), LOG_FAST = Math.log(3);
export const speedToPos = (s) => Math.min(1, Math.max(0, (Math.log(Math.max(0.05, s)) - LOG_SLOW) / (LOG_FAST - LOG_SLOW)));
export const posToSpeed = (p) => Math.exp(LOG_SLOW + Math.min(1, Math.max(0, p)) * (LOG_FAST - LOG_SLOW));
/** The default box when a sound starts roaming: 4 m around where it is, on its own height. */
export function areaAround(st, halfM = 2) {
    const c = [(st.areaMin.x + st.areaMax.x) / 2, (st.areaMin.y + st.areaMax.y) / 2, (st.areaMin.z + st.areaMax.z) / 2];
    return { kind: 'area', min: [r2(c[0] - halfM), r2(c[1]), r2(c[2] - halfM)], max: [r2(c[0] + halfM), r2(c[1]), r2(c[2] + halfM)] };
}
/** The move word a roam writes: on the ground it wanders; in the air it drifts, or darts when fast. */
export const roamWord = (air, speed) => (!air ? 'wander' : speed >= 1.2 ? 'dart' : 'drift');
export function writeMotion(script, loc, m) {
    let next = script;
    const set = (k, v) => { if (next !== null)
        next = upsertVoiceProperty(next, loc, k, v); };
    const drop = (k) => { if (next !== null)
        next = removeVoiceProperty(next, loc, k) ?? next; };
    if (m.choice === 'rides') {
        // the game moves it: no box, no motion of its own
        set('at', m.part && m.part !== 'body' ? `${m.host} ${m.part}` : m.host);
        drop('move');
        drop('place');
        return next;
    }
    if (m.choice === 'roams') {
        const lo = [0, 1, 2].map(k => Math.min(m.area.min[k], m.area.max[k])), hi = [0, 1, 2].map(k => Math.max(m.area.min[k], m.area.max[k]));
        const y = m.air ? `${r2(lo[1])}to${r2(Math.max(hi[1], lo[1] + 3))}` : `${r2(lo[1])}`;
        set('place', `${r2(lo[0])}to${r2(hi[0])} ${y} ${r2(lo[2])}to${r2(hi[2])}`);
        const a = r2(m.speed.min), b = r2(m.speed.max);
        set('move', `${roamWord(m.air, (m.speed.min + m.speed.max) / 2)} speed ${a === b ? a : `${a}to${b}`}`);
        drop('at');
        return next;
    }
    if (m.choice === 'circles') {
        set('move', 'circle');
        drop('at');
        return next;
    }
    drop('move');
    return next;
}
/** A box said the way people say it: "an area about 6 × 6 m". */
export function sayArea(a) {
    const w = Math.abs(a.max[0] - a.min[0]), d = Math.abs(a.max[2] - a.min[2]);
    const m = (v) => (v < 10 ? Math.round(v * 2) / 2 : Math.round(v));
    return `an area about ${m(w)} × ${m(d)} m`;
}
//# sourceMappingURL=motion.js.map