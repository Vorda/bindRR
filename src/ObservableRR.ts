import { AsyncEventEmitterRR } from "./EventEmitterRR";

// Define a unique symbol for computed properties.
const COMPUTED_FLAG = Symbol("computed");

// Define a unique symbol to mark computed configuration objects.
const COMPUTED_CONFIG = Symbol("computed_config")

// Starting point for easily extending computed properties.
// For now we implement just a simple cache system
interface ComputedOptions {
    cache?: boolean
}

// A computed context has a set of dependency paths (stored as a dot-joined string).
// Used in our prototype of advanced dependancy tracking for computed properties
interface ComputedContext {
    dependencies: Set<string>;
}

// The stack that holds the active computed contexts.
const computedContextStack: ComputedContext[] = [];

// Helper functions to push/pop contexts.
function pushComputedContext(): void {
    computedContextStack.push({ dependencies: new Set<string>() }); 
}

function popComputedContext(): ComputedContext {
    return computedContextStack.pop()!;
}

// The helper function for marking a function as computed. If an options object is provided
// (currently supporting { cache: boolean }), attach it via COMPUTED_CONFIG.
export function computed<T extends Function>(fn: T, options?: ComputedOptions): T {
    // Always mark the function as computed.
    (fn as any)[COMPUTED_FLAG] = true;

    // If any options were provided then attach them.
    if (options && Object.keys(options).length > 0) {
        (fn as any)[COMPUTED_CONFIG] = options;
    }
    return fn;
}

export function isPrefix(prefix: PropertyKey[], full: PropertyKey[]): boolean {
    if (prefix.length > full.length)
        return false;

    for (let i = 0; i < prefix.length; i++) 
        if (prefix[i] !== full[i])
            return false;

    return true;
}

export interface DebugInfo {
    subscriber?: any; // e.g. reference to the subscribing element or object
    reason?: string;  // a custom message indicating why the subscription was created
    timestamp: number;
    stack: string;
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
    debugInfo?: DebugInfo;
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

    // Set this flag to true during development to enable detailed logging.
    public static DEBUG_SUBSCRIPTIONS: boolean = false;

    constructor(target: T, ignoreList?: ProxyManager) {
        super();

        this.ignoreList = ignoreList || new ProxyManager();
        this.original = target;
        this.proxy = this.createProxy(target);
    }

    public async BeforeTargetChange(callback: () => void): Promise<void> {
        this.on("beforeResetTarget", callback);
    }

    public async AfterTargetChange(callback: () => void): Promise<void> {
        this.on("afterResetTarget", callback);
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
        errorHandler?: (error: Error, path: PropertyKey[], newValue: any, oldValue: any) => void,
        debugInfo?: { subscriber?: any; reason?: string }
    ): { unsubscribe: () => void } {
        const id = this.nextObserverId++;
        const info: DebugInfo = Object.assign(
            {
                timestamp: Date.now(),
                stack: new Error().stack || "no stack trace"
            },
            debugInfo
        );
        this.observerMap.set(id, { observer, filter, errorHandler, debugInfo: info });

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
    private notify(path: PropertyKey[], newValue: any, oldValue: any): void {
        if (newValue === oldValue) return; // No notification if no change

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
    private evaluateComputed(fn: Function, receiver: any, computedPath: PropertyKey[]): any {
        const fnObj = fn as any;
        const options = fnObj[COMPUTED_CONFIG];

        pushComputedContext(); // Begin dependency tracking.
        const result = fn.call(receiver); // Evaluate the computed function.
        const computedContext = popComputedContext(); // Get the recorded dependencies.

        //console.log("Computed dependencies:", Array.from(computedContext.dependencies));

        // If caching is enabled, set up subscriptions to invalidate cache when any dependency changes.
        if (options.cache) {
            if (!fnObj.__computedSubscriptions) {
                fnObj.__computedSubscriptions = [];
                computedContext.dependencies.forEach((dep: string) => {
                    // Subscribe to dependency changes.
                    const subscription = this.subscribe(
                        () => {
                            // Invalidate cached value when any dependency changes.
                            delete fnObj.__cachedValue;
                            this.notify(computedPath, fn.call(receiver), undefined);
                        },
                        (changedPath) => {
                            const depParts = dep.split(".");
                            // A simple test for now: if the changed path is a prefix of the dependency path.
                            return isPrefix(changedPath, depParts);
                        }, undefined,
                        ObservableRR.DEBUG_SUBSCRIPTIONS ? { subscriber: "Computed", reason: "Computed dep. update!" } : undefined
                    );
                    fnObj.__computedSubscriptions.push(subscription);
                });
            }

            if (fnObj.__cachedValue !== undefined) {
                return fnObj.__cachedValue;
            } else {
                fnObj.__cachedValue = result;
                return result;
            }
        }

        return result;
    }

    // helper method that recursively traverses an object
    // and cleans up computed subscriptions and cached values.
    private cleanupComputedSubscriptions(obj: any, visited = new WeakSet<any>()): void {
        if (obj && typeof obj === 'object' && !visited.has(obj)) {
            visited.add(obj);
            // Iterate all own properties (you might also want to include symbols, etc.)
            for (const key of Object.keys(obj)) {
                const value = obj[key];
                if (typeof value === 'function') {
                    // If this function has computed subscriptions, unsubscribe them.
                    if (Array.isArray(value.__computedSubscriptions)) {
                        value.__computedSubscriptions.forEach((sub: { unsubscribe: () => void }) => {
                            sub.unsubscribe();
                        });
                        delete value.__computedSubscriptions;
                        delete value.__cachedValue;
                    }
                } else if (value && typeof value === 'object') {
                    // Recursively clean computed subscriptions in nested objects.
                    this.cleanupComputedSubscriptions(value, visited);
                }
            }
        }
    }

    // public method to reset or dispose the current target and its proxies.
    public async resetTarget(newTarget: any): Promise<void> {
        this.cleanupComputedSubscriptions(this.original);
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

                // --- Dependency Tracking --- 
                // If a computed function is being evaluated, record this property access.
                if (computedContextStack.length > 0) {
                    const currentContext = computedContextStack[computedContextStack.length - 1];
                    currentContext.dependencies.add(fullPath.join("."));
                }

                let value = Reflect.get(obj, prop, receiver);

                // --- Computed Function Handling ---
                // Check if the value is a function and is marked as computed.
                if (typeof value === "function" && (value as any)[COMPUTED_FLAG] === true) {
                    // If the function has options configured
                    if ((value as any)[COMPUTED_CONFIG]) {
                        // Delegate to evaluateComputed to handle options and dependency tracking.
                        value = this.evaluateComputed(value, receiver, fullPath);
                    } else {
                        // Otherwise just call the function normally.
                        value = value.call(receiver);
                    }
                }

                // Automatically wrap nested objects or arrays in a proxy.
                if (value && typeof value === 'object' && !value.__isProxy) {
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
                if (result) {
                    // Indicate deletion by representing the new value as undefined for now.
                    this.notify(fullPath, undefined, oldVal);
                }
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

    private formatSubscriptionDebugInfo(id: number, sub: SubscriptionRR): string {
        const info = sub.debugInfo;
        if (!info) {
            return `Subscription ${id}: No debug info available.`;
        }

        const timeStr = new Date(info.timestamp).toISOString();
        const stackLine = info.stack.split("\n")[1]?.trim() || "no stack details";

        return `Subscription ${id}:
  - Subscriber: ${info.subscriber ? JSON.stringify(info.subscriber) : "N/A"}
  - Reason: ${info.reason ? info.reason : "No reason provided"}
  - Timestamp: ${timeStr}
  - Stack: ${stackLine}`;
    }

    public listSubscriptionsDetailed(): void {
        if (!ObservableRR.DEBUG_SUBSCRIPTIONS) {
            console.log("Detailed subscription logging is disabled.");
            return;
        }

        console.log("Current Subscriptions (Detailed):");
        this.observerMap.forEach((sub, id) => {
            console.log(this.formatSubscriptionDebugInfo(id, sub));
        });
    }

    public listSubscriptions(): void {
        if (!ObservableRR.DEBUG_SUBSCRIPTIONS) {
            console.log("Detailed subscription logging is disabled.");
            return;
        }

        console.log("Current Subscriptions:");
        this.observerMap.forEach((sub, id) => {
            console.log(`Subscription ${id}:`, sub.debugInfo);
        });
    }
}






