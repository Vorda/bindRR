import { ObservableRR, ProxyManager, computed } from "../../src/ObservableRR"
import { DataBinderRR } from "../../src/DataBinderRR";

interface DishMenuItem {
    id: string;
    name: string;
    price: number;
    description: string;
    category: string;
}

const dishes: DishMenuItem[] = [
    { id: "1", name: "Margherita", price: 9.5, description: "Tomato, mozzarella, basil.", category: "Pizza" },
    { id: "2", name: "Diavola", price: 11, description: "Spicy salami, chili, mozzarella.", category: "Pizza" },
    { id: "3", name: "Quattro Formaggi", price: 12.5, description: "Four-cheese blend, oregano.", category: "Pizza" },
    { id: "4", name: "Funghi", price: 10, description: "Mushrooms, garlic, parsley.", category: "Pizza" },
    { id: "5", name: "Burger", price: 3, description: "Beef, cheese, garlic.", category: "Burger" },
    { id: "6", name: "Carbonara", price: 12, description: "Egg, pancetta, pecorino.", category: "Pasta" },
    { id: "7", name: "Tiramisu", price: 6.5, description: "Mascarpone, espresso, cocoa.", category: "Dessert" },
    { id: "8", name: "San Pellegrino", price: 6.5, description: "Sparkling mineral water, 500ml.", category: "Drinks" }
];

// const categories: string[] = [ "Pizza", "Pasta", "Dessert", "Drinks" ];

class MenuAdminViewModel {
    public nextId: number = 5;
    public showDialog: boolean = false;
    public dialogMode: "add" | "edit" = "add";
    public editingIndex: number = -1; // index into items while editing
    public editingItem: DishMenuItem = { id: "-1", name: "", price: 0, description: "", category: "" }; // draft, not the live item

    public saveError: string = "";

    public activeCategory: string = "All";

    public dialogTitle = computed(function dialogTitle() {
        return this.dialogMode == "edit" ? "Edit dish" : "Add dish"; 
    }, { cache: true, deps: ["dialogMode"] });

    public itemCount = computed(function itemCount() {
        const n = this.items.length;
        return n + (n === 1 ? " dish" : " dishes");
    }, { cache: true, deps: ["items"] });

    public categories = computed(function categories() {
        const retVal: any[] = [];
        const seen = new Set<string>();

        retVal.push({ name: "All",
             get active() { 
                return this.global.activeCategory === this.name; 
            }
        });

        for (const item of this.items) {
            if  (seen.has(item.category))
                continue;
            seen.add(item.category);
            retVal.push({ name: item.category, 
                get active() { 
                    return this.global.activeCategory === this.name; 
                }
            });
        }

        return retVal;
    }, { cache: true, deps: ["items", "activeCategory"] });

    public filteredItems = computed(function filteredItems(this: MenuAdminViewModel) {
        if (this.activeCategory === "All")
            return [...this.items];   // copy -> new reference every recompute - see limitations in ObservableRR.md
        
        return this.items.filter(i => i.category === this.activeCategory);
    }, { cache: true, deps: ["items", "activeCategory"] });

    constructor(public items: DishMenuItem[] = []) { }


    // Top-level handlers
    public openAdd() {
        this.dialogMode = "add";
        this.editingIndex = -1;
        this.editingItem = { id: "-1", name: "", price: 0, description: "", category: "" };
        this.saveError = "";
        this.showDialog = true;
    }

    public save() {
        const name = this.editingItem.name.trim();
        const price = Number(this.editingItem.price);
        const desc = this.editingItem.description.trim();
        const category = this.editingItem.category.trim();

        if (!name) {
            this.saveError = "Name is required";
            return;
        }

        if (!(price > 0)) {
            this.saveError = "Enter a valid price";
            return;
        }

        if (!category)
        {
            this.saveError = "Category is required!"
            return;
        }

        if (this.dialogMode === "edit" && this.editingIndex > -1) {
            const item = this.items[this.editingIndex];
            item.name = name;
            item.description = desc
            item.price = price;
            item.category =  category;
        } else {
            this.items.push({ id: String(this.nextId++), name: name, description: desc, price: price, category: category })
        }

        this.showDialog = false;
    }

    public cancel() {
        this.showDialog = false;
    }

    public stopPropagation(event: Event): void {
        event.stopPropagation();
    }

    // from the category filter buttons — "this" is { name, active, $index, global }
    public setCategory(this: any): void {
        this.global.activeCategory = this.name;
    }

    // Handlers used inside foreach (global.*)
    public openEdit(this: any): void {
        const vm: MenuAdminViewModel = this.global;
        const item = vm.items[this.$index];
        if (!item) return;

        vm.dialogMode = "edit";
        vm.editingIndex = this.$index;
        vm.editingItem = { id: item.id, name: item.name, price: item.price, description: item.description, category: "Pizza" };
        vm.saveError = "";
        vm.showDialog = true;
    }

    public remove(this: any): void {
        const vm: MenuAdminViewModel = this.global;
        const item = vm.items[this.$index];
        if (!item) return;

        vm.items.splice(this.$index, 1);
    }
}


const binder = new DataBinderRR(new ProxyManager());

binder.RegisterViewModel("menuAdmin", MenuAdminViewModel, [ { type: "external", defaultValue: dishes } ]);
binder.Bind();