import { devtools } from './lib/devtools/index.js';
import { locate } from './locate.js';
import { recordCaptures } from './capture.js';

/**
 * The Satie mixer for a Three.js world in one call (satie-runtime/three `mountMixer`, development only):
 * the panel (`devtools`) with its world sound layer (`locate`: every positioned sound as a dot in its
 * voice colour, linked with the mixer rows, draggable in Edit), drawn after each frame the game renders.
 * The layer draws from the scene's `onAfterRender` (a game's own callback keeps running first), and only
 * for the camera it was given, so a second view of the same scene (a minimap) gets no sound overlay.
 *
 *   const mixer = mountMixer(satie, { scene, camera, renderer, script: '/satie/scene.satie', collapsed: true,
 *     context: () => satie.authoringContext(), onOpenChange: open => credit.setPanelOpen(open) });
 *   credit's onOpen: () => mixer.open();   unmounting: mixer.destroy();
 *
 * With the mixer mounted, every test session is a capture (spec 011 A.6, 2026-11-08): when the
 * `satie-runtime/vite` plugin answers, `recordCaptures` begins a capture on the first play and posts
 * each segment to it (`.satie/captures/`, and the developer's Satie account when signed in; CAPTURE.md).
 * `capture: false` turns that off; `capture: { url, maxSegmentS }` tunes it (60 s segments by default). Off when the plugin is absent.
 */
export function mountMixer(audio, { scene, camera, renderer, look = null, teleport = null, position = null, dom, capture = true, ...options } = {}) {
  const layer = locate(audio, { scene, camera, renderer, look, teleport, position, ...(dom ? { dom } : {}) });
  const panel = devtools(audio.engine, { ...options, locate: layer });
  const recorder = capture === false ? null : recordCaptures(audio, typeof capture === 'object' ? capture : {});
  const previous = scene.onAfterRender;
  const afterRender = function (r, s, c, ...rest) {
    previous?.call(this, r, s, c, ...rest);
    if (c === camera) layer.render();
  };
  scene.onAfterRender = afterRender;
  let destroyed = false;
  return {
    panel, layer, capture: recorder,
    open: () => panel.open(),
    close: () => panel.close(),
    toggle: () => panel.toggle(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // put back the game's callback, unless something replaced ours since
      if (scene.onAfterRender === afterRender) scene.onAfterRender = previous;
      recorder?.stop();
      panel.destroy();
      layer.destroy();
    },
  };
}
