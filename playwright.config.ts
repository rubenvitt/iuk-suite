import { defineConfig } from "@playwright/test";
// Der Pfad der Modusdatei kommt aus dem Helfer, NICHT als Literal von hier:
// der Fake liest die Datei, der Test schreibt sie, und `webServer.env` erreicht
// nur den Serverprozess. Zwei Literale liefen auseinander, ohne dass ein Lauf
// rot wuerde — er waere rennabhaengig gruen (Spec §6.8, Plan-Festlegung H).
import { AV_MODUS_DATEI } from "./e2e/helpers/avModus";
import { AUFGABEN_ENV } from "./e2e/helpers/aufgaben";
import { LAGERBUCH_ENV } from "./e2e/helpers/lagerbuch";

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
  /*
   * WIEDERHOLUNGEN NUR IN DER CI — und der Grund ist derselbe wie beim
   * `timeout` darueber, nur eine Ebene tiefer.
   *
   * `next dev` uebersetzt eine Route beim ERSTEN Aufruf. Der Test-Timeout von
   * 90 s deckt das ab; die EINZELNE Zusicherung tut es nicht: `expect` bricht
   * nach seinem Default von 5 s ab, lange bevor der Test selbst aufgibt. Ein
   * Klick auf einen Link, dessen Zielroute noch uebersetzt wird, laesst
   * `toHaveURL` deshalb unter Last auflaufen, waehrend die Navigation noch
   * laeuft. Gemessen am 12.08.2026: derselbe Commit faellt einmal
   * (`e2e/lagerbuch-verwaltung.spec.ts:35`, 13 Pollversuche auf der alten URL)
   * und laeuft im unveraenderten Rerun durch.
   *
   * ⚠️ DIE WIEDERHOLUNG IST KEINE ENTSCHULDIGUNG FUER EINEN WACKLIGEN TEST.
   * Sie faengt Uebersetzungslatenz, nicht Logikfehler: ein Test, der aus
   * fachlichen Gruenden mal so und mal anders ausgeht, wird auch im zweiten
   * Anlauf rot, und `flaky` im Report ist das Signal, ihn anzusehen — nicht,
   * die Zahl zu erhoehen.
   *
   * LOKAL BLEIBT ES BEI NULL: wer hier entwickelt, soll einen fehlschlagenden
   * Test sofort sehen und nicht hinter einem stillen zweiten Versuch.
   */
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://portal.localtest.me:3100",
    /*
     * `on-first-retry` und bewusst NICHT `retain-on-failure`: die Aufzeichnung
     * kostet in jedem Test Zeit und Platz, `retries` ist aber oben schon auf
     * „nur in der CI" gestellt — dieser Wert zeichnet damit genau dann auf,
     * wenn ein Lauf bereits einmal rot war, und im gruenen Normalfall nie.
     *
     * DER GRUND STEHT IM LAUF 31794072467 (2026-08-14): ein Klick auf einen
     * `next/link` liess die Adresse 30 s lang unveraendert, dreimal
     * hintereinander — die Wiederholungen oben fingen es nicht, weil die
     * Stoerung ueber alle drei Versuche anhielt. Aus dem Log war NICHT zu
     * entscheiden, ob die Anfrage ueberhaupt hinausging oder ob sie ohne Antwort
     * blieb, und genau diese Unterscheidung traegt der Netzwerkteil der
     * Ablaufverfolgung. Der unveraenderte Rerun lief spaeter durch; die Ursache
     * lag im Runner-Zustand — belegen liess sich das aber erst NACH einem halben
     * Tag Ausschlussarbeit, und beim naechsten Mal soll die Aufzeichnung das in
     * Minuten leisten.
     *
     * ⚠️ DIE DATEI ENTSTEHT HIER UND IST MIT DEM RUNNER WIEDER WEG. Sie
     * hinauszuretten ist Sache des Schritts „Playwright-Artefakte sichern" in
     * `.github/workflows/ci.yml` — ohne ihn ist dieser Wert wirkungslos.
     */
    trace: "on-first-retry",
  },
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
      /*
       * `scripts/seed-lokal.ts aufgaben` NACH dem lagerbuch-Seed, VOR `next dev` (Aufgabe 11): das
       * Modul seedet bewusst NICHT am Boot-Pfad (`docs/... shouldSeed()`-Begruendung, `_lib/
       * seedLokal.ts`-Kopfkommentar) — ohne diese Zeile bliebe die `person`-Tabelle bei einem
       * frischen `rm -rf ./.data/e2e` leer, und JEDE Anmeldung (jede Adresse) traefe
       * `personFuerSession()`s `notFound()`. Idempotent und additiv (derselbe Kopfkommentar), also
       * unbedenklich vor jedem Lauf neu auszufuehren. `pnpm seed:lokal aufgaben` selbst ruft
       * `migrateAllModules()` auf und braucht dafuer keinen laufenden Server — reiner Dateizugriff
       * auf dieselbe `DATA_DIR`, die `next dev` gleich danach oeffnet.
       */
      command:
        "rm -rf ./.data/e2e && pnpm exec tsx e2e/seed-lagerbuch.ts && pnpm exec tsx scripts/seed-lokal.ts aufgaben && next dev -p 3100",
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
        /*
         * DASSELBE Fake-clamd, jetzt auch fuer `aufgaben` (Aufgabe 19): `_lib/scan.ts` liest seine
         * EIGENEN Variablen (`AUFGABEN_AV_*`, nie `FILES_AV_*` — Kopfkommentar dort, „eine geteilte
         * Zahl waere eine Kopplung, die niemand gewaehlt hat"), zeigt aber auf denselben Prozess:
         * EIN Fake-clamd-Server fuer beide Module, `workers: 1` macht das sicher (kein
         * Modus-Wettlauf zwischen zwei parallelen Specs). Ohne diese drei Zeilen liefe
         * `_lib/scan.ts`s Vorgabe `avKonfigAusEnv()` auf den Hostnamen "clamav" — in `next dev`
         * unaufloesbar, jeder Scan endet als 'fehler', und `e2e/aufgaben.spec.ts`s Upload-Faelle
         * waeren nie 'sauber' pruefbar.
         */
        AUFGABEN_AV_HOST: "127.0.0.1",
        AUFGABEN_AV_PORT: "3310",
        AUFGABEN_AV_TIMEOUT_MS: "2000",
        /*
         * DIE ZWEI GRUPPENNAMEN AUS EINER QUELLE (Quellenwechsel 2026-08-15) —
         * dieselbe Bauform wie `...LAGERBUCH_ENV` weiter unten, aus demselben
         * Grund: `e2e/aufgaben.spec.ts`s `devLogin(…, { groups })` liest
         * DIESELBEN Konstanten wie diese beiden Zeilen.
         *
         * ⚠️ SIE STEHEN HIER, WEIL SIE SONST GAR NICHT GESETZT WAEREN — UND
         * GENAU DAS WAR DIE LUECKE: ohne Eintrag griffe der Registry-Vorgabewert,
         * es sei denn, `.env.local` setzt etwas anderes. `next dev` laeuft im
         * Repo-Wurzelverzeichnis und liest `.env.local` mit; wer dort die
         * produktiven Pocket-ID-Namen (`aufgaben_nutzer`/`aufgaben_koordination`)
         * eintraegt — wovon `.env.example` inzwischen zwar abraet, was aber in
         * jeder gitignorierten Arbeitskopie anders aussehen kann —, verschoebe
         * damit still die Gruppen des E2E-Servers. Der Lauf waere danach nicht
         * rot, sondern GEGENTEILIG
         * gruen: die Koordinationsfaelle bezeugten die 404-Riegel, die die
         * Gegenproben ohnehin behaupten. Ein gesetzter Wert in `webServer.env`
         * hat Vorrang vor jeder `.env`-Datei (Next ueberschreibt nie, was schon
         * in `process.env` steht).
         *
         * ⚠️ `SUITE_ACCESS_GROUP_AUFGABEN` DARF hier stehen, anders als sein
         * lagerbuch-Gegenstueck: dessen Boot-Riegel haengt an
         * `requiresAuth: false`, `aufgaben` traegt `true`.
         */
        ...AUFGABEN_ENV,
        /*
         * Die neun Lagerbuch-Zeilen kommen aus EINER Quelle (Festlegung H9,
         * Spec §12.6 Punkt 2): `devLogin(…, { groups })` in jedem
         * Verwaltungs-Spec liest DIESELBE Konstante wie
         * SUITE_ADMIN_GROUP_LAGERBUCH hier. Zwei Literale liefen auseinander,
         * ohne dass ein Lauf rot wuerde — er waere GEGENTEILIG gruen: ohne
         * passende Gruppe bezeugt der Spec den 404 aus §11.5, Zustand 19.
         *
         * ⚠️ SUITE_ACCESS_GROUP_LAGERBUCH steht bewusst NICHT darunter — ein
         * gesetzter Wert bricht den Boot ab (Spec §2.5, §10.5 Pruefung 6), und
         * zwar fuer die GANZE Suite.
         *
         * ⚠️ „Klein" ist bei den Zahlen kein zulaessiger Eintrag: die
         * Kopplungspruefungen aus §10.5 greifen sonst, bevor ein Test laeuft.
         */
        ...LAGERBUCH_ENV,
      },
    },
  ],
});
