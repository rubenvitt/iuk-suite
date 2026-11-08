import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { mangel } from "../_db/schema";
import { entnehmen, ganzeSchliessen, zuruecklegen } from "./ausleihe";
import { ladeInhalt } from "./daten";
import { Abgelehnt, geraetAktiv, geraetAnlegen, inhaltSpeichern, mangelMelden, neueId, ungepushteAusfaelle } from "./schreiben";
import { START } from "./startbestand";
import { testDb } from "./testDb";
import { unterwegsStand } from "./unterwegs";

const K = { jetzt: Date.UTC(2026, 10, 8, 10), heute: "2026-11-08", wer: "Helfer A", nutzer: "sub-a" };
const basis = { hersteller: "", typ: "", seriennr: "", ortArt: "lager" as const, ort: "Lager", fahrzeugId: null, stunden: null, hinweise: "", pruefanleitung: "" };

function setup() {
  const db = testDb();
  const id = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: "Kiste 1" }, K.jetzt);
  inhaltSpeichern(db, id, [
    { id: null, text: "Patchkabel 10 m", soll: 4, bemerkung: "" },
    { id: null, text: "Blitzschutz", soll: 2, bemerkung: "" },
  ]);
  const [patch, blitz] = ladeInhalt(db, id).map((p) => p.id);
  return { db, id, patch, blitz };
}
const teil = (patch: string, menge: number, zweck = "Übung") => ({ sendung: neueId(), ganz: false, zweck, positionen: [{ inhaltId: patch, menge }] });
const ganz = () => ({ sendung: neueId(), ganz: true, zweck: "", positionen: [] });
const rueck = (entnahmeId: string, positionId: string, zurueck: number, offen: number, fehlt = false) =>
  ({ entnahmeId, positionen: [{ positionId, zurueck, fehlt, offen }] });
const stand = (s: ReturnType<typeof setup>) => unterwegsStand(s.db, s.id);

describe("Entnehmen und Zurücklegen (IDA-372)", () => {
  it("entnimmt Teile und zeigt sie als unterwegs", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2, "Übung Nord"), K);
    const u = stand(s);
    expect(u.jePosition.get(s.patch)).toBe(2);
    expect(u.entnahmen[0]).toMatchObject({ wer: "Helfer A", zweck: "Übung Nord" });
  });

  it("dieselbe Sendung zweimal steht nur einmal da", () => {
    const s = setup();
    const e = teil(s.patch, 1);
    entnehmen(s.db, s.id, e, K);
    entnehmen(s.db, s.id, e, K);
    expect(stand(s).entnahmen).toHaveLength(1);
  });

  it("eine fremde Sendung wird abgelehnt", () => {
    const s = setup();
    const e = teil(s.patch, 1);
    entnehmen(s.db, s.id, e, K);
    const anderes = geraetAnlegen(s.db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: "Kiste 2" }, K.jetzt);
    expect(() => entnehmen(s.db, anderes, e, K)).toThrow(Abgelehnt);
  });

  it("ohne Nutzer wird abgelehnt", () => {
    const s = setup();
    expect(() => entnehmen(s.db, s.id, teil(s.patch, 1), { ...K, nutzer: "" })).toThrow(/unvollständig/);
  });

  it("mehr als da ist wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 3), K);
    expect(() => entnehmen(s.db, s.id, teil(s.patch, 2), K)).toThrow(/nur noch 1/);
  });

  it("ganze Kiste schließt weitere Entnahmen aus", () => {
    const a = setup();
    entnehmen(a.db, a.id, ganz(), K);
    expect(() => entnehmen(a.db, a.id, teil(a.patch, 1), K)).toThrow(Abgelehnt);
    expect(stand(a).jePosition.get(a.patch)).toBe(4);
    const b = setup();
    entnehmen(b.db, b.id, teil(b.patch, 1), K);
    expect(() => entnehmen(b.db, b.id, ganz(), K)).toThrow(Abgelehnt);
  });

  it("eine Teil-Entnahme braucht Positionen, die zur Kiste gehören", () => {
    const s = setup();
    expect(() => entnehmen(s.db, s.id, { sendung: neueId(), ganz: false, zweck: "", positionen: [] }, K)).toThrow(Abgelehnt);
    expect(() => entnehmen(s.db, s.id, teil(neueId(), 1), K)).toThrow(Abgelehnt);
  });

  it("Teil-Rückgabe mit Nachreichen", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    const e = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 2), K);
    expect(stand(s).jePosition.get(s.patch)).toBe(1);
    expect(stand(s).entnahmen).toHaveLength(1);
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 1), K);
    expect(stand(s).jePosition.get(s.patch)).toBeUndefined();
    expect(stand(s).entnahmen).toHaveLength(0);
  });

  it("veraltete Rückgabe wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    const e = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 2), K);
    expect(() => zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 2), K)).toThrow(/schon zurückgelegt/);
  });

  it("mehr zurück als offen wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    const e = stand(s).entnahmen[0];
    expect(() => zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 3, 2), K)).toThrow(Abgelehnt);
  });

  it("Rest als fehlend wird ein einsatzbereiter Fehlt-Mangel", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    const e = stand(s).entnahmen[0];
    const r = zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 2, true), K);
    expect(r.maengel).toBe(1);
    const m = s.db.select().from(mangel).where(and(eq(mangel.geraetId, s.id), isNull(mangel.behobenAm))).all();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ fehlt: true, inhaltId: s.patch, einsatzbereit: true, text: "Fehlt: Patchkabel 10 m (1 von 2 nicht zurück)" });
    expect(stand(s).entnahmen).toHaveLength(0);
    expect(ungepushteAusfaelle(s.db, 0)).toEqual([]);
  });

  it("ein zweiter Rest für dieselbe Position legt keinen zweiten Mangel an", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    const e = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 0, 2, true), K);
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    const e2 = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e2.id, e2.positionen[0].id, 0, 1, true), K);
    expect(s.db.select().from(mangel).where(isNull(mangel.behobenAm)).all()).toHaveLength(1);
  });

  it("vollständige Rückgabe behebt einen alten Fehlt-Mangel", () => {
    const s = setup();
    const mid = neueId();
    mangelMelden(s.db, s.id, { id: mid, text: "Fehlt: Patchkabel 10 m", foto: false, einsatzbereit: true }, K);
    s.db.update(mangel).set({ fehlt: true, inhaltId: s.patch }).where(eq(mangel.id, mid)).run();
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    const e = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 1), K);
    expect(s.db.select().from(mangel).where(eq(mangel.id, mid)).get()!.behobenAm).toBe(K.jetzt);
  });

  it("Ausmustern mit offener Entnahme wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    expect(() => geraetAktiv(s.db, s.id, false, K.jetzt)).toThrow(/Erst zurücklegen/);
  });

  it("Inhaltsliste: unterwegs schützt Position und Soll", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    expect(() => inhaltSpeichern(s.db, s.id, [{ id: s.blitz, text: "Blitzschutz", soll: 2, bemerkung: "" }])).toThrow(/unterwegs und kann nicht/);
    expect(() => inhaltSpeichern(s.db, s.id, [
      { id: s.patch, text: "Patchkabel 10 m", soll: 1, bemerkung: "" }, { id: s.blitz, text: "Blitzschutz", soll: 2, bemerkung: "" },
    ])).toThrow(/2 unterwegs/);
    inhaltSpeichern(s.db, s.id, [
      { id: s.patch, text: "Patchkabel 5 m", soll: 4, bemerkung: "" }, { id: s.blitz, text: "Blitzschutz", soll: 2, bemerkung: "" },
    ]);
    expect(stand(s).entnahmen[0].positionen[0].text).toBe("Patchkabel 10 m");
  });

  it("eine ganze Kiste kommt nicht über zuruecklegen zurück", () => {
    const s = setup();
    entnehmen(s.db, s.id, ganz(), K);
    expect(() => zuruecklegen(s.db, s.id, { entnahmeId: stand(s).ganz!.id, positionen: [] }, K)).toThrow(Abgelehnt);
    s.db.transaction((tx) => ganzeSchliessen(tx, s.id, stand(s).ganz!.id, K));
    expect(stand(s).entnahmen).toHaveLength(0);
  });

  it("Gerät ohne Inhaltsliste: ganz entnehmen und zurücklegen", () => {
    const db = testDb();
    const id = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Strom 1" }, K.jetzt);
    entnehmen(db, id, ganz(), K);
    const u = unterwegsStand(db, id);
    expect(u.ganz).not.toBeNull();
    zuruecklegen(db, id, { entnahmeId: u.ganz!.id, positionen: [] }, K);
    expect(unterwegsStand(db, id).entnahmen).toHaveLength(0);
    expect(() => entnehmen(db, id, teil(neueId(), 1), K)).toThrow(Abgelehnt);
  });
});
