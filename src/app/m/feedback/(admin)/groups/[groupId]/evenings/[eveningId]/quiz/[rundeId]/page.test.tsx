import { registerAuditFunctions } from "@/core/audit/context";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertGroup } from "@/app/m/feedback/_db/queries";
import { antworte, beendeRunde, legeQuizAn, setzeSchritt, starteOderHoleRunde, tritteBei } from "@/app/m/feedback/_db/quiz";

/**
 * AUSWERTUNG EINER QUIZRUNDE: der Guard kommt aus der Datenbank (Runde → Abend → Gruppe),
 * nicht aus der URL, und die Darstellung trägt die Zusagen des Modus.
 */
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound()");
  },
  redirect: vi.fn(),
}));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));

import Seite from "./page";
import Schutz from "./layout";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
const JETZT = new Date("2026-11-25T18:00:00Z");

const alsLeitung = (slug: string) =>
  authMock.mockResolvedValue({ user: { id: "l1", groups: ["feedback-nutzer"], fachgruppen: [slug] } });
const gruppe = (slug: string) =>
  insertGroup(db, { name: slug, slug, secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });

function runde(groupId: number, modus: "lagebild" | "wettbewerb") {
  const q = legeQuizAn(db, {
    groupId,
    titel: "Funkquiz",
    modus,
    fragen: [{ text: "Welcher Kanal?", typ: "einfach", optionen: ["Eins", "Zwei"], richtig: [1] }],
    jetzt: JETZT,
  });
  const r = starteOderHoleRunde(db, q, JETZT);
  setzeSchritt(db, r.id, 1, JETZT);
  const t = tritteBei(db, r, { token: "t", spitzname: "Anna" });
  if ("teilnahmeId" in t) antworte(db, r, t.teilnahmeId, 0, [1], new Date(JETZT.getTime() + 1000));
  return r;
}
const args = (g: number, e: number, r: number) => ({
  params: Promise.resolve({ groupId: String(g), eveningId: String(e), rundeId: String(r) }),
});
const html = async (a: ReturnType<typeof args>) => renderToStaticMarkup(await Seite(a));

beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  authMock.mockReset();
});
afterEach(() => sqlite.close());

describe("Quiz-Auswertung (Seite)", () => {
  it("zeigt Frage, Verteilung, Anteil richtig und im Wettbewerb die Rangliste", async () => {
    const g = gruppe("bereitschaft");
    const r = runde(g.id, "wettbewerb");
    alsLeitung("bereitschaft");
    const h = await html(args(g.id, r.eveningId, r.id));
    expect(h).toContain("Welcher Kanal?");
    expect(h).toContain("100 % richtig");
    expect(h).toContain("quiz-rangliste");
    expect(h).toContain("Anna");
    expect(h).toContain("läuft noch");
  });

  it("offene Runde: „läuft noch“ und „Rangliste bisher“; beendet: beides weg, „Rangliste“", async () => {
    const g = gruppe("bereitschaft");
    const r = runde(g.id, "wettbewerb");
    alsLeitung("bereitschaft");
    const offen = await html(args(g.id, r.eveningId, r.id));
    expect(offen).toContain("läuft noch");
    expect(offen).toContain("Rangliste bisher");
    beendeRunde(db, r.id, new Date(JETZT.getTime() + 60_000));
    const beendet = await html(args(g.id, r.eveningId, r.id));
    expect(beendet).not.toContain("läuft noch");
    expect(beendet).not.toContain("Rangliste bisher");
    expect(beendet).toContain("Rangliste");
  });

  it("zeigt im Lagebild keine Rangliste", async () => {
    const g = gruppe("bereitschaft");
    const r = runde(g.id, "lagebild");
    alsLeitung("bereitschaft");
    const h = await html(args(g.id, r.eveningId, r.id));
    expect(h).toContain("Welcher Kanal?");
    expect(h).not.toContain("quiz-rangliste");
    expect(h).not.toContain("Anna");
  });

  it("wirft 404 für die Runde eines fremden Abends (Guard aus der DB), auch im Layout", async () => {
    const g = gruppe("bereitschaft");
    const fremd = gruppe("jugendrotkreuz");
    const r = runde(fremd.id, "lagebild");
    alsLeitung("bereitschaft");
    // Auch mit der eigenen groupId in der URL: der Abend gehört der fremden Gruppe.
    await expect(Seite(args(g.id, r.eveningId, r.id))).rejects.toThrow("notFound()");
    await expect(Seite(args(fremd.id, r.eveningId, r.id))).rejects.toThrow("notFound()");
    await expect(Schutz({ ...args(fremd.id, r.eveningId, r.id), children: null })).rejects.toThrow("notFound()");
  });

  it("wirft 404, wenn URL-Gruppe, URL-Abend oder Runde nicht passen", async () => {
    const g = gruppe("bereitschaft");
    const andere = gruppe("zweite");
    const r = runde(g.id, "lagebild");
    alsLeitung("bereitschaft");
    await expect(Seite(args(andere.id, r.eveningId, r.id))).rejects.toThrow("notFound()");
    await expect(Seite(args(g.id, r.eveningId + 5, r.id))).rejects.toThrow("notFound()");
    await expect(Seite(args(g.id, r.eveningId, r.id + 5))).rejects.toThrow("notFound()");
  });
});
