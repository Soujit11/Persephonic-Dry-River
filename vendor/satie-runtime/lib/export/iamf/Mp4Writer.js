/**
 * Minimal ISO-BMFF writer for a single IAMF audio track — the shape YouTube
 * ingests as Eclipsa Audio (IAMF §6, "ISO-BMFF based IAMF Container").
 *
 * Deliberately narrow: one non-fragmented `moov`, one track, one sample
 * description, one chunk holding every sample. That is enough for an export
 * that is written all at once and read from a file, and it keeps the index
 * boxes down to a handful of entries.
 *
 * The IAMF-specific parts are the `iamf` sample entry carrying an `iacb`
 * configuration box with the descriptor OBUs, and the rule that one sample is
 * one Temporal Unit with no Temporal Delimiter OBU inside it (§6.2.5).
 */
import { ByteWriter, leb128Size } from './IamfObu.js';
/** Movie header timescale. Media time is kept at the audio sample rate. */
const MOVIE_TIMESCALE = 1000;
/** Seconds between the ISO-BMFF epoch (1904-01-01) and the Unix epoch. */
const EPOCH_OFFSET_S = 2082844800;
function box(type, ...payload) {
    let size = 8;
    for (const p of payload)
        size += p.length;
    const w = new ByteWriter(size);
    w.u32(size).fourcc(type);
    for (const p of payload)
        w.bytes(p);
    return w.finish();
}
/** A FullBox: an ordinary box whose payload starts with version and flags. */
function fullBox(type, version, flags, ...payload) {
    const head = new ByteWriter(4).u8(version).u8(flags >>> 16).u8(flags >>> 8).u8(flags).finish();
    return box(type, head, ...payload);
}
function ftyp() {
    return box('ftyp', new ByteWriter(20)
        .fourcc('iso6') // major_brand: the structural brand IAMF parsers must support
        .u32(0) // minor_version
        .fourcc('iso6')
        .fourcc('iamf') // required among the compatible brands (§6.1)
        .finish());
}
/** IAConfigurationBox (§6.2.4): the descriptors, verbatim, behind a leb128 size. */
function iacb(configObus) {
    const w = new ByteWriter(configObus.length + leb128Size(configObus.length) + 2);
    w.u8(1); // configurationVersion
    w.leb128(configObus.length);
    w.bytes(configObus);
    return box('iacb', w.finish());
}
/**
 * IASampleEntry (§6.2.3). channelcount and samplerate are both required to be
 * zero and parsers are required to ignore them: the real configuration is in
 * the descriptors, which can describe layouts the AudioSampleEntry cannot.
 */
function iamfSampleEntry(configObus) {
    const w = new ByteWriter(28);
    w.bytes(new Uint8Array(6)); // SampleEntry reserved
    w.u16(1); // data_reference_index
    w.u32(0).u32(0); // AudioSampleEntry reserved
    w.u16(0); // channelcount — SHALL be 0
    w.u16(16); // samplesize — ignored
    w.u16(0); // pre_defined
    w.u16(0); // reserved
    w.u32(0); // samplerate — SHALL be 0, and no SamplingRateBox
    return box('iamf', w.finish(), iacb(configObus));
}
/** Run-length encode the sample durations into stts entries. */
function stts(durations) {
    const entries = [];
    for (const delta of durations) {
        const last = entries[entries.length - 1];
        if (last && last.delta === delta)
            last.count++;
        else
            entries.push({ count: 1, delta });
    }
    const w = new ByteWriter(4 + entries.length * 8);
    w.u32(entries.length);
    for (const e of entries)
        w.u32(e.count).u32(e.delta);
    return fullBox('stts', 0, 0, w.finish());
}
/** Every sample lives in one chunk, so the sample-to-chunk map is one entry. */
function stsc(sampleCount) {
    return fullBox('stsc', 0, 0, new ByteWriter(16)
        .u32(1) // entry_count
        .u32(1) // first_chunk
        .u32(sampleCount)
        .u32(1) // sample_description_index
        .finish());
}
function stsz(samples) {
    const w = new ByteWriter(8 + samples.length * 4);
    w.u32(0); // sample_size 0 — sizes follow, one per sample
    w.u32(samples.length);
    for (const s of samples)
        w.u32(s.length);
    return fullBox('stsz', 0, 0, w.finish());
}
/** Chunk offset table. 64-bit when the single chunk starts past 4 GiB. */
function chunkOffset(offset) {
    if (offset <= 0xffffffff) {
        return fullBox('stco', 0, 0, new ByteWriter(8).u32(1).u32(offset).finish());
    }
    const w = new ByteWriter(12).u32(1);
    w.u32(Math.floor(offset / 0x100000000)).u32(offset >>> 0);
    return fullBox('co64', 0, 0, w.finish());
}
const UNITY_MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
function writeMatrix(w) {
    for (const v of UNITY_MATRIX)
        w.u32(v);
}
/**
 * Assemble the file. `mdat` is written before `moov` so the single chunk
 * offset is known without a second pass.
 */
export function writeIamfMp4(track) {
    if (track.samples.length === 0)
        throw new Error('an IAMF MP4 needs at least one Temporal Unit');
    if (track.samples.length !== track.sampleDurations.length) {
        throw new Error('every sample needs a duration');
    }
    const now = Math.floor(Date.now() / 1000) + EPOCH_OFFSET_S;
    const mediaDuration = track.sampleDurations.reduce((a, b) => a + b, 0);
    const movieDuration = Math.round((mediaDuration / track.sampleRate) * MOVIE_TIMESCALE);
    let mdatPayload = 0;
    for (const s of track.samples)
        mdatPayload += s.length;
    const ftypBox = ftyp();
    const mdatHeader = new ByteWriter(8).u32(mdatPayload + 8).fourcc('mdat').finish();
    const firstChunkOffset = ftypBox.length + mdatHeader.length;
    const mvhd = fullBox('mvhd', 0, 0, (() => {
        const w = new ByteWriter(96);
        w.u32(now).u32(now).u32(MOVIE_TIMESCALE).u32(movieDuration);
        w.u32(0x00010000); // rate 1.0
        w.u16(0x0100); // volume 1.0
        w.u16(0); // reserved
        w.u32(0).u32(0); // reserved
        writeMatrix(w);
        for (let i = 0; i < 6; i++)
            w.u32(0); // pre_defined
        w.u32(2); // next_track_ID
        return w.finish();
    })());
    const tkhd = fullBox('tkhd', 0, 0x7, (() => {
        const w = new ByteWriter(80);
        w.u32(now).u32(now).u32(1).u32(0).u32(movieDuration);
        w.u32(0).u32(0); // reserved
        w.u16(0); // layer
        w.u16(0); // alternate_group
        w.u16(0x0100); // volume 1.0 — an audio track
        w.u16(0); // reserved
        writeMatrix(w);
        w.u32(0).u32(0); // width / height
        return w.finish();
    })());
    const mdhd = fullBox('mdhd', 0, 0, new ByteWriter(20)
        .u32(now).u32(now).u32(track.sampleRate).u32(mediaDuration)
        .u16(0x55c4) // language 'und'
        .u16(0) // pre_defined
        .finish());
    const hdlr = fullBox('hdlr', 0, 0, (() => {
        const w = new ByteWriter(32);
        w.u32(0); // pre_defined
        w.fourcc('soun'); // handler_type
        w.u32(0).u32(0).u32(0); // reserved
        w.string('Satie IAMF');
        return w.finish();
    })());
    const dinf = box('dinf', fullBox('dref', 0, 0, new ByteWriter(4).u32(1).finish(), fullBox('url ', 0, 1)));
    const stbl = box('stbl', fullBox('stsd', 0, 0, new ByteWriter(4).u32(1).finish(), iamfSampleEntry(track.configObus)), stts(track.sampleDurations), stsc(track.samples.length), stsz(track.samples), chunkOffset(firstChunkOffset));
    const minf = box('minf', fullBox('smhd', 0, 0, new ByteWriter(4).u16(0).u16(0).finish()), dinf, stbl);
    const moov = box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlr, minf)));
    return new Blob([ftypBox, mdatHeader, ...track.samples, moov], { type: 'audio/mp4' });
}
//# sourceMappingURL=Mp4Writer.js.map