import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Serve the repository's CC0 dice assets (assets/LICENSES.md) at the root,
  // e.g. /D20_red.gltf, for the theme demo and the calibration page.
  publicDir: "../../assets",
  resolve: {
    // Run against workspace source, so the demo never shows a stale dist build.
    alias: {
      "@diceforge-sdk/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@diceforge-sdk/renderer-web": fileURLToPath(
        new URL("../../packages/renderer-web/src/index.ts", import.meta.url),
      ),
    },
  },
});
