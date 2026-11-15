export { freezeScene, SceneComparison, serializeAudition, restoreAudition, type SceneAudition, type SceneJudgment } from './SceneComparison.js';
export { createEditPanel, type EditPanelOptions } from './editPanel/index.js';
/**
 * satie-runtime/devtools — the sound editor that lives in the developer's own
 * page. One call, development only:
 *
 *   import { devtools } from 'satie-runtime/devtools';
 *   devtools(engine, { script: '/satie/scene.satie', samples: '/satie/samples.json' });
 *
 * A panel over the canvas. The MIXER is the editor: every voice as a row with
 * mute, solo, gain, its live received level, a flash when it fires, SWAP (a
 * library recording found by description, or a file of your own) and DELETE.
 * Edits rewrite the script text and reload the running scene through the
 * engine's live edit, so unchanged voices keep playing. SCRIPT shows the text
 * itself for anything the rows cannot express. LOG lists events as they fire
 * and the runtime's warnings — the wiring check ("did my door event fire?").
 * Save writes the script and samples.json back under public/ through the
 * `satie-runtime/vite` plugin, which also proxies the library search so the
 * page never holds a SATIE token. Plain DOM, no dependency.
 */
import type { SatieEngine } from '../core/SatieEngine';
import { type Statement } from '../core/Statement';
import { type ControlSpec } from '../core/Properties';
import type { AuthoringContext } from '../integration/AuthoringContext';
import { type SynthAsset } from '../synth/asset.js';
import { type VariantController } from '../place/controller';
import { type PlacesFile } from '../place/place';
import type { Area } from './card/motion';
export { renderNow, type NowSnapshot } from './NowContext';
type Cadence = {
    times: number;
    gapS: number;
};
export declare function candidatePreviewRepeat(cadence: Cadence | null, single: boolean | undefined): Cadence | null;
/** Surface recordings of the listener's step share one hearing tag, anchored to the first source. */
export declare function personalStepLead(stmts: readonly Statement[], i: number, personal: (st: Statement) => boolean): number | null;
/** Keep the running bar's timeline aligned with the most recent fire, including retriggers. */
export declare function syncHearingShot(bar: HTMLElement, ageMs: number, durationMs: number): void;
export declare function inspectorPropertyRaw(script: string, st: Statement, key: string): string | null;
/**
 * The sound layer in the world (a Three.js adapter's `locate`): the panel owns the
 * selection; the layer draws it. Engine-free on this side, so devtools stays DOM only.
 */
export interface LocateSelection {
    indices: number[];
    label?: string;
    detail?: string;
}
export interface LocatePanel {
    /** An orb was clicked: toggle that voice's selection (`add`: Shift or ⌘ held, add it to the others). */
    select(statementIndex: number, opts?: {
        add?: boolean;
    }): void;
    /** A marker carrying several sounds (one object) was clicked: select them together. */
    selectMany?(statementIndices: number[]): void;
    /** A picked marker clicked again: let go of the pick (making a group: take that thing out of it). */
    release?(statementIndices: number[]): void;
    /** ⌘/Shift on a thing: add all of its sounds to the pick (or take them all out if they are all in). */
    toggleMany?(statementIndices: number[]): void;
    /** An orb is hovered (null: none): light up its row. */
    hover(statementIndex: number | null): void;
    /** A click on empty world: release the selection. */
    clear(): void;
    /** Width of the screen the panel covers on its side, in CSS pixels. */
    coveredWidth(): number;
    corner(): 'left' | 'right';
}
export interface LocateLayer {
    connect(panel: LocatePanel): void;
    /** The mixer opened or closed: the layer shows the world its way while open. */
    setActive(open: boolean): void;
    /** Focus mode: the world stays rendered but recedes under a dark veil, so the sound layer stands out. */
    setFocus(on: boolean): void;
    /** An object's human name from the scene contract (`objects[].label`), when it has one. */
    hostLabel?(hostId: string): string | undefined;
    /** The mixer's names for sounds (what a swapped-in recording is called), so world labels match the list. */
    setNamer?(nameOf: (statementIndex: number) => string, hostName?: (hostId: string) => string, soundsOn?: (hostId: string) => number | undefined): void;
    /** The sounds of a thing opened in the mixer: they fan out round its tag in the world, the tag kept (null: none). */
    reveal?(statementIndices: number[] | null): void;
    /** A place renamed in the mixer: the world's labels and the contract the layer reads follow it. */
    setHostLabel?(hostId: string, label: string | undefined): void;
    /** Turn toward an object by id. */
    focusHost?(hostId: string): boolean;
    /** Where you are looking: the named object under the centre of the view, and the point hit, in metres. */
    lookTarget?(): {
        hostId: string | null;
        point: [number, number, number];
    } | null;
    /** Aim at a surface to place a sound: a marker follows the pointer (or the view's centre) and sticks to what it hits. */
    startPlacing?(o: {
        mode?: 'thing' | 'spot';
        onChange?: (t: AimTarget | null) => void;
        onDone?: (t: AimTarget | null) => void;
        onCancel?: () => void;
        stayOpen?: boolean;
    }): void;
    stopPlacing?(): void;
    /** The sound(s) being edited: their dots drag in the world (preview while moving, drop writes the place). */
    /** The scene's things a sound can be on: the contract's objects, with their names. */
    hosts?(): Array<{
        id: string;
        label?: string;
    }>;
    /** The game's states (the contract's), for "only in …" choices. */
    states?(): string[];
    setEditing?(indices: number[] | null, handlers?: {
        onPreview?: (t: AimTarget) => void;
        onDrop?: (t: AimTarget) => void;
        onCancel?: () => void;
    }): void;
    /** Draggable handles for a roaming sound's area (the sound card's "how it moves"); reports the shape in metres, writes nothing; null ends it. */
    editShape?(shape: Area | null, handlers?: {
        onPreview?: (a: Area) => void;
        onDrop?: (a: Area) => void;
        onCancel?: () => void;
    }): void;
    /** Editing the world: every sound is its own dot, and any of them can be dragged (null: off). */
    setWorldEdit?(handlers: {
        onPreview?: (i: number, t: AimTarget) => void;
        onDrop?: (i: number, t: AimTarget) => void;
        onCancel?: (i: number) => void;
    } | null): void;
    unlockPlacing?(): void;
    /** What the scene contract says about an event: the object it happens with, the surfaces it lands on. */
    eventInfo?(name: string): {
        with?: string;
        by?: string;
        surfaces?: string[]; /** It comes this long after another event (the can drops 1.45 s after the purchase): the contract's `after`. */
        after?: {
            event: string;
            seconds: number | [number, number];
        };
    } | undefined;
    /** The contract's events, states and signals with what they mean (what "when it plays" offers). */
    events?(): Array<{
        name: string;
        description?: string;
        with?: string;
    }>;
    stateInfo?(): Array<{
        name: string;
        description?: string;
    }>;
    signals?(): Array<{
        name: string;
        description?: string;
        min?: number;
        max?: number;
    }>;
    setSounds(on: boolean): void;
    setSelection(selection: LocateSelection | null): void;
    setHover(statementIndex: number | null, fromRow: boolean): void;
    /** Turn the view toward these voices (double-click). */
    focus(statementIndices: number[]): void;
    /** Go there: move the player next to these voices, if the host allows it. */
    goTo?(statementIndices: number[]): void;
    /** Where the player stands and faces now (scene units): kept across a reload. */
    whereYouStand?(): {
        x: number;
        z: number;
        yaw: number;
    } | null;
    /** Put the player back there; false when the host gives no way to move them. */
    standAt?(spot: {
        x: number;
        z: number;
        yaw: number;
    }): boolean;
    /** A voice fired (bookkeeping: a sound the game places each time shows where it last landed). */
    fired(statementIndex: number): void;
    /** Something you heard just happened at this voice: ripple its marker (repeating sounds stay still). */
    ripple?(statementIndex: number): void;
    /** How the host describes a bound object (for example 'moves'), if it knows. */
    hostMotion?(hostId: string): string | undefined;
    /** The surfaces the game reports for `{text}` events (footsteps), when the contract declares them. */
    surfaces?(): string[];
    /** Statement indices whose sound's object is on screen now (for the mixer's "near you"). */
    visibleIndices?(): number[];
    /** The object the ears ride on (its sounds are the listener's own: footsteps, hands). */
    listenerHost?(): string | null;
    /**
     * Kinds of named objects that appeared in the game's scene after SATIE first saw it (`since`, epoch
     * ms) and that the scene contract does not list: a dog an agent added without telling SATIE.
     * `ids` capped, `total` all of them.
     */
    unknownObjects?(): {
        ids: string[];
        total: number;
        since?: number;
    };
    destroy(): void;
}
export interface DevtoolsOptions {
    /**
     * Explore's frozen worlds: the soundscape strip's variant pill shows which variant plays, greyed,
     * and does not switch (the map still opens, listen only through its own `readOnly`).
     */
    readOnly?: boolean;
    /** Embed the same mixer in a host workspace instead of floating over a game. */
    mount?: HTMLElement;
    /** Host transport; browser apps use authenticated platform services instead of a Vite server. */
    request?: typeof globalThis.fetch;
    /** Already loaded documents, for hosted editors. */
    documents?: DevtoolsDocument;
    /** Called after an accepted edit, including undo/redo. The host owns persistence. */
    onDocumentChange?: (document: DevtoolsDocument) => void;
    /** Sample current game context on edits/feedback. No geometry is inferred when absent. */
    context?: () => AuthoringContext;
    /** URL the script was loaded from — Save writes back to it (a path under public/). */
    script?: string;
    /** URL of the samples manifest (clipPath → { url }) — swaps are recorded there and saved with the script. */
    samples?: string;
    /** Where the panel sits. */
    corner?: 'right' | 'left';
    /** Start collapsed (a tab in the corner). */
    collapsed?: boolean;
    /** Dev-server endpoints (the vite plugin's). */
    saveUrl?: string;
    uploadUrl?: string;
    libraryUrl?: string;
    freesoundUrl?: string;
    takeUrl?: string;
    /** Natural-language edits (the vite plugin's /__satie/edit): SATIE recomposes with your sentence. */
    editUrl?: string;
    /** "Sign in with SATIE" endpoints (the vite plugin's /__satie/auth/*). */
    authUrl?: string;
    /** Local edit capture endpoint (default /__satie/authoring); null disables capture. */
    eventUrl?: string | null;
    /** Where a conversation turn goes (default /__satie/chat, the vite plugin). */
    chatUrl?: string;
    /** Where the takes a chat edit needs are bought (default /__satie/realize). */
    realizeUrl?: string;
    /** One round of a find (default /__satie/find, the vite plugin: satie_find); its log is `<findUrl>/log`. */
    findUrl?: string;
    /** Generate variations (default /__satie/vary: satie_vary, a free plan and a capped make). */
    varyUrl?: string;
    /** POST a request for the developer's coding agent (default /__satie/request, the vite plugin: `.satie/requests/`). */
    requestUrl?: string;
    /** POST { path, id, label }: write a place's name into the scene contract (default /__satie/label, the vite plugin). */
    labelUrl?: string;
    /**
     * The human name of an object, by host id: the scene contract's object `label` ("porch door").
     * Without one the mixer shows the id with underscores as spaces.
     */
    hostLabel?: (hostId: string) => string | undefined;
    /** Where the version tree persists (default /__satie/history; null keeps it in memory). With `localStorageKey` it is kept on this device. */
    historyUrl?: string | null;
    /**
     * Where the live context box goes (default /__satie/now, the vite plugin, which writes `.satie/now.md`
     * for the project's coding agents): what the developer sees, hears and just changed. null turns it off;
     * a static player (`localStorageKey`) never sends it.
     */
    nowUrl?: string | null;
    /** Static player mode: save/restore this scene on this device; no authoring service calls. Scope the key to the scene revision. */
    localStorageKey?: string;
    /** Optional host-owned start gesture (for games that also track activation). */
    start?: () => void | Promise<void>;
    /** Use dB source-level edits, preserving volume/pitch automation. Requires stable source IDs and static SPL. */
    levelFaders?: boolean;
    /** Optional authored mixer groups. Unassigned voices retain normal host grouping. */
    mixGroups?: Array<{
        id: string;
        label: string;
        sourceIds: string[];
    }>;
    /** Keyboard toggle (default backquote). */
    hotkey?: string;
    /** The world view of the sound layer (satie-runtime/three `locate`). */
    locate?: LocateLayer;
    /**
     * A published scene (static player): how a visitor gets their own copy to change with SATIE. The
     * conversation stays visible and opens on this; nothing is sent until the scene is theirs.
     */
    /** `onFork` receives the mix as it stands (`changed`: it differs from the scene as published), so the copy carries it. */
    fork?: {
        label: string;
        detail?: string;
        href?: string;
        onFork?: (script: string, changed: boolean) => void;
    };
    /** Show the corner tab that opens the panel (default true; off when a badge opens it). */
    launcher?: boolean;
    /** The panel opened or closed (for example: hide the game's title card while mixing). */
    onOpenChange?: (open: boolean) => void;
    /**
     * The edit panel (its own module, docs/specs/015-edit-panel): the one mount point for the pop-up that
     * edits a soundscape or a sound in detail. With it, chat and a sound's "find another take" open the
     * panel at that level instead of running a find in the thread; without it the mixer behaves as before.
     */
    editPanel?: EditPanel;
    /**
     * Where outside edits to the script are heard (default /__satie/watch, the vite plugin): a coding agent
     * or an editor changes the file and the open game plays it at once. null turns it off; a static
     * player (`localStorageKey`) never listens.
     */
    watchUrl?: string | null;
    /**
     * The world's soundscapes and their variants (spec 012): a `satie.places/1` or
     * `satie.soundscapes/1` file or its URL. It mounts the variant mechanism (`soundscapes()`), no UI.
     * Without it, a script that declares `soundscape` blocks mounts it with only the first drafts
     * (More like N makes the rest); false turns it off.
     */
    places?: PlacesFile | string | false;
    /**
     * The selection changed (statement indices; empty when nothing is selected). Sketch shows it as the
     * "about" tag in its own chat (2026-11-13).
     */
    onSelect?: (indices: number[]) => void;
}
/** What the edit panel opens on: a whole soundscape (world correctness names them) or one sound (its source id). `why`: the words that asked for it. */
export type EditTarget = {
    soundscape: string;
    why?: string;
} | {
    sound: string;
    why?: string; /** open at the thing the sound is on, not the sound */
    thing?: boolean;
};
/** What the mixer hands the edit panel each time it opens. */
/** What the mix has open, for the mixer's column to show beside it (2026-11-12). */
export interface EditLevel {
    kind: 'scape' | 'thing' | 'sound';
    title: string;
    /** What it is inside: the soundscape of a thing, the thing (or soundscape) of a sound. */
    parent: string | null;
    sid?: string;
    /** The soundscape it is in (every level). */
    scape?: string;
    /** The entity's key (an entity level). */
    key?: string;
    sounds: EditSound[];
    /** The library's recordings like this sound are shown on the map (a sound level only; off until asked for). */
    suggesting?: boolean;
}
export interface EditPanelContext {
    /** The mix moved to another level: the mixer's column follows it. */
    onLevel?(l: EditLevel): void;
    /** The pointer is on this sound on the map (null: off it): the sidebar lights its row. */
    onHover?(sourceId: string | null): void;
    /**
     * The mix and the mixer are one window (2026-11-12): the mixer's column sits inside the mix's right edge, this
     * many pixels wide, under the mix's own bar. 0 or absent: the mix leaves the column beside it.
     */
    side?: number;
    /** Controls the mixer lends the mix's bar (undo and redo), put back when it closes. */
    barTools?: HTMLElement;
    /** Where the mix puts the controls of its level (play the train, its takes in turn): under the name in the sidebar. */
    levelTools?: HTMLElement;
    engine: SatieEngine;
    /** The panel's own element, above the game and beside the mixer (empty on first open; the panel owns its children). */
    mount: HTMLElement;
    /** The scene script as it stands. */
    script(): string;
    /** Apply a new script as one change in the mixer's history (undo and the context box see it); false when it does not load. */
    apply(next: string, note: string): boolean;
    /** The world layer, when the game has one (markers, focus, go there). */
    layer?: LocateLayer;
    /** The panel closed itself: the mixer takes the keyboard back. */
    closed(): void;
    /** Every sound as the mixer lists it: the thing it belongs to, its takes, how loud it reaches you now. */
    sounds(): EditSound[];
    /** Hear one take (its key) or any recording (a url) up close, the scene dipped under it; null stops. One at a time. */
    hear(what: {
        key: string;
    } | {
        url: string;
    } | null): Promise<boolean>;
    /** What `hear` is playing now: seconds heard and its length, so a playhead can follow the sound itself; null when silent. */
    hearing?(): {
        at: number;
        dur: number;
    } | null;
    /** Fetch and decode a recording ahead of pointing at it, so hearing it starts at once (cached; free). */
    warm?(url: string): void;
    /** A recording becomes take `k` of a sound, or one more take when `k` is left out: one change in history. */
    setTake(sourceId: string, rec: EditRecording, k?: number): Promise<boolean>;
    /** One take fewer (the later ones move up): one change in history. */
    removeTake(sourceId: string, k: number): boolean;
    /** A published scene (read-only): an edit the mix offers asks you to fork first, naming what you tried (2026-11-13). */
    askFork?(what: string): void;
    /** The world's soundscapes, which one you are in, and their variants (null: the game gave none). */
    soundscapes(): SoundscapeAccess | null;
    /** The library recordings that sound most like this sound (its audio, or its library take), closest first. Free. */
    near(sourceId: string, limit: number): Promise<EditRecording[]>;
    /** The library recordings for these words (satie_find), best first. Free. */
    search?(text: string, limit: number): Promise<EditRecording[]>;
    /**
     * A sketch made in the mix's add mode (2026-11-13): its parts (each a library recording you heard and chose) and how it
     * moves, handed to SATIE to write into this soundscape (the chat shows it; nothing is written before you approve there).
     */
    addSketch?(sketch: EditSketch): void;
    /**
     * The mix's add or replace button (2026-11-14): the chat opens with the place filled in ("add to The crossing: …",
     * "replace rail joint front: …"); you say what you want in your own words and SATIE does the rest.
     */
    intent?(i: {
        kind: 'add' | 'replace' | 'take' | 'change';
        scape: string;
        thing?: {
            key: string;
            label: string;
        };
        sid?: string;
        name?: string;
    }): void;
    /** One of SATIE's offered recordings chosen on the map: the same as "use this" in the chat (the offer's candidate id). */
    pickOffer?(candidateId: string): void;
    /** Play this level as its sidebar's big play does ("hear it in the game" at a soundscape): a variant switched starts it. */
    playLevel?(): void;
}
/** A new sound sketched in the mix: what it is, its parts, how it moves, the soundscape it goes in. */
export interface EditSketch {
    words: string;
    scape: string;
    parts: Array<{
        name: string;
        rec: EditRecording;
    }>;
    move: 'over' | 'place' | 'around';
    /** For a sound that passes (over): about how often, in seconds. */
    every?: number;
    /** It plays from this thing in the game (the mix's entity key and name). */
    thing?: {
        key: string;
        label: string;
    };
}
/** A recording the edit panel puts in as a take (a library sound, or a file). */
export interface EditRecording {
    url: string;
    name: string;
    license?: string;
    sampleId?: string;
}
/** One sound, as the edit panel reads it. */
export interface EditSound {
    sourceId: string;
    name: string;
    /** The game object (or family of objects) it belongs to, as the mixer groups it; a class says how many instances it has. */
    thing: {
        key: string;
        label: string;
        count?: number;
    };
    /** around: everywhere (a bed); yours: with the player; moving; place; contact: where the game sets it off. */
    where: 'around' | 'yours' | 'moving' | 'place' | 'contact';
    /** It plays when the game fires this event (null: it plays by itself). */
    event: string | null;
    /** The words a generated sound was made from. */
    words: string | null;
    takes: Array<{
        key: string;
        name: string;
        url: string | null;
        sampleId: string | null;
    }>;
    /** dB at your ear now, null when silent here. */
    heardDb: number | null;
    /** Where it is in the game now, seen from above (x, z in metres); null for a sound all around you. */
    at: [number, number] | null;
    /** How often it plays, in words: "always, on a loop", "every 6–14 s", "only when “purchase” happens in the game". */
    how: string;
    /** The part of its thing it plays from, when its thing has parts (the train's "front wheels"). */
    part?: string;
    /** Muted (by the mixer, or a `mute` line in the script). */
    muted?: boolean;
    /** A class's sound stands for its copy on every instance (the engine of each of 62 cars): their source ids, this one first. */
    copies?: string[];
    /** How jarring its first take is, 0 (a steady hum) to 1 (a clack, a bell strike): from the crest factor. */
    crest?: number;
}
/** The edit panel's side of the seam: the mixer calls these, the panel draws everything. */
export interface EditPanel {
    open(target: EditTarget, ctx: EditPanelContext): void;
    close(): void;
    /** Go to a level of what is open (the column's rows), without closing. */
    go?(target: EditTarget): void;
    /** Show or hide the library's recordings like the open sound (asked for to replace or add a take). */
    suggest?(on: boolean): void;
    /** The gold rings are exactly these recordings (a steered find's candidates); null goes back to none. */
    suggestIds?(sampleIds: string[] | null): void;
    /** A sound just played (from the sidebar, or a play by its rules): ripple it on the map, its take lit. */
    pulse?(sourceId: string, take?: number): void;
    /** The pointer is on this sound's row in the sidebar (null: off it): light it on the map. */
    highlight?(sourceId: string | null): void;
    /** The game plays this entity itself (a train pass), when it can: true if it started. */
    playGame?(thingKey: string): boolean;
    /** Whether the game's own run of this entity is still going (the train still passing). */
    gameRunning?(thingKey: string): boolean;
    /** Find where the soundscape's sounds sit before the mix is opened, so it opens placed. */
    warm?(ctx: Pick<EditPanelContext, 'sounds' | 'near' | 'soundscapes'>): void;
    /**
     * Add a sound to the open soundscape (2026-11-13): the search box on the map holds these words, the library's answers
     * are gold rings by cluster, the view goes there; `parts` are what SATIE thinks it needs (an airplane: engine, air).
     */
    add?(words: string, parts?: string[]): void;
    /** SATIE's offered recordings (the chat's choices) as gold rings on the map; null takes them off. */
    offer?(items: Array<{
        id: string;
        name: string;
        clip: string;
        url?: string;
    }> | null): void;
    /** Replace a sound, or add a take to it: the map's replace card, the library's recordings like it as gold rings. */
    replace?(sourceId: string): void;
}
export interface DevtoolsDocument {
    script: string;
    samples: Record<string, SampleEntry>;
}
export interface Devtools {
    open(): void;
    close(): void;
    toggle(): void;
    /** Replace the editor's text (e.g. after the agent rewrote the file). */
    setScript(text: string): void;
    document(): DevtoolsDocument;
    apply(text: string, note?: string): boolean;
    select(statementIndex: number): void;
    /**
     * Buy the takes the script is missing, the way a chat edit fetches them (realizeUrl). Resolves to
     * how many are still missing afterwards (0: everything plays), which ones by name, and realize's
     * own words on why (a cap, credits, sign-in), so a host can say it instead of pointing elsewhere.
     */
    fetchMissing(): Promise<{
        missing: number;
        names: string[];
        note: string;
    }>;
    addRecording(recording: {
        clip: string;
        url: string;
        name: string;
        sampleId?: string;
        license?: string;
        attribution?: string;
    }, position?: [number, number, number], loop?: boolean): Promise<boolean>;
    /** Open the edit panel on a soundscape or a sound; false when the game mounted none (`opts.editPanel`). */
    openEdit(target: EditTarget): boolean;
    /** Downloadable local observations, not a consented contribution. */
    edits(): string;
    /** Wait for queued local-dev-server writes; rejects if any write failed. */
    flushEdits(): Promise<void>;
    /**
     * The world's soundscapes and their variants (spec 012), once a `places` file has loaded; null
     * before. For the mixer's strip and the edit view: which soundscape you are in, its variants
     * (`variants.choose` saves). The edit view opens through `openEdit({ soundscape })`.
     */
    soundscapes(): SoundscapeAccess | null;
    destroy(): void;
}
export interface SoundscapeAccess {
    variants: VariantController;
    /** The soundscape the listener is in now (null: none). */
    current(): string | null;
    /** Called when the listener moves into another soundscape; returns an unsubscribe. */
    onChange(cb: (soundscapeId: string | null) => void): () => void;
}
interface SourceChoice {
    clip: string;
    prompt?: string;
    synth: boolean;
    recordings?: Statement['recordings'];
}
export interface SampleEntry {
    url: string;
    source?: string;
    name?: string;
    license?: string;
    attribution?: string;
    sampleId?: string;
    sha256?: string;
    synth?: SynthAsset;
    sourceChoices?: {
        sample?: SourceChoice;
        synth?: SourceChoice;
    };
}
export declare const voiceColor: (statementIndex: number) => string;
/** A statement's lines in the script: comment lines above, the header, its indented properties. */
interface Block {
    start: number;
    end: number;
    header: number;
    count: number;
}
/** Split a script into the blocks its voice statements come from, in order (gen/world/room/entity blocks are skipped). */
/**
 * Why the runtime would refuse to load `next` (a parser warning it adds, a duplicate source_id),
 * or null when it loads. The same rule as `satie-runtime`'s loader (`sourceFingerprints`), and only
 * for what this edit introduces: a script that already had a warning is not made worse by it.
 */
export declare function whyUnloadable(next: string, before: string): string | null;
/** Where an aim landed: the contract object (when placing on a thing), the surface point (metres) and how far. */
/**
 * A sound's first `seconds` as a base64 WAV: how a find starts from a recording that is not in the
 * library (the developer's own file, a Freesound import). SATIE listens to it and describes it.
 */
export declare function excerptBase64(buffer: AudioBuffer, seconds: number): Promise<string>;
/**
 * Why a setting's row is a text box rather than its control: the value is one the control cannot
 * show (it changes over time, follows the game, is a named colour, a range on a one-handle slider).
 * Null for a setting that is plain text by design (`recordings`, `source_id`, `at` …) or an empty value.
 */
export declare function textFallbackReason(kind: ControlSpec['kind'], raw: string): string | null;
export interface AimTarget {
    hostId: string | null;
    point: [number, number, number];
    distanceM: number;
    mode: 'thing' | 'spot';
}
/**
 * The add sheet's request in words: only what the person said. A chip they did not touch is not
 * sent (it would read as a choice), and nothing asks for options: SATIE decides from the words
 * whether to offer sounds to hear or reuse one already in the scene.
 */
export declare function addRequestText(what: string, said: {
    kind?: string;
    where?: string;
    movement?: string;
    often?: string;
    when?: string;
}): string;
export { GROUP_LINE, readGroupLines, writeGroupLines, NAME_LINE, type SavedGroup } from '../edit/sceneMap';
export declare function voiceBlocks(text: string): Block[];
/** Where a voice block sat: the head lines of its neighbours, and its line, so a restore can put it back there. */
export interface BlockAnchor {
    prevHead: string | null;
    nextHead: string | null;
    line: number;
}
export declare function blockAnchor(text: string, start: number): BlockAnchor;
/** Put a deleted voice block back where it was: before the voice that followed it, else after the one before it, else at its old line. */
export declare function restoreBlock(text: string, block: string, at: BlockAnchor): string;
/** Edit authored source level without taking volume away from host controls or fades. */
export declare function trimSourceLevels(script: string, sourceIds: readonly string[], deltaDb: number): string | null;
/** Rewrite a voice's head to play `clip` instead of what the parser read as its sound; the rest of the line stays. */
export declare function swapHeader(header: string, st: Pick<Statement, 'genPrompt' | 'clip'> | undefined, clip: string): string;
export { shortName, soundsLike, soundAction, fallbackName, readableId } from '../core/voiceNames';
/** Mount the dev overlay for `engine`. Returns a handle; call `destroy()` to remove it. */
export declare function devtools(engine: SatieEngine, opts?: DevtoolsOptions): Devtools;
//# sourceMappingURL=index.d.ts.map