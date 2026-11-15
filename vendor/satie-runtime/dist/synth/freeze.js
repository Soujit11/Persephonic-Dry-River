/** Browser audition/export of the same Csound orchestra used live. */
import { compileCsound } from './csound.js';
import { attachSynthAsset, readSynthAsset } from './asset.js';
export async function freezeSynthAsset(context, raw) {
    const asset = readSynthAsset(raw);
    if (!asset)
        throw new Error('Invalid synth asset');
    const { Csound } = await import('@csound/browser');
    const cs = await Csound({ useWorker: true, useSAB: false, autoConnect: false });
    if (!cs)
        throw new Error('Csound could not start');
    let timer;
    try {
        const overlap = asset.loop ? .25 : 0, warmup = asset.loop ? asset.seconds : 0;
        const end = warmup + asset.seconds + overlap;
        const csd = compileCsound(asset, context.sampleRate)
            .replace('-d -m0 -odac', '-d -m0 -o frozen.wav -W -s')
            .replace('f 0 z', `i 999 ${end} 0.001\nf 0 ${end + 1}`);
        if (await cs.compileCSD(csd, 1) !== 0)
            throw new Error('Synth render did not compile');
        const ended = new Promise((resolve, reject) => {
            cs.on('renderEnded', resolve);
            timer = setTimeout(() => reject(new Error('Synth render timed out')), 90_000);
        });
        // Observe timeout even if start itself fails.
        void ended.catch(() => { });
        if (await cs.start() !== 0)
            throw new Error('Synth render could not start');
        await ended;
        const bytes = await cs.fs.readFile('frozen.wav');
        const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer);
        const sr = decoded.sampleRate, offset = Math.round(warmup * sr), length = Math.round(asset.seconds * sr);
        if (decoded.length < offset + length)
            throw new Error('Synth render ended early');
        const result = context.createBuffer(2, length, sr);
        for (let channel = 0; channel < 2; channel++) {
            const source = decoded.getChannelData(channel), target = result.getChannelData(channel);
            target.set(source.subarray(offset, offset + length));
            if (asset.loop) {
                const fade = Math.min(Math.round(overlap * sr), decoded.length - offset - length);
                for (let i = 0; i < fade; i++) {
                    const gain = i / (fade - 1);
                    target[i] = source[offset + length + i] * (1 - gain) + target[i] * gain;
                }
            }
            else {
                const fade = Math.min(length, Math.round(.08 * sr));
                for (let i = 0; i < fade; i++)
                    target[length - 1 - i] *= i / fade;
            }
        }
        attachSynthAsset(result, asset);
        return result;
    }
    finally {
        if (timer)
            clearTimeout(timer);
        await cs.terminateInstance();
    }
}
//# sourceMappingURL=freeze.js.map