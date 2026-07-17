import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
export default defineConfig({
  // e2e/*.spec.ts are Playwright specs (run via `pnpm e2e`); exclude them from Vitest's
  // default glob so `pnpm test` only collects the unit tests under src/.
  test: { environment: "node", exclude: [...configDefaults.exclude, "e2e/**"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
