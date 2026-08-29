"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../_db/client";
import { teilnehmerAendern, teilnehmerAnlegen, teilnehmerLoeschen } from "../_lib/queries";
import { teilnehmerAnlegenSchema, teilnehmerPatchSchema } from "../_lib/adminSchemas";
import { requireUavAdminAction } from "../_lib/requireUavAdmin";
import type { ParticipantDTO } from "../_lib/typen";

/*
 * DIE TEILNEHMER-ACTIONS DER VERWALTUNG (Aufgabe 15). Jede beginnt mit
 * `requireUavAdminAction()` — WIRFT, statt ein Formularfeld zurückzugeben:
 * eine fehlende Berechtigung ist ein Zugriffsversuch, kein Tippfehler (Vorbild
 * `aufgaben/actions.ts`s Kopfkommentar zur selben Unterscheidung). Erst DANACH
 * wird gelesen/geschrieben — `teilnehmer.test.ts` hält fest, dass eine Sitzung
 * ohne Gruppe NICHTS in der Datenbank hinterlässt.
 *
 * `revalidatePath` trifft `/m/uav/admin` — die Übersicht — UND, wo eine
 * einzelne Zeile betroffen ist, zusätzlich ihre Detailseite (Aufgabe 16
 * verlinkt dorthin). Route Groups (`(admin)`) tauchen im Pfad nicht auf.
 */
const ADMIN_PFAD = "/m/uav/admin";

function detailPfad(id: string): string {
  return `${ADMIN_PFAD}/teilnehmer/${id}`;
}

export async function teilnehmerAnlegenAction(fd: FormData): Promise<ParticipantDTO> {
  await requireUavAdminAction();
  const beginnRoh = fd.get("beginn");
  const eingabe = teilnehmerAnlegenSchema.parse({
    name: String(fd.get("name") ?? ""),
    beginn: typeof beginnRoh === "string" && beginnRoh !== "" ? beginnRoh : null,
  });
  const teilnehmer = teilnehmerAnlegen(getDb(), eingabe.name, eingabe.beginn ?? null);
  revalidatePath(ADMIN_PFAD);
  return teilnehmer;
}

export async function teilnehmerAendernAction(
  id: string,
  patch: Partial<Pick<ParticipantDTO, "name" | "aktiv" | "beginn">> & { codeNeu?: boolean },
): Promise<ParticipantDTO> {
  await requireUavAdminAction();
  const eingabe = teilnehmerPatchSchema.parse(patch);
  const teilnehmer = teilnehmerAendern(getDb(), id, eingabe);
  revalidatePath(ADMIN_PFAD);
  revalidatePath(detailPfad(id));
  return teilnehmer;
}

export async function teilnehmerLoeschenAction(id: string): Promise<void> {
  await requireUavAdminAction();
  teilnehmerLoeschen(getDb(), id);
  revalidatePath(ADMIN_PFAD);
}

/** „Neuen Code erzeugen" — der alte Magic-Link wird damit ungültig (Aufgabe 16). */
export async function codeNeuAction(id: string): Promise<ParticipantDTO> {
  await requireUavAdminAction();
  const teilnehmer = teilnehmerAendern(getDb(), id, { codeNeu: true });
  revalidatePath(ADMIN_PFAD);
  revalidatePath(detailPfad(id));
  return teilnehmer;
}
