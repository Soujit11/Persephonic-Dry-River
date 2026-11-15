import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { SceneRuntime } from './lib/integration/SceneRuntime.js';
export { locate } from './locate.js';
export { mountMixer } from './mixer.js';

/** Maintained Three.js adapter. World transforms are converted to metres exactly once. */
export class SatieScene extends SceneRuntime {
  bindings = new Map();
  identityObjects = new Map();
  matrix = new Float64Array(16);
  /** Scratch for a host's world matrix in metres (A.5, 2026-11-08); copied into the runtime each frame. */
  hostMatrix = new Float64Array(16);
  listenerBinding = null;
  listenerPosition = new Vector3();
  listenerQuaternion = new Quaternion();
  listenerMatrix = new Matrix4();
  listenerScale = new Vector3(1, 1, 1);
  constructor(options = {}) {
    super(options);
    if (options.contract?.coordinates && options.contract.coordinates.frame !== 'threejs') {
      this.dispose();
      throw new Error('The Three.js adapter needs a threejs coordinate frame. Convert native contracts explicitly.');
    }
    this.unitsPerMeter = options.contract?.scene.unitsPerMeter ?? 1;
    if (!(this.unitsPerMeter > 0) || !Number.isFinite(this.unitsPerMeter)) {
      this.dispose();
      throw new Error('unitsPerMeter must be a finite positive number.');
    }
  }
  static async load(scriptUrl = '/satie/scene.satie', samplesUrl = '/satie/samples.json', options = {}) {
    const scene = new SatieScene(options);
    await scene.load(scriptUrl, samplesUrl);
    return scene;
  }
  /**
   * Bind a host to the object it sounds from. Its place is the CENTRE OF ITS GEOMETRY (fixed in the
   * object's own frame, so it moves with it), not the object's origin: a merged or instanced mesh
   * (geometry baked in world coordinates) has its origin at the world origin, and a sound bound to
   * it would sit there, metres from what you see. `{ anchor: 'origin' }` keeps the origin for an
   * object whose pivot IS the source (a speaker cone). The contract's position for the object is
   * checked against where it really is; a disagreement is a warning (`bindWarnings`).
   */
  bind(id, object, { anchor = 'bounds' } = {}) {
    if (!object?.isObject3D) throw new Error(`Missing Object3D for Satie host ${id}`);
    for (const [host, bound] of this.identityObjects) {
      if (host !== id && bound === object) throw new Error(`Object already has Satie host ${host}; destroy that binding before assigning ${id}`);
    }
    const previous = this.identityObjects.get(id);
    if (previous && previous !== object) this.destroyObject(id);
    this.identityObjects.set(id, object);
    this.objectInstanceId(id);
    const binding = { object, position: new Vector3(), local: null, sizeM: null };
    if (anchor === 'bounds') {
      object.updateWorldMatrix(true, true);
      const box = new Box3().setFromObject(object);
      if (!box.isEmpty()) {
        const c = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
        binding.local = object.worldToLocal(c.clone());
        binding.sizeM = [size.x, size.y, size.z].map(v => v / this.unitsPerMeter);
        const declared = this.contract?.scene?.objects?.find(o => o.id === id)?.position;
        if (Array.isArray(declared) && declared.length === 3) {
          const m = c.clone().divideScalar(this.unitsPerMeter);
          const apart = Math.hypot(m.x - declared[0], m.y - declared[1], m.z - declared[2]);
          if (apart > Math.max(2, 0.75 * Math.max(...binding.sizeM))) {
            const msg = `Host ${id}: the bound object's geometry is centred at (${[m.x, m.y, m.z].map(v => v.toFixed(1)).join(', ')}) but the contract says (${declared.map(v => (+v).toFixed(1)).join(', ')}), ${apart.toFixed(0)} m apart. Bind the object the contract describes, or correct the contract.`;
            this.bindWarnings.push(msg); console.warn(`[satie] ${msg}`);
          }
        }
      }
    }
    this.bindings.set(id, binding);
  }
  bindWarnings = [];
  /** Where a bound host is now, in scene units (its geometry's centre), and its size in metres; null when unbound. */
  hostCentre(id, out = new Vector3()) {
    const b = this.bindings.get(id); if (!b) return null;
    b.object.updateWorldMatrix(true, false);
    if (b.local) out.copy(b.local).applyMatrix4(b.object.matrixWorld); else b.object.getWorldPosition(out);
    return { position: out, sizeM: b.sizeM };
  }
  /** Centreline in the object's local coordinates; transformed along with its visible geometry. */
  bindLine(id, object, points, width, reach = 0) {
    if (points.length < 2 || points.some(p => p.length !== 3 || !p.every(Number.isFinite)) ||
      !Number.isFinite(width) || width < 0 || !Number.isFinite(reach) || reach < 0) throw new Error('Invalid host line');
    this.bind(id, object);
    Object.assign(this.bindings.get(id), { localPoints: points.map(p => new Vector3(...p)),
      line: { polyline: points.map(() => new Vector3()), halfM: width / 2, reachM: reach }, width, reach });
  }
  bindAll(root, names = {}) {
    for (const host of this.contract?.scene.objects ?? []) {
      const matches = [];
      root.traverse(object => {
        const matchesId = names[host.id] ? object.name === names[host.id] : (object.userData?.satieId ?? object.name) === host.id;
        if (matchesId) matches.push(object);
      });
      if (matches.length !== 1) throw new Error(`Host ${host.id} needs exactly one object; found ${matches.length}. Bind it explicitly.`);
      this.bind(host.id, matches[0]);
    }
  }
  destroyObject(id) { super.destroyObject(id); this.identityObjects.delete(id); }
  unbind(id) { this.bindings.delete(id); this.surfaces.delete(id); this.transients.delete(id); super.unbind(id); }

  // ── Events, signals and states (runtime 0.4.5, 2026-11-06): the patterns the middleware that works uses ──
  /** One surface per emitting host (footsteps, landings and drops share it), set before the event fires. */
  surfaces = new Map();
  /** Signal targets the runtime eases toward and publishes on change (name -> { target, current, sent, smoothS, threshold }). */
  targets = new Map();
  /** Hosts that exist only for their sound; released on their own once nothing at them plays (id -> { since, graceS, onRelease }). */
  transients = new Map();
  lastTick = null;

  /** The surface under a host now (the material its feet, wheels or body are on); null clears it. */
  setHostSurface(id, surface) { if (surface == null) this.surfaces.delete(id); else this.surfaces.set(id, String(surface)); }
  hostSurface(id) { return this.surfaces.get(id) ?? null; }
  /**
   * Fire an event from a bound host: at the host's geometry centre, with the host's surface as the
   * event text when the event declares surfaces (pass `text` to override, for a foot that landed on
   * something else), and the host as the event's body. Steps, landings and drops from one object read
   * one surface map; set it before the event fires, since the engine reads it then.
   */
  hostEvent(id, name, { text, evidence } = {}) {
    const centre = this.hostCentre(id);
    if (!centre) throw new Error(`Host ${id} is not bound; bind it (or bindTransient) before firing events from it.`);
    const declared = this.contract?.scene?.events?.find(e => e.name === name)?.surfaces;
    const surface = text ?? (declared?.length ? this.surfaces.get(id) : undefined);
    if (declared?.length && surface == null) throw new Error(`Event ${name} needs a surface: setHostSurface('${id}', surface) before it fires, or pass { text }.`);
    const p = centre.position;
    return this.event(name, { x: p.x, y: p.y, z: p.z }, surface, { bodyId: id, ...(evidence ?? {}) });
  }

  /**
   * A signal's target. The runtime eases the published value toward it (exponential, `smoothS`,
   * default 0.1 s) in update(), and publishes only when the value moved by `threshold` since the
   * last publish (default 1 percent of the signal's declared range, else 0.01) or arrived at the
   * target. The first target of a signal publishes at once. A direct `signal()` call cancels the
   * easing and publishes immediately.
   */
  signalTarget(name, value, { smoothS = 0.1, threshold } = {}) {
    if (!Number.isFinite(value)) throw new Error(`Signal ${name} target must be finite.`);
    const declared = this.contract?.scene?.signals?.find(s => s.name === name);
    const range = declared && Number.isFinite(declared.min) && Number.isFinite(declared.max) ? declared.max - declared.min : null;
    let t = this.targets.get(name);
    if (!t) { t = { target: value, current: value, sent: null, smoothS: 0, threshold: 0 }; this.targets.set(name, t); }
    t.target = value; t.smoothS = Math.max(0, smoothS); t.threshold = Math.max(0, threshold ?? (range ? range * 0.01 : 0.01));
    if (t.sent === null || t.smoothS === 0) { t.current = value; t.sent = value; super.signal(name, value); }
  }
  signal(name, value) { this.targets.delete(name); super.signal(name, value); }
  tickSignals(dt) {
    for (const [name, t] of this.targets) {
      if (t.current === t.target && t.sent === t.target) continue;
      const k = t.smoothS > 0 && dt > 0 ? 1 - Math.exp(-dt / t.smoothS) : 1;
      let next = t.current + (t.target - t.current) * k;
      if (Math.abs(t.target - next) <= Math.max(t.threshold * 0.1, 1e-9)) next = t.target;
      t.current = next;
      if (Math.abs(next - t.sent) >= t.threshold || (next === t.target && t.sent !== t.target)) { t.sent = next; super.signal(name, next); }
    }
  }

  /**
   * Bind a host that exists only for its sound (a thrown bottle, a shell casing, a spawned spark):
   * bound like any host, and released on its own (unbind) once nothing at it is playing or waiting
   * to play, after `graceS` (default 0.5 s, so a sound fired the frame after the bind still counts).
   * Keep the object until `onRelease` fires, or hand it a detached object. `releaseTransient(id)`
   * releases it now.
   */
  bindTransient(id, object, { graceS = 0.5, onRelease, ...bindOptions } = {}) {
    this.bind(id, object, bindOptions);
    this.transients.set(id, { since: null, graceS: Math.max(0, graceS), onRelease });
  }
  releaseTransient(id) { if (!this.transients.has(id)) return false; this.unbind(id); return true; }
  tickTransients(now) {
    if (!this.transients.size) return;
    const live = new Set();
    for (const v of this.engine.getTrackViews()) if (v.hostId && (v.isPlaying || v.pending)) live.add(v.hostId);
    for (const [id, t] of this.transients) {
      t.since ??= now;
      if (live.has(id) || now - t.since < t.graceS) continue;
      this.unbind(id);
      t.onRelease?.(id);
    }
  }
  /** Attach the ears to an object. Offset is local scene units; orientation defaults to that object. */
  bindListener(object, { offset = [0, 0, 0], orientation = object } = {}) {
    if (!object?.isObject3D || !orientation?.isObject3D) throw new Error('Listener position and orientation need Object3D targets.');
    if (!Array.isArray(offset) || offset.length !== 3 || !offset.every(Number.isFinite)) throw new Error('Listener offset needs three finite scene-unit coordinates.');
    const hostId = [...this.bindings].find(([, binding]) => binding.object === object)?.[0] || object.userData?.satieId || object.name || object.uuid;
    const orientationHostId = [...this.bindings].find(([, binding]) => binding.object === orientation)?.[0] || orientation.name || orientation.uuid;
    this.listenerBinding = { object, orientation, offset: new Vector3(...offset),
      anchor: { hostId, orientationHostId, offset: offset.map(value => value / this.unitsPerMeter), position: [0, 0, 0], hostMatrix: new Array(16).fill(0) } };
  }
  /** Restore the camera supplied to update as the listener. */
  unbindListener() { this.listenerBinding = null; this.setListenerAnchor(null); }
  /**
   * The first frame: a contract object that sounds are `at` but nothing placed (no bind, no
   * setHostPosition) leaves them at the world origin until the game places it. Said once.
   */
  warnUnplaced() {
    if (this._unplacedChecked) return; this._unplacedChecked = true;
    const ids = new Set((this.contract?.scene?.objects ?? []).map(o => o.id));
    // the listener's own object (bindListener, or the contract's listener host) is placed every frame too
    const listener = [this.listenerBinding?.anchor?.hostId, this.contract?.scene?.behaviorContract?.listener?.host].filter(Boolean);
    const placed = new Set([...this.bindings.keys(), ...(this.engine.externalHosts ?? []), ...listener]);
    const used = new Set(this.engine.scriptStatements.map(s => s.hostRef).filter(h => h && ids.has(h) && !placed.has(h)));
    for (const id of used) { const msg = `Host ${id}: sounds are at it but the game has not placed it (no bind, no setHostPosition), so they have no position until it does. Bind it at start, or place it every frame while it exists.`; this.bindWarnings.push(msg); console.warn(`[satie] ${msg}`); }
  }
  update(camera) {
    if (!this._unplacedChecked && this.engine.scriptStatements.length) queueMicrotask(() => this.warnUnplaced());
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = this.lastTick === null ? 0 : Math.min(0.25, Math.max(0, now - this.lastTick));
    this.lastTick = now;
    this.tickSignals(dt);
    const listener = this.listenerBinding;
    if (listener) {
      listener.object.updateWorldMatrix(true, false);
      this.listenerPosition.copy(listener.offset).applyMatrix4(listener.object.matrixWorld);
      listener.orientation.getWorldQuaternion(this.listenerQuaternion);
      this.listenerMatrix.compose(this.listenerPosition, this.listenerQuaternion, this.listenerScale);
      this.matrix.set(this.listenerMatrix.elements);
    } else {
      if (!camera?.isObject3D) throw new Error('Call bindListener(object) or supply a camera to update(camera).');
      camera.updateWorldMatrix(true, false);
      this.matrix.set(camera.matrixWorld.elements);
    }
    this.matrix[12] /= this.unitsPerMeter; this.matrix[13] /= this.unitsPerMeter; this.matrix[14] /= this.unitsPerMeter;
    this.updateListener(this.matrix);
    if (listener) {
      listener.anchor.position[0] = this.matrix[12]; listener.anchor.position[1] = this.matrix[13]; listener.anchor.position[2] = this.matrix[14];
      for (let i = 0; i < 16; i++) listener.anchor.hostMatrix[i] = listener.object.matrixWorld.elements[i];
      for (let i = 12; i < 15; i++) listener.anchor.hostMatrix[i] /= this.unitsPerMeter;
      this.setListenerAnchor(listener.anchor);
    }
    for (const [id, binding] of this.bindings) {
      if (binding.local) { binding.object.updateWorldMatrix(true, false); binding.position.copy(binding.local).applyMatrix4(binding.object.matrixWorld); }
      else binding.object.getWorldPosition(binding.position);
      const p = binding.position;
      this.setHostPosition(id, p.x / this.unitsPerMeter, p.y / this.unitsPerMeter, p.z / this.unitsPerMeter);
      // The object's orientation travels with its position: its world matrix, translation in metres.
      this.hostMatrix.set(binding.object.matrixWorld.elements);
      this.hostMatrix[12] /= this.unitsPerMeter; this.hostMatrix[13] /= this.unitsPerMeter; this.hostMatrix[14] /= this.unitsPerMeter;
      this.setHostMatrix(id, this.hostMatrix);
      if (binding.line) {
        binding.object.updateWorldMatrix(true, false);
        for (let i = 0; i < binding.localPoints.length; i++) binding.line.polyline[i]
          .copy(binding.localPoints[i]).applyMatrix4(binding.object.matrixWorld).divideScalar(this.unitsPerMeter);
        // The line contract uses uniform scale; reject ambiguous width under nonuniform transforms.
        const e = binding.object.matrixWorld.elements;
        const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        if (Math.max(sx, sy, sz) - Math.min(sx, sy, sz) > 1e-5) throw new Error('bindLine requires uniform world scale; bake nonuniform scale into the points and width.');
        binding.line.halfM = binding.width * sx / (2 * this.unitsPerMeter);
        binding.line.reachM = binding.reach * sx / this.unitsPerMeter;
        this.engine.setHostLine(id, binding.line);
      }
    }
    this.tickTransients(now);
    this.captureFrame();
  }
  /** Event positions use the same scene units as meshes; the core receives metres. */
  event(name, at, text, evidence) {
    return super.event(name, at ? { x: at.x / this.unitsPerMeter, y: at.y / this.unitsPerMeter, z: at.z / this.unitsPerMeter } : undefined, text, evidence);
  }
  dispose() { this.identityObjects?.clear(); this.bindings?.clear(); this.surfaces?.clear(); this.targets?.clear(); this.transients?.clear(); this.unbindListener(); super.dispose(); }
}

/** Prefer named meshes; opt named groups in explicitly to avoid overlapping parent/child boxes. */
export function manifestFrom(root, options = {}) {
  const units = options.unitsPerMeter ?? 1;
  if (!(units > 0) || !Number.isFinite(units)) throw new Error('unitsPerMeter must be finite and positive.');
  const box = new Box3(), size = new Vector3(), centre = new Vector3();
  const ids = new Set(), objects = [];
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (object === root || !object.name || object.userData?.satie === false) return;
    if (options.include ? !options.include(object) : !object.isMesh) return;
    const id = object.userData?.satieId ?? object.name;
    if (ids.has(id)) throw new Error(`Duplicate Satie host id: ${id}`);
    ids.add(id);
    box.setFromObject(object);
    if (box.isEmpty()) return;
    box.getSize(size); box.getCenter(centre);
    const material = options.material?.(object) ?? object.userData?.material ?? (!Array.isArray(object.material) ? object.material?.name : undefined);
    objects.push({ id, label: object.name.replace(/[_-]/g, ' '),
      position: [centre.x / units, centre.y / units, centre.z / units],
      sizeM: [Math.max(size.x / units, 0.01), Math.max(size.y / units, 0.01), Math.max(size.z / units, 0.01)],
      ...(material ? { material } : {}), motion: object.userData?.satieMotion ?? 'static',
      ...(typeof object.userData?.occludes === 'boolean' ? { occludes: object.userData.occludes } : {}) });
  });
  return { engine: 'threejs', listener: 'first_person', unitsPerMeter: units, objects };
}
