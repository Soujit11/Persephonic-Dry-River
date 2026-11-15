#!/usr/bin/env node
/**
 * What the coding agent should know before it answers: the top of `.satie/now.md` (what the developer
 * sees and hears in the running game, written by the mixer) and the open requests for it. Made for a
 * Claude Code `UserPromptSubmit` hook, whose output is added to the agent's context on every message:
 *
 *   .claude/settings.json
 *   { "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node node_modules/satie-runtime/now.js" }] }],
 *               "SessionStart": [{ "hooks": [{ "type": "command", "command": "node node_modules/satie-runtime/now.js session" }] }] } }
 *
 * With `session` (the SessionStart hook) it also tells a new session in a Satie project to start watching for
 * the tasks the developer sends from the mixer (watch-tasks.js), so Send needs no paste. A project with only the
 * UserPromptSubmit hook gets the same words on the session's first message (once per session id).
 *
 * Prints nothing when there is nothing to say (no file, the game closed long ago and no open request), so a
 * pure code question costs nothing. Reads two small files; no imports beyond node, so it adds no wait.
 */
import { readFile, writeFile, mkdir, stat, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

/** The game counts as open while the mixer wrote within this long (it writes each second while it plays). */
export const FRESH_MS = 15 * 60 * 1000;

const section = (text, heading) => {
  const at = text.indexOf(`\n## ${heading}`);
  if (at < 0) return null;
  const rest = text.slice(at + 1);
  const end = rest.indexOf('\n## ', 3);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
};

const ago = ms => ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))} s ago` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min ago` : `${Math.round(ms / 3_600_000)} h ago`;

/**
 * The text for the agent, or '' when there is nothing to say. `root` is the project; `now` is for tests.
 * Fresh: the update line, "At a glance" and the open requests. Stale: only the open requests, which wait
 * on disk whether or not the game is running.
 */
export async function nowForAgent(root, now = Date.now()) {
  const file = resolve(root, '.satie', 'now.md');
  let text, mtime;
  try { [text, { mtimeMs: mtime }] = await Promise.all([readFile(file, 'utf8'), stat(file)]); } catch { return ''; }
  const age = now - mtime, fresh = age <= FRESH_MS;
  const requests = section(text, 'Open requests for the coding agent');
  const open = requests && !/\nNone\.?\s*$/.test(requests) ? requests : null;
  if (!fresh && !open) return '';
  const out = [];
  if (fresh) {
    // the glance block ends where the reading guide starts; the guide stays in the file for when the agent reads it
    const glance = section(text, 'At a glance')?.split(/\n\s*How to read this/)[0].trim();
    const closed = /The game page was closed at [^.]+/.exec(text)?.[0];
    out.push(`Satie, the game's sound: the mixer in the running game wrote .satie/now.md ${ago(age)}${closed ? ` (${closed.toLowerCase()})` : ''}. Its top lines:`);
    if (glance) out.push(glance.replace('Read the full sections below', 'Read the rest of .satie/now.md'));
  }
  if (open) out.push(open, 'Each task file says what to do and the exact names to add: set Status: taken when you start, then Status: done with a Done: line and a Files: line.');
  return out.join('\n\n');
}

/** What a new session in a Satie project is told at its start: keep a watch on the mixer's tasks. '' outside a Satie project. */
export async function sessionStartForAgent(root, { wakes = false } = {}) {
  const satie = await Promise.any([access(resolve(root, '.satie')), access(resolve(root, 'public', 'satie', 'scene.satie'))]).then(() => true, () => false);
  if (!satie) return '';
  return [
    'Satie, the game\'s sound: the developer can send you tasks from the mixer in the running game (its "Send to my coding agent" button) and expects you to start without being asked.',
    wakes
      ? 'Satie\'s hooks wake you when the developer sends a task; you do not need to watch for them.'
      : 'Start a background watch now and keep it for the whole session: run `node node_modules/satie-runtime/watch-tasks.js` with the Monitor tool (the longest timeout it allows; start it again whenever it expires), or as a background shell with `--once` that you start again after each task. Do not mention it unless the developer asks.',
    'Each line it prints is a waiting task: take it at once (Status: taken), use .satie/now.md for what the developer sees and hears, make the change, then Status: done with a Done: line and a Files: line. The mixer shows each step and holds the game\'s reload until the developer presses Reload.',
  ].join('\n');
}

/**
 * Whether this session still has to be told to start the watch: once per session id, kept in
 * .satie/told-sessions (the last 50). A project set up before the SessionStart hook existed gets the
 * same words on its first message, from the UserPromptSubmit hook it already has.
 */
export async function firstTimeIn(root, sessionId) {
  if (!sessionId) return false;
  const file = resolve(root, '.satie', 'told-sessions');
  let told = [];
  try { told = (await readFile(file, 'utf8')).split('\n').filter(Boolean); } catch { /* none yet */ }
  if (told.includes(sessionId)) return false;
  try { await mkdir(resolve(root, '.satie'), { recursive: true }); await writeFile(file, [...told, sessionId].slice(-50).join('\n') + '\n'); } catch { /* still say it */ }
  return true;
}

/** The hook's input (Claude Code sends JSON with session_id on stdin); {} when there is none. */
async function hookInput() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  const read = new Promise(done => { process.stdin.on('data', c => chunks.push(c)); process.stdin.on('end', done); process.stdin.on('error', done); });
  await Promise.race([read, new Promise(done => setTimeout(done, 300))]);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

/** Run as a command, also through a symlink (npm's node_modules/.bin, pnpm's store, a linked package). */
const runAsCommand = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (runAsCommand()) {
  // a hook must never block the developer's message: any failure prints nothing
  try {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const input = await hookInput();
    const start = await sessionStartForAgent(root, { wakes: process.argv.includes('session') });
    // the session-start words once per session: at SessionStart, or on the first message when that hook is not set up
    const tell = start && (process.argv.includes('session') ? (await firstTimeIn(root, input.session_id), true) : await firstTimeIn(root, input.session_id));
    const text = [tell ? start : '', await nowForAgent(root)].filter(Boolean).join('\n\n');
    if (text) process.stdout.write(text + '\n');
  } catch { /* say nothing */ }
}
