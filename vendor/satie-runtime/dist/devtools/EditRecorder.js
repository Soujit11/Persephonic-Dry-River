export class EditRecorder {
    options;
    events = [];
    bytes = 0;
    pending = Promise.resolve();
    error = null;
    stopped = false;
    segment = 1;
    sessionId;
    scriptRefs = new Map();
    assetRefs = new Map();
    last = null;
    constructor(options) {
        this.options = options;
        this.sessionId = options.sessionId;
    }
    /** The segment being written (the first is the constructor's id; later ones add `-2`, `-3`…). */
    get currentSessionId() { return this.sessionId; }
    store(snapshot) {
        const { script, assets, ...rest } = snapshot;
        const out = { ...rest, scriptRef: '', assetsRef: '' };
        let s = this.scriptRefs.get(script);
        if (!s) {
            s = `s${this.scriptRefs.size}`;
            this.scriptRefs.set(script, s);
            out.script = script;
        }
        const assetsKey = JSON.stringify(assets);
        let a = this.assetRefs.get(assetsKey);
        if (!a) {
            a = `a${this.assetRefs.size}`;
            this.assetRefs.set(assetsKey, a);
            out.assets = assets;
        }
        out.scriptRef = s;
        out.assetsRef = a;
        return out;
    }
    build(kind, snapshot, detail, extras) {
        return structuredClone({ version: 'satie.edits/v3', sessionId: this.sessionId, seq: this.events.length,
            t: this.options.now?.() ?? new Date().toISOString(), scriptPath: this.options.scriptPath, kind, detail,
            ...(extras.changes ? { changes: extras.changes } : {}), ...(extras.node ? { node: extras.node } : {}),
            ...(snapshot ? { snapshot: this.store(snapshot) } : {}) });
    }
    push(event) {
        this.bytes += new TextEncoder().encode(JSON.stringify(event)).byteLength;
        this.events.push(event);
        // Serialize transport: a slow request cannot move event N behind event N+1.
        // On failure retain the complete local log; do not continue a misleading disk suffix.
        this.pending = this.pending.then(async () => {
            if (this.error)
                return;
            try {
                await this.options.send(structuredClone(event));
            }
            catch (error) {
                this.error = error instanceof Error ? error : new Error(String(error));
                this.options.onError?.('Edit log was not saved to disk. Download the local log before leaving.');
            }
        });
    }
    /**
     * At the segment's bound, capture continues in a new segment that starts
     * from the last full snapshot and names the one it continues, so a long
     * session is a chain of files, not a log that stops.
     */
    rotate() {
        const previous = this.sessionId;
        const fromSeq = this.events.length;
        this.segment++;
        this.sessionId = `${this.options.sessionId}-${this.segment}`;
        this.events = [];
        this.bytes = 0;
        this.scriptRefs.clear();
        this.assetRefs.clear();
        if (this.last)
            this.push(this.build('start', this.last, { continues: previous, fromSeq }, {}));
    }
    record(kind, snapshot, detail = {}, extras = {}) {
        if (this.stopped)
            return false;
        let event = this.build(kind, snapshot, detail, extras);
        let bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
        if (bytes > 900_000) {
            // One observation larger than a segment can hold: say so and stop, never truncate it.
            event = this.build('capture_gap', null, { reason: 'An edit snapshot exceeded the local capture limit; later edits were not recorded.' }, {});
            this.stopped = true;
            this.options.onError?.('Edit capture limit reached. Download this log and start a new overlay session.');
            this.push(event);
            return false;
        }
        if (this.events.length >= (this.options.maxEvents ?? 1000) || this.bytes + bytes > (this.options.maxBytes ?? 5_000_000)) {
            this.rotate();
            event = this.build(kind, snapshot, detail, extras);
            bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
        }
        this.last = structuredClone(snapshot);
        this.push(event);
        return true;
    }
    /** The current segment as JSONL (earlier segments are already on disk). */
    toJSONL() { return this.events.map(event => JSON.stringify(event)).join('\n') + (this.events.length ? '\n' : ''); }
    async flush() { await this.pending; if (this.error)
        throw this.error; }
}
//# sourceMappingURL=EditRecorder.js.map