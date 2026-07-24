# Modul `feedback` Implementation Plan — Teil 2 (Tasks 9–16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps nutzen Checkbox-Syntax. Tasks 1–8 (Fundament + reine `_lib`-Logik) stehen in `2026-07-24-feedback-modul.md` — dort auch **Goal, Architecture, Tech Stack und Global Constraints**, die hier unverändert gelten.

**Kurz-Kontext:** Teil 1 hat das bootbare Modul (Registry, Schema, Migration), sowie `token`, `questions`, `lifecycle`, `aggregation`, `csv`, `prompt`, `ratelimit` unter Test geliefert. Teil 2 baut Datenzugriff, Server Actions, öffentliche Teilnahme, Verwaltungs-/Auswertungs-UI, Seed, Import und E2E.

**Global Constraints:** siehe Teil 1. Besonders relevant hier: In Server-Komponenten NIE `X.Y` auf einem antd-Import; jede angefasste Route vor Commit tatsächlich abrufen; `revalidatePath` mit internen Pfaden; Commit-Trailer wie in Teil 1.

---

### Task 9: Repo-Layer `_db/queries.ts` + Ownership-Guard `_lib/access.ts`

**Files:**
- Create: `src/app/m/feedback/_lib/access.ts`
- Create: `src/app/m/feedback/_db/queries.ts`
- Test: `src/app/m/feedback/_lib/access.test.ts`
- Test: `src/app/m/feedback/_db/queries.test.ts`

**Interfaces:**
- Produces (access.ts):
  - `type Viewer = { sub: string; groups: string[] }`
  - `isFeedbackAdmin(viewer: Viewer | null): boolean`
  - `assertGroupAccess(viewer: Viewer | null, groupId: number, memberGroupIds: number[]): void` — wirft `Error("Forbidden")`
  - `accessibleGroupFilter(viewer: Viewer | null, memberGroupIds: number[]): "all" | number[]`
- Produces (queries.ts), alle `(db, …)` mit `db = ReturnType<typeof getDb>`:
  - `memberGroupIdsFor(db, sub: string): number[]`
  - `listGroups(db): GroupRow[]`
  - `getGroup(db, id: number): GroupRow | undefined`
  - `getGroupBySlug(db, slug: string): GroupRow | undefined`
  - `insertGroup(db, v: { name: string; slug: string; secret: string; closeAfterHours: number | null; createdAt: Date }): GroupRow`
  - `updateGroup(db, id, patch)`, `deleteGroup(db, id)`, `setGroupSecret(db, id, secret)`
  - `listEvenings(db, groupId): EveningRow[]`, `getEvening(db, id)`, `insertEvening(...)`, `updateEvening(...)`, `deleteEvening(db, id)`
  - `getSurveyByEvening(db, eveningId): SurveyRow | undefined`, `getSurvey(db, id)`, `insertSurvey(...)`, `setSurveyStatus(db, id, status, patch?)`
  - `activateSurvey(db, surveyId: number, closesAt: Date, now: Date): void` — Transaktion: schließt alle anderen `active` derselben Gruppe, setzt Ziel auf `active`
  - `activeSurveyForGroup(db, groupId: number): { survey: SurveyRow; evening: EveningRow } | undefined`
  - `listResponses(db, surveyId): ResponseRow[]`, `insertResponse(db, surveyId, answers: Record<string, unknown>, at: Date)`
- Consumes: `getDb` (client.ts), Schema-Typen, `SurveyStatus` aus lifecycle.

- [ ] **Step 1: access.ts Failing test**

Create `src/app/m/feedback/_lib/access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isFeedbackAdmin, assertGroupAccess, accessibleGroupFilter } from "./access";

const admin = { sub: "a", groups: ["da-feedback-admin"] };
const gl = { sub: "g", groups: ["da-feedback-gl"] };

describe("isFeedbackAdmin", () => {
  it("true für Admin-Gruppe, false sonst/null", () => {
    expect(isFeedbackAdmin(admin)).toBe(true);
    expect(isFeedbackAdmin(gl)).toBe(false);
    expect(isFeedbackAdmin(null)).toBe(false);
  });
});

describe("assertGroupAccess", () => {
  it("Admin darf jede Gruppe", () => {
    expect(() => assertGroupAccess(admin, 42, [])).not.toThrow();
  });
  it("groupleader nur eigene Gruppen", () => {
    expect(() => assertGroupAccess(gl, 7, [7, 9])).not.toThrow();
    expect(() => assertGroupAccess(gl, 3, [7, 9])).toThrow("Forbidden");
  });
  it("null-Viewer immer verboten", () => {
    expect(() => assertGroupAccess(null, 7, [7])).toThrow("Forbidden");
  });
});

describe("accessibleGroupFilter", () => {
  it("Admin → 'all', groupleader → seine IDs", () => {
    expect(accessibleGroupFilter(admin, [])).toBe("all");
    expect(accessibleGroupFilter(gl, [7, 9])).toEqual([7, 9]);
    expect(accessibleGroupFilter(null, [7])).toEqual([]);
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/access.test.ts` → FAIL.

- [ ] **Step 3: access.ts implementieren**

Create `src/app/m/feedback/_lib/access.ts`:

```ts
import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

export type Viewer = { sub: string; groups: string[] };

export function isFeedbackAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  return isModuleAdmin(getModule("feedback"), viewer.groups);
}

/**
 * DIE zentrale Ownership-Guard gegen die Alt-IDOR. `memberGroupIds` kommt aus
 * user_groups (im Aufrufer via memberGroupIdsFor geladen) — hier reingereicht,
 * damit die Guard rein/testbar bleibt. Jede Route/Action mit group/evening/
 * survey-id MUSS sie aufrufen (evening/survey vorher auf group_id auflösen).
 */
export function assertGroupAccess(
  viewer: Viewer | null,
  groupId: number,
  memberGroupIds: number[],
): void {
  if (isFeedbackAdmin(viewer)) return;
  if (viewer && memberGroupIds.includes(groupId)) return;
  throw new Error("Forbidden");
}

export function accessibleGroupFilter(
  viewer: Viewer | null,
  memberGroupIds: number[],
): "all" | number[] {
  if (isFeedbackAdmin(viewer)) return "all";
  if (!viewer) return [];
  return memberGroupIds;
}
```

- [ ] **Step 4: access.ts grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/access.test.ts` → PASS.

- [ ] **Step 5: queries.ts Integrationstest schreiben**

Create `src/app/m/feedback/_db/queries.test.ts` (echtes SQLite in temp DATA_DIR; Muster wie `core/bootstrap.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import {
  memberGroupIdsFor,
  insertGroup,
  listGroups,
  insertEvening,
  insertSurvey,
  activateSurvey,
  getSurvey,
  activeSurveyForGroup,
  insertResponse,
  listResponses,
} from "./queries";

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

const mkGroup = (name = "G", slug = "g") =>
  insertGroup(db, { name, slug, secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });

describe("memberGroupIdsFor", () => {
  it("liefert die zugeordneten Gruppen-IDs", () => {
    const g = mkGroup();
    sqlite.prepare("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)").run("u1", g.id);
    expect(memberGroupIdsFor(db, "u1")).toEqual([g.id]);
    expect(memberGroupIdsFor(db, "other")).toEqual([]);
  });
});

describe("activateSurvey — max. 1 aktive pro Gruppe", () => {
  it("schließt andere aktive Umfragen derselben Gruppe", () => {
    const g = mkGroup();
    const e1 = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const e2 = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const s1 = insertSurvey(db, { eveningId: e1.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const s2 = insertSurvey(db, { eveningId: e2.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    const now = new Date("2026-04-09T10:00:00Z");
    activateSurvey(db, s1.id, new Date("2026-04-11T10:00:00Z"), now);
    activateSurvey(db, s2.id, new Date("2026-04-11T10:00:00Z"), now);
    expect(getSurvey(db, s1.id)!.status).toBe("closed"); // durch s2-Aktivierung geschlossen
    expect(getSurvey(db, s2.id)!.status).toBe("active");
    expect(activeSurveyForGroup(db, g.id)!.survey.id).toBe(s2.id);
  });
});

describe("insertResponse / listResponses", () => {
  it("speichert answers als JSON und liest sie zurück", () => {
    const g = mkGroup();
    const e = insertEvening(db, { groupId: g.id, date: new Date(0), topic: null, notes: null, participantCount: null, createdAt: new Date(0) });
    const s = insertSurvey(db, { eveningId: e.id, questions: "[]", closeAfterHours: null, createdAt: new Date(0) });
    insertResponse(db, s.id, { q1: 2, q9: "gut" }, new Date(0));
    const rows = listResponses(db, s.id);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].answers)).toEqual({ q1: 2, q9: "gut" });
  });
});
```

- [ ] **Step 6: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_db/queries.test.ts` → FAIL.

- [ ] **Step 7: queries.ts implementieren**

Create `src/app/m/feedback/_db/queries.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  groups,
  evenings,
  surveys,
  responses,
  userGroups,
  type GroupRow,
  type EveningRow,
  type SurveyRow,
  type ResponseRow,
} from "./schema";
import type { SurveyStatus } from "@/app/m/feedback/_lib/lifecycle";

type DB = BetterSQLite3Database<typeof schema>;

export function memberGroupIdsFor(db: DB, sub: string): number[] {
  return db
    .select({ groupId: userGroups.groupId })
    .from(userGroups)
    .where(eq(userGroups.userId, sub))
    .all()
    .map((r) => r.groupId);
}

export function listGroups(db: DB): GroupRow[] {
  return db.select().from(groups).all();
}
export function getGroup(db: DB, id: number): GroupRow | undefined {
  return db.select().from(groups).where(eq(groups.id, id)).get();
}
export function getGroupBySlug(db: DB, slug: string): GroupRow | undefined {
  return db.select().from(groups).where(eq(groups.slug, slug)).get();
}
export function insertGroup(
  db: DB,
  v: { name: string; slug: string; secret: string; closeAfterHours: number | null; createdAt: Date },
): GroupRow {
  return db.insert(groups).values(v).returning().get();
}
export function updateGroup(
  db: DB,
  id: number,
  patch: Partial<{ name: string; slug: string; closeAfterHours: number | null }>,
): void {
  db.update(groups).set(patch).where(eq(groups.id, id)).run();
}
export function setGroupSecret(db: DB, id: number, secret: string): void {
  db.update(groups).set({ secret }).where(eq(groups.id, id)).run();
}
export function deleteGroup(db: DB, id: number): void {
  db.delete(groups).where(eq(groups.id, id)).run();
}

export function listEvenings(db: DB, groupId: number): EveningRow[] {
  return db.select().from(evenings).where(eq(evenings.groupId, groupId)).all();
}
export function getEvening(db: DB, id: number): EveningRow | undefined {
  return db.select().from(evenings).where(eq(evenings.id, id)).get();
}
export function insertEvening(
  db: DB,
  v: { groupId: number; date: Date; topic: string | null; notes: string | null; participantCount: number | null; createdAt: Date },
): EveningRow {
  return db.insert(evenings).values(v).returning().get();
}
export function updateEvening(
  db: DB,
  id: number,
  patch: Partial<{ date: Date; topic: string | null; notes: string | null; participantCount: number | null }>,
): void {
  db.update(evenings).set(patch).where(eq(evenings.id, id)).run();
}
export function deleteEvening(db: DB, id: number): void {
  db.delete(evenings).where(eq(evenings.id, id)).run();
}

export function getSurveyByEvening(db: DB, eveningId: number): SurveyRow | undefined {
  return db.select().from(surveys).where(eq(surveys.eveningId, eveningId)).get();
}
export function getSurvey(db: DB, id: number): SurveyRow | undefined {
  return db.select().from(surveys).where(eq(surveys.id, id)).get();
}
export function insertSurvey(
  db: DB,
  v: { eveningId: number; questions: string; closeAfterHours: number | null; createdAt: Date },
): SurveyRow {
  return db.insert(surveys).values({ ...v, status: "draft" }).returning().get();
}
export function setSurveyStatus(
  db: DB,
  id: number,
  status: SurveyStatus,
  patch: Partial<{ activatedAt: Date | null; closesAt: Date | null; closedAt: Date | null }> = {},
): void {
  db.update(surveys).set({ status, ...patch }).where(eq(surveys.id, id)).run();
}

/**
 * Aktiviert eine Umfrage und schließt in derselben Transaktion alle anderen
 * aktiven Umfragen derselben Gruppe (Invariante „max. 1 aktiv pro Gruppe",
 * store.go:99-108). Gruppenbezug via evening.group_id.
 */
export function activateSurvey(db: DB, surveyId: number, closesAt: Date, now: Date): void {
  db.transaction((tx) => {
    const target = tx.select().from(surveys).where(eq(surveys.id, surveyId)).get();
    if (!target) throw new Error("survey not found");
    const eve = tx.select().from(evenings).where(eq(evenings.id, target.eveningId)).get();
    if (!eve) throw new Error("evening not found");
    // Andere aktive Umfragen derselben Gruppe schließen.
    const sameGroupEvenings = tx
      .select({ id: evenings.id })
      .from(evenings)
      .where(eq(evenings.groupId, eve.groupId))
      .all()
      .map((r) => r.id);
    for (const eid of sameGroupEvenings) {
      const s = tx.select().from(surveys).where(eq(surveys.eveningId, eid)).get();
      if (s && s.id !== surveyId && s.status === "active") {
        tx.update(surveys).set({ status: "closed", closedAt: now }).where(eq(surveys.id, s.id)).run();
      }
    }
    tx.update(surveys)
      .set({ status: "active", activatedAt: now, closesAt, closedAt: null })
      .where(eq(surveys.id, surveyId))
      .run();
  });
}

export function activeSurveyForGroup(
  db: DB,
  groupId: number,
): { survey: SurveyRow; evening: EveningRow } | undefined {
  const rows = db
    .select({ survey: surveys, evening: evenings })
    .from(surveys)
    .innerJoin(evenings, eq(surveys.eveningId, evenings.id))
    .where(and(eq(evenings.groupId, groupId), eq(surveys.status, "active")))
    .get();
  return rows ?? undefined;
}

export function listResponses(db: DB, surveyId: number): ResponseRow[] {
  return db.select().from(responses).where(eq(responses.surveyId, surveyId)).all();
}
export function insertResponse(
  db: DB,
  surveyId: number,
  answers: Record<string, unknown>,
  at: Date,
): void {
  db.insert(responses).values({ surveyId, answers: JSON.stringify(answers), submittedAt: at }).run();
}

// Ungenutzte Import vermeiden: `ne` bleibt für spätere Filter reserviert.
void ne;
```

> Hinweis: `ne` nur importieren, wenn genutzt — andernfalls den Import entfernen statt `void ne;` (lint). Der Reviewer entscheidet; der Test darf keine Lint-Errors erzeugen.

- [ ] **Step 8: Test grün + Typecheck** — Run: `pnpm vitest run src/app/m/feedback/_db/queries.test.ts && pnpm typecheck` → PASS, 0 Fehler.

- [ ] **Step 9: Commit**

```bash
git add src/app/m/feedback/_lib/access.ts src/app/m/feedback/_lib/access.test.ts src/app/m/feedback/_db/queries.ts src/app/m/feedback/_db/queries.test.ts
git commit -m "feat(feedback): Repo-Layer + Ownership-Guard (schließt Alt-IDOR)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 10: `actions.ts` — guarded Server Actions

**Files:**
- Create: `src/app/m/feedback/actions.ts`
- Create: `src/app/m/feedback/_lib/viewer.ts` (Session → Viewer + memberGroupIds)
- Test: `src/app/m/feedback/_lib/viewer.test.ts`

**Interfaces:**
- Produces (viewer.ts):
  - `viewerFromSession(session: { user?: { id?: string; groups?: string[] } } | null): Viewer | null`
- Produces (actions.ts): Server Actions
  - `createGroupAction(formData)`, `updateGroupAction(formData)`, `regenerateSecretAction(formData)`, `deleteGroupAction(formData)`
  - `createEveningAction(formData)`, `updateEveningAction(formData)`, `deleteEveningAction(formData)`
  - `createSurveyAction(formData)` (Snapshot STANDARD_QUESTIONS), `activateSurveyAction(formData)`, `closeSurveyAction(formData)`, `archiveSurveyAction(formData)`
  - `submitResponseAction(slugSecret: string, formData: FormData)` (öffentlich)
- Consumes: queries, access, lifecycle, token, questions.

- [ ] **Step 1: viewer.ts test + Implementierung**

Create `src/app/m/feedback/_lib/viewer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { viewerFromSession } from "./viewer";

describe("viewerFromSession", () => {
  it("baut Viewer aus Session", () => {
    expect(viewerFromSession({ user: { id: "u1", groups: ["da-feedback-gl"] } })).toEqual({
      sub: "u1",
      groups: ["da-feedback-gl"],
    });
  });
  it("null ohne User/id", () => {
    expect(viewerFromSession(null)).toBeNull();
    expect(viewerFromSession({ user: {} })).toBeNull();
  });
  it("leere groups wenn nicht gesetzt", () => {
    expect(viewerFromSession({ user: { id: "u1" } })).toEqual({ sub: "u1", groups: [] });
  });
});
```

Run: `pnpm vitest run src/app/m/feedback/_lib/viewer.test.ts` → FAIL.

Create `src/app/m/feedback/_lib/viewer.ts`:

```ts
import type { Viewer } from "./access";

export function viewerFromSession(
  session: { user?: { id?: string; groups?: string[] } } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return { sub: id, groups: session?.user?.groups ?? [] };
}
```

Run: `pnpm vitest run src/app/m/feedback/_lib/viewer.test.ts` → PASS.

- [ ] **Step 2: actions.ts implementieren**

Create `src/app/m/feedback/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import {
  memberGroupIdsFor,
  getGroup,
  getEvening,
  getSurvey,
  getSurveyByEvening,
  insertGroup,
  updateGroup,
  setGroupSecret,
  deleteGroup,
  insertEvening,
  updateEvening,
  deleteEvening,
  insertSurvey,
  setSurveyStatus,
  activateSurvey,
  activeSurveyForGroup,
  insertResponse,
} from "./_db/queries";
import { assertGroupAccess } from "./_lib/access";
import { viewerFromSession } from "./_lib/viewer";
import { generateSecret } from "./_lib/token";
import { STANDARD_QUESTIONS } from "./_lib/questions";
import {
  computeClosesAt,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
  type SurveyStatus,
} from "./_lib/lifecycle";
import { RateLimiter } from "./_lib/ratelimit";

const submitLimiter = new RateLimiter({ windowMs: 60_000, max: 10 });

function revalidate(): void {
  revalidatePath("/m/feedback");
  revalidatePath("/m/feedback/admin");
}

/** Guard-Helfer: aktueller Viewer + seine Gruppen-IDs, wirft Forbidden ohne Zugang. */
async function guardGroup(groupId: number) {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub) : [];
  assertGroupAccess(viewer, groupId, memberIds);
  return { viewer, db };
}

async function groupIdOfEvening(eveningId: number): Promise<number> {
  const eve = getEvening(getDb(), eveningId);
  if (!eve) throw new Error("Not found");
  return eve.groupId;
}
async function groupIdOfSurvey(surveyId: number): Promise<number> {
  const s = getSurvey(getDb(), surveyId);
  if (!s) throw new Error("Not found");
  return groupIdOfEvening(s.eveningId);
}

// ---- Gruppen ----
export async function createGroupAction(formData: FormData) {
  const viewer = viewerFromSession(await auth());
  // Nur Voll-Admin darf Gruppen anlegen (groupleader verwaltet bestehende).
  if (!viewer || !(await import("./_lib/access")).isFeedbackAdmin(viewer)) {
    throw new Error("Forbidden");
  }
  const db = getDb();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!name || !slug) throw new Error("Name und Slug erforderlich");
  const closeAfterHours = parseHours(formData.get("closeAfterHours"));
  insertGroup(db, { name, slug, secret: generateSecret(), closeAfterHours, createdAt: new Date() });
  revalidate();
}
export async function updateGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  updateGroup(db, id, {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    closeAfterHours: parseHours(formData.get("closeAfterHours")),
  });
  revalidate();
}
export async function regenerateSecretAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  setGroupSecret(db, id, generateSecret());
  revalidate();
}
export async function deleteGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  deleteGroup(db, id);
  revalidate();
}

// ---- Dienstabende ----
export async function createEveningAction(formData: FormData) {
  const groupId = num(formData.get("groupId"));
  const { db } = await guardGroup(groupId);
  insertEvening(db, {
    groupId,
    date: parseDate(formData.get("date")),
    topic: strOrNull(formData.get("topic")),
    notes: strOrNull(formData.get("notes")),
    participantCount: parseCount(formData.get("participantCount")),
    createdAt: new Date(),
  });
  revalidate();
}
export async function updateEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  updateEvening(db, id, {
    date: parseDate(formData.get("date")),
    topic: strOrNull(formData.get("topic")),
    notes: strOrNull(formData.get("notes")),
    participantCount: parseCount(formData.get("participantCount")),
  });
  revalidate();
}
export async function deleteEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  deleteEvening(db, id);
  revalidate();
}

// ---- Umfragen ----
export async function createSurveyAction(formData: FormData) {
  const eveningId = num(formData.get("eveningId"));
  const { db } = await guardGroup(await groupIdOfEvening(eveningId));
  if (getSurveyByEvening(db, eveningId)) throw new Error("Umfrage existiert bereits");
  insertSurvey(db, {
    eveningId,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: parseHours(formData.get("closeAfterHours")),
    createdAt: new Date(),
  });
  revalidate();
}
export async function activateSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  const survey = getSurvey(db, id)!;
  const eve = getEvening(db, survey.eveningId)!;
  const group = getGroup(db, eve.groupId)!;
  const hours = survey.closeAfterHours ?? group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
  const now = new Date();
  activateSurvey(db, id, computeClosesAt(now, hours), now);
  revalidate();
}
export async function closeSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  setSurveyStatus(db, id, "closed", { closedAt: new Date() });
  revalidate();
}
export async function archiveSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  setSurveyStatus(db, id, "archived");
  revalidate();
}

// ---- Öffentliche Teilnahme ----
export async function submitResponseAction(slugSecret: string, formData: FormData) {
  const db = getDb();
  const { parseToken } = await import("./_lib/token");
  const { getGroupBySlug } = await import("./_db/queries");
  const parsed = parseToken(slugSecret);
  if (!parsed) throw new Error("Ungültiger Link");
  if (!submitLimiter.check(slugSecret)) throw new Error("Zu viele Anfragen — bitte später erneut.");
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) throw new Error("Ungültiger Link");

  const active = activeSurveyForGroup(db, group.id);
  if (!active) throw new Error("Keine aktive Umfrage");
  const survey = active.survey;
  // closes_at auch auf dem Submit-Pfad prüfen (nicht nur beim Anzeigen).
  const now = new Date();
  if (nextStatusOnAccess("active", survey.closesAt, now) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: now });
    throw new Error("Umfrage bereits geschlossen");
  }

  const questions: { id: string; type: string }[] = JSON.parse(survey.questions);
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    const raw = formData.get(q.id);
    if (raw === null || String(raw).trim() === "") continue;
    answers[q.id] = q.type === "text" ? String(raw) : Number(raw);
  }
  insertResponse(db, survey.id, answers, now);

  // Mehrfach-Absende-Schutz per Cookie (24h) — 1:1 zur Alt-App (public.go:105-112).
  (await cookies()).set(`feedback-${survey.id}`, "submitted", {
    maxAge: 86400,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

// ---- Parser-Helfer ----
function num(v: FormDataEntryValue | null): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("Ungültige ID");
  return n;
}
function parseHours(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
function parseCount(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function parseDate(v: FormDataEntryValue | null): Date {
  const s = String(v ?? "");
  const d = new Date(`${s}T00:00:00Z`); // YYYY-MM-DD → Mitternacht UTC
  if (Number.isNaN(d.getTime())) throw new Error("Ungültiges Datum");
  return d;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
```

> **Import-Regel:** `getDb` kommt aus `./_db/client`, die Query-Funktionen aus `./_db/queries` — keine anderen DB-Importpfade.

- [ ] **Step 3: Typecheck + Lint**

Run: `pnpm typecheck && pnpm lint` → Expected: 0 Fehler. (Actions haben keine eigenen Unit-Tests — sie sind dünne Verdrahtung über getestete `_lib`/`queries`; Abdeckung durch das E2E in Task 16.)

- [ ] **Step 4: Commit**

```bash
git add src/app/m/feedback/actions.ts src/app/m/feedback/_lib/viewer.ts src/app/m/feedback/_lib/viewer.test.ts
git commit -m "feat(feedback): guarded Server Actions (CRUD, activate, submit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 11: Öffentliche `/f/`-Teilnahme + chrome-loses Layout

**Files:**
- Create: `src/app/m/feedback/f/layout.tsx`
- Create: `src/app/m/feedback/f/[slugSecret]/page.tsx`
- Create: `src/app/m/feedback/f/[slugSecret]/SurveyForm.tsx` (Client)
- Create: `src/app/m/feedback/f/[slugSecret]/thanks/page.tsx`
- Create: `src/app/m/feedback/f/[slugSecret]/qr.png/route.ts`

**Interfaces:**
- Consumes: `parseToken`, queries (`getGroupBySlug`, `activeSurveyForGroup`, `getEvening`), `nextStatusOnAccess`, `submitResponseAction`, `STANDARD_QUESTIONS`/gespeicherte questions.

- [ ] **Step 1: Chrome-loses Layout**

Create `src/app/m/feedback/f/layout.tsx` — bewusst OHNE `<Shell>` (kein App-Switcher für anonyme Teilnehmer). Reiner Vollbild-Container:

```tsx
import { AntdProvider } from "@/core/theme/AntdProvider";

// Eigenständiges Layout für die anonyme Teilnahme: keine Suite-Shell, kein
// App-Switcher. Nur der Theme-Provider, damit antd-Komponenten korrekt rendern.
export default function PublicFeedbackLayout({ children }: { children: React.ReactNode }) {
  return (
    <AntdProvider>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>{children}</main>
    </AntdProvider>
  );
}
```

> Reviewer: prüfe den echten Export-Namen/Signatur von `AntdProvider` (`src/core/theme/AntdProvider.tsx`) und passe Import/Props an, falls abweichend.

- [ ] **Step 2: Teilnahme-Seite (Server Component)**

Create `src/app/m/feedback/f/[slugSecret]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "../../_db/client";
import { getGroupBySlug, activeSurveyForGroup, setSurveyStatus } from "../../_db/queries";
import { parseToken } from "../../_lib/token";
import { nextStatusOnAccess } from "../../_lib/lifecycle";
import type { Question } from "../../_lib/questions";
import { SurveyForm } from "./SurveyForm";

export default async function ParticipatePage({
  params,
}: {
  params: Promise<{ slugSecret: string }>;
}) {
  const { slugSecret } = await params;
  const parsed = parseToken(slugSecret);
  if (!parsed) notFound();
  const db = getDb();
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) notFound();

  const active = activeSurveyForGroup(db, group.id);
  if (!active) {
    return <p>Zurzeit ist keine Umfrage aktiv. Vielen Dank für dein Interesse!</p>;
  }
  const survey = active.survey;
  // Lazy Auto-Close: abgelaufene aktive Umfrage sofort schließen.
  if (nextStatusOnAccess("active", survey.closesAt, new Date()) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: new Date() });
    return <p>Diese Umfrage ist inzwischen geschlossen.</p>;
  }
  // Bereits abgegeben? (Cookie)
  const already = (await cookies()).get(`feedback-${survey.id}`);
  if (already) redirect(`/f/${slugSecret}/thanks`);

  const questions: Question[] = JSON.parse(survey.questions);
  return (
    <SurveyForm
      slugSecret={slugSecret}
      groupName={group.name}
      eveningTopic={active.evening.topic}
      questions={questions}
    />
  );
}
```

- [ ] **Step 3: Formular (Client Component)**

Create `src/app/m/feedback/f/[slugSecret]/SurveyForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Rate, Typography, Space, Card } from "antd";
import type { Question } from "../../_lib/questions";
import { ratingScale } from "../../_lib/questions";
import { submitResponseAction } from "../../actions";

export function SurveyForm({
  slugSecret,
  groupName,
  eveningTopic,
  questions,
}: {
  slugSecret: string;
  groupName: string;
  eveningTopic: string | null;
  questions: Question[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await submitResponseAction(slugSecret, formData);
      router.push(`/f/${slugSecret}/thanks`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Absenden");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Typography.Title level={3}>{groupName}</Typography.Title>
        {eveningTopic ? <Typography.Text type="secondary">{eveningTopic}</Typography.Text> : null}
        {questions.map((q) => (
          <Card key={q.id} size="small" title={q.text}>
            {q.type === "text" ? (
              <Input.TextArea name={q.id} rows={3} />
            ) : (
              // schulnote UND stars als Sterne-Skala (Rating). name trägt die Zahl.
              <RatingField name={q.id} count={ratingScale(q.type)} />
            )}
          </Card>
        ))}
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
        <Button type="primary" htmlType="submit" loading={pending} block size="large">
          Absenden
        </Button>
      </Space>
    </form>
  );
}

function RatingField({ name, count }: { name: string; count: number }) {
  const [value, setValue] = useState(0);
  return (
    <>
      <input type="hidden" name={name} value={value || ""} />
      <Rate count={count} value={value} onChange={setValue} />
    </>
  );
}
```

> Reviewer/Umsetzer: `Typography.Title`, `Input.TextArea`, `Card` etc. sind hier zulässig, weil die Datei `"use client"` ist (die Compound-Falle betrifft nur Server-Komponenten). Die Server-Seite (`page.tsx`) verwendet KEINE antd-Compound-Zugriffe.

- [ ] **Step 4: Danke-Seite + QR-PNG-Route**

Create `src/app/m/feedback/f/[slugSecret]/thanks/page.tsx`:

```tsx
export default function ThanksPage() {
  return <p>Vielen Dank für deine Rückmeldung! 🙏</p>;
}
```

Create `src/app/m/feedback/f/[slugSecret]/qr.png/route.ts` (QR-Bild des Teilnahme-Links; `qrcode`-Lib ist bereits Dependency):

```ts
import QRCode from "qrcode";
import { getDb } from "../../../_db/client";
import { getGroupBySlug } from "../../../_db/queries";
import { parseToken } from "../../../_lib/token";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slugSecret: string }> },
) {
  const { slugSecret } = await params;
  const parsed = parseToken(slugSecret);
  if (!parsed) return new Response("Not found", { status: 404 });
  const group = getGroupBySlug(getDb(), parsed.slug);
  if (!group || group.secret !== parsed.secret) return new Response("Not found", { status: 404 });

  const url = new URL(`/f/${slugSecret}`, req.url).toString();
  const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
```

- [ ] **Step 5: Tatsächlich abrufen (Server-Component-Regel)**

Run: `pnpm build && pnpm start -p 3100 &` (kurz), dann in Dev bevorzugt `pnpm dev` und manuell:
- Seed eine Gruppe mit aktiver Umfrage (Task 14 liefert Seed; bis dahin per SQL/REPL) und rufe `http://feedback.localtest.me:3000/f/<slug>-<secret>` ab.
Expected: Formular rendert (HTTP 200), kein 500. `/f/<token>/thanks` zeigt Dankestext, `/f/<token>/qr.png` liefert ein PNG.

- [ ] **Step 6: Commit**

```bash
git add src/app/m/feedback/f
git commit -m "feat(feedback): anonyme Teilnahme /f/{slug-secret} (chrome-los, lazy-close, QR)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 12: Verwaltungs-UI (full-Shell)

**Files:**
- Create: `src/app/m/feedback/layout.tsx` (full-Shell)
- Create: `src/app/m/feedback/page.tsx` (Dashboard: gescopte Gruppenliste)
- Create: `src/app/m/feedback/groups/[groupId]/page.tsx` (Dienstabende einer Gruppe)
- Create: `src/app/m/feedback/groups/[groupId]/evenings/[eveningId]/page.tsx` (Umfrage-Detail + Aktionen)
- Create: Client-Formular-Komponenten: `GroupForm.tsx`, `EveningForm.tsx`, `SurveyControls.tsx`

**Interfaces:**
- Consumes: `auth`, `viewerFromSession`, `accessibleGroupFilter`/`assertGroupAccess`, queries, actions.

- [ ] **Step 1: Modul-Layout (full-Shell)**

Create `src/app/m/feedback/layout.tsx` — Muster wie qr `layout.tsx`, aber ohne PWA:

```tsx
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("feedback");
  return (
    <Shell variant={mod.shell} moduleKey={mod.key}>
      {children}
    </Shell>
  );
}
```

> Hinweis: Dieses Layout gilt NICHT für `/f/*` — die `f/`-Route-Group hat ihr eigenes Layout aus Task 11 und liegt eine Ebene tiefer, überschreibt also die Shell für den öffentlichen Zweig.

- [ ] **Step 2: Dashboard (gescopte Gruppen)**

Create `src/app/m/feedback/page.tsx` (Server Component — KEINE antd-Compound-Zugriffe; Tabellen/Listen in eine Client-Komponente auslagern falls Compound nötig):

```tsx
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import { listGroups, memberGroupIdsFor } from "./_db/queries";
import { viewerFromSession } from "./_lib/viewer";
import { accessibleGroupFilter, isFeedbackAdmin } from "./_lib/access";
import { GroupForm } from "./GroupForm";
import { GroupList } from "./GroupList";

export default async function FeedbackDashboard() {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub) : [];
  const filter = accessibleGroupFilter(viewer, memberIds);
  const all = listGroups(db);
  const groups = filter === "all" ? all : all.filter((g) => filter.includes(g.id));

  return (
    <section style={{ padding: 16 }}>
      <h1>Feedback — Gruppen</h1>
      <GroupList groups={groups.map((g) => ({ id: g.id, name: g.name, slug: g.slug }))} />
      {isFeedbackAdmin(viewer) ? <GroupForm /> : null}
    </section>
  );
}
```

Create `src/app/m/feedback/GroupList.tsx` (Client — nutzt antd `Table`/`List`):

```tsx
"use client";
import Link from "next/link";
import { List } from "antd";

export function GroupList({ groups }: { groups: { id: number; name: string; slug: string }[] }) {
  return (
    <List
      dataSource={groups}
      locale={{ emptyText: "Keine Gruppen" }}
      renderItem={(g) => (
        <List.Item>
          <Link href={`/m/feedback/groups/${g.id}`}>{g.name}</Link>
        </List.Item>
      )}
    />
  );
}
```

Create `src/app/m/feedback/GroupForm.tsx` (Client — `createGroupAction` per `<form action>`):

```tsx
"use client";
import { Button, Input, Space } from "antd";
import { createGroupAction } from "./actions";

export function GroupForm() {
  return (
    <form action={createGroupAction}>
      <Space>
        <Input name="name" placeholder="Name" required />
        <Input name="slug" placeholder="slug" required />
        <Input name="closeAfterHours" placeholder="Frist (h)" type="number" />
        <Button htmlType="submit" type="primary">Gruppe anlegen</Button>
      </Space>
    </form>
  );
}
```

- [ ] **Step 3: Gruppen-Detail (Dienstabende) + Umfrage-Detail**

Create `src/app/m/feedback/groups/[groupId]/page.tsx` — lädt Gruppe + Dienstabende, ruft `assertGroupAccess` (über den guardGroup-Pfad aus einer Server-Hilfsfunktion oder inline: Viewer + memberIds laden, sonst `notFound()`), rendert `EveningForm` + Liste mit Links zu `evenings/[eveningId]`.

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "../../_db/client";
import { getGroup, listEvenings, memberGroupIdsFor } from "../../_db/queries";
import { viewerFromSession } from "../../_lib/viewer";
import { assertGroupAccess } from "../../_lib/access";
import { EveningForm } from "../../EveningForm";

export default async function GroupDetail({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub) : [];
  try {
    assertGroupAccess(viewer, id, memberIds);
  } catch {
    notFound(); // 404 statt 403 — verrät die Existenz nicht (wie moduleAdminPageOrNotFound)
  }
  const group = getGroup(db, id);
  if (!group) notFound();
  const evenings = listEvenings(db, id);

  return (
    <section style={{ padding: 16 }}>
      <h1>{group.name}</h1>
      <p>QR-Token-Basis: <code>{group.slug}-{group.secret}</code></p>
      <ul>
        {evenings.map((e) => (
          <li key={e.id}>
            <Link href={`/m/feedback/groups/${id}/evenings/${e.id}`}>
              {new Date(e.date).toISOString().slice(0, 10)} — {e.topic ?? "(ohne Thema)"}
            </Link>
          </li>
        ))}
      </ul>
      <EveningForm groupId={id} />
    </section>
  );
}
```

Create `src/app/m/feedback/groups/[groupId]/evenings/[eveningId]/page.tsx` — analog gescoped; zeigt Umfrage-Status + `SurveyControls` (Buttons für createSurvey/activate/close/archive je nach Status) + Link zur Auswertung (Task 13). Guard identisch (Viewer + memberIds → assertGroupAccess über die group_id des Dienstabends, sonst `notFound()`).

Create `src/app/m/feedback/EveningForm.tsx` und `SurveyControls.tsx` als `"use client"`-Formulare, die `createEveningAction` bzw. `createSurveyAction`/`activateSurveyAction`/`closeSurveyAction`/`archiveSurveyAction` per `<form action>` aufrufen (Muster wie `GroupForm`).

- [ ] **Step 4: Typecheck + tatsächlich abrufen**

Run: `pnpm typecheck` → 0 Fehler. Dann `pnpm dev`, als eingeloggter Admin (Dev-Login) `http://feedback.localtest.me:3000/m/feedback` und eine Gruppen-/Dienstabend-Seite abrufen → HTTP 200, kein 500 (Server-Component-Compound-Falle ausgeschlossen).

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/layout.tsx src/app/m/feedback/page.tsx src/app/m/feedback/groups src/app/m/feedback/GroupList.tsx src/app/m/feedback/GroupForm.tsx src/app/m/feedback/EveningForm.tsx src/app/m/feedback/SurveyControls.tsx
git commit -m "feat(feedback): Verwaltungs-UI (Dashboard, Gruppen, Dienstabende, Umfrage-Steuerung)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 13: Auswertungs-UI + Recharts-Wrapper in `core`

**Files:**
- Modify: `package.json` (Dependency `recharts`)
- Create: `src/core/charts/BarChart.tsx`, `src/core/charts/LineChart.tsx` (dünne `"use client"`-Wrapper)
- Create: `src/app/m/feedback/groups/[groupId]/evenings/[eveningId]/auswertung/page.tsx` (DA-Stats)
- Create: `src/app/m/feedback/groups/[groupId]/trend/page.tsx` (Trend)
- Create: `src/app/m/feedback/vergleich/page.tsx` (Gruppen-Vergleich, nur admin)
- Create: `src/app/m/feedback/groups/[groupId]/evenings/[eveningId]/export.csv/route.ts` (CSV)
- Create: `src/app/m/feedback/groups/[groupId]/evenings/[eveningId]/prompt/page.tsx` (KI-Prompt, gesperrt bei active)
- Create: `src/core/charts/BarChart.test.tsx`

**Interfaces:**
- Produces: `BarChart({ data, xKey, yKey })`, `LineChart({ data, xKey, yKey })` (data: `Record<string, string | number | null>[]`).
- Consumes: `computeDAStats`, `computeGroupTrend`, `GroupComparison`, `buildCsv`/`joinTexts`, `buildAnalysisPrompt`, queries.

- [ ] **Step 1: recharts hinzufügen**

Run: `pnpm add recharts` → Expected: recharts in `dependencies`.

- [ ] **Step 2: Chart-Wrapper + Smoke-Test**

Create `src/core/charts/BarChart.tsx`:

```tsx
"use client";
import { ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export function BarChart({
  data,
  xKey,
  yKey,
  domain,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  yKey: string;
  domain?: [number, number];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} />
        <YAxis domain={domain} />
        <Tooltip />
        <Bar dataKey={yKey} fill="#c8000f" />
      </RBarChart>
    </ResponsiveContainer>
  );
}
```

Create `src/core/charts/LineChart.tsx` (analog, `LineChart`/`Line` aus recharts, gleiche Props + `connectNulls={false}`).

Create `src/core/charts/BarChart.test.tsx` (Smoke — rendert ohne Fehler mit jsdom):

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BarChart } from "./BarChart";

describe("BarChart", () => {
  it("rendert ohne Absturz", () => {
    const { container } = render(
      <BarChart data={[{ x: "q1", y: 2.5 }]} xKey="x" yKey="y" domain={[1, 6]} />,
    );
    expect(container).toBeTruthy();
  });
});
```

Run: `pnpm vitest run src/core/charts/BarChart.test.tsx` → PASS.

- [ ] **Step 3: Auswertungs-Seiten**

- `auswertung/page.tsx`: lädt Umfrage + `listResponses`, `computeDAStats(JSON.parse(questions), answers)`, rendert `BarChart` (perQuestion mit avg, domain je Skala), Gesamt-Ø, Freitextlisten. Guard gescoped.
- `trend/page.tsx`: lädt alle Dienstabende der Gruppe + je Umfrage-Responses, baut `{ date, stats }[]`, `computeGroupTrend(from, to)` (Default 12 Monate), rendert `LineChart`. Guard gescoped.
- `vergleich/page.tsx`: nur admin (`isFeedbackAdmin` → sonst `notFound()`), aggregiert `GroupComparison[]` über alle Gruppen, rendert `BarChart`.
- `export.csv/route.ts`: baut Matrix aus Responses, `buildCsv`, liefert `text/csv` mit `content-disposition: attachment`. Guard gescoped.
- `prompt/page.tsx`: gesperrt solange Umfrage `active` (dann Hinweis statt Prompt); sonst `buildAnalysisPrompt(...)` in ein `<textarea readonly>` zum Kopieren. Guard gescoped.

Alle Server-Component-Seiten: KEINE antd-Compound-Zugriffe; Chart-Wrapper und interaktive Teile sind Client-Komponenten.

- [ ] **Step 4: Typecheck + Abruf**

Run: `pnpm typecheck` → 0 Fehler. `pnpm dev`, Auswertungs-, Trend-, Prompt-Seite und `export.csv` mit geseedeten Daten abrufen → 200, Charts sichtbar, CSV lädt herunter, Vergleich für Nicht-Admin 404.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/core/charts src/app/m/feedback/groups src/app/m/feedback/vergleich
git commit -m "feat(feedback): Auswertungen (DA-Stats, Trend, Vergleich, CSV, KI-Prompt) + Recharts-core-Wrapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 14: `seedFeedback` — Dev-Daten

**Files:**
- Modify: `src/app/m/feedback/_lib/seed.ts` (Stub aus Task 1 ersetzen)
- Test: `src/app/m/feedback/_lib/seed.test.ts`

**Interfaces:**
- Produces: `seedFeedback(db)` legt eine Gruppe + einen Dienstabend + eine **aktive** Umfrage (StandardQuestions-Snapshot) + ein paar Antworten idempotent an.

- [ ] **Step 1: Failing test**

Create `src/app/m/feedback/_lib/seed.test.ts` (echtes SQLite in memory, migrate, seed zweimal → idempotent):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { seedFeedback } from "./seed";
import { listGroups, activeSurveyForGroup } from "@/app/m/feedback/_db/queries";

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
  it("legt Gruppe + aktive Umfrage an und ist idempotent", async () => {
    await seedFeedback(db);
    await seedFeedback(db);
    const groups = listGroups(db);
    expect(groups).toHaveLength(1);
    expect(activeSurveyForGroup(db, groups[0].id)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run src/app/m/feedback/_lib/seed.test.ts` → FAIL (Stub legt nichts an).

- [ ] **Step 3: seed.ts füllen**

Ersetze `src/app/m/feedback/_lib/seed.ts` — idempotent per festem slug (`onConflictDoNothing` bzw. Existenzprüfung), Gruppe „Demo", Dienstabend heute, aktive Umfrage mit `STANDARD_QUESTIONS`-Snapshot, `closesAt` in der Zukunft, 2–3 Antworten. Nutzt `computeClosesAt`. (Vollständige Implementierung analog `seedQr`, mit Existenzprüfung `getGroupBySlug(db,"demo")` als Idempotenz-Gate.)

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run src/app/m/feedback/_lib/seed.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/feedback/_lib/seed.ts src/app/m/feedback/_lib/seed.test.ts
git commit -m "feat(feedback): Seed mit aktiver Demo-Umfrage (idempotent)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 15: Import-Skript + Zeitstempel-Normalisierung + Paritätscheck

**Files:**
- Create: `scripts/import/feedback-time.ts` (Normalisierung, rein)
- Create: `scripts/import/feedback-time.test.ts`
- Create: `scripts/import/feedback.ts`
- Create: `scripts/import/feedback.test.ts`

**Interfaces:**
- Produces:
  - `normalizeTimestamp(raw: string): number` — Unix-Sekunden
  - `runFeedbackImport(sourceDbPath: string): Promise<void>` (migrate → import groups/evenings/surveys/responses/user_groups, IDs 1:1 → parity → assert)
- Consumes: `checkParity`/`assertParity` aus `scripts/import/parity.ts`.

- [ ] **Step 1: Normalisierung — Failing test**

Create `scripts/import/feedback-time.test.ts` (echte Beispielwerte aus der Analyse):

```ts
import { describe, it, expect } from "vitest";
import { normalizeTimestamp } from "./feedback-time";

describe("normalizeTimestamp", () => {
  it("parst Go time.Time mit Monotonic-Suffix + lokaler TZ (+0200)", () => {
    // 2026-04-09 09:24:31 +0200 == 07:24:31 UTC == 1775719471
    const sec = normalizeTimestamp("2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 7, 24, 31) / 1000));
  });
  it("parst SQLite CURRENT_TIMESTAMP (UTC, ohne TZ-Angabe)", () => {
    const sec = normalizeTimestamp("2026-04-09 07:24:28");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 7, 24, 28) / 1000));
  });
  it("parst UTC-Datum aus Datums-Parse (+0000 UTC)", () => {
    const sec = normalizeTimestamp("2026-04-09 00:00:00 +0000 UTC");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 0, 0, 0) / 1000));
  });
});
```

- [ ] **Step 2: Test schlägt fehl** — Run: `pnpm vitest run scripts/import/feedback-time.test.ts` → FAIL.

- [ ] **Step 3: Normalisierung implementieren**

Create `scripts/import/feedback-time.ts`:

```ts
/**
 * Die Alt-DB mischt zwei Formate:
 *  1. Go time.Time.String(): "2006-01-02 15:04:05.999999 -0700 MST m=+…"
 *     — lokale TZ als numerischer Offset + Monotonic-Suffix (muss weg).
 *  2. SQLite CURRENT_TIMESTAMP: "2006-01-02 15:04:05" — UTC, ohne Offset.
 * Beide → Unix-Sekunden (integer-timestamp-Ziel, Sekundenauflösung).
 */
export function normalizeTimestamp(raw: string): number {
  const s = raw.trim();
  // Monotonic-Suffix " m=+…" abschneiden.
  const noMono = s.replace(/\s+m=[+-][\d.]+$/, "");

  // Fall 1: enthält numerischen Offset "+HHMM" oder "-HHMM".
  const m = noMono.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s+([+-])(\d{2})(\d{2})\b/,
  );
  if (m) {
    const [, y, mo, d, h, mi, se, sign, oh, om] = m;
    const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
    const offsetMs = (sign === "+" ? 1 : -1) * (+oh * 60 + +om) * 60_000;
    return Math.floor((utcMs - offsetMs) / 1000);
  }

  // Fall 2: kein Offset → als UTC interpretieren.
  const m2 = noMono.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m2) {
    const [, y, mo, d, h, mi, se] = m2;
    return Math.floor(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) / 1000);
  }

  throw new Error(`Unbekanntes Zeitstempel-Format: ${raw}`);
}
```

- [ ] **Step 4: Test grün** — Run: `pnpm vitest run scripts/import/feedback-time.test.ts` → PASS.

- [ ] **Step 5: Import-Skript + Paritätstest**

Create `scripts/import/feedback.ts` (Muster `scripts/import/portal.ts`): öffnet die Alt-SQLite read-only, liest je Tabelle (`groups`, `evenings`, `surveys`, `responses`, `user_groups`), mappt mit reinen `toNew*`-Funktionen (IDs 1:1, Timestamps über `normalizeTimestamp` → `new Date(sec*1000)`, `questions`/`answers` als roher JSON-String übernehmen), idempotenter Upsert per PK, `parityView` normalisiert beide Seiten (Timestamps auf Sekunden), `checkParity` → `assertParity`. CLI-Guard `if (import.meta.url === ...) runFeedbackImport(process.argv[2])`.

Create `scripts/import/feedback.test.ts` — Fixture-Alt-DB in memory mit je 1–2 Zeilen pro Tabelle (inkl. einer `stars`-Alt-Umfrage im `questions`-JSON), Import, dann: (a) Zeilen 1:1 vorhanden, IDs erhalten; (b) `questions`/`answers`-JSON unverändert; (c) Idempotenz: zweiter Import ohne Duplikate; (d) Parität grün. **Mutations-Check:** dokumentiere, dass ein absichtlich verändertes Mapping (z. B. ID+1, Timestamp roh) den Test rot macht — verifiziere das einmal manuell und beschreibe es im Commit.

- [ ] **Step 6: Tests grün + Typecheck**

Run: `pnpm vitest run scripts/import/feedback.test.ts scripts/import/feedback-time.test.ts && pnpm typecheck` → PASS, 0 Fehler.

- [ ] **Step 7: Commit**

```bash
git add scripts/import/feedback.ts scripts/import/feedback.test.ts scripts/import/feedback-time.ts scripts/import/feedback-time.test.ts
git commit -m "feat(feedback): Import-Skript + Zeitstempel-Normalisierung (Parität, mutations-falsifiziert)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

### Task 16: E2E — anonyme Teilnahme + Admin-Flow

**Files:**
- Create: `e2e/feedback.spec.ts`
- Modify: `e2e/keystone.spec.ts` (nur falls nötig — feedback in Switcher-Erwartung aufnehmen)

**Interfaces:**
- Consumes: Muster aus `e2e/qr.spec.ts` + `e2e/fixtures.ts`.

- [ ] **Step 1: E2E-Spec schreiben**

Create `e2e/feedback.spec.ts` mit zwei Szenarien:
- **Anonyme Teilnahme:** Seed liefert Gruppe „demo" mit aktiver Umfrage; navigiere zu `/f/demo-<secret>` (Secret aus Seed bzw. per Query der DB im Test-Setup), fülle Ratings + einen Freitext, „Absenden", erwarte `/f/demo-<secret>/thanks`. Erneuter Aufruf von `/f/demo-<secret>` → wegen Dedup-Cookie Redirect auf `/thanks`.
- **Admin-Flow:** als Dev-Login-Admin `/m/feedback` öffnen, neue Gruppe anlegen, Dienstabend anlegen, Umfrage erstellen + aktivieren, dann schließen, Auswertungsseite lädt (Ø sichtbar). 

Guards: als groupleader ohne Zuordnung darf eine fremde `groups/<id>` 404 liefern (ein Assert dafür, deckt die IDOR-Absicherung ab).

- [ ] **Step 2: E2E laufen lassen**

Run: `pnpm e2e e2e/feedback.spec.ts`
Expected: PASS (beide Szenarien grün).

- [ ] **Step 3: Volllauf aller Gates**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run && pnpm e2e`
Expected: typecheck 0 · lint 0 Errors · alle Unit-Tests grün · E2E grün.

- [ ] **Step 4: Commit**

```bash
git add e2e/feedback.spec.ts
git commit -m "test(feedback): E2E — anonyme Teilnahme + Admin-Flow + IDOR-Guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX"
```

---

## Self-Review — Spec-Coverage

| Spec-Abschnitt | Task(s) |
|---|---|
| Modul-Anatomie / Kein PWA | 1, 11, 12 |
| Datenmodell (5 Tabellen, CHECK/UNIQUE/Index, integer-timestamp) | 1 |
| Rollen & Zugriff — eine Ownership-Guard | 9 (access.ts), angewandt in 10, 11, 12, 13 |
| Öffentliche Teilnahme (QR-Token 1:1, chrome-los, Dedup-Cookie, Rate-Limit) | 2 (token), 8 (ratelimit), 10 (submit), 11 (Layout/Routen) |
| Lebenszyklus — zwei Close-Mechanismen | 4 (lazy, rein), 9 (activate schließt andere), 10+11 (Submit-/GET-Pfad) |
| Fragen-Modell (schulnote+text neu, stars read-only) | 3 (questions), 5 (aggregation stars), 10 (Snapshot) |
| Auswertungen & Charts (Recharts, Trend-Rebuild) | 5 (Trend/off-by-one), 13 (UI + Recharts) |
| CSV (Doppel-JSON geradegezogen) | 6, 13 |
| KI-Prompt (gesperrt bei active) | 7, 13 |
| Import & Paritätscheck + Zeitstempel-Normalisierung | 15 |
| Registrierungs-Kopplung | 1 |
| Tests & Gates | jeder Task; E2E in 16 |

**Notierte Abweichungen/Reviewer-Punkte:**
1. `viewer.ts` nimmt an, dass `session.user.id` dem OIDC-`sub` entspricht (wie qr `session?.user?.id`). Falls die Session den `sub` separat führt, dort anpassen — betrifft `user_groups`-Matching.
3. `AntdProvider`-Import in Task 11/`f/layout.tsx` gegen den echten Export in `src/core/theme/AntdProvider.tsx` verifizieren.
4. Server Actions haben keine isolierten Unit-Tests (dünne Verdrahtung über getestete `_lib`/`queries`); Abdeckung über E2E (Task 16). Bewusst, hält den Plan schlank.
5. Der globale „alle-"-QR ist NICHT enthalten (Spec-Entscheidung); vor Cutover prüfen, ob gedruckte Exemplare existieren.
