import { upsertEntityProperty } from '../../edit/scriptEdit.js';
import { everyText, everyShape } from './dials.js';
/** A population's size bounds (the registry's `count`). */
export const COUNT_MIN = 1, COUNT_MAX = 48;
/** How fast a route's things go, the dial's ends (m/s). */
export const SPEED_MIN = 1, SPEED_MAX = 30;
export function readCrowd(def) {
    const every = def.every.isNull ? { min: 6, max: 14 } : { min: def.every.min, max: def.every.max };
    return {
        kind: def.hostMotion === 'pass' ? 'route' : 'population',
        count: def.count,
        every,
        speed: def.speed.isNull ? null : { min: def.speed.min, max: def.speed.max },
    };
}
const r1 = (n) => Math.round(n * 10) / 10;
export function writeCrowd(script, id, w) {
    if ('count' in w)
        return upsertEntityProperty(script, id, 'count', String(Math.min(COUNT_MAX, Math.max(COUNT_MIN, Math.round(w.count)))));
    if ('every' in w)
        return upsertEntityProperty(script, id, 'every', everyText(w.every));
    // a speed keeps how much it varies between one thing and the next
    const s = Math.min(SPEED_MAX, Math.max(SPEED_MIN, w.speed)), k = w.spread ?? 0.5;
    const lo = r1(s * (1 - k)), hi = r1(s * (1 + k));
    return upsertEntityProperty(script, id, 'speed', lo === hi ? String(lo) : `${lo}to${hi}`);
}
/** "about one every 7 s", from a route's every. */
export function sayEvery(e) {
    const m = everyShape(e.min, e.max).middleS;
    return m >= 120 ? `about one every ${Math.round(m / 60)} min` : `about one every ${m < 10 ? r1(m) : Math.round(m)} s`;
}
//# sourceMappingURL=crowd.js.map