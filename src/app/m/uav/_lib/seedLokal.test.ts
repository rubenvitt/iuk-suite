import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./testDb";
import { participants, tasks, executions } from "../_db/schema";
import { seedLokalUav, LOKALE_TASKS, LOKALE_TEILNEHMER, LOKALE_DURCHFUEHRUNGEN } from "./seedLokal";

describe("seedLokalUav", () => {
  it("legt drei Aufgaben, zwei Teilnehmer (fixe Codes) und zwei Durchführungen an", async () => {
    const db = testDb();
    const protokoll = await seedLokalUav(db);

    const alleTasks = db.select().from(tasks).all();
    expect(alleTasks.map((t) => t.id).sort()).toEqual(["1-1", "1-2", "2-1"]);
    for (const t of alleTasks) expect(t.bild).toBe(`/m/uav/illustrations/${t.id}.webp`);

    const alleTeilnehmer = db.select().from(participants).all();
    expect(alleTeilnehmer.map((p) => p.loginCode).sort()).toEqual(["E2EGESP2", "E2ETEST1"]);
    const aktiv = db.select().from(participants).where(eq(participants.loginCode, "E2ETEST1")).get()!;
    const inaktiv = db.select().from(participants).where(eq(participants.loginCode, "E2EGESP2")).get()!;
    expect(aktiv.aktiv).toBe(1);
    expect(inaktiv.aktiv).toBe(0);

    const alleExecutions = db.select().from(executions).where(eq(executions.taskId, "1-1")).all();
    expect(alleExecutions).toHaveLength(2);

    expect(protokoll.some((z) => z.includes("http://uav.localtest.me:3000/login?code=E2ETEST1"))).toBe(true);
  });

  it("ist idempotent — ein zweiter Lauf legt nichts doppelt an", async () => {
    const db = testDb();
    await seedLokalUav(db);
    await seedLokalUav(db);

    expect(db.select().from(tasks).all()).toHaveLength(LOKALE_TASKS.length);
    expect(db.select().from(participants).all()).toHaveLength(LOKALE_TEILNEHMER.length);
    expect(db.select().from(executions).all()).toHaveLength(LOKALE_DURCHFUEHRUNGEN.length);
  });

  it("ist additiv — ein vorher schon vorhandener eigener Datensatz bleibt unangetastet", async () => {
    const db = testDb();
    db.insert(participants).values({
      id: "schon-da", name: "Bestehender Teilnehmer", loginCode: "BESTEHND", aktiv: 1, createdAt: "2026-01-01T00:00:00.000Z",
    }).run();

    await seedLokalUav(db);

    const alle = db.select().from(participants).all();
    expect(alle.some((p) => p.id === "schon-da")).toBe(true);
    expect(alle).toHaveLength(LOKALE_TEILNEHMER.length + 1);
  });
});
