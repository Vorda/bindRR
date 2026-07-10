# BindRR

A small, dependency-free reactive data-binding library for plain HTML — a modern take on Knockout's `data-bind` model, built on ES6 `Proxy` instead of explicit observables.

A simple minimalistic replacement for React / Angular / Knockout / ....

Write a TypeScript view model class. Mark your HTML with `data-context` and `data-bind`. No compiler step required to *use* it, no virtual DOM, no template language of its own.

```html
<div data-context="counter">
  <span data-bind="text: count"></span>
  <button data-bind="event.click: increment">+1</button>
</div>

<script>
  class CounterViewModel {
    count = 0;
    increment() { this.count++; }
  }

  const binder = new BindRR.DataBinderRR(new BindRR.ProxyManager(), new BindRR.UserEventAggregator());
  binder.RegisterViewModel("counter", CounterViewModel);
  binder.Bind();
</script>
```

That's it — `count` updates on screen the moment `increment()` mutates it. No `ko.observable()` wrapping, no manual subscriptions.

## Why

Most frontend data-binding today comes bundled inside a much bigger framework (Angular, full SPA routing, build toolchains, etc.) even when the actual need is small: take a server-rendered page and make a handful of elements reactive. BindRR is the opposite bet — a focused binding layer you drop into an existing page (Razor, PHP, static HTML, whatever) that owns its own reactivity instead of leaning on a library, and stays out of the way otherwise.

## Features

- **Proxy-based reactivity** — plain class fields become observable automatically. No `observable()` wrapper syntax to learn or forget.
- **Declarative DOM binding** via `data-bind` / `data-context` attributes — familiar territory if you've used Knockout.
- **Path-aware change notification** — only the bindings whose property path actually changed re-render, not the whole context.
- **Computed properties** with automatic dependency tracking (`computed()`), including optional caching.
- **`foreach` binding** for list rendering from a `<template>`.
- **Two-way binding** on form inputs (`value`), plus `attr`, `class`, `visible`, `if`, `event`, and simple `validate` bindings.
- **A tiny built-in DI container** (`FactoryRR`) for constructing view models with injected dependencies.
- **A pub/sub event aggregator** (`Mediator`) for cross-view-model communication without direct references.
- **Zero runtime dependencies.** Ships as ESM, CommonJS, and a single IIFE `<script>` file — use it with a bundler or without one.

## Installation

### With a bundler (Node / VS Code project)

```bash
npm install ../bindrr        # local file dependency, or your published package name
```

```ts
import { DataBinderRR, ProxyManager, UserEventAggregator } from "bindrr";
```

### Without a build step (Razor / static HTML)

Copy `dist/index.global.js` into your project (e.g. `wwwroot/lib/bindrr/`) and reference it directly:

```html
<script src="~/lib/bindrr/index.global.js"></script>
<script>
  const binder = new BindRR.DataBinderRR(new BindRR.ProxyManager(), new BindRR.UserEventAggregator());
</script>
```

Everything below is written from the TypeScript/module side; swap `import { X }` for `BindRR.X` if you're using the global build.

## Quick start

**1. Write a view model.** Plain class, plain fields, plain methods — no base class required unless you want lifecycle hooks (see below).

```ts
class LoginViewModel {
  username = "";
  password = "";
  errorMessage = "";

  submit() {
    if (!this.username) {
      this.errorMessage = "Username is required";
      return;
    }
    // ...
  }
}
```

**2. Register it against a key, and mark up your HTML.**

```html
<form data-context="login">
  <input data-bind="value: username" />
  <input type="password" data-bind="value: password" />
  <span data-bind="text: errorMessage; visible: errorMessage"></span>
  <button data-bind="event.click: submit">Log in</button>
</form>
```

```ts
const binder = new DataBinderRR(new ProxyManager(), new UserEventAggregator());
binder.RegisterViewModel("login", LoginViewModel);
binder.Bind(); // scans the whole document for [data-context]
```

`data-context="login"` tells BindRR "everything inside this element binds against the `login` view model." Everything inside it with `data-bind="..."` reads and writes properties on that instance.

## Architecture

BindRR is three small, mostly-independent pieces wired together by `DataBinderRR`:

```
DataBinderRR
 ├─ FactoryRR        constructs view models, resolves injected dependencies
 ├─ ObservableRR      wraps a view model instance in a reactive Proxy
 └─ BindingSourceRR   scans the DOM for data-bind, subscribes to ObservableRR, updates elements
```

### `ObservableRR` — the reactive core

Every view model instance gets wrapped in an ES6 `Proxy`. Reads and writes on that proxy are intercepted:

- **`get`** — if the accessed value is an object or array, it's recursively wrapped in its own proxy before being returned, so nested mutations (`vm.address.city = "..."`) are tracked too, not just top-level fields.
- **`set`** — the old and new values are compared; if they differ, every subscriber whose registered path matches (or is a prefix/suffix of) the changed path gets notified.
- **`computed()`** — wrapping a method with `computed()` marks it for dependency tracking. The first time it's evaluated, BindRR records every property it reads during that call, then subscribes to exactly those paths so the computed value is invalidated only when something it actually depends on changes.

```ts
import { computed } from "bindrr";

class CartViewModel {
  items: { price: number; qty: number }[] = [];

  total = computed(function (this: CartViewModel) {
    return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  }, { cache: true });
}
```

You can subscribe to an `ObservableRR` directly for advanced cases (logging, debugging, syncing to storage) without going through the DOM binder at all:

```ts
observable.subscribe((path, newValue, oldValue) => {
  console.log(`${path.join(".")} changed:`, oldValue, "->", newValue);
});
```

### `BindingSourceRR` — the DOM binder

Scans a root element for `[data-bind]`, parses each binding string, and for every bound element:

1. Sets the initial value/attribute/visibility from the current view model state.
2. Subscribes to `ObservableRR` for just the property paths that element cares about.
3. Attaches DOM event listeners for two-way bindings (`value`) and explicit event bindings (`event.click`, etc.).

### `FactoryRR` — dependency injection

A minimal constructor-injection container, used internally so view models can declare dependencies (like the shared `UserEventAggregator`) instead of reaching for globals. Similar in spirit to the built-in DI container in ASP.NET Core, just much smaller in scope.

### `Mediator` (`UserEventAggregator`) — cross-context messaging

A pub/sub event aggregator for talking between view models that don't otherwise know about each other — e.g. one view model announcing "user logged in" and another reacting to it without a direct reference.

## Binding syntax reference

Bindings live in the `data-bind` attribute as a semicolon-separated list of `type: path` pairs.

| Binding | Example | Behavior |
|---|---|---|
| `text` | `text: user.name` | Sets `element.textContent` |
| `html` | `html: user.bio` | Sets `element.innerHTML` |
| `value` | `value: username` | Two-way binds an `<input>`'s value |
| `attr.*` | `attr.placeholder: hint` | Sets an arbitrary attribute |
| `class.*` | `class.active: isSelected` | Toggles a class name based on truthiness |
| `visible` | `visible: isLoading` | Toggles `display: none` (preserves original display value) |
| `if` | `if: hasError` | Same as `visible`, evaluated first; skips other bindings on that element when false |
| `event.*` | `event.click: submit` | Attaches a DOM event listener calling a view model method |
| `foreach` | `foreach: items` | Repeats a `<template>` inside the element once per array item |
| `validate` | `validate: email` | Adds/removes an `is-invalid` class based on a validator |
| `validateTrigger` | `validateTrigger: formSubmitted` | Gates when a `validate` binding actually runs |

### `foreach` example

```html
<ul data-bind="foreach: items">
  <template>
    <li data-bind="text: name"></li>
  </template>
</ul>
```

Inside a `foreach`, each item's context additionally exposes `$index` (the item's position) and `global` (a reference back to the outer context), so you can reach outside the loop:

```html
<template>
  <li data-bind="text: name">
    <button data-bind="event.click: global.removeItem">x</button>
  </li>
</template>
```

## Lifecycle hooks

Extend `BaseUserViewModel` if a view model needs guaranteed setup logic once its dependencies are ready:

```ts
class DialogViewModel extends BaseUserViewModel {
  Initialize() {
    // runs once BindRR has constructed this instance and injected dependencies,
    // before bindings are applied
  }
}
```

## Known limitations / roadmap

BindRR is an early-stage, actively-evolving library, not a finished 1.0. Current known gaps:

- `foreach` re-render currently recreates child bindings on every list change without disposing the previous batch first — fine for small/infrequently-changing lists, worth revisiting before using it on large or frequently-updated ones.
- Computed caching invalidates eagerly (re-notifies as soon as a dependency changes) rather than lazily on next read.
- `validate` is intentionally minimal — no built-in validator library, just a hook point.
- No routing, no templating beyond `foreach`, and no plans to add either — BindRR intentionally stays scoped to reactivity + binding, not a full SPA framework.

## License

MIT