import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  insertGroup,
  insertEvening,
  insertSurvey,
  insertResponse,
} from "@/app/m/feedback/_db/queries";
import { shuffleStable } from "@/app/m/feedback/_lib/aggregation";
import type { Question } from "@/app/m/feedback/_lib/questions";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const FRAGEN: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "q9", type: "text", text: "Bestes?" },
];
const ABEND = new Date("2026-04-09T00:00:00Z"); // Mitternacht UTC, wie evenings.date

/**
 * Ein IMPORTIERTER Abend: der Importer schreibt die Antworten direkt, nicht über
 * den öffentlichen Abgabepfad — die Zeitstempel sind deshalb weiterhin
 * sekundengenau. Genau diese Zeilen sind der Restkanal im Export.
 */
function seedImportierterAbend() {
  const group = insertGroup(db, {
    name: "Bereitschaft",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  const evening = insertEvening(db, {
    groupId: group.id,
    date: ABEND,
    topic: "Funk",
    notes: null,
    participantCount: null,
    createdAt: new Date(0),
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(FRAGEN),
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  const antworten = [
    { q1: 1, q9: "zuerst abgegeben" },
    { q1: 2, q9: "danach" },
    { q1: 3, q9: "als dritte" },
    { q1: 4, q9: "als vierte" },
    { q1: 5, q9: "zuletzt" },
  ];
  // Sekundengenau und aufsteigend — die Eingangsreihenfolge, die der Export
  // nicht wiederherstellbar machen darf.
  antworten.forEach((a, i) =>
    insertResponse(db, survey.id, a, new Date(ABEND.getTime() + 76_000_000 + i * 137_000)),
  );
  return { group, evening, survey, antworten };
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  authMock.mockReset();
  authMock.mockResolvedValue({
    user: { id: "leitung-1", groups: [], fachgruppen: ["bereitschaft"] },
  });
});
afterEach(() => sqlite.close());

async function exportiere(groupId: number, eveningId: number): Promise<string[]> {
  const { GET } = await import("./route");
  const res = await GET(new Request("http://localhost:3000/export.csv"), {
    params: Promise.resolve({ groupId: String(groupId), eveningId: String(eveningId) }),
  });
  expect(res.status).toBe(200);
  return (await res.text()).split("\r\n");
}

describe("GET export.csv — die Spalte „Zeitstempel“ verrät die Uhrzeit nicht", () => {
  /**
   * Restkanal (Fund aus dem Review von Task 8): die Datenbank bleibt unangetastet
   * (Import-Parität), aber die AUSGABE normalisiert die Spalte auf das Abenddatum.
   * Vorher stand dort der sekundengenaue Zeitstempel importierter Antworten — wer
   * die Spalte in Excel sortiert, stellte damit die Eingangsreihenfolge wieder her
   * und hob die Durchmischung im Export wieder auf.
   */
  it("alle Datenzeilen tragen dasselbe Datum, keine Uhrzeit", async () => {
    const { group, evening, antworten } = seedImportierterAbend();

    const zeilen = await exportiere(group.id, evening.id);
    const kopfIndex = zeilen.findIndex((z) => z.startsWith("Zeitstempel"));
    const datenzeilen = zeilen.slice(kopfIndex + 1);

    expect(datenzeilen).toHaveLength(antworten.length);
    const stempel = datenzeilen.map((z) => z.split(",")[0]);
    expect(new Set(stempel).size).toBe(1);
    expect(stempel[0]).toBe("2026-04-09");
    // Keine Uhrzeit, kein ISO-Zeitanteil.
    expect(stempel[0]).not.toContain("T");
  });

  it("die Datenbank bleibt sekundengenau (Import-Parität) — nur die Ausgabe normalisiert", async () => {
    const { survey } = seedImportierterAbend();
    const gespeichert = sqlite
      .prepare("SELECT submitted_at AS t FROM responses WHERE survey_id = ?")
      .all(survey.id) as { t: number }[];
    expect(new Set(gespeichert.map((r) => r.t)).size).toBe(gespeichert.length);
  });

  it("die Zeilenordnung ist die durchmischte Leseordnung, nicht die Eingangsreihenfolge", async () => {
    const { group, evening, antworten } = seedImportierterAbend();

    const zeilen = await exportiere(group.id, evening.id);
    const kopfIndex = zeilen.findIndex((z) => z.startsWith("Zeitstempel"));
    const freitexte = zeilen.slice(kopfIndex + 1).map((z) => z.split(",")[2]);

    const erwartet = shuffleStable(antworten, (a) => JSON.stringify(a)).map((a) => a.q9);
    expect(freitexte).toEqual(erwartet);
    // Und ausdrücklich NICHT die Eingangsreihenfolge — sonst wäre die
    // Durchmischung wirkungslos.
    expect(freitexte).not.toEqual(antworten.map((a) => a.q9));
  });
});
