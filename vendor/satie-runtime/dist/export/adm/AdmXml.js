/**
 * BS.2076-1 ADM XML builder (objects-only programme), conforming to the
 * Dolby Atmos Master ADM Profile v1.0 — the subset Pro Tools' ADM import
 * actually accepts (arbitrary valid BS.2076 files fail silently there).
 *
 * Emits the full reference chain — audioProgramme → audioContent →
 * audioObject → audioPackFormat → audioChannelFormat (+ audioBlockFormat
 * position blocks) and audioStreamFormat/audioTrackFormat/audioTrackUID.
 * Common Definitions are not referenced: they cover channel beds, and this
 * export is objects-only.
 *
 * Dolby-profile conformance points (the ones that are easy to violate):
 * - Every audioObject has start="00:00:00.00000" and duration equal to the
 *   full programme length — voices that begin mid-programme are represented
 *   by their full-length stems, not by object timing.
 * - audioObjectID for Objects type lives in [0x100b, 0x1080].
 * - Every audioBlockFormat carries <jumpPosition interpolationLength=...>1
 *   (0 samples for the first block, 250 samples for the rest): blocks are
 *   discrete sampled position events, NOT block-length interpolation ramps.
 *   Importers draw straight lines only between events < 30 ms apart, so the
 *   exporter feeds this builder a dense (10 ms) event grid during motion.
 *
 * Timing: event times arrive on a 10 ms grid (integer centiseconds), which
 * renders exactly in 5-fractional-digit timecodes — consecutive blocks tile
 * the programme with zero string-rounding drift.
 *
 * String templating on purpose: no DOM dependency, runs under Node in tests.
 */
/**
 * IDs for object k (0-based). Format IDs use the 0x1001+k convention;
 * audioObjectIDs start at 0x100b — the Dolby profile reserves the Objects
 * range [0x100b, 0x1080] (0x1001–0x100a belong to DirectSpeakers beds).
 */
export function admIdsFor(k) {
    const h = (0x1001 + k).toString(16).padStart(4, '0');
    const uidHex = (k + 1).toString(16).padStart(8, '0');
    return {
        objectId: `AO_${(0x100b + k).toString(16).padStart(4, '0')}`,
        packId: `AP_0003${h}`,
        channelId: `AC_0003${h}`,
        streamId: `AS_0003${h}`,
        trackId: `AT_0003${h}_01`,
        uid: `ATU_${uidHex}`,
        trackRef: `AT_0003${h}_01`,
        packRef: `AP_0003${h}`,
    };
}
/** Format seconds as an ADM timecode: hh:mm:ss.zzzzz (5 fractional digits). */
export function admTimecode(seconds) {
    const total = Math.max(0, seconds);
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    const ssStr = ss.toFixed(5).padStart(8, '0');
    return `${pad(hh)}:${pad(mm)}:${ssStr}`;
}
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtCoord(v) {
    return v.toFixed(5);
}
function blockXml(channelId, blockIndex, b, rampSeconds) {
    const id = `AB_${channelId.slice(3)}_${(blockIndex + 1).toString(16).padStart(8, '0')}`;
    // Dolby profile: every block is a discrete position event — jumpPosition=1
    // with a 0-sample ramp on the first block and a 250-sample ramp after.
    const interpLen = blockIndex === 0 ? '0.0' : rampSeconds.toFixed(6);
    return `        <audioBlockFormat audioBlockFormatID="${id}" rtime="${admTimecode(b.rtime)}" duration="${admTimecode(b.duration)}">
          <cartesian>1</cartesian>
          <position coordinate="X">${fmtCoord(b.position.x)}</position>
          <position coordinate="Y">${fmtCoord(b.position.y)}</position>
          <position coordinate="Z">${fmtCoord(b.position.z)}</position>
          <jumpPosition interpolationLength="${interpLen}">1</jumpPosition>
        </audioBlockFormat>`;
}
/** Build the complete `axml` payload for an objects-only ADM programme. */
export function buildAdmXml(objects, opts) {
    const programmeName = esc(opts.programmeName ?? 'Satie Export');
    const progStart = admTimecode(0);
    const progEnd = admTimecode(opts.durationSeconds);
    const contentRefs = objects.map((_, k) => `      <audioObjectIDRef>${admIdsFor(k).objectId}</audioObjectIDRef>`).join('\n');
    // Dolby profile: every object spans the entire programme from zero — the
    // stems are full-length, so a voice's timing lives in its audio, not here.
    const objectsXml = objects.map((o, k) => {
        const ids = admIdsFor(k);
        return `    <audioObject audioObjectID="${ids.objectId}" audioObjectName="${esc(o.name)}" start="${progStart}" duration="${progEnd}">
      <audioPackFormatIDRef>${ids.packId}</audioPackFormatIDRef>
      <audioTrackUIDRef>${ids.uid}</audioTrackUIDRef>
    </audioObject>`;
    }).join('\n');
    const packsXml = objects.map((o, k) => {
        const ids = admIdsFor(k);
        return `    <audioPackFormat audioPackFormatID="${ids.packId}" audioPackFormatName="${esc(o.name)}" typeLabel="0003" typeDefinition="Objects">
      <audioChannelFormatIDRef>${ids.channelId}</audioChannelFormatIDRef>
    </audioPackFormat>`;
    }).join('\n');
    const rampSeconds = 250 / opts.sampleRate; // Dolby profile: 250-sample ramps
    const channelsXml = objects.map((o, k) => {
        const ids = admIdsFor(k);
        const blocks = o.blocks.map((b, i) => blockXml(ids.channelId, i, b, rampSeconds)).join('\n');
        return `    <audioChannelFormat audioChannelFormatID="${ids.channelId}" audioChannelFormatName="${esc(o.name)}" typeLabel="0003" typeDefinition="Objects">
${blocks}
    </audioChannelFormat>`;
    }).join('\n');
    const streamsXml = objects.map((o, k) => {
        const ids = admIdsFor(k);
        return `    <audioStreamFormat audioStreamFormatID="${ids.streamId}" audioStreamFormatName="PCM_${esc(o.name)}" formatLabel="0001" formatDefinition="PCM">
      <audioChannelFormatIDRef>${ids.channelId}</audioChannelFormatIDRef>
      <audioTrackFormatIDRef>${ids.trackId}</audioTrackFormatIDRef>
    </audioStreamFormat>
    <audioTrackFormat audioTrackFormatID="${ids.trackId}" audioTrackFormatName="PCM_${esc(o.name)}" formatLabel="0001" formatDefinition="PCM">
      <audioStreamFormatIDRef>${ids.streamId}</audioStreamFormatIDRef>
    </audioTrackFormat>
    <audioTrackUID UID="${ids.uid}" sampleRate="${opts.sampleRate}" bitDepth="${opts.bitDepth}">
      <audioTrackFormatIDRef>${ids.trackId}</audioTrackFormatIDRef>
      <audioPackFormatIDRef>${ids.packId}</audioPackFormatIDRef>
    </audioTrackUID>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<ebuCoreMain xmlns="urn:ebu:metadata-schema:ebuCore_2016" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xml:lang="en">
  <coreMetadata>
    <format>
      <audioFormatExtended>
        <audioProgramme audioProgrammeID="APR_1001" audioProgrammeName="${programmeName}" start="${progStart}" end="${progEnd}">
          <audioContentIDRef>ACO_1001</audioContentIDRef>
        </audioProgramme>
        <audioContent audioContentID="ACO_1001" audioContentName="Objects">
${contentRefs}
          <dialogue mixedContentKind="0">2</dialogue>
        </audioContent>
${objectsXml}
${packsXml}
${channelsXml}
${streamsXml}
      </audioFormatExtended>
    </format>
  </coreMetadata>
</ebuCoreMain>
`;
}
/**
 * Convert a position-event timeline into ADM blocks (Dolby event semantics).
 *
 * Each point is a discrete event: its position takes effect AT its rtime
 * (via jumpPosition with a 250-sample ramp), and its block lasts until the
 * next event. An event at t=0 is synthesized when the timeline starts later
 * (the voice's audio is silent before then, but the object must still have a
 * pinned position), consecutive events at the same position are merged, and
 * the final block holds to the full object duration — so the blocks always
 * tile [0, objectDuration] contiguously.
 */
export function blocksFromTimeline(points, objectDuration) {
    if (points.length === 0)
        return [];
    const samePos = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
    const events = [];
    if (points[0].t > 0)
        events.push({ t: 0, position: points[0].position });
    for (const p of points) {
        if (p.t >= objectDuration)
            break; // an event at/after the end has no block
        const prev = events[events.length - 1];
        if (prev && samePos(prev.position, p.position))
            continue;
        events.push(p);
    }
    return events.map((e, i) => ({
        rtime: e.t,
        duration: (i + 1 < events.length ? events[i + 1].t : objectDuration) - e.t,
        position: e.position,
    }));
}
//# sourceMappingURL=AdmXml.js.map