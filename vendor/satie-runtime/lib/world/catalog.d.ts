/**
 * The Sound Source Catalog: what the engine knows about kinds of sound before
 * a model says anything. One row per source class, with a VERIFIED emission
 * prior (dB SPL at a stated reference distance, with its source and how much
 * we trust it), the class's temporal grammar, its state couplings, the hosts
 * it may bind to, and whether a real recording or a generated take is the
 * right source for it.
 *
 * The model picks; the catalog states the numbers. `applyCatalogPriors` runs
 * on every normalised spec: an entry that matches a row gets its emission
 * clamped into the row's range (or set, when the model gave none), its
 * interval, active hours and suppressions filled where absent, and a
 * `catalog` binding recorded so later stages, the author and the traces can
 * see which prior governed it. Nothing here is an estimate dressed as a fact:
 * a contested figure carries a range and low confidence, and a row with no
 * primary source says so.
 *
 * Keys are our own slugs. `ucsCategory` is the Universal Category System
 * category name (public domain, the SFX industry's shared vocabulary); the
 * exact UCS CatID is bound from the official list in a later pass and is
 * left undefined until then rather than guessed.
 */
import type { WorldSpec } from './worldSpec.js';
export type Triad = 'biophony' | 'geophony' | 'anthrophony';
export type SourceProcess = 'vocalization' | 'wingbeat' | 'stridulation' | 'impact' | 'scrape' | 'rolling' | 'engine' | 'wind' | 'pour' | 'splash' | 'drip' | 'combustion' | 'mechanical' | 'resonance' | 'crowd' | 'air';
export type SourceKind = 'bed' | 'spot' | 'scatter' | 'repertoire';
export type Confidence = 'high' | 'medium' | 'low';
export type Sourcing = 'library' | 'generate' | 'either';
/** The host kinds a class may bind to (see WorldCompile's host mapping). */
export type HostKind = 'listener' | 'overhead' | 'air' | 'ground' | 'horizon' | 'strip' | 'liquid' | 'patch' | 'class' | 'fixture' | 'aperture' | 'space';
export interface CatalogEmission {
    /** Typical emission in dB SPL at `refDistanceM`. */
    splDb: number;
    /** The plausible band; the model's figure is clamped into it. */
    range: [number, number];
    refDistanceM: number;
    weighting: 'Z' | 'A';
    metric: 'rms' | 'peak' | 'leq';
    confidence: Confidence;
    /** Where the figure comes from, or "estimate" when no primary source was found. */
    source: string;
}
export interface CatalogRow {
    id: string;
    ucsCategory: string;
    ucsCatId?: string;
    label: string;
    /** Phrases that name this class in a label or a sound prompt (matched on word boundaries). */
    aliases: string[];
    triad: Triad;
    process: SourceProcess;
    kind: SourceKind;
    emission: CatalogEmission;
    temporal: {
        mode: 'loop' | 'oneshot';
        /** A oneshot's interval band in seconds. */
        everyS?: [number, number];
        /** Local hours the class is active; absent means always. Twilight-relative offsets are a later pass. */
        activeHours?: [number, number][];
    };
    couplings: {
        /** Signal thresholds above which the class goes quiet. */
        suppressedBy?: Record<string, number>;
        /** The class's level follows this signal (a bed of rain follows rain). */
        follows?: 'rain' | 'wind';
    };
    hosts: HostKind[];
    sourcing: Sourcing;
    /** The canonical dry, close generation prompt. */
    prompt: string;
}
/** The seed rows. Sources are cited per row; see brain/engineering/satie-authoring-redesign-2026-09-16.md for the evidence scan. */
export declare const CATALOG: readonly CatalogRow[];
export declare function catalogRow(id: string): CatalogRow | undefined;
/**
 * The catalog row a label or sound prompt names, or null. The longest alias
 * that appears as whole words wins, so "heavy rain on the window" binds to
 * rain on a window before it binds to heavy rain, and "carpet" never binds
 * to car. Exported for the planner, the acceptance ladder and tests.
 */
export declare function matchCatalog(...texts: (string | undefined)[]): CatalogRow | null;
export interface CatalogBinding {
    entryId: string;
    rowId: string;
    /** What the prior changed on the entry, one phrase each; empty when the model's numbers were already inside the row's bands. */
    changes: string[];
}
/**
 * Bind every ecology entry and repertoire member that names a catalog class
 * to its row and apply the row's priors in place. Returns what was bound and
 * what changed, for notes and traces. Idempotent: a second pass changes
 * nothing. Entries that match no row are left exactly as written.
 */
export declare function applyCatalogPriors(spec: WorldSpec, opts?: {
    infer?: boolean;
    defaultsOnly?: boolean;
}): {
    spec: WorldSpec;
    bindings: CatalogBinding[];
    unbound: string[];
};
/** How much of a spec the catalog already governs (entries and members carrying a `catalog` binding). */
export declare function catalogCoverageOf(spec: WorldSpec): {
    bound: number;
    total: number;
    unbound: string[];
};
/** One line for the author: how much of the scene the catalog governs. */
export declare function describeCatalogCoverage(cov: {
    bound: number;
    total: number;
    unbound: readonly string[];
}, adjusted?: number): string;
//# sourceMappingURL=catalog.d.ts.map