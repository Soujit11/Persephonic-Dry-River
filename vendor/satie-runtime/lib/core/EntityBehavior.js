import { clipContactsFor } from './EntityRig.js';
const slug = (s) => typeof s === 'string' && /^[a-z][a-z0-9_]{0,59}$/.test(s)
    && !['__proto__', 'constructor', 'prototype'].includes(s);
const finite = (v, low = -1e6, high = 1e6) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v, keys) => Object.keys(v).every(k => keys.includes(k));
/** Strict bounded admission, shared by the DSL and world planner. Invalid definitions never partially run. */
export function parseEntityBehavior(raw) {
    if (!object(raw) || !only(raw, ['identity', 'conditions', 'actions', 'initial'])
        || typeof raw.identity !== 'string' || !raw.identity.trim() || raw.identity.length > 1200
        || !object(raw.conditions) || Object.keys(raw.conditions).length > 12
        || !Array.isArray(raw.actions) || !raw.actions.length || raw.actions.length > 16)
        return null;
    const conditions = {};
    for (const [key, c] of Object.entries(raw.conditions)) {
        if (!slug(key) || !object(c) || !only(c, ['initial', 'min', 'max', 'drift']) || !finite(c.min) || !finite(c.max)
            || c.min >= c.max || !finite(c.initial, c.min, c.max) || (c.drift !== undefined && !finite(c.drift)))
            return null;
        conditions[key] = { initial: c.initial, min: c.min, max: c.max, drift: c.drift ?? 0 };
    }
    const actions = [];
    for (const a of raw.actions) {
        if (!object(a) || !only(a, ['name', 'goal', 'duration', 'score', 'weights', 'requires', 'effects', 'cooldown', 'animation', 'sounds', 'events', 'next'])
            || !slug(a.name) || actions.some(x => x.name === a.name) || !['call', 'rest', 'roam', 'flee'].includes(String(a.goal))
            || !Array.isArray(a.duration) || a.duration.length !== 2 || !finite(a.duration[0], .1, 3600) || !finite(a.duration[1], a.duration[0], 3600)
            || (a.score !== undefined && !finite(a.score)) || (a.cooldown !== undefined && !finite(a.cooldown, 0, 3600)))
            return null;
        const weights = [], requires = [], effects = {}, events = [];
        if (a.weights !== undefined) {
            if (!Array.isArray(a.weights) || a.weights.length > 24)
                return null;
            for (const w of a.weights) {
                if (!object(w) || !only(w, ['input', 'weight']) || typeof w.input !== 'string' || !finite(w.weight)
                    || !(Object.hasOwn(conditions, w.input) || w.input === 'listener_distance' || /^signal:[a-z][a-z0-9_]{0,59}$/.test(w.input)))
                    return null;
                weights.push({ input: w.input, weight: w.weight });
            }
        }
        if (a.requires !== undefined) {
            if (!Array.isArray(a.requires) || a.requires.length > 12)
                return null;
            for (const r of a.requires) {
                if (!object(r) || !only(r, ['condition', 'min', 'max']) || typeof r.condition !== 'string' || !Object.hasOwn(conditions, r.condition)
                    || !finite(r.min) || !finite(r.max, r.min))
                    return null;
                requires.push({ condition: r.condition, min: r.min, max: r.max });
            }
        }
        if (a.effects !== undefined) {
            if (!object(a.effects))
                return null;
            for (const [key, value] of Object.entries(a.effects)) {
                if (!Object.hasOwn(conditions, key) || !finite(value))
                    return null;
                effects[key] = value;
            }
        }
        if (a.events !== undefined) {
            if (!Array.isArray(a.events) || a.events.length > 16)
                return null;
            for (const e of a.events) {
                // `contact: true` is how a resolved clip contact comes back through the compiled script
                // (the behaviour is written to the entity block as JSON and parsed again); it is kept.
                if (!object(e) || !only(e, ['at', 'event', 'contact']) || !finite(e.at, 0, Math.max(a.duration[0], e.contact === true ? 3600 : 0)) || !slug(e.event)
                    || (e.contact !== undefined && e.contact !== true))
                    return null;
                events.push(e.contact === true ? { at: e.at, event: e.event, contact: true } : { at: e.at, event: e.event });
            }
            events.sort((x, y) => x.at - y.at);
        }
        if (a.animation !== undefined && (typeof a.animation !== 'string' || !a.animation.trim() || a.animation.length > 100))
            return null;
        // The clip's measured contacts join the cues as events named after the ACT (a `set_down`
        // act with the PickUp_Table clip fires `on set_down`; the clip only gives the time), or
        // `<act>_<contact>` when a clip has several, unless the author named that event themselves.
        const contacts = clipContactsFor(a.animation);
        for (const c of contacts) {
            const event = contacts.length === 1 ? a.name : `${a.name}_${c.contact}`;
            if (events.some(e => e.event === event))
                continue;
            events.push({ at: c.at, event, contact: true });
        }
        events.sort((x, y) => x.at - y.at);
        if (a.next !== undefined && (!Array.isArray(a.next) || a.next.length > 16 || !a.next.every(slug) || new Set(a.next).size !== a.next.length))
            return null;
        if (a.sounds !== undefined && (!Array.isArray(a.sounds) || a.sounds.length > 32 || !a.sounds.every(slug)))
            return null;
        actions.push({ name: a.name, goal: a.goal, duration: [...a.duration],
            score: a.score ?? 0, cooldown: a.cooldown ?? 0, weights, requires, effects, events,
            ...(a.animation !== undefined ? { animation: a.animation } : {}), ...(a.next !== undefined ? { next: [...a.next] } : {}), ...(a.sounds !== undefined ? { sounds: [...a.sounds] } : {}) });
    }
    if (actions.some(action => action.next?.some(name => !actions.some(candidate => candidate.name === name))))
        return null;
    const initial = raw.initial ?? actions[0].name;
    if (typeof initial !== 'string' || !actions.some(a => a.name === initial))
        return null;
    return { identity: raw.identity.trim(), conditions, actions, initial };
}
function enter(state, action, now, rng, reason) {
    state.cooldowns[action.name] = now + action.cooldown;
    state.action = action;
    state.startedAt = now;
    state.lastAt = now;
    state.until = now + action.duration[0] + rng() * (action.duration[1] - action.duration[0]);
    state.marker = 0;
    state.history.push({ action: action.name, t: now, reason });
    if (state.history.length > 16)
        state.history.shift();
}
export function createEntityBehavior(definition, now, rng, held = null) {
    const action = definition.actions.find(a => a.name === held) ?? definition.actions.find(a => a.name === definition.initial);
    const state = { definition, conditions: {}, action, startedAt: now, until: now, lastAt: now, marker: 0,
        held, cooldowns: {}, history: [], events: [] };
    for (const key of Object.keys(definition.conditions))
        state.conditions[key] = definition.conditions[key].initial;
    enter(state, action, now, rng, 'initial');
    return state;
}
/** Preserve condition values, phase and memory across appearance/sound edits; removed actions restart explicitly. */
export function reconcileEntityBehavior(state, definition, now, rng, held) {
    const values = {};
    for (const [key, c] of Object.entries(definition.conditions))
        values[key] = Math.max(c.min, Math.min(c.max, state.conditions[key] ?? c.initial));
    const current = definition.actions.find(a => a.name === state.action.name);
    state.conditions = values;
    state.definition = definition;
    state.held = held;
    for (const key of Object.keys(state.cooldowns))
        if (!definition.actions.some(a => a.name === key))
            delete state.cooldowns[key];
    if (current)
        state.action = current;
    else
        enter(state, definition.actions.find(a => a.name === definition.initial), now, rng, 'edited');
}
/** Returns true on action entry. A relocation finishes before an automatic transition, preventing sliding/teleporting. */
export function stepEntityBehavior(state, now, rng, signal, listenerDistance, canTransition = true) {
    state.events.length = 0;
    const dt = Math.max(0, now - state.lastAt);
    state.lastAt = now;
    for (const key in state.conditions) {
        const c = state.definition.conditions[key];
        state.conditions[key] = Math.max(c.min, Math.min(c.max, state.conditions[key] + dt * (c.drift + (state.action.effects[key] ?? 0))));
    }
    // Flush outgoing cues before a boundary transition; never replay a cue on a repeated tick.
    while (state.marker < state.action.events.length && state.action.events[state.marker].at <= now - state.startedAt) {
        state.events.push(state.action.events[state.marker++].event);
    }
    let changed = false;
    const forced = state.held && state.definition.actions.find(a => a.name === state.held);
    if (canTransition && ((forced && forced !== state.action) || (!forced && now >= state.until))) {
        let selected = forced || null, best = -Infinity;
        const successors = state.action.next;
        if (!selected)
            for (const a of state.definition.actions) {
                if (successors && !successors.includes(a.name))
                    continue;
                if ((state.cooldowns[a.name] ?? -Infinity) > now || a.requires.some(r => state.conditions[r.condition] < r.min || state.conditions[r.condition] > r.max))
                    continue;
                let score = a.score;
                for (const w of a.weights) {
                    const value = w.input === 'listener_distance' ? listenerDistance : w.input.startsWith('signal:') ? signal(w.input.slice(7)) : state.conditions[w.input];
                    if (Number.isFinite(value))
                        score += value * w.weight;
                }
                if (score > best) {
                    selected = a;
                    best = score;
                }
            }
        if (selected) {
            enter(state, selected, now, rng, forced ? 'held' : successors ? 'transition' : 'utility');
            changed = true;
        }
        else
            state.until = now + .25;
        if (changed)
            while (state.marker < state.action.events.length && state.action.events[state.marker].at === 0)
                state.events.push(state.action.events[state.marker++].event);
    }
    return changed;
}
export function entityActionAllowsSound(state, sourceId) {
    if (!state?.action.sounds)
        return true;
    const id = sourceId?.slice(sourceId.lastIndexOf('.') + 1);
    return !!id && state.action.sounds.includes(id);
}
//# sourceMappingURL=EntityBehavior.js.map