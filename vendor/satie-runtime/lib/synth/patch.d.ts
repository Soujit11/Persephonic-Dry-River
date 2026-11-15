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
import { type Instrument } from './instruments.js';
export declare const SYNTH_MODEL = "satie-synth-3";
/** Named spectra. Harmonic ones play from a wavetable; `glass` and `bell` are inharmonic partials that ring and die. */
export declare const WAVES: readonly ["sine", "soft", "warm", "saw", "square", "organ", "glass", "bell", "noise"];
export type Wave = typeof WAVES[number];
export interface Partial {
    ratio: number;
    amp: number;
}
/** A slow, periodic change: one full cycle every `period` seconds. */
export interface Motion {
    period: number;
    depth: number;
}
export type Play = 
/** Notes held for the whole take: a drone. Semitones above the root. */
{
    kind: 'hold';
    notes: number[];
}
/** A progression: each chord sounds for its share of the take, overlapping the next by the release. */
 | {
    kind: 'chords';
    chords: {
        notes: number[];
        beats: number;
    }[];
}
/** Tape loops: each note returns on its own period, so the pattern keeps shifting. */
 | {
    kind: 'loops';
    notes: {
        note: number;
        every: number;
        at: number;
        length: number;
    }[];
}
/** A repeating line: one step every `step` seconds, null for a rest. */
 | {
    kind: 'sequence';
    steps: (number | null)[];
    step: number;
    length: number;
};
export interface Layer {
    name: string;
    /** A versioned DrC instrument. Absent only in legacy patches. */
    instrument?: Instrument;
    wave: Wave;
    /** Overrides the named spectrum when given. */
    partials: Partial[] | null;
    /** dB relative to the other layers, -40..0. */
    level: number;
    pan: number;
    width: number;
    /** Unison voices per note and their spread in cents. */
    voices: number;
    detune: number;
    play: Play;
    attack: number;
    /** Seconds for a struck note to die toward `sustain`; 0 = no decay (a held tone). */
    decay: number;
    sustain: number;
    release: number;
    /** Low-pass corner in Hz (for `noise`: the centre of its band). */
    cutoff: number;
    resonance: number;
    cutoffMotion: Motion | null;
    levelMotion: Motion | null;
    /** Depth in cents. */
    pitchMotion: Motion | null;
}
export interface SynthPatch {
    title: string;
    /** MIDI note of the root; layer notes are semitones above it. */
    root: number;
    layers: Layer[];
    /** `seconds` is the decay time; `mix` the wet share; `tone` 0 dark .. 1 bright. */
    reverb: {
        seconds: number;
        mix: number;
        tone: number;
    };
}
export declare const LIMITS: {
    readonly layers: 6;
    readonly notes: 8;
    readonly chords: 16;
    readonly loopNotes: 12;
    readonly steps: 64;
    readonly partials: 12;
    readonly minSeconds: 2;
    readonly maxSeconds: 120;
};
/** A patch that renders, or the reason it cannot. */
export declare function sanitizePatch(raw: unknown): {
    ok: true;
    patch: SynthPatch;
} | {
    ok: false;
    reason: string;
};
/** The spectrum a named wave stands for. Amplitudes are relative; the renderer evens the level. */
export declare function partialsOf(wave: Wave): Partial[];
//# sourceMappingURL=patch.d.ts.map