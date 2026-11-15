export interface SourceCandidate {
    label: string;
    listen(): void;
    stop(): void;
    use(): boolean;
}
export interface SourceRequest {
    synth: boolean;
    prompt: string;
    requestKey: string;
    instrumentId?: string;
}
export declare function sourceChooser(options: {
    synth: boolean;
    prompt: string;
    create(request: SourceRequest): Promise<SourceCandidate>;
    restore?(): boolean;
    close(): void;
}): {
    el: HTMLElement;
    close(): void;
};
//# sourceMappingURL=source.d.ts.map