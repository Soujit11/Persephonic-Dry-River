const NUM = /^-?\d+(?:\.\d+)?$/;
/** A plain number, or null — never NaN. */
export function parseNumber(raw) {
    const t = raw.trim();
    return NUM.test(t) ? parseFloat(t) : null;
}
/** `0.5` → {0.5, 0.5}; `0.2to0.8` → {0.2, 0.8}; anything else → null. */
export function parseRangeText(raw) {
    const t = raw.trim();
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s*to\s*(-?\d+(?:\.\d+)?)$/i);
    if (m) {
        const a = parseFloat(m[1]), b = parseFloat(m[2]);
        return { min: Math.min(a, b), max: Math.max(a, b) };
    }
    const n = parseNumber(t);
    return n === null ? null : { min: n, max: n };
}
/** Collapsed when the handles meet; `to` otherwise. Trailing zeros dropped. */
export function formatRangeText(v) {
    const f = (n) => String(Math.round(n * 1000) / 1000);
    return v.min === v.max ? f(v.min) : `${f(v.min)}to${f(v.max)}`;
}
/** Snap into a control's grid and clamp to its track. */
export function snap(value, spec) {
    const min = spec.min ?? -Infinity;
    const max = spec.max ?? Infinity;
    const step = spec.step ?? 0;
    let v = Math.min(max, Math.max(min, value));
    if (step > 0) {
        const base = Number.isFinite(min) ? min : 0;
        v = base + Math.round((v - base) / step) * step;
        v = Math.min(max, Math.max(min, v));
    }
    return Math.round(v * 10000) / 10000;
}
/**
 * A value's position along its control's track, 0..1 — the one formula every
 * track visual shares, so a signed range (`rotate` −360..360) puts 0 at the
 * centre, not at the left edge.
 */
export function sliderFraction(value, spec) {
    const min = spec.min ?? 0;
    const max = spec.max ?? 1;
    if (max <= min)
        return 0;
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
/** `1.5 0.25 -3` (exactly three plain numbers) → [x, y, z]; semantic/ranged forms → null. */
export function parseVec3(raw) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length !== 3)
        return null;
    const nums = parts.map(parseNumber);
    return nums.every(n => n !== null) ? nums : null;
}
export function formatVec3(v) {
    const f = (n) => String(Math.round(n * 100) / 100);
    return `${f(v[0])} ${f(v[1])} ${f(v[2])}`;
}
/**
 * Parse a keyworded compound value against its spec: an optional leading
 * head token from `spec.head`, then `key <number>` pairs drawn from
 * `spec.parts`. Any stray token — an unknown key, a non-numeric value, an
 * interpolation — fails the whole parse, and the row stays raw text.
 */
export function parseCompound(raw, spec) {
    if (spec.kind !== 'compound' || !spec.parts)
        return null;
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return null;
    const legal = new Map(spec.parts.map(p => [p.key, p]));
    let i = 0;
    let head;
    if (spec.head) {
        if (!spec.head.includes(tokens[0]))
            return null;
        head = tokens[0];
        i = 1;
    }
    const values = {};
    while (i < tokens.length) {
        const key = tokens[i];
        const part = legal.get(key);
        if (!part)
            return null;
        const n = parseNumber(tokens[i + 1] ?? '');
        if (n === null)
            return null;
        values[key] = n;
        i += 2;
    }
    return { head, values };
}
/** Canonical order from the spec; only parts the value carries are written. */
export function formatCompound(value, spec) {
    const f = (n) => String(Math.round(n * 1000) / 1000);
    const pieces = [];
    if (value.head)
        pieces.push(value.head);
    for (const part of spec.parts ?? []) {
        const v = value.values[part.key];
        if (v !== undefined)
            pieces.push(`${part.key} ${f(v)}`);
    }
    return pieces.join(' ');
}
/** A part's slider position 0..1 → value, respecting `log` (Hz cutoffs). */
export function partFromPosition(pos, part) {
    const t = Math.min(1, Math.max(0, pos));
    if (part.log) {
        const lo = Math.log(Math.max(part.min, 1e-6)), hi = Math.log(part.max);
        return snap(Math.exp(lo + t * (hi - lo)), part);
    }
    return snap(part.min + t * (part.max - part.min), part);
}
/** A part value → slider position 0..1, respecting `log`. */
export function partToPosition(value, part) {
    if (part.log) {
        const lo = Math.log(Math.max(part.min, 1e-6)), hi = Math.log(part.max);
        return Math.min(1, Math.max(0, (Math.log(Math.max(value, 1e-6)) - lo) / (hi - lo)));
    }
    return Math.min(1, Math.max(0, (value - part.min) / (part.max - part.min)));
}
/** `#rgb` / `#rrggbb`, the one color spelling a picker can hold. */
export function parseHexColor(raw) {
    const t = raw.trim();
    if (/^#[0-9a-f]{6}$/i.test(t))
        return t.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(t)) {
        return '#' + t.slice(1).split('').map(c => c + c).join('').toLowerCase();
    }
    return null;
}
/**
 * Which widget this RAW value can actually live in. The registry names the
 * ideal control; the script decides whether today's value fits it. `'text'`
 * from here means "show the raw input for now", not "the property is text".
 */
export function representable(raw, spec) {
    switch (spec.kind) {
        case 'slider': return parseNumber(raw) !== null;
        case 'stepper': return parseNumber(raw) !== null;
        case 'range': return parseRangeText(raw) !== null;
        case 'vec3': return parseVec3(raw) !== null;
        case 'compound': return parseCompound(raw, spec) !== null;
        case 'color': return parseHexColor(raw) !== null;
        case 'select': return true; // the editor checks membership itself
        case 'toggle': return true;
        case 'text': return true;
    }
}
//# sourceMappingURL=propertyControls.js.map