import { SubscriptionFilterRR, SubscriptionKindRR } from "./SubscriptionFilterRR";
import { SubscriptionIdRR } from "./SubscriptionId";
import { ErrorHandlerRR, ObserverRR, SubscriptionRR, SubscriptionSnapshot } from "./SubscriptionRR";

// A single node in a per-Observable subscription graph. "Edges" for v1
// are limited to what a single Observable actually knows about itself:
// which subscription belongs to which composite (CompositeSubscriptionRR). 
export interface SubscriptionGraphNode {
    id: string;
    kind: SubscriptionKindRR;
    label?: string;
    watches: string; // filter.describe()
    isActive: boolean;
}

export interface SubscriptionGraphRR {
    observableLabel: string;
    nodes: SubscriptionGraphNode[];
}

// Owned one-per-ObservableRR. Responsible for:
//  - generating the next SubscriptionIdRR for this Observable
//  - holding the active subscription set
//  - evicting a subscription the moment it's disposed (no accumulation)
//  - answering introspection queries (snapshot / graph)
export class SubscriptionRegistryRR {
    private sequence = 0;
    private active = new Map<string, SubscriptionRR>();

    constructor(private readonly observableLabel: string) { }

    public create(
        kind: SubscriptionKindRR,
        filter: SubscriptionFilterRR,
        observer: ObserverRR,
        errorHandler: ErrorHandlerRR | undefined,
        label?: string
    ): SubscriptionRR {
        const id = SubscriptionIdRR.create(this.observableLabel, kind, this.sequence++, label);

        const subscription = new SubscriptionRR(
            id,
            kind,
            filter,
            observer,
            errorHandler,
            (s) => this.onUnsubscribe(s),
            label
        );

        this.active.set(id.toString(), subscription);
        return subscription;
    }

    private onUnsubscribe(subscription: SubscriptionRR): void {
        this.active.delete(subscription.id.toString());
    }

    // Used by ObservableRR.notify() (Phase 3) to iterate active subscriptions.
    public getActive(): SubscriptionRR[] {
        return Array.from(this.active.values());
    }

    // Disposes every active subscription. Deliberately goes through each
    // subscription's own unsubscribe() (not a raw map.clear()) so eviction,
    // disposedAt, and any future disposal side-effects stay consistent
    // whether a subscription is removed one-at-a-time or in bulk.
    // Note: does NOT reset `sequence` — resetTarget()/unsubscribeAll()
    // clearing all subscriptions must not cause ID reuse.
    public clear(): void {
        Array.from(this.active.values()).forEach((s) => s.unsubscribe());
    }

    public getSnapshot(): SubscriptionSnapshot[] {
        return this.getActive().map((s) => s.toSnapshot());
    }

    public getGraph(): SubscriptionGraphRR {
        return {
            observableLabel: this.observableLabel,
            nodes: this.getActive().map((s) => ({
                id: s.id.toString(),
                kind: s.kind,
                label: s.label,
                watches: s.filter.describe(),
                isActive: s.isActive,
            })),
        };
    }
}