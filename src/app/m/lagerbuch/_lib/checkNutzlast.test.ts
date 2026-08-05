import { describe, it, expect } from "vitest";
import { checkNutzlast, zaehleAblaufende, GERAET_VORBELEGUNG,
         type CheckZaehlung } from "./checkNutzlast";
import { ausZivilzeit } from "./zeit";

const LEER: CheckZaehlung = { ist: {}, nachfuell: {}, geraete: {}, druck: {}, verfaelle: {} };
const BASIS = {
  fahrzeugId: "rtw-1",
  positionen: [
    { id: "sp1", artikelId: "a1", soll: 4 },
    { id: "sp2", artikelId: "a1", soll: 2 },   // DERSELBE Artikel, zweites Fach
    { id: "sp3", artikelId: "a2", soll: 1 },
  ],
  geraete: [{ id: "g1" }, { id: "g2" }],
  flaschen: [{ id: "f1", nennfuelldruckBar: 200 }, { id: "f2", nennfuelldruckBar: 300 }],
};

describe("checkNutzlast — die vier Vorbelegungen (§5.8.1)", () => {
  it("Ist ist auf SOLL vorbelegt", () => {
    // `ist[p.id] ?? p.soll` (CheckFlow.tsx:97). Konvention: „voll annehmen,
    // Gezaehltes runterkorrigieren".
    const n = checkNutzlast({ ...BASIS, z: LEER });
    expect(n.positionen).toEqual([
      { sollPositionId: "sp1", ist: 4, nachfuellMenge: 0 },
      { sollPositionId: "sp2", ist: 2, nachfuellMenge: 0 },
      { sollPositionId: "sp3", ist: 1, nachfuellMenge: 0 },
    ]);
  });

  it("ein gezaehlter Wert schlaegt die Vorbelegung — auch die 0", () => {
    // `?? p.soll`, NICHT `|| p.soll`: eine gezaehlte 0 ist eine Aussage („Fach
    // leer"), und `||` machte daraus wieder das Soll.
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, ist: { sp1: 0 } } });
    expect(n.positionen[0]).toEqual({ sollPositionId: "sp1", ist: 0, nachfuellMenge: 0 });
  });

  it("es werden ALLE Positionen gesendet, auch unveraenderte", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, ist: { sp2: 1 } } }).positionen).toHaveLength(3);
  });

  it("Geraete sind auf {vorhanden: true, zustand: 'In Ordnung'} vorbelegt", () => {
    const n = checkNutzlast({ ...BASIS, z: LEER });
    expect(GERAET_VORBELEGUNG).toEqual({ vorhanden: true, zustand: "In Ordnung" });
    expect(n.geraete).toEqual([
      { geraetId: "g1", vorhanden: true, zustand: "In Ordnung" },
      { geraetId: "g2", vorhanden: true, zustand: "In Ordnung" },
    ]);
  });

  it("Druck ist auf den NENNFUELLDRUCK vorbelegt — je Flasche verschieden", () => {
    expect(checkNutzlast({ ...BASIS, z: LEER }).flaschen).toEqual([
      { flascheId: "f1", druckBar: 200 },
      { flascheId: "f2", druckBar: 300 },
    ]);
  });

  it("ein abgelesener Druck von 0 schlaegt die Vorbelegung", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, druck: { f1: 0 } } }).flaschen[0])
      .toEqual({ flascheId: "f1", druckBar: 0 });
  });
});

describe("checkNutzlast — die Verfaelle sind die EINE Ausnahme", () => {
  it("sendet NUR die geaenderten", () => {
    /**
     * `CheckFlow.tsx:153-155`. Ein FEHLENDER Eintrag heisst „unangetastet"
     * (`check.ts:151-152`). Wer das mit der Alles-senden-Konvention der uebrigen
     * Listen „vereinheitlicht", LOESCHT bei jedem Check jede Verfallsangabe, die
     * niemand angefasst hat.
     */
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: "2026-09" } } });
    expect(n.verfaelle).toEqual([{ artikelId: "a1", verfall: "2026-09" }]);
  });

  it("ein LEERER String wird zu null — das ist 'loeschen', nicht 'unangetastet'", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: "" } } }).verfaelle)
      .toEqual([{ artikelId: "a1", verfall: null }]);
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a2: null } } }).verfaelle)
      .toEqual([{ artikelId: "a2", verfall: null }]);
  });

  it("`undefined` wird gar nicht gesendet", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: undefined } } }).verfaelle)
      .toEqual([]);
  });

  it("wirft einen formal falschen Monat gar nicht erst ein", () => {
    // Der Server lehnt ihn ohnehin ab (MONAT_REGEX in der Zod-Form, Teil 4). Hier
    // wird er ausgelassen, damit ein Tippfehler nicht den GANZEN Check-Abschluss
    // ablehnt — die uebrigen Angaben sind davon unberuehrt.
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: "2026-13", a2: "2026-09" } } });
    expect(n.verfaelle).toEqual([{ artikelId: "a2", verfall: "2026-09" }]);
  });
});

describe("checkNutzlast — nachfuellMenge wird hier NICHT geklemmt", () => {
  it("reicht den Wert durch, auch wenn er ueber der Luecke liegt", () => {
    /**
     * Die Klemmung auf max(0, soll − ist) ist SERVERSEITIG (`check.ts:95`) und
     * bleibt es; der Client-Deckel (`max={luecke}`) ist Bequemlichkeit vor dem
     * Serverfehler (§5.15, Punkt 8). Eine zweite Klemmung hier verdeckte, ob die
     * serverseitige noch da ist.
     */
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, ist: { sp1: 4 }, nachfuell: { sp1: 99 } } });
    expect(n.positionen[0]).toEqual({ sollPositionId: "sp1", ist: 4, nachfuellMenge: 99 });
  });
});

describe("zaehleAblaufende — die Live-Vorschau '{n} laufen ab'", () => {
  const NOW = ausZivilzeit(2026, 6, 15, 12, 0, 0, 0);
  const S = { rotTage: 31, gelbTage: 56 };

  it("zaehlt jede gemeldete Angabe, deren Ampel NICHT gruen ist", () => {
    expect(zaehleAblaufende(
      { a1: "2026-06", a2: "2026-07", a3: "2028-01" }, S, NOW,
    )).toBe(2);
  });

  it("ignoriert leere und geloeschte Angaben", () => {
    expect(zaehleAblaufende({ a1: "", a2: null, a3: undefined }, S, NOW)).toBe(0);
  });

  it("ignoriert formal falsche Monate, statt zu werfen", () => {
    // Die Vorschau laeuft bei JEDEM Tastendruck. Ein Wurf hier braeche die
    // Eingabe waehrend des Tippens ab — „2026-1" ist ein Zwischenzustand.
    expect(zaehleAblaufende({ a1: "2026-1", a2: "2026-06" }, S, NOW)).toBe(1);
  });

  it("zaehlt die Pseudo-Charge nicht mit", () => {
    expect(zaehleAblaufende({ a1: "2099-12" }, S, NOW)).toBe(0);
  });
});
