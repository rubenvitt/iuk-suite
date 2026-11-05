import {
  PDFCheckBox, PDFDocument, PDFName, PDFSignature, PDFTextField, StandardFonts, rgb,
  type PDFField, type PDFFont, type PDFImage, type PDFPage, type PDFWidgetAnnotation,
} from "pdf-lib";
import { winAnsi } from "@/core/pdf/winAnsi";
import { eingangText } from "./vermietungText";
import { EIGENE_SEITE, type FeldArt, type Rect, type Seitenmass, type Vertragsfeld, type Werte } from "./vertragFeld";

/**
 * Die Dokumente einer Vermietung als PDF (IDA-343, IDA-354), Serverseite: eine Vorlage lesen (Seiten und
 * Formularfelder) und aus Vorlage, Werten der Leitung und Unterschriften die Fassung bauen, die alle sehen.
 *
 * Formularfelder (AcroForm) füllt pdf-lib selbst und die Fassung wird danach „flach“ gemacht: die Werte stehen fest
 * auf der Seite, nichts lässt sich im PDF-Betrachter mehr ändern. Ein Feld, das pdf-lib nicht füllen kann (fremde
 * Schrift, kaputtes Widget), bekommt seinen Wert als Text an seine Stelle gezeichnet. Text läuft durch `winAnsi()`
 * (die Standardschrift kennt nur WinAnsi und würfe sonst erst beim Zeichnen).
 */

const A4 = { b: 595.28, h: 841.89 } as const;

export type VorlagePruefung = { ok: true; seiten: Seitenmass[]; formular: Vertragsfeld[] } | { ok: false; fehler: string };

function artVon(f: PDFField): FeldArt | null {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "ankreuz";
  if (f instanceof PDFSignature) return "unterschrift";
  return null; // Auswahllisten, Optionsgruppen, Knöpfe: bleiben, wie die Vorlage sie hat.
}

function seiteVon(doc: PDFDocument, w: PDFWidgetAnnotation): number {
  const seiten = doc.getPages();
  const p = w.P();
  const i = p ? seiten.findIndex((s) => s.ref === p) : -1;
  if (i >= 0) return i;
  const ref = doc.context.getObjectRef(w.dict);
  return seiten.findIndex((s) => s.node.Annots()?.asArray().some((a) => a === ref) ?? false);
}

/** Lesbarer Name aus dem vollen Feldnamen: „Mieter.Name_1“ → „Mieter Name 1“. */
const lesbar = (name: string) => name.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Feld";

/** Die Formularfelder der PDF, die die Suite füllen kann, als Feldliste (Lage: das erste Widget). */
export function formularfelder(doc: PDFDocument): Vertragsfeld[] {
  let felder: PDFField[];
  try {
    felder = doc.getForm().getFields();
  } catch {
    return [];
  }
  const aus: Vertragsfeld[] = [];
  felder.forEach((f, i) => {
    const art = artVon(f);
    const w = art ? f.acroField.getWidgets()[0] : undefined;
    if (!art || !w) return;
    const seite = seiteVon(doc, w);
    if (seite < 0) return;
    const r = w.getRectangle();
    if (!(r.width > 0 && r.height > 0)) return;
    const name = f.getName();
    aus.push({
      id: `f:${i}`, art, name: lesbar(name), quelle: "formular", formular: name, seite,
      x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      ...(art === "unterschrift" ? { rolle: "mieter" as const } : {}),
    });
  });
  return aus.slice(0, 200);
}

/** Lässt sich die PDF weiterverarbeiten? Verschlüsselte oder kaputte Dateien taugen nicht als Vorlage. */
export async function leseVorlage(bytes: Uint8Array): Promise<VorlagePruefung> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const seiten = doc.getPages().map((p) => { const { width, height } = p.getSize(); return { b: width, h: height }; });
    if (seiten.length === 0) return { ok: false, fehler: "Die PDF hat keine Seiten." };
    return { ok: true, seiten, formular: formularfelder(doc) };
  } catch {
    return { ok: false, fehler: "Diese PDF lässt sich nicht verarbeiten (geschützt oder beschädigt). Bitte ohne Passwort neu speichern." };
  }
}

export type Unterschrift = { feldId: string; rolle: "leitung" | "mieter"; name: string; am: number; bild: Buffer };

/** `titel` landet im Feld Titel der PDF; sonst bliebe der der Vorlage, etwa „IDA“ aus einem Browserdruck. */
export type Rahmen = { titel: string; dokument: string; zeitraum: string; anlass: string; am: number };

/** Bild so groß wie möglich in den Kasten, Seitenverhältnis bleibt, zentriert. */
export function indenKasten(bild: PDFImage, k: { x: number; y: number; b: number; h: number }) {
  const s = Math.min(k.b / bild.width, k.h / bild.height);
  const b = bild.width * s, h = bild.height * s;
  return { x: k.x + (k.b - b) / 2, y: k.y + (k.h - h) / 2, width: b, height: h };
}

function zeileUnterFeld(seite: PDFPage, text: string, x: number, y: number, breite: number, schrift: PDFFont) {
  let grad = 7;
  while (grad > 4 && schrift.widthOfTextAtSize(text, grad) > breite) grad -= 0.5;
  seite.drawText(text, { x, y, size: grad, font: schrift, color: rgb(0.25, 0.25, 0.25) });
}

/** Zeilen umbrechen, sodass sie in `breite` passen; ein zu langes Wort wird hart geteilt. */
function umbrechen(text: string, schrift: PDFFont, grad: number, breite: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of text.split("\n")) {
    let zeile = "";
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (schrift.widthOfTextAtSize(probe, grad) <= breite) { zeile = probe; continue; }
      if (zeile) zeilen.push(zeile);
      let rest = wort;
      while (schrift.widthOfTextAtSize(rest, grad) > breite && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && schrift.widthOfTextAtSize(rest.slice(0, n), grad) > breite) n--;
        zeilen.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      zeile = rest;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

/** Text in ein Rechteck: so groß wie möglich bis 10 pt, umbrochen, oben links; was nicht passt, wird kleiner. */
export function textInKasten(seite: PDFPage, roh: string, k: Rect, schrift: PDFFont) {
  const text = winAnsi(roh);
  const innen = { x: k.x + 2, b: Math.max(1, k.b - 4), h: Math.max(1, k.h - 2) };
  let grad = Math.min(10, Math.max(4, k.h - 3));
  let zeilen = umbrechen(text, schrift, grad, innen.b);
  while (grad > 4 && zeilen.length * grad * 1.15 > innen.h) {
    grad -= 0.5;
    zeilen = umbrechen(text, schrift, grad, innen.b);
  }
  const passt = Math.max(1, Math.floor(innen.h / (grad * 1.15)));
  // Eine Zeile mittig in der Höhe (wie ein Formularfeld), mehrere von oben.
  let y = zeilen.length === 1 ? k.y + (k.h - grad) / 2 + grad * 0.2 : k.y + k.h - 1 - grad;
  for (const z of zeilen.slice(0, passt)) {
    seite.drawText(z, { x: innen.x, y, size: grad, font: schrift, color: rgb(0, 0, 0) });
    y -= grad * 1.15;
  }
}

function kreuz(seite: PDFPage, k: Rect) {
  const r = Math.min(k.b, k.h) * 0.18;
  const farbe = rgb(0, 0, 0);
  const d = Math.max(0.8, Math.min(k.b, k.h) * 0.1);
  seite.drawLine({ start: { x: k.x + r, y: k.y + r }, end: { x: k.x + k.b - r, y: k.y + k.h - r }, thickness: d, color: farbe });
  seite.drawLine({ start: { x: k.x + r, y: k.y + k.h - r }, end: { x: k.x + k.b - r, y: k.y + r }, thickness: d, color: farbe });
}

/** Füllt ein Formularfeld; `false`, wenn pdf-lib es nicht kann (dann wird gezeichnet). */
function fuelleFormular(doc: PDFDocument, f: Vertragsfeld, wert: string | boolean | undefined): boolean {
  try {
    const form = doc.getForm();
    if (f.art === "text") {
      const tf = form.getTextField(f.formular ?? "");
      const text = typeof wert === "string" ? winAnsi(wert) : "";
      if (text.includes("\n") && !tf.isMultiline()) tf.enableMultiline();
      tf.setText(text || undefined);
      return true;
    }
    if (f.art === "ankreuz") {
      const cb = form.getCheckBox(f.formular ?? "");
      if (wert === true) cb.check(); else cb.uncheck();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function entferneFormularfeld(doc: PDFDocument, name: string | undefined) {
  if (!name) return;
  try {
    const form = doc.getForm();
    form.removeField(form.getField(name));
  } catch { /* schon weg oder nicht entfernbar: dann bleibt es leer stehen */ }
}

/**
 * Die Fassung eines Dokuments: Vorlage, Werte der Leitung, die Unterschriften, die es gibt. Fehlt eine Unterschrift,
 * bleibt ihr Feld leer (Ansicht vor dem Unterschreiben). Wirft nur bei einer Vorlage, die `leseVorlage` abgelehnt hätte.
 */
export async function dokumentPdf(vorlage: Uint8Array, felder: readonly Vertragsfeld[], werte: Werte, unterschriften: readonly Unterschrift[], r: Rahmen): Promise<Uint8Array> {
  const doc = await PDFDocument.load(vorlage, { updateMetadata: false });
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const seiten = doc.getPages();
  const seite = (n: number) => seiten[Math.min(Math.max(0, n), seiten.length - 1)];
  const nachZeichnen: { f: Vertragsfeld; wert: string | boolean }[] = [];

  let formularGefuellt = false;
  for (const f of felder) {
    const wert = werte[f.id];
    if (f.quelle === "formular" && f.art !== "unterschrift") {
      if (fuelleFormular(doc, f, wert)) formularGefuellt = true;
      else if (wert !== undefined) { entferneFormularfeld(doc, f.formular); nachZeichnen.push({ f, wert }); }
      continue;
    }
    if (f.quelle === "formular") { entferneFormularfeld(doc, f.formular); continue; }
    if (wert !== undefined && f.art !== "unterschrift") nachZeichnen.push({ f, wert });
  }
  if (formularGefuellt || felder.some((f) => f.quelle === "formular")) {
    try {
      const form = doc.getForm();
      form.updateFieldAppearances(schrift);
      form.flatten({ updateFieldAppearances: false });
    } catch {
      // Flach machen ging nicht (exotisches Widget): die Werte stehen trotzdem in den Feldern.
    }
  }
  for (const { f, wert } of nachZeichnen) {
    if (f.art === "text" && typeof wert === "string") textInKasten(seite(f.seite), wert, f, schrift);
    if (f.art === "ankreuz" && wert === true) kreuz(seite(f.seite), f);
  }

  const eigene = unterschriften.find((u) => u.feldId === EIGENE_SEITE);
  for (const u of unterschriften) {
    if (u.feldId === EIGENE_SEITE) continue;
    const f = felder.find((x) => x.id === u.feldId && x.art === "unterschrift");
    if (!f) continue;
    const bild = await doc.embedPng(u.bild);
    const p = seite(f.seite);
    p.drawImage(bild, indenKasten(bild, f));
    zeileUnterFeld(p, `${winAnsi(u.name)} · ${winAnsi(eingangText(u.am))} · digital unterschrieben`, f.x, Math.max(2, f.y - 8), Math.max(f.b, 160), schrift);
  }
  if (eigene) await unterschriftSeite(doc, `Unterschrift: ${r.dokument}`, eigene, r, schrift, fett);
  // Ein XMP-Paket der Vorlage (Word, Acrobat) trüge den alten Titel weiter, und Betrachter wie pdf.js ziehen es vor.
  doc.catalog.delete(PDFName.of("Metadata"));
  doc.setTitle(r.titel);
  doc.setModificationDate(new Date(r.am));
  return doc.save();
}

async function unterschriftSeite(doc: PDFDocument, titel: string, u: Unterschrift, r: Rahmen, schrift: PDFFont, fett: PDFFont) {
  const bild = await doc.embedPng(u.bild);
  const p = doc.addPage([A4.b, A4.h]);
  let y = A4.h - 90;
  p.drawText(winAnsi(titel), { x: 60, y, size: 16, font: fett });
  y -= 36;
  for (const [k, v] of [["Mietsache", "Bar"], ["Zeitraum", r.zeitraum], ["Anlass", r.anlass], ["Name", u.name], ["Unterschrieben", eingangText(u.am)]] as const) {
    p.drawText(winAnsi(k), { x: 60, y, size: 10, font: fett });
    p.drawText(winAnsi(v).slice(0, 90), { x: 170, y, size: 10, font: schrift });
    y -= 18;
  }
  const kasten = { x: 60, y: y - 140, b: 300, h: 110 };
  p.drawImage(bild, indenKasten(bild, kasten));
  p.drawLine({ start: { x: kasten.x, y: kasten.y - 4 }, end: { x: kasten.x + kasten.b, y: kasten.y - 4 }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  zeileUnterFeld(p, `${winAnsi(u.name)} · ${winAnsi(eingangText(u.am))} · digital unterschrieben`, kasten.x, kasten.y - 16, kasten.b, schrift);
}

/**
 * Hängt die Unterschrift der Leitung als eigene letzte Seite an eine hochgeladene Fassung (Ausdruck oder Foto der
 * mietenden Person, IDA-364); in deren Felder lässt sich nicht zeichnen. Wirft bei einer PDF, die pdf-lib nicht
 * schreiben kann (verschlüsselt, kaputt).
 */
export async function mitLeitungsSeite(fassung: Uint8Array, u: Unterschrift, r: Rahmen): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fassung, { updateMetadata: false });
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  await unterschriftSeite(doc, `Unterschrift der Leitung: ${r.dokument}`, u, r, schrift, fett);
  // Wie in `dokumentPdf`: ein XMP-Paket der hochgeladenen PDF trüge sonst den alten Titel weiter.
  doc.catalog.delete(PDFName.of("Metadata"));
  doc.setTitle(r.titel);
  doc.setModificationDate(new Date(r.am));
  return doc.save();
}
