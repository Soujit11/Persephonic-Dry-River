/**
 * USDZ export orchestrator: script → .usdz package with per-voice
 * UsdMediaSpatialAudio prims, baked mono clips and animated positions —
 * droppable into AR Quick Look (iOS 18.1+), RealityKit / Vision Pro and
 * generic USD tooling.
 *
 * Everything is baked into scene-length clips played `onceFromStart`:
 * retriggers re-sample volume/pitch per repeat (irreproducible via startTime
 * tricks), loops aren't cycle-stationary, and Apple's playbackMode coverage
 * beyond onceFromStart is undocumented. Distance attenuation is NOT baked —
 * positions are real meters and RealityKit applies its own distance model as
 * the user walks the scene (documented deviation from Satie's rolloff).
 *
 * Size lever: clips are silence-trimmed (head trim becomes the prim's
 * startTime; tail trim gets a short guard fade) and fully silent voices are
 * skipped.
 */
import { decodeAllBuffers, renderObjectStems, prepareRenderManifest } from './OfflineRenderer.js';
import { positionAt, isStaticMotion } from './VoicePositions.js';
import { buildRiff, buildFmtChunk, interleavePcm } from './RiffWriter.js';
import { buildUSDA, sanitizePrimName, USD_TIMECODES_PER_SECOND } from './USDAWriter.js';
import { packUSDZ } from './USDZPacker.js';
/** −60 dBFS — below this a sample counts as silence for trimming. */
const SILENCE_THRESHOLD = 0.001;
/** Guard fade applied at a trimmed tail cut, seconds. */
const GUARD_FADE_S = 0.005;
/**
 * Trim leading/trailing silence. Returns null when the whole stem is silent.
 * The tail cut gets a short linear guard fade so it can't click.
 */
export function trimSilence(data, sampleRate, threshold = SILENCE_THRESHOLD) {
    let first = -1;
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > threshold) {
            first = i;
            break;
        }
    }
    if (first === -1)
        return null;
    let last = data.length - 1;
    for (; last > first; last--) {
        if (Math.abs(data[last]) > threshold)
            break;
    }
    const guard = Math.round(GUARD_FADE_S * sampleRate);
    const end = Math.min(data.length, last + 1 + guard);
    const samples = data.slice(first, end);
    if (end < data.length) {
        // The cut is mid-decay — fade the guard region to zero.
        const fadeLen = Math.min(guard, samples.length);
        for (let i = 0; i < fadeLen; i++) {
            samples[samples.length - fadeLen + i] *= 1 - (i + 1) / fadeLen;
        }
    }
    return { startSeconds: first / sampleRate, samples };
}
/** Scene frame (+Z ahead) → USD frame (−Z front): reflect z, reorder nothing. */
export function toUsdPosition(p) {
    return [p.x, p.y, -p.z];
}
/**
 * A voice's prim position: one static translate when it never moves, else
 * a timeSample per stage timecode across its life. Reads the manifest's
 * motion (seed math or the simulated trace) through `positionAt`, the same
 * function the stems were attenuated with. Pure, for tests.
 */
export function usdPositionsFor(voice) {
    if (isStaticMotion(voice))
        return { staticPosition: toUsdPosition(positionAt(voice, 0)) };
    const samples = [];
    const step = 1 / USD_TIMECODES_PER_SECOND;
    for (let elapsed = 0; elapsed < voice.voiceDuration; elapsed += step) {
        const tc = Math.round((voice.startTime + elapsed) * USD_TIMECODES_PER_SECOND);
        samples.push([tc, toUsdPosition(positionAt(voice, elapsed))]);
    }
    return { positionTimeSamples: samples };
}
/** Mono 16-bit WAV bytes straight from samples (no AudioBuffer required). */
function monoWavBytes(samples, sampleRate) {
    const { parts, totalSize } = buildRiff('RIFF', [
        { id: 'fmt ', payload: buildFmtChunk({ channels: 1, sampleRate, bitDepth: 16 }) },
        { id: 'data', payload: interleavePcm([samples], 16) },
    ]);
    const out = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
    }
    return out;
}
export async function exportUSDZ(options, onProgress) {
    const { script, sampleBuffers, decodedAudioBuffers, duration } = options;
    const sampleRate = options.clipSampleRate ?? 48000;
    const includeMarkers = options.includeMarkers ?? true;
    const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const warnings = [];
    onProgress?.({ phase: 'parsing', progress: 0 });
    onProgress?.({ phase: 'decoding', progress: 0.1 });
    const scratchCtx = new OfflineAudioContext(1, 1, sampleRate);
    const decodedBuffers = await decodeAllBuffers(scratchCtx, sampleBuffers, decodedAudioBuffers, sampleRate, (f) => onProgress?.({ phase: 'decoding', progress: 0.1 + 0.1 * f }));
    const { manifest } = await prepareRenderManifest({
        script, decodedBuffers, duration, seed, simulate: options.simulate, worldRoom: options.worldRoom,
        onSimulating: (f) => onProgress?.({ phase: 'simulating', progress: 0.2 + 0.05 * f }),
    });
    for (const clip of manifest.missingClips) {
        warnings.push(`No audio for "${clip}" — statement skipped.`);
    }
    if (manifest.voices.length === 0) {
        throw new Error('USDZ export: no renderable voices (missing audio buffers?)');
    }
    onProgress?.({ phase: 'rendering', progress: 0.25 });
    const stems = await renderObjectStems(manifest, decodedBuffers, duration, sampleRate, (f) => onProgress?.({ phase: 'rendering', progress: 0.25 + 0.65 * f }));
    const voices = [];
    const clips = [];
    const usedNames = new Set();
    let skippedSilent = 0;
    for (let k = 0; k < manifest.voices.length; k++) {
        const voice = manifest.voices[k];
        const trimmed = trimSilence(stems[k], sampleRate);
        if (!trimmed) {
            skippedSilent++;
            continue;
        }
        const clipBase = ((voice.clip ?? voice.stmt.clip).split('/').pop() ?? voice.stmt.clip);
        let primName = sanitizePrimName(`voice_${String(voice.stmtIndex).padStart(2, '0')}_${clipBase}_c${String(voice.copyIndex).padStart(2, '0')}_r${String(voice.repIndex).padStart(2, '0')}`);
        while (usedNames.has(primName))
            primName = `${primName}_x`;
        usedNames.add(primName);
        const clipHref = `audio/${primName}.wav`;
        clips.push({ name: clipHref, data: monoWavBytes(trimmed.samples, sampleRate) });
        const spec = {
            primName,
            clipHref,
            startTimeCode: Math.round(trimmed.startSeconds * USD_TIMECODES_PER_SECOND),
            includeMarker: includeMarkers,
            ...usdPositionsFor(voice),
        };
        voices.push(spec);
    }
    if (voices.length === 0) {
        throw new Error('USDZ export: every voice rendered silent — nothing to package.');
    }
    const usda = buildUSDA({ durationSeconds: duration, voices });
    const blob = packUSDZ([
        { name: 'scene.usda', data: new TextEncoder().encode(usda) },
        ...clips,
    ]);
    onProgress?.({ phase: 'done', progress: 1 });
    return { blob, voiceCount: voices.length, skippedSilent, warnings, seed };
}
//# sourceMappingURL=USDZExporter.js.map