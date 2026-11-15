/**
 * Colour values as the DSL and the engine share them: `#rrggbb` strings in,
 * 0-255 channel triples out. One grammar for `color`, `background` and the
 * colour tokens inside `fade`/`jump` modulation, one hex encoder for the
 * per-frame colour writes.
 */
export const NAMED_COLORS = {
    white: '#ffffff', black: '#000000', red: '#ff0000', green: '#00ff00',
    blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff',
    gray: '#808080', grey: '#808080',
};
export const DEFAULT_VOICE_COLOR = '#1a3a2a';
const HEX_LUT = new Array(256);
for (let i = 0; i < 256; i++)
    HEX_LUT[i] = i.toString(16).padStart(2, '0');
const HEX6_RX = /^#[0-9a-f]{6}$/i;
const RGB_TRIPLE_RX = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/;
const GRAY_RX = /^\d+$/;
/** Clamp and truncate to a 0-255 channel. */
export function clampChannel(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
/** 0-255 channels to `#rrggbb` (channels are clamped and truncated). */
export function rgbToHex(r, g, b) {
    return '#' + HEX_LUT[clampChannel(r)] + HEX_LUT[clampChannel(g)] + HEX_LUT[clampChannel(b)];
}
/** `#rrggbb` to 0-255 channels. Anything that is not six hex digits reads as the default voice colour. */
export function hexToRgb(hex) {
    const h = HEX6_RX.test(hex) ? hex : DEFAULT_VOICE_COLOR;
    return [parseInt(h.substring(1, 3), 16), parseInt(h.substring(3, 5), 16), parseInt(h.substring(5, 7), 16)];
}
/**
 * Parse one colour value in any DSL form (`#f54927`, `255,100,50`, `128`
 * grayscale, or a named colour) to `#rrggbb`. Null when it is not a colour.
 */
export function parseColorValue(raw) {
    const v = raw.trim();
    if (!v)
        return null;
    if (HEX6_RX.test(v))
        return v;
    const rgb = v.match(RGB_TRIPLE_RX);
    if (rgb)
        return rgbToHex(Math.round(parseFloat(rgb[1])), Math.round(parseFloat(rgb[2])), Math.round(parseFloat(rgb[3])));
    if (GRAY_RX.test(v)) {
        const c = Math.round(parseFloat(v));
        return rgbToHex(c, c, c);
    }
    return NAMED_COLORS[v.toLowerCase()] ?? null;
}
/** A single colour token (named or hex) as 0-255 channels; null when it is neither. */
export function parseColorToken(token) {
    const hex = NAMED_COLORS[token.toLowerCase()] ?? (HEX6_RX.test(token) ? token : null);
    return hex ? hexToRgb(hex) : null;
}
//# sourceMappingURL=color.js.map