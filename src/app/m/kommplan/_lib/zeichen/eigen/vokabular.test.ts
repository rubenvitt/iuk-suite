import { describe, expect, it } from "vitest";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import { ACHSEN, FARBWORTE, KOERPERFORMEN, abgeleiteteTeile, befunde, bezeichnung, gewaehlt, kandidaten, ohneFeldnamen, setze, setzeAchse, setzeZone } from "./vokabular";

const spec = (s: object) => s as SymbolSpec;
const achse = (key: string) => ACHSEN.find((a) => a.key === key)!;

describe("Vokabular des Baukastens", () => {
  it("jeder Wert jeder Achse hat einen deutschen Namen, keine rohe Kennung", () => {
    const ohne = ACHSEN.flatMap((a) => a.felder.flatMap((f) => kandidaten(f).filter((w) => bezeichnung(f, w) === w).map((w) => `${f}:${w}`)));
    expect(ohne).toEqual([]);
  });
  it("die eigenen Wortlisten decken den Wertevorrat des Pakets genau", () => {
    expect(Object.keys(FARBWORTE).sort()).toEqual([...kandidaten("technicalFill")].sort());
    expect(Object.keys(KOERPERFORMEN).sort()).toEqual([...kandidaten("bodyVariant")].sort());
  });
  it("eine Achse setzen leert ihre anderen Quellen im selben Schritt; „ohne“ leert die Achse", () => {
    const s = spec({ kind: "formation", organization: "feuerwehr", strength: "zug" });
    expect(setzeAchse(s, achse("zugehoerigkeit"), "technicalFill", "rot")).toEqual({ kind: "formation", technicalFill: "rot", strength: "zug" });
    expect(setzeAchse(s, achse("kopfzone"), "administrativeLevel", "kreis")).toEqual({ kind: "formation", organization: "feuerwehr", administrativeLevel: "kreis" });
    expect(setzeAchse(s, achse("kopfzone"), null, null)).toEqual({ kind: "formation", organization: "feuerwehr" });
    expect(setzeAchse(spec({ kind: "vehicle-land", designation: "x" }), achse("unten"), "vehicleCategory", "kfz-kategorie-1")).toEqual({ kind: "vehicle-land", vehicleCategory: "kfz-kategorie-1" });
    expect(setzeAchse(s, achse("faehigkeit"), "capabilities", "fire-fighting")).toMatchObject({ capabilities: ["fire-fighting"] });
    expect(gewaehlt(s, achse("kopfzone"))).toBe("strength:zug");
    expect(gewaehlt(s, achse("funktion"))).toBeNull();
  });
  it("leere Texte und Listen heißen „nicht gesetzt“; Zonen kommen und gehen einzeln", () => {
    const s = setzeZone(setzeZone(spec({ kind: "post" }), "center", "ILS"), "bottomRight", "SW");
    expect(s).toEqual({ kind: "post", labels: { center: "ILS", bottomRight: "SW" } });
    expect(setzeZone(setzeZone(s, "center", " "), "bottomRight", "")).toEqual({ kind: "post" });
    expect(setze(spec({ kind: "post", bodyMarks: ["a"] }), [["bodyMarks", []], ["designation", ""]])).toEqual({ kind: "post" });
  });
  it("Sperren: der gesetzte Wert ist nie gesperrt, ein langer Text sperrt keine Achse, gesperrte tragen einen Grund", () => {
    const s = spec({ kind: "formation", organization: "fuehrung-leitung", strength: "gruppe", labels: { center: "Viel zu langer Text für die Mitte" } });
    const kopf = befunde(s, achse("kopfzone"), "strength");
    expect(kopf.find((b) => b.wert === "gruppe")?.frei).toBe(true);
    expect(kopf.every((b) => b.frei)).toBe(true); // geprobt ohne die Kopfzone selbst und ohne Texte
    const funktion = befunde(s, achse("funktion"), "functionRole");
    expect(funktion.some((b) => !b.frei)).toBe(true);
    expect(funktion.filter((b) => !b.frei).every((b) => typeof b.grund === "string" && b.grund.length > 0)).toBe(true);
  });
  it("Fähigkeiten sind eine Liste: neben einer gesetzten ist eine zweite frei (core 4.0.0)", () => {
    expect(achse("faehigkeit").art).toBe("mehrfach");
    const zweite = befunde(spec({ kind: "formation", capabilities: ["water-rescue"] }), achse("faehigkeit"), "capabilities");
    expect(zweite.filter((b) => b.frei && b.wert !== "water-rescue").length).toBeGreaterThan(50);
  });
  it("„abgeleitet“ markiert nur Werte, die die Ableitung selbst auslösen — nicht jeden, weil die Probe schon abgeleitet ist", () => {
    const nackt = befunde(spec({ kind: "formation", organization: "thw" }), achse("koerperform"), "bodyVariant");
    expect(nackt.filter((b) => b.abgeleitet).length).toBeGreaterThan(0);
    expect(nackt.some((b) => b.frei && !b.abgeleitet)).toBe(true);
    const schonAbgeleitet = spec({ kind: "formation", organization: "thw", capabilities: ["fire-fighting", "pumping"] });
    expect(befunde(schonAbgeleitet, achse("koerperform"), "bodyVariant").some((b) => b.abgeleitet)).toBe(false);
  });
  it("abgeleitete Teile in Wörtern vom Bildschirm, gleich ob Feld- oder Kebab-Schreibweise", () => {
    expect(abgeleiteteTeile(["capabilities", "bodyMarks", "body-marks", "labels.center", "head", "gibt-es-nicht"]))
      .toEqual(["Fähigkeit", "Körpermarke", "Beschriftung", "Über dem Körper", "Weitere Teile"]);
  });
  it("Erklärtexte ohne Sätze mit Feldnamen", () => {
    expect(ohneFeldnamen("Die Fläche ist gelb. Setze `technicalFill` oder `organization`, nicht beides.")).toBe("Die Fläche ist gelb.");
  });
});
