// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  insertEvening,
  insertGroup,
  insertResponse,
  insertSurvey,
} from "@/app/m/feedback/_db/queries";
import type { Question } from "@/app/m/feedback/_lib/questions";

/**
 * DER GRUPPEN-VERGLEICH LIEST `avgSchulnote` (§4.12).
 *
 * Der Vergleich ist die Stelle, an der der gemischte Mittelwert am teuersten
 * ist: eine Gruppe mit importierten Alt-Umfragen wuerde neben einer Gruppe mit
 * neuen Boegen stehen, und ihre Sterne (1–5) waeren in derselben Spalte auf
 * dieselbe Sechser-Rampe abgetastet. Genau deshalb heisst das Feld nicht mehr
 * `overallAvg`.
 */
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): die Seite bleibt Admins vorbehalten");
  },
}));
// recharts + `theme.useToken()` — die Zusage haengt an den Zeilen, nicht am Bild.
vi.mock("@/core/charts/BarChart", () => ({ BarChart: () => null }));

import VergleichPage from "./page";

const GEMISCHT: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "s1", type: "stars", text: "Alt-Frage" },
];
const NUR_SCHULNOTE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];
const ABEND = new Date("2026-07-06T00:00:00Z");

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

function gruppeMitAbend(
  name: string,
  slug: string,
  fragen: Question[],
  antworten: Record<string, unknown>[],
) {
  const group = insertGroup(db, {
    name,
    slug,
    secret: `${slug.slice(0, 5)}1`,
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  const evening = insertEvening(db, {
    groupId: group.id,
    date: ABEND,
    topic: "Funk",
    notes: null,
    participantCount: 20,
    createdAt: ABEND,
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(fragen),
    closeAfterHours: 48,
    createdAt: ABEND,
  });
  antworten.forEach((a) => insertResponse(db, survey.id, a, ABEND));
  return group;
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  authMock.mockReset();
  authMock.mockResolvedValue({
    user: { id: "admin-1", groups: ["da-feedback-admin"], fachgruppen: [] },
  });
});
afterEach(() => sqlite.close());

async function zeichne(): Promise<HTMLElement> {
  const element = await VergleichPage();
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

async function zeile(name: string): Promise<HTMLElement> {
  const treffer = [...(await zeichne()).querySelectorAll<HTMLElement>("li")].find((li) =>
    (li.textContent ?? "").includes(name),
  );
  expect(treffer).toBeDefined();
  return treffer!;
}

const FUSSNOTE = "enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet";

describe("Vergleich — je Gruppe der Schulnoten-Ø, nicht der Mischwert", () => {
  it("faerbt nach avgSchulnote (1,0 sehr gut), nicht nach overallAvg (3,0 befriedigend)", async () => {
    gruppeMitAbend("Bereitschaft", "bereitschaft", GEMISCHT, [
      { q1: 1, s1: 5 },
      { q1: 1, s1: 5 },
    ]);
    const wirt = await zeichne();
    expect(wirt.innerHTML).toContain("var(--note-1)");
    expect(wirt.innerHTML).not.toContain("var(--note-3)");
    const text = (await zeile("Bereitschaft")).textContent ?? "";
    expect(text).toContain("1,0");
    expect(text).toContain("sehr gut");
  });

  it("traegt an der Gruppe mit Altbestands-Fragen die Fussnote aus §4.12", async () => {
    gruppeMitAbend("Alt-Gruppe", "alt-gruppe", GEMISCHT, [{ q1: 2, s1: 4 }]);
    gruppeMitAbend("Neu-Gruppe", "neu-gruppe", NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeile("Alt-Gruppe")).textContent).toContain(FUSSNOTE);
    expect((await zeile("Neu-Gruppe")).textContent).not.toContain(FUSSNOTE);
  });

  it("nennt die Richtung der Skala in der Kopfzone (1 = beste)", async () => {
    gruppeMitAbend("Bereitschaft", "bereitschaft", NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeichne()).textContent).toContain("Ø Note (1 = beste)");
  });

  it("zeigt eine Gruppe ohne Schulnote als „—“ und zaehlt ihre Rueckmeldungen", async () => {
    gruppeMitAbend("Alt-Gruppe", "alt-gruppe", [{ id: "s1", type: "stars", text: "Alt" }], [
      { s1: 4 },
      { s1: 5 },
    ]);
    const wirt = await zeichne();
    expect(wirt.innerHTML).not.toContain("var(--note-");
    const text = (await zeile("Alt-Gruppe")).textContent ?? "";
    expect(text).toContain("—");
    expect(text).toContain("2 Rückmeldungen");
    expect(text).toContain(FUSSNOTE);
  });

  it("bleibt Nicht-Admins verborgen (404, nicht 403)", async () => {
    authMock.mockResolvedValue({
      user: { id: "gl-1", groups: ["da-feedback-gl"], fachgruppen: ["bereitschaft"] },
    });
    await expect(zeichne()).rejects.toThrow("notFound()");
  });
});
