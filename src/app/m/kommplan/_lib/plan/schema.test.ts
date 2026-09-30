import { describe, expect, it } from "vitest";
import { KONTAKT_PIKTOGRAMM, VERBINDUNG_PIKTOGRAMM } from "../zeichen/grundlagen";
import { KONTAKT_ARTEN, VERBINDUNGS_ARTEN, leseInhalt, planInhaltSchema, type PlanInhalt, type Stelle } from "./schema";

const stelle = (id: string, eltern: string | null, rest: Partial<Stelle> = {}): Stelle => ({
  id, eltern, lage: "unter", reihenfolge: 0, zeichen: null, titel: id, leiter: null, hervorheben: false,
  verbindungId: null, kanaele: [], kontakte: [], einheiten: [], ...rest,
});
const plan = (stellen: Stelle[], verbindungen: PlanInhalt["verbindungen"] = []): unknown => ({
  schema: 1,
  optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false },
  stellen, verbindungen,
});
const fehler = (roh: unknown) => {
  const r = planInhaltSchema.safeParse(roh);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("planInhaltSchema", () => {
  it("nimmt einen gültigen Baum mit Seitenstelle und Verbindung an", () => {
    expect(fehler(plan(
      [stelle("a", null), stelle("b", "a", { verbindungId: "v1" }), stelle("c", "a", { lage: "links" })],
      [{ id: "v1", art: "tmo", bezeichnung: "R_UE_2" }],
    ))).toEqual([]);
  });
  it("nimmt einen leeren Plan und mehrere Wurzeln an", () => {
    expect(fehler(plan([]))).toEqual([]);
    expect(fehler(plan([stelle("a", null), stelle("b", null)]))).toEqual([]);
  });
  it("doppelte IDs — auch zwischen Stelle, Einheit und Verbindung", () => {
    expect(fehler(plan([stelle("a", null), stelle("a", null)]))).toContain("ID doppelt: a");
    expect(fehler(plan([stelle("a", null, { einheiten: [{ id: "v1", typ: "RTW", rufname: "", zeichen: null }] })],
      [{ id: "v1", art: "tmo", bezeichnung: "x" }]))).toContain("ID doppelt: v1");
  });
  it("eltern zeigt auf eine fehlende Stelle", () => {
    expect(fehler(plan([stelle("b", "fehlt")]))).toContain("Elternstelle fehlt existiert nicht");
  });
  it("Zyklus", () => {
    expect(fehler(plan([stelle("a", "b"), stelle("b", "a")])).some((m) => m.startsWith("Zyklus"))).toBe(true);
  });
  it("Seitenstelle ohne Eltern und Seitenstelle mit Kindern", () => {
    expect(fehler(plan([stelle("a", null, { lage: "rechts" })]))).toContain("Eine Seitenstelle braucht eine Elternstelle");
    expect(fehler(plan([stelle("a", null), stelle("s", "a", { lage: "links" }), stelle("k", "s")])))
      .toContain("Seitenstelle s kann keine Stellen tragen");
  });
  it("verbindungId zeigt auf eine fehlende Verbindung", () => {
    expect(fehler(plan([stelle("a", null, { verbindungId: "vx" })]))).toContain("Verbindung vx existiert nicht");
  });
  it("Kanäle: nur vorhandene Verbindungen, keiner doppelt; fehlt das Feld, gilt []", () => {
    const v = [{ id: "v1", art: "dmo" as const, bezeichnung: "DMO 608" }];
    expect(fehler(plan([stelle("a", null, { kanaele: ["v1"] })], v))).toEqual([]);
    expect(fehler(plan([stelle("a", null, { kanaele: ["vx"] })], v))).toContain("Kanal vx existiert nicht");
    expect(fehler(plan([stelle("a", null, { kanaele: ["v1", "v1"] })], v))).toContain("Kanal v1 doppelt an a");
    const ohneFeld = { ...stelle("a", null) } as Partial<Stelle>;
    delete ohneFeld.kanaele;
    const r = planInhaltSchema.safeParse(plan([ohneFeld as Stelle]));
    expect(r.success && r.data.stellen[0].kanaele).toEqual([]);
  });
  it("lehnt falsche Schemaversion, fremde Felder und unbekannte Arten ab", () => {
    expect(fehler({ ...(plan([]) as object), schema: 2 })).not.toEqual([]);
    expect(fehler(plan([stelle("a", null, { kontakte: [{ art: "brieftaube" as never, wert: "x" }] })]))).not.toEqual([]);
  });
});

describe("leseInhalt", () => {
  it("liefert den Inhalt oder eine Fehlermeldung, wirft nie", () => {
    expect(leseInhalt(plan([stelle("a", null)])).ok).toBe(true);
    const kaputt = leseInhalt({ irgendwas: true });
    expect(kaputt.ok).toBe(false);
    expect(leseInhalt(null).ok).toBe(false);
  });
});

describe("Arten und Piktogramme passen zusammen", () => {
  it("jede Kontakt- und Verbindungsart hat ein Piktogramm, keine mehr", () => {
    expect(Object.keys(KONTAKT_PIKTOGRAMM).sort()).toEqual([...KONTAKT_ARTEN].sort());
    expect(Object.keys(VERBINDUNG_PIKTOGRAMM).sort()).toEqual([...VERBINDUNGS_ARTEN].sort());
  });
});
