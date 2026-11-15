/**
 * Modulation data for dynamic property changes.
 * Supports fade (continuous) and jump (discrete step) modulation.
 *
 * fade <values...> every <dur> [loop bounce|restart]
 * jump <values...> every <dur> [loop bounce|restart]
 */
import { RangeOrValue } from './RangeOrValue.js';
export var ModulationType;
(function (ModulationType) {
    ModulationType["Fade"] = "fade";
    ModulationType["Jump"] = "jump";
})(ModulationType || (ModulationType = {}));
export var LoopMode;
(function (LoopMode) {
    LoopMode["None"] = "none";
    LoopMode["Bounce"] = "bounce";
    LoopMode["Restart"] = "restart";
})(LoopMode || (LoopMode = {}));
export class InterpolationData {
    values;
    every;
    loopMode;
    modulationType;
    constructor(values, every, type = ModulationType.Fade, loop = LoopMode.None) {
        this.values = values;
        this.every = every;
        this.modulationType = type;
        this.loopMode = loop;
    }
    /** First value — used for initial track state. */
    get minValue() { return this.values[0] ?? 0; }
    /** Last value — convenience getter. */
    get maxValue() { return this.values[this.values.length - 1] ?? 0; }
    /** Alias for engine caching compatibility. */
    get durationRange() { return this.every; }
    /**
     * Parse modulation strings:
     *   fade 0 1 every 2
     *   fade 0.1 0.5 1 2 every 2
     *   fade 0 1 every 1 loop bounce
     *   jump 0.1 0.5 1 2 every 2
     *   jump 2 3 every 5to14 loop restart
     */
    static parse(str) {
        if (!str || !str.trim())
            return null;
        str = str.trim();
        // fade <values...> every <dur> [loop bounce|restart]
        const fadeMatch = str.match(/^fade\s+(.+?)\s+every\s+(\S+)(?:\s+loop\s+(bounce|restart))?$/i);
        if (fadeMatch) {
            const values = parseNumericValues(fadeMatch[1]);
            if (values.length < 2)
                return null;
            const every = RangeOrValue.parse(fadeMatch[2]);
            if (every.isNull)
                return null;
            const loop = fadeMatch[3] ? fadeMatch[3].toLowerCase() : LoopMode.None;
            return new InterpolationData(values, every, ModulationType.Fade, loop);
        }
        // jump <values...> every <dur> [loop bounce|restart]
        const jumpMatch = str.match(/^jump\s+(.+?)\s+every\s+(\S+)(?:\s+loop\s+(bounce|restart))?$/i);
        if (jumpMatch) {
            const values = parseNumericValues(jumpMatch[1]);
            if (values.length < 2)
                return null;
            const every = RangeOrValue.parse(jumpMatch[2]);
            if (every.isNull)
                return null;
            const loop = jumpMatch[3] ? jumpMatch[3].toLowerCase() : LoopMode.None;
            return new InterpolationData(values, every, ModulationType.Jump, loop);
        }
        return null;
    }
}
/** Parse a space-separated list of numbers. Filters out NaN. */
function parseNumericValues(str) {
    return str.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
}
//# sourceMappingURL=InterpolationData.js.map