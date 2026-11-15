export interface ObjectTrackingState {
    status: 'tracking' | 'lost' | 'awaiting-report';
    reason?: string;
}
export declare class ObjectTracking {
    private readonly states;
    set(host: string, value: ObjectTrackingState): void;
    get(host: string): ObjectTrackingState | undefined;
    assertReportable(host: string): void;
    snapshot(hosts: Iterable<string>): Record<string, ObjectTrackingState>;
    delete(host: string): void;
    clear(): void;
}
//# sourceMappingURL=ObjectTracking.d.ts.map