/**
 * The sound card's dials, as data: what each one reads from a parsed statement and
 * says in plain words. Pure (no DOM, no engine instance), so it is tested on its own;
 * `view.ts` draws them and the mixer's closure owns the writes (`applyScript`).
 *
 * A dial is named for what you hear ("how loud"), with the audio term as a small tag
 * ("level · dB") and the exact script value under it, so a developer with no audio
 * person never needs the words and a sound designer can still read every value.
 */
import type { Statement } from '../../core/Statement.js';
import type { DistanceProfile } from '../../spatial/WorldAcoustics.js';
export type DialId = 'howLoud' | 'howMuffled' | 'howMuchEcho' | 'howMuchVaries' | 'howOften' | 'howRegular';
/**
 * Where a dial sits, read from the script. `value` sits on the dial; the others are said
 * in words, because a slider position would hide what they do (and moving the dial
 * replaces them with a fixed value, so the card asks first).
 */
export type DialReading = {
    kind: 'value';
    value: number;
    exact: string;
} | {
    kind: 'moving';
    text: string;
    exact: string;
} | {
    kind: 'follows';
    text: string;
    exact: string;
} | {
    kind: 'unset';
    value: number;
    exact: string;
};
export interface DialInfo {
    id: DialId;
    label: string;
    hint: string;
    ends: [string, string];
    tag: string;
}
/**
 * Loudness as people read it (2026-11-13, Huanxing: "normalize to 0 to 1, how game audio does it"): 0 is silence,
 * 1 as loud as sound gets (120 dB SPL). A whisper is about 0.25, talking 0.5, very loud 0.75. dB stays inside the
 * engine and the script (`spl`); everything a developer reads says this.
 */
export declare const LOUD_TOP_DB = 120;
export declare const loud01: (db: number) => number;
export declare const fmtLoud: (db: number) => string;
/** A change in level, on the same scale ("+0.05", "−0.10"). */
export declare const fmtLoudDelta: (dDb: number) => string;
export declare const HOW_LOUD: DialInfo;
/** "how loud", from `spl`: a level, a range picked per play, or a level the game sets. */
export declare function readHowLoud(st: Statement): DialReading;
/**
 * The quietest a real place gets (dB SPL): below this even a calm outdoor spot covers a sound.
 * The level model's own floor is the bottom of its 55 dB window (often near 10 dB), which would
 * say a crossing bell carries 5 km; reach is measured to whichever floor is higher.
 */
export declare const QUIET_PLACE_DB = 30;
export interface ReachPath {
    line?: boolean;
    distanceProfile?: DistanceProfile | null;
    occlusion01?: number;
}
/**
 * How far a sound carries: the distance at which its direct path falls to the hearing floor (the
 * level model's window floor where you stand, never under {@link QUIET_PLACE_DB}), under the
 * engine's own distance law. Null when it cannot be said (no floor yet). Capped at 2 km.
 */
export declare function reachMeters(emissionDb: number, windowFloorDb: number, path?: ReachPath): number | null;
/** A distance said the way people say it: "about 60 m", "under a metre". */
export declare function sayDistance(m: number): string;
/**
 * The "how loud" readout: what reaches you where you stand, and how far it carries.
 * `receivedDb` / `floorDb` come from the engine's level report; a background sound (all
 * around you) has no reach.
 */
export declare function howLoudReadout(o: {
    receivedDb: number | null;
    emissionDb: number | null;
    floorDb: number | null;
    around: boolean;
    path?: ReachPath;
}, opts?: {
    db?: boolean;
}): string;
/** The emission (dB at 1 m) at which a sound carries exactly `reachM`: the inverse of {@link reachMeters}. */
export declare function emissionForReach(reachM: number, windowFloorDb: number, path?: ReachPath): number;
/** What a card knows about a sound when it picks its dials. */
export interface DialContext {
    /** Where the sound is, in the mixer's kinds: all around you, carried by you, moving, in place, where the game sets it off. */
    kind: 'around' | 'yours' | 'moving' | 'place' | 'contact';
    /** The room whose echo it has (`in <room>`), when the room decides its echo. */
    room: string | null;
}
/**
 * A dial that is one registry property on a slider. `read` comes from the parsed statement,
 * never raw text; `write` returns the property's new raw value (null: remove the property).
 */
export interface SliderDial extends DialInfo {
    /** The registry properties it owns (their rows leave "advanced"). */
    owns: string[];
    min: number;
    max: number;
    step: number;
    appliesTo(st: Statement, ctx: DialContext): boolean;
    read(st: Statement): DialReading;
    write(value: number, st: Statement): {
        key: string;
        raw: string | null;
    };
    /** What a value means, said plainly ("about 12 dB quieter, highs cut"). */
    say(value: number): string;
    /** When it does not apply because of the place, the card says so instead (the echo comes from the café). */
    instead?(st: Statement, ctx: DialContext): string | null;
}
export declare const HOW_MUFFLED: SliderDial;
export declare const HOW_MUCH_ECHO: SliderDial;
/** How far each play's pitch may stray from the voice's own (±6 %: past that it is a different sound). */
export declare const PITCH_SPREAD_MAX = 0.06;
export declare const HOW_MUCH_VARIES: SliderDial;
/** The slider dials, in card order (after "how loud"). */
export declare const SLIDER_DIALS: () => SliderDial[];
/** The timing dials, drawn together with the next minute under them. */
export declare const TIMING_DIALS: () => SliderDial[];
/**
 * `every` as the two things you hear: how often (the middle of its range) and how regular (how
 * far each gap wanders around that middle). `every 8to25` is a middle of 16.5 s that wanders 52 %.
 */
export interface EveryShape {
    middleS: number;
    spread: number;
}
/** The gaps a script may ask for (the registry's clamp starts at 0.1 s; 600 s is ten minutes). */
export declare const EVERY_MIN_S = 0.2, EVERY_MAX_S = 600;
/** A spread over this would let a gap reach 0. */
export declare const SPREAD_MAX = 0.9;
export declare function everyShape(min: number, max: number): EveryShape;
export declare function everyText(e: EveryShape): string;
export declare const oftenToPos: (middleS: number) => number;
export declare const posToOften: (pos: number) => number;
export declare const HOW_OFTEN: SliderDial;
export declare const HOW_REGULAR: SliderDial;
/** "anywhere from 8 to 25 s apart", from a statement's every (the strip's caption). */
export declare function everyWords(min: number, max: number): string;
//# sourceMappingURL=dials.d.ts.map