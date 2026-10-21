import { describe, expect, it } from "vitest";
import { listeFahrzeuge, NichtGefunden, SchonVergeben, setzeAktiv, speichereFahrzeug } from "./daten";
import { fahrzeugEingabe } from "./eingabe";
import { testDb } from "./testDb";

const basis = { art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "", standort: "Uelzen", bemerkung: "", aktiv: true };
const ein = (abweichung: Partial<typeof basis> = {}) => fahrzeugEingabe.parse({ ...basis, ...abweichung });

describe("Eingabe eines Fahrzeugs", () => {
  it("ein leeres freies Feld wird null, nie ein Leerstring", () => {
    const e = ein({ funkkenner: "  " });
    expect(e.funkkenner).toBeNull();
    expect(e.kennzeichen).toBeNull();
    expect(e.bemerkung).toBeNull();
  });

  it("das Kennzeichen wird groß geschrieben und hat einfache Leerzeichen", () => {
    expect(ein({ kennzeichen: " ue-rk  831 " }).kennzeichen).toBe("UE-RK 831");
  });

  it("die Längen des Einsatzbuchs gelten, mit deutschem Feldfehler", () => {
    const r = fahrzeugEingabe.safeParse({ ...basis, typ: "x".repeat(21), funkrufname: "" });
    expect(r.success).toBe(false);
    const meldungen = r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    expect(meldungen).toContain("typ: Typ ist länger als 20 Zeichen");
    expect(meldungen).toContain("funkrufname: Funkrufname fehlt");
  });
});

describe("Speichern", () => {
  it("zwei Fahrzeuge ohne Funkkenner und ohne Kennzeichen sind erlaubt", () => {
    const db = testDb();
    speichereFahrzeug(db, null, ein({ funkkenner: "" }));
    speichereFahrzeug(db, null, ein({ funkkenner: "", funkrufname: "Anhänger" }));
    expect(listeFahrzeuge(db)).toHaveLength(2);
  });

  it("ein vergebener Funkkenner oder ein vergebenes Kennzeichen meldet das Feld", () => {
    const db = testDb();
    speichereFahrzeug(db, null, ein({ kennzeichen: "UE-RK 1" }));
    expect(() => speichereFahrzeug(db, null, ein({ kennzeichen: "UE-RK 2" }))).toThrow(SchonVergeben);
    try {
      speichereFahrzeug(db, null, ein({ funkkenner: "11-83-2", kennzeichen: "ue-rk 1" }));
      expect.unreachable();
    } catch (e) {
      expect((e as SchonVergeben).feld).toBe("kennzeichen");
    }
  });

  it("ändern ohne neuen Wert lässt aktualisiertAm stehen", () => {
    const db = testDb();
    const f = speichereFahrzeug(db, null, ein(), new Date("2026-10-21T08:00:00Z"));
    expect(speichereFahrzeug(db, f.id, ein(), new Date("2026-10-22T08:00:00Z")).aktualisiertAm).toBe("2026-10-21T08:00:00.000Z");
    expect(speichereFahrzeug(db, f.id, ein({ standort: "Ebstorf" }), new Date("2026-10-22T08:00:00Z")).aktualisiertAm).toBe("2026-10-22T08:00:00.000Z");
  });

  it("ein unbekanntes Fahrzeug ist NichtGefunden", () => {
    const db = testDb();
    expect(() => speichereFahrzeug(db, "gibts-nicht", ein())).toThrow(NichtGefunden);
    expect(() => setzeAktiv(db, "gibts-nicht", false)).toThrow(NichtGefunden);
  });

  it("die Liste sortiert nach Standort, dann Funkkenner numerisch", () => {
    const db = testDb();
    for (const [standort, funkkenner] of [["Uelzen", "11-83-10"], ["Ebstorf", "13-83-1"], ["Uelzen", "11-83-2"]]) {
      speichereFahrzeug(db, null, ein({ standort, funkkenner }));
    }
    expect(listeFahrzeuge(db).map((f) => f.funkkenner)).toEqual(["13-83-1", "11-83-2", "11-83-10"]);
  });

  it("jede Änderung landet im Audit-Ausgang", () => {
    const db = testDb();
    const f = speichereFahrzeug(db, null, ein());
    setzeAktiv(db, f.id, false);
    const zeilen = db.$client.prepare("SELECT action, object_type FROM audit_outbox ORDER BY rowid").all();
    expect(zeilen).toEqual([{ action: "create", object_type: "stammfahrzeug" }, { action: "update", object_type: "stammfahrzeug" }]);
  });
});
