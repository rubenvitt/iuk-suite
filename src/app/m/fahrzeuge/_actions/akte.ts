"use server";

/**
 * Server Actions der Fahrzeugakte (IDA-299). Muster wie `verwaltung.ts`: Riegel, Eingaben als `unknown`
 * durch zod, Schreiben im Audit-Kontext, erwartbare Fehler als Satz statt als Wurf. Zu welchem Fahrzeug
 * eine Prüfung oder ein Reifensatz gehört, löst `_lib/akte/daten.ts` aus der Datenbank auf.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import {
  AkteFehler, entfernePruefung, entferneReifensatz, erledigePruefung, speicherePruefung, speichereReifensatz, speichereTechnik,
  trageKilometerEin, wechsleReifen,
} from "../_lib/akte/daten";
import { erledigtEingabe, kilometerEingabe, pruefungEingabe, reifensatzEingabe, reifenwechselEingabe, technikEingabe } from "../_lib/akte/eingabe";
import { heute } from "../_lib/akte/heute";
import { NichtGefunden } from "../_lib/daten";
import { requireFahrzeugeVerwaltenAktion } from "../_lib/zugang";

const idSchema = z.string().min(1).max(64);
const kennungGueltig = (id: unknown): id is string => idSchema.safeParse(id).success;

const UNBEKANNT = { ok: false, fehler: "Diesen Eintrag gibt es nicht mehr. Lad die Seite neu." } as const;

/**
 * Der gemeinsame Ablauf: Riegel, Kennungen, Eingabe, Schreiben im Audit-Kontext, neu laden. Die
 * erwartbaren Fehler werden zum Satz (am Feld, wenn der Fehler eines nennt); alles andere wirft weiter.
 */
async function ausfuehren<E>(
  kennungen: readonly unknown[], schema: z.ZodType<E> | null, eingabe: unknown, schreiben: (e: E) => void,
): Promise<ActionErgebnis> {
  const viewer = await requireFahrzeugeVerwaltenAktion();
  if (!kennungen.every(kennungGueltig)) return UNBEKANNT;
  let daten = undefined as E;
  if (schema) {
    const e = schema.safeParse(eingabe);
    if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
    daten = e.data;
  }
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    try {
      schreiben(daten);
    } catch (e) {
      if (e instanceof AkteFehler) return { ok: false, fehler: e.message, ...(e.feld ? { feldFehler: { [e.feld]: e.message } } : {}) };
      if (e instanceof NichtGefunden) return { ok: false, fehler: e.message };
      throw e;
    }
    revalidatePath("/m/fahrzeuge", "layout");
    return { ok: true };
  });
}

/** Technische Daten und Besonderheiten der Akte. */
export async function technikSpeichernAction(fahrzeugId: string, eingabe: unknown): Promise<ActionErgebnis> {
  return ausfuehren([fahrzeugId], technikEingabe, eingabe, (e) => speichereTechnik(getDb(), fahrzeugId, e));
}

/** Kilometerstand laut Tacho; nie rückwärts, nie für einen Tag in der Zukunft. */
export async function kilometerEintragenAction(fahrzeugId: string, eingabe: unknown): Promise<ActionErgebnis> {
  return ausfuehren([fahrzeugId], kilometerEingabe, eingabe, (e) => trageKilometerEin(getDb(), fahrzeugId, e, heute()));
}

/** Prüfung anlegen (`pruefungId === null`) oder ändern. */
export async function pruefungSpeichernAction(fahrzeugId: string, pruefungId: string | null, eingabe: unknown): Promise<ActionErgebnis> {
  return ausfuehren(pruefungId === null ? [fahrzeugId] : [fahrzeugId, pruefungId], pruefungEingabe, eingabe,
    (e) => { speicherePruefung(getDb(), fahrzeugId, pruefungId, e, heute()); });
}

/** Prüfung erledigt eintragen. Das Fahrzeug bestimmt die Prüfung selbst. */
export async function pruefungErledigtAction(pruefungId: string, eingabe: unknown): Promise<ActionErgebnis> {
  return ausfuehren([pruefungId], erledigtEingabe, eingabe, (e) => { erledigePruefung(getDb(), pruefungId, e, heute()); });
}

export async function pruefungEntfernenAction(pruefungId: string): Promise<ActionErgebnis> {
  return ausfuehren([pruefungId], null, undefined, () => entfernePruefung(getDb(), pruefungId));
}

/** Reifensatz anlegen (`satzId === null`) oder ändern. */
export async function reifensatzSpeichernAction(fahrzeugId: string, satzId: string | null, eingabe: unknown): Promise<ActionErgebnis> {
  return ausfuehren(satzId === null ? [fahrzeugId] : [fahrzeugId, satzId], reifensatzEingabe, eingabe,
    (e) => { speichereReifensatz(getDb(), fahrzeugId, satzId, e); });
}

export async function reifensatzEntfernenAction(satzId: string): Promise<ActionErgebnis> {
  return ausfuehren([satzId], null, undefined, () => entferneReifensatz(getDb(), satzId));
}

/** Reifenwechsel: welcher Satz jetzt drauf ist. */
export async function reifenwechselAction(fahrzeugId: string, eingabe: unknown): Promise<ActionErgebnis> {
  return ausfuehren([fahrzeugId], reifenwechselEingabe, eingabe, (e) => wechsleReifen(getDb(), fahrzeugId, e));
}
