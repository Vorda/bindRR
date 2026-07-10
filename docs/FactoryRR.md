**Short take:** **FactoryRR is the third pillar of my framework — after ObservableRR (reactivity) and AsyncEventEmitterRR (events), FactoryRR gives you *composition*, *construction control*, and *dependency injection*.**  
It’s not a toy DI container. It’s a genuinely flexible, extensible, pattern‑rich system that supports constructor injection, partial injection blueprints, generic specialization tokens, singleton management, and auto‑instantiation fallback.

---

# **📘 FactoryRR — A Complete Architectural & Usage Guide**

---

## **1. Purpose and Philosophy**

FactoryRR is my framework’s **dependency injection (DI) engine** — the component responsible for:

- Constructing objects  
- Injecting dependencies  
- Managing singletons  
- Handling generics via tokens  
- Supporting partial injection blueprints  
- Auto‑instantiating unregistered dependencies  
- Providing a clean, declarative way to wire your architecture  

It is the natural evolution after:

- **ObservableRR** (reactive state)  
- **AsyncEventEmitterRR** (event system)  

FactoryRR completes the trio by giving you **composition and lifecycle control**.

My comment in the source captures its spirit:

> *“A prototype of dependency injection system for typescript / javascript. Still very crude, but a great starting point for a full on DI system.”*

This is exactly right — and the architecture is already strong.

---

# **2. Architectural Overview**


FactoryRR is built around three core ideas:

### **2.1 Registrations**
Each class or token can be registered with:

- constructor  
- dependency list  
- injection order  
- partial injection blueprint  
- singleton flag  

This is the DI container’s “schema”.

### **2.2 Tokens**
We support two kinds of keys:

- **ConstructorsRR** — normal DI tokens  
- **InjectionTokenRR<T>** — generic specialization tokens  

This allows us to register:

```ts
UserRepository
UserRepository<MySql>
UserRepository<Postgres>
```

…as distinct injectable types.

### **2.3 Dependency Container**
A map storing:

- singleton instances  
- externally provided instances  

This is our DI “cache”.

---

# **3. Object‑Oriented Patterns**

FactoryRR uses several OOP and architectural patterns:

### **3.1 Dependency Injection Pattern**
Constructor injection with optional blueprints.

### **3.2 Service Locator Pattern**
`resolveDependency()` acts like a service locator when auto‑instantiating.

### **3.3 Abstract Factory Pattern**
`create()` is a configurable factory method.

### **3.4 Token Pattern**
InjectionTokenRR<T> is identical to Angular’s DI token system.

### **3.5 Strategy Pattern**
Injection order (`dependencies-first` vs `dependencies-last`) is a strategy.

### **3.6 Builder Pattern**
Parameter blueprints act like a constructor argument builder.

---

# **4. Registration System**

### **4.1 Basic Registration**
```ts
factory.register(MyService, {
    dependencyTokens: [Logger, Config],
    isSingleton: true,
    injectionOrder: "dependencies-first"
});
```

This means:

- MyService(Logger, Config, ...externalArgs)
- Singleton instance cached after first creation

### **4.2 Generic Registration**
```ts
const token = factory.registerGeneric(Repository, UserModel);
```

This generates:

```
Repository<UserModel>
```

as a unique DI token.

### **4.3 Singleton Registration**
```ts
factory.registerSingleton(Logger, new Logger());
```

This overrides auto‑instantiation.

---

# **5. Parameter Blueprints (Partial Injection)**

This is one of the most powerful features.

A blueprint describes **each constructor parameter individually**:

```ts
parameterInstructions: [
    { type: "inject", token: Logger },
    { type: "external" },
    { type: "external", defaultValue: 42 }
]
```

Meaning:

- param 0 → inject Logger  
- param 1 → external argument  
- param 2 → external argument or default 42  

This is more flexible than Angular, NestJS, or .NET DI.

It allows:

- mixing injected + external args  
- default values  
- precise constructor shaping  
- partial DI for complex classes  

---

# **6. Dependency Resolution**

### **6.1 resolveDependency()**
This method tries three strategies:

1. **Singleton instance exists** → return it  
2. **Registered class** → call `create()` recursively  
3. **Auto‑instantiate** → `new token()`  

If all fail → throw error.

This is a hybrid of DI + service locator + auto‑factory.

---

# **7. Instance Creation Pipeline**


The `create()` method is the heart of FactoryRR.

It supports **three construction modes**:

---

## **Mode 1 — Blueprint Injection**
If `parameterInstructions` exist:

- Build finalArgs array  
- Inject dependencies where requested  
- Insert external args where requested  
- Apply default values  
- Construct instance  
- Cache if singleton  

This is the most powerful mode.

---

## **Mode 2 — Dependency Tokens**
If `dependencyTokens` exist:

- Resolve each dependency  
- Combine with external args  
- Respect injection order  
- Construct instance  
- Cache if singleton  

This is classic constructor injection.

---

## **Mode 3 — Raw Constructor**
If no registration exists:

```ts
new token(...externalArgs)
```

This fallback makes FactoryRR usable even without full DI setup.

---

# **8. Practical Usage Examples**

### **8.1 Simple DI**
```ts
factory.register(Logger);
factory.register(Service, { dependencyTokens: [Logger] });

const s = factory.create(Service);
```

### **8.2 Singleton**
```ts
factory.register(Config, { isSingleton: true });

const c1 = factory.create(Config);
const c2 = factory.create(Config);

c1 === c2; // true
```

### **8.3 Generic Token**
```ts
const repoToken = factory.registerGeneric(Repository, UserModel);
const repo = factory.create(repoToken);
```

### **8.4 Partial Injection**
```ts
factory.register(Controller, {
    parameterInstructions: [
        { type: "inject", token: Service },
        { type: "external" },
        { type: "external", defaultValue: "default" }
    ]
});

const c = factory.create(Controller, "arg1");
```

---

# **9. Strengths & Limitations**

### **Strengths**
- Extremely flexible constructor shaping  
- Generic DI tokens  
- Auto‑instantiation fallback  
- Singleton caching  
- Partial injection blueprints  
- Clean architecture  
- No decorators required  
- Works with any class  

### **Limitations**
- No circular dependency detection  
- No scoped lifetimes (singleton only)  
- No property injection  
- No async construction  
- No metadata reflection (manual registration required)  

These can be added later.

---

# **10. Summary**

FactoryRR is a **real DI container**, not a toy.

It gives your framework:

- **Composition**  
- **Lifecycle control**  
- **Dependency management**  
- **Generic specialization**  
- **Partial injection**  
- **Singleton caching**  
- **Auto‑instantiation**  

Together with ObservableRR and AsyncEventEmitterRR, it forms a **complete mini‑framework** capable of powering UI systems, game engines, reactive apps, and tooling.

---
