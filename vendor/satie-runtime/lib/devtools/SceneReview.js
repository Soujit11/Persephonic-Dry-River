import { identifySources } from '../edit/SourceIdentity.js';
import { freezeScene, SceneComparison } from './SceneComparison.js';
/** Framework-free pilot for the in-project overlay. No inferred vote or upload. */
export function createSceneReview(options) {
    const root = document.createElement('div');
    root.className = 'satie-dt-scene-review';
    root.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:10px';
    let before = null, after = null;
    let comparison = null, busy = false, disposed = false;
    const instructions = document.createElement('p');
    instructions.textContent = 'Pin Before, edit, then pin After. Auditions use five seconds of the script from a fixed listener at (0, 1.6, 0). Runtime mixer overrides and external host motion are excluded.';
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    const reason = document.createElement('textarea');
    reason.placeholder = 'Why is this better for the place?';
    reason.setAttribute('aria-label', 'Scene correction reason');
    const listened = document.createElement('input');
    listened.type = 'checkbox';
    const label = document.createElement('label');
    label.append(listened, ' I listened to both scenes');
    const dimension = document.createElement('select');
    dimension.setAttribute('aria-label', 'Scene correction dimension');
    for (const value of ['spatial', 'acoustics', 'intent', 'balance', 'source-fit']) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = value;
        dimension.append(o);
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const button = (text, action) => {
        const b = document.createElement('button');
        b.className = 'pill';
        b.textContent = text;
        b.addEventListener('click', async () => {
            if (busy || disposed)
                return;
            busy = true;
            message.textContent = 'Working…';
            try {
                await action();
            }
            catch (error) {
                message.textContent = String(error);
            }
            finally {
                busy = false;
            }
        });
        row.append(b);
        return b;
    };
    async function pin(side) {
        if (options.engine.scriptStatements.some(s => s.hostRef))
            throw new Error('Hosted scenes require an explicit replay through the comparison API.');
        const script = identifySources(options.script());
        if (script !== options.script())
            options.apply(script);
        const frozen = await freezeScene(options.engine.audioContext, { script, seed: 20260909, duration: 5, sampleRate: 48000,
            mode: 'binaural', sampleBuffers: new Map(), decodedAudioBuffers: options.engine.getAudioBuffers(),
            listenerPath: [{ t: 0, x: 0, y: 1.6, z: 0, yaw: 0 }], worldRoom: options.engine.getWorldRoom(), sceneState: { name: options.engine.sceneState } });
        if (disposed)
            return;
        comparison?.destroy();
        comparison = null;
        listened.checked = false;
        if (side === 'before') {
            before = frozen;
            after = null;
            message.textContent = 'Before pinned. Make your edit, then pin After.';
        }
        else {
            if (!before)
                throw new Error('Pin Before first.');
            after = frozen;
            comparison = new SceneComparison(options.engine.audioContext, before, after);
            message.textContent = 'Both revisions pinned. Listen before judging.';
        }
    }
    button('Pin Before', () => pin('before'));
    button('Pin After', () => pin('after'));
    for (const side of ['A', 'B'])
        button(side === 'A' ? 'Play Before' : 'Play After', async () => {
            if (!comparison)
                throw new Error('Pin both revisions first.');
            options.engine.stop();
            const complete = await comparison.play(side);
            message.textContent = complete ? `${side === 'A' ? 'Before' : 'After'} finished playing.` : 'Playback stopped early.';
        });
    for (const [vote, title] of [['B', 'Keep change'], ['A', 'Revert'], ['tie', 'Equal'], ['neither', 'Neither']])
        button(title, () => {
            if (!comparison || !before || !after)
                throw new Error('Pin both revisions first.');
            if (options.script() !== after.manifest.script)
                throw new Error('The scene changed; pin After again.');
            const judgment = comparison.judge(vote, reason.value, dimension.value, listened.checked);
            if (vote === 'A')
                options.apply(before.manifest.script);
            options.judgment?.(judgment);
            message.textContent = 'Explicit scene judgment recorded locally.';
        });
    root.append(instructions, row, dimension, reason, label, message);
    return { element: root, stop: () => comparison?.stop(), destroy: () => { disposed = true; comparison?.destroy(); root.remove(); } };
}
//# sourceMappingURL=SceneReview.js.map