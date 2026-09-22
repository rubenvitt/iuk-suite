import { defineConfig } from "@playwright/test"; import { E2E_PORTS, pruefePortsFrei } from "./e2e/helpers/ports";

/**
 * Eigene Config für die Umfragen-Einbindung (Port 3102, neben 3100/3101).
 *
 * GRUND FÜR DIE TRENNUNG — und er ist genau umgekehrt zum PWA-Profil daneben:
 * dort brauchen die Tests ein Browser-Flag, das die normale Suite nicht haben
 * darf. Hier brauchen sie eine Umgebungsvariable, die die normale Suite nicht
 * haben darf. `playwright.config.ts` setzt `SUITE_FORMBRICKS_*` bewusst LEER
 * (Begründung dort): ein eingebundenes Widget zöge in jedem der rund 40 Specs
 * ein Skript von einem fremden Host nach und legte sich als eigene Ebene über
 * die Greifer. Diese Config schaltet die Einbindung für ihre eigenen vier
 * Fälle ein — und für sonst nichts.
 *
 * ⚠️ DIESES PROFIL LÄUFT NICHT IN DER CI, genau wie `playwright.pwa.config.ts`
 * nicht. `.github/workflows/ci.yml` ruft ausschließlich `pnpm e2e`. Das ist
 * eine bewusste Grenze und keine Lücke, die jemand vergessen hat: der
 * eingeschaltete Zweig hängt an einer Betreiber-Entscheidung (stehen die zwei
 * Werte in der `.env`?), nicht an einer Code-Zusage, die jeder PR halten muss.
 * Wer die Einbindung anfasst, fährt `pnpm e2e:umfragen` von Hand — die
 * Quelltext-Wächter in `src/core/umfragen/einbindung.test.ts` laufen dagegen
 * bei jedem `pnpm vitest run` mit und decken die Reichweite ab.
 */
export default defineConfig({
  testDir: "./e2e",
  // Eine Datei, die weder hier noch in der normalen Config steht, liefe in
  // KEINEM Profil — dieselbe Falle, die im PWA-Profil kommentiert ist. Der
  // Gegenpart ist `testIgnore` in `playwright.config.ts`.
  testMatch: /umfragen\.spec\.ts/,
  workers: 1,
  timeout: 90_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://portal.localtest.me:${E2E_PORTS.umfragen}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `rm -rf ./.data/umfragen && next dev -p ${E2E_PORTS.umfragen}`,
    // Wartet auf die Anmeldeseite und übersetzt damit die teuerste Hülle der
    // Suite, bevor der erste Fall läuft — dieselbe Begründung wie im Dev-Profil.
    url: `http://portal.localtest.me:${E2E_PORTS.umfragen}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_SECRET: "test-secret",
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/umfragen",
      PORT: String(E2E_PORTS.umfragen),
      NODE_ENV: "development",
      POCKET_ID_API_KEY: "",
      /*
       * ⚠️ DIE ADRESSE IST ERFUNDEN UND SOLL ES SEIN. Der Spec fängt
       * `**​/js/formbricks.umd.cjs` ab, bevor die Anfrage die Maschine verlässt;
       * eine echte Adresse hier machte den Lauf von der Erreichbarkeit eines
       * fremden Servers abhängig, ohne dass er dadurch mehr prüfte.
       */
      SUITE_FORMBRICKS_APP_URL: "http://umfragen.invalid",
      SUITE_FORMBRICKS_WORKSPACE_ID: "e2e-workspace",
    },
  },
});

// Nennt den Halter eines belegten Ports (DRK-346, `e2e/helpers/ports.ts`).
pruefePortsFrei([E2E_PORTS.umfragen]);
