/**
 * Perfect loops from imperfect files.
 *
 * Every take and most library recordings arrive as MP3, and MP3 pads both ends
 * with encoder delay / padding silence (tens of milliseconds); no generated
 * "seamless" take and no field recording ends where it began. Looped as-is, the
 * wrap is a gap and a click every cycle (Mateo, 2026-09-09: "I can hear the
 * audio files looping because it stops"). A sound designer fixes this by hand:
 * trim the silence, end the loop where the waveform matches the start, and
 * crossfade the tail into the head. This module does exactly that, once per
 * buffer, so `sourceNode.loop = true` wraps without a seam.
 */
/** Below this the edges count as padding, not content. */
export const LOOP_TRIM_DB = -60;
/** Longest crossfade, seconds; ambiences take the full length, short loops a tenth of their duration. */
export const LOOP_FADE_MAX_S = 1.0;
/** How far back from the trimmed end the best-matching loop point is searched, seconds. */
export const LOOP_SEARCH_S = 0.12;
/** Buffers shorter than this are left alone (a 1 s loop has nothing to crossfade). */
export const LOOP_MIN_S = 2.0;
/** [start, end) sample bounds with leading / trailing near-silence removed (never empties the buffer). */
export function trimSilenceBounds(buffer, thresholdDb = LOOP_TRIM_DB) {
    const thr = Math.pow(10, thresholdDb / 20);
    const n = buffer.length;
    const ch = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const loud = (i) => { for (const d of ch)
        if (Math.abs(d[i]) > thr)
            return true; return false; };
    let start = 0;
    while (start < n && !loud(start))
        start++;
    let end = n;
    while (end > start && !loud(end - 1))
        end--;
    if (end - start < Math.floor(n * 0.5))
        return [0, n]; // mostly under the threshold: a quiet bed, keep it whole
    return [start, end];
}
/**
 * The loop end within the last `searchS` seconds where the signal (value and
 * slope, summed over channels) best matches the start, so the wrap is as
 * continuous as the material allows before the crossfade smooths the rest.
 */
export function bestLoopEnd(buffer, start, end, searchS = LOOP_SEARCH_S) {
    const span = Math.min(end - start - 1, Math.floor(searchS * buffer.sampleRate));
    if (span < 2)
        return end;
    const ch = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    let best = end, bestCost = Infinity;
    for (let e = end; e > end - span; e--) {
        let cost = 0;
        for (const d of ch) {
            const v = d[e - 1] - d[start];
            const s = (d[e - 1] - d[e - 2]) - (d[start + 1] - d[start]);
            cost += v * v + 0.5 * s * s;
        }
        if (cost < bestCost) {
            bestCost = cost;
            best = e;
        }
    }
    return best;
}
/**
 * A copy of `buffer` that loops without a seam: trimmed, ended at the best
 * match to its start, and with its tail crossfaded (equal power) into its
 * head so the wrap is continuous. Returns the input untouched when it is too
 * short to treat or the context cannot allocate a buffer.
 */
export function makeSeamlessLoop(buffer, create) {
    if (buffer.duration < LOOP_MIN_S)
        return buffer;
    const [start, trimmedEnd] = trimSilenceBounds(buffer);
    const end = bestLoopEnd(buffer, start, trimmedEnd);
    const seg = end - start;
    const fade = Math.min(Math.floor(LOOP_FADE_MAX_S * buffer.sampleRate), Math.floor(seg * 0.1));
    const n = seg - fade;
    if (n < buffer.sampleRate * 0.5 || fade < 8)
        return buffer;
    const out = create(buffer.numberOfChannels, n, buffer.sampleRate);
    if (!out)
        return buffer;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = out.getChannelData(c);
        for (let i = 0; i < n; i++)
            dst[i] = src[start + i];
        // The head is the tail fading out under the head fading in: the last sample
        // of the loop (src[start+n-1]) hands over to the tail's continuation.
        for (let i = 0; i < fade; i++) {
            const t = (i + 1) / (fade + 1);
            const win = Math.sin((Math.PI / 2) * t);
            const wout = Math.cos((Math.PI / 2) * t);
            dst[i] = src[start + i] * win + src[start + n + i] * wout;
        }
    }
    return out;
}
/**
 * One seamless copy per source buffer, shared by every caller.
 *
 * The live engine and the offline renderer must loop the SAME treated buffer,
 * or an export does not sound like what was heard (before this, the renderer
 * looped the raw buffer and every exported loop kept the seam the live mix had
 * already fixed). Keyed on the decoded buffer, so the treatment is computed
 * once no matter how many voices or render passes ask for it. AudioBuffers are
 * context-independent, so a buffer made by an OfflineAudioContext and one made
 * by the live context are interchangeable here.
 */
const SEAMLESS = new WeakMap();
export function seamlessLoopOf(buffer, create, 
// A headless simulation allocates PcmLike stubs. They must never poison
// the native AudioBuffer cache subsequently used by playback or export.
cacheScope) {
    const copies = SEAMLESS.get(buffer) ?? new Map();
    const cached = copies.get(cacheScope);
    if (cached)
        return cached;
    const made = makeSeamlessLoop(buffer, create);
    copies.set(cacheScope, made);
    SEAMLESS.set(buffer, copies);
    return made;
}
/** The seam a loop would have: |last − first| plus slope mismatch, summed over channels (0 = continuous). */
export function loopSeam(buffer) {
    let seam = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const d = buffer.getChannelData(c);
        const n = d.length;
        seam += Math.abs(d[n - 1] - d[0]) + Math.abs((d[n - 1] - d[n - 2]) - (d[1] - d[0]));
    }
    return seam;
}
//# sourceMappingURL=SeamlessLoop.js.map