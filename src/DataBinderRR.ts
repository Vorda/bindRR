import { BindingSourceRR } from "./BindingSourceRR";
import { FactoryRR, InjectionTokenRR, ConstructorRR, ParameterInstructionRR } from "./FactoryRR";
import { ProxyManager, ObservableRR } from "./ObservableRR";

// TODO: Should refactor this to a base class & part of the framework
// by removing dependencies specific for our demo - for now it's just
// a testing implementation for my DI system.
// 9.7.2026 - cleaning up a bit like it says up here i should...
export class DataBinderRR {
    private objectFactory: FactoryRR = new FactoryRR();
    private contextSet: Map<string, BindingSourceRR> = new Map();
    private contextElements: Map<string, Element> = new Map();
    private tokenCache = new Map<string, InjectionTokenRR<any>>();

    constructor(proxyManager: ProxyManager) {
        this.objectFactory.register(ProxyManager, { isSingleton: true });
        this.objectFactory.registerSingleton(ProxyManager, proxyManager);
    }

    GetDataContext(key: string) { return this.contextSet.get(key); }
    GetViewModel(key: string) { return this.contextSet.get(key)?.Observable.Proxy; }

 
     // Scan DOM for [data-context] regions, create view models via DI,
     // wrap them in ObservableRR, and bind them using BindingSourceRR.
    Bind(root?: Element) {
        
        root = root ?? document.documentElement;
        const elements = root.querySelectorAll("[data-context]");

        elements.forEach((e) => {
            const key = e.getAttribute("data-context");
            if (!key)
                return;

            const token = this.tokenCache.get(key);
            if (!token)
                return;
            
            const proxy = this.objectFactory.create(token);

            // Duck-typed lifecycle hooks neither requires extending any
            // base class. A view model opts in simply by defining the method.
            //
            // SetObservable runs first: it's the earliest point a view model
            // can get a reference to its own ObservableRR (which doesn't
            // exist yet when the view model's own constructor runs � the
            // ObservableRR wraps *around* the already-constructed instance).
            // This is what lets a view model build its own EventStoreRR, for
            // example, entirely inside SetObservable.
            if (typeof (proxy.Proxy as any).SetObservable === "function")
                (proxy.Proxy as any).SetObservable(proxy);

            

            // TODO: we either need to allow ordering of Initialize calls
            // or add something like a Start method to BaseUserViewModel
            // Sometimes we need guaranteed execution order (for.ex.some view
            // models wanna show dialogs in Initialize - so the dialogs already need to
            // have the mediator listening, etc...)
            if (typeof (proxy.Proxy as any).Initialize === "function")
                (proxy.Proxy as any).Initialize();

            const dataSource = new BindingSourceRR(proxy);
            this.contextSet.set(key, dataSource);
            dataSource.scanBindings(e);
            dataSource.applyBindings();
            this.contextElements.set(key, e);
        });
    }

    /**
     * Registers a view model constructor against a data-context key.
     *
     * `parameterInstructions`, if given, describes the view model's own
     * constructor parameters exactly the same shape FactoryRR.register
     * already accepts elsewhere, just exposed here so a specific view model
     * can declare "I need X and Y injected" without DataBinderRR needing a
     * special case for what X and Y are (previously this was hardcoded to
     * a single app-specific mediator type; now it's genuinely open-ended).
     */
    RegisterViewModel<T>(key: string, ctor: ConstructorRR<T>, parameterInstructions?: ParameterInstructionRR[]) {

        if (this.contextSet.has(key))
            throw new Error(`binder already has view model registered for key ${key})`);

        if (parameterInstructions && parameterInstructions.length > 0) {
            this.objectFactory.register(ctor, { parameterInstructions });
        }

        const injectToken = this.objectFactory.registerGeneric(ObservableRR, ctor, {
            parameterInstructions: [
                { type: "inject", token: ctor },
                { type: "inject", token: ProxyManager }
            ]
        });

        this.tokenCache.set(key, injectToken);
    }

    /**
     * Registers an app-specific singleton: an event aggregator, an API
     * client, a logger, anything... so it can be injected into any view
     * model's constructor via RegisterViewModel's parameterInstructions.
     * DataBinderRR doesn't inspect or care what `instance` actually is.
     * 
     * Example, wiring your own event aggregator (built on the library's
     * generic AsyncEventEmitterRR, defined entirely in your own app):
     * 
     * const mediator = new UserEventAggregator();
     * binder.RegisterSingleton(UserEventAggregator, mediator);
     * binder.RegisterViewModel("login", LoginViewModel, [
     *   { type: "inject", token: UserEventAggregator }
     * ]);
     */
    RegisterSingleton<T>(ctor: ConstructorRR<T, any[]>, instance: T): void {
        this.objectFactory.register(ctor, { isSingleton: true });
        this.objectFactory.registerSingleton(ctor, instance);
    }

}