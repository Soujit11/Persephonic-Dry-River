/** Scalar and 3-vector helpers the engine's hot paths share. Branch-based clamps: no `Math.min/max` call overhead per sample. */
export declare function clamp(v: number, lo: number, hi: number): number;
export declare function clamp01(v: number): number;
export declare function lerp(a: number, b: number, t: number): number;
/** Hermite smoothstep on [0,1]; inputs outside the range clamp. */
export declare function smoothstep01(t: number): number;
export declare function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number;
//# sourceMappingURL=math.d.ts.map