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
export const ABSORPTION_TABLE_ATTRIBUTION = 'Sound absorption coefficient data from RoomTreat ' +
    '(https://roomtreat.com/data/absorption-coefficients/), CC BY 4.0.';
/** Rows whose value is not a dimensionless per-area coefficient. */
export const NON_COEFFICIENT_IDS = ['person-standing'];
export const ABSORPTION_TABLE = [
    { id: 'concrete-block-painted', name: 'Concrete masonry block, painted/sealed', category: 'Hard surfaces', absorption: [0.1, 0.05, 0.06, 0.07, 0.09, 0.08] },
    { id: 'concrete-block-coarse', name: 'Concrete masonry block, coarse/unpainted', category: 'Hard surfaces', absorption: [0.36, 0.44, 0.31, 0.29, 0.39, 0.25] },
    { id: 'brick-unglazed', name: 'Brick, unglazed', category: 'Hard surfaces', absorption: [0.03, 0.03, 0.03, 0.04, 0.05, 0.07] },
    { id: 'plaster-on-brick', name: 'Plaster on masonry', category: 'Hard surfaces', absorption: [0.01, 0.01, 0.02, 0.03, 0.04, 0.05] },
    { id: 'gypsum-board', name: 'Gypsum board (12 mm on studs)', category: 'Hard surfaces', absorption: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09] },
    { id: 'marble-tile', name: 'Marble or glazed tile', category: 'Hard surfaces', absorption: [0.01, 0.01, 0.01, 0.01, 0.02, 0.02] },
    { id: 'cork-tile', name: 'Cork tiles, 25 mm, on solid backing', category: 'Hard surfaces', absorption: [0.02, 0.02, 0.03, 0.04, 0.04, 0.05] },
    { id: 'concrete-floor', name: 'Concrete or terrazzo floor', category: 'Floors', absorption: [0.01, 0.01, 0.01, 0.02, 0.02, 0.02] },
    { id: 'vinyl-on-concrete', name: 'Vinyl / linoleum on concrete', category: 'Floors', absorption: [0.02, 0.03, 0.03, 0.03, 0.03, 0.02] },
    { id: 'wood-floor', name: 'Wood floor on joists', category: 'Floors', absorption: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07] },
    { id: 'parquet-on-concrete', name: 'Parquet on concrete', category: 'Floors', absorption: [0.04, 0.04, 0.07, 0.06, 0.06, 0.07] },
    { id: 'carpet-thin', name: 'Carpet, thin, on concrete', category: 'Floors', absorption: [0.02, 0.06, 0.14, 0.37, 0.6, 0.65] },
    { id: 'carpet-medium-underlay', name: 'Carpet, medium, on felt underlay', category: 'Floors', absorption: [0.05, 0.15, 0.35, 0.55, 0.65, 0.7] },
    { id: 'carpet-heavy-pad', name: 'Carpet, heavy, on foam pad', category: 'Floors', absorption: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73] },
    { id: 'rug-medium', name: 'Area rug, medium pile, on hard floor', category: 'Floors', absorption: [0.04, 0.08, 0.2, 0.45, 0.6, 0.65] },
    { id: 'rubber-floor', name: 'Rubber / PVC sports floor tile', category: 'Floors', absorption: [0.02, 0.03, 0.04, 0.04, 0.04, 0.04] },
    { id: 'glass-window', name: 'Ordinary window glass', category: 'Glass & wood', absorption: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04] },
    { id: 'glass-heavy-plate', name: 'Heavy plate glass', category: 'Glass & wood', absorption: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02] },
    { id: 'plywood-panel', name: 'Plywood panel (10 mm, air gap)', category: 'Glass & wood', absorption: [0.28, 0.22, 0.17, 0.09, 0.1, 0.11] },
    { id: 'wood-paneling', name: 'Wood paneling on battens', category: 'Glass & wood', absorption: [0.3, 0.25, 0.2, 0.17, 0.15, 0.1] },
    { id: 'solid-wood-door', name: 'Solid wood door', category: 'Glass & wood', absorption: [0.14, 0.1, 0.06, 0.08, 0.1, 0.1] },
    { id: 'osb-panel', name: 'OSB / chipboard panel (10 mm, air gap)', category: 'Glass & wood', absorption: [0.25, 0.2, 0.15, 0.1, 0.1, 0.1] },
    { id: 'hardboard-panel', name: 'Hardboard (3 mm) on battens, air gap', category: 'Glass & wood', absorption: [0.2, 0.15, 0.1, 0.1, 0.1, 0.1] },
    { id: 'curtains-light', name: 'Curtains, lightweight, draped', category: 'Soft furnishings', absorption: [0.05, 0.06, 0.39, 0.63, 0.7, 0.73] },
    { id: 'curtains-heavy', name: 'Curtains, heavy, deep folds', category: 'Soft furnishings', absorption: [0.14, 0.35, 0.55, 0.72, 0.7, 0.65] },
    { id: 'upholstered-seat-fabric', name: 'Upholstered seat, fabric, empty', category: 'Soft furnishings', absorption: [0.19, 0.37, 0.56, 0.67, 0.61, 0.59] },
    { id: 'upholstered-seat-leather', name: 'Upholstered seat, leather, empty', category: 'Soft furnishings', absorption: [0.15, 0.27, 0.39, 0.34, 0.48, 0.52] },
    { id: 'mattress', name: 'Mattress, bare', category: 'Soft furnishings', absorption: [0.22, 0.55, 0.7, 0.7, 0.73, 0.75] },
    { id: 'bookshelf-filled', name: 'Filled bookshelf', category: 'Soft furnishings', absorption: [0.3, 0.4, 0.4, 0.3, 0.3, 0.3] },
    { id: 'audience-occupied-upholstered', name: 'Audience, occupied upholstered seats (per m²)', category: 'Soft furnishings', absorption: [0.39, 0.57, 0.8, 0.94, 0.92, 0.87] },
    { id: 'wooden-chairs-empty', name: 'Wooden chairs, unoccupied (per m²)', category: 'Soft furnishings', absorption: [0.02, 0.02, 0.03, 0.04, 0.04, 0.04] },
    { id: 'mineral-wool-50', name: 'Mineral wool, 50 mm, on wall', category: 'Porous absorbers', absorption: [0.15, 0.55, 0.9, 1, 1, 1] },
    { id: 'mineral-wool-100', name: 'Mineral wool, 100 mm, on wall', category: 'Porous absorbers', absorption: [0.45, 0.95, 1, 1, 1, 1] },
    { id: 'mineral-wool-50-gap', name: 'Mineral wool, 50 mm, 50 mm air gap', category: 'Porous absorbers', absorption: [0.4, 0.85, 1, 1, 1, 1] },
    { id: 'owens-703-25', name: 'Rigid fiberglass 703, 25 mm', category: 'Porous absorbers', absorption: [0.11, 0.28, 0.68, 0.9, 0.93, 0.96] },
    { id: 'owens-703-50', name: 'Rigid fiberglass 703, 50 mm', category: 'Porous absorbers', absorption: [0.17, 0.86, 1, 1, 1, 1] },
    { id: 'owens-703-100', name: 'Rigid fiberglass 703, 100 mm', category: 'Porous absorbers', absorption: [0.65, 1, 1, 1, 1, 1] },
    { id: 'acoustic-foam-50', name: 'Open-cell acoustic foam, 50 mm', category: 'Porous absorbers', absorption: [0.08, 0.25, 0.6, 0.9, 0.95, 0.98] },
    { id: 'acoustic-foam-25', name: 'Open-cell acoustic foam, 25 mm', category: 'Porous absorbers', absorption: [0.05, 0.12, 0.3, 0.65, 0.85, 0.95] },
    { id: 'egg-crate-foam-50', name: 'Convoluted egg-crate foam, 50 mm', category: 'Porous absorbers', absorption: [0.05, 0.18, 0.45, 0.7, 0.85, 0.9] },
    { id: 'mineral-wool-150', name: 'Mineral wool, 150 mm, on wall', category: 'Porous absorbers', absorption: [0.65, 1, 1, 1, 1, 1] },
    { id: 'polyester-batt-50', name: 'Polyester acoustic batt, 50 mm', category: 'Porous absorbers', absorption: [0.12, 0.45, 0.85, 1, 1, 1] },
    { id: 'wood-wool-board', name: 'Wood-wool cement board, 25 mm', category: 'Porous absorbers', absorption: [0.1, 0.2, 0.45, 0.55, 0.6, 0.55] },
    { id: 'acoustic-plaster', name: 'Acoustic plaster, sprayed (~25 mm)', category: 'Porous absorbers', absorption: [0.17, 0.4, 0.66, 0.65, 0.62, 0.68] },
    { id: 'fabric-panel-50', name: 'Fabric-wrapped panel, 50 mm', category: 'Acoustic panels', absorption: [0.16, 0.55, 0.95, 1, 1, 0.98] },
    { id: 'fabric-panel-100', name: 'Fabric-wrapped panel, 100 mm', category: 'Acoustic panels', absorption: [0.52, 0.96, 1, 1, 1, 0.99] },
    { id: 'fabric-panel-50-gap', name: 'Fabric panel, 50 mm + 100 mm gap', category: 'Acoustic panels', absorption: [0.45, 0.9, 1, 1, 1, 0.98] },
    { id: 'pet-felt-panel-12', name: 'PET felt panel, 12 mm', category: 'Acoustic panels', absorption: [0.03, 0.07, 0.32, 0.62, 0.78, 0.82] },
    { id: 'pet-felt-panel-24', name: 'PET felt panel, 24 mm (double layer)', category: 'Acoustic panels', absorption: [0.05, 0.15, 0.5, 0.8, 0.85, 0.85] },
    { id: 'perforated-wood-panel', name: 'Perforated wood panel + backing', category: 'Acoustic panels', absorption: [0.25, 0.55, 0.8, 0.85, 0.6, 0.4] },
    { id: 'corner-trap-broadband', name: 'Broadband corner trap (300 mm)', category: 'Bass traps', absorption: [0.5, 0.85, 1, 1, 1, 1] },
    { id: 'superchunk-corner', name: 'Superchunk corner (mineral wool)', category: 'Bass traps', absorption: [0.6, 0.95, 1, 1, 1, 1] },
    { id: 'membrane-trap-tuned', name: 'Tuned membrane trap (~60 Hz)', category: 'Bass traps', absorption: [0.75, 0.45, 0.2, 0.12, 0.1, 0.1] },
    { id: 'tube-trap', name: 'Cylindrical tube trap (corner, ~280 mm)', category: 'Bass traps', absorption: [0.45, 0.7, 0.85, 0.9, 0.85, 0.8] },
    { id: 'ceiling-tile-mineral', name: 'Mineral-fiber ceiling tile (15 mm)', category: 'Ceiling', absorption: [0.34, 0.55, 0.68, 0.78, 0.8, 0.78] },
    { id: 'ceiling-tile-suspended', name: 'Suspended acoustic tile + plenum', category: 'Ceiling', absorption: [0.55, 0.68, 0.72, 0.78, 0.82, 0.8] },
    { id: 'gypsum-ceiling', name: 'Gypsum board ceiling', category: 'Ceiling', absorption: [0.15, 0.1, 0.06, 0.04, 0.04, 0.05] },
    { id: 'plaster-ceiling', name: 'Plaster ceiling', category: 'Ceiling', absorption: [0.02, 0.02, 0.03, 0.04, 0.05, 0.05] },
    { id: 'person-seated', name: 'Person, seated (per m² of audience)', category: 'People', absorption: [0.16, 0.4, 0.55, 0.65, 0.7, 0.7] },
    { id: 'person-standing', name: 'Adult, standing (per person, sabins)', category: 'People', absorption: [0.18, 0.4, 0.46, 0.46, 0.51, 0.46] },
];
//# sourceMappingURL=absorptionTable.js.map