import { describe, it, expect } from "vitest";
import { SCHRIFT, ZIFFERN } from "./schrift";

/**
 * DIE LEITER IST DIE ZUSICHERUNG, NICHT DER GESCHMACK.
 *
 * Was hier geprueft wird, sind die drei Regeln aus `docs/design/README.md`, die
 * ein spaeterer „schoenerer" Wert still brechen wuerde: keine dritte Skala,
 * Ziffern vergleichbar, und die Display-Rolle traegt wirklich die
 * Display-Familie (sonst ist der Umbau von 2026-08-12 wirkungslos und niemand
 * merkt es).
 */
const ANTD_LEITER = [12, 14, 16, 20, 24, 30];

describe("SCHRIFT — die Rollenleiter der Suite", () => {
  it("benutzt ausschliesslich antds Groeszenleiter", () => {
    for (const [rolle, wert] of Object.entries(SCHRIFT)) {
      expect(ANTD_LEITER, `${rolle} hat eine Groesze auszerhalb der Leiter`)
        .toContain(wert.fontSize);
    }
  });

  it("gibt den vier tragenden Rollen die Display-Familie", () => {
    for (const rolle of ["titel", "unterTitel", "kicker", "zahl"] as const) {
      expect(SCHRIFT[rolle].fontFamily, `${rolle} traegt nicht die Display-Familie`)
        .toContain("--font-display");
    }
  });

  it("laesst Fliesztext und Nebentext bei der Textfamilie", () => {
    for (const rolle of ["text", "neben"] as const) {
      expect(SCHRIFT[rolle].fontFamily ?? "", `${rolle} soll die Display-Familie NICHT tragen`)
        .not.toContain("--font-display");
    }
    expect(SCHRIFT.mono.fontFamily).toContain("--font-mono");
  });

  it("stellt Ziffern tabellarisch, wo sie verglichen werden", () => {
    for (const rolle of ["zahl", "text", "mono", "kicker"] as const) {
      expect(SCHRIFT[rolle].fontVariantNumeric, `${rolle} ohne tabular-nums`)
        .toContain("tabular-nums");
    }
    expect(ZIFFERN.fontVariantNumeric).toContain("tabular-nums");
  });

  it("traegt KEINE Farbe — die gehoert dem Traeger", () => {
    // Die zwei Adapter haben verschiedene Traeger: `feedback` faerbt ueber
    // `--fb-muted`, `lagerbuch` rendert unter `.modul` mit `--lb-stahl`. Eine
    // Farbe hier muesste einem der beiden aufgezwungen werden und aenderte 23
    // Seiten optisch, obwohl nur die Familie gemeint war.
    for (const [rolle, wert] of Object.entries(SCHRIFT)) {
      expect(wert.color, `${rolle} traegt eine Farbe`).toBeUndefined();
    }
  });

  it("versalisiert genau eine Rolle", () => {
    // Versalien sind der lauteste Griff der Leiter. Zwei Rollen mit Versalien
    // waeren zwei Kicker, und dann entscheidet der Zufall am Verwendungsort.
    const versal = Object.entries(SCHRIFT)
      .filter(([, w]) => w.textTransform === "uppercase")
      .map(([r]) => r);
    expect(versal).toEqual(["kicker"]);
  });
});
