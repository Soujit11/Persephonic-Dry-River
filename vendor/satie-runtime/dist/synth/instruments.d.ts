/** Curated adaptations of DrC's authored melody/bank.ts (not the Dr. B reference collection).
 * The oscillator techniques are retained; envelopes, pitch, brightness and placement
 * use Satie's voice controls. Only these trusted bodies become Csound code.
 */
export declare const INSTRUMENT_VERSION: 1;
export interface InstrumentParam {
    name: string;
    label: string;
    min: number;
    max: number;
    default: number;
}
export interface InstrumentDefinition {
    id: string;
    name: string;
    technique: string;
    use: string;
    params: readonly InstrumentParam[];
}
export declare const SYNTH_INSTRUMENTS: readonly [{
    readonly id: "drc-saw";
    readonly name: "Filtered saw";
    readonly technique: "Two detuned saws through a ladder filter.";
    readonly use: "Warm sustained drones, pads and brass. Shape the body with cutoff, attack and release.";
    readonly params: readonly [InstrumentParam];
}, {
    readonly id: "drc-chorus";
    readonly name: "Chorused triangle";
    readonly technique: "Two triangle oscillators and two slowly modulated delays.";
    readonly use: "Rounded evolving pads and a soft harmonic ground. Long attacks, overlapping chords, slow motion.";
    readonly params: readonly [InstrumentParam, InstrumentParam];
}, {
    readonly id: "drc-fm2";
    readonly name: "Two-operator FM";
    readonly technique: "A sine modulates another sine; ratio sets the harmonic relationship, index the sidebands.";
    readonly use: "Soft electric keys, glass, bells or a changing pure tone. Low index is gentle; noninteger ratios give inharmonic bells.";
    readonly params: readonly [InstrumentParam, InstrumentParam];
}, {
    readonly id: "drc-fm3";
    readonly name: "Three-operator FM";
    readonly technique: "A modulator modulates a second modulator and then the carrier.";
    readonly use: "Complex evolving keys and metallic tones. Keep indices low for ambient textures.";
    readonly params: readonly [InstrumentParam, InstrumentParam, InstrumentParam, InstrumentParam];
}, {
    readonly id: "drc-additive";
    readonly name: "Eight partials";
    readonly technique: "Eight sines with spectral tilt, stretch and faster decay of the upper partials.";
    readonly use: "Organ-like held tones, soft mallets and stretched piano-like notes. Even controls hollowness; damping controls how the brightness dies.";
    readonly params: readonly [InstrumentParam, InstrumentParam, InstrumentParam, InstrumentParam];
}, {
    readonly id: "drc-modes";
    readonly name: "Modal resonators";
    readonly technique: "A noise impulse excites four resonant modes.";
    readonly use: "Bowl, bar and bell-like strikes. Use sparse loops or sequences; a held note produces one strike, not a continuous drone.";
    readonly params: readonly [InstrumentParam, InstrumentParam, InstrumentParam];
}];
export type InstrumentId = typeof SYNTH_INSTRUMENTS[number]['id'];
export interface Instrument {
    id: InstrumentId;
    version: 1;
    params: Record<string, number>;
}
export declare const instrumentById: (id: string) => InstrumentDefinition | undefined;
export declare function readInstrument(raw: unknown): Instrument | null;
/** Reads kHz/aEnv supplied by the common voice, leaves aOut. All interpolation is validated numeric data. */
export declare function instrumentBody(instrument: Instrument): string;
//# sourceMappingURL=instruments.d.ts.map