import { BindingSourceRR } from "../BindingSourceRR";
import { ObservableRR } from "../ObservableRR";
import { BindingRR } from "./BindingRR";

// ForeachBinding: first-class foreach binding with lifecycle management.
export class ForeachBindingRR extends BindingRR {
    private activeItemBinders: BindingSourceRR[] = [];
    private subscription?: { unsubscribe: () => void };

    // Picks which <template> to render this pass. 
    // the first <template> found inside the container, or one referenced by a data-template id. 
    private resolveTemplate(context: any): HTMLTemplateElement | null {
        const element = this.element;

        const t = element.querySelector("template") as HTMLTemplateElement | null;
        if (t)
            return t;

        const templateId = element.getAttribute("data-template");
        if (templateId) {
            const tId = document.getElementById(templateId) as HTMLTemplateElement | null;
            if (tId)
                return tId;
        }

        console.error("Foreach binding: no <template> element found inside container", element);
        return null;
    }

    // Dispose child binders and remove non-template children
    private clearPrevious() {
        this.activeItemBinders.forEach(b => b.dispose());
        this.activeItemBinders = [];

        Array.from(this.element.children)
            .filter((child) => child.tagName.toLowerCase() !== "template")
            .forEach((child) => child.remove());
    }

    // Create an item-specific context. "item" here is already an ObservableRR
    // proxy (auto-wrapped when read off the array), so we wrap it in a thin
    // pass-through Proxy rather than Object.assign-ing it into a plain object.
    // Old version with Object.assign would copy primitive fields (name, price, ...)
    // into a disposable snapshot - fine for one-way "text:" bindings, but any two-way
    // "value:" binding inside the foreach would write into that snapshot and the
    // edit would vanish on the next render, never reaching the real item or
    // notifying anyone. Forwarding get/set via Reflect keeps $index and global as
    // virtual, request-time-only properties while every other read/write goes
    // straight through to the item's own reactive proxy.
    private createItemContext(item: any, index: number, globalContext: any) {
        return new Proxy(item as object, {
            get: (target, prop, receiver) => {
                if (prop === "$index") return index;
                if (prop === "global") return globalContext;
                return Reflect.get(target, prop, receiver);
            },
            set: (target, prop, value, receiver) => {
                if (prop === "$index" || prop === "global") return true;
                return Reflect.set(target, prop, value, receiver);
            }
        });
    }


    // Handles loop bindings. The element with a "foreach" binding should contain a <template> child.
    // The binding object specifies the array path to iterate over.
    // For each item in the array, we clone the template, apply advanced bindings with the item as context,
    // and append the result.
    private render(context: any) {
        const template = this.resolveTemplate(context);
        if (!template) return;

        const arrayValue = this.binder!.getValueFromPath(context, this.config.path.split("."));
        if (!Array.isArray(arrayValue)) {
            console.error(`"foreach" binding: expected array at path '${this.config.path}'`);
            return;
        }

        this.clearPrevious();

        arrayValue.forEach((item: any, index: number) => {
            const clone = document.importNode(template.content, true);

            let container: HTMLElement;
            if (clone.childElementCount === 1) {
                container = clone.firstElementChild as HTMLElement;
            } else {
                container = document.createElement("div");
                while (clone.firstChild) container.appendChild(clone.firstChild);
            }

            const itemContext = this.createItemContext(item, index, context);

            // Create a child binder for this item and bind it
            const childBinder = new BindingSourceRR(this.binder!.Observable);
            childBinder.scanBindings(container);
            childBinder.applyBindings(itemContext);

            this.activeItemBinders.push(childBinder);
            this.element.appendChild(container);
        });
    }

    apply(context: any) {
        // Initial render
        this.render(context);

        // Dispose previous subscription if any
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = undefined;
        }

        // TODO: Need to flesh out and sort binding paths next (proper array and nested object handling)
        const filter = (changedPath: PropertyKey[]) => {
            return this.binder!.isBindingAffected(changedPath, this.config.path);
        };

        this.subscription = this.binder!.Observable.subscribe(
            () => {
                try {
                    this.render(context);
                } catch (e) {
                    console.error("Error rendering foreach:", e);
                }
            },
            filter,
            undefined,
            ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: this.element, reason: "Foreach binding update" } : undefined
        );

        this.addSub(this.subscription);
    }

    dispose() {
        super.dispose();
        this.clearPrevious();
    }
}