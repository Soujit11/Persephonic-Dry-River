/**
 * How much the listener is in each soundscape, 0 to 1 (spec 014, phase 2): the value of the
 * `in_<soundscape>` signal a soundscape's own beds follow, and which one the listener is in.
 *
 * - An enclosed soundscape is as present as its rooms are (the eased `in_<room>` presence).
 * - What the rooms leave is shared among the open (and moving) soundscapes in proportion to
 *   the power their own steady, positioned sounds deliver at the ear. Beds are left out: they
 *   are equally loud everywhere, and a soundscape's own bed follows this very share.
 *
 * The share has no threshold: it fades across an edge as the sounds do. "Which one you are in"
 * is the discrete reading of it (`soundscapeHere`), with a hold so an edge does not flicker.
 * Pure; the engine feeds it each spatial tick.
 */
export interface ShareInput {
    enclosed: ReadonlyArray<{
        id: string;
        presence: number;
    }>;
    open: ReadonlyArray<{
        id: string;
        powerLin: number;
    }>;
}
export declare function soundscapeShares(input: ShareInput): Map<string, number>;
/**
 * How much louder another open soundscape's own sounds must be before "here" moves to it (dB).
 * Place steering's rule (spec 012), kept after a simulated walk through Fumikiri (2026-11-12):
 * the answer changed 9 times without it and 5 times with it, the same as place steering's own
 * 500 ms rule.
 */
export declare const HERE_HOLD_DB = 3;
/**
 * Which soundscape the listener is in, from the shares: an enclosed one once its rooms hold
 * more than half of them; otherwise the open one whose own sounds are loudest, kept until
 * another's are `HERE_HOLD_DB` louder. Open shares are proportional to power, so their ratio
 * is the power ratio. Null before anything sounds.
 */
export declare function soundscapeHere(shares: ReadonlyMap<string, number>, enclosedIds: ReadonlySet<string>, current: string | null): string | null;
/** dB SPL to linear power, for summing what reaches the ear. */
export declare const dbToPower: (db: number) => number;
//# sourceMappingURL=SoundscapeShare.d.ts.map