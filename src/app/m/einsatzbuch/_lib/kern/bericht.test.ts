import { describe, expect, it } from "vitest";
import { bericht } from "./bericht";
import type { Block } from "./format";
import { beispielEinsatz, GENESIS } from "./testhilfe";

const block: Block = {
  kopf: { v: 1, block: 7, prev: GENESIS, versiegelt: "2026-09-23T19:08:00Z", schluesselId: "0123456789abcdef", umgebung: "echt" },
  iv: "", daten: "", umschlag: { epk: "", iv: "", ct: "" }, hash: "a".repeat(64),
};
const extra = { pruefung: "Kette intakt", quelle: "Einsatzbuch Reader", erzeugt: "24.9.2026, 10:00 Uhr", zeitzone: "Europe/Berlin" };

describe("bericht", () => {
  it("füllt das Berichtsblatt aus Block und Einsatz", () => {
    const b = bericht(block, beispielEinsatz(), extra);
    expect(b).toMatchObject({
      nummer: "2026-047", block: 7, stichwort: "MANV 10", ort: "B4, Abfahrt Uelzen-Nord, 29525 Uelzen",
      beginn: "23.9.2026, 18:42 Uhr", ende: "23.9.2026, 21:05 Uhr", dauer: "2 h 23 min",
      vorOrt: 7, transport: 3, gesamt: 10, versiegelt: "23.9.2026, 21:08 Uhr", hash: "a".repeat(64), prev: GENESIS,
    });
    expect(b.fahrzeuge).toEqual([{ typ: "RTW", ruf: "Rotkreuz Uelzen 11-83-1", besatzung: "1" }]);
    expect(b.personal).toEqual([
      { name: "Dierks, Malte", quali: "NotSan", fahrzeug: "RTW 11-83-1" },
      { name: "Isermann, Paula", quali: "SanH", fahrzeug: "—" },
    ]);
  });
  it("leere Felder werden zu Gedankenstrichen, offenes Ende zu „nicht angegeben“", () => {
    const e = { ...beispielEinsatz(), strasse: "", ort: "", objekt: "", endeDatum: null, endeZeit: null, fahrzeuge: [], personal: [] };
    expect(bericht(block, e, extra)).toMatchObject({ ort: "—", objekt: "—", ende: "nicht angegeben", dauer: "—", fahrzeuge: [], personal: [] });
  });
  it("ein Ende vor dem Beginn ergibt keine negative Dauer im Blatt", () => {
    expect(bericht(block, { ...beispielEinsatz(), endeZeit: "18:00" }, extra).dauer).toBe("—");
  });
  it("markiert Testblöcke", () => {
    expect(bericht(block, beispielEinsatz(), extra).test).toBe(false);
    expect(bericht({ ...block, kopf: { ...block.kopf, umgebung: "test" } }, beispielEinsatz(), extra).test).toBe(true);
  });
  it("ein Fahrzeug ohne zugeordnete Besatzung zeigt „—“", () => {
    const e = { ...beispielEinsatz(), personal: [] };
    expect(bericht(block, e, extra).fahrzeuge[0].besatzung).toBe("—");
  });
});
