import { AsyncEventEmitterRR } from "./EventEmitterRR";
import { SubscriptionFilterRR, RootKeyFilterRR, AlwaysFilterRR } from "./Subscriptions/SubscriptionFilterRR";
import { SubscriptionRR, SubscriptionSnapshot, SubscribeOptionsRR, ObserverRR } from "./Subscriptions/SubscriptionRR";
import { SubscriptionRegistryRR, SubscriptionGraphRR } from "./Subscriptions/SubscriptionRegistryRR";
import { CompositeSubscriptionRR } from "./Subscriptions/CompositeSubscriptionRR";
import { isSubscriptionDebuggingEnabled } from "./Subscriptions/SubscriptionDebugFlag";
export { isPrefix } from "./PathUtils"; // re-exported for backward compatibility with existing imports

export class ComputedRR<T = any> {
    constructor(
        public readonly fn: (this: any) => T,
        public readonly cache: boolean = false,
        public readonly deps: PropertyKey[] = []
    ) {}
}

export function computed<T>(fn: (this: any) => T, options?: { cache?: boolean; deps?: PropertyKey[] }): ComputedRR<T> {
    return new ComputedRR(fn, options?.cache ?? false, options?.deps ?? []);
}

interface ComputedStateRR {
    value: any;
    dirty: boolean;
    subs: { unsubscribe: () => void }[];
}

// Fully dynamic ignoring of properties from being trapped. By separating concerns like this
// we can change behaviour at runtime on any level we want - it's used on every property access. 
// Used for stopping observable from creating proxies for complex objects
export class ProxyManager {
    private ignoreKeys = new Set<PropertyKey>();

    add(key: PropertyKey) {
        this.ignoreKeys.add(key);
    }
    remove(key: PropertyKey) {
        this.ignoreKeys.delete(key);
    }

    // We can expand this logic by using full property path or something...
    shouldIgnore(key: PropertyKey, fullPath?: PropertyKey[]): boolean {
        return this.ignoreKeys.has(key);
    }
}

interface ObservableRREvents {
    beforeResetTarget: [];
    afterResetTarget: [];
}

export class ObservableRR<T> extends AsyncEventEmitterRR<ObservableRREvents> {
    private original: T;
    public get Original(): T { return this.original; }

    private proxy: T;
    public get Proxy(): T { return this.proxy; }

    private ignoreList: ProxyManager;

    private computedStates = new Map<ComputedRR, ComputedStateRR>();

    // Fallback naming when no explicit label is given — matches the
    // "menuAdmin:computed:3:filteredItems" format from a plain
    // "Observable#4:computed:3:filteredItems" instead, still unique
    // and still readable, just less meaningful than a caller-supplied name.
    private static instanceCounter = 0;

    public readonly label: string;
    private readonly subscriptionRegistry: SubscriptionRegistryRR;


    constructor(target: T, ignoreList?: ProxyManager, label?: string) {
        super();

        this.label = label ?? `Observable#${ObservableRR.instanceCounter++}`;
        this.subscriptionRegistry = new SubscriptionRegistryRR(this.label);

        this.ignoreList = ignoreList || new ProxyManager();
        this.original = target;
        this.proxy = this.createProxy(target);

        // we don't need this anymore since switching computeds to lazy eval,
        // but keeping it for a while for easier debugging - this way we run them 
        // all at start and centralize computed debugging. 
        this.initComputedProperties();
    }

    public async BeforeTargetChange(callback: () => void): Promise<void> {
        this.on("beforeResetTarget", callback);
    }

    public async AfterTargetChange(callback: () => void): Promise<void> {
        this.on("afterResetTarget", callback);
    }

    private initComputedProperties(): void {
        const original = this.Original as any;
        const proxy = this.Proxy as any;
        for (const key of Object.keys(original)) {
            if (original[key] instanceof ComputedRR) 
                try { proxy[key]; } catch (e) { console.error("Error initializing computed:", key, e); }
        }
    }

    // Returns nothing unless enableSubscriptionDebugging() has been called —
    // see SubscriptionDebugFlag.ts. Empty array is the "off" state, not an error.
    public getActiveSubscriptions(): SubscriptionSnapshot[] {
        if (!isSubscriptionDebuggingEnabled())
            return [];
        return this.subscriptionRegistry.getSnapshot();
    }

    public getSubscriptionGraph(): SubscriptionGraphRR {
        if (!isSubscriptionDebuggingEnabled())
            return { observableLabel: this.label, nodes: [] };
        return this.subscriptionRegistry.getGraph();
    }

    /**
     * Subscribes an observer that will be notified on any change.
     * You may optionally provide an errorHandler that will be invoked if the observer throws.
     * Returns an object with an unsubscribe method.
     *
     * @param observer A function to be called on changes.
     * @param filter   An optional filter function that receives a changed path
     *                 and returns true if the observer should be notified
     * @param errorHandler An optional function to handle errors thrown in the observer.
     * @returns An object with an unsubscribe method.
     */
    public subscribe(observer: ObserverRR, options?: SubscribeOptionsRR): SubscriptionRR {
        return this.subscriptionRegistry.create(
            options?.kind ?? "user",
            options?.filter ?? new AlwaysFilterRR(),
            observer,
            options?.errorHandler,
            options?.label
        );
    }

    public unsubscribeAll(): void {
        this.subscriptionRegistry.clear(); // disposes each subscription properly (sets disposedAt), not just a bulk map wipe
    }

    /**
     * Composes multiple subscriptions into a single subscription.
     * When the returned unsubscribe method is called, it will unsubscribe all provided subscriptions.
     *
     * @param subscriptions An array of subscription objects (the ones returned by subscribe).
     * @returns A composed subscription with an unsubscribe method.
     */
    public static composeSubscriptions(
        subscriptions: { unsubscribe: () => void }[],
        label?: string
    ): CompositeSubscriptionRR {
        return new CompositeSubscriptionRR(subscriptions, label);
    }

    /**
     * Notifies observers with the provided change details.
     * @param path The full path to the property that changed.
     * @param newValue The new value.
     * @param oldValue The old value.
     */
    private notify(path: PropertyKey[], newValue: any, oldValue: any, force = false): void {
        if (!force && newValue === oldValue) return;

        // getActive() already returns a fresh array, so this is
        // still a safe snapshot even if a subscriber unsubscribes mid-loop.
        for (const subscription of this.subscriptionRegistry.getActive())
            subscription.invoke(path, newValue, oldValue);
    }

    // --- Dependency Tracking ---
    // This method is called when a computed function has been set using computed()
    // with an options object. Starting point for easy computed function extensions.
    private evaluateComputed(computed: ComputedRR, receiver: any, path: PropertyKey[]): any {
        let state = this.computedStates.get(computed);
        if (!state) {
            state = { value: undefined, dirty: true, subs: [] };
            this.computedStates.set(computed, state);
            this.trackDependencies(computed, path, state);
        }

        if (computed.cache && !state.dirty)
            return state.value;

        let result: any;
        try { 
            result = computed.fn.call(receiver); // Evaluate the computed function.  
        }
        catch (e) {
            console.error(`Error while calling ${path.join(".")} -> ${e}`);
        }

        state.value = result;
        state.dirty = false;
        return result;
    }

    private trackDependencies(computed: ComputedRR, path: PropertyKey[], state: ComputedStateRR): void {
        computed.deps.forEach((key) => {
            state.subs.push(this.subscribe(
                () => {
                    if (state.dirty) return; // already pending — avoid duplicate notifies
                    const oldValue = state.value;
                    state.dirty = true;
                    this.notify(path, undefined, oldValue, true);
                },
                {
                    filter: new RootKeyFilterRR(key),
                    kind: "computed",
                    label: computed.fn.name || path.join("."),
                }
            ));
        });
    }
     
    // public method to reset or dispose the current target and its proxies.
    public async resetTarget(newTarget: any): Promise<void> {
        this.computedStates.clear();
        this.unsubscribeAll();

        await this.emitParallel("beforeResetTarget");

        this.original = newTarget;
        if (newTarget) {
            this.proxy = this.createProxy(newTarget);
        } else {
            this.proxy = null as any;
        }

        await this.emitParallel("afterResetTarget");
    }

    /**
     * Creates a proxy with a custom handler that intercepts get and set operations,
     * recursively wrapping nested objects.
     * @param target The object to wrap.
     * @param currentPath The keys that lead to this object in the overall structure.
     * @returns A proxied version of the target.
     */
    private createProxy(target: any, currentPath: PropertyKey[] = []): any {
        if (target && typeof target === 'object' && target.__isProxy) 
            return target;

        const handler: ProxyHandler<any> = {
            get: (obj, prop, receiver) => {
                if (this.ignoreList.shouldIgnore(prop, currentPath))
                    return Reflect.get(obj, prop, receiver);

                const fullPath = [...currentPath, prop];
                let value = Reflect.get(obj, prop, receiver);

                if (value instanceof ComputedRR) {
                    value = this.evaluateComputed(value, receiver, fullPath);
                } else if (value && typeof value === 'object' && !value.__isProxy) {
                    // Automatically wrap nested objects or arrays in a proxy.
                    const proxiedValue = this.createProxy(value, [...currentPath, prop]);
                    // Cache the proxied value on the object.
                    Reflect.set(obj, prop, proxiedValue, receiver);
                    return proxiedValue;
                }

                return value;
            },
            set: (obj, prop, newVal, receiver) => {
                if (this.ignoreList.shouldIgnore(prop, currentPath))
                    return Reflect.set(obj, prop, newVal, receiver);

                const fullPath = [...currentPath, prop];
                const oldVal = Reflect.get(obj, prop, receiver);
                let valueToSet = newVal;
                // If the new value is an object, wrap it so changes deep inside are observed.
                if (newVal && typeof newVal === 'object' && !newVal.__isProxy) 
                    valueToSet = this.createProxy(newVal, fullPath);
                const result = Reflect.set(obj, prop, valueToSet, receiver);
                if (oldVal !== newVal) 
                    this.notify(fullPath, newVal, oldVal);
                return result;
            },
            deleteProperty: (obj, prop) => {
                if (this.ignoreList.shouldIgnore(prop, currentPath))
                    return Reflect.deleteProperty(obj, prop);

                const fullPath = [...currentPath, prop];
                const oldVal = Reflect.get(obj, prop);
                const result = Reflect.deleteProperty(obj, prop);
                if (result)
                    this.notify(fullPath, undefined, oldVal);
                return result;
            }
        };

        // Create the proxy and then mark it so it won't be wrapped again.
        const proxy = new Proxy(target, handler);
        Object.defineProperty(proxy, '__isProxy', {
            value: true,
            enumerable: false,
            configurable: false,
        });
        return proxy;
    }
}






