// src/app/m/radio/_lib/boot.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../_db/schema";
import { devices, loans } from "../_db/schema";
import { moduleDbPath } from "@/core/db";
import type { DB } from "../_db/client";
import {
  retentionGrenze,
  raeumeLeihhistorie,
  radioBootFehler,
  historieMonate,
  historieMonateFehler,
  starteRadioHintergrund,
  stoppeRadioHintergrund,
  RADIO_HISTORIE_ERSTLAUF_MINUTEN_VORGABE,
  RADIO_HISTORIE_TAKT_MS,
} from "./boot";

/**
 * ⛔ DIE VERBINDLICHE TESTMECHANIK DES TAKTS (G4): `getDb()` WIRD GEMOCKT, und der Mock
 * zeigt auf ein im Test SELBST geoeffnetes und migriertes Handle (Vorbild
 * `src/app/m/lagerbuch/_db/migrations.test.ts:29-37`).
 *
 * ⛔ WARUM NICHT EIN GESETZTES `DATA_DIR`: `getDb()` IST `getModuleDb("radio", schema)`
 * (`src/app/m/radio/_db/client.ts:22-24`), und dessen Cache haengt an
 * `globalThis.__suiteDb[key]`, NICHT an `DATA_DIR` (`src/core/db/index.ts:25-36`). Ein
 * `DATA_DIR`, das nach dem ersten Zugriff irgendeiner Testdatei gesetzt wird, wirkt nicht
 * mehr. Bauform 26 des Planteils verbietet `getModuleDb()` in einer Testdatei ausdruecklich
 * AUCH MITTELBAR ueber `getDb()`.
 *
 * ⛔ WARUM KEINE INJEKTIONSNAHT: die verbindliche Signatur aus ⬜ G-L4 lautet
 * `starteRadioHintergrund(env: EnvLike = process.env): void` und hat keinen DB-Parameter.
 * Eine Naht, die nur der Test benutzt, waere eine zweite Bauform fuer denselben Zugriff.
 *
 * ⚠️ KEIN `importOriginal`/`...echt`-SPREAD: der Spread ist fuer den bootstrap-Spion
 * vorgeschrieben (dort muss `radioBootFehler` echt bleiben), hier zoege er `@/core/db`
 * hinter Bauform 26 wieder herein. Die Datei exportiert nur `getDb` und den Typ `DB`;
 * `DB` ist typ-only und ueberlebt das Mocken ohne Laufzeitanteil.
 *
 * ⚠️ DIE BESTANDSFAELLE BLEIBEN UNBERUEHRT, gemessen: keiner von ihnen importiert
 * `../_db/client` zur Laufzeit, und `_lib/boot.ts` zieht daraus im Kapitel-2-Teil nur
 * `import type { DB }`.
 */
const dbHalter = vi.hoisted(() => ({ db: undefined as unknown as DB, deleteZugriffe: 0 }));
vi.mock("../_db/client", () => ({ getDb: (): DB => dbHalter.db }));

/**
 * EINE DATEI, DREI BESCHREIBENDE ORTE, KEINE ZEILE DOPPELT (Spec 1 B5): hier stehen die
 * REINEN Faelle ueber `retentionGrenze` und die DB-Faelle ueber `raeumeLeihhistorie`
 * (§8.2.5 / §2.7.3), die Boot-Pruefungen (§7.3.7, Planteil 5 / G2) und die TAKT-Faelle mit
 * `vi.useFakeTimers()` (§2.7.2, Planteil 5 / G4). Alle drei Orte stehen jetzt hier —
 * nicht in einer zweiten Datei. Es gibt KEIN `_lib/retention.test.ts`.
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const JETZT = new Date("2026-08-17T12:00:00Z");

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-boot-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.prepare("delete from loans").run();
});

/** Eine Leihe, die nur in den Feldern abweicht, die der Fall braucht. Sekundengenaue
 *  Zeiten: `mode: "timestamp"` speichert Sekunden, Millisekunden gingen verloren. */
function leihe(werte: Partial<typeof loans.$inferInsert>): typeof loans.$inferInsert {
  return {
    id: `l-${Object.values(werte).join("-")}`,
    deviceId: "g-1",
    snapshotCallSign: "Muehlheim 1/83",
    borrowerName: "Seed Person",
    borrowedAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    ...werte,
  };
}

const tag = (d: Date) => d.toISOString().slice(0, 10);

describe("retentionGrenze — rein", () => {
  it("retentionGrenze auf 2026-08-17 ergibt 2026-06-17", () => {
    expect(tag(retentionGrenze(JETZT))).toBe("2026-06-17");
  });

  it("retentionGrenze auf 2026-04-30 ergibt 2026-03-02 — die Monatsende-Verschiebung der Quelle wird uebernommen", () => {
    /*
     * UEBERNOMMENES VERHALTEN, KEIN FEHLER. `setUTCMonth(getUTCMonth() - 2)` auf dem
     * 30. April ergibt "30. Februar" und normalisiert auf den 2. Maerz — der Cutoff wandert
     * an solchen Tagen bis zu zwei Tage NACH VORN und loescht ein wenig mehr, als die
     * Richtlinie woertlich sagt. Die Quelle rechnet zeichengleich so
     * (radio-admin/server/src/services/retentionService.ts:17-21), und Paritaet ist hier
     * das staerkere Argument als arithmetische Eleganz: eine korrigierte Monatsarithmetik
     * liesse im Ziel Zeilen stehen, die die Alt-App geloescht haette, und die Abweichung
     * fiele niemandem auf. Dieser Fall haelt die Entscheidung fest, damit sie nicht als
     * Fehler "repariert" wird.
     */
    expect(tag(retentionGrenze(new Date("2026-04-30T00:00:00Z")))).toBe("2026-03-02");
  });
});

describe("raeumeLeihhistorie — gegen die migrierte Datenbank", () => {
  it("eine am Cutoff-Tag zurueckgegebene Leihe bleibt", () => {
    // Die Grenze selbst ist AUSGESCHLOSSEN: `lt(returnedAt, grenze)`.
    db.insert(loans).values(leihe({ deviceId: "g-grenze", returnedAt: retentionGrenze(JETZT) })).run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(0);
    expect(db.select().from(loans).all()).toHaveLength(1);
  });

  it("eine einen Tag vor dem Cutoff zurueckgegebene Leihe geht", () => {
    const einenTagFrueher = new Date(retentionGrenze(JETZT).getTime() - 24 * 60 * 60 * 1000);
    db.insert(loans).values(leihe({ deviceId: "g-alt", returnedAt: einenTagFrueher })).run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(1);
    expect(db.select().from(loans).all()).toHaveLength(0);
  });

  it("eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist", () => {
    /*
     * `returned_at IS NULL` ist keine Zeit und faellt nie unter einen Cutoff — auch nicht
     * bei einer jahrealten aktiven Leihe. Verhalten der Quelle
     * (radio-admin/server/src/repos/loanRepo.ts:191-196). Ein "aufraeumen, was zu lange
     * draussen ist" gibt es nicht und darf hier nicht entstehen: eine verschwundene aktive
     * Leihe ist der Verlust der Information, WER ein Geraet hat.
     */
    db.insert(loans)
      .values(
        leihe({
          deviceId: "g-uralt",
          borrowedAt: new Date("2019-01-01T10:00:00Z"),
          returnedAt: null,
        }),
      )
      .run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(0);
    expect(db.select().from(loans).all()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLANTEIL 5 / G2 — die Boot-Pruefungen (§7.3.1 bis §7.3.4).
//
// SIE STEHEN IN DERSELBEN DATEI wie die Retention-Rechnung, nicht in einer zweiten:
// `_lib/boot.test.ts:20-26` schreibt das seit Planteil 1 aus („die Boot-Pruefungen
// (§7.3.7) kommen mit Planteil 5 in DIESE Datei — nicht in eine zweite").
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eine vollstaendige, gueltige Umgebung MIT Prod-Host — jede Pruefung schweigt.
 *
 * ⚠️ `SUITE_UPDATER_GROUP_RADIO` steht hier bewusst NICHT: „nicht gesetzt" ist einer der
 * drei Zustaende, die die `console.info`-Zeile melden muss (NS-V4), und er ist der
 * haeufigste. Der Fall unten setzt die anderen zwei selbst.
 */
const OK: Record<string, string | undefined> = {
  SUITE_HOST_RADIO: "radio.example.test",
  SUITE_ADMIN_GROUP_RADIO: "iuk-radio-admin",
  RADIO_AUSLEIH_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
  AUTH_SECRET: "ein-anderes-suite-geheimnis",
  SUITE_TRAEFIK_RULE: "Host(`iuk-ue.de`) || Host(`radio.example.test`)",
};

describe("Planteil 5 / G2 — radioBootFehler, historieMonate, historieMonateFehler", () => {
  const altesDataDir = process.env.DATA_DIR;
  let leeresDataDir: string;

  beforeEach(() => {
    /*
     * ⛔ `DATA_DIR` WIRD AUS `process.env` GELESEN, NICHT AUS DEM `env`-PARAMETER —
     * `src/core/db/index.ts:6` (`const DATA_DIR = () => process.env.DATA_DIR ?? "./.data"`).
     * Wer den Pfad nur in das uebergebene `env`-Objekt schriebe, liesse `moduleDbPath`
     * auf `./.data` zeigen: der `radio.db`-Fall meldete dann den Zustand des ECHTEN
     * Arbeitsverzeichnisses, und der Reihenfolge-Fall unten (Auflage 2) beobachtete ein
     * Verzeichnis, in dem ohnehin nichts entstehen kann.
     */
    leeresDataDir = mkdtempSync(join(tmpdir(), "radio-boot-data-"));
    process.env.DATA_DIR = leeresDataDir;
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(leeresDataDir, { recursive: true, force: true });
    if (altesDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = altesDataDir;
  });

  /** Alle Argumente aller `console.info`-Aufrufe als ein Text. */
  const infoText = () =>
    vi
      .mocked(console.info)
      .mock.calls.flat()
      .map((a) => String(a))
      .join("\n");

  const warnText = () =>
    vi
      .mocked(console.warn)
      .mock.calls.flat()
      .map((a) => String(a))
      .join("\n");

  describe("der Schalter — sie greift nur, wenn der Betreiber radio eingeschaltet hat", () => {
    it("ohne SUITE_HOST_RADIO meldet radioBootFehler nichts", async () => {
      /*
       * §7.3.2 (Spec:5921-5926): eine unbedingte Pflicht hiesse, die Suite startet ab dem
       * ersten Image mit `radio` nicht mehr, bis die .env ergaenzt ist — „dieses Modul
       * blockierte damit jeden unbeteiligten Deploy im Fenster zwischen Merge und
       * Cutover". Der Schalter ist DIESELBE Variable, die das Modul einschaltet
       * (`SUITE_HOST_RADIO` ueber `prodHostsFor`, `src/core/registry.ts:233-235`); einen
       * zweiten, vergessbaren gibt es nicht. Registry-Rueckfall ist `prodHosts: []`
       * (`src/core/registry.ts:199`), also greift der Schalter ohne Variable.
       */
      await expect(radioBootFehler({})).resolves.toEqual([]);
      await expect(
        radioBootFehler({
          SUITE_ACCESS_GROUP_RADIO: "irgendwas",
          RADIO_HISTORIE_MONATE: "0",
          RADIO_AUSLEIH_SITZUNG_STUNDEN: "kaputt",
        }),
      ).resolves.toEqual([]);

      // ⛔ ER STEHT VOR ALLEM, auch vor den Melde-Zeilen: kein `warn`, kein `info`.
      expect(vi.mocked(console.warn)).not.toHaveBeenCalled();
      expect(vi.mocked(console.info)).not.toHaveBeenCalled();
    });

    it("mit Prod-Host und vollstaendiger Umgebung ist die Liste leer", async () => {
      await expect(radioBootFehler(OK)).resolves.toEqual([]);
      expect(warnText()).toBe("");
    });
  });

  describe("Pruefung 1 — SUITE_ADMIN_GROUP_RADIO", () => {
    it("fehlende Admin-Gruppe ist ein Startabbruch", async () => {
      /*
       * ⚠️ GELESEN WIRD DIE VARIABLE DIREKT, NICHT UEBER `adminGroupsFor`: die faellt bei
       * nicht gesetzter Variable still auf `mod.adminGroups` zurueck
       * (`src/core/groups.ts:102-108`), also auf den Entwicklungs-Vorgabewert
       * `["iuk-radio-admin"]` (`src/core/registry.ts:198`), und meldete nichts.
       * `validateGroupConfig` meldet den leeren Admin-Wert bewusst ebenfalls nicht.
       */
      const { SUITE_ADMIN_GROUP_RADIO: _weg, ...ohne } = OK;
      const fehler = await radioBootFehler(ohne);
      expect(fehler.filter((m) => m.includes("SUITE_ADMIN_GROUP_RADIO"))).toHaveLength(1);
      // Die Meldung nennt den Vorgabewert, die Folge und dass sie den LEEREN Wert faengt.
      expect(fehler.join("\n")).toContain("iuk-radio-admin");
      expect(fehler.join("\n")).toContain("404");
      expect(fehler.join("\n")).toContain("LEEREN");
    });

    it("leere Admin-Gruppe ist derselbe Startabbruch", async () => {
      /*
       * EIGENER FALL, und er ist nicht redundant: `validateGroupConfig` meldet genau
       * diesen Zustand nicht, und " , " ist kein leerer String — er wird erst durch
       * `split(",")/trim()/filter(Boolean)` zu einer leeren Gruppenliste (Bauform woertlich
       * aus `src/app/m/lagerbuch/_lib/boot.ts:56-59`).
       */
      const { SUITE_ADMIN_GROUP_RADIO: _weg, ...ohne } = OK;
      const leer = await radioBootFehler({ ...OK, SUITE_ADMIN_GROUP_RADIO: " , " });
      const fehlend = await radioBootFehler(ohne);
      expect(leer.filter((m) => m.includes("SUITE_ADMIN_GROUP_RADIO"))).toHaveLength(1);
      expect(leer).toEqual(fehlend);
    });
  });

  describe("Pruefung 2 — SUITE_ACCESS_GROUP_RADIO ist NICHT gesetzt", () => {
    it("eine gesetzte Zugangsgruppe ist ein Startabbruch", async () => {
      /*
       * ⛔ DER FALL GILT FUER `=""` UND FUER `=irgendwas`, und deshalb steht in der
       * Pruefung `!== undefined` und nicht `!== ""`: ein GESETZTER Wert waere still
       * wirkungslos — `canAccess` steigt bei `requiresAuth: false` sofort mit `true` aus
       * (`src/core/registry.ts:265`) und liest `requiredGroups` nie; `validateGroupConfig`
       * meldet nur den LEER gesetzten Fall. Der Betreiber setzte also eine Zugangsgruppe,
       * bekaeme keine Warnung, und das Modul bliebe fuer jeden offen.
       */
      for (const wert of ["", "irgendwas"]) {
        const fehler = await radioBootFehler({ ...OK, SUITE_ACCESS_GROUP_RADIO: wert });
        expect(fehler.filter((m) => m.includes("SUITE_ACCESS_GROUP_RADIO"))).toHaveLength(1);
        expect(fehler.join("\n")).toContain("ersatzlos");
      }

      // ⛔ DIE GEGENPROBE, und sie traegt die Sonde: NICHT gesetzt meldet NICHTS.
      const ohneMeldung = await radioBootFehler(OK);
      expect(ohneMeldung.filter((m) => m.includes("SUITE_ACCESS_GROUP_RADIO"))).toHaveLength(0);
    });
  });

  describe("Pruefung 4 — RADIO_HISTORIE_MONATE (E-G3)", () => {
    it("RADIO_HISTORIE_MONATE=0 wird abgewiesen", async () => {
      /*
       * ⛔ `0` IST KEIN „AUS". 0 Monate loeschte beim ersten Lauf die gesamte
       * abgeschlossene Leihhistorie — und der Fall steht EINZELN, nicht in einer Tabelle
       * mit `-1` und `abc` versteckt (Spec:6092-6108). Abgeschaltet wird der Purge ueber
       * `RADIO_HISTORIE_PURGE=0`, und die Meldung muss genau dorthin verweisen, sonst
       * probiert der Betreiber am Cutover-Abend die naechstliegende Zahl.
       */
      const meldung = historieMonateFehler({ RADIO_HISTORIE_MONATE: "0" });
      expect(meldung).not.toBeNull();
      expect(meldung ?? "").toContain("RADIO_HISTORIE_MONATE");
      expect(meldung ?? "").toContain("RADIO_HISTORIE_PURGE=0");

      expect(() => historieMonate({ RADIO_HISTORIE_MONATE: "0" })).toThrow(/RADIO_HISTORIE_MONATE/);

      const fehler = await radioBootFehler({ ...OK, RADIO_HISTORIE_MONATE: "0" });
      expect(fehler.filter((m) => m.includes("RADIO_HISTORIE_MONATE"))).toHaveLength(1);
    });

    it("RADIO_HISTORIE_MONATE ohne Wert ergibt die Vorbelegung 2", () => {
      /*
       * ⛔ DIE ZAHL STEHT ALS LITERAL, nicht als `RETENTION_MONATE_VORGABE`: sonst pruefte
       * der Fall den Code gegen sich selbst und bliebe auch bei einer geaenderten
       * Vorbelegung gruen (dieselbe Narbe wie `_lib/grenzen.ts:102`). Der Wert 2 ist 1:1
       * `HISTORY_RETENTION_MONTHS = 2` aus
       * `radio-admin/server/src/services/retentionService.ts:9`, uebernommen in
       * `_lib/boot.ts:34`.
       *
       * LEER GESETZT GILT WIE NICHT GESETZT — `RADIO_HISTORIE_MONATE=` ist der haeufigere
       * Fall als die fehlende Zeile (jemand raeumt eine .env auf), und `Number("")` waere
       * 0, also genau der verbotene Wert (Vorbild `_lib/grenzen.ts:126-133`).
       */
      expect(historieMonate({})).toBe(2);
      expect(historieMonate({ RADIO_HISTORIE_MONATE: "" })).toBe(2);
      expect(historieMonate({ RADIO_HISTORIE_MONATE: "   " })).toBe(2);
      expect(historieMonateFehler({})).toBeNull();
      expect(historieMonateFehler({ RADIO_HISTORIE_MONATE: "" })).toBeNull();

      // Und ein gesetzter, gueltiger Wert gewinnt gegen die Vorbelegung.
      expect(historieMonate({ RADIO_HISTORIE_MONATE: "6" })).toBe(6);
      expect(historieMonate({ RADIO_HISTORIE_MONATE: " 1 " })).toBe(1);
    });

    it("RADIO_HISTORIE_MONATE=0x10 wird abgewiesen", () => {
      /*
       * DIE HEX-FALLE: `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr — eine
       * Pruefung ueber `Number` allein liesse Hex und `1e7` durch, und die GELTENDE
       * Loeschgrenze waere eine andere als die, die in der .env steht. Deshalb dieselbe
       * Ganzzahl-Regex wie `_lib/grenzen.ts:122`.
       */
      expect(Number("0x10")).toBe(16);
      expect(Number.isInteger(Number("0x10"))).toBe(true);

      const meldung = historieMonateFehler({ RADIO_HISTORIE_MONATE: "0x10" });
      expect(meldung).not.toBeNull();
      expect(meldung ?? "").toContain("0x10");
      expect(() => historieMonate({ RADIO_HISTORIE_MONATE: "0x10" })).toThrow();

      for (const roh of ["1e7", "-1", "2.5", "abc", "zwei"]) {
        expect(historieMonateFehler({ RADIO_HISTORIE_MONATE: roh })).not.toBeNull();
      }
    });
  });

  describe("sie WIRFT NIE und sie liest KEINE Tabelle", () => {
    it("radioBootFehler wirft nie", async () => {
      /*
       * ⚠️ DIE WICHTIGSTE ZEILE DIESER GRUPPE. `grenzen()` und `historieMonate()` WERFEN
       * bei einem kaputten Wert. Reichte ein Wurf durch, braeche `assertHostConfig()` mit
       * einem fremden Fehler ab — und die laeuft fuer ALLE elf Eintraege aus
       * `src/core/registry.ts:53-213` (R-G1-1: die Spec zaehlt an dieser Stelle sechs,
       * selbst nachgezaehlt sind es elf). „Und die Meldung naennte nicht einmal das
       * ausloesende Modul" (Spec:5909-5911).
       *
       * ⛔ `resolves`, NICHT `rejects`.
       */
      const kaputt: Record<string, string | undefined> = {
        SUITE_HOST_RADIO: "radio.example.test",
        SUITE_ADMIN_GROUP_RADIO: " , ",
        SUITE_ACCESS_GROUP_RADIO: "irgendwas",
        RADIO_HISTORIE_MONATE: "0x10",
        RADIO_AUSLEIH_SITZUNG_STUNDEN: "fuenf",
        RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "40",
        RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "5",
        // RADIO_AUSLEIH_SITZUNG_SECRET fehlt absichtlich.
      };
      await expect(radioBootFehler(kaputt)).resolves.toBeInstanceOf(Array);

      const fehler = await radioBootFehler(kaputt);
      /*
       * ⛔ GEPRUEFT WIRD DER INHALT, NICHT DIE LAENGE. Ein `length > 1` bliebe gruen, wenn
       * eine der sechs Pruefungen still ausfiele — und genau das ist die Fehlerform, die
       * dieser Planteil an anderer Stelle „Vollzaehligkeitsbehauptung" nennt.
       */
      for (const name of [
        "RADIO_AUSLEIH_SITZUNG_STUNDEN",
        "RADIO_AUSLEIH_SITZUNG_SECRET",
        "RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN",
        "SUITE_ADMIN_GROUP_RADIO",
        "SUITE_ACCESS_GROUP_RADIO",
        "RADIO_HISTORIE_MONATE",
      ]) {
        expect(fehler.join("\n")).toContain(name);
      }
    });

    it("radioBootFehler liest KEINE Tabelle", async () => {
      /*
       * ⛔ DER REIHENFOLGE-FALL (Auflage 2 des Planteils), und er wird GEMESSEN, nicht
       * behauptet. `radioBootFehler()` laeuft VOR `migrateAllModules()`
       * (`src/instrumentation.ts:55` vor `:56`). Ein `getDb()` in ihr ist ein Fehler, den
       * KEIN Typecheck sieht — zur Laufzeit hiesse er entweder „Tabelle existiert nicht"
       * beim allerersten Start oder, schlimmer, ein still angelegtes leeres Schema.
       *
       * ⛔ WARUM DIE ENTSTANDENE DATEI DER BEWEIS IST: `openModuleDatabase` legt
       * Verzeichnis und Datei bei Bedarf NEU an (`src/core/db/index.ts:12-17`,
       * Analyse-Falle 29). Ein reiner Quelltext-Scan auf `getDb` waere die schwaechere
       * Form und liesse einen mittelbaren Import durch.
       *
       * ⚠️ DER DB-CACHE LIEGT AUF `globalThis` (`src/core/db/index.ts:25`) — nicht in
       * einem Modulzustand. Haette in diesem Worker schon irgendetwas radios Datenbank
       * geoeffnet, saehe ein Tabellenzugriff hier einen Cache-Treffer und legte KEINE
       * Datei an: der Fall waere gruen und maesse nichts. Das Zuruecksetzen ist deshalb
       * Teil der Messung, nicht Hygiene.
       */
      delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

      // Der Anker, ohne den der Fall das falsche Verzeichnis beobachtete.
      expect(moduleDbPath("radio")).toBe(join(leeresDataDir, "radio.db"));
      expect(readdirSync(leeresDataDir)).toEqual([]);

      await expect(radioBootFehler(OK)).resolves.toEqual([]);

      expect(existsSync(join(leeresDataDir, "radio.db"))).toBe(false);
      expect(readdirSync(leeresDataDir)).toEqual([]);
    });
  });

  describe("die zwei Traefik-Meldungen — warn, und KEIN Rueckgabewert (§7.3.4)", () => {
    it("ein fehlender radio-Host in SUITE_TRAEFIK_RULE meldet, bricht aber nicht ab", async () => {
      /*
       * Die Traefik-Labels leben serverseitig in der .env (`compose.yaml:153`); ein
       * Abbruch traefe genau dann, wenn der Betreiber sie gerade umstellt. Grenzregel
       * woertlich (Spec:5936-5938): „Werfen darf nur, was `radio` fuer seine eigenen
       * Nutzer falsch macht und im Repo bzw. in der .env behebbar ist."
       */
      const fehler = await radioBootFehler({
        ...OK,
        SUITE_TRAEFIK_RULE: "Host(`iuk-ue.de`)",
      });
      expect(fehler).toEqual([]);
      expect(warnText()).toContain("SUITE_TRAEFIK_RULE");
      expect(warnText()).toContain("radio.example.test");

      /*
       * ⛔ UND DIE GEGENRICHTUNG: GROSSSCHREIBUNG IST KEIN ANDERER HOST. Hostnamen sind
       * fallunabhaengig, und der Laufzeitpfad rechnet damit — `src/core/registry.ts:252`
       * senkt den Host auf Kleinschreibung, `:255` vergleicht kleingeschrieben. Ein
       * gross geschriebenes SUITE_HOST_RADIO gegen eine klein geschriebene Regel meldete
       * sonst einen Fehler, den es nicht gibt, und stuende beim Cutover-Log-Blick als
       * Stopp-Punkt da.
       *
       * ⚠️ HEUTE TRAEGT `envHostsFor` DIE SENKUNG SCHON (`src/core/hosts.ts:44`), dieser
       * Fall ist also eine Regressionssperre und keine Messung eines eigenen Zweigs. Er
       * steht trotzdem hier, weil die Zusage „gross = klein" auf dem Weg der .env
       * NIRGENDS SONST in diesem Modul festgehalten ist.
       */
      vi.mocked(console.warn).mockClear();
      await expect(
        radioBootFehler({
          ...OK,
          SUITE_HOST_RADIO: "Radio.Example.Test",
          SUITE_TRAEFIK_RULE: "Host(`radio.example.test`)",
        }),
      ).resolves.toEqual([]);
      expect(warnText()).toBe("");
    });

    it("ein radio-admin-Host in SUITE_TRAEFIK_RULE meldet, bricht aber nicht ab", async () => {
      /*
       * Analyse-Falle 28 (`docs/radio-portierung-analyse.md:1646-1652`): der Alt-Host darf
       * dort ausdruecklich NICHT stehen — `moduleForHost` liefert fuer ihn PORTAL statt
       * einer Weiterleitung, und der Alt-Kiosk bekaeme die Portal-Startseite.
       */
      const fehler = await radioBootFehler({
        ...OK,
        SUITE_TRAEFIK_RULE: "Host(`radio.example.test`) || Host(`radio-admin.example.test`)",
      });
      expect(fehler).toEqual([]);
      expect(warnText()).toContain("radio-admin.example.test");
      // Die ERSTE Meldung schweigt hier, denn der radio-Host steht in der Regel.
      expect(warnText()).not.toContain("nennt diesen Host nicht");

      /*
       * ⛔ EIN GROSS GESCHRIEBENER ALT-HOST DARF NICHT DURCHRUTSCHEN. `moduleForHost`
       * senkt den Host auf Kleinschreibung (`src/core/registry.ts:252`) und findet fuer
       * `Radio-Admin.example.test` genauso kein Modul — Falle 28 greift unveraendert, der
       * Alt-Kiosk bekaeme die Portal-Startseite. Ein Scan, der ihn nicht sieht, waere
       * falsch-negativ und still, und genau diese Richtung verbietet die Lehre aus
       * `_lib/quelltextScan.ts:55-59`: „ein Scan darf falsch-positiv sein und laut, nie
       * falsch-negativ und still."
       *
       * ⚠️ Die Meldung nennt den Wert in der SCHREIBWEISE DER .env, nicht kleingeschrieben —
       * wer die Zeile suchen soll, sucht nach dem, was er getippt hat.
       */
      vi.mocked(console.warn).mockClear();
      await expect(
        radioBootFehler({
          ...OK,
          SUITE_TRAEFIK_RULE: "Host(`radio.example.test`) || Host(`Radio-Admin.example.test`)",
        }),
      ).resolves.toEqual([]);
      expect(warnText()).toContain("Radio-Admin.example.test");
    });

    it("beide Traefik-Meldungen bleiben still, wenn SUITE_TRAEFIK_RULE fehlt", async () => {
      // Ein Dev-Container hat die Variable legitim nicht.
      const { SUITE_TRAEFIK_RULE: _weg, ...ohne } = OK;
      await expect(radioBootFehler(ohne)).resolves.toEqual([]);
      expect(warnText()).toBe("");

      await expect(radioBootFehler({ ...OK, SUITE_TRAEFIK_RULE: "  " })).resolves.toEqual([]);
      expect(warnText()).toBe("");
    });
  });

  describe("die zwei Melde-Zeilen — info, und KEIN Rueckgabewert", () => {
    it("der Zustand von SUITE_UPDATER_GROUP_RADIO wird als info gemeldet, in allen drei Faellen", async () => {
      /*
       * NS-V4, woertlich: ein gesetzter, aber LEERER Wert ist gueltig („niemand ist
       * Updater") und darf NICHT abbrechen; ein Tippfehler ist von aussen nicht
       * unterscheidbar. Deshalb prueft der Boot-Helfer nicht den INHALT, sondern meldet
       * den ZUSTAND laut.
       *
       * ⛔ DREI VERSCHIEDENE TEXTE, NICHT DREIMAL DERSELBE. Eine Zeile, die in allen drei
       * Zustaenden gleich lautet, meldete keinen Zustand — sie waere die konstante
       * Abschlusszeile, an der dieses Repo sich schon einmal verbrannt hat.
       */
      const { SUITE_UPDATER_GROUP_RADIO: _weg, ...ohneUpdater } = OK;
      const faelle: Record<string, string | undefined>[] = [
        { ...OK, SUITE_UPDATER_GROUP_RADIO: "iuk-radio-updater" },
        { ...OK, SUITE_UPDATER_GROUP_RADIO: "" },
        ohneUpdater,
      ];

      const texte = new Set<string>();
      for (const env of faelle) {
        vi.mocked(console.info).mockClear();
        vi.mocked(console.warn).mockClear();

        const fehler = await radioBootFehler(env);
        // ⛔ NIE eine Rueckgabezeile.
        expect(fehler.filter((m) => m.includes("SUITE_UPDATER_GROUP_RADIO"))).toHaveLength(0);
        expect(fehler).toEqual([]);

        const zeilen = infoText()
          .split("\n")
          .filter((z) => z.includes("SUITE_UPDATER_GROUP_RADIO"));
        expect(zeilen).toHaveLength(1);
        // ⛔ `info`, nie `warn` — ein `warn` waere ein Stopp-Punkt fuers Runbook.
        expect(warnText()).not.toContain("SUITE_UPDATER_GROUP_RADIO");
        texte.add(zeilen[0]);
      }
      expect(texte.size).toBe(3);
    });

    it("eine fehlende radio.db wird als info gemeldet, nicht als warn", async () => {
      /*
       * ⬜ G-L2, entschieden. Die Zeile steht HIER und nicht in `starteRadioHintergrund()`,
       * weil sie dort gemessen NIE feuern koennte: `src/instrumentation.ts:56` ruft
       * `migrateAllModules()` VOR `:60` `startBackgroundWork()`, und
       * `src/core/bootstrap.ts:114` legt ueber `openModuleDatabase(moduleDbPath("radio"))`
       * Verzeichnis UND Datei an (`src/core/db/index.ts:12-17`).
       *
       * ⛔ `info` UND NICHT `warn`, und die Stufe ist genauso tragend wie die Meldung:
       * beim ERSTEN Deploy (der laut Auflage 1 den Abraeum-Worker traegt und VOR dem
       * Import liegt) existiert `radio.db` legitim noch nicht — ein `warn` machte einen
       * vorgeschriebenen, normalen Deploy zum Stopp-Punkt. Ihre Alarmwirkung holt das
       * Runbook, indem es sie an einem benannten Punkt NICHT sehen darf (Zusage 16).
       *
       * ⛔ `existsSync` IST KEIN TABELLENZUGRIFF und legt nichts an — B8 und der Fall
       * `radioBootFehler liest KEINE Tabelle` bleiben unberuehrt.
       */
      // Haelfte 1 — frisches, leeres DATA_DIR.
      expect(existsSync(join(leeresDataDir, "radio.db"))).toBe(false);
      const fehler = await radioBootFehler(OK);
      expect(fehler).toEqual([]);

      const infoZeilen = infoText()
        .split("\n")
        .filter((z) => z.includes("radio.db"));
      expect(infoZeilen).toHaveLength(1);
      expect(warnText()).not.toContain("radio.db");

      // Haelfte 2 — dasselbe DATA_DIR, aber die Datei ist da.
      vi.mocked(console.info).mockClear();
      vi.mocked(console.warn).mockClear();
      writeFileSync(join(leeresDataDir, "radio.db"), "");

      await expect(radioBootFehler(OK)).resolves.toEqual([]);
      expect(infoText().split("\n").filter((z) => z.includes("radio.db"))).toHaveLength(0);
      expect(warnText()).not.toContain("radio.db");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLANTEIL 5 / G4 — DER RETENTION-TAKT (§2.7.2, §7.3.5).
//
// DER DRITTE BESCHREIBENDE ORT DIESER DATEI. Die fuenf Takt-Faelle aus §2.7.2 stehen
// hier, weil sie den Timer brauchen; die Rechnung darunter (`raeumeLeihhistorie`) hat
// ihre eigenen Faelle weiter oben, und keine Zeile steht doppelt.
//
// ⛔ DIE FIXTUR IST EINE ABGESCHLOSSENE LEIHE, deren `returned_at` AELTER ist als
// `retentionGrenze(jetzt, 2)`. Das Wort "ueberfaellig" aus dem Kapiteltext waere hier
// falsch: "ueberfaellig" heisst im Leihwesen NOCH NICHT ZURUECKGEGEBEN, also
// `returned_at IS NULL` — und genau so eine Leihe wird NIE geloescht
// (`_lib/boot.ts:71-78`, `and(isNotNull(returnedAt), lt(returnedAt, grenze))`; der
// Bestandsfall dazu heisst `eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist`).
// Wer das Wort woertlich naehme, baute die Regressionssperre gruen aus dem falschen Grund.
// ─────────────────────────────────────────────────────────────────────────────

describe("Planteil 5 / G4 — der Retention-Takt", () => {
  /*
   * ⛔ EIN FESTES DATUM IN DER MONATSMITTE, und es ist tragend, nicht kosmetisch.
   * `retentionGrenze` rechnet in KALENDERMONATEN (`_lib/boot.ts:49-53`,
   * `d.setUTCMonth(d.getUTCMonth() - monate)`). Auf einer Basis nahe dem Monatsende
   * verschiebt sich die Grenze ueber 24 Stunden NICHT um 24 Stunden — der Bestandsfall
   * `retentionGrenze auf 2026-04-30 ergibt 2026-03-02` haelt genau diese Klemmung fest.
   * Der Fall `der Cutoff wird bei jedem Lauf neu gerechnet` waere ohne feste Basis
   * rennabhaengig rot oder gruen, also kein Waechter.
   */
  const BASIS = new Date("2026-08-15T12:00:00Z");
  const ERSTLAUF_MS = RADIO_HISTORIE_ERSTLAUF_MINUTEN_VORGABE * 60_000;

  /** Der Schalter, den `radio` einschaltet — dieselbe Variable wie in `radioBootFehler()`. */
  const TAKT_ENV: Record<string, string | undefined> = {
    SUITE_HOST_RADIO: "radio.example.test",
  };

  let taktTmp: string;
  let taktSqlite: Database.Database;

  /** Ein migriertes Handle auf eine eigene Datei — nie `getModuleDb()` (Bauform 26). */
  function frischeDb(datei: string): { sqlite: Database.Database; db: DB } {
    const roh = new Database(datei);
    roh.pragma("foreign_keys = ON");
    migrate(drizzle(roh), { migrationsFolder: "src/app/m/radio/_db/migrations" });
    return { sqlite: roh, db: drizzle(roh, { schema }) as unknown as DB };
  }

  /*
   * DER LAUFZAEHLER, und warum er ueber `db.delete` geht statt ueber eine Protokollzeile:
   * ein Lauf ist genau ein `db.delete(loans)` (`_lib/boot.ts:71-78`), und der Zaehler
   * misst damit die LAEUFE, nicht die geloeschten Zeilen. Ueber geloeschte Zeilen waere
   * er blind: zwei Laeufe im selben Vorspulschritt loeschen dieselbe Menge, der zweite
   * findet nichts mehr — genau die Idempotenz, die `_lib/boot.ts:58-60` ausschreibt.
   * Und eine eigene Protokollzeile je Lauf waere eine fuenfte Melde-Zeile, die der Plan
   * nicht bestellt hat (Melde-Zeilen-Tafel, `briefs/KOPF.md:832-837`).
   */
  function mitLaufzaehler(db: DB): DB {
    return new Proxy(db as object, {
      get(ziel, name, empfaenger) {
        if (name === "delete") dbHalter.deleteZugriffe += 1;
        return Reflect.get(ziel, name, empfaenger);
      },
    }) as DB;
  }

  const laeufe = () => dbHalter.deleteZugriffe;

  const infoZeilen = (anker: string) =>
    vi
      .mocked(console.info)
      .mock.calls.flat()
      .map((a) => String(a))
      .filter((z) => z.includes(anker));

  const warnText = () =>
    vi
      .mocked(console.warn)
      .mock.calls.flat()
      .map((a) => String(a))
      .join("\n");

  const fehlerText = () =>
    vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((a) => String(a))
      .join("\n");

  const zeilen = () => taktSqlite.prepare("select count(*) as n from loans").get() as { n: number };

  /** Eine ABGESCHLOSSENE Leihe — `returned_at` gesetzt und aelter als die Grenze. */
  function schreibeAbgeschlosseneLeihe(id: string, zurueck: Date): void {
    const db = dbHalter.db;
    db.insert(loans)
      .values({
        id,
        deviceId: "g-1",
        snapshotCallSign: "Muehlheim 1/83",
        borrowerName: "Seed Person",
        borrowedAt: new Date("2026-01-01T10:00:00Z"),
        returnedAt: zurueck,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        updatedAt: new Date("2026-01-01T10:00:00Z"),
      })
      .run();
  }

  /** Aelter als jede Grenze, die in diesen Faellen vorkommt. */
  const LAENGST_FAELLIG = new Date("2026-05-01T10:00:00Z");

  beforeEach(() => {
    taktTmp = mkdtempSync(join(tmpdir(), "radio-takt-"));
    const frisch = frischeDb(join(taktTmp, "radio.db"));
    taktSqlite = frisch.sqlite;
    dbHalter.deleteZugriffe = 0;
    dbHalter.db = mitLaufzaehler(frisch.db);
    vi.useFakeTimers();
    vi.setSystemTime(BASIS);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stoppeRadioHintergrund();
    vi.useRealTimers();
    vi.restoreAllMocks();
    try {
      taktSqlite.close();
    } catch {
      // In `ein Fehler im Lauf …` ist das Handle absichtlich schon zu.
    }
    rmSync(taktTmp, { recursive: true, force: true });
  });

  it("die gefaelschte Uhr faelscht auch Date — sonst misst der Cutoff-Fall nichts", () => {
    /*
     * ⛔ GEMESSEN, NICHT ANGENOMMEN. Der Fall `der Cutoff wird bei jedem Lauf neu
     * gerechnet` haengt vollstaendig daran, dass `new Date()` in `retentionGrenze`
     * (`_lib/boot.ts:49`) der gefaelschten Uhr folgt — `raeumeLeihhistorie(getDb(),
     * undefined, …)` reicht KEIN `jetzt` durch. Faelscht `vi.useFakeTimers()` in dieser
     * vitest-Fassung `Date` nicht, ist jener Fall gruen oder rot aus Zufall und bewacht
     * nichts. Diese Zeile ist die Sonde, die das entscheidet, und sie steht im Test statt
     * in einem Bericht, weil ein Versionswechsel sie sonst still ueberholt.
     */
    expect(new Date().toISOString()).toBe("2026-08-15T12:00:00.000Z");
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(new Date().toISOString()).toBe("2026-08-16T12:00:00.000Z");
  });

  it("starteRadioHintergrund loescht beim Start NICHTS", () => {
    /*
     * ⛔ DIE REGRESSIONSSPERRE gegen den zurueckgebauten Sofort-Purge. Sie ist seit
     * Planteil 1 ausdruecklich offen gefuehrt („das ist bewusst und steht hier, damit es
     * niemand fuer vergessen haelt") und schliesst hier.
     *
     * ⚠️ Die Fixtur ist ABGESCHLOSSEN und laengst ueberfaellig — waere sie aktiv
     * (`returned_at IS NULL`), bliebe sie ohnehin stehen und dieser Fall waere gruen,
     * ohne irgendetwas zu messen. Der Gegenbeweis steht im Fall darunter: DIESELBE Leihe
     * ist nach dem Erstlauf weg.
     */
    schreibeAbgeschlosseneLeihe("l-alt", LAENGST_FAELLIG);
    starteRadioHintergrund(TAKT_ENV);
    vi.advanceTimersByTime(0);
    expect(laeufe()).toBe(0);
    expect(zeilen().n).toBe(1);
  });

  it("nach RADIO_HISTORIE_ERSTLAUF_MINUTEN laeuft der erste Lauf", () => {
    schreibeAbgeschlosseneLeihe("l-alt", LAENGST_FAELLIG);
    starteRadioHintergrund(TAKT_ENV);
    vi.advanceTimersByTime(ERSTLAUF_MS);
    expect(laeufe()).toBe(1);
    expect(zeilen().n).toBe(0);
  });

  it("RADIO_HISTORIE_PURGE=0 registriert gar keinen Timer", () => {
    schreibeAbgeschlosseneLeihe("l-alt", LAENGST_FAELLIG);
    starteRadioHintergrund({ ...TAKT_ENV, RADIO_HISTORIE_PURGE: "0" });

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(ERSTLAUF_MS + 30 * RADIO_HISTORIE_TAKT_MS);
    expect(laeufe()).toBe(0);
    expect(zeilen().n).toBe(1);
    expect(infoZeilen("Retention abgeschaltet")).toHaveLength(1);
  });

  it("zweimaliger Aufruf startet nur einen Timer", () => {
    /*
     * ⛔ ZWEI FENSTER, UND DER PLAN NENNT NUR EINS. Zwischen Registrierung und Erstlauf
     * haelt die ERSTLAUF-Uhr die Wache; danach die TAKT-Uhr. Weil Erstlauf (1440 min) und
     * Takt (24 h) gleich lang sind, laegen "zwei Aufrufe und ein Takt" beide im ersten
     * Fenster — die Wache ueber `purgeUhr` bliebe ungeprueft, und ihre Mutationssonde
     * ergaebe 0 rot. Genau die ist die gefaehrlichere: die Takt-Uhr lebt den ganzen
     * Prozess, und jeder Lauf ist ein LOESCHEREIGNIS.
     *
     * ⛔ WAS DIESE WACHE NICHT LEISTET: sie faengt wiederholte Aufrufe in DERSELBEN
     * Modulinstanz. Ein Hot Reload, der das Modul NEU instanziiert, setzt die beiden
     * Modul-`let` wieder auf `undefined` und ist davon NICHT gedeckt — siehe den
     * Quelltextkommentar bei der Wache.
     */
    // Fenster 1 — die Erstlauf-Uhr.
    starteRadioHintergrund(TAKT_ENV);
    starteRadioHintergrund(TAKT_ENV);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(ERSTLAUF_MS);
    expect(laeufe()).toBe(1);

    // Fenster 2 — jetzt haelt die Takt-Uhr die Wache.
    starteRadioHintergrund(TAKT_ENV);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(RADIO_HISTORIE_TAKT_MS);
    expect(laeufe()).toBe(2);
  });

  it("ein Fehler im Lauf wirft nicht aus dem Takt heraus", () => {
    starteRadioHintergrund(TAKT_ENV);

    // Eine geschlossene Verbindung — der Lauf scheitert, der Takt nicht.
    taktSqlite.close();
    expect(() => vi.advanceTimersByTime(ERSTLAUF_MS)).not.toThrow();
    expect(fehlerText()).toContain("[radio]");
    expect(vi.getTimerCount()).toBe(1);

    /*
     * ⛔ DER TAKT LAEUFT WEITER, und das ist die eigentliche Zusage: ein Fehler in EINEM
     * Lauf darf die Loeschrichtlinie nicht fuer den Rest der Prozesslaufzeit anhalten.
     * Gemessen an einem frischen Handle und einem zweiten Takt.
     */
    const zweit = frischeDb(join(taktTmp, "radio-zwei.db"));
    taktSqlite = zweit.sqlite;
    dbHalter.db = mitLaufzaehler(zweit.db);
    schreibeAbgeschlosseneLeihe("l-alt", LAENGST_FAELLIG);
    vi.advanceTimersByTime(RADIO_HISTORIE_TAKT_MS);
    expect(zeilen().n).toBe(0);
  });

  it("die console.info-Zeile steht bei JEDEM Start, nicht nur beim ersten", () => {
    /*
     * ⛔ SONST IST EIN NACH DEM CUTOVER-FENSTER VERGESSENES `RADIO_HISTORIE_PURGE=0` ein
     * STILLER Verlust der Loeschrichtlinie — und die ist der DSGVO-Grund dafuer, dass
     * `borrower_name` ueberhaupt gespeichert werden darf.
     *
     * ⛔ `info` UND NICHT `warn`: `warn` = Stopp, `info` = Zustand. Der Cutover schaltet
     * die Retention VORGESCHRIEBEN ab (Runbook §4.6 Nr. 9); ein `warn` machte diesen
     * vorgeschriebenen Zustand zur eigenen Stopp-Bedingung des Runbooks.
     */
    const env = { ...TAKT_ENV, RADIO_HISTORIE_PURGE: "0" };
    stoppeRadioHintergrund();
    starteRadioHintergrund(env);
    stoppeRadioHintergrund();
    starteRadioHintergrund(env);

    expect(infoZeilen("Retention abgeschaltet")).toHaveLength(2);
    expect(warnText()).not.toContain("Retention abgeschaltet");
  });

  it("der Cutoff wird bei jedem Lauf neu gerechnet", () => {
    /*
     * ⛔ EIN PROZESS LAEUFT WOCHENLANG. Ein beim Registrieren gemerkter Cutoff bliebe auf
     * dem Startzeitpunkt stehen, und die Richtlinie liefe still aus dem Takt: nach einem
     * Monat Laufzeit loeschte der Takt Leihen, die einen Monat zu alt sind, statt zwei.
     *
     * Die Rechnung, gegen `BASIS` = 2026-08-15T12:00Z:
     *   Erstlauf  t+24h = 2026-08-16T12:00Z -> Grenze 2026-06-16T12:00Z
     *   Zweiter   t+48h = 2026-08-17T12:00Z -> Grenze 2026-06-17T12:00Z
     * Die Fixtur liegt mit 2026-06-16T18:00Z dazwischen: beim ersten Lauf INNERHALB der
     * Frist, beim zweiten davor.
     */
    schreibeAbgeschlosseneLeihe("l-knapp", new Date("2026-06-16T18:00:00Z"));
    starteRadioHintergrund(TAKT_ENV);

    vi.advanceTimersByTime(ERSTLAUF_MS);
    expect(laeufe()).toBe(1);
    expect(zeilen().n).toBe(1);

    vi.advanceTimersByTime(RADIO_HISTORIE_TAKT_MS);
    expect(laeufe()).toBe(2);
    expect(zeilen().n).toBe(0);
  });

  it("die Bestandswarnung steht hinter dem Host-Schalter, der Timer NICHT", () => {
    /*
     * ⛔ DIE SONDE FUER B5, und sie ist die schaerfste Stelle dieser Aufgabe. Eine
     * vergessene `SUITE_HOST_RADIO` darf die Bestandswarnung verstummen lassen — eine
     * Warnung ueber einen Bestand, den dieser Container gar nicht bedient, ist Laerm.
     * Sie darf aber NIEMALS die Loeschrichtlinie mit abschalten: der Takt braucht keine
     * Konfiguration, nur die Tabelle, und ein Riegel darauf waere ein STILLER Verlust
     * genau der Richtlinie, die `borrower_name` rechtfertigt. Der Abschalter heisst
     * `RADIO_HISTORIE_PURGE=0` und ist bei jedem Start laut.
     */
    // Haelfte 1 — MIT Host: die Warnung steht. Ohne diesen Anker misst Haelfte 2 nichts.
    starteRadioHintergrund(TAKT_ENV);
    expect(warnText()).toContain("devices");
    stoppeRadioHintergrund();
    vi.mocked(console.warn).mockClear();

    // Haelfte 2 — OHNE Host: keine Warnung, aber der Takt loescht trotzdem.
    schreibeAbgeschlosseneLeihe("l-alt", LAENGST_FAELLIG);
    starteRadioHintergrund({});
    expect(warnText()).toBe("");

    vi.advanceTimersByTime(ERSTLAUF_MS);
    expect(laeufe()).toBe(1);
    expect(zeilen().n).toBe(0);
  });

  it("stoppeRadioHintergrund macht einen erneuten Start wieder moeglich", () => {
    /*
     * Ohne diese Zusage ueberlebte der Modulzustand den einzelnen Fall, und alle Faelle
     * oben waeren reihenfolgeabhaengig — der zweite Aufruf liefe stumm in die HMR-Wache.
     */
    starteRadioHintergrund(TAKT_ENV);
    expect(vi.getTimerCount()).toBe(1);

    stoppeRadioHintergrund();
    expect(vi.getTimerCount()).toBe(0);

    schreibeAbgeschlosseneLeihe("l-alt", LAENGST_FAELLIG);
    starteRadioHintergrund(TAKT_ENV);
    vi.advanceTimersByTime(ERSTLAUF_MS);
    expect(laeufe()).toBe(1);
    expect(zeilen().n).toBe(0);
  });

  it("die Bestandswarnung schweigt, sobald ein Geraet im Bestand steht", () => {
    /*
     * Die Gegenrichtung zu Haelfte 1 oben — ohne sie waere die Warnung eine Konstante,
     * die bei JEDEM Start feuert, und der Runbook-Blick auf „keine [radio]-WARNUNG"
     * koennte nie bestehen. `devices` ist die Tabelle, die der Import fuellt.
     */
    dbHalter.db
      .insert(devices)
      .values({
        id: "g-1",
        issi: "1234567",
        rufname: "Muehlheim 1/83",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        updatedAt: new Date("2026-01-01T10:00:00Z"),
      })
      .run();

    starteRadioHintergrund(TAKT_ENV);
    expect(warnText()).toBe("");
  });
});
