/**
 * The next minute of a now-and-then sound, drawn as ticks under "how often" and "how regular",
 * so its rhythm is seen before it is heard. Pure and seeded: the same `every` always draws the
 * same strip (it moves only when a dial does), with each gap picked between the range's ends the
 * way the engine picks it (uniformly).
 */
/** Where in the next `windowS` seconds it could play (s from now), at most 240 ticks. */
export declare function nextTicks(minS: number, maxS: number, windowS?: number, seed?: number): number[];
//# sourceMappingURL=rhythm.d.ts.map