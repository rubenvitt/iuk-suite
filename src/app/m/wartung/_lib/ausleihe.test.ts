import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { eintrag, mangel } from "../_db/schema";
import { entnehmen, ganzeSchliessen, zuruecklegen } from "./ausleihe";
import { ladeArten, ladeGeraet, ladeInhalt } from "./daten";
import {
  Abgelehnt, anlassVermerken, artSpeichern, geraetAendern, geraetAktiv, geraetAnlegen, inhaltSpeichern, neueId, pruefartSpeichern, pruefplanSpeichern,
  pruefungAbschliessen, ungepushteAusfaelle,
} from "./schreiben";
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
    inhaltSpeichern(s.db, anderes, [{ id: null, text: "Patchkabel 10 m", soll: 4, bemerkung: "" }]);
    expect(() => entnehmen(s.db, anderes, e, K)).toThrow(/unvollständig/);
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
    expect(() => entnehmen(a.db, a.id, teil(a.patch, 1), K)).toThrow(/ganze Kiste ist schon unterwegs/);
    expect(stand(a).jePosition.get(a.patch)).toBe(4);
    const b = setup();
    entnehmen(b.db, b.id, teil(b.patch, 1), K);
    expect(() => entnehmen(b.db, b.id, ganz(), K)).toThrow(/schon etwas unterwegs/);
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
    expect(s.db.select().from(eintrag).where(and(eq(eintrag.geraetId, s.id), eq(eintrag.typ, "mangel"))).all()).toHaveLength(1);
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

  it("Zurücklegen behebt keinen offenen Fehlt-Mangel", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 2), K);
    const a = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(a.id, a.positionen[0].id, 0, 2, true), K);
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    const b = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(b.id, b.positionen[0].id, 1, 1), K);
    const m = s.db.select().from(mangel).where(eq(mangel.geraetId, s.id)).all();
    expect(m).toHaveLength(1);
    expect(m[0].behobenAm).toBeNull();
  });

  it("ganz mit Positionen wird abgelehnt", () => {
    const s = setup();
    expect(() => entnehmen(s.db, s.id, { ...ganz(), positionen: [{ inhaltId: s.patch, menge: 1 }] }, K)).toThrow(/unvollständig/);
  });

  it("ein ausgemustertes Gerät lässt sich nicht entnehmen", () => {
    const s = setup();
    geraetAktiv(s.db, s.id, false, K.jetzt);
    expect(() => entnehmen(s.db, s.id, teil(s.patch, 1), K)).toThrow(/gibt es nicht mehr/);
  });

  it("zurücklegen mit der Entnahme eines anderen Geräts wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    const e = stand(s).entnahmen[0];
    const anderes = geraetAnlegen(s.db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: "Kiste 2" }, K.jetzt);
    expect(() => zuruecklegen(s.db, anderes, rueck(e.id, e.positionen[0].id, 1, 1), K)).toThrow(/schon zurückgelegt/);
  });

  it("Ausmustern mit offener Entnahme wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    expect(() => geraetAktiv(s.db, s.id, false, K.jetzt)).toThrow(/Erst zurücklegen/);
  });

  it("Art ändern mit offener Entnahme wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    expect(() => geraetAendern(s.db, s.id, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Kiste 1" }, K.jetzt)).toThrow(/Erst zurücklegen/);
    const e = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 1), K);
    geraetAendern(s.db, s.id, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Kiste 1" }, K.jetzt);
  });

  it("Art zur Nicht-Kiste machen mit offener Entnahme wird abgelehnt", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 1), K);
    const a = ladeArten(s.db).find((x) => x.id === START.art.kiste)!;
    const eingabe = { ...a, kiste: false, checkliste: a.checkliste.map((p) => ({ id: p.id, text: p.text, hinweis: p.hinweis })) };
    expect(() => artSpeichern(s.db, a.id, eingabe, K.jetzt)).toThrow(/Erst zurücklegen/);
    expect(ladeArten(s.db).find((x) => x.id === START.art.kiste)!.kiste).toBe(true);
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

  it("Geräte (keine Kiste) werden abgelehnt, sie melden sich mit „Wird eingesetzt“", () => {
    const db = testDb();
    const id = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Strom 1" }, K.jetzt);
    expect(() => entnehmen(db, id, ganz(), K)).toThrow("Geräte meldest du mit „Wird eingesetzt“.");
    expect(() => zuruecklegen(db, id, { entnahmeId: neueId(), positionen: [] }, K)).toThrow("Geräte meldest du mit „Wird eingesetzt“.");
    expect(unterwegsStand(db, id).entnahmen).toHaveLength(0);
  });
});

/**
 * Abgleich mit #524 (IDA-369): Entnehmen und Zurücklegen speisen die Vermerke `einsatz`/`rueckkehr`, statt neben
 * „Wird eingesetzt“/„Zurück“ zu stehen. Die Uhr läuft, denn die Vermerke ordnen sich nach ihrer Erfassung.
 */
describe("Entnehmen und Zurücklegen vermerken Einsatz und Rückkehr", () => {
  let uhr = Date.UTC(2026, 10, 8, 10);
  const k = () => ({ ...K, jetzt: (uhr += 60_000) });
  const vermerke = (db: ReturnType<typeof testDb>, id: string, typ: "einsatz" | "rueckkehr") =>
    db.select().from(eintrag).where(and(eq(eintrag.geraetId, id), eq(eintrag.typ, typ))).all();
  const fristVon = (db: ReturnType<typeof testDb>, id: string, pruefartId: string) =>
    ladeGeraet(db, id, K.heute)!.staende.find((f) => f.vorlage.id === pruefartId)!;

  /** Die Kiste mit Prüfung nach Frist (Quartal) und nach Benutzung; „vor Verwendung“ gibt es an Kisten nicht. */
  function mitAnlass(nurAnlass = false) {
    const s = setup();
    const vorher = pruefartSpeichern(s.db, null, { name: "Kurzblick", wer: "intern", monate: null, stunden: null, anlass: "einsatz" });
    const nachher = pruefartSpeichern(s.db, null, { name: "Nach dem Einsatz", wer: "intern", monate: null, stunden: null, anlass: "rueckkehr" });
    const a = ladeArten(s.db).find((x) => x.id === START.art.kiste)!;
    const kistenArt = (pruefarten: string[]) => artSpeichern(s.db, a.id, { ...a, pruefarten, checkliste: [] }, k().jetzt);
    kistenArt(nurAnlass ? [nachher] : [...a.pruefarten, nachher]);
    return { ...s, vorher, nachher, kistenArt };
  }

  it("Entnehmen schreibt einmal `einsatz`, auch bei zwei Teil-Entnahmen", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, teil(s.patch, 1), k());
    entnehmen(s.db, s.id, teil(s.blitz, 1), k());
    expect(vermerke(s.db, s.id, "einsatz")).toHaveLength(1);
    expect(ladeGeraet(s.db, s.id, K.heute)!.imEinsatz).toBe(true);
  });

  it("die letzte Rückgabe schreibt `rueckkehr`, macht „nach Benutzung“ fällig und nennt sie", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, teil(s.patch, 2), k());
    const e = stand(s).entnahmen[0];
    const r = zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 2, 2), k());
    expect(vermerke(s.db, s.id, "rueckkehr")).toHaveLength(1);
    expect(ladeGeraet(s.db, s.id, K.heute)!.imEinsatz).toBe(false);
    expect(fristVon(s.db, s.id, s.nachher).stufe).toBe("ueberfaellig");
    expect(r.weiter).toBe(s.nachher);
  });

  it("auch ein als fehlend gemeldeter Rest schließt ab und schreibt `rueckkehr`", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, teil(s.patch, 2), k());
    const e = stand(s).entnahmen[0];
    zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 2, true), k());
    expect(vermerke(s.db, s.id, "rueckkehr")).toHaveLength(1);
  });

  it("Teil-Rückgabe mit noch offener Entnahme schreibt kein `rueckkehr`", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, teil(s.patch, 1), k());
    entnehmen(s.db, s.id, teil(s.blitz, 1), k());
    const e = stand(s).entnahmen[0];
    const r = zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 1), k());
    expect(vermerke(s.db, s.id, "rueckkehr")).toHaveLength(0);
    expect(ladeGeraet(s.db, s.id, K.heute)!.imEinsatz).toBe(true);
    expect(r.weiter).toBeNull();
  });

  it("ohne Prüfart nach Benutzung schreibt die letzte Rückgabe `rueckkehr`, führt aber nirgends hin", () => {
    const s = setup();
    entnehmen(s.db, s.id, teil(s.patch, 1), k());
    const e = stand(s).entnahmen[0];
    expect(zuruecklegen(s.db, s.id, rueck(e.id, e.positionen[0].id, 1, 1), k()).weiter).toBeNull();
    expect(vermerke(s.db, s.id, "rueckkehr")).toHaveLength(1);
  });

  it("Rückgabe der ganzen Kiste bindet an die Prüfart nach Frist, nie an eine auf Anlass, und schreibt `rueckkehr`", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, ganz(), k());
    const rueckgabe = stand(s).ganz!.id;
    const antworten = ladeInhalt(s.db, s.id).map((p) => ({ punktId: p.id, ok: true, text: "", soll: p.soll, punkt: p.text, hinweis: p.bemerkung, unterwegs: 0 }));
    const sende = (pruefartId?: string) =>
      pruefungAbschliessen(s.db, s.id, { sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten, rueckgabe, pruefartId }, new Map(), k());
    expect(() => sende(s.nachher)).toThrow(Abgelehnt);
    const r = sende();
    const p = s.db.select().from(eintrag).where(and(eq(eintrag.geraetId, s.id), eq(eintrag.typ, "pruefung"))).all();
    expect(p.map((x) => x.pruefartId)).toContain(START.pruefart.quartal);
    expect(vermerke(s.db, s.id, "rueckkehr")).toHaveLength(1);
    expect(stand(s).entnahmen).toHaveLength(0);
    expect(r.maengel).toBe(0);
  });

  it("das Durchzählen der ganzen Kiste erfüllt auch „nach Benutzung“: zwei Prüfungen, Mängel einmal, kein zweites Zählen", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, ganz(), k());
    const rueckgabe = stand(s).ganz!.id;
    // Die Blitzschutz-Position fehlt beim Zurücklegen.
    const antworten = ladeInhalt(s.db, s.id).map((p) => ({ punktId: p.id, ok: p.id !== s.blitz, text: "", soll: p.soll, punkt: p.text, hinweis: p.bemerkung, unterwegs: 0 }));
    const sendung = neueId();
    const r = pruefungAbschliessen(s.db, s.id, { sendung, stunden: null, ergebnis: "mangel", notiz: "Blitzschutz fehlt", antworten, rueckgabe }, new Map(), k());
    const p = s.db.select().from(eintrag).where(and(eq(eintrag.geraetId, s.id), eq(eintrag.typ, "pruefung"))).all();
    expect(p.map((x) => x.pruefartId).sort()).toEqual([START.pruefart.quartal, s.nachher].sort());
    const frist = p.find((x) => x.pruefartId === START.pruefart.quartal)!;
    const nach = p.find((x) => x.pruefartId === s.nachher)!;
    expect(frist).toMatchObject({ id: sendung, maengel: 1, ergebnis: "mangel" });
    expect(nach).toMatchObject({ maengel: 0, ergebnis: "mangel", notiz: "Blitzschutz fehlt", antworten: frist.antworten, titel: "Nach dem Einsatz" });
    expect(nach.id).not.toBe(sendung);
    expect(r.maengel).toBe(1);
    expect(s.db.select().from(mangel).where(and(eq(mangel.geraetId, s.id), isNull(mangel.behobenAm))).all()).toHaveLength(1);
    expect(fristVon(s.db, s.id, s.nachher).stufe).toBe("ok");
    expect(fristVon(s.db, s.id, START.pruefart.quartal).stufe).toBe("ok");
    expect(r).not.toHaveProperty("weiter");
  });

  it("eine Kiste hat keine Prüfung vor Verwendung, weder an der Art noch im Prüfplan des Geräts", () => {
    const s = mitAnlass();
    expect(() => s.kistenArt([START.pruefart.quartal, s.vorher])).toThrow("Materialkisten: eine Materialkiste hat keine Prüfung vor Verwendung – beim Entnehmen genügt ein kurzer Blick.");
    expect(() => pruefplanSpeichern(s.db, s.id, [{ pruefartId: s.vorher, an: true, eigenes: null }])).toThrow(/keine Prüfung vor Verwendung/);
    expect(ladeGeraet(s.db, s.id, K.heute)!.staende.map((f) => f.vorlage.id)).not.toContain(s.vorher);
  });

  it("solange die ganze Kiste unterwegs ist, bleibt ihre Prüfung nach Frist (Prüfplan und Art)", () => {
    const s = mitAnlass();
    entnehmen(s.db, s.id, ganz(), k());
    const ohneFrist = [{ pruefartId: START.pruefart.quartal, an: false, eigenes: null }];
    expect(() => pruefplanSpeichern(s.db, s.id, ohneFrist)).toThrow(/^Erst zurücklegen/);
    expect(() => s.kistenArt([s.nachher])).toThrow(/^Erst zurücklegen/);
    expect(fristVon(s.db, s.id, START.pruefart.quartal)).toBeDefined();
    // Eine Teil-Entnahme sperrt das nicht: sie kommt über das Zurücklegen zurück.
    const t = mitAnlass();
    entnehmen(t.db, t.id, teil(t.patch, 1), k());
    pruefplanSpeichern(t.db, t.id, ohneFrist);
  });

  it("ohne Prüfart nach Frist geht die ganze Kiste nicht mit, denn sie käme nicht zurück", () => {
    const s = mitAnlass(true);
    expect(() => entnehmen(s.db, s.id, ganz(), k())).toThrow(/Prüfung nach Frist/);
    entnehmen(s.db, s.id, teil(s.patch, 1), k());
  });

  it("„Wird eingesetzt“ gibt es für eine Kiste nicht, sie geht über Entnehmen", () => {
    const s = mitAnlass();
    expect(() => anlassVermerken(s.db, s.id, "einsatz", k())).toThrow("Kisten meldest du mit „Entnehmen“.");
    expect(vermerke(s.db, s.id, "einsatz")).toHaveLength(0);
  });
});
