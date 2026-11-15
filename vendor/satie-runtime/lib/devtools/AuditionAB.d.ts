/**
 * Two renders of one scene on a single playhead.
 *
 * `TakeComparison` plays one side, then the other, from the top — the gap
 * between them is exactly where a small difference stops being audible. This
 * player starts BOTH buffers together, sample aligned and looping, and swaps
 * which one you hear with a short gain crossfade. The difference arrives at
 * the same moment in the material, which is the only way a listener can hear
 * a metre of position or a little more room.
 *
 * The two renders are near identical signals, so the crossfade is linear:
 * correlated material sums to constant amplitude, where an equal-power curve
 * would bump.
 */
export declare class AuditionAB {
    private readonly context;
    private readonly a;
    private readonly b;
    readonly durationS: number;
    private readonly full;
    private voices;
    private startedAt;
    private current;
    private generation;
    private disposed;
    constructor(context: AudioContext, a: AudioBuffer, b: AudioBuffer, options?: {
        durationS?: number;
        gain?: number;
        side?: 'A' | 'B';
    });
    get side(): 'A' | 'B';
    get playing(): boolean;
    /** Seconds into the looped excerpt; 0 while stopped. */
    get position(): number;
    start(side?: 'A' | 'B'): Promise<boolean>;
    /** Instant, click-free swap; the playhead never moves. */
    select(side: 'A' | 'B'): void;
    stop(): void;
    destroy(): void;
}
//# sourceMappingURL=AuditionAB.d.ts.map