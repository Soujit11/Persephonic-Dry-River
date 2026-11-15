export function programSignature(s) {
    return JSON.stringify([s.kind, s.isGenerated ? s.genPrompt : s.clip, s.eventName, s.variants,
        s.pitch.min, s.pitch.max, s.randomStart, s.spread.min, s.spread.max, s.takesInOrder, s.recordings]);
}
export function programIssue(s) {
    if (!s.programId)
        return null;
    if (s.pitchFollow || s.pitchInterpolation || s.groupPitchModulation)
        return `program '${s.programId}' requires a constant source playback rate; remove per-emitter pitch automation`;
    if (!s.every.isNull || s.paceFollow || s.chance !== null)
        return `program '${s.programId}' requires a broadcast event for repeated playback; independent every/pace/chance scheduling cannot share a clock`;
    return null;
}
export function inspectPrograms(statements) {
    const signatures = new Map(), issues = new Map();
    for (const s of statements) {
        if (!s.programId)
            continue;
        const signature = programSignature(s), prior = signatures.get(s.programId), issue = programIssue(s);
        if (issue)
            issues.set(s.programId, issue);
        else if (prior && prior !== signature)
            issues.set(s.programId, `program '${s.programId}' must use the same recording, kind, event, take bank, pitch and start-offset policy on every emitter`);
        signatures.set(s.programId, signature);
    }
    return { signatures, issues };
}
/**
 * A shared take and emission clock, allocated only when a program starts/joins.
 * No audio nodes, timers, frame work, or replacement spatial engine. Late loop
 * emitters join the current phase. A broadcast event supplies its own transient
 * cohort, so a new fire can overlap the preceding fire without mixing choices.
 */
export class SynchronizedPrograms {
    runs = new Map();
    invalid = new Map();
    /** Preserve compatible loops over document edits; reject contradictory program definitions. */
    configure(statements) {
        const { signatures, issues } = inspectPrograms(statements);
        this.invalid = issues;
        for (const [id, run] of this.runs)
            if (signatures.get(id) !== run.signature || issues.has(id))
                this.runs.delete(id);
    }
    issue(id) { return this.invalid.get(id); }
    reset() { this.runs.clear(); }
    invalidateBuffer(key) {
        for (const [id, run] of this.runs)
            if (run.bufferKey === key)
                this.runs.delete(id);
    }
    current(s, trackKey, event) {
        const run = (event ?? this.runs).get(s.programId);
        return run && (event || s.kind === 'loop' || !run.participants.has(trackKey)) ? run : undefined;
    }
    join(s, trackKey, now, proposed, event) {
        const id = s.programId;
        const scope = event ?? this.runs;
        let run = scope.get(id);
        // Recurring authored one-shots start a new program when their first
        // existing participant fires again; late new participants join this run.
        if (!run || (!event && s.kind !== 'loop' && run.participants.has(trackKey))) {
            run = { ...proposed, signature: programSignature(s), participants: new Set() };
            scope.set(id, run);
        }
        if (s.kind !== 'loop' && !event)
            run.participants.add(trackKey);
        const startsAt = Math.max(now, run.startsAt);
        const elapsed = Math.max(0, startsAt - run.startsAt) * run.pitch;
        const position = run.offsetSeconds + elapsed;
        return { buffer: run.buffer, bufferKey: run.bufferKey, take: run.take, pitch: run.pitch,
            startsAt, epoch: run.startsAt,
            offsetSeconds: s.kind === 'loop' ? position % run.buffer.duration : position,
            expired: s.kind !== 'loop' && position >= run.buffer.duration };
    }
}
//# sourceMappingURL=SynchronizedPrograms.js.map