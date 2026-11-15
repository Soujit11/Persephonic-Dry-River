/** Authored action policy. Semantics belong to the author; the runtime only evaluates numbers. */
import type { AgentGoal } from '../world/EntityAgents';
export interface EntityCondition {
    initial: number;
    min: number;
    max: number;
    drift: number;
}
export interface EntityAction {
    name: string;
    goal: AgentGoal;
    duration: [number, number];
    score: number;
    /** Condition name, signal:<name>, or listener_distance (metres). */
    weights: {
        input: string;
        weight: number;
    }[];
    requires: {
        condition: string;
        min: number;
        max: number;
    }[];
    effects: Record<string, number>;
    /** Minimum seconds between entries into this action; an author hold overrides it. */
    cooldown: number;
    animation?: string;
    /** Allowed successors after the duration, filtered by their guards and utility. Empty = terminal. */
    next?: string[];
    /** Omitted = all members. Empty = no members. IDs are the final source_id segment. */
    sounds?: string[];
    /**
     * Seconds after action entry. An authored cue is a number the author chose; a
     * `contact` is the moment the action's animation clip touches the world,
     * measured from the clip (EntityRig CLIP_CONTACTS) and resolved at parse
     * time, which the runtime fires with the material of what the body touches.
     */
    events: {
        at: number;
        event: string;
        contact?: true;
    }[];
}
export interface EntityBehavior {
    identity: string;
    conditions: Record<string, EntityCondition>;
    actions: EntityAction[];
    initial: string;
}
export interface EntityBehaviorState {
    definition: EntityBehavior;
    conditions: Record<string, number>;
    action: EntityAction;
    startedAt: number;
    until: number;
    lastAt: number;
    marker: number;
    held: string | null;
    cooldowns: Record<string, number>;
    history: {
        action: string;
        t: number;
        reason: 'initial' | 'utility' | 'transition' | 'held' | 'edited';
    }[];
    /** Reused scratch queue, consumed by the existing instance-scoped trigger dispatcher. */
    events: string[];
}
/** Strict bounded admission, shared by the DSL and world planner. Invalid definitions never partially run. */
export declare function parseEntityBehavior(raw: unknown): EntityBehavior | null;
export declare function createEntityBehavior(definition: EntityBehavior, now: number, rng: () => number, held?: string | null): EntityBehaviorState;
/** Preserve condition values, phase and memory across appearance/sound edits; removed actions restart explicitly. */
export declare function reconcileEntityBehavior(state: EntityBehaviorState, definition: EntityBehavior, now: number, rng: () => number, held: string | null): void;
/** Returns true on action entry. A relocation finishes before an automatic transition, preventing sliding/teleporting. */
export declare function stepEntityBehavior(state: EntityBehaviorState, now: number, rng: () => number, signal: (name: string) => number, listenerDistance: number, canTransition?: boolean): boolean;
export declare function entityActionAllowsSound(state: EntityBehaviorState | undefined, sourceId: string | null): boolean;
//# sourceMappingURL=EntityBehavior.d.ts.map