import { defineConfig } from "@playwright/test"; import { E2E_PORTS, pruefePortsFrei } from "./e2e/helpers/ports";

/**
 * Eigene Config für die Rückmelde-Einbindung (Port 3102, neben 3100/3101).
 *
 * GRUND FÜR DIE TRENNUNG — und er ist genau umgekehrt zum PWA-Profil daneben:
 * dort brauchen die Tests ein Browser-Flag, das die normale Suite nicht haben
 * darf. Hier brauchen sie eine Umgebungsvariable, die die normale Suite nicht
 * haben darf. `playwright.config.ts` setzt `SUITE_RUECKMELDUNG_URL` bewusst
 * LEER (Begründung dort): der schwebende Knopf legte sich sonst in jedem der
 * rund 40 Specs als eigene Ebene über die Greifer — und weil er nach dem
 * ersten Klick verschwindet, mal da und mal nicht. Diese Config schaltet die
 * Einbindung für ihre eigenen Fälle ein — und für sonst nichts.
 *
 * ⚠️ BIS DRK-453 STAND HIER `playwright.umfragen.config.ts` (Formbricks). Die
 * Datei ist ersetzt, nicht ergänzt: derselbe Port, dieselbe Bauform, derselbe
 * Grund. Wer die alte in einer Notiz findet, sucht diese.
 *
 * ⚠️ DIESES PROFIL LÄUFT NICHT IN DER CI, genau wie `playwright.pwa.config.ts`
 * nicht. `.github/workflows/ci.yml` ruft ausschließlich `pnpm e2e`. Das ist
 * eine bewusste Grenze und keine Lücke, die jemand vergessen hat: der
 * eingeschaltete Zweig hängt an einer Betreiber-Entscheidung (steht die
 * Adresse in der `.env`?), nicht an einer Code-Zusage, die jeder PR halten
 * muss. Wer die Einbindung anfasst, fährt `pnpm e2e:rueckmeldung` von Hand —
 * die Quelltext-Wächter in `src/core/rueckmeldung/einbindung.test.ts` laufen
 * dagegen bei jedem `pnpm vitest run` mit und decken die Reichweite ab.
 */
export default defineConfig({
  testDir: "./e2e",
  // Eine Datei, die weder hier noch in der normalen Config steht, liefe in
  // KEINEM Profil — dieselbe Falle, die im PWA-Profil kommentiert ist. Der
  // Gegenpart ist `testIgnore` in `playwright.config.ts`.
  testMatch: /rueckmeldung\.spec\.ts/,
  workers: 1,
  timeout: 90_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://portal.localtest.me:${E2E_PORTS.rueckmeldung}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `rm -rf ./.data/rueckmeldung && next dev -p ${E2E_PORTS.rueckmeldung}`,
    // Wartet auf die Anmeldeseite und übersetzt damit die teuerste Hülle der
    // Suite, bevor der erste Fall läuft — dieselbe Begründung wie im Dev-Profil.
    url: `http://portal.localtest.me:${E2E_PORTS.rueckmeldung}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_SECRET: "test-secret",
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/rueckmeldung",
      PORT: String(E2E_PORTS.rueckmeldung),
      NODE_ENV: "development",
      POCKET_ID_API_KEY: "",
      /*
       * ⚠️ DIE ADRESSE IST ERFUNDEN UND SOLL ES SEIN. Kein Fall dieses Profils
       * ruft sie ab — geprüft wird, WO der Weg steht und ob er wieder
       * verschwindet, nicht was am anderen Ende liegt. Eine echte Adresse
       * machte den Lauf von der Erreichbarkeit eines fremden Servers abhängig,
       * ohne dass er dadurch mehr prüfte. `.invalid` ist dafür reserviert
       * (RFC 2606) und löst nirgends auf.
       */
      SUITE_RUECKMELDUNG_URL: "https://formular.invalid/f/e2e",
    },
  },
});

// Nennt den Halter eines belegten Ports (DRK-346, `e2e/helpers/ports.ts`).
pruefePortsFrei([E2E_PORTS.rueckmeldung]);
