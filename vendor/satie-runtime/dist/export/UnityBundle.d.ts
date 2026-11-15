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
import type { RenderedVoice, RenderManifest } from './RenderManifest';
import { RenderProgress } from './OfflineRenderer.js';
import type { WorldRoom } from './SceneSimulation';
import { ScenePosition } from './VoicePositions.js';
import { type DistanceProfile } from '../spatial/WorldAcoustics.js';
export declare const UNITY_BUNDLE_FORMAT = "satie-unity/1";
/** Position track cadence, Hz — the same grid the audio render bakes at. */
export declare const UNITY_PATH_FPS = 30;
export interface UnityBundleOptions {
    script: string;
    sampleBuffers: Map<string, ArrayBuffer>;
    decodedAudioBuffers?: ReadonlyMap<string, AudioBuffer>;
    duration: number;
    /** Stem sample rate. Default 48000. */
    clipSampleRate?: 24000 | 32000 | 48000;
    /** Seed for reproducibility (same contract as the ADM/USDZ exporters). */
    seed?: number;
    /** Simulate in the live engine and export the trace (default 'auto'). */
    simulate?: boolean | 'auto';
    /** The world room the listener stood in at export time. */
    worldRoom?: WorldRoom | null;
    /** Scene name used for the bundle's folder and README. Default 'satie-scene'. */
    sceneName?: string;
}
export interface UnityBundleResult {
    blob: Blob;
    voiceCount: number;
    /** Voices dropped because their stems were fully silent. */
    skippedSilent: number;
    warnings: string[];
    seed: number;
    /** The manifest that went into `scene.json`. */
    scene: UnitySceneFile;
}
export interface UnityVec3 {
    x: number;
    y: number;
    z: number;
}
export interface UnityPathPoint extends UnityVec3 {
    t: number;
}
export interface UnityVoice {
    /** Overrides the scene fallback, including mixed legacy/new scenes and fields. */
    distance?: {
        model: 'inverse';
        refDistanceM: number;
        rolloff: number;
        profile: DistanceProfile;
    };
    /** Stable identifier; also the stem's file stem. */
    id: string;
    /** Open-vocabulary label (the gen prompt or clip name, cleaned). */
    label: string;
    /** Path inside the bundle, `audio/<id>.wav`. */
    file: string;
    /** Absolute scene seconds the stem starts playing at (head trim folded in). */
    startTime: number;
    /** Seconds of audio in the stem. */
    clipDuration: number;
    /** `loop` statements — the stem is the scene-length loop render; play it looped. */
    loop: boolean;
    /**
     * Linear gain the AudioSource should apply. Always 1: level is already in
     * the stem (volume, count scaling, master). `scriptVolume` says what the
     * script asked for, for reference.
     */
    gain: number;
    scriptVolume: number;
    /** Playback rate the AudioSource should apply. Always 1: pitch is baked. `scriptPitch` for reference. */
    pitch: number;
    scriptPitch: number;
    extent: {
        radiusM: number;
        ringM: number;
        bed: boolean;
    };
    /** Position at `startTime` (scene frame = Unity frame, metres). */
    position: UnityVec3;
    /** Position track at `UNITY_PATH_FPS`, absolute scene seconds; empty for a voice that never moves. */
    path: UnityPathPoint[];
}
export interface UnitySceneFile {
    format: typeof UNITY_BUNDLE_FORMAT;
    name: string;
    sampleRate: number;
    duration: number;
    seed: number;
    simulated: boolean;
    pathFps: number;
    attenuationBaked: false;
    /** The live engine's distance law, so the loader's rolloff can match it. */
    distance: {
        model: 'inverse';
        refDistanceM: number;
        rolloff: number;
    };
    coordinates: {
        frame: string;
        handedness: string;
        units: string;
        listener: string;
        note: string;
    };
    voices: UnityVoice[];
}
/**
 * Scene frame → Unity frame. Satie's scene frame is +Z ahead, +X right,
 * +Y up, metres; Unity's is the same left-handed triad — so this is the
 * identity. Every other exporter negates an axis; this one must not.
 */
export declare function toUnityPosition(p: ScenePosition): UnityVec3;
/**
 * A voice's position at its start plus its absolute-time track — pure, so
 * the manifest half of the bundle is testable without rendering audio.
 */
export declare function unityPathFor(voice: RenderedVoice, fps?: number): Pick<UnityVoice, 'position' | 'path'>;
export interface UnityVoiceInput {
    voice: RenderedVoice;
    id: string;
    /** Seconds trimmed from the head of the stem (0 for loops — see exportUnityBundle). */
    headTrimS: number;
    clipDuration: number;
}
/** The manifest, from voices whose stems are already decided. Pure. */
export declare function buildUnityScene(manifest: RenderManifest, voices: UnityVoiceInput[], options: {
    name: string;
    sampleRate: number;
    duration: number;
    seed: number;
}): UnitySceneFile;
export declare function exportUnityBundle(options: UnityBundleOptions, onProgress?: (p: RenderProgress) => void): Promise<UnityBundleResult>;
export declare function unityReadme(name: string, voiceCount: number): string;
/** The loader that ships in every bundle. Plain C#, JsonUtility only. */
export declare const SATIE_SCENE_CS = "// SatieScene.cs: rebuilds a Satie scene (satie-unity/1) from scene.json.\n// Plain C#, no packages. See README.md in the bundle.\nusing System;\nusing System.Collections.Generic;\nusing System.IO;\nusing UnityEngine;\n#if UNITY_EDITOR\nusing UnityEditor;\n#endif\n\nnamespace Satie\n{\n    [Serializable] public class SatieVec3 { public float x, y, z; }\n    [Serializable] public class SatiePathPoint { public float t, x, y, z; }\n    [Serializable] public class SatieExtent { public float radiusM, ringM; public bool bed; }\n    [Serializable] public class SatieDistance { public string model, profile; public float refDistanceM, rolloff; }\n\n    [Serializable]\n    public class SatieVoice\n    {\n        public string id, label, file;\n        public float startTime, clipDuration, gain, scriptVolume, pitch, scriptPitch;\n        public bool loop;\n        public SatieExtent extent;\n        public SatieDistance distance;\n        public SatieVec3 position;\n        public SatiePathPoint[] path;\n    }\n\n    [Serializable]\n    public class SatieSceneData\n    {\n        public string format, name;\n        public int sampleRate;\n        public float duration, pathFps;\n        public bool attenuationBaked, simulated;\n        public SatieDistance distance;\n        public SatieVoice[] voices;\n    }\n\n    /// One component per exported scene. Parent it at the world origin; the\n    /// AudioListener goes on your camera. Voices are child GameObjects with an\n    /// AudioSource each, scheduled on the DSP clock and moved every frame.\n    public class SatieScene : MonoBehaviour\n    {\n        [Tooltip(\"The scene.json from the Satie bundle.\")]\n        public TextAsset sceneJson;\n        [Tooltip(\"One clip per voice, index-aligned with scene.json. Fill with 'Bind stems from folder'.\")]\n        public List<AudioClip> stems = new List<AudioClip>();\n        public bool playOnStart = true;\n        [Range(0f, 2f)] public float masterGain = 1f;\n        [Tooltip(\"End of the sampled distance curve. Gain holds beyond this range; raise it for larger worlds.\")]\n        public float maxDistance = 500f;\n\n        SatieSceneData data;\n        AudioSource[] sources;\n        Transform[] nodes;\n        double dspStart;\n        bool playing;\n\n        public bool IsPlaying { get { return playing; } }\n        public float SceneTime { get { return playing ? (float)(AudioSettings.dspTime - dspStart) : 0f; } }\n\n        void Awake() { if (sceneJson != null) Load(); }\n        void Start() { if (playOnStart) Play(); }\n\n        public void Load()\n        {\n            data = JsonUtility.FromJson<SatieSceneData>(sceneJson.text);\n            if (data == null || data.voices == null) { Debug.LogError(\"SatieScene: scene.json did not parse\"); return; }\n            if (data.format != \"satie-unity/1\") Debug.LogWarning(\"SatieScene: unexpected format \" + data.format);\n            foreach (Transform child in transform) if (child.name.StartsWith(\"voice_\")) Destroy(child.gameObject);\n            int n = data.voices.Length;\n            sources = new AudioSource[n];\n            nodes = new Transform[n];\n            for (int i = 0; i < n; i++)\n            {\n                SatieVoice v = data.voices[i];\n                GameObject go = new GameObject(v.id);\n                go.transform.SetParent(transform, false);\n                go.transform.localPosition = new Vector3(v.position.x, v.position.y, v.position.z);\n                AudioSource src = go.AddComponent<AudioSource>();\n                src.clip = i < stems.Count ? stems[i] : null;\n                if (src.clip == null) Debug.LogWarning(\"SatieScene: no stem bound for \" + v.id + \" (\" + v.file + \")\");\n                src.playOnAwake = false;\n                src.loop = v.loop;\n                src.spatialBlend = 1f;\n                src.volume = v.gain * masterGain;\n                src.pitch = v.pitch;\n                src.dopplerLevel = 0f;\n                SatieDistance distance = v.distance ?? data.distance;\n                float refM = distance != null && distance.refDistanceM > 0f ? distance.refDistanceM : 1f;\n                float rolloff = distance != null ? Mathf.Max(0f, distance.rolloff) : 2f;\n                src.minDistance = refM;\n                src.maxDistance = Mathf.Max(refM * 2f, maxDistance);\n                src.rolloffMode = AudioRolloffMode.Custom;\n                src.SetCustomCurve(AudioSourceCurveType.CustomRolloff, DistanceCurve(refM, rolloff, src.maxDistance));\n                if (v.extent != null && v.extent.bed) { src.spatialBlend = 0f; src.spread = 180f; }\n                sources[i] = src;\n                nodes[i] = go.transform;\n            }\n        }\n\n        public void Play()\n        {\n            if (data == null || sources == null) { Debug.LogWarning(\"SatieScene: nothing loaded\"); return; }\n            dspStart = AudioSettings.dspTime + 0.1;\n            for (int i = 0; i < sources.Length; i++)\n            {\n                AudioSource src = sources[i];\n                if (src == null || src.clip == null) continue;\n                src.volume = data.voices[i].gain * masterGain;\n                src.PlayScheduled(dspStart + data.voices[i].startTime);\n            }\n            playing = true;\n        }\n\n        // Unity's native logarithmic rolloff does not consume the declared\n        // SATIE rolloff coefficient. Sample the declared inverse curve instead.\n        static AnimationCurve DistanceCurve(float reference, float rolloff, float maximum)\n        {\n            var keys = new Keyframe[66];\n            keys[0] = new Keyframe(0f, 1f, 0f, 0f);\n            for (int i = 0; i < 65; i++)\n            {\n                float d = reference * Mathf.Pow(maximum / reference, i / 64f);\n                float denominator = reference + rolloff * (d - reference);\n                float gain = reference / denominator;\n                float slope = -reference * rolloff * maximum / (denominator * denominator);\n                keys[i + 1] = new Keyframe(d / maximum, gain, i == 0 ? 0f : slope, slope);\n            }\n            return new AnimationCurve(keys);\n        }\n\n        public void Stop()\n        {\n            if (sources != null) foreach (AudioSource src in sources) if (src != null) src.Stop();\n            playing = false;\n        }\n\n        void Update()\n        {\n            if (!playing || data == null) return;\n            float t = SceneTime;\n            for (int i = 0; i < data.voices.Length; i++)\n            {\n                SatiePathPoint[] path = data.voices[i].path;\n                if (path == null || path.Length == 0 || nodes[i] == null) continue;\n                nodes[i].localPosition = Sample(path, t);\n            }\n        }\n\n        /// Linear interpolation on the track, clamped at both ends. Binary search on t.\n        public static Vector3 Sample(SatiePathPoint[] path, float t)\n        {\n            if (t <= path[0].t) return new Vector3(path[0].x, path[0].y, path[0].z);\n            int last = path.Length - 1;\n            if (t >= path[last].t) return new Vector3(path[last].x, path[last].y, path[last].z);\n            int lo = 0, hi = last;\n            while (hi - lo > 1)\n            {\n                int mid = (lo + hi) >> 1;\n                if (path[mid].t <= t) lo = mid; else hi = mid;\n            }\n            SatiePathPoint a = path[lo], b = path[hi];\n            float span = b.t - a.t;\n            float u = span > 0f ? (t - a.t) / span : 0f;\n            return new Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);\n        }\n\n#if UNITY_EDITOR\n        [ContextMenu(\"Bind stems from folder\")]\n        void BindStemsFromFolder()\n        {\n            if (sceneJson == null) { Debug.LogError(\"SatieScene: assign scene.json first\"); return; }\n            SatieSceneData d = JsonUtility.FromJson<SatieSceneData>(sceneJson.text);\n            string dir = Path.GetDirectoryName(AssetDatabase.GetAssetPath(sceneJson));\n            stems.Clear();\n            int missing = 0;\n            foreach (SatieVoice v in d.voices)\n            {\n                string path = Path.Combine(dir, v.file).Replace('\\\\', '/');\n                AudioClip clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);\n                if (clip == null) missing++;\n                stems.Add(clip);\n            }\n            EditorUtility.SetDirty(this);\n            Debug.Log(\"SatieScene: bound \" + (stems.Count - missing) + \" of \" + d.voices.Length + \" stems\" + (missing > 0 ? \" (\" + missing + \" missing)\" : \"\"));\n        }\n#endif\n    }\n}\n";
//# sourceMappingURL=UnityBundle.d.ts.map