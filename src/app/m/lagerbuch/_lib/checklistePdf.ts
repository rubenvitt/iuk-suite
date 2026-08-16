/**
 * DIE FAHRZEUG-CHECKLISTE ALS PDF — dieselbe Liste wie auf dem Bildschirmblatt,
 * nur als Datei statt als Druckauftrag.
 *
 * ⚠️ WARUM ES DIESE DATEI GIBT UND NICHT „Drucken → Als PDF sichern" GENUEGT.
 * Der Umweg ueber den Druckdialog liefert je nach Browser, Betriebssystem und
 * eingestelltem Papierformat ein anderes Ergebnis (Seitenraender, Kopf- und
 * Fusszeilen des Browsers, Skalierung), er ist auf dem Telefon teils gar nicht
 * vorhanden, und er entsteht ueberhaupt nur an dem Rechner, der die Seite
 * gerade offen hat. Eine Datei dagegen laesst sich verschicken, ablegen und
 * ein halbes Jahr spaeter unveraendert wieder oeffnen. Der Druckweg BLEIBT —
 * diese Datei ergaenzt ihn.
 *
 * ⚠️ DIE FACHLICHKEIT WIRD HIER NICHT ZWEITES MAL BERECHNET, und das ist die
 * tragende Zusage: die Eingabe ist `ChecklisteBlatt[]` aus
 * `lesepfade/checkliste.ts` — DERSELBE Wert, den `ChecklistenBogen.tsx` auf
 * dem Bildschirm rendert und den `helfer/check` als Maske abarbeitet. Was
 * dieses Modul entscheidet, ist ausschliesslich LAYOUT: Spaltenbreiten,
 * Umbrueche, Seitenwechsel. Ein Inhaltsunterschied zwischen Blatt und PDF ist
 * damit konstruktiv ausgeschlossen; ein bloss anders AUSSEHENDES PDF ist der
 * hingenommene Preis dafuer, dass in der Produktion kein Browser laeuft, der
 * das HTML-Blatt setzen koennte.
 *
 * ⚠️ KEIN `"use client"`, KEIN antd, KEIN ZEICHEN. Diese Datei laeuft
 * ausschliesslich im Route Handler (`(druck)/checklisten/pdf/route.ts`).
 *
 * ⚠️ EINE SCHRIFTFAMILIE (Helvetica, normal und fett) UND KEINE EINGEBETTETE
 * SCHRIFTDATEI. Die 14 Standardschriften stecken in jedem PDF-Betrachter; eine
 * eingebettete TTF kostete rund 300 kB je Datei und braechte auf einem Blatt
 * aus Grossbuchstaben, Zahlen und Artikelnamen nichts ein. Der Preis steht in
 * `winAnsi()`: die Standardschriften koennen nur WinAnsi kodieren.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { ZUSTAENDE } from "./konstanten";
import type { ChecklisteBlatt, ChecklisteFach } from "./lesepfade/checkliste";

/* ── Masse ────────────────────────────────────────────────────────────────── */

/** Millimeter in PDF-Punkte. Das ganze Modul rechnet in Millimetern und
 *  uebersetzt erst beim Zeichnen — dieselben Zahlen wie in `druck.css`. */
const MM = 72 / 25.4;

const A4 = { breite: 210 * MM, hoehe: 297 * MM };

/** Etwas grosszuegiger als `@page { margin: 8mm }` im Stylesheet: ein PDF wird
 *  auch auf Geraeten gedruckt, deren nicht bedruckbarer Rand groesser ist als
 *  der eines Bueroduplexers, und 8mm faellt dort in die Klemmzone. */
const RAND = { links: 12 * MM, rechts: 12 * MM, oben: 12 * MM, unten: 10 * MM };

/** Der Streifen unter dem Satzspiegel, den die Fusszeile bekommt. Er ist bei
 *  der Umbruchrechnung reserviert, sonst schriebe die letzte Tabellenzeile
 *  ueber die Fusszeile. */
const FUSS_RAUM = 8 * MM;

const SATZBREITE = A4.breite - RAND.links - RAND.rechts;

/** Das gezeichnete Abhak-Kaestchen. Nie ein PDF-Formularfeld: es wird mit dem
 *  Kugelschreiber ausgefuellt — dieselbe Entscheidung wie im HTML-Blatt, wo es
 *  aus demselben Grund kein `<input>` ist. */
const KASTEN = 3.2 * MM;

/**
 * Die zwei Bediendichten des Bogens, hier als Schriftgrade und Polster. Sie
 * entsprechen `.lb-cl-kompakt` in `druck.css`: kompakt greift NUR an Polstern
 * und Schriftgraden, keine Spaltenbreite aendert sich.
 */
type Dichte = {
  /** Grundschriftgrad der Tabellenzellen. */
  tabelle: number;
  /** Die Tabellenkopfzeile. */
  kopf: number;
  /** Nebenangaben — Handlagerfach, Verfall, Fristen. */
  klein: number;
  polster: number;
  abschnittOben: number;
  fachOben: number;
};

const DICHTE: Record<"weit" | "kompakt", Dichte> = {
  weit: {
    tabelle: 9, kopf: 7.5, klein: 8,
    polster: 1.4 * MM, abschnittOben: 6 * MM, fachOben: 3 * MM,
  },
  kompakt: {
    tabelle: 8, kopf: 7, klein: 7.2,
    polster: 0.85 * MM, abschnittOben: 4 * MM, fachOben: 2.2 * MM,
  },
};

/** Zeilenabstand als Vielfaches des Schriftgrades. */
const ZEILE = 1.25;

/* ── Farben ───────────────────────────────────────────────────────────────── */

/**
 * ⚠️ LITERALE, KEIN `--lb-*`. Dieselbe Begruendung wie im Stylesheet: ein Blatt
 * Papier hat keinen Dunkelmodus. Hier kommt ein zweiter Grund dazu — ein PDF
 * kennt die Sitzung gar nicht, in der es entstanden ist.
 */
const TINTE = rgb(0, 0, 0);
const GEDAEMPFT = grau(0x33, 0x3b, 0x42);
const NOTIZ = grau(0x4a, 0x54, 0x5d);
const LINIE = grau(0xcc, 0xd2, 0xd7);
const ZEBRA = grau(0xf5, 0xf7, 0xf8);
const SCHREIBFELD = grau(0xe8, 0xec, 0xef);
const SCHREIBLINIE = grau(0x6b, 0x74, 0x7d);

function grau(r: number, g: number, b: number): RGB {
  return rgb(r / 255, g / 255, b / 255);
}

/* ── Zeichenvorrat ────────────────────────────────────────────────────────── */

/**
 * Die WinAnsi-Zeichen oberhalb von Latin-1 — der Block, den Windows-1252 auf
 * die Bytes 0x80–0x9F legt. Ohne diese Menge fielen Gedankenstrich und
 * deutsche Anfuehrungszeichen aus, die in Artikelnamen durchaus vorkommen.
 */
const WINANSI_EXTRA = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "Ž",
  "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "ž", "Ÿ",
]);

/** Was sich sinnvoll ersetzen laesst, wird ersetzt statt verworfen. */
const ERSATZ: Record<string, string> = {
  "✓": "x", "✔": "x",            // ✓ ✔ — Haken
  "→": "->", "←": "<-",          // → ←
  "≤": "<=", "≥": ">=", "≠": "!=",
  "‑": "-", "−": "-",            // geschuetzter Bindestrich, Minus
  "′": "'", "″": '"',            // Fuss-/Zollzeichen
  " ": " ", " ": " ",  // schmales und halbes Leerzeichen
  // Tief- und hochgestellte Ziffern — „O₂" ist in einer Flaschenbezeichnung
  // der Regelfall, nicht die Ausnahme. (¹ ² ³ liegen in Latin-1 und brauchen
  // hier nichts.)
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "⁰": "0", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

/**
 * ⚠️ DIE STELLE, AN DER EIN ARTIKELNAME DEN GANZEN EXPORT KIPPEN KOENNTE.
 *
 * `pdf-lib` kodiert die Standardschriften nach WinAnsi und WIRFT bei jedem
 * Zeichen, das dort nicht vorkommt — `WinAnsi cannot encode "✓" (0x2713)`. Der
 * Wurf entstuende beim ZEICHNEN, also erst zur Laufzeit und nur fuer den
 * Bestand, der so ein Zeichen enthaelt: `typecheck`, `lint` und `build` sind
 * dagegen blind, und ein Test mit sauberen Beispieldaten ebenso. Artikelnamen,
 * Fachbezeichnungen und Fahrzeugnamen kommen aber aus Eingabefeldern, und ein
 * „Handschuhe ✓ geprüft" oder ein aus einer Tabellenkalkulation kopiertes
 * Aufzaehlungszeichen ist dort keine Absonderlichkeit. Deshalb laeuft JEDER
 * Text durch diese Funktion, und zwar in `zeichne()` — der einzigen Stelle,
 * die `drawText` ruft, damit es keinen zweiten Weg an ihr vorbei gibt.
 *
 * Unbekannte Zeichen werden zu `?` und nicht stillschweigend verworfen: eine
 * sichtbare Luecke laedt zum Nachsehen ein, ein spurlos verschwundenes Zeichen
 * nicht.
 */
export function winAnsi(text: string): string {
  let raus = "";
  for (const zeichen of text.replace(/[\r\n\t]+/g, " ")) {
    const cp = zeichen.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) raus += zeichen;
    else if (WINANSI_EXTRA.has(zeichen)) raus += zeichen;
    else raus += ERSATZ[zeichen] ?? "?";
  }
  return raus;
}

/* ── Satz ─────────────────────────────────────────────────────────────────── */

/** Ein Textstueck mit eigenem Stil. Eine Zelle ist eine Folge davon — so
 *  stehen Geraetename (fett) und MTK-Frist (klein) in EINER Zelle, ohne dass
 *  daraus zwei Spalten werden muessten. */
type Lauf = {
  text: string;
  fett?: boolean;
  klein?: boolean;
  ton?: "notiz" | "gedaempft";
  /** Ausdruecklicher Schriftgrad — die Tabellenkopfzeile setzt ihn. */
  grad?: number;
};

type Ausrichtung = "links" | "rechts" | "mitte";

type Spalte = {
  kopf: string;
  /** Breite in mm; `null` = nimmt den Rest. Genau eine Spalte je Tabelle. */
  mm: number | null;
  aus?: Ausrichtung;
  /** Die getoente Spalte, in die geschrieben wird (`.lb-cl-sIst`). */
  schreibfeld?: boolean;
  /**
   * Die Abhak-Spalte. Ihre Ueberschrift ist ein GEZEICHNETES Haekchen und kein
   * Text: WinAnsi kennt kein `✓` (siehe `winAnsi()`), und die ausgeschriebene
   * Alternative („Geprüft") ist auf 8mm Spaltenbreite dreimal so breit wie die
   * Spalte und liefe in den Artikelnamen hinein.
   */
  haken?: boolean;
};

type Zelle =
  | { art: "text"; laeufe: Lauf[]; aus?: Ausrichtung }
  | { art: "kasten" }
  | { art: "wahl"; optionen: readonly string[] }
  | { art: "leer" };

/** Der Zeichensatz und der Stand des laufenden Blattes. */
type Lage = {
  doc: PDFDocument;
  normal: PDFFont;
  fett: PDFFont;
  dichte: Dichte;
  blatt: ChecklisteBlatt;
  stand: string;
  /** Die Seiten DIESES Fahrzeugs — die Fusszeilen entstehen erst, wenn ihre
   *  Zahl feststeht. */
  seiten: PDFPage[];
  seite: PDFPage;
  y: number;
};

function schrift(lage: Lage, lauf: Lauf): PDFFont {
  return lauf.fett ? lage.fett : lage.normal;
}

function grad(lage: Lage, lauf: Lauf): number {
  return lauf.grad ?? (lauf.klein ? lage.dichte.klein : lage.dichte.tabelle);
}

function breiteVon(lage: Lage, lauf: Lauf): number {
  return schrift(lage, lauf).widthOfTextAtSize(winAnsi(lauf.text), grad(lage, lauf));
}

/**
 * DIE EINZIGE STELLE, DIE `drawText` RUFT — siehe die Begruendung an
 * `winAnsi()`. Ein zweiter Aufruf irgendwo im Modul waere der Weg an der
 * Kodierungspruefung vorbei.
 */
function zeichne(
  seite: PDFPage,
  text: string,
  opt: { x: number; y: number; size: number; font: PDFFont; farbe?: RGB },
): void {
  seite.drawText(winAnsi(text), {
    x: opt.x, y: opt.y, size: opt.size, font: opt.font, color: opt.farbe ?? TINTE,
  });
}

/**
 * Ein zu langes Wort wird ZERLEGT, nicht abgeschnitten. Ein gekuerzter
 * Artikelname auf einer Packliste schickt jemanden mit halber Information los;
 * eine unschoene Trennung tut das nicht.
 */
function zerlege(lage: Lage, wort: string, stil: Lauf, maxBreite: number): string[] {
  const stuecke: string[] = [];
  let rest = wort;
  while (rest.length > 0) {
    let n = rest.length;
    while (n > 1 && breiteVon(lage, { ...stil, text: rest.slice(0, n) }) > maxBreite) n--;
    stuecke.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  return stuecke;
}

/** Laeufe → Zeilen, gierig gefuellt. */
function umbrich(lage: Lage, laeufe: Lauf[], maxBreite: number): Lauf[][] {
  const zeilen: Lauf[][] = [];
  let zeile: Lauf[] = [];
  let breite = 0;

  const neueZeile = () => { if (zeile.length > 0) zeilen.push(zeile); zeile = []; breite = 0; };

  for (const lauf of laeufe) {
    for (const rohwort of lauf.text.split(/\s+/).filter((w) => w !== "")) {
      const woerter = breiteVon(lage, { ...lauf, text: rohwort }) > maxBreite
        ? zerlege(lage, rohwort, lauf, maxBreite)
        : [rohwort];

      for (const wort of woerter) {
        const zusatz = zeile.length === 0 ? wort : ` ${wort}`;
        const zusatzBreite = breiteVon(lage, { ...lauf, text: zusatz });
        if (zeile.length > 0 && breite + zusatzBreite > maxBreite) {
          neueZeile();
          zeile.push({ ...lauf, text: wort });
          breite = breiteVon(lage, { ...lauf, text: wort });
          continue;
        }
        const letzter = zeile[zeile.length - 1];
        if (letzter && letzter.fett === lauf.fett && letzter.klein === lauf.klein
            && letzter.ton === lauf.ton && letzter.grad === lauf.grad) {
          letzter.text += zusatz;
        } else {
          zeile.push({ ...lauf, text: zusatz });
        }
        breite += zusatzBreite;
      }
    }
  }
  neueZeile();
  return zeilen;
}

function zeilenBreite(lage: Lage, zeile: Lauf[]): number {
  return zeile.reduce((summe, lauf) => summe + breiteVon(lage, lauf), 0);
}

function zeilenHoehe(lage: Lage, zeilen: Lauf[][]): number {
  return zeilen.reduce(
    (summe, zeile) => summe + ZEILE * Math.max(...zeile.map((l) => grad(lage, l)), lage.dichte.klein),
    0,
  );
}

/** Setzt fertig umbrochene Zeilen ab `yOben` nach unten. */
function setze(
  lage: Lage, zeilen: Lauf[][], x: number, yOben: number, breite: number, aus: Ausrichtung,
): void {
  let y = yOben;
  for (const zeile of zeilen) {
    const hoehe = ZEILE * Math.max(...zeile.map((l) => grad(lage, l)), lage.dichte.klein);
    const grundlinie = y - hoehe + 0.25 * hoehe;
    const ueberhang = breite - zeilenBreite(lage, zeile);
    let cursor = x + (aus === "rechts" ? ueberhang : aus === "mitte" ? ueberhang / 2 : 0);
    for (const lauf of zeile) {
      zeichne(lage.seite, lauf.text, {
        x: cursor,
        y: grundlinie,
        size: grad(lage, lauf),
        font: schrift(lage, lauf),
        farbe: lauf.ton === "notiz" ? NOTIZ : lauf.ton === "gedaempft" ? GEDAEMPFT : TINTE,
      });
      cursor += breiteVon(lage, lauf);
    }
    y -= hoehe;
  }
}

/* ── Seiten ───────────────────────────────────────────────────────────────── */

function neueSeite(lage: Lage): void {
  const seite = lage.doc.addPage([A4.breite, A4.hoehe]);
  lage.seiten.push(seite);
  lage.seite = seite;
  lage.y = A4.hoehe - RAND.oben;

  // Ab der zweiten Seite eines Fahrzeugs: eine schmale Wiederholung des
  // Fahrzeugnamens. Ohne sie liegt ab Seite zwei eine Tabelle ohne Fahrzeug
  // auf dem Tisch — und auf einem Stapel Checklisten sind das genau die
  // Blaetter, die niemand mehr zuordnen kann.
  if (lage.seiten.length > 1) {
    const kennung = lage.blatt.kennung ? ` · ${lage.blatt.kennung}` : "";
    zeichne(lage.seite, `${lage.blatt.name}${kennung} — Fortsetzung`, {
      x: RAND.links, y: lage.y - 8, size: 8, font: lage.fett, farbe: GEDAEMPFT,
    });
    lage.y -= 8 + 2 * MM;
    strich(lage.seite, RAND.links, lage.y, SATZBREITE, 0.5, LINIE);
    lage.y -= 4 * MM;
  }
}

/** Braucht der naechste Block mehr Platz, als auf dieser Seite bleibt? */
function platz(lage: Lage, hoehe: number): void {
  if (lage.y - hoehe < RAND.unten + FUSS_RAUM) neueSeite(lage);
}

function strich(
  seite: PDFPage, x: number, y: number, breite: number, dicke: number, farbe: RGB,
): void {
  seite.drawLine({ start: { x, y }, end: { x: x + breite, y }, thickness: dicke, color: farbe });
}

function flaeche(
  seite: PDFPage, x: number, y: number, breite: number, hoehe: number, farbe: RGB,
): void {
  seite.drawRectangle({ x, y, width: breite, height: hoehe, color: farbe });
}

function kasten(seite: PDFPage, x: number, y: number): void {
  seite.drawRectangle({
    x, y, width: KASTEN, height: KASTEN,
    borderWidth: 0.7, borderColor: SCHREIBLINIE, color: rgb(1, 1, 1),
  });
}

/** Das Haekchen der Abhak-Spaltenueberschrift, gezeichnet statt gesetzt. */
function haekchen(seite: PDFPage, x: number, y: number, kante: number, farbe: RGB): void {
  const strichstaerke = 0.9;
  seite.drawLine({
    start: { x, y: y + 0.45 * kante },
    end: { x: x + 0.38 * kante, y },
    thickness: strichstaerke, color: farbe,
  });
  seite.drawLine({
    start: { x: x + 0.38 * kante, y },
    end: { x: x + kante, y: y + kante },
    thickness: strichstaerke, color: farbe,
  });
}

/* ── Blattkopf, Unterschriften, Fuss ──────────────────────────────────────── */

function zeichneKopf(lage: Lage): void {
  const { blatt, stand } = lage;
  const oben = lage.y;

  zeichne(lage.seite, blatt.name, {
    x: RAND.links, y: oben - 15, size: 15, font: lage.fett,
  });
  let unterkante = oben - 15 - 4 * MM;
  if (blatt.kennung) {
    zeichne(lage.seite, blatt.kennung, {
      x: RAND.links, y: oben - 15 - 3.6 * MM, size: 10, font: lage.fett,
    });
    unterkante = oben - 15 - 3.6 * MM - 1.5 * MM;
  }

  const rechts = [
    "Fahrzeug-Checkliste",
    blatt.vorlage ? `Vorlage: ${blatt.vorlage}` : "ohne Vorlage",
    `${blatt.positionen} ${blatt.positionen === 1 ? "Position" : "Positionen"} · Stand ${stand}`,
  ];
  let y = oben - 8;
  for (const zeile of rechts) {
    const breite = lage.normal.widthOfTextAtSize(winAnsi(zeile), 8);
    zeichne(lage.seite, zeile, {
      x: A4.breite - RAND.rechts - breite, y, size: 8, font: lage.normal, farbe: GEDAEMPFT,
    });
    y -= 8 * 1.4;
  }
  y += 8 * 1.4;   // zurueck auf die Grundlinie der LETZTEN Zeile

  // Die kraeftige Unterkante trennt „welches Fahrzeug" von „was ist zu tun" und
  // ueberlebt auch einen schwachen Toner — der einzige kraeftige Strich des
  // Blattes. Sie liegt unter der TIEFEREN der beiden Spalten; ohne das
  // `Math.min` schnitte sie durch den Kopf des laengeren Blocks.
  lage.y = Math.min(unterkante, y - 1.5 * MM);
  strich(lage.seite, RAND.links, lage.y, SATZBREITE, 1.6, TINTE);
  lage.y -= 5 * MM;
}

function zeichneSignatur(lage: Lage): void {
  const felder = ["Geprüft von", "Datum", "Unterschrift"];
  const spalte = SATZBREITE / felder.length;
  const y = lage.y;

  felder.forEach((feld, i) => {
    const x = RAND.links + i * spalte;
    zeichne(lage.seite, feld, { x, y: y - 9, size: 9, font: lage.normal, farbe: GEDAEMPFT });
    const linkeKante = x + lage.normal.widthOfTextAtSize(winAnsi(feld), 9) + 2 * MM;
    strich(lage.seite, linkeKante, y - 9 - 1 * MM, x + spalte - 5 * MM - linkeKante,
      0.7, SCHREIBLINIE);
  });

  lage.y = y - 9 - 5 * MM;
}

function zeichneFuesse(lage: Lage): void {
  const kennung = lage.blatt.kennung ? ` · ${lage.blatt.kennung}` : "";
  const links = `${lage.blatt.name}${kennung} · Stand ${lage.stand}`;

  lage.seiten.forEach((seite, i) => {
    const y = RAND.unten + 4 * MM;
    strich(seite, RAND.links, y + 3 * MM, SATZBREITE, 0.5, LINIE);
    zeichne(seite, links, { x: RAND.links, y, size: 7.5, font: lage.normal, farbe: NOTIZ });
    const rechts = `Seite ${i + 1} von ${lage.seiten.length}`;
    const breite = lage.normal.widthOfTextAtSize(winAnsi(rechts), 7.5);
    zeichne(seite, rechts, {
      x: A4.breite - RAND.rechts - breite, y, size: 7.5, font: lage.normal, farbe: NOTIZ,
    });
  });
}

/* ── Ueberschriften ───────────────────────────────────────────────────────── */

function zeichneAbschnitt(lage: Lage, titel: string): void {
  // Eine Ueberschrift am Seitenfuss, deren Tabelle erst auf der Folgeseite
  // beginnt, ist der klassische Druckfehler dieser Sorte Blatt. 24mm decken
  // Ueberschrift, Tabellenkopf und eine erste Zeile ab.
  platz(lage, lage.dichte.abschnittOben + 24 * MM);
  // ⚠️ ERST DEN ABSTAND, DANN DIE SCHRIFTHOEHE. `lage.y` ist die Unterkante des
  // Vorigen, `drawText` erwartet eine GRUNDLINIE: ohne den zweiten Abzug sitzt
  // die Ueberschrift mit ihrer vollen Hoehe IN dem Abstand, den sie eigentlich
  // ueber sich haben soll — sichtbar wird das als Zeile, die an der letzten
  // Tabellenzeile darueber klebt.
  lage.y -= lage.dichte.abschnittOben + 10;
  zeichne(lage.seite, titel.toUpperCase(), {
    x: RAND.links, y: lage.y, size: 10, font: lage.fett,
  });
  lage.y -= 1.5 * MM;
  strich(lage.seite, RAND.links, lage.y, SATZBREITE, 0.7, TINTE);
  lage.y -= 3 * MM;
}

function zeichneFach(lage: Lage, fach: ChecklisteFach): void {
  platz(lage, lage.dichte.fachOben + 20 * MM);
  lage.y -= lage.dichte.fachOben + 9.5;   // Abstand plus Schrifthoehe, s. o.
  const zahl = `(${fach.positionen.length} ${fach.positionen.length === 1 ? "Position" : "Positionen"})`;
  zeichne(lage.seite, fach.label, { x: RAND.links, y: lage.y, size: 9.5, font: lage.fett });
  const nach = RAND.links + lage.fett.widthOfTextAtSize(winAnsi(fach.label), 9.5) + 1.5 * MM;
  zeichne(lage.seite, zahl, { x: nach, y: lage.y, size: 8, font: lage.normal, farbe: NOTIZ });
  lage.y -= 3 * MM;
}

/* ── Tabelle ──────────────────────────────────────────────────────────────── */

/** Spaltenbreiten in Punkten; genau eine Spalte (`mm: null`) nimmt den Rest. */
function breiten(spalten: Spalte[]): number[] {
  const fest = spalten.reduce((s, sp) => s + (sp.mm ?? 0) * MM, 0);
  return spalten.map((sp) => (sp.mm === null ? SATZBREITE - fest : sp.mm * MM));
}

/**
 * Der Schriftgrad einer Spaltenueberschrift — in aller Regel `dichte.kopf`.
 *
 * ⚠️ ER SCHRUMPFT, WENN EIN EINZELNES WORT NICHT IN DIE SPALTE PASST, statt es
 * zu trennen. Der Umbrecher darunter zerlegt zu lange Woerter, und fuer einen
 * Artikelnamen ist das richtig — ein gekuerzter Name schickt jemanden mit
 * halber Information los. An einer Ueberschrift ergibt dieselbe Regel
 * „HANDLAG / ER", und das liest sich wie ein Datenfehler. Die Spaltenbreiten
 * weiter unten sind so gewaehlt, dass dieser Zweig heute nirgends greift; er
 * steht fuer den Tag, an dem jemand eine Ueberschrift umbenennt.
 */
function kopfgrad(lage: Lage, spalte: Spalte, breite: number): number {
  const nutz = breite - 2 * lage.dichte.polster;
  const laengstes = Math.max(...spalte.kopf.toUpperCase().split(/\s+/).map(
    (wort) => lage.fett.widthOfTextAtSize(winAnsi(wort), lage.dichte.kopf),
  ));
  return laengstes <= nutz ? lage.dichte.kopf : lage.dichte.kopf * (nutz / laengstes);
}

/**
 * Die Kopfzeile einer Tabelle.
 *
 * ⚠️ SIE BRICHT UM WIE JEDE ANDERE ZELLE. „Nennfülldruck" ist bei 7,5pt breiter
 * als seine 26mm-Spalte, und ein PDF beschneidet nichts: der ueberstehende Teil
 * laeuft ungefragt in die Nachbarspalte und sieht dort aus wie deren Inhalt.
 * Ein Browser haette dieselbe Ueberschrift von selbst umbrochen — hier muss es
 * dastehen.
 */
function zeichneTabellenkopf(lage: Lage, spalten: Spalte[], breite: number[]): void {
  const zeilen = spalten.map((spalte, i) =>
    spalte.haken
      ? []
      : umbrich(
          lage,
          [{
            text: spalte.kopf.toUpperCase(),
            fett: true,
            grad: kopfgrad(lage, spalte, breite[i]!),
          }],
          breite[i]! - 2 * lage.dichte.polster,
        ));
  const hoehe = Math.max(...zeilen.map((z) => zeilenHoehe(lage, z)), lage.dichte.kopf * ZEILE)
    + 2 * lage.dichte.polster;
  const unten = lage.y - hoehe;

  let x = RAND.links;
  spalten.forEach((spalte, i) => {
    // Die Toenung laeuft von der Ueberschrift bis zur letzten Zeile durch —
    // nur am Koerper gesetzt, begaenne sie eine Zeile zu spaet.
    if (spalte.schreibfeld) flaeche(lage.seite, x, unten, breite[i]!, hoehe, SCHREIBFELD);
    if (spalte.haken) {
      const kante = 2.6 * MM;
      haekchen(lage.seite, x + (breite[i]! - kante) / 2, unten + (hoehe - kante) / 2,
        kante, GEDAEMPFT);
    } else {
      const nutz = breite[i]! - 2 * lage.dichte.polster;
      setze(lage, zeilen[i]!.map((zeile) => zeile.map((l) => ({ ...l, ton: "gedaempft" as const }))),
        x + lage.dichte.polster, lage.y - lage.dichte.polster, nutz, spalte.aus ?? "links");
    }
    x += breite[i]!;
  });

  strich(lage.seite, RAND.links, unten, SATZBREITE, 0.7, TINTE);
  lage.y = unten;
}

function zellHoehe(lage: Lage, zelle: Zelle, breite: number): number {
  switch (zelle.art) {
    case "text":
      return zeilenHoehe(lage, umbrich(lage, zelle.laeufe, breite - 2 * lage.dichte.polster));
    case "kasten":
      return KASTEN;
    case "wahl":
      return wahlZeilen(lage, zelle.optionen, breite - 2 * lage.dichte.polster).length
        * wahlZeilenHoehe(lage);
    case "leer":
      return 0;
  }
}

/**
 * Zeilenhoehe der Zustandswahl.
 *
 * ⚠️ SIE MISST AM KAESTCHEN, NICHT AN DER SCHRIFT. Bei `Math.max(KASTEN,
 * grad * ZEILE)` bliebe zwischen den Kaesten zweier Zeilen weniger als ein
 * halber Punkt Luft — die Kaesten sehen dann aus wie eine zusammenhaengende
 * Leiter, und beim Ankreuzen trifft der Strich zwei davon.
 */
function wahlZeilenHoehe(lage: Lage): number {
  return Math.max(KASTEN + 1.4 * MM, lage.dichte.klein * ZEILE);
}

/** Die drei Zustaende als Kaestchen mit Beschriftung, gierig auf Zeilen verteilt. */
function wahlZeilen(lage: Lage, optionen: readonly string[], breite: number): string[][] {
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let belegt = 0;
  for (const option of optionen) {
    const b = KASTEN + 1.2 * MM + lage.normal.widthOfTextAtSize(winAnsi(option), lage.dichte.klein)
      + 3 * MM;
    if (zeile.length > 0 && belegt + b > breite) { zeilen.push(zeile); zeile = []; belegt = 0; }
    zeile.push(option);
    belegt += b;
  }
  if (zeile.length > 0) zeilen.push(zeile);
  return zeilen;
}

function zeichneZeile(
  lage: Lage, spalten: Spalte[], breite: number[], zellen: Zelle[], gerade: boolean,
): void {
  const inhalt = Math.max(
    ...zellen.map((zelle, i) => zellHoehe(lage, zelle, breite[i]!)),
    KASTEN,
  );
  const hoehe = inhalt + 2 * lage.dichte.polster;
  const unten = lage.y - hoehe;

  if (gerade) flaeche(lage.seite, RAND.links, unten, SATZBREITE, hoehe, ZEBRA);

  let x = RAND.links;
  spalten.forEach((spalte, i) => {
    const b = breite[i]!;
    // Zebra am Zeilen-, Toenung am Zellenrechteck: die Zellenflaeche deckt die
    // Zeilenflaeche ab, ganz ohne Reihenfolgestreit.
    if (spalte.schreibfeld) {
      flaeche(lage.seite, x, unten, b, hoehe, SCHREIBFELD);
      lage.seite.drawLine({
        start: { x, y: unten }, end: { x, y: unten + hoehe }, thickness: 0.5, color: LINIE,
      });
      lage.seite.drawLine({
        start: { x: x + b, y: unten }, end: { x: x + b, y: unten + hoehe },
        thickness: 0.5, color: LINIE,
      });
    }

    const zelle = zellen[i]!;
    const yOben = lage.y - lage.dichte.polster;
    if (zelle.art === "text") {
      const nutz = b - 2 * lage.dichte.polster;
      setze(lage, umbrich(lage, zelle.laeufe, nutz), x + lage.dichte.polster, yOben, nutz,
        zelle.aus ?? spalte.aus ?? "links");
    } else if (zelle.art === "kasten") {
      kasten(lage.seite, x + (b - KASTEN) / 2, unten + (hoehe - KASTEN) / 2);
    } else if (zelle.art === "wahl") {
      const nutz = b - 2 * lage.dichte.polster;
      const hoeheJeZeile = wahlZeilenHoehe(lage);
      let y = yOben;
      for (const zeile of wahlZeilen(lage, zelle.optionen, nutz)) {
        let cursor = x + lage.dichte.polster;
        for (const option of zeile) {
          kasten(lage.seite, cursor, y - hoeheJeZeile + (hoeheJeZeile - KASTEN) / 2);
          cursor += KASTEN + 1.2 * MM;
          zeichne(lage.seite, option, {
            x: cursor,
            y: y - hoeheJeZeile + (hoeheJeZeile - lage.dichte.klein) / 2 + 0.15 * lage.dichte.klein,
            size: lage.dichte.klein, font: lage.normal,
          });
          cursor += lage.normal.widthOfTextAtSize(winAnsi(option), lage.dichte.klein) + 3 * MM;
        }
        y -= hoeheJeZeile;
      }
    }
    x += b;
  });

  strich(lage.seite, RAND.links, unten, SATZBREITE, 0.4, LINIE);
  lage.y = unten;
}

/**
 * Eine Tabelle mit wiederholtem Kopf.
 *
 * ⚠️ DER KOPF WIRD AUF JEDER FOLGESEITE NEU GESETZT — dasselbe, was
 * `display: table-header-group` im Stylesheet zusichert. Ohne ihn steht ab
 * Seite zwei eine Spalte „20" ohne Ueberschrift da, und niemand weiss mehr, ob
 * das Soll oder Ist ist.
 *
 * ⚠️ UND JEDE ZEILE BLEIBT GANZ. Bricht eine Zeile ueber den Seitenrand, landet
 * das Kaestchen auf Seite 1 und der Artikelname auf Seite 2 — auf einer
 * Abhakliste ein echter Fehler, nicht bloss haesslich.
 */
function zeichneTabelle(lage: Lage, spalten: Spalte[], zeilen: Zelle[][]): void {
  const b = breiten(spalten);
  zeichneTabellenkopf(lage, spalten, b);

  zeilen.forEach((zellen, i) => {
    const hoehe = Math.max(
      ...zellen.map((zelle, j) => zellHoehe(lage, zelle, b[j]!)), KASTEN,
    ) + 2 * lage.dichte.polster;
    if (lage.y - hoehe < RAND.unten + FUSS_RAUM) {
      neueSeite(lage);
      zeichneTabellenkopf(lage, spalten, b);
    }
    zeichneZeile(lage, spalten, b, zellen, i % 2 === 1);
  });
}

/* ── Die drei Abschnitte ──────────────────────────────────────────────────── */

/** Die Abhak-Spalte. Ihre Ueberschrift ist gezeichnet, nicht gesetzt — siehe
 *  `Spalte.haken`. Der Name im Feld `kopf` steht fuer Lesegeraete und fuer die
 *  Suche im Quelltext, gezeichnet wird er nie. */
const HAKEN = { mm: 8, aus: "mitte", haken: true } as const;

function bestueckung(lage: Lage, blind: boolean): void {
  zeichneAbschnitt(lage, "Bestückung");
  for (const fach of lage.blatt.faecher) {
    zeichneFach(lage, fach);
    zeichneTabelle(
      lage,
      [
        { ...HAKEN, kopf: "Geprüft" },
        { kopf: "Artikel", mm: null },
        { kopf: "Handlager", mm: 21 },
        // Bei Blindzaehlung traegt die Spalte nur noch die Einheit — die
        // Ueberschrift sagt das, statt eine leere „Soll"-Spalte zu zeigen.
        { kopf: blind ? "Einheit" : "Soll", mm: 20, aus: "rechts" },
        { kopf: "Ist", mm: 22, aus: "rechts", schreibfeld: true },
        { kopf: "Verfall", mm: 26 },
      ],
      fach.positionen.map((position): Zelle[] => [
        { art: "kasten" },
        { art: "text", laeufe: [{ text: position.artikelName, fett: true }] },
        { art: "text", laeufe: [{ text: position.handlagerFach || "–", klein: true, ton: "notiz" }] },
        {
          art: "text",
          // ⚠️ BEI BLINDZAEHLUNG ENTSTEHT DIE ZAHL GAR NICHT. Sie wird nicht
          // verdeckt: ein bloss ueberdecktes Soll stuende weiterhin im
          // Textlayer des PDF, und genau dort wuerde es beim Suchen wieder
          // sichtbar — „Blindzaehlung" waere dann eine Behauptung statt einer
          // Eigenschaft. Dieselbe Regel wie im HTML-Blatt.
          laeufe: [{ text: blind ? position.einheit : `${position.soll} ${position.einheit}` }],
        },
        { art: "leer" },
        {
          art: "text",
          laeufe: position.verfallText === null ? [] : [{
            text: (position.verfallAuffaellig ? "! " : "") + position.verfallText,
            klein: true,
            // Papier ist einfarbig: die Auszeichnung ist fett plus Rufzeichen,
            // nie Rot.
            fett: position.verfallAuffaellig,
          }],
        },
      ]),
    );
  }
}

function geraete(lage: Lage): void {
  zeichneAbschnitt(lage, "Geräte");
  zeichneTabelle(
    lage,
    [
      { ...HAKEN, kopf: "Vorhanden" },
      { kopf: "Gerät", mm: null },
      { kopf: "Zustand", mm: 55 },
      { kopf: "Bemerkung", mm: 38, schreibfeld: true },
    ],
    lage.blatt.geraete.map((geraet): Zelle[] => [
      { art: "kasten" },
      {
        art: "text",
        laeufe: [
          { text: geraet.name, fett: true },
          ...(geraet.fristText === null ? [] : [{
            text: (geraet.fristAuffaellig ? "! " : "") + geraet.fristText,
            klein: true,
            fett: geraet.fristAuffaellig,
            ton: geraet.fristAuffaellig ? undefined : ("notiz" as const),
          }]),
        ],
      },
      { art: "wahl", optionen: ZUSTAENDE },
      { art: "leer" },
    ]),
  );
}

function sauerstoff(lage: Lage): void {
  zeichneAbschnitt(lage, "Sauerstoff");
  zeichneTabelle(
    lage,
    [
      { ...HAKEN, kopf: "Geprüft" },
      { kopf: "Flasche", mm: null },
      { kopf: "Nennfülldruck", mm: 30, aus: "rechts" },
      { kopf: "zuletzt", mm: 24, aus: "rechts" },
      { kopf: "gemessen (bar)", mm: 26, aus: "rechts", schreibfeld: true },
    ],
    lage.blatt.flaschen.map((flasche): Zelle[] => [
      { art: "kasten" },
      { art: "text", laeufe: [{ text: flasche.name, fett: true }] },
      { art: "text", laeufe: [{ text: `${flasche.nennfuelldruckBar} bar` }] },
      {
        art: "text",
        // ⚠️ `null` IST „NIE GEMESSEN", NICHT 0 bar (§5.12). Ein gedrucktes
        // „0 bar" behauptete auf einem Nachweis eine leere Flasche, die niemand
        // gemessen hat — genau der Fehlalarm, wegen dem der Typ nullbar ist.
        laeufe: flasche.letzterDruck === null
          ? [{ text: "nie gemessen", klein: true, ton: "notiz" as const }]
          : [{ text: `${flasche.letzterDruck} bar` }],
      },
      { art: "leer" },
    ]),
  );
}

/* ── Der Bogen ────────────────────────────────────────────────────────────── */

export type ChecklistePdfOptionen = {
  /** „TT.MM.JJJJ" aus `standDatum()` — derselbe Vermerk wie auf dem Blatt. */
  stand: string;
  /** Sollmengen weglassen (nicht verdecken). */
  blind?: boolean;
  /** Die dichtere der zwei Bediendichten. */
  kompakt?: boolean;
  /** Nur fuer Tests: ein festes Erstellungsdatum in den Metadaten. */
  erstellt?: Date;
};

/**
 * Der fertige Bogen: ein Fahrzeug beginnt IMMER auf einer neuen Seite.
 *
 * ⚠️ EIN FAHRZEUG JE SEITENFOLGE, UND KEINE LEERE SCHLUSSSEITE. Der Umbruch
 * entsteht dadurch, dass jedes Blatt seine erste Seite selbst anlegt — nicht
 * dadurch, dass nach jedem Blatt eine Seite angehaengt wuerde. Der Unterschied
 * ist derselbe wie zwischen `break-before` und `break-after` im Stylesheet:
 * die zweite Form wirft hinter dem letzten Fahrzeug ein leeres Blatt aus, und
 * beim Druck EINER Checkliste waere die Haelfte des Ausdrucks leer.
 */
export async function checklistenPdf(
  blaetter: ChecklisteBlatt[],
  optionen: ChecklistePdfOptionen,
): Promise<Uint8Array> {
  const { stand, blind = false, kompakt = false, erstellt = new Date() } = optionen;

  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle(winAnsi(
    blaetter.length === 1
      ? `Fahrzeug-Checkliste ${blaetter[0]!.name} (Stand ${stand})`
      : `Fahrzeug-Checklisten (Stand ${stand})`,
  ));
  doc.setSubject("Fahrzeug-Checkliste zum Abhaken");
  doc.setCreator("iuk-suite · Lagerbuch");
  doc.setProducer("iuk-suite · Lagerbuch");
  doc.setCreationDate(erstellt);
  doc.setModificationDate(erstellt);

  for (const blatt of blaetter) {
    const lage: Lage = {
      doc, normal, fett,
      dichte: kompakt ? DICHTE.kompakt : DICHTE.weit,
      blatt, stand,
      seiten: [],
      seite: undefined as unknown as PDFPage,
      y: 0,
    };
    neueSeite(lage);
    zeichneKopf(lage);
    zeichneSignatur(lage);

    const leer = blatt.faecher.length === 0
      && blatt.geraete.length === 0
      && blatt.flaschen.length === 0;

    if (leer) {
      // Der leere Fall wird BENANNT, statt ein leeres Blatt auszugeben — sonst
      // sieht ein Fahrzeug ohne gepflegtes Soll wie ein Datenverlust aus.
      setze(lage, umbrich(lage, [{
        text: "Für dieses Fahrzeug ist weder eine Soll-Bestückung noch ein Gerät oder eine "
          + "Sauerstoffflasche hinterlegt. Es gibt nichts abzuhaken.",
        ton: "notiz",
      }], SATZBREITE), RAND.links, lage.y, SATZBREITE, "links");
    }

    if (blatt.faecher.length > 0) bestueckung(lage, blind);
    if (blatt.geraete.length > 0) geraete(lage);
    if (blatt.flaschen.length > 0) sauerstoff(lage);

    zeichneFuesse(lage);
  }

  return doc.save();
}

/**
 * Der Dateiname des Downloads — ASCII, weil er ungequotet in
 * `Content-Disposition: attachment; filename="…"` steht.
 *
 * ⚠️ ER IST EINE BESCHRIFTUNG, KEIN SCHLUESSEL. Zwei Fahrzeuge, deren Namen
 * sich nur in Zeichen unterscheiden, die hier wegfallen, bekommen denselben
 * Namen — das ist hingenommen: die Datei traegt Fahrzeugname und Stand IM
 * Dokument, und dort steht der ungekuerzte Text.
 */
export function pdfDateiname(blaetter: ChecklisteBlatt[], stand: string): string {
  const datum = stand.split(".").reverse().join("-");
  if (blaetter.length !== 1) return `checklisten-${datum}.pdf`;
  const name = blaetter[0]!.name
    // ⚠️ DIE UMLAUTE ZUERST, DANN ZERLEGEN. `normalize("NFKD")` spaltet „ö" in
    // „o" + Trema; danach trifft `/ö/` nichts mehr, und aus „Löschfahrzeug"
    // wird still „loschfahrzeug" statt „loeschfahrzeug".
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // was an Zeichen uebrig bleibt, faellt weg
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `checkliste-${name || "fahrzeug"}-${datum}.pdf`;
}
