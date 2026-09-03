import { describe, expect, it } from "vitest";

import { alleZeichen } from "./katalog";
import { stummesSvg } from "./stummesSvg";

/**
 * DER BEFUND, DEN DIESE DATEI FESTHAELT (Abschlussreview, W1): das Quiz zeigte
 * das Fragebild mitsamt seiner eigenen Beschriftung. Jedes SVG des Generats
 * traegt `<title>` (= Titel), `<desc>` (= Bedeutung) und ein `aria-labelledby`
 * auf beide — also genau den Text, den `QuizInsel` als Antwortoption anbietet.
 *
 * ⛔ DER ERSTE BLOCK MISST DIE EINGABE, NICHT NUR DIE AUSGABE. Ein Test, der bloss
 * pruefte, dass in der Ausgabe kein `<title>` steht, waere auch dann gruen, wenn
 * das Generat morgen gar keine Beschriftung mehr truege — er belegte dann nichts.
 * Deshalb steht die Zusicherung „das Leck IST da" daneben: faellt sie eines Tages
 * weg, ist der Grund fuer `stummesSvg` verschwunden, und das soll auffallen.
 */

/** Der Inhalt eines Knotens im Rohmarkup, oder `null`. */
function knotentext(svg: string, knoten: "title" | "desc"): string | null {
  return new RegExp(`<${knoten}\\b[^>]*>([\\s\\S]*?)</${knoten}>`).exec(svg)?.[1] ?? null;
}

/**
 * Das SVG ohne seine ZEICHNERISCHEN Beschriftungen.
 *
 * ⬜ GEMESSEN am 2026-09-03 ueber alle 246 Eintraege: 158 SVGs enthalten
 * `<text>`-Knoten, und bei ACHT davon steht dort der Titel selbst: `Stab`
 * (E.1.21), `KTW`/`RTW`/`NEF`/`NAW` (F.2.1, F.2.3–F.2.5), `Raft` (I.3.10),
 * `Strömungsretter` (I.5.2) und `Taucher` (I.5.3). Diese Kuerzel sind TEIL DES
 * ZEICHENS, nicht seine Beschriftung — sie zu entfernen
 * hiesse, das Zeichen zu zerstoeren; wer „RTW" sieht, sieht das Zeichen so, wie
 * die Vorschrift es zeichnet. `stummesSvg` fasst sie deshalb ausdruecklich nicht
 * an, und die Zusicherungen unten messen den Rest.
 */
function ohneZeichnungstext(svg: string): string {
  return svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "");
}

describe("Das Leck im Generat — die Voraussetzung dieser Funktion", () => {
  it("jedes Zeichen traegt seinen Namen und seine Bedeutung im SVG", () => {
    const zeichen = alleZeichen();
    expect(zeichen.length).toBeGreaterThan(0);

    for (const z of zeichen) {
      expect(z.svg, z.id).toMatch(/aria-labelledby=/);
      expect(knotentext(z.svg, "title"), z.id).toBe(z.titel);
      // Der `<desc>` ist bei 232 von 246 byteidentisch mit `bedeutung` und
      // enthaelt sie bei allen 246 — das ist bei `zeichen_bedeutung` die Loesung.
      expect(knotentext(z.svg, "desc"), z.id).toContain(z.bedeutung);
    }
  });
});

describe("stummesSvg", () => {
  it("nimmt Titel, Beschreibung und den Verweis aus ALLEN Zeichen des Katalogs", () => {
    for (const z of alleZeichen()) {
      const stumm = stummesSvg(z.svg);
      expect(stumm, z.id).not.toMatch(/<title\b/i);
      expect(stumm, z.id).not.toMatch(/<desc\b/i);
      expect(stumm, z.id).not.toMatch(/aria-labelledby/i);

      // Und die Loesungstexte selbst sind weg — das ist die Zusage, nicht die
      // Abwesenheit zweier Elementnamen. Die Bedeutung verschwindet restlos; der
      // Titel ueberall dort, wo er nicht Teil der Zeichnung ist (siehe
      // `ohneZeichnungstext`).
      expect(stumm, z.id).not.toContain(z.bedeutung);
      const ohneText = ohneZeichnungstext(stumm);
      expect(ohneText, z.id).not.toContain(z.titel);
      expect(ohneText, z.id).not.toContain(z.antwort);
    }
  });

  it("laesst das Bild unangetastet", () => {
    for (const z of alleZeichen()) {
      const stumm = stummesSvg(z.svg);
      expect(stumm, z.id).toMatch(/^<svg\b/);
      expect(stumm, z.id).toMatch(/<\/svg>$/);
      expect(stumm, z.id).toContain('viewBox="');
      // Die Zeichnung selbst: jedes Generat-SVG hat mindestens ein zeichnendes
      // Element. Ohne diese Zeile ginge eine Funktion durch, die alles loescht.
      expect(stumm, z.id).toMatch(/<(path|rect|circle|line|polyline|polygon|g|text)\b/);
    }
  });

  it("kommt mit Randformen zurecht, die im Generat heute nicht vorkommen", () => {
    // Leerer und selbstschliessender Knoten, einfache Anfuehrungszeichen,
    // Grossschreibung, Zeilenumbruch im Text.
    expect(stummesSvg("<svg><title></title><desc/><path/></svg>")).toBe("<svg><path/></svg>");
    expect(stummesSvg("<svg aria-labelledby='a b'><TITLE>X</TITLE><path/></svg>")).toBe(
      "<svg><path/></svg>",
    );
    expect(stummesSvg("<svg><desc>Zeile\nZwei</desc><path/></svg>")).toBe("<svg><path/></svg>");
  });

  it("laesst ein SVG ohne Beschriftung unveraendert", () => {
    const roh = '<svg role="img" viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    expect(stummesSvg(roh)).toBe(roh);
  });
});
