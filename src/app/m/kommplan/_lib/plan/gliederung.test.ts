import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { MELDUNG, fuegeGeschwisterEin, gliederungsZeilen, loescheLeereZeile, nachbarZeile, reihe, rueckeAus, rueckeEin, setzeVerbindungFuerGeschwister, verschiebeInReihe, zeilenAktionen, zuVieleStellen } from "./gliederung";
import { PlanFehler } from "./operationen";
import { GRENZE, leseInhalt, type PlanInhalt } from "./schema";

const V = [{ id: "a", art: "tmo" as const, bezeichnung: "A" }, { id: "b", art: "dmo" as const, bezeichnung: "B" }];
/** EL mit Seitenstelle links, fünf Unterstellen in zwei Busgruppen (A: x1, x2, x5 — B: y3, y4) und einer Unterunterstelle. */
const PLAN = baue({
  verbindungen: V,
  stellen: [
    { id: "el", titel: "EL" },
    { id: "kat", titel: "KatSL", eltern: "el", lage: "links" },
    { id: "x1", titel: "X1", eltern: "el", verbindung: "a" },
    { id: "x2", titel: "X2", eltern: "el", verbindung: "a" },
    { id: "y3", titel: "Y3", eltern: "el", verbindung: "b" },
    { id: "y4", titel: "Y4", eltern: "el", verbindung: "b" },
    { id: "x5", titel: "X5", eltern: "el", verbindung: "a" },
    { id: "u", titel: "U", eltern: "x2" },
    { id: "w2", titel: "Wurzel 2" },
  ],
});
const titel = (p: PlanInhalt) => gliederungsZeilen(p).map((z) => `${"·".repeat(z.ebene)}${z.stelle.titel}${z.seite ? `(${z.seite})` : ""}`);
const s = (p: PlanInhalt, id: string) => p.stellen.find((x) => x.id === id)!;
const gueltig = (p: PlanInhalt) => expect(leseInhalt(p).ok).toBe(true);

describe("Zeilen der Gliederung (Entscheidung 4)", () => {
  it("Tiefensuche: Seitenstellen direkt nach der Elternstelle, Unterstellen in Anzeigereihenfolge (Busgruppen zusammen)", () => {
    expect(titel(PLAN)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
  });
  it("Nachbarzeilen folgen dieser Folge; am Rand null", () => {
    const z = gliederungsZeilen(PLAN);
    expect(nachbarZeile(z, "x2", "runter")).toBe("u");
    expect(nachbarZeile(z, "u", "runter")).toBe("x5");
    expect(nachbarZeile(z, "el", "hoch")).toBeNull();
    expect(nachbarZeile(z, "w2", "runter")).toBeNull();
  });
  it("die Reihe einer Seite ist nur diese Seite; die Reihe der Wurzeln ist ohne Gruppen", () => {
    expect(reihe(PLAN, "el", "links").map((x) => x.id)).toEqual(["kat"]);
    expect(reihe(PLAN, null, "unter").map((x) => x.id)).toEqual(["el", "w2"]);
  });
});

describe("Enter: neue Stelle darunter (Entscheidung 5)", () => {
  it("direkt nach der Zeile samt Teilbaum, gleiche Elternstelle und Verbindung, Reihe neu nummeriert", () => {
    const p = fuegeGeschwisterEin(PLAN, "x2", "neu");
    gueltig(p);
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "·", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
    expect(s(p, "neu")).toMatchObject({ eltern: "el", lage: "unter", verbindungId: "a", titel: "" });
    expect(PLAN.stellen.find((x) => x.id === "neu")).toBeUndefined(); // Eingabe unverändert
  });
  it("auf einer Wurzel: neue Wurzel ohne Verbindung; auf einer Seitenstelle: Seitenstelle derselben Seite", () => {
    expect(s(fuegeGeschwisterEin(PLAN, "el", "n"), "n")).toMatchObject({ eltern: null, verbindungId: null });
    // hinter dem GANZEN Teilbaum von EL (acht Zeilen) und vor „Wurzel 2“
    expect(titel(fuegeGeschwisterEin(PLAN, "el", "n")).slice(7)).toEqual(["·Y4", "", "Wurzel 2"]);
    expect(s(fuegeGeschwisterEin(PLAN, "kat", "n"), "n")).toMatchObject({ eltern: "el", lage: "links" });
  });
  it("über 500 Stellen: PlanFehler mit Zahl", () => {
    const voll = baue({ stellen: Array.from({ length: GRENZE.stellen }, (_, i) => ({ id: `s${i}`, titel: `S${i}` })) });
    expect(() => fuegeGeschwisterEin(voll, "s0", "zu")).toThrow(zuVieleStellen(GRENZE.stellen + 1));
  });
});

describe("Tab und Umschalt+Tab (Entscheidung 6, Review Focus 3)", () => {
  it("Tab: letzte Unterstelle der vorigen Geschwisterstelle, tritt deren letztem Bus bei; der Teilbaum wandert mit", () => {
    const p = rueckeEin(PLAN, "x5"); // vorige in Anzeigereihenfolge: X2 (hat U ohne Verbindung)
    gueltig(p);
    expect(s(p, "x5")).toMatchObject({ eltern: "x2", verbindungId: null });
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "··X5", "·Y3", "·Y4", "Wurzel 2"]);
    const q = rueckeEin(PLAN, "x2"); // unter X1, das keine Unterstellen hat
    expect(s(q, "x2")).toMatchObject({ eltern: "x1", verbindungId: null });
    expect(s(q, "u").eltern).toBe("x2");
  });
  it("Tab auf der ersten Stelle einer Ebene, auf einer Seitenstelle: PlanFehler, nichts ändert sich", () => {
    expect(() => rueckeEin(PLAN, "x1")).toThrow(new PlanFehler(MELDUNG.ersteEinruecken));
    expect(() => rueckeEin(PLAN, "el")).toThrow(MELDUNG.ersteEinruecken);
    expect(() => rueckeEin(PLAN, "kat")).toThrow(MELDUNG.seiteEbene);
  });
  it("Tab auf der zweiten Wurzel: sie wird Unterstelle der ersten", () => {
    expect(s(rueckeEin(PLAN, "w2"), "w2")).toMatchObject({ eltern: "el", verbindungId: "b" }); // letzte in Anzeigereihenfolge: Y4
  });
  it("Umschalt+Tab: direkt hinter die Elternstelle, in deren Busgruppe; spätere Geschwister bleiben", () => {
    const p = rueckeAus(PLAN, "u");
    gueltig(p);
    expect(s(p, "u")).toMatchObject({ eltern: "el", verbindungId: "a" });
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "·U", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
    const q = rueckeAus(PLAN, "y3"); // Elternstelle ist eine Wurzel: oberste Ebene, keine Verbindung
    expect(s(q, "y3")).toMatchObject({ eltern: null, verbindungId: null });
    expect(titel(q).slice(-3)).toEqual(["·Y4", "Y3", "Wurzel 2"]);
  });
  it("Umschalt+Tab auf einer Wurzel oder Seitenstelle: PlanFehler", () => {
    expect(() => rueckeAus(PLAN, "el")).toThrow(MELDUNG.wurzelAusruecken);
    expect(() => rueckeAus(PLAN, "kat")).toThrow(MELDUNG.seiteEbene);
  });
  it("Hin und zurück ist wieder derselbe Baum (Titelfolge): X5 steht wieder hinter X2s Teilbaum in Gruppe A", () => {
    expect(titel(rueckeAus(rueckeEin(PLAN, "x5"), "x5"))).toEqual(titel(PLAN));
  });
});

describe("Alt+↑/↓ (Entscheidung 7, Review Focus 2)", () => {
  it("innerhalb der Busgruppe: Tausch mit dem Nachbarn", () => {
    const p = verschiebeInReihe(PLAN, "x5", "hoch");
    gueltig(p);
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X5", "·X2", "··U", "·Y3", "·Y4", "Wurzel 2"]);
  });
  it("am Rand der Gruppe wandert die ganze Gruppe — jeder Schritt ändert das Bild", () => {
    const p = verschiebeInReihe(PLAN, "y3", "hoch"); // Y3 ist erste der Gruppe B → B vor A
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·Y3", "·Y4", "·X1", "·X2", "··U", "·X5", "Wurzel 2"]);
    const q = verschiebeInReihe(PLAN, "x5", "runter"); // X5 letzte der Gruppe A → A hinter B
    expect(titel(q).slice(2, 4)).toEqual(["·Y3", "·Y4"]);
  });
  it("am Anfang oder Ende der Reihe: dasselbe Objekt", () => {
    expect(verschiebeInReihe(PLAN, "x1", "hoch")).toBe(PLAN);
    expect(verschiebeInReihe(PLAN, "y4", "runter")).toBe(PLAN);
    expect(verschiebeInReihe(PLAN, "kat", "hoch")).toBe(PLAN);
    expect(verschiebeInReihe(PLAN, "w2", "hoch")).not.toBe(PLAN);
  });
  it("gleiche reihenfolge-Werte: die Anzeigereihenfolge (dann id) gilt, und danach ist die Reihe eindeutig nummeriert", () => {
    const gleich: PlanInhalt = { ...PLAN, stellen: PLAN.stellen.map((x) => (x.eltern === "el" && x.lage === "unter" ? { ...x, reihenfolge: 0 } : x)) };
    const vorher = titel(gleich); // Gleichstand → nach id: X1, X2, X5 | Y3, Y4
    const p = verschiebeInReihe(gleich, "x2", "runter");
    const r = reihe(p, "el", "unter").map((x) => x.reihenfolge);
    expect(new Set(r).size).toBe(r.length);
    expect(titel(p)).not.toEqual(vorher);
  });
});

describe("Zeilenaktionen und leere Zeilen (Entscheidungen 8, 11)", () => {
  it("was im Menü erreichbar ist", () => {
    expect(zeilenAktionen(PLAN, "x1")).toEqual({ einruecken: false, ausruecken: true, hoch: false, runter: true, unterstelle: true, seitenstelle: true, uebernehmen: false });
    expect(zeilenAktionen(PLAN, "el")).toEqual({ einruecken: false, ausruecken: false, hoch: false, runter: true, unterstelle: true, seitenstelle: true, uebernehmen: false });
    expect(zeilenAktionen(PLAN, "kat")).toEqual({ einruecken: false, ausruecken: false, hoch: false, runter: false, unterstelle: false, seitenstelle: false, uebernehmen: false });
    expect(zeilenAktionen(PLAN, "y4")).toEqual({ einruecken: true, ausruecken: true, hoch: true, runter: false, unterstelle: true, seitenstelle: true, uebernehmen: false });
  });
  it("leere Zeile ohne Nachkommen wird gelöscht; mit Nachkommen oder Titel: PlanFehler", () => {
    const mitLeer = fuegeGeschwisterEin(PLAN, "x1", "leer");
    expect(loescheLeereZeile(mitLeer, "leer").stellen.some((x) => x.id === "leer")).toBe(false);
    const leerMitKind = { ...PLAN, stellen: PLAN.stellen.map((x) => (x.id === "x2" ? { ...x, titel: " " } : x)) };
    expect(() => loescheLeereZeile(leerMitKind, "x2")).toThrow(MELDUNG.nichtLeer);
    expect(() => loescheLeereZeile(PLAN, "x1")).toThrow(MELDUNG.mitTitel);
  });
});

describe("Verbindung für Geschwister übernehmen (Entscheidung 12)", () => {
  /** Unter EL: X1 an Bus a, dazu zwei Geschwister ohne Verbindung (wie nach Einfügen) und Y3 an Bus b. */
  const OHNE = baue({
    verbindungen: V,
    stellen: [
      { id: "el", titel: "EL" },
      { id: "x1", titel: "X1", eltern: "el", verbindung: "a" },
      { id: "n1", titel: "N1", eltern: "el" },
      { id: "n2", titel: "N2", eltern: "el" },
      { id: "y3", titel: "Y3", eltern: "el", verbindung: "b" },
      { id: "kat", titel: "KatSL", eltern: "el", lage: "links" },
    ],
  });
  it("alle Geschwister ohne Verbindung bekommen die der Stelle; Geschwister mit Verbindung und Seitenstellen bleiben", () => {
    expect(zeilenAktionen(OHNE, "x1").uebernehmen).toBe(true);
    const p = setzeVerbindungFuerGeschwister(OHNE, "x1");
    gueltig(p);
    expect(["n1", "n2", "y3", "kat"].map((id) => s(p, id).verbindungId ?? null)).toEqual(["a", "a", "b", null]);
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·N1", "·N2", "·Y3"]); // N1, N2 stehen jetzt in Gruppe a
    expect(zeilenAktionen(p, "x1").uebernehmen).toBe(false);
  });
  it("ohne eigene Verbindung, ohne betroffene Geschwister, an einer Wurzel oder Seitenstelle: PlanFehler", () => {
    expect(() => setzeVerbindungFuerGeschwister(OHNE, "n1")).toThrow(MELDUNG.ohneVerbindung);
    expect(() => setzeVerbindungFuerGeschwister(PLAN, "x1")).toThrow(MELDUNG.keineGeschwister);
    expect(() => setzeVerbindungFuerGeschwister(OHNE, "el")).toThrow(MELDUNG.ohneVerbindung);
    expect(() => setzeVerbindungFuerGeschwister(OHNE, "kat")).toThrow(MELDUNG.ohneVerbindung);
  });
});
