import { WanderType } from '../core/Statement.js';
import { pathFor } from '../core/SatieParser.js';
/** Lossy features are enumerated; the Python adapter refuses them before generating audio. */
export function referenceScene(manifest, setup) {
    const unsupported = [...manifest.missingClips.map(c => `missing asset: ${c}`)];
    const sources = manifest.voices.flatMap((v, index) => {
        const s = v.stmt, id = `${s.sourceId ?? `unidentified-${v.stmtIndex}`}.${index}`;
        const clip = v.clip ?? pathFor(s.clip), asset = setup.assets.get(clip) ?? setup.assets.get(s.clip);
        const reject = (feature) => unsupported.push(`${id}: ${feature}`);
        if (!s.sourceId)
            reject('missing source_id');
        if (!asset) {
            reject('missing pinned asset');
            return [];
        }
        if (v.trace || s.wanderType !== WanderType.None || s.hostRef || s.attachRef || s.followTarget || v.scatter || JSON.stringify(s.areaMin) !== JSON.stringify(s.areaMax))
            reject('moving/hosted/trace-driven source');
        if (s.bed || s.field || s.radius.max > 0 || s.ringRadius.max > 0 || !!s.radiusInterpolation || !!s.ringInterpolation)
            reject('source extent');
        if (v.pitch !== 1 || v.fadeIn > 0 || v.fadeOut > 0 || s.filterParams || s.delayParams || s.distortionParams || s.eqParams)
            reject('source DSP/envelope requires a pre-rendered dry stem');
        if (s.occlusionBase > 0)
            reject('authored occlusion requires equivalent reference geometry');
        if (s.reverbParams)
            reject('authored reverb override is not mesh acoustics');
        const snrDb = setup.snrDb.get(id);
        if (snrDb === undefined || !Number.isFinite(snrDb))
            reject('missing reference level calibration');
        return [{ id, sourceId: s.sourceId, kind: 'static', position: [s.areaMin.x, s.areaMin.y, s.areaMin.z],
                asset, sceneStart: v.startTime, audioOffset: v.startOffset, duration: Math.min(v.voiceDuration, manifest.duration - v.startTime), snrDb }];
    });
    return { version: 'satie.reference-scene/v1', units: 'metres', duration: manifest.duration,
        seed: setup.seed, sampleRate: setup.sampleRate, mesh: setup.mesh, meshFromScene: setup.meshFromScene,
        listener: setup.listener, referenceDb: setup.referenceDb, sources, unsupported };
}
//# sourceMappingURL=ReferenceScene.js.map