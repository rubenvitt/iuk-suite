import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { pngZuDatei } from "@/core/favicon";
import { appIconSvg } from "@/core/favicon/app-icon";
import { ICON_192, ICON_512, ICON_MASKABLE_512, PWA_ICON_SVG, pngAntwort }
  from "./pwaIcons";

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
 * SEIT DEM 21.10.2026 DAS SUITE-ZEICHEN (`core/favicon`, `lagerbuch`), nicht mehr
 * die Bytes der Alt-Anwendung. Die Zusage ist jetzt: dieselben PNGs und dasselbe
 * SVG wie jedes andere Modul, in den Kantenlängen, die das Manifest nennt.
 */
const ICONS = [
  { name: "icon-192.png", bytes: ICON_192, kante: 192, datei: "lagerbuch-app-192.png" },
  { name: "icon-512.png", bytes: ICON_512, kante: 512, datei: "lagerbuch-app-512.png" },
  { name: "icon-maskable-512.png", bytes: ICON_MASKABLE_512, kante: 512, datei: "lagerbuch-maskierbar-512.png" },
] as const;

describe("Die drei PNGs sind die erzeugten App-Icons mit dem Lagerbuch-Zeichen", () => {
  for (const icon of ICONS) {
    describe(icon.name, () => {
      it("ist byte-gleich mit dem Eintrag in app-icon.generiert.json", () => {
        expect(icon.bytes.equals(pngZuDatei(icon.datei)!)).toBe(true);
      });

      it("traegt die PNG-Signatur 89 50 4E 47 0D 0A 1A 0A", () => {
        expect([...icon.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      });

      it(`ist ${icon.kante}×${icon.kante} gross — die Groesse, die das Manifest nennt`, () => {
        // IHDR: Breite und Hoehe als 32-Bit-Zahlen ab Byte 16.
        expect([icon.bytes.readUInt32BE(16), icon.bytes.readUInt32BE(20)]).toEqual([icon.kante, icon.kante]);
      });
    });
  }
});

describe("pngAntwort — Kopfzeilen nach §7.10.2", () => {
  it("antwortet mit image/png und einer Woche unveraenderlichem Cache", () => {
    const r = pngAntwort(ICON_192);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/png");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
  });

  it("liefert die Bytes unveraendert", async () => {
    const puffer = Buffer.from(await pngAntwort(ICON_192).arrayBuffer());
    expect(puffer.equals(ICON_192)).toBe(true);
  });
});

describe("PWA_ICON_SVG — das App-Icon der Suite mit dem Lagerbuch-Zeichen", () => {
  it("ist genau `appIconSvg(\"lagerbuch\")`, nicht das IDA-Zeichen als Rueckfall", () => {
    expect(PWA_ICON_SVG).toBe(appIconSvg("lagerbuch"));
    expect(PWA_ICON_SVG).toContain('aria-label="Lagerbuch"');
  });

  it("traegt den `xmlns` — ohne ihn rendert kein Browser eine SVG-DATEI", () => {
    expect(PWA_ICON_SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("traegt Suite-Rot als festen Hexwert, NICHT als CSS-Variable", () => {
    // Eine SVG-DATEI hat keinen Elternbaum; `var(--…)` loeste dort ins Leere
    // auf (Falle 2), und das Symbol waere unsichtbar auf dem Startbildschirm.
    expect(PWA_ICON_SVG).toContain("#c8000f");
    expect(PWA_ICON_SVG).not.toContain("var(--");
  });
});

describe("Bauform", () => {
  it("traegt KEIN \"use client\" — die vier Route Handler sind Server-Dateien (Falle 6)", () => {
    // K-4: ohneKommentare() statt Rohtext-Scan — pwaIcons.ts traegt den Satz
    // "KEIN \"use client\"" woertlich in seinem Kopfkommentar.
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/"use client"/);
  });

  it("liegt unter `_lib/` und nicht unter `_ui/` — sie ist keine Komponente", () => {
    // Review-Befund (Task 65, Important): `expect(QUELLE).toMatch(/\/_lib\//)`
    // prueft ein Literal gegen sich selbst (QUELLE ist Zeile 8 dieser Datei) —
    // das kann konstruktiv nie fehlschlagen. Stattdessen wird der TATSAECHLICHE
    // Ort auf der Festplatte geprueft: die Datei muss GENAU dort existieren, wo
    // QUELLE sie verortet, und darf NICHT zusaetzlich unter dem gleichnamigen
    // `_ui/`-Verzeichnis liegen (Falle 6: eine Wertedatei dort waere gefaehrlich
    // nah an einer Komponente, wo "use client" ueblich ist).
    expect(existsSync(QUELLE)).toBe(true);
    const ZIEL_UI = QUELLE.replace("/_lib/", "/_ui/");
    expect(ZIEL_UI).not.toBe(QUELLE);
    expect(existsSync(ZIEL_UI)).toBe(false);
  });
});
