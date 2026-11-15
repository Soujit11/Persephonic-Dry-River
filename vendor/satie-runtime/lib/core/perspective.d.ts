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
/**
 * The prompt with its vantage removed: "distant thunder rumbling" -> "thunder rumbling", "street traffic heard through
 * the window" -> "street traffic". Returns the prompt unchanged when nothing else would be left of it.
 */
export declare function withoutPerspective(prompt: string): string;
/** Whether a prompt, or a recording's name ("thunder-distant-rumble"), carries the listener's vantage. */
export declare function bakesPerspective(text: string): boolean;
//# sourceMappingURL=perspective.d.ts.map