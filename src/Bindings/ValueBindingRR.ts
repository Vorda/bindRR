import { BindingRR, BoundElement, EVENT_HANDLERS } from "./BindingRR";

// ValueBinding: Used with HTML input elements and two way binding.
export class ValueBindingRR extends BindingRR {
    apply(context: any) {
        const pathArr = this.config.path.split(".");
        const value = this.binder!.getValueFromPath(context, pathArr);

        if ("value" in this.element) {
            (this.element as HTMLInputElement).value = value !== undefined ? String(value) : "";
        }

        const boundElem = this.element as BoundElement;
        boundElem[EVENT_HANDLERS] = boundElem[EVENT_HANDLERS] || {};

        if (!boundElem[EVENT_HANDLERS]["input"]) {
            const eventHandler = (event: Event) => {
                const newValue = (event.target as HTMLInputElement).value;
                this.binder!.setValueFromPath(context, this.config.path.split("."), newValue);
            };
            this.element.addEventListener("input", eventHandler);
            boundElem[EVENT_HANDLERS]["input"] = eventHandler;

            this.addSub({
                unsubscribe: () => {
                    this.element.removeEventListener("input", eventHandler);
                    delete boundElem[EVENT_HANDLERS]!["input"];
                }
            });
        }
    }
}