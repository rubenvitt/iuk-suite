import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * DER SCHALTER, DEN SONST NIEMAND PRUEFT (`next.config.ts`).
 *
 * `experimental.turbopackFileSystemCacheForDev` wirkt ausschliesslich zur
 * Laufzeit von `next dev`. `typecheck` sieht nur einen gueltigen Schluessel,
 * `pnpm lint` liest die Datei gar nicht, und `pnpm build` nimmt den ANDEREN
 * Schalter (`...ForBuild`) — faellt die Zeile weg, merkt es kein Tor, und der
 * naechste e2e-Lauf bricht wieder mitten in einer Gruppe ab (Begruendung und
 * die gemessene Panik stehen im Kopf von `next.config.ts`).
 *
 * Geprueft wird die ENTSCHEIDUNG, nicht die Wirkung: dass die Konfiguration
 * unter `CI` den Dev-Dateicache abschaltet und ohne `CI` nichts daran dreht.
 * Ob Turbopack sie befolgt, kann nur ein echter Lauf zeigen.
 */
const CI_VORHER = process.env.CI;

afterEach(() => {
  if (CI_VORHER === undefined) delete process.env.CI;
  else process.env.CI = CI_VORHER;
  vi.resetModules();
});

async function ladeKonfiguration() {
  vi.resetModules();
  return (await import("../next.config")).default;
}

describe("next.config.ts — Turbopacks Dev-Dateicache", () => {
  it("ist unter CI abgeschaltet", async () => {
    process.env.CI = "true";
    const konfiguration = await ladeKonfiguration();
    expect(konfiguration.experimental?.turbopackFileSystemCacheForDev).toBe(false);
  });

  it("bleibt ohne CI unangetastet — lokal traegt der Cache ueber Sitzungen", async () => {
    delete process.env.CI;
    const konfiguration = await ladeKonfiguration();
    expect(konfiguration.experimental?.turbopackFileSystemCacheForDev).toBeUndefined();
  });

  it("nimmt den Build-Cache nicht mit — er lief gruen und bleibt, wie er ist", async () => {
    process.env.CI = "true";
    const konfiguration = await ladeKonfiguration();
    expect(konfiguration.experimental?.turbopackFileSystemCacheForBuild).toBeUndefined();
  });
});
