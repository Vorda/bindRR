// Module-level debug switch — the closest JS/TS equivalent to a C#
// "static readonly bool DebugEnabled" flag you check with `if`, NOT
// an equivalent of "#if DEBUG": this branch is always present in the
// shipped bundle, it's just false by default. A true zero-cost,
// compiled-out-entirely version would need esbuild's `define` + dead
// code elimination wired through tsup.config.ts — deliberately not
// done here; this is the simple version, upgradeable.
//
// Because ES modules are cached singletons, this one flag is shared
// by every ObservableRR instance in the app the moment any of them
// imports this module — call enableSubscriptionDebugging() once,
// anywhere, and every Observable's introspection methods start
// returning real data.
let subscriptionDebuggingEnabled = false;

export function enableSubscriptionDebugging(): void {
    subscriptionDebuggingEnabled = true;
}

export function disableSubscriptionDebugging(): void {
    subscriptionDebuggingEnabled = false;
}

export function isSubscriptionDebuggingEnabled(): boolean {
    return subscriptionDebuggingEnabled;
}