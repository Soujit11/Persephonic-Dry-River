import type { ObjectTrackingState } from './ObjectTracking.js';
import type { ObjectStateSchema } from './ObjectStateSchema.js';
export type { ObjectStateSchema, StateProperty } from './ObjectStateSchema.js';
/** Portable observations for integration, diagnostics, replay and future world-model datasets. */
/**
 * The runtime's version: the same number as `packages/satie-runtime/package.json`. A capture records it
 * (`provenance.runtimeVersion`), and the install line Satie hands out names it, so it moves with every
 * release of the package. It stayed at 0.4.4 through 0.4.5; `runtime-version.test.ts` holds the two together.
 */
export declare const RUNTIME_VERSION = "0.4.8";
export type Point3 = [number, number, number];
/** A capture's wall clock and audio clock further apart than this (seconds) are flagged; below it they count as running together. */
export declare const AUDIO_CLOCK_TOLERANCE_S = 0.1;
/** The warning a segment gets, once, when its clocks are further apart than AUDIO_CLOCK_TOLERANCE_S. Nothing is dropped. */
export declare const AUDIO_CLOCK_WARNING = "Audio/host clock discontinuity during capture; audio timings are kept on the audio clock, with audioClockOffsetS and frames[].audioT to realign them.";
/**
 * Per-channel caps of one capture segment. The MCP's telemetry schema accepts exactly these;
 * a capture that reaches one closes the segment and opens the next (SceneCapture, 2026-11-08).
 */
export declare const CAPTURE_CAPS: {
    readonly frames: 10000;
    readonly events: 20000;
    readonly actions: 10000;
};
/** How many frames, events and actions a segment dropped; all zeros means nothing was lost. */
export interface CaptureTruncation {
    frames: number;
    events: number;
    actions: number;
}
export interface ListenerAnchor {
    hostId: string;
    /** Already resolved world ear point in metres, including local rotation/scale. */
    position: Point3;
    /** Independent position object's world matrix; translation is in metres. */
    hostMatrix?: number[];
    offset?: Point3;
    orientationHostId?: string;
}
export type EventAuthority = 'physics-contact' | 'animation-contact' | 'distance-fallback' | 'physics-impact' | 'physics-state' | 'state-transition' | 'game-state' | 'environment' | 'manual';
export interface RuntimeEventEvidence {
    /** Host monotonic seconds in the SceneRuntime `now` clock (performance.now()/1000 by default). */
    occurredAt?: number;
    simulationTime?: number;
    bodyId?: string;
    contactId?: string;
    sourceId?: string;
    cause?: EventAuthority;
    /** Per-event acoustic response, determined by the host/contact model, not a shared signal. */
    gain?: number;
}
export interface RuntimeContract {
    version: 'satie.scene/v1';
    revision?: string;
    scriptHash?: string;
    /** All contract geometry is metres. Only adapter input transforms use unitsPerMeter. */
    coordinates?: {
        units: 'metres';
        frame: 'threejs' | 'satie';
        handedness: 'right' | 'left';
        up: '+Y';
        cameraForward: '-Z' | '+Z';
    };
    scene: {
        unitsPerMeter?: number;
        objects?: Array<{
            id: string;
            motion?: string;
        }>;
        events?: Array<{
            name: string;
            surfaces?: string[];
        }>;
        states?: Array<{
            name: string;
        }>;
        signals?: Array<{
            name: string;
            min?: number;
            max?: number;
            unit?: string;
        }>;
    };
}
export interface CaptureFrame {
    t: number;
    /**
     * Seconds since the segment opened on the audio clock, read with `t`. Equal to `t` within a few
     * milliseconds while the clocks run together; `t - audioT` is the clock offset at this frame, so a
     * reader can find audio stalls and map audio times onto `t`. Absent in captures before 2026-11-12.
     */
    audioT?: number;
    listener: Point3;
    listenerForward?: Point3;
    /** The listener's up vector (unit); with listenerForward it reconstructs the full orientation. */
    listenerUp?: Point3;
    listenerAnchor?: ListenerAnchor;
    /** Orthogonal object states, e.g. power=off and damage=smoking at the same time. */
    objectStateSchemas?: Record<string, ObjectStateSchema>;
    objectTracking?: Record<string, ObjectTrackingState>;
    objectStates?: Record<string, Record<string, string>>;
    hosts: string[];
    /** Host alias to unique physical lifetime; retained across capture segments. */
    objectInstances?: Record<string, string>;
    hostPositions?: Record<string, Point3>;
    /** World matrices of bound hosts in metres, 16 numbers column-major (three.js `Matrix4.elements`); adapters with a matrix only. */
    hostMatrices?: Record<string, number[]>;
    signals?: Record<string, number>;
    state?: string | null;
    tracks: Array<{
        key: string;
        label: string;
        pending: boolean;
        playing: boolean;
        occlusion: number;
        /** Logical continuous source retained without a native playback voice. Not audible. */
        virtual?: boolean;
        objectInstanceId?: string;
        sourceId?: string | null;
        position?: Point3;
        host?: string | null;
        statementIndex?: number;
        /** Modelled received SPL, not measured output loudness. */
        receivedDb?: number;
        gain?: number;
        pitch?: number;
        surfaceDistanceM?: number;
        sourceExtentDeg?: number;
    }>;
}
export declare const CAPTURE_ACTION_KINDS: readonly ["event", "signal", "state", "object-state", "object-state-clear", "object-state-schema", "object-tracking", "capture-gap", "bind", "host-position", "unbind", "object-destroy", "start", "stop", "entity-action", "entity-steer", "entity-goal"];
export interface CaptureAction {
    stateSignals?: Record<string, number>;
    tracking?: ObjectTrackingState;
    stateSchema?: ObjectStateSchema;
    objectInstanceId?: string;
    t: number;
    kind: typeof CAPTURE_ACTION_KINDS[number];
    /** Entity instance identity for accepted action/steering interventions. */
    instance?: number;
    name: string;
    position?: Point3;
    value?: number;
    text?: string;
    accepted?: boolean;
    occurredAt?: number;
    simulationTime?: number;
    audioStartedAt?: number;
    estimatedAudibleOnsetAt?: number;
    /** Only a measured output waveform may populate this, not a scheduled start. */
    audibleOnsetAt?: number;
    timingBasis?: 'pcm-onset-estimate' | 'output-measured';
    onsetOffsetSeconds?: number;
    /**
     * Wall-clock minus audio-clock seconds since the segment opened, when the audio times above were
     * taken. Near zero when the clocks agree; above 0.1 s the audio times are not on `t`'s timeline.
     */
    audioClockOffsetS?: number;
    bufferKey?: string;
    eventGain?: number;
    /** Modelled effective gain at trigger time, not measured output loudness. */
    effectiveGain?: number;
    bodyId?: string;
    contactId?: string;
    sourceId?: string;
    cause?: EventAuthority;
}
export interface PlaythroughTelemetry {
    version: 'satie.playthrough/v1' | 'satie.playthrough/v2';
    durationS: number;
    frames: CaptureFrame[];
    events: Array<{
        t: number;
        kind: string;
        label: string;
        key?: string;
        take?: number;
        position?: Point3;
        sourceId?: string;
        bufferKey?: string;
        audioStartedAt?: number;
        estimatedAudibleOnsetAt?: number;
        onsetOffsetSeconds?: number;
        timingBasis?: 'pcm-onset-estimate' | 'output-measured';
        audioClockOffsetS?: number;
    }>;
    warnings: string[];
    actions?: CaptureAction[];
    assets?: Array<{
        clipPath: string;
        sampleId?: string;
        sha256?: string;
    }>;
    provenance?: {
        runtimeVersion: string;
        sceneRevision: string | null;
        /** The engine seed. Null only in captures written before 2026-11-08; SceneRuntime always seeds. */
        seed: number | null;
        /** Who chose the seed: the developer's option, or the runtime drawing one. Absent in old captures. */
        seedSource?: 'developer' | 'runtime';
        clock: 'capture-relative-monotonic-seconds';
        levelAnchorDb: number;
        /** Captured observations are not calibrated microphone measurements. */
        audioEvidence: 'runtime-model';
        /** 0-based index of this segment within one beginCapture..endCapture session. Absent in old captures (one segment). */
        segment?: number;
        /** Seconds from the session's first segment to this segment's clock zero. */
        segmentStartS?: number;
        /** One id per beginCapture, shared by every segment of the session, so segments join. */
        session?: string;
    };
    /** True when any count in `truncation` is above zero (kept for v2 readers). */
    truncated?: boolean;
    truncation?: CaptureTruncation;
}
//# sourceMappingURL=contracts.d.ts.map