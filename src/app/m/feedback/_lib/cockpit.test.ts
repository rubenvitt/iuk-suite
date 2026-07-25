import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../_db/schema";
import {
  insertGroup,
  insertEvening,
  insertSurvey,
  setSurveyStatus,
  insertResponse,
} from "../_db/queries";
import { computeClosesAt } from "./lifecycle";
import { STANDARD_QUESTIONS } from "./questions";
import { cockpitZustand, type Belegung } from "./cockpit";

/**
 * DER ZUSTANDS-SELEKTOR (Entwurf §2.2). Diese Datei ist der Grund, warum in der
 * Lagekarte kein `if` mehr steht: EINE Stelle entscheidet vor dem Rendern,
 * welche der fuenf Belegungen gilt, und sie ist TOTAL — es gibt keine Eingabe,
 * bei der die einzige Arbeitsseite des Moduls „nichts" zeigt.
 *
 * Vier Zusagen, die still brechen wuerden:
 *
 * 1. Eine abgelaufene, noch nicht persistierte Umfrage ist NICHT „laufend".
 *    `activeSurveyForGroup` filtert in SQL auf `status='active'` und weiss
 *    nichts von der Frist; ohne das Falten mit `nextStatusOnAccess` behauptet
 *    die Karte einen Live-Zaehler fuer eine tote Umfrage.
 * 2. Bei zwei aktiven Umfragen gilt die mit dem juengsten `activatedAt` —
 *    `activeSurveyForGroup` nutzt `.get()` und liefert stumm eine beliebige.
 * 3. Ein Altbestands-Entwurf kapert die Fuehrung der Seite NICHT (Belegung E
 *    ist bewusst kein Kartenzustand): er lebt nur als Verlaufszeile.
 * 4. „Letzter Abend" erscheint AUCH waehrend eine Umfrage laeuft (§2.7).
 */

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
});
afterEach(() => sqlite.close());

const NOW = new Date("2026-07-24T19:30:00Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

const mkGroup = (slug = "g") =>
  insertGroup(db, { name: slug, slug, secret: "abc12", closeAfterHours: null, createdAt: NOW });

function mkAbend(
  groupId: number,
  datum: string,
  opts: {
    status?: "draft" | "active" | "closed" | "archived";
    hours?: number;
    antworten?: number;
    teilnehmer?: number | null;
    activatedAt?: Date;
  } = {},
) {
  const date = tag(datum);
  const evening = insertEvening(db, {
    groupId,
    date,
    topic: `Thema ${datum}`,
    notes: null,
    participantCount: opts.teilnehmer ?? 20,
    createdAt: NOW,
  });
  if (!opts.status) return { evening, survey: null };
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: opts.hours ?? 240,
    createdAt: NOW,
  });
  if (opts.status === "active") {
    // Frist AUSSCHLIESSLICH ueber computeClosesAt(evening.date, hours) — nie
    // „jetzt + Stunden", sonst haengt der Test an seiner Laufzeit.
    //
    // Bewusst `setSurveyStatus` und NICHT `activateSurvey`: letzteres schliesst
    // aktive Geschwister mit und koennte den Zustand „zwei aktive Umfragen" gar
    // nicht herstellen — genau den, den der Selektor entscheiden muss. Dass er
    // ueberhaupt entstehen kann, liegt an `setSurveyStatus` ohne
    // Uebergangs-Pruefung (§2.2).
    setSurveyStatus(db, survey.id, "active", {
      activatedAt: opts.activatedAt ?? NOW,
      closesAt: computeClosesAt(date, opts.hours ?? 240),
      closedAt: null,
    });
  } else if (opts.status !== "draft") {
    setSurveyStatus(db, survey.id, opts.status, { closedAt: NOW });
  }
  for (let i = 0; i < (opts.antworten ?? 0); i++) {
    insertResponse(db, survey.id, { q1: 2 }, NOW);
  }
  return { evening, survey };
}

describe("cockpitZustand — die fuenf Belegungen", () => {
  it("A Erststart: keine Abende → Betriebsart Einrichtung, nichts laeuft", () => {
    const g = mkGroup();
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("A");
    expect(z.modus).toBe("einrichtung");
    expect(z.laufend).toBeNull();
    expect(z.verlauf).toEqual([]);
    expect(z.letzterAbend).toBeNull();
    expect(z.altbestand).toEqual([]);
    expect(z.letzteTeilnehmerzahl).toBeNull();
  });

  it("B Ruhend: Abende da, nichts laeuft", () => {
    const g = mkGroup();
    mkAbend(g.id, "2026-07-15", { status: "closed", antworten: 3 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("B");
    expect(z.modus).toBe("betrieb");
    expect(z.laufend).toBeNull();
    expect(z.verlauf).toHaveLength(1);
  });

  it("C Laeuft mit 0 Antworten", () => {
    const g = mkGroup();
    const { evening } = mkAbend(g.id, "2026-07-22", { status: "active", antworten: 0 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("C");
    expect(z.laufend?.evening.id).toBe(evening.id);
    expect(z.laufend?.responseCount).toBe(0);
    // Der laufende Abend steht NICHT zusaetzlich im Verlauf.
    expect(z.verlauf.map((x) => x.evening.id)).not.toContain(evening.id);
  });

  it("D Laeuft mit Antworten", () => {
    const g = mkGroup();
    mkAbend(g.id, "2026-07-22", { status: "active", antworten: 12, teilnehmer: 20 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("D");
    expect(z.laufend?.responseCount).toBe(12);
    expect(z.laufend?.evening.participantCount).toBe(20);
    expect(z.laufend?.survey.closesAt).toEqual(computeClosesAt(tag("2026-07-22"), 240));
  });

  it("E Altbestands-Entwurf: die Karte bleibt in B, der Entwurf lebt nur im Verlauf", () => {
    const g = mkGroup();
    const alt = mkAbend(g.id, "2026-05-06", { status: "draft" });
    mkAbend(g.id, "2026-07-15", { status: "closed", antworten: 2 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("B");
    expect(z.altbestand.map((x) => x.evening.id)).toEqual([alt.evening.id]);
    expect(z.laufend).toBeNull();
    // Ein Entwurf ist NIE „letzter Abend" — sonst kaeme eine Auswertung ohne Daten.
    expect(z.letzterAbend?.evening.id).not.toBe(alt.evening.id);
  });
});

describe("cockpitZustand — Totalitaet", () => {
  /**
   * KEIN sechster Fall: die Belegung entsteht aus einem Ausdruck ohne
   * Auffangzweig. Der Test faehrt das Kreuzprodukt aus „Abendlage" x
   * „Umfragelage" ab und verlangt fuer JEDE Kombination eine Belegung aus A–D
   * plus genau die Belegung, die §2.2 dafuer nennt.
   */
  const lagen: {
    name: string;
    bauen: (groupId: number) => void;
    erwartet: Belegung;
  }[] = [
    { name: "leer", bauen: () => {}, erwartet: "A" },
    {
      name: "nur Abend ohne Umfrage",
      bauen: (id) => void mkAbend(id, "2026-07-01"),
      erwartet: "B",
    },
    {
      name: "nur Entwurf",
      bauen: (id) => void mkAbend(id, "2026-07-01", { status: "draft" }),
      erwartet: "B",
    },
    {
      name: "nur archiviert",
      bauen: (id) => void mkAbend(id, "2026-07-01", { status: "archived", antworten: 1 }),
      erwartet: "B",
    },
    {
      name: "aktiv, Frist verstrichen",
      bauen: (id) => void mkAbend(id, "2026-06-01", { status: "active", hours: 24 }),
      erwartet: "B",
    },
    {
      name: "aktiv ohne Antworten",
      bauen: (id) => void mkAbend(id, "2026-07-22", { status: "active" }),
      erwartet: "C",
    },
    {
      name: "aktiv mit Antworten",
      bauen: (id) => void mkAbend(id, "2026-07-22", { status: "active", antworten: 1 }),
      erwartet: "D",
    },
    {
      name: "aktiv mit Antworten plus Entwurf plus geschlossen",
      bauen: (id) => {
        mkAbend(id, "2026-05-06", { status: "draft" });
        mkAbend(id, "2026-06-10", { status: "closed", antworten: 4 });
        mkAbend(id, "2026-07-22", { status: "active", antworten: 1 });
      },
      erwartet: "D",
    },
    {
      name: "Abend ohne Teilnehmerzahl, aktiv mit Antworten",
      bauen: (id) =>
        void mkAbend(id, "2026-07-22", { status: "active", antworten: 5, teilnehmer: null }),
      erwartet: "D",
    },
  ];

  it.each(lagen)("$name → Belegung $erwartet", ({ bauen, erwartet }) => {
    const g = mkGroup();
    bauen(g.id);
    const z = cockpitZustand(db, g.id, NOW);
    expect(["A", "B", "C", "D"]).toContain(z.belegung);
    expect(z.belegung).toBe(erwartet);
  });

  it("eine Gruppe ohne jede Zeile liefert eine Belegung, keinen Absturz", () => {
    const z = cockpitZustand(db, 4711, NOW);
    expect(z.belegung).toBe("A");
    expect(z.modus).toBe("einrichtung");
  });
});

describe("cockpitZustand — Falten, Reihenfolge, Nebenlagen", () => {
  it("faltet eine abgelaufene aktive Umfrage nach RUHEND, ohne zu schreiben", () => {
    const g = mkGroup();
    const { survey } = mkAbend(g.id, "2026-06-01", {
      status: "active",
      hours: 24,
      antworten: 5,
    });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("B");
    expect(z.laufend).toBeNull();
    // Rein lesend (prefetch-sicher): der Status in der DB bleibt `active`.
    const roh = sqlite
      .prepare("SELECT status FROM surveys WHERE id = ?")
      .get(survey!.id) as { status: string };
    expect(roh.status).toBe("active");
    // Und der Abend ist als „letzter Abend" lesbar.
    expect(z.letzterAbend?.evening.id).toBe(z.verlauf[0]?.evening.id);
  });

  it("zeigt den letzten ausgewerteten Abend AUCH waehrend eine Umfrage laeuft (§2.7)", () => {
    const g = mkGroup();
    const alt = mkAbend(g.id, "2026-07-15", { status: "closed", antworten: 14 });
    mkAbend(g.id, "2026-07-22", { status: "active", antworten: 3 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.belegung).toBe("D");
    expect(z.letzterAbend?.evening.id).toBe(alt.evening.id);
    expect(z.letzterAbend?.responseCount).toBe(14);
  });

  it("ein geschlossener Abend ohne Rueckmeldung ist kein „letzter Abend“", () => {
    const g = mkGroup();
    mkAbend(g.id, "2026-07-15", { status: "closed", antworten: 0 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.letzterAbend).toBeNull();
  });

  it("bei zwei aktiven Umfragen gilt die mit dem juengsten activatedAt", () => {
    const g = mkGroup();
    const alt = mkAbend(g.id, "2026-07-15", {
      status: "active",
      activatedAt: new Date("2026-07-15T19:00:00Z"),
      antworten: 2,
    });
    const neu = mkAbend(g.id, "2026-07-22", {
      status: "active",
      activatedAt: new Date("2026-07-22T19:00:00Z"),
      antworten: 1,
    });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.laufend?.evening.id).toBe(neu.evening.id);
    expect(z.weitereAktive.map((x) => x.evening.id)).toEqual([alt.evening.id]);
  });

  it("sortiert selbst nach Datum absteigend, statt der DB-Ordnung zu vertrauen", () => {
    const g = mkGroup();
    const a = mkAbend(g.id, "2026-07-01", { status: "closed", antworten: 1 });
    const c = mkAbend(g.id, "2026-07-20", { status: "closed", antworten: 1 });
    const b = mkAbend(g.id, "2026-07-10", { status: "closed", antworten: 1 });
    const z = cockpitZustand(db, g.id, NOW);

    expect(z.verlauf.map((x) => x.evening.id)).toEqual([c.evening.id, b.evening.id, a.evening.id]);
  });

  it("Teilnehmerzahl-Vorbelegung kommt vom juengsten Abend", () => {
    const g = mkGroup();
    mkAbend(g.id, "2026-07-01", { status: "closed", teilnehmer: 9, antworten: 1 });
    mkAbend(g.id, "2026-07-20", { status: "closed", teilnehmer: 17, antworten: 1 });
    expect(cockpitZustand(db, g.id, NOW).letzteTeilnehmerzahl).toBe(17);
  });

  it("trennt Gruppen: die Lage einer anderen Gruppe faerbt nicht ab", () => {
    const a = mkGroup("a");
    const b = mkGroup("b");
    mkAbend(a.id, "2026-07-22", { status: "active", antworten: 4 });
    const z = cockpitZustand(db, b.id, NOW);

    expect(z.belegung).toBe("A");
    expect(z.laufend).toBeNull();
  });
});
