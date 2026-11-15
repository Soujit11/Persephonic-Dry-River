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
export const BURST_MS = 12_000;
export const MAX_NODES = 200;
export class HistoryTree {
    options;
    nodes = [];
    headId = null;
    seq = 0;
    constructor(options = {}) {
        this.options = options;
    }
    now() { return this.options.now?.() ?? Date.now(); }
    byId(id) { return this.nodes.find(n => n.id === id); }
    childrenOf(id) { return this.nodes.filter(n => n.parentId === id); }
    get head() { return this.byId(this.headId); }
    /** The head and its ancestors, head first. */
    spine() {
        const out = [];
        for (let n = this.head; n; n = this.byId(n.parentId))
            out.push(n);
        return out;
    }
    add(label, kind, key, snap) {
        const now = this.now();
        const node = { id: `v${++this.seq}`, parentId: this.headId, label, kind, key, at: now, lastAt: now, snap, ...(this.options.session ? { session: this.options.session } : {}) };
        this.nodes.push(node);
        this.headId = node.id;
        this.prune();
        return node;
    }
    /** A new version, or the head again when it is the same gesture (same key, within the burst, nothing after it). */
    commit(label, kind, key, snap) {
        const head = this.head;
        if (head && key && head.key === key && this.now() - head.lastAt < (this.options.burstMs ?? BURST_MS) && !this.childrenOf(head.id).length) {
            head.snap = snap;
            head.label = label;
            head.lastAt = this.now();
            return head;
        }
        return this.add(label, kind, key, snap);
    }
    /**
     * A run of the same kind of change (mute and solo toggles) is ONE version, however long it takes:
     * the head is updated while it is that kind and nothing came after it. A run that ends where it
     * began (muted, then unmuted) leaves no version. `label` is told the state the run started from.
     */
    commitRun(kind, snap, label, same) {
        const head = this.head;
        if (head && head.kind === kind && !this.childrenOf(head.id).length) {
            const parent = this.byId(head.parentId);
            if (parent && same(parent.snap, snap)) {
                this.nodes = this.nodes.filter(n => n !== head);
                this.headId = parent.id;
                return parent;
            }
            head.snap = snap;
            head.label = label(parent?.snap ?? snap);
            head.lastAt = this.now();
            return head;
        }
        if (head && same(head.snap, snap))
            return head;
        return this.add(label(head?.snap ?? snap), kind, null, snap);
    }
    /** Is `id` the head or one of its ancestors? */
    isAncestorOfHead(id) { return this.spine().some(n => n.id === id); }
    /**
     * Over the bound, drop the oldest versions without breaking the tree: first
     * the oldest tip of a branch you left, then the oldest version on the way to
     * the head, whose children move up to its parent. The root and the head stay.
     */
    prune() {
        const max = this.options.maxNodes ?? MAX_NODES;
        while (this.nodes.length > max) {
            const root = this.nodes.find(n => n.parentId === null);
            const spine = new Set(this.spine().map(n => n.id));
            const hasKids = new Set(this.nodes.map(n => n.parentId));
            const drop = this.nodes.find(n => !spine.has(n.id) && !hasKids.has(n.id))
                ?? this.nodes.find(n => n !== root && n.id !== this.headId);
            if (!drop)
                return;
            for (const kid of this.childrenOf(drop.id))
                kid.parentId = drop.parentId;
            this.nodes = this.nodes.filter(n => n !== drop);
        }
    }
    /** Remove a tip you left and its unshared ancestors, up to the spine. */
    forgetBranch(tipId) {
        const spine = new Set(this.spine().map(n => n.id));
        let n = this.byId(tipId);
        while (n && !spine.has(n.id) && !this.nodes.some(o => o.parentId === n.id)) {
            const parentId = n.parentId;
            this.nodes = this.nodes.filter(o => o.id !== n.id);
            n = this.byId(parentId);
        }
    }
    toFile(scriptPath) {
        const refs = new Map();
        const scripts = {};
        const refOf = (text) => {
            let r = refs.get(text);
            if (!r) {
                r = `s${refs.size}`;
                refs.set(text, r);
                scripts[r] = text;
            }
            return r;
        };
        return {
            version: 'satie.history/v1', scriptPath, headId: this.headId, nodeSeq: this.seq, scripts,
            nodes: this.nodes.map(({ snap: { script, samples, ...mix }, ...n }) => ({ ...n, snap: { ...mix, scriptRef: refOf(script), ...(samples !== undefined ? { samplesRef: refOf(samples) } : {}) } })),
        };
    }
    /**
     * Resume a saved tree. Returns false (and leaves this tree untouched) when
     * the file is not a readable history of this script. Every node's parent
     * must be in the file; a node pointing elsewhere is re-rooted on its
     * nearest surviving ancestor rather than guessed.
     */
    load(file, scriptPath) {
        const f = file;
        if (!f || f.version !== 'satie.history/v1' || f.scriptPath !== scriptPath || !Array.isArray(f.nodes) || !f.nodes.length || typeof f.scripts !== 'object')
            return false;
        const nodes = [];
        for (const n of f.nodes) {
            const script = f.scripts[n?.snap?.scriptRef];
            if (typeof script !== 'string' || typeof n.id !== 'string')
                return false;
            nodes.push({ id: n.id, parentId: n.parentId ?? null, label: String(n.label ?? ''), kind: String(n.kind ?? 'script_edit'), key: n.key ?? null,
                at: Number(n.at) || 0, lastAt: Number(n.lastAt) || 0, ...(typeof n.session === 'string' ? { session: n.session } : {}),
                snap: { script, muted: n.snap.muted ?? [], soloed: n.snap.soloed ?? [], ...(typeof f.scripts[n.snap.samplesRef ?? ''] === 'string' ? { samples: f.scripts[n.snap.samplesRef] } : {}) } });
        }
        const ids = new Set(nodes.map(n => n.id));
        if (ids.size !== nodes.length)
            return false;
        const roots = nodes.filter(n => n.parentId === null || !ids.has(n.parentId));
        for (const n of roots.slice(1))
            n.parentId = roots[0].id;
        roots[0].parentId = null;
        this.nodes = nodes;
        this.headId = f.headId && ids.has(f.headId) ? f.headId : nodes[nodes.length - 1].id;
        this.seq = Math.max(Number(f.nodeSeq) || 0, ...nodes.map(n => Number(n.id.replace(/^v/, '')) || 0));
        return true;
    }
}
//# sourceMappingURL=HistoryTree.js.map