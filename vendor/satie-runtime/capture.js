/**
 * Captures in development without the agent (spec 011 A.6, 2026-11-08).
 *
 * `recordCaptures(audio)` asks the dev server whether the `satie-runtime/vite` plugin is on
 * (GET /__satie/capture). When it is, it begins a capture on the first play, posts every closed
 * segment to the plugin (POST /__satie/capture { telemetry }), closes a segment on its own every
 * `maxSegmentS` seconds (60 by default) so a long session is many small files, rolls the open
 * segment over when the page is hidden, and posts the last segment when the game ends the capture,
 * the mixer is unmounted, or the page is unloaded. A segment is megabytes, past what a beacon or a
 * keepalive fetch may carry, so the one open at unload is lost: the 60 s default and the rollover
 * on hide bound that loss (the spec 011 dogfood lost a whole 80 s session this way, 2026-11-09). Without
 * the plugin nothing starts and nothing leaves the page. The plugin writes each segment to
 * `.satie/captures/` and, when the developer is signed in, keeps it on their Satie account
 * (CAPTURE.md says what that means).
 *
 * The page's own `beginCapture` wins: a capture the game started is left alone.
 */
export function recordCaptures(audio, { url = '/__satie/capture', maxSegmentS = 60, fetch: fetchFn } = {}) {
  const f = fetchFn ?? (typeof fetch === 'function' ? (...args) => fetch(...args) : null);
  let begun = false, stopped = false, ending = false, timer = null, unsubscribe = null;
  const posted = [];
  const post = (telemetry, final) => {
    const body = JSON.stringify({ telemetry });
    const small = body.length < 60_000; // the keepalive and beacon quota
    if (final && small && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return Promise.resolve(true); } catch { /* fall through to fetch */ }
    }
    const request = f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, ...(final && small ? { keepalive: true } : {}) })
      .then(r => r.ok, () => false);
    posted.push(request);
    return request;
  };
  const begin = () => {
    if (begun || stopped || audio.capture.active) return;
    begun = true;
    audio.beginCapture({ onSegment: segment => void post(segment, ending) });
    if (maxSegmentS > 0 && typeof setInterval === 'function') timer = setInterval(() => { if (audio.capture.active) audio.rolloverCapture(); }, maxSegmentS * 1000);
  };
  const end = () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (!begun || !audio.capture.active) return;
    ending = true;
    try { audio.endCapture(); } finally { ending = false; }
  };
  const onUnload = () => end();
  const onHidden = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && begun && audio.capture.active) audio.rolloverCapture(); };
  const arm = () => {
    unsubscribe = audio.engine.subscribe(state => { if (state.isPlaying) begin(); });
    if (audio.engine.isPlaying) begin();
    if (typeof addEventListener === 'function') { addEventListener('pagehide', onUnload); addEventListener('beforeunload', onUnload); addEventListener('visibilitychange', onHidden); }
  };
  const ready = !f ? Promise.resolve(false)
    : f(url, { method: 'GET' }).then(r => (r.ok ? r.json() : null)).then(reply => {
      if (!reply?.ok || stopped) return false;
      arm();
      return true;
    }).catch(() => false);
  return {
    /** Resolves true once the plugin answered and the recorder is armed; false when there is no plugin. */
    ready,
    /** Whether this recorder's capture is open now. */
    get active() { return begun && audio.capture.active; },
    /** End the capture now; the last segment is posted. */
    end,
    /** End the capture, post the last segment, and stop listening. */
    stop() {
      stopped = true;
      end();
      unsubscribe?.(); unsubscribe = null;
      if (typeof removeEventListener === 'function') { removeEventListener('pagehide', onUnload); removeEventListener('beforeunload', onUnload); removeEventListener('visibilitychange', onHidden); }
    },
    /** Settles when every post so far has been answered (for tests and shutdown). */
    flush: () => Promise.all(posted).then(() => undefined),
  };
}
