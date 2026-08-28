// src/app/m/radio/_lib/csv/einlesen.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`); der Scan darueber steht in
// `src/app/m/radio/riegel.test.ts:909-962`.
//
// ⛔ DIESE DATEI IST DIE EINZIGE DES ORDNERS, DIE BYTES ANFASST — und deshalb die einzige,
// die eine Client-Insel NICHT importieren darf. `spalten.ts`, `kopfzeilen.ts` und
// `klassifizieren.ts` liefern reine Werte und laufen in beide Richtungen; hier laeuft die
// Kodierungserkennung. Die Aufrufer sind serverseitig: der Hochladen-Handler (V18) und die
// Import-Actions (V10).
//
// ⚠️ UND DIE BEGRUENDUNG DAFUER IST HEUTE EINE ANDERE ALS MORGEN — der frueher hier stehende
// Satz („ein Wertimport zoege Node-Bausteine ins Browser-Bundle") war ein Vorgriff und ist
// gemessen falsch: `grep -c "^import" src/app/m/radio/_lib/csv/einlesen.ts` -> `0`, kein
// `node:`-Import, und `TextDecoder` wie `Uint8Array` sind Web-Globals (WHATWG Encoding). Die
// Datei ist HEUTE browsertauglich. ⛔ DIE GRENZE STEHT TROTZDEM SCHON JETZT: ⬜ A1 unten
// (`chardet`/`iconv-lite`, Eigentuemer Betreiber) macht sie serverseitig, sobald der Betreiber
// die zwei Abhaengigkeiten entscheidet — und eine Grenze, die erst mit der Abhaengigkeit
// gezogen wird, zieht niemand mehr.

/**
 * ⬜ BENANNTE ABWEICHUNG MIT EIGENTUEMER — `chardet` UND `iconv-lite` SIND IM REPO NICHT
 * VORHANDEN.
 *
 * Gemessen am 2026-08-25: `grep -n "chardet\|iconv" package.json` liefert keinen Treffer;
 * dasselbe gilt fuer `csv-parse` und `csv-stringify`. `Spec:4704-4710` verlangt, die
 * Kodierungserkennung „ueber `chardet`/`iconv-lite`" wandere „als echte Fachlogik mit"; die
 * Alt-Bauteile sind `radio-admin/server/src/import/decode-csv.ts` und `parse-csv.ts`.
 *
 * ⛔ EINE NEUE ABHAENGIGKEIT IST EINE ENTSCHEIDUNG, KEINE NEBENWIRKUNG. Statt eines stillen
 * `pnpm add` steht die Frage als Vermerk in der Aufgabenrueckmeldung (Vorabscan-Fund F20,
 * `.superpowers/sdd/planteil4/VORABSCAN.md:484-501`), und hier der dort benannte Rueckfall:
 *
 *   UTF-8 mit BOM-Erkennung, und wenn die Bytes kein gueltiges UTF-8 sind, Windows-1252.
 *
 * ⚠️ DER GEMESSENE VERLUST, ausgeschrieben statt verschwiegen: `chardet` erkennt eine dritte
 * Kodierung (ISO-8859-15, UTF-16 ohne BOM, MacRoman). Der Rueckfall hier kann das nicht — er
 * kennt zwei Faelle und entscheidet zwischen ihnen anhand der UTF-8-Gueltigkeit. Eine
 * Latin-9-Datei kommt als Windows-1252 an; die beiden unterscheiden sich in acht
 * Codepunkten, darunter das Eurozeichen. Eine UTF-16-Datei ohne BOM kommt als Unsinn an.
 * ⛔ Wer diese Faelle braucht, entscheidet die zwei Abhaengigkeiten — er faellt sie nicht hier
 * nebenbei.
 */

/** Die drei Trennzeichen, die der Bestand erkennt (`parse-csv.ts:3`). */
const KANDIDATEN = [";", ",", "\t"] as const;

/** Ein erkanntes Trennzeichen. */
export type Trennzeichen = (typeof KANDIDATEN)[number];

/** Eine eingelesene CSV-Datei: Kopfzeile, Datenzeilen und was erkannt wurde. */
export type EingeleseneCsv = {
  spalten: string[];
  zeilen: string[][];
  trennzeichen: Trennzeichen;
  kodierung: string;
};

/**
 * Das Ergebnis des Einlesens.
 *
 * ⛔ EINE MELDUNG, KEIN WURF. Der Alt-Weg wirft in `decodeCsv` (`decode-csv.ts:15-17`) und
 * faengt eine Ebene hoeher, um mit „Leere oder ungültige Datei" zu antworten
 * (`radio-admin/server/src/routes/import.ts:24-30`). Die Suite-Action gibt stattdessen
 * `{ ok: false, fehler: … }` zurueck — dieselbe Form wie die uebrigen Schreibpfade des
 * Moduls, und sie ueberlebt die Server-Action-Grenze, wo ein Wurf zur Fehlerseite wuerde.
 */
export type LeseErgebnis = { ok: true; daten: EingeleseneCsv } | { ok: false; fehler: string };

/**
 * Die eine Meldung fuer eine leere oder unlesbare Datei, zeichengleich aus
 * `radio-admin/server/src/routes/import.ts:28`.
 */
export const LESE_FEHLER = "Leere oder ungültige Datei";

/**
 * Erkennt das Trennzeichen an der ERSTEN NICHT-LEEREN Zeile.
 *
 * ⛔ 1:1 AUS `parse-csv.ts:11-22`, und die Leiter ist GEORDNET, keine Mehrheitswahl
 * (`:17-21`):
 *
 *   1. `;` gewinnt, sobald es ueberhaupt vorkommt — deutsches Excel schreibt es.
 *   2. sonst Tabulator gegen Komma nach Haeufigkeit,
 *   3. sonst Komma, wenn es vorkommt,
 *   4. sonst Tabulator, wenn er vorkommt,
 *   5. sonst `;`.
 *
 * ⛔ WER DIE VIER ZEILEN UMSTELLT, AENDERT DIE ANTWORT auf eine Kommadatei, die einen
 * einzelnen Tabulator in einem Freitextfeld traegt — und der Fehler zeigt sich erst als
 * verrutschte Spalten im Vorschauschritt.
 */
export function erkenneTrennzeichen(text: string): Trennzeichen {
  const ersteZeile = text.split(/\r?\n/).find((zeile) => zeile.trim() !== "") ?? "";
  const anzahl: Record<Trennzeichen, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const kandidat of KANDIDATEN) {
    anzahl[kandidat] = ersteZeile.split(kandidat).length - 1;
  }
  if (anzahl[";"] > 0) return ";";
  if (anzahl["\t"] > anzahl[","]) return "\t";
  if (anzahl[","] > 0) return ",";
  if (anzahl["\t"] > 0) return "\t";
  return ";";
}

/** Der dekodierte Text und die Kodierung, unter der er gelesen wurde. */
export type DekodierteCsv = { text: string; kodierung: string };

/**
 * Dekodiert die Bytes zu Text und streift ein fuehrendes BOM ab.
 *
 * ⛔ DAS BOM MUSS WEG (`decode-csv.ts:21-24`). Bliebe es stehen, truege die erste Kopfzeile
 * ein unsichtbares U+FEFF, normalisierte zu etwas anderem und faellt aus der Zuordnung —
 * der Import verloere still ausgerechnet die ISSI-Spalte, und die ist der Pflicht-Schluessel.
 * Der eigene Export schreibt das BOM (`spalten.ts`, `export.ts:9`), der Rundlauf laeuft also
 * IMMER durch diesen Zweig.
 *
 * ⛔ SIE IST EXPORTIERT, UND DAS IST 1:1: der Bestand fuehrt `decodeCsv` ebenfalls als
 * eigenen, exportierten Baustein (`decode-csv.ts:14`). ⚠️ UND ES IST DER EINZIGE ORT, AN DEM
 * DIE BOM-ZUSICHERUNG MESSBAR IST — gemessen am 2026-08-25: nimmt man die drei Zeilen unten
 * heraus und prueft nur ueber `lesEinCsv`, bleiben alle Faelle gruen, weil JavaScripts
 * `trim()` U+FEFF als WhiteSpace mitentfernt (ECMA-262; `node -e` nachgemessen: `"\ufeffISSI".trim()
 * === "ISSI"` ist `true`) und der Feldschnitt in `zerlege` ohnehin trimmt. Ein Test, der die
 * Zusicherung ueber `lesEinCsv` zu pruefen vorgibt, misst also den Feldschnitt und nicht das
 * BOM. Die Zusicherung bleibt trotzdem noetig: der Feldschnitt trimmt NUR unmaskierte
 * Felder, und `trim()`s U+FEFF-Verhalten ist eine Eigenschaft der Sprache, kein Vertrag
 * dieses Moduls.
 */
export function dekodiereCsv(bytes: Uint8Array): DekodierteCsv | null {
  if (bytes.length === 0) return null;

  let kodierung = "UTF-8";
  let text: string;
  try {
    /*
     * `fatal: true` ist der ganze Erkennungsschritt: gueltiges UTF-8 bleibt UTF-8, alles
     * andere faellt in den Windows-1252-Zweig.
     *
     * ⛔ `ignoreBOM: true` HEISST DAS GEGENTEIL SEINES NAMENS: der Dekodierer laesst das BOM
     * DRIN, statt es stillschweigend zu schlucken (WHATWG Encoding). Das ist Absicht und die
     * Form des Bestands — `iconv.decode` gibt es ebenfalls heraus, und `decode-csv.ts:21-24`
     * streift es danach selbst ab. ⚠️ OHNE DIESES FLAG WAERE DIE ABSTREIFUNG UNTEN TOTER
     * CODE: gemessen am 2026-08-25 (`node -e`), `new TextDecoder("utf-8", { fatal: true })`
     * liefert fuer die Bytes `EF BB BF 49 53 53 49` bereits `"ISSI"`. Ein toter Zweig, der
     * wie eine Zusicherung aussieht, ist in diesem Haus ein eigener Fehler
     * (`_lib/bauform.test.ts`, „kein Rueckfalltext hinter gateMeldung").
     *
     * ⚠️ WAS DAS PAAR AUS FLAG UND ABSTREIFUNG HEUTE NICHT IST: eine Aussenzusicherung.
     * Gemessen (Review V9, Fund F7 Punkt 6): nimmt man BEIDE zusammen heraus, bleibt alles
     * gruen — der schlichte Dekodierer schluckt das BOM selbst, das Ergebnis ist dasselbe.
     * Die Sonde S-V9h bewacht also eine SELBSTGESCHAFFENE Kopplung. ⛔ Sie wird erst mit
     * ⬜ A1 tragend: `iconv.decode` gibt das BOM heraus, und `decode-csv.ts:21-24` streift es
     * genau deshalb selbst ab. Wer A1 verwirft, baut hier auf den schlichten Dekodierer
     * zurueck — und nimmt die Abstreifung mit.
     */
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    kodierung = "windows-1252";
    text = new TextDecoder("windows-1252").decode(bytes);
  }

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return { text, kodierung };
}

/**
 * Zerlegt CSV-Text nach RFC 4180 in Zeilen aus Feldern.
 *
 * ⛔ NACHBAU VON `parse-csv.ts:37-43`, dessen vier Schalter je eine Zusage sind:
 * `bom: true` (oben abgehandelt), `trim: true`, `skip_empty_lines: true` und ⛔
 * `relax_column_count: true` — eine kuerzere oder laengere Zeile ist KEIN Fehler, sondern
 * eine kurze Zeile. Der Grund ist fachlich: eine Kundendatei mit einer verrutschten Zeile
 * soll die uebrigen Zeilen nicht mitreissen; die fehlenden Zellen werden beim Zuordnen zu
 * `null` (`commit-service.ts:93-94`).
 *
 * ⚠️ `trim` WIRKT NUR AUF UNMASKIERTE FELDER — genau wie bei `csv-parse`. Ein Feld in
 * Anfuehrungszeichen behaelt seine Leerzeichen, sonst waere ein bewusst gesetzter Abstand
 * nicht mehr ausdrueckbar.
 */
function zerlege(text: string, trennzeichen: Trennzeichen): string[][] {
  const saetze: string[][] = [];
  let zeile: string[] = [];
  let feld = "";
  let maskiert = false;
  let warMaskiert = false;

  const feldAbschliessen = () => {
    zeile.push(warMaskiert ? feld : feld.trim());
    feld = "";
    warMaskiert = false;
  };
  const zeileAbschliessen = () => {
    feldAbschliessen();
    // `skip_empty_lines`: eine Zeile, die nur aus einem leeren Feld besteht, faellt weg.
    if (!(zeile.length === 1 && zeile[0] === "")) {
      saetze.push(zeile);
    }
    zeile = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const zeichen = text[i];

    if (maskiert) {
      if (zeichen === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i += 1;
        } else {
          maskiert = false;
        }
      } else {
        feld += zeichen;
      }
      continue;
    }

    /*
     * ⛔ NUR ALS ERSTES ZEICHEN DES FELDES (`feld === ""`), NICHT NACH LEERRAUM. `csv-parse`
     * geht ebenfalls nur dann in den maskierten Zustand; ein `feld.trim() === ""` waere
     * grosszuegiger, und der Unterschied ist gemessen: die Zelle ` "zitiert" mehr` ergaebe
     * dort `zitiert mehr` statt woertlich `"zitiert" mehr`.
     *
     * ⚠️ DARAUS FOLGT EINE KOPPLUNG: ein nicht abgestreiftes BOM stuende als erstes Zeichen
     * im Feld und verhinderte den maskierten Zustand der ERSTEN Zelle. Die Abstreifung in
     * `dekodiereCsv` ist also nicht nur Kosmetik; Sonde S-V9h bewacht sie.
     */
    if (zeichen === '"' && feld === "") {
      maskiert = true;
      warMaskiert = true;
      feld = "";
      continue;
    }
    if (zeichen === trennzeichen) {
      feldAbschliessen();
      continue;
    }
    if (zeichen === "\r") continue;
    if (zeichen === "\n") {
      zeileAbschliessen();
      continue;
    }
    feld += zeichen;
  }

  // Die letzte Zeile ohne abschliessenden Umbruch.
  if (feld !== "" || warMaskiert || zeile.length > 0) {
    zeileAbschliessen();
  }
  return saetze;
}

/**
 * Liest eine hochgeladene CSV-Datei: dekodieren, Trennzeichen erkennen, zerlegen.
 *
 * ⛔ LEERE ODER UNLESBARE DATEI ERGIBT EINE MELDUNG, KEINEN WURF — siehe `LeseErgebnis`.
 * Dazu zaehlt ausdruecklich auch eine Datei OHNE Kopfzeile: `parse-csv.ts:45` faellt dort
 * auf `columns = []` zurueck, und eine Zuordnung ohne Kopfzeilen kann die ISSI-Spalte nie
 * finden. Ein leerer Vorschauschritt waere die schlechtere Antwort als die Meldung.
 *
 * `erzwungen` bildet den zweiten Parameter des Bestands ab (`parse-csv.ts:35-36`): die
 * Oberflaeche darf das erkannte Trennzeichen ueberstimmen.
 */
export function lesEinCsv(bytes: Uint8Array, erzwungen?: Trennzeichen): LeseErgebnis {
  const dekodiert = dekodiereCsv(bytes);
  if (dekodiert === null) {
    return { ok: false, fehler: LESE_FEHLER };
  }

  const trennzeichen = erzwungen ?? erkenneTrennzeichen(dekodiert.text);
  const saetze = zerlege(dekodiert.text, trennzeichen);
  const [spalten, ...zeilen] = saetze;
  /*
   * ⚠️ `spalten.length === 0` IST GEMESSEN UNERREICHBAR und bleibt als bewusste Gurtung stehen
   * (Review V9, Fund F7 Punkt 3): `zerlege` schiebt nie eine Zeile der Laenge 0 — jedes
   * `zeileAbschliessen` legt ueber `feldAbschliessen` mindestens ein Feld ab, und eine Zeile
   * aus genau einem leeren Feld faellt vorher unter `skip_empty_lines` heraus. Der lebende
   * Zweig ist `spalten === undefined`. ⛔ Die Bedingung ist damit KEINE Zusicherung, und
   * niemand darf sie fuer eine halten; entfernt man sie, wird kein Test rot.
   */
  if (spalten === undefined || spalten.length === 0) {
    return { ok: false, fehler: LESE_FEHLER };
  }

  return {
    ok: true,
    daten: { spalten, zeilen, trennzeichen, kodierung: dekodiert.kodierung },
  };
}
