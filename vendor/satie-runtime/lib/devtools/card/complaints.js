/**
 * "What's off?": a fixed catalogue of complaints a developer would say, each shown only when
 * what the mixer measures for this sound, where the listener stands now, says it applies. No
 * model is asked when a card opens; open-ended complaints go through the say-it box.
 *
 * Pure: the mixer hands in a `SoundSituation` snapshot (from the level model) and gets the
 * complaints that apply, each with this sound's own evidence.
 */
import { reachMeters, sayDistance, everyShape, fmtLoud } from './dials.js';
/** How far above everything else a sound must be heard before "too loud here" is offered (dB). */
export const LOUDEST_MARGIN_DB = 6;
/** Under this a sound is too quiet to be "too loud" anywhere (dB SPL at the ear). */
const AUDIBLE_FLOOR_DB = 35;
/** Heard from at least this far away, "it carries too far" is worth asking (m). */
export const FAR_M = 30;
/** A sound that fades out within this distance, while you stand past it but not far, "only up close" (m). */
export const CLOSE_M = 15;
const NEAR_ENOUGH_M = 60;
/** A now-and-then sound coming round this often or more is worth asking about (s, the middle of its range). */
export const OFTEN_S = 6;
/** Under this spread (`every 14to16` is 0.07) a now-and-then sound keeps time like a clock. */
export const CLOCKWORK_SPREAD = 0.12;
export function complaintsFor(s) {
    const out = [];
    const next = s.others[0];
    if (s.receivedDb !== null && s.receivedDb >= AUDIBLE_FLOOR_DB && next && s.receivedDb - next.receivedDb >= LOUDEST_MARGIN_DB) {
        out.push({ id: 'tooLoudHere', text: "It's too loud next to everything else here", evidence: `the loudest thing you hear here, loudness ${fmtLoud(s.receivedDb)}` });
    }
    if (s.covered && s.covered.marginDb < 0) {
        out.push({ id: 'barelyHear', text: 'You can barely hear it', evidence: `covered by the ${s.covered.by}` });
    }
    const reach = s.emissionDb !== null && s.floorDb !== null ? reachMeters(s.emissionDb, s.floorDb, s.path) : null;
    if (s.placed && s.distanceM !== null && s.receivedDb !== null && !s.covered && s.distanceM >= FAR_M) {
        out.push({ id: 'carriesTooFar', text: 'It carries too far', evidence: `you still hear it ${sayDistance(s.distanceM)} away` });
    }
    if (s.placed && s.distanceM !== null && reach !== null && reach < CLOSE_M && s.distanceM > reach && s.distanceM <= NEAR_ENOUGH_M) {
        out.push({ id: 'onlyUpClose', text: 'You only hear it up close', evidence: `it fades out ${sayDistance(reach)} from it; you are ${sayDistance(s.distanceM).replace(/^about /, '')} away` });
    }
    if (s.every) {
        const e = everyShape(s.every.min, s.every.max);
        const sec = (x) => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x));
        if (e.middleS <= OFTEN_S)
            out.push({ id: 'playsTooOften', text: 'It plays too often', evidence: `about every ${sec(e.middleS)} s` });
        if (e.spread < CLOCKWORK_SPREAD)
            out.push({ id: 'tooRegular', text: 'It plays too regularly', evidence: `like clockwork, every ${sec(e.middleS)} s` });
    }
    // always there for a sound that plays a recording: the way to change what it is (it opens the find, no proposal)
    if (s.canFind)
        out.push({ id: 'notTheRightSound', text: "It's not the right sound", evidence: 'hear others and steer toward the one you want' });
    return out;
}
//# sourceMappingURL=complaints.js.map