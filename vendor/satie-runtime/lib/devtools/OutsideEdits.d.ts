import { describeVoiceChanges, type VoiceChange, type VoiceRef } from '../edit/voiceChanges.js';
type SetChange = Extract<VoiceChange, {
    change: 'set' | 'unset';
}>;
/** One voice across two parses: its source id, else what it is, plays and sits on. */
export declare const voiceKey: (v: VoiceRef) => string;
/** Who made a history step, from its kind: the developer, SATIE's chat, the coding agent, or outside the mixer. */
export type Maker = 'you' | 'SATIE' | 'your coding agent' | 'outside the mixer';
export declare function makerOf(kind: string): Maker;
/** What the developer set: the value they left a property at, and the step that did it. */
export interface MySetting {
    value: string | null;
    at: number;
    label: string;
    kind: string;
}
/** A history step as this module reads it: its kind, label, time, and its script and its parent's. */
export interface Step {
    kind: string;
    label: string;
    at: number;
    script: string;
    parentScript: string | null;
}
/**
 * The developer's own settings among `wanted` property keys, newest step first (the history's spine,
 * head first). A later outside or SATIE step that changed the same property ends the claim: the
 * developer did not set what is there now. `diff` is injectable for tests and for a cache.
 */
export declare function mySettings(spine: readonly Step[], wanted: ReadonlySet<string>, diff?: typeof describeVoiceChanges): Map<string, MySetting>;
/** An outside change that undoes the developer's own setting. */
export interface Clash {
    change: SetChange;
    mine: MySetting;
}
/** The outside edit's changes that touch a property the developer set, with what they had set it to. */
export declare function clashes(before: string, after: string, spine: readonly Step[], diff?: typeof describeVoiceChanges): {
    changes: VoiceChange[];
    clashes: Clash[];
};
/**
 * The script with the developer's values put back over the outside edit, one property each, by
 * the same surgery the mixer's faders use. null when a voice can no longer be found or the result
 * would not parse; everything else the outside edit did stays.
 */
export declare function putMineBack(script: string, picked: readonly Clash[]): string | null;
/** "Kessler buzzer: level 70 → 76" in the mixer's words (`name` turns a voice into its shown name). */
export declare function clashLine(c: Clash, name: (v: VoiceRef) => string): string;
export {};
//# sourceMappingURL=OutsideEdits.d.ts.map