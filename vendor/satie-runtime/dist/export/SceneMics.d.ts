/**
 * Declared microphones → renders.
 *
 * The scene used to not know it was being listened to: the format was a
 * dropdown in the export panel and a `micArray` field on a batch job, and the
 * listener was a `ListenerKeyframe[]` hand-built by whoever called the
 * renderer. Sound Particles' best idea is the inversion — a scene CONTAINS
 * microphones and rendering is capture — and it is worth more here than there,
 * because the whole machine-listening case is that one authored scene should
 * yield many listening views whose labels cannot disagree with the audio.
 *
 * This module is the bridge: `mic` blocks (`core/Scene`) → the render each one
 * asks for. Two things fall out that were previously separate tools:
 *
 *   - `ListenerPath` stops being a hand-built API. A mic with `move` lines IS
 *     a listener path; `micListenerPath` is the whole conversion.
 *   - Capsule arrays and speaker/ambisonic modes share one vocabulary, so
 *     "render this scene as binaural AND as a 4-channel array" is two lines of
 *     script rather than two different entry points.
 *
 * Each mic renders SEPARATELY and must: a different listener path is a
 * different scene simulation (the engine's listener moved differently), and
 * channel counts differ, so one OfflineAudioContext could not hold them.
 */
import { type SceneMic } from '../core/Scene.js';
import { type MicArrayGeometry } from './MicArray.js';
import type { ListenerKeyframe } from './ListenerPath';
import type { RenderMode } from './OfflineRenderer.js';
import type { RenderManifest } from './RenderManifest';
import type { WorldRoom, SceneStateOptions } from './SceneSimulation';
/** How one declared mic renders. */
export interface MicRenderPlan {
    mic: SceneMic;
    /** `mode` goes through `renderOffline`; `array` through `renderMicArray`. */
    kind: 'mode' | 'array';
    /** Set when kind is 'mode'. */
    mode?: RenderMode;
    /** Set when kind is 'array'. */
    geometry?: MicArrayGeometry;
    /** Channels the resulting buffer will carry. */
    channels: number;
    /** The listener path this mic captures along. */
    listenerPath: ListenerKeyframe[];
}
/**
 * A mic's path as a listener path. `SceneMicKeyframe` and `ListenerKeyframe`
 * share the heading convention (radians, 0 = +Z, increasing toward +X) but
 * NOT the field name: the mic says `heading`, the listener pose says `yaw`.
 * This is the one place the rename happens. It used to copy `heading`
 * through, which `listenerPoseAt` never reads — so every declared mic
 * rendered facing +Z whatever its `aim` said, and the labels agreed with the
 * wrongly-aimed audio. The literal below is contextually typed as a
 * `ListenerKeyframe`, so an unknown key is a compile error now, not a silent
 * drop.
 *
 * A mic with no `place`, no `aim` and no `move` (the parser seeds its path at
 * the scene origin facing ahead) is returned as EMPTY, because that is what
 * the renderer does with no path at all — the listener stands at
 * `DEFAULT_LISTENER_POSE`, ear height at the origin. Passing a single-frame
 * path instead would put every static voice on the moving-listener automation
 * branch for no gain. Note the parser cannot tell an explicit `place 0 0 0`
 * from no `place`, so a mic that asks for the floor at the origin stands at
 * ear height too; `place 0 0.01 0` pins it.
 */
export declare function micListenerPath(mic: SceneMic): ListenerKeyframe[];
/**
 * The array geometry a mic asks for. `eigenmike` is the tetrahedron already
 * mounted on a rigid sphere, so it carries a baffle whether or not the block
 * said `sphere`; `tetrahedral`/`circular` gain one only when it did.
 */
export declare function micArrayGeometry(mic: SceneMic): MicArrayGeometry;
/** What one declared mic renders as. */
export declare function planMicRender(mic: SceneMic): MicRenderPlan;
export interface ScriptMicRenderOptions {
    script: string;
    sampleBuffers: Map<string, ArrayBuffer>;
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    sampleRate?: number;
    seed?: number;
    simulate?: boolean | 'auto';
    worldRoom?: WorldRoom | null;
    /** The listener's scene state for `zone` voices — see RenderOptions.sceneState. */
    sceneState?: SceneStateOptions;
    /** Render only these mic names (lowercased); omitted renders every declared mic. */
    only?: string[];
    /** Receives each mic's manifest before its audio is scheduled — annotations hang off this. */
    onManifest?: (micName: string, manifest: RenderManifest) => void;
    onProgress?: (micName: string, index: number, total: number, fraction: number) => void;
}
/** One rendered capture. */
export interface MicRenderResult {
    name: string;
    plan: MicRenderPlan;
    buffer: AudioBuffer;
}
/**
 * Render every mic the script declares, in declaration order.
 *
 * Throws when the script declares none — the caller should fall back to its
 * own format choice rather than have this invent one, because "the script
 * says nothing about capture" and "the script asked for stereo" are different
 * facts and only the caller knows which default belongs to it.
 */
export declare function renderScriptMics(options: ScriptMicRenderOptions): Promise<MicRenderResult[]>;
//# sourceMappingURL=SceneMics.d.ts.map