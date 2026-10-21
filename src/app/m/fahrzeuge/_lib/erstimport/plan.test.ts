import { describe, expect, it } from "vitest";
import { kennerAus, kennzeichenSchluessel, planeErstimport, type Kandidat } from "./plan";

const k = (teil: Partial<Kandidat> & Pick<Kandidat, "quelle" | "quellId">): Kandidat => ({
  anzeige: teil.quellId, typ: null, funkrufname: null, funkkenner: null, kennzeichen: null, standort: null, aktiv: true, hinweis: null, ...teil,
});

const EB_RTW = k({ quelle: "einsatzbuch", quellId: "eb1", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", standort: "Uelzen" });

describe("Schlüssel", () => {
  it("findet den Funkkenner in jeder üblichen Schreibweise", () => {
    expect(kennerAus("11-83-1")).toBe("11-83-1");
    expect(kennerAus("RTW 11/83-1")).toBe("11-83-1");
    expect(kennerAus("Rotkreuz Uelzen 11 83 01")).toBe("11-83-1");
    expect(kennerAus("RTW 1")).toBeNull();
    expect(kennerAus("Fahrzeughalle")).toBeNull();
    expect(kennerAus("Telefon 0581-12345-67")).toBeNull();
  });

  it("vergleicht Kennzeichen ohne Leerzeichen, Bindestriche und Groß-/Kleinschreibung", () => {
    expect(kennzeichenSchluessel("ue-rk 831")).toBe(kennzeichenSchluessel("UE RK-831"));
    expect(kennzeichenSchluessel(" ")).toBeNull();
  });
});

describe("planeErstimport", () => {
  it("legt zusammen, was einen Funkkenner oder ein Kennzeichen teilt — auch über Ketten", () => {
    const plan = planeErstimport([
      EB_RTW,
      k({ quelle: "lagerbuch", quellId: "lb1", anzeige: "RTW 11/83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 831" }),
      k({ quelle: "funkgeraete", quellId: "RTW 11/83-1" }),
    ], [], new Set());
    expect(plan.vorschlaege).toHaveLength(1);
    const [v] = plan.vorschlaege;
    expect(v.kandidaten.map((x) => x.quelle)).toEqual(["einsatzbuch", "lagerbuch", "funkgeraete"]);
    expect(v.ziel).toEqual({ art: "neu", fahrzeug: {
      art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 831",
      standort: "Uelzen", bemerkung: "", aktiv: true,
    } });
  });

  it("rät nie: ohne gemeinsamen Schlüssel bleiben zwei Zeilen getrennt", () => {
    const plan = planeErstimport([EB_RTW, k({ quelle: "lagerbuch", quellId: "lb1", anzeige: "RTW 1", kennzeichen: "UE-RK 1" })], [], new Set());
    expect(plan.vorschlaege).toHaveLength(2);
    const lager = plan.vorschlaege.find((v) => v.kandidaten[0].quelle === "lagerbuch")!;
    expect(lager.ziel).toEqual({ art: "offen", grund: "für ein neues Fahrzeug fehlt: Typ, Funkrufname, Standort" });
  });

  it("ein Funkgeräte-Ort findet sein Lagerbuch-Fahrzeug über den Namen", () => {
    const plan = planeErstimport([
      k({ quelle: "lagerbuch", quellId: "lb1", anzeige: "RTW 1", kennzeichen: "UE-RK 1" }),
      k({ quelle: "funkgeraete", quellId: "rtw-1", anzeige: "rtw-1" }),
    ], [], new Set());
    expect(plan.vorschlaege).toHaveLength(1);
  });

  it("ordnet einem vorhandenen Stammfahrzeug zu, statt ein zweites anzulegen", () => {
    const plan = planeErstimport([EB_RTW], [{ id: "s1", funkrufname: "RTW 1", funkkenner: "11-83-1", kennzeichen: null }], new Set());
    expect(plan.vorschlaege[0].ziel).toEqual({ art: "bestand", stammId: "s1", anzeige: "RTW 1" });
  });

  it("passt eine Gruppe zu zwei Stammfahrzeugen, entscheidet der Mensch", () => {
    const plan = planeErstimport(
      [k({ quelle: "lagerbuch", quellId: "lb1", funkkenner: "11-83-1", kennzeichen: "UE-RK 2" })],
      [{ id: "s1", funkrufname: "A", funkkenner: "11-83-1", kennzeichen: null }, { id: "s2", funkrufname: "B", funkkenner: null, kennzeichen: "UE-RK 2" }],
      new Set(),
    );
    expect(plan.vorschlaege[0].ziel.art).toBe("offen");
  });

  it("ein Ort nur bei den Funkgeräten ist immer offen, auch mit Funkkenner", () => {
    const plan = planeErstimport([k({ quelle: "funkgeraete", quellId: "11-83-1", funkkenner: "11-83-1" })], [], new Set());
    expect(plan.vorschlaege[0].ziel.art).toBe("offen");
  });

  it("schon Zugeordnetes fällt heraus und wird gezählt", () => {
    const plan = planeErstimport([EB_RTW, k({ quelle: "funkgeraete", quellId: "Halle" })], [], new Set(["funkgeraete:Halle"]));
    expect(plan.vorschlaege).toHaveLength(1);
    expect(plan.schonZugeordnet).toEqual({ einsatzbuch: 0, lagerbuch: 0, funkgeraete: 1 });
  });

  it("der Schlüssel eines Vorschlags hängt nicht an der Reihenfolge der Quellen", () => {
    const a = planeErstimport([EB_RTW, k({ quelle: "lagerbuch", quellId: "lb1", funkkenner: "11-83-1" })], [], new Set());
    const b = planeErstimport([k({ quelle: "lagerbuch", quellId: "lb1", funkkenner: "11-83-1" }), EB_RTW], [], new Set());
    expect(a.vorschlaege[0].schluessel).toBe(b.vorschlaege[0].schluessel);
  });
});
