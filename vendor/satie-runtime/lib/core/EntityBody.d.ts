import { type EntityRig } from './EntityRig.js';
/** A body's visible shape, independent of its sound repertoire. Metres, +Z forward. */
export interface EntityBodyPart {
    shape: 'ellipsoid' | 'box';
    size: [number, number, number];
    at: [number, number, number];
    /** Authored surface colour; independent of sound identity and diagnostic colours. */
    color?: string;
    /** Rotation around local Z while travelling: radians, cycles per second. */
    flap?: {
        angle: number;
        hz: number;
    };
    /** Hip/shoulder swing about the part's top, driven by travelled stride, not time. */
    stride?: {
        angle: number;
        phase: number;
    };
}
export interface EntityBody {
    parts: EntityBodyPart[];
    rig?: EntityRig;
}
/** The same bounded representation is accepted by JSON authoring and the DSL. */
export declare function parseEntityBody(raw: unknown): EntityBody | null;
/** Lowest point of the authored standing pose, in body-local metres. Shapes
 * have full extents in `size`, matching both viewport boxes and ellipsoids. */
export declare function entityBodyFloorY(body: EntityBody): number;
//# sourceMappingURL=EntityBody.d.ts.map