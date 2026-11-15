/** The sound, in a few words: "tree frogs", "higurashi cicadas", "barrier gear motor" (the prompt's noun phrase). */
export function shortName(st) {
    const raw = st.isGenerated ? (st.genPrompt ?? '') : st.clip.replace(/^(?:community|freesound|Audio)\//, '');
    if (!st.isGenerated)
        return raw.replace(/[-_]+/g, ' ').replace(/\s+\d+$/, '').trim();
    // a first clause of only a word or two ("three large, low throaty gulps") is a describer, not the
    // sound: it runs on into the next clause (it named the gulps "large")
    const parts = raw.split(/,/);
    const lead = parts[0].trim().split(/\s+/).length <= 2 && parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
    const first = lead.toLowerCase().replace(/^(a|an|the|single|one|small|large|two|three)\s+/g, '');
    const ws = first.split(/\s+/);
    // nouns that end in -ing are not the verb ("level CROSSING bell"); cut at the first verb or preposition
    const NOUN_ING = new Set(['crossing', 'building', 'ceiling', 'railing', 'ring', 'spring', 'string', 'wing', 'awning', 'evening', 'morning', 'lightning', 'siding', 'bedding', 'clothing', 'ping']);
    const cut = ws.findIndex((w, k) => k > 0 && ((/ing$/.test(w) && !NOUN_ING.has(w)) || (/ed$/.test(w) && k > 1) || ['and', 'across', 'along', 'over', 'under', 'on', 'in', 'with', 'from', 'through', 'by', 'at', 'of', 'into', 'onto'].includes(w)));
    let phrase = (cut > 0 ? ws.slice(0, cut) : ws).filter(w => !['japanese', 'single', 'small'].includes(w) || ws.length < 3);
    if (phrase.length > 3)
        phrase = phrase.slice(-3);
    if (phrase.length === 1 && cut > 0 && /ing$/.test(ws[cut]))
        phrase.push(ws[cut]); // "water" → "water trickling"
    return phrase.join(' ') || first;
}
/**
 * What a sound sounds like, in one line: the prompt without its instructions to the generator
 * (how to record it, what not to do), which stay in edit. A recording is its name.
 */
export function soundsLike(st) {
    if (!st.isGenerated)
        return st.clip.replace(/^(?:community|freesound|Audio)\//, '').replace(/[-_]+/g, ' ');
    const RECORDING = /\b(dry|recording|recorded|reverb|seamless|loop|loopable|consistent texture|single sound event|mono|stereo|mic|microphone)\b/i;
    const clauses = (st.genPrompt ?? '').split(/,\s*/).map(c => c.trim()).filter(Boolean)
        .filter(c => !RECORDING.test(c) && !/^(no|without|not)\b/i.test(c));
    const line = clauses.join(', ');
    return line.length > 150 ? `${line.slice(0, 147).replace(/[\s,]+\S*$/, '')}…` : line;
}
/**
 * An authored id as words: `pigeons_1_coo` → "pigeon coo". Numbers drop (they count copies, not
 * sounds) and a plural word reads singular. Empty when nothing is left.
 */
export function readableId(id) {
    if (!id)
        return '';
    return id.split(/[_\-.\s]+/).filter(w => w && !/^\d+$/.test(w))
        .map(w => w.toLowerCase())
        .map(w => (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w))
        .join(' ');
}
/**
 * A sound's name when nobody gave it one, in order: the name its take was stored under (the
 * sample-name grammar), a recording's own clip name, its `source_id` as words, the thing it is on
 * with what it does, and last the description's noun phrase. Scenes made before takes carried a
 * name read from their ids, never from a fragment of the generation prompt ("gives a short").
 */
export function fallbackName(st, opts = {}) {
    if (opts.stored && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(opts.stored))
        return opts.stored.replace(/-\d+$/, '').replace(/-/g, ' ');
    if (!st.isGenerated)
        return shortName(st);
    const own = readableId(st.sourceId);
    // an id that only repeats the thing it is on (`northbound_lane` on northbound_lane) names the thing, not the sound
    if (own && own !== readableId(st.hostRef))
        return own;
    if (st.hostRef) {
        const host = (opts.hostLabel?.(st.hostRef) ?? readableId(st.hostRef)).trim();
        const doing = soundAction(st);
        const words = new Set(host.toLowerCase().split(/\s+/));
        const extra = doing.split(/\s+/).filter(w => !words.has(w.toLowerCase())).join(' ');
        if (host)
            return extra ? `${host} ${extra}` : host;
    }
    return shortName(st);
}
/**
 * What a sound does, in a few words, without repeating the thing it belongs to: an event sound is
 * its event (`door_open` on the porch door is "open"), anything else is its sound ("tree frogs").
 */
export function soundAction(st) {
    if (st.kind === 'trigger' && st.eventName) {
        const own = new Set(`${st.hostRef ?? ''} ${st.entityId ?? ''}`.toLowerCase().split(/[\s_]+/).filter(Boolean));
        const words = st.eventName.toLowerCase().split(/[\s_]+/).filter(Boolean);
        const left = words.filter(w => !own.has(w));
        return (left.length ? left : words).join(' ');
    }
    return shortName(st);
}
/** Authored playback conditions shared by the embedded and platform mixer cards. */
export function whenItPlays(st) {
    const out = [];
    const w = (x) => x.replace(/_/g, ' ');
    const rng = (r) => (r.isRange && r.min !== r.max ? `${r.min} to ${r.max}` : String(r.min));
    if (st.kind === 'trigger' && st.eventName)
        out.push(`on "${w(st.eventName)}"`);
    else if (!st.every.isNull)
        out.push(`every ${rng(st.every)} s`);
    else if (st.kind === 'loop')
        out.push((st.bed || st.field) ? 'all the time, all around' : 'all the time');
    if (st.zones?.length)
        out.push(`only in ${st.zones.map(w).join(' or ')}`);
    if (st.whenCondition)
        out.push(`while ${w(st.whenCondition.signal)} is ${st.whenCondition.min} to ${st.whenCondition.max}`);
    if (st.activeHours?.length)
        out.push(`only ${st.activeHours.map(([a, b]) => `${a}:00 to ${b}:00`).join(', ')}`);
    if (st.volumeFollow)
        out.push(`level follows ${w(st.volumeFollow.signal)}`);
    if (st.within !== null && st.within !== undefined)
        out.push(`only within ${st.within} m of you`);
    if (!st.cooldown.isNull && st.kind === 'trigger')
        out.push(`at most every ${rng(st.cooldown)} s`);
    return out;
}
//# sourceMappingURL=voiceNames.js.map