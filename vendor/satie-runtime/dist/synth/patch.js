/**
 * The synthesizer's patch: what a synthesized take IS, as data.
 *
 * A `synth` voice is not a recording and not a rented generation. A model reads
 * the description ("a low drone in the style of Brian Eno's ambient") and writes
 * one of these; `render.ts` turns it into audio with no model in the loop. The
 * patch is kept with the take, so every synthesized sound has its exact
 * parameters on file.
 *
 * The shape follows the DDSP decoder on purpose (a bank of partials, filtered
 * noise, a reverb), so a learned controller can later write the same controls.
 *
 * `sanitizePatch` never trusts its input: it clamps every number, drops what it
 * cannot read and fills defaults, so whatever a model returns either renders or
 * is refused with a reason. Pure; runs in a function, a worker or a browser.
 */
import { readInstrument } from './instruments.js';
export const SYNTH_MODEL = 'satie-synth-3';
/** Named spectra. Harmonic ones play from a wavetable; `glass` and `bell` are inharmonic partials that ring and die. */
export const WAVES = ['sine', 'soft', 'warm', 'saw', 'square', 'organ', 'glass', 'bell', 'noise'];
export const LIMITS = { layers: 6, notes: 8, chords: 16, loopNotes: 12, steps: 64, partials: 12, minSeconds: 2, maxSeconds: 120 };
const num = (v, lo, hi, dflt) => typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : dflt;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const NOTE_LO = -36, NOTE_HI = 60;
const notes = (v, max) => list(v, max).filter((n) => typeof n === 'number' && Number.isFinite(n)).map(n => Math.min(Math.max(n, NOTE_LO), NOTE_HI));
function motion(v, maxDepth) {
    const m = obj(v);
    const depth = num(m.depth, 0, maxDepth, 0);
    return depth > 0 ? { period: num(m.period, 0.5, 240, 20), depth } : null;
}
function play(v) {
    const p = obj(v);
    if (p.kind === 'chords') {
        const chords = list(p.chords, LIMITS.chords).map(c => ({ notes: notes(obj(c).notes, LIMITS.notes), beats: num(obj(c).beats, 0.25, 64, 4) })).filter(c => c.notes.length);
        if (chords.length)
            return { kind: 'chords', chords };
    }
    if (p.kind === 'loops') {
        const out = list(p.notes, LIMITS.loopNotes).map(n => obj(n)).filter(n => typeof n.note === 'number' && Number.isFinite(n.note)).map(n => ({
            note: Math.min(Math.max(n.note, NOTE_LO), NOTE_HI), every: num(n.every, 1, 240, 17), at: num(n.at, 0, 240, 0), length: num(n.length, 0.05, 60, 3),
        }));
        if (out.length)
            return { kind: 'loops', notes: out };
    }
    if (p.kind === 'sequence') {
        const steps = list(p.steps, LIMITS.steps).map(s => (typeof s === 'number' && Number.isFinite(s) ? Math.min(Math.max(s, NOTE_LO), NOTE_HI) : null));
        if (steps.some(s => s !== null))
            return { kind: 'sequence', steps, step: num(p.step, 0.05, 30, 0.5), length: num(p.length, 0.02, 30, 0.4) };
    }
    const held = notes(p.notes, LIMITS.notes);
    return { kind: 'hold', notes: held.length ? held : [0] };
}
function layer(v, i) {
    const l = obj(v);
    const wave = WAVES.includes(l.wave) ? l.wave : 'soft';
    const partials = list(l.partials, LIMITS.partials).map(p => ({ ratio: num(obj(p).ratio, 0.25, 32, 0), amp: num(obj(p).amp, 0, 1, 0) })).filter(p => p.ratio > 0 && p.amp > 0);
    return {
        name: typeof l.name === 'string' && l.name.trim() ? l.name.trim().slice(0, 40) : `layer ${i + 1}`,
        ...(l.instrument ? { instrument: readInstrument(l.instrument) } : {}),
        wave,
        partials: partials.length ? partials : null,
        level: num(l.level, -40, 0, -6),
        pan: num(l.pan, -1, 1, 0),
        width: num(l.width, 0, 1, 0.6),
        voices: Math.round(num(l.voices, 1, 5, 2)),
        detune: num(l.detune, 0, 50, 6),
        play: play(l.play),
        attack: num(l.attack, 0.002, 30, 2),
        decay: num(l.decay, 0, 30, 0),
        sustain: num(l.sustain, 0, 1, 1),
        release: num(l.release, 0.01, 40, 4),
        cutoff: num(l.cutoff, 40, 18000, 4000),
        resonance: num(l.resonance, 0, 0.95, 0.1),
        cutoffMotion: motion(l.cutoffMotion, 4),
        levelMotion: motion(l.levelMotion, 1),
        pitchMotion: motion(l.pitchMotion, 50),
    };
}
/** A patch that renders, or the reason it cannot. */
export function sanitizePatch(raw) {
    const p = obj(raw);
    if (list(p.layers, LIMITS.layers).some(l => obj(l).instrument !== undefined && !readInstrument(obj(l).instrument)))
        return { ok: false, reason: 'unknown instrument or instrument version' };
    const layers = list(p.layers, LIMITS.layers).map(layer);
    if (!layers.length)
        return { ok: false, reason: 'the patch has no layers' };
    const r = obj(p.reverb);
    return {
        ok: true,
        patch: {
            title: typeof p.title === 'string' ? p.title.trim().slice(0, 80) : '',
            root: Math.round(num(p.root, 12, 84, 36)),
            layers,
            reverb: { seconds: num(r.seconds, 0, 20, 4), mix: num(r.mix, 0, 0.9, 0.3), tone: num(r.tone, 0, 1, 0.5) },
        },
    };
}
/** The spectrum a named wave stands for. Amplitudes are relative; the renderer evens the level. */
export function partialsOf(wave) {
    const h = (n, amp) => Array.from({ length: n }, (_, i) => ({ ratio: i + 1, amp: amp(i + 1) })).filter(p => p.amp > 0);
    switch (wave) {
        case 'sine': return [{ ratio: 1, amp: 1 }];
        case 'soft': return h(6, k => 1 / (k * k));
        case 'warm': return h(12, k => 1 / Math.pow(k, 1.5));
        case 'saw': return h(40, k => 1 / k);
        case 'square': return h(39, k => (k % 2 ? 1 / k : 0));
        case 'organ': return [{ ratio: 0.5, amp: 0.5 }, { ratio: 1, amp: 1 }, { ratio: 2, amp: 0.6 }, { ratio: 3, amp: 0.25 }, { ratio: 4, amp: 0.3 }, { ratio: 6, amp: 0.1 }, { ratio: 8, amp: 0.08 }];
        case 'glass': return [{ ratio: 1, amp: 1 }, { ratio: 2.76, amp: 0.45 }, { ratio: 5.4, amp: 0.25 }, { ratio: 8.93, amp: 0.12 }];
        case 'bell': return [{ ratio: 0.5, amp: 0.5 }, { ratio: 1, amp: 1 }, { ratio: 1.19, amp: 0.6 }, { ratio: 1.56, amp: 0.4 }, { ratio: 2, amp: 0.55 }, { ratio: 2.51, amp: 0.3 }, { ratio: 3.01, amp: 0.2 }, { ratio: 4.1, amp: 0.12 }];
        case 'noise': return [];
    }
}
//# sourceMappingURL=patch.js.map