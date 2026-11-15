import type { Statement } from './Statement.js';
/** Digital program timing. Spatial propagation and each emitter's gain/DSP remain downstream. */
export interface ProgramTake {
    buffer: AudioBuffer;
    bufferKey: string;
    take: number;
    pitch: number;
    offsetSeconds: number;
    startsAt: number;
}
interface ProgramRun extends ProgramTake {
    signature: string;
    participants: Set<string>;
}
/** One dispatch owns one cohort, including reentrant event dispatches. Never keyed by rounded wall time. */
export type ProgramEvent = Map<string, ProgramRun>;
export interface ProgramJoin extends ProgramTake {
    epoch: number;
    expired: boolean;
}
export declare function programSignature(s: Statement): string;
export declare function programIssue(s: Statement): string | null;
export declare function inspectPrograms(statements: readonly Statement[]): {
    signatures: Map<string, string>;
    issues: Map<string, string>;
};
/**
 * A shared take and emission clock, allocated only when a program starts/joins.
 * No audio nodes, timers, frame work, or replacement spatial engine. Late loop
 * emitters join the current phase. A broadcast event supplies its own transient
 * cohort, so a new fire can overlap the preceding fire without mixing choices.
 */
export declare class SynchronizedPrograms {
    private readonly runs;
    private invalid;
    /** Preserve compatible loops over document edits; reject contradictory program definitions. */
    configure(statements: readonly Statement[]): void;
    issue(id: string): string | undefined;
    reset(): void;
    invalidateBuffer(key: string): void;
    current(s: Statement, trackKey: string, event?: ProgramEvent): Readonly<ProgramTake> | undefined;
    join(s: Statement, trackKey: string, now: number, proposed: ProgramTake, event?: ProgramEvent): ProgramJoin;
}
export {};
//# sourceMappingURL=SynchronizedPrograms.d.ts.map