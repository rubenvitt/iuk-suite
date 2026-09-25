import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { rechner } from "../../_db/schema";
import { testDb } from "../testDb";
import { kontakt, rechnerAusToken } from "./geraet";
import { hashVon, neuesGeheimnis } from "./token";

const JETZT = new Date("2026-09-25T08:00:00Z");

function mitRechner() {
  const db = testDb();
  const token = neuesGeheimnis();
  db.insert(rechner).values({
    id: "r1", art: "test", name: "Übungsrechner", tokenHash: hashVon(token),
    eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
  }).run();
  return { db, token };
}

describe("rechnerAusToken", () => {
  it("findet den Rechner zum Geräte-Token", () => {
    const { db, token } = mitRechner();
    expect(rechnerAusToken(db, token)?.id).toBe("r1");
  });
  it("ohne Token, mit fremdem Token oder nach dem Widerruf: null", () => {
    const { db, token } = mitRechner();
    expect(rechnerAusToken(db, null)).toBeNull();
    expect(rechnerAusToken(db, neuesGeheimnis())).toBeNull();
    db.update(rechner).set({ widerrufenAm: JETZT }).where(eq(rechner.id, "r1")).run();
    expect(rechnerAusToken(db, token)).toBeNull();
  });
});

describe("kontakt", () => {
  it("setzt letzter_kontakt", () => {
    const { db } = mitRechner();
    kontakt(db, "r1", JETZT);
    expect(db.select().from(rechner).get()?.letzterKontakt).toEqual(JETZT);
  });
});
