/**
 * Acoustic compiler — WorldSpec (+ its realized world) → a Satie script.
 *
 * Emits the `world` block and one voice per ecology entry, bound to the thing
 * that makes the sound (`at oak`, `at brook`, `at avenue`, `at overhead`, `at horizon`),
 * with the representational consequences of each host: a strip is heard
 * along its length (`line`), a patch around its rim (`ring`), the listener's
 * own air is a bed, an air-dweller darts overhead. Hour windows and weather
 * thresholds become `active` / `quiet`; `follows` / `pace` become the
 * signal-bound forms. The output is deterministic and parses by
 * construction — no LLM repair round is needed for it.
 *
 * An entry with a repertoire (`sounds`) is not a clip on a timer but a BODY:
 * it compiles to a top-level `entity` block — a ROUTE (`at
 * <strip> pass`: instances spawned every `every`, travelling the strip with
 * real kinematics) or a POPULATION (`count` instances, each perched on its
 * own host object) — whose members are its sounds, heard from the instance's
 * own position and driven by its own state (`velocity`, `accel`, `progress`,
 * `age`). Hosts that are not bodies (`listener`, `air`, `overhead`, a patch
 * rim) cannot carry an entity: their sounds degrade to plain voices.
 *
 * Every voice states its EMISSION (`spl <dB>`, dB SPL at 1 m — the spec's
 * `splDb`, or `DEFAULT_SPL_DB` when the model said nothing), so a compiled
 * script is always CALIBRATED: the engine computes what arrives from where
 * the source is, and `volume` is a trim. A stated emission is not re-faded
 * by `level` (that fader is the guess the emission replaces); an unstated
 * one keeps `level` as its trim so the model's hierarchy survives.
 *
 * Content stays the model's: every label, prompt and material is copied
 * verbatim. Only the mapping from "where does this live" to DSL is code, and
 * it looks the host up by id — it never knows what kind of place this is.
 */
import type { RealizedWorld } from './worldRealize.js';
import { type EcologyEntry, type EcologySound, type SignalMap, type WorldSpec } from './worldSpec.js';
export { attachPoint as emitPointOf } from './worldRealize.js';
/**
 * Relative level 0..1 → script volume. Beds sit lower than the loudest spot
 * source; the floor keeps a quiet source audible — but `0` means silent, so
 * a model that writes `level: 0` gets 0, not a whisper.
 */
export declare function volumeFor(level: number): number;
/**
 * How many distinct takes a source gets when the entry does not say: things
 * passing on a strip always pool (every car is a different car); a class or
 * ground oneshot pools when it fires often enough that one clip would be
 * heard as a stamp. Loops and rare events stay single — generation budget.
 */
export declare function defaultVariants(entry: EcologyEntry, spec: WorldSpec): number;
/** The actual compiled take-bank size, also used before compilation by auditions. */
export declare function ecologyVariantsFor(entry: EcologyEntry, spec: WorldSpec, sound?: EcologySound): number;
/** Transmission through a shut boundary of the interior's shell (occlusion 0–1). */
export declare const WALL_OCCLUSION = 0.85;
/**
 * How occluded a source on this host is for a listener inside the interior:
 * 0 for the room's own air, its inside fixtures and its apertures (the
 * room-side face of the boundary); through-boundary for a space or the
 * exterior, eased by the widest aperture leading there (a shut door ≈ 0.85, a
 * cracked window ≈ 0.72, a flung-open one 0). A spec with no interior — or a
 * host the spec does not know, which the compiler places nearby — is 0.
 */
export declare function interiorOcclusion(spec: WorldSpec, host: string, extent?: string, world?: RealizedWorld | null): number;
/** A plain voice's source: an ecology entry, or a repertoire member degraded to one (`on` kept). */
interface PlainSource extends EcologyEntry {
    durationS?: number;
    on?: string;
    cooldownS?: number;
    splFollows?: SignalMap;
}
/** How many instances of a class a distributed field occupies around the listener. */
export declare const DISTRIBUTED_FIELD_INSTANCES = 4;
/**
 * A catalog row of kind `bed` hosted on an OBJECT CLASS is a FIELD, not a
 * point: wind is in every tree, rain on every roof, and its cited level is
 * what arrives at a listener standing among them (Bolin: vegetation noise
 * 45 to 65 dBA at the receiver). One voice on the nearest instance, stated at
 * that level "at 1 m", arrived 30 dB under it from a canopy fifteen metres
 * up and the place sounded like its bed alone. The field compiles as
 * `DISTRIBUTED_FIELD_INSTANCES` copies on the nearest instances (the engine
 * keeps them around the walker), each a sphere the size of the instance's
 * body, with the emission RAISED by the loss from the nearest body's surface
 * to the listener's start, so the field arrives at its cited level where the
 * listener stands and falls away as they leave the grove. Pure, exported
 * for the tests; `null` when the entry is not such a field.
 */
export declare function distributedField(entry: PlainSource, spec: WorldSpec, world: RealizedWorld | null): {
    count: number;
    radiusM: number;
    splDb: number;
} | null;
/** A state name as a script slug: "dawn chorus" -> `dawn_chorus`. */
export declare function stateSlug(name: string): string;
/** Compile a subset for appending to an existing world; optional group is an explicit edit boundary. */
export declare function compileEcologyEntries(entries: readonly EcologyEntry[], spec: WorldSpec, world?: RealizedWorld | null, opts?: {
    group?: string;
}): string;
/** Compile a world and its plain sources / entity blocks, without redundant grouping. */
export declare function compileWorldScript(spec: WorldSpec, world?: RealizedWorld | null): string;
//# sourceMappingURL=WorldCompile.d.ts.map