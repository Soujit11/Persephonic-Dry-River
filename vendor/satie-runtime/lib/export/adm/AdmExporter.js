/**
 * ADM BWF export orchestrator: script → object-based Dolby-Atmos-compatible
 * master (BW64/RIFF WAV, 48 kHz / 24-bit, one mono track + one audioObject
 * per rendered voice, cartesian position blocks matching the audio exactly).
 *
 * Pipeline: parse → seeded render manifest (or the simulated trace — see
 * `prepareRenderManifest`) → per-voice mono stems (batched offline renders,
 * distance baked) → 100 Hz position timelines from the SAME manifest (seeds
 * or trace) → collapse static runs → ADM coordinates → Dolby-profile
 * BS.2076 XML + chna → BW64.
 */
import { decodeAllBuffers, renderObjectStems, prepareRenderManifest } from '../OfflineRenderer.js';
import { sampleVoicePositionTimeline } from '../VoicePositions.js';
import { autoFitRoomScale, admPositionFromScene, collapseStaticRuns, hasBelowPlanePositions } from './AdmCoordinates.js';
import { buildAdmXml, blocksFromTimeline, admIdsFor } from './AdmXml.js';
import { encodeBW64 } from './Bw64Encoder.js';
/** Dolby Atmos renderer limits (Atmos: 118 objects + bed on 128 tracks). */
export const ATMOS_MAX_OBJECTS = 118;
export const ATMOS_MAX_TRACKS = 128;
/**
 * Position metadata grid. 100 Hz = 10 ms events: under the Dolby profile's
 * 20 ms sampling recommendation, under Pro Tools' 30 ms linear-interpolation
 * threshold, and every timecode lands exactly on the 5-fractional-digit grid
 * so consecutive blocks tile with zero rounding drift.
 */
const ADM_METADATA_FPS = 100;
/** Static-run collapse tolerance, meters. */
const POSITION_EPSILON_M = 0.01;
/** Sum tracks to mono; scale down only if the sum clips. */
function monoSum(tracks) {
    const length = tracks[0]?.length ?? 0;
    const sum = new Float32Array(length);
    for (const track of tracks) {
        for (let i = 0; i < length; i++)
            sum[i] += track[i];
    }
    let peak = 0;
    for (let i = 0; i < length; i++) {
        const a = Math.abs(sum[i]);
        if (a > peak)
            peak = a;
    }
    if (peak > 1) {
        const scale = 1 / peak;
        for (let i = 0; i < length; i++)
            sum[i] *= scale;
    }
    return sum;
}
function sanitizeName(clip) {
    const base = clip.split('/').pop() ?? clip;
    return base.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 48);
}
/**
 * The metadata pass, pure: every voice's position timeline at
 * ADM_METADATA_FPS from the manifest (seed math or the simulated trace —
 * `sampleVoicePositionTimeline` reads whichever the voice carries), the room
 * scale that fits them, and the Dolby-profile block lists. Separated from
 * the audio pass so it can be tested without an OfflineAudioContext.
 */
export function admObjectsFromManifest(manifest, duration, roomScaleOverride) {
    const timelines = manifest.voices.map((v) => sampleVoicePositionTimeline(v, ADM_METADATA_FPS));
    const roomScale = roomScaleOverride ?? autoFitRoomScale(timelines);
    let clampedVoices = 0;
    const objects = manifest.voices.map((v, k) => {
        const timeline = timelines[k];
        if (hasBelowPlanePositions(timeline))
            clampedVoices++;
        const kept = collapseStaticRuns(timeline, POSITION_EPSILON_M);
        // Programme-absolute event times snapped to integer centiseconds, so the
        // 5-digit timecodes tile exactly (voice start times are arbitrary floats).
        const startCs = Math.round(v.startTime * 100);
        const points = kept.map((p) => ({
            t: (startCs + Math.round(p.t * 100)) / 100,
            position: admPositionFromScene(p, roomScale),
        }));
        const clip = v.clip ?? v.stmt.clip;
        return {
            name: `s${String(v.stmtIndex).padStart(2, '0')}_c${String(v.copyIndex).padStart(2, '0')}_r${String(v.repIndex).padStart(2, '0')}_${sanitizeName(clip)}`,
            blocks: blocksFromTimeline(points, duration),
        };
    });
    return { objects, roomScale, clampedVoices };
}
export async function renderAdmBwf(options, onProgress) {
    const { script, sampleBuffers, decodedAudioBuffers, duration } = options;
    const sampleRate = options.sampleRate ?? 48000;
    const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const warnings = [];
    onProgress?.({ phase: 'parsing', progress: 0 });
    onProgress?.({ phase: 'decoding', progress: 0.1 });
    // Scratch context — only used for decoding/resampling into the target rate.
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
        throw new Error('ADM export: no renderable voices (missing audio buffers?)');
    }
    if (manifest.voices.length > ATMOS_MAX_OBJECTS) {
        warnings.push(`${manifest.voices.length} objects exceeds the Dolby Atmos limit of ${ATMOS_MAX_OBJECTS} — ` +
            'the file is valid ADM but Atmos toolchains may refuse it. Reduce count/retriggers or shorten the render.');
    }
    onProgress?.({ phase: 'rendering', progress: 0.25 });
    const stems = await renderObjectStems(manifest, decodedBuffers, duration, sampleRate, (f) => onProgress?.({ phase: 'rendering', progress: 0.25 + 0.6 * f }));
    // Metadata pass — same seeds (or the same trace), same math, denser cadence
    // than the audio bake (position events must sit < 30 ms apart for importers
    // to interpolate).
    const { objects, roomScale, clampedVoices } = admObjectsFromManifest(manifest, duration, options.roomScale);
    if (clampedVoices > 0) {
        warnings.push(`${clampedVoices} voice(s) dip below the listener plane — ADM height clamps them to the floor (Z=0).`);
    }
    const axml = buildAdmXml(objects, {
        programmeName: options.programmeName,
        durationSeconds: duration,
        sampleRate,
        bitDepth: 24,
    });
    const chna = manifest.voices.map((_, k) => {
        const ids = admIdsFor(k);
        return { uid: ids.uid, trackRef: ids.trackRef, packRef: ids.packRef };
    });
    const blob = encodeBW64({ tracks: stems, sampleRate, bitDepth: 24, axml, chna });
    onProgress?.({ phase: 'done', progress: 1 });
    return {
        blob,
        objectCount: manifest.voices.length,
        warnings,
        manifest,
        seed,
        roomScale,
        previewMono: monoSum(stems),
        sampleRate,
    };
}
//# sourceMappingURL=AdmExporter.js.map