import { inflateRawSync } from "node:zlib";

/**
 * DAS PRÜFHARNESS FÜR EXCEL-AUSGABEN (DRK-186) — eine Stelle, kein zweites
 * erfinden (dieselbe Regel wie `qr/_lib/test-dom.tsx`).
 *
 * ⚠️ WARUM ES ÜBERHAUPT EINES BRAUCHT: eine `.xlsx` ist ein ZIP-Archiv. Ein
 * Test, der nur Statuszeile und Kopfzeilen prüft, ist grün, sobald irgendwelche
 * Bytes herauskommen — auch bei einer Mappe voller leerer Zellen. Erst wer
 * auspackt, prüft den Inhalt.
 *
 * ⛔ DER NAHELIEGENDE ZIP-LESER TRÄGT NICHT, und sein Fehler sieht aus wie eine
 * kaputte Datei: `write-excel-file` schreibt STRÖMEND, setzt also Bit 3 des
 * Flag-Feldes und lässt gepackte wie ungepackte Größe im LOKALEN Dateikopf auf
 * 0 — die echten Zahlen stehen erst im Datendeskriptor HINTER den Daten. Wer
 * den lokalen Kopf liest, inflatiert null Bytes und bekommt „unexpected end of
 * file" (gemessen). Das zentrale Verzeichnis am Dateiende führt beide Größen
 * und den Versatz jedes Eintrags; deshalb läuft dieser Leser darüber.
 *
 * NUR FÜR TESTS. Es ist kein allgemeiner ZIP-Leser: ZIP64, verschlüsselte oder
 * mehrteilige Archive kommen hier nicht vor.
 */

/** Jeder Eintrag der Mappe unter seinem Pfad (`xl/worksheets/sheet1.xml`, …). */
export function entpackeMappe(bytes: Uint8Array): Map<string, string> {
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Das Ende des zentralen Verzeichnisses (`PK\x05\x06`) steht am Dateiende,
  // gefolgt von einem Kommentar variabler Länge — deshalb rückwärts gesucht.
  let eocd = bytes.byteLength - 22;
  while (eocd >= 0 && sicht.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("[export] kein ZIP: zentrales Verzeichnis fehlt");

  const anzahl = sicht.getUint16(eocd + 10, true);
  let eintrag = sicht.getUint32(eocd + 16, true);

  const inhalt = new Map<string, string>();
  for (let n = 0; n < anzahl; n += 1) {
    const verfahren = sicht.getUint16(eintrag + 10, true);
    const gepackt = sicht.getUint32(eintrag + 20, true);
    const namensLaenge = sicht.getUint16(eintrag + 28, true);
    const zusatzLaenge = sicht.getUint16(eintrag + 30, true);
    const kommentarLaenge = sicht.getUint16(eintrag + 32, true);
    const lokal = sicht.getUint32(eintrag + 42, true);

    const name = Buffer.from(
      bytes.subarray(eintrag + 46, eintrag + 46 + namensLaenge),
    ).toString("utf8");

    // Im lokalen Kopf sind nur die beiden LÄNGENFELDER verlässlich; sie sagen,
    // wo die Daten beginnen.
    const ab = lokal + 30 + sicht.getUint16(lokal + 26, true) + sicht.getUint16(lokal + 28, true);
    const roh = bytes.subarray(ab, ab + gepackt);
    inhalt.set(
      name,
      Buffer.from(verfahren === 8 ? inflateRawSync(roh) : roh).toString("utf8"),
    );

    eintrag += 46 + namensLaenge + zusatzLaenge + kommentarLaenge;
  }
  return inhalt;
}

/** Der gesamte XML-Text der Mappe an einem Stück — für „steht das drin?". */
export function mappenText(bytes: Uint8Array): string {
  return [...entpackeMappe(bytes).values()].join("\n");
}

/**
 * Die Zeichenketten der Mappe in Reihenfolge ihres ersten Auftretens.
 *
 * ⚠️ NICHT DIE ZELLEN EINES BLATTES. Excel legt jede Zeichenkette EINMAL in
 * `xl/sharedStrings.xml` ab und verweist aus den Blättern nur noch per Index —
 * eine Zeichenkette, die in zwei Zellen steht, kommt hier einmal vor. Für die
 * Frage „welche Köpfe trägt die Mappe, in welcher Reihenfolge?" ist das genau
 * richtig; für „was steht in Zeile 7, Spalte C?" ist es das nicht.
 */
export function zeichenketten(bytes: Uint8Array): string[] {
  const xml = entpackeMappe(bytes).get("xl/sharedStrings.xml") ?? "";
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) =>
    m[1]
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&amp;", "&"),
  );
}

/** Die Blattnamen der Mappe in ihrer Reihenfolge. */
export function blattnamen(bytes: Uint8Array): string[] {
  const xml = entpackeMappe(bytes).get("xl/workbook.xml") ?? "";
  return [...xml.matchAll(/<sheet[^>]*\sname="([^"]*)"/g)].map((m) =>
    m[1].replaceAll("&amp;", "&"),
  );
}

/** Der Rumpf einer Antwort als Bytes. */
export async function mappenBytes(antwort: Response): Promise<Uint8Array> {
  return new Uint8Array(await antwort.arrayBuffer());
}

/** `A` → 0, `B` → 1, … `AA` → 26. Eine Zelle nennt ihre Spalte als Buchstaben,
 *  und leere Zellen fehlen im XML ganz — ohne diese Rechnung rutschte alles
 *  hinter einer leeren Zelle um eine Spalte nach links. */
function spaltenIndex(bezug: string): number {
  const buchstaben = bezug.replace(/\d+$/, "");
  let n = 0;
  for (const z of buchstaben) n = n * 26 + (z.charCodeAt(0) - 64);
  return n - 1;
}

function entschaerfe(s: string): string {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * Die Zellen EINES Blattes als Raster — Zahlen als `number`, Text als `string`,
 * leere Zellen als `null`.
 *
 * ⚠️ DAS IST DIE ZUSICHERUNG, DIE `zeichenketten()` NICHT GEBEN KANN. Dort
 * steht jede Zeichenkette nur EINMAL (Excel legt sie gemeinsam ab) und ohne
 * Ort; wer prüfen will, dass in Zeile 3 unter „Insgesamt?" eine 1,0 steht — und
 * NICHT die Zeichenkette „1,0" —, braucht das Raster.
 *
 * `blattIndex` zählt in der Reihenfolge von `blattnamen()`.
 *
 * ⚠️ EINE ABSCHLIESSEND LEERE ZELLE STEHT IN DER DATEI GAR NICHT, und das ist
 * der Unterschied zur CSV, der einen Test sonst stundenlang beschäftigt: dort
 * trug jede Zeile gleich viele Felder (`a,b,,`), hier endet die Zeile einfach
 * nach der letzten gefüllten Zelle. Gemessen an einer Zeile mit leerer
 * Schlussspalte: `[5]` statt `[5, null]` — eine Zusicherung auf die Spaltenzahl
 * fällt, obwohl die Mappe richtig ist. Verschoben ist dabei nichts: jede Zelle
 * nennt ihre Spalte selbst (`r="E2"`), und eine Kalkulation zeigt die fehlenden
 * als leer.
 *
 * Deshalb füllt dieser Leser JEDE Zeile auf die Breite der breitesten auf — das
 * ist die Kopfzeile, denn ein Spaltenkopf ist nie leer. Damit vergleicht ein
 * Test wieder Rechteck gegen Rechteck, ohne dass die Auffüllung eine
 * Verschiebung verbergen könnte: die Orte stammen weiterhin aus `r=`.
 */
export function blattZellen(
  bytes: Uint8Array,
  blattIndex = 0,
): (string | number | null)[][] {
  const eintraege = entpackeMappe(bytes);
  const geteilt = zeichenketten(bytes);
  const xml = eintraege.get(`xl/worksheets/sheet${blattIndex + 1}.xml`);
  if (xml === undefined) throw new Error(`[export] Blatt ${blattIndex} fehlt in der Mappe`);

  const raster = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((zeile) => {
    const zellen: (string | number | null)[] = [];
    for (const m of zeile[1].matchAll(/<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const attribute = m[1];
      const rumpf = m[3] ?? "";
      const i = spaltenIndex(/\br="([A-Z]+\d+)"/.exec(attribute)?.[1] ?? "A1");
      while (zellen.length < i) zellen.push(null);

      const typ = /\bt="([^"]+)"/.exec(attribute)?.[1];
      const roh = /<v>([\s\S]*?)<\/v>/.exec(rumpf)?.[1];
      if (roh === undefined && typ !== "inlineStr") {
        zellen[i] = null;
      } else if (typ === "s") {
        zellen[i] = geteilt[Number(roh)] ?? null;
      } else if (typ === "inlineStr") {
        zellen[i] = entschaerfe(/<t[^>]*>([\s\S]*?)<\/t>/.exec(rumpf)?.[1] ?? "");
      } else if (typ === "str") {
        zellen[i] = entschaerfe(roh ?? "");
      } else {
        zellen[i] = Number(roh);
      }
    }
    return zellen;
  });

  const breite = raster.reduce((max, z) => Math.max(max, z.length), 0);
  for (const zeile of raster) while (zeile.length < breite) zeile.push(null);
  return raster;
}
