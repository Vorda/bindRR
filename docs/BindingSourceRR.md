This is the part of my framework where everything comes together: **reactivity → DOM → UI → user interaction**.

---

# **📘 BindingSourceRR — A Complete Architectural & Usage Guide**

---

## **1. Purpose and Philosophy**

`BindingSourceRR` is the **UI binding engine** of my framework — the layer that connects:

- **ObservableRR** (reactive state)
- **HTML DOM**
- **User interactions**
- **Computed values**
- **Validation**
- **Templates & foreach loops**
- **Two‑way binding**

It is my framework’s equivalent of:

- **Knockout.js bindings**
- **Vue’s template compiler**
- **Angular’s structural directives**
- **Svelte’s reactive DOM updates**

But implemented in my own style: **lightweight, explicit, proxy‑driven, and DOM‑native**.

Two sentences from my source summarize its mission:

> *“Applies the bindings using the current context (defaults to the observable’s proxy).”*  
> *“Subscribe to changes that affect any binding paths for this element.”*

This is the essence: **DOM elements react to state changes automatically**, and **state updates react to DOM events**.

---

# **2. Architectural Overview**

### **2.1 Core Responsibilities**
`BindingSourceRR` handles:

- Parsing `data-bind` attributes  
- Mapping DOM elements to binding configurations  
- Updating DOM when ObservableRR changes  
- Subscribing to relevant property paths  
- Handling two‑way bindings (`value`)  
- Handling event bindings (`event.click`)  
- Handling conditional bindings (`if`, `visible`)  
- Handling attribute/class bindings  
- Handling validation  
- Handling `foreach` template rendering  
- Cleaning up event handlers on reset  

### **2.2 High‑Level Flow**
1. **Scan DOM** → build binding map  
2. **Apply bindings** → initial DOM update  
3. **Subscribe to ObservableRR** → reactive updates  
4. **Attach event handlers** → two‑way binding  
5. **Handle foreach loops** → dynamic DOM generation  
6. **Handle validation triggers** → global subscription  
7. **Dispose** → cleanup on target reset  

This is a full MVVM binding engine.

---

# **3. Binding Syntax**

### **3.1 Basic Syntax**
Bindings are declared in HTML:

```html
<div data-bind="text: user.name"></div>
```

Multiple bindings:

```html
<div data-bind="text: user.name; class.active: user.isActive"></div>
```

### **3.2 Binding Types**
Supported binding types:

- `text`
- `html`
- `value` (two‑way)
- `attr.placeholder`
- `class.active`
- `visible`
- `if`
- `event.click`
- `validate`
- `validateTrigger`
- `modal` (Bootstrap)
- `foreach`

Each binding is parsed into a `BindingConfig`.

---

# **4. Binding Map & DOM Scanning**

### **4.1 Binding Map**
```ts
private bindingMap: Map<HTMLElement, BindingConfig[]> = new Map();
```

This is the central registry of:

- which element  
- has which bindings  
- mapped to which state paths  

### **4.2 Scanning**
```ts
scanBindings(root?: Document | Element)
```

This:

- Finds all `[data-bind]` elements  
- Parses binding strings  
- Stores configs in `bindingMap`  
- Tracks validation elements  

This is your “template compiler”.

---

# **5. Reactive DOM Updates**


### **5.1 Subscribing to ObservableRR**
For each element:

```ts
this.observable.subscribe(
    () => this.updateElement(...),
    (changedPath) => this.isBindingAffected(changedPath, binding.path)
);
```

This means:

- DOM updates only when relevant state changes  
- No unnecessary re-renders  
- Efficient prefix‑based dependency matching  

### **5.2 isBindingAffected**
```ts
return isPrefix(changedPath, bindingParts) || isPrefix(bindingParts, changedPath);
```

This allows:

- `user.name` to update `user` bindings  
- `user` updates to affect `user.name` bindings  

It’s a flexible dependency matcher.

---

# **6. Element Updating Logic**

### **6.1 Conditional Binding (`if`)**
```ts
ifBinding → element.style.display = cond ? "" : "none"
```

This is your structural directive.

### **6.2 Text & HTML**
```ts
text → element.textContent  
html → element.innerHTML
```

### **6.3 Value (Two‑Way Binding)**
```ts
input.value = stateValue
input.addEventListener("input", e => state[path] = e.target.value)
```

This is full two‑way MVVM binding.

### **6.4 Attributes**
```ts
attr.placeholder: user.name
```

### **6.5 Visibility**
Stores initial display value using a symbol:

```ts
element[DISPLAY]
```

### **6.6 Class Binding**
```ts
class.active: user.isActive
```

### **6.7 Validation**
Supports:

- `validate`
- `validateTrigger`

Validation logic:

- Trim strings  
- Add/remove `is-invalid` class  
- Global subscription updates all validation elements  

### **6.8 Modal Binding**
Bootstrap modal integration:

```ts
modalInstance.show() / hide()
```

---

# **7. Event Binding**

### **7.1 Syntax**
```html
<button data-bind="event.click: global.onClick"></button>
```

### **7.2 Handler Resolution**
If path starts with `global`:

- Use proxied context (fresh state)

Else:

- Use original object (avoid computed auto-evaluation)

### **7.3 Handler Attachment**
```ts
element.addEventListener(binding.target, eventHandler)
```

Stored in:

```ts
element[EVENT_HANDLERS]
```

So cleanup is possible.

---

# **8. Foreach Binding (Template Rendering)**


### **8.1 Syntax**
```html
<div data-bind="foreach: items">
    <template>
        <span data-bind="text: name"></span>
    </template>
</div>
```

### **8.2 Rendering Steps**
1. Resolve array  
2. Find `<template>`  
3. Clone template for each item  
4. Create item context (`item`, `$index`, `global`)  
5. Create new BindingSourceRR for each clone  
6. Bind clone  
7. Append clone  

### **8.3 Reactivity**
Subscribes to:

```ts
this.observable.subscribe(() => renderLoop(), pathMatches)
```

So:

- Adding items updates DOM  
- Removing items updates DOM  
- Changing items updates DOM  

### **8.4 Known Limitations**
Notes from code:

- No cleanup of old bindings  
- Potential memory leaks  
- Re-renders entire list  
- No diffing algorithm  

But it works well for demos and small lists tested so far.

---

# **9. Disposal & Cleanup**

### **9.1 On Observable Reset**
```ts
this.observable.BeforeTargetChange(() => this.dispose());
```

### **9.2 dispose()**
- Remove event listeners  
- Restore original display values  
- Clear handler maps  

This prevents:

- memory leaks  
- duplicate handlers  
- stale bindings  

---

# **10. Strengths & Limitations**

### **Strengths**
- Full MVVM binding engine  
- Deep reactivity via ObservableRR  
- Two‑way binding  
- Event binding  
- Validation system  
- Template rendering  
- Conditional visibility  
- Attribute/class binding  
- Clean architecture  
- Extensible  

### **Limitations**
- Foreach re-renders entire list  
- No diffing (like React/Vue)  
- No virtual DOM  
- No cleanup for nested binders  
- No async template loading  
- No component system (yet)  

These can be added later.

---

# **11. Summary**

`BindingSourceRR` is the **UI binding layer** of our framework — the part that makes your reactive state *visible*, *interactive*, and *dynamic*.

It is:

- A DOM compiler  
- A reactive renderer  
- A two‑way binding engine  
- A validation system  
- A template renderer  
- A structural directive processor  
- A glue layer between ObservableRR and the DOM  

Together with ObservableRR and FactoryRR, we now have:

- **Reactivity**
- **Events**
- **Dependency Injection**
- **DOM Binding**

This is a full mini‑framework.

---