import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { PlanFehler } from "./operationen";
import { LAENGE } from "./schema";
import {
  aendereVerbindung, findeVerbindung, istReserve, legeVerbindungAn, loescheVerbindung, verbindungsNutzung,
} from "./verbindungen";

const plan = () => baue({
  verbindungen: [
    { id: "v1", art: "tmo", bezeichnung: "R_UE_2" },
    { id: "v2", art: "dmo", bezeichnung: "DMO 608" },
    { id: "v3", art: "tmo", bezeichnung: "K_UE_2" },
  ],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v1", kanaele: ["v2"] },
    { id: "b", titel: "EA 2", eltern: "el", verbindung: "v1" },
  ],
});

describe("Verbindungen des Plans", () => {
  it("zählt Nutzung als Weg zur Elternstelle und als Kanal getrennt", () => {
    expect(Object.fromEntries(verbindungsNutzung(plan()))).toEqual({
      v1: { eltern: 2, kanal: 0 }, v2: { eltern: 0, kanal: 1 }, v3: { eltern: 0, kanal: 0 },
    });
  });
  it("Reserve ist nur, was weder Weg noch Kanal ist (Review Focus 4)", () => {
    expect(["v1", "v2", "v3"].map((id) => istReserve(plan(), id))).toEqual([false, false, true]);
  });
  it("die verbindungId einer Wurzel ist kein Weg — Reserve und löschbar wie in legende() (Review Focus 4)", () => {
    const mitWurzelweg = baue({
      verbindungen: [{ id: "v9", art: "tmo", bezeichnung: "K_UE_9" }],
      stellen: [{ id: "w", titel: "Wurzel", verbindung: "v9" }],
    });
    expect(verbindungsNutzung(mitWurzelweg).get("v9")).toEqual({ eltern: 0, kanal: 0 });
    expect(istReserve(mitWurzelweg, "v9")).toBe(true);
    const ohne = loescheVerbindung(mitWurzelweg, "v9");
    expect(ohne.verbindungen).toEqual([]);
    expect(ohne.stellen[0].verbindungId).toBeNull(); // sonst verletzte der Rest die Invariante „Verbindung existiert"
  });
  it("legt an, ändert Art und Bezeichnung; leere oder zu lange Bezeichnung wird abgewiesen", () => {
    let p = legeVerbindungAn(plan(), { id: "v4", art: "draht", bezeichnung: "  Standleitung " });
    expect(p.verbindungen.at(-1)).toEqual({ id: "v4", art: "draht", bezeichnung: "Standleitung" });
    p = aendereVerbindung(p, "v4", { art: "telefon", bezeichnung: "Amt" });
    expect(p.verbindungen.at(-1)).toEqual({ id: "v4", art: "telefon", bezeichnung: "Amt" });
    expect(() => legeVerbindungAn(plan(), { id: "v5", art: "tmo", bezeichnung: "   " })).toThrow("Die Verbindung braucht eine Bezeichnung.");
    expect(() => aendereVerbindung(plan(), "v1", { bezeichnung: "x".repeat(LAENGE.bezeichnung + 1) })).toThrow(PlanFehler);
    expect(() => aendereVerbindung(plan(), "fehlt", { art: "tmo" })).toThrow("Verbindung fehlt gibt es nicht");
  });
  it("löscht nur Unbenutztes — auch ein reiner Kanal ist benutzt", () => {
    expect(loescheVerbindung(plan(), "v3").verbindungen.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(() => loescheVerbindung(plan(), "v1")).toThrow("„R_UE_2“ wird noch benutzt und lässt sich nicht löschen.");
    expect(() => loescheVerbindung(plan(), "v2")).toThrow("„DMO 608“ wird noch benutzt und lässt sich nicht löschen.");
  });
  it("findet eine vorhandene Verbindung beim Neu-Eintippen wieder (gleiche Art, Bezeichnung ohne Rücksicht auf Groß/klein)", () => {
    expect(findeVerbindung(plan(), " r_ue_2 ", "tmo")?.id).toBe("v1");
    expect(findeVerbindung(plan(), "R_UE_2", "dmo")).toBeUndefined();
  });
});
