/**
 * What the language can do, as a catalog for Satie's own models (never shown to the person). It is
 * generated from the property registry, so a new property reaches the director without a prompt
 * edit; only the statement-level shapes that are not properties (an `entity` block, count copies,
 * a class host) are written here, once.
 *
 * The person never reads this: they ask for a result and hear it. The catalog is what keeps the
 * director from refusing, or under-delivering on, something the script can already say.
 */
import { PROPERTIES, PROPERTY_CONCERNS } from '../core/Properties.js';
/** Sentences of a property's documentation that state a limit (where it does not apply, what it needs). */
function limits(doc) {
    return doc.split(/(?<=\.)\s+|\n/).map(s => s.trim())
        .filter(s => /\b(ignored|only on|only for|needs|requires|without a|does nothing|not on)\b/i.test(s) && s.length <= 220);
}
const firstSentence = (doc) => (doc.split(/(?<=[.!?])\s|\n/)[0] ?? '').trim().slice(0, 180);
const example = (doc) => doc.match(/Example:\s*([^\n]+)/)?.[1]?.trim().slice(0, 160);
/** Statement shapes that are not properties: how one voice becomes many sources. */
const SHAPES = [
    '`N * oneshot …` / `N * loop …`: N copies of one voice, each with its own timer (`every`), take and `scatter` offset.',
    '`at <object>`: the sound comes from that object and follows it. `at <class>` (ids `name_1…name_n`): a oneshot fires from a random member each time, a loop sits on the nearest; with `N *` copy k goes on member k.',
    '`at <strip> pass`: a thing travelling along a strip of the world block (a car down a road), new direction and speed per fire.',
    '`entity <name>` block: a population or route of individuals, each instance with its own take, a slightly different pitch, its own phase of `every`, its own `chance`. Members cannot carry `at` / `place` / `move`.',
    'A sound `at` an object follows that object: the script never moves, stops or steers the object itself (how things move and look is the game\'s own code).',
    'A line source (a lane, a river, a train consist) is ONE source heard from its nearest point; nothing separate exists inside it. To hear separate things along it, place copies with `scatter` (not `at` the line), or the game must expose the things as objects.',
];
/** Every property concern that is about sound (all but how a voice is drawn), from the registry itself. */
export const SOUND_CONCERNS = [...new Set(Object.values(PROPERTY_CONCERNS))].filter(c => c !== 'look');
/** The catalog as text. Deterministic; bounded by the registry. */
export function capabilityCatalog(opts = {}) {
    const detail = opts.detail ?? true;
    const want = opts.concerns ? new Set(opts.concerns) : null;
    const byConcern = new Map();
    for (const p of PROPERTIES) {
        const concern = PROPERTY_CONCERNS[p.name] ?? p.concern ?? 'meta';
        if (want && !want.has(concern))
            continue;
        const parts = [`- ${p.name} (${p.detail}): ${firstSentence(p.documentation)}`];
        if (detail) {
            const lim = limits(p.documentation);
            if (lim.length)
                parts.push(`  limit: ${lim.join(' ')}`);
            const ex = example(p.documentation);
            if (ex)
                parts.push(`  e.g. ${ex}`);
        }
        byConcern.set(concern, [...(byConcern.get(concern) ?? []), ...parts]);
    }
    const out = ['HOW ONE VOICE BECOMES MANY SOURCES:', ...SHAPES.map(s => `- ${s}`)];
    for (const [concern, lines] of byConcern)
        out.push(`${concern.toUpperCase()}:`, ...lines);
    return out.join('\n');
}
//# sourceMappingURL=capabilities.js.map