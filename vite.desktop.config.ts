import { defineConfig, mergeConfig, UserConfig } from "vite";
import base from "./vite.config";

// Build do app de computador (Tauri): só a entrada do Business, com caminhos relativos.
export default defineConfig((env) =>
  mergeConfig((base as (e: typeof env) => UserConfig)(env), {
    base: "./",
    build: {
      outDir: "dist-desktop",
      emptyOutDir: true,
      rollupOptions: { input: "desktop-business.html" },
    },
  }),
);
