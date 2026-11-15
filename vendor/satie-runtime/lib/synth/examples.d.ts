/** Two patches as a model would write them: the worked examples in the patch-writing prompt (server/media/synth.ts), and the test material. */
/** "A low drone in the style of Brian Eno's ambient." */
export declare const DRONE: {
    title: string;
    root: number;
    layers: ({
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                detune: number;
                rate?: undefined;
                ratio?: undefined;
                index?: undefined;
                tilt?: undefined;
                even?: undefined;
            };
        };
        wave: string;
        level: number;
        voices: number;
        detune: number;
        width: number;
        play: {
            kind: string;
            notes: number[];
        };
        cutoff: number;
        resonance: number;
        cutoffMotion: {
            period: number;
            depth: number;
        };
        levelMotion: {
            period: number;
            depth: number;
        };
        pitchMotion?: undefined;
        attack?: undefined;
        decay?: undefined;
        sustain?: undefined;
        release?: undefined;
    } | {
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                rate: number;
                detune: number;
                ratio?: undefined;
                index?: undefined;
                tilt?: undefined;
                even?: undefined;
            };
        };
        wave: string;
        level: number;
        voices: number;
        detune: number;
        width: number;
        play: {
            kind: string;
            notes: number[];
        };
        cutoff: number;
        levelMotion: {
            period: number;
            depth: number;
        };
        pitchMotion: {
            period: number;
            depth: number;
        };
        resonance?: undefined;
        cutoffMotion?: undefined;
        attack?: undefined;
        decay?: undefined;
        sustain?: undefined;
        release?: undefined;
    } | {
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                ratio: number;
                index: number;
                detune?: undefined;
                rate?: undefined;
                tilt?: undefined;
                even?: undefined;
            };
        };
        wave: string;
        level: number;
        voices: number;
        width: number;
        attack: number;
        decay: number;
        sustain: number;
        release: number;
        cutoff: number;
        play: {
            kind: string;
            notes: {
                note: number;
                every: number;
                at: number;
                length: number;
            }[];
        };
        detune?: undefined;
        resonance?: undefined;
        cutoffMotion?: undefined;
        levelMotion?: undefined;
        pitchMotion?: undefined;
    } | {
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                tilt: number;
                even: number;
                detune?: undefined;
                rate?: undefined;
                ratio?: undefined;
                index?: undefined;
            };
        };
        wave: string;
        level: number;
        width: number;
        cutoff: number;
        resonance: number;
        cutoffMotion: {
            period: number;
            depth: number;
        };
        levelMotion: {
            period: number;
            depth: number;
        };
        voices?: undefined;
        detune?: undefined;
        play?: undefined;
        pitchMotion?: undefined;
        attack?: undefined;
        decay?: undefined;
        sustain?: undefined;
        release?: undefined;
    })[];
    reverb: {
        seconds: number;
        mix: number;
        tone: number;
    };
};
/** "An ambient progression playing." */
export declare const PROGRESSION: {
    title: string;
    root: number;
    layers: ({
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                rate: number;
                detune: number;
                tilt?: undefined;
                even?: undefined;
                ratio?: undefined;
                index?: undefined;
            };
        };
        wave: string;
        level: number;
        voices: number;
        detune: number;
        width: number;
        attack: number;
        release: number;
        cutoff: number;
        cutoffMotion: {
            period: number;
            depth: number;
        };
        play: {
            kind: string;
            chords: {
                notes: number[];
                beats: number;
            }[];
            steps?: undefined;
            step?: undefined;
            length?: undefined;
        };
        decay?: undefined;
        sustain?: undefined;
    } | {
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                tilt: number;
                even: number;
                rate?: undefined;
                detune?: undefined;
                ratio?: undefined;
                index?: undefined;
            };
        };
        wave: string;
        level: number;
        voices: number;
        attack: number;
        release: number;
        play: {
            kind: string;
            chords: {
                notes: number[];
                beats: number;
            }[];
            steps?: undefined;
            step?: undefined;
            length?: undefined;
        };
        detune?: undefined;
        width?: undefined;
        cutoff?: undefined;
        cutoffMotion?: undefined;
        decay?: undefined;
        sustain?: undefined;
    } | {
        name: string;
        instrument: {
            id: string;
            version: number;
            params: {
                ratio: number;
                index: number;
                rate?: undefined;
                detune?: undefined;
                tilt?: undefined;
                even?: undefined;
            };
        };
        wave: string;
        level: number;
        voices: number;
        width: number;
        attack: number;
        decay: number;
        sustain: number;
        release: number;
        play: {
            kind: string;
            steps: (number | null)[];
            step: number;
            length: number;
            chords?: undefined;
        };
        detune?: undefined;
        cutoff?: undefined;
        cutoffMotion?: undefined;
    })[];
    reverb: {
        seconds: number;
        mix: number;
        tone: number;
    };
};
//# sourceMappingURL=examples.d.ts.map