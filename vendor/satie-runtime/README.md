# satie-runtime

## Game integration (0.4)

The working tree also contains the unpublished `0.5.0-dev.20260920` causal-audio
candidate. `HostAudioBridge`, `FootContactTracker`, object listener assignment and
their new evidence fields require that matching built package. The hosted 0.4.2
tarball does not supply those APIs.

Use `satie-runtime/three` for the maintained `SatieScene` adapter and
`manifestFrom`; use `satie-runtime/react` for the R3F `SatieAudio` component.
The framework-free bridge is available at `satie-runtime/integration`, and
shared types at `satie-runtime/contracts`. Framework peers are optional and
never imported by the engine entry point.

```ts
import { SatieScene } from 'satie-runtime/three';
const contract = await (await fetch('/satie/scene.contract.json')).json();
const audio = await SatieScene.load('/satie/scene.satie', '/satie/samples.json', { contract, seed: 7 });
audio.bind('car', carMesh);
// Enable Start only now; invoke directly in the user's click handler:
startButton.onclick = () => { void audio.start(); };
// After physics/world transforms each frame:
audio.update(camera);
// On removal / level unload:
audio.unbind('car');
audio.dispose();
```

Positions in the Three.js adapter use scene units; `unitsPerMeter` defaults
to 1 (use 100 for centimetres). Geometry in the MCP manifest is always metres.
Signal ranges and event surfaces are validated against the contract.

### Object listener (local adapter addition, not yet in published 0.4.2)

Attach the listener to the player or any Three.js object, independently of where
the camera renders from. The optional offset is local scene units and follows
the object's parent transforms. By default, orientation follows the same object.

```ts
audio.bindListener(player, { offset: [0, 1.65, 0], orientation: camera });
audio.update(); // Player position, view orientation.
// On entering a vehicle; the scene keeps playing:
audio.bindListener(carMesh, { offset: [0, 1.3, 0], orientation: camera });
// Restore the original camera listener:
audio.unbindListener();
audio.update(camera);
```

The R3F component accepts `listener`, `listenerOffset` and
`listenerOrientation` with the same semantics. Switching the listener object
does not reload samples. Pass `listener={null}` to restore the camera, or omit
the prop to manage the binding through the `onReady` instance.

For R3F, mount `SatieAudio` inside Canvas with stable `contract`, `bindings`,
`onReady(audio)` and `onError(error)` props. Use the ready instance for the
Start gesture and gameplay events; no separate `started` loading race.

`audio.beginCapture()` / `audio.endCapture()` returns local
`satie.playthrough/v2` observations: scene revision, runtime version, the seed
(always one; the runtime draws it when you give none, `seedSource` says who),
sample identities, the listener's position, forward and up, host positions and
(three.js) matrices at 10 Hz, controls and selected takes. A segment holds at
most 10,000 frames, 20,000 events and 10,000 actions; pass
`beginCapture({ onSegment })` and a full channel closes a segment and opens the
next instead of dropping (`truncation` counts anything dropped). The runtime
alone uploads nothing. With the development mixer mounted and the
`satie-runtime/vite` plugin on, every test session is posted to the plugin,
which writes it under `.satie/captures/` and keeps it on your Satie account when
you are signed in; an uploaded capture is rendered offline for training unless a
paid account opted out. `mountMixer(audio, { capture: false })` turns that off.
`CAPTURE.md` has the fields, the segments and the paths out. These are runtime
observations, not recorded waveforms or proof of acoustic accuracy.

The candidate's `HostAudioBridge` binds authoritative event callbacks, physical
controls and independent object-state groups to Satie sources. Its event points
are explicitly **metres**, through `eventAtMeters`, including in a centimetre
Three.js scene. The adapter's existing `event()` remains in scene units. Supply
`occurredAt` from the configured monotonic clock, keep simulation time separate,
and give each physical occurrence a unique ID. Increasing per-channel sequences
also reject stale retries after the bounded ID history expires. Declare explicit
`onDetach` controls, dispose each bridge when its body leaves, and unbind the host.
Physics contacts, animation contacts and distance fallback retain distinct
provenance. A fallback gait cannot be presented as measured foot physics.

Integration bundles include `scripts/satie-vendor.mjs`; run it to download
assets into your project, verify/pin SHA-256 hashes, and use local URLs.
Commit the resulting samples and lockfile. Generated-take budgets currently
exclude composition and library confirmation costs.

> Package name is a placeholder — final npm name/scope TBD before first publish.

The Satie spatial audio runtime as an embeddable, browser library with a lazy Csound dependency for live synthesizer voices: parse plaintext `.satie` scripts, schedule and spatialize sound voices over Web Audio (HRTF), sync the listener to your camera, and read per-frame voice positions to drive your own visuals (three.js, WebXR, world-model viewers). Includes the offline exporters (stereo/binaural WAV, FOA ambisonics, ADM BWF / Dolby Atmos master, USDZ with spatial audio, and a Unity bundle: per-voice stems + `scene.json` + a C# loader).

Support matrix: **browser bundler ESM** (Vite, webpack, Rollup, esbuild). Not Node — the runtime requires Web Audio.

## Install

```bash
npm install https://www.satie.world/runtime/satie-runtime.tgz   # built on every deploy; npm publish pending
# or without a bundler:  import { SatieEngine } from 'https://www.satie.world/runtime/satie-runtime.js'
```

## Quickstart (three.js)

```ts
import { SatieEngine } from 'satie-runtime';

const engine = new SatieEngine();          // or: new SatieEngine({ audioContext, destination })

// Load clips — engine decodes for you...
await engine.loadAudioFile('rain', '/audio/rain.wav');
// ...or hand over already-decoded buffers:
engine.setAudioBuffer('bell', myDecodedAudioBuffer);

engine.loadScript(`
loop rain
  place ahead far low wide
  move swell
  volume 0.6

oneshot bell
  place right near high
  every 4to9
`);

// AudioContext needs a user gesture:
startButton.onclick = () => engine.play();

// Per frame — camera is the listener, voices drive your visuals:
function animate() {
  engine.setListenerFromMatrix(camera.matrixWorld.elements);
  for (const voice of engine.getTrackViews()) {
    // voice.position ({x,y,z}, meters, +Z = ahead), voice.color, voice.alpha,
    // voice.pending, voice.occlusion ... — objects are mutated in place at
    // 30 Hz; read each frame, don't snapshot.
    myMeshFor(voice.key).position.set(voice.position.x, voice.position.y, voice.position.z);
  }
  renderer.render(scene, camera);
}
```

See `examples/threejs-basic` in the repo for a complete runnable app.

## Binding voices to your objects (`at <id>`)

A voice written `at fountain` sits on whatever you register under that id and
follows it — a mesh, a rigid body, an NPC — with no `world` block in the script:

```ts
loop fountain_water
  at fountain
  radius 1.2
  spl 66
```

```ts
// per frame, after the object moved (in place, no allocation; the panner still updates at 30 Hz):
fountainMesh.getWorldPosition(v);
engine.setHostPosition('fountain', v.x, v.y, v.z);
// engine.clearHost('fountain') releases the voices back to their `place`
```

Game events, signals and states go through the same three calls the Satie
game bridge uses: `engine.fireEvent('door', { x, y, z })` answers `on door`
voices (`fireEvent('step', { text: 'gravel' })` for `on step`),
`engine.setSignal('engine_load', 0.7)` feeds `follow` / `when` bindings, and
`engine.setSceneState('alert', { isolation: 0.6 })` gates `zone` voices.

## Editing the sound inside your project (`satie-runtime/devtools`)

```ts
import { devtools } from 'satie-runtime/devtools';
devtools(engine, { script: '/satie/scene.satie', collapsed: true });   // backquote toggles the panel
```

Development only: a panel over your canvas with every voice as a mixer row
(mute, solo, gain, received level live), the events as they fire, runtime
warnings, and the script in an editor. Apply reloads the running scene through
the engine's live edit (unchanged voices keep playing); Save writes the file
back under `public/` when the Vite plugin is on:

```ts
// vite.config.ts
import { satie } from 'satie-runtime/vite';
export default defineConfig({ plugins: [satie()] });
```

### Local authoring history

The overlay also keeps an ordered local edit log. With the plugin running on
loopback, logs are written under `.satie/authoring/`, **not `public/`**, and cannot
be read through Vite. Add `.satie/` to your project's `.gitignore`; never publish
raw authoring logs. There is no training upload. Pass `eventUrl: null` to disable
capture; custom capture endpoints must accept `{ event }` with `satie.edits/v2`.
Use the **edit log** button to download observations, or `panel.edits()` and
`await panel.flushEdits()` on the returned devtools handle. Failed persistence
keeps the in-memory log available; limits are explicitly marked.

Use a mixer's **feedback** button to record a source or exact-take verdict with
a reason and dimension. “I listened” is an explicit, unchecked self-report;
unlistened and neutral feedback do not become preference examples. Take scope
requires a hash of bytes actually decoded for the registered buffer, supplied
automatically by `SceneRuntime.load`, `loadAudioFile` and overlay swaps. Custom
loaders can use `engine.decodeAudioAsset(bytes, expectedSha256?)`, then
`engine.setAudioBuffer(clipPath, buffer)`. Plain externally decoded buffers stay
unverified. The hash identifies encoded source bytes, not processed listener
audio. Reopen feedback if the scene or loaded take changes while reviewing.

For A/B, **pin take A**, swap to another verified take, then reopen feedback.
Stop scene playback and audition both excerpts before recording a preference.
This compares the first five seconds (or the shorter take) at the same 0.3 output
gain through a dry preview, not the spatial scene or equal perceived loudness.
Both completed auditions, explicit listening confirmation and a reason are required.

Attach changing game context without starting a gameplay recording:

```ts
devtools(runtime.engine, {
  script: '/satie/scene.satie',
  context: () => runtime.authoringContext(),
});
```

The runtime snapshot covers adapter-supplied listener/hosts/signals/state only.
To capture geometry, return a `host-supplied` authoring context with your current
object positions, metre-sized bounds, materials and occlusion flags. Context is
sampled on edits and feedback, not continuously. A callback failure is marked
unavailable; historical scene geometry is never overwritten with current geometry.

Keep the MCP's original `authorship` draft as your baseline. In the Satie repo:

```sh
npm run import:edits -- BASELINE_DRAFT.json EDITS.jsonl NEW_OUTPUT_DIRECTORY
```

This builds a journal of script, asset and mixer changes with no inferred human
approval. Inspect `report.json`. Geometry is supplied by the baseline, not captured
by the overlay; legacy logs without ordered snapshots cannot be reconstructed.
Contributing the resulting journal still requires the MCP preview and explicit
consent. The old `ingest-edits.mts` command is for legacy logs only.

### The developer's decisions: `.satie/authoring/edits.jsonl` (satie.edits/v1, 0.4.5)

Beside the complete capture above, the plugin folds every decision the developer
makes in the mixer into one flat, versioned log, `.satie/authoring/edits.jsonl`,
one JSON object per line: `{ v, at, scene, voice, host, op, value, by }` with ops
`level`, `mute`, `unmute`, `solo`, `unsolo`, `move`, `swap`, `trim`, `remove`,
`add`, `set`, `label`, `note`. The contract is [EDITS.md](./EDITS.md). A coding
agent on the machine reads the file, or `GET /__satie/edits?scene=public/satie/scene.satie&since=<ISO>`
while the dev server runs (loopback and same-origin, like every `/__satie` route),
and folds it into the script with the MCP's `satie_apply_edits` instead of
re-composing. Keep `.satie/` in `.gitignore`.

### Events, signals and states (`satie-runtime/three`, 0.4.5)

The patterns the middleware that ships games uses, as adapter calls:

```ts
audio.setHostSurface('crate', groundMaterialAt(point));   // one surface map per host, set before the event
audio.hostEvent('crate', 'drop');                          // fires at the host's centre, with its surface as the text
audio.signalTarget('engine_load', load);                   // eased (0.1 s), published on change (1 percent of the range)
audio.bindTransient(`bottle_${id}`, mesh, { onRelease: () => scene.remove(mesh) }); // released once nothing at it plays
```

`hostEvent` refuses a surfaced event with no surface set and a text the event does
not declare; `{ text }` overrides for one fire. `signal(name, value)` still publishes
at once and cancels any easing. `releaseTransient(id)` releases a transient host now;
long-lived objects keep `bind` and `unbind`. The player's own sounds stay on the
listener (`bindListener`, hostless `on` voices marked `by: "<player>"` in the
manifest); states stay discrete (`audio.state`, and per-object groups on
`HostAudioBridge`). `satie_setup` has the full section with the Unity and Unreal
equivalents.

### The badge and the mixer in a game

```ts
import { badge } from 'satie-runtime/badge';
const credit = badge({ dev: import.meta.env.DEV, onOpen: () => mixer.open(), ready: scene.loaded });
```

- `ready`: until it settles a quiet "loading sounds" line shows and the badge stays away; its intro plays once loading finishes (or call `credit.setLoading(true | false)`).
- In a Three.js game, mount the mixer with its world sound layer in one call, under your dev flag:
  ```ts
  if (import.meta.env.DEV) import('satie-runtime/three').then(({ mountMixer }) => {
    mixer = mountMixer(scene, { scene: world, camera, renderer, script: '/satie/scene.satie', collapsed: true,
      context: () => scene.authoringContext(), onOpenChange: open => credit.setPanelOpen(open) });
  });
  ```
  It is `devtools` plus `locate` (every positioned sound as a dot in the world, linked with its mixer row), drawn after each frame from the world scene's `onAfterRender` for that camera; `mixer.destroy()` removes both and restores the callback. In R3F pass `SatieAudio` the `mixer` prop (and `onMixer` to get the handle). A page with no Three.js scene mounts `devtools` alone.
- Keep the game's prompts and HUD visible while the mixer is open (`onOpenChange`): the developer keeps playing while they mix.
- Typing in the mixer never reaches the game: key events from its fields stop at the panel.
- Names in the mixer and the world labels come from the contract: an object's `label`, an event's `with` (the object a player interaction happens with).

## Realizing a script ahead of time (the Satie MCP)

Scripts with `gen` statements need audio. Rather than generating at runtime,
have the takes bought once and load them under the keys the engine looks up:
`genRequestsFor(statements)` lists every take with its `clipPath`; the Satie
MCP's `satie_realize` tool does that on the server and returns
`{ clipPath: { url } }`, which you load with `engine.loadAudioFile(clipPath, url)`
BEFORE `loadScript` — the gen voices find their buffers landed and never ask
for a generator. See `docs/wiki/api/mcp.md` in the Satie repo.

## AI audio generation (`gen` statements)

The runtime talks to **no external service**. Scripts with `gen` statements
need a generator hook; without one, gen voices stay pending and the engine
emits a single runtime warning.

```ts
engine.onGenerateAudio = async ({ prompt, clipName, isLoop, options }) => {
  const bytes = await myTextToSoundApi(prompt, { loop: isLoop, ...options });
  return bytes; // ArrayBuffer or AudioBuffer, or null on failure
};
```

## API surface (selected)

| Area | Symbols |
|------|---------|
| Engine | `SatieEngine`, `SatieEngineOptions`, `TrackView`, `play/stop/loadScript`, `setAudioBuffer`, `loadAudioFile`, `setListenerFromMatrix`, `getTrackViews`, `setHostPosition`/`clearHost`, `fireEvent`, `setSignal`, `setSceneState`, `levelReport` |
| Language | `parse`, `tryParse`, `parseWithWarnings`, `Statement`, `RangeOrValue`, `InterpolationData`, `genRequestsFor`, `enrichGenPrompt` |
| Spatial | `resolvePlacement`, `SEMANTIC_MOTIONS`, `registerTrajectoryFromLUT`, `getTrajectory` |
| Export | `renderOffline` (stereo/binaural/FOA), `renderAdmBwf` (Dolby Atmos ADM BWF), `exportUSDZ` (AR Quick Look / Vision Pro), `exportUnityBundle` (stems + `scene.json` + `SatieScene.cs`, drop into `Assets/`), `encodeWAV` |
| Hooks | `onGenerateAudio`, `onMissingBuffer`, `onSearchCommunity` |

Coordinate frame: scripts and `TrackView.position` use Satie's scene frame — **+Z = ahead, +X = right, +Y = up, meters, listener at origin**. Exporters convert to each format's convention internally; the Unity bundle is the one whose conversion is the identity (Unity's frame is the same left-handed +Z-forward triad).

For interactive game mixing, mount `devtools(engine, { script, samples,
levelFaders: true, mixGroups: [{ id: 'engines', label: 'Car engines',
sourceIds: ['car_0_engine', 'car_1_engine'] }] })`. The dB faders adjust static
source SPL by stable ID and preserve host-driven volume/pitch. Save bakes those
levels into the script; the local Vite plugin also refreshes an existing sibling
scene contract and matching asset lock so reload remains valid. Use the default
volume-override fader only when taking over automation is intended. `start` can
optionally delegate audio activation to the host. These local edits do not imply
human approval or a training contribution.

## Edit locally without re-integrating

With runtime 0.4.3 or later, edit `public/satie/scene.satie` and run:

```sh
npx satie-runtime rebind public/satie
```

This offline command checks parser warnings and the required sample keys, then updates `scene.contract.json` atomically with the edited script hash and a new revision. Existing sample hashes are unchanged and the runtime still verifies them. If you change a prompt or add a surface, supply or realize its assets first. Keep the host manifest in sync and review the new revision before shipping; earlier listening evidence is not transferred.

MCP integration, composition and listening assistance are free. New audio uses prepaid credits; reuse is free. Shipped games and apps require a per-title licence, with no per-install fee. Contact mateo@attractor.world for title licensing. The optional Pro authoring seat is separate.

### Live synthesizer voices

Write `loop synth low ambient drone` to explicitly request an instrument, or choose Synth in the sound card. Realize the script with a current Satie server to receive a patch-backed take. Browser playback synthesizes it continuously through Csound; `pitch`, `synth_brightness` and `synth_tempo` can follow game signals. Sample playback stays the default. Older synth takes need regeneration.

The sound card offers six DrC instruments and a description, then Create preview → Listen → Use this. Opening the chooser spends nothing; creation costs one take and leaves the current source playing until Use. Previous sample/synth choices are retained. The MCP exposes the same bank at `satie://reference/instruments`; `satie_take` accepts `synth: true` and an optional `instrumentId`. Realized manifest entries carry the versioned patch, seed, renderer and content hash in `synth`, also embedded in the audio for portable reloads.

New takes use the same Csound instrument code for server rendering and live playback. `createSynthAsset` creates validated metadata; `freezeSynthAsset(context, asset)` renders compatible audio in the browser. A frozen loop uses a finite performance with a warmup and seam crossfade; it cannot reproduce the endless live phrase or later signal changes. The older TypeScript renderer remains for legacy patches only.

The npm package declares `@csound/browser`; it initializes only when a synth voice starts. The hosted browser ESM entry depends on neighboring lazy chunks, so copy the whole `runtime/` directory if self-hosting, including license notices. Native and offline exports retain compatible baked audio and do not reproduce live synth controls.
