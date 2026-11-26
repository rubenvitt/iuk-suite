import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { insertGroup } from "@/app/m/feedback/_db/queries";
import { legeQuizAn, starteOderHoleRunde } from "@/app/m/feedback/_db/quiz";
import { frischeDb, FRAGEN, type TestDb } from "@/app/m/feedback/_lib/quiz/test-hilfen";
import { QuizListe, type QuizZeile } from "@/app/m/feedback/_ui/QuizListe";

/** Die Quizliste: „Heute" ist nach dem nachgeholten Auto-Ende richtig, nicht veraltet. */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));
vi.mock("@/app/m/feedback/_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
// Die Client-Insel selbst wird hier nicht gerendert, nur ihre Props gelesen.
vi.mock("@/app/m/feedback/_ui/QuizListe", () => ({ QuizListe: () => null }));

import QuizSeite from "./page";

let db: TestDb;
// 19:00 Berlin; die Runde lief seit 11:00, ihr letzter Schritt ist also über 6 h her.
const JETZT = new Date("2026-11-25T18:00:00Z");

beforeEach(() => {
  ({ db } = frischeDb());
  guardPageMock.mockReset();
  guardPageMock.mockImplementation(async () => ({ viewer: null, db, memberIds: [] }));
  vi.useFakeTimers({ now: JETZT, toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

function finde<P>(knoten: ReactNode, typ: unknown): P | undefined {
  if (Array.isArray(knoten)) {
    for (const k of knoten) {
      const t = finde<P>(k, typ);
      if (t) return t;
    }
    return undefined;
  }
  if (!isValidElement(knoten)) return undefined;
  const el = knoten as ReactElement<{ children?: ReactNode }>;
  if (el.type === typ) return el.props as P;
  return finde<P>(el.props.children, typ);
}

describe("Quizliste", () => {
  it("holt das Auto-Ende nach: eine abgelaufene Runde steht auf „beendet“, nicht auf „läuft“", async () => {
    const g = insertGroup(db, { name: "g", slug: "g", secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });
    const q = legeQuizAn(db, { groupId: g.id, titel: "Funk", modus: "lagebild", fragen: FRAGEN, jetzt: JETZT });
    starteOderHoleRunde(db, q, new Date("2026-11-25T10:00:00Z"));
    const el = await QuizSeite({ params: Promise.resolve({ groupId: String(g.id) }) });
    const props = finde<{ zeilen: QuizZeile[] }>(el, QuizListe);
    expect(props?.zeilen.map((z) => z.heute)).toEqual(["beendet"]);
  });

  it("eine frische Runde läuft", async () => {
    const g = insertGroup(db, { name: "g", slug: "g", secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });
    const q = legeQuizAn(db, { groupId: g.id, titel: "Funk", modus: "lagebild", fragen: FRAGEN, jetzt: JETZT });
    starteOderHoleRunde(db, q, new Date("2026-11-25T17:00:00Z"));
    const el = await QuizSeite({ params: Promise.resolve({ groupId: String(g.id) }) });
    expect(finde<{ zeilen: QuizZeile[] }>(el, QuizListe)?.zeilen.map((z) => z.heute)).toEqual(["laeuft"]);
  });
});
