import type { CardHost } from './host.js';
export interface MountedCard {
    el: HTMLElement;
    /** Re-read what changes as you walk and the scene plays (levels, reach, what's off), without rebuilding. */
    refresh(committed?: boolean): void;
    /** A draft is playing: the mixer must not rebuild the card from the scene under it. */
    holding(): boolean;
    /** The card is going away: put back any draft, stop any pulse. */
    close(): void;
    /** "find another version…": the find, whose pick is added as one more version. */
    findVersion(): void;
}
export declare function mountCard(host: CardHost, i: number): MountedCard;
/**
 * A crowd's card: the `entity` block itself. A route (things passing along a strip) has how often
 * one comes, how regular, and how fast; a population (things perched about) has how many. Each
 * member sound is listed and opens its own card. Every change is one `applyScript`.
 */
export declare function mountCrowd(host: CardHost, id: string): MountedCard;
//# sourceMappingURL=view.d.ts.map