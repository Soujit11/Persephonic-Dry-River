import { parseScene } from '../core/SatieParser.js';
import { sourceIdentities, sourceFingerprints } from '../edit/SourceIdentity.js';
import { upsertVoiceProperty } from '../edit/scriptEdit.js';
/** Bounded transaction queue. Preparation/validation happens outside the audio tick. */
export class SceneOperations {
    apply;
    pending = [];
    seen = new Set();
    locks = new Set();
    revisionNumber = 0;
    current;
    script;
    history = [];
    constructor(script, revision, apply) {
        this.apply = apply;
        sourceIdentities(script);
        this.script = script;
        this.current = revision;
    }
    get revision() { return this.current; }
    get currentScript() { return this.script; }
    results() { return structuredClone(this.history); }
    setLocked(sourceId, locked) {
        if (!sourceIdentities(this.script).some(s => s.sourceId === sourceId))
            throw new Error('Unknown source lock.');
        if (locked)
            this.locks.add(sourceId);
        else
            this.locks.delete(sourceId);
    }
    prepare(operation, now) {
        if (!/^[\w.-]{1,128}$/.test(operation.id) || !Number.isFinite(operation.at) || operation.at < 0
            || !Number.isFinite(now) || !['reject', 'apply'].includes(operation.late))
            throw new Error('Invalid scene operation.');
        if (this.seen.has(operation.id))
            throw new Error('Duplicate operation ID.');
        if (this.seen.size >= 10000 || this.pending.length >= 256)
            throw new Error('Operation session capacity reached.');
        if (operation.baseRevision !== this.current)
            throw new Error('Stale scene revision.');
        if (operation.at < now && operation.late === 'reject')
            throw new Error('Operation arrived too late.');
        const preparedScript = this.preview(operation.change);
        const before = sourceFingerprints(this.script), after = sourceFingerprints(preparedScript);
        const changedIds = [...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id) !== after.get(id));
        this.seen.add(operation.id);
        this.pending.push({ ...structuredClone(operation), preparedScript, changedIds });
        this.pending.sort((a, b) => a.at - b.at);
    }
    cancel(id, now) {
        const i = this.pending.findIndex(p => p.id === id);
        if (i < 0)
            return false;
        this.pending.splice(i, 1);
        this.note({ id, status: 'cancelled', revision: this.current, time: now });
        return true;
    }
    note(result) {
        this.history.push(result);
        if (this.history.length > 1000)
            this.history.shift();
    }
    preview(change) {
        if (!change || typeof change !== 'object')
            throw new Error('Invalid change.');
        let next = this.script;
        if (change.kind === 'source') {
            if (this.locks.has(change.sourceId))
                throw new Error('Source is locked by its author.');
            if (!['place', 'move', 'spl', 'volume', 'pitch', 'occlusion', 'radius', 'ring', 'reverb'].includes(change.property)
                || typeof change.value !== 'string' || !change.value.trim() || /[\r\n]/.test(change.value))
                throw new Error('Invalid source property change.');
            const row = sourceIdentities(this.script).find(s => s.sourceId === change.sourceId);
            if (!row)
                throw new Error('Unknown source.');
            const st = parseScene(this.script).statements[row.statementIndex];
            next = upsertVoiceProperty(this.script, { sourceId: change.sourceId, kind: st.kind, clip: st.clip }, change.property, change.value);
            if (next === null)
                throw new Error('Source cannot be edited.');
        }
        else if (change.kind === 'script') {
            if (typeof change.script !== 'string' || change.script.length > 500000)
                throw new Error('Invalid script replacement.');
            next = change.script;
        }
        else if (change.kind === 'event') {
            if (typeof change.name !== 'string' || !change.name || (change.position && (change.position.length !== 3 || !change.position.every(Number.isFinite))))
                throw new Error('Invalid event.');
        }
        else if (change.kind === 'signal') {
            if (typeof change.name !== 'string' || !change.name || !Number.isFinite(change.value))
                throw new Error('Invalid signal.');
        }
        else if (change.kind === 'state') {
            if ((change.name !== null && typeof change.name !== 'string') || (change.isolation !== undefined && (!Number.isFinite(change.isolation) || change.isolation < 0 || change.isolation > 1)))
                throw new Error('Invalid state.');
        }
        else
            throw new Error('Unknown operation kind.');
        sourceIdentities(next);
        const before = sourceFingerprints(this.script), after = sourceFingerprints(next);
        for (const id of this.locks)
            if (before.get(id) !== after.get(id))
                throw new Error(`Locked source changed: ${id}`);
        return next;
    }
    flush(now) {
        while (this.pending.length && this.pending[0].at <= now) {
            const operation = this.pending.shift();
            try {
                if (operation.baseRevision !== this.current)
                    throw new Error('Stale scene revision at commit.');
                if (operation.changedIds.some(id => this.locks.has(id)))
                    throw new Error('Source locked after preparation.');
                const next = operation.preparedScript;
                this.apply(operation.change, next);
                this.script = next;
                if (operation.change.kind === 'source' || operation.change.kind === 'script')
                    this.current = `${operation.baseRevision}:op:${++this.revisionNumber}`;
                this.note({ id: operation.id, status: 'applied', revision: this.current, time: now });
            }
            catch (error) {
                this.note({ id: operation.id, status: 'rejected', revision: this.current, time: now, reason: String(error) });
            }
        }
    }
}
//# sourceMappingURL=SceneOperations.js.map