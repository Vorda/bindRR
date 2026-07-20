import { isSubscriptionDebuggingEnabled } from "./SubscriptionDebugFlag";
import { SubscriptionFilterRR, SubscriptionKindRR } from "./SubscriptionFilterRR";
import { SubscriptionIdRR } from "./SubscriptionId";

export type ObserverRR = (path: PropertyKey[], newValue: any, oldValue: any) => void;
export type ErrorHandlerRR = (error: Error, path: PropertyKey[], newValue: any, oldValue: any) => void;

// The plain, serializable read-model — safe to hand to a debug UI or
// console.table(), since it can't be used to unsubscribe or otherwise
// mutate the live subscription.
export interface SubscriptionSnapshot {
    id: string;
    kind: SubscriptionKindRR;
    label?: string;
    filterDescription: string;
    createdAt: number;
    disposedAt?: number;
    isActive: boolean;
    invocationCount: number;
    lastInvokedAt?: number;
}

export interface SubscribeOptionsRR {
    filter?: SubscriptionFilterRR;
    errorHandler?: (error: Error, path: PropertyKey[], newValue: any, oldValue: any) => void;
    kind?: SubscriptionKindRR;
    label?: string;
}

export class SubscriptionRR {
    public readonly id: SubscriptionIdRR;
    public readonly kind: SubscriptionKindRR;
    public readonly label?: string;
    public readonly filter: SubscriptionFilterRR;
    public readonly createdAt: number;

    private _disposedAt?: number;
    private _invocationCount = 0;
    private _lastInvokedAt?: number;

    constructor(
        id: SubscriptionIdRR,
        kind: SubscriptionKindRR,
        filter: SubscriptionFilterRR,
        private readonly observer: ObserverRR,
        private readonly errorHandler: ErrorHandlerRR | undefined,
        private readonly onDispose: (subscription: SubscriptionRR) => void,
        label?: string
    ) {
        this.id = id;
        this.kind = kind;
        this.filter = filter;
        this.label = label;
        this.createdAt = Date.now();
    }

    public get isActive(): boolean { return this._disposedAt === undefined; }
    public get invocationCount(): number { return this._invocationCount; }
    public get lastInvokedAt(): number | undefined { return this._lastInvokedAt; }

    // Runs the filter check, the observer call, and error handling for
    // this one subscription. ObservableRR.notify() now just loops over
    // active subscriptions and call invoke() on each.
    public invoke(path: PropertyKey[], newValue: any, oldValue: any): void {
        if (!this.isActive) return;
        if (!this.filter.matches(path)) return;

        if (isSubscriptionDebuggingEnabled())
        {
            this._invocationCount++;
            this._lastInvokedAt = Date.now();
        }

        try {
            this.observer(path, newValue, oldValue);
        } catch (error) {
            if (this.errorHandler) {
                try {
                    this.errorHandler(error as Error, path, newValue, oldValue);
                } catch (ehError) {
                    console.error("Error handler threw an error:", ehError);
                }
            } else {
                console.error("Observer error:", error);
            }
        }
    }

    public unsubscribe(): void {
        if (!this.isActive) return; // idempotent, same guarantee the old closure gave you
        this._disposedAt = Date.now();
        this.onDispose(this);
    }

    public toSnapshot(): SubscriptionSnapshot {
        return {
            id: this.id.toString(),
            kind: this.kind,
            label: this.label,
            filterDescription: this.filter.describe(),
            createdAt: this.createdAt,
            disposedAt: this._disposedAt,
            isActive: this.isActive,
            invocationCount: this._invocationCount,
            lastInvokedAt: this._lastInvokedAt,
        };
    }
}