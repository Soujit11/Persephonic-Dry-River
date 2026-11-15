/**
 * Named trajectory patterns for Satie spatial movement.
 * Normalized [0,1] output — remapped to areaMin/areaMax by the engine.
 */
export interface Trajectory {
    evaluate(t: number, clamp?: boolean): {
        x: number;
        y: number;
        z: number;
    };
}
/**
 * LUT trajectory — pre-computes points lazily, lerps at runtime.
 */
declare class LUTTrajectory implements Trajectory {
    private xs;
    private ys;
    private zs;
    private readonly size;
    private readonly generate;
    constructor(size: number, generate: () => {
        xs: Float32Array;
        ys: Float32Array;
        zs: Float32Array;
    });
    evaluate(t: number, clamp?: boolean): {
        x: number;
        y: number;
        z: number;
    };
}
export declare function getTrajectory(name: string): Trajectory | undefined;
export declare function isTrajectoryName(name: string): boolean;
export declare function isBuiltinTrajectory(name: string): boolean;
/** Register a custom trajectory from a pre-computed LUT (interleaved xyz Float32Array). */
export declare function registerTrajectoryFromLUT(name: string, points: Float32Array, pointCount: number): void;
/** Remove a custom trajectory (cannot remove builtins). */
export declare function unregisterTrajectory(name: string): boolean;
/** List all registered trajectory names. */
export declare function listTrajectoryNames(): string[];
export { LUTTrajectory };
//# sourceMappingURL=Trajectories.d.ts.map