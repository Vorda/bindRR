export type ConstructorRR<T, Args extends any[] = any[]> = new (...args: Args) => T;

// Each parameter instruction tells us whether to resolve a dependency or consume an external argument.
export type ParameterInstructionRR =
    | { type: "inject"; token: ConstructorRR<any, any[]> }
    | { type: "external"; defaultValue?: any };


export class InjectionTokenRR<T> {
    constructor(public readonly description: string) { }
}


// registration type supports a key that’s either a Constructor or an InjectionToken.
type Key<T> = InjectionTokenRR<T> | ConstructorRR<T, any[]>;

// The registration interface. Note that if a blueprint is provided then it fully describes the constructor’s parameters.
interface RegistrationRR<T> {
    // We might not always have a constructor when using an injection token.
    // But if you’re using this for a generic class, you know its constructor.
    ctor: ConstructorRR<T, any[]>;
    isSingleton: boolean;
    // If provided, this blueprint fully describes how to construct the instance.
    parameterInstructions?: ParameterInstructionRR[];
    // Fallback options (for full injection) if no blueprint is provided.
    dependencyTokens?: ConstructorRR<any, any[]>[];
    injectionOrder?: "dependencies-first" | "dependencies-last";
}

// A prototype of dependency injection system for typescript / javascript.
// Still very crude, but a great starting point for a full on DI system
// I wanted to just automate creation of ObservableRR and view models
// for my data binding system, but it kinda started growing into a proper DI system :)
export class FactoryRR {
    // Registry keyed by class token.
    private registry = new Map<Key<any>, RegistrationRR<any>>();

    // Map that saves injection tokens by a string key. 
    private genericTokenCache = new Map<string, InjectionTokenRR<any>>();

    // Dependency container (for caching singletons and externally provided instances).
    private dependencyContainer = new Map<ConstructorRR<any, any[]>, any>();

    private generateGenericToken<T, K>(
        ctor: ConstructorRR<T>,
        ctorSpecialization: ConstructorRR<K>
    ): InjectionTokenRR<T> {
        return new InjectionTokenRR<T>(`${ctor.name}<${ctorSpecialization.name}>`);
    }

    /**
   * Automatically register a generic class by generating an injection token from the
   * class constructor and a specialization string. The token is stored for later retrieval.
   *
   * @param ctor - The generic class constructor.
   * @param specialization - Constructor of T
   * @param options - Registration options such as blueprint instructions or singleton flag.
   * @returns The generated injection token.
   */
    public registerGeneric<T, K>(
        ctor: ConstructorRR<T>,
        specialization: ConstructorRR<K>,
        options?: {
            parameterInstructions?: ParameterInstructionRR[];
            dependencyTokens?: ConstructorRR<any, any[]>[];
            injectionOrder?: "dependencies-first" | "dependencies-last";
            isSingleton?: boolean;
        }
    ): InjectionTokenRR<T> {
        // Generate the token automatically.
        const token: InjectionTokenRR<T> = this.generateGenericToken(ctor, specialization);
        // Save the token into our token cache.
        this.genericTokenCache.set(token.description, token);

        // Create registration record.
        const registration: RegistrationRR<T> = {
            ctor: ctor,
            isSingleton: options?.isSingleton ?? false,
            parameterInstructions: options?.parameterInstructions,
            dependencyTokens: options?.dependencyTokens,
            injectionOrder: options?.injectionOrder,
        };
        // Use the generated token as the key in our registry.
        this.registry.set(token, registration);

        return token;
    }

    /**
     * Retrieve a stored injection token by its string key (description).
    */
    public getToken<T>(key: string): InjectionTokenRR<T> | undefined {
        return this.genericTokenCache.get(key);
    }

    /**
     * Register a class along with its dependency tokens.
     * @param token The class constructor.
     * @param dependencyTokens An array of class constructors that this class depends on.
     * @param isSingleton Whether the class should be a singleton (if so, the instance may be provided externally).
     * @param injectionOrder does we inject dependencies before or after external arguments
     * @param parameterInstructions a blueprint for partial injection
     */
    register<T>(
        ctor: ConstructorRR<T>,
        options?: {
            dependencyTokens?: ConstructorRR<any, any[]>[];
            injectionOrder?: "dependencies-first" | "dependencies-last";
            parameterInstructions?: ParameterInstructionRR[];
            isSingleton?: boolean;
        }
    ): void {
        const registration: RegistrationRR<T> = {
            ctor: ctor,
            isSingleton: options?.isSingleton ?? false,
            dependencyTokens: options?.dependencyTokens,
            injectionOrder: options?.injectionOrder,
            parameterInstructions: options?.parameterInstructions,
        };
        this.registry.set(ctor, registration);
    }

    /**
     * Register an existing instance as the singleton for a given class token.
     * @param token The class constructor used as the dependency token.
     * @param instance The instance to register.
     */
    registerSingleton<T>(token: ConstructorRR<T, any[]>, instance: T): void {
        this.dependencyContainer.set(token, instance);
    }

    /**
     * Helper method to resolve a dependency.
     */
    private resolveDependency<T>(token: ConstructorRR<T, any[]>): T {
        if (this.dependencyContainer.has(token)) {
            return this.dependencyContainer.get(token);
        } else if (this.registry.has(token)) {
            return this.create(token);
        } else {
            try {
                return new token();
            } catch (e) {
                throw new Error(`No dependency registered for token ${token.name} and unable to auto-instantiate.`);
            }
        }
    }

    /**
     * Create an instance of the requested class.
     * The factory resolves dependencies by first checking the dependency container;
     * if they’re not explicitly registered but are available in the registry,
     * the factory auto-instantiates them.
     * If a parameter blueprint is provided, it builds the constructor arguments accordingly.
     * Otherwise, it falls back to grouping dependencies.
     * Extra arguments (if any) are appended to the constructor call.
     * @param token The class constructor token to instantiate.
     * @param externalArgs Extra arguments for the constructor (after injected dependencies).
     */
    create<T>(token: Key<T>, ...externalArgs: any[]): T {
        const registration = this.registry.get(token);
        if (!registration) {
            if (typeof token === "function") {
                return new token(...externalArgs);
            }
            throw new Error("No registration found for the provided key.");
        }

        // If the class is registered as a singleton and an instance is already provided, return it.
        if (registration.isSingleton && this.dependencyContainer.has(registration.ctor)) {
            return this.dependencyContainer.get(registration.ctor);
        }

        // CASE 1: Partial injection blueprint has been provided.
        if (registration.parameterInstructions) {
            const blueprint = registration.parameterInstructions;
            const finalArgs: any[] = [];
            let externalIndex = 0;
            for (const instruction of blueprint) {
                if (instruction.type === "inject") {
                    finalArgs.push(this.resolveDependency(instruction.token));
                } else if (instruction.type === "external") {
                    if (externalIndex < externalArgs.length)
                        finalArgs.push(externalArgs[externalIndex]);
                    else if ("defaultValue" in instruction)
                        finalArgs.push(instruction.defaultValue);
                    else
                        finalArgs.push(undefined);
                }
                externalIndex++;
            }
            const instance = new registration.ctor(...finalArgs);
            if (registration.isSingleton) {
                this.dependencyContainer.set(registration.ctor, instance);
            }
            return instance;
        }
        // CASE 2: Fallback using dependencyTokens and injectionOrder.
        else if (registration.dependencyTokens) {
            const deps = registration.dependencyTokens.map(dep => this.resolveDependency(dep));
            let args: any[];
            if (registration.injectionOrder === "dependencies-first") {
                args = [...deps, ...externalArgs];
            } else { // default: dependencies-last
                args = [...externalArgs, ...deps];
            }
            const instance = new registration.ctor(...args);
            if (registration.isSingleton) {
                this.dependencyContainer.set(registration.ctor, instance);
            }
            return instance;
        } else {
            return new registration.ctor(...externalArgs);
        }
    }
}