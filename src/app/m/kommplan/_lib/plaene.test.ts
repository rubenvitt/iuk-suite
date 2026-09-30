import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import { plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { beschreibungFuer, ladePlan, ladePlanOder404, listePlaene } from "./plaene";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

async function mitBeispielen() {
  const db = testDb();
  await seedLokalKommplan(db);
  return db;
}

describe("Planliste und Laden", () => {
  it("listet nicht archivierte Pläne, neueste zuerst, mit lesbaren Texten", async () => {
    const db = await mitBeispielen();
    const liste = listePlaene(db);
    expect(liste).toHaveLength(BEISPIELE.length);
    expect(liste[0].id).toBe("vorlage-fernmeldeskizze-stab");
    const einsatz = liste.find((z) => z.id === "beispiel-einsatz-2026-02-22")!;
    expect(einsatz).toMatchObject({ typ: "Kommunikationsplan", datum: "22.02.2026", vorlage: false, lesbar: true });
    db.update(plan).set({ archiviertAm: new Date() }).where(eq(plan.id, einsatz.id)).run();
    expect(listePlaene(db).map((z) => z.id)).not.toContain(einsatz.id);
  });
  it("lädt einen Plan samt geprüftem Inhalt; unbekannt und archiviert → null", async () => {
    const db = await mitBeispielen();
    const p = ladePlan(db, "beispiel-openr-2022-07-01")!;
    expect(p.inhalt?.stellen.length).toBeGreaterThan(5);
    expect(p.fehler).toBeNull();
    expect(p.version).toBe(1);
    expect(p.angaben).toEqual({ titel: p.titel, typ: "kommunikationsplan", anlass: "OpenR", datum: "2022-07-01" });
    expect(beschreibungFuer(p)).toContain("OpenR · 01.07.2022");
    expect(ladePlan(db, "gibt-es-nicht")).toBeNull();
    db.update(plan).set({ archiviertAm: new Date() }).where(eq(plan.id, p.id)).run();
    expect(ladePlan(db, p.id)).toBeNull();
    expect(() => ladePlanOder404(db, p.id)).toThrow("NEXT_NOT_FOUND");
  });
  it("ein beschädigter Inhalt wirft nicht: Liste markiert ihn, Laden liefert den Fehler", async () => {
    const db = await mitBeispielen();
    db.update(plan).set({ inhalt: JSON.stringify({ schema: 1, optionen: {}, stellen: [{ id: "a" }], verbindungen: [] }) })
      .where(eq(plan.id, "vorlage-kommunikationsplan-label")).run();
    expect(listePlaene(db).find((z) => z.id === "vorlage-kommunikationsplan-label")?.lesbar).toBe(false);
    const p = ladePlan(db, "vorlage-kommunikationsplan-label")!;
    expect(p.inhalt).toBeNull();
    expect(p.fehler).not.toBeNull();
  });
});
