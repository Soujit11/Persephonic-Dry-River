export interface VoiceRef {
    /** Authored identity when the voice has one. */
    sourceId?: string;
    /** `loop` / `oneshot` / `trigger` / `on <event>`. */
    kind: string;
    /** What it plays: the gen prompt, else the clip. */
    sound: string;
    host?: string;
    /** 0-based head line in the script the change is read against (after for adds and sets, before for removals). */
    line: number;
}
export type VoiceChange = {
    change: 'add' | 'remove';
    voice: VoiceRef;
}
/** The head line changed: the sound, the kind or the count. */
 | {
    change: 'source';
    voice: VoiceRef;
    from: string;
    to: string;
}
/** `origin` is where the value is written: on the voice, or on a group or entity it inherits from. */
 | {
    change: 'set' | 'unset';
    voice: VoiceRef;
    prop: string;
    from: string | null;
    to: string | null;
    origin: string;
};
export declare function describeVoiceChanges(before: string, after: string): {
    changes: VoiceChange[];
    truncated: number;
} | null;
//# sourceMappingURL=voiceChanges.d.ts.map