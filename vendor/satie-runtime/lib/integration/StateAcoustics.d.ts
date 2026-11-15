import type { Statement } from '../core/Statement.js';
import type { ObjectStateSchema } from './ObjectStateSchema.js';
import type { CaptureAction } from './contracts.js';
export type StateSignals = Record<string, number>;
export declare function stateSignalsFor(schema: ObjectStateSchema | undefined, group: string, value: string): StateSignals | undefined;
export declare function assertStateSignals(expected: StateSignals | undefined, actual: StateSignals | undefined): void;
/** Syntax-level consumers establish a connection; render tests establish its acoustic effect. */
export declare function acousticSignalConsumers(statements: readonly Statement[], signal: string): string[];
export declare function validateStateAcoustics(actions: readonly CaptureAction[], statements: readonly Statement[]): void;
//# sourceMappingURL=StateAcoustics.d.ts.map