/**
 * usda text authoring for USDZ export.
 *
 * Emits one UsdMediaSpatialAudio prim per voice under a root Xform, with
 * animated `xformOp:translate` timeSamples for moving voices and an optional
 * child Sphere marker so AR Quick Look shows something aimable. All level
 * changes are baked into the clips, so `gain` stays 1 and every prim plays
 * `onceFromStart` — the only playbackMode Apple's runtimes are known to honor
 * reliably.
 *
 * Stage convention: Y-up, meters, 30 timeCodesPerSecond (matching the
 * engine's automation cadence). Positions arrive already converted to USD's
 * frame (−Z front) by the exporter.
 */
export interface USDVoiceSpec {
    /** Sanitized unique prim name, e.g. "voice_03_rain_c01". */
    primName: string;
    /** Package-relative clip path, e.g. "audio/voice_03_rain_c01.wav". */
    clipHref: string;
    /** Timecodes (1/30 s) at which playback starts. */
    startTimeCode: number;
    /** Static translate (exclusive with positionTimeSamples). */
    staticPosition?: [number, number, number];
    /** [timeCode, position] pairs at the stage cadence. */
    positionTimeSamples?: Array<[number, [number, number, number]]>;
    includeMarker: boolean;
}
export interface USDSceneSpec {
    durationSeconds: number;
    voices: USDVoiceSpec[];
}
export declare const USD_TIMECODES_PER_SECOND = 30;
/** USD prim names: [A-Za-z0-9_], must not start with a digit. */
export declare function sanitizePrimName(raw: string): string;
/** Build the complete default-layer usda text. */
export declare function buildUSDA(spec: USDSceneSpec): string;
//# sourceMappingURL=USDAWriter.d.ts.map