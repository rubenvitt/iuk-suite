import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { baue, type StelleEingabe } from "../beispiele/bau";
import { leererPlan } from "../plan/operationen";
import { layout } from "./layout";
import { BLATT, MIN_MASSSTAB, PAPIER, QR_BOX } from "./masse";
import { AUFTEILUNG, budgetsFuer, kopflinieY, LEGENDE, legendeObenY, legendenBreite, legendenZeilen, massstabFuer, qrBox, teileAuf, zeichenflaeche } from "./papier";
import { pruefeQrAbstand } from "./pruefung";
import { textBreite } from "./text";
import { zufallsPlan } from "./zufall";

function grosserPlan() {
  const stellen: StelleEingabe[] = [{ id: "w", titel: "Stab" }];
  for (let i = 0; i < 5; i++) {
    stellen.push({ id: `a${i}`, titel: `EAL ${i}`, eltern: "w", verbindung: "v" });
    for (let j = 0; j < 8; j++) stellen.push({ id: `a${i}-${j}`, titel: `EA ${i}.${j}`, eltern: `a${i}`, einheiten: ["RTW 1", "RTW 2", "KTW 3", "KTW 4", "MTW 5"] });
  }
  return baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
}
const normaleKarten = (blaetter: ReturnType<typeof teileAuf>) =>
  blaetter.flatMap((b) => b.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));

describe("Papier", () => {
  it("Zeichenfläche A4 quer: Ränder, Kopf, Fuß, Legende", () => {
    expect(zeichenflaeche("a4-quer", 0)).toEqual({ x: 10, y: 24, breite: 277, hoehe: 210 - 24 - 8 - 7 });
    expect(zeichenflaeche("a4-quer", 2).hoehe).toBeCloseTo(210 - 24 - 8 - 7 - (2 * BLATT.legendeZeile + BLATT.luft), 9);
  });
  it("die Zeichnung hält 3 mm Luft zur Kopflinie und zur Legende (früher 1 und 2 mm)", () => {
    for (const zeilen of [0, 1, 3]) {
      const f = zeichenflaeche("a4-quer", zeilen);
      expect(f.y - kopflinieY()).toBeGreaterThanOrEqual(3);
      if (zeilen > 0) expect(legendeObenY("a4-quer", zeilen) - (f.y + f.hoehe)).toBeGreaterThanOrEqual(3);
      if (zeilen > 0) expect(legendeObenY("a4-quer", zeilen) + zeilen * BLATT.legendeZeile).toBeLessThanOrEqual(PAPIER["a4-quer"].hoehe - BLATT.randUnten - BLATT.fuss + 1e-9);
    }
  });
  it("Legende bricht in Zeilen um", () => {
    const viele = Array.from({ length: 30 }, (_, i) => ({ art: "tmo" as const, text: `Reserve K_UE_${i}`, reserve: true }));
    expect(legendenZeilen(viele, 277).length).toBeGreaterThan(1);
    expect(legendenZeilen([], 277)).toEqual([]);
  });
  it("Maßstab: nie größer als 1, leer = 1", () => {
    expect(massstabFuer({ breite: 0, hoehe: 0 } as never, { breite: 277, hoehe: 150 })).toBe(1);
    expect(massstabFuer({ breite: 100, hoehe: 50 } as never, { breite: 277, hoehe: 150 })).toBe(1);
    expect(massstabFuer({ breite: 554, hoehe: 50 } as never, { breite: 277, hoehe: 150 })).toBe(0.5);
  });
  it("leerer Plan: genau ein Blatt", () => {
    const b = teileAuf(leererPlan(), "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ nummer: 1, von: 1, massstab: 1, unterMindestschrift: false });
  });
  it("ein kleiner Plan passt auf ein Blatt, waagerecht mittig", () => {
    const b = teileAuf(baue({ stellen: [{ id: "a", titel: "A" }, { id: "b", titel: "B", eltern: "a" }] }), "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].ursprung.x + (b[0].zeichnung.breite * b[0].massstab) / 2).toBeCloseTo(PAPIER["a4-quer"].breite / 2, 6);
  });
  it("ein zu großer Plan teilt gierig auf: Verweiskarten, Anker, jede Stelle genau einmal", () => {
    const inhalt = grosserPlan();
    const b = teileAuf(inhalt, "a4-quer");
    expect(b.map((x) => x.nummer)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const blatt of b) {
      expect(blatt.von).toBe(6);
      expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    }
    const verweise = b[0].zeichnung.karten.filter((k) => k.art === "verweis");
    expect(verweise.map((k) => k.verweis?.text)).toEqual(["→ Blatt 2", "→ Blatt 3", "→ Blatt 4", "→ Blatt 5", "→ Blatt 6"]);
    expect(b[1].zeichnung.karten.find((k) => k.id === "w")?.art).toBe("anker");
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
    expect(teileAuf(inhalt, "a4-quer")).toEqual(b);
  });
  it("unteilbar: ein Blatt unter Mindestschrift, kein Endlosversuch", () => {
    const sechzig = Array.from({ length: 60 }, (_, i) => `RTW ${i}`);
    const inhalt = baue({ stellen: [
      { id: "w", titel: "W", einheiten: sechzig },
      ...[1, 2, 3].map((i) => ({ id: `l${i}`, titel: `L${i}`, eltern: "w", lage: "links" as const, einheiten: sechzig })),
    ] });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].unterMindestschrift).toBe(true);
  });
  it("Blatt 1 behält die oberen Ebenen: LtS → EL → fünf EAL → je acht EA", () => {
    const stellen: StelleEingabe[] = [{ id: "lts", titel: "Leitstelle" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "v" }];
    for (let a = 0; a < 5; a++) {
      stellen.push({ id: `eal-${a}`, titel: `EAL ${a}`, eltern: "el", verbindung: "v" });
      for (let e = 0; e < 8; e++) stellen.push({ id: `ea-${a}-${e}`, titel: `EA ${a}.${e}`, eltern: `eal-${a}`, einheiten: ["RTW 1", "KTW 2", "MTW 3"] });
    }
    const b = teileAuf(baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen }), "a4-quer");
    const erstes = b[0].zeichnung.karten;
    expect(erstes.find((k) => k.id === "el")?.art).toBe("normal"); // früher: EL als Verweis, Blatt 1 fast leer
    for (let a = 0; a < 5; a++) expect(erstes.some((k) => k.id === `eal-${a}`), `eal-${a} auf Blatt 1`).toBe(true);
    expect(erstes.some((k) => k.art === "verweis")).toBe(true);
    for (const blatt of b) expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
  });
  it("Verweisnummern steigen von links nach rechts, auch bei ungleich großen Teilbäumen", () => {
    const stellen: StelleEingabe[] = [{ id: "w", titel: "W" }];
    [2, 11, 5, 8].forEach((n, i) => {
      stellen.push({ id: `c${i}`, titel: `C${i}`, eltern: "w", verbindung: "v" });
      for (let e = 0; e < n; e++) stellen.push({ id: `c${i}-${e}`, titel: `EA ${e}`, eltern: `c${i}`, einheiten: ["RTW 1", "KTW 2", "MTW 3", "ELW 4"] });
    });
    const b = teileAuf(baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen }), "a4-quer");
    const verweise = b[0].zeichnung.karten.filter((k) => k.art === "verweis").sort((p, q) => p.x - q.x);
    expect(verweise.length).toBeGreaterThanOrEqual(2);
    expect(new Set(verweise.map((k) => k.y)).size).toBe(1);
    const nummern = verweise.map((k) => Number(k.verweis!.text.replace("→ Blatt ", "")));
    expect(nummern).toEqual([...nummern].sort((p, q) => p - q));
    verweise.forEach((k, i) => expect(b[nummern[i] - 1].wurzelId).toBe(k.id));
  });
  it("neun Wurzeln ohne Kinder: die Wurzelreihe bricht um, ein Blatt ohne Verweise", () => {
    const inhalt = baue({ stellen: Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, titel: `W ${i}` })) });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    expect(b[0].zeichnung.karten.every((k) => k.art === "normal")).toBe(true);
  });
  it.each([7, 8])("%i Wurzeln mit je zwei Kindern: kein Blatt unter 6 pt, keines nur aus Verweisen oder mit einer Karte", (n) => {
    const stellen: StelleEingabe[] = [];
    for (let i = 0; i < n; i++) {
      stellen.push({ id: `w${i}`, titel: `W ${i}` });
      for (let j = 0; j < 2; j++) stellen.push({ id: `w${i}-${j}`, titel: `K ${j}`, eltern: `w${i}`, verbindung: "v" });
    }
    const inhalt = baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
    const b = teileAuf(inhalt, "a4-quer");
    for (const blatt of b) {
      expect(blatt.unterMindestschrift, `Blatt ${blatt.nummer}`).toBe(false);
      expect(blatt.zeichnung.karten.length, `Blatt ${blatt.nummer}`).toBeGreaterThan(1);
      expect(blatt.zeichnung.karten.some((k) => k.art === "normal"), `Blatt ${blatt.nummer}`).toBe(true);
    }
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
  });
  it("mehrere Wurzeln, die auch umgebrochen nicht auf ein Blatt passen: eine Wurzel bekommt ein eigenes Blatt ohne Anker", () => {
    const acht = Array.from({ length: 8 }, (_, i) => `RTW ${i}`);
    const stellen: StelleEingabe[] = ["a", "b", "c", "d"].flatMap((w) => [
      { id: w, titel: w.toUpperCase() },
      ...Array.from({ length: 7 }, (_, i) => ({ id: `${w}${i}`, titel: `K${i}`, eltern: w, verbindung: "v", einheiten: acht })),
    ]);
    const inhalt = baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b.length).toBeGreaterThanOrEqual(2);
    for (const blatt of b) expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    expect(b.some((blatt) => blatt.wurzelId !== null && blatt.ankerId === null)).toBe(true);
    expect(b[0].zeichnung.karten.some((k) => k.art === "normal")).toBe(true);
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
  });
  it("Zufallspläne mit mehreren Wurzeln: jedes Blatt trägt mehr als eine Karte, Blatt 1 nicht nur Verweise", () => {
    // Aus den Seeds 41–160 des Reviews; 47 und 57 waren rot (57: 37 Blätter, fünf mit einer Karte).
    for (const seed of [41, 47, 57, 63, 77, 91, 105, 119, 133, 147, 160]) {
      const inhalt = zufallsPlan(seed, { stellen: 30 + (seed % 81), mehrereWurzeln: true });
      const b = teileAuf(inhalt, "a4-quer");
      if (b.length === 1) continue;
      for (const blatt of b) expect(blatt.zeichnung.karten.length, `Seed ${seed}, Blatt ${blatt.nummer}`).toBeGreaterThan(1);
      expect(b[0].zeichnung.karten.some((k) => k.art === "normal"), `Seed ${seed}`).toBe(true);
    }
  }, 120_000);
  it("breite Kinderreihen passen durch den Kamm auf EIN Blatt (drei Verbindungen à fünf; sechs breite Kinder und eines mit zwei Seitenstellen)", () => {
    const V = [{ id: "v", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "w2", art: "tmo" as const, bezeichnung: "R_UE_3" },
      { id: "x", art: "tmo" as const, bezeichnung: "R_UE_4" }, { id: "d", art: "draht" as const, bezeichnung: "Standleitung" }];
    const blatt = (n: number, v: string, rest: object = {}) =>
      Array.from({ length: n }, (_, i) => ({ id: `${v}-${i}`, titel: `EA ${i}`, eltern: "w", verbindung: v, ...rest }));
    const drei = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...blatt(5, "v"), ...blatt(5, "w2"), ...blatt(5, "x")] });
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const breit = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W" }, ...blatt(6, "v", { einheiten: zwoelf }),
      { id: "breit", titel: "Breit", eltern: "w", verbindung: "v" },
      { id: "bl", titel: "L", eltern: "breit", lage: "links", verbindung: "d" },
      { id: "br", titel: "R", eltern: "breit", lage: "rechts", verbindung: "d" },
    ] });
    for (const inhalt of [drei, breit]) {
      const b = teileAuf(inhalt, "a4-quer");
      expect(b).toHaveLength(1);
      expect(b[0].massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    }
  });
  it("layout(): Bildschirm ohne Seiten, Papier mit", () => {
    const inhalt = grosserPlan();
    expect(layout(inhalt, "bildschirm").seiten).toEqual([]);
    expect(layout(inhalt, "a4-quer").seiten).toHaveLength(6);
  });
});

describe("Platz für den QR (Phase 5, Entscheidung 11)", () => {
  const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!.inhalt;
  it("ohne QR alles wie bisher — bytegleich", () => {
    expect(teileAuf(gross, "a4-quer", { qr: false })).toEqual(teileAuf(gross, "a4-quer"));
    expect(zeichenflaeche("a4-quer", 2, false)).toEqual(zeichenflaeche("a4-quer", 2));
  });
  it("QR-Box unten rechts über dem Fuß; die Zeichenfläche endet über ihrer Beschriftung, die Legende ist schmaler", () => {
    for (const format of ["a4-quer", "a3-quer"] as const) {
      const b = qrBox(format);
      const p = PAPIER[format];
      expect(b.x + b.kante).toBeCloseTo(p.breite - BLATT.randX, 9);
      expect(b.y + b.kante).toBeCloseTo(p.hoehe - BLATT.randUnten - BLATT.fuss, 9);
      expect(b.oben).toBeCloseTo(b.y - QR_BOX.beschriftung, 9);
      const f = zeichenflaeche(format, 1, true);
      expect(f.y + f.hoehe).toBeLessThanOrEqual(b.oben - BLATT.luft + 1e-9);
      expect(legendenBreite(format, true)).toBeCloseTo(legendenBreite(format) - QR_BOX.kante - QR_BOX.luft, 9);
    }
  });
  it("mit QR nur die Ecke gesperrt, kein Streifen über die Breite (Abnahme): Einsatz bleibt auf einem Blatt, die Stabslage über 6 pt", () => {
    const einsatz = BEISPIELE.find((b) => b.id === "beispiel-einsatz-2026-02-22")!.inhalt;
    const ohne = teileAuf(einsatz, "a4-quer");
    const mit = teileAuf(einsatz, "a4-quer", { qr: true });
    expect(mit.map((b) => b.massstab)).toEqual(ohne.map((b) => b.massstab));
    expect(mit).toHaveLength(1);
    for (const b of teileAuf(gross, "a4-quer", { qr: true })) expect(b.unterMindestschrift, `Blatt ${b.nummer}`).toBe(false);
  });
  it("mit QR: keine Zeichnung reicht in die QR-Box, keine Legendenzeile ist breiter als erlaubt", () => {
    for (const format of ["a4-quer", "a3-quer"] as const) {
      for (const b of teileAuf(gross, format, { qr: true })) {
        expect(pruefeQrAbstand(b, format).map((x) => x.text)).toEqual([]);
        for (const zeile of b.legendeZeilen) {
          const breite = zeile.reduce((s, e) => s + LEGENDE.symbolBreite + LEGENDE.symbolLuft + textBreite(e.text, LEGENDE.schrift, false) + LEGENDE.eintragLuft, 0) - LEGENDE.eintragLuft;
          expect(breite).toBeLessThanOrEqual(legendenBreite(format, true) + 1e-6);
        }
      }
    }
  });
});

describe("Aufwandsgrenze der Aufteilung (Abnahme: Token-Druck blockiert den Prozess)", () => {
  /** 500 Stellen in drei Ebenen unter einer Wurzel, 81 Blätter auf A4 — das Größte, was das Schema in der Breite zulässt. */
  function breiterPlan() {
    const stellen: StelleEingabe[] = [{ id: "w", titel: "Stab" }];
    for (let i = 0; i < 10; i++) {
      stellen.push({ id: `a${i}`, titel: `Abschnitt ${i}`, eltern: "w", verbindung: "v" });
      for (let j = 0; j < 7; j++) stellen.push({ id: `a${i}b${j}`, titel: `Unterabschnitt ${i}.${j}`, eltern: `a${i}`, verbindung: "v" });
    }
    for (let k = 0; stellen.length < 500; k++) stellen.push({ id: `c${k}`, titel: `Einsatzstelle ${k}`, eltern: `a${k % 10}b${k % 7}`, verbindung: "v", kontakte: { telefon: "0581 123456" } });
    return baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
  }
  it("die Beispielpläne bleiben weit unter dem Budget und teilen auf wie ohne Grenze", () => {
    for (const b of BEISPIELE) for (const format of ["a4-quer", "a3-quer"] as const) {
      const aufwand = { karten: 0 };
      expect(teileAuf(b.inhalt, format, { aufwand })).toEqual(teileAuf(b.inhalt, format, { budget: Infinity }));
      expect(aufwand.karten).toBeLessThan(AUFTEILUNG.kartenProben / 50);
    }
  });
  it("ein Plan mit 500 Stellen zeichnet in allen Proben zusammen höchstens das Budget und eine Probe darüber", () => {
    const inhalt = breiterPlan();
    const aufwand = { karten: 0 };
    for (const format of ["a4-quer", "a3-quer"] as const) {
      aufwand.karten = 0;
      const blaetter = teileAuf(inhalt, format, { qr: true, aufwand });
      expect(aufwand.karten).toBeGreaterThan(0);
      expect(aufwand.karten).toBeLessThanOrEqual(AUFTEILUNG.kartenProben * budgetsFuer(format).length + 2 * inhalt.stellen.length);
      expect(blaetter.length, `${format}: das Budget reicht für diesen Plan noch`).toBeGreaterThan(50);
    }
  });
  it("ist das Budget aufgebraucht, bleibt der Rest ungeteilt — jede Stelle genau einmal, gleicher Inhalt gleiche Blätter", () => {
    const inhalt = breiterPlan();
    const aufwand = { karten: 0 };
    const knapp = teileAuf(inhalt, "a4-quer", { budget: 2_000, aufwand });
    expect(aufwand.karten).toBeLessThanOrEqual(2_000 + inhalt.stellen.length);
    expect(knapp.length).toBeLessThan(teileAuf(inhalt, "a4-quer").length);
    expect(knapp.some((b) => b.unterMindestschrift)).toBe(true);
    expect(normaleKarten(knapp).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
    expect(teileAuf(inhalt, "a4-quer", { budget: 2_000 })).toEqual(knapp);
  });
});

describe("A3 nie kleiner als A4 (Abnahme: A3 druckte kleiner und ließ den Bogen halb leer)", () => {
  it("A3 probiert auch das Kamm-Budget von A4; A4 bleibt bei seinem", () => {
    expect(budgetsFuer("a4-quer")).toHaveLength(1);
    expect(budgetsFuer("a3-quer")).toEqual([expect.any(Number), budgetsFuer("a4-quer")[0]]);
    expect(budgetsFuer("a3-quer")[0]).toBeGreaterThan(budgetsFuer("a4-quer")[0]);
  });
  it("je Beispielplan: der kleinste Maßstab auf A3 ist mindestens der auf A4, mit und ohne QR", () => {
    for (const b of BEISPIELE) for (const qr of [false, true]) {
      const min = (format: "a4-quer" | "a3-quer") => Math.min(...teileAuf(b.inhalt, format, { qr }).map((x) => x.massstab));
      expect(min("a3-quer"), `${b.id}${qr ? " mit QR" : ""}`).toBeGreaterThanOrEqual(min("a4-quer") - 1e-9);
    }
  });
  it("die Stabslage, Blatt 3 (EAL mit zehn EA): auf A3 nicht mehr einreihig auf Mindestschrift", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!.inhalt;
    const blatt = (format: "a4-quer" | "a3-quer") => teileAuf(gross, format).find((x) => x.nummer === 3)!;
    expect(blatt("a3-quer").massstab).toBeGreaterThan(blatt("a4-quer").massstab);
  });
});
