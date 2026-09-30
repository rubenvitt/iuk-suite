import { describe, expect, it } from "vitest";
import type { Stelle, Verbindung } from "../plan/schema";
import { kartenMass, type KartenEingabe } from "./karte";
import { EINHEIT, KANAL, KARTE, SECHSECK, STIEL } from "./masse";
import { textBreite } from "./text";

const stelle = (rest: Partial<Stelle> = {}): Stelle => ({
  id: "s", eltern: null, lage: "unter", reihenfolge: 0, zeichen: "rezept:D.1.4", titel: "Einsatzleitung",
  leiter: null, hervorheben: false, verbindungId: null, kanaele: [], kontakte: [], einheiten: [], ...rest,
});
const mass = (s: Partial<Stelle> = {}, e: Partial<Omit<KartenEingabe, "stelle">> = {}) =>
  kartenMass({ stelle: stelle(s), leerzeilen: false, darstellung: "normal", versteckt: 0, anzahlGruppen: 0, kanaele: [], ...e });
const DMO: Verbindung = { id: "dmo-608", art: "dmo", bezeichnung: "DMO 608" };
const TMO: Verbindung = { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" };
const einheiten = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, typ: "RTW", rufname: `RK UE 40-83-${i}`, zeichen: null }));

describe("kartenMass", () => {
  it("feste Breite, Kopf mindestens 12 mm, ohne Kontakte nur der Kopf", () => {
    const m = mass();
    expect(m.breite).toBe(KARTE.breite);
    expect(m.kopfHoehe).toBe(KARTE.kopfMin);
    expect(m.hoehe).toBe(m.kopfHoehe);
    expect(m.blockHoehe).toBe(m.hoehe);
    expect(m.titel[0].x).toBe(KARTE.titelX);
  });
  it("ohne Zeichen beginnt der Titel am Innenrand", () => expect(mass({ zeichen: null }).titel[0].x).toBe(KARTE.rand));
  it("mit Leerzeilen: sechs Kontaktzeilen à 4,5 mm", () => {
    const m = mass({}, { leerzeilen: true });
    expect(m.kontakte).toHaveLength(6);
    expect(m.hoehe).toBeCloseTo(KARTE.kopfMin + 6 * KARTE.kontaktHoehe, 9);
  });
  it("ein langer Titel bricht auf höchstens drei Zeilen, der volle Text bleibt erhalten", () => {
    const lang = "Technische Einsatzleitung Bereitstellungsraum Nord mit Patientenablage und Transportorganisation";
    const m = mass({ titel: lang });
    expect(m.titel).toHaveLength(3);
    expect(m.gekuerzt).toBe(true);
    expect(m.titelVoll).toBe(lang);
    for (const z of m.titel) expect(textBreite(z.text, z.groesse, true)).toBeLessThanOrEqual(KARTE.breite - KARTE.titelX - KARTE.innenRechts + 1e-9);
    expect(m.kopfHoehe).toBeGreaterThan(KARTE.kopfMin);
  });
  it("eine lange E-Mail-Adresse macht ihre Zeile zweizeilig", () => {
    const m = mass({ kontakte: [{ art: "email", wert: "max.mustermann@drk-kreisverband-uelzen.de" }] });
    expect(m.kontakte[0].zeilen).toHaveLength(2);
    expect(m.kontakte[0].hoehe).toBeGreaterThan(KARTE.kontaktHoehe);
  });
  it("Emoji und CJK im Titel werfen nicht", () => {
    expect(() => mass({ titel: "🚑 救护车 Einsatz" })).not.toThrow();
  });
  it.each(["", "   "])("leerer Titel %j: keine Titelzeile, Mindestkopf, kein Platzhalter auf dem Papier", (titel) => {
    const m = mass({ titel });
    expect(m.titel).toEqual([]);
    expect(m.titelVoll).toBe("");
    expect(m.kopfHoehe).toBe(KARTE.kopfMin);
    expect(JSON.stringify(m)).not.toContain("ohne Titel");
  });
  it("neun Einheiten: eine Spalte im Takt 5,5 mm; zehn: zwei Spalten, Block breiter als die Karte", () => {
    const neun = mass({ einheiten: einheiten(9) });
    expect(new Set(neun.einheiten.map((e) => e.x)).size).toBe(1);
    expect(neun.einheiten[1].y - neun.einheiten[0].y).toBeCloseTo(EINHEIT.takt, 9);
    expect(neun.blockBreite).toBe(KARTE.breite);
    const zehn = mass({ einheiten: einheiten(10) });
    expect(new Set(zehn.einheiten.map((e) => e.x)).size).toBe(2);
    expect(zehn.blockBreite).toBeCloseTo(EINHEIT.einzugMin + 2 * EINHEIT.breite + EINHEIT.spaltenAbstand, 9);
  });
  it("dreißig Einheiten: zwei Spalten à 15, der Block wächst nach unten", () => {
    const m = mass({ einheiten: einheiten(30) });
    expect(m.blockHoehe).toBeCloseTo(m.hoehe + EINHEIT.abstandOben + 14 * EINHEIT.takt + EINHEIT.hoehe, 9);
  });
  it("mit Einheiten und Kindern: Stiele laufen in einer Gasse links neben der Einheitenspalte", () => {
    const m = mass({ einheiten: einheiten(3) }, { anzahlGruppen: 2 });
    expect(m.gasse).toEqual([1.5, 3]);
    expect(Math.min(...m.einheiten.map((e) => e.x))).toBeGreaterThan(Math.max(...m.gasse));
    expect(mass({ einheiten: einheiten(3) }, { anzahlGruppen: 4 }).einheiten[0].x).toBeCloseTo(8.5, 9);
    expect(mass({}, { anzahlGruppen: 2 }).gasse).toEqual([]);
  });
  it("Kanäle: Sechsecke untereinander in der Gasse unter der Karte, an einer eigenen Linie, Einheiten darunter", () => {
    const m = mass({ einheiten: einheiten(2) }, { kanaele: [DMO, TMO], anzahlGruppen: 1 });
    expect(m.kanalSechsecke.map((h) => h.verbindung.id)).toEqual(["dmo-608", "r-ue-2"]);
    expect(m.kanalSechsecke[0].y).toBeCloseTo(m.hoehe + EINHEIT.abstandOben, 9);
    expect(m.kanalSechsecke[1].y - m.kanalSechsecke[0].y).toBeCloseTo(KANAL.takt, 9);
    // Stiel-Gasse (eine Gruppe) links, die Kanallinie rechts daneben, die Sechsecke rechts davon
    const kanalX = STIEL.gasseStart + STIEL.gasseTakt;
    expect(m.gasse).toEqual([STIEL.gasseStart]);
    expect(m.kanalLinien[0]).toEqual({ x1: kanalX, y1: m.hoehe, x2: kanalX, y2: m.kanalSechsecke[1].y + SECHSECK.hoehe / 2 });
    for (const [i, h] of m.kanalSechsecke.entries()) {
      expect(m.kanalLinien[i + 1]).toEqual({ x1: kanalX, y1: h.y + SECHSECK.hoehe / 2, x2: h.x, y2: h.y + SECHSECK.hoehe / 2 });
      expect(h.x).toBeGreaterThan(kanalX);
    }
    expect(m.einheiten[0].y).toBeCloseTo(m.kanalSechsecke[1].y + SECHSECK.hoehe + EINHEIT.abstandOben, 9);
    expect(m.blockBreite).toBeGreaterThanOrEqual(Math.max(...m.kanalSechsecke.map((h) => h.x + h.mass.breite)));
    expect(m.blockHoehe).toBeGreaterThan(m.einheiten[1].y);
  });
  it("Kanäle ohne Einheiten und ohne Kinder: die Gasse beginnt bei 1,5 mm", () => {
    const m = mass({}, { kanaele: [TMO] });
    expect(m.gasse).toEqual([]);
    expect(m.kanalLinien[0].x1).toBe(STIEL.gasseStart);
    expect(m.blockHoehe).toBeCloseTo(m.hoehe + EINHEIT.abstandOben + SECHSECK.hoehe, 9);
  });
  it("Anker zeigt nur den Kopf; Verweis zeigt „→ Blatt n\"", () => {
    const anker = mass({ einheiten: einheiten(3), kontakte: [{ art: "telefon", wert: "1" }] }, { darstellung: "anker" });
    expect(anker.art).toBe("anker");
    expect(anker.kontakte).toEqual([]);
    expect(anker.einheiten).toEqual([]);
    expect(mass({}, { darstellung: "anker", kanaele: [TMO] }).kanalSechsecke).toEqual([]);
    const verweis = mass({}, { darstellung: { verweisAufBlatt: 3 } });
    expect(verweis.verweis?.text).toBe("→ Blatt 3");
  });
  it("eingeklappt: Abzeichen unter dem Block", () => {
    const m = mass({}, { versteckt: 5 });
    expect(m.abzeichen?.text.text).toBe("+5 Stellen");
    expect(m.blockHoehe).toBeGreaterThan(m.hoehe);
    expect(mass({}, { versteckt: 1 }).abzeichen?.text.text).toBe("+1 Stelle");
  });
});
