import { parseScene } from '../core/SatieParser.js';
import { upsertVoiceProperty } from './scriptEdit.js';
import { sourceIdentities } from './SourceIdentity.js';
export function validateMotionPlan(value) {
    const p = value;
    if (!p || !/^[\w.-]{1,128}$/.test(p.sourceId) || p.frame !== 'scene'
        || !['once', 'repeat', 'bounce'].includes(p.loop) || !Array.isArray(p.waypoints)
        || p.waypoints.length < 2 || p.waypoints.length > 64)
        throw new Error('Invalid motion plan.');
    for (let i = 0; i < p.waypoints.length; i++) {
        const w = p.waypoints[i];
        if (!w || ![w.x, w.y, w.z, w.t].every(Number.isFinite) || w.t < 0 || w.t > 600
            || (i === 0 ? w.t !== 0 : w.t <= p.waypoints[i - 1].t))
            throw new Error('Waypoints require finite coordinates and increasing seconds starting at zero.');
    }
    return structuredClone(p);
}
/** Numeric motion is compiled, never reinterpreted by the DSL writer. Hosted motion remains host-owned. */
export function applyMotionPlan(script, input) {
    const plan = validateMotionPlan(input);
    const row = sourceIdentities(script).find(r => r.sourceId === plan.sourceId);
    if (!row)
        throw new Error(`Unknown motion source: ${plan.sourceId}`);
    if (row.host)
        throw new Error('Hosted motion must be supplied by its host; detach explicitly before applying a scene path.');
    const statement = parseScene(script).statements[row.statementIndex];
    const name = `motion_${Array.from(plan.sourceId, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`;
    // A reserved per-source path is replaced in place, never accumulated on every edit.
    const edited = upsertVoiceProperty(script, { kind: statement.kind, clip: statement.clip,
        sourceId: plan.sourceId }, 'move', `path ${name}`);
    if (edited === null)
        throw new Error('Cannot locate motion source.');
    const lines = edited.split('\n');
    const header = lines.findIndex(l => l.trim().toLowerCase() === `path ${name}`.toLowerCase());
    if (header >= 0) {
        let end = header + 1;
        while (end < lines.length && (!lines[end].trim() || /^\s/.test(lines[end])))
            end++;
        lines.splice(header, end - header);
    }
    const cleaned = lines.join('\n');
    return `${cleaned.trimEnd()}\n\npath ${name}\n${plan.waypoints.map(w => `  waypoint ${w.x} ${w.y} ${w.z} ${w.t}`).join('\n')}\n  cycle ${plan.waypoints.at(-1).t * (plan.loop === 'bounce' ? 2 : 1)}\n  loop ${plan.loop}\n`;
}
//# sourceMappingURL=MotionPlan.js.map