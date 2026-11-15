/**
 * The single source of truth for what a Satie property IS.
 *
 * Before this table, a property's identity was spread across nine hand-synced
 * places (two known-name sets, two standalone-flag sets, the reserved-word list,
 * the `parseSingle` switch, the `flushGroup` switch, the editor's tokenizer +
 * hover docs, and the in-app docs panel). Nothing checked them against each
 * other, so a property added to six of the nine silently half-worked: `place`
 * was dropped by ` and ` splitting, `field` and `occlusion` were dropped by
 * groups, and `speed`/`noise`/`size`/`prompt` sat in the known-name set with no
 * handler at all — which suppressed the typo warning without doing anything.
 *
 * Every derived list below is computed from `PROPERTIES`, and the conformance
 * test (`__tests__/Properties.conformance.test.ts`) asserts the behavioral
 * switches agree with what each entry declares. Drift is now a red test rather
 * than a silent no-op.
 *
 * To add a property: add ONE entry here with its `parse` kind. A declarative
 * kind (`flag` / `range` / `modulated` / `bound` / `scalar`) needs nothing else:
 * `parseSingle` looks the key up and applies it, and `flushGroup` inherits it
 * by the `group` rule using the kind's own "unset" test. A `custom` kind
 * registers its handler in `CUSTOM_PROPERTY_PARSERS` (SatieParser.ts); the
 * conformance test fails until it does.
 */
export const PROPERTIES = [
    { name: 'gen_key', grammar: 'custom', group: 'none', concern: 'gen',
        parse: { kind: 'custom' }, detail: 'generated bank identifier',
        documentation: 'Explicit identity for a generated recording bank, independent of its prompt label. Letters, digits, underscores and hyphens only. Count copies and variants keep separate take slots. Supplied recordings still override generation. Does not inherit through groups; emitters in one program must use the same key.' },
    { name: 'recordings', grammar: 'custom', group: 'none', concern: 'gen', splitOnAnd: false, literalValue: true,
        parse: { kind: 'custom' }, detail: 'JSON: takes and/or surfaces',
        documentation: 'Explicit ordered clip references: recordings {"takes":["takes/id/bell"]}, or {"surfaces":{"snow":["takes/id/step"]}} for literal event descriptions. At most 8 takes per bank and 32 surfaces. These supplied assets replace the corresponding generated bank; missing references stay missing and never buy replacements. An empty bank is silent. Unspecified surface banks retain the authored generation policy. Does not inherit through groups.' },
    { name: 'distance_model', grammar: 'custom', group: 'default', concern: 'acoustics',
        parse: { kind: 'custom' }, detail: 'legacy_v1 | free_field_v1',
        documentation: 'Versioned distance attenuation. free_field_v1 uses 1/r pressure beyond 1 metre for point sources. legacy_v1 preserves the original inverse rolloff of 2 and is the default for existing scripts. Beds/fields and the current line approximation are unchanged. Inherits through groups; does not replace room, occlusion, source-extent or air-filter models.' },
    { name: 'program', grammar: 'custom', group: 'default', concern: 'meta',
        parse: { kind: 'custom' }, detail: 'shared playback identifier',
        documentation: 'Emitters with the same program play one recording/take on a shared source clock. Use the same clip, kind, event and pitch settings. Loops added later join the current position. Disables independent phase staggering, event humanization and source-rate Doppler; speaker level, spatial path and effects remain independent. Pitch automation is unsupported. Inherits through groups.' },
    { name: 'source_id', grammar: 'custom', group: 'none', concern: 'meta',
        parse: { kind: 'custom' },
        detail: 'stable authoring identifier',
        documentation: 'Persistent identity of this authored voice, independent of its clip, line number and live instances. Must be unique within the script; use letters, digits, underscores, dots or hyphens. Preserve it when editing the same source.' },
    { name: 'source_role', grammar: 'custom', group: 'none', concern: 'meta',
        parse: { kind: 'custom' }, detail: 'ambience | source',
        documentation: 'Recording content: ambience is a recording of the whole place; source is an isolated sound. Independent of bed, line or point placement. Retained when changing recordings; does not change audio by itself.' },
    { name: 'catalog_ref', grammar: 'custom', group: 'none', concern: 'meta',
        parse: { kind: 'custom' }, detail: 'sound catalog identifier',
        documentation: 'Explicit sound catalog identity for retrieval and alternatives, independent of the selected recording. Uses letters, digits, underscores, dots or hyphens. The engine retains the reference without interpreting a catalog.' },
    // ── Level & tone ────────────────────────────────────────────
    {
        name: 'volume', follows: true, grammar: 'range', group: 'multiply',
        parse: { kind: 'bound', field: 'volume', interpolation: 'volumeInterpolation', follow: 'volumeFollow' },
        detail: '0–1 | range | follow',
        documentation: 'Voice amplitude (0–1). Supports ranges like `0.3to0.8`, interpolation, and signal bindings.\nExample: `volume 0.7`, `volume fade 0 1 every 2`, or `volume follow distance 60to5 0.05to0.7`',
    },
    {
        name: 'spl', follows: true, grammar: 'custom', group: 'default', clamp: [0, 140],
        parse: { kind: 'custom' },
        detail: 'dB SPL at 1 m | range | follow',
        documentation: 'How loud the source IS: its emission level in dB SPL at 1 m, stated by the script (0–140; a value, a range, or a `follow` binding). The engine does the propagation: distance, occlusion, line/bed/field: and governs the scene with a sliding HDR window, so a loud thing far away and a quiet thing up close land in the right order at the ear. Stating `spl` on ANY voice (or entity) calibrates the whole scene: voices without one are assumed 70 dB, and `volume` becomes a dB trim on top of the emission (0.5 = −6 dB) instead of the gain itself.\nExample: `spl 80`, `spl 75to85`, or `spl follow velocity 0to18 40to85 pow 1.5` (rolling noise silent at rest)',
    },
    {
        name: 'pitch', follows: true, grammar: 'range', group: 'multiply',
        parse: { kind: 'bound', field: 'pitch', interpolation: 'pitchInterpolation', follow: 'pitchFollow' },
        detail: '0.1–4 | range | follow',
        documentation: 'Playback rate (1 = normal). `0.5` = one octave down, `2` = one octave up.\nExample: `pitch 1.2`, `pitch fade 0.8 1.2 every 3 loop bounce`, or `pitch follow closing -30to30 0.85to1.18`',
    },
    {
        name: 'synth_brightness', follows: true, grammar: 'range', group: 'default', clamp: [0.05, 8],
        parse: { kind: 'bound', field: 'synthBrightness', interpolation: 'synthBrightnessInterpolation', follow: 'synthBrightnessFollow' },
        detail: '0.05–8 | range | follow',
        documentation: 'Live synth filter multiplier, 1 = the patch as written. Changes timbre without restarting. Example: `synth_brightness follow danger 0to1 0.4to3`.',
    },
    {
        name: 'synth_tempo', follows: true, grammar: 'range', group: 'default', clamp: [0.1, 4],
        parse: { kind: 'bound', field: 'synthTempo', interpolation: 'synthTempoInterpolation', follow: 'synthTempoFollow' },
        detail: '0.1–4 | range | follow',
        documentation: 'Live synth progression speed, 1 = the patch as written. Pitch stays independent. Example: `synth_tempo follow energy 0to1 0.5to2`.',
    },
    // ── Time ────────────────────────────────────────────────────
    {
        name: 'start', aliases: ['starts_at'], grammar: 'range', group: 'default',
        parse: { kind: 'range', field: 'start', unset: 'zero-singleton' },
        detail: 'seconds | range',
        documentation: 'When the voice starts playing (in seconds from the beginning).\nExample: `start 2` or `start 0to5`',
    },
    {
        name: 'end', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'seconds [fade <d>]',
        documentation: 'When the voice stops playing (absolute time in seconds).\nExample: `end 10` or `end 10 fade 2`',
    },
    {
        name: 'duration', grammar: 'range', group: 'default',
        parse: { kind: 'range', field: 'duration' },
        detail: 'seconds | range',
        documentation: 'How long the voice plays before stopping.\nExample: `duration 5` or `duration 3to8`',
    },
    {
        name: 'fade_in', grammar: 'range', group: 'default',
        parse: { kind: 'range', field: 'fadeIn' },
        detail: 'seconds | range',
        documentation: 'Fade-in time in seconds. Volume ramps from 0 to target.\nExample: `fade_in 1.5`',
    },
    {
        name: 'fade_out', grammar: 'range', group: 'default',
        parse: { kind: 'range', field: 'fadeOut' },
        detail: 'seconds | range',
        documentation: 'Fade-out time in seconds when the voice stops.\nExample: `fade_out 2`',
    },
    {
        name: 'every', grammar: 'range', group: 'default',
        parse: { kind: 'range', field: 'every' },
        detail: 'seconds | range',
        documentation: 'Retrigger interval. Also writable on the statement line (`oneshot bird every 2to6`).\nExample: `every 5` or `every 2to6`',
    },
    // ── Space ───────────────────────────────────────────────────
    {
        name: 'place', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<sector> <depth> [height] [extent] | <x> <y> <z>',
        documentation: 'Semantic placement: WHERE a sound sits, relative to the listener.\n- sector: ahead behind left right ahead-left ahead-right behind-left behind-right surround overhead\n- depth: near (~1.5m) mid (~3.5m) far (~6m)\n- height: low (ground) level (ear) high (up)\n- extent: narrow (point) wide (arc) surround (envelop)\nExample: `place ahead far low wide` (the sea); `place overhead near` (gulls). Pairs with `move`.\nNumeric form: `place 1.5 0.25 -3` pins exact coordinates; each axis also takes a range, so `place 1to3 0 -2to2` spreads a static voice over a region. Written automatically when you drag a voice in the 3D viewport.',
    },
    {
        name: 'move', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'static|drift|swell|wander|dart|pass… | walk|fly|spiral|orbit|lorenz',
        documentation: 'How a voice moves. Prefer the semantic archetypes:\n- `static`: still   · `breathe`/`drift`/`swell`: slow ambient beds\n- `wander`: ground agent · `dart`: fast flyer · `circle`: orbit\n- `pass lr`/`pass rl`: traverse · `approach`/`recede`: depth move\nLow-level (fine control): `walk`, `fly`, `spiral`, `orbit`, `lorenz`, `gen <desc>`, or explicit `fly x -5to5 y 0to3 z -5to5`.\nModifiers: `speed <v>`, `noise <0–1>`.\nExample: `place ahead mid low wide` then `move swell`.',
    },
    {
        name: 'field', grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'field' },
        detail: 'flag',
        documentation: 'Mark the voice as a spatially-extended source: rain, wind, room tone, an underwater bed.\nNo distance rolloff, and the position rides the listener at the scripted offset, so it sounds the same everywhere while keeping its direction.\nUse this for any ambient bed instead of pinning it to a point with `place`. Local shading comes from `occlusion` and `zone`, not distance.',
    },
    {
        name: 'radius', grammar: 'range', group: 'default', clamp: [0, 100],
        parse: { kind: 'modulated', field: 'radius', interpolation: 'radiusInterpolation' },
        detail: 'meters | range | fade',
        documentation: 'Physical size of the source: a sphere of this radius, in meters.\nA sized source stops being a pinpoint: far away it localizes normally, but as you approach (or if it is large) it widens across the stereo field, and inside it the sound is fully around you. Level reads the closest edge: standing at the shore of a `radius 6` pond, the water is close and sounds close.\nUse it for anything with real spatial depth: water, fire, foliage, machinery, a crowd.\nSize is also something you PLAY: `fade`/`jump` animate it, so a point can swell until you are standing inside it (the continuous form of `bed`) and shrink back. The sphere in the viewport grows with it.\nExample: `radius 4`, `radius 3to6`, or `radius fade 2 40 every 20 loop bounce`',
    },
    {
        name: 'ring', grammar: 'range', group: 'default', clamp: [0, 100],
        parse: { kind: 'modulated', field: 'ringRadius', interpolation: 'ringInterpolation' },
        detail: 'meters | range | fade',
        documentation: 'The source is a horizontal RING of this radius around its position, not a point: crickets around a clearing, surf around an island, wind in a treeline.\nYou hear the nearest part of the ring; at the center it surrounds you completely. Combine with `radius` for the thickness of the ring band (default 1m).\nLike `radius`, it animates: `fade`/`jump` open and close the ring around the listener.\nExample: `ring 8`, `ring 6to10`, or `ring fade 20 3 every 30`',
    },
    {
        name: 'scatter', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'box|disc|sphere|shell <m> [m] [m]',
        documentation: 'Where MANY sources are; the spawn distribution a multi-voice statement draws each instance\'s position from, as an offset from where it was placed.\n`radius` is how big ONE source sounds; a flock is not one wide bird. With `scatter`, `40 * oneshot crow` is forty birds spread through the canopy instead of forty birds standing on the same spot.\nShapes: `box <hx> [hy] [hz]` (half-extents, one number = a cube) · `disc <r>` (flat, horizontal) · `sphere <r>` (a filled ball) · `shell <inner> [outer]` (a hollow ball: a dome of gulls, a ring of frogs at one distance). Filled shapes are sampled evenly by VOLUME, so a scatter does not clump at its centre.\nA loop draws its offset once. A ONE-SHOT redraws on every fire, which is what turns `count` + `every` into a particle emitter.\nIgnored on `at`-hosted and entity-member voices: those already have a body deciding where they are.\nExample: `40 * oneshot gen a crow call` / `  place ahead far high` / `  scatter sphere 25` / `  every 4to20` / `  spread 0to0.4`',
    },
    {
        name: 'spread', grammar: 'range', group: 'default', clamp: [0, 60],
        parse: { kind: 'range', field: 'spread' },
        detail: 'seconds | range',
        documentation: 'Per-instance random start DELAY, in seconds; the difference between forty crows and one loud crow.\nWithout it every copy of a `40 * oneshot` statement fires on the same sample, which reads as a single transient. `spread 0to0.4` scatters them over 400 ms and the flock startles.\nA loop draws its delay once; a one-shot redraws on every fire, so a scattered emitter never lands in lockstep.\nDifferent from `random_start`, which moves where playback starts INSIDE the buffer rather than when the voice sounds.\nExample: `spread 0.3` or `spread 0to0.4`',
    },
    {
        name: 'bed', grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'bed' },
        detail: 'flag',
        documentation: 'A non-localized stereo bed: the sound exists everywhere in the scene with NO position to track; the right choice for roomtone, air, distant city rumble.\nUnlike `field` (which keeps a direction), a bed is fully enveloping, decorrelated stereo with no distance behavior at all. There should never be a single point to walk around for a roomtone; this is how you say that.',
    },
    {
        name: 'tilt', grammar: 'scalar', group: 'default', clamp: [-24, 24],
        parse: { kind: 'scalar', field: 'tilt', hint: `'tilt' takes a shelf gain in dB, e.g. "tilt -6"` },
        detail: 'dB above 2 kHz',
        documentation: 'The colour of a `bed`: a high shelf above 2 kHz, in dB. Real recordings of places have their highs 8 to 26 dB under their lows (blind listening round 1, 2026-10-12), so a bed with no `tilt` gets the engine default of -6 dB; `tilt 0` is flat, `tilt -12` darker. Ignored on a voice that is not a bed.\nExample: `loop gen still air in a stone church\n  bed\n  tilt -10`',
    },
    {
        name: 'music', grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'music' },
        detail: 'flag',
        documentation: 'Generate this voice as MUSIC rather than a sound effect: a score that supports the scene (a drone under a jungle, a slow pad under a city at night), not a sound in it.\nPair it with `bed` so it is heard everywhere and placed nowhere: `loop gen slow warm drone, distant strings` then `music` and `bed` on the property lines. The take comes from the music model and is longer than a sound effect (a minute by default).',
    },
    {
        name: 'synth', grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'synth' },
        detail: 'flag',
        documentation: 'Use the synthesizer for this voice. New takes carry a patch played live by Csound in the browser; native and offline exports use compatible baked audio. A live loop continues indefinitely; duration sets its progression cycle. Pitch, synth_brightness and synth_tempo can follow scene signals. Old takes without a patch need regeneration.\nPair with bed for ambient music under a scene, or position the voice for a synthesized object sound.\nExample: `loop synth slow ambient progression, warm pads, sparse glass notes\n  bed`',
    },
    {
        name: 'voice', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<voice id>',
        documentation: 'Render this voice with a SPEECH synthesiser using the named upstream voice, rather than the sound generator: what makes an `on speak gen {text}` voice say the words instead of generating a noise like them. The id is an opaque handle from the speech provider; an empty or unknown one falls back to the scene default. Speech is never captured into the community library.\nExample: `voice JBFqnCBsd6RMkjVDRZzb`',
    },
    {
        name: 'zone', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<name> [name…] [strict]',
        documentation: 'Scene-state membership. Names are an OPEN vocabulary; the scene or game decides what states exist (set via `SatieEngine.setSceneState`).\nWhen the current state matches none of the names: a `strict` voice crossfades to silence; a non-strict voice is occluded by the state\'s isolation (rain heard muffled through a wall).\nExample: `zone cabin strict`, or `zone forest porch`.',
    },
    {
        name: 'heard_in', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<signal> <dB> [, <signal> <dB>…]',
        documentation: 'How much louder or quieter this sound is heard while you are in a soundscape: its level moves by the dB weighted by the signal (0 to 1), so it eases as you walk in and out. `!name` reads 1 minus the signal. For a world-layer sound (one recording and one level everywhere), this is how a soundscape\'s variant sets how loud it is heard there.\nExample: `heard_in indoors -12` (the cicadas quieter inside), or `heard_in !indoors -6, in_shrine -14`',
    },
    {
        name: 'in', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<room>',
        documentation: 'Acoustic room membership: the voice takes its reverb from the named `room` declaration instead of the scene-wide one.\nExample: `in kitchen` under a `room kitchen` block gives this voice the kitchen\'s derived acoustics: an interior voice sounds like its interior while the street keeps the street.\nThe author-wins ladder holds: a voice\'s own `reverb` beats its room; the named room beats the first declared room (scene-wide) and the measured world room.',
    },
    {
        name: 'occlusion', follows: true, grammar: 'custom', group: 'default', clamp: [0, 1],
        parse: { kind: 'custom' },
        detail: '0–1 | follow <signal> …',
        documentation: 'Geometry-independent muffle (0 = clear, 1 = fully occluded).\nStatic: `occlusion 0.4`. Signal-driven: `occlusion follow cover 0to1 0to0.5` shades a voice from a game-supplied channel.',
    },
    {
        name: 'variants', grammar: 'scalar', group: 'default', clamp: [1, 8],
        parse: { kind: 'custom' },
        detail: '2–8 distinct takes',
        documentation: 'Pool that many DISTINCT generated takes for one gen voice, so a repeated event never plays the same clip twice in a row: each oneshot fire picks a random take (never the one that just played), a loop settles on one at load. Playback starts as soon as the first take lands; the rest join as they arrive. Generation cost scales with the count.\nExample: `oneshot gen a single car horn honk` / `  at avenue pass` / `  every 6to25` / `  variants 4`',
    },
    {
        name: 'doppler', grammar: 'scalar', group: 'default', clamp: [0, 4],
        parse: { kind: 'custom' },
        detail: '0–4 (default 1)',
        documentation: 'Strength of the automatic Doppler pitch shift from motion relative to the listener.\n`doppler 0` disables it; `doppler 2` exaggerates it; bare `doppler` = physical (1).\nExample: `doppler 1.5`',
    },
    // ── Triggering ──────────────────────────────────────────────
    {
        // Not inheritable: `parseSingle` converts a oneshot to kind `trigger` when a
        // `when` is present, and groups flush AFTER that conversion — inheriting it
        // would set the condition on a voice whose kind was never converted.
        name: 'when', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<signal> <lo>to<hi>',
        documentation: 'Edge-triggered condition: the voice fires when the signal ENTERS the band (and again only after leaving it + cooldown). Turns a oneshot into a signal-triggered voice; on an `on` voice it gates the event.\nExample: `when distance 0to3`: fires as the listener comes within 3m.',
    },
    {
        name: 'cooldown', grammar: 'range', group: 'default',
        parse: { kind: 'range', field: 'cooldown' },
        detail: 'seconds | range',
        documentation: 'Minimum time between fires of a trigger voice (`on`/`when`).\nExample: `cooldown 0.13` for footsteps, `cooldown 8` for a startled bird.',
    },
    {
        name: 'within', grammar: 'scalar', group: 'default', clamp: [0, 10000],
        parse: { kind: 'scalar', field: 'within', hint: `'within' takes a distance in metres, e.g. "within 25"` },
        detail: 'meters',
        documentation: 'An `on <event>` voice answers only events that happened within this many metres of it. Events carry the position they were broadcast from (`emit`, a footstep, a game bridge).\nExample: `on horn gen pigeons taking off in a clatter of wings` / `  within 25`',
    },
    {
        name: 'responders', grammar: 'scalar', group: 'default', clamp: [0, 48],
        parse: { kind: 'scalar', field: 'responders', hint: 'responders takes a maximum number of responding actors' },
        detail: 'maximum actors (0 = all)',
        documentation: 'Limit an on-event response to this many actors sharing the sound. Excludes the actor that emitted the event. Combines with within, cooldown, respond_chance and spread for coordinated interactions; 0 preserves broadcast behavior.',
    },
    {
        name: 'respond_chance', grammar: 'scalar', group: 'default', clamp: [0, 1],
        parse: { kind: 'scalar', field: 'respondChance', hint: 'respond_chance takes a probability from 0 to 1' },
        detail: '0–1',
        documentation: 'Probability of answering a broadcast, drawn once for this source across its actors. Unlike chance, this is evaluated per event. Use responders 1 to avoid every child reacting to every splash.',
    },
    {
        name: 'emit', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<event>',
        documentation: 'When this sound actually starts (a fire, a loop start), broadcast the named event from the voice\'s position, so `on <event>` voices can answer it. Open vocabulary: the script decides what a horn means to the pigeons.\nExample: `oneshot gen a single car horn honk, close, dry` / `  chance 0.15` / `  emit horn`',
    },
    {
        // Not inheritable: it converts a oneshot member into a parked trigger at
        // parse time (like `when`), and only means something inside an `entity`.
        name: 'chance', grammar: 'scalar', group: 'none', clamp: [0, 1],
        parse: { kind: 'scalar', field: 'chance', hint: `'chance' takes a probability 0–1, e.g. "chance 0.15"` },
        detail: '0–1 (entity members)',
        documentation: 'Inside an `entity` block: a oneshot member WITHOUT `every` fires ONCE per instance life with this probability, at a random moment: for a route instance uniformly within the middle 60 % of its run, for a population instance within its first 60 s. A member WITH `every` repeats instead and ignores `chance`.\nExample: `oneshot gen a single car horn honk, close, dry` / `  chance 0.15`',
    },
    // ── Playback flags ──────────────────────────────────────────
    { name: 'overlap', grammar: 'flag', group: 'default', detail: 'flag', documentation: 'Allow overlapping retriggers (oneshot only).',
        parse: { kind: 'flag', field: 'overlap' } },
    { name: 'persistent', grammar: 'flag', group: 'default', detail: 'flag', documentation: 'Keep the voice alive even when it stops playing.',
        parse: { kind: 'flag', field: 'persistent' } },
    { name: 'mute', grammar: 'flag', group: 'default', detail: 'flag', documentation: 'Mute this voice (parsed but not played).',
        parse: { kind: 'flag', field: 'mute' } },
    { name: 'solo', grammar: 'flag', group: 'default', detail: 'flag', documentation: 'Solo this voice (mute all others).',
        parse: { kind: 'flag', field: 'solo' } },
    {
        name: 'randomstart', aliases: ['random_start'], grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'randomStart' },
        detail: 'flag', insertText: 'randomstart',
        documentation: 'Start playback at a random position in the audio file.',
    },
    {
        name: 'in_order', aliases: ['inorder'], grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'takesInOrder' },
        detail: 'flag', insertText: 'in_order',
        documentation: 'Play landed takes in order, wrapping to the first after the last. Applies to variants and per-surface template banks. Trigger preparation does not consume a turn.',
    },
    // ── Generation ──────────────────────────────────────────────
    {
        name: 'influence', grammar: 'range', group: 'default',
        parse: { kind: 'custom' },
        detail: '0–1 | range',
        documentation: 'How strongly the AI generation follows its prompt (0–1).\nExample: `influence 0.4`',
    },
    { name: 'loopable', grammar: 'flag', group: 'default', detail: 'flag', documentation: 'Mark generated audio as loopable (crossfade-friendly).',
        parse: { kind: 'flag', field: 'genLoopable' } },
    // ── Visuals ─────────────────────────────────────────────────
    {
        name: 'visual', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'sphere|cube|trail|none [size N]',
        documentation: 'Visual representation in the 3D viewport.\nCombine tokens with spaces: `visual trail sphere`, `visual cube size 2`.\nValid tokens: trail, sphere, cube, none.',
    },
    {
        name: 'color', grammar: 'custom', group: 'special',
        parse: { kind: 'custom' },
        detail: '#hex | name | r g b',
        documentation: 'Voice color in the viewport.\n- Hex: `#ff3300`\n- Named: `red`, `blue`, `cyan`\n- RGB: `0.8 0.2 0.1`\n- Supports interpolation per channel.',
    },
    {
        name: 'alpha', grammar: 'scalar', group: 'default', clamp: [0, 1],
        parse: { kind: 'custom' },
        detail: '0–1',
        documentation: 'Voice opacity in the viewport. Supports interpolation.\nExample: `alpha 0.5` or `alpha fade 0 1 every 3`',
    },
    {
        name: 'background', aliases: ['bg'], grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '#hex | name | grayscale', insertText: 'background ',
        documentation: 'Set the viewport background color.\n- Hex: `background #1a1a2e`\n- Named: `background black`\n- Grayscale: `background 40`\n- RGB: `background 26,26,46`',
    },
    // ── DSP ─────────────────────────────────────────────────────
    {
        name: 'reverb', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'wet size damping',
        documentation: 'Convolution reverb.\n- `wet` 0–1 (dry/wet mix)\n- `size` 0–1 (room size)\n- `damping` 0–1 (high-frequency absorption)\nExample: `reverb wet 0.4 size 0.7 damping 0.5`',
    },
    {
        name: 'delay', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'wet time feedback [pingpong]',
        documentation: 'Delay effect.\n- `wet` 0–1\n- `time` seconds\n- `feedback` 0–1\n- `pingpong <0–1>` (values above 0.5 enable it)\nExample: `delay wet 0.3 time 0.25 feedback 0.5`',
    },
    {
        name: 'filter', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'type cutoff resonance [wet]',
        documentation: 'Audio filter.\nTypes: `lowpass`, `highpass`, `bandpass`, `notch`, `peak`\nExample: `filter lowpass cutoff 800 resonance 2`',
    },
    {
        name: 'distortion', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'type drive [wet]',
        documentation: 'Distortion effect.\nTypes: `softclip`, `hardclip`, `tanh`, `cubic`, `asymmetric`\nExample: `distortion softclip drive 4`',
    },
    {
        name: 'eq', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'low mid high',
        documentation: '3-band EQ.\n- `low` (320 Hz shelf)\n- `mid` (1 kHz peak)\n- `high` (3.2 kHz shelf)\nExample: `eq low 0.7 mid 0.5 high 0.3`',
    },
    // ── Transform (scene-graph spec §3) ─────────────────────────
    {
        name: 'rotate', grammar: 'scalar', group: 'none', clamp: [-360, 360],
        parse: { kind: 'scalar', field: 'rotateDeg', hint: `'rotate' takes degrees of yaw (0 = facing ahead), e.g. "rotate 30"` },
        detail: 'degrees (0 = facing ahead)',
        documentation: 'The source\'s yaw in degrees: 0 faces +Z (ahead), positive turns toward +X (right). Composes into an attached child\'s local offset; directivity comes later.\nExample: `rotate 30`',
    },
    {
        name: 'scale', grammar: 'scalar', group: 'none', clamp: [0.05, 100],
        parse: { kind: 'scalar', field: 'scaleFactor', hint: `'scale' takes a uniform scalar (1 = as written), e.g. "scale 1.5"` },
        detail: 'uniform scalar (1 = as written)',
        documentation: 'Uniform scale, multiplying the source\'s EXTENT (`radius`/`ring`) and nothing else: never loudness or attenuation distance. A 2× fountain IS a bigger ring; it is not a louder one. Composes multiplicatively down attachments.\nExample: `scale 1.5`',
    },
    {
        name: 'attach', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<voice | listener>',
        documentation: 'Parent this voice to another scene node; it rides the parent\'s motion. `place` under an attached voice is PARENT-RELATIVE (rotated by the parent\'s yaw, scaled with it). One level deep: an attach target cannot itself be attached.\n- `attach ferry`: ride the voice written as `loop ferry` (name a gen voice with a `gen ferry` block to make it addressable)\n- `attach listener`: ride the listener at the placed offset\nExample: `gen ferry` / `  prompt a boat engine, dry` / … / `loop ferry` / … / `attach ferry` / `  place 0 1.4 -2`',
    },
    {
        name: 'follow', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<voice | listener> [offset x y z]',
        documentation: 'Track a target\'s position WITHOUT adopting its scale or lifecycle; the constraint-flavoured alternative to `attach`. The offset is held in the target\'s yaw frame. Name a gen voice with a `gen <name>` block to make it a target.\nExample: `follow porter offset 0 0 -1.5`',
    },
    {
        name: 'at', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<id | class | strip | patch | overhead | ground> [top|base|inside] [pass]',
        documentation: 'Bind the voice to something in the script\'s `world` block; the sound comes FROM the thing.\n- `at oak_12`: fixed on that instance\n- `at oak`: an object class: oneshots fire from a random instance each time (a chorus across the trees), loops sit on the nearest one; add `top`, `base` or `inside` for where on it (`at walkup inside` = heard through the walls)\n- `at brook` / `at avenue`: a strip: the nearest stretch, followed as you move (pair with `line`)\n- `at avenue pass`: a thing TRAVELLING along the strip (a car, a boat, a train): each fire runs the road past you; the speed follows the strip\'s `flow`: and Doppler comes from its own motion. A horn `at avenue pass` IS a car going by\n- `at pond`: a patch: around its rim (pair with `ring`)\n- `at overhead`: whatever body is above the listener (rain on leaves, on an awning)\n- `at ground`: a random ground point per fire\nWithout a `world` block the voice keeps its `place`.\nExample: `oneshot gen a robin singing` / `  at oak top` / `  every 4to9`',
    },
    {
        name: 'active', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<h>to<h> [<h>to<h>…]',
        documentation: 'Hours of the day (0–24) the voice is audible in; outside them it fades to silence. Read against the world\'s `hour` signal (set by the `world` block\'s `time`).\nA dawn chorus is `active 4.5to9`; crickets are `active 19to24 0to5`.\nExample: `active 4.5to9`',
    },
    {
        name: 'line', grammar: 'flag', group: 'default',
        parse: { kind: 'flag', field: 'line' },
        detail: 'flag',
        documentation: 'The source is a LINE: a river, a road, surf along a shore. Level falls about 3 dB per doubling of distance instead of 6, because you always hear a stretch of it, not a point.\nPair with `at water` so the nearest point is followed as you move, and `radius` for how wide it reads up close.\nExample: `loop gen a shallow stream over pebbles` / `  at water` / `  line` / `  radius 2`',
    },
    {
        name: 'pace', follows: true, grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: 'follow <signal> <in> <out>',
        documentation: 'Scale a oneshot\'s `every` interval by a signal, re-read at every fire: the output is a MULTIPLIER on the interval.\nCrickets chirp faster as it warms: `pace follow temp 10to30 3to0.6` (three times slower at 10 °C, faster than written at 30 °C). Birds call less often as the wind rises: `pace follow wind 0to1 1to4`.\nExample: `pace follow temp 10to30 3to0.6`',
    },
    {
        name: 'quiet', grammar: 'custom', group: 'default',
        parse: { kind: 'custom' },
        detail: '<signal> <threshold> [<signal> <threshold>…]',
        documentation: 'Signal level above which the voice fades out: any signal: the world\'s `rain` / `wind`, or a scene control the `world` block defines (`control traffic …`).\nSongbirds go quiet in a downpour: `quiet rain 0.5`. Insects stop in a gale: `quiet wind 0.7`. A bird you cannot hear over the rush hour: `quiet traffic 0.9`.\nExample: `quiet rain 0.5 wind 0.8`',
    },
];
/** Canonical name → spec, plus every alias → the same spec. */
/**
 * concern per property — one table, applied onto the specs below. The
 * conformance suite asserts every property appears here: a new property
 * without a concern is a red test, not a silent 'meta'.
 */
export const PROPERTY_CONCERNS = {
    gen_key: 'gen',
    recordings: 'gen',
    source_id: 'meta',
    program: 'meta',
    source_role: 'meta', catalog_ref: 'meta',
    volume: 'mix', spl: 'mix', pitch: 'mix', heard_in: 'mix',
    start: 'time', end: 'time', duration: 'time', fade_in: 'time', fade_out: 'time',
    every: 'time', spread: 'time', pace: 'time', active: 'time', quiet: 'time',
    when: 'trigger', cooldown: 'trigger', within: 'trigger', emit: 'trigger', chance: 'trigger', responders: 'trigger', respond_chance: 'trigger',
    place: 'transform', at: 'transform', attach: 'transform', rotate: 'transform', scale: 'transform',
    move: 'motion', follow: 'motion',
    field: 'extent', radius: 'extent', ring: 'extent', bed: 'extent', line: 'extent', scatter: 'extent',
    tilt: 'acoustics', // a bed's colour, read with what the space does to the sound
    in: 'acoustics', occlusion: 'acoustics', doppler: 'acoustics', distance_model: 'acoustics',
    reverb: 'dsp', delay: 'dsp', filter: 'dsp', distortion: 'dsp', eq: 'dsp',
    voice: 'gen', variants: 'gen', influence: 'gen', loopable: 'gen', music: 'gen', synth: 'gen', synth_brightness: 'mix', synth_tempo: 'mix',
    visual: 'look', color: 'look', alpha: 'look', background: 'look',
    zone: 'meta', overlap: 'meta', persistent: 'meta', mute: 'meta', solo: 'meta', randomstart: 'meta', in_order: 'meta',
};
/**
 * Canonical format band per concern (scriptFormat's ordering — what the
 * source IS, WHERE it is, how LOUD, WHEN, what the space does, how it looks).
 */
export const CONCERN_RANK = {
    extent: 1, meta: 1, transform: 2, motion: 2, mix: 3,
    time: 5, trigger: 5.2, acoustics: 6, dsp: 6, gen: 6.4, look: 7,
};
/** Keys whose historical format position sits off their concern's band. */
const PROPERTY_ORDINALS = {
    loopable: 1, // a flag, formatted with the flags
    music: 1, // a flag, formatted with the flags (beside bed)
    synth: 1, // a flag, formatted with the flags (beside music)
    zone: 2, // scene scope reads beside position
    spl: 3, volume: 3.5, pitch: 4,
    when: 5, cooldown: 5, responders: 5, respond_chance: 5, // trigger conditions read with the timing block
    influence: 6, alpha: 6, // historical DSP-band position
    color: 8, background: 8, // color closes the block, after visual
};
/**
 * control per property — one table, applied onto the specs below, so the
 * mixer's editor is generated rather than hand-grown. Only properties whose
 * grammar defaults don't say enough appear here: a `flag` is a toggle and a
 * clamped `scalar` a slider on their own (see `controlFor`). Bounds are the
 * LANGUAGE's — what a value may be, not what a scene should choose.
 *
 * `text` entries are the deliberate escapes: values that ARE free text (a
 * prompt-like id, an open-vocabulary signal or zone name, a sub-grammar too
 * positional to widget). The conformance test pins this set — a new property
 * that lands in `text` accidentally is a red test, not a silent typing field.
 */
export const PROPERTY_CONTROLS = {
    recordings: { kind: 'text' },
    source_id: { kind: 'text' },
    gen_key: { kind: 'text' },
    program: { kind: 'text' },
    distance_model: { kind: 'select', options: ['legacy_v1', 'free_field_v1'] },
    source_role: { kind: 'select', options: ['ambience', 'source'] },
    catalog_ref: { kind: 'text' },
    // RangeOrValue tracks (two handles when the script writes `AtoB`).
    volume: { kind: 'range', min: 0, max: 1, step: 0.01 },
    synth_brightness: { kind: 'range', min: 0.05, max: 8, step: 0.05 },
    synth_tempo: { kind: 'range', min: 0.1, max: 4, step: 0.05 },
    pitch: { kind: 'range', min: 0.1, max: 4, step: 0.01 },
    start: { kind: 'range', min: 0, max: 120, step: 0.1 },
    duration: { kind: 'range', min: 0.1, max: 120, step: 0.1 },
    fade_in: { kind: 'range', min: 0, max: 20, step: 0.1 },
    fade_out: { kind: 'range', min: 0, max: 20, step: 0.1 },
    every: { kind: 'range', min: 0.1, max: 60, step: 0.1 },
    spread: { kind: 'range', min: 0, max: 10, step: 0.05 },
    cooldown: { kind: 'range', min: 0, max: 60, step: 0.1 },
    radius: { kind: 'range', min: 0, max: 100, step: 0.5 },
    ring: { kind: 'range', min: 0, max: 100, step: 0.5 },
    influence: { kind: 'range', min: 0, max: 1, step: 0.01 },
    // Custom grammars whose common form is still one number / one range.
    spl: { kind: 'range', min: 0, max: 140, step: 1 },
    occlusion: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    end: { kind: 'slider', min: 0, max: 600, step: 0.5 },
    // Counts, not continua — a stepper, never a slider.
    variants: { kind: 'stepper', min: 1, max: 8, step: 1 },
    // Transform + look.
    place: { kind: 'vec3', step: 0.1 },
    rotate: { kind: 'slider', min: -360, max: 360, step: 1 },
    scale: { kind: 'slider', min: 0.05, max: 10, step: 0.05 },
    alpha: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    color: { kind: 'color' },
    background: { kind: 'color' },
    visual: { kind: 'select', options: ['sphere', 'trail', 'cube', 'trail sphere', 'trail cube', 'none'] },
    // Vocabularies the SCENE supplies (paths, addressable voices) — the editor
    // fills `options` at runtime; the registry only names the widget.
    move: { kind: 'select' },
    attach: { kind: 'select' },
    follow: { kind: 'select' },
    // Compound DSP grammars: a leading mode where the grammar has one, then
    // named numeric parts — each a mini-slider, committed as one line.
    reverb: { kind: 'compound', parts: [
            { key: 'wet', min: 0, max: 1, step: 0.01 },
            { key: 'size', min: 0, max: 1, step: 0.01 },
            { key: 'damping', min: 0, max: 1, step: 0.01 },
        ] },
    delay: { kind: 'compound', parts: [
            { key: 'wet', min: 0, max: 1, step: 0.01 },
            { key: 'time', min: 0.01, max: 2, step: 0.01 },
            { key: 'feedback', min: 0, max: 0.95, step: 0.01 },
            { key: 'pingpong', min: 0, max: 1, step: 0.01 },
        ] },
    filter: { kind: 'compound', head: ['lowpass', 'highpass', 'bandpass', 'notch', 'peak'], parts: [
            { key: 'cutoff', min: 20, max: 20000, step: 1, log: true },
            { key: 'resonance', min: 0.1, max: 20, step: 0.1 },
            { key: 'wet', min: 0, max: 1, step: 0.01 },
        ] },
    distortion: { kind: 'compound', head: ['softclip', 'hardclip', 'tanh', 'cubic', 'asymmetric'], parts: [
            { key: 'drive', min: 0.1, max: 20, step: 0.1 },
            { key: 'wet', min: 0, max: 1, step: 0.01 },
        ] },
    eq: { kind: 'compound', parts: [
            { key: 'low', min: 0, max: 1, step: 0.01 },
            { key: 'mid', min: 0, max: 1, step: 0.01 },
            { key: 'high', min: 0, max: 1, step: 0.01 },
        ] },
    // Deliberate free-text escapes (the conformance test pins this set).
    voice: { kind: 'text' }, // an opaque provider voice id
    zone: { kind: 'text' }, // open scene-state vocabulary
    in: { kind: 'text' }, // a script-declared room name
    heard_in: { kind: 'text' }, // signal names and dB: an open vocabulary of soundscape signals
    at: { kind: 'text' }, // a world-block id + placement tokens
    when: { kind: 'text' }, // signal-band expression
    emit: { kind: 'text' }, // open event vocabulary
    pace: { kind: 'text' }, // follow-binding expression
    quiet: { kind: 'text' }, // signal-threshold list
    active: { kind: 'text' }, // hour-band list
    scatter: { kind: 'text' }, // positional shape sub-grammar
};
for (const p of PROPERTIES) {
    p.concern = PROPERTY_CONCERNS[p.name];
    p.ordinal = PROPERTY_ORDINALS[p.name];
    p.control = PROPERTY_CONTROLS[p.name];
}
/**
 * The widget for a property, defaults resolved: an explicit entry wins, a
 * `flag` is a toggle, a clamped `scalar` is a slider over its clamp, an
 * unclamped `scalar` or `range` a bare-bounds track, and anything left is
 * text. Never returns undefined — the editor always knows what to draw.
 */
export function controlFor(name) {
    const spec = PROPERTY_SPECS.get(name.toLowerCase());
    if (!spec)
        return { kind: 'text' };
    if (spec.control)
        return spec.control;
    if (spec.grammar === 'flag')
        return { kind: 'toggle' };
    if (spec.grammar === 'scalar') {
        const [min, max] = spec.clamp ?? [0, 100];
        return { kind: 'slider', min, max, step: max - min > 20 ? 1 : 0.01 };
    }
    if (spec.grammar === 'range') {
        const [min, max] = spec.clamp ?? [0, 60];
        return { kind: 'range', min, max, step: 0.1 };
    }
    return { kind: 'text' };
}
/**
 * Canonical seed VALUE per property — the DSL spelling a ghost row starts
 * from, so an unset property is a widget already holding a number, never an
 * empty input asking for grammar. Seeds describe the LANGUAGE's sensible
 * origin (a volume of 0.8, a scale of 1, an occlusion of 0 — clear), never a
 * scene's content; the ten open-vocabulary escapes (`zone`, `when`, `emit`…)
 * deliberately have none, because any seed would put words in the scene.
 * The conformance test pins the rule: every non-text control has a seed.
 */
export const PROPERTY_SEEDS = {
    distance_model: 'legacy_v1',
    source_role: 'source',
    volume: '0.8', spl: '60', pitch: '1', synth_brightness: '1', synth_tempo: '1',
    start: '0', end: '30', duration: '5', fade_in: '1', fade_out: '1',
    every: '2to6', spread: '0to0.4', cooldown: '1',
    radius: '3', ring: '6', influence: '0.3', occlusion: '0',
    variants: '3', doppler: '1', within: '25', chance: '0.5', responders: '1', respond_chance: '0.5', tilt: '-6',
    alpha: '1', rotate: '0', scale: '1', place: '0 1.5 0',
    visual: 'sphere', move: 'static', attach: 'listener', follow: 'listener',
    color: '#888888', background: '#f4f3ee',
    reverb: 'wet 0.3 size 0.5 damping 0.5',
    delay: 'wet 0.3 time 0.25 feedback 0.4',
    filter: 'lowpass cutoff 800 resonance 1',
    distortion: 'softclip drive 4',
    eq: 'low 0.5 mid 0.5 high 0.5',
};
/**
 * The seed value a ghost row for this property starts from. A flag seeds
 * empty (the key alone IS the value); a text escape returns null — there is
 * nothing honest to pre-fill an open vocabulary with, so its ghost is a
 * click-to-type affordance instead of a widget.
 */
export function seedFor(name) {
    const spec = PROPERTY_SPECS.get(name.toLowerCase());
    if (!spec)
        return null;
    if (spec.grammar === 'flag')
        return '';
    return PROPERTY_SEEDS[spec.name] ?? null;
}
/**
 * Unset properties every voice OFFERS as a ghost row without asking — the
 * ones a hand reaches for on most voices. Everything else the registry knows
 * sits one "more…" away as the same kind of ghost. Applicability by voice
 * shape (a `variants` ghost only on a generated voice, an `every` ghost not
 * on a loop) is the editor's call — it is a fact of the statement, and this
 * set stays plain data.
 */
export const OFFERED_GHOSTS = [
    'spl', 'every', 'radius', 'occlusion', 'variants', 'visual', 'move', 'reverb',
];
/** Unknown keys sort after DSP, before visuals — never last, never first. */
export const FORMAT_UNKNOWN_RANK = 6.5;
/**
 * The canonical format position of a property key (aliases resolve). This IS
 * the formatter's ordering — the hand-maintained RANK table in
 * lib/scriptFormat.ts was the sixth surface restating the grammar, and it
 * was missing sixteen properties.
 */
export function formatRank(key) {
    const spec = PROPERTY_SPECS.get(key.toLowerCase());
    if (!spec)
        return FORMAT_UNKNOWN_RANK;
    return spec.ordinal ?? (spec.concern ? CONCERN_RANK[spec.concern] : FORMAT_UNKNOWN_RANK);
}
export const PROPERTY_SPECS = new Map(PROPERTIES.flatMap(p => [p.name, ...(p.aliases ?? [])].map(n => [n, p])));
/** Every legal property name, canonical and aliased. Used for typo detection. */
export const KNOWN_PROPERTIES = new Set(PROPERTY_SPECS.keys());
/** Names that take no value — the key stands alone on its line. */
export const STANDALONE_FLAGS = new Set(PROPERTIES.filter(p => p.grammar === 'flag')
    .flatMap(p => [p.name, ...(p.aliases ?? [])]));
/** Names that ` and ` splits a property line on. */
export const PROPERTY_KEYWORDS = new Set(PROPERTIES.filter(p => p.splitOnAnd !== false)
    .flatMap(p => [p.name, ...(p.aliases ?? [])]));
/** Properties a group passes down to its children, by rule. */
export const INHERITED_PROPERTIES = new Set(PROPERTIES.filter(p => p.group !== 'none')
    .flatMap(p => [p.name, ...(p.aliases ?? [])]));
/** Look up a spec by canonical name or alias. */
export function propertySpec(name) {
    return PROPERTY_SPECS.get(name.toLowerCase());
}
/**
 * Properties of an `entity` block's OWN lines (between `entity <id>` and its
 * first member). These are entity-only — they mean nothing on a voice and are
 * deliberately NOT in `KNOWN_PROPERTIES` (`speed` is also a `move` sub-token
 * there). The rest reuse a voice property's spec: `at` names the body's host,
 * `every` the spawn interval, `pace` the interval multiplier, `active` /
 * `quiet` gate spawning, `variants` / `visual` / `spl` are inherited by
 * members, and `move fly|walk` is how a population relocates.
 *
 * The behavioural ones (`dwell` … `window`) are the agent layer
 * (world/EntityAgents.ts) — a population individual as a world-anchored
 * body that relocates perch to perch, flees, takes turns and drops out of
 * the voice budget when far. All numbers: the script (or the model) says
 * how a thing behaves; the engine never knows what it is.
 */
export const ENTITY_PROPERTIES = [
    {
        name: 'behavior', grammar: 'custom', group: 'none', parse: { kind: 'custom' },
        detail: '{"identity":"…","conditions":{},"actions":[{"name":"idle","goal":"rest","duration":[2,5]}]}',
        documentation: 'Authored identity and local action policy. Numeric conditions drift and action effects change them. Utility weights choose eligible actions at duration boundaries. Goals reuse call/rest/roam/flee movement. Optional animation names, member sound IDs and timed event cues share the action clock. hold selects an authored action. No model calls occur in the simulation loop.',
    },
    {
        name: 'body', grammar: 'custom', group: 'none', parse: { kind: 'custom' },
        detail: '{"parts":[{"shape":"ellipsoid","size":[1,1,1],"at":[0,0,0]}]}',
        documentation: 'Persistent visible geometry, independent of sounds. Alternatively {"rig":{"asset":"<trusted id>","heightM":<metres>}} uses a pinned rig with a derived physical proxy. Up to 12 box or ellipsoid parts, size and at in metres, +Z forward. Optional flap {angle,hz} rotates a part about local Z while travelling. A body may have no sound members.',
    },
    {
        name: 'count', grammar: 'scalar', group: 'none', clamp: [1, 48],
        parse: { kind: 'custom' },
        detail: '1–48 individuals (population)',
        documentation: 'How many individuals of a population entity live in the world (1–48, default 1), each perched on its own host object. Only the nearest `voices` of them are localised voices at once; the rest stay in the world (behaving, logged) without a panner. Ignored for a route entity (`at <strip> pass`).\nExample: `entity pigeon` / `  at walkup top` / `  count 3`',
    },
    {
        name: 'speed', grammar: 'range', group: 'none',
        parse: { kind: 'custom' },
        detail: 'm/s | range',
        documentation: 'Route: cruise speed, metres per second, drawn once per instance: without it the strip\'s `flow` decides: (4 + 16·flow) m/s, ±30 % per instance. Population: the speed of a relocation or flight (default 2to6).\nExample: `speed 6to18`',
    },
    {
        name: 'stop', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<chance> [<s>to<s>] (route)',
        documentation: 'Per pass, the probability that a route instance halts ONCE at a random point of the middle 70 % of the strip: it brakes at 3 m/s² to a standstill, idles for the given seconds (default 2to6), then accelerates at 2 m/s² back to cruise. Members bound to `velocity` fall silent and rise again with it.\nExample: `stop 0.25 2to6`',
    },
    {
        name: 'gait', grammar: 'range', group: 'none',
        parse: { kind: 'custom' },
        detail: 'metres per stride',
        documentation: 'The body walks: one footfall every this many metres it TRAVELS, so cadence is `speed / stride` and needs no binding: a body that speeds up steps faster, a body braking into a halt slows and then stops, a body standing still is silent. The stride is drawn per instance, so a population never marches in unison. Each footfall fires that body\'s own `on step` members from where it is standing, carrying the surface under it as `{text}` and the water there as `depth` / `liquid`, so one `on step` line covers every ground the body crosses.\nExample: `gait 0.7to0.82`',
    },
    {
        name: 'state', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<name> [<h>to<h> …] sounds <id>,<id>',
        documentation: 'A named condition of the entity and the member sounds heard in it (ids are the last segment of each member\'s `source_id`). Hours put it on the clock (the members\' own `active` lines carry them); a state with no hours is one the entity CAN be in, reached only by `hold`, and a sound named only in such states stays silent until then. Sounds named in no state are not affected. Names are slugs; repeat the line per state.\nExample: `state cruising 6to22 sounds engine,tyres` / `state honking sounds horn`',
    },
    {
        name: 'hold', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<state name>',
        documentation: 'Keep the entity in one of its `state`s: the sounds in that state play at every hour, the sounds in its other states are silent, sounds in no state are untouched. Remove the line to go back to the clock.\nExample: `hold honking`',
    },
    {
        name: 'dwell', grammar: 'range', group: 'none',
        parse: { kind: 'custom' },
        detail: 'seconds | range (population)',
        documentation: 'How long an individual stays at a perch before it relocates (default 60to240). Writing it turns relocation on: when the bout ends the body moves to another anchor of its host: another object of the class, another point of the strip, another ground point: along a real segment, never a teleport. Timed oneshot members are held in flight.\nExample: `dwell 40to180`',
    },
    {
        name: 'relocate', grammar: 'range', group: 'none',
        parse: { kind: 'custom' },
        detail: 'metres | range (population)',
        documentation: 'How far a relocation goes: the next perch is drawn among the host\'s free anchors within this band of the current one (default 5to30). Writing it turns relocation on. A startled body flees up to twice the top of the band.\nExample: `relocate 8to30`',
    },
    {
        name: 'startle', grammar: 'custom', group: 'none',
        parse: { kind: 'custom' },
        detail: '<m> [<s>to<s>] (population)',
        documentation: 'Flee when the listener: or any positioned event (a footstep, an `emit`): comes within this many metres: the body flies or walks to a farther free anchor at 1.6× its speed, then keeps silent for the hush (default 8to20 s) before calling again. 0 = never (the default). The instance\'s own `on startle` / `on perch` members sound the flight and the landing.\nExample: `startle 6 10to30`',
    },
    {
        name: 'call', grammar: 'scalar', group: 'none', clamp: [0, 1],
        parse: { kind: 'custom' },
        detail: '0–1 (population)',
        documentation: 'Probability that a bout at a perch is a CALLING bout (timed oneshot members fire) rather than a silent one (default 1). A bout lasts `dwell`.\nExample: `call 0.6`',
    },
    {
        name: 'callers', grammar: 'scalar', group: 'none', clamp: [0, 48],
        parse: { kind: 'custom' },
        detail: '<n> at once (population)',
        documentation: 'Turn-taking: at most this many individuals of the entity sound a timed call at once (0 = unlimited, the default). A call that may not start now is retried a moment later, never dropped. A chorus of crickets is `callers 0`; a pair trading phrases is `callers 1`.\nExample: `callers 2`',
    },
    {
        name: 'gap', grammar: 'range', group: 'none',
        parse: { kind: 'custom' },
        detail: 'seconds | range (population)',
        documentation: 'Minimum silence between two call starts across the whole entity (default 0), so individuals answer one another instead of overlapping.\nExample: `gap 1to4`',
    },
    {
        name: 'voices', grammar: 'scalar', group: 'none', clamp: [0, 48],
        parse: { kind: 'custom' },
        detail: '<n> localised (population)',
        documentation: 'The voice budget: only the nearest N individuals within `window` metres of the listener get member tracks; the others stay in the world: positioned, relocating, startling, logged: without a panner, and their number is published as the signal `<entity>_far` for a bed to `volume follow`. 0 = every individual (the default). As the listener moves, individuals coming into range are promoted where they stand.\nExample: `voices 4`',
    },
    {
        name: 'sway', grammar: 'scalar', group: 'none', clamp: [0, 5],
        parse: { kind: 'custom' },
        detail: 'metres (population)',
        documentation: 'How far a PERCHED individual shifts while it stands there: a slow, non-repeating drift on the spot (default 0, perfectly still). A standing person is never quite still: they shift their weight, turn, take half a step back. A body frozen to the centimetre between relocations reads as a statue. It is not travel: it never counts toward `gait`, so nobody walks on the spot, and a bird on a branch (which really is still) keeps the default.\nExample: `sway 0.25`',
    },
    {
        name: 'window', grammar: 'scalar', group: 'none', clamp: [1, 5000],
        parse: { kind: 'custom' },
        detail: 'metres (population)',
        documentation: 'Listener distance beyond which an individual is demoted out of the voice budget (default 120: about the detection radius of a forest bird). A voiced individual keeps its voice out to 1.15× the window so the edge never flaps.\nExample: `window 60`',
    },
];
/** Every name legal on an entity block's own lines. */
export const ENTITY_PROPERTY_NAMES = new Set([
    ...ENTITY_PROPERTIES.map(p => p.name),
    // `roam fly|walk` is the canonical relocation spelling; `move` stays a
    // permanent alias (on a voice the same word means a wander region — the
    // one line-slot collision the rename retires, scene-graph spec §9).
    'at', 'every', 'pace', 'active', 'quiet', 'variants', 'visual', 'spl', 'move', 'roam',
    // The body's transform reuses the voice spellings: `rotate <deg>`, `scale <x>`.
    'rotate', 'scale',
]);
/**
 * Sub-tokens that live INSIDE another property's value (`move ... speed 2`,
 * `visual sphere size 2`). They are deliberately NOT properties: writing one at
 * property level is a mistake, and keeping them out of `KNOWN_PROPERTIES` is
 * what lets the typo warning fire on it. Listed here only so the editor can
 * still offer and document them.
 */
export const SUB_TOKENS = [
    { label: 'speed', parent: 'move', detail: '0.01–10 | range', documentation: 'Movement speed for `move` (Hz).\nExample: `move orbit speed 0.5`' },
    { label: 'noise', parent: 'move', detail: '0–1', documentation: 'Trajectory jitter for `move`, 0–1.\nExample: `move fly noise 0.3`' },
    { label: 'glyph', parent: 'visual', detail: '0.01–10', documentation: 'Visual scale multiplier for `visual`; the drawn mesh only, never the acoustic extent (that is `scale`).\nExample: `visual sphere glyph 2`' },
    { label: 'size', parent: 'visual', detail: '0.01–10', documentation: 'Alias of `glyph`: kept forever so old scripts keep parsing; `glyph` is canonical (frees `size` from the DSP param and the transform `scale`).\nExample: `visual sphere size 2`' },
    { label: 'prompt', parent: 'gen', detail: 'text', documentation: 'Generation prompt, inside a `gen <name>` block.\nExample:\n`gen wind`\n`  prompt howling arctic wind`' },
];
//# sourceMappingURL=Properties.js.map