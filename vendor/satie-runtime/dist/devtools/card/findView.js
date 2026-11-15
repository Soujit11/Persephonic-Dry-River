import { nextSteps, steering, planDraft, editPlan, takeOfKept, sameSound, VARY_COUNT, VARY_MAX } from './findSession.js';
/** The drag payload: a candidate's sample id. */
const DRAG_TYPE = 'application/x-satie-sample';
function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls)
        n.className = cls;
    if (text !== undefined)
        n.textContent = text;
    return n;
}
/** A library name as people read it: hyphens to spaces, shortened for a row (the full one is its title). */
const readable = (name) => { const t = name.replace(/[-_]+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 59)}…` : t; };
export function findView(s, o, a) {
    const box = el('div', 'cfind');
    box.setAttribute('aria-label', 'Other sounds');
    const head = el('div', 'cfh');
    head.append(el('span', 'cft', o.title));
    const x = el('button', 'x', '×');
    x.title = 'close (nothing changes)';
    x.setAttribute('aria-label', 'Close other sounds');
    x.addEventListener('click', () => a.close());
    head.appendChild(x);
    box.appendChild(head);
    if (s.status === 'starting') {
        box.setAttribute('aria-busy', 'true');
        const status = el('div', 'cfsearch');
        status.setAttribute('role', 'status');
        const scan = el('span', 'cfscan');
        scan.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++)
            scan.appendChild(el('span'));
        const text = el('div');
        text.appendChild(el('div', 'cft', `Finding sounds like ${o.searchingFor ?? (s.start.kind === 'words' ? s.start.text : 'this sound')}…`));
        text.appendChild(el('div', 'cfs', 'Searching the library. You can keep adjusting the sound.'));
        status.append(scan, text);
        box.appendChild(status);
        return box;
    }
    const playButton = (c) => {
        const on = o.playing === c.sampleId;
        const pv = el('button', 'pv', on ? '■' : '▶');
        pv.title = on ? 'stop' : 'play it in place of the sound';
        pv.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${c.name}`);
        pv.addEventListener('click', () => a.play(c, pv));
        return pv;
    };
    const nameButton = (c, pv) => {
        const n = el('button', 'cfn', readable(c.name));
        n.title = c.name;
        n.addEventListener('click', () => a.play(c, pv));
        return n;
    };
    const useButton = (c) => {
        const use = el('button', 'pri', 'Use');
        use.disabled = o.busy || !c.clip;
        use.title = c.clip ? o.labels.all : 'it has no library name yet';
        use.setAttribute('aria-label', `${o.labels.all}: ${c.name}`);
        use.addEventListener('click', () => a.use(c, 'every-voice'));
        return use;
    };
    /** A sound's mark now: this round's, else its latest from an earlier round. */
    const verdictNow = (id) => s.marks[id] ?? [...s.feedback].reverse().find(f => f.sampleId === id)?.verdict;
    /**
     * A row's second line: More like this · Less like this, and on the one playing, Use (when the row
     * has no Use of its own) and "only this bell" (a shared recording).
     */
    const marksLine = (c, withUse) => {
        const line = el('div', 'cfm');
        const v = verdictNow(c.sampleId);
        for (const [verdict, label] of [['closer', 'More like this'], ['less-close', 'Less like this']]) {
            const b = el('button', 'cfv', label);
            b.dataset.verdict = verdict;
            b.dataset.on = v === verdict ? '1' : '0';
            b.setAttribute('aria-pressed', String(v === verdict));
            b.title = verdict === 'closer' ? 'steer what comes next toward this one' : 'steer what comes next away from this one';
            b.addEventListener('click', () => a.mark(c.sampleId, verdict));
            line.appendChild(b);
        }
        if (o.playing === c.sampleId) {
            if (withUse)
                line.appendChild(useButton(c));
            if (o.labels.one) {
                const one = el('button', 'link', o.labels.one);
                one.disabled = o.busy || !c.clip;
                one.addEventListener('click', () => a.use(c, 'this-voice'));
                line.appendChild(one);
            }
        }
        return line;
    };
    // ── your shortlist: always there, so it is clear where the ones you like go ──
    const list = el('div', 'cshort');
    list.dataset.section = 'shortlist';
    list.setAttribute('aria-label', 'Your shortlist');
    const sh = el('div', 'cshh');
    sh.append(el('span', 'cshn', 'Your shortlist'), el('span', 'cshc', s.shortlist.length ? String(s.shortlist.length) : ''));
    list.appendChild(sh);
    if (!s.shortlist.length)
        list.appendChild(el('div', 'cshe', 'Your final candidates. Add one with + Shortlist or drag it in; it stays while you look for more.'));
    for (const c of s.shortlist) {
        const row = el('div', 'cfr');
        row.dataset.sample = c.sampleId;
        row.dataset.playing = o.playing === c.sampleId ? '1' : '0';
        row.dataset.kept = '1';
        const pv = playButton(c);
        const off = el('button', 'cfx', '×');
        off.title = 'take it off your shortlist';
        off.setAttribute('aria-label', `Take ${c.name} off your shortlist`);
        off.addEventListener('click', () => a.unshortlist(c.sampleId));
        const top = el('div', 'cfrt');
        top.append(pv, nameButton(c, pv), ...(s.made?.includes(c.sampleId) ? [el('span', 'cfnew', 'new')] : []), useButton(c), off);
        row.appendChild(top);
        // a shortlisted sound can be marked too, while you listen to it
        if (o.playing === c.sampleId)
            row.appendChild(marksLine(c, false));
        list.appendChild(row);
    }
    // drag a row in
    list.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes(DRAG_TYPE)) {
        e.preventDefault();
        list.dataset.over = '1';
    } });
    list.addEventListener('dragleave', () => { delete list.dataset.over; });
    list.addEventListener('drop', e => {
        delete list.dataset.over;
        const id = e.dataTransfer?.getData(DRAG_TYPE);
        const c = id ? s.candidates.find(x => x.sampleId === id) : undefined;
        if (c) {
            e.preventDefault();
            a.shortlist(c);
        }
    });
    box.appendChild(list);
    if (s.status === 'unavailable') {
        box.appendChild(el('div', 'cfs', "Search isn't working right now."));
        const retry = el('button', 'pill', 'Try again');
        retry.disabled = o.busy;
        retry.addEventListener('click', () => a.next());
        box.appendChild(retry);
        return box;
    }
    // ── this round ──
    // a round that is not close may still carry rows: they are offered, said to be not very close
    const sub = s.made?.length && s.made.includes(s.candidates[0]?.sampleId) ? 'New ones, and what else came up' : s.status === 'nothing-close' ? 'Not very close' : 'From the library';
    if (s.candidates.length) {
        const h = el('div', 'csub', sub);
        h.dataset.close = s.status === 'nothing-close' ? '0' : '1';
        box.appendChild(h);
    }
    else if (s.status === 'nothing-close')
        box.appendChild(el('div', 'cfs', 'Nothing very close in the library.'));
    for (const c of s.candidates) {
        const v = verdictNow(c.sampleId);
        const row = el('div', 'cfr');
        row.dataset.sample = c.sampleId;
        row.dataset.playing = o.playing === c.sampleId ? '1' : '0';
        row.dataset.verdict = v ?? '';
        row.draggable = true;
        row.title = 'drag it into your shortlist';
        row.addEventListener('dragstart', e => { e.dataTransfer?.setData(DRAG_TYPE, c.sampleId); if (e.dataTransfer)
            e.dataTransfer.effectAllowed = 'copy'; });
        const pv = playButton(c);
        const add = el('button', 'cfadd', '+ Shortlist');
        add.title = 'one of your final candidates: it stays while you look for more';
        add.addEventListener('click', () => a.shortlist(c));
        const top = el('div', 'cfrt');
        top.append(pv, nameButton(c, pv), ...(s.made?.includes(c.sampleId) ? [el('span', 'cfnew', 'new')] : []), add);
        row.appendChild(top);
        const of = takeOfKept(c, s.shortlist);
        const ofCurrent = !of && !!s.replacing && sameSound(c.name, s.replacing);
        const notes = [];
        if (of)
            notes.push(`another take of ${readable(of.name)}`);
        else if (ofCurrent)
            notes.push('another take of the one playing now');
        // in a round that is close overall, a sound the server flags as not close says so on its own row
        if (c.close === false && s.status !== 'nothing-close')
            notes.push('not very close');
        if (notes.length) {
            const note = el('div', 'cftake', notes.join(' · '));
            note.dataset.close = c.close === false ? '0' : '1';
            note.title = of || ofCurrent ? 'the same sound recorded again, a little different' : 'further from what you marked than the others';
            row.appendChild(note);
        }
        row.appendChild(marksLine(c, true));
        box.appendChild(row);
    }
    // ── steering by: every mark so far, so it is plain what the next step is steered by ──
    const st = steering(s);
    const steer = el('div', 'csteer');
    steer.dataset.section = 'steering';
    if (st.more.length || st.less.length) {
        steer.appendChild(el('span', 'csl', 'Steering by'));
        const chip = (c, sign) => {
            const ch = el('span', `cchip${sign === '+' ? ' more' : ' less'}`);
            ch.dataset.sample = c.sampleId;
            ch.appendChild(el('span', undefined, `${sign} ${readable(c.name)}`));
            const x2 = el('button', 'cfx', '×');
            x2.title = 'stop steering by it';
            x2.setAttribute('aria-label', `Stop steering by ${c.name}`);
            x2.addEventListener('click', () => a.unmark(c.sampleId));
            ch.appendChild(x2);
            return ch;
        };
        for (const c of st.more)
            steer.appendChild(chip(c, '+'));
        for (const c of st.less)
            steer.appendChild(chip(c, '−'));
    }
    else
        steer.appendChild(el('span', 'csl', 'Mark sounds More like this or Less like this to steer what comes next.'));
    box.appendChild(steer);
    // ── the next step ──
    const foot = el('div', 'cff');
    const v = s.vary;
    const steps = nextSteps(s, { canGenerate: o.canGenerate !== false });
    const like = st.more.length ? ' like the ones you marked' : '';
    const d = planDraft(s);
    if (v?.plan && d) {
        // the plan is yours: rewrite, remove or add lines, change the aim; nothing is bought until Make
        const plan = el('div', 'cfplan');
        plan.dataset.edited = d.edited ? '1' : '0';
        plan.appendChild(el('div', 'cft', 'The plan'));
        plan.appendChild(el('div', 'cfs', 'Edit this like a note. Add or remove a bullet for each sound.'));
        const note = el('textarea', 'cfnotepad');
        note.value = d.text;
        note.rows = 5;
        note.setAttribute('aria-label', 'Generation plan');
        note.disabled = !!v.making;
        note.placeholder = 'Describe what you want, then write a bullet for each new sound.';
        note.addEventListener('keydown', e => e.stopPropagation());
        plan.appendChild(note);
        const summary = el('div', 'cfs');
        summary.setAttribute('aria-live', 'polite');
        plan.appendChild(summary);
        const pa = el('div', 'cfu');
        const make = el('button', 'pri cfmake');
        const update = (draft) => {
            const tooMany = draft.lines.length > VARY_MAX;
            plan.dataset.edited = draft.edited ? '1' : '0';
            summary.textContent = tooMany ? `Up to ${VARY_MAX} sounds at a time. Remove a bullet to continue.` : `${draft.lines.length} new sound${draft.lines.length === 1 ? '' : 's'} · ${draft.costCents}¢. Nothing is bought until you press Make.`;
            make.textContent = v.making ? 'Making…' : `${draft.edited ? 'Make these' : 'Make them'} · ${draft.costCents}¢`;
            make.disabled = !!v.making || o.busy || !draft.lines.length || tooMany;
            make.title = draft.edited ? 'SATIE first rewrites the prompts from your note (free), then makes them within this price' : 'buys exactly these, at most this much';
        };
        const fit = () => {
            if (!CSS.supports('field-sizing', 'content')) {
                note.style.height = '0';
                note.style.height = `${note.scrollHeight + 2}px`;
            }
        };
        note.addEventListener('input', () => {
            a.editPlan(note.value, false);
            update(planDraft(editPlan(s, note.value)));
            fit();
        });
        requestAnimationFrame(fit);
        update(d);
        make.addEventListener('click', () => a.make());
        const no = el('button', 'link', 'Back to sounds');
        no.disabled = !!v.making;
        no.addEventListener('click', () => a.dropPlan());
        pa.append(make, no);
        plan.appendChild(pa);
        foot.appendChild(plan);
    }
    else {
        if (!steps.library && steps.primary === 'generate')
            foot.appendChild(el('div', 'cfs', "That's everything close in the library."));
        const acts = el('div', 'cfu');
        if (steps.primary === 'generate') {
            const gen = el('button', 'pri cfgen');
            gen.disabled = o.busy;
            gen.dataset.hot = '1';
            gen.appendChild(el('span', 'cfgen-label', o.busy ? 'Working…' : `Make ${VARY_COUNT} new ones${like}`));
            const arrow = el('span', 'cfgen-arrow', '→');
            arrow.setAttribute('aria-hidden', 'true');
            gen.appendChild(arrow);
            gen.title = 'new sounds steered by what you marked; you see and can change the plan and its price first';
            gen.addEventListener('click', () => a.plan());
            acts.appendChild(gen);
        }
        if (steps.library) {
            const next = el('button', steps.primary === 'generate' ? 'link cfnext' : 'pill cfnext', o.busy ? 'Finding…' : steps.primary === 'generate' ? 'or more from the library' : 'More from the library');
            next.disabled = o.busy;
            next.title = 'another round from the library, steered by what you marked';
            next.addEventListener('click', () => a.next());
            acts.appendChild(next);
        }
        foot.appendChild(acts);
        if (steps.primary === 'generate')
            foot.appendChild(el('div', 'cfs cfgen-hint', 'Review and edit the plan first. Nothing is bought yet.'));
    }
    if (v?.error)
        foot.appendChild(el('div', 'cfs', v.error));
    box.appendChild(foot);
    return box;
}
//# sourceMappingURL=findView.js.map