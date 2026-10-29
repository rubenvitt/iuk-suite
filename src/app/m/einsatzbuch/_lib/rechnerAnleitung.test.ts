import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECHNER_ANLEITUNG_PFAD } from "./rechnerAnleitung";

/**
 * Der Knopf auf der Seite „Rechner" zeigt auf eine Datei unter `public/`. Fehlt sie oder ist sie
 * keine PDF, lädt der Knopf eine 404-Seite herunter — still, bis jemand sie ausdrucken will.
 */
describe("Anleitung für den Einsatzbuch-Rechner (IDA-289)", () => {
  const datei = readFileSync(join(process.cwd(), "public", RECHNER_ANLEITUNG_PFAD));

  it("liegt als PDF unter public/", () => {
    expect(datei.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("ist genau ein Blatt zum Danebenlegen", () => {
    const seiten = datei.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
    expect(seiten).toHaveLength(1);
  });
});
