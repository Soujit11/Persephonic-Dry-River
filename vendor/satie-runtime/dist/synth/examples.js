/** Two patches as a model would write them: the worked examples in the patch-writing prompt (server/media/synth.ts), and the test material. */
/** "A low drone in the style of Brian Eno's ambient." */
export const DRONE = {
    title: 'low ambient drone',
    root: 36,
    layers: [
        { name: 'ground', instrument: { id: 'drc-saw', version: 1, params: { detune: 4 } }, wave: 'soft', level: -4, voices: 3, detune: 5, width: 0.5, play: { kind: 'hold', notes: [0, 7] }, cutoff: 500, resonance: 0.1, cutoffMotion: { period: 40, depth: 0.5 }, levelMotion: { period: 23, depth: 0.3 } },
        { name: 'fifth above', instrument: { id: 'drc-chorus', version: 1, params: { rate: 0.11, detune: 7 } }, wave: 'warm', level: -12, voices: 2, detune: 8, width: 0.9, play: { kind: 'hold', notes: [12, 19] }, cutoff: 900, levelMotion: { period: 31, depth: 0.6 }, pitchMotion: { period: 17, depth: 4 } },
        { name: 'slow piano tones', instrument: { id: 'drc-fm2', version: 1, params: { ratio: 2, index: 0.7 } }, wave: 'glass', level: -14, voices: 1, width: 0.7, attack: 0.02, decay: 4, sustain: 0, release: 6, cutoff: 3000, play: { kind: 'loops', notes: [{ note: 24, every: 19, at: 2, length: 4 }, { note: 31, every: 23, at: 9, length: 4 }, { note: 28, every: 29, at: 14, length: 4 }] } },
        { name: 'air', instrument: { id: 'drc-additive', version: 1, params: { tilt: 2.4, even: 0.3 } }, wave: 'noise', level: -30, width: 1, cutoff: 2500, resonance: 0.3, cutoffMotion: { period: 37, depth: 1 }, levelMotion: { period: 27, depth: 0.7 } },
    ],
    reverb: { seconds: 9, mix: 0.45, tone: 0.35 },
};
/** "An ambient progression playing." */
export const PROGRESSION = {
    title: 'slow ambient progression',
    root: 48,
    layers: [
        { name: 'pad', instrument: { id: 'drc-chorus', version: 1, params: { rate: 0.13, detune: 6 } }, wave: 'warm', level: -5, voices: 3, detune: 9, width: 0.9, attack: 2.5, release: 5, cutoff: 1400, cutoffMotion: { period: 30, depth: 0.6 }, play: { kind: 'chords', chords: [{ notes: [0, 7, 16, 23], beats: 4 }, { notes: [-3, 4, 12, 19], beats: 4 }, { notes: [-7, 5, 12, 21], beats: 4 }, { notes: [-5, 7, 14, 19], beats: 4 }] } },
        { name: 'bass', instrument: { id: 'drc-additive', version: 1, params: { tilt: 3, even: 0.4 } }, wave: 'sine', level: -8, voices: 1, attack: 1.5, release: 4, play: { kind: 'chords', chords: [{ notes: [-12], beats: 4 }, { notes: [-15], beats: 4 }, { notes: [-19], beats: 4 }, { notes: [-17], beats: 4 }] } },
        { name: 'bells', instrument: { id: 'drc-fm2', version: 1, params: { ratio: 2.76, index: 0.6 } }, wave: 'bell', level: -16, voices: 1, width: 0.8, attack: 0.005, decay: 2.5, sustain: 0, release: 3, play: { kind: 'sequence', steps: [24, null, 31, null, null, 28, null, 35], step: 0.75, length: 0.3 } },
    ],
    reverb: { seconds: 6, mix: 0.4, tone: 0.5 },
};
//# sourceMappingURL=examples.js.map