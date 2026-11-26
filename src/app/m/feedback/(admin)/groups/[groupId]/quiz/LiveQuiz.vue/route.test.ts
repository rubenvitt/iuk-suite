import { registerAuditFunctions } from "@/core/audit/context";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertGroup } from "@/app/m/feedback/_db/queries";

/**
 * DIE SLIDEV-KOMPONENTE ZUM HERUNTERLADEN. Der Schnipsel im Quiz-Editor allein läuft nicht: die
 * Folie braucht `LiveQuiz.vue`. Drei Zusagen: derselbe Guard wie die Exporte der Gruppe (404 ohne
 * Zugriff, nie 403), ein Anhang als Text, und der Inhalt ist Byte für Byte `docs/slidev/LiveQuiz.vue`
 * (die Kopie in `_lib/quiz/liveQuizVue.ts` darf nicht wegdriften).
 */
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  insertGroup(db, { name: "B", slug: "bereitschaft", secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "leitung-1", groups: ["feedback-nutzer"], fachgruppen: ["bereitschaft"] } });
});
afterEach(() => sqlite.close());

async function hole(groupId: number) {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/m/feedback/groups/${groupId}/quiz/LiveQuiz.vue`), {
    params: Promise.resolve({ groupId: String(groupId) }),
  });
}

describe("GET …/quiz/LiveQuiz.vue", () => {
  it("liefert die Komponente als Textanhang, gleich der Datei unter docs/slidev", async () => {
    const res = await hole(1);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="LiveQuiz.vue"');
    expect(await res.text()).toBe(readFileSync("docs/slidev/LiveQuiz.vue", "utf8"));
  });

  it("404 bei unbekannter Gruppe, fremder Gruppe und ohne Sitzung — nie 403", async () => {
    expect((await hole(999)).status).toBe(404);
    authMock.mockResolvedValue({ user: { id: "fremd", groups: ["feedback-nutzer"], fachgruppen: ["andere"] } });
    expect((await hole(1)).status).toBe(404);
    authMock.mockResolvedValue(null);
    expect((await hole(1)).status).toBe(404);
  });
});
