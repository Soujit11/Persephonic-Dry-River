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
export const SIGNAL_VELOCITY_STALE_S = 3;
/** Signals the world publishes on a 0..1 scale — their prediction clamps there rather than to the range seen so far. */
export const UNIT_SIGNALS = new Set(['rain', 'wind', 'fog', 'overhead', 'canopy', 'submerged']);
export class SignalBus {
    hooks;
    values = new Map();
    /** Per-signal velocity memory (`set`): the last two samples and the observed range. */
    history = new Map();
    constructor(hooks) {
        this.hooks = hooks;
    }
    /** Every published signal by lowercase name (read-only view; tests and the devtools read it). */
    get snapshot() { return this.values; }
    /**
     * Publish a scene-defined signal. Names are lowercased. Any `follow`/`when`
     * binding naming it reads the latest value each spatial tick; unset
     * signals read NaN and bindings hold. Non-finite values are ignored.
     */
    set(name, value) {
        if (typeof value !== 'number' || !isFinite(value))
            return;
        const key = name.toLowerCase();
        this.values.set(key, value);
        // One history object per signal, mutated in place after that.
        const t = this.hooks.now();
        const h = this.history.get(key);
        if (!h) {
            this.history.set(key, { t0: t, v0: value, t1: t, v1: value, lo: value, hi: value });
            return;
        }
        if (t > h.t1) {
            h.t0 = h.t1;
            h.v0 = h.v1;
            h.t1 = t;
        }
        h.v1 = value;
        if (value < h.lo)
            h.lo = value;
        if (value > h.hi)
            h.hi = value;
    }
    /** The current value of a published signal, NaN when it was never set. `name` is looked up as given (bindings carry lowercase names). */
    get(name) {
        const v = this.values.get(name);
        return v === undefined ? NaN : v;
    }
    /** Withdraw a publisher's channel, including velocity/range memory for its next owner. */
    delete(name) {
        const key = name.toLowerCase();
        this.values.delete(key);
        this.history.delete(key);
    }
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
    predicted(name, horizonS) {
        const key = name.toLowerCase();
        if (key === 'hour') {
            const hour = this.hooks.predictHour(horizonS);
            if (hour !== null)
                return hour;
        }
        const cur = this.values.get(key);
        if (cur === undefined)
            return NaN;
        const h = this.history.get(key);
        if (!h || horizonS <= 0)
            return cur;
        const span = h.t1 - h.t0;
        if (span <= 0 || this.hooks.now() - h.t1 > SIGNAL_VELOCITY_STALE_S)
            return cur;
        const p = cur + ((h.v1 - h.v0) / span) * horizonS;
        let lo = h.lo, hi = h.hi;
        const range = UNIT_SIGNALS.has(key) ? [0, 1] : this.hooks.controlRange(key);
        if (range) {
            lo = range[0];
            hi = range[1];
        }
        return p < lo ? lo : p > hi ? hi : p;
    }
}
//# sourceMappingURL=SignalBus.js.map