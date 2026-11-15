import type { Statement } from '../core/Statement.js';
/** Only parser-created count copies of one authored header share an identity. */
export declare function isCountSourceGroup(statements: readonly Statement[]): boolean;
/** Includes authored path dependencies, so editing a named route cannot bypass a lock. */
export declare function sourceFingerprints(script: string): Map<string, string>;
/** A source can spawn multiple instances and use multiple takes. Never use track keys as identity. */
export declare function sourceIdentities(script: string): {
    statementIndices?: number[] | undefined;
    clipPaths?: string[] | undefined;
    sourceId: string | null;
    statementIndex: number;
    line: number;
    clipPath: string;
    host: string | null;
    instances: number;
}[];
/** Assign on import; identity thereafter lives in the text and survives controlled edits. */
export declare function identifySources(script: string, newId?: () => string): string;
/**
 * Deterministic IDs for unidentified playback imports. Distinct authored blocks
 * retain their IDs when reordered. Persist the returned text before editing;
 * edited unidentified blocks and identical duplicates cannot prove continuity.
 */
export declare function identifySourcesStable(script: string): string;
/** Ambiguous rewrites stay unresolved; no fuzzy matching turns them into training pairs. */
export declare function pairSources(before: string, after: string): {
    pairs: {
        sourceId: string;
        before: {
            statementIndices?: number[] | undefined;
            clipPaths?: string[] | undefined;
            sourceId: string | null;
            statementIndex: number;
            line: number;
            clipPath: string;
            host: string | null;
            instances: number;
        };
        after: {
            statementIndices?: number[] | undefined;
            clipPaths?: string[] | undefined;
            sourceId: string | null;
            statementIndex: number;
            line: number;
            clipPath: string;
            host: string | null;
            instances: number;
        };
    }[];
    unresolvedBefore: {
        statementIndices?: number[] | undefined;
        clipPaths?: string[] | undefined;
        sourceId: string | null;
        statementIndex: number;
        line: number;
        clipPath: string;
        host: string | null;
        instances: number;
    }[];
    unresolvedAfter: {
        statementIndices?: number[] | undefined;
        clipPaths?: string[] | undefined;
        sourceId: string | null;
        statementIndex: number;
        line: number;
        clipPath: string;
        host: string | null;
        instances: number;
    }[];
};
//# sourceMappingURL=SourceIdentity.d.ts.map