/**
 * "What's off?": a fixed catalogue of complaints a developer would say, each shown only when
 * what the mixer measures for this sound, where the listener stands now, says it applies. No
 * model is asked when a card opens; open-ended complaints go through the say-it box.
 *
 * Pure: the mixer hands in a `SoundSituation` snapshot (from the level model) and gets the
 * complaints that apply, each with this sound's own evidence.
 */
import { type ReachPath } from './dials.js';
/** Another sound heard where the listener stands. */
export interface HeardSound {
    /** The source ids of every voice playing this recording (one entry per recording). */
    sourceIds: string[];
    label: string;
    receivedDb: number;
}
/** What the mixer measures about one sound, where the listener stands now. */
export interface SoundSituation {
    label: string;
    /** The card's own voice, null when it has no `source_id`. */
    sourceId: string | null;
    /** Every voice that plays this sound's recording (the card's own first), with a level the mixer can move. */
    sameRecording: string[];
    /** Its loudest voice's level at the ear, null when it is not heard now. */
    receivedDb: number | null;
    /** The other sounds heard here now, loudest first, one entry per recording. */
    others: HeardSound[];
    /** Its level is the mixer's to move (its own source id and a static `spl`). */
    levelMovable: boolean;
    /** It has a place of its own (not all around you, not carried by you): it can be near or far. */
    placed: boolean;
    /** Metres from the listener to its nearest voice, null when it has no place. */
    distanceM: number | null;
    /** Its emission at 1 m and the hearing floor where you stand (for its reach), null when unknown. */
    emissionDb: number | null;
    floorDb: number | null;
    path: ReachPath;
    /** It is sounding but covered by another sound (its masking margin is under 0), null when it comes through. */
    covered: {
        by: string;
        marginDb: number;
    } | null;
    /** A one-shot's `every` (the gap range, s); null for a loop or an event sound. */
    every: {
        min: number;
        max: number;
    } | null;
    /** It plays one recording the find can replace (not a per-surface bank, not silent words). */
    canFind: boolean;
}
export type ComplaintId = 'tooLoudHere' | 'barelyHear' | 'carriesTooFar' | 'onlyUpClose' | 'playsTooOften' | 'tooRegular' | 'notTheRightSound';
export interface Complaint {
    id: ComplaintId;
    /** What the developer would say. */
    text: string;
    /** This sound's evidence, in grey under it. */
    evidence: string;
}
/** How far above everything else a sound must be heard before "too loud here" is offered (dB). */
export declare const LOUDEST_MARGIN_DB = 6;
/** Heard from at least this far away, "it carries too far" is worth asking (m). */
export declare const FAR_M = 30;
/** A sound that fades out within this distance, while you stand past it but not far, "only up close" (m). */
export declare const CLOSE_M = 15;
/** A now-and-then sound coming round this often or more is worth asking about (s, the middle of its range). */
export declare const OFTEN_S = 6;
/** Under this spread (`every 14to16` is 0.07) a now-and-then sound keeps time like a clock. */
export declare const CLOCKWORK_SPREAD = 0.12;
export declare function complaintsFor(s: SoundSituation): Complaint[];
//# sourceMappingURL=complaints.d.ts.map