import { defineConfig } from "@playwright/test";
// Der Pfad der Modusdatei kommt aus dem Helfer, NICHT als Literal von hier:
// der Fake liest die Datei, der Test schreibt sie, und `webServer.env` erreicht
// nur den Serverprozess. Zwei Literale liefen auseinander, ohne dass ein Lauf
// rot wuerde — er waere rennabhaengig gruen (Spec §6.8, Plan-Festlegung H).
import { AV_MODUS_DATEI } from "./e2e/helpers/avModus";

export default defineConfig({
  testDir: "./e2e",
  // Der PWA-Spike braucht Chrome-Flags für den sicheren Kontext und läuft
  // deshalb in playwright.pwa.config.ts (eigener Port).
  testIgnore: /pwa-spike\.spec\.ts/,
  workers: 1,
  /*
   * 30s reichen NICHT fuer den ersten Test, der sich anmeldet.
   *
   * Die Suite faehrt gegen `next dev`, und ein Dev-Server uebersetzt jede Route
   * erst beim ersten Aufruf. In der CI ist `.next` IMMER kalt (frischer
   * Checkout, kein Build-Cache) UND der Runner klein; lokal ist beides nicht so,
   * deshalb blieb es unentdeckt, bis es in der CI stand. Gemessen auf einem
   * geloeschten `.next` und einer kuenstlich unter Last gesetzten Maschine (der
   * Ersatz fuer den Runner), sonst identischer Lauf:
   *
   *   GET /login ............................  7 368 ms
   *   Anmelden bis die Adresse /login verlaesst  13 722 ms
   *   derselbe Login ein zweites Mal, warm ...  1 160 ms
   *
   * Das ist echte Uebersetzungsarbeit, kein Haenger: der Klick stoesst
   * nacheinander die next-auth-Routen und die angemeldete Modul-Wurzel an. Die
   * erste Zeile nimmt ihm `webServer.url` unten ab; die zweite bleibt im Test
   * stehen und passt mit dem, was der Test danach noch tut, nicht in 30 s.
   *
   * Die Grenze gilt bewusst fuer ALLE Tests statt fuer einen ausgewaehlten: wer
   * der erste anmeldende Test ist, haengt an der Dateireihenfolge und aendert
   * sich mit der naechsten Spec.
   */
  timeout: 90_000,
  use: { baseURL: "http://portal.localtest.me:3100" },
  /*
   * ZWEI Server, deshalb ein Array (Spec §6.8). Der Fake-clamd steht vorne, weil
   * er vor `next dev` bereit sein soll; tragend ist aber nicht die Reihenfolge,
   * sondern dass Playwright BEIDE Bereitschaftsproben abwartet, bevor der erste
   * Test laeuft.
   *
   * Ohne antwortenden Scanner erreicht wegen fail-closed (§6.3) KEINE Datei je
   * `clean` — es gibt keinen fail-open-Schalter. Das Modul waere in E2E
   * unbenutzbar, und zwar still: jeder Upload haengt auf „wird geprueft" und
   * jeder Download antwortet 403. Das ist RICHTIGES Verhalten und sieht wie ein
   * kaputtes Modul aus.
   */
  webServer: [
    {
      /*
       * `rm -f` VOR dem Start, und das ist keine Kosmetik: der Fake liest die
       * Modusdatei bei jeder Verbindung und sie schlaegt `FAKE_CLAMD_MODUS`.
       * Eine Datei mit `error` aus dem letzten Lauf machte den naechsten
       * stillschweigend zu einem fail-closed-Lauf — dieselbe Bauform wie
       * `rm -rf ./.data/e2e` beim Next-Eintrag darunter.
       */
      command: `rm -f ${AV_MODUS_DATEI} && node scripts/fake-clamd.mjs`,
      /*
       * `port` und NICHT `url`: Playwrights `url`-Probe schickt eine
       * HTTP-Anfrage, und ein roher clamd-Socket antwortet darauf nicht — der
       * Lauf hinge beim Start, statt laut zu scheitern.
       */
      port: 3310,
      // `true` griffe einen `pnpm dev:av` ab, der auf einer ANDEREN Modusdatei
      // laeuft: der Test schriebe dann ins Leere und der Lauf waere
      // rennabhaengig gruen.
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: "3310",
        // Vorbelegung des Laufs. T47 setzt `error` als erste Anweisung seines
        // Tests, T35/T43 brauchen `ok` — im selben Prozess, `workers: 1`.
        FAKE_CLAMD_MODUS: "ok",
        FAKE_CLAMD_MODUS_DATEI: AV_MODUS_DATEI,
      },
    },
    {
      command: "rm -rf ./.data/e2e && next dev -p 3100",
      /*
       * WARTET AUF DIE ANMELDESEITE, nicht auf `/api/health` — und uebersetzt sie
       * damit, bevor der erste Test laeuft. Zweck ist beides: der Server steht
       * (die Seite antwortet nur, wenn er hochgekommen ist) UND die teuerste
       * Erstuebersetzung der Suite (App-Huelle samt antd, 7,4 s kalt gemessen)
       * faellt hier an statt im Zeitbudget irgendeines Tests. Bewusst NUR ein GET
       * und kein Anmelden: eine echte Sitzung vor dem ersten Test waere geteilter
       * Zustand, und Anmelden per `globalSetup` war zwischenzeitlich probiert —
       * unter ihm fiel die Logout-Zusicherung in `qr.spec.ts` in drei von sieben
       * Laeufen aus. Ein Zusammenhang liess sich nicht belegen (sie faellt auch
       * ohne aus, siehe Bericht), aber ein GET braucht ihn gar nicht erst zu
       * widerlegen.
       */
      url: "http://feedback.localtest.me:3100/login",
      reuseExistingServer: false,
      // 120 s waren fuer `/api/health` bemessen; die Anmeldeseite kalt zu
      // uebersetzen kostet auf einem CI-Runner ein Vielfaches der lokal
      // gemessenen 7,4 s.
      timeout: 180_000,
      env: {
        AUTH_SECRET: "test-secret",
        AUTH_DEV_LOGIN: "true",
        AUTH_COOKIE_DOMAIN: ".localtest.me",
        DATA_DIR: "./.data/e2e",
        PORT: "3100",
        NODE_ENV: "development",
        /*
         * ZWEI files-Hosts, und Index 0 ist WOERTLICH `files.localtest.me`
         * (Spec §3.4). `moduleForHost` prueft `${key}.localtest.me` UND
         * `prodHostsFor(m, env)`, und `prodHostsFor` liest `envHostsFor`
         * unabhaengig von `NODE_ENV` — deshalb laeuft hier DERSELBE Code-Pfad
         * wie in Produktion, und die Zwei-Host-Klasse (Analyse-Falle 17) ist
         * lokal ueberhaupt pruefbar. Wildcard-DNS loest jeden
         * `*.localtest.me` auf 127.0.0.1 auf.
         *
         * Weicht Index 0 vom Dev-Zweig von `moduleUrl` (`<key>.localtest.me`)
         * ab, zeigt der App-Switcher lokal auf einen Host, der die Rolle
         * `verwaltung` nicht traegt.
         */
        SUITE_HOST_FILES: "files.localtest.me,drop.localtest.me",
        /*
         * Die drei Pflichtzahlen aus §9.3 — und sie stehen hier als ZAHLEN, weil
         * „klein" unerfuellbar ist: Boot-Pruefung 2 verlangt
         * `FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES`, und
         * `FILES_CHUNK_BYTES` ist eine 4-MiB-KONSTANTE. 12 MiB liegt zugleich
         * ueber den 10 MiB, die §11.5 fuer den Proxy-Kappen-Test braucht.
         */
        FILES_MAX_DATEI_BYTES: "12582912",
        // Gleichheit ist erlaubt (Pruefung 3: `MAX_DATEI ≤ AV_MAX`).
        FILES_AV_MAX_BYTES: "12582912",
        FILES_MAX_ABLAUF_TAGE: "7",
        // Der Fake-clamd oben, nicht der Compose-Sidecar `clamav`.
        FILES_AV_HOST: "127.0.0.1",
        FILES_AV_PORT: "3310",
        /*
         * DIE VIER KLEINEN AV-ZAHLEN SIND PFLICHT, NICHT KOSMETIK: die
         * Produktionsvorgaben 60 000 ms × 5 Versuche waeren fuenf Minuten gegen
         * `timeout: 90_000` oben — die Zusage „fail-closed ist erreichbar" liefe
         * in einen Playwright-Timeout, sobald der Fake HAENGT statt abzulehnen.
         * Mit 2 × 2 000 ms + 1 s Abstand ist derselbe Weg in ≈ 5 s durchlaufen.
         */
        FILES_AV_TIMEOUT_MS: "2000",
        FILES_AV_VERSUCHE: "2",
        FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1",
        // Ein Arbeiter, damit die Reihenfolge im Test bestimmt ist.
        FILES_AV_PARALLEL: "1",
        // Sonst wartet der Test zu Ablauf und Loeschung 24 Stunden.
        FILES_LOESCH_KARENZ_STUNDEN: "0",
        // Der Test loest den Aufraeumlauf ueber den Knopf aus, nicht ueber den Takt.
        FILES_AUFRAEUMEN_TAKT_MINUTEN: "60",
        // Auch hier, nicht nur beim Fake: der Serverprozess muss dieselbe Datei
        // meinen wie Fake und Testhelfer.
        FAKE_CLAMD_MODUS_DATEI: AV_MODUS_DATEI,
      },
    },
  ],
});
