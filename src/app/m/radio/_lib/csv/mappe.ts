// src/app/m/radio/_lib/csv/mappe.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`); der Scan darueber steht in
// `src/app/m/radio/riegel.test.ts`, Abschnitt „keine Bauform-Direktive unter _lib/ und _db/".
//
// ⛔ DIE EXCEL-HAELFTE DES RUNDLAUFS (DRK-389): `baueExportBlatt` schreibt die Geraeteliste als
// Mappe, `lesEinMappe` liest eine Mappe zurueck in dieselbe Form, die der CSV-Leser liefert
// (Kopfzeile plus Rohzeilen aus Zeichenketten). Ab da laeuft alles ueber denselben Weg:
// automatische Spaltenzuordnung, `zeileZuEingehend`, Klassifikation.
//
// ⛔ SERVERSEITIG, UND DIESMAL GEMESSEN: `node:zlib` entpackt die Mappe. Die Aufrufer sind der
// Export-Handler und der Hochladen-Handler — keine Client-Insel importiert diese Datei, und
// `ImportAssistent.test.tsx` haelt das fuer `einlesen.ts` fest, das hierher weiterreicht.
//
// ⛔ KEINE NEUE ABHAENGIGKEIT. `read-excel-file` waere das Gegenstueck zu `write-excel-file`;
// eine neue Abhaengigkeit ist aber eine Entscheidung, keine Nebenwirkung (dieselbe Linie wie
// `chardet`/`iconv-lite` in `einlesen.ts`). Der Leser hier kennt genau das, was eine Geraeteliste
// braucht: das ERSTE Blatt, Text, Zahlen, Wahrheitswerte und Datumszellen.
import { inflateRawSync } from "node:zlib";
import { blatt, type ExportSpalte as MappenSpalte, type FertigesBlatt } from "@/core/export/spalten";
import type { Geraet } from "../../_db/schema";
import { EXPORT_SPALTEN, formatiereZelle, type ExportFeld } from "./spalten";

/** Der Name des einen Blattes der Exportmappe. */
export const EXPORT_BLATTNAME = "Funkgeräte";

/** Der Dateiname der Exportmappe; der Ausloeser in der Werkzeugleiste gibt keinen eigenen vor. */
export const EXPORT_DATEINAME = "funkgeraete-export.xlsx";

/**
 * Baut das eine Blatt der Exportmappe: die neunzehn Kopfzeilen aus `EXPORT_SPALTEN`, je Geraet
 * eine Zeile ueber `formatiereZelle`.
 *
 * ⛔ JEDE ZELLE IST TEXT, AUCH ISSI UND TEI. `formatiereZelle` liefert Zeichenketten, und
 * `blatt()` legt sie als Textzellen ab. Als Zahlzelle verloere eine TEI ihre fuehrende Null,
 * und eine 14-stellige Zahl zeigte Excel in Exponentialschreibweise — der Rundlauf braeche
 * still an genau dem Feld, an dem ein Geraet wiedererkannt wird.
 *
 * ⛔ DIESELBE FUNKTION FUER HANDLER UND RUNDLAUFTEST — eine zweite Zusammensetzung im Handler
 * waere ein zweiter Vertrag ohne zweiten Waechter.
 */
export function baueExportBlatt(geraete: readonly Pick<Geraet, ExportFeld>[]): FertigesBlatt {
  const spalten: MappenSpalte<Pick<Geraet, ExportFeld>>[] = EXPORT_SPALTEN.map((spalte) => ({
    kopf: spalte.kopf,
    wert: (geraet) => formatiereZelle(spalte.feld, geraet[spalte.feld]),
  }));
  return blatt(EXPORT_BLATTNAME, spalten, geraete);
}

/** Die ersten vier Bytes jedes ZIP-Archivs (`PK\x03\x04`) — und damit jeder `.xlsx`. */
const ZIP_KOPF = [0x50, 0x4b, 0x03, 0x04] as const;

/**
 * Ist das eine Mappe? Entschieden am Inhalt, nicht an Dateiname oder Medientyp.
 *
 * ⚠️ DIE ENDUNG TRUEGE: Browser melden fuer `.csv` je nach System `text/csv`,
 * `application/vnd.ms-excel` oder gar nichts, und wer eine Mappe umbenennt, aendert die Bytes
 * nicht. Eine Textdatei beginnt nie mit diesen vier Bytes — `P`, `K` und zwei Steuerzeichen.
 */
export function istMappe(bytes: Uint8Array): boolean {
  return ZIP_KOPF.every((wert, i) => bytes[i] === wert);
}

/** Eine eingelesene Mappe in der Form des CSV-Lesers. */
export type EingeleseneMappe = { spalten: string[]; zeilen: string[][] };

/**
 * ⛔ OBERGRENZE JE ENTPACKTEM EINTRAG. Eine Mappe ist ein ZIP, und ein ZIP kann aus wenigen
 * Kilobyte Gigabyte machen. Eine Geraeteliste mit zehntausend Zeilen bleibt weit darunter.
 */
const HOECHSTENS_ENTPACKT = 32 * 1024 * 1024;

type Eintrag = { verfahren: number; ab: number; gepackt: number };

/**
 * Liest das zentrale Verzeichnis am Dateiende — wie `core/export/test-mappe.ts`, und aus
 * demselben Grund: `write-excel-file` schreibt stroemend und laesst die Groessen im LOKALEN
 * Kopf auf 0. Nur das zentrale Verzeichnis fuehrt sie immer.
 */
function verzeichnis(bytes: Uint8Array): Map<string, Eintrag> {
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let ende = bytes.byteLength - 22;
  while (ende >= 0 && sicht.getUint32(ende, true) !== 0x06054b50) ende -= 1;
  if (ende < 0) throw new Error("kein zentrales Verzeichnis");

  const anzahl = sicht.getUint16(ende + 10, true);
  let stelle = sicht.getUint32(ende + 16, true);
  const eintraege = new Map<string, Eintrag>();
  for (let n = 0; n < anzahl; n += 1) {
    if (sicht.getUint32(stelle, true) !== 0x02014b50) throw new Error("Verzeichniseintrag kaputt");
    const verfahren = sicht.getUint16(stelle + 10, true);
    const gepackt = sicht.getUint32(stelle + 20, true);
    const namensLaenge = sicht.getUint16(stelle + 28, true);
    const zusatzLaenge = sicht.getUint16(stelle + 30, true);
    const kommentarLaenge = sicht.getUint16(stelle + 32, true);
    const lokal = sicht.getUint32(stelle + 42, true);
    // ZIP64 kennzeichnet sich durch 0xFFFFFFFF; eine Geraeteliste kommt nie in die Naehe.
    if (gepackt === 0xffffffff || lokal === 0xffffffff) throw new Error("ZIP64 wird nicht gelesen");
    if (sicht.getUint32(lokal, true) !== 0x04034b50) throw new Error("lokaler Kopf kaputt");

    const name = new TextDecoder().decode(bytes.subarray(stelle + 46, stelle + 46 + namensLaenge));
    const ab = lokal + 30 + sicht.getUint16(lokal + 26, true) + sicht.getUint16(lokal + 28, true);
    eintraege.set(name.replace(/^\//, ""), { verfahren, ab, gepackt });
    stelle += 46 + namensLaenge + zusatzLaenge + kommentarLaenge;
  }
  return eintraege;
}

/** Ein Eintrag als Text; `undefined`, wenn es ihn nicht gibt. */
function eintragText(bytes: Uint8Array, eintraege: Map<string, Eintrag>, pfad: string): string | undefined {
  const eintrag = eintraege.get(pfad);
  if (eintrag === undefined) return undefined;
  const roh = bytes.subarray(eintrag.ab, eintrag.ab + eintrag.gepackt);
  if (eintrag.verfahren === 0) return new TextDecoder().decode(roh);
  if (eintrag.verfahren === 8) {
    return new TextDecoder().decode(inflateRawSync(roh, { maxOutputLength: HOECHSTENS_ENTPACKT }));
  }
  throw new Error(`Packverfahren ${eintrag.verfahren} wird nicht gelesen`);
}

/**
 * Ein Attribut eines Starttags. `name` darf ein Praefix tragen (`r:id`); Generatoren
 * schreiben Attribute mit einfachen wie doppelten Anfuehrungszeichen.
 */
const ATTRIBUT_MUSTER = new Map<string, RegExp>();

function attribut(attribute: string, name: string): string | undefined {
  // Je Name EIN Muster: eine Mappe mit zehntausend Zeilen fragt je Zelle drei Attribute ab.
  let muster = ATTRIBUT_MUSTER.get(name);
  if (muster === undefined) {
    muster = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    ATTRIBUT_MUSTER.set(name, muster);
  }
  const treffer = muster.exec(attribute);
  return treffer === null ? undefined : entschaerfe(treffer[1] ?? treffer[2] ?? "");
}

/**
 * XML-Entitaeten und die OOXML-Maskierung `_xHHHH_` aufloesen.
 *
 * ⚠️ `_xHHHH_` IST KEIN XML, SONDERN EXCEL: Steuerzeichen, die XML nicht tragen kann, schreibt
 * Excel so (`_x000D_` fuer CR). Ohne die Aufloesung stuende der Maskentext im Geraetefeld.
 */
function entschaerfe(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dez: string) => String.fromCodePoint(Number(dez)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Der Text eines Zeichenkettenelements (`<si>` oder `<is>`): alle `<t>` hintereinander.
 *
 * ⛔ `<rPh>` FAELLT VORHER HERAUS — es traegt die phonetische Lesung japanischer Zellen und
 * enthaelt selbst `<t>`-Elemente. Mitgelesen stuende die Lesung verdoppelt im Wert.
 */
function zeichenkettenText(xml: string): string {
  const ohneLesung = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let text = "";
  for (const t of ohneLesung.matchAll(/<(?:\w+:)?t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) {
    text += entschaerfe(t[1] ?? "");
  }
  return text;
}

/** Die Beziehungen einer `.rels`-Datei: Id → { Typ, Ziel }. */
function beziehungen(xml: string | undefined): Map<string, { typ: string; ziel: string }> {
  const ergebnis = new Map<string, { typ: string; ziel: string }>();
  for (const b of (xml ?? "").matchAll(/<(?:\w+:)?Relationship\b([^>]*)>/g)) {
    const id = attribut(b[1], "Id");
    const ziel = attribut(b[1], "Target");
    if (id !== undefined && ziel !== undefined) {
      ergebnis.set(id, { typ: attribut(b[1], "Type") ?? "", ziel });
    }
  }
  return ergebnis;
}

/** Loest ein Beziehungsziel gegen den Ordner der Quelldatei auf (`worksheets/sheet1.xml`). */
function aufloesen(ordner: string, ziel: string): string {
  const teile = ziel.startsWith("/") ? [] : ordner.split("/").filter(Boolean);
  for (const teil of ziel.split("/")) {
    if (teil === "" || teil === ".") continue;
    if (teil === "..") teile.pop();
    else teile.push(teil);
  }
  return teile.join("/");
}

function ordnerVon(pfad: string): string {
  return pfad.includes("/") ? pfad.slice(0, pfad.lastIndexOf("/")) : "";
}

/**
 * Die eingebauten Zahlformate, die ein DATUM zeigen (ECMA-376 Teil 1, 18.8.30, plus die
 * ostasiatischen 27–36 und 50–58). ⚠️ 18–21 und 45–47 sind reine UHRZEITEN und fehlen
 * absichtlich: eine Uhrzeit ist kein Kalendertag.
 */
const DATUMSFORMATE = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/**
 * Zeigt ein eigenes Zahlformat ein Datum? Zitierter Text, Klammerteile (`[$-407]`, `[Red]`)
 * und maskierte Zeichen zaehlen nicht; uebrig bleiben die Platzhalter. `d` oder `y` heisst
 * Datum; ein `m` ohne `h`/`s` daneben ist der Monat, nicht die Minute.
 */
function istDatumsformat(code: string): boolean {
  const platzhalter = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[\\_*]./g, "")
    .toLowerCase();
  if (/[dy]/.test(platzhalter)) return true;
  return /m/.test(platzhalter) && !/[hs]/.test(platzhalter);
}

/** Fuer jeden Zellstil (`s="N"`): zeigt er ein Datum? */
function datumsstile(xml: string | undefined): boolean[] {
  if (xml === undefined) return [];
  const eigene = new Map<number, string>();
  for (const f of xml.matchAll(/<(?:\w+:)?numFmt\b([^>]*)>/g)) {
    const id = attribut(f[1], "numFmtId");
    const code = attribut(f[1], "formatCode");
    if (id !== undefined && code !== undefined) eigene.set(Number(id), code);
  }
  const zellstile = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml)?.[1] ?? "";
  return [...zellstile.matchAll(/<(?:\w+:)?xf\b([^>]*)>/g)].map((xf) => {
    const id = Number(attribut(xf[1], "numFmtId") ?? "0");
    const code = eigene.get(id);
    return code === undefined ? DATUMSFORMATE.has(id) : istDatumsformat(code);
  });
}

/**
 * Eine Excel-Tageszahl als Kalendertag `YYYY-MM-DD`.
 *
 * ⛔ OHNE ZONE, UND DAS IST RICHTIG: die Tageszahl IST ein Kalendertag, keine Zeitspanne seit
 * einem Zeitpunkt. Gerechnet wird deshalb in UTC, wo kein Tag verrutscht — derselbe Fall wie
 * „ein Kalendertag, der als Mitternacht UTC gespeichert ist" in `CLAUDE.md`, Abschnitt Zeitzone.
 * Ein Uhrzeitanteil wird abgeschnitten, nicht gerundet: 23:59 ist noch derselbe Tag.
 *
 * ⚠️ OHNE DIESE UMRECHNUNG kaeme eine Datumszelle als `46204` beim Import an — und
 * `tagAusWert` liest eine reine Zahl als MILLISEKUNDEN, das Geraet stuende still auf dem
 * 1. Januar 1970.
 */
function tagAusSeriennummer(zahl: number, basis1904: boolean): string | null {
  if (!Number.isFinite(zahl) || zahl < 1) return null;
  const tage = Math.floor(zahl) + (basis1904 ? 1462 : 0);
  return new Date(Date.UTC(1899, 11, 30) + tage * 86_400_000).toISOString().slice(0, 10);
}

/** `A` → 0, `B` → 1, … `AA` → 26. */
function spaltenIndex(bezug: string): number {
  let n = 0;
  for (const zeichen of bezug.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (zeichen.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Liest das ERSTE Blatt einer Mappe als Kopfzeile plus Rohzeilen.
 *
 * ⛔ DIESELBEN ZUSAGEN WIE `zerlege` IN `einlesen.ts`, uebersetzt auf Zellen:
 *
 *   - jede Zelle getrimmt (eine Mappe kennt keine Maskierung, jede Zelle ist „unmaskiert");
 *   - eine Zeile ohne einen einzigen Wert faellt weg (`skip_empty_lines`);
 *   - eine kuerzere Zeile ist eine kurze Zeile — Excel schreibt leere Schlusszellen gar nicht,
 *     `zeileZuEingehend` liest die fehlenden als `null` (`relax_column_count`);
 *   - eine LUECKE mitten in der Zeile wird mit `""` gefuellt, denn jede Zelle nennt ihre
 *     Spalte selbst (`r="E2"`). Ohne die Fuellung rutschte alles dahinter nach links.
 *
 * ⛔ ZELLTYPEN: gemeinsame und eingebettete Zeichenketten woertlich; ein Wahrheitswert wird
 * `true`/`false` (beides kennt `normalisiereWahrheitswert`); eine Fehlerzelle (`#NV`) wird
 * leer; eine Zahl mit Datumsformat wird der Kalendertag, jede andere Zahl ihre kuerzeste
 * Dezimalschreibung (`6.0999999999999996` → `6.1`).
 *
 * Wirft bei einer kaputten Mappe; `lesEinDatei` in `einlesen.ts` macht daraus die Meldung.
 */
export function lesEinMappe(bytes: Uint8Array): EingeleseneMappe | null {
  const eintraege = verzeichnis(bytes);
  const lies = (pfad: string) => eintragText(bytes, eintraege, pfad);

  // Der Weg zur Arbeitsmappe steht in `_rels/.rels`; `xl/workbook.xml` ist nur die Gewohnheit.
  const wurzel = [...beziehungen(lies("_rels/.rels")).values()].find((b) => b.typ.endsWith("/officeDocument"));
  const mappenPfad = wurzel === undefined ? "xl/workbook.xml" : aufloesen("", wurzel.ziel);
  const mappenXml = lies(mappenPfad);
  if (mappenXml === undefined) throw new Error("keine Arbeitsmappe");
  const mappenOrdner = ordnerVon(mappenPfad);
  const verweise = beziehungen(
    lies(aufloesen(mappenOrdner, `_rels/${mappenPfad.slice(mappenOrdner.length).replace(/^\//, "")}.rels`)),
  );
  const nachTyp = (endung: string) => {
    const b = [...verweise.values()].find((v) => v.typ.endsWith(endung));
    return b === undefined ? undefined : lies(aufloesen(mappenOrdner, b.ziel));
  };

  const basis1904 = /<(?:\w+:)?workbookPr\b[^>]*\sdate1904\s*=\s*["'](?:1|true)["']/.test(mappenXml);
  const erstesBlatt = /<(?:\w+:)?sheet\b([^>]*)>/.exec(mappenXml);
  const blattId = erstesBlatt === null ? undefined : attribut(erstesBlatt[1], "(?:\\w+:)?id");
  const blattZiel = blattId === undefined ? undefined : verweise.get(blattId)?.ziel;
  const blattXml = lies(blattZiel === undefined ? "xl/worksheets/sheet1.xml" : aufloesen(mappenOrdner, blattZiel));
  if (blattXml === undefined) throw new Error("kein Blatt");

  // `<si/>` ist eine leere Zeichenkette und zaehlt mit — ueberlesen verschoebe es jeden Index dahinter.
  const geteilt = [
    ...(nachTyp("/sharedStrings") ?? "").matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g),
  ].map((si) => zeichenkettenText(si[1] ?? ""));
  const datum = datumsstile(nachTyp("/styles"));

  const saetze: string[][] = [];
  for (const zeile of blattXml.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const zellen: string[] = [];
    for (const zelle of (zeile[1] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attribute = zelle[1];
      const rumpf = zelle[2] ?? "";
      const bezug = attribut(attribute, "r");
      const index = bezug === undefined ? zellen.length : spaltenIndex(bezug);
      while (zellen.length < index) zellen.push("");

      const typ = attribut(attribute, "t") ?? "n";
      const roh = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(rumpf)?.[1];
      let wert = "";
      if (typ === "inlineStr") {
        wert = zeichenkettenText(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(rumpf)?.[1] ?? "");
      } else if (roh === undefined || typ === "e") {
        wert = "";
      } else if (typ === "s") {
        wert = geteilt[Number(roh)] ?? "";
      } else if (typ === "str") {
        wert = entschaerfe(roh);
      } else if (typ === "b") {
        wert = roh.trim() === "1" ? "true" : "false";
      } else if (typ === "d") {
        wert = entschaerfe(roh).slice(0, 10);
      } else {
        const zahl = Number(roh);
        const stil = Number(attribut(attribute, "s") ?? "0");
        wert = Number.isFinite(zahl)
          ? ((datum[stil] ? tagAusSeriennummer(zahl, basis1904) : null) ?? String(zahl))
          : entschaerfe(roh);
      }
      zellen[index] = wert.trim();
    }
    if (zellen.some((zelle) => zelle !== "")) saetze.push(zellen);
  }

  const [spalten, ...zeilen] = saetze;
  return spalten === undefined ? null : { spalten, zeilen };
}
