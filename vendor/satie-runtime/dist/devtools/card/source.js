/** Explicit create → listen → use flow. Opening it never generates or replaces audio. */
import { SYNTH_INSTRUMENTS } from '../../synth/instruments.js';
export function sourceChooser(options) {
    const box = document.createElement('section');
    box.className = 'cdials source-chooser';
    box.setAttribute('aria-label', 'Choose sound source');
    const title = document.createElement('strong');
    title.textContent = options.synth ? 'Create a synth' : 'Choose a sample';
    const description = document.createElement('textarea');
    description.value = options.prompt;
    description.maxLength = 1700;
    description.setAttribute('aria-label', 'Sound description');
    const instrument = document.createElement('select');
    instrument.setAttribute('aria-label', 'Synth instrument');
    for (const [id, name] of [['', 'Compose with DrC instruments'], ...SYNTH_INSTRUMENTS.map(i => [i.id, i.name])]) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        instrument.append(option);
    }
    const note = document.createElement('p');
    note.textContent = 'Your current sound stays until you choose Use this. Creating a preview spends one take.';
    const create = document.createElement('button');
    create.textContent = 'Create preview · 1 take';
    const listen = document.createElement('button');
    listen.textContent = 'Listen';
    listen.disabled = true;
    const use = document.createElement('button');
    use.textContent = 'Use this';
    use.disabled = true;
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    let candidate = null, closed = false, playing = false;
    // Keep an ambiguous failed request's key for a retry; a changed description is a new request.
    let previous = '', requestKey = crypto.randomUUID();
    create.addEventListener('click', async () => {
        if (!description.value.trim())
            return;
        candidate?.stop();
        playing = false;
        listen.textContent = 'Listen';
        const prompt = description.value.trim(), instrumentId = options.synth ? instrument.value : '';
        const identity = JSON.stringify([prompt, instrumentId]);
        if (previous !== identity) {
            requestKey = crypto.randomUUID();
            previous = identity;
        }
        create.disabled = true;
        use.disabled = true;
        listen.disabled = true;
        note.textContent = 'Creating the preview…';
        try {
            const result = await options.create({ synth: options.synth, prompt, requestKey, ...(instrumentId ? { instrumentId } : {}) });
            if (closed) {
                result.stop();
                return;
            }
            candidate = result;
            note.textContent = result.label;
            listen.disabled = false;
            use.disabled = false;
            // A completed take is retained. Another deliberate Create click buys a variation.
            requestKey = crypto.randomUUID();
        }
        catch (e) {
            if (!closed)
                note.textContent = e instanceof Error ? e.message : 'Could not create this sound.';
        }
        finally {
            if (!closed)
                create.disabled = false;
        }
    });
    listen.addEventListener('click', () => { if (!candidate)
        return; if (playing)
        candidate.stop();
    else
        candidate.listen(); playing = !playing; listen.textContent = playing ? 'Stop preview' : 'Listen'; });
    use.addEventListener('click', () => { if (!candidate)
        return; options.close(); if (candidate.use())
        close();
    else
        note.textContent = 'The voice changed while this preview was open. Close it and choose the source again.'; });
    cancel.addEventListener('click', () => { close(); options.close(); });
    box.append(title, description);
    if (options.synth)
        box.append(instrument);
    if (options.restore) {
        const restore = document.createElement('button');
        restore.textContent = 'Use previous source';
        restore.addEventListener('click', () => { options.close(); if (options.restore?.())
            close(); });
        box.append(restore);
    }
    box.append(note, create, listen, use, cancel);
    function close() { closed = true; candidate?.stop(); box.remove(); }
    return { el: box, close };
}
//# sourceMappingURL=source.js.map