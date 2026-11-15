/**
 * The live context box (`satie.now/v1`): what the developer sees, hears and just changed in the
 * running game, written by the mixer as `.satie/now.md` (through the `satie-runtime/vite` plugin)
 * so any coding agent working on the project, with or without the SATIE MCP, can read it.
 *
 * It says where the developer is, never what they want: the header tells the reader that their
 * words win and the box only resolves pointing words. Each section answers one kind of pointing:
 * "this" (selected), "that one" (straight ahead), "here / behind me" (around), "that noise" (heard
 * now), "what was that" (recently: the last five minutes, so a sound that has stopped by the time
 * they switch to the terminal is still there, with the moment they switched), "why can't I hear X"
 * (not heard, and why), "undo that" (edits). Pure: the mixer collects a snapshot, this turns it
 * into text. The same state renders the same text (the mixer writes only when the text changes).
 */
const MAX_LIST = 15;
const round = (n) => Math.round(n);
const vec = (v, digits = 0) => `(${v.map(n => (digits ? Math.round(n * 10 ** digits) / 10 ** digits : Math.round(n))).join(', ')})`;
/** "14:02:31 UTC" from epoch ms. */
function clock(ms) { return new Date(ms).toISOString().slice(11, 19) + ' UTC'; }
/**
 * Which way `to` is from a listener at `from` facing `forward` (+Y up, three.js handedness): eight
 * sectors around ("ahead to the right"), "right here" within 1.5 m across, and "N m above/below" when
 * the height difference is at least 3 m and half the distance across.
 */
export function directionWords(from, forward, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const across = Math.hypot(dx, dz);
    let horiz = 'right here';
    const fl = Math.hypot(forward[0], forward[2]);
    if (across >= 1.5 && fl > 1e-6) {
        const fx = forward[0] / fl, fz = forward[2] / fl;
        // right = forward × up = (-fz, 0, fx)
        const ahead = dx * fx + dz * fz, right = dx * -fz + dz * fx;
        const deg = Math.atan2(right, ahead) * 180 / Math.PI; // 0 ahead, +90 right
        const a = Math.abs(deg), side = deg > 0 ? 'right' : 'left';
        horiz = a < 22.5 ? 'ahead' : a < 67.5 ? `ahead to the ${side}` : a < 112.5 ? `to the ${side}` : a < 157.5 ? `behind to the ${side}` : 'behind';
    }
    const vertical = Math.abs(dy) >= 3 && Math.abs(dy) >= across * 0.5 ? `${round(Math.abs(dy))} m ${dy > 0 ? 'above' : 'below'}` : '';
    return horiz === 'right here' && vertical ? vertical : [horiz, vertical].filter(Boolean).join(', ');
}
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1).replace(/[\s,]+\S*$/, '')}…` : s);
/** One sound as a line: its name, then what an agent needs to find it in the script and the world. */
function soundLine(s, extra = '') {
    const where = [s.sourceId ? `source_id \`${s.sourceId}\`` : '', s.host ? `on ${s.hostName && s.hostName !== s.host ? `${s.hostName} (\`${s.host}\`)` : `\`${s.host}\``}` : '',
        s.distanceM !== undefined && Number.isFinite(s.distanceM) ? (s.direction?.startsWith('right here') ? `${s.direction} (${round(s.distanceM)} m)` : `${round(s.distanceM)} m${s.direction ? ` ${s.direction}` : ' away'}`) : ''].filter(Boolean).join(', ');
    const like = s.like && s.like.toLowerCase() !== s.name.toLowerCase() ? `, sounds like "${short(s.like)}"` : '';
    return `- ${s.name}${where ? ` (${where})` : ''}${extra}${like}`;
}
function list(items, line = s => soundLine(s)) {
    const out = items.slice(0, MAX_LIST).map(line);
    if (items.length > MAX_LIST)
        out.push(`- and ${items.length - MAX_LIST} more`);
    return out;
}
const dbText = (db) => (db !== undefined && Number.isFinite(db) ? `about ${round(db)} dB` : '');
function stateText(s) {
    if (s.state === 'heard')
        return `: heard${s.db !== undefined ? `, ${dbText(s.db)}` : ''}`;
    if (s.state === 'covered')
        return `: playing but drowned out${s.coveredBy ? ` by ${s.coveredBy}` : ''}`;
    if (s.state === 'muted')
        return ': muted in the mixer';
    return ': silent right now';
}
function momentLine(m) {
    if (m.kind === 'back')
        return `- ${clock(m.at)}: they came back to the game.`;
    if (m.kind === 'away') {
        const heard = (m.heard ?? []).slice(0, 4).map(h => `${h.name}${h.sourceId ? ` (\`${h.sourceId}\`)` : ''}${h.db !== undefined ? ` ${dbText(h.db)}` : ''}`);
        return `- ${clock(m.at)}: they left the game window (usually to type to their agent). Heard at that moment: ${heard.length ? heard.join('; ') : 'nothing'}.`;
    }
    const s = m.sound;
    const when = m.times && m.times > 1 && m.lastAt ? `${clock(m.at)} to ${clock(m.lastAt)}, ${m.times} times`
        : m.lastAt && m.lastAt - m.at >= 2000 ? `${clock(m.at)} to ${clock(m.lastAt)}` : clock(m.at);
    const stood = m.aboveDb !== undefined && Number.isFinite(m.aboveDb) && m.aboveDb >= 1 ? `, ${round(m.aboveDb)} dB over everything else` : '';
    return `${soundLine(s, `: peaked at ${dbText(s.db)}${stood}`).replace(/^- /, `- ${when}: `)}`;
}
/** A sound in a few words: its name and the id that finds it in the script. */
const tag = (x) => `${x.name}${x.sourceId ? ` (\`${x.sourceId}\`)` : ''}`;
const DIR_SHORT = (x) => (x.distanceM !== undefined && Number.isFinite(x.distanceM) ? ` ${x.direction?.startsWith('right here') ? x.direction : `${round(x.distanceM)} m${x.direction ? ` ${x.direction}` : ''}`}` : '');
const STATE_SHORT = { heard: 'heard', covered: 'drowned out', muted: 'muted', silent: 'silent' };
/**
 * The first lines of the file: one line per kind of pointing, so an agent can read only the top on
 * every message about the world and read on only when this does not settle what the developer means.
 */
function glance(s) {
    const out = ['## At a glance', '',
        'Their words win; this only resolves pointing words ("this", "that one", "near me", "what was that"). Read the full sections below only when these lines do not settle it.', ''];
    out.push(`- Selected: ${s.selection?.sounds.length ? `${s.selection.label ? `"${s.selection.label}": ` : ''}${s.selection.sounds.slice(0, 3).map(tag).join(', ')}${s.selection.sounds.length > 3 ? `, and ${s.selection.sounds.length - 3} more` : ''} (at ${clock(s.selection.at)})` : 'nothing'}`);
    out.push(`- Straight ahead: ${s.ahead ? `${tag(s.ahead)}${DIR_SHORT(s.ahead)}` : 'no sound near the centre of the screen'}`);
    out.push(`- Nearest: ${s.around.length ? s.around.slice(0, 3).map(a => `${tag(a)}${DIR_SHORT(a)}${a.state ? `, ${STATE_SHORT[a.state]}` : ''}`).join('; ') : 'no placed sounds nearby'}`);
    out.push(`- Loudest now: ${!s.playing ? 'nothing, the audio is stopped' : s.heard.length ? s.heard.slice(0, 3).map(h => `${tag(h)}${h.db !== undefined ? ` ${round(h.db)} dB` : ''}`).join('; ') : 'nothing reaches the listener'}`);
    // the three newest sounds that stood out, newest first, and when they last left the game window (the
    // moment "what was that" usually points just before); coming back is left to the full section
    const loud = s.moments.filter(m => m.kind === 'loud').slice(0, 3).map(m => `${clock(m.lastAt ?? m.at)} ${tag(m.sound)} peaked at ${round(m.sound.db ?? NaN)} dB`);
    const left = s.moments.find(m => m.kind === 'away');
    out.push(`- Recently, newest first: ${loud.length ? loud.join('; ') : 'no sound stood out in the last 5 minutes'}`);
    if (left)
        out.push(`- Last left the game window: ${clock(left.at)}`);
    const edit = s.recentEdits.find(e => e.by !== 'start');
    out.push(`- Last edit: ${edit ? `${clock(edit.at)}, ${edit.by === 'you' ? 'by the developer in the mixer' : 'outside the mixer'}: ${edit.label}` : 'none since the scene was opened'}`, '');
    return out;
}
export function renderNow(s) {
    const out = [];
    out.push('# SATIE: what the developer sees and hears right now', '');
    out.push(s.closed
        ? `The game page was closed at ${clock(s.at)} (${new Date(s.at).toISOString().slice(0, 10)}). This is the last state the SATIE mixer saw.`
        : `Live context from the SATIE mixer in the running game (development only). Updated ${new Date(s.at).toISOString().slice(0, 10)} ${clock(s.at)}, every few seconds while the game page is open.`);
    out.push(`Scene: \`${s.scriptPath}\` (under the project's public folder).`, '');
    out.push('Levels below are dB SPL at the listener. Speak to the developer in loudness 0 to 1 (dB divided by 120: 0.25 a whisper, 0.5 talking, 0.75 very loud), never in dB.', '');
    out.push(...glance(s));
    out.push('How to read this: it shows where the developer is and what they hear, not what they want. When their words name a sound or an object, their words win; use this only to resolve pointing words, and ask when it is still ambiguous:', '- "this one": Selected in the mixer.', '- "that one", "the thing in front of me": Where they are (straight ahead).', '- "here", "near me", "behind me": Around them.', '- "that noise", "the loud one", "that buzzing": Heard now (match their words to "sounds like").', '- "what was that", or a sound that has stopped: Recently. They usually heard it just before they left the game window.', '- "why can\'t I hear X": Not heard right now, and why.', '- "undo that", "put it back": Edits.', 'Positions are metres, +Y up. If the update time is minutes old, the game is closed or in the background.', '');
    out.push('## Where they are', '');
    if (s.listener) {
        out.push(`- Standing at ${vec(s.listener.position)}${s.listener.forward ? `, facing ${vec(s.listener.forward, 2)}` : ''}${s.listener.carriedBy ? `, as \`${s.listener.carriedBy}\`` : ''}`);
    }
    if (s.ahead)
        out.push(`- Straight ahead (the sound nearest the centre of the screen): ${soundLine(s.ahead).slice(2)}`);
    else
        out.push('- Straight ahead: no sound near the centre of the screen.');
    if (s.lookingAt)
        out.push(`- Looking at the object: ${s.lookingAt.name === s.lookingAt.hostId ? `\`${s.lookingAt.hostId}\`` : `${s.lookingAt.name} (\`${s.lookingAt.hostId}\`)`}, ${round(s.lookingAt.distanceM)} m away`);
    out.push(`- Audio: ${s.playing ? 'playing' : 'stopped (nothing is heard)'}`, '');
    out.push('## Selected in the mixer', '');
    if (s.selection && s.selection.sounds.length) {
        out.push(`${s.selection.label ? `"${s.selection.label}", s` : 'S'}elected at ${clock(s.selection.at)}:`);
        out.push(...list(s.selection.sounds));
    }
    else
        out.push('Nothing selected.');
    out.push('');
    out.push('## Around them (nearest sounds in every direction, nearest first)', '');
    out.push(...(s.around.length ? list(s.around, a => soundLine({ ...a, like: undefined }, stateText(a))) : ['No placed sounds nearby.']), '');
    out.push('## Heard now, loudest first', '');
    if (!s.playing)
        out.push('Nothing: the audio is stopped.');
    else if (s.heard.length) {
        const lead = s.heard.length > 1 && s.heard[0].db !== undefined && s.heard[1].db !== undefined ? s.heard[0].db - s.heard[1].db : NaN;
        out.push(...list(s.heard, h => soundLine(h, h.db !== undefined ? `: ${dbText(h.db)}${h === s.heard[0] && lead >= 10 ? `, ${round(lead)} dB over the next loudest` : ''}` : '')));
    }
    else
        out.push('Nothing reaches the listener here.');
    out.push('');
    out.push('## Recently (last 5 minutes, newest first)', '');
    out.push(...(s.moments.length ? s.moments.slice(0, MAX_LIST).map(momentLine) : ['Nothing stood out yet.']), '');
    out.push('## Not heard right now, and why', '');
    const why = [];
    if (s.playing && s.covered.length)
        why.push('Playing but drowned out:', ...list(s.covered, c => soundLine({ ...c, like: undefined }, c.coveredBy ? `: under ${c.coveredBy}` : '')), '');
    if (s.muted.length)
        why.push(`Muted in the mixer: ${s.muted.join(', ')}.`, '');
    if (s.soloed.length)
        why.push(`Soloed in the mixer, so everything else is silent: ${s.soloed.join(', ')}.`, '');
    if (s.absentHosts.length) {
        why.push('Not in the world right now (the game is not reporting where these objects are; normal for something that comes and goes, but if one should be there, its id may have changed in the game code):');
        why.push(...s.absentHosts.slice(0, MAX_LIST).map(x => `- ${x.name === x.host ? `\`${x.host}\`` : `${x.name} (\`${x.host}\`)`}: ${x.sounds} sound${x.sounds === 1 ? '' : 's'}${x.sourceIds?.length ? ` (${x.sourceIds.slice(0, 6).map(id => `\`${id}\``).join(', ')}${x.sourceIds.length > 6 ? ', …' : ''})` : ''}`));
        if (s.absentHosts.length > MAX_LIST)
            why.push(`- and ${s.absentHosts.length - MAX_LIST} more`);
        why.push('');
    }
    if (s.playing && s.quietCount)
        why.push(`${s.quietCount} other sound${s.quietCount === 1 ? ' is' : 's are'} waiting for their moment (an event, a state, a time) or out of range here.`, '');
    if (!s.playing)
        why.push('The audio is stopped.', '');
    out.push(...(why.length ? why : ['Everything placed is heard.', '']));
    out.push('## Edits, newest first', '');
    const edits = s.recentEdits.filter(e => e.by !== 'start');
    if (edits.length) {
        for (const e of edits)
            out.push(`- ${clock(e.at)}, ${e.by === 'you' ? 'by the developer in the mixer' : 'outside the mixer'}: ${e.label} (version ${e.id}${e.parentId ? `, from ${e.parentId}` : ''})`);
    }
    else
        out.push('No changes since the scene was opened.');
    out.push('', s.unsaved ? 'The mixer has changes the script file does not have yet (it saves within seconds).' : 'Every mixer change is saved in the script file.', '');
    out.push('## New in the game scene', '');
    const n = s.newObjects;
    if (!n.ids.length)
        out.push('No new kinds of objects since SATIE first saw this scene.');
    else {
        const total = Math.max(n.total, n.ids.length);
        out.push(`${total} kind${total === 1 ? '' : 's'} of named object${total === 1 ? '' : 's'} appeared${n.since ? ` since SATIE first saw this scene (${new Date(n.since).toISOString().slice(0, 10)})` : ''} and ${total === 1 ? 'is' : 'are'} not in the sound contract: ${n.ids.map(id => `\`${id}\``).join(', ')}${total > n.ids.length ? ', …' : ''}.`);
        out.push('SATIE can give an object sound only once it is in the contract (declare it, then satie_inspect_scene / satie_integrate). Some may be decoration that needs no sound.');
    }
    out.push('');
    return out.join('\n');
}
/** The text without its update line: equal when nothing an agent would act on has changed. */
export function nowSignature(text) {
    return text.replace(/^(Live context from|The game page was closed at).*$/m, '');
}
/**
 * The last few minutes worth remembering, so "what was that?" still has an answer after the sound
 * stopped and the developer switched to their terminal. A sound standing out again within `mergeMs`
 * updates its entry (peak, count, last time) instead of adding one; a window switch shorter than
 * `blinkMs` is forgotten. Pure bookkeeping: the mixer decides what stood out.
 */
export class NowMoments {
    keepMs;
    mergeMs;
    blinkMs;
    cap;
    items = [];
    constructor(keepMs = 300_000, mergeMs = 30_000, blinkMs = 3_000, cap = 40) {
        this.keepMs = keepMs;
        this.mergeMs = mergeMs;
        this.blinkMs = blinkMs;
        this.cap = cap;
    }
    loud(at, key, sound, aboveDb) {
        const same = this.items.find(m => m.kind === 'loud' && m.key === key && at - (m.lastAt ?? m.at) <= this.mergeMs);
        if (same) {
            same.lastAt = at;
            same.times = (same.times ?? 1) + 1;
            if ((sound.db ?? -Infinity) > (same.sound?.db ?? -Infinity)) {
                same.sound = sound;
                same.aboveDb = aboveDb;
            }
            return;
        }
        this.push({ at, kind: 'loud', key, sound, aboveDb, times: 1 });
    }
    /** The same sound still standing out: follow its peak and how long it lasted, without counting it again. */
    still(at, key, sound, aboveDb) {
        const same = this.items.find(m => m.kind === 'loud' && m.key === key && at - (m.lastAt ?? m.at) <= this.mergeMs);
        if (!same) {
            this.loud(at, key, sound, aboveDb);
            return;
        }
        same.lastAt = at;
        if ((sound.db ?? -Infinity) > (same.sound?.db ?? -Infinity)) {
            same.sound = sound;
            same.aboveDb = aboveDb;
        }
    }
    away(at, heard) {
        if (this.items[this.items.length - 1]?.kind === 'away')
            return;
        this.push({ at, kind: 'away', heard });
    }
    back(at) {
        const last = this.items[this.items.length - 1];
        if (!last || last.kind !== 'away')
            return;
        if (at - last.at < this.blinkMs) {
            this.items.pop();
            return;
        }
        this.push({ at, kind: 'back' });
    }
    /** Within `keepMs` of `now`, newest first (by the last time each happened). */
    recent(now) {
        this.items = this.items.filter(m => now - (m.lastAt ?? m.at) <= this.keepMs);
        return this.items
            .map(({ key: _key, ...m }) => m)
            .sort((a, b) => (b.lastAt ?? b.at) - (a.lastAt ?? a.at));
    }
    push(m) {
        this.items.push(m);
        if (this.items.length > this.cap)
            this.items.splice(0, this.items.length - this.cap);
    }
}
//# sourceMappingURL=NowContext.js.map