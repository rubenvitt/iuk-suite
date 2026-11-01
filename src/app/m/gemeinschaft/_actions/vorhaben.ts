"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import {
  Abgelehnt, legeAufgabeAn, loescheAufgabe, loescheVorhaben, NichtGefunden, setzeErledigt, setzeVerantwortlich, setzeZustaendige,
  speichereVorhaben,
} from "../_lib/vorhaben";
import { aufgabeEingabe, idSchema, vorhabenEingabe, zustaendigSchema } from "../_lib/vorhabenEingabe";
import { zodFehler, type ActionErgebnis } from "../_lib/vorhabenErgebnis";
import type { VorhabenArt } from "../_lib/vorhabenTypen";
import { requireLeitungAktion } from "../_lib/zugang";

/*
 * Die Planung der Leitung: Events, Projekte, Aufgaben. Jede Action prüft Host, Sitzung und Leitungsrecht
 * (`requireLeitungAktion`), parst ihre Eingaben neu und schreibt im Audit-Kontext der angemeldeten Person.
 * Danach frischt `revalidatePath` die Seiten des Moduls auf; die Insel braucht keinen eigenen Abruf.
 */

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

type Leitung = Awaited<ReturnType<typeof requireLeitungAktion>>;

/** Führt `schreiben` im Audit-Kontext der Leitung aus; die erwartbaren Fehler werden zum Satz. */
async function aendere<T>(viewer: Leitung, schreiben: () => T): Promise<ActionErgebnis<T>> {
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    try {
      const wert = schreiben();
      revalidatePath("/m/gemeinschaft", "layout");
      return { ok: true, wert } as ActionErgebnis<T>;
    } catch (e) {
      if (e instanceof NichtGefunden || e instanceof Abgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
  });
}

const ohneWert = (r: ActionErgebnis<unknown>): ActionErgebnis => (r.ok ? { ok: true } : r);

/** Anlegen (`id === null`) oder ändern eines Events oder Projekts; gibt die Kennung zurück. */
export async function vorhabenSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<string>> {
  const viewer = await requireLeitungAktion();
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = vorhabenEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return aendere(viewer, () => speichereVorhaben(getDb(), id, e.data));
}

/** Löscht ein Event oder Projekt samt Aufgaben; gibt die Art zurück (für den Rückweg zur Liste). */
export async function vorhabenLoeschenAction(id: string): Promise<ActionErgebnis<VorhabenArt>> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return aendere(viewer, () => loescheVorhaben(getDb(), id));
}

export async function verantwortlichSetzenAction(vorhabenId: string, mitgliedId: string | null): Promise<ActionErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(vorhabenId).success || !idSchema.nullable().safeParse(mitgliedId).success) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await aendere(viewer, () => setzeVerantwortlich(getDb(), vorhabenId, mitgliedId)));
}

export async function aufgabeAnlegenAction(vorhabenId: string, eingabe: unknown): Promise<ActionErgebnis<string>> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(vorhabenId).success) return { ok: false, fehler: UNGUELTIG };
  const e = aufgabeEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: e.error.issues[0]?.message ?? UNGUELTIG, feldFehler: zodFehler(e.error) ?? undefined };
  return aendere(viewer, () => legeAufgabeAn(getDb(), vorhabenId, e.data));
}

export async function aufgabeErledigtAction(vorhabenId: string, aufgabeId: string, erledigt: boolean): Promise<ActionErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(vorhabenId).success || !idSchema.safeParse(aufgabeId).success || typeof erledigt !== "boolean") return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await aendere(viewer, () => setzeErledigt(getDb(), vorhabenId, aufgabeId, erledigt)));
}

export async function zustaendigeSetzenAction(vorhabenId: string, aufgabeId: string, mitgliedIds: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(vorhabenId).success || !idSchema.safeParse(aufgabeId).success) return { ok: false, fehler: UNGUELTIG };
  const ids = zustaendigSchema.safeParse(mitgliedIds);
  if (!ids.success) return { ok: false, fehler: ids.error.issues[0]?.message ?? UNGUELTIG };
  return ohneWert(await aendere(viewer, () => setzeZustaendige(getDb(), vorhabenId, aufgabeId, ids.data)));
}

export async function aufgabeLoeschenAction(vorhabenId: string, aufgabeId: string): Promise<ActionErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!z.tuple([idSchema, idSchema]).safeParse([vorhabenId, aufgabeId]).success) return { ok: false, fehler: UNGUELTIG };
  return ohneWert(await aendere(viewer, () => loescheAufgabe(getDb(), vorhabenId, aufgabeId)));
}
