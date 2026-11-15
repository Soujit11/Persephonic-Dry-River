/**
 * Offline audio renderer for Satie compositions.
 *
 * Two ways to know what to render, one graph to render it through:
 *   - the SEED-DRIVEN manifest (`buildRenderManifest`): every random value
 *     sampled once up front, motion from pure seed functions. Exact for a
 *     plain script of placed / wandering voices, and the path the golden
 *     tests pin.
 *   - the TRACE-DRIVEN manifest (`SceneSimulation`): the live engine run
 *     headlessly, its per-frame state recorded. The reference: it covers the
 *     `world` block, `at` hosts, passing traffic, entities, the signal bus,
 *     pooled takes, Doppler and foliage, which the sampler never modelled.
 *     Chosen automatically (`RenderOptions.simulate`, default 'auto') whenever
 *     the script uses any of that — see `needsSimulation`.
 *
 * Renders a Satie script to an AudioBuffer using OfflineAudioContext.
 * Supports three modes:
 *   - stereo: 2ch with equalpower panning
 *   - binaural: 2ch with HRTF panning
 *   - ambisonic-foa: 4ch First-Order Ambisonics (AmbiX: W, Y, Z, X)
 *
 * This renderer faithfully replicates the live engine's behavior:
 *   - Parameter interpolation (volume, pitch, DSP automation)
 *   - Noise perturbation on trajectories
 *   - Matched rolloff/distance model
 *   - Proper loop timing
 *   - The reverb ladder: a voice's own `reverb` > the room it is `in` > the
 *     script's first declared `room` > the world room (`RenderOptions.
 *     worldRoom`, else the trace's) — see `roomForVoice` in RenderManifest.
 *
 * Randomness: all per-voice sampling happens up front in buildRenderManifest
 * through one RNG (seeded via RenderOptions.seed for reproducible renders,
 * Math.random otherwise). Position math lives in VoicePositions and is pure
 * given the manifest's seeds, so metadata exporters (ADM/USDZ) can re-derive
 * the exact position timeline the audio used.
 *
 * Coordinates: statements are authored in Satie's scene frame (+Z = ahead).
 * Web Audio treats −Z as front, so positions are converted with
 * toPlaybackFrame() at the panner/FOA boundary — without this, `place ahead`
 * voices render behind the listener (the live engine doesn't hit this because
 * the camera is the listener there).
 */
import { parseScene, pathFor } from '../core/SatieParser.js';
import { bedTiltDb, BED_SHELF_HZ } from '../spatial/LevelModel.js';
import { WanderType, isTrajectoryWanderType } from '../core/Statement.js';
import { buildDSPChain, makeDistortionCurve, mapCutoff, mapResonance, mapDrive, mapEQGain } from '../dsp/DSPChain.js';
import { ReverbBusPool } from '../dsp/ReverbBus.js';
import { seamlessLoopOf } from '../dsp/SeamlessLoop.js';
import { reverbSendGain, dopplerRatio, OCCLUSION_OPEN_HZ, PANNER_REF_M, distanceRolloff, occlusionCutoffHz, occlusionGain } from '../spatial/WorldAcoustics.js';
import { mapFollow } from '../core/Signals.js';
import { computeHOAGains, acnOrder, ambisonicChannelCount, distanceAttenuation, } from './AmbisonicEncoder.js';
import { SPEAKER_LAYOUTS, speakerGains, wideBusFanout, diffuseFanout, } from './SpeakerLayouts.js';
import { SatieEngine, normalizeOnArrival } from '../core/SatieEngine.js';
import { mulberry32, defaultRng } from '../core/Random.js';
import { buildRenderManifest, resolveRenderRooms, roomForVoice } from './RenderManifest.js';
import { positionAt, toPlaybackFrame, isStaticMotion, traceValueAt } from './VoicePositions.js';
import { simulateScene, needsSimulation } from './SceneSimulation.js';
import { sampleSphereExtent, sampleRingExtent, sampleLineExtent, lineFromBox, extentDeg, crossfadeGains, createWideBus, NEAR_FIELD_RADIUS_M, } from '../spatial/SourceExtent.js';
import { directPathGain } from '../spatial/WorldAcoustics.js';
import { listenerPoseAt, toListenerFrame, DEFAULT_LISTENER_POSE } from './ListenerPath.js';
import { clamp01 } from '../core/math.js';
/**
 * Where a voice sits, in the frame the panner and the FOA encoder expect, at
 * absolute render time `t`.
 *
 * Two conversions, in this order and not interchangeable: into the listener's
 * frame (translate + rotate by the pose at time t), then the scene→Web Audio
 * z-flip. Applying the flip first would rotate about the wrong axis sign.
 */
function sourceForPlayback(voice, t, voiceStart, path) {
    const scene = positionAt(voice, t - voiceStart);
    const pose = path && path.length ? listenerPoseAt(path, t) : DEFAULT_LISTENER_POSE;
    return toPlaybackFrame(toListenerFrame(scene, pose));
}
/** Channel count per render mode (speaker modes follow SPEAKER_LAYOUTS). */
export function renderModeChannels(mode) {
    switch (mode) {
        case 'ambisonic-foa': return 4;
        case 'ambisonic-soa': return 9;
        case 'quad': return SPEAKER_LAYOUTS.quad.length;
        case '7.1.2': return SPEAKER_LAYOUTS['7.1.2'].length;
        case '7.1.4': return SPEAKER_LAYOUTS['7.1.4'].length;
        default: return 2;
    }
}
/** Automation update rate for offline rendering (Hz) */
const AUTOMATION_FPS = 30;
const AUTOMATION_STEP = 1 / AUTOMATION_FPS;
// Re-exported for tests and export-pipeline consumers.
export { computeStartTimes, computeVoiceDuration, computeStartOffset, buildRenderManifest } from './RenderManifest.js';
export { buildSeldAnnotations, scenePositionToPolar, voiceLabel, seldToCsv, seldClassMapJson, SELD_DEFAULT_FPS, } from './SeldAnnotations.js';
export { listenerPoseAt, toListenerFrame, pathDuration, walkPath, DEFAULT_LISTENER_POSE, } from './ListenerPath.js';
export { planBatch, surfacesForVariant, batchManifestJson } from './BatchRender.js';
export { tetrahedralArray, circularArray, captureAt, tdoa, maxTdoaS, SPEED_OF_SOUND } from './MicArray.js';
/**
 * Decode/resample every available clip into the given context's sample rate.
 * Shared by renderOffline and the stem renderer.
 */
export async function decodeAllBuffers(ctx, sampleBuffers, decodedAudioBuffers, sampleRate, onProgress) {
    const decodedBuffers = new Map();
    // Copy pre-decoded buffers from the live engine
    if (decodedAudioBuffers) {
        for (const [name, buf] of decodedAudioBuffers) {
            if (buf.sampleRate === sampleRate) {
                decodedBuffers.set(name, buf);
            }
            else {
                // Resample with linear interpolation (higher quality than nearest-neighbor)
                const newBuf = ctx.createBuffer(buf.numberOfChannels, Math.ceil(buf.duration * sampleRate), sampleRate);
                for (let ch = 0; ch < buf.numberOfChannels; ch++) {
                    const src = buf.getChannelData(ch);
                    const dst = newBuf.getChannelData(ch);
                    const ratio = buf.sampleRate / sampleRate;
                    for (let i = 0; i < dst.length; i++) {
                        const srcPos = i * ratio;
                        const i0 = Math.floor(srcPos);
                        const i1 = Math.min(i0 + 1, src.length - 1);
                        const frac = srcPos - i0;
                        dst[i] = src[i0] + (src[i1] - src[i0]) * frac;
                    }
                }
                decodedBuffers.set(name, newBuf);
            }
        }
    }
    // Decode raw ArrayBuffers sequentially
    const bufferEntries = Array.from(sampleBuffers.entries());
    for (let i = 0; i < bufferEntries.length; i++) {
        const [name, arrayBuffer] = bufferEntries[i];
        if (decodedBuffers.has(name))
            continue;
        try {
            const copy = arrayBuffer.slice(0);
            const decoded = await ctx.decodeAudioData(copy);
            decodedBuffers.set(name, decoded);
        }
        catch (e) {
            console.warn(`[OfflineRenderer] Failed to decode "${name}":`, e);
        }
        onProgress?.((i + 1) / bufferEntries.length);
    }
    // The same reference loudness the live engine gives every buffer on
    // arrival (CLIP_LUFS), so an exported `spl` means what it meant live and a
    // plain script's `volume` trims the same clip level. Once per object.
    for (const buf of decodedBuffers.values())
        normalizeOnArrival(buf);
    return decodedBuffers;
}
/** Buffer-duration map consumed by buildRenderManifest. */
export function bufferDurations(buffers) {
    const durations = new Map();
    for (const [name, buf] of buffers)
        durations.set(name, buf.duration);
    return durations;
}
/** Should this render simulate? Resolves 'auto' against the script. */
export function shouldSimulate(scene, simulate) {
    return simulate === undefined || simulate === 'auto' ? needsSimulation(scene) : simulate;
}
/**
 * The one recipe every export format shares: parse → (simulate) → manifest.
 * Trace or sampler is decided here (`shouldSimulate`), so stereo, HOA,
 * speaker layouts, stems, ADM, USDZ, the mic array and the annotators all
 * agree on which path a script takes. Returns the trace too, for callers
 * that want the entity marks and event broadcasts.
 *
 * The manifest also carries the render's rooms (`RenderManifest.rooms`):
 * the script's declared `room`s derived as the engine derives them, and the
 * world room — the caller's (`worldRoom`, the room the listener stood in at
 * export time) over the trace's (the room the headless run ended in).
 */
export async function prepareRenderManifest(opts) {
    const scene = opts.scene ?? parseScene(opts.script);
    const durations = bufferDurations(opts.decodedBuffers);
    if (opts.initialPlaying === false || opts.actions?.length || shouldSimulate(scene, opts.simulate)) {
        const trace = await simulateScene({
            script: opts.script, scene, durationS: opts.duration, buffers: opts.decodedBuffers,
            actions: opts.actions, initialPlaying: opts.initialPlaying, seed: opts.seed, listenerPath: opts.listenerPath, sceneState: opts.sceneState, onProgress: opts.onSimulating,
        });
        const manifest = buildRenderManifest(scene.statements, opts.duration, () => 0, durations, trace);
        manifest.rooms = resolveRenderRooms(scene, opts.worldRoom ?? trace.worldRoom);
        return { manifest, trace, scene };
    }
    const rng = opts.seed !== undefined ? mulberry32(opts.seed) : defaultRng();
    const manifest = buildRenderManifest(scene.statements, opts.duration, rng, durations);
    manifest.rooms = resolveRenderRooms(scene, opts.worldRoom);
    return { manifest, trace: null, scene };
}
/**
 * Render a Satie script offline to an AudioBuffer.
 */
export async function renderOffline(options, onProgress) {
    const { script, sampleBuffers, decodedAudioBuffers, duration, mode } = options;
    const sampleRate = options.sampleRate ?? 48000;
    const masterGain = options.masterGain ?? .5;
    if (!Number.isFinite(masterGain) || masterGain < 0 || masterGain > 2)
        throw new Error('Invalid master gain.');
    onProgress?.({ phase: 'parsing', progress: 0 });
    // Parse the script (a syntax error throws here, before any decoding)
    const scene = parseScene(script);
    const simulated = shouldSimulate(scene, options.simulate);
    // Determine channel count
    const channelCount = renderModeChannels(mode);
    // Create offline context
    const offlineCtx = new OfflineAudioContext(channelCount, Math.ceil(sampleRate * duration), sampleRate);
    onProgress?.({ phase: 'decoding', progress: 0.1 });
    const decodedBuffers = await decodeAllBuffers(offlineCtx, sampleBuffers, decodedAudioBuffers, sampleRate, (f) => onProgress?.({ phase: 'decoding', progress: 0.1 + 0.2 * f }));
    if (simulated)
        onProgress?.({ phase: 'simulating', progress: 0.3 });
    const { manifest } = await prepareRenderManifest({
        script, scene, decodedBuffers, duration, seed: options.seed, simulate: options.simulate,
        actions: options.actions, initialPlaying: options.initialPlaying, listenerPath: options.listenerPath, sceneState: options.sceneState, worldRoom: options.worldRoom,
        onSimulating: (f) => onProgress?.({ phase: 'simulating', progress: 0.3 + 0.2 * f }),
    });
    onProgress?.({ phase: 'rendering', progress: simulated ? 0.5 : 0.3 });
    for (const clip of manifest.missingClips) {
        console.warn(`[OfflineRenderer] Missing buffer for "${clip}" (pathFor="${pathFor(clip)}")`);
    }
    // Hand out the manifest before scheduling, so annotations are derived from
    // exactly what gets rendered rather than a re-sampled guess at it.
    options.onManifest?.(manifest);
    // Create master output
    let sourcesScheduled;
    if (mode === 'ambisonic-foa' || mode === 'ambisonic-soa') {
        sourcesScheduled = renderAmbisonic(offlineCtx, manifest, decodedBuffers, duration, mode === 'ambisonic-soa' ? 2 : 1, options.listenerPath, masterGain);
    }
    else if (mode === 'quad' || mode === '7.1.2' || mode === '7.1.4') {
        sourcesScheduled = renderSpeakerLayout(offlineCtx, manifest, decodedBuffers, duration, SPEAKER_LAYOUTS[mode], options.listenerPath, masterGain);
    }
    else {
        sourcesScheduled = renderStereoOrBinaural(offlineCtx, manifest, decodedBuffers, duration, mode, options.listenerPath, masterGain);
    }
    console.log(`[OfflineRenderer] ${sourcesScheduled} sources scheduled for ${duration}s render${manifest.simulated ? ' (simulated)' : ''}`);
    onProgress?.({ phase: 'rendering', progress: simulated ? 0.6 : 0.5 });
    // Render
    const result = await offlineCtx.startRendering();
    onProgress?.({ phase: 'done', progress: 1 });
    return result;
}
// ── Interpolation evaluation (mirrors SatieEngine.evalModulation) ──
function evalModulation(mod, elapsed, every) {
    return SatieEngine.evalModulation(mod, elapsed, every);
}
/**
 * Build the pre-spatialization part of a voice's graph:
 *   source → gain (envelope + volume/pitch automation) → scaleGain → [DSP]
 *          → [reverb dry attenuation]
 * Returns the source (caller schedules start/stop) and the DRY tail the caller
 * spatializes (panner, FOA encoder, or a bare stem tap). When `reverbPool` is
 * given, the voice's reverb send is wired into it here and never reaches the
 * caller's spatializer; `rooms` (the manifest's) supplies the room for a
 * voice that has no `reverb` of its own.
 */
function buildVoiceChain(ctx, voice, audioBuffer, reverbPool, rooms, calibrated = false, listenerPath) {
    const { stmt, startTime: t, voiceDuration } = voice;
    // A volume follow owns the gain param too — the envelope folds into its
    // steps. So does a trace: its gain curve is the engine's own level.
    const hasVolumeInterp = !!voice.trace || !!stmt.volumeInterpolation || !!stmt.groupVolumeModulation || !!stmt.volumeFollow;
    const voiceRng = mulberry32(voice.voiceRngSeed);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.setValueAtTime(voice.pitch, t);
    if (stmt.kind === 'loop')
        source.loop = true;
    // Gain envelope: micro-fade / fade_in / fade_out. A traced voice carries
    // its envelope inside the trace curve on the post-DSP level node below, so
    // the envelope is only SAMPLED here (on a node that goes nowhere).
    const gain = ctx.createGain();
    const { fadeInDur, fadeOutDur } = scheduleGainEnvelope(voice.trace ? ctx.createGain() : gain, t, voiceDuration, voice, hasVolumeInterp);
    // Static attenuator for count-multiplied voices — matches live engine
    const scaleGain = ctx.createGain();
    scaleGain.gain.value = stmt.count > 1 ? 1 / Math.sqrt(stmt.count) : 1;
    if (!voice.trace) {
        scheduleParameterAutomation(gain, source, voice, t, voiceDuration, voice.volume, voice.pitch, fadeInDur, fadeOutDur, voiceRng);
    }
    const dsp = buildDSPChain(ctx, {
        filter: stmt.filterParams,
        distortion: stmt.distortionParams,
        delay: stmt.delayParams,
        eq: stmt.eqParams,
    });
    source.connect(gain);
    gain.connect(scaleGain);
    let tail = scaleGain;
    if (dsp) {
        scaleGain.connect(dsp.input);
        tail = dsp.output;
    }
    // Reverb send — mirrors the live engine (SatieEngine.createVoice): the send
    // level is distance-independent and the bus output skips spatialization
    // entirely, so the reverberant field neither fades nor localizes. Callers
    // pass the pool whose destination is right for their render mode.
    //
    // The author-wins ladder, as live: the voice's own `reverb` (sampled here,
    // through the voice rng) > the room it is `in` > the script's first
    // declared `room` > the world room (`roomForVoice`). A voice with none of
    // them has no send at all — live its send gain is 0 and feeds nothing.
    // The engine's governed level (and the envelope) after the DSP chain —
    // TrackState.levelNode — BEFORE the reverb send is tapped, as live: the
    // room hears sources at their governed level, so a voice the HDR window
    // culled to nothing (or one mid fade-out) does not pour into the room.
    if (voice.trace) {
        const level = ctx.createGain();
        tail.connect(level);
        tail = level;
        scheduleTraceAutomation(level, source, voice, fadeInDur, fadeOutDur);
    }
    let reverbAutomation = null;
    let room = null;
    if (stmt.reverbParams) {
        room = {
            roomSize: stmt.reverbParams.roomSize.sample(voiceRng),
            damping: stmt.reverbParams.damping.sample(voiceRng),
            wet: stmt.reverbParams.dryWet.sample(voiceRng),
            scripted: true,
        };
    }
    else {
        room = roomForVoice(stmt, rooms);
    }
    if (room && reverbPool) {
        const bus = reverbPool.acquire(room.roomSize, room.damping);
        const send = ctx.createGain();
        send.gain.value = reverbSendGain(room.wet, room.roomSize, stmt.distanceProfile);
        const dry = ctx.createGain();
        // A script room trims the direct path by its wet; the world room does not
        // (live, an unscripted voice's reverbDry stays at 1 — only its send moves).
        dry.gain.value = room.scripted ? 1 - room.wet : 1;
        tail.connect(send);
        send.connect(bus.input);
        tail.connect(dry);
        tail = dry;
        // Only the voice's own `reverb wet` interpolates; a room has no automation.
        if (stmt.reverbParams)
            reverbAutomation = { send, dry, roomSize: room.roomSize };
        // Calibrated scenes: live the send is also scaled by the path's cost
        // (`_pathGain` — the distance law), so a far source feeds the room as
        // faintly as it arrives. The trace carries no path gain; the distance
        // law from the traced position is the same number.
        if (calibrated && !stmt.reverbParams)
            schedulePathGainOnSend(send, reverbSendGain(room.wet, room.roomSize, stmt.distanceProfile), voice, t, t + voiceDuration, listenerPath);
    }
    if (dsp || reverbAutomation) {
        scheduleDSPAutomation(dsp, stmt, t, voiceDuration, voiceRng, reverbAutomation);
    }
    // The engine's muffle chain (occlusion, zone, foliage, air absorption),
    // replayed from the trace. Live it sits after the panner on the point leg
    // and the wide leg takes only the level; here it sits on the dry tail so
    // both legs share it and the reverb send (tapped above) stays unmuffled,
    // as live. Built only when the trace ever muffles, like the engine.
    if (voice.trace) {
        // The engine's muffle chain (occlusion, zone, foliage, air absorption),
        // replayed from the trace. Live it sits after the panner on the point leg
        // and the wide leg takes only the level; here it sits on the dry tail so
        // both legs share it and the reverb send (tapped above, post-level) stays
        // unmuffled, as live. Built only when the trace ever muffles.
        const muffled = scheduleTraceMuffle(ctx, voice, tail);
        if (muffled)
            tail = muffled;
    }
    else if (stmt.occlusionBase > 0) {
        // Sampled (un-simulated) voices: authored occlusion (`occlusion 0.6`): the live engine's muffle at rest —
        // lowpass + level cut on the DIRECT path only. The reverb send above is
        // tapped pre-occlusion, as in SatieEngine (a wall muffles what reaches you
        // straight, not the room's field). Static: `occlusion follow` reads runtime
        // signals the export has none of, so the base value holds; geometry
        // raycasts and zone isolation are live-only.
        const { cutoffHz, gain: occGain } = occlusionMuffleParams(stmt.occlusionBase);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = cutoffHz;
        lp.Q.value = 0.0001;
        const og = ctx.createGain();
        og.gain.value = occGain;
        tail.connect(lp);
        lp.connect(og);
        tail = og;
    }
    // Bed colour (spec 006): the same high shelf the live engine puts on a bed's wide leg.
    if (stmt.bed && bedTiltDb(stmt.tilt) !== 0) {
        const shelf = ctx.createBiquadFilter();
        shelf.type = 'highshelf';
        shelf.frequency.value = BED_SHELF_HZ;
        shelf.gain.value = bedTiltDb(stmt.tilt);
        tail.connect(shelf);
        tail = shelf;
    }
    return { source, tail };
}
// ── Trace playback (SceneSimulation) ────────────────────────
/** Ramp targets must strictly increase in time; collapse points closer than this. */
const RAMP_MIN_GAP_S = 1e-4;
/**
 * Drive an AudioParam along a sampled curve: an anchor at the start, then a
 * linear ramp to every point. Ramps rather than 30 Hz steps — stepped gain
 * on broadband material zips audibly, and a Doppler shift is continuous.
 */
function rampAlong(param, points) {
    if (!points.length)
        return;
    param.setValueAtTime(points[0].v, points[0].t);
    let last = points[0].t;
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (p.t - last < RAMP_MIN_GAP_S)
            continue;
        param.linearRampToValueAtTime(p.v, p.t);
        last = p.t;
    }
}
/** Frame times of the render's automation grid across a voice, plus the envelope's own knees. */
function traceTimes(voice, fadeInDur, fadeOutDur) {
    const { startTime: t, voiceDuration } = voice;
    const end = t + voiceDuration;
    const times = [t];
    if (fadeInDur > 0 && fadeInDur < voiceDuration)
        times.push(t + fadeInDur);
    if (fadeOutDur > 0 && voiceDuration - fadeOutDur > fadeInDur)
        times.push(end - fadeOutDur);
    for (let at = t + AUTOMATION_STEP; at < end; at += AUTOMATION_STEP)
        times.push(at);
    times.push(end);
    return times.sort((a, b) => a - b);
}
/**
 * Gain and playbackRate from the trace: the engine's level (modulation ×
 * activity × follow) with the fade envelope folded in, and its rate (pitch ×
 * Doppler). What `scheduleParameterAutomation` computes for sampled voices,
 * read instead of re-derived.
 */
function scheduleTraceAutomation(gain, source, voice, fadeInDur, fadeOutDur) {
    const trace = voice.trace;
    const { startTime: t, voiceDuration } = voice;
    const times = traceTimes(voice, fadeInDur, fadeOutDur);
    const gains = [];
    const rates = [];
    for (const at of times) {
        const elapsed = at - t;
        gains.push({ t: at, v: traceValueAt(voice, trace.gain, elapsed) * envelopeFactor(elapsed, voiceDuration, fadeInDur, fadeOutDur) });
        rates.push({ t: at, v: Math.max(0.01, traceValueAt(voice, trace.rate, elapsed)) });
    }
    rampAlong(gain.gain, gains);
    rampAlong(source.playbackRate, rates);
}
/**
 * The engine's occlusion / air-absorption muffle, replayed: a lowpass plus a
 * level cut, both following the trace. Returns the chain's output, or null
 * when the trace never muffles this voice (no nodes are built then — the
 * engine defers its chain the same way).
 */
function scheduleTraceMuffle(ctx, voice, input) {
    const trace = voice.trace;
    let needed = false;
    for (let i = 0; i < trace.cutoffHz.length; i++) {
        if (trace.cutoffHz[i] < OCCLUSION_OPEN_HZ * 0.975 || trace.muffleGain[i] < 0.995) {
            needed = true;
            break;
        }
    }
    if (!needed)
        return null;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.0001;
    const level = ctx.createGain();
    const { startTime: t, voiceDuration } = voice;
    const cut = [];
    const lvl = [];
    const end = t + voiceDuration;
    for (let at = t; at < end; at += AUTOMATION_STEP) {
        const elapsed = at - t;
        cut.push({ t: at, v: Math.max(20, traceValueAt(voice, trace.cutoffHz, elapsed)) });
        lvl.push({ t: at, v: traceValueAt(voice, trace.muffleGain, elapsed) });
    }
    rampAlong(filter.frequency, cut);
    rampAlong(level.gain, lvl);
    input.connect(filter);
    filter.connect(level);
    return level;
}
/**
 * The panner rolloff a voice's extent asks for — the live engine's rule: a
 * `field` source keeps its direction without distance falloff, a `line`
 * uses reduced inverse rolloff, consistently in both rendering legs.
 */
function rolloffFor(voice) {
    const ext = voice.trace ? voice.trace.extent : voice.stmt;
    if (ext.field)
        return 0;
    return distanceRolloff(!!ext.line, voice.stmt.distanceProfile);
}
/**
 * The offline muffle for an authored `occlusion` value: the live law
 * (`applyMuffle`) with no zone, foliage or distance term — lowpass cutoff and
 * direct-path gain. Exported so the number the export bakes is testable.
 */
export function occlusionMuffleParams(occlusion01) {
    return { cutoffHz: occlusionCutoffHz(occlusion01), gain: occlusionGain(occlusion01) };
}
// ── Stereo / Binaural rendering ─────────────────────────────
function renderStereoOrBinaural(ctx, manifest, buffers, duration, mode, listenerPath, outputGain = .5) {
    // Master gain + limiter matching live engine
    const masterGain = ctx.createGain();
    masterGain.gain.value = outputGain; // -6 dB headroom — matches live engine
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.0005;
    limiter.release.value = 0.05;
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);
    // Room buses land on the master, never through a panner — same as live.
    const reverbPool = new ReverbBusPool(ctx, masterGain);
    // Shared decorrelated wide bus — offline mirror of the live engine's.
    const wideBus = createWideBus(ctx);
    wideBus.output.connect(masterGain);
    let sourcesScheduled = 0;
    for (const voice of manifest.voices) {
        const { startTime: t, voiceDuration } = voice;
        const audioBuffer = resolveBuffer(buffers, voice, ctx);
        if (!audioBuffer)
            continue;
        const { source, tail } = buildVoiceChain(ctx, voice, audioBuffer, reverbPool, manifest.rooms, manifestCalibrated(manifest), listenerPath);
        const ext = sampleVoiceExtent(voice);
        // Panner — matched to live engine
        const panner = ctx.createPanner();
        panner.panningModel = mode === 'binaural' ? 'HRTF' : 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = PANNER_REF_M;
        // No maxDistance — inert under `inverse` (linear formula only), and the
        // live engine no longer sets it either. See WorldAcoustics.
        panner.rolloffFactor = rolloffFor(voice); // match live engine (field 0, line 1, else 2)
        // Point/wide split — matched to live engine (SourceExtent).
        const pointGain = ctx.createGain();
        const wideGain = ctx.createGain();
        tail.connect(pointGain);
        pointGain.connect(panner);
        tail.connect(wideGain);
        wideGain.connect(wideBus.input);
        panner.connect(masterGain);
        const voiceEnd = Math.min(t + voiceDuration, duration);
        if (ext.bed) {
            // Non-localized: wide leg only, no distance behavior, no positions.
            pointGain.gain.setValueAtTime(0, t);
            wideGain.gain.setValueAtTime(1, t);
        }
        else {
            // Set initial position at voice start time (scene frame → playback frame)
            const pos = sourceForPlayback(voice, t, t, listenerPath);
            panner.positionX.setValueAtTime(pos.x, t);
            panner.positionY.setValueAtTime(pos.y, t);
            panner.positionZ.setValueAtTime(pos.z, t);
            // An animated size is shaped even when it starts at zero, and always
            // needs automation — the crossfade changes with no one moving.
            const shaped = ext.radiusM > 0 || ext.ringM > 0 || !!ext.line
                || !!ext.radiusMod || !!ext.ringMod;
            const moving = isMovingVoice(voice) || !!listenerPath?.length;
            if (moving || shaped) {
                // Extent automation owns the panner aim for shaped sources (closest
                // surface point); unshaped moving voices keep the plain position
                // scheduler. A listener path makes even a still source move relative
                // to the ears, so it needs automation exactly as a moving one does.
                if (!shaped && moving) {
                    schedulePannerPositions(panner, voice, t, voiceEnd, listenerPath);
                }
                scheduleExtentGains(pointGain, wideGain, shaped ? panner : null, voice, ext, t, voiceEnd, listenerPath);
            }
            else {
                const scratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
                const g = extentGainsAt(pos, ext, scratch, poseAt(listenerPath, t), t);
                pointGain.gain.setValueAtTime(g.point, t);
                wideGain.gain.setValueAtTime(g.wide, t);
            }
        }
        // Schedule start/stop — randomstart / count phase-stagger offsets match live
        source.start(t, voice.startOffset);
        source.stop(t + voiceDuration);
        sourcesScheduled++;
    }
    return sourcesScheduled;
}
// ── Ambisonic FOA rendering ─────────────────────────────────
function renderAmbisonic(ctx, manifest, buffers, duration, order, listenerPath, outputGain = .5) {
    // ACN-ordered merger: FOA W(0) Y(1) Z(2) X(3); order 2 appends ACN 4–8.
    const channels = ambisonicChannelCount(order);
    const merger = ctx.createChannelMerger(channels);
    // Master gain matching live engine
    const masterGain = ctx.createGain();
    masterGain.gain.value = outputGain;
    merger.connect(masterGain);
    masterGain.connect(ctx.destination);
    // A diffuse field carries no net direction, so the room bus encodes into W
    // (omni) alone and leaves every directional channel untouched. Encoding it
    // at the source's position instead would rebuild the very error the bus
    // exists to remove.
    const diffuseW = ctx.createGain();
    diffuseW.connect(merger, 0, 0);
    const reverbPool = new ReverbBusPool(ctx, diffuseW);
    let sourcesScheduled = 0;
    for (const voice of manifest.voices) {
        const { startTime: t, voiceDuration } = voice;
        const audioBuffer = resolveBuffer(buffers, voice, ctx);
        if (!audioBuffer)
            continue;
        const { source, tail: dspOut } = buildVoiceChain(ctx, voice, audioBuffer, reverbPool, manifest.rooms, manifestCalibrated(manifest), listenerPath);
        const ext = sampleVoiceExtent(voice);
        // One gain node per ACN channel.
        const pos = sourceForPlayback(voice, t, t, listenerPath);
        const gains = computeHOAGains(pos.x, pos.y, pos.z, order);
        const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        // Source extent in the SH domain: a wide source loses direction, not
        // level — order-n components scale by the point factor to the nth power
        // (higher orders sharpen the image, so they collapse first as it widens).
        // A bed is pure omni at unit level.
        const scratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
        const eg = ext.bed
            ? { point: 0, wide: 1, aimed: false }
            : extentGainsAt(pos, ext, scratch, poseAt(listenerPath, t), t);
        const atten = ext.bed ? 1 : distanceAttenuation(dist, PANNER_REF_M, rolloffFor(voice)); // match live engine rolloff
        const chGains = [];
        for (let ch = 0; ch < channels; ch++) {
            const g = ctx.createGain();
            g.gain.setValueAtTime(gains[ch] * atten * Math.pow(eg.point, acnOrder(ch)), t);
            dspOut.connect(g);
            g.connect(merger, 0, ch);
            chGains.push(g);
        }
        // Schedule position-based gain automation for moving sources (beds have
        // no position — their static pure-W encoding stands).
        if (!ext.bed && (isMovingVoice(voice) || listenerPath?.length || extentIsAnimated(ext))) {
            scheduleAmbisonicPositions(chGains, order, voice, ext, t, Math.min(t + voiceDuration, duration), listenerPath);
        }
        // Schedule — randomstart / count phase-stagger offsets match live
        source.start(t, voice.startOffset);
        source.stop(t + voiceDuration);
        sourcesScheduled++;
    }
    return sourcesScheduled;
}
// ── Speaker-layout rendering (quad / 7.1.2 / 7.1.4) ─────────
function renderSpeakerLayout(ctx, manifest, buffers, duration, layout, listenerPath, outputGain = .5) {
    const channels = layout.length;
    const merger = ctx.createChannelMerger(channels);
    const masterGain = ctx.createGain();
    masterGain.gain.value = outputGain;
    merger.connect(masterGain);
    masterGain.connect(ctx.destination);
    // Diffuse (reverb) energy fans equally over the non-center ear speakers —
    // the layout mirror of the FOA path's W-only rule. LFE stays silent.
    const diffuse = ctx.createGain();
    const dFan = diffuseFanout(layout);
    for (let ch = 0; ch < channels; ch++) {
        if (dFan[ch] <= 0)
            continue;
        const g = ctx.createGain();
        g.gain.value = dFan[ch];
        diffuse.connect(g);
        g.connect(merger, 0, ch);
    }
    const reverbPool = new ReverbBusPool(ctx, diffuse);
    // Shared decorrelated wide bus: left leg to left-hemisphere ear speakers,
    // right leg to the right (see SpeakerLayouts.wideBusFanout).
    const wideBus = createWideBus(ctx);
    const wideSplit = ctx.createChannelSplitter(2);
    wideBus.output.connect(wideSplit);
    const fan = wideBusFanout(layout);
    for (let ch = 0; ch < channels; ch++) {
        if (fan.left[ch] > 0) {
            const g = ctx.createGain();
            g.gain.value = fan.left[ch];
            wideSplit.connect(g, 0);
            g.connect(merger, 0, ch);
        }
        if (fan.right[ch] > 0) {
            const g = ctx.createGain();
            g.gain.value = fan.right[ch];
            wideSplit.connect(g, 1);
            g.connect(merger, 0, ch);
        }
    }
    let sourcesScheduled = 0;
    for (const voice of manifest.voices) {
        const { startTime: t, voiceDuration } = voice;
        const audioBuffer = resolveBuffer(buffers, voice, ctx);
        if (!audioBuffer)
            continue;
        const { source, tail: dspOut } = buildVoiceChain(ctx, voice, audioBuffer, reverbPool, manifest.rooms, manifestCalibrated(manifest), listenerPath);
        const ext = sampleVoiceExtent(voice);
        // Point leg: one gain per speaker channel. Wide leg: one send into the
        // shared decorrelated bus — the same split as stereo/binaural.
        const wideGain = ctx.createGain();
        wideGain.gain.value = 0;
        dspOut.connect(wideGain);
        wideGain.connect(wideBus.input);
        const chGains = [];
        for (let ch = 0; ch < channels; ch++) {
            const g = ctx.createGain();
            g.gain.value = 0;
            dspOut.connect(g);
            g.connect(merger, 0, ch);
            chGains.push(g);
        }
        const voiceEnd = Math.min(t + voiceDuration, duration);
        if (ext.bed) {
            wideGain.gain.setValueAtTime(1, t);
        }
        else if (isMovingVoice(voice) || listenerPath?.length || extentIsAnimated(ext)) {
            scheduleSpeakerPositions(chGains, wideGain, layout, voice, ext, t, voiceEnd, listenerPath);
        }
        else {
            const pos = sourceForPlayback(voice, t, t, listenerPath);
            writeSpeakerGains(chGains, wideGain, layout, pos, ext, t, true, rolloffFor(voice), poseAt(listenerPath, t));
        }
        source.start(t, voice.startOffset);
        source.stop(t + voiceDuration);
        sourcesScheduled++;
    }
    return sourcesScheduled;
}
/** A calibrated scene: any voice states an emission (`spl`) — the live engine's `_calibrated`. */
function manifestCalibrated(manifest) {
    return manifest.voices.some(v => !v.stmt.spl.isNull);
}
/** Scale a room send by the distance law along the render — the live `_pathGain` on a calibrated scene. */
function schedulePathGainOnSend(send, base, voice, startTime, endTime, path) {
    const rolloff = rolloffFor(voice);
    let first = true;
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const pos = sourceForPlayback(voice, t, startTime, path);
        const d = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        const v = base * distanceAttenuation(d, PANNER_REF_M, rolloff);
        if (first)
            send.gain.setValueAtTime(v, t);
        else
            send.gain.linearRampToValueAtTime(v, t);
        first = false;
    }
}
/** One automation write of the speaker point gains + wide send. */
function writeSpeakerGains(chGains, wideGain, layout, pos, ext, t, anchor, rolloff, pose = DEFAULT_LISTENER_POSE) {
    const scratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
    const eg = extentGainsAt(pos, ext, scratch, pose, t);
    const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    const atten = distanceAttenuation(dist, PANNER_REF_M, rolloff);
    const sg = speakerGains(layout, pos.x, pos.y, pos.z);
    for (let ch = 0; ch < chGains.length; ch++) {
        const v = sg[ch] * atten * eg.point;
        if (anchor)
            chGains[ch].gain.setValueAtTime(v, t);
        else
            chGains[ch].gain.linearRampToValueAtTime(v, t);
    }
    if (anchor)
        wideGain.gain.setValueAtTime(eg.wide, t);
    else
        wideGain.gain.linearRampToValueAtTime(eg.wide, t);
}
function scheduleSpeakerPositions(chGains, wideGain, layout, voice, ext, startTime, endTime, path) {
    let first = true;
    const rolloff = rolloffFor(voice);
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const pos = sourceForPlayback(voice, t, startTime, path);
        writeSpeakerGains(chGains, wideGain, layout, pos, ext, t, first, rolloff, poseAt(path, t));
        first = false;
    }
}
// ── Per-object stem rendering (ADM/USDZ export) ─────────────
/** OfflineAudioContext channel ceiling is implementation-defined; probe it. */
function maxStemBatchSize(sampleRate) {
    for (const size of [32, 16, 8, 2]) {
        try {
            // Constructing is enough to validate the channel count.
            void new OfflineAudioContext(size, 1, sampleRate);
            return size;
        }
        catch {
            // try smaller
        }
    }
    return 1;
}
export async function renderObjectStems(manifest, buffers, duration, sampleRate, onProgress, listenerPath, opts = {}) {
    const voices = manifest.voices;
    const stems = new Array(voices.length);
    if (voices.length === 0)
        return stems;
    const bakeDistance = opts.bakeDistance ?? true;
    // The baked distance law is listener-relative: along a path a static
    // source's range changes, so it is automated like a mover's.
    const path = listenerPath && listenerPath.length ? listenerPath : undefined;
    const rangeAt = (voice, at, t) => {
        const p = toListenerFrame(positionAt(voice, at - t), poseAt(path, at));
        return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    };
    const batchSize = maxStemBatchSize(sampleRate);
    const frameCount = Math.ceil(sampleRate * duration);
    for (let batchStart = 0; batchStart < voices.length; batchStart += batchSize) {
        const batch = voices.slice(batchStart, batchStart + batchSize);
        const ctx = new OfflineAudioContext(batch.length, frameCount, sampleRate);
        ctx.destination.channelInterpretation = 'discrete';
        const merger = ctx.createChannelMerger(batch.length);
        merger.connect(ctx.destination);
        for (let i = 0; i < batch.length; i++) {
            const voice = batch[i];
            const { startTime: t, voiceDuration } = voice;
            const audioBuffer = resolveBuffer(buffers, voice, ctx);
            if (!audioBuffer)
                continue; // manifest guarantees presence; belt and braces
            // 0.5 reproduces the live master gain (linear, distributes over the sum).
            const masterEquivalent = ctx.createGain();
            masterEquivalent.gain.value = 0.5;
            // One bus per stem, landing after the baked distance attenuation the
            // reverberant field must not receive. Convolution is linear, so summing
            // per-voice buses reproduces the shared bus of the stereo master exactly.
            const reverbPool = new ReverbBusPool(ctx, masterEquivalent);
            const { source, tail } = buildVoiceChain(ctx, voice, audioBuffer, reverbPool, manifest.rooms, manifestCalibrated(manifest), path);
            // Baked distance attenuation (matches the live/stereo distance model).
            const distGain = ctx.createGain();
            const end = Math.min(t + voiceDuration, duration);
            const rolloff = rolloffFor(voice);
            if (!bakeDistance) {
                // Game-engine stems: the host's AudioSource applies its own rolloff
                // from the manifest's real-metre positions, so the stem stays at 1 m.
                distGain.gain.value = 1;
            }
            else if (isMovingVoice(voice) || path) {
                let first = true;
                for (let at = t; at < end; at += AUTOMATION_STEP) {
                    const atten = distanceAttenuation(rangeAt(voice, at, t), PANNER_REF_M, rolloff);
                    if (first) {
                        distGain.gain.setValueAtTime(atten, at);
                        first = false;
                    }
                    else {
                        distGain.gain.linearRampToValueAtTime(atten, at);
                    }
                }
            }
            else {
                distGain.gain.value = distanceAttenuation(rangeAt(voice, t, t), PANNER_REF_M, rolloff);
            }
            tail.connect(distGain);
            distGain.connect(masterEquivalent);
            masterEquivalent.connect(merger, 0, i);
            source.start(t, voice.startOffset);
            source.stop(t + voiceDuration);
        }
        const rendered = await ctx.startRendering();
        for (let i = 0; i < batch.length; i++) {
            stems[batchStart + i] = rendered.getChannelData(i);
        }
        onProgress?.(Math.min(1, (batchStart + batch.length) / voices.length));
    }
    return stems;
}
// ── Parameter automation (volume, pitch interpolation) ──────
function scheduleParameterAutomation(gain, source, voice, startTime, voiceDuration, baseVolume, basePitch, fadeInDur, fadeOutDur, rng) {
    const stmt = voice.stmt;
    const endTime = startTime + voiceDuration;
    // A `follow` binding owns its property — interpolation is ignored for it,
    // matching the live engine's precedence.
    const hasVolumeInterp = (!!stmt.volumeInterpolation || !!stmt.groupVolumeModulation) && !stmt.volumeFollow;
    const hasPitchInterp = (!!stmt.pitchInterpolation || !!stmt.groupPitchModulation) && !stmt.pitchFollow;
    const moving = isMovingVoice(voice);
    // Doppler needs radial motion — static voices have none against the fixed
    // offline listener.
    const hasDoppler = moving && stmt.dopplerStrength > 0;
    const hasFollow = !!stmt.volumeFollow || !!stmt.pitchFollow;
    if (!hasVolumeInterp && !hasPitchInterp && !hasFollow && !hasDoppler)
        return;
    // Modulation cycle lengths come from the rep-independent rng: modulation
    // elapsed is measured from spawnTime (below), so all `every` repetitions
    // of a copy must agree on the cycle or the shared fade tears per retrigger.
    const modRng = mulberry32(voice.modRngSeed);
    const volumeEvery = stmt.volumeInterpolation ? stmt.volumeInterpolation.every.sample(modRng) : 0;
    const groupVolEvery = stmt.groupVolumeModulation ? stmt.groupVolumeModulation.every.sample(modRng) : 0;
    const pitchEvery = stmt.pitchInterpolation ? stmt.pitchInterpolation.every.sample(modRng) : 0;
    const groupPitchEvery = stmt.groupPitchModulation ? stmt.groupPitchModulation.every.sample(modRng) : 0;
    // Signals against the sampled path's listener: standing at
    // DEFAULT_LISTENER_POSE (origin, ear height), facing "ahead" (+Z in the
    // scene frame — the playback-frame flip happens at the panner, not here).
    // `speed` is always 0 and a listener path is not applied here: scripts with
    // `follow` bindings always take the trace path (needsSimulation), where the
    // engine computes these against the real listener; this branch is reached
    // only with `simulate: false` forced, or for Doppler on the sampled path.
    const staticPos = moving ? null : toListenerFrame(positionAt(voice, 0), DEFAULT_LISTENER_POSE);
    let prevDist = -1;
    let dist = 0;
    let radialV = 0; // + = receding, same convention as the live engine
    let gaze = 0;
    const signalAt = (b) => {
        switch (b.signal) {
            case 'distance': return dist;
            case 'closing': return -radialV;
            case 'speed': return 0;
            case 'gaze': return gaze;
            default: return NaN;
        }
    };
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const elapsed = t - startTime;
        // Modulation elapsed matches the live engine: measured from when the COPY
        // first sounded, never reset by `every` retriggers. `elapsed` (per-rep)
        // stays for the fade envelope and motion below.
        const modElapsed = t - voice.spawnTime;
        if (hasFollow || hasDoppler) {
            const p = moving ? toListenerFrame(positionAt(voice, elapsed), DEFAULT_LISTENER_POSE) : staticPos;
            dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
            radialV = prevDist >= 0 ? (dist - prevDist) / AUTOMATION_STEP : 0;
            prevDist = dist;
            gaze = dist > 1e-4 ? p.z / dist : 0;
        }
        if (hasVolumeInterp || stmt.volumeFollow) {
            let vol;
            if (stmt.volumeFollow) {
                const x = signalAt(stmt.volumeFollow);
                vol = isNaN(x) ? baseVolume : mapFollow(stmt.volumeFollow, x);
            }
            else {
                vol = stmt.volumeInterpolation
                    ? evalModulation(stmt.volumeInterpolation, modElapsed, volumeEvery)
                    : baseVolume;
                if (stmt.groupVolumeModulation) {
                    vol *= evalModulation(stmt.groupVolumeModulation, modElapsed, groupVolEvery);
                }
            }
            // The automation steps own the gain param, so the fade envelope must
            // be folded in here — separate ramps would be overwritten by these steps.
            gain.gain.setValueAtTime(vol * envelopeFactor(elapsed, voiceDuration, fadeInDur, fadeOutDur), t);
        }
        if (hasPitchInterp || stmt.pitchFollow || hasDoppler) {
            let p;
            if (stmt.pitchFollow) {
                const x = signalAt(stmt.pitchFollow);
                p = isNaN(x) ? basePitch : mapFollow(stmt.pitchFollow, x);
            }
            else if (hasPitchInterp) {
                p = stmt.pitchInterpolation
                    ? evalModulation(stmt.pitchInterpolation, modElapsed, pitchEvery)
                    : basePitch;
                if (stmt.groupPitchModulation) {
                    p *= evalModulation(stmt.groupPitchModulation, modElapsed, groupPitchEvery);
                }
            }
            else {
                p = basePitch;
            }
            // Doppler composes with musical pitch — same as the live engine.
            if (hasDoppler)
                p *= dopplerRatio(radialV * stmt.dopplerStrength);
            source.playbackRate.setValueAtTime(p, t);
        }
    }
}
// ── DSP parameter automation ────────────────────────────────
function scheduleDSPAutomation(dsp, stmt, startTime, voiceDuration, rng, reverb) {
    if (!dsp && !reverb)
        return;
    const endTime = startTime + voiceDuration;
    // Pre-cache every durations
    const fp = stmt.filterParams;
    const dp = stmt.distortionParams;
    const dlp = stmt.delayParams;
    const rp = stmt.reverbParams;
    const eq = stmt.eqParams;
    const hasFilterInterp = fp && (fp.cutoffInterpolation || fp.resonanceInterpolation || fp.dryWetInterpolation);
    const hasDistInterp = dp && (dp.driveInterpolation || dp.dryWetInterpolation);
    const hasDelayInterp = dlp && (dlp.timeInterpolation || dlp.feedbackInterpolation || dlp.dryWetInterpolation);
    const hasReverbInterp = rp && rp.dryWetInterpolation;
    const hasEqInterp = eq && (eq.lowGainInterpolation || eq.midGainInterpolation || eq.highGainInterpolation);
    if (!hasFilterInterp && !hasDistInterp && !hasDelayInterp && !hasReverbInterp && !hasEqInterp)
        return;
    // Cache every values
    const filterCutoffEvery = fp?.cutoffInterpolation?.every.sample(rng) ?? 0;
    const filterResEvery = fp?.resonanceInterpolation?.every.sample(rng) ?? 0;
    const filterDWEvery = fp?.dryWetInterpolation?.every.sample(rng) ?? 0;
    const distDriveEvery = dp?.driveInterpolation?.every.sample(rng) ?? 0;
    const distDWEvery = dp?.dryWetInterpolation?.every.sample(rng) ?? 0;
    const delayTimeEvery = dlp?.timeInterpolation?.every.sample(rng) ?? 0;
    const delayFbEvery = dlp?.feedbackInterpolation?.every.sample(rng) ?? 0;
    const delayDWEvery = dlp?.dryWetInterpolation?.every.sample(rng) ?? 0;
    const reverbDWEvery = rp?.dryWetInterpolation?.every.sample(rng) ?? 0;
    const eqLowEvery = eq?.lowGainInterpolation?.every.sample(rng) ?? 0;
    const eqMidEvery = eq?.midGainInterpolation?.every.sample(rng) ?? 0;
    const eqHighEvery = eq?.highGainInterpolation?.every.sample(rng) ?? 0;
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const elapsed = t - startTime;
        // Filter automation (0-1 → real ranges)
        if (hasFilterInterp && dsp?.filterRef) {
            if (fp.cutoffInterpolation) {
                dsp.filterRef.filter.frequency.setValueAtTime(mapCutoff(evalModulation(fp.cutoffInterpolation, elapsed, filterCutoffEvery)), t);
            }
            if (fp.resonanceInterpolation) {
                dsp.filterRef.filter.Q.setValueAtTime(mapResonance(evalModulation(fp.resonanceInterpolation, elapsed, filterResEvery)), t);
            }
            if (fp.dryWetInterpolation) {
                const w = clamp01(evalModulation(fp.dryWetInterpolation, elapsed, filterDWEvery));
                dsp.filterRef.wet.gain.setValueAtTime(w, t);
                dsp.filterRef.dry.gain.setValueAtTime(1 - w, t);
            }
        }
        // Distortion automation
        if (hasDistInterp && dsp?.distortionRef) {
            if (dp.driveInterpolation) {
                const drive = mapDrive(evalModulation(dp.driveInterpolation, elapsed, distDriveEvery));
                dsp.distortionRef.shaper.curve = makeDistortionCurve(dsp.distortionRef.mode, drive);
            }
            if (dp.dryWetInterpolation) {
                const w = clamp01(evalModulation(dp.dryWetInterpolation, elapsed, distDWEvery));
                dsp.distortionRef.wet.gain.setValueAtTime(w, t);
                dsp.distortionRef.dry.gain.setValueAtTime(1 - w, t);
            }
        }
        // Delay automation
        if (hasDelayInterp && dsp?.delayRef) {
            if (dlp.timeInterpolation) {
                const val = evalModulation(dlp.timeInterpolation, elapsed, delayTimeEvery);
                for (const d of dsp.delayRef.delays) {
                    d.delayTime.setValueAtTime(val, t);
                }
            }
            if (dlp.feedbackInterpolation) {
                dsp.delayRef.fbGain.gain.setValueAtTime(evalModulation(dlp.feedbackInterpolation, elapsed, delayFbEvery), t);
            }
            if (dlp.dryWetInterpolation) {
                const w = clamp01(evalModulation(dlp.dryWetInterpolation, elapsed, delayDWEvery));
                dsp.delayRef.wet.gain.setValueAtTime(w, t);
                dsp.delayRef.dry.gain.setValueAtTime(1 - w, t);
            }
        }
        // Reverb automation — send keeps its critical-distance scaling (see
        // WorldAcoustics.reverbSendGain), so wetness moves without shifting the
        // distance at which direct and reverberant energy cross over.
        if (hasReverbInterp && reverb) {
            const w = clamp01(evalModulation(rp.dryWetInterpolation, elapsed, reverbDWEvery));
            reverb.send.gain.setValueAtTime(reverbSendGain(w, reverb.roomSize, stmt.distanceProfile), t);
            reverb.dry.gain.setValueAtTime(1 - w, t);
        }
        // EQ automation (0-1 → -12dB to +12dB)
        if (hasEqInterp && dsp?.eqRef) {
            if (eq.lowGainInterpolation) {
                dsp.eqRef.low.gain.setValueAtTime(mapEQGain(evalModulation(eq.lowGainInterpolation, elapsed, eqLowEvery)), t);
            }
            if (eq.midGainInterpolation) {
                dsp.eqRef.mid.gain.setValueAtTime(mapEQGain(evalModulation(eq.midGainInterpolation, elapsed, eqMidEvery)), t);
            }
            if (eq.highGainInterpolation) {
                dsp.eqRef.high.gain.setValueAtTime(mapEQGain(evalModulation(eq.highGainInterpolation, elapsed, eqHighEvery)), t);
            }
        }
    }
}
// ── Position scheduling ─────────────────────────────────────
/** Does this voice's position change over its life? A trace answers from its own frames. */
function isMovingVoice(voice) {
    if (voice.trace)
        return !isStaticMotion(voice);
    const stmt = voice.stmt;
    return isTrajectoryWanderType(stmt.wanderType)
        || stmt.wanderType === WanderType.Walk
        || stmt.wanderType === WanderType.Fly;
}
function schedulePannerPositions(panner, voice, startTime, endTime, path) {
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const pos = sourceForPlayback(voice, t, startTime, path);
        panner.positionX.setValueAtTime(pos.x, t);
        panner.positionY.setValueAtTime(pos.y, t);
        panner.positionZ.setValueAtTime(pos.z, t);
    }
}
/**
 * Sample a voice's extent shape once per render. Draws from a sub-seed
 * disjoint from voiceRngSeed's stream so adding extent to a script never
 * shifts any other sampled value in a seeded render.
 */
export function sampleVoiceExtent(voice) {
    const stmt = voice.stmt;
    const rng = mulberry32((voice.voiceRngSeed ^ 0x5e77) >>> 0);
    const traced = voice.trace?.extent.lineSource;
    // A modulated size owns the parameter, exactly as live: its first value is
    // the size at t=0 and `extentSizeAt` drives it from there.
    return {
        radiusM: (stmt.radiusInterpolation
            ? Math.max(0, stmt.radiusInterpolation.minValue)
            : (stmt.radius.isNull ? 0 : Math.max(0, stmt.radius.sample(rng)))) * stmt.scaleFactor,
        ringM: (stmt.ringInterpolation
            ? Math.max(0, stmt.ringInterpolation.minValue)
            : (stmt.ringRadius.isNull ? 0 : Math.max(0, stmt.ringRadius.sample(rng)))) * stmt.scaleFactor,
        bed: stmt.bed,
        distanceProfile: stmt.distanceProfile,
        radiusMod: stmt.radiusInterpolation,
        ringMod: stmt.ringInterpolation,
        radiusEvery: stmt.radiusInterpolation ? stmt.radiusInterpolation.every.sample(rng) : 0,
        ringEvery: stmt.ringInterpolation ? stmt.ringInterpolation.every.sample(rng) : 0,
        spawn: voice.spawnTime,
        scale: stmt.scaleFactor,
        // Simulated voices carry the engine's line (a strip's centreline); a
        // sampled `line` voice is the long axis of its own box, as live.
        line: traced ?? (stmt.line && !stmt.hostRef ? lineFromBox(stmt.areaMin, stmt.areaMax) : null),
    };
}
const EXTENT_ORIGIN = { x: 0, y: 0, z: 0 };
/**
 * Does this voice's extent change on its own? An animated `radius`/`ring`
 * needs the same per-step automation a moving voice does — the crossfade
 * (and, for a shaped source, the panner aim) moves with nobody walking.
 */
function extentIsAnimated(ext) {
    return !!ext.radiusMod || !!ext.ringMod;
}
/** The listener's pose at `t` along a path, or `DEFAULT_LISTENER_POSE` (ear height at the origin) when there is none. */
function poseAt(path, t) {
    return path && path.length ? listenerPoseAt(path, t) : DEFAULT_LISTENER_POSE;
}
/**
 * Extent geometry at one listener-frame source position (listener at the
 * origin by construction). Returns the equal-power crossfade with the wide
 * leg's manual distance law folded in — the panner leg attenuates itself.
 */
/**
 * A voice's extent size at absolute playback time `t` — the constant it was
 * sampled with, or the modulation driving it. Offline mirror of the live
 * engine's `updateExtentSize`; elapsed is measured from spawn so every
 * retriggered copy agrees on the phase, as volume and pitch already do.
 */
export function extentSizeAt(ext, t) {
    if (!ext.radiusMod && !ext.ringMod)
        return { radiusM: ext.radiusM, ringM: ext.ringM };
    const elapsed = t - ext.spawn;
    return {
        radiusM: ext.radiusMod
            ? Math.max(0, evalModulation(ext.radiusMod, elapsed, ext.radiusEvery)) * ext.scale : ext.radiusM,
        ringM: ext.ringMod
            ? Math.max(0, evalModulation(ext.ringMod, elapsed, ext.ringEvery)) * ext.scale : ext.ringM,
    };
}
function extentGainsAt(pos, ext, scratch, pose = DEFAULT_LISTENER_POSE, t = 0) {
    let extent;
    let surface;
    let aimed = false;
    const { radiusM, ringM } = extentSizeAt(ext, t);
    if (ext.line) {
        // The line lives in scene frame; bring it into the listener's playback
        // frame (listener at the origin) exactly as the source position was.
        const poly = ext.line.polyline.map(v => toPlaybackFrame(toListenerFrame(v, pose)));
        sampleLineExtent({ polyline: poly, halfM: ext.line.halfM, reachM: ext.line.reachM }, EXTENT_ORIGIN, scratch);
        extent = scratch.extent;
        surface = scratch.surfaceDistM;
        aimed = true;
    }
    else if (ringM > 0) {
        const tube = Math.max(radiusM > 0 ? radiusM : 1, NEAR_FIELD_RADIUS_M);
        sampleRingExtent(pos, ringM, tube, EXTENT_ORIGIN, scratch);
        extent = scratch.extent;
        surface = scratch.surfaceDistM;
        aimed = true;
    }
    else if (radiusM > 0) {
        sampleSphereExtent(pos, Math.max(radiusM, NEAR_FIELD_RADIUS_M), EXTENT_ORIGIN, scratch);
        extent = scratch.extent;
        surface = scratch.surfaceDistM;
        aimed = true;
    }
    else {
        const d = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        extent = extentDeg(NEAR_FIELD_RADIUS_M, d);
        surface = d;
    }
    const g = crossfadeGains(extent);
    return { point: g.point, wide: g.wide * directPathGain(surface, !!ext.line, ext.distanceProfile), aimed };
}
/**
 * Automate the point/wide crossfade (and, for shaped sources, the panner aim
 * at the closest surface point) along the render. Mirrors the live engine at
 * the same 30 Hz automation rate the position scheduler uses.
 */
function scheduleExtentGains(pointGain, wideGain, panner, voice, ext, startTime, endTime, path) {
    const scratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const pos = sourceForPlayback(voice, t, startTime, path);
        const g = extentGainsAt(pos, ext, scratch, poseAt(path, t), t);
        pointGain.gain.setValueAtTime(g.point, t);
        wideGain.gain.setValueAtTime(g.wide, t);
        if (panner && g.aimed) {
            panner.positionX.setValueAtTime(scratch.aim.x, t);
            panner.positionY.setValueAtTime(scratch.aim.y, t);
            panner.positionZ.setValueAtTime(scratch.aim.z, t);
        }
    }
}
// ── Ambisonic position scheduling ───────────────────────────
function scheduleAmbisonicPositions(chGains, order, voice, ext, startTime, endTime, path) {
    let first = true;
    const scratch = { aim: { x: 0, y: 0, z: 0 }, surfaceDistM: 0, extent: 0 };
    for (let t = startTime; t < endTime; t += AUTOMATION_STEP) {
        const pos = sourceForPlayback(voice, t, startTime, path);
        const gains = computeHOAGains(pos.x, pos.y, pos.z, order);
        const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        const atten = distanceAttenuation(dist, PANNER_REF_M, rolloffFor(voice));
        // Source extent: directional components collapse toward omni as the
        // source wraps the listener (same crossfade law as the live engine);
        // order-n components scale by pointⁿ so higher orders collapse first.
        const dirScale = extentGainsAt(pos, ext, scratch, poseAt(path, t), t).point;
        // Ramp between points — stepped gains at 30 Hz produce audible zipper
        // noise on broadband material; offline has no CPU constraint, so ramp.
        for (let ch = 0; ch < chGains.length; ch++) {
            const v = gains[ch] * atten * Math.pow(dirScale, acnOrder(ch));
            if (first)
                chGains[ch].gain.setValueAtTime(v, t);
            else
                chGains[ch].gain.linearRampToValueAtTime(v, t);
        }
        first = false;
    }
}
// ── Helpers ─────────────────────────────────────────────────
/**
 * The take a voice plays: its trace-recorded buffer key when it has one, else
 * the statement's clip.
 *
 * A LOOP gets the same seamless treatment the live engine applies
 * (`dsp/SeamlessLoop`). Without it the renderer looped the raw buffer, so every
 * exported loop carried the click at the wrap that the live mix had already
 * fixed — the export did not sound like what was heard. The cache is shared
 * with the engine, so a buffer treated live is not treated again here.
 */
function resolveBuffer(buffers, voice, ctx) {
    let buf;
    if (voice.clip)
        buf = buffers.get(voice.clip);
    if (!buf) {
        const clip = voice.stmt.clip;
        buf = buffers.get(pathFor(clip)) ?? buffers.get(clip);
    }
    if (!buf || voice.stmt.kind !== 'loop' || !ctx)
        return buf;
    return seamlessLoopOf(buf, (channels, length, sampleRate) => {
        try {
            return ctx.createBuffer(channels, length, sampleRate);
        }
        catch {
            return null;
        }
    });
}
/**
 * Schedule the voice's gain envelope: 5ms anti-click micro-fade (or the
 * statement's `fade_in`) up to `volume`, and `fade_out` down to 0.
 *
 * When the voice has volume interpolation, the 30 Hz automation steps in
 * scheduleParameterAutomation own the gain param — scheduling ramps here too
 * would be overwritten, so this only computes the fade durations and the
 * envelope is folded into the automation via envelopeFactor.
 */
function scheduleGainEnvelope(gain, startTime, voiceDuration, voice, hasVolumeInterp) {
    const fadeInDur = Math.max(voice.fadeIn, 0.005);
    const fadeOutDur = voice.fadeOut;
    const volume = voice.volume;
    if (!hasVolumeInterp) {
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + Math.min(fadeInDur, voiceDuration));
        if (fadeOutDur > 0) {
            const fadeStart = startTime + voiceDuration - fadeOutDur;
            if (fadeStart > startTime + fadeInDur) {
                gain.gain.setValueAtTime(volume, fadeStart);
                gain.gain.linearRampToValueAtTime(0, startTime + voiceDuration);
            }
        }
    }
    return { fadeInDur, fadeOutDur };
}
/** Fade multiplier at `elapsed` seconds into a voice. Exported for tests. */
export function envelopeFactor(elapsed, voiceDuration, fadeInDur, fadeOutDur) {
    let f = fadeInDur > 0 ? Math.min(elapsed / fadeInDur, 1) : 1;
    if (fadeOutDur > 0) {
        const remaining = voiceDuration - elapsed;
        if (remaining < fadeOutDur)
            f *= Math.max(remaining / fadeOutDur, 0);
    }
    return f;
}
//# sourceMappingURL=OfflineRenderer.js.map