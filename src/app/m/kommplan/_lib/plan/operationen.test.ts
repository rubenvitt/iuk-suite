import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import {
  PlanFehler, aendereStelle, fuegeSeitenstelleEin, fuegeStelleEin, fuegeUnterstelleEin, fuegeVerbindungEin, fuegeWurzelEin,
  leererPlan, loescheStelle, naechsteReihenfolge, setzeOptionen, stelleOder,
} from "./operationen";
import { LAENGE } from "./schema";

describe("Planoperationen", () => {
  it("leerer Plan ist gültig und hat VS-NfD an", () => {
    expect(leererPlan()).toMatchObject({ schema: 1, stellen: [], verbindungen: [], optionen: { vermerkVsNfD: true, leerzeilen: false } });
  });
  it("fügt eine Stelle mit Vorgaben ein und hängt sie ans Ende der Geschwister", () => {
    let p = fuegeStelleEin(leererPlan(), { id: "w", titel: "Wurzel" });
    p = fuegeStelleEin(p, { id: "a", titel: "A", eltern: "w" });
    p = fuegeStelleEin(p, { id: "b", titel: "B", eltern: "w" });
    expect(p.stellen.map((s) => [s.id, s.reihenfolge])).toEqual([["w", 0], ["a", 0], ["b", 1]]);
    expect(p.stellen[1]).toMatchObject({ lage: "unter", zeichen: null, kanaele: [], kontakte: [], einheiten: [], hervorheben: false });
    expect(naechsteReihenfolge(p, "w", "unter")).toBe(2);
    expect(naechsteReihenfolge(p, "w", "links")).toBe(0);
  });
  it("ist rein: die Eingabe bleibt unverändert", () => {
    const p = leererPlan();
    fuegeStelleEin(p, { id: "w", titel: "W" });
    expect(p.stellen).toEqual([]);
  });
  it("wirft PlanFehler bei verletzter Invariante", () => {
    expect(() => fuegeStelleEin(leererPlan(), { id: "x", titel: "X", eltern: "fehlt" })).toThrow(PlanFehler);
    const p = fuegeStelleEin(leererPlan(), { id: "w", titel: "W" });
    expect(() => fuegeStelleEin(p, { id: "w", titel: "doppelt" })).toThrow("ID doppelt: w");
  });
  it("fügt eine Verbindung ein", () => {
    const p = fuegeVerbindungEin(leererPlan(), { id: "v", art: "tmo", bezeichnung: "R_UE_1" });
    expect(p.verbindungen).toEqual([{ id: "v", art: "tmo", bezeichnung: "R_UE_1" }]);
  });
});

const V = [
  { id: "v1", art: "tmo" as const, bezeichnung: "R_UE_2" },
  { id: "v2", art: "tmo" as const, bezeichnung: "R_UE_3" },
];
const plan = () => baue({
  verbindungen: V,
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v2" },
    { id: "b", titel: "EA 2", eltern: "el", verbindung: "v1" },
    { id: "b1", titel: "Trupp", eltern: "b" },
    { id: "bs", titel: "Seite", eltern: "b", lage: "rechts" },
    { id: "l", titel: "KatSL", eltern: "el", lage: "links" },
  ],
});

describe("Stellen einfügen", () => {
  it("die erste Wurzel eines leeren Plans: leerer Titel, keine Verbindung", () => {
    const p = fuegeWurzelEin(leererPlan(), "w");
    expect(p.stellen).toEqual([expect.objectContaining({ id: "w", eltern: null, lage: "unter", titel: "", verbindungId: null, reihenfolge: 0 })]);
    expect(fuegeWurzelEin(p, "w2").stellen[1].reihenfolge).toBe(1);
  });
  it("eine Unterstelle tritt dem Bus der in Anzeigereihenfolge letzten Unterstelle bei (Entscheidung 7)", () => {
    // Anzeigereihenfolge unter el: Gruppe v2 (a, kleinste reihenfolge 0), dann Gruppe v1 (b)
    const p = fuegeUnterstelleEin(plan(), "el", "neu");
    expect(stelleOder(p, "neu")).toMatchObject({ eltern: "el", lage: "unter", verbindungId: "v1", titel: "", reihenfolge: 2 });
  });
  it("ohne Geschwister hat die neue Unterstelle keine Verbindung", () => {
    expect(stelleOder(fuegeUnterstelleEin(plan(), "a", "neu"), "neu").verbindungId).toBeNull();
  });
  it("unter einer Seitenstelle gibt es keine Unterstelle und keine Seitenstelle", () => {
    expect(() => fuegeUnterstelleEin(plan(), "bs", "neu")).toThrow("Eine Seitenstelle trägt keine Unterstellen.");
    expect(() => fuegeSeitenstelleEin(plan(), "l", "rechts", "neu")).toThrow("Eine Seitenstelle trägt keine Seitenstellen.");
  });
  it("Seitenstellen links und rechts, ohne Verbindung, ans Ende ihrer Seite", () => {
    let p = fuegeSeitenstelleEin(plan(), "el", "links", "l2");
    p = fuegeSeitenstelleEin(p, "el", "rechts", "r1");
    expect(stelleOder(p, "l2")).toMatchObject({ eltern: "el", lage: "links", reihenfolge: 1, verbindungId: null });
    expect(stelleOder(p, "r1")).toMatchObject({ lage: "rechts", reihenfolge: 0 });
  });
  it("unbekannte Elternstelle und doppelte ID sind PlanFehler", () => {
    expect(() => fuegeUnterstelleEin(plan(), "gibt-es-nicht", "neu")).toThrow(PlanFehler);
    expect(() => fuegeUnterstelleEin(plan(), "el", "a")).toThrow("ID doppelt: a");
  });
});

describe("Stellen ändern und löschen", () => {
  it("ändert nur die genannten Felder; unbekannte Stelle ist ein PlanFehler", () => {
    const p = aendereStelle(plan(), "a", { titel: "EA Nord", leiter: "Jana", hervorheben: true });
    expect(stelleOder(p, "a")).toMatchObject({ titel: "EA Nord", leiter: "Jana", hervorheben: true, verbindungId: "v2" });
    expect(() => aendereStelle(plan(), "x", { titel: "?" })).toThrow("Stelle x gibt es nicht");
  });
  it("prüft die Invarianten: ein unbekannter Kanal oder ein zu langer Titel wird abgewiesen", () => {
    expect(() => aendereStelle(plan(), "a", { kanaele: ["fehlt"] })).toThrow("Kanal fehlt existiert nicht");
    expect(() => aendereStelle(plan(), "a", { titel: "x".repeat(LAENGE.titel + 1) })).toThrow(PlanFehler);
  });
  it("löscht den Teilbaum samt Seitenstellen; Verbindungen bleiben (Entscheidung 8)", () => {
    const { inhalt, entfernt } = loescheStelle(plan(), "b");
    expect(inhalt.stellen.map((s) => s.id).sort()).toEqual(["a", "el", "l"]);
    expect(entfernt).toBe(3);
    expect(inhalt.verbindungen.map((v) => v.id)).toEqual(["v1", "v2"]);
  });
  it("löscht die Wurzel samt allem", () => {
    expect(loescheStelle(plan(), "el")).toEqual({ inhalt: { ...plan(), stellen: [] }, entfernt: 6 });
  });
  it("Optionen: nur leerzeilen und vermerkVsNfD", () => {
    const p = setzeOptionen(plan(), { leerzeilen: true, vermerkVsNfD: false });
    expect(p.optionen).toEqual({ leerzeilen: true, vermerkVsNfD: false, qrAufDruck: false, schwarzweiss: false });
  });
  it("ist rein", () => {
    const vorher = plan();
    const kopie = structuredClone(vorher);
    fuegeUnterstelleEin(vorher, "el", "n1");
    aendereStelle(vorher, "a", { titel: "X" });
    loescheStelle(vorher, "b");
    expect(vorher).toEqual(kopie);
  });
});
