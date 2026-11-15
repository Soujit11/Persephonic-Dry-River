import type { SceneRuntime } from './SceneRuntime.js';
import type { EventAuthority, RuntimeEventEvidence } from './contracts.js';
export interface HostEventBinding {
    event: string;
    sourceId: string;
    authority: EventAuthority;
}
export interface HostControlBinding {
    signal: string;
    /** Units document the adapter boundary; values are never silently rescaled/clamped. */
    unit: string;
    min: number;
    max: number;
}
export interface HostStateBinding {
    /** Every state must write the same set of controls, preventing stale layers. */
    states: Record<string, Record<string, number>>;
}
export interface HostAudioBindings {
    bodyId: string;
    events?: Record<string, HostEventBinding>;
    controls?: Record<string, HostControlBinding>;
    /** Independent state axes, not a single global scene mode. */
    states?: Record<string, HostStateBinding>;
    /** Bounded retry deduplication. Contact ids must be unique per occurrence. */
    recentEventLimit?: number;
    /** Explicit detach response. No guessed notion of "zero" for arbitrary physical controls. */
    onDetach?: Record<string, number>;
}
export interface HostAudioEvent extends Omit<RuntimeEventEvidence, 'bodyId' | 'sourceId' | 'cause'> {
    id: string;
    channel: string;
    /** World contact point in metres, including when runtime is a Three.js scene-unit adapter. */
    position: {
        x: number;
        y: number;
        z: number;
    };
    surface?: string;
    /** Optional monotonic sequence per channel; blocks stale retries even after id eviction. */
    sequence?: number;
}
/** Typed causal boundary shared by game adapters. Call directly from the authoritative
 * host callback. It never polls an overwritten "last event", runs a footstep timer,
 * guesses damage from speed, or delays a collision to the next render frame.
 */
export declare class HostAudioBridge {
    private readonly runtime;
    private static readonly owners;
    private readonly recent;
    private readonly recentOrder;
    private readonly stateValues;
    private readonly controlValues;
    private readonly stateOwned;
    private readonly sequences;
    private readonly limit;
    private disposed;
    readonly bindings: HostAudioBindings;
    constructor(runtime: SceneRuntime, bindings: HostAudioBindings);
    private alive;
    private validateControl;
    private write;
    control(name: string, value: number): void;
    trackingLost(reason?: string): void;
    trackingRecovered(): void;
    state(group: string, value: string): void;
    event(input: HostAudioEvent): boolean;
    /** Apply only the host's explicit detach response. */
    dispose(): void;
}
//# sourceMappingURL=HostAudioBridge.d.ts.map