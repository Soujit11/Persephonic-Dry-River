/**
 * Mic-array render — the AUDIO half of the machine-listening dataset pair.
 *
 * STAIRS26/SELD annotations describe what a rigid microphone array would
 * hear; this renders that array's actual capture. DCASE 2026 Task 3 infers
 * on a 4-capsule tetrahedral subset of an Eigenmike (r = 4.2 cm, 24 kHz),
 * and the cue its models consume is TDOA — inter-capsule time differences.
 * Ambisonic decodes fake directivity but carry ZERO time difference, so a
 * model trained on them never learns the array's real geometry. Here the
 * delays are physically true per capsule, per block, per source.
 *
 * Built as a pure mix pass over `renderObjectStems`:
 *   - stems already bake per-voice DSP, envelopes, reverb send and the
 *     listener-referenced DISTANCE ATTENUATION (OfflineRenderer applies
 *     `distanceAttenuation` per voice). So the capsule pass applies only the
 *     RELATIVE part: delay and gain of each capsule referenced to the array
 *     centre — `(d_capsule − d_centre)/c` seconds, `d_centre/d_capsule`
 *     gain. Applying absolute capsule distance would attenuate twice.
 *   - positions are evaluated per block with the same `positionAt` the audio
 *     and annotation passes use, so all three provably agree.
 *
 * TWO ARRAY MODELS, one job field apart. The historical default is free
 * air: capsules floating in the open, coupled only by the relative delay and
 * gain above. `geometry.baffle` mounts them FLUSH ON A RIGID SPHERE instead
 * — which is what the benchmark arrays physically are (STARSS23 / DCASE MIC
 * is four capsules of an Eigenmike, r = 4.2 cm) — and the capsule pass then
 * convolves each source with the sphere's exact modal transfer function for
 * the angle between that source and that capsule's outward normal
 * (`RigidSphere.ts`). The sphere response REPLACES the relative delay and
 * gain: it is referenced to the same array centre and already carries the
 * propagation phase across the sphere, so applying the free-field delay on
 * top would count it twice. Free field remains bit-identical (tested).
 *
 * Approximations, stated: the reverberant tail rides each voice's stem and
 * is delayed like its dry source (a real room's diffuse field would arrive
 * decorrelated at each capsule); delay changes step per block (block ≤ 128
 * samples ≈ 5 ms at 24 kHz — inaudible for scene-speed movers, and the
 * annotations quantize at 100 ms anyway). The array sits on the listener —
 * at the origin, or riding a `listenerPath`, the same pose the stems were
 * attenuated for and the annotations are expressed in.
 */
import { positionAt } from './VoicePositions.js';
import { tetrahedralArray, capsuleNormal, SPEED_OF_SOUND } from './MicArray.js';
import { sphereFirTable, sphereFirAt } from './RigidSphere.js';
import { listenerPoseAt, toListenerFrame, DEFAULT_LISTENER_POSE } from './ListenerPath.js';
/** Samples per position/delay update. */
const BLOCK = 128;
/**
 * Mix full-length object stems into per-capsule signals. Pure — stems in,
 * capsule channels out; index-aligned with `geometry.capsules`.
 *
 * `stems[i]` must be the full-render-length signal of `voices[i]` (that is
 * exactly what `renderObjectStems` returns), so stem sample n corresponds to
 * output sample n and the only re-indexing is the capsule's relative delay.
 * Relative delays are sub-millisecond (±r/c), read with linear interpolation;
 * negative delays (capsule nearer than centre) read a few samples ahead,
 * which a fully-rendered stem always has.
 */
export function mixStemsToCapsules(stems, voices, geometry, sampleRate, durationS, listenerPath) {
    const frameCount = Math.ceil(sampleRate * durationS);
    const out = geometry.capsules.map(() => new Float32Array(frameCount));
    const path = listenerPath && listenerPath.length ? listenerPath : null;
    // Rigid baffle: one FIR family indexed by the angle between the source
    // and each capsule's own outward normal (RigidSphere.ts). Built once per
    // (radius, rate) and shared by every capsule of every source.
    const table = geometry.baffle ? sphereFirTable(geometry.baffle.radiusM, sampleRate) : null;
    const normals = table ? geometry.capsules.map(capsuleNormal) : null;
    const taps = table ? new Float32Array(table.taps) : null;
    for (let vi = 0; vi < voices.length; vi++) {
        const stem = stems[vi];
        if (!stem)
            continue;
        const v = voices[vi];
        const startSample = Math.max(0, Math.floor(v.startTime * sampleRate));
        const endSample = Math.min(frameCount, stem.length, Math.ceil((v.startTime + v.voiceDuration) * sampleRate));
        for (let block = startSample; block < endSample; block += BLOCK) {
            const blockEnd = Math.min(block + BLOCK, endSample);
            // Position at the block's midpoint, elapsed in VOICE time; the array
            // rides the listener, so a path brings the source into its frame.
            const tMid = (block + (blockEnd - block) / 2) / sampleRate;
            const elapsed = tMid - v.startTime;
            const pose = path ? listenerPoseAt(path, tMid) : DEFAULT_LISTENER_POSE;
            const p = toListenerFrame(positionAt(v, Math.max(0, elapsed)), pose);
            const dCentre = Math.max(1e-3, Math.hypot(p.x, p.y, p.z));
            // A 64-tap convolution per capsule is ~16x the free-field read, so
            // skip blocks the stem is silent through — one-shots in a sparse scene
            // are mostly silence, and a silent input contributes exactly zero.
            if (table) {
                const lo = Math.max(0, block + table.preDelay - table.taps + 1);
                const hi = Math.min(stem.length, blockEnd + table.preDelay);
                let silent = true;
                for (let i = lo; i < hi; i++)
                    if (stem[i] !== 0) {
                        silent = false;
                        break;
                    }
                if (silent)
                    continue;
            }
            for (let ci = 0; ci < geometry.capsules.length; ci++) {
                const c = geometry.capsules[ci];
                const ch = out[ci];
                if (table && normals && taps) {
                    // The sphere response is referenced to the free-field pressure at
                    // the array CENTRE — the same reference the free-field branch
                    // uses — and already contains the propagation phase across the
                    // sphere. So it REPLACES the relative delay and relative gain
                    // rather than stacking on them; applying either again would count
                    // the same physics twice. `preDelay` is cancelled by reading the
                    // stem that far ahead, so the two paths share a time origin.
                    const nrm = normals[ci];
                    const cosTheta = (p.x * nrm.x + p.y * nrm.y + p.z * nrm.z) / dCentre;
                    const thetaDeg = Math.acos(Math.min(1, Math.max(-1, cosTheta))) * (180 / Math.PI);
                    sphereFirAt(table, thetaDeg, taps);
                    const L = table.taps;
                    const D = table.preDelay;
                    const len = stem.length;
                    for (let n = block; n < blockEnd; n++) {
                        const base = n + D;
                        let acc = 0;
                        if (base - L + 1 >= 0 && base < len) {
                            for (let k = 0; k < L; k++)
                                acc += taps[k] * stem[base - k];
                        }
                        else {
                            for (let k = 0; k < L; k++) {
                                const i = base - k;
                                if (i >= 0 && i < len)
                                    acc += taps[k] * stem[i];
                            }
                        }
                        ch[n] += acc;
                    }
                }
                else {
                    const dCapsule = Math.max(1e-3, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
                    const delaySamples = ((dCapsule - dCentre) / SPEED_OF_SOUND) * sampleRate;
                    const gain = dCentre / dCapsule;
                    for (let n = block; n < blockEnd; n++) {
                        const src = n - delaySamples;
                        const i0 = Math.floor(src);
                        const frac = src - i0;
                        const s0 = i0 >= 0 && i0 < stem.length ? stem[i0] : 0;
                        const s1 = i0 + 1 >= 0 && i0 + 1 < stem.length ? stem[i0 + 1] : 0;
                        ch[n] += (s0 + (s1 - s0) * frac) * gain;
                    }
                }
            }
        }
    }
    return out;
}
/**
 * Render a manifest to a mic array's capture: object stems (same seeds, same
 * automation as every other render mode) mixed to capsules with true
 * relative delays. Returns one Float32Array per capsule, in capsule order.
 * The caller wraps them into an AudioBuffer / WAV (channel order = the
 * geometry's capsule order, FLU/FRD/BLD/BRU for the tetrahedron).
 */
export async function renderMicArrayCapture(manifest, buffers, duration, sampleRate, options = {}) {
    const { renderObjectStems } = await import('./OfflineRenderer.js');
    const geometry = options.geometry ?? tetrahedralArray();
    const stems = await renderObjectStems(manifest, buffers, duration, sampleRate, options.onProgress ? (f) => options.onProgress(f * 0.9) : undefined, options.listenerPath);
    options.onStems?.(stems);
    const capsules = mixStemsToCapsules(stems, manifest.voices, geometry, sampleRate, duration, options.listenerPath);
    options.onProgress?.(1);
    return capsules;
}
/**
 * Script → 4-channel tetrahedral capture, packaged as an AudioBuffer so the
 * existing WAV/preview plumbing applies. Same prepare recipe as the ADM
 * exporter: parse → decode into the target rate → seeded manifest → stems →
 * capsule mix. `onManifest` hands out the manifest BEFORE rendering, so
 * annotations derived from it provably match this audio.
 */
export async function renderMicArray(options) {
    const { script, sampleBuffers, decodedAudioBuffers, duration, sampleRate } = options;
    const geometry = options.geometry ?? tetrahedralArray();
    options.onProgress?.({ phase: 'parsing', progress: 0 });
    options.onProgress?.({ phase: 'decoding', progress: 0.05 });
    const { decodeAllBuffers, prepareRenderManifest } = await import('./OfflineRenderer.js');
    const scratchCtx = new OfflineAudioContext(1, 1, sampleRate);
    const decodedBuffers = await decodeAllBuffers(scratchCtx, sampleBuffers, decodedAudioBuffers, sampleRate, (f) => options.onProgress?.({ phase: 'decoding', progress: 0.05 + 0.1 * f }));
    const { manifest } = await prepareRenderManifest({
        script, decodedBuffers, duration, seed: options.seed, simulate: options.simulate, worldRoom: options.worldRoom,
        listenerPath: options.listenerPath, sceneState: options.sceneState, actions: options.actions,
        onSimulating: (f) => options.onProgress?.({ phase: 'simulating', progress: 0.15 + 0.05 * f }),
    });
    if (manifest.voices.length === 0) {
        throw new Error('Mic-array export: no renderable voices (missing audio buffers?)');
    }
    options.onManifest?.(manifest);
    options.onProgress?.({ phase: 'rendering', progress: 0.2 });
    const capsules = await renderMicArrayCapture(manifest, decodedBuffers, duration, sampleRate, {
        geometry,
        listenerPath: options.listenerPath,
        onStems: options.onStems,
        onProgress: (f) => options.onProgress?.({ phase: 'rendering', progress: 0.2 + 0.8 * f }),
    });
    const out = new AudioBuffer({ length: capsules[0].length, sampleRate, numberOfChannels: capsules.length });
    capsules.forEach((ch, i) => out.copyToChannel(ch, i));
    return out;
}
//# sourceMappingURL=MicArrayRender.js.map