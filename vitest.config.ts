import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve workspace packages to source so tests never depend on dist builds.
    alias: {
      "@diceforge-sdk/core": fileURLToPath(new URL("packages/core/src/index.ts", import.meta.url)),
      "@diceforge-sdk/renderer-web": fileURLToPath(
        new URL("packages/renderer-web/src/index.ts", import.meta.url),
      ),
      "@diceforge-sdk/assets-forge": fileURLToPath(
        new URL("packages/assets-forge/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/*.test.ts"],
    },
  },
});
