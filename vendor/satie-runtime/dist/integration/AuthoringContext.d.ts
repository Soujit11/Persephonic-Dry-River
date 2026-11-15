/** Sampled on authoring actions, not a frame log or a claim of observed acoustic geometry. */
export interface AuthoringContext {
    version: 'satie.authoring-context/v1';
    source: 'adapter-state' | 'host-supplied';
    units: 'metres';
    listener?: [number, number, number];
    listenerForward?: [number, number, number];
    /** The listener's up vector beside forward, so an authoring sample carries the full pose (spec 011 A.4, 2026-11-08). */
    listenerUp?: [number, number, number];
    hosts?: Record<string, [number, number, number]>;
    signals?: Record<string, number>;
    state?: string | null;
    objects?: Array<{
        id: string;
        position: [number, number, number];
        sizeM: [number, number, number];
        material?: string;
        occludes?: boolean;
    }>;
}
//# sourceMappingURL=AuthoringContext.d.ts.map