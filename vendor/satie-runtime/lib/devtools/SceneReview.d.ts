import type { SatieEngine } from '../core/SatieEngine.js';
import { type SceneJudgment } from './SceneComparison.js';
/** Framework-free pilot for the in-project overlay. No inferred vote or upload. */
export declare function createSceneReview(options: {
    engine: SatieEngine;
    script: () => string;
    apply: (script: string) => void;
    judgment?: (judgment: SceneJudgment) => void;
}): {
    element: HTMLDivElement;
    stop: () => void | undefined;
    destroy: () => void;
};
//# sourceMappingURL=SceneReview.d.ts.map