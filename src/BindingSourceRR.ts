import { ObservableRR, isPrefix } from "./ObservableRR";
import { BindingRR, BindingConfig, EVENT_HANDLERS, DISPLAY, BoundElement } from "./Bindings/BindingRR";
import { EventBindingRR } from "./Bindings/EventBindingRR";
import { ForeachBindingRR } from "./Bindings/ForeachBindingRR";
import { SimpleBindingRR } from "./Bindings/SimpleBindingRR";
import { ValueBindingRR } from "./Bindings/ValueBindingRR";

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
                undefined
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
            undefined
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