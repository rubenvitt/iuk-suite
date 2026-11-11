import { describe, expect, it } from "vitest";
import type { BodySign } from "@einsatzzeichen/schema";
import {
  ABSCHNITTE, SOFORT_GEPRUEFT, befunde, feldname, gewaehlt, mittelgroesse, ohneFeldnamen, setze, setzeAbschnitt, setzeMittelgroesse,
  setzeText, sichtbar, type WahlFeld, type Wertbefund,
} from "./vokabular";

const zeichen = (s: object) => s as BodySign;
const abschnitt = (key: string) => ABSCHNITTE.find((a) => a.key === key)!;
const sofort = (z: BodySign) => new Map<WahlFeld, Wertbefund[]>(SOFORT_GEPRUEFT.map((f) => [f, befunde(z, f)]));

describe("Vokabular des Baukastens (Beschreibung, Einsatzzeichen 7)", () => {
  it("jeder angebotene Wert trägt einen deutschen Namen aus dem Paket, keine rohe Kennung", () => {
    const z = zeichen({ kind: "vehicle-land" });
    const roh = [...SOFORT_GEPRUEFT, "tasks" as const].flatMap((f) => befunde(z, f).filter((b) => b.name === b.wert).map((b) => `${f}:${b.wert}`));
    expect(roh).toEqual([]);
  });
  it("ein Abschnitt setzen leert seine anderen Felder im selben Schritt; „ohne“ leert den Abschnitt", () => {
    const z = zeichen({ kind: "formation", organization: "feuerwehr", head: "zug" });
    expect(setzeAbschnitt(z, abschnitt("zugehoerigkeit"), "color", "rot")).toEqual({ kind: "formation", color: "rot", head: "zug" });
    expect(setzeAbschnitt(z, abschnitt("kopf"), "head", "kreis")).toEqual({ kind: "formation", organization: "feuerwehr", head: "kreis" });
    expect(setzeAbschnitt(z, abschnitt("kopf"), "head", null)).toEqual({ kind: "formation", organization: "feuerwehr" });
    expect(setzeAbschnitt(z, abschnitt("zugehoerigkeit"), "organization", null)).toEqual({ kind: "formation", head: "zug" });
    expect(setzeAbschnitt(z, abschnitt("fachaufgaben"), "tasks", "fire-fighting")).toMatchObject({ tasks: ["fire-fighting"] });
    expect(gewaehlt(z, abschnitt("kopf"))).toBe("head:zug");
    expect(gewaehlt(z, abschnitt("funktion"))).toBeNull();
  });
  it("Fahrwerk und Text unter dem Körper verdrängen einander (derselbe Platz)", () => {
    const mitText = zeichen({ kind: "vehicle-land", text: { below: "x", center: "A" } });
    expect(setzeAbschnitt(mitText, abschnitt("fahrwerk"), "chassis", "kfz-kategorie-1")).toEqual({ kind: "vehicle-land", chassis: "kfz-kategorie-1", text: { center: "A" } });
    expect(setzeText(zeichen({ kind: "vehicle-land", chassis: "kfz-kategorie-1" }), "below", "x")).toEqual({ kind: "vehicle-land", text: { below: "x" } });
  });
  it("leere Texte und Listen heißen „nicht gesetzt“; Zonen kommen und gehen einzeln", () => {
    const z = setzeText(setzeText(zeichen({ kind: "post" }), "center", "ILS"), "bottomRight", "SW");
    expect(z).toEqual({ kind: "post", text: { center: "ILS", bottomRight: "SW" } });
    expect(setzeText(setzeText(z, "center", " "), "bottomRight", "")).toEqual({ kind: "post" });
    expect(setze(zeichen({ kind: "post", tasks: ["pumping"] }), [["tasks", []]])).toEqual({ kind: "post" });
  });
  it("Größe des mittigen Textes: „Groß“ setzt `large`, „Normal“ nichts; ohne mittigen Text fällt sie mit weg", () => {
    const z = setzeMittelgroesse(setzeText(zeichen({ kind: "circle-12" }), "center", "LST"), "large");
    expect(z).toEqual({ kind: "circle-12", text: { center: "LST", centerSize: "large" } });
    expect(mittelgroesse(z)).toBe("large");
    expect(setzeMittelgroesse(z, "normal")).toEqual({ kind: "circle-12", text: { center: "LST" } });
    expect(setzeText(setzeText(z, "belowRight", "Uel"), "center", "")).toEqual({ kind: "circle-12", text: { belowRight: "Uel" } });
  });
  it("Sperren: der gesetzte Wert ist nie gesperrt, ein langer Text sperrt nichts, gesperrte tragen einen Grund", () => {
    const z = zeichen({ kind: "formation", organization: "fuehrung-leitung", head: "gruppe", text: { center: "Viel zu langer Text für die Mitte" } });
    const kopf = befunde(z, "head");
    expect(kopf.find((b) => b.wert === "gruppe")?.frei).toBe(true);
    expect(kopf.every((b) => b.frei)).toBe(true);
    const funktion = befunde(z, "role");
    expect(funktion.some((b) => !b.frei)).toBe(true);
    expect(funktion.filter((b) => !b.frei).every((b) => typeof b.grund === "string" && b.grund.length > 0)).toBe(true);
  });
  it("Fachaufgaben sind eine Liste: neben einer gesetzten ist eine zweite frei", () => {
    const zweite = befunde(zeichen({ kind: "formation", tasks: ["water-rescue"] }), "tasks");
    expect(zweite.filter((b) => b.frei && b.wert !== "water-rescue").length).toBeGreaterThan(50);
  });
  it("„abgeleitet“ markiert nur Werte, die die Ableitung selbst auslösen", () => {
    const nackt = befunde(zeichen({ kind: "formation", organization: "thw" }), "role");
    expect(nackt.filter((b) => b.abgeleitet).length).toBeGreaterThan(0);
    const schonAbgeleitet = zeichen({ kind: "vehicle-land", organization: "thw", tasks: ["fire-fighting", "pumping"] });
    expect(befunde(schonAbgeleitet, "variant").some((b) => b.abgeleitet)).toBe(false);
  });
  it("Abschnitte erscheinen nur, wo etwas passt oder gesetzt ist: an der Einheit kein Fahrwerk, am Fahrzeug keine Funktion", () => {
    const sichtbare = (z: BodySign) => ABSCHNITTE.filter((a) => sichtbar(z, a, sofort(z))).map((a) => a.key);
    expect(sichtbare(zeichen({ kind: "formation" }))).not.toContain("fahrwerk");
    expect(sichtbare(zeichen({ kind: "vehicle-land" }))).toContain("fahrwerk");
    expect(sichtbare(zeichen({ kind: "vehicle-land" }))).not.toContain("funktion");
    expect(sichtbare(zeichen({ kind: "formation" }))).toEqual(expect.arrayContaining(["grundzeichen", "zugehoerigkeit", "kopf", "fachaufgaben"]));
    // Ungeprüft (noch keine Befunde) steht jeder Abschnitt da, statt zu flackern.
    expect(ABSCHNITTE.every((a) => sichtbar(zeichen({ kind: "formation" }), a, new Map()))).toBe(true);
  });
  it("weggelassene Felder in Wörtern vom Bildschirm", () => {
    expect(["tasks", "head", "text.center", "text", "exact.labels", "kind"].map(feldname))
      .toEqual(["Fachaufgaben", "Über dem Körper", "Text „Mitte“", "Text", "Weitere Angaben", "Grundzeichen"]);
  });
  it("Erklärtexte ohne Sätze mit Feldnamen", () => {
    expect(ohneFeldnamen("Die Fläche ist gelb. Setze `technicalFill` oder `organization`, nicht beides.")).toBe("Die Fläche ist gelb.");
  });
});
