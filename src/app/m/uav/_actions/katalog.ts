"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../_db/client";
import { taskAendern, taskAnlegen, taskLoeschen, tasksNeuSortieren } from "../_lib/queries";
import { reorderSchema, taskAnlegenSchema, taskPatchSchema } from "../_lib/adminSchemas";
import { requireUavAdminAction } from "../_lib/requireUavAdmin";
import type { TaskDTO } from "../_lib/typen";

/*
 * DIE KATALOG-ACTIONS DER VERWALTUNG (Aufgabe 17) — dieselbe Kette wie
 * `_actions/teilnehmer.ts` (Aufgabe 15): `requireUavAdminAction()` als erste
 * Anweisung, dann Zod (`_lib/adminSchemas.ts`), dann schreiben, dann
 * `revalidatePath`.
 */
const KATALOG_PFAD = "/m/uav/admin/katalog";
const UEBERSICHT_PFAD = "/m/uav/admin";

/**
 * Beide Pfade — nicht nur den Katalog selbst (Fix-Runde 1): die
 * Teilnehmer-Übersicht (`teilnehmerUebersicht`) berechnet Fortschritt über
 * `alleTasks(db, false)`, hängt also vom AKTIVEN Aufgaben-Set ab. Wer eine
 * Aufgabe deaktiviert/löscht/neu anlegt, ohne dass `/m/uav/admin` mit
 * revalidiert, sieht dort veraltete Quoten.
 */
function revalidateAlle(): void {
  revalidatePath(KATALOG_PFAD);
  revalidatePath(UEBERSICHT_PFAD);
}

/** `bildUrl` getrimmt, ein leerer String wird zu `null` (Brief) — nur wenn das Feld überhaupt übergeben wurde. */
function bildGetrimmt<T extends { bildUrl?: string | null }>(eingabe: T): T {
  if (!("bildUrl" in eingabe) || eingabe.bildUrl == null) return eingabe;
  const getrimmt = eingabe.bildUrl.trim();
  return { ...eingabe, bildUrl: getrimmt === "" ? null : getrimmt };
}

export async function aufgabeAnlegenAction(eingabe: unknown): Promise<TaskDTO> {
  await requireUavAdminAction();
  const geparst = bildGetrimmt(taskAnlegenSchema.parse(eingabe));
  const aufgabe = taskAnlegen(getDb(), geparst);
  revalidateAlle();
  return aufgabe;
}

export async function aufgabeAendernAction(id: string, patch: unknown): Promise<TaskDTO> {
  await requireUavAdminAction();
  const geparst = bildGetrimmt(taskPatchSchema.parse(patch));
  const aufgabe = taskAendern(getDb(), id, geparst);
  revalidateAlle();
  return aufgabe;
}

export async function aufgabeLoeschenAction(id: string): Promise<void> {
  await requireUavAdminAction();
  taskLoeschen(getDb(), id);
  revalidateAlle();
}

export async function aufgabenSortierenAction(ids: string[]): Promise<void> {
  await requireUavAdminAction();
  const { ids: geparst } = reorderSchema.parse({ ids });
  tasksNeuSortieren(getDb(), geparst);
  revalidateAlle();
}
