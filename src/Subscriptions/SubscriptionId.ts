import { SubscriptionKindRR } from "./SubscriptionFilterRR";

// A value object, not a bare string or GUID — deliberately readable:
// "menuAdmin:computed:3:filteredItems" tells you the owning Observable,
// what kind of subscription it is, and (when available) what created it,
// just from printing it in a console.log or debugger.
export class SubscriptionIdRR {
    private constructor(private readonly value: string) { }

    public static create(
        observableLabel: string,
        kind: SubscriptionKindRR,
        sequence: number,
        label?: string
    ): SubscriptionIdRR {
        const parts = [observableLabel, kind, String(sequence)];
        if (label)
            parts.push(label);
        return new SubscriptionIdRR(parts.join(":"));
    }

    public toString(): string {
        return this.value;
    }

    public equals(other: SubscriptionIdRR): boolean {
        return this.value === other.value;
    }
}