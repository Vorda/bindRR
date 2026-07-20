// Path-comparison helpers shared by ObservableRR (change notification),
// BindingSourceRR (binding-affected checks) and SubscriptionFilterRR
// (prefix-based filters). Split out to avoid a circular import once
// subscription filters need this too.
export function isPrefix(prefix: PropertyKey[], full: PropertyKey[]): boolean {
    if (prefix.length > full.length)
        return false;

    for (let i = 0; i < prefix.length; i++)
        if (prefix[i] !== full[i])
            return false;

    return true;
}

// Small helper for identifying elements at a glance during debugging (e.g. as a
// subscriber label): "button#save.danger" rather than a raw HTMLElement reference.
export function describeElement(el: Element): string {
    const tagName = el.tagName.toLowerCase();
    const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
    const className = typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).join(".")
        : "";
    return `${tagName}${id}${className}`;
}