import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { QR_OPTIONS } from "@/core/qr";
import { barPlakatPdf, plakatAdresse, qrLaeufe } from "./barPlakat";

/** Rastert die Läufe so, wie das Plakat sie zeichnet (mit Ruhezone), und liest den Code zurück. */
function lies(text: string): string | null {
  const { module, laeufe } = qrLaeufe(text);
  const px = 8;
  const seite = (module + 2 * QR_OPTIONS.margin) * px;
  const bild = new Uint8ClampedArray(seite * seite * 4).fill(255);
  for (const l of laeufe) {
    for (let dy = 0; dy < px; dy++) {
      const y = (QR_OPTIONS.margin + l.zeile) * px + dy;
      for (let dx = 0; dx < l.laenge * px; dx++) {
        const i = (y * seite + (QR_OPTIONS.margin + l.spalte) * px + dx) * 4;
        bild[i] = bild[i + 1] = bild[i + 2] = 0;
      }
    }
  }
  return jsQR(bild, seite, seite)?.data ?? null;
}

describe("barPlakat", () => {
  it("der gezeichnete Code trägt genau die Adresse der Anfrageseite", () => {
    expect(lies("https://gemeinschaft.iuk-ue.de/bar")).toBe("https://gemeinschaft.iuk-ue.de/bar");
    expect(lies("http://gemeinschaft.localtest.me:3000/bar")).toBe("http://gemeinschaft.localtest.me:3000/bar");
  });

  it("zeigt die Adresse ohne Schema und Schrägstrich", () => {
    expect(plakatAdresse("https://gemeinschaft.iuk-ue.de/bar/")).toBe("gemeinschaft.iuk-ue.de/bar");
    expect(plakatAdresse("http://gemeinschaft.localtest.me:3000/bar")).toBe("gemeinschaft.localtest.me:3000/bar");
  });

  it("ist eine A4-Seite mit Titel", async () => {
    const bytes = await barPlakatPdf("https://gemeinschaft.iuk-ue.de/bar", new Date("2026-11-03T08:00:00Z"));
    expect(Buffer.from(bytes.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round((width * 25.4) / 72)).toBe(210);
    expect(Math.round((height * 25.4) / 72)).toBe(297);
    expect(doc.getTitle()).toBe("Bar mieten");
  });
});
