import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertEvening, insertGroup, insertSurvey } from "@/app/m/feedback/_db/queries";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";

/**
 * DIE ABEND-DETAILSEITE ALS REDIRECT (§4.16: „Abend-Detailseite
 * `evenings/[eveningId]` entfällt als eigener Screen (Redirect auf die
 * Auswertung, damit alte Links und Prefetches nicht ins Leere laufen)").
 *
 * DREI ZUSAGEN, DIE STILL BRECHEN KOENNEN:
 *
 * 1. DER GUARD STEHT VOR DEM SPRUNG. Wer eine fremde Gruppe nicht sehen darf,
 *    bekommt 404 — und ausdruecklich KEIN Redirect: allein das Sprungziel
 *    verriete, zu welcher Gruppe ein fremder Abend gehoert (IDOR). Der Test
 *    prueft deshalb nicht nur den Wurf, sondern dass `redirect` NICHT gerufen
 *    wurde.
 * 2. OHNE UMFRAGE GEHT ES AUFS COCKPIT. `.../auswertung` antwortet fuer einen
 *    nachgetragenen Abend mit 404 („ohne Umfrage nichts auszuwerten") — ein
 *    Redirect in einen garantierten 404 waere schlechter als der Zustand vorher.
 * 3. DIE ALTE UMFRAGESTEUERUNG IST WEG. `SurveyControls` bot „Umfrage
 *    erstellen"/„Aktivieren"/„Schließen"/„Archivieren" — den Dreischritt, den das
 *    Release als abgeschafft ankuendigt, und den Schreibweg fuer `draft` und
 *    `archived`, die die Spec nicht mehr schreiben will.
 */
const { redirectMock, authMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound()");
  },
  redirect: redirectMock,
}));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("../../../../../_db/client", () => ({ getDb: () => db }));

import EveningDetail from "./page";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

/** Gruppenleitung von „bereitschaft" — `memberGroupIdsFor` loest den Slug auf. */
const alsLeitung = (slug: string) =>
  authMock.mockResolvedValue({ user: { id: "leitung-1", groups: [], fachgruppen: [slug] } });

function gruppe(slug: string) {
  return insertGroup(db, {
    name: slug,
    slug,
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
}
function abend(groupId: number, mitUmfrage: boolean) {
  const evening = insertEvening(db, {
    groupId,
    date: new Date("2026-07-22T00:00:00Z"),
    topic: null,
    notes: null,
    participantCount: null,
    createdAt: new Date(0),
  });
  if (mitUmfrage) {
    insertSurvey(db, {
      eveningId: evening.id,
      questions: JSON.stringify(STANDARD_QUESTIONS),
      closeAfterHours: 48,
      createdAt: new Date(0),
    });
  }
  return evening;
}

const aufrufen = (groupId: number, eveningId: number) =>
  EveningDetail({
    params: Promise.resolve({ groupId: String(groupId), eveningId: String(eveningId) }),
  });

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  redirectMock.mockReset();
  authMock.mockReset();
});
afterEach(() => sqlite.close());

describe("Abend-Detailseite — nur noch ein Redirect (§4.16)", () => {
  it("springt mit Umfrage auf die Auswertung", async () => {
    const g = gruppe("bereitschaft");
    const e = abend(g.id, true);
    alsLeitung("bereitschaft");

    await aufrufen(g.id, e.id);

    expect(redirectMock).toHaveBeenCalledWith(
      `/m/feedback/groups/${g.id}/evenings/${e.id}/auswertung`,
    );
  });

  it("springt ohne Umfrage aufs Cockpit — nicht in den garantierten 404", async () => {
    const g = gruppe("bereitschaft");
    const e = abend(g.id, false);
    alsLeitung("bereitschaft");

    await aufrufen(g.id, e.id);

    expect(redirectMock).toHaveBeenCalledWith(`/m/feedback/groups/${g.id}`);
  });

  it("wirft fuer einen fremden Abend 404 und springt NICHT", async () => {
    gruppe("bereitschaft");
    const fremd = gruppe("jugendrotkreuz");
    const e = abend(fremd.id, true);
    alsLeitung("bereitschaft");

    await expect(aufrufen(fremd.id, e.id)).rejects.toThrow("notFound()");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("wirft 404, wenn der URL-`groupId` nicht zum Abend passt", async () => {
    const g = gruppe("bereitschaft");
    const andere = gruppe("zweite");
    const e = abend(g.id, true);
    alsLeitung("bereitschaft");

    await expect(aufrufen(andere.id, e.id)).rejects.toThrow("notFound()");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("wirft 404 fuer einen unbekannten Abend", async () => {
    const g = gruppe("bereitschaft");
    alsLeitung("bereitschaft");

    await expect(aufrufen(g.id, 4711)).rejects.toThrow("notFound()");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
