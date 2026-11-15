import type { RuntimeContract } from './dist/integration/contracts';
import type { SatieScene, MountedMixer } from './three';
import type { DevtoolsOptions } from './dist/devtools/index';
import type { Object3D } from 'three';
export function SatieAudio(props: {
  contract: RuntimeContract; bindings?: Record<string, string>; scriptUrl?: string; samplesUrl?: string; seed?: number;
  /** Assign the listener without reloading audio. Null restores the render camera. */
  listener?: Object3D | null; listenerOffset?: readonly [number, number, number]; listenerOrientation?: Object3D;
  onReady?: (scene: SatieScene) => void; onError?: (error: unknown) => void;
  /**
   * Development only: mount the Satie mixer with its world sound layer (mountMixer) once the scene loads.
   * `true`, or the devtools options (script, collapsed, context, onOpenChange, ...). Pass it only under
   * your dev flag (`mixer={import.meta.env.DEV && { ... }}`) so a production build carries no mixer.
   */
  mixer?: boolean | Omit<DevtoolsOptions, 'locate'>;
  /** The mounted mixer (open it from the badge), or null when it unmounts. */
  onMixer?: (mixer: MountedMixer | null) => void;
}): null;
