import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HELFER_ANLEITUNG_PFAD } from "./helferAnleitung";

/**
 * Der Knopf auf der Ortsetiketten-Seite zeigt auf eine Datei unter `public/`.
 * Fehlt sie oder ist sie keine PDF, laedt der Knopf eine 404-Seite herunter —
 * still, bis jemand sie ausdrucken will.
 */
describe("Helfer-Anleitung (IDA-278)", () => {
  const datei = readFileSync(join(process.cwd(), "public", HELFER_ANLEITUNG_PFAD));

  it("liegt als PDF unter public/", () => {
    expect(datei.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("hat genau drei Seiten: Entnahme, Zurueckpacken, Fahrzeugcheck", () => {
    const seiten = datei.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
    expect(seiten).toHaveLength(3);
  });
});
