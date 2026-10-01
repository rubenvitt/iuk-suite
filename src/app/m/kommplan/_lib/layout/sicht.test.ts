import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueSicht } from "./sicht";

const plan = baue({
  verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_1" }],
  stellen: [
    { id: "w", titel: "W" },
    { id: "s", titel: "S", eltern: "w", lage: "rechts", verbindung: "v" },
    { id: "a", titel: "A", eltern: "w" },
    { id: "a1", titel: "A1", eltern: "a" },
    { id: "a1s", titel: "A1s", eltern: "a1", lage: "links" },
    { id: "b", titel: "B", eltern: "w" },
  ],
});

describe("Sicht", () => {
  it("ohne Optionen ist alles sichtbar", () => {
    const s = baueSicht(plan);
    expect(s.sichtbar.map((x) => x.id)).toEqual(["w", "s", "a", "a1", "a1s", "b"]);
    expect(s.tiefe("a1")).toBe(2);
    expect(s.einklappbar("a")).toBe(true);
    expect(s.einklappbar("b")).toBe(false);
    expect(s.verbindung("v")?.bezeichnung).toBe("R_UE_1");
    expect(s.verbindung(null)).toBeNull();
  });
  it("eingeklappt: Kinder weg, Abzeichenzahl, eigene Seitenstellen bleiben", () => {
    const s = baueSicht(plan, { eingeklappt: new Set(["w", "b"]) });
    expect(s.kinder("w")).toEqual([]);
    expect(s.versteckt("w")).toBe(4);
    expect(s.seiten("w").rechts.map((x) => x.id)).toEqual(["s"]);
    expect(s.eingeklappt("b")).toBe(false); // ohne Unterstellen wirkungslos
    expect(s.sichtbar.map((x) => x.id)).toEqual(["w", "s"]);
  });
  it("Verweis: weder Kinder noch Seitenstellen", () => {
    const s = baueSicht(plan, { darstellung: new Map([["a1", { verweisAufBlatt: 2 }]]) });
    expect(s.kinder("a1")).toEqual([]);
    expect(s.seiten("a1").links).toEqual([]);
    expect(s.darstellung("a1")).toEqual({ verweisAufBlatt: 2 });
  });
  it("Blatt mit Anker: Anker ist einzige Wurzel mit genau einem Kind", () => {
    const s = baueSicht(plan, { blatt: { wurzelId: "a", ankerId: "w" } });
    expect(s.wurzeln.map((x) => x.id)).toEqual(["w"]);
    expect(s.darstellung("w")).toBe("anker");
    expect(s.kinder("w").map((x) => x.id)).toEqual(["a"]);
    expect(s.seiten("w")).toEqual({ links: [], rechts: [] });
    expect(s.sichtbar.map((x) => x.id)).toEqual(["w", "a", "a1", "a1s"]);
    expect(s.einklappbar("w")).toBe(false);
  });
  it("Blatt ohne Anker (Wurzelblatt eines Teilbaums einer Wurzel)", () => {
    expect(baueSicht(plan, { blatt: { wurzelId: "w", ankerId: null } }).wurzeln.map((x) => x.id)).toEqual(["w"]);
  });
});
