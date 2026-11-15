/**
 * Anything not yet committed is heard in place: a Draft (a candidate script, plus temporary
 * audio under existing take keys) is loaded into the RUNNING engine, so it plays where the
 * sound really is, at its level, with its distance and echo. "Before" loads the committed
 * scene back; "Keep it" hands the draft's script to the mixer's one commit point; "Put it
 * back" restores everything, including any audio a draft put under a take key.
 *
 * No new engine API: only `loadScript` and `setAudioBuffer` / `removeAudioBuffer`. The engine
 * does not hand back what it replaced, so the player keeps the old buffers itself.
 */
export class DraftPlayer {
    engine;
    committed;
    schedule;
    draft = null;
    /** What each overridden take key held before the draft (undefined: nothing). */
    stash = new Map();
    _side = 'after';
    /**
     * @param committed the committed script, read fresh each time (the mixer's document).
     * @param schedule  coalesces handle drags to one engine load per frame (requestAnimationFrame).
     */
    constructor(engine, committed, schedule = run => run()) {
        this.engine = engine;
        this.committed = committed;
        this.schedule = schedule;
    }
    get open() { return this.draft !== null; }
    get side() { return this._side; }
    /** The script the draft would commit, null when none is open. */
    get script() { return this.draft?.script ?? null; }
    /** Open a draft and play it ("after"). False when the engine refuses the script (nothing changes). */
    preview(d) {
        if (this.draft)
            this.restore();
        for (const [key, buffer] of Object.entries(d.buffers ?? {})) {
            if (!this.stash.has(key))
                this.stash.set(key, this.engine.getAudioBuffers().get(key));
            this.engine.setAudioBuffer(key, buffer);
        }
        try {
            this.engine.loadScript(d.script);
        }
        catch {
            this.restore();
            return false;
        }
        this.draft = { script: d.script, ...(d.buffers ? { buffers: d.buffers } : {}) };
        this._side = 'after';
        return true;
    }
    /** A handle moved: the draft's script changes and is heard (at most once a frame). */
    pending = null;
    update(script) {
        if (!this.draft)
            return;
        this.draft = { ...this.draft, script };
        if (this._side !== 'after')
            return;
        const first = this.pending === null;
        this.pending = script;
        if (first)
            this.schedule(() => {
                const t = this.pending;
                this.pending = null;
                if (t !== null && this.draft && this._side === 'after') {
                    try {
                        this.engine.loadScript(t);
                    }
                    catch { /* the release refuses or commits */ }
                }
            });
    }
    /** Switch between the committed scene ("before") and the draft ("after"), the playhead running on. */
    flip(side) {
        if (!this.draft || side === this._side)
            return;
        this._side = side;
        if (side === 'before') {
            this.putBuffersBack();
            this.engine.loadScript(this.committed());
        }
        else {
            for (const [key, buffer] of Object.entries(this.draft.buffers ?? {}))
                this.engine.setAudioBuffer(key, buffer);
            this.engine.loadScript(this.draft.script);
        }
    }
    /**
     * Keep it: the draft's script, for the mixer's `applyScript`. The draft's audio stays where it
     * is (it is now what plays); nothing is restored.
     */
    commit() {
        const d = this.draft;
        this.draft = null;
        this.stash.clear();
        this.pending = null;
        this._side = 'after';
        return d;
    }
    /** Put it back: the committed scene and its audio, exactly as before the draft. */
    close() {
        if (!this.draft)
            return;
        this.restore();
    }
    putBuffersBack() {
        for (const [key, old] of this.stash) {
            if (old)
                this.engine.setAudioBuffer(key, old);
            else
                this.engine.removeAudioBuffer(key);
        }
    }
    restore() {
        this.putBuffersBack();
        this.stash.clear();
        this.draft = null;
        this.pending = null;
        this._side = 'after';
        this.engine.loadScript(this.committed());
    }
}
//# sourceMappingURL=draft.js.map