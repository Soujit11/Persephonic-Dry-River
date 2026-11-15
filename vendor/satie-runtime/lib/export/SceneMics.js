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
import { MIC_ARRAY_FORMATS, MIC_DEFAULT_RADIUS_M, } from '../core/Scene.js';
import { tetrahedralArray, eigenmikeSubsetArray, circularArray, } from './MicArray.js';
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
export function micListenerPath(mic) {
    const p = mic.path;
    if (p.length === 1) {
        const k = p[0];
        if (k.x === 0 && k.y === 0 && k.z === 0 && !k.heading)
            return [];
    }
    return p.map((k) => ({ t: k.t, x: k.x, y: k.y, z: k.z, yaw: k.heading ?? 0 }));
}
/** Render modes, by the format name the DSL uses. */
const MODE_BY_FORMAT = {
    stereo: 'stereo', binaural: 'binaural',
    foa: 'ambisonic-foa', soa: 'ambisonic-soa',
    quad: 'quad', '7.1.2': '7.1.2', '7.1.4': '7.1.4',
};
/**
 * The array geometry a mic asks for. `eigenmike` is the tetrahedron already
 * mounted on a rigid sphere, so it carries a baffle whether or not the block
 * said `sphere`; `tetrahedral`/`circular` gain one only when it did.
 */
export function micArrayGeometry(mic) {
    const r = mic.radiusM ?? MIC_DEFAULT_RADIUS_M;
    if (mic.format === 'eigenmike')
        return eigenmikeSubsetArray(r);
    const base = mic.format === 'circular'
        ? circularArray(mic.capsules ?? 6, r)
        : tetrahedralArray(r);
    return mic.rigidSphere
        ? { ...base, baffle: { kind: 'rigid-sphere', radiusM: r } }
        : base;
}
/** What one declared mic renders as. */
export function planMicRender(mic) {
    const listenerPath = micListenerPath(mic);
    if (MIC_ARRAY_FORMATS.has(mic.format)) {
        const geometry = micArrayGeometry(mic);
        return { mic, kind: 'array', geometry, channels: geometry.capsules.length, listenerPath };
    }
    const mode = MODE_BY_FORMAT[mic.format];
    return { mic, kind: 'mode', mode, channels: channelsForMode(mode), listenerPath };
}
/** Channel count without importing the renderer's own function at module load. */
function channelsForMode(mode) {
    switch (mode) {
        case 'ambisonic-foa': return 4;
        case 'ambisonic-soa': return 9;
        case 'quad': return 4;
        case '7.1.2': return 10;
        case '7.1.4': return 12;
        default: return 2;
    }
}
/**
 * Render every mic the script declares, in declaration order.
 *
 * Throws when the script declares none — the caller should fall back to its
 * own format choice rather than have this invent one, because "the script
 * says nothing about capture" and "the script asked for stereo" are different
 * facts and only the caller knows which default belongs to it.
 */
export async function renderScriptMics(options) {
    const { parseScene } = await import('../core/SatieParser.js');
    const scene = parseScene(options.script);
    const wanted = options.only?.map(n => n.toLowerCase());
    const mics = wanted
        ? scene.mics.filter(m => wanted.includes(m.name))
        : scene.mics;
    if (!mics.length) {
        throw new Error(wanted
            ? `No declared mic matches ${JSON.stringify(options.only)} (script declares: ${scene.mics.map(m => m.name).join(', ') || 'none'})`
            : 'Script declares no `mic` blocks');
    }
    const { renderOffline } = await import('./OfflineRenderer.js');
    const { renderMicArray } = await import('./MicArrayRender.js');
    const sampleRate = options.sampleRate ?? 48000;
    const out = [];
    for (let i = 0; i < mics.length; i++) {
        const mic = mics[i];
        const plan = planMicRender(mic);
        const report = (f) => options.onProgress?.(mic.name, i, mics.length, f);
        const shared = {
            script: options.script,
            sampleBuffers: options.sampleBuffers,
            decodedAudioBuffers: options.decodedAudioBuffers,
            duration: options.duration,
            sampleRate,
            seed: options.seed,
            simulate: options.simulate,
            worldRoom: options.worldRoom,
            sceneState: options.sceneState,
            listenerPath: plan.listenerPath,
            onManifest: (m) => options.onManifest?.(mic.name, m),
        };
        const buffer = plan.kind === 'array'
            ? await renderMicArray({ ...shared, geometry: plan.geometry, onProgress: (p) => report(p.progress) })
            : await renderOffline({ ...shared, mode: plan.mode }, (p) => report(p.progress));
        out.push({ name: mic.name, plan, buffer });
    }
    return out;
}
//# sourceMappingURL=SceneMics.js.map