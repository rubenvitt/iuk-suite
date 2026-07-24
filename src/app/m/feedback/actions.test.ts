import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./_db/schema";
import {
  insertGroup,
  insertEvening,
  insertSurvey,
  activateSurvey,
  listResponses,
} from "./_db/queries";
import { computeClosesAt } from "./_lib/lifecycle";
import { STANDARD_QUESTIONS } from "./_lib/questions";

// Der Prüfstand: echte In-Memory-DB (der Limiter-Beweis darf nicht an gemockten
// Schreibern hängen — 15 Abgaben müssen als 15 ZEILEN nachweisbar sein), aber
// gemockte Next-Ränder. `headers()` liefert die IP, die der Test gerade spielt.
let currentIp = "203.0.113.7";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "cf-connecting-ip": currentIp }),
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("./_db/client", () => ({ getDb: () => db }));

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

/**
 * Die Limiter leben als Modul-Singletons — ohne `resetModules()` schleppt jeder
 * Test die Treffer des vorigen mit und ein grüner Lauf wäre Zufall der
 * Reihenfolge.
 */
async function loadActions() {
  vi.resetModules();
  return import("./actions");
}

/** Mitternacht UTC des heutigen Tages — so wie `evenings.date` es speichert. */
function todayMidnightUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Gruppe + Abend + aktive Umfrage; Frist ausschließlich über computeClosesAt. */
function seedActiveSurvey(slug: string, secret: string) {
  const group = insertGroup(db, {
    name: slug,
    slug,
    secret,
    closeAfterHours: null,
    createdAt: new Date(),
  });
  const eveningDate = todayMidnightUtc();
  const evening = insertEvening(db, {
    groupId: group.id,
    date: eveningDate,
    topic: null,
    notes: null,
    participantCount: null,
    createdAt: new Date(),
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: 240,
    createdAt: new Date(),
  });
  activateSurvey(db, survey.id, computeClosesAt(eveningDate, 240), new Date());
  return { group, survey, token: `${slug}-${secret}` };
}

/** Eine vollständig gefüllte Abgabe (8 Noten, ein Freitext). */
function submission(): FormData {
  const f = new FormData();
  for (const q of STANDARD_QUESTIONS) {
    if (q.type === "schulnote") f.set(q.id, "2");
  }
  f.set("q9", "War gut.");
  return f;
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  currentIp = "203.0.113.7";
});
afterEach(() => sqlite.close());

describe("submitResponseAction: Ratelimit sperrt die eigene Gruppe nicht aus", () => {
  it("15 Abgaben derselben IP für dieselbe Umfrage in einer Minute gehen alle durch", async () => {
    // Der Kernfall: 15 Ehrenamtliche um 21:30 hinter EINER Vereins-WLAN-NAT-IP.
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 15; i++) {
      await submitResponseAction(token, submission());
    }

    expect(listResponses(db, survey.id)).toHaveLength(15);
  });

  it("bremst die 61. Abgabe derselben IP für dieselbe Umfrage im 10-Minuten-Fenster", async () => {
    // Die Obergrenze greift trotzdem — 60 pro 10 Minuten und Umfrage.
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 60; i++) {
      await submitResponseAction(token, submission());
    }
    await expect(submitResponseAction(token, submission())).rejects.toThrow("Zu viele Anfragen");

    expect(listResponses(db, survey.id)).toHaveLength(60);
  });

  it("zwei verschiedene Umfragen derselben IP haben getrennte Budgets", async () => {
    const { submitResponseAction } = await loadActions();
    const a = seedActiveSurvey("bereitschaft", "abc12");
    const b = seedActiveSurvey("jugendrotkreuz", "xyz98");

    for (let i = 0; i < 60; i++) {
      await submitResponseAction(a.token, submission());
    }
    await expect(submitResponseAction(a.token, submission())).rejects.toThrow("Zu viele Anfragen");

    // Umfrage B ist unberührt: eigener Schlüssel `${ip}|${surveyId}`.
    await submitResponseAction(b.token, submission());

    expect(listResponses(db, a.survey.id)).toHaveLength(60);
    expect(listResponses(db, b.survey.id)).toHaveLength(1);
  });
});

describe("submitResponseAction: Brute-Force-Schutz bleibt", () => {
  it("bremst die 11. Anfrage derselben IP mit unlesbarem Token in einer Minute", async () => {
    const { submitResponseAction } = await loadActions();
    seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      await expect(submitResponseAction("x", submission())).rejects.toThrow("Ungültiger Link");
    }
    await expect(submitResponseAction("x", submission())).rejects.toThrow("Zu viele Anfragen");
  });

  it("bremst die 11. Anfrage derselben IP mit falschem Secret in einer Minute", async () => {
    // Der geratene Secret-Fall — der Grund, warum überhaupt auf die IP gekeyt wird.
    const { submitResponseAction } = await loadActions();
    seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      await expect(submitResponseAction("bereitschaft-zzz99", submission())).rejects.toThrow(
        "Ungültiger Link",
      );
    }
    await expect(submitResponseAction("bereitschaft-zzz99", submission())).rejects.toThrow(
      "Zu viele Anfragen",
    );
  });

  it("ungültige Token verbrauchen kein Budget für gültige Abgaben derselben IP", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      await expect(submitResponseAction("bereitschaft-zzz99", submission())).rejects.toThrow(
        "Ungültiger Link",
      );
    }
    for (let i = 0; i < 15; i++) {
      await submitResponseAction(token, submission());
    }

    expect(listResponses(db, survey.id)).toHaveLength(15);
  });

  it("eine andere IP hat ein eigenes Brute-Force-Budget", async () => {
    const { submitResponseAction } = await loadActions();
    seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      await expect(submitResponseAction("x", submission())).rejects.toThrow("Ungültiger Link");
    }
    currentIp = "198.51.100.4";
    await expect(submitResponseAction("x", submission())).rejects.toThrow("Ungültiger Link");
  });
});
