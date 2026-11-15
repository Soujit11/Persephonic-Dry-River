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
export interface ClipActivity {
    /** Seconds per envelope hop. */
    hopS: number;
    /** Clip length in seconds (at rate 1). */
    durationS: number;
    /** One flag per hop: 1 = audible. */
    active: Uint8Array;
}
export declare const CLIP_ACTIVITY_HOP_S = 0.02;
/** Level relative to the clip's own peak below which a hop counts as silent. */
export declare const CLIP_ACTIVITY_THRESHOLD_DB = -40;
/** RMS envelope → audible flags. Mono samples (mix channels down before calling). */
export declare function clipActivityFromSamples(samples: Float32Array, sampleRate: number, hopS?: number, thresholdDb?: number): ClipActivity;
/**
 * Is the clip audible `elapsed` seconds into a voice that started `startOffset`
 * seconds into it at playback rate `pitch`? Loops wrap; a one-shot past its end
 * is silent. With no activity known (undefined) the answer is "yes" — the
 * scheduled-span behaviour.
 */
export declare function clipAudibleAt(activity: ClipActivity | undefined, elapsed: number, startOffset: number, pitch: number, loop: boolean): boolean;
/**
 * Decode raw sample bytes (any format the browser reads) into activity maps,
 * keyed exactly like the render's buffer map so the emitters resolve a clip
 * the same way the renderer does. Browser-only (OfflineAudioContext).
 */
export declare function clipActivityForBuffers(buffers: Map<string, ArrayBuffer>, sampleRate: number): Promise<Map<string, ClipActivity>>;
/** The renderer's own lookup order (OfflineRenderer.resolveBuffer), for the emitters. */
export declare function resolveClipActivity(activity: Map<string, ClipActivity> | undefined, clip: string): ClipActivity | undefined;
//# sourceMappingURL=ClipActivity.d.ts.map