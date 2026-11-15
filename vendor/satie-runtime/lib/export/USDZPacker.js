/**
 * USDZ package writer — a zero-dependency, spec-conformant zip builder.
 *
 * USDZ rules (openusd.org/release/spec_usdz.html):
 * - Uncompressed (method 0), unencrypted zip; the first file must be a native
 *   USD layer (usda is legal) for the package to be readable as-is.
 * - Each file's DATA must start at a multiple of 64 bytes from package start.
 *   Off-the-shelf zip tools can't do that; the trick (shared with three.js's
 *   USDZExporter and Pixar's usdzip) is a local-header "extra field" with ID
 *   0x1986 sized so the payload lands on the boundary.
 *
 * Fixed DOS timestamps (1980-01-01) keep output byte-deterministic, which the
 * golden tests rely on.
 */
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const VERSION = 20; // 2.0 — stored entries
const ALIGN = 64;
const PAD_EXTRA_ID = 0x1986; // the usdz alignment convention
// CRC-32 (IEEE 802.3), standard 256-entry table.
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();
export function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function encodeName(name) {
    return new TextEncoder().encode(name);
}
/**
 * Pack entries into a USDZ-conformant zip Blob. `entries[0]` must be the
 * default `.usda` layer.
 */
export function packUSDZ(entries) {
    if (entries.length === 0)
        throw new Error('packUSDZ: no entries');
    if (!entries[0].name.endsWith('.usda') && !entries[0].name.endsWith('.usdc') && !entries[0].name.endsWith('.usd')) {
        throw new Error(`packUSDZ: first entry must be a USD layer, got "${entries[0].name}"`);
    }
    return packZip(entries);
}
/**
 * Plain stored-entry zip of the same shape, without the USD-layer contract —
 * the dataset harness packs script + WAVs + annotation JSON through this.
 * (The 64-byte alignment padding is harmless in an ordinary zip.)
 */
export function packZip(entries) {
    if (entries.length === 0)
        throw new Error('packZip: no entries');
    const parts = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
        const name = encodeName(entry.name);
        const crc = crc32(entry.data);
        const size = entry.data.byteLength;
        // Extra field sized so the data starts on a 64-byte boundary. The extra
        // field itself has a 4-byte header, so the minimum footprint is 4 bytes.
        const dataStartWithoutPad = offset + 30 + name.byteLength + 4;
        const padSize = (ALIGN - (dataStartWithoutPad % ALIGN)) % ALIGN;
        const extraLen = 4 + padSize;
        const header = new Uint8Array(30 + name.byteLength + extraLen);
        const v = new DataView(header.buffer);
        v.setUint32(0, SIG_LOCAL, true);
        v.setUint16(4, VERSION, true);
        v.setUint16(6, 0, true); // flags
        v.setUint16(8, 0, true); // method: stored
        v.setUint16(10, 0, true); // mod time 00:00:00
        v.setUint16(12, 0x21, true); // mod date 1980-01-01
        v.setUint32(14, crc, true);
        v.setUint32(18, size, true); // compressed size (= uncompressed, stored)
        v.setUint32(22, size, true); // uncompressed size
        v.setUint16(26, name.byteLength, true);
        v.setUint16(28, extraLen, true);
        header.set(name, 30);
        // Extra field: ID + payload size + zero padding
        v.setUint16(30 + name.byteLength, PAD_EXTRA_ID, true);
        v.setUint16(30 + name.byteLength + 2, padSize, true);
        central.push({ name, crc, size, headerOffset: offset });
        parts.push(header, entry.data);
        offset += header.byteLength + size;
    }
    const cdOffset = offset;
    for (const c of central) {
        const rec = new Uint8Array(46 + c.name.byteLength);
        const v = new DataView(rec.buffer);
        v.setUint32(0, SIG_CENTRAL, true);
        v.setUint16(4, VERSION, true); // version made by
        v.setUint16(6, VERSION, true); // version needed
        v.setUint16(8, 0, true); // flags
        v.setUint16(10, 0, true); // method: stored
        v.setUint16(12, 0, true); // mod time
        v.setUint16(14, 0x21, true); // mod date
        v.setUint32(16, c.crc, true);
        v.setUint32(20, c.size, true);
        v.setUint32(24, c.size, true);
        v.setUint16(28, c.name.byteLength, true);
        // extra len, comment len, disk start, internal attrs all 0
        v.setUint32(38, 0, true); // external attrs
        v.setUint32(42, c.headerOffset, true);
        rec.set(c.name, 46);
        parts.push(rec);
        offset += rec.byteLength;
    }
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, SIG_EOCD, true);
    ev.setUint16(8, central.length, true); // entries on disk
    ev.setUint16(10, central.length, true); // entries total
    ev.setUint32(12, offset - cdOffset, true); // central directory size
    ev.setUint32(16, cdOffset, true);
    parts.push(eocd);
    return new Blob(parts, { type: 'model/vnd.usdz+zip' });
}
//# sourceMappingURL=USDZPacker.js.map