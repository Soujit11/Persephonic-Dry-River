export interface MotionPlan {
    sourceId: string;
    frame: 'scene';
    loop: 'once' | 'repeat' | 'bounce';
    waypoints: Array<{
        x: number;
        y: number;
        z: number;
        t: number;
    }>;
}
export declare function validateMotionPlan(value: unknown): MotionPlan;
/** Numeric motion is compiled, never reinterpreted by the DSL writer. Hosted motion remains host-owned. */
export declare function applyMotionPlan(script: string, input: MotionPlan): string;
//# sourceMappingURL=MotionPlan.d.ts.map