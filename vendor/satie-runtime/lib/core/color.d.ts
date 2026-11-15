/**
 * Colour values as the DSL and the engine share them: `#rrggbb` strings in,
 * 0-255 channel triples out. One grammar for `color`, `background` and the
 * colour tokens inside `fade`/`jump` modulation, one hex encoder for the
 * per-frame colour writes.
 */
export type Rgb255 = [number, number, number];
export declare const NAMED_COLORS: Readonly<Record<string, string>>;
export declare const DEFAULT_VOICE_COLOR = "#1a3a2a";
/** Clamp and truncate to a 0-255 channel. */
export declare function clampChannel(v: number): number;
/** 0-255 channels to `#rrggbb` (channels are clamped and truncated). */
export declare function rgbToHex(r: number, g: number, b: number): string;
/** `#rrggbb` to 0-255 channels. Anything that is not six hex digits reads as the default voice colour. */
export declare function hexToRgb(hex: string): Rgb255;
/**
 * Parse one colour value in any DSL form (`#f54927`, `255,100,50`, `128`
 * grayscale, or a named colour) to `#rrggbb`. Null when it is not a colour.
 */
export declare function parseColorValue(raw: string): string | null;
/** A single colour token (named or hex) as 0-255 channels; null when it is neither. */
export declare function parseColorToken(token: string): Rgb255 | null;
//# sourceMappingURL=color.d.ts.map