import { ObservableRR, isPrefix } from "./ObservableRR";

const EVENT_HANDLERS = Symbol("boundEventHandlers");
const DISPLAY = Symbol("initialDisplay");

interface BoundElement extends HTMLElement {
    [EVENT_HANDLERS]?: Record<string, EventListener>;
    [DISPLAY]?:string
}
 
/*
 * An individual binding configuration.
 */
interface BindingConfig {
    type: string;         // e.g., "text", "html", "value", "attr", "title", "if", "foreach", etc.
    target?: string;      // Target attribute for "attr" bindings or specific event type for "event"
    path: string;         // The property path to bind (e.g., "user.name")
}


export class BindingSourceRR {
    private bindingMap: Map<HTMLElement, BindingConfig[]> = new Map();

    get Observable() { return this.observable; }

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

    // TODO: really need to refactor storing stuff directly on HTML elements
    public dispose() {
        this.bindingMap.forEach((bindings, element) => {
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
    }

    // Helper function to traverse an object using an array of keys.
    private getValueFromPath(obj: any, pathArr: string[]): any {
        return pathArr.reduce((curr, key) => (curr ? curr[key] : undefined), obj);
    }

    // Helper function that sets a nested property given an array of keys.
    private setValueFromPath(obj: any, pathArr: string[], value: any): void {
        const lastKey = pathArr.pop();
        const target = pathArr.reduce((curr, key) => (curr ? curr[key] : undefined), obj);
        if (target && lastKey) {
            target[lastKey] = value;
        }
    }

    /*
     * Parses a binding expression string into an array of BindingConfig objects.
     * The binding syntax uses semicolons to separate expressions. Each expression follows:
     *   bindingType: propertyPath
     * For attribute or event bindings, use dot notation on the key.
     * ("attr.placeholder: user.name", "event.click: MyClickHandler"...)
     */
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
    private isBindingAffected(changedPath: PropertyKey[], bindingPath: string): boolean {
        const bindingParts = bindingPath.split(".");
        // Return true if one array is a prefix of the other.
        return isPrefix(changedPath, bindingParts) || isPrefix(bindingParts, changedPath);
    }



    // Update the element's content and attributes based on the bindings.
    private updateElement(element: HTMLElement, bindings: BindingConfig[], context: any): void {
        let conditionPass = true;
        const ifBinding = bindings.find((b) => b.type === "if");
        if (ifBinding) {
            const condValue = this.getValueFromPath(context, ifBinding.path.split("."));
            conditionPass = !!condValue;
            element.style.display = conditionPass ? "" : "none";
        }

        if (!conditionPass)
            return;

        // TODO: Refactor into a proper extension system and move specific bindings to separate classes
        // this part will grow hard & fast - notice the hardcoded @ts-ignore bootstrap model :)
        bindings.forEach((binding) => {
            if (["if", "event", "foreach"].includes(binding.type))
                return;

            const pathArr = binding.path.split(".");
            let value = this.getValueFromPath(context, pathArr);

            switch (binding.type) {
                case "text":
                    element.textContent = value !== undefined ? String(value) : "";
                    break;
                case "html":
                    element.innerHTML = value !== undefined ? String(value) : "";
                    break;
                case "value":
                    if ("value" in element)
                        (element as HTMLInputElement).value = value !== undefined ? String(value) : "";
                    break;
                case "attr":
                    if (binding.target)
                        element.setAttribute(binding.target, value !== undefined ? String(value) : "");
                    break;
                // very simple visibility control by a bool variable - we store the initial display value on first assign
                case "visible":
                    const bound = (element as BoundElement);
                    const prevDisplay = bound[DISPLAY] ?? element.style.display;
                    element.style.display = value ? prevDisplay : "none";
                    break;
                case "class":
                    if (value) 
                        element.classList.add(binding.target || "");
                    else 
                        element.classList.remove(binding.target || "");
                    break;
                case "validate":
                    // If a triggering property was declared, use it; otherwise, always validate.
                    let applyValidation = true;
                    const currentBindings = this.bindingMap.get(element) || [];
                    const triggerBinding = currentBindings.find(b => b.type === "validateTrigger");
                    if (triggerBinding) {
                        const triggerValue = this.getValueFromPath(context, triggerBinding.path.split("."));
                        applyValidation = !!triggerValue;
                    }

                    if (!applyValidation) {
                        element.classList.remove("is-invalid"); 
                    } else {
                        let validValue = value;
                        if (typeof validValue === "string") validValue = validValue.trim();
                        if (!validValue) {
                            element.classList.add("is-invalid"); 
                        } else {
                            element.classList.remove("is-invalid"); 
                        }
                    }
                    break;
                case "modal":
                    // Show or hide the Bootstrap modal based on the value.
                    // Probably not a good idea to hardcode bootstrap straight into the framework :)
                    // @ts-ignore: Suppress type checking for Bootstrap modal usage
                    const modalInstance = bootstrap.Modal.getOrCreateInstance(element);
                    if (value) {
                        modalInstance.show();
                    } else {
                        modalInstance.hide();
                    }
                    break;
                default:
                    // For any other type, treat it as an attribute name.
                    if (binding.type)
                        element.setAttribute(binding.type, value !== undefined ? String(value) : "");
                    break;
            }
        });
    }

    /*
     * Handles loop bindings. The element with a "foreach" binding should contain a <template> child.
     * The binding object specifies the array path to iterate over.
     * For each item in the array, we clone the template, apply advanced bindings with the item as context,
     * and append the result.
     */
    private applyForeachBinding(element: HTMLElement, binding: BindingConfig, context: any): void {
        // Evaluate the array from context.
        const arrayValue = this.getValueFromPath(context, binding.path.split("."));
        if (!Array.isArray(arrayValue)) {
            console.error(`"foreach" binding: expected array at path '${binding.path}'`);
            return;
        }

        // Look for a <template> element - inside the container or 
        // provided by data-template attribute
        let template: HTMLTemplateElement | null = element.querySelector("template");
        if (!template) {
            const templateId = element.getAttribute("data-template");
            if (templateId)
                template = document.getElementById(templateId) as HTMLTemplateElement;

            if (!template) {
                console.error("Foreach binding: no <template> element found inside container", element);
                return;
            }
        }

        // TODO: Need to remake foreach binding properly :)
        // Probably very costly & memory leaky in current initial demo implemenation.
        // not clearing bindings when deleting old elements, not unsubscribing, etc...

        const renderLoop = () => {
            // Remove all child elements except for the <template>.
            Array.from(element.children)
                .filter((child) => child.tagName.toLowerCase() !== "template")
                .forEach((child) => {
                    child.remove()
                });

            arrayValue.forEach((item, index) => {
                const clone = document.importNode(template.content, true);

                // If there's exactly one top-level element, use that element as the container.
                // Otherwise, fallback to a container.
                let container: HTMLElement;
                if (clone.childElementCount === 1) {
                    container = clone.firstElementChild as HTMLElement;
                } else {
                    console.warn("Template element for the foreach binding should have a single top level element! i'm inserting a DIV around the item...")
                    // Fallback container if template returns multiple top-level nodes.
                    container = document.createElement("div");
                    // Append all nodes from the clone into the container.
                    while (clone.firstChild) {
                        container.appendChild(clone.firstChild);
                    }
                }

                // Create an item-specific context: merge properties from the item
                // with additional metadata like $index and a reference to the main state.
                const itemContext = Object.assign({}, item, { $index: index, global: context });

                // Create a new DataBinder instance to bind within the container - read my upper TODO :)
                const binder = new BindingSourceRR(this.observable);
                binder.scanBindings(container);
                binder.applyBindings(itemContext);

                element.appendChild(container);
            });
        };

        renderLoop();

        this.observable.subscribe((changedPath) => {
            if (this.isBindingAffected(changedPath, binding.path)) {
                renderLoop();
            }
        },
            undefined,
            undefined,
            ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: element, reason: "Foreach binding update" } : undefined
        );
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
        if (bindingStr) {
            const configs = this.parseBindingString(bindingStr);
            this.bindingMap.set(el, configs);

            // If this element includes a validate binding, add it to our set.
            if (configs.some(binding => binding.type === "validate"))
                this.validateElements.add(el);
        }
    }

    /*
     * Applies the bindings using the current context (defaults to the observable's proxy).
     * For normal bindings(excluding foreach), we update the element
     * and subscribe to changes on properties that affect its bindings.
     * Additionally, we set up a global subscription that re-checks the validate bindings
     * when any validateTrigger property changes.
     */
    public applyBindings(context?: any, bindingsMap?: Map<HTMLElement, BindingConfig[]>): void {
        context = context ?? this.observable.Proxy;
        bindingsMap = bindingsMap ?? this.bindingMap;

        bindingsMap.forEach((bindings, element) => {
            const foreachBinding = bindings.find((b) => b.type === "foreach");
            if (foreachBinding) {
                this.applyForeachBinding(element, foreachBinding, context);
            }

            const nonForeachBindings = bindings.filter(b => b.type !== "foreach");
            if (nonForeachBindings.length < 1)
                return;

            // Set the initial value.
            this.updateElement(element, nonForeachBindings, context);

            // Subscribe to changes that affect any binding paths for this element.
            this.observable.subscribe(
                () => this.updateElement(element, nonForeachBindings, context),
                (changedPath) => nonForeachBindings.some(binding => this.isBindingAffected(changedPath, binding.path)),
                undefined,
                ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: element, reason: "DataBinder update!" } : undefined
            );

            // Attach extra listeners for two-way bindings and events.
            nonForeachBindings.forEach((binding) => {
                const boundElem = element as BoundElement;

                // Establish two-way binding if a "value" binding is declared
                if (binding.type === "value" && element instanceof HTMLInputElement) {
                    boundElem[EVENT_HANDLERS] = boundElem[EVENT_HANDLERS] || {};
                    if (!boundElem[EVENT_HANDLERS]["input"]) {
                        const eventHandler = (event: Event) => {
                            const newValue = (event.target as HTMLInputElement).value;
                            this.setValueFromPath(context, binding.path.split("."), newValue);
                        };
                        element.addEventListener("input", eventHandler);
                        boundElem[EVENT_HANDLERS]["input"] = eventHandler;
                    }
                    else
                        console.warn("Skipped adding event handler, there already was one for that event.");
                }

                // Event binding handling. 
                if (binding.type === "event" && binding.target) {
                    boundElem[EVENT_HANDLERS] = boundElem[EVENT_HANDLERS] || {};
                    if (!boundElem[EVENT_HANDLERS][binding.target]) {
                        const pathParts = binding.path.split(".");
                        let handler: any;
                        // If the binding path starts with 'global', remove it and use the context (observable proxy).
                        if (pathParts[0] === "global") {

                            //if (!context.global)
                            //    pathParts.shift(); // remove the first element ('global')

                            // Now, look up the handler using the proxied context.
                            handler = this.getValueFromPath(context, pathParts);
                        } else {
                            // Otherwise, use the raw target to avoid computed auto-evaluation.
                            handler = this.getValueFromPath(this.observable.Original, binding.path.split("."));
                        }

                        if (typeof handler === "function") {
                            const eventHandler = (event: Event) => { handler.call(context, event); };
                            // Here we call the handler with the observable proxy as context,
                            // we can call it with the orignal too, for now we call with proxy to fresh data
                            element.addEventListener(binding.target, eventHandler);
                            boundElem[EVENT_HANDLERS][binding.target] = eventHandler;
                        }
                    }
                    else
                        console.warn("Skipped adding event handler, there already was one for that event.");
                }

            });
        });

        // Global subscription for updating validation bindings when any trigger changes.
        this.observable.subscribe(
            () => this.updateValidationBindings(context),
            (changedPath) => {
                // Check if the changed property affects any validateTrigger.
                for (let element of this.validateElements) {
                    const bindings = this.bindingMap.get(element) || [];
                    const triggerBinding = bindings.find(b => b.type === "validateTrigger");
                    if (triggerBinding && this.isBindingAffected(changedPath, triggerBinding.path)) {
                        return true;
                    }
                }
                return false;
            },
            undefined,
            ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: "Global validation", reason: "Update all validate-bound elements" } : undefined
        );
    }

    /*
     * Iterates over all elements in our validateElements set and updates only their "validate" binding.
     */
    private updateValidationBindings(context: any): void {
        this.validateElements.forEach(element => {
            const bindings = this.bindingMap.get(element);
            if (bindings) {
                const validateBinding = bindings.find(b => b.type === "validate");
                if (validateBinding) {
                    this.updateElement(element, [validateBinding], context);
                }
            }
        });
    }
}

