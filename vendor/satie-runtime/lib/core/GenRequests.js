import { pathFor, sanitizeForClipName } from './SatieParser.js';
import { recordingBank } from './RecordingBanks.js';
import { withoutPerspective } from './perspective.js';
import { fnv1a } from './Random.js';
/**
 * The generator's prompt discipline, applied to every gen prompt on the way
 * out: the listener's vantage is removed first ("distant", "muffled",
 * "through the wall", "faint": `withoutPerspective`, 2026-11-08), a loop asks
 * for a seamless texture, a one-shot for a single event, and unless the author
 * asked for reverb the source is recorded DRY — the engine owns acoustics
 * (rooms, distance, occlusion), so a take must carry none of its own. Part of the generation cache key and the server-side capture
 * genKey: changing it regenerates cached clips once, on purpose. Servers
 * that realize scripts ahead of playback apply the same enrichment so they
 * land on the same take pool the app would.
 */
export function enrichGenPrompt(prompt, isLoop) {
    let p = withoutPerspective(prompt).trim();
    const lower = p.toLowerCase();
    if (isLoop) {
        if (!/\b(loop|seamless|ambience|ambient)\b/.test(lower)) {
            p = `${p}, seamless ambience loop, consistent texture`;
        }
    }
    else if (!/\b(single|one[- ]?shot|short)\b/.test(lower)) {
        p = `${p}, single sound event`;
    }
    if (!/\b(reverb|reverberant|echo|echoing|echoes|cathedral|hall)\b/.test(lower)) {
        p = `${p}, dry recording, no reverb`;
    }
    return p;
}
/** What the app requests when a gen statement states no length / influence (seconds; 0..1). */
// Loops are bought at the generator's maximum (30 s): a longer take repeats less often and gives
// the seamless-loop treatment more material to match (2026-09-09).
/** A synthesized loop is a minute unless asked otherwise; a synthesized one-shot four seconds. Both 2 to 120 s. */
export const SYNTH_DEFAULTS = { loopDurationS: 60, oneshotDurationS: 4, minDurationS: 2, maxDurationS: 120 };
/** The length a synth take is rendered at: the one rule the app, the route's callers and the MCP share. */
export function synthDuration(requested, isLoop) {
    const d = requested ?? (isLoop ? SYNTH_DEFAULTS.loopDurationS : SYNTH_DEFAULTS.oneshotDurationS);
    return Math.min(Math.max(d, SYNTH_DEFAULTS.minDurationS), SYNTH_DEFAULTS.maxDurationS);
}
export const GEN_DEFAULTS = { loopDurationS: 30, oneshotDurationS: 4, minDurationS: 0.5, maxDurationS: 30, loopInfluence: 0.3, oneshotInfluence: 0.5 };
/**
 * Distinct generated takes per `{text}` substitution of a template trigger.
 * Compatibility minimum; authors can request a larger bank with `variants`.
 * Two alternating takes are not evidence of perceptual variety.
 */
export const TRIGGER_TAKE_BANK = 2;
/** Shared by generation, live playback and MCP cost/preflight reporting. */
export const templateBankSize = (stmt, text) => recordingBank(stmt.recordings ?? null, text)?.length ?? Math.max(TRIGGER_TAKE_BANK, stmt.variants);
export const takeCount = (stmt) => stmt.recordings?.takes?.length ?? Math.max(1, stmt.variants);
/** Generation length of a trigger take whose gen block states none (seconds): events are tight clips. */
export const TRIGGER_TAKE_DURATION_S = 1.5;
/** A single locomotion contact, not a multi-step recording. */
export const CONTACT_TAKE_DURATION_S = 0.7;
/** True for a gen prompt that substitutes the event's text per fire (`… on {text}`). */
export function isTemplatePrompt(prompt) {
    return !!prompt && /\{\w+\}/.test(prompt);
}
/**
 * Where a template's takes are kept: the template's own identity (its prompt, hashed, so two
 * templates never share a bank) then, per text, the WHOLE text. Keys before 2026-09-30 cut the
 * substituted prompt at 30 characters, so texts with a common start ("grass", "gravel_ballast")
 * shared one bank; those keys are still read (`legacyTemplateTake`), never written.
 */
export function templateBankPrefix(genPrompt) {
    return `${pathFor(`generation/${sanitizeForClipName(genPrompt.replace(/\{\w+\}/g, '_'))}_${fnv1a(genPrompt).toString(36)}`)}__`;
}
/** The text's part of a take key: readable, and exact (a hash of the text itself). */
function textKey(text) {
    const t = text.trim();
    return `${t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)}_${fnv1a(t).toString(36)}`;
}
/** The prompt a template trigger fires with for `text`, and the buffer key of its `bank`-th take. */
export function templateTake(genPrompt, text, bank) {
    const prompt = genPrompt.replace(/\{\w+\}/g, text.trim());
    return { prompt, clipPath: `${templateBankPrefix(genPrompt)}${textKey(text)}__t${bank}` };
}
/** The key the same take had before 2026-09-30 (read as a fallback, so saved scenes keep playing). */
export function legacyTemplateTake(genPrompt, text, bank) {
    const prompt = genPrompt.replace(/\{\w+\}/g, text.trim());
    return `${pathFor('generation/' + sanitizeForClipName(prompt))}__t${bank}`;
}
/** Canonical template lookup for runtime, bank inspectors and exported asset manifests. */
export function templateRecording(stmt, text, bank) {
    const legacy = templateTake(stmt.genPrompt ?? '', text, bank);
    const generated = stmt.genKey
        ? `${pathFor(stmt.clip)}__${fnv1a(legacy.prompt).toString(16)}__t${bank}`
        : legacy.clipPath;
    return { prompt: legacy.prompt, clipPath: recordingBank(stmt.recordings, text)?.[bank] ?? generated };
}
/** Explicit references, including all surface banks, for retention and asset preparation. */
export function recordingReferences(stmt) {
    return [...new Set([...(stmt.recordings?.takes ?? []), ...Object.values(stmt.recordings?.surfaces ?? {}).flat()])];
}
/** Default generation length of a `loopable` gen block that states none (seconds). */
export const GEN_LOOPABLE_DEFAULT_S = 10;
/** Buffer key of the k-th pooled take: the base clip for k = 0, `<base>#k+1` beyond. */
export function takeClipPath(stmt, k) {
    if (stmt.recordings?.takes)
        return stmt.recordings.takes[Math.max(0, k)] ?? '';
    const base = pathFor(stmt.clip);
    return k <= 0 ? base : `${base}#${k + 1}`;
}
/** The generator options a statement asks for its `variant`-th take. */
export function genOptionsFor(stmt, variant = 0, rng = Math.random) {
    const opts = {};
    if (!stmt.genDuration.isNull) {
        opts.duration = stmt.genDuration.sample(rng);
    }
    else if (stmt.kind === 'trigger' && !stmt.voiceId && (stmt.eventName === 'step' || stmt.eventName === 'land')) {
        opts.duration = CONTACT_TAKE_DURATION_S;
    }
    else if (stmt.genLoopable) {
        opts.duration = GEN_LOOPABLE_DEFAULT_S;
    }
    if (!stmt.genInfluence.isNull) {
        opts.influence = stmt.genInfluence.sample(rng);
    }
    // Count-variants and pooled takes must never alias to another clip's
    // cached take — the point of them is to differ. EVERY sibling is ranked,
    // the first included: the server numbers a prompt's pool oldest-first
    // and serves shared requests its newest take, so a first take left
    // unranked could land on the same recording as the pool's last rank.
    // Rank 0 is still a free server hit (the pool's oldest take); only the
    // local prompt-prefix aliasing is given up.
    if (stmt.isCountVariant || stmt.variants > 1) {
        opts.uniqueTake = true;
        // Rank in the prompt's server-side take pool: copy c of a count
        // variant, pool rank k → c * variants + k, distinct per (copy, rank).
        opts.takeIndex = stmt.countIndex * Math.max(1, stmt.variants) + variant;
    }
    // A voice that names a speech voice is SPEECH: the id rides out on every
    // generation request for it, and the app's hook routes it accordingly.
    if (stmt.voiceId)
        opts.voiceId = stmt.voiceId;
    if (stmt.music)
        opts.music = true;
    if (stmt.synth)
        opts.synth = true;
    return opts;
}
/** Whether `samples` already has the take a request names (under its key, or the key it was saved with). */
export function requestLanded(samples, r) {
    return !!samples[r.clipPath]?.url || (!!r.legacyClipPath && !!samples[r.legacyClipPath]?.url);
}
/**
 * Every take the script's gen voices will request, deduplicated by buffer
 * key, in statement order. Count copies (`3 * loop gen …`) are separate
 * statements after parsing and appear as separate requests.
 */
export function genRequestsFor(statements, rng = Math.random) {
    const out = [];
    const seen = new Set();
    statements.forEach((stmt, statementIndex) => {
        if (!stmt.isGenerated || !stmt.genPrompt || stmt.recordings?.takes)
            return;
        // A template trigger has no fixed take: `templateRequestsFor` names them per text.
        if (stmt.kind === 'trigger' && isTemplatePrompt(stmt.genPrompt))
            return;
        const n = Math.max(1, stmt.variants);
        for (let k = 0; k < n; k++) {
            const clipPath = takeClipPath(stmt, k);
            if (seen.has(clipPath))
                continue;
            seen.add(clipPath);
            out.push({
                clipPath,
                prompt: stmt.genPrompt,
                isLoop: stmt.kind === 'loop',
                variant: k,
                options: genOptionsFor(stmt, k, rng),
                speech: !!stmt.voiceId,
                statementIndex,
            });
        }
    });
    return out;
}
/**
 * The takes a script's TEMPLATE triggers (`on step gen single footstep on
 * {text}`) will fire with for each of `texts` (the surfaces / descriptions the
 * game will send): `templateBankSize(stmt)` distinct takes per text,
 * keyed exactly as `fireEvent` looks them up, with the options
 * `generateTriggerTake` sends. Realize these ahead of time and the runtime
 * needs no generator for footsteps.
 */
export function templateRequestsFor(statements, texts, rng = Math.random) {
    const out = [];
    const seen = new Set();
    statements.forEach((stmt, statementIndex) => {
        if (stmt.kind !== 'trigger' || !stmt.genPrompt || !isTemplatePrompt(stmt.genPrompt))
            return;
        for (const text of texts) {
            if (!text.trim())
                continue;
            if (recordingBank(stmt.recordings, text) !== undefined)
                continue;
            for (let bank = 0; bank < templateBankSize(stmt); bank++) {
                const { prompt, clipPath } = templateRecording(stmt, text, bank);
                if (seen.has(clipPath))
                    continue;
                seen.add(clipPath);
                const options = { ...genOptionsFor(stmt, 0, rng), uniqueTake: true, takeIndex: bank, priority: true };
                if (options.duration === undefined)
                    options.duration = TRIGGER_TAKE_DURATION_S;
                out.push({ clipPath, prompt, isLoop: false, variant: bank, options, speech: !!stmt.voiceId, statementIndex, legacyClipPath: legacyTemplateTake(stmt.genPrompt, text, bank) });
            }
        }
    });
    return out;
}
/** Ground labels are literal runtime materialAt texts; do not split compound names. */
export function worldGroundSurfaces(world) {
    return Array.from(new Set((world?.ground ?? []).map(g => g.material.trim()).filter(Boolean)));
}
/** One plan for both budget estimates and realization, including known template banks. */
export function generationPlanFor(statements, world, suppliedSurfaces = [], rng = Math.random) {
    const surfaces = Array.from(new Set([...suppliedSurfaces, ...worldGroundSurfaces(world)])).filter(text => text.trim());
    return { surfaces, requests: [...genRequestsFor(statements, rng), ...templateRequestsFor(statements, surfaces, rng)] };
}
/** Template trigger statements in a script: the prompts that need `texts` to be realized. */
export function templatePrompts(statements) {
    const out = [];
    statements.forEach((stmt, statementIndex) => {
        if (stmt.kind === 'trigger' && stmt.genPrompt && isTemplatePrompt(stmt.genPrompt))
            out.push({ statementIndex, event: stmt.eventName, prompt: stmt.genPrompt });
    });
    return out;
}
//# sourceMappingURL=GenRequests.js.map