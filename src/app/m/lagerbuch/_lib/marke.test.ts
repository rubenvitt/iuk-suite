import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAGERBUCH_MARKE, LAGERBUCH_ORGANISATION, LAGERBUCH_ZEILE } from "./marke";

describe("marke — drei Konstanten, keine Env", () => {
  it("traegt die Werte aus §10.2", () => {
    expect(LAGERBUCH_MARKE).toBe("Lagerbuch");
    expect(LAGERBUCH_ORGANISATION).toBe("DRK Bereitschaft Musterstadt");
    expect(LAGERBUCH_ZEILE).toBe("Bestand, Fahrzeuge, Geräte");
  });

  it("liest KEINE Umgebungsvariable — der Quelltext nennt process.env nicht", () => {
    /**
     * Der Sinn der Umstellung waere dahin, wenn jemand „nur zur Sicherheit" ein
     * `process.env.APP_ORG ?? …` ergaenzte: dann gaebe es die Variable wieder, nur
     * undokumentiert. Ein Quelltext-Scan ist hier die richtige Ebene — ein
     * Wert-Test saehe den Rueckfall nicht, solange die Variable nicht gesetzt ist.
     */
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/lagerbuch/_lib/marke.ts"), "utf8",
    );
    expect(quelle).not.toContain("process.env");
  });

  it("traegt kein 'use client' — die Gate-Seite ist eine Server Component", () => {
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/lagerbuch/_lib/marke.ts"), "utf8",
    );
    expect(quelle).not.toContain('"use client"');
  });
});
