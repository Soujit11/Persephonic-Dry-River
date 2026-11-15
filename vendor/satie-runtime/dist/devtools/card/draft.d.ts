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
export interface Draft {
    script: string;
    /** Take key → candidate audio (a find candidate heard where the sound plays). */
    buffers?: Record<string, AudioBuffer>;
}
/** The part of the engine a draft touches. */
export interface DraftEngine {
    loadScript(text: string): void;
    getAudioBuffers(): ReadonlyMap<string, AudioBuffer>;
    setAudioBuffer(key: string, buffer: AudioBuffer): void;
    removeAudioBuffer(key: string): boolean;
}
export type DraftSide = 'after' | 'before';
export declare class DraftPlayer {
    private readonly engine;
    private readonly committed;
    private readonly schedule;
    private draft;
    /** What each overridden take key held before the draft (undefined: nothing). */
    private stash;
    private _side;
    /**
     * @param committed the committed script, read fresh each time (the mixer's document).
     * @param schedule  coalesces handle drags to one engine load per frame (requestAnimationFrame).
     */
    constructor(engine: DraftEngine, committed: () => string, schedule?: (run: () => void) => void);
    get open(): boolean;
    get side(): DraftSide;
    /** The script the draft would commit, null when none is open. */
    get script(): string | null;
    /** Open a draft and play it ("after"). False when the engine refuses the script (nothing changes). */
    preview(d: Draft): boolean;
    /** A handle moved: the draft's script changes and is heard (at most once a frame). */
    private pending;
    update(script: string): void;
    /** Switch between the committed scene ("before") and the draft ("after"), the playhead running on. */
    flip(side: DraftSide): void;
    /**
     * Keep it: the draft's script, for the mixer's `applyScript`. The draft's audio stays where it
     * is (it is now what plays); nothing is restored.
     */
    commit(): Draft | null;
    /** Put it back: the committed scene and its audio, exactly as before the draft. */
    close(): void;
    private putBuffersBack;
    private restore;
}
//# sourceMappingURL=draft.d.ts.map