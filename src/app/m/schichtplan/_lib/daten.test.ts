import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { Abgelehnt, entferneEinheit, ladePlanung, legeSchichtAn, loeschePlanung, loescheTempHelfer, NichtGefunden, setzeSchicht, speichereEinheit, speicherePlanung, speichereTempHelfer, teileAuf, teileZu, tragAus, verschiebeEinheit } from "./daten";
import { einheitEingabe, planungEingabe, schichtZeitEingabe, tempHelferEingabe } from "./eingabe";
import { STUNDE } from "./typen";
import { testDb } from "./testDb";

const T0 = Date.UTC(2026, 10, 14, 7); // Sa 14.11.2026 08:00 Berlin
const plan = (abw: object = {}) => planungEingabe.parse({ name: "Stadtfest", art: "veranstaltung", ort: "Markt", von: T0, bis: T0 + 12 * STUNDE, maxDienstMin: 720, minRuheMin: 480, ...abw });
const abschnitt = (abw: object = {}) => einheitEingabe.parse({ art: "abschnitt", name: "Sanitätswache Markt", schichtMin: 240, soll: 3, ...abw });
const zeit = (von: number, bis: number) => schichtZeitEingabe.parse({ von, bis });

function aufbau() {
  const db = testDb();
  const planId = speicherePlanung(db, null, plan());
  const einheitId = speichereEinheit(db, planId, null, abschnitt());
  return { db, planId, einheitId };
}

describe("teileAuf", () => {
  it("feste Länge, die letzte Schicht endet mit dem Zeitraum", () => {
    expect(teileAuf(0, 10 * STUNDE, 240).map((s) => (s.bis - s.von) / STUNDE)).toEqual([4, 4, 2]);
  });
  it("ein Rest unter 10 Minuten geht in die Schicht davor", () => {
    expect(teileAuf(0, 65 * 60_000, 60).map((s) => (s.bis - s.von) / 60_000)).toEqual([65]);
    expect(teileAuf(0, 70 * 60_000, 60).map((s) => (s.bis - s.von) / 60_000)).toEqual([60, 10]);
    expect(teileAuf(0, (1440 + 5) * 60_000, 1440).map((s) => (s.bis - s.von) / 60_000)).toEqual([1435, 10]);
  });
  it("ein Zeitraum unter 10 Minuten wird abgelehnt", () => {
    expect(planungEingabe.safeParse({ name: "x", art: "lage", von: T0, bis: T0 + 5 * 60_000, maxDienstMin: 720, minRuheMin: 480 }).success).toBe(false);
  });
});

describe("Planung und Einheiten", () => {
  it("eine neue Einheit bekommt Schichten über den ganzen Zeitraum", () => {
    const { db, planId } = aufbau();
    const p = ladePlanung(db, planId)!;
    expect(p.einheiten).toHaveLength(1);
    expect(p.schichten.map((s) => s.von)).toEqual([T0, T0 + 4 * STUNDE, T0 + 8 * STUNDE]);
  });

  it("neu aufteilen ersetzt die Schichten, ohne Haken bleiben sie", () => {
    const { db, planId, einheitId } = aufbau();
    speichereEinheit(db, planId, einheitId, abschnitt({ schichtMin: 360 }));
    expect(ladePlanung(db, planId)!.schichten).toHaveLength(3);
    speichereEinheit(db, planId, einheitId, abschnitt({ schichtMin: 360, neuAufteilen: true }));
    expect(ladePlanung(db, planId)!.schichten).toHaveLength(2);
  });

  it("ein kürzerer Zeitraum darf keine Schicht abschneiden", () => {
    const { db, planId } = aufbau();
    expect(() => speicherePlanung(db, planId, plan({ bis: T0 + 8 * STUNDE }))).toThrow(Abgelehnt);
  });

  it("Reihenfolge der Einheiten", () => {
    const { db, planId, einheitId } = aufbau();
    const zweite = speichereEinheit(db, planId, null, abschnitt({ name: "Zweite" }));
    verschiebeEinheit(db, planId, zweite, -1);
    expect(ladePlanung(db, planId)!.einheiten.map((e) => e.id)).toEqual([zweite, einheitId]);
    verschiebeEinheit(db, planId, zweite, -1);
    expect(ladePlanung(db, planId)!.einheiten.map((e) => e.id)).toEqual([zweite, einheitId]);
  });

  it("Löschen der Planung nimmt alles mit", () => {
    const { db, planId } = aufbau();
    loeschePlanung(db, planId);
    expect(ladePlanung(db, planId)).toBeNull();
  });
});

describe("Objekte gehören zu genau einer Planung (IDOR)", () => {
  it("Einheit, Schicht und temporärer Helfer einer anderen Planung sind nicht erreichbar", () => {
    const { db, planId, einheitId } = aufbau();
    const fremd = speicherePlanung(db, null, plan({ name: "Andere" }));
    const s = ladePlanung(db, planId)!.schichten[0];
    const t = speichereTempHelfer(db, planId, null, tempHelferEingabe.parse({ vorname: "Erika", nachname: "Beispiel" }));
    expect(() => entferneEinheit(db, fremd, einheitId)).toThrow(NichtGefunden);
    expect(() => setzeSchicht(db, fremd, s.id, zeit(T0, T0 + STUNDE))).toThrow(NichtGefunden);
    expect(() => legeSchichtAn(db, fremd, einheitId, zeit(T0, T0 + STUNDE))).toThrow(NichtGefunden);
    expect(() => teileZu(db, fremd, s.id, "temp", t, new Set())).toThrow(NichtGefunden);
    const fremdeEinheit = speichereEinheit(db, fremd, null, abschnitt());
    const fremdeSchicht = ladePlanung(db, fremd)!.schichten[0];
    expect(() => teileZu(db, fremd, fremdeSchicht.id, "temp", t, new Set())).toThrow(NichtGefunden);
    expect(() => setzeSchicht(db, planId, s.id, zeit(T0, T0 + STUNDE), fremdeEinheit)).toThrow(NichtGefunden);
  });
});

describe("Schichten und Einteilung", () => {
  it("anlegen, verschieben in eine andere Zeile, außerhalb des Zeitraums abgelehnt", () => {
    const { db, planId, einheitId } = aufbau();
    const zweite = speichereEinheit(db, planId, null, abschnitt({ name: "Zweite" }));
    const id = legeSchichtAn(db, planId, einheitId, zeit(T0 + STUNDE, T0 + 3 * STUNDE));
    setzeSchicht(db, planId, id, zeit(T0 + 2 * STUNDE, T0 + 5 * STUNDE), zweite);
    expect(ladePlanung(db, planId)!.schichten.find((s) => s.id === id)).toMatchObject({ einheitId: zweite, von: T0 + 2 * STUNDE });
    expect(() => legeSchichtAn(db, planId, einheitId, zeit(T0 - STUNDE, T0 + STUNDE))).toThrow(Abgelehnt);
  });

  it("zuteilen, umsetzen, austragen; unbekannte Stammkennung abgelehnt", () => {
    const { db, planId } = aufbau();
    const [a, b] = ladePlanung(db, planId)!.schichten;
    const stamm = new Set(["h1"]);
    teileZu(db, planId, a.id, "stamm", "h1", stamm);
    teileZu(db, planId, a.id, "stamm", "h1", stamm);
    expect(ladePlanung(db, planId)!.zuordnungen).toHaveLength(1);
    teileZu(db, planId, b.id, "stamm", "h1", stamm, a.id);
    expect(ladePlanung(db, planId)!.zuordnungen).toEqual([{ schichtId: b.id, quelle: "stamm", helferId: "h1" }]);
    tragAus(db, planId, b.id, "stamm", "h1");
    expect(ladePlanung(db, planId)!.zuordnungen).toEqual([]);
    expect(() => teileZu(db, planId, a.id, "stamm", "unbekannt", stamm)).toThrow(Abgelehnt);
  });

  it("temporären Helfer löschen nimmt seine Einteilungen mit", () => {
    const { db, planId } = aufbau();
    const t = speichereTempHelfer(db, planId, null, tempHelferEingabe.parse({ vorname: "Erika", nachname: "Beispiel", qualifikationen: [{ kurz: "RS", name: "Rettungssanitäter" }] }));
    expect(ladePlanung(db, planId)!.temporaere[0].qualifikationen).toEqual([{ kurz: "RS", name: "Rettungssanitäter" }]);
    teileZu(db, planId, ladePlanung(db, planId)!.schichten[0].id, "temp", t, new Set());
    loescheTempHelfer(db, planId, t);
    const p = ladePlanung(db, planId)!;
    expect(p.temporaere).toEqual([]);
    expect(p.zuordnungen).toEqual([]);
  });
});

describe("Audit", () => {
  it("eine Änderung schreibt eine Zeile, nicht noch eine für die Planung dazu", () => {
    const { db, planId } = aufbau();
    const zeilen = () => db.all<{ object_type: string; action: string }>(sql`SELECT object_type, action FROM audit_outbox ORDER BY rowid`);
    const vorher = zeilen().length;
    const s = ladePlanung(db, planId)!.schichten[0];
    setzeSchicht(db, planId, s.id, zeit(s.von, s.bis - STUNDE));
    expect(zeilen().slice(vorher)).toEqual([{ object_type: "schicht", action: "update" }]);
  });
});

describe("Eingaben", () => {
  it("Zeiten liegen im 5-Minuten-Raster", () => {
    expect(schichtZeitEingabe.safeParse({ von: T0 + 60_000, bis: T0 + STUNDE }).success).toBe(false);
    expect(schichtZeitEingabe.safeParse({ von: T0 + 5 * 60_000, bis: T0 + STUNDE }).success).toBe(true);
  });
  it("eine Schicht dauert mindestens 10 Minuten", () => {
    expect(schichtZeitEingabe.safeParse({ von: T0, bis: T0 + 5 * 60_000 }).success).toBe(false);
    expect(schichtZeitEingabe.safeParse({ von: T0, bis: T0 + 10 * 60_000 }).success).toBe(true);
    expect(einheitEingabe.safeParse({ art: "abschnitt", name: "UHS", schichtMin: 5, soll: 1 }).success).toBe(false);
    expect(einheitEingabe.safeParse({ art: "abschnitt", name: "UHS", schichtMin: 10, soll: 1 }).success).toBe(true);
  });
  it("Zeitraum höchstens 14 Tage", () => {
    expect(planungEingabe.safeParse({ name: "x", art: "lage", von: T0, bis: T0 + 15 * 24 * STUNDE, maxDienstMin: 720, minRuheMin: 480 }).success).toBe(false);
  });
});
