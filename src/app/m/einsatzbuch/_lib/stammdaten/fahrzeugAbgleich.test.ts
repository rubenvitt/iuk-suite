import { describe, expect, it } from "vitest";
import type { BereitgestelltesFahrzeug, Fahrzeugbereitstellung } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { fahrzeug } from "../../_db/schema";
import { testDb } from "../testDb";
import { listeFahrzeuge } from "./daten";
import { planeFahrzeugeGegenBestand, wendeFahrzeugAbgleichAn, STAMM_PRAEFIX } from "./fahrzeugAbgleich";

const s = (id: string, teil: Partial<BereitgestelltesFahrzeug> = {}): BereitgestelltesFahrzeug => ({
  id, art: "fahrzeug", typ: "RTW", funkrufname: `Rotkreuz Uelzen 11-83-${id}`, funkkenner: `11-83-${id}`, kennzeichen: null,
  standort: "Uelzen", aktiv: true, ...teil,
});
const b = (...fahrzeuge: BereitgestelltesFahrzeug[]): Fahrzeugbereitstellung => ({ fahrzeuge, stand: "2026-10-21T09:00:00.000Z" });

function mitBestand(...zeilen: { id: string; kennung: string; ruf?: string; aktiv?: boolean }[]) {
  const db = testDb();
  for (const z of zeilen) db.insert(fahrzeug).values({ typ: "RTW", ruf: z.ruf ?? z.kennung, standort: "Uelzen", aktiv: true, ...z }).run();
  return db;
}

describe("Abgleich mit der Fahrzeugverwaltung", () => {
  it("legt Neues mit `fz-<id>` an und lässt lokale Fahrzeuge stehen", () => {
    const db = mitBestand({ id: "leih", kennung: "99-1-1", ruf: "Leihfahrzeug" });
    const plan = planeFahrzeugeGegenBestand(db, b(s("1")), {});
    expect(plan.zeilen.map((z) => [z.id, z.klasse])).toEqual([[`${STAMM_PRAEFIX}1`, "neu"]]);
    expect(wendeFahrzeugAbgleichAn(db, plan)).toEqual({ neu: 1, geaendert: 0, deaktiviert: 0 });
    expect(listeFahrzeuge(db).map((f) => f.id).sort()).toEqual(["fz-1", "leih"]);
    expect(planeFahrzeugeGegenBestand(db, b(s("1")), {}).zeilen[0].klasse).toBe("unveraendert");
  });

  it("eine im Erstimport zugeordnete Zeile behält ihre ID und übernimmt die Werte", () => {
    const db = mitBestand({ id: "alt", kennung: "11/83-1", ruf: "RTW 1" });
    const plan = planeFahrzeugeGegenBestand(db, b(s("1")), { alt: "1" });
    expect(plan.zeilen).toEqual([expect.objectContaining({ id: "alt", klasse: "geaendert", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1" })]);
    wendeFahrzeugAbgleichAn(db, plan);
    expect(listeFahrzeuge(db)).toEqual([expect.objectContaining({ id: "alt", kennung: "11-83-1", aktiv: true })]);
  });

  it("außer Dienst in der Fahrzeugverwaltung → hier deaktiviert, und ein deaktiviertes Neues wird gar nicht angelegt", () => {
    const db = mitBestand({ id: "alt", kennung: "11-83-1" });
    const plan = planeFahrzeugeGegenBestand(db, b(s("1", { aktiv: false }), s("2", { aktiv: false })), { alt: "1" });
    expect(plan.zeilen.map((z) => [z.id, z.klasse])).toEqual([["alt", "deaktivieren"]]);
    expect(wendeFahrzeugAbgleichAn(db, plan).deaktiviert).toBe(1);
    expect(listeFahrzeuge(db)[0].aktiv).toBe(false);
  });

  it("eine Kennung, die ein lokales Fahrzeug trägt, wird nicht doppelt vergeben", () => {
    const db = mitBestand({ id: "lokal", kennung: "11-83-1", ruf: "Von Hand" });
    const plan = planeFahrzeugeGegenBestand(db, b(s("1")), { lokal: null });
    expect(plan.zeilen).toEqual([expect.objectContaining({ klasse: "doppelt" })]);
    expect(plan.zeilen[0].hinweis).toContain("Von Hand");
    expect(wendeFahrzeugAbgleichAn(db, plan)).toEqual({ neu: 0, geaendert: 0, deaktiviert: 0 });
  });

  it("ohne Funkkenner und ohne Zeile wird nichts übernommen", () => {
    const db = testDb();
    const plan = planeFahrzeugeGegenBestand(db, b(s("1", { funkkenner: null }), s("2", { art: "anhaenger", funkkenner: null })), {});
    expect(plan.zeilen.map((z) => z.klasse)).toEqual(["ohne_kenner", "ohne_kenner"]);
    expect(plan.zeilen.find((z) => z.id === "fz-2")?.hinweis).toContain("Anhänger");
  });

  it("ohne Funkkenner, aber zugeordnet: die Kennung der Zeile bleibt", () => {
    const db = mitBestand({ id: "alt", kennung: "RTW-1" });
    const plan = planeFahrzeugeGegenBestand(db, b(s("1", { funkkenner: null })), { alt: "1" });
    expect(plan.zeilen).toEqual([expect.objectContaining({ id: "alt", kennung: "RTW-1", klasse: "geaendert" })]);
  });

  it("zwei Zeilen zu einem Stammfahrzeug: die zweite wird deaktiviert", () => {
    const db = mitBestand({ id: "a", kennung: "11-83-1" }, { id: "b", kennung: "RTW 1 alt" });
    const plan = planeFahrzeugeGegenBestand(db, b(s("1")), { a: "1", b: "1" });
    expect(plan.zeilen.map((z) => [z.id, z.klasse]).sort()).toEqual([["a", "geaendert"], ["b", "deaktivieren"]]);
  });
});
