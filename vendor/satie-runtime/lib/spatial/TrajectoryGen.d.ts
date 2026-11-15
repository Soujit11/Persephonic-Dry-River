/**
 * Trajectory generation via AI providers (Claude, OpenAI, Gemini).
 * Produces JavaScript code that generates a Float32Array LUT for spatial trajectories.
 */
/** Interface matching the provider shape — avoids importing React-side lib in engine code. */
export interface TrajectoryAIProvider {
    call(options: {
        systemPrompt: string;
        messages: {
            role: 'user' | 'assistant';
            content: string;
        }[];
        maxTokens?: number;
    }): Promise<string>;
}
export interface TrajectorySpec {
    name: string;
    code: string;
}
export interface TrajectoryGenParams {
    duration?: number;
    resolution?: number;
    smoothing?: number;
    seed?: number;
    ground?: boolean;
    variation?: number;
}
export declare function generateTrajectoryFromPrompt(provider: TrajectoryAIProvider, userPrompt: string, params?: TrajectoryGenParams): Promise<TrajectorySpec>;
/** Longest code body accepted from the model. Real trajectories are a few hundred chars. */
export declare const TRAJECTORY_CODE_MAX_CHARS = 20000;
/** A trajectory that has not returned in this long is a runaway loop, not a slow one. */
export declare const TRAJECTORY_EXEC_TIMEOUT_MS = 5000;
/**
 * Execute model-generated trajectory code and return the Float32Array LUT.
 *
 * In a browser the code runs in a capability-stripped Web Worker with a
 * timeout. Outside one (Node tests, offline scripts) there is no page to
 * protect and no Worker API, so it runs in-process.
 */
export declare function executeTrajectoryCode(code: string, size?: number, seed?: number): Promise<Float32Array>;
/**
 * Post-process a trajectory LUT: apply smoothing and ground constraint.
 */
export declare function postProcessTrajectory(points: Float32Array, pointCount: number, smoothing: number, ground: boolean): Float32Array;
//# sourceMappingURL=TrajectoryGen.d.ts.map