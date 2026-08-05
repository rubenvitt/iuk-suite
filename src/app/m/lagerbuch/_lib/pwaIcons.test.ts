import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ICON_192_BASE64, ICON_512_BASE64, ICON_MASKABLE_512_BASE64, PWA_ICON_SVG, pngAntwort,
} from "./pwaIcons";

const QUELLE = "src/app/m/lagerbuch/_lib/pwaIcons.ts";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4, Regel 1 der
 * Regeldatei fuer Teil 4). Der Scan unten liest sonst den Rohtext INKLUSIVE
 * Kommentaren, und `pwaIcons.ts` traegt den Satz „KEIN \"use client\"" woertlich
 * in seinem eigenen Kopfkommentar — der Scan waere auf seiner eigenen
 * Begruendung rot. `bauform.test.ts` exportiert die Funktion nicht, und diese
 * Datei ist ein anderer Testkoerper, deshalb die lokale Kopie statt eines
 * Re-Exports.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * SELBSTTRAGEND, ohne Nachbar-Checkout. `../lagerbuch/public/` existiert weder
 * im Container noch in der CI; ein Test, der dann ueberspringt, ist gruen aus
 * dem falschen Grund. Gemessen am 04.08.2026 gegen `lagerbuch` @ ca04eb1.
 */
const ICONS = [
  { name: "icon-192.png", b64: ICON_192_BASE64, bytes: 1558,
    sha: "8ba1cec7e6b5590566e218542c2c8ba818726621ca75de724da402740528d607" },
  { name: "icon-512.png", b64: ICON_512_BASE64, bytes: 5458,
    sha: "deab28e9c5eaa3b1eee2ebc34147bc2632cac7fd865770d35c318a3b68800779" },
  { name: "icon-maskable-512.png", b64: ICON_MASKABLE_512_BASE64, bytes: 3290,
    sha: "b990ac769739a40a7a0e6e9cb10576b7bd08b4ef186604750f307dc33e3cf559" },
] as const;

describe("Die drei PNG-Konstanten sind DIESE Bytes, nicht irgendwelche", () => {
  for (const icon of ICONS) {
    describe(icon.name, () => {
      it(`dekodiert zu genau ${icon.bytes} Bytes`, () => {
        // Eine um drei Zeichen gekuerzte Base64-Kette dekodiert KLAGLOS zu
        // kaputten Bytes. Der Browser zeigt dann gar nichts, und die Ursache
        // steht 4.000 Zeichen weit weg.
        expect(Buffer.from(icon.b64, "base64").length).toBe(icon.bytes);
      });

      it("traegt die PNG-Signatur 89 50 4E 47 0D 0A 1A 0A", () => {
        const kopf = Buffer.from(icon.b64, "base64").subarray(0, 8);
        expect([...kopf]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      });

      it("hat den erwarteten SHA-256 — das ist die eigentliche Zusage", () => {
        const sha = createHash("sha256").update(Buffer.from(icon.b64, "base64")).digest("hex");
        expect(sha).toBe(icon.sha);
      });

      it("enthaelt kein Leerzeichen, keinen Zeilenumbruch, kein Auslassungszeichen", () => {
        // Ein `base64` ohne `-w0` (GNU) bricht bei 76 Zeichen um; eine von Hand
        // gekuerzte Kette traegt gern „…". Beides dekodiert still falsch.
        expect(icon.b64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      });
    });
  }
});

describe("pngAntwort — Kopfzeilen nach §7.10.2", () => {
  it("antwortet mit image/png und einer Woche unveraenderlichem Cache", () => {
    const r = pngAntwort(ICON_192_BASE64);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/png");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
  });

  it("liefert den Byte-Koerper, nicht die Base64-Zeichenkette", async () => {
    // Ein `new Response(base64)` waere ein 2.080 Zeichen langer TEXT mit
    // Content-Type image/png — der Browser zeigte ein kaputtes Bild, und
    // `curl -si` saehe einen 200. Genau der Zustand, den R2 pruefen soll.
    const puffer = await pngAntwort(ICON_192_BASE64).arrayBuffer();
    expect(puffer.byteLength).toBe(1558);
  });
});

describe("PWA_ICON_SVG — D12, byte-exakt aus der Alt-Anwendung (E7)", () => {
  it("ist BYTE-EXAKT das Zeichen aus lagerbuch@ca04eb1", () => {
    // Die schaerfste Zusicherung zuerst: 385 Bytes, feste Pruefsumme. Sie faellt
    // auch bei einer scheinbar harmlosen Umformatierung (Einrueckung, Attribut-
    // reihenfolge, fehlender Schluss-Zeilenumbruch) — und genau das ist gewollt,
    // weil ein umformatiertes Zeichen kein portiertes mehr ist.
    expect(Buffer.byteLength(PWA_ICON_SVG, "utf8")).toBe(385);
    expect(createHash("sha256").update(PWA_ICON_SVG, "utf8").digest("hex"))
      .toBe("98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34");
  });

  it("ist ein vollstaendiges SVG mit viewBox", () => {
    expect(PWA_ICON_SVG).toMatch(/^<svg\b/);
    expect(PWA_ICON_SVG).toMatch(/viewBox="0 0 64 64"/);
    expect(PWA_ICON_SVG.trimEnd()).toMatch(/<\/svg>$/);
  });

  it("traegt den `xmlns` — ohne ihn rendert kein Browser eine SVG-DATEI", () => {
    // Inline in HTML geht es ohne; als eigenstaendige Datei mit
    // Content-Type image/svg+xml nicht.
    expect(PWA_ICON_SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("traegt Suite-Rot als festen Hexwert, NICHT als CSS-Variable", () => {
    // Eine SVG-DATEI hat keinen Elternbaum. `var(--lb-rot)` loeste dort ins
    // Leere auf — gueltiges CSS, still transparent (Falle 2), und das Symbol
    // waere unsichtbar auf dem Startbildschirm.
    expect(PWA_ICON_SVG).toContain("#c8000f");
    expect(PWA_ICON_SVG).not.toContain("var(--");
  });

  it("enthaelt keinen Text — ein Startbildschirm-Symbol wird 48px gross angezeigt", () => {
    expect(PWA_ICON_SVG).not.toMatch(/<text\b/);
  });
});

describe("Bauform", () => {
  it("traegt KEIN \"use client\" — die vier Route Handler sind Server-Dateien (Falle 6)", () => {
    // K-4: ohneKommentare() statt Rohtext-Scan — pwaIcons.ts traegt den Satz
    // "KEIN \"use client\"" woertlich in seinem Kopfkommentar.
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/"use client"/);
  });

  it("liegt unter `_lib/` und nicht unter `_ui/` — sie ist keine Komponente", () => {
    expect(QUELLE).toMatch(/\/_lib\//);
  });
});
