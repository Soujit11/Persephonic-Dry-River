/**
 * What the language can do, as a catalog for Satie's own models (never shown to the person). It is
 * generated from the property registry, so a new property reaches the director without a prompt
 * edit; only the statement-level shapes that are not properties (an `entity` block, count copies,
 * a class host) are written here, once.
 *
 * The person never reads this: they ask for a result and hear it. The catalog is what keeps the
 * director from refusing, or under-delivering on, something the script can already say.
 */
import { type PropertyConcern } from '../core/Properties.js';
/** Every property concern that is about sound (all but how a voice is drawn), from the registry itself. */
export declare const SOUND_CONCERNS: readonly PropertyConcern[];
export interface CatalogOptions {
    /** Only these concerns (default: all). */
    concerns?: PropertyConcern[];
    /** Include examples and limits (default true); false is one line per property. */
    detail?: boolean;
}
/** The catalog as text. Deterministic; bounded by the registry. */
export declare function capabilityCatalog(opts?: CatalogOptions): string;
//# sourceMappingURL=capabilities.d.ts.map