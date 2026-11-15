/**
 * Scene event log — what happened, when, where.
 *
 * The scheduler is a timeline with no memory: once an event has run it is
 * gone, and nothing records that a voice fired, which take it played, or
 * where it was. The log keeps the last `capacity` scene events in a ring so
 * a timeline view (ui/components/TimelinePanel) can draw lanes of what
 * sounded, and evaluation code can check causality ("every horn had a car
 * within 3 m"). Nothing here knows what an event means — it stores a kind, a
 * label, a position and the ids that let a reader join it back to the
 * script (statement index, track key, entity / instance).
 *
 * Allocation: one object per event; the ring reuses slots. Readers call
 * `snapshot()` (allocates) at UI rate, never per audio tick.
 */
export type SceneEventKind = 
/** A loop's source started (first start or a re-trigger after a buffer arrived). */
'start'
/** A oneshot / trigger fired. */
 | 'fire'
/**
 * The editor fired a voice through its own track so it can be heard while edited
 * (`SatieEngine.fireNow`): the same sound path as a fire, but not one the game made, so
 * cadence, "played N s ago" and the timeline do not count it.
 */
 | 'audition'
/** An interactive event could not obtain a bounded playback voice. */
 | 'drop'
/** A voice was stopped / retired. */
 | 'stop'
/** An entity instance came into being. */
 | 'spawn'
/** An entity instance left the scene. */
 | 'retire'
/** A runtime event (`fireEvent` / `emit`) was broadcast. */
 | 'event'
/**
 * An entity agent made a transition (world/EntityAgents.ts): `label` is
 * the transition — `perch`, `call`, `hush`, `relocate`, `startle`,
 * `promote`, `demote` — with the entity, the instance and where its
 * body was. The behaviour tag an exported corpus carries.
 */
 | 'agent'
/**
 * Lazy generation woke a dormant gen voice: the world's state (now, or
 * predicted within the demand horizon) came to need a sound nobody had
 * asked for yet, and its generation request went out. `demand` carries
 * the 0..1 demand that woke it.
 */
 | 'predict';
export interface SceneEvent {
    /** Clock seconds (`SatieDSPClock.currentTime`). */
    t: number;
    kind: SceneEventKind;
    /** Track key, or '' when the event is not a voice's. */
    key: string;
    /** Owning statement index, -1 when none. */
    statementIndex: number;
    /** Display label: clip name, entity label, event name. */
    label: string;
    /** Entity class id and instance number, when the event belongs to an entity. */
    entity: string;
    instance: number;
    /** Pooled take index (`variants`), -1 when not pooled. */
    take: number;
    /** `predict` events: the demand (0..1) that woke the voice. -1 on every other kind. */
    demand?: number;
    /** `event` kinds fired in a world: the water column (m) and liquid flag at the event's point (WorldFields). Absent without a field provider. */
    depth?: number;
    liquid?: number;
    /** Authored source and dispatched event identity, when this is a voice fire. */
    sourceId?: string;
    programId?: string;
    /** Shared program epoch in AudioContext seconds; offsets include late joins. */
    programStartTime?: number;
    eventName?: string;
    emitterId?: string;
    eventGain?: number;
    /** Scheduled source gain target after mute/zone, intensity and count scaling; not a measured output meter. */
    effectiveGain?: number;
    reason?: 'voice-capacity';
    /** AudioContext seconds when BufferSource.start was scheduled. */
    audioStartTime?: number;
    /** Per-fire audio duration and release, already sampled by the live engine. */
    playbackDurationSeconds?: number;
    releaseSeconds?: number;
    /** Scheduled delay relative to this event's scene-clock time. */
    startDelaySeconds?: number;
    /** Offset into the original buffer, before pitch scaling. */
    bufferOffsetSeconds?: number;
    /** Decoded take lookup key, so timing can be joined to admitted assets. */
    bufferKey?: string;
    /** Measured PCM energy onset in the original buffer. */
    detectedOnsetSeconds?: number;
    /** Scheduled start plus remaining PCM onset / pitch. Not device-output latency. */
    estimatedOnsetTime?: number;
    timingBasis?: 'pcm-onset-estimate';
    x: number;
    y: number;
    z: number;
}
export declare class EventLog {
    readonly capacity: number;
    private readonly buf;
    private head;
    private count;
    /** Bumped on every record — cheap change detection for a polling reader. */
    private _version;
    constructor(capacity?: number);
    get version(): number;
    get size(): number;
    record(e: SceneEvent): void;
    /** Oldest → newest copy. */
    snapshot(): SceneEvent[];
    /**
     * Forget everything at or after scene time `t`.
     *
     * Replaying from a point rewinds the scene clock, and every entry here is
     * stamped in scene time -- so without this the whole recorded past sits at a
     * `t` GREATER than the new now, and a timeline view draws your history to the
     * right of the now line, as the future. Those events also genuinely have not
     * happened in the replayed timeline, so dropping them is the honest answer
     * rather than a drawing fix.
     *
     * Entries before `t` are kept: that stretch of the scene did happen and is
     * still the past.
     */
    dropFrom(t: number): void;
    clear(): void;
}
//# sourceMappingURL=EventLog.d.ts.map