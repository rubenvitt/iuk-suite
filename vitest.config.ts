import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
export default defineConfig({
  // e2e/*.spec.ts are Playwright specs (run via `pnpm e2e`); exclude them from Vitest's
  // default glob so `pnpm test` only collects the unit tests under src/.
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Läuft auch für die node-Umgebung; der Guard in der Datei greift dort.
    setupFiles: ["./vitest.setup.ts"],
    /*
     * `next-auth` MUSS durch Vite laufen, sonst ist es aus einem Test heraus
     * gar nicht ladbar. Es ist ein reines ESM-Paket und wird deshalb sonst an
     * Node durchgereicht — und Node scheitert an seinem `import … from
     * "next/server"`:
     *
     *   Cannot find module '…/node_modules/next/server' imported from
     *   …/next-auth/lib/env.js — Did you mean to import "next/server.js"?
     *
     * `next` hat kein `exports`-Feld, und die Datei heisst `server.js`; nur ein
     * Bundler ergänzt die Endung. next-auth weiss das selbst (Kommentar in
     * `lib/env.js`). Ohne diese Zeile liesse sich `src/proxy.ts` nicht testen —
     * und genau dort ist die Anwendung schon einmal komplett ausgefallen.
     */
    server: { deps: { inline: [/next-auth/] } },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
