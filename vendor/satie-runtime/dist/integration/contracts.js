/** Portable observations for integration, diagnostics, replay and future world-model datasets. */
/**
 * The runtime's version: the same number as `packages/satie-runtime/package.json`. A capture records it
 * (`provenance.runtimeVersion`), and the install line Satie hands out names it, so it moves with every
 * release of the package. It stayed at 0.4.4 through 0.4.5; `runtime-version.test.ts` holds the two together.
 */
export const RUNTIME_VERSION = '0.4.8';
/** A capture's wall clock and audio clock further apart than this (seconds) are flagged; below it they count as running together. */
export const AUDIO_CLOCK_TOLERANCE_S = 0.1;
/** The warning a segment gets, once, when its clocks are further apart than AUDIO_CLOCK_TOLERANCE_S. Nothing is dropped. */
export const AUDIO_CLOCK_WARNING = 'Audio/host clock discontinuity during capture; audio timings are kept on the audio clock, with audioClockOffsetS and frames[].audioT to realign them.';
/**
 * Per-channel caps of one capture segment. The MCP's telemetry schema accepts exactly these;
 * a capture that reaches one closes the segment and opens the next (SceneCapture, 2026-11-08).
 */
export const CAPTURE_CAPS = { frames: 10000, events: 20000, actions: 10000 };
export const CAPTURE_ACTION_KINDS = ['event', 'signal', 'state', 'object-state', 'object-state-clear', 'object-state-schema', 'object-tracking', 'capture-gap', 'bind', 'host-position', 'unbind', 'object-destroy', 'start', 'stop', 'entity-action', 'entity-steer', 'entity-goal'];
//# sourceMappingURL=contracts.js.map