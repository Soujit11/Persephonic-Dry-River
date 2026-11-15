export interface BadgeOptions {
    /** Where the badge mounts: a positioned player container, or another document's body (a same-origin game frame). Default: this page's viewport. */
    host?: HTMLElement;
    /** The credit line; defaults to "Sound by SATIE" for every scene type. */
    title?: string;
    /** Dev mode, set in code: the circle stays in play and opens the SATIE mixer. Off (the shipped game): the credit plays and leaves. */
    dev: boolean;
    /** Dev mode: what a click on the circle does (open the mixer). Without it the circle stays in play as a credit only. */
    onOpen?: () => void;
    zIndex?: number;
    /**
     * The scene is loading: until this settles a quiet "loading sounds" line shows and the badge stays away;
     * its intro plays when loading finishes. Same as calling setLoading(true / false).
     */
    ready?: Promise<unknown>;
}
/** Each hue animation's position in ms, keyed by element class and animation name. */
export type BadgePhase = Record<string, number>;
export interface SatieBadge {
    /** The loading or pause screen is showing: play the credit. */
    intro(): void;
    /** Show the folded butterfly at rest, without replaying the credit (a game already entered). */
    rest(): void;
    /** Show the credit already open and fold it after `ms`: an intro handed over from another screen keeps its own timer.
     *  `phase` (from another badge's `animationPhase()`) resumes its hue animations where that one had them. */
    hold(ms: number, phase?: BadgePhase): void;
    /** Where each running hue animation is, to hand to the badge that takes over (`hold`). */
    animationPhase(): BadgePhase;
    /** How long until the running intro folds the credit (0 when it is not out on a timer). */
    remainingMs(): number;
    /** The player is entering the game: fold, then fade out. */
    hide(): void;
    /** Hide while the mixer panel is open. */
    setPanelOpen(open: boolean): void;
    /** Loading: a quiet line instead of the badge; the badge's intro plays when it ends. */
    setLoading(loading: boolean): void;
    destroy(): void;
}
export declare function badge(opts: BadgeOptions): SatieBadge;
//# sourceMappingURL=index.d.ts.map