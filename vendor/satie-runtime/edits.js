/**
 * satie.edits/v1: the developer's mixer decisions as one flat, versioned log
 * (`.satie/authoring/edits.jsonl`, one JSON object per line), derived on the
 * dev server from the mixer's own capture events (satie.edits/v3) as they
 * arrive. The contract is packages/satie-runtime/EDITS.md; the reader is the
 * MCP's `satie_apply_edits`, which folds these lines into the authored script.
 *
 * Why derive instead of emitting from the mixer: the v3 capture is complete
 * (snapshots, typed per-voice changes, offers and listens) and is what the
 * authoring model learns from; this log is the small, stable subset an agent
 * acts on. One translation here keeps the two from drifting and keeps the
 * browser bundle free of a second logging path.
 *
 * Every line: { v, at, scene, voice, host, op, value, by }
 *   scene  the script's path relative to the project (public/satie/scene.satie)
 *   voice  the voice's source_id as written in the script; `line:<n>` (1-based
 *          head line) for a voice without one; "*" for the whole scene
 *   host   the `at <id>` host of that voice, or null
 *   by     "developer" for the mixer's own controls, "satie" for an edit Satie
 *          made in the mixer's conversation and the developer accepted
 */
import { createHash } from 'node:crypto';

export const EDITS_VERSION = 'satie.edits/v1';
/** Where the log lives, relative to the project root (private, gitignored with the rest of .satie/). */
export const EDITS_PATH = '.satie/authoring/edits.jsonl';

// The engine's parser and clip-path helpers, from the built package; loaded once, optional
// (without them voice keys fall back to `statement:<index>` and swaps carry no clip path).
let enginePromise;
function engine() {
  enginePromise ??= Promise.all([import('./lib/core/SatieParser.js'), import('./lib/core/GenRequests.js'), import('./lib/edit/voiceChanges.js')])
    .then(([parser, gen, edit]) => ({ tryParse: parser.tryParse, pathFor: parser.pathFor, takeClipPath: gen.takeClipPath, describeVoiceChanges: edit.describeVoiceChanges }))
    .catch(() => null);
  return enginePromise;
}

/** Per mixer session: the v3 script references, the script as it stands, and the running level offsets. */
const sessions = new Map();
const MAX_SESSIONS = 64;
function sessionState(id) {
  let s = sessions.get(id);
  if (!s) {
    s = { scripts: new Map(), script: null, levels: new Map(), parsed: null, parsedFor: null };
    sessions.set(id, s);
    if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  }
  return s;
}
/** @internal tests: forget every session's running state. */
export function resetEditSessions() { sessions.clear(); }

/** The scene path relative to the project: the mixer's script URL under the public directory. */
export function scenePathFor(scriptPath, publicDir = 'public') {
  let p = String(scriptPath ?? '');
  try { if (/^https?:\/\//i.test(p)) p = new URL(p).pathname; } catch { /* keep as given */ }
  p = p.split('?')[0].replace(/^\/+/, '');
  return `${publicDir.replace(/\/+$/, '')}/${p}`;
}

/** The v3 snapshot's script, resolving this session's `scriptRef` (a script is stored once per segment). */
function snapshotScript(event, state) {
  const snap = event.snapshot;
  if (!snap) return null;
  if (typeof snap.script === 'string') { if (snap.scriptRef) state.scripts.set(snap.scriptRef, snap.script); return snap.script; }
  if (snap.scriptRef && state.scripts.has(snap.scriptRef)) return state.scripts.get(snap.scriptRef);
  return null;
}

const number = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
const gainDb = g => { const n = number(g); return n === null ? null : n <= 0 ? -60 : Math.max(-60, Math.round(20 * Math.log10(n) * 10) / 10); };

/** The voice's script block at a 0-based head line: the comment lines directly above it, the head, its indented lines. */
export function blockAt(script, line) {
  const lines = String(script ?? '').split('\n');
  if (line < 0 || line >= lines.length) return null;
  let start = line;
  while (start > 0 && /^\s*#/.test(lines[start - 1])) start--;
  let end = line + 1;
  while (end < lines.length && (/^\s+\S/.test(lines[end]) || (lines[end].trim() === '' && end + 1 < lines.length && /^\s+\S/.test(lines[end + 1])))) end++;
  return lines.slice(start, end).join('\n').trimEnd();
}

async function parsed(state, script) {
  if (script == null) return null;
  if (state.parsedFor === script) return state.parsed;
  const eng = await engine();
  state.parsedFor = script;
  state.parsed = eng ? (eng.tryParse(script).statements ?? null) : null;
  return state.parsed;
}
const keyOfStatement = st => st?.sourceId ?? (st && st.sourceLine >= 0 ? `line:${st.sourceLine + 1}` : null);
const keyOfRef = ref => ref?.sourceId ?? (typeof ref?.line === 'number' ? `line:${ref.line + 1}` : null);

/**
 * Translate one capture event into zero or more satie.edits/v1 lines. Pure apart from the
 * per-session state it keeps (scripts, running level offsets); `now` is the event's own time.
 */
export async function editsFromEvent(event, { publicDir = 'public' } = {}) {
  if (!event || typeof event !== 'object' || typeof event.kind !== 'string') return [];
  const state = sessionState(String(event.sessionId ?? ''));
  const scene = scenePathFor(event.scriptPath, publicDir);
  const before = state.script;
  const after = snapshotScript(event, state);
  if (after != null) state.script = after;
  const kind = event.kind, detail = event.detail ?? {};
  const by = kind.startsWith('chat') ? 'satie' : 'developer';
  const out = [];
  const line = (voice, host, op, value) => { out.push({ v: EDITS_VERSION, at: event.t, scene, voice: voice ?? '*', host: host ?? null, op, value: value ?? {}, by }); };
  const level = (voice, host, deltaDb, spl) => {
    const key = `${scene}\u0000${voice}`;
    const total = Math.round(((state.levels.get(key) ?? 0) + deltaDb) * 10) / 10;
    state.levels.set(key, total);
    line(voice, host, 'level', { gainDb: total, ...(spl != null ? { spl } : {}) });
  };
  // a voice named by the mixer's statement index, resolved against the script it refers to
  const voiceOf = async (ctx, script = after ?? before) => {
    if (!ctx || typeof ctx.statementIndex !== 'number') return { voice: null, host: ctx?.host ?? null };
    const sts = await parsed(state, script);
    const st = sts?.[ctx.statementIndex];
    return { voice: keyOfStatement(st) ?? `statement:${ctx.statementIndex}`, host: st?.hostRef ?? ctx.host ?? null };
  };
  const applyChanges = async (changes, extra = {}) => {
    const eng = await engine();
    const sts = after != null ? await parsed(state, after) : null;
    // a move writes `place` or `at` and drops the other: one `move` line, not a move and an unset
    const moved = new Set((changes ?? []).filter(c => c.change === 'set' && (c.prop === 'at' || c.prop === 'place')).map(c => keyOfRef(c.voice)));
    for (const c of changes ?? []) {
      const voice = keyOfRef(c.voice), host = c.voice?.host ?? null;
      if (c.change === 'unset' && (c.prop === 'at' || c.prop === 'place') && moved.has(voice)) continue;
      if (c.change === 'remove') line(voice, host, 'remove', {});
      else if (c.change === 'add') line(voice, host, 'add', { ...(after != null && blockAt(after, c.voice.line) ? { block: blockAt(after, c.voice.line) } : {}), head: c.voice.sound ? `${c.voice.kind} ${c.voice.sound}` : undefined });
      else if (c.change === 'source') {
        const st = sts?.find(s => s.sourceLine === c.voice.line);
        const clipPath = st && eng ? eng.takeClipPath(st, 0) : (extra.clip && eng ? eng.pathFor(extra.clip) : null);
        line(voice, host, 'swap', { clipPath: clipPath ?? null, ...(extra.sampleId ? { sampleId: extra.sampleId } : {}), ...(extra.url ? { url: extra.url } : {}), ...(st?.genPrompt ? { prompt: st.genPrompt } : {}), head: c.to });
      } else if (c.change === 'set' || c.change === 'unset') {
        const prop = c.prop;
        if (prop === 'spl') { const f = number(c.from), t = number(c.to); if (t !== null) level(voice, host, f === null ? 0 : t - f, t); else line(voice, host, 'set', { key: prop, value: c.to ?? null, was: c.from ?? null }); }
        else if (prop === 'mute') line(voice, host, c.change === 'set' ? 'mute' : 'unmute', {});
        else if (prop === 'at' && c.change === 'set') line(voice, c.to, 'move', { host: c.to });
        else if (prop === 'place' && c.change === 'set') { const xyz = String(c.to).trim().split(/\s+/).map(Number); line(voice, null, 'move', xyz.length === 3 && xyz.every(Number.isFinite) ? { position: xyz } : { place: c.to }); }
        else line(voice, host, 'set', { key: prop, value: c.to ?? null, was: c.from ?? null });
      }
    }
  };
  const each = async (voices, op, value) => { for (const ctx of voices ?? []) { const v = await voiceOf(ctx); line(v.voice, v.host, op, value); } };

  switch (kind) {
    case 'start': case 'end': case 'save': case 'save_requested': case 'save_stale': case 'save_failed': case 'external_script': case 'capture_gap':
    case 'edit_refused': case 'edit_failed': case 'asset_loaded': case 'swap_stale': case 'view_mode': case 'world_edit': case 'fire_test': case 'audition_voice':
    case 'listen': case 'offer': case 'outcome': case 'search': case 'hear_now': case 'reading': case 'reading_talk': case 'reading_correct': case 'chat': case 'chat_approve':
    case 'chat_realize': case 'chat_rerun': case 'chat_takes': case 'chat_takes_undo': case 'agent_turn': case 'agent_permit': case 'request_done': case 'fork':
    case 'comparison_pin': case 'comparison_audition': case 'comparison_feedback': case 'scene_comparison': case 'find_round': case 'find_listen': case 'find_mark':
    case 'find_shortlist': case 'find_closed': case 'ground_reflection':
      break; // not an authored decision (or made outside the mixer): the v3 capture keeps it
    case 'mute': case 'solo': {
      const v = await voiceOf(detail.voice);
      line(v.voice, v.host, kind === 'mute' ? (detail.muted ? 'mute' : 'unmute') : (detail.soloed ? 'solo' : 'unsolo'), {});
      break;
    }
    case 'mute_selection': case 'mute_group': await each(detail.voices, detail.muted ? 'mute' : 'unmute', {}); break;
    case 'solo_selection': case 'solo_group': await each(detail.voices, detail.soloed ? 'solo' : 'unsolo', {}); break;
    case 'mute_all': line('*', null, detail.muted ? 'mute' : 'unmute', {}); break;
    case 'mute_reset': line('*', null, 'unmute', {}); line('*', null, 'unsolo', {}); break;
    case 'gain': { const v = await voiceOf(detail.voice); const db = gainDb(detail.gain); if (db !== null) line(v.voice, v.host, 'level', { gainDb: db }); break; }
    case 'rename_place': line('*', detail.host ?? null, 'label', { text: detail.to ?? null, was: detail.from ?? null }); break;
    case 'rename_sound': { const v = await voiceOf(detail.voice); line(v.voice, v.host, 'set', { key: 'name', value: detail.to ?? null, was: detail.from ?? null }); break; }
    case 'replace_take': line(detail.voice ?? '*', null, 'swap', { clipPath: detail.key ?? null, ...(detail.to?.sampleId ? { sampleId: detail.to.sampleId } : {}), ...(detail.to?.url ? { url: detail.to.url } : {}) }); break;
    case 'feedback': {
      const f = detail.feedback ?? {};
      const v = typeof f.target?.statementIndex === 'number' ? await voiceOf({ statementIndex: f.target.statementIndex }) : { voice: '*', host: null };
      line(v.voice, v.host, 'note', { text: [f.verdict, f.dimension ? `(${f.dimension})` : '', f.reason ? `: ${f.reason}` : ''].join('').trim(), ...(f.target?.clipPath ? { clipPath: f.target.clipPath } : {}) });
      break;
    }
    case 'went_back': line('*', null, 'note', { text: `went back from "${detail.from ?? ''}" to "${detail.to ?? ''}"${detail.reason ? `: ${detail.reason}` : ''}` }); break;
    case 'history_move': {
      // the script moved to another version: say what that changed, per voice, like any other edit
      const eng = await engine();
      if (eng && before != null && after != null && before !== after) await applyChanges(eng.describeVoiceChanges(before, after)?.changes ?? []);
      else if (before !== after) line('*', null, 'note', { text: `moved to version "${detail.to ?? ''}"` });
      break;
    }
    case 'level_trim': {
      if (event.changes?.length) { await applyChanges(event.changes); break; }
      const d = number(detail.deltaDb);
      for (const id of detail.sourceIds ?? []) if (d !== null) level(id, null, d);
      break;
    }
    case 'swap': {
      // another sound on the same voice: the voice as it was named before, the clip it plays after (same statement index)
      const to = detail.to ?? {};
      const eng = await engine();
      const v = await voiceOf(detail.voice, before ?? after);
      const sts = after != null ? await parsed(state, after) : null;
      const st = typeof detail.voice?.statementIndex === 'number' ? sts?.[detail.voice.statementIndex] : undefined;
      const clipPath = st && eng ? eng.takeClipPath(st, 0) : (to.clip && eng ? eng.pathFor(to.clip) : null);
      const head = st && after != null ? (after.split('\n')[st.sourceLine] ?? '').trim() : undefined;
      line(v.voice, st?.hostRef ?? v.host, 'swap', { clipPath: clipPath ?? null, ...(to.sampleId ? { sampleId: to.sampleId } : {}), ...(to.url ? { url: to.url } : {}),
        ...(st?.genPrompt || to.gen ? { prompt: st?.genPrompt ?? to.gen } : {}), ...(head ? { head } : {}) });
      break;
    }
    default:
      // every other script edit (delete_voice, property, place, script_edit, chat_edit, add_*, takes, group_*, restore_voice...)
      // describes itself per voice in `changes`
      await applyChanges(event.changes);
  }
  return out;
}

/** Read a JSONL log back: parsed lines, bad lines skipped, optionally one scene and only lines after `since`. */
export function parseEditLog(text, { scene, since } = {}) {
  const out = [];
  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (e?.v !== EDITS_VERSION) continue;
    if (scene && e.scene !== scene) continue;
    if (since && !(e.at > since)) continue;
    out.push(e);
  }
  return out;
}

/** A stable id for one line (its bytes), for readers that de-duplicate. */
export const editLineId = line => createHash('sha256').update(JSON.stringify(line)).digest('hex').slice(0, 16);
