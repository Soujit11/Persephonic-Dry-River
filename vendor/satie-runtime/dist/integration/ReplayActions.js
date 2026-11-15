import { stateSignalsFor, assertStateSignals } from './StateAcoustics.js';
import { validateObjectStateSchema } from './ObjectStateSchema.js';
import { CAPTURE_ACTION_KINDS, CAPTURE_CAPS } from './contracts.js';
export const createReplayState = () => ({ tracking: new Map(), stateSchemas: new Map(), objectInstances: new Map(), objectStates: new Map() });
export function validateReplay(actions, duration) {
    if (!Number.isFinite(duration) || duration < 0 || !Array.isArray(actions) || actions.length > CAPTURE_CAPS.actions)
        throw new Error(`Replay requires a finite duration and at most ${CAPTURE_CAPS.actions} actions.`);
    const result = structuredClone([...actions]);
    for (const a of result) {
        if (!a || typeof a !== 'object' || !Number.isFinite(a.t) || a.t < 0 || a.t > duration || typeof a.name !== 'string' || a.name.length > 200
            || !CAPTURE_ACTION_KINDS.includes(a.kind)
            || (a.position !== undefined && (!Array.isArray(a.position) || a.position.length !== 3 || !a.position.every(Number.isFinite)))
            || (a.value !== undefined && !Number.isFinite(a.value))
            || (a.text !== undefined && (typeof a.text !== 'string' || a.text.length > 4000))
            || (a.accepted !== undefined && typeof a.accepted !== 'boolean')
            || (a.eventGain !== undefined && (!Number.isFinite(a.eventGain) || a.eventGain < 0 || a.eventGain > 1)))
            throw new Error('Unsupported or invalid replay action.');
        if ((a.kind === 'bind' || a.kind === 'host-position' || a.kind === 'entity-steer') && !a.position)
            throw new Error('Position action requires a position.');
        if (a.kind === 'object-tracking' && (!a.bodyId || !a.tracking || !['lost', 'awaiting-report', 'tracking'].includes(a.tracking.status)))
            throw new Error('Invalid tracking action');
        if (a.kind === 'object-state-schema') {
            if (!a.bodyId || !a.stateSchema)
                throw new Error('State schema action requires a body and schema');
            validateObjectStateSchema(a.stateSchema);
        }
        if (a.kind === 'signal' && a.value === undefined)
            throw new Error('Signal requires a value.');
        if ((a.kind === 'object-state' || a.kind === 'object-state-clear') && (typeof a.bodyId !== 'string' || !a.bodyId || a.bodyId.length > 200))
            throw new Error('Object state requires a body.');
        if (a.kind === 'object-state' && (!a.name || !a.text))
            throw new Error('Object state requires group and value.');
        if ((a.kind === 'entity-action' || a.kind === 'entity-steer') && (!Number.isInteger(a.instance) || a.instance < 0))
            throw new Error('Entity action requires an instance.');
        if (a.kind === 'entity-action' && a.text === undefined)
            throw new Error('Entity action requires a name, or empty text to release.');
        if (a.kind === 'entity-goal' && !['', 'call', 'rest', 'roam', 'flee'].includes(a.text ?? ''))
            throw new Error('Invalid entity goal.');
    }
    return result.sort((a, b) => a.t - b.t);
}
/** Object states belong to the host, so replay requires an explicit sink for them. */
export async function applyReplayAction(engine, action, state) {
    if (action.accepted === false)
        return;
    if (action.objectInstanceId && action.kind !== 'object-destroy')
        state?.objectInstances.set(action.bodyId ?? action.name, action.objectInstanceId);
    switch (action.kind) {
        case 'capture-gap':
            if (!state)
                throw new Error('Replay capture gap requires a state sink');
            for (const host of new Set([...state.objectStates.keys(), ...state.objectInstances.keys()]))
                state.tracking.set(host, { status: 'lost', reason: action.name });
            state.objectStates.clear();
            break;
        case 'object-tracking':
            if (!state || !action.bodyId || !action.tracking)
                throw new Error('Replay tracking requires a body, status and state sink');
            state.tracking.set(action.bodyId, { ...action.tracking });
            if (action.tracking.status !== 'tracking')
                state.objectStates.delete(action.bodyId);
            break;
        case 'object-state-schema':
            if (!state)
                throw new Error('Replay state schema requires a state sink');
            state.stateSchemas.set(action.bodyId, validateObjectStateSchema(action.stateSchema));
            break;
        case 'bind':
            if (state?.tracking.get(action.name)?.reason === 'detached')
                state.tracking.set(action.name, { status: 'awaiting-report' });
            engine.setHostPosition(action.name, ...action.position);
            break;
        case 'host-position':
            engine.setHostPosition(action.name, ...action.position);
            break;
        case 'object-destroy':
            state?.tracking.delete(action.name);
            state?.stateSchemas.delete(action.name);
            state?.objectInstances.delete(action.name);
            engine.clearHost(action.name);
            state?.objectStates.delete(action.name);
            break;
        case 'unbind':
            state?.tracking.set(action.name, { status: 'lost', reason: 'detached' });
            engine.clearHost(action.name);
            state?.objectStates.delete(action.name);
            break;
        case 'signal':
            engine.setSignal(action.name, action.value);
            break;
        case 'state':
            engine.setSceneState(action.name || null, { isolation: action.value ?? 0.5 });
            break;
        case 'start':
            await engine.play();
            break;
        case 'stop':
            engine.stop();
            break;
        case 'object-state': {
            if (!state)
                throw new Error('Replay object state requires a state sink.');
            if (state.tracking.get(action.bodyId)?.status === 'lost')
                throw new Error('State report while tracking is lost');
            const outputs = stateSignalsFor(state.stateSchemas.get(action.bodyId), action.name, action.text);
            assertStateSignals(outputs, action.stateSignals);
            for (const [name, value] of Object.entries(outputs ?? {}))
                engine.setSignal(name, value);
            state.tracking.set(action.bodyId, { status: 'tracking' });
            let axes = state.objectStates.get(action.bodyId);
            if (!axes) {
                axes = new Map();
                state.objectStates.set(action.bodyId, axes);
            }
            axes.set(action.name, action.text);
            break;
        }
        case 'object-state-clear':
            if (!state)
                throw new Error('Replay object state requires a state sink.');
            state.objectStates.delete(action.bodyId);
            state.tracking.set(action.bodyId, { status: 'awaiting-report' });
            break;
        case 'entity-action':
            if (!engine.setEntityAction(action.name, action.instance, action.text || null))
                throw new Error('Recorded entity action is unavailable.');
            break;
        case 'entity-steer':
            if (!engine.steerInstance(action.name, action.instance, ...action.position))
                throw new Error('Recorded entity destination was refused.');
            break;
        case 'entity-goal':
            engine.setEntityGoal(action.name, (action.text || null));
            break;
        case 'event':
            engine.fireEvent(action.name, {
                ...(action.position ? { x: action.position[0], y: action.position[1], z: action.position[2] } : {}),
                ...(action.text !== undefined ? { text: action.text } : {}),
                ...(action.sourceId ? { sourceId: action.sourceId } : {}),
                ...(action.bodyId ? { emitterId: action.bodyId } : {}),
                ...(action.eventGain !== undefined ? { gain: action.eventGain } : {}),
            });
            break;
    }
}
//# sourceMappingURL=ReplayActions.js.map