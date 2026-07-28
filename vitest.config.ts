import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
export default defineConfig({
  // e2e/*.spec.ts are Playwright specs (run via `pnpm e2e`); exclude them from Vitest's
  // default glob so `pnpm test` only collects the unit tests under src/.
  test: {
    environment: "node",
    /*
     * `.claude/**` gehoert dazu, und der Grund ist unangenehmer als er
     * aussieht: Agenten legen git-Worktrees unter `.claude/worktrees/` an —
     * also INNERHALB des Repos. Ohne diesen Eintrag sammelt Vitest die
     * Testdateien des fremden Zweigs mit ein (gemessen: 251 zusaetzliche
     * Fehlschlaege), und `e2e/**` greift dort nicht, weil das Muster relativ
     * ist und `.claude/worktrees/*​/e2e/**` nicht trifft.
     *
     * `git` selbst ist sauber — aber nur ueber `.git/info/exclude`, eine
     * lokale, nicht eingecheckte Datei, die Vitest nichts sagt. Wer den
     * Zusammenhang nicht kennt, jagt fremde Fehlschlaege oder haelt ein rotes
     * Tor fuer das Ergebnis der eigenen Arbeit.
     */
    exclude: [...configDefaults.exclude, "e2e/**", ".claude/**"],
    // Läuft auch für die node-Umgebung; der Guard in der Datei greift dort.
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
