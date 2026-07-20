import { isPrefix } from "../PathUtils";

// Identifies what "produced" this subscription, for grouping and graphing.
// String union, not enum, to match the rest of the codebase's style
// (see ParameterInstructionRR.type, RegistrationRR.injectionOrder).
export type SubscriptionKindRR = "user" | "computed" | "binding" | "validation" | "composite";

// A filter is now an inspectable object, not an opaque predicate closure.
// This is what makes a subscription graph possible at all — describe()
// gives a human-readable answer to "what is this subscription watching?"
export abstract class SubscriptionFilterRR {
    public abstract matches(changedPath: PropertyKey[]): boolean;
    public abstract describe(): string;
}

// Matches any change under a given root property key.
// Used by computed() dependency tracking (trackDependencies in ObservableRR).
export class RootKeyFilterRR extends SubscriptionFilterRR {
    constructor(private readonly key: PropertyKey) { super(); }

    public matches(changedPath: PropertyKey[]): boolean {
        return changedPath[0] === this.key;
    }

    public describe(): string {
        return `root key = ${String(this.key)}`;
    }
}

// Matches when either path is a prefix of the other (old isBindingAffected logic).
// Used by DOM bindings and foreach bindings.
export class PathPrefixFilterRR extends SubscriptionFilterRR {
    constructor(private readonly path: PropertyKey[]) { super(); }

    public matches(changedPath: PropertyKey[]): boolean {
        return isPrefix(changedPath, this.path) || isPrefix(this.path, changedPath);
    }

    public describe(): string {
        return `path ~ ${this.path.join(".")}`;
    }
}

// Matches only an exact path — stricter than PathPrefixFilterRR.
// Not used internally yet; available for cases where prefix-matching
// over-invalidates (see ObservableRR.md's known limitation on computed deps).
export class ExactPathFilterRR extends SubscriptionFilterRR {
    constructor(private readonly path: PropertyKey[]) { super(); }

    public matches(changedPath: PropertyKey[]): boolean {
        return changedPath.length === this.path.length
            && changedPath.every((key, i) => key === this.path[i]);
    }

    public describe(): string {
        return `path == ${this.path.join(".")}`;
    }
}

// Escape hatch for genuinely dynamic filter logic. `label` is mandatory —
// per the decision to break the API rather than tolerate an "unlabeled
// predicate" showing up in the graph with no way to identify it.
export class CustomFilterRR extends SubscriptionFilterRR {
    constructor(
        private readonly predicate: (changedPath: PropertyKey[]) => boolean,
        private readonly label: string
    ) { super(); }

    public matches(changedPath: PropertyKey[]): boolean {
        return this.predicate(changedPath);
    }

    public describe(): string {
        return this.label;
    }
}

// Matches when any of the given filters match. Lets a single subscription
// watch several paths at once (e.g. one DOM element with multiple data-bind
// expressions) while still describing itself meaningfully for the graph,
// instead of collapsing into an unlabeled CustomFilterRR closure.
export class AnyOfFilterRR extends SubscriptionFilterRR {
    constructor(private readonly filters: SubscriptionFilterRR[]) { super(); }

    public matches(changedPath: PropertyKey[]): boolean {
        // .some() on an empty array is false — an AnyOfFilterRR built from
        // zero filters never matches, by construction, no separate "never"
        // filter type needed.
        return this.filters.some((f) => f.matches(changedPath));
    }

    public describe(): string {
        return this.filters.length > 0
            ? this.filters.map((f) => f.describe()).join(" OR ")
            : "never (no filters registered)";
    }
}

// Matches everything. This is what subscribe() now defaults to when no
// filter is supplied, preserving today's "no filter = notified on every
// change" behavior now that SubscriptionRR.invoke() always checks a real
// filter object rather than treating "undefined" as a special case.
export class AlwaysFilterRR extends SubscriptionFilterRR {
    public matches(): boolean { return true; }
    public describe(): string { return "always"; }
}