/**
 * Contact labels for machine listening (spec 008, step 4).
 *
 * Every body contact in a render (a person sitting down, a cup set on a table,
 * a chair dragged) is a labelled sound event whose CAUSE is known exactly:
 * which body, which act, what it touched, when, where. The SELD CSV
 * (`SeldAnnotations`) says what sounded where per frame; this sidecar says why,
 * one row per contact, so Ludwig's pipeline can learn causal events rather
 * than bare onsets. Rows are read off the simulated trace's behaviour log
 * (`EntityRuntime.fireContact` logs `contact:<act>:<contact>:<material>`) and
 * carry the listener-relative bearing in the same convention as the SELD
 * rows, so the two files join on `frame`.
 *
 * The format is a first proposal for Milan to edit: every field is documented
 * inside the file it writes (`fields`), the version is in `format`, and this
 * module is pure (manifest in, rows out), so changing a field is one edit here
 * and one in the test.
 */
import type { RenderManifest } from './RenderManifest';
import { type ListenerKeyframe } from './ListenerPath.js';
export declare const CONTACT_LABELS_FORMAT = "satie-contacts/1";
export interface ContactRow {
    /** Seconds from the start of the render. */
    t: number;
    /** The SELD frame this falls in (`floor(t * fps)`), to join with the CSV. */
    frame: number;
    /** The entity class (the person or thing) and the instance number of the body. */
    entity: string;
    instance: number;
    /** The act the body was performing (`sit`, `stand`, `pick_up`, `set_down`, `shift`, ...). */
    act: string;
    /** The contact within the act (the clip's contact name; the same as the act for one-contact clips). */
    contact: string;
    /** The material of what the body touched, as the world declared it (`wood`, `stone tiles`); empty when unknown. */
    material: string;
    /** Where the body was, world metres, +Y up. */
    position: [number, number, number];
    /** DCASE bearing from the listener at `t`: 0 ahead, positive left, [-180, 180]. */
    azimuthDeg: number;
    /** Positive up, [-90, 90]. */
    elevationDeg: number;
    /** Straight-line range from the listener, metres. */
    distanceM: number;
}
export interface ContactLabels {
    format: typeof CONTACT_LABELS_FORMAT;
    fps: number;
    durationS: number;
    rows: ContactRow[];
}
export interface ContactLabelOptions {
    /** Frame rate for `frame` (default the SELD hop, 10 a second). */
    fps?: number;
    /** The listener's path the audio was rendered with; omitted means fixed at the origin facing +Z. */
    listenerPath?: ListenerKeyframe[];
}
/** `contact:<act>:<contact>:<material>` → its parts; null for any other behaviour label. */
export declare function parseContactLabel(label: string): {
    act: string;
    contact: string;
    material: string;
} | null;
/** The contact rows of a simulated render; a manifest without behaviours gives none. */
export declare function buildContactLabels(manifest: Pick<RenderManifest, 'duration' | 'behaviors'>, options?: ContactLabelOptions): ContactLabels;
/** The sidecar, with its field guide inside it, so the file explains itself to whoever edits the format. */
export declare function contactLabelsJson(labels: ContactLabels): string;
//# sourceMappingURL=ContactLabels.d.ts.map