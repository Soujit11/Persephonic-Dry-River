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
const DAWN = [[4.5, 10], [17, 20.5]];
const NIGHT = [[19, 24], [0, 5]];
/** The seed rows. Sources are cited per row; see brain/engineering/satie-authoring-redesign-2026-09-16.md for the evidence scan. */
export const CATALOG = [
    // ── Biophony ──
    { id: 'songbird_song', ucsCategory: 'BIRDS', label: 'small songbird song', aliases: ['songbird', 'song bird', 'songbirds', 'robin', 'blackbird', 'wren', 'blackcap', 'finch', 'chaffinch', 'warbler', 'thrush', 'sparrow', 'birdsong', 'bird song', 'bird singing', 'birds singing', 'dawn chorus', 'birds', 'bird calls', 'bird call', 'shorebirds', 'shorebird'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 84, range: [75, 92], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'high', source: 'Dutilleux 2024 (arXiv 2409.10957): wren 87, blackcap 88 dB at 1 m; junco 80 dB at 1 m' },
        temporal: { mode: 'oneshot', everyS: [6, 30], activeHours: DAWN }, couplings: { suppressedBy: { rain: 0.4, wind: 0.6 } }, hosts: ['class', 'fixture', 'ground'], sourcing: 'either', prompt: 'small songbird singing, close, dry' },
    { id: 'pigeon_coo', ucsCategory: 'BIRDS', label: 'pigeon cooing', aliases: ['pigeon', 'wood pigeon', 'dove', 'collared dove', 'cooing'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 84, range: [78, 88], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'high', source: 'Dutilleux 2024: wood pigeon 85, collared dove 82 dB at 1 m' },
        temporal: { mode: 'oneshot', everyS: [10, 40], activeHours: [[5, 20]] }, couplings: { suppressedBy: { rain: 0.5 } }, hosts: ['class', 'fixture', 'ground'], sourcing: 'either', prompt: 'wood pigeon cooing, close, dry' },
    { id: 'gull_calls', ucsCategory: 'BIRDS', label: 'gull calls', aliases: ['gull', 'gulls', 'seagull', 'seagulls', 'herring gull'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 92, range: [85, 100], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'low', source: 'estimate; no primary measurement found in the 2026-09-16 scan' },
        temporal: { mode: 'oneshot', everyS: [8, 35], activeHours: [[5, 21]] }, couplings: { suppressedBy: { rain: 0.6 } }, hosts: ['air', 'class', 'fixture', 'ground', 'strip'], sourcing: 'either', prompt: 'herring gull calling, close, dry' },
    { id: 'crow_call', ucsCategory: 'BIRDS', label: 'crow or raven call', aliases: ['crow', 'crows', 'raven', 'rook', 'jackdaw', 'cawing'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 88, range: [80, 95], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'low', source: 'estimate; corvid source levels not in the scan' },
        temporal: { mode: 'oneshot', everyS: [10, 45], activeHours: [[5, 20]] }, couplings: { suppressedBy: { rain: 0.5 } }, hosts: ['class', 'fixture', 'ground', 'air'], sourcing: 'either', prompt: 'crow cawing, close, dry' },
    { id: 'owl_hoot', ucsCategory: 'BIRDS', label: 'owl hooting', aliases: ['owl', 'hooting', 'tawny owl', 'hoot'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 82, range: [75, 90], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'oneshot', everyS: [20, 90], activeHours: NIGHT }, couplings: { suppressedBy: { rain: 0.5, wind: 0.7 } }, hosts: ['class', 'fixture'], sourcing: 'either', prompt: 'tawny owl hooting, close, dry' },
    { id: 'rooster_crow', ucsCategory: 'ANIMALS', label: 'rooster crowing', aliases: ['rooster', 'cockerel', 'chicken', 'hen', 'crowing'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 100, range: [95, 108], refDistanceM: 1, weighting: 'Z', metric: 'peak', confidence: 'medium', source: 'Frontiers Ecol Evol 2021 (10.3389/fevo.2021.657254): domestic chicken 108 dB peak at 1 m' },
        temporal: { mode: 'oneshot', everyS: [30, 180], activeHours: [[4.5, 9]] }, couplings: {}, hosts: ['fixture', 'ground', 'class'], sourcing: 'either', prompt: 'rooster crowing, close, dry' },
    { id: 'frog_chorus', ucsCategory: 'ANIMALS', label: 'frog chorus', aliases: ['frog', 'frogs', 'toad', 'toads', 'frog chorus', 'croaking'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 100, range: [92, 110], refDistanceM: 1, weighting: 'Z', metric: 'peak', confidence: 'medium', source: 'Frontiers Ecol Evol 2021: frogs 108 to 110 dB peak at 1 m' },
        temporal: { mode: 'oneshot', everyS: [2, 12], activeHours: NIGHT }, couplings: {}, hosts: ['liquid', 'patch', 'strip', 'ground'], sourcing: 'either', prompt: 'frogs croaking at a pond edge, close, dry' },
    { id: 'cicada', ucsCategory: 'ANIMALS', label: 'cicada calling song', aliases: ['cicada', 'cicadas'],
        triad: 'biophony', process: 'stridulation', kind: 'scatter',
        emission: { splDb: 100, range: [94, 103], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'high', source: 'Walker, UF Book of Insect Records ch. 24: Brevisana brevis 106.7 dB at 0.5 m, normalised to 1 m' },
        temporal: { mode: 'loop', activeHours: [[9, 20]] }, couplings: { suppressedBy: { rain: 0.3 } }, hosts: ['class', 'fixture', 'ground'], sourcing: 'either', prompt: 'cicada calling song, close, dry' },
    { id: 'cricket_chorus', ucsCategory: 'ANIMALS', label: 'cricket chorus', aliases: ['cricket', 'crickets', 'chirping', 'night insects', 'insect chorus', 'katydid', 'katydids'],
        triad: 'biophony', process: 'stridulation', kind: 'bed',
        emission: { splDb: 50, range: [40, 60], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate at the ear; chirp rate follows temperature (Dolbear; Walker 1962)' },
        temporal: { mode: 'loop', activeHours: [[18, 24], [0, 6]] }, couplings: { suppressedBy: { rain: 0.4 } }, hosts: ['listener', 'ground', 'patch', 'class'], sourcing: 'either', prompt: 'crickets chirping in grass, close, dry' },
    { id: 'dog_bark', ucsCategory: 'ANIMALS', label: 'dog barking', aliases: ['dog', 'dogs', 'barking', 'bark'],
        triad: 'biophony', process: 'vocalization', kind: 'scatter',
        emission: { splDb: 90, range: [80, 100], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'low', source: 'popular ranges 60 to 110 dB; no distance-referenced primary figure found' },
        temporal: { mode: 'oneshot', everyS: [20, 120] }, couplings: {}, hosts: ['fixture', 'ground', 'class', 'strip'], sourcing: 'either', prompt: 'medium dog barking, close, dry' },
    { id: 'bird_wings', ucsCategory: 'WINGS', label: 'bird wingbeats', aliases: ['wingbeat', 'wingbeats', 'wings flapping', 'flutter', 'fluttering', 'takes flight'],
        triad: 'biophony', process: 'wingbeat', kind: 'spot',
        emission: { splDb: 50, range: [40, 60], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'oneshot' }, couplings: {}, hosts: ['class', 'air', 'ground'], sourcing: 'either', prompt: 'small bird wingbeats taking off, close, dry' },
    // ── Geophony ──
    { id: 'surf_gentle', ucsCategory: 'WATER', label: 'gentle surf', aliases: ['gentle waves', 'small waves', 'lapping', 'waves washing', 'waves lapping', 'gentle surf', 'calm sea', 'wavelets', 'waves', 'sea', 'ocean', 'shoreline', 'shore', 'tide'],
        triad: 'geophony', process: 'splash', kind: 'bed',
        emission: { splDb: 60, range: [52, 66], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Bolin and Abom 2010 (JASA): surf noise 60 dBA at 0.4 m wave height; receiver distance unstated' },
        temporal: { mode: 'loop' }, couplings: { follows: 'wind' }, hosts: ['liquid', 'strip', 'patch', 'listener'], sourcing: 'library', prompt: 'gentle waves washing onto sand, close, dry' },
    { id: 'surf_heavy', ucsCategory: 'WATER', label: 'heavy surf', aliases: ['breaking waves', 'heavy surf', 'crashing waves', 'big waves', 'rough sea', 'forceful breaking', 'surf'],
        triad: 'geophony', process: 'splash', kind: 'bed',
        emission: { splDb: 76, range: [68, 82], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Bolin and Abom 2010: 78 dBA at 2.0 m wave height' },
        temporal: { mode: 'loop' }, couplings: { follows: 'wind' }, hosts: ['liquid', 'strip', 'patch', 'listener'], sourcing: 'library', prompt: 'ocean waves breaking on a beach, close, dry' },
    { id: 'rain_light', ucsCategory: 'RAIN', label: 'light rain', aliases: ['light rain', 'drizzle', 'soft rain', 'rain on leaves', 'rain on sand', 'rain on water', 'rain on seawater', 'rain on grass', 'gentle rain', 'rain', 'raining', 'rainfall', 'steady rain'],
        triad: 'geophony', process: 'drip', kind: 'bed',
        emission: { splDb: 46, range: [40, 52], refDistanceM: 1, weighting: 'Z', metric: 'leq', confidence: 'medium', source: 'acoustic rain gauge relation 17.3 log10(R) + 46 dB at 1 mm/h (Atmos. Res. 2023)' },
        temporal: { mode: 'loop' }, couplings: { follows: 'rain' }, hosts: ['overhead', 'listener', 'liquid', 'strip', 'patch', 'class', 'aperture'], sourcing: 'either', prompt: 'light steady rain on soft ground, close, dry' },
    { id: 'rain_heavy', ucsCategory: 'RAIN', label: 'heavy rain', aliases: ['heavy rain', 'downpour', 'pouring rain', 'rainstorm', 'torrential'],
        triad: 'geophony', process: 'drip', kind: 'bed',
        emission: { splDb: 63, range: [56, 70], refDistanceM: 1, weighting: 'Z', metric: 'leq', confidence: 'medium', source: 'same relation at 10 mm/h' },
        temporal: { mode: 'loop' }, couplings: { follows: 'rain' }, hosts: ['overhead', 'listener', 'liquid', 'strip', 'patch', 'class', 'aperture'], sourcing: 'either', prompt: 'heavy rain pouring on hard ground, close, dry' },
    { id: 'rain_on_glass', ucsCategory: 'RAIN', label: 'rain on a window', aliases: ['rain on glass', 'rain on the window', 'rain on a window', 'rain tapping', 'rain on the roof', 'rain on a roof'],
        triad: 'geophony', process: 'impact', kind: 'spot',
        emission: { splDb: 50, range: [40, 60], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'BRE IP2/06 roof impact figures are indoor and rate-dependent; band widened' },
        temporal: { mode: 'loop' }, couplings: { follows: 'rain' }, hosts: ['aperture', 'fixture', 'overhead'], sourcing: 'either', prompt: 'steady rain on a single-pane window, close, dry' },
    { id: 'wind_foliage', ucsCategory: 'WIND', label: 'wind in foliage', aliases: ['wind in the trees', 'wind in trees', 'leaves rustling', 'rustling leaves', 'leaf rustle', 'leaves rustle', 'rustling foliage', 'foliage rustling', 'wind through leaves', 'wind in foliage', 'canopy wind', 'wind in the canopy', 'canopy', 'treetops', 'branches rustling', 'branches swaying'],
        triad: 'geophony', process: 'wind', kind: 'bed',
        emission: { splDb: 55, range: [45, 65], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Bolin, Acta Acustica: vegetation noise 45 to 65 dBA at 5 m/s across vegetation types' },
        temporal: { mode: 'loop' }, couplings: { follows: 'wind' }, hosts: ['class', 'overhead', 'listener', 'patch'], sourcing: 'library', prompt: 'wind moving through tree leaves, close, dry' },
    { id: 'wind_grass', ucsCategory: 'WIND', label: 'wind in grass', aliases: ['wind in grass', 'grass rustling', 'wind over grass', 'wind in the reeds', 'reeds rustling', 'wind in dunes', 'dune grass'],
        triad: 'geophony', process: 'wind', kind: 'bed',
        emission: { splDb: 50, range: [42, 60], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Bolin: grass rustle peaks near 300 Hz; lower band of the vegetation spread' },
        temporal: { mode: 'loop' }, couplings: { follows: 'wind' }, hosts: ['patch', 'ground', 'listener', 'class'], sourcing: 'library', prompt: 'wind rustling dry grass, close, dry' },
    { id: 'wind_open', ucsCategory: 'WIND', label: 'open wind at the ear', aliases: ['wind', 'breeze', 'sea breeze', 'gusts', 'gusting', 'wind at the ear', 'open wind'],
        triad: 'geophony', process: 'wind', kind: 'bed',
        emission: { splDb: 45, range: [35, 60], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate at the ear; strongly speed-dependent' },
        temporal: { mode: 'loop' }, couplings: { follows: 'wind' }, hosts: ['listener'], sourcing: 'library', prompt: 'steady open-air wind, close, dry' },
    { id: 'thunder', ucsCategory: 'WEATHER', label: 'thunder', aliases: ['thunder', 'thunderclap', 'rumble of thunder', 'distant thunder'],
        triad: 'geophony', process: 'air', kind: 'spot',
        emission: { splDb: 118, range: [108, 125], refDistanceM: 1, weighting: 'Z', metric: 'peak', confidence: 'low', source: 'spectral studies only (Holmes 1971, Few 1969); popular level figures are vendor pages; contested' },
        temporal: { mode: 'oneshot', everyS: [30, 180] }, couplings: {}, hosts: ['horizon', 'overhead'], sourcing: 'library', prompt: 'rolling thunder, close, dry' },
    { id: 'stream_small', ucsCategory: 'WATER', label: 'small stream', aliases: ['stream', 'brook', 'creek', 'babbling brook', 'small river', 'trickling'],
        triad: 'geophony', process: 'pour', kind: 'bed',
        emission: { splDb: 45, range: [40, 52], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Noise Control Eng. J. (10.3397/1.3484183): natural streams 40 to 45 dBA' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['liquid', 'strip'], sourcing: 'library', prompt: 'small stream running over stones, close, dry' },
    { id: 'river', ucsCategory: 'WATER', label: 'river', aliases: ['river', 'rapids', 'flowing river', 'fast river', 'torrent'],
        triad: 'geophony', process: 'pour', kind: 'bed',
        emission: { splDb: 60, range: [50, 70], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate between stream and cascade figures' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['liquid', 'strip'], sourcing: 'library', prompt: 'wide river flowing steadily, close, dry' },
    { id: 'waterfall', ucsCategory: 'WATER', label: 'waterfall', aliases: ['waterfall', 'cascade', 'falls', 'weir'],
        triad: 'geophony', process: 'pour', kind: 'spot',
        emission: { splDb: 68, range: [55, 75], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Applied Acoustics 2024 (S0003682X24000987): waterfalls and high jets about 75 dBA close, 45 dBA at 20 m; cascades 40 to 60' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture', 'liquid', 'strip', 'patch'], sourcing: 'library', prompt: 'waterfall pouring onto rocks, close, dry' },
    { id: 'fountain', ucsCategory: 'WATER', label: 'fountain', aliases: ['fountain', 'water feature', 'fountain jets', 'splashing fountain'],
        triad: 'anthrophony', process: 'splash', kind: 'spot',
        emission: { splDb: 58, range: [45, 70], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'Noise Control Eng. J.: multi-jet fountains 40 to 65 dBA; Applied Acoustics 2024 water features 25 to 75 dBA' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture', 'patch'], sourcing: 'library', prompt: 'ornamental fountain splashing into its basin, close, dry' },
    { id: 'campfire', ucsCategory: 'FIRE', label: 'campfire crackle', aliases: ['campfire', 'fire crackling', 'crackling fire', 'bonfire', 'fireplace', 'hearth', 'logs burning', 'fire burning', 'burning fire', 'flames', 'wood fire', 'fire'],
        triad: 'anthrophony', process: 'combustion', kind: 'spot',
        emission: { splDb: 62, range: [55, 70], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'loop' }, couplings: { suppressedBy: { rain: 0.8 } }, hosts: ['fixture', 'ground'], sourcing: 'library', prompt: 'wood fire crackling, close, dry' },
    { id: 'room_tone', ucsCategory: 'AMBIENCE', label: 'quiet room tone', aliases: ['room tone', 'still air', 'quiet room', 'room air', 'silence of the room', 'the room itself', "the room's own air", 'empty room'],
        triad: 'anthrophony', process: 'air', kind: 'bed',
        emission: { splDb: 36, range: [30, 42], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'ASHRAE NC 30 to 40 office design; house prompt still air about 35 at the ear' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['listener'], sourcing: 'library', prompt: 'quiet room tone, still air, close, dry' },
    // ── Anthrophony ──
    { id: 'car_pass', ucsCategory: 'VEHICLES', label: 'passenger car passing', aliases: ['car', 'cars', 'passing car', 'traffic', 'light traffic', 'passenger car', 'car passing', 'road traffic', 'cars passing'],
        triad: 'anthrophony', process: 'rolling', kind: 'repertoire',
        emission: { splDb: 88, range: [82, 92], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'CNOSSOS-EU (2015/996) light-vehicle sound power at 70 km/h, converted to 1 m by 20 lg(d) + 11' },
        temporal: { mode: 'oneshot', everyS: [6, 40] }, couplings: {}, hosts: ['strip'], sourcing: 'either', prompt: 'passenger car rolling by at moderate speed, close, dry' },
    { id: 'heavy_truck', ucsCategory: 'VEHICLES', label: 'heavy truck passing', aliases: ['truck', 'lorry', 'heavy truck', 'trucks', 'lorries', 'diesel truck', 'delivery truck'],
        triad: 'anthrophony', process: 'engine', kind: 'repertoire',
        emission: { splDb: 97, range: [92, 102], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'CNOSSOS-EU heavy-vehicle coefficients; Engineering Toolbox diesel truck 100 dB at 10 m' },
        temporal: { mode: 'oneshot', everyS: [40, 240] }, couplings: {}, hosts: ['strip'], sourcing: 'either', prompt: 'diesel truck passing on a road, close, dry' },
    { id: 'bus_pass', ucsCategory: 'VEHICLES', label: 'city bus passing', aliases: ['bus', 'buses', 'city bus', 'coach'],
        triad: 'anthrophony', process: 'engine', kind: 'repertoire',
        emission: { splDb: 98, range: [92, 104], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'Engineering Toolbox buses 80 dB at 15 m, converted; secondary source' },
        temporal: { mode: 'oneshot', everyS: [60, 300] }, couplings: {}, hosts: ['strip'], sourcing: 'either', prompt: 'city bus pulling away, close, dry' },
    { id: 'motorcycle', ucsCategory: 'VEHICLES', label: 'motorcycle passing', aliases: ['motorcycle', 'motorbike', 'scooter', 'moped'],
        triad: 'anthrophony', process: 'engine', kind: 'repertoire',
        emission: { splDb: 98, range: [90, 106], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'Engineering Toolbox motorcycle 88 dB at 10 m, converted; secondary source' },
        temporal: { mode: 'oneshot', everyS: [60, 400] }, couplings: {}, hosts: ['strip'], sourcing: 'either', prompt: 'motorcycle accelerating past, close, dry' },
    { id: 'car_horn', ucsCategory: 'HORNS', label: 'car horn', aliases: ['car horn', 'horn honk', 'honking', 'honk', 'vehicle horn'],
        triad: 'anthrophony', process: 'resonance', kind: 'spot',
        emission: { splDb: 108, range: [100, 118], refDistanceM: 1, weighting: 'A', metric: 'rms', confidence: 'medium', source: 'UNECE R28 road-vehicle horns 93 to 112 dBA at 2 m, converted to 1 m' },
        temporal: { mode: 'oneshot', everyS: [40, 300] }, couplings: {}, hosts: ['strip', 'fixture'], sourcing: 'library', prompt: 'car horn short honk, close, dry' },
    { id: 'ship_horn', ucsCategory: 'HORNS', label: 'ship horn', aliases: ['ship horn', 'ship\'s horn', 'foghorn', 'fog horn', 'vessel horn', 'ferry horn', 'boat horn', 'ship sounds its horn', 'horn of a ship', 'ship', 'ships', 'vessel', 'ferry', 'tanker', 'freighter', 'cargo ship'],
        triad: 'anthrophony', process: 'resonance', kind: 'spot',
        emission: { splDb: 130, range: [115, 143], refDistanceM: 1, weighting: 'Z', metric: 'rms', confidence: 'high', source: 'COLREG Annex III / 33 CFR 86: 115 dB (under 20 m) to 143 dB (200 m and over) at 1 m' },
        temporal: { mode: 'oneshot', everyS: [90, 300] }, couplings: {}, hosts: ['horizon', 'fixture', 'liquid'], sourcing: 'library', prompt: 'large ship horn, single blast, close, dry' },
    { id: 'church_bell', ucsCategory: 'BELLS', label: 'church bell', aliases: ['church bell', 'church bells', 'bell tolling', 'bells tolling', 'tolling', 'bell tower', 'carillon'],
        triad: 'anthrophony', process: 'resonance', kind: 'spot',
        emission: { splDb: 115, range: [105, 125], refDistanceM: 1, weighting: 'Z', metric: 'peak', confidence: 'medium', source: 'Svantek church bell measurements 110 to 125 dB near the tower (ISO 10843); distance loosely stated' },
        temporal: { mode: 'oneshot', everyS: [300, 1800] }, couplings: {}, hosts: ['fixture', 'horizon'], sourcing: 'library', prompt: 'church bell single toll, bronze, close, dry' },
    { id: 'footsteps', ucsCategory: 'FOOTSTEPS', label: 'footsteps', aliases: ['footsteps', 'footstep', 'walking', 'steps on', 'someone walking', 'people walking'],
        triad: 'anthrophony', process: 'impact', kind: 'repertoire',
        emission: { splDb: 40, range: [34, 46], refDistanceM: 1, weighting: 'A', metric: 'rms', confidence: 'high', source: 'walking-speed study 35.8 to 44.7 dBA, median about 38 (ResearchGate 339535467); building studies at 1 m' },
        temporal: { mode: 'oneshot', everyS: [0.4, 0.9] }, couplings: {}, hosts: ['strip', 'ground', 'fixture', 'space'], sourcing: 'library', prompt: 'single footstep on {text}, close, dry' },
    { id: 'conversation', ucsCategory: 'VOICES', label: 'conversation', aliases: ['conversation', 'people talking', 'talking', 'chatter', 'voices', 'two people', 'murmured conversation', 'chatting'],
        triad: 'anthrophony', process: 'vocalization', kind: 'spot',
        emission: { splDb: 60, range: [55, 66], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'high', source: 'Pearsons et al. 1977 (EPA): usual speech 55 to 66 dBA at 1 m' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture', 'ground', 'space', 'strip'], sourcing: 'library', prompt: 'two people in quiet conversation, indistinct, close, dry' },
    { id: 'crowd_murmur', ucsCategory: 'CROWDS', label: 'crowd murmur', aliases: ['crowd', 'crowds', 'crowd murmur', 'busy market', 'market crowd', 'cafe chatter', 'café chatter', 'restaurant chatter', 'people in the distance'],
        triad: 'anthrophony', process: 'crowd', kind: 'bed',
        emission: { splDb: 65, range: [55, 75], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['patch', 'fixture', 'strip', 'space', 'listener'], sourcing: 'library', prompt: 'crowd murmur, many indistinct voices, close, dry' },
    { id: 'hvac_unit', ucsCategory: 'MACHINES', label: 'rooftop HVAC unit', aliases: ['hvac', 'air conditioner', 'air conditioning', 'ac unit', 'ventilation unit', 'rooftop unit', 'exhaust fan', 'ventilation hum'],
        triad: 'anthrophony', process: 'mechanical', kind: 'spot',
        emission: { splDb: 72, range: [62, 80], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'ASHRAE ch. 49 diffuser figures 45 to 55 dBA are indoor; rooftop unit figure is an estimate' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture', 'space'], sourcing: 'library', prompt: 'rooftop air handling unit humming, close, dry' },
    { id: 'train_pass', ucsCategory: 'TRAINS', label: 'train passing', aliases: ['train', 'trains', 'freight train', 'passing train', 'railway', 'tram'],
        triad: 'anthrophony', process: 'rolling', kind: 'repertoire',
        emission: { splDb: 99, range: [92, 105], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate from rail sound-power orders of magnitude' },
        temporal: { mode: 'oneshot', everyS: [300, 1200] }, couplings: {}, hosts: ['strip', 'horizon'], sourcing: 'library', prompt: 'train passing on rails, close, dry' },
    { id: 'aircraft_overhead', ucsCategory: 'AIR', label: 'aircraft overhead', aliases: ['aircraft', 'airplane', 'aeroplane', 'plane overhead', 'jet overhead', 'jet', 'helicopter'],
        triad: 'anthrophony', process: 'engine', kind: 'spot',
        emission: { splDb: 92, range: [80, 105], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate; varies by type and altitude' },
        temporal: { mode: 'oneshot', everyS: [120, 900] }, couplings: {}, hosts: ['horizon', 'overhead', 'air'], sourcing: 'library', prompt: 'airliner passing overhead at altitude, close, dry' },
    { id: 'construction', ucsCategory: 'TOOLS', label: 'construction work', aliases: ['construction', 'jackhammer', 'building site', 'construction site', 'drilling', 'power drill', 'hammering'],
        triad: 'anthrophony', process: 'impact', kind: 'spot',
        emission: { splDb: 100, range: [92, 110], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'medium', source: 'NIOSH: jackhammer about 100 to 110 dBA at the operator' },
        temporal: { mode: 'oneshot', everyS: [10, 60], activeHours: [[7, 18]] }, couplings: {}, hosts: ['fixture', 'patch', 'space'], sourcing: 'library', prompt: 'construction site hammering and drilling, close, dry' },
    { id: 'bicycle_bell', ucsCategory: 'BELLS', label: 'bicycle bell', aliases: ['bicycle bell', 'bike bell', 'cyclist', 'bicycle'],
        triad: 'anthrophony', process: 'resonance', kind: 'spot',
        emission: { splDb: 85, range: [78, 95], refDistanceM: 1, weighting: 'A', metric: 'rms', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'oneshot', everyS: [60, 400] }, couplings: {}, hosts: ['strip'], sourcing: 'library', prompt: 'bicycle bell ring, close, dry' },
    { id: 'door', ucsCategory: 'DOORS', label: 'door opening or closing', aliases: ['door', 'doors', 'door closing', 'door opens', 'door slam', 'door creak'],
        triad: 'anthrophony', process: 'impact', kind: 'spot',
        emission: { splDb: 70, range: [60, 82], refDistanceM: 1, weighting: 'A', metric: 'peak', confidence: 'low', source: 'estimate; DCASE 2024 Task 7 found door sounds the hardest category to generate' },
        temporal: { mode: 'oneshot', everyS: [60, 600] }, couplings: {}, hosts: ['aperture', 'fixture', 'space'], sourcing: 'library', prompt: 'wooden door closing, close, dry' },
    { id: 'dishes', ucsCategory: 'CERAMICS', label: 'dishes and cutlery', aliases: ['dishes', 'cutlery', 'plates', 'glasses clinking', 'clinking', 'crockery', 'cups and saucers'],
        triad: 'anthrophony', process: 'impact', kind: 'scatter',
        emission: { splDb: 65, range: [55, 75], refDistanceM: 1, weighting: 'A', metric: 'peak', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'oneshot', everyS: [5, 30] }, couplings: {}, hosts: ['fixture', 'space', 'ground'], sourcing: 'library', prompt: 'ceramic cup set on a saucer, close, dry' },
    { id: 'espresso_machine', ucsCategory: 'MACHINES', label: 'espresso machine', aliases: ['espresso machine', 'coffee machine', 'steam wand', 'milk frothing', 'coffee grinder'],
        triad: 'anthrophony', process: 'mechanical', kind: 'spot',
        emission: { splDb: 75, range: [65, 85], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'oneshot', everyS: [40, 240] }, couplings: {}, hosts: ['fixture', 'space'], sourcing: 'library', prompt: 'espresso machine steaming milk, close, dry' },
    { id: 'refrigerator_hum', ucsCategory: 'MACHINES', label: 'refrigerator hum', aliases: ['refrigerator', 'fridge', 'fridge hum', 'compressor hum', 'appliance hum'],
        triad: 'anthrophony', process: 'mechanical', kind: 'spot',
        emission: { splDb: 40, range: [35, 47], refDistanceM: 1, weighting: 'A', metric: 'leq', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture', 'space'], sourcing: 'library', prompt: 'refrigerator compressor humming, close, dry' },
    { id: 'clock_tick', ucsCategory: 'CLOCKS', label: 'clock ticking', aliases: ['clock', 'ticking', 'clock ticking', 'wall clock', 'grandfather clock'],
        triad: 'anthrophony', process: 'mechanical', kind: 'spot',
        emission: { splDb: 42, range: [35, 50], refDistanceM: 1, weighting: 'A', metric: 'peak', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture'], sourcing: 'library', prompt: 'wall clock ticking, close, dry' },
    { id: 'keyboard_typing', ucsCategory: 'COMPUTERS', label: 'keyboard typing', aliases: ['typing', 'keyboard', 'keystrokes', 'someone typing'],
        triad: 'anthrophony', process: 'impact', kind: 'spot',
        emission: { splDb: 50, range: [45, 60], refDistanceM: 1, weighting: 'A', metric: 'peak', confidence: 'low', source: 'estimate' },
        temporal: { mode: 'loop' }, couplings: {}, hosts: ['fixture', 'space'], sourcing: 'library', prompt: 'typing on a laptop keyboard, close, dry' },
];
const ROW_BY_ID = new Map(CATALOG.map(r => [r.id, r]));
/** Normalise free text for matching: lowercase, ASCII apostrophes, single spaces. */
function normalizeText(text) {
    return ` ${text.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}
const ALIAS_INDEX = CATALOG
    .flatMap(row => [row.label, ...row.aliases].map(alias => ({ alias: normalizeText(alias).trim(), row })))
    .sort((a, b) => b.alias.length - a.alias.length);
export function catalogRow(id) {
    return ROW_BY_ID.get(id);
}
/**
 * The catalog row a label or sound prompt names, or null. The longest alias
 * that appears as whole words wins, so "heavy rain on the window" binds to
 * rain on a window before it binds to heavy rain, and "carpet" never binds
 * to car. Exported for the planner, the acceptance ladder and tests.
 */
export function matchCatalog(...texts) {
    const haystack = normalizeText(texts.filter((t) => !!t).join(' . '));
    if (haystack.trim().length === 0)
        return null;
    for (const { alias, row } of ALIAS_INDEX) {
        if (haystack.includes(` ${alias} `))
            return row;
    }
    return null;
}
function applyRowTo(target, row, isEntity, defaultsOnly = false) {
    const changes = [];
    const [lo, hi] = row.emission.range;
    if (target.splDb === undefined) {
        target.splDb = row.emission.splDb;
        changes.push(`emission set to ${row.emission.splDb} dB`);
    }
    else if (!defaultsOnly && (target.splDb < lo || target.splDb > hi)) {
        const clamped = Math.min(hi, Math.max(lo, target.splDb));
        changes.push(`emission ${target.splDb} dB moved into the ${lo} to ${hi} dB band (${clamped})`);
        target.splDb = clamped;
    }
    if ((!isEntity || defaultsOnly) && target.mode === 'oneshot' && row.temporal.everyS && (!target.everyS || (!defaultsOnly && target.everyS[0] === 4 && target.everyS[1] === 12))) {
        target.everyS = [...row.temporal.everyS];
        changes.push(`interval ${row.temporal.everyS[0]} to ${row.temporal.everyS[1]} s`);
    }
    if (!target.activeHours && row.temporal.activeHours) {
        target.activeHours = row.temporal.activeHours.map(h => [...h]);
        changes.push('active hours from the catalog');
    }
    if (!target.suppressedBy && row.couplings.suppressedBy) {
        target.suppressedBy = { ...row.couplings.suppressedBy };
        changes.push('quiet in rain or wind from the catalog');
    }
    target.catalog = row.id;
    return { entryId: target.id ?? target.label ?? target.soundPrompt, rowId: row.id, changes };
}
/**
 * Bind every ecology entry and repertoire member that names a catalog class
 * to its row and apply the row's priors in place. Returns what was bound and
 * what changed, for notes and traces. Idempotent: a second pass changes
 * nothing. Entries that match no row are left exactly as written.
 */
export function applyCatalogPriors(spec, opts = {}) {
    const bindings = [];
    const unbound = [];
    const rowFor = (source) => source.catalog ? catalogRow(source.catalog)
        : opts.infer === false ? undefined : matchCatalog(source.label, source.soundPrompt);
    for (const entry of spec.ecology) {
        // A whole-place recording at the ear (a bed bound to a clip) is the place itself: its
        // level is stated by the sketch and it has no species hours. Matching its name to a
        // row ("forest ambience birds wind" → songbird) gave the bed 75 dB, daytime-only
        // hours and a quiet-in-wind rule, which silenced the ambience (2026-09-17).
        if (entry.clip && entry.extent === 'bed')
            continue;
        const members = entry.sounds ?? [];
        if (members.length) {
            let any = false;
            for (const m of members) {
                const row = rowFor(m) ?? (opts.infer === false ? undefined : rowFor(entry));
                if (row) {
                    bindings.push(applyRowTo(m, row, true, opts.defaultsOnly));
                    any = true;
                }
            }
            const entryRow = rowFor(entry);
            if (entryRow) {
                bindings.push(applyRowTo(entry, entryRow, true, opts.defaultsOnly));
                any = true;
            }
            if (!any)
                unbound.push(entry.id);
            continue;
        }
        const row = rowFor(entry);
        if (row)
            bindings.push(applyRowTo(entry, row, false, opts.defaultsOnly));
        else
            unbound.push(entry.id);
    }
    return { spec, bindings, unbound };
}
/** How much of a spec the catalog already governs (entries and members carrying a `catalog` binding). */
export function catalogCoverageOf(spec) {
    let bound = 0, total = 0;
    const unbound = [];
    for (const entry of spec.ecology) {
        const members = entry.sounds ?? [];
        const isBound = !!entry.catalog || members.some(m => !!m.catalog);
        total++;
        if (isBound)
            bound++;
        else
            unbound.push(entry.id);
    }
    return { bound, total, unbound };
}
/** One line for the author: how much of the scene the catalog governs. */
export function describeCatalogCoverage(cov, adjusted = 0) {
    if (!cov.total)
        return '';
    return `Catalog priors govern ${cov.bound} of ${cov.total} sources${adjusted ? ` (${adjusted} adjusted)` : ''}${cov.unbound.length ? `; not in the catalog: ${cov.unbound.slice(0, 4).join(', ')}` : ''}.`;
}
//# sourceMappingURL=catalog.js.map