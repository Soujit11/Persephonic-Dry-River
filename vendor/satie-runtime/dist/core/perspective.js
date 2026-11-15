/**
 * The listener's vantage, in words. Distance ("distant", "far away", "in the distance"), obstruction ("muffled", "through
 * the wall", "from outside", "behind the door") and faintness ("faint", "barely audible") are what Satie's engine renders
 * from a voice's place, its occlusion and its level. A generated take must not bake them in: a "distant" thunder placed
 * far is far twice, a "muffled" street behind a wall is muffled twice, and neither can be undone when the listener walks
 * up to it. Rooms and reverb are a separate rule (`enrichGenPrompt` asks for a dry recording unless a space is named).
 *
 * One list for every path that writes or reads a prompt: generation (`enrichGenPrompt`, so the app, the MCP and the
 * Workshop all buy the source dry and close), the authoring lint, and retrieval of library recordings by name. No
 * imports, so the Workshop's browser copy (prototypes/library/v3/retrieval.js) can be checked against it.
 */
/** Phrases removed from a prompt, in order (longer phrases first, so "muffled through the wall" goes as one). */
const VANTAGE = [
    // obstruction: what the sound is heard through, behind or from
    /\b(?:(?:heavily|slightly|very)\s+)?muffled\s+(?:by|through|behind)\s+(?:(?:a|an|the|thick|thin|closed|heavy)\s+){0,2}[a-z]+\b/gi,
    /\b(?:heard\s+|coming\s+)?(?:muffled\s+)?(?:through|behind|beyond)\s+(?:(?:a|an|the|thick|thin|closed|open|heavy|glass)\s+){0,2}(?:walls?|windows?|windowpanes?|doors?|glass|ceilings?|floors?|floorboards|curtains?|partitions?)\b/gi,
    /\b(?:heard\s+|coming\s+)?from\s+(?:outside|inside|indoors|outdoors|upstairs|downstairs|next\s+door|another\s+room|the\s+next\s+room|a\s+neighbou?ring\s+(?:room|flat|apartment|house))\b/gi,
    /\b(?:heavily|slightly|very)\s+muffled\b/gi,
    /\bmuffled\b/gi,
    // distance
    /\b(?:heard\s+|coming\s+)?(?:from\s+)?(?:somewhere\s+)?in\s+the\s+(?:far\s+)?distance\b/gi,
    /\b(?:heard\s+)?(?:from\s+)?(?:afar|a\s+distance)\b/gi,
    /\bat\s+a\s+distance\b/gi,
    /\bfar[\s-]+(?:away|off|out)\b/gi,
    /\bfaraway\b/gi,
    /\b(?:very|quite|slightly)\s+distant\b/gi,
    /\bdistant(?:ly)?\b/gi,
    // faintness: the level is the voice's, not the take's
    /\bbarely\s+audible\b/gi,
    /\b(?:very\s+)?faint(?:ly)?\b/gi,
];
const tidy = (s) => s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/([,;])\s*(?=[,;]|$)/g, '')
    .replace(/^[\s,;]+|[\s,;]+$/g, '')
    .replace(/\b(heard|coming)\s*(?=,|$)/gi, '')
    .replace(/\b(a|an|the|of|and|with|in|on)\s*(?=,|$)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;]+|[\s,;]+$/g, '')
    .trim();
/**
 * The prompt with its vantage removed: "distant thunder rumbling" -> "thunder rumbling", "street traffic heard through
 * the window" -> "street traffic". Returns the prompt unchanged when nothing else would be left of it.
 */
export function withoutPerspective(prompt) {
    let p = String(prompt ?? '');
    for (const rx of VANTAGE)
        p = p.replace(rx, ' ');
    const out = tidy(p);
    return out ? out : String(prompt ?? '').trim();
}
/** Whether a prompt, or a recording's name ("thunder-distant-rumble"), carries the listener's vantage. */
export function bakesPerspective(text) {
    const t = String(text ?? '').replace(/[-_]+/g, ' ');
    return VANTAGE.some(rx => { rx.lastIndex = 0; const hit = rx.test(t); rx.lastIndex = 0; return hit; });
}
//# sourceMappingURL=perspective.js.map