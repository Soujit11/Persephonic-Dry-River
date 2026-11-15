/**
 * A crowd (an `entity` block): traffic on a street, a flock on a ledge. Its card edits the block
 * itself: a route (things passing along a strip, `at <strip> pass`) has how often one comes and how
 * fast; a population (things perched about) has how many. Each member sound opens its own card.
 * Pure: reads the parsed `EntityDef`, writes the entity's own lines through the surgeon.
 */
import type { EntityDef } from '../../core/Entities.js';
export type CrowdKind = 'route' | 'population';
export interface CrowdReading {
    kind: CrowdKind;
    /** population: how many there are. */
    count: number;
    /** route: seconds between one and the next. */
    every: {
        min: number;
        max: number;
    };
    /** route: how fast they go (m/s), null when the strip's flow decides. */
    speed: {
        min: number;
        max: number;
    } | null;
}
/** A population's size bounds (the registry's `count`). */
export declare const COUNT_MIN = 1, COUNT_MAX = 48;
/** How fast a route's things go, the dial's ends (m/s). */
export declare const SPEED_MIN = 1, SPEED_MAX = 30;
export declare function readCrowd(def: EntityDef): CrowdReading;
export type CrowdWrite = {
    count: number;
} | {
    every: {
        middleS: number;
        spread: number;
    };
} | {
    speed: number;
    spread?: number;
};
export declare function writeCrowd(script: string, id: string, w: CrowdWrite): string | null;
/** "about one every 7 s", from a route's every. */
export declare function sayEvery(e: {
    min: number;
    max: number;
}): string;
//# sourceMappingURL=crowd.d.ts.map