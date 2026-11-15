/** Where a sound attaches on drawn geometry: its top, its base (a little above the underside), or its centre. */
export function attachFromGeometry(g, attach) {
    switch (attach) {
        case 'top': return { x: g.top.x, y: g.top.y, z: g.top.z };
        case 'base': return { x: g.base.x, y: g.base.y + 0.2, z: g.base.z };
        default: return { x: g.centre.x, y: g.centre.y, z: g.centre.z };
    }
}
/** The host every scene has: something far beyond the place (a random bearing 1.5–3 km out). */
export const HORIZON_HOST = 'horizon';
export class HostRegistry {
    hosts = new Map();
    classes = new Map();
    geometry = new Map();
    /** `cypress_3` → `cypress`; an id without a numeric suffix belongs to no class. */
    static classOf(id) {
        const m = /^(.+?)[_-]\d+$/.exec(id);
        return m ? m[1] : null;
    }
    has(id) { return this.hosts.has(id); }
    get(id) { return this.hosts.get(id); }
    /** Ids of every registered host. */
    ids() { return Array.from(this.hosts.keys()); }
    /** Members of a class in id order (`cypress` → cypress_1 …), empty when there is no such class. */
    membersOf(cls) { return this.classes.get(cls) ?? []; }
    memberIds(cls) { return this.membersOf(cls).map(m => m.id); }
    /** Whether `at <ref>` names something registered here: an id, a class, or the horizon. */
    knows(ref) {
        return ref === HORIZON_HOST || this.hosts.has(ref) || this.classes.has(ref);
    }
    /**
     * Place or move a host. `fresh` is true the first time an id is seen (the
     * engine adopts that host's voices); a move writes into the stored point.
     */
    set(id, x, y, z) {
        const cls = HostRegistry.classOf(id);
        const existing = this.hosts.get(id);
        if (existing) {
            existing.x = x;
            existing.y = y;
            existing.z = z;
            return { fresh: false, cls };
        }
        const p = { x, y, z };
        this.hosts.set(id, p);
        if (cls) {
            const members = this.classes.get(cls) ?? [];
            members.push({ id, p });
            members.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
            this.classes.set(cls, members);
        }
        return { fresh: true, cls };
    }
    /** The drawn box of a host (a world thing or an external host), when the graphics reported one. */
    geometryOf(id) { return this.geometry.get(id); }
    /** Record what the graphics drew for a host: its world-space box, centre and size in metres. */
    setGeometry(id, centre, size) {
        const g = {
            centre: { x: centre.x, y: centre.y, z: centre.z }, size: { x: size.x, y: size.y, z: size.z },
            base: { x: centre.x, y: centre.y - size.y / 2, z: centre.z }, top: { x: centre.x, y: centre.y + size.y / 2, z: centre.z },
        };
        this.geometry.set(id, g);
        return g;
    }
    clearGeometry(id) { return this.geometry.delete(id); }
    /** How far the drawn things reach from the origin on the ground, metres; 0 when nothing is drawn. */
    drawnHalfExtentM() {
        let r = 0;
        for (const g of this.geometry.values())
            r = Math.max(r, Math.abs(g.centre.x) + g.size.x / 2, Math.abs(g.centre.z) + g.size.z / 2);
        return r;
    }
    /** Forget a host; `removed` is false when it was never registered. */
    delete(id) {
        this.geometry.delete(id);
        if (!this.hosts.delete(id))
            return { removed: false, cls: null };
        const cls = HostRegistry.classOf(id);
        if (cls) {
            const members = (this.classes.get(cls) ?? []).filter(m => m.id !== id);
            if (members.length)
                this.classes.set(cls, members);
            else
                this.classes.delete(cls);
        }
        return { removed: true, cls };
    }
}
//# sourceMappingURL=HostRegistry.js.map