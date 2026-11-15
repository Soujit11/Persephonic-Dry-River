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
import type { ByteArray } from './RiffWriter';
export interface USDZEntry {
    /** Path inside the package, e.g. "scene.usda" or "audio/voice_00.wav". */
    name: string;
    data: ByteArray;
}
export declare function crc32(data: Uint8Array): number;
/**
 * Pack entries into a USDZ-conformant zip Blob. `entries[0]` must be the
 * default `.usda` layer.
 */
export declare function packUSDZ(entries: USDZEntry[]): Blob;
/**
 * Plain stored-entry zip of the same shape, without the USD-layer contract —
 * the dataset harness packs script + WAVs + annotation JSON through this.
 * (The 64-byte alignment padding is harmless in an ordinary zip.)
 */
export declare function packZip(entries: USDZEntry[]): Blob;
//# sourceMappingURL=USDZPacker.d.ts.map