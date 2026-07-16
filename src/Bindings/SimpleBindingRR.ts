import { BindingRR, BoundElement, DISPLAY } from "./BindingRR";

// SimpleBinding: handles the non-foreach, non-event bindings.
// It encapsulates the previous updateElement switch logic for a single binding.
export class SimpleBindingRR extends BindingRR {
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
                // if we have target defined we add that class otherwise we just use value
                // allows us to use either class.TargetClass or just class: TargetClass
                if (value)
                    this.element.classList.add(this.config.target || value);
                else
                    this.element.classList.remove(this.config.target || value);
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