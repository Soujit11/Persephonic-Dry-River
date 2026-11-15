/**
 * Generation requests — the pure derivation of WHAT a script buys.
 *
 * A `gen` statement is realized into audio one take at a time: the base take
 * plus one per extra `variants` rank, each under a buffer key the engine
 * looks up before it ever asks its generator hook. This module states that
 * derivation once, with no engine instance, so the same answer is available
 * to the live engine (`sampleGenOptions` / `variantClipPath`), the offline
 * simulation, and a server that realizes a script ahead of playback (the
 * Satie MCP `satie_realize` tool): parse, call `genRequestsFor`, generate
 * each request, hand the buffers back under `clipPath`, and the engine finds
 * them landed — no generation at runtime, no generator hook needed.
 *
 * Deterministic on purpose: ranged `duration`/`influence` are sampled with
 * the rng you pass (the engine passes its own), so a caller wanting the same
 * take pool on every run seeds it.
 */
import type { Statement } from './Statement';
export interface GenOptions {
    duration?: number;
    influence?: number;
    /**
     * Forbid prompt-level cache aliasing: count-variant voices (note_1..note_5)
     * share a prompt but must each get a unique generated take.
     */
    uniqueTake?: boolean;
    /**
     * Which distinct take of the prompt this is (0-based), set with
     * `uniqueTake`. The server keeps a POOL of takes per prompt: rank n is
     * served from the pool when it exists and generated into it when it
     * does not, so a `variants 3` voice or `4 * oneshot gen` copies get the
     * same three or four distinct recordings on every device and every play,
     * bought once. Without a rank a unique take is always freshly generated.
     */
    takeIndex?: number;
    /**
     * Jump the generator's concurrency queue. Reactive event takes (footsteps)
     * must not wait behind a scene's 24-second ambient-bed generations — the
     * player is walking NOW; a bed can arrive four seconds later.
     */
    priority?: boolean;
    /**
     * `voice <id>` — synthesise this take as SPEECH with the named upstream
     * voice instead of generating a sound. The engine only carries the id; the
     * app's generator hook chooses the path.
     */
    voiceId?: string;
    /** `music` — generate this take with the music model, not as a sound effect (spec 001). */
    music?: boolean;
    /** `synth` - render this take with Satie's synthesizer from a patch, not as a sample (2026-11-12). */
    synth?: boolean;
}
/**
 * The generator's prompt discipline, applied to every gen prompt on the way
 * out: the listener's vantage is removed first ("distant", "muffled",
 * "through the wall", "faint": `withoutPerspective`, 2026-11-08), a loop asks
 * for a seamless texture, a one-shot for a single event, and unless the author
 * asked for reverb the source is recorded DRY — the engine owns acoustics
 * (rooms, distance, occlusion), so a take must carry none of its own. Part of the generation cache key and the server-side capture
 * genKey: changing it regenerates cached clips once, on purpose. Servers
 * that realize scripts ahead of playback apply the same enrichment so they
 * land on the same take pool the app would.
 */
export declare function enrichGenPrompt(prompt: string, isLoop: boolean): string;
/** What the app requests when a gen statement states no length / influence (seconds; 0..1). */
/** A synthesized loop is a minute unless asked otherwise; a synthesized one-shot four seconds. Both 2 to 120 s. */
export declare const SYNTH_DEFAULTS: {
    readonly loopDurationS: 60;
    readonly oneshotDurationS: 4;
    readonly minDurationS: 2;
    readonly maxDurationS: 120;
};
/** The length a synth take is rendered at: the one rule the app, the route's callers and the MCP share. */
export declare function synthDuration(requested: number | undefined, isLoop: boolean): number;
export declare const GEN_DEFAULTS: {
    readonly loopDurationS: 30;
    readonly oneshotDurationS: 4;
    readonly minDurationS: 0.5;
    readonly maxDurationS: 30;
    readonly loopInfluence: 0.3;
    readonly oneshotInfluence: 0.5;
};
/**
 * Distinct generated takes per `{text}` substitution of a template trigger.
 * Compatibility minimum; authors can request a larger bank with `variants`.
 * Two alternating takes are not evidence of perceptual variety.
 */
export declare const TRIGGER_TAKE_BANK = 2;
/** Shared by generation, live playback and MCP cost/preflight reporting. */
export declare const templateBankSize: (stmt: Pick<Statement, "variants"> & Partial<Pick<Statement, "recordings">>, text?: string) => number;
export declare const takeCount: (stmt: Pick<Statement, "variants" | "recordings">) => number;
/** Generation length of a trigger take whose gen block states none (seconds): events are tight clips. */
export declare const TRIGGER_TAKE_DURATION_S = 1.5;
/** A single locomotion contact, not a multi-step recording. */
export declare const CONTACT_TAKE_DURATION_S = 0.7;
/** True for a gen prompt that substitutes the event's text per fire (`… on {text}`). */
export declare function isTemplatePrompt(prompt: string | null | undefined): boolean;
/**
 * Where a template's takes are kept: the template's own identity (its prompt, hashed, so two
 * templates never share a bank) then, per text, the WHOLE text. Keys before 2026-09-30 cut the
 * substituted prompt at 30 characters, so texts with a common start ("grass", "gravel_ballast")
 * shared one bank; those keys are still read (`legacyTemplateTake`), never written.
 */
export declare function templateBankPrefix(genPrompt: string): string;
/** The prompt a template trigger fires with for `text`, and the buffer key of its `bank`-th take. */
export declare function templateTake(genPrompt: string, text: string, bank: number): {
    prompt: string;
    clipPath: string;
};
/** The key the same take had before 2026-09-30 (read as a fallback, so saved scenes keep playing). */
export declare function legacyTemplateTake(genPrompt: string, text: string, bank: number): string;
/** Canonical template lookup for runtime, bank inspectors and exported asset manifests. */
export declare function templateRecording(stmt: Statement, text: string, bank: number): {
    prompt: string;
    clipPath: string;
};
/** Explicit references, including all surface banks, for retention and asset preparation. */
export declare function recordingReferences(stmt: Statement): string[];
/** Default generation length of a `loopable` gen block that states none (seconds). */
export declare const GEN_LOOPABLE_DEFAULT_S = 10;
/** Buffer key of the k-th pooled take: the base clip for k = 0, `<base>#k+1` beyond. */
export declare function takeClipPath(stmt: Statement, k: number): string;
/** The generator options a statement asks for its `variant`-th take. */
export declare function genOptionsFor(stmt: Statement, variant?: number, rng?: () => number): GenOptions;
/** One take a script will ask its generator for, keyed the way the engine looks it up. */
export interface GenRequest {
    /** Buffer key the engine reads (`setAudioBuffer` / `loadAudioFile` under this name lands it). */
    clipPath: string;
    /** The statement's gen prompt, un-enriched (the generator hook owns the enrichment). */
    prompt: string;
    isLoop: boolean;
    /** Pool rank of this take among the statement's `variants` (0 = base). */
    variant: number;
    options: GenOptions;
    /** True when the take is speech (`voice <id>`), routed to TTS rather than sound generation. */
    speech: boolean;
    /** Index of the owning statement in the parsed script. */
    statementIndex: number;
    /** A per-text take's key before 2026-09-30 (`legacyTemplateTake`): a scene saved with it has the take. */
    legacyClipPath?: string;
}
/** Whether `samples` already has the take a request names (under its key, or the key it was saved with). */
export declare function requestLanded(samples: Record<string, {
    url?: string;
} | undefined>, r: Pick<GenRequest, 'clipPath' | 'legacyClipPath'>): boolean;
/**
 * Every take the script's gen voices will request, deduplicated by buffer
 * key, in statement order. Count copies (`3 * loop gen …`) are separate
 * statements after parsing and appear as separate requests.
 */
export declare function genRequestsFor(statements: readonly Statement[], rng?: () => number): GenRequest[];
/**
 * The takes a script's TEMPLATE triggers (`on step gen single footstep on
 * {text}`) will fire with for each of `texts` (the surfaces / descriptions the
 * game will send): `templateBankSize(stmt)` distinct takes per text,
 * keyed exactly as `fireEvent` looks them up, with the options
 * `generateTriggerTake` sends. Realize these ahead of time and the runtime
 * needs no generator for footsteps.
 */
export declare function templateRequestsFor(statements: readonly Statement[], texts: readonly string[], rng?: () => number): GenRequest[];
/** Ground labels are literal runtime materialAt texts; do not split compound names. */
export declare function worldGroundSurfaces(world: {
    ground?: Array<{
        material: string;
    }>;
} | null | undefined): string[];
/** One plan for both budget estimates and realization, including known template banks. */
export declare function generationPlanFor(statements: readonly Statement[], world: Parameters<typeof worldGroundSurfaces>[0], suppliedSurfaces?: readonly string[], rng?: () => number): {
    surfaces: string[];
    requests: GenRequest[];
};
/** Template trigger statements in a script: the prompts that need `texts` to be realized. */
export declare function templatePrompts(statements: readonly Statement[]): Array<{
    statementIndex: number;
    event: string | null;
    prompt: string;
}>;
//# sourceMappingURL=GenRequests.d.ts.map