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
import type { RealizedWorld } from './worldRealize';
export interface WorldManifest {
    format: 'satie-world-manifest';
    version: 2;
    /** The recipe, verbatim (sorted keys). */
    spec: ReturnType<typeof JSON.parse>;
    /** Stable hash-like key of the geometry (serialized spec without state). */
    specKey: string;
    frame: {
        up: '+Y';
        ahead: '+Z';
        unit: 'm';
        listener: [number, number, number];
        groundY: 0;
    };
    sizeM: number;
    /** Physical state plus the scene's own controls (`controls`: id → value, in the control's units). */
    state: {
        rain: number;
        wind: number;
        fog: number;
        hour: number;
        temperatureC: number;
        controls: Record<string, number>;
    };
    heightfield: {
        res: number;
        step: number;
        data: number[];
    };
    ground: {
        res: number;
        step: number;
        palette: string[];
        index: number[];
        baseIndex?: number[];
    };
    features: {
        id: string;
        kind: string;
        label: string;
        material: string;
        liquid: boolean;
        flow: number;
        carveM: number;
        halfM: number;
        surfaceY: number;
        polyline: [number, number, number][];
    }[];
    objects: {
        id: string;
        kind: string;
        classId: string;
        label: string;
        material: string;
        shape: string;
        porous: number;
        position: [number, number, number];
        heightM: number;
        radiusM: number;
        bodyBaseM: number;
        stemRadiusM: number;
        sizeM?: [number, number, number];
        yaw: number;
        enclosure?: boolean;
    }[];
    counts: {
        objects: number;
        solid: number;
        porous: number;
        droppedInstances: number;
    };
}
/** Build the manifest. Numbers are rounded to millimetres. */
export declare function buildWorldManifest(world: RealizedWorld): WorldManifest;
//# sourceMappingURL=WorldManifest.d.ts.map