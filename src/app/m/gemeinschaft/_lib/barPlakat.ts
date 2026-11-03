/**
 * Das QR-Plakat für die öffentliche Bar-Anfrage (`/bar`, IDA-334): ein A4-Blatt zum Aushängen, als echte PDF-Datei.
 *
 * Datei statt Druckseite aus demselben Grund wie `lagerbuch/_lib/checklistePdf.ts`: der Druckdialog setzt je
 * Browser andere Ränder, Kopf- und Fußzeilen, und auf dem Telefon fehlt er oft ganz. Eine Datei lässt sich
 * weiterschicken und kommt beim Copyshop so an, wie sie gemeint ist.
 *
 * Die Optik folgt der öffentlichen Ansicht (`_ui/offen/gemeinschaft-offen.css`): Fahne in Suite-Rot, Kicker
 * „Gemeinschaft · Bar“ mit Wortzeichen „IDA“, Titel in Graphit-Tinte, warmer Grund. Rot bleibt Marke (Fahne,
 * Wortzeichen) und wird nie Fläche (Falle 3). Der Code selbst ist schwarz auf Weiß mit Ruhezone — warmer Grund
 * nur außen herum, sonst sinkt der Kontrast für billige Kameras.
 *
 * Helvetica aus den 14 Standardschriften, keine eingebettete Schrift (Begründung in `checklistePdf.ts`). Alle
 * festen Texte sind WinAnsi; die Adresse ist ASCII, weil sie aus Host und Pfad besteht.
 *
 * Kein `"use client"`: nur der Route Handler und Vitest lesen diese Datei.
 */
import { PDFDocument, StandardFonts, rgb, setCharacterSpacing, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { QR_OPTIONS } from "@/core/qr";

const MM = 72 / 25.4;
const A4 = { breite: 210 * MM, hoehe: 297 * MM };
const RAND = 18 * MM;
const SATZ = A4.breite - 2 * RAND;

function hex(h: string): RGB {
  const n = Number.parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Dieselben Werte wie die hellen `--go-*` der öffentlichen Ansicht. */
const FARBE = {
  rot: hex("#c8000f"),
  tinte: hex("#16181a"),
  gedaempft: hex("#5e625f"),
  grund: hex("#f4f1ea"),
  linie: hex("#ddd8ce"),
  weiss: rgb(1, 1, 1),
  schwarz: rgb(0, 0, 0),
};

export const PLAKAT_DATEINAME = "Bar-mieten-QR-Plakat.pdf";

/** Die Adresse, wie sie unter dem Code steht: ohne Schema und ohne Schrägstrich am Ende. */
export function plakatAdresse(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Text mit Sperrung; `widthOfTextAtSize` kennt die Sperrung nicht, deshalb hier mitgerechnet. */
function breiteGesperrt(text: string, schrift: PDFFont, grad: number, sperrung: number): number {
  return schrift.widthOfTextAtSize(text, grad) + sperrung * Math.max(0, text.length - 1);
}

function schreibeGesperrt(seite: PDFPage, text: string, x: number, y: number, schrift: PDFFont, grad: number, farbe: RGB, sperrung: number) {
  seite.pushOperators(setCharacterSpacing(sperrung));
  seite.drawText(text, { x, y, size: grad, font: schrift, color: farbe });
  seite.pushOperators(setCharacterSpacing(0));
}

/** Größter Schriftgrad ≤ `grad`, bei dem `text` in `breite` passt. */
function passend(text: string, schrift: PDFFont, grad: number, breite: number): number {
  const b = schrift.widthOfTextAtSize(text, grad);
  return b <= breite ? grad : Math.floor((grad * breite) / b * 10) / 10;
}

/**
 * Die dunklen Module als waagrechte Läufe: eine Zeile aus Läufen statt Einzelquadraten hält die Datei klein und
 * lässt zwischen benachbarten Modulen keine Haarlinien stehen, die manche Betrachter beim Glätten zeigen.
 */
export function qrLaeufe(text: string): { module: number; laeufe: { zeile: number; spalte: number; laenge: number }[] } {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const n = qr.modules.size;
  const laeufe: { zeile: number; spalte: number; laenge: number }[] = [];
  for (let zeile = 0; zeile < n; zeile++) {
    let start = -1;
    for (let spalte = 0; spalte <= n; spalte++) {
      const dunkel = spalte < n && qr.modules.get(zeile, spalte) === 1;
      if (dunkel && start < 0) start = spalte;
      if (!dunkel && start >= 0) {
        laeufe.push({ zeile, spalte: start, laenge: spalte - start });
        start = -1;
      }
    }
  }
  return { module: n, laeufe };
}

function zeichneQr(seite: PDFPage, text: string, x: number, y: number, kante: number) {
  const { module, laeufe } = qrLaeufe(text);
  const ruhe = QR_OPTIONS.margin;
  const m = kante / (module + 2 * ruhe);
  seite.drawRectangle({ x, y, width: kante, height: kante, color: FARBE.weiss });
  const oben = y + kante - ruhe * m;
  for (const l of laeufe) {
    seite.drawRectangle({ x: x + (ruhe + l.spalte) * m, y: oben - (l.zeile + 1) * m, width: l.laenge * m, height: m, color: FARBE.schwarz });
  }
}

/** Das Plakat für `url` (die volle Adresse der Anfrageseite, etwa `https://gemeinschaft.example/bar`). */
export async function barPlakatPdf(url: string, erstellt: Date = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Bar mieten");
  doc.setSubject(plakatAdresse(url));
  doc.setCreator("IDA · Gemeinschaft");
  doc.setProducer("IDA");
  doc.setCreationDate(erstellt);
  doc.setModificationDate(erstellt);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const seite = doc.addPage([A4.breite, A4.hoehe]);

  // Fahne: die 3px-Linie der öffentlichen Ansicht, auf Papier etwas kräftiger.
  let y = A4.hoehe - RAND;
  seite.drawRectangle({ x: RAND, y: y - 2.5 * MM, width: SATZ, height: 2.5 * MM, color: FARBE.rot });

  // Kicker links, Wortzeichen rechts.
  y -= 2.5 * MM + 9 * MM;
  schreibeGesperrt(seite, "GEMEINSCHAFT · BAR", RAND, y, fett, 11, FARBE.gedaempft, 1.6);
  const ida = breiteGesperrt("IDA", fett, 12, 1.2);
  schreibeGesperrt(seite, "IDA", RAND + SATZ - ida, y, fett, 12, FARBE.rot, 1.2);

  // Titel und Zeile darunter.
  y -= 30 * MM;
  seite.drawText("Bar mieten", { x: RAND, y, size: 80, font: fett, color: FARBE.tinte });
  y -= 14 * MM;
  seite.drawText("Freie Tage ansehen und anfragen.", { x: RAND, y, size: 22, font: normal, color: FARBE.gedaempft });

  // Fläche mit dem Code, Adresse darunter.
  const flaecheOben = y - 12 * MM;
  const flaecheUnten = RAND + 16 * MM;
  seite.drawRectangle({ x: RAND, y: flaecheUnten, width: SATZ, height: flaecheOben - flaecheUnten, color: FARBE.grund });
  const adresse = plakatAdresse(url);
  const adressGrad = passend(adresse, fett, 22, SATZ - 20 * MM);
  const adressY = flaecheUnten + 14 * MM;
  const kante = Math.min(SATZ - 40 * MM, flaecheOben - adressY - 26 * MM);
  const qrY = adressY + 12 * MM;
  zeichneQr(seite, url, RAND + (SATZ - kante) / 2, qrY, kante);
  seite.drawText(adresse, {
    x: RAND + (SATZ - fett.widthOfTextAtSize(adresse, adressGrad)) / 2,
    y: adressY,
    size: adressGrad,
    font: fett,
    color: FARBE.tinte,
  });

  // Fuß: eine Linie und die eine Zusage, die vor dem Scannen zählt.
  const fussY = RAND;
  seite.drawLine({ start: { x: RAND, y: fussY + 8 * MM }, end: { x: RAND + SATZ, y: fussY + 8 * MM }, thickness: 0.75, color: FARBE.linie });
  seite.drawText("Anfrage ohne Anmeldung", { x: RAND, y: fussY, size: 12, font: normal, color: FARBE.gedaempft });

  return doc.save();
}
