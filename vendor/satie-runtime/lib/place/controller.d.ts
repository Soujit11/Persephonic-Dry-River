import { type PlaceDef, type PlaceVersion, type PlacesFile } from './place.js';
export type { LibraryTake, VariantLibrary } from './variety.js';
export interface VariantHost {
    /** The committed document. */
    committed(): string;
    /** Play a script now, crossing changed sounds over `seconds`. */
    play(script: string, seconds: number): void;
    /** Commit through the one commit point. False when refused. */
    use(script: string, note: string, detail: Record<string, unknown>): boolean;
    /** An edit-record event (the preference record rides here). */
    record(kind: string, detail: Record<string, unknown>): void;
    /** Seconds on the audio clock (`AudioContext.currentTime`), so views time their motion to the sound. */
    audioTime(): number;
    /** Where the listener is when a choice is made (for the record). */
    listener?(): {
        position: {
            x: number;
            y: number;
            z: number;
        };
        forward: {
            x: number;
            y: number;
            z: number;
        };
    };
}
/** One sound's state in a script, as a view needs it. */
export interface SoundState {
    present: boolean;
    clip: string | null;
    takes: string[];
    db: number | null;
}
/** What a switch does to each sound of the soundscape. */
export interface SoundChange {
    sourceId: string;
    kind: 'enter' | 'leave' | 'retake' | 'level';
    from: SoundState;
    to: SoundState;
}
/** Emitted on every switch: what enters, leaves and changes, over which stretch of the audio clock. */
export interface VariantSwitch {
    soundscape: string;
    from: string;
    to: string;
    /** Their numbers in the switcher (the pill shows these). */
    fromN: number;
    toN: number;
    /** Audio-clock start and length of the crossfade (equal-power: cos out, sin in). */
    at: number;
    seconds: number;
    changes: SoundChange[];
    /** Moves skipped because their sound is locked. */
    heldByLock: string[];
    /** Moves that could not be written (their sound is gone). */
    dropped: number;
}
export interface SoundscapeState {
    playing: string;
    inUse: string;
    locks: string[];
    previewing: boolean;
    /** The three variants shown, by slot, with their numbers. */
    slots: Array<{
        id: string;
        n: number;
    }>;
}
export declare const CROSSFADE_S = 1.5;
/** A listen of at least this long counts as heard (spec 012 §5). */
export declare const HEARD_MS = 2000;
/** Variants shown at once. */
export declare const SLOTS = 3;
/** How each of `ids` differs between two scripts. Pure. */
export declare function soundChanges(before: string, after: string, ids: readonly string[]): SoundChange[];
export interface VariantController {
    soundscapes(): PlaceDef[];
    /** Its variants with their numbers, the first draft first. */
    variants(soundscape: string): PlaceVersion[];
    state(soundscape: string): SoundscapeState;
    /** Crossfade to a variant (listening only; nothing is written). */
    switchTo(soundscape: string, variant: string): VariantSwitch | null;
    /** Commit the variant playing. Records the choice. */
    use(soundscape: string, label?: string): boolean;
    /** Choose a variant: crossfade to it and keep it at once (autosave, Huanxing 2026-11-11). */
    choose(soundscape: string, variant: string): VariantSwitch | null;
    /** Lock a sound (it keeps what it has whatever variant plays) or let it go. */
    lock(soundscape: string, sourceId: string, on: boolean): void;
    /** Credit listening time to whatever plays now (call when the listener leaves or the view closes). */
    creditListen(): void;
    onSwitch(cb: (e: VariantSwitch) => void): () => void;
    onChange(cb: (soundscape: string) => void): () => void;
}
export declare function createVariantController(host: VariantHost, source: PlacesFile): VariantController;
//# sourceMappingURL=controller.d.ts.map