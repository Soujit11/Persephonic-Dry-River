import { type SynthControl } from './csound.js';
import type { RangeOrValue } from '../core/RangeOrValue.js';
import type { SynthAsset } from './asset.js';
type CsoundInstance = NonNullable<Awaited<ReturnType<typeof import('@csound/browser').Csound>>>;
type Factory = (ctx: AudioContext) => Promise<CsoundInstance>;
export declare const MAX_LIVE_SYNTHS = 8;
/** The source lifecycle used by Satie's scheduler. PCM remains available for compatible exports. */
export declare class LiveSynthSource {
    private readonly ctx;
    readonly asset: SynthAsset;
    private readonly report;
    private readonly factory;
    buffer: AudioBuffer | null;
    loop: boolean;
    onended: (() => void) | null;
    readonly playbackRate: {
        value: number;
        setValueAtTime(value: number, when: number): void;
        setTargetAtTime(value: number, when: number, constant: number): void;
    };
    private readonly output;
    private csound;
    private disposed;
    private ended;
    private started;
    private reserved;
    private stopAt;
    private readonly sampled;
    private readonly controls;
    /** Resolves only after Csound has compiled and started, or throws a reported startup error. */
    ready: Promise<void>;
    constructor(ctx: AudioContext, asset: SynthAsset, report: (message: string) => void, factory?: Factory);
    connect(destination: AudioNode): void;
    disconnect(): void;
    sampleControl(name: SynthControl, range: RangeOrValue, rng: () => number): number;
    setControl(name: SynthControl, value: number): void;
    private control;
    start(when?: number, _offset?: number): void;
    private begin;
    stop(when?: number): void;
    private scheduleStop;
    private fail;
    private finish;
    private release;
}
export type PlaybackSource = AudioBufferSourceNode | LiveSynthSource;
export {};
//# sourceMappingURL=LiveSynthSource.d.ts.map