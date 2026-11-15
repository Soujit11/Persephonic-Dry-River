/**
 * The mixer's version tree (the web app's src/lib/versionTree.ts, for the
 * overlay). Each node is a complete state with its parent, so going back and
 * editing BRANCHES and the version you left is kept ("tried and left"). A
 * burst of the same edit (a fader drag) within 12 s is one version.
 *
 * Pure: the overlay owns the DOM and the engine; this owns the tree, its
 * bound, and the file it persists as (`satie.history/v1`, one copy of each
 * script text however many versions share it).
 */
/**
 * A version: the script, the runtime mix, and the samples manifest as JSON text (which take each
 * clip plays: a take swapped without a script change is a version too). Fader positions are not
 * stored; they are read from the script.
 */
export interface HistSnap {
    script: string;
    muted: number[];
    soloed: number[];
    samples?: string;
}
/** `session`: the page load that made it (the mixer groups history by session, 2026-11-11); absent on older files. */
export interface HistNode {
    id: string;
    parentId: string | null;
    label: string;
    kind: string;
    key: string | null;
    at: number;
    lastAt: number;
    snap: HistSnap;
    session?: string;
}
export interface HistoryFile {
    version: 'satie.history/v1';
    scriptPath: string;
    headId: string | null;
    nodeSeq: number;
    /** Script and samples texts by ref; nodes point at them. */
    scripts: Record<string, string>;
    nodes: Array<Omit<HistNode, 'snap'> & {
        snap: Omit<HistSnap, 'script' | 'samples'> & {
            scriptRef: string;
            samplesRef?: string;
        };
    }>;
}
export declare const BURST_MS = 12000;
export declare const MAX_NODES = 200;
export declare class HistoryTree {
    private readonly options;
    nodes: HistNode[];
    headId: string | null;
    private seq;
    constructor(options?: {
        maxNodes?: number;
        burstMs?: number;
        now?: () => number;
        session?: string;
    });
    private now;
    byId(id: string | null): HistNode | undefined;
    childrenOf(id: string | null): HistNode[];
    get head(): HistNode | undefined;
    /** The head and its ancestors, head first. */
    spine(): HistNode[];
    add(label: string, kind: string, key: string | null, snap: HistSnap): HistNode;
    /** A new version, or the head again when it is the same gesture (same key, within the burst, nothing after it). */
    commit(label: string, kind: string, key: string | null, snap: HistSnap): HistNode;
    /**
     * A run of the same kind of change (mute and solo toggles) is ONE version, however long it takes:
     * the head is updated while it is that kind and nothing came after it. A run that ends where it
     * began (muted, then unmuted) leaves no version. `label` is told the state the run started from.
     */
    commitRun(kind: string, snap: HistSnap, label: (from: HistSnap) => string, same: (a: HistSnap, b: HistSnap) => boolean): HistNode | undefined;
    /** Is `id` the head or one of its ancestors? */
    isAncestorOfHead(id: string): boolean;
    /**
     * Over the bound, drop the oldest versions without breaking the tree: first
     * the oldest tip of a branch you left, then the oldest version on the way to
     * the head, whose children move up to its parent. The root and the head stay.
     */
    private prune;
    /** Remove a tip you left and its unshared ancestors, up to the spine. */
    forgetBranch(tipId: string): void;
    toFile(scriptPath: string): HistoryFile;
    /**
     * Resume a saved tree. Returns false (and leaves this tree untouched) when
     * the file is not a readable history of this script. Every node's parent
     * must be in the file; a node pointing elsewhere is re-rooted on its
     * nearest surviving ancestor rather than guessed.
     */
    load(file: unknown, scriptPath: string): boolean;
}
//# sourceMappingURL=HistoryTree.d.ts.map