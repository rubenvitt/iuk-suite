import { defineConfig } from "@playwright/test";
// Der Pfad der Modusdatei kommt aus dem Helfer, NICHT als Literal von hier:
// der Fake liest die Datei, der Test schreibt sie, und `webServer.env` erreicht
// nur den Serverprozess. Zwei Literale liefen auseinander, ohne dass ein Lauf
// rot wuerde — er waere rennabhaengig gruen (Spec §6.8, Plan-Festlegung H).
import { AV_MODUS_DATEI } from "./e2e/helpers/avModus";
import { AUFGABEN_ENV } from "./e2e/helpers/aufgaben";
import { LAGERBUCH_ENV } from "./e2e/helpers/lagerbuch";
import { RADIO_ENV } from "./e2e/helpers/radio";
import { UAV_ENV } from "./e2e/helpers/uav";
import { E2E_PORTS, pruefePortsFrei } from "./e2e/helpers/ports"; import { cloudTauglich } from "./e2e/helpers/cloud";
import { E2E_VORGEBAUT, nextServerBefehl, VORGEBAUT_ENV } from "./e2e/helpers/server";
export default cloudTauglich(defineConfig({
  testDir: "./e2e",
  // Der PWA-Spike braucht Chrome-Flags für den sicheren Kontext und läuft
  // deshalb in playwright.pwa.config.ts (eigener Port).
  // `rueckmeldung` kommt aus demselben Grund dazu wie die PWA-Datei,
  // nur mit umgekehrtem Vorzeichen: der Fall braucht `SUITE_RUECKMELDUNG_URL`
  // GESETZT, und dieses Profil setzt sie bewusst leer (siehe `webServer.env`
  // unten). Er läuft in `playwright.rueckmeldung.config.ts`, Port 3102.
  testIgnore: /(pwa-spike|rueckmeldung)\.spec\.ts/,
  workers: 1,
  /*
   * 90 s UNTER `next dev`, 45 s GEGEN DEN VORGEBAUTEN STAND (DRK-415).
   *
   * `next dev` uebersetzt jede Route erst beim ersten Aufruf. Lokal ist das die
   * Vorgabe, und in der CI stand bis DRK-415 derselbe Server auf einem IMMER
   * kalten `.next` (frischer Checkout) und einem kleinen Runner — dort reichten
   * 30 s nicht. Gemessen auf einem geloeschten `.next` und einer kuenstlich unter
   * Last gesetzten Maschine (der Ersatz fuer den Runner), sonst identischer
   * Lauf:
   *
   *   GET /login ............................  7 368 ms
   *   Anmelden bis die Adresse /login verlaesst  13 722 ms
   *   derselbe Login ein zweites Mal, warm ...  1 160 ms
   *
   * Das ist echte Uebersetzungsarbeit, kein Haenger. GEGEN DEN VORGEBAUTEN STAND
   * (die CI, `e2e/helpers/server.ts`) faellt sie weg: im ersten Lauf lag der
   * laengste von 521 Faellen bei 15 s, im lokalen Volllauf auf 4 Kernen bei 23 s.
   * 45 s sind das Doppelte — Luft fuer einen langsamen Runner, und knapp genug,
   * dass ein Fall, der auf das Dreifache anwaechst, auffaellt.
   *
   * Die Grenze gilt bewusst fuer ALLE Tests statt fuer einen ausgewaehlten: wer
   * der erste anmeldende Test ist, haengt an der Dateireihenfolge.
   */
  timeout: E2E_VORGEBAUT ? 45_000 : 90_000,
  /*
   * WIEDERHOLUNGEN NUR IN DER CI, und seit DRK-415 EINE statt zwei.
   *
   * Die zwei stammten aus `next dev`: eine Route, die beim ersten Aufruf noch
   * uebersetzt wird, laesst eine einzelne Zusicherung (`expect`, 5 s) auflaufen,
   * lange bevor der Test aufgibt. Gemessen am 12.08.2026: derselbe Commit faellt
   * einmal (`e2e/lagerbuch-verwaltung.spec.ts:35`, 13 Pollversuche auf der alten
   * URL) und laeuft im unveraenderten Rerun durch. Gegen den vorgebauten Stand
   * gibt es diese Latenz nicht mehr; im ersten Lauf brauchte keiner der 521
   * Faelle eine Wiederholung.
   *
   * EINE bleibt, und zwar fuer `trace: "on-first-retry"` darunter: ohne
   * Wiederholung gaebe es keine Ablaufverfolgung, und genau die macht einen
   * Runner-Zustand wie den vom 14.08. (Kommentar dort) in Minuten belegbar.
   *
   * ⚠️ DIE WIEDERHOLUNG IST KEINE ENTSCHULDIGUNG FUER EINEN WACKLIGEN TEST: ein
   * Fall, der aus fachlichen Gruenden mal so und mal anders ausgeht, bleibt ein
   * Befund — `flaky` im Report heisst ansehen, nicht die Zahl erhoehen.
   *
   * LOKAL BLEIBT ES BEI NULL: wer hier entwickelt, soll einen fehlschlagenden
   * Test sofort sehen und nicht hinter einem stillen zweiten Versuch.
   */
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://portal.localtest.me:${E2E_PORTS.web}`,
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
      port: E2E_PORTS.clamd,
      // `true` griffe einen `pnpm dev:av` ab, der auf einer ANDEREN Modusdatei
      // laeuft: der Test schriebe dann ins Leere und der Lauf waere
      // rennabhaengig gruen.
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(E2E_PORTS.clamd),
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
       *
       * ⛔ `scripts/seed-lokal.ts radio` DANEBEN, UND DAS SCHLIESST ⬜ V13-L2 (Aufgabe V23,
       * `.superpowers/sdd/planteil4/progress.md`, Zeile „V14-L3"). Aus demselben Grund wie bei
       * `aufgaben`: `radio` steht in `MODULE_MIGRATIONS` ohne Eintrag in `seedAllModules()`
       * (`src/core/bootstrap.ts:49-56`), der Boot-Pfad legt also kein einziges Geraet an. Ohne
       * diese Zeile faende `e2e/radio-verwaltung.spec.ts` keine Tabellenzeile, und die Faelle 2
       * bis 4 fielen an ihrer eigenen Vorbedingung — nicht an der Flaeche, die sie messen.
       *
       * ⚠️ DER SEED LEGT EINE EINLOESBARE ZUGANGSZEILE AN (`zc-1`,
       * `src/app/m/radio/_lib/seedLokal.ts:19-21`). Das ist HIER unbedenklich und anderswo
       * nicht: diese Zeile steht in der Playwright-Konfiguration, nicht am Boot-Pfad. Die
       * Auflage jenes Kopfkommentars („wer `radio` in `seedAllModules()` eintraegt … MUSS `zc-1`
       * entfernen") und ihr Waechter (`scripts/seed-lokal.test.ts:56`, er liest ausschliesslich
       * `src/core/bootstrap.ts` und `src/instrumentation.ts` — am 2026-08-26 nachgelesen) zielen
       * beide auf den Boot, den `SUITE_SEED=1` in der Generalprobe wahr macht. Ein
       * `pnpm exec tsx`-Aufruf vor `next dev` erreicht ihn nicht.
       */
      /*
       * `scripts/seed-lokal.ts uav` NACH `radio` (Task 21): dasselbe Muster wie
       * `aufgaben`/`radio` oben — `uav` steht in `MODULE_MIGRATIONS` ohne
       * Eintrag in `seedAllModules()` (`_lib/seedLokal.ts`s Kopfkommentar:
       * ein geseedeter Teilnehmer-Code waere am Boot-Pfad ein gueltiger
       * anonymer Zugang, `SUITE_SEED=1` ist der Generalproben-Schalter). Ohne
       * diese Zeile faende `e2e/uav.spec.ts` weder die Codes `E2ETEST1`/
       * `E2EGESP2` noch die drei Aufgaben (`1-1`/`1-2`/`2-1`) noch die zwei
       * vorbelegten Durchfuehrungen zu `1-1` — die Grundlage des
       * Offline-Sync-Checks (Aufgabe 21, Check 7: „anzahl 1-1 ist 1 mehr als
       * die 2 aus dem Seed").
       */
      command:
        `rm -rf ./.data/e2e && pnpm exec tsx e2e/seed-lagerbuch.ts && pnpm exec tsx scripts/seed-lokal.ts aufgaben && pnpm exec tsx scripts/seed-lokal.ts radio && pnpm exec tsx scripts/seed-lokal.ts uav && ${nextServerBefehl(E2E_PORTS.web)}`,
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
      url: `http://feedback.localtest.me:${E2E_PORTS.web}/login`,
      reuseExistingServer: false,
      // 120 s waren fuer `/api/health` bemessen; die Anmeldeseite kalt zu
      // uebersetzen kostet auf einem CI-Runner ein Vielfaches der lokal
      // gemessenen 7,4 s.
      timeout: 180_000,
      env: {
        AUTH_SECRET: "test-secret",
        AUTH_DEV_LOGIN: "true",
        ADMIN_GROUP: "dashboard-admins",
        SUITE_ADMIN_GROUP_PORTAL: "portal-only-admin",
        AUTH_COOKIE_DOMAIN: ".localtest.me",
        DATA_DIR: "./.data/e2e",
        PORT: String(E2E_PORTS.web),
        NODE_ENV: "development", ...VORGEBAUT_ENV, // DRK-415: `e2e/helpers/server.ts`
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
        FILES_AV_PORT: String(E2E_PORTS.clamd),
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
        AUFGABEN_AV_PORT: String(E2E_PORTS.clamd),
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
        /*
         * KEIN PERSONENVERZEICHNIS IN E2E — und das ist eine Angleichung an die
         * CI, keine Einschraenkung.
         *
         * `core/directory` (Pocket ID `GET /api/users`) haengt an
         * `POCKET_ID_API_URL`/`POCKET_ID_API_KEY`. In der CI ist BEIDES nicht
         * gesetzt (kein `POCKET_ID_*` in `.github/workflows/`), lokal setzt
         * `.env.local` sie auf den ECHTEN Identitaetsanbieter — und `next dev`
         * laeuft im Repo-Wurzelverzeichnis und liest diese Datei mit. Bis zum
         * Verzeichnis-Autofill (2026-08-15) war das folgenlos; seither
         * entscheidet der Key, WELCHES Eingabefeld `/personen` fuer die
         * Personenanlage rendert (`isDirectoryConfigured` →
         * `_ui/PersonenFormular.tsx`). Ohne diese Zeile liefe derselbe Test
         * lokal durch den Such- und in der CI durch den Textfeld-Zweig, und die
         * Suite haenge lokal zusaetzlich an der Erreichbarkeit von id.iuk-ue.de
         * — ein Netzaufruf pro Anschlag, aus einem Testlauf heraus. Genau die
         * Bauform, die der Absatz unter `...AUFGABEN_ENV` schon fuer die
         * Gruppennamen beschreibt: nicht rot, sondern rennabhaengig gruen.
         *
         * ⚠️ EIN LEERER WERT REICHT: `isDirectoryConfigured` und
         * `createDirectory` verlangen BEIDE einen nichtleeren Key
         * (`apiKey.trim() !== ""`). Die URL darf stehen bleiben — sie faellt
         * ohnehin auf `POCKET_ID_ISSUER` zurueck, den die Dev-Anmeldung braucht.
         *
         * Der Suchzweig ist damit e2e-seitig NICHT gedeckt; er haengt an
         * `_ui/PersonenFormular.test.tsx` und `actions.test.ts`. Ein echter
         * Abruf gegen ein FREMDES System waere dafuer der falsche Beweis.
         */
        POCKET_ID_API_KEY: "",
        /*
         * KEIN RÜCKMELDEKNOPF IN E2E — dieselbe Bauform wie
         * `POCKET_ID_API_KEY` darüber, und aus einem verwandten Grund.
         *
         * Die CI setzt `SUITE_RUECKMELDUNG_URL` nicht; eine `.env.local` in
         * einer Arbeitskopie sehr wohl, und `next dev` läuft im
         * Repo-Wurzelverzeichnis und liest sie mit. Ohne diese Zeile liefe
         * derselbe Lauf lokal durch den eingebundenen und in der CI durch den
         * leeren Zweig.
         *
         * ⚠️ UND DAS IST HIER TEURER ALS EIN ABWEICHENDER ZWEIG: der schwebende
         * Knopf liegt als eigene Ebene unten rechts über der Fläche, auf der
         * die Greifer arbeiten — und er verschwindet nach dem ersten Klick,
         * steht in einem Lauf also mal da und mal nicht. Das macht einen Lauf
         * nicht rot, sondern RENNABHÄNGIG rot, und der Fehlschlag meldet sich
         * als etwas ganz anderes (dieselbe Klasse wie Falle 10 und 12 in
         * `CLAUDE.md`).
         *
         * ⚠️ EIN LEERER WERT REICHT, und das ist bewusst so gebaut:
         * `rueckmeldungUrl()` liest den Wert `trim()`-bereinigt und behandelt
         * die leere Zeichenkette wie „nicht gesetzt" — wortlos, ohne Warnung.
         * Wer den Knopf in einem Spec BRAUCHT, setzt die Variable im eigenen
         * Profil; das ist heute keines.
         */
        SUITE_RUECKMELDUNG_URL: "",
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
        /*
         * Die zwei radio-Gruppenzeilen, aus derselben Quelle wie die
         * `devLogin(…, { groups })` der radio-Specs (`e2e/helpers/radio.ts`).
         *
         * ⛔ OHNE `SUITE_UPDATER_GROUP_RADIO` IST DIE UPDATER-STUFE IM LAUF FUER
         * JEDE IDENTITAET ZU — ein leerer oder fehlender Wert SCHLIESST sie
         * (`src/app/m/radio/_lib/zugang.ts:225-227`). Die zwei Wirkproben der
         * zweiten Rechtestufe in Aufgabe V23 bekaemen ihren 404 dann aus dem
         * falschen Grund. Gemessener Befund:
         * `.superpowers/sdd/planteil4/VORABSCAN.md`, Fund F24.
         */
        ...RADIO_ENV,
        /*
         * Die uav-Zeilen (`SUITE_ADMIN_GROUP_UAV`, `UAV_SW_MODUS`), aus
         * derselben Quelle wie `devLogin(…, { groups })` in `e2e/uav.spec.ts`
         * (`e2e/helpers/uav.ts`) — dieselbe Bauform wie `...RADIO_ENV` darueber.
         */
        ...UAV_ENV,
      },
    },
  ],

  /*
   * IN DER CI `list` STATT DER VORGABE `dot` — und das ist keine Geschmacksfrage,
   * sondern die Voraussetzung dafuer, die Gruppen in `e2e/gruppen.json` nach
   * LAUFZEIT schneiden zu koennen statt nach Fallzahl.
   *
   * Playwright waehlt auf `CI` von sich aus `dot`: ein Punkt je Fall, am Ende
   * eine Summe. Damit steht im Protokoll, WIE LANGE eine Gruppe lief, aber
   * nirgends, WELCHE Datei die Zeit verbraucht hat. DRK-407 hat die
   * lagerbuch-Gruppen deshalb nach Fallzahl balanciert (66/66/64) — das einzige
   * Mass, das ein Punkt hergibt — und das Ergebnis war 4:42 / 8:15 / 4:59:
   * 75 % Spreizung bei gleicher Fallzahl. Fallzahl ist kein Mass fuer Laufzeit.
   *
   * ⚠️ LOKAL ZU MESSEN IST KEIN ERSATZ, und der Versuch kostet einen halben Tag:
   * die Suite faehrt gegen `next dev` auf kaltem `.next` (Kopfkommentar am
   * `timeout` oben) — auf einer kleineren Maschine laufen die Anmeldungen in
   * ihre Grenze, und was dann als „Laufzeit" in der Auswertung steht, ist
   * Ausfallzeit. Gemessen in einem 4-Kern-Container: 10 von 11 fertigen Faellen
   * rot mit `page.waitForURL: Timeout 45000ms`. Die belastbaren Zahlen stehen
   * dort, wo die Suite ohnehin taeglich laeuft.
   *
   * Der Preis ist eine Zeile Protokoll je Fall statt eines Punktes — bei der
   * groessten Gruppe rund 190 Zeilen. Dafuer traegt jeder gruene Lauf die Zahlen
   * fuer den naechsten Schnitt, ohne dass jemand eigens dafuer einen Lauf
   * anstossen muss.
   */
  reporter: process.env.CI ? "list" : undefined,
}));

/*
 * DIE MELDUNG, DIE PLAYWRIGHT SELBST NICHT GIBT (DRK-346). Sein „is already
 * used" nennt weder Prozess noch Arbeitsverzeichnis und liest sich wie ein
 * eigener verwaister Rest — so wurden fremde Läufe beendet.
 */
pruefePortsFrei([E2E_PORTS.clamd, E2E_PORTS.web]);
