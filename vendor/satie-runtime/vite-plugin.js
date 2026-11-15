/**
 * satie-runtime/vite — what the dev overlay needs from the dev server.
 *
 * The overlay (`import { devtools } from 'satie-runtime/devtools'`) lets a
 * developer edit the running scene in their own page: swap a voice for a
 * library recording or a file of their own, delete voices, tune levels, edit
 * the script. This plugin gives it a server side, development only:
 *
 *   POST /__satie/save      { path, text }         write a file under public/ (the script, samples.json)
 *   POST /__satie/upload    { path, base64 }       write an audio file under public/
 *   POST /__satie/event     { path, event }        append one JSON line (an edit the overlay saw) under public/
 *   POST /__satie/authoring { event }              v2/v3 edit events in private .satie/authoring/ (loopback + same-origin);
 *                                                  each is also folded into .satie/authoring/edits.jsonl (satie.edits/v1, EDITS.md)
 *   GET  /__satie/edits?scene=&since=              that log: the developer's level, mute, move, swap, remove decisions,
 *                                                  for the coding agent (satie_apply_edits) to fold into the script
 *   GET  /__satie/history?path=…  POST { history } the mixer's version tree (satie.history/v1), private beside the logs
 *   POST /__satie/capture { telemetry }            a playthrough capture segment (satie.playthrough/v2) from the mixer:
 *                                                  written to private .satie/captures/<iso-time>-<segment>.json, then kept
 *                                                  on the Satie account as satie_asset kind "capture" when signed in
 *                                                  (CAPTURE.md); GET answers { ok: true } so the page knows the plugin is on
 *   GET  /__satie/watch?path=…                     the scene script changed on disk by anything but the mixer (a coding
 *                                                  agent, an editor): server-sent events { hash, rebound, why? }, so the
 *                                                  open game hears the edit without a reload; the contract is rebound
 *   POST /__satie/hold { on }                      while the mixer has a task out with the coding agent, the game's
 *                                                  full reloads wait (event: reload on the watch stream) until Reload
 *   POST /__satie/now       { path, text }         the live context box: .satie/now.md, what the developer sees,
 *                                                  hears and just changed, for the project's coding agents
 *   GET  /__satie/landscape                        the library as a map, for the edit panel: every public, mapped
 *                                                  recording with its fixed position and hover snippet (your
 *                                                  sign-in; needs SATIE_SUPABASE_ANON_KEY; cached a day in .satie/)
 *   GET  /__satie/library?q=…&loop=1               search Satie's recording library through the MCP,
 *                                                  with the token from SATIE_TOKEN (the page never holds it)
 *   POST /__satie/find { start, feedback?, shown?, loop?, limit? }
 *                                                  one round of a find (satie_find): sounds to hear, steered by
 *                                                  Closer / Less close; free, nothing written
 *   POST /__satie/find/log { findId, listens?, use? } report a find's listens and final choice (satie_find_log)
 *   POST /__satie/vary { mode: plan|make, … }      Generate variations (satie_vary): plan is free and says the cost;
 *                                                  make buys exactly the planned takes, capped (default 10¢, at most 100¢)
 *   GET  /__satie/freesound?q=…                    CC0 Freesound search (through the MCP)
 *   POST /__satie/freesound/import { id, dir }     save a Freesound preview as the project's own file, returns its url
 *   GET  /__satie/freesound/preview?id=…           stream a Freesound preview (nothing written)
 *   POST /__satie/request { title, needs, … }      write a request for the coding agent to .satie/requests/
 *   GET  /__satie/requests                         the requests and their status (open / done, the agent's Done: line)
 *   GET  /__satie/agent                            is the developer's coding agent available here (Agent SDK in the project)
 *   POST /__satie/agent/run { message, request?, run?, session? }  start or continue its turn → { run }
 *   GET  /__satie/agent/events?run=&after=         its messages, tool lines and approval requests since `after`
 *   POST /__satie/agent/permit { run, id, allow }  answer an approval request; POST /__satie/agent/stop { run }
 *   POST /__satie/take { prompt, loop, durationS } one new generated take (about 1¢ on the Satie account), returns its url
 *   POST /__satie/chat { message, script, history?, observation?, scope?, lastOp? }
 *                                                  one turn of talking to Satie about the scene (answer, ask back, or edit)
 *   POST /__satie/realize { script, maxCents? }       buy the takes the script is missing (default cap 10¢); the
 *                                                  developer's own files realize reports as not yet kept are
 *                                                  uploaded through satie_asset kind "audio" (spec 011 C.2b)
 *   POST /__satie/provided { clips? }                keep the project's own sample files for training by hand:
 *                                                  every provided entry of samples.json, or the named clips
 *   POST /__satie/label { path, id, label }           name a place: the scene contract's object label
 *   POST /__satie/edit { instruction, sourceId?, script, maxCents? }
 *                                                  a natural-language edit: Satie recomposes the script with your
 *                                                  sentence (for one sound, or the whole scene), then buys only the
 *                                                  takes the new script needs (default cap 10¢); returns { script, samples }
 *
 *   // vite.config.ts
 *   import { satie } from 'satie-runtime/vite';
 *   export default defineConfig({ plugins: [satie()] });
 *
 *   GET  /__satie/auth/status                      { signedIn, email }
 *   GET  /__satie/auth/start                       begin "Sign in with Satie" (returns the browser URL)
 *   GET  /__satie/oauth/callback                   where the browser returns after sign-in
 *
 * Signing in: the plugin is an OAuth 2.1 public client of Satie's authorization server,
 * found through the MCP's protected-resource metadata and registered dynamically, the
 * same way an MCP client (Claude Code) signs in. The same account and the same access
 * gates apply. Tokens live in ~/.satie/dev-credentials.json (owner-only, outside the
 * project, never served), are refreshed automatically, and serve every project on the
 * machine. SATIE_TOKEN (or the `token` option) still overrides, for CI.
 * Env: SATIE_MCP_URL (default https://www.satie.world/mcp).
 */
import { writeFile, readFile, mkdir, appendFile, lstat, realpath, open, rename, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { editsFromEvent, parseEditLog, EDITS_PATH, EDITS_VERSION } from './edits.js';

/** satie_find's `limit` cap (packages/satie-mcp/find.ts findRequestSchema); the mixer-calls test holds the two together. */
export const FIND_LIMIT_MAX = 12;
/** SATIE's Supabase project and its publishable key: public by design (the website ships the same pair). */
const SATIE_SUPABASE_URL = 'https://nfcuwfkfctfpdrwkgvtm.supabase.co';
const SATIE_PUBLISHABLE_KEY = 'sb_publishable_a3-IZ8HKRWzO6MXNuACl4w_NQ8X0cyQ';
export { editsFromEvent, parseEditLog, EDITS_PATH, EDITS_VERSION } from './edits.js';

/** The terminal sign-in's access token (scripts/satie-login.mjs), refreshed when it is about to expire. */
async function sessionToken() {
  const file = join(homedir(), '.satie', 'session.json');
  let saved;
  try { saved = JSON.parse(await readFile(file, 'utf8')); } catch { return ''; }
  const s = saved?.session;
  if (!s?.access_token) return '';
  if ((s.expires_at ?? 0) * 1000 > Date.now() + 120_000) return s.access_token;
  if (!s.refresh_token || !saved.url || !saved.anon) return '';
  try {
    const r = await fetch(`${saved.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: saved.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r.ok) return '';
    const session = await r.json();
    if (!session?.access_token) return '';
    await writeFile(file, JSON.stringify({ ...saved, session }, null, 2), { mode: 0o600 });
    return session.access_token;
  } catch { return ''; }
}

// ── "Sign in with Satie": an OAuth 2.1 public client (PKCE), discovered from the MCP ──
const credentialsFile = () => join(homedir(), '.satie', 'dev-credentials.json');
async function readCredentials() {
  try { return JSON.parse(await readFile(credentialsFile(), 'utf8')); } catch { return {}; }
}
async function writeCredentials(all) {
  await mkdir(join(homedir(), '.satie'), { recursive: true, mode: 0o700 });
  await writeFile(credentialsFile(), JSON.stringify(all, null, 2), { mode: 0o600 });
}
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** The authorization server for an MCP resource (RFC 9728 → RFC 8414). */
async function discover(mcpUrl) {
  const u = new URL(mcpUrl);
  const prm = await fetch(`${u.origin}/.well-known/oauth-protected-resource`).then(r => { if (!r.ok) throw new Error(`protected-resource metadata: HTTP ${r.status}`); return r.json(); });
  const issuer = prm.authorization_servers?.[0];
  if (!issuer) throw new Error('the Satie MCP names no authorization server');
  const as = await fetch(`${issuer.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`).then(r => { if (!r.ok) throw new Error(`authorization-server metadata: HTTP ${r.status}`); return r.json(); });
  return { resource: prm.resource ?? mcpUrl, issuer, as };
}
export function createSatieAuth(mcpUrl) {
  const pending = new Map(); // state -> { verifier, redirectUri, clientId, tokenEndpoint, resource, at }
  const keyFor = () => new URL(mcpUrl).origin;
  async function clientFor(redirectUri, meta) {
    const all = await readCredentials();
    const entry = all[keyFor()] ?? {};
    const clients = entry.clients ?? {};
    if (clients[redirectUri]) return clients[redirectUri];
    if (!meta.as.registration_endpoint) throw new Error('Satie sign-in does not allow client registration');
    const reg = await fetch(meta.as.registration_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Satie mixer (satie-runtime dev server)', redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
    }).then(async r => { if (!r.ok) throw new Error(`client registration: HTTP ${r.status} ${await r.text()}`); return r.json(); });
    clients[redirectUri] = reg.client_id;
    all[keyFor()] = { ...entry, clients };
    await writeCredentials(all);
    return reg.client_id;
  }
  return {
    async start(redirectUri) {
      const meta = await discover(mcpUrl);
      const clientId = await clientFor(redirectUri, meta);
      const verifier = b64url(randomBytes(32));
      const challenge = b64url(createHash('sha256').update(verifier).digest());
      const state = b64url(randomBytes(16));
      pending.set(state, { verifier, redirectUri, clientId, tokenEndpoint: meta.as.token_endpoint, resource: meta.resource, at: Date.now() });
      for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60_000) pending.delete(k);
      const url = new URL(meta.as.authorization_endpoint);
      for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge,
        code_challenge_method: 'S256', state, resource: meta.resource, scope: (meta.as.scopes_supported ?? []).includes('email') ? 'email' : '' })) if (v) url.searchParams.set(k, v);
      return url.toString();
    },
    async finish(state, code) {
      const p = pending.get(state);
      if (!p) throw new Error('This sign-in link expired or was already used; start again from the mixer.');
      pending.delete(state);
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: p.verifier, resource: p.resource });
      const t = await fetch(p.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then(async r => { if (!r.ok) throw new Error(`token exchange: HTTP ${r.status} ${await r.text()}`); return r.json(); });
      const all = await readCredentials();
      all[keyFor()] = { ...(all[keyFor()] ?? {}), tokens: { ...t, client_id: p.clientId, token_endpoint: p.tokenEndpoint, resource: p.resource, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 } };
      await writeCredentials(all);
    },
    /** A valid access token, refreshed when it is about to expire; '' when not signed in. */
    async token() {
      const all = await readCredentials();
      const entry = all[keyFor()], t = entry?.tokens;
      if (!t?.access_token) return '';
      if (t.expires_at > Date.now() + 120_000) return t.access_token;
      if (!t.refresh_token) return '';
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id, resource: t.resource });
      const r = await fetch(t.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!r.ok) return '';
      const n = await r.json();
      all[keyFor()] = { ...entry, tokens: { ...t, ...n, refresh_token: n.refresh_token ?? t.refresh_token, expires_at: Date.now() + (n.expires_in ?? 3600) * 1000 } };
      await writeCredentials(all);
      return n.access_token;
    },
    async who() {
      const tok = await this.token();
      if (!tok) return null;
      try { const claims = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')); return { email: claims.email ?? null }; } catch { return { email: null }; }
    },
    async signOut() { const all = await readCredentials(); if (all[keyFor()]) { delete all[keyFor()].tokens; await writeCredentials(all); } },
  };
}

/** The private per-script directory under .satie/authoring (created owner-only, never a symlink). */
async function authoringDirectory(projectRoot, scriptPath) {
  const root = await realpath(projectRoot);
  const bucket = createHash('sha256').update(scriptPath).digest('hex').slice(0, 24);
  let directory = root;
  for (const part of ['.satie', 'authoring', bucket]) {
    directory = resolve(directory, part);
    await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Private authoring directories must not be symlinks');
  }
  return { root, directory };
}

async function regularOrMissing(target) {
  const existing = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) throw new Error('Private authoring files must be regular files, not symlinks');
  return existing;
}

/** Fixed private target: the browser never chooses a filesystem path. */
export async function persistEditEvent(projectRoot, event, { publicDir = 'public' } = {}) {
  if (!event || (event.version !== 'satie.edits/v2' && event.version !== 'satie.edits/v3') || !/^[a-zA-Z0-9-]{1,80}$/.test(event.sessionId)
    || !Number.isSafeInteger(event.seq) || event.seq < 0 || typeof event.scriptPath !== 'string'
    || typeof event.kind !== 'string' || typeof event.t !== 'string') throw new Error('Invalid satie.edits event');
  const line = JSON.stringify(event) + '\n';
  if (Buffer.byteLength(line) > 1_000_000) throw new Error('Edit event exceeds 1 MB');
  const { root, directory } = await authoringDirectory(projectRoot, event.scriptPath);
  const target = resolve(directory, `${event.sessionId}.jsonl`);
  await regularOrMissing(target);
  const file = await open(target, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    if ((await file.stat()).size + Buffer.byteLength(line) > 6_000_000) throw new Error('Local edit log limit reached; start a new session');
    await file.writeFile(line, 'utf8');
  } finally { await file.close(); }
  // The same event as the decisions it carries, in the flat satie.edits/v1 log (EDITS.md). The v3
  // session file above stays the complete capture; this is the part an agent folds into the script.
  const edits = await editsFromEvent(event, { publicDir });
  if (edits.length) await appendEdits(root, edits);
  return relative(root, target);
}

/** Append satie.edits/v1 lines to the project's private log (owner-only, never a symlink, capped at 16 MB). */
export async function appendEdits(projectRoot, edits) {
  const root = await realpath(projectRoot);
  let directory = root;
  for (const part of ['.satie', 'authoring']) {
    directory = resolve(directory, part);
    await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Private authoring directories must not be symlinks');
  }
  const target = resolve(root, EDITS_PATH);
  await regularOrMissing(target);
  const text = edits.map(e => JSON.stringify(e)).join('\n') + '\n';
  const file = await open(target, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    if ((await file.stat()).size + Buffer.byteLength(text) > 16_000_000) throw new Error('Edit log limit reached (16 MB); archive .satie/authoring/edits.jsonl');
    await file.writeFile(text, 'utf8');
  } finally { await file.close(); }
  return EDITS_PATH;
}

/** Where captures land: a private `.satie/captures/` (owner-only, never a symlink), like the authoring logs. */
async function capturesDirectory(projectRoot) {
  const root = await realpath(projectRoot);
  let directory = root;
  for (const part of ['.satie', 'captures']) {
    directory = resolve(directory, part);
    await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Private capture directories must not be symlinks');
  }
  return { root, directory };
}

/** The most a capture segment may weigh here and on the Satie account (satie_asset kind "capture"). */
export const CAPTURE_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Write one capture segment (satie.playthrough/v2, what `endCapture` or `onSegment` gives) to
 * `.satie/captures/<iso-time>-<segment>.json`. The shape is checked here only as far as naming the
 * file needs; the MCP validates the whole capture when it is kept. Returns the path relative to the project.
 */
export async function persistCapture(projectRoot, telemetry) {
  if (!telemetry || typeof telemetry !== 'object' || typeof telemetry.version !== 'string' || !telemetry.version.startsWith('satie.playthrough/')
    || !Array.isArray(telemetry.frames) || typeof telemetry.durationS !== 'number') throw new Error('Invalid satie.playthrough capture');
  const text = JSON.stringify(telemetry);
  if (Buffer.byteLength(text) > CAPTURE_MAX_BYTES) throw new Error(`Capture exceeds ${Math.round(CAPTURE_MAX_BYTES / 1048576)} MB`);
  const segment = Number.isInteger(telemetry.provenance?.segment) && telemetry.provenance.segment >= 0 ? telemetry.provenance.segment : 0;
  const { root, directory } = await capturesDirectory(projectRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let target = resolve(directory, `${stamp}-${segment}.json`);
  for (let k = 1; await lstat(target).then(() => true, () => false); k++) target = resolve(directory, `${stamp}-${segment}-${k}.json`);
  const file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(text, 'utf8'); } finally { await file.close(); }
  return { path: relative(root, target), text, segment };
}

/** The satie.edits/v1 log, parsed; empty when there is none yet. `scene` and `since` filter it. */
export async function readEdits(projectRoot, { scene, since } = {}) {
  const target = resolve(await realpath(projectRoot), EDITS_PATH);
  if (!await regularOrMissing(target)) return [];
  return parseEditLog(await readFile(target, 'utf8'), { scene, since });
}

/** The mixer's version tree for one script (satie.history/v1), beside its edit logs. Null when there is none yet. */
export async function readHistory(projectRoot, scriptPath) {
  if (typeof scriptPath !== 'string' || !scriptPath) throw new Error('expected a script path');
  const { directory } = await authoringDirectory(projectRoot, scriptPath);
  const target = resolve(directory, 'history.json');
  if (!await regularOrMissing(target)) return null;
  const history = JSON.parse(await readFile(target, 'utf8'));
  return history?.version === 'satie.history/v1' && history.scriptPath === scriptPath ? history : null;
}

export async function writeHistory(projectRoot, history) {
  if (!history || history.version !== 'satie.history/v1' || typeof history.scriptPath !== 'string' || !Array.isArray(history.nodes)
    || typeof history.scripts !== 'object' || history.nodes.length > 1000) throw new Error('Invalid satie.history/v1 file');
  const text = JSON.stringify(history);
  if (Buffer.byteLength(text) > 8_000_000) throw new Error('History exceeds 8 MB');
  const { root, directory } = await authoringDirectory(projectRoot, history.scriptPath);
  const target = resolve(directory, 'history.json');
  await regularOrMissing(target);
  // Whole-file replace through a sibling, so a crash never leaves half a tree.
  const temp = resolve(directory, `history.${randomUUID()}.tmp`);
  const file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(text, 'utf8'); } finally { await file.close(); }
  await rename(temp, target);
  return relative(root, target);
}

/** The requests the mixer wrote for the coding agent (.satie/requests/*.md) and where each stands, newest last. */
export async function listRequests(projectRoot) {
  const dir = resolve(projectRoot, '.satie', 'requests');
  let names = [];
  try { names = (await readdir(dir)).filter(n => n.endsWith('.md')).sort().slice(-50); } catch { /* none yet */ }
  const requests = [];
  for (const n of names) {
    const text = await readFile(join(dir, n), 'utf8').catch(() => '');
    const status = /^\s*Status:\s*(\w+)/mi.exec(text)?.[1]?.toLowerCase() ?? 'open';
    const done = /^\s*Done:\s*(.+)$/mi.exec(text)?.[1]?.trim().slice(0, 400) ?? null;
    const files = /^\s*Files:\s*(.+)$/mi.exec(text)?.[1]?.split(',').map(f => f.trim()).filter(Boolean).slice(0, 20) ?? [];
    const missing = [...text.matchAll(/^- (object|event|signal|state) `([a-z][a-z0-9_]*)`/gm)].map(m => ({ kind: m[1], id: m[2] }));
    requests.push({ path: `.satie/requests/${n}`, title: /^#\s*Satie (?:request|task):\s*(.+)$/m.exec(text)?.[1]?.trim() ?? n, status, done, files, missing });
  }
  return requests;
}

/**
 * The live context box (`satie.now/v1`): the mixer's text of what the developer sees, hears and just
 * changed, written to the fixed file `.satie/now.md` for the project's coding agents (any agent, with or
 * without the Satie MCP). The plugin adds what only the disk knows: the open requests and where the
 * mixer's version history lives. Replaced whole through a temporary file, so a reader never sees half.
 */
export async function writeNowContext(projectRoot, scriptPath, text) {
  if (typeof scriptPath !== 'string' || !scriptPath || scriptPath.length > 512 || typeof text !== 'string' || !text.trim()) throw new Error('expected { path, text }');
  if (Buffer.byteLength(text) > 200_000) throw new Error('context exceeds 200 KB');
  const { root, directory: history } = await authoringDirectory(projectRoot, scriptPath);
  const dir = resolve(root, '.satie');
  const requests = (await listRequests(root)).filter(r => r.status !== 'done');
  const historyFile = resolve(history, 'history.json');
  const tail = [
    '## Open requests for the coding agent', '',
    ...(requests.length ? requests.map(r => `- \`${r.path}\`: ${r.title} (${r.status})`) : ['None.']), '',
    ...(await regularOrMissing(historyFile) ? [`Every version the mixer kept, with its full script, is in \`${relative(root, historyFile)}\` (satie.history/v1, versions by id).`, ''] : []),
  ].join('\n');
  const target = resolve(dir, 'now.md');
  await regularOrMissing(target);
  const temp = resolve(dir, `now.${randomUUID()}.tmp`);
  const file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(`${text.replace(/\s+$/, '')}\n\n${tail}`, 'utf8'); } finally { await file.close(); }
  await rename(temp, target);
  return relative(root, target);
}

/** Save a local edit with its existing scene contract, so reload verifies the edited bytes.
 * This updates identity only; prior gameplay/listening verdicts never approve the new revision.
 */
/**
 * A saved samples.json keeps every sound in the project: an entry that is only a URL (a take or a
 * library recording the mixer added) is downloaded into samples/<sha256>.audio, the entry points at
 * the local file, and assets.lock.json records it (the same layout the vendor script writes), so
 * the scene plays with no network and no Satie account. A download that fails keeps its URL and is
 * reported; nothing already local is touched.
 */
export async function vendorSamplesText(target, text) {
  const samples = JSON.parse(text);
  const dir = dirname(target), samplesDir = resolve(dir, 'samples');
  const lockPath = resolve(dir, 'assets.lock.json');
  let lock = null;
  try { lock = JSON.parse(await readFile(lockPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const vendored = [], failed = [];
  for (const [clipPath, entry] of Object.entries(samples)) {
    if (!entry || typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) continue;
    try {
      const response = await fetch(entry.url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 64 * 1024 * 1024) throw new Error('over 64 MiB');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (entry.sha256 && entry.sha256 !== sha256) throw new Error('checksum changed');
      await mkdir(samplesDir, { recursive: true });
      const filename = `${sha256}.audio`;
      await writeFile(resolve(samplesDir, filename), bytes);
      if (lock && Array.isArray(lock.assets)) {
        const asset = { clipPath, url: entry.url, source: entry.source ?? 'generated', ...(entry.sampleId ? { sampleId: entry.sampleId } : {}), ...(entry.license ? { license: entry.license } : {}), ...(entry.attribution ? { attribution: entry.attribution } : {}), sha256, localFile: filename };
        const k = lock.assets.findIndex(a => a.clipPath === clipPath);
        if (k >= 0) lock.assets[k] = asset; else lock.assets.push(asset);
      }
      samples[clipPath] = { ...entry, url: `./samples/${filename}`, sha256 };
      vendored.push(clipPath);
    } catch (error) { failed.push({ clipPath, error: error instanceof Error ? error.message : String(error) }); }
  }
  if (lock && vendored.length) await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return { text: JSON.stringify(samples, null, 1), samples, vendored, failed };
}

/**
 * Outside edits to a scene, heard live (Part B, 2026-11-11). The mixer listens on /__satie/watch; when
 * the script on disk changes and it is not the mixer's own last save, every listener is told, after
 * the contract is rebound (as `npx satie-runtime rebind` would) so the next reload loads it too. A
 * rebind that fails (new prompts without takes, a parse warning) is reported, not fatal: the mixer
 * still plays what loads. `read` and `rebind` are injectable for tests.
 */
export function createSceneWatch({ read = path => readFile(path, 'utf8'), rebind = rebindScene } = {}) {
  const scenes = new Map(); // script path → { listeners, last }
  const sceneOf = target => { let s = scenes.get(target); if (!s) scenes.set(target, s = { listeners: new Set(), last: null }); return s; };
  const digest = text => createHash('sha256').update(text).digest('hex');
  return {
    /** The mixer saved this text: its echo from the file watcher is not an outside edit. */
    wrote(target, text) { sceneOf(target).last = digest(text); },
    /** Listen for outside edits to one script; returns the way to stop. */
    listen(target, send) { const s = sceneOf(target); s.listeners.add(send); return () => s.listeners.delete(send); },
    /** The file watcher saw `target` change: tell its listeners, once per new text. */
    async changed(target) {
      const s = scenes.get(target);
      if (!s?.listeners.size) return null;
      let text;
      try { text = await read(target); } catch { return null; }
      const hash = digest(text);
      if (hash === s.last) return null; // the mixer's own save, or an editor writing the same bytes twice
      s.last = hash;
      let rebound = null, why;
      try { rebound = await rebind(target); } catch (error) { rebound = false; why = error instanceof Error ? error.message : String(error); }
      const event = { hash, rebound, ...(why ? { why } : {}) };
      for (const send of s.listeners) send(event);
      return event;
    },
  };
}

/** Rebind the contract beside a scene.satie; null when there is no contract to keep in step. */
async function rebindScene(target) {
  if (!target.endsWith('scene.satie')) return null;
  try { await lstat(target.replace(/\.satie$/, '.contract.json')); } catch { return null; }
  const { rebindDirectory } = await import('./rebind.js');
  await rebindDirectory(dirname(target));
  return true;
}

export async function saveEditedScene(target, text) {
  let contractPath, contract;
  if (target.endsWith('.satie')) {
    contractPath = target.replace(/\.satie$/, '.contract.json');
    try { contract = JSON.parse(await readFile(contractPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (contract && contract.version !== 'satie.scene/v1') throw new Error('Unsupported scene contract');
  }
  await mkdir(dirname(target), { recursive: true });
  if (contract) {
    const { revision: previousRevision, scriptHash: previousHash, ...definition } = contract;
    const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
    const hash = value => createHash('sha256').update(value).digest('hex');
    contract.scriptHash = hash(text); contract.revision = hash(canonical({ contract: definition, script: text }));
    await writeFile(contractPath, JSON.stringify(contract, null, 2) + '\n');
    // The lock's source bytes are unchanged. Its scene identity must follow the saved script.
    const lockPath = resolve(dirname(target), 'assets.lock.json');
    try {
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      if (lock.sceneRevision === previousRevision && lock.scriptHash === previousHash) {
        lock.sceneRevision = contract.revision; lock.scriptHash = contract.scriptHash;
        await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(target, text, 'utf8');
}

export function satie(options = {}) {
  const publicDir = options.publicDir ?? 'public';
  const mcpUrl = options.mcpUrl ?? process.env.SATIE_MCP_URL ?? 'https://www.satie.world/mcp';
  const configured = () => (typeof options.token === 'function' ? options.token() : options.token) ?? process.env.SATIE_TOKEN ?? '';
  const auth = createSatieAuth(mcpUrl);

  const readJson = (req, limit = 64 * 1024 * 1024) => new Promise((ok, fail) => {
    let body = '';
    let bytes = 0, exceeded = false;
    req.on('data', (c) => { if (exceeded) return; bytes += Buffer.byteLength(c); if (bytes > limit) { exceeded = true; body = ''; fail(new Error('too large')); return; } body += c; });
    req.on('error', fail);
    req.on('end', () => { if (exceeded) return; try { ok(JSON.parse(body)); } catch (e) { fail(e); } });
  });
  const json = (res, status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

  return {
    name: 'satie-devtools',
    apply: 'serve',
    configureServer(server) {
      // Vite can otherwise serve files outside public/ during development.
      server.config.server.fs.deny.push(`${server.config.root}/**/.satie/**`);
      server.middlewares.use((req, res, next) => {
        let path;
        try { path = decodeURIComponent((req.url ?? '').split('?')[0]).replaceAll('\\', '/'); }
        catch { return json(res, 400, { ok: false }); }
        if (/(^|\/)\.satie(\/|$)/.test(path)) return json(res, 403, { ok: false, error: 'Private authoring files are not served' });
        // These endpoints hold the developer's token or write project files.
        // A cross-site text/plain POST can reach them without a CORS preflight.
        if (path.startsWith('/__satie/') && path !== '/__satie/oauth/callback') {
          const address = req.socket?.remoteAddress;
          if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return json(res, 403, { ok: false, error: 'Local devtools only' });
          try {
            if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return json(res, 403, { ok: false, error: 'Same-origin devtools only' });
          } catch { return json(res, 403, { ok: false, error: 'Invalid devtools origin' }); }
        }
        next();
      });
      server.middlewares.use('/__satie/authoring', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        const address = req.socket?.remoteAddress;
        if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return json(res, 403, { ok: false, error: 'Local authoring only' });
        try {
          if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return json(res, 403, { ok: false, error: 'Same-origin authoring only' });
          const { event } = await readJson(req, 1_000_000);
          const wrote = await persistEditEvent(server.config.root, event, { publicDir });
          json(res, 200, { ok: true, wrote, contributed: false });
        } catch (error) { json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
      });
      // The developer's decisions (satie.edits/v1, EDITS.md): GET ?scene=public/satie/scene.satie&since=<ISO>.
      // Loopback and same-origin like every /__satie route; a coding agent on this machine fetches it.
      server.middlewares.use('/__satie/edits', async (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false });
        try {
          const u = new URL(req.url ?? '/', 'http://x');
          const edits = await readEdits(server.config.root, { scene: u.searchParams.get('scene') ?? undefined, since: u.searchParams.get('since') ?? undefined });
          json(res, 200, { ok: true, v: EDITS_VERSION, path: EDITS_PATH, edits });
        } catch (error) { json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
      });
      // The mixer's history, private like the edit logs: GET ?path=<script url>, POST { history }.
      server.middlewares.use('/__satie/history', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const path = new URL(req.url ?? '/', 'http://x').searchParams.get('path') ?? '';
            return json(res, 200, { ok: true, history: await readHistory(server.config.root, path) });
          }
          if (req.method !== 'POST') return json(res, 405, { ok: false });
          const { history } = await readJson(req, 8_000_000);
          json(res, 200, { ok: true, wrote: await writeHistory(server.config.root, history) });
        } catch (error) { json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
      });
      // The live context box for the project's coding agents: POST { path, text } → .satie/now.md (fixed target).
      server.middlewares.use('/__satie/now', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { path, text } = await readJson(req, 300_000);
          json(res, 200, { ok: true, wrote: await writeNowContext(server.config.root, path, text) });
        } catch (error) { json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
      });
      const root = () => resolve(server.config.root, publicDir);
      const safeTarget = (path) => {
        const target = resolve(root(), String(path).replace(/^\/+/, ''));
        const rel = relative(root(), target);
        if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('path must stay under ' + publicDir);
        return target;
      };

      // Outside edits heard live: GET ?path=<script url> is an event stream (createSceneWatch)
      const sceneWatch = createSceneWatch();
      // While the mixer has a task out with the coding agent, the game's full reloads wait: an agent's
      // code edits would otherwise reload the page under the developer mid-listen. The mixer is told
      // (event: reload) and reloads when they press Reload; it is always released when no mixer listens.
      const reloadHold = { on: false, held: null, streams: new Set() };
      const hotChannels = [server.environments?.client?.hot, server.ws].filter((c, i, all) => c && typeof c.send === 'function' && all.indexOf(c) === i);
      for (const channel of hotChannels) {
        const send = channel.send.bind(channel);
        channel.send = (payload, ...rest) => {
          if (reloadHold.on && reloadHold.streams.size && payload && typeof payload === 'object' && payload.type === 'full-reload') {
            reloadHold.held = payload;
            for (const write of reloadHold.streams) write(`event: reload\ndata: ${JSON.stringify({ file: payload.triggeredBy ? relative(server.config.root, payload.triggeredBy) : null })}\n\n`);
            return;
          }
          return send(payload, ...rest);
        };
      }
      server.middlewares.use('/__satie/hold', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { on } = await readJson(req, 1000);
          reloadHold.on = on === true;
          if (!reloadHold.on) reloadHold.held = null; // the page reloads itself next
          json(res, 200, { ok: true, on: reloadHold.on });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });
      server.watcher?.on('change', file => { void sceneWatch.changed(resolve(file)); });
      server.middlewares.use('/__satie/watch', (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false });
        let target;
        try { target = safeTarget(new URL(req.url ?? '/', 'http://x').searchParams.get('path') ?? ''); if (!target.endsWith('.satie')) throw new Error('expected a .satie script'); }
        catch (error) { return json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
        server.watcher?.add(target);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': satie watch\n\n');
        const stop = sceneWatch.listen(target, event => res.write(`event: script\ndata: ${JSON.stringify(event)}\n\n`));
        const write = text => res.write(text);
        reloadHold.streams.add(write);
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => { stop(); clearInterval(ping); reloadHold.streams.delete(write); if (!reloadHold.streams.size) { reloadHold.on = false; reloadHold.held = null; } });
      });

      server.middlewares.use('/__satie/save', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { path, text } = await readJson(req);
          if (typeof path !== 'string' || typeof text !== 'string') throw new Error('expected { path, text }');
          const target = safeTarget(path);
          // samples.json: every sound is copied into the project before it is written (vendorSamplesText)
          if (target.endsWith('samples.json')) {
            const out = await vendorSamplesText(target, text);
            await writeFile(target, out.text, 'utf8');
            return json(res, 200, { ok: true, wrote: relative(server.config.root, target), samples: out.samples, vendored: out.vendored, failed: out.failed });
          }
          sceneWatch.wrote(target, text);
          await saveEditedScene(target, text);
          json(res, 200, { ok: true, wrote: relative(server.config.root, target) });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      // A place renamed in the mixer: its name is the scene contract's object label.
      server.middlewares.use('/__satie/label', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { path, id, label } = await readJson(req);
          if (typeof path !== 'string' || typeof id !== 'string' || (label !== undefined && typeof label !== 'string')) throw new Error('expected { path, id, label }');
          const contractPath = safeTarget(path).replace(/\.satie$/, '.contract.json');
          const contract = JSON.parse(await readFile(contractPath, 'utf8'));
          const o = (contract.scene?.objects ?? []).find(x => x.id === id);
          if (!o) throw new Error(`the contract has no object ${id}`);
          if (label && label.trim()) o.label = label.trim().slice(0, 120); else delete o.label;
          await writeFile(contractPath, JSON.stringify(contract, null, 2) + '\n');
          json(res, 200, { ok: true });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      server.middlewares.use('/__satie/upload', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { path, base64 } = await readJson(req);
          if (typeof path !== 'string' || typeof base64 !== 'string') throw new Error('expected { path, base64 }');
          if (!/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(path)) throw new Error('audio files only');
          const target = safeTarget(path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, Buffer.from(base64, 'base64'));
          json(res, 200, { ok: true, url: '/' + relative(root(), target).split('\\').join('/') });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      server.middlewares.use('/__satie/event', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { path, event } = await readJson(req);
          if (typeof path !== 'string' || !event || typeof event !== 'object') throw new Error('expected { path, event }');
          if (!path.endsWith('.jsonl')) throw new Error('event logs are .jsonl');
          const target = safeTarget(path);
          await mkdir(dirname(target), { recursive: true });
          await appendFile(target, JSON.stringify(event) + '\n', 'utf8');
          json(res, 200, { ok: true });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      // The mixer is the one client of satie_chat, which the server serves on the mixer
      // profile (`?profile=mixer`) and leaves out of the coding agents' default list.
      const mixerUrl = (() => { const u = new URL(mcpUrl); u.searchParams.set('profile', 'mixer'); return u.toString(); })();
      const callTool = async (name, args) => {
        const bearer = configured() || await auth.token() || await sessionToken();
        if (!bearer) { const e = new Error('Sign in with Satie to use this (the mixer has a button).'); e.code = 'signin_required'; throw e; }
        const rpc = await fetch(mixerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${bearer}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        });
        const raw = await rpc.text();
        // A streamed (SSE) reply carries progress/log notifications first and the response last:
        // take the message that answers this request (id 1), never the first data line.
        const messages = raw.split('\n').filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean);
        const parsed = messages.length ? (messages.find(m => m.id === 1 && ('result' in m || 'error' in m)) ?? messages[messages.length - 1]) : JSON.parse(raw);
        if (parsed.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
        if (parsed.result?.isError) throw new Error(parsed.result.content?.[0]?.text ?? 'tool error');
        return parsed.result?.structuredContent ?? {};
      };

      // The bytes of a Freesound preview. Since the MCP release (2026-11-04) the server keeps the
      // preview in the developer's private files and returns a one-hour `url` instead of base64, so no
      // audio rides through a tool result; follow it here. Older servers still answer with base64.
      const freesoundBytes = async id => {
        const r = await callTool('satie_freesound_audio', { id });
        let bytes;
        if (typeof r.url === 'string' && r.url) {
          const file = await fetch(r.url);
          if (!file.ok) throw new Error(`preview download failed (${file.status})`);
          bytes = Buffer.from(await file.arrayBuffer());
        } else {
          bytes = Buffer.from(String(r.base64 ?? ''), 'base64');
        }
        if (!bytes.length) throw new Error('the preview came back empty');
        return { bytes, name: r.name };
      };

      // A Freesound preview streamed to the mixer, nothing written: heard before it is saved into the project.
      server.middlewares.use('/__satie/freesound/preview', async (req, res) => {
        try {
          const id = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('id'));
          if (!Number.isInteger(id) || id <= 0) return json(res, 400, { ok: false, error: 'id required' });
          const { bytes } = await freesoundBytes(id);
          res.statusCode = 200; res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'private, max-age=600');
          res.end(bytes);
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // A request for the developer's coding agent, written by the mixer when a chosen way needs the game
      // to expose something first (Satie edits only the sound layer): .satie/requests/<stamp>-<slug>.md.
      server.middlewares.use('/__satie/request', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const r = await readJson(req, 64_000);
          const str = (v, n) => String(v ?? '').replace(/\r/g, '').slice(0, n);
          const title = str(r.title, 160).trim();
          if (!title || !str(r.needs, 2000).trim()) throw new Error('expected { title, needs }');
          const ids = (Array.isArray(r.about) ? r.about : []).map(x => str(x, 128)).slice(0, 32);
          const names = (Array.isArray(r.aboutNames) ? r.aboutNames : []).map(x => str(x, 160)).slice(0, 32);
          // a task names what the game lacks by the exact ids Satie will bind to (code-checked missing by the director)
          const missing = (Array.isArray(r.missing) ? r.missing : []).filter(m => m && /^(object|event|signal|state)$/.test(m.kind) && /^[a-z][a-z0-9_]{0,63}$/.test(m.id)).slice(0, 6)
            .map(m => ({ kind: m.kind, id: m.id, what: str(m.what, 240) }));
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'request';
          // in the project's own .satie/ (beside the authoring logs), where its coding agent works; never under public/
          const rel = `.satie/requests/${stamp}-${slug}.md`;
          const target = resolve(server.config.root, rel);
          const body = [
            `# ${missing.length ? 'Satie task' : 'Satie request'}: ${title}`,
            '',
            'Status: open',
            '',
            `Asked in the Satie mixer on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${r.message ? `: "${str(r.message, 600)}"` : ''}.`,
            '',
            '## What the game needs to expose',
            '',
            str(r.needs, 2000),
            '',
            ...(missing.length ? ['## Add these, by these exact names', '', 'Satie listens for these ids; declare each in the scene contract under this name.', '', ...missing.map(m => `- ${m.kind} \`${m.id}\`: ${m.what}`), ''] : []),
            '## Why',
            '',
            str(r.why, 2000) || '(see above)',
            '',
            ...(ids.length ? ['## Sounds it concerns', '', ...ids.map((id, k) => `- ${names[k] ?? id} (\`${id}\`)`), ''] : []),
            '## What Satie does once it exists',
            '',
            str(r.instruction, 2000),
            '',
            'For the coding agent: when you start, change the line above to `Status: taken`. Make the game change, bind and declare any new objects, events, signals or states in the scene contract under the names above (satie_inspect_scene / satie_integrate). Then change it to `Status: done` and add two lines: `Done:` with one plain sentence saying what you did, and `Files:` with the files you changed, comma-separated. Ask the developer directly if anything is unclear. The mixer shows each step, holds the game\'s reload until the developer presses Reload, and puts the sound in.',
            '',
          ].join('\n');
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, body, { mode: 0o600 });
          json(res, 200, { ok: true, path: rel, task: missing.length > 0 });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      // The requests the mixer wrote and where each stands (`Status: open | done`, and the agent's `Done:` line).
      server.middlewares.use('/__satie/requests', async (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false });
        try {
          json(res, 200, { ok: true, requests: await listRequests(server.config.root) });
        } catch (e) { json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      // ── The developer's coding agent, in the mixer's conversation (dev only, opt-in) ──
      // When a change the developer asks for needs the game itself to change, the mixer can run their
      // coding agent (Claude Code, through @anthropic-ai/claude-agent-sdk when the project has it) here,
      // in this project. Its words, questions and approval requests go to the mixer's thread under its
      // own name and the developer answers it there: Satie relays nothing. Every edit and command waits
      // for the developer's allow; reading the project does not. It never edits the Satie sound script.
      const agentRuns = new Map();
      let agentSdk;
      const loadAgentSdk = async () => {
        if (agentSdk !== undefined) return agentSdk;
        try {
          const req = createRequire(resolve(server.config.root, 'package.json'));
          agentSdk = await import(pathToFileURL(req.resolve('@anthropic-ai/claude-agent-sdk')).href);
        } catch { agentSdk = null; }
        return agentSdk;
      };
      const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'TodoRead', 'WebSearch', 'WebFetch', 'NotebookRead', 'ToolSearch']);
      const AGENT_ROLE = [
        'You are the developer\'s coding agent, called from the Satie sound mixer inside their running game.',
        'They asked for a change that needs the game itself to change (how things look, move or behave; new objects, events or signals).',
        'Satie, the sound layer, handles all sound in a separate step: never edit the Satie sound script (*.satie) or its sample files.',
        'If you add objects that sounds should come from, bind them in the Satie glue and declare them in the scene contract.',
        'They read your messages in a small chat panel while playing: keep each message short and plain, no code dumps.',
        'Ask only what you truly need, one question at a time, and wait for the answer.',
        'When you finish: if a request file was given, change its `Status: open` line to `Status: done` and add a `Done:` line in plain words; end with one plain sentence saying what changed.',
      ].join('\n');
      const describeTool = (name, input) => {
        const f = input?.file_path ?? input?.path ?? input?.notebook_path;
        if (f) return `${name === 'Read' ? 'reading' : name === 'Write' ? 'writing' : name === 'Edit' || name === 'MultiEdit' ? 'editing' : name.toLowerCase()} ${relative(server.config.root, String(f))}`;
        if (name === 'Bash') return `running: ${String(input?.command ?? '').slice(0, 160)}`;
        if (name === 'Grep' || name === 'Glob') return `searching for ${String(input?.pattern ?? '').slice(0, 80)}`;
        return name;
      };
      const editPreview = (name, input) => {
        if (name === 'Edit') return { before: String(input?.old_string ?? '').slice(0, 1200), after: String(input?.new_string ?? '').slice(0, 1200) };
        if (name === 'Write') return { before: '', after: String(input?.content ?? '').slice(0, 1200) };
        if (name === 'Bash') return { command: String(input?.command ?? '').slice(0, 600) };
        return undefined;
      };
      function startAgentTurn(run, prompt) {
        run.status = 'running';
        const abort = new AbortController(); run.abort = abort;
        const q = agentSdk.query({ prompt, options: {
          cwd: server.config.root,
          abortController: abort,
          ...(run.sessionId ? { resume: run.sessionId } : {}),
          systemPrompt: { type: 'preset', preset: 'claude_code', append: AGENT_ROLE },
          canUseTool: async (toolName, input, { signal }) => {
            if (READ_ONLY_TOOLS.has(toolName)) return { behavior: 'allow', updatedInput: input };
            const target = String(input?.file_path ?? input?.path ?? '');
            if (/\.satie$/i.test(target)) return { behavior: 'deny', message: 'The Satie sound script belongs to Satie; leave it to the mixer.' };
            // everything that changes the project waits for the developer, in the mixer
            const id = randomUUID().slice(0, 8);
            run.events.push({ kind: 'permit', id, tool: toolName, what: describeTool(toolName, input), preview: editPreview(toolName, input) });
            const allowed = await new Promise(done => {
              run.pending.set(id, done);
              signal.addEventListener('abort', () => done(false), { once: true });
            });
            run.pending.delete(id);
            run.events.push({ kind: 'permitted', id, allow: allowed });
            return allowed ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'The developer said no to this step. Ask what they would like instead, or stop.' };
          },
        } });
        (async () => {
          try {
            for await (const msg of q) {
              if (msg.session_id) run.sessionId = msg.session_id;
              if (msg.type === 'assistant' && !msg.parent_tool_use_id) {
                for (const b of msg.message?.content ?? []) {
                  if (b.type === 'text' && b.text?.trim()) run.events.push({ kind: 'say', text: b.text.trim() });
                  else if (b.type === 'tool_use' && READ_ONLY_TOOLS.has(b.name)) run.events.push({ kind: 'tool', what: describeTool(b.name, b.input) });
                }
              } else if (msg.type === 'result') {
                run.events.push({ kind: 'end', ok: msg.subtype === 'success' && !msg.is_error, text: msg.subtype === 'success' ? String(msg.result ?? '') : msg.subtype });
              }
            }
          } catch (e) { run.events.push({ kind: 'end', ok: false, text: e instanceof Error ? e.message : String(e) }); }
          run.status = 'idle'; run.abort = null;
        })();
      }
      server.middlewares.use('/__satie/agent', async (req, res) => {
        const sub = (req.url ?? '/').split('?')[0];
        try {
          if (req.method === 'GET' && (sub === '/' || sub === '')) {
            const sdk = await loadAgentSdk();
            return json(res, 200, { ok: true, available: !!sdk, ...(sdk ? {} : { reason: 'no coding agent connected: add @anthropic-ai/claude-agent-sdk to this project (and sign in to Claude Code) to answer game changes here' }) });
          }
          if (req.method === 'GET' && sub === '/events') {
            const u = new URL(req.url ?? '/', 'http://x');
            const run = agentRuns.get(u.searchParams.get('run') ?? '');
            if (!run) return json(res, 404, { ok: false, error: 'no such run (the dev server restarted?)' });
            const after = Math.max(0, Number(u.searchParams.get('after') ?? 0) || 0);
            return json(res, 200, { ok: true, status: run.status, events: run.events.slice(after), next: run.events.length, sessionId: run.sessionId ?? null });
          }
          if (req.method !== 'POST') return json(res, 405, { ok: false });
          const body = await readJson(req, 200_000);
          if (sub === '/run') {
            if (!(await loadAgentSdk())) return json(res, 503, { ok: false, error: 'no coding agent connected' });
            const message = String(body.message ?? '').slice(0, 8000).trim();
            if (!message) throw new Error('expected { message }');
            // a run continues (their reply, or a session from before a reload) or starts from a request file
            let run = body.run ? agentRuns.get(String(body.run)) : null;
            if (run && run.status === 'running') return json(res, 409, { ok: false, error: 'your coding agent is still working' });
            let prompt = message;
            if (!run) {
              run = { id: randomUUID().slice(0, 10), events: [], pending: new Map(), status: 'idle', sessionId: body.session ? String(body.session).slice(0, 80) : null, abort: null };
              agentRuns.set(run.id, run);
              if (body.request && /^\.satie\/requests\/[\w.-]+\.md$/.test(String(body.request))) {
                const text = await readFile(resolve(server.config.root, String(body.request)), 'utf8').catch(() => '');
                if (text) prompt = `${message}\n\nThe request file is ${body.request}:\n\n${text}`;
              }
            }
            startAgentTurn(run, prompt);
            return json(res, 200, { ok: true, run: run.id });
          }
          if (sub === '/permit') {
            const run = agentRuns.get(String(body.run ?? ''));
            const done = run?.pending.get(String(body.id ?? ''));
            if (!done) return json(res, 404, { ok: false, error: 'nothing waiting for that' });
            done(body.allow === true);
            return json(res, 200, { ok: true });
          }
          if (sub === '/stop') {
            const run = agentRuns.get(String(body.run ?? ''));
            for (const done of run?.pending.values() ?? []) done(false);
            run?.abort?.abort();
            return json(res, 200, { ok: true });
          }
          json(res, 404, { ok: false });
        } catch (e) { json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      });

      server.middlewares.use('/__satie/freesound/import', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { id, dir } = await readJson(req);
          const r = await freesoundBytes(Number(id));
          const stem = String(r.name ?? id).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sound';
          const rel = `${String(dir ?? '/satie/').replace(/\/+$/, '')}/samples/freesound_${stem}_${id}.mp3`;
          const target = safeTarget(rel);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, r.bytes);
          json(res, 200, { ok: true, url: '/' + relative(root(), target).split('\\').join('/'), name: r.name, clip: `freesound_${stem}_${id}` });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      server.middlewares.use('/__satie/freesound', async (req, res) => {
        try {
          const u = new URL(req.url ?? '/', 'http://x');
          const q = u.searchParams.get('q') ?? '';
          if (!q.trim()) return json(res, 400, { ok: false, error: 'q required' });
          const r = await callTool('satie_freesound', { query: q, limit: 8 });
          json(res, 200, { ok: true, hits: r.hits ?? [] });
        } catch (e) {
          // Say why when it is Freesound itself: a probe from here names the TLS/DNS failure.
          let reason = '';
          try { await fetch('https://freesound.org/apiv2/', { method: 'HEAD' }); } catch (pe) { reason = pe?.cause?.code ?? pe?.message ?? ''; }
          json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), reason });
        }
      });

      server.middlewares.use('/__satie/take', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { prompt, loop, durationS, requestKey, synth, instrumentId } = await readJson(req);
          // Each overlay click deliberately buys another take. A caller may retain
          // its own key to recover a lost response without buying again.
          const r = await callTool('satie_take', { requestKey: requestKey ?? randomUUID(), prompt: String(prompt), loop: !!loop, ...(durationS ? { durationS: Number(durationS) } : {}), ...(synth !== undefined ? { synth } : {}), ...(instrumentId !== undefined ? { instrumentId } : {}) });
          json(res, 200, { ok: true, ...r });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      server.middlewares.use('/__satie/auth/status', async (req, res) => {
        try {
          if (configured()) return json(res, 200, { ok: true, signedIn: true, via: 'token' });
          const who = await auth.who();
          json(res, 200, { ok: true, signedIn: !!who, email: who?.email ?? null, via: who ? 'sign-in' : null });
        } catch (e) { json(res, 200, { ok: true, signedIn: false, error: e instanceof Error ? e.message : String(e) }); }
      });
      server.middlewares.use('/__satie/auth/start', async (req, res) => {
        try {
          const host = req.headers.host ?? `localhost:${server.config.server.port}`;
          const url = await auth.start(`http://${host}/__satie/oauth/callback`);
          json(res, 200, { ok: true, url });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });
      server.middlewares.use('/__satie/auth/signout', async (req, res) => { await auth.signOut(); json(res, 200, { ok: true }); });
      server.middlewares.use('/__satie/oauth/callback', async (req, res) => {
        const u = new URL(req.url ?? '/', 'http://x');
        const page = (msg) => { res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`<!doctype html><meta charset="utf-8"><title>Satie</title><body style="font:15px system-ui;background:#0d0c0b;color:#ebe7df;display:grid;place-items:center;height:100vh;margin:0"><p>${msg}</p><script>try{window.opener&&window.opener.postMessage({satie:'signed-in'},'*')}catch(e){};setTimeout(()=>window.close(),1200)</script>`); };
        try {
          if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error_description') ?? u.searchParams.get('error'));
          await auth.finish(String(u.searchParams.get('state') ?? ''), String(u.searchParams.get('code') ?? ''));
          page('Signed in to Satie. You can close this tab and go back to the mixer.');
        } catch (e) { page(`Sign-in did not finish: ${String(e instanceof Error ? e.message : e).replace(/[<>&]/g, '')}`); }
      });

      // A playthrough capture segment from the mixer (CAPTURE.md): written privately, then kept on the
      // Satie account the way the agent would (satie_asset kind "capture": begin, PUT, finalize) with the
      // developer's own token. Not signed in: the file stays local and the reply says so. A capture a
      // signed-in developer uploads is rendered offline for training unless a paid account opted out.
      server.middlewares.use('/__satie/capture', async (req, res) => {
        if (req.method === 'GET') return json(res, 200, { ok: true, path: '.satie/captures/' });
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        let wrote;
        try {
          const { telemetry } = await readJson(req, CAPTURE_MAX_BYTES + 1024);
          wrote = await persistCapture(server.config.root, telemetry);
        } catch (e) { return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
        const log = (line) => (server.config.logger?.info ?? console.log)(`[satie] ${line}`);
        try {
          const began = await callTool('satie_asset', { action: 'begin', kind: 'capture' });
          if (typeof began.signedUrl !== 'string' || typeof began.uploadId !== 'string') throw new Error('satie_asset begin returned no upload');
          const put = await fetch(began.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: wrote.text });
          if (!put.ok) throw new Error(`capture upload failed (HTTP ${put.status})`);
          const kept = await callTool('satie_asset', { action: 'finalize', kind: 'capture', uploadId: began.uploadId });
          if (typeof kept.captureId !== 'string') throw new Error('satie_asset finalize returned no captureId');
          log(`capture kept: ${kept.captureId} (segment ${wrote.segment}, ${wrote.path})`);
          json(res, 200, { ok: true, wrote: wrote.path, captureId: kept.captureId, uploaded: true });
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          log(e?.code === 'signin_required' ? `capture kept locally only (not signed in): ${wrote.path}` : `capture kept locally, upload failed: ${reason} (${wrote.path})`);
          json(res, 200, { ok: true, wrote: wrote.path, captureId: null, uploaded: false, reason, code: e?.code });
        }
      });

      // The project's current samples.json: sent as keep, so a realize after an edit neither searches nor
      // buys for a voice that already sounds (the overlay only fills missing buffers anyway).
      const keptSamples = async () => {
        try { const kept = JSON.parse(await readFile(resolve(root(), 'satie', 'samples.json'), 'utf8')); return kept && typeof kept === 'object' ? kept : null; } catch { return null; }
      };

      // Provided samples are kept (spec 011 C.2b): a developer's own file is a project URL the offline
      // renderer cannot fetch later, so when realize reports it as not yet kept the plugin uploads the
      // bytes through satie_asset kind "audio" with the clip key (begin, PUT, finalize), the same proxy
      // every other tool call takes. Only files under public/ are read; nothing else leaves the project.
      const keepProvided = async (missing, samplesMap) => {
        const kept = [], skipped = [];
        for (const { clipPath } of missing) {
          const entry = samplesMap?.[clipPath];
          const url = typeof entry === 'string' ? entry : entry?.url;
          if (typeof url !== 'string' || /^(https?:)?\/\//.test(url)) { skipped.push({ clipPath, reason: 'not a project file' }); continue; }
          let bytes;
          try { bytes = await readFile(safeTarget(url.split(/[?#]/)[0])); } catch { skipped.push({ clipPath, reason: 'file not found under ' + publicDir }); continue; }
          try {
            const began = await callTool('satie_asset', { action: 'begin', kind: 'audio', clipPath });
            const put = await fetch(began.signedUrl, { method: 'PUT', headers: { 'Content-Type': url.endsWith('.ogg') ? 'audio/ogg' : url.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' }, body: bytes });
            if (!put.ok) throw new Error(`upload failed (${put.status})`);
            const done = await callTool('satie_asset', { action: 'finalize', kind: 'audio', clipPath, uploadId: began.uploadId });
            kept.push({ clipPath, audioId: done.audioId, sha256: done.provided?.sha256 ?? null });
          } catch (e) { skipped.push({ clipPath, reason: e instanceof Error ? e.message : String(e) }); }
        }
        return { kept, skipped };
      };

      server.middlewares.use('/__satie/provided', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { clips } = await readJson(req, 64_000);
          const map = await keptSamples();
          if (!map) throw new Error('no public/satie/samples.json');
          const wanted = Array.isArray(clips) && clips.length ? clips.map(clipPath => ({ clipPath: String(clipPath) })) : Object.entries(map).filter(([, e]) => e && typeof e === 'object' && (e.source === 'provided' || (!e.source && !/^https?:/.test(e.url ?? '')))).map(([clipPath]) => ({ clipPath }));
          json(res, 200, { ok: true, ...(await keepProvided(wanted, map)) });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // Natural-language edits: the sentence goes to Satie with the current script and the
      // project's scene contract; the returned script is reviewed and applied by the overlay.
      server.middlewares.use('/__satie/edit', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { instruction, sourceId, script, maxCents } = await readJson(req, 2_000_000);
          if (typeof instruction !== 'string' || !instruction.trim() || typeof script !== 'string') throw new Error('expected { instruction, script }');
          const contract = JSON.parse(await readFile(resolve(root(), 'satie', 'scene.contract.json'), 'utf8'));
          const brief = sourceId
            ? `Revise only the voice with source_id ${sourceId}; keep every other voice exactly as it is. The developer says: ${instruction.trim()}`
            : `Revise the scene as the developer asks, keeping everything they did not mention. The developer says: ${instruction.trim()}`;
          const composed = await callTool('satie_compose', { brief, scene: contract.scene, script });
          const next = composed.script ?? composed.compose?.script;
          if (typeof next !== 'string' || !next.trim()) throw new Error('Satie returned no script');
          const surfaces = (contract.scene?.events ?? []).flatMap(e => e.surfaces ?? []);
          const keep = await keptSamples();
          const realized = await callTool('satie_realize', { script: next, maxCents: Math.max(0, Math.min(100, Number(maxCents ?? 10))), ...(surfaces.length ? { surfaces } : {}), ...(keep ? { keep } : {}) });
          json(res, 200, { ok: true, script: next, samples: realized.samples ?? {}, summary: realized.summary ?? '', failed: realized.failed ?? [], warnings: composed.warnings ?? [] });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // A conversation turn about the playing scene (the web chat's follow-up flow, server side):
      // POST { message, script, transcript?, observation?, scope?, refs?, picked?, lastOp?, budgetCents? } → { ui, transcript, spentCents }; the scene contract rides along.
      // `options.chat` runs it in-process instead of through the MCP (a local build of the tool).
      server.middlewares.use('/__satie/chat', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const args = await readJson(req, 2_000_000);
          if (typeof args?.message !== 'string' || !args.message.trim() || typeof args.script !== 'string') throw new Error('expected { message, script }');
          // the project's scene contract: the director and the composer read the world it declares
          if (!args.scene) { try { args.scene = JSON.parse(await readFile(resolve(root(), 'satie', 'scene.contract.json'), 'utf8')).scene; } catch { /* no contract */ } }
          const token = async () => configured() || await auth.token() || await sessionToken();
          const reply = options.chat ? await options.chat(args, { token, server, callTool }) : await callTool('satie_chat', args);
          json(res, 200, { ok: true, ...reply });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // The takes a script needs and does not have yet (after a chat edit added or re-prompted sounds).
      server.middlewares.use('/__satie/realize', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const { script, maxCents } = await readJson(req, 2_000_000);
          if (typeof script !== 'string' || !script.trim()) throw new Error('expected { script }');
          let surfaces = [];
          try { surfaces = (JSON.parse(await readFile(resolve(root(), 'satie', 'scene.contract.json'), 'utf8')).scene?.events ?? []).flatMap(e => e.surfaces ?? []); } catch { /* no contract */ }
          const keep = await keptSamples();
          const realized = await callTool('satie_realize', { script, maxCents: Math.max(0, Math.min(100, Number(maxCents ?? 10))), ...(surfaces.length ? { surfaces } : {}), ...(keep ? { keep } : {}) });
          // The developer's own files realize could not find kept copies of are uploaded now (spec 011 C.2b).
          const provided = Array.isArray(realized.missingAssets) && realized.missingAssets.length ? await keepProvided(realized.missingAssets, { ...(keep ?? {}), ...(realized.samples ?? {}) }) : null;
          json(res, 200, { ok: true, samples: realized.samples ?? {}, failed: realized.failed ?? [], summary: realized.summary ?? '', ...(provided ? { provided } : {}) });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // How a find went (satie_find_log): listens and the final choice. Registered before /__satie/find,
      // whose prefix would otherwise take it. Writes only to Satie's log; spends nothing.
      server.middlewares.use('/__satie/find/log', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const args = await readJson(req, 200_000);
          if (!args || typeof args.findId !== 'string') throw new Error('expected { findId }');
          json(res, 200, { ok: true, ...(await callTool('satie_find_log', args)) });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // One round of a find (satie_find): the swap that steers by listening. The page sends the
      // start, every verdict and every shown id; nothing is written, and nothing is spent.
      server.middlewares.use('/__satie/find', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          // An audio start carries a short excerpt (up to about 2 MB as base64).
          const args = await readJson(req, 3_000_000);
          if (!args || typeof args !== 'object' || !args.start || typeof args.start !== 'object') throw new Error('expected { start }');
          // the tool's own bounds, held here: a mixer asking more than it gives failed every search, silently (2026-11-13)
          if (args.limit !== undefined) args.limit = Math.max(1, Math.min(FIND_LIMIT_MAX, Math.round(Number(args.limit) || 6)));
          const round = await callTool('satie_find', args);
          json(res, 200, { ok: true, ...round });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // Generate variations (satie_vary). "plan" is free and returns the prompts with their cost; "make" buys
      // exactly those, within maxCents. The page sends one requestKey per plan, so a repeated click recovers
      // the same takes instead of paying again (without one, identical arguments do the same).
      server.middlewares.use('/__satie/vary', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false });
        try {
          const args = await readJson(req, 200_000);
          if (!args || (args.mode !== 'plan' && args.mode !== 'make')) throw new Error('expected { mode: "plan" | "make" }');
          if (args.mode === 'make') args.maxCents = Math.max(0, Math.min(100, Number(args.maxCents ?? 10)));
          const result = await callTool('satie_vary', args);
          json(res, 200, { ok: true, ...result });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });

      // The library as a map (the edit panel, docs/specs/015-edit-panel): every public recording that has a
      // map position, with its hover snippet. Read as you (your sign-in), from the samples table, paged; the
      // landscape RPC is too slow for this. A local prototype route: the shipped path is an MCP tool.
      let landscapeRead = null;
      server.middlewares.use('/__satie/landscape', async (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false });
        try {
          const cache = join(server.config.root, '.satie', 'cache', 'landscape-2.json');
          try { const c = JSON.parse(await readFile(cache, 'utf8')); if (Date.now() - c.at < 24 * 3600_000 && Array.isArray(c.sounds) && c.sounds.length) return json(res, 200, { ok: true, sounds: c.sounds, base: c.base }); } catch { /* none yet */ }
          landscapeRead ??= (async () => {
            const tok = configured() || await auth.token();
            if (!tok) { const e = new Error('sign in to Satie to see the library map'); e.code = 'signin'; throw e; }
            const claims = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8'));
            const base = String(claims.iss ?? '').replace(/\/auth\/v1\/?$/, '');
            if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base)) throw new Error('unexpected sign-in issuer');
            // SATIE's own project needs no setting: its publishable key is public (satie.world's pages carry it); another
            // project (a self-hosted SATIE) still names its own (2026-11-13: a developer's dev server never had the env var)
            const anon = process.env.SATIE_SUPABASE_ANON_KEY || (base === SATIE_SUPABASE_URL ? SATIE_PUBLISHABLE_KEY : '');
            if (!anon) throw new Error('SATIE_SUPABASE_ANON_KEY is not set');
            const cols = 'id,name,map_x,map_y,snippet_path,storage_bucket,storage_path,tags,description,duration_ms,license';
            const sounds = [];
            for (let from = 0; from < 50_000; from += 1000) {
              const r = await fetch(`${base}/rest/v1/community_samples?select=${cols}&map_x=not.is.null&storage_bucket=neq.private-samples&order=id`, { headers: { apikey: anon, Authorization: `Bearer ${tok}`, Range: `${from}-${from + 999}` } });
              if (!r.ok) throw new Error(`library map: HTTP ${r.status}`);
              const rows = await r.json();
              for (const x of rows) sounds.push({ id: x.id, n: x.name, x: x.map_x, y: x.map_y, s: x.snippet_path ?? null, f: x.storage_path, t: x.tags ?? [], d: x.duration_ms ?? null, l: x.license ?? '', ...(x.description?.trim() ? { ds: x.description.trim().slice(0, 280) } : {}) });
              if (rows.length < 1000) break;
            }
            const pub = `${base}/storage/v1/object/public/community-samples/`;
            await mkdir(dirname(cache), { recursive: true });
            await writeFile(cache, JSON.stringify({ at: Date.now(), base: pub, sounds }));
            return { sounds, base: pub };
          })().finally(() => { landscapeRead = null; });
          const r = await landscapeRead;
          json(res, 200, { ok: true, ...r });
        } catch (e) {
          // the library could not be read now: yesterday's map is better than none (the mix stays usable)
          try { const c = JSON.parse(await readFile(join(server.config.root, '.satie', 'cache', 'landscape-2.json'), 'utf8')); if (Array.isArray(c.sounds) && c.sounds.length) return json(res, 200, { ok: true, sounds: c.sounds, base: c.base, stale: true }); } catch { /* no map at all */ }
          json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code });
        }
      });

      server.middlewares.use('/__satie/library', async (req, res) => {
        try {
          const u = new URL(req.url ?? '/', 'http://x');
          const q = u.searchParams.get('q') ?? '';
          if (!q.trim()) return json(res, 400, { ok: false, error: 'q required' });
          const r = await callTool('satie_library', { query: q, loop: u.searchParams.get('loop') === '1', limit: 12 });
          json(res, 200, { ok: true, hits: r.hits ?? [] });
        } catch (e) { json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e), code: e?.code }); }
      });
    },
  };
}

export default satie;
