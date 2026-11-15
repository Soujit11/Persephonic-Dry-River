import { renderOffline } from '../export/OfflineRenderer.js';
import { pathFor } from '../core/SatieParser.js';
import { sourceIdentities } from '../edit/SourceIdentity.js';
import { TakeComparison } from './TakeComparison.js';
async function digest(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}
export async function pcmHash(buffer) {
    const bytes = new Uint8Array(12 + buffer.length * buffer.numberOfChannels * 4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, buffer.sampleRate, true);
    view.setUint32(4, buffer.length, true);
    view.setUint32(8, buffer.numberOfChannels, true);
    let offset = 12;
    for (let c = 0; c < buffer.numberOfChannels; c++)
        for (const sample of buffer.getChannelData(c)) {
            if (!Number.isFinite(sample))
                throw new Error('Audio contains non-finite samples.');
            view.setFloat32(offset, sample, true);
            offset += 4;
        }
    return digest(bytes);
}
/** Render sequentially: the parser's named trajectory registry is shared. Caller pins both revisions. */
export async function freezeScene(context, options) {
    if (!Number.isInteger(options.seed) || !Number.isFinite(options.duration) || options.duration <= 0 || options.duration > 30)
        throw new Error('Scene auditions require a seed and 0–30 seconds.');
    const sources = sourceIdentities(options.script);
    if (options.sampleBuffers.size)
        throw new Error('Scene auditions require already decoded, pinned source buffers.');
    const frozen = structuredClone({ script: options.script, seed: options.seed, duration: options.duration,
        sampleRate: options.sampleRate ?? context.sampleRate, listenerPath: options.listenerPath ?? [],
        actions: options.actions ?? [], sceneState: options.sceneState, worldRoom: options.worldRoom });
    const buffers = new Map();
    const assets = [];
    let samples = 0;
    for (const [clip, original] of options.decodedAudioBuffers ?? []) {
        samples += original.length * original.numberOfChannels;
        if (samples > 30_000_000)
            throw new Error('Scene audition assets exceed the 120 MB PCM limit.');
        const copy = context.createBuffer(original.numberOfChannels, original.length, original.sampleRate);
        for (let c = 0; c < original.numberOfChannels; c++)
            copy.getChannelData(c).set(original.getChannelData(c));
        buffers.set(clip, copy);
    }
    for (const [clip, copy] of buffers)
        assets.push({ clipPath: clip, pcmHash: await pcmHash(copy) });
    const used = new Set();
    const buffer = await renderOffline({ ...frozen, sampleBuffers: new Map(), decodedAudioBuffers: buffers, mode: 'binaural',
        onManifest: manifest => {
            if (manifest.missingClips.length)
                throw new Error(`Missing audition assets: ${manifest.missingClips.join(", ")}`);
            for (const voice of manifest.voices) {
                const key = voice.clip ?? pathFor(voice.stmt.clip);
                used.add(buffers.has(key) ? key : voice.stmt.clip);
                if (!buffers.has(key) && !buffers.has(voice.stmt.clip))
                    throw new Error(`Missing audition asset: ${key}`);
            }
        } });
    return { buffer, manifest: { version: 'satie.scene-audition/v1', ...frozen, assets: assets.filter(a => used.has(a.clipPath)).sort((a, b) => a.clipPath.localeCompare(b.clipPath)), sources, pcmHash: await pcmHash(buffer) } };
}
export class SceneComparison {
    before;
    after;
    blinded;
    player;
    reversed;
    constructor(context, before, after, blinded = false, random = Math.random) {
        this.before = before;
        this.after = after;
        this.blinded = blinded;
        for (const key of ['seed', 'duration', 'sampleRate', 'listenerPath', 'actions']) {
            if (JSON.stringify(before.manifest[key]) !== JSON.stringify(after.manifest[key]))
                throw new Error(`Scene comparison requires matching ${key}.`);
        }
        this.reversed = blinded && random() < 0.5;
        this.player = new TakeComparison(context, this.reversed ? after.buffer : before.buffer, this.reversed ? before.buffer : after.buffer, { durationS: before.manifest.duration, gain: 1 });
    }
    play(side) { return this.player.play(side); }
    stop() { this.player.stop(); }
    destroy() { this.player.destroy(); }
    judge(winner, reason, dimension, auditioned) {
        if (!auditioned || !this.player.completed.has('A') || !this.player.completed.has('B') || !reason.trim())
            throw new Error('Listen to both scenes and provide an explicit judgment and reason.');
        if ((dimension === 'spatial' || dimension === 'acoustics') && JSON.stringify(this.before.manifest.assets) !== JSON.stringify(this.after.manifest.assets))
            throw new Error('Spatial/acoustic comparisons require identical source audio. Use intent/source-fit for changed takes.');
        return structuredClone({ protocol: 'scene-ab/v1', origin: 'human', evidence: 'explicit-user-feedback', auditioned: true,
            completed: ['A', 'B'], blinded: this.blinded, winner: winner === 'tie' || winner === 'neither' ? winner
                : ((winner === 'A') !== this.reversed ? 'before' : 'after'), reason: reason.trim(), dimension,
            before: this.before.manifest, after: this.after.manifest });
    }
}
/** Download/restore exact rendered auditions; PCM checksums detect accidental changes. */
export async function serializeAudition(scene) {
    const manifest = structuredClone(scene.manifest);
    const channels = Array.from({ length: scene.buffer.numberOfChannels }, (_, c) => Array.from(scene.buffer.getChannelData(c)));
    const manifestHash = await digest(new TextEncoder().encode(JSON.stringify(manifest)));
    const text = JSON.stringify({ manifest, manifestHash, channels });
    if (text.length > 80_000_000)
        throw new Error('Audition archive exceeds 80 MB; use a shorter excerpt.');
    return text;
}
export async function restoreAudition(context, text) {
    if (text.length > 80_000_000)
        throw new Error('Audition archive too large.');
    const data = JSON.parse(text);
    const m = data.manifest;
    if (await digest(new TextEncoder().encode(JSON.stringify(m))) !== data.manifestHash)
        throw new Error('Audition manifest checksum mismatch.');
    if (m?.version !== 'satie.scene-audition/v1' || !Number.isInteger(m.sampleRate) || m.sampleRate < 8000 || m.sampleRate > 96000
        || !Number.isFinite(m.duration) || m.duration <= 0 || m.duration > 30 || !Array.isArray(data.channels) || data.channels.length !== 2)
        throw new Error('Invalid audition archive.');
    const length = Math.ceil(m.duration * m.sampleRate);
    const buffer = context.createBuffer(2, length, m.sampleRate);
    for (let c = 0; c < 2; c++) {
        if (!Array.isArray(data.channels[c]) || data.channels[c].length !== length || !data.channels[c].every((x) => typeof x === 'number' && Number.isFinite(x)))
            throw new Error('Invalid PCM channel.');
        buffer.getChannelData(c).set(data.channels[c]);
    }
    if (await pcmHash(buffer) !== m.pcmHash)
        throw new Error('Audition PCM checksum mismatch.');
    if (JSON.stringify(sourceIdentities(m.script)) !== JSON.stringify(m.sources))
        throw new Error('Audition source mapping mismatch.');
    return { manifest: m, buffer };
}
//# sourceMappingURL=SceneComparison.js.map