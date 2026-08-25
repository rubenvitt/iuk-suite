import { describe, it, expect, afterEach } from "vitest";
import konfigImport from "../../../../../playwright.config";
import {
  RADIO_ADMIN_GRUPPE,
  RADIO_ENV,
  RADIO_HOST,
  RADIO_UPDATER_GRUPPE,
  radioUrl,
} from "../../../../../e2e/helpers/radio";
import { istRadioAdmin, updaterGruppe, istInUpdaterGruppe } from "./zugang";

/**
 * DIE ZWEI ENV-ZEILEN DES E2E-SERVERS, GEGEN DAS MODUL GEKOPPELT.
 *
 * ⛔ WARUM ES DIESE DATEI GIBT, UND SIE IST DIE ANTWORT AUF EINEN BAU-ANHALTENDEN FUND.
 * `.superpowers/sdd/planteil4/VORABSCAN.md`, Fund **F24**: `playwright.config.ts`s
 * `webServer.env` kannte `SUITE_UPDATER_GROUP_RADIO` nicht — und ein FEHLENDER Wert
 * SCHLIESST die Updater-Stufe (`_lib/zugang.ts:225-227`, `.env.example:107-110`). Die zwei
 * Wirkproben der zweiten Rechtestufe in Aufgabe V23 bekaemen ihren 404 damit aus dem
 * FALSCHEN Grund und bewiesen das Falsche — zeichengleich die Klasse, vor der
 * `e2e/lagerbuch-hosts.spec.ts:145-149` warnt („sonst waere der 404 der GRUPPENRIEGEL und
 * nicht der HOSTRIEGEL").
 *
 * ⛔ EIN `Record<string, string>` TRAEGT KEINE ZUSAGE. TypeScript prueft daran weder Namen
 * noch Wert; ein Tippfehler (`SUITE_UPDATER_GROUPE_RADIO`) waere gueltiges TypeScript, das
 * Modul fiele auf „Stufe geschlossen" zurueck, und KEIN Lauf wuerde rot — er waere
 * gegenteilig gruen. Dieselbe Begruendung fuehrt `lagerbuch/_lib/e2eEnv.test.ts:10-26`.
 *
 * ⚠️ DIESE DATEI LIEGT UNTER `src/`, NICHT UNTER `e2e/`: `vitest.config.ts` schliesst
 * `e2e/**` aus (dort liegen die Playwright-Specs), ein Test dort liefe nie. Vorbild:
 * `lagerbuch/_lib/e2eEnv.test.ts:33-37` und `files/_lib/devAufbau.test.ts:5`.
 *
 * ⚠️ WAS SIE NICHT BELEGT: dass die Stufe im echten Abruf greift. Das ist ⬜ V-L3 und wird
 * in Aufgabe V23 abgelesen.
 */

const VORHER = process.env.SUITE_UPDATER_GROUP_RADIO;
/*
 * ⛔ AUCH DIE ADMIN-VARIABLE WIRD GESICHERT, und das ist keine Symmetrie um ihrer selbst
 * willen: der Fall unten LOESCHT sie, um die Registry-Vorgabe zu erzwingen. Ein
 * durchgelassenes `delete` traefe jede weitere Testdatei im selben Worker-Prozess und
 * meldete sich als „neuer Fehlschlag" ganz woanders.
 */
const VORHER_ADMIN = process.env.SUITE_ADMIN_GROUP_RADIO;

afterEach(() => {
  if (VORHER === undefined) delete process.env.SUITE_UPDATER_GROUP_RADIO;
  else process.env.SUITE_UPDATER_GROUP_RADIO = VORHER;
  if (VORHER_ADMIN === undefined) delete process.env.SUITE_ADMIN_GROUP_RADIO;
  else process.env.SUITE_ADMIN_GROUP_RADIO = VORHER_ADMIN;
});

/** Der `next dev`-Eintrag aus `playwright.config.ts` (Vorbild `files/_lib/devAufbau.test.ts:68-84`). */
function nextEintrag(): { command: string; env?: Record<string, string> } {
  const ws = konfigImport.webServer;
  if (!Array.isArray(ws)) throw new Error("playwright.config.ts: webServer ist kein Array");
  const treffer = (ws as { command: string; env?: Record<string, string> }[]).filter((e) =>
    e.command.includes("next dev"),
  );
  expect(treffer, 'genau ein webServer-Eintrag mit "next dev"').toHaveLength(1);
  return treffer[0];
}

describe("RADIO_ENV — die zwei Gruppenzeilen des E2E-Servers", () => {
  it("traegt beide Namen mit ihren Konstanten und keinen dritten", () => {
    expect(RADIO_ENV).toEqual({
      SUITE_ADMIN_GROUP_RADIO: RADIO_ADMIN_GRUPPE,
      SUITE_UPDATER_GROUP_RADIO: RADIO_UPDATER_GRUPPE,
    });
  });

  it("setzt einen NICHT-LEEREN Updater-Wert — leer schliesst die Stufe", () => {
    /*
     * ⛔ DIE PROBE GEGEN DEN NAHELIEGENDEN „GRUEN-FIX": wer den Wert spaeter auf `""`
     * setzt, um „nichts zu erfinden", schliesst die Stufe fuer jede Identitaet des Laufs —
     * und die zwei Wirkproben aus V23 bezeugten danach etwas anderes, als sie behaupten
     * (`_lib/zugang.ts:225-227`).
     */
    expect(RADIO_ENV.SUITE_UPDATER_GROUP_RADIO.trim()).not.toBe("");
  });

  it("nennt den Namen, den der Riegel wirklich liest — ein Tippfehler faellt hier auf", () => {
    /*
     * ⛔ DIE KOPPLUNG AN DEN LESER, nicht an eine zweite Namensliste. `updaterGruppe()`
     * liest `process.env.SUITE_UPDATER_GROUP_RADIO` (`_lib/zugang.ts:225-227`); ein
     * verschriebener Schluessel in `RADIO_ENV` liesse sie hier `null` liefern.
     */
    process.env.SUITE_UPDATER_GROUP_RADIO = RADIO_ENV.SUITE_UPDATER_GROUP_RADIO;
    expect(updaterGruppe()).toBe(RADIO_UPDATER_GRUPPE);
    expect(istInUpdaterGruppe([RADIO_UPDATER_GRUPPE])).toBe(true);
  });

  it("nennt auch fuer die ADMIN-Stufe die Gruppe, die der Riegel wirklich akzeptiert", () => {
    /*
     * ⛔ DIE ASYMMETRIE, DIE HIER GESCHLOSSEN WIRD (Aussenpruefung zu V12, Fund F3): der Fall
     * oben koppelt den UPDATER-Namen an seinen Leser, der erste Fall dieser Datei vergleicht
     * `RADIO_ENV` dagegen nur mit DENSELBEN Konstanten, aus denen es gebaut ist — er faengt
     * einen Schluesseltippfehler, aber keinen falschen WERT. Gemessen: `RADIO_ADMIN_GRUPPE`
     * auf `"iuk-radio-admins"` verdreht liess alle 57 Testdateien gruen.
     *
     * ⛔ OHNE `SUITE_ADMIN_GROUP_RADIO` GEMESSEN, UND DAS IST DIE GANZE SCHAERFE. Mit gesetzter
     * Variable stuenden beide Seiten des Vergleichs auf derselben Konstante und wanderten
     * gemeinsam — genau die Tautologie, gegen die dieser Fall steht. Geloescht faellt
     * `adminGroupsFor` auf die Registry-Vorgabe zurueck (`src/core/registry.ts:198`, gelesen
     * ueber `_lib/zugang.ts:188-192`), und die ist der Wert, den der E2E-Lauf auch dann
     * traegt, wenn `RADIO_ENV` ihn spiegelt.
     *
     * ⚠️ WAS ER NICHT BELEGT: dass der Riegel im echten Abruf 404 liefert. Das ist ⬜ V-L3
     * und gehoert V23; hier steht nur das Praedikat.
     */
    delete process.env.SUITE_ADMIN_GROUP_RADIO;
    const person = (gruppen: string[]) => ({ sub: "pid-1", name: "Testperson", groups: gruppen });
    expect(istRadioAdmin(person([RADIO_ADMIN_GRUPPE]))).toBe(true);
    expect(istRadioAdmin(person(["iuk-irgendetwas-anderes"]))).toBe(false);
  });
});

describe("playwright.config.ts — der radio-Teil (Vorabscan-Fund F24)", () => {
  it("reicht BEIDE Gruppenzeilen an den next-dev-Server durch", () => {
    /*
     * ⛔ DIE EIGENTLICHE ZUSAGE DIESER DATEI: `RADIO_ENV` zu haben genuegt nicht, es muss
     * auch eingespreizt sein. Ohne `...RADIO_ENV` in `webServer.env` waere jede Zusicherung
     * darueber wahr und der Serverprozess kennte die Variablen trotzdem nicht.
     */
    const env = nextEintrag().env ?? {};
    for (const [name, wert] of Object.entries(RADIO_ENV)) {
      expect(env, `webServer.env kennt ${name} nicht`).toHaveProperty(name);
      expect(env[name], `${name} in webServer.env`).toBe(wert);
    }
  });

  it("faehrt die radio-Faelle ueber eine ABSOLUTE URL auf den Modul-Host", () => {
    /*
     * ⛔ `baseURL` ZEIGT AUF DEN PORTAL-HOST (`playwright.config.ts:65`), und `portal`
     * traegt `requiresAuth: true` — ein RELATIVER Aufruf landete im Login statt auf
     * `/admin`, und der Fall bezeugte den Login. ⬜ V-L4 ist deshalb gestrichen: es braucht
     * keinen zweiten `baseURL`, sondern die absolute Form (`e2e/helpers/lagerbuch.ts:86-91`).
     */
    expect(konfigImport.use?.baseURL).not.toContain(RADIO_HOST);
    expect(radioUrl("/admin")).toBe(`http://${RADIO_HOST}:3100/admin`);
  });
});
