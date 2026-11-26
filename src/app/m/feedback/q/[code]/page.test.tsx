import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type Database from "better-sqlite3";
import { beendeRunde, setzeSchritt, starteOderHoleRunde, tritteBei } from "@/app/m/feedback/_db/quiz";
import { frischeDb, JETZT, mkQuiz, params, type TestDb } from "@/app/m/feedback/_lib/quiz/test-hilfen";
import { meldeRunde } from "@/app/m/feedback/_lib/quiz/stand";
import type { HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { PROBE_JE_MINUTE, probeGrenze } from "@/app/m/feedback/_lib/quiz/grenzen";

let sqlite: Database.Database;
let db: TestDb;
let keks: Record<string, string> = {};
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
let ip = "10.9.0.1";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n in keks ? { name: n, value: keks[n] } : undefined) }),
  headers: async () => new Headers({ "cf-connecting-ip": ip }),
}));

beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  keks = {};
  vi.useFakeTimers({ now: JETZT });
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

async function anfang(code: string): Promise<HandySicht | null> {
  const { default: Seite } = await import("./page");
  const el = (await Seite(params({ code }))) as ReactElement<{ anfang: HandySicht | null }>;
  return el.props.anfang;
}

describe("q/[code] page", () => {
  it("unbekannter oder beendeter Code: `null` (Zustand „Quiz ist beendet“), kein Fehler", async () => {
    expect(await anfang("ZZZZZZ")).toBeNull();
    expect(await anfang("X".repeat(200))).toBeNull();
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    beendeRunde(db, r.id, JETZT);
    expect(await anfang(r.beitrittCode)).toBeNull();
  });

  it("gibt eine serialisierbare Sicht weiter, mit der Teilnahme aus dem Cookie", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    setzeSchritt(db, r.id, 1, JETZT);
    const ohne = await anfang(r.beitrittCode.toLowerCase());
    expect(ohne).toMatchObject({ dabei: false, phase: { art: "frage" } });
    expect(JSON.parse(JSON.stringify(ohne))).toEqual(ohne);

    tritteBei(db, r, { token: "tok", spitzname: "Anna" });
    meldeRunde(r); // wie der Beitrittsweg: Stand verwerfen
    keks = { [`iuk-quiz-${r.id}`]: "tok" };
    expect(await anfang(r.beitrittCode)).toMatchObject({ dabei: true });
  });

  it("Code-Orakel: jeder Fehlgriff zählt gegen die Probegrenze der Adresse, ein Treffer nicht", async () => {
    const r = starteOderHoleRunde(db, mkQuiz(db), JETZT);
    ip = "10.9.1.1";
    expect(await anfang(r.beitrittCode)).not.toBeNull();
    expect(probeGrenze.istGesperrt(ip)).toBe(false);
    for (let i = 0; i < PROBE_JE_MINUTE; i++) expect(await anfang(i % 2 ? "ZZZZZZ" : "X".repeat(200))).toBeNull();
    expect(probeGrenze.istGesperrt(ip)).toBe(true);
    // Gesperrt: dieselbe Antwort wie für jeden Fehlgriff, kein Fehler, kein 429.
    expect(await anfang("ZZZZZZ")).toBeNull();
    ip = "10.9.1.2";
    expect(probeGrenze.istGesperrt(ip)).toBe(false);
  });
});
