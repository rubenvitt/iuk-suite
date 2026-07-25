import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  insertGroup,
  insertEvening,
  insertResponse,
  insertSurvey,
} from "@/app/m/feedback/_db/queries";
import type { Question } from "@/app/m/feedback/_lib/questions";

/**
 * DER AGGREGIERTE GRUPPEN-EXPORT (Plan Task 20, §2.5 „CSV (alle Abende)").
 *
 * Er ist ein ANDERES ARTEFAKT als `…/evenings/[eveningId]/export.csv`: dort eine
 * Zeile je ANTWORT (Rohdaten eines Abends), hier eine Zeile je DIENSTABEND mit
 * dem Ø je Frage. Der Abend-Export bleibt unverändert — sein Test daneben
 * bewacht das.
 *
 * Vier Zusagen, die still brechen:
 *
 * 1. FRAGEBÖGEN WACHSEN. `surveys.questions` ist JSON je Umfrage, also kann jeder
 *    Abend einen anderen Bogen haben. Ohne stabile Spaltenvereinigung über ALLE
 *    Abende wandern die Spalten von Zeile zu Zeile, und die Datei ist stumm
 *    falsch — kein Fehler, nur verschobene Zahlen.
 * 2. DIE FORMEL-NEUTRALISIERUNG GILT AUCH HIER. Themen und Fragetexte kommen aus
 *    Eingabefeldern; `=`, `+`, `-`, `@` am Feldanfang führt Excel als Formel aus.
 *    Neutralisiert wird in `csv.ts` (`csvField`) — wiederverwendet, nicht neu
 *    geschrieben.
 * 3. DER GUARD IST DERSELBE WIE IM ABEND-EXPORT: 404 bei fehlender Ressource UND
 *    bei fehlendem Zugriff (nie 403 — das verriete die Existenz).
 * 4. GERECHNET WIRD `avgSchulnote`, NICHT `overallAvg` — auf Fragenebene heißt
 *    das: `stars`-Fragen (Alt-Skala 1–5) stehen NICHT in derselben Spalte wie
 *    Schulnoten und tragen ihre Skala im Spaltenkopf (§4.12). Das muss AUCH BEI
 *    GLEICHER FRAGE-ID gelten: der Cutover bringt `q1` im importierten Alt-Bogen
 *    als `stars` und im nächsten Bogen derselben Gruppe als `schulnote`. Ein Test
 *    mit disjunkten IDs (`q1`/`s1`) kann diese Kollision nicht sehen — deshalb
 *    stehen hier BEIDE Fälle.
 */

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Bogen des ersten Abends. */
const BOGEN_A: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "q2", type: "schulnote", text: "Ausbildung?" },
  { id: "t1", type: "text", text: "Was hat gefehlt?" },
];

/**
 * Bogen des zweiten Abends: `q2` ist WEG, `q3` ist NEU — und trägt einen
 * Fragetext, der mit `-` beginnt. Genau diese Kombination bricht eine Ausgabe,
 * die die Spalten je Zeile aus dem eigenen Bogen zieht.
 */
const BOGEN_B: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "q3", type: "schulnote", text: "-Verpflegung?" },
  { id: "t1", type: "text", text: "Was hat gefehlt?" },
];

function gruppe() {
  return insertGroup(db, {
    name: "Bereitschaft",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
}

function abend(
  groupId: number,
  datum: string,
  bogen: Question[],
  antworten: Record<string, unknown>[],
  over: { topic?: string | null; teilnehmer?: number | null } = {},
) {
  const evening = insertEvening(db, {
    groupId,
    date: tag(datum),
    topic: over.topic === undefined ? `Thema ${datum}` : over.topic,
    notes: null,
    participantCount: over.teilnehmer === undefined ? 20 : over.teilnehmer,
    createdAt: tag(datum),
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(bogen),
    closeAfterHours: 48,
    createdAt: tag(datum),
  });
  antworten.forEach((a) => insertResponse(db, survey.id, a, tag(datum)));
  return { evening, survey };
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

async function hole(groupId: number | string): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new Request("http://localhost:3000/export.csv"), {
    params: Promise.resolve({ groupId: String(groupId) }),
  });
}

async function exportiere(groupId: number): Promise<string[][]> {
  const res = await hole(groupId);
  expect(res.status).toBe(200);
  return (await res.text()).split("\r\n").map(felder);
}

/**
 * Minimaler RFC-4180-Leser für die Assertions. Nötig, weil die Ø-Werte mit
 * DEZIMALKOMMA geschrieben werden („2,0") und `buildCsv` sie deshalb in
 * Anführungszeichen setzt — ein `split(",")` schnitte mitten in die Zahl.
 */
function felder(zeile: string): string[] {
  const aus: string[] = [];
  let feld = "";
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i];
    if (inAnfuehrung) {
      if (z === '"' && zeile[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (z === '"') {
        inAnfuehrung = false;
      } else {
        feld += z;
      }
    } else if (z === '"') {
      inAnfuehrung = true;
    } else if (z === ",") {
      aus.push(feld);
      feld = "";
    } else {
      feld += z;
    }
  }
  aus.push(feld);
  return aus;
}

/** Die Kopfzeile ist die Zeile NACH der Leerzeile — geankert an der Struktur. */
function kopfIndex(zeilen: string[][]): number {
  const leer = zeilen.findIndex((z) => z.length === 1 && z[0] === "");
  expect(leer).toBeGreaterThan(0);
  return leer + 1;
}

describe("GET groups/[groupId]/export.csv — eine Zeile je Dienstabend", () => {
  it("schreibt je Abend genau eine Zeile, Datum aufsteigend", async () => {
    const g = gruppe();
    abend(g.id, "2026-05-06", BOGEN_B, [{ q1: 2, q3: 3 }]);
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1 }, { q1: 3, q2: 2 }]);

    const zeilen = await exportiere(g.id);
    const daten = zeilen.slice(kopfIndex(zeilen) + 1);

    expect(daten).toHaveLength(2);
    expect(daten.map((z) => z[0])).toEqual(["2026-04-01", "2026-05-06"]);
  });

  it("vereinigt die Fragespalten über ALLE Abende — kein Bogen verschiebt die Spalten", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1, q2: 2 }]);
    abend(g.id, "2026-05-06", BOGEN_B, [{ q1: 3, q3: 4 }]);

    const zeilen = await exportiere(g.id);
    const kopf = zeilen[kopfIndex(zeilen)];
    const daten = zeilen.slice(kopfIndex(zeilen) + 1);

    // Nur Bewertungsfragen haben einen Ø — Freitextfragen stehen nicht im Kopf.
    expect(kopf).toEqual(["Datum", "Thema", "Rückmeldungen", "Teilnehmer", "Insgesamt?", "Ausbildung?", "'-Verpflegung?"]);
    // Jede Zeile hat die volle Spaltenzahl; fehlt die Frage im Bogen, ist die
    // Zelle LEER — nicht weggelassen und nicht 0.
    expect(daten.every((z) => z.length === kopf.length)).toBe(true);
    expect(daten[0].slice(4)).toEqual(["1,0", "2,0", ""]);
    expect(daten[1].slice(4)).toEqual(["3,0", "", "4,0"]);
  });

  it("nennt Rücklauf und Teilnehmerzahl, erfindet aber keinen Nenner", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1 }, { q1: 2 }], { teilnehmer: null });

    const zeilen = await exportiere(g.id);
    const zeile = zeilen[kopfIndex(zeilen) + 1];

    expect(zeile[2]).toBe("2");
    expect(zeile[3]).toBe("");
  });

  it("neutralisiert Formeln in Thema UND Fragetext (`csv.ts` wiederverwendet)", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_B, [{ q1: 2, q3: 3 }], { topic: "=WENN(1;2;3)" });

    const zeilen = await exportiere(g.id);
    const kopf = zeilen[kopfIndex(zeilen)];
    const zeile = zeilen[kopfIndex(zeilen) + 1];

    expect(zeile[1]).toBe("'=WENN(1;2;3)");
    expect(kopf).toContain("'-Verpflegung?");
  });

  it("mittelt `stars` NICHT in eine Schulnotenspalte, sondern nennt die Skala im Kopf", async () => {
    const g = gruppe();
    abend(
      g.id,
      "2026-04-01",
      [
        { id: "q1", type: "schulnote", text: "Insgesamt?" },
        { id: "s1", type: "stars", text: "Ausbilder?" },
      ],
      [{ q1: 2, s1: 5 }],
    );

    const zeilen = await exportiere(g.id);
    const kopf = zeilen[kopfIndex(zeilen)];

    expect(kopf).toContain("Insgesamt?");
    expect(kopf).toContain("Ausbilder? (Skala 1–5)");
    expect(kopf).not.toContain("Ausbilder?");
  });

  /*
   * DER CUTOVER-FALL, und der Grund, warum der Spaltenschlüssel `id|type` ist.
   * Der Import trägt Alt-Gruppen samt ihrer `stars`-Bögen fort (der Alt-Bogen
   * benutzt `q1`, siehe scripts/import/feedback.test.ts), und die nächste neu
   * gestartete Umfrage DERSELBEN Gruppe bringt `q1` als Schulnote mit
   * (`STANDARD_QUESTIONS`). Auf die Frage-ID allein geschlüsselt fielen beide in
   * eine Spalte: die 5 des Alt-Abends heißt „sehr gut", die 5 des neuen Abends
   * „mangelhaft" — dieselbe Ziffer, gegenteilige Aussage, unter einem Kopf, der
   * über die Hälfte der Zahlen lügt. Tragend ist hier die LEERE Zelle je Zeile:
   * nur sie beweist, dass die Werte in VERSCHIEDENEN Spalten stehen.
   */
  it("trennt gleiche Frage-ID mit verschiedener Skala in zwei Spalten (`q1` stars, später `q1` schulnote)", async () => {
    const g = gruppe();
    abend(
      g.id,
      "2026-03-04",
      [{ id: "q1", type: "stars", text: "Wie war der Abend?" }],
      [{ q1: 5 }],
    );
    abend(
      g.id,
      "2026-04-01",
      [{ id: "q1", type: "schulnote", text: "Wie war der Dienstabend insgesamt?" }],
      [{ q1: 5 }],
    );

    const zeilen = await exportiere(g.id);
    const kopf = zeilen[kopfIndex(zeilen)];
    const daten = zeilen.slice(kopfIndex(zeilen) + 1);

    // Zwei Spalten, jede mit ihrem eigenen, richtigen Kopf — und der Fragetext
    // des NEUEN Bogens fehlt nicht mehr in der Datei.
    expect(kopf).toEqual([
      "Datum",
      "Thema",
      "Rückmeldungen",
      "Teilnehmer",
      "Wie war der Abend? (Skala 1–5)",
      "Wie war der Dienstabend insgesamt?",
    ]);
    // Die 1–6-Note steht NICHT unter dem Kopf, der Skala 1–5 behauptet.
    expect(daten[0].slice(4)).toEqual(["5,0", ""]);
    expect(daten[1].slice(4)).toEqual(["", "5,0"]);
  });

  it("bleibt ein anderes Artefakt als der Abend-Export: keine Rohantwort-Zeilen", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [
      { q1: 1, t1: "erste Rückmeldung" },
      { q1: 3, t1: "zweite Rückmeldung" },
    ]);

    const res = await hole(g.id);
    const text = await res.text();

    expect(text).not.toContain("erste Rückmeldung");
    expect(text).not.toContain("Abendtag");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="feedback-bereitschaft-abende.csv"',
    );
  });

  it("führt einen Abend ohne Umfrage mit leeren Ø-Zellen, statt ihn zu verschweigen", async () => {
    const g = gruppe();
    insertEvening(db, {
      groupId: g.id,
      date: tag("2026-03-04"),
      topic: "Nur dokumentiert",
      notes: null,
      participantCount: 18,
      createdAt: tag("2026-03-04"),
    });
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 2 }]);

    const zeilen = await exportiere(g.id);
    const daten = zeilen.slice(kopfIndex(zeilen) + 1);

    expect(daten).toHaveLength(2);
    expect(daten[0][0]).toBe("2026-03-04");
    expect(daten[0][2]).toBe("0");
    expect(daten[0].slice(4).every((z) => z === "")).toBe(true);
  });
});

describe("GET groups/[groupId]/export.csv — der Guard", () => {
  it("antwortet 404, wenn die Gruppe nicht existiert", async () => {
    expect((await hole(999)).status).toBe(404);
  });

  it("antwortet 404 — nicht 403 — bei fremder Gruppe", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 2 }]);
    authMock.mockResolvedValue({
      user: { id: "fremd-1", groups: [], fachgruppen: ["andere-gruppe"] },
    });

    const res = await hole(g.id);
    expect(res.status).toBe(404);
  });

  it("antwortet 404 ohne Sitzung", async () => {
    const g = gruppe();
    authMock.mockResolvedValue(null);
    expect((await hole(g.id)).status).toBe(404);
  });
});
