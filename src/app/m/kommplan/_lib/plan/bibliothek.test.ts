import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import type { BibStelle } from "../bibliothek/typen";
import { bibStellenTreffer, bibStelleAus, bibVerbindungenFuerPlan, einsatzOrte, fuegeBibEinheitenEin, stelleVorschlaege, uebernimmBibStelle, verbindeMitBibVerbindung } from "./bibliothek";
import { PlanFehler } from "./operationen";

const PLAN = baue({
  verbindungen: [{ id: "v1", art: "tmo", bezeichnung: "R_UE_1" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v1", einheiten: ["RTW RK 1"] },
    { id: "a1", titel: "Trupp", eltern: "a" },
  ],
});
const LTS: BibStelle = { id: "b1", titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: "intern" };

describe("Kopien aus der Bibliothek (Spec §4.3, §6.4; Entscheidung 13)", () => {
  it("„Aus Bibliothek“ ersetzt Titel, Zeichen, Leiter, Kontakte — Einheiten, Unterstellen, Verbindung bleiben; eine Kopie", () => {
    const neu = uebernimmBibStelle(PLAN, "a", LTS);
    const a = neu.stellen.find((s) => s.id === "a")!;
    expect(a).toMatchObject({ titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }], verbindungId: "v1", eltern: "el" });
    expect(a.einheiten).toHaveLength(1);
    expect(neu.stellen.find((s) => s.id === "a1")!.eltern).toBe("a");
    LTS.kontakte[0].wert = "geändert";
    expect(a.kontakte[0].wert).toBe("0581 1"); // Kopie, kein Verweis
    LTS.kontakte[0].wert = "0581 1";
    expect(JSON.stringify(neu)).not.toContain("intern"); // die Notiz bleibt in der Bibliothek
  });
  it("Einheiten: mit neuen IDs angehängt; über 60 je Stelle ganz abgewiesen", () => {
    const e = [{ id: "x", typ: "KTW", rufname: "RK 2", zeichen: null, notiz: "n" }, { id: "y", typ: "NEF", rufname: "RK 3", zeichen: null, notiz: null }];
    const neu = fuegeBibEinheitenEin(PLAN, "a", e, ["e-1", "e-2"]);
    expect(neu.stellen.find((s) => s.id === "a")!.einheiten.map((x) => [x.id, x.typ, x.rufname])).toEqual([[expect.any(String), "RTW", "RK 1"], ["e-1", "KTW", "RK 2"], ["e-2", "NEF", "RK 3"]]);
    const voll = Array.from({ length: 60 }, (_, i) => ({ id: `z${i}`, typ: "KTW", rufname: `K ${i}`, zeichen: null, notiz: null }));
    expect(() => fuegeBibEinheitenEin(PLAN, "a", voll, voll.map((_, i) => `n${i}`))).toThrow(PlanFehler);
  });
  it("Verbindung: gleichnamig UND gleiche Art im Plan → die vorhandene; andere Art → Kopie; oberste Ebene → Fehler", () => {
    expect(verbindeMitBibVerbindung(PLAN, "a1", { id: "bv", art: "tmo", bezeichnung: "r_ue_1", notiz: null }, "v-neu")).toMatchObject({ verbindungen: [{ id: "v1" }] });
    const kopie = verbindeMitBibVerbindung(PLAN, "a1", { id: "bv", art: "dmo", bezeichnung: "R_UE_1", notiz: null }, "v-neu");
    expect(kopie.verbindungen.map((v) => [v.id, v.art])).toEqual([["v1", "tmo"], ["v-neu", "dmo"]]);
    expect(kopie.stellen.find((s) => s.id === "a1")!.verbindungId).toBe("v-neu");
    expect(() => verbindeMitBibVerbindung(PLAN, "el", { id: "bv", art: "dmo", bezeichnung: "X", notiz: null }, "v-neu")).toThrow(PlanFehler);
    expect(bibVerbindungenFuerPlan(PLAN, [{ id: "1", art: "tmo", bezeichnung: "R_UE_1", notiz: null }, { id: "2", art: "dmo", bezeichnung: "R_UE_1", notiz: null }]).map((b) => b.id)).toEqual(["2"]);
  });
  it("Titelvorschläge: ab 2 Zeichen, erst „beginnt mit“, dann „enthält“, höchstens 3; nicht, wenn die Stelle den Eintrag schon trägt", () => {
    const bib = ["EAL Nord", "Leitstelle Uelzen", "FW-Leitstelle", "Leitung Sanität", "Leitstelle Celle"].map((t, i): BibStelle => ({ id: `b${i}`, titel: t, zeichen: null, leiter: null, kontakte: [], notiz: null }));
    const leer = { titel: "", zeichen: null, leiter: null, kontakte: [] };
    expect(stelleVorschlaege(bib, { ...leer, titel: "l" })).toEqual([]);
    expect(stelleVorschlaege(bib, { ...leer, titel: "leit" }).map((b) => b.titel)).toEqual(["Leitstelle Uelzen", "Leitung Sanität", "Leitstelle Celle"]);
    expect(stelleVorschlaege(bib, { ...leer, titel: "leitstelle" }).map((b) => b.titel)).toEqual(["Leitstelle Uelzen", "Leitstelle Celle", "FW-Leitstelle"]);
    expect(stelleVorschlaege(bib, { ...leer, titel: "Leitstelle Celle" }).map((b) => b.titel)).toEqual([]); // trägt ihn schon (gleiche Angaben)
    expect(stelleVorschlaege(bib, { ...leer, titel: "Leitstelle Celle", leiter: "Jana" }).map((b) => b.titel)).toEqual(["Leitstelle Celle"]);
  });
  it("In Bibliothek übernehmen: getrimmter Titel, leere Kontakte fallen, neu (id null)", () => {
    const s = { ...PLAN.stellen[1], titel: "  EA 1 ", kontakte: [{ art: "telefon" as const, wert: " " }, { art: "fax" as const, wert: "1" }] };
    expect(bibStelleAus(s)).toEqual({ id: null, titel: "EA 1", zeichen: null, leiter: null, kontakte: [{ art: "fax", wert: "1" }], notiz: null });
  });
  it("Abgleich nach dem Einfügen: nur exakte Titel (Vergleichsform) unter den neuen IDs, nicht, was die Angaben schon trägt", () => {
    const mit = { ...PLAN, stellen: [...PLAN.stellen, { ...PLAN.stellen[2], id: "n1", titel: " leitstelle  UELZEN" }, { ...PLAN.stellen[2], id: "n2", titel: "Leitstelle" }] };
    expect(bibStellenTreffer(mit, ["n1", "n2"], [LTS]).map((t) => [t.stelleId, t.b.id])).toEqual([["n1", "b1"]]);
    const gefuellt = uebernimmBibStelle(mit, "n1", LTS);
    expect(bibStellenTreffer(gefuellt, ["n1", "n2"], [LTS])).toEqual([]);
    expect(bibStellenTreffer(mit, ["a"], [LTS])).toEqual([]); // nur die neuen IDs zählen
  });
  it("einsatzOrte: Rufname (Vergleichsform) → Stelle, an der das Fahrzeug steht", () => {
    expect(einsatzOrte(PLAN).get("rk 1")).toEqual({ stelleId: "a", titel: "EA 1" });
    expect(einsatzOrte(PLAN).has("rk 2")).toBe(false);
  });
});
