import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { eintrag, inhalt, mangel } from "../_db/schema";
import { ladeArten, ladeGeraet, ladeInhalt } from "./daten";
import { inhaltEingabe } from "./eingabe";
import { wartungFaelligkeiten } from "./faelligkeiten";
import { Abgelehnt, geraetAnlegen, inhaltSpeichern, neueId, pruefungAbschliessen } from "./schreiben";
import { START } from "./startbestand";
import { ladeAmGeraet } from "./telefon";
import { testDb } from "./testDb";

const HEUTE = "2026-11-03";
const K = { jetzt: Date.UTC(2026, 10, 3, 10), heute: HEUTE, wer: "Helfer A" };
const basis = { hersteller: "", typ: "", seriennr: "", ortArt: "lager" as const, ort: "Lager I&K, Regal 1", stunden: null };

function mitKiste() {
  const db = testDb();
  const id = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: "I&K-Kiste 1" }, K.jetzt);
  inhaltSpeichern(db, id, [
    { id: null, text: "HDMI-Kabel 2 m", soll: 3, bemerkung: "" },
    { id: null, text: "USB-C-Hub", soll: 2, bemerkung: "im Beutel" },
  ]);
  return { db, id, liste: ladeInhalt(db, id) };
}

describe("Materialkisten (IDA-335)", () => {
  it("die Migration bringt die Art „Materialkisten“ mit Quartalsprüfung und ohne Checkliste", () => {
    const a = ladeArten(testDb()).find((x) => x.id === START.art.kiste)!;
    expect(a).toMatchObject({ name: "Materialkisten", einzahl: "Materialkiste", kiste: true, checkliste: [] });
    expect(a.fristen.map((f) => [f.id, f.wer, f.monate])).toEqual([[START.frist.kiste.quartal, "intern", 3]]);
  });

  it("Inhaltsliste: bestehende Positionen behalten ihre Kennung, Reihenfolge wie übergeben", () => {
    const { db, id, liste } = mitKiste();
    inhaltSpeichern(db, id, [
      { id: liste[1].id, text: "USB-C-Hub", soll: 1, bemerkung: "" },
      { id: null, text: "Kaltgerätekabel", soll: 4, bemerkung: "" },
    ]);
    const neu = ladeInhalt(db, id);
    expect(neu.map((p) => [p.text, p.soll])).toEqual([["USB-C-Hub", 1], ["Kaltgerätekabel", 4]]);
    expect(neu[0].id).toBe(liste[1].id);
    expect(db.select().from(inhalt).where(eq(inhalt.id, liste[0].id)).get()).toBeUndefined();
  });

  it("Inhaltsliste nur an einer Materialkiste, Menge mindestens 1", () => {
    const db = testDb();
    const heizung = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.heizung, name: "Zeltheizung" }, K.jetzt);
    expect(() => inhaltSpeichern(db, heizung, [{ id: null, text: "Kabel", soll: 1, bemerkung: "" }])).toThrow(/Nur eine Materialkiste/);
    expect(inhaltEingabe.safeParse([{ id: null, text: "Kabel", soll: 0, bemerkung: "" }]).success).toBe(false);
    expect(inhaltEingabe.safeParse([{ id: null, text: " ", soll: 1, bemerkung: "" }]).success).toBe(false);
  });

  it("am Gerät ist die Inhaltsliste die Checkliste, mit Soll-Menge und Bemerkung", () => {
    const { db, id, liste } = mitKiste();
    const am = ladeAmGeraet(db, id, HEUTE)!;
    expect(am.g.kiste).toBe(true);
    expect(am.checkliste).toEqual([
      { id: liste[0].id, text: "HDMI-Kabel 2 m", hinweis: "", soll: 3 },
      { id: liste[1].id, text: "USB-C-Hub", hinweis: "im Beutel", soll: 2 },
    ]);
  });

  it("Durchzählen: „fehlt“ braucht keinen Text und wird ein Mangel mit `fehlt`", () => {
    const { db, id, liste } = mitKiste();
    const sendung = neueId();
    const r = pruefungAbschliessen(db, id, {
      sendung, stunden: null, ergebnis: "mangel", notiz: "",
      antworten: [{ punktId: liste[0].id, ok: true, text: "" }, { punktId: liste[1].id, ok: false, text: "" }],
    }, new Map(), K);
    expect(r.maengel).toBe(1);
    const m = db.select().from(mangel).where(eq(mangel.geraetId, id)).all();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ text: "Fehlt: USB-C-Hub (Soll 2)", fehlt: true, einsatzbereit: true });
    const e = db.select().from(eintrag).where(eq(eintrag.id, sendung)).get()!;
    expect(e.fristId).toBe(START.frist.kiste.quartal);
    expect(JSON.parse(e.antworten!)).toEqual([{ text: "3 × HDMI-Kabel 2 m", ok: true }, { text: "2 × USB-C-Hub", ok: false }]);
    const g = ladeGeraet(db, id, HEUTE)!;
    expect(g).toMatchObject({ zustand: "mangel", fehlend: 1 });
  });

  it("Durchzählen: ein Text kommt an den Mangel, eine leere Liste und eine geänderte werden abgewiesen", () => {
    const { db, id, liste } = mitKiste();
    expect(() => pruefungAbschliessen(db, id, {
      sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten: [{ punktId: liste[0].id, ok: true, text: "" }],
    }, new Map(), K)).toThrow(/Inhaltsliste hat sich geändert/);
    pruefungAbschliessen(db, id, {
      sendung: neueId(), stunden: null, ergebnis: "mangel", notiz: "",
      antworten: [{ punktId: liste[0].id, ok: false, text: "nur 2 da" }, { punktId: liste[1].id, ok: true, text: "" }],
    }, new Map(), K);
    expect(db.select().from(mangel).where(eq(mangel.geraetId, id)).get()!.text).toBe("Fehlt: HDMI-Kabel 2 m (Soll 3) – nur 2 da");

    const leer = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: "Leere Kiste" }, K.jetzt);
    expect(() => pruefungAbschliessen(db, leer, { sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten: [] }, new Map(), K))
      .toThrow(Abgelehnt);
  });

  it("„Was steht an“: eine Kiste mit Fehlendem erscheint als „Kiste unvollständig“", () => {
    const { db, id, liste } = mitKiste();
    const jetzt = new Date(K.jetzt);
    expect(wartungFaelligkeiten(jetzt, db).filter((f) => f.art === "Kiste unvollständig")).toEqual([]);
    pruefungAbschliessen(db, id, {
      sendung: neueId(), stunden: null, ergebnis: "mangel", notiz: "",
      antworten: liste.map((p) => ({ punktId: p.id, ok: false, text: "" })),
    }, new Map(), K);
    const f = wartungFaelligkeiten(jetzt, db).filter((x) => x.art === "Kiste unvollständig");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ titel: "I&K-Kiste 1", zustand: "2 Positionen fehlen", dringlichkeit: "bald", pfad: `/geraete/${id}` });
    // Gerade durchgezählt: die Quartalsprüfung selbst steht nicht an.
    expect(wartungFaelligkeiten(jetzt, db).some((x) => x.id.startsWith(`frist:${id}`))).toBe(false);
  });
});
