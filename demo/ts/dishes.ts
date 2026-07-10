import { ObservableRR, ProxyManager, computed } from "../../src/ObservableRR"
import { DataBinderRR } from "../../src/DataBinderRR";

 interface DishMenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
}

class MenuAdminViewModel {
    public nextId: number = 5;
    public showDialog: boolean = false;
    public dialogMode: "add" | "edit" = "add";
    public editingIndex: number = -1; // index into items while editing
    public editingItem: DishMenuItem = { id:"-1", name: "", price: 0, description: "" }; // draft, not the live item
    
    public saveError: string = "";
    
    // Both computed here are read directly from data-bind, so both need { cache: true } —
    // see the note from the form demo: only the cached path in ObservableRR wires up
    // notify() so the DOM actually re-reads the value after a dependency changes.
    public dialogTitle = computed(() => this.dialogMode == "edit" ? "Edit dish" : "Add dish", { cache: true });
    
    public itemCount = computed(() => {
        const n = this.items.length;
        return n + (n === 1 ? " dish" : " dishes");
    }, {cache: true });

    constructor(
        public items: DishMenuItem[] = [
            { id: "1", name: "Margherita", price: 9.5, description: "Tomato, mozzarella, basil." },
            { id: "2", name: "Diavola", price: 11, description: "Spicy salami, chili, mozzarella." },
            { id: "3", name: "Quattro Formaggi", price: 12.5, description: "Four-cheese blend, oregano." },
            { id: "4", name: "Funghi", price: 10, description: "Mushrooms, garlic, parsley." }
        ]) { }

     
    // Top-level handlers
    public openAdd() {
        this.dialogMode = "add";
        this.editingIndex = -1;
        this.editingItem = { id:"-1", name: "", price: 0, description: "" };
        this.saveError = "";
        this.showDialog = true;
    }

     public save() {
        const name = this.editingItem.name.trim();
        const price = Number(this.editingItem.price);
        const description = this.editingItem.description.trim();

        if (!name) {
            this.saveError = "Name is required";
            return;
        }

        if (!isFinite(price) || price < 0) {
            this.saveError = "Enter a valid price";
            return;
        }

        if (this.dialogMode === "edit" && this.editingIndex > -1) {
            const item = this.items[this.editingIndex];
            item.name = this.editingItem.name;
            item.description = this.editingItem.description;
            item.price = this.editingItem.price;
        } else {
            this.items.push( { id: String(this.nextId++), name: this.editingItem.name, description: this.editingItem.description, price: this.editingItem.price })
        }

        this.showDialog = false;
    }

    public cancel() {
        this.showDialog = false;
    }

    public stopPropagation(event: Event): void {
        event.stopPropagation();
    }

    
    // Handlers used inside foreach (global.*)
    public openEdit(this: any): void {
        const vm: MenuAdminViewModel = this.global;
        const item = vm.items[this.$index];
        if (!item) return;

        vm.dialogMode = "edit";
        vm.editingIndex = this.$index;
        vm.editingItem = { id: item.id, name: item.name, price:item.price,  description: item.description, };
        vm.saveError = "";
        vm.showDialog = true;
    }

    public remove(this: any): void {
        const vm: MenuAdminViewModel = this.global;
        const item = vm.items[this.$index];
        if (!item) return;

        vm.items.splice(this.$index);
    }
}


const binder = new DataBinderRR(new ProxyManager());

binder.RegisterViewModel("menuAdmin", MenuAdminViewModel);
binder.Bind();