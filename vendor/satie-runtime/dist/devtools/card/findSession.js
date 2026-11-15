import { setVoiceSource, removeVoiceProperty } from '../../edit/scriptEdit.js';
/** A full round, as `satie_find` sends by default: fewer means the library is running out. */
export const ROUND_SIZE = 6;
/** A sample name without its take number: SATIE's naming rule puts a take (2, 3 …) last, and none on the first (`src/lib/sampleNaming.ts`). */
const soundOf = (name) => name.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-(\d+)$/, (m, n) => (Number(n) >= 2 ? '' : m));
/**
 * The shortlisted sound this candidate is another take of, or null: the server's `takeOf` when
 * it says, else the name rule (same name but for the take number).
 */
/** Two library names for one sound: the same name but for a take number (2, 3 …). */
export function sameSound(a, b) { return soundOf(a) === soundOf(b); }
export function takeOfKept(c, kept) {
    const said = c.takeOf;
    if (said)
        return kept.find(k => k.sampleId === said && k.sampleId !== c.sampleId) ?? null;
    const base = soundOf(c.name);
    return kept.find(k => k.sampleId !== c.sampleId && soundOf(k.name) === base) ?? null;
}
export function newFind(start, opts) {
    return { start, findId: null, round: -1, candidates: [], status: 'starting', degraded: false, suggestGenerate: false, marks: {}, feedback: [], shown: [], loop: opts.loop, shortlist: [], libraryOut: false, known: {} };
}
function applyRound(s, r) {
    const shown = [...s.shown];
    for (const c of r.candidates)
        if (!shown.includes(c.sampleId))
            shown.push(c.sampleId);
    const start = s.start.kind === 'audio' && r.heard && !s.start.heard ? { ...s.start, heard: r.heard } : s.start;
    const kept = new Set(s.shortlist.map(c => c.sampleId));
    const libraryOut = s.libraryOut || r.status === 'nothing-close' || r.suggestGenerate || !!r.exhausted || r.candidates.length < ROUND_SIZE;
    const known = { ...s.known };
    for (const c of r.candidates)
        known[c.sampleId] = c;
    return { ...s, start, known, findId: r.findId, round: r.round, candidates: r.candidates.filter(c => !kept.has(c.sampleId)), status: r.status, degraded: r.degraded, suggestGenerate: r.suggestGenerate,
        marks: {}, shown, libraryOut, ...(r.heard ? { heard: r.heard } : {}), error: undefined };
}
function request(s, feedback) {
    return { ...(s.findId ? { findId: s.findId } : {}), start: s.start, ...(feedback.length ? { feedback } : {}), ...(s.shown.length ? { shown: s.shown } : {}), loop: s.loop };
}
/** Round 0, from the start. */
export async function startFind(start, routes, opts) {
    const s = newFind(start, opts);
    try {
        return applyRound(s, await routes.find(request(s, [])));
    }
    catch (e) {
        return { ...s, status: 'unavailable', error: e instanceof Error ? e.message : String(e) };
    }
}
/** The verdict a sound carries now: this round's mark, else its latest one from an earlier round. */
function verdictOf(s, sampleId) {
    return s.marks[sampleId] ?? [...s.feedback].reverse().find(f => f.sampleId === sampleId)?.verdict;
}
/**
 * Mark a sound More like this (`closer`) or Less like this (`less-close`); the same mark again,
 * or null, clears it; the other mark replaces it, even one an earlier round sent. No network:
 * marks go with the next step.
 */
export function mark(s, sampleId, verdict) {
    if (verdict === null || verdictOf(s, sampleId) === verdict)
        return unmark(s, sampleId);
    const t = unmark(s, sampleId);
    return { ...t, marks: { ...t.marks, [sampleId]: verdict } };
}
/** Take a sound out of Steering by: its mark here and any an earlier round sent. */
export function unmark(s, sampleId) {
    const marks = { ...s.marks };
    delete marks[sampleId];
    return { ...s, marks, feedback: s.feedback.filter(f => f.sampleId !== sampleId) };
}
/** Steering by: every sound marked so far, by its verdict now, in the order first marked. */
export function steering(s) {
    const order = [];
    for (const id of [...s.feedback.map(f => f.sampleId), ...Object.keys(s.marks)])
        if (!order.includes(id))
            order.push(id);
    const of = (id) => s.known[id] ?? s.shortlist.find(c => c.sampleId === id) ?? s.candidates.find(c => c.sampleId === id);
    const pick = (v) => order.filter(id => verdictOf(s, id) === v).map(of).filter((c) => !!c);
    return { more: pick('closer'), less: pick('less-close') };
}
/** Next round: this round's marks join every mark so far; every sound shown is left out. */
export async function nextRound(s, routes) {
    const now = Object.entries(s.marks).map(([sampleId, verdict]) => ({ sampleId, verdict, round: s.round }));
    const feedback = [...s.feedback, ...now];
    const at = { ...s, feedback };
    try {
        return applyRound(at, await routes.find(request(at, feedback)));
    }
    catch (e) {
        return { ...at, marks: s.marks, error: e instanceof Error ? e.message : String(e) };
    }
}
/** Put a sound on your shortlist (your final candidates): it leaves the round list and stays. Twice is once. It does not steer by itself. */
export function shortlist(s, c) {
    if (s.shortlist.some(x => x.sampleId === c.sampleId))
        return s;
    return { ...s, shortlist: [...s.shortlist, c], candidates: s.candidates.filter(x => x.sampleId !== c.sampleId), known: { ...s.known, [c.sampleId]: c } };
}
/** Take a sound off the shortlist: back at the top of the list. Its marks are untouched. */
export function unshortlist(s, sampleId) {
    const c = s.shortlist.find(x => x.sampleId === sampleId);
    if (!c)
        return s;
    return { ...s, shortlist: s.shortlist.filter(x => x.sampleId !== sampleId), candidates: s.candidates.some(x => x.sampleId === sampleId) ? s.candidates : [c, ...s.candidates] };
}
/**
 * The next step, after the first (free, instant) library round: making new ones, steered by the
 * marks, is the main button (for most sounds the library holds a handful of near-identical earlier
 * generations, so a second library round has little range to steer through). Another library
 * round is offered beside it while the library still has close matches. Without generation, the
 * library is all there is.
 */
export function nextSteps(s, opts = {}) {
    if (opts.canGenerate === false)
        return { primary: 'library', library: true };
    return { primary: 'generate', library: !(s.status === 'nothing-close' || s.suggestGenerate || s.libraryOut) };
}
/**
 * The round has marks and none of them is Closer or Less close: About the same keeps the search
 * where it is, so the next round would barely move. The block says so.
 */
export function stalled(s) {
    const v = Object.values(s.marks);
    return v.length > 0 && v.every(x => x === 'same');
}
/** What the find starts from, for the voice the card is on. */
export function startFor(voice) {
    if (voice.sampleId)
        return { kind: 'reference', sampleId: voice.sampleId };
    if (voice.audio)
        return { kind: 'audio', base64: voice.audio.base64, hint: voice.name };
    return { kind: 'words', text: (voice.words ?? voice.name).replace(/,\s*(close|dry)\b.*$/i, '').trim() || voice.name };
}
/**
 * Use this, as script text: every voice in `voices` now plays the candidate's recording, named in
 * the script by its library name (never an opaque take id). A generated voice's own words and
 * versions go (it plays one recording now). Null when a voice cannot be found.
 */
export function useThisScript(script, voices, candidate) {
    let next = script;
    for (const v of voices) {
        const out = setVoiceSource(next, v.loc, { clip: candidate.clip });
        if (out === null)
            return null;
        next = out;
        if (v.generated && v.variants > 1)
            next = removeVoiceProperty(next, v.loc, 'variants') ?? next;
    }
    return next;
}
/** "Use this · for both bells", "only this bell", or just "Use this". */
export function useLabels(name, shared) {
    if (shared <= 1)
        return { all: 'Use this', one: null };
    const many = /s$/.test(name) ? name : `${name}s`;
    return { all: shared === 2 ? `Use this · for both ${many}` : `Use this · for all ${shared} ${many}`, one: `only this ${name}` };
}
/** How many variations Generate plans. */
export const VARY_COUNT = 4;
/** The most a plan may hold (`satie_vary`'s MAX_VARIATIONS). */
export const VARY_MAX = 8;
/** Every mark so far, as `satie_vary` steers by them. */
function steerOf(s) {
    return [...s.feedback, ...Object.entries(s.marks).map(([sampleId, verdict]) => ({ sampleId, verdict, round: s.round }))];
}
/** What a plan varies: the sound it starts from, what was heard in it, or its words. */
function varyFrom(s) {
    return s.start.kind === 'reference' ? { anchor: s.start.sampleId } : s.heard ? { heard: s.heard } : s.start.kind === 'words' ? { text: s.start.text } : {};
}
/**
 * The plan as you edit it: its lines (what each new sound changes), the aim line (`steer`, what
 * the marked sounds share), whether you changed either, and the price for that many lines.
 */
export function planDraft(s) {
    const plan = s.vary?.plan;
    if (!plan)
        return null;
    const original = plan.variations.map(v => (v.differs || v.prompt).trim());
    const originalText = [plan.steer?.trim(), original.map(l => `- ${l}`).join('\n')].filter(Boolean).join('\n\n');
    const text = s.vary?.draft ?? originalText;
    const { lines, aim } = parsePlan(text);
    const edited = s.vary?.draft !== undefined && text.trim() !== originalText.trim();
    const perTake = plan.variations.length ? plan.costCents / plan.variations.length : 1;
    return { text, lines, aim, edited, costCents: edited ? Math.ceil(perTake * lines.length) : plan.costCents };
}
/** Bullets are sounds, with preceding prose as their direction. Without bullets, prose is one sound. */
function parsePlan(text) {
    const lines = [], aim = [];
    let item = null;
    const finish = () => { const line = item?.join(' ').trim(); if (line)
        lines.push(line); };
    for (const line of text.split(/\r?\n/)) {
        const bullet = line.match(/^\s*(?:[-*\u2022]|\d+[.)])\s+(.*)$/);
        if (bullet) {
            finish();
            item = [bullet[1].trim()];
        }
        else if (item)
            item.push(line.trim());
        else
            aim.push(line);
    }
    finish();
    if (item === null)
        return { lines: text.trim() ? [text.trim().replace(/\s*\n\s*/g, ' ')] : [], aim: '' };
    return { lines, aim: aim.join('\n').trim() };
}
/** Keep the notepad verbatim; nothing is called until Make. */
export function editPlan(s, text) {
    if (!s.vary?.plan)
        return s;
    return { ...s, vary: { ...s.vary, error: undefined, draft: text } };
}
/** The developer's edits, as the words a re-plan is written from. */
function editsAsWords(s, d) {
    const own = s.start.kind === 'words' ? `${s.start.text}. ` : '';
    return `${own}Make exactly these ${d.lines.length}, one sound each:\n${d.lines.map((l, k) => `${k + 1}. ${l}`).join('\n')}${d.aim ? `\nWhat they want overall: ${d.aim}` : ''}`;
}
/** A short stable tag for an edited plan (a retry of the same edits recovers the same takes). */
function tag(text) { let h = 5381; for (let k = 0; k < text.length; k++)
    h = ((h * 33) ^ text.charCodeAt(k)) >>> 0; return h.toString(36); }
/** Generate variations, step one (free): what each would change and what they would cost, steered by every mark so far. */
export async function planVariations(s, routes, newKey) {
    if (!routes.vary)
        return { ...s, vary: { error: 'Generate is not available here.' } };
    const steer = steerOf(s);
    try {
        const plan = await routes.vary({ mode: 'plan', ...varyFrom(s), ...(steer.length ? { steer } : {}), count: VARY_COUNT, loop: s.loop });
        return { ...s, vary: { plan, requestKey: newKey() } };
    }
    catch (e) {
        return { ...s, vary: { error: e instanceof Error ? e.message : String(e) } };
    }
}
/**
 * Generate variations, step two (spends): exactly the planned variations, capped at the plan's cost,
 * under the plan's one request key (a retry recovers the takes instead of paying twice). The new
 * takes join the round as candidates, marked new; failures say so.
 */
export async function makeVariations(s, routes) {
    let plan = s.vary?.plan, key = s.vary?.requestKey;
    if (!routes.vary || !plan || !key)
        return s;
    // edited: SATIE writes the prompts from your lines (free), and the make never costs more than shown
    const d = planDraft(s);
    if (d?.edited) {
        if (!d.lines.length)
            return { ...s, vary: { ...s.vary, making: false, error: 'Nothing to make: add a line.' } };
        if (d.lines.length > VARY_MAX)
            return { ...s, vary: { ...s.vary, making: false, error: `Make up to ${VARY_MAX} sounds at a time. Remove a bullet to continue.` } };
        try {
            const words = editsAsWords(s, d);
            const steer = steerOf(s);
            const re = await routes.vary({ mode: 'plan', ...varyFrom(s), text: words, ...(steer.length ? { steer } : {}), count: d.lines.length, loop: s.loop });
            if (re.costCents > d.costCents)
                return { ...s, vary: { plan: re, requestKey: `${key}-${tag(words)}`, error: `Rewritten from your lines, these cost ${re.costCents}¢, more than the ${d.costCents}¢ shown. Check them and press Make again.` } };
            plan = re;
            key = `${key}-${tag(words)}`;
        }
        catch (e) {
            return { ...s, vary: { ...s.vary, making: false, error: e instanceof Error ? e.message : String(e) } };
        }
    }
    try {
        const r = await routes.vary({ mode: 'make', requestKey: key, variations: plan.variations, maxCents: plan.costCents, loop: s.loop });
        const fresh = r.takes.map(t => ({ sampleId: t.sampleId, name: t.name ?? t.differs, clip: t.name ?? '', via: 'steered', url: t.url, snippetPath: null, snippetUrl: null, durationMs: null, license: 'generated with Satie', attribution: null }));
        const shown = [...s.shown, ...fresh.map(c => c.sampleId).filter(id => !s.shown.includes(id))];
        const failed = r.failed.length ? `${r.failed.length} could not be made.` : undefined;
        const known = { ...s.known };
        for (const c of fresh)
            known[c.sampleId] = c;
        return { ...s, known, candidates: [...fresh, ...s.candidates], shown, made: [...(s.made ?? []), ...fresh.map(c => c.sampleId)], vary: failed ? { error: failed } : undefined };
    }
    catch (e) {
        return { ...s, vary: { ...s.vary, making: false, error: e instanceof Error ? e.message : String(e) } };
    }
}
//# sourceMappingURL=findSession.js.map