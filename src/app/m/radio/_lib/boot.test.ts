// src/app/m/radio/_lib/boot.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../_db/schema";
import { loans } from "../_db/schema";
import { moduleDbPath } from "@/core/db";
import {
  retentionGrenze,
  raeumeLeihhistorie,
  radioBootFehler,
  historieMonate,
  historieMonateFehler,
} from "./boot";

/**
 * EINE DATEI, DREI BESCHREIBENDE ORTE, KEINE ZEILE DOPPELT (Spec 1 B5): hier stehen die
 * REINEN Faelle ueber `retentionGrenze` und die DB-Faelle ueber `raeumeLeihhistorie`
 * (§8.2.5 / §2.7.3). Die fuenf TAKT-Faelle mit `vi.useFakeTimers()` (§2.7.2) und die
 * Boot-Pruefungen (§7.3.7) kommen mit Planteil 5 in DIESE Datei — nicht in eine zweite.
 * Es gibt KEIN `_lib/retention.test.ts`.
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
