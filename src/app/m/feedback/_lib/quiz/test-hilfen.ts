// NUR FÜR TESTS: gemeinsame Vorrichtung der Route-Tests des Live-Quiz (frische In-Memory-Datenbank,
// ein Quiz, Anfragen bauen, SSE lesen). Kein Produktionsmodul importiert diese Datei;
// `test-hilfen.wache.test.ts` riegelt das ab.
import { registerAuditFunctions } from "@/core/audit/context";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertGroup } from "@/app/m/feedback/_db/queries";
import { legeQuizAn } from "@/app/m/feedback/_db/quiz";
import type { QuizFrage, QuizModus } from "./fragen";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/** 2026-11-25 19:00 in Berlin. */
export const JETZT = new Date("2026-11-25T18:00:00Z");

export function frischeDb(): { sqlite: Database.Database; db: TestDb } {
  const sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  // Der Stand hängt an globalThis und überlebte sonst den Test (Runde 1 gibt es in jedem).
  (
    globalThis as { __iukQuizStand?: Map<number, unknown> }
  ).__iukQuizStand?.clear();
  return { sqlite, db };
}

export const FRAGEN: QuizFrage[] = [
  {
    text: "Welcher Kanal?",
    typ: "einfach",
    optionen: ["A", "B", "C"],
    richtig: [1],
    zeit_s: 20,
  },
  {
    text: "Welche Rufnamen?",
    typ: "mehrfach",
    optionen: ["X", "Y", "Z"],
    richtig: [0, 2],
  },
];

let gruppen = 0;
export function mkQuiz(
  db: TestDb,
  modus: QuizModus = "wettbewerb",
  fragen: QuizFrage[] = FRAGEN,
) {
  gruppen++;
  const g = insertGroup(db, {
    name: `G${gruppen}`,
    slug: `g${gruppen}`,
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  return legeQuizAn(db, {
    groupId: g.id,
    titel: "Funk",
    modus,
    fragen,
    jetzt: JETZT,
  });
}

export function post(
  pfad: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost:3000${pfad}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

export function get(
  pfad: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Request {
  return new Request(`http://localhost:3000${pfad}`, { headers, signal });
}

export const params = <T>(p: T) => ({ params: Promise.resolve(p) });

const dec = new TextDecoder();
/** Das nächste SSE-Ereignis als Objekt (`data: …`), `null` beim Ende des Stroms. */
export async function naechstesEreignis(
  r: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ roh: string; daten: unknown } | null> {
  const { value, done } = await r.read();
  if (done) return null;
  const roh = dec.decode(value);
  const zeile = roh.split("\n").find((z) => z.startsWith("data: "));
  return { roh, daten: zeile ? JSON.parse(zeile.slice(6)) : null };
}

/** `Set-Cookie` → `name=wert` für den nächsten Request. */
export function cookieAus(res: Response): string {
  const kopf = res.headers.get("set-cookie") ?? "";
  return kopf.split(";")[0];
}
