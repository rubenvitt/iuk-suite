import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { aendereEinheit, fuegeEinheitenEin, loescheEinheit } from "./einheiten";
import { PlanFehler, stelleOder } from "./operationen";
import { GRENZE } from "./schema";

const plan = () => baue({ stellen: [{ id: "ea", titel: "EA", einheiten: ["RTW RK 1"] }] });
const einheit = (id: string, typ = "KTW", rufname = "RK 2") => ({ id, typ, rufname, zeichen: null });

describe("Einheiten einer Stelle", () => {
  it("fügt am Ende an, ändert und löscht", () => {
    let p = fuegeEinheitenEin(plan(), "ea", [einheit("n1"), einheit("n2", "MTW", "RK 3")]);
    expect(stelleOder(p, "ea").einheiten.map((e) => e.id)).toEqual(["ea-e1", "n1", "n2"]);
    p = aendereEinheit(p, "ea", "n1", { rufname: "RK 9" });
    expect(stelleOder(p, "ea").einheiten[1]).toEqual({ id: "n1", typ: "KTW", rufname: "RK 9", zeichen: null });
    p = loescheEinheit(p, "ea", "ea-e1");
    expect(stelleOder(p, "ea").einheiten.map((e) => e.id)).toEqual(["n1", "n2"]);
  });
  it("mehr als 60 Einheiten: die ganze Liste wird abgewiesen, das Dokument bleibt (Review Focus 2)", () => {
    const viele = Array.from({ length: GRENZE.einheiten }, (_, i) => einheit(`x${i}`));
    expect(() => fuegeEinheitenEin(plan(), "ea", viele)).toThrow(`Höchstens ${GRENZE.einheiten} Einheiten je Stelle — hier wären es ${GRENZE.einheiten + 1}.`);
  });
  it("unbekannte Einheit oder Stelle: PlanFehler", () => {
    expect(() => aendereEinheit(plan(), "ea", "fehlt", { typ: "X" })).toThrow("Einheit fehlt gibt es an dieser Stelle nicht");
    expect(() => loescheEinheit(plan(), "fehlt", "ea-e1")).toThrow(PlanFehler);
  });
});
