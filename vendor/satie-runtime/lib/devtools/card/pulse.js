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
export const EDIT_GAP_S = 0.6;
/** How often the sound comes round while you edit it: its own length plus the gap (ms). */
export function editPaceMs(durationS) {
    const d = Number.isFinite(durationS) && durationS > 0 ? durationS : 1;
    return Math.round((d + EDIT_GAP_S) * 1000);
}
export class Pulse {
    deps;
    timer = null;
    lastOne = false;
    kept = false;
    constructor(deps) {
        this.deps = deps;
    }
    get running() { return this.timer !== null; }
    get keepPlaying() { return this.kept; }
    /** A dial is held, or a proposal opened: fire now, then at the editing pace. */
    start() {
        this.lastOne = false;
        if (this.timer !== null)
            return;
        this.tick();
    }
    /** Let go: one more fire, then stop (unless "keep playing" is on). */
    release() {
        if (this.kept || this.timer === null)
            return;
        this.lastOne = true;
    }
    /** "▶ keep playing": runs until switched off or the card closes. */
    setKeepPlaying(on) {
        this.kept = on;
        if (on)
            this.start();
        else
            this.release();
    }
    stop() {
        if (this.timer !== null)
            this.deps.clearTimer(this.timer);
        this.timer = null;
        this.lastOne = false;
        this.kept = false;
    }
    tick() {
        const fired = this.deps.fire();
        if (fired === 'silent') {
            this.deps.onSilent?.();
            this.timer = null;
            this.lastOne = false;
            return;
        }
        const ms = editPaceMs(this.deps.durationS());
        this.timer = this.deps.setTimer(() => {
            if (this.lastOne && !this.kept) {
                this.lastOne = false;
                this.deps.fire();
                this.timer = null;
                return;
            }
            this.tick();
        }, ms);
    }
}
//# sourceMappingURL=pulse.js.map