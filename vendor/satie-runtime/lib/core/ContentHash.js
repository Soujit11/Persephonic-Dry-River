/** FNV-1a 64-bit, as 16 lowercase hex chars. */
export function fnv1a64(text) {
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < text.length; i++) {
        h ^= BigInt(text.charCodeAt(i));
        h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, '0');
}
//# sourceMappingURL=ContentHash.js.map