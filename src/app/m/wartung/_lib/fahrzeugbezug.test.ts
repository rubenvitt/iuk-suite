import { describe, expect, it } from "vitest";
import type { BereitgestelltesFahrzeug } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import type { GeraetEingabe } from "./eingabe";
import { fahrzeugWahl, mitFahrzeugbezug } from "./fahrzeugbezug";
import { passt, wahlZuName } from "./fahrzeugsuche";

const fz = (id: string, typ: string, funkkenner: string | null, kennzeichen: string | null, aktiv = true): BereitgestelltesFahrzeug => ({
  id, art: "fahrzeug", typ, funkrufname: `Rotkreuz Musterstadt ${funkkenner ?? typ}`, funkkenner, kennzeichen, standort: "Musterstadt", aktiv,
});
const BESTAND = [
  fz("a", "RTW", "11-83-1", "XX-DRK-1101"),
  fz("b", "ELW 1", "11-11-1", null),
  fz("c", "MTF", "11-19-1", "XX-DRK-1401", false),
];
const basis: GeraetEingabe = {
  gruppeId: "g", artId: "a", name: "Stromerzeuger", hersteller: "", typ: "", seriennr: "",
  ortArt: "fahrzeug", ort: "", fahrzeugId: null, stunden: null, hinweise: "", pruefanleitung: "",
};

describe("Fahrzeugwahl der Gerätewartung (IDA-342)", () => {
  const wahl = fahrzeugWahl(BESTAND);

  it("zeigt nur aktive Fahrzeuge, benannt nach der Regel der Fahrzeugverwaltung", () => {
    expect(wahl.map((w) => w.name)).toEqual(["ELW 1 11-11-1", "RTW 11-83-1"]);
  });

  it("findet per Funkrufname, Funkkenner und Kennzeichen, egal mit welchem Trennzeichen", () => {
    const finde = (q: string) => wahl.filter((w) => passt(w, q)).map((w) => w.id);
    expect(finde("musterstadt 11/83")).toEqual(["a"]);
    expect(finde("1183")).toEqual(["a"]);
    expect(finde("xx drk 1101")).toEqual(["a"]);
    expect(finde("elw")).toEqual(["b"]);
    expect(finde("")).toEqual(["b", "a"]);
    expect(finde("hlf")).toEqual([]);
  });

  it("verknüpft nur bei genau gleichem Namen", () => {
    expect(wahlZuName(wahl, " RTW 11-83-1 ")?.id).toBe("a");
    expect(wahlZuName(wahl, "RTW")).toBeNull();
  });

  it("nimmt den Namen aus der Fahrzeugverwaltung, nicht aus der Eingabe", () => {
    expect(mitFahrzeugbezug({ ...basis, ort: "irgendwas", fahrzeugId: "a" }, BESTAND)).toMatchObject({ ort: "RTW 11-83-1", fahrzeugId: "a" });
  });

  it("lässt Freitext für ein Fahrzeug von woanders zu und verknüpft einen gleichen Namen", () => {
    expect(mitFahrzeugbezug({ ...basis, ort: "Leihfahrzeug" }, BESTAND)).toMatchObject({ ort: "Leihfahrzeug", fahrzeugId: null });
    expect(mitFahrzeugbezug({ ...basis, ort: "ELW 1 11-11-1" }, BESTAND).fahrzeugId).toBe("b");
  });

  it("verwirft den Verweis im Lager und lehnt ein unbekanntes Fahrzeug ab", () => {
    expect(mitFahrzeugbezug({ ...basis, ortArt: "lager", ort: "Halle", fahrzeugId: "a" }, BESTAND).fahrzeugId).toBeNull();
    expect(() => mitFahrzeugbezug({ ...basis, ort: "x", fahrzeugId: "weg" }, BESTAND)).toThrow(/nicht mehr/);
  });

  it("lehnt einen neuen Verweis auf ein Fahrzeug außer Dienst ab, behält einen gespeicherten", () => {
    expect(() => mitFahrzeugbezug({ ...basis, fahrzeugId: "c" }, BESTAND)).toThrow(/außer Dienst/);
    expect(mitFahrzeugbezug({ ...basis, fahrzeugId: "c" }, BESTAND, "c")).toMatchObject({ ort: "MTF 11-19-1", fahrzeugId: "c" });
  });

  it("verknüpft Freitext nicht, wenn zwei Fahrzeuge denselben Namen tragen", () => {
    const zwei = [fz("x", "Anhänger", null, null), fz("y", "Anhänger", null, null)];
    expect(mitFahrzeugbezug({ ...basis, ort: "Rotkreuz Musterstadt Anhänger" }, zwei).fahrzeugId).toBeNull();
    expect(mitFahrzeugbezug({ ...basis, ort: "egal", fahrzeugId: "y" }, zwei).fahrzeugId).toBe("y");
  });
});
