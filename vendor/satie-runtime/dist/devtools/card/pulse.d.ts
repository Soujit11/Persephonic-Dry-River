/**
 * A sound that plays only now and then (a dog's bark every 20 to 45 s) would be silent for most
 * of the time you spend editing it. While a dial is held or a proposal is open, the card fires it
 * again and again through its own voice (`SatieEngine.fireNow`), each fire starting a short gap
 * after the last one ends, so every change is heard within a moment. When you let go it fires
 * once more and stops. The recording is never looped: a loop would join one bark end to end,
 * hide its versions and make the timing dials meaningless.
 *
 * Pure scheduling: the fire, the sound's length and the timer are injected.
 */
/** Silence between the end of one editing fire and the next (s). */
export declare const EDIT_GAP_S = 0.6;
/** How often the sound comes round while you edit it: its own length plus the gap (ms). */
export declare function editPaceMs(durationS: number): number;
export interface PulseDeps {
    fire(): 'fired' | 'silent';
    /** The length of what it plays (s), read before each fire. */
    durationS(): number;
    setTimer(run: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
    /** Told when a fire finds nothing to play (outside its zone, not placed yet). */
    onSilent?(): void;
}
export declare class Pulse {
    private readonly deps;
    private timer;
    private lastOne;
    private kept;
    constructor(deps: PulseDeps);
    get running(): boolean;
    get keepPlaying(): boolean;
    /** A dial is held, or a proposal opened: fire now, then at the editing pace. */
    start(): void;
    /** Let go: one more fire, then stop (unless "keep playing" is on). */
    release(): void;
    /** "▶ keep playing": runs until switched off or the card closes. */
    setKeepPlaying(on: boolean): void;
    stop(): void;
    private tick;
}
//# sourceMappingURL=pulse.d.ts.map