import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as radioSchema from "@/app/m/radio/_db/schema";
import {
  baueQuellDb,
  ALLE_QUELLZEILEN,
  baueBespielteQuellDb,
  ALT_GERAET,
  ALT_GERAET_OHNE_ANGABE,
  ALT_BENUTZER,
  ALT_VERSION,
  ALT_VERSION_ZWEIT,
  ALT_EREIGNIS,
  ALT_EREIGNIS_UNBEKANNT,
  ALT_LEIHE,
  ALT_LEIHE_AKTIV,
} from "./fixtures/radio-quelle";
import {
  msZuDatum,
  msZuDatumOptional,
  tagInBerlin,
  zuBoolOptional,
  pruefeQuelle,
  lieseQuelle,
  toNeuesGeraet,
  toNeuenBenutzer,
  toNeueSoftwareVersion,
  toNeuesGeraeteEreignis,
  toNeueLeihe,
  paritaetsSichtGeraet,
  getaggteQuellzeilen,
  importiereRadio,
  checkRadioParitaet,
} from "./radio";

const DIR = "./.data/radio-import-test";

/**
 * Direkt gebaute, migrierte DB — NICHT getModuleDb(): dessen globaler Cache ist per
 * Modulschluessel gekeyt, nicht per DATA_DIR (src/core/db/index.ts:31-35), und gaebe
 * zwischen Tests ein stale Handle auf die alte Datei zurueck. Der Grund steht
 * ausgeschrieben in scripts/import/portal.test.ts:23-25.
 *
 * ⚠️ `foreign_keys = ON` steht hier eigens: es ist eine VERBINDUNGS-Eigenschaft, keine der
 * Datei (src/app/m/lagerbuch/_db/migrations.test.ts:33-35). Ohne die Zeile liefe der
 * Waisen-Test unten gruen durch, und die Einfuegereihenfolge waere unbewiesen.
 *
 * N1 (Nachtrag des Controllers): Rueckgabetyp `ReturnType<typeof drizzle<typeof radioSchema>>`,
 * NICHT `BetterSQLite3Database<typeof radioSchema>` — letzterer deklariert kein `$client`
 * (node_modules/drizzle-orm/better-sqlite3/driver.d.ts:8-24). Hausform: migrations.test.ts:30.
 */
function frischeZielDb(): ReturnType<typeof drizzle<typeof radioSchema>> {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const sqlite = new Database(`${DIR}/radio.db`);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema: radioSchema });
  migrate(db, { migrationsFolder: "./src/app/m/radio/_db/migrations" });
  return db;
}
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("radio-quelle-ddl.sql — die kopierte Quell-DDL", () => {
  it("legt die SECHS Quelltabellen an — fuenf aus 0000, `loans` aus 0003", () => {
    const db = baueQuellDb();
    try {
      const namen = db
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all()
        .map((r) => (r as { name: string }).name);
      expect(namen).toEqual([
        "api_tokens",
        "device_events",
        "devices",
        "loans",
        "software_versions",
        "users",
      ]);
    } finally {
      db.close();
    }
  });

  // Die Zusicherung (a) des Reihenfolge-Tests aus Spec 2 §1.8. Sie steht hier und nicht
  // erst in Aufgabe 5, weil sie ohne das Zielschema auskommt — und weil sie die Fixture
  // selbst prueft: dass hier wirklich die PRODUKTIVE Form liegt und nicht eine
  // nachgeschriebene. Zusicherung (b) (der Mapper liest namentlich) kommt in Aufgabe 5 dazu.
  it("radio-quelle-ddl.sql: devices traegt update_note an Position 24 und tei an Position 25", () => {
    const db = baueQuellDb();
    try {
      const spalten = db
        .prepare("select cid, name from pragma_table_info('devices') order by cid")
        .all() as Array<{ cid: number; name: string }>;
      expect(spalten).toHaveLength(25);
      // ZAEHLWEISE: `pragma_table_info` liefert `cid` 0-basiert, der Testname zaehlt
      // "Position" 1-basiert. Position 24 = cid 23 = update_note (aus 0001),
      // Position 25 = cid 24 = tei (aus 0004). Gemessen am echten Schema
      // (plan-kopf.md:139: "cid 23 = update_note, cid 24 = tei").
      // Eine Zusicherung mit der falschen Basis waere gruen und pruefte nichts.
      expect(spalten[spalten.length - 2]).toEqual({ cid: 23, name: "update_note" });
      expect(spalten[spalten.length - 1]).toEqual({ cid: 24, name: "tei" });
      // ⚠️ Die zwei Zeilen darüber tragen den SCHWANZ der Tabelle — und nur ihn. Gemessen:
      // vertauscht man in der DDL `alamos_integrated` und `loanable`, bleiben sie GRÜN,
      // obwohl der B4-Brief genau dieses Paar als den teuersten Einzelposten führt
      // (Zielposition 20: `loanable` empfängt `created_at`, danach ist jedes Gerät
      // ausleihbar). Deshalb steht hier zusätzlich die ganze Reihenfolge, Position für
      // Position. Sie ist der einzige im Repo lebende Riegel dagegen, dass jemand die
      // Fixture-DDL „glattzieht" (radio-quelle-ddl.sql:31-34) — nach Spec 2 Kapitel 5 ist
      // diese Datei die letzte Kopie der Quell-DDL in einem lebenden Repo.
      expect(spalten.map((s) => s.name)).toEqual([
        "id",
        "rufname",
        "issi",
        "serial_number",
        "device_type",
        "status",
        "location",
        "assigned_to",
        "software_version",
        "last_updated_at",
        "notes",
        "hiorg_id",
        "opta",
        "funktion",
        "hersteller",
        "bedieneinheit",
        "device_modes",
        "alamos_integrated",
        "loanable",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "update_note",
        "tei",
      ]);
    } finally {
      db.close();
    }
  });

  // ⚠️ STRUKTUR, nicht Text. `sqlite_master.sql` speichert die CREATE-Anweisung
  // zeichengleich so, wie sie ausgefuehrt wurde — und die Quell-Migration schreibt sie mit
  // BACKTICKS: CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`)
  // WHERE `returned_at` IS NULL. Gemessen: instr(sql, 'WHERE returned_at IS NULL') = 0.
  // Ein Textvergleich waere hier rot gegen eine vollkommen korrekte DDL.
  it("loans traegt den PARTIELLEN Unique-Index loans_device_active_uidx", () => {
    const db = baueQuellDb();
    try {
      const treffer = db
        .prepare(
          `select name, partial, "unique" from pragma_index_list('loans')
            where name = 'loans_device_active_uidx'`,
        )
        .all();
      expect(treffer).toEqual([{ name: "loans_device_active_uidx", partial: 1, unique: 1 }]);
    } finally {
      db.close();
    }
  });
});

describe("radio-quelle.ts — die Fixture-Werte", () => {
  /**
   * Spec 2 §1.3.4 setzt die Regel „je Feld ein anderer Wert" und zaehlt darunter die
   * Konstanten von Hand auf. ⚠️ Eine Wortzahl neben einer Liste ist genau der Fehlertyp,
   * den W8 zweimal als tragend einstuft — und sie wandert mit jeder neuen Fixture-Zeile.
   * Deshalb steht hier die MECHANIK und nicht die Zahl.
   *
   * Was geprueft wird: kein Millisekunden-Wert steht unter ZWEI verschiedenen
   * `tabelle.feld`-Beschriftungen. Dass ALT_GERAET und ALT_GERAET_OHNE_ANGABE denselben
   * `created_at` tragen, ist erlaubt und gewollt — es ist DASSELBE Feld. Eine Vertauschung
   * faengt nur, wer verschiedene FELDER verschieden belegt.
   */
  it("kein Millisekunden-Wert der Fixture steht unter zwei verschiedenen Feldern", () => {
    const felderJeWert = new Map<number, Set<string>>();
    for (const { tabelle, zeile } of ALLE_QUELLZEILEN) {
      for (const [feld, wert] of Object.entries(zeile)) {
        if (typeof wert !== "number" || wert < 1_000_000_000_000) continue;
        const menge = felderJeWert.get(wert) ?? new Set<string>();
        menge.add(`${tabelle}.${feld}`);
        felderJeWert.set(wert, menge);
      }
    }
    expect(felderJeWert.size).toBeGreaterThan(0);
    const kollisionen = [...felderJeWert]
      .filter(([, felder]) => felder.size > 1)
      .map(([wert, felder]) => `${wert}: ${[...felder].sort().join(" / ")}`);
    expect(kollisionen).toEqual([]);
  });

  it("spieleQuellFixtureEin fuellt fuenf Tabellen und laesst api_tokens leer", () => {
    const db = baueBespielteQuellDb();
    try {
      const zaehle = (t: string) =>
        (db.prepare(`select count(*) as n from ${t}`).get() as { n: number }).n;
      expect(zaehle("users")).toBe(1);
      expect(zaehle("software_versions")).toBe(2);
      expect(zaehle("devices")).toBe(2);
      expect(zaehle("device_events")).toBe(1);
      expect(zaehle("loans")).toBe(2);
      // Die Tabelle steht in der Quelle und wandert NICHT (B16, W4). Sie bleibt leer,
      // damit kein Test sie versehentlich als Import-Sollwert liest.
      expect(zaehle("api_tokens")).toBe(0);
    } finally {
      db.close();
    }
  });

  /**
   * ⚠️ Diese Zeile ist kein Nebenschauplatz: sie belegt, dass die Fixture die
   * Nebenbedingung der Quell-DDL EINHAELT, statt sie zu umgehen. `loans_device_active_uidx`
   * laesst je `device_id` HOECHSTENS EINE Zeile mit `returned_at IS NULL` zu. ALT_LEIHE
   * (zurueckgegeben) und ALT_LEIHE_AKTIV duerfen deshalb beide auf `g-1` zeigen — eine
   * zweite AKTIVE nicht. Ohne diese Zusicherung merkt niemand, wenn eine spaeter
   * nachgetragene Zeile das Einspielen selbst abweist und Fall B aus dem falschen Grund
   * rot ist.
   */
  it("die Fixture haelt die Nebenbedingung des partiellen Index ein", () => {
    const db = baueBespielteQuellDb();
    try {
      const aktive = db
        .prepare(
          `select device_id, count(*) as n from loans
            where returned_at is null group by device_id having count(*) > 1`,
        )
        .all();
      expect(aktive).toEqual([]);
      expect(() =>
        db
          .prepare(
            `insert into loans (id, device_id, snapshot_call_sign, borrower_name,
                                borrowed_at, returned_at, created_at, updated_at)
             values (?,?,?,?,?,?,?,?)`,
          )
          .run("l-drei", "g-1", "HRO 1/83-1", "Test", 1_742_500_000_000, null,
               1_742_500_000_000, 1_742_500_000_000),
      ).toThrow(/UNIQUE constraint failed: loans\.device_id/);
    } finally {
      db.close();
    }
  });
});

describe("Die Zeitachse (Spec 2 §1.3.2)", () => {
  it("msZuDatum wirft bei einem Sekundenwert (1735689600)", () => {
    expect(() => msZuDatum("t.x", 1_735_689_600)).toThrow(/Millisekunden-Spanne/);
    // ⚠️ Die Meldung MUSS das Feld nennen. Ohne Ortsangabe ist sie um 23 Uhr im Fenster
    // wertlos — das ist der ganze Zweck des `feld`-Parameters (§1.3.2).
    expect(() => msZuDatum("t.x", 1_735_689_600)).toThrow(/t\.x/);
  });

  it("msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte", () => {
    expect(() => msZuDatum("t.x", 0)).toThrow(/t\.x/);
    expect(() => msZuDatum("t.x", Number.NaN)).toThrow(/t\.x/);
    expect(() => msZuDatum("t.x", 1.5)).toThrow(/t\.x/);
    // Der Grenzfall nach oben gehoert dazu: 4e12 ist zulaessig, 4e12 + 1 nicht.
    expect(msZuDatum("t.x", 4_000_000_000_000).getTime()).toBe(4_000_000_000_000);
    expect(() => msZuDatum("t.x", 4_000_000_000_001)).toThrow(/Millisekunden-Spanne/);
  });

  it("tagInBerlin: 2026-08-16T22:00:00Z (Formular-Mitternacht) ergibt 2026-08-17", () => {
    expect(tagInBerlin("t.x", Date.UTC(2026, 7, 16, 22, 0, 0))).toBe("2026-08-17");
  });

  it("tagInBerlin: 2026-08-17T00:00:00Z (CSV-Weg) ergibt 2026-08-17", () => {
    expect(tagInBerlin("t.x", Date.UTC(2026, 7, 17, 0, 0, 0))).toBe("2026-08-17");
  });

  it("tagInBerlin: 2026-08-17T14:35:00Z (Date.now()-Weg) ergibt 2026-08-17", () => {
    expect(tagInBerlin("t.x", Date.UTC(2026, 7, 17, 14, 35, 0))).toBe("2026-08-17");
  });

  // ⛛ Ergaenzung dieses Plans: die Nullbehandlung der zwei optionalen Wege.
  it("msZuDatumOptional und tagInBerlin geben bei null und undefined null zurueck", () => {
    expect(msZuDatumOptional("t.x", null)).toBeNull();
    expect(msZuDatumOptional("t.x", undefined)).toBeNull();
    expect(tagInBerlin("t.x", null)).toBeNull();
    expect(tagInBerlin("t.x", undefined)).toBeNull();
    // ⚠️ Aber ein VORHANDENER, falscher Wert wirft auch auf dem optionalen Weg.
    expect(() => msZuDatumOptional("t.x", 1_735_689_600)).toThrow(/Millisekunden-Spanne/);
    // ⚠️ Und dasselbe für tagInBerlin. Diese Zeile ist der einzige Beweis, dass tagInBerlin
    // seinen Wert durch msZuDatum schickt, statt ihn selbst in ein `new Date` zu geben —
    // gemessen: ohne sie überlebt genau diese Verkürzung vitest, `tsc --noEmit` UND eslint,
    // und ein Sekundenwert landet still als "1970-01-21" in devices.last_updated_at, einem
    // TEXT-Feld ohne Constraint, hinter dem kein Paritätssignal steht (Spec 1 §2.2.3).
    // Der Faktor bleibt im Ausdruck sichtbar, wie der Plankopf es für jede Überschreitung
    // der Einheitengrenze verlangt: der Divisor ist der Fehler, nicht die Zahl.
    expect(() => tagInBerlin("t.x", ALT_GERAET.last_updated_at / 1000)).toThrow(
      /Millisekunden-Spanne/,
    );
  });

  /**
   * ⛛ Ergaenzung dieses Plans. Ohne sie haette die dritte Falle derselben Bauart
   * (§1.3.5) bis ⬜ L1 keinen Test. `expect(zuBoolOptional(null)).toBeFalsy()` waere
   * KEIN Test: `false` besteht ihn. Deshalb `toBeNull()` und `toBe(false)` getrennt.
   */
  it("zuBoolOptional: null bleibt null, 0 wird false, 1 wird true", () => {
    expect(zuBoolOptional(null)).toBeNull();
    expect(zuBoolOptional(0)).toBe(false);
    expect(zuBoolOptional(1)).toBe(true);
    // NT2, entschieden am 2026-08-21: `undefined` faellt auf `null`, nicht auf `false`.
    // Der Wert kann nur ueber den blinden Cast `.all() as AltGeraet[]` (radio.ts:210)
    // hereinkommen — typseitig ist er von toNeuesGeraet aus unerreichbar. Ohne DIESE
    // Zeile ist die Haertung eine Zusage, die kein Test haelt: derselbe Fehlertyp, den
    // die Schlusspruefung von B1-B4 an `tagInBerlin` per Mutationssonde entlarvt hat.
    expect(zuBoolOptional(undefined)).toBeNull();
  });

  /**
   * ⛛ Ergaenzung dieses Plans, auf FUNKTIONSebene. Die Verdrahtung prueft Aufgabe 6a
   * unter dem verbindlichen Namen `toNeuesGeraeteEreignis wirft bei source="importiert"`.
   */
  it("pruefeQuelle laesst die vier bekannten Werte durch und wirft bei jedem anderen", () => {
    for (const wert of ["manual", "csv-import", "create", "update-note"]) {
      expect(pruefeQuelle("e-1", wert)).toBe(wert);
    }
    expect(() => pruefeQuelle("e-2", "importiert")).toThrow(/source/);
    // Die Meldung MUSS die Zeile nennen — sonst sucht jemand die eine Zeile unter 20 000.
    expect(() => pruefeQuelle("e-2", "importiert")).toThrow(/e-2/);
  });
});

describe("lieseQuelle (Spec 2 §1.4)", () => {
  it("liest alle fuenf Tabellen im Import-Bereich", () => {
    const quellDb = baueBespielteQuellDb();
    try {
      const q = lieseQuelle(quellDb);
      expect(q.users).toHaveLength(1);
      expect(q.softwareVersions).toHaveLength(2);
      expect(q.devices).toHaveLength(2);
      expect(q.deviceEvents).toHaveLength(1);
      expect(q.loans).toHaveLength(2);
    } finally {
      quellDb.close();
    }
  });

  /**
   * Die Rohfassung der Zusicherung (b) des Reihenfolge-Tests aus Spec 2 §1.8. Sie steht
   * hier, weil sie ohne das Zielschema auskommt: ein positionsweiser Lesevorgang liefert
   * `tei === "SN-001"`, weil `tei` in der QUELLE an Position 25 steht und `serial_number`
   * an Position 4. Der vollstaendige Test unter dem verbindlichen Namen folgt in Aufgabe 5.
   */
  it("lieseQuelle liest namentlich: die Rohzeile traegt tei=7654321 und serial_number=SN-001", () => {
    const quellDb = baueBespielteQuellDb();
    try {
      const g = lieseQuelle(quellDb).devices.find((r) => r.id === "g-1");
      expect(g).toBeDefined();
      expect(g?.tei).toBe("7654321");
      expect(g?.serial_number).toBe("SN-001");
      // Die zwei 0/1-Integer kommen ROH an — die Faltung passiert erst im Mapper.
      expect(g?.alamos_integrated).toBe(1);
      expect(g?.loanable).toBe(0);
      // Und die zweite Zeile traegt sie als NULL, nicht als 0.
      const g2 = lieseQuelle(quellDb).devices.find((r) => r.id === "g-2");
      expect(g2?.alamos_integrated).toBeNull();
      expect(g2?.loanable).toBeNull();
    } finally {
      quellDb.close();
    }
  });

  /**
   * ⛛ Ergaenzung dieses Plans: ein QUELLTEXT-SCAN. Spec 1 §2.8.1 verbietet `SELECT *`
   * (docs/runbooks/lagerbuch-cutover.md:30-31), und das naechste Vorbild im Repo BRICHT
   * die Regel — scripts/import/feedback.ts:66-72 liest fuenfmal `SELECT * FROM …`. Ohne
   * diesen Scan haelt die Regel nichts: ein spaeteres „der Einheitlichkeit wegen" ist ein
   * Einzeiler, und alle anderen Tests bleiben gruen, weil die Fixture zufaellig dieselben
   * Spalten in derselben Reihenfolge hat wie das Ziel.
   * Hausform fuer Quelltext-Scans: scripts/seed-lokal.test.ts:47-59,
   * src/app/m/portal/_lib/neuigkeiten/register.test.ts.
   */
  it("scripts/import/radio.ts enthaelt kein SELECT * — die Spalten stehen namentlich", () => {
    const quelltext = readFileSync("./scripts/import/radio.ts", "utf8");
    expect(quelltext).not.toMatch(/select\s+\*/i);
  });
});

describe("toNeuesGeraet (Spec 2 §1.4.3)", () => {
  /**
   * Der erste der drei Tests, ohne die dieses Kapitel keinen Schutz hat (§1.10).
   * ⚠️ Die zwei Konstanten sind paarweise verschieden — deshalb faengt DERSELBE Test auch
   * die Vertauschung von `created_at` und `updated_at`.
   */
  it("toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden", () => {
    const g = toNeuesGeraet(ALT_GERAET);
    expect(g.createdAt.getTime()).toBe(1_735_689_600_000);
    expect(g.updatedAt.getTime()).toBe(1_738_368_000_000);
    expect(g.createdAt.getUTCFullYear()).toBe(2025);
    expect(g.updatedAt.getUTCFullYear()).toBe(2025);
  });

  it("toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht", () => {
    const g = toNeuesGeraet(ALT_GERAET);
    expect(g.alamosIntegrated).toBe(true);
    expect(g.loanable).toBe(false);
  });

  /**
   * Der zwoelfte Test aus Spec 2 §1.3.5, additiv zu Spec 1 §2.2.5.
   * ⚠️ `expect(g.loanable).toBeFalsy()` waere KEIN Test: `false` besteht ihn.
   */
  it("toNeuesGeraet: alamos_integrated=null und loanable=null bleiben null", () => {
    const g = toNeuesGeraet(ALT_GERAET_OHNE_ANGABE);
    expect(g.alamosIntegrated).toBeNull();
    expect(g.loanable).toBeNull();
  });

  /**
   * ⛛ Additive Zusicherung (Spec 2 §1.3.4): die EINZIGE Spalte mit Typwechsel und die
   * einzige, deren Richtigkeit an der ZONE haengt. Die drei tagInBerlin-Tests aus Aufgabe 3
   * pruefen die FUNKTION; diese Zeile prueft die VERDRAHTUNG. Ein Mapper mit
   * `new Date(ms).toISOString().slice(0,10)` liefert hier "2025-03-01".
   *
   * ⚠️ Der Sollwert ist der BERLINER Kalendertag, nicht „einer der beiden Kandidatentage".
   * Die Alt-Anwendung ist fuer diese eine Spalte KEINE zulaessige zweite Meinung: ihr
   * CSV-Export formatiert UTC (radio-admin@265abd5:server/src/routes/export.ts:49-51),
   * ihre Detailansicht den lokalen Tag (client/src/utils/format.ts:4,
   * client/src/features/devices/DeviceEditForm.tsx:41) — sie widersprechen sich bei genau
   * den Zeilen, um die es geht.
   */
  it("toNeuesGeraet: last_updated_at wird zum BERLINER Kalendertag", () => {
    expect(toNeuesGeraet(ALT_GERAET).lastUpdatedAt).toBe("2025-03-02");
    // NULL bleibt NULL — kein "" und kein heutiges Datum.
    expect(toNeuesGeraet(ALT_GERAET_OHNE_ANGABE).lastUpdatedAt).toBeNull();
  });

  /**
   * Der verbindliche Name aus Spec 2 §1.8, jetzt mit BEIDEN Zusicherungen: (a) die Fixture
   * traegt wirklich die produktive Spaltenreihenfolge (sie steht auch als eigener Test in
   * Aufgabe 1), (b) der Weg Quelle → lieseQuelle → toNeuesGeraet liest namentlich.
   * Ein positionsweiser Import liefert hier `tei === "SN-001"`.
   */
  it("lieseQuelle liest namentlich: devices.tei steht in der Quelle an Position 25", () => {
    const quellDb = baueBespielteQuellDb();
    try {
      const spalten = quellDb
        .prepare("select cid, name from pragma_table_info('devices') order by cid")
        .all() as Array<{ cid: number; name: string }>;
      expect(spalten[spalten.length - 2]?.name).toBe("update_note");
      expect(spalten[spalten.length - 1]?.name).toBe("tei");

      const roh = lieseQuelle(quellDb).devices.find((r) => r.id === "g-1");
      const g = toNeuesGeraet(roh!);
      expect(g.tei).toBe("7654321");
      expect(g.serialNumber).toBe("SN-001");
    } finally {
      quellDb.close();
    }
  });

  /**
   * Hausregel: jeder Mapper-Test prueft ALLE Zielfelder gegen konkrete Werte per `toEqual`,
   * nicht nur Typ- oder Null-Checks (scripts/import/feedback.test.ts:181-183). Ohne diese
   * eine Zeile faengt keiner der Tests oben ein GEDROPPTES Feld — es fehlt dann einfach,
   * und `toBe`-Zusicherungen auf andere Felder bleiben gruen.
   */
  it("toNeuesGeraet: alle 25 Zielfelder, Feld fuer Feld", () => {
    expect(toNeuesGeraet(ALT_GERAET)).toEqual({
      id: "g-1",
      rufname: "HRO 1/83-1",
      issi: "1234567",
      tei: "7654321",
      serialNumber: "SN-001",
      deviceType: "MTP6650",
      status: "einsatzbereit",
      location: "Funkraum",
      assignedTo: "GW-San",
      softwareVersion: "10.5.1",
      lastUpdatedAt: "2025-03-02",
      notes: "Stammnotiz",
      hiorgId: "HO-002",
      opta: "OPTA-003",
      funktion: "Fuehrung",
      hersteller: "Motorola",
      bedieneinheit: "TMR880i",
      deviceModes: "TMO,DMO",
      alamosIntegrated: true,
      loanable: false,
      updateNote: "ISSI abweichend",
      createdAt: new Date(1_735_689_600_000),
      updatedAt: new Date(1_738_368_000_000),
      createdBy: "sub-anna",
      updatedBy: "sub-bert",
    });
  });
});

describe("Die drei schmalen Mapper (Spec 2 §1.4.1, §1.4.2, §1.4.4)", () => {
  // ⛛ Additive Zusicherung (§1.3.4). Ohne sie ist der Faktor-1000-Riegel fuer `users`
  // eine Zusage, die kein Test haelt: ein Mapper mit `new Date(ms/1000)` fragt msZuDatum
  // NIE, wirft NIE und landet still im Jahr 1970.
  it("toNeuerBenutzer: last_seen_at behaelt SEINEN Wert", () => {
    expect(toNeuenBenutzer(ALT_BENUTZER).lastSeenAt.getTime()).toBe(1_739_000_000_000);
  });

  it("toNeuenBenutzer: alle drei Zielfelder, Feld fuer Feld", () => {
    expect(toNeuenBenutzer(ALT_BENUTZER)).toEqual({
      // ROH, ohne `pocketid:`-Praefix — radio-admin schreibt den sub schon roh
      // (radio-admin/server/src/db/schema.ts:79); der Praefix ist ein Artefakt des KIOSK.
      sub: "sub-anna",
      name: "Anna Reiter",
      lastSeenAt: new Date(1_739_000_000_000),
    });
  });

  // ⛛ Additive Zusicherung (§1.3.4).
  it("toNeueSoftwareVersion: created_at behaelt SEINEN Wert", () => {
    expect(toNeueSoftwareVersion(ALT_VERSION).createdAt.getTime()).toBe(1_736_000_000_000);
  });

  it("toNeueSoftwareVersion: alle sechs Zielfelder, und is_target bleibt EINE Marke", () => {
    expect(toNeueSoftwareVersion(ALT_VERSION)).toEqual({
      id: "v-1",
      value: "10.5.1", // KEINE Normalisierung, kein Trim: `software_versions_value_unique`
      createdAt: new Date(1_736_000_000_000),
      createdBy: "sub-anna", // tote Spalte, wandert trotzdem (§1.7 Punkt 2)
      sortOrder: 10,
      isTarget: true,
    });
    expect(toNeueSoftwareVersion(ALT_VERSION_ZWEIT).isTarget).toBe(false);
  });

  // ⛛ Additive Zusicherung (§1.3.4) — DIE Zeile, die `new Date(ms/1000)` fuer
  // `device_events` faengt. Der Enum-Test unten sagt ueber `changed_at` nichts.
  it("toNeuesGeraeteEreignis: changed_at behaelt SEINEN Wert", () => {
    expect(toNeuesGeraeteEreignis(ALT_EREIGNIS).changedAt.getTime()).toBe(1_737_000_000_000);
  });

  // Verbindlicher Name aus Spec 1 §2.2.5.
  it('toNeuesGeraeteEreignis wirft bei source="importiert"', () => {
    expect(() => toNeuesGeraeteEreignis(ALT_EREIGNIS_UNBEKANNT)).toThrow(/source/);
    expect(() => toNeuesGeraeteEreignis(ALT_EREIGNIS_UNBEKANNT)).toThrow(/e-2/);
  });

  it("toNeuesGeraeteEreignis: alle acht Zielfelder, Feld fuer Feld", () => {
    expect(toNeuesGeraeteEreignis(ALT_EREIGNIS)).toEqual({
      id: "e-1",
      deviceId: "g-1",
      field: "status",
      oldValue: "wartung",
      newValue: "einsatzbereit",
      changedBy: "sub-bert",
      changedAt: new Date(1_737_000_000_000),
      source: "manual",
    });
  });
});

describe("toNeueLeihe (Spec 2 §1.4.5)", () => {
  it("toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht", () => {
    const l = toNeueLeihe(ALT_LEIHE);
    expect(l.snapshotCallSign).toBe("HRO 1/83-1");
    expect(l.borrowerName).toBe("Marek Sowa");
  });

  /**
   * ⛛ Additive Zusicherung (§1.3.4). Vier paarweise verschiedene Konstanten — dieselbe
   * Zeile faengt damit auch jede Vertauschung unter den vier Zeitfeldern.
   */
  it("toNeueLeihe: alle VIER Zeitfelder behalten SEINEN Wert in Millisekunden", () => {
    const l = toNeueLeihe(ALT_LEIHE);
    expect(l.borrowedAt.getTime()).toBe(1_741_000_000_000);
    expect(l.returnedAt?.getTime()).toBe(1_741_100_000_000);
    expect(l.createdAt.getTime()).toBe(1_740_999_999_000);
    expect(l.updatedAt.getTime()).toBe(1_741_100_001_000);
  });

  /**
   * ⛛ Ergaenzung dieses Plans. `returned_at IS NULL` ist keine fehlende Angabe, sondern
   * die Aussage „diese Leihe laeuft". Ein `?? new Date(0)` machte daraus eine 1970
   * zurueckgegebene — und der naechste Retention-Lauf loeschte sie.
   */
  it("toNeueLeihe: returned_at NULL bleibt NULL (die aktive Leihe)", () => {
    expect(toNeueLeihe(ALT_LEIHE_AKTIV).returnedAt).toBeNull();
    expect(toNeueLeihe(ALT_LEIHE_AKTIV).returnNote).toBeNull();
  });

  /**
   * ⛛ Ergaenzung dieses Plans. §1.4.5 verlangt die Spalte EXPLIZIT als `null` im Mapper,
   * nicht implizit durch Auslassen — nur so ist sie auf BEIDEN Paritaetsarmen vorhanden,
   * und nur dann faellt es auf, wenn irgendetwas dort einen Wert hineinschreibt.
   */
  it("toNeueLeihe: zugangscodeId steht explizit als null in der Zielzeile", () => {
    const l = toNeueLeihe(ALT_LEIHE);
    expect(l.zugangscodeId).toBeNull();
    expect(Object.keys(l)).toContain("zugangscodeId");
  });

  it("toNeueLeihe: alle 12 Zielfelder, Feld fuer Feld", () => {
    expect(toNeueLeihe(ALT_LEIHE)).toEqual({
      id: "l-1",
      deviceId: "g-1",
      snapshotCallSign: "HRO 1/83-1",
      snapshotSerialNumber: "SN-001",
      snapshotDeviceType: "MTP6650",
      borrowerName: "Marek Sowa",
      borrowedAt: new Date(1_741_000_000_000),
      returnedAt: new Date(1_741_100_000_000),
      returnNote: "Akku leer",
      zugangscodeId: null,
      createdAt: new Date(1_740_999_999_000),
      updatedAt: new Date(1_741_100_001_000),
    });
  });
});

describe("Paritaet (Spec 2 §1.5.2)", () => {
  it("paritaetsSichtGeraet liefert Sekunden fuer beide Arme", () => {
    const s = paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET));
    expect(s.createdAt).toBe(1_735_689_600);
    expect(s.updatedAt).toBe(1_738_368_000);
  });

  // Regel 3: die eine Spalte, die NICHT umgerechnet wird.
  it("paritaetsSichtGeraet laesst lastUpdatedAt unumgerechnet als Text stehen", () => {
    expect(paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET)).lastUpdatedAt).toBe("2025-03-02");
    expect(paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET_OHNE_ANGABE)).lastUpdatedAt).toBeNull();
  });

  it("getaggteQuellzeilen traegt je Zeile ein __table-Tag", () => {
    const quellDb = baueBespielteQuellDb();
    try {
      const zeilen = getaggteQuellzeilen(lieseQuelle(quellDb));
      expect(zeilen).toHaveLength(8); // 1 + 2 + 2 + 1 + 2
      const tags = [...new Set(zeilen.map((z) => z.__table))].sort();
      expect(tags).toEqual([
        "device_events", "devices", "loans", "software_versions", "users",
      ]);
    } finally {
      quellDb.close();
    }
  });
});

describe("importiereRadio (Spec 2 §1.5.1)", () => {
  it("schreibt alle fuenf Tabellen und die Paritaet ist gruen", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();
    db.transaction((tx) => importiereRadio(quelle, tx));

    expect(db.select().from(radioSchema.users).all()).toHaveLength(1);
    expect(db.select().from(radioSchema.softwareVersions).all()).toHaveLength(2);
    expect(db.select().from(radioSchema.devices).all()).toHaveLength(2);
    expect(db.select().from(radioSchema.deviceEvents).all()).toHaveLength(1);
    expect(db.select().from(radioSchema.loans).all()).toHaveLength(2);

    const report = checkRadioParitaet(quelle, db);
    expect(report.ok).toBe(true);
    expect(report.sourceCount).toBe(8);
    expect(report.targetCount).toBe(8);
  });

  /**
   * Verfaelschungstest — Hausform: scripts/import/portal.test.ts:90-92,
   * feedback.test.ts:398-401. Ohne ihn koennte `checkRadioParitaet` konstant `ok: true`
   * liefern und alle Tests oben blieben gruen.
   */
  it("Paritaet wird ROT, sobald eine Zielzeile verfaelscht wird", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();
    db.transaction((tx) => importiereRadio(quelle, tx));
    expect(checkRadioParitaet(quelle, db).ok).toBe(true);

    db.update(radioSchema.devices)
      .set({ rufname: "VERFAELSCHT" })
      .where(eq(radioSchema.devices.id, "g-1"))
      .run();

    expect(checkRadioParitaet(quelle, db).ok).toBe(false);
  });

  /**
   * ⚠️ Der Paritaetscheck vergleicht gegen den GANZEN Zielbestand, ohne `WHERE`. Er ist
   * damit zugleich der Nachweis, dass die Ziel-DB leer war (§1.5.2). Diese Zeile haelt
   * genau das fest — sie ist die Testfassung des Runbook-Schritts
   * „`radio.db` loeschen, DANN importieren" (§1.6.4).
   */
  it("Paritaet wird ROT, wenn im Ziel schon eine fremde Zeile steht", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();
    db.insert(radioSchema.users)
      .values({ sub: "fremd", name: "Vorher da", lastSeenAt: new Date(1_739_500_000_000) })
      .run();
    db.transaction((tx) => importiereRadio(quelle, tx));

    const report = checkRadioParitaet(quelle, db);
    expect(report.ok).toBe(false);
    expect(report.missingInSource.length).toBeGreaterThan(0);
  });

  /**
   * ⛛ Ergaenzung dieses Plans: der EINZIGE laute Fehlschlag dieses Kapitels (§1.5.1).
   * Ein Waisen-Ereignis in der Quelle bricht den Import hart ab — dagegen steht A3
   * (§2.4.3), blockierend, vor dem Import. Ohne diesen Test waere „die Reihenfolge ist
   * Pflicht, nicht Stil" eine Prosa-Zeile: die gesunde Fixture haette sie auch bei
   * vertauschter Reihenfolge bestanden, weil `devices` VOR `device_events` steht.
   */
  it("ein Waisen-Ereignis bricht den Import hart ab (SQLITE_CONSTRAINT_FOREIGNKEY)", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();
    quelle.deviceEvents.push({
      ...quelle.deviceEvents[0]!,
      id: "e-waise",
      device_id: "g-gibt-es-nicht",
    });

    const db = frischeZielDb();
    expect(() => db.transaction((tx) => importiereRadio(quelle, tx))).toThrow(/FOREIGN KEY/i);
    // Und die Transaktion hat zurueckgerollt: nichts steht drin.
    expect(db.select().from(radioSchema.devices).all()).toHaveLength(0);
  });
});

describe("Import ist asymmetrisch idempotent (Spec 2 §1.6.3)", () => {
  /**
   * FALL A. `update_note` ist in der Quelle APPEND-ONLY („never overwritten by the update
   * flow", radio-admin/server/src/db/schema.ts:33-36), und `onConflictDoUpdate` kennt kein
   * Anhaengen. ⚠️ Die Zusicherung ist der VERLUST. Wie man es im Betrieb merkt: gar nicht.
   * Deshalb der Freeze.
   */
  it("Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert — Fall A", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();
    db.transaction((tx) => importiereRadio(quelle, tx));
    expect(
      db.select().from(radioSchema.devices).where(eq(radioSchema.devices.id, "g-1")).get()?.updateNote,
    ).toBe("ISSI abweichend");

    // Der Weg, den die Suite baut: anhaengen, nie ueberschreiben.
    db.update(radioSchema.devices)
      .set({ updateNote: "ISSI abweichend\nAntenne getauscht" })
      .where(eq(radioSchema.devices.id, "g-1"))
      .run();

    db.transaction((tx) => importiereRadio(quelle, tx));

    expect(
      db.select().from(radioSchema.devices).where(eq(radioSchema.devices.id, "g-1")).get()?.updateNote,
    ).toBe("ISSI abweichend"); // ⚠️ Der angehaengte Satz ist WEG — ohne Fehler, ohne Warnung.
  });

  /**
   * FALL B. Der Mechanismus: `onConflictDoUpdate` setzt `l-aktiv.returned_at` zurueck auf
   * NULL, damit gibt es ZWEI aktive Leihen auf `g-1`, und der partielle Unique-Index
   * `loans_device_active_uidx ON loans(device_id) WHERE returned_at IS NULL` weist die
   * Schreibung ab. Der einzige der vier Faelle, den der Betrieb bemerkt — als Abbruch mitten
   * im Fenster, bei bereits beschriebenem Ziel.
   *
   * ⚠️ Die Meldung nennt die SPALTE, nicht den Index: `UNIQUE constraint failed:
   * loans.device_id`. Ein `toThrow(/loans_device_active_uidx/)` waere ein Test, der aus dem
   * falschen Grund rot ist.
   *
   * ⬜ L2, gemessen und verengt: better-sqlite3 13.0.2 wirft eine `SqliteError` mit
   * `code === "SQLITE_CONSTRAINT_UNIQUE"` und der Meldung ZEICHENGLEICH, ohne `cause`;
   * drizzle-orm 0.45.2 reicht sie durch `db.transaction()` unveraendert durch. Die
   * Zusicherung unten prueft die Meldung (haelt auch unter einer verpackenden Fassung, die
   * `message` durchreicht) und den `code` (schlaegt LAUT fehl, wenn eine kuenftige Fassung
   * doch verpackt) — nie still.
   */
  it("Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert — Fall B", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();

    /**
     * SCHRITT 0 — ARRANGE-Riegel gegen das ZIEL, VOR allem anderen. Sonst tarnt sich eine
     * fehlende Ziel-Migration als „expected throw, got none", und der Test meldet einen
     * Importdefekt, wo ein Migrationsdefekt vorliegt.
     *
     * ⚠️ STRUKTUR statt Text. `sqlite_master.sql` speichert die CREATE-Anweisung
     * ZEICHENGLEICH so, wie sie ausgefuehrt wurde — und Spec 1 §2.6 schreibt sie mit
     * BACKTICKS: CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`)
     * WHERE `returned_at` IS NULL. Gemessen gegen genau diese DDL:
     * instr(sql, 'WHERE returned_at IS NULL') = 0. Eine Textprobe waere hier ROT gegen eine
     * vollkommen korrekte Migration.
     *
     * `db.$client` ist das rohe better-sqlite3-Handle hinter der Drizzle-Instanz
     * (node_modules/drizzle-orm/better-sqlite3/driver.d.ts:23) — `pragma_index_list` ist
     * eine Tabellenwertfunktion und laesst sich ueber den Query Builder nicht ausdruecken.
     *
     * N3 (Nachtrag des Controllers): dieselbe Probe steht bereits gegen das Zielschema in
     * src/app/m/radio/_db/migrations.test.ts:92-108 — diese dritte Kopie ist bewusst und
     * meldet innerhalb von Fall B, dass eine fehlende Migration und kein Importdefekt
     * vorliegt, gegen dieselbe Verbindung, gegen die der Test danach faehrt.
     */
    const riegel = db.$client
      .prepare(
        `select name, partial, "unique" from pragma_index_list('loans')
          where name = 'loans_device_active_uidx'`,
      )
      .all();
    expect(riegel).toEqual([{ name: "loans_device_active_uidx", partial: 1, unique: 1 }]);

    db.transaction((tx) => importiereRadio(quelle, tx));

    // Im ZIEL zurueckgeben …
    db.update(radioSchema.loans)
      .set({ returnedAt: new Date(1_742_100_000_000) })
      .where(eq(radioSchema.loans.id, "l-aktiv"))
      .run();
    // … und eine NEUE Leihe auf dasselbe Geraet anlegen — voellig legitim, es ist frei.
    db.insert(radioSchema.loans)
      .values({
        id: "l-neu-in-suite",
        deviceId: "g-1",
        snapshotCallSign: "HRO 1/83-1",
        snapshotSerialNumber: "SN-001",
        snapshotDeviceType: "MTP6650",
        borrowerName: "Suite-Weg",
        borrowedAt: new Date(1_742_200_000_000),
        returnedAt: null,
        returnNote: null,
        zugangscodeId: null,
        createdAt: new Date(1_742_200_000_000),
        updatedAt: new Date(1_742_200_000_000),
      })
      .run();

    /**
     * FIX-RUNDE 1 (Task-Review von B15): eine Zielzeile setzen, die der zweite Import VOR
     * dem Wurf anfassen wuerde. `devices` ist Schleife 3, `loans` ist Schleife 5 — der Wurf
     * in Schleife 5 kommt NACH dem devices-Upsert. Nur eine so gewaehlte Zeile kann nachher
     * zwischen "mit Rollback" und "ohne Rollback" unterscheiden; `l-neu-in-suite` (unten
     * entfernt) konnte es nicht, weil keine der fuenf Import-Schleifen sie je anfasst.
     */
    db.update(radioSchema.devices)
      .set({ updateNote: "Suite-Wert vor Fall B" })
      .where(eq(radioSchema.devices.id, "g-1"))
      .run();

    /**
     * ⚠️ Der Aufruf steht IN einer Transaktion, und das ist keine Formsache: §1.6.3 misst,
     * dass der Verstoss beim STATEMENT auffaellt und `db.transaction()` daraufhin
     * zurueckrollt. Ein blanker `importiereRadio(quelle, db)` wuerfe auch — aber OHNE
     * Ruecknahme, und der Test dokumentierte einen Mechanismus, der nicht gelaufen ist.
     */
    let gefangen: unknown;
    try {
      db.transaction((tx) => importiereRadio(quelle, tx));
    } catch (err) {
      gefangen = err;
    }
    expect((gefangen as Error | undefined)?.message).toMatch(
      /UNIQUE constraint failed: loans\.device_id/,
    );
    expect((gefangen as { code?: string } | undefined)?.code).toBe("SQLITE_CONSTRAINT_UNIQUE");

    /**
     * Und die Transaktion hat WIRKLICH zurueckgerollt — nicht nur "das Neue blieb
     * unberuehrt" (das waere so oder so gruen: `l-neu-in-suite` steht in keiner
     * Quelltabelle, keine der fuenf Import-Schleifen fasst sie je an). Beweiskraeftig ist
     * stattdessen `devices.g-1.updateNote`: mit Rollback steht hier weiterhin der oben
     * gesetzte SUITE-Wert (der devices-Upsert aus Schleife 3 ist mit zurueckgerollt); ohne
     * Rollback staende der QUELLWERT "ISSI abweichend", weil Schleife 3 schon gelaufen war,
     * bevor Schleife 5 auf `loans` warf.
     */
    expect(
      db.select().from(radioSchema.devices).where(eq(radioSchema.devices.id, "g-1")).get()
        ?.updateNote,
    ).toBe("Suite-Wert vor Fall B");
  });

  /**
   * FALL C ist die Gegenprobe zu A: dieselbe Situation, andere Strategie, anderes Ergebnis.
   * Er verteidigt `onConflictDoNothing` gegen ein spaeteres „der Einheitlichkeit wegen".
   */
  it("Import ist asymmetrisch idempotent: das Journal bleibt, wie es ist — Fall C", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();
    db.transaction((tx) => importiereRadio(quelle, tx));

    db.update(radioSchema.deviceEvents)
      .set({ newValue: "in der Suite geaendert" })
      .where(eq(radioSchema.deviceEvents.id, "e-1"))
      .run();

    db.transaction((tx) => importiereRadio(quelle, tx));

    expect(
      db.select().from(radioSchema.deviceEvents).where(eq(radioSchema.deviceEvents.id, "e-1")).get()
        ?.newValue,
    ).toBe("in der Suite geaendert"); // INSERT OR IGNORE ueberschreibt NICHT
    expect(db.select().from(radioSchema.deviceEvents).all()).toHaveLength(1); // und dupliziert nicht
  });

  /**
   * ⛛ FALL D — von Spec 2 §1.6.3 nicht geführt, und die Lücke ist teuer.
   *
   * `software_versions.is_target` markiert GENAU EINE Zeile, und keine Datenbank erzwingt
   * das: `getTargetVersion` (radio-admin/server/src/repos/softwareVersionRepo.ts:63-70)
   * nimmt `.limit(1).get()` OHNE `ORDER BY`. §2.2.3 Regel 4 sagt ueber genau diese Zeile:
   * „Kippt diese eine Zeile, kippt der Status JEDES Geraets." Fall A in gross — und ohne
   * diesen Test haette die Tabelle mit der groessten Hebelwirkung weder einen
   * Idempotenzfall noch eine Zusicherung.
   *
   * ⚠️ Die Ziel-Aenderung wird hier als schlichtes UPDATE geschrieben, NICHT ueber
   * `setTargetVersion`: diese Funktion lebt in radio-admin, nicht in der Suite.
   */
  it("Import ist asymmetrisch idempotent: die Update-Marke faellt auf den Quellstand zurueck — Fall D", () => {
    const quellDb = baueBespielteQuellDb();
    const quelle = lieseQuelle(quellDb);
    quellDb.close();

    const db = frischeZielDb();
    db.transaction((tx) => importiereRadio(quelle, tx));
    const marke = () =>
      db.select().from(radioSchema.softwareVersions).all().filter((r) => r.isTarget).map((r) => r.id);
    expect(marke()).toEqual(["v-1"]);

    // Im ZIEL umhaengen — der Weg, den die Verwaltungsflaeche baut.
    db.update(radioSchema.softwareVersions).set({ isTarget: false }).run();
    db.update(radioSchema.softwareVersions)
      .set({ isTarget: true })
      .where(eq(radioSchema.softwareVersions.id, "v-2"))
      .run();
    expect(marke()).toEqual(["v-2"]);

    db.transaction((tx) => importiereRadio(quelle, tx));

    // ⚠️ ZUSICHERUNG: der Quellstand gewinnt. Das ist ein FEHLSCHLAG, kein No-Op — die im
    // Ziel getroffene Entscheidung ist still verloren, und danach zeigt jedes Geraet einen
    // anderen Update-Stand als eine Minute zuvor.
    expect(marke()).toEqual(["v-1"]);
    // Genau EINE Marke bleibt es trotzdem — sonst waere zusaetzlich A2 (§2.4.2) verletzt.
    expect(marke()).toHaveLength(1);
  });
});
