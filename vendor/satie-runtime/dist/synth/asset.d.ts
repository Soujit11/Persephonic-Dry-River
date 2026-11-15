/** A portable instrument carried with its baked audio. Ordinary players ignore the metadata. */
import { type SynthPatch } from './patch.js';
export interface SynthAsset {
    version: 1;
    engine: 'csound';
    patch: SynthPatch;
    seed: number;
    /** Length of one progression cycle, and of the compatible baked take. */
    seconds: number;
    loop: boolean;
    /** Exact renderer build and SHA-256 of the validated instrument/performance data. Legacy assets omit these. */
    renderer?: string;
    id?: string;
}
export declare const synthAssetFor: (buffer: AudioBuffer) => SynthAsset | undefined;
export declare function attachSynthAsset(buffer: AudioBuffer, asset: SynthAsset): void;
export declare function copySynthAsset(from: AudioBuffer, to: AudioBuffer): void;
export declare function readSynthAsset(raw: unknown): SynthAsset | null;
export declare function createSynthAsset(patch: SynthPatch, seconds: number, loop: boolean, seed: number): Promise<SynthAsset>;
export declare function synthAssetBytes(asset: SynthAsset): Uint8Array<ArrayBuffer>;
/** Read bounded ID3 PRIV or RIFF stSy data before handing the bytes to the audio decoder. */
export declare function synthAssetFromAudio(data: ArrayBuffer): SynthAsset | null;
/** Insert one ID3v2.3 private frame; replace ffmpeg's old tag, retaining the MP3 frames. */
export declare function withSynthAsset(mp3: ArrayBuffer, asset: SynthAsset): ArrayBuffer;
export declare function decodeSynthAudio(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer>;
//# sourceMappingURL=asset.d.ts.map