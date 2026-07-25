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
 * DIE AMPEL DER AUSWERTUNG LIEST `avgSchulnote` (§4.12).
 *
 * Der stille Rechenfehler war berechnet, aber nicht beseitigt: `overallAvg`
 * mischt Schulnoten (1–6) und Alt-Sterne (1–5) in DENSELBEN Mittelwert. Ein
 * Bogen mit „Schulnote 1" und „5 von 5 Sternen" — zweimal die beste erreichbare
 * Bewertung — ergibt `overallAvg` 3,0 und damit die Ampelstufe 3
 * („befriedigend"). Genau dieser Wert stand hier in der Kopfzeile.
 *
 * Geprueft wird deshalb in BEIDE Richtungen: die Farbe der richtigen Stufe muss
 * da sein UND die der falschen darf nicht vorkommen. Eine Anzeige, die alle
 * sechs Farben ausgibt, bestuende eine reine Anwesenheitspruefung.
 */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));

vi.mock("@/app/m/feedback/_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): der Abend wurde nicht geladen");
  },
}));
// recharts + `theme.useToken()` — die Ampel dieser Seite haengt nicht am Diagramm.
vi.mock("@/core/charts/BarChart", () => ({ BarChart: () => null }));

import AuswertungPage from "./page";

const ABEND = new Date("2026-07-06T00:00:00Z"); // Mitternacht UTC wie evenings.date

const GEMISCHT: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "s1", type: "stars", text: "Alt-Frage" },
];
const NUR_SCHULNOTE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];
const NUR_STERNE: Question[] = [{ id: "s1", type: "stars", text: "Alt-Frage" }];

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

function seed(fragen: Question[], antworten: Record<string, unknown>[]) {
  insertGroup(db, {
    name: "Bereitschaft",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  const evening = insertEvening(db, {
    groupId: 1,
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
  return evening;
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  guardPageMock.mockReset();
  guardPageMock.mockResolvedValue({ viewer: { sub: "u1" }, db });
});
afterEach(() => sqlite.close());

async function zeichne(eveningId: number): Promise<HTMLElement> {
  const element = await AuswertungPage({
    params: Promise.resolve({ groupId: "1", eveningId: String(eveningId) }),
  });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

const FUSSNOTE = "enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet";

describe("Auswertung — die Ampel liest den Schulnoten-Mittelwert", () => {
  it("faerbt nach avgSchulnote (1,0 sehr gut), nicht nach overallAvg (3,0 befriedigend)", async () => {
    const evening = seed(GEMISCHT, [
      { q1: 1, s1: 5 },
      { q1: 1, s1: 5 },
    ]);
    const wirt = await zeichne(evening.id);

    expect(wirt.innerHTML).toContain("var(--note-1)");
    expect(wirt.innerHTML).not.toContain("var(--note-3)");
    expect(wirt.textContent).toContain("1,0");
    expect(wirt.textContent).toContain("sehr gut");
    expect(wirt.textContent).not.toContain("befriedigend");
  });

  it("nennt die Richtung der Skala am Wert (1 = beste)", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }, { q1: 3 }]);
    const wirt = await zeichne(evening.id);
    expect(wirt.textContent).toContain("Ø Note (1 = beste)");
    expect(wirt.textContent).toContain("2,5");
  });

  it("traegt bei Altbestands-Fragen die Fussnote aus §4.12", async () => {
    const evening = seed(GEMISCHT, [{ q1: 2, s1: 4 }]);
    expect((await zeichne(evening.id)).textContent).toContain(FUSSNOTE);
  });

  it("laesst die Fussnote weg, wo kein Altbestand im Bogen steht", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeichne(evening.id)).textContent).not.toContain(FUSSNOTE);
  });

  it("zeigt bei reinem Altbestands-Bogen „—“ und keine Notenfarbe", async () => {
    // `avgSchulnote` ist null — vier von fuenf Sternen auf die Sechser-Rampe
    // abzutasten waere genau der Fehler, um den es geht.
    const evening = seed(NUR_STERNE, [{ s1: 4 }, { s1: 5 }]);
    const wirt = await zeichne(evening.id);
    expect(wirt.innerHTML).not.toContain("var(--note-");
    expect(wirt.textContent).toContain("—");
    expect(wirt.textContent).toContain(FUSSNOTE);
  });
});
