import { describe, expect, it } from "vitest";
import type { BereitgestelltesFahrzeug } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { fahrzeugVerweis, mitStammOrten, planeOrtAbgleich, stammOrte } from "./stammFahrzeuge";

const s = (id: string, teil: Partial<BereitgestelltesFahrzeug> = {}): BereitgestelltesFahrzeug => ({
  id, art: "fahrzeug", typ: "RTW", funkrufname: `Rotkreuz Uelzen 11-83-${id}`, funkkenner: `11-83-${id}`,
  kennzeichen: null, standort: "Uelzen", aktiv: true, ...teil,
});
const bestand = (...fahrzeuge: BereitgestelltesFahrzeug[]) => ({ fahrzeuge, stand: "2026-10-21T08:00:00.000Z" });
const g = (id: string, location: string | null, fahrzeugId: string | null = null) => ({ id, location, fahrzeugId });

describe("stammOrte / fahrzeugVerweis", () => {
  it("nur aktive Fahrzeuge, über den Namen, getrimmt", () => {
    const orte = stammOrte(() => bestand(s("1"), s("2", { aktiv: false })));
    expect([...orte.keys()]).toEqual(["RTW 11-83-1"]);
    expect(fahrzeugVerweis(orte, "  RTW 11-83-1 ")).toBe("1");
    expect(fahrzeugVerweis(orte, "RTW 11-83-2")).toBeNull();
    expect(fahrzeugVerweis(orte, "Lager")).toBeNull();
    expect(fahrzeugVerweis(orte, null)).toBeNull();
  });

  it("eine nicht lesbare Fahrzeugverwaltung ergibt eine leere Karte, keinen Wurf", () => {
    expect(stammOrte(() => { throw new Error("gesperrt"); }).size).toBe(0);
  });

  it("die Vorschläge enthalten vorhandene Orte und Fahrzeugnamen, einmal, sortiert", () => {
    expect(mitStammOrten(["Lager", "RTW 11-83-1"], new Map([["RTW 11-83-1", "1"], ["ELW 1 11-11-1", "2"]])))
      .toEqual(["ELW 1 11-11-1", "Lager", "RTW 11-83-1"]);
  });
});

describe("planeOrtAbgleich", () => {
  it("verknüpft über den Erstimport und benennt den Ort nach dem Fahrzeug", () => {
    const plan = planeOrtAbgleich(bestand(s("1")), { "RTW 1": "1" }, [g("a", "RTW 1"), g("b", " RTW 1 ")]);
    expect(plan.zeilen).toEqual([
      { schluessel: expect.any(String), bisher: "RTW 1", name: "RTW 11-83-1", geraete: 2, klasse: "verknuepfen", hinweis: null },
    ]);
    expect(plan.aenderungen).toEqual([
      { id: "a", alt: "RTW 1", location: "RTW 11-83-1", fahrzeugId: "1" },
      { id: "b", alt: " RTW 1 ", location: "RTW 11-83-1", fahrzeugId: "1" },
    ]);
  });

  it("ohne Entscheidung zählt ein gleichnamiges Fahrzeug, sonst bleibt der Ort still", () => {
    const plan = planeOrtAbgleich(bestand(s("1")), {}, [g("a", "RTW 11-83-1"), g("b", "Lager")]);
    expect(plan.zeilen.map((z) => [z.bisher, z.klasse])).toEqual([["RTW 11-83-1", "verknuepfen"]]);
    expect(plan.aenderungen.map((a) => a.id)).toEqual(["a"]);
  });

  it("„kein Fahrzeug“ aus dem Erstimport lässt den Ort in Ruhe, auch wenn er wie eins heißt", () => {
    const plan = planeOrtAbgleich(bestand(s("1")), { "RTW 11-83-1": null }, [g("a", "RTW 11-83-1")]);
    expect(plan.zeilen).toEqual([]);
    expect(plan.aenderungen).toEqual([]);
  });

  it("ein verknüpftes Gerät folgt der Umbenennung in der Fahrzeugverwaltung", () => {
    const plan = planeOrtAbgleich(bestand(s("1", { typ: "KTW" })), {}, [g("a", "RTW 11-83-1", "1"), g("b", "KTW 11-83-1", "1")]);
    expect(plan.zeilen.map((z) => [z.bisher, z.name, z.klasse])).toEqual([
      ["RTW 11-83-1", "KTW 11-83-1", "umbenennen"],
      ["KTW 11-83-1", "KTW 11-83-1", "unveraendert"],
    ]);
    expect(plan.aenderungen.map((a) => a.id)).toEqual(["a"]);
  });

  it("außer Dienst: bleibt verknüpft, mit Hinweis; ein fehlendes Fahrzeug ist offen und ändert nichts", () => {
    const plan = planeOrtAbgleich(bestand(s("1", { aktiv: false })), { "ELW": "weg" }, [g("a", "RTW 11-83-1", "1"), g("b", "ELW")]);
    expect(plan.zeilen.map((z) => [z.bisher, z.klasse, z.hinweis])).toEqual([
      ["ELW", "offen", "Das Fahrzeug fehlt in der Fahrzeugverwaltung"],
      ["RTW 11-83-1", "unveraendert", "In der Fahrzeugverwaltung außer Dienst"],
    ]);
    expect(plan.aenderungen).toEqual([]);
  });
});
