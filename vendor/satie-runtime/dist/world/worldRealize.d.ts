/**
 * World realizer — WorldSpec → RealizedWorld, deterministically from the seed.
 *
 * Pure data in, pure data out (no three.js): a heightfield, a per-cell ground
 * MATERIAL grid, line and area features (strips / patches — carved or paved,
 * liquid or not; the polyline a line source follows), object instances placed
 * by density × masks (a shape, solid or porous, maybe raised on a stem), and
 * fixtures resolved from relative placement with a small overlap-repair pass.
 * Everything the renderer draws and everything the acoustic compiler binds to
 * comes from this one object, so the visible world and the audible one cannot
 * disagree. Nothing here knows what any of it IS — a river and a road are both
 * strips, an oak and a tower are both objects; the spec says which is which.
 *
 * Frame: +Y up, ground under the listener at y = 0, listener at the origin,
 * DSL "ahead" = +Z. The patch is the square [-sizeM/2, sizeM/2]².
 */
import { type Attach, type Ground2, type InteriorSpec, type Shape, type WorldSpec } from './worldSpec.js';
import type { Vec3 } from '../core/Statement.js';
export type { Vec3 };
export interface Heightfield {
    sizeM: number;
    /** Samples per side; sample (i, j) sits at x = -size/2 + i·step, z = -size/2 + j·step. */
    res: number;
    step: number;
    data: Float32Array;
}
export interface GroundGrid {
    sizeM: number;
    res: number;
    step: number;
    /** Index into `palette` per cell (cell (i, j) covers the same square as heightfield sample (i, j)). */
    index: Uint8Array;
    /** Underlying ground before feature/edge paint, for exact boundary queries. */
    baseIndex?: Uint8Array;
    /** Free-text material names — straight from the spec, never invented here. */
    palette: string[];
}
/** A realized strip or patch. */
export interface RealizedFeature {
    id: string;
    kind: 'strip' | 'patch';
    label: string;
    material: string;
    edgeMaterial?: string;
    liquid: boolean;
    flow: number;
    carveM: number;
    /** Strip: half width. Patch: radius. */
    halfM: number;
    /** Strip: centreline (y = surface). Patch: rim. The `at <id>` line follows it. */
    polyline: Vec3[];
    /** Surface height: the water level of a liquid feature, the pavement of a flat one (patch / fill: constant). */
    surfaceY: number;
    /** Strip with a filled side: unit normal pointing INTO the filled side, and the line's origin. */
    fill?: {
        nx: number;
        nz: number;
        ox: number;
        oz: number;
    };
    centre?: Ground2;
}
export type WorldObjectKind = 'object' | 'fixture' | 'aperture' | 'space';
export interface WorldObject {
    /** `<classId>_<n>` for scattered objects, the fixture id for fixtures. */
    id: string;
    kind: WorldObjectKind;
    /** The object class / fixture id this instance came from. */
    classId: string;
    label: string;
    material: string;
    shape: Shape;
    /** 0 solid … 1 porous (see ObjectClass.porous). */
    porous: number;
    /** Base position on the ground (y = terrain height). */
    position: Vec3;
    heightM: number;
    /** Body radius (blob / column) or half footprint (box). */
    radiusM: number;
    /** Height of the body's underside above the base (a raised body); 0 when it sits on the ground. */
    bodyBaseM: number;
    /** Radius of the stem under a raised body; 0 = none. */
    stemRadiusM: number;
    /** Fixtures: [w, h, d]; scattered objects: undefined. */
    sizeM?: [number, number, number];
    /** Heading about +Y, radians (three.js `rotation.y` sense). */
    yaw: number;
    /** Fixtures with a `rotate` line: the authored yaw in degrees (`yaw` is its radians). */
    yawDeg?: number;
    enclosure?: boolean;
}
/**
 * One realized wall: the plan's segment with its outward normal resolved from
 * the polygon's winding, so every consumer (placement, collision, the mesh)
 * agrees on which side is the room.
 */
export interface RealizedWall {
    id: string;
    a: [number, number];
    b: [number, number];
    /** Outward unit normal on the floor. */
    nx: number;
    nz: number;
    /** Along-wall unit vector a → b. */
    ux: number;
    uz: number;
    lengthM: number;
    heightM: number;
    material: string;
}
/**
 * The realized shell of an interior: the room the listener is in, floor at
 * y = 0, its walls as a closed polygon (`plan` — the shoebox's four when the
 * spec has no plan), ceiling at sizeM[1]. Apertures and spaces are in
 * `RealizedWorld.objects` (kinds `aperture` / `space`) so `at <id>` binding,
 * `attachPoint` and the anchor machinery work on them unchanged; an
 * aperture's raised band IS the opening and its `porous` IS its `open`.
 */
export interface RealizedInterior {
    sizeM: [number, number, number];
    elevationM: number;
    floor: string;
    walls: string;
    ceiling: string;
    rt60S?: number;
    /** The floor polygon, listener frame, in wall order. */
    footprint: [number, number][];
    /** The walls, in order around the footprint. */
    plan: RealizedWall[];
    /** The shell's holes, precomputed for collision (see `interiorOpenings`). */
    openings: InteriorOpening[];
}
/** The walls of an interior spec, box or plan, with outward normals. */
export declare function realizeWalls(it: InteriorSpec): RealizedWall[];
/** True when a ground point lies within the interior's footprint (+`marginM`). */
export declare function insideInteriorFootprint(interior: Pick<RealizedInterior, 'footprint'>, x: number, z: number, marginM?: number): boolean;
export interface RealizedWorld {
    spec: WorldSpec;
    heightfield: Heightfield;
    ground: GroundGrid;
    features: RealizedFeature[];
    objects: WorldObject[];
    /** Present when the listener is inside a built space (spec.interior). */
    interior?: RealizedInterior;
    /** Instances the density asked for beyond MAX_SCATTER_INSTANCES (0 = nothing dropped). */
    droppedInstances: number;
}
/** An aperture admits a body only this far open (a half-open door does). */
export declare const APERTURE_PASS_MIN_OPEN = 0.5;
/** Shoulder width: an opening narrower than this admits no body. */
export declare const APERTURE_PASS_MIN_WIDTH_M = 0.6;
/** Ducking headroom for a wall opening — a window is not a door. */
export declare const APERTURE_PASS_MIN_HEIGHT_M = 1.5;
/** A sill this high is climbed, not stepped over — impassable here. */
export declare const APERTURE_PASS_MAX_SILL_M = 0.6;
/** Shell plate thickness; matches the realized aperture band depth. */
export declare const WALL_THICKNESS_M = 0.15;
/** A hole in the shell, precomputed at realize time for collision. */
export interface InteriorOpening {
    kind: 'wall' | 'ceiling' | 'floor';
    /** Wall openings: index into the realized plan. */
    wall: number;
    /** Wall openings: centre along the wall from its first end, metres. */
    centreT: number;
    halfW: number;
    /** Wall openings: the vertical band (sill … sill + height). */
    baseY: number;
    topY: number;
    /** Ceiling/floor hatches: hole half-extents about the room's origin. */
    halfDX: number;
    halfDZ: number;
    /** Whether a body fits through — the constants above against the spec. */
    passable: boolean;
}
/**
 * Where an aperture sits: its wall (index into `walls`), its centre along
 * that wall, and the centre's floor point and outward normal. A wall id
 * addresses the wall directly (`alongM` or the midpoint); a bearing is a ray
 * from the origin to the first wall it meets. Ground plane only.
 */
export declare function aperturePlacement(walls: RealizedWall[], wall: number | string, alongM?: number): {
    wall: number;
    t: number;
    x: number;
    z: number;
    nx: number;
    nz: number;
};
/** The shell's holes, from the spec's own apertures (the same placement the realizer uses; ceiling/floor hatches centred on the origin). */
export declare function interiorOpenings(it: InteriorSpec, walls?: RealizedWall[]): InteriorOpening[];
/**
 * Clamp a movement segment `from` → `to` against the interior shell, writing
 * the permitted end position back into `to` (no allocation — safe to call
 * per frame). Each wall clamps along its own normal while the tangential
 * motion proceeds, which gives wall SLIDE rather than a dead stop; walls are
 * resolved twice so a corner holds; the straddle test catches any step size,
 * so a fast dolly or a teleport cannot tunnel through a wall.
 */
export declare function resolveInteriorMove(it: RealizedInterior, from: Vec3, to: Vec3, radiusM: number): void;
/** Bilinear terrain height at (x, z); outside the patch clamps to the edge. */
export declare function heightAt(hf: Heightfield, x: number, z: number): number;
/** Slope in degrees at (x, z) from central differences. */
export declare function slopeDegAt(hf: Heightfield, x: number, z: number): number;
/** Free-text ground material under (x, z). */
export declare function materialAt(world: RealizedWorld, x: number, z: number): string;
/** A feature by id (strip or patch), or null. */
export declare function featureById(world: RealizedWorld, id: string): RealizedFeature | null;
/**
 * Signed distance from (x, z) to a feature's EDGE: negative inside (on the
 * strip, in the patch, on the filled side), positive outside. Infinity when
 * the id is unknown.
 */
export declare function distanceToFeature(world: RealizedWorld, id: string, x: number, z: number): number;
/** True when (x, z) is on / in the feature. */
export declare function insideFeature(world: RealizedWorld, id: string, x: number, z: number): boolean;
/** The surface owner at (x, z): first match, strips before patches, then authored order. Terrain and surface meshes use the same priority. */
export declare function featureAt(world: RealizedWorld, x: number, z: number): RealizedFeature | null;
/** Nearest point of a feature's line (strip centreline / patch rim) to (x, z) — where a line source is heard from. */
export declare function nearestFeaturePoint(world: RealizedWorld, id: string, x: number, z: number): Vec3 | null;
/** Allocation-free `nearestFeaturePoint` for the engine's spatial tick: writes into `out`, returns false when the id is unknown. */
export declare function nearestFeaturePointInto(world: RealizedWorld, id: string, x: number, z: number, out: Vec3): boolean;
/** Arc length (metres, in the ground plane) of a feature's line — a strip's centreline or a patch's rim. */
export declare function featureArcLength(f: RealizedFeature): number;
/** Arc-length position (0..featureArcLength) of the point of a feature's line nearest (x, z). */
export declare function featureArcNearest(f: RealizedFeature, x: number, z: number): number;
/**
 * The point at arc length `s` along a feature's line (clamped to its ends),
 * written into `out` with no allocation — the engine's per-tick path for a
 * voice travelling along a strip (`at <strip> pass`). False for an empty line.
 */
export declare function featurePointAtArcInto(f: RealizedFeature, s: number, out: Vec3): boolean;
/**
 * Like `featurePointAtArcInto`, but an arc beyond either end continues along that end's tangent
 * (spec 006): a route body born or retired beyond earshot travels the strip's line extended, so
 * it approaches from where the road would come from and recedes where it would go.
 */
export declare function featurePointAtArcExtrapolatedInto(f: RealizedFeature, s: number, out: Vec3): boolean;
/** Outward unit tangent at a strip's start (arc 0) or end (arc = length), in the ground plane. */
export declare function featureEndTangentInto(f: RealizedFeature, atEnd: boolean, out: {
    x: number;
    z: number;
}): boolean;
/**
 * The feature's surface height at (x, z): a strip's polyline level
 * interpolated at the nearest segment (a brook descends along its path —
 * `surfaceY` is only its median), a patch's constant level.
 */
export declare function featureSurfaceYAt(f: RealizedFeature, x: number, z: number): number;
/** Any liquid feature under (x, z). */
export declare function isLiquidAt(world: RealizedWorld, x: number, z: number): boolean;
/**
 * The lowest body above (x, z, y): what rain lands on and what sits over
 * the listener's head. `cover` is 1 under the body's centre, 0.5 at its edge.
 */
export declare function overheadAt(world: RealizedWorld, x: number, z: number, y?: number): {
    object: WorldObject;
    cover: number;
    underside: number;
} | null;
/** Cover 0..1 over (x, z) — 0 in the open. */
export declare function overheadCoverAt(world: RealizedWorld, x: number, z: number, y?: number): number;
/** Objects of one class / fixture id, or one exact object id. */
export declare function objectsOf(world: RealizedWorld, ref: string): WorldObject[];
/**
 * Where a sound attaches to an object: the body's centre (default), its top,
 * its base on the ground, or inside it (same point as the body; the engine
 * treats `inside` as heard through the walls).
 */
export declare function attachPoint(o: WorldObject, attach?: Attach): Vec3;
/**
 * Centre and the four corners of a fixture's actual oriented footprint
 * (`[centre, (-x,-z), (-x,+z), (+x,-z), (+x,+z)]` in the fixture's local
 * frame, turned by its yaw). Axis-aligned when the yaw is 0.
 */
export declare function fixtureFootprint(o: Pick<WorldObject, 'position' | 'sizeM' | 'radiusM' | 'yaw'>): Ground2[];
/** Rectangle/feature intersection, using the fixture's own local frame. */
export declare function fixtureIntersectsFeature(o: WorldObject, f: RealizedFeature): boolean;
/**
 * The point where a ray from the origin at `bearingDeg` meets the walls, the
 * outward normal of the wall it meets, its index, the distance along that
 * wall and the ray length. Ground plane only. Falls back to the farthest
 * wall's midpoint when the ray meets nothing (a degenerate plan).
 */
export declare function wallHit(walls: RealizedWall[], bearingDeg: number): {
    x: number;
    z: number;
    nx: number;
    nz: number;
    t: number;
    wall: number;
    rayM: number;
};
/** Build the world. Deterministic in `spec` (including `spec.seed`). */
export declare function realizeWorld(spec: WorldSpec): RealizedWorld;
//# sourceMappingURL=worldRealize.d.ts.map