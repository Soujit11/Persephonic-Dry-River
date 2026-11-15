/** Metre-space contact input shared by game integrations and Satie's own controllers. */
export interface FootContactPosition {
    x: number;
    y: number;
    z: number;
}
export type ContactFoot = -1 | 1;
export interface FootContact {
    kind: 'step' | 'land';
    foot: ContactFoot;
    position: FootContactPosition;
    surface: string;
    /** Ground-relative, resolved locomotion speed in metres per second. */
    speed: number;
    /** The host simulation's contact time in seconds, not an audio playback delay. */
    time: number;
    /** Only present when supplied by the host; the fallback never invents force. */
    normalImpulse?: number;
    normalSpeed?: number;
    provenance: 'physics-contact' | 'animation-contact' | 'distance-fallback';
    sequence: number;
}
export interface FootContactInput {
    foot: ContactFoot;
    /** Supply both contact begin and contact end, or each foot's grounded state every tick. */
    grounded: boolean;
    position: FootContactPosition;
    surface: string;
    speed: number;
    time: number;
    kind?: 'step' | 'land';
    normalImpulse?: number;
    normalSpeed?: number;
    enabled?: boolean;
}
export interface GroundTravelInput {
    /** Self-propelled travel AFTER collision resolution, excluding platform/impulse motion. */
    distance: number;
    deltaSeconds: number;
    grounded: boolean;
    /** Body position at its supporting ground, not the camera or head. */
    position: FootContactPosition;
    surface: string;
    time: number;
    /** Yaw in radians; zero faces -Z, positive rotates towards +X. */
    heading?: number;
    /** Distance between opposite feet landing. A full gait cycle is twice this distance. */
    stepLength?: number;
    enabled?: boolean;
    teleported?: boolean;
}
interface FootContactCommonOptions {
    onContact(contact: FootContact): void;
    stepLength?: number;
    footSeparation?: number;
    minimumSpeed?: number;
    /** Discontinuity guard, not a speed clamp. Faster travel produces no fallback contacts. */
    maximumSpeed?: number;
    maximumDeltaSeconds?: number;
    /** Optional variation in fallback spacing, sampled once after each contact. */
    strideVariation?: number;
    random?: () => number;
}
/** Animation markers and inferred distance must never masquerade as physics measurements. */
export type FootContactOptions = FootContactCommonOptions & ({
    mode: 'contacts';
    contactSource: 'physics' | 'animation';
} | {
    mode: 'distance';
    contactSource?: never;
});
/**
 * Foot-ground edges are authoritative. Hosts without foot collision or animation
 * contact data can opt into a distance gait and use its phase for BOTH animation
 * and sound. This class never schedules audio, reads input keys, or runs a timer.
 */
export declare class FootContactTracker {
    private readonly options;
    /** Unwrapped radians. In distance mode, contacts occur at π, 2π, 3π, ... . */
    get phase(): number;
    private phaseRadians;
    private progress;
    private completed;
    private sequence;
    private strideScale;
    private nextFoot;
    private leftGrounded;
    private rightGrounded;
    private leftTime;
    private rightTime;
    private travelTime;
    private readonly stepLength;
    private readonly footSeparation;
    private readonly minimumSpeed;
    private readonly maximumSpeed;
    private readonly maximumDeltaSeconds;
    private readonly variation;
    constructor(options: FootContactOptions);
    /** Rebase on respawn, teleport or locomotion-mode change. Contact sequence IDs remain unique. */
    reset(): void;
    /** Returns true exactly when a valid new physical foot contact was emitted. */
    contact(input: FootContactInput): boolean;
    /** Returns contacts crossed by this resolved motion sample; never extrapolates missing motion. */
    advance(input: GroundTravelInput): number;
    private resetGait;
}
export {};
//# sourceMappingURL=FootContactTracker.d.ts.map