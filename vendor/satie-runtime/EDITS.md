# satie.edits/v1: the developer's decisions, one line each

Status: contract, 2026-11-06. Written by the `satie-runtime/vite` plugin; read by the
coding agent and by the MCP's `satie_apply_edits`. Fields are never renamed; a later
version adds fields or ops and bumps `v`.

## Where

`.satie/authoring/edits.jsonl` at the project root, one JSON object per line, appended
in the order the developer acted. The folder is private: keep `.satie/` in the
project's `.gitignore` (the setup guide says so; the Satie repo's own `.gitignore` has
it), Vite refuses to serve it, and writes need loopback plus same-origin.

Two ways to read it:

- the file itself, while the dev server is off or on;
- `GET http://localhost:<port>/__satie/edits` while the dev server runs, with optional
  `?scene=public/satie/scene.satie` and `?since=<ISO-8601>`; it returns
  `{ ok, v: "satie.edits/v1", path: ".satie/authoring/edits.jsonl", edits: [...] }`.
  Same gates as every `/__satie` route: loopback and same-origin only.

The mixer's complete capture (satie.edits/v3: snapshots, offers, listens, verdicts) keeps
being written to `.satie/authoring/<bucket>/<session>.jsonl`; the authoring importer
(`npm run import:edits`) still reads it. This log is the subset an agent acts on,
derived from those events as they arrive, so the two cannot drift.

## The line

```json
{ "v": "satie.edits/v1", "at": "2026-11-06T18:04:12.331Z", "scene": "public/satie/scene.satie",
  "voice": "s_6c2561c5", "host": "campfire", "op": "level", "value": { "gainDb": -6, "spl": 59 }, "by": "developer" }
```

| field | meaning |
| --- | --- |
| `v` | `satie.edits/v1` |
| `at` | ISO-8601, when the developer made the decision |
| `scene` | the script's path relative to the project (the mixer's script URL under the public directory) |
| `voice` | the voice's `source_id` as written in the script. A voice with none is `line:<n>` (1-based line of its head statement in the script at that moment). `*` means the whole scene (mute all, a label, a scene note). `statement:<i>` appears only when the dev server could not read the script; treat it as the i-th parsed statement. |
| `host` | the voice's `at <id>` host, or `null` |
| `op` | one of the ops below |
| `value` | the op's payload; always an object, `{}` when the op needs none |
| `by` | `developer` for the mixer's own controls; `satie` for an edit Satie made in the mixer's conversation and the developer accepted |

Readers ignore ops they do not know and fields they do not use. A reader that
de-duplicates can hash the line's bytes.

## Ops

| op | value | what the developer did |
| --- | --- | --- |
| `level` | `{ gainDb, spl? }` | changed the voice's level. `gainDb` is the offset from the authored level, cumulative within the mixer session (relative to the script the mixer loaded when the session began); `spl` is the absolute level (dB at 1 m) the voice has after this edit, when the mixer knows it. A reader that finds the script already at `spl` has nothing to apply. From the legacy gain slider (no level faders) `gainDb` is `20 log10(gain)` and `spl` is absent. |
| `mute` | `{}` | muted the voice (`*`: muted every voice) |
| `unmute` | `{}` | unmuted it (`*`: cleared every mute) |
| `solo` | `{}` | soloed the voice. Monitoring, not authoring: a reader does not write a solo into the script; it tells the agent what the developer was listening to. |
| `unsolo` | `{}` | cleared the solo (`*`: cleared every solo) |
| `move` | `{ position: [x, y, z] }` or `{ host }` | placed the voice at a point (metres, the script's `place`) or onto a host (`at <host>`; `host` is also the line's `host`) |
| `swap` | `{ clipPath, sampleId?, url?, prompt?, head? }` | put another sound on the voice. `clipPath` is the samples.json key the voice now plays (null only when the mixer could not name it); `sampleId` and `url` when it came from the library or a find; `prompt` when it is a generated take; `head` is the voice's new head line. For one take of a bank replaced in place, `clipPath` is that take's key and the script is unchanged. |
| `trim` | `{ startS, endS }` | trimmed the voice's take to a region. Reserved: today's mixer has no trim control, so nothing emits it yet. |
| `remove` | `{}` | deleted the voice |
| `add` | `{ block?, head? }` | added a voice: `block` is its script text (comment lines, head, properties) when the mixer had it, `head` its head line otherwise. Also written for a restored voice and for a copy placed by aiming. |
| `set` | `{ key, value, was }` | changed one property of the voice (`variants`, `cooldown`, `within`, a DSP value, the `name` of a sound); `value` null means the property was removed |
| `label` | `{ text, was }` | named a place: the host's human label in the scene contract (`voice` is `*`, `host` the object) |
| `note` | `{ text, clipPath? }` | words, not a script change: a take verdict with its reason (`clipPath` names the take), why the developer went back to an earlier version |

Everything else the mixer records (listening, offers, finds, comparisons, history moves
that changed nothing, save, the ground-reflection A/B) stays in the v3 capture and is
not a line here. A move to an earlier version in the mixer's history IS written, as the
per-voice edits that move implies, so the log always describes the scene the developer
left.

## Applying it

`satie_apply_edits { script, edits }` (free, deterministic) rewrites the script so the
developer's decisions are authored: `level` moves `spl`, `mute` adds the flag, `move`
rewrites `place` or `at`, `swap` rewrites the head line, `remove` drops the block,
`add` inserts it, `set` upserts the property, `label` and `note` are reported, `solo`
and `unsolo` are reported and never written. Apply in file order; the last line for a
voice and op wins.
