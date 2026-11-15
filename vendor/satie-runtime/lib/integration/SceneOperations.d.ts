export type SceneChange = {
    kind: 'source';
    sourceId: string;
    property: string;
    value: string;
} | {
    kind: 'script';
    script: string;
} | {
    kind: 'event';
    name: string;
    position?: [number, number, number];
    text?: string;
} | {
    kind: 'signal';
    name: string;
    value: number;
} | {
    kind: 'state';
    name: string | null;
    isolation?: number;
};
export interface SceneOperation {
    id: string;
    baseRevision: string;
    at: number;
    late: 'reject' | 'apply';
    change: SceneChange;
}
export interface OperationResult {
    id: string;
    status: 'applied' | 'rejected' | 'cancelled';
    revision: string;
    time: number;
    reason?: string;
}
/** Bounded transaction queue. Preparation/validation happens outside the audio tick. */
export declare class SceneOperations {
    private readonly apply;
    private pending;
    private seen;
    private locks;
    private revisionNumber;
    private current;
    private script;
    private history;
    constructor(script: string, revision: string, apply: (change: SceneChange, script: string) => void);
    get revision(): string;
    get currentScript(): string;
    results(): readonly OperationResult[];
    setLocked(sourceId: string, locked: boolean): void;
    prepare(operation: SceneOperation, now: number): void;
    cancel(id: string, now: number): boolean;
    private note;
    private preview;
    flush(now: number): void;
}
//# sourceMappingURL=SceneOperations.d.ts.map