type AsyncEventListener<T extends any[]> = (...args: T) => Promise<void> | void;

// A proper full on async event emitter / listener
export abstract class AsyncEventEmitterRR<EventMap extends { [K in keyof EventMap]: any[] }> {
    // A map where each key is an event name (from T) and each value is an array
    // of listener functions that accept the tuple of arguments specified by T for that event.
    private listeners: { [K in keyof EventMap]?: AsyncEventListener<EventMap[K]>[] } = {};

    // Register a listener for an event type.
    protected on<K extends keyof EventMap>(eventType: K, listener: AsyncEventListener<EventMap[K]>): this {
        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }
        this.listeners[eventType]!.push(listener);
        return this;
    }

    // Remove a listener for an event type
    protected off<K extends keyof EventMap>(eventType: K, listener: AsyncEventListener<EventMap[K]>): this {
        if (!this.listeners[eventType]) return this;
        this.listeners[eventType] = this.listeners[eventType]!.filter(fn => fn !== listener);
        return this;
    }

    // Emit an event asynchronously. It collects the results of all listeners 
    // (whether synchronous or asynchronous)
    // and awaits their completion.
    protected async emit<K extends keyof EventMap>(eventType: K, ...args: EventMap[K]): Promise<void> {
        const eventListeners = this.listeners[eventType];
        if (eventListeners && eventListeners.length > 0) {
            // Wrap each call in Promise.resolve so that synchronous functions are treated as immediately resolved promises.
            await Promise.all(eventListeners.map(listener => Promise.resolve(listener(...args))));
        }
    }

    // Parallel emission strategy:
    //   - All listeners are invoked concurrently.
    //   - Each listener is wrapped in a try/catch (via async/await) so that errors are collected.
    //   - After processing all listeners, if one or more errors occurred, an AggregateError is thrown.
    protected async emitParallel<K extends keyof EventMap>(eventType: K, ...args: EventMap[K]): Promise<void> {
        const eventListeners = this.listeners[eventType];
        if (eventListeners && eventListeners.length > 0) {
            const results = await Promise.all(
                eventListeners.map(async (listener) => {
                    try {
                        await listener(...args);
                        return null; // Indicate success.
                    } catch (err) {
                        console.error(`Error in parallel listener for event "${String(eventType)}":`, err);
                        return err; // Return the error.
                    }
                })
            );
            const errors = results.filter((e) => e !== null);
            if (errors.length) {
                throw new AggregateError(errors, `One or more listeners for event "${String(eventType)}" failed (parallel).`);
            }
        }
    }

    // Sequential emission strategy:
    //   - Listeners are invoked one after the other.
    //   - Each listener is wrapped in a try/catch block; errors are logged and accumulated.
    //   - After all listeners have executed, if errors occurred, an AggregateError is thrown.
    protected async emitSequential<K extends keyof EventMap>(eventType: K, ...args: EventMap[K]): Promise<void> {
        const eventListeners = this.listeners[eventType];
        const errors: unknown[] = [];
        if (eventListeners && eventListeners.length > 0) {
            for (const listener of eventListeners) {
                try {
                    await listener(...args);
                } catch (err) {
                    console.error(`Error in sequential listener for event "${String(eventType)}":`, err);
                    errors.push(err);
                }
            }
            if (errors.length) {
                throw new AggregateError(errors, `One or more listeners for event "${String(eventType)}" failed (sequential).`);
            }
        }
    }
}
