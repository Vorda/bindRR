import { ObservableRR, isPrefix, COMPUTED_FLAG } from "./ObservableRR";

const EVENT_HANDLERS = Symbol("boundEventHandlers");
const DISPLAY = Symbol("initialDisplay");

interface BoundElement extends HTMLElement {
    [EVENT_HANDLERS]?: Record<string, EventListener>;
    [DISPLAY]?:string;
}

// An individual binding configuration.
interface BindingConfig {
    type: string;         // e.g., "text", "html", "value", "attr", "title", "if", "foreach", etc.
    target?: string;      // Target attribute for "attr" bindings or specific event type for "event"
    path: string;         // The property path to bind (e.g., "user.name")
}

//
// New object-oriented binding model:
// - Binding: abstract base
// - SimpleBinding: text,html,attr,style,class,visible,validate,modal,if
// - ValueBinding: html input and two-way binding
// - EventBinding: event.* handlers
// - ForeachBinding: handles foreach rendering, subscription and disposal
abstract class BindingRR {
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


// SimpleBinding: handles the non-foreach, non-event bindings.
// It encapsulates the previous updateElement switch logic for a single binding.
class SimpleBindingRR extends BindingRR {
    apply(context: any) {
        const pathArr = this.config.path.split(".");
        const value = this.binder!.getValueFromPath(context, pathArr);

        switch (this.config.type) {
            case "text":
                this.element.textContent = value !== undefined ? String(value) : "";
                break;
            case "html":
                this.element.innerHTML = value !== undefined ? String(value) : "";
                break;
            case "value":
                if ("value" in this.element)
                    (this.element as HTMLInputElement).value = value !== undefined ? String(value) : "";
                break;
            case "attr":
                if (this.config.target)
                    this.element.setAttribute(this.config.target, value !== undefined ? String(value) : "");
                break;
            // Uses setProperty rather than element.style[target] = value so this also
            // works for CSS custom properties (e.g. "style.--vt-name: VtName"), which
            // can't be assigned as a plain camelCase style property.
            case "style":
                if (this.config.target)
                    this.element.style.setProperty(this.config.target, value !== undefined ? String(value) : "");
                break;
            case "visible": {
                const bound = (this.element as BoundElement);
                const prevDisplay = bound[DISPLAY] ?? this.element.style.display;
                this.element.style.display = value ? prevDisplay : "none";
                break;
            }
            case "class":
                if (value)
                    this.element.classList.add(this.config.target || "");
                else
                    this.element.classList.remove(this.config.target || "");
                break;
            case "validate": {
                // If a triggering property was declared, use it; otherwise, always validate.
                let applyValidation = true;
                const currentBindings = this.binder!.getBindings(this.element) || [];
                const triggerBinding = currentBindings.find(x => x.config.type === "validateTrigger");

                if (triggerBinding) {
                    const triggerValue = this.binder!.getValueFromPath(context, triggerBinding.config.path.split("."));
                    applyValidation = !!triggerValue;
                }

                if (!applyValidation) {
                    this.element.classList.remove("is-invalid");
                } else {
                    let validValue = value;
                    if (typeof validValue === "string") validValue = validValue.trim();
                    if (!validValue) 
                        this.element.classList.add("is-invalid");
                    else 
                        this.element.classList.remove("is-invalid");
                    
                }
                break;
            }
            case "modal": {
                // Show or hide the Bootstrap modal based on the value.
                // Probably not a good idea to hardcode bootstrap straight into the framework :)
                // @ts-ignore bootstrap usage
                const modalInstance = (window as any).bootstrap?.Modal.getOrCreateInstance(this.element);
                if (modalInstance) {
                    if (value) modalInstance.show(); else modalInstance.hide();
                }
                break;
            }
            case "if": {
                this.element.style.display = !!value ? "" : "none";
                break;
            }
            default:
                if (this.config.type)
                    this.element.setAttribute(this.config.type, value !== undefined ? String(value) : "");
                break;
        }
    }
}

// ValueBinding: Used with HTML input elements and two way binding.
class ValueBindingRR extends BindingRR {
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


// EventBinding: attaches event listeners and stores them for disposal.
class EventBindingRR extends BindingRR {
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

// ForeachBinding: first-class foreach binding with lifecycle management.
class ForeachBindingRR extends BindingRR {
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
 

// BindingSourceRR 
// - stores Binding instances per element
// - delegates apply/dispose to Binding objects
// - in process of refactoring - read my old TODOS in previous commit :)
export class BindingSourceRR {
    private bindingMap: Map<HTMLElement, BindingRR[]> = new Map();

    public get Observable() { return this.observable; }

    constructor(private observable: ObservableRR<unknown>) {
        this.observable.BeforeTargetChange(() => { this.dispose(); });
        this.observable.AfterTargetChange(() => { this.applyBindings(); })
    }

    // Track all elements that have a "validate" binding.
    // TODO: probably should simplify validation
    // Added it to the system after like 2 days of not sleeping, 
    // just learning / practicing typescript syntax 
    // and trying to write sane OOP code in a scripting language :)
    private validateElements: Set<HTMLElement> = new Set();

    public getBindings(key: HTMLElement): BindingRR[] | undefined {
        return this.bindingMap.get(key);
    }

    // TODO: really need to refactor storing stuff directly on HTML elements
    public dispose() {
        this.bindingMap.forEach((bindings, element) => {
            bindings.forEach(x => x.dispose());

            // TODO: check if this or the code in EventBinding is proper - in process of refactoring
            const boundElem = element as BoundElement;
            const handlers = boundElem[EVENT_HANDLERS];
            if (handlers) {
                Object.keys(handlers).forEach((key) => {
                     const fn = handlers[key];
                     if (fn)
                        element.removeEventListener(key, fn);
                });
                boundElem[EVENT_HANDLERS] = {};
            }

            const prevDisplay = boundElem[DISPLAY];
            if (prevDisplay !== undefined) {
                element.style.display = prevDisplay;
                boundElem[DISPLAY] = undefined;  
            }
        });

        this.bindingMap.clear();
        this.validateElements.clear();
    }

    // Helper function to traverse an object using an array of keys.
    public getValueFromPath(obj: any, pathArr: string[]): any {
        return pathArr.reduce((curr, key) => (curr ? curr[key] : undefined), obj);
    }

    // Helper function that sets a nested property given an array of keys.
    public setValueFromPath(obj: any, pathArr: string[], value: any): void {
        const lastKey = pathArr.pop();
        const target = pathArr.reduce((curr, key) => (curr ? curr[key] : undefined), obj);
        if (target && lastKey) {
            target[lastKey] = value;
        }
    }

    // Parses a binding expression string into an array of BindingConfig objects.
    // The binding syntax uses semicolons to separate expressions. Each expression follows:
    //   bindingType: propertyPath
    // For attribute or event bindings, use dot notation on the key.
    // ("attr.placeholder: user.name", "event.click: MyClickHandler"...)
    private parseBindingString(binding: string): BindingConfig[] {
        // A bit of functional? programming from an OOP nerd :)
        return binding
            .split(";")
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
            .map((item) => {
                const [rawType, ...rawPathParts] = item.split(":");
                const typeStr = rawType.trim();
                const path = rawPathParts.join(":").trim();
                const typeParts = typeStr.split(".");
                if (typeParts.length > 1) {
                    // For now used as additional data for attr and event binding types:
                    // "attr.placeholder" -> { type: "attr", target: "placeholder", path: ... }
                    // "event.click" -> { type = "event", target = "click", path: ... }
                    return { type: typeParts[0].trim(), target: typeParts[1].trim(), path };
                } else {
                    // "text: user.name"
                    return { type: typeStr, path };
                }
            });
    }

    // Too tired for a proper algorithm, works for now with everything i tried :)
    public isBindingAffected(changedPath: PropertyKey[], bindingPath: string): boolean {
        const bindingParts = bindingPath.split(".");
        // Return true if one array is a prefix of the other.
        return isPrefix(changedPath, bindingParts) || isPrefix(bindingParts, changedPath);
    }

    // Scan the DOM (or a root element) for all data-bind attributes and populate the bindingMap.
    public scanBindings(root?: Document | Element | DocumentFragment): void {
        const target = root || document;
        if (target instanceof HTMLElement && target.matches("[data-bind]"))
            this.createBinding(target);

        const elements: NodeListOf<HTMLElement> = (root || document).querySelectorAll("[data-bind]");
        elements.forEach((el) => {
            this.createBinding(el);
        });
    }

    private createBinding(el: HTMLElement): void {
        const bindingStr = el.getAttribute("data-bind");
        if (!bindingStr)
            return;
        
        const configs = this.parseBindingString(bindingStr);
        const bindings: BindingRR[] = [];

        // First create foreach binding if present (so template-related bindings can be passed)
        const foreachConfig = configs.find(c => c.type === "foreach");
        const templateConfig = configs.find(c => c.type === "itemTemplate" || c.type === "foreachTemplate");
        const modeConfig = configs.find(c => c.type === "foreachMode");

        if (foreachConfig)
        {
            const fb = new ForeachBindingRR(el, foreachConfig);
            fb.attachBinder(this);
            bindings.push(fb);
        }

        // Create event bindings
        configs.filter(x => x.type === "event").forEach(cfg => {
            const eb = new EventBindingRR(el, cfg);
            eb.attachBinder(this);
            bindings.push(eb);
        });

        configs.filter(x => x.type === "value").forEach(cfg => {
            const eb = new ValueBindingRR(el, cfg);
            eb.attachBinder(this);
            bindings.push(eb);
        });

        // Create simple bindings for everything else (including if/validate/class/etc.)
        configs.filter(x => x.type !== "foreach" && x.type !== "event" && x.type !== "value" && x.type !== "itemTemplate" && x.type !== "foreachTemplate" && x.type !== "foreachMode")
            .forEach(cfg => {
                const sb = new SimpleBindingRR(el, cfg);
                sb.attachBinder(this);
                bindings.push(sb);

                // If this element includes a validate binding, add it to our set.
                if (cfg.type === "validate")
                    this.validateElements.add(el);
            });

        this.bindingMap.set(el, bindings);
    }

    // Applies the bindings using the current context (defaults to the observable's proxy).
    // For normal bindings(excluding foreach), we update the element
    // and subscribe to changes on properties that affect its bindings.
    // Additionally, we set up a global subscription that re-checks the validate bindings
    // when any validateTrigger property changes.
    public applyBindings(context?: any, bindingsMap?: Map<HTMLElement, BindingRR[]>): void {
        context = context ?? this.observable.Proxy;
        bindingsMap = bindingsMap ?? this.bindingMap;

        bindingsMap.forEach((bindings, element) => {
            // Foreach bindings should be applied first (they manage their own child binders)
            const foreachBinding = bindings.find(x => x instanceof ForeachBindingRR) as ForeachBindingRR | undefined;
            if (foreachBinding)
                foreachBinding.apply(context);

            // Apply non-foreach bindings
            const nonForeachBindings = bindings.filter(x => !(x instanceof ForeachBindingRR));
            if (nonForeachBindings.length < 1)
                return;

            nonForeachBindings.forEach(x => x.apply(context));

            // Subscribe to changes that affect any binding paths for this element.
            // We create a single subscription per element that re-applies all non-foreach bindings when needed.
            const subscription = this.observable.subscribe(
                () => { nonForeachBindings.forEach(x => x.apply(context)); },
                (changedPath) => {
                    // If any binding for this element is affected, return true
                    return nonForeachBindings.some(binding => this.isBindingAffected(changedPath, binding.config.path));
                },
                undefined,
                ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: element, reason: "DataBinder update!" } : undefined
            );

            // Track subscription so it can be disposed with the element's bindings
            nonForeachBindings.forEach(x => x.addSub(subscription));
        });

        //Global subscription for updating validation bindings when any trigger changes.
        const validationSub = this.observable.subscribe(
            () => this.updateValidationBindings(context),
            (changedPath) => {
                // Check if the changed property affects any validateTrigger.
                for (let element of this.validateElements) {
                    const bindings = this.bindingMap.get(element) || [];
                    const triggerBinding = bindings.find(x => x.config.type === "validateTrigger");
                    if (triggerBinding && this.isBindingAffected(changedPath, triggerBinding.config.path)) {
                        return true;
                    }
                }
                return false;
            },
            undefined,
            ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: "Global validation", reason: "Update all validate-bound elements" } : undefined
        );

        // store global validation subscription on the BindingSourceRR instance so dispose() can clear it
        // (we keep it simple: push it into a dummy bindingMap entry keyed by document)
        // TODO: need to refactor this and whole validation
        const docKey = document.documentElement as HTMLElement;
        const existing = this.bindingMap.get(docKey) || [];
        
        // create a lightweight binding to hold the subscription so it gets disposed with dispose()
        const holder = new (class extends BindingRR {
            apply() { }
        })(docKey, { type: "__internal", path: "" });
        holder.attachBinder(this);
        holder.addSub(validationSub);
        existing.push(holder);
        this.bindingMap.set(docKey, existing);
    }

    // Iterates over all elements in our validateElements set and updates only their "validate" binding.
    private updateValidationBindings(context: any): void {
        this.validateElements.forEach(element => {
            const bindings = this.bindingMap.get(element);
            if (bindings) {
                const validateBinding = bindings.find(x => x.config.type === "validate");
                if (validateBinding) 
                    validateBinding.apply(context);
            }
        });
    }
}

