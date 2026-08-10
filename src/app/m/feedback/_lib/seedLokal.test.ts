import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { seedFeedback } from "./seed";
import { seedLokalFeedback } from "./seedLokal";
import {
  listGroups,
  getGroupBySlug,
  listEvenings,
  getSurveyByEvening,
  listResponses,
  activeSurveyForGroup,
  memberGroupIdsFor,
} from "@/app/m/feedback/_db/queries";
import { computeDAStats } from "./aggregation";
import { computeClosesAt, DEFAULT_CLOSE_AFTER_HOURS } from "./lifecycle";
import { STANDARD_QUESTIONS } from "./questions";
import { parseToken } from "./token";

const NORD_SLUG = "bereitschaft-nord";
const AUSBILDUNG_SLUG = "ausbildung-san-a";
const DEV_GL = "dev:bereitschaft@localtest.me";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
});
afterEach(() => sqlite.close());

/** Alle Antworten einer Gruppe, nach Abend (neuester zuerst, wie listEvenings). */
function abendeMitAntworten(groupId: number) {
  return listEvenings(db, groupId).map((abend) => {
    const umfrage = getSurveyByEvening(db, abend.id)!;
    return { abend, umfrage, antworten: listResponses(db, umfrage.id) };
  });
}

describe("seedLokalFeedback", () => {
  it("legt zwei Gruppen an und ist idempotent", async () => {
    await seedLokalFeedback(db);
    const nachErstemLauf = listGroups(db);
    expect(nachErstemLauf).toHaveLength(2);

    const antwortenVorher = nachErstemLauf.flatMap((g) =>
      abendeMitAntworten(g.id).map((a) => a.antworten.length),
    );

    await seedLokalFeedback(db);
    expect(listGroups(db)).toHaveLength(2);
    const antwortenNachher = listGroups(db).flatMap((g) =>
      abendeMitAntworten(g.id).map((a) => a.antworten.length),
    );
    // Nicht nur die Gruppenzahl: ein Gate nur auf `groups` ließe Abende und
    // Antworten beim zweiten Lauf still ein zweites Mal entstehen.
    expect(antwortenNachher).toEqual(antwortenVorher);
    expect(
      listGroups(db).flatMap((g) => listEvenings(db, g.id)).length,
    ).toBe(8);
  });

  it("ergänzt den Boot-Seed, ohne dessen Gruppen oder Zuordnung zu berühren", async () => {
    await seedFeedback(db);
    await seedLokalFeedback(db);

    expect(listGroups(db)).toHaveLength(4);
    const demo = getGroupBySlug(db, "demo")!;
    const jugend = getGroupBySlug(db, "jugend")!;
    expect(demo.secret).toBe("demo1");
    expect(jugend.secret).toBe("jgnd1");
    // Der Dev-Link `/f/demo-demo1` bleibt gültig.
    expect(parseToken("demo-demo1")).toEqual({ slug: "demo", secret: "demo1" });

    // Der bestehende Gruppenleiter sieht WEITERHIN nur "Demo Jugend" — der
    // lokale Seed hängt seine Gruppen an einen eigenen sub.
    expect(memberGroupIdsFor(db, "dev:gl@localtest.me", [])).toEqual([jugend.id]);
  });

  it("ordnet beide neuen Gruppen einem eigenen Dev-Gruppenleiter zu", async () => {
    await seedLokalFeedback(db);
    const nord = getGroupBySlug(db, NORD_SLUG)!;
    const ausbildung = getGroupBySlug(db, AUSBILDUNG_SLUG)!;

    expect(memberGroupIdsFor(db, DEV_GL, []).sort()).toEqual([nord.id, ausbildung.id].sort());

    // Und er steht in der Namensliste der Zuordnungs-Oberfläche.
    const bekannt = db.select().from(schema.knownUsers).all();
    expect(bekannt.map((u) => u.userId)).toContain(DEV_GL);
  });

  it("hält genau eine offene Umfrage — und nur bei „Bereitschaft Nord“", async () => {
    await seedLokalFeedback(db);
    const nord = getGroupBySlug(db, NORD_SLUG)!;
    const ausbildung = getGroupBySlug(db, AUSBILDUNG_SLUG)!;

    const offen = activeSurveyForGroup(db, nord.id);
    expect(offen).toBeTruthy();
    // Der offene Bogen gehört zum JÜNGSTEN Abend der Gruppe.
    expect(offen!.evening.id).toBe(listEvenings(db, nord.id)[0].id);

    // Die Ausbildungsgruppe hat bewusst KEINE offene Umfrage — der Zustand, in
    // dem das Cockpit "Feedback starten" anbietet.
    expect(activeSurveyForGroup(db, ausbildung.id)).toBeUndefined();

    const statuus = abendeMitAntworten(nord.id).map((a) => a.umfrage.status);
    expect(statuus.filter((s) => s === "active")).toHaveLength(1);
    expect(statuus.filter((s) => s === "closed")).toHaveLength(4);
  });

  /**
   * DERSELBE FRIST-DEFEKT, den `seed.test.ts` für den Boot-Seed festhält: die
   * Frist hängt am ABENDTAG, nicht an der Uhrzeit des Seed-Laufs. Hier gilt er
   * pro Abend, nicht nur einmal — und für die geschlossenen Bögen zusätzlich,
   * dass `closedAt` nicht die Seed-Zeit ist (sonst behauptete jede vergangene
   * Umfrage, sie sei heute geschlossen worden).
   */
  it("setzt Fristen aus dem Abenddatum und schließt die Historie in der Vergangenheit", async () => {
    const vorLauf = new Date();
    await seedLokalFeedback(db);
    const nord = getGroupBySlug(db, NORD_SLUG)!;

    for (const { abend, umfrage } of abendeMitAntworten(nord.id)) {
      expect(umfrage.closesAt).toEqual(
        computeClosesAt(abend.date, DEFAULT_CLOSE_AFTER_HOURS),
      );
      // Reines Kalenderdatum: Mitternacht UTC, kein Zeitanteil.
      expect(abend.date.getTime() % 86_400_000).toBe(0);

      if (umfrage.status === "closed") {
        expect(umfrage.closedAt).toBeTruthy();
        expect(umfrage.closedAt!.getTime()).toBeLessThan(vorLauf.getTime());
      } else {
        // Der offene Bogen ist noch nicht abgelaufen, sonst zeigte /f/… sofort
        // „geschlossen" und der Dev-Link wäre wertlos.
        expect(umfrage.closesAt!.getTime()).toBeGreaterThan(vorLauf.getTime());
      }
    }
  });

  it("liefert je Umfrage mindestens acht Antworten mit echter Streuung", async () => {
    await seedLokalFeedback(db);

    for (const gruppe of listGroups(db)) {
      for (const { abend, umfrage, antworten } of abendeMitAntworten(gruppe.id)) {
        expect(antworten.length, `Umfrage ${umfrage.id} hat zu wenige Antworten`).toBeGreaterThanOrEqual(8);

        // Die einzige Invariante, die die Profile tragen und sonst niemand
        // prüft: mehr Bögen als Anwesende ergäbe im Cockpit eine Rücklaufquote
        // über 100 % — sichtbar falsch, aber ohne Fehlermeldung.
        expect(
          abend.participantCount!,
          `Abend ${abend.id}: weniger Teilnehmer als Antworten`,
        ).toBeGreaterThanOrEqual(antworten.length);

        const roh = antworten.map((a) => JSON.parse(a.answers) as Record<string, unknown>);
        const stats = computeDAStats(STANDARD_QUESTIONS, roh);

        expect(stats.avgSchulnote).not.toBeNull();
        // Alle acht Notenfragen sind von allen beantwortet — keine Lücke, die
        // eine leere Spur ergäbe.
        for (const q of stats.perQuestion.filter((p) => p.type === "schulnote")) {
          expect(q.count).toBe(antworten.length);
          expect(q.avg).not.toBeNull();
        }

        // ECHTE VERTEILUNG statt eines Balkens: mindestens drei verschiedene
        // Noten auf der ersten Frage.
        const notenQ1 = new Set(roh.map((r) => r.q1));
        expect(notenQ1.size, `q1 der Umfrage ${umfrage.id} ist einwertig`).toBeGreaterThanOrEqual(3);

        // Freitexte: einige Nennungen, aber bewusst nicht überall.
        const mitText = stats.texts.filter((t) => t.values.length > 0);
        const ohneText = stats.texts.filter((t) => t.values.length === 0);
        expect(mitText.length).toBeGreaterThanOrEqual(3);
        expect(ohneText.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  /**
   * Der Zweck der Historie: die Trendlinie muss eine RICHTUNG zeigen. Über die
   * fünf Abende von „Bereitschaft Nord" verbessert sich die Schulnote (kleinere
   * Zahl = besser). Ohne diese Zusicherung wäre der Verlauf lokal wieder
   * bedeutungsloses Rauschen.
   */
  it("zeigt über die Abende von „Bereitschaft Nord“ einen Trend", async () => {
    await seedLokalFeedback(db);
    const nord = getGroupBySlug(db, NORD_SLUG)!;

    // listEvenings: neuester zuerst — umgedreht ist es die Chronologie.
    const chronologisch = abendeMitAntworten(nord.id).reverse();
    expect(chronologisch).toHaveLength(5);

    const schnitte = chronologisch.map(({ antworten }) => {
      const roh = antworten.map((a) => JSON.parse(a.answers) as Record<string, unknown>);
      return computeDAStats(STANDARD_QUESTIONS, roh).avgSchulnote!;
    });

    expect(schnitte[0]).toBeGreaterThan(schnitte[schnitte.length - 1] + 0.8);
    // Und die Abende liegen wirklich auseinander (Trendfenster 6/12/24 Monate).
    const [aeltester] = chronologisch;
    const juengster = chronologisch[chronologisch.length - 1];
    const tage =
      (juengster.abend.date.getTime() - aeltester.abend.date.getTime()) / 86_400_000;
    expect(tage).toBeGreaterThanOrEqual(120);
    expect(tage).toBeLessThanOrEqual(180);
  });

  /**
   * E2E-SCHUTZ: `e2e/feedback.spec.ts` sucht Gruppenkarten über eine Überschrift
   * mit `exact: true` und legt eigene Gruppen mit `E2E …`-Namen an. Kein Name
   * hier darf einen davon exakt treffen, und kein slug darf kollidieren.
   */
  it("kollidiert mit keinem Namen oder slug der E2E-Tests", async () => {
    await seedFeedback(db);
    await seedLokalFeedback(db);

    const namen = listGroups(db).map((g) => g.name);
    const slugs = listGroups(db).map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const belegt of ["E2E Zweiklick", "E2E Rücklauf", "E2E Einstellungen", "E2E Mobil"]) {
      expect(namen).not.toContain(belegt);
    }
    // "Demo" und "Demo Jugend" gibt es genau einmal — aus dem Boot-Seed.
    expect(namen.filter((n) => n === "Demo")).toHaveLength(1);
    expect(namen.filter((n) => n === "Demo Jugend")).toHaveLength(1);
  });
});
