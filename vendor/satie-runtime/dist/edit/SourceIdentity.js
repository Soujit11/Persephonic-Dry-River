import { fnv1a64 } from '../core/ContentHash.js';
import { parseScene, pathFor } from '../core/SatieParser.js';
/** Only parser-created count copies of one authored header share an identity. */
export function isCountSourceGroup(statements) {
    const first = statements[0];
    return statements.length > 1 && !!first && first.sourceLine >= 0 && !first.sourceShared
        && statements.every((s, index) => s.isCountVariant && s.countIndex === index
            && s.sourceId === first.sourceId && s.sourceLine === first.sourceLine
            && s.sourceEndLine === first.sourceEndLine && !s.sourceShared);
}
function sourceGroups(scene) {
    if (scene.warnings.length)
        throw new Error('Source identity requires a script without parser warnings.');
    const groups = [];
    const seen = new Set();
    for (let i = 0; i < scene.statements.length;) {
        const first = scene.statements[i];
        const copies = [first];
        if (first.isCountVariant && !first.sourceShared) {
            for (let j = i + 1; j < scene.statements.length && scene.statements[j].sourceLine === first.sourceLine; j++)
                copies.push(scene.statements[j]);
        }
        const statements = isCountSourceGroup(copies) ? copies : [first];
        if (first.sourceId && seen.has(first.sourceId))
            throw new Error(`Duplicate source_id: ${first.sourceId}`);
        if (first.sourceId)
            seen.add(first.sourceId);
        groups.push({ statements, statementIndex: i });
        i += statements.length;
    }
    return groups;
}
/** Includes authored path dependencies, so editing a named route cannot bypass a lock. */
export function sourceFingerprints(script) {
    const scene = parseScene(script);
    return new Map(sourceGroups(scene).flatMap(({ statements }) => {
        const first = statements[0];
        return first.sourceId ? [[first.sourceId, JSON.stringify({
                    ...(statements.length === 1 ? { statement: first.toJSON() } : { statements: statements.map(s => s.toJSON()) }),
                    path: scene.paths.filter(p => statements.some(s => `path_${p.name}` === s.customTrajectoryName)).map(p => ({ ...p, lineNumber: undefined })),
                })]] : [];
    }));
}
/** A source can spawn multiple instances and use multiple takes. Never use track keys as identity. */
export function sourceIdentities(script) {
    const scene = parseScene(script);
    return sourceGroups(scene).map(({ statements, statementIndex }) => {
        const statement = statements[0];
        return { sourceId: statement.sourceId, statementIndex, line: statement.sourceLine,
            clipPath: pathFor(statement.clip), host: statement.hostRef, instances: statements.reduce((sum, s) => sum + s.count, 0),
            ...(statements.length > 1 ? { statementIndices: statements.map((_, i) => statementIndex + i), clipPaths: statements.map(s => pathFor(s.clip)) } : {}),
        };
    });
}
/** Assign on import; identity thereafter lives in the text and survives controlled edits. */
export function identifySources(script, newId = () => `s_${crypto.randomUUID()}`) {
    const rows = sourceIdentities(script);
    const lines = script.split('\n');
    const seen = new Set(rows.flatMap(r => r.sourceId ? [r.sourceId] : []));
    const origins = new Set();
    for (const row of rows) {
        if (origins.has(row.line))
            throw new Error('Expanded voices share a header; expand them before assigning source identities.');
        origins.add(row.line);
    }
    for (const row of rows.slice().reverse()) {
        if (row.sourceId)
            continue;
        const id = newId();
        if (!/^[\w.-]{1,128}$/.test(id) || seen.has(id))
            throw new Error('Invalid or duplicate generated source identity.');
        seen.add(id);
        const indent = lines[row.line].match(/^\s*/)?.[0] ?? '';
        lines.splice(row.line + 1, 0, `${indent}  source_id ${id}`);
    }
    return lines.join('\n');
}
/**
 * Deterministic IDs for unidentified playback imports. Distinct authored blocks
 * retain their IDs when reordered. Persist the returned text before editing;
 * edited unidentified blocks and identical duplicates cannot prove continuity.
 */
export function identifySourcesStable(script) {
    try {
        const scene = parseScene(script);
        const groups = sourceGroups(scene);
        const lines = script.split('\n');
        const used = new Set(groups.flatMap(g => g.statements[0].sourceId ? [g.statements[0].sourceId] : []));
        const fingerprints = new Map();
        const ids = [];
        for (const { statements } of groups) {
            const first = statements[0];
            if (first.sourceId)
                continue;
            const text = JSON.stringify([first.entityId, lines.slice(first.sourceLine, first.sourceEndLine + 1).map(line => line.trim()).join('\n')]);
            const base = `s_${fnv1a64(text)}`;
            if (fingerprints.has(base) && fingerprints.get(base) !== text)
                throw new Error('Source fingerprint collision');
            fingerprints.set(base, text);
            let id = base, copy = 2;
            while (used.has(id))
                id = `${base}_${copy++}`;
            used.add(id);
            ids.push(id);
        }
        // identifySources inserts from the bottom of the script upward.
        return identifySources(script, () => ids.pop());
    }
    catch {
        return script;
    }
}
/** Ambiguous rewrites stay unresolved; no fuzzy matching turns them into training pairs. */
export function pairSources(before, after) {
    const a = sourceIdentities(before), b = sourceIdentities(after);
    return { pairs: a.flatMap(source => {
            const target = source.sourceId ? b.find(r => r.sourceId === source.sourceId) : undefined;
            return target ? [{ sourceId: source.sourceId, before: source, after: target }] : [];
        }), unresolvedBefore: a.filter(r => !r.sourceId || !b.some(t => t.sourceId === r.sourceId)),
        unresolvedAfter: b.filter(r => !r.sourceId || !a.some(t => t.sourceId === r.sourceId)) };
}
//# sourceMappingURL=SourceIdentity.js.map