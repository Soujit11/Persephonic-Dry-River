import { parseEntityRig, entityRigSize } from './EntityRig.js';
/** The same bounded representation is accepted by JSON authoring and the DSL. */
export function parseEntityBody(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const rigValue = raw.rig;
    if (rigValue !== undefined) {
        const rig = parseEntityRig(rigValue);
        if (!rig)
            return null;
        // The proxy and visible rig derive from the same measured proportions and authored height.
        return { rig, parts: [{ shape: 'box', size: entityRigSize(rig), at: [0, 0, 0] }] };
    }
    const parts = raw.parts;
    if (!Array.isArray(parts) || !parts.length || parts.length > 12)
        return null;
    const triple = (v, min, max) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
    const result = [];
    for (const p of parts) {
        if (!p || !['ellipsoid', 'box'].includes(p.shape) || !triple(p.size, 0.0001, 30) || !triple(p.at, -30, 30))
            return null;
        if (p.color !== undefined && (typeof p.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p.color)))
            return null;
        if (p.flap && (!Number.isFinite(p.flap.angle) || Math.abs(p.flap.angle) > Math.PI || !Number.isFinite(p.flap.hz) || p.flap.hz <= 0 || p.flap.hz > 30))
            return null;
        if (p.stride && (!Number.isFinite(p.stride.angle) || Math.abs(p.stride.angle) > Math.PI || !Number.isFinite(p.stride.phase) || Math.abs(p.stride.phase) > Math.PI * 2))
            return null;
        result.push({ shape: p.shape, size: [...p.size], at: [...p.at], ...(p.color ? { color: p.color } : {}), ...(p.flap ? { flap: { angle: p.flap.angle, hz: p.flap.hz } } : {}), ...(p.stride ? { stride: { angle: p.stride.angle, phase: p.stride.phase } } : {}) });
    }
    return { parts: result };
}
const standingFloors = new WeakMap();
/** Lowest point of the authored standing pose, in body-local metres. Shapes
 * have full extents in `size`, matching both viewport boxes and ellipsoids. */
export function entityBodyFloorY(body) {
    const cached = standingFloors.get(body);
    if (cached !== undefined)
        return cached;
    let floor = Infinity;
    for (const part of body.parts)
        floor = Math.min(floor, part.at[1] - part.size[1] / 2);
    if (!Number.isFinite(floor))
        floor = 0;
    standingFloors.set(body, floor);
    return floor;
}
//# sourceMappingURL=EntityBody.js.map