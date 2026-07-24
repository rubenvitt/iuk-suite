# Modul `feedback` Implementation Plan — Teil 1 (Tasks 1–8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 9–16 stehen in `2026-07-24-feedback-modul-teil2.md`.

**Goal:** Portierung der Alt-App `da-feedback/` (Go) in ein neues Suite-Modul `src/app/m/feedback/` — anonymes Dienstabend-Feedback per QR, Verwaltung mit zwei-Ebenen-Rollen.

**Architecture:** Bereinigter Port. Außenverhalten/Daten 1:1 wo nach außen wirksam (QR-Token, URLs, Auswertungsergebnisse), Altlasten weg, groupleader-IDOR über eine einzige Ownership-Guard geschlossen. Kette Gruppe → Dienstabend → genau eine Umfrage → anonyme Antworten. Reine Logik in `_lib/` (Teil 1), Datenzugriff/Actions/UI/Import/E2E in Teil 2.

**Tech Stack:** Next.js 16 · Drizzle · better-sqlite3 · Auth.js v5 (Pocket ID) · Ant Design 6 · Recharts (neu) · Vitest · Playwright · pnpm.

**Spec:** `docs/superpowers/specs/2026-07-24-feedback-modul-design.md`.

## Global Constraints

- Modul-Routen unter `src/app/m/feedback/`; `_db/` und `_lib/` sind Private Folders (keine Routen).
- Kein PWA/Offline. Keine Query-Lib — RSC + Server Actions + `revalidatePath` (interne Pfade `/m/feedback...`).
- Zeitstempel-Zieltyp durchgängig `integer(mode:"timestamp")` (wie `portal`); Paritäts-View rundet auf Sekunden.
- Registrierungs-Dreieck (laut per `core/bootstrap.test.ts` erzwungen): `_db/` ↔ `MODULE_MIGRATIONS` in `src/core/bootstrap.ts` ↔ Dockerfile-COPY. Zusätzlich **still**: Registry-Eintrag in `src/core/registry.ts` + Seed-Wiring in `bootstrap.ts`.
- In **Server-Komponenten NIE `X.Y`** auf einem antd-Import (Compound-Komponenten wie `Typography.Title`, `Card.Meta` sind `"use client"` → aus RSC `undefined` → HTTP 500, von `pnpm build` unbemerkt). Jede angefasste Route vor Commit tatsächlich abrufen.
- QR-Token 1:1: `/f/{slug}-{secret}`, Secret 5× `[a-z0-9]`, Parsing **positionsbasiert** (kein `split("-")`).
- Migration generieren: `pnpm drizzle-kit generate --config=src/app/m/feedback/_db/drizzle.config.ts`.
- Commit-Trailer (Muster aus letztem Commit auf `feat/feedback-module`):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX
  ```
- Branch: `feat/feedback-module` (bereits ausgecheckt; Spec liegt drauf).

---

### Task 1: Fundament — Registry, DB-Schema, Migration, Bootstrap-Verdrahtung

**Files:**
- Modify: `src/core/registry.ts` (MODULES-Liste, nach dem `qr`-Eintrag)
- Create: `src/app/m/feedback/_db/schema.ts`
- Create: `src/app/m/feedback/_db/client.ts`
- Create: `src/app/m/feedback/_db/drizzle.config.ts`
- Create: `src/app/m/feedback/_db/migrations/` (generiert)
- Create: `src/app/m/feedback/_lib/seed.ts` (Stub, in Task 14 gefüllt)
- Modify: `src/core/bootstrap.ts` (Schema-Import, `MODULE_MIGRATIONS`, Seed-Wiring)
- Modify: `Dockerfile` (COPY-Zeile)
- Test: `src/app/m/feedback/_db/migrations.test.ts`

**Interfaces:**
- Produces: Drizzle-Tabellen `groups`, `evenings`, `surveys`, `responses`, `userGroups` + Typen (`GroupRow`, `NewGroupRow`, `EveningRow`, `NewEveningRow`, `SurveyRow`, `NewSurveyRow`, `ResponseRow`, `NewResponseRow`, `UserGroupRow`, `NewUserGroupRow`); `getDb()` → `BetterSQLite3Database<typeof schema>`.
- Consumes: `getModuleDb` aus `@/core/db`, `ModuleDef`/`MODULES` aus `@/core/registry`.

- [ ] **Step 1: Registry-Eintrag ergänzen**

In `src/core/registry.ts` in `MODULES` direkt nach dem `qr`-Objekt einfügen:

```ts
  // feedback: gemischt wie qr — anonyme Teilnahme (/f/...) braucht keinen Login,
  // requiresAuth:false. Die Verwaltung schützt sich über core/auth/guards +
  // die Ownership-Guard (assertGroupAccess). requiredGroups gaten den
  // Verwaltungs-Zugang, adminGroups den Voll-Admin (alle Gruppen).
  { key: "feedback", title: "Feedback", icon: "CommentOutlined", shell: "full",
    requiresAuth: false, requiredGroups: ["da-feedback-gl", "da-feedback-admin"],
    adminGroups: ["da-feedback-admin"], prodHosts: [], showInSwitcher: true },
```

- [ ] **Step 2: Schema schreiben**

Create `src/app/m/feedback/_db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// Gruppen. `secret` ist Teil des öffentlichen QR-Tokens /f/{slug}-{secret}
// und muss beim Import 1:1 erhalten bleiben (gedruckte QR-Codes im Umlauf).
export const groups = sqliteTable(
  "groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    secret: text("secret").notNull(),
    closeAfterHours: integer("close_after_hours"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("idx_groups_slug").on(t.slug)],
);

export const evenings = sqliteTable(
  "evenings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // Reines Kalenderdatum (Mitternacht UTC). Kein Zeitanteil relevant.
    date: integer("date", { mode: "timestamp" }).notNull(),
    topic: text("topic"),
    notes: text("notes"),
    participantCount: integer("participant_count"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_evenings_group_date").on(t.groupId, t.date)],
);

// Genau eine Umfrage pro Dienstabend (UNIQUE evening_id). `questions` ist ein
// JSON-Snapshot der Fragen zum Zeitpunkt der Erstellung — Alt-Umfragen können
// andere Typen/Texte tragen (u. a. `stars`), deshalb pro Umfrage eingefroren.
export const surveys = sqliteTable(
  "surveys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eveningId: integer("evening_id")
      .notNull()
      .references(() => evenings.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    questions: text("questions").notNull().default("[]"),
    closeAfterHours: integer("close_after_hours"),
    activatedAt: integer("activated_at", { mode: "timestamp" }),
    closesAt: integer("closes_at", { mode: "timestamp" }),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("idx_surveys_evening").on(t.eveningId),
    index("idx_surveys_status").on(t.status),
    check(
      "surveys_status_check",
      sql`${t.status} IN ('draft','active','closed','archived')`,
    ),
  ],
);

// Anonyme Antworten. `answers` ist EINFACH JSON-kodiert: {questionId: value},
// value je nach Fragetyp Zahl (Rating) oder String (Text).
export const responses = sqliteTable(
  "responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    surveyId: integer("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    answers: text("answers").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_responses_survey").on(t.surveyId)],
);

// Zuordnung Gruppenleiter → Gruppen. userId = OIDC-sub (TEXT, kein FK auf eine
// users-Tabelle: users/sessions werden nicht portiert, Identität kommt aus SSO).
export const userGroups = sqliteTable(
  "user_groups",
  {
    userId: text("user_id").notNull(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type EveningRow = typeof evenings.$inferSelect;
export type NewEveningRow = typeof evenings.$inferInsert;
export type SurveyRow = typeof surveys.$inferSelect;
export type NewSurveyRow = typeof surveys.$inferInsert;
export type ResponseRow = typeof responses.$inferSelect;
export type NewResponseRow = typeof responses.$inferInsert;
export type UserGroupRow = typeof userGroups.$inferSelect;
export type NewUserGroupRow = typeof userGroups.$inferInsert;
```

- [ ] **Step 3: client.ts + drizzle.config.ts + seed-Stub**

Create `src/app/m/feedback/_db/client.ts`:

```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("feedback", schema);
```

Create `src/app/m/feedback/_db/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit löst gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/feedback/_db/schema.ts",
  out: "./src/app/m/feedback/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/feedback.db" },
} satisfies Config;
```

Create `src/app/m/feedback/_lib/seed.ts` (Stub — Task 14 füllt ihn):

```ts
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";

// Stub: echter Seed folgt in Task 14. Bewusst leer, damit das Bootstrap-Wiring
// schon in Task 1 vollständig ist (sonst scheitert der Boot still).
export async function seedFeedback(
  _db: BetterSQLite3Database<typeof schema>,
): Promise<void> {
  // absichtlich leer bis Task 14
}
```

- [ ] **Step 4: Migration generieren**

Run: `pnpm drizzle-kit generate --config=src/app/m/feedback/_db/drizzle.config.ts`
Expected: erzeugt `src/app/m/feedback/_db/migrations/0000_*.sql` + `meta/_journal.json` + `meta/0000_snapshot.json`.

- [ ] **Step 5: Bootstrap verdrahten**

In `src/core/bootstrap.ts`:
- Nach den qr-Imports ergänzen:
```ts
import * as feedbackSchema from "@/app/m/feedback/_db/schema";
import { seedFeedback } from "@/app/m/feedback/_lib/seed";
```
- In `MODULE_MIGRATIONS` nach dem qr-Eintrag:
```ts
  { key: "feedback", migrationsFolder: "src/app/m/feedback/_db/migrations" },
```
- In `seedAllModules()` nach `await seedQr(...)`:
```ts
  await seedFeedback(getModuleDb("feedback", feedbackSchema));
```

- [ ] **Step 6: Dockerfile-COPY ergänzen**

In `Dockerfile` nach der qr-migrations-COPY-Zeile:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/feedback/_db/migrations ./src/app/m/feedback/_db/migrations
```

- [ ] **Step 7: Migrations-Test schreiben**

Create `src/app/m/feedback/_db/migrations.test.ts` (Muster wie qr):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

describe("feedback migrations", () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), {
      migrationsFolder: "src/app/m/feedback/_db/migrations",
    });
  });
  afterAll(() => sqlite.close());

  it("legt alle fünf Tabellen an", () => {
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ["groups", "evenings", "surveys", "responses", "user_groups"]) {
      expect(names).toContain(t);
    }
  });

  it("erzwingt den status-CHECK auf surveys", () => {
    sqlite.exec(
      "INSERT INTO groups (name, slug, secret, created_at) VALUES ('G','g','abc12',0)",
    );
    sqlite.exec("INSERT INTO evenings (group_id, date, created_at) VALUES (1,0,0)");
    expect(() =>
      sqlite.exec(
        "INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'bogus',0)",
      ),
    ).toThrow();
  });

  it("erzwingt UNIQUE auf surveys.evening_id (1:1)", () => {
    sqlite.exec(
      "INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'draft',0)",
    );
    expect(() =>
      sqlite.exec(
        "INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'draft',0)",
      ),
    ).toThrow();
  });

  it("erzwingt Composite-PK auf user_groups", () => {
    sqlite.exec("INSERT INTO user_groups (user_id, group_id) VALUES ('u1',1)");
    expect(() =>
      sqlite.exec("INSERT INTO user_groups (user_id, group_id) VALUES ('u1',1)"),
    ).toThrow();
  });
});
```

- [ ] **Step 8: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/feedback/_db/migrations.test.ts src/core/bootstrap.test.ts`
Expected: PASS (migrations.test + bootstrap.test grün — das Registrierungs-Dreieck ist vollständig).

- [ ] **Step 9: Typecheck + Commit**

Run: `pnpm typecheck` → Expected: 0 Fehler.
```bash
git add src/app/m/feedback src/core/registry.ts src/core/bootstrap.ts Dockerfile
git commit -m "feat(feedback): Modul-Fundament — Schema, Registry, Migration, Bootstrap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 2: `_lib/token.ts` — QR-Token-Parsing (1:1-kritisch)

**Files:**
- Create: `src/app/m/feedback/_lib/token.ts`
- Test: `src/app/m/feedback/_lib/token.test.ts`

**Interfaces:**
- Produces:
  - `parseToken(slugSecret: string): { slug: string; secret: string } | null`
  - `buildToken(slug: string, secret: string): string`
  - `generateSecret(rng?: () => number): string`

- [ ] **Step 1: Failing test schreiben**

Create `src/app/m/feedback/_lib/token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseToken, buildToken, generateSecret } from "./token";

describe("parseToken", () => {
  it("zerlegt slug und 5-Zeichen-secret positionsbasiert", () => {
    expect(parseToken("muenchen-ab3x9")).toEqual({ slug: "muenchen", secret: "ab3x9" });
  });
  it("erhält Bindestriche im slug (kein split)", () => {
    expect(parseToken("nord-west-team-ab3x9")).toEqual({
      slug: "nord-west-team",
      secret: "ab3x9",
    });
  });
  it("null bei zu kurzer Eingabe (<7)", () => {
    expect(parseToken("ab3x9")).toBeNull();
    expect(parseToken("x-ab3x")).toBeNull();
  });
  it("null bei leerem slug", () => {
    expect(parseToken("-ab3x9")).toBeNull();
  });
});

describe("buildToken", () => {
  it("fügt mit Bindestrich zusammen", () => {
    expect(buildToken("muenchen", "ab3x9")).toBe("muenchen-ab3x9");
  });
});

describe("generateSecret", () => {
  it("liefert 5 Zeichen aus [a-z0-9]", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[a-z0-9]{5}$/);
  });
  it("ist mit injizierter rng deterministisch", () => {
    expect(generateSecret(() => 0)).toBe("aaaaa");
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `pnpm vitest run src/app/m/feedback/_lib/token.test.ts`
Expected: FAIL ("Cannot find module ./token").

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/token.ts`:

```ts
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SECRET_LEN = 5;

/**
 * Zerlegt ein Token `{slug}-{secret}` positionsbasiert — NICHT per split("-"),
 * weil der slug selbst Bindestriche enthalten darf. secret sind die letzten 5
 * Zeichen, das Trennzeichen an Position len-6 wird verworfen.
 * Muss exakt der Alt-Logik entsprechen (public.go:141-146), sonst brechen
 * gedruckte QR-Codes.
 */
export function parseToken(
  slugSecret: string,
): { slug: string; secret: string } | null {
  if (slugSecret.length < SECRET_LEN + 2) return null; // mind. 1 slug-Zeichen + "-" + 5
  const secret = slugSecret.slice(-SECRET_LEN);
  const slug = slugSecret.slice(0, -(SECRET_LEN + 1));
  if (slug.length === 0) return null;
  return { slug, secret };
}

export function buildToken(slug: string, secret: string): string {
  return `${slug}-${secret}`;
}

/** 5 Zeichen aus [a-z0-9]. `rng` (0..1) injizierbar für deterministische Tests. */
export function generateSecret(rng: () => number = defaultRng): string {
  let out = "";
  for (let i = 0; i < SECRET_LEN; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return out;
}

function defaultRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
```

- [ ] **Step 4: Test grün**

Run: `pnpm vitest run src/app/m/feedback/_lib/token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/token.ts src/app/m/feedback/_lib/token.test.ts
git commit -m "feat(feedback): QR-Token-Parsing (positionsbasiert, 1:1 zur Alt-App)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 3: `_lib/questions.ts` — Fragenkatalog

**Files:**
- Create: `src/app/m/feedback/_lib/questions.ts`
- Test: `src/app/m/feedback/_lib/questions.test.ts`

**Interfaces:**
- Produces:
  - `type QuestionType = "schulnote" | "text" | "stars"`
  - `interface Question { id: string; type: QuestionType; text: string }`
  - `const STANDARD_QUESTIONS: Question[]`
  - `isRatingType(t: QuestionType): boolean`
  - `ratingScale(t: QuestionType): number`

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/questions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { STANDARD_QUESTIONS, isRatingType, ratingScale } from "./questions";

describe("STANDARD_QUESTIONS", () => {
  it("hat 14 Fragen: 8 schulnote (q1-q8) + 6 text (q9-q14)", () => {
    expect(STANDARD_QUESTIONS).toHaveLength(14);
    expect(STANDARD_QUESTIONS.filter((q) => q.type === "schulnote")).toHaveLength(8);
    expect(STANDARD_QUESTIONS.filter((q) => q.type === "text")).toHaveLength(6);
    expect(STANDARD_QUESTIONS.map((q) => q.id)).toEqual(
      Array.from({ length: 14 }, (_, i) => `q${i + 1}`),
    );
  });
  it("erste Frage ist der Gesamteindruck", () => {
    expect(STANDARD_QUESTIONS[0]).toEqual({
      id: "q1",
      type: "schulnote",
      text: "Wie war der Dienstabend insgesamt?",
    });
  });
});

describe("isRatingType / ratingScale", () => {
  it("schulnote und stars sind Ratings, text nicht", () => {
    expect(isRatingType("schulnote")).toBe(true);
    expect(isRatingType("stars")).toBe(true);
    expect(isRatingType("text")).toBe(false);
  });
  it("schulnote skaliert 1-6, stars 1-5", () => {
    expect(ratingScale("schulnote")).toBe(6);
    expect(ratingScale("stars")).toBe(5);
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/questions.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/questions.ts`:

```ts
// `stars` ist nur für den LESE-Pfad (importierte Alt-Umfragen). Neue Umfragen
// erzeugen ausschließlich schulnote+text (STANDARD_QUESTIONS). single_choice/
// multi_choice der Alt-App werden bewusst nicht portiert (toter Code).
export type QuestionType = "schulnote" | "text" | "stars";

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
}

// Texte 1:1 aus da-feedback questions.go:3-21.
export const STANDARD_QUESTIONS: Question[] = [
  { id: "q1", type: "schulnote", text: "Wie war der Dienstabend insgesamt?" },
  { id: "q2", type: "schulnote", text: "Wie spannend war das Thema für dich?" },
  { id: "q3", type: "schulnote", text: "Wurden deine Erwartungen erfüllt?" },
  { id: "q4", type: "schulnote", text: "Wie gut war der Abend strukturiert?" },
  { id: "q5", type: "schulnote", text: "Hat man den Aufwand dahinter gemerkt?" },
  { id: "q6", type: "schulnote", text: "Wie gut war alles vorbereitet?" },
  { id: "q7", type: "schulnote", text: "Wurdest du als Teilnehmer einbezogen?" },
  { id: "q8", type: "schulnote", text: "Hast du etwas Neues mitgenommen?" },
  { id: "q9", type: "text", text: "Was hat dir am besten gefallen?" },
  { id: "q10", type: "text", text: "Worauf sollten wir beim nächsten Mal näher eingehen?" },
  { id: "q11", type: "text", text: "Was könnten wir besser machen?" },
  { id: "q12", type: "text", text: "Hast du einen Tipp für uns?" },
  { id: "q13", type: "text", text: "Welches Thema würde dich als Nächstes interessieren?" },
  { id: "q14", type: "text", text: "Gibt es sonst noch etwas, das du loswerden möchtest?" },
];

export function isRatingType(t: QuestionType): boolean {
  return t === "schulnote" || t === "stars";
}

export function ratingScale(t: QuestionType): number {
  return t === "schulnote" ? 6 : 5;
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/questions.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/questions.ts src/app/m/feedback/_lib/questions.test.ts
git commit -m "feat(feedback): Fragenkatalog (14 StandardQuestions, stars read-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 4: `_lib/lifecycle.ts` — Status-Helfer

**Files:**
- Create: `src/app/m/feedback/_lib/lifecycle.ts`
- Test: `src/app/m/feedback/_lib/lifecycle.test.ts`

**Interfaces:**
- Produces:
  - `type SurveyStatus = "draft" | "active" | "closed" | "archived"`
  - `computeClosesAt(activatedAt: Date, closeAfterHours: number): Date`
  - `isExpired(closesAt: Date | null, now: Date): boolean`
  - `nextStatusOnAccess(status: SurveyStatus, closesAt: Date | null, now: Date): SurveyStatus`
  - `DEFAULT_CLOSE_AFTER_HOURS = 48`

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/lifecycle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeClosesAt,
  isExpired,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
} from "./lifecycle";

const t = (iso: string) => new Date(iso);

describe("computeClosesAt", () => {
  it("addiert Stunden auf activatedAt", () => {
    expect(computeClosesAt(t("2026-04-09T10:00:00Z"), 48)).toEqual(
      t("2026-04-11T10:00:00Z"),
    );
  });
  it("Default sind 48h", () => {
    expect(DEFAULT_CLOSE_AFTER_HOURS).toBe(48);
  });
});

describe("isExpired", () => {
  it("false wenn closesAt null", () => {
    expect(isExpired(null, t("2026-04-09T10:00:00Z"))).toBe(false);
  });
  it("true wenn now >= closesAt", () => {
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T10:00:01Z"))).toBe(true);
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T10:00:00Z"))).toBe(true);
  });
  it("false wenn now < closesAt", () => {
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T09:59:59Z"))).toBe(false);
  });
});

describe("nextStatusOnAccess", () => {
  it("active + abgelaufen → closed", () => {
    expect(
      nextStatusOnAccess("active", t("2026-04-09T10:00:00Z"), t("2026-04-09T11:00:00Z")),
    ).toBe("closed");
  });
  it("active + nicht abgelaufen bleibt active", () => {
    expect(
      nextStatusOnAccess("active", t("2026-04-09T12:00:00Z"), t("2026-04-09T11:00:00Z")),
    ).toBe("active");
  });
  it("draft/closed/archived bleiben unverändert", () => {
    const now = t("2026-04-09T11:00:00Z");
    expect(nextStatusOnAccess("draft", null, now)).toBe("draft");
    expect(nextStatusOnAccess("closed", t("2020-01-01T00:00:00Z"), now)).toBe("closed");
    expect(nextStatusOnAccess("archived", null, now)).toBe("archived");
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/lifecycle.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/lifecycle.ts`:

```ts
export type SurveyStatus = "draft" | "active" | "closed" | "archived";

export const DEFAULT_CLOSE_AFTER_HOURS = 48;

export function computeClosesAt(activatedAt: Date, closeAfterHours: number): Date {
  return new Date(activatedAt.getTime() + closeAfterHours * 3600_000);
}

export function isExpired(closesAt: Date | null, now: Date): boolean {
  if (closesAt === null) return false;
  return now.getTime() >= closesAt.getTime();
}

/**
 * Lazy Auto-Close (Spec Entscheidung 3): eine aktive, abgelaufene Umfrage gilt
 * beim nächsten Zugriff als geschlossen. Alle anderen Zustände bleiben. Rein —
 * das Persistieren übernimmt der Aufrufer (Repo/Action), auf GET UND Submit.
 */
export function nextStatusOnAccess(
  status: SurveyStatus,
  closesAt: Date | null,
  now: Date,
): SurveyStatus {
  if (status === "active" && isExpired(closesAt, now)) return "closed";
  return status;
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/lifecycle.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/lifecycle.ts src/app/m/feedback/_lib/lifecycle.test.ts
git commit -m "feat(feedback): Lifecycle-Helfer (closesAt, lazy Auto-Close)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 5: `_lib/aggregation.ts` — Auswertungslogik

**Files:**
- Create: `src/app/m/feedback/_lib/aggregation.ts`
- Test: `src/app/m/feedback/_lib/aggregation.test.ts`

**Interfaces:**
- Consumes: `Question`, `QuestionType`, `isRatingType` aus `./questions`.
- Produces:
  - `interface DAStats { perQuestion: { id: string; text: string; type: QuestionType; avg: number | null; count: number }[]; overallAvg: number | null; texts: { questionId: string; text: string; values: string[] }[]; responseCount: number }`
  - `computeDAStats(questions: Question[], answers: Record<string, unknown>[]): DAStats`
  - `interface TrendPoint { periodStart: number; label: string; avg: number | null; responseCount: number }`
  - `computeGroupTrend(evenings: { date: number; stats: DAStats }[], from: number, to: number): TrendPoint[]`
  - `interface GroupComparison { groupId: number; groupName: string; overallAvg: number | null; responseCount: number }`

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/aggregation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDAStats, computeGroupTrend } from "./aggregation";
import type { Question } from "./questions";

const Q: Question[] = [
  { id: "q1", type: "schulnote", text: "Insgesamt?" },
  { id: "q9", type: "text", text: "Bestes?" },
];

describe("computeDAStats", () => {
  it("mittelt Ratings, sammelt Freitexte, zählt Antworten", () => {
    const stats = computeDAStats(Q, [
      { q1: 2, q9: "super" },
      { q1: 4, q9: "" },
      { q1: 3 },
    ]);
    expect(stats.responseCount).toBe(3);
    const q1 = stats.perQuestion.find((p) => p.id === "q1")!;
    expect(q1.avg).toBeCloseTo(3); // (2+4+3)/3
    expect(q1.count).toBe(3);
    expect(stats.overallAvg).toBeCloseTo(3);
    const q9 = stats.texts.find((t) => t.questionId === "q9")!;
    expect(q9.values).toEqual(["super"]); // leere Strings raus
  });

  it("wertet stars aus Alt-Umfragen aus (nicht ignorieren)", () => {
    const qs: Question[] = [{ id: "q1", type: "stars", text: "Bewertung?" }];
    const stats = computeDAStats(qs, [{ q1: 5 }, { q1: 3 }]);
    expect(stats.perQuestion[0].avg).toBeCloseTo(4);
  });

  it("avg null bei fehlenden Ratings", () => {
    const stats = computeDAStats(Q, [{ q9: "nur text" }]);
    expect(stats.perQuestion.find((p) => p.id === "q1")!.avg).toBeNull();
    expect(stats.overallAvg).toBeNull();
  });

  it("liest Rating als json.Number-String tolerant", () => {
    const stats = computeDAStats(Q, [{ q1: "2" }, { q1: "4" }]);
    expect(stats.perQuestion.find((p) => p.id === "q1")!.avg).toBeCloseTo(3);
  });
});

describe("computeGroupTrend", () => {
  const utc = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000);
  const st = (avg: number | null, count: number): ReturnType<typeof computeDAStats> => ({
    perQuestion: [],
    overallAvg: avg,
    texts: [],
    responseCount: count,
  });

  it("bucketet nach Monat, füllt leere Monate mit avg=null", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 10), stats: st(2, 5) },
        { date: utc(2026, 3, 5), stats: st(4, 3) },
      ],
      utc(2026, 1, 1),
      utc(2026, 3, 31),
    );
    expect(trend.map((p) => p.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(trend[0].avg).toBeCloseTo(2);
    expect(trend[1].avg).toBeNull(); // Februar leer
    expect(trend[2].avg).toBeCloseTo(4);
  });

  it("Range inklusiv an den Grenzen (kein off-by-one)", () => {
    const trend = computeGroupTrend(
      [{ date: utc(2026, 1, 31), stats: st(3, 1) }],
      utc(2026, 1, 1),
      utc(2026, 1, 31),
    );
    expect(trend).toHaveLength(1);
    expect(trend[0].avg).toBeCloseTo(3);
  });

  it("mittelt mehrere Dienstabende im selben Monat gewichtet nach responseCount", () => {
    const trend = computeGroupTrend(
      [
        { date: utc(2026, 1, 5), stats: st(2, 1) },
        { date: utc(2026, 1, 20), stats: st(4, 3) },
      ],
      utc(2026, 1, 1),
      utc(2026, 1, 31),
    );
    // (2*1 + 4*3) / (1+3) = 3.5
    expect(trend[0].avg).toBeCloseTo(3.5);
    expect(trend[0].responseCount).toBe(4);
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/aggregation.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/aggregation.ts`:

```ts
import { isRatingType, type Question, type QuestionType } from "./questions";

export interface DAStats {
  perQuestion: {
    id: string;
    text: string;
    type: QuestionType;
    avg: number | null;
    count: number;
  }[];
  overallAvg: number | null;
  texts: { questionId: string; text: string; values: string[] }[];
  responseCount: number;
}

/** Tolerant wie die Alt-App (aggregation.go:400-411): float64 ODER json.Number-String. */
function toFloat(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function computeDAStats(
  questions: Question[],
  answers: Record<string, unknown>[],
): DAStats {
  const perQuestion: DAStats["perQuestion"] = [];
  const texts: DAStats["texts"] = [];
  const ratingAvgs: number[] = [];

  for (const q of questions) {
    if (isRatingType(q.type)) {
      const vals = answers
        .map((a) => toFloat(a[q.id]))
        .filter((n): n is number => n !== null);
      const avg = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
      perQuestion.push({ id: q.id, text: q.text, type: q.type, avg, count: vals.length });
      if (avg !== null) ratingAvgs.push(avg);
    } else {
      const values = answers
        .map((a) => a[q.id])
        .filter((v): v is string => typeof v === "string" && v.trim() !== "");
      texts.push({ questionId: q.id, text: q.text, values });
      perQuestion.push({
        id: q.id,
        text: q.text,
        type: q.type,
        avg: null,
        count: values.length,
      });
    }
  }

  const overallAvg = ratingAvgs.length
    ? ratingAvgs.reduce((s, n) => s + n, 0) / ratingAvgs.length
    : null;

  return { perQuestion, overallAvg, texts, responseCount: answers.length };
}

export interface TrendPoint {
  periodStart: number; // Unix-Sekunden, Monatsanfang UTC
  label: string; // "YYYY-MM"
  avg: number | null;
  responseCount: number;
}

/**
 * Monatsbuckets über den Zeitraum [from, to] (Unix-Sekunden, inklusiv). Ersetzt
 * den alten lexikografischen YYYY-MM-DD-Präfix-Filter (aggregation.go:178-179),
 * der mit der Zeitstempel-Normalisierung stirbt. Monats-Ø wird nach
 * responseCount gewichtet; leere Monate bekommen avg=null.
 */
export function computeGroupTrend(
  evenings: { date: number; stats: DAStats }[],
  from: number,
  to: number,
): TrendPoint[] {
  const months = enumerateMonths(from, to);
  const buckets = new Map<string, { weighted: number; weight: number; count: number }>();

  for (const e of evenings) {
    if (e.date < from || e.date > to) continue;
    const label = monthLabel(e.date);
    const b = buckets.get(label) ?? { weighted: 0, weight: 0, count: 0 };
    b.count += e.stats.responseCount;
    if (e.stats.overallAvg !== null) {
      b.weighted += e.stats.overallAvg * e.stats.responseCount;
      b.weight += e.stats.responseCount;
    }
    buckets.set(label, b);
  }

  return months.map(({ label, periodStart }) => {
    const b = buckets.get(label);
    return {
      periodStart,
      label,
      avg: b && b.weight > 0 ? b.weighted / b.weight : null,
      responseCount: b?.count ?? 0,
    };
  });
}

function monthStartUTC(sec: number): { year: number; month: number } {
  const d = new Date(sec * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() }; // month 0-based
}

function monthLabel(sec: number): string {
  const { year, month } = monthStartUTC(sec);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function enumerateMonths(from: number, to: number): { label: string; periodStart: number }[] {
  const a = monthStartUTC(from);
  const b = monthStartUTC(to);
  const out: { label: string; periodStart: number }[] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    const periodStart = Math.floor(Date.UTC(y, m, 1) / 1000);
    out.push({ label: `${y}-${String(m + 1).padStart(2, "0")}`, periodStart });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export interface GroupComparison {
  groupId: number;
  groupName: string;
  overallAvg: number | null;
  responseCount: number;
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/aggregation.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/aggregation.ts src/app/m/feedback/_lib/aggregation.test.ts
git commit -m "feat(feedback): Auswertungslogik (DA-Stats, Monats-Trend, stars-fähig)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 6: `_lib/csv.ts` — CSV-Export

**Files:**
- Create: `src/app/m/feedback/_lib/csv.ts`
- Test: `src/app/m/feedback/_lib/csv.test.ts`

**Interfaces:**
- Produces:
  - `buildCsv(rows: string[][]): string`
  - `joinTexts(values: string[]): string`

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCsv, joinTexts } from "./csv";

describe("buildCsv (RFC 4180)", () => {
  it("quotet Felder mit Komma, Anführungszeichen, Zeilenumbruch", () => {
    const csv = buildCsv([
      ["a", "b,c", 'd"e'],
      ["f\ng", "h", "i"],
    ]);
    expect(csv).toBe('a,"b,c","d""e"\r\n"f\ng",h,i');
  });
  it("leere Matrix → leerer String", () => {
    expect(buildCsv([])).toBe("");
  });
});

describe("joinTexts", () => {
  it("verbindet Freitexte mit ' | ' — kein Doppel-JSON wie die Alt-App", () => {
    expect(joinTexts(["super", "mehr Praxis"])).toBe("super | mehr Praxis");
  });
  it("leeres Array → leerer String", () => {
    expect(joinTexts([])).toBe("");
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/csv.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/csv.ts`:

```ts
/**
 * RFC-4180-CSV. Anders als die Alt-App (export.go:92-102), die String-Arrays
 * per json.Marshal in ein Feld schrieb (Doppel-JSON), joinen wir Freitexte
 * sauber lesbar — bereinigter Port.
 */
export function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function joinTexts(values: string[]): string {
  return values.join(" | ");
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/csv.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/csv.ts src/app/m/feedback/_lib/csv.test.ts
git commit -m "feat(feedback): CSV-Export (RFC 4180, ohne Doppel-JSON der Alt-App)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 7: `_lib/prompt.ts` — KI-Prompt-Generator

**Files:**
- Create: `src/app/m/feedback/_lib/prompt.ts`
- Test: `src/app/m/feedback/_lib/prompt.test.ts`

**Interfaces:**
- Consumes: `DAStats` aus `./aggregation`.
- Produces:
  - `interface PromptInput { groupName: string; eveningDate: string; topic?: string; participantCount?: number; stats: DAStats; rawAnswers: Record<string, unknown>[] }`
  - `buildAnalysisPrompt(input: PromptInput): string`

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt } from "./prompt";
import type { DAStats } from "./aggregation";

const stats: DAStats = {
  perQuestion: [
    { id: "q1", text: "Insgesamt?", type: "schulnote", avg: 2.5, count: 4 },
    { id: "q9", text: "Bestes?", type: "text", avg: null, count: 1 },
  ],
  overallAvg: 2.5,
  texts: [{ questionId: "q9", text: "Bestes?", values: ["super Praxis"] }],
  responseCount: 4,
};

describe("buildAnalysisPrompt", () => {
  it("enthält Instruktion, Metadaten, Bewertungen, Freitexte", () => {
    const p = buildAnalysisPrompt({
      groupName: "München",
      eveningDate: "09.04.2026",
      topic: "Erste Hilfe",
      participantCount: 12,
      stats,
      rawAnswers: [{ q1: 2, q9: "super Praxis" }],
    });
    expect(p).toContain("Deutschen Roten Kreuz");
    expect(p).toContain("- Gruppe: München");
    expect(p).toContain("- Datum: 09.04.2026");
    expect(p).toContain("- Thema: Erste Hilfe");
    expect(p).toContain("- Anzahl Rückmeldungen: 4");
    expect(p).toContain("Insgesamt?: 2.50");
    expect(p).toContain("Gesamtdurchschnitt: 2.50");
    expect(p).toContain("super Praxis");
  });
  it("lässt optionale Felder weg wenn nicht gesetzt", () => {
    const p = buildAnalysisPrompt({
      groupName: "Nord",
      eveningDate: "01.01.2026",
      stats,
      rawAnswers: [],
    });
    expect(p).not.toContain("- Thema:");
    expect(p).not.toContain("- Teilnehmer gesamt:");
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/prompt.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/prompt.ts` (Struktur 1:1 an da-feedback `prompt.go` `BuildPrompt`):

```ts
import { isRatingType } from "./questions";
import type { DAStats } from "./aggregation";

export interface PromptInput {
  groupName: string;
  eveningDate: string; // bereits formatiert "DD.MM.YYYY"
  topic?: string;
  participantCount?: number;
  stats: DAStats;
  rawAnswers: Record<string, unknown>[];
}

export function buildAnalysisPrompt(input: PromptInput): string {
  const { groupName, eveningDate, topic, participantCount, stats, rawAnswers } = input;
  const L: string[] = [];

  L.push(
    "Du bist ein erfahrener Ausbildungsberater beim Deutschen Roten Kreuz. " +
      "Analysiere die folgenden anonymisierten Rückmeldungen zu einem Dienstabend " +
      "einer Rotkreuz-Gruppe sachlich und konstruktiv.",
  );
  L.push("");
  L.push("Erstelle eine strukturierte Auswertung auf Deutsch mit folgenden Abschnitten:");
  L.push("1. **Stärken** - Was lief besonders gut? Beziehe dich auf konkrete Bewertungen und Aussagen.");
  L.push("2. **Verbesserungspotenzial** - Welche Bereiche schneiden schlechter ab oder werden kritisiert?");
  L.push("3. **Konkrete Empfehlungen** - Was sollte beim nächsten Dienstabend konkret anders gemacht werden?");
  L.push("4. **Fazit** - Ein kurzes zusammenfassendes Urteil.");
  L.push("");
  L.push(
    "Halte den Bericht sachlich, wertschätzend und handlungsorientiert. " +
      "Beziehe dich auf konkrete Aussagen aus den Freitextantworten.",
  );
  L.push("");
  L.push("---");
  L.push("");

  L.push("## Metadaten");
  L.push(`- Gruppe: ${groupName}`);
  L.push(`- Datum: ${eveningDate}`);
  if (topic && topic !== "") L.push(`- Thema: ${topic}`);
  L.push(`- Anzahl Rückmeldungen: ${stats.responseCount}`);
  if (participantCount !== undefined) L.push(`- Teilnehmer gesamt: ${participantCount}`);
  L.push("");

  L.push("## Durchschnittliche Bewertungen (Schulnoten: 1 = sehr gut, 6 = ungenügend)");
  for (const q of stats.perQuestion) {
    if (isRatingType(q.type) && q.avg !== null) L.push(`- ${q.text}: ${q.avg.toFixed(2)}`);
  }
  L.push(`- **Gesamtdurchschnitt: ${stats.overallAvg !== null ? stats.overallAvg.toFixed(2) : "–"}**`);
  L.push("");

  L.push("## Freitextantworten (gesammelt)");
  for (const t of stats.texts) {
    if (t.values.length === 0) continue;
    L.push("");
    L.push(`### ${t.text}`);
    for (const v of t.values) L.push(`- ${v}`);
  }
  L.push("");

  L.push("## Einzelne Rückmeldungen (Rohdaten)");
  L.push("");
  const ratings = stats.perQuestion.filter((q) => isRatingType(q.type));
  const textQs = stats.texts;
  rawAnswers.forEach((ans, i) => {
    L.push(`### Rückmeldung ${i + 1}`);
    for (const r of ratings) {
      const v = ans[r.id];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) L.push(`- ${r.text}: ${n.toFixed(0)}`);
    }
    for (const tq of textQs) {
      const v = ans[tq.questionId];
      if (typeof v === "string" && v.trim() !== "") L.push(`- ${tq.text}: ${v}`);
    }
    L.push("");
  });

  return L.join("\n");
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/prompt.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/prompt.ts src/app/m/feedback/_lib/prompt.test.ts
git commit -m "feat(feedback): KI-Prompt-Generator (Struktur wie Alt-App)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 8: `_lib/ratelimit.ts` — In-Memory-Rate-Limiter

**Files:**
- Create: `src/app/m/feedback/_lib/ratelimit.ts`
- Test: `src/app/m/feedback/_lib/ratelimit.test.ts`

**Interfaces:**
- Produces:
  - `class RateLimiter { constructor(opts: { windowMs: number; max: number; now?: () => number }); check(key: string): boolean }`

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/ratelimit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RateLimiter } from "./ratelimit";

describe("RateLimiter", () => {
  it("erlaubt bis max und blockt dann im Fenster", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 2, now: () => t });
    expect(rl.check("ip1")).toBe(true);
    expect(rl.check("ip1")).toBe(true);
    expect(rl.check("ip1")).toBe(false); // 3. im Fenster
  });
  it("trennt Schlüssel", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, now: () => t });
    expect(rl.check("a")).toBe(true);
    expect(rl.check("b")).toBe(true);
    expect(rl.check("a")).toBe(false);
  });
  it("gibt nach Ablauf des Fensters wieder frei", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, now: () => t });
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(false);
    t = 2001; // Fenster vorbei
    expect(rl.check("a")).toBe(true);
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/ratelimit.test.ts` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/app/m/feedback/_lib/ratelimit.ts`:

```ts
/**
 * Schlichter Sliding-Window-Limiter, in-memory pro Prozess. Schützt den
 * anonymen Schreib-Pfad (/f/... GET + Submit) gegen Spam/Ballot-Stuffing —
 * Ersatz für den Alt-App-Limiter (router.go:30-93). `now` injizierbar für Tests.
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(opts: { windowMs: number; max: number; now?: () => number }) {
    this.windowMs = opts.windowMs;
    this.max = opts.max;
    this.now = opts.now ?? (() => Date.now());
  }

  /** true = erlaubt, false = Limit erreicht. */
  check(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/ratelimit.test.ts` → PASS.

- [ ] **Step 5: Gesamter Lauf + Commit**

Run: `pnpm vitest run src/app/m/feedback && pnpm typecheck` → Expected: alle grün, 0 Typfehler.
```bash
git add src/app/m/feedback/_lib/ratelimit.ts src/app/m/feedback/_lib/ratelimit.test.ts
git commit -m "feat(feedback): In-Memory-Rate-Limiter für öffentliche Routen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

**Ende Teil 1.** Damit stehen Fundament (bootbares Modul, migrierte DB) und die gesamte reine `_lib`-Logik unter Test. Weiter mit `2026-07-24-feedback-modul-teil2.md` (Repo-Layer, Actions, öffentliche/Verwaltungs-UI, Charts, Seed, Import, E2E).
