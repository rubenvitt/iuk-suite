import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  AbgleichAnzeigeZeile,
  DetailChipAnzeige,
  GeraetAnzeigeZeile,
} from "./CheckDetailTabellen";
import {
  abgleichWeichtAb,
  adresseMitAlle,
  alleAusAdresse,
  flascheWeichtAb,
  geraetWeichtAb,
  nachfuellungWeichtAb,
  verfallWeichtAb,
} from "./abweichungen";

const OK: DetailChipAnzeige = { text: "ok", ton: "ok", zeichen: null };
const chip = (ton: DetailChipAnzeige["ton"]): DetailChipAnzeige => ({ text: ton, ton, zeichen: null });

const ruhig: AbgleichAnzeigeZeile = {
  id: "a", artikel: "A", sollText: "3", istText: "3", korrekturText: "0", nachgefuelltText: "0",
  sollZahl: 3, istZahl: 3, korrekturZahl: 0, nachgefuelltZahl: 0, offenZahl: 0, offenChip: OK,
};

describe("abweichungen (IDA-236)", () => {
  it("zählt im Abgleich Fehlbestand, Überbestand, Nachgefülltes und Korrigiertes", () => {
    expect(abgleichWeichtAb(ruhig)).toBe(false);
    expect(abgleichWeichtAb({ ...ruhig, istZahl: 1, nachgefuelltZahl: 2 })).toBe(true);
    expect(abgleichWeichtAb({ ...ruhig, istZahl: 5 })).toBe(true);
    expect(abgleichWeichtAb({ ...ruhig, korrekturZahl: -1 })).toBe(true);
    expect(abgleichWeichtAb({ ...ruhig, offenZahl: 1 })).toBe(true);
  });

  it("zählt bei der Nachfüllung nur die Lücke", () => {
    const fach = { lueckeZahl: 0 } as Parameters<typeof nachfuellungWeichtAb>[0];
    expect(nachfuellungWeichtAb(fach)).toBe(false);
    expect(nachfuellungWeichtAb({ ...fach, lueckeZahl: 2 })).toBe(true);
    expect(nachfuellungWeichtAb({ ...fach, lueckeZahl: -1 })).toBe(false);
  });

  it("zählt bei Chips alles außer Grün — auch das ungemessene Grau", () => {
    const geraet: GeraetAnzeigeZeile = {
      id: "g", name: "G", vorhandenChip: OK, zustandChip: OK, bemerkungText: "—",
    };
    expect(geraetWeichtAb(geraet)).toBe(false);
    expect(geraetWeichtAb({ ...geraet, vorhandenChip: chip("rot") })).toBe(true);
    expect(geraetWeichtAb({ ...geraet, zustandChip: chip("grau") })).toBe(true);
    const flasche = { fuellstandChip: OK } as Parameters<typeof flascheWeichtAb>[0];
    expect(flascheWeichtAb(flasche)).toBe(false);
    expect(flascheWeichtAb({ ...flasche, fuellstandChip: chip("grau") })).toBe(true);
    const verfall = { statusChip: OK } as Parameters<typeof verfallWeichtAb>[0];
    expect(verfallWeichtAb(verfall)).toBe(false);
    expect(verfallWeichtAb({ ...verfall, statusChip: chip("gelb") })).toBe(true);
  });

  it("liest `?alle=` tolerant und in der Reihenfolge der Seite", () => {
    expect(alleAusAdresse(undefined)).toEqual([]);
    expect(alleAusAdresse("")).toEqual([]);
    expect(alleAusAdresse("verfall,abgleich,quatsch,abgleich")).toEqual(["abgleich", "verfall"]);
    expect(alleAusAdresse(["geraete", "sauerstoff,nachfuellung"]))
      .toEqual(["nachfuellung", "geraete", "sauerstoff"]);
  });

  it("schreibt die Adresse nur, wenn sie sich ändert, und lässt fremde Parameter stehen", () => {
    const basis = "https://lagerbuch.localtest.me/verwaltung/checks/c1";
    expect(adresseMitAlle(basis, new Set())).toBeNull();
    expect(adresseMitAlle(`${basis}?x=1`, new Set(["verfall", "abgleich"])))
      .toBe(`${basis}?x=1&alle=abgleich,verfall`);
    expect(adresseMitAlle(`${basis}?alle=abgleich,verfall`, new Set(["abgleich", "verfall"])))
      .toBeNull();
    expect(adresseMitAlle(`${basis}?alle=abgleich`, new Set())).toBe(basis);
  });

  it("bleibt frei von \"use client\" — die Server-Seite liest es (Falle 6)", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/abweichungen.ts",
      "utf8",
    );
    expect(quelle).not.toMatch(/^\s*["']use client["']/);
  });
});
