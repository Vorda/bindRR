import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/bindRR.ts"],
    format: ["esm", "cjs", "iife"],   // three flavors from one source
    globalName: "BindRR",             // window.BindRR for the iife build
    dts: true,                        // generates .d.ts files, like XML doc comments -> intellisense
    sourcemap: "inline",
    clean: true
  },
  {
    entry: ["demo/**/*.ts"],   
    format: ["iife"],
    globalName: "BindRR",
    dts: true,        
    sourcemap: "inline",
    clean: false,              // don't wipe dist
    outDir: "demo/js"
  }
]);