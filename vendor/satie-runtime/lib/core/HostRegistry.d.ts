/**
 * The external hosts a game or scene registers (`engine.setHostPosition`):
 * the developer's own objects, by id, that `at <id>` voices sit on, grouped
 * by CLASS so `cypress_1 … cypress_4` also answer to `at cypress` (one copy
 * per tree, distinct takes, distinct positions). Positions are stored as
 * live objects the engine pins voices to, so a move is a write into the
 * same point and never an allocation.
 *
 * Collaborators: none — a registry. The engine decides what a registration
 * DOES (re-pinning the voices that name the host, the fall-back to a world
 * feature or the script's `place`) and keeps that beside voice placement.
 */
import type { Vec3 } from './Statement.js';
export interface HostMember {
    id: string;
    p: Vec3;
}
/**
 * A host's drawn geometry (`engine.setHostGeometry`): the world-space box the
 * graphics report for it, in metres. Where the graphics have spoken, they
 * dictate where sound attaches: a perch is the drawn crown's top, a body is
 * the drawn centre, a base is the drawn underside (2026-10-09, "graphics
 * dictate sound").
 */
export interface HostGeometry {
    centre: Vec3;
    size: Vec3;
    base: Vec3;
    top: Vec3;
}
/** Where a sound attaches on drawn geometry: its top, its base (a little above the underside), or its centre. */
export declare function attachFromGeometry(g: HostGeometry, attach: 'body' | 'top' | 'base' | 'inside'): Vec3;
/** The host every scene has: something far beyond the place (a random bearing 1.5–3 km out). */
export declare const HORIZON_HOST = "horizon";
export declare class HostRegistry {
    private readonly hosts;
    private readonly classes;
    private readonly geometry;
    /** `cypress_3` → `cypress`; an id without a numeric suffix belongs to no class. */
    static classOf(id: string): string | null;
    has(id: string): boolean;
    get(id: string): Vec3 | undefined;
    /** Ids of every registered host. */
    ids(): readonly string[];
    /** Members of a class in id order (`cypress` → cypress_1 …), empty when there is no such class. */
    membersOf(cls: string): readonly HostMember[];
    memberIds(cls: string): readonly string[];
    /** Whether `at <ref>` names something registered here: an id, a class, or the horizon. */
    knows(ref: string): boolean;
    /**
     * Place or move a host. `fresh` is true the first time an id is seen (the
     * engine adopts that host's voices); a move writes into the stored point.
     */
    set(id: string, x: number, y: number, z: number): {
        fresh: boolean;
        cls: string | null;
    };
    /** The drawn box of a host (a world thing or an external host), when the graphics reported one. */
    geometryOf(id: string): HostGeometry | undefined;
    /** Record what the graphics drew for a host: its world-space box, centre and size in metres. */
    setGeometry(id: string, centre: Vec3, size: Vec3): HostGeometry;
    clearGeometry(id: string): boolean;
    /** How far the drawn things reach from the origin on the ground, metres; 0 when nothing is drawn. */
    drawnHalfExtentM(): number;
    /** Forget a host; `removed` is false when it was never registered. */
    delete(id: string): {
        removed: boolean;
        cls: string | null;
    };
}
//# sourceMappingURL=HostRegistry.d.ts.map