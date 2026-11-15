/**
 * Voice names (shared by the devtools mixer and the platform mixer): the sound in a few
 * words, what it sounds like in one line, and what it does for the thing it belongs to.
 */
import type { Statement } from './Statement';
/** The sound, in a few words: "tree frogs", "higurashi cicadas", "barrier gear motor" (the prompt's noun phrase). */
export declare function shortName(st: Pick<Statement, 'isGenerated' | 'genPrompt' | 'clip'>): string;
/**
 * What a sound sounds like, in one line: the prompt without its instructions to the generator
 * (how to record it, what not to do), which stay in edit. A recording is its name.
 */
export declare function soundsLike(st: Pick<Statement, 'isGenerated' | 'genPrompt' | 'clip'>): string;
/**
 * An authored id as words: `pigeons_1_coo` → "pigeon coo". Numbers drop (they count copies, not
 * sounds) and a plural word reads singular. Empty when nothing is left.
 */
export declare function readableId(id: string | null | undefined): string;
/**
 * A sound's name when nobody gave it one, in order: the name its take was stored under (the
 * sample-name grammar), a recording's own clip name, its `source_id` as words, the thing it is on
 * with what it does, and last the description's noun phrase. Scenes made before takes carried a
 * name read from their ids, never from a fragment of the generation prompt ("gives a short").
 */
export declare function fallbackName(st: Pick<Statement, 'kind' | 'eventName' | 'hostRef' | 'entityId' | 'isGenerated' | 'genPrompt' | 'clip' | 'sourceId'>, opts?: {
    stored?: string | null;
    hostLabel?: (id: string) => string;
}): string;
/**
 * What a sound does, in a few words, without repeating the thing it belongs to: an event sound is
 * its event (`door_open` on the porch door is "open"), anything else is its sound ("tree frogs").
 */
export declare function soundAction(st: Pick<Statement, 'kind' | 'eventName' | 'hostRef' | 'entityId' | 'isGenerated' | 'genPrompt' | 'clip'>): string;
/** Authored playback conditions shared by the embedded and platform mixer cards. */
export declare function whenItPlays(st: Statement): string[];
//# sourceMappingURL=voiceNames.d.ts.map