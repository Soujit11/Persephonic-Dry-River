import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { SatieScene } from './three.js';

/** Mount once inside Canvas. Wait for onReady, then call audio.start() in a user gesture. */
export function SatieAudio({ contract, bindings, scriptUrl, samplesUrl, seed, listener, listenerOffset, listenerOrientation, onReady, onError, mixer, onMixer }) {
  const { scene, camera, gl } = useThree();
  const [loaded, setLoaded] = useState(null);
  const audio = useRef(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const listenerProps = useRef(null);
  listenerProps.current = { listener, listenerOffset, listenerOrientation };
  useEffect(() => {
    if (audio.current) applyListener(audio.current, listenerProps.current);
  }, [listener, listenerOffset, listenerOrientation]);
  useEffect(() => {
    let alive = true;
    const runtime = new SatieScene({ contract, seed });
    runtime.load(scriptUrl, samplesUrl).then(() => {
      if (!alive) return;
      runtime.bindAll(scene, bindings);
      applyListener(runtime, listenerProps.current);
      runtime.update(camera);
      audio.current = runtime;
      setLoaded(runtime);
      callbacks.current.onReady?.(runtime);
    }).catch(error => {
      runtime.dispose();
      if (alive) callbacks.current.onError?.(error);
    });
    return () => { alive = false; if (audio.current === runtime) audio.current = null; setLoaded(null); runtime.dispose(); };
  }, [scene, contract, bindings, scriptUrl, samplesUrl, seed]);
  // Development: the mixer with its world sound layer (mountMixer), loaded only when asked for, so a
  // production build that passes no `mixer` carries none of it.
  const mixerOptions = useRef(mixer);
  mixerOptions.current = mixer;
  const onMixerRef = useRef(onMixer);
  onMixerRef.current = onMixer;
  useEffect(() => {
    if (!mixer || !loaded) return;
    let alive = true, mounted = null;
    import('./mixer.js').then(({ mountMixer }) => {
      if (!alive) return;
      const options = mixerOptions.current === true ? {} : mixerOptions.current;
      mounted = mountMixer(loaded, { scene, camera, renderer: gl, ...options });
      onMixerRef.current?.(mounted);
    }).catch(error => callbacks.current.onError?.(error));
    return () => { alive = false; mounted?.destroy(); onMixerRef.current?.(null); };
  }, [!!mixer, loaded, scene, camera, gl]);
  useFrame(() => audio.current?.update(camera));
  return null;
}

function applyListener(runtime, { listener, listenerOffset, listenerOrientation }) {
  // Omitted props leave imperative onReady bindings under the game's control.
  if (listener === undefined) return;
  if (listener === null) runtime.unbindListener();
  else runtime.bindListener(listener, { offset: listenerOffset, orientation: listenerOrientation });
}
