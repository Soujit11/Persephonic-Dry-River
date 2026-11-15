/**
 * A find: one attempt to reach a sound by listening and steering instead of
 * describing it. Start from words, a library sound or a place on the map; hear
 * a round of candidates; say "Closer" or "Less close"; repeat until "Use this".
 *
 * Types only. The in-game mixer (src/engine/devtools), the web app (src/lib)
 * and the MCP's `satie_find` tool all read these shapes, and the engine is the
 * lowest layer, so this is the one place every side can import. The logic is
 * `src/lib/find/round.ts`; the tool is `packages/satie-mcp/find.ts`.
 */
import type { SynthAsset } from '../synth/asset.js';
/** How the words were read, as the landscape's two-step search splits them. */
export interface FindSplit {
    what: string;
    how: string | null;
    kind: 'bed' | 'oneshot' | null;
}
/**
 * A place on the web map. `runId`, `regionId`, `x` and `y` name it on one build
 * of the map; `anchors`, the sample ids that define it, are what survive a
 * rebuild (old map builds are deleted).
 */
export interface MapPlace {
    runId: string;
    regionId?: number;
    x?: number;
    y?: number;
    anchors: string[];
}
export type FindStart = {
    kind: 'words';
    text: string;
    split?: FindSplit;
}
/** "More like this one": in the in-game mixer, the voice's current sound. */
 | {
    kind: 'reference';
    sampleId: string;
}
/**
 * A sound with no library id: the developer's own file, a Freesound import. A short excerpt
 * (base64 WAV or MP3; about 10 s is plenty, at most 2 MB). Satie listens and describes it, and the
 * first round searches by that description plus `hint` (e.g. the voice's name). Echo the round's
 * `heard` back here on later rounds so the audio is not listened to again.
 */
 | {
    kind: 'audio';
    base64: string;
    hint?: string;
    heard?: string;
} | ({
    kind: 'region';
} & MapPlace) | ({
    kind: 'pin';
} & MapPlace);
/** Where a sound sits on the current map build; approximate for off-map sounds. Web map only. */
export type FindPlaced = {
    runId: string;
    x: number;
    y: number;
    regionId: number | null;
    approximate: boolean;
} | null;
export interface FindCandidate {
    /** community_samples.id. */
    sampleId: string;
    name: string;
    /** The clip token a script writes to play it (`loop <clip>`). */
    clip: string;
    /** Why it is here: matched the words, sounds like the reference, near the place, or moved toward the verdicts. */
    via: 'words' | 'sounds-like' | 'nearby' | 'steered';
    /** A playable URL, auditioned in the running scene. */
    url: string;
    /** The short loudness-matched snippet, for sweeping; null when none is cut or the search does not return it. */
    snippetPath: string | null;
    /** The same snippet as a playable URL (the in-game mixer plays it directly); null when none is cut. */
    snippetUrl: string | null;
    durationMs: number | null;
    license: string;
    attribution: string | null;
    place?: FindPlaced;
    /** Steered rounds: is this sound about as near the kept ones as they are to each other? False: show it as "not very close". */
    close?: boolean;
}
/**
 * - `found`: good matches.
 * - `nothing-close`: the search worked but the nearest sounds are far; the closest are still returned.
 * - `unavailable`: the search failed. Not evidence of a gap, so never a reason to generate.
 */
export type FindStatus = 'found' | 'nothing-close' | 'unavailable';
export interface FindRound {
    findId: string;
    /** 0 for the first answer. */
    round: number;
    status: FindStatus;
    candidates: FindCandidate[];
    /** Whether to SUGGEST generating: only a nothing-close that is not degraded. Generate stays reachable regardless. */
    suggestGenerate: boolean;
    split?: FindSplit;
    /** Part of the answer came from a fallback (a narrower index, words because sound fingerprints were missing, or the hint because listening failed). */
    degraded: boolean;
    /** For an `audio` start: what Satie heard in it. Send it back as `start.heard` on later rounds. */
    heard?: string;
    /** Fewer sounds were left than a round holds: the library is running out for this find. */
    exhausted?: boolean;
}
export interface FindFeedback {
    sampleId: string;
    /** closer: move toward it. less-close: move away. same: about as close as the rest; keep searching around it. */
    verdict: 'closer' | 'less-close' | 'same';
    round?: number;
}
/**
 * One round's request. Stateless: every call carries the start, every verdict
 * so far and every sound already shown, so no server keeps the find.
 */
export interface FindRequest {
    findId?: string;
    start: FindStart;
    feedback?: FindFeedback[];
    /** Sample ids already shown in this find; the next round brings new ones. */
    shown?: string[];
    /** Only sounds long enough to loop. */
    loop?: boolean;
    /** Candidates per round (default 6). */
    limit?: number;
}
/** A sound played past a threshold (about 200 ms). Verdicts alone undercount listens. */
export interface FindListen {
    findId: string;
    round: number;
    sampleId: string;
    ms: number;
}
/**
 * How far a pick reaches.
 * - `every-voice`: replace the recording for every voice that plays it (they share the clip).
 * - `this-voice`: this voice only, under its own clip; the voices that shared the old one keep it.
 * - `add-version`: one more version of this voice (its take bank); the current recording stays.
 */
export type FindUseScope = 'every-voice' | 'this-voice' | 'add-version';
export type FindUseTarget = 
/** In-game mixer: one voice of the project's scene.satie / samples.json. `sourceId` names the voice for this-voice / add-version. */
{
    kind: 'script-voice';
    clipKey: string;
    sourceId?: string;
    scope: FindUseScope;
}
/** Web: one voice of a Chat scene, when the card was opened for it. */
 | {
    kind: 'scene-voice';
    sessionId: string;
    clipKey: string;
    sourceId?: string;
    scope: FindUseScope;
};
export interface FindUse {
    findId: string | null;
    sampleId: string;
    target: FindUseTarget;
}
/** What "Use this" pins: the exact file, by id and (once stored) by a fingerprint of its bytes. */
export interface FindBinding {
    clipKey: string;
    sampleId: string;
    url: string;
    sha256: string | null;
}
/** One planned variation: the prompt Satie would generate, and what it changes. */
export interface FindVariation {
    prompt: string;
    differs: string;
}
/** `satie_vary` plan (free): what N variations would be, and what they would cost. Nothing is bought. */
export interface FindVaryPlan {
    variations: FindVariation[];
    /** With Closer / Less close marks: what the kept sounds share that the rejected ones lack, in one line, heard from their audio. Shown before making, correctable in words. */
    steer?: string;
    costCents: number;
    loop: boolean;
    durationS?: number;
    /** Explicit source choice, to carry unchanged from plan to make. */
    synth?: boolean;
}
export interface FindVaryTake {
    sampleId: string;
    name: string | null;
    url: string;
    prompt: string;
    differs: string;
    synth?: SynthAsset;
    /** Where it sounds on the web map; null until the map side places it. */
    placed: FindPlaced;
}
/** `satie_vary` make (spends): the takes bought, any that failed, and what was spent. New takes are unlisted, for review. */
export interface FindVaryResult {
    takes: FindVaryTake[];
    failed: Array<{
        prompt: string;
        error: string;
    }>;
    spentCents: number;
    status: 'review';
}
/**
 * What a surface reports about a find through `satie_find_log`: listens (a
 * sound played past the audition threshold) and the final "Use this". Rounds
 * themselves are recorded by the server as it serves them.
 */
export interface FindLogRequest {
    findId: string;
    listens?: Array<{
        round: number;
        sampleId: string;
        ms: number;
    }>;
    use?: {
        round?: number;
        sampleId: string;
        scope: FindUseScope;
    };
}
//# sourceMappingURL=types.d.ts.map