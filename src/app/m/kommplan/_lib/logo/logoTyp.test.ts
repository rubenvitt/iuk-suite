import { describe, expect, it } from "vitest";
import { erkenneLogoTyp, LOGO_FEHLER, LOGO_MAX_BYTES, pruefeLogoDatei } from "./logoTyp";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP = new Uint8Array([...text("RIFF"), 1, 2, 3, 4, ...text("WEBPVP8 ")]);

describe("Logo-Typ allein aus den Bytes (Spec §4.4)", () => {
  it("erkennt PNG, JPEG, WebP an der Signatur", () => {
    expect(erkenneLogoTyp(PNG)).toBe("image/png");
    expect(erkenneLogoTyp(JPEG)).toBe("image/jpeg");
    expect(erkenneLogoTyp(WEBP)).toBe("image/webp");
  });
  it("erkennt SVG mit BOM, XML-Deklaration, Kommentar und DOCTYPE davor", () => {
    expect(erkenneLogoTyp(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(erkenneLogoTyp(new Uint8Array([0xef, 0xbb, 0xbf, ...text('\n  <?xml version="1.0"?>\n<!-- Logo -->\n<svg viewBox="0 0 1 1"></svg>')]))).toBe("image/svg+xml");
    expect(erkenneLogoTyp(text('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><svg/>'))).toBe("image/svg+xml"); // die Bereinigung lehnt ab
  });
  it("lehnt ab, was nur so heißt: GIF, PDF, RIFF/WAVE, HTML mit svg, Text, ungültiges UTF-8, leer", () => {
    expect(erkenneLogoTyp(text("GIF89a……"))).toBeNull();
    expect(erkenneLogoTyp(text("%PDF-1.7"))).toBeNull();
    expect(erkenneLogoTyp(new Uint8Array([...text("RIFF"), 1, 2, 3, 4, ...text("WAVEfmt ")]))).toBeNull();
    expect(erkenneLogoTyp(text("<html><body><svg></svg></body></html>"))).toBeNull();
    expect(erkenneLogoTyp(text("Hallo <svg>"))).toBeNull();
    expect(erkenneLogoTyp(bytes(0x3c, 0x73, 0x76, 0x67, 0x20, 0xc3, 0x28))).toBeNull(); // "<svg " + kaputtes UTF-8
    expect(erkenneLogoTyp(new Uint8Array())).toBeNull();
    expect(erkenneLogoTyp(text("<svgx/>"))).toBeNull();
  });
  it("prüft Größe vor Typ: leer, über 1 MB (1 048 576 Byte), genau 1 MB geht", () => {
    expect(pruefeLogoDatei(new Uint8Array())).toEqual({ ok: false, fehler: LOGO_FEHLER.leer });
    const gross = new Uint8Array(LOGO_MAX_BYTES + 1); gross.set(PNG);
    expect(pruefeLogoDatei(gross)).toEqual({ ok: false, fehler: LOGO_FEHLER.gross });
    const genau = new Uint8Array(LOGO_MAX_BYTES); genau.set(PNG);
    expect(pruefeLogoDatei(genau)).toEqual({ ok: true, typ: "image/png" });
    expect(pruefeLogoDatei(text("GIF89a"))).toEqual({ ok: false, fehler: LOGO_FEHLER.typ });
  });
  it("Vorspann in linearer Zeit: viel Leerraum, viele Kommentare oder Deklarationen vor einem Nicht-SVG blockieren den Server nicht", () => {
    // Ein Regex mit wiederholter Gruppe über `\s+` oder `<!--[\s\S]*?-->` läuft hier exponentiell (Kritik: 26 Leerzeichen
    // ≈ 0,5 s; selbst gemessen: 30 000 Kommentare lief nach zwei Minuten noch). Die Größen sind so gewählt, dass der alte Weg viele Sekunden bräuchte.
    for (const eingabe of [" ".repeat(100_000) + "x", "<!-- a -->".repeat(100_000) + "x", "<?xml ?>".repeat(100_000) + "x", "<!--".repeat(100_000)]) {
      const start = performance.now();
      expect(erkenneLogoTyp(text(eingabe))).toBeNull();
      expect(performance.now() - start).toBeLessThan(1000);
    }
    expect(erkenneLogoTyp(text(`${"<!-- a -->\n".repeat(1000)}<svg/>`))).toBe("image/svg+xml");
  });
});
