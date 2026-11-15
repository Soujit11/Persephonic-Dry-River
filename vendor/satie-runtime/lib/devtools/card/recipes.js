import { emissionForReach, sayDistance, everyShape, everyText, everyWords, SPREAD_MAX, fmtLoudDelta } from './dials.js';
/** How far above the next loudest sound "too loud here" leaves it (dB): still the one you notice, no longer on top. */
export const SIT_ABOVE_DB = 3;
export function recipeFor(c, s, script, trim, write) {
    if (c.id === 'tooLoudHere') {
        const next = s.others[0];
        if (!s.levelMovable || s.receivedDb === null || !next || !s.sameRecording.length)
            return null;
        const delta = Math.round(next.receivedDb + SIT_ABOVE_DB - s.receivedDb);
        if (delta >= 0)
            return null;
        const out = trim(script, s.sameRecording, delta);
        if (out === null || out === script)
            return null;
        const who = s.sameRecording.length > 1 ? `all ${s.sameRecording.length} of them` : 'it';
        return {
            text: `Turned ${who} down ${fmtLoudDelta(-delta).slice(1)}, so it sits just above the ${next.label}.`,
            script: out, target: [...s.sameRecording], origin: 'recipe', complaint: c.id,
            label: `${s.label}: quieter, just above the ${next.label}`,
        };
    }
    if (c.id === 'barelyHear') {
        if (!s.levelMovable || !s.covered || !s.sameRecording.length)
            return null;
        // up until it clears what covers it by about 3 dB
        const delta = Math.ceil(SIT_ABOVE_DB - s.covered.marginDb);
        return level(s, script, trim, delta, `Turned it up ${fmtLoudDelta(delta).slice(1)}, so it comes through the ${s.covered.by}.`, `louder, comes through the ${s.covered.by}`, c.id);
    }
    if (c.id === 'carriesTooFar' || c.id === 'onlyUpClose') {
        if (!s.levelMovable || s.distanceM === null || s.emissionDb === null || s.floorDb === null || !s.sameRecording.length)
            return null;
        // aim the reach at where you stand: just short of you (too far), or twice as far (only up close)
        const want = c.id === 'carriesTooFar' ? s.distanceM * CARRY_SHORT : s.distanceM * CARRY_PAST;
        const delta = Math.round(emissionForReach(want, s.floorDb, s.path) - s.emissionDb);
        if (c.id === 'carriesTooFar' ? delta >= 0 : delta <= 0)
            return null;
        return c.id === 'carriesTooFar'
            ? level(s, script, trim, delta, `Turned it down ${fmtLoudDelta(-delta).slice(1)}: you'll stop hearing it about here, ${sayDistance(want)} from it.`, 'quieter, carries less far', c.id)
            : level(s, script, trim, delta, `Turned it up ${fmtLoudDelta(delta).slice(1)}, so it carries to ${sayDistance(want)}.`, 'louder, carries further', c.id);
    }
    if ((c.id === 'playsTooOften' || c.id === 'tooRegular') && s.every && write) {
        // timing belongs to each sound: this voice only, not every voice of the recording
        const e = everyShape(s.every.min, s.every.max);
        const next = c.id === 'playsTooOften'
            ? { middleS: Math.min(EVERY_CAP_S, e.middleS * 2), spread: e.spread }
            : { middleS: e.middleS, spread: Math.min(SPREAD_MAX, Math.max(e.spread, UNEVEN_SPREAD)) };
        const raw = everyText(next);
        const out = write(script, 'every', raw);
        if (out === null || out === script)
            return null;
        const [lo, hi] = raw.split('to').map(Number);
        const now = everyWords(lo, hi ?? lo);
        return c.id === 'playsTooOften'
            ? { text: `Made it wait twice as long: ${now}.`, script: out, target: s.sourceId ? [s.sourceId] : [], origin: 'recipe', complaint: c.id, label: `${s.label}: less often` }
            : { text: `Made it less predictable: ${now}.`, script: out, target: s.sourceId ? [s.sourceId] : [], origin: 'recipe', complaint: c.id, label: `${s.label}: less regular` };
    }
    return null;
}
/** "Plays too often" doubles the wait, up to this (s). */
export const EVERY_CAP_S = 600;
/** "Too regular" widens each gap to wander this much around the same middle (`every 6to24` for 15 s). */
export const UNEVEN_SPREAD = 0.6;
/** "Carries too far": its reach lands this fraction of the way to you, so it fades out just before you. */
export const CARRY_SHORT = 0.8;
/** "Only up close": its reach goes this many times as far as you stand. */
export const CARRY_PAST = 2;
/** One level move on every voice of the recording, as a proposal. */
function level(s, script, trim, delta, text, what, complaint) {
    if (!delta)
        return null;
    const out = trim(script, s.sameRecording, delta);
    if (out === null || out === script)
        return null;
    return { text, script: out, target: [...s.sameRecording], origin: 'recipe', complaint, label: `${s.label}: ${what}` };
}
//# sourceMappingURL=recipes.js.map