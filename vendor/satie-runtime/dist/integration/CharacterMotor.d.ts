import { FootContactTracker, type FootContactPosition } from './FootContactTracker.js';
/** Optional kinematic walking controller. Hosts supply collision bounds and material queries;
 * audio receives resolved contacts, never keyboard intent. Coordinates are metres, Y up. */
export interface MotorBody {
    id: string;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minY: number;
    maxY: number;
    velocityX?: number;
    velocityZ?: number;
}
export interface MotorSurface {
    material: string;
    height: number;
    depth: number;
}
export interface MotorContact {
    kind: 'step' | 'enter' | 'exit' | 'impact' | 'land';
    surface: string;
    body?: string;
    speed: number;
    foot?: -1 | 1;
    position?: FootContactPosition;
    time?: number;
    provenance?: 'physics-contact' | 'animation-contact' | 'distance-fallback';
}
export interface MotorOptions {
    radius?: number;
    eyeHeight?: number;
    stride?: number;
    speed?: number;
    gravity?: number;
    runSpeedMultiplier?: number;
    runStrideMultiplier?: number;
    /** Fractional stride variation, sampled once per contact (not per frame). */
    strideVariation?: number;
    random?: () => number;
    /** Speed divisor is 1 + water depth in metres * resistance. */
    waterResistance?: number;
    surface(x: number, z: number): MotorSurface;
    contact(event: MotorContact): void;
}
export declare class CharacterMotor {
    private readonly options;
    readonly position: {
        x: number;
        y: number;
        z: number;
    };
    readonly velocity: {
        x: number;
        y: number;
        z: number;
    };
    grounded: boolean;
    immersion: number;
    impact: number;
    /** Resolved self-propelled horizontal travel per second; zero at walls/at rest. */
    movementSpeed: number;
    /** Shared resolved-distance gait. Its phase may also drive the host's walk animation. */
    readonly gait: FootContactTracker;
    private time;
    private wet;
    private contactBody;
    readonly radius: number;
    readonly eyeHeight: number;
    constructor(options: MotorOptions);
    /** Teleports reset stride/impulse history. Position is the foot of the capsule. */
    teleport(x: number, y: number, z: number): void;
    update(dt: number, inputX: number, inputZ: number, running: boolean, bodies: readonly MotorBody[]): void;
}
//# sourceMappingURL=CharacterMotor.d.ts.map