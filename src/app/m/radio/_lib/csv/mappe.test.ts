// src/app/m/radio/_lib/csv/mappe.test.ts
import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { LESE_FEHLER, lesEinDatei } from "./einlesen";
import { istMappe, lesEinMappe } from "./mappe";

/**
 * DER MAPPENLESER GEGEN EINE MAPPE, WIE EXCEL SIE SCHREIBT (DRK-389).
 *
 * ⛔ `rundlauf.test.ts` PRUEFT NUR DIE EIGENE MAPPE — und die ist die gutmuetigste, die es gibt:
 * `write-excel-file` schreibt jede Zelle als gemeinsame Zeichenkette, ohne Datumsformat, ohne
 * Luecken, ohne Namensraumpraefix. Wer die Exportmappe in Excel oeffnet, ein Datum eintippt und
 * speichert, schickt etwas anderes zurueck. Diese Datei baut solche Mappen von Hand, damit jeder
 * Zweig des Lesers eine Fixture hat, die nur er richtig liest.
 *
 * Das ZIP hier ist minimal (keine Pruefsumme, der Leser prueft keine), aber gueltig im Aufbau:
 * lokale Koepfe, zentrales Verzeichnis, Endsatz.
 */

type Dateien = Record<string, string>;

/** Baut ein ZIP; `packen` entscheidet zwischen Verfahren 8 (deflate) und 0 (gespeichert). */
function zip(dateien: Dateien, packen = true): Uint8Array {
  const lokal: Buffer[] = [];
  const zentral: Buffer[] = [];
  let versatz = 0;
  for (const [name, inhalt] of Object.entries(dateien)) {
    const roh = Buffer.from(inhalt, "utf8");
    const daten = packen ? deflateRawSync(roh) : roh;
    const namenBytes = Buffer.from(name, "utf8");

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4);
    kopf.writeUInt16LE(packen ? 8 : 0, 8);
    kopf.writeUInt32LE(daten.length, 18);
    kopf.writeUInt32LE(roh.length, 22);
    kopf.writeUInt16LE(namenBytes.length, 26);
    lokal.push(kopf, namenBytes, daten);

    const eintrag = Buffer.alloc(46);
    eintrag.writeUInt32LE(0x02014b50, 0);
    eintrag.writeUInt16LE(20, 4);
    eintrag.writeUInt16LE(20, 6);
    eintrag.writeUInt16LE(packen ? 8 : 0, 10);
    eintrag.writeUInt32LE(daten.length, 20);
    eintrag.writeUInt32LE(roh.length, 24);
    eintrag.writeUInt16LE(namenBytes.length, 28);
    eintrag.writeUInt32LE(versatz, 42);
    zentral.push(eintrag, namenBytes);

    versatz += kopf.length + namenBytes.length + daten.length;
  }
  const verzeichnis = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(Object.keys(dateien).length, 8);
  ende.writeUInt16LE(Object.keys(dateien).length, 10);
  ende.writeUInt32LE(verzeichnis.length, 12);
  ende.writeUInt32LE(versatz, 16);
  return new Uint8Array(Buffer.concat([...lokal, verzeichnis, ende]));
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * Eine Mappe im Aufbau von Excel. ⛔ DAS ERSTE BLATT HEISST NICHT `sheet1.xml`: die Beziehung
 * zeigt auf `blatt-a.xml`, und unter `sheet1.xml` liegt das ZWEITE Blatt mit falschen Daten. Ein
 * Leser, der den Namen raet statt der Beziehung zu folgen, liest also sichtbar das Falsche.
 */
function excelMappe(blattXml: string, zusatz: { workbookPr?: string; packen?: boolean } = {}): Uint8Array {
  return zip(
    {
      "[Content_Types].xml": "<Types/>",
      "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0"?><workbook ${NS} ${NS_R}>${zusatz.workbookPr ?? ""}<sheets><sheet name="Geräte" sheetId="1" r:id="rId7"/><sheet name="Anderes" sheetId="2" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="${REL}/worksheet" Target="/xl/worksheets/blatt-a.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
      "xl/worksheets/sheet1.xml": `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FALSCHES BLATT</t></is></c></row></sheetData></worksheet>`,
      "xl/worksheets/blatt-a.xml": blattXml,
      "xl/sharedStrings.xml": `<sst ${NS} count="7" uniqueCount="7"><si><t>ISSI</t></si><si><t>Zuletzt aktualisiert</t></si><si><r><rPr><b/></rPr><t>Ruf</t></r><r><t xml:space="preserve">name</t></r></si><si><t>Florian</t><rPh sb="0" eb="1"><t>フロリアン</t></rPh></si><si><t>Kabel &amp; &lt;Stecker&gt;_x000D_</t></si><si/><si><t>Ende</t></si></sst>`,
      "xl/styles.xml": `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="[$-407]DD.MM.YYYY;@"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="14"/><xf numFmtId="20"/></cellXfs></styleSheet>`,
    },
    zusatz.packen ?? true,
  );
}

/** Ein Blatt mit Kopfzeile ISSI | Rufname | Zuletzt aktualisiert und den uebergebenen Zeilen. */
function blatt(zeilen: string): string {
  return `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c><c r="C1" t="s"><v>1</v></c></row>${zeilen}</sheetData></worksheet>`;
}

function lies(bytes: Uint8Array) {
  const ergebnis = lesEinDatei(bytes);
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  return ergebnis.daten;
}

describe("radio-mappe: eine Mappe aus Excel", () => {
  it("folgt der Beziehung zum ERSTEN Blatt, nicht dem Dateinamen sheet1.xml", () => {
    const daten = lies(excelMappe(blatt('<row r="2"><c r="A2"><v>1001</v></c></row>')));
    expect(daten.spalten).toEqual(["ISSI", "Rufname", "Zuletzt aktualisiert"]);
    expect(daten.zeilen).toEqual([["1001"]]);
  });

  it("liest formatierten Text als einen Wert und laesst die phonetische Lesung weg", () => {
    // Kopfzeile B1 ist `<r>Ruf</r><r>name</r>` — zwei Laeufe, ein Wert.
    const daten = lies(excelMappe(blatt('<row r="2"><c r="B2" t="s"><v>3</v></c></row>')));
    expect(daten.spalten[1]).toBe("Rufname");
    expect(daten.zeilen[0]?.[1], "die Lesung stuende verdoppelt im Wert").toBe("Florian");
  });

  it("loest XML-Entitaeten und Excels _xHHHH_-Maskierung auf", () => {
    const daten = lies(excelMappe(blatt('<row r="2"><c r="B2" t="s"><v>4</v></c></row>')));
    // `_x000D_` ist ein CR am Zellende; der Feldschnitt nimmt es wie jeden Leerraum mit.
    expect(daten.zeilen[0]?.[1]).toBe("Kabel & <Stecker>");
  });

  it("zaehlt eine leere gemeinsame Zeichenkette <si/> mit", () => {
    // Index 5 ist `<si/>`, Index 6 „Ende". Ueberlesen verschoebe „Ende" auf Index 5.
    const daten = lies(excelMappe(blatt('<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>6</v></c></row>')));
    expect(daten.zeilen[0]?.[1]).toBe("Ende");
  });

  it("macht aus einer Datumszelle den Kalendertag — eigenes und eingebautes Format", () => {
    /*
     * ⛔ DER FALL, FUER DEN DIE STILE UEBERHAUPT GELESEN WERDEN. 46204 ist der 1. Juli 2026.
     * Ohne Umrechnung kaeme `46204` an, und `tagAusWert` laese es als Millisekunden — das
     * Geraet stuende auf dem 1. Januar 1970. Stil 1 ist `DD.MM.YYYY` (eigenes Format 164),
     * Stil 2 das eingebaute Format 14; der Uhrzeitanteil (`.75`) faellt weg.
     */
    const daten = lies(
      excelMappe(
        blatt(
          '<row r="2"><c r="A2"><v>1001</v></c><c r="C2" s="1"><v>46204</v></c></row>' +
            '<row r="3"><c r="A3"><v>1002</v></c><c r="C3" s="2"><v>46204.75</v></c></row>',
        ),
      ),
    );
    expect(daten.zeilen[0]?.[2]).toBe("2026-07-01");
    expect(daten.zeilen[1]?.[2]).toBe("2026-07-01");
  });

  it("laesst eine Zahl ohne Datumsformat eine Zahl — auch unter einem Uhrzeitformat", () => {
    // Stil 3 ist das eingebaute Format 20 (`h:mm`): eine Uhrzeit ist kein Kalendertag.
    const daten = lies(
      excelMappe(blatt('<row r="2"><c r="A2" s="0"><v>1001</v></c><c r="B2"><v>6.0999999999999996</v></c><c r="C2" s="3"><v>0.5</v></c></row>')),
    );
    expect(daten.zeilen[0]).toEqual(["1001", "6.1", "0.5"]);
  });

  it("rechnet in einer Mappe mit 1904-Datumsbasis vier Jahre weiter", () => {
    const daten = lies(
      excelMappe(blatt('<row r="2"><c r="A2"><v>1</v></c><c r="C2" s="1"><v>44742</v></c></row>'), {
        workbookPr: '<workbookPr date1904="1"/>',
      }),
    );
    expect(daten.zeilen[0]?.[2]).toBe("2026-07-01");
  });

  it("fuellt Luecken mitten in der Zeile und laesst leere Zeilen weg", () => {
    /*
     * ⛔ DIE LUECKE IST DER FALL, DER EINE SPALTE STILL VERSCHIEBT: Excel schreibt B2 nicht,
     * wenn es leer ist. Ohne Fuellung stuende das Datum unter „Rufname". Die leere Zeile 3
     * (selbstschliessend) und die Zeile 4 aus lauter Leerraum fallen weg wie in der CSV.
     */
    const daten = lies(
      excelMappe(
        blatt(
          '<row r="2"><c r="A2"><v>1001</v></c><c r="C2" t="str"><v>2026-07-01</v></c></row>' +
            '<row r="3" spans="1:3"/>' +
            '<row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve">   </t></is></c><c r="B4" s="1"/></row>' +
            '<row r="5"><c r="A5"><v>1002</v></c></row>',
        ),
      ),
    );
    expect(daten.zeilen).toEqual([["1001", "", "2026-07-01"], ["1002"]]);
  });

  it("liest Wahrheitswerte als true/false und Fehlerzellen als leer", () => {
    const daten = lies(
      excelMappe(
        blatt('<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="b"><v>0</v></c><c r="C2" t="e"><v>#N/A</v></c></row>'),
      ),
    );
    expect(daten.zeilen[0]).toEqual(["true", "false", ""]);
  });

  it("liest auch Elemente mit Namensraumpraefix und ungepackte Eintraege", () => {
    const praefix =
      `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>` +
      `<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>ISSI</x:t></x:is></x:c></x:row>` +
      `<x:row r="2"><x:c r="A2"><x:v>1001</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
    const daten = lies(excelMappe(praefix, { packen: false }));
    expect(daten.spalten).toEqual(["ISSI"]);
    expect(daten.zeilen).toEqual([["1001"]]);
  });
});

describe("radio-mappe: was keine Mappe ist oder keine lesbare", () => {
  it("erkennt die Mappe am Inhalt, eine CSV bleibt eine CSV", () => {
    expect(istMappe(excelMappe(blatt("")))).toBe(true);
    expect(istMappe(new TextEncoder().encode("ISSI;Rufname\n"))).toBe(false);
    expect(istMappe(new Uint8Array(0))).toBe(false);
  });

  it("eine Mappe ohne Datenzeile liefert die Kopfzeile, ein leeres Blatt die Meldung", () => {
    expect(lies(excelMappe(blatt(""))).zeilen).toEqual([]);
    expect(lesEinMappe(excelMappe(`<worksheet ${NS}><sheetData/></worksheet>`))).toBeNull();
    const leer = lesEinDatei(excelMappe(`<worksheet ${NS}><sheetData/></worksheet>`));
    expect(leer.ok ? "" : leer.fehler).toBe(LESE_FEHLER);
  });

  it("ein abgeschnittenes Archiv ist die Meldung, kein Wurf", () => {
    /*
     * ⛔ `lesEinMappe` WIRFT, `lesEinDatei` DARF ES NICHT: im Hochladen-Handler waere der Wurf
     * ein 500 auf eine Eingabe, die eine Meldung verdient — dieselbe Zusage wie beim CSV-Weg.
     */
    const ganz = excelMappe(blatt('<row r="2"><c r="A2"><v>1001</v></c></row>'));
    const ergebnis = lesEinDatei(ganz.subarray(0, Math.floor(ganz.length / 2)));
    expect(ergebnis.ok ? "" : ergebnis.fehler).toBe(LESE_FEHLER);
  });

  it("ein Eintrag, der ueber die Obergrenze entpackt, ist die Meldung", () => {
    /*
     * ⛔ DIE OBERGRENZE IST DER RIEGEL GEGEN EIN ZIP, DAS AUS WENIGEN KILOBYTE GIGABYTE MACHT.
     * 33 MB Leerraum packen auf rund 33 KB; ohne `maxOutputLength` laese der Leser sie ganz.
     */
    const aufgeblasen = blatt(" ".repeat(33 * 1024 * 1024));
    const ergebnis = lesEinDatei(excelMappe(aufgeblasen));
    expect(ergebnis.ok ? "" : ergebnis.fehler).toBe(LESE_FEHLER);
  });
});
