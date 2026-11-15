export function validateObjectStateSchema(schema) {
    if (!schema || !['host-schema', 'capture-bindings', 'unknown'].includes(schema.basis)
        || !schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)
        || Object.keys(schema.properties).length > 100)
        throw new Error('Invalid object state schema');
    for (const [name, property] of Object.entries(schema.properties)) {
        if (!name || name.length > 256 || !property || !['tracked', 'untracked'].includes(property.tracking)
            || (property.values !== null && (!Array.isArray(property.values) || !property.values.length || property.values.length > 256
                || property.values.some(v => typeof v !== 'string' || !v || v.length > 256)
                || new Set(property.values).size !== property.values.length)))
            throw new Error(`Invalid state property ${name}`);
        if (property.signalsByValue !== undefined) {
            const presets = property.signalsByValue;
            if (property.tracking !== 'tracked' || !property.values || !presets || typeof presets !== 'object'
                || Object.keys(presets).length !== property.values.length || property.values.some(value => !Object.hasOwn(presets, value)))
                throw new Error(`Acoustic bindings must cover every value of ${name}`);
            let keys;
            for (const outputs of Object.values(presets)) {
                if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs) || Object.keys(outputs).length > 100
                    || Object.entries(outputs).some(([signal, value]) => !signal || signal.length > 256 || !Number.isFinite(value)))
                    throw new Error(`Invalid acoustic signals for ${name}`);
                const next = Object.keys(outputs).sort().join('\0');
                if (keys !== undefined && next !== keys)
                    throw new Error(`Acoustic states of ${name} must reset the same signals`);
                keys = next;
            }
        }
    }
    if (schema.basis === 'unknown' && Object.keys(schema.properties).length)
        throw new Error('Unknown coverage requires empty properties');
    return structuredClone(schema);
}
export class ObjectStateSchemas {
    schemas = new Map();
    declare(host, schema) {
        const copy = validateObjectStateSchema(schema);
        this.schemas.set(host, copy);
        return structuredClone(copy);
    }
    get(host) { return this.schemas.get(host); }
    validate(host, group, value) {
        const property = this.schemas.get(host)?.properties[group];
        if (property && (property.tracking === 'untracked' || (property.values !== null && !property.values.includes(value)))) {
            throw new Error(`State ${host}/${group}/${value} contradicts its coverage declaration`);
        }
    }
    snapshot(hosts) {
        return Object.fromEntries([...hosts].map(host => [host, structuredClone(this.schemas.get(host) ?? { basis: 'unknown', properties: {} })]));
    }
    delete(host) { this.schemas.delete(host); }
    clear() { this.schemas.clear(); }
}
//# sourceMappingURL=ObjectStateSchema.js.map