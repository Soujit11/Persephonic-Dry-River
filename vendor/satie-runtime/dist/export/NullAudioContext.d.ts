/**
 * NullAudioContext — a headless `BaseAudioContext` stand-in.
 *
 * The engine's scene logic (scheduling, hosting, entities, the signal bus,
 * Doppler, occlusion) is entangled with Web Audio only through node
 * construction and AudioParam writes. This context accepts every one of
 * those calls and produces no sound: every `create*` returns a node whose
 * `connect` returns its destination, whose AudioParams hold a `.value` that
 * the LAST write sets (no automation timeline — `setValueAtTime`,
 * `setTargetAtTime`, the ramps all just store), and whose `currentTime` is a
 * plain writable number the caller advances between `SatieEngine.advance`
 * steps. That is enough to run a whole scene faster than realtime and read
 * the engine's state per frame — what `SceneSimulation` does to give the
 * offline export parity with live playback.
 *
 * It is also the stub the engine tests used to carry in each file; they now
 * import it from here (`installNullAudioGlobals` covers the two globals
 * Node lacks that `play()` touches: `AudioBuffer` for the generator's
 * `instanceof`, `requestAnimationFrame` for the tick loop).
 *
 * `decodeAudioData` rejects unless the context was given a `decodeAs`
 * function — nothing headless ever decodes; tests that feed
 * `loadAudioBuffer` supply one.
 */
/** Minimal AudioBuffer: real channel arrays so IR synthesis can write into them. */
export declare class NullAudioBuffer {
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    readonly length: number;
    private readonly channels;
    constructor(opts?: {
        numberOfChannels?: number;
        length?: number;
        sampleRate?: number;
        durationS?: number;
    });
    get duration(): number;
    getChannelData(ch: number): Float32Array;
    copyToChannel(src: Float32Array, ch: number, offset?: number): void;
    copyFromChannel(dst: Float32Array, ch: number, offset?: number): void;
}
/** An AudioParam that remembers the last value written, nothing else. */
export declare function nullAudioParam(initial?: number): AudioParam;
/**
 * A node that tolerates any property access: unknown properties become
 * AudioParams on first touch (`panner.positionX`, `filter.frequency`,
 * `source.playbackRate`), `connect` returns its destination so chains read
 * naturally, and the usual lifecycle methods are no-ops.
 */
export declare function nullAudioNode(): AudioNode;
export interface NullAudioContextOptions {
    sampleRate?: number;
    /** Resolve `decodeAudioData` with this instead of rejecting (tests). */
    decodeAs?: (data: ArrayBuffer) => NullAudioBuffer;
}
export declare class NullAudioContext {
    /** Plain writable clock — the caller advances it before each engine step. */
    currentTime: number;
    readonly sampleRate: number;
    state: AudioContextState;
    readonly destination: AudioNode;
    readonly listener: AudioListener;
    private readonly decodeAs;
    constructor(opts?: NullAudioContextOptions);
    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
    addEventListener(): void;
    removeEventListener(): void;
    decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
    createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
    createGain(): GainNode;
    createDynamicsCompressor(): DynamicsCompressorNode;
    createStereoPanner(): StereoPannerNode;
    createBufferSource(): AudioBufferSourceNode;
    createPanner(): PannerNode;
    createBiquadFilter(): BiquadFilterNode;
    createWaveShaper(): WaveShaperNode;
    createDelay(): DelayNode;
    createConvolver(): ConvolverNode;
    createChannelMerger(): ChannelMergerNode;
    createChannelSplitter(): ChannelSplitterNode;
    createAnalyser(): AnalyserNode;
    createOscillator(): OscillatorNode;
    createConstantSource(): ConstantSourceNode;
}
/**
 * Define the browser globals a headless run of `SatieEngine.play()` touches
 * when they are missing (Node): `AudioBuffer` (the generator hook's
 * `instanceof`) and the animation-frame pair (the tick loop, which a
 * `headless` engine never starts but `stop()` still cancels). Idempotent.
 */
export declare function installNullAudioGlobals(): void;
//# sourceMappingURL=NullAudioContext.d.ts.map