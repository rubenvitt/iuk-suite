import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";
import { users } from "../_db/schema";

/**
 * ZWEI EBENEN IN EINER DATEI, UND DIE ZWEITE KAM MIT PLANTEIL 4 (Aufgabe V3).
 *
 * 1. DIE REINEN FUNKTIONEN — ohne jeden Mock (Spec:650). Sie stehen unveraendert unten.
 * 2. ⛔ DIE VERHALTENSFAELLE DER WERFENDEN RIEGEL. Bis Planteil 3 waren sie hier
 *    ABSICHTLICH ausgelassen, weil es keine Verwaltungsseite gab; `riegel.test.ts:615-617`
 *    benennt Planteil 4 woertlich als ihren Ort („dort, wo die erste Verwaltungsseite steht
 *    und der Next-Anfragekontext echt ist") und verweist auf das Vorbild
 *    `src/app/m/lagerbuch/_lib/zugang.test.ts:41` (Import), `:72` (Aufruf), Begruendung
 *    `:60-71`.
 *
 * `viewerOderNull` bleibt ungeprueft: ihre einzige Aussage ist eine ABWESENHEIT
 * (kein Host-Riegel), und die haelt `riegel.test.ts` Klausel (d) als Quelltext-Zusicherung.
 *
 * ✅ Die WIRKUNG der Riegel bei einem echten Abruf (Statuscode und Location-Kopf) war
 * ⬜ V-L3 und ist am 2026-08-26 in V23 abgelesen (`riegel.test.ts:50-88`, Dauerfaelle
 * „V-L3 A" bis „V-L3 D") — NICHT hier. Ein Mock von `next/navigation` belegt, DASS und
 * WOHIN geworfen wird, nicht was Next daraus macht.
 *
 * VIER MOCKS, UND JEDER HAT EINEN GRUND (Form 1:1 aus
 * `src/app/m/lagerbuch/_lib/zugang.test.ts:6-36`):
 *
 *   `next/navigation` — `redirect()` und `notFound()` werfen in der echten Laufzeit
 *   Next-interne Fehler. Fuer die Unit-Aussage genuegt ein ERKENNBARER Wurf. ⛔ Der Mock
 *   gilt modulweit und deckt damit auch `_lib/host.ts:65-67` ab, dessen `notFound()` der
 *   Host-Fall unten braucht.
 *
 *   `next/headers` — `riegelAufStufe` ruft `headers()`, und das gibt es ausserhalb einer
 *   Anfrage nicht.
 *
 *   `@/core/auth` — `auth()` liest das Session-JWT. Der Test steuert die Sitzung UND zaehlt
 *   die Aufrufe: nur so ist „erst der Host, dann die Person" als VERHALTEN pruefbar und
 *   nicht bloss als Reihenfolge im Quelltext.
 *
 *   `../_db/client` — der Riegel ruft `merkeNutzer(getDb(), viewer)`. Statt eines Stubs
 *   bekommt er eine ECHTE, migrierte Datei-Datenbank; ein Stub koennte die Zusage „der
 *   Upsert laeuft NACH dem Riegel" (NS-Z7) nicht zeigen. ⛔ NICHT `getModuleDb()` — dessen
 *   Cache ist per Modulschluessel gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`);
 *   Vorbild `src/app/m/radio/_db/leihen.test.ts:69-82`.
 */
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    throw new Error(`NEXT_REDIRECT:${ziel}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

let hostKopf = new Headers({ host: "radio.localtest.me" });
vi.mock("next/headers", () => ({ headers: async () => hostKopf }));

let sitzung: unknown = null;
let authAufrufe = 0;
vi.mock("@/core/auth", () => ({
  auth: async () => {
    authAufrufe++;
    return sitzung;
  },
}));

let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
vi.mock("../_db/client", () => ({ getDb: () => testDb }));

import {
  viewerAusSession,
  istRadioAdmin,
  istRadioUpdater,
  istRadioVerwaltung,
  updaterGruppe,
  istInUpdaterGruppe,
  requireRadioAdmin,
  requireRadioVerwaltung,
  _resetGemeldeteGruppen,
  verwaltungsZiel,
  type RadioViewer,
} from "./zugang";
const viewer = (groups: string[]): RadioViewer => ({ sub: "u-1", name: "Test Person", groups });
const kopf = (h: Record<string, string>) => new Headers(h);

/**
 * ⛔ DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht
 * angenommen: in diesem Repo laedt vitest KEINE `.env`-Datei (kein `dotenv` in
 * `vitest.config.ts`, `vitest.setup.ts` oder `package.json`). Ein lokal gesetztes
 * SUITE_ADMIN_GROUP_RADIO verfaelscht damit kein Tor — ein in der Shell oder in der CI
 * EXPORTIERTER Wert dagegen schon.
 *
 * Deshalb loescht `beforeEach` alle drei Variablen VOR jedem Fall, statt sich darauf zu
 * verlassen, dass der Prozess sie nicht mitbringt. `zuruecksetzen()` in `finally` stellt
 * den Ausgangszustand des Prozesses wieder her; die Form ist `try/finally` und nicht
 * `afterEach`, weil hier drei Variablen nebeneinanderstehen und ein Fall, der eine davon
 * setzt, die anderen nicht in einem Zwischenzustand hinterlassen darf. Vitest faehrt
 * Dateien parallel, Faelle INNERHALB einer Datei aber seriell.
 *
 * (Dieselbe Bauform wie `src/app/m/radio/_lib/host.test.ts:29-36`, dort fuer eine
 * Variable.)
 */
const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const alterHost = process.env.SUITE_HOST_RADIO;
const zuruecksetzen = () => {
  for (const [name, wert] of [
    ["SUITE_ADMIN_GROUP_RADIO", alterAdmin],
    ["SUITE_UPDATER_GROUP_RADIO", alterUpdater],
    ["SUITE_HOST_RADIO", alterHost],
  ] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
};
beforeEach(() => {
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_UPDATER_GROUP_RADIO;
  delete process.env.SUITE_HOST_RADIO;
});

describe("viewerAusSession — reine Abbildung, ohne IO", () => {
  it("ohne user.id gibt es keinen Viewer", () => {
    expect(viewerAusSession(null)).toBeNull();
    expect(viewerAusSession({})).toBeNull();
    expect(viewerAusSession({ user: {} })).toBeNull();
  });

  it("ein fehlender groups-Claim ist die LEERE MENGE, kein Absturz", () => {
    // Sonst haenge die Fehlerform an der Token-Version: ein alter Token ohne `groups`
    // ergaebe 500 statt 404 (src/app/m/lagerbuch/_lib/zugang.ts:40-42).
    expect(viewerAusSession({ user: { id: "u-1" } })).toEqual({ sub: "u-1", name: null, groups: [] });
  });

  it("uebernimmt name, aber KEINE E-Mail — die users-Tabelle hat keine Spalte dafuer", () => {
    // `src/app/m/radio/_db/schema.ts:113-117`: sub, name, last_seen_at. Drei Felder,
    // drei Spalten.
    const v = viewerAusSession({ user: { id: "u-1", name: "A. Person", groups: ["g"] } });
    expect(v).toEqual({ sub: "u-1", name: "A. Person", groups: ["g"] });
    expect(Object.keys(v!).sort()).toEqual(["groups", "name", "sub"]);
  });
});

describe("istRadioAdmin — das Praedikat", () => {
  it("ohne Viewer: false — BEIDE Praedikate, nicht nur das strengere", () => {
    /*
     * ⛔ DIE ZWEITE ZEILE KAM MIT V3, UND SIE HAT IHREN EIGENEN GRUND. GEMESSEN (Sonde
     * S-V3o): mit entferntem `if (!viewer) return false;` in `istRadioUpdater` lief die
     * Fassung ohne sie `55 passed`, 0 rot — kein Fall reichte je `null` hinein, und jeder
     * heutige Aufrufer haelt einen Viewer in der Hand.
     * Die Signatur `RadioViewer | null` ist aber eine ZUSAGE an den naechsten Aufrufer: wer
     * `istRadioUpdater(await viewerOderNull())` schreibt — die naheliegende Frage einer
     * Sichtbarkeitsweiche —, bekaeme sonst einen TypeError statt eines `false`.
     */
    expect(istRadioAdmin(null)).toBe(false);
    expect(istRadioUpdater(null)).toBe(false);
  });

  it("mit der Registry-Vorgabegruppe: true", () => {
    // Das Env-Loeschen leistet das beforeEach oben (kein zweites hier, es waere tot).
    // Die Vorgabe steht in `src/core/registry.ts:198` (`adminGroups: ["iuk-radio-admin"]`).
    try {
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(true);
    } finally { zuruecksetzen(); }
  });

  it("SUITE_ADMIN_GROUP_RADIO greift — das Registry-Feld allein entscheidet NICHT", () => {
    /*
     * Der direkte Feldzugriff `mod.adminGroups` machte die Variable an genau dieser
     * Stelle wirkungslos, und der Fehler waere still: eine Instanz mit anders benannten
     * SSO-Gruppen liefe mit einem Riegel, der niemanden durchlaesst.
     * (`src/core/registry.ts:29-35` schreibt dieselbe Falle fuer `prodHosts` aus.)
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "leitung";
      expect(istRadioAdmin(viewer(["leitung"]))).toBe(true);
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("mit LEERER Admin-Liste: false — das .some()-Argument, und es ist Falle 23", () => {
    /*
     * `.some()` auf leerer Liste gewaehrt nichts. Das ist die richtige Richtung und
     * zugleich die stille Aussperrung: SUITE_ADMIN_GROUP_RADIO= (leer) ist eine GUELTIGE
     * Aussage und wird nicht gemeldet (docs/radio-portierung-analyse.md:1547-1576).
     * ⛔ Ein „leer bedeutet alle"-Zweig waere die Sperre, die sich selbst abschaltet.
     *
     * ⚠️ DER PRUEFGEGENSTAND IST EINE ABWESENHEIT — dieser Zweig existiert nicht. Die
     * Mutationssonde dazu ist deshalb eine EINFUEGUNG, keine Entfernung (V-Z2-1).
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "";
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(false);
      expect(istRadioAdmin(viewer([]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("ein Viewer mit NUR dashboard-admins: false — der Suite-Admin bekommt keine Radio-Rechte", () => {
    /*
     * Entscheidung 9 und Kapitel-4-Pflicht 17. `src/core/groups.ts:125` liesse ihn durch
     * (`if (groups.includes(suiteAdminGroup(env))) return true;`) — deshalb ist
     * `isModuleAdmin` hier NICHT die Quelle. `dashboard-admins` ist der Default von
     * ADMIN_GROUP (src/core/groups.ts:96-97).
     *
     * ⚠️ OHNE DIESEN FALL waere ein Umbau auf `isModuleAdmin` GRUEN — er sieht wie
     * Wiederverwendung aus und oeffnet /admin fuer jeden Suite-Betreiber. Genau das haelt
     * `src/app/m/lagerbuch/_lib/bauform.test.ts:230-249` mit einem Quelltext-Scan fest;
     * hier steht zusaetzlich die VERHALTENSaussage.
     *
     * Das Env-Loeschen leistet das beforeEach oben.
     */
    try {
      expect(istRadioAdmin(viewer(["dashboard-admins"]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("ein Viewer mit NUR der Updater-Gruppe: false — die zweite Stufe weicht die erste NICHT auf", () => {
    /*
     * ⛔ DIE NAHT FUER PLANTEIL 4, ALS RIEGEL FORMULIERT (Betreiberentscheidung C.6 / B4,
     * 2026-08-21: zwei Rollen wie im Bestand).
     *
     * Planteil 4 baut die FELD-ALLOWLIST in `_lib/rollen.ts` (V2, gebaut), die
     * GRUPPENQUELLE SUITE_UPDATER_GROUP_RADIO dagegen in DIESE Datei (V3). Falsch waere, sie
     * HIER mit `||` danebenzustellen — das saehe nach „zwei Rollen" aus und waere eine
     * AUFWEICHUNG: jeder Updater kaeme durch jeden Admin-Riegel, und typecheck, lint und
     * build blieben alle drei gruen.
     *
     * Im Bestand ist die Rangfolge eindeutig: `mapGroupsToRole` gibt `admin` VOR
     * `updater` und `null` bei keinem Treffer (radio-admin/shared/src/role.ts:3-10);
     * `requireRole('admin')` sperrt ELF Routen hart — radio-admin/server/src/routes/
     * devices.ts:99,188, softwareVersions.ts:30,40,48,56, loans.ts:28, tokens.ts:22,44,47,
     * export.ts:71 —, und die eigentliche Differenzierung sitzt im FELD-Filter
     * `filterEditableFields`, nicht im Routing
     * (radio-admin/shared/src/editable-fields.ts:1-18). ⚠️ `role.ts` und `role.test.ts`
     * belegen NUR die Rangfolge; `requireRole` kommt dort nicht vor. ⚠️ Ein `grep` auf
     * `requireRole('admin')` liefert ZWOELF Zeilen — die zwoelfte, export.ts:66, ist ein
     * Kommentar, keine Route.
     *
     * ⬜ E1b: wie die Gruppe wirklich heisst, weiss nur der Betreiber
     * (docs/superpowers/plans/SPERREN-radio-spec2.md:110 — verfolgtes Dokument, nicht die
     * git-ignorierte Kladde unter `.superpowers/sdd/`). Dieser Fall setzt deshalb einen
     * FREI GEWAEHLTEN Wert und prueft die Richtung, nicht den Namen.
     *
     * ⚠️ DER PRUEFGEGENSTAND IST EINE ABWESENHEIT — das `||` existiert nicht. Die
     * Mutationssonde dazu ist deshalb eine EINFUEGUNG, keine Entfernung (V-Z2-1).
     * Das Env-Loeschen von SUITE_ADMIN_GROUP_RADIO leistet das beforeEach oben.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      expect(istRadioAdmin(viewer(["eine-updater-gruppe"]))).toBe(false);
      /*
       * ⛔ UND SEIT V3 DANEBEN DIE ZWEITE HAELFTE DERSELBEN AUSSAGE: dieselbe Person IST
       * Updater. Ohne sie bliebe „istRadioAdmin ist false" auch dann gruen, wenn
       * `istRadioUpdater` versehentlich immer `false` gaebe — der Fall saehe wie ein
       * Riegel aus und waere eine tote Stufe.
       */
      expect(istRadioUpdater(viewer(["eine-updater-gruppe"]))).toBe(true);
      // Und die Gegenrichtung: wer BEIDES hat, ist Admin — „admin gewinnt bei
      // Ueberschneidung" (radio-admin/shared/src/role.test.ts:15-17).
      expect(istRadioAdmin(viewer(["eine-updater-gruppe", "iuk-radio-admin"]))).toBe(true);
    } finally { zuruecksetzen(); }
  });
});

describe("verwaltungsZiel — absolutes Ziel fuer die callbackUrl", () => {
  it("nimmt den konfigurierten Prod-Host, auch wenn die Anfrage anders kam", () => {
    /*
     * ⛔ DIE ERSTE ZUSICHERUNG FRAGT EINEN FREMDEN HOST AN, UND DAS IST DER GANZE FALL.
     * Der Plan hatte hier zweimal denselben Host stehen — angefragt wie konfiguriert. Dann
     * liefern BEIDE Zweige der `??`-Kette dieselbe Zeichenkette, und die Zusicherung ist
     * gegen den Vorrang des Prod-Hosts blind. GEMESSEN (Sonde P11a, 2026-08-22): mit
     * entfernter Zeile `prodHostsFor(getModule("radio"))[0] ??` lief die Brieffassung
     * `13 passed` — 0 rot. Die NT11-Form, nur an einer anderen Stelle.
     *
     * `iuk-ue.de` gehoert `portal` (`src/core/registry.ts:59`), ist also ein FREMDER
     * Suite-Host: `istRadioHost` ist dort falsch, und ohne den Prod-Host-Vorrang fiele die
     * Funktion auf den internen Pfad zurueck. Die zweite Zusicherung haelt zusaetzlich den
     * Normalfall fest, in dem angefragter und konfigurierter Host uebereinstimmen.
     */
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "iuk-ue.de", "x-forwarded-proto": "https" })))
        .toBe("https://radio.iuk-ue.de/admin");
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": "https" })))
        .toBe("https://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });

  it("der konfigurierte Prod-Host gewinnt AUCH ueber einen echten Radio-Host", () => {
    /*
     * ⛔ DER VORRANG, NICHT DIE ANWESENHEIT — und der Unterschied ist gemessen.
     *
     * Fall 1 darueber faengt nur, dass der Prod-Host-Zweig EXISTIERT: sein angefragter Host
     * (`iuk-ue.de`) ist ein FREMDER, `istRadioHost` ist dort falsch, und ein TAUSCH der
     * beiden Zweige der `??`-Kette laesst ihn deshalb gruen. GEMESSEN (Sonde P17,
     * 2026-08-22, REVIEW-Z4 Fund W1): mit vertauschten Zweigen — `istRadioHost` zuerst,
     * `prodHostsFor` als Rueckfall — lief die ganze Datei `13 passed`, 0 rot. Dieselbe
     * Familie wie P11a, nur eine Ebene tiefer.
     *
     * Dieser Fall fragt einen ECHTEN Radio-Host an, der ein ANDERER ist als der
     * konfigurierte. Nur so liefern die zwei Zweige verschiedene Zeichenketten, und nur so
     * ist die Reihenfolge ueberhaupt pruefbar. Ohne den Vorrang schriebe die Anmeldung eine
     * `callbackUrl` auf den FALSCHEN Host — und typecheck, lint und die uebrigen Faelle
     * blieben alle gruen.
     *
     * ⛔ HIER STEHT ABSICHTLICH KEINE FALLZAHL (REVIEW-Z4 Fund N1, 2026-08-22). Eine
     * gezaehlte Zahl der uebrigen Faelle altert mit jedem neuen `it` in dieser Datei und
     * ist dieselbe Klasse wie die Kommentarzahl, die `313f488` an sich selbst gefunden hat.
     * Was NICHT altert, ist die Messung: sie steht oben als Sonde P17.
     *
     * `radio.localtest.me` trifft `moduleForHost` ueber den Zweig `${m.key}.localtest.me`
     * (`src/core/registry.ts:254`), also OHNE jede SUITE_HOST_*-Variable: ein in der Shell
     * oder in der CI exportierter Fremdwert kann diesen Fall nicht kippen.
     */
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "radio.localtest.me" })))
        .toBe("http://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });

  it("bildet die URL aus x-forwarded-host, nicht aus host", () => {
    /*
     * `resolveHost` nimmt `x-forwarded-host` vor `host` und behaelt den Port
     * (`src/core/routing.ts:36-41`). Nach dem Rewrite der Middleware ist das die einzig
     * richtige Reihenfolge, und `radio`s Verkehr kommt durch genau diesen Rewrite.
     *
     * ⚠️ FUER DAS PRAEDIKAT IST SIE BELEGT (`src/app/m/radio/_lib/host.test.ts:68-77`), FUER
     * DIE URL-BILDUNG WAR SIE ES NICHT: aus `angefragt` entstehen Host UND Port der
     * absoluten URL. GEMESSEN (Sonde P18, 2026-08-22, REVIEW-Z4 Fund K2): `resolveHost`
     * durch `headersEingang.get("host") ?? ""` ersetzt lief `13 passed`, 0 rot.
     *
     * Das Env-Loeschen leistet das beforeEach oben — der Fall laeuft OHNE Prod-Host, damit
     * er den angefragten Zweig misst und nicht den konfigurierten.
     */
    try {
      expect(
        verwaltungsZiel(
          kopf({ "x-forwarded-host": "radio.localtest.me:3000", host: "interner.dienst" }),
        ),
      ).toBe("http://radio.localtest.me:3000/admin");
    } finally { zuruecksetzen(); }
  });

  it("faellt ohne Prod-Host auf den ANGEFRAGTEN Host zurueck — aber nur, wenn er radio ist", () => {
    // Das Env-Loeschen leistet das beforeEach oben.
    try {
      expect(verwaltungsZiel(kopf({ host: "radio.localtest.me:3000" })))
        .toBe("http://radio.localtest.me:3000/admin");
    } finally { zuruecksetzen(); }
  });

  it("faellt auf den internen Pfad zurueck, wenn weder Prod-Host noch Radio-Host vorliegen", () => {
    /*
     * Das ist der Zustand VOR dem Cutover auf einem fremden Host. Ein absolutes Ziel waere
     * hier eine erfundene Domain; der interne Pfad ist die einzige ehrliche Antwort.
     * ⚠️ Er ist `/m/radio/admin` und NICHT `/admin` — die callbackUrl wird von der
     * Suite-Anmeldung aufgeloest, und die kennt nur interne Pfade.
     * `iuk-ue.de` gehoert `portal` (`src/core/registry.ts:59`), ist also ein FREMDER
     * Suite-Host. Das Env-Loeschen leistet das beforeEach oben.
     */
    try {
      expect(verwaltungsZiel(kopf({ host: "iuk-ue.de" }))).toBe("/m/radio/admin");
      expect(verwaltungsZiel(kopf({}))).toBe("/m/radio/admin");
    } finally { zuruecksetzen(); }
  });

  it("liest das Protokoll aus x-forwarded-proto und nimmt bei Kommaliste den ersten Wert", () => {
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": "https,http" })))
        .toBe("https://radio.iuk-ue.de/admin");
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de" })))
        .toBe("http://radio.iuk-ue.de/admin");
      /*
       * ⚠️ UND DAS `.trim()`, DAS SONST UNTESTBAR-GRUEN BLEIBT: Leerzeichen um das Komma
       * herum ergeben dasselbe Protokoll. GEMESSEN (Sonde P19, 2026-08-22, REVIEW-Z4 Fund
       * K3): `.split(",")[0].trim()` zu `.split(",")[0]` verkuerzt lief `13 passed`, 0 rot.
       * Mit dieser Zusicherung faerbt derselbe Eingriff genau diesen Fall rot; das Ziel
       * hiesse dann (gemessen, nicht gerechnet) " https ://radio.iuk-ue.de/admin" — ein
       * Leerzeichen VOR dem Protokoll und eines DAHINTER.
       * Diese Zusicherung steht ZULETZT, weil ein geworfenes `expect` seinen Fall beendet.
       */
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": " https , http" })))
        .toBe("https://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });
});

/**
 * ================================================================================
 * AUFGABE V3 (Planteil 4) — DIE GRUPPENQUELLE, DAS ZWEITE PRAEDIKAT, DER ZWEITE
 * WERFENDE RIEGEL UND `merkeNutzer`.
 * ================================================================================
 */

const ZUGANG_QUELLE = join(process.cwd(), "src/app/m/radio/_lib/zugang.ts");
const MIGRATIONEN = "src/app/m/radio/_db/migrations";

/**
 * Der Rumpf EINER Funktion aus dem ROHEN Dateitext, ueber Klammerzaehlung.
 *
 * ⛔ ABSICHTLICH OHNE KOMMENTARSCHNITT, und das ist kein Versehen: dieser Scan hat GENAU
 * EINE negative Zusicherung zu tragen („`istRadioUpdater` nennt `requireRadioHost` nicht"),
 * und in dieser Richtung ist der ungeschnittene Text der STRENGERE — schon eine Erwaehnung
 * im Rumpf faerbt ihn rot. Damit ist er auch KEINE vierte Kopie der dreiteiligen Reparatur
 * aus `riegel.test.ts` (`ohneKommentareUndZeichenketten` / `ohneRegexLiterale` /
 * `bereinigt`, ⬜ V-L9): die braucht, wer POSITIVE Zusicherungen aus geschnittenem Text
 * liest.
 *
 * ⛔ DIE LEER-GRUEN-PROBE STEHT AM AUFRUFORT, NICHT HIER: ein Extraktor, der `""` liefert,
 * macht jedes `not.toMatch` wahr. Genau dagegen steht `expect(rumpf).not.toBe("")`.
 */
function funktionsRumpf(quelle: string, name: string): string {
  const start = quelle.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const auf = quelle.indexOf("{", start);
  if (auf === -1) return "";
  let tiefe = 0;
  for (let i = auf; i < quelle.length; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}") {
      tiefe--;
      if (tiefe === 0) return quelle.slice(auf, i + 1);
    }
  }
  return "";
}

/**
 * ⛔ DIE VIER FAELLE ZUR GRUPPENQUELLE — EIGENTUEMER IST V3, und der Ledger sagt es
 * namentlich (`R-V2-1`): `KOPF.md:373` legte sie urspruenglich in `_lib/rollen.test.ts`,
 * `briefs/V2.md` hat die Gruppenquelle nach `_lib/zugang.ts` verschoben (Grund im
 * Kopfkommentar von `_lib/rollen.ts:7-19`: dieselbe Datei liefert `UPDATER_FELDER` als WERT
 * an eine `"use client"`-Insel und liegt damit im Browser-Bundle). Die ZUSAGE ist unveraendert
 * (`Spec:4420-4422`, ausgeliefert in `.env.example:107-114`): ⛔ ein leerer oder fehlender
 * Wert SCHLIESST die Stufe.
 */
describe("updaterGruppe / istInUpdaterGruppe — die Gruppenquelle der zweiten Stufe", () => {
  it("fehlendes SUITE_UPDATER_GROUP_RADIO schliesst die Stufe", () => {
    /*
     * ⛔ FUER JEDE GRUPPENLISTE, AUCH FUER DIE LEERE. Ein „nicht gesetzt bedeutet alle"-Zweig
     * waere die Sperre, die sich selbst abschaltet — dieselbe Richtung wie Falle 23 bei
     * SUITE_ADMIN_GROUP_RADIO, nur mit umgekehrtem Vorzeichen der Folge: dort sperrt leer
     * ALLE aus, hier laesst leer NIEMANDEN herein. Das Loeschen leistet das beforeEach oben.
     */
    try {
      expect(updaterGruppe()).toBeNull();
      expect(istInUpdaterGruppe([])).toBe(false);
      expect(istInUpdaterGruppe(["iuk-radio-updater"])).toBe(false);
      expect(istInUpdaterGruppe(["irgendeine", "andere"])).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("leeres SUITE_UPDATER_GROUP_RADIO schliesst die Stufe ebenfalls", () => {
    // Der gesetzte, aber leere Wert ist eine GUELTIGE Aussage der Umgebung — und `.env.example`
    // sagt sie woertlich zu („LEER ODER FEHLEND SCHLIESST DIE STUFE").
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "";
      expect(updaterGruppe()).toBeNull();
      expect(istInUpdaterGruppe([""])).toBe(false);
      expect(istInUpdaterGruppe(["iuk-radio-updater"])).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("nur Leerraum als Gruppenname schliesst die Stufe", () => {
    /*
     * ⛔ GETRIMMT GEPRUEFT. Ohne das traegt ein Tippfehler in der `.env` eine Gruppe, in der
     * niemand ist — und die Stufe waere still zu, ohne dass irgendwo etwas leer aussaehe.
     * Die Gegenrichtung steht im Fall darunter: ein Wert MIT Leerraum an den Raendern trifft
     * die Gruppe trotzdem.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "   ";
      expect(updaterGruppe()).toBeNull();
      expect(istInUpdaterGruppe(["   "])).toBe(false);
      expect(istInUpdaterGruppe([""])).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("der Vergleich ist zeichengleich, nicht case-insensitiv", () => {
    /*
     * ⛔ `groups` kommt aus dem OIDC-`groups`-Claim. Ein normalisierender Vergleich waere
     * eine Rechteerweiterung, die kein Gate sieht: er machte aus einer Gruppe stillschweigend
     * jede Schreibweise ihres Namens. Der Bestand vergleicht ebenfalls zeichengleich —
     * `groups.includes(cfg.updaterGroup)` (radio-admin/shared/src/role.ts:8).
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "iuk-radio-updater";
      expect(istInUpdaterGruppe(["iuk-radio-updater"])).toBe(true);
      expect(istInUpdaterGruppe(["IUK-RADIO-UPDATER"])).toBe(false);
      expect(istInUpdaterGruppe(["Iuk-Radio-Updater"])).toBe(false);
      // Der Rand-Leerraum der Variablen faellt weg, der Gruppenname bleibt zeichengleich.
      process.env.SUITE_UPDATER_GROUP_RADIO = "  iuk-radio-updater  ";
      expect(updaterGruppe()).toBe("iuk-radio-updater");
      expect(istInUpdaterGruppe(["iuk-radio-updater"])).toBe(true);
    } finally { zuruecksetzen(); }
  });

  it("istRadioUpdater ruft requireRadioHost nicht", () => {
    /*
     * DIE GEGENREGEL §1.4.4 (Spec:595-607) FUER DAS ZWEITE PRAEDIKAT, als Rumpf-Scan.
     * `istRadioUpdater` ist eine FRAGE, keine Sperre — dieselbe Begruendung wie bei
     * `viewerOderNull` (`_lib/zugang.ts:86-90`). Ein Host-Riegel darin machte aus der
     * Sichtbarkeitsfrage eine zweite Sperre, und zwar an einer Stelle, an der der Aufrufer
     * die Header gar nicht hat.
     *
     * ⚠️ DER SCAN ZIELT AUF DEN RUMPF, NICHT AUF DIE DATEI: `_lib/zugang.ts` ENTHAELT
     * `requireRadioHost` — als erste Anweisung von `riegelAufStufe`, und genau dort MUSS es
     * stehen. Ein dateiweites `not.toMatch` waere dauerhaft rot.
     */
    const rumpf = funktionsRumpf(readFileSync(ZUGANG_QUELLE, "utf8"), "istRadioUpdater");
    expect(rumpf, "istRadioUpdater nicht gefunden — der Scan waere leer-gruen").not.toBe("");
    expect(rumpf, "Gegenregel §1.4.4: istRadioUpdater ruft requireRadioHost NICHT")
      .not.toMatch(/\brequireRadioHost\b/);
  });
});

/**
 * ================================================================================
 * AUFGABE L1 — DAS NICHT-WERFENDE PRAEDIKAT DER VERWALTUNGS-STUFE
 * ================================================================================
 *
 * ⛔ WOFUER ES DA IST UND WOFUER NICHT: es beantwortet eine ANZEIGE-Frage — „darf ich
 * dieser Person den Weg in die Verwaltung ueberhaupt zeigen?". Es riegelt NICHTS. Alle
 * zwoelf Verwaltungsflaechen tragen ihren Riegel als ERSTE Anweisung, unabhaengig davon,
 * ob irgendwo ein Link auf sie zeigt (`.superpowers/sdd/BERICHT-urls-und-adminzugang.md`
 * §2.7). ⛔ Ein Link aendert daran nichts — und ein fehlender Link sichert nichts.
 *
 * ⛔ BEIDE STUFEN, UND DAS IST GEMESSEN, KEIN GESCHMACK (Betreiberentscheidung 2026-08-27,
 * Bericht §2.8): SECHS der zehn Verwaltungsseiten stehen dem UPDATER offen, `/admin` selbst
 * eingeschlossen — `admin/(arbeit)/page.tsx:91` traegt `requireRadioVerwaltung()`, nicht
 * `requireRadioAdmin()`. Haenge der Link an `istRadioAdmin`, bliebe der Updater ohne
 * sichtbaren Weg auf eine Seite, die er VOLLBERECHTIGT oeffnet.
 *
 * ⛔ UND DIE RICHTUNG, IN DER ES NICHT WACHSEN DARF: es ist eine DRITTE Funktion NEBEN
 * `istRadioAdmin` und `istRadioUpdater`, kein `||` IN einem der beiden. Dieselbe Auflage
 * wie bei `requireRadioVerwaltung` (`_lib/zugang.ts:547-548`): das `||` gehoert in die
 * zusammensetzende Funktion, nie in die Admin-Stufe — dort waere es die Aufweichung, die
 * jede Updater-Person durch JEDEN Admin-Riegel liesse.
 */
describe("istRadioVerwaltung — das nicht-werfende Praedikat beider Stufen", () => {
  it("die Admin-Stufe sieht den Weg", () => {
    /*
     * ⛔ DIE UPDATER-STUFE IST DABEI ABSICHTLICH OFFEN GESETZT, und der Viewer steht
     * trotzdem NICHT in ihr. Ohne das truege dieser Fall nicht, was sein Name sagt: bei
     * geschlossener Updater-Stufe waere `istRadioUpdater` fuer JEDEN Viewer `false`, und
     * ein Praedikat, das versehentlich nur die Admin-Gruppe kennte, saehe genauso aus.
     * Die zweite Zusicherung haelt das fest — dieselbe Richtung wie `zugang.test.ts:258-262`.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      const v = viewer(["iuk-radio-admin"]);
      expect(istRadioUpdater(v)).toBe(false);
      expect(istRadioVerwaltung(v)).toBe(true);
    } finally { zuruecksetzen(); }
  });

  it("die Updater-Stufe sieht ihn ebenfalls — das ist der Sinn der Entscheidung", () => {
    /*
     * ⛔ DER TRAGENDE FALL. Er ist zugleich die Gegenprobe gegen die naheliegende
     * Fehlbauform „der Link haengt an `istRadioAdmin`": die erste Zusicherung haelt fest,
     * dass diese Person die ADMIN-Stufe NICHT hat, die zweite, dass sie den Weg trotzdem
     * sieht. ⛔ `admin` bleibt dabei strikt strenger als `updater` — hier waechst NICHTS
     * zusammen, es kommt nur eine dritte, schwaechere Frage daneben.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      const v = viewer(["eine-updater-gruppe"]);
      expect(istRadioAdmin(v)).toBe(false);
      expect(istRadioVerwaltung(v)).toBe(true);
    } finally { zuruecksetzen(); }
  });

  it("angemeldet ohne jede Stufe: false — bei OFFENER Updater-Stufe", () => {
    /*
     * ⛔ DIE OFFENE UPDATER-STUFE IST HIER DIE TRAGENDE ZEILE, nicht Beiwerk. Bliebe
     * SUITE_UPDATER_GROUP_RADIO ungesetzt, waere dieser Fall gruen, WEIL DIE STUFE
     * GESCHLOSSEN IST (`updaterGruppe()` gaebe `null`) — und nicht, weil die Gruppen des
     * Viewers nicht passen. Er waere damit auch ueber einem Praedikat gruen, das jede
     * angemeldete Person durchliesse, sobald der Betreiber die Gruppe eintraegt.
     * ⚠️ Dieselbe Klasse „gruen, weil die Stufe geschlossen ist" benennt `zugang.test.ts:258-262`.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      expect(updaterGruppe()).toBe("eine-updater-gruppe");
      expect(istRadioVerwaltung(viewer(["irgendeine-andere"]))).toBe(false);
      expect(istRadioVerwaltung(viewer([]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("anonym: false — und das ist der Fall, den die ANONYME Flaeche stellt", () => {
    /*
     * ⛔ SPEC §4.9.6: „ein sichtbarer Weg dorthin, wo die aufrufende Person nicht hindarf,
     * verletzt die Gegenprobe" (`docs/design/README.md:420`, zitiert in
     * `(ausleihe)/geraete/page.tsx:142-146`). Die Ausleihflaeche ist anonym erreichbar;
     * `viewerOderNull()` gibt dort `null`, und dieses Praedikat MUSS darauf `false` geben,
     * ohne zu werfen — ein werfender Riegel schickte jeden anonymen Scan nach `/login`
     * (`src/app/m/radio/page.tsx:119-124`).
     *
     * ⛔ BEIDE UMGEBUNGSLAGEN, weil `null` zwei Wege durch die Funktion nehmen kann: mit
     * offener Updater-Stufe laeuft ein fehlender Null-Schutz in `viewer.groups` und damit
     * in einen TypeError statt in ein `false`.
     */
    try {
      expect(istRadioVerwaltung(null)).toBe(false);
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      expect(istRadioVerwaltung(null)).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("istRadioVerwaltung ruft requireRadioHost nicht", () => {
    /*
     * DIE GEGENREGEL §1.4.4 (Spec:595-607) FUER DAS DRITTE PRAEDIKAT, als Rumpf-Scan —
     * Form 1:1 aus dem Fall „istRadioUpdater ruft requireRadioHost nicht" darueber.
     * Ein Host-Riegel in einer SICHTBARKEITSfrage machte aus ihr eine zweite Sperre, und
     * zwar an einer Stelle, an der der Aufrufer die Header gar nicht hat.
     *
     * ⚠️ DER SCAN ZIELT AUF DEN RUMPF, NICHT AUF DIE DATEI: `_lib/zugang.ts` ENTHAELT
     * `requireRadioHost` — als erste Anweisung von `riegelAufStufe`, und genau dort MUSS
     * es stehen. Ein dateiweites `not.toMatch` waere dauerhaft rot.
     */
    const rumpf = funktionsRumpf(readFileSync(ZUGANG_QUELLE, "utf8"), "istRadioVerwaltung");
    expect(rumpf, "istRadioVerwaltung nicht gefunden — der Scan waere leer-gruen").not.toBe("");
    expect(rumpf, "Gegenregel §1.4.4: istRadioVerwaltung ruft requireRadioHost NICHT")
      .not.toMatch(/\brequireRadioHost\b/);
  });
});

describe("requireRadioVerwaltung — die zweite Stufe, werfend", () => {
  /**
   * ⛔ `_resetGemeldeteGruppen()` GEHOERT IN DAS `beforeEach`, UND DER GRUND STEHT SEIT
   * PLANTEIL 2 IM QUELLTEXT (`_lib/zugang.ts:345-352`): `bereitsGemeldet` ist prozess-lokal
   * und ueberlebt jeden Fall dieser Datei. ⛔ SEIN TRAEGER IST GENAU EIN FALL: „meldet die
   * fehlende Gruppe EINMAL JE PERSON" (`zugang.test.ts:866`) weist ABSICHTLICH denselben `sub`
   * ab wie der Fall auf `:709`; jeder ANDERE traegt seinen eigenen, sonst waere der Reset inert.
   *
   * Der WARN-Spy steht hier, weil die Abweisungsfaelle sonst je eine echte Zeile in die
   * Suitenausgabe schreiben; der Fall, der das Protokoll PRUEFT, legt seinen eigenen Spy
   * darueber (Vorbild `src/app/m/lagerbuch/_lib/zugang.test.ts:60-73`).
   */
  let tmp: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "radio-zugang-"));
    sqlite = openModuleDatabase(join(tmp, "radio.db"));
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
    testDb = drizzle(sqlite, { schema });
    sitzung = null;
    authAufrufe = 0;
    hostKopf = new Headers({ host: "radio.localtest.me" });
    _resetGemeldeteGruppen();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    testDb = null;
    sqlite.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const nutzerZeilen = () => testDb!.select().from(users).all();

  it("laesst die Admin-Gruppe durch und meldet rolle admin", async () => {
    try {
      sitzung = { user: { id: "sub-a1", name: "Anna Beispiel", groups: ["iuk-radio-admin"] } };
      const { viewer, rolle } = await requireRadioVerwaltung();
      expect(rolle).toBe("admin");
      expect(viewer.sub).toBe("sub-a1");
    } finally { zuruecksetzen(); }
  });

  it("laesst die Updater-Gruppe durch und meldet rolle updater", async () => {
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      sitzung = { user: { id: "sub-u1", name: "Uwe Beispiel", groups: ["eine-updater-gruppe"] } };
      const { viewer, rolle } = await requireRadioVerwaltung();
      expect(rolle).toBe("updater");
      expect(viewer.sub).toBe("sub-u1");
    } finally { zuruecksetzen(); }
  });

  it("wer in BEIDEN Gruppen steht, bekommt rolle admin", async () => {
    /*
     * ⛔ 1:1 AUS `radio-admin/shared/src/role.ts:7-8`: dort gewinnt `admin` bei
     * Ueberschneidung, WEIL DIE PRUEFUNG ZUERST STEHT (`if (groups.includes(adminGroup))
     * return 'admin'` vor der Updater-Zeile). Das ist der Fall, den ein
     * `istRadioUpdater(v) ? "updater" : "admin"` still umkehrte — und die Umkehr waere eine
     * RECHTEMINDERUNG mit Ansage: die Admin-Person saehe die Verwaltung in der
     * Updater-Fassung, ohne Import, ohne Softwareversionen, ohne Zugaenge.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      sitzung = {
        user: { id: "sub-b1", name: "Bea Beispiel", groups: ["eine-updater-gruppe", "iuk-radio-admin"] },
      };
      expect((await requireRadioVerwaltung()).rolle).toBe("admin");
    } finally { zuruecksetzen(); }
  });

  it("ohne beide Gruppen endet requireRadioVerwaltung im notFound, nicht im 403", async () => {
    /*
     * Spec:691-694 (§1.5): was nicht freigegeben ist, sieht in dieser Suite genauso aus wie
     * etwas, das es nicht gibt. UND die Protokollzeile ist Pflicht, nicht Kuer (Spec:206-210)
     * — sie ist die einzige Stelle, an der eine falsch benannte oder leere Gruppe ueberhaupt
     * sichtbar wird.
     */
    try {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      sitzung = { user: { id: "sub-n1", name: "Nora Beispiel", groups: ["irgendwas"] } };
      await expect(requireRadioVerwaltung()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("Zugriff auf /admin abgelehnt");
    } finally { zuruecksetzen(); }
  });

  it("ohne Sitzung leitet requireRadioVerwaltung zur Anmeldung, nicht in den 404", async () => {
    /*
     * `viewerAusSession` gibt hier `null`; ohne den `redirect`-Zweig fiele die anonyme Person
     * in die Gruppenpruefung, `istRadioAdmin(null)` waere `false`, und sie landete im 404
     * statt in der Anmeldung.
     */
    try {
      sitzung = null;
      await expect(requireRadioVerwaltung()).rejects.toThrow(
        "NEXT_REDIRECT:/login?callbackUrl=" + encodeURIComponent("http://radio.localtest.me/admin"),
      );
    } finally { zuruecksetzen(); }
  });

  it("requireRadioVerwaltung prueft den Host VOR der Person", async () => {
    /*
     * ⛔ DER VERHALTENSNACHWEIS ZU EINER REIHENFOLGE, die `riegel.test.ts` Klausel (d) nur
     * als Quelltextstelle halten kann: auf einem fremden Host wirft der Riegel, OHNE die
     * Sitzung ueberhaupt zu lesen. Stuende die Person zuerst, verriete der Login-Umweg die
     * Verwaltungsroute auf jedem Suite-Host.
     * `iuk-ue.de` gehoert `portal` (`src/core/registry.ts:59`), ist also ein fremder Host.
     */
    try {
      hostKopf = new Headers({ host: "iuk-ue.de" });
      sitzung = { user: { id: "sub-h1", name: "Hans Beispiel", groups: ["iuk-radio-admin"] } };
      await expect(requireRadioVerwaltung()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(authAufrufe, "die Sitzung wurde gelesen, obwohl der Host schon falsch war").toBe(0);
    } finally { zuruecksetzen(); }
  });

  it("merkeNutzer wird NICHT gerufen, wenn der Riegel abweist", async () => {
    /*
     * ⛔ NS-Z7, ALS WIRKUNG GEMESSEN. Stuende `merkeNutzer` VOR der Gruppenpruefung, bekaeme
     * JEDE angemeldete Person der Suite eine Zeile in `users` — auch die, die abgewiesen wird.
     *
     * ⚠️ BENANNTE ABWEICHUNG VOM BRIEF: er verlangt „ein Spion auf `merkeNutzer`". Ein
     * `vi.spyOn` kann den Aufruf NICHT abfangen — `riegelAufStufe` und `merkeNutzer` stehen in
     * DERSELBEN Datei, und ein modulinterner Aufruf laeuft ueber die lokale Bindung, nicht
     * ueber den Modulexport. Gemessen wird deshalb die WIRKUNG: die Zeilenzahl in `users`.
     * Sie ist die staerkere Aussage und faerbt bei derselben Mutation rot (Sonde S-V3c).
     */
    try {
      sitzung = { user: { id: "sub-n2", name: "Nils Beispiel", groups: ["irgendwas"] } };
      await expect(requireRadioVerwaltung()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(nutzerZeilen()).toEqual([]);
    } finally { zuruecksetzen(); }
  });

  it("merkeNutzer wird gerufen, wenn der Riegel durchlaesst", async () => {
    // Die Gegenprobe zum Fall darueber: ohne sie waere „nicht gerufen" auch bei geloeschter
    // Zeile gruen — und die Ereignisliste zeigte danach fuer jede Person eine nackte UUID
    // (Spec:4358-4360).
    try {
      sitzung = { user: { id: "sub-a2", name: "Anna Beispiel", groups: ["iuk-radio-admin"] } };
      await requireRadioVerwaltung();
      const zeilen = nutzerZeilen();
      expect(zeilen).toHaveLength(1);
      expect(zeilen[0]!.sub).toBe("sub-a2");
      expect(zeilen[0]!.name).toBe("Anna Beispiel");
      expect(zeilen[0]!.lastSeenAt).toBeInstanceOf(Date);
      // ⛔ DER WERT, NICHT NUR DER TYP: ein `new Date(0)` truege `toBeInstanceOf` ebenso.
      expect(zeilen[0]!.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    } finally { zuruecksetzen(); }
  });

  it("eine Sitzung ohne name schreibt den sub als Namen, nicht null", async () => {
    /*
     * ⛔ DER FALL ZUR AUFGELOESTEN KOLLISION (`_lib/zugang.ts:47-59`): `users.name` ist
     * `.notNull()` (`_db/schema.ts:115`), `RadioViewer.name` ist `string | null`. V3 hat den
     * BENANNTEN RUECKFALL gewaehlt, und sein Wert ist der rohe `sub` — genau der Wert, den der
     * Bestand auf der LESEseite einsetzt („so the field is never blank",
     * radio-admin/server/src/routes/devices.ts:70-78).
     * ⛔ NICHT `toBeTruthy` — zeichengleich gegen den `sub` geprueft, sonst bestuende auch ein
     * erfundener Platzhalter den Fall.
     */
    try {
      sitzung = { user: { id: "sub-a3", groups: ["iuk-radio-admin"] } };
      await requireRadioVerwaltung();
      expect(nutzerZeilen()[0]!.name).toBe("sub-a3");
      /*
       * ⛔ UND EIN NAME AUS LEERRAUM IST KEIN NAME — die zweite Haelfte desselben
       * Rueckfalls, und sie hat ihren EIGENEN Traeger. GEMESSEN (Sonde S-V3n): allein das
       * `.trim()` aus `merkeNutzer` entfernt lief die Fassung ohne diese Zusicherung
       * `55 passed`, 0 rot — die Falsy-Pruefung deckt `null` ab, `"   "` ist TRUTHY. Ohne
       * das `.trim()` stuende der Leerraum danach als Anzeigename in jeder Ereigniszeile,
       * und die Zeile saehe leer aus, ohne leer zu sein. Dieselbe Lesart wie
       * `src/app/m/lagerbuch/_lib/konto.ts:80-100` und `lagerbuch/_db/quelle.ts:37`
       * („EIN NAME AUS LEERZEICHEN IST KEIN NAME").
       */
      sitzung = { user: { id: "sub-a3b", name: "   ", groups: ["iuk-radio-admin"] } };
      await requireRadioVerwaltung();
      const leerraum = nutzerZeilen().find((z) => z.sub === "sub-a3b");
      expect(leerraum!.name).toBe("sub-a3b");
    } finally { zuruecksetzen(); }
  });

  it("ein zweiter Aufruf mit geaendertem Namen frischt die Zeile auf, statt sie zu ueberspringen", async () => {
    /*
     * ⛔ DER `onConflictDoUpdate`-ZWEIG. Mit `onConflictDoNothing` truege die Tabelle den Namen
     * vom allerersten Aufruf, und eine spaetere Umbenennung im Verzeichnisdienst kaeme nie an —
     * still, denn die Zeile EXISTIERT ja.
     */
    try {
      sitzung = { user: { id: "sub-a4", name: "Anna Alt", groups: ["iuk-radio-admin"] } };
      await requireRadioVerwaltung();
      sitzung = { user: { id: "sub-a4", name: "Anna Neu", groups: ["iuk-radio-admin"] } };
      await requireRadioVerwaltung();
      expect(nutzerZeilen()[0]!.name).toBe("Anna Neu");
    } finally { zuruecksetzen(); }
  });

  it("merkeNutzer legt genau EINE Zeile je sub an", async () => {
    // `toBe(1)` nach zwei Aufrufen — der Fall gegen ein `insert` ohne `onConflict`, das beim
    // zweiten Aufruf entweder eine zweite Zeile schriebe oder hart abbraeche.
    try {
      sitzung = { user: { id: "sub-a5", name: "Anna Beispiel", groups: ["iuk-radio-admin"] } };
      await requireRadioVerwaltung();
      await requireRadioVerwaltung();
      expect(nutzerZeilen()).toHaveLength(1);
    } finally { zuruecksetzen(); }
  });

  it("requireRadioAdmin laeuft ueber denselben Helfer und weist die reine Updater-Gruppe ab", async () => {
    /*
     * ⛔ DIE RICHTUNG, DIE NS-Z8 ALS EINZIGE FESTHAELT — hier als VERHALTEN des werfenden
     * Riegels, nicht nur als Praedikat: `admin` bleibt strikt strenger als `updater`. Faltete
     * jemand die zweite Stufe mit `||` in `istRadioAdmin` hinein, kaeme jede Updater-Person
     * durch JEDEN Admin-Riegel — auch durch den des Druckzweigs mit den Zugangscodes im
     * Klartext (Spec:4378) —, und typecheck, lint und build blieben gruen.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      sitzung = { user: { id: "sub-u2", name: "Uwe Beispiel", groups: ["eine-updater-gruppe"] } };
      await expect(requireRadioAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(nutzerZeilen()).toEqual([]);
      // Und die Gegenprobe am selben Riegel: die Admin-Gruppe kommt durch.
      sitzung = { user: { id: "sub-a6", name: "Anna Beispiel", groups: ["iuk-radio-admin"] } };
      expect((await requireRadioAdmin()).sub).toBe("sub-a6");
    } finally { zuruecksetzen(); }
  });

  it("meldet die fehlende Gruppe EINMAL JE PERSON, nicht einmal je Anfrage", async () => {
    /*
     * ⛔ ZWEI ZEILEN AUF EINMAL BEWACHT, und der Fall ist der Nachzug zu REVIEW-V3 F2.
     * Vorbild: `src/app/m/lagerbuch/_lib/zugang.test.ts:55-73`, wo derselbe Fall denselben
     * Dienst tut („Der Fehlschlag ist echt und wurde gesehen").
     *
     * 1. DER DEDUP-ZWEIG `if (bereitsGemeldet.has(sub)) return;` (`_lib/zugang.ts:331`):
     *    ohne ihn schriebe ein Abweisungssturm je ANFRAGE eine Protokollzeile, und dieser
     *    Fall saehe ZWEI Aufrufe statt einem.
     * 2. ⛔ `_resetGemeldeteGruppen()` IM `beforeEach` OBEN: dieser Fall traegt ABSICHTLICH
     *    denselben `sub` wie „ohne beide Gruppen endet requireRadioVerwaltung im notFound"
     *    (`_lib/zugang.test.ts:709`). Der Speicher ist prozess-lokal und ueberlebt jeden Fall
     *    dieser Datei — ohne den Reset stuende `sub-n1` beim Betreten hier schon drin, und
     *    dieser Fall saehe NULL statt EINEM Aufruf. ⛔ GEMESSEN (Fix-Runde 1, Sonde E8):
     *    VOR diesem Fall lief die Datei ohne den Reset `55 passed`, **0 rot** — jeder
     *    abweisende Fall trug seinen eigenen `sub`, die Zeile im `beforeEach` war inert, und
     *    die Zusage in `_lib/zugang.ts:345-352` hatte keinen Traeger.
     */
    try {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      sitzung = { user: { id: "sub-n1", name: "Nora Beispiel", groups: ["irgendwas"] } };
      await expect(requireRadioVerwaltung()).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(requireRadioVerwaltung()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(
        warn,
        "einmal je PERSON, nicht je Anfrage — sonst flutet ein Abweisungssturm das Protokoll",
      ).toHaveBeenCalledTimes(1);
    } finally { zuruecksetzen(); }
  });
});
