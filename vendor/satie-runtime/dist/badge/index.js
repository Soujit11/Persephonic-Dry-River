import { MARK_SVG } from './mark';
/**
 * satie-runtime/badge: the "Sound by SATIE" credit (style Haze + rim, decided
 * 2026-09-26; design record in the company brain, brand/design_systems/logo+banner/watermark).
 * Lives on the loading / pause screen only: the credit unfolds each time that screen
 * appears; entering the game folds it back into the circle, then the circle fades.
 * Dev mode is set in code. In dev mode the circle opens the SATIE mixer; in player
 * mode the credit plays once per screen and leaves.
 */
const CSS = ".satie-badge{\n  --h:34px;                        /* never below 28px: the brand minimum */\n  --w:var(--h);                    /* current width; JS sets the expanded width */\n  position:fixed;right:16px;bottom:16px;z-index:20;\n  display:flex;align-items:center;justify-content:flex-end;\n  width:var(--w);height:var(--h);padding:0;\n  border:0;border-radius:999px;cursor:default;overflow:visible;\n  color:#0a1f14;font-family:\"IBM Plex Mono\",ui-monospace,\"SF Mono\",Menlo,Consolas,monospace;\n  /* More opaque than the static badge's .42: at 34px over a dark game the\n     thinner scrim went muddy grey. The backdrop-filter is unchanged. */\n  background:rgba(244,243,238,.66);\n  -webkit-backdrop-filter:blur(14px) brightness(1.06) saturate(.45);\n  backdrop-filter:blur(14px) brightness(1.06) saturate(.45);\n  --rim:0 0 0 0 transparent;      /* glass variant fills this with inset highlights */\n  box-shadow:var(--rim),0 0 0 0 rgba(244,243,238,0),0 1px 2px rgba(0,0,0,.18);\n  opacity:0;transform:translateY(6px) scale(.9);\n  transition:\n    width .62s cubic-bezier(.34,1.45,.64,1),      /* soft overshoot: the bounce (without linear()) */\n    background .25s ease, box-shadow .25s ease,\n    opacity .4s ease, transform .4s ease;\n  /* A spring (damping .62): it eases out of the circle, overshoots about 8% at mid-way and settles. The bezier\n     reached three quarters of the width in 150 ms and drifted back 5%, which read as a snap, not a bounce. */\n  transition:\n    width .75s linear(0, .039 4%, .136 8%, .266 12%, .41 16%, .553 20%, .715 25%, .848 30%, .949 35%, 1.018 40%, 1.06 45%, 1.079 50%, 1.083 55%, 1.077 60%, 1.061 66%, 1.043 72%, 1.021 80%, 1.003 90%, 1),\n    background .25s ease, box-shadow .25s ease,\n    opacity .4s ease, transform .4s ease;\n  -webkit-tap-highlight-color:transparent;\n}\n.satie-badge[data-shown]{opacity:1;transform:none}\n/* A credit handed over already open (hold): arrive in that state, without unfolding or fading in again. */\n.satie-badge[data-instant],.satie-badge[data-instant] *{transition:none!important}\n/* Idle: fades back so it stays out of the way of play. Hover or focus wakes it. */\n.satie-badge[data-shown][data-idle]{opacity:.38;transition-duration:.42s,.25s,.25s,.45s,.4s}\n/* Hover always restores full brightness, even before the script reacts. */\n.satie-badge[data-shown]:hover,.satie-badge[data-shown]:focus-visible{opacity:1;transition-duration:.42s,.25s,.25s,.15s,.4s}\n.satie-badge[data-dev]{cursor:pointer}\n/* Collapsing does not bounce. */\n.satie-badge:not([data-open]){transition-timing-function:cubic-bezier(.4,0,.2,1),ease,ease,ease,ease;transition-duration:.42s,.25s,.25s,.4s,.4s}\n\n/* Forgiving hit area: 12px of invisible target past the visible pill. */\n.satie-badge::before{content:\"\";position:absolute;inset:-12px;border-radius:999px}\n\n.satie-badge__clip{position:relative;display:flex;flex-direction:row-reverse;align-items:center;width:100%;height:100%;overflow:hidden;border-radius:inherit}\n.satie-badge__mark{flex:0 0 var(--h);height:var(--h);display:grid;place-items:center}\n.satie-badge__mark svg{width:calc(var(--h)*.68);height:auto;display:block}\n/* The traced mark is hairline at this size; a thin stroke keeps it visible. */\n.satie-badge__mark svg path{stroke:currentColor;stroke-width:420;stroke-linejoin:round}\n.satie-badge__text{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;white-space:nowrap;\n  padding-left:calc(var(--h)*.42);opacity:0;transition:opacity .2s ease}\n.satie-badge[data-open] .satie-badge__text{opacity:1;transition:opacity .3s ease .12s}\n.satie-badge__title{font-weight:500;font-size:calc(var(--h)*.40);line-height:1.05;letter-spacing:-.005em}\n.satie-badge__url{font-weight:400;font-size:calc(var(--h)*.28);line-height:1.1;opacity:.65;margin-top:.1em}\n\n/* Hover: illuminate slightly. */\n.satie-badge:hover,.satie-badge:focus-visible{\n  background:rgba(244,243,238,.80);\n  box-shadow:var(--rim),0 0 0 1px rgba(244,243,238,.35),0 0 18px 2px rgba(244,243,238,.22),0 1px 2px rgba(0,0,0,.18)}\n.satie-badge:focus-visible{outline:none}\n/* Click: light up. */\n.satie-badge[data-flash]{\n  background:rgba(244,243,238,.94);\n  box-shadow:var(--rim),0 0 0 1px rgba(244,243,238,.6),0 0 26px 6px rgba(244,243,238,.38),0 1px 2px rgba(0,0,0,.18)}\n.satie-badge[data-panel-open],.satie-badge[data-shown][data-panel-open],.satie-badge[data-shown][data-idle][data-panel-open]{opacity:0;pointer-events:none}\n/* Player mode: after the credit folds, the badge leaves entirely. */\n.satie-badge[data-shown][data-gone]{opacity:0;pointer-events:none;transform:scale(.88);\n  transition:width .42s cubic-bezier(.4,0,.2,1),background .25s ease,box-shadow .25s ease,opacity .5s ease,transform .5s cubic-bezier(.4,0,.2,1)}\n\n/* ---------- hue variants (2026-09-26 comparison) ----------\n   Three layers, each with its own strength per variant: a soft outer glow of the\n   site's eight hues that drifts round (never pulses), an optional edge rim softened\n   by a little blur so it never reads as a hard line, and an optional wash of the\n   brand's blob hues (green, indigo, amber) inside the pill that drifts sideways and\n   slowly cycles colour. Everything runs only while the badge is open. No\n   data-hue = plain Frosted. */\n@property --satie-angle{syntax:'<angle>';inherits:false;initial-value:0deg}\n.satie-badge{--glow-op:0;--glow-blur:8px;--glow-pad:5px;--rim-op:0;--rim-w:1px;--rim-blur:0px;--wash-op:0}\n.satie-badge[data-hue=haze-rim]{--glow-op:0.6;--glow-blur:8px;--glow-pad:5px;--rim-op:0.5;--rim-w:1.25px;--rim-blur:0.5px;--wash-op:0.38}\n.satie-badge__halo,.satie-badge__edge{position:absolute;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s ease}\n.satie-badge__halo{inset:-3px;filter:blur(var(--glow-blur))}\n.satie-badge__edge{inset:0;filter:blur(var(--rim-blur))}\n.satie-badge__ring{position:absolute;inset:0;border-radius:inherit;padding:var(--rim-w);\n  background:conic-gradient(from var(--satie-angle),hsl(0 68% 66%), hsl(45 68% 66%), hsl(90 68% 66%), hsl(135 68% 66%), hsl(180 68% 66%), hsl(225 68% 66%), hsl(270 68% 66%), hsl(315 68% 66%), hsl(360 68% 66%));\n  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;\n  animation:satie-hue 9s linear infinite paused}\n.satie-badge__halo .satie-badge__ring{padding:var(--glow-pad)}\n@keyframes satie-hue{to{--satie-angle:360deg}}\n.satie-badge__wash{position:absolute;inset:-60% -30%;pointer-events:none;opacity:0;transition:opacity .25s ease;\n  background:radial-gradient(38% 62% at 18% 50%,hsl(150 60% 62% / .95),transparent 70%),\n    radial-gradient(34% 62% at 52% 42%,hsl(240 60% 72% / .85),transparent 70%),\n    radial-gradient(38% 62% at 86% 58%,hsl(38 78% 64% / .9),transparent 70%);\n  filter:blur(8px) hue-rotate(0deg);\n  animation:satie-drift 6.5s ease-in-out infinite alternate,satie-cycle 14s linear infinite;animation-play-state:paused,paused}\n@keyframes satie-drift{from{transform:translateX(-16%)}to{transform:translateX(16%)}}\n@keyframes satie-cycle{to{filter:blur(8px) hue-rotate(360deg)}}\n.satie-badge__mark,.satie-badge__text{position:relative}\n.satie-badge[data-hue][data-open] .satie-badge__halo{opacity:var(--glow-op);transition:opacity .9s ease .05s}\n.satie-badge[data-hue][data-open] .satie-badge__edge{opacity:var(--rim-op);transition:opacity .7s ease}\n.satie-badge[data-hue][data-open] .satie-badge__wash{opacity:var(--wash-op);transition:opacity .9s ease .05s;animation-play-state:running,running}\n.satie-badge[data-hue][data-open] .satie-badge__ring{animation-play-state:running}\n.satie-badge[data-hue][data-open]:hover .satie-badge__halo{opacity:min(1,calc(var(--glow-op) + .15))}\n\n@media (prefers-reduced-motion: reduce){.satie-badge__ring{animation:none}}\n.satie-loading{position:fixed;right:20px;bottom:24px;font:500 10.5px/1 'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(232,228,218,.72);text-shadow:0 1px 6px rgba(0,0,0,.5);opacity:0;transition:opacity .4s ease;pointer-events:none}\n.satie-loading[data-on]{opacity:1}\n";
const HTML = `<button class="satie-badge" type="button" data-hue="haze-rim" data-dev aria-label="Sound by SATIE. Open the SATIE sound mixer">
  <span class="satie-badge__halo" aria-hidden="true"><span class="satie-badge__ring"></span></span>
  <span class="satie-badge__edge" aria-hidden="true"><span class="satie-badge__ring"></span></span>
  <span class="satie-badge__clip">
    <span class="satie-badge__wash" aria-hidden="true"></span>
    <span class="satie-badge__mark">${MARK_SVG}</span>
    <span class="satie-badge__text" data-text><span class="satie-badge__title">Sound by SATIE</span><span class="satie-badge__url">satie.world</span></span>
  </span>
</button>`;
/** How long the intro shows the translucent circle before the credit unfolds. */
const CIRCLE_MS = 800;
export function badge(opts) {
    // Mount in the host's own document: drawn over a game frame from a parent page, the badge's backdrop
    // blur makes the browser recomposite that frame on every step of the unfold.
    const doc = opts.host?.ownerDocument ?? document;
    const style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.appendChild(style);
    const holder = doc.createElement('div');
    holder.innerHTML = HTML;
    const el = holder.firstElementChild;
    const text = el.querySelector('[data-text]');
    // above a game's own title card
    el.style.zIndex = String(opts.zIndex ?? 2147483001);
    const host = opts.host ?? doc.body;
    if (host !== doc.body) {
        el.style.position = 'absolute';
        el.style.pointerEvents = 'auto';
    }
    host.appendChild(el);
    const title = opts.title ?? 'Sound by SATIE';
    el.querySelector('.satie-badge__title').textContent = title;
    if (opts.dev && opts.onOpen)
        el.setAttribute('aria-label', `${title}. Open the SATIE sound mixer`);
    else {
        el.removeAttribute('data-dev');
        el.setAttribute('aria-label', `${title}, satie.world`);
    }
    let hovering = false, introRunning = false;
    let holdTimer = 0, hoverTimer = 0, goneTimer = 0, introTimer = 0;
    let foldAt = 0; // when the running intro folds the credit
    function* hueAnimations() {
        for (const animation of el.getAnimations({ subtree: true })) {
            const name = animation.animationName;
            if (!name)
                continue; // a transition, not one of the hue animations
            const target = animation.effect?.target;
            yield [`${target?.className ?? ''}|${name}`, animation];
        }
    }
    function setOpen(open) {
        if (open) {
            el.removeAttribute('data-idle');
            el.style.setProperty('--w', Math.ceil(34 + text.scrollWidth) + 'px');
            el.setAttribute('data-open', '');
        }
        else {
            el.style.setProperty('--w', 'var(--h)');
            el.removeAttribute('data-open');
            if (!hovering)
                el.setAttribute('data-idle', '');
        }
    }
    // A badge made and shown in one go has no style to transition from, so it popped in at full size:
    // resolve its hidden style first, and showing it fades and rises it in.
    function arrive() {
        if (!el.hasAttribute('data-shown'))
            void getComputedStyle(el).opacity;
        el.setAttribute('data-shown', '');
    }
    function fold() {
        setOpen(false);
        clearTimeout(goneTimer);
        if (!opts.dev)
            goneTimer = window.setTimeout(() => { if (!hovering)
                el.setAttribute('data-gone', ''); }, 420);
    }
    function intro() {
        if (loading) {
            introWanted = true;
            return;
        } // played when loading finishes
        clearTimeout(introTimer);
        clearTimeout(holdTimer);
        clearTimeout(goneTimer);
        clearTimeout(hoverTimer);
        // the translucent circle first (closed and idle: .38), faded in from nothing, then the credit unfolds
        setOpen(false);
        el.removeAttribute('data-gone');
        arrive();
        introRunning = true;
        foldAt = performance.now() + CIRCLE_MS + (opts.dev ? 5000 : 6000);
        introTimer = window.setTimeout(() => {
            setOpen(true);
            holdTimer = window.setTimeout(() => { introRunning = false; if (!hovering)
                fold(); }, opts.dev ? 5000 : 6000);
        }, CIRCLE_MS);
    }
    function hide() {
        clearTimeout(introTimer);
        clearTimeout(holdTimer);
        clearTimeout(hoverTimer);
        clearTimeout(goneTimer);
        introRunning = false;
        hovering = false;
        const wasOpen = el.hasAttribute('data-open');
        setOpen(false);
        goneTimer = window.setTimeout(() => el.setAttribute('data-gone', ''), wasOpen ? 300 : 0);
    }
    el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') {
        hovering = true;
        clearTimeout(hoverTimer);
        setOpen(true);
    } });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') {
        hovering = false;
        if (!introRunning)
            hoverTimer = window.setTimeout(fold, 350);
    } });
    // the title card starts the game on click: the badge must not
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
        e.stopPropagation();
        if (!opts.dev || !opts.onOpen || loading)
            return;
        el.setAttribute('data-flash', '');
        window.setTimeout(() => el.removeAttribute('data-flash'), 180);
        opts.onOpen?.();
    });
    // Loading is its own quiet line, not the credit: the badge stays away until the sounds are in,
    // then plays its intro (a mixer with nothing loaded yet must not be offered).
    const loader = doc.createElement('div');
    loader.className = 'satie-loading';
    loader.textContent = 'loading sounds';
    loader.setAttribute('role', 'status');
    loader.style.zIndex = el.style.zIndex;
    if (host !== doc.body)
        loader.style.position = 'absolute';
    host.appendChild(loader);
    let loading = false, introWanted = false;
    function setLoading(on) {
        if (on === loading)
            return;
        loading = on;
        if (on) {
            introWanted = introWanted || el.hasAttribute('data-shown');
            hide();
            loader.setAttribute('data-on', '');
        }
        else {
            loader.removeAttribute('data-on');
            if (introWanted)
                window.setTimeout(intro, 250);
        }
    }
    if (opts.ready) {
        setLoading(true);
        opts.ready.then(() => setLoading(false), () => setLoading(false));
    }
    return {
        intro, hide, setLoading,
        rest() {
            clearTimeout(introTimer);
            clearTimeout(holdTimer);
            clearTimeout(goneTimer);
            introRunning = false;
            setOpen(false);
            el.removeAttribute('data-gone');
            arrive();
        },
        hold(ms, phase) {
            clearTimeout(introTimer);
            clearTimeout(holdTimer);
            clearTimeout(goneTimer);
            clearTimeout(hoverTimer);
            // Measuring the text lays the badge out at the circle first, so without this it would unfold again.
            el.setAttribute('data-instant', '');
            el.removeAttribute('data-gone');
            el.setAttribute('data-shown', '');
            setOpen(true);
            introRunning = true;
            void el.offsetWidth;
            // A new element starts its glow and wash from zero; resume them where the old badge had them.
            if (phase)
                for (const [key, animation] of hueAnimations())
                    if (phase[key] !== undefined)
                        animation.currentTime = phase[key];
            requestAnimationFrame(() => requestAnimationFrame(() => el.removeAttribute('data-instant')));
            foldAt = performance.now() + ms;
            holdTimer = window.setTimeout(() => { introRunning = false; if (!hovering)
                fold(); }, ms);
        },
        remainingMs() { return introRunning ? Math.max(0, foldAt - performance.now()) : 0; },
        animationPhase() { return Object.fromEntries([...hueAnimations()].map(([key, animation]) => [key, Number(animation.currentTime ?? 0)])); },
        destroy() { clearTimeout(introTimer); clearTimeout(holdTimer); clearTimeout(hoverTimer); clearTimeout(goneTimer); el.remove(); loader.remove(); style.remove(); },
        setPanelOpen(open) { if (open)
            el.setAttribute('data-panel-open', '');
        else
            el.removeAttribute('data-panel-open'); },
    };
}
//# sourceMappingURL=index.js.map