import { indexMap, placeSound, spanningTree, wordsOf, plainDescription, clusterResults } from './place.js';
export { indexMap, placeSound, matches, wordsOf, spanningTree } from './place.js';
const ROSE = '#ff8da1', INK = '#ebe7df', MUTE = '#8e8a83', BG = '#0d0c0b', GOLD = '#e8c27a';
/** Each take its own colour (the mixer's sidebar uses the same, so a lane and a ring match). */
/** (all rose: rose is yours; gold is only ever a suggestion, so a take you add turns from gold to rose) */
const TAKE_COLORS = ['#ff8da1', '#e8628a', '#ffc2cf', '#d98ae0', '#ff73b0', '#b994f0', '#f5a8bd', '#c95f86'];
const PLAY = '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg>';
const STOP = '<svg viewBox="0 0 10 10" width="9" height="9"><rect x="2" y="2" width="6" height="6" fill="currentColor"/></svg>';
const BIN = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 3.2h8M4.6 3.2V2h2.8v1.2M3.2 3.2l.6 7h4.4l.6-7" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';
const CSS = `
.satie-ep{--bg:#0d0c0b;--ink:#ebe7df;--mute:#8e8a83;--faint:#5d5a55;--line:rgba(235,231,223,.12);--hair:rgba(235,231,223,.07);--sound:#ff8da1;--danger:#e07070;--mono:'IBM Plex Mono','SF Mono',Menlo,Consolas,ui-monospace,monospace;position:fixed;left:12px;top:12px;bottom:12px;right:424px;z-index:2147482999;display:flex;flex-direction:column;background:rgba(10,9,8,.9);backdrop-filter:blur(14px) saturate(1.1);border:1px solid var(--line);border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden;color:var(--ink);font:12px/1.45 'Inter',system-ui,-apple-system,sans-serif;animation:satieEpRise .45s cubic-bezier(.2,.8,.2,1)}
@keyframes satieEpRise{from{transform:translateY(14px) scale(.985)}to{transform:none}}
@media (prefers-reduced-motion: reduce){.satie-ep{animation:none}}
.satie-ep .bar{display:flex;align-items:center;gap:10px;height:41px;padding:0 10px 0 14px;border-bottom:1px solid var(--line);background:rgba(0,0,0,.25);flex:none}
.satie-ep .crumbs{display:flex;align-items:center;gap:6px;font:500 13.5px 'Inter',system-ui,sans-serif;min-width:0;overflow:hidden;white-space:nowrap}
.satie-ep .crumbs button{all:unset;color:var(--mute);cursor:pointer;font-weight:400}
.satie-ep .crumbs button:hover{color:var(--ink)}
.satie-ep .crumbs i{font-style:normal;color:var(--faint)}
.satie-ep .crumbs .cp{all:unset;display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 11px 0 9px;border-radius:999px;border:1px solid var(--line);font:500 12.5px 'Inter',system-ui,sans-serif;color:var(--mute);cursor:default;white-space:nowrap}
.satie-ep .crumbs button.cp{cursor:pointer}
.satie-ep .crumbs button.cp:hover{color:var(--ink);border-color:rgba(235,231,223,.4)}
.satie-ep .crumbs .cp.here{color:var(--ink);background:rgba(235,231,223,.07);border-color:rgba(235,231,223,.3)}
.satie-ep .crumbs .cp i{width:8px;height:8px;box-sizing:border-box;flex:none}
.satie-ep .crumbs .cp.k-scape i{border:1.4px dashed currentColor;border-radius:50%}
.satie-ep .crumbs .cp.k-thing i{border:1.5px solid currentColor;border-radius:2px}
.satie-ep .crumbs .cp.k-sound i{background:var(--sound);border-radius:50%}
.satie-ep .crumbs .cp span::first-letter{text-transform:uppercase}
.satie-ep .crumbs .sep{font-style:normal;color:var(--faint)}
.satie-ep .crumbs .cdd{all:unset;margin-left:-4px;width:22px;height:26px;display:grid;place-items:center;color:var(--mute);cursor:pointer;border-radius:6px}
.satie-ep .crumbs .cdd:hover{color:var(--ink);background:rgba(235,231,223,.06)}
.satie-ep .menu{position:absolute;z-index:6;min-width:220px;padding:5px;background:#1b1a18;border:1px solid var(--line);border-radius:9px;box-shadow:0 14px 34px rgba(0,0,0,.55);display:flex;flex-direction:column}
.satie-ep .menu button{all:unset;display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:6px;font:12.5px 'Inter',system-ui,sans-serif;color:var(--ink);cursor:pointer}
.satie-ep .menu button:hover{background:rgba(235,231,223,.07)}
.satie-ep .menu button.on{background:rgba(235,231,223,.1)}
.satie-ep .menu i{width:8px;height:8px;border:1.4px dashed currentColor;border-radius:50%;box-sizing:border-box}
.satie-ep .menu small{margin-left:auto;font:10.5px var(--mono);color:var(--mute)}
.satie-ep .crumbs{overflow:visible}
.satie-ep .crumbs .ro{margin-left:10px;font:400 11px var(--mono);color:var(--faint);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.satie-ep .x{all:unset;margin-left:auto;width:26px;height:26px;display:grid;place-items:center;border-radius:4px;color:var(--mute);cursor:pointer;font-size:16px}
.satie-ep .x:hover{color:var(--ink);background:rgba(235,231,223,.06)}
.satie-ep .bar .undo{display:inline-flex;margin-left:auto}
.satie-ep .bar .undo + .x{margin-left:4px}
.satie-ep .bar .undo button{all:unset;width:28px;height:28px;display:grid;place-items:center;border-radius:6px;color:var(--mute);cursor:pointer}
.satie-ep .bar .undo button svg{display:block}
.satie-ep .bar .undo button:hover:not(:disabled){color:var(--ink);background:rgba(235,231,223,.07)}
.satie-ep .bar .undo button:disabled{opacity:.3;cursor:default}
.satie-ep .legend{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:8px;font:11px var(--mono);color:#f1dcb0;border:1px solid rgba(232,194,122,.35);border-radius:999px;padding:4px 6px 4px 10px;background:rgba(13,12,11,.85)}
.satie-ep .legend[hidden]{display:none}
.satie-ep .vars{position:absolute;right:12px;top:10px;display:flex;align-items:center;gap:3px;min-height:28px;box-sizing:border-box;padding:0 3px 0 8px;border:1px solid rgba(255,141,161,.55);border-radius:999px;background:rgba(13,12,11,.85);z-index:2;overflow:hidden;isolation:isolate}
.satie-ep .vars::before{content:'';position:absolute;inset:-60%;z-index:-1;background:conic-gradient(from 0deg,transparent 0 70%,rgba(255,141,161,.22) 82%,transparent 94%);animation:satieEpSheen 7s linear infinite}
.satie-ep .vars::after{content:'';position:absolute;inset:0;z-index:-1;background:rgba(255,141,161,.07)}
.satie-ep .vars[hidden]{display:none}
.satie-ep .vars .orb{position:relative;width:16px;height:16px;flex:none;animation:satieEpOrb 9s linear infinite;margin-right:2px}
.satie-ep .vars .orb i{position:absolute;left:6px;top:6px;width:4px;height:4px;border-radius:2px;background:#ff8da1}
.satie-ep .vars .orb i:nth-child(1){transform:translate(0,-5px);animation:satieEpOrbB 4.2s ease-in-out infinite}
.satie-ep .vars .orb i:nth-child(2){transform:translate(4.3px,2.5px);animation:satieEpOrbB 4.2s ease-in-out -1.4s infinite}
.satie-ep .vars .orb i:nth-child(3){transform:translate(-4.3px,2.5px);animation:satieEpOrbB 4.2s ease-in-out -2.8s infinite}
.satie-ep .vars button{all:unset;width:26px;height:22px;display:grid;place-items:center;border-radius:999px;font:500 12.5px var(--mono);color:#f3d7dc;cursor:pointer;border:1px solid transparent;transition:background .3s,box-shadow .3s}
.satie-ep .vars button:hover:not(.on){border-color:rgba(255,141,161,.45)}
.satie-ep .vars button.on{background:#ff8da1;color:#0d0c0b;box-shadow:0 0 12px 2px rgba(255,141,161,.45);cursor:default}
.satie-ep .vars .vl{font:12px var(--mono);color:#f3d7dc;border-left:1px solid rgba(255,141,161,.3);padding:0 10px 0 9px;margin-left:3px;white-space:nowrap}
@keyframes satieEpOrb{to{transform:rotate(360deg)}}
@keyframes satieEpOrbB{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes satieEpSheen{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.satie-ep .vars::before,.satie-ep .vars .orb,.satie-ep .vars .orb i{animation:none}}
.satie-ep .hint{position:absolute;left:14px;top:12px;font:11px var(--mono);color:var(--faint);pointer-events:none}
.satie-ep .topl{position:absolute;left:14px;top:12px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;z-index:3;pointer-events:none}
.satie-ep .topl .hint{position:static}
.satie-ep .back{all:unset;pointer-events:auto;display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 14px 0 11px;border-radius:999px;border:1px solid rgba(235,231,223,.45);background:rgba(13,12,11,.82);color:var(--ink);font:500 13px var(--mono);cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.satie-ep .back:hover{border-color:var(--ink);background:rgba(235,231,223,.1)}
.satie-ep .back:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.satie-ep .back .ar{font-size:15px;line-height:1}
.satie-ep .back[hidden]{display:none}
.satie-ep .legend i{width:9px;height:9px;border-radius:50%;border:1.5px dashed #e8c27a}
.satie-ep .legend button{all:unset;color:var(--mute);cursor:pointer;padding:0 4px}
.satie-ep .legend button:hover{color:var(--ink)}
.satie-ep .map{position:relative;flex:1;min-height:0;margin-right:var(--side,0px)}
.satie-ep canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
.satie-ep canvas.pt{cursor:pointer}
.satie-ep .note{position:absolute;left:50%;top:46%;transform:translateX(-50%);color:var(--mute);font:12px var(--mono);text-align:center;max-width:70%;pointer-events:none}
.satie-ep .zoom{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:rgba(13,12,11,.85)}
.satie-ep .zoom button{all:unset;width:30px;height:28px;display:grid;place-items:center;color:var(--mute);font:14px var(--mono);cursor:pointer}
.satie-ep .zoom button+button{border-top:1px solid var(--line)}
.satie-ep .zoom button:hover{color:var(--ink)}
.satie-ep .strip{position:absolute;left:12px;top:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px);z-index:2}
.satie-ep .strip:empty,.satie-ep .around:empty{display:none}
.satie-ep .around{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:calc(100% - 70px)}
.satie-ep .around .lbl{font:11px var(--mono);color:var(--mute);margin-right:2px}
.satie-ep .chip{all:unset;display:inline-flex;align-items:center;gap:6px;font:11.5px 'Inter',system-ui,sans-serif;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:3px 10px 3px 7px;background:rgba(13,12,11,.85);cursor:pointer}
.satie-ep .chip i{width:6px;height:6px;border-radius:50%;background:var(--sound)}
.satie-ep .chip:hover{border-color:rgba(255,141,161,.55)}
.satie-ep .btn,.satie-ep-tools .btn{all:unset;display:inline-flex;align-items:center;gap:7px;font:12px var(--mono);border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 9px;color:var(--ink);background:rgba(13,12,11,.88);cursor:pointer;white-space:nowrap}
.satie-ep .btn:hover,.satie-ep-tools .btn:hover{border-color:rgba(235,231,223,.3)}
.satie-ep .btn.pri,.satie-ep-tools .btn.pri{border-color:rgba(255,141,161,.6);box-shadow:0 0 0 3px rgba(255,141,161,.08)}
.satie-ep .btn.on,.satie-ep-tools .btn.on{color:var(--sound);border-color:var(--sound)}
.satie-ep .btn.q,.satie-ep-tools .btn.q{color:var(--mute)}
.satie-ep .seg,.satie-ep-tools .seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:rgba(13,12,11,.88)}
.satie-ep .seg button,.satie-ep-tools .seg button{all:unset;font:11.5px var(--mono);color:var(--mute);padding:5px 10px;cursor:pointer}
.satie-ep .seg button.on,.satie-ep-tools .seg button.on{color:#0d0c0b;background:var(--ink)}
.satie-ep .card{position:absolute;z-index:3;width:280px;background:rgba(20,19,18,.97);border:1px solid var(--line);border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.55);padding:12px 13px;animation:satieEpRise .2s ease}
.satie-ep .card .t{font:500 13px 'Inter',system-ui,sans-serif;word-break:break-word}
.satie-ep .card .wv{display:flex;align-items:center;gap:10px;margin:9px 0 6px}
.satie-ep .card .pl{all:unset;width:30px;height:30px;border-radius:50%;border:1px solid rgba(235,231,223,.3);display:grid;place-items:center;color:var(--ink);cursor:pointer;flex:none}
.satie-ep .card .pl.on{border-color:var(--sound);color:var(--sound)}
.satie-ep .card .pl.ld::after{content:'';width:12px;height:12px;border-radius:50%;border:2px solid rgba(235,231,223,.25);border-top-color:var(--ink);animation:satieEpSpin .8s linear infinite}
@keyframes satieEpSpin{to{transform:rotate(360deg)}}
.satie-ep .card .bars{flex:1;display:flex;align-items:center;gap:2px;height:28px}
.satie-ep .card .bars i{flex:1;background:rgba(235,231,223,.3);border-radius:1px}
.satie-ep .card .bars i.on{background:var(--sound)}
.satie-ep .card .m{font:11px var(--mono);color:var(--mute)}
.satie-ep .card .acts{display:flex;gap:6px;margin-top:10px;align-items:center;flex-wrap:wrap}
.satie-ep .card .acts .btn{padding:5px 11px;border-radius:4px}
.satie-ep .card .acts .btn.pri{background:var(--ink);color:#0d0c0b;border-color:var(--ink);box-shadow:none}
.satie-ep .card .bin{all:unset;margin-left:auto;width:26px;height:26px;display:grid;place-items:center;color:var(--danger);border:1px solid rgba(224,112,112,.45);border-radius:4px;cursor:pointer}
.satie-ep .card .ds{font:12px/1.45 'Inter',system-ui,sans-serif;color:var(--ink);opacity:.82;margin-top:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.satie-ep .card .tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px;padding-top:9px;border-top:1px solid var(--hair)}
.satie-ep .card .tags span{font:11px var(--mono);color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.satie-ep .ghost{position:absolute;z-index:4;pointer-events:none;display:flex;align-items:center;gap:7px;font:12px 'Inter',system-ui,sans-serif;background:rgba(13,12,11,.92);border:1px solid var(--sound);border-radius:999px;padding:4px 10px 4px 6px;transform:translate(-12px,-50%)}
.satie-ep .ghost[hidden],.satie-ep .card[hidden],.satie-ep .note[hidden]{display:none}
.satie-ep .ghost i{width:9px;height:9px;border-radius:50%;background:var(--sound)}
.satie-ep .adv{display:flex;gap:6px;flex-wrap:wrap;flex-basis:100%}
.satie-ep .card .acts.use .m{flex-basis:100%;margin-bottom:2px}
.satie-ep .map[data-flow] .topl .hint{display:none}
@keyframes satieEpCall{0%,100%{box-shadow:0 0 0 0 rgba(255,141,161,0),0 8px 22px rgba(0,0,0,.4)}50%{box-shadow:0 0 0 6px rgba(255,141,161,.12),0 8px 22px rgba(0,0,0,.4)}}
.satie-ep .acts2{position:absolute;left:0;right:0;bottom:16px;z-index:4;display:flex;justify-content:center;align-items:center;gap:8px;pointer-events:none}
.satie-ep .acts2>*{pointer-events:auto}
.satie-ep .acts2 .ab{all:unset;pointer-events:auto;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 16px 0 12px;border-radius:999px;border:1px solid rgba(255,141,161,.55);background:rgba(13,12,11,.94);color:var(--ink);font:500 12.5px 'Inter',system-ui,sans-serif;cursor:pointer;transition:transform .25s,border-color .25s,background .25s,box-shadow .25s;box-shadow:0 8px 22px rgba(0,0,0,.4)}
.satie-ep .acts2 .ab .ai{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:rgba(255,141,161,.16);color:var(--sound);font:600 13px var(--mono)}
.satie-ep .acts2 .ab:hover{transform:translateY(-2px);border-color:var(--sound);background:rgba(255,141,161,.1);box-shadow:0 0 0 5px rgba(255,141,161,.1),0 10px 26px rgba(0,0,0,.45)}
.satie-ep .acts2 .ab.q{border-color:var(--line);height:30px;padding:0 13px}
.satie-ep .acts2.call .ab:not(.q){animation:satieEpCall 1.3s ease-in-out 2}
.satie-ep .acts2 .ahint{font:12px var(--mono);color:#f3d7dc;padding:6px 12px;border-radius:999px;background:rgba(13,12,11,.9)}
@media (prefers-reduced-motion: reduce){.satie-ep .acts2.call .ab{animation:none}}
.satie-ep .bench{position:absolute;left:50%;transform:translateX(-50%);bottom:62px;z-index:4;width:min(760px,calc(100% - 110px));padding:8px 10px;border:1px dashed rgba(255,141,161,.45);border-radius:12px;background:rgba(16,15,14,.95);box-shadow:0 12px 30px rgba(0,0,0,.45)}
.satie-ep .bench .bh{display:flex;align-items:baseline;gap:10px;font:500 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#f3d7dc;margin-bottom:6px}
.satie-ep .bench .bh small{letter-spacing:0;text-transform:none;color:var(--mute);font-weight:400}
.satie-ep .bench .bx{all:unset;margin-left:auto;font:11px var(--mono);color:var(--mute);cursor:pointer;text-transform:none;letter-spacing:0}
.satie-ep .bench .br{display:flex;gap:6px;overflow-x:auto}
.satie-ep .bench .bc{flex:none;width:200px;display:flex;align-items:center;gap:6px;padding:5px 6px;border:1px solid var(--line);border-radius:8px;background:rgba(0,0,0,.25)}
.satie-ep .bench .bc.on{border-color:var(--sound)}
.satie-ep .bench .bn{all:unset;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:500 11px var(--mono);color:#0d0c0b;background:var(--sound);cursor:pointer;flex:none}
.satie-ep .bench .bc.on .bn{animation:satieEpCall 1.3s ease-in-out infinite}
.satie-ep .bench .bt{flex:1;min-width:0;font:12px 'Inter',system-ui,sans-serif;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-ep .bench .bi{all:unset;font:11.5px var(--mono);color:var(--mute);cursor:pointer;padding:0 3px}
.satie-ep .bench .bi:hover:not(:disabled){color:var(--ink)}
.satie-ep .bench .bi:disabled{opacity:.3;cursor:default}
.satie-ep .bench .bi.use{color:#f3d7dc}
.satie-ep .flow{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;width:min(560px,calc(100% - 110px));padding:10px 12px 12px;border:1px solid rgba(255,141,161,.45);border-radius:12px;background:rgba(16,15,14,.97);box-shadow:0 14px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px;animation:satieEpRise .3s ease}
.satie-ep .flow .fh{display:flex;align-items:center;font:500 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.satie-ep .flow .fx{all:unset;margin-left:auto;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;color:var(--mute);cursor:pointer;font-size:15px}
.satie-ep .flow .fx:hover{color:var(--ink);background:rgba(235,231,223,.08)}
.satie-ep .flow .fs{display:flex;align-items:flex-start;gap:10px}
.satie-ep .flow .fs .fn{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font:500 11px var(--mono);border:1.5px solid var(--faint);color:var(--mute);margin-top:1px}
.satie-ep .flow .fs.on .fn{background:var(--sound);border-color:var(--sound);color:#0d0c0b}
.satie-ep .flow .fs.done .fn{border-color:var(--sound);color:var(--sound)}
.satie-ep .flow .fs.next{opacity:.45}
.satie-ep .flow .ft{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.satie-ep .flow .ft b{font:500 13px 'Inter',system-ui,sans-serif;color:var(--ink)}
.satie-ep .flow .fs.done .ft b{font-weight:400}
.satie-ep .flow .fsum{font:11.5px var(--mono);color:var(--mute)}
.satie-ep .flow .fch{all:unset;font:11px var(--mono);color:var(--mute);cursor:pointer;align-self:flex-start}
.satie-ep .flow .fch:hover{color:var(--ink)}
.satie-ep .flow .frow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.satie-ep .flow .fi{all:unset;flex:1;min-width:0;font:13px 'Inter',system-ui,sans-serif;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:rgba(0,0,0,.25)}
.satie-ep .flow .fi:focus{border-color:rgba(255,141,161,.6)}
.satie-ep .flow .fchips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.satie-ep .flow .fchips button{all:unset;font:11.5px 'Inter',system-ui,sans-serif;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:4px 10px;cursor:pointer}
.satie-ep .flow .fchips button.on{color:#0d0c0b;background:var(--ink);border-color:var(--ink)}
.satie-ep .flow .fchips .fl{font:11px var(--mono);color:var(--mute)}
.satie-ep .flow .fsel{font:12.5px 'Inter',system-ui,sans-serif;color:var(--ink);background:#1b1a18;border:1px solid var(--line);border-radius:6px;padding:4px 6px;align-self:flex-start}
.satie-ep .flow .fnew{display:flex;flex-direction:column;gap:8px;font:12.5px/1.45 'Inter',system-ui,sans-serif;color:var(--ink);border-left:2px solid var(--sound);padding:2px 0 2px 10px}
.satie-ep .flow .fask{font:11.5px/1.45 var(--mono);color:#f3d7dc;background:rgba(0,0,0,.3);border:1px solid var(--line);border-radius:6px;padding:7px 9px;user-select:text}
.satie-ep .flow .fwait{font:11px var(--mono);color:var(--mute)}
.satie-ep .flow .btn:disabled{opacity:.4;cursor:default}
.satie-ep-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.satie-ep-tools:empty{display:none}
`;
/** A take with no library place of its own sits this far from its sound (px). */
const TAKE_R = 36;
export function createEditPanel(opts = {}) {
    let ctx = null;
    let root = null, canvas = null, g = null;
    let cardEl = null, stripEl = null, aroundEl = null, crumbsEl = null, noteEl = null, ghostEl = null;
    let ix = null, base = '', mapLoad = null;
    let sounds = [], around = [];
    let level = { kind: 'scape' };
    let scapeId = null, offSwitch = null;
    // the camera on the library sky (map units u, v); `plan` keeps only the pan of a drag and whether the view is set
    const plan = { cx: 0, cz: 0, sc: 1, uz: 1, px: 0, pz: 0, ready: false };
    const lib = { cu: 0.5, cv: 0.5, sc: 1, uz: 1, pu: 0, pv: 0 };
    /** One sound in the library: where its audio puts it and its closest recordings (the find's audio search). */
    const near = new Map();
    let hover = null, heardStar = -1, hoverTimer;
    let card = null;
    let cardAt = [0, 0];
    let replacing = null;
    let drag = null;
    let pan = null;
    const ripples = [];
    const lastDb = new Map();
    let raf = 0, poll, fadeAt = 0;
    let playing = null;
    let passLen = Infinity, advanced = false, open = false;
    /** The library's recordings like the open sound are on the map (asked for, to replace or add a take). */
    /** The game's own runs started from the sidebar (the train's pass), by entity. */
    const gameRuns = new Map();
    /** The gold rings when a steered find is open: its candidates, else the closest by audio. */
    let goldIds = null;
    let varEl = null, offVarChange = null;
    let backEl = null;
    let suggesting = false, legendEl = null, sideMode = false, warmCtx = null, menuEl = null;
    /** The soundscape's other sounds round a zoomed-in entity or sound, where they were drawn (to point at). */
    let ctxDrawn = [];
    let adding = null;
    let swap = null;
    /** At an entity, "replace one of its sounds": the next sound opened starts replacing. */
    let swapNext = false;
    let flowEl = null, actEl = null;
    let sketchPlay = null;
    /** The sound whose row the pointer is on in the sidebar, and the take that just played (lit for a moment). */
    let extHot = null, takeLit = null;
    // ── data ──
    function loadMap() {
        mapLoad ??= (async () => {
            const r = await fetch(opts.landscapeUrl ?? '/__satie/landscape').then(x => x.json()).catch(e => ({ ok: false, error: String(e) }));
            if (!r?.ok || !Array.isArray(r.sounds)) {
                mapLoad = null;
                throw new Error(r?.error ?? 'the library map did not load');
            }
            ix = indexMap(r.sounds);
            base = String(r.base ?? '');
        })();
        return mapLoad;
    }
    const scapeDef = () => (scapeId ? ctx?.soundscapes?.()?.variants.soundscapes().find(d => d.id === scapeId) ?? null : null);
    function refresh() {
        if (!ctx)
            return;
        const def = scapeDef();
        // its sounds, and any a variant adds (a copy of one of them at another object, with its own id)
        const ids = def ? new Set([...def.sourceIds, ...(ctx.soundscapes?.()?.variants.variants(def.id) ?? []).flatMap(v => v.moves.flatMap(m => (m.op === 'add' ? [m.sound] : [])))]) : null;
        // the player's own sounds belong to no soundscape; everything else is a star, a bed too (it has a sound)
        // the world's own beds (cicadas, frogs: all around you, in no soundscape) are part of every soundscape's sound
        const inSome = new Set((ctx.soundscapes?.()?.variants.soundscapes() ?? []).flatMap(d => d.sourceIds));
        const mine = ctx.sounds().filter(s => s.where !== 'yours' && (!ids || [s.sourceId, ...(s.copies ?? [])].some(id => ids.has(id)) || (s.where === 'around' && !inSome.has(s.sourceId))));
        // the sound you opened stays drawable even when no soundscape lists it (one you make, "purchase · by you")
        if (level.kind === 'sound') {
            const sid = level.sid;
            if (!mine.some(x => x.sourceId === sid)) {
                const o = ctx.sounds().find(x => x.sourceId === sid || x.copies?.includes(sid));
                if (o)
                    mine.push(o);
            }
        }
        for (const s of mine)
            s.name = tidy(s.name);
        sounds = mine;
        around = [];
        if (ix)
            locateAll();
        for (const s of mine) {
            const was = lastDb.get(s.sourceId) ?? null, now = s.heardDb;
            if (now !== null && (was === null || now - was > 6))
                ripples.push({ sid: s.sourceId, t: performance.now() });
            lastDb.set(s.sourceId, now);
        }
        paintAround();
        // (2026-11-14) sent to a sound that is not in the scene (a stale id from an earlier chat, a removed sound): the mix
        // showed an empty "Sound" with no map; it goes to the soundscape instead
        if (open && sounds.length) {
            const all = ctx.sounds();
            const lost = level.kind === 'sound' ? !all.some(x => x.sourceId === level.sid || x.copies?.includes(level.sid)) : level.kind === 'thing' ? !all.some(x => x.thing.key === level.key) : false;
            if (lost) {
                go({ kind: 'scape' });
                return;
            }
        }
        if (open)
            ctx.onLevel?.(levelInfo());
    }
    const soundOf = (sid) => sounds.find(s => s.sourceId === sid) ?? around.find(s => s.sourceId === sid);
    const thingSounds = (key) => sounds.filter(s => s.thing.key === key);
    /** A thing's name, a class with how many instances it has ("Car ×62"). */
    const nameOfThing = (t) => `${cap(t.label)}${t.count && t.count > 1 ? ` ×${t.count}` : ''}`;
    const thingLabel = (key) => { const t = sounds.find(s => s.thing.key === key)?.thing; return t ? nameOfThing(t) : 'Thing'; };
    const recOf = (i) => { const s = ix.sounds[i]; return { url: base + s.f, name: s.n, license: s.l, sampleId: s.id }; };
    const hearUrl = (i) => { const s = ix.sounds[i]; return base + (s.s ?? s.f); };
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    /** A name said twice ("train horn train horn") is said once. */
    const tidy = (n) => { const w = n.trim().split(/\s+/), h = w.length / 2; return w.length % 2 === 0 && w.slice(0, h).join(' ').toLowerCase() === w.slice(h).join(' ').toLowerCase() ? w.slice(0, h).join(' ') : n; };
    /** One space at every level (the library sky); the plan of the game was retired 2026-11-12. */
    const inPlan = () => false;
    /** Ask once where a sound sits by its audio: its library take if it has one, else its nearest recordings. */
    // v2 (2026-11-13): places remembered before the limit fix were word guesses; they are asked again
    const memKey = (s) => `satie-mix-place2:${s.sourceId}:${s.takes[0]?.key ?? ''}`;
    function remembered(s) {
        try {
            const r = JSON.parse(localStorage.getItem(memKey(s)) ?? 'null');
            if (!r || !ix)
                return null;
            return { u: r.u, v: r.v, near: r.near.map(id => ix.byId.get(id)).filter((i) => i !== undefined) };
        }
        catch {
            return null;
        }
    }
    function remember(s, e) {
        try {
            localStorage.setItem(memKey(s), JSON.stringify({ u: e.u, v: e.v, near: e.near.slice(0, 12).map(i => ix.sounds[i].id) }));
        }
        catch { /* private mode: asked again next time */ }
    }
    function locate(sid, done) {
        const cx = ctx ?? warmCtx;
        if (!ix || !cx || near.has(sid)) {
            done?.();
            return;
        }
        const s = soundOf(sid);
        if (!s) {
            done?.();
            return;
        }
        // (2026-11-13) the same recordings are the same sound to the ear: it sits where its twin does (the crossing's two
        // bells, one take each, sat far apart when each was searched on its own)
        const twinKey = s.takes.map(t => t.key).join('|'), twin = twinKey ? sounds.find(o => o.sourceId !== sid && o.takes.map(t => t.key).join('|') === twinKey && near.get(o.sourceId) && !near.get(o.sourceId).loading) : undefined;
        if (twin) {
            const t = near.get(twin.sourceId);
            near.set(sid, { u: t.u, v: t.v, near: t.near, loading: false, byWords: t.byWords });
            done?.();
            return;
        }
        const mem = remembered(s);
        if (mem) {
            near.set(sid, { ...mem, loading: false, byWords: false });
            done?.();
            return;
        }
        const own = s.takes.map(t => (t.sampleId ? ix.byId.get(t.sampleId) : undefined)).find((i) => i !== undefined);
        const guess = placeSound(ix, s);
        const start = own !== undefined ? { u: ix.xy[own * 2], v: ix.xy[own * 2 + 1] } : guess ? { u: guess.u, v: guess.v } : { u: 0.5, v: 0.5 };
        near.set(sid, { ...start, near: [], loading: true, byWords: own === undefined });
        // satie_find gives at most 12 (asking for 16 failed every search, and every sound fell back to its words)
        void cx.near(sid, 12).then(recs => {
            const found = recs.map(r => (r.sampleId ? ix.byId.get(r.sampleId) : undefined)).filter((i) => i !== undefined);
            const e = near.get(sid);
            if (!e)
                return;
            if (own === undefined && found.length) {
                // it sits on the recording that sounds most like it (a middle of several can land between clusters)
                e.u = ix.xy[found[0] * 2];
                e.v = ix.xy[found[0] * 2 + 1];
                e.byWords = false;
            }
            e.near = found.filter(i => i !== own);
            e.loading = false;
            if (!found.length && guess) {
                e.near = guess.near.filter(i => i !== own);
            }
            // remembered only when the library answered (a failed search is asked again next time, never kept as a guess)
            if (found.length || own !== undefined)
                remember(s, e);
            // its twins (the same takes) asked meanwhile take its place, so they never sit apart
            for (const o of sounds)
                if (o.sourceId !== sid && twinKey && o.takes.map(t => t.key).join('|') === twinKey) {
                    const oe = near.get(o.sourceId);
                    if (oe) {
                        oe.u = e.u;
                        oe.v = e.v;
                        oe.near = e.near;
                        oe.loading = false;
                    }
                }
            if (noteEl && level.kind === 'sound' && level.sid === sid)
                noteEl.hidden = true;
        }).catch(() => { const e = near.get(sid); if (e)
            e.loading = false; }).finally(() => done?.());
    }
    /** Every sound's place by its audio, four searches at a time; a word guess until each answers. */
    let locating = 0;
    function locateAll() {
        if (!ix)
            return;
        while (locating < 4) {
            const next = sounds.find(s => !near.has(s.sourceId));
            if (!next)
                return;
            locating++;
            locate(next.sourceId, () => { locating--; locateAll(); });
        }
    }
    // ── the constellation: the soundscape's sounds on the library sky, each where its audio puts it ──
    const size = () => { const r = canvas.getBoundingClientRect(); return { W: r.width, H: r.height, B: Math.min(r.width, r.height) }; };
    /** Where each sound is drawn, eased: it glides from its first guess to its place by audio. */
    const starAt = new Map();
    /** How far a thing's sounds may sit from it, in map units: the library can set them far apart (a horn among horns, the rails among rails); the distance squeezes, the direction stays. */
    const SQUEEZE = 0.028, NEAR_SQUEEZE = 0.02;
    const squeeze = (o, p, r) => { const dx = p[0] - o[0], dy = p[1] - o[1], d = Math.hypot(dx, dy); if (d < 1e-9)
        return [p[0], p[1]]; const k = r * Math.tanh(d / r) / d; return [o[0] + dx * k, o[1] + dy * k]; };
    /** Where each sound is drawn this frame: its thing's middle star where it is, the others squeezed round it. */
    const shown = new Map();
    function squeezeAll() {
        shown.clear();
        for (const gr of groups()) {
            const ps = gr.sids.flatMap(sid => { const p = starAt.get(sid); return p ? [[sid, p]] : []; });
            if (!ps.length)
                continue;
            const mx = ps.reduce((q, x) => q + x[1][0], 0) / ps.length, my = ps.reduce((q, x) => q + x[1][1], 0) / ps.length;
            const anchor = ps.reduce((b, x) => (Math.hypot(x[1][0] - mx, x[1][1] - my) < Math.hypot(b[1][0] - mx, b[1][1] - my) ? x : b))[1];
            for (const [sid, p] of ps)
                shown.set(sid, squeeze(anchor, p, SQUEEZE));
        }
    }
    /** Until every sound has its place the stars wait (they appear placed, not built in front of you). */
    let placed = false, openedAt = 0;
    const allPlaced = () => sounds.length > 0 && sounds.every(s => { const e = near.get(s.sourceId); return !!e && !e.loading; });
    /** A thing is its sounds; "the scene" is not a thing, so each of its sounds stands alone. */
    function groups() {
        const m = new Map();
        for (const s of sounds) {
            const k = s.thing.label === 'the scene' ? `solo:${s.sourceId}` : s.thing.key;
            const l = m.get(k);
            if (l)
                l.push(s);
            else
                m.set(k, [s]);
        }
        // a sound on no entity is named by itself; an entity (one sound or five, one instance or a class) by the entity
        return [...m].map(([key, ss]) => ({ key, label: ss[0].thing.label === 'the scene' ? cap(ss[0].name) : nameOfThing(ss[0].thing), sids: ss.map(s => s.sourceId) }));
    }
    let skyDrawn = [];
    function drawFaint(a) {
        const G = g, { W, H } = size();
        if (!ix)
            return;
        G.fillStyle = INK;
        G.globalAlpha = a;
        for (let i = 0; i < ix.sounds.length; i++) {
            const [x, y] = toL(ix.xy[i * 2], ix.xy[i * 2 + 1]);
            if (x < -4 || y < -4 || x > W + 4 || y > H + 4)
                continue;
            G.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
        }
        G.globalAlpha = 1;
    }
    /** A sound all around you (a bed) is diffuse: a soft halo, always. A point sound has none; heard, it is just brighter. */
    function haloAt(x, y, s, scale = 1) {
        if (s.where !== 'around')
            return;
        const G = g, R = 26 * scale, gl = G.createRadialGradient(x, y, 0, x, y, R);
        gl.addColorStop(0, `rgba(255,141,161,${s.heardDb !== null ? 0.4 : 0.22})`);
        gl.addColorStop(1, 'rgba(255,141,161,0)');
        G.fillStyle = gl;
        G.beginPath();
        G.arc(x, y, R, 0, 6.283);
        G.fill();
    }
    /** The library map round a sound: its nearest recordings on the map, at their true direction, the distance through a fisheye (at most R px). */
    const lensCache = new Map();
    function lensOf(sid, m) {
        const e = near.get(sid);
        if (!e || !ix)
            return null;
        const at = `${e.u.toFixed(5)},${e.v.toFixed(5)}:${m}`, c = lensCache.get(sid);
        if (c && c.at === at)
            return c;
        const all = [];
        for (let i = 0; i < ix.sounds.length; i++) {
            const dx = ix.xy[i * 2] - e.u, dy = ix.xy[i * 2 + 1] - e.v, d = Math.hypot(dx, dy);
            if (d < 0.3 && d > 1e-7)
                all.push({ i, dx, dy, d });
        }
        all.sort((a, b) => a.d - b.d);
        // r is the m-th nearest (today's lens); the pool goes deeper, for the recordings zooming in brings in (2026-11-13)
        const r = Math.max(0.004, all[Math.min(m, all.length) - 1]?.d ?? 0.02), pts = all.slice(0, Math.max(m * 8, 1600));
        const out = { at, pts, r };
        lensCache.set(sid, out);
        return out;
    }
    let lensDrawn = [];
    /**
     * Zoom opens the neighbourhood (2026-11-13): `spread()` is how far in you have zoomed (1 at the level's own view, never
     * below). The fisheye's reach grows with it and its inner slope by its square root, so close recordings move apart and
     * the ones just past the edge come in: zooming in goes into the cluster instead of only enlarging the dot. At 1 it is
     * today's lens exactly.
     */
    const spread = () => Math.min(28, Math.pow(Math.max(1, lib.uz), 0.9));
    const lensPos = (from, dx, dy, d, r, R, min = 0, g = spread()) => { const sd = min + (R - min) * g * Math.tanh((d / (r * Math.sqrt(g))) * 1.3) / Math.tanh(1.3); return [from[0] + dx / (d || 1e-9) * sd, from[1] + dy / (d || 1e-9) * sd]; };
    function drawLens(sid, from, m, R, labels, min = 0, fade = 1) {
        const G = g, L = lensOf(sid, m);
        if (!L)
            return;
        const own = new Set((soundOf(sid)?.takes ?? []).map(t => t.sampleId).filter((x) => !!x));
        // the gold suggestions are drawn as gold rings, not again as lens dots
        if (suggesting && level.kind === 'sound' && level.sid === sid)
            for (const i of goldOf(sid))
                own.add(ix.sounds[i].id);
        const reach = L.r * Math.sqrt(spread()) * 1.02;
        for (const p of L.pts) {
            if (p.d > reach)
                break;
            if (own.has(ix.sounds[p.i].id))
                continue;
            const at = lensPos(from, p.dx, p.dy, p.d, L.r, R, min), hot = hover?.kind === 'star' && hover.i === p.i, f = Math.hypot(at[0] - from[0], at[1] - from[1]) / (R * spread());
            lensDrawn.push({ i: p.i, at });
            G.fillStyle = hot ? '#f3d7dc' : INK;
            G.globalAlpha = hot ? 1 : (0.1 + 0.36 * Math.pow(Math.max(0, 1 - f), 0.8)) * fade;
            G.beginPath();
            G.arc(at[0], at[1], hot ? 7 : 4.4, 0, 6.283);
            G.fill();
            if (hot)
                labels.push({ text: ix.sounds[p.i].n, x: at[0] + 8, y: at[1] + 4, rank: 3.5, alpha: 1, strong: false });
        }
        G.globalAlpha = 1;
    }
    /** SATIE's new sounds as rings in an arc above what you look at (the sound, else the middle of the view), named. */
    function drawExtra(now) {
        extraDrawn = [];
        if (!offerExtra.length || !g)
            return;
        const G = g, { W, H } = size();
        let c = [W / 2, H / 2];
        if (level.kind === 'sound') {
            const e = near.get(level.sid), sp = shown.get(level.sid) ?? (e ? [e.u, e.v] : null);
            if (sp)
                c = toL(sp[0], sp[1]);
        }
        const R = Math.min(170, Math.min(W, H) * 0.3), n = offerExtra.length;
        const labels = [];
        offerExtra.forEach((x, k) => {
            const a = -Math.PI / 2 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * Math.PI * 0.9), at = [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
            extraDrawn.push({ n: k, at });
            const hot = hover?.kind === 'extra' && hover.n === k, armed = extraArmed === k;
            G.strokeStyle = 'rgba(232,194,122,.18)';
            G.lineWidth = 1;
            G.beginPath();
            G.moveTo(c[0], c[1]);
            G.lineTo(at[0], at[1]);
            G.stroke();
            const gl = G.createRadialGradient(at[0], at[1], 0, at[0], at[1], 26);
            gl.addColorStop(0, `rgba(232,194,122,${hot || armed ? 0.45 : 0.22})`);
            gl.addColorStop(1, 'rgba(232,194,122,0)');
            G.fillStyle = gl;
            G.beginPath();
            G.arc(at[0], at[1], 26, 0, 6.283);
            G.fill();
            G.save();
            G.translate(at[0], at[1]);
            G.rotate(now / 1400 + k);
            G.strokeStyle = armed ? ROSE : GOLD;
            G.lineWidth = hot || armed ? 2.4 : 1.8;
            G.setLineDash(armed ? [] : [4, 3.2]);
            G.beginPath();
            G.arc(0, 0, hot ? 14 : 12, 0, 6.283);
            G.stroke();
            G.restore();
            G.fillStyle = armed ? ROSE : GOLD;
            G.beginPath();
            G.arc(at[0], at[1], 5, 0, 6.283);
            G.fill();
            labels.push({ text: armed ? `${x.name} · click again to use` : `${x.name} · new`, x: at[0], y: at[1] - 22, rank: 4, alpha: 1, strong: true, size: 12.5 });
        });
        drawLabels(labels, extraDrawn.map(d => [d.at[0] - 14, d.at[1] - 14, d.at[0] + 14, d.at[1] + 14]));
    }
    /** The groups worth naming: those of two or more, at most four (the rest are rings without a name). */
    const namedClusters = () => (adding?.clusters ?? []).map((c, n) => ({ c, n })).filter(x => x.c.idx.length > 1).slice(0, 4);
    /**
     * Where a ring is drawn: on the whole map where it sits; in the group you opened, spread round the group's middle in
     * its true direction, nearest first (they sat in a line, one on another: 2026-11-13).
     */
    function ringAt(i) {
        const real = toL(ix.xy[i * 2], ix.xy[i * 2 + 1]);
        const c = adding && adding.focus !== null ? adding.clusters[adding.focus] : null;
        if (!c || !c.idx.includes(i))
            return real;
        const mid = toL(c.u, c.v), order = [...c.idx].sort((p, q) => Math.hypot(ix.xy[p * 2] - c.u, ix.xy[p * 2 + 1] - c.v) - Math.hypot(ix.xy[q * 2] - c.u, ix.xy[q * 2 + 1] - c.v));
        const k = order.indexOf(i), dx = ix.xy[i * 2] - c.u, dy = ix.xy[i * 2 + 1] - c.v, d = Math.hypot(dx, dy);
        const a = d > 1e-7 ? Math.atan2(dy, dx) + k * 0.35 : k * 2.39996, r = 46 + 34 * Math.sqrt(k);
        return [mid[0] + Math.cos(a) * r, mid[1] + Math.sin(a) * r];
    }
    /** Adding: the library's answers as gold rings; the whole map names a few groups (click one to open it). */
    function drawAdd(now) {
        const G = g;
        if (!ix || !adding || adding.step < 2) {
            nbDrawn = [];
            return;
        }
        nbDrawn = [];
        const labels = [];
        const show = adding.focus !== null ? adding.clusters[adding.focus]?.idx ?? adding.results : adding.results;
        if (adding.focus === null)
            for (const { c, n } of namedClusters()) {
                const hotC = hover?.kind === 'cluster' && hover.c === n, [cx, cy] = toL(c.u, c.v), { B } = size(), rr = Math.max(30, c.r * B * lib.sc * lib.uz + 24);
                G.fillStyle = `rgba(232,194,122,${hotC ? 0.1 : 0.05})`;
                G.strokeStyle = `rgba(232,194,122,${hotC ? 0.6 : 0.3})`;
                G.lineWidth = 1.2;
                G.setLineDash([5, 5]);
                G.beginPath();
                G.arc(cx, cy, rr, 0, 6.283);
                G.fill();
                G.stroke();
                G.setLineDash([]);
                labels.push({ text: `${c.label} · ${c.idx.length}`, x: cx, y: cy - rr - 9, rank: hotC ? 4 : 3.2, alpha: 1, strong: true, size: 13.5, hit: { kind: 'cluster', c: n } });
            }
        for (const i of show) {
            const [x, y] = ringAt(i), hot = hover?.kind === 'star' && hover.i === i, mine = adding.pick === i;
            nbDrawn.push({ i, at: [x, y] });
            const gl = G.createRadialGradient(x, y, 0, x, y, 24);
            gl.addColorStop(0, `rgba(232,194,122,${hot ? 0.45 : 0.2})`);
            gl.addColorStop(1, 'rgba(232,194,122,0)');
            G.fillStyle = gl;
            G.beginPath();
            G.arc(x, y, 24, 0, 6.283);
            G.fill();
            G.save();
            G.translate(x, y);
            G.rotate(now / 1400 + i);
            G.strokeStyle = mine ? ROSE : GOLD;
            G.lineWidth = hot || mine ? 2.4 : 1.7;
            G.setLineDash(mine ? [] : [4, 3.2]);
            G.beginPath();
            G.arc(0, 0, hot ? 13 : 11, 0, 6.283);
            G.stroke();
            G.restore();
            G.fillStyle = mine ? ROSE : GOLD;
            G.beginPath();
            G.arc(x, y, mine ? 6.5 : 4.5, 0, 6.283);
            G.fill();
            if (hot || mine || adding.focus !== null)
                labels.push({ text: ix.sounds[i].n, x: x + 16, y: y + 4, rank: hot || mine ? 3.6 : 1.2, alpha: hot || mine ? 1 : 0.7, strong: false });
        }
        drawLabels(labels, nbDrawn.map(c => [c.at[0] - 12, c.at[1] - 12, c.at[0] + 12, c.at[1] + 12]));
    }
    function drawSky(now) {
        const G = g;
        if (!ix)
            return;
        // the library behind the soundscape, very faint; inside an entity only the soundscape's own sounds
        if (level.kind === 'scape')
            drawFaint(adding ? 0.3 : 0.16);
        if (adding && level.kind === 'scape')
            drawAdd(now);
        if (!placed)
            return;
        const open = level.kind === 'thing' ? level.key : null, hotSid = hover?.kind === 'dot' ? hover.sid : extHot;
        const out = [], labels = [];
        const all = groups().map(gr => ({ gr, stars: gr.sids.flatMap(sid => { const p = shown.get(sid); return p ? [{ sid, at: toL(p[0], p[1]) }] : []; }) })).filter(x => x.stars.length);
        // an entity open: only it, and round each of its sounds that sound's own neighbourhood on the library map
        if (open) {
            const keep = all.filter(x => x.gr.key === open);
            all.length = 0;
            all.push(...keep);
        }
        // under each of its sounds, the library map round it (a lens): what it sits among, to point at and hear
        if (open) {
            lensDrawn = [];
            for (const x of all)
                for (const st of x.stars)
                    drawLens(st.sid, st.at, 40, 80, labels, 18, 0.55);
        }
        // two sounds of one entity on one spot (the same recording, front and rear wheels) are drawn apart
        for (const { stars } of all)
            for (let i = 1; i < stars.length; i++)
                for (let j = 0; j < i; j++) {
                    const a = stars[i].at, b = stars[j].at;
                    if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 24)
                        continue;
                    const t = i * 2.39996;
                    stars[i].at = [b[0] + Math.cos(t) * 30, b[1] + Math.sin(t) * 30];
                }
        for (const { gr, stars } of all) {
            const lit = !open || gr.key === open, hot = (hover?.kind === 'thing' && hover.key === gr.key) || stars.some(s => s.sid === hotSid);
            const dim = (lit ? 1 : hot ? 0.75 : 0.32) * (adding ? (adding.focus !== null ? 0.25 : 0.5) : 1);
            G.globalAlpha = dim;
            // an entity's sounds joined by a thread: one entity, wherever its sounds sit
            // an entity's sounds joined by a clear thread: you see at a glance which dots are one thing
            if (stars.length > 1) {
                G.strokeStyle = `rgba(255,141,161,${hot || gr.key === open ? 0.75 : lit ? 0.42 : 0.12})`;
                G.lineWidth = hot ? 1.8 : 1.4;
                for (const [i, j] of spanningTree(stars.map(s => s.at))) {
                    G.beginPath();
                    G.moveTo(stars[i].at[0], stars[i].at[1]);
                    G.lineTo(stars[j].at[0], stars[j].at[1]);
                    G.stroke();
                }
            }
            for (const st of stars) {
                const s = soundOf(st.sid), heard = s.heardDb !== null, sHot = st.sid === hotSid, [x, y] = st.at;
                if (lit)
                    haloAt(x, y, s, gr.key === open ? 1.3 : 1);
                G.fillStyle = ROSE;
                G.globalAlpha = dim * (heard || sHot ? 1 : 0.8);
                // (2026-11-13) bigger: a sound is something to point at, not a speck
                const r = gr.key === open ? (sHot ? 15 : 13) : lit ? (sHot ? 10.5 : 8.5) : (sHot ? 7.5 : 5.5);
                G.beginPath();
                G.arc(x, y, r, 0, 6.283);
                G.fill();
                G.globalAlpha = dim;
                // a sound's own name inside the open entity, or when you point at it
                if ((stars.length > 1 && gr.key === open) || sHot)
                    labels.push({ text: s.name, x: x + (gr.key === open ? 20 : 15), y: y + 5, rank: sHot ? 3 : 1.5, alpha: 0.95, strong: false, size: gr.key === open ? 15 : 12.5 });
            }
            // one name per entity, under the star nearest the middle of its sounds
            const mx = stars.reduce((q, s) => q + s.at[0], 0) / stars.length, my = stars.reduce((q, s) => q + s.at[1], 0) / stars.length;
            const anchor = stars.reduce((b, s) => (Math.hypot(s.at[0] - mx, s.at[1] - my) < Math.hypot(b.at[0] - mx, b.at[1] - my) ? s : b));
            // an entity's name goes under its lowest star (under the middle one it sat on its own lower star, the vending
            // machine's three in a column, and was dropped as blocked), or above its highest when that is taken (2026-11-13)
            const ys = stars.map(st => st.at[1]), gap = lit ? 30 : 22;
            const labelAt = stars.length > 1 ? [mx, Math.max(...ys) + gap] : [anchor.at[0], anchor.at[1] + gap];
            // then right of its rightmost star, then left of its leftmost, level with the stars (2026-11-13: dense clusters)
            const xs = stars.map(st => st.at[0]), wl = gr.label.length * 7.2 / 2 + 14;
            const labelAlt = stars.length > 1 ? [[mx, Math.min(...ys) - gap + 8], [Math.max(...xs) + wl, my + 4], [Math.min(...xs) - wl, my + 4]] : [];
            const memberNamed = stars.length > 1 && stars.some(st => st.sid === hotSid);
            // every entity is named (its sounds are not, until you point); a sound on no entity is named smaller and quieter
            const entity = stars.length > 1;
            if (gr.key !== open && !memberNamed)
                labels.push({ text: gr.label, x: labelAt[0], y: labelAt[1], alts: labelAlt, hit: entity ? { kind: 'thing', key: gr.key } : { kind: 'dot', sid: stars[0].sid }, rank: entity ? (hot ? 2.9 : 2.2) : hot ? 2.6 : 1, alpha: lit ? (entity ? (hot ? 1 : 0.95) : hot ? 0.95 : 0.6) : hot ? 0.9 : 0.38, strong: true, size: entity ? 13.5 : 11.5 });
            out.push({ key: gr.key, label: gr.label, labelAt, stars });
        }
        G.globalAlpha = 1;
        skyDrawn = out;
        if (!adding)
            nbDrawn = [];
        drawLabels(labels, out.flatMap(d => d.stars.map(s => [s.at[0] - 10, s.at[1] - 10, s.at[0] + 10, s.at[1] + 10])));
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i], u = (now - r.t) / 1600;
            if (u > 1) {
                ripples.splice(i, 1);
                continue;
            }
            const at = r.sid ? out.flatMap(d => d.stars).find(st => st.sid === r.sid)?.at : null;
            if (!at)
                continue;
            ring(at, 10 + (1 - Math.pow(1 - u, 3)) * 30, (1 - u) * 0.5);
        }
    }
    /** The labels shown last frame: they keep their place against newcomers (two names fighting for one spot flickered). */
    let labelsShown = new Set();
    /** Names drawn this frame and what each opens (2026-11-13): a click on a name wins over the dots under it. */
    let labelHits = [];
    function drawLabels(ls, blocked = []) {
        const G = g, taken = [], hit = (r, q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1];
        const next = new Set();
        for (const l of ls.sort((a, b) => (b.rank + (labelsShown.has(b.text) ? 0.4 : 0)) - (a.rank + (labelsShown.has(a.text) ? 0.4 : 0)))) {
            const size = l.size ?? 12.5;
            G.font = l.mono ? `${size}px IBM Plex Mono, monospace` : `${l.strong ? 500 : 400} ${size}px Inter, system-ui, sans-serif`;
            const w = G.measureText(l.text).width;
            // one name per dot: a recording drawn twice (a gold ring over its lens dot) is named once
            if (next.has(l.text))
                continue;
            let placed = null;
            for (const [px, py] of [[l.x, l.y], ...(l.alts ?? [])]) {
                const x0 = l.strong ? px - w / 2 : px, r = [x0 - 3, py - size, x0 + w + 3, py + 4];
                if (l.rank >= 3 || !(taken.some(q => hit(r, q)) || blocked.some(q => hit(r, q)))) {
                    placed = { x0, y: py, r };
                    break;
                }
            }
            if (!placed)
                continue;
            taken.push(placed.r);
            next.add(l.text);
            if (l.hit)
                labelHits.push({ r: placed.r, hit: l.hit });
            G.globalAlpha = l.alpha;
            // a dark edge round every name, so a word over the library's pale dots still reads (2026-11-13)
            G.lineJoin = 'round';
            G.strokeStyle = 'rgba(13,12,11,.92)';
            G.lineWidth = 4.5;
            G.strokeText(l.text, placed.x0, placed.y);
            G.fillStyle = l.mono ? MUTE : INK;
            G.fillText(l.text, placed.x0, placed.y);
        }
        labelsShown = next;
        G.globalAlpha = 1;
    }
    // (a ripple stamped a moment ahead of this frame has a negative age: never a negative radius, which throws)
    const ring = (at, r, a) => { if (!(r > 0) || !(a > 0))
        return; const G = g; G.strokeStyle = `rgba(255,141,161,${a.toFixed(3)})`; G.lineWidth = 1.1; G.beginPath(); G.arc(at[0], at[1], r, 0, 6.283); G.stroke(); };
    // ── the library: one sound, where its audio puts it ──
    const toL = (u, v) => { const { W, H, B } = size(), s = lib.sc * lib.uz; return [W / 2 + (u - lib.cu - lib.pu) * B * s, H / 2 + (v - lib.cv - lib.pv) * B * s]; };
    function libTarget() {
        if (!ix)
            return lib;
        if (adding && adding.step >= 2 && level.kind === 'scape' && adding.results.length) {
            // adding: the view goes to the library's answers (the cluster you chose, else all of them)
            // the whole map's answers first (a few groups named); a group opened, its middle (its rings spread round it)
            const c = adding.focus !== null ? adding.clusters[adding.focus] : null;
            const idx = adding.results, xs = idx.map(i => ix.xy[i * 2]), ys = idx.map(i => ix.xy[i * 2 + 1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const whole = Math.min(30, 1 / (Math.max(x1 - x0, y1 - y0, 0.08) * 1.5));
            if (c)
                return { cu: c.u, cv: c.v, sc: Math.min(40, whole * 2.6) };
            return { cu: (x0 + x1) / 2, cv: (y0 + y1) / 2, sc: whole };
        }
        if (level.kind !== 'sound') {
            const pool = level.kind === 'thing' ? thingSounds(level.key) : sounds;
            const ps = pool.map(s => shown.get(s.sourceId)).filter((p) => !!p);
            if (!ps.length)
                return { cu: 0.5, cv: 0.5, sc: 1 };
            const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            // fit its dots: an entity fills the view (a few dots close in, more spread wider), the soundscape a little looser
            return { cu: (x0 + x1) / 2, cv: (y0 + y1) / 2, sc: Math.min(90, 1 / (Math.max(x1 - x0, y1 - y0, level.kind === 'thing' ? 0.004 * ps.length : 0.06) * (level.kind === 'thing' ? 2.3 : 1.35))) };
        }
        const e = near.get(level.sid);
        if (!e)
            return lib;
        // the sound in the middle, its closest recordings squeezed round it, all in view
        const h = shown.get(level.sid) ?? [e.u, e.v];
        return { cu: h[0], cv: h[1], sc: 1 / (NEAR_SQUEEZE * 3.2) };
    }
    /**
     * Where a take is drawn (2026-11-13): a library recording sits where it is on the library map, through the same lens
     * as everything round the sound, joined to it by a spoke (a recording you added stays where you saw it); a take with
     * no place of its own (a generated one, or the recording the sound itself sits on) keeps a small ring round it.
     */
    function takeAtRaw(s, k, hub) {
        const e = near.get(s.sourceId), sa = s.takes[k]?.sampleId, i = sa && ix ? ix.byId.get(sa) : undefined;
        if (e && i !== undefined && level.kind === 'sound') {
            const dx = ix.xy[i * 2] - e.u, dy = ix.xy[i * 2 + 1] - e.v, d = Math.hypot(dx, dy), L = lensOf(s.sourceId, 260);
            if (L && d > 1e-6) {
                const { B } = size();
                return lensPos(hub, dx, dy, d, L.r, Math.min(B * 0.46, 320), TAKE_R + 16);
            }
        }
        const a = k * 2.2 + 0.5 + (s.takes.length > 3 ? k * 0.3 : 0), r = TAKE_R;
        return [hub[0] + Math.cos(a) * r, hub[1] + Math.sin(a) * r];
    }
    /**
     * Takes told apart (2026-11-13): two takes whose rings land on one spot (take 1 and take 6 on the same recording's
     * place) fan out round their shared centre, just far enough to tell, each joined by a faint line to where it really
     * is; its number goes outward. Deterministic: the same takes always fan the same way.
     */
    const TAKE_GAP = 2 * 9.5 + 4;
    function takesFanned(s, hub) {
        const raw = s.takes.map((_, k) => takeAtRaw(s, k, hub)), n = raw.length, root = raw.map((_, i) => i);
        const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
        for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++)
                if (Math.hypot(raw[i][0] - raw[j][0], raw[i][1] - raw[j][1]) < TAKE_GAP)
                    root[find(j)] = find(i);
        const out = raw.map(r => ({ at: r, raw: r, dir: null }));
        const groups = new Map();
        raw.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
        for (const ks of groups.values()) {
            if (ks.length < 2)
                continue;
            const cx = ks.reduce((q, i) => q + raw[i][0], 0) / ks.length, cy = ks.reduce((q, i) => q + raw[i][1], 0) / ks.length;
            const R = Math.max(TAKE_GAP / 2, TAKE_GAP / (2 * Math.sin(Math.PI / ks.length)));
            ks.forEach((i, j) => { const a = -Math.PI / 2 + (j * 2 * Math.PI) / ks.length, d = [Math.cos(a), Math.sin(a)]; out[i] = { at: [cx + d[0] * R, cy + d[1] * R], raw: raw[i], dir: d }; });
        }
        return out;
    }
    function takeAt(s, k, hub) { return takesFanned(s, hub)[k]?.at ?? takeAtRaw(s, k, hub); }
    const NEAR_SHOWN = 5, NEAR_AROUND = 12;
    /** The gold suggestions, where they were drawn: to point at and hear. */
    let nbDrawn = [];
    /**
     * A sound's neighbourhood on the library map: its closest recordings at their true direction, the distance
     * squeezed, as small quiet dots joined to it (they are the library, not yours); the one you point at is named.
     */
    function drawLibrary(now) {
        const G = g;
        if (!ix || level.kind !== 'sound')
            return;
        const sid = level.sid, s = soundOf(sid), e = near.get(sid);
        if (!s || !e)
            return;
        const { B } = size();
        const labels = [];
        const sp = shown.get(sid) ?? [e.u, e.v], hub = toL(sp[0], sp[1]), pulse = (now / 1000 % 1.4) / 1.4;
        ctxDrawn = [];
        // the library map round it (a lens, point to hear any recording); asked for, the five that sound most like it turn gold
        nbDrawn = [];
        lensDrawn = [];
        const LR = Math.min(B * 0.46, 320);
        drawLens(sid, hub, 140, LR, labels, TAKE_R + 16);
        // (2026-11-13) what is round it, said in a few words: the library's neighbourhood in groups, each named where it is
        {
            const L0 = lensOf(sid, 140);
            if (L0 && ix) {
                const pts = L0.pts.filter(p0 => p0.d <= L0.r * Math.sqrt(spread()) * 1.02).slice(0, 140);
                const cs = clusterResults(ix, pts.map(p0 => p0.i), s.name, 0.012).filter(c => c.idx.length >= 6).slice(0, 4);
                for (const c of cs) {
                    const dx = c.u - e.u, dy = c.v - e.v, d = Math.hypot(dx, dy);
                    if (d < 1e-6)
                        continue;
                    const at = lensPos(hub, dx, dy, d, L0.r, LR, TAKE_R + 16);
                    labels.push({ text: c.label, x: at[0], y: at[1] - 16, rank: 1.1, alpha: 0.6, strong: true, size: 12 });
                }
            }
        }
        const Ls = lensOf(sid, 260);
        if (suggesting && Ls)
            goldOf(sid).map(i => { const dx = ix.xy[i * 2] - e.u, dy = ix.xy[i * 2 + 1] - e.v; return { i, at: lensPos(hub, dx, dy, Math.hypot(dx, dy), Ls.r, LR, TAKE_R + 16) }; }).forEach(({ i, at: [x, y] }, n) => {
                const hot = hover?.kind === 'star' && hover.i === i;
                nbDrawn.push({ i, at: [x, y] });
                G.strokeStyle = 'rgba(232,194,122,.16)';
                G.lineWidth = 1;
                G.beginPath();
                G.moveTo(hub[0], hub[1]);
                G.lineTo(x, y);
                G.stroke();
                const gl = G.createRadialGradient(x, y, 0, x, y, 20);
                gl.addColorStop(0, `rgba(232,194,122,${hot ? 0.4 : 0.22})`);
                gl.addColorStop(1, 'rgba(232,194,122,0)');
                G.fillStyle = gl;
                G.beginPath();
                G.arc(x, y, 20, 0, 6.283);
                G.fill();
                G.save();
                G.translate(x, y);
                G.rotate(now / 1400 + n * 1.3);
                G.strokeStyle = GOLD;
                G.lineWidth = hot ? 1.8 : 1.4;
                G.setLineDash([4, 3.2]);
                G.beginPath();
                G.arc(0, 0, hot ? 12 : 10, 0, 6.283);
                G.stroke();
                G.restore();
                G.fillStyle = GOLD;
                G.globalAlpha = hot ? 1 : 0.85;
                G.beginPath();
                G.arc(x, y, 3.6, 0, 6.283);
                G.fill();
                G.globalAlpha = 1;
                labels.push({ text: ix.sounds[i].n, x: x + 13, y: y + 4, rank: hot ? 3.5 : 1.4, alpha: hot ? 1 : 0.75, strong: false });
            });
        haloAt(hub[0], hub[1], s, 1.6);
        // its takes, only when there is more than one: rings round it, each its own shade, numbered (one take is the sound itself)
        const fanned = s.takes.length > 1 ? takesFanned(s, hub) : [];
        if (s.takes.length > 1)
            s.takes.forEach((_, k) => {
                const lit = !!takeLit && takeLit.sid === sid && takeLit.k === k && now - takeLit.t < 1400;
                const fan = fanned[k], [x, y] = fan.at, hot = (hover?.kind === 'take' && hover.k === k) || (drag?.over?.k === k) || lit, hue = TAKE_COLORS[k % TAKE_COLORS.length];
                if (lit)
                    ring([x, y], 8 + ((now - takeLit.t) / 1400) * 22, 0.7 * (1 - (now - takeLit.t) / 1400));
                G.strokeStyle = 'rgba(255,141,161,.35)';
                G.lineWidth = 1;
                G.beginPath();
                G.moveTo(hub[0], hub[1]);
                G.lineTo(fan.raw[0], fan.raw[1]);
                G.stroke();
                if (fan.dir) {
                    G.strokeStyle = 'rgba(235,231,223,.22)';
                    G.lineWidth = 0.8;
                    G.beginPath();
                    G.moveTo(fan.raw[0], fan.raw[1]);
                    G.lineTo(x, y);
                    G.stroke();
                    G.fillStyle = 'rgba(235,231,223,.35)';
                    G.beginPath();
                    G.arc(fan.raw[0], fan.raw[1], 1.4, 0, 6.283);
                    G.fill();
                }
                G.fillStyle = BG;
                G.beginPath();
                G.arc(x, y, hot ? 9.5 : 8, 0, 6.283);
                G.fill();
                G.strokeStyle = hue;
                G.lineWidth = hot ? 2.4 : 1.8;
                G.beginPath();
                G.arc(x, y, hot ? 9.5 : 8, 0, 6.283);
                G.stroke();
                G.fillStyle = MUTE;
                G.font = '10.5px IBM Plex Mono, monospace';
                if (fan.dir) {
                    const t = String(k + 1), w = G.measureText(t).width;
                    G.fillText(t, x + fan.dir[0] * 14 - w / 2, y + fan.dir[1] * 14 + 4);
                }
                else
                    G.fillText(String(k + 1), x + 9, y + 14);
                if (replacing !== null) {
                    const rr = 9 + 10 * pulse;
                    G.strokeStyle = `rgba(232,194,122,${0.7 * (1 - pulse)})`;
                    G.lineWidth = 1.2;
                    G.beginPath();
                    G.arc(x, y, rr, 0, 6.283);
                    G.stroke();
                }
            });
        const hubHot = hover?.kind === 'hub' || (drag?.over && drag.over.k === null);
        if (hubHot) {
            G.fillStyle = 'rgba(255,141,161,.18)';
            G.beginPath();
            G.arc(hub[0], hub[1], 25, 0, 6.283);
            G.fill();
        }
        G.fillStyle = ROSE;
        G.beginPath();
        G.arc(hub[0], hub[1], 16, 0, 6.283);
        G.fill();
        labels.push({ text: s.name, x: hub[0] + 26, y: hub[1] - 16, rank: 4, alpha: 1, strong: false, size: 16 });
        drawLabels(labels, [[hub[0] - 10, hub[1] - 10, hub[0] + 10, hub[1] + 10], ...nbDrawn.map(c => [c.at[0] - 9, c.at[1] - 9, c.at[0] + 9, c.at[1] + 9]), ...s.takes.map((_, k) => { const t = takeAt(s, k, hub); return [t[0] - 8, t[1] - 8, t[0] + 8, t[1] + 8]; })]);
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i], u = (now - r.t) / 1600;
            if (u > 1) {
                ripples.splice(i, 1);
                continue;
            }
            const at = r.sid === sid ? hub : r.sid ? ctxDrawn.find(c => c.sid === r.sid)?.at ?? null : r.u !== undefined ? toL(r.u, r.v) : null;
            if (!at)
                continue;
            ring(at, 6 + (1 - Math.pow(1 - u, 3)) * 30, (1 - u) * 0.5);
        }
    }
    /** The gold five: a steered find's candidates that are on the map, else the closest by audio. */
    const goldOf = (sid) => {
        const mine = new Set((soundOf(sid)?.takes ?? []).map(t => t.sampleId));
        if (goldIds)
            return goldIds.map(id => ix.byId.get(id)).filter((i) => i !== undefined && !mine.has(ix.sounds[i].id)).slice(0, 8);
        // (2026-11-14) the closest by sound, topped up from the map round it when the search found few (one ring was not a choice)
        const got = nearOf(sid).slice(0, NEAR_SHOWN);
        if (got.length < NEAR_SHOWN)
            for (const p0 of lensOf(sid, 260)?.pts ?? []) {
                if (got.length >= NEAR_SHOWN)
                    break;
                if (!got.includes(p0.i) && !mine.has(ix.sounds[p0.i].id))
                    got.push(p0.i);
            }
        return got;
    };
    const nearOf = (sid) => (near.get(sid)?.near ?? []).filter(i => !soundOf(sid)?.takes.some(t => t.sampleId === ix.sounds[i].id));
    // ── the frame ──
    let lastFrame = performance.now();
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!canvas || !g)
            return;
        const dpr = devicePixelRatio || 1, { W, H } = size();
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        // eased by time, not by frame: settles in about half a second however slow the game runs
        const dt = Math.min(0.5, Math.max(0, (now - lastFrame) / 1000));
        lastFrame = now;
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches, k = still ? 1 : 1 - Math.exp(-dt / 0.16), km = still ? 1 : 1 - Math.exp(-dt / 0.35);
        // it appears placed; a straggler after 6 s glides to its place instead of holding everything back
        if (!placed && (allPlaced() || (openedAt && now - openedAt > 6000))) {
            placed = true;
            fadeAt = now;
            starAt.clear();
            for (const s of sounds) {
                const e = near.get(s.sourceId);
                if (e)
                    starAt.set(s.sourceId, [e.u, e.v]);
            }
            if (noteEl && level.kind !== 'sound')
                noteEl.hidden = true;
        }
        if (!placed && noteEl && level.kind !== 'sound' && ix) {
            const n = sounds.filter(s => { const e = near.get(s.sourceId); return e && !e.loading; }).length;
            noteEl.hidden = false;
            noteEl.textContent = `listening to its sounds · ${n} of ${sounds.length}`;
        }
        for (const s of sounds) {
            const e = near.get(s.sourceId);
            if (!e)
                continue;
            const p = starAt.get(s.sourceId);
            if (!p) {
                if (placed)
                    starAt.set(s.sourceId, [e.u, e.v]);
            }
            else {
                p[0] += (e.u - p[0]) * km;
                p[1] += (e.v - p[1]) * km;
            }
        }
        squeezeAll();
        const lt = libTarget();
        if (!plan.ready && shown.size) {
            Object.assign(lib, lt);
            plan.ready = true;
        }
        lib.cu += (lt.cu - lib.cu) * k;
        lib.cv += (lt.cv - lib.cv) * k;
        lib.sc += (lt.sc - lib.sc) * k;
        // switching between the plan and the library fades the new view in
        g.globalAlpha = 1;
        const fade = Math.min(1, (now - fadeAt) / 320);
        g.save();
        g.globalAlpha = fade;
        labelHits = [];
        if (level.kind === 'sound')
            drawLibrary(now);
        else
            drawSky(now);
        drawExtra(now);
        g.restore();
    }
    // ── hit testing ──
    function hitAt(x, y) {
        for (const d of extraDrawn)
            if (Math.hypot(d.at[0] - x, d.at[1] - y) < 20)
                return { kind: 'extra', n: d.n };
        if (level.kind !== 'sound') {
            // an entity's name opens the entity (2026-11-13): tested first, a few px round where it was drawn
            for (const lh of labelHits)
                if (x >= lh.r[0] - 4 && x <= lh.r[2] + 4 && y >= lh.r[1] - 4 && y <= lh.r[3] + 4)
                    return lh.hit;
            let best = null;
            for (const d of skyDrawn)
                for (const s of d.stars) {
                    const dd = Math.hypot(s.at[0] - x, s.at[1] - y);
                    if (dd < 20 && (!best || dd < best.d))
                        best = { sid: s.sid, d: dd };
                }
            if (best)
                return { kind: 'dot', sid: best.sid };
            let nb = null;
            // a wide reach round each library dot (2026-11-13: 7 px was too fine a target); the nearest still wins
            for (const c of [...nbDrawn, ...lensDrawn]) {
                const d = Math.hypot(c.at[0] - x, c.at[1] - y);
                if (d < 22 && (!nb || d < nb.d))
                    nb = { i: c.i, d };
            }
            if (nb)
                return { kind: 'star', i: nb.i };
            return null;
        }
        if (!ix || level.kind !== 'sound')
            return null;
        const s = soundOf(level.sid), e = near.get(level.sid);
        if (!s || !e)
            return null;
        const sp = shown.get(s.sourceId) ?? [e.u, e.v], hub = toL(sp[0], sp[1]);
        if (s.takes.length > 1)
            for (let k = 0; k < s.takes.length; k++) {
                const [tx, ty] = takeAt(s, k, hub);
                if (Math.hypot(tx - x, ty - y) < 14)
                    return { kind: 'take', sid: s.sourceId, k };
            }
        if (Math.hypot(hub[0] - x, hub[1] - y) < 20)
            return { kind: 'hub', sid: s.sourceId };
        let star = null;
        for (const c of nbDrawn) {
            const d = Math.hypot(c.at[0] - x, c.at[1] - y);
            if (d < 22 && (!star || d < star.d))
                star = { i: c.i, d };
        }
        if (!star)
            for (const c of lensDrawn) {
                const d = Math.hypot(c.at[0] - x, c.at[1] - y);
                if (d < 20 && (!star || d < star.d))
                    star = { i: c.i, d };
            }
        if (star)
            return { kind: 'star', i: star.i };
        let other = null;
        for (const c of ctxDrawn) {
            const d = Math.hypot(c.at[0] - x, c.at[1] - y);
            if (d < 10 && (!other || d < other.d))
                other = { sid: c.sid, d };
        }
        return other ? { kind: 'dot', sid: other.sid } : null;
    }
    // ── hearing: one at a time ──
    /** The recordings within 90 px of the pointer, fetched and decoded before it lands on one (each once): hearing is instant. */
    const warmed = new Set();
    function warmNear(x, y) {
        if (!ctx?.warm)
            return;
        let n = 0;
        for (const c of [...nbDrawn, ...lensDrawn]) {
            if (warmed.has(c.i) || Math.hypot(c.at[0] - x, c.at[1] - y) > 90)
                continue;
            warmed.add(c.i);
            ctx.warm(hearUrl(c.i));
            if (++n >= 6)
                break;
        }
    }
    function hearHover(h) {
        clearTimeout(hoverTimer);
        if (!ctx)
            return;
        if (h?.kind === 'star') {
            if (heardStar === h.i)
                return;
            hoverTimer = setTimeout(() => { heardStar = h.i; if (cardHear) {
                cardHear = null;
                paintCardPlay();
            } void ctx?.hear({ url: hearUrl(h.i) }); }, 20);
            return;
        }
        if (h?.kind === 'dot' || h?.kind === 'hub' || h?.kind === 'take') {
            const s = soundOf(h.sid), ks = s?.takes ?? [], key = (h.kind === 'take' ? ks[h.k] : ks[Math.floor(Math.random() * ks.length)])?.key;
            heardStar = -1;
            if (key)
                hoverTimer = setTimeout(() => { if (cardHear) {
                    cardHear = null;
                    paintCardPlay();
                } void ctx?.hear({ key }); }, 20);
            return;
        }
        if (h?.kind === 'extra') {
            const x = offerExtra[h.n];
            heardStar = -1;
            if (x)
                hoverTimer = setTimeout(() => { void ctx?.hear({ url: x.url }); }, 20);
            return;
        }
        if (h?.kind === 'thing' || h?.kind === 'cluster')
            return;
        // leaving a dot (for its card, say) stops what pointing played, never what the card's ▶ plays (2026-11-13)
        if (heardStar !== -1 || h === null)
            hoverTimer = setTimeout(() => { heardStar = -1; if (!cardHear)
                void ctx?.hear(null); }, 260);
    }
    // ── levels ──
    function levelInfo() {
        const def = scapeDef(), scape = def?.label ?? opts.world ?? 'This world';
        if (level.kind === 'sound') {
            const s = soundOf(level.sid), inThing = s && s.thing.label !== 'the scene';
            return { kind: 'sound', title: s?.name ?? 'sound', parent: inThing ? nameOfThing(s.thing) : scape, scape, sid: level.sid, sounds: s ? [s] : [], suggesting };
        }
        if (level.kind === 'thing')
            return { kind: 'thing', title: thingLabel(level.key), parent: scape, scape, key: level.key, sounds: thingSounds(level.key) };
        return { kind: 'scape', title: scape, parent: null, scape, sounds };
    }
    function go(l) {
        const wasPlan = inPlan();
        if (!(l.kind === 'sound' && level.kind === 'sound' && l.sid === level.sid)) {
            suggesting = false;
            goldIds = null;
        }
        if (adding && l.kind !== 'scape') {
            stopSketch();
            adding = null;
        }
        if (swap && !(l.kind === 'sound' && l.sid === swap.sid))
            swap = null;
        level = l;
        card = null;
        replacing = null;
        advanced = false;
        stopPlaying();
        paintLegend();
        plan.uz = 1;
        plan.px = 0;
        plan.pz = 0;
        lib.uz = 1;
        lib.pu = 0;
        lib.pv = 0;
        if (l.kind === 'sound') {
            locate(l.sid);
            if (noteEl) {
                noteEl.textContent = 'listening…';
                noteEl.hidden = !(near.get(l.sid)?.loading ?? false);
            }
        }
        else if (noteEl && ix)
            noteEl.hidden = true;
        if (wasPlan !== inPlan())
            fadeAt = performance.now();
        const hintEl = root?.querySelector('.topl .hint');
        if (hintEl)
            hintEl.textContent = swapNext && l.kind !== 'sound' ? (l.kind === 'thing' ? 'which of its sounds? click it · Esc to stop' : 'replace which sound? click it (an entity opens first) · Esc to stop') : 'point to listen · click to open · scroll or pinch to zoom · Esc goes up a level';
        if (swapNext && l.kind === 'sound') {
            swapNext = false;
            startSwap(l.sid);
            const nm = soundOf(l.sid)?.name ?? 'it';
            ctx?.intent?.({ kind: 'replace', scape: scapeDef()?.label ?? opts.world ?? 'this place', sid: l.sid, name: nm });
        }
        paintCard();
        paintStrip();
        paintCrumbs();
        paintAround();
        paintVars();
        paintFlow();
        paintBench();
        ctx?.onLevel?.(levelInfo());
    }
    function up() {
        if (card) {
            card = null;
            return paintCard();
        }
        if (adding || swap || swapNext)
            return stopFlow();
        if (replacing !== null) {
            replacing = null;
            return paintCard();
        }
        if (level.kind === 'sound') {
            const s = soundOf(level.sid);
            return go(s && s.thing.label !== 'the scene' && thingSounds(s.thing.key).length > 1 ? { kind: 'thing', key: s.thing.key } : { kind: 'scape' });
        }
        if (level.kind === 'thing')
            return go({ kind: 'scape' });
        close();
    }
    // ── DOM: crumbs, the controls of the level, what is all around, the card ──
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls)
        e.className = cls; if (text !== undefined)
        e.textContent = text; return e; };
    function paintCrumbs() {
        if (!crumbsEl)
            return;
        crumbsEl.replaceChildren();
        // where you are, as the same marks as the sidebar: ◌ the soundscape (▾ any other), ▢ the entity, ● the sound
        const access = ctx?.soundscapes?.() ?? null, all = access?.variants.soundscapes() ?? [];
        const pill = (kind, name, to, here) => {
            const b = el(to ? 'button' : 'span', `cp k-${kind}${here ? ' here' : ''}`);
            b.append(el('i'), el('span', undefined, name));
            if (to)
                b.addEventListener('click', () => go(to));
            crumbsEl.appendChild(b);
            return b;
        };
        const sc = pill('scape', scapeDef()?.label ?? opts.world ?? 'This world', level.kind === 'scape' ? null : { kind: 'scape' }, level.kind === 'scape');
        if (all.length > 1) {
            const dd = el('button', 'cdd', '▾');
            dd.title = 'another soundscape of this world';
            dd.setAttribute('aria-haspopup', 'menu');
            dd.addEventListener('click', e => { e.stopPropagation(); toggleMenu(dd, all); });
            sc.after(dd);
        }
        if (level.kind === 'thing') {
            crumbsEl.appendChild(el('i', 'sep', '›'));
            pill('thing', thingLabel(level.key), null, true);
        }
        if (level.kind === 'sound') {
            const s = soundOf(level.sid);
            // the entity it is on, always named; a level of its own only when it has more than this one sound
            if (s && s.thing.label !== 'the scene') {
                crumbsEl.appendChild(el('i', 'sep', '›'));
                pill('thing', nameOfThing(s.thing), thingSounds(s.thing.key).length > 1 ? { kind: 'thing', key: s.thing.key } : null, false);
            }
            crumbsEl.appendChild(el('i', 'sep', '›'));
            pill('sound', s?.name ?? 'sound', null, true);
        }
        if (opts.readOnly) {
            const v = el('span', 'ro', 'listen only');
            v.title = 'Here you can look and listen; changes are made in your own project';
            crumbsEl.appendChild(v);
        }
        paintBack();
    }
    /** The back button: up one level, named for where it goes (from a sound on the train, "← Train"). */
    function paintBack() {
        if (!backEl)
            return;
        const scapeName = scapeDef()?.label ?? opts.world ?? 'This world';
        let to = null;
        if (level.kind === 'thing')
            to = scapeName;
        else if (level.kind === 'sound') {
            const s = soundOf(level.sid);
            to = s && s.thing.label !== 'the scene' && thingSounds(s.thing.key).length > 1 ? cap(s.thing.label) : scapeName;
        }
        backEl.hidden = !to;
        if (!to)
            return;
        backEl.replaceChildren(el('span', 'ar', '←'), el('span', undefined, to));
        backEl.title = `back to ${to} (Esc)`;
    }
    /** The world's soundscapes, to switch the mix to another one (each with how many sounds it has). */
    function toggleMenu(anchor, all) {
        if (menuEl) {
            menuEl.remove();
            menuEl = null;
            return;
        }
        const m = el('div', 'menu');
        m.setAttribute('role', 'menu');
        for (const d of all) {
            const b = el('button', d.id === scapeId ? 'on' : '');
            b.setAttribute('role', 'menuitem');
            b.append(el('i'), el('span', undefined, d.label), el('small', undefined, `${d.sourceIds.length} sounds`));
            b.addEventListener('click', () => { m.remove(); menuEl = null; switchScape(d.id); });
            m.appendChild(b);
        }
        const r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
        m.style.left = `${r.left - rr.left}px`;
        m.style.top = `${r.bottom - rr.top + 6}px`;
        root.appendChild(m);
        menuEl = m;
        setTimeout(() => addEventListener('click', function off() { menuEl?.remove(); menuEl = null; removeEventListener('click', off); }), 0);
    }
    function switchScape(id) {
        if (id === scapeId)
            return go({ kind: 'scape' });
        scapeId = id;
        placed = false;
        openedAt = performance.now();
        starAt.clear();
        plan.ready = false;
        refresh();
        go({ kind: 'scape' });
        paintVars();
    }
    /** What is all around you (no place of its own): one quiet row, each one to hear or open. */
    function paintAround() {
        if (!aroundEl)
            return;
        aroundEl.replaceChildren();
        if (!inPlan() || !around.length)
            return;
        aroundEl.appendChild(el('span', 'lbl', 'all around'));
        for (const s of around) {
            const c = el('button', 'chip');
            c.append(el('i'), el('span', undefined, s.name));
            c.title = 'point to hear it, click to open it';
            c.addEventListener('mouseenter', () => { const key = s.takes[0]?.key; if (key)
                void ctx?.hear({ key }); });
            c.addEventListener('click', () => go({ kind: 'sound', sid: s.sourceId }));
            aroundEl.appendChild(c);
        }
    }
    function paintStrip() {
        if (!stripEl || sideMode)
            return;
        stripEl.replaceChildren();
        if (level.kind === 'thing') {
            const key = level.key, label = thingLabel(key).toLowerCase(), on = playing?.key === key;
            const b = el('button', `btn pri ${on ? 'on' : ''}`);
            b.innerHTML = `${on ? STOP : PLAY}<span></span>`;
            b.lastElementChild.textContent = on ? 'stop' : `play the ${label}`;
            b.addEventListener('click', () => (on ? stopPlaying() : playThing(key)));
            const seg = el('span', 'seg');
            for (const [v, name] of [[Infinity, '∞'], [10, '10 s'], [20, '20 s']]) {
                const s = el('button', passLen === v ? 'on' : '', name);
                s.title = v === Infinity ? 'keep playing until you stop it' : `play for ${v} seconds`;
                s.addEventListener('click', () => { passLen = v; paintStrip(); });
                seg.appendChild(s);
            }
            // each of its sounds is a row in the sidebar, with its own ▶: no "advanced" here
            stripEl.append(b, seg);
            if (advanced) {
                const row = el('span', 'adv');
                for (const s of thingSounds(key)) {
                    const e = el('button', 'btn');
                    e.innerHTML = `${PLAY}<span></span>`;
                    e.lastElementChild.textContent = s.event ? s.event.replace(/_/g, ' ') : s.name.toLowerCase();
                    e.title = s.event ? `what the game's ${s.event} sounds like` : 'hear it';
                    e.addEventListener('click', () => { const k = s.takes[0]?.key; if (k)
                        void ctx?.hear({ key: k }); ripples.push({ sid: s.sourceId, t: performance.now() }); });
                    row.appendChild(e);
                }
                stripEl.appendChild(row);
            }
        }
        else if (level.kind === 'sound') {
            const s = soundOf(level.sid);
            if (s && s.takes.length > 1) {
                const on = playing?.key === `sound:${s.sourceId}`;
                const b = el('button', `btn pri ${on ? 'on' : ''}`);
                b.innerHTML = `${on ? STOP : PLAY}<span></span>`;
                b.lastElementChild.textContent = on ? 'stop' : 'its takes in turn';
                b.addEventListener('click', () => (on ? stopPlaying() : playTakes(s.sourceId)));
                stripEl.appendChild(b);
            }
        }
    }
    function playThing(key) {
        stopPlaying();
        const ss = thingSounds(key), thing = ss[0]?.thing;
        if (!thing)
            return;
        const game = opts.playThing?.(thing) ?? null;
        const until = passLen === Infinity ? Infinity : performance.now() + passLen * 1000;
        if (game) {
            game.start();
            playing = { key, until, step: 0, timer: setInterval(() => { if (performance.now() > (playing?.until ?? 0))
                    return stopPlaying(); if (!game.running())
                    game.start(); }, 1000) };
        }
        else {
            const next = () => { if (!playing)
                return; if (performance.now() > playing.until)
                return stopPlaying(); const s = ss[playing.step++ % ss.length], k = s?.takes[0]?.key; if (k)
                void ctx?.hear({ key: k }); if (s)
                ripples.push({ sid: s.sourceId, t: performance.now() }); };
            playing = { key, until, step: 0, timer: setInterval(next, 2200) };
            next();
        }
        paintStrip();
    }
    function playTakes(sid) {
        stopPlaying();
        const s = soundOf(sid);
        if (!s)
            return;
        const next = () => { if (!playing)
            return; const k = playing.step++; if (k >= s.takes.length)
            return stopPlaying(); void ctx?.hear({ key: s.takes[k].key }); };
        playing = { key: `sound:${sid}`, until: Infinity, step: 0, timer: setInterval(next, 2600) };
        next();
        paintStrip();
    }
    function stopPlaying() {
        if (!playing)
            return;
        clearInterval(playing.timer);
        playing = null;
        void ctx?.hear(null);
        paintStrip();
    }
    /** Asked for (the sidebar, or the chat): the library's recordings like the open sound, on the map. */
    function suggest(on) {
        if (level.kind !== 'sound')
            return;
        suggesting = on;
        if (!on) {
            card = null;
            replacing = null;
            paintCard();
        }
        if (on)
            locate(level.sid);
        paintLegend();
        ctx?.onLevel?.(levelInfo());
    }
    /** The soundscape's variants, top right of the map (the strip's 1 2 3): the one in use lit, another a click away. */
    function paintVars() {
        if (!varEl)
            return;
        varEl.replaceChildren();
        // variants vary a soundscape's cast of sounds, not one sound or one entity: the pill is the soundscape level's (2026-11-13)
        const v = ctx?.soundscapes?.()?.variants;
        if (!v || !scapeId || level.kind !== 'scape') {
            varEl.hidden = true;
            return;
        }
        const st = v.state(scapeId), all = v.variants(scapeId);
        if (st.slots.length < 2) {
            varEl.hidden = true;
            return;
        }
        // the strip's badge (2026-11-13): the same turning orb of three dots and the same pink pill, so the two read as one control
        const orb = el('span', 'orb');
        orb.setAttribute('aria-hidden', 'true');
        orb.append(el('i'), el('i'), el('i'));
        varEl.hidden = false;
        varEl.appendChild(orb);
        for (const x of st.slots) {
            // a published mix only listens: the variant playing is the one lit, nothing is kept
            const lit = opts.readOnly ? st.playing : st.inUse;
            const xv = all.find(y => y.id === x.id), b = el('button', x.id === lit ? 'on' : '', String(x.n));
            b.title = `${x.n}${xv?.label ?? xv?.why ? `: ${xv.label ?? xv.why}` : ''}${x.id === lit ? (opts.readOnly ? ', playing' : ', in use') : ''}`;
            // switching a variant is listening, not editing: it works in a published mix too (2026-11-13)
            // (choose also keeps it, which a published scene refuses with the fork prompt; switchTo only crossfades)
            b.addEventListener('click', () => { if (x.id === lit)
                return; if (opts.readOnly)
                v.switchTo(scapeId, x.id);
            else
                v.choose(scapeId, x.id); paintVars(); setTimeout(() => ctx?.playLevel?.(), 250); });
            varEl.appendChild(b);
        }
        const cur = all.find(x => x.id === (opts.readOnly ? st.playing : st.inUse));
        if (cur?.label)
            varEl.appendChild(el('span', 'vl', cur.label));
    }
    function paintLegend() {
        if (!legendEl)
            return;
        // the replace card says it already: no second note under it
        legendEl.hidden = !(suggesting && level.kind === 'sound') || !!swap;
        if (legendEl.hidden)
            return;
        legendEl.replaceChildren(el('i'), el('span', undefined, 'recordings like it · point to hear, click to use'));
        const x = el('button', undefined, '×');
        x.title = 'hide them';
        x.addEventListener('click', () => suggest(false));
        legendEl.appendChild(x);
    }
    function openCard(c, x, y) { card = c; cardAt = [x, y]; replacing = null; paintCard(); }
    /** The card's ▶ while it loads or plays (2026-11-13): kept here, painted onto whichever card shows that sound. */
    let cardHear = null, cardRaf = 0;
    function paintCardPlay() {
        const pl = cardEl?.querySelector('.pl');
        if (!pl || !cardEl)
            return;
        const st = cardHear && cardEl.dataset.ck === cardHear.key ? cardHear.state : null;
        pl.classList.toggle('ld', st === 'ld');
        pl.classList.toggle('on', st === 'on');
        pl.innerHTML = st === 'ld' ? '' : st === 'on' ? STOP : PLAY;
        if (st !== 'on')
            cardEl.querySelectorAll('.bars i').forEach(b => b.classList.remove('on'));
    }
    function cardTick() {
        cancelAnimationFrame(cardRaf);
        const step = () => {
            if (cardHear?.state !== 'on')
                return;
            const h = ctx?.hearing?.();
            if (!h || h.at >= h.dur) {
                cardHear = null;
                paintCardPlay();
                return;
            }
            if (cardEl?.dataset.ck === cardHear.key) {
                const bs = cardEl.querySelectorAll('.bars i'), lit = Math.round((h.at / h.dur) * bs.length);
                bs.forEach((b, j) => b.classList.toggle('on', j < lit));
            }
            cardRaf = requestAnimationFrame(step);
        };
        cardRaf = requestAnimationFrame(step);
    }
    function paintCard() {
        if (!cardEl || !root)
            return;
        cardEl.hidden = !card && replacing === null;
        cardEl.replaceChildren();
        if (!card && replacing === null)
            return;
        const { W, H } = size();
        cardEl.style.left = `${Math.max(10, Math.min(cardAt[0] + 16, W - 292))}px`;
        cardEl.style.top = `${Math.max(10, Math.min(cardAt[1] - 30, H - 230))}px`;
        if (replacing !== null && !card) {
            cardEl.append(el('div', 't', 'Replace which take?'), el('div', 'm', 'point at a take to hear it · click it · Esc'));
            return;
        }
        const c = card;
        const name = c.kind === 'rec' ? ix.sounds[c.i].n : (soundOf(c.sid)?.takes[c.k]?.name ?? 'take');
        cardEl.appendChild(el('div', 't', name));
        const wv = el('div', 'wv'), pl = el('button', 'pl');
        pl.innerHTML = PLAY;
        const bars = el('div', 'bars');
        for (let i = 0; i < 40; i++) {
            const b = el('i');
            b.style.height = `${(18 + 82 * Math.abs(Math.sin((hash(name) + i) * 0.37)) * (1 - i / 70)).toFixed(0)}%`;
            bars.appendChild(b);
        }
        // (2026-11-13) a spinner until the sound has loaded and started; then the playhead is the sound's own position over its
        // real length (24 s takes 24 s), never a fixed sweep that ran ahead of the audio; press again to stop. The state lives
        // outside the card (`cardHear`): the card is repainted while a sound loads, and a new card picks it up
        const ck = c.kind === 'rec' ? `r:${c.i}` : `t:${c.sid}:${c.k}`;
        cardEl.dataset.ck = ck;
        pl.addEventListener('click', () => {
            if (cardHear?.key === ck) {
                void ctx?.hear(null);
                cardHear = null;
                paintCardPlay();
                return;
            }
            const mine = { key: ck, state: 'ld' };
            cardHear = mine;
            paintCardPlay();
            const ok = c.kind === 'rec' ? ctx?.hear({ url: base + ix.sounds[c.i].f }) : ctx?.hear({ key: soundOf(c.sid).takes[c.k].key });
            void (ok ?? Promise.resolve(false)).then(started => {
                if (cardHear !== mine)
                    return;
                if (!started) {
                    cardHear = null;
                    paintCardPlay();
                    return;
                }
                mine.state = 'on';
                paintCardPlay();
                cardTick();
            });
        });
        wv.append(pl, bars);
        cardEl.appendChild(wv);
        paintCardPlay();
        if (c.kind === 'rec') {
            const s = ix.sounds[c.i];
            cardEl.appendChild(el('div', 'm', [s.d ? `${(s.d / 1000).toFixed(1)} s` : null, s.l || null].filter(Boolean).join(' · ')));
            // what the library says it is, unless that only repeats its name
            const ds = s.ds ? plainDescription(s.ds) : '';
            if (ds && wordsOf(ds).some(w => !wordsOf(s.n.replace(/-/g, ' ')).includes(w)))
                cardEl.appendChild(el('div', 'ds', ds));
            {
                const cmp = el('button', 'btn q', bench.some(b => b.lib === c.i) ? '✓ comparing' : '+ compare');
                cmp.title = 'keep it on the compare bench while you look for more';
                cmp.addEventListener('click', () => { benchAdd({ name: s.n, url: hearUrl(c.i), lib: c.i, ...(offered.has(c.i) ? { offerId: offered.get(c.i) } : {}) }); paintCard(); });
                const ca = el('div', 'acts');
                ca.appendChild(cmp);
                cardEl.appendChild(ca);
            }
            if (adding && level.kind === 'scape' && offered.has(c.i)) {
                // one of SATIE's choices: choosing it here is choosing it in the chat
                const acts = el('div', 'acts'), use = el('button', 'btn pri', 'use this');
                use.addEventListener('click', () => { if (forkFirst('add a sound'))
                    return; const id = offered.get(c.i); card = null; paintCard(); ctx?.pickOffer?.(id); stopFlow(); });
                acts.appendChild(use);
                cardEl.appendChild(acts);
            }
            if (level.kind === 'thing') {
                // at an entity its takes are not shown: say which sound it is for, then the sound opens and asks add or replace
                const key = level.key, acts = el('div', 'acts use');
                acts.appendChild(el('span', 'm', 'use it for'));
                for (const o of thingSounds(key)) {
                    const b = el('button', 'btn', o.name);
                    b.title = `open ${o.name} and choose: one more take, or in place of one`;
                    b.addEventListener('click', () => { if (!forkFirst('use this recording'))
                        useFor(o.sourceId, c.i); });
                    acts.appendChild(b);
                }
                cardEl.appendChild(acts);
            }
            if (level.kind === 'sound') {
                const sid = level.sid, acts = el('div', 'acts');
                const n = soundOf(sid)?.takes.length ?? 1;
                const add = el('button', 'btn pri', `Add as take ${n + 1}`);
                add.title = 'one more take of this sound: each play picks one of them';
                add.addEventListener('click', () => { if (!forkFirst('add this as a take'))
                    void putTake(sid, c.i, undefined); });
                const rep = el('button', 'btn', n > 1 ? 'Replace a take…' : 'Replace it');
                rep.title = n > 1 ? 'then click the take it replaces' : 'in place of its one take';
                rep.addEventListener('click', () => { if (forkFirst('replace a take'))
                    return; if (n > 1) {
                    replacing = c.i;
                    card = null;
                    paintCard();
                }
                else
                    void putTake(sid, c.i, 0); });
                acts.append(add, rep);
                cardEl.appendChild(acts);
            }
            if (s.t.length) {
                const tg = el('div', 'tags');
                for (const t of s.t.slice(0, 6))
                    tg.appendChild(el('span', undefined, t));
                cardEl.appendChild(tg);
            }
        }
        else {
            const s = soundOf(c.sid);
            cardEl.appendChild(el('div', 'm', `take ${c.k + 1} of ${s.takes.length}`));
            if (s.takes.length > 1) {
                const acts = el('div', 'acts');
                if (c.confirm) {
                    acts.append(el('span', 'm', `Remove take ${c.k + 1}?`));
                    const yes = el('button', 'btn', 'Remove');
                    yes.style.color = 'var(--danger)';
                    yes.addEventListener('click', () => { const ok = ctx?.removeTake(c.sid, c.k); card = null; paintCard(); if (ok)
                        setTimeout(refresh, 300); });
                    const no = el('button', 'btn q', 'Keep');
                    no.addEventListener('click', () => { card = { ...c, confirm: false }; paintCard(); });
                    acts.append(yes, no);
                }
                else {
                    const bin = el('button', 'bin');
                    bin.innerHTML = BIN;
                    bin.title = 'remove this take';
                    bin.addEventListener('click', () => { if (forkFirst('remove a take'))
                        return; card = { ...c, confirm: true }; paintCard(); });
                    acts.appendChild(bin);
                }
                cardEl.appendChild(acts);
            }
        }
    }
    /** A recording chosen at an entity for one of its sounds: open that sound, the recording's card waiting, takes in view. */
    function useFor(sid, i) {
        go({ kind: 'sound', sid });
        const { W, H } = size();
        openCard({ kind: 'rec', i }, W / 2 + 60, H / 2 - 60);
    }
    /**
     * A published mix (readOnly) offers the same edits as your own (2026-11-13), but pressing one asks you to fork first,
     * naming what you tried; true when it asked (the caller stops there).
     */
    const forkFirst = (what) => { if (!opts.readOnly)
        return false; ctx?.askFork?.(what); return true; };
    async function putTake(sid, i, k) {
        if (opts.readOnly)
            return; // the backstop: every caller asks to fork first
        card = null;
        replacing = null;
        paintCard();
        const before = soundOf(sid)?.takes.length ?? 0;
        const ok = await ctx?.setTake(sid, recOf(i), k);
        ripples.push({ sid, t: performance.now() });
        if (ok && swap?.sid === sid) {
            swap = null;
            suggest(false);
            paintFlow();
        }
        if (ok)
            setTimeout(() => { refresh(); takeLit = { sid, k: k ?? before, t: performance.now() }; }, 200);
    }
    // ── add and replace: one way in, the chat; the map shows and chooses (2026-11-14) ──
    /** The recordings SATIE offered in the chat that are on the map: map index → the offer's candidate id. */
    let offered = new Map();
    const bench = [];
    let benchEl = null, benchPlaying = -1;
    function benchAdd(c) { if (bench.some(b => b.url === c.url))
        return; if (bench.length >= 8)
        bench.shift(); bench.push(c); paintBench(); }
    function benchPlay(k) { const c = bench[k]; if (!c)
        return; if (benchPlaying === k) {
        benchPlaying = -1;
        void ctx?.hear(null);
    }
    else {
        benchPlaying = k;
        void ctx?.hear({ url: c.url });
    } paintBench(); }
    function benchUse(k) {
        const c = bench[k];
        if (!c || forkFirst('use this sound'))
            return;
        if (c.offerId) {
            ctx?.pickOffer?.(c.offerId);
            bench.splice(k, 1);
            paintBench();
            return;
        }
        if (c.lib !== undefined && level.kind === 'sound') {
            const { W, H } = size();
            openCard({ kind: 'rec', i: c.lib }, W / 2, H / 2 - 80);
        }
    }
    /** ≈: the recordings beside it on the map, as the gold rings (the bench itself left out). */
    function benchLike(k) {
        const c = bench[k];
        if (!c || c.lib === undefined || !ix)
            return;
        const u = ix.xy[c.lib * 2], v = ix.xy[c.lib * 2 + 1], skip = new Set(bench.map(b => b.lib));
        const nn = [];
        const all = [];
        for (let i = 0; i < ix.sounds.length; i++)
            if (!skip.has(i))
                all.push([i, Math.hypot(ix.xy[i * 2] - u, ix.xy[i * 2 + 1] - v)]);
        all.sort((a, b) => a[1] - b[1]);
        for (const [i] of all.slice(0, 6))
            nn.push(i);
        if (level.kind === 'sound') {
            goldIds = nn.map(i => ix.sounds[i].id);
            suggesting = true;
            paintLegend();
        }
        else {
            adding = { step: 2, words: '', from: 'around', thing: null, results: nn, clusters: clusterResults(ix, nn, ''), focus: null, pick: null, every: 60, loading: false, searched: '' };
            lib.uz = 1;
            lib.pu = 0;
            lib.pv = 0;
            paintFlow();
        }
    }
    function paintBench() {
        if (!root)
            return;
        const map = root.querySelector('.map');
        if (!map)
            return;
        if (!bench.length) {
            benchEl?.remove();
            benchEl = null;
            return;
        }
        if (!benchEl) {
            benchEl = el('div', 'bench');
            map.appendChild(benchEl);
        }
        benchEl.replaceChildren();
        const head = el('div', 'bh');
        head.append(el('span', undefined, 'compare'), el('small', undefined, '1–8 to hear'));
        const clr = el('button', 'bx', 'clear');
        clr.addEventListener('click', () => { bench.length = 0; benchPlaying = -1; void ctx?.hear(null); paintBench(); });
        head.appendChild(clr);
        const row = el('div', 'br');
        bench.forEach((c, k) => {
            const card = el('div', `bc${benchPlaying === k ? ' on' : ''}`);
            const n = el('button', 'bn', String(k + 1));
            n.title = 'hear it (again to stop)';
            n.addEventListener('click', () => benchPlay(k));
            const nm = el('span', 'bt', c.name);
            nm.title = c.name;
            const like = el('button', 'bi', '≈');
            like.title = 'more like this: its neighbours on the map';
            like.disabled = c.lib === undefined;
            like.addEventListener('click', () => benchLike(k));
            const use = el('button', 'bi use', 'use');
            use.title = c.offerId ? 'use this one (the chat\'s "use this")' : 'open it to add or replace a take';
            use.disabled = !c.offerId && !(c.lib !== undefined && level.kind === 'sound');
            use.addEventListener('click', () => benchUse(k));
            const x = el('button', 'bi', '×');
            x.title = 'off the bench';
            x.addEventListener('click', () => { bench.splice(k, 1); if (benchPlaying === k) {
                benchPlaying = -1;
                void ctx?.hear(null);
            } paintBench(); });
            card.addEventListener('mouseenter', () => { void ctx?.hear({ url: c.url }); });
            card.addEventListener('mouseleave', () => { if (benchPlaying !== k)
                void ctx?.hear(null); });
            card.append(n, nm, like, use, x);
            row.appendChild(card);
        });
        benchEl.append(head, row);
    }
    /** SATIE's new sounds (made for this request, not in the library): rings round what you look at; a second click uses one. */
    let offerExtra = [], extraDrawn = [], extraArmed = null;
    let byName = null;
    function startSwap(sid) { stopSketch(); adding = null; swap = { sid, words: '', loading: false }; suggest(true); paintFlow(); }
    function stopFlow() { offerExtra = []; extraArmed = null; stopSketch(); adding = null; swapNext = false; offered = new Map(); if (swap) {
        swap = null;
        suggest(false);
    } card = null; paintCard(); nbDrawn = []; paintFlow(); }
    /**
     * SATIE's offer, on the map (2026-11-14): the recordings it offered in the chat, as gold rings where they sit (round
     * the sound being replaced, or on the whole map in a few named groups for a new one); a ring's card chooses it, the
     * same as "use this" in the chat. Null takes them off.
     */
    function offer(items) {
        offered = new Map();
        offerExtra = [];
        extraArmed = null;
        if (!ix)
            return;
        if (!items?.length) {
            if (adding) {
                adding = null;
                nbDrawn = [];
            }
            if (swap === null && level.kind === 'sound' && goldIds) {
                goldIds = null;
                suggest(false);
            }
            paintFlow();
            return;
        }
        if (!byName) {
            byName = new Map();
            ix.sounds.forEach((x, i) => byName.set(x.n, i));
        }
        const found = [];
        for (const it of items) {
            const i = byName.get(it.clip.replace(/^community\//, '')) ?? byName.get(it.name);
            if (i !== undefined && !offered.has(i)) {
                offered.set(i, it.id);
                found.push(i);
            }
            else if (i === undefined && it.url)
                offerExtra.push({ id: it.id, name: it.name, url: it.url });
        }
        if (!found.length) {
            paintFlow();
            return;
        }
        if (level.kind === 'sound') {
            goldIds = found.map(i => ix.sounds[i].id);
            suggesting = true;
            paintLegend();
            ctx?.onLevel?.(levelInfo());
        }
        else {
            adding = { step: 2, words: '', from: 'around', thing: null, results: found, clusters: clusterResults(ix, found, ''), focus: null, pick: null, every: 60, loading: false, searched: '' };
            lib.uz = 1;
            lib.pu = 0;
            lib.pv = 0;
        }
        paintFlow();
    }
    /**
     * The two buttons at the bottom of every level (2026-11-14): add and replace. They only say where; what you want you
     * say in your own words in the chat, which they open with the place filled in ("add to The crossing: …"), and SATIE
     * works out the rest (where it comes from, whether the game needs a new thing first). While its choices are on the map
     * the bar says so.
     */
    function paintFlow() {
        if (!root)
            return;
        const map = root.querySelector('.map');
        if (!map)
            return;
        flowEl?.remove();
        flowEl = null;
        if (opts.readOnly) {
            actEl?.remove();
            actEl = null;
            return;
        }
        const fresh = !actEl;
        if (!actEl) {
            actEl = el('div', 'acts2');
            map.appendChild(actEl);
        }
        const key = `${level.kind}:${'key' in level ? level.key : 'sid' in level ? level.sid : ''}`;
        if (fresh || actEl.dataset.k !== key) {
            actEl.dataset.k = key;
            actEl.classList.remove('call');
            void actEl.offsetWidth;
            actEl.classList.add('call');
        }
        actEl.replaceChildren();
        const btn = (icon, text, why, go2) => { const b = el('button', 'ab'); b.append(el('span', 'ai', icon), el('span', undefined, text)); b.title = why; b.addEventListener('click', go2); actEl.appendChild(b); return b; };
        const note = (t, done) => { actEl.appendChild(el('span', 'ahint', t)); if (done) {
            const d = el('button', 'ab q');
            d.append(el('span', undefined, 'done'));
            d.addEventListener('click', done);
            actEl.appendChild(d);
        } };
        const scape = scapeDef()?.label ?? opts.world ?? 'this place';
        if (swapNext) {
            actEl.remove();
            actEl = null;
            return;
        }
        if (offerExtra.length && !adding && !(swap && level.kind === 'sound')) {
            note('SATIE’s new sounds are the rings: point to hear one, click twice to use it', stopFlow);
            return;
        }
        if (adding && level.kind === 'scape') {
            note(offered.size ? 'SATIE’s choices are the gold rings: point to hear one, click it to choose' : 'the gold rings: point to hear one', stopFlow);
            return;
        }
        if (swap && level.kind === 'sound') {
            note(goldIds && offered.size ? 'SATIE’s choices are the gold rings round it: point to hear, click to use one' : 'the closest by sound are the gold rings: point to hear, click to use one', stopFlow);
            return;
        }
        const say = (i) => ctx?.intent?.(i);
        if (level.kind === 'scape') {
            btn('+', 'add a sound', `say what it is in the chat; SATIE finds it and asks if anything is unclear`, () => say({ kind: 'add', scape }));
            btn('~', 'change something', 'say what in the chat: a sound, how it sounds, where or when', () => say({ kind: 'change', scape }));
        }
        else if (level.kind === 'thing') {
            const t = thingLabel(level.key), k = level.key;
            btn('+', `add a sound to the ${t.toLowerCase()}`, `a new sound that plays from the ${t.toLowerCase()}: say what in the chat`, () => say({ kind: 'add', scape, thing: { key: k, label: t } }));
            btn('~', `change the ${t.toLowerCase()}`, 'say what in the chat: one of its sounds, how it sounds, where or when', () => say({ kind: 'change', scape, thing: { key: k, label: t } }));
        }
        else if (level.kind === 'sound') {
            const sid = level.sid, name = soundOf(sid)?.name ?? 'it';
            btn('~', 'change it', 'say what should change in the chat; the closest by sound are the gold rings', () => { startSwap(sid); say({ kind: 'change', scape, sid, name }); });
            btn('+', 'add a take', 'one more recording of it: each play picks one', () => { startSwap(sid); say({ kind: 'take', scape, sid, name }); });
        }
    }
    function stopSketch() { const p = sketchPlay; sketchPlay = null; p?.stop(); }
    /** The chosen sound played; passing over, it comes from one side, swells overhead and leaves by the other (9 s). */
    function playSketch(move) {
        stopSketch();
        const ac = ctx?.engine.audioContext;
        if (!ac || !adding || adding.pick === null || !ix)
            return;
        const pick = adding.pick;
        void ctx?.hear(null);
        if (ac.state === 'suspended')
            void ac.resume();
        const out = ac.createGain();
        out.gain.value = 0;
        out.connect(ac.destination);
        const pan = ac.createStereoPanner();
        pan.connect(out);
        let src = null, stopped = false;
        const len = 9, t0 = ac.currentTime + 0.15;
        const me = { stop: () => { stopped = true; try {
                out.gain.cancelScheduledValues(ac.currentTime);
                out.gain.setTargetAtTime(0, ac.currentTime, 0.08);
            }
            catch { /* closed */ } setTimeout(() => { try {
                src?.stop();
            }
            catch { /* ended */ } out.disconnect(); }, 400); } };
        sketchPlay = me;
        void fetch(base + ix.sounds[pick].f).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => {
            if (stopped || sketchPlay !== me)
                return;
            src = ac.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            src.connect(pan);
            src.start(t0);
            if (move === 'over') {
                out.gain.setValueAtTime(0.0001, t0);
                out.gain.exponentialRampToValueAtTime(0.9, t0 + len * 0.5);
                out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
                pan.pan.setValueAtTime(-0.95, t0);
                pan.pan.linearRampToValueAtTime(0.95, t0 + len);
            }
            else {
                out.gain.setValueAtTime(0, t0);
                out.gain.linearRampToValueAtTime(0.85, t0 + 0.4);
                out.gain.setValueAtTime(0.85, t0 + len - 0.6);
                out.gain.linearRampToValueAtTime(0, t0 + len);
            }
            setTimeout(() => { if (sketchPlay === me) {
                stopSketch();
                paintFlow();
            } }, (len + 0.3) * 1000);
        }).catch(() => { if (sketchPlay === me) {
            sketchPlay = null;
            paintFlow();
        } });
    }
    // ── pointer ──
    function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function wire() {
        const c = canvas;
        c.addEventListener('pointermove', e => {
            const [x, y] = local(e);
            if (pan) {
                const { B } = size();
                if (Math.abs(e.clientX - pan.x0) + Math.abs(e.clientY - pan.y0) > 4)
                    pan.moved = true;
                if (inPlan()) {
                    const s = plan.sc * plan.uz;
                    plan.px = pan.a - (e.clientX - pan.x0) / (B * s);
                    plan.pz = pan.b - (e.clientY - pan.y0) / (B * s);
                }
                else {
                    const s = lib.sc * lib.uz;
                    lib.pu = pan.a - (e.clientX - pan.x0) / (B * s);
                    lib.pv = pan.b - (e.clientY - pan.y0) / (B * s);
                }
                return;
            }
            if (drag) {
                if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5)
                    drag.moved = true;
                if (drag.moved && ghostEl && level.kind === 'thing') {
                    const h = hitAt(x, y), over = h?.kind === 'dot' ? soundOf(h.sid) : undefined;
                    drag.over = over ? { sid: over.sourceId, k: null } : null;
                    ghostEl.hidden = false;
                    ghostEl.style.left = `${x}px`;
                    ghostEl.style.top = `${y}px`;
                    ghostEl.lastElementChild.textContent = over ? `use for ${over.name}` : ix.sounds[drag.i].n;
                }
                if (drag.moved && ghostEl && level.kind === 'sound') {
                    const h = hitAt(x, y), sid = level.sid;
                    drag.over = h?.kind === 'take' ? { sid, k: h.k } : h?.kind === 'hub' ? { sid, k: null } : null;
                    ghostEl.hidden = false;
                    ghostEl.style.left = `${x}px`;
                    ghostEl.style.top = `${y}px`;
                    ghostEl.lastElementChild.textContent = drag.over ? (drag.over.k === null ? `add as take ${(soundOf(sid)?.takes.length ?? 0) + 1}` : `replace take ${drag.over.k + 1}`) : ix.sounds[drag.i].n;
                }
                return;
            }
            warmNear(x, y);
            const h = hitAt(x, y);
            if (JSON.stringify(h) !== JSON.stringify(hover)) {
                hover = h;
                hearHover(h);
                ctx?.onHover?.(h?.kind === 'dot' || h?.kind === 'hub' || h?.kind === 'take' ? h.sid : null);
            }
            c.classList.toggle('pt', !!h);
        });
        c.addEventListener('pointerleave', () => { if (!drag && !pan) {
            hover = null;
            hearHover(null);
        } });
        c.addEventListener('pointerdown', e => {
            const [x, y] = local(e), h = hitAt(x, y);
            c.setPointerCapture(e.pointerId);
            if (h?.kind === 'star') {
                drag = { i: h.i, x0: e.clientX, y0: e.clientY, moved: false, over: null };
                return;
            }
            if (h?.kind === 'take') {
                if (replacing !== null) {
                    const i = replacing;
                    if (!forkFirst('replace this take'))
                        void putTake(h.sid, i, h.k);
                    return;
                }
                openCard({ kind: 'take', sid: h.sid, k: h.k }, x, y);
                return;
            }
            // replacing among many: a sound on an entity opens the entity first (its sounds big, named), then you pick one
            if (h?.kind === 'dot' && swapNext && level.kind === 'scape') {
                const s0 = soundOf(h.sid);
                if (s0 && s0.thing.label !== 'the scene' && thingSounds(s0.thing.key).length > 1) {
                    go({ kind: 'thing', key: s0.thing.key });
                    return;
                }
            }
            if (h?.kind === 'dot') {
                go({ kind: 'sound', sid: h.sid });
                return;
            }
            if (h?.kind === 'extra') {
                const x = offerExtra[h.n];
                if (!x)
                    return;
                if (extraArmed === h.n) {
                    if (!forkFirst('add a sound')) {
                        ctx?.pickOffer?.(x.id);
                        stopFlow();
                    }
                }
                else {
                    extraArmed = h.n;
                    void ctx?.hear({ url: x.url });
                }
                return;
            }
            if (h?.kind === 'thing') {
                go({ kind: 'thing', key: h.key });
                return;
            }
            if (h?.kind === 'cluster' && adding) {
                adding.focus = adding.focus === h.c ? null : h.c;
                lib.uz = 1;
                lib.pu = 0;
                lib.pv = 0;
                paintFlow();
                return;
            }
            if (h?.kind === 'hub')
                return;
            pan = inPlan() ? { x0: e.clientX, y0: e.clientY, a: plan.px, b: plan.pz, moved: false } : { x0: e.clientX, y0: e.clientY, a: lib.pu, b: lib.pv, moved: false };
        });
        c.addEventListener('pointerup', e => {
            const [x, y] = local(e);
            if (drag) {
                const d = drag;
                drag = null;
                if (ghostEl)
                    ghostEl.hidden = true;
                if (!d.moved)
                    return openCard({ kind: 'rec', i: d.i }, x, y);
                if (d.over && forkFirst(level.kind === 'thing' ? 'use this recording' : d.over.k === null ? 'add this as a take' : 'replace this take'))
                    return;
                if (d.over && level.kind === 'thing')
                    return useFor(d.over.sid, d.i);
                if (d.over)
                    void putTake(d.over.sid, d.i, d.over.k ?? undefined);
                return;
            }
            if (pan) {
                const moved = pan.moved;
                pan = null;
                if (!moved && card) {
                    card = null;
                    paintCard();
                }
            }
        });
        c.addEventListener('wheel', e => {
            e.preventDefault();
            // a trackpad pinch is a wheel with ctrlKey and small deltas: scaled up so it zooms in proportion (2026-11-13); a line
            // delta (a mouse in line mode) counts as 16 px
            const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1), [x, y] = local(e), { W, H, B } = size(), f = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.006));
            if (inPlan()) {
                const before = plan.sc * plan.uz;
                plan.uz = Math.max(0.4, Math.min(30, plan.uz * f));
                const after = plan.sc * plan.uz;
                plan.px += (x - W / 2) / B * (1 / before - 1 / after);
                plan.pz += (y - H / 2) / B * (1 / before - 1 / after);
            }
            else {
                const before = lib.sc * lib.uz;
                lib.uz = Math.max(0.3, Math.min(40, lib.uz * f));
                const after = lib.sc * lib.uz;
                lib.pu += (x - W / 2) / B * (1 / before - 1 / after);
                lib.pv += (y - H / 2) / B * (1 / before - 1 / after);
            }
        }, { passive: false });
    }
    const onKey = (e) => {
        if (!open || e.target?.closest?.('input, textarea, [contenteditable]'))
            return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            up();
        }
        else if ((e.key === 'c' || e.key === 'C') && ix) {
            if (hover?.kind === 'star') {
                const i = hover.i;
                benchAdd({ name: ix.sounds[i].n, url: hearUrl(i), lib: i, ...(offered.has(i) ? { offerId: offered.get(i) } : {}) });
                e.preventDefault();
            }
            else if (hover?.kind === 'extra') {
                const x = offerExtra[hover.n];
                if (x)
                    benchAdd({ name: x.name, url: x.url, offerId: x.id });
                e.preventDefault();
            }
        }
        else if (/^[1-8]$/.test(e.key) && bench.length) {
            benchPlay(Number(e.key) - 1);
            e.preventDefault();
        }
    };
    const hash = (s) => { let h = 0; for (const ch of s)
        h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };
    // ── open / close ──
    function build(mount, side = 0, tools, tools2) {
        if (!document.getElementById('satie-ep-css')) {
            const st = el('style');
            st.id = 'satie-ep-css';
            st.textContent = CSS;
            document.head.appendChild(st);
        }
        document.getElementById('satie-ep-css').textContent = CSS;
        root = el('div', 'satie-ep');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'The mix');
        const bar = el('div', 'bar');
        crumbsEl = el('div', 'crumbs');
        const x = el('button', 'x', '×');
        x.title = 'close (Esc)';
        x.addEventListener('click', close);
        bar.append(crumbsEl, ...(tools ? [tools] : []), x);
        // one window with the mixer: its column sits in the right of this one, under this bar
        root.style.right = side ? '12px' : '424px';
        root.style.setProperty('--side', `${side}px`);
        const map = el('div', 'map');
        canvas = el('canvas');
        g = canvas.getContext('2d');
        noteEl = el('div', 'note');
        noteEl.hidden = true;
        const zoom = el('div', 'zoom');
        const zf = (f) => { if (inPlan())
            plan.uz = Math.max(0.4, Math.min(30, plan.uz * f));
        else
            lib.uz = Math.max(0.3, Math.min(40, lib.uz * f)); };
        for (const [label, f] of [['+', 1.8], ['−', 1 / 1.8]]) {
            const b = el('button', undefined, label);
            b.addEventListener('click', () => zf(f));
            zoom.appendChild(b);
        }
        const fit = el('button', undefined, 'fit');
        fit.style.fontSize = '11px';
        fit.addEventListener('click', () => { plan.uz = 1; plan.px = 0; plan.pz = 0; lib.uz = 1; lib.pu = 0; lib.pv = 0; });
        zoom.appendChild(fit);
        // the controls of the level (play the train, its takes in turn) sit under the name in the sidebar when there is one
        stripEl = tools2 ?? el('div', 'strip');
        stripEl.replaceChildren();
        aroundEl = el('div', 'around');
        cardEl = el('div', 'card');
        cardEl.hidden = true;
        ghostEl = el('div', 'ghost');
        ghostEl.append(el('i'), el('span'));
        ghostEl.hidden = true;
        legendEl = el('div', 'legend');
        legendEl.hidden = true;
        const hint = el('div', 'hint', 'point to listen · click to open · scroll or pinch to zoom · Esc goes up a level');
        // the way back up, where the eye starts (2026-11-13): the crumbs alone were too quiet to read as a way back
        backEl = el('button', 'back');
        backEl.hidden = true;
        backEl.addEventListener('click', () => up());
        const topl = el('div', 'topl');
        topl.append(backEl, hint);
        varEl = el('div', 'vars');
        map.append(canvas, noteEl, zoom, ...(tools2 || side ? [] : [stripEl]), aroundEl, legendEl, topl, varEl, cardEl, ghostEl);
        root.append(bar, map);
        mount.replaceChildren(root);
        wire();
    }
    function close() {
        if (!open)
            return;
        open = false;
        stopPlaying();
        stopSketch();
        adding = null;
        swap = null;
        swapNext = false;
        flowEl = null;
        actEl = null;
        benchEl = null;
        cancelAnimationFrame(raf);
        clearInterval(poll);
        clearTimeout(hoverTimer);
        removeEventListener('keydown', onKey, true);
        offSwitch?.();
        offSwitch = null;
        offVarChange?.();
        offVarChange = null;
        root?.remove();
        root = null;
        canvas = null;
        g = null;
        stripEl?.replaceChildren();
        stripEl = null;
        const c = ctx;
        ctx = null;
        c?.closed();
    }
    /** A thing opens at the thing its sound is on ("the scene" is no thing: then the sound itself). */
    function levelFor(t) {
        const thingOf = (sid) => { const s = soundOf(sid); return s && s.thing.label !== 'the scene' && thingSounds(s.thing.key).length > 1 ? s.thing.key : null; };
        return 'sound' in t ? (t.thing && thingOf(t.sound) ? { kind: 'thing', key: thingOf(t.sound) } : { kind: 'sound', sid: t.sound }) : { kind: 'scape' };
    }
    return {
        go(t) { if (open)
            go(levelFor(t)); },
        pulse(sid, k) { if (!open)
            return; ripples.push({ sid, t: performance.now() }); if (k !== undefined)
            takeLit = { sid, k, t: performance.now() }; },
        highlight(sid) { extHot = sid; },
        playGame(key) {
            const thing = thingSounds(key)[0]?.thing;
            const game = thing ? opts.playThing?.(thing) ?? null : null;
            if (!game)
                return false;
            game.start();
            gameRuns.set(key, game);
            return true;
        },
        gameRunning(key) { return gameRuns.get(key)?.running() ?? false; },
        warm(c) {
            // before the mix is opened: where every sound of the world sits, asked one at a time in the background
            if (open)
                return;
            warmCtx = c;
            void loadMap().then(() => { if (open)
                return; sounds = c.sounds().filter(x => x.where !== 'yours'); for (const x of sounds)
                x.name = tidy(x.name); locateAll(); }).catch(() => { });
        },
        suggest,
        offer(items) { if (open)
            offer(items); },
        replace(sid) { if (!open)
            return; if (!(level.kind === 'sound' && level.sid === sid))
            go({ kind: 'sound', sid }); startSwap(sid); },
        suggestIds(ids) {
            goldIds = ids;
            if (level.kind !== 'sound')
                return;
            suggesting = !!ids?.length;
            if (suggesting)
                locate(level.sid);
            paintLegend();
            ctx?.onLevel?.(levelInfo());
        },
        open(t, c) {
            ctx = c;
            if (!open) {
                open = true;
                sideMode = !!c.side;
                build(c.mount, c.side ?? 0, c.barTools, c.levelTools);
                plan.ready = false;
                addEventListener('keydown', onKey, true);
                raf = requestAnimationFrame(frame);
                poll = setInterval(refresh, 400);
            }
            const access = c.soundscapes?.() ?? null;
            scapeId = 'soundscape' in t ? (access?.variants.soundscapes().some(d => d.id === t.soundscape) ? t.soundscape : null) : (access?.variants.soundscapes().find(d => d.sourceIds.includes(t.sound))?.id ?? null);
            // a variant switch re-picks recordings: the open sound's place is asked again, what changed ripples
            offSwitch?.();
            offSwitch = access ? access.variants.onSwitch(e => { if (e.soundscape !== scapeId)
                return; setTimeout(() => { refresh(); for (const ch of e.changes) {
                near.delete(ch.sourceId);
                ripples.push({ sid: ch.sourceId, t: performance.now() });
            } if (level.kind === 'sound')
                locate(level.sid); }, 120); }) : null;
            offVarChange?.();
            offVarChange = access ? access.variants.onChange(id => { if (id === scapeId)
                paintVars(); }) : null;
            refresh();
            if (!openedAt)
                openedAt = performance.now();
            paintVars();
            go(levelFor(t));
            loadMap().then(() => { if (level.kind === 'sound') {
                near.delete(level.sid);
                go(level);
            } locateAll(); })
                .catch(e => { if (noteEl && level.kind === 'sound') {
                noteEl.hidden = false;
                noteEl.textContent = e instanceof Error ? e.message : String(e);
            } });
            // a dev handle, like the game's window.satie: what is drawn where, for tests and the console
            window.satieEditPanel = {
                go: (l) => go(l),
                offer: (items) => offer(items),
                state: () => {
                    const r = canvas?.getBoundingClientRect(), off = (q) => (q && r ? [q[0] + r.left, q[1] + r.top] : null);
                    const e = level.kind === 'sound' ? near.get(level.sid) : undefined;
                    return {
                        level, hover, open,
                        things: skyDrawn.map(t => ({ key: t.key, label: t.label, at: off(t.labelAt), sounds: t.stars.map(d => ({ sid: d.sid, name: soundOf(d.sid)?.name, at: off(d.at), byWords: near.get(d.sid)?.byWords ?? true })) })),
                        around: around.map(s => s.name),
                        lens: lensDrawn.slice(0, 8).map(c => ({ name: ix.sounds[c.i].n, at: off(c.at) })),
                        sound: e && level.kind === 'sound' ? { loading: e.loading, byWords: e.byWords, hub: off(toL(...(starAt.get(level.sid) ?? [e.u, e.v]))), near: nearOf(level.sid).slice(0, 6).map(i => ({ name: ix.sounds[i].n, at: off(toL(ix.xy[i * 2], ix.xy[i * 2 + 1])) })) } : null,
                    };
                },
            };
        },
        close,
        isOpen: () => open,
    };
}
//# sourceMappingURL=index.js.map