import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Run against workspace source, so the demo never shows a stale dist build.
    alias: {
      "@diceforge-sdk/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@diceforge-sdk/renderer-web": fileURLToPath(
        new URL("../../packages/renderer-web/src/index.ts", import.meta.url),
      ),
      // The dice come from the asset package, exactly as they would in an app;
      // Vite emits the .glb and .png files it resolves through it.
      "@diceforge-sdk/assets-forge": fileURLToPath(
        new URL("../../packages/assets-forge/src/index.ts", import.meta.url),
      ),
    },
  },
});
