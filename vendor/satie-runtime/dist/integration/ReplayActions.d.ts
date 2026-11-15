import type { ObjectTrackingState } from './ObjectTracking.js';
import { type ObjectStateSchema } from './ObjectStateSchema.js';
import type { SatieEngine } from '../core/SatieEngine.js';
import { type CaptureAction } from './contracts.js';
export type ReplayAction = CaptureAction;
export interface ReplayState {
    tracking: Map<string, ObjectTrackingState>;
    stateSchemas: Map<string, ObjectStateSchema>;
    objectInstances: Map<string, string>;
    objectStates: Map<string, Map<string, string>>;
}
export declare const createReplayState: () => ReplayState;
export declare function validateReplay(actions: readonly ReplayAction[], duration: number): ReplayAction[];
/** Object states belong to the host, so replay requires an explicit sink for them. */
export declare function applyReplayAction(engine: SatieEngine, action: ReplayAction, state?: ReplayState): Promise<void>;
//# sourceMappingURL=ReplayActions.d.ts.map