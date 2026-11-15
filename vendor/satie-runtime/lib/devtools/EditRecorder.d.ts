/** Ordered, bounded local observations. An edit is never an approval or consent. */
import type { AuthoringContext } from '../integration/AuthoringContext';
import type { VoiceChange } from '../edit/voiceChanges';
export type EditAsset = {
    clipPath: string;
    sampleId?: string;
    sha256?: string;
    hashEvidence?: 'loaded-bytes';
    license?: string;
    attribution?: string;
};
export interface EditSnapshot {
    observedContext?: AuthoringContext;
    contextStatus?: 'not-configured' | 'captured' | 'unavailable';
    script: string;
    assets: EditAsset[];
    editor: {
        volumeOverrides: Array<{
            statementIndex: number;
            value: number;
        }>;
        muted: number[];
        soloed: number[];
        groundReflection: boolean;
    };
}
/**
 * The snapshot as written: the script and the asset list are stored once per
 * session segment and referenced after (`scriptRef` / `assetsRef`); the value
 * rides on the first event that carries it. A segment file is self-contained.
 */
export interface StoredSnapshot extends Omit<EditSnapshot, 'script' | 'assets'> {
    scriptRef: string;
    script?: string;
    assetsRef: string;
    assets?: EditAsset[];
}
export interface EditEvent {
    version: 'satie.edits/v3';
    sessionId: string;
    seq: number;
    t: string;
    scriptPath: string;
    kind: string;
    detail: Record<string, unknown>;
    /** What the edit did per voice, when it changed the script (see edit/voiceChanges.ts). */
    changes?: VoiceChange[];
    /** The history version the mixer is on after this event. */
    node?: {
        id: string;
        parentId: string | null;
    };
    snapshot?: StoredSnapshot;
}
export interface RecordExtras {
    changes?: VoiceChange[];
    node?: {
        id: string;
        parentId: string | null;
    };
}
export declare class EditRecorder {
    private readonly options;
    private events;
    private bytes;
    private pending;
    private error;
    private stopped;
    private segment;
    private sessionId;
    private scriptRefs;
    private assetRefs;
    private last;
    constructor(options: {
        sessionId: string;
        scriptPath: string;
        send: (event: EditEvent) => Promise<void>;
        onError?: (message: string) => void;
        now?: () => string;
        maxEvents?: number;
        maxBytes?: number;
    });
    /** The segment being written (the first is the constructor's id; later ones add `-2`, `-3`…). */
    get currentSessionId(): string;
    private store;
    private build;
    private push;
    /**
     * At the segment's bound, capture continues in a new segment that starts
     * from the last full snapshot and names the one it continues, so a long
     * session is a chain of files, not a log that stops.
     */
    private rotate;
    record(kind: string, snapshot: EditSnapshot, detail?: Record<string, unknown>, extras?: RecordExtras): boolean;
    /** The current segment as JSONL (earlier segments are already on disk). */
    toJSONL(): string;
    flush(): Promise<void>;
}
//# sourceMappingURL=EditRecorder.d.ts.map