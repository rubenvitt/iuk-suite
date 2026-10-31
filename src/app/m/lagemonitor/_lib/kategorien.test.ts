import { describe, expect, it } from "vitest";
import { ICONS8 } from "@/core/ikonen/katalog";
import { alsVertrag } from "./konfiguration";
import { aendereKategorie, kategorieEingabe, KATEGORIEN_MAX, legeKategorieAn, listeKategorien, loescheKategorie } from "./kategorien";
import { FARBEN, istFaellig, NACHLAUF_MINUTEN, ZEICHEN } from "./kategorieRegeln";
import { aktiveMeldungen, legeMeldungAn, meldungEingabe } from "./meldungen";
import { testDb } from "./testDb";

const JETZT = new Date("2026-10-27T12:00:00Z"); // 13:00 in Berlin
const MIN = 60_000;

describe("Meldekategorien", () => {
  it("die Migration legt die Vorgaben an, „Meldung“ eingeschlossen", () => {
    const db = testDb();
    expect(listeKategorien(db).map((k) => [k.id, k.name, k.zeichen, k.farbe, k.vorlaufMinuten])).toEqual([
      ["lagemeldung", "Lagemeldung", "clipboard", "blau", 5],
      ["meldung", "Meldung", "info", "grau", 5],
      ["besprechung", "Besprechung", "meeting", "violett", 10],
      ["abloesung", "Ablösung", "swap", "gruen", 15],
      ["verpflegung", "Verpflegung", "cutlery", "orange", 5],
    ]);
  });

  it("jedes Zeichen steht im Katalog, jede Farbe hat einen Drahtschlüssel und es gibt kein Rot", () => {
    for (const z of ZEICHEN) expect(ICONS8[z]).toBeDefined();
    expect(new Set(FARBEN.map((f) => f.draht)).size).toBe(FARBEN.length);
    expect(FARBEN.map((f) => f.wert)).not.toContain("rot");
  });

  it("anlegen hängt hinten an, ändern und löschen wirken", () => {
    const db = testDb();
    const r = legeKategorieAn(db, kategorieEingabe.parse({ name: "Funk", zeichen: "walkie-talkie", farbe: "tuerkis", vorlaufMinuten: null }), JETZT);
    if (!r.ok) throw new Error(r.fehler);
    expect(listeKategorien(db).at(-1)).toEqual({ id: r.kategorie.id, name: "Funk", zeichen: "walkie-talkie", farbe: "tuerkis", vorlaufMinuten: null });
    expect(aendereKategorie(db, r.kategorie.id, kategorieEingabe.parse({ name: "Funkverkehr", zeichen: "phone", farbe: "ocker", vorlaufMinuten: 2 }))).toMatchObject({ ok: true, kategorie: { name: "Funkverkehr", vorlaufMinuten: 2 } });
    expect(loescheKategorie(db, r.kategorie.id)).toBe(true);
    expect(loescheKategorie(db, r.kategorie.id)).toBe(false);
    expect(aendereKategorie(db, "weg", kategorieEingabe.parse({ name: "x", zeichen: "info", farbe: "blau", vorlaufMinuten: null }))).toMatchObject({ ok: false });
  });

  it("nimmt nur Zeichen, Farben und Vorläufe aus der Auswahl", () => {
    const gut = { name: "Funk", zeichen: "info", farbe: "blau", vorlaufMinuten: 5 };
    expect(kategorieEingabe.safeParse(gut).success).toBe(true);
    expect(kategorieEingabe.safeParse({ ...gut, zeichen: "trash" }).success).toBe(false);
    expect(kategorieEingabe.safeParse({ ...gut, farbe: "rot" }).success).toBe(false);
    expect(kategorieEingabe.safeParse({ ...gut, vorlaufMinuten: 7 }).success).toBe(false);
    expect(kategorieEingabe.safeParse({ ...gut, name: "  " }).success).toBe(false);
    expect(kategorieEingabe.safeParse({ ...gut, name: "x".repeat(25) }).success).toBe(false);
  });

  it(`höchstens ${KATEGORIEN_MAX}`, () => {
    const db = testDb();
    const e = kategorieEingabe.parse({ name: "x", zeichen: "info", farbe: "blau", vorlaufMinuten: null });
    while (listeKategorien(db).length < KATEGORIEN_MAX) expect(legeKategorieAn(db, e).ok).toBe(true);
    expect(legeKategorieAn(db, e)).toMatchObject({ ok: false });
  });

  it("geht mit Zeichen, Farbe und Vorlauf an den Monitor; gelöscht steht die Meldung ohne da", () => {
    const db = testDb();
    const r = legeMeldungAn(db, meldungEingabe.parse({ text: "Lage", uhrzeit: "14:30", kategorieId: "besprechung" }), "Ruben", JETZT);
    if (!r.ok) throw new Error(r.fehler);
    const [n] = alsVertrag(db, JETZT).notices;
    expect(n.category).toEqual({ name: "Besprechung", color: "purple", icon: { viewBox: ICONS8.meeting.viewBox, paths: [...ICONS8.meeting.pfade] }, alertLeadMinutes: 10 });
    loescheKategorie(db, "besprechung");
    expect(aktiveMeldungen(db, JETZT)[0].kategorie).toBeNull();
    expect(alsVertrag(db, JETZT).notices[0].category).toBeNull();
  });

  it("eine unbekannte Kategorie lehnt das Anlegen einer Meldung ab", () => {
    const db = testDb();
    expect(legeMeldungAn(db, meldungEingabe.parse({ text: "Lage", kategorieId: "gibtsnicht" }), "Ruben", JETZT)).toMatchObject({ ok: false });
  });
});

describe("istFaellig", () => {
  const ziel = JETZT.getTime();
  it("blinkt ab dem Vorlauf bis zum Nachlauf", () => {
    expect(istFaellig(ziel, 5, ziel - 5 * MIN - 1)).toBe(false);
    expect(istFaellig(ziel, 5, ziel - 5 * MIN)).toBe(true);
    expect(istFaellig(ziel, 5, ziel + NACHLAUF_MINUTEN * MIN - 1)).toBe(true);
    expect(istFaellig(ziel, 5, ziel + NACHLAUF_MINUTEN * MIN)).toBe(false);
  });
  it("ohne Uhrzeit oder mit „Nie“ blinkt nichts", () => {
    expect(istFaellig(null, 5, ziel)).toBe(false);
    expect(istFaellig(ziel, null, ziel)).toBe(false);
  });
});
