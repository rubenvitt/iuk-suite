import { registerAuditFunctions } from "@/core/audit/context";
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
import { blattZellen, blattnamen, mappenBytes } from "@/core/export/test-mappe";

/**
 * DER AGGREGIERTE GRUPPEN-EXPORT (Plan Task 20, §2.5 „Excel (alle Abende)").
 *
 * Er ist ein ANDERES ARTEFAKT als `…/evenings/[eveningId]/export.xlsx`: dort eine
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
 * 2. ⛔ DIE FORMEL-NEUTRALISIERUNG IST MIT DRK-186 ENTFALLEN, und dieser Test
 *    hält fest, dass sie NICHT ZURÜCKKOMMEN DARF. Im CSV-Weg setzte `csvField`
 *    einem Thema `=WENN(1;2;3)` und einem Fragetext `-Verpflegung?` einen
 *    Apostroph voran — der dann im Spaltenkopf mitzulesen war. Der Baustein legt
 *    jede Textzelle als Textzelle an; eine Textzelle KANN keine Formel sein.
 *    Wer hier je wieder eine CSV ausliefert, braucht die Neutralisierung zurück.
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
  registerAuditFunctions(sqlite);
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
  return GET(new Request("http://localhost:3000/export.xlsx"), {
    params: Promise.resolve({ groupId: String(groupId) }),
  });
}

/**
 * Das Datenblatt als Raster. ⚠️ ZEILE 0 IST DIE KOPFZEILE — im CSV-Weg standen
 * darüber noch vier Kopfdatenzeilen und eine Leerzeile, weshalb der alte Test
 * sie über `kopfIndex` suchen musste. Seit DRK-186 liegen die Kopfdaten auf
 * einem EIGENEN Blatt (`kopfdaten()`), damit Sortieren und Filtern in der
 * Kalkulation ab Zeile 1 greifen.
 */
async function exportiere(groupId: number): Promise<(string | number | null)[][]> {
  const res = await hole(groupId);
  expect(res.status).toBe(200);
  return blattZellen(await mappenBytes(res));
}

/** Das zweite Blatt: Gruppenname und Anzahl der Abende. */
async function kopfdaten(groupId: number): Promise<(string | number | null)[][]> {
  const res = await hole(groupId);
  expect(res.status).toBe(200);
  return blattZellen(await mappenBytes(res), 1);
}

describe("GET groups/[groupId]/export.xlsx — eine Zeile je Dienstabend", () => {
  it("schreibt je Abend genau eine Zeile, Datum aufsteigend", async () => {
    const g = gruppe();
    abend(g.id, "2026-05-06", BOGEN_B, [{ q1: 2, q3: 3 }]);
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1 }, { q1: 3, q2: 2 }]);

    const daten = (await exportiere(g.id)).slice(1);

    expect(daten).toHaveLength(2);
    expect(daten.map((z) => z[0])).toEqual(["2026-04-01", "2026-05-06"]);
  });

  it("LAESST GEPLANTE UND ABGESAGTE ABENDE WEG — die Mappe fasst Erhobenes zusammen", async () => {
    /*
     * Ohne diesen Filter hätte eine Jahresplanung auf einen Schlag dutzende
     * Zeilen in die Mappe geschrieben, jede mit null Rückmeldungen — und die
     * Kopfdaten meldeten sie als Menge der erfassten Abende. Es gibt in diesem
     * Blatt keine Zustandsspalte: eine solche Zeile ist von einem Abend, den
     * schlicht niemand bewertet hat, nicht zu unterscheiden.
     *
     * Beide Lagen zusammen in EINEM Fall, weil der Filter beide über dieselbe
     * Bedingung trifft — zwei Tests prüften hier zweimal dieselbe Zeile Code.
     */
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1 }]);
    for (const [datum, status] of [
      ["2026-12-08", "planned"],
      ["2026-05-06", "cancelled"],
    ] as const) {
      insertEvening(db, {
        groupId: g.id,
        date: tag(datum),
        topic: `Nicht erhoben ${datum}`,
        notes: null,
        participantCount: null,
        status,
        createdAt: tag("2026-04-01"),
      });
    }

    const daten = (await exportiere(g.id)).slice(1);

    expect(daten).toHaveLength(1);
    expect(daten[0][0]).toBe("2026-04-01");
    // Die Kopfdaten zählen dieselbe Menge — sonst widerspräche sich die Mappe
    // in sich selbst.
    expect(await kopfdaten(g.id)).toEqual([["Gruppe", "Bereitschaft"], ["Dienstabende", 1]]);
  });

  it("vereinigt die Fragespalten über ALLE Abende — kein Bogen verschiebt die Spalten", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1, q2: 2 }]);
    abend(g.id, "2026-05-06", BOGEN_B, [{ q1: 3, q3: 4 }]);

    const [kopf, ...daten] = await exportiere(g.id);

    // Nur Bewertungsfragen haben einen Ø — Freitextfragen stehen nicht im Kopf.
    // ⛔ `-Verpflegung?` OHNE Apostroph: die Neutralisierung ist entfallen.
    expect(kopf).toEqual(["Datum", "Thema", "Rückmeldungen", "Teilnehmer", "Insgesamt?", "Ausbildung?", "-Verpflegung?"]);
    // Fehlt die Frage im Bogen, ist die Zelle LEER — nicht 0 („nicht gefragt"
    // ist nicht „Note 0") und nicht weggelassen.
    expect(daten[0].slice(4)).toEqual([1, 2, null]);
    expect(daten[1].slice(4)).toEqual([3, null, 4]);
  });

  it("nennt Rücklauf und Teilnehmerzahl, erfindet aber keinen Nenner", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 1 }, { q1: 2 }], { teilnehmer: null });

    const zeile = (await exportiere(g.id))[1];

    // ZAHLEN, KEINE ZEICHENKETTEN — der Ertrag des Formatwechsels: eine
    // Kalkulation kann über diese Spalte summieren und sortieren.
    expect(zeile[2]).toBe(2);
    expect(zeile[3]).toBe(null);
  });

  /**
   * ⛔ DER KERN VON DRK-186. Im CSV-Weg stand hier `'=WENN(1;2;3)` und
   * `'-Verpflegung?` — der Apostroph war der einzige Schutz davor, dass Excel
   * die Zelle beim Öffnen als Formel AUSFÜHRT, und er war im Spaltenkopf
   * mitzulesen. In einer Mappe ist jede Textzelle eine Textzelle; der Wert steht
   * unverändert da und ist trotzdem keine Formel. Bräche jemand das (etwa durch
   * eine Rückkehr zur CSV), fiele dieser Test.
   */
  it("trägt Formelbeginn in Thema UND Fragetext unverändert, ohne Apostroph", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_B, [{ q1: 2, q3: 3 }], { topic: "=WENN(1;2;3)" });

    const [kopf, zeile] = await exportiere(g.id);

    expect(zeile[1]).toBe("=WENN(1;2;3)");
    expect(kopf).toContain("-Verpflegung?");
    expect(kopf).not.toContain("'-Verpflegung?");
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

    const [kopf] = await exportiere(g.id);

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

    const [kopf, ...daten] = await exportiere(g.id);

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
    expect(daten[0].slice(4)).toEqual([5, null]);
    expect(daten[1].slice(4)).toEqual([null, 5]);
  });

  it("bleibt ein anderes Artefakt als der Abend-Export: keine Rohantwort-Zeilen", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [
      { q1: 1, t1: "erste Rückmeldung" },
      { q1: 3, t1: "zweite Rückmeldung" },
    ]);

    const res = await hole(g.id);
    const bytes = await mappenBytes(res);
    const flach = blattZellen(bytes).flat();

    expect(flach).not.toContain("erste Rückmeldung");
    expect(flach).not.toContain("Abendtag");
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="feedback-bereitschaft-abende.xlsx"',
    );
  });

  /**
   * DIE KOPFDATEN AUF EIGENEM BLATT. Im CSV-Weg standen „Gruppe" und
   * „Dienstabende" als Vorspann ÜBER der Kopfzeile — in einer Kalkulation
   * verschiebt das Sortieren, Filtern und „als Tabelle formatieren" um vier
   * Zeilen. Eine Mappe hat ein zweites Blatt; genau dafür.
   */
  it("legt Gruppenname und Abendzahl auf ein zweites Blatt, nicht über die Kopfzeile", async () => {
    const g = gruppe();
    abend(g.id, "2026-04-01", BOGEN_A, [{ q1: 2 }]);

    const bytes = await mappenBytes(await hole(g.id));
    expect(blattnamen(bytes)).toEqual(["Dienstabende", "Kopfdaten"]);
    expect(await kopfdaten(g.id)).toEqual([["Gruppe", "Bereitschaft"], ["Dienstabende", 1]]);
    // Und auf dem Datenblatt beginnt es sofort mit der Kopfzeile.
    expect(blattZellen(bytes)[0][0]).toBe("Datum");
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

    const daten = (await exportiere(g.id)).slice(1);

    expect(daten).toHaveLength(2);
    expect(daten[0][0]).toBe("2026-03-04");
    expect(daten[0][2]).toBe(0);
    expect(daten[0].slice(4).every((z) => z === null)).toBe(true);
  });
});

describe("GET groups/[groupId]/export.xlsx — der Guard", () => {
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
