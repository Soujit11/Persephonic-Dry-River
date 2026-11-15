/**
 * The mix (docs/specs/015-edit-panel), one window with the mixer's column as its sidebar (Huanxing, 2026-11-12).
 * The library is a sky of how things sound; the mix draws one soundscape on it at three zooms:
 *
 * - **The soundscape**: every sound where its audio puts it, a game entity's sounds squeezed close and joined
 *   by a thread, one name per entity, the library faint behind.
 * - **One entity** (the train, the vending machine): its sounds as a constellation in the middle; every
 *   other sound of the soundscape still there round the edge, dim, pulled in toward it (a fisheye).
 * - **One sound**: it in the middle, its takes as rings round it when it has more than one (one take is the
 *   sound itself), its entity's other sounds and the rest of the soundscape round the edge. The library's
 *   recordings like it show only when asked for (to replace or add a take): gold rings that turn.
 *
 * Point at anything to hear it (a sound plays one of its takes at random, as the game does). It mounts
 * through the mixer's one seam (`devtools({ editPanel })`) and writes only through the context the mixer
 * hands it, so undo, history and the context box see every change.
 */
import type { EditPanel } from '../index.js';
export { indexMap, placeSound, matches, wordsOf, spanningTree } from './place.js';
export type { MapSound, MapIndex, Placed } from './place.js';
export interface EditPanelOptions {
    /** The world's name: the first crumb when no soundscape is open. */
    world?: string;
    /** Where the library map comes from (default `/__satie/landscape`, the vite plugin). */
    landscapeUrl?: string;
    /**
     * A thing's whole run, from the game (a train pass): its ▶ plays the real thing. Return null when the
     * game has none for it; the panel then plays the thing's sounds in turn.
     */
    playThing?: (thing: {
        key: string;
        label: string;
    }) => {
        start(): void;
        running(): boolean;
    } | null;
    /**
     * Look and listen only (Explore's frozen worlds): every level opens and everything plays, but
     * nothing is added, replaced or removed (no Add, Replace…, bin or drag).
     */
    readOnly?: boolean;
}
export declare function createEditPanel(opts?: EditPanelOptions): EditPanel & {
    isOpen(): boolean;
};
//# sourceMappingURL=index.d.ts.map