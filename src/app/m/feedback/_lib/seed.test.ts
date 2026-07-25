import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { seedFeedback } from "./seed";
import {
  listGroups,
  getGroupBySlug,
  activeSurveyForGroup,
  memberGroupIdsFor,
} from "@/app/m/feedback/_db/queries";
import { computeClosesAt, DEFAULT_CLOSE_AFTER_HOURS } from "@/app/m/feedback/_lib/lifecycle";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
});
afterEach(() => sqlite.close());

describe("seedFeedback", () => {
  it("legt 2 Gruppen mit je aktiver Umfrage an und ist idempotent", async () => {
    await seedFeedback(db);
    await seedFeedback(db);
    const groups = listGroups(db);
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(activeSurveyForGroup(db, g.id)).toBeTruthy();
    }
  });

  it("ordnet den Dev-Gruppenleiter (dev:gl@localtest.me) NUR 'Demo Jugend' zu", async () => {
    await seedFeedback(db);
    await seedFeedback(db);

    const demo = getGroupBySlug(db, "demo");
    const jugend = getGroupBySlug(db, "jugend");
    expect(demo).toBeTruthy();
    expect(jugend).toBeTruthy();

    // Ohne Fachgruppen-Claim: der Seed schreibt ausschließlich user_groups.
    const memberIds = memberGroupIdsFor(db, "dev:gl@localtest.me", []);
    expect(memberIds).toEqual([jugend!.id]);
  });

  /**
   * Derselbe Frist-Defekt wie in `activateSurveyAction` (Entwurf 1.5/2): der Seed
   * übergab `now` an `computeClosesAt`, obwohl der Abend auf Mitternacht UTC
   * desselben Tages gesetzt wird. Die Uhr ist hier festgestellt, weil der Defekt
   * sonst nur abends sichtbar ist: um 22:30 UTC ist in Europe/Berlin schon der
   * FOLGETAG, und die Frist rutschte still um 24 Stunden nach hinten.
   */
  it("die Frist des Seed-Abends hängt am Abenddatum, nicht an der Uhrzeit des Bootvorgangs", async () => {
    vi.useFakeTimers();
    // 00:30 Berlin-Zeit am 25.07. — der Abend ist der 24.07. (Mitternacht UTC).
    vi.setSystemTime(new Date("2026-07-24T22:30:00Z"));
    try {
      await seedFeedback(db);
      const demo = getGroupBySlug(db, "demo")!;
      const aktiv = activeSurveyForGroup(db, demo.id)!;

      expect(aktiv.survey.closesAt).toEqual(
        computeClosesAt(aktiv.evening.date, DEFAULT_CLOSE_AFTER_HOURS),
      );
      // Und NICHT „ab jetzt": das wäre ein Tag zu spät.
      expect(aktiv.survey.closesAt).not.toEqual(
        computeClosesAt(new Date(), DEFAULT_CLOSE_AFTER_HOURS),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
