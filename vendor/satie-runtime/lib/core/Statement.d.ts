/**
 * Represents a single parsed Satie statement (a sound event).
 * Ported from Satie Unity: Statement class in SatieParser.cs
 */
import type { Trajectory } from '../spatial/Trajectories.js';
import { RangeOrValue } from './RangeOrValue.js';
import type { ScatterSpec } from '../spatial/Scatter';
import { InterpolationData } from './InterpolationData';
import type { FollowBinding, WhenCondition } from './Signals';
import type { DistanceProfile } from '../spatial/WorldAcoustics.js';
import type { RecordingBanks } from './RecordingBanks.js';
export interface GenDefinition {
    name: string;
    prompt: string;
    duration: RangeOrValue;
    influence: RangeOrValue;
    loopable: boolean;
}
export interface TrajectoryGenDefinition {
    name: string;
    prompt: string;
    duration: number;
    resolution: number;
    smoothing: number;
    seed: number;
    ground: boolean;
    variation: number;
}
export declare enum WanderType {
    None = "none",
    Walk = "walk",
    Fly = "fly",
    Fixed = "fixed",
    Spiral = "spiral",
    Orbit = "orbit",
    Lorenz = "lorenz",
    Custom = "custom"
}
export declare function isTrajectoryWanderType(wt: WanderType): boolean;
/** What a statement line starts with: `loop`, `oneshot`, or `on <event>` (a trigger). */
export type StatementKind = 'loop' | 'oneshot' | 'trigger';
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
export interface ReverbParams {
    dryWet: RangeOrValue;
    roomSize: RangeOrValue;
    damping: RangeOrValue;
    dryWetInterpolation: InterpolationData | null;
    roomSizeInterpolation: InterpolationData | null;
    dampingInterpolation: InterpolationData | null;
}
export interface DelayParams {
    dryWet: RangeOrValue;
    time: RangeOrValue;
    feedback: RangeOrValue;
    pingPong: boolean;
    dryWetInterpolation: InterpolationData | null;
    timeInterpolation: InterpolationData | null;
    feedbackInterpolation: InterpolationData | null;
}
export interface FilterParams {
    mode: string;
    cutoff: RangeOrValue;
    resonance: RangeOrValue;
    dryWet: RangeOrValue;
    cutoffInterpolation: InterpolationData | null;
    resonanceInterpolation: InterpolationData | null;
    dryWetInterpolation: InterpolationData | null;
}
export interface DistortionParams {
    mode: string;
    drive: RangeOrValue;
    dryWet: RangeOrValue;
    driveInterpolation: InterpolationData | null;
    dryWetInterpolation: InterpolationData | null;
}
export interface EQParams {
    lowGain: RangeOrValue;
    midGain: RangeOrValue;
    highGain: RangeOrValue;
    lowGainInterpolation: InterpolationData | null;
    midGainInterpolation: InterpolationData | null;
    highGainInterpolation: InterpolationData | null;
}
/** Where a property's value was written, for the script surgeon and inspector. */
export type PropertySpanOrigin = 'own' | 'inline' | 'group' | 'entity';
export interface PropertySpan {
    /** 0-based line index in the ORIGINAL script text; -1 when unknown. */
    line: number;
    origin: PropertySpanOrigin;
}
export declare class Statement {
    /**
     * Unique within one parse run: a stable in-memory identity so the viewport's
     * object handle survives to the text layer without a fuzzy search. -1 until
     * the parser assigns one.
     */
    statementId: number;
    /**
     * 0-based line index of the statement HEAD in the ORIGINAL script text —
     * before any pre-pass inserted, deleted, or split lines. -1 when unknown.
     */
    sourceLine: number;
    /** 0-based original line of the last line of this statement's block; -1 unknown. */
    sourceEndLine: number;
    /**
     * The head line mints more than one statement (multi-clip `and` / folder
     * glob) — a per-voice text edit must split the shared line first.
     */
    sourceShared: boolean;
    /** Property key → where its value was written (own block line, inline `and`, group, entity). */
    propertySpans: Map<string, PropertySpan>;
    /**
     * Serialization is SEMANTIC: provenance (statementId, source lines, spans)
     * says where the text lives, not what the statement means, so it is
     * excluded. The engine's incremental-reload fingerprint and the conformance
     * suite both compare statements via JSON — two parses of the same text must
     * compare equal even though every parse mints fresh ids.
     */
    toJSON(): Record<string, unknown>;
    kind: StatementKind;
    clip: string;
    /**
     * The clip name as WRITTEN on the statement line, lowercased — a gen
     * block's name before resolution rewrote `clip` to `generation/<slug>`.
     * This is what `attach <ref>` / `follow <ref>` match, so `gen ferry` +
     * `loop ferry` makes `attach ferry` mean something in an all-generated
     * scene. Null when the written token IS the clip.
     */
    clipToken: string | null;
    count: number;
    start: RangeOrValue;
    end: RangeOrValue;
    endFade: RangeOrValue;
    duration: RangeOrValue;
    every: RangeOrValue;
    volume: RangeOrValue;
    pitch: RangeOrValue;
    /** Null keeps legacy_v1 and allows an explicit group default. */
    distanceProfile: DistanceProfile | null;
    /**
     * `spl <dB>` — the source's EMISSION level: dB SPL at 1 m, stated by the
     * script (a value or a range, clamped 0–140). How loud the thing IS, as
     * opposed to `volume`, which in a calibrated scene becomes a dB trim on top
     * of it; propagation (distance, occlusion) is the engine's
     * (spatial/LevelModel.ts). Null = not stated. A scene where any statement
     * or entity states one is CALIBRATED and its levels are governed by the
     * HDR window; otherwise `volume` is the gain, as it always was.
     */
    spl: RangeOrValue;
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
    voiceId: string | null;
    /**
     * `spl follow <signal> <in> <out> [pow k]` — the emission follows a signal
     * (rolling noise from an entity's `velocity`), re-read every spatial tick.
     * Owns the emission when set; `spl` is ignored for it.
     */
    splFollow: FollowBinding | null;
    overlap: boolean;
    persistent: boolean;
    mute: boolean;
    solo: boolean;
    isGenerated: boolean;
    /**
     * True for statements produced by expanding a count-multiplied gen voice
     * ("5 * loop gen note" → note_1..note_5). Each variant must get its OWN
     * generated take — cache lookups must never alias them to each other.
     */
    isCountVariant: boolean;
    /**
     * Which copy this is among its count-variants, 0-based (note_1 → 0). With
     * `variants`, it addresses the copy's takes in the SERVER's take pool for
     * the prompt: copy c, pool rank k asks for take `c * variants + k`, so the
     * same scene gets the same distinct takes on every device instead of
     * buying fresh ones per play.
     */
    countIndex: number;
    /**
     * `variants <n>` — a POOL of n distinct takes (2–8) for one gen voice: the
     * engine resolves `generation/<prompt>`, `…#2` … `…#n`, every oneshot fire
     * plays a random take (never the one that just played), a loop settles on
     * one at load. 1 = a single take (the default).
     */
    variants: number;
    /** Explicit, document-owned bank references override generated take slots. */
    recordings: RecordingBanks | null;
    genPrompt: string | null;
    /** Explicit generated-bank identity; legacy scripts retain prompt-derived names. */
    genKey: string | null;
    genDuration: RangeOrValue;
    genInfluence: RangeOrValue;
    genLoopable: boolean;
    fadeIn: RangeOrValue;
    fadeOut: RangeOrValue;
    randomStart: boolean;
    /** Cycle through landed recordings in order (`in_order`). */
    takesInOrder: boolean;
    /**
     * `rotate <deg>` — the source's yaw, degrees, 0 = facing +Z (ahead),
     * positive toward +X. Composes into an attached child's local offset;
     * reserved for panner directivity later (cones are neutral today).
     */
    rotateDeg: number;
    /**
     * `scale <n>` — uniform scalar, multiplying the source's EXTENT
     * (`radius`/`ring`) and nothing else: never attenuation distance, gain, or
     * sends — no engine anywhere makes scale acoustic, and departing from that
     * must stay legible. Composes multiplicatively down attachments.
     */
    scaleFactor: number;
    /**
     * `attach <ref>` — parent this voice to another scene node: `listener`, or
     * another voice's written clip token. `place` under an attached voice is
     * PARENT-RELATIVE (rotated by the parent's yaw). One level deep only.
     */
    attachRef: string | null;
    /**
     * `follow <ref> [offset x y z]` — the constraint-flavoured alternative to
     * attach: track the target's position (offset in the target's yaw frame)
     * WITHOUT adopting its scale or lifecycle.
     */
    followTarget: {
        ref: string;
        offset: Vec3;
    } | null;
    /**
     * Traversal rate override for a compiled `path` — cycles per second,
     * bypassing the normalized mapTrajectorySpeed knob. Null = the knob.
     */
    trajectoryCycleHz: number | null;
    /** Authoring identity, independent of clip names and spawned track keys. */
    sourceId: string | null;
    /** Shared recording/take and emission clock across spatial emitters. */
    programId: string | null;
    /** Recording content role, independent of spatial extent or the selected take. */
    sourceRole: 'ambience' | 'source' | null;
    /** Explicit sound catalog identity retained across take replacement. */
    catalogRef: string | null;
    /** Hold the terminal waypoint; sound lifetime remains independent. */
    trajectoryOnce: boolean;
    trajectoryContent: string;
    /** Non-enumerable compiled path reference, pinned to this parsed revision. */
    pathTrajectory?: Trajectory;
    /**
     * An authored path starts at its first waypoint, not at a random phase.
     * (The engine still draws its RNG so seeded streams stay aligned.)
     */
    trajectoryPhaseZero: boolean;
    wanderType: WanderType;
    areaMin: Vec3;
    areaMax: Vec3;
    wanderHz: RangeOrValue;
    /** True once a region has been set by `place` (or `move` axes). Lets `place`
     *  own the region and semantic `move` verbs own the motion, order-independently. */
    hasPlacement: boolean;
    /**
     * `at <ref>` — the voice lives ON a procedural-world object. `ref` is an
     * object id (`oak_12`: fixed there), a scatter/fixture id or kind (`oak`,
     * `tree`: a random instance per fire for oneshots, the nearest for loops),
     * `water` (the nearest point of the water body, followed live), `canopy`
     * (the nearest crown over the listener) or `ground` (a random ground point
     * per fire). Resolved by the engine against the loaded world; without a
     * world the voice keeps its `place`.
     */
    hostRef: string | null;
    /** `at <ref> top|base|inside` — where on the host the sound attaches (default: the body). */
    hostAttach: 'body' | 'top' | 'base' | 'inside';
    /**
     * `at <strip id> pass` — the voice is a thing TRAVELLING along the strip (a
     * car on a road, a boat on a canal, a train on a railway): at each fire it
     * runs the strip's polyline, passing the point nearest the listener at
     * roughly mid-clip, with Doppler from its own motion. `fixed` = heard from
     * the strip's nearest stretch (the road's continuous bed).
     */
    hostMotion: 'fixed' | 'pass';
    /**
     * `active <a>to<b> [<a>to<b>…]` — hour-of-day windows (0–24) the voice is
     * audible in; outside them it fades to silence. Read against the world's
     * `hour` signal. Null = always.
     */
    activeHours: [number, number][] | null;
    /**
     * `quiet <signal> <threshold> [<signal> <threshold>…]` — the signal level
     * above which the voice fades out (a songbird stops in a downpour: `quiet
     * rain 0.5`; a bird you cannot hear over the rush hour: `quiet traffic
     * 0.9`). Any signal — the world's weather, or a scene control the `world`
     * block defines. Empty = no gate.
     */
    quietGates: {
        signal: string;
        threshold: number;
    }[];
    /**
     * `line` — the source is a LINE (a river, a road, a shoreline): level falls
     * ~3 dB per doubling of distance instead of ~6, because you always hear a
     * stretch of it. Combine with `at water` (nearest point followed live).
     */
    line: boolean;
    /**
     * `pace follow <signal> <in> <out>` — multiplies the `every` interval of a
     * oneshot at each schedule: crickets chirp faster when the `temp` signal
     * rises (`pace follow temp 10to30 3to0.6`). Null = every as written.
     */
    paceFollow: FollowBinding | null;
    /**
     * The `entity` block this statement is a member of (Entities.ts), null for
     * a free-standing voice. Members sit at their instance's body: the engine
     * spawns one track per member per instance instead of scheduling them
     * from `scheduleAll`.
     */
    entityId: string | null;
    /**
     * `chance <p>` — a oneshot member without `every` fires ONCE per instance
     * life with this probability, at a random moment of the life (the parser
     * parks such members as `kind = 'trigger'` with no event name). Null =
     * not a chance member.
     */
    chance: number | null;
    /**
     * `emit <event>` — when this sound actually starts (a fire, a loop start),
     * broadcast the event from the voice's position through
     * `SatieEngine.fireEvent`, so `on <event>` voices can answer it. Open
     * vocabulary; null = nothing broadcast.
     */
    emit: string | null;
    /**
     * `within <m>` — a trigger voice answers only events whose payload position
     * lies within this many metres of the voice. Null = any distance.
     */
    within: number | null;
    /** Maximum responders from this authored source per broadcast; 0 = all. */
    responders: number;
    /** Probability this source responds to a broadcast (one draw per source). */
    respondChance: number;
    customTrajectoryName: string | null;
    isGenTrajectory: boolean;
    genTrajectoryPrompt: string | null;
    genTrajectoryDuration: number;
    genTrajectoryResolution: number;
    genTrajectorySmoothing: number;
    genTrajectorySeed: number;
    genTrajectoryGround: boolean;
    genTrajectoryVariation: number;
    noise: number;
    visual: string[];
    visualSize: number;
    /** Viewport background color (hex). Set via `background` property. Applies globally. */
    background: string | null;
    /**
     * Trigger voices (`kind === 'trigger'`, written `on <event>`): the OPEN
     * event name this voice answers to. Fired via SatieEngine.fireEvent —
     * nothing in the engine enumerates event names.
     */
    eventName: string | null;
    /**
     * `when <signal> <lo>to<hi>` — edge-triggered condition: fire when the
     * signal enters the band. On a non-trigger statement this converts it to
     * one; combined with `on` it gates the event.
     */
    whenCondition: WhenCondition | null;
    /** Minimum seconds between fires of a trigger voice (`cooldown`). */
    cooldown: RangeOrValue;
    volumeFollow: FollowBinding | null;
    pitchFollow: FollowBinding | null;
    /** `occlusion follow <signal> …` — geometry-independent muffle driven by a
     * signal (e.g. game-supplied canopy cover shading a rain field). */
    occlusionFollow: FollowBinding | null;
    /** Static base occlusion 0..1 (`occlusion 0.4`). */
    occlusionBase: number;
    /**
     * Runtime-only: transmission blockage 0..1 for a source inside an
     * enclosure (world grounding / placement council). Not parsed from
     * scripts; written by `setTrackTransmission` so late spawns of the same
     * statement (start-delayed voices, oneshot retriggers) inherit the wall.
     */
    transmissionBlocked: number;
    /**
     * `field` — a spatially-extended source (rain, wind, crowd): no distance
     * attenuation, position rides the listener at the scripted offset, so it
     * sounds the same everywhere while keeping its direction. Local shading
     * comes from occlusion/zones, not distance.
     */
    field: boolean;
    /**
     * `radius <m>` — the source is a SPHERE of this radius (meters), not a
     * point. Extent widens the voice across the stereo image as the listener
     * approaches (or the source grows); level reads the closest surface point.
     * Null = point source (near-field auto-widening still applies).
     */
    radius: RangeOrValue;
    /**
     * `ring <m>` — the source is a horizontal RING of this radius around its
     * position (crickets around a clearing). `radius` doubles as the ring
     * band's thickness when both are set.
     */
    ringRadius: RangeOrValue;
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
    radiusInterpolation: InterpolationData | null;
    ringInterpolation: InterpolationData | null;
    /**
     * `bed` — a non-localized, fully-enveloping decorrelated stereo layer:
     * roomtone, air. No position to track, no distance behavior.
     */
    bed: boolean;
    /** Bed colour (spec 006): a high shelf above 2 kHz in dB on a `bed` voice; null = the engine's default (`BED_TILT_DEFAULT_DB`, from the recordings), 0 = flat. */
    tilt: number | null;
    /**
     * `music` — a generated voice whose take is MUSIC (a score that supports the scene, non-diegetic)
     * rather than a sound effect: the generation request carries the flag and the app's generator hook
     * sends it to the music model. Written with `bed` it is not placed in the world (spec 001, 2026-10-03).
     */
    music: boolean;
    /**
     * `synth` - a generated voice whose take comes from Satie's own synthesizer (`engine/synth`): the
     * gen prompt describes a tone, drone, pad or piece of ambient music and a patch is written and
     * rendered for it. Never a sample and never replaced by one (2026-11-12).
     */
    synth: boolean;
    synthBrightness: RangeOrValue;
    synthBrightnessFollow: FollowBinding | null;
    synthBrightnessInterpolation: InterpolationData | null;
    synthTempo: RangeOrValue;
    synthTempoFollow: FollowBinding | null;
    synthTempoInterpolation: InterpolationData | null;
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
    scatter: ScatterSpec | null;
    /**
     * `spread <s>` — per-instance random start DELAY, seconds (Sound Particles'
     * random-delay modifier). Without it `40 * oneshot crow` fires forty crows
     * on the same sample; a flock startles over a few hundred milliseconds.
     * Distinct from `random_start`, which offsets INTO the buffer rather than
     * moving when the voice sounds.
     */
    spread: RangeOrValue;
    /**
     * `zone <name> [name…] [strict]` — scene-state membership. When the engine's
     * scene state (SatieEngine.setSceneState) matches none of the names: strict
     * voices crossfade to silence (surface-specific layers); non-strict voices
     * are occluded by the state's isolation (rain heard muffled through a wall).
     * Names are an OPEN vocabulary — the scene/game defines what states exist.
     */
    zones: string[] | null;
    zoneStrict: boolean;
    /**
     * `in <room>` — acoustic membership in a declared `room`. The voice
     * inherits that room's derived reverb instead of the scene-wide first
     * room. Lowercased at parse; null = no membership.
     */
    roomName: string | null;
    /**
     * `heard_in <signal> <dB>, …` (spec 012): how much louder or quieter this sound is heard while you
     * are in a soundscape, weighted by that soundscape's 0..1 signal (`in_<id>`, `indoors`; `!name` is
     * 1 minus it). A world-layer sound (the cicadas, everywhere) keeps one recording and one level
     * world-wide; each soundscape's variant may only set how loud it is heard there.
     */
    heardIn: Array<{
        signal: string;
        invert: boolean;
        db: number;
    }> | null;
    /**
     * Doppler strength multiplier applied to the automatic radial-velocity
     * pitch shift (1 = physical, 0 = off, >1 exaggerated). Set via `doppler`.
     */
    dopplerStrength: number;
    volumeInterpolation: InterpolationData | null;
    pitchInterpolation: InterpolationData | null;
    groupVolumeModulation: InterpolationData | null;
    groupPitchModulation: InterpolationData | null;
    moveXMinInterpolation: InterpolationData | null;
    moveXMaxInterpolation: InterpolationData | null;
    moveYMinInterpolation: InterpolationData | null;
    moveYMaxInterpolation: InterpolationData | null;
    moveZMinInterpolation: InterpolationData | null;
    moveZMaxInterpolation: InterpolationData | null;
    moveSpeedInterpolation: InterpolationData | null;
    staticColor: string | null;
    staticAlpha: number;
    colorRedRange: RangeOrValue | null;
    colorGreenRange: RangeOrValue | null;
    colorBlueRange: RangeOrValue | null;
    colorRedInterpolation: InterpolationData | null;
    colorGreenInterpolation: InterpolationData | null;
    colorBlueInterpolation: InterpolationData | null;
    colorAlphaInterpolation: InterpolationData | null;
    reverbParams: ReverbParams | null;
    delayParams: DelayParams | null;
    filterParams: FilterParams | null;
    distortionParams: DistortionParams | null;
    eqParams: EQParams | null;
    clone(): Statement;
}
/** Display name of a voice — the clip's last path segment, generation indices and underscores stripped (what the viewport labels and the timeline show). */
export declare function displayNameOf(stmt: Statement): string;
/** Recording content identity; scheduling and spatial treatment do not change the PCM. */
export declare function generationIdentity(stmt: Statement): string;
//# sourceMappingURL=Statement.d.ts.map