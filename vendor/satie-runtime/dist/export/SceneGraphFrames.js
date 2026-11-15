import { positionAt, traceValueAt } from './VoicePositions.js';
import { listenerPoseAt, toListenerFrame, rotateToListenerFrame, DEFAULT_LISTENER_POSE, ENVELOPING, } from './ListenerPath.js';
import { scenePositionToPolar, voiceLabel, SELD_DEFAULT_FPS } from './SeldAnnotations.js';
import { clipAudibleAt, resolveClipActivity, CLIP_ACTIVITY_THRESHOLD_DB } from './ClipActivity.js';
import { receivedSplDb, DEFAULT_SPL_DB } from '../spatial/LevelModel.js';
import { WanderType } from '../core/Statement.js';
export const SCENE_GRAPH_FORMAT = 'satie-scene-graph/2';
/**
 * What the trace path re-draws from the statement instead of reading from
 * the engine's run (the engine's own draws are not observable there): the
 * fade lengths (`SceneSimulation`), a start offset when the trace carries
 * none (`buildTraceManifest`), a voice's own `reverb` parameters, the extent
 * shape (`sampleVoiceExtent`) and DSP interpolation cycle lengths
 * (`buildVoiceChain`). All seeded from the trace seed, so deterministic, but
 * not the engine's numbers. The sampled path has no trace to disagree with.
 */
export const TRACE_RESAMPLED = Object.freeze(['fadeIn', 'fadeOut', 'startOffset', 'reverb', 'extent', 'dsp']);
function trajectoryId(v) {
    const s = v.stmt;
    switch (s.wanderType) {
        case WanderType.None:
        case WanderType.Fixed:
            return v.trace && !isTraceStatic(v) ? 'trace' : 'static';
        case WanderType.Custom:
            return `custom:${s.customTrajectoryName ?? '?'}`;
        default:
            return s.wanderType;
    }
}
/** A traced voice that never moved (within 1 mm) — hosted fixtures, placed voices. */
function isTraceStatic(v) {
    const p = v.trace?.positions;
    if (!p || p.length < 6)
        return true;
    for (let i = 3; i < p.length; i += 3) {
        if (Math.abs(p[i] - p[0]) > 1e-3 || Math.abs(p[i + 1] - p[1]) > 1e-3 || Math.abs(p[i + 2] - p[2]) > 1e-3)
            return false;
    }
    return true;
}
function round3(v) {
    return Math.round(v * 1000) / 1000;
}
function finiteOrNull(v) {
    return v === undefined || !Number.isFinite(v) ? null : round3(v);
}
/**
 * The source's scene-frame velocity `elapsed` seconds in, as a central
 * difference of `positionAt` over `h` either side, falling back to a
 * one-sided difference at the voice's first and last `h`. Exported for tests.
 */
export function velocityAt(v, elapsed, h) {
    const lo = Math.max(0, elapsed - h);
    const hi = Math.min(v.voiceDuration, elapsed + h);
    const span = hi - lo;
    if (!(span > 0))
        return { x: 0, y: 0, z: 0 };
    const a = positionAt(v, lo);
    const b = positionAt(v, hi);
    return { x: (b.x - a.x) / span, y: (b.y - a.y) / span, z: (b.z - a.z) / span };
}
/** The scene frame a path's keyframes declare (`three` when any says so), else Satie's. */
export function sceneFrameOf(path) {
    return path?.some((k) => k.coordinateFrame === 'three') ? 'three' : 'satie';
}
/** Sample the manifest into per-frame scene-graph ground truth. */
export function buildSceneGraph(manifest, options = {}) {
    const fps = options.fps ?? SELD_DEFAULT_FPS;
    if (!(fps > 0))
        throw new Error(`scene-graph fps must be positive, got ${fps}`);
    const path = options.listenerPath && options.listenerPath.length ? options.listenerPath : [];
    const sceneRoomName = options.scene?.rooms[0]?.name ?? null;
    const measured = options.measured;
    if (measured && measured.fps !== fps)
        throw new Error(`measured stem levels are at ${measured.fps} fps, the scene graph at ${fps}`);
    const frame = options.coordinateFrame ?? sceneFrameOf(path);
    // Half a label frame either side: the derivative over the frame's own window.
    const dvH = 0.5 / fps;
    const sources = manifest.voices.map((v, index) => {
        const s = v.stmt;
        const ext = v.trace?.extent;
        const sourceId = v.sourceId ?? s.sourceId ?? null;
        const objectId = v.objectId ?? s.hostRef ?? (v.entity ? `entity:${v.entity}:${v.instance}` : null);
        const emitterId = JSON.stringify([v.objectInstanceId ?? objectId, sourceId ?? `statement:${v.stmtIndex}`, v.copyIndex]);
        return {
            emitterId, objectId, objectInstanceId: v.objectInstanceId ?? null, sourceId, trackKey: v.key ?? null,
            occurrenceId: `occurrence:${index}`, identityBasis: sourceId ? 'declared-source' : 'statement-copy',
            index,
            distanceProfile: s.distanceProfile ?? 'legacy_v1',
            label: voiceLabel(v),
            clip: v.clip ?? s.clip,
            kind: s.kind,
            statementIndex: v.stmtIndex,
            copyIndex: v.copyIndex,
            repIndex: v.repIndex,
            entity: v.entity ?? null,
            instance: v.entity ? (v.instance ?? null) : null,
            take: v.take !== undefined && v.take >= 0 ? v.take : null,
            trajectory: trajectoryId(v),
            room: s.roomName ?? sceneRoomName,
            extent: {
                radiusM: ext ? ext.radiusM : (s.radius.isNull ? 0 : (s.radius.min + s.radius.max) / 2),
                ringM: ext ? ext.ringM : (s.ringRadius.isNull ? 0 : (s.ringRadius.min + s.ringRadius.max) / 2),
                bed: ext ? ext.bed : s.bed,
                field: s.field,
                line: s.line,
            },
            splDb: s.spl.isNull ? null : [s.spl.min, s.spl.max],
            occlusionBase: s.occlusionBase,
            startTime: round3(v.startTime),
            endTime: round3(v.startTime + v.voiceDuration),
        };
    });
    const calibrated = manifest.voices.some((v) => {
        const e = v.trace?.emissionDb;
        return !!e && e.length > 0 && Number.isFinite(e[0]);
    });
    const frameCount = Math.ceil(manifest.duration * fps);
    const frames = [];
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const t = frameIndex / fps;
        const pose = path.length ? listenerPoseAt(path, t) : DEFAULT_LISTENER_POSE;
        const out = [];
        for (let i = 0; i < manifest.voices.length; i++) {
            const v = manifest.voices[i];
            const elapsed = t - v.startTime;
            if (elapsed < 0 || elapsed >= v.voiceDuration)
                continue;
            const s = v.stmt;
            const activity = resolveClipActivity(options.clipActivity, v.clip ?? s.clip);
            const audible = clipAudibleAt(activity, elapsed, v.startOffset, v.pitch, s.kind === 'loop');
            const bed = sources[i].extent.bed;
            // A bed envelops the listener (ListenerPath.ENVELOPING): distance 0 and no bearing along any path.
            const rel = bed ? ENVELOPING : toListenerFrame(positionAt(v, elapsed), pose);
            const vel = bed ? ENVELOPING : rotateToListenerFrame(velocityAt(v, elapsed, dvH), pose);
            const polar = scenePositionToPolar(rel);
            const tr = v.trace;
            const occlusion = tr ? traceValueAt(v, tr.occlusion, elapsed) : s.occlusionBase;
            const emissionDb = tr?.emissionDb ? finiteOrNull(traceValueAt(v, tr.emissionDb, elapsed)) : null;
            const receivedDb = tr?.receivedDb ? finiteOrNull(traceValueAt(v, tr.receivedDb, elapsed)) : null;
            const emissionBasis = emissionDb !== null ? 'trace' : s.spl.isNull ? 'assumed-default' : 'spl';
            const emissionAssumed = emissionDb ?? (s.spl.isNull ? DEFAULT_SPL_DB : (s.spl.min + s.spl.max) / 2);
            const receivedAnalyticDb = receivedSplDb(emissionAssumed, {
                distanceProfile: s.distanceProfile, distanceM: polar.distanceM, bed, field: s.field, line: s.line, occlusion01: occlusion,
            });
            const measuredDbfs = measured?.dbfs[i]?.[frameIndex];
            out.push({
                i,
                az: polar.azimuthDeg,
                el: polar.elevationDeg,
                dist: round3(polar.distanceM),
                x: round3(rel.x), y: round3(rel.y), z: round3(rel.z),
                vxyz: [round3(vel.x), round3(vel.y), round3(vel.z)],
                active: true,
                audible,
                audibleBasis: activity ? 'clip-rms-40dB-dry' : 'scheduled-span',
                occlusion: round3(occlusion),
                emissionDb,
                receivedDb,
                receivedAnalyticDb: round3(receivedAnalyticDb),
                emissionBasis,
                receivedMeasuredDbfs: measuredDbfs === undefined || !Number.isFinite(measuredDbfs) ? null : round3(measuredDbfs),
                receivedMeasuredBasis: measuredDbfs === undefined || !Number.isFinite(measuredDbfs) ? null : 'output-measured-stem',
                gain: tr ? finiteOrNull(traceValueAt(v, tr.gain, elapsed)) : null,
                rate: tr ? finiteOrNull(traceValueAt(v, tr.rate, elapsed)) : null,
                cutoffHz: tr ? finiteOrNull(traceValueAt(v, tr.cutoffHz, elapsed)) : null,
            });
        }
        frames.push({
            frame: frameIndex, t: round3(t),
            listener: { x: round3(pose.x), y: round3(pose.y), z: round3(pose.z), yaw: round3(pose.yaw), pitch: round3(pose.pitch ?? 0), ...(pose.orientation ? { orientation: [...pose.orientation] } : {}) },
            sources: out,
        });
    }
    const rooms = (options.scene?.rooms ?? []).map((r) => {
        const derived = manifest.rooms?.byName.get(r.name.toLowerCase()) ?? null;
        return {
            name: r.name, sizeM: r.sizeM, surfaces: r.surfaces, rt60S: r.rt60S,
            derived: derived ? { wet: derived.wet, size: derived.size, damping: derived.damping } : null,
        };
    });
    const simulated = !!manifest.simulated;
    const bases = {
        listener: 'by-construction',
        az: 'by-construction', el: 'by-construction', dist: 'by-construction', xyz: 'by-construction', vxyz: 'by-construction',
        active: 'by-construction',
        audible: options.clipActivity ? 'estimated' : 'by-construction',
        occlusion: simulated ? 'by-construction' : 'estimated',
        emissionDb: 'by-construction', receivedDb: 'by-construction',
        receivedAnalyticDb: 'estimated',
        receivedMeasuredDbfs: 'measured',
        gain: 'by-construction', rate: 'by-construction', cutoffHz: 'by-construction',
    };
    return {
        format: SCENE_GRAPH_FORMAT,
        fps,
        durationS: manifest.duration,
        frameCount,
        seed: manifest.seed ?? null,
        simulated,
        calibrated,
        resampled: simulated ? TRACE_RESAMPLED.slice() : [],
        bases,
        listenerPath: path,
        rooms,
        materials: (options.scene?.materials ?? []).map((m) => ({ name: m.name, absorption: m.absorption.slice() })),
        worldRoom: manifest.rooms?.world ?? null,
        spawns: manifest.spawns ?? [],
        retires: manifest.retires ?? [],
        events: manifest.events ?? [],
        assets: options.assets ? options.assets.map((a) => ({ ...a })) : [],
        sources,
        frames,
        coordinates: {
            frame,
            units: 'metres',
            up: '+Y',
            forward: '+Z',
            handedness: frame === 'three' ? 'right' : 'left',
            az: 'degrees, 0 = ahead, positive = left (DCASE), [-180,180], listener frame',
            el: 'degrees, positive = up, listener frame',
            dist: 'metres, straight-line from the listener',
            xyz: 'listener frame: +Z ahead, +X right, +Y up (metres), whichever scene frame the job used',
            vxyz: 'the source\'s own velocity (m/s) along the listener-frame axes of xyz; central difference of positionAt over one label frame, the listener\'s own motion not subtracted; [0,0,0] for a bed',
            listener: `orientation, when present, is the authoritative unit quaternion [x,y,z,w] rotating canonical +Z forward/+Y up into world space, including roll; scene frame position (metres) + yaw (radians, 0 = facing +Z, increasing toward +X) + pitch (radians, positive up, applied after yaw about the listener's X); scene frame '${frame}': +Y up, +Z ahead at yaw 0, +X to the listener's ${frame === 'three' ? 'left (right-handed, three.js)' : 'right (left-handed, Satie)'}`,
            emissionDb: 'dB SPL at 1 m the source emits (spl + volume trim), engine trace; null when the scene is not calibrated',
            receivedDb: 'dB SPL at the listener after the engine path model (distance law, line/bed/field, occlusion); null when not calibrated',
            receivedAnalyticDb: 'receivedSplDb() over this frame\'s range and occlusion; emission per emissionBasis: trace, else spl mid, else DEFAULT_SPL_DB (assumed-default)',
            receivedMeasuredDbfs: `20*log10(RMS) of the rendered mono stem at the array centre over the frame window (distance law and occlusion baked, the live master's -6 dB included, the job's headroomDb trim not), floored at ${-120} dBFS; null when no stem was measured (basis null)`,
            audibleBasis: `clip-rms-40dB-dry: the clip's dry RMS envelope within ${CLIP_ACTIVITY_THRESHOLD_DB} dB of its own peak (ClipActivity); scheduled-span: no activity known, audible = active`,
            resampled: 'fields the trace path re-draws from the statement (seeded) instead of reading from the engine run; empty on the sampled path',
            assets: 'the clips the render played as the job described them (clip, sha256, source, licence, durationS, loudness, generator); every decoded clip is normalized to CLIP_LUFS (-23 LUFS) by the renderer on arrival',
            occlusion: '0 clear .. 1 behind a wall — composed (authored, zone, foliage) on the trace, authored base otherwise',
            gain: 'linear gain the engine wrote (HDR window governed, x activity); trace only',
            rate: 'playback rate incl. Doppler; trace only',
        },
    };
}
/** The emitted JSON, one file per rendered recording (`<stem>.scene.json`). */
export function sceneGraphJson(manifest, options = {}) {
    return JSON.stringify(buildSceneGraph(manifest, options));
}
//# sourceMappingURL=SceneGraphFrames.js.map