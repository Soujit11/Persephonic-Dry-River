/**
 * A value that can be either a single float or a range (min..max).
 * When sampled, ranges return a random value within the range.
 * Ported from Satie Unity: RangeOrValue struct.
 */
export declare class RangeOrValue {
    readonly min: number;
    readonly max: number;
    readonly isRange: boolean;
    readonly isNull: boolean;
    private constructor();
    static readonly Null: RangeOrValue;
    static readonly Zero: RangeOrValue;
    static readonly One: RangeOrValue;
    static single(value: number): RangeOrValue;
    static range(min: number, max: number): RangeOrValue;
    /**
     * Parse a string like "0.5" or "0.2to0.8" into a RangeOrValue.
     */
    static parse(str: string): RangeOrValue;
    /**
     * Sample the value. If it's a range, returns a random value between min and max.
     * If it's a single value, returns that value.
     */
    sample(rng?: () => number): number;
    /** Multiply range by a scalar, preserving range-ness. */
    mul(k: number): RangeOrValue;
    toString(): string;
}
//# sourceMappingURL=RangeOrValue.d.ts.map