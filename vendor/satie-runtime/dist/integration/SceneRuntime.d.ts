import { type ObjectStateSchema } from './ObjectStateSchema.js';
import { SceneOperations, type SceneOperation } from './SceneOperations.js';
export { CharacterMotor, type MotorBody, type MotorSurface, type MotorContact, type MotorOptions } from './CharacterMotor.js';
export { FootContactTracker, type FootContactOptions, type FootContactInput, type FootContact, type GroundTravelInput, type FootContactPosition, type ContactFoot } from './FootContactTracker.js';
export { HostAudioBridge, type HostAudioBindings, type HostAudioEvent, type HostEventBinding, type HostControlBinding, type HostStateBinding } from './HostAudioBridge.js';
export { SceneOperations, type SceneOperation, type SceneChange, type OperationResult } from './SceneOperations.js';
import { SatieEngine } from '../core/SatieEngine';
import { SceneCapture } from './SceneCapture';
export type { CaptureBeginOptions } from './SceneCapture';
import type { AuthoringContext } from './AuthoringContext';
export type { AuthoringContext } from './AuthoringContext';
import type { RuntimeContract, Point3, PlaythroughTelemetry, RuntimeEventEvidence, ListenerAnchor } from './contracts';
export type { RuntimeEventEvidence, ListenerAnchor } from './contracts';
export interface SceneRuntimeOptions {
    engine?: SatieEngine;
    contract?: RuntimeContract;
    /** Engine seed. Omitted, the runtime draws one (a 32-bit integer) and the capture says so (`seedSource: 'runtime'`). */
    seed?: number;
    now?: () => number;
    /** Fixed playback reference, chosen from near/far route auditions, never the spawn position. */
    levelAnchorDb?: number;
}
/** Framework-free runtime bridge. Engine adapters supply matrices and host positions in metres. */
export declare class SceneRuntime {
    readonly engine: SatieEngine;
    readonly capture: SceneCapture;
    readonly contract?: RuntimeContract;
    private disposed;
    operations: SceneOperations | null;
    private unsubscribeOperations;
    private readonly tracking;
    private readonly stateSchemas;
    private readonly identities;
    private readonly hosts;
    private readonly signals;
    private sceneState;
    private readonly listener;
    private readonly forward;
    private readonly up;
    private hasListener;
    /** World matrices (metres, column-major) of hosts whose adapter has one; copied in place each frame. */
    private readonly hostMatrices;
    private listenerAnchor;
    private readonly objectStates;
    private readonly abort;
    /** Always set: the developer's seed or one the runtime drew (A.3, 2026-11-08). */
    readonly seed: number;
    readonly seedSource: 'developer' | 'runtime';
    private readonly levelAnchorDb;
    private assets;
    private loadedStatements;
    constructor(options?: SceneRuntimeOptions);
    /** Assets are resolved at authoring time; this path never generates or authenticates. */
    load(scriptUrl?: string, samplesUrl?: string): Promise<void>;
    /** Enable revisioned changes for a preloaded scene. Does not re-load or restart it. */
    enableOperations(script: string, revision?: string): void;
    schedule(operation: SceneOperation): void;
    private assertAlive;
    /** Only state supplied through this adapter. Geometry/materials require a host callback. */
    authoringContext(): AuthoringContext;
    start(): Promise<void>;
    stop(): void;
    dispose(): void;
    setHostPosition(id: string, x: number, y: number, z: number): void;
    /**
     * A bound host's world matrix in metres (16 numbers, column-major like three.js `Matrix4.elements`),
     * recorded in frames as `hostMatrices` for adapters that have one. Copied in place; no allocation per call.
     */
    setHostMatrix(id: string, elements: ArrayLike<number>): void;
    /** Identity persists through detachment; destruction ends this lifetime. */
    objectInstanceId(id: string): string;
    destroyObject(id: string): void;
    unbind(id: string): void;
    updateListener(matrix: ArrayLike<number>): void;
    /** The listener's full pose without a matrix: position, forward and up in metres (unit directions). */
    setListenerPose(position: Point3, forward: Point3, up?: Point3): void;
    /** Adapter supplies the resolved world ear point; local offsets alone lose parent rotation. */
    setListenerAnchor(anchor: ListenerAnchor | null): void;
    loseObjectTracking(bodyId: string, reason?: string): void;
    recoverObjectTracking(bodyId: string): void;
    reportCaptureGap(reason: string): void;
    objectStateIsCurrent(bodyId: string, group: string, value: string): boolean;
    declareObjectStates(bodyId: string, schema: ObjectStateSchema): void;
    validateObjectStateReport(bodyId: string, group: string, value: string): void;
    /** Preserve independent per-object state axes; these do not change the global scene mix. */
    objectState(bodyId: string, group: string, value: string): void;
    clearObjectState(bodyId: string): void;
    entityAction(entityId: string, instance: number, action: string | null): boolean;
    steerEntity(entityId: string, instance: number, position: Point3): boolean;
    captureFrame(): void;
    /**
     * Start a capture. `onSegment` receives every closed segment (the last one included): with it a
     * channel at its cap (CAPTURE_CAPS) closes the segment and opens the next, each standing alone for
     * replay (the new segment begins with the bound hosts, signals, state and transport, and a frame).
     */
    beginCapture(options?: {
        onSegment?: (segment: PlaythroughTelemetry) => void;
    }): void;
    /** What a fresh segment must know to replay on its own: the state the previous segment left. */
    private recordSegmentStart;
    /** Close the open segment now (delivered to `onSegment`) and continue in the next; false without a listener. */
    rolloverCapture(): boolean;
    endCapture(): PlaythroughTelemetry;
    event(name: string, at?: {
        x: number;
        y: number;
        z: number;
    }, text?: string, evidence?: RuntimeEventEvidence): boolean;
    /** Explicit metre boundary for shared physical adapters, even on a scene-unit subclass. */
    eventAtMeters(name: string, at?: {
        x: number;
        y: number;
        z: number;
    }, text?: string, evidence?: RuntimeEventEvidence): boolean;
    private validateSignal;
    signal(name: string, value: number): void;
    state(name: string | null, isolation?: number): void;
    /** Legacy listener-local convenience. For physical feet use HostAudioBridge with the actual contact point. */
    step(surface: string): boolean;
}
//# sourceMappingURL=SceneRuntime.d.ts.map