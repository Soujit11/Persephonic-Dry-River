/** Controlled dry excerpts. Completion means scheduled playback ended, not that a human heard it. */
export declare class TakeComparison {
    private context;
    private a;
    private b;
    private options;
    readonly durationS: number;
    private source;
    private gain;
    private cancel;
    private generation;
    private disposed;
    readonly completed: Set<"A" | "B">;
    constructor(context: AudioContext, a: AudioBuffer, b: AudioBuffer, options?: {
        durationS?: number;
        gain?: number;
    });
    /** Freeze at most five seconds so later caller mutations cannot change a pinned excerpt. */
    static excerpt(context: AudioContext, buffer: AudioBuffer): AudioBuffer;
    play(side: 'A' | 'B'): Promise<boolean>;
    stop(): void;
    destroy(): void;
}
//# sourceMappingURL=TakeComparison.d.ts.map