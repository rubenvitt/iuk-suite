import { registerAuditFunctions } from "@/core/audit/context";
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
import { blattZellen, blattnamen, mappenBytes } from "@/core/export/test-mappe";

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

async function hole(groupId: number, eveningId: number): Promise<Response> {
  const { GET } = await import("./route");
  const res = await GET(new Request("http://localhost:3000/export.xlsx"), {
    params: Promise.resolve({ groupId: String(groupId), eveningId: String(eveningId) }),
  });
  expect(res.status).toBe(200);
  return res;
}

/**
 * Die Matrix als Raster. ⚠️ ZEILE 0 IST DIE KOPFZEILE — im CSV-Weg standen
 * darüber vier Kopfdatenzeilen und eine Leerzeile, weshalb der alte Test sie
 * über `kopfIndexVon` an der Struktur suchen musste („Datum" kam in den
 * Metadaten zuerst und schnitt die Datenzeilen still falsch). Seit DRK-186
 * liegen die Kopfdaten auf einem EIGENEN Blatt, und die Frage stellt sich nicht
 * mehr.
 */
async function exportiere(
  groupId: number,
  eveningId: number,
): Promise<(string | number | null)[][]> {
  return blattZellen(await mappenBytes(await hole(groupId, eveningId)));
}

describe("GET export.xlsx — die erste Spalte verrät die Uhrzeit nicht", () => {
  /**
   * Restkanal (Fund aus dem Review von Task 8): die Datenbank bleibt unangetastet
   * (Import-Parität), aber die AUSGABE normalisiert die Spalte auf das Abenddatum.
   * Vorher stand dort der sekundengenaue Zeitstempel importierter Antworten — wer
   * die Spalte in Excel sortiert, stellte damit die Eingangsreihenfolge wieder her
   * und hob die Durchmischung im Export wieder auf.
   */
  it("heißt „Abendtag“ — kein Name, der eine Uhrzeit verspricht", async () => {
    const { group, evening } = seedImportierterAbend();
    const bytes = await mappenBytes(await hole(group.id, evening.id));
    const kopf = blattZellen(bytes)[0];

    expect(kopf[0]).toBe("Abendtag");
    // „Zeitstempel" versprach eine Genauigkeit, die die Ausgabe bewusst nicht hat.
    expect([...blattZellen(bytes).flat(), ...blattZellen(bytes, 1).flat()])
      .not.toContain("Zeitstempel");
    // Die Fragen bleiben die übrigen Spalten — die Spaltenzahl ändert sich nicht.
    expect(kopf.slice(1)).toEqual(FRAGEN.map((f) => f.text));
  });

  it("alle Datenzeilen tragen dasselbe Datum, keine Uhrzeit", async () => {
    const { group, evening, antworten } = seedImportierterAbend();

    const datenzeilen = (await exportiere(group.id, evening.id)).slice(1);

    expect(datenzeilen).toHaveLength(antworten.length);
    const stempel = datenzeilen.map((z) => String(z[0]));
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

    const freitexte = (await exportiere(group.id, evening.id)).slice(1).map((z) => z[2]);

    const erwartet = shuffleStable(antworten, (a) => JSON.stringify(a)).map((a) => a.q9);
    expect(freitexte).toEqual(erwartet);
    // Und ausdrücklich NICHT die Eingangsreihenfolge — sonst wäre die
    // Durchmischung wirkungslos.
    expect(freitexte).not.toEqual(antworten.map((a) => a.q9));
  });
});

describe("GET export.xlsx — was der Formatwechsel ändert (DRK-186)", () => {
  /**
   * ⛔ EINE BEWERTUNG IST EINE ZAHL, EIN FREITEXT IST TEXT. Der CSV-Weg schrieb
   * beides als `String(v)`; über eine Notenspalte aus Zeichenketten kann eine
   * Kalkulation weder mitteln noch ein Diagramm legen — genau wofür man diese
   * Datei herunterlädt.
   */
  it("schreibt Schulnoten als Zahl und Freitexte als Text", async () => {
    const { group, evening } = seedImportierterAbend();
    const daten = (await exportiere(group.id, evening.id)).slice(1);

    expect(daten.map((z) => z[1]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(daten.every((z) => typeof z[2] === "string")).toBe(true);
  });

  /**
   * Die Kopfdaten standen im CSV-Weg als Vorspann ÜBER der Kopfzeile — in einer
   * Kalkulation verschiebt das Sortieren und Filtern um fünf Zeilen. Eine Mappe
   * hat ein zweites Blatt.
   */
  it("legt Gruppe, Datum, Thema und Rücklauf auf ein zweites Blatt", async () => {
    const { group, evening } = seedImportierterAbend();
    const bytes = await mappenBytes(await hole(group.id, evening.id));

    expect(blattnamen(bytes)).toEqual(["Rückmeldungen", "Kopfdaten"]);
    expect(blattZellen(bytes, 1)).toEqual([
      ["Gruppe", "Bereitschaft"],
      ["Datum", "2026-04-09"],
      ["Thema", "Funk"],
      ["Anzahl Rückmeldungen", 5],
    ]);
  });

  it("liefert Medientyp und Dateinamen einer Mappe", async () => {
    const { group, evening } = seedImportierterAbend();
    const res = await hole(group.id, evening.id);

    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="feedback-bereitschaft-${evening.id}.xlsx"`,
    );
  });

  /**
   * ⛔ DER KERN VON DRK-186 AUF DEM HEIKELSTEN PFAD DER SUITE: dieser Export
   * wird aus ANONYMEM, öffentlich eingegebenem Freitext gespeist. Im CSV-Weg
   * setzte `csvField` einem `=HYPERLINK(...)` einen Apostroph voran, sonst
   * führte Excel es beim Öffnen aus. Hier steht der Text unverändert — und ist
   * trotzdem keine Formel, weil die Zelle eine Textzelle ist.
   */
  it("trägt eine als Freitext eingegebene Formel unverändert und ohne Apostroph", async () => {
    const group = insertGroup(db, {
      name: "Bereitschaft", slug: "bereitschaft", secret: "abc12",
      closeAfterHours: null, createdAt: new Date(0),
    });
    const evening = insertEvening(db, {
      groupId: group.id, date: ABEND, topic: null, notes: null,
      participantCount: null, createdAt: new Date(0),
    });
    const survey = insertSurvey(db, {
      eveningId: evening.id, questions: JSON.stringify(FRAGEN),
      closeAfterHours: null, createdAt: new Date(0),
    });
    insertResponse(db, survey.id, { q1: 1, q9: '=HYPERLINK("http://boese","hier")' }, ABEND);

    const daten = (await exportiere(group.id, evening.id)).slice(1);
    expect(daten[0][2]).toBe('=HYPERLINK("http://boese","hier")');
  });
});
