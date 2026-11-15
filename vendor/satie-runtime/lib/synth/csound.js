/** Compile validated patch data to a bounded Csound orchestra. No model-written code is executed. */
import { partialsOf } from './patch.js';
import { readSynthAsset } from './asset.js';
import { instrumentBody } from './instruments.js';
const n = (v) => Number(v.toFixed(8)).toString();
function instrument(layer, id, layerCount) {
    const partials = layer.partials ?? partialsOf(layer.wave);
    const total = partials.reduce((sum, p) => sum + p.amp, 0) || 1;
    const code = [`instr ${id}`, 'kPitch portk chnget:k("pitch"), 0.025, 1',
        'kBright portk chnget:k("brightness"), 0.04, 1',
        `kPitchLfo oscili ${n(layer.pitchMotion?.depth ?? 0)}, ${n(1 / (layer.pitchMotion?.period ?? 20))}`,
        `kCutLfo oscili ${n(layer.cutoffMotion?.depth ?? 0)}, ${n(1 / (layer.cutoffMotion?.period ?? 20))}`,
        `kLevelLfo oscili ${n((layer.levelMotion?.depth ?? 0) / 2)}, ${n(1 / (layer.levelMotion?.period ?? 20))}`,
        'kHz = cpsmidinn(p4) * kPitch * pow(2, kPitchLfo / 1200)',
        `aEnv madsr ${n(layer.attack)}, ${n(Math.max(.001, layer.decay))}, ${n(layer.decay ? layer.sustain : 1)}, ${n(layer.release)}`,
        'aL init 0', 'aR init 0', 'aL = 0', 'aR = 0'];
    if (layer.instrument) {
        const pan = (layer.pan + 1) / 2;
        code.push(instrumentBody(layer.instrument), `aL = aOut * ${n(Math.cos(pan * Math.PI / 2))}`, `aR = aOut * ${n(Math.sin(pan * Math.PI / 2))}`);
    }
    for (let voice = 0; !layer.instrument && voice < layer.voices; voice++) {
        const spread = layer.voices === 1 ? 0 : voice / (layer.voices - 1) * 2 - 1;
        const pan = Math.max(0, Math.min(1, (layer.pan + spread * layer.width + 1) / 2));
        code.push(`kF${voice} = kHz * ${n(2 ** (spread * layer.detune / 1200))}`);
        if (layer.wave === 'noise') {
            code.push(`aV${voice} rand 0.6`);
        }
        else if (!layer.partials && (layer.wave === 'saw' || layer.wave === 'square')) {
            code.push(`aV${voice} vco2 0.65, limit(kF${voice}, 10, sr * 0.4), ${layer.wave === 'saw' ? 0 : 10}`);
        }
        else {
            code.push(`aV${voice} init 0`, `aV${voice} = 0`);
            partials.forEach((p, i) => {
                // A partial crossing Nyquist fades out instead of folding into the spectrum.
                code.push(`kF${voice}_${i} = kF${voice} * ${n(p.ratio)}`, `aP${voice}_${i} poscil ${n(p.amp / total)} * limit((sr * 0.48 - kF${voice}_${i}) / (sr * 0.03), 0, 1), kF${voice}_${i}, giSine`, `aV${voice} += aP${voice}_${i}`);
            });
        }
        code.push(`aL += aV${voice} * ${n(Math.cos(pan * Math.PI / 2))}`, `aR += aV${voice} * ${n(Math.sin(pan * Math.PI / 2))}`);
    }
    code.push(`kCut = limit(${n(layer.cutoff)} * kBright * pow(2, kCutLfo), 30, sr * 0.44)`, `aL moogladder aL, kCut, ${n(layer.resonance * .7)}`, `aR moogladder aR, kCut, ${n(layer.resonance * .7)}`, `kLevel = ${n(0.5 * 10 ** (layer.level / 20) / (layer.instrument ? 1 : layer.voices) / Math.sqrt(layerCount))} * (1 - ${n((layer.levelMotion?.depth ?? 0) / 2)} + kLevelLfo)`, 'gaL += aL * aEnv * kLevel * p5', 'gaR += aR * aEnv * kLevel * p5', 'endin');
    return code.join('\n');
}
function events(layer, seconds) {
    const p = layer.play;
    if (p.kind === 'hold')
        return [];
    if (p.kind === 'loops')
        return p.notes.map(x => ({ note: x.note, at: x.at % x.every, gate: x.length, period: x.every, gain: 1 / Math.sqrt(p.notes.length) }));
    if (p.kind === 'sequence')
        return p.steps.flatMap((note, i) => note === null ? [] : [{ note, at: i * p.step, gate: p.length, period: p.steps.length * p.step, gain: 1 }]);
    const beats = p.chords.reduce((sum, c) => sum + c.beats, 0);
    let at = 0;
    return p.chords.flatMap(c => {
        const gate = seconds * c.beats / beats;
        const result = c.notes.map(note => ({ note, at, gate, period: seconds, gain: 1 / Math.sqrt(c.notes.length) }));
        at += gate;
        return result;
    });
}
export function compileCsound(raw, sampleRate) {
    const asset = readSynthAsset(raw);
    if (!asset)
        throw new Error('Invalid synthesizer asset');
    const { patch, seconds } = asset;
    const sr = Math.round(Math.max(8000, Math.min(192000, sampleRate)));
    const orchestra = [`sr = ${sr}`, 'ksmps = 32', 'nchnls = 2', '0dbfs = 1',
        `seed ${asset.seed || 1}`, 'giSine ftgen 0, 0, 16384, 10, 1', 'gaL init 0', 'gaR init 0',
        'chnset 1, "pitch"', 'chnset 1, "brightness"', 'chnset 1, "tempo"'];
    const score = [];
    patch.layers.forEach((layer, i) => {
        const id = i + 1;
        orchestra.push(`maxalloc ${id}, 16`, instrument(layer, id, patch.layers.length));
        if (layer.play.kind === 'hold') {
            // Negative durations with the same p1 tie/reinitialize one instance. Give each
            // held note its own fractional p1 so a chord does not collapse to its last note.
            const notes = layer.play.notes;
            notes.forEach((note, j) => score.push(`i ${n(id + (j + 1) / 1000)} 0 -1 ${patch.root + note} ${n(1 / Math.sqrt(notes.length))}`));
        }
        else {
            // Scheduling runs on Csound's audio clock, including when the browser tab is backgrounded.
            const es = events(layer, seconds);
            const controller = [`instr ${100 + id}`, 'kTempo portk chnget:k("tempo"), 0.04, 1', 'kCursor init 0'];
            es.forEach((e, j) => {
                controller.push(`kNext${j} init ${n(e.at)}`, `if kCursor >= kNext${j} then`, `event "i", ${id}, 0, ${n(e.gate)} / kTempo, ${patch.root + e.note}, ${n(e.gain)}`, `kNext${j} += ${n(e.period)}`, 'endif');
            });
            controller.push('kCursor += kTempo * ksmps / sr', 'endin');
            orchestra.push(controller.join('\n'));
            score.push(`i ${100 + id} 0 -1`);
        }
    });
    const feedback = Math.min(.94, .5 + patch.reverb.seconds * .022);
    // A fixed 128-sample dcblock2 removes substantial bass at browser sample rates.
    // Set a 10 Hz pole in seconds so low drones survive at every supported rate.
    const dcPole = Math.exp(-2 * Math.PI * 10 / sr);
    orchestra.push(`instr 900
aDryL dcblock gaL, ${n(dcPole)}
aDryR dcblock gaR, ${n(dcPole)}
aWetL, aWetR reverbsc aDryL, aDryR, ${n(feedback)}, ${n(1500 + patch.reverb.tone * 10000)}
aL = aDryL * ${n(1 - patch.reverb.mix)} + aWetL * ${n(patch.reverb.mix)}
aR = aDryR * ${n(1 - patch.reverb.mix)} + aWetR * ${n(patch.reverb.mix)}
outs tanh(aL), tanh(aR)
clear gaL, gaR
endin
instr 999
event "e", 0, 0
endin`);
    score.push('i 900 0 -1', 'f 0 z');
    return `<CsoundSynthesizer>
<CsOptions>
-d -m0 -odac
</CsOptions>
<CsInstruments>
${orchestra.join('\n')}
</CsInstruments>
<CsScore>
${score.join('\n')}
</CsScore>
</CsoundSynthesizer>`;
}
//# sourceMappingURL=csound.js.map