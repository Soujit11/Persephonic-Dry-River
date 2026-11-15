export function soundscapeShares(input) {
    const out = new Map();
    let inside = 0;
    for (const e of input.enclosed) {
        const p = Math.min(1, Math.max(0, e.presence));
        out.set(e.id, p);
        inside = Math.max(inside, p);
    }
    const rest = 1 - inside;
    const total = input.open.reduce((a, o) => a + Math.max(0, o.powerLin), 0);
    for (const o of input.open)
        out.set(o.id, total > 0 ? rest * Math.max(0, o.powerLin) / total : 0);
    return out;
}
/**
 * How much louder another open soundscape's own sounds must be before "here" moves to it (dB).
 * Place steering's rule (spec 012), kept after a simulated walk through Fumikiri (2026-11-12):
 * the answer changed 9 times without it and 5 times with it, the same as place steering's own
 * 500 ms rule.
 */
export const HERE_HOLD_DB = 3;
const HOLD_RATIO = Math.pow(10, HERE_HOLD_DB / 10);
/**
 * Which soundscape the listener is in, from the shares: an enclosed one once its rooms hold
 * more than half of them; otherwise the open one whose own sounds are loudest, kept until
 * another's are `HERE_HOLD_DB` louder. Open shares are proportional to power, so their ratio
 * is the power ratio. Null before anything sounds.
 */
export function soundscapeHere(shares, enclosedIds, current) {
    let room = null, roomP = 0.5;
    for (const id of enclosedIds) {
        const p = shares.get(id) ?? 0;
        if (p > roomP) {
            roomP = p;
            room = id;
        }
    }
    if (room)
        return room;
    let best = null, bestV = 0;
    for (const [id, v] of shares)
        if (!enclosedIds.has(id) && v > bestV) {
            bestV = v;
            best = id;
        }
    const cur = current && !enclosedIds.has(current) && shares.has(current) ? current : null;
    if (!best)
        return cur;
    if (cur && best !== cur && bestV < (shares.get(cur) ?? 0) * HOLD_RATIO)
        return cur;
    return best;
}
/** dB SPL to linear power, for summing what reaches the ear. */
export const dbToPower = (db) => (Number.isFinite(db) ? 10 ** (db / 10) : 0);
//# sourceMappingURL=SoundscapeShare.js.map