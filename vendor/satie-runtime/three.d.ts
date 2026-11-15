import type { Camera, Object3D, Vector3 } from 'three';
import type { Scene, WebGLRenderer, PerspectiveCamera } from 'three';
import { SceneRuntime, type SceneRuntimeOptions } from './dist/integration/SceneRuntime';
import type { RuntimeEventEvidence } from './dist/integration/contracts';
import type { LocateLayer, Devtools, DevtoolsOptions } from './dist/devtools/index';
export interface ListenerBindingOptions {
  /** Local offset in scene units, transformed with the object. */
  offset?: readonly [number, number, number];
  /** Defaults to the position object. Use a camera to pan with the view. */
  orientation?: Object3D;
}
export class SatieScene extends SceneRuntime {
  constructor(options?: SceneRuntimeOptions);
  static load(scriptUrl?: string, samplesUrl?: string, options?: SceneRuntimeOptions): Promise<SatieScene>;
  /** Bind a host; its place is its geometry's centre (`anchor: 'origin'` keeps the object's origin). */
  bind(id: string, object: Object3D, options?: { anchor?: 'bounds' | 'origin' }): void;
  /** Contract positions that disagree with where the bound objects really are. */
  readonly bindWarnings: string[];
  /** A bound host's place now (scene units, its geometry's centre) and size in metres; null when unbound. */
  hostCentre(id: string, out?: Vector3): { position: Vector3; sizeM: [number, number, number] | null } | null;
  bindLine(id: string, object: Object3D, points: ReadonlyArray<readonly [number, number, number]>, width: number, reach?: number): void;
  bindAll(root: Object3D, names?: Record<string, string>): void;
  bindListener(object: Object3D, options?: ListenerBindingOptions): void;
  unbindListener(): void;
  /** A camera is required only when no listener object is bound. */
  update(camera?: Camera): void;

  // Events, signals and states (runtime 0.4.5)
  /** The surface under a host now; one map shared by its footsteps, landings and drops. Set it before the event fires. null clears it. */
  setHostSurface(id: string, surface: string | null): void;
  hostSurface(id: string): string | null;
  /** Fire an event from a bound host: at its geometry centre, with its surface as the text when the event declares surfaces (`text` overrides), the host as the event's body. */
  hostEvent(id: string, name: string, options?: { text?: string; evidence?: Omit<RuntimeEventEvidence, 'bodyId'> }): boolean;
  /**
   * A signal's target: eased toward in update() (exponential, `smoothS`, default 0.1 s) and published only when the
   * value moved by `threshold` (default 1 percent of the declared range, else 0.01) or arrived. The first target
   * publishes at once; a direct `signal()` cancels the easing.
   */
  signalTarget(name: string, value: number, options?: { smoothS?: number; threshold?: number }): void;
  /** Bind a host that exists only for its sound; released (unbind) on its own once nothing at it plays or waits to play, after `graceS` (default 0.5 s). */
  bindTransient(id: string, object: Object3D, options?: { anchor?: 'bounds' | 'origin'; graceS?: number; onRelease?: (id: string) => void }): void;
  /** Release a transient host now; false when `id` is not a transient host. */
  releaseTransient(id: string): boolean;
}
export function manifestFrom(root: Object3D, options?: {
  unitsPerMeter?: number; include?: (object: Object3D) => boolean; material?: (object: Object3D) => string | undefined;
}): { engine: string; listener: string; unitsPerMeter: number; objects: Array<{
  id: string; label: string; position: [number, number, number]; sizeM: [number, number, number];
  material?: string; motion: string; occludes?: boolean;
}> };

export interface LocateLook {
  /** The first-person view's yaw and pitch, radians (facing -Z at yaw 0). */
  get(): { yaw: number; pitch: number };
  set(yaw: number, pitch: number): void;
}
/** The mixer's sound layer in the world: pass it to devtools as `locate`, and call render() after the game renders each frame. */
export function locate(audio: SatieScene, options: {
  scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; look?: LocateLook | null;
  /**
   * Move the player to (x, z) in scene units, facing yaw: enables "go there" on a sound. `targetY` is
   * the height of the sound you are going to (scene units), so the host can land you on its level
   * (the car on the street, not the elevated track above it); ignore it to keep your own height.
   */
  teleport?: ((x: number, z: number, yaw: number, targetY?: number) => void) | null;
  /** Where the player stands (scene units) and faces (yaw), for a third-person game whose camera is not the player: "go" walks and turns from there. */
  position?: (() => { x: number; z: number; yaw?: number }) | null; dom?: HTMLElement;
}): LocateLayer & { render(): void };

/** The development capture recorder (`satie-runtime/three` `recordCaptures`, mounted by `mountMixer`). See CAPTURE.md. */
export interface CaptureRecorder {
  /** True once the dev plugin answered and the recorder is armed; false when there is no plugin (nothing starts). */
  ready: Promise<boolean>;
  /** Whether this recorder's capture is open now. */
  readonly active: boolean;
  /** End the capture now; the last segment is posted. */
  end(): void;
  /** End the capture, post the last segment, stop listening. */
  stop(): void;
  /** Settles when every post so far has been answered. */
  flush(): Promise<void>;
}
export interface CaptureRecorderOptions {
  /** The plugin route (default `/__satie/capture`). */
  url?: string;
  /** Close a segment on its own every this many seconds (default 300; 0 leaves it to the caps). */
  maxSegmentS?: number;
  fetch?: typeof fetch;
}
/**
 * Begin a capture on the first play and post every segment to the dev plugin, which writes it under
 * `.satie/captures/` and keeps it on the developer's Satie account when signed in. Without the plugin
 * nothing starts. A capture the page began itself is left alone.
 */
export function recordCaptures(audio: SceneRuntime, options?: CaptureRecorderOptions): CaptureRecorder;

/** What `mountMixer` returns: the panel and its world layer, and their lifecycle. */
export interface MountedMixer {
  panel: Devtools;
  layer: LocateLayer & { render(): void };
  /** The session recorder, or null when `capture: false`. */
  capture: CaptureRecorder | null;
  open(): void;
  close(): void;
  toggle(): void;
  /** Remove the panel and the layer and put back the scene's own onAfterRender. */
  destroy(): void;
}
/**
 * The mixer for a Three.js world in one call (development only): the panel with its world sound layer
 * (every positioned sound as a dot, linked with the mixer rows), drawn after each frame from the scene's
 * onAfterRender for this camera. Pass the devtools options you would pass `devtools` (script, collapsed,
 * context, onOpenChange, ...); `locate` is made for you.
 */
export function mountMixer(audio: SatieScene, options: {
  scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; look?: LocateLook | null;
  teleport?: ((x: number, z: number, yaw: number, targetY?: number) => void) | null;
  position?: (() => { x: number; z: number; yaw?: number }) | null; dom?: HTMLElement;
  /** Record every test session as a capture through the dev plugin (default true; false turns it off). */
  capture?: boolean | CaptureRecorderOptions;
} & Omit<DevtoolsOptions, 'locate'>): MountedMixer;
