import { describe, expect, it } from "vitest";
import {
  MIME_ALLOWLIST,
  MIME_PRAEFIX_BYTES,
  type MimeBefund,
  pruefeInhaltstyp,
} from "./mime";

/*
 * DIE EINE ZUSAGE, GEGEN DIE HIER GEMESSEN WIRD (Spec §8.5, Plan T12):
 * `mime_type` traegt den FESTGESTELLTEN Typ, nicht den deklarierten — und ein
 * Inhalt, der nicht zur Allowlist passt, wird abgelehnt.
 *
 * DIE MUTATIONEN, DIE DIESE SUITE FANGEN MUSS — jede einzeln gedreht und rot
 * gesehen. Die Liste ist der Zettel fuer den naechsten Leser: was hier NICHT
 * steht, ist nicht bewacht.
 *  1. `typ: deklariert` statt `typ: festgestellt` zurueckgeben → die Gruppe
 *     "drei Richtungen" wird rot. Das ist die Kernzusage.
 *  2. `dateiname` ignorieren (Endung nie ansehen) → zweimal rot: die
 *     Abweichungsmeldung `endung` und der Textweg, dessen zweites
 *     Positivsignal die Endung IST. Deshalb hat `abweichungen` ein Recht auf
 *     sein Feld.
 *  3. Je eine Haelfte von `praefix.length === 0 || gesamtGroesse === 0`
 *     entfernen → beide Faelle sind EINZELN bewacht.
 *  4. Die WebP-Signatur nur an `RIFF` festmachen (Marke ab Offset 8 streichen)
 *     → ein WAV/AVI kaeme als `image/webp` durch.
 *  5. `lastIndexOf(".")` → `indexOf(".")` → die Doppelendung `bericht.jpg.txt`
 *     aus dem Altbestand faellt durch.
 *  6. `weg <= 3` in `istUtf8Text` auf 1 oder 2 senken → der Schnitt mitten in
 *     einem Emoji/CJK-Zeichen wird zur stillen Ablehnung.
 *  7. `ausDeklaration ?? ausEndung` drehen → im ZIP-Weg gewinnt die Endung und
 *     der `mime_type` in der DB ist das falsche Office-Format.
 *  8. Eine einzelne ISO-BMFF-Marke aus `HEIC_MARKEN`/`HEIF_MARKEN` entfernen →
 *     die gespiegelte Markenliste unten wird rot.
 *
 * Was hier NICHT geprueft werden kann: ob der Aufrufer die Zwischendatei nach
 * einer Ablehnung wirklich loescht. Das ist die Zusage von T27 Punkt 6 und T31
 * — diese Datei liefert nur den Befund, sie fasst keinen Pfad an.
 */

const enc = new TextEncoder();

/** Baut ein Bytepraefix aus Zahlen, ASCII-/UTF-8-Text und fertigen Puffern. */
function bytes(...teile: (number[] | string | Uint8Array)[]): Uint8Array {
  const alle: number[] = [];
  for (const teil of teile) {
    if (typeof teil === "string") alle.push(...enc.encode(teil));
    else alle.push(...teil);
  }
  return new Uint8Array(alle);
}

/**
 * Ein ZIP-Local-File-Header mit dem Eintragsnamen, den jeder OOXML-Erzeuger als
 * ersten Eintrag schreibt. Die 26 Nullbytes sind Version/Flags/Methode/Zeit/
 * CRC/Groessen — fuer die Signatur belanglos, fuer die Echtheit des Praefix
 * nicht: die Signatur darf nur an Offset 0 greifen.
 */
function zipMitEintrag(name: string): Uint8Array {
  return bytes([0x50, 0x4b, 0x03, 0x04], new Uint8Array(26), name);
}

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], [0x00, 0x10], "JFIF", [0x00]);
const PNG = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], [0x00, 0x00, 0x00, 0x0d], "IHDR");
const GIF87 = bytes("GIF87a", [0x10, 0x00, 0x10, 0x00]);
const GIF89 = bytes("GIF89a", [0x10, 0x00, 0x10, 0x00]);
const WEBP = bytes("RIFF", [0x1a, 0x00, 0x00, 0x00], "WEBPVP8 ");
// ISO-BMFF: Boxlaenge, `ftyp`, Hauptmarke ab Offset 8, danach die vertraeglichen Marken.
const HEIC = bytes([0x00, 0x00, 0x00, 0x18], "ftyp", "heic", [0x00, 0x00, 0x00, 0x00], "mif1heic");
const HEIF = bytes([0x00, 0x00, 0x00, 0x18], "ftyp", "mif1", [0x00, 0x00, 0x00, 0x00], "mif1heic");
const MP4 = bytes([0x00, 0x00, 0x00, 0x18], "ftyp", "isom", [0x00, 0x00, 0x02, 0x00], "isomiso2mp41");
const AVIF = bytes([0x00, 0x00, 0x00, 0x18], "ftyp", "avif", [0x00, 0x00, 0x00, 0x00], "avifmif1");
// RIFF-Container, die KEIN WebP sind: nach `RIFF` und der Laenge steht ab Offset
// 8 die Marke, und nur `WEBP` gehoert in die Allowlist.
const WAV = bytes("RIFF", [0x24, 0x08, 0x00, 0x00], "WAVEfmt ", [0x10, 0x00, 0x00, 0x00]);
const AVI = bytes("RIFF", [0x24, 0x08, 0x00, 0x00], "AVI LIST", [0x10, 0x00, 0x00, 0x00]);
const PDF = bytes("%PDF-1.7\n", [0x25, 0xe2, 0xe3, 0xcf, 0xd3], "\n1 0 obj\n");
const OOXML = zipMitEintrag("[Content_Types].xml");
const TEXT = "Lagemeldung 21:30 — alles ruhig, Uebergabe an die naechste Schicht.\n";
const HTML = '<!DOCTYPE html>\n<html><body><script>alert(document.domain)</script></body></html>\n';
const SVG = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>\n';
const EXE = bytes("MZ", [0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
const ELF = bytes([0x7f], "ELF", [0x02, 0x01, 0x01, 0x00]);

const DOCX_TYP = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_TYP = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX_TYP = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Kurzform: Praefix ist die ganze Datei (der Normalfall in diesen Tests). */
function pruefe(
  inhalt: Uint8Array | string,
  deklariert: string | null | undefined,
  dateiname: string,
): MimeBefund {
  const praefix = typeof inhalt === "string" ? enc.encode(inhalt) : inhalt;
  return pruefeInhaltstyp({
    praefix,
    gesamtGroesse: praefix.length,
    deklariert,
    dateiname,
  });
}

/**
 * Ein Textpraefix, das MITTEN im `ö` von "Größe" endet — das letzte Byte ist
 * `0xc3`, also der Anfang einer Zweibyte-Sequenz ohne ihr Folgebyte. Genau so
 * sieht das Praefix aus, wenn die Lesegrenze in ein Mehrbyte-Zeichen faellt.
 * (Ein blindes `slice(0, -1)` traf das nicht: die Zeichenkette endet auf `e`.)
 */
function mittenImUmlautGekappt(): Uint8Array {
  const ganz = enc.encode("Lagemeldung mit Größe");
  const gekappt = ganz.slice(0, 19);
  if (gekappt[gekappt.length - 1] !== 0xc3) {
    throw new Error("Vorrichtung kaputt: das Praefix endet nicht mit einem Sequenzanfang");
  }
  return gekappt;
}

/**
 * Ein Textpraefix, das nach `behalten` der VIER Bytes eines Emoji endet
 * (🚑 = f0 9f 9a 91). `mittenImUmlautGekappt` deckt nur den Schnitt nach EINEM
 * Byte ab; die Lesegrenze kann aber auch nach zwei oder drei Bytes fallen —
 * daran haengt die Konstante 3 in `istUtf8Text`. Die Selbstpruefung ist Pflicht:
 * ein stillschweigend falsches Praefix macht den Fall gegenstandslos, und genau
 * das ist die Fehlerklasse, die hier behoben wird.
 */
function mittenImEmojiGekappt(behalten: 1 | 2 | 3): Uint8Array {
  const ganz = enc.encode("Lagemeldung 🚑");
  const gekappt = ganz.slice(0, ganz.length - (4 - behalten));
  const erwartet = [0xf0, 0x9f, 0x9a].slice(0, behalten).join();
  const ende = [...gekappt.slice(gekappt.length - behalten)].join();
  if (ende !== erwartet) {
    throw new Error(`Vorrichtung kaputt: Praefix endet auf [${ende}] statt [${erwartet}]`);
  }
  return gekappt;
}

/*
 * Die zehn ISO-BMFF-Marken der Tabelle, HIER GESPIEGELT und ausdruecklich NICHT
 * aus `mime.ts` importiert: ueber die dortige Tabelle zu iterieren waere eine
 * Tautologie — wer eine Marke aus dem Code entfernt, entfernt damit auch ihren
 * Testfall, und die Suite bliebe gruen. Diese Liste besitzt die Aussage.
 */
const ISO_BMFF_MARKEN: readonly [marke: string, typ: string][] = [
  ["heic", "image/heic"],
  ["heix", "image/heic"],
  ["hevc", "image/heic"],
  ["hevx", "image/heic"],
  ["heim", "image/heic"],
  ["heis", "image/heic"],
  ["hevm", "image/heic"],
  ["hevs", "image/heic"],
  ["mif1", "image/heif"],
  ["msf1", "image/heif"],
];

/** Liefert den festgestellten Typ oder laesst den Test mit dem Grund scheitern. */
function typVon(befund: MimeBefund): string {
  if (!befund.ok) {
    throw new Error(`unerwartete Ablehnung: ${befund.grund} — ${befund.meldung}`);
  }
  return befund.typ;
}

describe("MIME_ALLOWLIST — die Vorlage, ihre Herkunft und ihre Form", () => {
  /*
   * §13.1 Frage 3 ist UNBEANTWORTET: die wirklich eingesetzte `ALLOWED_MIME`
   * des Servers kennt nur der Betreiber. Diese Tests halten deshalb nicht
   * "die richtige Liste" fest, sondern die HERKUNFT jedes Eintrags — damit
   * die Antwort des Betreibers eine Subtraktion ist und keine Suche.
   */
  it("enthaelt jeden Typ aus drops gemessener Vorlage (`.env.example:8`)", () => {
    const drop = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      DOCX_TYP,
      XLSX_TYP,
      "text/plain",
    ];
    const typen = MIME_ALLOWLIST.map((e) => e.typ);
    for (const typ of drop) expect(typen).toContain(typ);
  });

  it("enthaelt die drei Ergaenzungen aus Spec §8.5, und keine weiteren", () => {
    // §8.5 nennt zusaetzlich GIF, HEIC/HEIF und "ZIP-basierte Office-Formate"
    // (Plural, also auch pptx). Wer hier etwas hinzufuegt, ohne die Antwort auf
    // Frage 3 zu haben, oeffnet den Ausliefer-Weg — der Test ist die Bremse.
    expect(MIME_ALLOWLIST.map((e) => e.typ).sort()).toEqual(
      [
        "application/pdf",
        DOCX_TYP,
        PPTX_TYP,
        XLSX_TYP,
        "image/gif",
        "image/heic",
        "image/heif",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/plain",
      ].sort(),
    );
  });

  it("fuehrt weder `image/svg+xml` noch `text/html` — das ist die Zusage, nicht ein Versehen", () => {
    // Ein SVG ist ein ausfuehrbares Dokument im Origin der Fileshare-Domain
    // (§7.7). Beide Typen sind der Grund, aus dem diese Datei existiert.
    const typen = MIME_ALLOWLIST.map((e) => e.typ);
    expect(typen).not.toContain("image/svg+xml");
    expect(typen).not.toContain("text/html");
    expect(typen).not.toContain("application/zip");
    expect(typen).not.toContain("application/octet-stream");
  });

  it("jeder Eintrag traegt kleingeschriebene Endungen ohne Punkt", () => {
    for (const eintrag of MIME_ALLOWLIST) {
      expect(eintrag.endungen.length).toBeGreaterThan(0);
      for (const endung of eintrag.endungen) expect(endung).toMatch(/^[a-z0-9]{2,5}$/);
    }
  });

  it("`MIME_PRAEFIX_BYTES` reicht ueber die laengste Signaturstelle hinaus", () => {
    // Die weiteste Pruefstelle liegt bei der ISO-BMFF-Marke (Offset 8..12).
    // Der Wert ist zusaetzlich die Lesemenge fuer die UTF-8-Pruefung, deshalb
    // deutlich groesser — aber niemals kleiner als 12.
    expect(MIME_PRAEFIX_BYTES).toBeGreaterThanOrEqual(12);
  });
});

describe("pruefeInhaltstyp — echte Magic Bytes je Allowlist-Format (T12 Punkt 3)", () => {
  const faelle: [name: string, inhalt: Uint8Array | string, deklariert: string, datei: string, typ: string][] = [
    ["JPEG", JPEG, "image/jpeg", "einsatz.jpg", "image/jpeg"],
    ["PNG", PNG, "image/png", "lagekarte.png", "image/png"],
    ["GIF87a", GIF87, "image/gif", "ablauf.gif", "image/gif"],
    ["GIF89a", GIF89, "image/gif", "ablauf.gif", "image/gif"],
    ["WebP", WEBP, "image/webp", "gruppe.webp", "image/webp"],
    ["HEIC (Marke `heic`)", HEIC, "image/heic", "IMG_0042.heic", "image/heic"],
    ["HEIF (Marke `mif1`)", HEIF, "image/heif", "IMG_0043.heif", "image/heif"],
    ["PDF", PDF, "application/pdf", "bericht.pdf", "application/pdf"],
    ["DOCX", OOXML, DOCX_TYP, "protokoll.docx", DOCX_TYP],
    ["XLSX", OOXML, XLSX_TYP, "material.xlsx", XLSX_TYP],
    ["PPTX", OOXML, PPTX_TYP, "einweisung.pptx", PPTX_TYP],
    ["text/plain", TEXT, "text/plain", "meldung.txt", "text/plain"],
  ];

  for (const [name, inhalt, deklariert, datei, typ] of faelle) {
    it(`erkennt ${name} und meldet keine Abweichung`, () => {
      const befund = pruefe(inhalt, deklariert, datei);
      expect(typVon(befund)).toBe(typ);
      expect(befund.ok && befund.abweichungen).toEqual([]);
    });
  }

  it("erkennt eine Endung unabhaengig von der Schreibweise", () => {
    // Handys schreiben `IMG_0042.HEIC`, Kameras `DSC_0001.JPG`. Eine
    // Grossschreibung ist keine Abweichung, sondern dieselbe Endung.
    const befund = pruefe(JPEG, "image/jpeg", "DSC_0001.JPG");
    expect(typVon(befund)).toBe("image/jpeg");
    expect(befund.ok && befund.abweichungen).toEqual([]);
  });

  it.each(ISO_BMFF_MARKEN)("erkennt die ISO-BMFF-Marke `%s` als %s", (marke, typ) => {
    // Welche der zehn Marken ein Geraet schreibt, entscheidet das Geraet — nicht
    // wir. Faellt eine aus der Tabelle, faellt ein Teil der Handyfotos durch,
    // und zwar nur der Teil: ein Fehler, den kein Stichprobenfoto zeigt. Die
    // beiden Einzelfaelle oben (`heic`, `mif1`) liessen acht Marken unbewacht.
    const praefix = bytes(
      [0x00, 0x00, 0x00, 0x18],
      "ftyp",
      marke,
      [0x00, 0x00, 0x00, 0x00],
      "mif1heic",
    );
    const befund = pruefe(praefix, typ, "IMG_0050.heic");
    expect(typVon(befund)).toBe(typ);
    expect(befund.ok && befund.abweichungen).toEqual([]);
  });

  it("nimmt `.heic` fuer die Marke `mif1` und `.heif` fuer die Marke `heic` an", () => {
    // Kein Zugestaendnis, sondern gemessene Realitaet: iPhones schreiben
    // Dateien mit der generischen HEIF-Marke `mif1` unter der Endung `.heic`.
    // Eine getrennte Endungsmenge je Marke wuerde bei jedem zweiten Handyfoto
    // eine Abweichung melden, die keine ist.
    const befund = pruefe(HEIF, "image/heic", "IMG_0044.heic");
    expect(typVon(befund)).toBe("image/heif");
    // Die Endung ist keine Abweichung; die Deklaration `image/heic` schon,
    // denn festgestellt ist `image/heif` — und die Feststellung gewinnt.
    expect(befund.ok && befund.abweichungen).toEqual(["deklaration"]);
  });
});

describe("die drei Richtungen — und die Feststellung gewinnt (T12 Punkt 5)", () => {
  /*
   * DIESE GRUPPE TRAEGT DIE KERNZUSAGE. Wer `typ` aus der Deklaration statt aus
   * den Bytes fuellt, wird hier rot — und zwar in jedem einzelnen `it`.
   */
  it("nimmt bei falscher Deklaration den festgestellten Typ, nicht den deklarierten", () => {
    const befund = pruefe(JPEG, "image/png", "foto.png");
    expect(typVon(befund)).toBe("image/jpeg");
    expect(befund.ok && befund.abweichungen).toContain("deklaration");
  });

  it("meldet eine unpassende Endung als Abweichung, ohne abzulehnen", () => {
    // Der Anzeigename steckt in keinem Pfad (§5.1) und wird immer als
    // `attachment` + `nosniff` ausgeliefert (§7.7). Eine Umbenennung ist
    // deshalb kein Angriff, sondern Alltag — sie gehoert protokolliert, nicht
    // bestraft.
    const befund = pruefe(PNG, "image/png", "bild.jpg");
    expect(typVon(befund)).toBe("image/png");
    expect(befund.ok && befund.abweichungen).toEqual(["endung"]);
  });

  it("meldet beide Abweichungen, wenn Deklaration UND Endung daneben liegen", () => {
    const befund = pruefe(PDF, "image/jpeg", "bericht.docx");
    expect(typVon(befund)).toBe("application/pdf");
    expect(befund.ok && befund.abweichungen).toEqual(["deklaration", "endung"]);
  });

  it("nimmt `application/octet-stream` als Deklaration hin — die Bytes entscheiden", () => {
    // Browser setzen `File.type` auf `application/octet-stream` (oder leer),
    // wenn sie eine Endung nicht kennen. Ein HEIC-Foto abzulehnen, weil das
    // Betriebssystem seinen Typ nicht kennt, waere eine Fehlablehnung genau im
    // Kernfall "Handyfoto".
    const befund = pruefe(HEIC, "application/octet-stream", "IMG_0042.heic");
    expect(typVon(befund)).toBe("image/heic");
    expect(befund.ok && befund.abweichungen).toEqual(["deklaration"]);
  });

  it("ignoriert Parameter und Schreibweise der Deklaration", () => {
    const befund = pruefe(TEXT, "Text/Plain; charset=UTF-8", "meldung.txt");
    expect(typVon(befund)).toBe("text/plain");
    expect(befund.ok && befund.abweichungen).toEqual([]);
  });

  it("laesst ein ZIP nur unter der deklarierten ODER benannten Office-Form durch", () => {
    // Ein ZIP-Container ist am Praefix nicht weiter aufzuschluesseln: docx,
    // xlsx und pptx haben dieselben vier Signaturbytes. Deshalb verfeinert hier
    // — und NUR hier — die Deklaration, und wenn sie fehlt, die Endung. Die
    // Feststellung "ZIP" gewinnt trotzdem: sie kann nie zu einem PDF werden.
    expect(typVon(pruefe(OOXML, XLSX_TYP, "material.bin"))).toBe(XLSX_TYP);
    expect(typVon(pruefe(OOXML, "application/octet-stream", "material.xlsx"))).toBe(XLSX_TYP);
    // Und im KONFLIKT gewinnt die Deklaration, denn nur sie ist die Vorrangregel
    // ("die Endung, WENN die Deklaration fehlt"). Die beiden Zeilen darueber
    // pruefen je nur eine Richtung allein und liessen die Reihenfolge offen;
    // gedreht steht sonst das falsche Office-Format in `mime_type` und damit im
    // `Content-Type` des Downloads.
    expect(typVon(pruefe(OOXML, DOCX_TYP, "material.xlsx"))).toBe(DOCX_TYP);
  });

  it("liest die Endung nach dem LETZTEN Punkt — `bericht.jpg.txt` ist eine .txt-Datei", () => {
    // Namentliche Zusage an den Altbestand (Analyse Abschnitt 2.4): Doppelendungen
    // kommen real vor. Der ERSTE Punkt waere die falsche Grenze, und im Textweg
    // faellt das nicht leise aus: dort IST die Endung das zweite Positivsignal,
    // die Datei wuerde also abgelehnt.
    const text = pruefe(TEXT, "text/plain", "bericht.jpg.txt");
    expect(typVon(text)).toBe("text/plain");
    expect(text.ok && text.abweichungen).toEqual([]);
    // Umgekehrt darf die vordere, unpassende Endung keine Abweichung erzeugen.
    const bild = pruefe(PNG, "image/png", "lagekarte.txt.png");
    expect(typVon(bild)).toBe("image/png");
    expect(bild.ok && bild.abweichungen).toEqual([]);
  });
});

describe("Ablehnungen — was nicht durchkommt (T12 Punkte 1 und 2)", () => {
  it("HTML-Inhalt, deklariert als `image/png`, wird abgelehnt", () => {
    // Der gemessene Durchschlupf von `drop`: HTML in `evil.html`, deklariert
    // `image/png`, bei `allowedMime=['image/png']` → 200, gespeichert als
    // `evil.html` (Analyse Abschnitt 3.2). Hier ist es eine Ablehnung.
    const befund = pruefe(HTML, "image/png", "evil.html");
    expect(befund.ok).toBe(false);
    // Und ausdruecklich: kein Rueckfall auf `text/plain`, obwohl HTML
    // gueltiges UTF-8 ist.
    expect(befund).not.toHaveProperty("typ");
    expect(!befund.ok && befund.grund).toBe("text-nicht-ausgewiesen");
  });

  it("ein Teil ohne Content-Type wird abgelehnt, nicht stillschweigend `text/plain`", () => {
    // Wortlaut aus T12 Punkt 2. Der Durchschlupf war der busboy-Default
    // `if (contype === undefined) { contype = 'text/plain' }`
    // (@fastify/busboy@3.2.0/lib/types/multipart.js:133) — er machte aus einem
    // fehlenden Header einen erlaubten Typ.
    for (const deklariert of [undefined, null, "", "   "]) {
      expect(pruefe(HTML, deklariert, "evil.html").ok).toBe(false);
      // Der Kernfall: reiner Text mit `.txt`, dem NUR der Header fehlt.
      const befund = pruefe(TEXT, deklariert, "meldung.txt");
      expect(befund.ok).toBe(false);
      expect(!befund.ok && befund.grund).toBe("text-nicht-ausgewiesen");
    }
  });

  it("aber eine fehlende Deklaration allein lehnt NICHT ab, wenn die Bytes eine Signatur tragen", () => {
    /*
     * DIE GRENZE ZUM TEST DARUEBER, und sie ist bewusst gezogen: §8.5 nennt als
     * Ablehnungsgrund "weicht die FESTSTELLUNG von der Allowlist ab", und der
     * benannte Durchschlupf ist der Text-Default ("sofern `text/plain` in der
     * Allowlist steht"). Eine echte PNG-Datei abzulehnen, weil der Browser
     * `File.type` leer gelassen hat, stuende in keiner Zeile der Spec — und
     * `mime_type` traegt ohnehin den festgestellten Typ.
     * Die fehlende Deklaration ist deshalb eine ABWEICHUNG (protokollierbar),
     * keine Ablehnung.
     */
    const befund = pruefe(PNG, undefined, "lagekarte.png");
    expect(typVon(befund)).toBe("image/png");
    expect(befund.ok && befund.abweichungen).toEqual(["deklaration"]);
  });

  it("lehnt HTML auch unter ehrlicher Deklaration ab", () => {
    expect(pruefe(HTML, "text/html", "seite.html").ok).toBe(false);
  });

  it("lehnt SVG ab — der Grund, aus dem §7.7 es aus der Inline-Vorschau nimmt", () => {
    expect(pruefe(SVG, "image/svg+xml", "logo.svg").ok).toBe(false);
    // Auch als Bild getarnt und mit Bildendung:
    expect(pruefe(SVG, "image/png", "logo.png").ok).toBe(false);
  });

  it("lehnt ausfuehrbare Formate ab", () => {
    expect(!pruefe(EXE, "application/octet-stream", "setup.exe").ok).toBe(true);
    expect(!pruefe(ELF, "application/octet-stream", "hilfe").ok).toBe(true);
    expect(!pruefe(EXE, "image/jpeg", "foto.jpg").ok).toBe(true);
  });

  it("lehnt ein gewoehnliches ZIP mit eigenem Grund ab", () => {
    // Eigener Grund, weil der naechste Schritt ein anderer ist: hier muesste
    // der Betreiber die Allowlist erweitern, bei einer EXE nicht.
    const befund = pruefe(OOXML, "application/zip", "archiv.zip");
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("zip-nicht-office");
  });

  it("lehnt MP4 und AVIF ab, obwohl sie `ftyp` tragen — die Marke traegt die Aussage", () => {
    // Ohne Markenpruefung wuerde jede ISO-BMFF-Datei als HEIC durchgehen; ein
    // Video ist in `drop`s Allowlist nicht enthalten und in §8.5 nicht genannt.
    expect(pruefe(MP4, "video/mp4", "einsatz.mp4").ok).toBe(false);
    expect(pruefe(AVIF, "image/avif", "foto.avif").ok).toBe(false);
  });

  it("lehnt einen Polyglot ab: HTML mit angehaengtem PDF-Kopf", () => {
    /*
     * DIESER TEST IST DIE OFFSET-0-REGEL, nicht ein Schoenheitsfehler: viele
     * PDF-Leser suchen `%PDF-` in den ersten 1024 Bytes. Wer die Signatur hier
     * genauso sucht, nimmt eine Datei an, die im Browser HTML ist und im
     * PDF-Leser ein PDF — und liefert sie unter `application/pdf` aus.
     */
    const polyglot = bytes(HTML, "%PDF-1.7\n");
    expect(pruefe(polyglot, "application/pdf", "bericht.pdf").ok).toBe(false);
  });

  it("lehnt eine abgeschnittene Signatur ab, statt sie zu vervollstaendigen", () => {
    // `ff d8` ohne das dritte Byte ist kein JPEG. Ohne die Laengenpruefung
    // wuerde ein Vergleich ueber das Praefixende hinaus `undefined` gegen
    // `0xff` stellen — je nach Schreibweise still `true`.
    expect(pruefe(bytes([0xff, 0xd8]), "image/jpeg", "foto.jpg").ok).toBe(false);
    expect(pruefe(bytes([0x50, 0x4b, 0x03]), DOCX_TYP, "x.docx").ok).toBe(false);
  });

  /*
   * DIE BEIDEN HAELFTEN GETRENNT — und das ist kein Feinschliff.
   *
   * Der Guard lautet `praefix.length === 0 || gesamtGroesse === 0`. Ein Test, der
   * BEIDE Groessen zugleich auf 0 setzt, bewacht KEINE von beiden: er bleibt gruen,
   * wenn eine der Haelften entfernt wird. Nachgemessen (Mutation `praefix.length
   * === 0` gestrichen): der Mutant liefert fuer 0 Bytes Praefix bei 4096 Bytes
   * Gesamtgroesse `{ ok: true, typ: "text/plain" }` — also genau die Erfindung aus
   * dem Nichts, die diese Datei verhindern soll, und die Suite blieb dabei 45/45.
   * Zwei Faelle, zwei Aussagen.
   */
  it("lehnt eine leere Datei mit eigenem Grund ab — Praefix leer, Datei laut Zaehler nicht", () => {
    const befund = pruefeInhaltstyp({
      praefix: new Uint8Array(0),
      gesamtGroesse: 4096,
      deklariert: "text/plain",
      dateiname: "meldung.txt",
    });
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("kein-inhalt");
  });

  it("lehnt eine leere Datei mit eigenem Grund ab — Praefix da, Datei 0 Bytes", () => {
    // Die Gegenrichtung: Bytes im Puffer, aber der Zaehler sagt „leer". Das ist
    // kein Widerspruch, den diese Funktion aufloesen darf — beides fuehrt zur
    // Ablehnung, und zwar mit demselben Grund.
    const befund = pruefeInhaltstyp({
      praefix: enc.encode("Lagemeldung"),
      gesamtGroesse: 0,
      deklariert: "text/plain",
      dateiname: "meldung.txt",
    });
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("kein-inhalt");
  });

  /*
   * RIFF IST EIN CONTAINER, WEBP NUR EINE SEINER FUELLUNGEN.
   *
   * Nach `RIFF` und vier Laengenbytes steht ab Offset 8 die Marke, und nur `WEBP`
   * gehoert in die Allowlist. Ohne diesen Test war die Marke ungeprueft:
   * Mutation „WebP nur an `RIFF` festmachen" liess die Suite 45/45 gruen, waehrend
   * ein WAV-Praefix als `image/webp` ANGENOMMEN wurde — ein Format, das in keiner
   * Allowlist des Moduls steht, mit einem Allowlist-Typ in `mime_type`.
   *
   * Fuer den exakt parallelen Fall (ISO-BMFF-Marke ab Offset 8, MP4/AVIF) gab es
   * die negativen Tests von Anfang an; fuer den RIFF-Container fehlten sie. Die
   * Konstanten WAV und AVI lagen dafuer schon bereit, ungenutzt.
   */
  it.each([
    ["WAV", WAV, "audio/wav"],
    ["AVI", AVI, "video/x-msvideo"],
  ])("lehnt %s ab, obwohl es wie WebP mit RIFF beginnt", (_name, inhalt, deklariert) => {
    const befund = pruefe(inhalt, deklariert, "aufnahme.bin");
    expect(befund.ok).toBe(false);
  });

  it("laesst sich auch nicht mit der Behauptung `image/webp` ueberreden", () => {
    // Der gefaehrlichere Weg: die Deklaration passt zur Allowlist, nur der Inhalt
    // nicht. Faellt der Marken-Vergleich weg, landet hier `ok: true`.
    const befund = pruefe(WAV, "image/webp", "bild.webp");
    expect(befund.ok).toBe(false);
  });

  it("jede Ablehnung traegt eine Meldung, die ohne Log verstaendlich ist", () => {
    const faelle: MimeBefund[] = [
      pruefe(HTML, "image/png", "evil.html"),
      pruefe(EXE, "application/octet-stream", "setup.exe"),
      pruefe(OOXML, "application/zip", "archiv.zip"),
      pruefe(bytes([0x48, 0x61, 0xff, 0xfe]), "text/plain", "meldung.txt"),
    ];
    for (const befund of faelle) {
      expect(befund.ok).toBe(false);
      expect(!befund.ok && befund.meldung.length).toBeGreaterThan(20);
    }
  });
});

describe("text/plain nur bei gueltigem UTF-8 (T12 Punkt 4)", () => {
  it("nimmt gueltiges UTF-8 mit Umlauten an", () => {
    expect(typVon(pruefe("Übung Größe — 1 von 3\n", "text/plain", "uebung.txt"))).toBe("text/plain");
  });

  it("lehnt eine ungueltige Bytefolge ab", () => {
    // `ff fe` ist in UTF-8 nirgends gueltig (es ist der UTF-16-BOM).
    const befund = pruefe(bytes("Hallo ", [0xff, 0xfe], " Welt"), "text/plain", "meldung.txt");
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("text-nicht-utf8");
  });

  it("lehnt UTF-16-Text ab, obwohl seine Bytes gueltiges UTF-8 sind", () => {
    // "Hallo" als UTF-16LE: jedes zweite Byte ist NUL. UTF-8 erlaubt NUL, echter
    // Text enthaelt es nie — und als `text/plain` ausgeliefert waere die Datei
    // im Browser unlesbar. Das NUL ist der Binaermarker, den die reine
    // Kodierungspruefung nicht sieht.
    const utf16 = bytes([0x48, 0x00, 0x61, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00]);
    const befund = pruefe(utf16, "text/plain", "meldung.txt");
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("text-nicht-utf8");
  });

  it("verzeiht eine an der Praefixgrenze zerschnittene Mehrbyte-Sequenz", () => {
    /*
     * Der Aufrufer liest MIME_PRAEFIX_BYTES vom Anfang; die Grenze faellt
     * irgendwann mitten in ein `ö` (0xc3 0xb6). Ohne diese Nachsicht waere jede
     * zweite groessere Textdatei still abgelehnt — ein Fehler, der nur bei
     * bestimmten Dateilaengen auftritt und deshalb kaum zu finden ist.
     */
    const gekappt = mittenImUmlautGekappt();
    const befund = pruefeInhaltstyp({
      praefix: gekappt,
      gesamtGroesse: gekappt.length + 500, // die Datei geht weiter
      deklariert: "text/plain",
      dateiname: "meldung.txt",
    });
    expect(typVon(befund)).toBe("text/plain");
  });

  it("verzeiht sie NICHT, wenn das Praefix die ganze Datei ist", () => {
    // Dieselben Bytes, andere Aussage: hier endet die Datei mitten in der
    // Sequenz, sie ist also wirklich kaputt.
    const gekappt = mittenImUmlautGekappt();
    const befund = pruefeInhaltstyp({
      praefix: gekappt,
      gesamtGroesse: gekappt.length,
      deklariert: "text/plain",
      dateiname: "meldung.txt",
    });
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("text-nicht-utf8");
  });

  /*
   * DIE KONSTANTE 3 IN `istUtf8Text`, EINZELN NACHGEMESSEN.
   *
   * `mittenImUmlautGekappt` deckt nur den Schnitt nach EINEM Byte ab. Eine
   * UTF-8-Sequenz kann aber bis zu vier Bytes lang sein, die Lesegrenze faellt also
   * auch nach zwei oder drei — und genau daran haengt die Nachsicht am Praefixende.
   * Der Helfer dafuer war vorhanden (mit Selbstpruefung des Praefix), aber kein Test
   * hat ihn gerufen: waere die Konstante 3 auf 1 gekippt, waere nichts rot geworden.
   */
  it.each([1, 2, 3] as const)(
    "verzeiht ein Praefix, das nach %i Byte(s) eines Emoji endet",
    (behalten) => {
      const gekappt = mittenImEmojiGekappt(behalten);
      const befund = pruefeInhaltstyp({
        praefix: gekappt,
        gesamtGroesse: gekappt.length + 500, // die Datei geht weiter
        deklariert: "text/plain",
        dateiname: "meldung.txt",
      });
      expect(typVon(befund)).toBe("text/plain");
    },
  );

  it.each([1, 2, 3] as const)(
    "verzeiht denselben Emoji-Schnitt NICHT, wenn die Datei dort endet (%i Byte(s))",
    (behalten) => {
      const gekappt = mittenImEmojiGekappt(behalten);
      const befund = pruefeInhaltstyp({
        praefix: gekappt,
        gesamtGroesse: gekappt.length,
        deklariert: "text/plain",
        dateiname: "meldung.txt",
      });
      expect(befund.ok).toBe(false);
      expect(!befund.ok && befund.grund).toBe("text-nicht-utf8");
    },
  );

  it("verzeiht am Praefixende nur einen Sequenz-ANFANG, keinen Muell", () => {
    // Ein einzelnes 0xff kann kein Anfang irgendeiner UTF-8-Sequenz sein.
    const befund = pruefeInhaltstyp({
      praefix: bytes("Lagemeldung", [0xff]),
      gesamtGroesse: 5000,
      deklariert: "text/plain",
      dateiname: "meldung.txt",
    });
    expect(befund.ok).toBe(false);
  });

  it("verlangt fuer `text/plain` BEIDE Positivsignale: Deklaration und Endung", () => {
    /*
     * `text/plain` ist der einzige Allowlist-Typ ohne Signatur — es gibt fuer
     * ihn keine positive Byte-Evidenz. Deshalb muessen die beiden anderen
     * Richtungen ihn ausweisen. Nur die Deklaration genuegt nicht: sonst kommt
     * `bericht.html` mit `text/plain` durch, liegt unter seinem Anzeigenamen in
     * der DB und ist beim Empfaenger nach dem Speichern ein Doppelklick von
     * ausgefuehrtem Markup entfernt.
     */
    expect(pruefe(TEXT, "text/plain", "bericht.html").ok).toBe(false);
    expect(pruefe(TEXT, "text/plain", "bericht").ok).toBe(false);
    expect(pruefe(TEXT, "text/csv", "liste.txt").ok).toBe(false);
    expect(typVon(pruefe(TEXT, "text/plain", "liste.txt"))).toBe("text/plain");
  });

  it("nennt beim fehlenden Ausweis die Endungen, die es annimmt", () => {
    const befund = pruefe(TEXT, "text/plain", "notizen.log");
    expect(befund.ok).toBe(false);
    expect(!befund.ok && befund.grund).toBe("text-nicht-ausgewiesen");
    // Der Betreiber muss aus der Meldung ablesen koennen, WELCHE Liste zu
    // erweitern waere (§13.1 Frage 3 ist unbeantwortet).
    expect(!befund.ok && befund.meldung).toContain(".txt");
  });
});
