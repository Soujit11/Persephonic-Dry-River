/**
 * The value models behind the mixer's generated property widgets — every
 * parse and format the controls need, with no DOM in sight, so the logic
 * that decides "is this raw script text something a slider can hold?" is
 * testable as plain functions.
 *
 * The contract with the editor: a widget renders ONLY when the raw value
 * parses into its model (`0.4`, `0.2to0.8`, `wet 0.4 size 0.7`, `#7a5c3a`,
 * three numbers). A `follow` binding, a `fade` interpolation, a named color,
 * a semantic `place ahead far low` all return null here, and the row falls
 * back to raw text — the widget never rewrites what it cannot represent.
 */
import type { CompoundPart, ControlSpec } from '../core/Properties';
/** A plain number, or null — never NaN. */
export declare function parseNumber(raw: string): number | null;
export interface RangeValue {
    min: number;
    max: number;
}
/** `0.5` → {0.5, 0.5}; `0.2to0.8` → {0.2, 0.8}; anything else → null. */
export declare function parseRangeText(raw: string): RangeValue | null;
/** Collapsed when the handles meet; `to` otherwise. Trailing zeros dropped. */
export declare function formatRangeText(v: RangeValue): string;
/** Snap into a control's grid and clamp to its track. */
export declare function snap(value: number, spec: {
    min?: number;
    max?: number;
    step?: number;
}): number;
/**
 * A value's position along its control's track, 0..1 — the one formula every
 * track visual shares, so a signed range (`rotate` −360..360) puts 0 at the
 * centre, not at the left edge.
 */
export declare function sliderFraction(value: number, spec: {
    min?: number;
    max?: number;
}): number;
/** `1.5 0.25 -3` (exactly three plain numbers) → [x, y, z]; semantic/ranged forms → null. */
export declare function parseVec3(raw: string): [number, number, number] | null;
export declare function formatVec3(v: [number, number, number]): string;
export interface CompoundValue {
    /** The leading enum token, when the grammar has one (`filter lowpass …`). */
    head?: string;
    /** Named numeric parts actually present in the raw text, in spec order. */
    values: Record<string, number>;
}
/**
 * Parse a keyworded compound value against its spec: an optional leading
 * head token from `spec.head`, then `key <number>` pairs drawn from
 * `spec.parts`. Any stray token — an unknown key, a non-numeric value, an
 * interpolation — fails the whole parse, and the row stays raw text.
 */
export declare function parseCompound(raw: string, spec: ControlSpec): CompoundValue | null;
/** Canonical order from the spec; only parts the value carries are written. */
export declare function formatCompound(value: CompoundValue, spec: ControlSpec): string;
/** A part's slider position 0..1 → value, respecting `log` (Hz cutoffs). */
export declare function partFromPosition(pos: number, part: CompoundPart): number;
/** A part value → slider position 0..1, respecting `log`. */
export declare function partToPosition(value: number, part: CompoundPart): number;
/** `#rgb` / `#rrggbb`, the one color spelling a picker can hold. */
export declare function parseHexColor(raw: string): string | null;
/**
 * Which widget this RAW value can actually live in. The registry names the
 * ideal control; the script decides whether today's value fits it. `'text'`
 * from here means "show the raw input for now", not "the property is text".
 */
export declare function representable(raw: string, spec: ControlSpec): boolean;
//# sourceMappingURL=propertyControls.d.ts.map