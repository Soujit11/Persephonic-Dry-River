/**
 * The open signal namespace a scene publishes into (`setSignal('danger', 0.7)`
 * over a game bridge, a sensor, an LFO — the engine routes numbers, it does
 * not know what danger is), with the velocity memory that lets the demand
 * tick ask where a signal will be a few seconds from now.
 *
 * Collaborators: a clock (`now()`), and the engine's world for the two
 * things only it knows — the hour's own clock rate and a scene control's
 * `[min, max]`. Measured channels (`distance`, `gaze`, an entity member's
 * body) are NOT here: they are read from tracks by the engine's
 * `signalValue`, which falls through to this bus for everything else.
 */
/** A signal's last velocity counts for this long after its last sample; a slider that stopped moving predicts nothing. */
export declare const SIGNAL_VELOCITY_STALE_S = 3;
/** Signals the world publishes on a 0..1 scale — their prediction clamps there rather than to the range seen so far. */
export declare const UNIT_SIGNALS: ReadonlySet<string>;
export interface SignalBusHooks {
    /** The engine clock, in seconds. */
    now(): number;
    /** The world's own `hour` prediction (`clockRate` minutes per real minute); null without a world. */
    predictHour(horizonS: number): number | null;
    /** A scene control's authored `[min, max]`; null when `key` is not a control. */
    controlRange(key: string): readonly [number, number] | null;
}
export declare class SignalBus {
    private readonly hooks;
    private readonly values;
    /** Per-signal velocity memory (`set`): the last two samples and the observed range. */
    private readonly history;
    constructor(hooks: SignalBusHooks);
    /** Every published signal by lowercase name (read-only view; tests and the devtools read it). */
    get snapshot(): ReadonlyMap<string, number>;
    /**
     * Publish a scene-defined signal. Names are lowercased. Any `follow`/`when`
     * binding naming it reads the latest value each spatial tick; unset
     * signals read NaN and bindings hold. Non-finite values are ignored.
     */
    set(name: string, value: number): void;
    /** The current value of a published signal, NaN when it was never set. `name` is looked up as given (bindings carry lowercase names). */
    get(name: string): number;
    /** Withdraw a publisher's channel, including velocity/range memory for its next owner. */
    delete(name: string): void;
    /**
     * Where a signal will be `horizonS` seconds from now, by the engine's own
     * reckoning: `hour` advances at the world's `clockRate`; any other
     * published signal is extrapolated linearly by its recent velocity (the
     * last two samples, forgotten `SIGNAL_VELOCITY_STALE_S` after the latest)
     * and clamped — to 0..1 for the world's weather / cover signals, to a
     * scene control's own `[min, max]`, else to the range seen so far.
     * Never-published signals return NaN: the engine does not guess what it
     * cannot see.
     */
    predicted(name: string, horizonS: number): number;
}
//# sourceMappingURL=SignalBus.d.ts.map