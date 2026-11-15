const hasControl = (value) => Array.from(value).some(character => character.charCodeAt(0) < 32);
export const MAX_BANK_TAKES = 8;
export const MAX_RECORDING_SURFACES = 32;
/** Bounded data-only grammar; the caller owns clip-path normalization. Empty banks mean silence. */
export function parseRecordingBanks(value, path) {
    if (value.length > 80_000)
        throw new Error('recordings is too large');
    const data = JSON.parse(value);
    const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!object(data) || Object.keys(data).some(k => k !== 'takes' && k !== 'surfaces'))
        throw new Error('recordings requires takes and/or surfaces');
    const bank = (v) => {
        if (!Array.isArray(v) || v.length > MAX_BANK_TAKES)
            throw new Error('Each recording bank accepts 0–8 clip references');
        const refs = v.map((clip) => {
            if (typeof clip !== 'string' || !clip.trim() || clip.length > 256 || /[\s\\]/.test(clip) || hasControl(clip)
                || clip.includes('://') || clip.split('/').some(part => part === '..' || part === '.'))
                throw new Error('Invalid recording reference');
            const key = path(clip);
            if (!key || key === 'Audio/')
                throw new Error('Empty recording reference');
            return key;
        });
        if (new Set(refs).size !== refs.length)
            throw new Error('A recording bank cannot repeat a clip reference');
        return Object.freeze(refs);
    };
    const result = {};
    if (Object.hasOwn(data, 'takes'))
        result.takes = bank(data.takes);
    if (Object.hasOwn(data, 'surfaces')) {
        if (!object(data.surfaces) || Object.keys(data.surfaces).length > MAX_RECORDING_SURFACES)
            throw new Error('recordings accepts at most 32 surface banks');
        const surfaces = Object.create(null);
        for (const [text, clips] of Object.entries(data.surfaces).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
            if (!text || text !== text.trim() || text.length > 200 || hasControl(text))
                throw new Error('Surface descriptions must be trimmed text (1–200 characters)');
            surfaces[text] = bank(clips);
        }
        result.surfaces = Object.freeze(surfaces);
    }
    if (!Object.keys(result).length)
        throw new Error('recordings requires takes and/or surfaces');
    return Object.freeze(result);
}
/** Undefined retains legacy resolution; [] deliberately suppresses a bank. */
export function recordingBank(recordings, text) {
    const surfaces = recordings?.surfaces;
    const key = text?.trim();
    return key !== undefined && surfaces && Object.hasOwn(surfaces, key) ? surfaces[key] : recordings?.takes;
}
//# sourceMappingURL=RecordingBanks.js.map