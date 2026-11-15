/** The input that maps to a binding's loudest output. */
const loudestInput = (b) => (b.outMax >= b.outMin ? b.inMax : b.inMin);
export class EditHold {
    ids = new Set();
    /** Replace the held set (null or empty: nothing held). */
    set(sourceIds) {
        this.ids = new Set(sourceIds ?? []);
    }
    get any() { return this.ids.size > 0; }
    held(stmt) {
        return this.ids.size > 0 && !!stmt?.sourceId && this.ids.has(stmt.sourceId);
    }
    /** The value a held voice reads for `signal` (its level follows it), else undefined: read the real signal. */
    signalFor(stmt, signal) {
        if (!this.held(stmt))
            return undefined;
        if (stmt.volumeFollow?.signal === signal)
            return loudestInput(stmt.volumeFollow);
        if (stmt.splFollow?.signal === signal)
            return loudestInput(stmt.splFollow);
        return undefined;
    }
}
//# sourceMappingURL=EditHold.js.map