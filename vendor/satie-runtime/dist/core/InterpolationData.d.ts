/**
 * Modulation data for dynamic property changes.
 * Supports fade (continuous) and jump (discrete step) modulation.
 *
 * fade <values...> every <dur> [loop bounce|restart]
 * jump <values...> every <dur> [loop bounce|restart]
 */
import { RangeOrValue } from './RangeOrValue.js';
export declare enum ModulationType {
    Fade = "fade",
    Jump = "jump"
}
export declare enum LoopMode {
    None = "none",
    Bounce = "bounce",
    Restart = "restart"
}
export declare class InterpolationData {
    values: number[];
    every: RangeOrValue;
    loopMode: LoopMode;
    modulationType: ModulationType;
    constructor(values: number[], every: RangeOrValue, type?: ModulationType, loop?: LoopMode);
    /** First value — used for initial track state. */
    get minValue(): number;
    /** Last value — convenience getter. */
    get maxValue(): number;
    /** Alias for engine caching compatibility. */
    get durationRange(): RangeOrValue;
    /**
     * Parse modulation strings:
     *   fade 0 1 every 2
     *   fade 0.1 0.5 1 2 every 2
     *   fade 0 1 every 1 loop bounce
     *   jump 0.1 0.5 1 2 every 2
     *   jump 2 3 every 5to14 loop restart
     */
    static parse(str: string): InterpolationData | null;
}
//# sourceMappingURL=InterpolationData.d.ts.map