/**
 * Unity bundle export: script → `.satie-unity.zip` with one mono WAV stem
 * per voice, a `scene.json` manifest (`satie-unity/1`) and a plain C#
 * MonoBehaviour that rebuilds the scene from it — unzip into `Assets/`,
 * assign the JSON, bind the stems, press play, and the voices move.
 *
 * What the stems carry: everything the mix applies EXCEPT direction and
 * distance — envelope, volume/pitch automation, count scaling, DSP, reverb
 * send, the 0.5 master. Distance attenuation is deliberately NOT baked
 * (`renderObjectStems` with `bakeDistance: false`): Unity's `AudioSource`
 * applies its own rolloff from the real-metre positions in the manifest, so
 * baking it too would attenuate twice. The manifest says so
 * (`attenuationBaked: false`) and carries the live distance law so the loader
 * can match it.
 *
 * Coordinates: Unity is left-handed, +Z forward, +Y up, +X right, metres —
 * exactly Satie's scene frame (`VoicePositions.ts`), so this is the one
 * exporter whose frame conversion is the identity. Pinned by test.
 *
 * Manifest shape is flat on purpose: Unity's `JsonUtility` reads only
 * `[Serializable]` classes with public fields and arrays, no maps, no unions —
 * so a static voice is `path: []` plus `position`, never a differently-typed
 * field.
 */
import { decodeAllBuffers, renderObjectStems, prepareRenderManifest, sampleVoiceExtent, } from './OfflineRenderer.js';
import { positionAt, sampleVoicePositionTimeline, isStaticMotion } from './VoicePositions.js';
import { buildRiff, buildFmtChunk, interleavePcm } from './RiffWriter.js';
import { SATIE_ATTRIBUTION } from './Attribution.js';
import { sanitizePrimName } from './USDAWriter.js';
import { trimSilence } from './USDZExporter.js';
import { packZip } from './USDZPacker.js';
import { voiceLabel } from './SeldAnnotations.js';
import { PANNER_REF_M, PANNER_ROLLOFF, distanceRolloff } from '../spatial/WorldAcoustics.js';
export const UNITY_BUNDLE_FORMAT = 'satie-unity/1';
/** Position track cadence, Hz — the same grid the audio render bakes at. */
export const UNITY_PATH_FPS = 30;
/**
 * Scene frame → Unity frame. Satie's scene frame is +Z ahead, +X right,
 * +Y up, metres; Unity's is the same left-handed triad — so this is the
 * identity. Every other exporter negates an axis; this one must not.
 */
export function toUnityPosition(p) {
    return { x: p.x, y: p.y, z: p.z };
}
const r3 = (v) => Math.round(v * 1000) / 1000;
/**
 * A voice's position at its start plus its absolute-time track — pure, so
 * the manifest half of the bundle is testable without rendering audio.
 */
export function unityPathFor(voice, fps = UNITY_PATH_FPS) {
    const position = toUnityPosition(positionAt(voice, 0));
    if (isStaticMotion(voice))
        return { position: { x: r3(position.x), y: r3(position.y), z: r3(position.z) }, path: [] };
    const path = sampleVoicePositionTimeline(voice, fps).map((pt) => {
        const u = toUnityPosition(pt);
        return { t: r3(voice.startTime + pt.t), x: r3(u.x), y: r3(u.y), z: r3(u.z) };
    });
    return { position: { x: r3(position.x), y: r3(position.y), z: r3(position.z) }, path };
}
/** The manifest, from voices whose stems are already decided. Pure. */
export function buildUnityScene(manifest, voices, options) {
    return {
        format: UNITY_BUNDLE_FORMAT,
        name: options.name,
        sampleRate: options.sampleRate,
        duration: options.duration,
        seed: options.seed,
        simulated: !!manifest.simulated,
        pathFps: UNITY_PATH_FPS,
        attenuationBaked: false,
        distance: { model: 'inverse', refDistanceM: PANNER_REF_M, rolloff: PANNER_ROLLOFF },
        coordinates: {
            frame: '+Z forward, +X right, +Y up',
            handedness: 'left-handed (Unity); identical to the Satie scene frame, no axis is negated',
            units: 'metres; t in seconds from scene start',
            listener: 'origin, facing +Z at t=0; put the AudioListener on your camera and parent SatieScene at the world origin',
            note: 'position is the voice at startTime; path is sampled at pathFps and is empty for a voice that never moves',
        },
        voices: voices.map(({ voice, id, headTrimS, clipDuration }) => {
            const ext = sampleVoiceExtent(voice);
            return {
                id,
                label: voiceLabel(voice),
                file: `audio/${id}.wav`,
                startTime: r3(voice.startTime + headTrimS),
                clipDuration: r3(clipDuration),
                loop: voice.stmt.kind === 'loop',
                gain: 1,
                scriptVolume: r3(voice.volume),
                pitch: 1,
                scriptPitch: r3(voice.pitch),
                extent: { radiusM: r3(ext.radiusM), ringM: r3(ext.ringM), bed: ext.bed },
                distance: { model: 'inverse', refDistanceM: PANNER_REF_M,
                    rolloff: voice.stmt.field || ext.bed ? 0 : distanceRolloff(voice.stmt.line, voice.stmt.distanceProfile),
                    profile: voice.stmt.distanceProfile ?? 'legacy_v1' },
                ...unityPathFor(voice),
            };
        }),
    };
}
/** Mono 16-bit WAV bytes straight from samples. */
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
const encode = (s) => new TextEncoder().encode(s);
export async function exportUnityBundle(options, onProgress) {
    const { script, sampleBuffers, decodedAudioBuffers, duration } = options;
    const sampleRate = options.clipSampleRate ?? 48000;
    const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
    const name = sanitizePrimName(options.sceneName ?? 'satie-scene') || 'satie_scene';
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
        warnings.push(`No audio for "${clip}": statement skipped.`);
    }
    if (manifest.voices.length === 0) {
        throw new Error('Unity export: no renderable voices (missing audio buffers?)');
    }
    onProgress?.({ phase: 'rendering', progress: 0.25 });
    const stems = await renderObjectStems(manifest, decodedBuffers, duration, sampleRate, (f) => onProgress?.({ phase: 'rendering', progress: 0.25 + 0.65 * f }), undefined, { bakeDistance: false });
    const inputs = [];
    const clips = [];
    const usedIds = new Set();
    let skippedSilent = 0;
    for (let k = 0; k < manifest.voices.length; k++) {
        const voice = manifest.voices[k];
        const trimmed = trimSilence(stems[k], sampleRate);
        if (!trimmed) {
            skippedSilent++;
            continue;
        }
        const clipBase = ((voice.clip ?? voice.stmt.clip).split('/').pop() ?? voice.stmt.clip);
        let id = sanitizePrimName(`voice_${String(voice.stmtIndex).padStart(2, '0')}_${clipBase}_c${String(voice.copyIndex).padStart(2, '0')}_r${String(voice.repIndex).padStart(2, '0')}`);
        while (usedIds.has(id))
            id = `${id}_x`;
        usedIds.add(id);
        // A loop's stem is the whole scene-length render of that loop; trimming
        // it would move the seam, so it ships untrimmed. One-shots are trimmed
        // and the head trim folds into startTime.
        const isLoop = voice.stmt.kind === 'loop';
        const samples = isLoop ? stems[k] : trimmed.samples;
        const headTrimS = isLoop ? 0 : trimmed.startSeconds;
        clips.push({ name: `audio/${id}.wav`, data: monoWavBytes(samples, sampleRate) });
        inputs.push({ voice, id, headTrimS, clipDuration: samples.length / sampleRate });
    }
    if (inputs.length === 0) {
        throw new Error('Unity export: every voice rendered silent, nothing to package.');
    }
    const scene = buildUnityScene(manifest, inputs, { name, sampleRate, duration, seed });
    const entries = [
        { name: 'scene.json', data: encode(JSON.stringify(scene)) },
        { name: 'README.md', data: encode(unityReadme(name, scene.voices.length)) },
        { name: 'Satie/SatieScene.cs', data: encode(SATIE_SCENE_CS) },
        ...clips,
    ];
    const zip = packZip(entries);
    const blob = new Blob([await zip.arrayBuffer()], { type: 'application/zip' });
    onProgress?.({ phase: 'done', progress: 1 });
    return { blob, voiceCount: inputs.length, skippedSilent, warnings, seed, scene };
}
export function unityReadme(name, voiceCount) {
    return `# ${name}: Satie scene for Unity

${voiceCount} spatial voice${voiceCount === 1 ? '' : 's'}, format satie-unity/1.
${SATIE_ATTRIBUTION}

## Three steps

1. Unzip this folder into your project's \`Assets/\` (for example \`Assets/Satie/${name}/\`).
   Unity imports the WAV stems and the \`SatieScene.cs\` component.
2. Add an empty GameObject at the world origin and add the **SatieScene** component to it.
   Drag \`scene.json\` onto its **Scene Json** field, then use the component's context menu
   (the three dots) → **Bind stems from folder**. One AudioSource child per voice is created at play time.
3. Make sure your camera has an **AudioListener**, then press Play.

Voices start on Satie's schedule (\`PlayScheduled\` on the DSP clock), loop when the script looped them,
and follow their position track every frame.

## Coordinates

Unity is left-handed: +Z forward, +X right, +Y up, metres. That is exactly Satie's scene frame, so nothing
is converted: a voice Satie placed \`ahead\` sits at +Z in front of the origin. The listener is at the origin
facing +Z at t = 0. Move the camera and Unity's own spatializer does the rest.

## Levels

Each stem already carries its volume, fades, DSP and reverb send. Distance attenuation is NOT baked:
the AudioSource's custom curve samples the inverse law from real-metre positions. Each voice's
\`distance\` overrides the scene fallback (reference ${PANNER_REF_M} m, legacy rolloff ${PANNER_ROLLOFF}).
The curve holds its final gain beyond **Max Distance**; increase that range for larger worlds.
Point-source distance semantics are carried through; extended shapes, room paths and HRTFs are
approximations in this loader. Validate the result in the target Unity project. Set **Master Gain**
on the component to trim the whole scene.

## Files

- \`scene.json\`: the manifest: voices, start times, loop flags, extents, position tracks (30 Hz).
- \`audio/<voice>.wav\`: one mono 16-bit stem per voice.
- \`Satie/SatieScene.cs\`: the loader. Plain C#, no packages.
`;
}
/** The loader that ships in every bundle. Plain C#, JsonUtility only. */
export const SATIE_SCENE_CS = `// SatieScene.cs: rebuilds a Satie scene (satie-unity/1) from scene.json.
// Plain C#, no packages. See README.md in the bundle.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Satie
{
    [Serializable] public class SatieVec3 { public float x, y, z; }
    [Serializable] public class SatiePathPoint { public float t, x, y, z; }
    [Serializable] public class SatieExtent { public float radiusM, ringM; public bool bed; }
    [Serializable] public class SatieDistance { public string model, profile; public float refDistanceM, rolloff; }

    [Serializable]
    public class SatieVoice
    {
        public string id, label, file;
        public float startTime, clipDuration, gain, scriptVolume, pitch, scriptPitch;
        public bool loop;
        public SatieExtent extent;
        public SatieDistance distance;
        public SatieVec3 position;
        public SatiePathPoint[] path;
    }

    [Serializable]
    public class SatieSceneData
    {
        public string format, name;
        public int sampleRate;
        public float duration, pathFps;
        public bool attenuationBaked, simulated;
        public SatieDistance distance;
        public SatieVoice[] voices;
    }

    /// One component per exported scene. Parent it at the world origin; the
    /// AudioListener goes on your camera. Voices are child GameObjects with an
    /// AudioSource each, scheduled on the DSP clock and moved every frame.
    public class SatieScene : MonoBehaviour
    {
        [Tooltip("The scene.json from the Satie bundle.")]
        public TextAsset sceneJson;
        [Tooltip("One clip per voice, index-aligned with scene.json. Fill with 'Bind stems from folder'.")]
        public List<AudioClip> stems = new List<AudioClip>();
        public bool playOnStart = true;
        [Range(0f, 2f)] public float masterGain = 1f;
        [Tooltip("End of the sampled distance curve. Gain holds beyond this range; raise it for larger worlds.")]
        public float maxDistance = 500f;

        SatieSceneData data;
        AudioSource[] sources;
        Transform[] nodes;
        double dspStart;
        bool playing;

        public bool IsPlaying { get { return playing; } }
        public float SceneTime { get { return playing ? (float)(AudioSettings.dspTime - dspStart) : 0f; } }

        void Awake() { if (sceneJson != null) Load(); }
        void Start() { if (playOnStart) Play(); }

        public void Load()
        {
            data = JsonUtility.FromJson<SatieSceneData>(sceneJson.text);
            if (data == null || data.voices == null) { Debug.LogError("SatieScene: scene.json did not parse"); return; }
            if (data.format != "satie-unity/1") Debug.LogWarning("SatieScene: unexpected format " + data.format);
            foreach (Transform child in transform) if (child.name.StartsWith("voice_")) Destroy(child.gameObject);
            int n = data.voices.Length;
            sources = new AudioSource[n];
            nodes = new Transform[n];
            for (int i = 0; i < n; i++)
            {
                SatieVoice v = data.voices[i];
                GameObject go = new GameObject(v.id);
                go.transform.SetParent(transform, false);
                go.transform.localPosition = new Vector3(v.position.x, v.position.y, v.position.z);
                AudioSource src = go.AddComponent<AudioSource>();
                src.clip = i < stems.Count ? stems[i] : null;
                if (src.clip == null) Debug.LogWarning("SatieScene: no stem bound for " + v.id + " (" + v.file + ")");
                src.playOnAwake = false;
                src.loop = v.loop;
                src.spatialBlend = 1f;
                src.volume = v.gain * masterGain;
                src.pitch = v.pitch;
                src.dopplerLevel = 0f;
                SatieDistance distance = v.distance ?? data.distance;
                float refM = distance != null && distance.refDistanceM > 0f ? distance.refDistanceM : 1f;
                float rolloff = distance != null ? Mathf.Max(0f, distance.rolloff) : 2f;
                src.minDistance = refM;
                src.maxDistance = Mathf.Max(refM * 2f, maxDistance);
                src.rolloffMode = AudioRolloffMode.Custom;
                src.SetCustomCurve(AudioSourceCurveType.CustomRolloff, DistanceCurve(refM, rolloff, src.maxDistance));
                if (v.extent != null && v.extent.bed) { src.spatialBlend = 0f; src.spread = 180f; }
                sources[i] = src;
                nodes[i] = go.transform;
            }
        }

        public void Play()
        {
            if (data == null || sources == null) { Debug.LogWarning("SatieScene: nothing loaded"); return; }
            dspStart = AudioSettings.dspTime + 0.1;
            for (int i = 0; i < sources.Length; i++)
            {
                AudioSource src = sources[i];
                if (src == null || src.clip == null) continue;
                src.volume = data.voices[i].gain * masterGain;
                src.PlayScheduled(dspStart + data.voices[i].startTime);
            }
            playing = true;
        }

        // Unity's native logarithmic rolloff does not consume the declared
        // SATIE rolloff coefficient. Sample the declared inverse curve instead.
        static AnimationCurve DistanceCurve(float reference, float rolloff, float maximum)
        {
            var keys = new Keyframe[66];
            keys[0] = new Keyframe(0f, 1f, 0f, 0f);
            for (int i = 0; i < 65; i++)
            {
                float d = reference * Mathf.Pow(maximum / reference, i / 64f);
                float denominator = reference + rolloff * (d - reference);
                float gain = reference / denominator;
                float slope = -reference * rolloff * maximum / (denominator * denominator);
                keys[i + 1] = new Keyframe(d / maximum, gain, i == 0 ? 0f : slope, slope);
            }
            return new AnimationCurve(keys);
        }

        public void Stop()
        {
            if (sources != null) foreach (AudioSource src in sources) if (src != null) src.Stop();
            playing = false;
        }

        void Update()
        {
            if (!playing || data == null) return;
            float t = SceneTime;
            for (int i = 0; i < data.voices.Length; i++)
            {
                SatiePathPoint[] path = data.voices[i].path;
                if (path == null || path.Length == 0 || nodes[i] == null) continue;
                nodes[i].localPosition = Sample(path, t);
            }
        }

        /// Linear interpolation on the track, clamped at both ends. Binary search on t.
        public static Vector3 Sample(SatiePathPoint[] path, float t)
        {
            if (t <= path[0].t) return new Vector3(path[0].x, path[0].y, path[0].z);
            int last = path.Length - 1;
            if (t >= path[last].t) return new Vector3(path[last].x, path[last].y, path[last].z);
            int lo = 0, hi = last;
            while (hi - lo > 1)
            {
                int mid = (lo + hi) >> 1;
                if (path[mid].t <= t) lo = mid; else hi = mid;
            }
            SatiePathPoint a = path[lo], b = path[hi];
            float span = b.t - a.t;
            float u = span > 0f ? (t - a.t) / span : 0f;
            return new Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
        }

#if UNITY_EDITOR
        [ContextMenu("Bind stems from folder")]
        void BindStemsFromFolder()
        {
            if (sceneJson == null) { Debug.LogError("SatieScene: assign scene.json first"); return; }
            SatieSceneData d = JsonUtility.FromJson<SatieSceneData>(sceneJson.text);
            string dir = Path.GetDirectoryName(AssetDatabase.GetAssetPath(sceneJson));
            stems.Clear();
            int missing = 0;
            foreach (SatieVoice v in d.voices)
            {
                string path = Path.Combine(dir, v.file).Replace('\\\\', '/');
                AudioClip clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
                if (clip == null) missing++;
                stems.Add(clip);
            }
            EditorUtility.SetDirty(this);
            Debug.Log("SatieScene: bound " + (stems.Count - missing) + " of " + d.voices.Length + " stems" + (missing > 0 ? " (" + missing + " missing)" : ""));
        }
#endif
    }
}
`;
//# sourceMappingURL=UnityBundle.js.map