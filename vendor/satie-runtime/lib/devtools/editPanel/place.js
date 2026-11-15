/**
 * Where a scene's sounds sit on the library map (docs/specs/015-edit-panel). A sound whose take is a
 * library recording sits on that recording. A generated sound has no map position of its own, so it
 * sits among the recordings its words match best (name and tags), and those are its neighbours: the
 * candidates the panel names when you zoom in. Pure, so it is tested without a browser.
 */
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'with', 'in', 'on', 'at', 'to', 'by', 'its', 'from', 'for', 'into', 'over', 'along', 'small', 'large', 'close', 'dry', 'recording', 'isolated', 'seamless', 'loop', 'ambience', 'consistent', 'texture', 'steady', 'steadily', 'short', 'long', 'single', 'gentle', 'light', 'soft', 'clear', 'distant', 'near', 'far', 'one', 'two', 'three', 'sound', 'sounds', 'audio', 'take', 'no', 'reverb', 'room', 'tone']);
/** Words worth matching on: lower case, no stop words, a plural reduced to its singular. */
export function wordsOf(text) {
    return [...new Set(text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.length > 4 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))];
}
/** Production notes a generated recording's description carries, which say nothing about the sound. */
const BOILER = /^(?:(?:close|very close|dry|clean|isolated|single sound event|one shot|studio|mono)[ ,]*)+(?:recording)?(?: without reverb(?:eration)?| with no reverb)?$|\b(?:no|without) (?:reverb|reverberation|echo|room tone|background|music|voices)\b|\bseamless loop\b|\bdry recording\b/i;
/** A library description as the card shows it: its production notes left out, the rest as written. */
export function plainDescription(text) {
    const parts = text.split(/,\s*/).map(s => s.trim()).filter(s => s && !BOILER.test(s));
    const out = [...new Set(parts.map(s => s.toLowerCase()))].map(l => parts.find(s => s.toLowerCase() === l)).join(', ').replace(/[.\s]+$/, '');
    return out ? out[0].toUpperCase() + out.slice(1) + '.' : '';
}
export function indexMap(sounds) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of sounds) {
        x0 = Math.min(x0, s.x);
        x1 = Math.max(x1, s.x);
        y0 = Math.min(y0, s.y);
        y1 = Math.max(y1, s.y);
    }
    const span = Math.max(x1 - x0, y1 - y0) || 1, ox = (span - (x1 - x0)) / 2, oy = (span - (y1 - y0)) / 2;
    const xy = new Float32Array(sounds.length * 2), byId = new Map(), words = new Map();
    sounds.forEach((s, i) => {
        xy[i * 2] = (s.x - x0 + ox) / span;
        xy[i * 2 + 1] = (s.y - y0 + oy) / span;
        byId.set(s.id, i);
        for (const w of wordsOf(`${s.n.replace(/-/g, ' ')} ${s.t.join(' ')}`)) {
            const l = words.get(w);
            if (l)
                l.push(i);
            else
                words.set(w, [i]);
        }
    });
    return { sounds, xy, byId, words };
}
/** The recordings that best match these words, best first (rare words count most). */
export function matches(ix, text, limit = 12) {
    const score = new Map(), N = ix.sounds.length || 1;
    for (const w of wordsOf(text)) {
        const hits = ix.words.get(w);
        if (!hits)
            continue;
        const idf = Math.log(1 + N / hits.length);
        for (const i of hits)
            score.set(i, (score.get(i) ?? 0) + idf);
    }
    return [...score].map(([i, s]) => ({ i, score: s })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit);
}
/**
 * A sound's place: on its own library take when it has one, else the weighted middle of the best few
 * matches for its words (and name). Null when nothing matches at all.
 */
export function placeSound(ix, s) {
    const own = s.takes.map(t => (t.sampleId ? ix.byId.get(t.sampleId) : undefined)).find((i) => i !== undefined);
    const m = matches(ix, `${s.name} ${s.name} ${s.words ?? ''} ${s.takes.map(t => t.name.replace(/[-_#]/g, ' ')).join(' ')}`, 14);
    if (own !== undefined)
        return { u: ix.xy[own * 2], v: ix.xy[own * 2 + 1], near: m.map(x => x.i).filter(i => i !== own), exact: true };
    if (!m.length)
        return null;
    // the middle of the best matches, only those near the best one (a stray word lands far away)
    const top = m.slice(0, 5), bu = ix.xy[top[0].i * 2], bv = ix.xy[top[0].i * 2 + 1];
    const close = top.filter(x => Math.hypot(ix.xy[x.i * 2] - bu, ix.xy[x.i * 2 + 1] - bv) < 0.12);
    let u = 0, v = 0, w = 0;
    for (const x of close) {
        u += ix.xy[x.i * 2] * x.score;
        v += ix.xy[x.i * 2 + 1] * x.score;
        w += x.score;
    }
    return { u: u / w, v: v / w, near: m.map(x => x.i), exact: false };
}
/** The shortest tree joining points (Prim's): the bubble a thing draws round its sounds. */
export function spanningTree(pts) {
    const inT = [0], edges = [];
    while (inT.length < pts.length) {
        let best = null;
        for (const a of inT)
            for (let b = 0; b < pts.length; b++) {
                if (inT.includes(b))
                    continue;
                const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
                if (!best || d < best[2])
                    best = [a, b, d];
            }
        if (!best)
            break;
        inT.push(best[1]);
        edges.push([best[0], best[1]]);
    }
    return edges;
}
/**
 * The library's answers to a search, grouped where they sit on the map (2026-11-13): answers closer than `gap` join one
 * group (single linkage), the one with the best answer first, each named by the words its recordings share most that the search did not
 * say ("propeller", "jet flyby"), so you can tell the groups apart and go to the one you want. Pure.
 */
export function clusterResults(ix, idx, words, gap = 0.035) {
    const n = idx.length, root = idx.map((_, k) => k);
    const find = (k) => (root[k] === k ? k : (root[k] = find(root[k])));
    for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
            const ia = idx[a], ib = idx[b];
            if (Math.hypot(ix.xy[ia * 2] - ix.xy[ib * 2], ix.xy[ia * 2 + 1] - ix.xy[ib * 2 + 1]) < gap)
                root[find(b)] = find(a);
        }
    const groups = new Map();
    idx.forEach((i, k) => { const r = find(k); groups.set(r, [...(groups.get(r) ?? []), i]); });
    const said = new Set(wordsOf(words));
    // the group holding the best answer first (the search's order is best first: a propeller plane before the birds it
    // also found), then the bigger
    const rank = new Map(idx.map((i, k) => [i, k]));
    const best = (g) => Math.min(...g.map(i => rank.get(i) ?? Infinity));
    return [...groups.values()].sort((a, b) => best(a) - best(b) || b.length - a.length).map(g => {
        const u = g.reduce((q, i) => q + ix.xy[i * 2], 0) / g.length, v = g.reduce((q, i) => q + ix.xy[i * 2 + 1], 0) / g.length;
        const r = Math.max(...g.map(i => Math.hypot(ix.xy[i * 2] - u, ix.xy[i * 2 + 1] - v)));
        const count = new Map();
        for (const i of g)
            for (const w of wordsOf(`${ix.sounds[i].n.replace(/-/g, ' ')} ${ix.sounds[i].t.join(' ')}`))
                if (!said.has(w))
                    count.set(w, (count.get(w) ?? 0) + 1);
        const top = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(x => x[0]);
        return { label: top.length ? top.join(' · ') : ix.sounds[g[0]].n.split('-').slice(0, 2).join(' '), idx: g, u, v, r };
    });
}
//# sourceMappingURL=place.js.map