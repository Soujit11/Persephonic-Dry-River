import { compileCsound } from './csound.js';
const instances = new WeakMap();
export const MAX_LIVE_SYNTHS = 8;
async function createCsound(ctx) {
    const { Csound } = await import('@csound/browser');
    const csound = await Csound({ audioContext: ctx, autoConnect: false, useWorker: false, useSAB: false });
    if (!csound)
        throw new Error('Csound could not start');
    return csound;
}
/** The source lifecycle used by Satie's scheduler. PCM remains available for compatible exports. */
export class LiveSynthSource {
    ctx;
    asset;
    report;
    factory;
    buffer = null;
    loop = false;
    onended = null;
    playbackRate;
    output;
    csound = null;
    disposed = false;
    ended = false;
    started = false;
    reserved = false;
    stopAt = Infinity;
    sampled = new Map();
    controls = { pitch: 1, brightness: 1, tempo: 1 };
    /** Resolves only after Csound has compiled and started, or throws a reported startup error. */
    ready = Promise.resolve();
    constructor(ctx, asset, report, factory = createCsound) {
        this.ctx = ctx;
        this.asset = asset;
        this.report = report;
        this.factory = factory;
        this.output = ctx.createGain();
        this.output.gain.value = 0;
        const controls = this.controls;
        const updatePitch = (value) => this.control('pitch', value);
        this.playbackRate = {
            get value() { return controls.pitch; },
            set value(v) { updatePitch(v); },
            setValueAtTime: updatePitch,
            setTargetAtTime: updatePitch,
        };
    }
    connect(destination) { this.output.connect(destination); }
    disconnect() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.output.disconnect();
        void this.release();
    }
    sampleControl(name, range, rng) {
        let entry = this.sampled.get(name);
        if (!entry || entry.range !== range) {
            entry = { range, value: range.isNull ? 1 : range.sample(rng) };
            this.sampled.set(name, entry);
        }
        return entry.value;
    }
    setControl(name, value) { this.control(name, value); }
    control(name, raw) {
        if (!Number.isFinite(raw) || this.disposed)
            return;
        const value = Math.max(name === 'brightness' ? .05 : .1, Math.min(name === 'brightness' ? 8 : 4, raw));
        if (Math.abs(value - this.controls[name]) < .0001)
            return;
        this.controls[name] = value;
        if (this.csound)
            void this.csound.setControlChannel(name, value).catch(() => this.fail('Synth control could not be updated'));
    }
    start(when = this.ctx.currentTime, _offset = 0) {
        if (this.started)
            throw new Error('Synth source already started');
        this.started = true;
        this.ready = this.begin(when);
        // Scheduler callers do not await sources. Failures remain visible, never become sample playback.
        void this.ready.catch(e => this.fail(e instanceof Error ? e.message : 'Csound startup failed'));
    }
    async begin(when) {
        if (this.disposed)
            return;
        const count = instances.get(this.ctx) ?? 0;
        if (count >= MAX_LIVE_SYNTHS)
            throw new Error(`At most ${MAX_LIVE_SYNTHS} live synth voices can play at once`);
        instances.set(this.ctx, count + 1);
        this.reserved = true;
        const cs = await this.factory(this.ctx);
        this.csound = cs;
        if (this.disposed || this.stopAt <= this.ctx.currentTime) {
            await this.release();
            this.finish();
            return;
        }
        cs.on('realtimePerformanceEnded', () => {
            if (!this.disposed && this.stopAt > this.ctx.currentTime + .02)
                this.fail('Synth playback ended unexpectedly');
            else
                this.finish();
        });
        const messages = [];
        cs.on('message', (message) => { if (messages.length < 8 && /error|failed/i.test(message))
            messages.push(message.slice(0, 200)); });
        if (await cs.compileCSD(compileCsound(this.asset, this.ctx.sampleRate), 1) !== 0)
            throw new Error(`Csound patch did not compile: ${messages.join(' ')}`);
        if (this.disposed) {
            await this.release();
            return;
        }
        const node = await cs.getNode();
        if (!node)
            throw new Error('Csound produced no audio node');
        if (this.disposed) {
            await this.release();
            return;
        }
        node.addEventListener('processorerror', () => this.fail('Synth audio processor failed'), { once: true });
        node.connect(this.output);
        if (await cs.start() !== 0)
            throw new Error('Csound could not start playback');
        if (this.disposed) {
            await this.release();
            return;
        }
        for (const name of ['pitch', 'brightness', 'tempo'])
            await cs.setControlChannel(name, this.controls[name]);
        const now = Math.max(when, this.ctx.currentTime);
        this.output.gain.setValueAtTime(0, now);
        this.output.gain.linearRampToValueAtTime(1, now + .02);
        if (!this.loop && this.stopAt === Infinity)
            this.stopAt = now + this.asset.seconds;
        if (this.stopAt < Infinity)
            this.scheduleStop();
    }
    stop(when = this.ctx.currentTime) {
        this.stopAt = Math.min(this.stopAt, when);
        if (when <= this.ctx.currentTime) {
            this.output.gain.cancelScheduledValues(this.ctx.currentTime);
            this.output.gain.setValueAtTime(0, this.ctx.currentTime);
            this.finish();
        }
        else if (this.csound)
            this.scheduleStop();
    }
    scheduleStop() {
        const now = this.ctx.currentTime, end = Math.max(now, this.stopAt);
        this.output.gain.setValueAtTime(1, Math.max(now, end - .01));
        this.output.gain.linearRampToValueAtTime(0, end);
        void this.csound?.inputMessage(`i 999 ${Math.max(0, end - now)} 0.01`).catch(() => this.fail('Synth could not schedule its stop'));
    }
    fail(message) {
        if (!this.disposed)
            this.report(message);
        this.finish();
    }
    finish() {
        if (this.ended)
            return;
        this.ended = true;
        this.disconnect();
        queueMicrotask(() => this.onended?.());
    }
    async release() {
        const cs = this.csound;
        this.csound = null;
        if (cs) {
            cs.removeAllListeners();
            try {
                await cs.stop();
            }
            catch { /* A failed compile can leave no running performance. */ }
            try {
                await cs.terminateInstance();
            }
            catch { /* Already terminated. */ }
        }
        if (this.reserved) {
            this.reserved = false;
            instances.set(this.ctx, Math.max(0, (instances.get(this.ctx) ?? 1) - 1));
        }
    }
}
//# sourceMappingURL=LiveSynthSource.js.map