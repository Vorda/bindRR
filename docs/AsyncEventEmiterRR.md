
---

# **📘 AsyncEventEmitterRR — A Complete Architectural & Usage Guide**

---

## **1. Purpose and Philosophy**

The `AsyncEventEmitterRR` class is a **typed, asynchronous event system** designed for modern TypeScript applications.  
It solves a fundamental weakness in JavaScript’s ecosystem:

- Native events (like Node’s `EventEmitter`) are **synchronous**, **untyped**, and **unsafe** when listeners return promises.
- Most custom event systems ignore **error aggregation**, **parallel execution**, and **listener ordering**.
- Framework authors often reinvent event emitters — usually poorly.

`AsyncEventEmitterRR` is my answer to all of that.

It is:

- **Fully asynchronous**
- **Type‑safe**
- **Supports parallel & sequential strategies**
- **Aggregates errors**
- **Lightweight**
- **Framework‑ready**

It is not tied to `ObservableRR`.  
It stands on its own as a **general‑purpose event backbone** for any architecture.

---

# **2. Core Concepts**

### **2.1 Typed Event Maps**
The emitter is generic over an event map:

```ts
interface MyEvents {
    startup: [];
    userLoggedIn: [string];
    dataLoaded: [number, string];
}
```

This gives you:

- **Compile‑time validation**
- **Correct argument types**
- **No accidental misuse**

This is similar to C# delegates or .NET event signatures.

---

### **2.2 Asynchronous Listener Execution**

Listeners may be:

- synchronous
- asynchronous (`async`)
- promise‑returning

The emitter treats them uniformly.

This is crucial for:

- initialization pipelines  
- plugin systems  
- UI rendering  
- game loops  
- reactive frameworks  

---

### **2.3 Parallel vs Sequential Strategies**

This is where your emitter becomes *special*.

You support **three strategies**:

#### **emit()**
- Runs all listeners concurrently
- Awaits all of them
- Errors propagate normally

#### **emitParallel()**
- Runs listeners concurrently
- Collects errors
- Throws a single `AggregateError`

#### **emitSequential()**
- Runs listeners one by one
- Collects errors
- Throws a single `AggregateError`

This is the **Strategy Pattern** applied to event dispatching.

---

# **3. Internal Architecture**


### **3.1 Listener Storage**
Listeners are stored in:

```ts
private listeners: { [K in keyof EventMap]?: AsyncEventListener<EventMap[K]>[] } = {};
```

This is:

- a dictionary keyed by event name
- each entry is an array of listeners
- strongly typed by the event map

---

### **3.2 Listener Registration**
```ts
protected on<K extends keyof EventMap>(eventType: K, listener: AsyncEventListener<EventMap[K]>): this
```

This method:

- ensures the event type is valid
- ensures the listener signature matches the event
- returns `this` for fluent chaining

---

### **3.3 Listener Removal**
```ts
protected off<K extends keyof EventMap>(eventType: K, listener: AsyncEventListener<EventMap[K]>): this
```

Removes a listener by identity.

---

### **3.4 Emission Strategies**

#### **emit() — Basic async gather**
```ts
await Promise.all(eventListeners.map(listener => Promise.resolve(listener(...args))));
```

This is the simplest strategy:

- All listeners run concurrently
- Errors propagate immediately

---

#### **emitParallel() — Concurrent with error aggregation**
```ts
const results = await Promise.all(
    eventListeners.map(async (listener) => {
        try {
            await listener(...args);
            return null;
        } catch (err) {
            return err;
        }
    })
);
```

This is extremely useful when:

- listeners are independent
- you want all of them to run even if some fail
- you want a single aggregated error at the end

---

#### **emitSequential() — Ordered execution**
```ts
for (const listener of eventListeners) {
    try {
        await listener(...args);
    } catch (err) {
        errors.push(err);
    }
}
```

This is ideal for:

- initialization pipelines  
- middleware chains  
- ordered rendering  
- game update loops  

---

# **4. Object‑Oriented Patterns Used**

### **4.1 Strategy Pattern**
Different emission strategies = different execution strategies.

### **4.2 Observer Pattern**
Listeners subscribe to events; emitter notifies them.

### **4.3 Encapsulation**
Internal listener storage is private and protected.

### **4.4 Fluent API**
`on()` and `off()` return `this`.

### **4.5 Template Method Pattern**
Subclasses (like `ObservableRR`) extend the emitter and use its protected methods.

---

# **5. Practical Usage Examples**

## **5.1 Application Lifecycle**

```ts
class App extends AsyncEventEmitterRR<AppEvents> {}

app.on("startup", async () => loadConfig());
app.on("startup", async () => connectDatabase());
app.on("startup", async () => warmCache());

await app.emitSequential("startup");
```

---

## **5.2 Plugin Architecture**

```ts
class PluginManager extends AsyncEventEmitterRR<PluginEvents> {}

pluginManager.on("pluginLoaded", async (plugin) => plugin.initialize());
pluginManager.on("pluginLoaded", async (plugin) => plugin.registerRoutes());

await pluginManager.emitParallel("pluginLoaded", plugin);
```

---

## **5.3 Game Engine Loop**

```ts
class Game extends AsyncEventEmitterRR<GameEvents> {}

game.on("update", async (dt) => physics.update(dt));
game.on("update", async (dt) => ai.update(dt));
game.on("update", async (dt) => renderer.update(dt));

await game.emitSequential("update", deltaTime);
```

---

## **5.4 UI Rendering Pipeline**

```ts
ui.on("render", async () => drawHeader());
ui.on("render", async () => drawSidebar());
ui.on("render", async () => drawContent());

await ui.emitParallel("render");
```

---

## **5.5 E-commerce checkout pipeline**

Here's a realistic scenario where using AsyncEventEmiterRR really pays off: an **e-commerce checkout pipeline**, where different phases genuinely need different failure semantics — some must fail fast, some must run independently and report every failure, and some must run strictly in order.

```ts
import { AsyncEventEmitterRR } from "./EventEmitterRR";

// ─────────────────────────────────────────────────────────────
// 1. Define the event map — one entry per event, value = argument tuple.
//    This is the thing that makes every `on`/`emit*` call below type-checked.
// ─────────────────────────────────────────────────────────────
interface Order {
    id: string;
    items: { sku: string; qty: number }[];
    total: number;
    customerEmail: string;
}

interface CheckoutEvents {
    // fired once per validator; ALL must pass before we proceed
    validateOrder: [Order];

    // fired once per reservation step; must run in strict order
    // (can't charge the card before stock is reserved)
    reserveStock: [Order];
    chargePayment: [Order];
    createOrderRecord: [Order];

    // fired after the order is committed; independent side-effects
    // that shouldn't block each other
    orderCompleted: [Order];
}

// ─────────────────────────────────────────────────────────────
// 2. Subclass the emitter and expose a narrow public API.
//    Callers can't reach into `on`/`emit*` directly — they go through
//    the methods CheckoutPipeline chooses to expose.
// ─────────────────────────────────────────────────────────────
class CheckoutPipeline extends AsyncEventEmitterRR<CheckoutEvents> {

    // Public registration surface — thin wrappers around protected `on`
    onValidate(fn: (order: Order) => Promise<void> | void) { this.on("validateOrder", fn); }
    onReserveStock(fn: (order: Order) => Promise<void> | void) { this.on("reserveStock", fn); }
    onChargePayment(fn: (order: Order) => Promise<void> | void) { this.on("chargePayment", fn); }
    onCreateOrderRecord(fn: (order: Order) => Promise<void> | void) { this.on("createOrderRecord", fn); }
    onOrderCompleted(fn: (order: Order) => Promise<void> | void) { this.on("orderCompleted", fn); }

    async checkout(order: Order): Promise<void> {
        // --- Phase 1: validation — use emit() (fail-fast) -----------------
        // Multiple independent validators (stock check, fraud check, coupon
        // check...) can all run concurrently, but if ANY of them throws
        // (e.g. "card declined pre-check" or "item out of stock"), we want
        // to abort checkout immediately rather than keep going. emit()'s
        // Promise.all-style fail-fast behavior is exactly right here.
        try {
            await this.emit("validateOrder", order);
        } catch (err) {
            throw new Error(`Checkout aborted — validation failed: ${(err as Error).message}`);
        }

        // --- Phase 2: the actual transaction — use emitSequential() -------
        // These three steps have a hard dependency order: you must reserve
        // stock before charging the card, and charge the card before you
        // persist the order as "paid". Running them with Promise.all would
        // be a correctness bug (you could charge a card for stock you never
        // actually reserved). emitSequential() awaits each stage fully
        // before starting the next.
        await this.emitSequential("reserveStock", order);
        await this.emitSequential("chargePayment", order);
        await this.emitSequential("createOrderRecord", order);

        // --- Phase 3: post-commit side effects — use emitParallel() -------
        // Sending a confirmation email, notifying the warehouse, pushing an
        // analytics event, and updating a recommendation model are all
        // independent. If the analytics call times out, that must NOT stop
        // the customer's confirmation email from going out — but we still
        // want to know about the failure. emitParallel() runs everything
        // concurrently and aggregates any failures into one AggregateError
        // rather than letting one bad listener hide the others' outcomes.
        try {
            await this.emitParallel("orderCompleted", order);
        } catch (err) {
            // Order is already committed — these are non-critical failures.
            // Log/alert, but don't roll back the sale over a failed email.
            console.error("Some post-checkout side effects failed:", err);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 3. Wire up listeners and run it.
// ─────────────────────────────────────────────────────────────
const pipeline = new CheckoutPipeline();

pipeline.onValidate(async (order) => {
    if (order.items.length === 0) throw new Error("Cart is empty");
});
pipeline.onValidate(async (order) => {
    const inStock = await checkInventoryService(order.items);
    if (!inStock) throw new Error("Item out of stock");
});

pipeline.onReserveStock(async (order) => {
    console.log(`Reserving stock for order ${order.id}...`);
    await reserveInventory(order.items);
});

pipeline.onChargePayment(async (order) => {
    console.log(`Charging $${order.total} for order ${order.id}...`);
    await chargeCard(order.total);
});

pipeline.onCreateOrderRecord(async (order) => {
    console.log(`Persisting order ${order.id}...`);
    await saveOrderToDatabase(order);
});

pipeline.onOrderCompleted(async (order) => {
    await sendConfirmationEmail(order.customerEmail, order.id);
});
pipeline.onOrderCompleted(async (order) => {
    await notifyWarehouse(order);
});
pipeline.onOrderCompleted(async (order) => {
    await pushAnalyticsEvent("order_completed", order.id);
});

// ─────────────────────────────────────────────────────────────
// Stub services (stand-ins for real I/O)
// ─────────────────────────────────────────────────────────────
async function checkInventoryService(_items: Order["items"]): Promise<boolean> { return true; }
async function reserveInventory(_items: Order["items"]): Promise<void> {}
async function chargeCard(_total: number): Promise<void> {}
async function saveOrderToDatabase(_order: Order): Promise<void> {}
async function sendConfirmationEmail(_email: string, _orderId: string): Promise<void> {}
async function notifyWarehouse(_order: Order): Promise<void> {}
async function pushAnalyticsEvent(_name: string, _orderId: string): Promise<void> {}

// Run it:
pipeline.checkout({
    id: "ORD-1001",
    items: [{ sku: "SKU-1", qty: 2 }],
    total: 49.98,
    customerEmail: "customer@example.com",
}).then(() => console.log("Checkout complete."));
```

---

# **6. When You Should Use AsyncEventEmitterRR**

### ✔️ When you need async listeners  
### ✔️ When you need typed events  
### ✔️ When you need parallel or sequential execution  
### ✔️ When you want error aggregation  
### ✔️ When building frameworks, engines, or reactive systems  

---

# **7. When You Should Not Use It**

### ❌ Extremely high‑frequency events (e.g., per‑pixel rendering)  
Async overhead may be too high.

### ❌ When you need synchronous guarantees  
Use a synchronous emitter instead.

---

# **8. Extension Ideas**

- **Once listeners**
- **Listener priorities**
- **Middleware pipeline**
- **Event cancellation tokens**
- **Profiling hooks**
- **Event bubbling (hierarchical emitters)**

---

# **9. Summary**

`AsyncEventEmitterRR` is not just a helper for `ObservableRR`.  
It is a **robust, typed, async‑safe event system** suitable for:

- apps  
- frameworks  
- engines  
- plugins  
- UI systems  
- reactive architectures  

It is one of the strongest foundational pieces in your codebase.

---