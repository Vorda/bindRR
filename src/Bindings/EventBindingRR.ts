import { BindingRR, BoundElement, EVENT_HANDLERS } from "./BindingRR";

// EventBinding: attaches event listeners and stores them for disposal.
export class EventBindingRR extends BindingRR {
    apply(context: any) {
        const boundElem = this.element as BoundElement;
        boundElem[EVENT_HANDLERS] = boundElem[EVENT_HANDLERS] || {};

        if (!this.config.target) return;

        if (boundElem[EVENT_HANDLERS][this.config.target]) {
            // already attached
            return;
        }

        const pathParts = this.config.path.split(".");
        let handler: any;
        
        // If the binding path starts with 'global', remove it and use the context (observable proxy).
        if (pathParts[0] === "global") {
            handler = this.binder!.getValueFromPath(context, pathParts);
        // Otherwise, use the raw target to avoid computed auto-evaluation.
        } else {
            handler = this.binder!.getValueFromPath(this.binder!.Observable.Original, this.config.path.split("."));
        }

        if (typeof handler === "function") {
            const eventHandler = (event: Event) => { handler.call(context, event); };
            
            // Here we call the handler with the observable proxy as context,
            // we can call it with the orignal too, for now we call with proxy to refresh data
            this.element.addEventListener(this.config.target!, eventHandler);
            boundElem[EVENT_HANDLERS][this.config.target] = eventHandler;
            // store a disposable to remove listener on dispose
            this.addSub({
                unsubscribe: () => {
                    this.element.removeEventListener(this.config.target!, eventHandler);
                    delete boundElem[EVENT_HANDLERS]![this.config.target!];
                }
            });
        }
    }
}