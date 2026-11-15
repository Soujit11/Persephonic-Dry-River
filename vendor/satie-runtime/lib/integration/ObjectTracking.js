export class ObjectTracking {
    states = new Map();
    set(host, value) { this.states.set(host, { ...value }); }
    get(host) { return this.states.get(host); }
    assertReportable(host) {
        if (this.states.get(host)?.status === 'lost')
            throw new Error(`Tracking for ${host} is lost; recover before reporting fresh state`);
    }
    snapshot(hosts) {
        return Object.fromEntries([...hosts].map(host => [host, { ...(this.states.get(host) ?? { status: 'awaiting-report' }) }]));
    }
    delete(host) { this.states.delete(host); }
    clear() { this.states.clear(); }
}
//# sourceMappingURL=ObjectTracking.js.map