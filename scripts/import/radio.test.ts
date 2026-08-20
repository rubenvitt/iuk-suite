import { describe, it, expect } from "vitest";
import { baueQuellDb } from "./fixtures/radio-quelle";

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
