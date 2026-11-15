/**
 * Place archetypes: what the engine knows about kinds of PLACE before a model
 * says anything. A brief that names one ("a forest with birds", "a beach at
 * dusk") gets a complete, playable sketch in milliseconds: the archetype owns
 * the geometry skeleton, the ambience slots that ARE the place, the life that
 * belongs there, and the dormant layers the weather sliders raise. Every
 * number comes from the catalog (`catalog.ts`); the brief adds the sources it
 * names and sets the hour and weather it states. A model refines the sketch
 * afterwards; it never gates it.
 */
import { CATALOG, catalogRow, applyCatalogPriors } from './catalog.js';
import { normalizeWorldSpec } from './worldSpec.js';
export const ARCHETYPES = [
    {
        id: 'forest', label: 'a forest', keywords: ['forest', 'woods', 'woodland', 'grove', 'jungle', 'rainforest', 'among the trees', 'pine forest', 'birch forest'],
        biome: 'temperate forest clearing', sizeM: 120, terrain: { reliefM: 6, roughness: 0.5 },
        ground: [{ material: 'leaf litter', weight: 0.6 }, { material: 'moss', weight: 0.4 }],
        objects: [
            { id: 'tree', label: 'trees', material: 'wood', shape: 'column', porous: 0.6, densityPer100m2: 5, heightM: [10, 24], radiusM: [2.5, 4.5], raised: 0.35, stemRadiusM: [0.2, 0.5] },
            { id: 'shrub', label: 'shrubs', material: 'foliage', shape: 'blob', porous: 0.8, densityPer100m2: 8, heightM: [0.8, 2], radiusM: [0.6, 1.4] },
        ],
        strips: [], patches: [], fixtures: [],
        ambience: [
            { catalog: 'wind_foliage', host: 'tree', attach: 'top' },
            { catalog: 'cricket_chorus', host: 'listener', extent: 'bed' },
        ],
        life: [],
        events: [
            { catalog: 'songbird_song', host: 'tree', attach: 'top', population: 8, defaultOn: true },
            { catalog: 'bird_wings', host: 'overhead', defaultOn: true },
            { catalog: 'crow_call', host: 'tree', attach: 'top', defaultOn: true },
            { catalog: 'pigeon_coo', host: 'tree', attach: 'top', population: 2 },
            { catalog: 'owl_hoot', host: 'tree', attach: 'top' },
            { catalog: 'dog_bark', host: 'ground' },
        ],
        dormant: [
            { catalog: 'rain_light', host: 'overhead', dormantOn: 'rain' },
        ],
        hour: 9, bedQuery: 'forest ambience',
    },
    {
        id: 'beach', label: 'a beach', keywords: ['beach', 'seashore', 'seaside', 'shoreline', 'coast', 'the shore', 'by the sea', 'sand dunes'],
        biome: 'sandy beach', sizeM: 160, terrain: { reliefM: 2, roughness: 0.2 },
        ground: [{ material: 'sand', weight: 1 }],
        objects: [{ id: 'dune_grass', label: 'dune grass', material: 'grass', shape: 'blob', porous: 0.9, densityPer100m2: 3, heightM: [0.4, 0.9], radiusM: [0.8, 1.6], mask: { awayFromWaterM: 25 } }],
        strips: [{ id: 'shoreline', label: 'the shoreline', widthM: 16, material: 'seawater', liquid: true, flow: 0.4, path: [[-80, 11], [80, 13]] }],
        patches: [{ id: 'shore_birds', label: 'birds on nearby sand', centre: [-7, -4], radiusM: 4, material: 'sand' }], fixtures: [],
        ambience: [
            { catalog: 'surf_gentle', host: 'shoreline', extent: 'line' },
            { catalog: 'wind_open', host: 'listener', extent: 'bed' },
        ],
        life: [],
        events: [
            { catalog: 'gull_calls', host: 'shore_birds', population: 4, defaultOn: true },
            { catalog: 'ship_horn', host: 'horizon' },
            { catalog: 'bird_wings', host: 'overhead' },
            { catalog: 'dog_bark', host: 'ground' },
            { catalog: 'thunder', host: 'horizon' },
        ],
        dormant: [
            { catalog: 'rain_light', host: 'overhead', dormantOn: 'rain' },
            { catalog: 'surf_heavy', host: 'shoreline', extent: 'line', dormantOn: 'wind' },
        ],
        hour: 11, bedQuery: 'beach waves ambience',
    },
    {
        id: 'street', label: 'a city street', keywords: ['street', 'avenue', 'downtown', 'city', 'boulevard', 'intersection', 'sidewalk', 'urban'],
        biome: 'city street', sizeM: 140, terrain: { reliefM: 0, roughness: 0 },
        ground: [{ material: 'concrete', weight: 1 }],
        objects: [{ id: 'building', label: 'buildings', material: 'brick', shape: 'box', porous: 0, densityPer100m2: 2, heightM: [8, 20], radiusM: [5, 9], mask: { awayFromRoadM: 10 } }],
        strips: [{ id: 'road', label: 'the road', widthM: 10, material: 'asphalt', path: [[-70, 12], [70, 12]] }],
        patches: [], fixtures: [{ id: 'hvac', label: 'a rooftop unit', sizeM: [1.5, 1, 1.5], material: 'steel', relativeTo: { ref: 'listener', distanceM: 24, bearingDeg: 140 }, elevationM: 9 }],
        ambience: [
            { catalog: 'car_pass', host: 'road', extent: 'line' },
            { catalog: 'crowd_murmur', host: 'listener', extent: 'bed' },
            { catalog: 'hvac_unit', host: 'hvac' },
        ],
        life: [{ catalog: 'car_pass', host: 'road' }],
        events: [{ catalog: 'car_horn', host: 'road', defaultOn: true }, { catalog: 'pigeon_coo', host: 'building', attach: 'top', population: 3, defaultOn: true }, { catalog: 'bicycle_bell', host: 'road', defaultOn: true }, { catalog: 'bus_pass', host: 'road' }, { catalog: 'motorcycle', host: 'road' }, { catalog: 'dog_bark', host: 'ground' }, { catalog: 'construction', host: 'building' }],
        dormant: [{ catalog: 'rain_heavy', host: 'overhead', dormantOn: 'rain' }],
        hour: 14, bedQuery: 'city street traffic ambience',
    },
    {
        id: 'harbour', label: 'a harbour', keywords: ['harbour', 'harbor', 'port', 'marina', 'docks', 'quay', 'pier', 'wharf'],
        biome: 'working harbour', sizeM: 200, terrain: { reliefM: 1, roughness: 0.1 },
        ground: [{ material: 'concrete', weight: 1 }],
        objects: [], strips: [{ id: 'water', label: 'the harbour water', widthM: 60, material: 'seawater', liquid: true, flow: 0.2, path: [[-100, 16], [100, 18]] }],
        patches: [], fixtures: [{ id: 'crane', label: 'a dockside crane', sizeM: [4, 18, 4], material: 'steel', relativeTo: { ref: 'listener', distanceM: 40, bearingDeg: 60 } }],
        ambience: [
            { catalog: 'surf_gentle', host: 'water', extent: 'line' },
            { catalog: 'wind_open', host: 'listener', extent: 'bed' },
        ],
        life: [],
        events: [{ catalog: 'gull_calls', host: 'ground', population: 5, defaultOn: true }, { catalog: 'ship_horn', host: 'horizon', defaultOn: true }, { catalog: 'bird_wings', host: 'overhead' }, { catalog: 'heavy_truck', host: 'ground' }, { catalog: 'car_horn', host: 'ground' }, { catalog: 'thunder', host: 'horizon' }],
        dormant: [{ catalog: 'rain_light', host: 'overhead', dormantOn: 'rain' }],
        hour: 10, bedQuery: 'harbour ambience',
    },
    {
        id: 'park', label: 'a park', keywords: ['park', 'meadow', 'garden', 'field', 'lawn', 'orchard', 'countryside', 'pasture'],
        biome: 'open park with scattered trees', sizeM: 140, terrain: { reliefM: 3, roughness: 0.3 },
        ground: [{ material: 'grass', weight: 1 }],
        objects: [{ id: 'tree', label: 'trees', material: 'wood', shape: 'column', porous: 0.6, densityPer100m2: 1.5, heightM: [8, 16], radiusM: [3, 5], raised: 0.35, stemRadiusM: [0.2, 0.4] }],
        strips: [], patches: [], fixtures: [],
        ambience: [
            { catalog: 'wind_grass', host: 'listener', extent: 'bed' },
            { catalog: 'wind_foliage', host: 'tree', attach: 'top' },
        ],
        life: [],
        events: [{ catalog: 'songbird_song', host: 'tree', attach: 'top', population: 5, defaultOn: true }, { catalog: 'bird_wings', host: 'overhead', defaultOn: true }, { catalog: 'crow_call', host: 'tree', attach: 'top' }, { catalog: 'dog_bark', host: 'ground' }, { catalog: 'bicycle_bell', host: 'ground' }],
        dormant: [{ catalog: 'rain_light', host: 'overhead', dormantOn: 'rain' }],
        hour: 10, bedQuery: 'park ambience birds',
    },
    {
        id: 'rural_road', label: 'a country road', keywords: ['country road', 'rural road', 'highway', 'motorway', 'lane', 'roadside'],
        biome: 'country road through fields', sizeM: 200, terrain: { reliefM: 4, roughness: 0.3 },
        ground: [{ material: 'grass', weight: 1 }],
        objects: [{ id: 'hedge', label: 'hedgerows', material: 'foliage', shape: 'blob', porous: 0.8, densityPer100m2: 2, heightM: [1.5, 2.5], radiusM: [2, 4] }],
        strips: [{ id: 'road', label: 'the road', widthM: 7, material: 'asphalt', path: [[-100, 10], [100, 10]] }],
        patches: [], fixtures: [],
        ambience: [{ catalog: 'wind_grass', host: 'listener', extent: 'bed' }],
        life: [{ catalog: 'car_pass', host: 'road' }],
        events: [{ catalog: 'songbird_song', host: 'hedge', attach: 'top', population: 4, defaultOn: true }, { catalog: 'heavy_truck', host: 'road', defaultOn: true }, { catalog: 'crow_call', host: 'hedge', attach: 'top' }, { catalog: 'dog_bark', host: 'ground' }, { catalog: 'rooster_crow', host: 'ground' }],
        dormant: [{ catalog: 'rain_light', host: 'overhead', dormantOn: 'rain' }],
        hour: 15, bedQuery: 'countryside ambience',
    },
    {
        id: 'cafe', label: 'a cafe', keywords: ['cafe', 'café', 'coffee shop', 'coffeehouse', 'bistro', 'tea room', 'restaurant'],
        biome: 'a small cafe interior', sizeM: 60, terrain: { reliefM: 0, roughness: 0 },
        ground: [{ material: 'concrete', weight: 1 }],
        objects: [], strips: [{ id: 'street', label: 'the street outside', widthM: 8, material: 'asphalt', path: [[-40, 9], [40, 9]] }],
        patches: [],
        fixtures: [{ id: 'counter', label: 'the counter', sizeM: [3, 1.1, 0.8], material: 'wood', relativeTo: { ref: 'listener', distanceM: 4.5, bearingDeg: 30 } }],
        interior: { sizeM: [8, 3.2, 10], floor: 'wood', walls: 'plaster', ceiling: 'plaster', elevationM: 0,
            apertures: [{ id: 'window', label: 'the front window', wall: 0, sizeM: [3, 2], sillM: 0.8, material: 'glass', open: 0.1, to: 'outside' }, { id: 'door', label: 'the door', wall: 40, sizeM: [1, 2.1], sillM: 0, material: 'wood', open: 0.05, to: 'outside' }] },
        ambience: [
            { catalog: 'room_tone', host: 'listener', extent: 'bed' },
            { catalog: 'crowd_murmur', host: 'listener', extent: 'bed' },
            { catalog: 'car_pass', host: 'street', extent: 'line' },
        ],
        life: [{ catalog: 'espresso_machine', host: 'counter' }, { catalog: 'dishes', host: 'counter' }, { catalog: 'door', host: 'door' }],
        events: [{ catalog: 'car_horn', host: 'street', defaultOn: true }, { catalog: 'keyboard_typing', host: 'counter' }],
        dormant: [{ catalog: 'rain_on_glass', host: 'window', dormantOn: 'rain' }],
        hour: 10, bedQuery: 'cafe ambience',
    },
    {
        id: 'apartment', label: 'an apartment', keywords: ['apartment', 'flat', 'bedroom', 'living room', 'my room', 'kitchen', 'studio apartment', 'at home', 'indoors'],
        biome: 'a quiet apartment room', sizeM: 60, terrain: { reliefM: 0, roughness: 0 },
        ground: [{ material: 'concrete', weight: 1 }],
        objects: [], strips: [{ id: 'street', label: 'the street below', widthM: 8, material: 'asphalt', path: [[-40, 12], [40, 12]] }],
        patches: [],
        fixtures: [{ id: 'fridge', label: 'the refrigerator', sizeM: [0.7, 1.8, 0.7], material: 'steel', relativeTo: { ref: 'listener', distanceM: 4, bearingDeg: -120 } }, { id: 'clock', label: 'a wall clock', sizeM: [0.3, 0.3, 0.05], material: 'wood', relativeTo: { ref: 'listener', distanceM: 3, bearingDeg: 90 }, elevationM: 1.8 }],
        interior: { sizeM: [5, 2.7, 6], floor: 'wood', walls: 'plaster', ceiling: 'plaster', elevationM: 7,
            apertures: [{ id: 'window', label: 'the window', wall: 0, sizeM: [1.4, 1.3], sillM: 0.9, material: 'glass', open: 0.15, to: 'outside' }],
            spaces: [{ id: 'hallway', label: 'the shared hallway', direction: 180, depthM: 3, material: 'plaster' }] },
        ambience: [
            { catalog: 'room_tone', host: 'listener', extent: 'bed' },
            { catalog: 'refrigerator_hum', host: 'fridge' },
            { catalog: 'car_pass', host: 'street', extent: 'line' },
        ],
        life: [{ catalog: 'clock_tick', host: 'clock' }],
        events: [{ catalog: 'door', host: 'hallway', defaultOn: true }, { catalog: 'dog_bark', host: 'street' }, { catalog: 'car_horn', host: 'street' }, { catalog: 'keyboard_typing', host: 'listener' }],
        dormant: [{ catalog: 'rain_on_glass', host: 'window', dormantOn: 'rain' }],
        hour: 21, bedQuery: 'apartment room tone',
    },
];
function normalizeText(text) {
    return ` ${text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}
/** The archetype a brief names, longest keyword first, or null. */
export function matchArchetype(brief) {
    const hay = normalizeText(brief);
    let best = null;
    for (const a of ARCHETYPES) {
        for (const k of a.keywords) {
            if (hay.includes(` ${k} `) && (!best || k.length > best.len))
                best = { a, len: k.length };
        }
    }
    return best?.a ?? null;
}
/** Hour and weather a brief states, when it states them. */
export function readBriefState(brief) {
    const hay = normalizeText(brief);
    const has = (...words) => words.some(w => hay.includes(` ${w} `));
    const out = {};
    if (has('dawn', 'sunrise', 'first light', 'daybreak'))
        out.hour = 5.5;
    else if (has('morning'))
        out.hour = 8.5;
    else if (has('noon', 'midday'))
        out.hour = 12;
    else if (has('afternoon'))
        out.hour = 15;
    else if (has('evening'))
        out.hour = 19;
    else if (has('dusk', 'sunset', 'twilight'))
        out.hour = 20;
    else if (has('midnight'))
        out.hour = 0;
    else if (has('night', 'nighttime', 'at night', 'late'))
        out.hour = 23;
    if (has('downpour', 'storm', 'stormy', 'thunderstorm', 'pouring'))
        out.rain = 0.85;
    else if (has('rain', 'raining', 'rainy', 'drizzle', 'showers', 'wet'))
        out.rain = 0.5;
    if (has('gale', 'howling', 'blustery', 'stormy'))
        out.wind = 0.85;
    else if (has('windy', 'gusty', 'breezy', 'strong wind', 'wind'))
        out.wind = 0.6;
    if (has('fog', 'foggy', 'mist', 'misty'))
        out.fog = 0.6;
    return out;
}
/** Catalog rows the brief names outright, beyond the archetype. */
export function briefSources(brief) {
    const hay = normalizeText(brief);
    const rows = [];
    for (const row of CATALOG) {
        if ([row.label, ...row.aliases].some(a => hay.includes(` ${normalizeText(a).trim()} `)))
            rows.push(row);
    }
    return rows;
}
function hostFor(row, a) {
    const ids = {
        class: a.objects.map(o => String(o.id)), strip: a.strips.map(s => String(s.id)), liquid: a.strips.filter(s => s.liquid).map(s => String(s.id)),
        patch: a.patches.map(p => String(p.id)), fixture: a.fixtures.map(f => String(f.id)),
        aperture: (a.interior?.apertures ?? []).map(x => x.id), space: (a.interior?.spaces ?? []).map(x => x.id),
    };
    // A bed-kind row that may sit at the ear (rain, room tone) IS the air there: an
    // overhead point source at its receiver level arrived 20 dB down and rain was never heard.
    if (row.kind === 'bed' && row.hosts.includes('listener') && row.hosts[0] !== 'class')
        return { host: 'listener', extent: 'bed' };
    for (const kind of row.hosts) {
        if (kind === 'listener')
            return { host: 'listener', extent: 'bed' };
        // `air` compiles to a voice darting about the origin, which the lint reads as a heap on the listener; overhead is a real place.
        if (kind === 'air')
            return { host: 'overhead' };
        if (kind === 'overhead' || kind === 'ground' || kind === 'horizon')
            return { host: kind };
        const pool = ids[kind];
        if (pool?.length)
            return { host: pool[0], ...(kind === 'class' ? { attach: 'top' } : {}), ...(kind === 'strip' || kind === 'liquid' ? { extent: 'line' } : {}) };
    }
    return { host: 'ground' };
}
/** Hosts every world has without declaring them. */
const BUILT_IN_HOSTS = new Set(['listener', 'overhead', 'ground', 'horizon', 'air']);
/**
 * The archetype's dormant weather material as ecology entries, for a planned
 * world: a loop that follows `rain` or `wind`, silent until the knob moves.
 * Only entries whose host the world actually has (2026-10-01: a planned cafe
 * carried no voice that followed rain, so the rain slider moved in silence).
 */
export function dormantWeatherEntries(a, hostIds) {
    const out = [];
    a.dormant.forEach((src, i) => {
        const row = catalogRow(src.catalog);
        if (!row)
            return;
        const entry = entryFor(src, row, i);
        if (!entry)
            return;
        const host = String(entry.host);
        if (BUILT_IN_HOSTS.has(host) || hostIds.has(host))
            out.push(entry);
    });
    return out;
}
function entryFor(src, row, index) {
    const id = `${row.id}${index ? `_${index}` : ''}`;
    const base = {
        id, label: row.label, soundPrompt: row.prompt, host: src.host, catalog: row.id,
        ...(src.attach ? { attach: src.attach } : {}), ...(src.extent ? { extent: src.extent } : {}),
        splDb: row.emission.splDb,
        ...(row.temporal.activeHours ? { activeHours: row.temporal.activeHours } : {}),
        ...(row.couplings.suppressedBy ? { suppressedBy: row.couplings.suppressedBy } : {}),
    };
    if (src.dormantOn) {
        return { ...base, mode: 'loop', follows: { signal: src.dormantOn, in: [src.dormantOn === 'rain' ? 0 : 0.2, 1], out: [0, 1], curve: 1.5 } };
    }
    // Bird calls belong to moving individuals even when a card names just one
    // crow or owl. A plain oneshot on a tree never gets an agent or a flight.
    const bird = row.ucsCategory === 'BIRDS' && row.process === 'vocalization';
    const population = src.population ?? (bird ? 1 : 0);
    if (population && row.kind === 'scatter') {
        return {
            ...base, mode: 'oneshot', population, voices: Math.min(3, population), windowM: 60,
            // Authored pacing: short flights between genuine perches, with each
            // individual's independent dwell draw keeping the flock staggered.
            // Owls remain less mobile than daytime birds.
            dwellS: bird ? (row.id === 'owl_hoot' ? [35, 90] : [8, 25]) : [40, 180],
            relocateM: bird ? [4, 18] : [8, 30], travel: bird ? 'fly' : 'walk', speedMs: bird ? [3, 7] : [5, 9],
            startleM: 6, hushS: [10, 30], callers: 2, gapS: [1, 4],
            sounds: [
                { id: 'call', soundPrompt: row.prompt, mode: 'oneshot', everyS: row.temporal.everyS ?? [8, 30], variants: 3, splDb: row.emission.splDb },
                { id: 'wings', soundPrompt: 'small bird wingbeats taking off, close, dry', mode: 'on', on: 'relocate', splDb: 50 },
            ],
        };
    }
    if (row.kind === 'repertoire' && row.process === 'rolling' && src.host !== 'listener') {
        return {
            ...base, mode: 'oneshot', everyS: row.temporal.everyS ?? [8, 40], speedMs: [8, 16], stop: { chance: 0.15, s: [4, 12] },
            sounds: [
                { id: 'roll', soundPrompt: 'car tyres rolling on asphalt, steady, close, dry', mode: 'loop', splFollows: { signal: 'velocity', in: [0, 18], out: [40, 88], curve: 0.5 } },
                { id: 'engine', soundPrompt: 'small petrol engine at cruise, steady, close, dry', mode: 'loop', splFollows: { signal: 'velocity', in: [0, 18], out: [55, 78] }, pitchFollows: { signal: 'velocity', in: [0, 18], out: [0.9, 1.1] } },
                { id: 'horn', soundPrompt: 'car horn short honk, close, dry', mode: 'oneshot', chance: 0.08, variants: 3, emits: 'horn', splDb: 108 },
            ],
        };
    }
    if (row.temporal.mode === 'loop' || src.extent === 'bed' || src.extent === 'line')
        return { ...base, mode: 'loop', ...(row.couplings.follows ? { follows: { signal: row.couplings.follows, in: [0, 1], out: [0.4, 1] } } : {}) };
    return { ...base, mode: 'oneshot', everyS: row.temporal.everyS ?? [8, 30], variants: 3 };
}
function whereOf(src, a) {
    if (src.host === 'listener')
        return 'the air around you';
    if (src.host === 'overhead')
        return 'overhead';
    if (src.host === 'air')
        return 'passing through the air';
    if (src.host === 'ground')
        return 'on the ground nearby';
    if (src.host === 'horizon')
        return 'far beyond the place';
    const named = [...a.objects, ...a.strips, ...a.patches, ...a.fixtures].find(x => x.id === src.host);
    return named?.label ? `${src.attach === 'top' ? 'in the tops of ' : 'at '}${named.label}` : src.host;
}
function candidateFor(src, a, slot, id) {
    const row = catalogRow(src.catalog);
    if (!row)
        return null;
    const pop = src.population ? `${src.population} of them, ` : '';
    return {
        id, label: row.label, soundPrompt: row.prompt, where: whereOf(src, a), slot, loop: row.temporal.mode === 'loop',
        detail: `${pop}${row.emission.splDb} dB at 1 m${row.temporal.everyS ? `, every ${row.temporal.everyS[0]} to ${row.temporal.everyS[1]} s` : ''}`,
        splDb: row.emission.splDb, sketch: src,
    };
}
/** A card for a catalog row on the archetype's best host, for a suggestion the model named by id. Exported for the suggest path. */
export function catalogCandidate(rowId, a, id, stage) {
    const row = catalogRow(rowId);
    if (!row)
        return null;
    const h = hostFor(row, a);
    const src = { catalog: row.id, host: h.host, ...(h.attach ? { attach: h.attach } : {}), ...(h.extent ? { extent: h.extent } : {}), ...(row.kind === 'scatter' && row.triad === 'biophony' && stage === 'events' ? { population: 5 } : {}), defaultOn: stage === 'events' };
    return candidateFor(src, a, row.id, id);
}
/** A card for a source the catalog does not know: a plain voice with a stated emission on a sensible host. Exported for the suggest path. */
export function freeCandidate(a, id, label, soundPrompt, where, loop, splDb = 62) {
    const host = loop ? 'listener' : a.objects[0]?.id ?? 'ground';
    return { id, label, soundPrompt, where: where || whereOf({ catalog: '', host }, a), slot: id, loop, detail: `${splDb} dB at 1 m`, splDb,
        sketch: { catalog: '', host, ...(loop ? { extent: 'bed' } : {}) } };
}
/**
 * The cards a brief's sketch offers: base slots (the library beds as one
 * slot with alternatives, then each ambience and life source, then what the
 * brief names) and event cards (the archetype's events plus what the brief
 * names that happens). Deterministic; the model is not involved.
 */
export function sketchCandidates(brief, a, beds = [], intent) {
    const base = [];
    const events = [];
    beds.slice(0, 5).forEach((b, i) => base.push({
        id: `bed_${i}`, label: b.label, soundPrompt: `${a.label.replace(/^an? /, '')} ambience, close, dry`, where: 'the whole place, at the ear', slot: 'bed', loop: true,
        detail: b.origin === 'generated' ? 'a generated ambience' : b.origin ? 'a recording of the place itself' : 'an ambience from the library',
        splDb: 42, library: b.name, libraryOrigin: b.origin, sketch: { catalog: 'room_tone', host: 'listener', extent: 'bed', bedClip: b.clip },
    }));
    const seen = new Set();
    const add = (src, list, slot) => {
        if (intent?.exclude.includes(src.catalog))
            return;
        if (intent && list === events)
            src = { ...src, defaultOn: intent.events.includes(src.catalog) };
        const key = `${src.catalog}@${src.host}`;
        if (seen.has(key))
            return;
        seen.add(key);
        const c = candidateFor(src, a, slot ?? src.catalog, `${list === base ? 'b' : 'e'}_${src.catalog}_${list.length}`);
        if (c)
            list.push(c);
    };
    for (const src of a.ambience)
        add(src, base);
    for (const src of a.life)
        add(src, base);
    for (const src of a.events)
        add(src, events);
    for (const row of intent ? intent.include.map(catalogRow).filter((r) => !!r) : briefSources(brief)) {
        if ([...seen].some(k => k.startsWith(`${row.id}@`))) {
            // Named in the brief: it is on by default wherever it sits.
            for (const c of events)
                if (c.sketch.catalog === row.id)
                    c.sketch = { ...c.sketch, defaultOn: intent ? intent.events.includes(row.id) : true };
            continue;
        }
        const h = hostFor(row, a);
        const src = { catalog: row.id, host: h.host, ...(h.attach ? { attach: h.attach } : {}), ...(h.extent ? { extent: h.extent } : {}), ...(row.kind === 'scatter' && row.triad === 'biophony' ? { population: 6 } : {}), defaultOn: true };
        add(src, !src.population && (row.temporal.mode === 'loop' || row.kind === 'bed') ? base : events);
    }
    return { base, events };
}
/**
 * The spec for a set of picks over the sketch's cards, plus the archetype's
 * dormant layers. `phase` base leaves the events out. Cards the source
 * cascade resolved to a recording play that recording (`sources`).
 */
export function sketchSpecFromPicks(brief, a, cards, picks, phase, seed, sources = {}, intent) {
    const state = intent?.state ?? readBriefState(brief);
    const hour = state.hour ?? a.hour;
    const ecology = [];
    const names = [];
    const seen = new Map();
    const nextIndex = (rowId) => { const n = seen.get(rowId) ?? 0; seen.set(rowId, n + 1); return n; };
    const pushCard = (c) => {
        const src = c.sketch;
        if (src.bedClip) {
            // The bed sits UNDER the positional sources (42 dB at the ear): moving through the place must change what you hear.
            const selected = sources[c.id];
            const clip = selected?.kind === 'gen' ? undefined : selected?.clip ?? src.bedClip;
            ecology.push({ id: 'place_bed', label: c.label, soundPrompt: c.soundPrompt, ...(clip ? { clip } : {}), host: 'listener', extent: 'bed', mode: 'loop', splDb: 42 });
            names.push(c.label);
            return;
        }
        const row = catalogRow(src.catalog);
        if (!row) {
            // A source the catalog does not know: the card's own words and emission.
            const plain = { id: c.id.replace(/[^a-z0-9_]+/gi, '_').toLowerCase(), label: c.label, soundPrompt: c.soundPrompt, host: src.host, mode: c.loop ? 'loop' : 'oneshot', splDb: c.splDb ?? 62,
                ...(src.extent ? { extent: src.extent } : {}), ...(src.attach ? { attach: src.attach } : {}), ...(c.loop ? {} : { everyS: [10, 40], variants: 3 }) };
            const bound = sources[c.id];
            if (bound?.clip)
                plain.clip = bound.clip;
            ecology.push(plain);
            names.push(c.label);
            return;
        }
        const e = entryFor(src, row, nextIndex(row.id));
        if (!e)
            return;
        const bound = sources[c.id];
        if (bound?.clip) {
            if (Array.isArray(e.sounds)) {
                // The selected take is the primary call, not the incidental wingbeats.
                // A population must not silently replace an audition with generated calls.
                e.sounds = e.sounds.map((sound, i) => i === 0 ? { ...sound, clip: bound.clip, variants: 1 } : sound);
            }
            else
                e.clip = bound.clip;
        }
        ecology.push(e);
        names.push(row.label);
    };
    for (const c of cards.base)
        if (picks.base.includes(c.id))
            pushCard(c);
    if (phase === 'full')
        for (const c of cards.events)
            if (picks.events.includes(c.id))
                pushCard(c);
    for (const src of a.dormant) {
        if (intent?.exclude.includes(src.catalog))
            continue;
        const row = catalogRow(src.catalog);
        if (!row)
            continue;
        const awake = (src.dormantOn === 'rain' && (state.rain ?? 0) > 0) || (src.dormantOn === 'wind' && (state.wind ?? 0) >= 0.5);
        // A bed-kind weather layer (rain) is the air at the ear, not a point overhead.
        const placed = row.kind === 'bed' && !src.extent ? { ...src, ...hostFor(row, a) } : src;
        const e = entryFor(awake ? { ...placed, dormantOn: undefined } : placed, row, nextIndex(row.id));
        if (e)
            ecology.push(e);
    }
    const raw = {
        biome: a.biome, seed, sizeM: a.sizeM, terrain: a.terrain, ground: a.ground,
        objects: a.objects, strips: a.strips, patches: a.patches, fixtures: a.fixtures, ...(a.interior ? { interior: a.interior } : {}),
        weather: { rain: state.rain ?? 0, wind: state.wind ?? 0.2, fog: state.fog ?? 0 },
        time: { hour, season: 'summer', temperatureC: hour < 6 || hour > 20 ? 14 : 20, clockRate: 0 },
        controls: [], ecology,
    };
    return { spec: applyCatalogPriors(normalizeWorldSpec(raw)).spec, sources: names };
}
/**
 * The archetype's sketch of the brief with the default picks: every base
 * card's first flavour, the pre-picked events. Exported for tests and the
 * MCP; the wizard path uses `sketchCandidates` + `sketchSpecFromPicks`.
 */
export function sketchSpec(brief, a, opts = {}) {
    const cards = sketchCandidates(brief, a, opts.bed ? [{ name: opts.bed.label, label: opts.bed.label, clip: opts.bed.clip }] : []);
    const picks = defaultPicks(cards);
    return sketchSpecFromPicks(brief, a, cards, picks, 'full', opts.seed ?? 1);
}
/** The first flavour of every base slot and the pre-picked events. */
export function defaultPicks(cards) {
    const slots = new Set();
    const base = [];
    for (const c of cards.base)
        if (!slots.has(c.slot)) {
            slots.add(c.slot);
            base.push(c.id);
        }
    return { base, events: cards.events.filter(c => c.sketch.defaultOn).map(c => c.id) };
}
//# sourceMappingURL=archetypes.js.map