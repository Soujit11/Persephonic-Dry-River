import type { RenderManifest } from './RenderManifest.js';
export interface ReferenceAsset {
    path: string;
    sha256: string;
}
export interface ReferenceSetup {
    seed: number;
    sampleRate: 24000 | 48000;
    mesh: ReferenceAsset;
    meshFromScene: [[number, number, number], [number, number, number], [number, number, number]];
    listener: [number, number, number];
    referenceDb: number;
    assets: ReadonlyMap<string, ReferenceAsset>;
    /** Calibrated reference-renderer levels. Satie SPL is not silently converted into simulator SNR. */
    snrDb: ReadonlyMap<string, number>;
}
/** Lossy features are enumerated; the Python adapter refuses them before generating audio. */
export declare function referenceScene(manifest: RenderManifest, setup: ReferenceSetup): {
    version: "satie.reference-scene/v1";
    units: string;
    duration: number;
    seed: number;
    sampleRate: 48000 | 24000;
    mesh: ReferenceAsset;
    meshFromScene: [[number, number, number], [number, number, number], [number, number, number]];
    listener: [number, number, number];
    referenceDb: number;
    sources: {
        id: string;
        sourceId: string | null;
        kind: "static";
        position: number[];
        asset: ReferenceAsset;
        sceneStart: number;
        audioOffset: number;
        duration: number;
        snrDb: number | undefined;
    }[];
    unsupported: string[];
};
//# sourceMappingURL=ReferenceScene.d.ts.map