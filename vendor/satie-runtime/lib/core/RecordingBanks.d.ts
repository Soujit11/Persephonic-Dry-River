/** Explicit bank membership. References address supplied audio; they never request generation. */
export interface RecordingBanks {
    /** Fixed bank, or the fallback for descriptions without a surface-specific bank. */
    readonly takes?: readonly string[];
    /** Literal, trimmed event descriptions, including compound material names. */
    readonly surfaces?: Readonly<Record<string, readonly string[]>>;
}
export declare const MAX_BANK_TAKES = 8;
export declare const MAX_RECORDING_SURFACES = 32;
/** Bounded data-only grammar; the caller owns clip-path normalization. Empty banks mean silence. */
export declare function parseRecordingBanks(value: string, path: (clip: string) => string): RecordingBanks;
/** Undefined retains legacy resolution; [] deliberately suppresses a bank. */
export declare function recordingBank(recordings: RecordingBanks | null, text?: string): readonly string[] | undefined;
//# sourceMappingURL=RecordingBanks.d.ts.map