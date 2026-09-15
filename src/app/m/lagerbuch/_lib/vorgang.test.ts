import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUSSONDERN_PRAEFIX,
  INVENTUR_PRAEFIX,
  VORGANG_ARTEN,
  istPraefixArt,
  praefixVon,
  vorgangAus,
  vorgangLabel,
  vorgangText,
} from "./vorgang";

describe("vorgangAus — das Praefix schlaegt den Typ", () => {
  it("ordnet die vier Buchungstypen ohne Referenz sich selbst zu", () => {
    for (const typ of ["zugang", "entnahme", "korrektur", "umlagerung"]) {
      expect(vorgangAus({ typ, referenz: null })).toBe(typ);
    }
  });

  it("erkennt `aussondern:` und `inventur:` am Praefix, nicht am ganzen Wert", () => {
    // Hinter dem Doppelpunkt steht eine Lagerort- bzw. Inventurkennung, die
    // hier niemanden interessiert — verglichen wird der Anfang.
    expect(vorgangAus({ typ: "korrektur", referenz: "aussondern:handlager" })).toBe("aussondern");
    expect(vorgangAus({ typ: "korrektur", referenz: "aussondern:fz-7" })).toBe("aussondern");
    expect(vorgangAus({ typ: "korrektur", referenz: "inventur:iv-42" })).toBe("inventur");
  });

  it("laesst `check:` und `entnahme-ziel:` beim Buchungstyp", () => {
    /**
     * Die Entscheidungstabelle steht im Kopf von `vorgang.ts`. Kurz: der
     * Kommentar einer Check-Buchung ist im Quelltext festgenagelt und nennt den
     * Vorgang bereits („Fahrzeug-Check Abgleich"), und `entnahme-ziel:` nennt
     * das ZIEL einer Umlagerung, nicht eine andere Art von Vorgang.
     *
     * Der Test haelt die Entscheidung fest, damit ein spaeterer Griff sie nicht
     * beilaeufig umkehrt — sie wieder aufzumachen ist erlaubt, sie zu vergessen
     * nicht.
     */
    expect(vorgangAus({ typ: "korrektur", referenz: "check:c-1" })).toBe("korrektur");
    expect(vorgangAus({ typ: "umlagerung", referenz: "check:c-1" })).toBe("umlagerung");
    expect(vorgangAus({ typ: "umlagerung", referenz: "entnahme-ziel:fz-1" })).toBe("umlagerung");
  });

  it("ein unbekanntes Praefix aendert nichts", () => {
    expect(vorgangAus({ typ: "korrektur", referenz: "irgendwas:1" })).toBe("korrektur");
  });

  it("reicht einen unbekannten Typ ROH durch statt ihn zu verschlucken", () => {
    // Ein historischer Wert soll lesbar bleiben, nicht verschwinden — deshalb
    // ist der Rueckgabetyp `string` und nicht `Vorgangsart`.
    expect(vorgangAus({ typ: "was-neues", referenz: null })).toBe("was-neues");
    expect(vorgangText({ typ: "was-neues", referenz: null })).toBe("was-neues");
  });

  it("das Praefix allein entscheidet — auch unter einem anderen Typ", () => {
    // DRK-303 bucht am Fahrzeug ueber FEFO; ob dabei `korrektur` oder etwas
    // anderes entsteht, darf die Einordnung nicht kippen.
    expect(vorgangAus({ typ: "umlagerung", referenz: "aussondern:fz-1" })).toBe("aussondern");
  });
});

describe("vorgangLabel — deutsche Beschriftung", () => {
  it("beschriftet alle sechs Arten", () => {
    expect(VORGANG_ARTEN.map(vorgangLabel)).toEqual([
      "Wareneingang",
      "Entnahme",
      "Korrektur",
      "Umlagerung",
      "Aussonderung",
      "Inventur",
    ]);
  });

  it("faellt bei Unbekanntem auf den Rohwert zurueck", () => {
    expect(vorgangLabel("was-neues")).toBe("was-neues");
  });

  it("jede Art hat eine EIGENE Beschriftung", () => {
    // Zwei gleiche Texte hiessen: der Filter bietet zwei Eintraege an, die auf
    // dem Schirm nicht zu unterscheiden sind.
    const texte = VORGANG_ARTEN.map(vorgangLabel);
    expect(new Set(texte).size).toBe(texte.length);
  });
});

describe("die Praefixe haben GENAU EINE Quelle", () => {
  it("`istPraefixArt` und `praefixVon` passen zueinander", () => {
    const verfeinert = VORGANG_ARTEN.filter(istPraefixArt);
    expect(verfeinert).toEqual(["aussondern", "inventur"]);
    expect(verfeinert.map(praefixVon)).toEqual([AUSSONDERN_PRAEFIX, INVENTUR_PRAEFIX]);
  });

  it("endet auf einen Doppelpunkt — sonst traefe `aussondern` auch `aussondernXY`", () => {
    expect(AUSSONDERN_PRAEFIX).toBe("aussondern:");
    expect(INVENTUR_PRAEFIX).toBe("inventur:");
  });

  it("ist kleingeschrieben — die SQL-Haelfte verlaesst sich darauf", () => {
    /**
     * ⚠️ `LIKE` IST IN SQLITE FUER ASCII OHNE ACHT AUF GROSS- UND
     * KLEINSCHREIBUNG. Die Bedingung in `lesepfade/journal.ts` geht deshalb gut,
     * SOLANGE die Praefixe kleingeschrieben in die Daten gelangen. Ein
     * `Aussondern:` hier machte `vorgangAus` (`startsWith`, streng) und den
     * SQL-Filter (`LIKE`, lax) uneins: die Spalte zeigte „Korrektur", der Filter
     * „Aussonderung" faende die Zeile trotzdem.
     */
    for (const praefix of [AUSSONDERN_PRAEFIX, INVENTUR_PRAEFIX]) {
      expect(praefix).toBe(praefix.toLowerCase());
    }
  });

  it("die schreibenden Aktionen bauen die Referenz aus DIESER Konstante", () => {
    /**
     * ⚠️ DER QUELLTEXT-SCAN IST HIER DAS EINZIGE TOR. Die Praefixe werden an
     * drei Stellen gebraucht: beim SCHREIBEN (die Aktionen), beim ABLEITEN
     * (`vorgangAus`) und in der SQL-Bedingung des Lesepfads. Ein abgeschriebenes
     * Literal in einer der Aktionen liefe still auseinander — die Buchung
     * entstuende mit `aussonderung:` statt `aussondern:`, `typecheck` und
     * `build` blieben gruen, und im Journal stuende weiter „Korrektur".
     *
     * Er faengt die naheliegende Verdrahtung, nicht jede denkbare — ein
     * umbenannter Re-Export kaeme durch. Das ist derselbe Zuschnitt wie bei
     * `scripts/seed-lokal.test.ts`.
     */
    const aussondern = readFileSync("src/app/m/lagerbuch/_actions/aussondern.ts", "utf8");
    expect(aussondern).toContain("AUSSONDERN_PRAEFIX");
    expect(aussondern).not.toMatch(/referenz:\s*`aussondern:/);

    const inventur = readFileSync("src/app/m/lagerbuch/_actions/inventur.ts", "utf8");
    expect(inventur).toContain("INVENTUR_PRAEFIX");
    expect(inventur).not.toMatch(/referenz:\s*`inventur:/);
  });
});

describe("vorgang.ts bleibt in BEIDEN React-Ebenen lesbar", () => {
  it("traegt keine Direktive", () => {
    /**
     * ⚠️ DREI EBENEN LESEN DIESE DATEI: der Lesepfad (Server), die Journalseite
     * (Server Component) und die Filterinsel (Client). Ein `"use client"` liesse
     * die Server Component eine Client-REFERENZ statt des Wertes bekommen —
     * HTTP 500 fuer die ganze Seite (Falle 6).
     *
     * ⚠️ VITEST KANN DEN AUSFALL STRUKTURELL NICHT SEHEN: dort ist
     * `"use client"` eine wirkungslose Zeichenkette, die Funktion laeuft im
     * selben Prozess und tut genau das Richtige. `build` serialisiert klaglos.
     * Was Vitest sehen kann, ist der QUELLTEXT — mehr ist hier nicht zu holen.
     *
     * Die zweite Haelfte (kein `@ant-design/icons`) steht hier NICHT: sie ist
     * repo-weit in `src/core/shell/icons.test.ts` abgeriegelt, das jede Datei
     * unter `src` scannt und vier Importformen kennt. Ein zweiter, schwaecherer
     * Scan daneben waere eine zweite Wahrheit — und er schlug prompt an diesem
     * Test-Kommentar selbst an.
     */
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/vorgang.ts", "utf8");
    expect(quelle).not.toMatch(/^\s*["']use (client|server)["']/m);
  });
});
