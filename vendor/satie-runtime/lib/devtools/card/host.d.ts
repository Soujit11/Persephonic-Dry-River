/**
 * Everything the sound card needs from the mixer, handed over once. The card never reaches
 * into the mixer's closure: what it reads (the statement, what is heard where you stand) and
 * what it draws with (the mixer's own controls) come through here, and every committed change
 * still goes through the mixer's one commit point (`applyScript`).
 *
 * The contract grows a phase at a time (`06-structure-outline-sound-edit-card.md`); `sections`
 * is the part of today's inspector the card still borrows, and shrinks as the card owns more.
 */
import type { Statement } from '../../core/Statement.js';
import type { ReachPath } from './dials.js';
import type { SoundSituation } from './complaints.js';
import type { TrimLevels } from './recipes.js';
import type { DraftEngine } from './draft.js';
import type { DialContext } from './dials.js';
import type { VoiceLocator } from '../../edit/scriptEdit.js';
import type { FindCandidate, FindStart, FindUseScope } from '../../find/types.js';
import type { FindRoutes } from './findSession.js';
import type { Area } from './motion.js';
import type { EntityDef } from '../../core/Entities.js';
import type { SourceCandidate, SourceRequest } from './source.js';
/** What the level model says about one sound where the listener stands now. */
export interface CardHearing {
    /** dB SPL at the ear (the level model's estimate), null when unknown. */
    receivedDb: number | null;
    /** Emission at 1 m after its `volume` trim, null when unknown. */
    emissionDb: number | null;
    /** The level model's hearing floor where you stand, null before anything sounded. */
    floorDb: number | null;
    /** All around you (a bed, a field): no place, no reach. */
    around: boolean;
    path: ReachPath;
}
export interface CardHost {
    /** Explicit paid creation, previewed before the source changes. */
    createSource?(i: number, request: SourceRequest): Promise<SourceCandidate>;
    restoreSource?(i: number, synth: boolean): boolean;
    hasPreviousSource?(i: number, synth: boolean): boolean;
    /** A published scene (Explore): the card is for listening; any change asks for the visitor's own copy (the mixer's gate). */
    published?: boolean;
    /** The statement at this index in the loaded scene. */
    statement(i: number): Statement | undefined;
    /** The committed script (the mixer's document), never a draft. */
    script(): string;
    hear(i: number): CardHearing;
    /** The snapshot "what's off?" reads: this sound, the voices of its recording, and what else is heard. */
    situation(i: number): SoundSituation;
    /**
     * The mixer's own level control for this sound (the row's fader): the card's "how loud" dial
     * IS that control, so the two can never disagree. Null when its level is not the mixer's to
     * move (no `source_id`, a level the game sets, a crowd's).
     */
    levelControl(i: number): HTMLElement | null;
    /** The level writer every fader uses (keeps ranges and follow maps). */
    trim: TrimLevels;
    /** The mixer's one commit point: history, the edit record, the save. False when refused. */
    applyScript(next: string, label: string, edit: {
        kind: string;
        detail: Record<string, unknown>;
    }): boolean;
    /** The edit record only: listens, marks, refusals (nothing changed, so no history version). */
    record(kind: string, detail: Record<string, unknown>): void;
    /** The engine, as far as a draft touches it. */
    draftEngine: DraftEngine;
    /** Coalesce to one engine load per frame. */
    schedule(run: () => void): void;
    /** Play it here now, whatever the game is doing (`SatieEngine.holdAudible` on every voice of its recording), or let go. */
    listen(i: number, on: boolean): void;
    /** Fire a now-and-then voice through its own track (`SatieEngine.fireNow`). */
    fireNow(i: number): 'fired' | 'silent';
    /** The length of what it plays (s). */
    durationS(i: number): number;
    /** Why it is silent now, in words ("only in the cabin"), when a fire found nothing to play. */
    silentReason(i: number): string;
    /** What picks its dials: its kind (all around you, yours, moving, in place, where it happens) and the room that decides its echo. */
    dialContext(i: number): DialContext;
    /** Where its lines are in the committed script (by `source_id` when it has one). */
    locator(i: number): VoiceLocator;
    /** A card turn (`surface: 'card'`), optionally refining the draft and its targets instead of the saved sound. */
    ask(i: number, text: string, proposal?: CardProposalContext): Promise<CardChatReply>;
    /** Open the mixer's conversation where this sound's exchange is ("Continue in the conversation ›"). */
    continueInChat(i: number): void;
    /** The library name of what this voice plays now (null when it has none): a find marks other takes of it. */
    recordingName?(i: number): string | null;
    /** Where a find starts for this voice: its library sound, else its audio (an excerpt), else its words. */
    findStart(i: number): Promise<FindStart>;
    /** Open the edit panel on this sound instead of the card's own find; false when the game mounted none. */
    openEdit?(i: number): boolean;
    /** `/__satie/find` and its log. */
    findRoutes: FindRoutes;
    /** A candidate's audio. */
    decode(url: string): Promise<AudioBuffer>;
    /** The take keys every voice of this recording plays (a candidate auditioned under them is heard as it would play). */
    takeKeys(i: number): string[];
    /** How many voices play this recording (Use this reaches them all by default). */
    sharedCount(i: number): number;
    /** The scene's things a sound can ride on, with their names. */
    things(): Array<{
        id: string;
        label: string;
    }>;
    /** An object's name as people say it. */
    thingName(id: string): string;
    /** Draggable handles for a roaming sound's area in the world (null ends them); absent without a world layer. */
    editShape?(shape: Area | null, h?: {
        onPreview?(a: Area): void;
        onDrop?(a: Area): void;
        onCancel?(): void;
    }): void;
    /** A crowd (an `entity` block) and its member sounds' indices, null when there is none by that id. */
    entity(id: string): {
        def: EntityDef;
        members: number[];
    } | null;
    /** Open a crowd's card (its entity block). */
    openCrowd(id: string): void;
    /** Open a sound's own card (a crowd's member). */
    openSound(i: number): void;
    /** A sound's name as the mixer says it. */
    soundName(i: number): string;
    /** How many versions it has (its take bank, its generated takes, or one recording). */
    versionCount(i: number): number;
    /** "on its own": the candidate alone, the scene silent (the mixer's own preview). */
    previewAlone(url: string, btn: HTMLButtonElement): void;
    /** Use this: the script names the recording, samples.json pins it, one history version. False when it could not. */
    useFound(i: number, c: FindCandidate, scope: FindUseScope, ctx: {
        findId: string | null;
        round: number;
    }): Promise<boolean>;
    /** The rest of today's inspector, until the card owns it. */
    sections(i: number): HTMLElement[];
}
export interface CardProposalContext {
    /** The adjusted proposal, not the committed document or the side currently playing. */
    script: string;
    text: string;
    target: string[];
}
/**
 * What a turn from the card's say-it box comes back as. An edit is a proposal the card plays
 * before it is kept (never applied by the mixer); anything else is words, with `more` when the
 * answer asks something the conversation is the place to answer.
 */
export type CardChatReply = {
    kind: 'proposal';
    text: string;
    script: string;
    target: string[];
} | {
    kind: 'say';
    text: string;
    more?: boolean;
}
/** Satie offers sounds: the card opens its own find (it starts from the sound it plays). */
 | {
    kind: 'find';
} | {
    kind: 'none';
};
//# sourceMappingURL=host.d.ts.map