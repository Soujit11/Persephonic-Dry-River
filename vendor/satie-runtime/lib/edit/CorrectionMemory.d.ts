export interface CorrectionExample {
    id: string;
    familyId: string;
    brief: string;
    reason: string;
    origin: 'human';
    evidence: 'explicit-user-feedback';
    auditioned: true;
    /** Explicit permission for this example to inform future compositions. */
    reuse: boolean;
    dimension: 'spatial' | 'acoustics' | 'intent' | 'balance' | 'source-fit';
    before: string;
    after: string;
}
export declare function validateCorrection(value: unknown): CorrectionExample;
export declare function inferDimension(before: string, after: string): CorrectionExample['dimension'];
/** Transparent baseline retrieval; no model training, network or inferred preference. */
export declare function retrieveCorrections(brief: string, examples: readonly CorrectionExample[], excludedFamilies?: readonly string[], limit?: number): CorrectionExample[];
export declare function formatCorrections(examples: readonly CorrectionExample[]): string;
/** Fail closed if the writer changes a locked source. Full current scene stays available. */
export declare function assertSourceLocks(before: string, after: string, lockedIds: readonly string[]): void;
//# sourceMappingURL=CorrectionMemory.d.ts.map