import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { devLogin } from "./fixtures";
import {
  E2E_TOKEN_GERAETE,
  FREMDER_HOST,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  fremdUrl,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * FALLE 61 — UND SIE HAT HIER EINE DATENWIRKUNG (Spec §2.6, §12.2, §3.8.3).
 *
 * `decideRoute` gatet interne `/m/<key>`-Pfade nach dem MODUL AUS DEM SEGMENT,
 * nicht nach dem Host (`core/routing.ts:58-66`): `if (!target) return { action:
 * "next" }`, dann `canAccess(target, groups)` — und `canAccess` steigt fuer ein
 * Modul mit `requiresAuth: false` SOFORT mit `true` aus (`core/registry.ts:186`,
 * `if (!mod.requiresAuth) return true;`). Der Zweig endet bei `{ action: "next"
 * }`, GLEICHGUELTIG, welcher Host gefragt hat. `src/proxy.ts:103` nimmt `/m/*`
 * bewusst nicht aus dem Matcher; das waere ein Auth-Bypass.
 *
 * lagerbuch traegt `requiresAuth: false` (`core/registry.ts:119`) — Folge: JEDER
 * Host, der auf den Suite-Container terminiert, beantwortet
 * `/m/lagerbuch/t/<code>`, `/m/lagerbuch/g/<code>`, `/m/lagerbuch/helfer/*` und
 * `/m/lagerbuch/verwaltung/*`, WENN das Modul seinen eigenen Riegel nicht traegt.
 * lagerbuch ist das ERSTE Modul, bei dem diese Klasse eine DATENWIRKUNG hat statt
 * einer kosmetischen (§1.5, Punkt 3): `redeemToken` schreibt `lastUsedAt` VOR
 * dem Redirect, und ein verbrauchter Code ist nicht mehr loeschbar, nur noch
 * sperrbar (8-F).
 *
 * KEIN GATE SIEHT DAS: `core/routing.test.ts:61-65` prueft AUSDRUECKLICH, dass
 * interne Pfade nach dem Segment gegatet werden — das Verhalten ist nicht bloss
 * ungetestet, es ist FESTGESCHRIEBEN. `typecheck`, `lint` und `pnpm build` sehen
 * nichts, und Playwright faehrt sonst gegen genau EINEN `baseURL`.
 *
 * EINE SCHLEIFE, KEINE ZWEI STICHPROBEN (§12.2): Route Handler haben KEIN
 * Layout (`src/app/m/lagerbuch/_lib/host.ts:59-73` listet jede Aufrufstelle
 * namentlich). Ohne die Schleife bliebe die Mutation „den Host-Abgleich in
 * `/t/[code]` weglassen" gruen, und `/m/lagerbuch/t/<code>` verbrauchte Codes
 * von JEDEM terminierenden Host aus.
 *
 * Host, Admin-Gruppe, Port und URLs kommen ausschliesslich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — KEIN Literal wie
 * `"http://lagerbuch.localtest.me:3100"` oder `["lagerbuch_nutzer"]`. Der fremde
 * Host ist `FREMDER_HOST` (`feedback.localtest.me`) — er ist die schaerfere
 * Probe, weil `moduleForHost` dort tatsaechlich ein Modul liefert (Festlegung
 * H8): der 404 unten kommt nachweislich aus `istLagerbuchHost`, nicht aus einem
 * unaufgeloesten Host.
 */

/**
 * ⚠️ DER PFAD KOMMT NICHT AUS `moduleDbPath()`. `DATA_DIR=./.data/e2e` steht nur
 * in `playwright.config.ts`s `webServer.env` — das erreicht ausschliesslich den
 * SERVERprozess. Im Testprozess ist die Variable nicht gesetzt, `moduleDbPath`
 * liefe also auf `./.data/lagerbuch.db` und laese eine andere Datei als die, in
 * die der Server schreibt (dieselbe Begruendung wie in `e2e/files-hosts.spec.ts`).
 */
const DB_PFAD = "./.data/e2e/lagerbuch.db";

/** Eine frische, schreibgeschuetzte Verbindung je Aufruf — die Zeile wird VOR
 *  und NACH dem fremden Zugriff gelesen, und ein wiederverwendetes Handle
 *  koennte eine gepufferte (veraltete) Sicht zeigen. */
function tokenZeile(code: string): { aktiv: number; last_used_at: number | null } {
  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — laeuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    const zeile = db.prepare("select aktiv, last_used_at from tokens where code = ?").get(code) as
      | { aktiv: number; last_used_at: number | null }
      | undefined;
    expect(zeile, `der Seed muss ${code} fuehren`).toBeTruthy();
    return zeile!;
  } finally {
    db.close();
  }
}

/** Jeder Einstieg des Moduls, in INNERER Pfadform — so, wie ein fremder Host ihn
 *  erreichen wuerde. Je ein Vertreter pro Ast (Gate, Helfer, Deep-Links,
 *  Verwaltung-(arbeit), Verwaltung-(druck)) plus ALLE fuenf PWA-Route-Handler
 *  und `/abmelden` — Route Handler haben kein Layout und muessen deshalb
 *  EINZELN stehen (`_lib/hostRiegel.ts`). `/t/[code]` steht NICHT hier, weil er
 *  seinen eigenen Test unten hat: er ist die Zeile mit der Datenwirkung und
 *  verdient eine eigene, unmaskierte Zusicherung statt eines Listeneintrags.
 */
const EINSTIEGE = [
  "/m/lagerbuch",
  "/m/lagerbuch/helfer",
  "/m/lagerbuch/helfer/check",
  "/m/lagerbuch/a/V1StGXR8_Z5jdHi6B-myT",
  "/m/lagerbuch/g/4012345678901",
  "/m/lagerbuch/verwaltung",
  "/m/lagerbuch/verwaltung/artikel",
  "/m/lagerbuch/verwaltung/etiketten",
  "/m/lagerbuch/verwaltung/tokens",
  "/m/lagerbuch/abmelden",
  "/m/lagerbuch/manifest.webmanifest",
  "/m/lagerbuch/pwa-icon.svg",
  "/m/lagerbuch/icon-192.png",
  "/m/lagerbuch/icon-512.png",
  "/m/lagerbuch/icon-maskable-512.png",
];

test.describe("Host-Riegel", () => {
  // DIE ZAHL IST DIE ZUSAGE, nicht die Anwesenheit der Schleife: eine
  // gestrichene Zeile schrumpfte den Lauf sonst STILL, und „vierzehn von
  // fuenfzehn gesperrt" saehe in der Ausgabe genauso gruen aus wie fuenfzehn.
  // ⚠️ Deckt NICHT jeden Tippfehler in einem Pfad — die Laenge haelt bei einer
  // GEAENDERTEN Zeile. Ein grosser Teil davon ist ueber die Eigen-Host-Haelfte
  // der Schleife unten trotzdem abgesichert: ein verschriebener, nicht
  // existierender Pfad waere dort ebenfalls 404 und liesse GENAU DIESEN
  // Eintrag fehlschlagen.
  test("traegt alle fuenfzehn Einstiege", () => {
    expect(EINSTIEGE).toHaveLength(15);
  });

  /*
   * STATUS, UMWEG UND EIGEN-HOST-NICHT-404 IN DERSELBEN SCHLEIFE, JE EINTRAG —
   * genau wie im Vorbild `e2e/files-hosts.spec.ts:413/423/437`. Eine fruehere
   * Fassung hatte die Eigen-Host-Gegenprobe in einem separaten Test mit nur
   * drei von fuenfzehn Vertretern; fuer die uebrigen zwoelf (u. a.
   * `/helfer/check`, `/a/[id]`, `/g/[code]`, `/abmelden`, die vier
   * Icon-Handler) fehlte damit der Nachweis, dass die Route auf dem EIGENEN
   * Host ueberhaupt lebt — die Umweg-Pruefung allein unterscheidet „404 weil
   * der Riegel griff" nicht von „404 weil an der Adresse gar nichts liegt".
   * (Review-Befund 1.)
   *
   * `page.request`, NICHT `page.goto`, fuer BEIDE Seiten: `page.request` traegt
   * denselben Cookie-Kontext wie `page`, liefert den Statuscode direkt und
   * loest — anders als eine echte Navigation — bei einem nicht-HTML
   * `Content-Type` (z. B. `application/manifest+json`,
   * `manifest.webmanifest/route.ts:83-85`) kein `net::ERR_ABORTED` aus. Damit
   * braucht `/manifest.webmanifest` keine Sonderbehandlung mehr — derselbe
   * Codepfad gilt fuer alle fuenfzehn Eintraege.
   */
  for (const pfad of EINSTIEGE) {
    test(`${pfad} antwortet auf einem fremden Suite-Host mit 404 — und auf dem eigenen nicht`, async ({
      page,
    }) => {
      // Angemeldet MIT Lagerbuch-Gruppe: sonst waere der 404 der GRUPPENRIEGEL
      // und nicht der HOSTRIEGEL, und der Test bewiese das Falsche (§11.5
      // Zustand 19 saehe hier identisch aus). AUTH_COOKIE_DOMAIN=".localtest.me"
      // traegt die Sitzung von LAGERBUCH_HOST auf FREMDER_HOST mit.
      await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

      const fremd = await page.request.get(fremdUrl(pfad));
      expect(fremd.status(), `${pfad} auf ${FREMDER_HOST}`).toBe(404);
      /*
       * KEIN UMWEG. `/abmelden` antwortet auch OHNE Host-Riegel mit einem
       * relativen 303 nach "/" — und eine folgende Anfrage landet auf
       * FREMDER_HOSTs eigener Wurzel und trifft dort ZUFAELLIG ebenfalls einen
       * 404. Ohne diese Zeile bewiese der Test dann etwas anderes als den
       * Host-Riegel: gemessen bei einer probehalber deaktivierten
       * `lagerbuchHostOderNull` (Gegenprobe, nicht committet) blieb GENAU
       * dieser Fall gruen, waehrend alle anderen vierzehn korrekt rot wurden.
       * Der Abgleich der finalen URL schliesst das aus: die Antwort ohne Riegel
       * ist entweder ein direkter 200/303-Erfolg (falsche URL) oder ein 404 auf
       * einer ANDEREN Adresse — nie derselbe Pfad mit derselben Wirkung wie der
       * echte Host-404. Ein relativer Redirect kann konstruktiv nicht auf
       * denselben Pfad zurueckfallen, den er verlassen hat.
       */
      expect(new URL(fremd.url()).pathname, `${pfad}: Umweg statt 404`).toBe(pfad);

      /*
       * DIE GEGENRICHTUNG, JETZT PRO EINTRAG. Ohne sie bewiese der Fall oben
       * nur, dass IRGENDETWAS 404 gibt — ein falsch geschriebener Pfad, eine
       * umbenannte Route, ein Modul, das gar nicht aufgeloest wird. Erst „auf
       * dem EIGENEN Host ist es KEIN 404" macht aus dem 404 eine Aussage ueber
       * den HOST statt ueber die Existenz der Route.
       */
      const eigen = await page.request.get(lagerbuchUrl(pfad));
      expect(eigen.status(), `${pfad} auf ${LAGERBUCH_HOST}`).not.toBe(404);
    });
  }

  /**
   * DIE ZEILE, DIE FALLE 61 BEZAHLT: nach dem Versuch von einem fremden Host ist
   * `tokens.last_used_at` NACHWEISLICH unveraendert NULL. Ein 404 allein sagte
   * nichts darueber, ob der Code vorher schon verbraucht wurde — der Riegel muss
   * VOR jeder Wirkung greifen, denn `redeemToken` schreibt `lastUsedAt` VOR dem
   * Redirect (`t/[code]/route.ts:38` steht VOR jeder anderen Anweisung).
   *
   * `E2E_TOKEN_GERAETE`, NICHT `select ... limit 1` (Ruling A9): ein `limit 1`
   * ohne `order by` erwischt einen BELIEBIGEN der drei bewusst getrennten
   * Seed-Codes — genau die Reihenfolgekopplung, die der Global Constraint „kein
   * `.first()`, keine Zusicherung an der Reihenfolge fruehererer Specs" verbietet.
   * `E2E_TOKEN_HELFER` bleibt bewusst aussen vor: A9 reserviert ihn namentlich
   * fuer T171s echten Einloese-Lauf. `E2E_TOKEN_GERAETE` traegt heute (Welle 5)
   * keine eigene Einloese-Zeile in irgendeiner E2E-Datei.
   *
   * ⚠️ DIESER TEST LOEST DEN CODE AM ENDE AUF DEM EIGENEN HOST WIRKLICH EIN
   * (siehe unten) — `E2E_TOKEN_GERAETE` traegt danach fuer den Rest des Laufs
   * ein gesetztes `last_used_at`. Das ist FOLGENLOS fuer jeden kuenftigen
   * Konsumenten: das Schema fuehrt das Feld als „reines Anzeigefeld, OHNE
   * Einfluss auf Gueltigkeit" (`_db/schema.ts:412-413`), ein Code bleibt nach
   * der Einloesung einloesbar. Ein kuenftiger Test, der `last_used_at IS NULL`
   * als eigene Vorbedingung braucht, darf `E2E_TOKEN_GERAETE` dafuer trotzdem
   * nicht mehr verwenden — das steht im Abgaberbericht (T169) vermerkt.
   *
   * DIE ZUSICHERUNGEN SIND DIFFERENZIELL, NICHT ABSOLUT (Review-Befund 2): der
   * Test vergleicht `last_used_at` VOR und NACH gegen SEINEN EIGENEN
   * Ausgangswert `vorFremd.last_used_at` — nicht gegen `NULL`. Ein Vergleich
   * gegen `NULL` haengt am SEED-Zustand statt am Test selbst: „in welchem
   * falschen Zustand waere das auch gruen?" — wenn der Code schon vorher
   * eingeloest war (etwa aus einem frueheren Lauf derselben Datei ohne
   * Reseed, oder unter `--repeat-each`/`retries`). `redeemToken` schreibt bei
   * JEDEM Erfolg einen NEUEN `new Date()`-Wert (`tokenEinloesung.ts:70`), auch
   * wenn `last_used_at` schon gesetzt war — die Differenz bleibt damit auch
   * bei wiederholten Laeufen ein gueltiger Diskriminator, und der Test
   * uebersteht einen Wiederholungslauf.
   */
  test("verbraucht einen Code vom fremden Host aus nicht — bleibt auf dem eigenen einloesbar", async ({
    page,
  }) => {
    const vorFremd = tokenZeile(E2E_TOKEN_GERAETE);
    expect(vorFremd.aktiv, "der Seed-Code muss aktiv sein").toBe(1);

    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

    const fremdAntwort = await page.goto(fremdUrl(`/m/lagerbuch/t/${E2E_TOKEN_GERAETE}`));
    expect(fremdAntwort!.status(), `/t/${E2E_TOKEN_GERAETE} auf ${FREMDER_HOST}`).toBe(404);

    const nachFremd = tokenZeile(E2E_TOKEN_GERAETE);
    expect(nachFremd.last_used_at, "der Riegel muss VOR jeder Wirkung greifen").toBe(
      vorFremd.last_used_at,
    );

    /*
     * DIE STAERKERE HAELFTE, und ohne sie waere der 404 oben aus dem FALSCHEN
     * Grund nicht vom 404 aus dem RICHTIGEN Grund zu unterscheiden: eine
     * geloeschte Route, ein abgelehntes Codeformat oder ein toter Seed lieferten
     * ebenfalls 404 mit unveraendertem `last_used_at` — und saehen hier genauso
     * gruen aus. Erst der ECHTE Erfolg auf dem EIGENEN Host mit DEMSELBEN Code
     * beweist, dass die Route lebt und der Code einloesbar WAR — und macht den
     * 404 oben zu einer Aussage ueber den HOST, nicht ueber die Route oder den
     * Code.
     */
    const eigenAntwort = await page.goto(lagerbuchUrl(`/m/lagerbuch/t/${E2E_TOKEN_GERAETE}`));
    expect(eigenAntwort!.status(), `/t/${E2E_TOKEN_GERAETE} auf ${LAGERBUCH_HOST}`).not.toBe(404);

    const nachEigen = tokenZeile(E2E_TOKEN_GERAETE);
    expect(nachEigen.last_used_at, "auf dem EIGENEN Host wird eingeloest").not.toBe(
      vorFremd.last_used_at,
    );
  });

  /**
   * §11.5, ZUSTAND 19: angemeldet, aber ohne Lagerbuch-Gruppe → 404 auf dem
   * EIGENEN Host, und zwar der DERSELBE 404-Text wie die Nicht-Existenz einer
   * Seite. Bewusst 404 und nicht 403: „ein 403 verriete, dass es die
   * Admin-Route gibt" (`_lib/zugang.ts`, `requireLagerbuchAdmin`).
   *
   * `groups: ""`, NICHT `groups: []` — `devLogin`s Signatur nimmt einen STRING
   * (`e2e/fixtures.ts:3-7`, Ruling A9): der Plantext ist an dieser Stelle
   * `tsc`-falsch.
   */
  test("gibt einem Konto ohne Lagerbuch-Gruppe 404 statt 403", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: "" });
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(antwort!.status()).toBe(404);
    // Der VOLLE Text der Suite-404 (`src/app/not-found.tsx`), nicht nur ein
    // Teilstring: eine Zusicherung, die nur ein Praefix prueft, bestuende auch
    // im Fehlerzustand (dritte Lehre aus T167/T168).
    await expect(
      page.getByRole("heading", { name: "Diese Seite gibt es hier nicht." }),
    ).toBeVisible();
  });
});
