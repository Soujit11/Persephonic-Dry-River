/** Host names address bindings; instance IDs identify physical lifetimes. */
export declare class ObjectIdentity {
    private readonly ids;
    ensure(host: string): string;
    get(host: string): string | undefined;
    retire(host: string): string | undefined;
    snapshot(): Record<string, string>;
    clear(): void;
}
//# sourceMappingURL=ObjectIdentity.d.ts.map