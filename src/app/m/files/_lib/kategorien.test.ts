import { describe, expect, it } from "vitest";
import {
  KATEGORIE_LEER_ANZEIGE,
  SCHREIBBARE_KATEGORIEN,
  anzeigeKategorie,
  istSchreibbareKategorie,
} from "./kategorien";

/*
 * Zwei Aussagen, bewusst asymmetrisch (Spec §8.3): beim SCHREIBEN gilt die
 * feste Liste, beim ANZEIGEN gilt Toleranz. Wer eine der beiden Haelften auf
 * die andere ausdehnt, bricht genau eine Zusage:
 *  - Toleranz auch beim Schreiben  → das Formular kann Werte anlegen, die die
 *    Filter des Posteingangs nicht kennen,
 *  - Strenge auch beim Anzeigen    → importierte Altwerte (`berichte`,
 *    `__none__`) verschwinden aus der Liste, statt sichtbar zu sein.
 */

describe("SCHREIBBARE_KATEGORIEN: die 1:1-Vorlage aus drop", () => {
  it("traegt genau die drei Werte samt Beschriftung, in dieser Reihenfolge", () => {
    // Wortgenau `drop/src/app.js:22-35` (UPLOAD_CATEGORIES), das dieselben
    // drei Paare ueber `/api/upload/context` veroeffentlichte.
    expect(SCHREIBBARE_KATEGORIEN).toEqual([
      { wert: "bilder", beschriftung: "Bilder" },
      { wert: "dokumente", beschriftung: "Dokumente" },
      { wert: "sonstiges", beschriftung: "Sonstiges" },
    ]);
  });

  it("jeder gelistete Wert ist auch schreibbar — Liste und Praedikat sind eine Quelle", () => {
    for (const { wert } of SCHREIBBARE_KATEGORIEN) {
      expect(istSchreibbareKategorie(wert)).toBe(true);
    }
  });

  it("die Werte bleiben im Zeichenraum der Alt-Verzeichnisnamen", () => {
    // `sanitizeCategory` (drop/src/utils.js:20-29) lieferte kleingeschriebene
    // `[a-z0-9_-]`, hoechstens 40 Zeichen — und der Wert war gleichzeitig ein
    // Verzeichnisname. Ein Wert ausserhalb dieses Raums waere im Altbestand
    // nicht auffindbar.
    for (const { wert } of SCHREIBBARE_KATEGORIEN) {
      expect(wert).toMatch(/^[a-z][a-z0-9_-]{0,39}$/);
    }
  });
});

describe("istSchreibbareKategorie: exakter Vergleich, keine Normalisierung", () => {
  it("akzeptiert die drei Werte", () => {
    expect(istSchreibbareKategorie("bilder")).toBe(true);
    expect(istSchreibbareKategorie("dokumente")).toBe(true);
    expect(istSchreibbareKategorie("sonstiges")).toBe(true);
  });

  it("lehnt den Alt-Sentinel `__none__` ab", () => {
    // Er ueberlebte die Alt-Saeuberung unveraendert und konnte so ein
    // Verzeichnis `__none__` erzeugen. Hier hat er keine Wirkung mehr: kein
    // Sonderfall, sondern schlicht kein schreibbarer Wert.
    expect(istSchreibbareKategorie("__none__")).toBe(false);
  });

  it("lehnt Freitext und den Leerstring ab", () => {
    expect(istSchreibbareKategorie("Freitext")).toBe(false);
    expect(istSchreibbareKategorie("berichte")).toBe(false);
    expect(istSchreibbareKategorie("")).toBe(false);
  });

  /*
   * DIESE DREI FAELLE TRAGEN DIE AUSSAGE "exakt".
   * Ohne sie bleibt die Suite gruen, wenn die Implementierung vor dem
   * Nachschlagen `.trim().toLowerCase()` anwendet — denn "Freitext" ist auch
   * kleingeschrieben kein gelisteter Wert. Genau diese Nachsicht waere der
   * Fehler: sie schreibt einen Wert in die Spalte, den die Person im Formular
   * nicht gewaehlt hat, und macht die Herkunft eines DB-Wertes unklar.
   */
  it("lehnt eine andere Schreibweise desselben Wortes ab", () => {
    expect(istSchreibbareKategorie("Bilder")).toBe(false);
    expect(istSchreibbareKategorie("BILDER")).toBe(false);
  });

  it("lehnt umgebende Leerzeichen ab", () => {
    expect(istSchreibbareKategorie(" bilder")).toBe(false);
    expect(istSchreibbareKategorie("bilder ")).toBe(false);
  });

  it("lehnt `null` und `undefined` ab — 'keine Kategorie' ist Sache des Aufrufers", () => {
    // Die Spalte `inbox_files.kategorie` ist nullable (Spec §4.6). Der Weg zu
    // NULL fuehrt aber nicht durch dieses Praedikat: es antwortet nur die
    // Frage "darf dieser Wert in die Spalte", und `null` ist kein Wert.
    expect(istSchreibbareKategorie(null)).toBe(false);
    expect(istSchreibbareKategorie(undefined)).toBe(false);
  });

  it("lehnt Nicht-Zeichenketten ab, ohne zu werfen", () => {
    // Der Wert kommt aus einem FormData-Feld; dort ist auch ein `File` oder
    // ein Array moeglich, und ein Wurf waere an dieser Stelle ein 500 statt
    // einer Feldmeldung.
    expect(istSchreibbareKategorie(42)).toBe(false);
    expect(istSchreibbareKategorie(["bilder"])).toBe(false);
    expect(istSchreibbareKategorie({ wert: "bilder" })).toBe(false);
  });

  it("die Anzeige des Leerwerts ist selbst nicht schreibbar", () => {
    // Sonst waere eine Zeile "Ohne Kategorie" nicht mehr davon zu
    // unterscheiden, ob sie leer ist oder so heisst.
    expect(istSchreibbareKategorie(KATEGORIE_LEER_ANZEIGE)).toBe(false);
  });
});

describe("anzeigeKategorie: Toleranz, roher Durchlass", () => {
  it("gibt einen unbekannten Wert roh zurueck, statt ihn zu verwerfen", () => {
    expect(anzeigeKategorie("unbekannt-aus-import")).toBe("unbekannt-aus-import");
    // `berichte` ist der Wert aus dem Alt-Test (drop test/app.test.js:318-336) —
    // er existiert real und ist in keiner Liste.
    expect(anzeigeKategorie("berichte")).toBe("berichte");
    expect(anzeigeKategorie("__none__")).toBe("__none__");
  });

  it("gibt auch einen bekannten Wert roh zurueck — keine Beschriftung eingemischt", () => {
    /*
     * Beschriftungen gehoeren ins Formular (SCHREIBBARE_KATEGORIEN), nicht in
     * die Anzeige einer Datenspalte: sonst stuende in derselben Spalte des
     * Posteingangs "Bilder" neben "berichte", und die Ungleichheit waere eine
     * Eigenschaft der Anzeigefunktion, nicht der Daten.
     */
    expect(anzeigeKategorie("bilder")).toBe("bilder");
    expect(anzeigeKategorie("sonstiges")).toBe("sonstiges");
  });

  it("gibt fuer `null` und `undefined` den benannten Leerwert", () => {
    expect(anzeigeKategorie(null)).toBe(KATEGORIE_LEER_ANZEIGE);
    expect(anzeigeKategorie(undefined)).toBe(KATEGORIE_LEER_ANZEIGE);
  });

  it("behandelt Leerstring und reine Leerzeichen wie `null`", () => {
    // Ein leerer TEXT-Wert traegt keine Information; er als leere Zelle
    // anzuzeigen waere eine unbenannte zweite Darstellung von "keine".
    expect(anzeigeKategorie("")).toBe(KATEGORIE_LEER_ANZEIGE);
    expect(anzeigeKategorie("   ")).toBe(KATEGORIE_LEER_ANZEIGE);
  });

  it("gibt niemals eine leere Zeichenkette — jede Zelle bleibt lesbar", () => {
    for (const roh of [null, undefined, "", "  ", "bilder", "berichte"]) {
      expect(anzeigeKategorie(roh).length).toBeGreaterThan(0);
    }
  });
});
