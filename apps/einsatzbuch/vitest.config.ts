import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// `execArgv: ["--no-experimental-webstorage"]`: dieselbe Falle wie in `vitest.config.ts` der
// Suite (Repo-Wurzel) — Node 26 deklariert `localStorage` selbst als Getter auf `globalThis`
// und verdeckt damit jsdoms Implementierung, still und ohne Fehler außer einer harmlos
// aussehenden Warnung. Begründung und Messung dort, per Kommentar; hier reicht der Verweis.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      execArgv: ["--no-experimental-webstorage"],
    },
  }),
);
