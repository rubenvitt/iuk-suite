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
 * DIE TRENDKURVE LIEST `avgSchulnote` (§4.12) UND SAGT ES, WO SIE MUSS.
 *
 * `computeGroupTrend` ist unter `_lib/aggregation.test.ts` gepruefte reine
 * Rechnung — hier geht es um den zweiten Teil derselben Zusage: dass die Seite
 * den richtigen Wert auch ANZEIGT (Notenpille, also Ziffer, Wort UND Farbe) und
 * dass eine Zeile mit Altbestands-Fragen die Fussnote traegt. Ohne diesen Test
 * kann `TrendPoint.hasLegacyScale` genauso leserlos bleiben, wie es
 * `avgSchulnote` war.
 */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));

vi.mock("@/app/m/feedback/_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): die Gruppe wurde nicht geladen");
  },
  // `MonatsSegment` (Client-Insel) liest beide Haken: `useRouter` wirft ausserhalb
  // des `AppRouterContext`, `usePathname` gibt es dort ebenfalls nicht. Geprueft
  // wird hier, WAS der Server rechnet — nicht was Next aus einem Klick macht.
  useRouter: () => ({ replace: () => {} }),
  usePathname: () => "/m/feedback/groups/1/trend",
}));
/*
 * KEIN Diagramm-Mock mehr: `_ui/NotenVerlauf.tsx` braucht keinen `theme.useToken()`
 * (die Farben sind `--fb-*` / `--note-*` aus `feedback.css`), und rechartss
 * `ResponsiveContainer` rendert unter jsdom ohnehin nichts — der Richtungshinweis
 * „1 OBEN = BESSER" liegt bewusst als eigenes Markup daneben und ist damit
 * pruefbar. Ein Mock haette genau die Zusage verdeckt, um die es in §5.3 geht.
 */
import TrendPage from "./page";

const GEMISCHT: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "s1", type: "stars", text: "Alt-Frage" },
];
const NUR_SCHULNOTE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];

/**
 * Mitternacht UTC des HEUTIGEN UTC-Tages — evenings.date ist immer Mitternacht
 * UTC, und das Fenster der Seite ist „letzte 12 Monate bis jetzt". Ein fest
 * verdrahtetes Datum waere eine Zeitbombe.
 */
function heuteUtc(): Date {
  const j = new Date();
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()));
}
const monatsLabel = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

function abend(fragen: Question[], antworten: Record<string, unknown>[]) {
  const datum = heuteUtc();
  const evening = insertEvening(db, {
    groupId: 1,
    date: datum,
    topic: "Funk",
    notes: null,
    participantCount: 20,
    createdAt: datum,
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(fragen),
    closeAfterHours: 48,
    createdAt: datum,
  });
  antworten.forEach((a) => insertResponse(db, survey.id, a, datum));
  return evening;
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  insertGroup(db, {
    name: "Bereitschaft",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  guardPageMock.mockReset();
  guardPageMock.mockResolvedValue({ viewer: { sub: "u1" }, db });
});
afterEach(() => sqlite.close());

async function zeichne(monate?: string): Promise<HTMLElement> {
  const element = await TrendPage({
    params: Promise.resolve({ groupId: "1" }),
    searchParams: Promise.resolve(monate === undefined ? {} : { monate }),
  });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

/** Die Zeile des laufenden Monats — die einzige belegte im Fenster. */
async function zeile(): Promise<HTMLElement> {
  const label = monatsLabel(heuteUtc());
  const treffer = [...(await zeichne()).querySelectorAll<HTMLElement>("li")].find((li) =>
    (li.textContent ?? "").includes(label),
  );
  expect(treffer).toBeDefined();
  return treffer!;
}

const FUSSNOTE = "enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet";

describe("Trend — Monatszeilen tragen die Schulnote, nicht den Mischwert", () => {
  it("faerbt nach avgSchulnote (1,0 sehr gut), nicht nach overallAvg (3,0 befriedigend)", async () => {
    abend(GEMISCHT, [
      { q1: 1, s1: 5 },
      { q1: 1, s1: 5 },
    ]);
    const wirt = await zeichne();
    expect(wirt.innerHTML).toContain("var(--note-1)");
    expect(wirt.innerHTML).not.toContain("var(--note-3)");
    expect((await zeile()).textContent).toContain("1,0");
    expect((await zeile()).textContent).toContain("sehr gut");
  });

  it("traegt an der Zeile mit Altbestands-Fragen die Fussnote aus §4.12", async () => {
    abend(GEMISCHT, [{ q1: 2, s1: 4 }]);
    expect((await zeile()).textContent).toContain(FUSSNOTE);
  });

  it("haengt die Fussnote nicht an Zeilen ohne Altbestand", async () => {
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    const wirt = await zeichne();
    expect(wirt.textContent).not.toContain(FUSSNOTE);
    expect(wirt.innerHTML).toContain("var(--note-2)");
  });

  it("nennt die Richtung der Skala in der Kopfzone (1 = beste)", async () => {
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeichne()).textContent).toContain("Ø Note (1 = beste)");
  });

  it("zeigt einen Monat ohne Schulnote als „—“ — und zaehlt die Rueckmeldungen trotzdem", async () => {
    abend([{ id: "s1", type: "stars", text: "Alt-Frage" }], [{ s1: 4 }, { s1: 5 }]);
    // KEINE Notenfarbe — und diese Zusage traegt der Test, nicht das „—":
    // der Gedankenstrich steht auch in der Fussnote, ein `toContain("—")` allein
    // bestuende also auch eine Pille aus `overallAvg` (4,5 → „mangelhaft").
    expect((await zeichne()).innerHTML).not.toContain("var(--note-");
    const text = (await zeile()).textContent ?? "";
    expect(text).toContain("—");
    expect(text).toContain("2 Rückmeldungen");
    expect(text).toContain(FUSSNOTE);
  });
});

/**
 * DAS DIAGRAMM IST MODUL-LOKAL (§3.3, §5.3).
 *
 * Bis hierher zeichnete die Seite Noten mit `core/charts/LineChart` — also in
 * `token.colorPrimary` (Suite-Rot, Farb-Klausel §4.9) und auf einer NICHT
 * umgekehrten Achse. Eine 6 stand damit hoeher als eine 1: ein Sachfehler, kein
 * Geschmacksfehler. Diese Zusage haengt an zwei Belegen — der Beschriftung im
 * Bild und dem fehlenden Import.
 */
describe("Trend — die Kurve laeuft ueber `_ui/NotenVerlauf`, nicht ueber `core/charts`", () => {
  /** Ein Abend in einem FRUEHEREN Monat — zwei Punkte sind das Minimum (§4.3). */
  function abendImVormonat() {
    const h = heuteUtc();
    const datum = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 15));
    const evening = insertEvening(db, {
      groupId: 1,
      date: datum,
      topic: "Vormonat",
      notes: null,
      participantCount: 20,
      createdAt: datum,
    });
    const survey = insertSurvey(db, {
      eveningId: evening.id,
      questions: JSON.stringify(NUR_SCHULNOTE),
      closeAfterHours: 48,
      createdAt: datum,
    });
    insertResponse(db, survey.id, { q1: 4 }, datum);
  }

  it("sagt die Richtung im Bild: „1 OBEN = BESSER“", async () => {
    abendImVormonat();
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeichne()).textContent).toContain("1 OBEN = BESSER");
  });

  it("zeigt unter zwei Punkten den Satz aus §4.3 statt eines leeren Achsenkreuzes", async () => {
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    expect((await zeichne()).textContent).toContain(
      "Weniger als zwei ausgewertete Abende — für einen Verlauf zu früh.",
    );
  });

  it("importiert `core/charts` nicht mehr", () => {
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/feedback/(admin)/groups/[groupId]/trend/page.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(quelle).not.toContain("core/charts");
    // Der Weg geht seit §3.3 ueber die Client-Insel `_ui/TrendDiagramm`, die
    // `_ui/NotenVerlauf` traegt — die Umschalter brauchen Zustand.
    expect(quelle).toContain("_ui/TrendDiagramm");
  });
});

/**
 * KOPFZONE, ZEITFENSTER UND DER WEG ZURUECK (§3.3, §4.1, §4.2).
 *
 * Die Seite war per URL-Eingabe erreichbar und danach eine Sackgasse: kein
 * Rückweg, kein Zeitfenster, kein CSV. Alle drei haengen an dieser Kopfzone.
 */
describe("Trend — Kopfzone, Zeitfenster, Rueckweg", () => {
  /** Ein Abend `zurueck` Monate in der Vergangenheit, mit einer Note. */
  function abendVorMonaten(zurueck: number, note: number) {
    const h = heuteUtc();
    const datum = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - zurueck, 15));
    const evening = insertEvening(db, {
      groupId: 1,
      date: datum,
      topic: "Alt",
      notes: null,
      participantCount: 20,
      createdAt: datum,
    });
    const survey = insertSurvey(db, {
      eveningId: evening.id,
      questions: JSON.stringify(NUR_SCHULNOTE),
      closeAfterHours: 48,
      createdAt: datum,
    });
    insertResponse(db, survey.id, { q1: note }, datum);
    return datum;
  }

  it("traegt Rueckweg zum Cockpit und den CSV-Knopf", async () => {
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    const wirt = await zeichne();
    // Rückweg (§4.1, vormals eine Breadcrumb, seit Task 11 `Seitenkopf`s
    // `zurueck`): direkt zum Cockpit der Gruppe, nicht zur Wurzel.
    const rueckweg = wirt.querySelector<HTMLElement>('[data-testid="seitenkopf-zurueck"]');
    expect(rueckweg?.textContent).toContain("Bereitschaft");
    expect(rueckweg?.getAttribute("href")).toBe("/m/feedback/groups/1");
    const ziele = [...wirt.querySelectorAll<HTMLElement>("a")].map((a) => a.getAttribute("href"));
    expect(ziele).toContain("/m/feedback/groups/1/export.csv");
  });

  it("bietet die drei Zeitfenster aus §3.3 an", async () => {
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    const t = (await zeichne()).textContent ?? "";
    expect(t).toContain("6 Monate");
    expect(t).toContain("12 Monate");
    expect(t).toContain("24 Monate");
  });

  it("laesst `?monate=` das Fenster wirklich aendern — nicht nur die Beschriftung", async () => {
    // Ein Abend vor 18 Monaten: im Zwoelfer-Fenster gibt es seinen Monat nicht,
    // im Vierundzwanziger schon.
    const datum = abendVorMonaten(18, 3);
    const label = monatsLabel(datum);
    expect((await zeichne("12")).textContent).not.toContain(label);
    expect((await zeichne("24")).textContent).toContain(label);
    expect((await zeichne("24")).textContent).toContain("letzte 24 Monate");
  });

  it("faellt bei fremden Werten auf zwoelf Monate zurueck, ohne Fehlermeldung", async () => {
    abend(NUR_SCHULNOTE, [{ q1: 2 }]);
    for (const roh of ["9999", "0", "abc", "-6"]) {
      const t = (await zeichne(roh)).textContent ?? "";
      expect(t).toContain("letzte 12 Monate");
    }
  });
});

/**
 * DIE ZUSCHALTBAREN FRAGEN AUF DEM SCREEN (§3.3: „Nur die
 * Gesamtdurchschnittslinie ist Vorgabe; einzelne Fragen sind zuschaltbar, maximal
 * drei gleichzeitig, gestrichelt und direkt beschriftet").
 *
 * Vorher trug die Seite nur `<NotenVerlauf punkte={…} />` — es gab kein
 * Bedienelement fuer eine einzelne Frage. Geprueft wird hier die VERDRAHTUNG: dass
 * die Fragen des Bogens als Schalter auf der Seite ankommen, mit ihrem Text, und
 * dass `stars` draussen bleibt (§4.12). Das Verhalten des Umschalters liegt in
 * `_ui/TrendDiagramm.test.tsx`.
 */
describe("Trend — die Fragekurven sind zuschaltbar (§3.3)", () => {
  it("traegt je Schulnotenfrage einen Schalter mit dem Fragetext", async () => {
    abend(
      [
        { id: "q1", type: "schulnote", text: "Insgesamt?" },
        { id: "q2", type: "schulnote", text: "Wie gut war alles vorbereitet?" },
      ],
      [{ q1: 2, q2: 3 }],
    );
    const wirt = await zeichne();
    const reihe = wirt.querySelector<HTMLElement>("[data-testid='trend-fragen']");

    expect(reihe).not.toBeNull();
    const beschriftungen = [...reihe!.querySelectorAll<HTMLElement>("button")].map((b) =>
      (b.textContent ?? "").trim(),
    );
    expect(beschriftungen).toEqual(["Insgesamt?", "Wie gut war alles vorbereitet?"]);
    expect(reihe!.textContent).toContain("EINZELNE FRAGEN ZUSCHALTEN (MAX. 3)");
  });

  it("laesst `stars`-Fragen aus der Schalterreihe heraus (§4.12)", async () => {
    abend(GEMISCHT, [{ q1: 2, s1: 4 }]);
    const reihe = (await zeichne()).querySelector<HTMLElement>("[data-testid='trend-fragen']")!;
    const beschriftungen = [...reihe.querySelectorAll<HTMLElement>("button")].map((b) =>
      (b.textContent ?? "").trim(),
    );
    expect(beschriftungen).toEqual(["Insgesamt?"]);
    expect(beschriftungen).not.toContain("Alt-Frage");
  });

  it("zeigt keine Schalterreihe, wo es keine Schulnotenfrage gibt (§4.3)", async () => {
    abend([{ id: "s1", type: "stars", text: "Alt-Frage" }], [{ s1: 4 }]);
    const wirt = await zeichne();
    expect(wirt.querySelectorAll("[data-testid='trend-fragen']")).toHaveLength(0);
  });
});
