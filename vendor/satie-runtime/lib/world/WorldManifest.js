/**
 * Ground-truth manifest for a realized world — everything a machine-listening
 * dataset needs to know about the scene besides the audio: the spec (content),
 * every object with its type / label / material / position / size, the water
 * polyline, the ground material grid, the heightfield, the weather and the
 * hour. Deterministic for a spec, JSON-serialisable, and versioned so readers
 * can tell what they are looking at.
 *
 * This is the "environment + geometry + sources" half of the dataset row; the
 * per-frame source annotations come from `export/SeldAnnotations.ts`.
 */
import { serializeWorldSpec } from './worldSpec.js';
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
/** Build the manifest. Numbers are rounded to millimetres. */
export function buildWorldManifest(world) {
    const spec = world.spec;
    const stateless = { ...spec, weather: { rain: 0, wind: 0, fog: 0 }, time: { hour: 0, season: '', temperatureC: 0, clockRate: 0 }, controls: [] };
    const controls = {};
    for (const c of spec.controls)
        controls[c.id] = c.value;
    return {
        format: 'satie-world-manifest',
        version: 2,
        spec: JSON.parse(serializeWorldSpec(spec)),
        specKey: serializeWorldSpec(stateless),
        frame: { up: '+Y', ahead: '+Z', unit: 'm', listener: [0, 1.6, 0], groundY: 0 },
        sizeM: spec.sizeM,
        state: { rain: spec.weather.rain, wind: spec.weather.wind, fog: spec.weather.fog, hour: round(spec.time.hour, 4), temperatureC: spec.time.temperatureC, controls },
        heightfield: { res: world.heightfield.res, step: round(world.heightfield.step, 6), data: Array.from(world.heightfield.data, v => round(v)) },
        ground: { res: world.ground.res, step: round(world.ground.step, 6), palette: [...world.ground.palette], index: Array.from(world.ground.index), ...(world.ground.baseIndex ? { baseIndex: Array.from(world.ground.baseIndex) } : {}) },
        features: world.features.map(f => ({
            id: f.id, kind: f.kind, label: f.label, material: f.material, liquid: f.liquid, flow: f.flow, carveM: f.carveM, halfM: f.halfM,
            surfaceY: round(f.surfaceY), polyline: f.polyline.map(p => [round(p.x), round(p.y), round(p.z)]),
        })),
        objects: world.objects.map(o => ({
            id: o.id, kind: o.kind, classId: o.classId, label: o.label, material: o.material, shape: o.shape, porous: o.porous,
            position: [round(o.position.x), round(o.position.y), round(o.position.z)],
            heightM: round(o.heightM), radiusM: round(o.radiusM), bodyBaseM: round(o.bodyBaseM), stemRadiusM: round(o.stemRadiusM),
            ...(o.sizeM ? { sizeM: o.sizeM } : {}), yaw: round(o.yaw, 4), ...(o.enclosure ? { enclosure: true } : {}),
        })),
        counts: { objects: world.objects.length, solid: world.objects.filter(o => o.porous < 0.3).length, porous: world.objects.filter(o => o.porous >= 0.3).length, droppedInstances: world.droppedInstances },
    };
}
//# sourceMappingURL=WorldManifest.js.map