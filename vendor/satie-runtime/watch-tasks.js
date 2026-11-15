#!/usr/bin/env node
/**
 * The coding agent's ear for the mixer's Send button: watches `.satie/requests/` and prints one line for
 * every task waiting for it (`Status: open`): the ones already there when it starts, then each new one as
 * the developer sends it. Made for a background watch that wakes the agent on each printed line (Claude
 * Code: the Monitor tool, or a background shell with `--once`, which exits after the first task):
 *
 *   node node_modules/satie-runtime/watch-tasks.js          # runs until stopped, one line per task
 *   node node_modules/satie-runtime/watch-tasks.js --once   # exits after the first task it prints
 *   node node_modules/satie-runtime/watch-tasks.js --hook   # for a Claude Code hook with "asyncRewake": true
 *
 * `--hook` wakes an idle Claude Code session: it waits for the first waiting task, prints it to stderr and
 * exits 2, which Claude Code turns into a new turn. Run from SessionStart and Stop, so a watch is armed again
 * after every turn. Only one runs per project (`.satie/watch.lock`); it gives up when its session ends.
 *
 * It never prints a task twice, and it prints a task again only if its file goes back to `Status: open`.
 * It reads small files once a second; no imports beyond node.
 */
import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

/** One line that tells the agent what to do with a waiting task. */
export function taskLine(file, text) {
  const title = /^# Satie task:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? file.replace(/\.md$/, '');
  return `Satie task waiting: ${title}. Steps in .satie/requests/${file}. Take it now: set its Status to taken, read .satie/now.md for what the developer sees and hears, make the change, then set Status: done with a Done: line and a Files: line.`;
}

/** The waiting tasks in `dir` not in `told` yet (file name → told); marks them told. A file that is no longer open can be told again later. */
export async function newlyOpen(dir, told) {
  let files;
  try { files = (await readdir(dir)).filter(f => f.endsWith('.md')).sort(); } catch { return []; }
  const out = [];
  for (const f of files) {
    let text;
    try { text = await readFile(join(dir, f), 'utf8'); } catch { continue; }
    const open = /^Status:\s*open\s*$/m.test(text);
    if (!open) { told.delete(f); continue; }
    if (told.has(f)) continue;
    told.add(f);
    out.push(taskLine(f, text));
  }
  return out;
}

/** Run as a command, also through a symlink (npm's node_modules/.bin, pnpm's store, a linked package). */
const runAsCommand = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
/** The project's one armed watch: a lock file with its pid; a lock whose process is gone is taken over. */
export async function takeLock(file, pid = process.pid) {
  try {
    const held = Number((await readFile(file, 'utf8')).trim());
    if (held && held !== pid) { try { process.kill(held, 0); return false; } catch { /* stale */ } }
  } catch { /* none */ }
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, String(pid));
  return true;
}

if (runAsCommand()) {
  const dir = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.satie', 'requests');
  const once = process.argv.includes('--once'), hook = process.argv.includes('--hook');
  const told = new Set();
  const lock = resolve(dir, '..', 'watch.lock');
  if (hook && !(await takeLock(lock))) process.exit(0);   // another watch of this project is armed already
  const leave = async code => { if (hook) await unlink(lock).catch(() => {}); process.exit(code); };
  const parent = process.ppid;
  const tick = async () => {
    // the session that armed this hook is gone: stop, so the next session's watch is not locked out
    if (hook && (process.ppid !== parent || process.ppid === 1)) return leave(0);
    const lines = await newlyOpen(dir, told).catch(() => []);
    if (hook && lines.length) { process.stderr.write(lines.join('\n') + '\n'); return leave(2); }
    for (const l of lines) process.stdout.write(l + '\n');
    if (once && lines.length) process.exit(0);
  };
  await tick();
  setInterval(tick, 1000);
}
