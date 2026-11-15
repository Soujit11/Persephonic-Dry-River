export { freezeScene, SceneComparison, serializeAudition, restoreAudition } from './SceneComparison.js';
import { createSceneReview } from './SceneReview.js';
export { createEditPanel } from './editPanel/index.js';
import { pathFor, tryParse, parseWithWarnings, parseScene } from '../core/SatieParser';
import { sourceFingerprints } from '../edit/SourceIdentity';
import { mapFollow } from '../core/Signals';
import { controlFor, seedFor, OFFERED_GHOSTS, PROPERTIES } from '../core/Properties';
import { parseNumber, parseRangeText, formatRangeText, snap, parseVec3, formatVec3, parseCompound, formatCompound, partFromPosition, partToPosition, parseHexColor } from '../edit/propertyControls';
import { upsertVoiceProperty, removeVoiceProperty, setVoiceKind, replaceHeadSound, setVoiceSource, voiceLocatorFor, duplicateVoiceBlock, uniqueSourceId, setVoiceTrigger, appendVoiceBlock } from '../edit/scriptEdit';
import { EditRecorder } from './EditRecorder';
import { HistoryTree } from './HistoryTree';
import { describeVoiceChanges } from '../edit/voiceChanges';
import { audibility, bandSpectrum } from '../core/Audibility';
import { TakeComparison } from './TakeComparison';
import { takeClipPath, templateTake, legacyTemplateTake, templateBankSize, isTemplatePrompt } from '../core/GenRequests';
import { MARK_SVG } from '../badge/mark';
import { mountCard, mountCrowd } from './card/view';
import { SLIDER_DIALS, TIMING_DIALS, fmtLoud, fmtLoudDelta } from './card/dials';
import { OCCLUSION_FULL_DB } from '../spatial/LevelModel';
import { MAX_BANK_TAKES } from '../core/RecordingBanks';
import { encodeWAV } from '../export/WAVEncoder';
import { word, count } from './words';
import { clashes, putMineBack, makerOf, clashLine } from './OutsideEdits';
import { useThisScript, startFind, nextRound, newFind, useLabels, planVariations, makeVariations, shortlist as shortlistFind, unshortlist as unshortlistFind, mark as markFind, unmark as unmarkFind, editPlan as editPlanFind } from './card/findSession';
import { findView } from './card/findView';
import { DraftPlayer } from './card/draft';
import { synthAssetFor } from '../synth/asset.js';
import { instrumentById } from '../synth/instruments.js';
import { createVariantController } from '../place/controller';
import { readSoundscapes, soundscapesFromBlocks } from '../place/place';
import { renderNow, nowSignature, directionWords, NowMoments } from './NowContext';
export { renderNow } from './NowContext';
export function candidatePreviewRepeat(cadence, single) {
    return single === false ? cadence : null;
}
/** Surface recordings of the listener's step share one hearing tag, anchored to the first source. */
export function personalStepLead(stmts, i, personal) {
    const step = (st) => st.kind === 'trigger'
        && /(?:^|[_.:-])(?:footsteps?|steps?)(?:$|[_.:-])/i.test(st.eventName ?? '') && personal(st);
    if (!stmts[i] || !step(stmts[i]))
        return null;
    return stmts.findIndex(step);
}
/** Keep the running bar's timeline aligned with the most recent fire, including retriggers. */
export function syncHearingShot(bar, ageMs, durationMs) {
    const animation = bar.getAnimations()[0] ?? bar.animate([
        { transform: 'scaleX(1)', opacity: 0.9 },
        { transform: 'scaleX(0)', opacity: 0.4 },
    ], { duration: durationMs, fill: 'forwards' });
    animation.currentTime = Math.max(0, Math.min(durationMs, ageMs));
}
export function inspectorPropertyRaw(script, st, key) {
    const span = st.propertySpans.get(key);
    if (!span)
        return null;
    const line = script.split('\n')[span.line] ?? '';
    const match = span.origin === 'inline'
        ? line.match(new RegExp(`\\band\\s+${key}\\s+(.*?)(?=\\s+and\\s+|$)`))
        : line.trim().match(new RegExp(`^${key}(?:\\s+(.*))?$`));
    return match ? (match[1] ?? '').trim() : null;
}
const STRIP_CSS = `
.satie-dt-strip{padding:9px 16px 10px;border-bottom:1px solid var(--line);display:flex;flex-direction:row;align-items:center;gap:12px}
.satie-dt-strip .lc{display:flex;flex-direction:column;gap:7px;min-width:0;flex:1}
.satie-dt-strip[hidden]{display:none}
.satie-dt-strip .sh{display:flex;align-items:flex-start;gap:10px}
.satie-dt-strip .sn{display:flex;flex-direction:column;gap:2px;min-width:0}
.satie-dt-strip .sl{font:10.5px var(--mono);color:var(--mute);letter-spacing:.02em}
.satie-dt-strip .sv{font:500 17px/1.2 'IBM Plex Mono',monospace;letter-spacing:-.012em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-strip .sr{display:flex;align-items:center;gap:6px}
.satie-dt-strip .mapbtn{flex:none;display:inline-flex;align-items:center;gap:6px;height:26px;box-sizing:border-box;padding:0 10px 0 6px;border-radius:999px;border:1px solid rgba(255,141,161,.55);background:rgba(255,141,161,.07);font:500 11.5px var(--mono);color:#f3d7dc;cursor:pointer;position:relative;overflow:hidden;isolation:isolate}
.satie-dt-strip .mapbtn[data-on="1"]{background:rgba(255,141,161,.22)}
.satie-dt-strip .mapbtn:hover{border-color:#ff8da1}
.satie-dt-strip .mapbtn::before,.satie-dt-strip .vc::before{content:'';position:absolute;inset:-60%;z-index:-1;background:conic-gradient(from 0deg,transparent 0 70%,rgba(255,141,161,.22) 82%,transparent 94%);animation:satieSheen 7s linear infinite}
.satie-dt-strip .vc{position:relative;display:inline-flex;align-items:center;gap:3px;min-height:26px;box-sizing:border-box;padding:0 3px 0 8px;min-width:0;border-radius:999px;border:1px solid rgba(255,141,161,.55);background:rgba(255,141,161,.07);overflow:hidden;isolation:isolate;max-width:100%;flex:0 1 auto;flex-wrap:nowrap}
.satie-dt-strip .orb{position:relative;width:16px;height:16px;flex:none;animation:satieOrb 9s linear infinite;margin-right:2px}
.satie-dt-strip .orb i{position:absolute;left:6px;top:6px;width:4px;height:4px;border-radius:2px;background:#ff8da1}
.satie-dt-strip .orb i:nth-child(1){transform:translate(0,-5px);animation:satieOrbB 4.2s ease-in-out infinite}
.satie-dt-strip .orb i:nth-child(2){transform:translate(4.3px,2.5px);animation:satieOrbB 4.2s ease-in-out -1.4s infinite}
.satie-dt-strip .orb i:nth-child(3){transform:translate(-4.3px,2.5px);animation:satieOrbB 4.2s ease-in-out -2.8s infinite}
.satie-dt-strip .vc .n{all:unset;width:24px;height:20px;border-radius:999px;display:grid;place-items:center;font:500 12.5px var(--mono);color:#f3d7dc;cursor:pointer;border:1px solid transparent;transition:background .3s,box-shadow .3s}
.satie-dt-strip .vc .n:hover{border-color:rgba(255,141,161,.45)}
.satie-dt-strip .vc .n.on{background:#ff8da1;color:#0d0c0b;box-shadow:0 0 12px 2px rgba(255,141,161,.45)}
.satie-dt-strip .vc .n.old{color:var(--mute);opacity:.75}
.satie-dt-strip .vc .n.lt{width:18px;color:var(--mute)}
.satie-dt-strip .vc.ro{opacity:.55;filter:saturate(.4)}
.satie-dt-strip .vc.ro .n{cursor:default}
.satie-dt-strip .vc.ro .n:hover{border-color:transparent}
.satie-dt-strip .vc .vl{font:12px 'IBM Plex Mono',monospace;color:#f3d7dc;border-left:1px solid rgba(255,141,161,.3);padding:0 10px 0 9px;margin-left:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;max-width:190px}
@keyframes satieSheen{to{transform:rotate(360deg)}}
@keyframes satieOrb{to{transform:rotate(360deg)}}
@keyframes satieOrbB{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.satie-dt-strip .mapbtn::before,.satie-dt-strip .vc::before,.satie-dt-strip .orb,.satie-dt-strip .orb i{animation:none}}
`;
const CSS = `
/* The panel (prototype look, 2026-09-28: brand/design_systems/logo+banner/watermark/prototype/mixer-locate.html). */
.satie-dt{--bg:#0d0c0b;--ink:#ebe7df;--mute:#8e8a83;--line:rgba(235,231,223,.12);--hair:rgba(235,231,223,.07);--fill:rgba(235,231,223,.06);--accent:#ebe7df;--mono:'IBM Plex Mono','SF Mono',Menlo,Consolas,ui-monospace,monospace;--sound:#ff8da1;--warn:#d4a850;--danger:#e07070;position:fixed;top:12px;bottom:12px;width:400px;max-width:calc(100vw - 24px);z-index:2147483000;font:12px/1.45 var(--mono);letter-spacing:-.002em;color:var(--ink);background:rgba(10,9,8,.82);backdrop-filter:blur(14px) saturate(1.1);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,.45);transform-origin:bottom right;transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .3s ease,visibility 0s}
.satie-dt[data-corner=left]{left:12px;transform-origin:bottom left}
.satie-dt[data-corner=right]{right:12px}
.satie-dt[data-collapsed="1"]{transform:translateY(calc(100% + 24px)) scale(.98);opacity:0;visibility:hidden;transition:transform .4s cubic-bezier(.4,0,.6,1),opacity .3s ease .1s,visibility 0s .4s}
@media (prefers-reduced-motion: reduce){.satie-dt,.satie-dt[data-collapsed="1"]{transform:none;transition:opacity .2s ease,visibility 0s .2s}}
.satie-dt.satie-dt-embedded{position:relative;inset:auto;width:100%;height:100%;max-width:none;z-index:1;border-radius:0;border:0;box-shadow:none;transform:none;visibility:visible;opacity:1}
.satie-dt-launch{position:fixed;bottom:16px;z-index:2147483000;font:11px var(--mono);letter-spacing:.01em;color:#ebe7df;background:rgba(13,12,11,.88);border:1px solid rgba(235,231,223,.14);border-radius:999px;padding:7px 12px;cursor:pointer;backdrop-filter:blur(10px)}
.satie-dt-launch[data-corner=right]{right:16px}
.satie-dt-launch[data-dot="1"]::after,.satie-dt-launch[data-dot="warn"]::after{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#ebe7df;margin-left:6px;vertical-align:1px}
.satie-dt-launch[data-dot="warn"]::after{background:#d4a850}
.satie-dt-launch[data-corner=left]{left:16px}
.satie-dt-launch:hover{background:rgba(235,231,223,.1)}
.satie-dt *{box-sizing:border-box}
.satie-dt .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.satie-dt button{font:inherit;font-size:11px;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:4px;padding:3px 9px;cursor:pointer;line-height:1.3}
.satie-dt button:hover{background:var(--fill)}
.satie-dt button:disabled{opacity:.35;cursor:default}
.satie-dt button[data-on="1"]{background:rgba(235,231,223,.16);border-color:rgba(235,231,223,.32)}
.satie-dt button.quiet{border-color:transparent;color:var(--mute);padding:3px 6px}
.satie-dt button.quiet:hover{color:var(--ink);background:var(--fill)}
.satie-dt button.pill{border-radius:4px}
.satie-dt-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);background:rgba(0,0,0,.25)}
.satie-dt-bar .wm{font-family:var(--mono);font-size:12px;color:var(--ink)}
.satie-dt-bar .sp{flex:1}
.satie-dt .satie-dt-bar .forkbtn{display:inline-flex;align-items:center;font:inherit;font-size:11px;font-weight:500;line-height:1.3;padding:3px 12px;border-radius:999px;border:1px solid #ebe7df;background:#ebe7df;color:#0d0c0b;text-decoration:none;cursor:pointer}
.satie-dt .satie-dt-bar .forkbtn:hover{background:#f6f3ec;border-color:#f6f3ec}
.satie-dt-tabs{display:flex;gap:0;padding:0;border-bottom:1px solid var(--line);background:rgba(0,0,0,.25)}
.satie-dt-tabs button{font-family:var(--mono);font-size:11.5px;border:0;border-right:1px solid var(--line);border-radius:0;padding:8px 12px;color:var(--mute);background:transparent}
.satie-dt-tabs button:hover{background:transparent;color:var(--ink)}
.satie-dt-tabs button[data-on="1"]{color:var(--ink);background:rgba(10,9,8,.7)}
.satie-dt-tabs .satie-dt-ground{margin-left:auto;font-size:10.5px;color:var(--mute);border-right:0;border-left:1px solid var(--line)}
.satie-dt-tabs .satie-dt-ground[data-on="1"]{color:var(--accent);border-bottom:0}
.satie-dt-body{flex:1;overflow:auto;padding:0 0 12px}
.satie-dt-body[data-view="chat"]{display:flex;flex-direction:column;overflow:hidden;padding:0}
.satie-dt-body[data-view="chat"] .satie-dt-chat{flex:1;min-height:0;padding:10px 12px 12px}
.satie-dt-body[data-view="chat"] .satie-dt-chat .thread{display:flex!important;flex:1;min-height:0;max-height:none!important;height:auto!important}
.satie-dt-body[data-view="chat"] .satie-dt-chat .grip{display:none}
.satie-dt-tabs button[data-dot="1"]::after,.satie-dt-tabs button[data-dot="warn"]::after{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ink);margin-left:5px;vertical-align:1px}
.satie-dt-tabs button[data-dot="warn"]::after{background:var(--warn)}
/* tasks for the coding agent (Part C): pinned above the conversation, one line each */
.satie-dt-chat .tasks{padding:6px 10px;border-bottom:1px solid var(--hair);display:flex;flex-direction:column;gap:2px}
.satie-dt-chat .tasks[hidden]{display:none}
.satie-dt-chat .tasks .th{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin-bottom:2px}
.satie-dt-chat .tasks .trow{display:flex;align-items:baseline;gap:8px;font-size:11.5px;min-width:0}
.satie-dt-chat .tasks .ts{flex:0 0 auto;font:10px var(--mono);color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:0 6px}
.satie-dt-chat .tasks .trow[data-status="taken"] .ts{color:var(--warn);border-color:var(--warn)}
.satie-dt-chat .tasks .trow[data-status="done"] .ts{color:var(--ink);border-color:var(--ink)}
.satie-dt-chat .tasks .tl{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.satie-dt-chat .tasks .tn{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mute)}
.satie-dt-chat .task{border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin-top:6px;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.satie-dt-chat .task[data-past="1"]{opacity:.7}
.satie-dt-agentsees{position:relative;font:10.5px/1.45 var(--mono);color:var(--mute);margin:6px 12px;padding:5px 9px 6px;border:1px dashed rgba(235,231,223,.22);border-radius:6px;cursor:default;min-width:0;max-width:210px;box-sizing:border-box}
.satie-dt-strip .satie-dt-agentsees{margin:0;flex:0 1 200px;align-self:center}
.satie-dt-agentsees:hover{border-color:rgba(235,231,223,.4)}
.satie-dt-agentsees .as-h{color:var(--faint,#5d5a55);margin-bottom:2px}
.satie-dt-agentsees .as-r{display:flex;gap:8px;min-width:0}
.satie-dt-agentsees .as-r .k{flex:none;width:58px;color:var(--faint,#5d5a55)}
.satie-dt-agentsees .as-r .v{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.satie-dt-agentsees .as-tip{position:absolute;right:0;top:calc(100% + 6px);z-index:20;width:270px;padding:10px 12px;background:#1b1a18;border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 34px rgba(0,0,0,.5);opacity:0;visibility:hidden;transform:translateY(-3px);transition:opacity .18s ease,transform .18s ease,visibility 0s .18s;pointer-events:none}
.satie-dt-agentsees:hover .as-tip{opacity:1;visibility:visible;transform:none;transition:opacity .18s ease .25s,transform .18s ease .25s,visibility 0s .25s}
.satie-dt-agentsees .as-tip .tt{font:11.5px/1.45 'IBM Plex Mono',monospace;color:var(--ink)}
.satie-dt-agentsees .as-l{display:flex;flex-direction:column;gap:2px;margin-top:8px;padding-top:7px;border-top:1px dashed rgba(235,231,223,.14)}
.satie-dt-agentsees.pub{border:0;padding:0;margin:0 14px 0 auto;max-width:none;flex:none;align-self:flex-end}
/* (2026-11-13) option B of three tried: a small two-line outline, so the variant pill beside it keeps its room */
.satie-dt-agentsees.pub .pubbtn{all:unset;display:inline-flex;flex-direction:column;align-items:flex-start;justify-content:center;height:34px;padding:0 11px;border-radius:6px;border:1px solid #d0605a;color:#fff;font:500 12px/1.15 var(--mono);white-space:nowrap;cursor:pointer;box-sizing:border-box}
.satie-dt-agentsees.pub .pubbtn:hover{background:rgba(208,96,90,.16);border-color:#e3726b}
.satie-dt-agentsees.pub .pt{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#f0a39e}
.satie-dt-agentsees.pub .pd{display:none}
.satie-dt-agentsees.pub .pg{color:#fff}
.satie-dt-agentsees .as-s{display:flex;flex-direction:column}
.satie-dt-agentsees .as-s .n{color:var(--ink);font:11.5px 'IBM Plex Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-agentsees .as-s .w,.satie-dt-agentsees .as-s.w{color:var(--faint,#5d5a55);font-size:10px}
.satie-dt .satie-dt-bar .undo.hdr{display:inline-flex;gap:0;margin-right:6px}
.satie-dt .satie-dt-bar .undo.hdr button{display:grid;place-items:center;width:28px;height:28px;padding:0;border-radius:6px;border-color:transparent;background:none;color:var(--mute)}
.satie-dt .satie-dt-bar .undo.hdr button svg{display:block}
.satie-dt .satie-dt-bar .undo.hdr button:hover:not(:disabled){color:var(--ink);background:rgba(235,231,223,.07)}
.satie-dt .satie-dt-bar .undo.hdr button:disabled{opacity:.3;cursor:default}
.satie-dt[data-chatbig="1"] .satie-dt-body,.satie-dt[data-chatbig="1"] .satie-dt-tools,.satie-dt[data-chatbig="1"] .satie-dt-hearing,.satie-dt[data-chatbig="1"] .satie-dt-tabs{display:none!important}
.satie-dt[data-chatbig="1"] .satie-dt-askfoot{flex:1;max-height:none}
.satie-dt[data-chatbig="1"] .satie-dt-chat{flex:1}
.satie-dt[data-chatbig="1"] .satie-dt-chat .thread{flex:1;max-height:none!important;height:auto!important}
.satie-dt-chat[data-dot="1"] .chead .titlebtn::after,.satie-dt-chat[data-dot="warn"] .chead .titlebtn::after{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--sound);margin-left:6px;vertical-align:middle}
.satie-dt-chat .task .tstate{display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:6px;border-top:1px solid var(--hair)}
.satie-dt-chat .task .tstate .big{font-size:13px;font-weight:500;color:var(--ink);display:flex;align-items:center;gap:7px}
.satie-dt-chat .task .tstate .big .spin{display:inline-flex;color:var(--mute)}
.satie-dt-chat .task .tstate .note{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-chat .task .tstate .alt{font-size:11.5px;color:var(--mute)}
.satie-dt-chat .task .tstate .alt button.link{color:var(--ink)}
.satie-dt-chat .task .tstate[data-status="taken"] .big{color:var(--warn)}
.satie-dt-chat .task .tstate .line{font:11px var(--mono);color:var(--ink);background:var(--fill);border:1px solid var(--line);border-radius:6px;padding:6px 8px;user-select:all;word-break:break-all}
.satie-dt-chat .task .tstate button{align-self:flex-start;font-size:11px;padding:2px 10px}
.satie-dt-chat .task .tt{font-weight:500;color:var(--ink)}
.satie-dt-chat .task .pd{color:var(--mute);font-size:11.5px}
.satie-dt-chat .task button.primary{margin-top:2px;font-size:11px;padding:3px 10px;border-color:var(--accent);color:var(--accent)}
.satie-dt-chat .task button.link{background:none;border:0;padding:0;color:var(--mute);font-size:11px;text-decoration:underline;cursor:pointer}
.satie-dt-grp{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px 4px;border-bottom:1px solid var(--hair);position:sticky;top:0;background:rgba(13,12,11,.97);z-index:1}
.satie-dt-grp > input[type=range]{flex-basis:100%;width:100%;accent-color:var(--accent);margin:5px 0 9px}
.satie-dt-grp .tri{width:16px;height:16px;padding:0;border:0;color:var(--mute);font-size:9px;background:transparent}
.satie-dt-grp .gname{font-size:11px;letter-spacing:0;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-grp .gname small{letter-spacing:0;text-transform:none;color:var(--mute);margin-left:6px;font-size:10.5px}
.satie-dt-grp .ms{display:flex;gap:4px}
.satie-dt-grp .ms button{width:22px;height:20px;padding:0;font-size:10px;border-radius:5px;color:var(--mute)}
.satie-dt-grp .ms button[data-on="1"]{color:var(--ink)}
.satie-dt .satie-dt-grp .ms button.gask{width:auto;padding:0 6px;opacity:.6}
.satie-dt-grp .gname{flex:1 1 auto;min-width:96px;overflow:hidden}
.satie-dt-grp:not(:hover) .ms button.ug{display:none}
.satie-dt-grp:hover .ms button.gask{opacity:1}
.satie-dt-row[data-child="1"]{padding-left:34px}
.satie-dt-row{padding:9px 16px 8px;border-bottom:1px solid var(--hair);display:grid;grid-template-columns:1fr auto;grid-template-areas:"name lv" "ctl ctl";row-gap:6px;transition:background .5s}
.satie-dt-row[data-fire="1"]{background:rgba(255,141,161,.08);transition:none}
.satie-dt-row[data-open="1"]{background:rgba(235,231,223,.03)}
.satie-dt-row[data-off="1"] .name,.satie-dt-row[data-off="1"] .meta{opacity:.4}
.satie-dt-row .name{grid-area:name;min-width:0;display:flex;align-items:baseline;gap:8px}
.satie-dt-row .name .kind{font-family:var(--mono);font-size:10px;color:var(--mute);flex:none}
.satie-dt-row .name .what{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-row .meta{grid-area:name;justify-self:start;align-self:end;display:none}
.satie-dt-row .lv{grid-area:lv;font-size:10.5px;color:var(--mute);text-align:right;white-space:nowrap;padding-left:8px}
.satie-dt-row .lv b{font-weight:500;color:var(--ink)}
.satie-dt-row .ctl{grid-area:ctl;display:flex;align-items:center;gap:8px}
.satie-dt-row .ms{display:flex;gap:4px}
.satie-dt-row .ms button{width:22px;height:20px;padding:0;font-size:10px;border-radius:5px;color:var(--mute)}
.satie-dt-row .ms button[data-on="1"]{color:var(--ink)}
.satie-dt-row .sub{font-size:10.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.satie-dt-row .acts{display:flex;gap:2px;flex:none}
.satie-dt-row .acts .x{color:var(--mute)}
.satie-dt-row .acts .x:hover{color:var(--danger)}
.satie-dt-row input[type=range]{width:92px;flex:none}
.satie-dt input[type=range]{-webkit-appearance:none;appearance:none;height:16px;background:transparent;margin:0}
.satie-dt input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:rgba(235,231,223,.2)}
.satie-dt input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#ebe7df;border:1px solid rgba(0,0,0,.25);margin-top:-4.5px;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.satie-dt input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:rgba(235,231,223,.2)}
.satie-dt input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#ebe7df;border:1px solid rgba(0,0,0,.25)}
.satie-dt-drawer{padding:10px 16px 14px 16px;border-bottom:1px solid var(--hair);background:rgba(235,231,223,.025)}
.satie-dt-feedback{display:flex;flex-wrap:wrap;gap:8px;overflow-wrap:anywhere}
.satie-dt-feedback .satie-dt-note,.satie-dt-feedback textarea,.satie-dt-feedback label{width:100%}
.satie-dt-feedback select,.satie-dt-feedback textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px}
.satie-dt .satie-dt-feedback textarea{min-height:80px;height:96px;flex:none;resize:vertical}
.satie-dt-src{display:flex;gap:12px;margin-bottom:10px}
.satie-dt-src button{border:0;padding:0 0 3px;color:var(--mute);background:transparent;border-bottom:1px solid transparent;border-radius:0;font-size:11px}
.satie-dt-src button:hover{background:transparent;color:var(--ink)}
.satie-dt-src button[data-on="1"]{color:var(--ink);background:transparent;border-bottom-color:var(--ink)}
.satie-dt-drawer .q{display:flex;gap:6px;align-items:center}
.satie-dt-drawer input[type=text]{flex:1;font:inherit;font-size:12px;color:var(--ink);background:var(--fill);border:1px solid var(--line);border-radius:6px;padding:5px 9px;min-width:0}
.satie-dt-drawer input[type=text]:focus{outline:0;border-color:rgba(235,231,223,.3)}
.satie-dt-cost{color:var(--mute);font-size:10.5px;margin-top:6px}
.satie-dt-hit{display:grid;grid-template-columns:24px 1fr auto auto;gap:8px;align-items:center;padding:5px 0;border-top:1px solid var(--hair)}
.satie-dt-hit:first-child{border-top:0}
.satie-dt-hit .p{width:24px;height:24px;border-radius:50%;padding:0;font-size:9px;color:var(--ink)}
.satie-dt-hit .p[data-on="1"]{background:rgba(235,231,223,.14);border-color:rgba(235,231,223,.5)}
.satie-dt-hit .n{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-hit .m{font-size:10px;color:var(--mute);white-space:nowrap}
.satie-dt-note{color:var(--mute);font-size:11px;padding:6px 0 2px}
.satie-dt-warn{color:var(--warn);font-size:11px;padding:6px 0 2px;line-height:1.45}
.satie-dt-list{margin-top:8px}
.satie-dt textarea{width:100%;height:100%;min-height:240px;resize:none;background:#0a0908;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:11.5px/1.5 var(--mono)}
.satie-dt textarea:focus{outline:0;border-color:rgba(235,231,223,.3)}
.satie-dt-scriptwrap{padding:10px 16px;height:100%}
.satie-dt-ev{padding:3px 16px;border-bottom:1px solid var(--hair);display:grid;grid-template-columns:44px 56px 1fr;gap:8px;font-size:11px}
.satie-dt-ev .t{color:var(--mute)}
.satie-dt-ev .k{color:var(--accent)}
.satie-dt-warnrow{color:var(--warn);padding:4px 16px;font-size:11px}
.satie-dt-foot{padding:8px 16px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.satie-dt-foot .st{color:var(--mute);font-size:11px;margin-left:auto}
.satie-dt-inspector{position:absolute;top:112px;width:360px;max-height:calc(100vh - 150px);overflow:auto;background:#151412;border:1px solid var(--line);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.5);z-index:40}
.satie-dt[data-corner=right] .satie-dt-inspector{right:calc(100% + 12px)}
.satie-dt[data-corner=left] .satie-dt-inspector{left:calc(100% + 12px)}
.satie-dt:not(.satie-dt-embedded){overflow:visible}
.satie-dt.satie-dt-embedded .satie-dt-inspector{right:12px;left:auto;width:min(360px,calc(100% - 24px))}
@media(max-width:800px){.satie-dt[data-corner] .satie-dt-inspector{right:12px;left:12px;width:auto}}
.satie-dt-inspector .ih{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px 8px;background:rgba(21,20,18,.98);border-bottom:1px solid var(--hair)}
.satie-dt-inspector .it{display:flex;align-items:baseline;gap:8px;min-width:0}
.satie-dt-inspector .it .sw{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none;align-self:center}
.satie-dt-inspector .it .n{font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-inspector .it small{font-size:11px;color:var(--mute);white-space:nowrap}
.satie-dt .satie-dt-inspector .ih .x{border:0;padding:0 4px;font-size:16px;color:var(--mute)}
.satie-dt-sound{padding:4px 16px 12px 16px;background:none}
.satie-dt-sound .sh{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin:12px 0 6px;font-size:10.5px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute)}
.satie-dt-sound .sh small{text-transform:none;letter-spacing:0;font-size:10.5px;opacity:.8}
.satie-dt-sound .desc{font-size:12px;color:var(--ink);margin-bottom:6px;display:flex;flex-direction:column;gap:5px}
.satie-dt-sound .desc .words{font-size:12px;line-height:1.45;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.satie-dt .satie-dt-sound .desc .link{all:unset;cursor:pointer;font-size:11px;color:var(--mute)}
.satie-dt .satie-dt-sound .desc .link:hover{color:var(--ink)}
.satie-dt-sound .desc textarea{height:auto;min-height:0;max-height:120px;width:100%;resize:vertical;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:5px 7px;font:12px/1.45 inherit;font-family:inherit}
.satie-dt .satie-dt-sound .desc .pill{align-self:flex-start}
.satie-dt-sound .takes{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:3px 0}
.satie-dt-sound .takes .tl{flex:0 0 96px;font-size:11.5px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-sound .tk{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:12px;padding:1px 2px 1px 1px}
.satie-dt-sound .tk[data-missing="1"]{opacity:.45;border-style:dashed}
.satie-dt-sound .tk[data-open="1"]{border-color:rgba(235,231,223,.7)}
.satie-dt-sound .tmenu{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 2px;padding:6px 8px;border:1px solid var(--line);border-radius:6px}
.satie-dt-sound .tmenu .tl{font-size:11.5px;color:var(--mute);margin-right:4px}
.satie-dt .satie-dt-sound .tk .pv{width:20px;height:20px;border-radius:10px;border:0;padding:0;display:inline-flex;align-items:center;justify-content:center;background:rgba(235,231,223,.08);color:var(--ink)}
.satie-dt .satie-dt-sound .tk .pv[data-state=playing]{background:#ff8da1;color:#0d0c0b}
.satie-dt .satie-dt-sound .tk .tn{border:0;padding:0 6px 0 4px;font-size:11px;color:var(--mute)}
.satie-dt .satie-dt-sound .tk .tn:hover{color:var(--ink)}
.satie-dt-sound .finder{margin:6px 0 2px;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.satie-dt-sound .finder .fh{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;font-size:11.5px;color:var(--ink);background:var(--fill)}
.satie-dt .satie-dt-sound .finder .fh .x{border:0;padding:0 4px;color:var(--mute);font-size:14px}
.satie-dt-sound .finder .satie-dt-drawer{border:0;background:none;padding:8px 10px 10px}
.satie-dt-sound .satie-dt-props{padding:0;border:0;background:none}
.satie-dt-card .cdials{display:flex;flex-direction:column;gap:12px;padding:12px 16px 4px}
.satie-dt-card .cdial{display:flex;flex-direction:column;gap:4px}
.satie-dt-card .cdh{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.satie-dt-card .cdn{font-size:12.5px;color:var(--ink)}
.satie-dt-card .cdtag{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute)}
.satie-dt-card .cdr{display:flex;align-items:center;gap:8px}
.satie-dt-card .cdr input[type=range]{flex:1;min-width:0}
.satie-dt-card .cde{font-size:11px;color:var(--mute);white-space:nowrap}
.satie-dt-card .cdw{font-size:12px;color:var(--ink)}
.satie-dt-card .cdo{font-size:11px;color:var(--ink);opacity:.85;min-height:15px}
.satie-dt-card .cdx{font-family:var(--mono);font-size:10.5px;color:var(--mute)}
.satie-dt-card details.card-adv{margin-top:10px}
.satie-dt-card .coff{display:flex;flex-direction:column;gap:6px;padding:12px 16px 0}
.satie-dt-card .csh{font-size:10.5px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute)}
.satie-dt-card .cof{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:rgba(235,231,223,.03);color:var(--ink);font:inherit;cursor:pointer}
.satie-dt-card .cof:hover{border-color:rgba(235,231,223,.45)}
.satie-dt-card .cot{font-size:12.5px}
.satie-dt-card .coe{font-size:11px;color:var(--mute)}
.satie-dt-card .clisten{display:flex;align-items:center;gap:10px;padding:12px 16px 0}
.satie-dt-card .clb{flex:none;border:1px solid var(--line);border-radius:999px;background:rgba(235,231,223,.06);color:var(--ink);font:inherit;font-size:12px;padding:5px 14px;cursor:pointer}
.satie-dt-card .clb[data-on="1"]{background:transparent;border-color:var(--accent);color:var(--accent)}
.satie-dt-card .clw{font-size:11.5px;color:var(--mute)}
.satie-dt-card .cof.cchange{flex-direction:row;align-items:center;justify-content:space-between;padding:10px 12px;background:transparent;border-color:var(--line)}
.satie-dt-card .cof.cchange::after{content:'\\2192';color:var(--mute);font-size:16px}
.satie-dt-card .cof.cchange .cot{font-size:13px}
.satie-dt-card .cchips{display:flex;flex-wrap:wrap;gap:6px}
.satie-dt-card .cchips .cof{flex-direction:row;border-radius:999px;padding:4px 11px}
.satie-dt-card .cchips .cot{font-size:11.5px}
.satie-dt-card .cmore{border-top:1px solid var(--hair);margin-top:12px}
.satie-dt-card .cmore>summary{padding:10px 16px;font-size:12px;color:var(--mute);cursor:pointer;list-style-position:inside}
.satie-dt-card .cmore>summary:hover{color:var(--ink)}
.satie-dt-card .cmore>.cdials{padding-top:2px}
.satie-dt-card .cmore>.cmove{margin-top:4px}
.satie-dt-card .cfind .pv{flex:none;width:24px;height:24px;border-radius:12px;border:0;padding:0;background:rgba(235,231,223,.1);color:var(--ink);font-size:9px;cursor:pointer}
.satie-dt-card .cfr[data-playing="1"] .pv{background:#ff8da1;color:#0d0c0b}
.satie-dt-card .cfind .cfn{border:0;background:none;padding:0;text-align:left;cursor:pointer;font:inherit;font-size:12.5px;white-space:normal;text-overflow:clip;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3}
.satie-dt-card .cfrt .pri{flex:none;background:none;color:#ebe7df;border:1px solid rgba(235,231,223,.5);border-radius:999px;padding:2px 11px;font:inherit;font-size:11.5px;cursor:pointer}
.satie-dt-card .cfrt .pri:hover:not(:disabled){background:#ebe7df;color:#0d0c0b}
.satie-dt-card .cfrt .pri:disabled{opacity:.4;cursor:default}
.satie-dt-card .cfr .cfm{padding-left:32px;align-items:center;gap:10px}
.satie-dt-card .cfm .pri{flex:none;background:#ebe7df;color:#0d0c0b;border:0;border-radius:999px;padding:3px 14px;font:inherit;font-size:11.5px;cursor:pointer}
.satie-dt-card .cfm .pri:disabled{opacity:.4;cursor:default}
.satie-dt-card .cshort{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:1px dashed rgba(235,231,223,.45);border-radius:8px;background:rgba(235,231,223,.05);transition:background .2s,border-color .2s}
.satie-dt-card .cshort[data-over="1"]{background:rgba(235,231,223,.14);border-color:#ebe7df;border-style:solid}
.satie-dt-card .cshh{display:flex;align-items:center;gap:8px;padding-bottom:2px}
.satie-dt-card .cshn{font-size:12.5px;color:#ebe7df}
.satie-dt-card .cshc{font-size:11px;color:var(--mute);font-variant-numeric:tabular-nums}
.satie-dt-card .cshe{font-size:11.5px;color:var(--mute);line-height:1.4;padding:2px 0 4px}
.satie-dt-card .cshort .cfr{border-top:1px solid rgba(235,231,223,.15)}
.satie-dt-card .csub{font-size:11px;color:var(--mute);padding-top:6px}
.satie-dt-card .csub[data-close="0"]{color:var(--warn)}
.satie-dt-card .cftake{padding-left:32px;font-size:11px;color:var(--mute)}
.satie-dt-card .cftake[data-close="0"]{color:var(--warn)}
.satie-dt-card .cfr[draggable="true"]{cursor:grab}
.satie-dt-card .cfadd{flex:none;border:1px solid rgba(235,231,223,.45);border-radius:999px;background:none;color:#ebe7df;font:inherit;font-size:11px;padding:2px 9px;cursor:pointer;white-space:nowrap}
.satie-dt-card .cfadd:hover{background:rgba(235,231,223,.12)}
.satie-dt-card .cfx{flex:none;border:0;background:none;color:var(--mute);font-size:14px;line-height:1;padding:2px 4px;cursor:pointer}
.satie-dt-card .cfx:hover{color:var(--ink)}
.satie-dt-card .cfsteer{font-size:11.5px;color:var(--ink)}
.satie-dt-card .cfv{flex:none;border:1px solid var(--line);border-radius:999px;background:none;color:var(--mute);font:inherit;font-size:11px;padding:2px 9px;cursor:pointer;white-space:nowrap}
.satie-dt-card .cfv:hover{color:var(--ink)}
.satie-dt-card .cfv[data-verdict="closer"][data-on="1"]{border-color:#ebe7df;color:#ebe7df;background:rgba(235,231,223,.1)}
.satie-dt-card .cfv[data-verdict="less-close"][data-on="1"]{border-color:var(--ink);color:var(--ink);background:rgba(235,231,223,.08)}
.satie-dt-card .cfr[data-verdict="less-close"] .cfn{opacity:.45}
.satie-dt-card .csteer{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:8px 0 2px;border-top:1px solid var(--hair)}
.satie-dt-card .csl{font-size:11px;color:var(--mute);margin-right:2px}
.satie-dt-card .cchip{display:inline-flex;align-items:center;gap:2px;border-radius:999px;padding:1px 4px 1px 9px;font-size:11px;border:1px solid var(--line)}
.satie-dt-card .cchip.more{color:#ebe7df;border-color:rgba(235,231,223,.45)}
.satie-dt-card .cchip.less{color:var(--mute)}
.satie-dt .satie-dt-card textarea.cfnotepad{field-sizing:content;flex:none;box-sizing:border-box;width:100%;min-width:0;height:auto;min-height:160px;max-height:none;resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;background:transparent;color:var(--ink);border:1px solid transparent;border-radius:8px;padding:8px;font:inherit;font-size:13px;line-height:1.65}
.satie-dt .satie-dt-card textarea.cfnotepad:hover{border-color:var(--line)}
.satie-dt .satie-dt-card textarea.cfnotepad:focus{outline:1px solid var(--accent);outline-offset:2px;border-color:var(--accent)}
.satie-dt-card .cprop{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid rgba(235,231,223,.35);border-radius:8px;background:rgba(235,231,223,.05)}
.satie-dt-card .cpt{font-size:12.5px;color:var(--ink);line-height:1.45}
.satie-dt-card .cacts{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.satie-dt-card .cseg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden}
.satie-dt-card .cseg button{border:0;border-radius:0;background:none;color:var(--mute);font:inherit;font-size:11px;padding:3px 10px;cursor:pointer}
.satie-dt-card .cseg button[data-on="1"]{background:rgba(235,231,223,.12);color:var(--ink)}
.satie-dt-card .cacts .pri{background:#ebe7df;color:#0d0c0b;border:0;border-radius:999px;padding:4px 12px;font:inherit;font-size:11.5px;cursor:pointer}
.satie-dt-card .cacts .pri:hover{background:#f6f3ec}
.satie-dt-card .cdtrack{position:relative;flex:1;display:flex;align-items:center;min-width:0}
.satie-dt-card .cdtrack input[type=range]{flex:1;min-width:0}
.satie-dt-card .cdghost{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border:1.5px solid var(--mute);border-radius:50%;pointer-events:none;opacity:.8}
.satie-dt-card .cnote{margin:6px 16px 0;font-size:11px;color:var(--warn)}
.satie-dt-card .csay{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.satie-dt-card .csr{display:flex;align-items:flex-end;gap:8px}
.satie-dt .satie-dt-card .csr textarea{flex:1;box-sizing:border-box;min-width:0;min-height:64px;max-height:none;resize:none;overflow:hidden;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:inherit;font-size:12.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.satie-dt-card .csr textarea:focus{outline:1px solid var(--accent);outline-offset:2px}
.satie-dt-card .csr button{border-radius:8px;padding:8px 12px}
.satie-dt-card .cfsearch{display:flex;align-items:center;gap:12px;padding:12px 0}
.satie-dt-card .cfsearch .cft{line-height:1.5;white-space:normal}
.satie-dt-card .cfsearch .cfs{margin-top:4px;line-height:1.5}
.satie-dt-card .cfscan{display:flex;align-items:center;gap:3px;flex:none;height:24px;color:var(--accent)}
.satie-dt-card .cfscan span{width:3px;height:12px;background:currentColor;border-radius:2px;animation:satie-find-scan 1.8s ease-in-out infinite}
.satie-dt-card .cfscan span:nth-child(2){animation-delay:.2s}
.satie-dt-card .cfscan span:nth-child(3){animation-delay:.4s}
@keyframes satie-find-scan{0%,100%{transform:scaleY(.5);opacity:.4}50%{transform:scaleY(1);opacity:1}}
@media(prefers-reduced-motion:reduce){.satie-dt-card .cfscan span{animation:none}}
.satie-dt-card .cfind{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--line);border-radius:8px;background:rgba(235,231,223,.03)}
.satie-dt-card .cfh{display:flex;align-items:center;justify-content:space-between}
.satie-dt-card .cft{font-size:12.5px;color:var(--ink)}
.satie-dt-card .cfs{font-size:11.5px;color:var(--mute)}
.satie-dt-card .cfr{display:flex;flex-direction:column;gap:6px;padding:6px 0;border-top:1px solid var(--hair)}
.satie-dt-card .cfr[data-playing="1"] .cfn{color:#ff8da1}
.satie-dt-card .cfrt{display:flex;align-items:center;gap:8px;min-width:0}
.satie-dt-card .cfn{flex:1;min-width:0;font-size:12px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-card .cfm{display:flex;gap:4px;flex-wrap:wrap}
.satie-dt-card .cfv{border:1px solid var(--line);border-radius:999px;background:rgba(235,231,223,.06);color:var(--ink);font:inherit;font-size:11px;padding:2px 9px;cursor:pointer}
.satie-dt-card .cfv.quiet{background:none;color:var(--mute)}
.satie-dt-card .cfv[data-on="1"]{border-color:#ebe7df;color:#ebe7df}
.satie-dt-card .cfu{display:flex;align-items:center;gap:8px}
.satie-dt-card .cfu .pri{background:#ebe7df;color:#0d0c0b;border:0;border-radius:999px;padding:3px 11px;font:inherit;font-size:11.5px;cursor:pointer;flex:none;white-space:nowrap}
.satie-dt-card .cfu{flex-wrap:wrap}
.satie-dt-card .cfind button.link{flex:none;border:0;background:none;padding:0;color:var(--mute);font:inherit;font-size:11px;text-decoration:underline;text-underline-offset:2px;cursor:pointer;white-space:nowrap}
.satie-dt-card .cfind button.link:hover{color:var(--ink)}
.satie-dt-card .cfnew{flex:none;font-size:9.5px;font-family:var(--mono);letter-spacing:.01em;color:#0d0c0b;background:#ebe7df;border-radius:4px;padding:1px 5px}
.satie-dt-card .cff{padding-top:12px;border-top:1px solid var(--hair)}
.satie-dt-card .cfu .pri.cfgen{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:44px;border-radius:8px;padding:12px 16px;background:var(--accent);color:var(--bg);font-size:13px;font-weight:500;text-align:left;white-space:normal;line-height:1.45}
.satie-dt-card .cfgen-arrow{flex:none;font-size:20px}
.satie-dt-card .cfgen-hint{margin-top:8px;line-height:1.45}
.satie-dt-card .cfu .pri.cfmake{background:var(--accent);color:var(--bg);border-radius:8px;min-height:40px;padding:8px 16px;font-size:13px;white-space:normal}
.satie-dt-card .cfu .pri:disabled{opacity:.45;cursor:default}
.satie-dt-card .cfu .pri:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.satie-dt-card .cfplan{display:flex;flex-direction:column;gap:8px;box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--line);border-radius:8px}
.satie-dt-card .cdver{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;font-size:11px;color:var(--mute)}
.satie-dt-card .source-chooser{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0}
.satie-dt-card .source-chooser textarea{width:100%;min-height:80px;resize:vertical}
.satie-dt-card .source-chooser select{width:100%;min-width:0}
.satie-dt-card select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:6px}
.satie-dt-card .cdver button.link{border:0;background:none;padding:0;color:var(--ink);font:inherit;font-size:11px;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.satie-dt-card .cmove{display:flex;flex-direction:column;gap:7px;padding:14px 16px 4px;border-top:1px solid var(--hair);margin-top:10px}
.satie-dt-card .cmc{display:flex;flex-wrap:wrap;gap:5px}
.satie-dt-card .ccrowd{padding:10px 16px 0}
.satie-dt-card .cff{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding-top:4px;border-top:1px solid var(--hair)}
.satie-dt-card .csreply{font-size:12px;color:var(--ink);line-height:1.45;padding:6px 8px;border-left:2px solid var(--line)}
.satie-dt-card details.cunch>summary{font-size:11px;color:var(--mute);cursor:pointer}
.satie-dt-card details.cunch[open]{display:flex;flex-direction:column;gap:12px}
.satie-dt-card .cdial[data-instead="1"] .cdw{color:var(--mute);font-size:11.5px}
.satie-dt-card .ctiming{display:flex;flex-direction:column;gap:12px}
.satie-dt-card .cstrip{display:flex;flex-direction:column;gap:3px}
.satie-dt-card .cstl{position:relative;height:14px;border-bottom:1px solid var(--line)}
.satie-dt-card .cstl i{position:absolute;bottom:0;width:2px;height:10px;margin-left:-1px;background:#ff8da1;border-radius:1px}
.satie-dt-card .cstc{display:flex;justify-content:space-between;font-size:10.5px;color:var(--mute)}
.satie-dt-props .why{flex-basis:100%;font-size:10.5px;color:var(--mute)}
.satie-dt-prow[data-edited="1"]{background:rgba(235,231,223,.10);border-radius:5px;transition:background 1.2s ease}
.satie-dt-prow[data-satie="1"]{box-shadow:inset 2px 0 0 rgba(235,231,223,.7)}
.satie-dt-prow[data-release="1"] .pl::after{content:' ·';color:var(--mute)}
.satie-dt-sound .when{display:flex;flex-direction:column;gap:5px;margin:2px 0 8px}
.satie-dt-sound .when .wrow{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:12px}
.satie-dt-sound .when .wl{width:78px;flex:none;color:var(--mute);font-size:11px}
.satie-dt-selbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px;border-bottom:1px solid rgba(235,231,223,.45);background:#1a1918;position:sticky;top:0;z-index:5;box-shadow:0 4px 10px rgba(0,0,0,.35)}
.satie-dt-selbar .n{font-size:12px;color:var(--ink);margin-right:4px}
.satie-dt-selbar input[type=range]{width:110px}
.satie-dt .satie-dt-selbar button{font-size:11px;padding:2px 8px}
.satie-dt-selbar .gname{flex:1;min-width:140px;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:4px 7px;font:inherit;font-size:12px}
@keyframes satie-dt-flash{0%{box-shadow:inset 0 0 0 2px rgba(235,231,223,.85),0 0 18px rgba(235,231,223,.35)}100%{box-shadow:inset 0 0 0 2px rgba(235,231,223,0),0 0 0 rgba(235,231,223,0)}}
.satie-dt-chat[data-flash="1"]{animation:satie-dt-flash 1.4s ease-out}
.satie-dt-body{overflow-x:hidden}
.satie-dt-sound .vary .tturn{flex-wrap:nowrap}
.satie-dt-sound .vary input[type=range]{flex:1 1 90px;min-width:70px}
.satie-dt-sound .vary .mono{white-space:nowrap;min-width:72px}
.satie-dt-sound .sh small{white-space:normal}
.satie-dt-groundrow{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:11px;color:var(--mute);border-bottom:1px solid var(--hair)}
.satie-dt-sound .when .wopts{display:flex;flex-wrap:wrap;gap:5px;flex:1;min-width:0}
.satie-dt-sound .where{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.satie-dt-sound .where + .where{margin-top:4px}
.satie-dt .satie-dt-sound .where .wsel{background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:3px 6px;font:inherit;font-size:12px;max-width:150px}
.satie-dt-sound .follow .sig{color:var(--ink)}
.satie-dt .satie-dt-sound .wtext{flex:1;min-width:140px;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:4px 7px;font:inherit;font-size:12px}
.satie-dt .satie-dt-sound .link[data-on="1"],.satie-dt .satie-dt-sound .ghostbtn[data-on="1"],.satie-dt .satie-dt-sound .pill[data-on="1"]{border-color:rgba(235,231,223,.8);background:rgba(235,231,223,.16);color:var(--ink)}
.satie-dt-inline{padding:4px 0 8px;border-bottom:1px solid var(--hair);margin-bottom:6px}
.satie-dt-inline .msg{font-size:12px}
.satie-dt-chat .reading .rhint{font-size:10.5px;color:var(--mute);margin-top:3px}
.satie-dt .satie-dt-sound .when .pill[data-on="1"],.satie-dt .satie-dt-sound .when .wsel[data-on="1"]{border-color:rgba(235,231,223,.6);background:rgba(235,231,223,.12);color:var(--ink)}
.satie-dt .satie-dt-sound .when .wsel{background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;font:inherit;font-size:11.5px;padding:2px 4px;max-width:210px}
.satie-dt-sound .when small{color:var(--mute);font-size:10.5px;flex-basis:100%;padding-left:83px}
.satie-dt-sound .surf{display:flex;align-items:center;gap:7px;font-size:12px;padding:2px 0;cursor:pointer}
.satie-dt-sound .surf .sl{min-width:90px;color:var(--ink)}
.satie-dt-sound .surf small{flex:1;color:var(--mute);font-size:10.5px}
.satie-dt .satie-dt-sound .surf .tri{border:0;background:none;padding:0 2px;color:var(--mute)}
.satie-dt-sound .vary{display:flex;flex-direction:column;gap:2px;margin:4px 0 6px}
.satie-dt-sound .vary input[type=range]{width:130px}
.satie-dt-sound .vary .mono{font-size:11px;color:var(--mute);min-width:64px}
.satie-dt .satie-dt-sound .when .num{width:56px;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:2px 5px;font:inherit;font-size:11.5px}
.satie-dt-row .kind[data-k]{display:inline-flex;align-items:center;gap:4px;text-transform:none;letter-spacing:0;font-size:10.5px;padding:0 6px;border-radius:999px;border:1px solid currentColor;opacity:.85}
.satie-dt-row .kind[data-k="around"]{color:var(--mute)}
.satie-dt-row .kind[data-k="yours"]{color:var(--ink)}
.satie-dt-row .kind[data-k="moving"]{color:var(--mute)}
.satie-dt-row .kind[data-k="event"]{color:var(--mute)}
.satie-dt-row .kind[data-k="place"]{color:var(--mute)}
.satie-dt-row .kind[data-k="contact"]{color:var(--mute)}
.satie-dt-sound .tturn{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:2px 0;font-size:12px}
.satie-dt-sound .tturn .tl{width:auto;min-width:78px;color:var(--mute);font-size:11px;margin-right:4px}
.satie-dt .satie-dt-sound .tturn .pill[data-on="1"]{border-color:rgba(235,231,223,.6);background:rgba(235,231,223,.12);color:var(--ink)}
.satie-dt-sound .parts{display:flex;flex-direction:column;gap:4px;margin:2px 0 6px}
.satie-dt-sound .parts .part{display:flex;align-items:center;gap:7px;font-size:12px}
.satie-dt-sound .parts .part[data-cur="1"] .pn{color:var(--accent)}
.satie-dt-sound .parts .part .pn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-sound .parts .part small{color:var(--mute);font-size:10.5px}
.satie-dt-sound .parts .pill{align-self:flex-start}
.satie-dt-row[data-satie="1"]{box-shadow:inset 2px 0 0 rgba(235,231,223,.55)}
.satie-dt-prow[data-ghost="1"] .pl{opacity:.6}
.satie-dt .satie-dt-prow .ghostbtn{font-size:11px;color:var(--mute);border-style:dashed}
.satie-dt-sound .pw .chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}
.satie-dt .satie-dt-sound .pw .chip{font-size:11px;padding:2px 8px;border-radius:10px}
.satie-dt .satie-dt-sound .pw .chip[data-on="1"]{border-color:rgba(235,231,223,.6);background:rgba(235,231,223,.12);color:var(--ink)}
.satie-dt-sound .pw{flex-wrap:wrap}
.satie-dt-sound .lvv{font-size:11px;color:var(--mute);min-width:48px;text-align:right}
.satie-dt-sound .status{font-size:11.5px;color:var(--accent);min-height:0}
.satie-dt-sound .status:empty{display:none}
.satie-dt-sound .pw .note{font-size:11.5px;color:var(--mute);line-height:1.4}
.satie-dt-sound .hint{font-size:11px;color:var(--mute);margin-top:4px;line-height:1.45}
.satie-dt .satie-dt-sound .where .link{all:unset;cursor:pointer;font-size:11px;color:var(--mute)}
.satie-dt-sound .where{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink)}
.satie-dt-aimbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 16px;font-size:11.5px;color:var(--ink);background:rgba(235,231,223,.10);border-bottom:1px solid rgba(235,231,223,.35)}
.satie-dt .satie-dt-aimbar .x{font-size:10.5px;padding:1px 8px;color:var(--mute)}
.satie-dt-sound .satie-dt-ask{padding:2px 0 4px;border:0}
.satie-dt-props{padding:6px 16px 12px 16px;border-bottom:1px solid var(--hair);background:rgba(235,231,223,.025)}
.satie-dt-prow{display:flex;align-items:center;gap:8px;padding:3px 0;min-height:24px}
.satie-dt-prow[data-ghost="1"]{opacity:.55}
.satie-dt-prow:hover{opacity:1}
.satie-dt-prow .pl{font-size:11px;width:84px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
.satie-dt-prow[data-ghost="0"] .pl{color:var(--ink)}
.satie-dt-prow[data-inherited="1"] .pl{opacity:.5}
.satie-dt-prow .pw{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.satie-dt-prow input[type=range]{flex:1;min-width:60px}
.satie-dt-prow .ro{font-size:10.5px;color:var(--mute);width:48px;text-align:right;background:transparent;border:0;font-family:var(--mono);font-variant-numeric:tabular-nums}
.satie-dt-prow .ro:focus{outline:0;color:var(--ink)}
.satie-dt-prow input[type=text],.satie-dt-prow input[type=number],.satie-dt-prow select{font:inherit;font-size:11px;color:var(--ink);background:var(--fill);border:1px solid var(--line);border-radius:6px;padding:3px 7px;min-width:0}
.satie-dt-prow input[type=number]{width:56px}
.satie-dt-prow select{max-width:150px}
.satie-dt-prow .tg{width:26px;height:14px;border-radius:999px;padding:1px;border:1px solid rgba(235,231,223,.16);background:transparent;display:flex;align-items:center;justify-content:flex-start;cursor:pointer}
.satie-dt-prow .tg[data-on="1"]{justify-content:flex-end;background:rgba(235,231,223,.19);border-color:rgba(235,231,223,.33)}
.satie-dt-prow .tg i{width:10px;height:10px;border-radius:50%;background:rgba(235,231,223,.27)}
.satie-dt-prow .tg[data-on="1"] i{background:var(--ink)}
.satie-dt-prow .ghostbtn{font-size:10.5px;color:var(--mute);border:1px dashed var(--line);background:transparent;border-radius:6px;padding:2px 9px}
.satie-dt-prow .ic{color:var(--mute);padding:0 3px;background:transparent;border:0;font-size:11px;cursor:pointer;opacity:.5}
.satie-dt-prow .ic:hover{opacity:1;color:var(--ink)}
.satie-dt-cmp{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.satie-dt-cmp .part{display:flex;align-items:center;gap:8px}
.satie-dt-cmp .part span{font-size:10px;color:var(--mute);width:56px}
.satie-dt-cmp .part .ro{width:40px}
.satie-dt-more{font-size:10.5px;color:var(--mute);margin-top:6px;border:0;padding:2px 0}
.satie-dt-more:hover{background:transparent;color:var(--ink)}
/* ---- prototype look: bar, view strip, rows, selection, linked hover ---- */
.satie-dt-prow .follow{font-size:11px;color:var(--ink);line-height:1.4}
.satie-dt-prow .follow b{font-weight:400;color:var(--mute)}
.satie-dt-prow .follow code{font-family:var(--mono);font-size:10.5px;color:#ebe7df}
.satie-dt-bar .mark{width:20px;height:auto;display:block;color:var(--ink);flex:none}
.satie-dt-bar .mark svg{width:20px;height:auto;display:block}
.satie-dt-bar .ttl{margin:0;font-size:13px;font-weight:500;color:var(--ink);letter-spacing:-.005em}
.satie-dt-bar .x{border:0;font-size:17px;line-height:1;color:var(--mute);padding:0 4px}
.satie-dt-bar .x:hover{color:var(--ink);background:transparent}
.satie-dt-tabs{gap:0}
.satie-dt-view{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--line)}
.satie-dt-view:empty{display:none}
.satie-dt button:focus{outline:none}
.satie-dt button:focus-visible,.satie-dt input:focus-visible{outline:2px solid rgba(235,231,223,.4);outline-offset:-2px}
.satie-dt-view .undo{margin-left:auto;display:flex;gap:4px}
.satie-dt .satie-dt-view .undo button{font-size:11px;padding:2px 9px}
.satie-dt .satie-dt-view .undo button:disabled{opacity:.35;cursor:default}
.satie-dt-view .lbl{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute)}
.satie-dt-view .seg{display:flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.satie-dt .satie-dt-view .seg button{border:0;border-radius:0;font-size:10.5px;padding:2px 8px;color:var(--mute)}
.satie-dt .satie-dt-view .seg button[data-on="1"]{background:rgba(235,231,223,.1);color:var(--ink)}
.satie-dt .satie-dt-view .fm{margin-left:4px}
.satie-dt .satie-dt-view .loc:not(.fm){margin-left:auto}
.satie-dt .satie-dt-view .loc{font-size:10.5px;padding:2px 8px;color:#ebe7df;border-color:rgba(235,231,223,.35)}
.satie-dt .satie-dt-view .loc[data-on="0"]{color:var(--mute);border-color:var(--line)}
.satie-dt-grp{cursor:pointer;user-select:none;-webkit-user-select:none;transition:opacity .15s ease,background .15s ease}
.satie-dt-grp .gname{font-size:10px;letter-spacing:.08em}
.satie-dt-grp .cnt{display:none;color:var(--mute);font-size:10.5px;letter-spacing:0;text-transform:none;margin-left:6px}
.satie-dt-grp[data-collapsed="1"] .cnt{display:inline}
.satie-dt-grp .tri{border-radius:4px}
.satie-dt-grp .tri:hover{background:rgba(235,231,223,.08);color:var(--ink)}
.satie-dt-grp[data-sel="1"]{background:rgba(235,231,223,.07);box-shadow:inset 2px 0 0 #ebe7df}
/* a picked thing is marked by its bar and tint, not green words: green words are sounds */
.satie-dt-grp[data-sel="1"] .gname{color:var(--ink)}
.satie-dt .ms button[data-on="1"]{color:#0d0c0b;background:var(--ink);border-color:var(--ink)}
.satie-dt .ms button[data-part="1"]{border-color:rgba(235,231,223,.55);background:linear-gradient(to top,rgba(235,231,223,.62) calc(var(--f,0) * 100%),transparent calc(var(--f,0) * 100%))}
.satie-dt-row{grid-template-areas:"name lv" "sub sub" "ctl ctl";row-gap:3px;column-gap:8px;padding:9px 16px 9px 28px;border-left:2px solid transparent;cursor:pointer;user-select:none;-webkit-user-select:none;transition:opacity .15s ease,background .15s ease}
.satie-dt-row[data-child="1"]{padding-left:28px}
.satie-dt-row:hover{background:rgba(235,231,223,.035)}
.satie-dt-row .sw{width:7px;height:7px;border-radius:50%;flex:none;align-self:center;background:var(--c,#ff8da1)}
.satie-dt-row .sub{grid-area:sub}
.satie-dt-row .ctl{min-width:0}
.satie-dt-row .ctl input[type=range]{flex:1;width:auto;min-width:60px}
.satie-dt-row .trim{flex:none;width:40px;font-size:10.5px;color:var(--mute);text-align:right;font-variant-numeric:tabular-nums}
.satie-dt-row .acts .fire{color:var(--ink)}
.satie-dt-row[data-sel="1"]{background:rgba(235,231,223,.07);border-left-color:#ebe7df}
/* two strengths of green (2026-10-18): a sound you picked has the bar and the tint (and opens in full); the
   sounds of a thing you picked carry the bar only, and stay compact under the thing's green header */
.satie-dt-row[data-sel="1"]:not([data-full="1"]){background-color:transparent}
.satie-dt[data-hovering="1"] .satie-dt-row:not([data-hover="1"]),.satie-dt[data-hovering="1"] .satie-dt-grp>*{opacity:.4}
.satie-dt-row[data-hover="1"]{background:rgba(235,231,223,.1);box-shadow:inset 2px 0 0 var(--c,#ff8da1)}
.satie-dt-row[data-fire="1"]{background:rgba(255,141,161,.12)}
.satie-dt-row[data-off="1"]{opacity:.45}
.satie-dt-row[data-off="1"] .name,.satie-dt-row[data-off="1"] .meta{opacity:1}
/* Swap preview: the web library's 28px button: play, a spinning arc while loading, a stop square while playing. */
.satie-dt-hit{grid-template-columns:28px minmax(0,1fr) auto 44px}
.satie-dt-hit>div:nth-child(2){min-width:0}
.satie-dt-hit .m{max-width:88px;overflow:hidden;text-overflow:ellipsis}
.satie-dt .satie-dt-hit .pill{justify-self:end}
.satie-dt .satie-dt-hit .pv{width:28px;height:28px;border-radius:14px;border:0;padding:0;display:flex;align-items:center;justify-content:center;background:rgba(235,231,223,.08);color:var(--ink)}
.satie-dt .satie-dt-hit .pv[data-state=playing]{background:var(--ink);color:#0d0c0b}
.satie-dt-hit .bar{height:2px;margin-top:3px;background:rgba(235,231,223,.1);border-radius:2px;overflow:hidden}
.satie-dt-hit .bar i{display:block;height:100%;width:0;background:#ff8da1}
.satie-dt .satie-dt-hit .pill{color:#ebe7df;border-color:rgba(235,231,223,.35)}
.satie-spin{animation:satie-spin .9s linear infinite}
@keyframes satie-spin{to{transform:rotate(360deg)}}
/* History: the web app's version tree, for the mixer. */
.satie-dt-hbar{display:flex;gap:6px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--hair)}
.satie-dt-hbar small{color:var(--mute);margin-left:auto;font-size:10px}
.satie-dt-node{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:7px 16px;border-left:2px solid transparent;cursor:pointer;font-size:11.5px}
.satie-dt-node:hover{background:rgba(235,231,223,.04)}
.satie-dt-node .l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-node .t{color:var(--mute);font-size:10px;font-variant-numeric:tabular-nums}
.satie-dt-node .k{grid-column:1/-1;color:var(--mute);font-size:10px}
.satie-dt-node[data-head="1"]{border-left-color:#ebe7df;background:rgba(235,231,223,.07)}
.satie-dt-node[data-left="1"]{opacity:.5}
.satie-dt-node[data-left="1"] .k::after{content:" · tried and left"}
.satie-dt-peek{position:absolute;left:16px;right:16px;z-index:3;padding:5px 10px;border-radius:8px;font-size:11px;color:var(--ink);background:rgba(30,29,27,.96);border:1px solid rgba(235,231,223,.35);box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;pointer-events:none;transition:opacity .15s ease}
.satie-dt-peek[data-on="1"]{opacity:1}
/* History, as SATIE web draws it */
.satie-dt-hist{padding:12px 16px 16px;font-size:12.5px}
.satie-dt .satie-dt-hist .dtog{all:unset;cursor:pointer;font:inherit;color:var(--mute)}
.satie-dt .satie-dt-hist .dtog:hover{color:var(--ink)}
.satie-dt-hist .hdiff{display:block;margin-top:5px;font:11px/1.45 var(--mono);white-space:pre-wrap;cursor:text;border-left:1px solid var(--line);padding-left:8px}
.satie-dt-hist .hdiff .hdn{font:11.5px/1.5 'IBM Plex Mono',monospace;color:var(--ink);margin-top:4px}
.satie-dt-hist .hdiff .dl{color:var(--mute);padding:0 4px}
.satie-dt-hist .hdiff .dl.add{color:#ebe7df;background:rgba(235,231,223,.10)}
.satie-dt-hist .hdiff .dl.del{color:var(--danger);background:rgba(224,112,112,.10)}
.satie-dt-hist .hrow{display:flex;align-items:baseline;gap:8px;padding:5px 8px;margin-left:-8px;border-radius:8px;cursor:pointer}
.satie-dt-hist .hrow[data-sel="1"]{background:rgba(235,231,223,.06)}
.satie-dt-hist .hrow[data-faded="1"]{opacity:.55}
.satie-dt-hist .hrow .dot{font-size:10px;line-height:16px;opacity:.35}
.satie-dt-hist .hrow .tx{flex:1;min-width:0}
.satie-dt-hist .hrow .l{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-hist .hrow .now{opacity:.45}
.satie-dt-hist .hrow .d{display:block;font-size:11px;opacity:.45;margin-top:1px}
.satie-dt-hist .hrow .add{color:var(--ink)}
.satie-dt-hist .hrow .rem{color:var(--danger)}
.satie-dt-hist .hrow .src,.satie-dt-hist .hrow .t{font-size:10.5px;opacity:.4;flex:none}
.satie-dt-hist .link{height:10px;border-left:1px solid var(--line);margin-left:4px}
.satie-dt-hist .hsess{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding:10px 0 4px;border-top:1px solid var(--hair);margin-top:6px}
.satie-dt-hist .hsess:first-child{border-top:0;margin-top:0;padding-top:2px}
/* an outside edit (2026-11-11): a quiet strip under the tabs; what of yours it undid is in the warning colour */
.satie-dt-outside{padding:8px 12px;border-bottom:1px solid var(--line);background:var(--fill);display:flex;flex-direction:column;gap:3px}
.satie-dt-outside[hidden]{display:none}
.satie-dt-outside .h{font-weight:500;color:var(--ink)}
.satie-dt-outside .ln{color:var(--mute);font-size:11.5px}
.satie-dt-outside .ln.mine{color:var(--warn)}
.satie-dt-outside .ln.sub{font-size:11px}
.satie-dt-outside[data-kind="refused"] .h{color:var(--danger)}
.satie-dt-outside .acts{display:flex;gap:6px;margin-top:4px}
.satie-dt-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,calc(100vw - 32px));font:500 12px/1.4 'IBM Plex Mono',monospace;color:#ebe7df;background:rgba(10,9,8,.86);border:1px solid rgba(235,231,223,.12);border-radius:999px;padding:7px 14px;cursor:pointer;backdrop-filter:blur(12px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-toast[hidden]{display:none}
.satie-dt-toast[data-kind="clash"]{color:#d4a850}
.satie-dt-hist .fold{padding-left:22px;margin-top:2px}
.satie-dt .satie-dt-hist .ft,.satie-dt .satie-dt-hist .fg{border:0;padding:2px 0;color:var(--mute);font-size:11.5px;background:transparent}
.satie-dt .satie-dt-hist .fg{font-size:11px;opacity:.6;padding:4px}
.satie-dt-hist .tip{display:flex;align-items:center;gap:6px}
.satie-dt-hist .hrow .hgo{display:none;flex:none;font-size:10.5px;padding:1px 8px;color:#ebe7df;border-color:rgba(235,231,223,.35)}
.satie-dt-hist .hrow:hover .hgo,.satie-dt-hist .hrow[data-sel="1"] .hgo{display:inline-block}
.satie-dt-hist .acts{margin:0 0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.satie-dt-hist .acts .hint{font-size:11px;opacity:.4}
.satie-dt-hist .back{margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--line);border-radius:10px}
.satie-dt-hist .back .bl{font-size:12px;opacity:.55}
.satie-dt-hist .back input{flex:1;min-width:140px;font:inherit;font-size:12px;color:var(--ink);background:none;border:1px solid var(--line);border-radius:6px;padding:4px 8px}
/* Objects vs sounds: an object with several sounds is a header card; its sounds hang under it on a guide line. */
.satie-dt-grp{position:sticky;top:0;z-index:2;background:rgba(20,19,17,.96);border-top:1px solid var(--line);padding:9px 16px 9px 10px;flex-wrap:nowrap;gap:8px}
/* A stuck header or the selection bar sits flush with the list's top: top:0 stops at the body's 4px padding, and the rows scrolled through that strip above it. */
.satie-dt .satie-dt-body .satie-dt-grp,.satie-dt .satie-dt-body .satie-dt-selbar{top:-4px}
.satie-dt-grp .gname{text-transform:none;letter-spacing:0;font-size:12px;font-weight:500}
.satie-dt-grp .gname small{display:block;margin:1px 0 0;font-size:10.5px;font-weight:400}
.satie-dt-grp > input[type=range]{flex:none;width:84px;margin:0}
.satie-dt-row[data-child="1"]{padding-left:34px;background-image:linear-gradient(var(--line),var(--line));background-size:1px 100%;background-position:18px 0;background-repeat:no-repeat}
.satie-dt-row[data-child="1"][data-sel="1"],.satie-dt-row[data-child="1"][data-hover="1"]{background-image:none}
/* Is it playing? A steady glow while it sounds, a flash when it fires, hollow when silent. */
.satie-dt-row .sw{background:transparent;border:1.5px solid var(--c,#ff8da1);width:8px;height:8px}
.satie-dt-row[data-playing="1"] .sw{background:color-mix(in srgb,var(--c,#ff8da1) 35%,#2a2927);border-color:color-mix(in srgb,var(--c,#ff8da1) 35%,#2a2927)}
.satie-dt-row .sw{transition:background .6s ease,border-color .6s ease,box-shadow .6s ease}
.satie-dt-kind .name{display:flex;align-items:center;flex-wrap:wrap;gap:0 4px}
.satie-dt .satie-dt-kind .tri{border:0;padding:0 2px;font-size:10px;color:var(--mute);background:none}
.satie-dt-kind .cnt{font-size:11px;color:var(--mute)}
.satie-dt-kind .what{flex-basis:100%;font-size:11px;color:var(--mute)}
.satie-dt-row[data-copy="1"]{padding-left:52px}
.satie-dt-row[data-heard="1"] .sw{background:var(--c,#ff8da1);border-color:var(--c,#ff8da1);box-shadow:0 0 calc(3px + var(--lv,.5) * 9px) calc(var(--lv,.5) * 3px) color-mix(in srgb,var(--c,#ff8da1) 75%,transparent)}
.satie-dt-row[data-fire="1"] .sw{background:#f6f3ec;box-shadow:0 0 10px 3px var(--c,#ff8da1)}
@keyframes satie-breathe{50%{box-shadow:0 0 10px 3px color-mix(in srgb,var(--c,#ff8da1) 45%,transparent)}}
.satie-dt-row[data-noaudio="1"] .sub{color:var(--warn)}
.satie-dt-row[data-noaudio="1"] .sw{border-style:dashed;opacity:.6}
/* Playing now */
.satie-dt-now{border-bottom:1px solid var(--line);padding:8px 16px 8px;background:rgba(235,231,223,.03)}
.satie-dt-now .hd{display:flex;align-items:baseline;gap:8px;cursor:pointer;user-select:none}
.satie-dt-now .hd .tri{font-size:9px;color:var(--mute);width:10px}
.satie-dt-now .hd .lbl{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--ink)}
.satie-dt-now .hd small{color:var(--mute);font-size:10.5px}
.satie-dt-now .ls{display:flex;flex-direction:column;gap:1px;margin-top:6px;max-height:228px;overflow:auto}
.satie-dt-now .it[data-out="1"] .n,.satie-dt-now .it[data-out="1"] .mt{opacity:.4}
.satie-dt-now .it[data-out="1"] .db{color:var(--warn)}
.satie-dt-now .it[data-faint="1"] .n,.satie-dt-now .it[data-faint="1"] .db{color:var(--mute)}
.satie-dt-now .it .db{white-space:nowrap}
.satie-dt-now .it{grid-template-columns:10px 1fr 56px 72px auto}
.satie-dt .satie-dt-now .hd .reset{margin-left:auto;font-size:10px;padding:1px 7px;color:var(--warn);border-color:rgba(212,168,80,.4)}
.satie-dt-now .it{display:grid;grid-template-columns:10px 1fr 64px 42px auto;align-items:center;gap:8px;padding:3px 4px;border-radius:6px;cursor:pointer;--c:#ff8da1}
.satie-dt-now .it:hover,.satie-dt-now .it[data-sel="1"]{background:rgba(235,231,223,.08)}
.satie-dt-now .it .sw{width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 6px 1px color-mix(in srgb,var(--c) 70%,transparent)}
.satie-dt-now .it .n{font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-now .it .mt{height:4px;border-radius:2px;background:rgba(235,231,223,.1);overflow:hidden}
.satie-dt-now .it .mt i{display:block;height:100%;background:var(--c);transition:width .25s ease}
.satie-dt-now .it .db{font-size:10.5px;color:var(--mute);text-align:right}
.satie-dt-now .it .ms{display:flex;gap:3px}
.satie-dt .satie-dt-now .it .ms button{width:20px;height:18px;padding:0;font-size:9.5px;border-radius:4px;color:var(--mute)}
/* 2026-09-28: rows are two lines (name + level, then controls); details show when selected. Fading stays readable. */
.satie-dt-row{grid-template-areas:"name lv" "sub sub" "ctl ctl";padding-top:8px;padding-bottom:7px}
.satie-dt-row .sub{display:none}
/* 2026-10-18: a thing's sounds are compact cards (name, kind, level, M S); the one you pick opens in full.
   Selecting a whole thing no longer opens every card. */
.satie-dt-row[data-exp="1"] .sub,.satie-dt-row[data-noaudio="1"] .sub{display:block;white-space:normal;line-height:1.4}
.satie-dt-row[data-child="1"]:not([data-exp="1"]) .ctl{display:none}
.satie-dt-row .sub .wh{display:block;margin-top:3px;color:var(--ink);opacity:.72;font-size:11px}
.satie-dt-row .name .what{font-size:12.5px;color:var(--ink)}
.satie-dt-row .name{flex-wrap:wrap;row-gap:1px}
.satie-dt-row .name{flex-wrap:wrap}
.satie-dt input.rename{flex:1 1 0;min-width:0;font:inherit;font-size:12.5px;font-weight:500;color:var(--ink);background:var(--fill);border:1px solid var(--line);border-radius:4px;padding:1px 5px;outline:none}
.satie-dt input.rename:focus{border-color:var(--accent)}
.satie-dt-row .name .host{flex:1 1 0;min-width:0;overflow:hidden;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;font-size:12.5px;color:var(--ink);font-weight:500}
.satie-dt-row .name .what .kind{margin-left:6px}
.satie-dt-row .lv{width:112px;flex:none;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-row .name .what{flex-basis:100%;white-space:normal;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35;padding-left:15px}
.satie-dt-row .name .host + .what{color:var(--mute);font-size:11.5px}
/* 2026-10-18: a sound's name wears its voice colour (mint, as its dot in the world); a thing (a header) stays
   warm white, so sounds and things read apart without reading the words */
/* the voice colour blended with the mixer's sage, so the palest mints never pass for a thing's warm white, and
   no sound name is as loud as the bright green kept for picks and actions */
.satie-dt-row .name .host{color:var(--ink)}
.satie-dt-row .acts{position:relative}
.satie-dt .satie-dt-row .acts .trash{color:#e07070;padding:3px 6px;display:inline-flex;align-items:center}
.satie-dt .satie-dt-row .acts .trash:hover{background:rgba(224,112,112,.12);color:var(--danger)}
.satie-dt-row .acts .menu{display:none;position:absolute;right:0;top:100%;z-index:5;flex-direction:column;min-width:170px;padding:4px;background:#1e1d1b;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.satie-dt-row[data-more="1"] .acts .menu{display:flex}
.satie-dt .satie-dt-row .acts .menu .mi{display:block;text-align:left;border:0;padding:6px 8px;border-radius:6px;font-size:11.5px;color:var(--ink)}
.satie-dt .satie-dt-row .acts .menu .mi:hover{background:var(--fill)}
.satie-dt .satie-dt-row .acts .menu .mi.x{color:var(--danger)}
.satie-dt[data-mixside="1"] .satie-dt-tabs,.satie-dt[data-mixside="1"] .satie-dt-strip,.satie-dt[data-mixside="1"] .satie-dt-tools,.satie-dt[data-mixside="1"] .satie-dt-hearing,.satie-dt[data-mixside="1"] .satie-dt-body,.satie-dt[data-mixside="1"] > .satie-dt-agentsees,.satie-dt[data-mixside="1"] .satie-dt-outside{display:none!important}
.satie-dt-mixside{flex:1;min-height:0;display:flex;flex-direction:column}
.satie-dt-mixside[hidden]{display:none}
/* the head: its own band, set apart from the list (a tint, a firm rule, a shadow into the list) */
.satie-dt-mixside .mh{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px 18px 15px;background:linear-gradient(180deg,rgba(235,231,223,.055),rgba(235,231,223,.025));border-bottom:1px solid rgba(235,231,223,.2);box-shadow:0 8px 18px -10px rgba(0,0,0,.7)}
.satie-dt-mixside .mh.k-sound{background:linear-gradient(180deg,rgba(255,141,161,.09),rgba(255,141,161,.02))}
.satie-dt-mixside .kt{display:inline-flex;align-items:center;gap:6px;font:500 10px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;border-radius:4px;padding:4px 7px 4px 6px}
.satie-dt-mixside .kt i{width:8px;height:8px;flex:none;box-sizing:border-box}
.satie-dt-mixside .kt.k-scape{color:var(--ink);background:rgba(235,231,223,.1);border:1px dashed rgba(235,231,223,.45)}
.satie-dt-mixside .kt.k-scape i{border:1.5px dashed currentColor;border-radius:50%}
.satie-dt-mixside .kt.k-thing{color:#0d0c0b;background:#ebe7df}
.satie-dt-mixside .kt.k-thing i{border:1.5px solid currentColor;border-radius:2px}
.satie-dt-mixside .kt.k-sound{color:#0d0c0b;background:#ff8da1}
.satie-dt-mixside .kt.k-sound i{background:currentColor;border-radius:50%}
.satie-dt-mixside .kt.sm{padding:3px;border-radius:3px}
.satie-dt-mixside .mv{font:500 23px/1.15 'IBM Plex Mono',monospace;letter-spacing:-.015em;color:var(--ink);margin-top:3px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-mixside .mv::first-letter{text-transform:uppercase}
.satie-dt-mixside .mp{display:flex;align-items:center;flex-wrap:wrap;gap:5px 6px;font:12px 'IBM Plex Mono',monospace;color:var(--mute)}
.satie-dt-mixside .mp .mw{color:var(--mute)}
.satie-dt-mixside .mp .mt{color:#c9c4bb}
.satie-dt-mixside .mp .mc + .mt{margin-left:4px}
.satie-dt-mixside .mc{all:unset;display:inline-flex;align-items:center;gap:6px;font:12px 'IBM Plex Mono',monospace;color:var(--ink);border:1px solid rgba(235,231,223,.22);border-radius:999px;padding:2px 9px 2px 7px;background:rgba(235,231,223,.04)}
.satie-dt-mixside button.mc{cursor:pointer}
.satie-dt-mixside button.mc:hover{border-color:rgba(235,231,223,.55);background:rgba(235,231,223,.08)}
.satie-dt-mixside .mc i{width:7px;height:7px;box-sizing:border-box;flex:none}
.satie-dt-mixside .mc.k-scape i{border:1.2px dashed currentColor;border-radius:50%}
.satie-dt-mixside .mc.k-thing i{border:1.4px solid currentColor;border-radius:2px}
.satie-dt-mixside .mc span::first-letter{text-transform:uppercase}
.satie-dt-mixside .xt{margin-top:6px}
.satie-dt-mixside .ml2{flex:1;min-height:0;overflow:auto;padding:0 0 16px;scrollbar-width:thin}
.satie-dt-mixside .ax{position:sticky;top:0;z-index:2;height:24px;margin:0;background:#0f0e0d;border-bottom:1px solid var(--hair);font:10px var(--mono);color:var(--faint,#5d5a55)}
.satie-dt-mixside .ax span{position:absolute;bottom:5px;transform:translateX(-50%);margin-left:33px;white-space:nowrap}
.satie-dt-mixside .ax span:first-of-type{transform:none}
.satie-dt-mixside .ax span:last-of-type{transform:translateX(-100%)}
.satie-dt-mixside .ax{--w:calc(100% - 51px)}
.satie-dt-mixside .ax .ph{position:absolute;top:4px;bottom:0;width:2px;margin-left:32px;left:calc(var(--w) * var(--at,0));background:rgba(235,231,223,.85);border-radius:1px}
.satie-dt-mixside .ax.in{position:relative;top:auto;background:none;border:0;margin:10px 0 4px;--w:100%}
.satie-dt-mixside .ax.in span{margin-left:0}
.satie-dt-mixside .ax.in .ph{margin-left:-1px}
.satie-dt-mixside .tr2{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.satie-dt-mixside .ax[data-live="0"] .ph{display:none}
.satie-dt .satie-dt-mixside .pp{display:inline-flex;align-items:center;gap:9px;height:36px;padding:0 18px 0 15px;border-radius:18px;border:0;background:#ebe7df;color:#0d0c0b;font:500 13.5px 'IBM Plex Mono',monospace;cursor:pointer;white-space:nowrap}
.satie-dt .satie-dt-mixside .pp:hover{background:#f6f3ec}
.satie-dt .satie-dt-mixside .pp.on{background:#ff8da1}
.satie-dt-mixside .pp svg{width:11px;height:11px;flex:none}
.satie-dt-mixside .pp span::first-letter{text-transform:none}
.satie-dt-mixside .lenseg{display:inline-flex;padding:2px;border:1px solid var(--line);border-radius:10px}
.satie-dt .satie-dt-mixside .lenseg button{height:28px;min-width:30px;padding:0 6px;white-space:nowrap;border:0;border-radius:7px;font:12px var(--mono);color:var(--mute);background:none;cursor:pointer}
.satie-dt .satie-dt-mixside .lenseg button.on{background:rgba(235,231,223,.13);color:var(--ink)}
.satie-dt-mixside .ps{font:11px var(--mono);color:var(--mute);margin-top:2px;font-variant-numeric:tabular-nums}
.satie-dt .satie-dt-mixside .mb2{flex:none;margin-left:auto;display:grid;place-items:center;width:24px;height:24px;padding:0;border-radius:5px;border:1px solid var(--line);font:10.5px var(--mono);color:var(--mute);background:none;cursor:pointer}
.satie-dt .satie-dt-mixside .mb2[data-on="1"]{background:var(--ink);color:#0d0c0b;border-color:var(--ink)}
.satie-dt-mixside .st .pt + .mb2{margin-left:6px}
.satie-dt-mixside .st .mb2 + .hb{margin-left:5px}
.satie-dt-mixside .st .mb2 + .mb2{margin-left:4px}
.satie-dt-mixside .sr.mu .sn,.satie-dt-mixside .sr.mu canvas.ln,.satie-dt-mixside .sr.mu .tk{opacity:.4}
.satie-dt-mixside .sec{display:flex;align-items:baseline;gap:8px;font:500 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:16px 18px 6px}
.satie-dt-mixside .sec small{font:400 10.5px var(--mono);letter-spacing:0;text-transform:none;color:var(--faint,#5d5a55)}
.satie-dt-mixside .eb{margin:6px 12px 8px;border:1px solid var(--line);border-radius:8px;background:rgba(235,231,223,.02);overflow:hidden}
.satie-dt .satie-dt-mixside .th{all:unset;display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;box-sizing:border-box;width:100%;background:rgba(235,231,223,.04);border-bottom:1px solid var(--line)}
.satie-dt-mixside .th .tn{font:500 13.5px 'IBM Plex Mono',monospace;color:var(--ink)}
.satie-dt-mixside .th .tn::first-letter{text-transform:uppercase}
.satie-dt-mixside .th small{margin-left:auto;font:10.5px var(--mono);color:var(--mute)}
.satie-dt-mixside .th:hover{background:rgba(235,231,223,.08)}
.satie-dt-mixside .sr{padding:9px 18px 10px;border-bottom:1px solid var(--hair)}
.satie-dt-mixside .sr.in{padding:9px 12px 10px}
.satie-dt-mixside .eb .sr:last-child{border-bottom:0}
.satie-dt-mixside .sr .st{display:flex;align-items:center;gap:8px;min-width:0}
.satie-dt-mixside .sr .st i{width:7px;height:7px;border-radius:50%;background:rgba(255,141,161,.45);flex:none}
.satie-dt-mixside .sr.on .st i{background:var(--sound);box-shadow:0 0 8px 1px rgba(255,141,161,.5)}
.satie-dt .satie-dt-mixside .sn{all:unset;font:500 13px 'IBM Plex Mono',monospace;color:var(--ink);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.satie-dt-mixside button.sn:hover{text-decoration:underline;text-underline-offset:3px}
.satie-dt-mixside .st .pt{flex:none;margin-left:auto;font:10px var(--mono);color:var(--mute);border:1px solid var(--line);border-radius:3px;padding:1px 5px}
.satie-dt .satie-dt-mixside .hb{flex:none;margin-left:auto;display:grid;place-items:center;width:24px;height:24px;padding:0;border-radius:50%;border:1px solid rgba(255,141,161,.45);color:#f3d7dc;background:transparent;cursor:pointer}
.satie-dt-mixside .st .pt + .hb{margin-left:6px}
.satie-dt .satie-dt-mixside .hb:hover{background:rgba(255,141,161,.18);border-color:var(--sound)}
.satie-dt-mixside .sm{font:10.5px var(--mono);color:var(--mute);margin:2px 0 0 15px}
.satie-dt-mixside .sm .tq{color:var(--faint,#5d5a55)}
.satie-dt-mixside canvas.ln{display:block;width:calc(100% - 15px);height:8px;margin:7px 0 0 15px;border-radius:2px}
.satie-dt-mixside canvas.ln.big{width:100%;height:14px;margin:0}
.satie-dt-mixside .tk{display:flex;align-items:center;gap:4px;margin:7px 0 0 15px;flex-wrap:wrap}
.satie-dt .satie-dt-mixside .tc{display:inline-grid;place-items:center;font:10.5px var(--mono);min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:999px;border:1.5px solid var(--tc,#ff8da1);color:var(--ink);background:transparent;cursor:pointer;flex:none}
.satie-dt .satie-dt-mixside .tc:hover{background:color-mix(in srgb,var(--tc,#ff8da1) 22%,transparent)}
.satie-dt-mixside .card{margin:0 12px;padding:11px 12px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(235,231,223,.025)}
.satie-dt-mixside .big{font:13.5px/1.45 'IBM Plex Mono',monospace;color:var(--ink)}
.satie-dt-mixside .big.q{color:var(--mute);font-size:12px;margin-top:2px}
.satie-dt-mixside .ex{font:12px/1.5 'IBM Plex Mono',monospace;color:var(--mute);padding:0 18px 8px;text-wrap:pretty}
.satie-dt-mixside .tr{display:flex;align-items:center;gap:10px;padding:6px 18px}
.satie-dt-mixside .tr:hover{background:rgba(235,231,223,.035)}
.satie-dt-mixside .tr .tn{font:12.5px 'IBM Plex Mono',monospace;color:var(--ink);flex:none}
.satie-dt-mixside .tr .tw{flex:1;font:10.5px var(--mono);color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.satie-dt-mixside .tr .tl{flex:none;font:10.5px var(--mono);color:var(--faint,#5d5a55);font-variant-numeric:tabular-nums}
.satie-dt .satie-dt-mixside .find{all:unset;box-sizing:border-box;display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;margin:14px 18px 0;width:calc(100% - 36px);padding:10px 12px;border:1px solid rgba(232,194,122,.35);border-radius:8px;cursor:pointer}
.satie-dt .satie-dt-mixside .find:hover{border-color:rgba(232,194,122,.7);background:rgba(232,194,122,.05)}
.satie-dt .satie-dt-mixside .find.on{background:rgba(232,194,122,.08);border-color:rgba(232,194,122,.6)}
.satie-dt-mixside div.find{cursor:default}
.satie-dt-mixside details.adv{margin:16px 12px 0;border:1px solid var(--line);border-radius:8px;background:rgba(235,231,223,.02)}
.satie-dt-mixside details.adv>summary{cursor:pointer;list-style:none;padding:9px 12px;font:11px var(--mono);color:var(--mute)}
.satie-dt-mixside details.adv>summary::-webkit-details-marker{display:none}
.satie-dt-mixside details.adv>summary::before{content:'▸ ';color:var(--faint,#5d5a55)}
.satie-dt-mixside details.adv[open]>summary::before{content:'▾ '}
.satie-dt-mixside details.adv>summary:hover{color:var(--ink)}
.satie-dt-mixside .advb{padding:0 12px 12px}
.satie-dt-mixside .advb .ah{font:500 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:12px 0 6px}
.satie-dt-mixside .advb .ex{padding:0}
.satie-dt-mixside .fol{margin:0 0 10px}
.satie-dt-mixside .fol .ft2{font:12px/1.45 'Inter',system-ui,sans-serif;color:var(--ink)}
.satie-dt-mixside .fol svg.fc{display:block;width:100%;height:auto;aspect-ratio:2/1;margin:6px 0 2px;background:rgba(235,231,223,.03);border-radius:5px;cursor:crosshair;touch-action:none}
.satie-dt-mixside .fol svg.fc polyline{fill:none;stroke:#ff8da1;stroke-width:2}
.satie-dt-mixside .fol svg.fc line.axl{stroke:rgba(235,231,223,.3);stroke-width:1}
.satie-dt-mixside .fol svg.fc line.gd{stroke:rgba(255,141,161,.35);stroke-width:1;stroke-dasharray:3 3}
.satie-dt-mixside .fol svg.fc text{font:9.5px 'IBM Plex Mono',ui-monospace,monospace;fill:#8e8a83}
.satie-dt-mixside .fol svg.fc text.at{fill:#bdb8ae}
.satie-dt-mixside .fol svg.fc text.nowl{fill:#ebe7df;font-size:10px}
.satie-dt-mixside .fol svg.fc circle.live{fill:#ebe7df;stroke:#0d0c0b;stroke-width:2;cursor:ew-resize}
.satie-dt-mixside .fol svg.fc circle.livering{fill:none;stroke:rgba(235,231,223,.35);stroke-width:1.2;pointer-events:none}
.satie-dt-mixside .fol svg.fc circle.end{fill:#0d0c0b;stroke:#ff8da1;stroke-width:2.4;cursor:move}
.satie-dt-mixside .fol svg.fc circle.end:hover,.satie-dt-mixside .fol svg.fc[data-drag=a] circle.end:first-of-type{fill:#ff8da1}
.satie-dt-mixside .fol svg.fc circle.mid{fill:#0d0c0b;stroke:rgba(255,141,161,.7);stroke-width:1.8;stroke-dasharray:2 2;cursor:ns-resize}
.satie-dt-mixside .fol svg.fc circle.mid:hover{fill:rgba(255,141,161,.5)}
.satie-dt-mixside .fol svg.fc line.probe{stroke:rgba(235,231,223,.35);stroke-width:1;display:none}
.satie-dt-mixside .fol .fn{font:10.5px var(--mono);color:var(--mute)}
.satie-dt-mixside .gw{font:12px/1.5 'Inter',system-ui,sans-serif;color:var(--ink);padding:1px 0}
.satie-dt-mixside .mtabs{display:flex;gap:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;border:1px solid var(--line);border-radius:999px;padding:3px;margin:2px 0 12px;background:rgba(0,0,0,.2)}
.satie-dt-mixside .mtabs button{all:unset;font:10.5px var(--mono);color:var(--mute);padding:4px 7px;border-radius:999px;cursor:pointer;white-space:nowrap}
.satie-dt-mixside .mtabs button:hover{color:var(--ink)}
.satie-dt-mixside .mtabs button.on{background:var(--ink);color:#0d0c0b}
.satie-dt-mixside .mtabs button.has::after{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--sound,#ff8da1);margin-left:4px;vertical-align:1px}
.satie-dt-mixside .mpane .satie-dt-prow{flex-wrap:wrap;row-gap:2px}
.satie-dt-mixside .mpane .satie-dt-prow .pl{width:auto;flex-basis:100%;white-space:normal;overflow:visible}
.satie-dt-mixside .mpane svg.pv2,.satie-dt-mixside .mpane svg.ev2{margin-bottom:8px}
.satie-dt-mixside .mfam{border-top:1px solid var(--hair);margin-top:10px;padding-top:2px}
.satie-dt-mixside .mfam .ah{cursor:help}
.satie-dt-mixside .mfam .satie-dt-prow .pl{width:108px}
.satie-dt-mixside .mmore{all:unset;font:10.5px var(--mono);color:var(--mute);cursor:pointer;padding:4px 0}
.satie-dt-mixside .mmore:hover{color:var(--ink)}
.satie-dt-mixside svg.pv2,.satie-dt-mixside svg.ev2{display:block;width:100%;height:auto;background:rgba(235,231,223,.03);border-radius:5px;margin:4px 0 2px;touch-action:none}
.satie-dt-mixside svg.pv2 circle.gr{fill:none;stroke:rgba(235,231,223,.08)}
.satie-dt-mixside svg.pv2 circle.size{fill:rgba(255,141,161,.12);stroke:rgba(255,141,161,.7);stroke-width:1.5}
.satie-dt-mixside svg.pv2 circle.ringd{fill:none;stroke:rgba(255,141,161,.6);stroke-width:5;stroke-opacity:.35}
.satie-dt-mixside svg.pv2 circle.sd{fill:#ff8da1}
.satie-dt-mixside svg.pv2 circle.sh{fill:#0d0c0b;stroke:#ff8da1;stroke-width:2.2;cursor:ew-resize}
.satie-dt-mixside svg.pv2 circle.sh:hover{fill:#ff8da1}
.satie-dt-mixside svg.pv2 circle.you{fill:#ebe7df}
.satie-dt-mixside svg.pv2 circle.bed{fill:rgba(255,141,161,.14);stroke:rgba(255,141,161,.4);stroke-dasharray:4 4}
.satie-dt-mixside svg.pv2 polyline.trail{fill:none;stroke:rgba(255,141,161,.55);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.satie-dt-mixside svg.pv2 text.yl,.satie-dt-mixside svg.ev2 text.etk{font:9.5px 'IBM Plex Mono',ui-monospace,monospace;fill:#8e8a83}
.satie-dt-mixside svg.ev2 polygon.esh{fill:rgba(255,141,161,.22);stroke:#ff8da1;stroke-width:1.8;stroke-linejoin:round}
.satie-dt-mixside svg.ev2 rect.enx{fill:rgba(255,141,161,.08);stroke:rgba(255,141,161,.3);stroke-dasharray:3 3}
.satie-dt-mixside svg.ev2 circle.eh{fill:#0d0c0b;stroke:#ff8da1;stroke-width:2.2;cursor:ew-resize}
.satie-dt-mixside svg.ev2 circle.eh:hover{fill:#ff8da1}
.satie-dt-mixside .gw b{font:500 11px var(--mono);color:#f3d7dc}
.satie-dt-mixside .sn2{font:11px var(--mono);color:var(--mute);margin:8px 0 4px}
.satie-dt .satie-dt-mixside .sta{width:100%;box-sizing:border-box;font:11.5px/1.5 'IBM Plex Mono','SF Mono',Menlo,monospace;color:var(--ink);background:#0b0a09;border:1px solid var(--line);border-radius:6px;padding:8px 9px;resize:vertical;tab-size:4;white-space:pre}
.satie-dt-mixside .srow{display:flex;align-items:center;gap:8px;margin-top:6px}
.satie-dt .satie-dt-mixside .sap{height:26px;padding:0 12px;border:1px solid rgba(235,231,223,.3);border-radius:6px;background:rgba(235,231,223,.06);color:var(--ink);font:12px 'Inter',system-ui,sans-serif;cursor:pointer}
.satie-dt-mixside .smsg{font:10.5px var(--mono);color:var(--mute)}
.satie-dt-mixside .ir{display:flex;align-items:center;gap:9px;padding:5px 18px;font:12.5px 'Inter',system-ui,sans-serif;color:var(--ink)}
.satie-dt-mixside .ir i{width:6px;height:6px;border-radius:50%;background:rgba(255,141,161,.35);flex:none}
.satie-dt-mixside .ir.on i{background:var(--sound)}
.satie-dt-mixside .ir .id{margin-left:auto;font:10.5px var(--mono);color:var(--mute)}
.satie-dt .satie-dt-mixside .ir .igo{height:22px;padding:0 9px;border:1px solid var(--line);border-radius:5px;background:none;color:var(--mute);font:11px var(--mono);cursor:pointer}
/* ── the chat as its own pane (2026-11-13): a ground of its own, a firm edge and a shadow over what scrolls above it ── */
.satie-dt .satie-dt-askfoot{background:#121110;border-top:1px solid rgba(235,231,223,.2);box-shadow:0 -14px 26px -14px rgba(0,0,0,.85);position:relative;z-index:4}
.satie-dt .satie-dt-chat .chead{display:flex!important;align-items:center;gap:6px;padding:7px 0 4px;margin:0;border-bottom:1px solid var(--hair)}
.satie-dt .satie-dt-chat .chead .titlebtn{font:500 12px 'Inter',system-ui,sans-serif;color:var(--ink);padding:3px 6px;border-radius:6px}
.satie-dt .satie-dt-chat .chead .titlebtn:hover{background:rgba(235,231,223,.06)}
.satie-dt .satie-dt-chat[data-min="1"] .thread,.satie-dt .satie-dt-chat[data-min="1"] .grip{display:none!important}
.satie-dt .satie-dt-chat .chip.many{cursor:pointer}
.satie-dt .satie-dt-chat[data-min="1"] .chead{border-bottom:0}
.satie-dt .satie-dt-chat .thread{gap:12px;padding:10px 2px 6px}
.satie-dt .satie-dt-chat .msg.you{align-self:flex-end;max-width:86%;color:var(--ink);background:rgba(235,231,223,.085);border:1px solid rgba(235,231,223,.1);border-radius:13px 13px 4px 13px;padding:7px 11px 8px}
.satie-dt .satie-dt-chat .msg.you .tx::before{content:none}
.satie-dt .satie-dt-chat .msg.you .mchips{justify-content:flex-end;margin-bottom:5px}
.satie-dt .satie-dt-chat .msg.satie{align-self:flex-start;max-width:96%;padding-left:12px;border-left:2px solid rgba(255,141,161,.45)}
.satie-dt .satie-dt-chat .msg.satie::before{content:'SATIE';display:block;font:500 9.5px var(--mono);letter-spacing:.09em;color:var(--mute);margin-bottom:3px}
.satie-dt .satie-dt-chat .msg.agent{align-self:flex-start;padding-left:12px;border-left:2px dashed rgba(235,231,223,.35)}
.satie-dt .satie-dt-chat .msg .mchips .chip.place{display:inline-flex;align-items:center;gap:5px}
.satie-dt .satie-dt-chat .msg .mchips .chip.place i{width:7px;height:7px;box-sizing:border-box}
.satie-dt .satie-dt-chat .msg .mchips .chip.place.k-scape i{border:1.2px dashed currentColor;border-radius:50%}
.satie-dt .satie-dt-chat .msg .mchips .chip.place.k-thing i{border:1.4px solid currentColor;border-radius:2px}
.satie-dt .satie-dt-chat .msg .mchips .chip.place.k-sound i{background:#ff8da1;border-radius:50%}
.satie-dt .satie-dt-chat .scope{padding-top:6px}
.satie-dt .satie-dt-chat .irow textarea{background:#1a1917;border-color:rgba(235,231,223,.22)}
.satie-dt .satie-dt-mixside .bin2{flex:none;display:grid;place-items:center;min-width:24px;height:24px;padding:0 4px;margin-left:5px;border-radius:5px;border:1px solid rgba(224,112,112,.35);background:none;color:#e07070;font:10.5px var(--mono);cursor:pointer}
.satie-dt .satie-dt-mixside .bin2:hover,.satie-dt .satie-dt-mixside .bin2[data-sure="1"]{background:rgba(224,112,112,.14);border-color:#e07070}
.satie-dt-mixside .delrow{padding:12px 18px 0}
.satie-dt .satie-dt-mixside .addtake{all:unset;display:inline-flex;align-items:center;height:28px;margin:8px 18px 0;padding:0 12px;border-radius:6px;border:1px dashed rgba(235,231,223,.3);color:var(--ink);font:12px var(--mono);cursor:pointer}
.satie-dt .satie-dt-mixside .addtake:hover{border-style:solid;background:rgba(235,231,223,.06)}
.satie-dt .satie-dt-mixside .bin2.wide{display:inline-flex;gap:7px;height:28px;padding:0 11px;margin:0;font:12px 'IBM Plex Mono',monospace}
.satie-dt .satie-dt-chat .chip.place{display:inline-flex;align-items:center;gap:6px;border-style:solid;border-color:rgba(235,231,223,.35);color:var(--ink);background:rgba(235,231,223,.06)}
.satie-dt .satie-dt-chat .chip.place i{width:8px;height:8px;box-sizing:border-box;flex:none}
.satie-dt .satie-dt-chat .chip.place.k-scape i{border:1.4px dashed currentColor;border-radius:50%}
.satie-dt .satie-dt-chat .chip.place.k-thing i{border:1.5px solid currentColor;border-radius:2px}
.satie-dt .satie-dt-chat .chip.place.k-sound i{background:#ff8da1;border-radius:50%}
.satie-dt-mixside .find .frow{grid-column:1 / -1;display:flex;gap:6px;margin-top:8px}
.satie-dt .satie-dt-mixside .find .fq{flex:1;min-width:0;height:30px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:#141311;color:var(--ink);font:12px 'IBM Plex Mono',monospace}
.satie-dt .satie-dt-mixside .find .fgo{height:30px;padding:0 14px;border:1px solid rgba(232,194,122,.6);border-radius:7px;background:rgba(232,194,122,.12);color:#f1dcb0;font:12px 'IBM Plex Mono',monospace;cursor:pointer}
.satie-dt-mixside .sidefind{margin:0 12px 10px}
.satie-dt-mixside .find .fr{grid-row:span 2;width:14px;height:14px;border-radius:50%;border:1.5px dashed #e8c27a;box-shadow:0 0 8px rgba(232,194,122,.45)}
.satie-dt-mixside .find .ft{font:12.5px 'IBM Plex Mono',monospace;color:#f1dcb0}
.satie-dt-mixside .find small{font:10.5px var(--mono);color:var(--mute)}
.satie-dt-mixside .seg2{display:inline-flex;padding:2px;border:1px solid var(--line);border-radius:9px;margin-bottom:6px}
.satie-dt .satie-dt-mixside .seg2 button{height:26px;padding:0 11px;border:0;border-radius:7px;font:12px 'IBM Plex Mono',monospace;color:var(--mute);background:none;cursor:pointer}
.satie-dt .satie-dt-mixside .seg2 button.on{background:rgba(235,231,223,.13);color:var(--ink)}
.satie-dt-mixside .often{display:grid;grid-template-columns:1fr;row-gap:2px;margin:8px 0 4px;position:relative}
.satie-dt-mixside .often .ol{display:flex;justify-content:space-between;align-items:baseline;font:10.5px var(--mono);color:var(--mute)}
.satie-dt-mixside .often .ol b{font:500 12.5px 'IBM Plex Mono',monospace;color:var(--ink)}
.satie-dt-mixside .often input{grid-row:2;grid-column:1;width:100%;margin:0;pointer-events:none;background:none}
.satie-dt-mixside .often input::-webkit-slider-thumb{pointer-events:auto}
.satie-dt-mixside .often input::-moz-range-thumb{pointer-events:auto}
.satie-dt-mixside .lvl{display:flex;align-items:center;gap:10px;margin-top:10px;font:10.5px var(--mono);color:var(--mute)}
.satie-dt-mixside .lvl input{flex:1}
.satie-dt-mixside .lvl .lvv{min-width:44px;text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}
.satie-dt-mixside .satie-spin{width:12px;height:12px}
.satie-dt-mixside .tc[data-state="playing"],.satie-dt-mixside .hb[data-state="playing"]{background:color-mix(in srgb,var(--tc,#ff8da1) 24%,transparent)}
.satie-dt-mixside .tr .now{display:none;font:10px var(--mono);color:#0d0c0b;background:#ff8da1;border-radius:4px;padding:1px 5px;flex:none}
.satie-dt-mixside .tr[data-now="1"] .now{display:inline}
.satie-dt-mixside .tr[data-now="1"]{background:rgba(255,141,161,.07)}
.satie-dt .satie-dt-mixside .tr .tx{flex:none;min-width:22px;height:22px;padding:0 5px;border:0;border-radius:5px;background:none;color:var(--mute);font:12px var(--mono);cursor:pointer;opacity:0}
.satie-dt-mixside .tr:hover .tx,.satie-dt-mixside .tr .tx[data-sure="1"]{opacity:1}
.satie-dt .satie-dt-mixside .tr .tx[data-sure="1"]{color:var(--danger)}
.satie-dt .satie-dt-mixside .mb2.so[data-on="1"]{background:#9fd49a;border-color:#9fd49a}
.satie-dt-mixside .sr.hot{background:rgba(255,141,161,.06)}
/* one window (2026-11-12): with the mix open, the column is the mix's sidebar, under the mix's bar */
.satie-dt[data-inmix="1"]{top:55px;right:13px;bottom:13px;border:0;border-left:1px solid var(--line);border-radius:0 0 7px 0;box-shadow:none;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;z-index:2147483001;animation:none}
.satie-dt[data-inmix="1"] .satie-dt-bar,.satie-dt[data-inmix="1"] .satie-dt-foot,.satie-dt[data-inmix="1"] .satie-dt-inspector{display:none!important}
.satie-dt-askfoot{max-height:45%;display:flex;flex-direction:column;border-top:1px solid var(--line)}
.satie-dt-chat{display:flex;flex-direction:column;min-height:0;padding:0 12px 10px;gap:6px;position:relative}
.satie-dt-chat .grip{height:7px;margin:0 -12px;cursor:ns-resize;display:none}
.satie-dt-chat[data-open="1"]:not([data-fold="1"]) .grip{display:block}
.satie-dt-chat .grip:hover{background:linear-gradient(var(--line),var(--line)) center/32px 2px no-repeat}
.satie-dt-chat .chead{display:none;align-items:center;justify-content:space-between;font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute);padding-top:4px}
.satie-dt-chat[data-open="1"] .chead{display:flex;padding:2px 0 0}
.satie-dt-chat .chead .tools{display:flex;gap:4px;flex:none}
.satie-dt .satie-dt-chat .chead .titlebtn{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:11.5px;padding:2px 6px}
.satie-dt .satie-dt-chat .chead .titlebtn[data-busy="1"]{color:var(--ink)}
.satie-dt-chat .conv[data-busy="1"] .d{color:var(--accent)}
.satie-dt .satie-dt-chat .chead button{font-size:10.5px;padding:1px 7px;text-transform:none;letter-spacing:0;color:var(--mute);border-color:transparent}
.satie-dt .satie-dt-chat .chead button:hover{color:var(--ink);border-color:var(--line)}
.satie-dt-chat .thread{display:none;flex-direction:column;gap:10px;overflow:auto;height:auto;max-height:min(52vh,520px);padding:4px 0 2px}
.satie-dt-chat[data-open="1"]:not([data-fold="1"]) .thread{display:flex}
.satie-dt-chat[data-empty="1"] .thread{display:none!important}
.satie-dt-chat[data-list="1"] .thread{height:auto;max-height:240px}
.satie-dt-chat[data-rich="1"] .thread{max-height:min(72vh,760px)}
.satie-dt-chat .opt .od{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.satie-dt-chat .opt:hover .od,.satie-dt-chat .opt[data-sel="1"] .od{-webkit-line-clamp:4}
.satie-dt-chat .msg .note{font-size:11px;color:var(--mute);margin-top:4px}
.satie-dt-chat .msg{font-size:12.5px;line-height:1.5;white-space:pre-wrap;color:var(--ink)}
.satie-dt-chat .conv{display:flex;align-items:center;gap:8px;padding:7px 10px;border:0;border-left:2px solid transparent;border-radius:0 6px 6px 0;cursor:pointer}
.satie-dt-chat .conv:hover{background:rgba(235,231,223,.05)}
.satie-dt-chat .conv[data-cur="1"]{border-left-color:#ff8da1;background:rgba(235,231,223,.04)}
.satie-dt-chat .conv .n{font-family:'Inter',system-ui,sans-serif}
.satie-dt-chat .conv .ct2{flex:1;min-width:0}
.satie-dt-chat .conv .n{font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.satie-dt-chat .conv .d{font:10.5px var(--mono);color:var(--mute)}
.satie-dt .satie-dt-chat .conv .x{border:0;color:var(--mute);font-size:14px;padding:0 4px}
.satie-dt .satie-dt-chat .conv .x:hover{color:var(--ink)}
.satie-dt-chat .msg.you{color:var(--mute)}
.satie-dt-chat .msg.you .tx::before{content:'› ';color:var(--accent)}
.satie-dt-chat .msg .about{display:block;font-size:10.5px;color:var(--mute)}
.satie-dt-chat .reading .rline{font-size:12px;color:var(--ink);line-height:1.5}
.satie-dt-chat .reading textarea{width:100%;background:rgba(0,0,0,.3);color:var(--ink);border:1px solid var(--line);border-radius:5px;font:12px/1.5 inherit;padding:6px 8px;resize:vertical}
.satie-dt-chat .reading .racts{display:flex;gap:5px;margin-top:5px}
.satie-dt .satie-dt-chat .reading .racts button{font-size:10.5px;padding:1px 8px;color:var(--mute)}
.satie-dt .satie-dt-chat .reading .racts button.pri{border-color:var(--accent);color:var(--accent)}
.satie-dt-chat .msg{position:relative}
.satie-dt-chat .msg .mchips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:3px}
.satie-dt-chat .msg .mchips .chip{font-size:10.5px;padding:0 8px;border-radius:999px;border:1px solid var(--line);color:var(--ink)}
.satie-dt-chat .msg .mtools{position:absolute;right:0;top:0;display:none;gap:3px}
.satie-dt-chat .msg.you:hover .mtools{display:flex}
.satie-dt .satie-dt-chat .msg .mtools button{font-size:10.5px;padding:0 6px;color:var(--mute)}
.satie-dt-chat .msg .medit textarea{width:100%;background:rgba(0,0,0,.3);color:var(--ink);border:1px solid var(--line);border-radius:5px;font:12px/1.5 inherit;padding:6px 8px;resize:vertical}
.satie-dt-chat .msg .replaced{margin:4px 0 0 8px;padding-left:8px;border-left:1px dashed var(--line);opacity:.6}
.satie-dt-chat .msg .st{font-size:10.5px;color:var(--mute);margin-bottom:3px}
.satie-dt-chat .msg .who{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--warn);margin-bottom:2px}
.satie-dt-chat .msg.agent{border-left:2px solid rgba(212,168,80,.45);padding-left:9px}
.satie-dt-chat .msg.agent[data-activity="1"]{color:var(--mute);font-size:11px;font-style:italic}
.satie-dt-chat .msg.agent .cmd{font:11px/1.45 var(--mono);background:rgba(0,0,0,.3);border-radius:4px;padding:4px 6px;margin-top:4px;white-space:pre-wrap}
.satie-dt-chat .msg.agent .diff{font:11px/1.45 var(--mono);margin-top:4px;white-space:pre-wrap;overflow:hidden}
.satie-dt-chat .msg.agent .dl.add{color:#ebe7df;background:rgba(235,231,223,.10)}
.satie-dt-chat .msg.agent .dl.del{color:var(--danger);background:rgba(224,112,112,.10)}
.satie-dt-chat .scope .chip.agent{border-color:rgba(212,168,80,.55);color:var(--warn)}
.satie-dt-chat .msg .st::before{content:'✓ ';color:var(--accent)}
.satie-dt-chat .msg .suggest{margin-top:6px;padding:6px 8px;border:1px solid var(--hair);border-radius:5px;font-size:12px}
.satie-dt-chat .paths{display:flex;flex-direction:column;gap:5px;margin-top:6px}
.satie-dt-chat .paths[data-past="1"] .path{opacity:.62}
.satie-dt-chat .path{padding:6px 8px;border:1px solid var(--hair);border-radius:5px}
.satie-dt-chat .path .ph{display:flex;align-items:baseline;gap:7px}
.satie-dt-chat .path .pn{font:11px var(--mono);color:var(--accent)}
.satie-dt-chat .path .pl{flex:1;font-size:12px;color:var(--ink)}
.satie-dt-chat .path .pb{font-size:10px;color:var(--mute);white-space:nowrap}
.satie-dt-chat .path .pb[data-code="1"]{color:var(--warn)}
.satie-dt-chat .path .pd{font-size:11px;color:var(--mute);margin-top:2px;white-space:normal}
.satie-dt .satie-dt-chat .path button{margin-top:5px;font-size:11px;padding:2px 9px;border-color:var(--accent);color:var(--accent)}
.satie-dt-chat .msg .hear{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:6px}
.satie-dt .satie-dt-chat .msg .hear button{font-size:11px;padding:2px 10px;color:#0d0c0b;background:#ebe7df;border-color:#ebe7df;border-radius:999px}
.satie-dt-chat .msg .hear .when{font-size:11px;color:var(--mute)}
.satie-dt .satie-dt-chat .opt .more{font-size:10.5px;padding:1px 7px;color:var(--mute);flex:none}
.satie-dt-chat .opts .how{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mute);padding:0 2px 2px}
.satie-dt .satie-dt-chat .opts .how button{font-size:10.5px;padding:0 6px;color:var(--mute)}
.satie-dt-chat .msg .meta{font:10.5px var(--mono);color:var(--mute);margin-top:2px}
.satie-dt-chat .msg .card{margin-top:6px;border-left:2px solid var(--accent);padding:2px 0 2px 9px}
.satie-dt-chat .msg .card .h{font-size:10px;color:var(--mute);font-family:var(--mono);letter-spacing:.01em;margin-bottom:2px}
.satie-dt-chat .msg .card .c{font:11.5px var(--mono);color:var(--ink);padding:1px 0}
.satie-dt-chat .msg .card .dh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;min-width:0}
.satie-dt-chat .msg .card .dh .dn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-chat .msg .card .dh{cursor:pointer}
.satie-dt-chat .msg .card .dh:hover .dn{color:var(--ink)}
.satie-dt-chat .msg .card .dt{color:var(--mute);font-size:10px;width:10px;flex:none}
.satie-dt-chat .msg .card .dc{display:flex;gap:6px;font:11px var(--mono);flex:none}
.satie-dt-chat .msg .card .dc .add{color:var(--ink);font-weight:500}
.satie-dt-chat .msg .card .dc .del{color:#e06c6c;font-weight:500}
.satie-dt-chat .msg .card{min-width:0;overflow:hidden}
.satie-dt-chat .msg .card .de{flex:none}
.satie-dt-chat .msg .card .dn{font-size:11.5px;color:var(--ink)}
.satie-dt .satie-dt-chat .msg .card .de{font-size:10.5px;padding:1px 7px;color:var(--mute)}
.satie-dt-chat .msg .card .diff{font:11px/1.45 var(--mono);white-space:pre-wrap;margin-top:3px;overflow:hidden}
.satie-dt-chat .msg .card .dl{color:var(--mute);padding:0 4px}
.satie-dt-chat .msg .card .dl.add{color:#ebe7df;background:rgba(235,231,223,.10)}
.satie-dt-chat .msg .card .dl.del{color:var(--danger);background:rgba(224,112,112,.10)}
.satie-dt-chat .msg .card .dedit textarea{width:100%;margin-top:5px;background:rgba(0,0,0,.3);color:var(--ink);border:1px solid var(--line);border-radius:5px;font:11.5px/1.5 var(--mono);padding:6px 8px;resize:vertical}
.satie-dt-chat .msg .acts{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.satie-dt-chat .msg .where{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px;font-size:11.5px;color:var(--mute)}
.satie-dt .satie-dt-chat .msg .where button{font-size:11px;padding:2px 9px}
.satie-dt .satie-dt-chat .msg .acts button{font-size:11px;padding:2px 9px}
.satie-dt .satie-dt-chat .msg .acts button.pri{border-color:var(--accent);color:var(--accent)}
.satie-dt .satie-dt-chat .msg .acts button:disabled{opacity:.4}
.satie-dt-chat .opts{display:flex;flex-direction:column;gap:3px;margin-top:6px}
.satie-dt-chat .opt{display:flex;align-items:center;gap:9px;padding:5px 8px;border:1px solid var(--hair);border-radius:5px;cursor:pointer}
.satie-dt-chat .opt:hover{border-color:var(--line);background:var(--fill)}
.satie-dt-chat .opts[data-past="1"] .opt{opacity:.62}
.satie-dt-chat .opts[data-past="1"] .opt:hover{opacity:1}
.satie-dt-chat .opt[data-picked="1"]{border-color:rgba(235,231,223,.5);opacity:1}
.satie-dt-chat .opt[data-sel="1"]{border-color:var(--line);background:var(--fill)}
.satie-dt .satie-dt-chat .opt .use{display:none;font-size:11px;padding:2px 9px;border-color:var(--accent);color:var(--accent);flex:none}
.satie-dt .satie-dt-chat .opt[data-sel="1"] .use{display:inline-block}
.satie-dt .satie-dt-chat .opt[data-plain="1"] .use{display:none}
.satie-dt-chat .opt .num{font:11px var(--mono);color:var(--accent);width:14px;flex:none}
.satie-dt-chat .opt{flex-wrap:wrap}
.satie-dt-chat .opt .ob{flex:1 1 calc(100% - 24px);min-width:0}
.satie-dt-chat .opt .pv{margin-left:23px}
.satie-dt-chat .opt .ol{font-size:12px;color:var(--ink)}
.satie-dt-chat .opt .od{font-size:11px;color:var(--mute)}
.satie-dt-chat .opt.own{cursor:text;padding:3px 6px}
.satie-dt-chat .opt.own input{flex:1;background:none;border:0;color:var(--ink);font:inherit;font-size:12px;outline:none;padding:3px}
.satie-dt-chat .scope{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mute)}
.satie-dt-chat .scope:empty{display:none}
.satie-dt-chat .scope .chip{padding:0 7px;border:1px solid var(--line);border-radius:4px;color:var(--ink)}
.satie-dt .satie-dt-chat .scope .x{border:0;background:none;color:var(--mute);padding:0 4px;font-size:13px}
.satie-dt-chat .scope{flex-wrap:wrap}
.satie-dt-chat .reading{margin:0 0 6px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.03)}
.satie-dt-chat .reading .rline{font-size:12.5px;line-height:1.7;color:var(--ink)}
.satie-dt .satie-dt-chat .reading .rp{display:inline;border:0;background:none;padding:0 1px;margin:0;font:inherit;color:var(--ink);border-bottom:1px dotted rgba(232,228,218,.35);border-radius:0;cursor:pointer}
.satie-dt .satie-dt-chat .reading .rp[data-how="inferred"],.satie-dt .satie-dt-chat .reading .rp[data-how="default"]{border-bottom:1.5px solid rgba(235,231,223,.75);color:#ebe7df}
.satie-dt .satie-dt-chat .reading .rp[data-how="default"]{opacity:.8;font-style:italic}
.satie-dt .satie-dt-chat .reading .rp[data-bad="1"]{color:var(--danger);border-bottom:1.5px solid rgba(240,120,120,.8)}
.satie-dt .satie-dt-chat .reading .rp[data-open="1"]{background:rgba(235,231,223,.16)}
.satie-dt-chat .reading .rnote{font-size:11px;color:var(--warn);margin-top:3px}
.satie-dt-chat .reading .rpop{margin-top:6px;padding:7px 8px;border-radius:6px;background:rgba(0,0,0,.25);display:flex;flex-direction:column;gap:6px}
.satie-dt-chat .reading .rpop .rt{font-size:10.5px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute)}
.satie-dt-chat .reading .rpop .rnow{font-size:11.5px;color:var(--ink);opacity:.85}
.satie-dt .satie-dt-chat .reading .rp:disabled{cursor:default;color:inherit}
.satie-dt-chat .msg[data-past="1"] .reading{opacity:.55}
.satie-dt-chat .msg .plan{margin:6px 0 2px;padding:6px 8px;border:1px solid var(--line);border-radius:7px}
.satie-dt-chat .msg .plan .pl{font-size:10.5px;color:var(--mute);margin-bottom:3px}
.satie-dt-chat .msg .plan .pd{font-size:11.5px;color:var(--ink);line-height:1.45}
.satie-dt-chat .reading .rpop .rq{display:flex;flex-wrap:wrap;gap:5px}
.satie-dt .satie-dt-chat .reading .rpop .rq button{font-size:11.5px;padding:2px 8px;border-radius:5px}
.satie-dt-chat .reading .rpop .rown{display:flex;gap:5px;align-items:center}
.satie-dt-chat .reading .rpop .rown input{flex:1;min-width:0;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:5px 7px;font:inherit;font-size:12px;outline:none}
.satie-dt-chat .scope .chip{display:inline-flex;align-items:center;gap:2px}
.satie-dt-chat .scope .chip.intent{gap:6px;border-color:rgba(255,141,161,.6);background:rgba(255,141,161,.1);color:#f3d7dc;padding:1px 4px 1px 8px;border-radius:999px;animation:satieDtIntent 1.3s ease-in-out 2}
.satie-dt-chat .scope .chip.intent b{color:#ff8da1;font-weight:600}
@keyframes satieDtIntent{0%,100%{box-shadow:0 0 0 0 rgba(255,141,161,0)}50%{box-shadow:0 0 0 5px rgba(255,141,161,.14)}}
@media (prefers-reduced-motion: reduce){.satie-dt-chat .scope .chip.intent{animation:none}}
.satie-dt .satie-dt-chat .scope .chip .x{padding:0 0 0 4px;font-size:12px}
.satie-dt .satie-dt-chat .scope .add{border:1px dashed var(--line);background:none;color:var(--mute);border-radius:4px;padding:0 7px;font-size:11px}
.satie-dt-chat .scope .hint{font-size:10.5px;opacity:.75}
.satie-dt-chat .irow{display:flex;gap:6px;align-items:flex-end;padding-top:6px}
.satie-dt-forkask{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483600;box-sizing:border-box;width:min(360px,calc(100vw - 32px));display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid var(--line);border-radius:12px;background:rgba(13,12,11,.98);box-shadow:0 18px 50px rgba(0,0,0,.5);color:var(--ink);font:12.5px/1.5 var(--mono)}
.satie-dt-forkask .ft{font-size:14px;font-weight:500;padding-right:28px}
.satie-dt-forkask .fx{all:unset;position:absolute;top:10px;right:10px;width:28px;height:28px;display:grid;place-items:center;border-radius:6px;color:var(--mute);font:18px/1 var(--mono);cursor:pointer}
.satie-dt-forkask .fx:hover{color:var(--ink);background:rgba(235,231,223,.08)}
.satie-dt-forkask .fd{color:var(--mute);line-height:1.5}
.satie-dt-forkask .fa{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:4px}
.satie-dt-forkask .fa .pri{display:inline-flex;align-items:center;border:0;border-radius:8px;padding:8px 14px;background:var(--accent);color:var(--bg);font:inherit;font-weight:500;text-decoration:none;cursor:pointer}
.satie-dt-forkask .fa .link{border:0;background:none;padding:0;color:var(--mute);font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.satie-dt-forkask .fa .link:hover{color:var(--ink)}
.satie-dt-forkask .fa .pri:focus-visible,.satie-dt-forkask .fa .link:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.satie-dt-chat .fork{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px 12px;margin-top:6px;border:1px solid var(--line);border-radius:10px}
.satie-dt-chat .fork .ft{font-size:12.5px}
.satie-dt-chat .fork .fd{font-size:11px;color:var(--mute);line-height:1.45}
.satie-dt-chat .fork a.pill{text-decoration:none;color:inherit;padding:4px 12px;border:1px solid var(--line)}
.satie-dt-chat textarea{flex:1;resize:none;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px 9px;font:inherit;font-size:12.5px;line-height:1.4;height:34px;min-height:34px;max-height:35vh;outline:none;overflow-y:auto}
.satie-dt-chat textarea:focus{border-color:rgba(235,231,223,.5)}
.satie-dt .satie-dt-chat .send{border-color:var(--line);color:var(--ink);border-radius:6px;padding:7px 11px}
.satie-dt-ask .note .res{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.satie-dt-ask .note .res .rt{font-size:11px;color:var(--ink);margin-right:4px}
.satie-dt .satie-dt-ask .note .res button{font-size:10.5px;padding:2px 9px;color:var(--ink);border-color:var(--line)}
.satie-dt .satie-dt-ask .note .res button.pri{color:#0d0c0b;background:#ebe7df;border-color:#ebe7df}
.satie-dt-row[data-offview="1"] .name .host::after{content:" · not in view";font-weight:400;font-size:10.5px;color:var(--mute)}
.satie-dt-ask .note .plan{flex-basis:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;margin-top:2px}
.satie-dt-ask .note .plan .pl{font-size:10.5px;color:var(--mute);margin-bottom:3px}
.satie-dt-ask .note .plan .pt .n{font-size:11.5px;color:var(--ink);cursor:pointer}
.satie-dt-ask .note .plan .pt .n:hover{text-decoration:underline}
.satie-dt-ask .note .pa{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.satie-dt .satie-dt-ask .note .pa button{font-size:10.5px;padding:2px 8px;color:var(--ink);border-color:var(--line)}
.satie-dt .satie-dt-ask .note .pa button.pri{color:#0d0c0b;background:#ebe7df;border-color:#ebe7df}
.satie-dt-evhead{padding:10px 16px 8px;font-size:11px;color:var(--mute);line-height:1.45}
.satie-dt-bin{margin:10px 16px 16px;border:1px dashed var(--line);border-radius:8px;padding:8px 10px}
.satie-dt-bin .hd{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute);margin-bottom:4px}
.satie-dt-bin .it{display:flex;align-items:center;gap:8px;padding:3px 0}
.satie-dt-bin .it .n{flex:1;min-width:0;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-addsheet{position:absolute;top:112px;width:360px;max-height:calc(100vh - 150px);overflow:auto;z-index:41;background:#151412;border:1px solid var(--line);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.5);padding:10px 14px 14px;display:flex;flex-direction:column;gap:9px}
.satie-dt[data-corner=right] .satie-dt-addsheet{right:calc(100% + 12px)}
.satie-dt[data-corner=left] .satie-dt-addsheet{left:calc(100% + 12px)}
.satie-dt-addsheet .ah{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute)}
.satie-dt .satie-dt-addsheet .ah .x{border:0;padding:0 4px;font-size:15px;color:var(--mute)}
.satie-dt-addsheet > *{flex-shrink:0}
.satie-dt-addsheet textarea.aw{min-height:64px;font-size:14px;line-height:1.45;border:1.5px solid rgba(235,231,223,.45);background:rgba(0,0,0,.35);padding:9px 11px}
.satie-dt-addsheet textarea.aw::placeholder{color:rgba(235,231,223,.55)}
.satie-dt-addsheet .ag .aw{margin-top:5px}
.satie-dt-addsheet .aw{width:100%;resize:vertical;height:auto;max-height:96px;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px 9px;font:12.5px/1.45 inherit;font-family:inherit}
.satie-dt-addsheet .aw:focus{outline:none;border-color:rgba(235,231,223,.55)}
.satie-dt-addsheet .at{font-size:10.5px;color:var(--mute);margin-bottom:4px}
.satie-dt-addsheet .ag[data-unset="1"] .at::after{content:' · not said, SATIE decides';opacity:.7}
.satie-dt-addsheet .ao{display:flex;flex-wrap:wrap;gap:5px}
.satie-dt .satie-dt-addsheet .asel{width:100%;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:5px 7px;font:inherit;font-size:12px}
.satie-dt .satie-dt-addsheet .ao button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:4px 9px;text-align:left;border-radius:6px}
.satie-dt .satie-dt-addsheet .ao button[data-on="1"]{border-color:rgba(235,231,223,.6);background:rgba(235,231,223,.12);color:var(--ink)}
.satie-dt-addsheet .ao .l{font-size:12px}
.satie-dt-addsheet .ao .d{font-size:10.5px;color:var(--mute)}
.satie-dt .satie-dt-addsheet .pri{align-self:flex-end}
.satie-dt .satie-dt-tools .addbtn{flex:none;width:26px;padding:0;font-size:15px}
.satie-dt .satie-dt-tools .binchip{flex:none;font-size:10.5px;color:#e07070;border-color:rgba(224,112,112,.4)}
.satie-dt .satie-dt-tools .clear[data-on="0"]{color:var(--mute);border-color:var(--line)}
.satie-dt-grp .tri{width:30px;height:30px;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center}
.satie-dt-props details.adv{margin-top:6px;border-top:1px solid var(--hair);padding-top:4px}
.satie-dt-props details.adv summary{cursor:pointer;font-size:10.5px;color:var(--mute);padding:3px 0}
.satie-dt-props textarea.blk{min-height:120px;height:auto;margin:4px 0 6px;font-size:11px}
.satie-dt-props .satie-dt-ask{padding:4px 0 10px;border:0}
.satie-dt-row .acts .xtra{display:none}
.satie-dt-row[data-more="1"] .acts .xtra{display:inline-block}
.satie-dt-row .acts .more{letter-spacing:.05em}
.satie-dt-row .acts .fire:disabled{opacity:.2}
.satie-dt .satie-dt-row .acts .fire.pv{width:22px;height:20px;border-radius:10px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:rgba(235,231,223,.08);color:var(--ink);border:0}
.satie-dt .satie-dt-row .acts .fire.pv[data-state=playing]{background:#ff8da1;color:#0d0c0b}
.satie-dt-row[data-off="1"]{opacity:.72}
.satie-dt[data-hovering="1"] .satie-dt-row:not([data-hover="1"]),.satie-dt[data-hovering="1"] .satie-dt-grp>*{opacity:.78}
.satie-dt-now .it[data-out="1"] .n,.satie-dt-now .it[data-out="1"] .mt{opacity:.55}
.satie-dt-now .hd .solo{font-size:10px;color:#ebe7df;margin-left:6px}
.satie-dt [hidden]{display:none !important}
.satie-dt-tools{display:flex;flex-wrap:nowrap;gap:6px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line)}
/* one height for every control in the row (2026-10-16: the select, search, toggle and buttons were four heights) */
.satie-dt .satie-dt-tools>*{height:26px;box-sizing:border-box;font-size:11px;line-height:1}
.satie-dt .satie-dt-tools button{display:inline-flex;align-items:center;justify-content:center;padding:0 9px}
.satie-dt-tools .seg{display:flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;flex:none}
.satie-dt .satie-dt-tools .seg button{height:100%;border:0;border-radius:0;padding:0 8px;color:var(--mute)}
.satie-dt .satie-dt-tools .seg button[data-on="1"]{background:#ebe7df;color:#0d0c0b}
.satie-dt .satie-dt-scapehead{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:12px 16px 8px;font:500 12.5px 'IBM Plex Mono',monospace;color:var(--ink);cursor:pointer;border-top:1px solid var(--line)}
.satie-dt .satie-dt-scapehead .tri{width:10px;color:var(--mute);font-size:10px}
.satie-dt .satie-dt-scapehead i{width:9px;height:9px;border:1.4px dashed currentColor;border-radius:50%;box-sizing:border-box}
.satie-dt .satie-dt-scapehead small{margin-left:auto;font:10.5px var(--mono);color:var(--mute)}
.satie-dt .satie-dt-scapehead:hover{background:rgba(235,231,223,.04)}
.satie-dt .satie-dt-unit[data-scapefold="1"]{display:none!important}
.satie-dt .satie-dt-tools .search{flex:1 1 60px;min-width:48px;font:inherit;font-size:11px;color:var(--ink);background:var(--fill);border:1px solid var(--line);border-radius:6px;padding:0 8px}
.satie-dt .satie-dt-tools select{flex:none;width:112px;font:inherit;font-size:11px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:0 6px}
.satie-dt .satie-dt-tools .clear{flex:none;white-space:nowrap;color:var(--warn);border-color:rgba(212,168,80,.4)}
.satie-dt-askfoot{border-top:1px solid var(--line)}
.satie-dt-askfoot .satie-dt-ask{border-bottom:0}
.satie-dt-foot .acct{font-size:10.5px;color:var(--mute)}
.satie-dt .signin{color:#0d0c0b;background:#ebe7df;border-color:#ebe7df;border-radius:999px;font-size:11px;padding:3px 10px}
.satie-dt .signin:disabled{opacity:.7}
.satie-dt-hearing{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:20px auto;gap:4px 8px;padding:8px 16px 10px;box-sizing:border-box;border-bottom:1px solid var(--line)}
.satie-dt-hearing .chip[data-loud="1"] i{animation:satieLoud 1.5s ease-in-out infinite}
@keyframes satieLoud{0%,100%{transform:scale(1)}50%{transform:scale(1.45)}}
@media (prefers-reduced-motion: reduce){.satie-dt-hearing .chip[data-loud="1"] i{animation:none}}
.satie-dt-hearing .chips{grid-column:1 / -1;grid-row:2;display:flex;flex-wrap:wrap;align-content:start;align-items:start;gap:4px 8px;min-width:0;overflow:hidden}
.satie-dt-hearing[data-expanded="1"]{max-height:240px;overflow-y:auto}
.satie-dt-hearing .lbl{grid-column:1 / -1;grid-row:1}
.satie-dt-hearing .more{grid-column:2;grid-row:1;justify-self:end}
.satie-dt-hearing .none{grid-column:1 / -1}
.satie-dt-hearing-tip{position:fixed;z-index:2147483647;max-width:320px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:12px;white-space:pre-line;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.3)}
.satie-dt-hearing-tip[hidden]{display:none}
.satie-dt-unit[data-personal="1"]{margin:6px 8px 8px;border:1px solid var(--line);border-radius:10px;background:var(--fill);overflow:hidden}
.satie-dt-unit[data-personal="1"]>.satie-dt-grp{margin:0;padding:13px 14px;min-height:0;border-bottom:0;gap:10px}
.satie-dt-unit[data-personal="1"]>.satie-dt-grp .gname{font-size:13px;font-weight:500}
.satie-dt-unit[data-personal="1"]>.satie-dt-grp .gname small{display:none}
.satie-dt-unit[data-personal="1"]>.satie-dt-grp .gicon{width:8px;height:8px}
.satie-dt-unit[data-personal="1"]>.satie-dt-grp[data-collapsed="1"] .ms{display:none}
.satie-dt-hearing .lbl{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute);margin-right:4px}
.satie-dt-hearing .none{font-size:11px;color:var(--mute)}
.satie-dt .satie-dt-hearing .chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:2px 9px 2px 7px;border-radius:999px;border-color:var(--line);--c:#ff8da1;--lv:.6;min-width:0;flex:0 1 auto;white-space:nowrap}
.satie-dt .satie-dt-hearing .chip[hidden]{display:none}
.satie-dt-hearing .chip span{overflow:hidden;text-overflow:ellipsis;min-width:0}
.satie-dt-hearing .chip i,.satie-dt-hearing .lbl,.satie-dt-hearing .more{flex-shrink:0}
.satie-dt-hearing .chip i{width:7px;height:7px;border-radius:50%;background:var(--c);opacity:calc(.4 + var(--lv) * .6);box-shadow:0 0 calc(2px + var(--lv) * 9px) calc(var(--lv) * 3px) color-mix(in srgb,var(--c) 70%,transparent)}
.satie-dt .satie-dt-hearing .chip{position:relative;overflow:hidden}
.satie-dt-hearing .chip b{position:absolute;left:8px;right:8px;bottom:1px;height:2px;border-radius:1px;background:var(--c);transform-origin:right center;}
.satie-dt-hearing .chip[data-faint="1"] i{background:color-mix(in srgb,var(--c) 35%,#2a2927);box-shadow:none}
.satie-dt-hearing .chip[data-faint="1"]{color:var(--mute)}
.satie-dt .satie-dt-hearing .more{font-size:10.5px;padding:2px 7px;border-radius:999px;color:var(--mute)}
.satie-dt-empty{padding:18px 16px;color:var(--mute);font-size:11.5px}
.satie-dt-bedbox{margin:6px 8px 8px;border:1px solid var(--line);border-radius:10px;background:var(--fill);overflow:hidden}
.satie-dt-bedbox[data-heard="1"]{animation:satie-bed-breathe 3.2s ease-in-out infinite}
.satie-dt-bedbox[data-open="1"] .satie-dt-bedhead{border-bottom:1px solid var(--line)}
.satie-dt-bedbox .satie-dt-item:last-child .satie-dt-row{border-bottom:0}
.satie-dt-bedhead{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;color:var(--ink);font:inherit;font-size:13px;font-weight:500;padding:13px 14px;cursor:pointer}
.satie-dt-bedhead .tri{color:var(--mute);font-size:18px;line-height:1;width:18px;text-align:center}
.satie-dt-bedhead:hover{background:rgba(235,231,223,.06)}
/* the fold: a quiet line of text under the list, not a button box (it took the generic button's border) */
.satie-dt .satie-dt-farhead{display:flex;align-items:center;justify-content:center;gap:6px;width:calc(100% - 32px);height:auto;margin:4px 16px 10px;padding:10px 0 4px;background:none;border:0;border-top:1px solid var(--hair);border-radius:0;box-shadow:none;color:var(--mute);font:inherit;font-size:11.5px;letter-spacing:.01em;cursor:pointer}
.satie-dt .satie-dt-farhead:hover{color:var(--ink);background:none}
/* the chosen group: a lens over the list, so a strip above it, not an entry in it */
.satie-dt-unit[data-off="1"]{opacity:.35;filter:grayscale(1);pointer-events:none}
/* the top row (2026-10-18, style A): text tabs on a hairline, the open one underlined in green; background and
   you (sounds, with their live dot) on the left, groups at the right (a lens: its underline is dashed). The open
   tab's content sits under the line, full width */
.satie-dt .satie-dt-bedbox.satie-dt-shelf{margin:0;border:0;border-radius:0;background:none;overflow:visible}
.satie-dt .satie-dt-body .satie-dt-shelf{position:sticky;top:0;z-index:3;background:#0d0c0b}
.satie-dt .satie-dt-body .satie-dt-shelf[data-open="1"]{max-height:45vh;overflow:auto}
.satie-dt-shelf .shelf-tabs{display:flex;align-items:stretch;gap:16px;padding:0 16px;border-bottom:1px solid var(--line)}
.satie-dt-shelf .shelf-pair{display:flex;gap:16px;min-width:0}
.satie-dt .satie-dt-shelf .shelf-tab{flex:none;display:flex;align-items:center;gap:6px;height:32px;padding:0 1px;margin-bottom:-1px;background:none;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--mute);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;transition:color .15s ease,border-color .15s ease}
.satie-dt .satie-dt-shelf .shelf-tab:hover{color:var(--ink);background:none}
.satie-dt .satie-dt-shelf .shelf-tab[data-on="1"]{color:var(--ink);border-bottom-color:var(--accent)}
.satie-dt .satie-dt-shelf .shelf-tab.lens{margin-left:auto}
.satie-dt .satie-dt-shelf .shelf-tab.lens[data-on="1"]{border-bottom-style:dashed}
.satie-dt-shelf .shelf-tab .n{font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums}
.satie-dt-shelf .shelf-tab .dot{width:6px;height:6px;border-radius:50%;flex:none;border:1px solid color-mix(in srgb,var(--accent) 70%,transparent);background:transparent;transition:background .6s ease,box-shadow .6s ease,border-color .6s ease}
.satie-dt-shelf .shelf-tab[data-playing="1"] .dot{background:color-mix(in srgb,var(--sound) 35%,#2a2927);border-color:color-mix(in srgb,var(--sound) 45%,#2a2927)}
.satie-dt-shelf .shelf-tab[data-heard="1"] .dot{background:var(--sound);border-color:var(--sound);box-shadow:0 0 7px 1px color-mix(in srgb,var(--sound) 65%,transparent)}
/* the open tab's content is its own block: tinted, a green edge on its left, ended by "close" and a firm rule
   with space before the list of things starts */
.satie-dt-shelf .shelf-panel{background:#1b1a18;box-shadow:inset 2px 0 0 color-mix(in srgb,var(--accent) 70%,transparent);border-bottom:1px solid rgba(235,231,223,.22);margin-bottom:10px}
.satie-dt-shelf[data-tab="groups"] .shelf-panel{box-shadow:inset 2px 0 0 color-mix(in srgb,var(--accent) 45%,transparent)}
/* as tall as its entries, up to a cap; past it, it scrolls inside (no empty space for short lists) */
.satie-dt-shelf .shelf-body{max-height:min(560px,55vh);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.satie-dt .satie-dt-shelf .shelf-close{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;height:26px;padding:0;background:none;border:0;border-top:1px solid var(--hair);border-radius:0;color:var(--mute);font:inherit;font-size:10.5px;cursor:pointer}
.satie-dt .satie-dt-shelf .shelf-close:hover{color:var(--ink);background:rgba(235,231,223,.04)}
.satie-dt-shelf .gtag{font-size:9.5px;font-family:var(--mono);letter-spacing:.01em;color:var(--accent);border:1px dashed var(--accent);border-radius:4px;padding:0 5px}
.satie-dt-shelf .gsec{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute);padding:9px 16px 3px}
.satie-dt .satie-dt-shelf .grow{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;background:none;border:0;border-radius:0;padding:7px 16px;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
.satie-dt .satie-dt-shelf .grow:hover{background:rgba(235,231,223,.06)}
.satie-dt-shelf .grow .gc{font-size:11px;color:var(--mute)}
.satie-dt .satie-dt-shelf .grow.gnew{color:var(--accent)}
.satie-dt-groupbar .gb-input{flex:1;min-width:0;background:rgba(0,0,0,.25);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:4px 8px;font:inherit;font-size:12.5px}
.satie-dt-groupbar .gb-input:focus{outline:none;border-color:var(--accent)}
.satie-dt-groupbar .gb-hint{font-size:11px;color:var(--mute);flex:1;min-width:160px}
.satie-dt .satie-dt-groupbar .gb-save:not(:disabled){color:#0d0c0b;background:#ebe7df;border-color:#ebe7df}
.satie-dt .satie-dt-groupbar .gb-back{flex:none;font-size:11px;padding:2px 9px;color:var(--ink)}
.satie-dt-groupbar{display:flex;flex-direction:column;gap:6px;padding:9px 16px;border-bottom:1px solid rgba(235,231,223,.35);background:#171614}
.satie-dt-groupbar .gb-head{display:flex;align-items:baseline;gap:8px;min-width:0}
.satie-dt-groupbar .gb-tag{font-size:9.5px;font-family:var(--mono);letter-spacing:.01em;color:var(--accent);border:1px dashed var(--accent);border-radius:4px;padding:0 5px;flex:none}
.satie-dt-groupbar .gb-name{font-size:13px;font-weight:500;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.satie-dt-groupbar .gb-cnt{font-size:11px;color:var(--mute);white-space:nowrap}
.satie-dt-groupbar .gb-ctl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.satie-dt-groupbar input[type=range]{width:120px}
.satie-dt .satie-dt-groupbar button{font-size:11px;padding:2px 8px}
.satie-dt .satie-dt-groupbar .gb-all{margin-left:auto}
.satie-dt .satie-dt-groupbar .gb-del:hover{color:var(--danger);border-color:var(--danger)}
.satie-dt .satie-dt-farhead i{font-style:normal;font-size:9px;opacity:.8}
.satie-dt-bedhead .dot{width:8px;height:8px;border-radius:50%;flex:none;border:1.5px solid var(--accent);background:transparent}
.satie-dt-bedbox[data-playing="1"] .satie-dt-bedhead .dot{background:color-mix(in srgb,var(--sound) 35%,#2a2927);border-color:color-mix(in srgb,var(--sound) 35%,#2a2927)}
.satie-dt-bedbox[data-heard="1"] .satie-dt-bedhead .dot{background:var(--sound);border-color:var(--sound);box-shadow:0 0 9px 2px color-mix(in srgb,var(--sound) 70%,transparent);animation:satie-bed-dot 3.2s ease-in-out infinite}
@keyframes satie-bed-breathe{0%,100%{box-shadow:0 0 0 0 rgba(255,141,161,0)}50%{box-shadow:0 0 16px 0 rgba(255,141,161,.32);border-color:rgba(255,141,161,.45)}}
@keyframes satie-bed-dot{0%,100%{box-shadow:0 0 5px 1px color-mix(in srgb,var(--sound) 50%,transparent)}50%{box-shadow:0 0 12px 3px color-mix(in srgb,var(--sound) 85%,transparent)}}
@media (prefers-reduced-motion:reduce){.satie-dt-bedbox,.satie-dt-bedhead .dot{animation:none}}
.satie-dt-bedhead[hidden]{display:none}
/* One line per sound; its controls appear when you select it. */
.satie-dt-row{grid-template-columns:1fr auto auto;grid-template-areas:"name lv ms" "sub sub sub" "ctl ctl ctl";align-items:center;padding-top:7px;padding-bottom:7px}
.satie-dt-row > .ms{grid-area:ms;display:flex;gap:4px}
.satie-dt-row .ctl{display:none}
.satie-dt-row[data-sel="1"] .ctl,.satie-dt-row[data-open="1"] .ctl{display:flex;margin-top:4px}
/* a sound's ×N row keeps its fader in view, as a thing's header does */
.satie-dt-row.satie-dt-kind .ctl{display:flex;margin-top:2px}
.satie-dt-kind .ctl input[type=range]{flex:1;min-width:0}
.satie-dt-ask{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line)}
.satie-dt-ask.row{grid-column:1/-1;padding:6px 0 0;border:0}
.satie-dt-row[data-more="1"] .satie-dt-ask.xtra{display:flex}
.satie-dt-row .satie-dt-ask.xtra{display:none}
.satie-dt-ask input{flex:1;min-width:0;font:inherit;font-size:12px;color:var(--ink);background:var(--fill);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.satie-dt-ask input:focus{outline:0;border-color:rgba(235,231,223,.45)}
.satie-dt .satie-dt-ask button{color:#ebe7df;border-color:rgba(235,231,223,.35)}
.satie-dt-ask .note{flex-basis:100%;font-size:10.5px;color:var(--mute)}
.satie-dt-ask .note:empty{display:none}
.satie-dt-filter{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line)}
.satie-dt-filter .lbl{font-size:10px;font-family:var(--mono);letter-spacing:.01em;color:var(--mute);margin-right:4px}
.satie-dt .satie-dt-filter button{font-size:10.5px;padding:2px 8px;border-radius:999px;color:var(--mute)}
.satie-dt .satie-dt-filter button[data-on="1"]{color:#0d0c0b;background:#ebe7df;border-color:#ebe7df}
.satie-dt-focus{border-left:2px solid var(--accent)}
.satie-dt .satie-dt-focus>.satie-dt-grp .cnt{display:inline}
.satie-dt-focus>.satie-dt-grp .what{display:block;font-size:11px;color:var(--mute)}
.satie-dt-grp .gtrim,.satie-dt-kind .gtrim{flex:none;font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums;white-space:nowrap}
.satie-dt .satie-dt-grp[data-trim="1"]{flex-wrap:wrap}
.satie-dt .satie-dt-grp .tri,.satie-dt .satie-dt-grp .ms{flex:none}
.satie-dt .satie-dt-grp>.gctl{flex:1 0 100%;display:flex;align-items:center;gap:8px;padding-left:57px;box-sizing:border-box;cursor:default}
.satie-dt .satie-dt-grp>.gctl input[type=range]{flex:1;min-width:0}
/* the name keeps its room (two lines: the thing, what it makes); the group fader wraps under it, never over it */
.satie-dt .satie-dt-grp{background:#0d0c0b;row-gap:4px;padding-bottom:8px}
.satie-dt .satie-dt-grp .gname{flex:1 1 150px;display:flex;flex-direction:column;gap:1px;white-space:normal}
.satie-dt .satie-dt-grp{background:#1c1b19}
.satie-dt .satie-dt-body .satie-dt-grp{top:var(--shelfh,0px)}
/* a header pins over the sounds scrolling under it: its background is never see-through, selected or not */
.satie-dt .satie-dt-grp[data-sel="1"]{background:linear-gradient(rgba(235,231,223,.07),rgba(235,231,223,.07)),#1c1b19}
.satie-dt .satie-dt-grp .gname .pname{font-weight:500}
.satie-dt .satie-dt-grp .gicon{flex:none;width:11px;height:11px;border:1.5px solid rgba(244,243,238,.8);border-radius:3px;box-sizing:border-box}
.satie-dt .satie-dt-grp .gicon[data-kind="group"]{border-style:dashed;border-color:#ebe7df}
/* a thing's icon lights as its sounds' dots do (2026-10-18): the square says thing, the mint light says sound */
.satie-dt .satie-dt-grp .gicon{transition:background .6s ease,border-color .6s ease,box-shadow .6s ease}
.satie-dt .satie-dt-grp[data-playing="1"] .gicon{background:color-mix(in srgb,#ff8da1 35%,#2a2927);border-color:color-mix(in srgb,#ff8da1 60%,#2a2927)}
.satie-dt .satie-dt-grp[data-heard="1"] .gicon{background:#ff8da1;border-color:#ff8da1;box-shadow:0 0 calc(3px + var(--lv,.5) * 9px) calc(var(--lv,.5) * 3px) rgba(255,141,161,.75)}
.satie-dt .satie-dt-grp .gicon[data-kind="you"]{border-radius:50%}
.satie-dt-grp .gname .etag{display:inline-block;margin-left:7px;font-weight:400;font:9.5px/1 var(--mono);letter-spacing:.01em;color:var(--mute);border:1px solid rgba(235,231,223,.2);border-radius:3px;padding:2px 4px;vertical-align:1px}
.satie-dt .satie-dt-unit[data-personal="1"]>.satie-dt-grp{display:flex;align-items:center;gap:10px;padding:3px 9px;font-size:11px;font-weight:400;line-height:1.3;border:1px solid var(--line);border-radius:6px;background:transparent}
.satie-dt .satie-dt-unit[data-personal="1"]>.satie-dt-grp .tri{width:18px;height:18px;font-size:18px;flex:none}
.satie-dt .satie-dt-unit[data-personal="1"]>.satie-dt-grp .gname,.satie-dt .satie-dt-unit[data-personal="1"]>.satie-dt-grp .pname{font-size:11px;font-weight:400}
.satie-dt .satie-dt-unit[data-personal="1"]>.satie-dt-grp .cnt{font:inherit;color:inherit;margin-left:4px}
.satie-dt .satie-dt-unit[data-personal="1"]>.satie-dt-grp .dot{width:8px;height:8px;border-radius:50%;flex:none;border:1.5px solid var(--accent);background:transparent}
.satie-dt .satie-dt-kind .tri{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;font-size:18px;color:var(--ink)}
.satie-dt .satie-dt-row .lv{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;line-height:1.4}
.satie-dt .satie-dt-grp[data-collapsed="1"] .cnt{display:inline}
.satie-dt-unit > .satie-dt-grp ~ * .satie-dt-row{padding-left:40px;background-image:linear-gradient(var(--line),var(--line));background-size:1px 100%;background-position:24px 0;background-repeat:no-repeat}
.satie-dt .satie-dt-grp .gname .pname,.satie-dt .satie-dt-grp .gname small{display:block;margin-left:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (prefers-reduced-motion: reduce){.satie-dt,.satie-spin,.satie-dt-row .sw{transition:none;animation:none}}
`;
const ICON = {
    play: '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,0 10,5 2,10"/></svg>',
    stop: '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1"/></svg>',
    load: '<svg width="13" height="13" viewBox="0 0 24 24" class="satie-spin" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 6.4 2.6"/></svg>',
};
/** Voice colours for a dark ground: Rose Noise and four near shades (the SATIE look, brain/company/brand/satie-look.md):
 * a sound's colour says where a sound is, and nothing else does. */
const DARK_BG_VOICE_COLORS = ['#ff8da1', '#ff9db0', '#f7889c', '#ffadbd', '#fb93a6'];
export const voiceColor = (statementIndex) => DARK_BG_VOICE_COLORS[statementIndex % DARK_BG_VOICE_COLORS.length];
const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls)
        e.className = cls;
    if (text !== undefined)
        e.textContent = text;
    return e;
};
const VOICE_HEADER = /^(?:(\d+)\s*\*\s*)?(loop|oneshot|on|trigger)\b/;
/** Split a script into the blocks its voice statements come from, in order (gen/world/room/entity blocks are skipped). */
/**
 * Why the runtime would refuse to load `next` (a parser warning it adds, a duplicate source_id),
 * or null when it loads. The same rule as `satie-runtime`'s loader (`sourceFingerprints`), and only
 * for what this edit introduces: a script that already had a warning is not made worse by it.
 */
export function whyUnloadable(next, before) {
    const warns = (t) => { try {
        return parseWithWarnings(t).warnings.map(w => w.message);
    }
    catch (e) {
        return [e instanceof Error ? e.message : String(e)];
    } };
    // by count, so a second copy of a warning the script already had still counts as new
    const was = new Map();
    for (const m of warns(before))
        was.set(m, (was.get(m) ?? 0) + 1);
    const added = warns(next).filter(m => { const n = was.get(m) ?? 0; if (n > 0) {
        was.set(m, n - 1);
        return false;
    } return true; });
    if (added.length)
        return `the script would not load in the game (${added[0]})`;
    try {
        sourceFingerprints(next);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
            sourceFingerprints(before);
        }
        catch {
            return null;
        } // already refused before this edit
        return `the script would not load in the game (${msg})`;
    }
    return null;
}
/** Where an aim landed: the contract object (when placing on a thing), the surface point (metres) and how far. */
/**
 * A sound's first `seconds` as a base64 WAV: how a find starts from a recording that is not in the
 * library (the developer's own file, a Freesound import). SATIE listens to it and describes it.
 */
export async function excerptBase64(buffer, seconds) {
    const frames = Math.min(buffer.length, Math.round(seconds * buffer.sampleRate));
    const ctx = new OfflineAudioContext(1, Math.max(1, frames), buffer.sampleRate);
    const cut = ctx.createBuffer(1, Math.max(1, frames), buffer.sampleRate);
    // mono: the find listens for what it is, not where it is
    const out = cut.getChannelData(0);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const d = buffer.getChannelData(c);
        for (let k = 0; k < frames; k++)
            out[k] += d[k] / buffer.numberOfChannels;
    }
    const bytes = new Uint8Array(await encodeWAV(cut, 16).arrayBuffer());
    let bin = '';
    for (let k = 0; k < bytes.length; k += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return btoa(bin);
}
/**
 * Why a setting's row is a text box rather than its control: the value is one the control cannot
 * show (it changes over time, follows the game, is a named colour, a range on a one-handle slider).
 * Null for a setting that is plain text by design (`recordings`, `source_id`, `at` …) or an empty value.
 */
export function textFallbackReason(kind, raw) {
    const v = raw.trim();
    if (kind === 'text' || !v)
        return null;
    if (/^follow\b/.test(v))
        return 'it follows the game, so it is typed here';
    if (/\b(fade|jump)\b/.test(v))
        return 'it changes over time, so it is typed here';
    if (/^\$?[a-z_]\w*$/i.test(v) && kind !== 'color')
        return 'it is a named value (a let), so it is typed here';
    if (kind === 'color')
        return 'a colour by name, so it is typed here';
    if (/to/.test(v) && (kind === 'slider' || kind === 'stepper'))
        return 'it is a range, picked fresh each time, so it is typed here';
    return 'a value this control cannot show, so it is typed here';
}
/** SATIE's sample-name grammar (src/lib/sampleNaming.ts): lowercase words joined by single hyphens. */
const SAMPLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * The add sheet's request in words: only what the person said. A chip they did not touch is not
 * sent (it would read as a choice), and nothing asks for options: SATIE decides from the words
 * whether to offer sounds to hear or reuse one already in the scene.
 */
export function addRequestText(what, said) {
    const parts = [said.kind ? `Kind: ${said.kind}.` : '', said.where ? `Where: ${said.where}.` : '', said.movement ? `Movement: ${said.movement}.` : '', said.often ? `How often: ${said.often}.` : '', said.when ? `When: ${said.when}.` : ''].filter(Boolean);
    return `Add a new sound: ${what.trim().replace(/[.\s]+$/, '')}.${parts.length ? ` ${parts.join(' ')}` : ''}`;
}
// `# @group` / `# @name` metadata lines live with the scene map (one reader for the mixer and SATIE)
export { GROUP_LINE, readGroupLines, writeGroupLines, NAME_LINE } from '../edit/sceneMap';
import { readGroupLines, writeGroupLines, NAME_LINE, objectKeyFor, hostClassesOf, partsOf, audioKey } from '../edit/sceneMap';
export function voiceBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim() || /^\s/.test(line)) {
            i++;
            continue;
        }
        // a top-level line: header of something
        let j = i + 1;
        while (j < lines.length && (/^\s/.test(lines[j]) && lines[j].trim() !== ''))
            j++;
        const m = line.match(VOICE_HEADER);
        if (m) {
            // comment lines directly above belong to the block
            let start = i;
            while (start > 0 && /^\s*[-#]/.test(lines[start - 1]) && lines[start - 1].trim() !== '')
                start--;
            blocks.push({ start, end: j, header: i, count: m[1] ? Math.max(1, parseInt(m[1], 10)) : 1 });
        }
        i = j;
    }
    return blocks;
}
export function blockAnchor(text, start) {
    const lines = text.split('\n'), blocks = voiceBlocks(text);
    const k = blocks.findIndex(b => b.start === start);
    return { prevHead: k > 0 ? lines[blocks[k - 1].header] : null, nextHead: k >= 0 && k < blocks.length - 1 ? lines[blocks[k + 1].header] : null, line: start };
}
/** Put a deleted voice block back where it was: before the voice that followed it, else after the one before it, else at its old line. */
export function restoreBlock(text, block, at) {
    const lines = text.split('\n'), blocks = voiceBlocks(text);
    const next = at.nextHead === null ? undefined : blocks.find(b => lines[b.header] === at.nextHead);
    const prev = at.prevHead === null ? undefined : blocks.find(b => lines[b.header] === at.prevHead);
    let pos;
    if (next)
        pos = next.start;
    else if (prev)
        pos = prev.end;
    else if (at.prevHead === null && blocks.length)
        pos = blocks[0].start;
    else
        pos = Math.min(at.line, lines.length);
    const body = block.replace(/^\n+|\n+$/g, '').split('\n');
    const out = [...lines.slice(0, pos), ...body, '', ...lines.slice(pos)];
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
}
/** Statement index → block, when the script's voice headers and the parsed (non-entity) statements line up. */
/**
 * Each statement's block, by the line its head is on (`sourceLine`). It used to pair them by
 * counting (the nth statement is the nth block), so when the parser's order and the text's order
 * disagreed, a sound's panel showed and edited ANOTHER sound's lines.
 */
function mapStatements(text, statements) {
    const byHeader = new Map(voiceBlocks(text).map(b => [b.header, b]));
    const map = new Map();
    statements.forEach((s, idx) => {
        if (s.entityId)
            return;
        const b = byHeader.get(s.sourceLine);
        if (b)
            map.set(idx, b);
    });
    return map.size ? map : null;
}
/** Edit authored source level without taking volume away from host controls or fades. */
export function trimSourceLevels(script, sourceIds, deltaDb) {
    if (!Number.isFinite(deltaDb) || !sourceIds.length)
        return null;
    const parsed = tryParse(script);
    if (!parsed.success || !parsed.statements)
        return null;
    let next = script;
    const num = (n) => String(Math.round(n * 100) / 100);
    const range = (a, b) => a === b ? num(a) : `${num(a)}to${num(b)}`;
    for (const sourceId of new Set(sourceIds)) {
        const matches = parsed.statements.filter(st => st.sourceId === sourceId);
        // one block: a single statement, or the copies an `N *` block expands into (one spl line moves them all)
        if (!matches.length || matches.some(st => st.sourceLine !== matches[0].sourceLine || st.sourceLine < 0))
            return null;
        const st = matches[0];
        if (st.entityId)
            return null;
        let value;
        if (st.splFollow) {
            // a level that follows the game moves its output range; the quiet end stops at the floor
            const f = st.splFollow;
            if (f.outMax + deltaDb > 140 || f.outMin + deltaDb > 140)
                return null;
            value = `follow ${f.signal} ${range(f.inMin, f.inMax)} ${range(Math.max(0, f.outMin + deltaDb), Math.max(0, f.outMax + deltaDb))}${f.curve !== undefined && f.curve !== 1 ? ` pow ${num(f.curve)}` : ''}`;
        }
        else {
            if (st.spl.isNull || st.spl.min + deltaDb < 0 || st.spl.max + deltaDb > 140)
                return null;
            value = range(st.spl.min + deltaDb, st.spl.max + deltaDb);
        }
        const edited = upsertVoiceProperty(next, { sourceId, kind: st.kind, clip: st.clip }, 'spl', value);
        if (!edited)
            return null;
        next = edited;
    }
    return next;
}
/** Rewrite a voice's head to play `clip` instead of what the parser read as its sound; the rest of the line stays. */
export function swapHeader(header, st, clip) {
    return (st && replaceHeadSound(header, st, clip)) ?? header;
}
export { shortName, soundsLike, soundAction, fallbackName, readableId } from '../core/voiceNames';
import { shortName, soundsLike, soundAction, fallbackName, whenItPlays } from '../core/voiceNames';
/** Mount the dev overlay for `engine`. Returns a handle; call `destroy()` to remove it. */
export function devtools(engine, opts = {}) {
    const fetch = opts.request ?? globalThis.fetch.bind(globalThis);
    const corner = opts.corner ?? 'right';
    // A static player (a scene saved on this device, e.g. Explore on satie.world) has no dev server behind it:
    // the conversation, adding sounds and new takes ask the visitor to fork the scene first (`opts.fork`);
    // no coding agent. Passing a chatUrl turns them on.
    const authoring = !opts.localStorageKey || opts.chatUrl !== undefined;
    const saveUrl = opts.saveUrl ?? '/__satie/save';
    const uploadUrl = opts.uploadUrl ?? '/__satie/upload';
    const libraryUrl = opts.libraryUrl ?? '/__satie/library';
    const freesoundUrl = opts.freesoundUrl ?? '/__satie/freesound';
    const takeUrl = opts.takeUrl ?? '/__satie/take';
    const findUrl = opts.findUrl ?? '/__satie/find';
    const varyUrl = opts.varyUrl ?? '/__satie/vary';
    const editUrl = opts.editUrl ?? '/__satie/edit';
    const authUrl = opts.authUrl ?? '/__satie/auth';
    const eventUrl = opts.localStorageKey ? null : opts.eventUrl === undefined ? '/__satie/authoring' : opts.eventUrl;
    const historyUrl = opts.localStorageKey ? null : opts.historyUrl === undefined ? '/__satie/history' : opts.historyUrl;
    const historyKey = opts.localStorageKey ? `${opts.localStorageKey}:history` : null;
    /** An object's name as people say it: its contract label, else its id with spaces. */
    // a place renamed in the mixer wins until the contract it was written to is read again
    /** Editing the world (the "move sounds" switch): drags write each sound's place, like its card's drag. */
    let worldEditing = false;
    const worldEditBtn = null;
    const placeNames = new Map();
    const labelOfHost = (id) => (opts.hostLabel ?? layer?.hostLabel)?.(id)?.trim() || undefined;
    /**
     * An object's name as people say it (2026-10-18): your rename; else the name the game gave it, as written;
     * a name several of a kind share gets a count among them ("Comet GT 1", "Comet GT 2"); a name the whole kind
     * shares ("Fixed rendered palm canopy" on 60 palms), or no name, is the kind and a count: "palm 13".
     */
    let kinsFrom = null, kins = new Map();
    const kinsOf = (prefix) => {
        const hosts = layer?.hosts?.() ?? [];
        const key = [engine.scriptStatements, hosts.length];
        if (!Array.isArray(kinsFrom) || kinsFrom[0] !== key[0] || kinsFrom[1] !== key[1]) {
            kinsFrom = key;
            kins = new Map();
            for (const id of new Set([...hosts.map(h => h.id), ...engine.scriptStatements.map(st => st.hostRef).filter((h) => !!h)])) {
                const m = /^(.+?[_-])\d+$/.exec(id);
                if (!m)
                    continue;
                kins.set(m[1], [...(kins.get(m[1]) ?? []), id]);
            }
            for (const list of kins.values())
                list.sort((a, b) => Number(/\d+$/.exec(a)[0]) - Number(/\d+$/.exec(b)[0]));
        }
        return kins.get(prefix) ?? [];
    };
    const hostName = (id) => {
        const own = placeNames.get(id);
        if (own)
            return own;
        const label = labelOfHost(id);
        const m = /^(.+?)([_-])(\d+)$/.exec(id);
        if (!m)
            return label || id.replace(/_/g, ' ');
        const kin = kinsOf(m[1] + m[2]);
        const same = label ? kin.filter(k => labelOfHost(k) === label) : [];
        if (label && (same.length < 2 || same.length < kin.length))
            return same.length < 2 ? label : `${label} ${same.indexOf(id) + 1}`;
        // no name, or the whole kind's name: the kind and a count (from one when the kind is numbered from 0)
        const fromZero = kin.some(k => /[_-]0$/.test(k));
        return `${m[1].replace(/_/g, ' ')} ${Number(m[3]) + (fromZero ? 1 : 0)}`;
    };
    const KINDS = {
        around: { label: 'background', title: 'all around you, from no single place' },
        yours: { label: 'yours', title: 'carried by you: it plays where you are' },
        moving: { label: 'moving', title: 'it moves: it wanders, or rides on a thing that moves' },
        place: { label: 'in place', title: 'it plays from a thing or a spot' },
        contact: { label: 'where it happens', title: 'no place of its own: it plays where the game sets it off (a step where the foot lands)' },
    };
    /** An event sound with no thing, spot or motion of its own: it is heard where each fire puts it, and is nowhere before one. */
    const playsWhereFired = (st) => st.kind === 'trigger' && !st.hostRef && !st.attachRef && !st.hasPlacement && (!st.wanderType || st.wanderType === 'none');
    function soundKind(st) {
        if (st.bed || st.field)
            return 'around';
        if (st.attachRef === 'listener' || st.hostRef && st.hostRef === layer?.listenerHost?.())
            return 'yours';
        if (playsWhereFired(st))
            return 'contact';
        if (st.entityId || (!!st.wanderType && st.wanderType !== 'none' && st.wanderType !== 'fixed') || (!!st.hostRef && layer?.hostMotion?.(st.hostRef) === 'moves'))
            return 'moving';
        return 'place';
    }
    /** "on the bell", or "with you" for the listener's own host (never "on the you"). */
    const onHost = (id) => id === layer?.listenerHost?.() ? 'with you' : `on the ${hostName(id)}`;
    const labelUrl = opts.labelUrl ?? '/__satie/label';
    const scriptUrl = opts.script;
    const samplesUrl = opts.samples ?? (scriptUrl ? scriptUrl.replace(/[^/]*$/, 'samples.json') : undefined);
    const hotkey = opts.hotkey ?? '`';
    const style = el('style');
    style.textContent = CSS + STRIP_CSS;
    document.head.appendChild(style);
    const root = el('div', 'satie-dt');
    root.dataset.corner = corner;
    root.dataset.collapsed = opts.collapsed ? '1' : '0';
    const launch = el('button', 'satie-dt-launch', 'SATIE · mixer');
    launch.setAttribute('aria-label', 'Open SATIE mixer');
    launch.dataset.corner = corner;
    launch.title = 'open the SATIE sound panel (backquote)';
    if (opts.launcher === false)
        launch.hidden = true;
    document.body.appendChild(launch);
    const layer = opts.locate ?? null;
    const bar = el('div', 'satie-dt-bar');
    const mark = el('span', 'mark');
    mark.innerHTML = MARK_SVG;
    mark.setAttribute('aria-hidden', 'true');
    const title = el('h2', 'ttl', 'SATIE sound mixer');
    const spacer = el('div', 'sp');
    const playBtn = el('button', 'pill', engine.isPlaying ? 'stop' : 'play');
    const hideBtn = el('button', 'x', '×');
    hideBtn.setAttribute('aria-label', 'Close mixer');
    hideBtn.title = 'close (Esc)';
    // A published scene's way to a copy of one's own, where it is seen first: beside stop, not only in the chat.
    const forkBtn = opts.fork ? el(opts.fork.href ? 'a' : 'button', 'forkbtn', 'fork') : null;
    if (forkBtn && opts.fork) {
        forkBtn.title = opts.fork.detail ? `${opts.fork.label}: ${opts.fork.detail}` : opts.fork.label;
        forkBtn.setAttribute('aria-label', opts.fork.label);
        if (forkBtn instanceof HTMLAnchorElement) {
            forkBtn.href = opts.fork.href;
            forkBtn.target = '_blank';
            forkBtn.rel = 'noopener';
        }
        forkBtn.addEventListener('click', () => { record('fork', { label: opts.fork.label, via: 'bar' }); opts.fork.onFork?.(script, script !== baselineScript); });
    }
    // (2026-11-13) no fork button in the bar: the strip's "published / fork to edit" card is the one way to it
    void forkBtn;
    bar.append(mark, title, spacer, playBtn, hideBtn);
    root.appendChild(bar);
    root.setAttribute('aria-label', 'SATIE sound mixer');
    const tabs = el('div', 'satie-dt-tabs');
    /** What the project's coding agent can read right now (.satie/now.md), in one line; shown once the box is being written. */
    const agentSees = el('div', 'satie-dt-agentsees');
    agentSees.hidden = true;
    let agentSnap = null;
    void agentSnap;
    // The world strip: how the game draws while the mixer is open, and whether the sound layer shows.
    const viewStrip = el('div', 'satie-dt-view');
    let focusOn = false;
    let soundsOn = true;
    /** Play or Edit, from elsewhere (Esc leaves Edit's dragging, not the view). */
    let viewStripMode = null;
    if (layer) {
        // Play: the game as the player gets it (no dots, no labels). Edit: every sound is its own dot and
        // any of them drags (dropped on a thing it sticks to it; Shift for that exact spot; scroll: height).
        // "sounds" and "move sounds" were two switches for one idea; "focus mode" is "dim the world" in Edit.
        // (2026-11-12) no Play / Edit and no "dim the world": with the mixer open every sound is a dot you can
        // drag; closing the mixer is the game as the player gets it. The world is never dimmed.
        const setMode = (editing) => { soundsOn = editing; layer.setSounds(editing); setWorldEditing(editing); record('view_mode', { mode: editing ? 'edit' : 'play' }); };
        viewStripMode = setMode;
        setTimeout(() => { if (soundsOn) {
            setWorldEditing(true, true);
            layer.setSounds(true);
        } }, 0);
        void focusOn;
    }
    viewStrip.hidden = true;
    const body = el('div', 'satie-dt-body');
    const foot = el('div', 'satie-dt-foot');
    const dragFrom = new Map();
    function setWorldEditing(on, quiet = false) {
        if (!layer?.setWorldEdit)
            return;
        worldEditing = on;
        // a published scene: grabbing a dot asks for your own copy; the sound stays where it is
        let asked = false;
        if (!authoring) {
            layer.setWorldEdit(on ? {
                onPreview: () => { if (!asked) {
                    asked = true;
                    askToFork('move a sound');
                } },
                onDrop: () => { asked = false; }, onCancel: () => { asked = false; },
            } : null);
            return;
        }
        layer.setWorldEdit(on ? {
            onPreview: (i, t) => {
                const views = engine.getTrackViews().filter(v => v.statementIndex === i);
                if (!dragFrom.has(i))
                    dragFrom.set(i, views.map(v => ({ key: v.key, x: v.position.x, y: v.position.y, z: v.position.z })));
                for (const v of views)
                    engine.setTrackPosition(v.key, t.point[0], t.point[1], t.point[2]);
            },
            onDrop: (i, t) => { dragFrom.delete(i); const st = engine.scriptStatements[i]; if (st)
                applyPlace(i, st, t); },
            onCancel: i => { for (const f of dragFrom.get(i) ?? [])
                engine.setTrackPosition(f.key, f.x, f.y, f.z); dragFrom.delete(i); },
        } : null);
        if (quiet)
            return;
        record('world_edit', { on });
        if (on && chatReady)
            say('Edit: drag any dot; dropped on a thing it sticks to it (Shift: that exact spot; scroll: height); click one to open it.');
    }
    const peek = el('div', 'satie-dt-peek');
    // One toolbar for finding sounds (scope, search, type) and clearing mutes; "tell SATIE" edits live at the bottom.
    const tools = el('div', 'satie-dt-tools');
    const askFoot = el('div', 'satie-dt-askfoot');
    // a sound's editor floats beside the panel over the world (not inside the list): the list stays
    // readable, the world stays live to drag the sound in; one at a time, closed by × / Esc / another sound
    const inspector = el('div', 'satie-dt-inspector');
    inspector.hidden = true;
    // dragging a slider here: you hear this sound alone while you move it, the mix comes back on release
    let soloBefore = null;
    inspector.addEventListener('pointerdown', e => {
        if (!e.target.matches('input[type=range]') || openProps === null)
            return;
        if (!engine.isPlaying)
            void engine.play?.();
        // the scene stays as it is while you drag (a solo silenced everything, a duck took the background away)
        soloBefore = [];
        // the mix always comes back: a release outside the window, a cancelled pointer or a lost focus
        // would otherwise leave every other sound silenced
        const end = () => { for (const t of ['pointerup', 'pointercancel', 'blur'])
            removeEventListener(t, end); e.target.removeEventListener('change', end); liveDrag = false; if (soloBefore) {
            restScene();
            soloBefore = null;
        } };
        for (const t of ['pointerup', 'pointercancel', 'blur'])
            addEventListener(t, end);
        e.target.addEventListener('change', end);
    });
    inspector.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('input, textarea')) {
        openProps = null;
        finder = null;
        buildMixer();
    } });
    // an edit made outside the mixer (a coding agent, an editor): what changed, and what of yours it undid
    const outsideBox = el('div', 'satie-dt-outside');
    outsideBox.hidden = true;
    // the same news while the mixer is closed: one line over the game; a click opens the mixer on it
    const outsideToast = el('button', 'satie-dt-toast');
    outsideToast.hidden = true;
    outsideToast.addEventListener('click', () => { outsideToast.hidden = true; api.open(); });
    document.body.appendChild(outsideToast);
    // the soundscape strip (spec 015): where you are, its variants, the map; painted once soundscapes load
    const scapeStrip = el('div', 'satie-dt-strip');
    scapeStrip.hidden = true;
    let paintStrip = () => { };
    root.append(tabs, agentSees, scapeStrip, outsideBox, viewStrip, tools, body, askFoot, foot, peek, inspector);
    (opts.mount ?? document.body).appendChild(root);
    if (opts.mount) {
        root.classList.add('satie-dt-embedded');
        hideBtn.hidden = true;
    }
    // the edit panel's one mount point: a sibling of the mixer, so its window can sit over the game
    const editSlot = el('div', 'satie-dt-editslot');
    let editOpen = false, mixScroll = 0;
    function openEdit(target) {
        const panel = opts.editPanel;
        if (!panel)
            return false;
        if (!editSlot.isConnected)
            document.body.appendChild(editSlot);
        const wasOpen = editOpen;
        editOpen = true;
        if (!wasOpen)
            restScene(); // silent under the map, the same rest as everywhere else in the mix (2026-11-13)
        record('open_edit', { ...target });
        setTimeout(() => paintStrip(), 0);
        // one window (2026-11-12): the mixer's column becomes the mix's sidebar, under the mix's bar; closing
        // puts everything back as it was (the list where you left it)
        const inside = corner === 'right' && root.dataset.collapsed !== '1';
        if (inside && root.dataset.inmix !== '1') {
            mixScroll = body.scrollTop;
            root.dataset.inmix = '1';
        }
        panel.open(target, {
            engine, mount: editSlot, layer: layer ?? undefined,
            side: inside ? root.offsetWidth : 0,
            ...(inside && authoring ? { barTools: undoBox } : {}),
            script: () => script,
            apply: (next, note) => applyScript(next, note, { kind: 'edit_panel', detail: { ...target } }),
            closed: () => {
                editOpen = false;
                void editHear(null);
                paintMixSide(null);
                paintStrip();
                unduckScene();
                if (root.dataset.inmix === '1') {
                    root.dataset.inmix = '0';
                    if (authoring && undoBox.parentElement !== bar)
                        bar.insertBefore(undoBox, playBtn);
                    requestAnimationFrame(() => { body.scrollTop = mixScroll; });
                }
            },
            onLevel: l => paintMixSide(l),
            onHover: sid => { for (const [k, r] of sideRows)
                r.classList.toggle('hot', k === sid); },
            soundscapes: () => api.soundscapes(),
            near: editNear,
            search: editSearch,
            addSketch: sk => sendSketch(sk),
            intent: i => setIntent(i),
            playLevel: () => { if (!mixPlay)
                mixSide.querySelector('.tr2 .pp')?.click(); },
            pickOffer: id => chooseOffered(id),
            sounds: editSounds,
            hear: editHear,
            setTake: editSetTake,
            removeTake: editRemoveTake,
            askFork: (what) => askToFork(what),
            warm: (url) => { void bufferFor(url).catch(() => { }); },
            hearing: () => (editHeard ? { at: Math.max(0, engine.audioContext.currentTime - editHeard.start), dur: editHeard.dur } : null),
        });
        return true;
    }
    /** The thing each part belongs to (the train for its horn, engine and wheels), from the game's objects. */
    let wholeCache = null;
    function wholeMap() {
        const hs = layer?.hosts?.() ?? [];
        if (!wholeCache || wholeCache.n !== hs.length)
            wholeCache = { n: hs.length, m: partsOf(hs) };
        return wholeCache.m;
    }
    /** The edit panel's read of the scene: the mixer's own grouping and names, so the two never disagree. */
    function editSounds() {
        const stmts = engine.scriptStatements;
        const listenerHost = layer?.listenerHost?.() ?? null;
        const hostIds = [...new Set([...(layer?.hosts?.().map(h => h.id) ?? []), ...stmts.map(st => st.hostRef).filter((h) => !!h)])];
        const families = hostClassesOf(hostIds, new Set(listenerHost ? [listenerHost] : []));
        const parts = wholeMap();
        const ctx = { families, listenerHost, withOf: (ev) => layer?.eventInfo?.(ev)?.with, byOf: (ev) => layer?.eventInfo?.(ev)?.by, kinds: new Set(families.keys()), wholeOf: (h) => parts.get(h) };
        const heard = hearNow(), out = [], groups = mixGroupsNow(), idxOf = new Map();
        // (2026-11-13) a group of one sound on each of several objects, all one recording (the crossing's north and south
        // bells), is one entity with copies, as a class is: one dot in the mix, "Railroad bell ×2", not two far apart
        const oneSoundOnMany = new Set(groups.filter(gr => {
            const ss = gr.sourceIds.map(id => stmts.find(x => x.sourceId === id));
            if (ss.length < 2 || ss.some(x => !x?.hostRef))
                return false;
            return new Set(ss.map(x => x.hostRef)).size === ss.length && new Set(ss.map(x => audioKey(x))).size === 1;
        }).map(gr => gr.id));
        stmts.forEach((st, i) => {
            if (!st.sourceId)
                return;
            // the mix's entity is the game's object (or its class: car_0 … car_61 are one Car); an authored group ("Car
            // engines", "Tires and skids") is not an entity, it says the sound's role inside it (2026-11-13: one car came
            // apart into four groups). A group whose sounds sit on no shared object stays the thing it gathers.
            const grp = groups.find(gr => gr.sourceIds.includes(st.sourceId));
            const own = objectKeyFor(st, ctx);
            const key = grp && (own === 'scene' || own === 'listener' || (own.startsWith('host:') && oneSoundOnMany.has(grp.id))) ? `group:${grp.id}` : own;
            const raw = key === 'listener' ? 'you' : key.startsWith('family:') ? key.slice(7) : st.entityId ?? (key.startsWith('host:') ? key.slice(5) : null) ?? st.hostRef ?? 'scene';
            const label = key.startsWith('group:') && grp ? grp.label.toLowerCase() : key === 'listener' || raw === listenerHost ? 'you' : key.startsWith('family:') || st.entityId ? raw.replace(/_/g, ' ') : st.hostRef || key.startsWith('host:') ? hostName(raw) : 'the scene';
            const n = st.isGenerated ? Math.max(1, st.variants) : 1;
            const takes = Array.from({ length: n }, (_, k) => { const tk = takeKeyAt(st, k), e = manifest[tk]; return { key: tk, name: String(e?.name ?? (n > 1 ? `${nameOf(st)} ${k + 1}` : nameOf(st))), url: e?.url ?? null, sampleId: e?.sampleId ?? null }; });
            const h = heard.get(i);
            // where it is now: its playing voice, else the thing it is on, else its own spot; nowhere when it is all around
            const tv = engine.getTrackViews().find(v => v.statementIndex === i);
            const hp = st.hostRef ? engine.hostPositionOf?.(st.hostRef) : undefined;
            const around = soundKind(st) === 'around';
            const at = around ? null : tv ? [tv.position.x, tv.position.z] : hp ? [hp.x, hp.z] : st.hasPlacement ? [(st.areaMin.x + st.areaMax.x) / 2, (st.areaMin.z + st.areaMax.z) / 2] : null;
            idxOf.set(out.length, i);
            out.push({ at, sourceId: st.sourceId, name: nameOf(st), thing: { key, label }, where: soundKind(st), event: st.kind === 'trigger' ? st.eventName : null, words: st.genPrompt, takes, heardDb: h && Number.isFinite(h.receivedDb) ? h.receivedDb : null, how: howOften(st), muted: isMuted(i), crest: crestOf(takes[0]?.key), ...(st.hostRef && wholeMap().has(st.hostRef) ? { part: hostName(st.hostRef) } : grp && !key.startsWith('group:') ? { part: grp.label.toLowerCase() } : {}) });
        });
        // a class of things (62 cars, each with its own copy of the same four sounds) is ONE thing to the mix (2026-11-13):
        // its sounds once, each standing for all its copies (`copies`), the class saying how many there are (`count`)
        const merged = [], byClass = new Map();
        // (a family of hosts, or a group that gathers one sound from each of many objects: "Car engines" on 62 cars)
        const leadHost = new Map(), seenOn = new Map();
        out.forEach((s, j) => {
            const st = stmts[idxOf.get(j)];
            // copies are instances (a family of hosts, or an authored group across objects); the parts of one thing (the train's
            // front and rear wheels) are not two trains
            if (!st || !(s.thing.key.startsWith('family:') || s.thing.key.startsWith('group:'))) {
                merged.push(s);
                return;
            }
            // the nth statement of this sound on its object pairs with the nth on every other object (front and rear tyres stay two)
            const host = st.hostRef ?? `#${j}`, k0 = `${s.thing.key}|${audioKey(st)}|${st.kind}|${st.eventName ?? ''}`, nth = (seenOn.get(`${k0}|${host}`) ?? 0);
            seenOn.set(`${k0}|${host}`, nth + 1);
            const k = `${k0}#${nth}`, lead = byClass.get(k);
            if (!lead) {
                byClass.set(k, s);
                leadHost.set(s, new Set([host]));
                s.copies = [s.sourceId];
                const fam = s.thing.key.startsWith('family:') ? families.get(s.thing.key.slice(7)) : undefined;
                if (fam)
                    s.thing = { ...s.thing, count: fam.length };
                merged.push(s);
                return;
            }
            leadHost.get(lead).add(host);
            lead.copies.push(s.sourceId);
            if (s.heardDb !== null && (lead.heardDb === null || s.heardDb > lead.heardDb))
                lead.heardDb = s.heardDb;
            lead.muted = !!lead.muted && !!s.muted;
        });
        // a sound with no copies is itself; a thing whose sounds have copies counts its objects (62 cars)
        const hostsOf = new Map();
        for (const s of merged) {
            if ((s.copies?.length ?? 1) < 2) {
                delete s.copies;
                continue;
            }
            const set = hostsOf.get(s.thing.key) ?? new Set();
            for (const id of s.copies) {
                const h = stmts.find(x => x.sourceId === id)?.hostRef;
                if (h)
                    set.add(h);
            }
            hostsOf.set(s.thing.key, set);
        }
        for (const s of merged) {
            const n = hostsOf.get(s.thing.key)?.size ?? 0;
            if (n > 1 && !s.thing.count)
                s.thing = { ...s.thing, count: n };
        }
        return merged;
    }
    /**
     * The chat shows what it talks about (2026-11-13): one sound opens the mix at that sound, sounds of one entity at the
     * entity, anything wider at their soundscape; an open mix moves there instead of reopening, and what changed ripples.
     * A plain answer (no sounds) leaves the view alone.
     */
    function followInMix(ids, changed) {
        const panel = opts.editPanel;
        if (!panel)
            return;
        const live = ids.filter(id => engine.scriptStatements.some(st => st.sourceId === id));
        if (!live.length)
            return;
        const sounds = editSounds(), of = (id) => sounds.find(x => x.sourceId === id || x.copies?.includes(id));
        const reps = [...new Set(live.map(id => of(id)).filter((x) => !!x))];
        let target;
        if (reps.length === 1)
            target = { sound: reps[0].sourceId };
        else if (reps.length && reps.every(x => x.thing.key === reps[0].thing.key) && reps[0].thing.label !== 'the scene')
            target = { sound: reps[0].sourceId, thing: true };
        else {
            const sc = api.soundscapes()?.variants.soundscapes().find(d => live.some(id => d.sourceIds.includes(id)));
            target = sc ? { soundscape: sc.id } : { sound: live[0] };
        }
        if (editOpen && panel.go)
            panel.go(target);
        else
            openEdit(target);
        const ripple = changed.length ? changed : [];
        setTimeout(() => { for (const id of ripple)
            panel.pulse?.(of(id)?.sourceId ?? id); }, 400);
    }
    /** The soundscape an add goes in: the one the chat is in (its chip), else the one most of its sounds are in, else where you stand. */
    function scapeForAdd(parts) {
        const acc = api.soundscapes();
        if (!acc)
            return null;
        const defs = acc.variants.soundscapes(), ids = scopeSourceIds(parts);
        if (ids.length) {
            const best = defs.map(d => ({ d, n: d.sourceIds.filter(x => ids.includes(x)).length })).sort((a, b) => b.n - a.n)[0];
            if (best?.n)
                return best.d.id;
        }
        return acc.current() ?? defs[0]?.id ?? null;
    }
    /** A new sound under discussion: the mix opens (or moves) to the soundscape it goes in, where its choices will show. */
    function openScapeForAdd(parts) {
        const panel = opts.editPanel;
        if (!panel)
            return;
        const id = scapeForAdd(parts);
        if (!id)
            return;
        if (editOpen && panel.go)
            panel.go({ soundscape: id });
        else
            openEdit({ soundscape: id });
    }
    /** A sketch from the mix goes to SATIE as your words: it writes it into the soundscape (one change you can undo). */
    function sendSketch(sk) {
        const host = sk.thing?.key.startsWith('host:') ? sk.thing.key.slice(5) : sk.thing?.key.startsWith('family:') ? `every ${sk.thing.key.slice(7)}` : null;
        const how = sk.move === 'over' ? `passes overhead now and then (about every ${sk.every ?? 60} s), moving across the sky` : sk.move === 'around' ? 'is all around, from no one spot (a bed)' : sk.thing ? `plays from the ${sk.thing.label.toLowerCase()}${host ? ` (at ${host})` : ''}` : 'stays in one place';
        const made = sk.parts.map(p => `${p.name}: the library recording "${p.rec.name}"${p.rec.sampleId ? ` (${p.rec.sampleId})` : ''}`).join('; ');
        const msg = `Add to ${sk.scape}: ${sk.words}, made of ${sk.parts.length === 1 ? 'one sound' : `${sk.parts.length} sounds played together`} (${made}). It ${how}. Use these library recordings as they are; nothing new to make.`;
        record('mix_sketch', { words: sk.words, scape: sk.scape, parts: sk.parts.map(p => ({ name: p.name, sampleId: p.rec.sampleId ?? null })), move: sk.move, every: sk.every ?? null });
        void sendChat(msg, false, `add ${sk.words}: ${sk.parts.map(p => p.rec.name).join(' + ')}, ${sk.move === 'over' ? 'passes over' : sk.move === 'around' ? 'all around' : sk.thing ? `from the ${sk.thing.label.toLowerCase()}` : 'in place'}`);
    }
    /** The statements a mix sound stands for: itself, or every copy of it across a class's instances. */
    const copiesOf = (s) => (s.copies ?? [s.sourceId]).map(id => engine.scriptStatements.findIndex(st => st.sourceId === id)).filter(i => i >= 0);
    /** Delete several sounds in one change (every copy of a class's sound), bottom up so the earlier blocks keep their lines. */
    function deleteVoices(idx) {
        if (idx.length === 1) {
            deleteVoice(idx[0]);
            return;
        }
        blockMap = mapStatements(script, engine.scriptStatements);
        const blocks = idx.map(i => blockMap?.get(i)).filter((b) => !!b).sort((a, b) => b.start - a.start);
        if (!blocks.length)
            return;
        let lines = script.split('\n');
        for (const b of blocks)
            lines = [...lines.slice(0, b.start), ...lines.slice(b.end)];
        const st = engine.scriptStatements[idx[0]], name = st ? nameOf(st) : 'sounds';
        if (applyScript(lines.join('\n').replace(/\n{3,}/g, '\n\n'), `deleted ${name.slice(0, 40)} ×${blocks.length}`, { kind: 'delete_voice', detail: { voices: idx.map(voiceContext) } }))
            say(`deleted ${name.slice(0, 40)} on all ${blocks.length} · undo (⌘Z) brings them back`);
    }
    let editHeard = null, editHearToken = 0;
    /**
     * The game's own sound while the mix is open (2026-11-13): under it, 30 dB down, so a passing train or a bell
     * does not drown what you are working on; silent while you hear or play something here; back as it was on close.
     */
    // (2026-11-13) silent, not 30 dB down: under the map you judge sounds alone; "hear it in the game" (gameUp) brings it back
    function restScene() { if (editOpen && !mixPlay && !gameUp)
        silenceScene();
    else if (!mixPlay)
        unduckScene(); }
    let gameUp = false;
    /** A take's crest factor (peak over RMS) as 0..1: about 6 dB for a steady loop, 24 dB and more for a strike. Cached by take. */
    const crestCache = new Map();
    function crestOf(key) {
        if (!key)
            return undefined;
        const c = crestCache.get(key);
        if (c !== undefined)
            return c;
        const b = engine.getAudioBuffers().get(key);
        if (!b)
            return undefined;
        const d = b.getChannelData(0), step = Math.max(1, Math.floor(d.length / 48000));
        let peak = 0, sum = 0, n = 0;
        for (let i = 0; i < d.length; i += step) {
            const v = Math.abs(d[i]);
            if (v > peak)
                peak = v;
            sum += v * v;
            n++;
        }
        const rms = Math.sqrt(sum / Math.max(1, n)), db = rms > 1e-6 ? 20 * Math.log10(peak / rms) : 0, out = Math.max(0, Math.min(1, (db - 6) / 18));
        crestCache.set(key, out);
        return out;
    }
    /** How often a sound plays, in words, from its statement. */
    function howOften(st) {
        if (st.kind === 'trigger')
            return `only when “${String(st.eventName ?? 'it').replace(/_/g, ' ')}” happens in the game`;
        if (st.kind === 'loop')
            return 'always, on a loop';
        const e = st.every;
        if (!e || e.isNull)
            return 'now and then';
        const f = (x) => (x >= 60 ? `${Math.round(x / 6) / 10} min` : `${Math.round(x)} s`);
        return e.isRange && Math.abs(e.max - e.min) > 0.5 ? `every ${f(e.min)}–${f(e.max)}` : `every ${f(e.min)}`;
    }
    // ── the mix's side panel (2026-11-12): while the mix is open, the column shows what the mix has open ──
    const mixSide = el('div', 'satie-dt-mixside');
    mixSide.hidden = true;
    let mixLen = 20, lastLevel = null;
    /** The find open in the sidebar, for one sound: what should change, and the find's state. */
    let sideFind = null;
    /** The recordings and sounds listened to on the map lately, newest first (spec 018: the map tells SATIE). */
    let mapHeard = [];
    const scapeFold = new Set();
    /** The sidebar's take rows (to tag the one in this play) and sound rows (to light from the map), by sound. */
    const takeRows = new Map(), sideRows = new Map();
    /** A soundscape's sounds, and any its variants add (a copy of one at another object). */
    function scapeSids(id) {
        const v = api.soundscapes()?.variants, d = v?.soundscapes().find(x => x.id === id);
        return new Set([...(d?.sourceIds ?? []), ...(v?.variants(id) ?? []).flatMap(x => x.moves.flatMap(m => (m.op === 'add' ? [m.sound] : [])))]);
    }
    let mixSig = '';
    root.insertBefore(mixSide, askFoot);
    // ── playing a soundscape, an entity or a sound by its rules, and its lanes (the original Workshop's mixer) ──
    // Every sound at once, as the game would: a loop all along, a sound on a timer at its timer, a game event now and
    // then (as if the game fired it), each time one of its takes at random. Lanes run left to right with a playhead.
    const LANE_S = 20;
    let mixPlay = null;
    /** Live, when nothing is being played here: what the game played, written at a playhead that sweeps every 20 s. */
    const laneLog = new Map(); // sourceId → [time, 1 sounding | 2 heard]
    const sweepT0 = performance.now();
    const lanes = new Map();
    let laneTimer, mixStatus = null, mixAxis = [];
    /** Each take its own shade of rose (rose is yours; gold is only a suggestion), far enough apart to tell which one played. */
    const TAKE_COLORS = ['#ff8da1', '#e8628a', '#ffc2cf', '#d98ae0', '#ff73b0', '#b994f0', '#f5a8bd', '#c95f86'];
    const takeHue = (k) => TAKE_COLORS[k % TAKE_COLORS.length];
    /** What the lanes show when nothing is playing: the plan the next play will follow (the Workshop's "next play"). */
    let shownPlan = null;
    const splOf = (st) => (st.spl.isNull ? 66 : (st.spl.min + st.spl.max) / 2);
    /** The take a sound played last (so the next is another one, as the game's random pick never repeats). */
    const lastTake = new Map();
    const nextTake = (sid, n) => { const was = lastTake.get(sid) ?? -1; let k = Math.floor(Math.random() * n); if (n > 1 && k === was)
        k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n; lastTake.set(sid, k); return k; };
    function planFor(sids, len, loopsToo) {
        const stmts = engine.scriptStatements, bufs = engine.getAudioBuffers(), evs = [];
        for (const sid of sids) {
            const i = stmts.findIndex(st => st.sourceId === sid), st = stmts[i];
            if (!st || isMuted(i))
                continue;
            const n = st.isGenerated ? Math.max(1, st.variants) : 1, durOf = (k) => bufs.get(takeKeyAt(st, k))?.duration ?? 1;
            let last = -1;
            const pick = () => { let k = Math.floor(Math.random() * n); if (n > 1 && k === last)
                k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n; last = k; return k; };
            if (st.kind === 'loop') {
                if (loopsToo)
                    evs.push({ sid, k: pick(), t: 0, dur: len });
                continue;
            }
            // a game event is not on a clock: it plays when the game (or you, with ▶) fires it, never on an invented timeline
            if (st.kind === 'trigger')
                continue;
            const e = st.every, timed = !!e && !e.isNull;
            const lo = timed ? e.min : 6, hi = timed ? (e.isRange ? e.max : e.min) : 14;
            let t = 0.3 + Math.random() * Math.min(lo, 2.5);
            while (t < len - 0.2) {
                const k = pick();
                evs.push({ sid, k, t, dur: durOf(k) });
                t += Math.max(durOf(k) * 0.7, lo + Math.random() * (hi - lo));
            }
        }
        // its game events, as if someone used it (2026-11-13): each one in turn, in the order the script gives them (sit,
        // then stand; buy, and the can follows by its `after`), a breath between, again until the end
        const followersOf = (ev) => stmts.filter((x, i) => x.kind === 'trigger' && !!x.sourceId && sids.includes(x.sourceId) && !isMuted(i) && x.eventName && layer?.eventInfo?.(x.eventName)?.after?.event === ev);
        const leads = sids.map(sid => stmts.findIndex(x => x.sourceId === sid)).filter(i => i >= 0 && !isMuted(i)).map(i => stmts[i])
            .filter(st => st.kind === 'trigger' && !(st.eventName && (() => { const a = layer?.eventInfo?.(st.eventName)?.after; return !!a && stmts.some(x => x.eventName === a.event && !!x.sourceId && sids.includes(x.sourceId)); })()));
        // a thing that moves and keeps sounding (the train: its engine and rolling all along) has events that come from
        // running, not from being used (2026-11-13): a short one (a rail joint's clack) ticks in the running's rhythm, the
        // parts that share it one after the other (front bogie, then rear); a long one (the horn) comes once, early
        const stOf = (sid) => stmts.find(x => x.sourceId === sid);
        const moving = sids.some(sid => { const h = stOf(sid)?.hostRef; return !!h && layer?.hostMotion?.(h) === 'moves'; }) && sids.some(sid => stOf(sid)?.kind === 'loop');
        let rest = leads;
        if (moving && leads.length) {
            rest = [];
            const beat = 1.1 + Math.random() * 0.5, ticks = new Map();
            for (const st of leads) {
                const sid = st.sourceId, n = st.isGenerated ? Math.max(1, st.variants) : 1, sounding = envOf(sid, 0)?.end ?? bufs.get(takeKeyAt(st, 0))?.duration ?? 1;
                // one the thing's parts share (the front and rear bogies' joint), or a bare click: the rhythm; a horn, however
                // short its take, is a single blast
                const shared = !!st.eventName && leads.some(x => x !== st && x.eventName === st.eventName);
                if (shared || sounding <= 0.6) {
                    const key = st.eventName ?? sid;
                    ticks.set(key, [...(ticks.get(key) ?? []), st]);
                    continue;
                }
                const k = nextTake(sid, n), t = Math.min(len * 0.3, 1 + Math.random() * 3);
                if (t < len - 0.5)
                    evs.push({ sid, k, t, dur: bufs.get(takeKeyAt(st, k))?.duration ?? 1, use: true, run: true });
            }
            for (const parts of ticks.values())
                parts.forEach((st, j) => {
                    const sid = st.sourceId, n = st.isGenerated ? Math.max(1, st.variants) : 1;
                    for (let t = 0.6 + j * beat * 0.32; t < len - 0.2; t += beat * (0.92 + Math.random() * 0.16)) {
                        const k = nextTake(sid, n);
                        evs.push({ sid, k, t, dur: bufs.get(takeKeyAt(st, k))?.duration ?? 0.4, use: true, run: true });
                    }
                });
        }
        if (rest.length) {
            let t = 1, guard = 0;
            while (t < len - 0.5 && guard++ < 60)
                for (const st of rest) {
                    if (t >= len - 0.5)
                        break;
                    const n = st.isGenerated ? Math.max(1, st.variants) : 1, k = nextTake(st.sourceId, n), dur = bufs.get(takeKeyAt(st, k))?.duration ?? 1;
                    evs.push({ sid: st.sourceId, k, t, dur, use: true });
                    let span = dur;
                    for (const f of st.eventName ? followersOf(st.eventName) : []) {
                        const a = layer.eventInfo(f.eventName).after, d = Array.isArray(a.seconds) ? a.seconds[0] : a.seconds;
                        const nf = f.isGenerated ? Math.max(1, f.variants) : 1, kf = nextTake(f.sourceId, nf), df = bufs.get(takeKeyAt(f, kf))?.duration ?? 1;
                        if (t + d < len)
                            evs.push({ sid: f.sourceId, k: kf, t: t + d, dur: df, use: true });
                        span = Math.max(span, d + df);
                    }
                    t += Math.max(3.5, Math.min(span, 6) + 1.6);
                }
        }
        return evs.sort((x, y) => x.t - y.t);
    }
    let fireRest;
    /**
     * Fire a game event's sound here, as the game would (2026-11-13): one of its takes at random, then whatever comes
     * after it (the contract's `after`: the can drops 1.45 s after the purchase) at its delay. During a play it lands on
     * the lanes where the playhead is; the map ripples as each one sounds.
     */
    function fireHere(sid, btn) {
        if (btn && btn === sideBtn && btn.dataset.state !== 'idle') {
            for (const x of fireSrcs) {
                try {
                    x.stop();
                }
                catch { /* ended */ }
            }
            fireSrcs = [];
            sideStop();
            restScene();
            return;
        }
        sideStop();
        for (const x of fireSrcs) {
            try {
                x.stop();
            }
            catch { /* ended */ }
        }
        fireSrcs = [];
        const stmts = engine.scriptStatements, bufs = engine.getAudioBuffers(), ac = engine.audioContext;
        if (ac.state === 'suspended')
            void ac.resume();
        const st0 = stmts.find(x => x.sourceId === sid);
        if (!st0)
            return;
        const chain = [{ st: st0, delay: 0 }];
        if (st0.eventName)
            stmts.forEach((st, i) => {
                const a = st.kind === 'trigger' && st.eventName ? layer?.eventInfo?.(st.eventName)?.after : undefined;
                if (a && a.event === st0.eventName && st.sourceId && !isMuted(i))
                    chain.push({ st, delay: Array.isArray(a.seconds) ? a.seconds[0] + Math.random() * (a.seconds[1] - a.seconds[0]) : a.seconds });
            });
        void editHear(null);
        stopPreview();
        if (editOpen)
            silenceScene();
        const top = Math.max(...chain.map(c => splOf(c.st)), 40);
        let end = 0;
        for (const { st, delay } of chain) {
            const n = st.isGenerated ? Math.max(1, st.variants) : 1, k = nextTake(st.sourceId, n), buf = bufs.get(takeKeyAt(st, k));
            if (!buf)
                continue;
            const src = ac.createBufferSource();
            src.buffer = buf;
            const g = ac.createGain();
            g.gain.value = 0.85 * Math.max(0.05, Math.pow(10, (splOf(st) - top) / 20));
            src.connect(g);
            g.connect(ac.destination);
            src.start(ac.currentTime + delay);
            fireSrcs.push(src);
            end = Math.max(end, delay + Math.min(buf.duration, 8));
            const sidK = st.sourceId;
            setTimeout(() => {
                opts.editPanel?.pulse?.(sidK, k);
                const p = mixPlay;
                if (p && !p.game)
                    p.evs.push({ sid: sidK, k, t: Math.max(0, (performance.now() - p.t0) / 1000), dur: buf.duration, fired: true });
                firedAt.set(sidK, { k, at: performance.now(), dur: buf.duration });
            }, delay * 1000);
        }
        record('mix_fire', { sound: sid, chain: chain.length });
        if (btn) {
            sideBtn = btn;
            sideKey = btn.dataset.key ?? null;
            btnState(btn, 'playing');
        }
        const key = sideKey;
        clearTimeout(fireRest);
        fireRest = setTimeout(() => { fireSrcs = []; if (btn && key === sideKey)
            sideStop(); restScene(); }, end * 1000 + 200);
    }
    /** When each game event last fired here, for its row and the take tag. */
    const firedAt = new Map();
    function startMixPlay(sids, len) {
        stopMixPlay();
        void editHear(null);
        stopPreview();
        const ac = engine.audioContext;
        if (ac.state === 'suspended')
            void ac.resume();
        silenceScene();
        const bus = ac.createGain();
        bus.gain.value = 0.85;
        bus.connect(ac.destination);
        const stmts = engine.scriptStatements, bufs = engine.getAudioBuffers();
        const set = sids.map(sid => stmts.find(st => st.sourceId === sid)).filter((st) => !!st);
        const top = Math.max(...set.map(splOf), 40);
        const gainOf = (sid) => { const st = stmts.find(x => x.sourceId === sid); return st ? Math.max(0.04, Math.pow(10, (splOf(st) - top) / 20)) : 0.5; };
        const L = Number.isFinite(len) ? len : LANE_S;
        const play = { sids, t0: 0, len: L, endless: !Number.isFinite(len), evs: [], srcs: [], loops: [], bus, pulses: [], gates: new Map() };
        const voice = (ev, at, loop) => {
            const st = stmts.find(x => x.sourceId === ev.sid);
            const buf = st ? bufs.get(takeKeyAt(st, ev.k)) : undefined;
            if (!buf)
                return null;
            const src = ac.createBufferSource();
            src.buffer = buf;
            src.loop = loop;
            let gate = play.gates.get(ev.sid);
            if (!gate) {
                gate = ac.createGain();
                gate.connect(bus);
                play.gates.set(ev.sid, gate);
            }
            const g = ac.createGain();
            g.gain.value = gainOf(ev.sid);
            src.connect(g);
            g.connect(gate);
            src.start(at, loop ? Math.random() * buf.duration : 0);
            return src;
        };
        const cycle = (at, first) => {
            if (mixPlay !== play)
                return;
            // the first pass plays exactly the plan the lanes showed; an endless play plans each next pass fresh
            const evs = first && shownPlan && shownPlan.len === L && shownPlan.evs.every(e => sids.includes(e.sid)) ? shownPlan.evs.map(e => ({ ...e })) : planFor(sids, L, true);
            for (const ev of evs) {
                const loop = stmts.find(x => x.sourceId === ev.sid)?.kind === 'loop';
                if (loop) {
                    if (first) {
                        const v = voice(ev, at, true);
                        if (v)
                            play.loops.push(v);
                    }
                    else {
                        const was = play.evs.find(x => x.sid === ev.sid && x.dur >= L);
                        if (was)
                            ev.k = was.k;
                    }
                    continue;
                }
                const v = voice(ev, at + ev.t, false);
                if (v)
                    play.srcs.push(v);
                // the map answers as it plays: a ripple on the sound, its take ring lit
                play.pulses.push(setTimeout(() => { if (mixPlay === play)
                    opts.editPanel?.pulse?.(ev.sid, ev.k); }, Math.max(0, (at + ev.t - ac.currentTime) * 1000)));
            }
            // the playhead is where you hear it: the audio's own start, plus the time it takes to leave the speakers
            const late = (ac.outputLatency || ac.baseLatency || 0) * 1000;
            play.evs = evs;
            play.t0 = performance.now() + (at - ac.currentTime) * 1000 + late;
            play.timer = setTimeout(() => (play.endless ? cycle(at + L, false) : stopMixPlay()), Math.max(0, (at + L - ac.currentTime) * 1000 - (play.endless ? 150 : -120)));
        };
        mixPlay = play;
        cycle(ac.currentTime + 0.08, true);
        gatePlay();
        laneFrames();
        record('mix_play', { sounds: sids.length, seconds: Number.isFinite(len) ? len : null });
        laneTick();
    }
    /**
     * M and S while a play runs (2026-11-13): the play is its own bus, not the game's voices, so the mixer's mute and solo
     * reach it here: a muted sound, or one outside the soloed ones, is faded out of the play and back in when undone.
     */
    function gatePlay() {
        const p = mixPlay;
        if (!p?.gates)
            return;
        const stmts = engine.scriptStatements, idx = (sid) => stmts.findIndex(x => x.sourceId === sid);
        const soloed = p.sids.filter(sid => engine.soloedIndices.has(idx(sid)));
        const open = (sid) => !isMuted(idx(sid)) && (!soloed.length || soloed.includes(sid));
        const sig = p.sids.map(sid => (open(sid) ? 1 : 0)).join('');
        if (sig === p.gateSig)
            return;
        p.gateSig = sig;
        const now = engine.audioContext.currentTime;
        for (const [sid, g] of p.gates)
            g.gain.setTargetAtTime(open(sid) ? 1 : 0, now, 0.04);
    }
    /**
     * The scene's rest survives a script load (2026-11-13): `loadScript` clears every preview trim (they name the old
     * script's statements), and the mix loads scripts for a variant, a mute, an edit. The mixer still thought the scene
     * silent, so the game came back loud under the map until the next hover. When the engine no longer holds what was set,
     * set it again (silent under a play, the rest otherwise).
     */
    function keepRest() {
        if (!editOpen || !ducked.length)
            return;
        const lost = ducked.some(i => i >= engine.scriptStatements.length || Math.abs(engine.statementPreviewDb(i) - Math.max(-120, (duckDb.get(i) ?? 0) + (dragDb.get(i) ?? 0))) > 1);
        if (!lost)
            return;
        ducked = [];
        duckDb.clear();
        if (mixPlay)
            silenceScene();
        else
            restScene();
    }
    function stopMixPlay() {
        const p = mixPlay;
        if (!p)
            return;
        mixPlay = null;
        clearTimeout(p.timer);
        for (const t of p.pulses)
            clearTimeout(t);
        const ac = engine.audioContext, now = ac.currentTime;
        p.bus.gain.setTargetAtTime(0, now, 0.05);
        for (const x of [...p.srcs, ...p.loops, ...fireSrcs]) {
            try {
                x.stop(now + 0.25);
            }
            catch { /* not started or ended */ }
        }
        fireSrcs = [];
        clearInterval(p.watch);
        setTimeout(() => { try {
            p.bus.disconnect();
        }
        catch { /* gone */ } }, 400);
        if (p.game)
            gameUp = false;
        restScene();
        laneTick();
        mixSig = '';
        if (lastLevel)
            paintMixSide(lastLevel);
    }
    /**
     * A take's envelope for the lanes (2026-11-13): its loudness 20 times a second, so a lane draws the sound where it
     * actually sounds (a 4 s file with a 1 s click is a 1 s mark, not a 4 s bar); `end` is when it falls silent.
     */
    const ENV_HZ = 20;
    const envCache = new Map();
    function envOf(sid, k) {
        const st = engine.scriptStatements.find(x => x.sourceId === sid);
        if (!st)
            return null;
        const key = takeKeyAt(st, k), c = envCache.get(key);
        if (c)
            return c;
        const buf = engine.getAudioBuffers().get(key);
        if (!buf)
            return null;
        const d = buf.getChannelData(0), per = Math.max(1, Math.floor(buf.sampleRate / ENV_HZ)), n = Math.ceil(d.length / per), env = new Float32Array(n);
        let top = 1e-6;
        for (let j = 0; j < n; j++) {
            let pk = 0;
            for (let q = j * per, e = Math.min(d.length, q + per); q < e; q += 4) {
                const a = Math.abs(d[q]);
                if (a > pk)
                    pk = a;
            }
            env[j] = pk;
            if (pk > top)
                top = pk;
        }
        let last = 0;
        for (let j = 0; j < n; j++) {
            env[j] /= top;
            if (env[j] > 0.06)
                last = j;
        }
        const out = { env, end: Math.min(buf.duration, (last + 1) / ENV_HZ) };
        envCache.set(key, out);
        return out;
    }
    /** While a play runs the lanes redraw every frame, so the playhead moves with the sound, not in quarter-second steps. */
    let laneRaf = 0;
    function laneFrames() { cancelAnimationFrame(laneRaf); const step = () => { if (!mixPlay) {
        laneRaf = 0;
        return;
    } laneTick(); laneRaf = requestAnimationFrame(step); }; laneRaf = requestAnimationFrame(step); }
    function laneTick() {
        gatePlay();
        keepRest();
        const now = performance.now(), p = mixPlay, plan = p ?? shownPlan;
        const L = plan?.len ?? LANE_S, at = p ? Math.max(0, Math.min(1, (now - p.t0) / (L * 1000))) : -1;
        if (mixStatus && !mixStatus.dataset.fixed) {
            const sec = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
            const hasEv = lastLevel?.sounds.some(x => !!x.event), onlyEv = !!lastLevel?.sounds.length && lastLevel.sounds.every(x => !!x.event);
            const used = (p ?? shownPlan)?.evs.some(e => e.use);
            const how = (p ?? shownPlan)?.evs.some(e => e.run) ? 'as it runs' : 'as if someone used it';
            mixStatus.textContent = p ? (p.game ? `the game’s own run · ${sec((now - p.t0) / 1000)}` : `${used ? how : 'by its rules'} · ${sec(Math.max(0, at) * L)} / ${p.endless ? '∞' : sec(L)}`) : onlyEv && !used ? 'it plays when the game fires it' : `the next ${L} s${used ? `, ${how}` : ' by its rules'}`;
        }
        for (const ax of mixAxis) {
            ax.style.setProperty('--at', String(Math.max(0, at)));
            ax.dataset.live = p ? '1' : '0';
        }
        for (const [sid, rs] of takeRows) {
            const t = at * L, f = firedAt.get(sid);
            const k = p && !p.game ? p.evs.find(e => e.sid === sid && t >= e.t && t < e.t + Math.max(Math.min(e.dur, envOf(e.sid, e.k)?.end ?? e.dur), 0.3))?.k : f && now - f.at < (envOf(sid, f.k)?.end ?? f.dur) * 1000 ? f.k : undefined;
            rs.forEach((r, j) => { r.dataset.now = k === j ? '1' : '0'; });
        }
        for (const [sid, cs] of lanes)
            for (const c of cs) {
                if (!c.isConnected)
                    continue;
                const w = c.clientWidth, h = c.clientHeight, dpr = devicePixelRatio || 1;
                if (!w)
                    continue;
                if (c.width !== Math.round(w * dpr)) {
                    c.width = Math.round(w * dpr);
                    c.height = Math.round(h * dpr);
                }
                const G = c.getContext('2d');
                G.setTransform(dpr, 0, 0, dpr, 0, 0);
                G.clearRect(0, 0, w, h);
                const trig = c.dataset.trig === '1';
                if (trig) {
                    G.strokeStyle = 'rgba(235,231,223,.22)';
                    G.setLineDash([3, 4]);
                    G.beginPath();
                    G.moveTo(0, h / 2);
                    G.lineTo(w, h / 2);
                    G.stroke();
                    G.setLineDash([]);
                }
                else {
                    G.fillStyle = 'rgba(235,231,223,.05)';
                    G.fillRect(0, 0, w, h);
                }
                if (!plan)
                    continue;
                // when each take will play (and, playing, has played): its own shape, where it actually sounds; faint until the
                // playhead gets there. A loop is a thinner bar all along (it never stops); the game's own run is what it played.
                for (const ev of plan.evs) {
                    if (ev.sid !== sid)
                        continue;
                    const x0 = (ev.t / L) * w, past = at < 0 ? 0.7 : ev.t / L <= at ? 1 : 0.3;
                    G.fillStyle = p?.game ? '#ff8da1' : takeHue(ev.k);
                    if (p?.game || ev.dur >= L - 0.01) {
                        G.globalAlpha = past;
                        const x1 = Math.min(w, ((ev.t + Math.max(ev.dur, 0.12)) / L) * w);
                        G.fillRect(x0, p?.game ? 1 : 2.5, Math.max(2, x1 - x0), p?.game ? h - 2 : h - 5);
                        continue;
                    }
                    const e = envOf(ev.sid, ev.k);
                    if (!e) {
                        G.globalAlpha = past;
                        G.fillRect(x0, 1, Math.max(2, (Math.max(ev.dur, 0.12) / L) * w), h - 2);
                        continue;
                    }
                    const bw = (1 / ENV_HZ / L) * w;
                    for (let j = 0; j < e.env.length && j / ENV_HZ < e.end + 0.05; j++) {
                        const x = x0 + j * bw;
                        if (x > w)
                            break;
                        const a = e.env[j], hh = Math.max(1.5, (h - 2) * Math.min(1, 0.18 + a * 0.95));
                        G.globalAlpha = at < 0 ? 0.7 : (ev.t + j / ENV_HZ) / L <= at ? 1 : 0.3;
                        G.fillRect(x, (h - hh) / 2, Math.max(1, bw + 0.4), hh);
                    }
                }
                G.globalAlpha = 1;
                if (at >= 0) {
                    G.fillStyle = 'rgba(235,231,223,.9)';
                    G.fillRect(Math.round(at * w) - 1, 0, 2, h);
                }
            }
    }
    const laneFor = (sid, cls = 'ln') => { const c = el('canvas', cls); if (engine.scriptStatements.find(x => x.sourceId === sid)?.kind === 'trigger')
        c.dataset.trig = '1'; const cs = lanes.get(sid) ?? []; cs.push(c); lanes.set(sid, cs); return c; };
    let editHeardSid = null;
    /** Hear a sound from the sidebar: one of its takes at random (as the game picks), or the take given. */
    /**
     * The sidebar's play buttons are play and stop (2026-11-13): a spinner while its take loads, ■ while it sounds,
     * back to ▶ (or its number) when it ends or you press it again. One sounds at a time.
     */
    let sideBtn = null, sideKey = null, sideWatch, fireSrcs = [];
    function btnState(b, st) {
        if (b.dataset.idle === undefined)
            b.dataset.idle = b.innerHTML;
        b.dataset.state = st;
        b.innerHTML = st === 'loading' ? ICON.load : st === 'playing' ? ICON.stop : b.dataset.idle;
        b.setAttribute('aria-pressed', String(st !== 'idle'));
    }
    function sideStop() {
        clearInterval(sideWatch);
        sideWatch = undefined;
        if (sideBtn?.isConnected)
            btnState(sideBtn, 'idle');
        sideBtn = null;
        sideKey = null;
    }
    /** After a repaint, the button that is playing is the new one with the same key. */
    function sideRebind() {
        if (!sideKey || !sideBtn)
            return;
        const nb = [...mixSide.querySelectorAll('[data-key]')].find(x => x.dataset.key === sideKey);
        if (!nb || nb === sideBtn)
            return;
        const st = sideBtn.dataset.state;
        sideBtn = nb;
        btnState(nb, st);
    }
    /** Hear a sound from the sidebar: one of its takes at random (as the game picks), or the take given; again to stop. */
    function sideHear(s, k, btn) {
        if (btn && btn === sideBtn && btn.dataset.state !== 'idle') {
            void editHear(null);
            for (const x of fireSrcs) {
                try {
                    x.stop();
                }
                catch { /* ended */ }
            }
            fireSrcs = [];
            sideStop();
            restScene();
            return;
        }
        const kk = k ?? nextTake(s.sourceId, s.takes.length), tk = s.takes[kk];
        if (!tk)
            return;
        if (mixPlay)
            stopMixPlay();
        sideStop();
        if (btn) {
            sideBtn = btn;
            sideKey = btn.dataset.key ?? null;
            btnState(btn, 'loading');
        }
        void editHear({ key: tk.key }).then(ok => {
            if (!btn || btn.dataset.key !== sideKey)
                return;
            if (!ok) {
                sideStop();
                return;
            }
            editHeardSid = s.sourceId;
            opts.editPanel?.pulse?.(s.sourceId, kk);
            if (sideBtn) {
                btnState(sideBtn, 'playing');
                const src = editHeard?.src;
                sideWatch = setInterval(() => { if (!editHeard || editHeard.src !== src)
                    sideStop(); }, 150);
            }
        });
    }
    // ── advanced, folded (2026-11-13): how a sound answers the game, its gates in words, and its script ──
    const advOpen = new Set();
    /** A signal's value now, as the engine reads it (NaN while the game has not set it). */
    const signalNow = (name) => { try {
        return engine.signalValue(null, name);
    }
    catch {
        return NaN;
    } };
    const say01 = (x) => (Math.round(x * 100) / 100).toString();
    /**
     * One `… follow …` rule, to hear and shape (2026-11-13): a sentence, the curve on its real scale with the game's value
     * now as a dot; pointing along it loops the sound as it would be there (its pitch or its level), and dragging either
     * end reshapes it, written on release for the sound and every copy of it (one change).
     */
    function followView(prop, f0, s) {
        const f = { ...f0 };
        const box = el('div', 'fol'), sig = f.signal.replace(/_/g, ' ');
        const outSay = (v) => prop === 'pitch' ? `${say01(v)}×` : prop === 'spl' ? fmtLoud(v) : prop === 'pace' ? `${say01(v)}× as often` : prop === 'volume' ? (v <= 0 ? 'silent' : `${Math.round(v * 100)}%`) : say01(v);
        const what = prop === 'pitch' ? 'its pitch' : prop === 'volume' ? 'its level' : prop === 'spl' ? 'its loudness' : prop === 'occlusion' ? 'its muffle' : prop === 'pace' ? 'how often it plays' : prop;
        // (2026-11-13) the x axis is the game's own signal on its real range (the contract's min and max, else the rule's),
        // named with its unit; beyond the rule's two ends the sound holds (drawn flat), so you see where it stops changing
        const info = layer?.signals?.().find(x => x.name === f.signal);
        const unit = info?.unit ? ` (${info.unit})` : '';
        const sayIn = (v) => `${Math.abs(v) >= 100 ? Math.round(v) : say01(v)}${info?.unit ? ` ${info.unit}` : ''}`;
        const sentence = el('div', 'ft2');
        // (2026-11-13) said as what happens: between the two dashed lines it changes, outside them it holds (no "min"/"max")
        const say = () => { sentence.textContent = `as “${sig}” goes from ${sayIn(f.inMin)} to ${sayIn(f.inMax)}, ${what} goes from ${outSay(f.outMin)} to ${outSay(f.outMax)}${f.curve && Math.abs(f.curve - 1) > 0.01 ? ` (on a curve)` : ''}; below and above that it stays`; };
        say();
        box.appendChild(sentence);
        const [yLo, yHi] = prop === 'pitch' ? [0.25, 2.5] : prop === 'spl' ? [0, 120] : prop === 'pace' ? [0.1, 4] : [0, Math.max(1.5, f.outMax, f.outMin)];
        let dLo = Math.min(f.inMin, f.inMax, Number.isFinite(info?.min) ? info.min : Infinity), dHi = Math.max(f.inMin, f.inMax, Number.isFinite(info?.max) ? info.max : -Infinity);
        if (!(dHi > dLo)) {
            dLo -= 0.5;
            dHi += 0.5;
        }
        // (2026-11-14) a level that just switches on (silent at the bottom, full a hair above) is a switch, not a curve to read
        if (prop === 'volume' && f.outMin <= 0.01 && f.outMax >= 0.99 && (f.inMax - f.inMin) <= (dHi - dLo) * 0.08) {
            sentence.textContent = `Heard only while “${sig}” is above ${sayIn(f.inMin)}: silent when it is still, full as soon as it moves.`;
            return box;
        }
        // room round the plot for the axes' words
        const W = 300, H = 150, L = 52, R = 14, T = 16, B = 36, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'fc');
        const mk = (tag, cls) => { const e = document.createElementNS(ns, tag); if (cls)
            e.setAttribute('class', cls); return e; };
        const txt = (cls, anchor = 'middle') => { const t = mk('text', cls); t.setAttribute('text-anchor', anchor); return t; };
        const yOf = (v) => H - B - ((v - yLo) / (yHi - yLo)) * (H - T - B), vOf = (y) => Math.max(yLo, Math.min(yHi, yLo + ((H - B - y) / (H - T - B)) * (yHi - yLo)));
        const xOf = (x) => L + ((x - dLo) / (dHi - dLo)) * (W - L - R), inOf = (px) => Math.max(dLo, Math.min(dHi, dLo + ((px - L) / (W - L - R)) * (dHi - dLo)));
        // the sound at a game value: the rule's curve between its two ends, held beyond them
        const outIn = (x) => { const span = f.inMax - f.inMin; const u = span === 0 ? 0 : Math.max(0, Math.min(1, (x - f.inMin) / span)); return f.outMin + (f.outMax - f.outMin) * Math.pow(u, f.curve ?? 1); };
        const axes = mk('g', 'ax'), grid = mk('g', 'gr'), line = mk('polyline'), probe = mk('line', 'probe');
        const dot = mk('circle', 'live'), dotRing = mk('circle', 'livering'), dotLbl = txt('nowl');
        const ends = [mk('circle', 'end'), mk('circle', 'end')], mid = mk('circle', 'mid');
        dot.setAttribute('r', '7');
        dotRing.setAttribute('r', '12');
        for (const e of ends)
            e.setAttribute('r', '8');
        mid.setAttribute('r', '6');
        const xLbls = [txt('tk'), txt('tk'), txt('tk'), txt('tk')], yLbls = [txt('tk', 'end'), txt('tk', 'end')], xTitle = txt('at'), yTitle = txt('at', 'start');
        svg.append(grid, axes, probe, line, mid, dotRing, dot, ...ends, ...xLbls, ...yLbls, xTitle, yTitle, dotLbl);
        xTitle.setAttribute('x', String((L + W - R) / 2));
        xTitle.setAttribute('y', String(H - 4));
        xTitle.textContent = `${sig}${unit} →  the game sets it`;
        yTitle.setAttribute('x', '2');
        yTitle.setAttribute('y', '10');
        yTitle.textContent = `↑ ${what.replace(/^its /, '')}`;
        if (info?.description) {
            const tt = mk('title');
            tt.textContent = info.description;
            xTitle.appendChild(tt);
        }
        const draw = () => {
            grid.replaceChildren();
            axes.replaceChildren();
            const hl = (x1, y1, x2, y2, cls) => { const l = mk('line', cls); l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1)); l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2)); return l; };
            axes.append(hl(L, H - B, W - R, H - B, 'axl'), hl(L, T, L, H - B, 'axl'));
            // the rule's two ends on the x axis, dashed up to the curve: "from here to here it changes"
            for (const x of [f.inMin, f.inMax])
                grid.appendChild(hl(xOf(x), H - B, xOf(x), yOf(outIn(x)), 'gd'));
            const pts = [];
            for (let j = 0; j <= 96; j++) {
                const x = dLo + (j / 96) * (dHi - dLo);
                pts.push(`${xOf(x).toFixed(1)},${yOf(outIn(x)).toFixed(1)}`);
            }
            line.setAttribute('points', pts.join(' '));
            ends[0].setAttribute('cx', String(xOf(f.inMin)));
            ends[0].setAttribute('cy', String(yOf(f.outMin)));
            ends[1].setAttribute('cx', String(xOf(f.inMax)));
            ends[1].setAttribute('cy', String(yOf(f.outMax)));
            const xm = (f.inMin + f.inMax) / 2;
            mid.setAttribute('cx', String(xOf(xm)));
            mid.setAttribute('cy', String(yOf(outIn(xm))));
            const ticks = [dLo, f.inMin, f.inMax, dHi].filter((v, k, a) => a.findIndex(w => Math.abs(xOf(w) - xOf(v)) < 26) === k);
            xLbls.forEach((t, k) => { const v = ticks[k]; t.style.display = v === undefined ? 'none' : ''; if (v === undefined)
                return; t.setAttribute('x', String(xOf(v))); t.setAttribute('y', String(H - B + 13)); t.textContent = Math.abs(v) >= 100 ? String(Math.round(v)) : say01(v); });
            const ys = [f.outMin, f.outMax];
            yLbls.forEach((t, k) => { t.setAttribute('x', String(L - 5)); t.setAttribute('y', String(yOf(ys[k]) + 3.5)); t.textContent = outSay(ys[k]); t.style.display = k === 1 && Math.abs(yOf(ys[1]) - yOf(ys[0])) < 11 ? 'none' : ''; });
        };
        draw();
        const now = el('div', 'fn');
        // the dot: the game's value now; dragged, a value you try (heard), let go, the game's again
        let trying = null;
        const placeDot = (x, label) => {
            const cx = xOf(x), cy = yOf(outIn(x));
            for (const c of [dot, dotRing]) {
                c.setAttribute('cx', String(cx));
                c.setAttribute('cy', String(cy));
                c.style.display = '';
            }
            dotLbl.setAttribute('x', String(Math.max(L + 30, Math.min(W - R - 30, cx))));
            dotLbl.setAttribute('y', String(Math.max(10, cy - 16)));
            dotLbl.textContent = label;
            dotLbl.style.display = '';
        };
        const tick = () => {
            if (!box.isConnected)
                return;
            if (trying === null) {
                const v = signalNow(f.signal);
                if (Number.isFinite(v)) {
                    placeDot(Math.max(dLo, Math.min(dHi, v)), `now ${sayIn(v)} → ${outSay(outIn(v))}`);
                    now.textContent = 'drag the dot to try another game value and hear it · drag an end or the middle to reshape';
                }
                else {
                    for (const c of [dot, dotRing, dotLbl])
                        c.style.display = 'none';
                    now.textContent = 'point along the line to hear it there · drag an end or the middle to reshape';
                }
            }
            setTimeout(tick, 250);
        };
        box.append(svg, now);
        setTimeout(tick, 0);
        // hearing it along the line: one take, looping, at the pitch or level the curve gives there
        const canHear = !!s && (prop === 'pitch' || prop === 'volume' || prop === 'spl');
        let src = null, gain = null, loading = false, pointing = false, lastX = 0;
        const stopHear = () => { pointing = false; if (src) {
            try {
                src.stop();
            }
            catch { /* ended */ }
            src = null;
            gain = null;
            restScene();
        } probe.style.display = 'none'; };
        const takeBuffer = async () => {
            const st = engine.scriptStatements[copiesOf(s)[0]];
            if (!st)
                return null;
            const key = takeKeyAt(st, 0);
            try {
                return engine.getAudioBuffers().get(key) ?? (manifest[key]?.url ? await bufferFor(manifest[key].url) : null) ?? null;
            }
            catch {
                return null;
            }
        };
        const hearAt = (x) => {
            probe.setAttribute('x1', String(xOf(x)));
            probe.setAttribute('x2', String(xOf(x)));
            probe.setAttribute('y1', String(T));
            probe.setAttribute('y2', String(H - B));
            probe.style.display = 'inline';
            if (!canHear)
                return;
            const ac = engine.audioContext;
            pointing = true;
            lastX = x;
            if (!src) {
                if (loading)
                    return;
                loading = true;
                void takeBuffer().then(buf => {
                    loading = false;
                    if (!buf || !pointing || src)
                        return;
                    if (ac.state === 'suspended')
                        void ac.resume();
                    void editHear(null);
                    if (mixPlay)
                        stopMixPlay();
                    silenceScene();
                    src = ac.createBufferSource();
                    src.buffer = buf;
                    src.loop = true;
                    gain = ac.createGain();
                    gain.gain.value = 0.8;
                    src.connect(gain);
                    gain.connect(ac.destination);
                    src.start();
                    hearAt(lastX);
                });
                return;
            }
            const out = outIn(x), t = ac.currentTime;
            if (prop === 'pitch')
                src.playbackRate.setTargetAtTime(Math.max(0.1, out), t, 0.03);
            else if (prop === 'volume')
                gain.gain.setTargetAtTime(Math.max(0, Math.min(2, out)) * 0.8, t, 0.03);
            else
                gain.gain.setTargetAtTime(0.8 * Math.pow(10, (out - Math.max(f.outMin, f.outMax)) / 20), t, 0.03);
        };
        const local = (e) => { const m = svg.getScreenCTM(); if (!m)
            return [0, 0]; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [q.x, q.y]; };
        let drag = null;
        const near = (x, y, c, r) => c.style.display !== 'none' && Math.hypot(x - Number(c.getAttribute('cx')), y - Number(c.getAttribute('cy'))) < r;
        svg.addEventListener('pointerdown', e => {
            const [x, y] = local(e);
            const hit = near(x, y, ends[0], 16) ? 'a' : near(x, y, ends[1], 16) ? 'b' : near(x, y, mid, 13) ? 'mid' : near(x, y, dot, 16) ? 'dot' : null;
            if (!hit || !s)
                return;
            if (hit !== 'dot' && !authoring) {
                askToFork('reshape how it follows the game');
                return;
            }
            drag = hit;
            svg.setPointerCapture(e.pointerId);
            e.preventDefault();
            svg.dataset.drag = hit;
        });
        svg.addEventListener('pointermove', e => {
            const [x, y] = local(e), gx = inOf(x);
            if (drag === 'dot') {
                trying = gx;
                placeDot(gx, `try ${sayIn(gx)} → ${outSay(outIn(gx))}`);
                hearAt(gx);
                return;
            }
            if (drag === 'a' || drag === 'b') {
                const v = Math.round(vOf(y) * 100) / 100, xin = Math.round(gx * 100) / 100;
                if (drag === 'a') {
                    f.outMin = v;
                    f.inMin = Math.min(xin, f.inMax - (dHi - dLo) * 0.02);
                }
                else {
                    f.outMax = v;
                    f.inMax = Math.max(xin, f.inMin + (dHi - dLo) * 0.02);
                }
                draw();
                say();
                hearAt(drag === 'a' ? f.inMin : f.inMax);
                return;
            }
            if (drag === 'mid') {
                // the middle up or down bends the line: how fast it changes early or late (the rule's `pow`)
                const span = f.outMax - f.outMin, t = span === 0 ? 0.5 : Math.max(0.03, Math.min(0.97, (vOf(y) - f.outMin) / span));
                f.curve = Math.round(Math.max(0.15, Math.min(6, Math.log(t) / Math.log(0.5))) * 100) / 100;
                draw();
                say();
                hearAt((f.inMin + f.inMax) / 2);
                return;
            }
            hearAt(gx);
        });
        svg.addEventListener('pointerleave', () => { if (drag === null)
            stopHear(); });
        svg.addEventListener('pointerup', () => {
            const was = drag;
            if (was === null)
                return;
            drag = null;
            delete svg.dataset.drag;
            stopHear();
            if (was === 'dot') {
                trying = null;
                return;
            }
            if (f.outMin === f0.outMin && f.outMax === f0.outMax && f.inMin === f0.inMin && f.inMax === f0.inMax && (f.curve ?? 1) === (f0.curve ?? 1))
                return;
            // written on every copy (a class's sound is the same rule on each of its objects)
            const value = `follow ${f.signal} ${f.inMin}to${f.inMax} ${f.outMin}to${f.outMax}${f.curve && Math.abs(f.curve - 1) > 0.01 ? ` pow ${f.curve}` : ''}`;
            let next = script;
            const stmts = engine.scriptStatements;
            for (const i of copiesOf(s)) {
                const st = stmts[i];
                if (!st)
                    continue;
                const n2 = upsertVoiceProperty(next, voiceLocatorFor(st, stmts), prop, value);
                if (n2)
                    next = n2;
            }
            if (next !== script && applyScript(next, `${s.name}: ${what} follows ${sig} (${outSay(f.outMin)} to ${outSay(f.outMax)})`, { kind: 'follow_curve', detail: { prop, value, copies: copiesOf(s).length } })) {
                mixSig = '';
                setTimeout(() => paintMixSide(lastLevel), 60);
            }
        });
        if (!canHear)
            now.title = 'this one changes how it plays over time; it is heard in the game';
        return box;
    }
    /** The script lines that gate a sound, said in words (zone, when, within, cooldown, heard_in, quiet, active). */
    function gatesInWords(lines) {
        const out = [];
        for (const raw of lines) {
            const t = raw.trim().split(/\s+/), k = t[0], rest = t.slice(1);
            const sig = (x) => `“${(x ?? '').replace(/_/g, ' ')}”`;
            if (k === 'zone') {
                const strict = rest.includes('strict');
                out.push(`only in the game's ${rest.filter(x => x !== 'strict').map(x => sig(x)).join(' or ')} state${strict ? ', silent outside it' : ''}`);
            }
            else if (k === 'when')
                out.push(`only while ${sig(rest[0])} is ${rest.slice(1).join(' ').replace('to', ' to ')}`);
            else if (k === 'within')
                out.push(`only for game events within ${rest[0]} m of it`);
            else if (k === 'cooldown')
                out.push(`at most once every ${rest[0]} s`);
            else if (k === 'heard_in') {
                const db = Number(rest[rest.length - 1]);
                out.push(`${db < 0 ? 'quieter' : 'louder'} by ${fmtLoudDelta(Math.abs(db)).replace('+', '')} while you are in ${sig(rest[0])}`);
            }
            else if (k === 'quiet')
                out.push(`silent once ${sig(rest[0])} is past ${rest[1] ?? ''}`.trim());
            else if (k === 'active')
                out.push(`only while ${sig(rest[0])} is on`);
        }
        return out;
    }
    /** A block of the script to read and change in place: applied as one change, refused if it does not read. */
    function scriptBox(start, end, note, readOnly = false) {
        const box = el('div', 'sbx'), lines = script.split('\n'), text = lines.slice(start, end).join('\n').replace(/\n+$/, '');
        const ta = el('textarea', 'sta');
        ta.value = text;
        ta.spellcheck = false;
        ta.rows = Math.min(16, text.split('\n').length + 1);
        ta.readOnly = readOnly || !authoring;
        for (const ev of ['keydown', 'keyup', 'keypress'])
            ta.addEventListener(ev, e => e.stopPropagation());
        box.appendChild(ta);
        if (!ta.readOnly) {
            const row = el('div', 'srow'), ok = el('button', 'sap', 'apply'), msg = el('span', 'smsg', '');
            ok.addEventListener('click', () => {
                const cur = script.split('\n');
                if (cur.slice(start, end).join('\n').replace(/\n+$/, '') !== text) {
                    msg.textContent = 'the script changed meanwhile: open it again';
                    return;
                }
                const keepTail = cur.slice(start, end).join('\n').match(/\n+$/)?.[0] ?? '';
                const next = [...cur.slice(0, start), ...(ta.value.replace(/\n+$/, '') + keepTail).split('\n'), ...cur.slice(end)].join('\n');
                if (next === script) {
                    msg.textContent = 'nothing changed';
                    return;
                }
                if (applyScript(next, note, { kind: 'script_edit', detail: { via: 'mix' } })) {
                    msg.textContent = 'applied · undo brings it back';
                    mixSig = '';
                    setTimeout(() => paintMixSide(lastLevel), 50);
                }
                else
                    msg.textContent = 'that does not read as SATIE: nothing changed';
            });
            row.append(ok, msg);
            box.appendChild(row);
        }
        return box;
    }
    function advanced(key, title, fill) {
        const d = el('details', 'adv');
        d.open = advOpen.has(key);
        const sum = el('summary', undefined, title), body = el('div', 'advb');
        d.append(sum, body);
        d.addEventListener('toggle', () => { if (d.open) {
            advOpen.add(key);
            if (!d.dataset.filled) {
                d.dataset.filled = '1';
                fill(body);
            }
        }
        else
            advOpen.delete(key); });
        if (d.open) {
            d.dataset.filled = '1';
            fill(body);
        }
        return d;
    }
    const mixBlockOf = (i) => { blockMap = mapStatements(script, engine.scriptStatements); return blockMap?.get(i) ?? null; };
    /** The statements a property set in the mix lands on: a class's sound, every copy of it (2026-11-13). */
    const propCopies = new Map();
    /** The families of settings the mix shows for one sound, in the order you think about a sound (2026-11-13). */
    const MIX_FAMILIES = [
        { key: 'loud', title: 'how loud, what pitch', why: 'its loudness at 1 m, its level in the mix, its pitch (a range picks a new one each play)', props: ['spl', 'volume', 'pitch', 'heard_in'], offer: ['pitch'] },
        { key: 'where', title: 'where it is, how big', why: 'its place, the thing it is on, its size: a point, a sphere, a ring round you, or all around (a bed)', props: ['place', 'at', 'attach', 'radius', 'ring', 'bed', 'field', 'line', 'scatter', 'rotate', 'scale'], offer: ['radius'] },
        { key: 'move', title: 'how it moves', why: 'a path it walks, flies or orbits; a sound on a moving thing moves with it', props: ['move', 'follow'], offer: ['move'] },
        { key: 'when', title: 'when it plays', why: 'how often, how long, how it fades in and out, and what may stop it', props: ['every', 'spread', 'start', 'end', 'duration', 'fade_in', 'fade_out', 'cooldown', 'within', 'chance', 'active', 'quiet', 'pace', 'randomstart', 'overlap', 'in_order'], offer: ['fade_in', 'fade_out', 'every'] },
        { key: 'space', title: 'the room and its effects', why: 'what the space does to it (walls, echo) and its effects: filter, delay, distortion, EQ', props: ['in', 'occlusion', 'doppler', 'tilt', 'reverb', 'filter', 'delay', 'distortion', 'eq'], offer: ['reverb', 'filter'] },
    ];
    const MIX_LABELS = { spl: 'loudness at 1 m', volume: 'level', pitch: 'pitch', heard_in: 'louder in', place: 'where (x y z)', at: 'on the thing', attach: 'carried by', radius: 'size (m)', ring: 'ring round you (m)', bed: 'all around', field: 'a field', line: 'along a line', scatter: 'scattered', rotate: 'turned', scale: 'scale', move: 'path', follow: 'follows', every: 'every (s)', spread: 'give or take (s)', start: 'starts at (s)', end: 'ends at (s)', duration: 'plays for (s)', fade_in: 'fades in (s)', fade_out: 'fades out (s)', cooldown: 'at most every (s)', within: 'events within (m)', chance: 'chance', active: 'hours', quiet: 'quiet when', pace: 'pace', randomstart: 'starts anywhere', overlap: 'overlaps itself', in_order: 'takes in order', in: 'in the room', occlusion: 'through walls', doppler: 'doppler', tilt: 'tilt', reverb: 'echo', filter: 'filter', delay: 'delay', distortion: 'distortion', eq: 'EQ' };
    /**
     * Everything the language lets a sound say, in the mix (2026-11-13): one family at a time (loudness, place and size,
     * movement, timing, the room and effects), each with a picture you drag where one helps (a plan of where it is and
     * how big, its live trail as it moves; one play's envelope with its fades) and the registry's own control for every
     * setting (unset ones dimmed, to set). A class's sound is set on every copy.
     */
    /** One family's settings: the registry's control for each it sets, the usual unset ones dimmed, "+ N more" for the rest. */
    function familyRows(fam, i, st, s, host, again) {
        const set = fam.props.filter(k => st.propertySpans.has(k));
        const all = advAll.has(`${s.sourceId}:${fam.key}`);
        const unset = fam.props.filter(k => !st.propertySpans.has(k) && ghostApplies(k, st) && (all || fam.offer.includes(k)));
        for (const k of [...set, ...unset]) {
            const ghost = !st.propertySpans.has(k), raw = ghost ? (seedFor(k) ?? '') : (rawValue(i, k) ?? '');
            const r = el('div', 'satie-dt-prow');
            r.dataset.key = k;
            r.dataset.ghost = ghost ? '1' : '0';
            const lab = el('span', 'pl', MIX_LABELS[k] ?? k.replace(/_/g, ' '));
            lab.title = `${k}: ${PROPERTIES.find(p => p.name === k)?.detail ?? ''}`;
            r.append(lab, widgetFor(i, k, raw, controlFor(k), ghost, st));
            if (!ghost && authoring) {
                const rm = el('button', 'ic', '×');
                rm.title = `remove ${k} (back to the default)`;
                rm.addEventListener('click', () => removeProp(i, k));
                r.appendChild(rm);
            }
            if (ghost)
                r.title = 'not set: touch it to set it';
            host.appendChild(r);
        }
        const more = fam.props.filter(k => !st.propertySpans.has(k) && ghostApplies(k, st) && !fam.offer.includes(k)).length;
        if (more) {
            const m = el('button', 'mmore', all ? 'only what it uses' : `+ ${more} more it could use`);
            m.addEventListener('click', () => { if (all)
                advAll.delete(`${s.sourceId}:${fam.key}`);
            else
                advAll.add(`${s.sourceId}:${fam.key}`); again(); });
            host.appendChild(m);
        }
    }
    /** The open tab of a sound's advanced fold (kept while you move between sounds). */
    let advTab = null;
    /**
     * Everything the language lets a sound say, as tabs with a big picture on top (2026-11-13, Layout 2): level; where it is
     * and how big (a plan from above, its size ring to drag); how it moves (the plan with where it has been); when it plays
     * (one play's shape, its fades to drag); its effects; how it answers the game (the follow curves, its gates in words);
     * its script. A class's sound is set on every copy.
     */
    function mixTabs(i, st, s, body) {
        propCopies.clear();
        const copies = copiesOf(s);
        if (copies.length > 1)
            propCopies.set(i, copies);
        const follows = [['volume', st.volumeFollow], ['pitch', st.pitchFollow], ['spl', st.splFollow], ['occlusion', st.occlusionFollow], ['pace', st.paceFollow]].filter((x) => !!x[1]);
        const b = mixBlockOf(i), gates = b ? gatesInWords(script.split('\n').slice(b.start, b.end)) : [];
        const fam = (k) => MIX_FAMILIES.find(f => f.key === k);
        const placed = soundKind(st) !== 'yours';
        // (2026-11-14) only what this sound has a use for: "moves" only for a sound that moves by itself, "effects" only when it
        // has one (else offered as "+ effects"), "game" only when it answers the game; the rest are in "script"
        const moves = ['move', 'follow'].some(k => st.propertySpans.has(k));
        const fx = ['reverb', 'filter', 'delay', 'distortion', 'eq', 'occlusion'].some(k => st.propertySpans.has(k));
        const tabs = [['level', 'level'], ...(placed ? [['where', 'where']] : []), ...(moves ? [['move', 'moves']] : []), ['when', 'timing'], ['space', fx ? 'effects' : '+ effects'], ...(follows.length || gates.length ? [['game', 'game']] : []), ['script', 'script']];
        if (!advTab || !tabs.some(t => t[0] === advTab))
            advTab = follows.length ? 'game' : 'level';
        const bar = el('div', 'mtabs'), pane = el('div', 'mpane');
        body.replaceChildren(bar, pane);
        const paint = () => {
            bar.replaceChildren();
            // a dot on "game" when it answers the game (a follow, a gate): one row of tabs, never two
            for (const [k, name] of tabs) {
                const t = el('button', `${advTab === k ? 'on' : ''}${k === 'game' && (follows.length || gates.length) ? ' has' : ''}`, name);
                t.addEventListener('click', () => { advTab = k; paint(); });
                bar.appendChild(t);
            }
            pane.replaceChildren();
            const again = () => paint();
            const k = advTab;
            if (k === 'level') {
                // a pitch range said in words, not a number pair: how much each play varies
                if (!st.pitch.isNull && st.pitch.max !== st.pitch.min) {
                    const lo = st.pitch.min, hi = st.pitch.max, spread = Math.round(Math.max(1 - lo, hi - 1) * 100);
                    pane.appendChild(el('div', 'ex', `Each play picks its own pitch, up to about ${spread}% lower or higher (${say01(lo)}× to ${say01(hi)}×), so repeats never sound identical.`));
                }
                familyRows(fam('loud'), i, st, s, pane, again);
            }
            else if (k === 'where') {
                pane.appendChild(planView(i, st, s));
                familyRows(fam('where'), i, st, s, pane, again);
            }
            else if (k === 'move') {
                pane.appendChild(planView(i, st, s));
                pane.appendChild(el('div', 'ex', 'Most movement is the game’s: a sound on a moving thing moves with it. A path of its own is for something the game does not move (a bird circling, a plane passing).'));
                familyRows(fam('move'), i, st, s, pane, again);
            }
            else if (k === 'when') {
                pane.appendChild(timingView(i, st, s));
                familyRows(fam('when'), i, st, s, pane, again);
            }
            else if (k === 'space')
                familyRows(fam('space'), i, st, s, pane, again);
            else if (k === 'game') {
                if (follows.length)
                    for (const [p, f] of follows)
                        pane.appendChild(followView(p, f, s));
                else
                    pane.appendChild(el('div', 'ex', 'Nothing: it plays the same whatever the game does. Ask SATIE in the chat to make it follow something (“higher as the car speeds up”).'));
                if (gates.length) {
                    pane.appendChild(el('div', 'ah', 'when it may play'));
                    for (const g of gates)
                        pane.appendChild(el('div', 'gw', g));
                }
            }
            else if (k === 'script' && b) {
                pane.appendChild(el('div', 'ah', (s.copies?.length ?? 1) > 1 ? `its script (the first of ${s.copies.length}: read only)` : 'its script'));
                pane.appendChild(scriptBox(b.start, b.end, `${s.name}: script edited in the mix`, (s.copies?.length ?? 1) > 1));
            }
            if (copies.length > 1 && k !== 'script' && k !== 'game')
                pane.appendChild(el('div', 'ex', `A change here is made on all ${copies.length} copies at once (one change; undo takes it back).`));
        };
        paint();
    }
    const advAll = new Set();
    /**
     * Where it is and how big, from above (2026-11-13): the sound at the middle, you where you stand, its size as a ring you
     * drag (heard as you drag), and where it has been in the last seconds as a trail (any path, the engine's own positions).
     */
    function planView(i, st, s) {
        const box = el('div', 'plan2'), ns = 'http://www.w3.org/2000/svg', W = 300, H = 170, svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'pv2');
        const mk = (tag, cls) => { const e = document.createElementNS(ns, tag); if (cls)
            e.setAttribute('class', cls); return e; };
        const isBed = st.bed || soundKind(st) === 'around';
        const note = el('div', 'fn');
        if (isBed) {
            const c = mk('circle', 'bed');
            c.setAttribute('cx', String(W / 2));
            c.setAttribute('cy', String(H / 2));
            c.setAttribute('r', String(H / 2 - 10));
            svg.appendChild(c);
            const y = mk('circle', 'you');
            y.setAttribute('cx', String(W / 2));
            y.setAttribute('cy', String(H / 2));
            y.setAttribute('r', '6');
            svg.appendChild(y);
            note.textContent = 'all around you, from no one spot: it has no place or size (a bed)';
            box.append(svg, note);
            return box;
        }
        const radius = !st.radius.isNull ? (st.radius.min + st.radius.max) / 2 : 0, ringR = st.ringRadius && !st.ringRadius.isNull ? (st.ringRadius.min + st.ringRadius.max) / 2 : 0;
        const trail = [];
        const grid = mk('g', 'pg'), trailEl = mk('polyline', 'trail'), size = mk('circle', 'size'), ring = mk('circle', 'ringd'), handle = mk('circle', 'sh'), dot = mk('circle', 'sd'), you = mk('circle', 'you'), youL = mk('text', 'yl'), scaleL = mk('text', 'yl');
        dot.setAttribute('r', '9');
        handle.setAttribute('r', '8');
        you.setAttribute('r', '6');
        youL.textContent = 'you';
        svg.append(grid, size, ring, trailEl, dot, handle, you, youL, scaleL);
        let r = radius, span = 12;
        const cur = () => { const v = engine.getTrackViews().find(t => t.statementIndex === i); return v ? { x: v.position.x, z: v.position.z } : s.at ? { x: s.at[0], z: s.at[1] } : null; };
        const paint = () => {
            const p = cur(), L = engine.listenerPosition;
            if (!p) {
                note.textContent = 'it has no place yet: the game sets it where it happens';
                return;
            }
            const far = Math.max(r * 1.3, ringR * 1.3, ...trail.map(t => Math.hypot(t[0] - p.x, t[1] - p.z) * 1.2), Math.min(40, Math.hypot(L.x - p.x, L.z - p.z) * 1.15), 6);
            span = span + (far - span) * 0.25;
            const k = (H / 2 - 12) / span, X = (x) => W / 2 + (x - p.x) * k, Y = (z) => H / 2 + (z - p.z) * k;
            grid.replaceChildren();
            const step = span > 30 ? 10 : span > 12 ? 5 : 2;
            for (let m = step; m < span * 1.6; m += step) {
                const g = mk('circle', 'gr');
                g.setAttribute('cx', String(W / 2));
                g.setAttribute('cy', String(H / 2));
                g.setAttribute('r', String(m * k));
                grid.appendChild(g);
            }
            scaleL.setAttribute('x', String(W / 2 + step * k + 3));
            scaleL.setAttribute('y', String(H / 2 - 3));
            scaleL.textContent = `${step} m`;
            dot.setAttribute('cx', String(W / 2));
            dot.setAttribute('cy', String(H / 2));
            size.setAttribute('cx', String(W / 2));
            size.setAttribute('cy', String(H / 2));
            size.setAttribute('r', String(Math.max(0, r * k)));
            size.style.display = r > 0 ? '' : 'none';
            ring.setAttribute('cx', String(W / 2));
            ring.setAttribute('cy', String(H / 2));
            ring.setAttribute('r', String(Math.max(0, ringR * k)));
            ring.style.display = ringR > 0 ? '' : 'none';
            handle.setAttribute('cx', String(W / 2 + Math.max(r * k, 14)));
            handle.setAttribute('cy', String(H / 2));
            const yx = Math.max(8, Math.min(W - 8, X(L.x))), yz = Math.max(8, Math.min(H - 8, Y(L.z)));
            you.setAttribute('cx', String(yx));
            you.setAttribute('cy', String(yz));
            youL.setAttribute('x', String(yx + 9));
            youL.setAttribute('y', String(yz + 4));
            trailEl.setAttribute('points', trail.map(t => `${X(t[0]).toFixed(1)},${Y(t[1]).toFixed(1)}`).join(' '));
            if (!drag)
                note.textContent = `${r > 0 ? `${say01(r)} m across its middle` : 'a point'}${ringR > 0 ? `, a ring ${say01(ringR)} m round` : ''} · ${Math.round(Math.hypot(L.x - p.x, L.z - p.z))} m from you${trail.length > 3 && Math.hypot(trail[0][0] - trail[trail.length - 1][0], trail[0][1] - trail[trail.length - 1][1]) > 0.5 ? ' · the line is where it went' : ''} · drag the ring to size it`;
        };
        let drag = false;
        const tick = () => { if (!box.isConnected)
            return; const p = cur(); if (p) {
            const l = trail[trail.length - 1];
            if (!l || Math.hypot(l[0] - p.x, l[1] - p.z) > 0.05)
                trail.push([p.x, p.z]);
            if (trail.length > 60)
                trail.shift();
        } if (!drag)
            paint(); setTimeout(tick, 250); };
        setTimeout(tick, 0);
        const local = (e) => { const m = svg.getScreenCTM(); if (!m)
            return [0, 0]; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [q.x, q.y]; };
        svg.addEventListener('pointerdown', e => {
            const [x, y] = local(e);
            if (Math.hypot(x - Number(handle.getAttribute('cx')), y - Number(handle.getAttribute('cy'))) > 16)
                return;
            if (!authoring) {
                askToFork('change its size');
                return;
            }
            drag = true;
            svg.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        svg.addEventListener('pointermove', e => {
            if (!drag)
                return;
            const [x, y] = local(e), k = (H / 2 - 12) / span;
            r = Math.round(Math.max(0, Math.hypot(x - W / 2, y - H / 2) / k) * 2) / 2;
            size.setAttribute('r', String(r * k));
            size.style.display = r > 0 ? '' : 'none';
            handle.setAttribute('cx', String(W / 2 + Math.max(r * k, 14)));
            note.textContent = r > 0 ? `size ${say01(r)} m: inside it you are in the sound, outside it comes from its middle` : 'a point';
            previewProp(i, 'radius', String(r));
        });
        svg.addEventListener('pointerup', () => { if (!drag)
            return; drag = false; if (r !== radius) {
            if (r > 0)
                setProp(i, 'radius', String(r), `${s.name}: size ${r} m`);
            else
                removeProp(i, 'radius');
        } });
        box.append(svg, note);
        return box;
    }
    /**
     * One play, drawn (2026-11-13): its length, the fade in and the fade out as ramps you drag (written on release), and for a
     * sound on a timer when the next ones come ("every"), so its timing is a shape, not three numbers.
     */
    /**
     * When it plays, drawn the way this sound plays (2026-11-14): a game event is a sentence ("when the game fires
     * “vending purchase”", at most every …); a sound on a timer is a minute of time with when it might come ("every 4 to
     * 25 s": a band of where the next can fall, and a sample of plays); a loop with fades is its envelope; a plain loop says so.
     */
    function timingView(i, st, s) {
        if (st.kind === 'trigger') {
            const b = el('div', 'ex');
            b.textContent = `It plays when the game fires “${(st.eventName ?? 'its event').replace(/_/g, ' ')}”${s.how && /cooldown|at most/.test(s.how) ? `, ${s.how}` : ''}: nothing to time here.`;
            return b;
        }
        const evRaw = rawValue(i, 'every');
        if (st.kind === 'oneshot' && evRaw)
            return everyView(i, st, evRaw);
        const hasFade = !!(rawValue(i, 'fade_in') || rawValue(i, 'fade_out'));
        if (st.kind === 'loop' && !hasFade) {
            const b = el('div', 'ex');
            b.textContent = 'It plays on and on, a loop. Set a fade below if it should come in or out gently.';
            return b;
        }
        return envelopeView(i, st);
    }
    /** "every 4 to 25 s", drawn: a minute, the band where the next play can fall after each, a sample of plays. */
    function everyView(i, st, raw) {
        const box = el('div', 'env2'), ns = 'http://www.w3.org/2000/svg', W = 300, H = 70, P = 12, svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'ev2');
        const m = raw.match(/([\d.]+)(?:\s*to\s*([\d.]+))?/);
        const lo = m ? parseFloat(m[1]) : 10, hi = m?.[2] ? parseFloat(m[2]) : lo;
        const span = Math.max(60, hi * 2.5), X = (t) => P + (t / span) * (W - 2 * P);
        const mk = (tag, cls) => { const e = document.createElementNS(ns, tag); if (cls)
            e.setAttribute('class', cls); return e; };
        const axis = mk('line', 'axl');
        axis.setAttribute('x1', String(P));
        axis.setAttribute('x2', String(W - P));
        axis.setAttribute('y1', '40');
        axis.setAttribute('y2', '40');
        axis.setAttribute('stroke', 'rgba(235,231,223,.3)');
        svg.appendChild(axis);
        // a deterministic sample of plays (the same picture each time), each followed by the band where the next can land
        let seed = (st.sourceId ?? 'x').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7), t = 0;
        const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        const plays = [];
        while (t < span) {
            plays.push(t);
            t += lo + (hi - lo) * rnd();
        }
        if (plays.length > 1) {
            const band = mk('rect', 'enx');
            band.setAttribute('x', String(X(plays[0] + lo)));
            band.setAttribute('width', String(Math.max(2, X(Math.min(span, plays[0] + hi)) - X(plays[0] + lo))));
            band.setAttribute('y', '28');
            band.setAttribute('height', '24');
            svg.appendChild(band);
        }
        for (const p of plays) {
            const r = mk('rect');
            r.setAttribute('x', String(X(p) - 2));
            r.setAttribute('y', '30');
            r.setAttribute('width', '4');
            r.setAttribute('height', '20');
            r.setAttribute('rx', '2');
            r.setAttribute('fill', '#ff8da1');
            svg.appendChild(r);
        }
        const tx = (x, s0, a = 'middle') => { const e = mk('text', 'etk'); e.setAttribute('x', String(x)); e.setAttribute('y', '16'); e.setAttribute('text-anchor', a); e.textContent = s0; svg.appendChild(e); };
        tx(X(0), 'now', 'start');
        if (plays.length > 1)
            tx((X(plays[0] + lo) + X(Math.min(span, plays[0] + hi))) / 2, `next: ${say01(lo)}–${say01(hi)} s later`);
        tx(W - P, `${Math.round(span)} s`, 'end');
        const note = el('div', 'fn');
        note.textContent = lo === hi ? `a new one every ${say01(lo)} s, like clockwork` : `a new one every ${say01(lo)} to ${say01(hi)} s, at random in between (the pink band), so it never feels mechanical · change it with "every" below`;
        void i;
        box.append(svg, note);
        return box;
    }
    function envelopeView(i, st) {
        const box = el('div', 'env2'), ns = 'http://www.w3.org/2000/svg', W = 300, H = 92, P = 14, svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'ev2');
        const mk = (tag, cls) => { const e = document.createElementNS(ns, tag); if (cls)
            e.setAttribute('class', cls); return e; };
        const num = (k) => { const v = parseFloat(rawValue(i, k) ?? ''); return Number.isFinite(v) ? v : 0; };
        const buf = engine.getAudioBuffers().get(takeKeyAt(st, 0));
        const len = num('duration') || (buf?.duration ?? 4), loop = st.kind === 'loop';
        const every = st.kind === 'oneshot' ? num('every') : 0;
        let fi = num('fade_in'), fo = num('fade_out');
        const total = Math.max(len, every > 0 ? every * 2.2 : len * 1.25);
        const X = (t) => P + (t / total) * (W - 2 * P), T = (x) => Math.max(0, Math.min(len, ((x - P) / (W - 2 * P)) * total));
        const top = 16, base = H - 22;
        const shape = mk('polygon', 'esh'), next = mk('g'), hIn = mk('circle', 'eh'), hOut = mk('circle', 'eh'), lbl = mk('g');
        hIn.setAttribute('r', '8');
        hOut.setAttribute('r', '8');
        svg.append(next, shape, hIn, hOut, lbl);
        const note = el('div', 'fn');
        const paint = () => {
            const a = Math.min(fi, len / 2), b = Math.min(fo, len / 2);
            shape.setAttribute('points', `${X(0)},${base} ${X(a)},${top} ${X(len - b)},${top} ${X(len)},${base}`);
            hIn.setAttribute('cx', String(X(a)));
            hIn.setAttribute('cy', String(top));
            hOut.setAttribute('cx', String(X(len - b)));
            hOut.setAttribute('cy', String(top));
            next.replaceChildren();
            if (every > 0)
                for (let t = every; t < total; t += every) {
                    const g = mk('rect', 'enx');
                    g.setAttribute('x', String(X(t)));
                    g.setAttribute('y', String(top + 8));
                    g.setAttribute('width', String(Math.max(2, X(Math.min(len, total - t)) - X(0))));
                    g.setAttribute('height', String(base - top - 8));
                    next.appendChild(g);
                }
            lbl.replaceChildren();
            const tx = (x, t, anchor = 'middle') => { const e = mk('text', 'etk'); e.setAttribute('x', String(x)); e.setAttribute('y', String(H - 7)); e.setAttribute('text-anchor', anchor); e.textContent = t; lbl.appendChild(e); };
            tx(X(0), '0', 'start');
            tx(X(len), `${say01(len)} s${loop ? ' ↻' : ''}`);
            if (every > 0)
                tx(X(every), `next ${say01(every)} s`);
            note.textContent = `${loop ? 'a loop: it plays on and on' : 'one play'} · fades in ${say01(a)} s, out ${say01(b)} s${every > 0 ? ` · a new one every ${say01(every)} s` : ''} · drag the corners to change the fades`;
        };
        paint();
        const local = (e) => { const m = svg.getScreenCTM(); if (!m)
            return [0, 0]; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [q.x, q.y]; };
        let drag = null;
        svg.addEventListener('pointerdown', e => {
            const [x, y] = local(e);
            const d = (c) => Math.hypot(x - Number(c.getAttribute('cx')), y - Number(c.getAttribute('cy')));
            const hit = d(hIn) < 16 ? 'in' : d(hOut) < 16 ? 'out' : null;
            if (!hit)
                return;
            if (!authoring) {
                askToFork('change how it fades');
                return;
            }
            drag = hit;
            svg.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        svg.addEventListener('pointermove', e => { if (!drag)
            return; const t = Math.round(T(local(e)[0]) * 10) / 10; if (drag === 'in')
            fi = Math.min(t, len / 2);
        else
            fo = Math.min(Math.max(0, len - t), len / 2); paint(); });
        svg.addEventListener('pointerup', () => {
            const was = drag;
            if (!was)
                return;
            drag = null;
            const v = was === 'in' ? fi : fo, k = was === 'in' ? 'fade_in' : 'fade_out', old = num(k);
            if (Math.abs(v - old) < 0.05)
                return;
            if (v > 0)
                setProp(i, k, String(Math.round(v * 10) / 10), `${nameOf(st)}: fades ${was} over ${Math.round(v * 10) / 10} s`);
            else
                removeProp(i, k);
        });
        box.append(svg, note);
        return box;
    }
    function paintMixSide(l) {
        if (sideFind && (!l || l.kind !== 'sound' || l.sid !== sideFind.sid)) {
            sideFind = null;
            opts.editPanel?.suggestIds?.(null);
        }
        placeChat(l);
        // (2026-11-13) a play belongs to the level it was started at: going up (or anywhere else) stops it, and a take or a
        // fired event still sounding stops with it
        const lk = (x) => (x ? `${x.kind}:${x.sid ?? x.key ?? x.title}` : '');
        if (lastLevel && lk(lastLevel) !== lk(l)) {
            if (mixPlay)
                stopMixPlay();
            for (const x of fireSrcs) {
                try {
                    x.stop();
                }
                catch { /* ended */ }
            }
            fireSrcs = [];
            if (sideBtn) {
                void editHear(null);
                sideStop();
            }
        }
        lastLevel = l;
        if (!l) {
            mixSide.hidden = true;
            root.dataset.mixside = '0';
            mixSig = '';
            clearInterval(laneTimer);
            laneTimer = undefined;
            stopMixPlay();
            return;
        }
        root.dataset.mixside = '1';
        mixSide.hidden = false;
        laneTimer ??= setInterval(laneTick, 250);
        const sig = JSON.stringify([l.kind, l.title, l.sid, l.suggesting, !!mixPlay, mixLen, l.sounds.map(s => [s.sourceId, s.takes.length, s.heardDb === null, s.how, s.name, s.muted])]);
        if (sig === mixSig)
            return;
        mixSig = sig;
        const keepTop = mixSide.querySelector('.ml2')?.scrollTop ?? 0;
        mixSide.replaceChildren();
        lanes.clear();
        mixAxis = [];
        mixStatus = null;
        takeRows.clear();
        sideRows.clear();
        // the lanes show the next play before you press it: a plan by the rules, the same one play then follows
        const planKey = JSON.stringify([l.kind, l.title, mixLen, l.sounds.map(x => [x.sourceId, x.muted])]);
        if (!mixPlay && shownPlan?.key !== planKey) {
            const L = Number.isFinite(mixLen) ? mixLen : LANE_S;
            shownPlan = { key: planKey, len: L, evs: planFor(l.sounds.map(x => x.sourceId), L, true) };
        }
        const panel = opts.editPanel;
        const goTo = (t) => { if (panel?.go)
            panel.go(t);
        else
            openEdit(t); };
        // the whole soundscape, as a place to go back to: the one that holds these sounds
        const scapeId = l.sounds[0] ? api.soundscapes()?.variants.soundscapes().find(d => d.sourceIds.includes(l.sounds[0].sourceId))?.id : undefined;
        const toScape = scapeId ? { soundscape: scapeId } : null;
        // ── the head: what kind of thing this is (a tag that teaches the word), its name, where it is, its controls ──
        const head = el('div', `mh k-${l.kind}`);
        const tag = el('span', `kt k-${l.kind}`);
        tag.append(el('i'), el('span', undefined, l.kind === 'scape' ? word('soundscape') : l.kind === 'thing' ? 'game entity' : 'sound'));
        tag.title = l.kind === 'scape' ? 'a soundscape: one place in the game and everything you hear there' : l.kind === 'thing' ? 'a game entity: an object in your game; its sounds play from it' : 'a sound: one thing you hear, made of one or more takes';
        head.append(tag, el('div', 'mv', l.title));
        const meta = el('div', 'mp');
        const chip = (kind, label, to) => {
            const c = el(to ? 'button' : 'span', `mc k-${kind}`);
            c.append(el('i'), el('span', undefined, label));
            if (to) {
                c.title = kind === 'scape' ? 'back to the whole soundscape' : 'open the whole game entity';
                c.addEventListener('click', () => goTo(to));
            }
            return c;
        };
        const always = l.sounds.filter(x => /^always/.test(x.how)).length, onEvent = l.sounds.filter(x => !!x.event).length, other = l.sounds.length - always - onEvent;
        const mix = [always ? `${always} always` : '', onEvent ? `${onEvent} on game events` : '', other ? `${other} now and then` : ''].filter(Boolean).join(', ');
        if (l.kind === 'scape') {
            const entities = new Set(l.sounds.filter(x => x.thing.label !== 'the scene').map(x => x.thing.key)).size, around = l.sounds.filter(x => x.where === 'around').length;
            meta.append(el('span', 'mt', `${l.sounds.length} sounds · ${entities} game entities${around ? ` · ${around} all around` : ''}`));
        }
        else if (l.kind === 'thing') {
            meta.append(el('span', 'mw', 'in'), chip('scape', l.scape ?? '', toScape));
            const allN = l.key ? editSounds().filter(x => x.thing.key === l.key).length : l.sounds.length;
            meta.append(el('span', 'mt', allN > l.sounds.length ? `${allN} sounds, ${l.sounds.length} in this soundscape: ${mix}` : `${l.sounds.length} sounds: ${mix}`));
        }
        else {
            const s0 = l.sounds[0];
            if (s0 && l.parent && l.parent !== l.scape)
                meta.append(el('span', 'mw', 'on'), chip('thing', l.parent, { sound: s0.sourceId, thing: true }));
            meta.append(el('span', 'mw', 'in'), chip('scape', l.scape ?? '', toScape));
        }
        // one big play: everything here at once, by its rules (a game entity with a run of its own, the train, plays that)
        const tr = el('div', 'tr2');
        const s1 = l.kind === 'sound' ? l.sounds[0] : undefined;
        const what = l.kind === 'thing' ? `play the ${l.title.toLowerCase()}` : s1?.event ? 'fire it' : 'play it';
        const pb = el('button', `pp${mixPlay ? ' on' : ''}`);
        if (s1)
            pb.dataset.key = `pp:${s1.sourceId}`;
        pb.innerHTML = `${mixPlay ? ICON.stop : ICON.play}<span></span>`;
        pb.lastElementChild.textContent = mixPlay ? 'stop' : what;
        pb.title = 'every sound here at once, as the game plays it: loops all along, timed sounds on their timer, game events now and then, a take at random each time';
        pb.addEventListener('click', () => {
            if (s1?.event && !mixPlay) {
                fireHere(s1.sourceId, pb);
                return;
            }
            if (mixPlay) {
                stopMixPlay();
                return;
            }
            // by its rules, the same for every thing (2026-11-13): the game's own run (the train's pass) began 720 m out, under
            // the silenced scene, so it played nothing for the first 20 s; a moving thing's events now keep its rhythm in the plan
            startMixPlay(l.sounds.map(x => x.sourceId), mixLen);
            mixSig = '';
            paintMixSide(l);
        });
        const seg = el('span', 'lenseg');
        for (const [v, name] of [[10, '10 s'], [20, '20 s'], [30, '30 s'], [Infinity, '∞']]) {
            const b = el('button', mixLen === v ? 'on' : '', name);
            b.title = v === Infinity ? 'keep playing until you stop it' : `play ${v} seconds`;
            b.addEventListener('click', () => { mixLen = v; if (mixPlay && !mixPlay.game)
                startMixPlay(mixPlay.sids, v); mixSig = ''; paintMixSide(l); });
            seg.appendChild(b);
        }
        mixStatus = el('div', 'ps');
        if (l.kind === 'scape') {
            // a whole soundscape is only right where you stand, spatial, with the game's own timing (the train coming
            // closer): so here it is the game itself, let back up under the mix, never a dry pile of every sound
            const gb = el('button', `pp${gameUp ? ' on' : ''}`);
            gb.innerHTML = `${gameUp ? ICON.stop : ICON.play}<span></span>`;
            gb.lastElementChild.textContent = gameUp ? 'quiet the game' : 'hear it in the game';
            gb.title = 'the soundscape as you hear it in the game, from where you stand: spatial, live, in its own time';
            gb.addEventListener('click', () => { gameUp = !gameUp; restScene(); record('mix_game_up', { on: gameUp }); mixSig = ''; paintMixSide(l); });
            tr.append(gb);
            mixStatus.textContent = gameUp ? 'the game, from where you stand' : 'the game is quiet while you work here';
            mixStatus.dataset.fixed = '1';
        }
        else if (s1?.event) {
            tr.append(pb);
            mixStatus.textContent = 'it plays when the game fires it, with what comes after it';
            mixStatus.dataset.fixed = '1';
        }
        else
            tr.append(pb, seg);
        head.append(meta, tr, mixStatus);
        mixSide.appendChild(head);
        // ── the list: an axis for the lanes, then the sounds (or the entities and their sounds) ──
        const list = el('div', 'ml2');
        const axLen = mixPlay ? mixPlay.len : shownPlan?.len ?? LANE_S;
        const mkAxis = (cls) => { const a = el('div', cls); for (const f of [0, 0.25, 0.5, 0.75, 1]) {
            const t = el('span', undefined, `${Math.round(axLen * f)} s`);
            t.style.left = `calc(var(--w) * ${f})`;
            a.appendChild(t);
        } a.appendChild(el('i', 'ph')); mixAxis.push(a); return a; };
        const axis = mkAxis('ax');
        let axisPut = l.kind !== 'thing';
        const hearBtn = (s) => {
            const b = el('button', 'hb');
            b.innerHTML = ICON.play;
            b.dataset.key = `hb:${s.sourceId}`;
            b.title = s.event ? `fire “${s.event.replace(/_/g, ' ')}” as the game would (one of its takes, and what comes after it)` : s.takes.length > 1 ? 'hear it (one of its takes, at random)' : 'hear it';
            b.addEventListener('click', e => { e.stopPropagation(); if (s.event)
                fireHere(s.sourceId, b);
            else
                sideHear(s, undefined, b); });
            return b;
        };
        const muteBtn = (s) => {
            const b = el('button', 'mb2', 'M');
            b.dataset.on = s.muted ? '1' : '0';
            b.title = s.muted ? 'unmute it' : 'mute it (in the game too)';
            b.addEventListener('click', e => { e.stopPropagation(); const ii = copiesOf(s); if (!ii.length)
                return; const on = !ii.every(isMuted); setMuted(ii, on); commitMix(); syncMixer(); s.muted = on; mixSig = ''; paintMixSide(l); });
            return b;
        };
        /** Delete a sound from the sidebar: the red bin, asking once (undo or history brings it back). */
        const binBtn = (s, after) => {
            const b = el('button', 'bin2');
            b.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
            b.title = 'delete this sound (asks once; undo brings it back)';
            b.setAttribute('aria-label', `delete ${s.name}`);
            b.addEventListener('click', e => {
                e.stopPropagation();
                if (!authoring) {
                    askToFork('delete this sound');
                    return;
                }
                if (b.dataset.sure !== '1') {
                    const idle = b.innerHTML;
                    b.dataset.sure = '1';
                    b.textContent = 'delete?';
                    setTimeout(() => { if (b.isConnected) {
                        b.dataset.sure = '0';
                        b.innerHTML = idle;
                    } }, 2500);
                    return;
                }
                const ii = copiesOf(s);
                if (!ii.length)
                    return;
                if (ii.length === 1) {
                    blockMap = mapStatements(script, engine.scriptStatements);
                    deleteVoice(ii[0]);
                }
                else
                    deleteVoices(ii);
                mixSig = '';
                after?.();
            });
            return b;
        };
        const soloBtn = (s) => {
            const ii = copiesOf(s), i = ii[0] ?? -1, on = ii.length > 0 && ii.every(x => engine.soloedIndices.has(x));
            const b = el('button', 'mb2 so', 'S');
            b.dataset.on = on ? '1' : '0';
            b.title = on ? 'stop soloing it' : 'solo it: hear only the soloed sounds (in the game too)';
            b.addEventListener('click', e => { e.stopPropagation(); if (i < 0)
                return; const next = new Set(engine.soloedIndices); for (const x of ii) {
                if (on)
                    next.delete(x);
                else
                    next.add(x);
            } engine.setSoloIndices([...next]); commitMix(); syncMixer(); mixSig = ''; paintMixSide(l); });
            return b;
        };
        const soundRow = (s, inset) => {
            const r = el('div', `sr${inset ? ' in' : ''}${s.heardDb !== null ? ' on' : ''}${s.muted ? ' mu' : ''}`);
            const top = el('div', 'st');
            const n = el('button', 'sn', s.name);
            n.title = 'open this sound in the mix';
            n.addEventListener('click', () => goTo({ sound: s.sourceId }));
            top.append(el('i'), n);
            if (s.part)
                top.appendChild(el('span', 'pt', s.part));
            top.append(muteBtn(s), soloBtn(s), hearBtn(s), binBtn(s));
            // one selection, two sides: pointing at a row lights its sound on the map, and the map lights the row
            r.addEventListener('mouseenter', () => panel?.highlight?.(s.sourceId));
            r.addEventListener('mouseleave', () => panel?.highlight?.(null));
            sideRows.set(s.sourceId, r);
            const sub = el('div', 'sm', s.how);
            if (s.takes.length > 1)
                sub.appendChild(el('span', 'tq', ` · ${s.takes.length} takes`));
            r.append(top, sub);
            if (l.kind !== 'scape')
                r.appendChild(laneFor(s.sourceId));
            if (s.takes.length > 1) {
                const row = el('div', 'tk');
                s.takes.forEach((tk, k) => { const b = el('button', 'tc', String(k + 1)); b.dataset.key = `tc:${s.sourceId}:${k}`; b.style.setProperty('--tc', takeHue(k)); b.title = `hear take ${k + 1}${tk.name ? `: ${tk.name}` : ''}`; b.addEventListener('click', () => sideHear(s, k, b)); row.appendChild(b); });
                r.appendChild(row);
            }
            return r;
        };
        // a section's name, then (once, under the first) the lanes' axis, which stays at the top while you scroll
        const section = (t, note) => { const h = el('div', 'sec'); h.append(el('span', undefined, t)); if (note)
            h.appendChild(el('small', undefined, note)); list.appendChild(h); if (!axisPut) {
            axisPut = true;
            list.appendChild(axis);
        } };
        if (l.kind === 'scape') {
            const groups = new Map();
            for (const s of l.sounds) {
                const k = s.thing.label === 'the scene' ? `solo:${s.sourceId}` : s.thing.key;
                const g = groups.get(k);
                if (g)
                    g.push(s);
                else
                    groups.set(k, [s]);
            }
            // (2026-11-13) what is all around (beds and fields: the world layer, the paddies' frogs and cicadas) is its own section,
            // apart from the game entities you meet at one spot
            const around = (ss) => ss.every(x => x.where === 'around');
            const world = [...groups.values()].filter(around), rest = [...groups.values()].filter(ss => !around(ss));
            // an entity has the same number of sounds here as in the mixer (2026-11-13): all of them, and how many of those
            // this soundscape holds when it is not all ("3 here of 5")
            const totalOf = new Map();
            for (const x of editSounds())
                totalOf.set(x.thing.key, (totalOf.get(x.thing.key) ?? 0) + 1);
            const total = (ss) => ss[0].thing.label === 'the scene' ? ss.length : Math.max(ss.length, totalOf.get(ss[0].thing.key) ?? ss.length);
            const countText = (ss) => { const t = total(ss); return t > ss.length ? `${ss.length} here of ${t} sounds` : `${t} sound${t === 1 ? '' : 's'}`; };
            const loose = rest.filter(ss => total(ss) === 1), many = rest.filter(ss => total(ss) > 1);
            const entityBox = (ss, tip) => {
                const box = el('div', 'eb');
                const th = el('button', 'th');
                th.append(el('span', 'kt k-thing sm'), el('span', 'tn', ss[0].thing.label), el('small', undefined, `${ss[0].thing.count && ss[0].thing.count > 1 ? `×${ss[0].thing.count} · ` : ''}${countText(ss)}`));
                th.firstChild.appendChild(el('i'));
                th.title = tip;
                th.addEventListener('click', () => goTo({ sound: ss[0].sourceId, thing: true }));
                box.appendChild(th);
                for (const x of ss)
                    box.appendChild(soundRow(x, true));
                list.appendChild(box);
            };
            if (world.length) {
                section('all around you', 'the world layer: everywhere, from no one spot');
                for (const ss of world) {
                    if (ss.length > 1)
                        entityBox(ss, 'open it in the mix: its sounds together');
                    else
                        list.appendChild(soundRow(ss[0], false));
                }
            }
            if (many.length)
                section('game entities');
            for (const ss of many) {
                const box = el('div', 'eb');
                const th = el('button', 'th');
                th.append(el('span', 'kt k-thing sm'), el('span', 'tn', ss[0].thing.label), el('small', undefined, `${ss[0].thing.count && ss[0].thing.count > 1 ? `×${ss[0].thing.count} · ` : ''}${countText(ss)}`));
                th.firstChild.appendChild(el('i'));
                th.title = 'open this game entity in the mix: its sounds together';
                th.addEventListener('click', () => goTo({ sound: ss[0].sourceId, thing: true }));
                box.appendChild(th);
                for (const s of ss)
                    box.appendChild(soundRow(s, true));
                list.appendChild(box);
            }
            if (loose.length) {
                section('sounds on their own');
                for (const ss of loose)
                    list.appendChild(soundRow(ss[0], false));
            }
            // advanced: the soundscape's own block in the script (what it holds; its variants are planned from it)
            if (scapeId)
                list.appendChild(advanced(`scape:${scapeId}`, 'advanced · its script', body => {
                    const lines = script.split('\n'), at = lines.findIndex(x => x.trim().split(/\s+/)[0] === 'soundscape' && x.trim().split(/\s+/)[1] === scapeId);
                    if (at < 0) {
                        body.appendChild(el('div', 'ex', 'this soundscape comes from soundscapes.json, not from a block in the script'));
                        return;
                    }
                    let end = at + 1;
                    while (end < lines.length && /^\s+\S/.test(lines[end]))
                        end++;
                    body.appendChild(scriptBox(at, end, `${l.title}: soundscape block edited in the mix`));
                }));
        }
        else if (l.kind === 'thing') {
            section(l.sounds.some(x => (x.copies?.length ?? 1) > 1) ? 'its sounds, on every one of them' : 'its sounds');
            for (const s of l.sounds)
                list.appendChild(soundRow(s, false));
            // the rest of what it has, so the entity is whole here as in the mixer: what you do with it ("purchase · by you" is the
            // vending machine's, though it plays at you, so no soundscape holds it) and what sounds in another soundscape
            const here = new Set(l.sounds.map(x => x.sourceId)), elsewhere = editSounds().filter(x => x.thing.key === l.key && !here.has(x.sourceId));
            if (elsewhere.length) {
                section('its other sounds', elsewhere.some(x => x.where === 'yours') ? 'what you do with it, or in another soundscape' : 'in another soundscape, or in none');
                for (const s of elsewhere)
                    list.appendChild(soundRow(s, false));
            }
            // a class: its instances, nearest first (each plays the same sounds); go stands you next to one
            const lead = l.sounds.find(x => (x.copies?.length ?? 1) > 1);
            if (lead) {
                const stmts = engine.scriptStatements, hear = hearNow(), byHost = new Map();
                for (const x of l.sounds)
                    for (const i of copiesOf(x)) {
                        const h = stmts[i]?.hostRef;
                        if (h)
                            byHost.set(h, [...(byHost.get(h) ?? []), i]);
                    }
                const rows = [...byHost].map(([host, ii]) => ({ host, ii, d: Math.min(...ii.map(liveDistance)), heard: ii.some(i => (hear.get(i)?.marginDb ?? -Infinity) >= 0) })).sort((a, b) => a.d - b.d);
                section(`its ${rows.length} instances`, 'nearest first');
                for (const r of rows.slice(0, 12)) {
                    const row = el('div', `ir${r.heard ? ' on' : ''}`);
                    row.append(el('i'), el('span', 'in', hostName(r.host)), el('span', 'id', Number.isFinite(r.d) ? `${Math.round(r.d)} m${r.heard ? ' · heard' : ''}` : 'not placed'));
                    if (layer?.goTo) {
                        const g = el('button', 'igo', 'go');
                        g.title = `stand next to ${hostName(r.host)}`;
                        g.addEventListener('click', () => layer.goTo(r.ii));
                        row.appendChild(g);
                    }
                    list.appendChild(row);
                }
                if (rows.length > 12)
                    list.appendChild(el('div', 'ex', `and ${rows.length - 12} more, farther away`));
            }
            // advanced: the game signals its sounds follow, live, and each sound's script
            list.appendChild(advanced(`thing:${l.key ?? l.title}`, 'advanced · the game signals it follows, its script', body => {
                const stmts = engine.scriptStatements, sigs = new Set();
                for (const x of l.sounds) {
                    const st = stmts[copiesOf(x)[0]];
                    for (const f of [st?.volumeFollow, st?.pitchFollow, st?.splFollow, st?.occlusionFollow, st?.paceFollow])
                        if (f)
                            sigs.add(f.signal);
                }
                body.appendChild(el('div', 'ah', 'the game signals its sounds follow'));
                if (sigs.size)
                    for (const g of sigs) {
                        const r = el('div', 'gw');
                        const v = el('b');
                        const upd = () => { if (!r.isConnected)
                            return; const n = signalNow(g); v.textContent = Number.isFinite(n) ? say01(n) : 'not set'; setTimeout(upd, 300); };
                        r.append(`“${g.replace(/_/g, ' ')}” now `, v);
                        setTimeout(upd, 0);
                        body.appendChild(r);
                    }
                else
                    body.appendChild(el('div', 'ex', 'none: its sounds play the same whatever the game does.'));
                body.appendChild(el('div', 'ah', 'its script'));
                for (const x of l.sounds) {
                    const i = copiesOf(x)[0];
                    const b = i === undefined ? null : mixBlockOf(i);
                    if (!b)
                        continue;
                    body.appendChild(el('div', 'sn2', `${x.name}${(x.copies?.length ?? 1) > 1 ? ` (the first of ${x.copies.length})` : ''}`));
                    body.appendChild(scriptBox(b.start, b.end, `${x.name}: script edited in the mix`, (x.copies?.length ?? 1) > 1));
                }
            }));
        }
        else {
            const s = l.sounds[0];
            if (s) {
                const i = engine.scriptStatements.findIndex(st => st.sourceId === s.sourceId), st = engine.scriptStatements[i];
                const loc = st ? voiceLocatorFor(st, engine.scriptStatements) : null;
                const edit = (next, note, kind) => { if (next && next !== script) {
                    applyScript(next, `${s.name}: ${note}`, { kind, detail: { voice: voiceContext(i) } });
                    mixSig = '';
                } };
                // ── how it plays: always on, now and then (how often), or when the game says ──
                section('how it plays');
                const w = el('div', 'card');
                // (2026-11-13) a published scene shows the same controls; each asks you to fork before it changes anything
                if (st && st.kind !== 'trigger' && !isAround(st)) {
                    const how = el('div', 'seg2');
                    for (const [k, name] of [['loop', 'always on'], ['oneshot', 'now and then']]) {
                        const b = el('button', st.kind === k ? 'on' : '', name);
                        b.addEventListener('click', () => { if (!authoring) {
                            askToFork('change how it plays');
                            return;
                        } if (st.kind === k || !loc)
                            return; let next = setVoiceKind(script, loc, k); if (next && k === 'oneshot' && (!st.every || st.every.isNull))
                            next = upsertVoiceProperty(next, voiceLocatorFor(st, engine.scriptStatements), 'every', '8to16') ?? next; edit(next, k === 'loop' ? 'always on' : 'now and then', 'how_it_plays'); });
                        how.appendChild(b);
                    }
                    w.appendChild(how);
                }
                else
                    w.appendChild(el('div', 'big', s.how));
                if (st?.kind === 'trigger') {
                    const after = st.eventName ? layer?.eventInfo?.(st.eventName)?.after : undefined;
                    if (after) {
                        const d = Array.isArray(after.seconds) ? after.seconds : [after.seconds];
                        w.appendChild(el('div', 'big q', `about ${d.map(x => (Math.round(x * 100) / 100).toString()).join('–')} s after “${after.event.replace(/_/g, ' ')}”`));
                    }
                }
                if (st && st.kind !== 'trigger' && st.kind !== 'loop') {
                    // often…rarely: two handles on a log scale from 1 s to 2 min, applied on release
                    const e = st.every, lo0 = e && !e.isNull ? e.min : 8, hi0 = e && !e.isNull ? (e.isRange ? e.max : e.min) : 16;
                    const toS = (v) => Math.round(Math.exp(Math.log(1) + (v / 1000) * (Math.log(120) - Math.log(1))) * 10) / 10, toV = (x) => String(Math.round(((Math.log(Math.max(1, x)) - 0) / Math.log(120)) * 1000));
                    const row = el('div', 'often'), lab = el('div', 'ol'), a2 = el('input'), b2 = el('input');
                    for (const x of [a2, b2]) {
                        x.type = 'range';
                        x.min = '0';
                        x.max = '1000';
                        x.step = '1';
                    }
                    a2.value = toV(lo0);
                    b2.value = toV(hi0);
                    const fmt = (x) => (x >= 60 ? `${Math.round(x / 6) / 10} min` : `${x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x)} s`);
                    const show = () => { const lo = toS(Math.min(+a2.value, +b2.value)), hi = toS(Math.max(+a2.value, +b2.value)); lab.replaceChildren(el('span', undefined, 'often'), el('b', undefined, `every ${fmt(lo)}${hi > lo ? `–${fmt(hi)}` : ''}`), el('span', undefined, 'rarely')); };
                    const commit = () => { const lo = toS(Math.min(+a2.value, +b2.value)), hi = toS(Math.max(+a2.value, +b2.value)); if (loc)
                        edit(upsertVoiceProperty(script, loc, 'every', hi > lo ? `${lo}to${hi}` : String(lo)), `every ${fmt(lo)}${hi > lo ? `–${fmt(hi)}` : ''}`, 'every'); };
                    for (const x of [a2, b2]) {
                        x.addEventListener('input', show);
                        x.addEventListener('change', commit);
                        if (!authoring)
                            x.addEventListener('pointerdown', e => { e.preventDefault(); askToFork('change how often it plays'); });
                    }
                    show();
                    row.append(lab, a2, b2);
                    w.appendChild(row);
                }
                const where = s.where === 'around' ? 'all around you, from no one spot' : s.where === 'yours' ? 'with you, wherever you go' : s.where === 'contact' ? 'where the game sets it off' : s.where === 'moving' ? `moves with the ${s.part ?? s.thing.label}` : `in place, at the ${s.part ?? s.thing.label}`;
                w.appendChild(el('div', 'big q', where));
                // its level, the same fader as its row in the mixer (heard while dragging, written on release)
                if (opts.levelFaders && st) {
                    const f = levelFader(`source:${s.sourceId}`, s.name, s.copies ?? [s.sourceId]), v = el('span', 'lvv', '');
                    const show = () => { v.textContent = faderText(f); };
                    show();
                    f.addEventListener('input', show);
                    f.addEventListener('satie-mirror', show);
                    const lv = el('div', 'lvl');
                    lv.append(el('span', undefined, 'level'), f, v);
                    w.appendChild(lv);
                }
                // when it would play in the next pass, under the same axis as the play
                if (!s.event)
                    w.append(mkAxis('ax in'), laneFor(s.sourceId, 'ln big'));
                list.appendChild(w);
                // ── its recordings: one plays each time (at random, never the same twice in a row) ──
                section(s.takes.length > 1 ? `its ${s.takes.length} takes` : 'its take', s.takes.length > 1 ? 'one plays each time, at random' : undefined);
                list.appendChild(el('div', 'ex', s.takes.length > 1 ? 'A take is one recording of this sound. Each time it plays, SATIE picks one of these at random (never the same twice in a row), so it never sounds exactly the same twice.' : 'A take is one recording of this sound. With one, it is the same every time; more takes make it vary.'));
                const bufs = engine.getAudioBuffers();
                takeRows.set(s.sourceId, []);
                s.takes.forEach((tk, k) => {
                    const r = el('div', 'tr'), b = el('button', 'tc', s.takes.length > 1 ? String(k + 1) : '');
                    if (s.takes.length === 1)
                        b.innerHTML = ICON.play;
                    b.dataset.key = `tl:${s.sourceId}:${k}`;
                    b.style.setProperty('--tc', takeHue(k));
                    b.title = 'hear this take alone';
                    b.addEventListener('click', () => sideHear(s, k, b));
                    const d = bufs.get(tk.key)?.duration;
                    r.append(b, el('span', 'tn', s.takes.length > 1 ? `take ${k + 1}` : 'take'), el('span', 'tw', tk.name), el('span', 'now', 'in this play'), el('span', 'tl', d ? `${d < 10 ? d.toFixed(1) : Math.round(d)} s` : ''));
                    if (s.takes.length > 1) {
                        const x = el('button', 'tx', '×');
                        x.title = 'remove this take';
                        x.addEventListener('click', () => { if (!authoring) {
                            askToFork('remove a take');
                            return;
                        } if (x.dataset.sure !== '1') {
                            x.dataset.sure = '1';
                            x.textContent = 'remove?';
                            setTimeout(() => { x.dataset.sure = '0'; x.textContent = '×'; }, 2500);
                            return;
                        } if (editRemoveTake(s.sourceId, k))
                            mixSig = ''; });
                        r.appendChild(x);
                    }
                    takeRows.get(s.sourceId).push(r);
                    list.appendChild(r);
                });
                {
                    // one more take: the library's recordings like it come up on the map, each with "add as a take" (2026-11-13)
                    const add = el('button', 'addtake', '+ add a take');
                    add.title = 'recordings like it from the library, on the map: pick one and add it as a take';
                    // the same flow as the map's own "add a take" button (2026-11-13): one way in, one card
                    add.addEventListener('click', () => { if (!authoring) {
                        askToFork('add a take');
                        return;
                    } if (panel?.replace)
                        panel.replace(s.sourceId);
                    else {
                        panel?.suggest?.(true);
                        say('recordings like it are on the map: open one and add it as a take');
                    } });
                    list.appendChild(add);
                }
                // advanced: what it answers in the game, its gates, its script (folded; most never need it)
                if (st)
                    list.appendChild(advanced(`sound:${s.sourceId}`, 'advanced · everything it can do', body => mixTabs(i, st, s, body)));
                {
                    // delete the sound itself; the mix goes back up to the soundscape it was in
                    const del = el('div', 'delrow'), b = binBtn(s, () => { panel?.go?.(toScape ?? { soundscape: '' }); });
                    b.classList.add('wide');
                    b.append(el('span', undefined, 'delete this sound'));
                    del.appendChild(b);
                    list.appendChild(del);
                }
                // ── find another, steered (Codex's sound steering): say what should change, hear candidates (the gold rings
                // on the map), mark More like this / Less like this, another round, or make new ones by your marks ──
                if (sideFind?.sid === s.sourceId) {
                    section('find another', sideFind.words ? `“${sideFind.words}”` : undefined);
                    const wrap = el('div', 'satie-dt-card cthread sidefind');
                    const f0 = sideFind;
                    wrap.appendChild(findBlock(f0.m, [s.sourceId], { kind: 'words', text: s.name }, () => { if (sideFind !== f0)
                        return; panel?.suggestIds?.(f0.m.find?.candidates.map(c => c.sampleId).filter((x) => !!x) ?? null); mixSig = ''; paintMixSide(lastLevel); }, 'mix', f0.words));
                    if (f0.m.answered) {
                        sideFind = null;
                        panel?.suggestIds?.(null);
                    }
                    list.appendChild(wrap);
                }
                else {
                    const f = el('div', 'find');
                    f.append(el('span', 'fr'), el('span', 'ft', 'find another for it'));
                    const ask = el('input', 'fq');
                    ask.placeholder = 'what should change? (optional: drier, less metallic, a longer ring…)';
                    const go = el('button', 'fgo', 'find');
                    const start = () => { if (!authoring) {
                        askToFork('find another recording for it');
                        return;
                    } sideFind = { sid: s.sourceId, m: {}, words: ask.value.trim() || undefined }; record('mix_find', { sound: s.sourceId, words: !!sideFind.words }); mixSig = ''; paintMixSide(l); };
                    go.addEventListener('click', start);
                    ask.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter')
                        start(); });
                    const row = el('div', 'frow');
                    row.append(ask, go);
                    f.append(el('small', undefined, 'recordings from the library, then new ones made to your marks'), row);
                    list.appendChild(f);
                }
            }
        }
        mixSide.appendChild(list);
        list.scrollTop = keepTop;
        sideRebind();
        laneTick();
    }
    async function editHear(what) {
        // (spec 018) what you listen to on the map is part of what SATIE sees next turn
        if (what) {
            const nm = 'url' in what ? decodeURIComponent(what.url.split('?')[0].split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '') : (engine.scriptStatements.find(st => takeKeyAt(st, 0) === what.key) ? nameOf(engine.scriptStatements.find(st => takeKeyAt(st, 0) === what.key)) : '');
            if (nm) {
                mapHeard = [nm, ...mapHeard.filter(x => x !== nm)].slice(0, 8);
            }
        }
        const token = ++editHearToken;
        if (editHeard) {
            try {
                editHeard.src.stop();
            }
            catch { /* ended */ }
            editHeard = null;
            restScene();
        }
        if (!what)
            return false;
        stopPreview();
        let buf;
        try {
            buf = 'key' in what ? engine.getAudioBuffers().get(what.key) ?? (manifest[what.key]?.url ? await bufferFor(manifest[what.key].url) : null) : await bufferFor(what.url);
        }
        catch {
            buf = null;
        }
        if (!buf || token !== editHearToken)
            return false;
        const ctx = engine.audioContext;
        if (ctx.state === 'suspended')
            void ctx.resume();
        if (editOpen)
            silenceScene();
        else
            duckScene(null);
        // the whole take (up to a minute): a card's playhead runs its real length, it does not stop at 8 s (2026-11-13)
        const dur = Math.min(buf.duration, 60), start = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(start);
        src.stop(start + dur);
        editHeard = { src, token, start, dur };
        src.onended = () => { if (editHeard?.src === src) {
            editHeard = null;
            restScene();
        } };
        return true;
    }
    /** The edit panel's neighbours for a sound: the same audio search More like N uses (satie_find). */
    async function editNear(sourceId, limit) {
        limit = Math.max(1, Math.min(12, limit)); // satie_find's own cap
        const st = engine.scriptStatements.find(x => x.sourceId === sourceId);
        if (!st)
            return [];
        const entry = manifest[takeKeyAt(st, 0)];
        let start;
        if (entry?.sampleId)
            start = { kind: 'reference', sampleId: entry.sampleId };
        else {
            const buffer = engine.getAudioBuffers().get(takeKeyAt(st, 0));
            start = buffer ? { kind: 'audio', base64: await excerptBase64(buffer, 10), hint: nameOf(st) } : { kind: 'words', text: nameOf(st) };
        }
        try {
            const r = await fetch(findUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, loop: st.kind === 'loop', limit }) }).then(x => x.json());
            if (!r.ok || r.status === 'unavailable')
                return [];
            return (r.candidates ?? []).filter(c => !!c.sampleId).map(c => ({ url: c.url, name: c.name, ...(c.license ? { license: c.license } : {}), sampleId: c.sampleId }));
        }
        catch {
            return [];
        }
    }
    /** The library's recordings for some words (satie_find; free): the mix's add mode searches with it. */
    async function editSearch(text, limit) {
        try {
            const r = await fetch(findUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: { kind: 'words', text }, loop: false, limit: Math.max(1, Math.min(12, limit)) }) }).then(x => x.json());
            if (!r.ok || r.status === 'unavailable')
                return [];
            return (r.candidates ?? []).filter(c => !!c.sampleId).map(c => ({ url: c.url, name: c.name, ...(c.license ? { license: c.license } : {}), sampleId: c.sampleId }));
        }
        catch {
            return [];
        }
    }
    async function editSetTake(sourceId, rec, k) {
        const i = engine.scriptStatements.findIndex(st => st.sourceId === sourceId), st = engine.scriptStatements[i];
        if (!st)
            return false;
        const entry = { url: rec.url, name: rec.name, source: 'library', ...(rec.license ? { license: rec.license } : {}), ...(rec.sampleId ? { sampleId: rec.sampleId } : {}) };
        if (k !== undefined) {
            await replaceTake(st, takeKeyAt(st, k), entry, `${word('take')} ${k + 1}`);
            return true;
        }
        const n = (st.isGenerated ? Math.max(1, st.variants) : 1) + 1;
        const next = upsertVoiceProperty(script, voiceLocatorFor(st, engine.scriptStatements), 'variants', String(n));
        if (!next || !applyScript(next, `${nameOf(st)}: a ${word('take')} you chose`, { kind: 'add_take', detail: { voice: voiceContext(i), from: { ...entry } } }))
            return false;
        const ns = engine.scriptStatements[i];
        if (ns)
            await replaceTake(ns, takeClipPath(ns, n - 1), entry, `${word('take')} ${n}`);
        return true;
    }
    function editRemoveTake(sourceId, k) {
        const i = engine.scriptStatements.findIndex(st => st.sourceId === sourceId), st = engine.scriptStatements[i];
        if (!st)
            return false;
        const n = st.isGenerated ? Math.max(1, st.variants) : 1;
        if (n <= 1)
            return false;
        removeTake(i, st, Array.from({ length: n }, (_, j) => takeKeyAt(st, j)), k);
        return true;
    }
    /**
     * A published scene (Explore on satie.world: the field studies, the game worlds, a piece at /s/:id) is
     * for listening and looking. Any change, a Volume move included, asks for your own copy first
     * (Huanxing, 2026-11-07: "go get a copy and edit properly on your own account"): the control does not
     * move and nothing is heard. Play, mute and solo, opening a sound's card, its folds and "go there"
     * stay free. `applyScript` refuses too, as the backstop for anything this misses.
     */
    let forkAsk = null;
    function askToFork(what) {
        record('fork_prompt', { what: what.slice(0, 80) });
        if (forkAsk?.isConnected) {
            forkAsk.querySelector('.pri, .link')?.focus();
            return;
        }
        const box = el('div', 'satie-dt-forkask');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'false');
        box.setAttribute('aria-label', 'Make your own copy');
        box.append(el('div', 'ft', 'Make your own copy to change this'), el('div', 'fd', 'This is the published scene: listen, look around, open any sound. To change how it sounds, fork it into a copy of your own and edit it there.'));
        if (opts.fork?.detail)
            box.appendChild(el('div', 'fd', opts.fork.detail));
        const acts = el('div', 'fa');
        const close = () => { box.remove(); forkAsk = null; removeEventListener('keydown', onKey, true); };
        const onKey = (e) => { if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        } };
        if (opts.fork) {
            const go = el(opts.fork.href ? 'a' : 'button', 'pri', opts.fork.label);
            if (go instanceof HTMLAnchorElement) {
                go.href = opts.fork.href;
                go.target = '_blank';
                go.rel = 'noopener';
            }
            go.addEventListener('click', () => { record('fork', { label: opts.fork.label, via: 'change' }); close(); opts.fork.onFork?.(script, false); });
            acts.appendChild(go);
        }
        const keep = el('button', 'link', 'Keep listening');
        keep.addEventListener('click', close);
        acts.appendChild(keep);
        box.appendChild(acts);
        // (2026-11-13) and a plain way out, top right
        const x = el('button', 'fx', '×');
        x.title = 'close';
        x.setAttribute('aria-label', 'close');
        x.addEventListener('click', close);
        box.appendChild(x);
        addEventListener('keydown', onKey, true);
        root.appendChild(box);
        forkAsk = box;
        requestAnimationFrame(() => box.querySelector('.pri, .link')?.focus());
    }
    if (!authoring) {
        /** The control this event would change the scene through, or null for one that only looks or listens. */
        const changeControl = (t) => {
            const x = t instanceof Element ? t.closest('input, textarea, select, button') : null;
            if (!x || x.closest('.satie-dt-forkask, .satie-dt-chat, .satie-dt-tools'))
                return null;
            // a sound's card: everything changes it except Play, closing it and moving between cards
            if (x.closest('.satie-dt-inspector'))
                return x.matches('.ih .x, .clb, [data-nav]') ? null : x;
            // the list and the script: its faders and the text are the scene
            if (x.matches('input[type=range], textarea, input[type=text], select'))
                return x;
            return null;
        };
        const nameOfControl = (x) => x.getAttribute('aria-label') ?? x.closest('[data-dial]')?.getAttribute('data-dial') ?? (x.textContent ?? x.tagName).trim();
        const grab = (e) => {
            const x = changeControl(e.target);
            if (!x || x.tagName === 'BUTTON')
                return;
            e.preventDefault();
            e.stopPropagation();
            if (e.type === 'pointerdown')
                askToFork(nameOfControl(x));
        };
        for (const type of ['pointerdown', 'mousedown', 'touchstart'])
            root.addEventListener(type, grab, { capture: true, passive: false });
        root.addEventListener('click', e => {
            const x = changeControl(e.target);
            if (!x)
                return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (x.tagName === 'BUTTON')
                askToFork(nameOfControl(x));
        }, true);
        root.addEventListener('keydown', e => {
            const x = changeControl(e.target);
            if (!x || e.key === 'Tab' || e.key === 'Escape' || e.metaKey || e.ctrlKey)
                return;
            if (x.tagName === 'BUTTON' && e.key !== 'Enter' && e.key !== ' ')
                return;
            e.preventDefault();
            e.stopPropagation();
            askToFork(nameOfControl(x));
        }, true);
        // a value that moved anyway (a screen reader's own increment) is not heard and not kept
        for (const type of ['input', 'change'])
            root.addEventListener(type, e => { if (changeControl(e.target))
                e.stopImmediatePropagation(); }, true);
    }
    root.addEventListener('keydown', event => {
        const shortcut = event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && /^[zy]$/i.test(event.key));
        const field = event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]');
        if (field || shortcut || event.key === 'Enter' || event.key === ' ')
            event.stopPropagation();
        if (shortcut)
            onKey(event);
    });
    let view = 'mixer';
    const tabBtns = new Map();
    // 'compare' (a blind before/after A/B for training data) stays in the code, off the tab bar
    // the conversation has its own tab (as on the SATIE platform): it gets the panel's full height, and the
    // mixer's live list never jostles it; what you select in the mixer still rides into it as chips
    // the log is ours, not the developer's (2026-11-12): kept, off the tab bar unless localStorage satie-dt-log is 1
    let showLog = false;
    try {
        showLog = localStorage.getItem('satie-dt-log') === '1';
    }
    catch { /* private mode */ }
    for (const v of ['mixer', 'history', 'script', ...(showLog ? ['log'] : [])]) {
        const b = el('button', undefined, v);
        b.addEventListener('click', () => { view = v; render(); });
        tabs.appendChild(b);
        tabBtns.set(v, b);
    }
    // The floor reflection is the one rendering choice worth an A/B while
    // listening: it is a comb filter on every grounded voice, by design.
    const ground = el('button', 'satie-dt-ground', '');
    const syncGround = () => { ground.textContent = `ground reflection ${engine.groundReflection ? 'on' : 'off'}`; ground.dataset.on = engine.groundReflection ? '1' : '0'; };
    ground.addEventListener('click', () => { engine.setGroundReflection(!engine.groundReflection); syncGround(); record('ground_reflection', { on: engine.groundReflection }); });
    syncGround();
    // a listening comparison, not an edit: it lives with the log (what the engine is doing), not the tabs
    const groundRow = el('div', 'satie-dt-groundrow');
    groundRow.append(ground, el('span', undefined, 'an echo off the floor on sounds near the ground; switch to compare'));
    // ── state: the script text and the samples manifest are the two documents ──
    let script = '';
    let baselineScript = '';
    let manifest = {};
    let dirty = false;
    let destroyed = false;
    let documentsReady = false;
    let documentVersion = 0;
    let recorder = null;
    let pinnedTake = null;
    let comparison = null;
    const status = el('span', 'st', '');
    const say = (t) => { status.textContent = t; };
    // Capture starts only after both documents load, never from an empty/late baseline.
    root.inert = true;
    const initialVersion = documentVersion;
    // settles when the documents have loaded (or failed to): what reads the script's text at start-up waits for it
    const documentsLoaded = Promise.all([
        opts.documents ? Promise.resolve(opts.documents.script) : scriptUrl ? fetch(scriptUrl).then(r => { if (!r.ok)
            throw new Error(`script: HTTP ${r.status}`); return r.text(); }) : Promise.resolve(''),
        opts.documents ? Promise.resolve(opts.documents.samples) : samplesUrl ? fetch(samplesUrl).then(r => { if (!r.ok)
            throw new Error(`samples: HTTP ${r.status}`); return r.json(); }) : Promise.resolve({}),
        loadSavedHistory(),
    ]).then(([text, samples, savedHistory]) => {
        if (destroyed)
            return;
        baselineScript = text;
        if (documentVersion === initialVersion) {
            script = text;
            if (opts.localStorageKey && authoring && !opts.documents) {
                try {
                    const saved = localStorage.getItem(opts.localStorageKey);
                    if (saved && tryParse(saved).statements) {
                        engine.loadScript(saved);
                        script = saved;
                    }
                }
                catch {
                    say('Saved mix unavailable; using the original mix.');
                }
            }
        }
        manifest = samples ?? {};
        documentsReady = true;
        root.inert = false;
        // the mix opens placed: where every sound sits on the library map is asked in the background, once the takes load
        if (opts.editPanel?.warm)
            setTimeout(() => { if (!destroyed && !editOpen)
                opts.editPanel.warm({ sounds: editSounds, near: editNear, soundscapes: () => api.soundscapes() }); }, 1500);
        void fillFromOffered();
        if (eventUrl && scriptUrl)
            recorder = new EditRecorder({ sessionId: crypto.randomUUID(), scriptPath: scriptUrl,
                send: async (event) => {
                    const response = await fetch(eventUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) });
                    if (!response.ok)
                        throw new Error(`Edit log: HTTP ${response.status}`);
                }, onError: say });
        resumeHistory(savedHistory);
        watchOutside();
        void refreshTasks(true);
        comeBack();
        downloadEdits.disabled = !recorder;
        record('start', { resumed: tree.nodes.length > 1 ? tree.nodes.length : 0 });
        render();
    }).catch(error => { if (!destroyed) {
        root.inert = false;
        say(`Editor documents not loaded: ${String(error)}`);
    } });
    /**
     * The edit log: what a human changed about what the council wrote, as
     * events with the voice's context — the raw material the authoring model
     * learns from (see docs/wiki/api/mcp.md, "Learning from edits").
     */
    function record(kind, detail, changes) {
        if (!documentsReady || destroyed || !recorder)
            return false;
        const head = tree.head;
        return recorder.record(kind, snapshotNow(), detail, { ...(changes ? { changes } : {}), ...(head ? { node: { id: head.id, parentId: head.parentId } } : {}) });
    }
    const offers = new Map();
    function logOffer(where, context, items) {
        const id = Math.random().toString(36).slice(2, 10);
        offers.set(id, { settled: false });
        record('offer', { offer: id, where, ...context, items });
        return id;
    }
    function logListen(offer, key, ms) { if (offer)
        record('listen', { offer, key, ms }); }
    function logOutcome(offer, outcome, key) {
        const o = offer ? offers.get(offer) : undefined;
        if (!offer || !o || o.settled)
            return;
        o.settled = true;
        record('outcome', { offer, outcome, ...(key ? { key } : {}) });
    }
    function snapshotNow() {
        let observedContext;
        let contextStatus = 'not-configured';
        if (opts.context) {
            try {
                observedContext = structuredClone(opts.context());
                contextStatus = observedContext ? 'captured' : 'unavailable';
            }
            catch {
                contextStatus = 'unavailable';
            }
        }
        return { script, contextStatus, ...(observedContext ? { observedContext } : {}),
            assets: Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)).map(([clipPath, entry]) => ({ clipPath,
                sampleId: entry.sampleId, ...loadedIdentity(clipPath), license: entry.license, attribution: entry.attribution })),
            editor: { volumeOverrides: [...gainOf].map(([statementIndex, value]) => ({ statementIndex, value })),
                muted: [...engine.mutedIndices], soloed: [...engine.soloedIndices], groundReflection: engine.groundReflection } };
    }
    function loadedIdentity(clipPath) {
        const buffer = engine.getAudioBuffers().get(clipPath);
        const sha256 = buffer && engine.getAudioAssetHash(buffer);
        return sha256 ? { sha256, hashEvidence: 'loaded-bytes' } : {};
    }
    const voiceContext = (i) => {
        const st = engine.scriptStatements[i];
        return st ? { statementIndex: i, kind: st.kind, clip: st.clip, prompt: st.genPrompt, host: st.hostRef, event: st.eventName, zones: st.zones, spl: st.spl.isNull ? null : [st.spl.min, st.spl.max], source: manifest[pathFor(st.clip)] ?? null } : { statementIndex: i };
    };
    const unloadable = whyUnloadable;
    /**
     * A version's title, from what it did (the same words for every surface that made it): the sound
     * by its name, then the change ("shrine bell: level 87 → 123", "crows: a different sound",
     * "added dog barks"). SATIE's changes say so. Without a typed change (a rename), the caller's note.
     */
    function versionTitle(note, kind, changes) {
        const by = kind?.startsWith('chat') ? 'SATIE · ' : '';
        if (!changes.length)
            return note;
        const nameFor = (c) => {
            const st = engine.scriptStatements.find(x => (c.voice.sourceId && x.sourceId === c.voice.sourceId) || x.sourceLine === c.voice.line);
            return st && c.change !== 'remove' ? nameOf(st) : shortName({ isGenerated: !/^community\//.test(c.voice.sound) && !/^[\w/-]+$/.test(c.voice.sound), genPrompt: c.voice.sound, clip: c.voice.sound });
        };
        const what = (c) => {
            if (c.change === 'add' || c.change === 'remove')
                return c.change === 'add' ? 'added' : 'removed';
            if (c.change === 'source' || !('prop' in c))
                return 'a different sound';
            const prop = c.prop === 'spl' ? 'level' : c.prop.replace(/_/g, ' ');
            return c.change === 'unset' ? `${prop} ${c.from ?? ''} removed`.replace(/\s+/g, ' ') : `${prop} ${c.from ?? '(none)'} → ${c.to}`;
        };
        const perVoice = new Map();
        for (const c of changes) {
            const k = c.voice.sourceId ?? `${c.voice.line}`;
            perVoice.set(k, [...(perVoice.get(k) ?? []), c]);
        }
        if (perVoice.size === 1) {
            const cs = [...perVoice.values()][0];
            const n = nameFor(cs[0]);
            if (cs[0].change === 'add' || cs[0].change === 'remove')
                return `${by}${what(cs[0])} ${n}`;
            return `${by}${n}: ${cs.slice(0, 2).map(what).join(', ')}${cs.length > 2 ? ` +${cs.length - 2}` : ''}`;
        }
        const names = [...perVoice.values()].map(cs => nameFor(cs[0]));
        const adds = changes.filter(c => c.change === 'add').length, removes = changes.filter(c => c.change === 'remove').length;
        const verb = adds && !removes && adds === perVoice.size ? 'added' : removes && !adds && removes === perVoice.size ? 'removed' : `${perVoice.size} sounds:`;
        return `${by}${verb} ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
    }
    function applyScript(next, note, edit) {
        if (!documentsReady || destroyed) {
            say('Wait for the editor documents to load.');
            return false;
        }
        if (!authoring) {
            if (next !== script)
                askToFork(note);
            return false;
        }
        // Never write what the runtime will not load: the game's loader identifies sources by a clean
        // parse (SourceIdentity), so one parser warning saved to disk silences the whole scene on reload.
        const refused = unloadable(next, script);
        if (refused) {
            record('edit_refused', { note, reason: refused });
            say(`not applied: ${refused}`);
            return false;
        }
        try {
            const before = script;
            engine.loadScript(next);
            script = next;
            documentVersion++;
            dirty = true;
            editor.value = next;
            gainOf.clear(); // loadScript reparses volumes; index-based overrides no longer describe the loaded document.
            say(`${note} · unsaved`);
            const sources = edit?.kind === 'level_trim' ? edit.detail.sourceIds : undefined;
            // the snapshot is what the scene became; `changes` is what this edit did to it, per voice
            const described = describeVoiceChanges(before, next);
            commitHistory(versionTitle(note, edit?.kind, described?.changes ?? []), edit?.kind ?? 'script_edit', sources ? `level:${sources.join(',')}` : null);
            record(edit?.kind ?? 'script_edit', { note, ...(edit?.detail ?? {}), ...(described?.truncated ? { changesTruncated: described.truncated } : {}) }, described?.changes);
            scheduleSave();
            buildMixer();
            return true;
        }
        catch (e) {
            record('edit_failed', { error: e instanceof Error ? e.message : String(e) });
            say(`parse error: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }
    /**
     * Fader positions are runtime state until saved: bake every moved fader into
     * its voice as `volume` (1.0 removes the line) so the saved script plays the
     * mix the person heard. Mateo's first two scenes lost every fader move to
     * this gap (2026-09-08).
     */
    function bakeFaders(text) {
        let out = text;
        for (const [i, v] of gainOf) {
            const loc = locatorFor(i);
            if (!loc)
                continue;
            const next = Math.abs(v - 1) < 0.005 ? removeVoiceProperty(out, loc, 'volume') : upsertVoiceProperty(out, loc, 'volume', String(Math.round(v * 100) / 100));
            if (next)
                out = next;
        }
        return out;
    }
    /** Autosave: every change writes itself a moment later; the history tab is the way back. */
    let saveTimer;
    let savePending = false;
    function scheduleSave() {
        opts.onDocumentChange?.({ script: bakeFaders(script), samples: structuredClone(manifest) });
        clearTimeout(saveTimer);
        if (!scriptUrl && !opts.localStorageKey)
            return;
        say('saving…');
        savePending = true;
        saveTimer = setTimeout(() => { void save(); }, 900);
    }
    /**
     * Leaving the page inside the autosave delay would drop the last edit (a reload 0.3 s after a
     * fader move lost it): send what is pending now, as a beacon the browser delivers after unload.
     */
    function flushOnLeave() {
        if (!documentsReady || destroyed)
            return;
        if (historyPending) {
            clearTimeout(historyTimer);
            void saveHistory(true);
        }
        if (!savePending)
            return;
        clearTimeout(saveTimer);
        savePending = false;
        if (opts.localStorageKey || !scriptUrl) {
            void save();
            return;
        }
        const text = bakeFaders(script);
        const beacon = (path, body) => navigator.sendBeacon?.(saveUrl, new Blob([JSON.stringify({ path, text: body })], { type: 'application/json' })) ?? false;
        const sent = beacon(scriptUrl, text) && (!samplesUrl || beacon(samplesUrl, JSON.stringify(manifest, null, 1)));
        record(sent ? 'save_on_leave' : 'save_failed', sent ? {} : { error: 'the page closed before the edit could be sent' });
    }
    const onHide = () => { if (document.visibilityState === 'hidden')
        flushOnLeave(); };
    addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', onHide);
    async function save() {
        savePending = false;
        if (!documentsReady || destroyed) {
            say('Wait for the editor documents to load.');
            return;
        }
        script = bakeFaders(script);
        documentVersion++;
        const saveVersion = documentVersion;
        const savedScript = script, savedManifest = JSON.stringify(manifest, null, 1);
        record('save_requested', {});
        if (view === 'script')
            editor.value = script;
        if (opts.localStorageKey) {
            try {
                localStorage.setItem(opts.localStorageKey, savedScript);
                dirty = false;
                say('saved on this device');
            }
            catch {
                say('Could not save on this device. Browser storage may be full or disabled.');
            }
            return;
        }
        if (!scriptUrl) {
            await navigator.clipboard?.writeText(script);
            say('copied the script (no script url to save to)');
            return;
        }
        try {
            const a = await fetch(saveUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: scriptUrl, text: savedScript }) }).then(r => r.json());
            let b = { ok: true };
            if (samplesUrl)
                b = await fetch(saveUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: samplesUrl, text: savedManifest }) }).then(r => r.json());
            // the dev server copied online-only sounds into the project: adopt their local addresses
            // (the buffers are the same bytes, already loaded), so the next save has nothing to fetch
            if (b.samples)
                for (const k of b.vendored ?? []) {
                    if (b.samples[k] && manifest[k]?.url !== b.samples[k].url)
                        manifest[k] = b.samples[k];
                }
            if (b.failed?.length)
                say(`${b.failed.length} sound${b.failed.length === 1 ? '' : 's'} could not be copied into the project and still play from SATIE's storage`);
            if (destroyed)
                return;
            if (a.ok && b.ok) {
                if (documentVersion === saveVersion) {
                    dirty = false;
                    record('save', {});
                    say(`saved · ${new Date().toTimeString().slice(0, 5)}`);
                }
                else {
                    record('save_stale', {});
                    say('Saved an earlier revision; newer edits are still unsaved.');
                }
            }
            else {
                record('save_failed', { error: a.error ?? b.error ?? 'unknown' });
                saveBtn.hidden = false;
                say(`not saved: ${a.error ?? b.error ?? 'unknown'} (is the satie vite plugin on?)`);
            }
        }
        catch (error) {
            record('save_failed', { error: String(error) });
            saveBtn.hidden = false;
            say('not saved: no dev server to write to');
        }
    }
    // ── history: the web app's version tree, for the mixer (HistoryTree.ts) ──
    // The state is the script text plus the runtime mix (mute, solo, trims). It persists beside the
    // edit logs (or on this device), so a reload resumes where you were instead of starting over.
    // each page load is a session: history groups its steps by it
    const historySession = Date.now().toString(36);
    const tree = new HistoryTree({ session: historySession });
    // the samples manifest is part of a version: a take swapped without a script change goes back too
    const samplesText = () => JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))));
    const snapNow = () => ({ script, muted: [...engine.mutedIndices], soloed: [...engine.soloedIndices], samples: samplesText() });
    /** Put a version's samples back: changed entries load, entries it did not have are taken out. */
    async function restoreSamples(text) {
        if (text === undefined || text === samplesText())
            return;
        let want;
        try {
            want = JSON.parse(text);
        }
        catch {
            return;
        }
        for (const key of Object.keys(manifest))
            if (!(key in want))
                dropTake(key);
        let failed = 0;
        await Promise.all(Object.entries(want).map(async ([key, entry]) => {
            if (manifest[key]?.url === entry.url && engine.getAudioBuffers().has(key)) {
                manifest[key] = entry;
                return;
            }
            try {
                engine.setAudioBuffer(key, await bufferFor(entry.url));
                manifest[key] = entry;
            }
            catch {
                failed++;
            }
        }));
        if (failed)
            say(`${count(failed, 'take')} of that ${word('change')} could not load`);
    }
    const nodeById = (id) => tree.byId(id);
    const childrenOf = (id) => tree.childrenOf(id);
    async function loadSavedHistory() {
        try {
            if (historyKey) {
                const t = localStorage.getItem(historyKey);
                return t ? JSON.parse(t) : null;
            }
            if (!historyUrl || !scriptUrl)
                return null;
            const r = await fetch(`${historyUrl}?path=${encodeURIComponent(scriptUrl)}`);
            return r.ok ? (await r.json()).history ?? null : null;
        }
        catch {
            return null;
        }
    }
    /** Resume the saved tree; if the file changed since (an agent, another editor), that change is a version of its own. */
    function resumeHistory(saved) {
        const path = scriptUrl ?? historyKey ?? 'local';
        if (saved && tree.load(saved, path)) {
            const at = tree.nodes.find(n => n.id === tree.headId && n.snap.script === script)
                ?? [...tree.nodes].reverse().find(n => n.snap.script === script);
            if (at)
                tree.headId = at.id;
            else
                tree.add('changed outside the mixer', 'external', null, snapNow());
            return;
        }
        tree.add('as composed', 'start', null, snapNow());
    }
    let historyTimer;
    let historyPending = false;
    function scheduleHistorySave() {
        clearTimeout(historyTimer);
        if (!documentsReady || destroyed)
            return;
        historyPending = true;
        historyTimer = setTimeout(() => { void saveHistory(); }, 1500);
    }
    async function saveHistory(keepalive = false) {
        historyPending = false;
        const file = tree.toFile(scriptUrl ?? historyKey ?? 'local');
        try {
            if (historyKey) {
                localStorage.setItem(historyKey, JSON.stringify(file));
                return;
            }
            if (!historyUrl || !scriptUrl)
                return;
            const body = JSON.stringify({ history: file });
            // a page being closed can only send a small body; a larger tree was already saved by the debounce
            const r = await fetch(historyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < 60_000 });
            if (!r.ok)
                say('history not saved to disk (is the satie vite plugin on?)');
        }
        catch {
            say('history not saved to disk');
        }
    }
    /**
     * Mute and solo: a run of them is one version, named by what it did from where it began
     * ("muted the vending machine hum, solo on tree frogs"), and none when it ends where it began.
     */
    /**
     * Muted is either: the mixer's own (this session's mix) or a `mute` line in the script (saved, so the sound is
     * never built). The mixer shows both the same; unmuting one the script mutes takes the line out (one change).
     */
    const isMuted = (i) => engine.mutedIndices.has(i) || !!engine.scriptStatements[i]?.mute;
    function setMuted(idx, on) {
        const stmts = engine.scriptStatements;
        let next = script;
        const freed = [];
        for (const i of idx) {
            if (on) {
                if (!isMuted(i))
                    engine.toggleMute(i);
                continue;
            }
            if (engine.mutedIndices.has(i))
                engine.toggleMute(i);
            const st = stmts[i];
            if (st?.mute) {
                const n2 = removeVoiceProperty(next, voiceLocatorFor(st, stmts), 'mute');
                if (n2) {
                    next = n2;
                    freed.push(nameOf(st));
                }
            }
        }
        if (next !== script)
            applyScript(next, `unmuted ${freed.slice(0, 2).join(', ')}${freed.length > 2 ? ` +${freed.length - 2}` : ''} (the script had muted ${freed.length === 1 ? 'it' : 'them'})`, { kind: 'unmute', detail: { voices: freed } });
    }
    function commitMix() {
        if (!documentsReady)
            return;
        const sameMix = (a, b) => a.script === b.script && a.samples === b.samples && [...a.muted].sort().join() === [...b.muted].sort().join() && [...a.soloed].sort().join() === [...b.soloed].sort().join();
        tree.commitRun('mix', snapNow(), from => mixLabel(from, snapNow()), sameMix);
        scheduleHistorySave();
        if (view === 'history')
            buildHistory();
    }
    function mixLabel(from, to) {
        const stmts = engine.scriptStatements, nm = (i) => (stmts[i] ? nameOf(stmts[i]) : `sound ${i + 1}`);
        const list = (ids) => ids.length > 2 ? `${ids.slice(0, 2).map(nm).join(', ')} +${ids.length - 2}` : ids.map(nm).join(', ');
        const diff = (a, b) => b.filter(i => !a.includes(i));
        const parts = [
            [diff(from.muted, to.muted), 'muted'], [diff(to.muted, from.muted), 'unmuted'],
            [diff(from.soloed, to.soloed), 'solo on'], [diff(to.soloed, from.soloed), 'solo off'],
        ].filter(([ids]) => ids.length).map(([ids, verb]) => ids.length === stmts.length ? `${verb} everything` : `${verb} ${list(ids)}`);
        return parts.join(' · ') || 'mix';
    }
    function commitHistory(label, kind, key = null) {
        if (!documentsReady)
            return;
        tree.commit(label, kind, key, snapNow());
        scheduleHistorySave();
        if (view === 'history')
            buildHistory();
    }
    function moveHead(id) {
        const n = nodeById(id);
        if (!n || id === tree.headId)
            return;
        try {
            engine.loadScript(n.snap.script);
        }
        catch (e) {
            say(`could not restore: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        tree.headId = id;
        scheduleHistorySave();
        script = n.snap.script;
        editor.value = script;
        documentVersion++;
        dirty = true;
        gainOf.clear();
        const muted = new Set(n.snap.muted);
        engine.scriptStatements.forEach((_, i) => { if (engine.mutedIndices.has(i) !== muted.has(i))
            engine.toggleMute(i); });
        engine.setSoloIndices(n.snap.soloed);
        record('history_move', { to: n.label, kind: n.kind });
        void restoreSamples(n.snap.samples).then(() => { scheduleSave(); if (view === 'mixer')
            buildMixer(); });
        scheduleSave();
        if (view === 'history')
            buildHistory();
        else
            render();
    }
    const undo = () => { const h = nodeById(tree.headId); if (h?.parentId)
        openVersion(h.parentId); };
    const redo = () => { const kids = childrenOf(tree.headId); if (kids.length)
        moveHead(kids[kids.length - 1].id); };
    /** Lines added and removed from the parent's script (the web app's +n −m). */
    function lineDiff(a, b) {
        const count = (t) => { const m = new Map(); for (const l of t.split('\n'))
            if (l.trim())
                m.set(l, (m.get(l) ?? 0) + 1); return m; };
        const A = count(a), B = count(b);
        let added = 0, removed = 0;
        for (const [l, n] of B)
            added += Math.max(0, n - (A.get(l) ?? 0));
        for (const [l, n] of A)
            removed += Math.max(0, n - (B.get(l) ?? 0));
        return { added, removed };
    }
    // History, the way SATIE web shows it (HistoryPanel.tsx): the spine you are hearing, newest first;
    // the versions you left fold under the version you left from; click selects, double-click opens.
    let histSelected = null;
    const histDiffs = new Set();
    /** A version's script change, per sound: its lines with + and −, one line of context around them. */
    function versionDiff(a, b) {
        const box = el('div', 'hdiff');
        const changes = describeVoiceChanges(a, b)?.changes ?? [];
        const ids = [...new Set(changes.map(c => c.voice.sourceId).filter((x) => !!x))];
        const blocks = ids.length
            ? ids.slice(0, 8).map(id => {
                const st = (tryParse(b).statements ?? []).find(x => x.sourceId === id) ?? (tryParse(a).statements ?? []).find(x => x.sourceId === id);
                return { title: st ? nameOf(st) : id, d: diffLines2(blockOf(a, id)?.lines ?? [], blockOf(b, id)?.lines ?? []) };
            })
            : [{ title: 'script', d: diffLines2(a.split('\n'), b.split('\n')) }];
        for (const { title, d } of blocks) {
            box.appendChild(el('div', 'hdn', title));
            const show = d.map((x, k) => x.t !== ' ' || (d[k - 1] && d[k - 1].t !== ' ') || (d[k + 1] && d[k + 1].t !== ' '));
            d.forEach((x, k) => { if (show[k]) {
                const ln = el('div', `dl ${x.t === '+' ? 'add' : x.t === '-' ? 'del' : ''}`);
                ln.textContent = `${x.t} ${x.s}`;
                box.appendChild(ln);
            } });
        }
        box.addEventListener('click', e => e.stopPropagation());
        return box;
    }
    const openBranches = new Set();
    let wentBack = null;
    function buildHistory() {
        const spineIds = [];
        for (let n = nodeById(tree.headId); n; n = nodeById(n.parentId))
            spineIds.push(n.id);
        const onSpine = new Set(spineIds);
        const rowsNewest = spineIds.map(id => nodeById(id));
        const hasKids = new Set(tree.nodes.map(n => n.parentId).filter((id) => !!id));
        // tips of branches you left, folded under the spine version they departed from
        const branchesAt = new Map();
        for (const tip of tree.nodes) {
            if (onSpine.has(tip.id) || hasKids.has(tip.id))
                continue;
            let from = nodeById(tip.parentId);
            while (from && !onSpine.has(from.id))
                from = nodeById(from.parentId);
            if (from)
                branchesAt.set(from.id, [...(branchesAt.get(from.id) ?? []), tip]);
        }
        const wrap = el('div', 'satie-dt-hist');
        const row = (n, isHead, faded = false) => {
            const r = el('div', 'hrow');
            r.dataset.sel = histSelected === n.id ? '1' : '0';
            if (faded)
                r.dataset.faded = '1';
            r.tabIndex = 0;
            const parent = nodeById(n.parentId);
            const d = parent ? lineDiff(parent.snap.script, n.snap.script) : null;
            const text = el('span', 'tx');
            const top = el('span', 'l');
            if (isHead)
                top.appendChild(el('span', 'now', 'now · '));
            top.appendChild(document.createTextNode(n.label));
            const sub = el('span', 'd mono');
            let diffEl = null;
            if (!parent)
                sub.textContent = 'start';
            else if (d && (d.added || d.removed)) {
                // the script change, collapsed until asked for (the way a code review shows a file)
                const open = histDiffs.has(n.id);
                const t = el('button', 'dtog', open ? '▾ ' : '▸ ');
                if (d.added)
                    t.appendChild(el('span', 'add', `+${d.added}`));
                if (d.added && d.removed)
                    t.appendChild(document.createTextNode(' '));
                if (d.removed)
                    t.appendChild(el('span', 'rem', `−${d.removed}`));
                t.title = open ? 'hide the script change' : 'show the script change';
                t.addEventListener('click', e => { e.stopPropagation(); if (!histDiffs.delete(n.id))
                    histDiffs.add(n.id); buildHistory(); });
                sub.appendChild(t);
                if (open)
                    diffEl = versionDiff(parent.snap.script, n.snap.script);
            }
            else if (parent.snap.script !== n.snap.script)
                sub.textContent = 'same lines, different values';
            else if ((parent.snap.samples ?? '') !== (n.snap.samples ?? ''))
                sub.textContent = 'sounds only (which take plays)';
            else
                sub.textContent = 'mix only (mute, solo)';
            text.append(top, sub);
            if (diffEl)
                text.appendChild(diffEl);
            const when = new Date(n.at);
            r.append(el('span', 'dot', isHead ? '●' : '○'), text, el('span', 'src', n.kind === 'start' ? 'START' : makerOf(n.kind)), el('span', 't mono', `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`));
            r.addEventListener('click', () => { histSelected = histSelected === n.id ? null : n.id; buildHistory(); });
            r.addEventListener('dblclick', () => openVersion(n.id));
            if (!isHead) {
                const back = el('button', 'hgo', 'go back to this');
                back.title = 'hear the scene as it was here; editing from it branches, nothing is lost';
                back.addEventListener('click', e => { e.stopPropagation(); openVersion(n.id); });
                r.appendChild(back);
            }
            r.addEventListener('keydown', e => { if (e.key === 'Enter')
                openVersion(n.id); });
            return r;
        };
        // grouped by session (each page load), newest first; older files kept no session
        const firstAt = new Map();
        for (const n of tree.nodes) {
            const k = n.session ?? '';
            firstAt.set(k, Math.min(firstAt.get(k) ?? Infinity, n.at));
        }
        const sessionName = (k) => {
            if (k === historySession)
                return 'this session';
            if (!k)
                return 'earlier';
            const d = new Date(firstAt.get(k) ?? 0);
            return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        let lastSession = null;
        rowsNewest.forEach((n, k) => {
            if ((n.session ?? '') !== lastSession) {
                lastSession = n.session ?? '';
                if (firstAt.size > 1)
                    wrap.appendChild(el('div', 'hsess', sessionName(lastSession)));
            }
            wrap.appendChild(row(n, n.id === tree.headId));
            const tips = branchesAt.get(n.id) ?? [];
            if (tips.length) {
                const fold = el('div', 'fold');
                const t = el('button', 'ft', `${openBranches.has(n.id) ? '▾' : '▸'} ${count(tips.length, 'change')} you left from here`);
                t.addEventListener('click', () => { if (!openBranches.delete(n.id))
                    openBranches.add(n.id); buildHistory(); });
                fold.appendChild(t);
                if (openBranches.has(n.id))
                    for (const tip of tips) {
                        const line = el('div', 'tip');
                        const forget = el('button', 'fg', 'forget');
                        forget.title = 'forget this branch';
                        forget.addEventListener('click', () => { forgetBranch(tip.id); buildHistory(); });
                        line.append(row(tip, false, true), forget);
                        fold.appendChild(line);
                    }
                wrap.appendChild(fold);
            }
            if (k < rowsNewest.length - 1)
                wrap.appendChild(el('div', 'link'));
        });
        const acts = el('div', 'acts');
        const u = el('button', undefined, 'undo'), rd = el('button', undefined, 'redo');
        u.disabled = !nodeById(tree.headId)?.parentId;
        rd.disabled = !childrenOf(tree.headId).length;
        u.addEventListener('click', undo);
        rd.addEventListener('click', redo);
        acts.append(u, rd, el('span', 'hint', `⌘Z · ⇧⌘Z · or "go back to this" on any ${word('change')}`));
        wrap.prepend(acts);
        // Going back IS the correction: the one moment worth an (optional) question.
        if (wentBack) {
            const wb = wentBack;
            const box = el('div', 'back');
            const input = el('input');
            input.type = 'text';
            input.placeholder = `why not "${wb.from.label.slice(0, 40)}"? (optional)`;
            input.setAttribute('aria-label', 'Why you went back');
            input.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    wentBack = null;
                    buildHistory();
                }
                if (e.key !== 'Enter' || !input.value.trim())
                    return;
                record('went_back', { from: wb.from.label, to: wb.to.label, reason: input.value.trim() });
                wentBack = null;
                say('kept your reason in the local edit log');
                buildHistory();
            });
            const dismiss = el('button', undefined, 'dismiss');
            dismiss.addEventListener('click', () => { wentBack = null; buildHistory(); });
            box.append(el('span', 'bl', `back on "${wb.to.label.slice(0, 32)}" ·`), input, dismiss);
            wrap.appendChild(box);
        }
        body.replaceChildren(wrap);
    }
    function openVersion(id) {
        const from = nodeById(tree.headId);
        const to = nodeById(id);
        // going back along the spine to an ancestor: ask why (optional)
        let isAncestor = false;
        for (let n = from; n; n = nodeById(n.parentId))
            if (n.id === id)
                isAncestor = true;
        moveHead(id);
        histSelected = null;
        if (from && to && isAncestor && from.id !== id)
            wentBack = { from, to };
        if (view === 'history')
            buildHistory();
    }
    function forgetBranch(tipId) {
        tree.forgetBranch(tipId);
        scheduleHistorySave();
    }
    // ── selection and linked hover: the panel owns them, the world layer draws them ──
    let selIdx = null;
    let selGroupKey = null;
    /** When the selection last changed (the live context box says when "this" was pointed at). */
    let selectedAt = Date.now();
    /**
     * One object picked in the world (2026-10-16): its sounds are the selection and stand as their own
     * group at the top of the list, even when the object is one of a family (a car of 62), which a click
     * used to answer with the whole family.
     */
    let focusHost = null;
    /** The thing a click in the world opened in the list: letting go of the pick closes it again. */
    let worldOpened = null;
    /** The last click on a thing's header, to read a double click across the redraw it causes. */
    let lastHeaderClick = { key: '', at: 0 };
    const DOUBLE_MS = 350;
    /** Things picked whole with ⌘/Shift on their header (a one-sound thing's header goes green too). */
    const pickedAsThing = new Set();
    let chatReady = false; // the conversation's parts exist (selection repaints its "about" from then on)
    let hoverIdx = null;
    let shelfSize = null;
    let groupInfo = new Map();
    /** Several sounds picked with Shift or ⌘ (rows or the world): the selection bar acts on all of them. */
    const multiSel = new Set();
    const isSelected = (i) => i === selIdx || multiSel.has(i) || (!!selGroupKey && !!groupInfo.get(selGroupKey)?.members.includes(i));
    const selBar = el('div', 'satie-dt-selbar');
    selBar.hidden = true;
    /** The developer's mix groups and the ones saved in the script (`# @group`). */
    function mixGroupsNow() {
        const own = opts.mixGroups ?? [];
        return [...own, ...readGroupLines(script).filter(g => !own.some(o => o.id === g.id)).map(g => ({ ...g, saved: true }))];
    }
    let groupFilter = null; // a group chosen in the toolbar: only its sounds show
    /** Making a new group ("+ new group"): its name so far; every click adds or removes until save or cancel. */
    let making = null;
    function startMaking() {
        making = { name: '' };
        groupFilter = null;
        shelfOpen = null;
        selIdx = null;
        selGroupKey = null;
        multiSel.clear();
        pickedAsThing.clear();
        buildMixer();
        applySelection();
        groupBar.querySelector('input')?.focus();
    }
    function stopMaking() { making = null; multiSel.clear(); pickedAsThing.clear(); buildMixer(); applySelection(); }
    /** The strip while making a group: its name, what it holds so far, how to add, save or cancel. */
    function paintMaking() {
        const stmts = engine.scriptStatements, idx = [...multiSel];
        const things = new Set(idx.map(i => stmts[i]?.hostRef ?? `scene:${i}`)).size;
        let input = groupBar.querySelector('input.gb-input');
        const keepFocus = !!input && document.activeElement === input;
        if (!input) {
            input = el('input', 'gb-input');
            input.placeholder = 'name it: the café corner, the engines…';
            input.addEventListener('input', () => { making.name = input.value; paintMaking(); });
            input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter')
                groupBar.querySelector('.gb-save')?.click(); if (e.key === 'Escape')
                stopMaking(); });
        }
        const ids = idx.map(i => stmts[i]?.sourceId).filter((x) => !!x);
        const save = el('button', 'gb-save', 'save');
        save.disabled = !making.name.trim() || !ids.length;
        save.title = save.disabled ? 'name it and add at least one sound' : `keep "${making.name.trim()}" (${ids.length} sounds)`;
        save.addEventListener('click', () => { if (save.disabled || !making)
            return; const name = making.name; making = null; saveGroup(name, ids); });
        const cancel = el('button', undefined, 'cancel');
        cancel.addEventListener('click', stopMaking);
        const head = el('div', 'gb-head');
        head.append(el('span', 'gb-tag', 'new group'), input);
        const hint = el('div', 'gb-hint', idx.length ? `${idx.length} sound${idx.length === 1 ? '' : 's'} · on ${things} thing${things === 1 ? '' : 's'} · click more to add, click again to take out` : 'click things (all their sounds) or sounds, here or in the game, to add them');
        const ctl = el('div', 'gb-ctl');
        save.style.marginLeft = 'auto';
        ctl.append(hint, save, cancel);
        groupBar.replaceChildren(head, ctl);
        groupBar.hidden = false;
        if (keepFocus)
            input.focus();
    }
    const groupBar = el('div', 'satie-dt-groupbar');
    groupBar.hidden = true;
    /** The chosen group as a strip over the list: its name, what it holds, one fader and M/S for all of it, leave, delete. */
    function paintGroupBar() {
        if (making) {
            paintMaking();
            return;
        }
        const g = groupFilter ? mixGroupsNow().find(x => `mix:${x.id}` === groupFilter) : undefined;
        groupBar.replaceChildren();
        groupBar.hidden = !g;
        if (!g)
            return;
        const stmts = engine.scriptStatements;
        const idx = stmts.map((st, i) => (st.sourceId && g.sourceIds.includes(st.sourceId) ? i : -1)).filter(i => i >= 0);
        const things = new Set(idx.map(i => stmts[i].hostRef ?? `scene:${i}`));
        const head = el('div', 'gb-head');
        const name = el('span', 'gb-name', g.label);
        if (g.saved)
            renameable(name, () => g.label, to => changeGroup(g.id, { label: to }), 'this group');
        else
            name.title = "one of the scene's own groups (from the game's code)";
        const back = el('button', 'gb-back', '← back');
        back.title = 'leave the group: the whole list again';
        back.addEventListener('click', () => { groupFilter = null; buildMixer(); });
        head.append(back, el('span', 'gb-tag', 'group'), name, el('span', 'gb-cnt', `${idx.length} sound${idx.length === 1 ? '' : 's'} · on ${things.size} thing${things.size === 1 ? '' : 's'}`));
        const ctl = el('div', 'gb-ctl');
        if (opts.levelFaders && g.sourceIds.length) {
            const f = levelFader(`group:${g.id}`, g.label, g.sourceIds);
            f.title = 'moves every sound in the group together; each keeps its own level';
            ctl.appendChild(f);
        }
        const allMuted = idx.length > 0 && idx.every(i => isMuted(i)), allSolo = idx.length > 0 && idx.every(i => engine.soloedIndices.has(i));
        const m = el('button', undefined, 'M');
        m.title = 'mute the whole group';
        m.dataset.on = allMuted ? '1' : '0';
        m.addEventListener('click', () => { setMuted(idx, !allMuted); commitMix(); syncMixer(); paintGroupBar(); });
        const so = el('button', undefined, 'S');
        so.title = 'solo the whole group';
        so.dataset.on = allSolo ? '1' : '0';
        so.addEventListener('click', () => { const next = new Set(engine.soloedIndices); for (const i of idx) {
            if (allSolo)
                next.delete(i);
            else
                next.add(i);
        } engine.setSoloIndices([...next]); commitMix(); syncMixer(); paintGroupBar(); });
        ctl.append(m, so);
        if (g.saved) {
            const del = el('button', 'gb-del', 'delete group');
            del.title = `delete "${g.label}" (its sounds stay; undo brings it back)`;
            del.style.marginLeft = 'auto';
            del.addEventListener('click', () => { const label = g.label; changeGroup(g.id, null); groupFilter = null; buildMixer(); say(`group "${label}" deleted · undo brings it back`); });
            ctl.appendChild(del);
        }
        groupBar.append(head, ctl);
    }
    /** What a selection of several sounds can do at once: level, mute, solo, ask, keep as a group. */
    function paintSelBar() {
        const idx = [...multiSel];
        selBar.replaceChildren();
        selBar.hidden = idx.length < 2 || !!making; // making a group: its strip counts them
        if (idx.length < 2)
            return;
        const stmts = engine.scriptStatements;
        const ids = idx.map(i => stmts[i]?.sourceId).filter((x) => !!x);
        selBar.appendChild(el('span', 'n', `${idx.length} selected`));
        if (opts.levelFaders && ids.length) {
            const f = levelFader(`sel:${ids.join(',')}`, `${idx.length} sounds`, ids);
            f.title = 'moves all of them together; each keeps its own level';
            f.addEventListener('click', e => e.stopPropagation());
            selBar.appendChild(f);
        }
        const allMuted = idx.every(i => isMuted(i)), allSolo = idx.every(i => engine.soloedIndices.has(i));
        const m = el('button', undefined, 'M');
        m.title = 'mute all of these';
        m.dataset.on = allMuted ? '1' : '0';
        m.addEventListener('click', () => { setMuted(idx, !allMuted); commitMix(); record('mute_selection', { muted: !allMuted, voices: idx.map(voiceContext) }); syncMixer(); paintSelBar(); });
        const so = el('button', undefined, 'S');
        so.title = 'solo all of these';
        so.dataset.on = allSolo ? '1' : '0';
        so.addEventListener('click', () => { const next = new Set(engine.soloedIndices); for (const i of idx) {
            if (allSolo)
                next.delete(i);
            else
                next.add(i);
        } engine.setSoloIndices([...next]); commitMix(); record('solo_selection', { soloed: !allSolo, voices: idx.map(voiceContext) }); syncMixer(); paintSelBar(); });
        const ask = el('button', undefined, 'ask');
        ask.title = 'ask SATIE about these sounds';
        ask.addEventListener('click', () => askAbout(selectedParts()));
        const save = el('button', 'pri', 'save as group…');
        save.title = 'keep them together under one name in the mixer (saved in the script)';
        save.addEventListener('click', () => {
            const input = el('input', 'gname');
            input.placeholder = 'name the group: night insects, the crossing…';
            input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter')
                saveGroup(input.value, ids); if (e.key === 'Escape')
                paintSelBar(); });
            save.replaceWith(input);
            input.focus();
        });
        const x = el('button', 'x', '×');
        x.title = 'clear the selection';
        x.addEventListener('click', clearSelection);
        selBar.append(m, so, ask, save, x);
    }
    /** Keep these sounds as a named group (a sound is in one saved group: joining a new one leaves the old). */
    function saveGroup(label, ids) {
        const name = label.trim().replace(/[:\n]/g, ' ');
        if (!name || !ids.length)
            return;
        const groups = readGroupLines(script).filter(g => g.label !== name).map(g => ({ ...g, sourceIds: g.sourceIds.filter(id => !ids.includes(id)) }));
        const next = writeGroupLines(script, [...groups, { label: name, sourceIds: ids }]);
        if (applyScript(next, `group "${name}": ${ids.length} sounds`, { kind: 'group_save', detail: { label: name, sourceIds: ids } })) {
            multiSel.clear();
            pickedAsThing.clear();
            applySelection();
            // it is kept under "groups" at the top of the list (opened so you see it); you stay where you were
            shelfOpen = 'groups';
            buildMixer();
            say(`group "${name}" saved · under "groups" in the top row`);
        }
    }
    function changeGroup(id, to) {
        const groups = readGroupLines(script);
        const g = groups.find(x => x.id === id);
        if (!g)
            return;
        const next = writeGroupLines(script, to === null ? groups.filter(x => x !== g) : groups.map(x => (x === g ? { ...x, label: to.label ?? x.label } : x)));
        applyScript(next, to === null ? `ungrouped "${g.label}"` : `group "${g.label}" → "${to.label}"`, { kind: to === null ? 'group_remove' : 'group_rename', detail: { label: g.label, ...(to?.label ? { to: to.label } : {}), sourceIds: g.sourceIds } });
        if (to === null && groupFilter === `mix:${id}`)
            groupFilter = null;
    }
    /** Add these sounds to the pick, or take them out if all of them are in it (a thing's header with ⌘/Shift). */
    function toggleMany(indices) {
        const picked = new Set(multiSel);
        if (selIdx !== null)
            picked.add(selIdx);
        if (selGroupKey)
            for (const i of groupInfo.get(selGroupKey)?.members ?? [])
                picked.add(i);
        const all = indices.every(i => picked.has(i));
        for (const i of indices) {
            if (all)
                picked.delete(i);
            else
                picked.add(i);
        }
        const thingKey = [...groupInfo].find(([, g]) => g.members.length === indices.length && indices.every(i => g.members.includes(i)))?.[0];
        if (thingKey) {
            if (all)
                pickedAsThing.delete(thingKey);
            else
                pickedAsThing.add(thingKey);
        }
        selIdx = null;
        selGroupKey = null;
        multiSel.clear();
        for (const i of picked)
            multiSel.add(i);
        applySelection();
    }
    function toggleMulti(i, keepMany = false) {
        for (const k of [...pickedAsThing])
            if (groupInfo.get(k)?.members.includes(i))
                pickedAsThing.delete(k);
        if (!multiSel.size && selIdx !== null && selIdx !== i)
            multiSel.add(selIdx);
        if (multiSel.has(i))
            multiSel.delete(i);
        else
            multiSel.add(i);
        selIdx = null;
        selGroupKey = null;
        if (multiSel.size === 1 && !keepMany && !making) {
            selIdx = [...multiSel][0];
            multiSel.clear();
        }
        applySelection();
    }
    function applySelection() {
        selectedAt = Date.now();
        if (making)
            paintGroupBar();
        // a thing is picked when all of its sounds are (from the world, or ⌘/Shift on it): its header is green and
        // its cards carry the bar; sounds picked as sounds (one, or several) are green in full
        const thingPicked = (key, g) => key === selGroupKey || (g.members.length > 1 && g.members.every(i => multiSel.has(i))) || (g.members.length === 1 && multiSel.has(g.members[0]) && selIdx === null && pickedAsThing.has(key));
        const inPickedThing = new Set();
        for (const [key, g] of groupInfo) {
            const on = thingPicked(key, g);
            if (g.header)
                g.header.dataset.sel = on ? '1' : '0';
            if (on)
                for (const i of g.members)
                    inPickedThing.add(i);
        }
        for (const [i, r] of rows) {
            r.row.dataset.sel = isSelected(i) ? '1' : '0';
            r.row.dataset.full = isSelected(i) && !inPickedThing.has(i) ? '1' : '0';
            r.row.dataset.exp = selIdx === i || openDrawer === i || openProps === i ? '1' : '0';
        }
        const g = selGroupKey ? groupInfo.get(selGroupKey) : null;
        layer?.setSelection(multiSel.size ? { indices: [...multiSel], label: `${multiSel.size} selected` }
            : selIdx !== null ? { indices: [selIdx] }
                : g ? { indices: g.members, label: g.label, detail: g.where } : null);
        if (chatReady)
            paintSelBar();
        opts.onSelect?.(multiSel.size ? [...multiSel] : selIdx !== null ? [selIdx] : g ? [...g.members] : []);
        // "about" offers what you just selected
        if (chatReady)
            paintScope();
    }
    function selectVoice(i, fromWorld = false) {
        // working on another sound closes the one you were editing (every edit is already saved)
        if (openProps !== null && openProps !== i) {
            openProps = null;
            finder = null;
            layer?.setEditing?.(null);
            buildMixer();
        }
        selGroupKey = null;
        multiSel.clear();
        pickedAsThing.clear();
        selIdx = selIdx === i ? null : i;
        if (selIdx !== null) {
            const key = [...groupInfo].find(([, g]) => g.members.includes(i))?.[0];
            // its thing opens so the sound is there to work on; a background sound opens the background box
            const picked = engine.scriptStatements[i];
            if (picked && isYours(picked) && shelfOpen !== 'you') {
                shelfOpen = 'you';
                buildMixer();
            }
            else if (picked && isAround(picked) && shelfOpen !== 'bg') {
                shelfOpen = 'bg';
                buildMixer();
            }
            // in view every thing is a header, one sound or four: its thing opens (bird perch 2 ▸ sparrow call)
            else if (key && scope === 'here' && !hereOpen.has(key)) {
                hereOpen.add(key);
                if (fromWorld)
                    worldOpened = key;
                buildMixer();
            }
            else if (key && scope === 'all' && !allOpen.has(key)) {
                allOpen.add(key);
                if (fromWorld)
                    worldOpened = key;
                buildMixer();
            }
        }
        applySelection();
        // picked in the world: bring its row into the list (even silent, even while the list holds still) and show it
        if (selIdx !== null && fromWorld) {
            if (query || typeFilter !== 'all') {
                const st = engine.scriptStatements[selIdx];
                if (st && !(typeFilter === 'all' || tagsOf(st).has(typeFilter)))
                    typeFilter = 'all';
                query = '';
                buildTools();
            }
            refreshList('user');
            rows.get(selIdx)?.row.scrollIntoView({ block: 'center' });
        }
    }
    /** Typing in SATIE's fields never reaches the game ("t" in a message must not change the time of day). */
    const typing = (t) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    for (const type of ['keydown', 'keyup', 'keypress'])
        root.addEventListener(type, e => { if (typing(e.target))
            e.stopPropagation(); });
    function selectGroup(key, keep = false) {
        const g = groupInfo.get(key);
        if (!g)
            return;
        if (openProps !== null && !g.members.includes(openProps)) {
            openProps = null;
            finder = null;
            layer?.setEditing?.(null);
        }
        selIdx = null;
        multiSel.clear();
        selGroupKey = keep ? key : selGroupKey === key ? null : key;
        if (focusHost !== null) {
            focusHost = null;
            buildMixer();
        }
        applySelection();
    }
    function clearSelection() {
        pickedAsThing.clear();
        if (worldOpened !== null) {
            hereOpen.delete(worldOpened);
            allOpen.delete(worldOpened);
            worldOpened = null;
            if (focusHost === null) {
                selIdx = null;
                selGroupKey = null;
                multiSel.clear();
                buildMixer();
                applySelection();
                return;
            }
        }
        if (focusHost !== null) {
            focusHost = null;
            selIdx = null;
            selGroupKey = null;
            multiSel.clear();
            buildMixer();
            applySelection();
            return;
        }
        if (selIdx !== null || selGroupKey || multiSel.size) {
            selIdx = null;
            selGroupKey = null;
            multiSel.clear();
            applySelection();
        }
    }
    function setHover(i, fromRow) {
        if (hoverIdx === i)
            return;
        if (hoverIdx !== null) {
            const r = rows.get(hoverIdx);
            if (r)
                r.row.dataset.hover = '0';
        }
        hoverIdx = i;
        root.dataset.hovering = i !== null ? '1' : '0';
        const r = i !== null ? rows.get(i) : undefined;
        if (r)
            r.row.dataset.hover = '1';
        // Hovering an orb never scrolls the list; if the linked row is out of view, a note at the edge says where.
        peek.dataset.on = '0';
        if (r && !fromRow) {
            const rr = r.row.getBoundingClientRect(), box = body.getBoundingClientRect(), d = root.getBoundingClientRect();
            const what = (r.row.querySelector('.what')?.textContent ?? '');
            if (rr.bottom <= box.top + 4) {
                peek.textContent = `↑ ${what}`;
                peek.style.top = `${box.top - d.top + 6}px`;
                peek.style.bottom = 'auto';
                peek.dataset.on = '1';
            }
            else if (rr.top >= box.bottom - 4) {
                peek.textContent = `↓ ${what}`;
                peek.style.bottom = `${d.bottom - box.bottom + 6}px`;
                peek.style.top = 'auto';
                peek.dataset.on = '1';
            }
        }
        layer?.setHover(i, fromRow);
        // hovering a sound in the world a moment brings its row into view (a quick sweep does not)
        clearTimeout(dwellTimer);
        if (i !== null && !fromRow)
            dwellTimer = setTimeout(() => { if (hoverIdx === i) {
                const r = rows.get(i);
                if (r && !r.item.hidden)
                    r.row.scrollIntoView({ block: 'nearest' });
            } }, 450);
    }
    let dwellTimer;
    function focusVoices(indices) { if (layer && indices.length)
        layer.focus(indices); }
    /** The loaded takes a voice can play (its pool of variants; a {text} bank's takes for every surface). */
    function takeKeysFor(st) {
        const bufs = engine.getAudioBuffers();
        const base = pathFor(st.clip);
        const keys = [...bufs.keys()].filter(k => k === base || k.startsWith(base + '#'));
        if (keys.length || !(st.genPrompt && /\{\w+\}/.test(st.genPrompt)))
            return keys;
        const stem = base.split('{')[0].replace(/_+$/, '');
        return [...bufs.keys()].filter(k => k.startsWith(stem));
    }
    /** Audition one take at the voice's position now; the same play / stop button as the swap preview. */
    function playNow(i, btn, alone = false) {
        if (preview?.btn === btn) {
            stopPreview();
            return;
        }
        stopPreview();
        const st = engine.scriptStatements[i];
        if (!st)
            return;
        const keys = takeKeysFor(st);
        if (!keys.length)
            return;
        const template = st.kind === 'trigger' && !!st.genPrompt && /\{\w+\}/.test(st.genPrompt);
        if (template) {
            walkNow(i, btn, keys);
            return;
        }
        const buf = engine.getAudioBuffers().get(keys[Math.floor(Math.random() * keys.length)]);
        if (!buf)
            return;
        if (engine.audioContext.state === 'suspended')
            void engine.audioContext.resume();
        const v = engine.getTrackViews().find(t => t.statementIndex === i);
        const p = preview = { btn, fill: el('i'), raf: 0, plain: null };
        if (alone)
            silenceScene();
        else
            duckScene(i);
        btn.dataset.state = 'playing';
        btn.innerHTML = ICON.stop;
        // Heard up close and clearly, whatever its distance or state in the game (the rest of the scene dips under it).
        // Level: the take's own loudness brought to a common audition level, so a quiet take is not lost.
        const len = Math.min(buf.duration, 8), ctx = engine.audioContext, t0 = ctx.currentTime;
        let peak = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let k = 0; k < d.length; k += 16) {
                const a = Math.abs(d[k]);
                if (a > peak)
                    peak = a;
            }
        }
        const src = ctx.createBufferSource(), g = ctx.createGain();
        const norm = Math.min(4, 0.5 / Math.max(peak, 1e-3));
        const at = st.sourceId ? faderOffset([st.sourceId]) : 0;
        g.gain.value = Math.min(8, norm * Math.pow(10, (at <= OFF ? 0 : at) / 20));
        src.buffer = buf;
        src.connect(g).connect(ctx.destination);
        src.start();
        src.stop(t0 + len);
        p.plain = src;
        p.i = i;
        p.gain = g;
        p.norm = norm;
        void v;
        record('audition_voice', { voice: voiceContext(i) });
        layer?.fired(i);
        layer?.ripple?.(i);
        const tick = () => { if (preview !== p)
            return; if (ctx.currentTime - t0 < len)
            p.raf = requestAnimationFrame(tick);
        else
            stopPreview(); };
        p.raf = requestAnimationFrame(tick);
    }
    /** A {text} bank (footsteps): a short walk on one surface, four steps at walking pace; each press moves to the next surface. */
    const walkSurface = new Map();
    function walkNow(i, btn, keys) {
        const bySurface = new Map();
        for (const k of keys) {
            const stem = k.replace(/(__t\d+|#\d+)$/, '');
            const l = bySurface.get(stem);
            if (l)
                l.push(k);
            else
                bySurface.set(stem, [k]);
        }
        const stems = [...bySurface.keys()].sort();
        if (!stems.length)
            return;
        const n = ((walkSurface.get(i) ?? -1) + 1) % stems.length;
        walkSurface.set(i, n);
        const takes = bySurface.get(stems[n]);
        // name the surface: the key keeps its first letters ("…_on_asp") → the game's declared surface that starts so
        const bit = stems[n].split('_').pop() ?? '';
        const surface = (layer?.surfaces?.() ?? []).find(x => x.toLowerCase().replace(/[^a-z]/g, '').startsWith(bit.toLowerCase().replace(/[^a-z]/g, ''))) ?? bit;
        const ctx = engine.audioContext;
        if (ctx.state === 'suspended')
            void ctx.resume();
        const p = preview = { btn, fill: el('i'), raf: 0, plain: null };
        duckScene(i);
        btn.dataset.state = 'playing';
        btn.innerHTML = ICON.stop;
        const g = ctx.createGain();
        g.connect(ctx.destination);
        const t0 = ctx.currentTime + 0.05, STEP = 0.52;
        let last = -1, peak = 0, end = t0;
        const srcs = [];
        for (let k = 0; k < 4; k++) {
            let pick = Math.floor(Math.random() * takes.length);
            if (takes.length > 1 && pick === last)
                pick = (pick + 1) % takes.length;
            last = pick;
            const buf = engine.getAudioBuffers().get(takes[pick]);
            if (!buf)
                continue;
            const d = buf.getChannelData(0);
            for (let q = 0; q < d.length; q += 16)
                peak = Math.max(peak, Math.abs(d[q]));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(g);
            src.start(t0 + k * STEP);
            srcs.push(src);
            end = Math.max(end, t0 + k * STEP + Math.min(buf.duration, 1.2));
            src.stop(t0 + k * STEP + Math.min(buf.duration, 1.2));
        }
        g.gain.value = Math.min(4, 0.5 / Math.max(peak, 1e-3));
        p.plain = srcs[srcs.length - 1] ?? null;
        p.i = i;
        p.gain = g;
        p.norm = g.gain.value;
        say(`footsteps on ${surface.replace(/_/g, ' ')} · press ▶ again for the next surface (${n + 1} of ${stems.length})`);
        const tick = () => { if (preview !== p) {
            for (const x of srcs) {
                try {
                    x.stop();
                }
                catch { /* ended */ }
            }
            return;
        } if (ctx.currentTime < end)
            p.raf = requestAnimationFrame(tick);
        else
            stopPreview(); };
        p.raf = requestAnimationFrame(tick);
    }
    /** Play it now: fire this `on` voice's event at its object, as the game would. */
    function fireNow(i) {
        const st = engine.scriptStatements[i];
        if (!st?.eventName)
            return;
        const v = engine.getTrackViews().find(t => t.statementIndex === i);
        const ok = engine.fireEvent(st.eventName, { ...(st.sourceId ? { sourceId: st.sourceId } : {}), ...(v ? { x: v.position.x, y: v.position.y, z: v.position.z } : {}) });
        record('fire_test', { voice: voiceContext(i), handled: ok });
        say(ok ? `fired ${st.eventName}` : `${st.eventName}: nothing answered (zone, cooldown or a when gate)`);
    }
    let rows = new Map();
    /** Per row: the status shown, and a different one waiting to have held long enough to replace it. */
    const rowHeld = new Map();
    const HOLD_MS = 1500;
    let renderedStatements = null;
    const gainOf = new Map();
    let blockMap = null;
    let openDrawer = null;
    let openProps = null;
    let openFeedback = null;
    /** All sounds: the classes you opened (2026-10-18: they start closed, a catalogue to open, not a wall of rows). */
    const allOpen = new Set();
    let showAllProps = false;
    /** What a sound is called: a recording or new sound by the name it came with, else from its prompt or clip. */
    /**
     * A sound's own name, given in the mixer: a `# @name <words>` line above its block (the script's
     * metadata comments, like `# @bg`; the parser ignores comments, so the language is unchanged).
     * It names the sound everywhere it shows: list, hearing strip, world label, history, chat.
     */
    let namesFor = '', names = new Map();
    /** A statement's line in the CURRENT text (an engine statement kept across a live edit has a stale sourceLine). */
    let linesFor = '', linesNow = [];
    function lineOf(st) {
        if (linesFor !== script) {
            linesFor = script;
            linesNow = (tryParse(script).statements ?? []).map(x => x.sourceLine);
        }
        const k = engine.scriptStatements.indexOf(st);
        return k >= 0 && linesNow.length === engine.scriptStatements.length ? linesNow[k] : st.sourceLine;
    }
    function givenName(st) {
        if (namesFor !== script) {
            namesFor = script;
            names = new Map();
            const lines = script.split('\n');
            for (const b of voiceBlocks(script))
                for (let l = b.start; l < b.header; l++) {
                    const m = lines[l].match(NAME_LINE);
                    if (m)
                        names.set(b.header, m[1].trim());
                }
        }
        return names.get(lineOf(st));
    }
    function renameSound(i, to) {
        const b = blockMap?.get(i);
        const st = engine.scriptStatements[i];
        if (!b || !st) {
            say('This sound has no block of its own to name.');
            return;
        }
        const lines = script.split('\n');
        const at = lines.slice(b.start, b.header).findIndex(l => NAME_LINE.test(l));
        const name = to.trim().replace(/\s+/g, ' ').slice(0, 60);
        const from = givenName(st) ?? nameOf(st);
        if (at >= 0) {
            if (name)
                lines[b.start + at] = `# @name ${name}`;
            else
                lines.splice(b.start + at, 1);
        }
        else if (name)
            lines.splice(b.header, 0, `# @name ${name}`);
        else
            return;
        applyScript(lines.join('\n'), name ? `named "${from}" "${name}"` : `"${from}" back to its own name`, { kind: 'rename_sound', detail: { voice: voiceContext(i), from, to: name || null } });
    }
    /** A place's name is the scene contract's object label: shown here, in the world, and to SATIE. */
    async function renamePlace(id, to) {
        const label = to.trim().replace(/\s+/g, ' ').slice(0, 60);
        const from = hostName(id);
        placeNames.set(id, label);
        layer?.setHostLabel?.(id, label || undefined);
        record('rename_place', { host: id, from, to: label || null });
        commitHistory(label ? `named the ${word('thing')} "${from}" "${label}"` : `"${from}" back to its own name`, 'rename_place');
        buildMixer();
        try {
            const r = await fetch(labelUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: scriptUrl, id, label }) });
            if (!r.ok)
                say('the name is kept for this session; the scene contract was not written (is the satie vite plugin on?)');
        }
        catch {
            say('the name is kept for this session; the scene contract was not written');
        }
    }
    /** Double-click a name to rename it in place; Enter keeps it, Escape leaves it, empty goes back to its own name. */
    function renameable(span, current, commit, what) {
        span.title = `${span.title ? span.title + ' · ' : ''}double-click to rename ${what}`;
        span.addEventListener('dblclick', e => {
            e.stopPropagation();
            e.preventDefault();
            const input = el('input', 'rename');
            input.type = 'text';
            input.value = current();
            input.setAttribute('aria-label', `rename ${what}`);
            let done = false;
            const finish = (keep) => { if (done)
                return; done = true; const v = input.value; input.replaceWith(span); if (keep && v.trim() !== current())
                commit(v); };
            input.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter')
                finish(true);
            else if (ev.key === 'Escape')
                finish(false); });
            input.addEventListener('click', ev => ev.stopPropagation());
            input.addEventListener('blur', () => finish(true));
            span.replaceWith(input);
            input.focus();
            input.select();
        });
    }
    /**
     * The sound a statement is one copy of (2026-10-16). An `N *` block expands into N statements, its
     * copies, which share the block (its source line); the first copy stands for them. Anything else is
     * its own sound. Every view folds a sound's copies into one entry: the list's "×N" row (scene-level,
     * background, inside a thing), the hearing strip's chip, the world's label.
     */
    function leadOf(i) {
        const st = engine.scriptStatements[i];
        if (!st?.isCountVariant || st.sourceLine < 0 || st.sourceShared)
            return i;
        const lead = i - st.countIndex;
        return engine.scriptStatements[lead]?.sourceLine === st.sourceLine ? lead : i;
    }
    /** Statement indices by the sound they copy (`leadOf`), in first-seen order. */
    function bySound(indices) {
        const out = new Map();
        for (const i of indices) {
            const l = leadOf(i);
            const at = out.get(l);
            if (at)
                at.push(i);
            else
                out.set(l, [i]);
        }
        return [...out.values()];
    }
    /** "car" → "cars", "bus" → "buses", "lily" → "lilies": the last word of a kind's name, plural. */
    function pluralOf(phrase) {
        return phrase.replace(/(\w+)$/, w => /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
    }
    function nameOf(st) {
        const given = givenName(st);
        if (given)
            return given;
        const n = derivedName(st);
        // a sound named like the thing it is on ("vending machine" for its purchase) read as the thing:
        // an event sound is then the thing doing it ("vending machine purchase")
        const host = st.hostRef && st.hostRef !== layer?.listenerHost?.() ? hostName(st.hostRef).toLowerCase() : '';
        if (host && st.kind === 'trigger' && st.eventName && (host.includes(n.toLowerCase()) || n.toLowerCase().includes(host)))
            return `${hostName(st.hostRef)} ${soundAction(st)}`;
        return n;
    }
    function derivedName(st) {
        // SATIE's capture names every generated take with the sample-name grammar ("dog-barking"): use it
        if (st.isGenerated && !isTemplatePrompt(st.genPrompt)) {
            const n = manifest[takeClipPath(st, 0)]?.name;
            if (n && SAMPLE_NAME.test(String(n)))
                return String(n).replace(/-\d+$/, '').replace(/-/g, ' ');
        }
        const entry = !st.isGenerated ? manifest[pathFor(st.clip)] : undefined;
        const named = entry?.name ? String(entry.name) : '';
        if (named)
            return shortName({ isGenerated: true, genPrompt: named.replace(/[-_]+/g, ' '), clip: st.clip });
        // no stored name (every scene made before takes carried one): its id as words, then the thing it is
        // on with what it does; never a fragment of the generation prompt ("gives a short")
        return fallbackName(st, { hostLabel: hostName });
    }
    /** What a sound does: an event sound is its event; anything else is its name. */
    const actionOf = (st) => (st.kind === 'trigger' && st.eventName ? soundAction(st) : nameOf(st));
    /** What it sounds like, one line: the name it came with for a recording or new sound. */
    function describeOf(st) {
        const entry = !st.isGenerated ? manifest[pathFor(st.clip)] : undefined;
        return entry?.name ? soundsLike({ isGenerated: true, genPrompt: String(entry.name).replace(/[-_]+/g, ' '), clip: st.clip }) : soundsLike(st);
    }
    function labelOf(st) {
        const kind = st.kind === 'trigger' ? `on ${st.eventName ?? ''}` : st.kind === 'loop' ? 'loop' : 'one-shot';
        const src = manifest[pathFor(st.clip)];
        // a recording by the description it came with, never its token ("take 1ff80b2b")
        const what = st.isGenerated ? (st.genPrompt ?? '') : src?.name ? String(src.name) : st.clip.replace(/^community\//, '').replace(/_/g, ' ');
        const source = src?.source === 'library' ? `recording · ${src.name ?? ''}` : src?.source === 'freesound' ? `freesound · ${src.name ?? ''}` : src?.source === 'provided' ? `your file · ${src.name ?? ''}` : st.isGenerated ? 'generated' : '';
        const meta = [st.hostRef ? onHost(st.hostRef) : '', st.zones?.length ? `zone ${st.zones.join('/')}` : '', st.bed ? 'bed' : '', st.spl.isNull ? '' : `spl ${Math.round((st.spl.min + st.spl.max) / 2)}`, source].filter(Boolean).join(' · ');
        return { kind, what, meta };
    }
    /**
     * The fader's position is read from the script, never remembered: a source's `spl` against its
     * `spl` as composed (the history's first version). So it is right after any edit, undo, history
     * move or reload. The bottom stop is "off": `spl 0` (silent); leaving it restores the composed
     * level plus the fader's offset.
     */
    const OFF = -25, MAX_UP = 36;
    const splCache = new Map();
    function splTable(text) {
        let t = splCache.get(text);
        if (!t) {
            t = new Map();
            // a level that follows the game is read at its loud end (its output range's top)
            for (const st of tryParse(text).statements ?? []) {
                if (!st.sourceId || t.has(st.sourceId))
                    continue;
                if (st.splFollow)
                    t.set(st.sourceId, st.splFollow.outMax);
                else if (!st.spl.isNull)
                    t.set(st.sourceId, st.spl.min);
            }
            if (splCache.size > 8)
                splCache.clear();
            splCache.set(text, t);
        }
        return t;
    }
    const firstSeenSpl = new Map(); // sources the composed version did not have
    function composedSpl(id) {
        const root = tree.nodes.find(n => n.parentId === null);
        const rootScript = root?.snap.script ?? baselineScript;
        const base = splTable(rootScript).get(id);
        if (base !== undefined && base > 0)
            return base;
        // a copy (added later) reads its level against the sound it copies, so the two faders agree
        const me = engine.scriptStatements.find(x => x.sourceId === id);
        if (me) {
            const twin = (tryParse(rootScript).statements ?? []).find(x => x.sourceId && x.sourceId !== id && x.kind === me.kind && (me.isGenerated ? x.isGenerated && x.genPrompt === me.genPrompt : x.clip === me.clip));
            const tb = twin?.sourceId ? splTable(rootScript).get(twin.sourceId) : undefined;
            if (tb !== undefined && tb > 0)
                return tb;
        }
        const now = splTable(script).get(id);
        if (!firstSeenSpl.has(id) && now !== undefined && now > 0)
            firstSeenSpl.set(id, now);
        return firstSeenSpl.get(id) ?? null;
    }
    /** Where the fader for these sources sits: the first one's offset from as composed, or off. */
    /** The level a sound had before it was turned off (this session), to come back to. */
    const offFrom = new Map();
    /** The lowest level a fader move leaves a sound at (0 dB SPL reads as off), and where moved sounds would be under it. */
    const FLOOR_DB = 1;
    const belowFloor = new Map();
    /** The scene's typical level: the median of its sounds' levels (a sound with nothing else to go back to). */
    function typicalSpl() {
        const v = [...splTable(script).values()].filter(x => x > 0).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)] : 60;
    }
    function faderOffset(sourceIds) {
        const id = sourceIds[0];
        if (!id)
            return 0;
        const now = splTable(script).get(id), base = composedSpl(id);
        if (now === undefined)
            return 0;
        if (now <= 0)
            return OFF;
        return base === null ? 0 : Math.max(OFF + 1, Math.min(MAX_UP, Math.round(now - base)));
    }
    /**
     * A fader's reading, 0 to 1 (never dB): with its sounds known, how loud the loudest of them is after the move
     * (its `spl` and the trim); without, the move itself ("+0.05"). Off is off.
     */
    const fmtLevel = (t, ids) => {
        if (t <= OFF)
            return 'off';
        const base = ids?.length ? faderRef(ids) : NaN;
        return Number.isFinite(base) ? fmtLoud(base + t) : t === 0 ? 'as made' : fmtLoudDelta(t);
    };
    /** What a fader is measured from: the loudest of its sounds as composed (dB SPL). */
    function faderRef(ids) {
        const v = ids.map(id => composedSpl(id) ?? splTable(script).get(id)).filter((x) => typeof x === 'number' && x > 0);
        return v.length ? Math.max(...v) : typicalSpl();
    }
    /**
     * A fader IS its loudness (2026-11-13): the track runs 0 to 1 (0 to 120 dB SPL), so 0.93 sits at 93% of the way;
     * it reads the loudest of its sounds. Inside, the move is still an offset from as composed (OFF … MAX_UP).
     */
    const faderT = (f) => { const r = Number(f.dataset.ref ?? 0), t = Math.round(Number(f.value) - r); return t <= OFF ? OFF : Math.min(MAX_UP, t); };
    const faderText = (f) => { const t = faderT(f); return t <= OFF ? 'off' : fmtLoud(Number(f.dataset.ref ?? 0) + t); };
    function levelFader(key, label, sourceIds) {
        const ref = faderRef(sourceIds);
        const gain = el('input');
        gain.type = 'range';
        gain.min = '0';
        gain.max = '120';
        gain.step = '1';
        gain.dataset.ref = String(ref);
        {
            const t0 = faderOffset(sourceIds);
            gain.value = String(t0 <= OFF ? 0 : Math.max(0, Math.min(120, ref + t0)));
        }
        gain.setAttribute('aria-label', `${label} level`);
        gain.title = 'drag to the far left to turn it off';
        gain.dataset.mixLevel = key;
        gain.dataset.mixIds = sourceIds.join(' ');
        // usable when any of its sounds has a level to move (one that cannot no longer greys out the group's fader)
        gain.disabled = !sourceIds.some(id => splTable(script).has(id));
        // Hear it while dragging: a live trim on these voices; the script edit lands on release.
        const indices = () => engine.scriptStatements.map((st, i) => (st.sourceId && sourceIds.includes(st.sourceId) ? i : -1)).filter(i => i >= 0);
        gain.addEventListener('input', () => {
            // past what a fader may add, it stays at its top; under what it may take away, it is off
            if (Number(gain.value) > ref + MAX_UP)
                gain.value = String(Math.min(120, ref + MAX_UP));
            const v = faderT(gain), was = faderOffset(sourceIds);
            auditionFollows(indices(), v);
            const d = v <= OFF ? -120 : was <= OFF ? null : v - was;
            for (const i of indices())
                setDragDb(i, d);
            // every other fader over exactly these sounds (the row's, the card's) moves with this one, as it is dragged
            for (const o of root.querySelectorAll('input[type=range][data-mix-ids]')) {
                if (o === gain || o.dataset.mixIds !== gain.dataset.mixIds || o.value === gain.value)
                    continue;
                o.value = gain.value;
                o.dispatchEvent(new CustomEvent('satie-mirror'));
            }
        });
        // Apply on release: one revisioned document edit, no repeated scene parsing during a drag.
        gain.addEventListener('change', () => {
            for (const i of indices())
                setDragDb(i, null);
            const value = faderT(gain), previous = faderOffset(sourceIds);
            const now = splTable(script);
            // how far each level's top sits above the value the fader reads, for the 140 dB ceiling
            const spans = new Map((tryParse(script).statements ?? []).filter(st => st.sourceId).map(st => [st.sourceId, st.splFollow ? 0 : st.spl.max - st.spl.min]));
            let next = script;
            // a sound this fader cannot move (on an entity the game owns, no level of its own) stays where it is
            // and is counted; it no longer blocks the others
            let stayed = 0;
            for (const id of sourceIds) {
                const cur = now.get(id), base = composedSpl(id);
                if (cur === undefined) {
                    stayed++;
                    continue;
                }
                // off: silence it; back from off: its composed level plus the offset; otherwise move by the difference
                // back from off with no composed level (a sound added later): where it was before it went off,
                // else the scene's typical level (it bounced back with "needs a static SPL")
                const from = base ?? offFrom.get(id) ?? typicalSpl();
                if (value <= OFF && cur > 0)
                    offFrom.set(id, cur);
                let delta = value <= OFF ? -cur : previous <= OFF ? Math.max(0, from + value) - cur : value - previous;
                if (value > OFF && previous > OFF) {
                    // A quiet sound stops at the floor instead of refusing the whole move (one 3 dB drip blocked a
                    // group of 248), remembering how far under it would be, so moving back puts it back in its place.
                    const want = (cur <= FLOOR_DB && belowFloor.has(id) ? belowFloor.get(id) : cur) + delta;
                    if (want < FLOOR_DB) {
                        belowFloor.set(id, want);
                        delta = FLOOR_DB - cur;
                    }
                    else {
                        belowFloor.delete(id);
                        delta = Math.min(want, 140 - (spans.get(id) ?? 0)) - cur;
                    }
                }
                const moved = trimSourceLevels(next, [id], delta);
                if (moved === null)
                    stayed++;
                else
                    next = moved;
            }
            const back = () => { gain.value = String(previous <= OFF ? 0 : Math.max(0, Math.min(120, ref + previous))); };
            if (stayed === sourceIds.length) {
                say('This level needs an explicit source ID and its own level; use edit.');
                back();
                return;
            }
            if (stayed)
                say(`${stayed} of ${sourceIds.length} sounds stay where they are: their level is not theirs to move (use edit)`);
            if (next === script)
                return;
            if (!applyScript(next, `${label.slice(0, 48)}: ${faderText(gain)}`, { kind: 'level_trim', detail: { sourceIds, deltaDb: value - previous, off: value <= OFF } }))
                back();
        });
        return gain;
    }
    /**
     * Rebuild the mixer, keeping where you were: the list's scroll and the control you were on (a
     * fader by its sources, else a field by its label), so an edit does not throw you to the top.
     */
    function buildMixer() {
        // the list is drawn only where it shows: another tab (the conversation, history) keeps its own content,
        // and the mixer is redrawn when you come back to it
        if (view !== 'mixer')
            return;
        queueMicrotask(syncEditing);
        const top = body.scrollTop;
        const active = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement : null;
        const find = active?.dataset.mixLevel ? `[data-mix-level="${globalThis.CSS.escape(active.dataset.mixLevel)}"]`
            : active?.getAttribute('aria-label') ? `[aria-label="${globalThis.CSS.escape(active.getAttribute('aria-label'))}"]` : null;
        renderMixer();
        body.scrollTop = top;
        if (find)
            body.querySelector(find)?.focus({ preventScroll: true });
    }
    function renderMixer() {
        comparison?.destroy();
        comparison = null;
        body.replaceChildren();
        // a reload that added or removed a voice moved the open card's index: find its source again
        if (openProps !== null && openSource && engine.scriptStatements[openProps]?.sourceId !== openSource) {
            const j = engine.scriptStatements.findIndex(x => x.sourceId === openSource);
            openProps = j >= 0 ? j : null;
        }
        if (openProps === null) {
            openSource = null;
            card?.close();
            card = null;
        }
        if (openCrowd !== null && openProps === null && view === 'mixer' && engine.entities.some(e => e.id === openCrowd)) {
            const id = openCrowd;
            queueMicrotask(() => { if (openCrowd === id)
                mountCrowdInspector(id); });
        }
        else if (openProps === null || view !== 'mixer' || !engine.scriptStatements[openProps]) {
            inspector.hidden = true;
            inspector.replaceChildren();
            delete inspector.dataset.i;
            card?.close();
            card = null;
        }
        else {
            const k = openProps;
            queueMicrotask(() => { if (openProps === k && engine.scriptStatements[k])
                mountInspector(k, engine.scriptStatements[k]); });
        }
        rows = new Map();
        rowHeld.clear(); // new rows start empty: their status is painted fresh
        const stmts = engine.scriptStatements;
        if (renderedStatements !== stmts)
            lastDistance.clear(); // indices renumber with the script
        renderedStatements = stmts;
        if (!stmts.length) {
            body.appendChild(el('div', opts.mount ? 'satie-dt-hint' : 'satie-dt-warn', opts.mount ? 'Your soundscape is empty. Drag a recording from Library, use +, or open script.' : 'no script loaded'));
            return;
        }
        // line numbers from a fresh parse of the text: a live edit keeps the engine's statement objects (so
        // nothing restarts), and their sourceLine goes stale when an edit adds lines above them (saving a
        // group heads the script with a line, and every sound's "edit" went grey)
        const fresh = script ? tryParse(script).statements : null;
        blockMap = script ? mapStatements(script, fresh && fresh.length === stmts.length ? fresh : stmts) : null;
        // Hierarchy: the object is the parent, its voices the children (a prefab). Entities group by
        // entity, hosted voices by their `at` object, the rest belong to the scene itself.
        const groups = new Map();
        const mixGroups = mixGroupsNow();
        // Collections are filters, not ownership: an object's sounds stay together in both scopes.
        const listenerHost = layer?.listenerHost?.() ?? null;
        const hostIds = [...new Set([...(layer?.hosts?.().map(h => h.id) ?? []), ...stmts.map(st => st.hostRef).filter((h) => !!h)])];
        const families = hostClassesOf(hostIds, new Set(listenerHost ? [listenerHost] : []));
        knownKinds = new Set(families.keys());
        const parts = wholeMap();
        const groupCtx = { families, listenerHost, withOf: (ev) => layer?.eventInfo?.(ev)?.with, byOf: (ev) => layer?.eventInfo?.(ev)?.by, kinds: knownKinds, wholeOf: (h) => parts.get(h) };
        // Two lenses (2026-10-18): "in view" lists the particular things on screen, each its own header
        // (car 3, then its sounds); "all sounds" lists the general, a family of objects as one class (cars,
        // then its sounds, then each car). An entity's spawned instances share statements: one row either way.
        const instanceCtx = { ...groupCtx, families: new Map() };
        stmts.forEach((st, i) => {
            // (looking through a group, the list is its own things one by one, never their whole class: 2 palms, not 60)
            const key = objectKeyFor(st, scope === 'here' || groupFilter ? instanceCtx : groupCtx);
            const withHost = key.startsWith('host:') && key.slice(5) !== st.hostRef ? key.slice(5) : undefined;
            let g = groups.get(key);
            if (!g) {
                g = { label: key === 'listener' ? 'you' : key.startsWith('family:') ? key.slice(7) : st.entityId ?? withHost ?? st.hostRef ?? 'scene', kind: key.startsWith('family:') || st.entityId ? 'entity' : key === 'listener' || st.hostRef ? 'object' : 'scene', members: [] };
                groups.set(key, g);
            }
            g.members.push(i);
        });
        groupInfo = new Map();
        const youHost = layer?.listenerHost?.() ?? null;
        // how many sounds a thing has, counted as the mix counts them (2026-11-13: the train said 4 here and 5 there): a
        // class's sound once for all its copies; one thing's own sounds one by one
        const classN = new Map();
        if (scope !== 'here' && !groupFilter)
            for (const x of editSounds())
                classN.set(x.thing.key, (classN.get(x.thing.key) ?? 0) + 1);
        for (const [key, g] of groups) {
            // what the thing's sounds do, in words: "open, close", "footsteps, hands"
            const actions = [...new Set(g.members.map(m => actionOf(stmts[m])))];
            const nSounds = classN.get(key) ?? g.members.length;
            const where = `${nSounds} sound${nSounds === 1 ? '' : 's'} · ${actions.length > 3 ? `${actions.slice(0, 3).join(', ')} +${actions.length - 3}` : actions.join(', ')}`;
            const label = key === 'listener' || key === `host:${youHost}` ? 'you' : g.kind === 'scene' ? 'the scene' : g.kind === 'object' ? hostName(g.label) : g.label.replace(/_/g, ' ');
            groupInfo.set(key, { label, members: g.members, where, header: null, sub: null });
        }
        const renderRow = (st, i, child, copyOf) => {
            const row = el('div', 'satie-dt-row');
            row.dataset.child = child ? '1' : '0';
            row.tabIndex = 0;
            if (copyOf !== undefined)
                row.dataset.copy = '1';
            row.style.setProperty('--c', voiceColor(i));
            const { kind, what, meta } = labelOf(st);
            const name = el('div', 'name');
            const sk = soundKind(st);
            const kindEl = el('span', 'kind', `sound · ${KINDS[sk].label}`);
            kindEl.dataset.k = sk;
            kindEl.title = `${KINDS[sk].title} (${kind.toLowerCase()})`;
            const whatEl = el('span', 'what', what);
            // the title gets the row's width; what kind of sound it is sits on the line under it, after the place
            // a row is a thing: the object on top, what it does under it (under a thing's header, only what it does);
            // a background sound is its sound, all around; a sound with no object is its sound, in the scene
            const hosted = !!st.hostRef && !isAround(st) && !child;
            // the sound's name is its title everywhere (the hearing strip, the world label); its place is under it
            // one copy of a repeated sound is named by what tells it apart (the flock it is on), under its sound's row
            const title = el('span', 'host', copyOf ?? nameOf(st));
            renameable(title, () => nameOf(st), to => renameSound(i, to), 'this sound');
            name.append(el('span', 'sw'), title);
            // a counted recording plays as N tracks of one statement: the same "×N" as a counted generated sound
            if (st.count > 1 && copyOf === undefined)
                name.appendChild(el('span', 'cnt', ` ×${st.count}`));
            // an event says what it happens with ("at the vending machine") or where it lands ("on 9 surfaces")
            const info = st.eventName ? layer?.eventInfo?.(st.eventName) : undefined;
            const byYou = !!st.hostRef && st.hostRef === layer?.listenerHost?.();
            const kindWith = !!info?.with && knownKinds.has(info.with);
            // each card says what its place does not: in "you" which kind it is done with, under that kind who does it
            const context = kindWith ? (isYours(st) ? `with a ${info.with.replace(/_/g, ' ')}` : info.by && info.by === layer?.listenerHost?.() ? 'by you' : '')
                : info?.with ? (byYou ? 'by you' : `at the ${hostName(info.with)}`) : info?.surfaces?.length ? `on ${info.surfaces.length} surfaces` : '';
            const onEvent = st.kind === 'trigger' && st.eventName && !nameOf(st).toLowerCase().includes(st.eventName.toLowerCase()) ? `on ${st.eventName}` : '';
            const doing = actionOf(st) !== nameOf(st) ? actionOf(st) : '';
            // a part of a thing says which part (the train's front wheels), its whole is the header above it
            const part = child && st.hostRef && wholeMap().has(st.hostRef) ? hostName(st.hostRef) : '';
            const where = isAround(st) ? `${st.hostRef ? hostName(st.hostRef) + ' · ' : ''}all around` : child ? [part, onEvent || (givenName(st) ? doing : ''), context].filter(Boolean).join(' · ') : hosted ? [hostName(st.hostRef), doing, context].filter(Boolean).join(' · ') : st.propertySpans.has('place') ? 'a spot of its own' : playsWhereFired(st) ? 'where the game sets it off' : 'in the scene';
            whatEl.textContent = where ? where + ' ·' : '';
            whatEl.dataset.full = what;
            whatEl.append(kindEl);
            name.appendChild(whatEl);
            const lv = el('span', 'lv mono', '');
            const ctl = el('div', 'ctl');
            const ms = el('div', 'ms');
            const mute = el('button', undefined, 'M');
            mute.title = 'mute: silence this sound';
            const solo = el('button', undefined, 'S');
            solo.title = 'solo: hear only this, exactly as it plays where you stand (walk closer and it gets louder); you turn to face it';
            ms.append(mute, solo);
            const gain = opts.levelFaders ? levelFader(`source:${st.sourceId}`, nameOf(st), st.sourceId ? [st.sourceId] : []) : el('input');
            const trim = el('span', 'trim', '');
            const fmtTrim = fmtLevel;
            if (opts.levelFaders) {
                const showTrim = () => { trim.textContent = opts.levelFaders ? faderText(gain) : fmtTrim(0); };
                showTrim();
                gain.addEventListener('input', showTrim);
                gain.addEventListener('satie-mirror', showTrim);
            }
            else
                trim.hidden = true;
            if (!opts.levelFaders) {
                gain.type = 'range';
                gain.min = '0';
                gain.max = '1.5';
                gain.step = '0.01';
                gain.value = String(gainOf.get(i) ?? 1);
                gain.title = 'gain';
                gain.addEventListener('input', () => { const v = parseFloat(gain.value); gainOf.set(i, v); documentVersion++; dirty = true; engine.setStatementVolume(i, v); });
                gain.addEventListener('change', () => record('gain', { voice: voiceContext(i), gain: parseFloat(gain.value) }));
            }
            // a voice with nothing to play: its take failed or was never bought (the log's generation warning)
            const noAudio = !(st.kind === 'trigger' && !!st.genPrompt && /\{\w+\}/.test(st.genPrompt)) && !engine.getAudioBuffers().has(pathFor(st.clip));
            // one line of what it sounds like; the full prompt and the technical facts are in edit (and the tooltip)
            const sub = el('span', 'sub', `${noAudio ? 'no audio · ' : ''}${describeOf(st)}`);
            sub.title = noAudio ? 'No take loaded for this sound, so it is silent. Swap it, or ask SATIE to recompose it.' : `${what}${meta ? ' · ' + meta : ''}`;
            // when it plays, under what it sounds like: the event, repeat, zone, gate, reach
            const when = whenItPlays(st);
            if (when.length)
                sub.appendChild(el('span', 'wh', `plays ${when.join(' · ')}`));
            if (noAudio)
                row.dataset.noaudio = '1';
            const acts = el('div', 'acts');
            const isTemplateEvent = st.kind === 'trigger' && !!st.genPrompt && /\{\w+\}/.test(st.genPrompt);
            // ▶ hear this sound now, up close, whatever the game is doing (a bell with no train, a still door)
            {
                const fire = el('button', 'quiet fire pv');
                fire.dataset.state = 'idle';
                fire.innerHTML = ICON.play;
                const keys = takeKeysFor(st);
                fire.title = keys.length ? 'hear it now, up close (one take at its own level, even if the game has it silent; the rest of the scene dips)' : 'no take loaded for this sound';
                fire.disabled = !keys.length;
                if (keys.length)
                    fire.addEventListener('click', () => playNow(i, fire));
                acts.appendChild(fire);
            }
            if (layer?.goTo && !isAround(st) && soundKind(st) !== 'yours' && soundKind(st) !== 'contact') {
                const go = el('button', 'quiet', 'go');
                go.title = 'go there: stand next to this sound, facing it';
                go.addEventListener('click', () => { layer.goTo([i]); if (selIdx !== i)
                    selectVoice(i); });
                acts.appendChild(go);
            }
            if (opts.editPanel && st.sourceId) {
                const mx = el('button', 'quiet', 'mix');
                mx.title = 'open the mix at this sound: its takes, and the library around it';
                mx.addEventListener('click', () => { openEdit({ sound: st.sourceId }); });
                acts.appendChild(mx);
            }
            const swap = el('button', 'quiet', 'swap');
            swap.title = 'describe the sound you want: library recordings and new takes to audition, then use one';
            const edit = el('button', 'quiet', 'edit');
            edit.title = 'the voice\'s properties: level, place, effects, timing';
            const del = el('button', 'quiet x', '×');
            del.title = 'delete this voice';
            const feedback = el('button', 'quiet', 'feedback');
            feedback.disabled = !recorder;
            feedback.addEventListener('click', () => { openFeedback = openFeedback === i ? null : i; buildMixer(); });
            // delete is one click to the bin (restore it there, or undo); what you keep, swap and delete is the feedback
            del.className = 'quiet trash';
            del.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
            del.title = 'delete: to the bin (restore it there, or undo)';
            del.setAttribute('aria-label', 'Delete to the bin');
            void feedback;
            const menu = el('div');
            const more = el('span');
            void more;
            const rowAsk = null;
            // one way in: the sound's panel (what it is, how and when it plays, ask SATIE); swap is its first part
            swap.hidden = true;
            // "edit" left the row (2026-11-12): "mix" opens the sound; level stays on the row, the rest is the chat's
            if (!opts.editPanel)
                acts.append(edit);
            acts.append(del);
            if (opts.localStorageKey)
                feedback.hidden = true;
            ctl.append(gain, trim, acts);
            mute.addEventListener('click', () => { setMuted([i], !isMuted(i)); commitMix(); record('mute', { voice: voiceContext(i), muted: isMuted(i) }); syncMixer(); });
            solo.addEventListener('click', () => { const next = new Set(engine.soloedIndices); if (next.has(i))
                next.delete(i);
            else
                next.add(i); engine.setSoloIndices(Array.from(next)); commitMix(); record('solo', { voice: voiceContext(i), soloed: next.has(i) }); if (next.has(i))
                onSoloed(i); syncMixer(); });
            // Click a row to isolate it in the world, double-click to turn toward it; controls keep their own clicks.
            ctl.addEventListener('click', e => e.stopPropagation());
            ctl.addEventListener('dblclick', e => e.stopPropagation());
            // one click: select and turn to face it; double-click: go there
            row.addEventListener('click', e => { if (making || e.shiftKey || e.metaKey || e.ctrlKey) {
                e.preventDefault();
                toggleMulti(i, true);
                return;
            } const was = selIdx === i; selectVoice(i); if (!was)
                focusVoices([i]); });
            row.addEventListener('dblclick', e => { e.preventDefault(); if (selIdx !== i)
                selectVoice(i); if (layer?.goTo && !isAround(st) && !playsWhereFired(st))
                layer.goTo([i]); });
            row.addEventListener('keydown', e => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                selectVoice(i);
            } });
            row.addEventListener('pointerenter', () => setHover(i, true));
            row.addEventListener('pointerleave', () => { if (hoverIdx === i)
                setHover(null, true); });
            const editable = !!blockMap?.get(i) && !st.entityId;
            // a crowd's member opens its own card (its block is inside the crowd's); delete and swap stay with the crowd
            const memberEditable = !!st.entityId;
            const isTemplate = st.kind === 'trigger' && !!st.genPrompt && /\{\w+\}/.test(st.genPrompt);
            if (!editable) {
                swap.disabled = true;
                del.disabled = true;
                edit.disabled = !memberEditable;
                swap.title = del.title = edit.title = 'edit this one in the script tab';
            }
            if (isTemplate) {
                swap.disabled = true;
                swap.title = 'a {text} template resolves per surface; realize buys its takes';
            }
            swap.addEventListener('click', () => { openDrawer = openDrawer === i ? null : i; drawerPrompt = openDrawer === i; openProps = null; buildMixer(); });
            edit.title = 'this sound: what it is (its takes), how and when it plays, or ask SATIE';
            edit.addEventListener('click', () => { openProps = openProps === i ? null : i; openDrawer = null; finder = null; buildMixer(); });
            del.addEventListener('click', () => deleteVoice(i));
            swap.dataset.on = openDrawer === i ? '1' : '0';
            edit.dataset.on = openProps === i ? '1' : '0';
            row.dataset.open = openDrawer === i || openProps === i ? '1' : '0';
            row.dataset.sel = isSelected(i) ? '1' : '0';
            row.dataset.exp = selIdx === i || openDrawer === i || openProps === i ? '1' : '0';
            row.dataset.satie = satieJustChanged(st.sourceId) ? '1' : '0';
            row.append(name, lv, ms, sub, ctl);
            void menu;
            void rowAsk;
            const item = el('div', 'satie-dt-item');
            item.dataset.i = String(i);
            item.appendChild(row);
            listHost.appendChild(item);
            let drawer = null;
            if (openDrawer === i) {
                drawer = buildDrawer(i, st);
                item.appendChild(drawer);
            }
            // (the open sound's editor is mounted after the list, whether or not its row is shown)
            if (openFeedback === i)
                item.appendChild(buildFeedback(i, st));
            rows.set(i, { row, item, lv, mute, solo, gain, drawer });
        };
        const listHost = el('div', 'satie-dt-list2');
        // Both views list the same units, top to bottom: the background (one box, closed until opened),
        // then one unit per thing (a single row, or a header naming what its sounds do with the sounds
        // under it): things around you nearest first, groups of one kind, what you carry, the scene.
        // "In view" shows only the units in front of you, closed until you open one or pick it in the world.
        units = [];
        const around = stmts.map((st, i) => (isAround(st) ? i : -1)).filter(i => i >= 0);
        bedHead = null;
        bedBox = null;
        groupsBox = null;
        youHead = null;
        // the groups: yours first, then the game's own that cut across things (a group that is exactly one class
        // or one sound repeats a header, so it is left out); clicking one looks at the list through it
        const groupsHere = mixGroupsNow();
        const classOf = (i) => objectKeyFor(stmts[i], groupCtx);
        const repeatsList = (g) => {
            const idx = stmts.map((st, i) => (st.sourceId && g.sourceIds.includes(st.sourceId) ? i : -1)).filter(i => i >= 0);
            if (!idx.length || new Set(idx.map(leadOf)).size === 1)
                return true;
            const cls = new Set(idx.map(classOf));
            if (cls.size !== 1)
                return false;
            const k = [...cls][0];
            return stmts.every((_, i) => classOf(i) !== k || idx.includes(i));
        };
        const yours = groupsHere.filter(g => g.saved), theirs = groupsHere.filter(g => !g.saved && !repeatsList(g));
        // what you make or carry (the player's own thing): its sounds are the top row's "you", not a thing in the list
        const youKey = groups.has('listener') ? 'listener' : youHost && groups.has(`host:${youHost}`) ? `host:${youHost}` : null;
        const yourSounds = youKey ? groups.get(youKey).members.filter(m => !isAround(stmts[m])) : [];
        // The top row (2026-10-18): background, you, groups, three tabs on one line; the open one's content below.
        // All three sit outside the list of things; groups wears its dashed "group" mark (a lens, not sounds).
        const tabsHere = [];
        if (around.length)
            tabsHere.push(['bg', 'background', bySound(around).length]);
        if (yourSounds.length)
            tabsHere.push(['you', 'you', yourSounds.length]);
        if (!groupFilter && (yours.length || theirs.length))
            tabsHere.push(['groups', 'groups', yours.length + theirs.length]);
        if (shelfOpen && !tabsHere.some(([t]) => t === shelfOpen))
            shelfOpen = null;
        let fillShelf = null;
        if (tabsHere.length) {
            const shelf = el('div', 'satie-dt-bedbox satie-dt-shelf');
            // an entity's header sticks just under the shelf while you scroll through its sounds
            shelfSize?.disconnect();
            shelfSize = new ResizeObserver(() => body.style.setProperty('--shelfh', `${shelf.offsetHeight}px`));
            shelfSize.observe(shelf);
            const row = el('div', 'shelf-tabs');
            const pair = el('div', 'shelf-pair');
            for (const [t, label, n] of tabsHere) {
                const b = el('button', 'shelf-tab');
                b.dataset.tab = t;
                b.dataset.on = shelfOpen === t ? '1' : '0';
                b.setAttribute('aria-expanded', String(shelfOpen === t));
                b.title = t === 'bg' ? 'the sounds all around you (beds and fields)' : t === 'you' ? 'the sounds you make or carry' : "sets of sounds to look at together: yours, and the game's own";
                // one look for all three: a label and its count; background and you carry a live dot (they sound)
                b.append(...(t === 'groups' ? [] : [el('span', 'dot')]), el('span', 'l', label), el('span', 'n', String(n)));
                b.addEventListener('click', () => { shelfOpen = shelfOpen === t ? null : t; buildMixer(); });
                if (t === 'bg')
                    bedHead = b;
                else if (t === 'you')
                    youHead = b;
                if (t === 'groups') {
                    b.classList.add('lens');
                    if (pair.childElementCount)
                        row.appendChild(pair);
                    row.appendChild(b);
                }
                else
                    pair.appendChild(b);
            }
            if (pair.childElementCount && pair.parentElement !== row)
                row.appendChild(pair);
            shelf.appendChild(row);
            shelf.dataset.open = shelfOpen ? '1' : '0';
            shelf.dataset.tab = shelfOpen ?? '';
            // a fixed height that scrolls inside (twenty background sounds do not push the list away); "close" stays below
            const panel = el('div', 'shelf-panel'), pbody = el('div', 'shelf-body');
            panel.appendChild(pbody);
            if (shelfOpen)
                shelf.appendChild(panel);
            bedBox = shelf;
            listHost.appendChild(shelf);
            // the open tab's rows are filled once the row builders below exist; "close" ends the block
            fillShelf = () => {
                queueMicrotask(() => {
                    if (!shelfOpen || !panel.isConnected)
                        return;
                    const close = el('button', 'shelf-close');
                    close.append(document.createTextNode('close'), el('span', undefined, '▴'));
                    close.addEventListener('click', () => { shelfOpen = null; buildMixer(); });
                    panel.appendChild(close);
                });
                if (shelfOpen === 'bg')
                    for (const copies of bySound(around)) {
                        if (copies.length > 1) {
                            pbody.appendChild(kindRow(`around|${copies[0]}`, copies, true));
                            continue;
                        }
                        renderRow(stmts[copies[0]], copies[0], false);
                        pbody.appendChild(rows.get(copies[0]).item);
                    }
                else if (shelfOpen === 'you' && youKey)
                    appendMembers(pbody, youKey, yourSounds);
                else if (shelfOpen === 'groups') {
                    const add = el('button', 'grow gnew', '+ new group');
                    add.title = 'make a group: name it, then click the things or sounds it holds (here or in the game)';
                    add.addEventListener('click', startMaking);
                    pbody.appendChild(add);
                    for (const [title, list] of [['yours', yours], ['from the game', theirs]]) {
                        if (!list.length)
                            continue;
                        pbody.appendChild(el('div', 'gsec', title));
                        for (const g of list) {
                            const idx = stmts.map((st, i) => (st.sourceId && g.sourceIds.includes(st.sourceId) ? i : -1)).filter(i => i >= 0);
                            const things = new Set(idx.map(i => stmts[i].hostRef ?? `scene:${i}`)).size;
                            const row = el('button', 'grow');
                            row.append(el('span', 'gn', g.label), el('span', 'gc', `${idx.length} sound${idx.length === 1 ? '' : 's'} · on ${things} thing${things === 1 ? '' : 's'}`));
                            row.title = `look at the list through "${g.label}": only its sounds, on their things`;
                            row.addEventListener('click', () => { groupFilter = `mix:${g.id}`; buildMixer(); });
                            row.addEventListener('pointerenter', () => hoverGroup(idx, g.label, `${idx.length} sounds`));
                            row.addEventListener('pointerleave', () => hoverGroup(null));
                            pbody.appendChild(row);
                        }
                    }
                }
            };
        }
        /**
         * A group's sounds, with repeats folded: sounds with the same name (the same coo on three flocks, the
         * same tyre on nine cars) are one row, "×3", whose mute, solo and selection act on all of them; open
         * it to see each copy, named by what tells them apart. The rule is the names, not the kind of sound.
         */
        const appendMembers = (parent, gkey, members) => {
            const same = new Map();
            const kindKey = (m) => `${stmts[m].kind}|${stmts[m].eventName ?? ''}|${nameOf(stmts[leadOf(m)])}`;
            for (const m of members)
                same.set(kindKey(m), [...(same.get(kindKey(m)) ?? []), m]);
            const drawn = new Set();
            for (const m of members) {
                const k = kindKey(m), copies = same.get(k);
                if (copies.length < 2) {
                    renderRow(stmts[m], m, true);
                    parent.appendChild(rows.get(m).item);
                    continue;
                }
                if (drawn.has(k))
                    continue;
                drawn.add(k);
                parent.appendChild(kindRow(`${gkey}|${k}`, copies));
            }
        };
        const kindRow = (id, copies, top = false) => {
            const open = kindOpen.has(id);
            const st = stmts[copies[0]];
            const box = el('div', 'satie-dt-kindbox');
            const row = el('div', 'satie-dt-row satie-dt-kind');
            row.dataset.child = top ? '0' : '1';
            row.tabIndex = 0;
            row.style.setProperty('--c', voiceColor(copies[0]));
            const name = el('div', 'name');
            const tri = el('button', 'tri', open ? '▾' : '▸');
            tri.title = open ? 'back to one row for all of them' : 'each one on its own';
            tri.setAttribute('aria-expanded', String(open));
            tri.addEventListener('click', e => { e.stopPropagation(); if (!kindOpen.delete(id))
                kindOpen.add(id); buildMixer(); });
            // what tells the copies apart: the things they are on, by their kind when they are one kind ("on 62
            // cars", not "on Actual stable vehicle 0, Actual stable vehicle 1 ..."), else by name, else how many
            const hostIds = [...new Set(copies.map(i => stmts[i].hostRef).filter((h) => !!h && h !== layer?.listenerHost?.()))];
            const kinds = new Set(hostIds.map(h => /^(.+?)[_-]\d+$/.exec(h)?.[1] ?? null));
            const oneKind = hostIds.length > 1 && kinds.size === 1 ? [...kinds][0] : null;
            const hosts = hostIds.map(hostName);
            const title = el('span', 'host', nameOf(st));
            name.append(tri, el('span', 'sw'), title, el('span', 'cnt', ` ×${copies.length}`));
            const what = el('span', 'what', oneKind ? `on ${hostIds.length} ${pluralOf(oneKind.replace(/_/g, ' '))}`
                : hosts.length > 3 ? `on ${hosts.length} things` : hosts.length > 1 ? `on ${hosts.join(', ')}` : `${copies.length} copies`);
            name.appendChild(what);
            const lv = el('span', 'lv mono', '');
            const ms = el('div', 'ms');
            const allMuted = () => copies.every(i => isMuted(i)), allSolo = () => copies.every(i => engine.soloedIndices.has(i));
            const mute = el('button', undefined, 'M');
            mute.title = `mute all ${copies.length}`;
            const solo = el('button', undefined, 'S');
            solo.title = `solo all ${copies.length}`;
            mute.addEventListener('click', e => { e.stopPropagation(); const was = allMuted(); setMuted(copies, !was); commitMix(); record('mute_selection', { muted: !was, voices: copies.map(voiceContext) }); syncMixer(); });
            solo.addEventListener('click', e => { e.stopPropagation(); const was = allSolo(), next = new Set(engine.soloedIndices); for (const i of copies) {
                if (was)
                    next.delete(i);
                else
                    next.add(i);
            } engine.setSoloIndices([...next]); commitMix(); record('solo_selection', { soloed: !was, voices: copies.map(voiceContext) }); syncMixer(); });
            ms.append(mute, solo);
            row.append(name, lv, ms);
            // one fader for all the copies (2026-10-16): the same relative move as a thing's fader, each copy
            // keeping its own level and its own fader when opened
            const kindIds = [...new Set(copies.map(i => stmts[i].sourceId).filter((x) => !!x))];
            if (opts.levelFaders && kindIds.length) {
                const ctl = el('div', 'ctl');
                const f = levelFader(`kind:${id}`, nameOf(st), kindIds);
                const gv = el('span', 'gtrim', '');
                const show = () => { gv.textContent = `all ${copies.length} · ${faderText(f)}`; };
                f.title = `moves all ${copies.length} ${nameOf(st)} together; each keeps its own level`;
                show();
                f.addEventListener('input', show);
                f.addEventListener('satie-mirror', show);
                for (const ev of ['click', 'pointerdown']) {
                    f.addEventListener(ev, e => e.stopPropagation());
                    ctl.addEventListener(ev, e => e.stopPropagation());
                }
                ctl.append(gv, f);
                row.appendChild(ctl);
            }
            // a click selects all of them (the level and "ask" in the selection bar act on all), as in the world
            row.addEventListener('click', () => { if (making) {
                toggleMany(copies);
                return;
            } multiSel.clear(); selIdx = null; selGroupKey = null; for (const i of copies)
                multiSel.add(i); applySelection(); focusVoices(copies); });
            row.addEventListener('pointerenter', () => hoverGroup(copies, nameOf(st), `${copies.length} copies`));
            row.addEventListener('pointerleave', () => hoverGroup(null));
            row.dataset.sel = copies.every(isSelected) ? '1' : '0';
            kindRows.push({ row, lv, mute, solo, copies });
            box.appendChild(row);
            // copies of one block share it: editing or deleting any of them changes the sound, all of them
            const oneSound = copies.every(i => leadOf(i) === leadOf(copies[0]));
            if (open)
                for (const i of copies) {
                    const host = stmts[i].hostRef;
                    if (focusHost !== null && host === focusHost)
                        continue; // shown in the picked object's group at the top
                    const copyNo = stmts[i].isCountVariant ? stmts[i].countIndex + 1 : copies.indexOf(i) + 1;
                    renderRow(stmts[i], i, true, host && host !== layer?.listenerHost?.() ? hostName(host) : `${nameOf(st)} ${copyNo}`);
                    const item = rows.get(i).item;
                    if (oneSound)
                        for (const b of item.querySelectorAll('.acts button')) {
                            if (b.classList.contains('trash'))
                                b.title = `delete this sound: all ${copies.length} copies (restore it from the bin, or undo)`;
                            else if (b.textContent === 'edit')
                                b.title = `this sound, for all ${copies.length} copies: what it is, how and when it plays`;
                        }
                    box.appendChild(item);
                }
            return box;
        };
        kindRows = [];
        fillShelf?.();
        // the object picked in the world: its sounds, each its own row (its own fader, edit), at the top
        // (in view every object is already its own header: the picked one opens there instead)
        if (focusHost !== null && scope === 'here')
            hereOpen.add(`host:${focusHost}`);
        if (focusHost !== null && scope !== 'here') {
            const fh = focusHost;
            const members = stmts.map((st, i) => (st.hostRef === fh && !isAround(st) ? i : -1)).filter(i => i >= 0);
            if (!members.length)
                focusHost = null;
            else {
                const unit = el('div', 'satie-dt-unit satie-dt-focus');
                const h = el('div', 'satie-dt-grp');
                h.dataset.collapsed = '0';
                const name = el('div', 'place');
                name.append(el('span', 'host', hostName(fh)), el('span', 'cnt', ` · ${members.length} sound${members.length === 1 ? '' : 's'}`));
                const kind = /^(.+?)[_-]\d+$/.exec(fh)?.[1];
                const family = kind ? families.get(kind) : undefined;
                if (family && family.length > 1)
                    name.appendChild(el('span', 'what', `one of the ${family.length} ${pluralOf(kind.replace(/_/g, ' '))}: its sounds only`));
                const close = el('button', 'quiet x', '×');
                close.title = 'back to the whole list';
                close.setAttribute('aria-label', 'Close this object');
                close.addEventListener('click', e => { e.stopPropagation(); clearSelection(); });
                h.append(name, close);
                unit.appendChild(h);
                for (const i of members) {
                    renderRow(stmts[i], i, true);
                    unit.appendChild(rows.get(i).item);
                }
                listHost.appendChild(unit);
            }
        }
        const section = (key, kind) => key === 'listener' || key === `host:${youHost}` ? -1 : kind === 'scene' ? 3 : kind === 'entity' ? 1 : 0;
        // all sounds is the class view, a fixed catalogue: by section, then by name (where you stand does not
        // reorder it); in view is ordered nearest first by refreshList
        const byName = (a, b) => (groupInfo.get(a)?.label ?? a).localeCompare(groupInfo.get(b)?.label ?? b, undefined, { numeric: true });
        const ordered = [...groups].map(([key, g]) => [key, { ...g, members: g.members.filter(m => !isAround(stmts[m])) }])
            .filter(([, g]) => g.members.length)
            .sort(([ka, a], [kb, b]) => section(ka, a.kind) - section(kb, b.kind) || (scope === 'all' ? byName(ka, kb) : distanceOf(a.members) - distanceOf(b.members)));
        // a redraw keeps the order you were looking at (opening a group re-sorted every group by its distance
        // at that moment, so the one you opened moved away); only a thing new to the list is slotted in by distance
        if (groupOrder.length && scope === 'here') {
            const was = new Map(groupOrder.map((k, n) => [k, n]));
            const kept = ordered.filter(([k]) => was.has(k)).sort(([a, ga], [b, gb]) => (section(a, ga.kind) === -1 ? -1 : 0) - (section(b, gb.kind) === -1 ? -1 : 0) || was.get(a) - was.get(b));
            for (const item of ordered.filter(([k]) => !was.has(k))) {
                const at = kept.findIndex(([k, g]) => section(item[0], item[1].kind) - section(k, g.kind) < 0 || (section(item[0], item[1].kind) === section(k, g.kind) && distanceOf(item[1].members) < distanceOf(g.members)));
                kept.splice(at < 0 ? kept.length : at, 0, item);
            }
            ordered.splice(0, ordered.length, ...kept);
        }
        groupOrder = ordered.map(([k]) => k);
        for (const [key, g] of ordered) {
            const info = groupInfo.get(key);
            info.members = g.members;
            if (key === youKey)
                continue; // in the top row's "you"
            // An object that makes one sound is one row (its object is on the row); a header only groups two or more.
            const personal = key === 'listener' || key === `host:${youHost}`;
            // in view a thing is always a header, one sound or four (palm 24 ▸ palm leaves, as car 3 ▸ its sounds)
            // a thing whose only sound spans it (the ocean along a shore, a river) is that sound: one row, as on no thing
            const spans = g.members.length === 1 && !!stmts[g.members[0]]?.line;
            const single = g.members.length === 1 && g.kind !== 'mix' && !key.startsWith('family:') && !personal && (spans || !((scope === 'here' || groupFilter) && g.kind === 'object'));
            // sounds on no thing are not a group ("the scene" bundled the irrigation water with a motor and a
            // cat): each is its own row
            if (g.kind === 'scene') {
                // ...but one sound's copies are one entry ("heavy water drop ×12"), not twelve identical rows
                for (const copies of bySound(g.members)) {
                    const u = el('div', 'satie-dt-unit');
                    units.push({ el: u, key: `${key}:${copies[0]}`, members: copies, section: section(key, g.kind) });
                    listHost.appendChild(u);
                    if (copies.length > 1)
                        u.appendChild(kindRow(`${key}|${copies[0]}`, copies, true));
                    else {
                        renderRow(stmts[copies[0]], copies[0], false);
                        u.appendChild(rows.get(copies[0]).item);
                    }
                }
                continue;
            }
            const unit = el('div', 'satie-dt-unit');
            if (key === 'listener' || key === `host:${youHost}`)
                unit.dataset.personal = '1';
            units.push({ el: unit, key, members: g.members, section: section(key, g.kind) });
            listHost.appendChild(unit);
            if (single) {
                renderRow(stmts[g.members[0]], g.members[0], false);
                unit.appendChild(rows.get(g.members[0]).item);
                continue;
            }
            const open = personal ? youOpen : scope === 'here' ? hereOpen.has(key) : allOpen.has(key);
            const h = el('div', 'satie-dt-grp');
            info.header = h;
            h.dataset.collapsed = open ? '0' : '1';
            h.dataset.sel = key === selGroupKey ? '1' : '0';
            const tri = el('button', 'tri', open ? '▾' : '▸');
            tri.title = open ? 'collapse' : 'expand';
            tri.setAttribute('aria-expanded', String(open));
            const toggle = () => {
                if (personal)
                    youOpen = !youOpen;
                else if (scope === 'here') {
                    if (!hereOpen.delete(key))
                        hereOpen.add(key);
                }
                else if (!allOpen.delete(key))
                    allOpen.add(key);
                if (openDrawer !== null && g.members.includes(openDrawer) && !(scope === 'here' ? hereOpen.has(key) : allOpen.has(key)))
                    openDrawer = null;
                // the header you clicked stays where it was on screen; its sounds open below it
                const y = h.getBoundingClientRect().top;
                buildMixer();
                const nh = groupInfo.get(key)?.header;
                if (nh)
                    body.scrollTop += nh.getBoundingClientRect().top - y;
            };
            tri.addEventListener('click', e => { e.stopPropagation(); toggle(); });
            tri.addEventListener('dblclick', e => e.stopPropagation());
            const name = el('div', 'gname');
            const place = el('span', 'pname', info.label);
            if (g.kind === 'object' && key !== `host:${youHost}`)
                renameable(place, () => hostName(g.label), to => void renamePlace(g.label, to), `this ${word('thing')}`);
            const saved = g.kind === 'mix' ? mixGroups.find(x => `mix:${x.id}` === key && x.saved) : undefined;
            if (saved)
                renameable(place, () => saved.label, to => changeGroup(saved.id, { label: to }), 'this group');
            name.appendChild(place);
            // what it does, how far, and whether it sounds now (kept current by syncMixer)
            info.sub = el('small', undefined, info.where);
            name.appendChild(info.sub);
            // Click the header: every sound in it lights up together (and it opens). Double-click: go there.
            // a click opens or closes the thing, and only that (it used to pick it too, so every other opening
            // came up green); ⌘/Shift adds all its sounds to the pick, one sound or four, without opening it
            // a click opens or closes it and, opening, turns the view to face it (no pick: no green); a second click
            // within DOUBLE_MS on the same thing is a double click: it undoes the first and goes there (the first
            // click redraws the list, so the browser's own dblclick never arrived)
            h.addEventListener('click', e => {
                if (making || e.shiftKey || e.metaKey || e.ctrlKey) {
                    toggleMany(g.members);
                    return;
                }
                const now = performance.now(), twice = lastHeaderClick.key === key && now - lastHeaderClick.at < DOUBLE_MS;
                lastHeaderClick = { key: twice ? '' : key, at: now };
                if (twice) {
                    toggle();
                    const placed = g.members.filter(m => stmts[m] && !isAround(stmts[m]));
                    if (layer?.goTo && placed.length)
                        layer.goTo(placed);
                    return;
                }
                // (2026-11-14) a click opens or closes it here; only its "mix" button opens the mix
                toggle();
                if (!open)
                    focusVoices(g.members.filter(m => stmts[m] && !isAround(stmts[m])));
            });
            // go there is the header's "go" button: a double click is two clicks, and the first already opens or closes it
            h.addEventListener('dblclick', e => e.preventDefault());
            const ms = el('div', 'ms');
            const gm = el('button', undefined, 'M');
            gm.title = 'mute all of these';
            const gs = el('button', undefined, 'S');
            gs.title = 'solo all of these';
            const allMuted = g.members.every(m => isMuted(m));
            const allSolo = g.members.every(m => engine.soloedIndices.has(m));
            gm.dataset.on = allMuted ? '1' : '0';
            gs.dataset.on = allSolo ? '1' : '0';
            info.m = gm;
            info.s = gs;
            gm.addEventListener('click', e => { e.stopPropagation(); setMuted(g.members, !allMuted); commitMix(); record('mute_group', { group: key, muted: !allMuted, voices: g.members.map(voiceContext) }); buildMixer(); });
            gs.addEventListener('click', e => { e.stopPropagation(); const next = new Set(engine.soloedIndices); for (const m of g.members) {
                if (allSolo)
                    next.delete(m);
                else
                    next.add(m);
            } engine.setSoloIndices(Array.from(next)); commitMix(); record('solo_group', { group: key, soloed: !allSolo, voices: g.members.map(voiceContext) }); if (!allSolo)
                focusVoices(g.members); buildMixer(); });
            ms.append(gm, gs);
            const placed = g.members.filter(m => stmts[m] && !isAround(stmts[m]));
            // go is for one thing (a car, a fountain), never a class of them (cars · 62 objects): which one would it be?
            if (layer?.goTo && placed.length && key.startsWith('host:') && key !== `host:${youHost}`) {
                const gg = el('button', 'gask', 'go');
                gg.title = g.kind === 'object' ? `go to the ${hostName(g.label)}` : 'go to these sounds';
                gg.addEventListener('click', e => { e.stopPropagation(); selectGroup(key, true); layer.goTo(placed); });
                ms.prepend(gg);
            }
            // the mix at this thing: its sounds together on the library sky
            const first = g.members.map(m => stmts[m]).find(st => !!st?.sourceId);
            if (opts.editPanel && first) {
                const gx = el('button', 'gask', 'mix');
                gx.title = `open the mix at the ${g.kind === 'object' ? hostName(g.label) : 'group'}: its sounds together`;
                gx.addEventListener('click', e => { e.stopPropagation(); openEdit({ sound: first.sourceId, thing: true }); });
                ms.prepend(gx);
            }
            // ask about this thing (all of its sounds) or this group: the same conversation, scoped to them
            const ga = el('button', 'gask', 'ask');
            ga.title = `ask SATIE about ${g.kind === 'object' ? `the ${hostName(g.label)} (all of its sounds)` : 'these sounds'}`;
            ga.addEventListener('click', e => {
                e.stopPropagation();
                askAbout(g.kind === 'object' && key !== `host:${youHost}` ? [{ kind: 'thing', id: g.label, label: hostName(g.label) }]
                    : g.members.map(m => stmts[m]).filter(st => !!st.sourceId).map(st => ({ kind: 'sound', id: st.sourceId, label: nameOf(st) })));
            });
            void ga; // asking about a thing or group: select it (its header), and "about" offers it
            // a crowd (an entity): its own card, the entity block (how many, how often one comes, how fast)
            if (key.startsWith('entity:')) {
                const ce = el('button', 'gask', 'edit');
                ce.title = 'the crowd: how many, how often one comes, how fast';
                ce.dataset.crowd = key.slice(7);
                ce.addEventListener('click', e => { e.stopPropagation(); openCrowd = openCrowd === key.slice(7) ? null : key.slice(7); openProps = null; finder = null; buildMixer(); });
                if (!opts.editPanel)
                    ms.prepend(ce);
            }
            if (saved) {
                const ug = el('button', 'gask ug', 'ungroup');
                ug.title = 'take the group apart (the sounds stay)';
                ug.addEventListener('click', e => { e.stopPropagation(); changeGroup(saved.id, null); });
                ms.prepend(ug);
            }
            const icon = el('span', 'gicon');
            icon.dataset.kind = saved || g.kind === 'mix' ? 'group' : key === 'listener' || key === `host:${youHost}` ? 'you' : 'thing';
            icon.title = icon.dataset.kind === 'group' ? 'a group you made' : icon.dataset.kind === 'you' ? 'what you carry' : 'a thing in the world: its sounds are under it';
            const family = key.startsWith('family:') ? families.get(key.slice(7)) : undefined;
            // a family says how many objects; a thing's sounds are under it, no count (it read as "5 s" and vanished on open)
            if (family || personal)
                place.appendChild(el('span', 'cnt', family ? `· ${family.length} objects` : `· ${g.members.length} sound${g.members.length === 1 ? '' : 's'}`));
            // what it is, said once on the header: a game entity (its sounds under it) or a group you made
            if (!personal) {
                const tg = el('span', 'etag', icon.dataset.kind === 'group' ? 'group' : 'entity');
                tg.title = icon.dataset.kind === 'group' ? 'a group you made: its sounds can be on different entities' : 'a game entity: an object in your game; the sounds under it play from it';
                place.appendChild(tg);
            }
            if (family)
                h.title = `All ${family.length} objects: controls affect the whole family, including objects outside your view. Expand a sound to select one instance.`;
            h.append(tri, personal ? el('span', 'dot') : icon, name);
            if (!personal)
                h.appendChild(ms);
            if (opts.levelFaders && open && !personal) {
                const f = levelFader(key, g.label, g.members.map(i => stmts[i].sourceId).filter((id) => !!id));
                const gv = el('span', 'gtrim', '');
                // the object makes no sound of its own: this moves all of its sounds together (a group fader), on a
                // line of its own under the name (beside it, the row ran past the panel and hid "S")
                const n = g.members.length;
                const show = () => { gv.textContent = `${n === 1 ? '1 sound' : `all ${n} sounds`} · ${faderText(f)}`; };
                f.title = n === 1 ? 'moves its sound' : `moves all ${n} of its sounds together; each sound keeps its own fader`;
                show();
                f.addEventListener('input', show);
                const ctl = el('div', 'gctl');
                for (const ev of ['click', 'pointerdown'])
                    ctl.addEventListener(ev, e => e.stopPropagation());
                ctl.append(gv, f);
                h.dataset.trim = '1';
                h.appendChild(ctl);
            }
            unit.appendChild(h);
            if (open)
                appendMembers(unit, key, g.members);
            h.addEventListener('pointerenter', () => hoverGroup(info.members, info.label, `${info.members.length} sounds`));
            h.addEventListener('pointerleave', () => hoverGroup(null));
        }
        // all sounds, in a world that names its places: each soundscape is a section you can fold (the top of the
        // hierarchy the mix uses: soundscape › game entity › sound); what belongs to none comes last
        const scapes = api.soundscapes()?.variants.soundscapes() ?? [];
        if (scope === 'all' && scapes.length > 1 && !groupFilter) {
            const sets = scapes.map(d => ({ d, ids: scapeSids(d.id) })), owner = new Map();
            for (const u of units) {
                const ids = u.members.map(m => stmts[m]?.sourceId).filter((x) => !!x);
                const k = sets.findIndex(x => ids.some(id => x.ids.has(id)));
                owner.set(u.el, k);
            }
            const heads = [];
            [...sets.map((x, k) => ({ label: x.d.label, k })), { label: 'in no soundscape', k: -1 }].forEach(({ label, k }) => {
                const mine = units.filter(u => owner.get(u.el) === k && u.el.parentElement === listHost);
                if (!mine.length)
                    return;
                const fold = scapeFold.has(label), h = el('button', 'satie-dt-scapehead');
                h.dataset.fold = fold ? '1' : '0';
                const n = mine.reduce((q, u) => q + u.members.length, 0);
                h.append(el('span', 'tri', fold ? '▸' : '▾'), el('i'), el('span', 'nm', label), el('small', undefined, `${n} sound${n === 1 ? '' : 's'}`));
                h.title = fold ? 'show this soundscape' : 'fold this soundscape';
                h.addEventListener('click', () => { if (!scapeFold.delete(label))
                    scapeFold.add(label); buildMixer(); });
                heads.push(h);
                listHost.appendChild(h);
                for (const u of mine) {
                    listHost.appendChild(u.el);
                    u.el.dataset.scapefold = fold ? '1' : '0';
                }
            });
        }
        body.append(selBar, groupBar, listHost);
        paintSelBar();
        paintGroupBar();
        // deleted sounds come back through history (undo / go back), not a separate bin
        buildTools();
        refreshList('rebuild');
    }
    // ── SATIE account for this dev server: one "Sign in with SATIE", then remembered on this machine ──
    const acct = el('span', 'acct');
    let account = null;
    const needsSignIn = (msg) => /sign in with satie|signin_required|not signed in/i.test(msg);
    function paintAccount() {
        acct.replaceChildren();
        if (account?.signedIn) {
            acct.textContent = account.email ? `SATIE · ${account.email}` : 'SATIE · signed in';
            acct.title = 'this dev server uses your SATIE account for search, takes and edits';
        }
        else if (account)
            acct.appendChild(signInButton());
    }
    async function refreshAccount() {
        // a published scene has no dev server to sign in through: forking is the way to your own account
        if (!authoring) {
            account = null;
            paintAccount();
            return;
        }
        try {
            account = await fetch(`${authUrl}/status`).then(r => r.json());
        }
        catch {
            account = null;
        }
        paintAccount();
    }
    /** Opens SATIE's sign-in in the browser (already signed in on satie.world: one click), then waits for it. */
    function signInButton(onDone) {
        const b = el('button', 'signin', 'Sign in with SATIE');
        b.title = 'once per computer: uses the SATIE account you already have (the same one as the SATIE MCP)';
        b.addEventListener('click', () => {
            void (async () => {
                b.disabled = true;
                b.textContent = 'opening SATIE…';
                try {
                    const r = await fetch(`${authUrl}/start`).then(x => x.json());
                    if (!r.ok || !r.url)
                        throw new Error(r.error ?? 'could not start sign-in');
                    window.open(r.url, 'satie-signin', 'width=520,height=720');
                    b.textContent = 'waiting for SATIE…';
                    const t0 = Date.now();
                    while (Date.now() - t0 < 5 * 60_000 && !destroyed) {
                        await new Promise(res => setTimeout(res, 1500));
                        await refreshAccount();
                        if (account?.signedIn) {
                            say('signed in to SATIE');
                            onDone?.();
                            return;
                        }
                    }
                    b.disabled = false;
                    b.textContent = 'Sign in with SATIE';
                }
                catch (e) {
                    b.disabled = false;
                    b.textContent = 'Sign in with SATIE';
                    say(`sign-in: ${e instanceof Error ? e.message : String(e)}`);
                }
            })();
        });
        return b;
    }
    addEventListener('message', e => { if (e.data?.satie === 'signed-in')
        void refreshAccount(); });
    void refreshAccount();
    // ── natural-language edits: tell SATIE, for the whole scene or one sound ──
    // ── Talking to SATIE: a conversation with SATIE's director (packages/satie-mcp/director.ts) ──
    // Knob-sized requests apply at once (the web's quick edit). Otherwise the director answers, asks
    // with numbered options (and "type your own"), offers sounds to compare (▶ plays each in place),
    // keeps the one you choose, or edits; several sounds, adds and removes come as a proposal first.
    // A sound's own box talks about that sound only. Every change lists what it did and can be undone.
    const chatUrl = opts.chatUrl ?? '/__satie/chat';
    const realizeUrl = opts.realizeUrl ?? '/__satie/realize';
    /** Where a request for the coding agent is written (the vite plugin: `.satie/requests/`). */
    const requestUrl = opts.requestUrl ?? '/__satie/request';
    /** Where the requests' status is read (the vite plugin: `.satie/requests/`). */
    const requestsUrl = `${requestUrl}s`;
    const convKey = `satie-chat:${scriptUrl ?? opts.localStorageKey ?? 'scene'}`;
    let convs = [];
    try {
        const saved = JSON.parse(localStorage.getItem(convKey) ?? '[]');
        if (Array.isArray(saved))
            convs = saved.filter(c => c && Array.isArray(c.thread));
    }
    catch {
        convs = [];
    }
    const newConv = () => ({ id: Math.random().toString(36).slice(2, 10), at: Date.now(), thread: [], transcript: [] });
    // a session starts a fresh conversation: an earlier one continues only when you open it
    let cur = newConv();
    convs.unshift(cur);
    let thread = cur.thread;
    let transcript = cur.transcript;
    let listOpen = false;
    let convSaveTimer;
    function saveConvs() {
        cur.thread = thread;
        cur.transcript = transcript;
        clearTimeout(convSaveTimer);
        convSaveTimer = setTimeout(() => {
            const keep = convs.filter(c => c.thread.length).slice(0, 40)
                .map(c => ({ id: c.id, at: c.at, lastAt: c.lastAt, title: c.title, thread: c.thread.filter(m => !m.pending && !m.activity), transcript: c.transcript.slice(-60), ...(c.agentReply ? { agentReply: c.agentReply } : {}) }));
            try {
                localStorage.setItem(convKey, JSON.stringify(keep));
            }
            catch { /* storage full: the conversation stays in this tab */ }
        }, 400);
    }
    const convTitle = (c) => (c.title ?? c.thread.find(m => m.role === 'you' && !/^\d+\.\s/.test(m.text))?.text ?? (c.thread.length ? 'conversation' : 'New chat')).replace(/^\[[^\]]*\]\s*/, '').slice(0, 70);
    const lastOf = (c) => c.lastAt ?? c.at;
    function ago(t) {
        const m = Math.round((Date.now() - t) / 60000);
        const clock = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return m < 1 ? `${clock} · just now` : m < 60 ? `${clock} · ${m} min ago` : m < 1440 ? `${clock} · ${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    function openConv(c) { cur = c; thread = c.thread; transcript = c.transcript; lastOp = null; listOpen = false; stopPreview(); paintChat(); }
    let chatScope = [];
    function scopeSourceIds(parts) {
        const stmts = engine.scriptStatements, ids = new Set();
        for (const p of parts) {
            if (p.kind === 'sound')
                ids.add(p.id);
            // a thing's sounds: those on it, and what you do with it ("drink" with the vending machine), as its group lists them
            else if (p.kind === 'thing')
                stmts.forEach(st => {
                    const withHost = st.eventName && st.hostRef && st.hostRef === layer?.listenerHost?.() ? layer?.eventInfo?.(st.eventName)?.with : undefined;
                    if ((st.hostRef === p.id || withHost === p.id) && st.sourceId)
                        ids.add(st.sourceId);
                });
            else
                for (const i of layer?.visibleIndices?.() ?? []) {
                    const id = stmts[i]?.sourceId;
                    if (id)
                        ids.add(id);
                }
        }
        return [...ids];
    }
    const scopeLabel = (parts) => parts.map(p => p.label).join(', ');
    const scopeChip = (p) => p.kind === 'thing' ? `${p.label} · ${scopeSourceIds([p]).length} sounds` : p.kind === 'view' ? `what I can see · ${scopeSourceIds([p]).length} sounds` : p.label;
    /** Ask about these (a header's "ask", a sound's own box): the conversation opens on them. */
    function askAbout(parts, open = true) {
        // the open conversation goes on, about these now (chips you can take out); "+ new" starts a fresh one
        chatScope = parts;
        if (open) {
            showChat();
            chatInput.focus();
        }
        else
            paintChat();
    }
    /**
     * What is selected (a row, a marker clicked in the world, a header): the way to point. It is
     * offered in "about" with one click, and a selection outside the scope rides along as `refs`
     * ("copy this onto the selected one"). A separate point tool did the same thing with no feedback.
     */
    function selectedParts() {
        const stmts = engine.scriptStatements;
        if (multiSel.size)
            return [...multiSel].map(i => stmts[i]).filter(st => !!st?.sourceId).map(st => ({ kind: 'sound', id: st.sourceId, label: nameOf(st) }));
        if (selIdx !== null) {
            const st = stmts[selIdx];
            return st?.sourceId ? [{ kind: 'sound', id: st.sourceId, label: nameOf(st) }] : [];
        }
        if (!selGroupKey)
            return [];
        if (selGroupKey.startsWith('host:') && selGroupKey !== `host:${layer?.listenerHost?.()}`) {
            const id = selGroupKey.slice(5);
            return [{ kind: 'thing', id, label: hostName(id) }];
        }
        return (groupInfo.get(selGroupKey)?.members ?? []).map(i => stmts[i]).filter(st => !!st?.sourceId).map(st => ({ kind: 'sound', id: st.sourceId, label: nameOf(st) }));
    }
    const inScope = (p) => chatScope.some(q => q.kind === p.kind && q.id === p.id);
    /**
     * "+": a new sound, step by step in one small sheet. What it is (in your words), where it goes
     * (the thing you are looking at, that spot, where you stand, overhead, all around, with you) and
     * how it behaves (stays, wanders, circles, passes; all the time, now and then, rarely). Where is
     * fixed when you press +, so you can turn while you type. Only what you chose is said: a chip you
     * did not touch is not sent (the "now and then" nobody picked once filed a drinking sound as a
     * repeating one). SATIE decides from your words whether to offer sounds to hear or reuse one.
     */
    function startAdd() {
        if (!authoring) {
            askToFork('add a sound');
            return;
        }
        const me = engine.listenerPosition;
        const here = [me.x, me.y, me.z];
        const r1 = (v) => Math.round(v * 10) / 10;
        // where you aim: follows the pointer (or the view) live and sticks to the surface it hits; a click in
        // the world pins it there (Shift: this exact spot; scroll: height)
        let aimed = null, pinned = false, pinnedAt = 0;
        const justPinned = () => performance.now() - pinnedAt < 300;
        const aimSay = () => !aimed ? 'where I am aiming' : aimed.hostId ? `on the ${hostName(aimed.hostId)} (object id ${aimed.hostId}, the surface point ${aimed.point.map(r1).join(', ')})` : `at the surface point (${aimed.point.map(r1).join(', ')}), ${Math.round(aimed.distanceM)} m from me`;
        const wheres = [
            ...(layer?.startPlacing ? [{ key: 'aim', label: 'where you aim', detail: 'point at it in the world; click there to pin it', say: '' }] : []),
            { key: 'stand', label: 'where you stand', detail: 'stays here when you walk on', say: `where I stand now (${here.map(r1).join(', ')})` },
            { key: 'overhead', label: 'overhead', detail: 'in the air above here', say: `overhead, in the air above (${here.map(r1).join(', ')})` },
            { key: 'around', label: 'all around you', detail: 'a background, from no single place', say: 'all around the listener, as a background with no single place' },
            { key: 'with', label: 'with you', detail: 'carried by you as you move', say: 'carried by the listener, moving with me' },
        ];
        // where, in your words: always a field (typing in it is choosing it), never a chip that opens one
        const wordsWhere = { key: 'words', label: '', detail: '', say: '' };
        // each way it can move says what it does (a "wanders around" alone meant nothing)
        const moves = [['stays', 'stays put', 'where you put it'], ['wanders', 'wanders around', 'drifts about near where you put it, like a bird in a bush'],
            ['circles', 'circles', 'goes round and round where you put it'], ['passes', 'passes through', 'comes from one side, goes by you and leaves, like a car or a plane']];
        // when it plays: how often, or when the game does something (one choice, not two fields)
        const times = [['always', 'all the time'], ['sometimes', 'now and then'], ['rarely', 'rarely'], ['event', 'when the game does…']];
        // nothing is chosen until you choose it ('' = you did not say); where starts on aiming, which you do by pointing
        let where = wheres[0].key, move = '', time = '', when = '', eventName = '', sameAs = '';
        const touched = new Set();
        const events = layer?.events?.() ?? [];
        const states = (layer?.states?.() ?? []).map(n => ({ key: n, label: n.replace(/_/g, ' ') }));
        const sheet = el('div', 'satie-dt-addsheet');
        const close = () => { layer?.stopPlacing?.(); sheet.remove(); };
        const paintAim = () => {
            const b = sheet.querySelector('[data-k="aim"]');
            if (!b)
                return;
            b.querySelector('.l').textContent = aimed ? (aimed.hostId ? onHost(aimed.hostId) : 'this spot') : 'where you aim';
            b.querySelector('.d').textContent = aimed ? `${Math.round(aimed.distanceM)} m away · ${pinned ? 'pinned · click here to aim again' : 'click the world to pin · Shift: exact spot · scroll: height'}` : 'point at it in the world; click there to pin it';
        };
        if (layer?.startPlacing)
            layer.startPlacing({ mode: 'thing', stayOpen: true,
                onChange: t => { aimed = t; paintAim(); },
                onDone: t => { aimed = t; pinned = true; pinnedAt = performance.now(); sheet.querySelector('[data-k="aim"]')?.click(); paintAim(); },
                onCancel: () => sheet.remove() });
        const head = el('div', 'ah');
        head.append(el('span', undefined, 'add a sound'));
        const x = el('button', 'x', '×');
        x.title = 'close';
        x.addEventListener('click', close);
        head.appendChild(x);
        const what = el('textarea', 'aw');
        what.rows = 2;
        what.placeholder = 'what is it? a dog barking, crows on the wire, a radio in the shed';
        // or a sound already in the scene: the copy plays its takes, here (free, written at once)
        const sameRow = el('div', 'ag');
        const sameSel = el('select', 'asel');
        sameSel.appendChild(new Option('or the same sound as one already here…', ''));
        engine.scriptStatements.forEach(o => { if (o.sourceId && !o.entityId)
            sameSel.appendChild(new Option(nameOf(o), o.sourceId)); });
        sameSel.addEventListener('change', () => {
            sameAs = sameSel.value;
            what.disabled = !!sameAs;
            touched.add('source');
            what.placeholder = sameAs ? 'the same sound: nothing new is made' : 'what is it? a dog barking, crows on the wire, a radio in the shed';
            go.textContent = sameAs ? 'add it' : 'find sounds';
        });
        sameRow.appendChild(sameSel);
        const group = (title, items, get, set) => {
            const g = el('div', 'ag');
            g.appendChild(el('div', 'at', title));
            const row = el('div', 'ao');
            const paint = () => { for (const b of row.children)
                b.dataset.on = b.dataset.k === get() ? '1' : '0'; };
            g.dataset.unset = get() ? '0' : '1';
            for (const it of items) {
                const b = el('button');
                b.dataset.k = it.key;
                b.append(el('span', 'l', it.label), ...(it.detail ? [el('span', 'd', it.detail)] : []));
                // a second click on the chosen chip takes it back (you did not say after all)
                b.addEventListener('click', () => { set(get() === it.key && title !== 'where' ? '' : it.key); paint(); g.dataset.unset = get() ? '0' : '1'; });
                row.appendChild(b);
            }
            paint();
            g.appendChild(row);
            return g;
        };
        const go = el('button', 'pri', 'find sounds');
        const submit = () => {
            const text = what.value.trim();
            if (!text && !sameAs) {
                what.focus();
                return;
            }
            const w = where === 'words' ? wordsWhere : wheres.find(o => o.key === where);
            if (w.key === 'words') {
                const d = whereWords.value.trim();
                if (!d) {
                    whereWords.focus();
                    return;
                }
                w.say = `${d} (in my words; the scene's things and places are in the contract)`;
                w.label = d;
            }
            if (w.key === 'aim') {
                if (!aimed) {
                    say('Point at a place in the world first.');
                    return;
                }
                w.say = aimSay();
                w.label = aimed.hostId ? onHost(aimed.hostId) : 'that spot';
            }
            const mv = moves.find(([k]) => k === move)?.[1], tm = time === 'event' ? undefined : times.find(([k]) => k === time)?.[1];
            const evSaid = evWords.value.trim();
            if (time === 'event' && !eventName && !evSaid) {
                evWords.focus();
                say('Say what the game does (pick it or write it), or another choice for when it plays.');
                return;
            }
            // where is said when you chose it, or aimed (pointing is saying); the rest only when touched
            const whereSaid = touched.has('where') || (w.key === 'aim' && !!aimed);
            const ev = events.find(e => e.name === eventName);
            const wn = [eventName ? `when the game fires "${eventName}"${ev?.description ? ` (${ev.description})` : ''}` : time === 'event' && evSaid ? `when ${evSaid} (in my words; the game's events are in the contract, and if none fits, say what my coding agent would add)` : '', when === 'any' ? 'any time (no state condition)' : when ? `only in the game's "${when}" state` : ''].filter(Boolean).join('; ');
            const of = sameAs ? engine.scriptStatements.find(o => o.sourceId === sameAs) : undefined;
            // the same sound, where you aimed or stand: written here and now, no model, no new takes
            const spot = !of ? null
                : w.key === 'aim' && aimed ? (aimed.hostId ? { at: aimed.hostId } : { place: aimed.point.map(r1) })
                    : w.key === 'stand' ? { place: here.map(r1) }
                        : w.key === 'overhead' ? { place: [r1(here[0]), r1(here[1] + 4), r1(here[2])] }
                            : null;
            if (of && spot) {
                const id = uniqueSourceId(script, spot.at ?? `${of.sourceId}_copy`);
                let next = duplicateVoiceBlock(script, voiceLocatorFor(of, engine.scriptStatements), { sourceId: id, ...spot });
                const copyLoc = (t) => { const c = (tryParse(t).statements ?? []).find(o => o.sourceId === id); return voiceLocatorFor(c, tryParse(t).statements ?? []); };
                if (next && eventName)
                    next = setVoiceTrigger(next, copyLoc(next), { event: eventName }) ?? next;
                else if (next && time && time !== 'event') {
                    next = setVoiceTrigger(next, copyLoc(next), time === 'always' ? 'loop' : 'oneshot') ?? next;
                    if (time !== 'always')
                        next = upsertVoiceProperty(next, copyLoc(next), 'every', time === 'rarely' ? '40to120' : '8to25') ?? next;
                }
                if (next && when && when !== 'any')
                    next = upsertVoiceProperty(next, copyLoc(next), 'zone', when) ?? next;
                if (!next) {
                    say('Could not copy that sound; ask SATIE instead.');
                    return;
                }
                close();
                record('add_sound', { sameAs, where: w.key, aimed: w.key === 'aim' ? aimed : null, event: eventName || null, time: time || null, when: when || null, touched: [...touched] });
                if (applyScript(next, `added ${nameOf(of)} ${spot.at ? onHost(spot.at) : 'here'}`, { kind: 'add_copy', detail: { of: sameAs, sourceId: id, ...spot } })) {
                    say(`Added a copy of ${nameOf(of)} ${spot.at ? onHost(spot.at) : 'here'}. Its card is open: set how loud it is there.`);
                    const j = engine.scriptStatements.findIndex(o => o.sourceId === id);
                    if (j >= 0) {
                        openProps = j;
                        buildMixer();
                    }
                }
                return;
            }
            close();
            if (thread.length) {
                const c = newConv();
                convs.unshift(c);
                openConv(c);
            }
            chatScope = [];
            record('add_sound', { what: text || null, sameAs: sameAs || null, where: whereSaid ? w.key : null, move: move || null, time: time || null, event: eventName || null, when: when || null, touched: [...touched], aimed: w.key === 'aim' ? aimed : null });
            const words = of ? `a copy of ${nameOf(of)} (source_id ${of.sourceId}): the same sound${text ? `, ${text}` : ''}` : text;
            void sendChat(addRequestText(words, { kind: kind ? `${KINDS[kind].label} (${KINDS[kind].title})` : undefined, where: whereSaid ? w.say : undefined, movement: mv, often: tm, when: wn || undefined }), false, ['add ' + (of ? `a copy of ${nameOf(of)}` : text), eventName ? `when ${eventName.replace(/_/g, ' ')}` : time === 'event' && evWords.value.trim() ? `when ${evWords.value.trim()}` : '', whereSaid ? w.label : '', mv ?? '', tm ?? '', when && when !== 'any' ? `${when} only` : ''].filter(Boolean).join(' · '));
        };
        go.addEventListener('click', submit);
        what.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        } if (e.key === 'Escape')
            close(); });
        const whereWords = el('input', 'aw');
        whereWords.type = 'text';
        whereWords.placeholder = 'or say where, in your words…';
        let beforeWords = where;
        whereWords.addEventListener('input', () => {
            const said = !!whereWords.value.trim();
            if (said && where !== 'words') {
                beforeWords = where;
                where = 'words';
                touched.add('where');
            }
            else if (!said && where === 'words')
                where = beforeWords;
            for (const b of whereGroup.querySelectorAll('.ao > button'))
                b.dataset.on = b.dataset.k === where ? '1' : '0';
            whereGroup.dataset.unset = '0';
        });
        // or when the game does something: the contract's events, each with what it means
        const movesGroup = group('how it moves', moves.map(([key, label, detail]) => ({ key, label, detail })), () => move, k => { move = k; touched.add('move'); });
        const evRow = el('div', 'ag');
        evRow.hidden = true;
        const evSel = el('select', 'asel');
        evSel.appendChild(new Option('what the game does…', ''));
        for (const ev of events) {
            const o = new Option(`${ev.name.replace(/_/g, ' ')}${ev.description ? ` · ${ev.description.slice(0, 60)}` : ''}`, ev.name);
            o.title = ev.description ?? '';
            evSel.appendChild(o);
        }
        evSel.addEventListener('change', () => { eventName = evSel.value; touched.add('time'); });
        // or in your words: the game may not have that event yet (SATIE says what the code would add)
        const evWords = el('input', 'aw');
        evWords.type = 'text';
        evWords.placeholder = 'or say when, in your words…';
        evWords.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } });
        evWords.addEventListener('input', () => { if (evWords.value.trim()) {
            eventName = '';
            evSel.value = '';
            touched.add('time');
        } });
        evSel.addEventListener('change', () => { if (evSel.value)
            evWords.value = ''; });
        evRow.append(evSel, evWords);
        whereWords.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } });
        // what kind of sound: it decides what else there is to say (and the request says it)
        let kind = '';
        const kindGroup = group('what kind of sound', Object.keys(KINDS).map(k => ({ key: k, label: KINDS[k].label, detail: KINDS[k].title })), () => kind, k => {
            kind = k;
            touched.add('kind');
            const around = kind === 'around', yours = kind === 'yours';
            whereGroup.hidden = whereWords.hidden = around || yours;
            if (around)
                where = 'around';
            else if (yours)
                where = 'with';
            else if (where === 'around' || where === 'with')
                where = wheres[0].key;
            movesGroup.hidden = !(kind === 'moving' || kind === '');
            if (yours) {
                time = 'event';
                evRow.hidden = false;
            }
            whenGroup.querySelectorAll('button').forEach(b => { b.dataset.on = b.dataset.k === time ? '1' : '0'; });
        });
        const whereGroup = group('where', wheres, () => where, k => {
            // a chip chosen after typing a place: the chip wins, the words go
            whereWords.value = '';
            // choosing "where you aim" again after pinning aims again
            if (k === 'aim' && where === 'aim' && pinned && !justPinned()) {
                pinned = false;
                layer?.unlockPlacing?.();
                paintAim();
            }
            if (!(k === 'aim' && justPinned()))
                touched.add('where');
            where = k;
            // all around you, or with you: there is nowhere for it to move
            movesGroup.hidden = k === 'around' || k === 'with';
        });
        const whenGroup = group('when it plays', times.filter(([k]) => k !== 'event' || events.length).map(([key, label]) => ({ key, label })), () => time, k => {
            time = k;
            touched.add('time');
            evRow.hidden = k !== 'event';
            if (k === 'event')
                setTimeout(() => evSel.focus(), 0);
            else {
                eventName = '';
                evSel.value = '';
            }
        });
        sheet.append(head, what, sameRow, kindGroup, whereGroup, whereWords, movesGroup, whenGroup, evRow, 
        // "any time" is a choice of its own (no state condition), not the same as saying nothing
        ...(states.length ? [group('only during', [{ key: 'any', label: 'any time' }, ...states], () => when, k => { when = k; touched.add('when'); })] : []), el('div', 'hint', 'how loud: set it once it is in, on its card (it opens)'), go);
        // one aim at a time: a sheet replaced (not closed) must not leave the world layer raycasting
        if (root.querySelector('.satie-dt-addsheet')) {
            layer?.stopPlacing?.();
            root.querySelector('.satie-dt-addsheet')?.remove();
        }
        if (openProps !== null) {
            openProps = null;
            finder = null;
            buildMixer();
        }
        root.appendChild(sheet);
        what.focus();
    }
    // tasks for the coding agent (Part C): their state is read while the chat first paints, so it is declared before it
    const canTask = authoring && !opts.localStorageKey && !!scriptUrl;
    const taskKey = `satie-tasks:${scriptUrl ?? 'scene'}`;
    let taskMeta = {};
    try {
        taskMeta = JSON.parse(localStorage.getItem(taskKey) ?? '{}') ?? {};
    }
    catch {
        taskMeta = {};
    }
    const saveTaskMeta = () => { try {
        localStorage.setItem(taskKey, JSON.stringify(taskMeta));
    }
    catch { /* kept in this tab */ } };
    let taskRows = [];
    let tasksLoaded = false, reloadHeld = false, taskPollAt = 0;
    const taskCopyText = (title, path) => `SATIE task: ${title.replace(/[.\s]+$/, '')}. Steps in ${path}. If you can watch in the background, keep \`node node_modules/satie-runtime/watch-tasks.js\` running for the next ones.`;
    let lastOp = null;
    /** What the mix's add or replace button started (see setIntent); declared before anything paints the chat. */
    let intent = null;
    const chatWrap = el('div', 'satie-dt-chat');
    const threadEl = el('div', 'thread');
    const chatHead = el('div', 'chead');
    const chatInput = el('textarea');
    chatInput.rows = 1;
    const chatSend = el('button', 'send', 'send');
    const scopeEl = el('div', 'scope');
    const inputRow = el('div', 'irow');
    inputRow.append(chatInput, chatSend);
    // One bar for the conversation (the way a console or an editor's panel does): ▸ closed, right above
    // the input; ▾ open, heading the conversation that opens above the input. It starts closed.
    const grip = el('div', 'grip');
    grip.title = 'drag to resize';
    // the bar heads the conversation when open, and sits right above the input when closed
    // tasks for the coding agent, pinned one line each above the conversation (Part C)
    const tasksEl = el('div', 'tasks');
    tasksEl.hidden = true;
    chatWrap.append(grip, chatHead, tasksEl, threadEl, scopeEl, inputRow);
    // (2026-11-12) the conversation sits under the mixer, in every view: what you look at stays in sight
    askFoot.appendChild(chatWrap);
    // a published scene: the conversation is here, and the first thing it asks is that you fork the scene
    if (!authoring) {
        // (2026-11-13) a short red card where "what your coding agent sees" sits (no agent in a published scene), not a
        // block in the chat that hid the sidebar; the longer word on forking is its tooltip
        // one small red button that fits the strip: what it is and what to do, the longer word as its tooltip
        const gate = el(opts.fork?.href ? 'a' : 'button', 'pubbtn');
        gate.append(el('span', 'pt', 'Published'), el('span', 'pd', '·'), el('span', 'pg', `fork to edit${opts.fork?.href ? ' ↗' : ''}`));
        gate.title = `${opts.fork?.label ? `${opts.fork.label}: ` : ''}${opts.fork?.detail ?? 'This is the published scene. Fork it into a copy of your own to change its sound with SATIE.'}`;
        if (gate instanceof HTMLAnchorElement) {
            gate.href = opts.fork.href;
            gate.target = '_blank';
            gate.rel = 'noopener';
        }
        gate.addEventListener('click', () => { if (!opts.fork)
            return; record('fork', { label: opts.fork.label }); opts.fork.onFork?.(script, script !== baselineScript); });
        agentSees.replaceChildren(gate);
        agentSees.classList.add('pub');
        agentSees.hidden = false;
        chatInput.disabled = true;
        chatSend.disabled = true;
        chatInput.placeholder = 'fork the scene to talk to SATIE';
    }
    const clearChat = el('button', 'clr', '+ new');
    clearChat.title = 'start a new conversation (this one is kept in the list)';
    clearChat.addEventListener('click', () => { if (!thread.length)
        return; const c = newConv(); convs.unshift(c); openConv(c); setFolded(false); });
    const listBtn = el('button', 'clr titlebtn', '');
    listBtn.title = 'show or hide the conversation';
    listBtn.addEventListener('click', () => {
        if (listOpen) {
            listOpen = false;
            setFolded(!thread.length);
            return;
        }
        const open = chatWrap.dataset.fold !== '1' && !!thread.length;
        if (open) {
            setFolded(true);
            return;
        }
        // closed with more than one conversation (or nothing in this one): the bar opens the list to choose from
        const kept = convs.filter(c => c.thread.length).length;
        if (kept > 1 || !thread.length) {
            listOpen = true;
            setFolded(false);
            return;
        }
        setFolded(false);
    });
    const allBtn = el('button', 'clr', 'all');
    allBtn.title = 'all your conversations about this scene';
    allBtn.addEventListener('click', () => { listOpen = !listOpen; setFolded(false); });
    const bigBtn = el('button', 'clr', '⤢');
    bigBtn.title = 'the conversation over the whole panel';
    bigBtn.addEventListener('click', () => { const big = root.dataset.chatbig !== '1'; root.dataset.chatbig = big ? '1' : '0'; bigBtn.textContent = big ? '⤡' : '⤢'; bigBtn.title = big ? 'back under the mixer' : 'the conversation over the whole panel'; if (big)
        setFolded(false); });
    // the whole pane folds to its one header bar (and back), whatever it holds
    const minBtn = el('button', 'clr fold', '⌄');
    minBtn.title = 'fold the conversation away (you can still type)';
    minBtn.addEventListener('click', () => { const min = chatWrap.dataset.min !== '1'; chatWrap.dataset.min = min ? '1' : '0'; minBtn.textContent = min ? '⌃' : '⌄'; minBtn.title = min ? 'show the conversation' : 'fold the conversation away (you can still type)'; try {
        localStorage.setItem('satie-dt-chat-min', min ? '1' : '0');
    }
    catch { /* per tab */ } });
    try {
        if (localStorage.getItem('satie-dt-chat-min') === '1') {
            chatWrap.dataset.min = '1';
            minBtn.textContent = '⌃';
        }
    }
    catch { /* private mode */ }
    const dockTools = el('span', 'tools');
    dockTools.append(allBtn, clearChat, bigBtn, minBtn);
    chatHead.append(listBtn, dockTools);
    let threadH = 240;
    grip.addEventListener('pointerdown', e => {
        e.preventDefault();
        const y0 = e.clientY, h0 = threadEl.getBoundingClientRect().height || threadH;
        // the thread fits what it holds (up to 200 px) until you drag it to a size of your own
        const move = (m) => { threadH = Math.max(80, Math.min(innerHeight * 0.7, h0 + (y0 - m.clientY))); threadEl.style.height = `${threadH}px`; threadEl.style.maxHeight = 'none'; };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
    });
    function setFolded(folded) {
        chatWrap.dataset.fold = folded ? '1' : '0';
        paintChat();
    }
    chatWrap.dataset.fold = '1'; // starts closed: earlier conversations are kept, not spread over the panel
    /** Bring the conversation up (a sound's own box sends here). */
    function showChat() {
        listOpen = false;
        setFolded(false);
        setTimeout(() => chatInput.focus(), 0);
        // it brought you here: the conversation glows for a moment so you see where
        chatWrap.dataset.flash = '0';
        void chatWrap.offsetWidth;
        chatWrap.dataset.flash = '1';
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { chatWrap.dataset.flash = '0'; }, 1400);
    }
    let flashTimer;
    // the "about" chips right above say what it is about; the placeholder stays one short line
    // (2026-11-13) the chip right above the input names what it is about, so the placeholder never repeats it (a long name wrapped)
    const placeholder = () => (cur.agentReply ? 'reply to your coding agent…' : intent ? '' : 'Ask SATIE…');
    /**
     * What the mix's add or replace button started (2026-11-14): the chat says it as a chip and in its placeholder; what
     * you type is sent with it ("Add to The crossing: a dog barking by the porch"), and SATIE works out the rest.
     */
    function setIntent(i) {
        if (!authoring) {
            askToFork(i.kind === 'add' ? 'add a sound' : 'replace a sound');
            return;
        }
        const where = i.thing ? `the ${i.thing.label.toLowerCase()} in ${i.scape}` : i.scape;
        if (i.kind === 'add')
            intent = { kind: 'add', say: `add to ${where}`, hint: '', prefix: `Add a new sound to ${where}${i.thing?.key.startsWith('host:') ? ` (it plays from ${i.thing.key.slice(5)})` : ''}. Work out where it comes from; if it needs a new thing in the game, say so and offer just the sound too. What I want:` };
        else if (i.kind === 'change' || i.kind === 'replace')
            intent = { kind: 'change', say: `change ${i.name ? `the ${i.name}` : `in ${where}`}`, hint: '', prefix: `Change ${i.name ? `${i.name}${i.sid ? ` (source_id ${i.sid})` : ''}` : `something in ${where}`}: what sounds, how it sounds, where or when, whatever they say. What I want:` };
        else
            intent = { kind: i.kind, say: `${i.kind === 'take' ? 'a new take of' : 'replace'} ${i.name ?? 'it'}`, hint: '', prefix: `${i.kind === 'take' ? 'Add one more take to' : 'Replace the recording of'} ${i.name ?? 'this sound'}${i.sid ? ` (source_id ${i.sid})` : ''}. What I want:` };
        if (i.sid) {
            const sts = engine.scriptStatements.filter(st => st.sourceId === i.sid);
            if (sts.length)
                chatScope = sts.map(st => ({ kind: 'sound', id: st.sourceId, label: nameOf(st) }));
        }
        // (2026-11-14) the sentence is started for you; you finish it in your own words
        const nm = (i.name ?? 'this sound').toLowerCase();
        chatInput.value = i.kind === 'add' ? 'Add ' : i.kind === 'take' ? `Another take of the ${nm}, but ` : i.name ? `Change the ${nm} ` : i.thing ? `Change the ${i.thing.label.toLowerCase()} ` : 'Change ';
        chatInput.placeholder = placeholder();
        paintChat();
        showChat();
        setTimeout(() => { chatInput.focus(); chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length); }, 30);
    }
    /** Send what was typed, with the button's intent when there is one (shown as you wrote it, sent with where and what). */
    function sendTyped() {
        const t = chatInput.value.trim();
        if (!t)
            return;
        const it = intent;
        intent = null;
        chatInput.placeholder = placeholder();
        if (!it) {
            void sendChat(t);
            return;
        }
        record('mix_intent', { kind: it.kind, say: it.say });
        void sendChat(`${it.prefix} ${t}`, false, t);
    }
    /** One of SATIE's offered recordings chosen on the map: answered as "use this" in the chat. */
    function chooseOffered(id) {
        if (cur.busy)
            return;
        const m = [...cur.thread].reverse().find(x => x.ui?.kind === 'ask' && !x.answered && x.ui.options.some(o => o.candidate?.id === id));
        if (!m || m.ui?.kind !== 'ask')
            return;
        const n = m.ui.options.findIndex(o => o.candidate?.id === id), o = m.ui.options[n];
        stopPreview();
        m.answered = true;
        m.picked = n;
        logOutcome(m.offer, 'kept', id);
        void sendChat(`Chose: ${o.label} (candidate ${id})`, true, o.label, id);
    }
    const indicesOf = (ids) => engine.scriptStatements.map((st, i) => (st.sourceId && ids.includes(st.sourceId) ? i : -1)).filter(i => i >= 0);
    /** What the listener hears now, per sound: the observation SATIE answers from. */
    function observationNow() {
        const stmts = engine.scriptStatements;
        const hear = hearNow();
        const report = new Map(engine.levelReport().voices.map(v => [v.statementIndex, v]));
        const lines = [];
        stmts.forEach((st, i) => {
            if (lines.length >= 80)
                return;
            const v = report.get(i), a = hear.get(i), d = liveDistance(i);
            const where = isAround(st) ? 'all around' : Number.isFinite(d) ? `${Math.round(d)} m away` : 'distance unknown';
            const state = isMuted(i) ? 'muted'
                : a ? (a.marginDb >= 0 ? `heard, loudness ${fmtLoud(a.receivedDb)} here (${Math.round(a.receivedDb)} dB)` : `drowned out${a.maskerId !== null && stmts[a.maskerId] ? ` by ${nameOf(stmts[a.maskerId])}` : ''}, loudness ${fmtLoud(a.receivedDb)} here (${Math.round(a.receivedDb)} dB)`)
                    : quietReason(i, v).text;
            const view = engine.getTrackViews().find(t => t.statementIndex === i && !t.pending);
            const at = view && !isAround(st) ? ` at (${[view.position.x, view.position.y, view.position.z].map(n => Math.round(n)).join(', ')})` : '';
            const size = !st.radius.isNull ? `, a ${Math.round(st.radius.min * 10) / 10} m ball` : st.ringRadius && !st.ringRadius.isNull ? `, a ${Math.round(st.ringRadius.min)} m ring` : st.line ? ', along a line' : '';
            lines.push(`- ${st.hostRef ? hostName(st.hostRef) + ' · ' : ''}${soundAction(st)}${st.sourceId ? ` (source_id ${st.sourceId})` : ''}${at}${size}: ${where}, ${state}`);
        });
        const lp = layer?.listenerHost?.();
        const me = engine.listenerPosition;
        const look = layer?.lookTarget?.();
        if (look)
            lines.unshift(`LOOKING AT: ${look.hostId ? `${hostName(look.hostId)} (object id ${look.hostId})` : 'no named object'} at (${look.point.map(n => Math.round(n * 10) / 10).join(', ')}), ${Math.round(Math.hypot(look.point[0] - me.x, look.point[1] - me.y, look.point[2] - me.z))} m away`);
        // (spec 018) the soundscapes (one layer above the script: a list of sounds and the signal that says you are there),
        // which you are in, ids they list that no sound has, and what was listened to on the map
        try {
            const acc = api.soundscapes(), cur0 = acc?.current() ?? null, ids = new Set(stmts.map(st => st.sourceId).filter(Boolean));
            const defs = acc?.variants.soundscapes() ?? [];
            if (defs.length)
                lines.push('', 'SOUNDSCAPES (places in the world, each a set of sounds; a new sound goes in the one it belongs to):', ...defs.map(d => { const gone = d.sourceIds.filter(id => !ids.has(id)); return `- ${d.label} (${d.id})${d.id === cur0 ? ' ← the listener is here' : ''}: ${d.sourceIds.filter(id => ids.has(id)).join(', ')}${gone.length ? `; listed but no such sound: ${gone.join(', ')}` : ''}`; }));
        }
        catch { /* no soundscapes */ }
        if (mapHeard.length)
            lines.push('', `LISTENED TO ON THE MAP just now (newest first): ${mapHeard.join(', ')}`);
        return `LIVE OBSERVATION (the mixer, where the listener stands now at (${[me.x, me.y, me.z].map(n => Math.round(n)).join(', ')}), metres, +Y up${lp ? `, carried by ${lp}` : ''}; levels are the level model's estimates, as loudness 0 to 1 (dB SPL / 120) with the dB beside it: speak to the developer in loudness 0 to 1, never in dB; positions are where each sound plays from):\n${lines.join('\n')}`;
    }
    function changeLine(c) {
        const who = `${c.voice.host ? hostName(c.voice.host) + ' · ' : ''}${c.voice.sound.split(',')[0].slice(0, 60)}`;
        if (c.change === 'add')
            return `added ${who}`;
        if (c.change === 'remove')
            return `removed ${who}`;
        if (c.change === 'source')
            return `${who}: a different sound`;
        if (c.change !== 'set' && c.change !== 'unset')
            return who;
        return `${who}: ${c.prop} ${c.from ?? '(none)'} → ${c.to ?? '(removed)'}`;
    }
    /** Sounds the script plays that have no take loaded yet (an edit added or re-prompted them). */
    function missingTakes(text, only = () => true) {
        const bufs = engine.getAudioBuffers();
        if (typeof text !== 'string') {
            const st = text;
            const keys = st.isGenerated && st.variants > 1 ? Array.from({ length: st.variants }, (_, k) => takeClipPath(st, k)) : [pathFor(st.clip)];
            return !(st.kind === 'trigger' && st.genPrompt && /\{\w+\}/.test(st.genPrompt)) && keys.some(k => !bufs.has(k)) ? 1 : 0;
        }
        // a voice with variants needs every take, not only its first (a pick is seeded as the first)
        const takes = (st) => st.isGenerated && st.variants > 1 ? Array.from({ length: st.variants }, (_, k) => takeClipPath(st, k)) : [pathFor(st.clip)];
        return (tryParse(text).statements ?? []).filter(st => only(st) && !(st.kind === 'trigger' && st.genPrompt && /\{\w+\}/.test(st.genPrompt)) && takes(st).some(k => !bufs.has(k))).length;
    }
    /**
     * How many takes are missing (not sounds). Asking for them is the person's own click, so the cap is
     * generous (at least a dollar; the credit balance is the real limit): sized by sounds at 8¢ with a 10¢
     * floor, two whale copies of three takes each (18¢ at 3¢ a take) were refused, nothing was made, and
     * "make them" kept coming back (2026-11-14, Huanxing: "I should still be able to generate if I want").
     */
    function missingTakeKeys(text) {
        const bufs = engine.getAudioBuffers(), keys = new Set();
        for (const st of tryParse(text).statements ?? []) {
            if (st.kind === 'trigger' && st.genPrompt && /\{\w+\}/.test(st.genPrompt))
                continue;
            const own = st.isGenerated && st.variants > 1 ? Array.from({ length: st.variants }, (_, k) => takeClipPath(st, k)) : [pathFor(st.clip)];
            for (const k of own)
                if (!bufs.has(k))
                    keys.add(k);
        }
        return keys.size;
    }
    /** Put a candidate in for these sounds (the swap), recorded as one edit. */
    /**
     * The sound the person chose, wherever the composer wrote it: under its own clip (a voice that
     * plays the recording) and as the first take of every voice whose gen prompt is the description it
     * was made from (a bank of takes of it: the rest are made from the same words).
     */
    async function seedTake(seed, next) {
        let buffer;
        try {
            buffer = await bufferFor(seed.url);
        }
        catch {
            return;
        }
        const asset = synthAssetFor(buffer);
        const entry = { url: seed.url, source: seed.from === 'library' ? 'library' : 'generated', name: seed.name, ...(asset ? { synth: asset } : {}) };
        const words = seed.describe?.trim().replace(/\s+/g, ' ');
        const keys = new Set([pathFor(seed.clip)]);
        // the voices THIS edit added or gave a new sound: the chosen take is theirs, whatever words the
        // composer wrote (it paraphrased "then three quick gulps" as "followed by three quick thirsty
        // gulps", and matching by words left the take you heard out, to be generated anew)
        const touched = new Set((describeVoiceChanges(script, next)?.changes ?? []).filter(c => c.change === 'add' || c.change === 'source').map(c => c.voice.sourceId).filter(Boolean));
        for (const st of tryParse(next).statements ?? []) {
            if (!st.isGenerated || isTemplatePrompt(st.genPrompt))
                continue;
            const p = st.genPrompt?.trim().replace(/\s+/g, ' ');
            if ((st.sourceId && touched.has(st.sourceId)) || (words && p && (p === words || p.startsWith(words))))
                keys.add(takeClipPath(st, 0));
        }
        for (const k of keys) {
            engine.setAudioBuffer(k, buffer);
            manifest[k] = entry;
        }
    }
    /** Drop a take, keeping its decoded audio in memory so going back is instant and never re-downloads. */
    function dropTake(key) {
        const buf = engine.getAudioBuffers().get(key), url = manifest[key]?.url;
        if (buf && url)
            stash.set(url, buf);
        engine.removeAudioBuffer(key);
        delete manifest[key];
    }
    /**
     * The chosen sound as the takes a per-text voice plays for one of its texts (`on step gen … {text}`
     * fired with "paddy_water"): the chosen take first, the rest of the bank made from its description,
     * the takes it replaces taken out. Data, not script: the voice's other texts keep theirs.
     */
    async function takesFor(target, cand, text, reply) {
        const stmts = indicesOf(target).map(i => engine.scriptStatements[i]).filter(st => st && isTemplatePrompt(st.genPrompt));
        if (!stmts.length)
            return false;
        let first;
        try {
            first = await bufferFor(cand.url);
        }
        catch {
            return false;
        }
        const banks = stmts.map(st => ({ st, keys: Array.from({ length: templateBankSize(st) }, (_, k) => ({ key: templateTake(st.genPrompt, text, k).clipPath, legacy: legacyTemplateTake(st.genPrompt, text, k) })) }));
        const change = { label: `${nameOf(stmts[0])} on ${text.replace(/_/g, ' ')}`, voice: nameOf(stmts[0]), text, before: new Map(), after: new Map(), cancelled: false, undone: false };
        for (const b of banks)
            for (const { key, legacy } of b.keys)
                for (const k of [key, legacy])
                    if (!change.before.has(k))
                        change.before.set(k, { entry: manifest[k], buffer: engine.getAudioBuffers().get(k) });
        const entryOf = (url, name) => ({ url, source: cand.from === 'library' ? 'library' : 'generated', name });
        const put = (key, buffer, entry) => { engine.setAudioBuffer(key, buffer); manifest[key] = entry; change.after.set(key, entry); };
        // the chosen take plays at once; the takes it replaces are out (full-text and pre-full-text keys)
        for (const b of banks) {
            for (const { key, legacy } of b.keys) {
                dropTake(key);
                dropTake(legacy);
            }
            put(b.keys[0].key, first, entryOf(cand.url, cand.name));
        }
        const hkey = `takes:${text}:${Date.now()}`;
        commitHistory(`${change.label}: ${cand.name.split(',')[0].slice(0, 40)}`, 'takes', hkey);
        scheduleSave();
        buildMixer();
        reply.takes = change;
        record('chat_takes', { voices: stmts.map(st => st.sourceId), text, chose: { clip: cand.clip, url: cand.url, describe: cand.describe ?? null } });
        // more of the same: the rest of the bank from the chosen sound's description (stops if you undo)
        const rest = Math.max(...banks.map(b => b.keys.length)) - 1;
        if (rest > 0 && cand.describe) {
            reply.fetching = true;
            paintChat();
            for (let k = 1; k <= rest && !change.cancelled; k++) {
                try {
                    const r = await fetch(takeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: cand.describe, loop: false }) }).then(x => x.json());
                    if (!r.ok || !r.url)
                        throw new Error(r.error ?? 'no take');
                    const buf = await bufferFor(r.url);
                    if (change.cancelled)
                        break;
                    for (const b of banks)
                        if (b.keys[k])
                            put(b.keys[k].key, buf, entryOf(r.url, cand.describe.slice(0, 80)));
                }
                catch {
                    break;
                }
            }
            reply.fetching = false;
            if (!change.cancelled) {
                commitHistory(`${change.label}: ${cand.name.split(',')[0].slice(0, 40)}`, 'takes', hkey);
                scheduleSave();
            }
            paintChat();
        }
        return true;
    }
    /** Put a takes change back exactly as it was (from memory), unless those takes changed since. */
    function undoTakes(change) {
        const live = [...change.after].every(([k, e]) => manifest[k]?.url === e.url);
        if (!live) {
            say('Those takes changed since; use history to go back.');
            return false;
        }
        change.cancelled = true;
        change.undone = true;
        for (const k of change.after.keys())
            dropTake(k);
        for (const [k, was] of change.before) {
            if (was.buffer)
                engine.setAudioBuffer(k, was.buffer);
            if (was.entry)
                manifest[k] = was.entry;
            else
                delete manifest[k];
        }
        commitHistory(`${change.label}: back as it was`, 'takes');
        scheduleSave();
        buildMixer();
        record('chat_takes_undo', { text: change.text });
        return true;
    }
    /** A takes change as a diff, the way a script change shows: which takes went out, which came in (samples.json). */
    function takesCard(m, change) {
        const card = el('div', 'card');
        card.appendChild(el('div', 'h', change.undone ? 'taken back' : 'changed'));
        const outs = [...change.before].filter(([, v]) => v.entry).map(([k, v]) => ({ k, n: v.entry.name ?? k }));
        const ins = [...change.after].map(([k, e]) => ({ k, n: e.name ?? k }));
        const open = !!m.openDiffs?.includes('takes');
        const head = el('div', 'dh');
        head.append(el('span', 'dt', open ? '▾' : '▸'), el('span', 'dn', `${change.voice} · ${change.text.replace(/_/g, ' ')} takes`));
        const counts = el('span', 'dc');
        counts.append(el('b', 'add', `+${ins.length}`), el('b', 'del', `−${outs.length}`));
        head.appendChild(counts);
        head.addEventListener('click', () => { m.openDiffs = open ? (m.openDiffs ?? []).filter(x => x !== 'takes') : [...(m.openDiffs ?? []), 'takes']; paintChat(); });
        card.appendChild(head);
        const pre = el('div', 'diff');
        pre.hidden = !open;
        const short = (k) => `take ${(Number(k.match(/__t(\d+)$/)?.[1] ?? 0) + 1)}`;
        for (const o of outs) {
            const ln = el('div', 'dl del');
            ln.textContent = `- ${short(o.k)}  ${String(o.n).slice(0, 70)}`;
            pre.appendChild(ln);
        }
        for (const o of ins) {
            const ln = el('div', 'dl add');
            ln.textContent = `+ ${short(o.k)}  ${String(o.n).slice(0, 70)}`;
            pre.appendChild(ln);
        }
        pre.appendChild(el('div', 'dl', `  samples.json · the script is unchanged; the other surfaces keep their takes`));
        card.appendChild(pre);
        return card;
    }
    /** The lines a source's block occupies in a script (comment lines above, head, properties). */
    function blockOf(text, sourceId) {
        const st = (tryParse(text).statements ?? []).find(x => x.sourceId === sourceId);
        if (!st)
            return null;
        const lines = text.split('\n');
        const b = voiceBlocks(text).find(x => x.header === st.sourceLine);
        return b ? { start: b.start, end: b.end, lines: lines.slice(b.start, b.end) } : null;
    }
    /** A line diff (longest common subsequence): ' ' kept, '-' removed, '+' added. */
    function diffLines2(a, b) {
        const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--)
            for (let j = m - 1; j >= 0; j--)
                L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        const out = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) {
                out.push({ t: ' ', s: a[i] });
                i++;
                j++;
            }
            else if (L[i + 1][j] >= L[i][j + 1])
                out.push({ t: '-', s: a[i++] });
            else
                out.push({ t: '+', s: b[j++] });
        }
        while (i < n)
            out.push({ t: '-', s: a[i++] });
        while (j < m)
            out.push({ t: '+', s: b[j++] });
        return out;
    }
    /**
     * What a change did, as a diff per sound (the way a coding agent shows an edit), each with
     * "edit script" to open that sound's block and change it right here.
     */
    const SLOT_TITLE = { sounds: 'which sounds', where: 'where it goes', condition: 'only when, or only where', change: 'what changes', source: 'the sound itself', all: 'what I meant' };
    /** Sounds SATIE changed lately, and which of their settings: those controls light up on the sound's card. */
    const satieChanged = new Map();
    function noteSatieChanges(changes) {
        for (const c of changes ?? []) {
            const id = c.voice.sourceId;
            if (!id)
                continue;
            const e = satieChanged.get(id) ?? { props: new Set(), at: 0 };
            e.props.add(c.change === 'set' || c.change === 'unset' ? c.prop : '*');
            e.at = performance.now();
            satieChanged.set(id, e);
        }
    }
    /** A sound SATIE just added opens its card: how loud, where, when are set there, by hand. */
    function showChanged(changes) {
        const ids = new Set((changes ?? []).filter(c => c.change !== 'remove').map(c => c.voice.sourceId).filter(Boolean));
        const idx = engine.scriptStatements.map((st, j) => (st.sourceId && ids.has(st.sourceId) ? j : -1)).filter(j => j >= 0);
        if (!idx.length)
            return;
        if (idx.length === 1) {
            if (selIdx === idx[0])
                selIdx = null;
            selectVoice(idx[0], true);
        }
        else
            layer?.setSelection?.({ indices: idx, label: 'what SATIE changed' });
    }
    function openAdded(changes) {
        const id = (changes ?? []).find(c => c.change === 'add' && c.voice.sourceId)?.voice.sourceId;
        const j = id ? engine.scriptStatements.findIndex(o => o.sourceId === id) : -1;
        if (j >= 0) {
            openProps = j;
            finder = null;
            buildMixer();
        }
    }
    const satieJustChanged = (sourceId, key) => {
        const e = sourceId ? satieChanged.get(sourceId) : undefined;
        return !!e && performance.now() - e.at < 60000 && (key === undefined || e.props.has(key));
    };
    /** What SATIE understood, as one plain sentence (which sounds, what changes, where, when, with what sound). */
    function readingSentence(r) {
        const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
        let line = r.sounds.length ? `${cap(r.sounds.map(x => x.label).join(', '))}: ${r.change.label}` : cap(r.change.label);
        if (r.where)
            line += ` ${r.where.label}`;
        const unsaid = r.condition.kind === 'everywhere' && r.condition.how === 'default';
        if (!unsaid)
            line += `, ${r.condition.label}`;
        const SRC = { new: ', as new sounds of ', library: ', from recordings of ', same: ', the same sound as ', scene: ', using ' };
        if (r.source && r.source.kind !== 'unchanged')
            line += `${SRC[r.source.kind] ?? ', using '}${r.source.label}`;
        return `${line}.`;
    }
    /**
     * What SATIE understood, as text you can rewrite: ✎ makes it editable and your version replaces it;
     * "talk it through" sets it aside and goes back to an open conversation. (Tappable parts with their own
     * menus read as a form, not as a sentence.)
     */
    function readingView(m, r) {
        const box = el('div', 'reading');
        const sentence = readingSentence(r);
        if (m.editingReading) {
            const ta = el('textarea');
            ta.value = sentence;
            ta.rows = Math.min(5, Math.max(2, Math.ceil(sentence.length / 48)));
            const row = el('div', 'racts');
            const send = el('button', 'pri', 'send'), cancel = el('button', undefined, 'cancel');
            const go = () => { const t = ta.value.trim(); if (!t || t === sentence) {
                m.editingReading = false;
                paintChat();
                return;
            } m.editingReading = false; correctReading(m, r, 'all', t, []); };
            send.addEventListener('click', go);
            cancel.addEventListener('click', () => { m.editingReading = false; paintChat(); });
            ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                go();
            } if (e.key === 'Escape')
                cancel.click(); });
            row.append(send, cancel);
            box.append(ta, row);
            queueMicrotask(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
            return box;
        }
        box.appendChild(el('div', 'rline', sentence));
        if (!r.condition.possible)
            box.appendChild(el('div', 'rnote', `SATIE cannot tie a sound to "${r.condition.label}" yet, so nothing was changed everywhere instead.`));
        if (!m.dismissed && !m.answered) {
            const row = el('div', 'racts');
            const edit = el('button', undefined, '✎ rewrite it');
            edit.title = 'not quite? rewrite what SATIE understood in your own words';
            edit.addEventListener('click', () => { if (cur.busy)
                return; m.editingReading = true; paintChat(); });
            const talk = el('button', undefined, 'talk it through');
            talk.title = 'set this aside and talk it over; nothing changes until you ask';
            talk.addEventListener('click', () => talkItThrough(m));
            row.append(edit, talk);
            box.appendChild(row);
        }
        return box;
    }
    /** Back to the drawing board: a change this reading made is taken back, and the conversation opens up. */
    function talkItThrough(m) {
        if (cur.busy)
            return;
        if (m.after !== undefined && m.before !== undefined && script === m.after && applyScript(m.before, 'took back a SATIE change to talk it through', { kind: 'chat_undo', detail: { for: 'talk', turn: cur.turn ?? null } }))
            m.after = undefined;
        m.dismissed = true;
        m.answered = true;
        logOutcome(m.offer, 'redirected');
        record('reading_talk', { turn: cur.turn ?? null });
        thread.push({ role: 'satie', text: 'Set that aside; nothing is changed. What is off, or what are you after? Say it any way you like.' });
        transcript.push({ role: 'user', content: 'Not that. Let us talk it through first; do not change anything yet.' }, { role: 'assistant', content: JSON.stringify({ do: 'say', text: 'Set aside. What is off?' }) });
        paintChat();
        chatInput.focus();
    }
    /** Correct one part: an applied change is taken back first, a proposal set aside; SATIE re-reads only that part. */
    function correctReading(m, r, slot, words, refs) {
        if (cur.busy)
            return;
        if (m.after !== undefined && m.before !== undefined && script === m.after && applyScript(m.before, 'took back a SATIE change to correct it', { kind: 'chat_undo', detail: { for: 'correction', slot, turn: cur.turn ?? null } }))
            m.after = undefined;
        if (m.ui?.kind === 'proposal' || m.ui?.kind === 'confirm')
            m.dismissed = true;
        m.openPart = undefined;
        record('reading_correct', { turn: cur.turn ?? null, slot, words, reading: r, refs: refs.length ? refs : null });
        void sendChat(words, true, slot === 'all' ? `I meant: ${words}` : `${SLOT_TITLE[slot]}: ${words}`, undefined, refs, { slot, reading: r });
    }
    /**
     * After a change: hear it now, once, where it plays (an event sound fires as the game would fire
     * it), and when it plays on its own. A change you cannot hear yet reads as a change that did nothing.
     */
    function hearRow(ids) {
        const row = el('div', 'hear');
        const idx = indicesOf(ids);
        if (!idx.length)
            return row;
        const btn = el('button', undefined, '▶ hear it now');
        btn.title = 'plays the changed sound once, at its place in the game';
        btn.addEventListener('click', () => hearChanged(idx));
        row.appendChild(btn);
        const st = engine.scriptStatements[idx[0]];
        const when = st ? whenItPlays(st)[0] : undefined;
        if (when)
            row.appendChild(el('span', 'when', `on its own: ${when}`));
        return row;
    }
    function hearChanged(idx) {
        stopPreview();
        if (engine.audioContext.state === 'suspended')
            void engine.audioContext.resume();
        // one copy per changed voice, a beat apart, so several are heard one after another
        const firsts = [...new Map(idx.map(i => [engine.scriptStatements[i]?.sourceId ?? i, i])).values()].slice(0, 4);
        firsts.forEach((i, k) => setTimeout(() => {
            const st = engine.scriptStatements[i];
            if (!st)
                return;
            if (st.kind === 'trigger' && st.eventName && engine.isPlaying)
                fireNow(i);
            else
                engine.auditionStatement(i, { maxDurationS: 8 });
            layer?.fired(i);
            layer?.ripple?.(i);
        }, k * 900));
        record('hear_now', { voices: firsts.map(voiceContext) });
    }
    function diffCard(m, title) {
        const card = el('div', 'card');
        card.appendChild(el('div', 'h', title));
        const ids = [...new Set((m.changes ?? []).map(c => c.voice.sourceId).filter((x) => !!x))];
        if (!ids.length || m.before === undefined) {
            for (const c of (m.changes ?? []).slice(0, 8))
                card.appendChild(el('div', 'c', changeLine(c)));
            return card;
        }
        const after = m.after ?? (m.ui && 'script' in m.ui ? m.ui.script : script);
        for (const id of ids.slice(0, 6)) {
            const a = blockOf(m.before, id)?.lines ?? [], b = blockOf(after, id)?.lines ?? [];
            const st = engine.scriptStatements.find(x => x.sourceId === id);
            const head = el('div', 'dh');
            const d = diffLines2(a, b);
            const adds = d.filter(x => x.t === '+').length, dels = d.filter(x => x.t === '-').length;
            const open = !!m.openDiffs?.includes(id);
            const tri = el('span', 'dt', open ? '▾' : '▸');
            head.appendChild(tri);
            const was = (tryParse(m.before).statements ?? []).find(x => x.sourceId === id) ?? st;
            const now = (tryParse(after).statements ?? []).find(x => x.sourceId === id) ?? was;
            head.append(el('span', 'dn', now ? nameOf(now) : id));
            const counts = el('span', 'dc');
            counts.append(el('b', 'add', `+${adds}`), el('b', 'del', `−${dels}`));
            head.appendChild(counts);
            const editBtn = el('button', 'de', 'edit script');
            head.appendChild(editBtn);
            card.appendChild(head);
            const pre = el('div', 'diff');
            pre.hidden = !open;
            // collapsed until asked for (the way a code review shows a file): click the line to see the change
            head.addEventListener('click', e => {
                if (e.target.closest('.de'))
                    return;
                m.openDiffs = open ? (m.openDiffs ?? []).filter(x => x !== id) : [...(m.openDiffs ?? []), id];
                paintChat();
            });
            // keep the context short: changed lines and one line around them
            const show = d.map((x, k) => x.t !== ' ' || d[k - 1]?.t !== ' ' && d[k - 1] !== undefined || d[k + 1]?.t !== ' ' && d[k + 1] !== undefined);
            d.forEach((x, k) => { if (show[k] || d.length <= 8) {
                const ln = el('div', `dl ${x.t === '+' ? 'add' : x.t === '-' ? 'del' : ''}`);
                ln.textContent = `${x.t} ${x.s}`;
                pre.appendChild(ln);
            } });
            card.appendChild(pre);
            const ed = el('div', 'dedit');
            ed.hidden = true;
            const ta = el('textarea');
            ta.spellcheck = false;
            const apply = el('button', 'pri', 'apply'), cancel = el('button', undefined, 'cancel');
            const row = el('div', 'acts');
            row.append(apply, cancel);
            ed.append(ta, row);
            card.appendChild(ed);
            editBtn.addEventListener('click', () => { const blk = blockOf(script, id); if (!blk) {
                say('That sound is no longer in the script.');
                return;
            } ta.value = blk.lines.join('\n'); ta.rows = Math.min(14, blk.lines.length + 1); ed.hidden = !ed.hidden; if (!ed.hidden)
                ta.focus(); });
            cancel.addEventListener('click', () => { ed.hidden = true; });
            apply.addEventListener('click', () => {
                const blk = blockOf(script, id);
                if (!blk)
                    return;
                const lines = script.split('\n');
                const next = [...lines.slice(0, blk.start), ...ta.value.replace(/\n+$/, '').split('\n'), ...lines.slice(blk.end)].join('\n');
                const before = script;
                if (applyScript(next, `edited ${st ? soundAction(st) : id} in the conversation`, { kind: 'chat_script_edit', detail: { sourceId: id } })) {
                    ed.hidden = true;
                    thread.push({ role: 'you', text: `edited the script of ${st ? soundAction(st) : id}` }, { role: 'satie', text: 'Applied your edit.', before, after: next, changes: describeVoiceChanges(before, next)?.changes ?? [], ui: { kind: 'applied', text: '', script: next, target: [id] } });
                    paintChat();
                }
            });
        }
        return card;
    }
    function changeCard(m, title) {
        const card = el('div', 'card');
        card.appendChild(el('div', 'h', title));
        for (const c of (m.changes ?? []).slice(0, 8))
            card.appendChild(el('div', 'c', changeLine(c)));
        if ((m.changes?.length ?? 0) > 8)
            card.appendChild(el('div', 'c', `and ${m.changes.length - 8} more`));
        return card;
    }
    function paintList() {
        threadEl.replaceChildren();
        const all = convs.filter(c => c.thread.length || c === cur).sort((x, y) => lastOf(y) - lastOf(x));
        for (const c of all) {
            const row = el('div', 'conv');
            if (c === cur)
                row.dataset.cur = '1';
            const t = el('div', 'ct2');
            t.append(el('div', 'n', convTitle(c)), el('div', 'd', c.busy ? 'working…' : c.thread.length ? `${ago(lastOf(c))} · ${c.thread.filter(m => m.role === 'you').length} asks` : 'empty'));
            if (c.busy)
                row.dataset.busy = '1';
            row.appendChild(t);
            if (c.thread.length) {
                const del = el('button', 'x', '×');
                del.title = 'delete this conversation';
                del.addEventListener('click', e => { e.stopPropagation(); convs = convs.filter(o => o !== c); if (c === cur) {
                    const next = convs.filter(o => o.thread.length).sort((x, y) => lastOf(y) - lastOf(x))[0] ?? newConv();
                    if (!convs.includes(next))
                        convs.unshift(next);
                    cur = next;
                    thread = next.thread;
                    transcript = next.transcript;
                } saveConvs(); paintChat(); });
                row.appendChild(del);
            }
            row.addEventListener('click', () => openConv(c));
            threadEl.appendChild(row);
        }
    }
    /** What the question is about: chips you can take out (nothing is the whole scene), and what you selected, offered. */
    /**
     * The place card (2026-11-13): while the mix is open the chat is about what it has open, said once at the front:
     * "in ◌ The crossing", "on ▢ Train", "● vending buy". × takes it out (the whole scene); moving in the mix moves it.
     */
    let mixPlace = null, scopeOpen = false;
    /** The same sounds, in any order: the mix lists a place's sounds in its own order, the game in the script's. */
    const sameParts = (a, b) => {
        const key = (p) => `${p.kind}:${p.id}`, bs = new Set(b.map(key));
        return new Set(a.map(key)).size === bs.size && a.every(p => bs.has(key(p)));
    };
    function placeChat(l) {
        // the scope was following a place (the mix's, or the game's own pick) and not chips of your own: the mix takes it over,
        // so opening the mix on the crossing says "in ◌ The crossing", never each of its sounds
        const was = mixPlace, auto = (!!was && sameParts(chatScope, was.parts)) || (!was && !!autoPlace && sameParts(chatScope, autoPlace.parts));
        if (!l) {
            if (auto)
                chatScope = [];
            mixPlace = null;
            paintScope();
            return;
        }
        const parts = l.sounds.flatMap(x => (x.copies ?? [x.sourceId]).map(id => ({ kind: 'sound', id, label: x.name })));
        const next = { kind: l.kind, label: l.title, parts };
        if (was && was.kind === next.kind && was.label === next.label && sameParts(was.parts, parts))
            return;
        mixPlace = next;
        if (auto || !chatScope.length)
            chatScope = parts;
        paintScope();
    }
    /**
     * The same card in the in-game mixer (2026-11-13): what you picked (a sound, or a game entity), else the soundscape
     * you are standing in. It follows the pick until you put chips of your own; × asks about the whole scene, until the
     * next pick or the next soundscape.
     */
    let autoPlace = null, autoCleared = null, offPlaceWatch = null;
    /** The soundscapes, once the mixer is built (the chat paints during start-up, before `api` exists). */
    const scapesNow = () => { try {
        return api.soundscapes();
    }
    catch {
        return null;
    } };
    function pickPlace() {
        const stmts = engine.scriptStatements, sel = selectedParts();
        if (sel.length === 1 && sel[0].kind === 'sound')
            return { kind: 'sound', label: sel[0].label, parts: sel };
        if (sel.length === 1 && sel[0].kind === 'thing') {
            const host = sel[0].id, parts = stmts.filter(st => !!st.sourceId && (st.hostRef === host || wholeMap().get(st.hostRef ?? '') === host)).map(st => ({ kind: 'sound', id: st.sourceId, label: nameOf(st) }));
            return { kind: 'thing', label: sel[0].label, parts: parts.length ? parts : sel };
        }
        if (sel.length > 1 && selGroupKey)
            return { kind: 'thing', label: groupInfo.get(selGroupKey)?.label ?? `${sel.length} sounds`, parts: sel };
        if (sel.length > 1)
            return null;
        const acc = scapesNow(), id = acc?.current() ?? null, def = id ? acc.variants.soundscapes().find(d => d.id === id) : undefined;
        if (!def)
            return null;
        const ids = scapeSids(def.id), parts = stmts.filter(st => !!st.sourceId && ids.has(st.sourceId)).map(st => ({ kind: 'sound', id: st.sourceId, label: nameOf(st) }));
        return parts.length ? { kind: 'scape', label: def.label, parts } : null;
    }
    function paintScope() {
        if (!offPlaceWatch) {
            const acc = scapesNow();
            if (acc)
                offPlaceWatch = acc.onChange(() => paintScope());
        }
        if (!mixPlace && !cur.agentReply) {
            const was = autoPlace, nowP = pickPlace(), key = nowP ? `${nowP.kind}:${nowP.label}` : null;
            const following = !chatScope.length || (!!was && sameParts(chatScope, was.parts));
            if (key !== autoCleared)
                autoCleared = null;
            if (following) {
                autoPlace = nowP;
                chatScope = nowP && !autoCleared ? nowP.parts : chatScope.length && was && sameParts(chatScope, was.parts) ? [] : chatScope;
            }
        }
        scopeEl.replaceChildren();
        // what the question is about: chips you can take out; nothing is the whole scene
        // replying to the coding agent: one chip says so; take it out to talk to SATIE instead
        if (cur.agentReply) {
            const chip = el('span', 'chip agent', 'replying to your coding agent');
            const x = el('button', 'x', '×');
            x.title = 'talk to SATIE instead';
            x.addEventListener('click', () => { cur.agentReply = undefined; paintChat(); });
            chip.appendChild(x);
            scopeEl.appendChild(chip);
            chatInput.placeholder = placeholder();
            return;
        }
        // (2026-11-14) the mix's add or replace button: what you are doing, first, until you send or take it off
        if (intent) {
            const ic = el('span', 'chip intent');
            ic.append(el('b', undefined, intent.kind === 'add' ? '+' : '~'), el('span', undefined, intent.say));
            const x = el('button', 'x', '×');
            x.title = 'not this: a plain question';
            x.addEventListener('click', () => { intent = null; chatInput.placeholder = placeholder(); paintChat(); });
            ic.appendChild(x);
            scopeEl.appendChild(ic);
        }
        const where = mixPlace ?? autoPlace;
        const placed = !!where && chatScope.length > 0 && sameParts(chatScope, where.parts);
        const about = el('span', undefined, placed ? (where.kind === 'scape' ? 'in' : where.kind === 'thing' ? 'on' : 'about') : chatScope.length ? 'about' : 'about the whole scene');
        about.title = 'what your question is about: shift-click sounds in the list to add them, or a header\'s "ask" for a thing';
        scopeEl.appendChild(about);
        if (placed) {
            const card = el('span', `chip place k-${where.kind}`);
            card.append(el('i'), el('span', undefined, where.label));
            card.title = `${where.kind === 'scape' ? 'the soundscape you are in' : where.kind === 'thing' ? 'this game entity' : 'this sound'}: what you ask is about it (${chatScope.length} sound${chatScope.length === 1 ? '' : 's'})`;
            const x = el('button', 'x', '×');
            x.title = 'ask about the whole scene instead';
            x.addEventListener('click', () => { if (!mixPlace && autoPlace)
                autoCleared = `${autoPlace.kind}:${autoPlace.label}`; chatScope = []; paintChat(); });
            card.appendChild(x);
            scopeEl.appendChild(card);
        }
        const loose = placed ? [] : chatScope;
        if (loose.filter(q => q.kind !== 'view').length > 4 && !scopeOpen) {
            // a long scope is one chip that says how many; it opens to the list
            const n = loose.filter(q => q.kind !== 'view').length, c = el('button', 'chip many', `${n} sounds ▸`);
            c.title = loose.map(q => q.label).join(', ');
            c.addEventListener('click', () => { scopeOpen = true; paintChat(); });
            const x = el('button', 'x', '×');
            x.title = 'ask about the whole scene instead';
            x.addEventListener('click', e => { e.stopPropagation(); chatScope = chatScope.filter(q => q.kind === 'view'); paintChat(); });
            c.appendChild(x);
            scopeEl.appendChild(c);
        }
        for (const part of loose.filter(q => q.kind === 'view' || scopeOpen || loose.filter(z => z.kind !== 'view').length <= 4)) {
            const chip = el('span', 'chip', scopeChip(part));
            const x = el('button', 'x', '×');
            x.title = 'leave this out';
            x.addEventListener('click', () => { chatScope = chatScope.filter(q => q !== part); paintChat(); });
            chip.appendChild(x);
            scopeEl.appendChild(chip);
        }
        const sel = placed ? [] : selectedParts().filter(q => !inScope(q));
        if (sel.length) {
            const add = el('button', 'add', `+ the selected: ${sel.map(q => q.label).join(', ').slice(0, 42)}`);
            add.title = 'ask about what you selected in the list or the world';
            add.addEventListener('click', () => { chatScope = [...chatScope, ...sel]; paintChat(); });
            scopeEl.appendChild(add);
        }
        if (layer?.visibleIndices && !chatScope.some(q => q.kind === 'view')) {
            // narrows the question to what is on screen: it replaces the card or the sounds, it never adds to them
            const view = el('button', 'add', 'in view');
            view.title = 'ask only about the sounds on what is in front of you now (background sounds are not in view)';
            view.addEventListener('click', () => { if (autoPlace && !mixPlace)
                autoCleared = `${autoPlace.kind}:${autoPlace.label}`; chatScope = [{ kind: 'view', id: 'view', label: 'what I can see' }]; scopeOpen = false; paintChat(); });
            scopeEl.appendChild(view);
        }
        chatInput.placeholder = placeholder();
    }
    /** One message of a conversation: the dock's thread and a sound's card draw it the same way. */
    // ── the find in the conversation (a `find` reply): the card's block, the thread owns its state ──
    let chatDraftP = null;
    const chatDraft = () => (chatDraftP ??= new DraftPlayer(cardHost.draftEngine, () => script, run => { requestAnimationFrame(run); }));
    let chatPlaying = null;
    function stopThreadAudition() {
        if (!chatPlaying)
            return;
        const { m, id, since } = chatPlaying;
        chatPlaying = null;
        m.findPlaying = null;
        chatDraft().close();
        const ms = Math.round(performance.now() - since);
        if (m.find && ms >= 200) {
            record('find_listen', { findId: m.find.findId, round: m.find.round, sampleId: id, ms, where: 'chat' });
            if (m.find.findId)
                void cardHost.findRoutes.log?.({ findId: m.find.findId, listens: [{ round: m.find.round, sampleId: id, ms }] });
        }
    }
    function threadFind(m, ui) {
        // with an edit panel, chat opens it on the sound instead of running the find in the thread
        const asked = ui.target[0];
        if (opts.editPanel && asked && engine.scriptStatements.some(st => st.sourceId === asked)) {
            // (spec 018) "steer": the mix opens at the sound with its steering card (rounds of recordings like it, More like /
            // Less like, then new takes from the marks); its rounds are the gold rings on the map
            const words = ui.start.kind === 'words' ? ui.start.text : undefined;
            const go = () => { sideFind = { sid: asked, m: {}, words }; mixSig = ''; if (editOpen && opts.editPanel?.go)
                opts.editPanel.go({ sound: asked });
            else
                openEdit({ sound: asked, why: m.text }); setTimeout(() => paintMixSide(lastLevel), 120); };
            if (!m.editOpened) {
                m.editOpened = true;
                queueMicrotask(go);
            }
            return el('div', 'acts');
        }
        return findBlock(m, ui.target, ui.start, () => paintChat(), 'chat');
    }
    /**
     * The find, steered (Codex's individual sound steering): candidates by the sound's audio (or words), More like this /
     * Less like this on each, a shortlist, another round, then new ones made by the marks; Use puts one in. Drawn in a
     * chat reply, or in the mix's sidebar for the open sound (2026-11-13), from the same holder.
     */
    function findBlock(m, targetIds, start0, repaint, where, words) {
        const paintChat = repaint;
        const target = indicesOf(targetIds);
        const at = target[0];
        const st = at === undefined ? undefined : engine.scriptStatements[at];
        const ui = { start: start0 };
        if (!m.find && !m.findBusy) {
            m.findBusy = true;
            // start from the sound it plays now when there is one (its library id or its audio); the server only knows words
            void (async () => {
                // what should change, in words, steers the first round: with the audio as a hint, or the words alone
                let start = st && at !== undefined ? await cardHost.findStart(at).then(s => (s.kind === 'words' ? ui.start : s)) : ui.start;
                if (words)
                    start = start.kind === 'audio' ? { ...start, hint: `${start.hint ?? ''} ${words}`.trim() } : { kind: 'words', text: `${st ? nameOf(st) : ''}, ${words}`.replace(/^, /, '') };
                m.find = await startFind(start, cardHost.findRoutes, { loop: st ? st.kind === 'loop' : false });
                m.findBusy = false;
                record('find_round', { findId: m.find.findId, round: m.find.round, start: start.kind, status: m.find.status, where, shown: m.find.candidates.map(c => c.sampleId) });
                paintChat();
            })();
        }
        const state = m.find ?? newFind(ui.start, { loop: false });
        const name = st ? nameOf(st) : 'sound';
        const labels = at === undefined ? { all: 'Use this · add it here', one: null } : useLabels(name, cardHost.sharedCount(at));
        const go = async (run) => { m.findBusy = true; paintChat(); const s = await run(); m.findBusy = false; if (s)
            m.find = s; paintChat(); };
        // the card's look (its styles are scoped to .satie-dt-card)
        const wrap = el('div', 'satie-dt-card cthread');
        wrap.appendChild(findView(state, { title: st ? name : 'a new sound', labels, playing: m.findPlaying ?? null, busy: !!m.findBusy, canGenerate: !!cardHost.findRoutes.vary }, {
            play: c => {
                if (chatPlaying?.m === m && chatPlaying.id === c.sampleId) {
                    stopThreadAudition();
                    paintChat();
                    return;
                }
                stopThreadAudition();
                // in place, on the voices it would replace; a sound to add has no place yet, so it plays on its own
                if (at === undefined) {
                    const btn = el('button');
                    cardHost.previewAlone(c.url, btn);
                    m.findPlaying = m.findPlaying === c.sampleId ? null : c.sampleId;
                    paintChat();
                    return;
                }
                m.findPlaying = c.sampleId;
                chatPlaying = { m, id: c.sampleId, since: performance.now() };
                paintChat();
                void cardHost.decode(c.url).then(buf => { if (chatPlaying?.id !== c.sampleId)
                    return; chatDraft().preview({ script, buffers: Object.fromEntries(cardHost.takeKeys(at).map(k => [k, buf])) }); });
            },
            alone: (c, btn) => { stopThreadAudition(); cardHost.previewAlone(c.url, btn); },
            shortlist: c => { if (!m.find)
                return; m.find = shortlistFind(m.find, c); record('find_shortlist', { findId: m.find.findId, round: m.find.round, sampleId: c.sampleId, on: true, where: 'chat' }); paintChat(); },
            unshortlist: id => { if (!m.find)
                return; m.find = unshortlistFind(m.find, id); record('find_shortlist', { findId: m.find.findId, round: m.find.round, sampleId: id, on: false, where: 'chat' }); paintChat(); },
            mark: (id, v) => { if (!m.find)
                return; m.find = markFind(m.find, id, v); record('find_mark', { findId: m.find.findId, round: m.find.round, sampleId: id, verdict: m.find.marks[id] ?? null, where: 'chat' }); paintChat(); },
            unmark: id => { if (!m.find)
                return; m.find = unmarkFind(m.find, id); record('find_mark', { findId: m.find.findId, round: m.find.round, sampleId: id, verdict: null, where: 'chat' }); paintChat(); },
            editPlan: (d, repaint) => { if (!m.find)
                return; m.find = editPlanFind(m.find, d); if (repaint)
                paintChat(); },
            next: () => { stopThreadAudition(); void go(async () => m.find ? nextRound(m.find, cardHost.findRoutes) : null); },
            plan: () => { void go(async () => m.find ? planVariations(m.find, cardHost.findRoutes, () => crypto.randomUUID()) : null); },
            make: () => { stopThreadAudition(); void go(async () => m.find ? makeVariations({ ...m.find, vary: { ...m.find.vary, making: true } }, cardHost.findRoutes) : null); },
            dropPlan: () => { if (m.find) {
                m.find = { ...m.find, vary: undefined };
                paintChat();
            } },
            use: (c, scope) => {
                stopThreadAudition();
                const f = m.find;
                if (!f)
                    return;
                void go(async () => {
                    const ok = at === undefined ? await addFound(c, f.loop, { findId: f.findId, round: f.round }) : await useFound(at, c, scope, { findId: f.findId, round: f.round });
                    if (ok)
                        m.answered = true;
                    return f;
                });
            },
            close: () => { stopThreadAudition(); m.answered = true; record('find_closed', { findId: m.find?.findId ?? null, where: 'chat' }); paintChat(); },
        }));
        return wrap;
    }
    /**
     * Use this for a sound the scene does not have yet: a new voice plays the pick, where you are
     * looking (or in front of you), and its card opens so you can set how it plays.
     */
    async function addFound(c, loop, ctx) {
        if (destroyed || !documentsReady)
            return false;
        let buffer;
        try {
            buffer = await bufferFor(c.url);
        }
        catch (e) {
            say(`That sound could not load: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
        if (destroyed || !documentsReady)
            return false;
        const id = uniqueSourceId(script, c.clip.split('/').pop() ?? 'sound');
        const p = ctx.position ?? layer?.lookTarget?.()?.point ?? [0, 1.5, -3];
        const at = p.map(v => Math.round(v * 10) / 10).join(' ');
        const head = loop ? `loop ${c.clip}` : `oneshot ${c.clip} every 8to25`;
        const next = appendVoiceBlock(script, `${head}\n  source_id ${id}\n  place ${at}\n  visual sphere`);
        const key = pathFor(c.clip);
        manifest[key] = { url: c.url, source: 'library', name: c.name, license: c.license, ...(c.attribution ? { attribution: c.attribution } : {}), sampleId: c.sampleId };
        engine.setAudioBuffer(key, buffer);
        if (!applyScript(next, `added ${c.name.slice(0, 48)}`, { kind: 'add_sound', detail: { to: { clip: c.clip, sampleId: c.sampleId }, findId: ctx.findId, round: ctx.round, via: 'find' } })) {
            delete manifest[key];
            return false;
        }
        if (ctx.findId)
            void cardHost.findRoutes.log?.({ findId: ctx.findId, use: { round: ctx.round, sampleId: c.sampleId, scope: 'every-voice' } });
        const j = engine.scriptStatements.findIndex(o => o.sourceId === id);
        if (j >= 0) {
            openProps = j;
            finder = null;
            view = 'mixer';
            render();
        }
        return true;
    }
    function msgView(m) {
        const b = el('div', `msg ${m.role}`);
        if (m.pending)
            b.dataset.pending = '1';
        if (m.role === 'you') {
            // what it was about, as the chips it was sent with (none: the whole scene)
            const chips = el('div', 'mchips');
            if (m.place) {
                const c = el('span', `chip place k-${m.place.kind}`);
                c.append(el('i'), el('span', undefined, m.place.label));
                chips.appendChild(c);
            }
            else if (m.chips?.length)
                for (const c of m.chips)
                    chips.appendChild(el('span', 'chip', c.kind === 'view' ? 'what I could see' : c.label));
            else if (m.scope)
                chips.appendChild(el('span', 'chip', m.scope));
            if (chips.childElementCount)
                b.appendChild(chips);
            // a re-run folds the turns it replaced (as text; the scene's history keeps their versions)
            if (m.replaced?.length) {
                const n = m.replaced.filter(r => r.role === 'you').length;
                const t = el('button', 'link', m.showReplaced ? 'hide what this replaced' : `replaced ${n} earlier turn${n === 1 ? '' : 's'} (show)`);
                t.addEventListener('click', e => { e.stopPropagation(); m.showReplaced = !m.showReplaced; paintChat(); });
                b.appendChild(t);
                if (m.showReplaced) {
                    const box = el('div', 'replaced');
                    for (const r of m.replaced)
                        box.appendChild(el('div', `msg ${r.role}`, r.text));
                    b.appendChild(box);
                }
            }
            // go back to any message you typed: ✎ change it and run it again, ↻ run it again as it was
            if (m.typed && convs.find(c => c.thread.includes(m)) === cur && !m.editing) {
                const tools = el('div', 'mtools');
                const ed = el('button', 'quiet', '✎');
                ed.title = 'change this and run it again (the scene goes back to how it was then; later turns fold away, history keeps them)';
                const again = el('button', 'quiet', '↻');
                again.title = 'run this again from here (the scene goes back to how it was then)';
                ed.addEventListener('click', e => { e.stopPropagation(); if (cur.busy)
                    return; m.editing = true; paintChat(); });
                again.addEventListener('click', e => { e.stopPropagation(); if (cur.busy)
                    return; rerun(m, m.sent ?? m.text); });
                tools.append(ed, again);
                b.appendChild(tools);
            }
            if (m.editing) {
                const box = el('div', 'medit');
                const ta = el('textarea');
                ta.value = m.sent ?? m.text;
                ta.rows = Math.min(6, Math.max(2, Math.ceil(ta.value.length / 50)));
                const row = el('div', 'acts');
                const run = el('button', 'pri', 'run it again'), cancel = el('button', undefined, 'cancel');
                run.addEventListener('click', () => { const t = ta.value.trim(); if (!t)
                    return; m.editing = false; rerun(m, t); });
                cancel.addEventListener('click', () => { m.editing = false; paintChat(); });
                ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    run.click();
                } if (e.key === 'Escape')
                    cancel.click(); });
                row.append(run, cancel);
                box.append(ta, row);
                b.appendChild(box);
                queueMicrotask(() => ta.focus());
                return b;
            }
        }
        if (m.role === 'satie' && m.status?.length)
            b.appendChild(el('div', 'st', m.status.join(' · ')));
        if (m.role === 'you' && m.toAgent)
            b.appendChild(el('div', 'who', 'to your coding agent'));
        if (m.role === 'agent') {
            // the coding agent speaks for itself, under its own name; SATIE does not rewrite it
            if (m.activity)
                b.dataset.activity = '1';
            else
                b.appendChild(el('div', 'who', 'your coding agent'));
            b.appendChild(el('div', 'tx', m.text));
            if (m.permit) {
                const pv = m.permit.preview;
                if (pv?.command)
                    b.appendChild(el('div', 'cmd', pv.command));
                else if (pv && (pv.before || pv.after)) {
                    const d = el('div', 'diff');
                    for (const l of (pv.before ?? '').split('\n').filter(Boolean).slice(0, 8))
                        d.appendChild(el('div', 'dl del', `- ${l}`));
                    for (const l of (pv.after ?? '').split('\n').filter(Boolean).slice(0, 8))
                        d.appendChild(el('div', 'dl add', `+ ${l}`));
                    b.appendChild(d);
                }
                if (m.permit.answered)
                    b.appendChild(el('div', 'note', m.permit.allowed ? 'allowed' : 'not allowed'));
                else {
                    const row = el('div', 'acts');
                    const yes = el('button', 'pri', 'allow'), no = el('button', undefined, 'no');
                    yes.addEventListener('click', () => answerPermit(m, true));
                    no.addEventListener('click', () => answerPermit(m, false));
                    row.append(yes, no);
                    b.appendChild(row);
                }
            }
            return b;
        }
        const ui = m.ui;
        // what SATIE understood comes first: the sentence you check and correct part by part
        // (spec 018) no "I understood" receipt: SATIE says it in its own words; the reading stays for corrections
        void readingView;
        b.appendChild(el('div', 'tx', m.text));
        const acts = el('div', 'acts');
        // SATIE offers sounds: the same find block as a sound's card, run here
        if (ui?.kind === 'find' && !m.answered)
            b.appendChild(threadFind(m, ui));
        // Claude Code style: numbered options; ▶ hears a candidate where it plays; the last line is your own words
        if (ui?.kind === 'ask') {
            const list = el('div', 'opts');
            if (m.answered)
                list.dataset.past = '1';
            const targetIdx = indicesOf(ui.target ?? [])[0];
            // how the game fires the sound these would replace: steps play as a short run at its pace
            const cadence = ui.options.some(o => o.candidate) ? cadenceOf(indicesOf(ui.target ?? [])) : null;
            if (cadence && !m.answered) {
                const how = el('div', 'how');
                const single = m.single !== false;
                how.appendChild(el('span', undefined, single ? '▶ plays one' : `▶ plays ${cadence.times} in a row, at the pace the game fires it`));
                const flip = el('button', 'quiet', single ? 'in a row' : '×1');
                flip.title = single ? 'hear each as a short run, the way the game plays it' : 'hear a single one';
                flip.addEventListener('click', () => { stopPreview(); m.single = !single; paintChat(); });
                how.appendChild(flip);
                list.appendChild(how);
            }
            const rowsOf = [];
            const paintSel = () => rowsOf.forEach((r, k) => { r.dataset.sel = m.listening === k ? '1' : '0'; });
            ui.options.forEach((o, n) => {
                const row = el('div', 'opt');
                const num = el('span', 'num', o.candidate ? (o.candidate.id.replace(/^c/, '') || String(n + 1)) : String(n + 1));
                const body = el('div', 'ob');
                body.append(el('div', 'ol', o.label), ...(o.detail || o.candidate ? [el('div', 'od', [o.detail, o.candidate ? (o.candidate.from === 'library' ? 'recording' : 'new') : ''].filter(Boolean).join(' · '))] : []));
                row.append(num, body);
                // listen first: clicking a row (or ▶) plays it and marks it; only "use this" chooses
                let pv = null;
                const key = o.candidate?.id ?? o.sound ?? o.label;
                const hear = () => {
                    if (!pv)
                        return;
                    // a candidate is heard where it would play, in place of the sounds it would replace, the rest of
                    // the scene as it is; a new sound with nothing to replace plays plainly, the scene ducked under it
                    // heard alone (everything else silent); a sound the game fires over and over plays as a short run
                    if (o.candidate)
                        togglePreview(pv, el('i'), targetIdx ?? -1, o.candidate.url, false, { alone: true, repeat: candidatePreviewRepeat(cadence, m.single), onEnd: ms => logListen(m.offer, key, ms) });
                    else if (o.sound) {
                        const si = indicesOf([o.sound])[0];
                        if (si !== undefined) {
                            playNow(si, pv, true);
                            if (preview) {
                                preview.startedAt = performance.now();
                                preview.onEnd = ms => logListen(m.offer, key, ms);
                            }
                        }
                    }
                };
                if (o.candidate || (o.sound && indicesOf([o.sound]).length)) {
                    pv = el('button', 'pv');
                    pv.dataset.state = 'idle';
                    pv.innerHTML = ICON.play;
                    pv.title = 'hear it';
                    pv.addEventListener('click', e => { e.stopPropagation(); m.listening = n; paintSel(); hear(); });
                    row.append(pv);
                    if (o.sound) {
                        const si = indicesOf([o.sound])[0];
                        if (si !== undefined)
                            row.addEventListener('mouseenter', () => focusVoices([si]));
                    }
                }
                const use = el('button', 'use', o.candidate ? 'use this' : 'this one');
                use.addEventListener('click', e => {
                    e.stopPropagation();
                    if (cur.busy)
                        return;
                    stopPreview();
                    m.answered = true;
                    m.picked = n;
                    logOutcome(m.offer, 'kept', key);
                    // a sound chosen by name settles the question: it rides as the chips (every voice it stands for)
                    const chosen = o.sounds ?? (o.sound ? [o.sound] : []);
                    const chips = !o.candidate && chosen.length ? chosen.map(id => ({ kind: 'sound', id, label: o.label })) : undefined;
                    void sendChat(`${o.candidate ? 'Chose' : 'Answer'}: ${o.label}${o.candidate ? ` (candidate ${o.candidate.id})` : ''}`, true, `${o.label}`, o.candidate?.id, undefined, undefined, false, false, chips ? { chips } : {});
                });
                if (o.candidate) {
                    // steer the next batch toward one of them
                    const more = el('button', 'more', 'more like this');
                    more.title = 'a few new ones closer to this';
                    more.addEventListener('click', e => { e.stopPropagation(); if (cur.busy)
                        return; stopPreview(); m.answered = true; logOutcome(m.offer, 'more-like', key); void sendChat(`More like "${o.label}" (candidate ${o.candidate.id}): make a few new ones closer to it.`, true, `more like ${o.label}`); });
                    row.append(more);
                }
                row.append(use);
                if (m.picked === n)
                    row.dataset.picked = '1';
                if (!pv)
                    row.dataset.plain = '1';
                row.addEventListener('click', () => {
                    if (cur.busy)
                        return;
                    if (!pv) {
                        use.click();
                        return;
                    } // a plain choice (nothing to hear): the row is the choice
                    m.listening = n;
                    paintSel();
                    hear();
                });
                rowsOf.push(row);
                list.appendChild(row);
            });
            paintSel();
            const own = el('div', 'opt own');
            if (m.answered)
                own.hidden = true;
            const ownIn = el('input');
            ownIn.type = 'text';
            ownIn.placeholder = 'or say it your way (e.g. "closer to the first, but rougher")';
            ownIn.addEventListener('keydown', e => { if (e.key === 'Enter' && ownIn.value.trim()) {
                stopPreview();
                logOutcome(m.offer, 'redirected');
                m.answered = true;
                void sendChat(ownIn.value, true);
            } });
            own.append(ownIn);
            list.appendChild(own);
            if (!m.answered && ui.options.some(o => o.candidate)) {
                const none = el('button', undefined, 'none of these');
                none.title = 'none is right: say so, or say why in the line above';
                none.addEventListener('click', () => { if (cur.busy)
                    return; stopPreview(); logOutcome(m.offer, 'none'); m.answered = true; void sendChat('None of these is right.', true, 'none of these'); });
                acts.appendChild(none);
            }
            b.appendChild(list);
        }
        // the reading before anything is made: correct its parts, then say go (each correction is a new reading)
        if (ui?.kind === 'confirm') {
            const plan = ui.plan;
            if (m.dismissed)
                b.dataset.past = '1';
            else if (!m.answered) {
                const card = el('div', 'plan');
                card.appendChild(el('div', 'pl', `makes ${plan.newTakes} new sound${plan.newTakes === 1 ? '' : 's'} to choose from${plan.library ? `, with up to ${plan.library} recording${plan.library === 1 ? '' : 's'} from the library` : ''}`));
                const descs = plan.variations?.length ? plan.variations.slice(0, plan.newTakes) : [plan.describe];
                descs.forEach((d, k) => card.appendChild(el('div', 'pd', `${descs.length > 1 ? `${k + 1}. ` : ''}${d}`)));
                b.appendChild(card);
                const conv = convs.find(c => c.thread.includes(m)) ?? cur;
                const go = el('button', 'pri', 'make them');
                go.title = 'nothing is made until you press this';
                go.addEventListener('click', () => { if (conv.busy)
                    return; m.answered = true; m.openPart = undefined; void sendChat('Go: make them.', true, 'make them', undefined, undefined, undefined, !!conv.about, true); });
                acts.appendChild(go);
                if (plan.library) {
                    const lib = el('button', undefined, 'recordings only');
                    lib.title = 'look in the library only, no new sounds';
                    lib.addEventListener('click', () => { if (conv.busy || !ui.reading)
                        return; correctReading(m, ui.reading, 'source', 'recordings from the library only, no new sounds', []); });
                    acts.appendChild(lib);
                }
            }
            else
                b.dataset.past = '1';
        }
        // about another sound than this conversation: one click asks there, in its own conversation
        if (ui?.kind === 'reply' && ui.elsewhere?.length && !m.answered) {
            const ids = ui.elsewhere, names = ids.map(id => { const st = engine.scriptStatements.find(x => x.sourceId === id); return st ? nameOf(st) : id.replace(/_/g, ' '); });
            const conv = convs.find(c => c.thread.includes(m)) ?? cur;
            const asked = conv.thread[conv.thread.indexOf(m) - 1];
            const there = el('button', 'pri', `ask about ${names.join(', ').slice(0, 50)} instead`);
            there.addEventListener('click', () => {
                if (!asked || asked.role !== 'you')
                    return;
                m.answered = true;
                askAbout(ids.map((id, k) => ({ kind: 'sound', id, label: names[k] })));
                void sendChat(asked.text);
            });
            acts.appendChild(there);
        }
        // SATIE only suggested a change (nothing changed yet): say so, and one click does it
        if (ui?.kind === 'reply' && ui.suggest && !m.answered) {
            // the change SATIE would make, in full; nothing has changed until you say so
            const sug = el('div', 'suggest');
            sug.appendChild(el('div', undefined, ui.suggest));
            b.appendChild(sug);
            const yes = el('button', 'pri', 'make this change');
            yes.title = 'nothing changed yet; this makes it';
            yes.addEventListener('click', () => { if (cur.busy)
                return; m.answered = true; void sendChat(`Yes, do that: ${ui.suggest}`, true, `make this change: ${ui.suggest}`); });
            acts.appendChild(yes);
        }
        // several real ways to get it: each says what it needs and its limits; nothing changes until one is chosen
        if (ui?.kind === 'paths') {
            const list = el('div', 'paths');
            if (m.answered)
                list.dataset.past = '1';
            ui.paths.filter(pth => pth.changes === 'script').forEach((pth, n) => {
                const card = el('div', 'path');
                const head = el('div', 'ph');
                // who does it, in words anyone reads: SATIE now, or the game itself first
                const badge = el('span', 'pb', pth.changes === 'script' ? 'SATIE does this now' : 'needs a change in your game');
                if (pth.changes !== 'script')
                    badge.dataset.code = '1';
                badge.title = pth.changes === 'script' ? 'SATIE changes the sound right away; you can undo it' : 'the game itself has to change first; SATIE writes the request for your coding agent and adds the sound once that is done';
                head.append(el('span', 'pn', String(n + 1)), el('span', 'pl', pth.label), badge);
                card.append(head, el('div', 'pd', pth.detail));
                if (pth.changes !== 'script' && pth.needs)
                    card.appendChild(el('div', 'pd', `SATIE writes this up for your coding agent: ${pth.needs}`));
                if (!m.answered) {
                    const goBtn = el('button', undefined, 'go with this');
                    goBtn.addEventListener('click', () => { if (cur.busy)
                        return; m.answered = true; logOutcome(m.offer, 'kept', pth.label); void sendChat(`Go with: ${pth.label}`, true, `go with: ${pth.label}`, undefined, undefined, undefined, true, false, { path: pth }); });
                    card.appendChild(goBtn);
                }
                list.appendChild(card);
            });
            if (!m.answered)
                list.appendChild(el('div', 'note', 'or ask anything about these'));
            b.appendChild(list);
        }
        if (ui?.kind === 'handoff')
            b.appendChild(el('div', 'note', `This needs a game-world change outside the sound mixer. Ask your coding agent: ${ui.request.needs}`));
        // a task: the game lacks what it names (checked by code); the developer's coding agent adds it, or they take the sound alone now
        if (ui?.kind === 'task') {
            const box = el('div', 'task');
            if (m.answered)
                box.dataset.past = '1';
            box.appendChild(el('div', 'tt', ui.task.title));
            box.appendChild(el('div', 'pd', `Your game needs: ${ui.task.missing.map(x => x.what || x.id.replace(/_/g, ' ')).join(', ')}.`));
            if (m.taskPath)
                taskCardState(box, ui.task.title, m.taskPath);
            else if (!m.answered && canTask) {
                const send = el('button', 'primary', 'Send to my coding agent');
                send.title = 'writes the task for your coding agent in this project, with the exact names SATIE listens for, and copies one line to paste to it';
                send.addEventListener('click', () => { if (cur.busy)
                    return; void sendTask(m, ui); });
                box.appendChild(send);
                if (ui.soundOnly) {
                    const alone = el('button', 'link', `or ${ui.soundOnly.label.replace(/^./, c => c.toLowerCase())}`);
                    alone.title = ui.soundOnly.detail;
                    const path = ui.soundOnly;
                    alone.addEventListener('click', () => { if (cur.busy)
                        return; m.answered = true; logOutcome(m.offer, 'kept', path.label); void sendChat(`Go with: ${path.label}`, true, `go with: ${path.label}`, undefined, undefined, undefined, true, false, { path }); });
                    box.appendChild(alone);
                }
            }
            b.appendChild(box);
        }
        if (m.changes?.length && (ui?.kind === 'applied' || ui?.kind === 'quick')) {
            if (m.after !== undefined && script === m.after) {
                b.appendChild(hearRow((m.changes ?? []).filter(c => c.change !== 'remove').map(c => c.voice.sourceId).filter((x) => !!x)));
                const there = el('button', undefined, 'show in mixer');
                there.title = 'the changed sounds, selected in the mixer';
                there.addEventListener('click', () => { const ch = m.changes ?? []; view = 'mixer'; render(); queueMicrotask(() => showChanged(ch)); });
                acts.appendChild(there);
            }
            b.appendChild(diffCard(m, 'changed'));
        }
        if (ui?.kind === 'takes' && m.takes) {
            if (!m.takes.undone)
                b.appendChild(hearRow(ui.target));
            b.appendChild(takesCard(m, m.takes));
            if (m.fetching)
                b.appendChild(el('div', 'note', 'the chosen take plays now; making the rest of its takes…'));
            if (!m.takes.undone) {
                const t = el('div', 'acts');
                const back = el('button', undefined, 'undo');
                back.title = 'put the takes back as they were';
                back.addEventListener('click', () => { if (m.takes && undoTakes(m.takes)) {
                    transcript.push({ role: 'user', content: 'I undid that change.' });
                    paintChat();
                } });
                t.appendChild(back);
                b.appendChild(t);
            }
        }
        if (ui?.kind === 'proposal' && !m.dismissed && m.after === undefined) {
            b.appendChild(diffCard({ ...m, before: script }, 'will change'));
            // where the new sounds go, before you say yes
            const added = (m.changes ?? []).filter(c => c.change === 'add');
            const places = [...new Set(added.map(c => c.voice.host).filter((h) => !!h))];
            if (places.length) {
                const wh = el('div', 'where');
                wh.appendChild(el('span', undefined, `goes at the ${places.map(hostName).join(', the ')}`));
                for (const h of places) {
                    const go = el('button', undefined, places.length > 1 ? `show the ${hostName(h)}` : 'show where');
                    go.addEventListener('click', () => { if (!layer?.focusHost?.(h))
                        say('That place is not in view of the world layer.'); });
                    wh.appendChild(go);
                }
                b.appendChild(wh);
            }
            const apply = el('button', 'pri', 'apply');
            const cancel = el('button', undefined, 'cancel');
            apply.addEventListener('click', async () => {
                const before = script;
                if (ui.seed)
                    await seedTake(ui.seed, ui.script);
                if (applyScript(ui.script, `SATIE: ${ui.text.slice(0, 60)}`, { kind: 'chat_edit', detail: { approved: true, turn: cur.turn ?? null, ...(ui.reading ? { reading: ui.reading } : {}) } })) {
                    m.before = before;
                    m.after = ui.script;
                    m.missing = missingTakes(ui.script);
                    noteSatieChanges(m.changes);
                    showChanged(m.changes);
                    openAdded(m.changes);
                    transcript.push({ role: 'user', content: 'Approved: apply it.' }, { role: 'assistant', content: JSON.stringify({ do: 'say', text: 'Applied.' }) });
                    record('chat_approve', { applied: true, turn: cur.turn ?? null });
                    // new sounds play straight away: fetch what the addition needs (no button, no price)
                    if (m.missing)
                        setTimeout(() => { const btn = el('button'); void realizeFor(m, btn); }, 0);
                }
                paintChat();
            });
            cancel.addEventListener('click', () => { m.dismissed = true; transcript.push({ role: 'user', content: 'Not that; do not apply it.' }); record('chat_approve', { applied: false, turn: cur.turn ?? null }); paintChat(); });
            acts.append(apply, cancel);
        }
        if (m.after !== undefined && m.before !== undefined) {
            const live = script === m.after;
            const undo = el('button', undefined, 'undo');
            undo.disabled = !live;
            undo.title = live ? 'put the scene back as it was before this' : 'the scene changed since; use history to go back';
            undo.addEventListener('click', () => { if (applyScript(m.before, 'undid a SATIE change', { kind: 'chat_undo', detail: {} })) {
                m.after = undefined;
                lastOp = null;
                transcript.push({ role: 'user', content: 'I undid that change.' });
                paintChat();
            } });
            acts.appendChild(undo);
            if (ui?.kind === 'quick' && live)
                for (const [t, send] of [['more', 'more'], ['too much', 'too much']]) {
                    const btn = el('button', undefined, t);
                    btn.addEventListener('click', () => void sendChat(send, true));
                    acts.appendChild(btn);
                }
            if (m.missing && m.fetching === false) {
                const get = el('button', 'pri', `try again: get the ${m.missing} new sound${m.missing === 1 ? '' : 's'}`);
                get.addEventListener('click', () => void realizeFor(m, get));
                acts.appendChild(get);
            }
        }
        if (acts.childElementCount)
            b.appendChild(acts);
        return b;
    }
    function paintChat() {
        // (2026-11-14) the conversation grows while its last reply holds choices to hear, then settles back
        {
            const last = [...thread].reverse().find(x => x.role !== 'you');
            chatWrap.dataset.rich = last && !last.answered && ((last.ui?.options?.length ?? 0) > 0 || (last.ui?.paths?.length ?? 0) > 0) ? '1' : '0';
        }
        saveConvs();
        const any = convs.some(c => c.thread.length);
        // the header stays while any conversation exists, so one still working is never out of reach
        chatWrap.dataset.open = any || thread.length ? '1' : '0';
        clearChat.hidden = !thread.length;
        const others = convs.filter(c => c.thread.length && c !== cur);
        const working = others.filter(c => c.busy).length;
        const openNow = chatWrap.dataset.fold !== '1';
        // the header is always this conversation (a new one is "New chat"); the others are a count on "all"
        listBtn.textContent = listOpen ? 'Your chats' : thread.length ? convTitle(cur) : 'New chat with SATIE';
        allBtn.hidden = !others.length && !listOpen;
        allBtn.textContent = listOpen ? 'back' : `all chats · ${others.length}${working ? ` (${working} working)` : ''}`;
        void openNow;
        listBtn.dataset.busy = working ? '1' : '0';
        // nothing to show is no space: an empty conversation is only the input; the list is as tall as its rows
        chatWrap.dataset.empty = !listOpen && !thread.length ? '1' : '0';
        chatWrap.dataset.list = listOpen ? '1' : '0';
        if (listOpen) {
            paintList();
            scopeEl.replaceChildren();
            chatInput.placeholder = placeholder();
            return;
        }
        paintTasks();
        threadEl.replaceChildren();
        for (const m of thread)
            threadEl.appendChild(msgView(m));
        threadEl.scrollTop = threadEl.scrollHeight;
        paintScope();
        chatInput.placeholder = placeholder();
        chatSend.disabled = !!cur.busy;
    }
    /** Every sound offered in a conversation, by its buffer key: a voice that plays one loads it from here, not from a search. */
    const offeredSounds = new Map();
    function noteOffered(c) { offeredSounds.set(pathFor(c.clip), { url: c.url, source: c.from === 'library' ? 'library' : 'generated', name: c.describe ?? c.name }); }
    for (const c of convs)
        for (const m of c.thread)
            if (m.ui?.kind === 'ask')
                for (const o of m.ui.options)
                    if (o.candidate)
                        noteOffered(o.candidate);
    /** The sounds a script plays that have no take, by name (for saying which ones). */
    function missingNames(text) {
        const bufs = engine.getAudioBuffers();
        const out = [];
        for (const st of tryParse(text).statements ?? []) {
            if (st.kind === 'trigger' && st.genPrompt && /\{\w+\}/.test(st.genPrompt))
                continue;
            const keys = st.isGenerated && st.variants > 1 ? Array.from({ length: st.variants }, (_, k) => takeClipPath(st, k)) : [pathFor(st.clip)];
            if (keys.some(k => !bufs.has(k)))
                out.push(nameOf(st));
        }
        return [...new Set(out)];
    }
    /** A voice whose clip is a sound a conversation offered, with no take loaded (saved before it was seeded): load it now. */
    async function fillFromOffered() {
        let n = 0;
        for (const st of tryParse(script).statements ?? []) {
            const key = pathFor(st.clip), known = offeredSounds.get(key);
            if (!known || engine.getAudioBuffers().has(key))
                continue;
            try {
                engine.setAudioBuffer(key, await bufferFor(known.url));
                manifest[key] = known;
                n++;
            }
            catch { /* stays silent; the row says so */ }
        }
        if (n) {
            engine.loadScript(script);
            scheduleSave();
            buildMixer();
        }
    }
    async function realizeFor(m, btn) {
        btn.disabled = true;
        btn.textContent = 'getting the sounds…';
        m.fetching = true;
        paintChat();
        // first the sounds this conversation already offered (a new take made for it is not in the library)
        for (const st of tryParse(script).statements ?? []) {
            const key = pathFor(st.clip), known = offeredSounds.get(key);
            if (known && !engine.getAudioBuffers().has(key)) {
                try {
                    engine.setAudioBuffer(key, await bufferFor(known.url));
                    manifest[key] = known;
                }
                catch { /* the server may still have it */ }
            }
        }
        if (!missingTakes(script)) {
            m.missing = 0;
            m.fetching = false;
            engine.loadScript(script);
            scheduleSave();
            buildMixer();
            paintChat();
            return;
        }
        try {
            const r = await fetch(realizeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script, maxCents: Math.max(100, missingTakeKeys(script) * 10) }) }).then(x => x.json());
            if (!r.ok)
                throw new Error(r.error ?? 'no takes');
            for (const [key, entry] of Object.entries(r.samples ?? {})) {
                if (engine.getAudioBuffers().has(key) || !entry?.url)
                    continue;
                try {
                    engine.setAudioBuffer(key, await bufferFor(entry.url));
                    manifest[key] = entry;
                }
                catch { /* counted below */ }
            }
            engine.loadScript(script); // the new voices start with their takes
            scheduleSave();
            buildMixer();
            // only the sounds THIS change touched (others missing a take are not this reply's business)
            const mine = new Set((m.changes ?? []).map(c => c.voice.sourceId).filter((x) => !!x));
            const scoped = (st) => !mine.size || (!!st.sourceId && mine.has(st.sourceId));
            m.missing = missingTakes(script, scoped);
            m.fetching = false;
            // say which of them is silent and why (its own failure, not another sound's), once
            if (!m.missingNoted) {
                const reasons = [];
                for (const st of tryParse(script).statements ?? []) {
                    if (!scoped(st) || !missingTakes(st, () => true))
                        continue;
                    const key = pathFor(st.clip);
                    const own = (r.failed ?? []).find(f => f.clipPath === key || f.clipPath.startsWith(key));
                    reasons.push(`${nameOf(st)} has no sound yet${own?.error ? `: ${own.error}` : ''}`);
                }
                if (reasons.length) {
                    m.text = `${m.text}\n\n${[...new Set(reasons)].join('. ')}.`;
                    m.missingNoted = true;
                }
            }
            record('chat_realize', { missing: m.missing });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            m.fetching = false;
            thread.push({ role: 'satie', text: needsSignIn(msg) ? 'Sign in with SATIE first (the button at the bottom), then try again.' : `Could not get the sounds: ${msg}` });
        }
        paintChat();
    }
    // ── the developer's coding agent in this thread (the dev plugin runs it; SATIE relays nothing) ──
    const agentUrl = `${chatUrl.replace(/\/chat$/, '')}/agent`;
    let agentInfo = null;
    if (authoring)
        void fetch(agentUrl).then(x => x.json()).then((r) => { agentInfo = { available: !!r.available, ...(r.reason ? { reason: r.reason } : {}) }; if (chatReady)
            paintChat(); }).catch(() => { agentInfo = { available: false }; });
    const agentPolls = new Map();
    /** Start (or continue) the coding agent's turn; its replies arrive in this conversation. */
    async function runAgent(conv, message, opts = {}) {
        const post = (body) => fetch(`${agentUrl}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, body: await x.json() }));
        let r = await post({ message, ...(opts.request ? { request: opts.request } : {}), ...(opts.run ? { run: opts.run } : {}), ...(opts.session ? { session: opts.session } : {}) });
        // the dev server restarted: the same session continues from its saved transcript
        if (r.status === 404 && opts.session)
            r = await post({ message, session: opts.session });
        if (!r.body.ok || !r.body.run) {
            conv.thread.push({ role: 'satie', text: `Your coding agent could not start: ${r.body.error ?? 'no reply from the dev server'}.` });
            paintChat();
            return false;
        }
        conv.agentReply = undefined;
        record('agent_turn', { run: r.body.run, request: opts.request ?? null, continuing: !!opts.run || !!opts.session });
        const known = agentPolls.get(r.body.run);
        agentPolls.set(r.body.run, { conv, after: known?.after ?? 0, timer: null, ...(opts.origin ?? known?.origin ? { origin: opts.origin ?? known?.origin } : {}) });
        void pollAgent(r.body.run);
        return true;
    }
    async function pollAgent(run) {
        const p = agentPolls.get(run);
        if (!p || destroyed)
            return;
        let r;
        try {
            r = await fetch(`${agentUrl}/events?run=${encodeURIComponent(run)}&after=${p.after}`).then(x => x.json());
        }
        catch {
            r = { ok: false };
        }
        // the dev server restarted and forgot the run: stop following it (a reply resumes its session)
        if (r.ok === false && r.error?.startsWith('no such run')) {
            agentPolls.delete(run);
            return;
        }
        if (!r.ok) {
            p.timer = setTimeout(() => void pollAgent(run), 3000);
            return;
        }
        const th = p.conv.thread;
        if (r.sessionId && p.origin)
            p.origin.agentSession = r.sessionId;
        for (const e of r.events ?? []) {
            // one activity line, updated in place: reading and searching are not messages
            const lastActivity = th[th.length - 1]?.activity ? th[th.length - 1] : null;
            if (e.kind === 'tool') {
                if (lastActivity)
                    lastActivity.text = e.what;
                else
                    th.push({ role: 'agent', text: e.what, activity: true });
                continue;
            }
            if (lastActivity)
                th.splice(th.indexOf(lastActivity), 1);
            if (e.kind === 'say')
                th.push({ role: 'agent', text: e.text });
            else if (e.kind === 'permit')
                th.push({ role: 'agent', text: `May I ${e.what}?`, permit: { run, id: e.id, tool: e.tool, what: e.what, ...(e.preview ? { preview: e.preview } : {}) } });
            else if (e.kind === 'permitted') {
                const m = th.find(x => x.permit?.run === run && x.permit.id === e.id);
                if (m?.permit) {
                    m.permit.answered = true;
                    m.permit.allowed = e.allow;
                }
            }
            else if (e.kind === 'end') {
                if (!e.ok)
                    th.push({ role: 'agent', text: `It stopped: ${e.text}` });
                // SATIE's own context learns what changed in the game
                if (e.ok && e.text)
                    p.conv.transcript.push({ role: 'user', content: `(My coding agent changed the game: ${e.text.slice(0, 600)})` }, { role: 'assistant', content: JSON.stringify({ do: 'say', text: 'Noted.' }) });
                p.conv.agentReply = { run, ...(r.sessionId ? { session: r.sessionId } : {}) };
                void checkRequests();
            }
        }
        p.after = r.next ?? p.after;
        if (p.origin)
            p.origin.agentAfter = p.after;
        if ((r.events ?? []).length) {
            saveConvs();
            if (p.conv === cur)
                paintChat();
            if (chatWrap.dataset.fold === '1')
                chatWrap.dataset.dot = '1';
        }
        if (r.status === 'running')
            p.timer = setTimeout(() => void pollAgent(run), 1200);
        else if (p.conv === cur)
            paintChat();
    }
    // a game change reloads the page (Vite), often while the agent is still working: pick its runs up again
    // where the thread left off, so its next messages and approval requests still arrive here
    queueMicrotask(() => {
        for (const c of convs)
            for (const m of c.thread) {
                if (!m.agentRun || m.agentRun === 'starting' || m.agentRun === 'running' || m.waiting?.done || agentPolls.has(m.agentRun))
                    continue;
                agentPolls.set(m.agentRun, { conv: c, after: m.agentAfter ?? 0, timer: null, origin: m });
                void pollAgent(m.agentRun);
            }
    });
    function answerPermit(m, allow) {
        if (!m.permit || m.permit.answered)
            return;
        m.permit.answered = true;
        m.permit.allowed = allow;
        record('agent_permit', { run: m.permit.run, tool: m.permit.tool, what: m.permit.what, allow });
        void fetch(`${agentUrl}/permit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: m.permit.run, id: m.permit.id, allow }) }).catch(() => undefined);
        paintChat();
    }
    /** The transcript, kept to its last 60 entries; a message's place in it moves with what was dropped. */
    function setTranscript(conv, next) {
        const drop = Math.max(0, next.length - 60);
        conv.transcript = next.slice(drop);
        if (drop)
            for (const m of conv.thread)
                if (m.transcriptAt !== undefined)
                    m.transcriptAt = Math.max(0, m.transcriptAt - drop);
        if (conv === cur)
            transcript = conv.transcript;
    }
    /** Every host the scene knows now: the contract's and those the game has bound. */
    const knownHosts = () => [...new Set([...(layer?.hosts?.() ?? []).map(h => h.id), ...engine.externalHosts])];
    /** Send a turn; `shown` is how it reads in the thread when it differs (a pick carries its candidate id). */
    async function sendChat(message, fromChip = false, shown, picked, refs, correct, fromCard = false, approve = false, extra = {}) {
        // a message sent while the conversation is folded opens it: you see the reply come in
        if (chatWrap.dataset.min === '1') {
            chatWrap.dataset.min = '0';
            minBtn.textContent = '⌄';
        }
        const text = message.trim();
        // a published scene: nothing is sent until the visitor has their own copy (the gate says how)
        if (!authoring) {
            showChat();
            return;
        }
        // the conversation is closed: a new message starts a new one (open it to continue it); a sound's
        // box continues the conversation that is open, with that sound attached
        if (!fromChip && !fromCard && thread.length && chatWrap.dataset.fold === '1') {
            const c = newConv();
            convs.unshift(c);
            cur = c;
            thread = c.thread;
            transcript = c.transcript;
            lastOp = null;
        }
        const conv = cur;
        if (!text || conv.busy || !documentsReady)
            return;
        // replying to the coding agent (its chip is on the input): the words go to it, not to SATIE
        if (conv.agentReply && !fromChip && !fromCard && !picked && !correct && !approve && !extra.path) {
            const to = conv.agentReply;
            chatInput.value = '';
            chatInput.style.height = '';
            conv.thread.push({ role: 'you', text, toAgent: true });
            conv.lastAt = Date.now();
            paintChat();
            void runAgent(conv, text, { run: to.run, ...(to.session ? { session: to.session } : {}) });
            return;
        }
        // options left without an answer: a new message moved on from them
        for (const m of conv.thread)
            if (m.offer && !m.answered) {
                logOutcome(m.offer, 'abandoned');
                m.answered = true;
            }
        // a pick, a correction or a go continues what its conversation was about
        const scopeParts = (extra.chips ?? (fromChip && conv.scope ? conv.scope : chatScope)).slice();
        if (!fromChip)
            conv.scope = scopeParts;
        const scopeIds = scopeSourceIds(scopeParts);
        if (scopeParts.length && !scopeIds.length) {
            say('Nothing in that plays a sound right now; take it out of "about" to ask about the whole scene.');
            return;
        }
        if (!fromChip && !fromCard) {
            chatInput.value = '';
            chatInput.style.height = '';
        }
        // a new intent; a pick, an answer or a correction continues the one it answers
        if (!fromChip || !conv.turn)
            conv.turn = Math.random().toString(36).slice(2, 10);
        listOpen = false;
        if (chatWrap.dataset.fold === '1')
            chatWrap.dataset.fold = '0'; // the answer shows in the conversation, wherever it was asked
        const th = conv.thread;
        if (!th.length)
            conv.at = Date.now();
        conv.lastAt = Date.now();
        // a conversation is named by what you said (the card it was about is on the message, not in the name)
        if (!conv.title && !picked && !fromChip)
            conv.title = shown ?? text;
        const placeNow = (() => { const w = mixPlace ?? autoPlace; return w && sameParts(scopeParts, w.parts) ? { kind: w.kind, label: w.label } : undefined; })();
        if (!picked && !fromChip) {
            const n = text.match(/^\s*#?(\d+)\b/)?.[1];
            const offered = n ? th.flatMap(m => (m.ui?.kind === 'ask' ? m.ui.options : [])).find(o => o.candidate?.id === `c${n}`) : undefined;
            if (offered?.candidate)
                picked = offered.candidate.id;
        }
        const scope = scopeParts.length ? { sourceIds: scopeIds.slice(0, 64), label: scopeLabel(scopeParts) } : null;
        // what is selected and not already what the question is about: "this", "the selected one"
        const turnRefs = refs ?? selectedParts().filter(q => q.kind !== 'view' && !scopeParts.some(p => p.kind === q.kind && p.id === q.id)).map(q => ({ kind: q.kind, id: q.id, label: q.label }));
        th.push({ role: 'you', text: shown ?? text, ...(shown && shown !== text ? { sent: text } : {}), ...(!fromChip ? { typed: true } : {}), ...(scopeParts.length ? { chips: scopeParts } : {}), ...(scope ? { scope: scope.label } : {}), ...(placeNow ? { place: placeNow } : {}),
            ...(tree.headId ? { checkpoint: tree.headId } : {}), transcriptAt: conv.transcript.length, ...(extra.replaced?.length ? { replaced: extra.replaced } : {}) });
        const pending = { role: 'satie', text: '…', pending: true, status: [] };
        th.push(pending);
        // a card turn keeps its card: the card is waiting for this reply
        conv.busy = true;
        paintChat();
        if (openProps !== null && extra.surface !== 'card')
            buildMixer();
        const t0 = Date.now();
        // what SATIE is doing, in words: reading the scene, then what it understood, then making it
        let phase = picked ? 'putting it in' : approve ? 'making them' : correct ? 'reading it again' : extra.path ? 'going with it' : 'reading the scene';
        const paintPending = () => {
            pending.text = `${phase} · ${Math.round((Date.now() - t0) / 1000)} s`;
            if (conv !== cur)
                return;
            const last = threadEl.lastElementChild?.querySelector('.tx');
            if (last)
                last.textContent = pending.text;
        };
        const tick = setInterval(paintPending, 1000);
        const before = script, version = documentVersion;
        const post = (body) => fetch(chatUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
        const base = { message: text, script: extra.proposal?.script ?? script, ...(scope ? { scope } : {}), ...(turnRefs.length ? { refs: turnRefs } : {}), ...(lastOp && !extra.proposal ? { lastOp } : {}), budgetCents: 25, ...(extra.surface ? { surface: extra.surface } : {}), ...(canTask ? { tasks: true } : {}) };
        try {
            // a fresh message gets the fast first read (an answer, which sound, the ways to do it, or what it understood)
            const fresh = !picked && !correct && !approve && !extra.path;
            let r = await post({ ...base, observation: observationNow(), transcript: conv.transcript, ...(correct ? { correct } : {}), ...(picked ? { picked, pickOnly: fromChip } : {}), ...(approve ? { approve: true } : {}), ...(extra.path ? { path: extra.path } : {}), ...(fresh ? { stage: 'resolve' } : {}) });
            if (!r.ok || !r.ui)
                throw new Error(r.error ?? 'no reply');
            if (r.ui.kind === 'settled') {
                // it knows which sound and what about it: say so, then the director makes it
                pending.status = [r.ui.text];
                phase = 'working on it';
                paintChat();
                paintPending();
                setTranscript(conv, r.transcript ?? conv.transcript);
                r = await post({ ...base, observation: observationNow(), transcript: conv.transcript, stage: 'act', settled: r.ui.settled });
                if (!r.ok || !r.ui)
                    throw new Error(r.error ?? 'no reply');
            }
            setTranscript(conv, r.transcript ?? conv.transcript);
            // a card turn: an edit is a proposal the card plays before it is kept, never applied here (an
            // older server answers `applied` for it: the card still treats it as a proposal)
            if (extra.surface === 'card' && r.ui.kind === 'find') {
                th.splice(th.indexOf(pending), 1, { role: 'satie', text: `${r.ui.text} (the find is open on its card)` });
                record('chat', { message: text, turn: conv.turn ?? null, ui: 'find', surface: 'card', reply: r.ui.text });
                extra.onCard?.({ kind: 'find' });
                return;
            }
            if (extra.surface === 'card' && (r.ui.kind === 'proposal' || r.ui.kind === 'applied' || r.ui.kind === 'quick')) {
                const stale = documentVersion !== version;
                const proposed = r.ui;
                th.splice(th.indexOf(pending), 1, { role: 'satie', text: stale ? 'The scene changed while SATIE worked, so nothing was proposed. Send it again.' : `${proposed.text} (proposed on its card: hear it there, then keep it or put it back)` });
                record('chat', { message: text, turn: conv.turn ?? null, ui: 'proposal', surface: 'card', reply: proposed.text });
                extra.onCard?.(stale ? { kind: 'say', text: 'The scene changed while SATIE worked, so nothing was proposed. Send it again.' }
                    : { kind: 'proposal', text: proposed.text, script: proposed.script, target: 'target' in proposed && Array.isArray(proposed.target) ? proposed.target : (scope?.sourceIds ?? []) });
                return;
            }
            // every change applies at once (an older server may still send a proposal: it is applied the same way)
            const ui = r.ui.kind === 'proposal' ? { ...r.ui, kind: 'applied' } : r.ui;
            const reply = { role: 'satie', text: ui.text, ui, ...(r.spentCents ? { cost: r.spentCents } : {}), ...(pending.status?.length ? { status: pending.status } : {}) };
            if (ui.kind === 'ask') {
                for (const o of ui.options)
                    if (o.candidate)
                        noteOffered(o.candidate);
                reply.offer = logOffer('chat', { turn: conv.turn ?? null, target: ui.target ?? null, message: text }, ui.options.map(o => ({ key: o.candidate?.id ?? o.sound ?? o.label, label: o.label,
                    ...(o.candidate ? { url: o.candidate.url, clip: o.candidate.clip, source: o.candidate.from, ...(o.candidate.describe ? { prompt: o.candidate.describe } : {}) } : { source: 'scene' }) })));
            }
            if (ui.kind === 'paths')
                reply.offer = logOffer('chat', { turn: conv.turn ?? null, message: text, kind: 'paths' }, ui.paths.map(p => ({ key: p.label, label: p.label, source: p.changes })));
            if (ui.kind === 'handoff') {
                reply.text = `This needs a game-world change outside the sound mixer. Ask your coding agent: ${ui.request.needs}. Nothing was changed here.`;
            }
            const stale = documentVersion !== version;
            if ((ui.kind === 'applied' || ui.kind === 'quick') && !stale) {
                if (ui.kind === 'applied' && ui.seed)
                    await seedTake(ui.seed, ui.script);
                if (applyScript(ui.script, `SATIE: "${text.slice(0, 60)}"`, { kind: ui.kind === 'quick' ? 'chat_quick_edit' : 'chat_edit', detail: { message: text, reply: ui.text, scope: scope?.sourceIds ?? null, turn: conv.turn ?? null, ...(ui.kind === 'applied' && ui.reading ? { reading: ui.reading } : {}), ...(ui.kind === 'applied' && ui.seed ? { chose: ui.seed } : {}) } })) {
                    reply.before = before;
                    reply.after = ui.script;
                    reply.changes = describeVoiceChanges(before, ui.script)?.changes ?? [];
                    noteSatieChanges(reply.changes);
                    showChanged(reply.changes);
                    openAdded(reply.changes);
                    {
                        const ids = new Set(reply.changes.map(c => c.voice.sourceId).filter(Boolean));
                        reply.missing = missingTakes(ui.script, st => !ids.size || ids.has(st.sourceId ?? ''));
                    }
                    if (reply.missing)
                        setTimeout(() => { const btn = el('button'); void realizeFor(reply, btn); }, 0);
                }
                lastOp = ui.kind === 'quick' ? ui.op : null;
            }
            else if (ui.kind === 'takes' && !stale) {
                const done = await takesFor(ui.target, ui.candidate, ui.forText, reply);
                if (!done)
                    reply.text = 'I could not put that sound in; the scene is unchanged.';
            }
            else if (stale && (ui.kind === 'applied' || ui.kind === 'quick' || ui.kind === 'takes'))
                reply.text = 'The scene changed while SATIE worked, so nothing was applied. Send it again (↻ on your message).';
            if ((ui.kind === 'applied' || ui.kind === 'quick') && reply.after !== undefined && !reply.changes?.length) {
                reply.text = 'That did not change the scene, so nothing is different yet. Tell me again and I will try another way.';
                reply.after = undefined;
                reply.before = undefined;
            }
            th.splice(th.indexOf(pending), 1, reply);
            // the mix follows the conversation: what the turn is about opens there (or the open mix moves there)
            {
                const changed = (reply.changes ?? []).map(c => c.voice.sourceId).filter((x) => !!x);
                const about = changed.length ? changed : 'target' in ui && Array.isArray(ui.target) ? ui.target : ui.kind === 'ask' && ui.rung === 'sound' ? ui.options.map(o => o.sound).filter((x) => !!x) : [];
                if (about.length)
                    followInMix(about, changed);
                // (2026-11-13) adding something new (nothing in the scene yet to point at): the mix opens at the soundscape it goes in,
                // in add mode, the words in its search box and the parts SATIE named ("as new sounds of airplane engine and rushing air")
                else if (opts.editPanel && (ui.kind === 'confirm' || ui.kind === 'paths' || (ui.kind === 'ask' && ui.options.some(o => !!o.candidate) && !(ui.target?.length))))
                    openScapeForAdd(scopeParts);
                // (2026-11-14) SATIE's offered recordings go on the map too: point to hear, click to choose (the chat's "use this")
                const cands = ui.kind === 'ask' ? ui.options.flatMap(o => (o.candidate ? [{ id: o.candidate.id, name: o.candidate.name, clip: o.candidate.clip, url: o.candidate.url }] : [])) : [];
                setTimeout(() => opts.editPanel?.offer?.(cands.length ? cands : null), 450);
            }
            if (extra.surface === 'card')
                extra.onCard?.({ kind: 'say', text: reply.text, more: ui.kind === 'ask' || ui.kind === 'paths' || ui.kind === 'handoff' });
            if ('reading' in ui && ui.reading)
                record('reading', { turn: conv.turn ?? null, kind: ui.kind, reading: ui.reading });
            record('chat', { message: text, turn: conv.turn ?? null, ...(correct ? { correcting: correct.slot } : {}), ...(approve ? { approved: true } : {}), ...(extra.path ? { path: extra.path.label, changes: extra.path.changes } : {}), ui: ui.kind, reply: ui.text, scope: scope?.sourceIds ?? null, about: scopeParts.length ? scopeParts.map(q => ({ kind: q.kind, id: q.id })) : null, refs: turnRefs.length ? turnRefs : null, spentCents: r.spentCents ?? 0,
                ...(reply.status?.length ? { understood: reply.status } : {}), ...(reply.offer ? { offer: reply.offer } : {}), ...(reply.requestPath ? { request: reply.requestPath } : {}) });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const said = needsSignIn(msg) ? 'Sign in with SATIE to talk to it (the button at the bottom of the panel).' : `SATIE could not answer: ${msg}`;
            th.splice(th.indexOf(pending), 1, { role: 'satie', text: said, ...(pending.status?.length ? { status: pending.status } : {}) });
            if (extra.surface === 'card')
                extra.onCard?.({ kind: 'say', text: said });
        }
        finally {
            clearInterval(tick);
            conv.busy = false;
            conv.lastAt = Date.now();
            paintChat();
            if (openProps !== null && extra.surface !== 'card')
                buildMixer();
            // answered while you were in the mixer: the chat tab says so
            if (chatWrap.dataset.fold === '1')
                chatWrap.dataset.dot = '1';
        }
    }
    /**
     * Go back to a message and run it again (✎ with new words, ↻ as it was): the scene returns to the
     * version it was at when the message was sent, the turns after it fold away (still in history, the
     * scene's version tree keeps them as a branch), and the message is sent again from there.
     */
    function rerun(m, words) {
        const conv = cur;
        if (conv.busy)
            return;
        const k = conv.thread.indexOf(m);
        if (k < 0)
            return;
        if (m.checkpoint && nodeById(m.checkpoint) && m.checkpoint !== tree.headId)
            moveHead(m.checkpoint);
        const replaced = conv.thread.slice(k);
        conv.thread.splice(k);
        setTranscript(conv, conv.transcript.slice(0, m.transcriptAt ?? conv.transcript.length));
        record('chat_rerun', { turn: conv.turn ?? null, from: m.text, to: words, edited: words.trim() !== m.text.trim(), replaced: replaced.length, version: m.checkpoint ?? null });
        void sendChat(words, false, undefined, undefined, undefined, undefined, true, false, { ...(m.chips ? { chips: m.chips } : { chips: [] }), replaced });
    }
    chatSend.addEventListener('click', () => sendTyped());
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTyped();
    } });
    chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = `${Math.min(Math.round(innerHeight * 0.35), chatInput.scrollHeight + 2)}px`; });
    paintChat();
    chatReady = true;
    // without the world layer nothing is known to be on screen, so "in view" would only list what you touched
    let scope = layer?.visibleIndices ? 'here' : 'all';
    let typeFilter = 'all';
    let query = '';
    let drawerPrompt = false;
    let drawerQuery = null;
    function tagsOf(st) {
        const t = new Set(['all']);
        const mine = !!st.hostRef && st.hostRef === layer?.listenerHost?.();
        if (st.bed || st.field)
            t.add('around');
        else if (mine)
            t.add('yours');
        else {
            if (st.kind === 'trigger')
                t.add('events');
            else
                t.add('places');
            if (st.hostRef && layer?.hostMotion?.(st.hostRef) === 'moves')
                t.add('moving');
        }
        return t;
    }
    function buildTools() {
        if (view !== 'mixer') {
            tools.hidden = true;
            hearing.hidden = true;
            return;
        }
        tools.hidden = false;
        askFoot.hidden = false;
        const seg = el('span', 'seg');
        for (const [k, label, title] of [['here', 'in view', 'each thing on your screen (car 3, the café), then its sounds (what you can hear is in "hearing now" above)'], ['all', 'all sounds', 'every sound, by kind of thing (cars, then their sounds, then each car)']]) {
            const b = el('button', undefined, label);
            b.title = title;
            b.dataset.on = scope === k ? '1' : '0';
            b.addEventListener('click', () => { if (scope !== k) {
                scope = k;
                heldOrder = [];
                groupOrder = [];
                buildMixer();
            } });
            seg.appendChild(b);
        }
        seg.hidden = !layer?.visibleIndices; // with no world layer the list is every sound
        const search = el('input');
        search.type = 'search';
        search.className = 'search';
        search.placeholder = 'find a sound…';
        search.value = query;
        search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); refreshList(true); });
        search.addEventListener('keydown', e => {
            if (e.key !== 'Enter')
                return;
            const first = [...rows].find(([, r]) => !r.item.hidden)?.[0];
            if (first !== undefined) {
                selectVoice(first, true);
                focusVoices([first]);
            }
        });
        // the scene's own groups (trains, traffic...), only when it has some: kinds of sound were a second
        // filter beside search and "in view / all sounds", and the menu crushed to "s▾" in a full row
        const groupsNow = mixGroupsNow();
        typeFilter = 'all';
        if (!groupsNow.some(g => `mix:${g.id}` === groupFilter))
            groupFilter = null;
        // (groups are a box in the list now, and the chosen one a strip with "back": the menu hid the way out)
        const clear = el('button', 'clear', '');
        paintMuteAll(clear);
        clear.addEventListener('click', () => {
            const any = engine.mutedIndices.size > 0 || engine.soloedIndices.size > 0;
            if (any) {
                setMuted(engine.scriptStatements.map((_, i) => i), false);
                engine.setSoloIndices([]);
                commitMix();
            }
            else {
                setMuted(engine.scriptStatements.map((_, i) => i), true);
                commitMix();
            }
            record('mute_all', { muted: !any });
            syncMixer();
            paintMuteAll(clear);
            refreshList(true);
        });
        const binChip = el('button', 'binchip', `bin · ${bin.length}`);
        binChip.hidden = !bin.length;
        binChip.title = 'deleted sounds: restore any of them';
        binChip.addEventListener('click', () => { if (scope !== 'all') {
            scope = 'all';
            buildMixer();
        } body.querySelector('.satie-dt-bin')?.scrollIntoView({ block: 'center' }); });
        const add = el('button', 'addbtn', '+');
        add.title = 'add a sound: what it is, where it goes, how it moves; you hear options before it goes in';
        add.setAttribute('aria-label', 'add a sound here');
        add.addEventListener('click', startAdd);
        void binChip; // history holds deleted sounds; the chip pushed "+" off the toolbar
        tools.replaceChildren(seg, search, clear, add);
        if (!hearing.isConnected)
            tools.after(hearing);
        askFoot.hidden = false; // the conversation sits under the mixer (2026-11-12)
    }
    function paintMuteAll(b) {
        const any = engine.mutedIndices.size > 0 || engine.soloedIndices.size > 0;
        // (2026-11-13) short, so the row stays one row: "unmute all" pushed + onto a second one
        b.textContent = any ? 'unmute' : 'mute all';
        b.title = any ? 'clear every mute and solo' : 'silence every sound (then unmute the ones you want to hear)';
        b.dataset.on = any ? '1' : '0';
    }
    let hereHover = false;
    let listMovedAt = -Infinity, listPressed = false;
    const AIM_MS = 1000;
    body.addEventListener('pointermove', () => { listMovedAt = performance.now(); });
    body.addEventListener('pointerdown', () => { listPressed = true; listMovedAt = performance.now(); });
    const onListRelease = () => { listPressed = false; };
    addEventListener('pointerup', onListRelease);
    body.addEventListener('pointerenter', () => { hereHover = true; });
    body.addEventListener('pointerleave', () => { hereHover = false; });
    /** Which rows show, and in 'near you' their order: audible loudest first, then what is on screen. */
    // ── hearing now: one line of what reaches your ears, loudest first; each dot glows with its level ──
    const hearing = el('div', 'satie-dt-hearing');
    /** One-off sounds that fired: when, and the strongest level they reached you at while playing. */
    const shots = new Map();
    const SHOT_MS = 6000;
    /**
     * What you can hear where you stand, per sound (core/Audibility.ts): its level against its masked
     * threshold in each critical band, so pitch counts, not only level. One pass per 200 ms, shared.
     */
    let heardAt = -1, heardNow = new Map();
    /** How long after a fire or start the world's ripple waits to ask whether you hear it. */
    const RIPPLE_HEARD_AFTER_MS = 250;
    function hearNow() {
        const t = performance.now();
        if (t - heardAt < 200)
            return heardNow;
        heardAt = t;
        const sources = [], owner = [];
        for (const v of engine.levelReport().voices) {
            if (!v.audible || !Number.isFinite(v.receivedDb))
                continue;
            const sig = engine.trackSignal(v.key);
            if (!sig?.buffer)
                continue;
            sources.push({ id: sources.length, receivedDb: v.receivedDb, spectrum: bandSpectrum(sig.buffer), cutoffHz: sig.cutoffHz });
            owner.push(v.statementIndex);
        }
        const out = new Map();
        audibility(sources).forEach((a, id) => {
            const i = owner[id], was = out.get(i);
            const masker = a.maskerId === null ? null : owner[a.maskerId];
            // a counted voice is heard if any of its copies is
            if (!was || a.marginDb > was.marginDb)
                out.set(i, { ...a, maskerId: masker, receivedDb: Math.max(sources[id].receivedDb, was?.receivedDb ?? -Infinity), sones: a.sones + (was?.sones ?? 0) });
        });
        heardNow = out;
        return out;
    }
    const heardIt = (i) => (hearNow().get(i)?.marginDb ?? -Infinity) >= 0;
    let hearingAt = 0;
    function syncHearing() {
        if (view !== 'mixer') {
            hearing.hidden = true;
            hearingTip.hidden = true;
            return;
        }
        hearing.hidden = false;
        const t = performance.now();
        if (t - hearingAt < 300)
            return;
        hearingAt = t;
        const stmts = engine.scriptStatements;
        const seen = new Set();
        const report = engine.levelReport();
        const now = performance.now();
        // a one-off keeps its place for 6 s after it fires, at the strength it reached you with
        for (const v of report.voices) {
            const sh = shots.get(v.statementIndex);
            if (sh && v.audible && Number.isFinite(v.receivedDb) && !(v.receivedDb <= sh.db))
                sh.db = v.receivedDb;
            const a = sh ? hearNow().get(v.statementIndex) : undefined;
            if (sh && a && a.marginDb > sh.margin)
                sh.margin = a.marginDb;
        }
        for (const [i, sh] of shots)
            if (now - sh.at > SHOT_MS)
                shots.delete(i);
        const ownStep = (i) => personalStepLead(stmts, i, st => {
            const me = layer?.listenerHost?.();
            if (st.attachRef === 'listener' || (!!me && st.hostRef === me))
                return true;
            if (st.hostRef || st.attachRef)
                return false;
            const by = st.eventName ? layer?.eventInfo?.(st.eventName)?.by : undefined;
            return by ? !!me && by === me : st.eventName === 'step' && !st.hasPlacement;
        });
        const items = [];
        for (const v of report.voices) {
            if (seen.has(v.statementIndex) || !Number.isFinite(v.receivedDb))
                continue;
            const st = stmts[v.statementIndex];
            if (st?.kind === 'trigger')
                continue; // one-offs come from `shots`
            if (v.audible && heardIt(v.statementIndex)) {
                seen.add(v.statementIndex);
                items.push({ statementIndex: v.statementIndex, receivedDb: v.receivedDb });
            }
        }
        // a one-off earns a place only if it came through the mix while it played
        for (const [i, sh] of shots)
            if (Number.isFinite(sh.db) && sh.margin >= 0)
                items.push({ statementIndex: i, receivedDb: sh.db, shot: now - sh.at });
        // only what you can actually hear (a covered sound stays in the list, not here)
        // one chip per sound: its copies heard at once are one chip ("×k"), at the loudest copy's level
        const live = [];
        hearingCopies = new Map();
        for (const v of items.sort((a, b) => b.receivedDb - a.receivedDb)) {
            const lead = ownStep(v.statementIndex) ?? leadOf(v.statementIndex), at = hearingCopies.get(lead);
            if (at) {
                if (!at.includes(v.statementIndex))
                    at.push(v.statementIndex);
                const item = live.find(item => item.statementIndex === lead);
                if (v.shot !== undefined)
                    item.shot = Math.min(item.shot ?? Infinity, v.shot);
                continue;
            }
            hearingCopies.set(lead, [v.statementIndex]);
            live.push({ ...v, statementIndex: lead });
        }
        const top = live[0]?.receivedDb ?? 0;
        // folded, the strip shows what fits in two rows (measured below, not counted); the rest is "+N"
        const MAX = hearingExpanded ? Infinity : HEARING_CANDIDATES;
        // each chip keeps its slot while it is heard and for HEARING_HOLD_MS after; a new sound takes a free
        // slot (loudest first) instead of reshuffling the row, so the strip reads as steady, not as a ticker
        const byIdx = new Map(live.map(v => [v.statementIndex, v]));
        for (const v of live)
            hearingLast.set(v.statementIndex, now);
        hearingSlots = hearingSlots.filter(i => byIdx.has(i) || now - (hearingLast.get(i) ?? 0) < HEARING_HOLD_MS);
        if (!hearingExpanded)
            hearingSlots = hearingSlots.slice(0, MAX);
        for (const v of live) {
            if (hearingSlots.length >= MAX)
                break;
            if (!hearingSlots.includes(v.statementIndex))
                hearingSlots.push(v.statementIndex);
        }
        const shown = hearingSlots.map(i => byIdx.get(i) ?? { statementIndex: i, receivedDb: hearingDb.get(i) ?? 20 });
        for (const v of shown)
            hearingDb.set(v.statementIndex, v.receivedDb);
        const keep = new Map();
        const chips = shown.map(v => {
            const st = stmts[v.statementIndex];
            // the same sound keeps its chip (and its draining line) across syncs: nothing flickers
            let c = hearingChips.get(v.statementIndex);
            if (!c || (v.shot !== undefined) !== (c.dataset.shot === '1')) {
                c = el('button', 'chip');
                const i = v.statementIndex;
                c.append(el('i'), el('span'));
                if (v.shot !== undefined) {
                    // it happened: a line under it runs down over 6 s, then it leaves
                    c.dataset.shot = '1';
                    c.appendChild(el('b'));
                }
                c.addEventListener('click', () => {
                    const copies = hearingCopies.get(i) ?? [i];
                    // (2026-11-13) the mix open: it goes to that sound, in the middle
                    const sid = engine.scriptStatements[copies[0] ?? i]?.sourceId;
                    if (editOpen && sid && opts.editPanel?.go)
                        opts.editPanel.go({ sound: sid });
                    if (copies.length < 2) {
                        const source = copies[0] ?? i;
                        selectVoice(source, true);
                        focusVoices([source]);
                        return;
                    }
                    multiSel.clear();
                    selIdx = null;
                    selGroupKey = null;
                    for (const k of copies)
                        multiSel.add(k);
                    applySelection();
                    focusVoices(copies);
                });
                const showTip = () => {
                    hearingTip.textContent = c.dataset.detail ?? '';
                    hearingTip.hidden = false;
                    const r = c.getBoundingClientRect();
                    hearingTip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 336))}px`;
                    hearingTip.style.top = `${Math.max(8, Math.min(r.bottom + 6, innerHeight - hearingTip.offsetHeight - 8))}px`;
                };
                c.addEventListener('pointerenter', showTip);
                c.addEventListener('focus', showTip);
                c.addEventListener('pointerleave', () => { hearingTip.hidden = true; });
                c.addEventListener('blur', () => { hearingTip.hidden = true; });
            }
            if (v.shot !== undefined)
                syncHearingShot(c.querySelector('b'), v.shot, SHOT_MS);
            c.style.setProperty('--c', voiceColor(v.statementIndex));
            c.dataset.col = voiceColor(v.statementIndex);
            c.style.maxWidth = '100%';
            c.style.setProperty('--lv', String(Math.max(0.15, Math.min(1, (v.receivedDb - 10) / 50))));
            // the dot as it always was; one that is especially loud right now pulses, slightly (2026-11-13)
            c.dataset.loud = v.receivedDb >= 62 || (v.receivedDb >= top - 3 && v.receivedDb >= 52 && live.length > 1) ? '1' : '0';
            const heard = hearingCopies.get(v.statementIndex)?.length ?? 1;
            const name = ownStep(v.statementIndex) !== null ? 'footsteps' : (st ? nameOf(st) : '?') + (heard > 1 ? ` ×${heard}` : '');
            const label = c.querySelector('span');
            if (label.textContent !== name)
                label.textContent = name;
            const where = st && isAround(st) ? 'All around you' : st?.attachRef === 'listener' || st?.hostRef && st.hostRef === layer?.listenerHost?.() ? 'Carried by you' : st?.hostRef ? `On ${hostName(st.hostRef)}` : 'In the scene';
            c.dataset.detail = `${name}\n${where}\nloudness ${fmtLoud(v.receivedDb)} here\nClick to select`;
            c.setAttribute('aria-label', c.dataset.detail);
            keep.set(v.statementIndex, c);
            return c;
        });
        hearingChips = keep;
        const packed = chips.length ? chips : [hearingNone];
        if (packed.length !== hearingChipWrap.children.length || packed.some((n, k) => hearingChipWrap.children[k] !== n))
            hearingChipWrap.replaceChildren(...packed);
        if (hearing.children[0] !== hearingLbl || hearing.children[1] !== hearingChipWrap)
            hearing.replaceChildren(hearingLbl, hearingChipWrap);
        // folded: every chip that would start a third row waits behind "+N"; open, all of them show
        const folded = hearingExpanded ? new Set() : chipsPastTwoRows(chips);
        if (hearingExpanded)
            for (const c of chips)
                c.hidden = false;
        const unseen = [...live.filter(v => !hearingSlots.includes(v.statementIndex)), ...shown.filter((_, k) => folded.has(chips[k]))];
        if (!hearingMore) {
            hearingMore = el('button', 'more');
            hearingMore.addEventListener('click', () => {
                // opening grows the strip from where it is, never shorter; folding returns it to two rows
                hearing.style.minHeight = hearingExpanded ? '' : `${hearing.offsetHeight}px`;
                hearingExpanded = !hearingExpanded;
                hearing.dataset.expanded = hearingExpanded ? '1' : '0';
                hearingMore.setAttribute('aria-expanded', String(hearingExpanded));
                hearingAt = 0;
                hearingTip.hidden = true;
                syncHearing();
            });
        }
        hearingMore.textContent = hearingExpanded ? 'show less' : `+${unseen.length}`;
        hearingMore.title = unseen.map(v => stmts[v.statementIndex] ? nameOf(stmts[v.statementIndex]) : '').join(', ');
        if (unseen.length > 0 || hearingExpanded) {
            if (hearingMore.parentElement !== hearing)
                hearing.appendChild(hearingMore);
        }
        else
            hearingMore.remove();
    }
    /** The chips (in order) that would start a third row: each is measured after the ones before it settle. */
    function chipsPastTwoRows(chips) {
        const out = new Set();
        for (const c of chips)
            c.hidden = false;
        const first = chips[0]?.offsetTop ?? 0;
        let second = null;
        for (const c of chips) {
            const top = c.offsetTop;
            if (top <= first + 2)
                continue;
            if (second === null) {
                second = top;
                continue;
            }
            if (top <= second + 2)
                continue;
            c.hidden = true;
            out.add(c);
        }
        return out;
    }
    /** How many heard sounds the folded strip lays out before measuring which fit in its two rows. */
    const HEARING_CANDIDATES = 12;
    let hearingChips = new Map();
    /** The copies heard right now, by the sound (`leadOf`) whose chip stands for them. */
    let hearingCopies = new Map();
    let hearingSlots = [];
    const hearingLast = new Map(), hearingDb = new Map();
    const HEARING_HOLD_MS = 3000;
    let hearingMore = null;
    let hearingExpanded = false;
    let youOpen = false;
    const hearingTip = el('div', 'satie-dt-hearing-tip');
    hearingTip.hidden = true;
    hearingTip.setAttribute('role', 'tooltip');
    root.appendChild(hearingTip);
    const hearingLbl = el('span', 'lbl', 'hearing'), hearingNone = el('span', 'none', 'nothing reaches you here');
    const hearingChipWrap = el('div', 'chips');
    // the list's units: one per thing (a row, or a header with its sounds), and the background box
    let units = [];
    let heldOrder = [];
    /** Repeated sounds opened to their copies, and the folded rows drawn now (their status is synced). */
    const kindOpen = new Set();
    let kindRows = [];
    /** The units shown at the last refresh, by key: a rebuild under the pointer shows the same ones. */
    let shownKeys = new Set(), foldedKeys = new Set(), shownScope = null;
    /** In view: the nearest NEAR_SHOWN things in full, the rest behind "+N farther in view". */
    const NEAR_SHOWN = 12;
    let farOpen = false;
    const farHead = el('button', 'satie-dt-farhead');
    farHead.addEventListener('click', () => { farOpen = !farOpen; refreshList(true); });
    /**
     * Pointing at a group (or a repeated sound) shows where its sounds are: after a short pause the world
     * dims everything else and tags them, as a selection would; leaving puts your own selection back.
     */
    let hoverSelTimer, hoverSelOn = false;
    function hoverGroup(indices, label, detail) {
        clearTimeout(hoverSelTimer);
        if (!indices) {
            if (hoverSelOn) {
                hoverSelOn = false;
                applySelection();
            }
            return;
        }
        hoverSelTimer = setTimeout(() => { hoverSelOn = true; layer?.setSelection({ indices, ...(label ? { label } : {}), ...(detail ? { detail } : {}) }); }, 180);
    }
    /** The groups' order as last drawn: a redraw keeps it (scope or view changes reset it). */
    let groupOrder = [];
    /** When each unit was last wanted in view: it stays UNIT_DWELL_MS after it leaves. */
    const unitSeen = new Map();
    const UNIT_DWELL_MS = 5000;
    let sortedAt = 0;
    const RESORT_MS = 1500;
    let bedsOpen = false;
    /** The top row's open tab: background, you, or groups (one at a time). */
    let shelfOpen = null;
    let youHead = null;
    let bedHead = null, bedBox = null;
    /** The groups box (yours, then the game's), under the background box; open or closed. */
    let groupsBox = null;
    // in view, a thing with several sounds is closed until you open it (or pick it in the world)
    const hereOpen = new Set();
    const isAround = (st) => !!st && (st.bed || st.field);
    /** Yours: carried by you, on the thing you play as, or an event you perform on no thing (the scene's `by`). */
    const isYours = (st) => {
        const me = layer?.listenerHost?.() ?? null;
        if (!st || isAround(st))
            return false;
        if (st.attachRef === 'listener' || (!!me && st.hostRef === me))
            return true;
        const ev = st.eventName ? layer?.eventInfo?.(st.eventName) : undefined;
        return !!me && !st.hostRef && !!ev && ev.by === me && (!ev.with || (knownKinds.has(ev.with) && scope === 'here' && !groupFilter));
    };
    /** The kinds of thing in the scene (car, palm), as the list last grouped them. */
    let knownKinds = new Set();
    // where each source is from you; an event sound keeps where it last fired
    const lastDistance = new Map();
    function liveDistance(i) {
        let d = Infinity;
        for (const v of engine.getTrackViews())
            if (v.statementIndex === i && Number.isFinite(v.surfaceDistanceM))
                d = Math.min(d, v.surfaceDistanceM);
        return d;
    }
    /** How far the nearest of these sounds is: live while it plays, else where it last was. */
    function distanceOf(members) {
        return Math.min(...members.map(m => { const d = liveDistance(m); return Number.isFinite(d) ? d : lastDistance.get(m) ?? Infinity; }));
    }
    /**
     * true / 'user': your own filter action (search, type, scope, mute all) applies at once.
     * 'rebuild' (after an edit) or a tick: while you aim at the list (the pointer moving over it), the list keeps
     * exactly its previous rows and order, so nothing moves, joins or leaves under the cursor.
     */
    /** "not in view" on every row, from what is on screen now (all sounds re-reads it every tick too, not only on a refresh). */
    function paintOffview(onScreen = new Set(layer?.visibleIndices?.() ?? [])) {
        const stmts = engine.scriptStatements, lh = layer?.listenerHost?.();
        for (const [i, r] of rows) {
            const off = !onScreen.has(i) && !!stmts[i]?.hostRef && !isAround(stmts[i]) && stmts[i]?.hostRef !== lh ? '1' : '0';
            if (r.row.dataset.offview !== off)
                r.row.dataset.offview = off;
        }
    }
    function refreshList(mode = false) {
        if (view !== 'mixer')
            return;
        const user = mode === true || mode === 'user';
        // a rebuild (opening a thing, an edit) draws fresh rows: under the pointer it shows the units shown before,
        // in their order, rather than every unit (the list grew and the opened thing moved away)
        // switching views, or going into or out of a group, is your own change: it applies at once
        const rebuilt = mode === 'rebuild' && shownScope === `${scope}|${groupFilter ?? ''}`;
        // the list holds still only while you aim at it: the pointer moving over the list (or pressed on it)
        // in the last AIM_MS. Resting there while you steer, or anywhere else on the panel, it stays live.
        const pointing = body.matches(':hover') && (listPressed || performance.now() - listMovedAt < AIM_MS);
        // under the pointer the list holds its ORDER still; what it shows always follows the filters
        const freeze = !user && pointing;
        const stmts = engine.scriptStatements;
        for (const v of engine.getTrackViews())
            if (Number.isFinite(v.surfaceDistanceM))
                lastDistance.set(v.statementIndex, Math.min(v.surfaceDistanceM, liveDistance(v.statementIndex)));
        const onScreen = new Set(layer?.visibleIndices?.() ?? []);
        const textOk = (i) => {
            if (!query)
                return true;
            const st = stmts[i];
            if (!st)
                return false;
            return [st.hostRef ?? '', st.hostRef ? hostName(st.hostRef) : '', labelOf(st).what, st.eventName ?? '', st.sourceId ?? ''].join(' ').toLowerCase().replace(/_/g, ' ').includes(query.replace(/_/g, ' '));
        };
        const typeOk = (i) => typeFilter === 'all' || (!!stmts[i] && tagsOf(stmts[i]).has(typeFilter));
        const inGroup = groupFilter ? new Set(mixGroupsNow().find(g => `mix:${g.id}` === groupFilter)?.sourceIds ?? []) : null;
        const groupOk = (i) => !inGroup || (!!stmts[i]?.sourceId && inGroup.has(stmts[i].sourceId));
        // in view: what is on your screen, plus what you are working on
        const near = (i) => stmts[i]?.attachRef === 'listener' || (!!layer?.listenerHost?.() && stmts[i]?.hostRef === layer.listenerHost()) || onScreen.has(i) || isSelected(i) || isMuted(i) || engine.soloedIndices.has(i) || openDrawer === i || openProps === i;
        const matches = (i) => typeOk(i) && textOk(i) && groupOk(i);
        const shown = (i) => matches(i) && (scope === 'all' || !!query || !!groupFilter || near(i));
        // a unit shows when any of its sounds does; its open rows follow the filter, not the view
        const wanted = units.filter(u => u.members.some(shown));
        // the list does not change under you: while the pointer is over it nothing appears or leaves (your
        // own filter or view change still applies at once), and a moving thing that came into view stays a
        // few seconds after it leaves (passing cars and walkers made rows come and go under the cursor)
        const now = performance.now();
        for (const u of wanted)
            unitSeen.set(u.key, now);
        // only a brief sound lingers (2026-10-18): one that is on screen only while it fires (a step, a horn on no
        // thing) stays UNIT_DWELL_MS; anything with a place of its own (a palm, a car, parked or driving) follows the view live
        const moves = (u) => u.members.every(i => engine.scriptStatements[i]?.kind === 'trigger');
        const visible = user ? wanted
            : freeze ? units.filter(u => (rebuilt ? shownKeys.has(u.key) || foldedKeys.has(u.key) : !u.el.hidden) && (wanted.includes(u) || u.members.some(matches)))
                : units.filter(u => wanted.includes(u) || (moves(u) && now - (unitSeen.get(u.key) ?? -Infinity) < UNIT_DWELL_MS && u.members.some(matches)));
        for (const u of units) {
            const hide = !visible.includes(u);
            if (u.el.hidden !== hide)
                u.el.hidden = hide;
        }
        // looking through a group in view: its things off your screen stay listed, greyed out (all sounds: all live)
        for (const u of units) {
            const off = scope === 'here' && !!groupFilter && !u.members.some(near) ? '1' : '0';
            if (u.el.dataset.off !== off)
                u.el.dataset.off = off;
        }
        for (const [i, r] of rows)
            r.item.hidden = !matches(i);
        paintOffview(onScreen);
        if (bedBox)
            bedBox.hidden = !!groupFilter; // the top row steps aside while you look through a group
        if (scope === 'here') {
            const host = units[0]?.el.parentElement ?? bedBox?.parentElement;
            if (host) {
                // A stable order: a thing keeps its place while it stays in view (a train's wheels firing in turn must
                // not swap rows); a new one is slotted in by section and distance; your own change (view, filter) re-sorts.
                // how near a thing is, by its sounds on screen (an entry for several palms: the nearest one you see)
                const near1 = (u) => { const m = u.members.filter(near); return distanceOf(m.length ? m : u.members); };
                // looking through a group, its things off your screen (greyed) come after the ones on it, never between them
                const offOf = (u) => (groupFilter && !u.members.some(near) ? 1 : 0);
                const byDist = (a, b) => offOf(a) - offOf(b) || a.section - b.section || near1(a) - near1(b);
                let order;
                // nearest first: re-sorted every RESORT_MS while the pointer is elsewhere (walking on reorders it),
                // held while you point at the list
                if (user || !heldOrder.length || (!freeze && now - sortedAt > RESORT_MS)) {
                    order = [...visible].sort(byDist);
                    sortedAt = now;
                }
                else {
                    const vis = new Map(visible.map(u => [u.key, u]));
                    order = heldOrder.map(k => vis.get(k)).filter((u) => !!u);
                    for (const u of visible.filter(u => !heldOrder.includes(u.key)).sort(byDist)) {
                        const at = order.findIndex(o => byDist(u, o) < 0);
                        order.splice(at < 0 ? order.length : at, 0, u);
                    }
                }
                heldOrder = order.map(u => u.key);
                // move nodes only when the order changed: re-inserting a node restarts its animation
                // (2026-11-13) what you picked (a chip in "hearing", a tag in the world) comes first, under your own things, even
                // off your screen (it sorted by distance and landed at the very bottom); the sounds grouped with it (the
                // crossing's other bell) come with it
                const picked = new Set();
                stmts.forEach((_, i) => { if (isSelected(i))
                    picked.add(i); });
                if (picked.size) {
                    const ids = new Set([...picked].map(i => stmts[i]?.sourceId).filter((x) => !!x));
                    for (const gr of mixGroupsNow())
                        if (gr.sourceIds.some(id => ids.has(id)))
                            for (const id of gr.sourceIds) {
                                const k = stmts.findIndex(x => x.sourceId === id);
                                if (k >= 0)
                                    picked.add(k);
                            }
                }
                const pin = (u) => (u.members.some(i => picked.has(i)) ? 1 : 0);
                order.sort((a, b) => (a.section === -1 ? -1 : 0) - (b.section === -1 ? -1 : 0) || pin(b) - pin(a));
                // the nearest NEAR_SHOWN things in full, the rest behind one "+N farther in view" row: folded, never
                // left out (what you selected, muted or soloed stays out of the fold, as a thing picked in the world)
                const held = (u) => u.members.some(i => isSelected(i) || isMuted(i) || engine.soloedIndices.has(i));
                const nearPart = order.slice(0, NEAR_SHOWN), farPart = order.slice(NEAR_SHOWN);
                const farShown = farOpen ? farPart : farPart.filter(held);
                const settle = !freeze || rebuilt;
                if (settle) {
                    for (const u of farPart) {
                        const hide = !farShown.includes(u);
                        if (u.el.hidden !== hide)
                            u.el.hidden = hide;
                    }
                    foldedKeys = new Set(farPart.filter(u => !farShown.includes(u)).map(u => u.key));
                }
                // how many more are on screen NOW (the rows hold still under the pointer; the count does not, so
                // opening it shows that many, not a stale few)
                const onNow = wanted.length, folded = Math.max(0, onNow - NEAR_SHOWN - farPart.filter(u => farShown.includes(u) && !farOpen).length);
                const fold = (farPart.length || folded) && (farOpen || folded > 0) ? [farHead] : [];
                if (settle || folded > 0) {
                    farHead.replaceChildren(document.createTextNode(farOpen ? `show only the nearest ${NEAR_SHOWN}` : `${folded} more, farther away`), el('i', undefined, farOpen ? '▲' : '▼'));
                    farHead.title = farOpen ? 'fold the farther things away again' : 'everything else on your screen, nearest first';
                }
                const want = [...(bedBox && !bedBox.hidden ? [bedBox] : []), ...(groupsBox ? [groupsBox] : []), ...nearPart.map(u => u.el), ...(farOpen ? [...farShown.map(u => u.el), ...fold] : [...fold, ...farShown.map(u => u.el)])];
                const have = [...host.children].filter(c => !c.hidden && !c.classList.contains('satie-dt-empty'));
                if (settle && (want.length !== have.length || want.some((n, k) => n !== have[k]))) {
                    if (bedBox && host.firstElementChild !== bedBox)
                        host.prepend(bedBox);
                    for (const n of want)
                        if (n !== bedBox)
                            host.appendChild(n);
                }
                if (settle && !fold.length)
                    farHead.remove();
                let empty = host.querySelector('.satie-dt-empty');
                if (!order.length) {
                    if (!empty)
                        empty = el('div', 'satie-dt-empty');
                    host.appendChild(empty); // after the background
                    empty.textContent = query ? 'no sound matches' : bedBox && !bedBox.hidden ? 'nothing else in view; look around, or use "all sounds"' : 'no sound source in view; look around, or use "all sounds"';
                }
                else
                    empty?.remove();
            }
        }
        shownKeys = new Set(units.filter(u => !u.el.hidden).map(u => u.key));
        shownScope = `${scope}|${groupFilter ?? ''}`;
        const clear = tools.querySelector('.clear');
        if (clear)
            paintMuteAll(clear);
    }
    // ── playing now: what you can hear from where you stand, loudest first, live ──
    const nowBox = el('div', 'satie-dt-now');
    let nowOpen = true, nowAt = 0;
    // a sound you muted or soloed away still reaches you in the world: keep it listed, marked
    const nowHeld = new Map(); // statementIndex -> last level heard
    // Rows update in place (a rebuilt row swallows a click), and keep their order while the pointer is over the list.
    const nowHead = el('div', 'hd');
    const nowList = el('div', 'ls');
    nowBox.append(nowHead, nowList);
    let nowHovering = false;
    nowList.addEventListener('pointerenter', () => { nowHovering = true; });
    nowList.addEventListener('pointerleave', () => { nowHovering = false; });
    nowHead.addEventListener('click', () => { nowOpen = !nowOpen; syncNow(true); });
    const nowItems = new Map();
    function nowItem(i) {
        let it = nowItems.get(i);
        if (it)
            return it;
        const r = el('div', 'it');
        r.style.setProperty('--c', voiceColor(i));
        const n = el('span', 'n');
        const meter = el('span', 'mt');
        const fill = el('i');
        meter.appendChild(fill);
        const db = el('span', 'db mono');
        const mute = el('button', undefined, 'M');
        mute.title = 'mute: silence this sound';
        const solo = el('button', undefined, 'S');
        solo.title = 'solo: hear only the soloed sounds';
        mute.addEventListener('click', e => { e.stopPropagation(); const row = rows.get(i); if (row)
            row.mute.click();
        else {
            setMuted([i], !isMuted(i));
            commitMix();
        } syncNow(true); });
        solo.addEventListener('click', e => { e.stopPropagation(); const row = rows.get(i); if (row)
            row.solo.click();
        else {
            const next = new Set(engine.soloedIndices);
            if (!next.delete(i))
                next.add(i);
            engine.setSoloIndices([...next]);
        } syncNow(true); });
        const ms = el('span', 'ms');
        ms.append(mute, solo);
        r.append(el('span', 'sw'), n, meter, db, ms);
        r.addEventListener('click', () => { if (selIdx !== i)
            selectVoice(i, true); focusVoices([i]); rows.get(i)?.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
        r.addEventListener('dblclick', () => { const st = engine.scriptStatements[i]; if (st && !isAround(st))
            layer?.goTo?.([i]); });
        r.addEventListener('pointerenter', () => setHover(i, true));
        r.addEventListener('pointerleave', () => setHover(null, true));
        it = { r, fill, db, n, mute, solo };
        nowItems.set(i, it);
        return it;
    }
    function syncNow(force = false) {
        const t = performance.now();
        if (!force && t - nowAt < 250)
            return;
        nowAt = t;
        const report = engine.levelReport();
        const stmts = engine.scriptStatements;
        const seen = new Set();
        const heldOut = (i) => isMuted(i) || (engine.soloedIndices.size > 0 && !engine.soloedIndices.has(i));
        const live = report.voices.filter(v => {
            if (seen.has(v.statementIndex) || !Number.isFinite(v.receivedDb))
                return false;
            const i = v.statementIndex;
            if (v.audible) {
                nowHeld.set(i, v.receivedDb);
                seen.add(i);
                return true;
            }
            if (heldOut(i) && nowHeld.has(i) && v.receivedDb > -200) {
                seen.add(i);
                return true;
            }
            if (!heldOut(i))
                nowHeld.delete(i);
            return false;
        }).sort((a, b) => (nowHeld.get(b.statementIndex) ?? b.receivedDb) - (nowHeld.get(a.statementIndex) ?? a.receivedDb));
        // "faint": reaching you, but well under the loudest thing here, so it is likely masked
        const top = live.length ? (nowHeld.get(live[0].statementIndex) ?? live[0].receivedDb) : -Infinity;
        nowHead.replaceChildren(el('span', 'tri', nowOpen ? '▾' : '▸'), el('span', 'lbl', 'playing now'), el('small', undefined, live.length ? `${live.length} sound${live.length === 1 ? '' : 's'} reaching you, loudest first` : 'nothing audible here'));
        if (engine.soloedIndices.size)
            nowHead.appendChild(el('span', 'solo', `solo on · ${engine.soloedIndices.size}`));
        if (engine.mutedIndices.size || engine.soloedIndices.size) {
            const reset = el('button', 'reset', 'unmute all');
            reset.title = 'clear every mute and solo';
            reset.addEventListener('click', e => { e.stopPropagation(); setMuted(engine.scriptStatements.map((_, j) => j), false); engine.setSoloIndices([]); commitMix(); record('mute_reset', {}); syncMixer(); syncNow(true); });
            nowHead.appendChild(reset);
        }
        nowList.hidden = !nowOpen;
        const keep = new Set(live.map(v => v.statementIndex));
        for (const [i, it] of nowItems)
            if (!keep.has(i)) {
                it.r.remove();
                nowItems.delete(i);
            }
        for (const v of live) {
            const i = v.statementIndex, st = stmts[i];
            if (!st)
                continue;
            const it = nowItem(i);
            const out = heldOut(i);
            const level = Math.round(out ? (nowHeld.get(i) ?? v.receivedDb) : v.receivedDb);
            const faint = !out && level < top - 15;
            it.r.dataset.out = out ? '1' : '0';
            it.r.dataset.faint = faint ? '1' : '0';
            it.r.dataset.sel = isSelected(i) ? '1' : '0';
            const host = st.hostRef ? hostName(st.hostRef) : st.bed ? 'everywhere' : 'scene';
            it.n.textContent = `${host} · ${labelOf(st).what.split(/,\s*/)[0]}`;
            it.r.title = `${st.kind === 'trigger' ? 'on ' + st.eventName : st.bed ? 'bed, all around' : 'loop'}${faint ? ' · faint: well under the loudest sound here, likely masked' : ''} · click to face it, double-click to go there`;
            it.fill.style.width = `${Math.max(4, Math.min(100, (level - 5) * 2))}%`;
            it.db.textContent = isMuted(i) ? 'muted' : faint ? 'drowned out' : fmtLoud(level);
            it.mute.dataset.on = isMuted(i) ? '1' : '0';
            it.solo.dataset.on = engine.soloedIndices.has(i) ? '1' : '0';
            if (!it.r.isConnected || !nowHovering)
                nowList.appendChild(it.r); // reorder only when you are not pointing at it
        }
    }
    function deleteVoice(i) {
        const b = blockMap?.get(i);
        if (!b)
            return;
        const lines = script.split('\n');
        const next = [...lines.slice(0, b.start), ...lines.slice(b.end)].join('\n').replace(/\n{3,}/g, '\n\n');
        const removed = lines.slice(b.start, b.end).join('\n');
        const detail = { voice: voiceContext(i), removed };
        const st = engine.scriptStatements[i];
        const name = `${st?.hostRef ? hostName(st.hostRef) + ' · ' : ''}${st ? labelOf(st).what.split(/,\s*/)[0] : 'a sound'}`;
        openDrawer = null;
        bin.unshift({ name, block: removed, at: Date.now(), anchor: blockAnchor(script, b.start) }); // before the redraw, so the bin shows it
        if (applyScript(next, `deleted ${name.slice(0, 48)}`, { kind: 'delete_voice', detail }))
            say(`deleted ${name.slice(0, 40)} · undo (⌘Z) or history brings it back`);
        else
            bin.shift();
    }
    /** Deleted sounds, restorable (history's undo works too). */
    const bin = [];
    function restoreFromBin(k) {
        const entry = bin[k];
        if (!entry)
            return;
        // back where it was, so the sounds keep their order (and their colours)
        const next = restoreBlock(script, entry.block, entry.anchor);
        bin.splice(k, 1);
        if (!applyScript(next, `restored ${entry.name.slice(0, 48)}`, { kind: 'restore_voice', detail: { restored: entry.block } }))
            bin.splice(k, 0, entry);
    }
    function binBox() {
        if (!bin.length)
            return null;
        const box = el('div', 'satie-dt-bin');
        box.appendChild(el('div', 'hd', `bin · ${bin.length} deleted`));
        bin.forEach((b, k) => {
            const r = el('div', 'it');
            const restore = el('button', undefined, 'restore');
            restore.addEventListener('click', () => restoreFromBin(k));
            r.append(el('span', 'n', b.name), restore);
            box.appendChild(r);
        });
        return box;
    }
    function useClip(i, clip, entry, note) { putClipOnVoice(i, clip, entry, note); }
    /** A voice that plays a recording plays another one: its sound token on the head line (nothing else changes). */
    function putClipOnVoice(i, clip, entry, note) {
        const b = blockMap?.get(i);
        if (!b)
            return;
        const lines = script.split('\n');
        lines[b.header] = swapHeader(lines[b.header], engine.scriptStatements[i], clip);
        const key = pathFor(clip);
        const detail = { voice: voiceContext(i), to: { clip, ...entry } };
        const expectedVersion = documentVersion;
        openDrawer = null;
        stopPreview();
        void bufferFor(entry.url).then(buffer => {
            if (destroyed)
                return;
            if (entry.sha256 && engine.getAudioAssetHash(buffer) !== entry.sha256)
                throw new Error('Sample checksum mismatch.');
            if (documentVersion !== expectedVersion) {
                record('swap_stale', {});
                say('Scene changed while the take loaded; choose the swap again.');
                return;
            }
            const previous = manifest[key];
            manifest[key] = entry;
            if (applyScript(lines.join('\n'), note, { kind: 'swap', detail })) {
                engine.setAudioBuffer(key, buffer);
                record('asset_loaded', {});
                buildMixer();
            }
            else {
                if (previous)
                    manifest[key] = previous;
                else
                    delete manifest[key];
            }
        }).catch(error => { record('edit_failed', { error: String(error) }); say(`Take could not load: ${String(error)}`); });
    }
    /**
     * A take SATIE made for a voice goes in the way generation writes it: `gen <its words>` on the head
     * line, the take you heard as its first take. (It was written as `community/take_<id>`, an opaque
     * token: the sound lost its description, its name read "take e2b7426d", and a search for another
     * one searched for that.)
     */
    function putNewTake(i, words, entry, note) {
        const st = engine.scriptStatements[i];
        if (!st)
            return;
        const text = words.trim().replace(/\s+/g, ' ');
        const next = setVoiceSource(script, voiceLocatorFor(st, engine.scriptStatements), { genPrompt: text });
        // never an opaque take id in the script: a take that cannot be written by its words is not put in
        if (!next) {
            say("That take could not be put in; edit the sound's script.");
            return;
        }
        const expectedVersion = documentVersion;
        openDrawer = null;
        stopPreview();
        void bufferFor(entry.url).then(buffer => {
            if (destroyed)
                return;
            if (documentVersion !== expectedVersion) {
                say('Scene changed while the take loaded; choose it again.');
                return;
            }
            const parsed = tryParse(next).statements ?? [];
            const ns = (st.sourceId ? parsed.find(o => o.sourceId === st.sourceId) : parsed[i]) ?? parsed[i];
            if (!ns)
                return;
            const key = takeClipPath(ns, 0);
            manifest[key] = { ...entry, name: entry.name ?? text };
            engine.setAudioBuffer(key, buffer);
            if (applyScript(next, note, { kind: 'swap', detail: { voice: voiceContext(i), to: { gen: text, ...entry } } })) {
                record('asset_loaded', {});
                buildMixer();
            }
        }).catch(error => { record('edit_failed', { error: String(error) }); say(`Take could not load: ${String(error)}`); });
    }
    /** Audition in the mix, at the voice's position (the app's strip: press and hold). Falls back to a plain player when the engine is stopped. */
    let auditionHandle = null;
    const bufferCache = new Map();
    /** Decoded takes that were taken out, by url: going back (undo, history) puts them back without a download. */
    const stash = new Map();
    function bufferFor(url) {
        const kept = stash.get(url);
        if (kept)
            return Promise.resolve(kept);
        let p = bufferCache.get(url);
        // samples.json urls are relative to samples.json (`./samples/…`), as the runtime loads them; from
        // the page they fetched the dev server's HTML fallback ("Unable to decode audio data")
        const abs = (() => { try {
            return new URL(url, new URL(samplesUrl ?? location.href, location.href)).href;
        }
        catch {
            return url;
        } })();
        if (!p) {
            p = fetch(abs).then(r => { if (!r.ok)
                throw new Error(`Audio: HTTP ${r.status}`); return r.arrayBuffer(); }).then(b => engine.decodeAudioAsset(b));
            bufferCache.set(url, p);
            void p.catch(() => bufferCache.delete(url));
        }
        return p;
    }
    /** One preview at a time: click plays (the arc spins while it loads), click again or another stops it. */
    let preview = null;
    /** The fader moves while a take auditions: its level follows at once (off auditions at the original level). */
    function auditionFollows(indices, db) {
        if (!preview?.gain || preview.i === undefined || !indices.includes(preview.i) || preview.norm === undefined)
            return;
        const g = preview.norm * Math.pow(10, (db <= OFF ? 0 : db) / 20);
        preview.gain.gain.setTargetAtTime(Math.min(8, g), engine.audioContext.currentTime, 0.03);
    }
    /** While you audition a take, the rest of the scene dips to near silence: you hear that sound alone. */
    // near silent: an audition is for hearing that one sound, not the mix (−12 dB still masked a quiet take)
    const DUCK_DB = -30;
    /** Below hearing: the scene while you judge a sound alone. */
    const SILENT_DB = -120;
    let ducked = [];
    // The engine holds one preview trim per voice; the duck and a fader drag both use it, so they add up here.
    const duckDb = new Map(), dragDb = new Map();
    function writePreview(i) {
        const a = duckDb.get(i), b = dragDb.get(i);
        engine.setStatementPreviewDb(i, a === undefined && b === undefined ? null : Math.max(-120, (a ?? 0) + (b ?? 0)));
    }
    /**
     * Solo is the mixing convention: only the soloed sounds, exactly as they play where you stand
     * (level, effects, position unchanged; walk closer and they get louder). It turns you to face it.
     * Hearing a take up close, even when the game has it silent, is ▶.
     */
    /**
     * Solo a sound: you hear it alone, as it plays where you stand. A one-shot or event sound is silent
     * between plays (the cat: once every 20 to 45 s), so soloing it plays it once now, from where it is,
     * through the scene's own path (the engine's audition), instead of a silence that reads as broken.
     */
    function onSoloed(i) {
        focusVoices([i]);
        const st = engine.scriptStatements[i];
        const recent = shots.has(i) && performance.now() - shots.get(i).at < 3000;
        if (st && (st.kind === 'oneshot' || st.kind === 'trigger') && !recent) {
            if (!engine.isPlaying)
                void engine.play?.();
            engine.auditionStatement?.(i);
        }
    }
    function setDragDb(i, db) { if (db === null)
        dragDb.delete(i);
    else
        dragDb.set(i, db); writePreview(i); }
    function duckScene(except) {
        unduckScene();
        engine.scriptStatements.forEach((_, i) => { if (i !== except) {
            duckDb.set(i, DUCK_DB);
            writePreview(i);
            ducked.push(i);
        } });
    }
    /** Everything goes silent (not ducked): a candidate is judged on its own. */
    function silenceScene() {
        unduckScene();
        engine.scriptStatements.forEach((_, i) => { duckDb.set(i, SILENT_DB); writePreview(i); ducked.push(i); });
    }
    /** Hear a candidate in place of these voices: only they go quiet, the rest of the scene plays as it is. */
    function duckOnly(indices) {
        unduckScene();
        for (const i of indices) {
            duckDb.set(i, DUCK_DB);
            writePreview(i);
            ducked.push(i);
        }
    }
    function unduckScene() { for (const i of ducked) {
        duckDb.delete(i);
        writePreview(i);
    } ducked = []; }
    function stopPreview() {
        // back to how the scene rests, not to full: with the mix open that is the duck, so a hover that is cut short (or a
        // take that fails to load) never lets the game come back loud under the mix (2026-11-13)
        restScene();
        if (!preview)
            return;
        const p = preview;
        preview = null;
        cancelAnimationFrame(p.raf);
        if (p.startedAt !== undefined)
            p.onEnd?.(Math.round(performance.now() - p.startedAt));
        auditionHandle?.stop(0.12);
        auditionHandle = null;
        try {
            p.plain?.stop();
        }
        catch { /* already ended */ }
        for (const x of p.extra ?? []) {
            try {
                x.stop();
            }
            catch { /* already ended */ }
        }
        p.btn.dataset.state = 'idle';
        p.btn.innerHTML = ICON.play;
        p.btn.setAttribute('aria-label', 'Preview');
        p.fill.style.width = '0';
    }
    /**
     * Hear a sound: at its place in the game (`atPlace`), or up close and evened out, whatever the game
     * is doing. `replacing`: heard in place of those voices (only they go quiet, at the first one's
     * place), the way a candidate would sound once kept. `onEnd` gets how long it was heard.
     */
    function togglePreview(btn, fill, i, url, atPlace = true, opts = {}) {
        if (preview?.btn === btn) {
            stopPreview();
            return;
        }
        stopPreview();
        const p = preview = { btn, fill, raf: 0, plain: null, ...(opts.onEnd ? { onEnd: opts.onEnd } : {}) };
        btn.dataset.state = 'loading';
        btn.innerHTML = ICON.load;
        btn.setAttribute('aria-label', 'Loading preview');
        void bufferFor(url).then(buf => {
            if (preview !== p || destroyed)
                return;
            // alone: everything else goes silent, to judge the sound itself
            if (opts.alone)
                silenceScene();
            else if (opts.replacing?.length)
                duckOnly(opts.replacing);
            else
                duckScene(i);
            p.startedAt = performance.now();
            btn.dataset.state = 'playing';
            btn.innerHTML = ICON.stop;
            btn.setAttribute('aria-label', 'Stop preview');
            const ctx = engine.audioContext, t0 = ctx.currentTime;
            const at = opts.replacing?.[0] ?? i;
            const view = engine.getTrackViews().find(v => v.statementIndex === at);
            let len = Math.min(buf.duration, 20);
            if (atPlace && !opts.alone && !opts.repeat && engine.isPlaying && view)
                auditionHandle = engine.playOneShotAt(buf, view.position.x, view.position.y, view.position.z, { loop: false, fadeInS: 0.05, maxDurationS: 20 });
            else {
                // plainly, evened out; a sound the game fires over and over plays as a short run at the game's own pace
                if (ctx.state === 'suspended')
                    void ctx.resume();
                let peak = 0;
                for (let c = 0; c < buf.numberOfChannels; c++) {
                    const d = buf.getChannelData(c);
                    for (let k = 0; k < d.length; k += 16) {
                        const a = Math.abs(d[k]);
                        if (a > peak)
                            peak = a;
                    }
                }
                const g = ctx.createGain();
                g.gain.value = atPlace && !opts.alone ? 0.8 : Math.min(4, 0.5 / Math.max(peak, 1e-3));
                g.connect(ctx.destination);
                const times = opts.repeat ? opts.repeat.times : 1, gap = opts.repeat ? opts.repeat.gapS : 0;
                const each = opts.repeat ? Math.min(buf.duration, Math.max(gap * 1.6, 0.8)) : len;
                const srcs = [];
                for (let k = 0; k < times; k++) {
                    const src = ctx.createBufferSource(), v = ctx.createGain();
                    src.buffer = buf;
                    src.connect(v).connect(g);
                    const start = t0 + 0.03 + k * gap;
                    src.start(start);
                    src.stop(start + each);
                    srcs.push(src);
                }
                len = (times - 1) * gap + each + 0.05;
                p.plain = srcs[srcs.length - 1] ?? null;
                p.extra = srcs;
            }
            const tick = () => {
                if (preview !== p)
                    return;
                const k = Math.min(1, (ctx.currentTime - t0) / len);
                fill.style.width = `${k * 100}%`;
                if (k < 1)
                    p.raf = requestAnimationFrame(tick);
                else
                    stopPreview();
            };
            p.raf = requestAnimationFrame(tick);
        }).catch(error => { if (preview === p) {
            stopPreview();
            say(`Preview failed: ${String(error)}`);
        } });
    }
    /**
     * How the game fires these voices, from what it actually fired (the engine's event log): a sound fired
     * over and over at a steady pace (steps, knocks, a ticking gate) plays as a short run when you hear a
     * candidate for it. Nothing here is about which sound it is: only how often it really sounded.
     */
    function cadenceOf(indices) {
        const want = new Set(indices);
        const times = engine.eventLog.snapshot().filter(e => e.kind === 'fire' && want.has(e.statementIndex)).map(e => e.t).sort((a, b) => a - b);
        if (times.length < 4)
            return null;
        const gaps = times.slice(1).map((t, k) => t - times[k]).filter(g => g > 0.08 && g < 4).sort((a, b) => a - b);
        if (gaps.length < 3)
            return null;
        const mid = gaps[Math.floor(gaps.length / 2)];
        // a steady pace (most gaps near the middle one), quick enough to read as a run
        const steady = gaps.filter(g => Math.abs(g - mid) < mid * 0.5).length / gaps.length;
        return mid <= 2 && steady >= 0.6 ? { times: 6, gapS: mid } : null;
    }
    function buildFeedback(i, st) {
        const panel = el('div', 'satie-dt-drawer satie-dt-feedback');
        const baseline = JSON.stringify(snapshotNow());
        const clipPath = pathFor(st.clip);
        const identity = loadedIdentity(clipPath);
        const select = (label, choices) => {
            const node = el('select');
            node.setAttribute('aria-label', label);
            for (const value of choices) {
                const option = el('option', undefined, value);
                option.value = value;
                node.appendChild(option);
            }
            panel.appendChild(node);
            return node;
        };
        panel.appendChild(el('div', 'satie-dt-note', 'Explicit feedback stays in your local edit log. It is not permission to contribute.'));
        const scope = select('Feedback scope', ['source', ...(identity.sha256 ? ['take'] : [])]);
        const dimension = select('Feedback dimension', ['source-fit', 'intent', 'balance', 'spatial', 'acoustics']);
        const verdict = select('Feedback verdict', ['neutral', 'keep', 'reject']);
        panel.appendChild(el('div', 'satie-dt-note', identity.sha256
            ? `Take identity: ${identity.sha256}. Hash of encoded source bytes, before normalization and effects.`
            : 'Exact-take feedback unavailable: the loaded buffer has no verified source-byte hash. Reload through the runtime asset loader.'));
        const reason = el('textarea');
        reason.setAttribute('aria-label', 'Feedback reason');
        reason.maxLength = 2000;
        reason.placeholder = 'Why does this fit or fail?';
        const listened = el('input');
        listened.type = 'checkbox';
        const label = el('label');
        label.append(listened, document.createTextNode(' I listened to this source/take in this revision'));
        const submit = el('button', undefined, 'record feedback');
        const message = el('div', 'satie-dt-note');
        submit.addEventListener('click', () => {
            if (destroyed || !recorder)
                return;
            if (engine.scriptStatements[i] !== st || JSON.stringify(snapshotNow()) !== baseline) {
                message.textContent = 'Scene or loaded take changed. Reopen feedback and review it again.';
                return;
            }
            if (!reason.value.trim()) {
                message.textContent = 'Add a reason before recording feedback.';
                return;
            }
            const recorded = record('feedback', { feedback: { target: scope.value === 'take' ? { clipPath, sha256: identity.sha256 } : { statementIndex: i },
                    origin: 'human', evidence: 'explicit-user-feedback', auditioned: listened.checked,
                    dimension: dimension.value, verdict: verdict.value, reason: reason.value.trim() } });
            submit.disabled = true;
            message.textContent = recorded ? 'Feedback recorded locally; nothing contributed.' : 'Feedback not recorded: capture stopped. Download the log and start a new session.';
        });
        panel.append(reason, label, submit, message);
        if (identity.sha256) {
            const pin = el('button', undefined, 'pin take A');
            pin.addEventListener('click', () => {
                if (JSON.stringify(snapshotNow()) !== baseline || engine.scriptStatements[i] !== st) {
                    message.textContent = 'Scene changed. Reopen feedback before pinning.';
                    return;
                }
                const buffer = engine.getAudioBuffers().get(clipPath);
                const pinId = crypto.randomUUID();
                if (!record('comparison_pin', { pinId, target: { clipPath, sha256: identity.sha256 } })) {
                    message.textContent = 'Capture stopped; take was not pinned.';
                    return;
                }
                pinnedTake = { pinId, buffer: TakeComparison.excerpt(engine.audioContext, buffer), sha256: identity.sha256 };
                buildMixer();
            });
            panel.appendChild(pin);
            if (pinnedTake && pinnedTake.sha256 !== identity.sha256) {
                panel.appendChild(buildComparison(i, st, clipPath, identity.sha256, baseline));
            }
            else if (pinnedTake)
                panel.appendChild(el('div', 'satie-dt-note', 'A pinned. Swap to a different take, then reopen feedback to compare.'));
        }
        return panel;
    }
    function buildComparison(i, st, clipPath, sha256, baseline) {
        const pin = pinnedTake;
        const trial = new TakeComparison(engine.audioContext, pin.buffer, TakeComparison.excerpt(engine.audioContext, engine.getAudioBuffers().get(clipPath)));
        comparison = trial;
        const panel = el('div', 'satie-dt-feedback');
        const note = el('div', 'satie-dt-note', `Dry A/B: first ${trial.durationS.toFixed(2)} seconds, same 0.3 output gain, no scene effects. Stop scene playback first. This is a take preference, not an acoustic realism test.`);
        const message = el('div', 'satie-dt-note');
        const valid = () => !destroyed && comparison === trial && !engine.isPlaying && pinnedTake === pin
            && engine.scriptStatements[i] === st && JSON.stringify(snapshotNow()) === baseline;
        const detail = { pinId: pin.pinId, target: { clipPath, sha256 } };
        panel.appendChild(note);
        for (const side of ['A', 'B']) {
            const play = el('button', undefined, `audition ${side}`);
            play.addEventListener('click', () => {
                if (!valid()) {
                    trial.stop();
                    message.textContent = 'Stop playback and reopen comparison after any scene change.';
                    return;
                }
                stopPreview();
                message.textContent = `Playing ${side}…`;
                void trial.play(side).then(completed => {
                    if (!completed || !valid()) {
                        trial.completed.delete(side);
                        return;
                    }
                    if (!record('comparison_audition', { ...detail, side, durationS: trial.durationS }))
                        trial.completed.delete(side);
                    message.textContent = `${side} excerpt completed. Listening still requires your confirmation.`;
                }).catch(error => { trial.completed.delete(side); message.textContent = `Audition failed: ${String(error)}`; });
            });
            panel.appendChild(play);
        }
        const stop = el('button', undefined, 'stop audition');
        stop.addEventListener('click', () => trial.stop());
        panel.appendChild(stop);
        const winner = el('select');
        winner.setAttribute('aria-label', 'Preferred take');
        for (const value of ['', 'A', 'B']) {
            const option = el('option', undefined, value || 'Choose preference');
            option.value = value;
            winner.appendChild(option);
        }
        const reason = el('textarea');
        reason.setAttribute('aria-label', 'Comparison reason');
        reason.maxLength = 2000;
        const listened = el('input');
        listened.type = 'checkbox';
        const label = el('label');
        label.append(listened, document.createTextNode(' I listened to both complete excerpts'));
        const submit = el('button', undefined, 'record comparison');
        submit.addEventListener('click', () => {
            if (!valid()) {
                message.textContent = 'Scene changed or playback started. Reopen comparison.';
                return;
            }
            if (!trial.completed.has('A') || !trial.completed.has('B') || !listened.checked || !winner.value || !reason.value.trim()) {
                message.textContent = 'Audition both excerpts, confirm listening, choose A or B and add a reason.';
                return;
            }
            const recorded = record('comparison_feedback', { ...detail, winner: winner.value, reason: reason.value.trim(), auditioned: true,
                comparison: { protocol: 'dry-ab/v1', gain: 0.3, offsetS: 0, durationS: trial.durationS, completed: ['A', 'B'] } });
            submit.disabled = true;
            message.textContent = recorded ? 'Comparison recorded locally; nothing contributed.' : 'Capture stopped; comparison not recorded.';
            trial.stop();
        });
        panel.append(winner, reason, label, submit, message);
        return panel;
    }
    // ── properties: the app's per-voice editor, generated from the registry ──
    const MOVEMENT_OPTIONS = ['static', 'walk', 'fly', 'spiral', 'orbit', 'lorenz', 'breathe', 'drift', 'swell', 'wander', 'dart', 'circle', 'pass', 'approach', 'recede'];
    const WHEN_OWNED = new Set(['zone', 'every']); // "when it plays" owns the states a sound plays in, and how often
    const fmtNum = (n) => String(Math.round(n * 1000) / 1000);
    function locatorFor(i) {
        const stmts = engine.scriptStatements;
        const st = stmts[i];
        let occurrence = 0;
        for (let k = 0; k < i; k++) {
            const o = stmts[k];
            if (o.kind === st.kind && o.clip === st.clip && (o.genPrompt ?? null) === (st.genPrompt ?? null))
                occurrence++;
        }
        return { kind: st.kind, clip: st.clip, genPrompt: st.genPrompt, occurrence };
    }
    /** The raw text of a property in the voice's own block (own or inline line), or null. */
    function rawValue(i, key) {
        const authored = inspectorPropertyRaw(script, engine.scriptStatements[i], key);
        if (authored !== null)
            return authored;
        const b = blockMap?.get(i);
        if (!b)
            return null;
        const lines = script.split('\n');
        for (let l = b.header; l < b.end; l++) {
            const m = lines[l].match(new RegExp(`^\\s*${key}(?:\\s+(.*))?$`));
            if (m)
                return (m[1] ?? '').trim();
            const inl = lines[l].match(new RegExp(`\\band\\s+${key}\\s+(.*?)(?=\\s+and\\s+|$)`));
            if (inl && l === b.header)
                return inl[1].trim();
        }
        return null;
    }
    /**
     * Hear a property while you drag it: the engine plays the edited script at once (its live-apply
     * path absorbs level, size, place, effects), the document and the panel are untouched until the
     * release commits it once (`setProp`). At most once a frame.
     */
    let liveDrag = false, livePending = null;
    /**
     * The settings a playing sound takes in place as you drag (the engine's live edits): the rest
     * (movement, its timing envelope) would restart it on every frame, so they apply when you let go.
     */
    const LIVE_PROPS = new Set(['volume', 'spl', 'pitch', 'every', 'place', 'rotate', 'scale', 'radius', 'ring', 'color', 'alpha', 'visual', 'occlusion', 'reverb', 'delay', 'filter', 'distortion', 'eq']);
    function previewProp(i, key, value) {
        if (!LIVE_PROPS.has(key)) {
            liveDrag = true;
            return;
        }
        const next = upsertVoiceProperty(script, locatorFor(i), key, value);
        if (!next || whyUnloadable(next, script))
            return;
        const first = livePending === null;
        livePending = next;
        liveDrag = true;
        if (first)
            requestAnimationFrame(() => { const t = livePending; livePending = null; if (t) {
                try {
                    engine.loadScript(t);
                }
                catch { /* the release commits or refuses */ }
            } });
    }
    let justEdited = null;
    /** A flag property (`in_order`, `overlap`, `randomstart`) on or off, as one edit. */
    function setFlag(i, key, on, note) {
        const next = on ? upsertVoiceProperty(script, locatorFor(i), key, '') : removeVoiceProperty(script, locatorFor(i), key);
        if (!next) {
            say('could not change that; edit its script');
            return;
        }
        applyScript(next, `${nameOf(engine.scriptStatements[i])}: ${note}`, { kind: 'property', detail: { voice: voiceContext(i), key, value: on } });
    }
    function setProp(i, key, value, note) {
        liveDrag = false;
        justEdited = { i, key, at: performance.now() };
        // (2026-11-13) a class's sound set from the mix is set on every copy (62 cars, one change)
        let next = script;
        for (const j of propCopies.get(i) ?? [i]) {
            const n2 = upsertVoiceProperty(next, locatorFor(j), key, value);
            if (n2 !== null)
                next = n2;
            else if (j === i)
                next = null;
            if (next === null)
                break;
        }
        if (next === null) {
            say('could not find that voice in the script');
            return;
        }
        if (applyScript(next, note, { kind: 'property', detail: { voice: voiceContext(i), key, value, was: rawValue(i, key), copies: (propCopies.get(i) ?? [i]).length } }) && editOpen) {
            mixSig = '';
            setTimeout(() => paintMixSide(lastLevel), 60);
        }
    }
    function removeProp(i, key) {
        let next = script;
        for (const j of propCopies.get(i) ?? [i]) {
            const n2 = removeVoiceProperty(next, locatorFor(j), key);
            if (n2 !== null)
                next = n2;
            else if (j === i)
                next = null;
            if (next === null)
                break;
        }
        if (next === null) {
            say('could not find that voice in the script');
            return;
        }
        if (applyScript(next, `removed ${key}`, { kind: 'property', detail: { voice: voiceContext(i), key, value: null, was: rawValue(i, key) } }) && editOpen) {
            mixSig = '';
            setTimeout(() => paintMixSide(lastLevel), 60);
        }
    }
    const readout = (value, onCommit) => {
        const r = el('input', 'ro');
        r.type = 'text';
        r.value = value;
        r.addEventListener('keydown', e => { if (e.key === 'Enter')
            onCommit(r.value.trim()); if (e.key === 'Escape')
            r.value = value; });
        r.addEventListener('blur', () => { if (r.value.trim() !== value)
            onCommit(r.value.trim()); });
        return r;
    };
    const slider = (value, spec, onCommit, live) => {
        const s = el('input');
        s.type = 'range';
        s.min = String(spec.min ?? 0);
        s.max = String(spec.max ?? 1);
        s.step = String(spec.step ?? 0.01);
        s.value = String(value);
        s.addEventListener('input', () => live?.(parseFloat(s.value)));
        s.addEventListener('change', () => onCommit(snap(parseFloat(s.value), spec)));
        return s;
    };
    /** The widget for one property, the way the app picks it: the registry names it, the raw value decides whether it fits. */
    function widgetFor(i, key, raw, control, ghost, st) {
        const wrap = el('div', 'pw');
        const commit = (text) => setProp(i, key, text, `${key} ${text}`.trim());
        const textInput = () => {
            const t = el('input');
            t.type = 'text';
            t.value = raw;
            t.style.flex = '1';
            // only a change commits (Enter on an untouched field does nothing), and never an empty value:
            // a bare `at` or `source_id` is not a value, it is a broken line (× removes a property)
            const send = () => { const v = t.value.trim(); if (v === raw)
                return; if (!v) {
                t.value = raw;
                say(`${key} needs a value; × removes it`);
                return;
            } commit(v); };
            t.addEventListener('keydown', e => { if (e.key === 'Enter')
                send(); });
            t.addEventListener('blur', send);
            wrap.appendChild(t);
            // a value its control cannot show says so, instead of quietly becoming a text box
            const why = textFallbackReason(control.kind, raw);
            if (why) {
                const n = el('small', 'why', why);
                n.title = 'typing a plain value here gives it its control back';
                wrap.appendChild(n);
            }
        };
        if (ghost) {
            // not set: say so, with what setting it would start at; one click sets it, in place
            const seed = seedFor(key);
            const b = el('button', 'ghostbtn', seed === null ? 'not set · set it…' : `not set · set it (starts at ${seed})`);
            b.title = PROPERTIES.find(p => p.name === key)?.documentation?.split('\n')[0] ?? key;
            b.addEventListener('click', () => {
                if (seed !== null) {
                    commit(seed);
                    return;
                }
                if (key === 'at' || key === 'place') {
                    moveSound(i, st, b);
                    return;
                }
                if (key === 'zone') {
                    const first = layer?.states?.()[0];
                    if (first)
                        commit(first);
                    return;
                }
                const v = prompt(`${key}:`, '');
                if (v !== null && v.trim())
                    commit(v.trim());
            });
            wrap.appendChild(b);
            return wrap;
        }
        // movement: the kind of motion, then its own settings in words (area, speed), never the raw line
        if (key === 'move') {
            const m = raw.trim().match(/^(\S+)\s*(.*)$/);
            const head = m?.[1] ?? 'static', tail = m?.[2] ?? '';
            const sel = el('select');
            sel.setAttribute('aria-label', 'how it moves');
            const words = { static: 'stays put', wander: 'wanders around', drift: 'drifts slowly', dart: 'darts about', circle: 'circles', pass: 'passes through', approach: 'comes closer', recede: 'moves away', walk: 'walks (on the ground)', fly: 'flies', orbit: 'orbits', spiral: 'spirals', breathe: 'breathes in place', swell: 'swells', lorenz: 'drifts chaotically' };
            const opts2 = [...new Set([head, ...MOVEMENT_OPTIONS])];
            for (const o of opts2) {
                const op = el('option', undefined, words[o] ?? o);
                op.value = o;
                if (o === head)
                    op.selected = true;
                sel.appendChild(op);
            }
            sel.addEventListener('change', () => commit(sel.value === 'static' ? 'static' : `${sel.value}${tail ? ` ${tail}` : ''}`));
            wrap.appendChild(sel);
            // its area and speed, said plainly; speed is a slider (heard and seen live)
            const ax = tail.match(/\bx\s+(-?[\d.]+)to(-?[\d.]+)/), az = tail.match(/\bz\s+(-?[\d.]+)to(-?[\d.]+)/);
            if (ax && az)
                wrap.appendChild(el('span', 'note', `within ${Math.round(Math.abs(+ax[2] - +ax[1]) * 10) / 10} × ${Math.round(Math.abs(+az[2] - +az[1]) * 10) / 10} m (drawn in the world)`));
            const sp = tail.match(/\bspeed\s+([\d.]+)(?:to([\d.]+))?/);
            if (sp && head !== 'static') {
                const lo = +sp[1], hi = sp[2] !== undefined ? +sp[2] : lo, span = hi - lo;
                const label = el('span', 'note', `speed ${lo}${span ? `–${hi}` : ''} m/s`);
                const s2 = slider(lo, { min: 0, max: 10, step: 0.05 }, n => commit(`${head} ${tail.replace(/\bspeed\s+[\d.]+(?:to[\d.]+)?/, `speed ${fmtNum(n)}${span ? `to${fmtNum(n + span)}` : ''}`)}`.trim()), n => { const t = `${fmtNum(n)}${span ? `–${fmtNum(n + span)}` : ''}`; label.textContent = `speed ${t} m/s`; previewProp(i, key, `${head} ${tail.replace(/\bspeed\s+[\d.]+(?:to[\d.]+)?/, `speed ${fmtNum(n)}${span ? `to${fmtNum(n + span)}` : ''}`)}`.trim()); });
                wrap.append(s2, label);
            }
            return wrap;
        }
        // where it is: shown, and moved by dragging its dot (or aiming), not by typing coordinates
        if (key === 'place') {
            const v = raw.trim().split(/\s+/).slice(0, 3).map(Number);
            wrap.appendChild(el('span', 'note', v.length === 3 && v.every(Number.isFinite) ? `at (${v.map(n => Math.round(n * 10) / 10).join(', ')}) · drag its dot to move it` : `${raw} · drag its dot to move it`));
            const mv = el('button', 'link', 'aim and click…');
            mv.addEventListener('click', () => moveSound(i, st, mv));
            wrap.appendChild(mv);
            return wrap;
        }
        // the game states it plays in (the contract's), and what happens outside them; not free text
        if (key === 'zone') {
            const toks = raw.trim().split(/\s+/).filter(Boolean);
            const strict = toks.includes('strict');
            const inZones = new Set(toks.filter(t => t !== 'strict'));
            const states = layer?.states?.() ?? [...inZones];
            const write = () => { if (!inZones.size) {
                removeProp(i, key);
                return;
            } commit(`${[...inZones].join(' ')}${strictNow ? ' strict' : ''}`); };
            let strictNow = strict;
            const row = el('div', 'chips');
            for (const name of [...new Set([...states, ...inZones])]) {
                const b = el('button', 'chip', name.replace(/_/g, ' '));
                b.dataset.on = inZones.has(name) ? '1' : '0';
                b.title = inZones.has(name) ? `plays in ${name}; click to stop` : `also play in ${name}`;
                b.addEventListener('click', () => { if (!inZones.delete(name))
                    inZones.add(name); write(); });
                row.appendChild(b);
            }
            const out = el('select');
            out.setAttribute('aria-label', 'outside these states');
            for (const [v, l] of [['soft', 'outside: muffled'], ['strict', 'outside: silent']]) {
                const o = el('option', undefined, l);
                o.value = v;
                if ((v === 'strict') === strict)
                    o.selected = true;
                out.appendChild(o);
            }
            out.addEventListener('change', () => { strictNow = out.value === 'strict'; write(); });
            wrap.append(row, out);
            return wrap;
        }
        // where it is attached: one of the scene's things (by name), or picked in the world; never free text
        if (key === 'at') {
            const hosts = layer?.hosts?.() ?? engine.externalHosts.map(id => ({ id, label: undefined }));
            const sel = el('select');
            sel.setAttribute('aria-label', 'what it is on');
            const options = [...hosts.map(h => [h.id, h.label || h.id.replace(/_/g, ' ')]), ['listener', 'you (the listener)'], ['overhead', 'overhead'], ['ground', 'the ground']];
            if (raw && !options.some(([v]) => v === raw))
                options.unshift([raw, raw.replace(/_/g, ' ')]);
            for (const [v, label] of options) {
                const o = el('option', undefined, label);
                o.value = v;
                if (v === raw)
                    o.selected = true;
                sel.appendChild(o);
            }
            const pick = el('option', undefined, 'pick in the world…');
            pick.value = ' pick';
            sel.appendChild(pick);
            sel.addEventListener('change', () => { if (sel.value === ' pick') {
                sel.value = raw;
                moveSound(i, st, sel);
                return;
            } if (sel.value !== raw)
                commit(sel.value); });
            wrap.appendChild(sel);
            return wrap;
        }
        // `volume follow crossing_bells 0to1 0to1` in words: what the level follows, and how
        const follow = !ghost ? raw.match(/^follow\s+(\S+)\s+([-\d.]+)to([-\d.]+)\s+([-\d.]+)to([-\d.]+)/) : null;
        if (follow && (key === 'volume' || key === 'pitch')) {
            const [, sig, a, b, c, d] = follow;
            const out = (v) => key === 'volume' ? (Number(v) === 0 ? 'silent' : Number(v) === 1 ? 'full' : `${Math.round(Number(v) * 100)}%`) : `×${v}`;
            const line = el('span', 'follow');
            const room = sig.startsWith('in_') ? sig.slice(3) : null;
            const said = sig === 'indoors' ? 'you indoors' : room ? `you inside the ${room.replace(/_/g, ' ')}` : sig.replace(/_/g, ' ');
            const sd = layer?.signals?.().find(x => x.name === sig)?.description;
            line.append(el('b', undefined, key === 'volume' ? 'loudness follows ' : 'pitch follows '), el('span', 'sig', said), document.createTextNode(`: at ${a} ${out(c)}, at ${b} ${out(d)}`));
            line.title = `${sd ? `${sd}. ` : ''}The game sets it; this sound follows it. In the script: ${key} ${raw}`;
            wrap.appendChild(line);
            return wrap;
        }
        switch (control.kind) {
            case 'toggle': {
                const t = el('button', 'tg');
                t.dataset.on = ghost ? '0' : '1';
                t.appendChild(el('i'));
                t.title = ghost ? 'set the flag' : 'remove the flag';
                t.addEventListener('click', () => ghost ? commit('') : removeProp(i, key));
                wrap.appendChild(t);
                return wrap;
            }
            case 'slider': {
                const v = parseNumber(raw);
                if (v === null && raw) {
                    textInput();
                    return wrap;
                }
                const val = v ?? parseNumber(seedFor(key) ?? '0') ?? 0;
                const ro = readout(fmtNum(val), commit);
                const s = slider(val, control, n => commit(fmtNum(n)), n => { ro.value = fmtNum(n); previewProp(i, key, fmtNum(snap(n, control))); });
                wrap.append(s, ro);
                return wrap;
            }
            case 'stepper': {
                const v = parseNumber(raw) ?? parseNumber(seedFor(key) ?? '1') ?? 1;
                const minus = el('button', undefined, '−');
                const plus = el('button', undefined, '+');
                const val = el('span', undefined, String(v));
                minus.disabled = v <= (control.min ?? 0);
                plus.disabled = v >= (control.max ?? 99);
                minus.addEventListener('click', () => commit(String(v - (control.step ?? 1))));
                plus.addEventListener('click', () => commit(String(v + (control.step ?? 1))));
                wrap.append(minus, val, plus);
                return wrap;
            }
            case 'range': {
                // One track for the low handle plus a readout that accepts `AtoB`: the app's two-thumb rail collapses to this shape.
                const rv = parseRangeText(raw || (seedFor(key) ?? '0'));
                if (!rv && raw) {
                    textInput();
                    return wrap;
                }
                const cur = rv ?? { min: 0, max: 0 };
                const ro = readout(raw || formatRangeText(cur), commit);
                const s = slider(cur.min, control, n => {
                    const span = cur.max - cur.min;
                    commit(formatRangeText({ min: n, max: snap(n + span, control) }));
                }, n => {
                    const text = formatRangeText({ min: snap(n, control), max: snap(n + (cur.max - cur.min), control) });
                    ro.value = text;
                    previewProp(i, key, text); // heard and seen while dragging (a size grows its sphere as you drag)
                });
                wrap.append(s, ro);
                return wrap;
            }
            case 'select': {
                // a sound on one of the game's objects goes where the game moves it; SATIE's own motion is not
                // applied to it (the engine pins hosted voices), so offering orbit/wander there did nothing
                if (key === 'move' && st.hostRef && !st.entityId && engine.externalHosts.includes(st.hostRef)) {
                    wrap.appendChild(el('span', 'note', `moves with the ${hostName(st.hostRef)} (the game moves it). To move on its own, drag it off the thing to a spot first.`));
                    return wrap;
                }
                const options = key === 'move' ? MOVEMENT_OPTIONS
                    : key === 'attach' || key === 'follow' ? ['listener', ...engine.scriptStatements.filter(o => o !== st).map(o => o.clip)]
                        : control.options ?? [];
                const sel = el('select');
                const current = raw || seedFor(key) || options[0] || '';
                const all = current && !options.includes(current) ? [current, ...options] : options;
                for (const o of all) {
                    const op = el('option', undefined, o);
                    op.value = o;
                    if (o === current)
                        op.selected = true;
                    sel.appendChild(op);
                }
                const custom = el('option', undefined, 'custom…');
                custom.value = ' custom';
                sel.appendChild(custom);
                sel.addEventListener('change', () => {
                    if (sel.value === ' custom') {
                        const v = prompt(`${key}:`, current);
                        if (v !== null && v.trim())
                            commit(v.trim());
                        else
                            sel.value = current;
                        return;
                    }
                    commit(sel.value);
                });
                wrap.appendChild(sel);
                return wrap;
            }
            case 'vec3': {
                const v = parseVec3(raw || (seedFor(key) ?? '0 0 0'));
                if (!v) {
                    textInput();
                    return wrap;
                }
                const fields = v.map((n, k) => { const f = el('input'); f.type = 'number'; f.step = String(control.step ?? 0.1); f.value = fmtNum(n); f.title = 'xyz'[k]; return f; });
                const done = () => commit(formatVec3([parseFloat(fields[0].value) || 0, parseFloat(fields[1].value) || 0, parseFloat(fields[2].value) || 0]));
                for (const f of fields) {
                    f.addEventListener('change', done);
                }
                wrap.append(...fields);
                return wrap;
            }
            case 'compound': {
                const cv = parseCompound(raw || (seedFor(key) ?? ''), control);
                if (!cv) {
                    textInput();
                    return wrap;
                }
                const box = el('div', 'satie-dt-cmp');
                const write = () => commit(formatCompound(cv, control));
                if (control.head) {
                    const sel = el('select');
                    for (const h of control.head) {
                        const op = el('option', undefined, h);
                        op.value = h;
                        if (h === cv.head)
                            op.selected = true;
                        sel.appendChild(op);
                    }
                    sel.addEventListener('change', () => { cv.head = sel.value; write(); });
                    box.appendChild(sel);
                }
                const missing = [];
                for (const part of control.parts ?? []) {
                    if (!(part.key in cv.values)) {
                        missing.push(part);
                        continue;
                    }
                    const row = el('div', 'part');
                    const label = el('span', undefined, part.key);
                    const ro = el('span', 'ro', fmtNum(cv.values[part.key]));
                    const s = el('input');
                    s.type = 'range';
                    s.min = '0';
                    s.max = '1000';
                    s.step = '1';
                    s.value = String(Math.round(partToPosition(cv.values[part.key], part) * 1000));
                    s.addEventListener('input', () => { const v = partFromPosition(parseInt(s.value, 10) / 1000, part); ro.textContent = fmtNum(v); previewProp(i, key, formatCompound({ ...cv, values: { ...cv.values, [part.key]: snap(v, part) } }, control)); });
                    s.addEventListener('change', () => { cv.values[part.key] = snap(partFromPosition(parseInt(s.value, 10) / 1000, part), part); write(); });
                    const rm = el('button', 'ic', '×');
                    rm.title = `drop ${part.key}`;
                    rm.addEventListener('click', () => { delete cv.values[part.key]; write(); });
                    row.append(label, s, ro, rm);
                    box.appendChild(row);
                }
                if (missing.length) {
                    const add = el('select');
                    add.style.width = '110px';
                    add.style.opacity = '.6';
                    add.style.borderStyle = 'dashed';
                    const first = el('option', undefined, '+ param…');
                    first.value = '';
                    add.appendChild(first);
                    for (const part of missing) {
                        const op = el('option', undefined, part.key);
                        op.value = part.key;
                        add.appendChild(op);
                    }
                    add.addEventListener('change', () => { const part = missing.find(p => p.key === add.value); if (!part)
                        return; cv.values[part.key] = snap((part.min + part.max) / 2, part); write(); });
                    box.appendChild(add);
                }
                wrap.appendChild(box);
                return wrap;
            }
            case 'color': {
                const hex = parseHexColor(raw || (seedFor(key) ?? '#888888'));
                if (!hex) {
                    textInput();
                    return wrap;
                }
                const c = el('input');
                c.type = 'color';
                c.value = hex;
                let t;
                c.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => commit(c.value), 400); });
                const ro = readout(hex, commit);
                wrap.append(c, ro);
                return wrap;
            }
            default:
                textInput();
                return wrap;
        }
    }
    const ghostApplies = (key, st) => {
        if (['variants', 'influence', 'loopable', 'voice'].includes(key) && !st.genPrompt)
            return false;
        if (['every', 'spread'].includes(key) && st.kind === 'loop')
            return false;
        if (WHEN_OWNED.has(key) || (key === 'volume' && st.volumeFollow))
            return false;
        const k = soundKind(st);
        // your own sounds and background sounds have no place of their own to move in, size or wall off
        if ((k === 'yours' || k === 'around') && ['move', 'radius', 'occlusion'].includes(key))
            return false;
        // an event plays when the game says, not on a timer
        if (st.kind === 'trigger' && key === 'every')
            return false;
        return true;
    };
    const shownProps = new Map();
    let finder = null;
    /** The take whose choices are open (replace, use only this one, remove). */
    let takeMenu = null;
    /** The surface whose versions are open on a per-surface sound's card (one at a time). */
    let openSurface = null;
    /** The texts a per-text voice's event carries (the contract's surfaces for it). */
    const textsOf = (st) => (st.eventName ? layer?.eventInfo?.(st.eventName)?.surfaces : undefined) ?? [];
    /** The key a voice plays for take k (of a text, for a per-text voice): the full-text key, else the one it was saved with. */
    function takeKeyAt(st, k, text) {
        if (text !== undefined && st.genPrompt) {
            const key = templateTake(st.genPrompt, text, k).clipPath, legacy = legacyTemplateTake(st.genPrompt, text, k);
            return engine.getAudioBuffers().has(key) || !engine.getAudioBuffers().has(legacy) ? key : legacy;
        }
        return st.isGenerated ? takeClipPath(st, k) : pathFor(st.clip);
    }
    /** Move what take `from` holds into take `to` (buffer and samples entry). */
    function moveTake(from, to) {
        const buf = engine.getAudioBuffers().get(from), entry = manifest[from];
        dropTake(to);
        if (buf)
            engine.setAudioBuffer(to, buf);
        if (entry)
            manifest[to] = entry;
        else
            delete manifest[to];
    }
    /** It plays take k every time: that take becomes its only one (the takes count goes to 1). */
    function keepOnlyTake(i, st, keys, k) {
        if (k > 0)
            moveTake(keys[k], keys[0]);
        for (let j = 1; j < keys.length; j++)
            dropTake(keys[j]);
        const next = removeVoiceProperty(script, voiceLocatorFor(st, engine.scriptStatements), 'variants');
        if (next)
            applyScript(next, `${nameOf(st)}: only take ${k + 1}`, { kind: 'takes', detail: { voice: voiceContext(i), kept: k } });
    }
    /** One take fewer: the ones after it move up, the count goes down by one. */
    function removeTake(i, st, keys, k) {
        for (let j = k; j < keys.length - 1; j++)
            moveTake(keys[j + 1], keys[j]);
        dropTake(keys[keys.length - 1]);
        const n = keys.length - 1, loc = voiceLocatorFor(st, engine.scriptStatements);
        const next = n <= 1 ? removeVoiceProperty(script, loc, 'variants') : upsertVoiceProperty(script, loc, 'variants', String(n));
        if (next)
            applyScript(next, `${nameOf(st)}: removed take ${k + 1}`, { kind: 'takes', detail: { voice: voiceContext(i), removed: k } });
    }
    /** One take, replaced by another sound: data (samples.json), the script unchanged; a version in history. */
    async function replaceTake(st, key, entry, label) {
        let buffer;
        try {
            buffer = await bufferFor(entry.url);
        }
        catch (e) {
            say(`That sound could not load: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        dropTake(key);
        engine.setAudioBuffer(key, buffer);
        manifest[key] = entry;
        commitHistory(`${nameOf(st)}: ${label} is now ${String(entry.name ?? 'another sound').split(',')[0].slice(0, 40)}`, 'takes');
        record('replace_take', { voice: st.sourceId ?? null, key, to: entry });
        finder = null;
        scheduleSave();
        buildMixer();
    }
    /** Play one take plainly, the scene dipped under it (the same ▶ / ■ as everywhere). */
    function playTake(btn, i, key) {
        // the take the engine already holds (no fetch); a url only when it is not loaded
        const buf = engine.getAudioBuffers().get(key);
        if (!buf) {
            const url = manifest[key]?.url;
            if (url)
                togglePreview(btn, el('i'), i, url, false);
            return;
        }
        if (preview?.btn === btn) {
            stopPreview();
            return;
        }
        stopPreview();
        duckScene(i);
        const ctx = engine.audioContext;
        if (ctx.state === 'suspended')
            void ctx.resume();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
        src.stop(ctx.currentTime + Math.min(buf.duration, 8));
        const p = preview = { btn, fill: el('i'), raf: 0, plain: src };
        btn.dataset.state = 'playing';
        btn.innerHTML = ICON.stop;
        src.onended = () => { if (preview === p)
            stopPreview(); };
    }
    // ── the sound card (./card): what it reads and draws with, handed over once ──
    let card = null;
    /** The open card's source: after a reload re-finds it by id, whatever index it moved to. */
    let openSource = null;
    /** Settings a dial on the card owns: their registry rows leave "advanced", so no setting has two controls. */
    /** Its level is the mixer's to move: its own source id and a static `spl` (not a crowd's, not one the game sets). */
    const levelMovable = (st) => !!st?.sourceId && !st.entityId && !st.splFollow && splTable(script).has(st.sourceId);
    const cardOwns = (st) => {
        const owned = new Set();
        if (levelMovable(st))
            owned.add('spl');
        const ctx = cardHost.dialContext(engine.scriptStatements.indexOf(st));
        for (const d of [...SLIDER_DIALS(), ...TIMING_DIALS()])
            if (d.appliesTo(st, ctx))
                for (const k of d.owns)
                    owned.add(k);
        // "how it moves" owns the motion of a sound with a place of its own
        if ((ctx.kind === 'place' || ctx.kind === 'moving') && !st.entityId)
            owned.add('move');
        return owned;
    };
    /** Which card's sound is held audible (`cardHost.listen`). */
    let listenHeldBy = null;
    const cardHost = {
        async createSource(i, request) {
            const initial = engine.scriptStatements[i];
            if (!initial || !authoring)
                throw new Error('Choose an editable voice first.');
            const sourceId = initial.sourceId, initialClip = initial.clip;
            const current = () => sourceId ? engine.scriptStatements.find(st => st.sourceId === sourceId) : engine.scriptStatements[i]?.clip === initialClip ? engine.scriptStatements[i] : undefined;
            const response = await fetch(takeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, loop: initial.kind === 'loop' }) });
            const result = await response.json();
            if (!response.ok || result.ok === false || !result.url || !result.sampleId)
                throw new Error(result.error ?? 'Could not create the preview.');
            const buffer = await bufferFor(result.url), asset = synthAssetFor(buffer);
            if (request.synth && !asset)
                throw new Error('The take has no live instrument. It was not applied.');
            const key = pathFor(`takes/${encodeURIComponent(result.sampleId)}`);
            const entry = { url: result.url, sampleId: result.sampleId, name: result.name ?? request.prompt, source: 'generated', ...(asset ? { synth: asset } : {}) };
            let player = null;
            const stop = () => { if (player) {
                player.stop();
                player.disconnect();
                player = null;
            } };
            return {
                label: asset ? asset.patch.layers.map(l => l.instrument ? instrumentById(l.instrument.id)?.name ?? l.name : l.name).join(' · ') : entry.name,
                listen() { stop(); void engine.audioContext.resume(); const playing = engine.audioContext.createBufferSource(); player = playing; playing.buffer = buffer; playing.connect(engine.audioContext.destination); playing.onended = () => { playing.disconnect(); if (player === playing)
                    player = null; }; playing.start(); },
                stop,
                use() {
                    const st = current();
                    if (!st || st.clip !== initialClip || destroyed)
                        return false;
                    const loc = voiceLocatorFor(st, engine.scriptStatements);
                    const next = setVoiceSource(script, loc, { clip: key, synth: request.synth });
                    if (!next)
                        return false;
                    const oldEntry = manifest[takeKeysFor(st)[0]] ?? manifest[pathFor(st.clip)];
                    entry.sourceChoices = { ...oldEntry?.sourceChoices, [st.synth ? 'synth' : 'sample']: { clip: st.clipToken ?? st.clip, ...(st.genPrompt ? { prompt: st.genPrompt } : {}), synth: st.synth, recordings: st.recordings } };
                    engine.setAudioBuffer(key, buffer);
                    manifest[key] = entry;
                    stop();
                    if (applyScript(next, request.synth ? 'Use synth instrument' : 'Use sample', { kind: 'source', detail: { voice: voiceContext(i), synth: request.synth, sampleId: result.sampleId, instrumentId: asset?.id } }))
                        return true;
                    engine.removeAudioBuffer(key);
                    delete manifest[key];
                    return false;
                },
            };
        },
        hasPreviousSource(i, synth) {
            const st = engine.scriptStatements[i];
            const entry = st && (manifest[takeKeysFor(st)[0]] ?? manifest[pathFor(st.clip)]);
            return !!entry?.sourceChoices?.[synth ? 'synth' : 'sample'];
        },
        restoreSource(i, synth) {
            const st = engine.scriptStatements[i];
            if (!st)
                return false;
            const entry = manifest[takeKeysFor(st)[0]] ?? manifest[pathFor(st.clip)];
            const saved = entry?.sourceChoices?.[synth ? 'synth' : 'sample'];
            if (!saved) {
                say('No previous source is saved for this voice.');
                return false;
            }
            const loc = voiceLocatorFor(st, engine.scriptStatements);
            let next = setVoiceSource(script, loc, saved.prompt ? { genPrompt: saved.prompt, synth: saved.synth } : { clip: saved.clip, synth: saved.synth });
            if (next && saved.recordings) {
                const statements = tryParse(next).statements;
                const target = statements?.find(o => st.sourceId ? o.sourceId === st.sourceId : o.sourceLine === st.sourceLine);
                if (!target || !statements)
                    return false;
                next = upsertVoiceProperty(next, voiceLocatorFor(target, statements), 'recordings', JSON.stringify(saved.recordings));
            }
            if (!next)
                return false;
            const restored = tryParse(next).statements?.find(o => st.sourceId ? o.sourceId === st.sourceId : o.sourceLine === st.sourceLine);
            const destination = restored && manifest[takeKeysFor(restored)[0]];
            if (destination)
                destination.sourceChoices = { ...entry.sourceChoices, [st.synth ? 'synth' : 'sample']: { clip: st.clipToken ?? st.clip, ...(st.genPrompt ? { prompt: st.genPrompt } : {}), synth: st.synth, recordings: st.recordings } };
            return applyScript(next, 'Restore previous source', { kind: 'source', detail: { voice: voiceContext(i), synth } });
        },
        published: !authoring,
        openEdit: i => { const sid = engine.scriptStatements[i]?.sourceId; return sid ? openEdit({ sound: sid }) : false; },
        statement: i => engine.scriptStatements[i],
        hear(i) {
            const st = engine.scriptStatements[i];
            const report = engine.levelReport();
            const v = report.voices.find(x => x.statementIndex === i);
            const occ = v?.path ? v.path.occlusionLossDb / OCCLUSION_FULL_DB : 0;
            return {
                receivedDb: v && Number.isFinite(v.receivedDb) ? v.receivedDb : null,
                emissionDb: v && Number.isFinite(v.emissionDb) ? v.emissionDb : null,
                floorDb: Number.isFinite(report.floorDb) ? report.floorDb : null,
                around: isAround(st),
                path: { line: !!st?.line, distanceProfile: st?.distanceProfile ?? null, occlusion01: occ },
            };
        },
        levelControl(i) {
            const st = engine.scriptStatements[i];
            return levelMovable(st) ? levelFader(`card:${st.sourceId}`, nameOf(st), [st.sourceId]) : null;
        },
        script: () => script,
        situation(i) {
            const stmts = engine.scriptStatements, st = stmts[i];
            const key = (o) => recordingKey(o);
            const mine = st ? key(st) : '';
            const same = st ? [st, ...stmts.filter(o => o !== st && key(o) === mine)].filter(o => levelMovable(o)).map(o => o.sourceId) : [];
            const report = engine.levelReport();
            const heard = report.voices.filter(v => v.audible && Number.isFinite(v.receivedDb));
            // its nearest voice: where you stand from it, what it emits, the path it reaches you by
            const mineAll = report.voices.filter(v => { const o = stmts[v.statementIndex]; return !!o && key(o) === mine; });
            const near = mineAll.filter(v => v.path).sort((a, b) => a.path.distanceM - b.path.distanceM)[0] ?? mineAll[0];
            const k = st ? soundKind(st) : 'place';
            const hearing = hearNow();
            let covered = null;
            for (const v of mineAll) {
                const a = hearing.get(v.statementIndex);
                if (!a)
                    continue;
                if (a.marginDb >= 0) {
                    covered = null;
                    break;
                }
                const by = a.maskerId === null ? null : stmts[a.maskerId];
                if (!covered || a.marginDb > covered.marginDb)
                    covered = { by: by ? nameOf(by) : 'the rest of the scene', marginDb: a.marginDb };
            }
            let receivedDb = null;
            const others = new Map();
            for (const v of heard) {
                const o = stmts[v.statementIndex];
                if (!o)
                    continue;
                const k = key(o);
                if (k === mine) {
                    receivedDb = Math.max(receivedDb ?? -Infinity, v.receivedDb);
                    continue;
                }
                const g = others.get(k) ?? { sourceIds: [], label: nameOf(o), receivedDb: -Infinity };
                if (o.sourceId && !g.sourceIds.includes(o.sourceId))
                    g.sourceIds.push(o.sourceId);
                g.receivedDb = Math.max(g.receivedDb, v.receivedDb);
                others.set(k, g);
            }
            const placedKind = k === 'place' || k === 'moving' || k === 'contact';
            return {
                label: st ? nameOf(st) : '', sourceId: st?.sourceId ?? null, sameRecording: same, receivedDb, levelMovable: levelMovable(st),
                others: [...others.values()].sort((a, b) => b.receivedDb - a.receivedDb),
                placed: placedKind, distanceM: placedKind && near?.path ? near.path.distanceM : null,
                emissionDb: near && Number.isFinite(near.emissionDb) ? near.emissionDb : null,
                floorDb: Number.isFinite(report.floorDb) ? report.floorDb : null,
                path: { line: !!st?.line, distanceProfile: st?.distanceProfile ?? null, occlusion01: near?.path ? near.path.occlusionLossDb / OCCLUSION_FULL_DB : 0 },
                covered,
                every: st && st.kind === 'oneshot' && !st.every.isNull ? { min: st.every.min, max: st.every.max } : null,
                // one recording the find can replace: not a per-surface bank (footsteps on each floor)
                canFind: !!st && !(st.kind === 'trigger' && isTemplatePrompt(st.genPrompt)) && !st.entityId,
            };
        },
        trim: trimSourceLevels,
        applyScript: (next, label, edit) => applyScript(next, label, edit),
        record: (kind, detail) => { record(kind, detail); },
        // a draft's audio replaces the buffer and crossfades a loop already playing it, so a candidate
        // is heard on the voice at once, and putting it back moves the voice back
        draftEngine: {
            loadScript: t => engine.loadScript(t),
            getAudioBuffers: () => engine.getAudioBuffers(),
            setAudioBuffer: (k, b) => engine.replaceAudioBuffer(k, b),
            removeAudioBuffer: k => engine.removeAudioBuffer(k),
        },
        schedule: run => { requestAnimationFrame(run); },
        // the card being edited plays now: every voice of its recording held audible (one card at a time, so the last to ask owns it)
        listen(i, on) {
            if (!on) {
                if (listenHeldBy === i) {
                    listenHeldBy = null;
                    engine.holdAudible(null);
                }
                return;
            }
            const st = engine.scriptStatements[i];
            if (!st)
                return;
            const k = recordingKey(st);
            const ids = engine.scriptStatements.filter(o => recordingKey(o) === k && o.sourceId).map(o => o.sourceId);
            listenHeldBy = i;
            engine.holdAudible(ids.length ? ids : st.sourceId ? [st.sourceId] : null);
        },
        fireNow: i => engine.fireNow(i),
        durationS(i) {
            const st = engine.scriptStatements[i];
            if (!st)
                return 1;
            return engine.getAudioBuffers().get(takeKeyAt(st, 0))?.duration ?? engine.getAudioBuffers().get(st.clip)?.duration ?? 1;
        },
        silentReason(i) {
            const st = engine.scriptStatements[i];
            const v = engine.levelReport().voices.find(x => x.statementIndex === i);
            return st ? quietReason(i, v).text || 'it is not playing' : 'it is not playing';
        },
        dialContext(i) { const st = engine.scriptStatements[i]; return { kind: st ? soundKind(st) : 'place', room: st?.roomName ?? null }; },
        locator(i) { return voiceLocatorFor(engine.scriptStatements[i], engine.scriptStatements); },
        ask(i, text, proposal) {
            const st = engine.scriptStatements[i];
            return new Promise(resolve => {
                let done = false;
                const once = (r) => { if (!done) {
                    done = true;
                    resolve(r);
                } };
                if (!st?.sourceId) {
                    once({ kind: 'say', text: 'This sound has no source id, so SATIE cannot be asked about it alone; ask in the conversation.' });
                    return;
                }
                const ids = proposal?.target.length ? proposal.target : [st.sourceId];
                const chips = ids.map(id => ({ kind: 'sound', id, label: nameOf(engine.scriptStatements.find(s => s.sourceId === id) ?? st) }));
                const message = proposal ? `Refine this uncommitted proposal: ${proposal.text}\nThe supplied script is the proposal, including any dial adjustments, not the saved scene. Return a revised proposal; nothing has been kept yet.\n\n${text}` : text;
                void sendChat(message, false, proposal ? text : undefined, undefined, undefined, undefined, true, false, { chips, surface: 'card', ...(proposal ? { proposal } : {}), onCard: once })
                    .then(() => once({ kind: 'none' }), e => once({ kind: 'say', text: `SATIE could not answer: ${e instanceof Error ? e.message : String(e)}` }));
            });
        },
        continueInChat(i) {
            const st = engine.scriptStatements[i];
            if (st?.sourceId)
                askAbout([{ kind: 'sound', id: st.sourceId, label: nameOf(st) }]);
            else
                showChat();
        },
        recordingName(i) {
            const st = engine.scriptStatements[i];
            if (!st)
                return null;
            const entry = manifest[takeKeyAt(st, 0)] ?? manifest[pathFor(st.clip)];
            return entry?.name ?? (st.isGenerated ? null : st.clip.replace(/^.*\//, '')) ?? null;
        },
        async findStart(i) {
            const st = engine.scriptStatements[i];
            if (!st)
                return { kind: 'words', text: 'a sound' };
            const key = takeKeyAt(st, 0);
            const entry = manifest[key] ?? manifest[pathFor(st.clip)];
            const name = nameOf(st);
            if (entry?.sampleId)
                return { kind: 'reference', sampleId: entry.sampleId };
            const buffer = engine.getAudioBuffers().get(key) ?? engine.getAudioBuffers().get(st.clip);
            if (buffer) {
                try {
                    return { kind: 'audio', base64: await excerptBase64(buffer, 10), hint: name };
                }
                catch { /* fall back to words */ }
            }
            return { kind: 'words', text: (st.genPrompt ?? name).replace(/,\s*(close|dry)\b.*$/i, '').trim() || name };
        },
        findRoutes: {
            async find(req) {
                const r = await fetch(findUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }).then(x => x.json());
                if (!r.ok)
                    throw new Error(r.error ?? 'the find did not answer');
                return r;
            },
            async vary(req) {
                const r = await fetch(varyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }).then(x => x.json());
                if (!r.ok)
                    throw new Error(r.error ?? 'Generate did not answer');
                return r;
            },
            async log(req) { try {
                await fetch(`${findUrl}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
            }
            catch { /* best effort */ } },
        },
        decode: url => bufferFor(url),
        takeKeys(i) {
            const st = engine.scriptStatements[i];
            if (!st)
                return [];
            const k = recordingKey(st), keys = new Set();
            for (const o of engine.scriptStatements)
                if (recordingKey(o) === k)
                    for (let t = 0; t < (o.isGenerated ? Math.max(1, o.variants) : 1); t++)
                        keys.add(takeKeyAt(o, t));
            return [...keys];
        },
        sharedCount(i) { const st = engine.scriptStatements[i]; if (!st)
            return 0; const k = recordingKey(st); return new Set(engine.scriptStatements.filter(o => recordingKey(o) === k).map(o => o.sourceId ?? o)).size; },
        things: () => (layer?.hosts?.() ?? engine.externalHosts.map(id => ({ id, label: undefined }))).filter(h => h.id !== layer?.listenerHost?.()).map(h => ({ id: h.id, label: hostName(h.id) })),
        thingName: id => hostName(id),
        ...(layer?.editShape ? { editShape: (shape, h) => layer.editShape(shape, h) } : {}),
        entity(id) { const def = engine.entities.find(e => e.id === id); return def ? { def, members: [...def.memberIndices] } : null; },
        openCrowd(id) { openProps = null; openCrowd = id; finder = null; buildMixer(); },
        openSound(i) { openCrowd = null; openProps = i; finder = null; buildMixer(); },
        soundName: i => { const st = engine.scriptStatements[i]; return st ? nameOf(st) : ''; },
        versionCount: i => { const st = engine.scriptStatements[i]; return st ? versionRefs(st).length : 0; },
        previewAlone(url, btn) { togglePreview(btn, el('i'), -1, url, false, { alone: true }); },
        useFound: (i, c, scope, ctx) => useFound(i, c, scope, ctx),
        sections: i => { const st = engine.scriptStatements[i]; return st ? buildSoundPanel(i, st) : []; },
    };
    /**
     * Use this: every voice of the recording (or this one) now plays the candidate, named in the
     * script by its library name; samples.json pins that exact file. The binding goes in BEFORE the
     * script commit, so `applyScript`'s history version holds both (undo brings the old sound back);
     * the old entry is kept for undo and for voices that still name it.
     */
    /**
     * A voice's versions as take-bank references (clip tokens, `Audio/` left off): its bank, else its
     * generated takes by their keys, else its one recording.
     */
    function versionRefs(st) {
        const strip = (k) => k.replace(/^Audio\//, '');
        if (st.recordings?.takes)
            return st.recordings.takes.map(strip);
        if (st.isGenerated)
            return Array.from({ length: Math.max(1, st.variants) }, (_, k) => strip(takeKeyAt(st, k)));
        return [st.clip];
    }
    async function useFound(i, c, scope, ctx) {
        const st = engine.scriptStatements[i];
        if (!st)
            return false;
        const version = documentVersion;
        let buffer;
        try {
            buffer = await bufferFor(c.url);
        }
        catch (e) {
            say(`That sound could not load: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
        if (documentVersion !== version) {
            say('The scene changed while the sound loaded; choose it again.');
            return false;
        }
        if (scope === 'add-version') {
            // one more version: its take bank names every version it had, then this one (the bank decides now)
            const refs = versionRefs(st);
            if (refs.length >= MAX_BANK_TAKES) {
                say(`It already has ${count(MAX_BANK_TAKES, 'take')}, the most a ${word('sound')} can have; remove one first.`);
                return false;
            }
            if (refs.includes(c.clip)) {
                say(`That one is already one of its ${word('take', 2)}.`);
                return false;
            }
            const loc = voiceLocatorFor(st, engine.scriptStatements);
            let added = upsertVoiceProperty(script, loc, 'recordings', JSON.stringify({ takes: [...refs, c.clip] }));
            if (added && st.isGenerated && st.variants > 1)
                added = removeVoiceProperty(added, loc, 'variants') ?? added;
            if (!added) {
                say(`That ${word('take')} could not be added; edit its script.`);
                return false;
            }
            const key = pathFor(c.clip), previous = manifest[key];
            manifest[key] = { url: c.url, source: 'library', name: c.name, license: c.license, ...(c.attribution ? { attribution: c.attribution } : {}), sampleId: c.sampleId };
            engine.setAudioBuffer(key, buffer);
            if (!applyScript(added, `${nameOf(st)}: one more ${word('take')}, ${c.name.slice(0, 40)}`, { kind: 'add_take', detail: { voice: voiceContext(i), to: { clip: c.clip, sampleId: c.sampleId }, findId: ctx.findId, round: ctx.round, via: 'find' } })) {
                if (previous)
                    manifest[key] = previous;
                else
                    delete manifest[key];
                return false;
            }
            if (ctx.findId)
                void cardHost.findRoutes.log?.({ findId: ctx.findId, use: { round: ctx.round, sampleId: c.sampleId, scope } });
            return true;
        }
        const k = recordingKey(st);
        const reach = scope === 'every-voice' ? engine.scriptStatements.filter(o => recordingKey(o) === k) : [st];
        // one voice per source id (the copies of an `N *` block are one), each found by its id
        const seen = new Set(), voices = [];
        for (const o of reach) {
            if (!o.sourceId) {
                if (o !== st)
                    continue;
                voices.push({ loc: voiceLocatorFor(o, engine.scriptStatements), generated: o.isGenerated, variants: o.variants });
                continue;
            }
            if (seen.has(o.sourceId))
                continue;
            seen.add(o.sourceId);
            voices.push({ loc: voiceLocatorFor(o, engine.scriptStatements), generated: o.isGenerated, variants: o.variants });
        }
        const next = useThisScript(script, voices, c);
        if (!next) {
            say('That sound could not be put in; edit its script.');
            return false;
        }
        const key = pathFor(c.clip), previous = manifest[key];
        manifest[key] = { url: c.url, source: 'library', name: c.name, license: c.license, ...(c.attribution ? { attribution: c.attribution } : {}), sampleId: c.sampleId };
        engine.setAudioBuffer(key, buffer);
        const name = nameOf(st);
        if (!applyScript(next, `${name}: now ${c.name.slice(0, 48)}`, { kind: 'swap', detail: { voice: voiceContext(i), to: { clip: c.clip, sampleId: c.sampleId }, scope, findId: ctx.findId, round: ctx.round, via: 'find' } })) {
            if (previous)
                manifest[key] = previous;
            else
                delete manifest[key];
            return false;
        }
        if (ctx.findId)
            void cardHost.findRoutes.log?.({ findId: ctx.findId, use: { round: ctx.round, sampleId: c.sampleId, scope } });
        return true;
    }
    /** What a voice plays, for "the same recording": its words if it is generated, else its clip. */
    function recordingKey(o) {
        return o.isGenerated ? `gen:${(o.genPrompt ?? '').trim().replace(/\s+/g, ' ').toLowerCase()}` : `clip:${o.clip}`;
    }
    /** The crowd's card (an entity block) in the floating inspector. */
    let openCrowd = null;
    function mountCrowdInspector(id) {
        if (root.querySelector('.satie-dt-addsheet')) {
            layer?.stopPlacing?.();
            root.querySelector('.satie-dt-addsheet')?.remove();
        }
        const head = el('div', 'ih');
        const title = el('div', 'it');
        title.append(el('span', 'sw'), el('span', 'n', id.replace(/_/g, ' ')), el('small', undefined, 'a crowd'));
        const x = el('button', 'x', '×');
        x.title = 'close (every change is already saved)';
        x.addEventListener('click', () => { openCrowd = null; buildMixer(); });
        head.append(title, x);
        card?.close();
        card = mountCrowd(cardHost, id);
        inspector.replaceChildren(head, card.el);
        inspector.dataset.i = `crowd:${id}`;
        inspector.hidden = false;
    }
    function mountInspector(i, st) {
        // the editor and the add sheet share one place: opening one ends the other (and its aiming)
        if (root.querySelector('.satie-dt-addsheet')) {
            layer?.stopPlacing?.();
            root.querySelector('.satie-dt-addsheet')?.remove();
        }
        const top = inspector.scrollTop, same = inspector.dataset.i === String(i);
        // an open find or proposal survives a commit (a Volume move): refresh the card in place, never rebuild it
        if (same && openSource === (st.sourceId ?? null) && card?.holding()) {
            card.refresh(true);
            inspector.hidden = false;
            return;
        }
        const head = el('div', 'ih');
        const title = el('div', 'it');
        title.append(el('span', 'sw'), el('span', 'n', nameOf(st)), el('small', undefined, st.attachRef === 'listener' ? 'with you' : st.hostRef && !isAround(st) ? onHost(st.hostRef) : isAround(st) ? 'all around' : playsWhereFired(st) ? 'where the game sets it off' : 'in the scene'));
        title.style.setProperty('--c', voiceColor(i));
        const x = el('button', 'x', '×');
        x.title = 'close (every change is already saved)';
        x.addEventListener('click', () => { openProps = null; finder = null; buildMixer(); });
        head.append(title, x);
        const open = new Set([...inspector.querySelectorAll('details[open] > summary')].map(x => x.textContent));
        // the card is keyed by its source, not its index: a reload that adds or removes a voice moves the index
        openSource = st.sourceId ?? null;
        card?.close();
        card = mountCard(cardHost, i);
        inspector.replaceChildren(head, card.el);
        if (same)
            for (const d of inspector.querySelectorAll('details'))
                if (open.has(d.querySelector('summary')?.textContent ?? ''))
                    d.open = true;
        inspector.dataset.i = String(i);
        inspector.hidden = false;
        if (same)
            inspector.scrollTop = top;
    }
    function buildSoundPanel(i, st) {
        const box = el('div', 'satie-dt-sound');
        const part = (title, detail) => { const h = el('div', 'sh'); h.append(el('span', undefined, title), ...(detail ? [el('small', undefined, detail)] : [])); return h; };
        // how its versions take turns (and ring on, or start): the pills that are about playing the recording
        const playback = el('section');
        playback.dataset.section = 'playback';
        playback.setAttribute('aria-label', `How its ${word('take', 2)} play`);
        playback.appendChild(part(`how its ${word('take', 2)} play`, 'changes how the recording plays, not the recording itself'));
        const perText = st.kind === 'trigger' && isTemplatePrompt(st.genPrompt);
        const takesN = perText ? templateBankSize(st) : st.isGenerated ? Math.max(1, st.variants) : 1;
        const status = el('div', 'status'); // progress of anything this editor asked for (new takes)
        // asking about this sound is the card's say-it box (card/view.ts): its replies land on the card
        box.appendChild(part('sound sample', perText ? 'takes for each surface' : st.isGenerated ? `${takesN} saved take${takesN === 1 ? '' : 's'}` : 'a recording'));
        // its description: the words its takes are made from (a recording has its name)
        if (st.isGenerated && st.genPrompt) {
            // the words its takes are made from: read, and changed only on purpose (new words = new takes)
            const d = el('div', 'desc');
            const words = el('div', 'words', st.genPrompt);
            words.title = st.genPrompt;
            const change = el('button', 'link', 'make different takes…');
            change.title = 'describe it differently: SATIE makes new takes from the new words';
            const ta = el('textarea');
            ta.rows = 3;
            ta.value = st.genPrompt;
            ta.spellcheck = false;
            ta.setAttribute('aria-label', 'what its takes are made from');
            ta.hidden = true;
            const remake = el('button', 'pill', 'make new takes from these words');
            remake.hidden = true;
            change.addEventListener('click', () => { words.hidden = true; change.hidden = true; ta.hidden = false; ta.focus(); });
            ta.addEventListener('input', () => { remake.hidden = ta.value.trim() === st.genPrompt; });
            ta.addEventListener('keydown', e => e.stopPropagation());
            remake.addEventListener('click', () => {
                const next = setVoiceSource(script, voiceLocatorFor(st, engine.scriptStatements), { genPrompt: ta.value.trim().replace(/\s+/g, ' ') });
                if (!next) {
                    say('Could not change the words of this sound; edit its script.');
                    return;
                }
                if (applyScript(next, `${nameOf(st)}: new words`, { kind: 'describe', detail: { voice: voiceContext(i), to: ta.value.trim() } }))
                    void fetchMissing();
            });
            d.append(words, change, ta, remake);
            box.appendChild(d);
        }
        else
            box.appendChild(el('div', 'desc', describeOf(st)));
        box.appendChild(status);
        // its takes, each heard and replaceable on its own; per surface for a per-text voice
        let menuFor = false;
        const takeRow = (label, keys, target, all) => {
            const r = el('div', 'takes');
            r.appendChild(el('span', 'tl', label));
            keys.forEach((key, k) => {
                const buffer = engine.getAudioBuffers().get(key);
                const has = !!buffer;
                const chip = el('span', 'tk');
                chip.dataset.missing = has ? '0' : '1';
                const pv = el('button', 'pv');
                pv.dataset.state = 'idle';
                pv.innerHTML = ICON.play;
                pv.disabled = !has;
                pv.title = has ? `hear take ${k + 1} once, without playback variation${manifest[key]?.name ? `: ${manifest[key].name}` : ''}` : 'no sound for this take yet';
                pv.setAttribute('aria-label', has ? `Hear take ${k + 1} once` : `Take ${k + 1} not loaded`);
                pv.addEventListener('click', e => { e.stopPropagation(); playTake(pv, i, key); });
                const n = el('button', 'tn', `take ${k + 1}${buffer ? ` · ${buffer.duration.toFixed(1)} s` : ''}`);
                n.title = has ? `take ${k + 1}: replace it, use only it, or remove it` : `take ${k + 1} is not made yet`;
                n.addEventListener('click', () => { if (menuFor) {
                    takeMenu = takeMenu?.i === i && takeMenu.k === k ? null : { i, k };
                    finder = null;
                }
                else
                    finder = { i, target: target(k) }; buildMixer(); });
                if (takeMenu?.i === i && takeMenu.k === k)
                    chip.dataset.open = '1';
                chip.append(pv, n);
                r.appendChild(chip);
            });
            if (all) {
                const b = el('button', 'pill', 'replace all');
                b.title = `new takes for ${label}`;
                b.addEventListener('click', () => { finder = { i, target: all }; buildMixer(); });
                r.appendChild(b);
            }
            return r;
        };
        if (perText) {
            const texts = textsOf(st);
            if (!texts.length)
                box.appendChild(el('div', 'satie-dt-note', 'the game says which surfaces this plays on; none are declared in the scene contract'));
            // one line per surface (its versions open on demand): eight surfaces of six chips each was a wall
            for (const text of texts) {
                const keys = Array.from({ length: takesN }, (_, k) => takeKeyAt(st, k, text));
                const label = text.replace(/_/g, ' ');
                const id = `${st.sourceId ?? i}:${text}`, open = openSurface === id;
                const have = keys.filter(k => engine.getAudioBuffers().has(k));
                const line = el('div', 'surf');
                const tri = el('button', 'tri', open ? '▾' : '▸');
                tri.title = `${open ? 'hide' : 'show'} its ${word('take', 2)}`;
                const pv = el('button', 'pv');
                pv.dataset.state = 'idle';
                pv.innerHTML = ICON.play;
                pv.disabled = !have.length;
                pv.title = `hear one of its ${word('take', 2)}`;
                pv.addEventListener('click', e => { e.stopPropagation(); playTake(pv, i, have[Math.floor(Math.random() * have.length)]); });
                line.append(tri, el('span', 'sl', label), el('small', undefined, `${have.length} of ${count(keys.length, 'take')}`), pv);
                const toggle = () => { openSurface = open ? null : id; buildMixer(); };
                tri.addEventListener('click', toggle);
                line.addEventListener('click', e => { if (e.target === line || e.target.classList.contains('sl'))
                    toggle(); });
                box.appendChild(line);
                if (open)
                    box.appendChild(takeRow(label, keys, k => ({ kind: 'take', key: keys[k], label: `${label} take ${k + 1}` }), { kind: 'surface', text, label }));
            }
        }
        else if (st.isGenerated) {
            const keys = Array.from({ length: takesN }, (_, k) => takeKeyAt(st, k));
            menuFor = true;
            const r = takeRow('takes', keys, k => ({ kind: 'take', key: keys[k], label: `${word('take')} ${k + 1}` }));
            menuFor = false;
            // how many takes it varies between, here with the takes themselves; a new one is made at once
            const less = el('button', 'pill', '−'), more = el('button', 'pill', '+');
            less.title = `one ${word('take')} fewer`;
            more.title = `one more ${word('take')}, made from its words`;
            less.disabled = takesN <= 1;
            const setTakes = (n) => {
                const next = n <= 1 ? removeVoiceProperty(script, voiceLocatorFor(st, engine.scriptStatements), 'variants') : upsertVoiceProperty(script, voiceLocatorFor(st, engine.scriptStatements), 'variants', String(n));
                if (next && applyScript(next, `${nameOf(st)}: ${n} take${n === 1 ? '' : 's'}`, { kind: 'property', detail: { voice: voiceContext(i), key: 'variants', value: String(n) } }) && n > takesN)
                    void fetchMissing();
            };
            less.addEventListener('click', () => setTakes(takesN - 1));
            // one more version: found (or generated) by listening, from the card's "how much it varies" (no "+ new" from the same words)
            more.textContent = `find another ${word('take')}…`;
            more.title = `hear others like it and add the one you want as one more ${word('take')}`;
            more.addEventListener('click', () => card?.findVersion());
            // versions are for a sound that plays again and again (a step, a bell): a loop plays one all the way
            const repeats = st.kind !== 'loop';
            if (repeats || takesN > 1)
                r.append(less, ...(repeats ? [more] : []));
            box.appendChild(r);
            // how its versions take turns, and what happens when it plays again before the last one ended
            if (repeats && takesN > 1) {
                const turns = el('div', 'tturn');
                turns.appendChild(el('span', 'tl', 'take turns'));
                for (const [order, label, title] of [[false, 'at random', 'a random one each time, never the same twice in a row'], [true, 'in order', '1, 2, 3 and round again']]) {
                    const b = el('button', 'pill', label);
                    b.title = title;
                    b.dataset.on = st.takesInOrder === order ? '1' : '0';
                    b.addEventListener('click', () => { if (st.takesInOrder !== order)
                        setFlag(i, 'in_order', order, `${word('take', 2)} ${order ? 'in order' : 'at random'}`); });
                    turns.appendChild(b);
                }
                playback.appendChild(turns);
            }
            if (st.kind === 'oneshot') {
                const ring = el('div', 'tturn');
                ring.appendChild(el('span', 'tl', 'played again while ringing'));
                for (const [on, label, title] of [[true, 'both ring', 'the new one starts and the last one rings on'], [false, 'the last one stops', 'the new one cuts the last one off']]) {
                    const b = el('button', 'pill', label);
                    b.title = title;
                    b.dataset.on = st.overlap === on ? '1' : '0';
                    b.addEventListener('click', () => { if (st.overlap !== on)
                        setFlag(i, 'overlap', on, on ? 'rings on when played again' : 'stops when played again'); });
                    ring.appendChild(b);
                }
                playback.appendChild(ring);
            }
            else if (st.kind === 'loop') {
                const start = el('div', 'tturn');
                start.appendChild(el('span', 'tl', 'starts'));
                for (const [on, label, title] of [[false, 'from its beginning', 'every time it starts, from the top'], [true, 'anywhere in it', 'from a random point, so two of them never sound in step']]) {
                    const b = el('button', 'pill', label);
                    b.title = title;
                    b.dataset.on = st.randomStart === on ? '1' : '0';
                    b.addEventListener('click', () => { if (st.randomStart !== on)
                        setFlag(i, 'randomstart', on, on ? 'starts anywhere in it' : 'starts from its beginning'); });
                    start.appendChild(b);
                }
                playback.appendChild(start);
            }
            const missing = keys.filter(k => !engine.getAudioBuffers().has(k)).length;
            box.appendChild(el('div', 'hint', `${st.kind === 'loop'
                ? (takesN > 1 ? `a loop plays one ${word('take')} all the way; which of these ${takesN} starts is picked when it starts` : `a loop plays this one ${word('take')} all the way`)
                : takesN > 1 ? `each time it plays, one of these ${count(takesN, 'take')} is picked, so repeats do not sound the same` : `one ${word('take')}: it sounds the same every time it plays · + adds another for variety`}${missing ? ` · ${missing} not made yet` : ''}`));
            if (missing) {
                const mk = el('button', 'pill', `make the ${missing} missing`);
                mk.addEventListener('click', () => void fetchMissing());
                box.appendChild(mk);
            }
            // one take's choices
            if (takeMenu?.i === i && takeMenu.k < takesN) {
                const k = takeMenu.k, has = engine.getAudioBuffers().has(keys[k]);
                const m = el('div', 'tmenu');
                m.appendChild(el('span', 'tl', `take ${k + 1}`));
                const rep = el('button', 'pill', has ? 'replace with another sound…' : 'choose a sound for it…');
                rep.addEventListener('click', () => { takeMenu = null; finder = { i, target: { kind: 'take', key: keys[k], label: `take ${k + 1}` } }; buildMixer(); });
                m.appendChild(rep);
                if (has && takesN > 1) {
                    const only = el('button', 'pill', 'use only this one');
                    only.title = 'it plays this take every time (the others are put aside)';
                    only.addEventListener('click', () => { takeMenu = null; keepOnlyTake(i, st, keys, k); });
                    const rm = el('button', 'pill', 'remove it');
                    rm.title = 'one take fewer; the others stay';
                    rm.addEventListener('click', () => { takeMenu = null; removeTake(i, st, keys, k); });
                    m.append(only, rm);
                }
                box.appendChild(m);
            }
        }
        else {
            box.appendChild(takeRow('recording', [pathFor(st.clip)], () => ({ kind: 'whole', label: 'the recording' })));
        }
        if (finder?.i === i) {
            const t = finder.target;
            const f = el('div', 'finder');
            const fh = el('div', 'fh');
            fh.append(el('span', undefined, `replace ${t.label}`));
            const x = el('button', 'x', '×');
            x.title = 'close';
            x.addEventListener('click', () => { finder = null; buildMixer(); });
            fh.appendChild(x);
            f.append(fh, buildDrawer(i, st, (clip, entry, note, describe) => {
                if (t.kind === 'whole') {
                    finder = null;
                    if (describe && entry.source === 'generated')
                        putNewTake(i, describe, entry, note);
                    else
                        useClip(i, clip, entry, note);
                    return;
                }
                if (t.kind === 'addtake') {
                    // one more version, and the sound you chose is it
                    finder = null;
                    const n = takesN + 1;
                    const next = upsertVoiceProperty(script, voiceLocatorFor(st, engine.scriptStatements), 'variants', String(n));
                    if (!next || !applyScript(next, `${nameOf(st)}: a ${word('take')} you chose`, { kind: 'add_take', detail: { voice: voiceContext(i), from: { clip, ...entry } } }))
                        return;
                    const ns = engine.scriptStatements[i];
                    if (ns)
                        void replaceTake(ns, takeClipPath(ns, n - 1), entry, `${word('take')} ${n}`);
                    return;
                }
                if (t.kind === 'take') {
                    void replaceTake(st, t.key, entry, t.label);
                    return;
                }
                // a whole surface: the chosen take first, the rest made from the words it was made from
                const cand = { id: '', name: String(entry.name ?? clip), from: entry.source === 'library' ? 'library' : 'new take', clip, url: entry.url, ...(describe ? { describe } : {}) };
                finder = null;
                void takesFor(st.sourceId ? [st.sourceId] : [], cand, t.text, { role: 'satie', text: '' }).then(ok => { if (!ok)
                    say('That surface could not take the sound.'); buildMixer(); });
            }, t.kind === 'surface' && st.genPrompt ? st.genPrompt.replace(/\{\w+\}/g, t.text.replace(/_/g, ' ')) : undefined));
            box.appendChild(f);
        }
        // the same sound elsewhere: a copy plays the same takes (a new take for one is a new take for both)
        const norm = (t) => (t ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
        const sameSound = engine.scriptStatements.filter((o, j) => j !== i && o.kind === st.kind && (st.isGenerated ? o.isGenerated && norm(o.genPrompt) === norm(st.genPrompt) : !o.isGenerated && o.clip === st.clip));
        if (sameSound.length)
            box.appendChild(el('div', 'hint', `recordings shared with ${sameSound.slice(0, 3).map(o => nameOf(o)).join(', ')}${sameSound.length > 3 ? ` and ${sameSound.length - 3} more` : ''}. Replacing a shared take affects its other users; pitch, level, effects and timing belong to each sound.`));
        if (playback.children.length > 1)
            box.appendChild(playback);
        // where it is, and moving it by aiming in the world (no typing coordinates)
        box.appendChild(part('where it is'));
        const where = el('div', 'where');
        const c = st.hasPlacement ? [0, 1, 2].map(k => { const a = [st.areaMin.x, st.areaMin.y, st.areaMin.z][k], z = [st.areaMax.x, st.areaMax.y, st.areaMax.z][k]; return Math.round((a + z) * 5) / 10; }) : null;
        const placeOf = c ? ` at (${c.join(', ')})` : '';
        const sk = soundKind(st);
        where.appendChild(el('span', undefined, st.attachRef === 'listener' ? 'with you, wherever you go' : isAround(st) ? 'all around you' : st.hostRef ? (st.hostRef === layer?.listenerHost?.() ? 'with you, wherever you go' : onHost(st.hostRef)) : placeOf ? `a spot${placeOf}` : playsWhereFired(st) ? 'where the game sets it off, each time' : 'in the scene'));
        // yours plays where you are, a background is everywhere, and a sound the game places each time is
        // nowhere until it does: nothing to show, move or copy
        if (layer?.startPlacing && sk !== 'around' && sk !== 'yours' && sk !== 'contact') {
            const go = el('button', 'pill', 'show it');
            go.title = 'turn to face it, so you can drag it';
            go.addEventListener('click', () => focusVoices([i]));
            const mv = el('button', 'pill', 'move it…');
            mv.title = 'aim at where it should go and click: on a thing (it moves with it), or hold Shift for that exact spot; scroll for height';
            mv.addEventListener('click', () => moveSound(i, st, mv));
            where.append(go, mv);
        }
        if (layer?.startPlacing && !st.entityId && sk !== 'around' && sk !== 'yours') {
            const dup = el('button', 'pill', 'copy it to…');
            dup.title = 'the same sound somewhere else: aim at a thing and click, Shift for an exact spot (no new takes)';
            dup.addEventListener('click', () => duplicateSound(i, st, dup));
            where.appendChild(dup);
        }
        box.appendChild(where);
        // or without aiming: on a thing by its name, or where in your words (to SATIE, a new conversation)
        if (sk !== 'around' && sk !== 'yours' && st.sourceId) {
            const alt = el('div', 'where');
            const on = el('select', 'wsel');
            on.title = 'put it on a thing, by name';
            on.appendChild(new Option('or put it on…', ''));
            for (const h of layer?.hosts?.() ?? [])
                if (h.id !== layer?.listenerHost?.() && h.id !== st.hostRef)
                    on.appendChild(new Option(hostName(h.id), h.id));
            on.addEventListener('change', () => { if (!on.value)
                return; const c = engine.scriptStatements.findIndex(x => x.sourceId === st.sourceId); const p = layer?.lookTarget?.(); applyPlace(c, st, { hostId: on.value, point: p?.point ?? [0, 0, 0], distanceM: 0, mode: 'thing' }); });
            const words = el('input', 'wtext');
            words.type = 'text';
            words.placeholder = 'or say where, in your words…';
            words.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key !== 'Enter' || !words.value.trim())
                    return;
                const said = words.value.trim();
                words.value = '';
                askAbout([{ kind: 'sound', id: st.sourceId, label: nameOf(st) }]);
                void sendChat(`Move this sound: ${said}`, false, `move it: ${said}`);
            });
            alt.append(on, words);
            box.appendChild(alt);
        }
        if (layer?.setEditing && sk !== 'around' && sk !== 'yours')
            box.appendChild(el('div', 'hint', 'drag its glowing dot in the world to move it · dropped on a thing it sticks to it and moves with it, hold Shift for that exact spot · scroll while dragging for height · Esc puts it back'));
        if (!st.entityId) {
            box.appendChild(part('when it plays'));
            box.appendChild(whenSection(i, st));
        }
        const sections = { 'sound sample': 'recording', 'sound layers': 'layers', 'where it is': 'location', 'when it plays': 'trigger' };
        let section = null;
        for (const child of [...box.children]) {
            if (child === playback) {
                section = null;
                continue;
            }
            const title = child.classList.contains('sh') ? child.firstElementChild?.textContent ?? '' : '';
            if (sections[title]) {
                section = el('section');
                section.dataset.section = sections[title];
                section.setAttribute('aria-label', title);
                box.insertBefore(section, child);
            }
            section?.appendChild(child);
        }
        // every other setting, folded: the registry's rows (one list; unset ones on demand), then its script
        const props = buildProps(i, st, cardOwns(st));
        box.append(props.advanced, ...(props.script ? [props.script] : []));
        return [box];
    }
    // ── placing by aiming ──
    const aimBar = el('div', 'satie-dt-aimbar');
    function showAimBar(text) {
        if (!text) {
            aimBar.remove();
            return;
        }
        aimBar.replaceChildren(el('span', undefined, text));
        const x = el('button', 'x', 'cancel');
        x.addEventListener('click', () => { layer?.stopPlacing?.(); showAimBar(null); });
        aimBar.appendChild(x);
        if (!aimBar.isConnected)
            body.before(aimBar);
    }
    const aimWords = (t) => !t ? 'nothing under the aim' : t.hostId ? onHost(t.hostId) : `this spot, ${Math.round(t.distanceM)} m away`;
    /** Move a sound by aiming: on a thing writes `at <id>` (it goes where the thing goes), a spot writes `place x y z`. */
    /** The button that started an aim stays lit (and says Esc cancels) until the aim ends. */
    function litWhileAiming(btn) {
        if (!btn)
            return () => { };
        const isBtn = btn instanceof HTMLButtonElement, was = btn.textContent;
        btn.dataset.on = '1';
        if (isBtn)
            btn.textContent = 'aiming… (Esc)';
        return () => { btn.dataset.on = '0'; if (isBtn)
            btn.textContent = was; };
    }
    function moveSound(i, st, btn) {
        const name = nameOf(st);
        const hint = (t) => `${name} → ${aimWords(t)} · click to place · Shift: this exact spot · scroll: height · Esc: cancel`;
        showAimBar(hint(null));
        const unlit = litWhileAiming(btn);
        layer?.startPlacing?.({ mode: 'thing', onChange: t => showAimBar(hint(t)), onCancel: () => { unlit(); showAimBar(null); }, onDone: t => { unlit(); showAimBar(null); if (t)
                applyPlace(i, st, t); } });
    }
    /**
     * When it plays, in the scene's own words: always, now and then, or when the game does something
     * (the contract's events, with what each means); only in some of the game's states; its level
     * following one of the game's signals. Every choice comes from the contract, nothing is a fixed
     * list. Being in a place is not something a sound can be tied to yet, and it says so.
     */
    function whenSection(i, st) {
        const box = el('div', 'when');
        const loc = () => voiceLocatorFor(st, engine.scriptStatements);
        const events = layer?.events?.() ?? [];
        // the game's signals, and where you are: the engine's own `in_<room>` for each room you can walk into
        const rooms = engine.placedRoomNames;
        const signals = [...(layer?.signals?.() ?? []),
            ...rooms.map(r => ({ name: `in_${r}`, description: `you inside the ${r.replace(/_/g, ' ')} (0 outside, 1 inside, eased as you walk in)`, min: 0, max: 1, label: `you inside the ${r.replace(/_/g, ' ')}` })),
            ...(rooms.length > 1 ? [{ name: 'indoors', description: 'you inside any of the rooms', min: 0, max: 1, label: 'you indoors' }] : [])];
        const now = st.kind === 'trigger' && st.eventName ? 'event' : st.kind === 'oneshot' ? 'sometimes' : 'always';
        const commit = (next, note, detail) => {
            if (!next || next === script)
                return;
            applyScript(next, `${nameOf(st)}: ${note}`, { kind: 'when', detail: { voice: voiceContext(i), ...detail } });
        };
        const starts = el('div', 'wrow');
        starts.appendChild(el('span', 'wl', 'starts'));
        const startOpts = el('div', 'wopts');
        starts.appendChild(startOpts);
        const chip = (key, label, title, go) => {
            const b = el('button', 'pill', label);
            b.dataset.on = now === key ? '1' : '0';
            b.title = title;
            b.addEventListener('click', () => { if (now !== key || key === 'event')
                go(); });
            startOpts.appendChild(b);
        };
        chip('always', 'always', 'it plays all the time (a loop)', () => {
            let next = setVoiceTrigger(script, loc(), 'loop');
            if (next)
                next = removeVoiceProperty(next, loc(), 'every') ?? next;
            commit(next, 'plays all the time', { to: 'always' });
        });
        chip('sometimes', 'now and then', 'it plays once in a while (every few seconds, at random)', () => {
            let next = setVoiceTrigger(script, loc(), 'oneshot');
            if (next && st.every.isNull)
                next = upsertVoiceProperty(next, loc(), 'every', '8to25') ?? next;
            commit(next, 'plays now and then', { to: 'sometimes' });
        });
        if (events.length) {
            const sel = el('select', 'wsel');
            sel.appendChild(new Option(now === 'event' ? '' : 'when the game does…', ''));
            for (const ev of events) {
                const o = new Option(`when ${ev.name.replace(/_/g, ' ')}`, ev.name);
                o.title = ev.description ?? '';
                sel.appendChild(o);
            }
            sel.value = now === 'event' ? st.eventName ?? '' : '';
            sel.dataset.on = now === 'event' ? '1' : '0';
            sel.addEventListener('change', () => {
                if (!sel.value)
                    return;
                let next = setVoiceTrigger(script, loc(), { event: sel.value });
                if (next)
                    next = removeVoiceProperty(next, loc(), 'every') ?? next;
                commit(next, `plays when ${sel.value.replace(/_/g, ' ')}`, { to: 'event', event: sel.value });
            });
            startOpts.appendChild(sel);
        }
        box.appendChild(starts);
        // how often and how regularly it plays are the card's dials (with the next minute drawn under them)
        if (now === 'sometimes')
            box.appendChild(el('div', 'hint', 'how often and how regularly: the dials at the top of this card'));
        if (now === 'event') {
            // how often it really plays: what the game did in the last minute
            const t = engine.currentTime;
            const fires = engine.eventLog.snapshot().filter(x => x.kind === 'fire' && x.statementIndex === i && x.t > t - 60);
            const last = fires.at(-1);
            box.appendChild(el('div', 'hint', fires.length ? `it played ${fires.length} time${fires.length === 1 ? '' : 's'} in the last minute · last ${Math.max(0, Math.round(t - last.t))} s ago` : 'it has not played in the last minute (the game decides when)'));
        }
        if (now === 'event' && st.eventName) {
            const ev = events.find(e => e.name === st.eventName);
            box.appendChild(el('div', 'hint', ev?.description ? `the game: ${ev.description}` : `the game sends "${st.eventName}"${ev ? '' : ', which the scene contract does not list'}`));
        }
        // only during some of the game's states: every state is a chip that stays (none chosen = any time),
        // and what happens outside them is said in words (the zone widget's chips vanished when you
        // turned the last one off, and "outside: muffled" meant nothing)
        const states = [...new Set([...(layer?.states?.() ?? []), ...(st.zones ?? [])])];
        if (states.length) {
            const z = el('div', 'wrow');
            z.appendChild(el('span', 'wl', 'only during'));
            const zo = el('div', 'wopts');
            z.appendChild(zo);
            const chosen = new Set(st.zones ?? []);
            const write = (names, strict) => {
                const next = names.length ? upsertVoiceProperty(script, loc(), 'zone', `${names.join(' ')}${strict ? ' strict' : ''}`) : removeVoiceProperty(script, loc(), 'zone');
                commit(next, names.length ? `plays during ${names.join(', ')}` : 'plays at any time', { to: 'states', states: names, strict });
            };
            for (const n of states) {
                const b = el('button', 'pill', n.replace(/_/g, ' '));
                b.dataset.on = chosen.has(n) ? '1' : '0';
                b.addEventListener('click', () => { const next = new Set(chosen); if (next.has(n))
                    next.delete(n);
                else
                    next.add(n); write([...next], st.zoneStrict); });
                zo.appendChild(b);
            }
            box.appendChild(z);
            if (chosen.size) {
                const o = el('div', 'wrow');
                o.appendChild(el('span', 'wl', 'otherwise'));
                const oo = el('div', 'wopts');
                o.appendChild(oo);
                for (const [strict, label, title] of [[true, 'silent', 'outside those states it does not play'], [false, 'faint, as through a wall', 'outside those states it is heard muffled, as if through a wall']]) {
                    const b = el('button', 'pill', label);
                    b.title = title;
                    b.dataset.on = st.zoneStrict === strict ? '1' : '0';
                    b.addEventListener('click', () => { if (st.zoneStrict !== strict)
                        write([...chosen], strict); });
                    oo.appendChild(b);
                }
                box.appendChild(o);
            }
            else
                box.appendChild(el('div', 'hint', 'none chosen: it plays at any time'));
        }
        // its level following a signal the game sends
        if (signals.length || st.volumeFollow) {
            const f = el('div', 'wrow');
            f.appendChild(el('span', 'wl', 'level follows'));
            const sel = el('select', 'wsel');
            sel.appendChild(new Option('nothing (its own level)', ''));
            for (const sg of signals) {
                const o = new Option(sg.label ?? sg.name.replace(/_/g, ' '), sg.name);
                o.title = sg.description ?? '';
                sel.appendChild(o);
            }
            if (st.volumeFollow && !signals.some(sg => sg.name === st.volumeFollow.signal))
                sel.appendChild(new Option(st.volumeFollow.signal.replace(/_/g, ' '), st.volumeFollow.signal));
            sel.value = st.volumeFollow?.signal ?? '';
            sel.addEventListener('change', () => {
                const sg = signals.find(x => x.name === sel.value);
                // inside a room means quieter there (the usual wish); the curve is adjustable on the setting
                const map = sel.value.startsWith('in_') || sel.value === 'indoors' ? '0to1 1to0.35' : `${sg?.min ?? 0}to${sg?.max ?? 1} 0to1`;
                const next = sel.value ? upsertVoiceProperty(script, loc(), 'volume', `follow ${sel.value} ${map}`) : removeVoiceProperty(script, loc(), 'volume');
                commit(next, sel.value ? `level follows ${sel.value.replace(/_/g, ' ')}` : 'level no longer follows the game', { to: 'follow', signal: sel.value || null });
            });
            f.appendChild(sel);
            const desc = signals.find(x => x.name === st.volumeFollow?.signal)?.description;
            if (desc)
                f.appendChild(el('small', undefined, desc));
            box.appendChild(f);
            // how it follows (its curve), with the same control the setting had
            if (st.volumeFollow && st.propertySpans.has('volume')) {
                const c = el('div', 'wrow');
                c.appendChild(el('span', 'wl', 'how much'));
                c.appendChild(widgetFor(i, 'volume', rawValue(i, 'volume') ?? '', controlFor('volume'), false, st));
                box.appendChild(c);
            }
        }
        // a place you are in is a room the script declares; any other area cannot be a condition yet
        box.appendChild(el('div', 'hint', rooms.length ? 'quieter inside a room: level follows → you inside it. An area that is not a room cannot be a condition yet' : 'only while you are somewhere: the script has no rooms, so no place can be a condition yet'));
        return box;
    }
    /** A copy of a sound somewhere else, by aiming: the same sound (its takes), its own place. Free, no model. */
    function duplicateSound(i, st, btn) {
        const name = nameOf(st);
        const hint = (t) => `copy of ${name} → ${aimWords(t)} · click to place · Shift: this exact spot · scroll: height · Esc: cancel`;
        showAimBar(hint(null));
        const unlit = litWhileAiming(btn);
        layer?.startPlacing?.({ mode: 'thing', onChange: t => showAimBar(hint(t)), onCancel: () => { unlit(); showAimBar(null); }, onDone: t => {
                unlit();
                showAimBar(null);
                if (!t)
                    return;
                const r1 = (v) => Math.round(v * 10) / 10;
                const id = uniqueSourceId(script, t.hostId ?? `${st.sourceId ?? 'sound'}_copy`);
                const next = duplicateVoiceBlock(script, voiceLocatorFor(st, engine.scriptStatements), { sourceId: id, ...(t.hostId ? { at: t.hostId } : { place: t.point.map(r1) }) });
                if (!next) {
                    say('Could not copy this sound; edit its script.');
                    return;
                }
                if (applyScript(next, `copied ${name} ${aimWords(t)}`, { kind: 'duplicate', detail: { of: st.sourceId, sourceId: id, at: t.hostId, point: t.hostId ? null : t.point.map(r1) } })) {
                    const j = engine.scriptStatements.findIndex(o => o.sourceId === id);
                    if (j >= 0) {
                        openProps = j;
                        buildMixer();
                    }
                }
            } });
    }
    /** Write where a sound is: onto a thing (`at <id>`: it goes where the thing goes) or a spot (`place x y z`). */
    function applyPlace(i, st, t) {
        const name = nameOf(st);
        const loc = voiceLocatorFor(st, engine.scriptStatements);
        const r1 = (v) => Math.round(v * 10) / 10;
        let next = script;
        // (2026-11-13) dropped onto a big thing (a field, the road), "on it" meant its middle, often far from where you let go:
        // the sound jumped there and was gone. Far from the thing's own position, it stays at the spot you dropped it.
        const hp = t.hostId ? engine.hostPositionOf?.(t.hostId) : undefined;
        if (t.hostId && hp && Math.hypot(hp.x - t.point[0], hp.z - t.point[2]) > 3)
            t = { ...t, hostId: null };
        if (t.hostId) {
            next = upsertVoiceProperty(next, loc, 'at', t.hostId);
            if (next)
                next = removeVoiceProperty(next, loc, 'place') ?? next;
        }
        else {
            next = upsertVoiceProperty(next, loc, 'place', t.point.map(r1).join(' '));
            if (next)
                next = removeVoiceProperty(next, loc, 'at') ?? next;
        }
        if (next === script) {
            say(`${name} is already ${aimWords(t)}`);
            return;
        }
        if (!next) {
            say('That sound could not be moved there; edit its script.');
            return;
        }
        applyScript(next, `${name}: moved ${aimWords(t)}`, { kind: 'place', detail: { voice: voiceContext(i), to: t } });
    }
    /** The sound whose panel is open is draggable in the world: it plays from under the pointer while you drag. */
    function syncEditing() {
        if (!layer?.setEditing)
            return;
        const i = view === 'mixer' ? openProps : null;
        const st = i !== null ? engine.scriptStatements[i] : undefined;
        if (i === null || !st || isAround(st)) {
            layer.setEditing(null);
            return;
        }
        let from = null;
        layer.setEditing([i], {
            onPreview: t => {
                const views = engine.getTrackViews().filter(v => v.statementIndex === i);
                if (!from)
                    from = views.map(v => ({ key: v.key, x: v.position.x, y: v.position.y, z: v.position.z }));
                for (const v of views)
                    engine.setTrackPosition(v.key, t.point[0], t.point[1], t.point[2]);
            },
            onDrop: t => { from = null; applyPlace(i, st, t); },
            onCancel: () => { for (const f of from ?? [])
                engine.setTrackPosition(f.key, f.x, f.y, f.z); from = null; },
        });
    }
    /** The takes the script is missing, fetched the way a chat edit fetches them (no message, a note if some fail). */
    async function fetchMissing() {
        const m = { role: 'satie', text: '' };
        const b = el('button');
        // said where you asked for it: in the sound's editor while it is open, else in the footer
        const tell = (t) => { const st = inspector.hidden ? null : inspector.querySelector('.status'); if (st)
            st.textContent = t;
        else
            say(t); };
        tell('making the new takes…');
        await realizeFor(m, b);
        tell(missingTakes(script) ? `${missingNames(script).join(', ')}: some takes are still missing${m.text ? ` (${m.text.trim()})` : ''}` : 'the new takes are in');
        return m.text.trim();
    }
    /**
     * Every setting no dial or section owns, as the registry draws it, folded under "advanced" (one
     * list: what this sound sets, then on demand every unset one), and this sound's own script lines.
     * `owned`: settings a card dial already controls, so no setting has two controls.
     */
    function buildProps(i, st, owned = new Set()) {
        const box = el('div', 'satie-dt-props');
        const shown = shownProps.get(i) ?? new Set();
        shownProps.set(i, shown);
        for (const k of shownProps.keys())
            if (k !== i)
                shownProps.delete(k);
        const own = [];
        for (const [key, span] of st.propertySpans) {
            if (WHEN_OWNED.has(key) || owned.has(key) || (key === 'volume' && st.volumeFollow))
                continue;
            const inherited = span.origin === 'group' || span.origin === 'entity';
            own.push({ key, raw: rawValue(i, key) ?? '', inherited });
        }
        const order = new Map(PROPERTIES.map((p, k) => [p.name, k]));
        own.sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
        for (const o of own)
            shown.add(o.key);
        // a property you just turned off stays in its place, switched off, instead of vanishing
        const offered = showAllProps ? PROPERTIES.map(p => p.name) : [...new Set([...shown, ...OFFERED_GHOSTS])];
        const ghosts = offered.filter(k => !st.propertySpans.has(k) && !owned.has(k) && ghostApplies(k, st));
        const rowFor = (key, raw, ghost, inherited) => {
            const control = controlFor(key);
            const r = el('div', 'satie-dt-prow');
            r.dataset.key = key;
            r.dataset.ghost = ghost ? '1' : '0';
            r.dataset.inherited = inherited ? '1' : '0';
            if (justEdited?.i === i && justEdited.key === key && performance.now() - justEdited.at < 2500)
                r.dataset.edited = '1';
            // what SATIE just changed stays lit for a minute: the control to fine-tune it is right here
            if (satieJustChanged(st.sourceId, key)) {
                r.dataset.edited = '1';
                r.dataset.satie = '1';
                r.title = 'SATIE changed this just now: adjust it here';
            }
            const spec = PROPERTIES.find(p => p.name === key);
            const label = el('span', 'pl', key);
            label.title = spec?.detail ?? key;
            // a slider the sound cannot take while playing says so: it is heard when you let go
            if (!LIVE_PROPS.has(key) && ['slider', 'range', 'compound'].includes(control.kind)) {
                r.dataset.release = '1';
                label.title = `${label.title} · applies when you let go`;
            }
            r.appendChild(label);
            r.appendChild(widgetFor(i, key, raw, control, ghost, st));
            if (inherited) {
                const origin = st.propertySpans.get(key)?.origin;
                r.appendChild(el('small', 'note', `from ${origin}`));
            }
            if (!ghost && !inherited) {
                const pencil = el('button', 'ic', '✎');
                pencil.title = 'type the raw value';
                pencil.addEventListener('click', () => { const v = prompt(`${key}:`, raw); if (v !== null) {
                    if (v.trim())
                        setProp(i, key, v.trim(), `${key} ${v.trim()}`);
                    else
                        removeProp(i, key);
                } });
                const rm = el('button', 'ic', '×');
                rm.title = 'remove';
                rm.addEventListener('click', () => removeProp(i, key));
                r.append(pencil, rm);
            }
            else if (ghost) {
                r.title = 'not set. touch to set it';
            }
            return r;
        };
        const TECH = new Set(['source_id', 'source_role', 'at', 'visual', 'persistent', 'randomstart', 'overlap', 'cooldown', 'within', 'doppler']);
        const NOT_IN_A_GAME = layer ? new Set(['visual', 'color', 'alpha', 'scale', 'rotate']) : new Set();
        const LABELS = { zone: 'game state', place: 'where', spl: 'loudness at 1 m', radius: 'size (m)', ring: 'ring (m)', every: 'how often', variants: 'takes', reverb: 'room echo', occlusion: 'through walls', move: 'movement', volume: 'loudness', pitch: 'pitch' };
        const add = (host, key, raw, ghost, inherited) => {
            const r = rowFor(key, raw, ghost, inherited);
            const lab = r.querySelector('.pl');
            if (lab && LABELS[key]) {
                lab.textContent = LABELS[key];
                lab.title = `${key}: ${lab.title}`;
            }
            host.appendChild(r);
        };
        // the takes count is set with the takes themselves (what it is), not here a second time
        const HERE_ELSEWHERE = new Set(['variants']);
        // one order for set and unset settings (the registry's), so setting one leaves it where it was;
        // the technical ones (ids, roles, flags) come last in the same list, never a second fold
        const rank = (key) => (TECH.has(key) ? 10_000 : 0) + (order.get(key) ?? 999);
        const rowsInOrder = [...own.filter(o => !HERE_ELSEWHERE.has(o.key) && !(TECH.has(o.key) && NOT_IN_A_GAME.has(o.key))).map(o => ({ ...o, ghost: false })),
            ...ghosts.filter(g => !TECH.has(g) && !HERE_ELSEWHERE.has(g) && !NOT_IN_A_GAME.has(g)).map(g => ({ key: g, raw: seedFor(g) ?? '', inherited: false, ghost: true }))]
            .sort((a, b) => rank(a.key) - rank(b.key));
        const more = el('button', 'satie-dt-more', showAllProps ? 'only the settings it uses' : 'show every setting');
        more.title = showAllProps ? 'only the settings this sound uses' : 'every setting a sound can have, unset ones dimmed';
        more.addEventListener('click', () => { showAllProps = !showAllProps; buildMixer(); });
        box.appendChild(more);
        for (const r of rowsInOrder)
            add(box, r.key, r.raw, r.ghost, r.inherited);
        const advanced = el('details', 'adv card-adv');
        advanced.append(el('summary', undefined, 'advanced'), box);
        // this sound's own lines of SATIE script, for anything the form cannot say
        const b = blockMap?.get(i);
        let scriptFold = null;
        if (b) {
            const sc = el('details', 'adv card-adv');
            sc.appendChild(el('summary', undefined, 'script (this sound)'));
            const ta = el('textarea', 'blk');
            ta.spellcheck = false;
            ta.value = script.split('\n').slice(b.start, b.end).join('\n');
            const apply = el('button', 'pill', 'apply');
            apply.addEventListener('click', () => {
                const lines = script.split('\n');
                const next = [...lines.slice(0, b.start), ...ta.value.replace(/\s+$/, '').split('\n'), ...lines.slice(b.end)].join('\n');
                applyScript(next, `edited the script of ${shortName(st)}`, { kind: 'script_edit', detail: { voice: voiceContext(i), block: ta.value } });
            });
            sc.append(ta, apply);
            scriptFold = sc;
        }
        return { advanced, script: scriptFold };
    }
    let source = 'library';
    /** The swap drawer: the app's sample router as tabs — library recordings, Freesound (CC0), a new take, your file. */
    function buildDrawer(i, st, onUse, startQuery) {
        const d = el('div', 'satie-dt-drawer');
        const isLoop = st.kind === 'loop';
        const dir = scriptUrl ? scriptUrl.replace(/[^/]*$/, '') : '/satie/';
        // a search starts from what the sound is: its words, or the description its recording came with (never its token)
        const described = !st.isGenerated ? manifest[pathFor(st.clip)]?.name : undefined;
        const basePrompt = startQuery ?? (st.isGenerated ? (st.genPrompt ?? '').replace(/,\s*(close|dry)(\s*,\s*(close|dry))*\s*$/i, '') : described ? String(described).replace(/[-_]+/g, ' ') : st.clip.replace(/^community\//, '').replace(/_/g, ' '));
        const useClip = (_i, clip, entry, note, describe) => (onUse ? onUse(clip, entry, note, describe)
            : describe && entry.source === 'generated' ? putNewTake(_i, describe, entry, note) : putClipOnVoice(_i, clip, entry, note));
        const srcTabs = el('div', 'satie-dt-src');
        const q = el('div', 'q');
        const input = el('input');
        input.type = 'text';
        input.value = drawerQuery ?? basePrompt;
        drawerQuery = null;
        input.placeholder = 'describe the sound you want (e.g. a softer trickle, no splashes)';
        if (drawerPrompt) {
            drawerPrompt = false;
            setTimeout(() => { input.focus(); input.select(); }, 0);
        }
        const go = el('button', undefined, 'search');
        const cost = el('div', 'satie-dt-cost', '');
        const file = el('input');
        file.type = 'file';
        file.accept = 'audio/*';
        file.hidden = true;
        q.append(input, go, file);
        const results = el('div', 'satie-dt-list');
        d.append(srcTabs, q, cost, results);
        // no "new take" tab: new sounds come only from Generate variations in the find (a plan you read, a capped make)
        const sources = [['library', 'library'], ['freesound', 'freesound'], ['file', 'your file']];
        const srcBtns = new Map();
        for (const [key, label] of sources) {
            const b = el('button', undefined, label);
            b.addEventListener('click', () => { source = key; paint(); void run(); });
            srcTabs.appendChild(b);
            srcBtns.set(key, b);
        }
        const paint = () => {
            for (const [k, b] of srcBtns)
                b.dataset.on = k === source ? '1' : '0';
            go.textContent = source === 'file' ? 'choose file…' : 'search';
            cost.textContent = source === 'freesound' ? 'Freesound recordings (CC0), saved into your project' : source === 'library' ? 'the shared library: recordings, and sounds made with SATIE' : '';
            input.disabled = source === 'file';
        };
        // url: preview this take in the mix at the voice's position (the web library's button: play, loading arc, stop)
        // every set of results is logged as an offer: what was heard and passed over is the data, not only what won
        let finderOffer = null;
        const offered = (rows) => { logOutcome(finderOffer, 'abandoned'); finderOffer = logOffer('finder', { voice: voiceContext(i), source }, rows.map(r => ({ ...r, source }))); };
        const hitRow = (name, meta, url, use, key = name) => {
            const row = el('div', 'satie-dt-hit');
            const p = el('button', 'pv');
            p.dataset.state = 'idle';
            p.innerHTML = ICON.play;
            p.setAttribute('aria-label', 'Preview');
            p.title = 'hear it up close (the rest of the scene dips)';
            const text = el('div');
            const n = el('div', 'n', name);
            n.title = name;
            const bar = el('div', 'bar');
            const fill = el('i');
            bar.appendChild(fill);
            text.append(n, bar);
            // heard up close, the scene dipped under it: at the voice's place a far or wide sound was inaudible
            if (url)
                p.addEventListener('click', () => { const offer = finderOffer; togglePreview(p, fill, i, url, false, { onEnd: ms => logListen(offer, key, ms) }); });
            else {
                p.disabled = true;
                p.title = 'no preview';
                bar.hidden = true;
            }
            const m = el('div', 'm', meta);
            m.title = meta;
            const u = el('button', 'pill', 'use');
            u.addEventListener('click', () => { stopPreview(); logOutcome(finderOffer, 'kept', key); use(); });
            row.append(p, text, m, u);
            return row;
        };
        const note = (t) => results.replaceChildren(el('div', 'satie-dt-note', t));
        const warn = (t) => results.replaceChildren(el('div', 'satie-dt-warn', t));
        const onlyOk = (r) => { if (!r.ok)
            throw new Error(r.error ?? 'failed'); };
        const run = async () => {
            // a published scene: finding, making or bringing in a new sound needs the visitor's own copy
            if (!authoring) {
                const n = el('div', 'satie-dt-note', 'Fork the scene to bring in a different sound. ');
                const open = el('button', 'link', 'how');
                open.addEventListener('click', () => showChat());
                n.appendChild(open);
                results.replaceChildren(n);
                return;
            }
            if (source === 'file') {
                file.click();
                return;
            }
            const query = input.value.trim();
            if (!query)
                return;
            if (query !== basePrompt)
                record('search', { voice: voiceContext(i), source, query });
            try {
                if (source === 'library') {
                    note('searching the library…');
                    const r = await fetch(`${libraryUrl}?q=${encodeURIComponent(query)}${isLoop ? '&loop=1' : ''}`).then(x => x.json());
                    onlyOk(r);
                    if (!r.hits?.length)
                        return note('no listed recording matches; try other words, Freesound, or a new take');
                    // a library row is either a recording or a sound made with SATIE (its license field says which)
                    const origin = (h) => /generat|elevenlabs|satie/i.test(h.license) ? 'made with SATIE' : 'recording';
                    offered(r.hits.map(h => ({ key: h.clip, label: h.name, url: h.url, clip: h.clip })));
                    results.replaceChildren(...r.hits.map(h => hitRow(h.name.replace(/-/g, ' '), `${h.durationS}s · ${origin(h)}${h.heard ? ` · ${String(h.heard).slice(0, 90)}` : ''}`, h.url, () => useClip(i, h.clip, { url: h.url, source: 'library', name: h.name, license: h.license }, `now playing "${h.name}"`), h.clip)));
                }
                else if (source === 'freesound') {
                    note('searching Freesound (CC0)…');
                    const r = await fetch(`${freesoundUrl}?q=${encodeURIComponent(query)}`).then(x => x.json());
                    if (!r.ok && r.reason) {
                        const why = r.reason === 'CERT_HAS_EXPIRED' ? 'Freesound\'s TLS certificate has expired (their side); every client refuses it until they renew.' : `Freesound is unreachable right now (${r.reason}).`;
                        return warn(`${why} The library and a new take still work.`);
                    }
                    onlyOk(r);
                    if (!r.hits?.length)
                        return note('nothing CC0 on Freesound for that; try other words');
                    // heard before it is saved: the plugin streams Freesound's preview without writing anything
                    offered(r.hits.map(h => ({ key: `freesound:${h.id}`, label: h.name, url: `${freesoundUrl}/preview?id=${h.id}` })));
                    results.replaceChildren(...r.hits.map(h => hitRow(h.name, `${h.durationS.toFixed(1)}s · ${h.author}`, `${freesoundUrl}/preview?id=${h.id}`, async () => {
                        note(`saving "${h.name}" into the project…`);
                        try {
                            const imp = await fetch(`${freesoundUrl}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: h.id, dir }) }).then(x => x.json());
                            onlyOk(imp);
                            useClip(i, imp.clip, { url: imp.url, source: 'freesound', name: h.name, license: 'CC0' }, `now playing Freesound "${h.name}"`);
                        }
                        catch (e) {
                            warn(e instanceof Error ? e.message : String(e));
                        }
                    })));
                }
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (needsSignIn(msg))
                    results.replaceChildren(el('div', 'satie-dt-note', 'Sign in once to search SATIE and make takes (the same account as your SATIE MCP).'), signInButton(() => { void run(); }));
                else
                    warn(source === 'freesound' && /proxy|502|fetch/i.test(msg) ? 'Freesound did not answer (their side). Try the library, or Generate variations in the find.' : `${msg}. Is the satie vite plugin on in vite.config?`);
            }
        };
        go.addEventListener('click', run);
        input.addEventListener('keydown', e => { if (e.key === 'Enter')
            run(); });
        file.addEventListener('change', async () => {
            const f = file.files?.[0];
            if (!f)
                return;
            const stem = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sample';
            const ext = (f.name.match(/\.[^.]+$/)?.[0] ?? '.wav').toLowerCase();
            note(`uploading ${f.name}…`);
            try {
                const buf = await f.arrayBuffer();
                let bin = '';
                const bytes = new Uint8Array(buf);
                for (let k = 0; k < bytes.length; k += 0x8000)
                    bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
                const r = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `${dir}samples/${stem}${ext}`, base64: btoa(bin) }) }).then(x => x.json());
                onlyOk(r);
                useClip(i, stem, { url: r.url, source: 'provided', name: f.name }, `now playing your ${f.name}`);
            }
            catch (e) {
                warn(e instanceof Error ? e.message : String(e));
            }
        });
        paint();
        void run();
        return d;
    }
    let lastFireVersion = -1;
    /** Why a sound is not reaching you right now, in words, from what the engine reports (never a guess). */
    function quietReason(i, v) {
        const st = engine.scriptStatements[i];
        if (!st)
            return { text: 'silent', title: '' };
        if (st.kind === 'trigger')
            return { text: 'not triggered', title: `plays when the game triggers ${(st.eventName ?? 'its event').replace(/_/g, ' ')}; ▶ plays it now` };
        // a live source its state holds silent: a zone it is not in, or a control at 0
        // blame the zone only when the game is NOT in it (a one-shot between its plays is not "dusk only" at dusk)
        if (v && !v.active && st.zones?.length && !st.zones.includes(engine.sceneState ?? ''))
            return { text: `${st.zones.join(' / ')} only`, title: `plays in ${st.zones.join(' or ')}; the game is in ${engine.sceneState ?? 'no state'} now` };
        if (!st.every.isNull) {
            const r = st.every;
            return { text: `every ${r.isRange && r.min !== r.max ? `${r.min}–${r.max}` : r.min} s`, title: `a one-shot: it plays once every ${r.isRange ? `${r.min} to ${r.max}` : r.min} s and is silent between plays; ▶ plays it now` };
        }
        if (v && !v.active && st.volumeFollow)
            return { text: 'off in game', title: `its level follows the game's ${st.volumeFollow.signal.replace(/_/g, ' ')}, which is at 0 now` };
        if (v?.active)
            return v.culled ? { text: 'too quiet here', title: 'playing, but far under the loudest sound you hear (more than 0.46 quieter), so SATIE drops it' }
                : { text: 'too far', title: 'playing, but too far or too quiet to reach you here' };
        // say why, from the script: a length that ran out, a start not reached yet
        const rng = (r) => (r.isRange && r.min !== r.max ? `${r.min}–${r.max}` : String(r.min));
        if (!st.duration.isNull)
            return { text: `ended after ${rng(st.duration)} s`, title: `its "duration" is ${rng(st.duration)} s: it plays that long, then stops. Remove duration (×) in its editor to keep it playing.` };
        if (!st.end.isNull)
            return { text: 'ended', title: `its "end" is ${rng(st.end)} s into the scene` };
        if (!st.start.isNull && st.start.max > 0)
            return { text: `starts at ${rng(st.start)} s`, title: `its "start" is ${rng(st.start)} s into the scene` };
        return { text: 'not playing', title: 'not playing right now' };
    }
    /** The game signal holding a sound at zero right now (`volume follow <signal>` mapped to 0), or null. */
    function gatedBy(st) {
        const f = st?.volumeFollow;
        if (!f)
            return null;
        const x = engine.predictedSignal(f.signal, 0);
        if (!Number.isFinite(x))
            return null;
        return mapFollow(f, x) <= 1e-3 ? { signal: f.signal, value: x } : null; // the engine's own mapping
    }
    let contractHostIds = new Set(), placedHosts = new Set();
    function syncMixer() {
        // once per tick, not per row: the contract's objects and the hosts the game has placed
        if (!contractHostIds.size)
            contractHostIds = new Set((layer?.hosts?.() ?? []).map(h => h.id));
        placedHosts = new Set(engine.externalHosts);
        const report = engine.levelReport();
        const hear = hearNow();
        const byIndex = new Map();
        for (const v of report.voices)
            if (!byIndex.has(v.statementIndex))
                byIndex.set(v.statementIndex, v);
        for (const [i, r] of rows) {
            const muted = isMuted(i);
            const soloed = engine.soloedIndices.has(i);
            r.mute.dataset.on = muted ? '1' : '0';
            r.solo.dataset.on = soloed ? '1' : '0';
            const v = byIndex.get(i);
            // what you hear from here: a level while it reaches you, otherwise why not. Worked out every tick,
            // shown only once it has held for a moment (passing cars and steps flipped it five times a second)
            const gate = gatedBy(engine.scriptStatements[i]);
            const st0 = engine.scriptStatements[i];
            const unplaced = !!st0?.hostRef && contractHostIds.has(st0.hostRef) && !placedHosts.has(st0.hostRef) && st0.hostRef !== layer?.listenerHost?.();
            const soloOff = engine.soloedIndices.size > 0 && !soloed;
            const write = (text, title = '') => { if (r.lv.textContent !== text || r.lv.childElementCount) {
                r.lv.replaceChildren();
                r.lv.textContent = text;
            } r.lv.title = title; };
            let key, paint;
            if (muted) {
                key = 'muted';
                paint = () => write('muted');
            }
            else if (soloOff) {
                key = 'solo-off';
                paint = () => write('');
            }
            else if (unplaced) {
                // the game brings the thing in and out (a train on the block, an ambulance passing): say it is away
                const host = hostName(st0.hostRef);
                key = 'unplaced';
                paint = () => write('not here now', `the ${host} is not in the scene right now: the game brings it in and out. This sound plays from it once it is back.`);
            }
            else if (gate) {
                // held at zero by the game: say so (raising it does nothing until the game raises the signal)
                const fired = st0?.kind === 'trigger' && shots.has(i) && performance.now() - shots.get(i).at < 15000;
                key = `gate:${fired ? 'fired' : gate.signal}`;
                paint = () => write(fired ? 'fired, silent' : `waits for ${gate.signal.replace(/_/g, ' ')}`, `its level follows the game's ${gate.signal.replace(/_/g, ' ')}, which is ${Math.round(gate.value * 100) / 100} now, so it plays at zero${fired ? ' (it fired, but the game had already set it to this)' : '; it sounds when the game raises it'}. ▶ plays it anyway.`);
            }
            else if (shots.has(i) && performance.now() - shots.get(i).at < SHOT_MS && shots.get(i).margin >= 0) {
                key = 'played';
                paint = () => write(`played ${Math.max(0, Math.round((performance.now() - shots.get(i).at) / 1000))} s ago`);
            }
            else if (v?.audible && isFinite(v.receivedDb) && hear.has(i) && hear.get(i).marginDb < 0) {
                const a = hear.get(i), by = a.maskerId !== null && engine.scriptStatements[a.maskerId] ? nameOf(engine.scriptStatements[a.maskerId]) : null;
                key = `covered:${by ?? ''}`;
                paint = () => write(by ? `covered by ${by}` : 'drowned out', `loudness ${fmtLoud(v.receivedDb)} reaches you, but ${by ? `the ${by} cover${by.endsWith('s') ? '' : 's'} it` : 'louder sounds in the same pitch range cover it'}; about ${fmtLoudDelta(Math.ceil(-a.marginDb))} louder would bring it through`);
            }
            else if (v?.audible && isFinite(v.receivedDb)) {
                // how loud it is where you stand, and how far it is
                key = 'level';
                paint = () => {
                    const d = liveDistance(i);
                    r.lv.replaceChildren(el('b', undefined, fmtLoud(v.receivedDb)), ...(Number.isFinite(d) && !isAround(engine.scriptStatements[i]) ? [` · ${d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)} m`] : []));
                    r.lv.title = 'how loud it is where you stand, 0 (nothing) to 1 (as loud as sound gets): about 0.25 a whisper, 0.5 talking, 0.75 very loud; and how far the sound is. Playback is scaled so the loudest sound you hear sits at a fixed level: judge a sound by ear against the others, not by the number alone.';
                };
            }
            else {
                const why = quietReason(i, v);
                key = `quiet:${why.text}`;
                paint = () => write(why.text, why.title);
            }
            const now = performance.now();
            const held = rowHeld.get(i) ?? { key: '', at: 0, num: 0 };
            rowHeld.set(i, held);
            // your own actions show at once, and so does a sound that just played; anything else waits HOLD_MS
            const atOnce = key === 'muted' || key === 'solo-off' || key === 'played' || held.key === 'muted' || held.key === 'solo-off' || !held.key;
            if (key === held.key) {
                held.pending = undefined;
                // the same state: its numbers (a level, a count of seconds) refresh once a second, not every tick
                if ((key === 'level' || key === 'played') && now - held.num >= 1000) {
                    paint();
                    held.num = now;
                }
            }
            else if (atOnce || (held.pending === key && now - (held.since ?? now) >= HOLD_MS)) {
                held.key = key;
                held.pending = undefined;
                held.num = now;
                paint();
            }
            else if (held.pending !== key) {
                held.pending = key;
                held.since = now;
            }
            r.row.dataset.off = muted || soloOff ? '1' : '0';
            // the row's glow follows the same rule: a sound that comes and goes in a breath does not blink the list
            const heard = !!v?.audible && isFinite(v.receivedDb) && (hear.get(i)?.marginDb ?? -Infinity) >= 0 && !muted;
            const glow = `${v?.active || v?.audible ? 1 : 0}${heard ? 1 : 0}`;
            if (glow === held.glow)
                held.glowPending = undefined;
            else if (!held.glow || (held.glowPending === glow && now - (held.glowSince ?? now) >= HOLD_MS)) {
                held.glow = glow;
                held.glowPending = undefined;
                r.row.dataset.playing = glow[0];
                r.row.dataset.heard = glow[1];
            }
            else if (held.glowPending !== glow) {
                held.glowPending = glow;
                held.glowSince = now;
            }
            if (heard && now - (held.lvAt ?? 0) >= 1000) {
                held.lvAt = now;
                r.row.style.setProperty('--lv', String(Math.max(0.2, Math.min(1, (v.receivedDb - 10) / 50))));
            }
        }
        // a thing's M and S are its sounds' (2026-11-12): all of them muted is the thing muted, some is shown as some
        for (const g of groupInfo.values()) {
            if (!g.m || !g.s || !g.members.length)
                continue;
            const nm = g.members.filter(m => isMuted(m)).length, ns = g.members.filter(m => engine.soloedIndices.has(m)).length;
            // some of its sounds muted fill the button that far (2 of 5: 40%), all of them is the button on
            g.m.dataset.on = nm === g.members.length ? '1' : '0';
            g.m.dataset.part = nm > 0 && nm < g.members.length ? '1' : '0';
            g.m.style.setProperty('--f', String(nm / g.members.length));
            g.s.dataset.on = ns === g.members.length ? '1' : '0';
            g.s.dataset.part = ns > 0 && ns < g.members.length ? '1' : '0';
            g.s.style.setProperty('--f', String(ns / g.members.length));
        }
        // a folded repeat: how many of its copies you hear, held like a row's status so it does not flicker
        for (const k of kindRows) {
            const allMuted = k.copies.every(i => isMuted(i));
            k.mute.dataset.on = allMuted ? '1' : '0';
            k.solo.dataset.on = k.copies.every(i => engine.soloedIndices.has(i)) ? '1' : '0';
            const heardN = k.copies.filter(i => !isMuted(i) && (hear.get(i)?.marginDb ?? -Infinity) >= 0).length;
            const st = engine.scriptStatements[k.copies[0]];
            const text = allMuted ? 'muted' : heardN ? `${heardN} of ${k.copies.length} heard` : (st ? whenItPlays(st)[0] : undefined) ?? 'silent now';
            const now = performance.now();
            if (text === k.key)
                k.pending = undefined;
            else if (!k.key || allMuted || k.key === 'muted' || (k.pending === text && now - (k.since ?? now) >= HOLD_MS)) {
                k.key = text;
                k.pending = undefined;
                k.lv.textContent = text;
                k.row.dataset.heard = heardN ? '1' : '0';
            }
            else if (k.pending !== text) {
                k.pending = text;
                k.since = now;
            }
        }
        // each thing's header: what it does, how far, and whether you hear it now; the background bar glows while heard
        const near = new Map();
        for (const t of engine.getTrackViews())
            if (Number.isFinite(t.surfaceDistanceM))
                near.set(t.statementIndex, Math.min(t.surfaceDistanceM, near.get(t.statementIndex) ?? Infinity));
        // a thing's light is computed as its square's in the world (one rule, so the two always agree): heard = loud
        // enough where you stand (the level report), bright = heard within 15 dB of the loudest placed sound you hear
        const loudBy = new Map();
        for (const v of report.voices)
            if (v.audible && Number.isFinite(v.receivedDb))
                loudBy.set(v.statementIndex, Math.max(v.receivedDb, loudBy.get(v.statementIndex) ?? -Infinity));
        const topHeard = Math.max(-Infinity, ...[...loudBy].filter(([i]) => !isAround(engine.scriptStatements[i])).map(([, db]) => db));
        for (const [, g] of groupInfo) {
            if (!g.sub)
                continue;
            const d = Math.min(...g.members.map(m => near.get(m) ?? lastDistance.get(m) ?? Infinity));
            const heardAny = g.members.some(m => loudBy.has(m));
            const loudest = Math.max(-Infinity, ...g.members.map(m => loudBy.get(m) ?? -Infinity));
            const bright = heardAny && loudest >= topHeard - 15;
            const playing = g.members.some(m => byIndex.get(m)?.active);
            const text = [g.where, Number.isFinite(d) && g.label !== 'you' ? `${Math.round(d)} m` : '', heardAny ? 'heard' : playing ? 'playing' : 'silent now'].filter(Boolean).join(' · ');
            if (g.sub.textContent !== text)
                g.sub.textContent = text;
            // its icon lights as its sounds' dots do: dim while one plays, bright with the loudest while you hear it
            if (g.header) {
                const p = playing || heardAny ? '1' : '0', h = bright ? '1' : '0';
                if (g.header.dataset.playing !== p)
                    g.header.dataset.playing = p;
                if (g.header.dataset.heard !== h)
                    g.header.dataset.heard = h;
                if (heardAny && Number.isFinite(loudest))
                    g.header.style.setProperty('--lv', String(Math.max(0.2, Math.min(1, (loudest - 10) / 50))));
            }
        }
        for (const [tab, mine] of [[bedHead, (st) => isAround(st)], [youHead, (st) => isYours(st)]]) {
            if (!tab)
                continue;
            const idx = engine.scriptStatements.map((st, i) => (mine(st) ? i : -1)).filter(i => i >= 0);
            const h = idx.some(i => (hear.get(i)?.marginDb ?? -Infinity) >= 0) ? '1' : '0', p = idx.some(i => byIndex.get(i)?.active) ? '1' : '0';
            if (tab.dataset.heard !== h)
                tab.dataset.heard = h;
            if (tab.dataset.playing !== p)
                tab.dataset.playing = p;
        }
        // flash the rows whose voices fired since the last look
        const log = engine.eventLog;
        if (log.version !== lastFireVersion) {
            const events = log.snapshot();
            // the first look flashes nothing, but tells the world layer what has already fired (where the last
            // step landed), so a sound the game places each time is not hidden until it fires again
            if (lastFireVersion < 0)
                for (const e of events)
                    if (e.kind === 'fire')
                        layer?.fired(e.statementIndex);
            const fresh = lastFireVersion < 0 ? [] : events.slice(Math.max(0, events.length - (log.version - lastFireVersion)));
            lastFireVersion = log.version;
            for (const e of fresh) {
                if (e.kind !== 'fire' && e.kind !== 'start')
                    continue;
                if (e.kind === 'fire') {
                    layer?.fired(e.statementIndex);
                    shots.set(e.statementIndex, { at: performance.now(), db: NaN, margin: -Infinity });
                }
                // a ripple in the world only for what you hear: checked a quarter second on, once the level model sees it
                {
                    const i = e.statementIndex;
                    setTimeout(() => { if (!destroyed && (hearNow().get(i)?.marginDb ?? -Infinity) >= 0)
                        layer?.ripple?.(i); }, RIPPLE_HEARD_AFTER_MS);
                }
                const r = rows.get(e.statementIndex);
                if (!r)
                    continue;
                r.row.dataset.fire = '1';
                setTimeout(() => { r.row.dataset.fire = '0'; }, 120);
            }
        }
    }
    // ── log ──
    let lastLogVersion = -1;
    const evList = el('div');
    const warnList = el('div');
    function buildLog() { body.replaceChildren(groundRow, warnList, evList); lastLogVersion = -1; syncLog(); }
    function syncLog() {
        const log = engine.eventLog;
        if (log.version !== lastLogVersion) {
            lastLogVersion = log.version;
            const events = log.snapshot().slice(-120);
            const stmts = engine.scriptStatements;
            const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
            // pair the game's event with the sound that answered it, newest first
            const lines = [];
            for (const e of events) {
                const st = stmts[e.statementIndex];
                const sound = st ? `${st.hostRef ? hostName(st.hostRef) + ' · ' : ''}${labelOf(st).what.split(/,\s*/)[0]}` : e.label;
                if (e.kind === 'event')
                    lines.push({ t: e.t, what: e.label.replace(/_/g, ' '), sound: '', kind: 'game' });
                else if (e.kind === 'fire') {
                    const last = lines[lines.length - 1];
                    if (last && last.kind === 'game' && !last.sound && Math.abs(last.t - e.t) < 0.05)
                        last.sound = sound;
                    else
                        lines.push({ t: e.t, what: '', sound, kind: 'sound' });
                }
                else
                    lines.push({ t: e.t, what: e.kind, sound, kind: e.kind });
            }
            evList.replaceChildren(el('div', 'satie-dt-evhead', 'What happened, newest first. Time is minutes:seconds since the sound started. "game" is an event your game fired; the arrow shows the sound that answered it.'), ...lines.reverse().slice(0, 80).map(l => {
                const row = el('div', 'satie-dt-ev');
                row.append(el('span', 't mono', mmss(l.t)), el('span', 'k', l.kind), el('span', undefined, l.kind === 'game' ? `${l.what}${l.sound ? ' → ' + l.sound : ' → (nothing answered)'}` : l.sound));
                return row;
            }));
        }
        warnList.replaceChildren(...engine.runtimeWarnings.map(w => el('div', 'satie-dt-warnrow', w)));
    }
    // ── script ──
    const editor = el('textarea');
    editor.spellcheck = false;
    function buildScript() { const w = el('div', 'satie-dt-scriptwrap'); w.appendChild(editor); body.replaceChildren(w); editor.value = script; }
    const applyBtn = el('button', 'pill', 'apply');
    const saveBtn = el('button', 'pill', 'save');
    applyBtn.addEventListener('click', () => applyScript(editor.value, 'applied'));
    saveBtn.addEventListener('click', () => { void save(); });
    const downloadEdits = el('button', 'pill', 'edit log');
    downloadEdits.disabled = true;
    downloadEdits.title = 'Download local edit observations; this does not contribute them';
    downloadEdits.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([recorder?.toJSONL() ?? ''], { type: 'application/x-ndjson' }));
        const link = el('a');
        link.href = url;
        link.download = 'satie-edits.jsonl';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    saveBtn.hidden = true;
    saveBtn.title = 'changes save themselves';
    const undoBtn = el('button', undefined, 'undo');
    undoBtn.title = `undo the last ${word('change')} (⌘Z); every ${word('change')} is in history`;
    const redoBtn = el('button', undefined, 'redo');
    redoBtn.title = 'redo (⇧⌘Z)';
    undoBtn.addEventListener('click', () => undo());
    redoBtn.addEventListener('click', () => redo());
    const paintUndo = () => { undoBtn.disabled = !nodeById(tree.headId)?.parentId; redoBtn.disabled = !childrenOf(tree.headId).length; };
    paintUndo();
    foot.append(applyBtn, saveBtn, downloadEdits, acct, status);
    // undo and redo in the header, as in any editor: a row of their own was a row for two buttons
    undoBtn.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5 3 7.5l3 3"/><path d="M3.5 7.5h6a3.5 3.5 0 0 1 0 7H8"/></svg>';
    redoBtn.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4.5l3 3-3 3"/><path d="M12.5 7.5h-6a3.5 3.5 0 0 0 0 7H8"/></svg>';
    undoBtn.setAttribute('aria-label', 'undo');
    redoBtn.setAttribute('aria-label', 'redo');
    const undoBox = el('span', 'undo hdr');
    undoBox.append(undoBtn, redoBtn);
    bar.insertBefore(undoBox, playBtn);
    if (opts.localStorageKey)
        downloadEdits.hidden = true;
    if (!authoring) {
        editor.readOnly = true;
        undoBox.remove();
    }
    if (opts.localStorageKey && authoring) {
        const resetMix = el('button', 'pill', 'reset mix');
        resetMix.title = 'Restore the original mix and remove your saved changes';
        resetMix.addEventListener('click', () => {
            if (!documentsReady)
                return;
            try {
                localStorage.removeItem(opts.localStorageKey);
                if (applyScript(baselineScript, 'original mix restored')) {
                    dirty = false;
                    say('original mix restored');
                    render();
                }
            }
            catch {
                say('Could not clear the saved mix on this device.');
            }
        });
        foot.insertBefore(resetMix, status);
    }
    const sceneReview = createSceneReview({ engine, script: () => script,
        apply: next => { applyScript(next, 'scene review'); render(); },
        judgment: judgment => {
            record('scene_comparison', { judgment });
            const url = URL.createObjectURL(new Blob([JSON.stringify(judgment, null, 2)], { type: 'application/json' }));
            const link = el('a');
            link.href = url;
            link.download = 'satie-scene-judgment.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
    });
    function render() {
        comparison?.destroy();
        comparison = null;
        for (const [v, b] of tabBtns)
            b.dataset.on = v === view ? '1' : '0';
        buildTools();
        applyBtn.style.display = view === 'script' ? '' : 'none';
        if (view !== 'mixer') {
            inspector.hidden = true;
            layer?.setEditing?.(null);
        }
        body.dataset.view = view;
        paintStrip();
        if (view === 'mixer') {
            buildMixer();
            syncMixer();
        }
        else if (view === 'compare') {
            body.replaceChildren(sceneReview.element);
        }
        else if (view === 'log')
            buildLog();
        else if (view === 'history')
            buildHistory();
        else
            buildScript();
    }
    playBtn.addEventListener('click', () => { sceneReview.stop(); comparison?.stop(); if (engine.isPlaying)
        engine.stop();
    else
        void (opts.start ? opts.start() : engine.play()); });
    hideBtn.addEventListener('click', () => api.close());
    launch.addEventListener('click', () => api.open());
    const onKey = (e) => {
        const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
        const hit = e.key === hotkey || (hotkey === '`' && e.code === 'Backquote');
        if (hit && !typing) {
            e.preventDefault();
            api.toggle();
            return;
        }
        if (root.dataset.collapsed === '1')
            return;
        // Esc steps back: a selection first, then moving sounds, then the panel
        if (e.key === 'Escape' && editOpen)
            return; // the edit panel steps back first (it owns Esc while open)
        if (e.key === 'Escape') {
            e.preventDefault();
            if (selIdx !== null || selGroupKey || multiSel.size)
                clearSelection();
            else
                api.close();
            return;
        }
        const mod = e.metaKey || e.ctrlKey;
        if (!mod || typing)
            return;
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey)
                redo();
            else
                undo();
        }
        else if (e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        }
    };
    addEventListener('keydown', onKey);
    // ── Soundscapes and their variants (spec 012): the mechanism, with no UI of its own ──
    // (Huanxing, 2026-11-12: no soundscape map window; the mixer's strip and the edit view show it.)
    let soundscapeVariants = null;
    let soundscapeNow = null;
    const soundscapeCbs = new Set();
    let soundscapeTimer;
    async function mountPlaces(spec) {
        let file = null;
        // no file yet (compose made no variants, or it is not saved): the script's soundscapes, first drafts only
        const none = { version: 'satie.places/1', places: [], versions: [] };
        try {
            file = spec === null ? none : readSoundscapes(typeof spec === 'string' ? await fetch(spec).then(r => (r.ok ? r.json() : none)) : spec);
        }
        catch {
            file = none;
        }
        if (!file || destroyed)
            return;
        // the soundscapes are the script's own `soundscape` blocks (world correctness, spec 014) when it
        // declares them; the file then carries only the variants (and the player's own sounds)
        let blocks = [];
        try {
            blocks = parseScene(script).soundscapes ?? [];
        }
        catch {
            blocks = [];
        }
        // membership is the engine's (world correctness, `soundscapeOf`) when it has it
        const ws = engine;
        const declared = soundscapesFromBlocks(engine.scriptStatements, blocks, file.player ?? [], ws.soundscapeOf ? st => ws.soundscapeOf(st) : undefined);
        if (declared)
            file = { ...file, ...declared };
        if (!file.places.length)
            return;
        const pending = new Map();
        // a preset file's library recordings: loaded at mount so a switch plays them, written to
        // samples.json only when a variant using one is kept
        const library = {
            async prepare(take) {
                const t = take;
                if (engine.getAudioBuffers().has(pathFor(t.clip)))
                    return true;
                if (!t.url)
                    return false;
                try {
                    engine.setAudioBuffer(pathFor(t.clip), await bufferFor(t.url));
                }
                catch {
                    return false;
                }
                pending.set(t.clip, { url: t.url, source: 'library', ...(t.name ? { name: t.name } : {}), ...(t.license ? { license: t.license } : {}), ...(t.attribution ? { attribution: t.attribution } : {}), ...(t.sampleId ? { sampleId: t.sampleId } : {}) });
                return true;
            },
        };
        for (const take of Object.values(file.takes ?? {}))
            void library.prepare(take);
        const variants = soundscapeVariants = createVariantController({
            committed: () => script,
            play: (next, seconds) => { engine.loadScript(next, { crossfade: seconds }); },
            use: (next, note, detail) => {
                const added = [];
                for (const [clip, entry] of pending)
                    if (next.includes(clip) && !manifest[pathFor(clip)]) {
                        manifest[pathFor(clip)] = entry;
                        added.push(clip);
                    }
                const ok = applyScript(next, note, { kind: 'place_use', detail });
                if (!ok)
                    for (const clip of added)
                        delete manifest[pathFor(clip)];
                return ok;
            },
            record: (kind, detail) => { record(kind, detail); },
            audioTime: () => engine.audioContext.currentTime,
            listener: () => ({ position: { ...engine.listenerPosition }, forward: { ...engine.listenerForward } }),
        }, file);
        // where you are: world correctness's reading (engine.soundscapeHere, spec 014: a room by its walls,
        // the open ones by their own steady sounds with a 3 dB hold). An engine without it reports none.
        const where = () => {
            const next = ws.soundscapeHere ?? null;
            if (next === soundscapeNow)
                return;
            variants.creditListen();
            soundscapeNow = next;
            for (const cb of soundscapeCbs)
                cb(next);
        };
        where();
        soundscapeTimer = setInterval(() => { if (!destroyed)
            where(); }, 500);
        variants.onChange(() => paintStrip());
        variants.onSwitch(() => paintStrip());
        soundscapeCbs.add(() => paintStrip());
        paintStrip = paintSoundscapeStrip;
        paintStrip();
    }
    // ── the soundscape strip (spec 015, round 11): its name, one variant pill, the map ──
    // The variants are the soundscape's presets (compose makes them; More like N was removed
    // 2026-11-12). A number switches to it and keeps it (autosave); ‹ shows any earlier ones.
    let stripEarlier = false;
    const orbEl = () => { const o = el('span', 'orb'); o.setAttribute('aria-hidden', 'true'); o.append(el('i'), el('i'), el('i')); return o; };
    /** The soundscape the chat's card was last painted for: walking into another one moves the card (2026-11-13). */
    let scopeFor = null;
    function paintSoundscapeStrip() {
        const v = soundscapeVariants;
        if (scopeFor !== soundscapeNow) {
            scopeFor = soundscapeNow;
            if (chatReady)
                queueMicrotask(paintScope);
        }
        scapeStrip.hidden = !v || view !== 'mixer';
        if (!v) {
            if (agentSees.parentElement !== root)
                tabs.after(agentSees);
            return;
        }
        const defs = v.soundscapes(), def = defs.find(d => d.id === soundscapeNow) ?? null;
        scapeStrip.replaceChildren();
        const head = el('div', 'sh'), name = el('div', 'sn');
        name.append(el('span', 'sl', word('soundscape')), el('span', 'sv', def?.label ?? 'between soundscapes'));
        const map = el('button', 'mapbtn');
        map.append(orbEl(), el('span', undefined, 'mix'));
        map.dataset.on = editOpen ? '1' : '0';
        map.title = editOpen ? 'close the mix' : `open the mix of ${(def?.label ?? 'this world').toLowerCase()}: its sounds among the library's`;
        map.addEventListener('click', () => {
            if (editOpen) {
                opts.editPanel?.close();
                editOpen = false;
                paintStrip();
                return;
            }
            openEdit({ soundscape: def?.id ?? defs[0]?.id ?? 'world' });
        });
        // the name is the heading, large; the controls that act on it sit together under it, one height;
        // what your coding agent sees is a small box at the right
        const left = el('div', 'lc');
        head.append(name);
        left.appendChild(head);
        scapeStrip.append(left, agentSees);
        const row = el('div', 'sr');
        left.appendChild(row);
        if (!def) {
            row.appendChild(map);
            return;
        }
        const st = v.state(def.id), all = v.variants(def.id), inSlots = new Set(st.slots.map(x => x.id));
        const earlier = all.filter(x => !inSlots.has(x.id));
        // your own copy keeps the variant (choose: it is written into the script); a published one only plays it (switchTo)
        const pickVariant = (sc, id) => { if (authoring && !opts.readOnly)
            v.choose(sc, id);
        else
            v.switchTo(sc, id); };
        const pill = el('div', 'vc');
        pill.appendChild(orbEl());
        // (2026-11-13) switching a variant is listening, not editing: it works in a published world too
        if (earlier.length) {
            const lt = el('button', 'n lt', '‹');
            lt.title = stripEarlier ? 'hide earlier variants' : 'earlier variants';
            lt.addEventListener('click', () => { stripEarlier = !stripEarlier; paintStrip(); });
            pill.appendChild(lt);
            if (stripEarlier)
                for (const e of earlier) {
                    const b = el('button', `n old${e.id === (authoring && !opts.readOnly ? st.inUse : st.playing) ? ' on' : ''}`, String(e.n ?? '·'));
                    b.title = `${e.n}${e.label ?? e.why ? `: ${e.label ?? e.why}` : ''}`;
                    b.addEventListener('click', () => { pickVariant(def.id, e.id); stripEarlier = false; paintStrip(); });
                    pill.appendChild(b);
                }
        }
        // lit: the one you hear (in a published world a switch only plays it, so playing and in use part)
        const lit = authoring && !opts.readOnly ? st.inUse : st.playing;
        for (const x of st.slots) {
            const b = el('button', `n${x.id === lit ? ' on' : ''}`, String(x.n));
            const xv = all.find(y => y.id === x.id), what = xv?.label ?? xv?.why;
            b.title = x.id === st.inUse ? `${x.n}${what ? `: ${what}` : ''}, in use` : `${x.n}${what ? `: ${what}` : ''}`;
            // against the one you hear: in a published world `inUse` never moves, so switching back to it did nothing (2026-11-13)
            b.addEventListener('click', () => { if (x.id !== lit)
                pickVariant(def.id, x.id); paintStrip(); });
            pill.appendChild(b);
        }
        // the one in use, by what a person would call it, when it has a name (its why is the hover)
        const cur = all.find(x => x.id === st.inUse);
        if (cur?.label) {
            const l = el('span', 'vl', cur.label);
            if (cur.why)
                l.title = cur.why;
            pill.appendChild(l);
        }
        row.append(pill, map);
    }
    // with no variants file, a script that declares its soundscapes still gets the mechanism (first drafts only)
    const declaresSoundscapes = () => { try {
        return (parseScene(script).soundscapes ?? []).length > 0;
    }
    catch {
        return false;
    } };
    if (opts.places)
        void mountPlaces(opts.places);
    // a script given by URL is text only once it has loaded (it is '' here): its soundscape blocks are read then, so a
    // world with blocks and no places file still gets its soundscapes (Jewelers Row, Palm Bay; 2026-11-13)
    else if (opts.places !== false)
        void documentsLoaded.then(() => { if (!destroyed && documentsReady && declaresSoundscapes())
            void mountPlaces(null); });
    const timer = setInterval(() => {
        if (engine.isPlaying)
            comparison?.stop();
        playBtn.textContent = engine.isPlaying ? 'stop' : 'play';
        if (root.dataset.collapsed === '1')
            return;
        paintUndo();
        if (view === 'mixer') {
            // a draft on the open card is the scene for now: do not rebuild the card from it
            if (renderedStatements !== engine.scriptStatements && !liveDrag && !card?.holding())
                buildMixer();
            syncMixer();
            syncHearing();
            if (scope === 'here')
                refreshList();
            else
                paintOffview();
            if (card && !inspector.hidden)
                card.refresh();
        }
        else if (view === 'log')
            syncLog();
        // a sound part waiting for the game's code: show the moment new objects arrive
        const t = performance.now();
        // tasks: every 4 s while one is out with the coding agent, else every 30 s
        if (canTask && documentsReady && t - taskPollAt > (taskRows.some(r => r.status !== 'done' && !!taskMeta[r.path]) ? 1500 : taskRows.some(r => r.status !== 'done') ? 4000 : 30_000)) {
            taskPollAt = t;
            void refreshTasks();
        }
        if (t - waitCheckAt > 2000) {
            waitCheckAt = t;
            if (thread.some(m => m.waiting && !m.waiting.done)) {
                const n = knownHosts().length;
                if (n !== waitHostCount) {
                    waitHostCount = n;
                    if (!cur.busy)
                        paintChat();
                }
            }
            // and whether the coding agent has marked its request done (read from the project's .satie/requests/)
            if (t - requestCheckAt > 6000 && convs.some(c => c.thread.some(m => m.waiting && !m.waiting.done && m.waiting.agentDone === undefined && m.requestPath))) {
                requestCheckAt = t;
                void checkRequests();
            }
        }
    }, 200);
    let waitCheckAt = 0, waitHostCount = -1, requestCheckAt = 0;
    async function checkRequests() {
        try {
            const r = await fetch(requestsUrl).then(x => x.json());
            if (!r.ok)
                return;
            let changed = false;
            for (const c of convs)
                for (const m of c.thread) {
                    if (!m.waiting || m.waiting.done || m.waiting.agentDone !== undefined || !m.requestPath)
                        continue;
                    const q = r.requests?.find(x => x.path === m.requestPath);
                    if (q?.status === 'done') {
                        m.waiting.agentDone = q.done ?? '';
                        changed = true;
                        record('request_done', { request: m.requestPath, note: q.done });
                    }
                }
            if (changed) {
                saveConvs();
                if (!cur.busy)
                    paintChat();
                if (chatWrap.dataset.fold === '1')
                    chatWrap.dataset.dot = '1';
            }
        }
        catch { /* no dev server: the new objects still show it */ }
    }
    /** What the game declares now, by kind (the contract the world layer read at load). */
    function gameHas() {
        return { object: (layer?.hosts?.() ?? []).map(h => h.id), event: (layer?.events?.() ?? []).map(e => e.name), signal: (layer?.signals?.() ?? []).map(x => x.name), state: (layer?.stateInfo?.() ?? []).map(x => x.name) };
    }
    async function sendTask(m, ui) {
        const t = ui.task;
        try {
            const r = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t.title, needs: t.needs, why: ui.text, about: t.about, aboutNames: t.about.map(id => voiceName({ sourceId: id, sound: id, line: -1 })), instruction: t.instruction, message: thread[thread.indexOf(m) - 1]?.text ?? '', missing: t.missing }) }).then(x => x.json());
            if (!r.ok || !r.path) {
                say(`could not write the task: ${r.error ?? 'is the satie vite plugin on?'}`);
                return;
            }
            m.taskPath = r.path;
            m.answered = true;
            taskMeta[r.path] = { instruction: t.instruction, missing: t.missing, before: gameHas(), sentAt: Date.now() };
            saveTaskMeta();
            record('task_sent', { path: r.path, title: t.title, missing: t.missing });
            await refreshTasks();
            paintChat();
        }
        catch {
            say('could not write the task: no dev server');
        }
    }
    /**
     * What happened after Send, said plainly: the task file is written and the line copied (or not), and
     * nothing reaches an agent until it reads the file. The card follows the file: waiting, taken, done.
     */
    function taskCardState(box, title, path) {
        const row = taskRows.find(r => r.path === path), status = row?.status ?? 'open', meta = taskMeta[path];
        const st = el('div', 'tstate');
        st.dataset.status = status;
        box.appendChild(st);
        // one short line for where it stands; a turning mark while something is still happening
        const head = (text, working) => {
            const h = el('div', 'big');
            if (working) {
                const sp = el('span', 'spin');
                sp.innerHTML = ICON.load;
                h.appendChild(sp);
            }
            h.appendChild(el('span', '', text));
            st.appendChild(h);
        };
        if (status === 'done') {
            head(meta?.bound ? 'Done. The sound is in.' : reloadHeld ? 'Done.' : 'Done. Adding the sound…', !meta?.bound && !reloadHeld);
            if (row?.done) {
                const n = el('div', 'pd note', row.done);
                n.title = row.done;
                st.appendChild(n);
            }
            if (!meta?.bound && reloadHeld) {
                const go = el('button', 'primary', 'Reload to hear it');
                go.title = 'you come back where you stand, and SATIE puts the sound in';
                go.addEventListener('click', reloadToPlay);
                st.appendChild(go);
            }
            return;
        }
        if (status === 'taken') {
            head('Your coding agent is working on it…', true);
            st.title = 'Keep playing: the game will not reload under you. If it stays here long, look at your agent\'s window: it may be asking for your OK.';
            return;
        }
        head('Waiting for your coding agent…', true);
        // agents that cannot watch (Codex, Cursor) need the task pasted: offered, never copied behind the developer's back
        const alt = el('div', 'alt');
        alt.appendChild(el('span', '', 'Not starting? '));
        const copy = el('button', 'link', 'Copy the task');
        copy.title = 'copies one line to paste into your coding agent (Codex, Cursor, any agent)';
        copy.addEventListener('click', () => {
            void navigator.clipboard?.writeText(taskCopyText(title, path)).then(() => { copy.textContent = 'Copied ✓'; hint.hidden = false; }, () => { copy.textContent = 'Copy failed'; ln.hidden = false; });
        });
        const hint = el('span', '', ' Now paste it into your agent.');
        hint.hidden = true;
        const ln = el('div', 'line', taskCopyText(title, path));
        ln.hidden = true;
        alt.append(copy, hint);
        st.append(alt, ln);
    }
    /** A task still out with the coding agent: taken, or sent from this machine and not done (old open files do not hold reloads). */
    const outstanding = (r) => r.status === 'taken' || (r.status !== 'done' && !!taskMeta[r.path]);
    async function refreshTasks(first = false) {
        if (!canTask || destroyed)
            return;
        let rows;
        try {
            const r = await fetch(requestsUrl, { cache: 'no-store' }).then(x => x.json());
            rows = (r.requests ?? []).map(x => ({ ...x, files: x.files ?? [], missing: x.missing ?? [] }));
        }
        catch {
            return;
        }
        const before = new Map(taskRows.map(r => [r.path, r.status]));
        taskRows = rows;
        for (const r of rows) {
            const was = before.get(r.path);
            if (!first && tasksLoaded && was !== undefined && was !== 'done' && r.status === 'done')
                taskDone(r);
            if (!first && tasksLoaded && was !== undefined && was !== r.status && r.status === 'taken')
                record('task_taken', { path: r.path });
        }
        const moved = rows.some(r => before.has(r.path) && before.get(r.path) !== r.status && thread.some(m => m.taskPath === r.path));
        tasksLoaded = true;
        if (moved && chatWrap.dataset.fold !== '1' && !cur.busy)
            paintChat();
        // the agent's code edits must not reload the game under the developer while a task is out
        void fetch('/__satie/hold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: rows.some(outstanding) }) }).catch(() => undefined);
        if (first)
            for (const r of rows)
                if (r.status === 'done' && taskMeta[r.path] && !taskMeta[r.path].bound)
                    void bindTask(r);
        if (chatWrap.dataset.fold !== '1' && !cur.busy)
            paintTasks();
    }
    function paintTasks() {
        const dayAgo = Date.now() - 24 * 3600_000;
        const shown = taskRows.filter(r => (r.status !== 'done' || (taskMeta[r.path]?.sentAt ?? 0) > dayAgo) && !thread.some(m => m.taskPath === r.path)).slice(-6);
        tasksEl.hidden = !shown.length;
        tasksEl.replaceChildren();
        if (!shown.length)
            return;
        tasksEl.appendChild(el('div', 'th', `Tasks for your coding agent`));
        for (const r of shown) {
            const row = el('div', 'trow');
            row.dataset.status = r.status;
            const status = r.status === 'done' ? 'done' : r.status === 'taken' ? 'taken' : 'open';
            row.append(el('span', 'ts', status), el('span', 'tl', r.title));
            const meta = taskMeta[r.path];
            if (r.status === 'done') {
                row.appendChild(el('span', 'tn', [r.done, meta?.bound ? 'its sound is in' : ''].filter(Boolean).join(' · ')));
                if (r.files.length)
                    row.title = `changed: ${r.files.join(', ')}`;
            }
            else {
                row.title = r.status === 'taken' ? 'your coding agent is on it' : 'waiting for your coding agent: paste the copied line to it, or it sees the task next time it reads .satie/now.md';
                const copy = el('button', 'link', 'copy');
                copy.title = 'copy the line to paste to your coding agent';
                copy.addEventListener('click', () => { void navigator.clipboard?.writeText(taskCopyText(r.title, r.path)).then(() => say('copied')); });
                row.appendChild(copy);
            }
            tasksEl.appendChild(row);
        }
    }
    /** The agent marked a task done: say so on top of whatever tab is open, light the chat tab and the launcher. */
    function taskDone(r) {
        record('task_done', { path: r.path, note: r.done, files: r.files });
        if (chatWrap.dataset.fold === '1')
            chatWrap.dataset.dot = '1';
        launch.dataset.dot = '1';
        const inSight = taskCardInSight(r.path);
        if (inSight && outsideBox.dataset.kind === 'task')
            outsideBox.hidden = true;
        // nothing in the game's code is waiting for a reload: the sound goes in now
        if (!reloadHeld && taskMeta[r.path] && !taskMeta[r.path].bound) {
            void bindTask(r, false);
            if (inSight)
                return;
        }
        if (!inSight)
            showTaskNews(r);
    }
    /** A task's card (this one, or any still out) is in the open thread of an open chat. */
    function taskCardInSight(path) {
        return chatWrap.dataset.fold !== '1' && root.dataset.collapsed !== '1' && thread.some(m => m.taskPath && (path ? m.taskPath === path : taskRows.some(r => r.path === m.taskPath && outstanding(r))));
    }
    function showTaskNews(r) {
        const box = outsideBox;
        box.replaceChildren();
        box.hidden = false;
        box.dataset.kind = 'task';
        const acts = el('div', 'acts');
        if (r) {
            box.appendChild(el('div', 'h', `Your coding agent finished: ${r.title}`));
            if (r.done)
                box.appendChild(el('div', 'ln', r.done));
            if (r.files.some(f => !/^none$/i.test(f)))
                box.appendChild(el('div', 'ln sub', `changed ${r.files.slice(0, 4).join(', ')}${r.files.length > 4 ? ` +${r.files.length - 4}` : ''}`));
        }
        else
            box.appendChild(el('div', 'h', 'Your game\'s code changed'));
        if (!r || reloadHeld)
            box.appendChild(el('div', 'ln sub', 'Reload to play it: you come back where you stand, and SATIE puts the sound in.'));
        const go = el('button', 'quiet', 'Reload');
        go.addEventListener('click', reloadToPlay);
        const later = el('button', 'quiet', 'later');
        later.addEventListener('click', () => { box.hidden = true; });
        acts.append(go, later);
        box.appendChild(acts);
        if (root.dataset.collapsed === '1') {
            outsideToast.textContent = r ? `Your coding agent finished: ${r.title} · Reload to play it` : 'Your game\'s code changed · open the mixer to reload';
            outsideToast.dataset.kind = 'changed';
            outsideToast.hidden = false;
        }
    }
    /** The plugin held a reload of the game (an agent's code edit while a task is out). */
    function onReloadHeld() {
        reloadHeld = true;
        chatWrap.dataset.dot = 'warn';
        launch.dataset.dot = 'warn';
        // a task card on screen already says where it stands, and offers Reload once it is done
        if (taskCardInSight()) {
            if (!cur.busy)
                paintChat();
            return;
        }
        if (outsideBox.hidden || outsideBox.dataset.kind !== 'task')
            showTaskNews(null);
    }
    const returnKey = `satie-return:${scriptUrl ?? 'scene'}`;
    function reloadToPlay() {
        try {
            sessionStorage.setItem(returnKey, JSON.stringify({ spot: layer?.whereYouStand?.() ?? null, open: root.dataset.collapsed !== '1', view, at: Date.now() }));
        }
        catch { /* a fresh start */ }
        record('task_reload', { held: reloadHeld });
        void fetch('/__satie/hold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) }).catch(() => undefined).finally(() => { location.reload(); });
    }
    /** After "Reload": back where the developer stood, the mixer as it was. */
    function comeBack() {
        let back = null;
        try {
            back = JSON.parse(sessionStorage.getItem(returnKey) ?? 'null');
            sessionStorage.removeItem(returnKey);
        }
        catch {
            back = null;
        }
        if (!back || Date.now() - back.at > 120_000)
            return;
        if (back.open) {
            view = back.view;
            api.open();
        }
        const spot = back.spot;
        if (spot && layer?.standAt) {
            // the game places its player as it starts: put them back once, then again in case it moved them
            setTimeout(() => layer?.standAt?.(spot), 600);
            setTimeout(() => layer?.standAt?.(spot), 2500);
        }
    }
    /**
     * A done task's sound goes in by the exact names it gave. If the agent named something else, a new
     * thing of the same kind stands in (one new one: used, and said; several: asked).
     */
    async function bindTask(r, jump = true) {
        const meta = taskMeta[r.path];
        if (!meta || meta.bound)
            return;
        const now = gameHas();
        const as = {};
        const unsure = [];
        for (const m of meta.missing) {
            if (now[m.kind].includes(m.id))
                continue;
            const fresh = now[m.kind].filter(id => !meta.before[m.kind]?.includes(id));
            if (fresh.length === 1)
                as[m.id] = fresh[0];
            else
                unsure.push(`${m.kind} ${m.id}${fresh.length ? ` (new: ${fresh.slice(0, 4).join(', ')})` : ''}`);
        }
        if (unsure.length) {
            thread.push({ role: 'satie', text: `Your coding agent finished "${r.title}", but I cannot find ${unsure.join('; ')} in the game yet. Tell me which one it is, or ask your agent to declare it under that name.` });
            paintChat();
            return;
        }
        meta.bound = true;
        meta.boundAs = as;
        saveTaskMeta();
        const renamed = Object.entries(as);
        const instruction = renamed.reduce((t, [from, to]) => t.replace(new RegExp(`\\b${from}\\b`, 'g'), to), meta.instruction);
        if (jump)
            setFolded(false);
        if (renamed.length)
            say(`your coding agent named ${renamed.map(([a, b]) => `${a.replace(/_/g, ' ')} "${b}"`).join(', ')}: SATIE uses that (undo takes it back)`);
        record('task_bind', { path: r.path, as });
        await sendChat(`Now that the game has it: ${instruction}`, true, `put in the sound for "${r.title}"`);
    }
    // ── outside edits, heard live (Part B, 2026-11-11): a coding agent or an editor changed the script on disk ──
    const watchUrl = opts.watchUrl === undefined ? '/__satie/watch' : opts.watchUrl;
    let watchSource = null;
    function watchOutside() {
        if (!watchUrl || !scriptUrl || opts.localStorageKey || !authoring || typeof EventSource === 'undefined' || destroyed || watchSource)
            return;
        // EventSource reconnects by itself when the dev server restarts
        watchSource = new EventSource(`${watchUrl}?path=${encodeURIComponent(scriptUrl)}`);
        watchSource.addEventListener('script', ev => {
            let info = {};
            try {
                info = JSON.parse(ev.data);
            }
            catch { /* the edit is still on disk */ }
            void takeOutsideEdit(info);
        });
        watchSource.addEventListener('reload', () => onReloadHeld());
    }
    /** The history's spine as OutsideEdits reads it: the last 80 steps, head first, each with its parent's script. */
    function historySteps() {
        return tree.spine().slice(0, 80).map(n => ({ kind: n.kind, label: n.label, at: n.at, script: n.snap.script, parentScript: nodeById(n.parentId)?.snap.script ?? null }));
    }
    /** A voice in the outside edit, by the name the mixer shows for it. */
    function voiceName(v) {
        const st = engine.scriptStatements.find(x => (v.sourceId && x.sourceId === v.sourceId) || (!v.sourceId && x.sourceLine === v.line));
        return st ? nameOf(st) : v.sound.replace(/^community\//, '').replace(/[_-]+/g, ' ');
    }
    async function takeOutsideEdit(info) {
        if (!scriptUrl || destroyed || !documentsReady)
            return;
        let text;
        try {
            const r = await fetch(scriptUrl, { cache: 'no-store' });
            if (!r.ok)
                return;
            text = await r.text();
        }
        catch {
            return;
        }
        if (destroyed || text === script)
            return;
        const before = script;
        const refused = unloadable(text, before);
        if (refused) {
            record('external_script_refused', { reason: refused });
            showOutside({ refused });
            return;
        }
        // an edit of yours still waiting to be saved would write over theirs; theirs is the scene now, and
        // what of yours it changed is offered back below
        if (savePending) {
            clearTimeout(saveTimer);
            savePending = false;
        }
        const { changes, clashes: hit } = clashes(before, text, historySteps());
        try {
            engine.loadScript(text);
        }
        catch (e) {
            showOutside({ refused: e instanceof Error ? e.message : String(e) });
            return;
        }
        script = text;
        editor.value = text;
        documentVersion++;
        gainOf.clear();
        dirty = false;
        commitHistory(versionTitle('changed outside the mixer', 'external', changes), 'external'); // the history row says who: outside the mixer
        record('external_script', { rebound: info.rebound ?? null, clashes: hit.length }, changes);
        // takes the edit brought (an agent realized them): the manifest on disk names them
        if (samplesUrl) {
            try {
                const disk = await fetch(samplesUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
                await Promise.all(Object.entries(disk ?? {}).filter(([k, e]) => e?.url && manifest[k]?.url !== e.url).map(async ([k, e]) => {
                    try {
                        engine.setAudioBuffer(k, await bufferFor(e.url));
                        manifest[k] = e;
                    }
                    catch { /* named below as not made yet */ }
                }));
            }
            catch { /* the script still plays */ }
        }
        if (view === 'mixer')
            buildMixer();
        else if (view === 'history')
            buildHistory();
        showOutside({ changes, clashes: hit, rebound: info.rebound ?? null, why: info.why });
    }
    let outsideTimer;
    function showOutside(o) {
        clearTimeout(outsideTimer);
        const box = outsideBox;
        box.replaceChildren();
        box.hidden = false;
        box.dataset.kind = o.refused ? 'refused' : o.clashes?.length ? 'clash' : 'changed';
        const close = () => { box.hidden = true; clearTimeout(outsideTimer); };
        const acts = el('div', 'acts');
        const btn = (label, title, run) => { const b = el('button', 'quiet', label); b.title = title; b.addEventListener('click', run); acts.appendChild(b); return b; };
        if (o.refused) {
            box.append(el('div', 'h', 'The script on disk does not load'), el('div', 'ln', `${o.refused}. Still playing the last one that did.`));
            btn('ok', 'keep playing what loads; fix the file and it is picked up again', close);
            box.appendChild(acts);
            return;
        }
        const changes = o.changes ?? [], hit = o.clashes ?? [];
        const others = changes.length - hit.length;
        if (root.dataset.collapsed === '1') {
            outsideToast.textContent = hit.length ? `Changed outside the mixer: ${clashLine(hit[0], voiceName)}, which you set · open the mixer` : `Playing an outside edit: ${versionTitle('', 'external', changes) || 'the script changed'}`;
            outsideToast.dataset.kind = hit.length ? 'clash' : 'changed';
            outsideToast.hidden = false;
            if (!hit.length)
                setTimeout(() => { outsideToast.hidden = true; }, 8000);
        }
        box.appendChild(el('div', 'h', hit.length ? `Changed outside the mixer: ${hit.length === 1 ? 'something' : `${hit.length} things`} you set` : `Changed outside the mixer · ${count(changes.length, 'change')}`));
        for (const c of hit.slice(0, 4)) {
            const ln = el('div', 'ln mine', `${clashLine(c, voiceName)} · you ${c.mine.kind === 'script_edit' ? 'wrote this' : 'set this by ear'}`);
            ln.title = `${c.mine.label}, ${new Date(c.mine.at).toLocaleString()}`;
            box.appendChild(ln);
        }
        if (!hit.length)
            box.appendChild(el('div', 'ln', versionTitle('', 'external', changes) || 'the script changed'));
        else if (others > 0)
            box.appendChild(el('div', 'ln sub', `and ${count(others, 'change')} that leave yours alone`));
        const missing = missingTakes(script);
        if (missing)
            box.appendChild(el('div', 'ln sub', `${count(missing, 'take')} not made yet: those sounds stay quiet until they are`));
        else if (o.rebound === false && o.why)
            box.appendChild(el('div', 'ln sub', `a reload would refuse it yet: ${o.why}`));
        if (hit.length) {
            btn('put mine back', 'your values go back; everything else the edit did stays', () => {
                const next = putMineBack(script, hit);
                if (next && applyScript(next, hit.length === 1 ? 'put back what you set' : `put back ${hit.length} things you set`, { kind: 'put_back', detail: { props: hit.map(c => ({ sourceId: c.change.voice.sourceId ?? null, prop: c.change.prop, to: c.mine.value })) } }))
                    close();
                else
                    say('could not put it back: edit the script');
            });
            btn('keep the change', 'the outside edit stays as it is', () => { record('external_kept', { clashes: hit.length }); close(); });
        }
        else {
            btn('undo', 'go back to before the outside edit (⌘Z does the same)', () => { undo(); close(); });
            btn('ok', 'keep it', close);
            outsideTimer = setTimeout(close, 15_000);
        }
        if (missing)
            btn('make them', 'buy the missing takes (about 1¢ each, capped)', () => { void fetchMissing(); });
        box.appendChild(acts);
    }
    // ── the live context box: what the developer sees, hears and just changed, for the project's coding agents ──
    // Written as .satie/now.md by the vite plugin (`satie.now/v1`, NowContext.ts). Checked every second; sent when
    // its text changed (at most every 2 s) and every 15 s otherwise, so its update time says whether it is live.
    const nowUrl = opts.localStorageKey ? null : opts.nowUrl === undefined ? '/__satie/now' : opts.nowUrl;
    let nowSent = '', nowSentAt = 0, nowBusy = false, nowFailures = 0;
    /** Where each sound is now: its nearest playing voice (one pass over the voices). */
    function soundPlaces() {
        const out = new Map();
        for (const v of engine.getTrackViews()) {
            if (!Number.isFinite(v.surfaceDistanceM))
                continue;
            const was = out.get(v.statementIndex);
            if (!was || v.surfaceDistanceM < was.d)
                out.set(v.statementIndex, { d: v.surfaceDistanceM, pos: [v.position.x, v.position.y, v.position.z] });
        }
        return out;
    }
    function nowSound(i, places) {
        const st = engine.scriptStatements[i];
        if (!st)
            return { name: `sound ${i}` };
        const p = isAround(st) ? undefined : (places ?? soundPlaces()).get(i);
        const me = engine.listenerPosition, fwd = engine.listenerForward;
        let like = '';
        try {
            like = describeOf(st);
        }
        catch { /* no description */ }
        return { name: nameOf(st), ...(st.sourceId ? { sourceId: st.sourceId } : {}),
            ...(st.hostRef ? { host: st.hostRef, hostName: hostName(st.hostRef) } : {}),
            ...(p ? { distanceM: p.d, direction: directionWords([me.x, me.y, me.z], [fwd.x, fwd.y, fwd.z], p.pos) } : {}),
            ...(like ? { like } : {}) };
    }
    /** What reaches the listener now, per sound, loudest first (the level model; muted and un-soloed sounds left out). */
    function levelsNow() {
        const best = new Map();
        const solo = engine.soloedIndices;
        for (const v of engine.levelReport().voices) {
            const i = v.statementIndex;
            if (!v.audible || !Number.isFinite(v.receivedDb) || isMuted(i) || (solo.size && !solo.has(i)))
                continue;
            if (v.receivedDb > (best.get(i) ?? -Infinity))
                best.set(i, v.receivedDb);
        }
        return [...best.entries()].sort((a, b) => b[1] - a[1]);
    }
    // ── moments: what stood out in the last five minutes, and when the developer left the game window ──
    // One-offs (from the event log) are followed for 1.5 s for their peak against the loudest other sound;
    // a loop counts when it becomes the loudest thing heard, 6 dB clear of the next or at 75 dB and up.
    const moments = new NowMoments();
    const pendingShots = new Map();
    let momentLog = -1, lastTop = -1, lastMomentSample = 0;
    function sampleMoments() {
        const t = Date.now();
        lastMomentSample = t;
        const log = engine.eventLog;
        if (log.version !== momentLog) {
            if (momentLog >= 0 && engine.isPlaying) {
                const events = log.snapshot();
                for (const e of events.slice(Math.max(0, events.length - (log.version - momentLog)))) {
                    if (e.kind === 'fire' && e.statementIndex >= 0 && !pendingShots.has(e.statementIndex))
                        pendingShots.set(e.statementIndex, { at: t, peak: -Infinity, above: -Infinity, sound: null });
                }
            }
            momentLog = log.version;
        }
        if (!engine.isPlaying) {
            pendingShots.clear();
            lastTop = -1;
            return;
        }
        const levels = levelsNow();
        let places;
        for (const [i, p] of pendingShots) {
            const db = levels.find(([j]) => j === i)?.[1];
            if (db !== undefined && db > p.peak) {
                const other = levels.find(([j]) => j !== i && !pendingShots.has(j))?.[1] ?? -Infinity;
                p.peak = db;
                p.above = db - other;
                p.sound = { ...nowSound(i, places ??= soundPlaces()), db };
            }
            if (t - p.at < 1500)
                continue;
            pendingShots.delete(i);
            if (p.sound && (p.above >= 3 || p.peak >= 75))
                moments.loud(p.at, `s${i}`, p.sound, p.above);
        }
        // a loop counts from when it starts to stand out (it may swell while already the loudest, like an arriving
        // train), and its entry follows its peak and how long it lasted while it keeps standing out
        const [top, second] = levels;
        const above = top ? top[1] - (second?.[1] ?? -Infinity) : -Infinity;
        const loudNow = top && engine.scriptStatements[top[0]]?.kind === 'loop' && !pendingShots.has(top[0]) && (above >= 6 || top[1] >= 75) ? top[0] : -1;
        if (loudNow >= 0) {
            const sound = { ...nowSound(loudNow, places ??= soundPlaces()), db: top[1] };
            if (loudNow !== lastTop)
                moments.loud(t, `s${loudNow}`, sound, above);
            else
                moments.still(t, `s${loudNow}`, sound, above);
        }
        lastTop = loudNow;
    }
    const momentTimer = setInterval(() => { if (!destroyed && (pendingShots.size || Date.now() - lastMomentSample >= 1000))
        sampleMoments(); }, 250);
    const onBlur = () => {
        if (!engine.isPlaying)
            return;
        const places = soundPlaces();
        moments.away(Date.now(), levelsNow().slice(0, 4).map(([i, db]) => ({ ...nowSound(i, places), db })));
        sendNow();
    };
    const onFocus = () => { moments.back(Date.now()); };
    addEventListener('blur', onBlur);
    addEventListener('focus', onFocus);
    // what the camera looks at: a ray through the whole scene (about 19 ms in Jewelers Row), so it is cast only
    // once the camera has held still for a second, once per pose, and never while the developer moves or turns
    let lookPose = null, lookSince = 0, lookCast = false;
    let lookHit = null;
    function stillLook() {
        if (!layer?.lookTarget)
            return null;
        const me = engine.listenerPosition, f = engine.listenerForward, t = performance.now();
        const p = lookPose;
        const same = !!p && Math.hypot(me.x - p[0], me.y - p[1], me.z - p[2]) < 0.2 && f.x * p[3] + f.y * p[4] + f.z * p[5] > 0.995;
        if (!same) {
            lookPose = [me.x, me.y, me.z, f.x, f.y, f.z];
            lookSince = t;
            lookCast = false;
            lookHit = null;
            return null;
        }
        if (!lookCast && t - lookSince >= 1000) {
            lookCast = true;
            lookHit = layer.lookTarget() ?? null;
        }
        return lookHit;
    }
    function nowSnapshot(closed) {
        const stmts = engine.scriptStatements;
        const at = Date.now();
        const places = soundPlaces();
        const picked = multiSel.size ? [...multiSel] : selIdx !== null ? [selIdx] : selGroupKey ? groupInfo.get(selGroupKey)?.members ?? [] : [];
        const heard = [], covered = [];
        const hear = engine.isPlaying ? hearNow() : new Map();
        let quietCount = 0;
        if (engine.isPlaying) {
            const order = [...hear.entries()].sort((a, b) => b[1].receivedDb - a[1].receivedDb);
            for (const [i, a] of order) {
                if (isMuted(i))
                    continue;
                if (a.marginDb >= 0)
                    heard.push({ ...nowSound(i, places), db: a.receivedDb });
                else
                    covered.push({ ...nowSound(i, places), ...(a.maskerId !== null && stmts[a.maskerId] ? { coveredBy: nameOf(stmts[a.maskerId]) } : {}) });
            }
            stmts.forEach((_, i) => { if (!hear.has(i) && !isMuted(i))
                quietCount++; });
        }
        const me = engine.listenerPosition, fwd = engine.listenerForward;
        const lh = layer?.listenerHost?.() ?? null;
        // around: the nearest placed sounds in every direction (not the listener's own), up to 10 within 25 m,
        // at least the nearest 3 wherever they are
        // the listener's own sounds (carried by it, or with no object and sitting where the listener is) are not "around"
        const placed = [...places.entries()].filter(([i, p]) => { const st = stmts[i]; return !!st && !isAround(st) && !(lh && st.hostRef === lh) && !(!st.hostRef && p.d < 1); }).sort((a, b) => a[1].d - b[1].d);
        const near = placed.filter(([, p]) => p.d <= 25).slice(0, 10);
        const around = (near.length >= 3 ? near : placed.slice(0, 3)).map(([i]) => {
            const a = hear.get(i);
            const state = isMuted(i) ? 'muted' : !a ? 'silent' : a.marginDb >= 0 ? 'heard' : 'covered';
            return { ...nowSound(i, places), state, ...(state === 'heard' ? { db: a.receivedDb } : {}),
                ...(state === 'covered' && a.maskerId !== null && stmts[a.maskerId] ? { coveredBy: nameOf(stmts[a.maskerId]) } : {}) };
        });
        // straight ahead: the nearest sound within 20 degrees of where the camera points (on screen, when the world says)
        const visible = layer?.visibleIndices ? new Set(layer.visibleIndices()) : null;
        const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
        let aheadIdx = -1, aheadD = Infinity;
        for (const [i, p] of placed) {
            if (visible && !visible.has(i))
                continue;
            const vx = p.pos[0] - me.x, vy = p.pos[1] - me.y, vz = p.pos[2] - me.z, vl = Math.hypot(vx, vy, vz);
            if (vl < 0.5 || p.d >= aheadD)
                continue;
            if ((vx * fwd.x + vy * fwd.y + vz * fwd.z) / (vl * fl) >= Math.cos(20 * Math.PI / 180)) {
                aheadIdx = i;
                aheadD = p.d;
            }
        }
        const look = stillLook();
        const recentEdits = [];
        for (let n = tree.head; n && recentEdits.length < 8; n = nodeById(n.parentId)) {
            recentEdits.push({ id: n.id, parentId: n.parentId, label: n.label, at: n.lastAt ?? n.at, by: n.kind === 'start' ? 'start' : n.kind === 'external' ? 'outside' : 'you' });
        }
        // a sound's object the game is not placing now is silent (a train between visits, or an id the game renamed);
        // only judged once the game reports any object at all
        const absentHosts = [];
        const reported = new Set(engine.externalHosts);
        if (reported.size) {
            const byHost = new Map();
            for (const st of stmts) {
                const h = st.hostRef;
                if (!h || h === lh || st.entityId || reported.has(h) || engine.externalHostsOf(h).length)
                    continue;
                const e = byHost.get(h) ?? { sounds: 0, ids: new Set() };
                e.sounds++;
                if (st.sourceId)
                    e.ids.add(st.sourceId);
                byHost.set(h, e);
            }
            for (const [host, e] of byHost)
                absentHosts.push({ host, name: hostName(host), sounds: e.sounds, sourceIds: [...e.ids] });
        }
        const unknown = layer?.unknownObjects?.() ?? { ids: [], total: 0 };
        return {
            version: 'satie.now/v1', at, scriptPath: scriptUrl ?? '', playing: engine.isPlaying, ...(closed ? { closed: true } : {}),
            listener: { position: [me.x, me.y, me.z], forward: [fwd.x, fwd.y, fwd.z], carriedBy: lh },
            lookingAt: look?.hostId ? { name: hostName(look.hostId), hostId: look.hostId, distanceM: Math.hypot(look.point[0] - me.x, look.point[1] - me.y, look.point[2] - me.z) } : null,
            ahead: aheadIdx >= 0 ? nowSound(aheadIdx, places) : null,
            selection: picked.length ? { ...(selGroupKey && !multiSel.size && selIdx === null ? { label: groupInfo.get(selGroupKey)?.label } : {}), sounds: picked.map(i => nowSound(i, places)), at: selectedAt } : null,
            around, heard, covered, quietCount, absentHosts,
            muted: [...engine.mutedIndices].map(i => stmts[i] ? nameOf(stmts[i]) : '').filter(Boolean),
            soloed: [...engine.soloedIndices].map(i => stmts[i] ? nameOf(stmts[i]) : '').filter(Boolean),
            moments: moments.recent(at),
            recentEdits, unsaved: dirty,
            newObjects: { ids: unknown.ids, total: unknown.total, ...(unknown.since ? { since: unknown.since } : {}) },
        };
    }
    function sendNow(closed = false) {
        if (!nowUrl || !scriptUrl || !documentsReady || nowFailures >= 3)
            return;
        let text;
        let snap;
        try {
            snap = nowSnapshot(closed);
            text = renderNow(snap);
        }
        catch {
            return;
        }
        if (!closed && nowFailures === 0 && nowSentAt)
            paintAgentSees(snap);
        const sig = nowSignature(text), t = Date.now();
        if (!closed && (nowBusy || t - nowSentAt < (sig !== nowSent ? 2000 : 15000)))
            return;
        nowBusy = true;
        nowSent = sig;
        nowSentAt = t;
        // three failures in a row (an older plugin without /__satie/now, no dev server): stop asking
        fetch(nowUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: scriptUrl, text }), keepalive: closed })
            .then(r => { nowFailures = r.ok ? 0 : nowFailures + 1; })
            .catch(() => { nowFailures++; })
            .finally(() => { nowBusy = false; });
    }
    function paintAgentSees(s, force = false) {
        if (!authoring)
            return; // a published scene: the box is the fork card
        agentSnap = s;
        const sel = s.selection?.sounds ?? [];
        const what = sel.length ? `${s.selection?.label ?? sel.slice(0, 2).map(x => x.name).join(', ')}${!s.selection?.label && sel.length > 2 ? ` +${sel.length - 2}` : ''}`
            : s.lookingAt ? `you look at ${s.lookingAt.name}` : 'nothing';
        const sig = JSON.stringify([what, s.heard.map(h => [h.name, Math.round(h.distanceM ?? -1)])]);
        agentSees.hidden = false;
        if (!force && agentSees.dataset.sig === sig)
            return;
        agentSees.dataset.sig = sig;
        agentSees.replaceChildren();
        const h = el('div', 'as-h', 'your coding agent sees');
        const r1 = el('div', 'as-r');
        r1.append(el('span', 'k', 'selected'), el('span', 'v', what));
        const r2 = el('div', 'as-r');
        r2.append(el('span', 'k', 'hearing'), el('span', 'v', s.heard.length === 1 ? '1 sound' : `${s.heard.length} sounds`));
        // a reminder, not a control (2026-11-12): pointing at it says what the agent reads, nothing to click
        const tip = el('div', 'as-tip');
        tip.append(el('div', 'tt', 'Your coding agent in the IDE already sees this, every second: what you select, and each sound you hear with its entity, distance and direction. Ask it about "this".'));
        if (s.heard.length) {
            const list = el('div', 'as-l');
            for (const x of s.heard.slice(0, 8)) {
                const r = el('div', 'as-s');
                r.append(el('span', 'n', x.name), el('span', 'w', [x.hostName ?? null, x.distanceM !== undefined ? `${Math.round(x.distanceM)} m` : 'all around', x.direction].filter(Boolean).join(' · ')));
                list.appendChild(r);
            }
            if (s.heard.length > 8)
                list.appendChild(el('div', 'as-s w', `+${s.heard.length - 8} more`));
            tip.appendChild(list);
        }
        agentSees.append(h, r1, r2, tip);
    }
    const nowTimer = setInterval(() => { if (!destroyed)
        sendNow(); }, 1000);
    // a reload or a closed tab: say so, so an agent does not read a stale box as live
    const onPageHide = () => sendNow(true);
    addEventListener('pagehide', onPageHide);
    let panelOpen = false;
    const api = {
        soundscapes() {
            const variants = soundscapeVariants;
            if (!variants)
                return null;
            return {
                variants,
                current: () => soundscapeNow,
                onChange: (cb) => { soundscapeCbs.add(cb); return () => soundscapeCbs.delete(cb); },
            };
        },
        open() {
            outsideToast.hidden = true;
            launch.dataset.dot = '0';
            // Mix against the live world: release a game's pointer lock so the panel and the world can be clicked.
            if (document.pointerLockElement)
                try {
                    document.exitPointerLock();
                }
                catch { /* not locked by this page */ }
            root.dataset.collapsed = '0';
            launch.hidden = true;
            render();
            if (!panelOpen) {
                panelOpen = true;
                layer?.setActive(true);
                opts.onOpenChange?.(true);
            }
        },
        close() {
            comparison?.stop();
            stopPreview();
            clearSelection();
            setHover(null, true);
            if (opts.mount)
                return;
            root.dataset.collapsed = '1';
            launch.hidden = opts.launcher === false;
            if (dirty)
                launch.textContent = 'SATIE · mixer (unsaved)';
            if (panelOpen) {
                panelOpen = false;
                layer?.setActive(false);
                opts.onOpenChange?.(false);
            }
        },
        toggle() { if (root.dataset.collapsed === '1')
            api.open();
        else
            api.close(); },
        openEdit,
        document: () => ({ script: bakeFaders(script), samples: structuredClone(manifest) }),
        apply: (text, note = 'applied') => applyScript(text, note),
        select: i => selectVoice(i, true),
        fetchMissing: async () => { const note = await fetchMissing(); const missing = missingTakes(script); return { missing, names: missing ? missingNames(script) : [], note }; },
        addRecording: (rec, position, loop = true) => addFound({ ...rec, sampleId: rec.sampleId ?? rec.clip, license: rec.license ?? '', attribution: rec.attribution ?? null, via: 'words', snippetPath: null, snippetUrl: null, durationMs: null }, loop, { findId: null, round: 0, position }),
        setScript(text) { const before = script; script = text; documentVersion++; gainOf.clear(); editor.value = text; commitHistory('changed outside the mixer', 'external'); record('external_script', {}, describeVoiceChanges(before, text)?.changes); if (view === 'mixer')
            buildMixer(); },
        edits() { return recorder?.toJSONL() ?? ''; },
        flushEdits() { return recorder?.flush() ?? Promise.resolve(); },
        destroy() { card?.close(); sendNow(true); clearInterval(nowTimer); clearInterval(momentTimer); removeEventListener('pagehide', onPageHide); removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); removeEventListener('pointerup', onListRelease); record('end', {}); flushOnLeave(); removeEventListener('pagehide', flushOnLeave); document.removeEventListener('visibilitychange', onHide); destroyed = true; sceneReview.destroy(); comparison?.destroy(); pinnedTake = null; clearInterval(timer); clearInterval(soundscapeTimer); removeEventListener('keydown', onKey); stopPreview(); auditionHandle?.stop(0.05); layer?.destroy(); if (editOpen)
            opts.editPanel?.close(); editSlot.remove(); watchSource?.close(); clearTimeout(outsideTimer); outsideToast.remove(); root.remove(); launch.remove(); style.remove(); },
    };
    const layerPanel = {
        select: (i, o) => { if (o?.add || making) {
            toggleMulti(i, true);
            return;
        } selectVoice(i, true); },
        toggleMany: indices => toggleMany(indices),
        release: indices => { if (making)
            toggleMany(indices);
        else
            clearSelection(); },
        selectMany: indices => {
            if (making) {
                toggleMany(indices);
                return;
            } // making a group: a thing clicked in the world joins it (or leaves)
            const key = [...groupInfo].find(([, g]) => indices.every(i => g.members.includes(i)))?.[0];
            // one object of a family (a car of 62): select its sounds and show them as its own group at the top
            const hostOf = new Set(indices.map(i => engine.scriptStatements[i]?.hostRef ?? null));
            const one = hostOf.size === 1 ? [...hostOf][0] : null;
            // (2026-11-13) a PART of an entity (the train's bogie, its horn) is not one of a family: its group is the whole
            // entity, so a click on the train opens the train, not a group of the one part's sounds
            const whole = one ? (wholeMap().get(one) ?? one) : null;
            const ofOneWhole = !!key && !!whole && (groupInfo.get(key)?.members ?? []).every(i => { const h = engine.scriptStatements[i]?.hostRef; return !h || h === whole || wholeMap().get(h) === whole; });
            // only a family (a class of objects: `family:` keys) shows its one object apart; a named group (the train) opens whole
            if (one && key && key.startsWith('family:') && !ofOneWhole && (groupInfo.get(key)?.members.length ?? 0) > indices.length) {
                focusHost = one;
                selIdx = null;
                selGroupKey = null;
                multiSel.clear();
                for (const i of indices)
                    multiSel.add(i);
                buildMixer();
                applySelection();
                body.scrollTop = 0; // the picked object's group is at the top, under the background box
                return;
            }
            if (key && scope === 'here' && !hereOpen.has(key)) {
                hereOpen.add(key);
                worldOpened = key;
                buildMixer();
            }
            else if (key && scope === 'all' && !allOpen.has(key)) {
                allOpen.add(key);
                worldOpened = key;
                buildMixer();
            }
            // picked, not toggled: a second click in the world lets go
            if (key) {
                selectGroup(key, true);
                refreshList('user');
                (groupInfo.get(key)?.header ?? rows.get(indices[0])?.row)?.scrollIntoView({ block: 'center' });
            }
            else if (indices.length)
                selectVoice(indices[0], true);
        },
        hover: i => setHover(i, false),
        clear: clearSelection,
        coveredWidth: () => root.dataset.collapsed === '1' ? 0 : root.getBoundingClientRect().width,
        corner: () => corner,
    };
    layer?.connect(layerPanel);
    /**
     * How many sounds the mixer lists on an object (2026-11-13): the world's tag says the same number as its row (the
     * vending machine's 5 counts the two you buy there, which play at you and so have no marker of their own).
     */
    let hostCounts = null;
    const soundsOnHost = (h) => {
        const stmts = engine.scriptStatements, now = performance.now();
        if (!hostCounts || hostCounts.n !== stmts.length || now - hostCounts.at > 1000) {
            const listenerHost = layer?.listenerHost?.() ?? null, parts = wholeMap(), m = new Map();
            const ctx = { families: new Map(), listenerHost, withOf: (ev) => layer?.eventInfo?.(ev)?.with, byOf: (ev) => layer?.eventInfo?.(ev)?.by, kinds: knownKinds, wholeOf: (x) => parts.get(x) };
            for (const st of stmts) {
                const k = objectKeyFor(st, ctx);
                if (k.startsWith('host:'))
                    m.set(k.slice(5), (m.get(k.slice(5)) ?? 0) + 1);
            }
            hostCounts = { at: now, n: stmts.length, m };
        }
        return hostCounts.m.get(wholeMap().get(h) ?? h);
    };
    layer?.setNamer?.(i => { const st = engine.scriptStatements[i]; return st ? nameOf(st) : ''; }, hostName, soundsOnHost);
    if (root.dataset.collapsed === '1')
        api.close();
    else
        api.open();
    return api;
}
//# sourceMappingURL=index.js.map