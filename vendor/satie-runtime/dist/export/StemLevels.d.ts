/**
 * Received level MEASURED from the rendered stems, not modelled.
 *
 * The mic-array path renders one mono stem per source (`renderObjectStems`):
 * the source as it arrives at the array centre, with the envelope, DSP,
 * reverb send, muffle and the listener-relative distance law baked, before
 * the capsule pass spreads it over the array. Reading the level off that
 * stem per label frame gives a received level that is what the renderer
 * actually produced, where `receivedAnalyticDb` is what the level model says
 * it should be. The two are written side by side in the scene graph so a
 * reader can see where the renderer and its own model disagree.
 *
 * The number is dBFS: `20 * log10(RMS)` over the frame window, full scale 1.
 * It includes the live master's -6 dB (`renderObjectStems` bakes it) and not
 * the job's `headroomDb` trim (applied to the mixed output). Silence floors
 * at `STEM_LEVEL_FLOOR_DBFS` rather than -Infinity, which JSON cannot hold.
 */
import type { VoiceMotion } from './VoicePositions';
/** Where a frame with no signal lands, dBFS (about 4 bits under 16-bit quantization noise). */
export declare const STEM_LEVEL_FLOOR_DBFS = -120;
export interface MeasuredStemLevels {
    basis: 'output-measured-stem';
    /** Label frames per second the levels were measured at (the scene graph's fps). */
    fps: number;
    /** Per voice (index-aligned with `manifest.voices`), per frame: dBFS, or null when that voice had no stem. */
    dbfs: (Float32Array | null)[];
}
/**
 * Per-frame RMS level of each stem over `[frame / fps, (frame + 1) / fps)`,
 * in dBFS, for `frameCount = ceil(durationS * fps)` frames. Frames outside
 * the voice's window read the stem anyway (it is silent there), so a late
 * reverb tail is measured where it sounds. `stems[i]` undefined gives a null
 * row: that voice was not rendered (missing buffer).
 */
export declare function measureStemLevels(stems: readonly (Float32Array | undefined)[], voices: readonly VoiceMotion[], sampleRate: number, durationS: number, fps: number): MeasuredStemLevels;
//# sourceMappingURL=StemLevels.d.ts.map