import { type SceneMaterial, type SceneRoom, type SceneSoundscape, type SceneMic } from './Scene.js';
import { Statement } from './Statement.js';
import { type PathDef } from '../spatial/Paths.js';
import type { WorldSpec } from '../world/worldSpec';
import { type VisualModuleBlock, type VisualOverride, type VisualBinding, type VisualAutomation } from './SceneVisual.js';
import { type EntityDef } from './Entities.js';
export declare class SatieSyntaxError extends Error {
    propertyName: string | null;
    invalidValue: string | null;
    sourceLine: string | null;
    lineNumber: number;
    constructor(message: string, propertyName?: string | null, invalidValue?: string | null, sourceLine?: string | null, lineNumber?: number);
}
export interface ParseWarning {
    message: string;
    lineNumber: number;
    severity: 'warning' | 'info';
    suggestion?: string;
}
export interface ParseResult {
    /** Playback SPL reference; undefined retains host policy, null requests adaptive gain. */
    levelReferenceDb?: number | null;
    statements: Statement[];
    warnings: ParseWarning[];
    /** Scene-level declarations. Empty for scripts that declare no spaces. */
    materials: SceneMaterial[];
    rooms: SceneRoom[];
    /** `soundscape` blocks (spec 014). Empty for scripts that declare none. */
    soundscapes: SceneSoundscape[];
    /**
     * `mic` blocks — the microphones the scene is CAPTURED by. Not statements
     * (a mic is not a voice); the export layer turns each into one render.
     */
    mics: SceneMic[];
    /** The `world` block, when the script carries a procedural world. Last one wins. */
    world: WorldSpec | null;
    /**
     * `entity` blocks (Entities.ts). Their member statements ARE in
     * `statements` (with `Statement.entityId` set) so every consumer of the
     * statement list — mixer rows, viewport labels, generation status — sees
     * them; `memberIndices` points back into that array.
     */
    entities: EntityDef[];
    /**
     * `path <name>` blocks (spatial/Paths.ts) — authored waypoint trajectories,
     * referenced by `move <name>`. Compiled to LUT trajectories at parse time,
     * so live playback and offline export both resolve them by construction.
     */
    paths: PathDef[];
    /**
     * Visual blocks (core/SceneVisual.ts): `module <id> … endmodule` carries a
     * Three.js module byte for byte; `override`, `binding` and `automation`
     * blocks edit, bind and animate the nodes that module declares. Empty for
     * scripts without a visual.
     */
    modules: VisualModuleBlock[];
    overrides: VisualOverride[];
    bindings: VisualBinding[];
    automations: VisualAutomation[];
}
/** A folder's registered contents: its sound tokens and the effects block its voices inherit. */
export interface FolderContents {
    tokens: string[];
    dsp: string;
}
/** Folder slug (lower-case) to contents. */
export type FolderRegistry = ReadonlyMap<string, FolderContents>;
/** Per-call options for `parse` / `parseWithWarnings` / `parseScene` / `tryParse`. */
export interface ParseOptions {
    /**
     * The folders `slug/*` expands from and whose effects blocks voices inherit.
     * Defaults to the process-wide registry (`registerFolderContents`); a server
     * parsing on behalf of a user passes that user's folders here instead.
     */
    folders?: FolderRegistry;
}
export declare function sanitizeForClipName(prompt: string): string;
export declare function pathFor(clip: string): string;
/** `heard_in <signal> <dB>[, <signal> <dB>…]`: a per-soundscape level, weighted by each signal (spec 012). */
export declare function parseHeardIn(v: string): Array<{
    signal: string;
    invert: boolean;
    db: number;
}> | null;
/** The text `heard_in` is written as (the inverse of `parseHeardIn`). */
export declare function formatHeardIn(list: ReadonlyArray<{
    signal: string;
    invert: boolean;
    db: number;
}>): string;
/** The custom handlers' names — the conformance test checks them against the registry. */
export declare const CUSTOM_PROPERTY_NAMES: ReadonlySet<string>;
/**
 * Register (or replace) the sound tokens of a folder, by slug — and the
 * folder's effects block (`dsp`: Satie property lines such as `eq low -3`,
 * `reverb wet 0.3 size 0.6`), which every voice playing one of its sounds
 * inherits as defaults (see `applyFolderDsp`).
 */
export declare function registerFolderContents(slug: string, tokens: string[], dsp?: string): void;
export declare function clearFolderRegistry(): void;
/** The registered sound tokens of a folder, or null when unknown. */
export declare function getRegisteredFolder(slug: string): string[] | null;
/** The registered effects block of a folder; null when unknown or empty. */
export declare function getRegisteredFolderDsp(slug: string): string | null;
/** Split `slug/sound` (or `slug/*`) into its parts; null for any other clip. */
export declare function parseFolderClip(clip: string): {
    slug: string;
    sound: string;
} | null;
/** Every folder slug a script references (`slug/sound` or `slug/*`), deduped. */
export declare function folderRefsIn(script: string): string[];
/**
 * Parse with warnings — returns both statements and non-fatal warnings.
 * This is the preferred parse function for editor integration.
 */
export declare function parseWithWarnings(script: string, options?: ParseOptions): ParseResult;
/**
 * Parse into a full scene: voices PLUS the spaces they live in.
 *
 * `parse()` still returns `Statement[]` and is unchanged, so the engine, the
 * three exporters, the editor and the AI repair path all keep working against
 * the shape they already know. Only callers that care about spaces opt in.
 */
export declare function parseScene(script: string, options?: ParseOptions): ParseResult;
export declare function parse(script: string, options?: ParseOptions): Statement[];
export declare function tryParse(script: string, options?: ParseOptions): {
    success: boolean;
    statements: Statement[] | null;
    errors: string | null;
};
//# sourceMappingURL=SatieParser.d.ts.map