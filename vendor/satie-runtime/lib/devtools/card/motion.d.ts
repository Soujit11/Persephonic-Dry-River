/**
 * How a sound moves, in words, and back to script. In a game a sound almost always moves because
 * the thing it is on moves, so "rides on a thing" leads; "roams an area" is for life the game
 * does not simulate (a cat you only hear, crows on a wire, insects). Pure: reads the parsed
 * statement, writes through the surgeon.
 *
 * The roam form is `place <x1>to<x2> <y> <z1>to<z2>` (the box) plus `move wander|drift|dart speed
 * <a>[to<b>]`: the engine bounds a semantic verb by `place`. (Axes inside `move` are ignored by the
 * semantic verbs, so the card never writes them.)
 */
import type { Statement } from '../../core/Statement.js';
import { type VoiceLocator } from '../../edit/scriptEdit.js';
export type MotionChoice = 'rides' | 'stays' | 'roams' | 'circles' | 'other';
export type HostPart = 'body' | 'top' | 'base' | 'inside';
export type Point = [number, number, number];
/** A roaming sound's box, in metres (what the world layer draws and drags). */
export interface Area {
    kind: 'area';
    min: Point;
    max: Point;
}
export interface MotionReading {
    choice: MotionChoice;
    /** rides: the thing, and where on it. */
    host?: {
        id: string;
        part: HostPart;
    };
    /** roams: its box, whether it uses the box's height (flies) and its speed. */
    area?: Area;
    air?: boolean;
    speed?: {
        min: number;
        max: number;
    };
    /** other: the move word it has (orbit, lorenz, pass …), kept as it is. */
    word?: string;
}
export declare function readMotion(st: Statement): MotionReading;
export declare const speedToPos: (s: number) => number;
export declare const posToSpeed: (p: number) => number;
/** The default box when a sound starts roaming: 4 m around where it is, on its own height. */
export declare function areaAround(st: Statement, halfM?: number): Area;
export type MotionWrite = {
    choice: 'rides';
    host: string;
    part?: HostPart;
} | {
    choice: 'roams';
    area: Area;
    air: boolean;
    speed: {
        min: number;
        max: number;
    };
} | {
    choice: 'stays';
} | {
    choice: 'circles';
};
/** The move word a roam writes: on the ground it wanders; in the air it drifts, or darts when fast. */
export declare const roamWord: (air: boolean, speed: number) => "drift" | "wander" | "dart";
export declare function writeMotion(script: string, loc: VoiceLocator, m: MotionWrite): string | null;
/** A box said the way people say it: "an area about 6 × 6 m". */
export declare function sayArea(a: Area): string;
//# sourceMappingURL=motion.d.ts.map