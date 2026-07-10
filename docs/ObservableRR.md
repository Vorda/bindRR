
---

# **📘 ObservableRR — A Complete Architectural & Usage Guide**

---

## **1. Purpose and Philosophy**

`ObservableRR<T>` is the **reactive heart** of my framework.  
It transforms any plain JavaScript object into a **deeply observable, dependency‑tracked, computed‑aware state container**.

Its design goals:

- **Observe any nested property** (deep proxying)
- **Notify subscribers with exact change paths**
- **Support computed properties with dependency tracking**
- **Provide lifecycle events for swapping the root object**
- **Allow runtime control over which keys are ignored**
- **Be lightweight, predictable, and extensible**

Two sentences from my source capture its essence:

> *“The observer receives the full path to the changed property (as an array of keys), the new value, and the old value.”*  
> *“Automatically wrap nested objects or arrays in a proxy.”*

These two lines define the entire philosophy: **deep observation + precise change reporting**.

---

# **2. Architectural Overview**

### **2.1 Core Components**
`ObservableRR` is built from four major subsystems:

- **Proxy Layer** — intercepts `get`, `set`, and `deleteProperty`
- **Subscription System** — manages observers, filters, error handlers, debug info
- **Computed System** — tracks dependencies and caches computed values
- **Lifecycle Events** — powered by `AsyncEventEmitterRR`

### **2.2 Object-Oriented Patterns**
- **Observer Pattern** — subscribers react to changes
- **Proxy Pattern** — wraps the original object with reactive behavior
- **Strategy Pattern** — lifecycle events use async emission strategies
- **Encapsulation** — internal state hidden behind public API
- **Composition** — uses `AsyncEventEmitterRR` rather than reimplementing events

---

# **3. Deep Proxy System**

### **3.1 Why Proxy?**
JavaScript’s `Proxy` allows you to intercept:

- property reads  
- property writes  
- property deletions  

This gives you **complete visibility** into object mutations.

### **3.2 Deep Wrapping**
When you access a nested object:

```ts
s.nested.name
```

The proxy system:

1. Detects that `nested` is an object  
2. Wraps it in a new proxy  
3. Caches the proxied version  
4. Returns the proxy instead of the raw object  

This ensures **every nested property is observable**, no matter how deep.

### **3.3 Change Notification**
When a property changes:

```ts
s.user.address.city = "Zagreb";
```

The system constructs a path:

```ts
["user", "address", "city"]
```

Then calls:

```ts
notify(path, newValue, oldValue)
```

Subscribers receive **exactly what changed**, not a vague “something changed”.

---

# **4. Subscription System**





### **4.1 Subscription Structure**
Each subscription stores:

- `observer` — callback receiving `(path, newValue, oldValue)`
- `filter` — optional predicate `(changedPath) => boolean`
- `errorHandler` — handles observer exceptions
- `debugInfo` — timestamp, stack trace, reason, subscriber tag

### **4.2 Filters**
Filters allow extremely precise subscriptions:

```ts
obs.subscribe(fn, path => path[0] === "settings");
```

This is more powerful than typical event systems.

### **4.3 Error Handling**
If an observer throws:

- If `errorHandler` exists → it handles the error  
- Otherwise → error is logged  

This prevents one bad listener from breaking the entire system.

### **4.4 Composed Subscriptions**
You can combine multiple subscriptions:

```ts
const combined = ObservableRR.composeSubscriptions([sub1, sub2, sub3]);
combined.unsubscribe();
```

A clean, ergonomic API.

---

# **5. Computed Properties**

### **5.1 What is a computed property?**
A function attached to your object that:

- depends on other properties  
- recalculates when dependencies change  
- can optionally cache results  

Example:

```ts
state.total = computed(function() {
    return this.a + this.b;
}, { cache: true });
```

### **5.2 Dependency Tracking**
When a computed function runs:

1. A **computed context** is pushed  
2. Every `get` records the accessed path  
3. The context is popped  
4. Dependencies are stored  

This is similar to Vue’s reactivity or MobX’s derivations.

### **5.3 Cache Invalidation**
If caching is enabled:

- The system subscribes to each dependency  
- When any dependency changes:
  - cached value is deleted  
  - computed function is re-evaluated  
  - subscribers of the computed path are notified  

This is a **reactive computed system**, not just a getter.

---

# **6. Lifecycle Management**

### **6.1 Resetting the Target**
`resetTarget(newTarget)`:

1. Cleans computed subscriptions  
2. Clears all observers  
3. Emits `beforeResetTarget`  
4. Replaces `original` and `proxy`  
5. Emits `afterResetTarget`

This is crucial for:

- hot-reloading state  
- replacing entire models  
- resetting UI components  
- swapping game entities  

### **6.2 Async Lifecycle Hooks**
Because `ObservableRR` extends `AsyncEventEmitterRR`, lifecycle events can be:

- async  
- parallel  
- sequential  

This is extremely powerful.

---

# **7. ProxyManager — Runtime Ignore Rules**

Sometimes you don’t want a property to be proxied:

```ts
ignoreList.add("bigDataBlob");
```

This prevents:

- unnecessary deep wrapping  
- performance issues  
- proxying DOM nodes  
- proxying external library objects  

This is a **runtime-configurable behavior**, not static.

---

# **8. Practical Usage Examples**

### **8.1 Basic Observation**
```ts
const obs = new ObservableRR({ count: 0 });
obs.subscribe((path, newV) => console.log(path, newV));

obs.Proxy.count = 10;
```

### **8.2 Nested Observation**
```ts
const obs = new ObservableRR({ user: { name: "Davor" } });

obs.subscribe((path, newV) => console.log(path.join("."), newV));

obs.Proxy.user.name = "Vorda";
```

### **8.3 Computed Property**
```ts
state.fullName = computed(function() {
    return this.first + " " + this.last;
}, { cache: true });
```

### **8.4 Resetting the Target**
```ts
await obs.resetTarget({ count: 0 });
```

---

# **9. Strengths & Limitations**

### **Strengths**
- Deep observation  
- Precise change paths  
- Computed dependency tracking  
- Async lifecycle events  
- Runtime ignore rules  
- Clean API  
- Extensible architecture  

### **Limitations**
- Proxying very large objects can be expensive  
- Computed metadata stored on functions (can be improved with WeakMaps)  
- Dependency tracking uses string paths (prefix matching only)  

---

# **10. Summary**

`ObservableRR` is a **full reactive state engine**, not just a proxy wrapper.  
It combines:

- deep proxying  
- observer pattern  
- computed reactivity  
- async lifecycle events  
- runtime configurability  

It is absolutely framework‑grade.

---