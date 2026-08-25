// src/app/m/radio/_lib/csv/rundlauf.test.ts
import { describe, it, expect } from "vitest";
import type { Geraet } from "../../_db/schema";
import {
  CSV_BOM,
  CSV_TRENNZEICHEN,
  EXPORT_SPALTEN,
  baueExportCsv,
  formatiereZelle,
  tagAusWert,
  wertAusTag,
  type ExportFeld,
} from "./spalten";
import { IMPORTIERBARE_FELDER, automatischeSpaltenzuordnung } from "./kopfzeilen";
import { dekodiereCsv, erkenneTrennzeichen, lesEinCsv } from "./einlesen";
import { zeileZuEingehend, type Spaltenzuordnung } from "./klassifizieren";

/**
 * DER RUNDLAUF-VERTRAG (`Spec:4731-4737`, `Spec:4748-4750`).
 *
 * Der Alt-Kommentar ueber `EXPORT_COLUMNS` ist der ganze Vertrag und steht woertlich in
 * `radio-admin/server/src/routes/export.ts:11-15`: „each German header MUST normalize (via
 * autoMapHeaders) back to its device field, so the exported file re-imports cleanly through
 * the wizard. Verified by exportRoundTrip test."
 *
 * ⛔ DIE FIXTUREN TRAGEN JE FELD EINEN ANDEREN WERT. Der Brief zu dieser Aufgabe schreibt es
 * zweimal aus (`.superpowers/sdd/planteil4/briefs/V9.md:133`, `:149`), und der Grund ist
 * gemessen: zwei Spalten, die versehentlich auf dasselbe Feld zeigen, sind mit gleichen
 * Werten vollzaehlig UND gruen.
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass der Export-Handler den Riegel traegt — das ist V22
 * und `riegel.test.ts` Klausel (c). Hier steht ausschliesslich der Datenvertrag.
 */

/** Das erste Geraet: jedes der neunzehn Felder gesetzt, jedes mit einem anderen Wert. */
const GERAET_VOLL: Pick<Geraet, ExportFeld> = {
  issi: "1001",
  tei: "01234567890123",
  rufname: "Florian Musterstadt 10-1",
  serialNumber: "SN-0001-A",
  deviceType: "TPH900",
  status: "Einsatzbereit",
  location: "Lager Nord",
  assignedTo: "Zugtrupp",
  softwareVersion: "6.1.2",
  lastUpdatedAt: "2026-07-01",
  notes: "Antenne getauscht",
  hiorgId: "HO-4711",
  opta: "HE RD DA 01-10-1",
  funktion: "Fuehrungskraft",
  hersteller: "Airbus",
  bedieneinheit: "TFC5000",
  deviceModes: "TMO,DMO",
  alamosIntegrated: true,
  loanable: true,
};

/** Das zweite Geraet: die Gegenprobe mit Leerwerten — und ANDEREN Werten, wo gesetzt. */
const GERAET_DUENN: Pick<Geraet, ExportFeld> = {
  issi: "1002",
  tei: null,
  rufname: "Rotkreuz Musterstadt 20-2",
  serialNumber: null,
  deviceType: "TPH700",
  status: null,
  location: null,
  assignedTo: null,
  softwareVersion: null,
  lastUpdatedAt: null,
  notes: null,
  hiorgId: null,
  opta: null,
  funktion: null,
  hersteller: null,
  bedieneinheit: null,
  deviceModes: null,
  alamosIntegrated: null,
  loanable: null,
};

/**
 * Das dritte Geraet traegt den BEKANNTEN, GEWOLLTEN VERLUST: `alamosIntegrated: false`.
 * Der Alt-Kommentar benennt ihn ausdruecklich (`export.ts:40-41`): „only true and null
 * round-trip; the importer reads '' as null".
 */
const GERAET_FALSCH: Pick<Geraet, ExportFeld> = {
  issi: "1003",
  tei: "99999999999999",
  rufname: "Kater Musterstadt 30-3",
  serialNumber: "SN-0003-C",
  deviceType: "TPM700",
  status: "Wartung",
  location: "Werkstatt",
  assignedTo: "Technik",
  softwareVersion: "5.9.0",
  lastUpdatedAt: "2026-03-29",
  notes: "Akku schwach",
  hiorgId: "HO-0815",
  opta: "HE RD DA 01-30-3",
  funktion: "Reserve",
  hersteller: "Motorola",
  bedieneinheit: "CH700",
  deviceModes: "REP",
  alamosIntegrated: false,
  loanable: false,
};

/** Baut aus den erkannten Kopfzeilen die Feld-zu-Spaltenindex-Zuordnung des Importers. */
function zuordnungAus(spalten: readonly string[]): Spaltenzuordnung {
  const erkannt = automatischeSpaltenzuordnung(spalten);
  const zuordnung: Record<string, number> = {};
  spalten.forEach((kopf, index) => {
    const feld = erkannt[kopf];
    if (feld !== undefined && zuordnung[feld] === undefined) {
      zuordnung[feld] = index;
    }
  });
  return zuordnung as Spaltenzuordnung;
}

/** Exportiert die Geraete und liest sie ueber Erkennung und Zuordnung zurueck. */
function rundlauf(geraete: readonly Pick<Geraet, ExportFeld>[]) {
  const csv = baueExportCsv(geraete);
  const ergebnis = lesEinCsv(new TextEncoder().encode(csv));
  if (!ergebnis.ok) {
    throw new Error(`Rundlauf gescheitert: ${ergebnis.fehler}`);
  }
  const zuordnung = zuordnungAus(ergebnis.daten.spalten);
  return ergebnis.daten.zeilen.map((zeile) => zeileZuEingehend(zeile, zuordnung));
}

describe("radio-csv: der Rundlauf-Vertrag", () => {
  it("exportiere drei Geraete, lies das Ergebnis mit der Spaltenerkennung zurueck, erhalte dieselben Felder", () => {
    const zurueck = rundlauf([GERAET_VOLL, GERAET_DUENN, GERAET_FALSCH]);

    expect(zurueck.length, "drei Zeilen hinein, drei zurueck").toBe(3);

    // Das volle Geraet laeuft feldweise rund — je Feld ein anderer Wert.
    expect(zurueck[0]).toEqual(GERAET_VOLL);

    /*
     * Das duenne Geraet: `null` bleibt `null` — der Exporter schreibt '' (`export.ts:53`),
     * der Importer liest '' als `null` (`commit-service.ts:106`).
     */
    expect(zurueck[1]).toEqual(GERAET_DUENN);

    /*
     * ⛔ DER BEKANNTE, GEWOLLTE VERLUST, festgehalten statt verschwiegen: `false` wird zu
     * `null`. Alles andere am dritten Geraet laeuft rund.
     */
    expect(zurueck[2]).toEqual({
      ...GERAET_FALSCH,
      alamosIntegrated: null,
      loanable: null,
    });
  });

  it("der Rundlauf traegt auch ein Datum", () => {
    /*
     * Entscheidung E-V11 (`.superpowers/sdd/planteil4/briefs/KOPF.md`, Abschnitt E-V11):
     * die Suite-Spalte IST bereits der Kalendertag (`_db/schema.ts:39`). Der Alt-Code
     * rechnet an dieser Stelle (`export.ts:51`), die Suite rechnet NICHT.
     */
    const zurueck = rundlauf([GERAET_VOLL, GERAET_FALSCH]);

    expect(zurueck[0]?.lastUpdatedAt, "der Tag des ersten Geraets").toBe("2026-07-01");
    expect(zurueck[1]?.lastUpdatedAt, "der Tag des dritten Geraets").toBe("2026-03-29");
  });

  it("die Exportdatei beginnt mit dem BOM", () => {
    // `export.ts:9` („UTF-8 BOM so Excel opens the `;`-delimited file with correct
    // encoding") und `:61` (`return BOM + body`).
    const csv = baueExportCsv([GERAET_VOLL]);

    expect(csv.charCodeAt(0), "kein fuehrendes U+FEFF").toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it("das Trennzeichen ist ein Semikolon", () => {
    // `export.ts:60` (`stringify([header, ...rows], { delimiter: ';' })`).
    const csv = baueExportCsv([GERAET_VOLL]);
    const kopfzeile = csv.replace(/^﻿/, "").split("\n")[0] ?? "";

    expect(CSV_TRENNZEICHEN).toBe(";");
    expect(kopfzeile.split(";").length, "neunzehn Spalten in der Kopfzeile").toBe(19);
    expect(kopfzeile.split(",").length, "kein Komma als Trennzeichen").toBe(1);
  });

  it("die Zeilen enden mit einem blossen Zeilenumbruch, nicht mit CR-LF", () => {
    /*
     * `export.ts:57-62` ueber `csv-stringify`, dessen Vorgabe `\n` ist — gemessen am Alt-Test
     * `radio-admin/server/test/deviceTei.test.ts:76`, der das Ergebnis an `'\n'` teilt. Bis
     * Fix-Runde 1 stand das nur im Kommentar (Review V9, Fund F7 Punkt 8): auf `\r\n`
     * umgestellt blieb alles gruen, weil der Wiedereinleser das CR ohnehin verwirft — der
     * Rundlauf kann diese Zusicherung also strukturell nicht tragen.
     */
    const csv = baueExportCsv([GERAET_VOLL, GERAET_DUENN]);

    expect(csv.includes("\r"), "kein CR im Exporttext").toBe(false);
    expect(csv.endsWith("\n"), "ein Zeilenende auch nach der letzten Zeile").toBe(true);
    expect(csv.split("\n").length, "Kopfzeile, zwei Datenzeilen und der leere Rest").toBe(4);
  });

  it("die neunzehn Exportspalten und die neunzehn importierbaren Felder stehen in derselben Reihenfolge", () => {
    /*
     * ⛔ DER RUNDLAUF-VERTRAG VON DER ANDEREN SEITE. `kopfzeilen.ts` behauptet im Kommentar an
     * `IMPORTIERBARE_FELDER`, die Reihenfolge decke sich mit `EXPORT_SPALTEN` — bis Fix-Runde 1
     * war der Satz unbewacht (Review V9, Fund F7 Punkt 7): `issi` und `tei` in der einen Liste
     * getauscht liess alles gruen.
     */
    expect(EXPORT_SPALTEN.map((spalte) => spalte.feld)).toEqual([...IMPORTIERBARE_FELDER]);
  });

  it("ein wahrer Wahrheitswert wird x, ein falscher und ein leerer werden leer", () => {
    // `export.ts:46-48`, alle drei Lagen.
    expect(formatiereZelle("loanable", true)).toBe("x");
    expect(formatiereZelle("loanable", false)).toBe("");
    expect(formatiereZelle("loanable", null)).toBe("");
    expect(formatiereZelle("alamosIntegrated", true)).toBe("x");
    expect(formatiereZelle("alamosIntegrated", false)).toBe("");
    expect(formatiereZelle("alamosIntegrated", null)).toBe("");
  });

  it("ein leerer Wahrheitswert laeuft rund, ein falscher NICHT", () => {
    /*
     * ⛔ DER FALL, DEN DER ALT-KOMMENTAR AUSDRUECKLICH BENENNT (`export.ts:40-41`). Er wird
     * hier FESTGEHALTEN, nicht repariert: `false` exportiert als '' und importiert als
     * `null`. Wer ihn heilen will, aendert den Vertrag und nicht diesen Test.
     */
    const zurueck = rundlauf([GERAET_DUENN, GERAET_FALSCH]);

    expect(zurueck[0]?.loanable, "null laeuft rund").toBeNull();
    expect(zurueck[1]?.loanable, "false kommt als null zurueck — der gewollte Verlust").toBeNull();
    expect(zurueck[1]?.loanable, "und ist damit NICHT mehr false").not.toBe(false);
  });

  it("die neunzehn Kopfzeilen bilden alle auf ihr Feld zurueck", () => {
    /*
     * ⛔ DIE ZAHL 19 STEHT AUSSERHALB DER SCHLEIFE. Ohne sie schrumpft die geprueften Menge
     * lautlos, sobald eine Spalte aus der Liste faellt.
     */
    expect(EXPORT_SPALTEN.length, "neunzehn Spalten (export.ts:16-36)").toBe(19);

    for (const spalte of EXPORT_SPALTEN) {
      const erkannt = automatischeSpaltenzuordnung([spalte.kopf]);
      expect(erkannt[spalte.kopf], `Kopfzeile "${spalte.kopf}" bildet nicht auf ${spalte.feld} ab`).toBe(
        spalte.feld,
      );
    }
  });

  it("die neunzehn Kopfzeilen stehen in der festen Reihenfolge des Bestands", () => {
    // 1:1 aus `export.ts:16-36`, Reihenfolge inklusive.
    expect(EXPORT_SPALTEN.map((s) => s.kopf)).toEqual([
      "ISSI",
      "TEI",
      "Rufname",
      "Seriennummer",
      "Typ",
      "Status",
      "Standort",
      "Zuordnung",
      "Softwareversion",
      "Zuletzt aktualisiert",
      "Notizen",
      "Hiorg-ID",
      "OPTA",
      "Funktion",
      "Hersteller",
      "Bedieneinheit",
      "Gerätefunktionen",
      "Alamos",
      "Ausleihbar",
    ]);
  });

  it("ein Wert mit Semikolon oder Anfuehrungszeichen laeuft rund", () => {
    /*
     * Die Suite baut den CSV-Text selbst — `csv-stringify` ist im Repo nicht vorhanden
     * (gemessen: `grep -n "csv-stringify" package.json` ohne Treffer). Die Maskierung ist
     * damit eigener Code und braucht ihren eigenen Fall, sonst zerreisst ein Notizfeld mit
     * Semikolon still die ganze Zeile.
     */
    const heikel: Pick<Geraet, ExportFeld> = {
      ...GERAET_VOLL,
      notes: 'Kabel; Stecker "kurz" defekt',
      location: "Halle 2\nRegal 4",
    };
    const zurueck = rundlauf([heikel]);

    expect(zurueck[0]?.notes).toBe('Kabel; Stecker "kurz" defekt');
    expect(zurueck[0]?.location).toBe("Halle 2\nRegal 4");
  });
});

describe("radio-csv: die eine Tagesumrechnung", () => {
  it("ein Millisekundenwert wird auf den BERLINER Kalendertag gekuerzt, nicht auf den UTC-Tag", () => {
    /*
     * ⛔ DIE SONDE AUF E-V11 HAENGT AN DIESEM FALL. Der Alt-Import kuerzt in UTC
     * (`commit-service.ts:48-53`, `isoToUtcMs`), die Suite-Spalte will den Kalendertag, und
     * `_db/schema.ts:36-38` entscheidet: „der Import kuerzt in Europe/Berlin, weil das fuer
     * alle drei richtig ist und eine UTC-Kuerzung nur fuer einen".
     *
     * ⛔ DIE FIXTURE IST DER GRENZFALL, NICHT EIN BELIEBIGER TAG: der 30.06.2026, 23:30 UTC
     * ist in Europe/Berlin bereits der 1. Juli (CEST, UTC+2). Eine UTC-Kuerzung liefert hier
     * `2026-06-30`. Dieselbe Fixture fuehrt `_lib/notiz.test.ts:22`.
     *
     * ⛔ UND SIE IST ZONENUNABHAENGIG: das Repo setzt `TZ` ausdruecklich NICHT
     * (`_lib/anzeige.test.ts:25`), die Umrechnung nennt ihre Zone deshalb selbst.
     */
    expect(tagAusWert(Date.UTC(2026, 5, 30, 23, 30))).toBe("2026-07-01");
    expect(tagAusWert(String(Date.UTC(2026, 5, 30, 23, 30)))).toBe("2026-07-01");

    // Die Gegenrichtung im Winter (CET, UTC+1): 22:30 UTC ist noch derselbe Tag.
    expect(tagAusWert(Date.UTC(2026, 0, 15, 22, 30))).toBe("2026-01-15");
    expect(tagAusWert(Date.UTC(2026, 0, 15, 23, 30))).toBe("2026-01-16");
  });

  it("ein Date-Objekt nimmt denselben Weg wie die Millisekundenzahl", () => {
    /*
     * Der Zweig `wert instanceof Date` in `tagAusWert` — das Geraeteformular (V14) liefert
     * seinen Wert so. Bis Fix-Runde 1 hatte er keinen Fall (Review V9, Fund F7 Punkt 9), und
     * er traegt dieselbe E-V11-Entscheidung: gekuerzt wird in `Europe/Berlin`, nicht in UTC.
     */
    expect(tagAusWert(new Date(Date.UTC(2026, 5, 30, 23, 30)))).toBe("2026-07-01");
    expect(tagAusWert(new Date(Number.NaN)), "ein ungueltiges Date wird null, nie NaN").toBeNull();
  });

  it("ein Kalendertag geht unveraendert durch die Zelle", () => {
    /*
     * E-V11 Punkt 3: `formatiereZelle` fuer `lastUpdatedAt` RECHNET NICHT. Die Spalte ist
     * bereits `YYYY-MM-DD` (`_db/schema.ts:39`).
     */
    expect(wertAusTag("2026-07-01")).toBe("2026-07-01");
    expect(wertAusTag(null)).toBe("");
    expect(formatiereZelle("lastUpdatedAt", "2026-07-01")).toBe("2026-07-01");
    expect(formatiereZelle("lastUpdatedAt", null)).toBe("");
  });

  it("die Zelle gibt jeden anderen Wert woertlich heraus, null als leer", () => {
    // `export.ts:53` (`return value == null ? '' : String(value)`).
    expect(formatiereZelle("rufname", "Florian 10-1")).toBe("Florian 10-1");
    expect(formatiereZelle("rufname", null)).toBe("");
    expect(formatiereZelle("deviceModes", "TMO,DMO")).toBe("TMO,DMO");
  });
});

describe("radio-csv: das Einlesen ohne Fremdbibliothek", () => {
  it("eine leere Datei ergibt eine Meldung, keinen Wurf", () => {
    /*
     * Der Alt-Handler antwortet „Leere oder ungültige Datei" (`import.ts:28`), nachdem
     * `decodeCsv` geworfen hat (`decode-csv.ts:15-17`). Die Suite gibt die Meldung zurueck,
     * weil die Action ein `{ ok: false, fehler: … }` liefert und nicht wirft.
     */
    const ergebnis = lesEinCsv(new Uint8Array(0));

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok ? "" : ergebnis.fehler).toBe("Leere oder ungültige Datei");
    /*
     * ⛔ UND DIE LEERPRUEFUNG SELBST, DIREKT. Sie ist 1:1 der Wurf des Bestands
     * (`decode-csv.ts:15-17`, `throw new Error('Leere Datei')`) und der einzige Fall, in dem
     * `dekodiereCsv` `null` liefert. Ueber `lesEinCsv` allein waere sie unbewacht: ein leerer
     * Text erzeugt gar keine Zeile und faellt ohnehin in dieselbe Meldung (gemessen, Review V9
     * Fund F7 Punkt 4 — der sie deshalb faelschlich fuer redundant hielt).
     */
    expect(dekodiereCsv(new Uint8Array(0)), "die Leerpruefung aus decode-csv.ts:15-17").toBeNull();
  });

  it("eine Datei ohne Kopfzeile ergibt dieselbe Meldung", () => {
    const ergebnis = lesEinCsv(new TextEncoder().encode("\n\n   \n"));

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok ? "" : ergebnis.fehler).toBe("Leere oder ungültige Datei");
  });

  it("das Semikolon gewinnt, sobald es ueberhaupt vorkommt", () => {
    /*
     * ⛔ DIE LEITER IST GEORDNET, NICHT EINE MEHRHEITSWAHL (`parse-csv.ts:17-21`): `;`
     * gewinnt bei JEDEM Vorkommen (deutsches Excel), dann Tabulator gegen Komma nach
     * Haeufigkeit, dann Komma, dann Tabulator, sonst `;`.
     */
    expect(erkenneTrennzeichen("a;b,c,d,e\n")).toBe(";");
    expect(erkenneTrennzeichen("a,b,c\n")).toBe(",");
    expect(erkenneTrennzeichen("a\tb\tc,d\n")).toBe("\t");
    expect(erkenneTrennzeichen("a,b\tc\n")).toBe(",");
    expect(erkenneTrennzeichen("nur eine Spalte\n")).toBe(";");
  });

  it("die erste NICHT-LEERE Zeile entscheidet das Trennzeichen", () => {
    /*
     * `parse-csv.ts:12` (`.find((l) => l.trim() !== '')`).
     *
     * ⛔ DIE FIXTURE ERWARTET DAS KOMMA, NICHT DAS SEMIKOLON, UND DAS IST DER GANZE FALL.
     * `;` ist zugleich der RUECKFALL der Leiter (`einlesen.ts`, letzte Zeile von
     * `erkenneTrennzeichen`); eine Fixture, die `;` erwartet, kann die Zusicherung nicht von
     * ihrem Gegenteil unterscheiden. Gemessen (Review V9, Fund F4): mit `a;b;c` blieb der Fall
     * auch dann gruen, wenn die Suche nach der ersten nicht-leeren Zeile durch `[0]` ersetzt
     * wurde — er war der EINZIGE der dreiundfuenfzig ohne faerbende Mutation.
     */
    expect(erkenneTrennzeichen("\n\na,b,c\n"), "die leere Zeile wird uebersprungen").toBe(",");
    // Und die zweite Haelfte der Vorschrift: `.trim() !== ''`, nicht `!== ''`.
    expect(erkenneTrennzeichen("\n   \na,b,c\n"), "auch die nur-Leerraum-Zeile").toBe(",");
  });

  it("das erzwungene Trennzeichen ueberstimmt die Erkennung", () => {
    /*
     * `parse-csv.ts:35-36`: die Oberflaeche darf das erkannte Trennzeichen ueberstimmen. Die
     * Fixture ist so gewaehlt, dass Erkennung und Vorgabe SICH WIDERSPRECHEN — `;` gewinnt die
     * Leiter bei jedem Vorkommen, das Komma kommt also nur durch, wenn der Parameter wirkt.
     * Bis Fix-Runde 1 hatte er keinen Fall (Review V9, Fund F7 Punkt 5).
     */
    const ergebnis = lesEinCsv(new TextEncoder().encode("a,b;c\n"), ",");

    expect(ergebnis.ok ? ergebnis.daten.trennzeichen : "").toBe(",");
    expect(ergebnis.ok ? ergebnis.daten.spalten : []).toEqual(["a", "b;c"]);
  });

  it("eine kuerzere Zeile ist kein Fehler, sondern eine kurze Zeile", () => {
    // `parse-csv.ts:42` (`relax_column_count: true`).
    const ergebnis = lesEinCsv(new TextEncoder().encode("ISSI;Rufname;Typ\n1001;Florian\n"));

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ok ? ergebnis.daten.zeilen : []).toEqual([["1001", "Florian"]]);
  });

  it("leere Zeilen werden uebersprungen und Felder getrimmt", () => {
    // `parse-csv.ts:40-41` (`trim: true`, `skip_empty_lines: true`).
    const ergebnis = lesEinCsv(new TextEncoder().encode("ISSI;Rufname\r\n\r\n 1001 ; Florian \r\n\r\n"));

    expect(ergebnis.ok ? ergebnis.daten.spalten : []).toEqual(["ISSI", "Rufname"]);
    expect(ergebnis.ok ? ergebnis.daten.zeilen : []).toEqual([["1001", "Florian"]]);
  });

  it("ein Anfuehrungszeichen mitten im Feld maskiert nicht, es ist ein Zeichen", () => {
    /*
     * `csv-parse` geht nur dann in den maskierten Zustand, wenn das Anfuehrungszeichen das
     * ERSTE Zeichen des Feldes ist. Eine grosszuegigere Bedingung (`feld.trim() === ""`)
     * schluckt die Anfuehrungszeichen einer Zelle wie ` "zitiert" mehr` und liefert
     * `zitiert mehr` — gemessen, bevor die Bedingung auf `feld === ""` verschaerft wurde.
     * Der Unterschied traefe jedes Notizfeld, in dem jemand ein Zitat setzt.
     */
    const ergebnis = lesEinCsv(new TextEncoder().encode('ISSI;Notizen\n1001; "zitiert" mehr\n'));

    expect(ergebnis.ok ? ergebnis.daten.zeilen : []).toEqual([["1001", '"zitiert" mehr']]);
  });

  it("ein maskiertes Feld behaelt seinen Leerraum, und das CR einer CRLF-Datei faellt weg", () => {
    /*
     * ZWEI Zusicherungen, die bis Fix-Runde 1 nur im Kommentar standen (Review V9, Fund F7
     * Punkte 1 und 2) — eine Fixture faerbt beide:
     *
     * 1. ⛔ `trim` WIRKT NUR AUF UNMASKIERTE FELDER, genau wie bei `csv-parse`
     *    (`parse-csv.ts:40`). Ein bewusst gesetzter Abstand in Anfuehrungszeichen bleibt.
     *    Ohne die Unterscheidung (`zeile.push(warMaskiert ? feld : feld.trim())` -> immer
     *    `trim()`) verschwaende er still.
     * 2. ⛔ DAS CR EINER CRLF-DATEI FAELLT WEG. Ausserhalb der Maskierung erledigt das ohnehin
     *    der Feldschnitt; im maskiert GEWESENEN Feld nicht — dort haengte das CR am Wert.
     *    Deshalb steht der Fall auf einer CRLF-Datei MIT maskiertem Feld, sonst prueft er
     *    wieder nur den Feldschnitt.
     */
    const ergebnis = lesEinCsv(new TextEncoder().encode('ISSI;Notizen\r\n1001;" Abstand "\r\n'));

    expect(ergebnis.ok ? ergebnis.daten.zeilen : []).toEqual([["1001", " Abstand "]]);
  });

  it("eine Windows-1252-Datei wird als solche gelesen, nicht als kaputtes UTF-8", () => {
    /*
     * ⬜ BENANNTE ABWEICHUNG, EIGENTUEMER BETREIBER: `chardet` und `iconv-lite` sind im Repo
     * gemessen NICHT vorhanden (`grep -n "chardet\|iconv" package.json` ohne Treffer,
     * Vorabscan-Fund F20). Statt eines stillen `pnpm add` steht hier der Rueckfall aus F20s
     * Vorschlag: UTF-8 mit BOM-Erkennung, und wenn die Bytes kein gueltiges UTF-8 sind,
     * Windows-1252.
     *
     * ⚠️ WAS DER RUECKFALL NICHT KANN und was `chardet` koennte: eine Datei in einer DRITTEN
     * Kodierung (etwa ISO-8859-15 oder UTF-16) erkennen. UTF-16 ohne BOM und Latin-9 kommen
     * hier als Windows-1252 an. Das ist der gemessene Verlust.
     */
    // "Gerät" in Windows-1252: das ä ist ein einzelnes Byte 0xE4 — kein gueltiges UTF-8.
    const bytes = new Uint8Array([0x47, 0x65, 0x72, 0xe4, 0x74, 0x3b, 0x49, 0x53, 0x53, 0x49, 0x0a]);
    const ergebnis = lesEinCsv(bytes);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ok ? ergebnis.daten.spalten : []).toEqual(["Gerät", "ISSI"]);
    expect(ergebnis.ok ? ergebnis.daten.kodierung : "").toBe("windows-1252");
  });

  it("die Dekodierung streift ein fuehrendes BOM ab", () => {
    /*
     * `decode-csv.ts:21-24`. Ohne das traegt die erste Kopfzeile ein unsichtbares Zeichen,
     * normalisiert zu etwas anderem und faellt aus der Zuordnung — der Import verloere still
     * ausgerechnet die ISSI-Spalte.
     *
     * ⛔ DIESER FALL PRUEFT `dekodiereCsv` UND NICHT `lesEinCsv`, UND DER GRUND IST GEMESSEN:
     * ueber `lesEinCsv` bliebe er auch OHNE die Abstreifung gruen (Sonde S-V9h, erste
     * Messung: `20 passed`), weil JavaScripts `trim()` U+FEFF als WhiteSpace mitentfernt
     * (`node -e '"﻿ISSI".trim() === "ISSI"'` -> `true`) und `zerlege` jedes unmaskierte
     * Feld trimmt. Ein Fall auf `lesEinCsv` maesse also den Feldschnitt und behauptete, das
     * BOM zu pruefen — genau die Fehlerform, gegen die die Sondenauflage steht.
     */
    const mitBom = dekodiereCsv(new TextEncoder().encode("﻿ISSI;Rufname\n1001;Florian\n"));

    expect(mitBom?.text.charCodeAt(0), "das BOM steht noch am Anfang").not.toBe(0xfeff);
    expect(mitBom?.text.startsWith("ISSI;Rufname")).toBe(true);
    expect(mitBom?.kodierung).toBe("UTF-8");
  });

  it("eine UTF-8-Datei mit BOM kommt mit sauberen Kopfzeilen an", () => {
    // Die Gegenprobe auf dem ganzen Weg — der eigene Export schreibt dieses BOM.
    const ergebnis = lesEinCsv(new TextEncoder().encode("﻿ISSI;Rufname\n1001;Florian\n"));

    expect(ergebnis.ok ? ergebnis.daten.spalten : []).toEqual(["ISSI", "Rufname"]);
    expect(ergebnis.ok ? ergebnis.daten.kodierung : "").toBe("UTF-8");
  });
});
