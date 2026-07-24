import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

    const memberIds = memberGroupIdsFor(db, "dev:gl@localtest.me");
    expect(memberIds).toEqual([jugend!.id]);
  });
});
