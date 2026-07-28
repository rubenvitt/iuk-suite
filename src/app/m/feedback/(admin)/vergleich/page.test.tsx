// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

import VergleichPage from "./page";

const GEMISCHT: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "s1", type: "stars", text: "Alt-Frage" },
];
const NUR_SCHULNOTE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];
const NUR_STERNE: Question[] = [{ id: "s1", type: "stars", text: "Alt-Frage" }];
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
  const treffer = [...(await zeichne()).querySelectorAll<HTMLElement>("tbody tr")].find((tr) =>
    (tr.textContent ?? "").includes(name),
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

  it("zeigt eine Gruppe ohne Schulnote als „—“ — mit Abend, Ruecklauf und Fussnote", async () => {
    // Der Abend bleibt gezaehlt und seine Quote gerechnet: die Rueckmeldungen gab
    // es, nur eine Note gab es nicht. Vier von fuenf Sternen auf die Sechser-Rampe
    // abzutasten waere genau der Fehler aus §4.12 — deshalb KEINE Notenfarbe, und
    // zwar in der ganzen Tabelle (die Seite hat keine Legende).
    gruppeMitAbend("Alt-Gruppe", "alt-gruppe", [{ id: "s1", type: "stars", text: "Alt" }], [
      { s1: 4 },
      { s1: 5 },
    ]);
    const wirt = await zeichne();
    expect(wirt.innerHTML).not.toContain("var(--note-");
    const text = (await zeile("Alt-Gruppe")).textContent ?? "";
    expect(text).toContain("—");
    expect(text).toContain("10 %"); // 2 von 20
    expect(text).toContain(FUSSNOTE);
  });

  it("bleibt Nicht-Admins verborgen (404, nicht 403)", async () => {
    authMock.mockResolvedValue({
      user: { id: "gl-1", groups: ["da-feedback-gl"], fachgruppen: ["bereitschaft"] },
    });
    await expect(zeichne()).rejects.toThrow("notFound()");
  });
});

/**
 * DIE FORM DES VERGLEICHS (§3.4).
 *
 * Das Balkendiagramm ist weg, und zwar aus einem Sachgrund: `core/charts` faerbt
 * mit `token.colorPrimary` (DRK-Rot, §4.9), und ein Balken „laenger = schlechter"
 * auf einer invertierten Skala behauptet das Gegenteil der Daten. Die
 * Pillenspalte ist vertikal gelesen selbst der Vergleich — vorausgesetzt, die
 * ORDNUNG traegt: bester zuerst.
 */
describe("Vergleich — Tabelle, Ordnung, Spalten", () => {
  it("sortiert aufsteigend nach Ø — bester zuerst, Gruppen ohne Ø am Ende", async () => {
    gruppeMitAbend("Mittel", "mittel", NUR_SCHULNOTE, [{ q1: 3 }]);
    gruppeMitAbend("Beste", "beste", NUR_SCHULNOTE, [{ q1: 1 }]);
    gruppeMitAbend("Ohne", "ohne", NUR_STERNE, [{ s1: 5 }]);
    gruppeMitAbend("Schlecht", "schlecht", NUR_SCHULNOTE, [{ q1: 5 }]);

    // Nicht "tbody tr": seit dem `scroll`-Prop (Task 2, mobiler Durchgang)
    // rendert rc-table zusaetzlich eine `aria-hidden`-Messzeile in tbody
    // (@rc-component/table, Body/MeasureRow.js) — sie traegt kein
    // data-testid und darf hier nicht mitgezaehlt werden.
    const namen = [
      ...(await zeichne()).querySelectorAll<HTMLElement>('tbody tr[data-testid="vergleich-row"]'),
    ].map((tr) => (tr.querySelector("a")?.textContent ?? "").trim());
    expect(namen).toEqual(["Beste", "Mittel", "Schlecht", "Ohne"]);
  });

  it("nennt die Richtung im SPALTENKOPF (§3.4, wortgenau)", async () => {
    gruppeMitAbend("Bereitschaft", "bereitschaft", NUR_SCHULNOTE, [{ q1: 2 }]);
    const kopf = [...(await zeichne()).querySelectorAll<HTMLElement>("thead th")].map(
      (th) => th.textContent,
    );
    expect(kopf.some((k) => (k ?? "").includes("Ø NOTE (1 = BESTE)"))).toBe(true);
    expect(kopf.some((k) => (k ?? "").includes("ABENDE"))).toBe(true);
    expect(kopf.some((k) => (k ?? "").includes("RÜCKLAUF Ø"))).toBe(true);
  });

  it("verlinkt die Gruppe auf ihr Cockpit", async () => {
    const g = gruppeMitAbend("Bereitschaft", "bereitschaft", NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeile("Bereitschaft")).querySelector("a")?.getAttribute("href")).toBe(
      `/m/feedback/groups/${g.id}`,
    );
  });

  it("zaehlt Abende und mittelt den Ruecklauf", async () => {
    // Ein Abend, 20 Teilnehmer, 2 Rueckmeldungen → 10 %.
    gruppeMitAbend("Bereitschaft", "bereitschaft", NUR_SCHULNOTE, [{ q1: 2 }, { q1: 2 }]);
    const text = (await zeile("Bereitschaft")).textContent ?? "";
    expect(text).toContain("10 %");
  });

  it("setzt Gruppen unter fuenf Rueckmeldungen kursiv und sagt es", async () => {
    gruppeMitAbend("Wenig", "wenig", NUR_SCHULNOTE, [{ q1: 2 }]);
    gruppeMitAbend(
      "Viel",
      "viel",
      NUR_SCHULNOTE,
      Array.from({ length: 5 }, () => ({ q1: 2 })),
    );
    const wenig = await zeile("Wenig");
    expect(wenig.textContent).toContain("nicht vergleichbar");
    expect(wenig.innerHTML).toContain("italic");
    const viel = await zeile("Viel");
    expect(viel.textContent).not.toContain("nicht vergleichbar");
  });

  it("importiert `core/charts` nicht mehr", () => {
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/feedback/(admin)/vergleich/page.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(quelle).not.toContain("core/charts");
    expect(quelle).toContain("VergleichTabelle");
  });
});
