"use server";
// LIVE-QUIZ: die Verwaltung der Quizvorlagen je Gruppe (Spec §5.2, Zeile „Admin").
//
// IDOR (`CLAUDE.md`, Zugriffsschutz): jede Action, die eine `quizId` bekommt, liest die Gruppe aus
// der Quizzeile und prüft erst dann `assertGroupAccess`. Ein `groupId`-Feld im Formular wird für
// ein bestehendes Quiz nie gelesen.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import { getGroup, memberGroupIdsFor } from "./_db/queries";
import {
  aendereQuiz,
  beendeRunde,
  heutigeRunde,
  legeQuizAn,
  loescheQuiz,
  quizPerId,
  rotiereSecret,
  QuizFragenUngueltig,
} from "./_db/quiz";
import { assertGroupAccess } from "./_lib/access";
import { viewerFromSession } from "./_lib/viewer";
import { pruefeFragen, type QuizFrage, type QuizModus } from "./_lib/quiz/fragen";
import { TITEL_MAX, type QuizFormState } from "./_lib/quiz/formular";
import { holeAutoEndeNach, meldeRunde } from "./_lib/quiz/stand";

function num(v: FormDataEntryValue | null): number {
  return Number(String(v ?? ""));
}

/** Wie `guardGroup` in `actions.ts`: wirft „Forbidden" ohne Zugang zur Gruppe. */
async function guardGroup(groupId: number) {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  assertGroupAccess(viewer, groupId, memberIds);
  return { viewer, db };
}

/** Das Quiz aus der Datenbank und der Zugang über SEINE Gruppe. */
async function guardQuiz(formData: FormData) {
  const quiz = quizPerId(getDb(), num(formData.get("quizId")));
  if (!quiz) throw new Error("Not found");
  const { viewer, db } = await guardGroup(quiz.groupId);
  return { viewer, db, quiz };
}

function revalidate(): void {
  revalidatePath("/m/feedback", "layout");
}

function titelFehler(titel: string): string | undefined {
  if (titel === "") return "Titel fehlt";
  if (titel.length > TITEL_MAX) return `Titel darf höchstens ${TITEL_MAX} Zeichen haben`;
  return undefined;
}

/** Legt ein leeres Lagebild an und springt in seinen Editor. */
export async function legeQuizAnAction(_prev: QuizFormState, formData: FormData): Promise<QuizFormState> {
  const groupId = num(formData.get("groupId"));
  const { db, viewer } = await guardGroup(groupId);
  if (!getGroup(db, groupId)) throw new Error("Not found");
  const values = { titel: String(formData.get("titel") ?? "") };
  const titel = values.titel.trim();
  const fehler = titelFehler(titel);
  if (fehler) return { ok: false, fieldErrors: { titel: fehler }, values };

  const quiz = await withAuditContext({ actor: auditActor(viewer) }, async () =>
    legeQuizAn(db, { groupId, titel, modus: "lagebild", fragen: [], jetzt: new Date() }),
  );
  revalidate();
  // Außerhalb des Audit-Kontexts: `redirect` wirft.
  redirect(`/m/feedback/groups/${groupId}/quiz/${quiz.id}`);
}

/**
 * Speichert Titel, Modus und Fragen. Die Fragen kommen als JSON (`fragen`) und gehen durch
 * `pruefeFragen`; jeder Fehler wird zurückgegeben, nichts wirft. Eine leere Liste ist ein
 * Entwurf (wie in `_db/quiz.ts`) und wird gespeichert; starten lässt sie sich nicht.
 * Eine laufende Runde behält ihren Schnappschuss.
 */
export async function speichereQuizAction(_prev: QuizFormState, formData: FormData): Promise<QuizFormState> {
  const { db, viewer, quiz } = await guardQuiz(formData);
  const values = {
    titel: String(formData.get("titel") ?? ""),
    modus: String(formData.get("modus") ?? ""),
    fragen: String(formData.get("fragen") ?? ""),
  };
  const fieldErrors: { titel?: string; modus?: string; fragen?: string[] } = {};

  const titel = values.titel.trim();
  const tf = titelFehler(titel);
  if (tf) fieldErrors.titel = tf;

  const modus = values.modus;
  if (modus !== "lagebild" && modus !== "wettbewerb") fieldErrors.modus = "Modus wählen";

  let fragen: QuizFrage[] = [];
  let roh: unknown;
  try {
    roh = JSON.parse(values.fragen);
  } catch {
    fieldErrors.fragen = ["Die Fragen ließen sich nicht lesen. Lade die Seite neu."];
  }
  if (!fieldErrors.fragen) {
    if (Array.isArray(roh) && roh.length === 0) {
      fragen = [];
    } else {
      const p = pruefeFragen(roh);
      if (p.ok) fragen = p.fragen;
      else fieldErrors.fragen = p.fehler;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  try {
    await withAuditContext({ actor: auditActor(viewer) }, async () =>
      aendereQuiz(db, quiz.id, { titel, modus: modus as QuizModus, fragen }, new Date()),
    );
  } catch (e) {
    if (e instanceof QuizFragenUngueltig) return { ok: false, fieldErrors: { fragen: e.fehler }, values };
    throw e;
  }
  revalidate();
  return { ok: true, gespeichert: true };
}

/** Neue Beamer-Adresse; die alte steuert danach nichts mehr. */
export async function rotiereSecretAction(formData: FormData): Promise<void> {
  const { db, viewer, quiz } = await guardQuiz(formData);
  await withAuditContext({ actor: auditActor(viewer) }, async () => {
    rotiereSecret(db, quiz.id);
  });
  revalidate();
}

/** Beendet die offene Runde von heute endgültig. `true`, wenn eine lief. */
function beendeHeutige(db: ReturnType<typeof getDb>, quizId: number): boolean {
  const jetzt = new Date();
  holeAutoEndeNach(db, jetzt);
  const runde = heutigeRunde(db, quizId, jetzt);
  if (!runde || runde.beendetAt !== null) return false;
  beendeRunde(db, runde.id, jetzt);
  meldeRunde(runde);
  return true;
}

/** „Quiz beenden": wie der Knopf auf dem Beamer (§5.3). Offene Beamer und Handys sehen „beendet". */
export async function beendeRundeAction(formData: FormData): Promise<void> {
  const { db, viewer, quiz } = await guardQuiz(formData);
  const beendet = await withAuditContext({ actor: auditActor(viewer) }, async () => beendeHeutige(db, quiz.id));
  if (beendet) revalidate();
}

/**
 * Löscht die Vorlage. Vergangene Runden bleiben (`quiz_id` wird NULL), ihre Auswertung lebt vom
 * Schnappschuss. Eine heute laufende Runde endet vorher: ohne Vorlage könnte sie kein Beamer
 * mehr steuern oder beenden.
 */
export async function loescheQuizAction(formData: FormData): Promise<void> {
  const { db, viewer, quiz } = await guardQuiz(formData);
  await withAuditContext({ actor: auditActor(viewer) }, async () => {
    beendeHeutige(db, quiz.id);
    loescheQuiz(db, quiz.id);
  });
  revalidate();
}
