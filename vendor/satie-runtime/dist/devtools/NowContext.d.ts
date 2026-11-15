/**
 * The live context box (`satie.now/v1`): what the developer sees, hears and just changed in the
 * running game, written by the mixer as `.satie/now.md` (through the `satie-runtime/vite` plugin)
 * so any coding agent working on the project, with or without the SATIE MCP, can read it.
 *
 * It says where the developer is, never what they want: the header tells the reader that their
 * words win and the box only resolves pointing words. Each section answers one kind of pointing:
 * "this" (selected), "that one" (straight ahead), "here / behind me" (around), "that noise" (heard
 * now), "what was that" (recently: the last five minutes, so a sound that has stopped by the time
 * they switch to the terminal is still there, with the moment they switched), "why can't I hear X"
 * (not heard, and why), "undo that" (edits). Pure: the mixer collects a snapshot, this turns it
 * into text. The same state renders the same text (the mixer writes only when the text changes).
 */
export interface NowSound {
    /** The sound's name as the mixer shows it. */
    name: string;
    sourceId?: string;
    /** The object it plays from, by contract id. */
    host?: string;
    /** Its object's name as people say it. */
    hostName?: string;
    /** Metres from the listener; omitted for sounds all around. */
    distanceM?: number;
    /** Which way from the listener, in words ("behind to the left, 9 m below"). */
    direction?: string;
    /** What it sounds like: the description its recording or generation came with. */
    like?: string;
    /** The level model's estimate where the listener stands, dB SPL. */
    db?: number;
    /** For a covered sound: the name of the sound covering it. */
    coveredBy?: string;
    /** In the around list: whether it reaches the listener right now. */
    state?: 'heard' | 'covered' | 'muted' | 'silent';
}
export interface NowEdit {
    /** The mixer's history version id ("v12") and the one it came from. */
    id: string;
    parentId: string | null;
    label: string;
    at: number;
    /** Who made it: the developer in the mixer, a change to the file from outside the mixer, or the start. */
    by: 'you' | 'outside' | 'start';
}
/** Something worth remembering from the last few minutes. */
export interface NowMoment {
    /** Epoch ms of the first time; `lastAt` of the last when it repeated. */
    at: number;
    lastAt?: number;
    /**
     * `loud`: a sound stood out (topped what was heard, or was very loud), with where it was then.
     * `away`: the developer left the game window (to type to their agent, usually), with what was heard then.
     * `back`: they returned to it.
     */
    kind: 'loud' | 'away' | 'back';
    sound?: NowSound;
    /** dB above the next loudest sound at its peak. */
    aboveDb?: number;
    /** How many times it stood out within the merge window. */
    times?: number;
    /** `away`: what was heard at that moment, loudest first. */
    heard?: NowSound[];
}
export interface NowSnapshot {
    version: 'satie.now/v1';
    /** Epoch ms of this snapshot. */
    at: number;
    /** The script the mixer has open (its URL path, e.g. /satie/scene.satie). */
    scriptPath: string;
    playing: boolean;
    /** The game page closed or the mixer was unmounted: this is the last state seen. */
    closed?: boolean;
    listener?: {
        position: [number, number, number];
        forward?: [number, number, number];
        carriedBy?: string | null;
    };
    /** The named object the line of sight hits; null when it hits nothing named. */
    lookingAt?: {
        name: string;
        hostId: string;
        distanceM: number;
    } | null;
    /** The sound nearest the centre of the screen (nearer ones preferred). */
    ahead?: NowSound | null;
    /** What is selected in the mixer or the world, and when it was selected. */
    selection: {
        label?: string;
        sounds: NowSound[];
        at: number;
    } | null;
    /** The nearest sounds in every direction, nearest first, each with its `state`. */
    around: NowSound[];
    /** Heard where the listener stands, loudest first. */
    heard: NowSound[];
    /** Playing but drowned out by another sound. */
    covered: NowSound[];
    /** How many other sounds are silent, waiting or out of range here. */
    quietCount: number;
    /**
     * Objects sounds play from that the game is not placing right now, so their sounds are silent: a
     * train between visits (normal), or an id the game no longer uses (a rename).
     */
    absentHosts: Array<{
        host: string;
        name: string;
        sounds: number;
        sourceIds?: string[];
    }>;
    muted: string[];
    soloed: string[];
    /** The last few minutes, newest first. */
    moments: NowMoment[];
    /** The newest first. */
    recentEdits: NowEdit[];
    /** The mixer holds changes the script file does not have yet. */
    unsaved: boolean;
    /**
     * Kinds of named objects that appeared in the game scene after SATIE first saw it (`since`) and that
     * the scene contract does not list: what an agent added without telling SATIE. `total` counts all.
     */
    newObjects: {
        ids: string[];
        total: number;
        since?: number;
    };
}
/**
 * Which way `to` is from a listener at `from` facing `forward` (+Y up, three.js handedness): eight
 * sectors around ("ahead to the right"), "right here" within 1.5 m across, and "N m above/below" when
 * the height difference is at least 3 m and half the distance across.
 */
export declare function directionWords(from: readonly number[], forward: readonly number[], to: readonly number[]): string;
export declare function renderNow(s: NowSnapshot): string;
/** The text without its update line: equal when nothing an agent would act on has changed. */
export declare function nowSignature(text: string): string;
/**
 * The last few minutes worth remembering, so "what was that?" still has an answer after the sound
 * stopped and the developer switched to their terminal. A sound standing out again within `mergeMs`
 * updates its entry (peak, count, last time) instead of adding one; a window switch shorter than
 * `blinkMs` is forgotten. Pure bookkeeping: the mixer decides what stood out.
 */
export declare class NowMoments {
    private readonly keepMs;
    private readonly mergeMs;
    private readonly blinkMs;
    private readonly cap;
    private items;
    constructor(keepMs?: number, mergeMs?: number, blinkMs?: number, cap?: number);
    loud(at: number, key: string, sound: NowSound, aboveDb: number): void;
    /** The same sound still standing out: follow its peak and how long it lasted, without counting it again. */
    still(at: number, key: string, sound: NowSound, aboveDb: number): void;
    away(at: number, heard: NowSound[]): void;
    back(at: number): void;
    /** Within `keepMs` of `now`, newest first (by the last time each happened). */
    recent(now: number): NowMoment[];
    private push;
}
//# sourceMappingURL=NowContext.d.ts.map