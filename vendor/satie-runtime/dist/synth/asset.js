/** A portable instrument carried with its baked audio. Ordinary players ignore the metadata. */
import { sanitizePatch } from './patch.js';
const MAX_BYTES = 32768;
const OWNER = 'world.satie.synth';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const assets = new WeakMap();
export const synthAssetFor = (buffer) => assets.get(buffer);
export function attachSynthAsset(buffer, asset) { assets.set(buffer, asset); }
export function copySynthAsset(from, to) {
    const asset = assets.get(from);
    if (asset)
        assets.set(to, asset);
}
export function readSynthAsset(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const a = raw;
    if (a.version !== 1 || a.engine !== 'csound' || typeof a.loop !== 'boolean'
        || typeof a.seconds !== 'number' || !Number.isFinite(a.seconds) || a.seconds < 2 || a.seconds > 120
        || typeof a.seed !== 'number' || !Number.isInteger(a.seed) || a.seed < 0 || a.seed > 0xffffffff)
        return null;
    const p = sanitizePatch(a.patch);
    return p.ok ? { version: 1, engine: 'csound', patch: p.patch, seed: a.seed, seconds: a.seconds, loop: a.loop,
        ...(typeof a.renderer === 'string' && a.renderer.length <= 80 ? { renderer: a.renderer } : {}),
        ...(typeof a.id === 'string' && /^[a-f0-9]{64}$/.test(a.id) ? { id: a.id } : {}),
    } : null;
}
export async function createSynthAsset(patch, seconds, loop, seed) {
    const asset = readSynthAsset({ version: 1, engine: 'csound', patch, seconds, loop, seed: seed >>> 0, renderer: 'csound-7.0.0-beta36' });
    if (!asset)
        throw new Error('Invalid synth asset');
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(asset)));
    asset.id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    return asset;
}
export function synthAssetBytes(asset) {
    const bytes = encoder.encode(JSON.stringify(asset));
    if (bytes.length > MAX_BYTES)
        throw new Error('Synth patch is too large');
    return bytes;
}
function parse(bytes) {
    if (bytes.length > MAX_BYTES)
        return null;
    try {
        return readSynthAsset(JSON.parse(decoder.decode(bytes)));
    }
    catch {
        return null;
    }
}
const ascii = (bytes, start, n) => decoder.decode(bytes.subarray(start, start + n));
const syncSize = (bytes, at) => (bytes[at] << 21) | (bytes[at + 1] << 14) | (bytes[at + 2] << 7) | bytes[at + 3];
/** Read bounded ID3 PRIV or RIFF stSy data before handing the bytes to the audio decoder. */
export function synthAssetFromAudio(data) {
    const b = new Uint8Array(data), v = new DataView(data);
    if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') {
        for (let at = 12; at + 8 <= b.length;) {
            const size = v.getUint32(at + 4, true), end = at + 8 + size;
            if (end > b.length)
                return null;
            if (ascii(b, at, 4) === 'stSy')
                return parse(b.subarray(at + 8, end));
            at = end + (size & 1);
        }
    }
    if (b.length >= 10 && ascii(b, 0, 3) === 'ID3' && (b[3] === 3 || b[3] === 4) && b[5] === 0) {
        const end = Math.min(b.length, 10 + syncSize(b, 6));
        for (let at = 10; at + 10 <= end;) {
            const size = b[3] === 4 ? syncSize(b, at + 4) : v.getUint32(at + 4);
            if (!size || at + 10 + size > end)
                break;
            if (ascii(b, at, 4) === 'PRIV' && ascii(b, at + 10, OWNER.length + 1) === OWNER + '\0') {
                return parse(b.subarray(at + 11 + OWNER.length, at + 10 + size));
            }
            at += 10 + size;
        }
    }
    return null;
}
/** Insert one ID3v2.3 private frame; replace ffmpeg's old tag, retaining the MP3 frames. */
export function withSynthAsset(mp3, asset) {
    const original = new Uint8Array(mp3);
    const skip = original.length >= 10 && ascii(original, 0, 3) === 'ID3' ? 10 + syncSize(original, 6) : 0;
    if (skip > original.length)
        throw new Error('Invalid MP3 tag');
    const owner = encoder.encode(OWNER + '\0'), payload = synthAssetBytes(asset);
    const frameSize = owner.length + payload.length, tagSize = 10 + frameSize;
    const out = new Uint8Array(10 + tagSize + original.length - skip);
    out.set([73, 68, 51, 3, 0, 0, (tagSize >>> 21) & 127, (tagSize >>> 14) & 127, (tagSize >>> 7) & 127, tagSize & 127]);
    out.set(encoder.encode('PRIV'), 10);
    new DataView(out.buffer).setUint32(14, frameSize);
    out.set(owner, 20);
    out.set(payload, 20 + owner.length);
    out.set(original.subarray(skip), 10 + tagSize);
    return out.buffer;
}
export async function decodeSynthAudio(ctx, bytes) {
    const asset = synthAssetFromAudio(bytes);
    const buffer = await ctx.decodeAudioData(bytes);
    if (asset)
        attachSynthAsset(buffer, asset);
    return buffer;
}
//# sourceMappingURL=asset.js.map