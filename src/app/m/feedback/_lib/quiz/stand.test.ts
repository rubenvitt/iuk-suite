import { registerAuditFunctions } from "@/core/audit/context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertGroup } from "@/app/m/feedback/_db/queries";
import { rundenStand } from "@/app/m/feedback/_db/quiz";
import {
  legeQuizAn,
  starteOderHoleRunde,
  tritteBei,
} from "@/app/m/feedback/_db/quiz";
import {
  holeAutoEndeNach,
  leseStand,
  meldeRunde,
  planeZeitende,
  quizKanal,
  STAND_TTL_MS,
} from "./stand";
import { abonniere } from "./verteiler";

// Zählt die Lesezugriffe, ohne sie zu ändern.
vi.mock("@/app/m/feedback/_db/quiz", async (importOriginal) => {
  const echt =
    await importOriginal<typeof import("@/app/m/feedback/_db/quiz")>();
  return { ...echt, rundenStand: vi.fn(echt.rundenStand) };
});
const spion = vi.mocked(rundenStand);

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
const JETZT = new Date("2026-11-25T18:00:00Z");

beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  vi.useFakeTimers({ now: JETZT });
  // Der Speicher hängt an globalThis und überlebte sonst den Test (Runde 1 gibt es in jedem).
  (
    globalThis as { __iukQuizStand?: Map<number, unknown> }
  ).__iukQuizStand?.clear();
  spion.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

function mkRunde() {
  const g = insertGroup(db, {
    name: "G",
    slug: "g",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  const q = legeQuizAn(db, {
    groupId: g.id,
    titel: "Funk",
    modus: "wettbewerb",
    fragen: [
      {
        text: "?",
        typ: "einfach",
        optionen: ["A", "B"],
        richtig: [0],
        zeit_s: 10,
      },
    ],
    jetzt: JETZT,
  });
  return { q, r: starteOderHoleRunde(db, q, JETZT) };
}

describe("leseStand (ein Lesen je Runde und Auslösung)", () => {
  it("liest innerhalb der TTL nur einmal, für alle Abonnenten derselben Auslösung", () => {
    const { r } = mkRunde();
    const gelesen: string[] = [];
    const ab = [1, 2, 3].map(() =>
      abonniere(r.id, () => gelesen.push(leseStand(db, r.id)!.titel)),
    );
    meldeRunde(r);
    vi.advanceTimersByTime(250);
    expect(gelesen).toEqual(["Funk", "Funk", "Funk"]);
    expect(spion).toHaveBeenCalledTimes(1);
    ab.forEach((a) => a!());
  });

  it("liest nach Ablauf der TTL neu", () => {
    const { r } = mkRunde();
    leseStand(db, r.id);
    vi.advanceTimersByTime(STAND_TTL_MS + 1);
    leseStand(db, r.id);
    expect(spion).toHaveBeenCalledTimes(2);
  });

  it("meldeRunde verwirft den Stand vor dem Melden: das nächste Lesen sieht das Schreiben", () => {
    const { r } = mkRunde();
    expect(leseStand(db, r.id)!.daten.teilnahmen).toHaveLength(0);
    tritteBei(db, r, { token: "t", spitzname: "Anna" });
    meldeRunde(r);
    expect(leseStand(db, r.id)!.daten.teilnahmen).toHaveLength(1);
  });

  it("liefert null für eine unbekannte Runde", () => {
    expect(leseStand(db, 4711)).toBeNull();
  });
});

describe("meldeRunde", () => {
  it("meldet die Runde und den Kanal ihres Quiz", () => {
    const { q, r } = mkRunde();
    const runde = vi.fn();
    const kanal = vi.fn();
    const a = abonniere(r.id, runde)!;
    const b = abonniere(quizKanal(q.id), kanal)!;
    meldeRunde(r);
    vi.advanceTimersByTime(250);
    expect(runde).toHaveBeenCalledTimes(1);
    expect(kanal).toHaveBeenCalledTimes(1);
    a();
    b();
  });

  it("der Quizkanal kollidiert nie mit einer Runden-Kennung", () => {
    expect(quizKanal(1)).toBeLessThan(0);
  });
});

describe("holeAutoEndeNach", () => {
  it("beendet Abgelaufene unter dem Akteur system und meldet sie", () => {
    const { q, r } = mkRunde();
    const kanal = vi.fn();
    const b = abonniere(quizKanal(q.id), kanal)!;
    leseStand(db, r.id); // im Cache: offen
    const spaeter = new Date(JETZT.getTime() + 7 * 3_600_000);
    holeAutoEndeNach(db, spaeter);
    expect(leseStand(db, r.id)!.daten.runde.beendetAt).not.toBeNull();
    vi.advanceTimersByTime(250);
    expect(kanal).toHaveBeenCalledTimes(1);
    const actor = sqlite
      .prepare(
        "SELECT actor FROM audit_outbox WHERE object_type = 'quiz_runden' AND action = 'update' ORDER BY rowid DESC LIMIT 1",
      )
      .pluck()
      .get() as string;
    expect(JSON.parse(actor)).toEqual({ kind: "system" });
    b();
  });
});

describe("planeZeitende", () => {
  it("meldet, sobald die Zeit der Frage um ist — ohne dass jemand schreibt", () => {
    const { r } = mkRunde();
    const h = vi.fn();
    const a = abonniere(r.id, h)!;
    planeZeitende(r, JETZT.getTime() + 10_000);
    vi.advanceTimersByTime(9_900);
    expect(h).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(h).toHaveBeenCalledTimes(1);
    a();
  });
});
