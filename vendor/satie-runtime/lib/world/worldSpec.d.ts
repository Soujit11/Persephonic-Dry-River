import { type EntityBehavior } from '../core/EntityBehavior.js';
import { type EntityBody } from '../core/EntityBody.js';
/**
 * WorldSpec — the compact, seeded recipe for a procedural world.
 *
 * The model writes CONTENT into this shape — what a place is made of, what
 * stands in it, what lines run through it, what the ground is, who makes
 * sound where and when — all as free text and numbers. Code holds
 * REPRESENTATION only: a small vocabulary of GEOMETRY (a column, a box, a
 * blob; a strip, a patch) and ACOUSTIC BEHAVIOUR (solid or porous, liquid,
 * where on a thing a sound attaches). Nothing here knows what a tree, a
 * street or a harbour is: an oak is a porous blob raised on a stem, a tower
 * is a solid box, an avenue is a paved strip, a pond is a liquid patch, and
 * the model says so. That is what lets any place the model can describe be
 * built without touching this file. Same spec + same seed = same world.
 *
 * The spec lives inside the `.satie` script (`world` block) so a scene stays a
 * single editable artifact; `parseWorldBlock` / `formatWorldBlock` are the
 * boundary between DSL text and this JSON.
 */
/** Vec2 on the ground plane: [x, z] in metres, listener at the origin. */
export type Ground2 = [number, number];
/**
 * Where an object class or a ground layer may be placed. Distances to a
 * feature are measured from its EDGE (a strip's kerb, a patch's rim);
 * `listener` is a keep-out radius around the origin.
 */
export interface PlacementMask {
    slopeMaxDeg?: number;
    slopeMinDeg?: number;
    altitudeM?: [number, number];
    /** Only within `m` of feature `id` (a strip / patch id, or `listener`). */
    near?: {
        id: string;
        m: number;
    };
    /** Never within `m` of feature `id` (a strip / patch id, or `listener`). */
    away?: {
        id: string;
        m: number;
    };
}
/**
 * The drawn / raycast primitive of an object class. `blob` is an ellipsoid,
 * `column` a full-height cylinder, `box` a rectangular block. A body may be
 * `raised` above the ground on a thin `stem` (a crown on a trunk, a sign on
 * a post, a water tower on legs).
 */
export type Shape = 'blob' | 'column' | 'box';
export interface ObjectClass {
    /** Stable id used by object ids (`oak_12`) and by ecology hosts. */
    id: string;
    /** Free-text label ("old oak", "prewar office tower", "granite boulder"). */
    label: string;
    /** Free-text surface material ("broad leaves", "brick", "granite"). */
    material: string;
    shape: Shape;
    /**
     * 0 = solid (occludes like a wall, reflects); 1 = fully porous (sound passes
     * with a soft high-frequency loss, rain lands on it, things live inside).
     * Foliage ≈ 0.7, a hedge ≈ 0.5, scaffolding ≈ 0.6, masonry 0.
     */
    porous: number;
    /** Instances per 100 m² of eligible ground. */
    densityPer100m2: number;
    heightM: [number, number];
    /** Body radius (blob / column) or half the footprint (box), metres. */
    radiusM: [number, number];
    /** Fraction of the height at which the body starts (0 = on the ground; a tree crown ≈ 0.45). */
    raised: number;
    /** Radius of the stem under a raised body (metres); 0 = none. */
    stemRadiusM: [number, number];
    mask?: PlacementMask;
}
export interface FixtureSpec {
    id: string;
    /** Free-text label ("campfire", "halal food cart", "cabin"). */
    label: string;
    /** Width, height, depth in metres. */
    sizeM: [number, number, number];
    material: string;
    /** 0 solid … 1 porous (a tent, a market awning). */
    porous?: number;
    /** Explicit ground position, or null to resolve from `relativeTo`. */
    position?: Ground2 | null;
    /** Named feature surface or previously declared fixture top supporting the base. */
    support?: string;
    /** Metres above the support (negative values submerge a floating hull). */
    elevationM?: number;
    /**
     * Yaw about +Y in degrees (`rotate <deg>` in the world block), the same sense
     * as three.js `rotation.y`: 90 turns the fixture's +X side to face -Z. Absent
     * or 0 = axis-aligned. Clamped to [-360, 360]; 0 is dropped.
     */
    yawDeg?: number;
    /** Relative placement: near a fixture / object class / strip / patch id, or `listener`. */
    relativeTo?: {
        ref: string;
        distanceM: number;
        /** Compass bearing from the reference (degrees, 0 = +Z ahead, 90 = right). Random when omitted. */
        bearingDeg?: number;
    };
    /** True when the fixture is hollow and enterable (a hut): drawn as a shell, acts as an enclosure. */
    enclosure?: boolean;
    /**
     * With an `interior`, fixtures default INSIDE the room; `outside: true` puts
     * this one on the exterior terrain instead. Ignored when the spec has no
     * interior.
     */
    outside?: boolean;
}
/**
 * An opening in an interior's shell: a window is a glass aperture with a
 * small `open`, a door a wood aperture, a hatch a ceiling one — no kind enum,
 * the material and the numbers say which is which. What is beyond it (`to`)
 * is `outside` or an adjacent space id, and the compiler derives the
 * occlusion of everything heard through this boundary from `open`.
 */
/** The names of a box room's walls, in footprint order (back is -Z, front is +Z ahead of the listener). */
export declare const BOX_WALL_IDS: readonly string[];
export interface ApertureSpec {
    id: string;
    label: string;
    /**
     * The boundary it pierces: a wall bearing (deg, 0 = +Z ahead), the ceiling /
     * floor, or the id of the wall it sits in: a `plan` wall's id, or in a box room `back`,
     * `right`, `front`, `left` (`BOX_WALL_IDS`).
     */
    wall: number | 'ceiling' | 'floor' | string;
    /** With a wall id: the opening's centre along that wall from its first end, metres. Absent = the wall's midpoint. */
    alongM?: number;
    /** Opening [width, height], metres. */
    sizeM: [number, number];
    /** Bottom edge above the floor (wall apertures); absent = vertically centred. A doorway states 0. */
    sillM?: number;
    /** Free text: what closes it ("single-pane glass", "painted wood"). */
    material: string;
    /** 0 shut … 1 fully open. */
    open: number;
    /** What is beyond: `outside` or an adjacent space id. */
    to: string;
}
/**
 * A volume beyond one of the interior's boundaries — a hallway behind the
 * door wall, the unit upstairs, a basement below. Not entered, but heard:
 * sounds hosted on its id sit at its anchor and arrive through the shared
 * boundary (occluded, or through an aperture that leads `to` it).
 */
export interface AdjacentSpaceSpec {
    id: string;
    label: string;
    /** Where it lies: a wall bearing (deg, 0 = +Z ahead) or above / below. */
    direction: number | 'above' | 'below';
    /** How deep the space extends past the boundary, metres (anchor distance). */
    depthM?: number;
    /** Free text: what the shared boundary is made of. */
    material: string;
}
/**
 * One wall of an interior's plan: a segment on the floor in the listener's
 * frame (x right, z ahead, metres), in order around the room. This is the
 * shape every scan-to-layout grammar shares (SceneScript, SpatialLM, Apple
 * RoomPlan: a wall is two endpoints, a height and a material; a door names
 * its wall), so any of them is an adapter away.
 */
export interface WallSpec {
    id: string;
    a: [number, number];
    b: [number, number];
    /** Free text; absent = the interior's `walls`. */
    material?: string;
    /** Absent = the interior's height. */
    heightM?: number;
}
/**
 * The listener is INSIDE a built space. The room is a shoebox with its floor
 * at y = 0 (the frame's ground is always the listener's ground), or — with a
 * `plan` — any closed polygon of walls; the exterior world — terrain,
 * strips, scatter — still exists, realized `elevationM` below the floor, and
 * is heard through the shell: the compiler emits a `room` block for the
 * inside and `occlusion` for everything beyond it.
 */
export interface InteriorSpec {
    /**
     * [width, height, depth] metres; walls at ±w/2 / ±d/2, ceiling at h. With a
     * `plan`, width and depth are the plan's bounding box (derived, never
     * authored) and only the height is the author's.
     */
    sizeM: [number, number, number];
    /**
     * The walls as a closed polygon, in order (each wall's `b` is the next
     * one's `a`; the normalizer closes it). Absent = the shoebox. The listener
     * is inside it by construction: a plan that does not contain the origin is
     * moved so its centre does.
     */
    plan?: WallSpec[];
    floor: string;
    walls: string;
    ceiling: string;
    /** Decay override, seconds; absent = Eyring from size + materials. */
    rt60S?: number;
    /** Floor height above the exterior ground (a third-floor room ≈ 7). */
    elevationM: number;
    apertures: ApertureSpec[];
    spaces: AdjacentSpaceSpec[];
}
/**
 * A LINE feature crossing the patch: a river, a road, a canal, a railway, a
 * path, a shoreline. Carved into the terrain when `carveM` > 0, paved flat
 * otherwise; `liquid` makes its surface water (reflective, rain lands on it,
 * nothing stands in it). `fill` makes everything on one side of the line the
 * feature too (a sea beyond a shoreline, a lake past its edge).
 */
export interface StripSpec {
    id: string;
    label: string;
    widthM: number;
    /** Free-text surface material ("asphalt", "clear water over pebbles", "rails on gravel"). */
    material: string;
    /** Depth below the banks (metres); 0 = flat. */
    carveM: number;
    liquid: boolean;
    /** 0 still … 1 fast: the character of a liquid strip's sound, or traffic tempo. */
    flow: number;
    /** Optional polyline; a default runs past the listener. */
    path?: Ground2[];
    /** Everything on this side of the line is the feature ("right" = +90° from the path direction). */
    fill?: 'left' | 'right';
    /** Free-text material of the margin beside the strip ("mud", "kerb concrete"). */
    edgeMaterial?: string;
}
/** An AREA feature: a pond, a plaza, a clearing, a pit, a lawn. */
export interface PatchSpec {
    id: string;
    label: string;
    radiusM: number;
    material: string;
    /** Depth below the rim (metres); 0 = flat. */
    carveM: number;
    liquid: boolean;
    centre?: Ground2;
    edgeMaterial?: string;
}
export interface GroundLayer {
    /** Free-text surface material ("grass", "leaf litter", "concrete sidewalk", "snow"). */
    material: string;
    /** Relative weight among layers whose masks pass at a cell. */
    weight: number;
    mask?: PlacementMask;
}
export interface WeatherSpec {
    /** 0 dry … 1 downpour. */
    rain: number;
    /** 0 still … 1 gale. */
    wind: number;
    /** 0 clear … 1 dense. */
    fog: number;
}
export interface TimeSpec {
    /** Local hour, 0–24 (fractional). */
    hour: number;
    /** Free text ("late spring"). */
    season: string;
    temperatureC: number;
    /** World minutes that pass per real minute (0 = the hour stands still). */
    clockRate: number;
}
/**
 * A scene-specific state dimension the model defines for THIS place — the
 * things a listener standing there would want to turn: traffic and crowd on
 * a street, the birds' activity in a wood, the sea state in a harbour. Code
 * knows nothing about any of them: each is published as a signal under its
 * `id` (`volume follow traffic …`, `pace follow crowd …`, `quiet traffic 0.8`)
 * and rendered as one slider over `[min, max]`. `weather` and `time` remain
 * the physical state every place has; controls are the ones only this place has.
 */
export interface SceneControl {
    /** Slug, unique among controls, never a built-in signal name (`RESERVED_SIGNALS`). */
    id: string;
    /** Free-text label ("traffic", "how crowded the street is", "sea state"). */
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Free-text unit shown after the readout ("%", "boats/h"). */
    unit?: string;
    description?: string;
}
/** A signal → value map, the `follow` form: at `in[0]` be `out[0]`, at `in[1]` be `out[1]`. */
export interface SignalMap {
    signal: string;
    in: [number, number];
    out: [number, number];
    /**
     * Response curve: the position within `in` (0..1) is raised to this power
     * before it maps onto `out` — >1 stays low then rises steeply (rolling
     * noise against velocity ≈ 1.5), <1 rises early. Absent = 1, linear.
     * Compiled as ` pow <k>` on the follow line.
     */
    curve?: number;
}
/**
 * Where a sound attaches to its host object: the body's centre, its top,
 * its base on the ground, or inside it (heard through its walls).
 */
export type Attach = 'body' | 'top' | 'base' | 'inside';
/**
 * One sound in an entity's REPERTOIRE (`EcologyEntry.sounds`). A member is a
 * component of the body that owns it — never a whole scene — and is heard
 * from the instance's own position: `loop` runs for the instance's life,
 * `oneshot` fires on `everyS` (repeating) or once per life with `chance`,
 * `on` reacts to an event another body broadcast (`emits`) within `withinM`.
 * Per-instance signals a member may `follow`: `velocity` (m/s), `accel`
 * (m/s²), `progress` (0..1 along a route), `age` (s since spawn) — plus
 * every world signal and control a plain entry can read.
 */
export interface EcologySound {
    /** Event playback / generated take length in seconds; omitted for full recordings. */
    durationS?: number;
    sourceRole?: 'ambience' | 'source';
    /** An auditioned recording, bound to this member rather than regenerated. */
    clip?: string;
    /** Slug, unique within the entry; defaults to the label / mode. */
    id?: string;
    label?: string;
    /** Free-text generation prompt: ONE component, dry, close, steady for loops. */
    soundPrompt: string;
    /** The catalog row governing this member (see EcologyEntry.catalog). */
    catalog?: string;
    mode: 'loop' | 'oneshot' | 'on';
    /** Event name reacted to (mode `on` only). */
    on?: string;
    /** React only to events broadcast within this many metres (mode `on`). */
    withinM?: number;
    responders?: number;
    respondChance?: number;
    spreadS?: [number, number];
    /**
     * `voiceId` — render this member with a SPEECH synthesiser using the named
     * upstream voice, instead of the sound generator. What makes an
     * `on speak` member with a `{text}` prompt SAY the words rather than
     * generate a noise like them. Compiled as `voice <id>`.
     */
    voiceId?: string;
    /** Repeat interval for a oneshot; absent = fires once per instance life (see `chance`). */
    everyS?: [number, number];
    /** Probability 0–1 that a oneshot without `everyS` fires during an instance's life. */
    chance?: number;
    /**
     * Emission: dB SPL at 1 m (0–140) — how loud this component IS at its
     * source, as a physicist would state it. Propagation (distance, walls, the
     * body's shape) is computed by the engine from where the instance is, so a
     * far thing keeps its true emission. Absent: the entry's `splDb`, else the
     * engine's `DEFAULT_SPL_DB`. Compiled as `spl <dB>`.
     */
    splDb?: number;
    /**
     * The emission follows a body signal — rolling noise against `velocity`
     * (`out` is dB SPL at 1 m: `[40, 88]` ≈ +30·log10 v), an engine `[55, 80]`.
     * Compiled as `spl follow …`; wins over `splDb`.
     */
    splFollows?: SignalMap;
    /**
     * Relative level 0–1, scaled by the entry's `level`. With an emission
     * stated (`splDb` / `splFollows`) it is NOT re-applied as a fader — the
     * emission is the level; only `0` still silences the member. Without one
     * it compiles to the `volume` trim as before.
     */
    level: number;
    /** Level follows a signal: `out` is a trim fraction of the emission when one is stated (1 = as stated), else of `level`. */
    follows?: SignalMap;
    /** Playback rate follows a signal (`out` is the rate itself, not scaled by level). */
    pitchFollows?: SignalMap;
    /** Interval multiplier from a signal (oneshots with `everyS`); inherits the entry's `pace` when absent. */
    pace?: SignalMap;
    /** Distinct takes pooled for this member; absent = the entity's default pool. */
    variants?: number;
    /** Event broadcast from the body's position whenever this sound fires. */
    emits?: string;
    cooldownS?: number;
    radiusM?: number;
    suppressedBy?: Record<string, number>;
    activeHours?: [number, number][];
}
/** Contact transients must not overlap as multi-second footsteps. No implicit speech/loop cap. */
export declare function ecologySoundDurationS(sound: Pick<EcologySound, 'mode' | 'on' | 'voiceId' | 'durationS'>): number | undefined;
/**
 * A sound source of the place. `host` is an object-class id (a random
 * instance per fire for oneshots, the nearest for loops), a fixture id, a
 * strip id (heard along its length, nearest stretch first), a patch id (its
 * rim), or a geometric anchor: `listener` (the air itself), `air` (something
 * overhead, moving), `ground` (a random point on the ground nearby),
 * `overhead` (whatever body is above the listener — a crown, an awning, a
 * bridge — and the open sky when nothing is).
 *
 * An entry with `sounds` is an ENTITY — a body with kinematics and a
 * repertoire — rather than a clip on a timer: on a strip host (unless
 * `motion: 'line'`) it is a ROUTE whose instances are spawned every
 * `everyS` and travel the strip with real velocity; on a class / fixture /
 * `ground` host it is a POPULATION of `population` instances, each perched
 * on its own host object. The entry's `level` then multiplies each member's,
 * `pace` scales the spawn interval (or the timed members of a population),
 * `activeHours` / `suppressedBy` gate the whole body, `variants` is the
 * members' default take pool.
 */
/**
 * One state of an entity (spec 001). With hours it holds over that part of the time window; with none it
 * is something the entity can do but does not do on its own schedule (a taxi honking), reached by an edit.
 */
export interface EntityState {
    name: string;
    hours?: [number, number];
    sounds?: string[];
}
export interface EcologyEntry {
    /** A score under the place, not a sound in it: generated by the music model, heard as a bed (spec 001). */
    music?: boolean;
    /**
     * Named states over the scene's time window (spec 001, US3): each holds for its hours and names the sounds
     * heard in it. Code turns them into the sounds' `activeHours` (scenePlan `settleStates`).
     */
    states?: EntityState[];
    /** Content of its recording, independent of spatial extent. */
    sourceRole?: 'ambience' | 'source';
    /**
     * The concept this entity is one instance of (spec 006): set when a planned group was split
     * into individuals (`customers`, `customers_2` ... all of concept `customers`). Absent = its own
     * id. Density, requirements and removals count and address concepts; the engine sees entities.
     */
    concept?: string;
    /** Persistent geometry of an entity, independent of its optional sounds. */
    body?: EntityBody;
    behavior?: EntityBehavior;
    id: string;
    /** Free-text species / source label ("robin", "avenue traffic", "rooftop HVAC"). */
    label: string;
    /** Free-text generation prompt for the sound itself (dry, close). Unused when `sounds` is present. */
    soundPrompt: string;
    /**
     * The Sound Source Catalog row whose priors govern this entry (`catalog.ts`),
     * set by `applyCatalogPriors`; pure representation, never model-invented.
     */
    catalog?: string;
    /**
     * A RESOLVED sample binding — a script clip token (`community/rain_tin`,
     * `freesound/creek_2`) the source router matched to this entry, so the
     * compiled voice PLAYS that recording instead of generating. Pure
     * representation: code sets it from retrieval results (never the model
     * inventing catalogue names), the compiler prefers it over `soundPrompt`,
     * and `soundPrompt` stays as the description/fallback. Single token only.
     */
    clip?: string;
    host: string;
    attach?: Attach;
    /** `loop` = continuous; `oneshot` = re-fired every `everyS`. */
    mode: 'loop' | 'oneshot';
    everyS?: [number, number];
    /** Hour windows in which the source is active, e.g. [[4.5, 9], [18, 21]]. Empty/absent = always. */
    activeHours?: [number, number][];
    /**
     * Signal level above which the source goes quiet, per signal: `{ rain: 0.5 }`
     * (a songbird in a downpour), `{ wind: 0.8 }`, or any scene control id
     * (`{ traffic: 0.9 }` — a bird you cannot hear over the rush hour).
     */
    suppressedBy?: Record<string, number>;
    /** Source extent; strips default to `line`, patches to `ring`, `listener` to `bed`. */
    extent?: 'point' | 'radius' | 'ring' | 'bed' | 'line';
    radiusM?: number;
    /**
     * Emission: dB SPL at 1 m (0–140) — how loud the source IS, stated by the
     * model as world knowledge (a songbird ~80, a horn ~110). For an entity it
     * is the members' default. The engine computes what arrives; the compiler
     * emits `spl <dB>` (or `DEFAULT_SPL_DB` when absent, so every compiled
     * script is calibrated).
     */
    splDb?: number;
    /**
     * Relative level 0–1 (1 = the loudest thing in the scene). With `splDb`
     * stated it is NOT re-applied as a fader — the emission is the level; only
     * `0` still silences the source. Without one it compiles to the `volume`
     * trim as before, so a spec that states no emissions keeps its hierarchy.
     */
    level: number;
    /** Level follows a world signal (`wind`, `rain`, `overhead`, `temp`, `hour`, `exposure`, or a scene control id): `out` is a trim fraction of the emission when `splDb` is stated (1 = as stated), else of `level`. */
    follows?: SignalMap;
    /** Oneshot interval multiplier from a signal (crickets speed up with `temp`). */
    pace?: SignalMap;
    /**
     * On a strip host only: `pass` = a thing TRAVELLING along it (a car, a
     * boat, a train — it runs the strip past the listener each fire, with
     * Doppler), `line` = the strip's continuous bed heard along its length.
     * Absent: oneshots pass, loops are the line.
     */
    motion?: 'pass' | 'line';
    /**
     * Distinct generated takes pooled for this source (2–8) so repeated fires
     * never sound stamped from one clip. Absent: 1, or 3 where the compiler
     * judges the source repeats often (`WorldCompile.defaultVariants`).
     */
    variants?: number;
    /** The repertoire (max `MAX_REPERTOIRE`): present = this entry is an entity. */
    sounds?: EcologySound[];
    /** Population size (1–`MAX_POPULATION`) of a non-route entity — individuals in the world; `voices` bounds how many are localised at once. */
    /**
     * `gaitM` — the body WALKS: one footfall every this many metres it
     * travels, drawn per individual. Cadence is `speed / stride`, so nothing
     * states a rate. Each footfall fires that body's own `on step` member from
     * where it stands, with the surface under it as `{text}`. Absent = the body
     * has no gait (a car, a bird on the wing) and never steps.
     */
    gaitM?: [number, number];
    population?: number;
    /** Route entity: cruise speed per instance, m/s (absent: the engine derives it from the strip's `flow`). Population: the speed of a relocation or flight (default 2–6). */
    speedMs?: [number, number];
    /**
     * A population's BEHAVIOUR as numbers (the agent layer, `engine/world/EntityAgents.ts`;
     * compiled to the entity block's `dwell` / `relocate` / `move` / `startle` / `call` /
     * `callers` / `gap` / `voices` / `window` lines). Every one is optional and the engine's
     * defaults are inert (a population that never moves, never startles, always calls,
     * voices everyone) — what a thing does is the model's to say, never the code's.
     */
    /** Seconds an individual stays at a perch before relocating to another anchor of its host; writing it turns relocation on. */
    dwellS?: [number, number];
    /** How far a relocation goes, metres (a free anchor within this band); writing it turns relocation on. */
    relocateM?: [number, number];
    /** How a relocation moves: an arc through the air, or a walk along the ground (absent: inferred from the perch height). Turns relocation on. */
    travel?: 'fly' | 'walk';
    /** Flee when the listener or a positioned event comes within this many metres; absent / 0 = never. */
    startleM?: number;
    /** Silence after a flight, seconds (default 8–20). */
    hushS?: [number, number];
    /** Probability 0–1 that a perch bout is a calling bout (default 1). */
    callChance?: number;
    /** Turn-taking: at most this many individuals calling at once (absent / 0 = unlimited). */
    callers?: number;
    /** Minimum seconds between two call starts across the population. */
    gapS?: [number, number];
    /** Voice budget: only the nearest N individuals within `windowM` are localised voices (absent / 0 = all). */
    voices?: number;
    /** Listener distance beyond which an individual leaves the voice budget (default 120). */
    windowM?: number;
    /**
     * `swayM` — how far a perched individual shifts on the spot, metres.
     * Default 0 (perfectly still), because a bird on a branch is.
     */
    swayM?: number;
    /** Route entity: per pass, `chance` of one halt lasting `s` seconds. */
    stop?: {
        chance: number;
        s: [number, number];
    };
}
export interface WorldSpec {
    version: 2;
    /** Free text: what the place is ("temperate broadleaf forest", "Manhattan avenue corner"). */
    biome: string;
    seed: number;
    sizeM: number;
    terrain: {
        reliefM: number;
        roughness: number;
    };
    ground: GroundLayer[];
    strips: StripSpec[];
    patches: PatchSpec[];
    objects: ObjectClass[];
    fixtures: FixtureSpec[];
    /** Present = the listener is inside a built space (see InteriorSpec). */
    interior?: InteriorSpec;
    weather: WeatherSpec;
    time: TimeSpec;
    /** Scene-specific state dimensions (max `MAX_CONTROLS`), each published as a signal by id. */
    controls: SceneControl[];
    ecology: EcologyEntry[];
    /**
     * Individuals of a population pinned to a place (`instance <entity> <n> at x,z`
     * in the world block). Present only when there is at least one pin; max
     * `MAX_INSTANCE_PINS`, one per entity#index (the last wins). Added 2026-10-02
     * for the scene objects contract: the gizmo moves one person, the script
     * remembers it, and the entity runtime stands that body there
     * (`EntityRuntime.hostPopulationInstance`, since 2026-10-03).
     */
    instancePins?: InstancePin[];
}
/** One individual of an entity population at an authored ground position. */
export interface InstancePin {
    /** The entity's id (a slug, as in `entity <id>`). */
    entity: string;
    /** 0-based individual within the population. */
    index: number;
    position: Ground2;
}
export declare const WORLD_SIZE_MIN_M = 12;
export declare const WORLD_SIZE_MAX_M = 240;
/**
 * Small by default — like a captured (Marble) world, a place is the tens of
 * metres a listener can hear from where they stand. Bigger only when asked.
 */
export declare const WORLD_SIZE_DEFAULT_M = 60;
/** Hard cap on scattered instances so the realizer and the renderer stay bounded. */
export declare const MAX_SCATTER_INSTANCES = 2500;
export declare const MAX_OBJECT_CLASSES = 16;
export declare const MAX_FEATURES = 8;
export declare const MAX_FIXTURES = 24;
/** Pinned individuals (`instance` lines) in one world block. */
export declare const MAX_INSTANCE_PINS = 64;
/** Openings in an interior's shell. */
export declare const MAX_APERTURES = 8;
/** Adjacent spaces beyond an interior's boundaries. */
export declare const MAX_SPACES = 6;
/**
 * Ecology entries. A spec carries the place's whole STATE SPACE — the sources
 * of the described moment plus those silent now that rise with rain, wind,
 * the hour and each control — so it needs room beyond the moment's 10–24.
 */
export declare const MAX_ECOLOGY = 48;
export declare const MAX_CONTROLS = 8;
/** Sounds in one entity's repertoire. */
export declare const MAX_REPERTOIRE = 6;
/** Instances in one population entity. */
export declare const MAX_POPULATION = 48;
/** Spawn interval of a route entity when the entry names none (s). */
export declare const DEFAULT_ROUTE_EVERY_S: [number, number];
/**
 * Signal names the engine publishes or measures itself; a control may not
 * take one of them (its value would shadow, or be shadowed by, the built-in).
 * `velocity` / `accel` / `progress` / `age` are the per-instance signals an
 * entity's members read; `depth` / `submerged` / `liquid` the world fields
 * under the listener (WorldFields.ts).
 */
export declare const RESERVED_SIGNALS: ReadonlySet<string>;
/** The representable emission range, dB SPL at 1 m (the parser's `spl` clamp). */
export declare const SPL_MAX_DB = 140;
/**
 * How an entry with a repertoire compiles: a ROUTE (instances spawned on a
 * strip and travelling it), a POPULATION (instances each perched on its own
 * host object / ground point), or null — no repertoire, or a host that is
 * not a body (`listener`, `air`, `overhead`, a patch's rim), which the
 * compiler renders as plain voices instead.
 */
export declare function repertoireKind(entry: Pick<EcologyEntry, 'host' | 'sounds' | 'motion' | 'population' | 'body'>, spec: Pick<WorldSpec, 'strips' | 'patches'>): 'route' | 'population' | null;
/** Most walls a plan may hold. */
export declare const MAX_WALLS = 24;
/**
 * The room's footprint on the floor as a closed polygon, listener frame:
 * the plan's corners, or the shoebox's four. Every consumer that asks "is
 * this point in the room" or "where does this bearing meet a wall" works from
 * this, so the box and the plan are one code path.
 */
export declare function interiorFootprint(it: Pick<InteriorSpec, 'sizeM' | 'plan'>): [number, number][];
/** Point-in-polygon (even-odd) on the floor. Allocation-free. */
export declare function pointInFootprint(poly: readonly (readonly [number, number])[], x: number, z: number): boolean;
/** Shortest distance from a floor point to the polygon's edges, metres. */
export declare function distanceToFootprintEdge(poly: readonly (readonly [number, number])[], x: number, z: number): number;
/** Signed area (shoelace); positive when the corners run counter-clockwise seen from above (+y). */
export declare function footprintArea(poly: readonly (readonly [number, number])[]): number;
export declare function footprintPerimeter(poly: readonly (readonly [number, number])[]): number;
/**
 * Coerce an untrusted object (LLM output, script text, a version-1 spec) into
 * a valid WorldSpec. Never throws: bad fields fall back to neutral
 * representation defaults, bad list entries are dropped. Ids are slugged and
 * made unique. Version-1 `water` / `road` / `scatter` are mapped onto
 * strips / patches / object classes with the ids `water`, `road`.
 */
export declare function normalizeWorldSpec(input: unknown): WorldSpec;
/** Stable JSON for embedding in a script / hashing (sorted keys, no whitespace). */
export declare function serializeWorldSpec(spec: WorldSpec): string;
/** Parse a JSON string (possibly wrapped in prose / fences) into a WorldSpec, or null when no object is found. */
export declare function parseWorldSpecJSON(text: string): WorldSpec | null;
/** The geometric anchors a host may name besides a feature / class / fixture id. */
export declare const GEOMETRIC_HOSTS: readonly ["listener", "air", "ground", "overhead", "horizon"];
/**
 * Structural problems `normalizeWorldSpec` cannot silently fix — category
 * errors that survive normalization and produce a scene that LOOKS valid but
 * cannot do what it says (the Boston failure: a "passing car" perched on a
 * window fixture, members reading `velocity` on a body that never moves).
 * `generateWorldSpec` quotes these back to the model for one repair round;
 * they are sentences addressed to it, not error codes.
 */
export declare function worldSpecIssues(spec: WorldSpec): string[];
//# sourceMappingURL=worldSpec.d.ts.map