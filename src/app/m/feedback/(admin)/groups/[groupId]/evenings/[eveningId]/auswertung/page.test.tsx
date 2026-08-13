// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  getGroup,
  insertEvening,
  insertGroup,
  insertResponse,
  insertSurvey,
  setSurveyStatus,
} from "@/app/m/feedback/_db/queries";
import { STANDARD_QUESTIONS, type Question } from "@/app/m/feedback/_lib/questions";
import { shuffleStable } from "@/app/m/feedback/_lib/aggregation";

/**
 * DIE AUSWERTUNG (Entwurf §3.2, §4.1, §4.2, §4.3).
 *
 * Zwei Zusagen, die hier zusammenkommen:
 *
 * 1. DIE AMPEL LIEST `avgSchulnote` (§4.12). `overallAvg` mischt Schulnoten (1–6)
 *    und Alt-Sterne (1–5) in DENSELBEN Mittelwert: ein Bogen mit „Schulnote 1"
 *    und „5 von 5 Sternen" — zweimal die beste erreichbare Bewertung — ergibt 3,0
 *    und damit „befriedigend". Geprueft wird in BEIDE Richtungen, und zwar AM
 *    KENNZAHLENBLOCK: seit die Notenlegende auf der Seite steht, enthaelt das
 *    Seiten-Markup alle sechs Notenfarben (das ist ihr Zweck). Eine Pruefung ueber
 *    die ganze Seite wuerde deshalb nichts mehr beweisen — die Zusage gilt fuer
 *    die Plakette, nicht fuer die Legende.
 * 2. DIE NOTENSPUR ERSETZT DEN `BarChart` VOLLSTAENDIG (§3.2 Punkt 2). Acht
 *    Verteilungen uebereinander zeigen, ob der Abend gleichmaessig gut war oder
 *    eine Frage die Gruppe gespalten hat — was ein Balken mit dem Mittelwert 3,0
 *    aus 6×1 und 6×5 systematisch verschweigt.
 */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));

vi.mock("@/app/m/feedback/_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): der Abend wurde nicht geladen");
  },
}));

import AuswertungPage from "./page";

const ABEND = new Date("2026-07-22T00:00:00Z"); // Mitternacht UTC wie evenings.date

const GEMISCHT: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "s1", type: "stars", text: "Alt-Frage" },
];
const NUR_SCHULNOTE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];
const NUR_STERNE: Question[] = [{ id: "s1", type: "stars", text: "Alt-Frage" }];

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

function seed(
  fragen: Question[],
  antworten: Record<string, unknown>[],
  over: { teilnehmer?: number | null; status?: "active" | "closed" } = {},
) {
  // Nur EINE Gruppe (id 1) — die Seite prüft `evening.groupId` gegen den
  // URL-Parameter, ein zweiter Abend muss also in derselben Gruppe hängen.
  if (!getGroup(db, 1)) {
    insertGroup(db, {
      name: "Bereitschaft",
      slug: "bereitschaft",
      secret: "abc12",
      closeAfterHours: null,
      createdAt: new Date(0),
    });
  }
  const evening = insertEvening(db, {
    groupId: 1,
    date: ABEND,
    topic: "Funk",
    notes: null,
    participantCount: over.teilnehmer === undefined ? 18 : over.teilnehmer,
    createdAt: ABEND,
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(fragen),
    closeAfterHours: 48,
    createdAt: ABEND,
  });
  // Ohne geschlossene Umfrage kein KI-Prompt (der Bau ist an den effektiven
  // Status geknuepft, wie in der alten Route).
  setSurveyStatus(db, survey.id, over.status ?? "closed");
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

const kennzahlen = (wirt: HTMLElement): HTMLElement => {
  const block = wirt.querySelector<HTMLElement>('[data-testid="kennzahlen"]');
  expect(block).not.toBeNull();
  return block!;
};

/**
 * Die EINE Kennzahl, nicht der ganze Block. `toContain("2")` war im
 * Kennzahlenblock bereits durch Ruecklauf, Quote und Notenziffer erfuellt — die
 * Freitextzahl selbst war damit nirgends festgenagelt.
 */
const kennzahl = (wirt: HTMLElement, kicker: string): string => {
  const spalte = [...kennzahlen(wirt).querySelectorAll<HTMLElement>(".ant-col")].find((c) =>
    (c.textContent ?? "").startsWith(kicker),
  );
  if (!spalte) throw new Error(`Keine Kennzahl mit dem Kicker ${kicker}`);
  return (spalte.textContent ?? "").slice(kicker.length);
};

/** Die Notenspuren: EIN `aria-label` je Spur (§4.14), nicht sechs an den Zellen. */
const spuren = (wirt: HTMLElement): HTMLElement[] =>
  [...wirt.querySelectorAll<HTMLElement>('[role="img"]')].filter((el) =>
    (el.getAttribute("aria-label") ?? "").startsWith("Notenverteilung"),
  );

const FUSSNOTE = "enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet";

describe("Auswertung — die Ampel liest den Schulnoten-Mittelwert (§4.12)", () => {
  it("faerbt nach avgSchulnote (1,0 sehr gut), nicht nach overallAvg (3,0 befriedigend)", async () => {
    const evening = seed(GEMISCHT, [
      { q1: 1, s1: 5 },
      { q1: 1, s1: 5 },
    ]);
    const block = kennzahlen(await zeichne(evening.id));

    expect(block.innerHTML).toContain("var(--note-1)");
    expect(block.innerHTML).not.toContain("var(--note-3)");
    expect(block.textContent).toContain("1,0");
    expect(block.textContent).toContain("sehr gut");
    expect(block.textContent).not.toContain("befriedigend");
  });

  it("traegt bei Altbestands-Fragen die Fussnote aus §4.12", async () => {
    const evening = seed(GEMISCHT, [{ q1: 2, s1: 4 }]);
    expect((await zeichne(evening.id)).textContent).toContain(FUSSNOTE);
  });

  it("laesst die Fussnote weg, wo kein Altbestand im Bogen steht", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeichne(evening.id)).textContent).not.toContain(FUSSNOTE);
  });

  it("zeigt bei reinem Altbestands-Bogen „—“ und keine Notenfarbe im Kennzahlenblock", async () => {
    // `avgSchulnote` ist null — vier von fuenf Sternen auf die Sechser-Rampe
    // abzutasten waere genau der Fehler, um den es geht. Und weil der Bogen keine
    // Schulnotenfrage hat, gibt es auch keine Spuren und keine Legende: eine
    // beschriftete leere Schublade ist schlimmer als keine (§4.3).
    const evening = seed(NUR_STERNE, [{ s1: 4 }, { s1: 5 }]);
    const wirt = await zeichne(evening.id);
    expect(wirt.innerHTML).not.toContain("var(--note-");
    expect(kennzahlen(wirt).textContent).toContain("—");
    expect(wirt.textContent).toContain(FUSSNOTE);
    expect(spuren(wirt)).toHaveLength(0);
    expect(wirt.querySelectorAll(".fb-legende-anker")).toHaveLength(0);
    expect(wirt.textContent).not.toContain("01 DER ABEND");
  });
});

describe("Auswertung — Notenspuren statt Balken (§3.2 Punkt 2)", () => {
  /** Der Standardbogen: acht Bewertungsfragen, sechs Freitextfragen. */
  const zwoelfBoegen = (note: number) =>
    Array.from({ length: 12 }, (_, i) => ({ q1: i < 6 ? note : 5, q2: 2, q9: `Text ${i + 1}` }));

  it("zeigt die Verteilung mit zwei Saeulen, wo der Mittelwert 3,0 waere", async () => {
    const evening = seed(STANDARD_QUESTIONS, zwoelfBoegen(1));
    const wirt = await zeichne(evening.id);
    const q1 = spuren(wirt)[0];
    // 6×Note 1 und 6×Note 5: zwei Saeulen, die Mitte leer.
    expect(q1.getAttribute("aria-label")).toContain("sechsmal Note 1");
    expect(q1.getAttribute("aria-label")).toContain("sechsmal Note 5");
    expect(q1.getAttribute("aria-label")).toContain("keine Note 2 bis 4");
    // Und der Mittelwert, den ein Balken gezeigt haette, steht nirgends als
    // Aussage ueber diese Frage.
    expect(q1.getAttribute("aria-label")).toContain("Durchschnitt 3,0");
  });

  it("zeigt ACHT Spuren im Sechs-Spalten-Raster und die Legende EINMAL", async () => {
    const evening = seed(STANDARD_QUESTIONS, zwoelfBoegen(2));
    const wirt = await zeichne(evening.id);
    expect(spuren(wirt)).toHaveLength(8);
    // Die Ankerzeile steht in jeder Legende genau einmal — also ist sie der Zaehler.
    expect(wirt.querySelectorAll(".fb-legende-anker")).toHaveLength(1);
    // Dasselbe Raster wie im Fragebogen: sechs Spalten, hier gross (44px Zellen).
    const html = wirt.innerHTML.replace(/\s/g, "");
    expect(html).toContain("repeat(6,1fr)");
    expect(html).toContain("height:44px");
    // Und die Zeile traegt „n=" — die Zahl, auf der die Spur beruht.
    expect(wirt.textContent).toContain("n=12");
  });

  it("gliedert mit den drei Sektions-Kickern des Fragebogens", async () => {
    const evening = seed(STANDARD_QUESTIONS, zwoelfBoegen(2));
    const t = (await zeichne(evening.id)).textContent ?? "";
    expect(t).toContain("01 DER ABEND");
    expect(t).toContain("02 ABLAUF & VORBEREITUNG");
    expect(t).toContain("03 DU UND DER ABEND");
  });

  it("laesst `stars`-Fragen aus den Spuren heraus (§4.12)", async () => {
    const evening = seed(GEMISCHT, [{ q1: 2, s1: 4 }]);
    const wirt = await zeichne(evening.id);
    expect(spuren(wirt)).toHaveLength(1);
    // Geprueft an den ZEILEN, nicht am Seitentext: der KI-Prompt zaehlt den
    // ganzen Bogen auf (auch die Alt-Frage), und das ist richtig — sie darf nur
    // keine Notenspur bekommen.
    const zeilen = [...wirt.querySelectorAll<HTMLElement>(".fb-spurzeile")].map(
      (z) => z.textContent ?? "",
    );
    expect(zeilen.some((z) => z.includes("Insgesamt?"))).toBe(true);
    expect(zeilen.some((z) => z.includes("Alt-Frage"))).toBe(false);
  });

  it("importiert `core/charts` nicht mehr — der BarChart ist weg", () => {
    const quelle = readFileSync(
      join(
        process.cwd(),
        "src/app/m/feedback/(admin)/groups/[groupId]/evenings/[eveningId]/auswertung/page.tsx",
      ),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(quelle).not.toContain("core/charts");
    expect(quelle).toContain("Notenspur");
  });
});

describe("Auswertung — Kennzahlen, Kopfzone und Leerzustand (§3.2, §4.2, §4.3)", () => {
  it("nennt Ruecklauf, Gesamtnote und Freitextzahl", async () => {
    const evening = seed(STANDARD_QUESTIONS, [
      { q1: 2, q9: "gut" },
      { q1: 2, q9: "sehr gut" },
      { q1: 2 },
    ]);
    const wirt = await zeichne(evening.id);
    const t = kennzahlen(wirt).textContent ?? "";
    expect(t).toContain("3 von 18");
    expect(t).toContain("17 %"); // 3/18 gerundet
    expect(t).toContain("2,0");
    expect(t).toContain("gut");
    // AN DER EIGENEN SPALTE: „2" stand auch in „2,0" und in „17 %" ist eine 7 —
    // die Freitextzahl war ueber den Blocktext nicht unterscheidbar.
    expect(kennzahl(wirt, "FREITEXTE")).toBe("2");
  });

  it("nennt als Nenner der Plakette die BEANTWORTETEN Bewertungsfragen", async () => {
    // Der Bogen hat acht Notenfragen, beantwortet sind drei. „Ø aus 8 Fragen"
    // stuende hier ueber einem Mittelwert aus DREI — derselbe stille
    // Rechenfehler, den §4.12 gerade beseitigt hat, nur eine Zeile weiter.
    const wenige = seed(STANDARD_QUESTIONS, [{ q1: 2, q2: 2, q3: 2 }]);
    expect(kennzahlen(await zeichne(wenige.id)).textContent).toContain("Ø aus 3 Fragen");
    // Und der volle Bogen sagt acht — der Test muss 3 von 8 unterscheiden koennen.
    const alle = seed(STANDARD_QUESTIONS, [
      { q1: 2, q2: 2, q3: 2, q4: 2, q5: 2, q6: 2, q7: 2, q8: 2 },
    ]);
    expect(kennzahlen(await zeichne(alle.id)).textContent).toContain("Ø aus 8 Fragen");
  });

  it("erfindet ohne Teilnehmerzahl keinen Nenner", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }, { q1: 2 }], { teilnehmer: null });
    const t = kennzahlen(await zeichne(evening.id)).textContent ?? "";
    expect(t).toContain("2");
    expect(t).not.toContain("von");
    expect(t).not.toContain("%");
  });

  it("warnt bei unter drei Rueckmeldungen ohne Rot und ohne Icon", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 1 }, { q1: 5 }]);
    const wirt = await zeichne(evening.id);
    expect(wirt.textContent).toContain(
      "Nur 2 Rückmeldungen — bitte nicht als Urteil über den Abend lesen.",
    );
    // 3px linke Kante in `--fb-line`, kein Alert, kein Rot (Farb-Klausel §4.9).
    expect(wirt.innerHTML.replace(/\s/g, "")).toContain("border-left:3pxsolidvar(--fb-line)");
    expect(wirt.querySelector(".ant-alert")).toBeNull();
    expect(wirt.innerHTML).not.toContain("#c8000f");
  });

  it("laesst den Hinweis ab drei Rueckmeldungen weg", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 1 }, { q1: 2 }, { q1: 3 }]);
    expect((await zeichne(evening.id)).textContent).not.toContain("bitte nicht als Urteil");
  });

  it("traegt Rueckweg, Ueberschrift und die Textknoepfe der Seite", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }]);
    const wirt = await zeichne(evening.id);

    // Rückweg (§4.1, vormals eine dreistufige Breadcrumb, seit Task 11
    // `Seitenkopf`s `zurueck`): direkt zum Cockpit der Gruppe, nicht zur Wurzel.
    const rueckweg = wirt.querySelector<HTMLElement>('[data-testid="seitenkopf-zurueck"]');
    expect(rueckweg?.textContent).toContain("Bereitschaft");
    expect(rueckweg?.getAttribute("href")).toBe("/m/feedback/groups/1");
    expect(wirt.querySelector("h1")?.textContent).toBe("Auswertung — Mi., 22.07.2026");
    expect(wirt.textContent).toContain("Bereitschaft");
    expect(wirt.textContent).toContain("Funk");

    const ziele = [...wirt.querySelectorAll<HTMLElement>("a")].map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/m/feedback/groups/1/evenings/${evening.id}/export.csv`);
    expect(ziele).toContain("/m/feedback/groups/1/trend");
  });

  it("zeigt ohne Rueckmeldung den Satz aus §4.3 — der CSV-Link bleibt", async () => {
    const evening = seed(STANDARD_QUESTIONS, []);
    const wirt = await zeichne(evening.id);
    expect(wirt.textContent).toContain("Zu diesem Abend ist keine Rückmeldung eingegangen.");
    expect(wirt.querySelector(".ant-result")).not.toBeNull();
    const ziele = [...wirt.querySelectorAll<HTMLElement>("a")].map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/m/feedback/groups/1/evenings/${evening.id}/export.csv`);
    // Keine leeren Spuren, kein leeres Achsenkreuz.
    expect(spuren(wirt)).toHaveLength(0);
  });

  it("zeigt Freitexte einspaltig als Zitatbloecke, ab vier hinter „alle … anzeigen“", async () => {
    const antworten = Array.from({ length: 7 }, (_, i) => ({ q1: 2, q9: `Antwort ${i + 1}` }));
    const evening = seed(STANDARD_QUESTIONS, antworten);
    const wirt = await zeichne(evening.id);
    expect(wirt.textContent).toContain("Was hat dir am besten gefallen?");
    expect(wirt.textContent).toContain("alle 7 anzeigen");
    // 2px linke Kante `--fb-split` am Zitat (§3.2 Punkt 3).
    expect(wirt.innerHTML.replace(/\s/g, "")).toContain("border-left:2pxsolidvar(--fb-split)");
  });
});

describe("Auswertung — der KI-Prompt ist ein Abschnitt DIESER Seite (§3.2 Punkt 4)", () => {
  it("traegt den Prompt aufklappbar mit Kopierknopf", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }]);
    const wirt = await zeichne(evening.id);
    expect(wirt.textContent).toContain("KI-PROMPT");
    expect(wirt.querySelector("textarea")).not.toBeNull();
    expect(wirt.textContent).toContain("Kopieren");
    // Der Prompt selbst — gebaut aus DIESEM Abend, nicht behauptet.
    expect(wirt.querySelector("textarea")?.textContent).toContain("Bereitschaft");
  });

  it("haelt den Prompt zurueck, solange die Umfrage laeuft", async () => {
    const evening = seed(NUR_SCHULNOTE, [{ q1: 2 }], { status: "active" });
    const wirt = await zeichne(evening.id);
    expect(wirt.textContent).toContain(
      "Die Umfrage ist noch aktiv. Der KI-Prompt steht zur Verfügung, sobald sie geschlossen wurde.",
    );
    expect(wirt.querySelector("textarea")).toBeNull();
  });

  /**
   * DIE DURCHMISCHUNG GILT AUCH IM PROMPT (§3.9 Punkt 2).
   *
   * Der Abschnitt „Einzelne Rueckmeldungen (Rohdaten)" ist von allen Ausgaben die
   * gefaehrlichste: er bildet je Person EINEN Block mit allen Noten UND allen
   * Freitexten. Steht dieser Block in der Datenbankordnung, ist „Rueckmeldung 1"
   * die Person, die als erste abgegeben hat — bei ~15 Personen ein
   * Deanonymisierungskanal. `computeDAStats` durchmischt (deshalb ist der
   * Sammel-Abschnitt in Ordnung), `listResponses` nicht: die Durchmischung ist
   * Sache des LESERS, und der CSV-Export haelt sie ein.
   *
   * Das lange Anonymitaetssiegel des Bogens sagte diese Ordnung ausdruecklich zu
   * („die Texte in ZUFAELLIGER REIHENFOLGE"). Es ist entfallen — die kurze Zusage
   * behauptet nur noch, was gespeichert wird. Die Zusicherung bleibt damit
   * verbindlich, obwohl kein Text im Bogen mehr auf sie zeigt: §3.9 Punkt 2 gilt
   * unabhaengig vom Wortlaut, und DIESER Test ist die Stelle, die es festhaelt.
   */
  it("mischt die Rohdaten-Bloecke — „Rueckmeldung 1“ ist nicht die erste Abgabe", async () => {
    const antworten = Array.from({ length: 6 }, (_, i) => ({
      q1: ((i % 5) + 1) as number,
      q9: `Freitext ${i + 1}`,
    }));
    const evening = seed(STANDARD_QUESTIONS, antworten);
    const wirt = await zeichne(evening.id);
    const prompt = wirt.querySelector("textarea")?.textContent ?? "";

    const rohteil = prompt.slice(prompt.indexOf("## Einzelne Rückmeldungen (Rohdaten)"));
    expect(rohteil).not.toBe("");
    const gelesen = [...rohteil.matchAll(/Freitext (\d)/g)].map((m) => Number(m[1]));

    const erwartet = shuffleStable(antworten, (a) => JSON.stringify(a)).map((a) =>
      Number(String(a.q9).replace("Freitext ", "")),
    );
    // Der Pruefstand muss die beiden Ordnungen ueberhaupt unterscheiden koennen —
    // waere die Durchmischung fuer diese Eingabe die Identitaet, wuerde der Test
    // auch den Defekt bestehen.
    expect(erwartet).not.toEqual([1, 2, 3, 4, 5, 6]);
    expect(gelesen).toEqual(erwartet);
  });

  it("hat die alte Prompt-Route nicht mehr", () => {
    expect(
      existsSync(
        join(
          process.cwd(),
          "src/app/m/feedback/(admin)/groups/[groupId]/evenings/[eveningId]/prompt/page.tsx",
        ),
      ),
    ).toBe(false);
  });
});
