import { ObservableRR } from "../ObservableRR";
import { BindingSourceRR } from "../BindingSourceRR";

export const EVENT_HANDLERS= Symbol("boundEventHandlers");
export const DISPLAY = Symbol("initialDisplay");

export interface BoundElement extends HTMLElement {
    [EVENT_HANDLERS]?: Record<string, EventListener>;
    [DISPLAY]?:string;
}

// An individual binding configuration.
export interface BindingConfig {
    type: string;         // e.g., "text", "html", "value", "attr", "title", "if", "foreach", etc.
    target?: string;      // Target attribute for "attr" bindings or specific event type for "event"
    path: string;         // The property path to bind (e.g., "user.name")
}


// New object-oriented binding model:
// - Binding: abstract base
// - SimpleBinding: text,html,attr,style,class,visible,validate,modal,if
// - ValueBinding: html input and two-way binding
// - EventBinding: event.* handlers
// - ForeachBinding: handles foreach rendering, subscription and disposal
export abstract class BindingRR {
    protected element: HTMLElement;
    public readonly config: BindingConfig;
    protected binder: BindingSourceRR | null = null;
    protected subscriptions: { unsubscribe: () => void }[] = [];

    constructor(element: HTMLElement, config: BindingConfig) {
        this.element = element;
        this.config = config;
    }

    attachBinder(binder: BindingSourceRR) {
        this.binder = binder;
    }

    public addSub(sub: { unsubscribe: () => void }) {
        this.subscriptions.push(sub);
    }

    dispose() {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];
    }

    // Update the element's content and attributes based on the bindings.
    abstract apply(context: any): void;
}