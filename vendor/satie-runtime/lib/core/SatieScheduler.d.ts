/**
 * Sample-accurate event scheduler.
 * Ported from SatieScheduler.cs
 *
 * Uses a sorted timeline array for O(1) access to the next due event,
 * instead of iterating the entire Map each frame.
 */
import { SatieDSPClock } from './SatieDSPClock';
export declare enum AudioEventType {
    Play = "play",
    Stop = "stop",
    SetVolume = "setVolume",
    SetPitch = "setPitch",
    Callback = "callback"
}
export interface SatieAudioEvent {
    scheduledSample: number;
    type: AudioEventType;
    trackKey: string;
    floatValue?: number;
    stringValue?: string;
    onExecute?: () => void;
    debugLabel?: string;
}
export declare class SatieScheduler {
    /** Sorted by scheduledSample ascending. Earliest events at the front. */
    private timeline;
    private clock;
    private _totalScheduled;
    private _totalProcessed;
    constructor(clock: SatieDSPClock);
    get eventCount(): number;
    get totalScheduled(): number;
    get totalProcessed(): number;
    schedule(evt: SatieAudioEvent): void;
    scheduleAt(evt: SatieAudioEvent, timeSeconds: number): void;
    scheduleAfter(evt: SatieAudioEvent, offsetSeconds: number): void;
    /** Whether any pending event belongs to this track key. Used by the
     * incremental reload to tell "not started yet" from "already finished" —
     * rescheduling a finished oneshot would replay it. */
    hasTrackEvents(trackKey: string): boolean;
    cancelTrackEvents(trackKey: string): void;
    cancelAll(): void;
    /**
     * The queued events due within `horizonSeconds`, earliest first — the
     * future half of a timeline view. Read-only; allocates (UI rate only).
     */
    upcoming(horizonSeconds: number, max?: number): {
        t: number;
        trackKey: string;
        label: string;
    }[];
    process(): void;
    reset(): void;
}
//# sourceMappingURL=SatieScheduler.d.ts.map