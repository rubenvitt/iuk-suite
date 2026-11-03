import { describe, expect, it } from "vitest";
import { eintragSichtbar, sichtSchluessel } from "@/core/faelligkeiten";
import { merkePerson, verwalterHinzufuegen } from "./personen";
import { geraetAnlegen, mangelMelden, neueId } from "./schreiben";
import { darfWartungFaelligkeitenSehen, vermerkeWartungSofortmeldungen, wartungFaelligkeiten, wartungSofortmeldungen } from "./faelligkeiten";
import { START } from "./startbestand";
import { testDb } from "./testDb";

const JETZT = new Date(Date.UTC(2026, 10, 3, 10));
/** Die Sichtschlüssel, wie das Portal sie aus der Sitzung bildet. */
const technikVerwalter = sichtSchluessel({ groups: ["wartung-nutzer"], sub: "sub-technik" });

function zweiGruppen() {
  const db = testDb();
  const basis = { hersteller: "", typ: "", seriennr: "", ortArt: "lager" as const, ort: "Lager", stunden: null };
  const technik = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.heizung, name: "Zeltheizung" }, JETZT.getTime());
  const iuk = geraetAnlegen(db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.it, name: "Laptop" }, JETZT.getTime());
  merkePerson(db, "sub-technik", "Verwalter Technik");
  merkePerson(db, "sub-iuk", "Verwalterin I&K");
  verwalterHinzufuegen(db, START.gruppe.technik, "sub-technik", JETZT.getTime(), { status: "unconfigured", people: [] });
  verwalterHinzufuegen(db, START.gruppe.iuk, "sub-iuk", JETZT.getTime(), { status: "unconfigured", people: [] });
  return { db, technik, iuk };
}

describe("„Was steht an“ aus der Gerätewartung", () => {
  it("jeder Eintrag ist nur für seine Gruppe und die Admins sichtbar", () => {
    const { db, technik } = zweiGruppen();
    const alle = wartungFaelligkeiten(JETZT, db);
    // Nie geprüft: jede Frist ist überfällig.
    expect(alle.length).toBe(4);
    const fuerTechnik = alle.filter((e) => eintragSichtbar(e, technikVerwalter));
    expect(fuerTechnik.every((e) => e.pfad === `/geraete/${technik}`)).toBe(true);
    expect(fuerTechnik).toHaveLength(2);
    expect(alle.filter((e) => eintragSichtbar(e, ["wartung-admin"]))).toHaveLength(4);
    expect(alle.filter((e) => eintragSichtbar(e, ["helfer"]))).toHaveLength(0);
    expect(alle.filter((e) => eintragSichtbar(e, sichtSchluessel({ groups: ["wartung-nutzer"], sub: "sub-helfer" })))).toHaveLength(0);
  });

  it("darfSehen: Verwalter und Modul-Admins, nicht jeder Angemeldete", () => {
    const { db } = zweiGruppen();
    expect(darfWartungFaelligkeitenSehen(sichtSchluessel({ groups: ["wartung-nutzer"], sub: "sub-iuk" }), db)).toBe(true);
    // Zugeordnet, aber ohne Modulzugang: nichts.
    expect(darfWartungFaelligkeitenSehen(sichtSchluessel({ groups: [], sub: "sub-iuk" }), db)).toBe(false);
    expect(darfWartungFaelligkeitenSehen(sichtSchluessel({ groups: ["wartung-nutzer"], sub: "sub-helfer" }), db)).toBe(false);
    expect(darfWartungFaelligkeitenSehen(["wartung-admin"], db)).toBe(true);
    expect(darfWartungFaelligkeitenSehen(["helfer"], db)).toBe(false);
    expect(darfWartungFaelligkeitenSehen([], db)).toBe(false);
  });

  it("Sofort-Push nur für „nicht einsatzbereit“, ohne Freitext, einmal", () => {
    const { db, technik } = zweiGruppen();
    const k = { jetzt: JETZT.getTime(), heute: "2026-11-03", wer: "Helfer A" };
    mangelMelden(db, technik, { id: neueId(), text: "Tankdeckel undicht", foto: false, einsatzbereit: true }, k);
    mangelMelden(db, technik, { id: neueId(), text: "Zündet nicht", foto: true, einsatzbereit: false }, k);
    const m = wartungSofortmeldungen(new Date(JETZT.getTime() - 60_000), db);
    expect(m).toHaveLength(1);
    expect(m[0].titel).toBe("Nicht einsatzbereit: Zeltheizung");
    expect(JSON.stringify(m)).not.toMatch(/Zündet/);
    expect(m[0].sichtbarFuer).toContain("person:sub-technik");
    expect(m[0].sichtbarFuer).not.toContain("person:sub-iuk");
    vermerkeWartungSofortmeldungen(m.map((x) => x.id), JETZT, db);
    expect(wartungSofortmeldungen(new Date(0), db)).toHaveLength(0);
  });
});
