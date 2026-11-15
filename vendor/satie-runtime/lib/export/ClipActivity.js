/**
 * ClipActivity — where a clip actually SOUNDS, so labels mark audible frames.
 *
 * A one-shot's label used to cover its whole scheduled span: a 4 s "glass
 * clink" file is a click and then silence, and every frame of that silence was
 * annotated as glass. Labels of what was SCHEDULED, not what was AUDIBLE — a
 * model trained on them learns that silence is glass (measured 2026-08-25:
 * transient classes at 0.14–0.31 recall while steady ones sat at 0.7–0.9).
 *
 * The fix is an envelope per clip — frames whose level is within `thresholdDb`
 * of the clip's peak are audible — and a mapping from a voice's timeline back
 * into its clip (start offset, playback rate, loop wrap). Both annotation
 * emitters consult it when `clipActivity` is passed; without it they keep the
 * historical scheduled-span behaviour.
 */
import { pathFor } from '../core/SatieParser.js';
export const CLIP_ACTIVITY_HOP_S = 0.02;
/** Level relative to the clip's own peak below which a hop counts as silent. */
export const CLIP_ACTIVITY_THRESHOLD_DB = -40;
/** RMS envelope → audible flags. Mono samples (mix channels down before calling). */
export function clipActivityFromSamples(samples, sampleRate, hopS = CLIP_ACTIVITY_HOP_S, thresholdDb = CLIP_ACTIVITY_THRESHOLD_DB) {
    const hop = Math.max(1, Math.round(hopS * sampleRate));
    const n = Math.max(1, Math.ceil(samples.length / hop));
    const rms = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) {
        let acc = 0;
        const start = i * hop;
        const end = Math.min(samples.length, start + hop);
        for (let j = start; j < end; j++)
            acc += samples[j] * samples[j];
        const r = Math.sqrt(acc / Math.max(1, end - start));
        rms[i] = r;
        if (r > peak)
            peak = r;
    }
    const active = new Uint8Array(n);
    if (peak > 0) {
        const floor = peak * Math.pow(10, thresholdDb / 20);
        for (let i = 0; i < n; i++)
            active[i] = rms[i] >= floor ? 1 : 0;
    }
    return { hopS: hop / sampleRate, durationS: samples.length / sampleRate, active };
}
/**
 * Is the clip audible `elapsed` seconds into a voice that started `startOffset`
 * seconds into it at playback rate `pitch`? Loops wrap; a one-shot past its end
 * is silent. With no activity known (undefined) the answer is "yes" — the
 * scheduled-span behaviour.
 */
export function clipAudibleAt(activity, elapsed, startOffset, pitch, loop) {
    if (!activity)
        return true;
    if (activity.durationS <= 0 || activity.active.length === 0)
        return false;
    let pos = startOffset + elapsed * (pitch > 0 ? pitch : 1);
    if (loop) {
        pos = pos % activity.durationS;
        if (pos < 0)
            pos += activity.durationS;
    }
    else if (pos >= activity.durationS || pos < 0) {
        return false;
    }
    const i = Math.min(activity.active.length - 1, Math.floor(pos / activity.hopS));
    return activity.active[i] === 1;
}
/**
 * Decode raw sample bytes (any format the browser reads) into activity maps,
 * keyed exactly like the render's buffer map so the emitters resolve a clip
 * the same way the renderer does. Browser-only (OfflineAudioContext).
 */
export async function clipActivityForBuffers(buffers, sampleRate) {
    const out = new Map();
    const ctx = new OfflineAudioContext(1, 1, sampleRate);
    for (const [key, bytes] of buffers) {
        try {
            const decoded = await ctx.decodeAudioData(bytes.slice(0));
            const n = decoded.length;
            const mono = new Float32Array(n);
            for (let c = 0; c < decoded.numberOfChannels; c++) {
                const d = decoded.getChannelData(c);
                for (let i = 0; i < n; i++)
                    mono[i] += d[i] / decoded.numberOfChannels;
            }
            out.set(key, clipActivityFromSamples(mono, decoded.sampleRate));
        }
        catch {
            // undecodable clip: the renderer skips it too (manifest.missingClips)
        }
    }
    return out;
}
/** The renderer's own lookup order (OfflineRenderer.resolveBuffer), for the emitters. */
export function resolveClipActivity(activity, clip) {
    if (!activity)
        return undefined;
    return activity.get(pathFor(clip)) ?? activity.get(clip);
}
//# sourceMappingURL=ClipActivity.js.map