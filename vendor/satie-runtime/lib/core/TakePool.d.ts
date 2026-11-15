/** Shared shuffle history for a repertoire, including all of its live actors. */
export declare class TakePool {
    private readonly pools;
    private readonly ordered;
    /** Preparation can look ahead without consuming the next audible turn. */
    inOrder(owner: object, available: readonly number[], commit?: boolean): number;
    draw(owner: object, available: number[], avoid: number, rng: () => number): number;
}
//# sourceMappingURL=TakePool.d.ts.map