import { DoubleSide, Group, Scene, Raycaster, Vector2, LineBasicMaterial, LineSegments, LineLoop, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, OrthographicCamera,
  PlaneGeometry, SphereGeometry, TorusGeometry, Vector3, MathUtils } from 'three';
import { voiceColor, soundAction } from './lib/devtools/index.js';
import { revealObjectSounds, fullObjectLabel } from './lib/edit/sceneMap.js';

/*
 * The mixer's sound layer in a Three.js world (satie-runtime/three `locate`). Dev only.
 * Opening the mixer keeps the game as it renders; focus mode dims everything the game
 * drew under one dark veil so only the sound layer stands out. The layer draws every
 * positioned voice the way the app does (viewport/voices.tsx): an orb in its voice
 * colour with a name pill, a faint wireframe sphere for `radius`, a torus for `ring`,
 * a band for a line source (its orb at your nearest point on the line); beds are not
 * drawn in the world. Declared additions (2026-09-26/28 prototype): hover linked with
 * the mixer rows, click to isolate, an edge arrow to a selected source off screen, a
 * group tag, a hollow orb for a source that exists but is silent now, double-click to
 * turn toward a source, a burst when a voice fires.
 *
 *   const layer = locate(audio, { scene, camera, renderer, look });
 *   devtools(audio.engine, { ..., locate: layer });
 *   // each frame, after the game renders:
 *   layer.render();
 *
 * `look` is optional: { get: () => ({ yaw, pitch }), set: (yaw, pitch) => void } for a
 * yaw/pitch first-person camera (facing -Z at yaw 0). With it, double-click turns the
 * view and a drag on the world looks around while the mixer is open.
 * `teleport(x, z, yaw, targetY)` enables "go there". `position: () => ({ x, z, yaw? })` is where
 * the player stands (scene units) and faces (the layer's yaw) for a third-person game, whose
 * camera is not the player: "go" walks and turns from there. Without it the camera is taken as
 * the player (first person).
 */
const VEIL = '#0b0b0a';         // focus mode: the dark the world recedes into
const VEIL_OPACITY = 0.62;
const CSS = `
.satie-loc{--satie-ui:Inter,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;position:fixed;inset:0;z-index:2147482990;pointer-events:none;opacity:0;transition:opacity .35s ease;font-family:var(--satie-ui);-webkit-font-smoothing:antialiased}
.satie-loc[data-on="1"]{opacity:1}
.satie-loc[data-on="0"] *{pointer-events:none !important}
.satie-loc .src{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;transition:opacity .3s ease;--c:#ff8da1;user-select:none;-webkit-user-select:none}
.satie-loc .src__dot{position:absolute;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;border-radius:50%;background:var(--c);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--c) 22%,transparent),0 0 12px 3px color-mix(in srgb,var(--c) 60%,transparent)}
.satie-loc .src{--lv:.6}
.satie-loc .src__dot{opacity:calc(.45 + var(--lv) * .55);box-shadow:0 0 0 2px rgba(13,12,11,.75),0 0 calc(4px + var(--lv) * 16px) calc(var(--lv) * 5px) color-mix(in srgb,var(--c) 70%,transparent) !important}
.satie-loc .src[data-silent="1"] .src__dot{box-shadow:none !important}
.satie-loc .src[data-dark="1"] .src__dot{background:color-mix(in srgb,var(--c) 30%,#1a1918);box-shadow:none !important;opacity:.9}
.satie-loc .src[data-hint="1"] .src__dot{width:10px;height:10px;margin:-5px 0 0 -5px;opacity:.55;box-shadow:0 0 6px 1px color-mix(in srgb,var(--c) 40%,transparent)}
.satie-loc .src[data-hint="1"] .src__label,.satie-loc .src[data-hint="1"] .src__lead{display:none !important}
.satie-loc .src[data-copy="1"]:not([data-hover="1"]):not([data-sel="1"]) .src__label,.satie-loc .src[data-copy="1"]:not([data-hover="1"]):not([data-sel="1"]) .src__lead{display:none !important}
.satie-loc .src[data-silent="1"] .src__dot{background:transparent;border:1.5px solid var(--c);box-shadow:0 0 8px 1px color-mix(in srgb,var(--c) 35%,transparent)}
.satie-loc .src__label{position:absolute;left:12px;top:-9px;width:max-content;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:500 11px/18px var(--satie-ui);color:#ebe7df;
  padding:0 7px;border-radius:999px;background:rgba(13,12,11,.78);border:1px solid color-mix(in srgb,var(--c) 35%,transparent);transition:transform .15s ease}
.satie-loc .src__label small{font-weight:400;opacity:.6;margin-left:5px}
.satie-loc .src[data-thing="1"] .src__dot{border-radius:3px;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;background:transparent;border:1.5px solid #ebe7df;box-shadow:none !important;opacity:.9}
/* a thing's square lights exactly as its header icon in the mixer does (one rule, one colour): empty when
   silent, dim mint while it plays under the loudest you hear, bright mint with a glow while it is heard */
.satie-loc .src[data-thing="1"][data-silent="0"] .src__dot{background:#ff8da1;border-color:#ff8da1;box-shadow:0 0 0 2px rgba(13,12,11,.75),0 0 10px 3px rgba(255,141,161,.6) !important}
.satie-loc .src[data-thing="1"][data-silent="0"][data-dark="1"] .src__dot{background:color-mix(in srgb,#ff8da1 35%,#2a2927);border-color:color-mix(in srgb,#ff8da1 60%,#2a2927);box-shadow:none !important}
/* as in the mixer: a thing is warm white, a sound's name is mint (its voice colour with the mixer's sage) */
.satie-loc .src:not([data-thing="1"]) .src__label{color:color-mix(in srgb,var(--c) 35%,#ebe7df)}
.satie-loc .src[data-thing="1"] .src__label{border-radius:4px;border:1px solid rgba(235,231,223,.55);background:rgba(13,12,11,.9);font-weight:500;letter-spacing:.02em}
.satie-loc .src[data-thing="1"] .src__label small{font-weight:400;letter-spacing:0}
/* a picked thing pulses warm white (its square has no glow to pulse, and things are not green) */
.satie-loc .src[data-thing="1"][data-sel="1"] .src__dot{outline:1.5px solid rgba(235,231,223,.55);animation:satie-loc-thing 1.6s ease-in-out infinite}
@keyframes satie-loc-thing{0%,100%{outline-offset:2px;outline-color:rgba(235,231,223,.6)}50%{outline-offset:7px;outline-color:rgba(235,231,223,0)}}
.satie-loc .src__label em{display:block;font-style:normal;font-weight:400;font-size:10.5px;line-height:15px;color:var(--c);padding-bottom:3px}
.satie-loc[data-sel="1"] .src:not([data-sel="1"]){opacity:.18}
.satie-loc .src[data-sel="1"] .src__dot{width:20px;height:20px;margin:-10px 0 0 -10px;animation:satie-loc-pulse 1.6s ease-in-out infinite}
.satie-loc .src[data-hover="1"]{opacity:1 !important}
.satie-loc .hoverdim{position:absolute;inset:0;z-index:0;background:rgba(0,0,0,.34);opacity:0;pointer-events:none;transition:opacity .18s ease}
.satie-loc[data-hovering="1"] .hoverdim{opacity:1}
.satie-loc[data-hovering="1"] .src:not([data-hover="1"]){opacity:.22}
.satie-loc .src__lead{position:absolute;left:0;top:0;height:1.5px;transform-origin:0 50%;background:color-mix(in srgb,var(--c) 85%,transparent);pointer-events:none;display:none}
.satie-loc .src[data-hover="1"] .src__label,.satie-loc .src[data-sel="1"] .src__label{background:rgba(13,12,11,.92);border-color:var(--c);font-size:12px;line-height:20px;border-radius:10px;padding:0 9px;white-space:normal;width:max-content;max-width:320px}
.satie-loc .src[data-hover="1"] .src__dot{width:18px;height:18px;margin:-9px 0 0 -9px}
@keyframes satie-loc-pulse{0%,100%{box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 28%,transparent),0 0 14px 4px color-mix(in srgb,var(--c) 65%,transparent)}
  50%{box-shadow:0 0 0 9px color-mix(in srgb,var(--c) 8%,transparent),0 0 26px 8px color-mix(in srgb,var(--c) 80%,transparent)}}
.satie-loc .shape-h{position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:3px;background:#0d0c0b;border:2px solid #ebe7df;pointer-events:auto;cursor:grab;z-index:100002;box-shadow:0 0 0 3px rgba(235,231,223,.18)}
.satie-loc .shape-h[data-handle="mid"]{border-radius:50%;background:#ebe7df}
.satie-loc[data-dragging="1"] .shape-h{cursor:grabbing}
.satie-loc .ghost{position:absolute;left:0;top:0;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--c);pointer-events:none;--c:#ff8da1;box-shadow:0 0 8px 1px color-mix(in srgb,var(--c) 55%,transparent)}
.satie-loc .src[data-steps="1"] .src__dot{opacity:0}
/* a ripple means something happened just now (2026-11-09, Huanxing: "ripple = event"): a one-off fired or a
   sound started. Steady sounds only glow. Two rings over about 1.6 s, wider the louder it is where you stand (--lv);
   a thing's rings are its Rose Noise, a sound's its voice colour */
.satie-loc .src[data-fire="1"] .src__dot::after,.satie-loc .src[data-fire="1"] .src__dot::before{content:"";position:absolute;inset:-3px;border-radius:50%;border:2px solid var(--rc,var(--c));opacity:0;pointer-events:none;animation:satie-loc-fire 1.1s ease-out forwards}
.satie-loc .src[data-fire="1"] .src__dot::before{animation-delay:.45s}
.satie-loc .src[data-thing="1"]{--rc:#ff8da1}
@keyframes satie-loc-fire{from{transform:scale(1);opacity:calc(.55 + .4 * var(--lv,.6))}to{transform:scale(calc(2.4 + 1.6 * var(--lv,.6)));opacity:0}}
.satie-loc .arrow{position:absolute;left:0;top:0;display:none;align-items:center;gap:6px;pointer-events:auto;cursor:pointer}
.satie-loc .arrow[data-on="1"]{display:flex}
.satie-loc .arrow i{width:0;height:0;border-left:11px solid #ff8da1;border-top:7px solid transparent;border-bottom:7px solid transparent;filter:drop-shadow(0 0 6px rgba(255,141,161,.7))}
.satie-loc .arrow span{font:500 11px/18px var(--satie-ui);color:#ebe7df;padding:0 7px;border-radius:999px;background:rgba(13,12,11,.85);border:1px solid rgba(235,231,223,.45);white-space:nowrap}
.satie-loc .gtag{position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:100001;white-space:nowrap;font:500 12px/20px var(--satie-ui);color:#ebe7df;padding:1px 10px;border-radius:6px;background:rgba(13,12,11,.92);border:1px dashed #ebe7df}
.satie-loc .gtag::before{content:'group';font-size:10px;font-family:'IBM Plex Mono','SF Mono',Menlo,Consolas,ui-monospace,monospace;letter-spacing:.01em;color:#8e8a83;margin-right:7px}
.satie-loc[data-aiming="1"] .src__label{visibility:hidden}
.satie-loc[data-aiming="1"] .src{opacity:.5}
.satie-loc .glines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:100000;overflow:visible}
.satie-loc .glines line{stroke:#ebe7df;stroke-width:1;stroke-dasharray:3 3;opacity:.7}
.satie-loc .gtag[data-on="1"]{display:block}
.satie-loc .gtag small{font-weight:400;opacity:.6;margin-left:6px}
.satie-loc .bednote{position:absolute;top:16px;left:0;font:500 11px/22px var(--satie-ui);color:#ebe7df;padding:0 10px;border-radius:999px;background:rgba(13,12,11,.85);border:1px solid rgba(235,231,223,.25);opacity:0;pointer-events:none;transition:opacity .25s ease;white-space:nowrap}
.satie-loc .bednote[data-on="1"]{opacity:1}
.satie-loc .src[data-edit="1"] .src__dot{cursor:grab;box-shadow:0 0 0 3px rgba(235,231,223,.55),0 0 14px rgba(235,231,223,.5)}
.satie-loc[data-dragging="1"], .satie-loc[data-dragging="1"] *{cursor:grabbing!important}
.satie-loc .aim{position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:100001}
.satie-loc .aim[data-on="1"]{display:block}
.satie-loc .aim i{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;border:2px solid #ebe7df;background:rgba(235,231,223,.18);box-shadow:0 0 0 4px rgba(235,231,223,.12)}
.satie-loc .aim[data-locked="1"] i{background:#ebe7df}
.satie-loc .aim span{position:absolute;left:16px;top:-11px;font:500 11.5px/22px var(--satie-ui);color:#ebe7df;padding:0 9px;border-radius:999px;background:rgba(13,12,11,.88);border:1px solid rgba(235,231,223,.5);white-space:nowrap}
.satie-loc .toast{position:absolute;bottom:22px;left:24px;font:500 12px/26px var(--satie-ui);color:#0d0c0b;background:#ebe7df;border-radius:999px;padding:0 12px;opacity:0;transform:translateY(6px);transition:opacity .25s ease,transform .25s ease;pointer-events:none}
.satie-loc .toast[data-on="1"]{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){.satie-loc .src[data-sel="1"] .src__dot{animation:none}.satie-loc .src__dot::before,.satie-loc .src__dot::after{animation-duration:.01s!important}}
/* an opened thing's own marker (2026-11-08): the thing as the mixer draws it, warm white and square, never the
   rounded mint pill of a selected sound, with a faint spoke out to each of its sounds */
.satie-loc .src[data-thing="1"][data-sel="1"] .src__label,.satie-loc .src[data-thing="1"][data-hover="1"] .src__label{border-radius:4px;border-color:rgba(235,231,223,.75)}
.satie-loc .src.src--host[data-sel="1"] .src__label{border-radius:4px;border:1px solid rgba(235,231,223,.75);background:rgba(13,12,11,.94);color:#ebe7df;font-size:11px;line-height:18px;padding:0 7px;font-weight:500;letter-spacing:.02em;white-space:nowrap}
.satie-loc .src.src--host[data-sel="1"] .src__dot{width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:3px;background:rgba(235,231,223,.16);border:1.5px solid #ebe7df;box-shadow:none !important;animation:none;outline:none}
.satie-loc .src.src--host[data-sel="1"][data-silent="0"] .src__dot{background:#ff8da1;border-color:#ebe7df}
.satie-loc .src--host .src__spoke{position:absolute;left:0;top:0;height:1px;transform-origin:0 50%;background:rgba(235,231,223,.4);pointer-events:none}
`;

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inRect = (x, y, r, pad = 3) => !!r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
const union = (a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
const mid = r => (r && !r.isNull ? (r.min + r.max) / 2 : 0);
const kindOf = st => (st.kind === 'trigger' ? `on ${st.eventName ?? ''}` : st.kind === 'loop' ? 'loop' : 'one-shot');
const whatOf = st => (st.isGenerated ? (st.genPrompt ?? '') : String(st.clip ?? '').replace(/^community\//, '').replace(/_/g, ' '));
/** A tag names the sound, not the whole generation prompt: its first phrase. */
const shortWhat = st => whatOf(st).split(/,\s*/)[0].slice(0, 90);

export function locate(audio, { scene, camera, renderer, look = null, teleport = null, position = null, dom = document.body } = {}) {
  if (!audio?.engine || !scene?.isScene || !camera?.isCamera || !renderer) throw new Error('locate needs the Satie scene, and the game\'s scene, camera and renderer.');
  const engine = audio.engine;
  const upm = () => audio.unitsPerMeter ?? 1;
  let namer = null; // the mixer's names for sounds (setNamer)
  let hostNamer = null; // and for objects ("car 1"), so a label in the world reads as its row in the list
  let hostCounter = null; // and how many sounds the mixer counts on an object (its events by you there too: 5, not the 3 with a voice)
  let revealed = null; // the sounds of a thing opened in the mixer: fanned round it in the world, its own tag kept
  // an object's name as people say it: the scene contract's label, else its id with spaces; one of a
  // numbered kind ("understory_542", a world's 600 thickets) is named by its kind, not its serial number
  const labelFor = id => hostNamer?.(id) || audio.contract?.scene?.objects?.find(o => o.id === id)?.label?.trim() || String(/^(.+?)[_-]\d+$/.exec(String(id))?.[1] ?? id).replace(/_/g, ' ');
  let panel = null;
  let active = false, focusMode = false, soundsOn = true;
  let selection = null;             // { indices, label, detail }
  let hovered = null, hoverFromRow = false, hoverKeep = null;
  let focus = null;                 // { indices, t0, yaw0, pitch0 }
  const firedAt = new Map();        // statementIndex -> performance.now()
  // an event sound that lands somewhere new each time (a passer-by's steps): every fire is its own dot that
  // appears where it landed and fades there; the marker and its label stay put instead of jumping per step
  const TRAIL_MS = 1500, TRAIL_MAX = 8, LABEL_HOLD_MS = 1600;
  const ghosts = [];               // { p: Vector3, t, i, el }

  // ── DOM ──
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.className = 'satie-loc'; root.dataset.on = '0'; root.setAttribute('aria-hidden', 'true');
  const hoverdim = document.createElement('div'); hoverdim.className = 'hoverdim';
  const arrow = document.createElement('div'); arrow.className = 'arrow'; arrow.innerHTML = '<i></i><span></span>';
  const gtag = document.createElement('div'); gtag.className = 'gtag';
  const bednote = document.createElement('div'); bednote.className = 'bednote';
  const aim = document.createElement('div'); aim.className = 'aim'; aim.innerHTML = '<i></i><span></span>';
  // a group's lines: from its tag to each of its sounds, so the tag says which dots are in it
  const glines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); glines.setAttribute('class', 'glines');
  root.append(hoverdim, glines, arrow, gtag, bednote, aim);
  dom.appendChild(root);
  const orbs = new Map();           // track key -> { key, i, el, dot, label, lead, detailed, shortW, shortH, proj, depth, dist, db, silent }

  // ── the sound layer's own scene, drawn over the world after the game renders, so the
  //    game's materials are never touched ──
  const overlay = new Scene();
  // focus mode: one full-screen veil over what the game drew, before the sound layer draws
  const veilScene = new Scene(), veilCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const veil = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ color: VEIL, transparent: true, opacity: VEIL_OPACITY, depthTest: false, depthWrite: false }));
  veil.frustumCulled = false; veilScene.add(veil);
  const shells = new Map();         // track key -> Mesh
  const shellMat = (color, fill) => new MeshBasicMaterial({ color, wireframe: !fill, transparent: true, opacity: 0.10, depthWrite: false, side: DoubleSide });

  function apply() {
    const show = active && soundsOn;
    root.dataset.on = show ? '1' : '0';
    if (!show) setHoverLocal(null);
  }

  // ── selection and hover (the panel owns selection; the layer draws it) ──
  const isSel = i => !!selection?.indices.includes(i);
  const isSelOrb = o => (o.members ?? [o.i]).some(isSel);
  // Declared (2026-09-28): one marker per object, and full pills only for the few that matter
  // where you stand (the loudest you can hear, and anything close); the rest are faint hints.
  // (2026-10-18: 25 m was a little tight from a third-person camera that trails behind the player)
  const FULL_NEAR_M = 35, FULL_MAX = 6;
  function setHoverLocal(orb, fromRow = false) {
    hoverFromRow = !!orb && fromRow;
    if (hovered === orb) return;
    if (hovered) { hovered.el.dataset.hover = '0'; renderLabel(hovered); }
    hovered = orb; hoverKeep = null;
    if (selection) for (const o of orbs.values()) if (o !== orb && isSelOrb(o)) renderLabel(o);
    root.dataset.hovering = orb ? '1' : '0';
    if (orb) {
      if (!fromRow && orb.el.style.display !== 'none') hoverKeep = union(orb.dot.getBoundingClientRect(), orb.label.getBoundingClientRect());
      orb.el.dataset.hover = '1'; renderLabel(orb);
    }
    updateBednote(); updateShells();
  }
  function updateShells() {
    const focusOn = !!hovered || !!selection;
    for (const [key, m] of shells) {
      const o = orbs.get(key);
      // the sound you are editing always shows its size, so a size change is seen as you make it
      // a row hovered in the mixer is ONE sound: only its shell; the object's marker hovered: all of its sounds
      const hov = hoverFromRow ? hoveredIndex === o.i : (hovered?.members?.includes(o.i) || o === hovered);
      const on = !!o && (hov || isSel(o.i) || !!editing?.indices.includes(o.i));
      // an extent draws for the sound you point at or select; a line source keeps a faint band
      const base = m.userData.line ? 0.10 : 0;
      m.material.opacity = (on ? 0.24 : focusOn ? Math.min(base, 0.03) : base) * (m.userData.fill ? (m.userData.line ? 2.4 : 1.6) : 1);
      if (m.userData.edge) m.userData.edge.opacity = on ? 0.9 : focusOn ? 0.12 : 0.5;
    }
  }
  function updateBednote() {
    const stmts = engine.scriptStatements;
    const hoverBed = hoveredIndex !== null && stmts[hoveredIndex]?.bed ? hoveredIndex : null;
    const beds = selection ? selection.indices.filter(i => stmts[i]?.bed) : [];
    const on = hoverBed !== null || (selection && beds.length === selection.indices.length && beds.length > 0);
    bednote.dataset.on = on ? '1' : '0';
    if (hoverBed !== null) bednote.textContent = `bed · ${namer?.(hoverBed) || shortWhat(stmts[hoverBed])} · everywhere, no position`;
    else if (on) bednote.textContent = beds.length === 1 ? `bed · ${namer?.(beds[0]) || shortWhat(stmts[beds[0]])} · everywhere, no position` : `${beds.length} beds · everywhere, no position`;
  }
  let hoveredIndex = null;
  function renderLabel(o) {
    const detailed = o === hovered || (isSelOrb(o) && (!hovered || hoverFromRow) && (selection?.indices.length === 1 || (o.count ?? 1) > 1 && (o.members ?? []).length === selection?.indices.length));
    // what is on a thing is drawn as the thing (square, its name), one sound or several, as the mixer lists it;
    // a sound is its own round dot when it is on no thing, or once its thing is opened
    const thing = o.host !== 'scene' && !o.fanned && !((o.count ?? 1) === 1 && engine.scriptStatements[o.i]?.line);
    const n = (o.host !== 'scene' && hostCounter?.(o.host)) || (o.count ?? 1);
    const key = `${detailed}|${o.count ?? 1}|${n}|${thing}|${o.copies ?? 0}`;
    if (key === o.labelKey) return;
    o.labelKey = key; o.detailed = detailed; o.el.dataset.thing = thing ? '1' : '0';
    const st = engine.scriptStatements[o.i];
    const host = labelFor(o.host);
    if (detailed && thing) {
      // one marker for several sounds on one object: name the object, list what it makes
      const stmts = engine.scriptStatements;
      o.label.textContent = host;
      // what it does, not how many: "open, close"
      // an event by what it does ("open"); anything else by the mixer's name for it ("dog barking")
      const acts = [...new Set((o.members ?? [o.i]).filter(i => stmts[i]).map(i => (stmts[i].kind === 'trigger' && stmts[i].eventName) || !namer ? soundAction(stmts[i]) : (namer(i) || soundAction(stmts[i]))))];
      const small = document.createElement('small'); small.textContent = acts.length > 3 ? `${acts.slice(0, 3).join(', ')} +${acts.length - 3}` : acts.join(', ');
      const em = document.createElement('em'); em.className = 'range';
      o.label.append(small, em);
    } else if (detailed && st) {
      o.label.textContent = namer ? (namer(o.i) || shortWhat(st)) : shortWhat(st);
      const small = document.createElement('small'); small.textContent = o.host === 'scene' ? kindOf(st) : `${kindOf(st)} · at the ${host}`;
      const em = document.createElement('em'); em.className = 'range';
      o.label.append(small, em);
    } else {
      // the thing's name; a sound on no thing, or any sound while you move sounds, by its own name
      // (2026-11-13) the mixer's count, so the tag and the list agree: the vending machine's 5 includes what you buy there
      if (thing) { o.label.textContent = host; const sm = document.createElement('small'); sm.textContent = `${n} sound${n === 1 ? '' : 's'}`; o.label.appendChild(sm); }
      else o.label.textContent = namer?.(o.i) || shortWhat(st);
      if (!thing && (o.copies ?? 0) > 1) { const n = document.createElement('small'); n.textContent = `×${o.copies}`; o.label.appendChild(n); }
    }
  }

  // ── focus: turn the view so the target sits at the centre of what you can see ──
  /**
   * Where several sounds are, to go to or face: on one thing, its middle; on several things (two fountains,
   * a row of cafes), the nearest of them, never the average of all (that is the road between them).
   */
  function targetOf(indices) {
    const mine = [...orbs.values()].filter(o => indices.includes(o.i) && o.world);
    if (!mine.length) return null;
    const one = nearestThing(mine);
    const c = new Vector3(); for (const o of one) c.add(o.world);
    return c.divideScalar(one.length);
  }
  /** The sounds of the nearest thing among these (from where the player stands), the ones on screen first. */
  function nearestThing(all) {
    if (new Set(all.map(o => o.host)).size < 2) return all;
    const seen = all.filter(inFrame), list = seen.length ? seen : all;
    camera.updateMatrixWorld();
    const at = position?.(), from = at && Number.isFinite(at.x) && Number.isFinite(at.z) ? new Vector3(at.x, 0, at.z) : new Vector3().setFromMatrixPosition(camera.matrixWorld).setY(0);
    let best = list[0], d = Infinity;
    for (const o of list) { const dd = Math.hypot(o.world.x - from.x, o.world.z - from.z); if (dd < d) { d = dd; best = o; } }
    return best.host === 'scene' ? [best] : list.filter(o => o.host === best.host);
  }
  function aimAt(p) {
    camera.updateMatrixWorld();
    const cp = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const dx = p.x - cp.x, dy = p.y - cp.y, dz = p.z - cp.z;
    const [vx0, vx1] = visibleX();
    const halfH = Math.atan(Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const offset = Math.atan((((vx0 + vx1) / 2 - innerWidth / 2) / (innerWidth / 2)) * Math.tan(halfH));
    return { yaw: Math.atan2(-dx, -dz) + offset, pitch: Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz)))) };
  }
  /** On the part of the game's screen the panel does not cover, in front of the camera. */
  const FV = new Vector3(), FC = new Vector3();
  function pointInFrame(p) {
    FC.copy(p).applyMatrix4(camera.matrixWorldInverse);
    if (FC.z > 0) return false;
    FV.copy(p).project(camera);
    const [vx0, vx1] = visibleX(), x = (FV.x + 1) / 2 * innerWidth, y = (1 - FV.y) / 2 * innerHeight;
    return x >= vx0 && x <= vx1 && y >= 0 && y <= innerHeight;
  }
  /** A sound is in frame when any part of it is (2026-10-18): its spot, or anywhere along its line or area. */
  function inFrame(o) {
    if (!o.world) return false;
    if (pointInFrame(o.world)) return true;
    return extentOf(o).some(pointInFrame);
  }
  /** The point of a line source nearest the player (else the camera), written into `out` (scene units). */
  function nearestOnLine(o, out) {
    const b = [...(audio.bindings ?? [])].find(([id]) => id === o.host)?.[1];
    const pts = b?.line?.polyline; if (!pts || pts.length < 2) return out;
    const u = upm(), at = position?.();
    camera.updateMatrixWorld();
    const cam = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const px = (at && Number.isFinite(at.x) ? at.x : cam.x) / u, pz = (at && Number.isFinite(at.z) ? at.z : cam.z) / u;
    let best = Infinity;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1], dx = c.x - a.x, dz = c.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
      const x = a.x + dx * t, z = a.z + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < best) { best = d; out.set(x * u, (a.y + (c.y - a.y) * t) * u, z * u); }
    }
    return out;
  }
  /** Points along what a sound spans, in scene units: a line source's length, a placed area's outline. */
  function extentOf(o) {
    const st = engine.scriptStatements[o.i]; if (!st) return [];
    const u = upm(), out = [];
    if (st.line) {
      const b = [...(audio.bindings ?? [])].find(([id]) => id === o.host)?.[1];
      const pts = b?.line?.polyline ?? [];
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], c = pts[k + 1], n = Math.min(24, Math.max(2, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 4)));
        for (let j = 0; j <= n; j++) out.push(new Vector3((a.x + (c.x - a.x) * j / n) * u, (a.y + (c.y - a.y) * j / n) * u, (a.z + (c.z - a.z) * j / n) * u));
      }
    } else if (st.hasPlacement && st.areaMin && st.areaMax) {
      const a = st.areaMin, b = st.areaMax, y = Math.min(a.y, b.y) * u;
      for (const fx of [0, .5, 1]) for (const fz of [0, .5, 1]) out.push(new Vector3((a.x + (b.x - a.x) * fx) * u, y, (a.z + (b.z - a.z) * fz) * u));
    }
    return out;
  }
  let glide = null;
  function stepGlide(now) {
    if (!glide) return;
    const k = Math.min(1, (now - glide.t0) / glide.ms), e = easeInOut(k);
    const x = glide.x0 + (glide.x - glide.x0) * e, z = glide.z0 + (glide.z - glide.z0) * e;
    const p = targetOf(glide.indices);
    // turn from where you were already facing toward it over the first half of the walk, never a snap
    const turn = easeInOut(Math.min(1, k * 2));
    let yaw = glide.yaw0, pitch = glide.pitch0;
    if (p) {
      const aim = aimAt(p);
      const dYaw = ((aim.yaw - glide.yaw0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      yaw = glide.yaw0 + dYaw * turn; pitch = glide.pitch0 + (aim.pitch - glide.pitch0) * turn;
    }
    // the sound's height rides along, so a host can land you on its level (the car on the street, not the track above it)
    teleport(x, z, yaw, glide.y);
    look?.set(yaw, pitch);
    if (k >= 1) {
      const indices = glide.indices; glide = null;
      toast(`you are ${FULL_GO_M} m from it, facing it`);
      layer.focus(indices);
    }
  }
  const FULL_GO_M = 4;
  /**
   * Ripples mean something you heard happened just now (2026-11-09, Huanxing: "ripple = event"). The mixer
   * decides heard (its spectral check, a quarter second after the event) and calls `ripple(i)`; here a sound
   * (its name, numbers aside: a crowd's footsteps, a row of fare gates) with 3 or more events in 10 s is a
   * repeating sound, steady like a loop, and does not ripple, and an object ripples once per 1.5 s (a train
   * arriving ripples the train, not its nine sounds).
   */
  const RIPPLE_WINDOW_MS = 10000, RIPPLE_REPEATS = 3, ONE_PER_HOST_MS = 1500;
  const eventsOf = new Map(), lastAtHost = new Map();
  const soundKey = i => { const st = engine.scriptStatements[i]; return String(st?.sourceId ?? st?.clip ?? `i${i}`).replace(/^community\//, '').replace(/[_-]?\d+/g, ''); };
  const ring = (el, host) => {
    const t = performance.now();
    if (host && host !== 'scene') { if (t - (lastAtHost.get(host) ?? -1e9) < ONE_PER_HOST_MS) return; lastAtHost.set(host, t); }
    el.dataset.fire = '0'; void el.offsetWidth; el.dataset.fire = '1';
  };
  const toastEl = document.createElement('div'); toastEl.className = 'toast'; root.appendChild(toastEl);
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text; toastEl.dataset.on = '1';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.dataset.on = '0'; }, 1800);
  }
  function stepFocus(now) {
    if (!focus) return;
    const p = focus.point ?? targetOf(focus.indices); if (!p) { focus = null; return; }
    // third person (no look; the host moves the player): face it by turning the character where it stands,
    // the camera trailing behind turns with it
    if (focus.turn) {
      const at = position?.(); if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) { focus = null; return; }
      const k = Math.min(1, (now - focus.t0) / 600), e = easeInOut(k), want = Math.atan2(-(p.x - at.x), -(p.z - at.z));
      const dYaw = ((want - focus.yaw0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      teleport(at.x, at.z, focus.yaw0 + dYaw * e);
      if (k >= 1) focus = null;
      return;
    }
    if (!look) { focus = null; return; }
    const k = Math.min(1, (now - focus.t0) / 750), e = easeInOut(k), a = aimAt(p);
    const dYaw = ((a.yaw - focus.yaw0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    look.set(focus.yaw0 + dYaw * e, focus.pitch0 + (a.pitch - focus.pitch0) * e);
    if (k >= 1) focus = null;
  }
  const visibleX = () => {
    const w = panel?.coveredWidth() ?? 0;
    return panel?.corner() === 'left' ? [w, innerWidth] : [0, innerWidth - w];
  };

  // ── input: hover, click-to-isolate, drag to look ──
  function overOrb(o, x, y) {
    if (o.el.style.display === 'none') return false;
    const d = o.dot.getBoundingClientRect();
    return Math.hypot(x - (d.left + d.right) / 2, y - (d.top + d.bottom) / 2) < 12 || inRect(x, y, o.label.getBoundingClientRect());
  }
  const onMove = e => {
    if (!active || !soundsOn || document.pointerLockElement) { if (hovered && !hoverFromRow) { setHoverLocal(null); hoveredIndex = null; panel?.hover(null); } return; }
    if (e.target?.closest?.('.satie-dt')) { if (hovered && !hoverFromRow) { setHoverLocal(null); hoveredIndex = null; panel?.hover(null); } return; }
    // an opened thing's own marker: the thing, not any one of its sounds
    if (e.target?.closest?.('.satie-loc .src--host')) { if (hovered && !hoverFromRow) { setHoverLocal(null); hoveredIndex = null; panel?.hover(null); } return; }
    const x = e.clientX, y = e.clientY;
    // a dot under the pointer wins over the open card (a card covered the sounds behind it)
    if (hovered && !hoverFromRow && overOrb(hovered, x, y)) {
      let under = null;
      for (const o of orbs.values()) { if (o === hovered || o.el.style.display === 'none') continue; const d = o.dot.getBoundingClientRect(); if (Math.hypot(x - (d.left + d.right) / 2, y - (d.top + d.bottom) / 2) < 10) { under = o; break; } }
      if (!under) return;
      setHoverLocal(under); hoveredIndex = under.i; panel?.hover(under.i); return;
    }
    // orbs win over labels: an orb is the precise target, a label can overlap a neighbour's orb
    let best = null, bestD = 13;
    for (const o of orbs.values()) {
      if (o.el.style.display === 'none') continue;
      const d = o.dot.getBoundingClientRect();
      const dist = Math.hypot(x - (d.left + d.right) / 2, y - (d.top + d.bottom) / 2);
      if (dist < bestD) { best = o; bestD = dist; }
    }
    if (!best) for (const o of orbs.values()) if (overOrb(o, x, y) && (!best || +o.el.style.zIndex > +best.el.style.zIndex)) best = o;
    if (best === hovered) return;
    setHoverLocal(best); hoveredIndex = best ? best.i : null;
    panel?.hover(best ? best.i : null);
  };
  addEventListener('pointermove', onMove);
  const canvas = renderer.domElement;
  let drag = null;
  const onDown = e => {
    if (!active || document.pointerLockElement || e.button !== 0) return;
    focus = null;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };
  const onDrag = e => {
    if (!drag || !look) return;
    const v = look.get();
    look.set(v.yaw - (e.clientX - drag.x) * 0.004, Math.max(-1.2, Math.min(1.2, v.pitch - (e.clientY - drag.y) * 0.004)));
    drag.x = e.clientX; drag.y = e.clientY;
  };
  const onUp = e => {
    if (!drag) return;
    const still = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5;
    drag = null;
    if (placing) { if (still) dropAim(); return; }
  };
  // A click on the world that is not on a sound lets go: the selection clears and a fanned-out thing
  // folds back into its marker. Read on the window, not the canvas: a game's own overlay (a HUD, a
  // crosshair layer) takes the canvas's pointer events, and the click never reached this layer.
  let worldDown = null;
  /** The sound whose drawn line band is under this screen point (Edit draws them), if any. */
  const bandRay = new Raycaster(), bandNdc = new Vector2();
  function bandAt(cx, cy) {
    if (!soundsOn) return null;
    const lines = [...shells].filter(([, m]) => m.userData.line && m.visible);
    if (!lines.length) return null;
    const r = canvas.getBoundingClientRect();
    bandNdc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(); bandRay.setFromCamera(bandNdc, camera);
    const hit = bandRay.intersectObjects(lines.map(([, m]) => m), true)[0];
    if (!hit) return null;
    const key = lines.find(([, m]) => { let n = hit.object; while (n) { if (n === m) return true; n = n.parent; } return false; })?.[0];
    return key !== undefined ? orbs.get(key) ?? null : null;
  }
  const offSound = t => !t?.closest?.('.satie-dt, .satie-loc .src, .satie-loc .arrow');
  addEventListener('pointerdown', e => { worldDown = active && e.button === 0 && !placing && offSound(e.target) ? { x: e.clientX, y: e.clientY } : null; }, true);
  addEventListener('pointerup', e => {
    const d = worldDown; worldDown = null;
    if (!d || placing || dragSrc || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 5 || !offSound(e.target)) return;
    if (hovered && !hoverFromRow && overOrb(hovered, e.clientX, e.clientY)) return;
    // on a line's band (the ocean along the bay, a river): that sound, as a click on its marker would
    const band = bandAt(e.clientX, e.clientY);
    if (band) { band.el.dispatchEvent(new MouseEvent('click', { bubbles: false, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey })); return; }
    panel?.clear(); // the panel's selection (a row, a group, several) whether or not the layer drew it
  }, true);
  canvas.addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY }; });
  // the pointer anywhere (over a dot too): a fanned-out thing closes when the pointer is well away
  let ptr = null;
  const onPtr = e => { ptr = { x: e.clientX, y: e.clientY }; };
  addEventListener('pointermove', onPtr, { passive: true });
  canvas.addEventListener('pointerleave', () => { mouse = null; });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onDrag);
  canvas.addEventListener('pointerup', onUp);

  function orbFor(view) {
    let o = orbs.get(view.key);
    if (o) return o;
    const el = document.createElement('div'); el.className = 'src';
    el.style.setProperty('--c', voiceColor(view.statementIndex));
    const lead = document.createElement('div'); lead.className = 'src__lead';
    const dot = document.createElement('div'); dot.className = 'src__dot';
    const label = document.createElement('div'); label.className = 'src__label';
    el.append(lead, dot, label);
    o = { key: view.key, i: view.statementIndex, host: view.hostId ?? view.statement.hostRef ?? 'scene', el, dot, label, lead, detailed: null, world: new Vector3() };
    // Shift or ⌘ adds it to what is selected (several sounds at once), a plain click selects only it
    // a thing picks the thing (⌘/Shift adds all its sounds to the pick); a sound picks the sound
    const pick = (e) => {
      const add = !!(e?.shiftKey || e?.metaKey || e?.ctrlKey), thing = o.el.dataset.thing === '1', members = o.members ?? [o.i];
      if (thing && add && panel?.toggleMany) panel.toggleMany(members);
      else if (thing && !add) panel?.selectMany?.(members);
      else panel?.select(o.i, { add });
    };
    // one click: select it and turn to face it; double-click: go there
    el.addEventListener('pointerdown', e => { if (editableOrb(o) && e.button === 0) { e.preventDefault(); e.stopPropagation(); startSourceDrag(o, e); } });
    el.addEventListener('click', e => {
      e.stopPropagation(); if (justDragged) { justDragged = false; return; }
      const add = e.shiftKey || e.metaKey || e.ctrlKey;
      // clicking what is picked again lets it go (the mixer closes what the click opened)
      if (!add && isSelOrb(o)) { if (panel?.release) panel.release(o.members ?? [o.i]); else panel?.clear(); return; }
      pick(e); if (!add) layer.focus(o.members ?? [o.i]);
    });
    el.addEventListener('dblclick', e => { e.stopPropagation(); if (layer.goTo) layer.goTo(o.members ?? [o.i]); });
    renderLabel(o);
    root.appendChild(el); orbs.set(view.key, o);
    return o;
  }
  /**
   * An opened thing keeps its own marker at its middle while its sounds fan out around it
   * (2026-11-06, Huanxing: the vending machine's label jumped away on the first click, so the
   * second click of a double-click landed on nothing). Click it again: fold its sounds back;
   * double-click: go there, still opened.
   */
  const hostMarks = new Map();
  function hostMark(key) {
    let m = hostMarks.get(key);
    if (m) return m;
    const el = document.createElement('div'); el.className = 'src src--host';
    el.dataset.thing = '1'; el.dataset.sel = '1'; el.dataset.opened = '1';
    const lead = document.createElement('div'); lead.className = 'src__lead';
    const dot = document.createElement('div'); dot.className = 'src__dot';
    const label = document.createElement('div'); label.className = 'src__label';
    el.append(lead, dot, label);
    m = { key, el, dot, label, members: [], list: [], labelKey: null, proj: null };
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (e.detail > 1) return; // the second click of a double-click: the dblclick goes there
      if (panel?.release) panel.release(m.members); else panel?.clear();
    });
    el.addEventListener('dblclick', e => { e.stopPropagation(); if (layer.goTo) layer.goTo(m.members); });
    root.appendChild(el); hostMarks.set(key, m);
    return m;
  }
  function shellFor(view, st) {
    let m = shells.get(view.key);
    if (m) return m;
    const color = voiceColor(view.statementIndex);
    if (st.line) {
      const b = [...(audio.bindings ?? [])].find(([id]) => id === (view.hostId ?? st.hostRef))?.[1];
      if (!b?.line) return null;
      // a faint band along the line's full length and width (filled: pale colours sit too close to the ink)
      m = new Group(); m.userData.fill = true; m.userData.line = true;
      m.material = shellMat(color, true);
      const edge = new LineBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
      m.userData.edge = edge;
      const pts = b.line.polyline, w = Math.max(0.2, b.line.halfM * 2) * upm();
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], c = pts[k + 1];
        const len = Math.hypot(c.x - a.x, c.z - a.z) * upm();
        const seg = new Mesh(new PlaneGeometry(len, w), m.material);
        seg.rotation.set(-Math.PI / 2, 0, -Math.atan2(c.z - a.z, c.x - a.x));
        seg.position.set((a.x + c.x) / 2 * upm(), Math.max(a.y, c.y) * upm() + 0.05, (a.z + c.z) / 2 * upm());
        m.add(seg);
        // its two edges, so the whole length of the source reads at a glance
        const nx = -(c.z - a.z), nz = c.x - a.x, nl = Math.hypot(nx, nz) || 1, h = w / 2 / upm();
        const y = Math.max(a.y, c.y) + 0.06 / upm();
        for (const side of [-1, 1]) {
          const ox = nx / nl * h * side, oz = nz / nl * h * side;
          m.add(new LineSegments(new BufferGeometry().setFromPoints([new Vector3((a.x + ox) * upm(), y * upm(), (a.z + oz) * upm()), new Vector3((c.x + ox) * upm(), y * upm(), (c.z + oz) * upm())]), edge));
        }
      }
    } else if (!st.ringRadius.isNull) {
      m = new Mesh(new TorusGeometry(1, 0.12, 8, 48), shellMat(color, false)); m.rotation.x = Math.PI / 2; m.scale.setScalar(mid(st.ringRadius) * upm());
    } else if (!st.radius.isNull) {
      m = new Mesh(new SphereGeometry(1, 24, 16), shellMat(color, false)); m.scale.setScalar(mid(st.radius) * upm());
    } else return null;
    // from inside a sized sound, a sphere is walls far away in every direction (it reads as following
    // you): its edge is drawn as the ring where the sphere meets your height instead
    if (!st.radius.isNull && !(st.ringRadius && !st.ringRadius.isNull)) {
      const pts = []; for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2; pts.push(Math.cos(a), 0, Math.sin(a)); }
      const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pts, 3));
      const ringMat = new LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
      const slice = new LineLoop(g, ringMat); slice.visible = false; slice.frustumCulled = false;
      m.userData.slice = slice; overlay.add(slice);
    }
    overlay.add(m); shells.set(view.key, m);
    updateShells();
    return m;
  }

  // ── per frame ──
  const P = new Vector3(), Q = new Vector3(), CAM = new Vector3(), HC = new Vector3();
  let levels = new Map(), levelsAt = 0;
  function render() {
    const now = performance.now();
    stepGlide(now);
    stepFocus(now);
    if (!active) return;
    stepAim();
    camera.updateMatrixWorld();
    CAM.setFromMatrixPosition(camera.matrixWorld);
    if (now - levelsAt > 120) {
      levelsAt = now; levels = new Map();
      for (const v of engine.levelReport().voices) if (!levels.has(v.statementIndex)) levels.set(v.statementIndex, v);
    }
    const stmts = engine.scriptStatements;
    const listenerHost = audio.listenerBinding?.anchor?.hostId ?? audio.contract?.scene?.behaviorContract?.listener?.host ?? null;
    const seen = new Set();
    const placedNow = new Set(engine.externalHosts); // once a frame (it was copied per sound per frame)
    for (const view of engine.getTrackViews()) {
      const st = view.statement;
      if (!st || st.bed || view.pending) continue;
      // sounds carried by the listener (footsteps, the player's hands) are not places in the world
      if (st.attachRef === 'listener' || listenerHost && (view.hostId ?? st.hostRef) === listenerHost) continue;
      // on a game object the game has not placed yet: it is nowhere, not at the world origin
      if (st.hostRef && contractIds().has(st.hostRef) && !placedNow.has(st.hostRef)) continue;
      // an event sound with no thing, spot or motion of its own sounds where the game sets it off (a step
      // where the foot lands): until it has, it is nowhere, not at the world origin
      if (st.kind === 'trigger' && !st.hostRef && !st.attachRef && !st.hasPlacement && (!st.wanderType || st.wanderType === 'none') && !firedAt.has(view.statementIndex)) continue;
      seen.add(view.key);
      const o = orbFor(view);
      // a script edit renumbers statements: the marker follows its voice, not a stale index
      if (o.i !== view.statementIndex || o.host !== (view.hostId ?? st.hostRef ?? 'scene')) {
        o.i = view.statementIndex; o.host = view.hostId ?? st.hostRef ?? 'scene';
        o.el.style.setProperty('--c', voiceColor(o.i)); o.labelKey = null; renderLabel(o);
      }
      o.world.set(view.position.x * upm(), view.position.y * upm(), view.position.z * upm());
      // a line source (the ocean along a shore, a river) is heard from its nearest point: its marker, "go" and
      // facing use that point, not its object's origin (Palm Bay's shore object sits at the world's centre)
      if (st.line) nearestOnLine(o, o.world);
      if (st.kind === 'trigger') {
        const fa = firedAt.get(view.statementIndex);
        if (fa !== undefined && fa !== o.trailAt) {
          o.trailAt = fa;
          // it moved between fires: it is a stepping sound (steps, hooves), drawn as dots where it lands
          if (o.lastFire && o.lastFire.distanceToSquared(o.world) > (0.2 * upm()) ** 2) o.steps = true;
          o.lastFire = o.world.clone();
          if (o.steps) {
            const g = document.createElement('div'); g.className = 'ghost'; g.style.setProperty('--c', voiceColor(o.i)); root.appendChild(g);
            ghosts.push({ p: o.world.clone(), t: now, i: o.i, el: g });
            const mine = ghosts.filter(x => x.i === o.i);
            if (mine.length > TRAIL_MAX) { const old = mine[0]; old.el.remove(); ghosts.splice(ghosts.indexOf(old), 1); }
            // the label moves to the newest step only once the last one it stood at has faded
            // (and never while you point at it or have it selected: a label that slid away under the cursor made
            // the whole layer flicker between hover and not, and could not be clicked)
            const held = o === hovered || isSelOrb(o);
            if (!o.anchor || (!held && now - (o.anchorAt ?? 0) > LABEL_HOLD_MS)) { o.anchor = o.world.clone(); o.anchorAt = now; }
          }
        }
      }
      const sh = shellFor(view, st);
      if (sh && !st.line) {
        sh.position.copy(o.world);
        // its size follows the script live (a size edit used to show only after the shell was rebuilt)
        const r = st.ringRadius && !st.ringRadius.isNull ? mid(st.ringRadius) : st.radius && !st.radius.isNull ? mid(st.radius) : null;
        if (r !== null) sh.scale.setScalar(r * upm());
        const slice = sh.userData.slice;
        if (slice && r !== null) {
          // inside it: the edge at your height (a ring around you at the true distance), not the far sphere
          const R = r * upm(), dy = CAM.y - o.world.y, inside = o.world.distanceTo(CAM) < R;
          sh.userData.inside = inside;
          if (inside) { const rr = Math.sqrt(Math.max(0, R * R - dy * dy)); slice.position.set(o.world.x, CAM.y - 1.4 * upm(), o.world.z); slice.scale.setScalar(rr); slice.material.opacity = Math.min(0.9, sh.material.opacity * 4); }
        }
      }
      // inside it you still see it, and the ring at your height says how far its edge is
      // (2026-11-13) a sound's size (its sphere, its ring) shows for the sound you point at, pick or edit, not for every
      // sound at once (a wireframe on everything hid the game and said nothing)
      const sized = soundsOn && (o === hovered || isSelOrb(o) || !!editing?.indices?.includes(o.i));
      if (sh) sh.visible = sized;
      if (sh?.userData.slice) sh.userData.slice.visible = sized && !!sh.userData.inside && sh.material.opacity > 0;
      const lv = levels.get(view.statementIndex);
      const recent = now - (firedAt.get(view.statementIndex) ?? -1e9) < 1500;
      o.silent = st.kind === 'trigger' ? !recent : !(lv?.active ?? lv?.sounding);
      o.heardDb = (st.kind === 'trigger' ? recent : lv?.audible) && lv && Number.isFinite(lv.receivedDb) ? lv.receivedDb : null;
      // a fader being dragged is heard at once, and the label says it at once (the preview's dB on top)
      const pv = engine.statementPreviewDb?.(view.statementIndex) ?? 0;
      o.dist = view.surfaceDistanceM; o.db = lv && Number.isFinite(lv.receivedDb) ? Math.round(lv.receivedDb + pv) : null;
      o.spl = st.spl.isNull ? null : pv <= -100 ? 0 : Math.round(mid(st.spl) + pv);
    }
    for (const [key, o] of orbs) if (!seen.has(key)) { o.el.remove(); orbs.delete(key); const m = shells.get(key); if (m) { overlay.remove(m); if (m.userData.slice) overlay.remove(m.userData.slice); shells.delete(key); } if (hovered === o) setHoverLocal(null); }
    // the veil, then the shells: their own passes over what the game drew (no scene depth after a post-processing chain)
    if (soundsOn && (focusMode || shells.size || areas.size)) {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      if (focusMode) renderer.render(veilScene, veilCamera);
      if (shells.size || areas.size) { overlay.fog = focusMode ? null : scene.fog; renderer.clearDepth(); renderer.render(overlay, camera); }
      renderer.autoClear = auto;
    }
    if (!soundsOn) return;

    // one marker per object: the sounding loop if there is one, else its first sound
    const byHost = new Map();
    const opened = new Set();
    // a sound on no thing is its own marker (they all shared one called "scene"); the copies an `N *`
    // block expands into share their block's source line, and are one sound
    const soundOf = o => { const st = stmts[o.i]; return st?.isCountVariant && st.sourceLine >= 0 && !st.sourceShared ? `src:${st.sourceLine}` : `i:${o.i}`; };
    for (const o of orbs.values()) { const k = o.host === 'scene' ? `scene:${soundOf(o)}` : o.host; const l = byHost.get(k); if (l) l.push(o); else byHost.set(k, [o]); }
    for (const [hostKey, list] of byHost) {
      for (const o of list) { o.copies = 0; o.el.dataset.copy = '0'; }
      // one sound's copies on no thing: each copy keeps its dot where it plays, one name for all of them
      if (hostKey.startsWith('scene:src:') && list.length > 1) {
        // the nearest copy carries the name (last frame's distance), so the label is where you are
        list.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || a.i - b.i);
        list.forEach((o, k) => {
          o.primary = true; o.members = [o.i]; o.count = 1; o.groupDb = o.db; o.anySounding = !o.silent; o.groupHeard = o.heardDb; o.fanX = 0; o.fanY = 0; o.fanned = false;
          o.copies = k === 0 ? list.length : 0; o.el.dataset.copy = k === 0 ? '0' : '1';
        });
        continue;
      }
      const rank = o => (o.silent ? 2 : 0) + (stmts[o.i]?.kind === 'loop' ? 0 : 1);
      list.sort((a, b) => rank(a) - rank(b) || a.i - b.i);
      // editing the world: a thing with several sounds is one dot until you come near it; then its
      // sounds fan out around it, each its own dot to grab (all of them fanned at once was a crowd)
      // (2026-10-18: a thing with one sound is a thing too, as in the mixer's list, until it is opened)
      // (2026-11-13) a thing opened in the mixer fans out too: its tag stays, each of its sounds gets its own
      const fanned = worldEdit && list.length > 1 && (revealObjectSounds(list.map(o => o.i), selection?.indices ?? [], editing?.indices ?? []) || (!!revealed && list.every(o => revealed.has(o.i))));
      if (fanned) {
        list.forEach((o, k) => {
          o.primary = true; o.members = [o.i]; o.count = 1; o.groupDb = o.db; o.anySounding = !o.silent; o.groupHeard = o.heardDb; o.fanned = true;
          const a = (k / list.length) * Math.PI * 2 - Math.PI / 2;
          o.fanX = Math.cos(a) * 34; o.fanY = Math.sin(a) * 34;
        });
        if (hostKey !== 'scene' && !hostKey.startsWith('scene:')) {
          const hm = hostMark(hostKey); hm.members = list.map(o => o.i); hm.list = list; opened.add(hostKey);
          // just opened: the sound that was under the pointer has moved out from under it
          if (!hm.open && hovered && !hoverFromRow && list.includes(hovered)) { setHoverLocal(null); hoveredIndex = null; panel?.hover(null); }
          hm.open = true;
        }
        continue;
      }
      const members = list.map(o => o.i);
      list.forEach((o, k) => { o.primary = k === 0; o.members = members; o.count = list.length; o.fanX = 0; o.fanY = 0; o.fanned = false; });
      const loud = list.filter(o => !o.silent && o.db !== null).sort((a, b) => b.db - a.db)[0];
      list[0].groupDb = loud ? loud.db : null; list[0].anySounding = !!loud || list.some(o => !o.silent);
      const heard = list.filter(o => o.heardDb !== null).sort((a, b) => b.heardDb - a.heardDb)[0];
      list[0].groupHeard = heard ? heard.heardDb : null;
    }
    if (editing || worldEdit) paintEditable(); // a marker that appears or regroups while you edit is draggable too
    drawAreas();
    paintShape();

    // project every positioned source onto the screen
    const [vx0, vx1] = visibleX(), H = innerHeight;
    let arrowFor = null;
    for (const o of orbs.values()) {
      if (!o.primary) { o.el.style.display = 'none'; o.proj = null; continue; }
      // a stepping sound's marker stands at its anchor (moved only between steps' fades), not at each step
      const at = o.steps && o.anchor ? o.anchor : o.world;
      Q.copy(at).project(camera);
      P.copy(at).applyMatrix4(camera.matrixWorldInverse);
      const behind = P.z > 0;
      const x = (Q.x + 1) / 2 * innerWidth + (o.fanX ?? 0), y = (1 - Q.y) / 2 * H + (o.fanY ?? 0);
      const onScreen = !behind && x >= vx0 && x <= vx1 && y >= 0 && y <= H;
      o.el.style.display = onScreen ? '' : 'none';
      o.el.style.transform = `translate(${x}px, ${y}px)`;
      o.el.dataset.silent = o.anySounding ? '0' : '1';
      // its steps are the dots; the marker is only the label, which fades out after the last step
      o.el.dataset.steps = o.steps ? '1' : '0';
      if (o.steps) {
        // pointed at or selected: it stays, fully visible, until you leave it
        const held = o === hovered || isSelOrb(o);
        const age = now - (o.trailAt ?? -1e9), op = held ? 1 : Math.max(0, 1 - Math.max(0, age - LABEL_HOLD_MS) / 1200);
        o.el.style.opacity = String(op); o.el.style.pointerEvents = op < 0.1 ? 'none' : '';
      }
      else if (o.el.style.opacity) { o.el.style.opacity = ''; o.el.style.pointerEvents = ''; }
      // 0 at 10 dB where you stand, 1 at 60 dB: the loudest here glow brightest
      o.el.style.setProperty('--lv', String(o.groupHeard === null ? 0 : Math.max(0.15, Math.min(1, (o.groupHeard - 10) / 50))));
      o.el.dataset.sel = isSelOrb(o) ? '1' : '0';
      o.depth = o.world.distanceTo(CAM);
      o.el.style.zIndex = o === hovered ? '100000' : isSelOrb(o) ? '99999' : String(Math.max(1, 90000 - Math.round(o.depth * 10)));
      o.proj = { x, y, behind, onScreen };
      const single = !!selection && isSelOrb(o) && selection.indices.every(i => o.members.includes(i));
      if (!onScreen && (o === hovered || (single && arrowFor?.o !== hovered))) arrowFor = { o, x, y, behind };
      renderLabel(o);
      if (o.detailed) {
        const line = o.label.querySelector('.range');
        const st = stmts[o.i];
        const grouped = (o.count ?? 1) > 1;
        const db = grouped ? o.groupDb : o.db, silent = grouped ? !o.anySounding : o.silent;
        if (line) line.textContent = `${st?.line ? 'nearest point on the line · ' : ''}${Number.isFinite(o.dist) ? Math.round(o.dist) + ' m from you · ' : ''}${silent ? 'silent now' : db !== null ? (grouped ? 'loudest ' : '') + db + ' dB here' : ''}${!grouped && o.spl !== null ? ' · spl ' + o.spl + ' at 1 m' : ''}`;
      }
    }
    for (const [k, hm] of hostMarks) {
      if (!opened.has(k) || !hm.list.length) { hm.el.style.display = 'none'; hm.proj = null; hm.open = false; continue; }
      HC.set(0, 0, 0); for (const o of hm.list) HC.add(o.world); HC.divideScalar(hm.list.length);
      Q.copy(HC).project(camera); P.copy(HC).applyMatrix4(camera.matrixWorldInverse);
      const x = (Q.x + 1) / 2 * innerWidth, y = (1 - Q.y) / 2 * H;
      const onScreen = P.z <= 0 && x >= vx0 && x <= vx1 && y >= 0 && y <= H;
      hm.el.style.display = onScreen ? '' : 'none';
      hm.el.style.transform = `translate(${x}px, ${y}px)`;
      hm.el.style.zIndex = '99999';
      hm.el.dataset.silent = hm.list.some(o => !o.silent) ? '0' : '1';
      hm.proj = onScreen ? { x, y } : null;
      const spokes = hm.el.querySelectorAll('.src__spoke');
      for (let s = spokes.length; s < hm.list.length; s++) { const sp = document.createElement('div'); sp.className = 'src__spoke'; hm.el.insertBefore(sp, hm.dot); }
      [...hm.el.querySelectorAll('.src__spoke')].forEach((sp, s) => {
        const o = hm.list[s]; if (!o) { sp.style.display = 'none'; return; }
        const len = Math.hypot(o.fanX ?? 0, o.fanY ?? 0) - 16;
        sp.style.display = len > 2 ? '' : 'none';
        sp.style.width = `${len}px`; sp.style.transform = `rotate(${Math.atan2(o.fanY ?? 0, o.fanX ?? 0)}rad) translateX(9px)`;
      });
      const n = hostCounter?.(k) || hm.list.length, lk = `${labelFor(k)}|${n}`;
      if (hm.labelKey !== lk) {
        hm.labelKey = lk; hm.label.textContent = labelFor(k);
        const small = document.createElement('small'); small.textContent = `${n} sound${n === 1 ? '' : 's'} · double-click to go`; hm.label.appendChild(small);
      }
    }
    for (let k = ghosts.length - 1; k >= 0; k--) {
      const g = ghosts[k], age = now - g.t;
      if (age > TRAIL_MS || !soundsOn) { g.el.remove(); ghosts.splice(k, 1); continue; }
      Q.copy(g.p).project(camera); P.copy(g.p).applyMatrix4(camera.matrixWorldInverse);
      const gx = (Q.x + 1) / 2 * innerWidth, gy = (1 - Q.y) / 2 * H;
      const show = P.z <= 0 && gx >= vx0 && gx <= vx1 && gy >= 0 && gy <= H;
      g.el.style.display = show ? '' : 'none';
      g.el.style.transform = `translate(${gx}px, ${gy}px)`;
      // appears (150 ms) and fades out where it landed
      g.el.style.opacity = String(0.85 * Math.min(1, age / 150) * (1 - age / TRAIL_MS));
    }
    root.dataset.sel = selection ? '1' : '0';
    // a selected group: one tag over its highest member on screen; if none, the arrow names the group
    if (selection && selection.indices.length > 1) {
      // each thing's marker that carries any of the group's sounds (a car's marker is its engine's: a group of its
      // tires had no marker of its own, and no tag)
      const members = [...orbs.values()].filter(o => o.primary && isSelOrb(o));
      const vis = members.filter(o => o.proj?.onScreen);
      // one marker already names a group on one object; the tag is for a group spread over several
      if (vis.length && new Set(vis.map(o => o.host)).size === 1) { gtag.dataset.on = '0'; glines.replaceChildren(); }
      else if (vis.length) {
        // above the middle of its sounds, with a line to each
        const top = vis.reduce((a, b) => (b.proj.y < a.proj.y ? b : a));
        const cx = vis.reduce((a, o) => a + o.proj.x, 0) / vis.length;
        if (gtag.dataset.label !== (selection.label ?? '')) {
          gtag.dataset.label = selection.label ?? '';
          gtag.textContent = selection.label ?? '';
          const small = document.createElement('small'); small.textContent = selection.detail ?? `${selection.indices.length} sounds`; gtag.appendChild(small);
        }
        gtag.dataset.on = '1';
        const gw = gtag.offsetWidth, gh = gtag.offsetHeight;
        const gx = Math.max(vx0 + 8, Math.min(vx1 - gw - 8, cx - gw / 2)), gy = Math.max(8, top.proj.y - gh - 46);
        gtag.style.transform = `translate(${gx}px, ${gy}px)`;
        while (glines.childNodes.length > vis.length) glines.lastChild.remove();
        while (glines.childNodes.length < vis.length) glines.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'line'));
        vis.forEach((o, k) => { const l = glines.childNodes[k]; l.setAttribute('x1', String(gx + gw / 2)); l.setAttribute('y1', String(gy + gh)); l.setAttribute('x2', String(o.proj.x)); l.setAttribute('y2', String(o.proj.y)); });
      } else {
        glines.replaceChildren();
        gtag.dataset.on = '0';
        const cand = members.filter(o => o.proj).sort((a, b) => a.depth - b.depth)[0];
        if (cand && !arrowFor) arrowFor = { o: cand, x: cand.proj.x, y: cand.proj.y, behind: cand.proj.behind, group: selection };
      }
    } else { gtag.dataset.on = '0'; if (glines.childNodes.length) glines.replaceChildren(); }
    bednote.style.transform = `translateX(calc(${(vx0 + vx1) / 2}px - 50%))`;

    const topHeard = Math.max(-Infinity, ...[...orbs.values()].filter(o => o.primary && o.groupHeard !== null).map(o => o.groupHeard));
    for (const o of orbs.values()) if (o.primary) o.el.dataset.dark = o.anySounding && (o.groupHeard === null || o.groupHeard < topHeard - 15) ? '1' : '0';

    // Hearing has its own strip. Distant sources stay compact until inspected, even in a family selection.
    const visible = [...orbs.values()].filter(o => o.primary && o.proj?.onScreen);
    // a copy without the name takes no label slot (twelve drips crowded their own name out)
    const full = new Set(visible.filter(o => o.el.dataset.copy !== '1' && Number.isFinite(o.dist) && o.dist <= FULL_NEAR_M)
      .sort((a, b) => a.depth - b.depth).slice(0, FULL_MAX));
    for (const o of visible) {
      const hint = !fullObjectLabel(o.members ?? [o.i], selection?.indices ?? [], editing?.indices ?? [], o === hovered, full.has(o));
      o.el.dataset.hint = hint ? '1' : '0';
    }

    // labels: layout by the SHORT label's size, nearest first, so a detailed tag never moves its neighbours
    const placed = [];
    for (const hm of hostMarks.values()) if (hm.proj) { const w = hm.label.offsetWidth, h = hm.label.offsetHeight; placed.push({ x0: hm.proj.x + 12, x1: hm.proj.x + 12 + w, y0: hm.proj.y - 9, y1: hm.proj.y - 9 + h }); }
    const shown = [...orbs.values()].filter(o => o.el.style.display !== 'none' && o.el.dataset.hint !== '1').map(o => {
      const w = o.label.offsetWidth, h = o.label.offsetHeight;
      if (!o.detailed) { o.shortW = w; o.shortH = h; }
      return { o, x: o.proj.x, y: o.proj.y, w, h };
    }).sort((a, b) => a.o.depth - b.o.depth);
    for (const s of shown) {
      const detailed = s.o.detailed && s.o.shortW != null;
      const lw = detailed ? s.o.shortW : s.w, lh = detailed ? s.o.shortH : s.h;
      const gap = 12;
      let x0 = s.x + gap, below = false;
      if (x0 + lw > vx1 - 8) { x0 = s.x - gap - lw; if (x0 < vx0 + 8) { below = true; x0 = Math.max(vx0 + 8, Math.min(vx1 - 8 - lw, s.x - lw / 2)); } }
      const x1 = x0 + lw, base = below ? s.y + 14 : s.y - 10;
      let dy = 0;
      for (let guard = 0; guard < 12; guard++) {
        const y0 = base + dy, y1 = y0 + lh;
        const hit = placed.find(p => x0 < p.x1 && x1 > p.x0 && y0 < p.y1 && y1 > p.y0);
        if (!hit) break;
        dy = hit.y1 - base + 3;
      }
      placed.push({ x0, x1, y0: base + dy, y1: base + dy + lh });
      // a detailed tag opens IN its label's slot, keeping its place and its leader line
      let tx = x0, ty = base + dy;
      const tw = detailed ? s.w : lw, th = detailed ? s.h : lh;
      if (detailed) { tx = Math.max(vx0 + 8, Math.min(vx1 - 8 - tw, tx)); ty = Math.max(8, Math.min(H - 8 - th, ty)); }
      Object.assign(s.o.label.style, { left: `${tx - s.x}px`, right: 'auto', top: `${ty - s.y}px` });
      const lx0 = tx - s.x, ly0 = ty - s.y;
      const nx = Math.max(lx0, Math.min(0, lx0 + tw)), ny = Math.max(ly0, Math.min(0, ly0 + th));
      const len = Math.hypot(nx, ny);
      if (len > 18) Object.assign(s.o.lead.style, { display: 'block', width: `${len - 7}px`, transform: `rotate(${Math.atan2(ny, nx)}rad) translateX(7px)` });
      else s.o.lead.style.display = 'none';
    }
    if (arrowFor) {
      // point from the visible centre toward the source (flipped when it is behind the camera)
      const cx = (vx0 + vx1) / 2, cy = H / 2, W = vx1 - vx0;
      let dx = arrowFor.x - cx, dy = arrowFor.y - cy; if (arrowFor.behind) { dx = -dx; dy = -dy; }
      const k = Math.min((W / 2 - 18) / Math.abs(dx || 1e-6), (H / 2 - 18) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx);
      arrow.querySelector('i').style.transform = `rotate(${ang}rad)`;
      const st = stmts[arrowFor.o.i];
      const dist = Number.isFinite(arrowFor.o.dist) ? ` · ${Math.round(arrowFor.o.dist)} m` : '';
      // the same name the label has on screen (the mixer's names), not the clip it plays
      arrow.querySelector('span').textContent = arrowFor.group ? `${arrowFor.group.label} · ${arrowFor.group.indices.length} sounds${dist}` : `${st ? (namer?.(arrowFor.o.i) || shortWhat(st)).slice(0, 48) : arrowFor.o.host}${dist}`;
      const right = Math.cos(ang) >= 0;
      arrow.style.flexDirection = right ? 'row-reverse' : 'row';
      arrow.dataset.on = '1';
      const aw = arrow.offsetWidth, ah = arrow.offsetHeight;
      const left = Math.max(vx0 + 8, Math.min(vx1 - aw - 8, right ? ax - aw : ax));
      const top = Math.max(8, Math.min(H - ah - 8, ay - ah / 2));
      arrow.style.transform = `translate(${left}px, ${top}px)`;
      const target = arrowFor.group ? arrowFor.group.indices : [arrowFor.o.i];
      arrow.onclick = () => layer.focus(target);
    } else arrow.dataset.on = '0';
  }

  // ── aiming: the surface under the pointer (or the centre of the view), as a place for a sound ──
  let mouse = null;
  /**
   * The first real surface along a ray through screen point (x, y) (the view's centre without
   * one), within 300 m: the point hit, the contract object it belongs to (or the one within 4 m of
   * it), and its distance. A sound placed there sticks to that surface.
   */
  function surfaceAt(x, y) {
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(x === undefined ? 0 : (x / innerWidth) * 2 - 1, y === undefined ? 0 : -(y / innerHeight) * 2 + 1), camera);
    ray.far = 300 * upm();
    const hits = ray.intersectObjects(scene.children, true).filter(h => h.object.visible !== false && (h.object.isMesh || h.object.isInstancedMesh));
    const h = hits[0]; if (!h) return null;
    // you are not something to aim at: the listener's own host is never a target (aiming at the ground
    // near you used to pick "you" as the nearest object, and a copy went "on the you")
    const me = audio.listenerBinding?.anchor?.hostId ?? audio.contract?.scene?.behaviorContract?.listener?.host ?? null;
    const known = new Set((audio.contract?.scene?.objects ?? []).map(o => o.id).filter(id => id !== me));
    let o = h.object; while (o && !known.has(o.name)) o = o.parent;
    const m = upm(), p = h.point, w = new Vector3();
    let hostId = o ? o.name : null;
    if (!hostId) { let best = 4 * m; for (const id of known) { if (!centreOf(id, w)) continue; const d = w.distanceTo(p); if (d < best) { best = d; hostId = id; } } }
    CAM.setFromMatrixPosition(camera.matrixWorld);
    return { hostId, point: [p.x / m, p.y / m, p.z / m], distanceM: p.distanceTo(CAM) / m, scenePoint: p.clone() };
  }
  /** Placing a sound: { mode: 'thing' | 'spot', onChange, onDone, onCancel, target, locked }. */
  let placing = null;
  const sameTarget = (a, b) => !!a && !!b && a.hostId === b.hostId && Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1], a.point[2] - b.point[2]) < 0.15;
  function stepAim() {
    if (!placing) { aim.dataset.on = '0'; return; }
    const overWorld = mouse && mouse.x < visibleX()[1] && mouse.x > visibleX()[0];
    // a raycast through the whole scene (instanced foliage included) costs milliseconds: at most ~15 a second
    const tNow = performance.now();
    if (!placing.locked && tNow - (placing.lastRay ?? 0) >= 66) {
      placing.lastRay = tNow;
      const t = overWorld ? surfaceAt(mouse.x, mouse.y) : surfaceAt();
      if (t && !sameTarget(t, placing.target)) { placing.target = t; placing.onChange?.(placingTarget()); }
    }
    const t = placing.target;
    if (!t) { aim.dataset.on = '0'; return; }
    Q.copy(t.scenePoint).project(camera);
    const x = (Q.x + 1) / 2 * innerWidth, y = (1 - Q.y) / 2 * innerHeight;
    aim.dataset.on = Q.z < 1 ? '1' : '0'; aim.dataset.locked = placing.locked ? '1' : '0';
    aim.style.transform = `translate(${x}px, ${y}px)`;
    const thing = placing.mode === 'thing' && !placing.spot && t.hostId;
    const lift = Math.round((placing.lift ?? 0) * 10) / 10;
    aim.querySelector('span').textContent = `${thing ? `on the ${layer.hostLabel(t.hostId) ?? t.hostId.replace(/_/g, ' ')} (moves with it)` : 'this spot'}${lift ? ` · ${lift > 0 ? '+' : ''}${lift} m` : ''} · ${Math.round(t.distanceM)} m${placing.locked ? '' : ` · click to place · ${t.hostId ? 'Shift: this exact spot · ' : ''}scroll: height`}`;
  }
  // aiming reads like dragging: the thing under the pointer (it moves with it), Shift for that exact
  // spot, scroll for height (Tab still switches)
  const placingTarget = () => {
    if (!placing?.target) return null;
    const onThing = placing.mode === 'thing' && !placing.spot;
    const p = placing.target.point, lift = placing.lift ?? 0;
    return { hostId: onThing ? placing.target.hostId : null, point: [p[0], p[1] + lift, p[2]], distanceM: placing.target.distanceM, mode: onThing ? 'thing' : 'spot' };
  };
  function dropAim() {
    if (!placing?.target) return;
    placing.locked = true; stepAim();
    const done = placing.onDone, t = placingTarget();
    if (placing.stopOnDone) stopPlacing();
    done?.(t);
  }
  const onAimKey = e => {
    if (!placing) return;
    // Shift while typing is a capital letter, not "this exact spot"
    if (e.key === 'Shift' && e.target?.closest?.('input, textarea')) return;
    if (e.key === 'Shift') { const spot = e.type === 'keydown'; if (placing.spot !== spot) { placing.spot = spot; placing.onChange?.(placingTarget()); stepAim(); } return; }
    if (e.type !== 'keydown') return;
    if (e.target?.closest?.('input, textarea')) { if (e.key === 'Escape') { e.preventDefault(); cancelAim(); } return; }
    if (e.key === 'Tab') { e.preventDefault(); placing.mode = placing.mode === 'thing' ? 'spot' : 'thing'; placing.onChange?.(placingTarget()); stepAim(); }
    else if (e.key === 'Enter') { e.preventDefault(); dropAim(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelAim(); }
  };
  function cancelAim() { const c = placing?.onCancel; stopPlacing(); c?.(); }
  const onAimWheel = e => { if (!placing || placing.locked || e.target?.closest?.('.satie-dt')) return; e.preventDefault(); placing.lift = Math.max(-2, Math.min(40, (placing.lift ?? 0) - e.deltaY * 0.01)); placing.onChange?.(placingTarget()); stepAim(); };
  function stopPlacing() { placing = null; aim.dataset.on = '0'; root.dataset.aiming = '0'; canvas.style.cursor = ''; removeEventListener('keydown', onAimKey, true); removeEventListener('keyup', onAimKey, true); removeEventListener('wheel', onAimWheel); }

  // ── dragging a sound you are editing: it slides along the surface under the pointer ──
  /** { indices, onPreview, onDrop, onCancel }: the sound(s) whose panel is open. */
  let editing = null, dragSrc = null, justDragged = false;
  /** Editing the world: { onPreview(i, t), onDrop(i, t), onCancel(i) }: any sound's dot can be dragged. */
  let worldEdit = null;
  /** The thing whose sounds are fanned out (the pointer is near it), and where its dot sits on screen. */
  const editableOrb = o => (!!worldEdit && (o.count ?? 1) === 1) || (!!editing && (o.members ?? [o.i]).some(m => editing.indices.includes(m)));
  /** Who hears a drag of this dot: its open card, else the world edit for that sound. */
  const dragHandlers = o => editing && (o.members ?? [o.i]).some(m => editing.indices.includes(m)) ? editing
    : worldEdit ? { onPreview: d => worldEdit.onPreview?.(o.i, d), onDrop: d => worldEdit.onDrop?.(o.i, d), onCancel: () => worldEdit.onCancel?.(o.i) } : null;
  // written only when it changes: an attribute set every frame restyles every marker every frame
  function paintEditable() { for (const o of orbs.values()) { const v = editableOrb(o) ? '1' : '0'; if (o.el.dataset.edit !== v) o.el.dataset.edit = v; } }
  function dragTarget() {
    const t = dragSrc?.target; if (!t) return null;
    const thing = dragSrc.attach && t.hostId;
    const m = upm();
    return { hostId: thing ? t.hostId : null, point: [t.point[0], t.point[1] + dragSrc.lift, t.point[2]], distanceM: t.distanceM, mode: thing ? 'thing' : 'spot', scenePoint: t.scenePoint.clone().setY(t.scenePoint.y + dragSrc.lift * m) };
  }
  function paintDrag() {
    const t = dragTarget(); if (!t) { aim.dataset.on = '0'; return; }
    Q.copy(t.scenePoint).project(camera);
    aim.dataset.on = Q.z < 1 ? '1' : '0'; aim.dataset.locked = '0';
    aim.style.transform = `translate(${(Q.x + 1) / 2 * innerWidth}px, ${(1 - Q.y) / 2 * innerHeight}px)`;
    const lift = Math.round(dragSrc.lift * 10) / 10;
    aim.querySelector('span').textContent = `${t.hostId ? `onto the ${layer.hostLabel(t.hostId) ?? t.hostId.replace(/_/g, ' ')}` : 'here'}${lift ? ` · ${lift > 0 ? '+' : ''}${lift} m` : ''} · ${Math.round(t.distanceM)} m · ${t.hostId ? 'moves with it · Shift: this exact spot' : 'Shift: this exact spot'} · scroll: height`;
  }
  const onSrcMove = e => {
    if (!dragSrc) return;
    dragSrc.moved = dragSrc.moved || Math.hypot(e.clientX - dragSrc.x0, e.clientY - dragSrc.y0) > 4;
    dragSrc.attach = !e.shiftKey;
    const t = surfaceAt(e.clientX, e.clientY);
    if (t) dragSrc.target = t;
    paintDrag();
    const d = dragTarget(); if (d && dragSrc.moved) dragSrc.h?.onPreview?.(d);
  };
  const onSrcWheel = e => { if (!dragSrc) return; e.preventDefault(); dragSrc.lift = Math.max(-2, Math.min(40, dragSrc.lift - e.deltaY * 0.01)); paintDrag(); const d = dragTarget(); if (d) dragSrc.h?.onPreview?.(d); };
  const onSrcKey = e => { if (!dragSrc) return; if (e.key === 'Escape') { e.preventDefault(); endSourceDrag(false); } else if (e.key === 'Shift') { dragSrc.attach = e.type !== 'keydown'; paintDrag(); } };
  const onSrcUp = () => endSourceDrag(true);
  function startSourceDrag(o, e) {
    dragSrc = { o, h: dragHandlers(o), x0: e.clientX, y0: e.clientY, moved: false, attach: !e.shiftKey, lift: 0, target: null };
    root.dataset.dragging = '1';
    addEventListener('pointermove', onSrcMove); addEventListener('pointerup', onSrcUp);
    addEventListener('wheel', onSrcWheel, { passive: false }); addEventListener('keydown', onSrcKey, true); addEventListener('keyup', onSrcKey, true);
  }
  function endSourceDrag(drop) {
    const d = dragTarget(), moved = dragSrc?.moved, h = dragSrc?.h;
    dragSrc = null; root.dataset.dragging = '0'; aim.dataset.on = '0';
    removeEventListener('pointermove', onSrcMove); removeEventListener('pointerup', onSrcUp);
    removeEventListener('wheel', onSrcWheel); removeEventListener('keydown', onSrcKey, true); removeEventListener('keyup', onSrcKey, true);
    if (!moved) return; // a click, not a drag: select and face it as before
    justDragged = true; setTimeout(() => { justDragged = false; }, 0);
    if (drop && d) h?.onDrop?.(d); else h?.onCancel?.();
  }

  let contractIdsCache = null;
  let unknownCache = null; // unknownObjects(): { at, value }
  // the scene's object kinds as Satie first saw them, per set of contract objects (unknownObjects)
  let baseline = null;
  function objectBaseline() {
    const ids = [...contractIds()].sort().join('\n');
    let h = 5381; for (let k = 0; k < ids.length; k++) h = ((h << 5) + h + ids.charCodeAt(k)) | 0;
    const key = `satie.now.objects:${(h >>> 0).toString(36)}`;
    if (baseline?.key === key) return baseline;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved && Array.isArray(saved.kinds)) return baseline = { key, since: saved.since, collectUntil: saved.collectUntil, kinds: new Set(saved.kinds) };
    } catch { /* no storage: this page's first two minutes are the baseline */ }
    return baseline = { key, since: Date.now(), collectUntil: Date.now() + 120_000, kinds: new Set() };
  }
  function saveBaseline(b) {
    try { localStorage.setItem(b.key, JSON.stringify({ since: b.since, collectUntil: b.collectUntil, kinds: [...b.kinds] })); } catch { /* kept for this page only */ }
  }
  const contractIds = () => contractIdsCache ??= new Set((audio.contract?.scene?.objects ?? []).map(o => o.id));
  // the area a sound you are editing moves within (its `place` region with a wander-type motion), on the ground
  const areas = new Map();
  function drawAreas() {
    const want = new Set(editing ? editing.indices : []);
    for (const [i, m] of areas) if (!want.has(i)) { overlay.remove(m); m.geometry.dispose(); areas.delete(i); }
    for (const i of want) {
      const st = engine.scriptStatements[i];
      const a = st?.areaMin, b = st?.areaMax;
      const sized = st && st.hasPlacement && a && b && (Math.abs(b.x - a.x) > 0.05 || Math.abs(b.z - a.z) > 0.05) && !!st.wanderType && st.wanderType !== 'none' && st.wanderType !== 'fixed';
      let m = areas.get(i);
      if (!sized) { if (m) { overlay.remove(m); m.geometry.dispose(); areas.delete(i); } continue; }
      const u = upm(), y = Math.min(a.y, b.y) * u + 0.03;
      const sig = `${a.x},${a.z},${b.x},${b.z},${y}`;
      if (!m) { m = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color: voiceColor(i), transparent: true, opacity: 0.9, depthWrite: false })); m.frustumCulled = false; overlay.add(m); areas.set(i, m); }
      // rebuilt only when the area changes (it was a new buffer, and a GPU upload, every frame)
      if (m.userData.sig !== sig) {
        m.userData.sig = sig;
        const pts = [a.x, y, a.z, b.x, y, a.z, b.x, y, b.z, a.x, y, b.z].map((v, k) => (k % 3 === 1 ? v : v * u));
        m.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
      }
      m.visible = soundsOn;
    }
  }
  // ── shaping a roaming sound's area (the sound card's "how it moves"): handles in the world ──
  // The layer still writes nothing: it reports where the handles moved (onPreview while dragging,
  // onDrop on release, onCancel on Esc) and the card turns that into script. Metres, like AimTarget.
  /** { shape: { kind: 'area', min: [x,y,z], max: [x,y,z] }, h: { onPreview, onDrop, onCancel }, start, els, drag } */
  let shaping = null;
  const SHAPE_HANDLES = ['min', 'max', 'mid'];
  function shapeCorner(s, which) {
    const y = Math.min(s.min[1], s.max[1]);
    if (which === 'min') return [s.min[0], y, s.min[2]];
    if (which === 'max') return [s.max[0], y, s.max[2]];
    return [(s.min[0] + s.max[0]) / 2, y, (s.min[2] + s.max[2]) / 2];
  }
  function paintShape() {
    if (!shaping) return;
    const m = upm();
    for (const which of SHAPE_HANDLES) {
      const el = shaping.els[which], p = shapeCorner(shaping.shape, which);
      Q.set(p[0] * m, p[1] * m, p[2] * m).project(camera);
      el.hidden = Q.z >= 1;
      el.style.transform = `translate(${(Q.x + 1) / 2 * innerWidth}px, ${(1 - Q.y) / 2 * innerHeight}px)`;
    }
  }
  const onShapeMove = e => {
    const d = shaping?.drag; if (!d) return;
    const t = surfaceAt(e.clientX, e.clientY); if (!t) return;
    const s = shaping.shape, [x, , z] = t.point;
    if (d === 'min') shaping.shape = { ...s, min: [x, s.min[1], z] };
    else if (d === 'max') shaping.shape = { ...s, max: [x, s.max[1], z] };
    else {
      const c = shapeCorner(s, 'mid'), dx = x - c[0], dz = z - c[2];
      shaping.shape = { ...s, min: [s.min[0] + dx, s.min[1], s.min[2] + dz], max: [s.max[0] + dx, s.max[1], s.max[2] + dz] };
    }
    shaping.moved = true;
    paintShape();
    shaping.h.onPreview?.(normalShape(shaping.shape));
  };
  const onShapeUp = () => {
    if (!shaping?.drag) return;
    shaping.drag = null; root.dataset.dragging = '0';
    removeEventListener('pointermove', onShapeMove); removeEventListener('pointerup', onShapeUp);
    if (shaping.moved) { shaping.moved = false; shaping.start = shaping.shape; shaping.h.onDrop?.(normalShape(shaping.shape)); }
  };
  const onShapeKey = e => {
    if (e.key !== 'Escape' || !shaping) return;
    e.preventDefault();
    const h = shaping.h, dragging = !!shaping.drag;
    if (dragging) { removeEventListener('pointermove', onShapeMove); removeEventListener('pointerup', onShapeUp); shaping.drag = null; root.dataset.dragging = '0'; }
    shaping.shape = shaping.start; paintShape();
    h.onCancel?.();
  };
  /** Min below max on each axis, whichever way the corners were dragged. */
  function normalShape(s) {
    const lo = [0, 1, 2].map(k => Math.min(s.min[k], s.max[k])), hi = [0, 1, 2].map(k => Math.max(s.min[k], s.max[k]));
    return { kind: 'area', min: lo, max: hi };
  }
  function endShape() {
    if (!shaping) return;
    if (shaping.drag) { removeEventListener('pointermove', onShapeMove); removeEventListener('pointerup', onShapeUp); root.dataset.dragging = '0'; }
    removeEventListener('keydown', onShapeKey, true);
    for (const el of Object.values(shaping.els)) el.remove();
    shaping = null;
  }
  function editShape(shape, h = {}) {
    endShape();
    if (!shape || shape.kind !== 'area') return;
    const els = {};
    for (const which of SHAPE_HANDLES) {
      const el = document.createElement('div'); el.className = 'shape-h'; el.dataset.handle = which;
      el.title = which === 'mid' ? 'drag to move the area' : 'drag to reshape the area';
      el.addEventListener('pointerdown', e => {
        if (!shaping) return;
        e.preventDefault(); e.stopPropagation();
        shaping.drag = which; root.dataset.dragging = '1';
        addEventListener('pointermove', onShapeMove); addEventListener('pointerup', onShapeUp);
      });
      root.appendChild(el); els[which] = el;
    }
    shaping = { shape: normalShape(shape), start: normalShape(shape), h, els, drag: null, moved: false };
    addEventListener('keydown', onShapeKey, true);
    paintShape();
  }
  /** Where an object is: its bound geometry's centre (the runtime's), else its origin. */
  function centreOf(id, out) {
    const hc = audio.hostCentre?.(id, out);
    if (hc) return out;
    const o = scene.getObjectByName(id); if (!o) return null;
    return o.getWorldPosition(out);
  }
  const layer = {
    connect(p) { panel = p; },
    setActive(open) { active = open; if (!open) { focus = null; selection = null; } apply(); },
    setFocus(on) { focusMode = !!on; apply(); },
    setNamer(fn, hosts = null, counts = null) { namer = fn; hostNamer = hosts; hostCounter = counts; for (const o of orbs.values()) { o.labelKey = null; renderLabel(o); } },
    /** The sounds of a thing opened in the mixer (null: none): they fan out round its tag, as a thing picked in the world does. */
    reveal(indices) { revealed = indices && indices.length ? new Set(indices) : null; for (const o of orbs.values()) o.labelKey = null; },
    /**
     * Place a sound by aiming: a marker sticks to the surface under the pointer (the view's centre
     * when the pointer is off the world) and follows as you look around; a click or Enter drops it,
     * Tab switches between on the thing it hit and this exact spot, Escape cancels. `onChange` hears
     * every new target, `onDone` the dropped one; with `stayOpen` it keeps aiming after a drop.
     */
    /**
     * The sound(s) whose panel is open: their dots can be dragged in the world. `onPreview` hears the
     * place under the pointer as it moves (play it from there), `onDrop` the place it was let go at,
     * `onCancel` an Escape. Null ends editing.
     */
    setWorldEdit(handlers) { worldEdit = handlers ?? null; if (!worldEdit && dragSrc && !editing) endSourceDrag(false); for (const o of orbs.values()) { o.labelKey = null; renderLabel(o); } paintEditable(); },
    /** Draggable handles for a roaming sound's area (null ends it); reports the shape, writes nothing. */
    editShape,
    setEditing(indices, handlers = {}) { editing = indices?.length ? { indices, ...handlers } : null; if (!editing && dragSrc) endSourceDrag(false); paintEditable(); updateShells(); },
    startPlacing({ mode = 'thing', onChange, onDone, onCancel, stayOpen = false } = {}) {
      stopPlacing();
      placing = { mode, onChange, onDone, onCancel, target: null, locked: false, stopOnDone: !stayOpen, spot: false, lift: 0 };
      root.dataset.aiming = '1'; canvas.style.cursor = 'crosshair';
      addEventListener('keydown', onAimKey, true); addEventListener('keyup', onAimKey, true);
      addEventListener('wheel', onAimWheel, { passive: false });
      stepAim();
    },
    stopPlacing,
    /** Aim again after a drop (the target follows the pointer until the next click). */
    unlockPlacing() { if (placing) { placing.locked = false; stepAim(); } },
    /** The surface under the centre of the view and its contract object (the same aim as placing). */
    lookTarget() { const t = surfaceAt(); return t ? { hostId: t.hostId, point: t.point } : null; },
    setHostLabel(id, label) {
      const o = audio.contract?.scene?.objects?.find(x => x.id === id);
      if (o) { if (label) o.label = label; else delete o.label; }
      for (const orb of orbs.values()) { orb.labelKey = null; renderLabel(orb); }
    },
    states() { return (audio.contract?.scene?.states ?? []).map(s => s.name); },
    hosts() { return (audio.contract?.scene?.objects ?? []).map(o => ({ id: o.id, ...(o.label ? { label: o.label } : {}) })); },
    hostLabel(id) { return audio.contract?.scene?.objects?.find(o => o.id === id)?.label?.trim() || undefined; },
    // the contract's vocabulary with its meanings: the mixer's "when it plays" offers these, never a fixed list
    events() { return (audio.contract?.scene?.events ?? []).map(e => ({ name: e.name, ...(e.description ? { description: e.description } : {}), ...(e.with ? { with: e.with } : {}) })); },
    stateInfo() { return (audio.contract?.scene?.states ?? []).map(s => ({ name: s.name, ...(s.description ? { description: s.description } : {}) })); },
    signals() { return (audio.contract?.scene?.signals ?? []).map(s => ({ name: s.name, ...(s.description ? { description: s.description } : {}), ...(s.min != null ? { min: s.min } : {}), ...(s.max != null ? { max: s.max } : {}) })); },
    eventInfo(name) { const e = (audio.contract?.scene?.events ?? []).find(x => x.name === name); return e ? { ...(e.with ? { with: e.with } : {}), ...(e.by ? { by: e.by } : {}), ...(e.surfaces?.length ? { surfaces: e.surfaces } : {}), ...(e.after?.event ? { after: e.after } : {}) } : undefined; },
    setSounds(on) { soundsOn = on; for (const m of shells.values()) m.visible = on; apply(); },
    setSelection(sel) {
      selection = sel && sel.indices.length ? sel : null;
      for (const o of orbs.values()) renderLabel(o);
      updateBednote(); updateShells();
    },
    setHover(i, fromRow) {
      hoveredIndex = i;
      // a row hovered in the mixer lights up the marker that carries it
      const o = i === null ? null : [...orbs.values()].find(x => x.primary && (x.members ?? [x.i]).includes(i)) ?? null;
      setHoverLocal(o, fromRow);
      updateShells(); // two rows on one object share a marker: the shell still changes with the row
      if (i !== null && !o) updateBednote();
    },
    /** Turn toward an object by id (where a sound not in the scene yet would go). */
    focusHost(id) {
      const o = look && scene.getObjectByName(id);
      if (!o) return false;
      const point = new Vector3(); centreOf(id, point);
      const v = look.get();
      focus = { indices: [], point, t0: performance.now(), yaw0: v.yaw, pitch0: v.pitch };
      return true;
    },
    focus(indices) {
      if (!targetOf(indices)) return;
      if (look) { const v = look.get(); focus = { indices, t0: performance.now(), yaw0: v.yaw, pitch0: v.pitch }; return; }
      // a third-person game gives where the player stands and how to move them: turn the character to face it
      const at = position?.();
      if (teleport && at && Number.isFinite(at.yaw)) focus = { indices, t0: performance.now(), yaw0: at.yaw, turn: true };
    },
    /** Where the player stands and faces now (scene units), so a reload can put them back (2026-11-11). */
    whereYouStand() {
      const at = position?.();
      if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) return { x: at.x, z: at.z, yaw: Number.isFinite(at.yaw) ? at.yaw : (look?.get().yaw ?? 0) };
      camera.updateMatrixWorld();
      const cam = new Vector3().setFromMatrixPosition(camera.matrixWorld);
      return { x: cam.x, z: cam.z, yaw: look?.get().yaw ?? 0 };
    },
    /** Put the player back where `whereYouStand` said (needs the host's `teleport`); false when it cannot. */
    standAt: spot => {
      if (!teleport || !spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) return false;
      teleport(spot.x, spot.z, Number.isFinite(spot.yaw) ? spot.yaw : 0);
      if (look && Number.isFinite(spot.yaw)) { const v = look.get(); look.set(spot.yaw, v.pitch); }
      return true;
    },
    /** Go there: stand a few metres from the sound, facing it (needs the host's `teleport`). */
    goTo: teleport ? indices => {
      const p = targetOf(indices); if (!p) return;
      camera.updateMatrixWorld();
      // from where the player stands: the camera in first person; a third-person game passes `position`
      // (its camera trails behind, and "go" started the walk back there, at the bottom of the screen)
      const cam = new Vector3().setFromMatrixPosition(camera.matrixWorld);
      const at = position?.();
      const cp = at && Number.isFinite(at.x) && Number.isFinite(at.z) ? new Vector3(at.x, cam.y, at.z) : cam;
      const away = new Vector3(cp.x - p.x, 0, cp.z - p.z);
      if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
      away.normalize().multiplyScalar(4 * upm());
      const x = p.x + away.x, z = p.z + away.z;
      // glide there (so it reads as moving, not as turning your head), then face it
      const d = Math.hypot(x - cp.x, z - cp.z);
      // the turn starts from where you face: the look, else the walker's heading from `position`
      const from = look?.get() ?? { yaw: Number.isFinite(at?.yaw) ? at.yaw : 0, pitch: 0 };
      glide = { x0: cp.x, z0: cp.z, x, z, y: p.y, t0: performance.now(), ms: Math.min(1400, 350 + d * 12), indices, yaw0: from.yaw, pitch0: from.pitch };
      // named by the thing it went to (the nearest of several), not the first in the list
      const went = nearestThing([...orbs.values()].filter(o => indices.includes(o.i) && o.world))[0];
      const name = went && went.host !== 'scene' ? labelFor(went.host) : 'the sound';
      toast(`moving ${Math.round(d / upm())} m to ${name}`);
    } : undefined,
    fired(i) { firedAt.set(i, performance.now()); },
    ripple(i) {
      const t = performance.now(), k = soundKey(i), ev = (eventsOf.get(k) ?? []).filter(x => t - x < RIPPLE_WINDOW_MS); ev.push(t); eventsOf.set(k, ev);
      if (ev.length >= RIPPLE_REPEATS) return;
      // an opened thing's centre first, else the marker carrying the sound (a thing's marker is its first sound's)
      for (const [h, hm] of hostMarks) if (hm.list.some(o => o.i === i)) ring(hm.el, h);
      for (const o of orbs.values()) if (o.i === i || o.members?.includes(i)) ring(o.el, o.host);
    },
    hostMotion(id) { return audio.contract?.scene?.objects?.find(o => o.id === id)?.motion; },
    visibleIndices() {
      // In view is exactly what is on screen (2026-10-18): on the part of the game's screen the panel does
      // not cover, seen from the game's camera (third person: what you see, not where the character faces).
      // No size, distance or hearing threshold: a small silent cat is in. The mixer orders and folds the list.
      // Projected now, from where each sound is: right with the markers hidden ("sounds" off) or not drawn yet.
      camera.updateMatrixWorld();
      return [...orbs.values()].filter(inFrame).map(o => o.i);
    },
    surfaces() { return (audio.contract?.scene?.events ?? []).flatMap(e => e.surfaces ?? []); },
    // "you": the object the person plays as (the scene's `player`), else what the ears are bound to
    listenerHost() { return audio.contract?.scene?.player ?? audio.listenerBinding?.anchor?.hostId ?? audio.contract?.scene?.behaviorContract?.listener?.host ?? null; },
    /**
     * Kinds of named objects at the top of the game's scene that appeared after Satie first saw it and
     * that the contract does not list: what an agent added without telling Satie (a dog). A world names
     * all its decoration too (Jewelers Row: 663 buildings, curbs, signs), so the first two minutes the
     * mixer sees a scene are its baseline (kept on this device, per set of contract objects: it starts
     * over when the contract learns new objects). Numbered objects count as their kind (`pedestrian_042`
     * is `pedestrian`), so spawned crowds are one kind. A named object holding contract objects is a
     * container (a level's root) and is looked into; lights, cameras and objects marked
     * `userData.satie = false` are skipped. Cached for five seconds (the live context box asks each second).
     */
    unknownObjects() {
      const t = performance.now();
      if (unknownCache && t - unknownCache.at < 5000) return unknownCache.value;
      const known = contractIds(), found = [];
      const holdsKnown = o => { let hit = false; o.traverse(c => { if (!hit && known.has(c.userData?.satieId ?? c.name)) hit = true; }); return hit; };
      const visit = (parent, depth) => {
        for (const c of parent.children) {
          if (c.userData?.satie === false || c.isLight || c.isCamera) continue;
          const id = c.userData?.satieId ?? c.name;
          if (id && known.has(id)) continue;
          if (depth < 3 && (!id || holdsKnown(c))) { visit(c, depth + 1); continue; }
          if (id) found.push(id);
        }
      };
      visit(scene, 0);
      const kinds = [...new Set(found.map(id => /^(.+?)[_-]\d+$/.exec(id)?.[1] ?? id))];
      const base = objectBaseline();
      let fresh = [];
      if (Date.now() < base.collectUntil) { for (const k of kinds) base.kinds.add(k); saveBaseline(base); }
      else fresh = kinds.filter(k => !base.kinds.has(k));
      unknownCache = { at: t, value: { ids: fresh.slice(0, 12), total: fresh.length, since: base.since } };
      return unknownCache.value;
    },
    render,
    destroy() {
      // modes still open leave no listeners behind (a placement, a dot being dragged, an area being shaped)
      endShape(); if (placing) stopPlacing(); if (dragSrc) endSourceDrag(false);
      removeEventListener('pointermove', onPtr);
      veil.geometry.dispose(); veil.material.dispose();
      removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onDrag); canvas.removeEventListener('pointerup', onUp);
      root.remove(); style.remove();
    },
  };
  return layer;
}
