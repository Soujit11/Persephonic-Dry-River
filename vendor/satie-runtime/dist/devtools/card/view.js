/**
 * Draws the sound card (plain DOM, the mixer's `.satie-dt` stylesheet). Order: "what's off?"
 * (or, while one is open, the proposal), the dials named for what you hear, then the sections
 * it still borrows from the mixer. Every number comes from a parsed script or the level model
 * (`host`), never from the DOM: during a proposal each moved dial's handle is read from the
 * proposal's script and its ghost from the committed one, so the picture and the sound cannot
 * disagree.
 */
import { word, count } from '../words.js';
import { sourceChooser } from './source.js';
import { synthAssetFor } from '../../synth/asset.js';
import { instrumentById } from '../../synth/instruments.js';
import { HOW_LOUD, SLIDER_DIALS, TIMING_DIALS, readHowLoud, howLoudReadout } from './dials.js';
import { nextTicks } from './rhythm.js';
import { upsertVoiceProperty, removeVoiceProperty, setVoiceSource } from '../../edit/scriptEdit.js';
import { complaintsFor } from './complaints.js';
import { recipeFor } from './recipes.js';
import { DraftPlayer } from './draft.js';
import { Pulse } from './pulse.js';
import { tryParse } from '../../core/SatieParser.js';
import { findView } from './findView.js';
import { newFind, startFind, nextRound, useLabels as selectionLabels, planVariations, makeVariations, shortlist as shortlistFind, unshortlist, mark as markFind, unmark, editPlan } from './findSession.js';
import { readCrowd, writeCrowd, sayEvery, COUNT_MIN, COUNT_MAX, SPEED_MIN, SPEED_MAX } from './crowd.js';
import { everyShape, everyWords, oftenToPos, posToOften, SPREAD_MAX } from './dials.js';
import { readMotion, writeMotion, areaAround, sayArea, speedToPos, posToSpeed } from './motion.js';
/** A candidate played this long counts as a listen (ms). */
const LISTEN_MS = 200;
function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls)
        n.className = cls;
    if (text !== undefined)
        n.textContent = text;
    return n;
}
/** The timing dials: heard at the game's own pace while held (the editing pulse would mislead). */
const TIMING_IDS = new Set(['howOften', 'howRegular']);
const TIMING_COMPLAINTS = new Set(['playsTooOften', 'tooRegular']);
/** A proposal's level move, in dB, relative to the committed level (the dial's ghost sits at 0). */
const DRAFT_DB = { min: -40, max: 20 };
/** The spl the script gives this source (its range's low end), or null. */
const splOf = (script, sourceId) => {
    const st = tryParse(script).statements?.find(s => s.sourceId === sourceId);
    return st && !st.splFollow && !st.spl.isNull ? st.spl.min : null;
};
function dialHead(info) {
    const head = el('div', 'cdh');
    const name = el('span', 'cdn', info.label);
    name.title = info.hint;
    head.appendChild(name);
    return head;
}
export function mountCard(host, i) {
    const card = el('div', 'satie-dt-card');
    const first = host.statement(i);
    if (!first)
        return { el: card, refresh() { }, holding: () => false, close() { }, findVersion() { } };
    const sourceId = first.sourceId ?? null;
    const nowAndThen = first.kind !== 'loop';
    const draft = new DraftPlayer(host.draftEngine, () => host.script(), host.schedule);
    let note = null;
    const pulse = new Pulse({
        fire: () => host.fireNow(i), durationS: () => host.durationS(i),
        setTimer: (run, ms) => setTimeout(run, ms), clearTimer: t => clearTimeout(t),
        onSilent: () => { note = `silent here now: ${host.silentReason(i)}`; paintNote(); },
    });
    let proposal = null;
    let proposalRevision = 0;
    /** The proposal's level move as adjusted on the dial (dB from committed). */
    let draftDelta = 0;
    let shownIds = '';
    /** A dial is being dragged by hand: its preview is loaded, so the mixer must not rebuild the card under it. */
    let dragging = false;
    /** The card went away: a reply that arrives later only goes to the conversation. */
    let closed = false;
    /**
     * Playing here now: the sound is held audible whatever the game is doing (the bell is silent
     * until a train comes), and a now-and-then sound fires again and again, so every change is heard
     * as it is made. On from the moment the card opens; Stop ends it.
     */
    let listening = false;
    /** The editing replay, paused while a timing dial is held (so the game's own pace is what you hear). */
    let pacePaused = false;
    const listenBar = el('div', 'clisten');
    listenBar.dataset.section = 'listen';
    function setListening(on) {
        listening = on;
        host.listen(i, on);
        if (nowAndThen) {
            if (on) {
                note = null;
                paintNote();
                pulse.setKeepPlaying(true);
            }
            else
                pulse.stop();
        }
        paintListen();
    }
    function paintListen() {
        listenBar.replaceChildren();
        const b = el('button', 'clb', listening ? '■ Stop' : '▶ Play');
        b.dataset.on = listening ? '1' : '0';
        b.setAttribute('aria-pressed', String(listening));
        b.title = listening ? 'stop playing it (the game plays it again when it would)' : 'play it here now, whatever the game is doing';
        b.addEventListener('click', () => setListening(!listening));
        listenBar.append(b, el('span', 'clw', host.published ? (listening ? 'Playing now.' : 'Play it to hear it alone.') : listening ? 'Playing now. Change it and hear it at once.' : 'Play it to hear changes as you make them.'));
    }
    const off = el('section', 'coff');
    off.dataset.section = 'off';
    off.setAttribute('aria-label', "What's off");
    const noteEl = el('div', 'cnote');
    noteEl.hidden = true;
    const dials = el('section', 'cdials');
    dials.dataset.section = 'dials';
    dials.setAttribute('aria-label', 'How it sounds');
    const moveSec = el('section', 'cmove');
    moveSec.dataset.section = 'move';
    moveSec.setAttribute('aria-label', 'How it moves');
    // a crowd's member: the way to its crowd (how many, how often one comes) is on its own card
    if (first.entityId) {
        const crowd = el('div', 'cdver ccrowd');
        crowd.appendChild(el('span', undefined, `one of the ${first.entityId.replace(/_/g, ' ')} crowd`));
        const go = el('button', 'link', 'edit the crowd ›');
        go.dataset.nav = '1';
        go.title = 'how many there are, how often one comes, how fast';
        go.addEventListener('click', () => host.openCrowd(first.entityId));
        crowd.appendChild(go);
        card.appendChild(crowd);
    }
    // everything a game developer rarely needs folds away under one line
    const more = el('details', 'cmore');
    more.dataset.section = 'more';
    const moreDials = el('section', 'cdials');
    moreDials.dataset.section = 'more-dials';
    more.append(el('summary', undefined, 'More settings'), moreDials, moveSec, ...host.sections(i));
    const sourceRow = el('div', 'cdver');
    sourceRow.append(el('span', undefined, 'Source '));
    const sourceChoice = el('select');
    sourceChoice.setAttribute('aria-label', 'Sound source');
    for (const [value, label] of [['sample', 'Sample'], ['synth', 'Synth']]) {
        const option = el('option', undefined, label);
        option.value = value;
        sourceChoice.append(option);
    }
    sourceChoice.value = first.synth ? 'synth' : 'sample';
    let choosingSource = null;
    sourceChoice.disabled = !!host.published || ['group', 'entity'].includes(first.propertySpans.get('synth')?.origin ?? '');
    sourceChoice.addEventListener('change', () => {
        const st = host.statement(i);
        if (!st)
            return;
        const synth = sourceChoice.value === 'synth';
        if (host.createSource) {
            choosingSource?.close();
            choosingSource = sourceChooser({ synth, prompt: st.genPrompt ?? st.clip.replace(/[_/]/g, ' '),
                create: request => host.createSource(i, request),
                ...(host.restoreSource && host.hasPreviousSource?.(i, synth) ? { restore: () => host.restoreSource(i, synth) } : {}),
                close: () => { choosingSource = null; sourceChoice.value = host.statement(i)?.synth ? 'synth' : 'sample'; }, });
            sourceRow.after(choosingSource.el);
            return;
        }
        const next = setVoiceSource(host.script(), host.locator(i), { genPrompt: st.genPrompt ?? st.clip.replace(/[_/]/g, ' '), synth });
        if (next === null || !host.applyScript(next, synth ? 'Use synthesizer' : 'Use a sample', { kind: 'source', detail: { synth } }))
            sourceChoice.value = st.synth ? 'synth' : 'sample';
    });
    sourceRow.append(sourceChoice);
    if (first.synth) {
        const asset = host.takeKeys(i).map(key => host.draftEngine.getAudioBuffers().get(key)).filter((b) => !!b).map(synthAssetFor).find(Boolean);
        if (asset)
            sourceRow.append(el('span', undefined, asset.patch.layers.map(l => l.instrument ? instrumentById(l.instrument.id)?.name ?? l.name : l.name).join(' · ')));
        if (host.createSource) {
            const change = el('button', undefined, 'Change instrument…');
            change.addEventListener('click', () => { sourceChoice.value = 'synth'; sourceChoice.dispatchEvent(new Event('change')); });
            sourceRow.append(change);
        }
        for (const [key, label, value, min, max] of [
            ['synth_brightness', 'Brightness', (first.synthBrightness.isNull ? 1 : first.synthBrightness.min), .05, 8],
            ['synth_tempo', 'Tempo', (first.synthTempo.isNull ? 1 : first.synthTempo.min), .1, 4],
        ]) {
            const row = el('label', 'cdver');
            row.append(el('span', undefined, label));
            const input = el('input');
            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = '.05';
            input.value = String(value);
            input.setAttribute('aria-label', label);
            input.addEventListener('change', () => {
                const next = upsertVoiceProperty(host.script(), host.locator(i), key, input.value);
                if (next)
                    host.applyScript(next, `Change ${label.toLowerCase()}`, { kind: 'property', detail: { key, value: input.value } });
            });
            row.append(input);
            sourceRow.append(row);
        }
    }
    card.append(listenBar, sourceRow, off, noteEl, dials, more);
    let readout = null;
    function paintNote() { noteEl.hidden = !note; noteEl.textContent = note ?? ''; }
    /** A dial held by hand: a now-and-then sound fires while you hold it. */
    function holdable(control) {
        if (!nowAndThen)
            return;
        control.addEventListener('pointerdown', () => { note = null; paintNote(); pulse.start(); });
        const let_go = () => { if (!proposal)
            pulse.release(); };
        control.addEventListener('pointerup', let_go);
        control.addEventListener('change', let_go);
    }
    function paintDials() {
        dials.replaceChildren();
        moreDials.replaceChildren();
        const st = host.statement(i);
        if (!st)
            return;
        const box = el('div', 'cdial');
        box.dataset.dial = HOW_LOUD.id;
        box.appendChild(dialHead(HOW_LOUD));
        const row = el('div', 'cdr');
        const committed = readHowLoud(tryParse(host.script()).statements?.[i] ?? st);
        let exact = committed.exact;
        const movesLevel = proposal && sourceId && proposal.target.includes(sourceId);
        if (movesLevel) {
            // the proposal's handle, with a ghost where the committed level is; dragging fine-tunes the proposal
            const s = el('input');
            s.type = 'range';
            s.min = String(DRAFT_DB.min);
            s.max = String(DRAFT_DB.max);
            s.step = '1';
            s.value = String(draftDelta);
            s.setAttribute('aria-label', `${HOW_LOUD.label}, proposed`);
            const track = el('span', 'cdtrack');
            const ghost = el('span', 'cdghost');
            ghost.title = 'where it is now';
            ghost.style.left = `${((0 - DRAFT_DB.min) / (DRAFT_DB.max - DRAFT_DB.min)) * 100}%`;
            track.append(s, ghost);
            s.addEventListener('input', () => {
                draftDelta = Number(s.value);
                const next = host.trim(host.script(), proposal.target, draftDelta);
                if (next !== null) {
                    proposal = { ...proposal, script: next };
                    draft.update(next);
                }
                const now = sourceId ? splOf(next ?? host.script(), sourceId) : null;
                exactEl.textContent = now === null ? exact : `spl ${now} (now ${committed.kind === 'value' ? committed.value : 'not set'})`;
            });
            row.append(el('span', 'cde', HOW_LOUD.ends[0]), track, el('span', 'cde', HOW_LOUD.ends[1]));
            const now = sourceId ? splOf(proposal.script, sourceId) : null;
            if (now !== null && committed.kind === 'value')
                exact = `spl ${now} (now ${committed.value})`;
        }
        else {
            const control = host.levelControl(i);
            const reading = readHowLoud(st);
            if (control && (reading.kind === 'value' || reading.kind === 'unset')) {
                holdable(control);
                row.append(el('span', 'cde', HOW_LOUD.ends[0]), control, el('span', 'cde', HOW_LOUD.ends[1]));
            }
            else
                row.appendChild(el('span', 'cdw', reading.kind === 'follows' || reading.kind === 'moving' ? reading.text : 'set in its script (it has no level of its own to move here)'));
        }
        box.appendChild(row);
        readout = el('div', 'cdo');
        // the script's own words for it (`spl 84`) are for ▸ advanced; kept here only as data
        const exactEl = el('div', 'cdx', exact);
        exactEl.hidden = true;
        box.append(readout, exactEl);
        dials.appendChild(box);
        // the slider dials this kind of sound has (or the line that says why it does not)
        const ctx = host.dialContext(i);
        const committedSt = statementIn(host.script()) ?? st;
        for (const d of SLIDER_DIALS()) {
            if (!d.appliesTo(st, ctx)) {
                const why = d.instead?.(st, ctx);
                if (why)
                    moreDials.appendChild(insteadLine(d, why));
                continue;
            }
            const proposedSt = proposal ? statementIn(proposal.script) : null;
            const moved = !!proposedSt && JSON.stringify(d.read(proposedSt)) !== JSON.stringify(d.read(committedSt));
            const block = sliderDial(d, committedSt, moved ? proposedSt : null);
            (moved ? dials : moreDials).appendChild(block);
        }
        // how often and how regular, with the next minute drawn under them
        const timing = TIMING_DIALS().filter(d => d.appliesTo(st, ctx));
        if (timing.length) {
            const proposedSt = proposal ? statementIn(proposal.script) : null;
            const moved = !!proposedSt && timing.some(d => JSON.stringify(d.read(proposedSt)) !== JSON.stringify(d.read(committedSt)));
            const group = el('div', 'ctiming');
            for (const d of timing)
                group.appendChild(sliderDial(d, committedSt, moved ? proposedSt : null));
            strip = el('div', 'cstrip');
            group.appendChild(strip);
            paintStrip(moved ? proposedSt : committedSt);
            (moved ? dials : moreDials).appendChild(group);
        }
        paintReadout();
    }
    /** This sound's statement in a script (a proposal can add voices before it: find it by source id). */
    function statementIn(text) {
        const list = tryParse(text).statements;
        if (!list)
            return null;
        return (sourceId ? list.find(x => x.sourceId === sourceId) : null) ?? list[i] ?? null;
    }
    let strip = null;
    /** The next minute, a tick wherever it could play, and its gaps in words. */
    function paintStrip(st) {
        if (!strip)
            return;
        strip.replaceChildren();
        if (!st || st.every.isNull)
            return;
        const line = el('div', 'cstl');
        line.setAttribute('aria-label', 'the next minute');
        for (const t of nextTicks(st.every.min, st.every.max, 60, 7)) {
            const tick = el('i');
            tick.style.left = `${(t / 60) * 100}%`;
            line.appendChild(tick);
        }
        const cap = el('div', 'cstc');
        cap.append(el('span', undefined, 'the next minute'), el('span', undefined, everyWords(st.every.min, st.every.max)));
        strip.append(line, cap);
    }
    function insteadLine(d, why) {
        const box = el('div', 'cdial');
        box.dataset.dial = d.id;
        box.dataset.instead = '1';
        box.append(dialHead(d), el('div', 'cdw', why));
        return box;
    }
    /** The script with this dial at `value`, written by the surgeon (never by hand). */
    function withDial(text, d, value, st) {
        const { key, raw } = d.write(value, st);
        const loc = host.locator(i);
        return raw === null ? removeVoiceProperty(text, loc, key) : upsertVoiceProperty(text, loc, key, raw);
    }
    /**
     * One slider dial. By hand: heard as you drag, committed on release (you chose it). During a
     * proposal that moved it (`proposed`): the handle sits at the proposal, a ghost at the committed
     * value, and dragging rewrites the proposal, never the document.
     */
    function sliderDial(d, committedSt, proposed) {
        const box = el('div', 'cdial');
        box.dataset.dial = d.id;
        box.appendChild(dialHead(d));
        const row = el('div', 'cdr');
        const now = d.read(committedSt);
        const shown = proposed ? d.read(proposed) : now;
        const readoutEl = el('div', 'cdo');
        const exactEl = el('div', 'cdx', proposed ? `${shown.exact} (now ${now.exact})` : now.exact);
        exactEl.hidden = true;
        if (shown.kind === 'value' || shown.kind === 'unset') {
            const s = el('input');
            s.type = 'range';
            s.min = String(d.min);
            s.max = String(d.max);
            s.step = String(d.step);
            s.value = String(shown.value);
            s.setAttribute('aria-label', d.label);
            readoutEl.textContent = d.say(shown.value);
            const track = el('span', 'cdtrack');
            track.appendChild(s);
            if (proposed && (now.kind === 'value' || now.kind === 'unset')) {
                const ghost = el('span', 'cdghost');
                ghost.title = 'where it is now';
                ghost.style.left = `${((now.value - d.min) / (d.max - d.min)) * 100}%`;
                track.appendChild(ghost);
            }
            let candidate = null;
            const gamePace = TIMING_IDS.has(d.id);
            // a timing dial is heard at the game's own pace: the editing replay pauses while it is held
            s.addEventListener('pointerdown', () => { dragging = true; if (gamePace) {
                if (pulse.running) {
                    pacePaused = true;
                    pulse.stop();
                }
            }
            else if (nowAndThen && !proposal)
                pulse.start(); });
            s.addEventListener('input', () => {
                const v = Number(s.value);
                readoutEl.textContent = d.say(v);
                if (proposal) {
                    const next = withDial(proposal.script, d, v, proposed ?? committedSt);
                    if (next !== null) {
                        proposal = { ...proposal, script: next };
                        draft.update(next);
                        exactEl.textContent = `${d.read(statementIn(next) ?? committedSt).exact} (now ${now.exact})`;
                    }
                    if (gamePace && next !== null)
                        paintStrip(statementIn(next));
                    return;
                }
                dragging = true;
                candidate = withDial(host.script(), d, v, committedSt);
                if (gamePace && candidate !== null)
                    paintStrip(statementIn(candidate));
                const t = candidate;
                if (t !== null)
                    host.schedule(() => { if (candidate === t && dragging) {
                        try {
                            host.draftEngine.loadScript(t);
                        }
                        catch { /* the release refuses it */ }
                    } });
            });
            s.addEventListener('change', () => {
                dragging = false;
                if (pacePaused) {
                    pacePaused = false;
                    if (listening && !closed)
                        pulse.setKeepPlaying(true);
                }
                if (proposal)
                    return;
                if (nowAndThen && !gamePace)
                    pulse.release();
                const v = Number(s.value);
                const next = candidate ?? withDial(host.script(), d, v, committedSt);
                candidate = null;
                if (next === null || next === host.script())
                    return;
                if (!host.applyScript(next, `${host.statement(i) ? labelOf() : 'sound'}: ${d.label}, ${d.say(v)}`, { kind: 'dial', detail: { dial: d.id, value: v } }))
                    host.draftEngine.loadScript(host.script());
            });
            row.append(el('span', 'cde', d.ends[0]), track, el('span', 'cde', d.ends[1]));
        }
        else {
            // a value that changes over time or follows the game: said in words; a fixed value replaces it, so ask first
            row.appendChild(el('span', 'cdw', shown.text));
            const fix = el('button', 'link', 'set a fixed value instead…');
            fix.addEventListener('click', () => {
                if (fix.dataset.sure !== '1') {
                    fix.dataset.sure = '1';
                    fix.textContent = `replace it with a fixed value? (it stops ${shown.kind === 'follows' ? 'following the game' : 'changing over time'})`;
                    return;
                }
                const next = withDial(host.script(), d, (d.min + d.max) / 2, committedSt);
                if (next)
                    host.applyScript(next, `${labelOf()}: ${d.label}, a fixed value`, { kind: 'dial', detail: { dial: d.id, replaced: shown.kind } });
            });
            row.appendChild(fix);
        }
        box.append(row, readoutEl, exactEl);
        // how much it varies is also its versions: how many it has, and the way to one more
        if (d.id === 'howMuchVaries') {
            const n = host.versionCount(i);
            const v = el('div', 'cdver');
            v.appendChild(el('span', undefined, n > 1 ? `${count(n, 'take')}, one picked at random each time (never the same twice in a row)` : `one ${word('take')}: it sounds the same every time it plays`));
            const more = el('button', 'link', `find another ${word('take')}…`);
            more.title = `hear others like it, or generate some, and add the one you want as one more ${word('take')}`;
            more.addEventListener('click', () => { void openFind('add-version'); });
            v.appendChild(more);
            box.appendChild(v);
        }
        return box;
    }
    // ── how it moves: rides on a thing first; roams an area for life the game does not simulate ──
    let shapingArea = false;
    function paintMove() {
        moveSec.replaceChildren();
        const st = host.statement(i), ctx = host.dialContext(i);
        if (!st || st.entityId || (ctx.kind !== 'place' && ctx.kind !== 'moving')) {
            moveSec.hidden = true;
            return;
        }
        moveSec.hidden = false;
        const now = readMotion(statementIn(host.script()) ?? st);
        const things = host.things();
        moveSec.appendChild(dialHead({ id: 'howLoud', label: 'how it moves', hint: 'the way it moves, in words; a sound on a thing moves when the thing does', ends: ['', ''], tag: 'at · place · move' }));
        const chips = el('div', 'cmc');
        const choices = [
            ...(things.length || now.choice === 'rides' ? [['rides', 'rides on a thing', 'the game moves it: it plays from the thing, wherever the thing goes']] : []),
            ['stays', 'stays put', 'it plays from one spot'],
            ['roams', 'roams an area', 'life the game does not simulate: it drifts around a box you shape, and never leaves it'],
            ['circles', 'circles', 'it goes round and round'],
        ];
        for (const [c, label, title] of choices) {
            const b = el('button', 'pill', label);
            b.dataset.on = now.choice === c ? '1' : '0';
            b.dataset.motion = c;
            b.title = title;
            b.addEventListener('click', () => { if (now.choice !== c)
                choose(c, st, now); });
            chips.appendChild(b);
        }
        if (now.choice === 'other')
            chips.appendChild(el('span', 'cdw', `${now.word} (set in its script)`));
        moveSec.appendChild(chips);
        if (now.choice === 'rides' && now.host) {
            moveSec.appendChild(el('div', 'cdo', `it moves with the ${host.thingName(now.host.id)}`));
            const parts = el('div', 'cmc');
            for (const [part, label] of [['body', 'on it'], ['top', 'on top'], ['base', 'at the base'], ['inside', 'inside, heard through it']]) {
                const b = el('button', 'pill', label);
                b.dataset.on = now.host.part === part ? '1' : '0';
                b.dataset.part = part;
                b.addEventListener('click', () => { if (now.host.part !== part)
                    commitMotion({ choice: 'rides', host: now.host.id, part }, label); });
                parts.appendChild(b);
            }
            moveSec.appendChild(parts);
        }
        if (now.choice === 'roams' && now.area && now.speed) {
            const area = now.area, speed = now.speed, air = !!now.air;
            const height = el('div', 'cmc');
            for (const [a, label] of [[false, 'on the ground'], [true, 'up in the air']]) {
                const b = el('button', 'pill', label);
                b.dataset.on = air === a ? '1' : '0';
                b.addEventListener('click', () => { if (air !== a)
                    commitMotion({ choice: 'roams', area, air: a, speed }, label); });
                height.appendChild(b);
            }
            moveSec.appendChild(height);
            // drifts ↔ darts: its speed, keeping how much it varies
            const row = el('div', 'cdr');
            const s = el('input');
            s.type = 'range';
            s.min = '0';
            s.max = '1';
            s.step = '0.01';
            s.setAttribute('aria-label', 'how fast it moves');
            const mid = (speed.min + speed.max) / 2, span = mid > 0 ? speed.max / mid : 1;
            s.value = String(speedToPos(mid));
            const sayS = el('div', 'cdo', `about ${Math.round(mid * 100) / 100} m/s`);
            const at = (pos) => { const m = posToSpeed(pos); return { min: Math.round(m * (2 - span) * 100) / 100, max: Math.round(m * span * 100) / 100 }; };
            s.addEventListener('input', () => { sayS.textContent = `about ${Math.round(posToSpeed(Number(s.value)) * 100) / 100} m/s`; });
            s.addEventListener('change', () => commitMotion({ choice: 'roams', area, air, speed: at(Number(s.value)) }, 'its speed'));
            row.append(el('span', 'cde', 'drifts'), s, el('span', 'cde', 'darts'));
            moveSec.append(row, sayS);
            const where = el('div', 'cdver');
            where.appendChild(el('span', undefined, sayArea(area)));
            if (host.editShape) {
                const shape = el('button', 'link', shapingArea ? 'done shaping' : 'shape it in the world');
                shape.title = 'drag its corners and its middle in the world; Esc puts it back';
                shape.addEventListener('click', () => { if (shapingArea)
                    stopShaping();
                else
                    startShaping(area, air, speed); paintMove(); });
                where.appendChild(shape);
            }
            moveSec.appendChild(where);
        }
    }
    function choose(c, st, now) {
        stopShaping();
        if (c === 'rides') {
            const t = host.things()[0];
            if (!t)
                return;
            commitMotion({ choice: 'rides', host: t.id }, `rides on the ${t.label}`);
        }
        else if (c === 'roams')
            commitMotion({ choice: 'roams', area: now.area ?? areaAround(st), air: false, speed: { min: 0.2, max: 0.4 } }, 'roams an area');
        else if (c === 'stays' || c === 'circles')
            commitMotion({ choice: c }, c === 'stays' ? 'stays put' : 'circles');
    }
    function commitMotion(m, what) {
        const next = writeMotion(host.script(), host.locator(i), m);
        if (next === null || next === host.script())
            return;
        if (!host.applyScript(next, `${labelOf()}: ${what}`, { kind: 'motion', detail: { choice: m.choice } })) {
            note = 'that would not load; nothing changed';
            paintNote();
        }
    }
    /** The area's handles in the world: heard while dragged (a draft), written on release (you moved it). */
    function startShaping(area, air, speed) {
        if (!host.editShape)
            return;
        shapingArea = true;
        host.editShape(area, {
            onPreview: a => { const next = writeMotion(host.script(), host.locator(i), { choice: 'roams', area: a, air, speed }); if (!next)
                return; if (draft.open)
                draft.update(next);
            else
                draft.preview({ script: next }); },
            onDrop: a => { draft.commit(); shapingArea = false; host.editShape?.(null); commitMotion({ choice: 'roams', area: a, air, speed }, 'its area'); },
            onCancel: () => { draft.close(); },
        });
    }
    function stopShaping() { if (!shapingArea)
        return; shapingArea = false; host.editShape?.(null); if (draft.open && !proposal)
        draft.close(); }
    function labelOf() { return host.situation(i).label || 'sound'; }
    function paintReadout() { if (readout)
        readout.textContent = howLoudReadout(host.hear(i), { db: false }); }
    function open(p) {
        if (!draft.preview({ script: p.script })) {
            note = 'that change would not load; nothing changed';
            paintNote();
            return;
        }
        proposal = p;
        proposalRevision++;
        draftDelta = 0;
        refining = false;
        words = '';
        said = null;
        // the level move the proposal made, for the dial's handle
        if (sourceId) {
            const a = splOf(host.script(), sourceId), b = splOf(p.script, sourceId);
            if (a !== null && b !== null)
                draftDelta = Math.round(b - a);
        }
        note = null;
        paintNote();
        // a timing proposal is heard at the game's pace; any other one at the editing pace
        if (nowAndThen && TIMING_COMPLAINTS.has(p.complaint ?? '')) {
            if (pulse.running) {
                pacePaused = true;
                pulse.stop();
            }
        }
        else if (nowAndThen)
            pulse.start();
        paintOff();
        paintDials();
    }
    /** A proposal ended: its editing fires stop, and the card goes on playing the sound if Play is on. */
    function afterProposal() {
        pulse.stop();
        pacePaused = false;
        if (listening && !closed && nowAndThen)
            pulse.setKeepPlaying(true);
    }
    function keep() {
        const p = proposal;
        if (!p || asking)
            return;
        const d = draft.commit();
        afterProposal();
        proposal = null;
        proposalRevision++;
        refining = false;
        words = '';
        said = null;
        if (!d)
            return;
        const ok = host.applyScript(d.script, p.label, { kind: 'proposal_kept', detail: { origin: p.origin, complaint: p.complaint ?? null, target: p.target, adjusted: d.script !== p.script } });
        // refused: the engine still plays the draft, so put the committed scene back
        if (!ok)
            host.draftEngine.loadScript(host.script());
        shownIds = '';
        paintOff();
        paintDials();
    }
    function putBack(reason) {
        const p = proposal;
        if (!p)
            return;
        draft.close();
        afterProposal();
        proposal = null;
        proposalRevision++;
        refining = false;
        words = '';
        said = null;
        host.record('proposal_refused', { origin: p.origin, complaint: p.complaint ?? null, target: p.target, how: reason });
        shownIds = '';
        if (reason === 'put_back') {
            paintOff();
            paintDials();
        }
    }
    function paintOff() {
        off.replaceChildren();
        if (proposal) {
            off.dataset.state = 'proposal';
            const box = el('div', 'cprop');
            box.appendChild(el('div', 'cpt', proposal.text));
            const sides = el('div', 'cseg');
            for (const side of ['after', 'before']) {
                const b = el('button', undefined, side);
                b.dataset.on = draft.side === side ? '1' : '0';
                b.title = side === 'after' ? 'hear it with the change, in the scene' : 'hear it as it is now';
                b.addEventListener('click', () => { draft.flip(side); for (const x of sides.children)
                    x.dataset.on = (x.textContent === side) ? '1' : '0'; });
                sides.appendChild(b);
            }
            const acts = el('div', 'cacts');
            const keepBtn = el('button', 'pri', 'Keep it');
            keepBtn.addEventListener('click', keep);
            keepBtn.disabled = asking;
            const back = el('button', 'pill', 'Put it back');
            back.addEventListener('click', () => putBack('put_back'));
            const more = el('button', 'link', 'Say more');
            more.disabled = asking;
            more.setAttribute('aria-expanded', String(refining));
            more.addEventListener('click', () => { refining = !refining; paintOff(); off.querySelector(refining ? '.csay textarea' : '.cacts .link')?.focus(); });
            acts.append(sides, keepBtn, back, more);
            box.appendChild(acts);
            if (refining)
                box.appendChild(sayIt(true));
            off.appendChild(box);
            return;
        }
        if (find) {
            off.dataset.state = 'find';
            off.hidden = false;
            off.appendChild(sayIt());
            const shared = host.sharedCount(i);
            const labels = findFor === 'add-version' ? { all: `Use this · as one more ${word('take')}`, one: null } : selectionLabels(labelOf(), shared);
            off.appendChild(findView(find, { title: findFor === 'add-version' ? `Another ${word('take')}` : 'Other sounds', searchingFor: labelOf(), labels, playing: playingId, busy: findBusy, canGenerate: !!host.findRoutes.vary }, {
                play: c => { void audition(c); },
                shortlist: c => {
                    if (!find)
                        return;
                    find = shortlistFind(find, c);
                    host.record('find_shortlist', { findId: find.findId, round: find.round, sampleId: c.sampleId, on: true });
                    paintOff();
                },
                unshortlist: id => {
                    if (!find)
                        return;
                    find = unshortlist(find, id);
                    host.record('find_shortlist', { findId: find.findId, round: find.round, sampleId: id, on: false });
                    paintOff();
                },
                mark: (id, v) => {
                    if (!find)
                        return;
                    find = markFind(find, id, v);
                    host.record('find_mark', { findId: find.findId, round: find.round, sampleId: id, verdict: find.marks[id] ?? null });
                    paintOff();
                },
                unmark: id => {
                    if (!find)
                        return;
                    find = unmark(find, id);
                    host.record('find_mark', { findId: find.findId, round: find.round, sampleId: id, verdict: null });
                    paintOff();
                },
                editPlan: (d, repaint) => {
                    if (!find)
                        return;
                    find = editPlan(find, d);
                    if (repaint)
                        paintOff();
                },
                next: () => { void nextFindRound(); },
                use: (c, scope) => { void useCandidate(c, findFor === 'add-version' ? 'add-version' : scope); },
                plan: () => { void varyPlan(); },
                make: () => { void varyMake(); },
                dropPlan: () => { if (find) {
                    host.record('vary_dropped', { findId: find.findId, costCents: find.vary?.plan?.costCents ?? null });
                    find = { ...find, vary: undefined };
                    paintOff();
                } },
                close: () => { stopAudition(); host.record('find_closed', { findId: find?.findId ?? null, round: find?.round ?? null }); find = null; shownIds = ''; paintOff(); },
            }));
            return;
        }
        off.dataset.state = 'complaints';
        const list = complaintsFor(host.situation(i));
        shownIds = list.map(c => c.id).join(',');
        off.hidden = false;
        const change = list.find(c => c.id === 'notTheRightSound');
        if (change)
            off.appendChild(complaintButton(change));
        const rest = list.filter(c => c.id !== 'notTheRightSound').slice(0, 3);
        if (rest.length) {
            const chips = el('div', 'cchips');
            chips.setAttribute('aria-label', 'Suggestions');
            for (const c of rest)
                chips.appendChild(complaintButton(c));
            off.appendChild(chips);
        }
    }
    /** The say-it box: anything in your own words; an edit comes back as a proposal on this card. */
    let asking = false, said = null;
    let refining = false, words = '';
    function sayIt(refinement = false) {
        const box = el('div', 'csay');
        box.setAttribute('aria-busy', String(asking));
        const row = el('div', 'csr');
        const input = el('textarea');
        input.rows = 2;
        input.setAttribute('aria-label', refinement ? 'refine this proposal, in your words' : 'say what is off, in your words');
        input.placeholder = asking ? 'SATIE is reading it…' : refinement ? "What would you change?" : 'Tell SATIE what to change…';
        input.value = words;
        input.addEventListener('input', () => { words = input.value; });
        input.disabled = asking;
        const fit = () => { input.style.height = '0'; input.style.height = `${input.scrollHeight + 2}px`; };
        input.addEventListener('input', fit);
        requestAnimationFrame(fit);
        const send = el('button', 'pill', 'Send');
        send.disabled = asking;
        const go = async () => {
            const text = input.value.trim();
            if (!text || asking)
                return;
            const revision = proposalRevision;
            const context = refinement && proposal ? { text: proposal.text, script: draft.script ?? proposal.script, target: proposal.target.slice() } : undefined;
            asking = true;
            said = null;
            paintOff();
            try {
                const r = await host.ask(i, text, context);
                if (closed)
                    return;
                if (revision !== proposalRevision)
                    return;
                if (context && draft.script !== context.script) {
                    said = { text: 'You adjusted the proposal while SATIE worked. Send it again to refine it.', more: false };
                    return;
                }
                if (r.kind === 'find') {
                    void openFind();
                    return;
                }
                if (r.kind === 'proposal') {
                    open({ text: r.text, script: r.script, target: r.target, origin: 'chat', label: `${labelOf()}: "${text.slice(0, 48)}"`, complaint: 'said' });
                    return;
                }
                said = r.kind === 'say' ? { text: r.text, more: !!r.more } : null;
                if (r.kind === 'say')
                    words = '';
            }
            catch {
                if (!closed && revision === proposalRevision)
                    said = { text: 'SATIE could not answer. Try again; nothing was saved.', more: false };
            }
            finally {
                asking = false;
                if (!closed)
                    paintOff();
            }
        };
        send.addEventListener('click', () => { void go(); });
        input.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                void go();
            }
            if (e.key === 'Escape' && refinement && !asking) {
                refining = false;
                words = '';
                said = null;
                paintOff();
                off.querySelector('.cacts .link')?.focus();
            }
        });
        row.append(input, send);
        box.appendChild(row);
        if (said) {
            const reply = el('div', 'csreply', said.text);
            reply.setAttribute('role', 'status');
            box.appendChild(reply);
        }
        const cont = el('button', 'link', 'Continue in the conversation ›');
        cont.title = "this exchange is part of the mixer's conversation; bigger requests (\"make the whole street calmer\") go there";
        cont.addEventListener('click', () => host.continueInChat(i));
        // after an answer that is not a change (a question back, a way to do it), the conversation is where it goes on
        if (said)
            box.appendChild(cont);
        return box;
    }
    // ── the find: changing what the sound is, by listening (satie_find) ──
    let find = null;
    let findBusy = false;
    /** The candidate playing in place, and since when (a listen past 200 ms is counted). */
    let playingId = null, playingSince = 0, playingRound = -1;
    /** What a pick does: replace the recording, or join it as one more version. */
    let findFor = 'replace';
    async function openFind(mode = 'replace') {
        // the edit panel, when the game has one, is where a sound's takes are found and changed
        if (host.openEdit?.(i))
            return;
        findFor = mode;
        if (proposal)
            putBack('put_back');
        const st = host.statement(i);
        if (!st)
            return;
        findBusy = true;
        find = newFind({ kind: 'words', text: labelOf() }, { loop: st.kind === 'loop' });
        paintOff();
        const start = await host.findStart(i);
        if (closed)
            return;
        find = await startFind(start, host.findRoutes, { loop: st.kind === 'loop' });
        // replacing: other takes of what it plays now may come back, and say so
        const current = mode === 'replace' ? host.recordingName?.(i) ?? null : null;
        if (current)
            find = { ...find, replacing: current };
        findBusy = false;
        if (closed)
            return;
        host.record('find_round', { findId: find.findId, round: find.round, start: start.kind, status: find.status, shown: find.candidates.map(c => c.sampleId) });
        paintOff();
    }
    async function nextFindRound() {
        if (!find || findBusy)
            return;
        stopAudition();
        findBusy = true;
        paintOff();
        const marks = find.marks;
        find = await nextRound(find, host.findRoutes);
        findBusy = false;
        if (closed || !find)
            return;
        host.record('find_round', { findId: find.findId, round: find.round, marks, status: find.status, shown: find.candidates.map(c => c.sampleId) });
        paintOff();
    }
    /** A candidate, heard where the sound plays: its audio under every take key of the recording, as a draft. */
    async function audition(c) {
        if (playingId === c.sampleId) {
            stopAudition();
            paintOff();
            return;
        }
        stopAudition();
        playingId = c.sampleId;
        playingSince = performance.now();
        playingRound = find?.round ?? -1;
        if (!listening)
            setListening(true);
        paintOff();
        let buffer;
        try {
            buffer = await host.decode(c.url);
        }
        catch {
            playingId = null;
            note = 'that sound could not load';
            paintNote();
            paintOff();
            return;
        }
        if (closed || playingId !== c.sampleId)
            return;
        const buffers = Object.fromEntries(host.takeKeys(i).map(k => [k, buffer]));
        if (!draft.preview({ script: host.script(), buffers })) {
            playingId = null;
            paintOff();
            return;
        }
        playingSince = performance.now();
        if (nowAndThen)
            pulse.start();
    }
    /** Stop the candidate in place (the recording goes back) and count the listen. */
    function stopAudition() {
        if (playingId === null)
            return;
        const ms = Math.round(performance.now() - playingSince), id = playingId, round = playingRound;
        playingId = null;
        pulse.stop();
        draft.close();
        if (find && ms >= LISTEN_MS) {
            host.record('find_listen', { findId: find.findId, round, sampleId: id, ms });
            if (find.findId)
                void host.findRoutes.log?.({ findId: find.findId, listens: [{ round, sampleId: id, ms }] });
        }
    }
    /** Generate variations, step one: free. Nothing is bought until "Make them". */
    async function varyPlan() {
        if (!find || findBusy)
            return;
        findBusy = true;
        paintOff();
        find = await planVariations(find, host.findRoutes, () => crypto.randomUUID());
        findBusy = false;
        if (closed || !find)
            return;
        host.record('vary_plan', { findId: find.findId, round: find.round, variations: find.vary?.plan?.variations.length ?? 0, costCents: find.vary?.plan?.costCents ?? null, error: find.vary?.error ?? null });
        paintOff();
    }
    /** Step two: exactly the plan, capped at its cost; the new takes join the round. */
    async function varyMake() {
        if (!find?.vary?.plan || findBusy)
            return;
        stopAudition();
        find = { ...find, vary: { ...find.vary, making: true } };
        findBusy = true;
        paintOff();
        const before = find.made?.length ?? 0, cap = find.vary.plan.costCents;
        find = await makeVariations(find, host.findRoutes);
        findBusy = false;
        if (closed || !find)
            return;
        host.record('vary_make', { findId: find.findId, round: find.round, maxCents: cap, made: (find.made?.length ?? 0) - before, error: find.vary?.error ?? null });
        paintOff();
    }
    async function useCandidate(c, scope) {
        if (!find || findBusy)
            return;
        stopAudition();
        findBusy = true;
        paintOff();
        const ok = await host.useFound(i, c, scope, { findId: find.findId, round: find.round });
        findBusy = false;
        if (closed)
            return;
        if (ok) {
            find = null;
            shownIds = '';
        }
        else {
            note = 'that sound could not be put in; nothing changed';
            paintNote();
        }
        paintOff();
    }
    function complaintButton(c) {
        const change = c.id === 'notTheRightSound';
        const b = el('button', change ? 'cof cchange' : 'cof');
        b.dataset.complaint = c.id;
        // the evidence ("the loudest thing you hear here, 82 dB") is the tooltip, not more text on the card
        b.appendChild(el('span', 'cot', change ? 'Change the sound' : c.text));
        b.title = change ? 'hear other sounds in its place and pick one' : c.evidence;
        b.addEventListener('click', () => {
            // "not the right sound" already means "replace it": it opens the find, no chat, no proposal
            if (c.id === 'notTheRightSound') {
                void openFind();
                return;
            }
            const p = recipeFor(c, host.situation(i), host.script(), host.trim, (t, k, r) => upsertVoiceProperty(t, host.locator(i), k, r));
            if (!p) {
                note = 'nothing to change for that here: it is already as far as it goes';
                paintNote();
                return;
            }
            open(p);
        });
        return b;
    }
    paintOff();
    paintDials();
    paintMove();
    setListening(true);
    return {
        el: card,
        refresh(committed = false) {
            if (committed && find && !proposal) {
                paintDials();
                paintMove();
            }
            paintReadout();
            // what's off follows the scene (you walked away, the traffic stopped), unless a proposal is open
            // (never while you type in the say-it box, or while Satie is reading it: that would wipe it)
            const typing = !!off.querySelector('.csay textarea')?.matches(':focus') || !!off.querySelector('.csay textarea')?.value;
            if (!proposal && !find && !asking && !typing && complaintsFor(host.situation(i)).map(c => c.id).join(',') !== shownIds)
                paintOff();
        },
        // an open find is held too: an audition ending reloads the committed script, which must not rebuild the card and lose the find
        holding: () => draft.open || dragging || asking || findBusy || find !== null || choosingSource !== null,
        findVersion() { void openFind('add-version'); },
        close() { closed = true; choosingSource?.close(); stopShaping(); stopAudition(); if (proposal)
            putBack('closed'); pulse.stop(); if (listening) {
            listening = false;
            host.listen(i, false);
        } },
    };
}
/**
 * A crowd's card: the `entity` block itself. A route (things passing along a strip) has how often
 * one comes, how regular, and how fast; a population (things perched about) has how many. Each
 * member sound is listed and opens its own card. Every change is one `applyScript`.
 */
export function mountCrowd(host, id) {
    const card = el('div', 'satie-dt-card');
    const got = host.entity(id);
    if (!got)
        return { el: card, refresh() { }, holding: () => false, close() { }, findVersion() { } };
    const c = readCrowd(got.def);
    const dials = el('section', 'cdials');
    dials.dataset.section = 'crowd';
    dials.setAttribute('aria-label', 'The crowd');
    const name = id.replace(/_/g, ' ');
    const commit = (next, what) => { if (next && next !== host.script())
        host.applyScript(next, `${name}: ${what}`, { kind: 'crowd', detail: { entity: id } }); };
    const slider = (label, tag, ends, min, max, step, value, say, onCommit, key) => {
        const box = el('div', 'cdial');
        box.dataset.dial = key;
        box.appendChild(dialHead({ id: 'howLoud', label, hint: label, ends, tag }));
        const row = el('div', 'cdr');
        const s = el('input');
        s.type = 'range';
        s.min = String(min);
        s.max = String(max);
        s.step = String(step);
        s.value = String(value);
        s.setAttribute('aria-label', label);
        const out = el('div', 'cdo', say(value));
        s.addEventListener('input', () => { out.textContent = say(Number(s.value)); });
        s.addEventListener('change', () => onCommit(Number(s.value)));
        row.append(el('span', 'cde', ends[0]), s, el('span', 'cde', ends[1]));
        box.append(row, out);
        return box;
    };
    dials.appendChild(el('div', 'csh', c.kind === 'route' ? 'things passing by' : 'things about the place'));
    if (c.kind === 'population') {
        dials.appendChild(slider('how many', 'count', ['one', 'a crowd'], COUNT_MIN, COUNT_MAX, 1, c.count, v => `${v} of them`, v => commit(writeCrowd(host.script(), id, { count: v }), `${v} of them`), 'count'));
    }
    else {
        const e = everyShape(c.every.min, c.every.max);
        dials.appendChild(slider('how often one comes', 'every', ['rarely', 'all the time'], 0, 1, 0.005, oftenToPos(e.middleS), p => sayEvery({ min: posToOften(p), max: posToOften(p) }), p => commit(writeCrowd(host.script(), id, { every: { middleS: posToOften(p), spread: e.spread } }), 'how often one comes'), 'crowdOften'));
        dials.appendChild(slider('how regular', 'every range', ['like clockwork', 'unpredictable'], 0, SPREAD_MAX, 0.01, e.spread, s => everyWords(Math.max(0.2, e.middleS * (1 - s)), e.middleS * (1 + s)), s => commit(writeCrowd(host.script(), id, { every: { middleS: e.middleS, spread: s } }), 'how regular'), 'crowdRegular'));
        const sp = c.speed, mid = sp ? (sp.min + sp.max) / 2 : 10, k = sp && mid > 0 ? (sp.max - sp.min) / (sp.max + sp.min) : 0.5;
        dials.appendChild(slider('how fast', 'speed', ['slowly', 'fast'], SPEED_MIN, SPEED_MAX, 0.5, mid, v => `about ${Math.round(v * 3.6)} km/h`, v => commit(writeCrowd(host.script(), id, { speed: v, spread: k }), 'how fast'), 'crowdSpeed'));
    }
    card.appendChild(dials);
    // its sounds, each with its own card
    const members = el('section', 'cmove');
    members.dataset.section = 'members';
    members.appendChild(el('div', 'csh', 'its sounds'));
    for (const m of got.members) {
        const row = el('div', 'cdver');
        row.dataset.member = String(m);
        row.appendChild(el('span', undefined, host.soundName(m)));
        const open = el('button', 'link', 'edit');
        open.dataset.nav = '1';
        open.title = 'its own card: how it sounds, how and when it plays';
        open.addEventListener('click', () => host.openSound(m));
        row.appendChild(open);
        members.appendChild(row);
    }
    card.appendChild(members);
    return { el: card, refresh() { }, holding: () => false, close() { }, findVersion() { } };
}
//# sourceMappingURL=view.js.map