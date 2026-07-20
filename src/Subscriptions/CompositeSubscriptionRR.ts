import { SubscriptionSnapshot } from "./SubscriptionRR";

// Not owned by any single ObservableRR's SubscriptionRegistryRR, because a
// composite can legitimately wrap subscriptions from *different* Observables
// (that's the whole point of ObservableRR.composeSubscriptions() — bundling
// unrelated subscriptions under one disposal handle). Gets its own lightweight
// id sequence instead of borrowing one Observable's registry, since it isn't
// conceptually "created by" any single one of them.
export class CompositeSubscriptionRR {
    private static sequence = 0;

    public readonly id: string;
    public readonly kind = "composite" as const;
    public readonly label?: string;
    public readonly createdAt: number;
    private _disposedAt?: number;

    constructor(
        private readonly children: { unsubscribe: () => void }[],
        label?: string
    ) {
        this.id = `composite:${CompositeSubscriptionRR.sequence++}${label ? ":" + label : ""}`;
        this.label = label;
        this.createdAt = Date.now();
    }

    public get isActive(): boolean {
        return this._disposedAt === undefined;
    }

    public unsubscribe(): void {
        if (!this.isActive) return; // idempotent, same as SubscriptionRR
        this._disposedAt = Date.now();
        this.children.forEach((child) => child.unsubscribe());
    }

    public toSnapshot(): SubscriptionSnapshot {
        return {
            id: this.id,
            kind: this.kind,
            label: this.label,
            filterDescription: `composite of ${this.children.length} subscription(s)`,
            createdAt: this.createdAt,
            disposedAt: this._disposedAt,
            isActive: this.isActive,
            invocationCount: 0, // a composite never invokes an observer itself
        };
    }
}