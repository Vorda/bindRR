import { ObservableRR, ProxyManager, computed } from "../../src/ObservableRR";
import { DataBinderRR } from "../../src/DataBinderRR";

console.log("HERE I AM!!!");

const state = { count: 0, nested: { name: "x" } };
const obs = new ObservableRR(state);
const s = obs.Proxy;

const sub = obs.subscribe((path, newV, oldV) => {
  console.log("changed:", path.join("."), oldV, "→", newV);
});

// mutate
s.count = 1;            // logs: changed: count 0 → 1
s.nested.name = "y";    // logs: changed: nested.name x → y

// unsubscribe
sub.unsubscribe();

class CounterViewModel {
  count: number = 0;

  // computed property with correct typing
  doubled = computed(() => this.count * 2, { cache: true });

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  reset() {
    this.count = 0;
  }
}

const binder = new DataBinderRR(new ProxyManager());

binder.RegisterViewModel("counter", CounterViewModel);
binder.Bind();
