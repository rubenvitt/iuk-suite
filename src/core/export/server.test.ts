import { describe, it, expect } from "vitest";
import { blatt, freiesBlatt } from "./spalten";
import { xlsxAntwort } from "./server";
import { blattZellen, blattnamen, mappenBytes, mappenText, zeichenketten } from "./test-mappe";

/**
 * Der serverseitige Ausgabeweg — hier MIT `write-excel-file`, weil genau die
 * Naht geprüft wird, die `spalten.test.ts` bewusst auslässt: dass aus den
 * gerechneten Blattdaten eine Mappe wird, die die Zeichen auch enthält.
 *
 * Ausgepackt wird mit `test-mappe.ts`; warum ein Blick auf die Rumpflänge nicht
 * reicht und warum der Leser über das zentrale Verzeichnis geht, steht dort.
 */

type Zeile = { artikel: string; menge: number };
const SPALTEN = [
  { kopf: "Artikel", breite: 30, wert: (z: Zeile) => z.artikel },
  { kopf: "Menge", breite: 10, wert: (z: Zeile) => z.menge },
];

describe("xlsxAntwort", () => {
  it("liefert eine Mappe mit den Kopfzeilen für einen Download", async () => {
    const antwort = await xlsxAntwort(
      "bestand-2026-09-16.xlsx",
      [blatt("Bestand", SPALTEN, [{ artikel: "Mullbinde", menge: 12 }])],
    );

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(antwort.headers.get("Content-Disposition")).toBe(
      'attachment; filename="bestand-2026-09-16.xlsx"',
    );
  });

  it("schreibt Köpfe, Text und Zahl wirklich in die Mappe", async () => {
    const bytes = await mappenBytes(
      await xlsxAntwort("x.xlsx", [
        blatt("Bestand", SPALTEN, [{ artikel: "Mullbinde", menge: 12 }]),
      ]),
    );

    // ZIP-Signatur — eine `.xlsx`, die nicht mit `PK` beginnt, ist keine.
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe("PK");

    expect(zeichenketten(bytes)).toEqual(["Artikel", "Menge", "Mullbinde"]);
    expect(blattnamen(bytes)).toEqual(["Bestand"]);
    // Die Zahl steht als Zahlenzelle, nicht in der Zeichenkettentabelle.
    expect(mappenText(bytes)).toMatch(/<v>12<\/v>/);
  });

  /**
   * DER KERN VON DRK-186, AM FERTIGEN ARTEFAKT GEMESSEN: der Wert `=1+1` steht
   * unverändert und OHNE den Apostroph in der Datei, den jeder CSV-Weg der
   * Suite davorsetzen musste — und er steht in der Zeichenkettentabelle, also
   * als Text, nicht in einem `<f>`-Element, also nicht als Formel.
   */
  it("legt einen Formelbeginn als Text ab, ohne ihn zu verändern", async () => {
    const bytes = await mappenBytes(
      await xlsxAntwort("x.xlsx", [
        blatt("B", [{ kopf: "K", wert: (z: { v: string }) => z.v }], [{ v: "=1+1" }]),
      ]),
    );

    expect(zeichenketten(bytes)).toContain("=1+1");
    expect(zeichenketten(bytes)).not.toContain("'=1+1");
    expect(mappenText(bytes)).not.toMatch(/<f>/);
  });

  it("führt zwei Blätter mit ihren Namen", async () => {
    const bytes = await mappenBytes(
      await xlsxAntwort("x.xlsx", [
        blatt("Rückmeldungen", SPALTEN, [{ artikel: "a", menge: 1 }]),
        freiesBlatt("Kopfdaten", [["Gruppe", "Bereitschaft 1"]]),
      ]),
    );

    expect(blattnamen(bytes)).toEqual(["Rückmeldungen", "Kopfdaten"]);
    expect(zeichenketten(bytes)).toContain("Bereitschaft 1");
  });

  /** Ein Gruppenname wandert in den Dateinamen und damit in einen Header.
   *  `dateinameSlug` räumt ihn vorher auf — dieser Riegel ist der zweite,
   *  falls ein Aufrufer ihn je vergisst. */
  it("lässt kein Anführungszeichen in den Content-Disposition", async () => {
    const antwort = await xlsxAntwort('a"b\r\nX: 1.xlsx', [blatt("B", SPALTEN, [])]);
    expect(antwort.headers.get("Content-Disposition")).toBe(
      'attachment; filename="a_b__X: 1.xlsx"',
    );
  });
});

describe("blattZellen (Harness)", () => {
  /** Das Harness selbst braucht eine Gegenprobe: eine leere Zelle darf die
   *  Spalten dahinter nicht verschieben, und eine Zahl muss als Zahl
   *  zurückkommen — sonst prüfen die Modultests ihre eigene Nachlässigkeit. */
  it("gibt Zahl, Text und Lücke ortsgetreu zurück", async () => {
    const bytes = await mappenBytes(
      await xlsxAntwort("x.xlsx", [
        blatt(
          "B",
          [
            { kopf: "A", wert: (z: { a: string; b: string | null; c: number }) => z.a },
            { kopf: "B", wert: (z) => z.b },
            { kopf: "C", wert: (z) => z.c },
          ],
          [{ a: "links", b: null, c: 1.5 }],
        ),
      ]),
    );
    expect(blattZellen(bytes)).toEqual([
      ["A", "B", "C"],
      ["links", null, 1.5],
    ]);
  });

  it("liest das zweite Blatt über seinen Index", async () => {
    const bytes = await mappenBytes(
      await xlsxAntwort("x.xlsx", [
        blatt("Daten", SPALTEN, []),
        freiesBlatt("Kopfdaten", [["Gruppe", "Bereitschaft 1"], ["Abende", 3]]),
      ]),
    );
    expect(blattZellen(bytes, 1)).toEqual([["Gruppe", "Bereitschaft 1"], ["Abende", 3]]);
  });
});

describe("blattZellen — die abschließend leere Zelle", () => {
  /**
   * ⚠️ DER UNTERSCHIED ZUR CSV, DER EINEN TEST SONST STUNDENLANG BESCHÄFTIGT:
   * eine Zeile endet in der Datei nach der letzten GEFÜLLTEN Zelle — eine
   * abschließend leere steht dort gar nicht. Gemessen: `[5]` statt `[5, null]`.
   * Das Harness füllt auf die Breite der Kopfzeile auf; verschoben ist nichts,
   * die Orte stammen aus `r=`.
   */
  it("füllt eine verkürzte Zeile auf die Breite der Kopfzeile auf", async () => {
    const bytes = await mappenBytes(
      await xlsxAntwort("x.xlsx", [
        blatt(
          "B",
          [
            { kopf: "A", wert: (z: { a: number; b: number | null }) => z.a },
            { kopf: "B", wert: (z) => z.b },
          ],
          [{ a: 5, b: null }],
        ),
      ]),
    );
    expect(blattZellen(bytes)).toEqual([["A", "B"], [5, null]]);
  });
});
