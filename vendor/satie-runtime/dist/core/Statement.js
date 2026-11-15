import { RangeOrValue } from './RangeOrValue.js';
export var WanderType;
(function (WanderType) {
    WanderType["None"] = "none";
    WanderType["Walk"] = "walk";
    WanderType["Fly"] = "fly";
    WanderType["Fixed"] = "fixed";
    WanderType["Spiral"] = "spiral";
    WanderType["Orbit"] = "orbit";
    WanderType["Lorenz"] = "lorenz";
    WanderType["Custom"] = "custom";
})(WanderType || (WanderType = {}));
const BUILTIN_TRAJECTORY_TYPES = new Set([WanderType.Spiral, WanderType.Orbit, WanderType.Lorenz]);
export function isTrajectoryWanderType(wt) {
    return BUILTIN_TRAJECTORY_TYPES.has(wt) || wt === WanderType.Custom;
}
export class Statement {
    // ── Source provenance (scene-graph spec §4 — the script surgeon's anchors) ──
    /**
     * Unique within one parse run: a stable in-memory identity so the viewport's
     * object handle survives to the text layer without a fuzzy search. -1 until
     * the parser assigns one.
     */
    statementId = -1;
    /**
     * 0-based line index of the statement HEAD in the ORIGINAL script text —
     * before any pre-pass inserted, deleted, or split lines. -1 when unknown.
     */
    sourceLine = -1;
    /** 0-based original line of the last line of this statement's block; -1 unknown. */
    sourceEndLine = -1;
    /**
     * The head line mints more than one statement (multi-clip `and` / folder
     * glob) — a per-voice text edit must split the shared line first.
     */
    sourceShared = false;
    /** Property key → where its value was written (own block line, inline `and`, group, entity). */
    propertySpans = new Map();
    /**
     * Serialization is SEMANTIC: provenance (statementId, source lines, spans)
     * says where the text lives, not what the statement means, so it is
     * excluded. The engine's incremental-reload fingerprint and the conformance
     * suite both compare statements via JSON — two parses of the same text must
     * compare equal even though every parse mints fresh ids.
     */
    toJSON() {
        const out = {};
        for (const [k, v] of Object.entries(this)) {
            if (k === 'statementId' || k === 'sourceLine' || k === 'sourceEndLine'
                || k === 'sourceShared' || k === 'propertySpans')
                continue;
            out[k] = v;
        }
        return out;
    }
    kind = 'loop';
    clip = '';
    /**
     * The clip name as WRITTEN on the statement line, lowercased — a gen
     * block's name before resolution rewrote `clip` to `generation/<slug>`.
     * This is what `attach <ref>` / `follow <ref>` match, so `gen ferry` +
     * `loop ferry` makes `attach ferry` mean something in an all-generated
     * scene. Null when the written token IS the clip.
     */
    clipToken = null;
    count = 1;
    start = RangeOrValue.Zero;
    end = RangeOrValue.Null;
    endFade = RangeOrValue.Null;
    duration = RangeOrValue.Null;
    every = RangeOrValue.Null;
    volume = RangeOrValue.One;
    pitch = RangeOrValue.One;
    /** Null keeps legacy_v1 and allows an explicit group default. */
    distanceProfile = null;
    /**
     * `spl <dB>` — the source's EMISSION level: dB SPL at 1 m, stated by the
     * script (a value or a range, clamped 0–140). How loud the thing IS, as
     * opposed to `volume`, which in a calibrated scene becomes a dB trim on top
     * of it; propagation (distance, occlusion) is the engine's
     * (spatial/LevelModel.ts). Null = not stated. A scene where any statement
     * or entity states one is CALIBRATED and its levels are governed by the
     * HDR window; otherwise `volume` is the gain, as it always was.
     */
    spl = RangeOrValue.Null;
    /**
     * `voice <id>` — render this voice's audio with a SPEECH synthesiser using
     * the named upstream voice, instead of the sound generator. The engine does
     * not synthesise anything itself: the id rides out on the generation
     * request and the app's generator picks the path (`lib/npcVoice.ts`).
     *
     * Representation, not world knowledge — the script says which synthetic
     * voice a source uses, exactly as it says which clip. Null = a sound, not
     * speech, which is every voice that does not ask otherwise.
     */
    voiceId = null;
    /**
     * `spl follow <signal> <in> <out> [pow k]` — the emission follows a signal
     * (rolling noise from an entity's `velocity`), re-read every spatial tick.
     * Owns the emission when set; `spl` is ignored for it.
     */
    splFollow = null;
    overlap = false;
    persistent = false;
    mute = false;
    solo = false;
    isGenerated = false;
    /**
     * True for statements produced by expanding a count-multiplied gen voice
     * ("5 * loop gen note" → note_1..note_5). Each variant must get its OWN
     * generated take — cache lookups must never alias them to each other.
     */
    isCountVariant = false;
    /**
     * Which copy this is among its count-variants, 0-based (note_1 → 0). With
     * `variants`, it addresses the copy's takes in the SERVER's take pool for
     * the prompt: copy c, pool rank k asks for take `c * variants + k`, so the
     * same scene gets the same distinct takes on every device instead of
     * buying fresh ones per play.
     */
    countIndex = 0;
    /**
     * `variants <n>` — a POOL of n distinct takes (2–8) for one gen voice: the
     * engine resolves `generation/<prompt>`, `…#2` … `…#n`, every oneshot fire
     * plays a random take (never the one that just played), a loop settles on
     * one at load. 1 = a single take (the default).
     */
    variants = 1;
    /** Explicit, document-owned bank references override generated take slots. */
    recordings = null;
    genPrompt = null;
    /** Explicit generated-bank identity; legacy scripts retain prompt-derived names. */
    genKey = null;
    genDuration = RangeOrValue.Null;
    genInfluence = RangeOrValue.Null;
    genLoopable = false;
    fadeIn = RangeOrValue.Null;
    fadeOut = RangeOrValue.Null;
    randomStart = false;
    /** Cycle through landed recordings in order (`in_order`). */
    takesInOrder = false;
    // ── Transform (scene-graph spec §3) ──
    /**
     * `rotate <deg>` — the source's yaw, degrees, 0 = facing +Z (ahead),
     * positive toward +X. Composes into an attached child's local offset;
     * reserved for panner directivity later (cones are neutral today).
     */
    rotateDeg = 0;
    /**
     * `scale <n>` — uniform scalar, multiplying the source's EXTENT
     * (`radius`/`ring`) and nothing else: never attenuation distance, gain, or
     * sends — no engine anywhere makes scale acoustic, and departing from that
     * must stay legible. Composes multiplicatively down attachments.
     */
    scaleFactor = 1;
    /**
     * `attach <ref>` — parent this voice to another scene node: `listener`, or
     * another voice's written clip token. `place` under an attached voice is
     * PARENT-RELATIVE (rotated by the parent's yaw). One level deep only.
     */
    attachRef = null;
    /**
     * `follow <ref> [offset x y z]` — the constraint-flavoured alternative to
     * attach: track the target's position (offset in the target's yaw frame)
     * WITHOUT adopting its scale or lifecycle.
     */
    followTarget = null;
    /**
     * Traversal rate override for a compiled `path` — cycles per second,
     * bypassing the normalized mapTrajectorySpeed knob. Null = the knob.
     */
    trajectoryCycleHz = null;
    /** Authoring identity, independent of clip names and spawned track keys. */
    sourceId = null;
    /** Shared recording/take and emission clock across spatial emitters. */
    programId = null;
    /** Recording content role, independent of spatial extent or the selected take. */
    sourceRole = null;
    /** Explicit sound catalog identity retained across take replacement. */
    catalogRef = null;
    /** Hold the terminal waypoint; sound lifetime remains independent. */
    trajectoryOnce = false;
    trajectoryContent = "";
    /**
     * An authored path starts at its first waypoint, not at a random phase.
     * (The engine still draws its RNG so seeded streams stay aligned.)
     */
    trajectoryPhaseZero = false;
    // Spatial
    wanderType = WanderType.None;
    areaMin = { x: 0, y: 0, z: 0 };
    areaMax = { x: 0, y: 0, z: 0 };
    wanderHz = RangeOrValue.single(0.5); // 0-1 normalized, 0.5 = gentle drift
    /** True once a region has been set by `place` (or `move` axes). Lets `place`
     *  own the region and semantic `move` verbs own the motion, order-independently. */
    hasPlacement = false;
    /**
     * `at <ref>` — the voice lives ON a procedural-world object. `ref` is an
     * object id (`oak_12`: fixed there), a scatter/fixture id or kind (`oak`,
     * `tree`: a random instance per fire for oneshots, the nearest for loops),
     * `water` (the nearest point of the water body, followed live), `canopy`
     * (the nearest crown over the listener) or `ground` (a random ground point
     * per fire). Resolved by the engine against the loaded world; without a
     * world the voice keeps its `place`.
     */
    hostRef = null;
    /** `at <ref> top|base|inside` — where on the host the sound attaches (default: the body). */
    hostAttach = 'body';
    /**
     * `at <strip id> pass` — the voice is a thing TRAVELLING along the strip (a
     * car on a road, a boat on a canal, a train on a railway): at each fire it
     * runs the strip's polyline, passing the point nearest the listener at
     * roughly mid-clip, with Doppler from its own motion. `fixed` = heard from
     * the strip's nearest stretch (the road's continuous bed).
     */
    hostMotion = 'fixed';
    /**
     * `active <a>to<b> [<a>to<b>…]` — hour-of-day windows (0–24) the voice is
     * audible in; outside them it fades to silence. Read against the world's
     * `hour` signal. Null = always.
     */
    activeHours = null;
    /**
     * `quiet <signal> <threshold> [<signal> <threshold>…]` — the signal level
     * above which the voice fades out (a songbird stops in a downpour: `quiet
     * rain 0.5`; a bird you cannot hear over the rush hour: `quiet traffic
     * 0.9`). Any signal — the world's weather, or a scene control the `world`
     * block defines. Empty = no gate.
     */
    quietGates = [];
    /**
     * `line` — the source is a LINE (a river, a road, a shoreline): level falls
     * ~3 dB per doubling of distance instead of ~6, because you always hear a
     * stretch of it. Combine with `at water` (nearest point followed live).
     */
    line = false;
    /**
     * `pace follow <signal> <in> <out>` — multiplies the `every` interval of a
     * oneshot at each schedule: crickets chirp faster when the `temp` signal
     * rises (`pace follow temp 10to30 3to0.6`). Null = every as written.
     */
    paceFollow = null;
    /**
     * The `entity` block this statement is a member of (Entities.ts), null for
     * a free-standing voice. Members sit at their instance's body: the engine
     * spawns one track per member per instance instead of scheduling them
     * from `scheduleAll`.
     */
    entityId = null;
    /**
     * `chance <p>` — a oneshot member without `every` fires ONCE per instance
     * life with this probability, at a random moment of the life (the parser
     * parks such members as `kind = 'trigger'` with no event name). Null =
     * not a chance member.
     */
    chance = null;
    /**
     * `emit <event>` — when this sound actually starts (a fire, a loop start),
     * broadcast the event from the voice's position through
     * `SatieEngine.fireEvent`, so `on <event>` voices can answer it. Open
     * vocabulary; null = nothing broadcast.
     */
    emit = null;
    /**
     * `within <m>` — a trigger voice answers only events whose payload position
     * lies within this many metres of the voice. Null = any distance.
     */
    within = null;
    /** Maximum responders from this authored source per broadcast; 0 = all. */
    responders = 0;
    /** Probability this source responds to a broadcast (one draw per source). */
    respondChance = 1;
    customTrajectoryName = null; // for WanderType.Custom
    isGenTrajectory = false; // true if trajectory needs generation
    genTrajectoryPrompt = null; // description for trajectory gen
    genTrajectoryDuration = 30; // cycle length in seconds
    genTrajectoryResolution = 8192; // LUT point count
    genTrajectorySmoothing = 0; // post-process smoothing 0-1
    genTrajectorySeed = 0; // random seed (0 = random)
    genTrajectoryGround = false; // constrain to ground plane
    genTrajectoryVariation = 0.5; // speed variation 0-1
    noise = 0; // trajectory noise amplitude 0-1
    visual = [];
    visualSize = 1; // multiplier for visual object scale (default 1 = current size, max 10)
    /** Viewport background color (hex). Set via `background` property. Applies globally. */
    background = null;
    /**
     * Trigger voices (`kind === 'trigger'`, written `on <event>`): the OPEN
     * event name this voice answers to. Fired via SatieEngine.fireEvent —
     * nothing in the engine enumerates event names.
     */
    eventName = null;
    /**
     * `when <signal> <lo>to<hi>` — edge-triggered condition: fire when the
     * signal enters the band. On a non-trigger statement this converts it to
     * one; combined with `on` it gates the event.
     */
    whenCondition = null;
    /** Minimum seconds between fires of a trigger voice (`cooldown`). */
    cooldown = RangeOrValue.Null;
    // Signal bindings — property follows a measured channel (see Signals.ts).
    // A binding overrides static/interpolated values for that property.
    volumeFollow = null;
    pitchFollow = null;
    /** `occlusion follow <signal> …` — geometry-independent muffle driven by a
     * signal (e.g. game-supplied canopy cover shading a rain field). */
    occlusionFollow = null;
    /** Static base occlusion 0..1 (`occlusion 0.4`). */
    occlusionBase = 0;
    /**
     * Runtime-only: transmission blockage 0..1 for a source inside an
     * enclosure (world grounding / placement council). Not parsed from
     * scripts; written by `setTrackTransmission` so late spawns of the same
     * statement (start-delayed voices, oneshot retriggers) inherit the wall.
     */
    transmissionBlocked = 0;
    /**
     * `field` — a spatially-extended source (rain, wind, crowd): no distance
     * attenuation, position rides the listener at the scripted offset, so it
     * sounds the same everywhere while keeping its direction. Local shading
     * comes from occlusion/zones, not distance.
     */
    field = false;
    /**
     * `radius <m>` — the source is a SPHERE of this radius (meters), not a
     * point. Extent widens the voice across the stereo image as the listener
     * approaches (or the source grows); level reads the closest surface point.
     * Null = point source (near-field auto-widening still applies).
     */
    radius = RangeOrValue.Null;
    /**
     * `ring <m>` — the source is a horizontal RING of this radius around its
     * position (crickets around a clearing). `radius` doubles as the ring
     * band's thickness when both are set.
     */
    ringRadius = RangeOrValue.Null;
    /**
     * `radius fade <m…> every <s>` / `ring fade <m…> every <s>` — SIZE AS A
     * PLAYED PARAMETER. Extent used to be sampled once at track creation and
     * frozen, which made the one gesture spatial-audio instruments are built on
     * (a point that swells until you are standing inside it) unreachable: no
     * amount of position automation reproduces growth. With these, `bed` stops
     * being a discrete mode and becomes the limit of a continuous one.
     *
     * Non-null takes precedence over the static `radius`/`ringRadius` above;
     * the modulation's first value is the size at t=0.
     */
    radiusInterpolation = null;
    ringInterpolation = null;
    /**
     * `bed` — a non-localized, fully-enveloping decorrelated stereo layer:
     * roomtone, air. No position to track, no distance behavior.
     */
    bed = false;
    /** Bed colour (spec 006): a high shelf above 2 kHz in dB on a `bed` voice; null = the engine's default (`BED_TILT_DEFAULT_DB`, from the recordings), 0 = flat. */
    tilt = null;
    /**
     * `music` — a generated voice whose take is MUSIC (a score that supports the scene, non-diegetic)
     * rather than a sound effect: the generation request carries the flag and the app's generator hook
     * sends it to the music model. Written with `bed` it is not placed in the world (spec 001, 2026-10-03).
     */
    music = false;
    /**
     * `synth` - a generated voice whose take comes from Satie's own synthesizer (`engine/synth`): the
     * gen prompt describes a tone, drone, pad or piece of ambient music and a patch is written and
     * rendered for it. Never a sample and never replaced by one (2026-11-12).
     */
    synth = false;
    synthBrightness = RangeOrValue.Null;
    synthBrightnessFollow = null;
    synthBrightnessInterpolation = null;
    synthTempo = RangeOrValue.Null;
    synthTempoFollow = null;
    synthTempoInterpolation = null;
    /**
     * `scatter <shape> <dims…>` — where MANY sources are, as opposed to how
     * large ONE source is (`radius`). A per-instance offset from the voice's
     * placed position, drawn from a spawn distribution: once at voice creation
     * for a loop, and AGAIN ON EVERY FIRE for a one-shot, which is what makes
     * `count` × `every` a particle emitter. Null = every instance sits exactly
     * where it was placed, as before.
     *
     * Inert on hosted (`at`) and entity-member voices: those already have a
     * body deciding where they are, and two placement systems arguing is worse
     * than one.
     */
    scatter = null;
    /**
     * `spread <s>` — per-instance random start DELAY, seconds (Sound Particles'
     * random-delay modifier). Without it `40 * oneshot crow` fires forty crows
     * on the same sample; a flock startles over a few hundred milliseconds.
     * Distinct from `random_start`, which offsets INTO the buffer rather than
     * moving when the voice sounds.
     */
    spread = RangeOrValue.Null;
    /**
     * `zone <name> [name…] [strict]` — scene-state membership. When the engine's
     * scene state (SatieEngine.setSceneState) matches none of the names: strict
     * voices crossfade to silence (surface-specific layers); non-strict voices
     * are occluded by the state's isolation (rain heard muffled through a wall).
     * Names are an OPEN vocabulary — the scene/game defines what states exist.
     */
    zones = null;
    zoneStrict = false;
    /**
     * `in <room>` — acoustic membership in a declared `room`. The voice
     * inherits that room's derived reverb instead of the scene-wide first
     * room. Lowercased at parse; null = no membership.
     */
    roomName = null;
    /**
     * `heard_in <signal> <dB>, …` (spec 012): how much louder or quieter this sound is heard while you
     * are in a soundscape, weighted by that soundscape's 0..1 signal (`in_<id>`, `indoors`; `!name` is
     * 1 minus it). A world-layer sound (the cicadas, everywhere) keeps one recording and one level
     * world-wide; each soundscape's variant may only set how loud it is heard there.
     */
    heardIn = null;
    /**
     * Doppler strength multiplier applied to the automatic radial-velocity
     * pitch shift (1 = physical, 0 = off, >1 exaggerated). Set via `doppler`.
     */
    dopplerStrength = 1;
    // Modulation data for dynamic properties
    volumeInterpolation = null;
    pitchInterpolation = null;
    // Group-level modulation (multiplied with per-voice modulation in the engine)
    groupVolumeModulation = null;
    groupPitchModulation = null;
    moveXMinInterpolation = null;
    moveXMaxInterpolation = null;
    moveYMinInterpolation = null;
    moveYMaxInterpolation = null;
    moveZMinInterpolation = null;
    moveZMaxInterpolation = null;
    moveSpeedInterpolation = null;
    // Color
    staticColor = null;
    staticAlpha = 1;
    colorRedRange = null;
    colorGreenRange = null;
    colorBlueRange = null;
    colorRedInterpolation = null;
    colorGreenInterpolation = null;
    colorBlueInterpolation = null;
    colorAlphaInterpolation = null;
    // DSP
    reverbParams = null;
    delayParams = null;
    filterParams = null;
    distortionParams = null;
    eqParams = null;
    clone() {
        const s = new Statement();
        Object.assign(s, this);
        s.visual = [...this.visual];
        s.areaMin = { ...this.areaMin };
        s.areaMax = { ...this.areaMax };
        return s;
    }
}
/** Display name of a voice — the clip's last path segment, generation indices and underscores stripped (what the viewport labels and the timeline show). */
export function displayNameOf(stmt) {
    if (stmt.genKey && stmt.genPrompt)
        return stmt.genPrompt.split(',')[0].trim();
    return (stmt.clip.split('/').pop() ?? stmt.clip)
        .replace(/_\d+$/, '')
        .replace(/_\d+$/, '')
        .replace(/_/g, ' ')
        .trim();
}
/** Recording content identity; scheduling and spatial treatment do not change the PCM. */
export function generationIdentity(stmt) {
    return JSON.stringify([stmt.genPrompt, stmt.kind === 'loop', stmt.genDuration, stmt.genInfluence,
        stmt.voiceId, stmt.genLoopable, stmt.music, ...(stmt.synth ? ['synth'] : [])]);
}
//# sourceMappingURL=Statement.js.map