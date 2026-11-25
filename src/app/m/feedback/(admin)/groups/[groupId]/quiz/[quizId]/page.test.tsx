import { describe, it, expect, beforeEach, vi } from "vitest";
import { insertGroup } from "@/app/m/feedback/_db/queries";
import { legeQuizAn } from "@/app/m/feedback/_db/quiz";
import { frischeDb, FRAGEN, type TestDb } from "@/app/m/feedback/_lib/quiz/test-hilfen";

/**
 * IDOR AM EDITOR: geprüft wird die Gruppe aus der Quizzeile. Ein fremdes Quiz unter der eigenen
 * Gruppen-URL ist ein 404, und `guardPage` sieht die ECHTE Gruppe des Quiz, nie die aus der URL.
 */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));
vi.mock("@/app/m/feedback/_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "feedback.localtest.me" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import QuizBearbeiten from "./page";

let db: TestDb;

function gruppe(slug: string) {
  return insertGroup(db, { name: slug, slug, secret: "abc12", closeAfterHours: null, createdAt: new Date() });
}

beforeEach(() => {
  ({ db } = frischeDb());
  guardPageMock.mockReset();
  guardPageMock.mockImplementation(async () => ({ viewer: null, db, memberIds: [] }));
});

const aufruf = (groupId: number, quizId: number | string) =>
  QuizBearbeiten({ params: Promise.resolve({ groupId: String(groupId), quizId: String(quizId) }) });

describe("Editor-Seite", () => {
  it("fremdes Quiz unter der eigenen Gruppe: guardPage mit der echten Gruppe, sonst 404", async () => {
    const eigene = gruppe("eigene");
    const fremde = gruppe("fremde");
    const quiz = legeQuizAn(db, { groupId: fremde.id, titel: "F", modus: "lagebild", fragen: FRAGEN, jetzt: new Date() });

    await expect(aufruf(eigene.id, quiz.id)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(guardPageMock).toHaveBeenCalledWith(fremde.id);
  });

  it("verweigert guardPage den Zugang, kommt die Seite nicht zustande", async () => {
    const fremde = gruppe("fremde");
    const quiz = legeQuizAn(db, { groupId: fremde.id, titel: "F", modus: "lagebild", fragen: FRAGEN, jetzt: new Date() });
    guardPageMock.mockImplementation(async () => {
      throw new Error("NEXT_NOT_FOUND");
    });
    await expect(aufruf(fremde.id, quiz.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("unbekanntes Quiz: 404", async () => {
    const g = gruppe("g");
    await expect(aufruf(g.id, 999)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(aufruf(g.id, "x")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("eigenes Quiz: rendert den Editor mit der Beamer-Adresse", async () => {
    const g = gruppe("g");
    const quiz = legeQuizAn(db, { groupId: g.id, titel: "Funk", modus: "lagebild", fragen: FRAGEN, jetzt: new Date() });
    const el = (await aufruf(g.id, quiz.id)) as { props: { children: { props: Record<string, unknown> }[] } };
    const editor = el.props.children[1]!.props;
    expect(editor.quizId).toBe(quiz.id);
    expect(editor.beamerUrl).toBe(`http://feedback.localtest.me/beamer/${quiz.moderationSecret}`);
  });
});
