export interface StateProperty {
    /** Explicit signal outputs for every value; empty outputs declare no acoustic effect. */
    signalsByValue?: Record<string, Record<string, number>>;
    tracking: 'tracked' | 'untracked';
    /** Null means the host has not supplied the complete value domain. */
    values: string[] | null;
}
export interface ObjectStateSchema {
    basis: 'host-schema' | 'capture-bindings' | 'unknown';
    /** Omitted properties have unknown coverage. */
    properties: Record<string, StateProperty>;
}
export declare function validateObjectStateSchema(schema: ObjectStateSchema): ObjectStateSchema;
export declare class ObjectStateSchemas {
    private readonly schemas;
    declare(host: string, schema: ObjectStateSchema): ObjectStateSchema;
    get(host: string): ObjectStateSchema | undefined;
    validate(host: string, group: string, value: string): void;
    snapshot(hosts: Iterable<string>): Record<string, ObjectStateSchema>;
    delete(host: string): void;
    clear(): void;
}
//# sourceMappingURL=ObjectStateSchema.d.ts.map