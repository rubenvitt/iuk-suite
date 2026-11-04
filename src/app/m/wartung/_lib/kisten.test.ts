import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { eintrag, inhalt, mangel } from "../_db/schema";
import { ladeArten, ladeGeraet, ladeInhalt } from "./daten";
import { artEingabe, inhaltEingabe } from "./eingabe";
import { wartungFaelligkeiten } from "./faelligkeiten";
import { Abgelehnt, geraetAnlegen, inhaltSpeichern, neueId, pruefungAbschliessen, ungepushteAusfaelle } from "./schreiben";
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

type Liste = ReturnType<typeof ladeInhalt>;
/** Eine Zählung: `fehlt` nennt die Positionen (Index → Text), die fehlen; gezählt gegen die angezeigte Menge. */
const zaehlung = (liste: Liste, fehlt: Record<number, string> = {}) =>
  liste.map((p, i) => ({ punktId: p.id, ok: !(i in fehlt), text: fehlt[i] ?? "", soll: p.soll }));
const zaehle = (db: ReturnType<typeof testDb>, id: string, liste: Liste, fehlt: Record<number, string> = {}) =>
  pruefungAbschliessen(db, id, {
    sendung: neueId(), stunden: null, ergebnis: Object.keys(fehlt).length ? "mangel" : "ok", notiz: "", antworten: zaehlung(liste, fehlt),
  }, new Map(), K);
const offen = (db: ReturnType<typeof testDb>, id: string) =>
  db.select().from(mangel).where(and(eq(mangel.geraetId, id), isNull(mangel.behobenAm))).all();

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
      sendung, stunden: null, ergebnis: "mangel", notiz: "", antworten: zaehlung(liste, { 1: "" }),
    }, new Map(), K);
    expect(r.maengel).toBe(1);
    const m = db.select().from(mangel).where(eq(mangel.geraetId, id)).all();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ text: "Fehlt: USB-C-Hub (Soll 2)", fehlt: true, inhaltId: liste[1].id, einsatzbereit: true });
    const e = db.select().from(eintrag).where(eq(eintrag.id, sendung)).get()!;
    expect(e.fristId).toBe(START.frist.kiste.quartal);
    expect(JSON.parse(e.antworten!)).toEqual([{ text: "3 × HDMI-Kabel 2 m", ok: true }, { text: "2 × USB-C-Hub", ok: false }]);
    const g = ladeGeraet(db, id, HEUTE)!;
    expect(g).toMatchObject({ zustand: "mangel", fehlend: 1 });
  });

  it("Durchzählen: ein Text kommt an den Mangel, eine leere Liste und eine geänderte werden abgewiesen", () => {
    const { db, id, liste } = mitKiste();
    expect(() => pruefungAbschliessen(db, id, {
      sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten: zaehlung(liste).slice(0, 1),
    }, new Map(), K)).toThrow(/Inhaltsliste hat sich geändert/);
    zaehle(db, id, liste, { 0: "nur 2 da" });
    expect(db.select().from(mangel).where(eq(mangel.geraetId, id)).get()!.text).toBe("Fehlt: HDMI-Kabel 2 m (Soll 3) – nur 2 da");

    const leer = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: "Leere Kiste" }, K.jetzt);
    expect(() => pruefungAbschliessen(db, leer, { sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten: [] }, new Map(), K))
      .toThrow(Abgelehnt);
  });

  it("„Was steht an“: eine Kiste mit Fehlendem erscheint als „Kiste unvollständig“", () => {
    const { db, id, liste } = mitKiste();
    const jetzt = new Date(K.jetzt);
    expect(wartungFaelligkeiten(jetzt, db).filter((f) => f.art === "Kiste unvollständig")).toEqual([]);
    zaehle(db, id, liste, { 0: "", 1: "" });
    const f = wartungFaelligkeiten(jetzt, db).filter((x) => x.art === "Kiste unvollständig");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ titel: "I&K-Kiste 1", zustand: "2 Positionen fehlen", dringlichkeit: "bald", pfad: `/geraete/${id}` });
    // Gerade durchgezählt: die Quartalsprüfung selbst steht nicht an.
    expect(wartungFaelligkeiten(jetzt, db).some((x) => x.id.startsWith(`frist:${id}`))).toBe(false);
  });

  it("je Position ein offener Fehlt-Mangel; wieder vollständig gezählt ist er behoben", () => {
    const { db, id, liste } = mitKiste();
    expect(zaehle(db, id, liste, { 1: "" }).maengel).toBe(1);
    expect(zaehle(db, id, liste, { 1: "immer noch weg" }).maengel).toBe(0);
    expect(offen(db, id)).toHaveLength(1);
    expect(ladeGeraet(db, id, HEUTE)!.fehlend).toBe(1);
    expect(zaehle(db, id, liste, { 0: "" }).maengel).toBe(1);
    expect(offen(db, id).map((m) => m.inhaltId)).toEqual([liste[0].id]);
    expect(db.select().from(eintrag).where(and(eq(eintrag.geraetId, id), eq(eintrag.typ, "behoben"))).all().map((e) => e.titel))
      .toEqual(["Wieder vollständig"]);
  });

  it("fehlt eine Position weiter und ist die Kiste nicht einsatzbereit, gilt das für den alten Mangel; ein Foto dazu geht weg", () => {
    const { db, id, liste } = mitKiste();
    zaehle(db, id, liste, { 1: "" });
    const spaeter = { ...K, jetzt: K.jetzt + 60_000 };
    const foto = neueId();
    const r = pruefungAbschliessen(db, id, {
      sendung: neueId(), stunden: null, ergebnis: "defekt", notiz: "", antworten: zaehlung(liste, { 1: "" }),
    }, new Map([[liste[1].id, foto]]), spaeter);
    expect(r).toEqual({ maengel: 0, ungenutzteFotos: [foto] });
    expect(offen(db, id)).toMatchObject([{ inhaltId: liste[1].id, einsatzbereit: false, gemeldetAm: K.jetzt, herabgestuftAm: spaeter.jetzt }]);
    // Gemeldet wurde der Mangel vor `seit`, nicht einsatzbereit ist er erst jetzt: der Sofort-Push kommt.
    expect(ungepushteAusfaelle(db, spaeter.jetzt).map((m) => m.geraetId)).toEqual([id]);
  });

  it("eine inzwischen geänderte Soll-Menge macht die Zählung ungültig", () => {
    const { db, id, liste } = mitKiste();
    const angezeigt = zaehlung(liste);
    inhaltSpeichern(db, id, [{ ...liste[0], soll: 5 }, liste[1]]);
    expect(() => pruefungAbschliessen(db, id, { sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten: angezeigt }, new Map(), K))
      .toThrow(/Inhaltsliste hat sich geändert/);
    expect(() => pruefungAbschliessen(db, id, {
      sendung: neueId(), stunden: null, ergebnis: "ok", notiz: "", antworten: angezeigt.map((a) => ({ punktId: a.punktId, ok: a.ok, text: a.text })),
    }, new Map(), K)).toThrow(/Inhaltsliste hat sich geändert/);
  });

  it("eine entfernte Position lässt ihren Mangel stehen, ohne Bezug", () => {
    const { db, id, liste } = mitKiste();
    zaehle(db, id, liste, { 1: "" });
    inhaltSpeichern(db, id, [liste[0]]);
    expect(offen(db, id)).toMatchObject([{ fehlt: true, inhaltId: null }]);
  });

  it("eine Materialkiste hat keine Betriebsstunden-Pflicht", () => {
    const art = { name: "Kisten", einzahl: "Kiste", ikone: "package", kiste: true, checkliste: [],
      fristen: [{ id: null, name: "Quartalsprüfung", wer: "intern" as const, monate: 3, stunden: null }] };
    expect(artEingabe.safeParse({ ...art, stundenPflicht: false }).success).toBe(true);
    expect(artEingabe.safeParse({ ...art, stundenPflicht: true }).success).toBe(false);
    const nurStunden = [{ ...art.fristen[0], monate: null, stunden: 500 }];
    expect(artEingabe.safeParse({ ...art, stundenPflicht: false, fristen: nurStunden }).success).toBe(false);
    expect(artEingabe.safeParse({ ...art, stundenPflicht: false, kiste: false, checkliste: [{ id: null, text: "Sicht", hinweis: "" }], fristen: nurStunden }).success).toBe(true);
  });
});
