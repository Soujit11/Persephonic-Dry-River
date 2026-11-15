/** Curated adaptations of DrC's authored melody/bank.ts (not the Dr. B reference collection).
 * The oscillator techniques are retained; envelopes, pitch, brightness and placement
 * use Satie's voice controls. Only these trusted bodies become Csound code.
 */
export const INSTRUMENT_VERSION = 1;
const knob = (name, label, min, max, value) => ({ name, label, min, max, default: value });
export const SYNTH_INSTRUMENTS = [
    { id: 'drc-saw', name: 'Filtered saw', technique: 'Two detuned saws through a ladder filter.', use: 'Warm sustained drones, pads and brass. Shape the body with cutoff, attack and release.', params: [knob('detune', 'Detune (cents)', 0, 25, 5)] },
    { id: 'drc-chorus', name: 'Chorused triangle', technique: 'Two triangle oscillators and two slowly modulated delays.', use: 'Rounded evolving pads and a soft harmonic ground. Long attacks, overlapping chords, slow motion.', params: [knob('detune', 'Detune (cents)', 1, 30, 6), knob('rate', 'Chorus rate (Hz)', .03, 3, .17)] },
    { id: 'drc-fm2', name: 'Two-operator FM', technique: 'A sine modulates another sine; ratio sets the harmonic relationship, index the sidebands.', use: 'Soft electric keys, glass, bells or a changing pure tone. Low index is gentle; noninteger ratios give inharmonic bells.', params: [knob('ratio', 'Ratio', .5, 8, 2), knob('index', 'Index', 0, 12, 1.2)] },
    { id: 'drc-fm3', name: 'Three-operator FM', technique: 'A modulator modulates a second modulator and then the carrier.', use: 'Complex evolving keys and metallic tones. Keep indices low for ambient textures.', params: [knob('ratio1', 'Ratio 1', .5, 6, 1), knob('ratio2', 'Ratio 2', .5, 6, 3), knob('index1', 'Index 1', 0, 8, 1), knob('index2', 'Index 2', 0, 8, .5)] },
    { id: 'drc-additive', name: 'Eight partials', technique: 'Eight sines with spectral tilt, stretch and faster decay of the upper partials.', use: 'Organ-like held tones, soft mallets and stretched piano-like notes. Even controls hollowness; damping controls how the brightness dies.', params: [knob('stretch', 'Stretch', 1, 1.08, 1), knob('tilt', 'Spectral tilt', .3, 3, 1.8), knob('damp', 'Damping', 0, 1.5, .5), knob('even', 'Even partials', 0, 1, 1)] },
    { id: 'drc-modes', name: 'Modal resonators', technique: 'A noise impulse excites four resonant modes.', use: 'Bowl, bar and bell-like strikes. Use sparse loops or sequences; a held note produces one strike, not a continuous drone.', params: [knob('shape', 'Shape', 1, 5, 1), knob('q', 'Resonance Q', 20, 2000, 240), knob('strike', 'Strike (s)', .0005, .02, .003)] },
];
export const instrumentById = (id) => SYNTH_INSTRUMENTS.find(i => i.id === id);
export function readInstrument(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const r = raw;
    const definition = typeof r.id === 'string' ? instrumentById(r.id) : undefined;
    if (!definition || (r.version !== undefined && r.version !== INSTRUMENT_VERSION))
        return null;
    const values = r.params && typeof r.params === 'object' ? r.params : {};
    const params = {};
    for (const p of definition.params) {
        const value = values[p.name];
        params[p.name] = typeof value === 'number' && Number.isFinite(value) ? Math.max(p.min, Math.min(p.max, value)) : p.default;
    }
    if ('shape' in params)
        params.shape = Math.round(params.shape);
    return { id: definition.id, version: INSTRUMENT_VERSION, params };
}
/** Reads kHz/aEnv supplied by the common voice, leaves aOut. All interpolation is validated numeric data. */
export function instrumentBody(instrument) {
    const p = instrument.params;
    switch (instrument.id) {
        case 'drc-saw': return `a1 vco2 0.5, kHz\na2 vco2 0.5, kHz * cent(${p.detune})\naOut = (a1 + a2) * 0.7`;
        case 'drc-chorus': return `a1 vco2 0.5, kHz, 12
a2 vco2 0.5, kHz * cent(${p.detune}), 12
kL1 lfo 1, ${p.rate}, 0
kL2 lfo 1, ${p.rate * 1.31}, 0
aD1 vdelay a1, a(8 + 4 * kL1), 30
aD2 vdelay a2, a(10 + 4 * kL2), 30
aOut = (a1 + a2 + aD1 + aD2) * 0.3`;
        case 'drc-fm2': return `kShape downsamp aEnv\naOut foscili 0.7, kHz, 1, ${p.ratio}, ${p.index} * kShape, giSine`;
        case 'drc-fm3': return `kShape downsamp aEnv
aM2 poscil ${p.index2 * p.ratio2} * kHz * kShape, kHz * ${p.ratio2}, giSine
aM1 poscil ${p.index1 * p.ratio1} * kHz * kShape, kHz * ${p.ratio1} + aM2, giSine
aOut poscil 0.7, kHz + aM1, giSine`;
        case 'drc-additive': return ['aOut init 0', 'aOut = 0', ...Array.from({ length: 8 }, (_, i) => {
                const h = i + 1, ratio = h * p.stretch ** i, amp = (h % 2 ? 1 : p.even) / h ** p.tilt;
                // Csound's audio power opcode rejects 0^0 at note onset and deactivates
                // the instrument. A zero damping exponent needs no extra envelope.
                const decay = i * p.damp;
                return `aP${h} poscil ${amp}${decay ? ` * (aEnv ^ ${decay})` : ''}, kHz * ${ratio}, giSine\naOut += aP${h} * 0.5`;
            })].join('\n');
        case 'drc-modes': {
            const ratios = [[2.756, 5.404, 8.933], [2, 3, 4], [2.01, 3.01, 4.2], [2.32, 4.25, 6.63], [2.77, 5.18, 8.16]][p.shape - 1];
            return `kEx expon 1, ${p.strike}, 0.001
aEx rand kEx
a1 mode aEx, limit(kHz, 10, sr * 0.45), ${p.q}
a2 mode aEx, limit(kHz * ${ratios[0]}, 10, sr * 0.45), ${p.q}
a3 mode aEx, limit(kHz * ${ratios[1]}, 10, sr * 0.45), ${p.q * .8}
a4 mode aEx, limit(kHz * ${ratios[2]}, 10, sr * 0.45), ${p.q * .6}
aOut = (a1 + a2 * 0.7 + a3 * 0.5 + a4 * 0.35) * 0.3`;
        }
    }
}
//# sourceMappingURL=instruments.js.map