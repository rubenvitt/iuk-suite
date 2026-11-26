import { describe, it, expect, beforeEach, vi } from "vitest";
import { insertGroup, insertUserGroup } from "./_db/queries";
import { legeQuizAn, quizPerId, starteOderHoleRunde, heutigeRunde } from "./_db/quiz";
import { frischeDb, FRAGEN, type TestDb } from "./_lib/quiz/test-hilfen";
import type Database from "better-sqlite3";
import { QUIZ_FORM_START } from "./_lib/quiz/formular";

/**
 * DIE VERWALTUNG DER QUIZVORLAGEN (Live-Quiz, Task 8).
 *
 * Drei Zusagen:
 * 1. IDOR: jede Action löst die Gruppe aus der Quizzeile auf, nie aus einem Formularfeld. Eine
 *    `quizId` aus einer fremden Gruppe wirft und ändert nichts.
 * 2. Ungültige Fragen kommen als `fieldErrors.fragen` (Liste) zurück, ohne zu werfen.
 * 3. „Quiz beenden" meldet die Runde, damit offene Beamer und Handys „beendet" sehen.
 */

const { redirectMock, revalidatePathMock, authMock, meldeRundeMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  authMock: vi.fn(),
  meldeRundeMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("./_db/client", () => ({ getDb: () => db }));
vi.mock("./_lib/quiz/stand", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./_lib/quiz/stand")>();
  return { ...echt, meldeRunde: meldeRundeMock };
});

let sqlite: Database.Database;
let db: TestDb;

async function actions() {
  return import("./quiz-actions");
}

function form(felder: Record<string, string | number>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, String(v));
  return f;
}

function gruppe(slug: string) {
  return insertGroup(db, { name: slug, slug, secret: "abc12", closeAfterHours: null, createdAt: new Date() });
}

/** Eigene Gruppe A (Leitung zugeordnet) und fremde Gruppe B, je ein Quiz. */
function lage() {
  const a = gruppe("eigene");
  const b = gruppe("fremde");
  insertUserGroup(db, "leitung-1", a.id);
  const eigenes = legeQuizAn(db, { groupId: a.id, titel: "Eigen", modus: "lagebild", fragen: FRAGEN, jetzt: new Date() });
  const fremdes = legeQuizAn(db, { groupId: b.id, titel: "Fremd", modus: "lagebild", fragen: FRAGEN, jetzt: new Date() });
  authMock.mockResolvedValue({ user: { id: "leitung-1", groups: ["feedback-nutzer"], fachgruppen: [] } });
  return { a, b, eigenes, fremdes };
}

function stand(): unknown {
  return ["quizze", "quiz_runden", "quiz_teilnahmen", "evenings"].map((t) =>
    sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1`).all(),
  );
}

beforeEach(() => {
  ({ sqlite, db } = frischeDb());
  redirectMock.mockReset();
  revalidatePathMock.mockReset();
  meldeRundeMock.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe("IDOR: quizId aus einer fremden Gruppe", () => {
  const AUFRUFE: Record<string, (a: Awaited<ReturnType<typeof actions>>, quizId: number) => Promise<unknown>> = {
    speichereQuizAction: (a, quizId) =>
      a.speichereQuizAction(
        QUIZ_FORM_START,
        form({ quizId, titel: "Übernommen", modus: "wettbewerb", fragen: JSON.stringify(FRAGEN) }),
      ),
    rotiereSecretAction: (a, quizId) => a.rotiereSecretAction(form({ quizId })),
    loescheQuizAction: (a, quizId) => a.loescheQuizAction(form({ quizId })),
    beendeRundeAction: (a, quizId) => a.beendeRundeAction(form({ quizId })),
  };

  for (const [name, aufruf] of Object.entries(AUFRUFE)) {
    it(`${name} wirft und ändert nichts`, async () => {
      const a = await actions();
      const { fremdes } = lage();
      starteOderHoleRunde(db, fremdes, new Date());
      const vorher = stand();

      await expect(aufruf(a, fremdes.id)).rejects.toThrow("Forbidden");

      expect(stand()).toEqual(vorher);
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(meldeRundeMock).not.toHaveBeenCalled();
    });

    it(`${name} wirft für ein unbekanntes Quiz`, async () => {
      const a = await actions();
      lage();
      await expect(aufruf(a, 9999)).rejects.toThrow("Not found");
    });

    it(`${name} wirft ohne Sitzung`, async () => {
      const a = await actions();
      const { eigenes } = lage();
      authMock.mockResolvedValue(null);
      await expect(aufruf(a, eigenes.id)).rejects.toThrow("Forbidden");
    });
  }

  it("legeQuizAnAction in einer fremden Gruppe wirft", async () => {
    const a = await actions();
    const { b } = lage();
    const vorher = stand();
    await expect(a.legeQuizAnAction(QUIZ_FORM_START, form({ groupId: b.id, titel: "X" }))).rejects.toThrow("Forbidden");
    expect(stand()).toEqual(vorher);
  });
});

describe("speichereQuizAction", () => {
  it("gibt ungültige Fragen als fieldErrors.fragen zurück, ohne zu werfen", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const vorher = stand();
    const kaputt = [{ text: "", typ: "einfach", optionen: ["A"], richtig: [] }];

    const r = await a.speichereQuizAction(
      QUIZ_FORM_START,
      form({ quizId: eigenes.id, titel: "Neu", modus: "lagebild", fragen: JSON.stringify(kaputt) }),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Array.isArray(r.fieldErrors.fragen)).toBe(true);
    expect(r.fieldErrors.fragen).toContain("Frage 1: Text muss 1 bis 300 Zeichen haben");
    expect(r.fieldErrors.fragen).toContain("Frage 1: 2 bis 6 Optionen nötig");
    expect(r.values.titel).toBe("Neu");
    expect(stand()).toEqual(vorher);
  });

  it("unlesbares JSON ist ein Feldfehler, keine Ausnahme", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const r = await a.speichereQuizAction(
      QUIZ_FORM_START,
      form({ quizId: eigenes.id, titel: "Neu", modus: "lagebild", fragen: "{kaputt" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.fragen?.length).toBeGreaterThan(0);
  });

  it("verlangt einen Titel und einen gültigen Modus", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const r = await a.speichereQuizAction(
      QUIZ_FORM_START,
      form({ quizId: eigenes.id, titel: "  ", modus: "quatsch", fragen: JSON.stringify(FRAGEN) }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.titel).toBeTruthy();
    expect(r.fieldErrors.modus).toBeTruthy();
  });

  it("speichert Titel, Modus und Fragen der eigenen Gruppe", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const neu = [FRAGEN[0]];

    const r = await a.speichereQuizAction(
      QUIZ_FORM_START,
      form({ quizId: eigenes.id, titel: " Funkquiz ", modus: "wettbewerb", fragen: JSON.stringify(neu) }),
    );

    expect(r).toEqual({ ok: true, gespeichert: true });
    const q = quizPerId(db, eigenes.id)!;
    expect(q.titel).toBe("Funkquiz");
    expect(q.modus).toBe("wettbewerb");
    expect(JSON.parse(q.fragen)).toEqual(neu);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("eine leere Fragenliste ist ein Entwurf und wird gespeichert", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const r = await a.speichereQuizAction(
      QUIZ_FORM_START,
      form({ quizId: eigenes.id, titel: "Entwurf", modus: "lagebild", fragen: "[]" }),
    );
    expect(r.ok).toBe(true);
    expect(JSON.parse(quizPerId(db, eigenes.id)!.fragen)).toEqual([]);
  });
});

describe("legeQuizAnAction", () => {
  it("ohne Titel: Feldfehler", async () => {
    const a = await actions();
    const { a: g } = lage();
    const r = await a.legeQuizAnAction(QUIZ_FORM_START, form({ groupId: g.id, titel: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.titel).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("legt ein leeres Lagebild in der eigenen Gruppe an und springt in den Editor", async () => {
    const a = await actions();
    const { a: g } = lage();
    await a.legeQuizAnAction(QUIZ_FORM_START, form({ groupId: g.id, titel: "Neues Quiz" }));
    const neu = sqlite.prepare("SELECT * FROM quizze WHERE titel = 'Neues Quiz'").get() as {
      id: number;
      group_id: number;
      modus: string;
      fragen: string;
    };
    expect(neu.group_id).toBe(g.id);
    expect(neu.modus).toBe("lagebild");
    expect(neu.fragen).toBe("[]");
    expect(redirectMock).toHaveBeenCalledWith(`/m/feedback/groups/${g.id}/quiz/${neu.id}`);
  });
});

describe("rotiereSecretAction", () => {
  it("erzeugt ein neues Moderations-Secret", async () => {
    const a = await actions();
    const { eigenes } = lage();
    await a.rotiereSecretAction(form({ quizId: eigenes.id }));
    expect(quizPerId(db, eigenes.id)!.moderationSecret).not.toBe(eigenes.moderationSecret);
  });
});

describe("beendeRundeAction", () => {
  it("beendet die offene Runde von heute und meldet sie", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const runde = starteOderHoleRunde(db, eigenes, new Date());

    await a.beendeRundeAction(form({ quizId: eigenes.id }));

    expect(heutigeRunde(db, eigenes.id, new Date())!.beendetAt).not.toBeNull();
    expect(meldeRundeMock).toHaveBeenCalledWith(expect.objectContaining({ id: runde.id, quizId: eigenes.id }));
  });

  it("ohne offene Runde ändert sich nichts", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const vorher = stand();
    await a.beendeRundeAction(form({ quizId: eigenes.id }));
    expect(stand()).toEqual(vorher);
    expect(meldeRundeMock).not.toHaveBeenCalled();
  });
});

describe("loescheQuizAction", () => {
  it("löscht die Vorlage; vergangene Runden bleiben, eine laufende endet", async () => {
    const a = await actions();
    const { eigenes } = lage();
    const runde = starteOderHoleRunde(db, eigenes, new Date());

    await a.loescheQuizAction(form({ quizId: eigenes.id }));

    expect(quizPerId(db, eigenes.id)).toBeUndefined();
    const r = sqlite.prepare("SELECT quiz_id, beendet_at FROM quiz_runden WHERE id = ?").get(runde.id) as {
      quiz_id: number | null;
      beendet_at: number | null;
    };
    expect(r.quiz_id).toBeNull();
    expect(r.beendet_at).not.toBeNull();
    expect(meldeRundeMock).toHaveBeenCalled();
  });
});
