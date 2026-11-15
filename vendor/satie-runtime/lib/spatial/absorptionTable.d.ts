/**
 * Octave-band absorption coefficients — the material half of the acoustics.
 *
 * GENERATED FILE. Source data: RoomTreat, https://roomtreat.com/data/absorption-coefficients/
 * Licence: Creative Commons Attribution 4.0 International (CC BY 4.0),
 * https://creativecommons.org/licenses/by/4.0/
 * Attribution: "Sound absorption coefficient data from RoomTreat
 * (https://roomtreat.com/data/absorption-coefficients/), CC BY 4.0."
 *
 * Measured by the reverberation-room method (ISO 354 / ASTM C423), random
 * incidence. These are nominal planning values aggregated from standard
 * references, not measurements of a specific product — which is fine here,
 * because between accredited laboratories the same coefficient scatters by
 * ~0.05 anyway (see ABSORPTION_SD_R in RoomAcoustics). We are competing with
 * that prior, not with truth.
 *
 * The table is pure representation. Nothing in the codebase enumerates these
 * names or branches on them: a label reaches a row through generic string
 * similarity, so the vocabulary stays open and belongs to whoever wrote the
 * scene.
 *
 * TWO GAPS, both deliberate and both surfaced rather than papered over:
 *
 *  1. NO OUTDOOR OR NATURAL SURFACES. Every row is architectural or studio
 *     treatment — there is no grass, water, sand, snow, foliage, rock or
 *     gravel. Satie's worlds are frequently piers, caves, jungles and snow
 *     villages, so a lookup for those labels SHOULD fail rather than snap to
 *     the nearest carpet. `lookupAbsorption` reports confidence for exactly
 *     this reason; filling the gap needs a second, separately attributed
 *     source.
 *  2. `person-standing` is excluded from coefficient lookup: its value is in
 *     sabins PER PERSON, not a dimensionless per-area coefficient, and using
 *     it as an alpha would be a unit error.
 */
import type { BandValues } from './RoomAcoustics';
export interface AbsorptionEntry {
    id: string;
    name: string;
    category: string;
    /** Index-aligned to OCTAVE_BANDS_HZ (125, 250, 500, 1000, 2000, 4000 Hz). */
    absorption: BandValues;
}
export declare const ABSORPTION_TABLE_ATTRIBUTION: string;
/** Rows whose value is not a dimensionless per-area coefficient. */
export declare const NON_COEFFICIENT_IDS: readonly string[];
export declare const ABSORPTION_TABLE: readonly AbsorptionEntry[];
//# sourceMappingURL=absorptionTable.d.ts.map