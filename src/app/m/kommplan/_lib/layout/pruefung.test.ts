import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { leereElemente, type Zeichnungsdaten } from "./typen";
import { pruefeMitte, pruefeTexte, pruefeVerbindungen, pruefeZeichnung } from "./pruefung";
import { zeichne } from "./zeichne";

const leer = (): Zeichnungsdaten => ({ ...leereElemente(), breite: 100, hoehe: 100, legende: [] });
const karte = (id: string, x: number, y: number) => ({
  id, x, y, breite: 46, hoehe: 12, kopfHoehe: 12, art: "normal" as const, hervorheben: false, zeichen: null,
  titel: [], titelVoll: id, gekuerzt: false, leiter: null, kontakte: [], verweis: null, einklappbar: false, eingeklappt: false,
});
const linie = (netz: string, x1: number, y1: number, x2: number, y2: number) => ({ netz, x1, y1, x2, y2, duenn: false });
const sechseck = (netz: string, x: number, y: number) => ({
  netz, verbindungId: "v", art: "tmo" as const, form: "funk" as const, x, y, breite: 26, hoehe: 6,
  beschriftung: { text: "", x: 0, y: 0, groesse: 8, fett: true, anker: "mitte" as const }, voll: "", piktogramm: "comms.voice-radio-tmo",
});
const arten = (z: Zeichnungsdaten) => pruefeZeichnung(z).map((b) => b.art);

describe("pruefeZeichnung — Kästen", () => {
  it("findet überlappende Karten", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 40, 5)] })).toEqual(["ueberlappung"]);
  });
  it("Karten verschiedener Stellen, die sich berühren oder weniger als 2 mm Luft haben, sind ein Befund", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 46, 0)] })).toEqual(["abstand"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 47.5, 0)] })).toEqual(["abstand"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 0, 13)] })).toEqual(["abstand"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 48, 0)] })).toEqual([]);
  });
  it("Kästen derselben Stelle dürfen dicht liegen, nur nicht überlappen", () => {
    const einheit = { id: "e", stelleId: "a", x: 6, y: 13.3, breite: 40, hoehe: 4.2, voll: "RTW", zeichen: null,
      zeilen: [{ text: "RTW", x: 20, y: 3, groesse: 8, fett: false, anker: "mitte" as const }] };
    expect(arten({ ...leer(), karten: [karte("a", 0, 0)], einheiten: [einheit] })).toEqual([]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0)], einheiten: [{ ...einheit, y: 10 }] })).toEqual(["ueberlappung"]);
  });
});

describe("pruefeTexte", () => {
  const einheit = (text: string, x = 20, anker: "start" | "mitte" | "ende" = "mitte", y = 3) => ({
    id: "e", stelleId: "a", x: 6, y: 13.3, breite: 40, hoehe: 4.2, voll: text, zeichen: null,
    zeilen: [{ text, x, y, groesse: 8, fett: false, anker }],
  });
  it("ein Text, der in seinen Kasten passt, ist befundfrei", () => {
    expect(pruefeTexte({ ...leer(), einheiten: [einheit("RTW RK UE 40-83-1")] })).toEqual([]);
  });
  it("ein zu breiter oder verrutschter Text ist ein Befund", () => {
    expect(pruefeTexte({ ...leer(), einheiten: [einheit("GW Betreuung RK LG 45-74-10 Nord")] }).map((b) => b.art)).toEqual(["text"]);
    expect(pruefeTexte({ ...leer(), einheiten: [einheit("RTW", 39, "start")] })).toHaveLength(1);
    expect(pruefeTexte({ ...leer(), einheiten: [einheit("RTW", 20, "mitte", 5)] })).toHaveLength(1);
  });
});

describe("pruefeZeichnung — Linie neben einem Kasten", () => {
  it("eine fremde Linie knapp neben einer Kartenkante ist ein Befund, 0,75 mm daneben nicht", () => {
    const mit = (x: number) => arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("b>v", x, 0, x, 40)] });
    expect(mit(46.02)).toEqual(["naehe"]);
    expect(mit(46.5)).toEqual(["naehe"]);
    expect(mit(46.76)).toEqual([]);
    expect(mit(46)).toEqual(["kante"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("b>v", 0, 9.8, 46, 9.8)] })).toEqual(["naehe"]);
  });
  it("ein Ende, das senkrecht an die Kante stößt, läuft nicht daneben", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("w>v", 23, 6, 23, 10)] })).toEqual([]);
  });
});

describe("pruefeZeichnung — Linien", () => {
  it("findet Kreuzungen verschiedener Netze, nicht innerhalb eines Netzes", () => {
    const z = { ...leer(), linien: [linie("a", 0, 5, 10, 5), linie("b", 5, 0, 5, 10), linie("a", 5, 5, 5, 20)] };
    expect(pruefeZeichnung(z).filter((b) => b.art === "kreuzung")).toHaveLength(2);
  });
  it("parallele Linien verschiedener Netze brauchen 0,75 mm", () => {
    expect(arten({ ...leer(), linien: [linie("a", 0, 5, 10, 5), linie("b", 0, 5.5, 10, 5.5)] })).toEqual(["naehe"]);
    expect(arten({ ...leer(), linien: [linie("a", 3, 0, 3, 10), linie("b", 3.5, 2, 3.5, 20)] })).toEqual(["naehe"]);
    expect(arten({ ...leer(), linien: [linie("a", 0, 5, 10, 5), linie("b", 0, 6, 10, 6)] })).toEqual([]);
  });
  it("findet eine Linie durch eine Karte, aber nicht bis an ihre Kante", () => {
    const k = karte("a", 0, 10);
    expect(arten({ ...leer(), karten: [k], linien: [linie("n", 20, 0, 20, 10)] })).toEqual([]);
    expect(arten({ ...leer(), karten: [k], linien: [linie("n", 20, 0, 20, 15)] })).toEqual(["durchstich"]);
  });
  it("eine Linie, die auf der Kante eines Kastens entlangläuft, ist ein Befund", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("n", 5, 10, 30, 10)] })).toEqual(["kante"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("n", 46, 12, 46, 30)] })).toEqual(["kante"]);
  });
  it("ein Sechseck lässt nur den waagerechten Zweig seines Netzes durch seine Mitte", () => {
    const h = sechseck("p<links", 10, 0);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("p<links", 0, 3, 40, 3)] })).toEqual([]);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("p<links", 0, 2, 40, 2)] })).toEqual(["durchstich"]);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("p<links", 20, -5, 20, 10)] })).toEqual(["durchstich"]);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("q<links", 0, 3, 40, 3)] })).toEqual(["durchstich"]);
  });
  it("schräge Linien sind ein Befund", () => {
    expect(arten({ ...leer(), linien: [linie("n", 0, 0, 5, 5)] })).toEqual(["schraeg"]);
  });
});

describe("pruefeMitte", () => {
  const plan = baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen: [
    { id: "p", titel: "P" }, { id: "a", titel: "A", eltern: "p", verbindung: "v" }, { id: "b", titel: "B", eltern: "p", verbindung: "v" },
  ] });
  const z = zeichne(plan, "bildschirm");
  it("die Engine stellt die Elternstelle mittig über den Bus", () => expect(pruefeMitte(z, plan)).toEqual([]));
  it("leitet die Spanne aus den Linien ab: ohne gemeldete Spanne fällt eine verschobene Elternkarte trotzdem auf", () => {
    const verschoben = { ...z, spannen: [], karten: z.karten.map((k) => (k.id === "p" ? { ...k, x: k.x + 5 } : k)) };
    expect(pruefeMitte(verschoben, plan).map((b) => b.text)).toEqual(["p steht 5.000 mm neben der Mitte"]);
  });
  it("eine gemeldete Spanne, die nicht zu den Linien passt, ist ein Befund", () => {
    expect(pruefeMitte({ ...z, spannen: [{ stelleId: "p", links: 0, rechts: 46 }] }, plan)).toHaveLength(1);
  });
  it("ohne Bus über den Kindern ist das ein Befund", () => {
    expect(pruefeMitte({ ...z, linien: [] }, plan).map((b) => b.text)).toEqual(["p: kein Bus 4 mm über den Kindern"]);
  });
});

/**
 * DIE POSITIVE HÄLFTE: eine Zeichnung mit weniger Linien hat für `pruefeZeichnung` weniger
 * Befunde. Jede Mutation hier nimmt der echten Engine-Ausgabe etwas weg und muss rot werden.
 */
describe("pruefeVerbindungen", () => {
  const p = baue({
    verbindungen: [
      { id: "v", art: "tmo", bezeichnung: "R_UE_2" }, { id: "d", art: "draht", bezeichnung: "Standleitung" },
      { id: "k", art: "dmo", bezeichnung: "DMO 608" },
    ],
    stellen: [
      { id: "w", titel: "W", kanaele: ["k"] },
      { id: "a", titel: "A", eltern: "w", verbindung: "v" }, { id: "b", titel: "B", eltern: "w", verbindung: "v" },
      { id: "s", titel: "S", eltern: "w", lage: "rechts", verbindung: "d" },
    ],
  });
  const z = zeichne(p, "bildschirm");
  const k = (id: string) => z.karten.find((x) => x.id === id)!;

  it("die vollständige Zeichnung der Engine ist angebunden", () => {
    expect(pruefeVerbindungen(z, p)).toEqual([]);
  });
  it("ohne Linien ist nichts angebunden", () => {
    expect(pruefeVerbindungen({ ...z, linien: [] }, p).length).toBeGreaterThanOrEqual(4);
  });
  it("ein Bus mit fremdem Sechseck ist ein Befund, auch wenn alles verbunden ist", () => {
    const falsch = { ...z, sechsecke: z.sechsecke.map((h) => (h.netz === "w>v" ? { ...h, verbindungId: "k" } : h)) };
    expect(pruefeVerbindungen(falsch, p).map((b) => b.text)).toEqual([
      "a hängt an einem Bus mit k, erwartet v", "b hängt an einem Bus mit k, erwartet v",
    ]);
  });
  it("eine Seitenstelle an einem Zweig mit fremdem Sechseck ist ein Befund", () => {
    const falsch = { ...z, sechsecke: z.sechsecke.map((h) => (h.netz === "w<rechts" ? { ...h, verbindungId: "v" } : h)) };
    expect(pruefeVerbindungen(falsch, p).map((b) => b.text)).toEqual(["s hängt an einem Zweig mit v, erwartet d"]);
  });
  it("fehlt ein Abwurf, nennt der Befund die Karte", () => {
    const a = k("a");
    const ohne = z.linien.filter((l) => !(l.netz === "w>v" && l.x1 === l.x2 && Math.abs(l.y2 - a.y) < 1e-6 && Math.abs(l.x1 - (a.x + a.breite / 2)) < 1e-6));
    expect(ohne).toHaveLength(z.linien.length - 1);
    expect(pruefeVerbindungen({ ...z, linien: ohne }, p).map((b) => b.text)).toContain("a hängt an keinem Bus von w");
  });
  it("fehlt das Stielstück an der Karte, beginnt das Netz nicht an seiner Stelle", () => {
    const w = k("w");
    const ohne = z.linien.filter((l) => !(l.netz === "w>v" && Math.abs(Math.min(l.y1, l.y2) - (w.y + w.hoehe)) < 1e-6));
    expect(pruefeVerbindungen({ ...z, linien: ohne }, p).some((b) => b.text.startsWith("Netz w>v"))).toBe(true);
  });
  it("ein Sechseck neben seiner Linie und eine Seitenstelle ohne Zweig sind Befunde", () => {
    const verschoben = z.sechsecke.map((h) => (h.netz === "w<rechts" ? { ...h, y: h.y + 3 } : h));
    expect(pruefeVerbindungen({ ...z, sechsecke: verschoben }, p).map((b) => b.art)).toContain("verbindung");
    const ohneZweig = z.linien.filter((l) => l.netz !== "w<rechts");
    expect(pruefeVerbindungen({ ...z, linien: ohneZweig }, p).map((b) => b.text)).toContain("s hängt an keinem Zweig von w");
  });
  it("ein Kanal-Sechseck ohne seine Linie ist ein Befund", () => {
    expect(pruefeVerbindungen({ ...z, linien: z.linien.filter((l) => l.netz !== "w#kanal") }, p).length).toBeGreaterThan(0);
  });
});
