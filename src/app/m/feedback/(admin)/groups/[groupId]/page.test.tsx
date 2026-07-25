// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../../../_db/schema";
import {
  insertEvening,
  insertGroup,
  insertResponse,
  insertSurvey,
  setSurveyStatus,
} from "../../../_db/queries";
import type { Question } from "../../../_lib/questions";

/**
 * DIE KOPFZONE UND DER SLOT „LETZTER ABEND" DES COCKPITS (§4.2, §2.7).
 *
 * Zwei Zusagen, die still brechen:
 *
 * 1. §4.2 verlangt in Zeile 3 eine Kontextzeile mit BEIDEN Hälften — die Zahl
 *    der Dienstabende UND „· Ø der letzten sechs: 2,1 gut". Die zweite Hälfte
 *    ist die einzige Stelle der Seite, die sagt, wo die Gruppe steht; ohne sie
 *    beantwortet das Cockpit „wie viele" und nicht „wie gut". Der Wert kommt
 *    aus `avgSchulnote` (§4.12) — `overallAvg` mischt die Alt-Skala 1–5 in
 *    dieselbe Rampe.
 * 2. §2.7 nennt für „Auswertung ansehen" einen `Button` in `default`
 *    („bewusst kein Primärknopf" — gemeint ist die STUFE, nicht die Bauform).
 *    Ein nackter Textlink ist in einer Karte mit Zahl und Notenpille kein
 *    erkennbares Ziel.
 *
 * Der Prüfstand ist derselbe wie beim Aushang: echte In-Memory-Datenbank mit
 * migriertem Schema, damit die Zahlen den Weg durch `cockpitZustand` und
 * `computeDAStats` wirklich gehen — eine gemockte Aggregation würde genau den
 * Fehler durchlassen, um den es geht.
 */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));

vi.mock("../../../_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("../../../_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): die Gruppe wurde nicht geladen");
  },
  // `useRouter` wirft ausserhalb des `AppRouterContext`; die Lagekarte traegt
  // seit `Aktualisierer` eine Client-Insel, die ihn liest.
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "10.0.3.14:3000",
      "x-forwarded-host": "feedback.iuk-ue.de",
      "x-forwarded-proto": "https",
    }),
}));
// Die Actions liegen hinter `"use server"` und ziehen Datenbank und `next/*`
// nach; die Seite prueft hier ihre Darstellung, nicht ihre Aktionen.
vi.mock("../../../actions", () => ({
  startFeedbackAction: vi.fn(),
  beendeFeedbackAction: vi.fn(),
  // Zone d (Verlauf) braucht drei weitere — ohne sie ist der Import `undefined`
  // und die Zone wirft beim Rendern.
  activateSurveyAction: vi.fn(),
  createEveningAction: vi.fn(),
  deleteEveningAction: vi.fn(),
}));

import Cockpit, { kontextzeile } from "./page";

const FRAGEN: Question[] = [
  { id: "q1", type: "schulnote", text: "Wie war der Dienstabend insgesamt?" },
  { id: "q9", type: "text", text: "Was hat dir gefehlt?" },
];

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Ein abgeschlossener Dienstabend mit je einer Antwort pro genannter Note.
 * `noten: []` ergibt einen Abend OHNE beantwortete Schulnoten-Frage — genau der
 * Fall, in dem es keinen Durchschnitt gibt und keiner erfunden werden darf.
 */
function abend(datum: string, noten: number[], freitexte: string[] = []) {
  const evening = insertEvening(db, {
    groupId: 1,
    date: tag(datum),
    topic: `Thema ${datum}`,
    notes: null,
    participantCount: 20,
    createdAt: tag(datum),
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(FRAGEN),
    closeAfterHours: 48,
    createdAt: tag(datum),
  });
  setSurveyStatus(db, survey.id, "closed", {
    activatedAt: tag(datum),
    closesAt: tag(datum),
    closedAt: tag(datum),
  });
  noten.forEach((note, i) =>
    insertResponse(db, survey.id, { q1: note, q9: freitexte[i] ?? "" }, tag(datum)),
  );
  freitexte.slice(noten.length).forEach((t) => insertResponse(db, survey.id, { q9: t }, tag(datum)));
  return { evening, survey };
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  insertGroup(db, {
    name: "Bereitschaft Übach-Palenberg",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  guardPageMock.mockReset();
  guardPageMock.mockResolvedValue({ viewer: { sub: "u1" }, db });
});
afterEach(() => sqlite.close());

async function zeichne(groupId = "1"): Promise<HTMLElement> {
  const element = await Cockpit({ params: Promise.resolve({ groupId }) });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

/** Die Kontextzeile ist die dritte Zeile der Kopfzone (§4.2). */
async function kontext(groupId = "1"): Promise<string> {
  const zeilen = [...(await zeichne(groupId)).querySelectorAll("header p")];
  return zeilen[zeilen.length - 1]?.textContent ?? "";
}

describe("Kontextzeile — die reine Rechnung (§4.2, §4.12)", () => {
  it("nennt ohne Dienstabend keinen Durchschnitt", () => {
    expect(kontextzeile(0, [])).toBe("Noch kein Dienstabend erfasst.");
  });

  it("hängt bei sechs Noten den Halbsatz wortgenau an", () => {
    // Ø = 2,1 → gerundet Stufe 2 → „gut" (§4.11-Schwellen).
    expect(kontextzeile(14, [1.6, 2, 2.2, 2.4, 2, 2.4])).toBe(
      "14 Dienstabende erfasst · Ø der letzten sechs: 2,1 gut",
    );
  });

  it("mittelt nur die jüngsten sechs — der siebte Abend zieht nicht mehr", () => {
    const sechs = [1, 1, 1, 1, 1, 1];
    expect(kontextzeile(7, [...sechs, 6])).toBe(kontextzeile(7, sechs));
  });

  it("erfindet keine sechs, wenn es weniger sind", () => {
    expect(kontextzeile(2, [2, 3])).toBe("2 Dienstabende erfasst · Ø aus 2 Abenden: 2,5 befriedigend");
    // Ein einziger Wert: „Ø der letzten sechs" waere hier schlicht falsch.
    expect(kontextzeile(9, [4, null, null, null, null, null])).toBe(
      "9 Dienstabende erfasst · Ø aus 1 Abend: 4,0 ausreichend",
    );
  });

  it("lässt den Halbsatz ganz weg, wenn kein Abend eine Schulnote trägt", () => {
    expect(kontextzeile(3, [null, null, null])).toBe("3 Dienstabende erfasst");
    expect(kontextzeile(3, [null, null, null])).not.toContain("Ø");
  });

  it("überspringt Abende ohne Schulnote statt sie als 0 zu mitteln", () => {
    expect(kontextzeile(3, [2, null, 2])).toContain("Ø aus 2 Abenden: 2,0 gut");
  });
});

describe("Kontextzeile — verdrahtet in der Kopfzone", () => {
  it("zählt die Abende und nennt den Ø der letzten sechs", async () => {
    // Sieben Abende, der älteste bewusst mit 6,0: erscheint er im Ø, ist das
    // Fenster falsch geschnitten.
    for (const [datum, note] of [
      ["2026-01-05", 6],
      ["2026-02-02", 2],
      ["2026-03-02", 2],
      ["2026-04-06", 2],
      ["2026-05-04", 2],
      ["2026-06-01", 2],
      ["2026-07-06", 2],
    ] as [string, number][]) {
      abend(datum, [note]);
    }

    expect(await kontext()).toBe("7 Dienstabende erfasst · Ø der letzten sechs: 2,0 gut");
  });

  it("sagt in der Betriebsart Einrichtung, dass noch kein Abend erfasst ist", async () => {
    expect(await kontext()).toBe("Noch kein Dienstabend erfasst.");
  });

  it("liest `avgSchulnote`, nicht `overallAvg` — die Alt-Skala 1–5 verfälscht nichts", async () => {
    /*
     * Ein Bogen mit einer `stars`-Frage (Alt-Skala 1–5, nur Lesepfad). Die
     * Antwort 5 heisst dort „sehr gut", auf der Schulnotenrampe „mangelhaft":
     * `overallAvg` mittelt beide zu 3,0, `avgSchulnote` bleibt bei 1,0.
     */
    const evening = insertEvening(db, {
      groupId: 1,
      date: tag("2026-07-06"),
      topic: "Alt-Import",
      notes: null,
      participantCount: 12,
      createdAt: tag("2026-07-06"),
    });
    const survey = insertSurvey(db, {
      eveningId: evening.id,
      questions: JSON.stringify([
        { id: "q1", type: "schulnote", text: "Wie war der Dienstabend insgesamt?" },
        { id: "alt", type: "stars", text: "Alt-Frage" },
      ] satisfies Question[]),
      closeAfterHours: 48,
      createdAt: tag("2026-07-06"),
    });
    setSurveyStatus(db, survey.id, "closed", { closesAt: tag("2026-07-06") });
    insertResponse(db, survey.id, { q1: 1, alt: 5 }, tag("2026-07-06"));

    expect(await kontext()).toContain("Ø aus 1 Abend: 1,0 sehr gut");
  });
});

describe("Slot „Letzter Abend“ (§2.7)", () => {
  it("führt zur Auswertung über einen Knopf in `default`, nicht über einen nackten Link", async () => {
    const { evening } = abend("2026-07-06", [2, 2, 2]);
    const wirt = await zeichne();
    const ziel = `/m/feedback/groups/1/evenings/${evening.id}/auswertung`;

    const knopf = [...wirt.querySelectorAll<HTMLElement>(".ant-btn")].find((b) =>
      (b.textContent ?? "").includes("Auswertung ansehen"),
    );
    expect(knopf).toBeDefined();
    expect(knopf!.getAttribute("href")).toBe(ziel);
    // Die STUFE ist `default`: der Primärknopf der Seite ist die Zustandsaktion.
    expect(knopf!.className).not.toContain("ant-btn-primary");
    // Farb-Klausel §4.9: `danger` faerbt mit `colorError === colorPrimary`.
    expect(knopf!.className).not.toContain("ant-btn-dangerous");
    // Ein Ziel, ein Tabstop: kein zweiter Link mit derselben Beschriftung.
    const rohlinks = [...wirt.querySelectorAll("a")].filter(
      (a) => (a.textContent ?? "").trim() === "Auswertung ansehen" && !a.className.includes("ant-btn"),
    );
    expect(rohlinks).toHaveLength(0);
  });

  it("polstert die Karte über die Variable, damit 390px 16 statt 20 bekommt (§2.1)", async () => {
    abend("2026-07-06", [2]);
    const wirt = await zeichne();
    const rumpf = [...wirt.querySelectorAll<HTMLElement>(".ant-card-body")].find((k) =>
      (k.textContent ?? "").includes("Auswertung ansehen"),
    );
    expect(rumpf).toBeDefined();
    expect(rumpf!.getAttribute("style")).toContain("padding:var(--fb-kartenpolster)");
  });
});

/**
 * ZONE d — VERLAUF, VERDRAHTET (§2.1 Punkt 3, §2.5, §4.12).
 *
 * Die Zone selbst ist in `_ui/Verlauf.test.tsx` geprüft. Hier hängen die drei
 * Zusagen, die nur die SEITE halten kann, weil `Verlauf` eine Client-Komponente
 * ist und keine Datenbank sieht:
 *
 * 1. Die Zeile trägt `avgSchulnote`, NICHT `overallAvg`. Das entscheidet der
 *    Aufbau der Zeilen hier — die Zone bekommt nur eine Zahl und kann den Fehler
 *    nicht mehr sehen.
 * 2. Der LAUFENDE Abend steht NICHT in der Tabelle (§2.5): derselbe Abend zweimal
 *    auf einer Seite ist genau die Unschärfe, die den Ist-Zustand unlesbar macht.
 * 3. In der Betriebsart „Einrichtung" entfällt die Zone vollständig (§2.1) — ein
 *    leeres Fach ist schlimmer als kein Fach.
 */
describe("Zone d — VERLAUF, verdrahtet", () => {
  /** Die Zeilen der breiten Verlaufsdarstellung. */
  const verlaufszeilen = (wirt: HTMLElement) => [
    ...wirt.querySelectorAll<HTMLElement>(".fb-verlauf-breit tbody tr.ant-table-row"),
  ];

  it("zeigt jeden abgeschlossenen Abend mit Rücklauf und Notenpille", async () => {
    abend("2026-06-01", [2, 2, 3]);
    abend("2026-07-06", [1, 1]);

    const wirt = await zeichne();
    const zeilen = verlaufszeilen(wirt);

    expect(zeilen).toHaveLength(2);
    // Absteigend: der jüngste Abend steht oben.
    expect(zeilen[0].textContent).toContain("06.07.2026");
    expect(zeilen[0].textContent).toContain("2 / 20");
    expect(zeilen[0].textContent).toContain("1,0");
    expect(zeilen[1].textContent).toContain("2,3");
  });

  it("trägt `avgSchulnote` in die Pille, nicht `overallAvg`", async () => {
    /*
     * Derselbe Aufbau wie in der Kopfzeile: eine `stars`-Antwort 5 heisst auf der
     * Alt-Skala „sehr gut", auf der Schulnotenrampe „mangelhaft". `overallAvg`
     * mittelt beide zu 3,0 („befriedigend"), `avgSchulnote` bleibt bei 1,0.
     */
    const evening = insertEvening(db, {
      groupId: 1,
      date: tag("2026-07-06"),
      topic: "Alt-Import",
      notes: null,
      participantCount: 12,
      createdAt: tag("2026-07-06"),
    });
    const survey = insertSurvey(db, {
      eveningId: evening.id,
      questions: JSON.stringify([
        { id: "q1", type: "schulnote", text: "Wie war der Dienstabend insgesamt?" },
        { id: "alt", type: "stars", text: "Alt-Frage" },
      ] satisfies Question[]),
      closeAfterHours: 48,
      createdAt: tag("2026-07-06"),
    });
    setSurveyStatus(db, survey.id, "closed", { closesAt: tag("2026-07-06") });
    insertResponse(db, survey.id, { q1: 1, alt: 5 }, tag("2026-07-06"));

    const zeile = verlaufszeilen(await zeichne())[0];

    expect(zeile.textContent).toContain("1,0");
    expect(zeile.textContent).toContain("sehr gut");
    // 3,0 wäre der gemischte Wert — und damit der stille Rechenfehler aus §4.12.
    expect(zeile.textContent).not.toContain("3,0");
    // Und die Fußnote, weil der Bogen eine `stars`-Frage trägt.
    expect(zeile.textContent).toContain("enthält Altbestands-Fragen (Skala 1–5)");
  });

  it("führt den laufenden Abend NICHT in der Tabelle — er steht in der Lagekarte", async () => {
    abend("2026-06-01", [2]);
    const laufend = insertEvening(db, {
      groupId: 1,
      date: tag("2026-07-22"),
      topic: "Läuft gerade",
      notes: null,
      participantCount: 20,
      createdAt: tag("2026-07-22"),
    });
    const survey = insertSurvey(db, {
      eveningId: laufend.id,
      questions: JSON.stringify(FRAGEN),
      closeAfterHours: 48,
      createdAt: tag("2026-07-22"),
    });
    // Frist weit in der Zukunft, damit `nextStatusOnAccess` nicht faltet.
    setSurveyStatus(db, survey.id, "active", {
      activatedAt: tag("2026-07-22"),
      closesAt: new Date("2099-01-01T00:00:00Z"),
    });

    const wirt = await zeichne();
    const zeilen = verlaufszeilen(wirt);

    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].textContent).toContain("01.06.2026");
    expect(zeilen.map((z) => z.textContent ?? "").join()).not.toContain("Läuft gerade");
  });

  /**
   * DIE ZWEITE HÄLFTE DIESER ZUSAGE IST DIE WICHTIGERE. Zone d entfällt in der
   * Einrichtung — Zone a (Teilnahme) aber NICHT: §2.4/A ist der einzige Ort mit
   * dem Satz „Du kannst den Aushang schon vor dem ersten Abend drucken", und mit
   * der Spalte wäre er unerreichbar.
   *
   * Geprüft wird das HIER am gerenderten Baum und nicht als Quelltextregel in
   * `Teilnahme.test.tsx`: seit Zone d ist `!einrichtung &&` auf dieser Seite ein
   * legitimes Mittel, und eine Textregel, die es irgendwo in der Datei verbietet,
   * müsste entweder falsch anschlagen oder so aufgeweicht werden, dass sie einen
   * Gate um `<Col><Teilnahme/></Col>` durchlässt. Ein Rendering kann nichts
   * vortäuschen.
   */
  it("entfällt in der Betriebsart Einrichtung — die Teilnahme-Zone aber nicht", async () => {
    const wirt = await zeichne();

    expect(wirt.querySelectorAll("[data-testid='verlauf-kopf']")).toHaveLength(0);
    expect(wirt.textContent).not.toContain("Noch keine vergangenen Dienstabende.");

    // Zone a steht da: die Teilnahme-Adresse aus den (gemockten) Headern und der
    // Satz, den es nur in der Einrichtung gibt.
    expect(wirt.textContent).toContain("feedback.iuk-ue.de/f/");
    expect(wirt.textContent).toContain("Aushang");
  });
});
