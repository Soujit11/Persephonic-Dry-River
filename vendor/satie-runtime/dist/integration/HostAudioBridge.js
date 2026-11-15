/** Typed causal boundary shared by game adapters. Call directly from the authoritative
 * host callback. It never polls an overwritten "last event", runs a footstep timer,
 * guesses damage from speed, or delays a collision to the next render frame.
 */
export class HostAudioBridge {
    runtime;
    static owners = new WeakMap();
    recent = new Set();
    recentOrder = [];
    stateValues = new Map();
    controlValues = new Map();
    stateOwned = new Map();
    sequences = new Map();
    limit;
    disposed = false;
    bindings;
    constructor(runtime, bindings) {
        this.runtime = runtime;
        // Own the validated contract; callers cannot mutate ranges or state presets mid-transition.
        this.bindings = { ...bindings,
            controls: Object.fromEntries(Object.entries(bindings.controls ?? {}).map(([key, value]) => [key, Object.freeze({ ...value })])),
            events: Object.fromEntries(Object.entries(bindings.events ?? {}).map(([key, value]) => [key, Object.freeze({ ...value })])),
            states: Object.fromEntries(Object.entries(bindings.states ?? {}).map(([group, value]) => [group, Object.freeze({ states: Object.freeze(Object.fromEntries(Object.entries(value.states).map(([key, values]) => [key, Object.freeze({ ...values })]))) })])),
            onDetach: Object.freeze({ ...bindings.onDetach }),
        };
        Object.freeze(this.bindings.controls);
        Object.freeze(this.bindings.events);
        Object.freeze(this.bindings.states);
        Object.freeze(this.bindings);
        bindings = this.bindings;
        if (!bindings.bodyId)
            throw new Error('A stable host body id is required');
        this.limit = bindings.recentEventLimit ?? 256;
        if (!Number.isSafeInteger(this.limit) || this.limit < 1 || this.limit > 10000)
            throw new Error('Invalid host event history bound');
        const outputs = new Set();
        for (const [name, control] of Object.entries(bindings.controls ?? {})) {
            if (!control.signal || !control.unit || !Number.isFinite(control.min) || !Number.isFinite(control.max) || control.min > control.max)
                throw new Error(`Invalid control ${name}`);
            if (outputs.has(control.signal))
                throw new Error(`Controls cannot share output ${control.signal}`);
            outputs.add(control.signal);
            const declared = runtime.contract?.scene.signals;
            const signal = declared?.find(signal => signal.name === control.signal);
            if (declared && !signal)
                throw new Error(`Undeclared runtime signal ${control.signal}`);
            if (signal && ((signal.min != null && control.min < signal.min) || (signal.max != null && control.max > signal.max)))
                throw new Error(`Control ${name} exceeds the runtime signal range`);
        }
        for (const [name, binding] of Object.entries(bindings.events ?? {})) {
            if (!binding.event || !binding.sourceId)
                throw new Error(`Event channel ${name} requires event and source identity`);
            if (runtime.contract?.scene.events && !runtime.contract.scene.events.some(event => event.name === binding.event))
                throw new Error(`Undeclared runtime event ${binding.event}`);
        }
        for (const [group, binding] of Object.entries(bindings.states ?? {})) {
            const states = Object.entries(binding.states);
            if (!states.length)
                throw new Error(`State group ${group} is empty`);
            const keys = Object.keys(states[0][1]).sort().join('\0');
            for (const [state, values] of states) {
                if (!state || Object.keys(values).sort().join('\0') !== keys)
                    throw new Error(`State ${group}/${state} must reset the same controls`);
                for (const [control, value] of Object.entries(values)) {
                    this.validateControl(control, value);
                    const owner = this.stateOwned.get(control);
                    if (owner && owner !== group)
                        throw new Error(`State groups ${owner} and ${group} both own ${control}`);
                    this.stateOwned.set(control, group);
                }
            }
        }
        for (const [name, value] of Object.entries(bindings.onDetach ?? {}))
            this.validateControl(name, value);
        let owners = HostAudioBridge.owners.get(runtime);
        if (!owners) {
            owners = { signals: new Map(), bodies: new Map() };
            HostAudioBridge.owners.set(runtime, owners);
        }
        if (owners.bodies.has(bindings.bodyId))
            throw new Error(`Body ${bindings.bodyId} already has an active audio bridge`);
        for (const signal of outputs)
            if (owners.signals.has(signal))
                throw new Error(`Runtime signal ${signal} is already owned by another body`);
        runtime.declareObjectStates(bindings.bodyId, { basis: 'capture-bindings',
            properties: Object.fromEntries(Object.entries(bindings.states ?? {}).map(([group, binding]) => [group, { tracking: 'tracked', values: Object.keys(binding.states), signalsByValue: Object.fromEntries(Object.entries(binding.states).map(([value, outputs]) => [value, Object.fromEntries(Object.entries(outputs).map(([name, n]) => [bindings.controls[name].signal, n]))])) }])),
        });
        owners.bodies.set(bindings.bodyId, this);
        for (const signal of outputs)
            owners.signals.set(signal, this);
    }
    alive() { if (this.disposed)
        throw new Error('Host audio bridge is disposed'); }
    validateControl(name, value) {
        const control = this.bindings.controls?.[name];
        if (!control)
            throw new Error(`Undeclared host control ${name}`);
        if (!Number.isFinite(value) || value < control.min || value > control.max)
            throw new Error(`Host control ${name} is outside ${control.min}..${control.max} ${control.unit}`);
        return control;
    }
    write(name, value) {
        const binding = this.validateControl(name, value);
        if (this.controlValues.get(name) === value)
            return;
        this.runtime.signal(binding.signal, value);
        this.controlValues.set(name, value);
    }
    control(name, value) {
        this.alive();
        if (this.stateOwned.has(name))
            throw new Error(`Control ${name} is owned by state group ${this.stateOwned.get(name)}`);
        this.write(name, value);
    }
    trackingLost(reason = 'tracking-loss') { this.alive(); this.runtime.loseObjectTracking(this.bindings.bodyId, reason); this.stateValues.clear(); }
    trackingRecovered() { this.alive(); this.runtime.recoverObjectTracking(this.bindings.bodyId); this.stateValues.clear(); }
    state(group, value) {
        this.alive();
        const values = this.bindings.states?.[group]?.states[value];
        if (!values)
            throw new Error(`Undeclared host state ${group}/${value}`);
        this.runtime.validateObjectStateReport(this.bindings.bodyId, group, value);
        if (this.stateValues.get(group) === value && this.runtime.objectStateIsCurrent(this.bindings.bodyId, group, value))
            return;
        this.runtime.objectState(this.bindings.bodyId, group, value);
        for (const [name, next] of Object.entries(values))
            this.controlValues.set(name, next);
        this.stateValues.set(group, value);
    }
    event(input) {
        this.alive();
        const binding = this.bindings.events?.[input.channel];
        if (!binding)
            throw new Error(`Undeclared host event channel ${input.channel}`);
        if (!input.id || ![input.position.x, input.position.y, input.position.z].every(Number.isFinite))
            throw new Error('Host events require an occurrence id and finite contact point');
        if (input.sequence != null && (!Number.isSafeInteger(input.sequence) || input.sequence < 0))
            throw new Error('Host event sequence must be a nonnegative safe integer');
        if (input.sequence != null && input.sequence <= (this.sequences.get(input.channel) ?? -1))
            return false;
        const key = `${input.channel}\0${input.id}`;
        if (this.recent.has(key))
            return false;
        const accepted = this.runtime.eventAtMeters(binding.event, input.position, input.surface, {
            occurredAt: input.occurredAt, simulationTime: input.simulationTime,
            bodyId: this.bindings.bodyId, contactId: input.contactId ?? input.id,
            sourceId: binding.sourceId, cause: binding.authority, gain: input.gain,
        });
        // An attempted physical occurrence is never replayed later after it has become stale.
        this.recent.add(key);
        this.recentOrder.push(key);
        if (input.sequence != null)
            this.sequences.set(input.channel, input.sequence);
        if (this.recentOrder.length > this.limit)
            this.recent.delete(this.recentOrder.shift());
        return accepted;
    }
    /** Apply only the host's explicit detach response. */
    dispose() {
        if (this.disposed)
            return;
        for (const [name, value] of Object.entries(this.bindings.onDetach ?? {}))
            this.write(name, value);
        this.runtime.clearObjectState(this.bindings.bodyId);
        this.runtime.engine.releaseEmitter(this.bindings.bodyId);
        const owners = HostAudioBridge.owners.get(this.runtime);
        owners?.bodies.delete(this.bindings.bodyId);
        for (const control of Object.values(this.bindings.controls ?? {}))
            owners?.signals.delete(control.signal);
        this.recent.clear();
        this.recentOrder.length = 0;
        this.disposed = true;
    }
}
//# sourceMappingURL=HostAudioBridge.js.map