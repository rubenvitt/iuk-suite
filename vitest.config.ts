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
     *
     * `**​/.next/**` ist derselbe Fehler in gefaehrlicherer Form: `output:
     * "standalone"` (next.config.ts) legt unter `.next/standalone/src/` eine
     * VOLLSTAENDIGE Kopie des Quellbaums ab — Testdateien inbegriffen. Die
     * Kopien tragen dieselben relativen Vorrichtungspfade wie die Originale
     * (z.B. `./.data/files-queries-test`), laufen aber als eigene Dateien
     * PARALLEL: beide `rmSync`en und migrieren dieselbe SQLite-Datei, und das
     * Ergebnis sind `SQLITE_READONLY_DBMOVED` und `UNIQUE constraint failed`
     * an Stellen, die nichts falsch machen (gemessen: 52 Fehlschlaege bei 0
     * echten Defekten). Toedlich daran ist die Reihenfolge der Tore: `pnpm
     * vitest run` ist beim ERSTEN Lauf gruen und wird erst durch das darauf
     * folgende `pnpm build` vergiftet. Das Muster ist bewusst genestet, weil
     * ein `.next/` auch in einem Worktree unter `.claude/worktrees/` liegen
     * kann.
     */
    exclude: [...configDefaults.exclude, "e2e/**", ".claude/**", "**/.next/**"],
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
