import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  baueQuellDb,
  ALLE_QUELLZEILEN,
  baueBespielteQuellDb,
  ALT_GERAET,
} from "./fixtures/radio-quelle";
import {
  msZuDatum,
  msZuDatumOptional,
  tagInBerlin,
  zuBoolOptional,
  pruefeQuelle,
  lieseQuelle,
} from "./radio";

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
