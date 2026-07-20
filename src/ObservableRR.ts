import { AsyncEventEmitterRR } from "./EventEmitterRR";

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

export function isPrefix(prefix: PropertyKey[], full: PropertyKey[]): boolean {
    if (prefix.length > full.length)
        return false;

    for (let i = 0; i < prefix.length; i++) 
        if (prefix[i] !== full[i])
            return false;

    return true;
}

// The observer receives the full path to the changed property (as an array of keys),
// the new value, and the old value.
type ObserverRR = (
    path: PropertyKey[],
    newValue: any,
    oldValue: any
) => void;

// Define a subscription interface to associate each observer with an optional error handler.
interface SubscriptionRR {
    observer: ObserverRR;
    // Optional filter: returns true if the subscriber cares about this change.
    filter?: (changedPath: PropertyKey[]) => boolean;
    errorHandler?: (error: Error, path: PropertyKey[], newValue: any, oldValue: any) => void;
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

    private observerMap: Map<number, SubscriptionRR> = new Map();
    private nextObserverId: number = 0;

    private computedStates = new Map<ComputedRR, ComputedStateRR>();

    constructor(target: T, ignoreList?: ProxyManager) {
        super();

        this.ignoreList = ignoreList || new ProxyManager();
        this.original = target;
        this.proxy = this.createProxy(target);

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
    public subscribe(
        observer: ObserverRR,
        filter?: (changedPath: PropertyKey[]) => boolean,
        errorHandler?: (error: Error, path: PropertyKey[], newValue: any, oldValue: any) => void
    ): { unsubscribe: () => void } {
        const id = this.nextObserverId++;
        this.observerMap.set(id, { observer, filter, errorHandler } );

        // Return an unsubscribe function that is idempotent.
        return {
            unsubscribe: () => {
                this.observerMap.delete(id);
            }
        };
    }

    public unsubscribeAll(): void {
        this.observerMap.clear();
    }

    /**
     * Composes multiple subscriptions into a single subscription.
     * When the returned unsubscribe method is called, it will unsubscribe all provided subscriptions.
     *
     * @param subscriptions An array of subscription objects (the ones returned by subscribe).
     * @returns A composed subscription with an unsubscribe method.
     */
    public static composeSubscriptions(subscriptions: { unsubscribe: () => void }[]): { unsubscribe: () => void } {
        return {
            unsubscribe: () => {
                subscriptions.forEach((sub) => sub.unsubscribe());
            }
        };
    }

    /**
     * Notifies observers with the provided change details.
     * @param path The full path to the property that changed.
     * @param newValue The new value.
     * @param oldValue The old value.
     */
    private notify(path: PropertyKey[], newValue: any, oldValue: any, force = false): void {
        if (!force && newValue === oldValue) return;

        // Create a snapshot of subscriptions to avoid issues if some unsubscribe during notification.
        const subscriptions = Array.from(this.observerMap.values());

        for (const subscription of subscriptions) {
            if (subscription.filter && !subscription.filter(path))
                continue;

            try {
                subscription.observer(path, newValue, oldValue);
            } catch (error) {
                if (subscription.errorHandler) {
                    try {
                        subscription.errorHandler(error as Error, path, newValue, oldValue);
                    } catch (ehError) {
                        console.error("Error handler threw an error:", ehError);
                    }
                } else {
                    console.error("Observer error:", error);
                }
            }
        }
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
                // broad: root key only, no isPrefix needed.
                // TODO: revisit if we need nested path precision (user.address.city and user.role for ex. now both just invalidate
                // anything depending on user - we over-invalidate - harmless, just an extra recompute)
                (changedPath) => changedPath[0] === key, 
                undefined
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






