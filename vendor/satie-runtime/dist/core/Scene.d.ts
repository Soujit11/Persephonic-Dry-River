/**
 * Scene-level declarations: the spaces a script describes, as opposed to the
 * voices it places in them.
 *
 * Until now `parse()` returned `Statement[]` and nothing else, so the one
 * existing scene-level concept — `background` — had to be smuggled onto every
 * voice and recovered by scanning. That does not scale to a named,
 * cross-referenced graph of rooms and materials, so those live here instead.
 *
 * ## `zone` and `room` are two concepts, deliberately
 *
 * They are easy to confuse and must not be merged:
 *
 *   - **`zone`** is AUTHORIAL. A voice's membership of a named scene state
 *     ("cave", "surface"), over an open vocabulary the scene or game defines,
 *     driven imperatively by `setSceneState`. It answers *what should be
 *     audible right now*, and its effect is gating — mute or duck.
 *   - **`room`** is PHYSICAL. Geometry and materials, from which decay follows.
 *     It answers *how sound behaves here*, and its effect is reverberation and
 *     transmission.
 *
 * They overlap in exactly one observable — both can attenuate a voice — which
 * is precisely why collapsing them is tempting and wrong. A zone can span
 * several rooms (a "forest" containing a clearing and a cave); a room can hold
 * voices from several zones. They compose: a voice has both.
 *
 * ## Precedence: the author wins, measurement fills the gaps
 *
 * The same rule the rest of the pipeline already follows — a measured
 * enclosure outranks the vision model's `room_size` guess, but an authored
 * `reverb wet` outranks the room's own. So a declared `room` is authoritative
 * for every value it states, geometry supplies whatever it leaves out, and a
 * script that declares nothing behaves exactly as today.
 */
export declare const SCENE_BAND_COUNT: 6;
/** A named surface material with octave-band absorption. */
export interface SceneMaterial {
    name: string;
    /** Index-aligned to OCTAVE_BANDS_HZ. */
    absorption: number[];
    /** Where it came from: authored coefficients, or a table lookup by name. */
    source: 'declared' | 'resolved';
}
/** A named acoustic space. Any field may be absent — geometry fills it in. */
export interface SceneRoom {
    name: string;
    /** Metres, width × height × depth. Null when the script only named surfaces. */
    sizeM: {
        x: number;
        y: number;
        z: number;
    } | null;
    /** Material name per surface class; resolved against the material table. */
    surfaces: {
        floor?: string;
        ceiling?: string;
        walls?: string;
    };
    /** Authored reverb time, seconds — overrides anything derived. */
    rt60S: number | null;
    /**
     * Where the room STANDS in the scene — the centre of its `size` box, in
     * scene metres (y = centre height). Null (the default) keeps the room what
     * it has always been: an acoustic profile with no position. A PLACED room
     * is enterable: when the listener walks inside its box, the engine drops
     * the boundary between them and its voices (occlusion on `in <room>`
     * voices fades to 0, the room's own reverb becomes the ambient one) and
     * raises that same boundary against everything outside.
     */
    placeM: {
        x: number;
        y: number;
        z: number;
    } | null;
}
/**
 * `soundscape <id>` block (spec 014, phase 2): one stretch of the world where the listener
 * would say they are somewhere else, decided by the composer before it writes sounds and
 * editable by the developer. Membership is by `source_id`, one per object, so the same sound
 * on two objects can sit in two soundscapes. Beds not listed in any soundscape are the world
 * layer; the player's own sounds belong to none.
 */
export interface SceneSoundscape {
    /** The name in the script; stable (variants are keyed on it). A rename changes `label` only. */
    id: string;
    /** Display name, in the world's own words ("Kessler's jewelry shop"). */
    label?: string;
    /** What kind of place it is, for saving and sharing: no proper nouns ("small jewelry shop off a loud downtown street"). */
    share?: string;
    kind?: SoundscapeKind;
    /** The game's regions (manifest `regions` ids) it was made from. */
    regions: string[];
    /** Placed rooms it contains; their `in <room>` voices are members too. */
    rooms: string[];
    /** Member objects (manifest ids): every voice `at` one of them is a member. Membership is per object. */
    objects: string[];
    /** Member sounds by `source_id`, for those with no object (beds, placed sounds). */
    sounds: string[];
    /** A moving soundscape (a train car): the object it rides with. */
    follows?: string;
    /** The composer's one-line reason. */
    why?: string;
}
/** `world` is not a soundscape: a block of that kind lists the world layer (what is about equally loud everywhere). */
export type SoundscapeKind = 'open' | 'enclosed' | 'moving' | 'world';
/**
 * Everything a script declares. `statements` is exactly what `parse()` has
 * always returned, so existing consumers are unaffected; the rest is additive.
 */
export interface SceneGraph {
    statements: unknown[];
    materials: SceneMaterial[];
    rooms: SceneRoom[];
}
/**
 * A declared microphone — the scene is CAPTURED, not just mixed.
 *
 * Until now the render format was a dropdown in the export panel and a field
 * on a batch job: the scene did not know it was being listened to, and the
 * listener was a `ListenerKeyframe[]` handed in from outside. Sound Particles'
 * best idea is the inversion — the scene contains microphones, and rendering
 * is capture — and it is worth more here than there, because Satie's whole
 * machine-listening case is that ONE authored scene should yield many
 * listening views whose labels cannot disagree with the audio.
 *
 * A mic is not a voice, so (like `room` and `material`) it never reaches
 * `parseSingle` and never appears in `statements` — every downstream filter
 * that treats a statement as a sound source would otherwise treat the
 * microphone as one.
 */
export interface SceneMic {
    /** Lowercased declared name; the render writes `<stem>.<name>.wav`. */
    name: string;
    format: MicFormat;
    /**
     * Where the mic is, over time. Always at least one keyframe (a static mic
     * is a single one at t = 0). Structurally an `export/ListenerPath`
     * keyframe — the export layer consumes it as one directly, which is how
     * `ListenerPath` stops being a separate hand-built API.
     */
    path: SceneMicKeyframe[];
    /** Capsule radius for array formats, metres (default 0.042 — a DCASE array). */
    radiusM?: number;
    /** Capsule count for `circular`. */
    capsules?: number;
    /** `sphere` — mount the capsules ON a rigid sphere instead of in free air. */
    rigidSphere?: boolean;
    /** 1-based source line, for warnings. */
    line: number;
}
/**
 * One pose along a mic's path. `t` is seconds from the start of the render;
 * `heading` is radians, 0 = facing +Z (scene "ahead"), increasing toward +X —
 * the same convention as `ListenerKeyframe`, deliberately, so a `SceneMic`
 * path IS a listener path.
 */
export interface SceneMicKeyframe {
    t: number;
    x: number;
    y: number;
    z: number;
    heading?: number;
}
/**
 * What a mic captures. The first group are render modes the offline renderer
 * already speaks; the last three are capsule arrays, rendered through
 * `MicArrayRender`. Keeping them in one vocabulary is the point: "render this
 * scene as binaural and as a 4-channel array" becomes two lines of script
 * rather than two different tools.
 */
export type MicFormat = 'stereo' | 'binaural' | 'foa' | 'soa' | 'quad' | '7.1.2' | '7.1.4' | 'tetrahedral' | 'eigenmike' | 'circular';
/** Array formats — the ones that render through the capsule path. */
export declare const MIC_ARRAY_FORMATS: ReadonlySet<MicFormat>;
export declare const MIC_FORMATS: ReadonlySet<string>;
/** Default capsule radius for array mics, metres (an Eigenmike-class body). */
export declare const MIC_DEFAULT_RADIUS_M = 0.042;
/** Find a declared mic by name (case-insensitive). */
export declare function findMic(scene: {
    mics: SceneMic[];
}, name: string): SceneMic | null;
export declare function findMaterial(scene: {
    materials: SceneMaterial[];
}, name: string): SceneMaterial | null;
export declare function findRoom(scene: {
    rooms: SceneRoom[];
}, name: string): SceneRoom | null;
//# sourceMappingURL=Scene.d.ts.map