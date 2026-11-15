import type { Plugin } from 'vite';
export interface SatiePluginOptions {
  /** Directory the overlay may write under (default "public"). */
  publicDir?: string;
  /** The Satie MCP endpoint the library search proxies to (default SATIE_MCP_URL or https://www.satie.world/mcp). */
  mcpUrl?: string;
  /** A Satie access token, or a function that returns a fresh one (default SATIE_TOKEN). */
  token?: string | (() => string);
  /** Run a chat turn in-process instead of calling the MCP's satie_chat (a local build of the tool). */
  chat?: (args: Record<string, unknown>, env: { token: () => Promise<string>; server: unknown; callTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>> }) => Promise<Record<string, unknown>>;
}
export function satie(options?: SatiePluginOptions): Plugin;
/** satie_find's `limit` cap; the dev server holds a find from the mixer to it. */
export const FIND_LIMIT_MAX: number;
/** Write one playthrough capture segment to `.satie/captures/<iso-time>-<segment>.json` (owner-only); returns the project-relative path, the JSON text and the segment index. */
export function persistCapture(projectRoot: string, telemetry: unknown): Promise<{ path: string; text: string; segment: number }>;
/** The most a capture segment may weigh: 32 MB, the MCP's own limit for satie_asset kind "capture". */
export const CAPTURE_MAX_BYTES: number;
/** Append a bounded v2/v3 edit event under .satie/authoring, never public/; its decisions also go to the satie.edits/v1 log. */
export function persistEditEvent(projectRoot: string, event: unknown, options?: { publicDir?: string }): Promise<string>;

/** One line of the satie.edits/v1 log (packages/satie-runtime/EDITS.md). */
export interface SatieEdit {
  v: 'satie.edits/v1';
  /** ISO-8601, when the developer made the decision. */
  at: string;
  /** The script's path relative to the project (public/satie/scene.satie). */
  scene: string;
  /** The voice's source_id as in the script; `line:<n>` for a voice without one; "*" for the whole scene. */
  voice: string;
  /** The voice's `at` host, or null. */
  host: string | null;
  op: 'level' | 'mute' | 'unmute' | 'solo' | 'unsolo' | 'move' | 'swap' | 'trim' | 'remove' | 'add' | 'set' | 'label' | 'note';
  value: Record<string, unknown>;
  by: 'developer' | 'satie';
}
export const EDITS_VERSION: 'satie.edits/v1';
/** `.satie/authoring/edits.jsonl`, relative to the project root. */
export const EDITS_PATH: string;
/** Translate one mixer capture event (satie.edits/v3) into the satie.edits/v1 lines it implies. */
export function editsFromEvent(event: unknown, options?: { publicDir?: string }): Promise<SatieEdit[]>;
/** Parse a satie.edits/v1 JSONL text, skipping bad lines. */
export function parseEditLog(text: string, filter?: { scene?: string; since?: string }): SatieEdit[];
/** Append lines to the project's private log. */
export function appendEdits(projectRoot: string, edits: SatieEdit[]): Promise<string>;
/** The project's log, parsed and filtered; [] when there is none yet. */
export function readEdits(projectRoot: string, filter?: { scene?: string; since?: string }): Promise<SatieEdit[]>;
/** The mixer's saved version tree (satie.history/v1) for a script, or null. */
export function readHistory(projectRoot: string, scriptPath: string): Promise<unknown | null>;
/** Replace the mixer's saved version tree, beside the script's edit logs. */
export function writeHistory(projectRoot: string, history: unknown): Promise<string>;
export default satie;

/** Save an edited script and refresh its existing local contract identity. */
export function saveEditedScene(target: string, text: string): Promise<void>;

/** "Sign in with Satie" for a dev tool: an OAuth 2.1 public client of the MCP's authorization server (PKCE, dynamic registration). */
export function createSatieAuth(mcpUrl: string): {
  start(redirectUri: string): Promise<string>;
  finish(state: string, code: string): Promise<void>;
  token(): Promise<string>;
  who(): Promise<{ email: string | null } | null>;
  signOut(): Promise<void>;
};
