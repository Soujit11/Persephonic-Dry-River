/** Shared shuffle history for a repertoire, including all of its live actors. */
export class TakePool {
    pools = new WeakMap();
    ordered = new WeakMap();
    /** Preparation can look ahead without consuming the next audible turn. */
    inOrder(owner, available, commit = true) {
        if (!available.length)
            return -1;
        const last = this.ordered.get(owner) ?? -1;
        const selected = available.find(take => take > last) ?? available[0];
        if (commit)
            this.ordered.set(owner, selected);
        return selected;
    }
    draw(owner, available, avoid, rng) {
        if (!available.length)
            return -1;
        let pool = this.pools.get(owner);
        if (!pool || available.length !== pool.available.length || available.some((v, i) => v !== pool.available[i])) {
            pool = { available: [...available], remaining: [], last: pool?.last ?? -1 };
            this.pools.set(owner, pool);
        }
        if (!pool.remaining.length)
            pool.remaining = [...available];
        // Prefer unplayed takes, excluding both this actor's last performance and
        // the last performance heard from another actor sharing this repertoire.
        let candidates = pool.remaining.filter(v => v !== avoid && v !== pool.last);
        if (!candidates.length)
            candidates = available.filter(v => v !== avoid && v !== pool.last);
        if (!candidates.length)
            candidates = available.filter(v => v !== avoid);
        if (!candidates.length)
            candidates = available;
        const selected = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
        pool.remaining = pool.remaining.filter(v => v !== selected);
        pool.last = selected;
        return selected;
    }
}
//# sourceMappingURL=TakePool.js.map