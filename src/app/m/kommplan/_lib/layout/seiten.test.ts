import { describe, expect, it } from "vitest";
import { baue, type StelleEingabe } from "../beispiele/bau";
import { kartenMass } from "./karte";
import { ABSTAND, KARTE } from "./masse";
import { Sammler } from "./sammler";
import { sechseckMass } from "./sechseck";
import { seitenAbstand, seitenBreite, setzeSeiten, stapelHoehe } from "./seiten";
import { baueSicht } from "./sicht";

function lege(stellen: StelleEingabe[], seite: "links" | "rechts") {
  const inhalt = baue({ verbindungen: [{ id: "v", art: "draht", bezeichnung: "Standleitung" }], stellen });
  const sicht = baueSicht(inhalt);
  const masse = (s: (typeof inhalt.stellen)[number]) =>
    kartenMass({ stelle: s, leerzeilen: false, darstellung: "normal", versteckt: 0, anzahlGruppen: 0, kanaele: [] });
  const eltern = sicht.wurzeln[0];
  const m = masse(eltern);
  const s = new Sammler();
  s.karte(eltern, m, 0, 0, { einklappbar: false, eingeklappt: false });
  const liste = sicht.seiten(eltern.id)[seite];
  setzeSeiten(s, eltern, m, seite, liste, { sicht, masse });
  return { s, m, liste, masse, sicht };
}

describe("Seitenstellen", () => {
  it("eine Seitenstelle links: Kopfmitte auf Kopfmitte, waagerechte Linie mit Sechseck", () => {
    const { s, m } = lege([{ id: "stab", titel: "Stab" }, { id: "katsl", titel: "KatSL", eltern: "stab", lage: "links", verbindung: "v" }], "links");
    const k = s.elemente.karten.find((x) => x.id === "katsl")!;
    expect(k.y + k.kopfHoehe / 2).toBeCloseTo(m.kopfHoehe / 2, 9);
    expect(k.x + k.breite).toBeCloseTo(-seitenAbstand([sechseckMass({ id: "v", art: "draht", bezeichnung: "Standleitung" })]), 9);
    const linie = s.elemente.linien.find((l) => l.y1 === l.y2)!;
    expect(linie).toMatchObject({ x1: 0, x2: k.x + k.breite, netz: "stab<links", duenn: false });
    const hex = s.elemente.sechsecke[0];
    expect(hex.y + hex.hoehe / 2).toBeCloseTo(linie.y1, 9);
    expect(hex.x).toBeGreaterThan(k.x + k.breite);
    expect(hex.x + hex.breite).toBeLessThan(-ABSTAND.seiteSchiene);
  });
  it("seitenBreite: wie weit der Stapel über die Elternstelle hinausragt", () => {
    const { s, liste, masse, sicht } = lege([{ id: "stab", titel: "Stab" }, { id: "katsl", titel: "KatSL", eltern: "stab", lage: "links", verbindung: "v" }], "links");
    const k = s.elemente.karten.find((x) => x.id === "katsl")!;
    expect(seitenBreite(liste, { sicht, masse })).toBeCloseTo(-k.x, 9);
    expect(seitenBreite([], { sicht, masse })).toBe(0);
  });
  it("ohne Verbindung: dünne Linie, kein Sechseck", () => {
    const { s } = lege([{ id: "a", titel: "A" }, { id: "b", titel: "B", eltern: "a", lage: "rechts" }], "rechts");
    expect(s.elemente.sechsecke).toEqual([]);
    expect(s.elemente.linien.every((l) => l.duenn)).toBe(true);
  });
  it("rechts neben einem zweispaltigen Einheitenblock", () => {
    const einheiten = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const { s, m } = lege([{ id: "a", titel: "A", einheiten }, { id: "b", titel: "B", eltern: "a", lage: "rechts", verbindung: "v" }], "rechts");
    expect(m.blockBreite).toBeGreaterThan(KARTE.breite);
    const k = s.elemente.karten.find((x) => x.id === "b")!;
    expect(k.x).toBeGreaterThanOrEqual(m.blockBreite + ABSTAND.seiteSchiene);
  });
  it("drei Seitenstellen links stapeln sich an einer Schiene", () => {
    const { s, m, liste, masse } = lege([
      { id: "a", titel: "A" },
      { id: "s1", titel: "S1", eltern: "a", lage: "links", verbindung: "v", einheiten: ["KdoW 40-10-1"] },
      { id: "s2", titel: "S2", eltern: "a", lage: "links" },
      { id: "s3", titel: "S3", eltern: "a", lage: "links", verbindung: "v" },
    ], "links");
    const karten = ["s1", "s2", "s3"].map((id) => s.elemente.karten.find((k) => k.id === id)!);
    for (let i = 1; i < 3; i++) expect(karten[i].y).toBeGreaterThanOrEqual(karten[i - 1].y + masse(liste[i - 1]).blockHoehe + ABSTAND.seitenStapel - 1e-9);
    const schiene = s.elemente.linien.find((l) => l.x1 === l.x2)!;
    expect(schiene.x1).toBe(-ABSTAND.seiteSchiene);
    expect(schiene.y1).toBeCloseTo(karten[0].y + karten[0].kopfHoehe / 2, 9);
    expect(schiene.y2).toBeCloseTo(karten[2].y + karten[2].kopfHoehe / 2, 9);
    expect(s.unten).toBeCloseTo(stapelHoehe(m, liste.map(masse)), 9);
  });
});
