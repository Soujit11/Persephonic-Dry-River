/**
 * A tapped complaint becomes a proposal with no model call: a pure recipe aims at a target
 * taken from what the listener hears (not a fixed step), so one tap usually lands close, and
 * the reply can say why. The developer hears it in place, fine-tunes it on the dial, then
 * keeps it or puts it back.
 */
import type { Complaint, SoundSituation } from './complaints.js';
/**
 * Every change the developer did not make by hand arrives as a Proposal, from a recipe here or
 * from the chat (a card turn). The card treats both alike.
 */
export interface Proposal {
    /** The plain-words reply: what changed and why. */
    text: string;
    /** The whole candidate script. */
    script: string;
    /** Source ids it touches. */
    target: string[];
    /** Source ids it creates (a new sound): the card opens on that voice. */
    creates?: string[];
    origin: 'recipe' | 'chat';
    /** The history label if it is kept. */
    label: string;
    /** The complaint it answers, for the edit record. */
    complaint?: string;
}
/** The level writer the mixer uses (`trimSourceLevels`): keeps ranges and follow maps, respects the clamp. */
export type TrimLevels = (script: string, sourceIds: readonly string[], deltaDb: number) => string | null;
/** Writes one property on THIS voice (the surgeon, located by its source id). */
export type WriteProp = (script: string, key: string, raw: string) => string | null;
/** How far above the next loudest sound "too loud here" leaves it (dB): still the one you notice, no longer on top. */
export declare const SIT_ABOVE_DB = 3;
export declare function recipeFor(c: Complaint, s: SoundSituation, script: string, trim: TrimLevels, write?: WriteProp): Proposal | null;
/** "Plays too often" doubles the wait, up to this (s). */
export declare const EVERY_CAP_S = 600;
/** "Too regular" widens each gap to wander this much around the same middle (`every 6to24` for 15 s). */
export declare const UNEVEN_SPREAD = 0.6;
/** "Carries too far": its reach lands this fraction of the way to you, so it fades out just before you. */
export declare const CARRY_SHORT = 0.8;
/** "Only up close": its reach goes this many times as far as you stand. */
export declare const CARRY_PAST = 2;
//# sourceMappingURL=recipes.d.ts.map