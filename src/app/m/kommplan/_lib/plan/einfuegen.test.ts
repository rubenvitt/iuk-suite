import { describe, expect, it } from "vitest";
import { leseEinheitenliste } from "./einfuegen";
import { LAENGE } from "./schema";

describe("Liste einfügen (Spec §6.4)", () => {
  it("erstes Wort ist der Typ, der Rest der Rufname; Leerzeilen, Tabs und Mehrfachleerzeichen stören nicht", () => {
    expect(leseEinheitenliste("RTW RK UE 40-83-5\n\n  KTW\tRK UE 40-92-1  \r\nELW1   RK  UE 40-10-1\n")).toEqual({
      einheiten: [
        { typ: "RTW", rufname: "RK UE 40-83-5" },
        { typ: "KTW", rufname: "RK UE 40-92-1" },
        { typ: "ELW1", rufname: "RK UE 40-10-1" },
      ],
      fehler: [],
    });
  });
  it("ein einzelnes Wort ist ein Typ ohne Rufnamen", () => {
    expect(leseEinheitenliste("MTW").einheiten).toEqual([{ typ: "MTW", rufname: "" }]);
  });
  it("zu lange Typen und Rufnamen werden als Fehler mit Zeilennummer gemeldet, nicht gekürzt (Review Focus 2)", () => {
    const r = leseEinheitenliste(`RTW RK 1\n\n${"T".repeat(LAENGE.typ + 1)} X\nKTW ${"R".repeat(LAENGE.rufname + 1)}`);
    expect(r.fehler).toEqual([
      `Zeile 3: Der Typ ist länger als ${LAENGE.typ} Zeichen.`,
      `Zeile 4: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`,
    ]);
    expect(r.einheiten).toEqual([{ typ: "RTW", rufname: "RK 1" }]);
  });
  it("leere Eingabe: nichts, kein Fehler", () => {
    expect(leseEinheitenliste("  \n\t\n")).toEqual({ einheiten: [], fehler: [] });
  });
});
