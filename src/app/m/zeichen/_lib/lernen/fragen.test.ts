import { describe, expect, it } from "vitest";
import { alleZeichen } from "../katalog";
import { baueFrage, FRAGETYPEN, fragbareZeichen } from "./fragen";

const BESTAND = fragbareZeichen();
const ZIEL = BESTAND.find((z) => z.id === "rezept:C.1.1")!;

describe("fragbareZeichen", () => {
  /*
   * 232, NICHT 246. Ausgeschlossen sind die 14 Grundzeichen — ihre `bedeutung` ist die
   * Titelwiederholung plus eine Aktenzeichennummer, eine Frage danach fragt nichts.
   * Sie stehen im Katalog, sind merkbar und im Baukasten waehlbar; nur nicht fragbar.
   */
  it("fuehrt die 232 Hauptrezepte, ohne die 14 Grundzeichen", () => {
    expect(alleZeichen().length).toBe(246);
    expect(BESTAND.length).toBe(232);
    expect(BESTAND.filter((z) => z.id.startsWith("grund:"))).toEqual([]);
  });

  it("schraenkt auf eine ID-Liste ein", () => {
    const zwei = ["rezept:C.1.1", "rezept:E.1.1"];
    expect(fragbareZeichen(zwei).map((z) => z.id).sort()).toEqual(zwei);
  });
});

describe("baueFrage", () => {
  it("kennt genau zwei Fragetypen", () => {
    expect(FRAGETYPEN).toEqual(["zeichen_bedeutung", "bedeutung_zeichen"]);
  });

  it("stellt vier Optionen, darunter die richtige", () => {
    const f = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 1);
    expect(f.optionen.length).toBe(4);
    expect(f.optionen.filter((o) => o.id === ZIEL.id).length).toBe(1);
  });

  /*
   * ZWEI VERSCHIEDENE FRAGEN, NICHT EINE. Mit einer einzigen Frage bewiese dieser Fall
   * nichts: eine fest verdrahtete Optionsliste waere von einer gezogenen nicht zu
   * unterscheiden. Dieselbe Regel steht ausgeschrieben in
   * `aufgaben/_ui/RoutinenTabelle.test.tsx:7-15`.
   */
  it("gibt zwei verschiedenen Zielen verschiedene Distraktoren", () => {
    const a = baueFrage(BESTAND[0], "zeichen_bedeutung", BESTAND, 11);
    const b = baueFrage(BESTAND[100], "zeichen_bedeutung", BESTAND, 11);
    expect(a.optionen.map((o) => o.id)).not.toEqual(b.optionen.map((o) => o.id));
  });

  it("gibt keinem Distraktor denselben Antworttext wie dem Ziel", () => {
    for (const z of [BESTAND[0], BESTAND[50], BESTAND[150]]) {
      const f = baueFrage(z, "zeichen_bedeutung", BESTAND, 3);
      const gleich = f.optionen.filter((o) => o.antwort === z.antwort);
      expect(gleich.length, z.id).toBe(1);
    }
  });

  it("nimmt bei bedeutung_zeichen kein Zeichen mit mehrdeutigem Titel als Ziel", () => {
    const mehrdeutig = BESTAND.filter((z) => z.mehrdeutigerTitel);
    expect(mehrdeutig.length).toBeGreaterThan(0);
    for (const z of mehrdeutig) {
      expect(() => baueFrage(z, "bedeutung_zeichen", BESTAND, 1)).toThrow();
    }
  });

  it("liefert bei bedeutung_zeichen zu jeder Option ein SVG", () => {
    const f = baueFrage(ZIEL, "bedeutung_zeichen", BESTAND, 5);
    expect(f.stamm).toBe(ZIEL.bedeutung);
    for (const o of f.optionen) expect(o.svg).toContain("<svg");
  });

  it("ergibt zum selben Seed dieselben Optionen", () => {
    const a = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 42);
    const b = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 42);
    expect(a.optionen.map((o) => o.id)).toEqual(b.optionen.map((o) => o.id));
  });

  /*
   * GLEICHVERTEILUNG UEBER 200 ZIEHUNGEN. Ohne diesen Fall stuende die richtige Antwort
   * womoeglich immer an derselben Stelle — und niemand faende es, weil jede einzelne
   * Frage richtig aussieht.
   */
  it("stellt die richtige Antwort gleichverteilt an alle vier Plaetze", () => {
    const plaetze = [0, 0, 0, 0];
    for (let i = 0; i < 200; i += 1) {
      const f = baueFrage(BESTAND[i % BESTAND.length], "zeichen_bedeutung", BESTAND, i);
      plaetze[f.optionen.findIndex((o) => o.id === f.zeichenId)] += 1;
    }
    for (const p of plaetze) expect(p).toBeGreaterThan(20);
  });

  /*
   * EIN LERNSET SCHRAENKT DEN BESTAND EIN, NICHT DIE DISTRAKTOREN. Kaemen die falschen
   * Antworten aus dem Set, verriete ein Set mit 15 Zeichen bei der vierten Frage die
   * Loesung — man muesste die Zeichen nicht kennen, nur das Set.
   */
  it("zieht Distraktoren aus dem ganzen Katalog, auch bei kleinem Set", () => {
    const set = ["rezept:C.1.1", "rezept:E.1.1"];
    const f = baueFrage(ZIEL, "zeichen_bedeutung", BESTAND, 9);
    expect(f.optionen.filter((o) => !set.includes(o.id)).length).toBeGreaterThan(0);
  });
});
