export function stateSignalsFor(schema, group, value) {
    return schema?.properties[group]?.signalsByValue?.[value];
}
export function assertStateSignals(expected, actual) {
    if (expected === undefined) {
        if (actual !== undefined)
            throw new Error('State signal evidence requires a declared acoustic binding');
        return;
    }
    if (!actual || Object.keys(actual).length !== Object.keys(expected).length
        || Object.entries(expected).some(([name, value]) => actual[name] !== value))
        throw new Error('State signal evidence disagrees with the declared acoustic binding');
}
/** Syntax-level consumers establish a connection; render tests establish its acoustic effect. */
export function acousticSignalConsumers(statements, signal) {
    const result = [];
    for (const [index, s] of statements.entries()) {
        for (const field of ['volumeFollow', 'pitchFollow', 'synthBrightnessFollow', 'synthTempoFollow', 'splFollow', 'occlusionFollow', 'paceFollow']) {
            if (s[field]?.signal === signal.toLowerCase())
                result.push(`${s.sourceId ?? index}:${field}`);
        }
        if (s.whenCondition?.signal === signal.toLowerCase())
            result.push(`${s.sourceId ?? index}:when`);
        if (s.quietGates.some(g => g.signal === signal.toLowerCase()))
            result.push(`${s.sourceId ?? index}:quiet`);
    }
    return result;
}
export function validateStateAcoustics(actions, statements) {
    const schemas = new Map();
    for (const action of actions) {
        if (action.accepted === false)
            continue;
        if (action.kind === 'object-destroy')
            schemas.delete(action.name);
        if (action.kind === 'object-state-schema' && action.bodyId && action.stateSchema) {
            schemas.set(action.bodyId, action.stateSchema);
            for (const property of Object.values(action.stateSchema.properties)) {
                for (const outputs of Object.values(property.signalsByValue ?? {}))
                    for (const signal of Object.keys(outputs)) {
                        if (!acousticSignalConsumers(statements, signal).length)
                            throw new Error(`State acoustic signal ${signal} has no consumer in the audio script`);
                    }
            }
        }
        if (action.kind === 'object-state')
            assertStateSignals(stateSignalsFor(schemas.get(action.bodyId), action.name, action.text), action.stateSignals);
    }
}
//# sourceMappingURL=StateAcoustics.js.map