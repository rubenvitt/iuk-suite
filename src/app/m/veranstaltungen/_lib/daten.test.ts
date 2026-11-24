import { describe, expect, it } from "vitest";
import { alleVeranstaltungen, ladeVeranstaltung, loescheVeranstaltung, NichtGefunden, speichereVeranstaltung } from "./daten";
import { veranstaltungEingabe } from "./eingabe";
import { seedLokalVeranstaltungen } from "./seedLokal";
import { testDb } from "./testDb";

const H = 3_600_000;
const basis = { name: "Stadtfest", art: "sanitaetsdienst", status: "angefragt", von: 10 * H, bis: 20 * H };

describe("Veranstaltungen", () => {
  it("anlegen, ändern, sortiert lesen und löschen", () => {
    const db = testDb();
    const spaet = speichereVeranstaltung(db, null, veranstaltungEingabe.parse({ ...basis, name: "Später", von: 30 * H, bis: 31 * H }));
    const id = speichereVeranstaltung(db, null, veranstaltungEingabe.parse(basis));
    expect(alleVeranstaltungen(db).map((v) => v.id)).toEqual([id, spaet]);
    speichereVeranstaltung(db, id, veranstaltungEingabe.parse({ ...basis, status: "zugesagt", ort: " Markt " }));
    expect(ladeVeranstaltung(db, id)).toMatchObject({ status: "zugesagt", ort: "Markt", veranstalter: "" });
    loescheVeranstaltung(db, id);
    expect(ladeVeranstaltung(db, id)).toBeNull();
    expect(() => loescheVeranstaltung(db, id)).toThrow(NichtGefunden);
    expect(() => speichereVeranstaltung(db, id, veranstaltungEingabe.parse(basis))).toThrow(NichtGefunden);
  });

  it("die Eingabe verlangt Namen, ein Ende nach dem Beginn und höchstens 14 Tage", () => {
    expect(veranstaltungEingabe.safeParse({ ...basis, name: "  " }).success).toBe(false);
    expect(veranstaltungEingabe.safeParse({ ...basis, bis: basis.von }).success).toBe(false);
    expect(veranstaltungEingabe.safeParse({ ...basis, bis: basis.von + 15 * 24 * H }).success).toBe(false);
    expect(veranstaltungEingabe.safeParse({ ...basis, status: "erledigt" }).success).toBe(false);
  });

  it("jede Änderung steht im Audit", () => {
    const db = testDb();
    const id = speichereVeranstaltung(db, null, veranstaltungEingabe.parse(basis));
    speichereVeranstaltung(db, id, veranstaltungEingabe.parse({ ...basis, name: "Anders" }));
    loescheVeranstaltung(db, id);
    const zeilen = db.$client.prepare("SELECT action FROM audit_outbox ORDER BY rowid").all() as { action: string }[];
    expect(zeilen.map((z) => z.action)).toEqual(["create", "update", "delete"]);
  });

  it("der lokale Seed ist idempotent", async () => {
    const db = testDb();
    await seedLokalVeranstaltungen(db);
    await seedLokalVeranstaltungen(db);
    expect(alleVeranstaltungen(db)).toHaveLength(3);
  });
});
