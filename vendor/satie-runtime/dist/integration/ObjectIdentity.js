/** Host names address bindings; instance IDs identify physical lifetimes. */
export class ObjectIdentity {
    ids = new Map();
    ensure(host) {
        if (!host.trim())
            throw new Error('Object identity requires a host name');
        let id = this.ids.get(host);
        if (!id) {
            id = `o_${crypto.randomUUID()}`;
            this.ids.set(host, id);
        }
        return id;
    }
    get(host) { return this.ids.get(host); }
    retire(host) {
        const id = this.ids.get(host);
        this.ids.delete(host);
        return id;
    }
    snapshot() { return Object.fromEntries(this.ids); }
    clear() { this.ids.clear(); }
}
//# sourceMappingURL=ObjectIdentity.js.map