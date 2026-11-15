# satie.playthrough/v2: what a capture holds, and where it goes

Status: contract, 2026-11-08 (spec 011, Track A). Written by `SceneRuntime` through
`SceneCapture`; read by `satie_audit_playthrough`, `satie_record_episode` and the dataset
bridge. Fields are never renamed; a later version adds fields and bumps `version`.

A capture is the trajectory of one play session: where the listener was, where every
bound object was and how it faced, which signals, states and events the game sent, and
what the engine chose to play. The offline renderer replays it on the same seed and writes
audio with labels from one source, so the labels cannot disagree with the audio. It holds
runtime observations, never a recorded waveform.

**An uploaded capture is rendered offline for training unless a paid account opted out.**
Local files are not uploads; see "What leaves the machine" below.

## One segment

`beginCapture()` opens a session; `endCapture()` returns its last segment. Every segment is a
complete `satie.playthrough/v2` object that replays on its own:

| field | what |
| --- | --- |
| `version` | `satie.playthrough/v2` |
| `durationS` | the segment's length in seconds; every `t` below is in `[0, durationS]`, seconds since this segment opened |
| `frames[]` | one per 10 Hz tick: `t`, `audioT` (the same moment on the audio clock, see "Two clocks" below), `listener` (metres), `listenerForward` and `listenerUp` (unit vectors, together a full orientation), `listenerAnchor`, `hosts`, `hostPositions` (metres), `hostMatrices` (16 numbers each, column-major like three.js `Matrix4.elements`, translation in metres; adapters with a matrix only, the three.js one does), `objectStates`, `signals`, `state`, `tracks` (per voice: key, sourceId, host, position, playing, virtual, occlusion, gain, pitch, modelled `receivedDb`, extent) |
| `events[]` | what the engine played: `kind`, `label`, `key`, `take`, `position`, `sourceId`, `bufferKey`, `audioStartedAt`, `estimatedAudibleOnsetAt` (`timingBasis: 'pcm-onset-estimate'`), `audioClockOffsetS` |
| `actions[]` | what the game did: `bind`, `host-position`, `unbind`, `event`, `signal`, `state`, `object-state`, `object-state-clear`, `start`, `stop`, `entity-action`, `entity-steer`, `entity-goal`, each with its `t`, `name`, `position`, `value`, `text`, `accepted` and evidence (`bodyId`, `contactId`, `cause`, `occurredAt`, `simulationTime`) |
| `assets[]` | the clips loaded, `clipPath`, `sampleId`, `sha256` |
| `warnings[]` | runtime warnings seen during the segment |
| `provenance` | `runtimeVersion`, `sceneRevision` (null once the script changed under the capture), `seed`, `seedSource`, `clock`, `levelAnchorDb`, `audioEvidence: 'runtime-model'`, `segment`, `segmentStartS`, `session` |
| `truncation` | `{ frames, events, actions }`: how many of each this segment dropped; all zeros means it is complete |
| `truncated` | true when any count above is positive (kept for v2 readers) |

Every segment, the first included, opens with the state in force at `t = 0`: a `bind` per
bound host, a `signal` per signal, the scene `state`, every object state, and `start` when the
engine was playing, then a frame. A replayer installs those before the first tick.

### Host motion

`setHostPosition` records `bind` once, then `host-position` at most once per host per 10 Hz
tick, the last position of the tick winning; the per-frame `hostPositions` carry the same
truth. A host moved at 60 Hz for ten minutes is about 6,000 actions, not 36,000. A replay
through `SceneSimulation` follows the real path within one tick.

Signals are recorded the same way: `signal(name, value)` reaches the engine on every call, and the
capture keeps one `signal` action per name per 10 Hz tick, the last value winning, only when it
changed; the per-frame `signals` carry the same truth. A value eased every frame no longer fills
the action cap in a minute (found 2026-11-09).

### Seed

`SceneRuntime` is always seeded. Give `seed` (a 32-bit integer) and `seedSource` is
`developer`; give none and the runtime draws one and says `runtime`. The engine's random
stream is seeded with it before anything loads, so a capture's seed reproduces the engine's
choices (takes, start offsets, ranges) when the same script replays. It does not promise
bit-identical game physics or Web Audio DSP.

## Two clocks

A capture keeps two clocks, both in seconds since the segment opened:

- **Wall clock**, the page's own (`performance.now()`): every `t`, and `occurredAt`. The frames and
  the game's actions are placed on it.
- **Audio clock**, `AudioContext.currentTime`: when the live engine started a sound in the audio
  output (`audioStartedAt`, `estimatedAudibleOnsetAt`), and `audioT` on every frame.

They agree within a few milliseconds while audio runs normally. The audio clock stops when the
audio thread stalls, which can happen right after play: after a busy render thread the browser
catches it up within about 0.2 s; after a suspension the offset stays.

**Nothing is dropped** (since 2026-11-13). Until then, one sound timed while the clocks were more
than 0.1 s apart deleted every audio time in the segment. Now:

- every sound keeps its audio times, with `audioClockOffsetS`: wall-clock minus audio-clock seconds
  since the segment opened, read when the times were stored;
- every frame has `audioT`, so `t - audioT` traces the offset at 10 Hz, also through a stall in
  which no sound played;
- the first time in a segment the clocks are more than 0.1 s apart (`AUDIO_CLOCK_TOLERANCE_S`), at
  a sound or a frame, the segment warns once: "Audio/host clock discontinuity during capture; audio
  timings are kept on the audio clock, with audioClockOffsetS and frames[].audioT to realign them."

What the offset means, by where the entry came from:

- **A game action** (`actions[]`, an `event` the game sent): its `t` is the wall clock at the call,
  so a stall does not move it. Its offset is read at that same moment:
  `audioStartedAt + audioClockOffsetS` is the sound's start on the frame timeline. When a sound
  scheduled during a stall actually came out is not known.
- **An engine event** (`events[]`): the engine logs it on the audio clock only. Its `t` is mapped
  from that clock when the capture collects it, up to one frame later, and its offset is read then.
  A sound the engine scheduled inside a stall and collected after the catch-up therefore reads as
  aligned, with a `t` at the stall's start. Use the frames' `audioT` around it to see the stall.

Each segment measures both clocks from its own opening, so a lasting offset is zero again after a
rollover. An action that itself rolls the segment over (it did not fit under the cap) is stored in
the new segment with all its times measured from that segment. The behaviour audit counts a
timing whose `|audioClockOffsetS|` exceeds 0.1 s as missing, as it did when the capture deleted it.
Captures written before 2026-11-13 have neither field.

## Caps and segments

A segment holds at most 10,000 frames, 20,000 events and 10,000 actions (`CAPTURE_CAPS` in
`satie-runtime/contracts`, and exactly what the MCP's capture schema accepts). When a channel
reaches its cap:

- with an `onSegment` listener (`beginCapture({ onSegment })`), the capture closes the segment,
  hands it to the listener, and opens the next with `provenance.segment + 1`, its clock at zero,
  `segmentStartS` saying how far into the session it begins, the same `session` id, and the
  opening state above. `endCapture()` hands the last segment to the listener too and returns it.
  `rolloverCapture()` closes a segment on demand; false when nothing listens;
- without a listener, the capture drops the overflow and counts it in `truncation`, as the
  one-segment captures before 2026-11-08 did (then with only the flag).

A 40-minute session with one moving object is three segments, each eligible as an episode. At
one host-position per tick the actions channel fills a few ticks before the frames one, so a
segment is usually a little under 10,000 frames (about 16 minutes at 10 Hz).

## What leaves the machine

Nothing, by the runtime alone. `beginCapture` and `endCapture` are local. The three paths out:

1. **The coding agent**, which uploads the JSON with `satie_asset kind "capture"` and audits it.
2. **The development mixer** (`mountMixer`, or `recordCaptures` from `satie-runtime/three`):
   when the `satie-runtime/vite` plugin answers `GET /__satie/capture`, the recorder begins a
   capture on the first play and posts every segment (`POST /__satie/capture { telemetry }`)
   as it closes: at a cap, every `maxSegmentS` seconds (default 60 since 2026-11-09), when the
   page is hidden, when the game calls `endCapture`, when the mixer unmounts, and on `pagehide`
   or `beforeunload`. The plugin
   writes each segment to `.satie/captures/<iso-time>-<segment>.json` (owner-only, never
   served, `.satie/` is gitignored) and, when the developer is signed in, keeps it on their
   Satie account the way the agent would (begin, PUT, finalize) and logs
   `[satie] capture kept: <captureId>`. Not signed in: the file stays local and the reply says
   `uploaded: false`. No plugin: nothing starts. `mountMixer(audio, { capture: false })` turns
   it off.
3. **A hand upload** of a file from `.satie/captures/`.

Only the last segment of a session rides the page's unload: a segment over about 60 KB cannot
use a beacon or a keepalive fetch, so a page closed mid-session keeps what was already posted and
loses the open segment. That is why the default segment is 60 s and the open segment rolls over
when the page is hidden: the spec 011 dogfood (2026-11-09) lost an 80 s session whose only
segment was still open at close. Keep `maxSegmentS` short; a game can also call `endCapture`
at its own terminal states.

What is never in a capture: audio bytes, screenshots, project paths or URLs, project code.
Clip identities are the samples.json keys and their hashes.
