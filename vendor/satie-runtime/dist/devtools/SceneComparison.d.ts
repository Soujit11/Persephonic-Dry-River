import { type RenderOptions } from '../export/OfflineRenderer.js';
import { sourceIdentities } from '../edit/SourceIdentity.js';
export interface SceneAudition {
    version: 'satie.scene-audition/v1';
    script: string;
    seed: number;
    duration: number;
    sampleRate: number;
    listenerPath: NonNullable<RenderOptions['listenerPath']>;
    actions: NonNullable<RenderOptions['actions']>;
    sceneState?: RenderOptions['sceneState'];
    worldRoom?: RenderOptions['worldRoom'];
    assets: Array<{
        clipPath: string;
        pcmHash: string;
    }>;
    sources: ReturnType<typeof sourceIdentities>;
    pcmHash: string;
}
export declare function pcmHash(buffer: AudioBuffer): Promise<string>;
export interface FrozenScene {
    manifest: SceneAudition;
    buffer: AudioBuffer;
}
/** Render sequentially: the parser's named trajectory registry is shared. Caller pins both revisions. */
export declare function freezeScene(context: BaseAudioContext, options: RenderOptions & {
    seed: number;
}): Promise<FrozenScene>;
export interface SceneJudgment {
    protocol: 'scene-ab/v1';
    origin: 'human';
    evidence: 'explicit-user-feedback';
    auditioned: true;
    completed: ['A', 'B'];
    blinded: boolean;
    winner: 'before' | 'after' | 'tie' | 'neither';
    reason: string;
    dimension: 'spatial' | 'acoustics' | 'intent' | 'balance' | 'source-fit';
    before: SceneAudition;
    after: SceneAudition;
}
export declare class SceneComparison {
    private readonly before;
    private readonly after;
    readonly blinded: boolean;
    private readonly player;
    private readonly reversed;
    constructor(context: AudioContext, before: FrozenScene, after: FrozenScene, blinded?: boolean, random?: () => number);
    play(side: 'A' | 'B'): Promise<boolean>;
    stop(): void;
    destroy(): void;
    judge(winner: 'A' | 'B' | 'tie' | 'neither', reason: string, dimension: SceneJudgment['dimension'], auditioned: boolean): SceneJudgment;
}
/** Download/restore exact rendered auditions; PCM checksums detect accidental changes. */
export declare function serializeAudition(scene: FrozenScene): Promise<string>;
export declare function restoreAudition(context: BaseAudioContext, text: string): Promise<FrozenScene>;
//# sourceMappingURL=SceneComparison.d.ts.map