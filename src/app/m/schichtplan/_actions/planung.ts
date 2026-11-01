"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { stammKennungen } from "../_lib/bestand";
import {
  Abgelehnt, entferneEinheit, ladePlanung, legeSchichtAn, loeschePlanung, loescheSchicht, loescheTempHelfer, NichtGefunden,
  setzeSchicht, speichereEinheit, speicherePlanung, speichereTempHelfer, teileZu, tragAus, verschiebeEinheit,
} from "../_lib/daten";
import { einheitEingabe, idSchema, planungEingabe, quelleSchema, schichtZeitEingabe, tempHelferEingabe } from "../_lib/eingabe";
import type { PlanungDTO } from "../_lib/typen";
import { requireSchichtplanAktion } from "../_lib/zugang";

/*
 * Jede Änderung an einer Planung gibt die ganze Planung frisch zurück: die Seite hat optimistisch
 * gezeichnet und ersetzt ihren Stand dann durch diesen. So bleibt nie ein halber Stand stehen.
 */

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

/** Die erwartbaren Fehler werden zum Satz; alles andere wirft weiter. */
function ergebnis<T>(schreiben: () => T): ActionErgebnis<T> {
  try {
    const wert = schreiben();
    revalidatePath("/m/schichtplan", "layout");
    return { ok: true, wert } as ActionErgebnis<T>;
  } catch (e) {
    if (e instanceof NichtGefunden || e instanceof Abgelehnt) return { ok: false, fehler: e.message };
    throw e;
  }
}

/** Ändert, und gibt die Planung danach zurück. */
async function aendere(planId: unknown, schreiben: (planId: string) => void): Promise<ActionErgebnis<PlanungDTO>> {
  const viewer = await requireSchichtplanAktion();
  const id = idSchema.safeParse(planId);
  if (!id.success) return { ok: false, fehler: UNGUELTIG };
  return withAuditContext({ actor: auditActor(viewer) }, async () => ergebnis(() => {
    const db = getDb();
    schreiben(id.data);
    const p = ladePlanung(db, id.data);
    if (!p) throw new NichtGefunden();
    return p;
  }));
}

function felder<T>(schema: z.ZodType<T>, eingabe: unknown): { ok: true; wert: T } | { ok: false; fehler: string; feldFehler?: Record<string, string> } {
  const e = schema.safeParse(eingabe);
  return e.success ? { ok: true, wert: e.data } : { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
}

// ── Planung ────────────────────────────────────────────────────────────────

/** Anlegen (`planId === null`) oder ändern; gibt die Kennung zurück. */
export async function planungSpeichernAction(planId: string | null, eingabe: unknown): Promise<ActionErgebnis<string>> {
  const viewer = await requireSchichtplanAktion();
  if (planId !== null && !idSchema.safeParse(planId).success) return { ok: false, fehler: UNGUELTIG };
  const e = felder(planungEingabe, eingabe);
  if (!e.ok) return e;
  return withAuditContext({ actor: auditActor(viewer) }, async () => ergebnis(() => speicherePlanung(getDb(), planId, e.wert)));
}

/** Nur Modul-Admins: eine Planung mit allen Schichten und Einteilungen löschen. */
export async function planungLoeschenAction(planId: string): Promise<ActionErgebnis> {
  const viewer = await requireSchichtplanAktion(true);
  if (!idSchema.safeParse(planId).success) return { ok: false, fehler: UNGUELTIG };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = ergebnis(() => loeschePlanung(getDb(), planId));
    return r.ok ? { ok: true } : r;
  });
}

// ── Einheiten ──────────────────────────────────────────────────────────────

export async function einheitSpeichernAction(planId: string, einheitId: string | null, eingabe: unknown): Promise<ActionErgebnis<PlanungDTO>> {
  if (einheitId !== null && !idSchema.safeParse(einheitId).success) return { ok: false, fehler: UNGUELTIG };
  const e = felder(einheitEingabe, eingabe);
  if (!e.ok) return e;
  return aendere(planId, (id) => { speichereEinheit(getDb(), id, einheitId, e.wert); });
}

export async function einheitEntfernenAction(planId: string, einheitId: string): Promise<ActionErgebnis<PlanungDTO>> {
  if (!idSchema.safeParse(einheitId).success) return { ok: false, fehler: UNGUELTIG };
  return aendere(planId, (id) => entferneEinheit(getDb(), id, einheitId));
}

export async function einheitVerschiebenAction(planId: string, einheitId: string, richtung: -1 | 1): Promise<ActionErgebnis<PlanungDTO>> {
  if (!idSchema.safeParse(einheitId).success || (richtung !== -1 && richtung !== 1)) return { ok: false, fehler: UNGUELTIG };
  return aendere(planId, (id) => verschiebeEinheit(getDb(), id, einheitId, richtung));
}

// ── Schichten ──────────────────────────────────────────────────────────────

export async function schichtAnlegenAction(planId: string, einheitId: string, zeit: unknown): Promise<ActionErgebnis<PlanungDTO>> {
  if (!idSchema.safeParse(einheitId).success) return { ok: false, fehler: UNGUELTIG };
  const z = felder(schichtZeitEingabe, zeit);
  if (!z.ok) return z;
  return aendere(planId, (id) => { legeSchichtAn(getDb(), id, einheitId, z.wert); });
}

/** Neue Zeit; mit `einheitId` in eine andere Zeile derselben Planung. */
export async function schichtSetzenAction(planId: string, schichtId: string, zeit: unknown, einheitId?: string): Promise<ActionErgebnis<PlanungDTO>> {
  if (!idSchema.safeParse(schichtId).success || (einheitId !== undefined && !idSchema.safeParse(einheitId).success)) return { ok: false, fehler: UNGUELTIG };
  const z = felder(schichtZeitEingabe, zeit);
  if (!z.ok) return z;
  return aendere(planId, (id) => setzeSchicht(getDb(), id, schichtId, z.wert, einheitId));
}

export async function schichtLoeschenAction(planId: string, schichtId: string): Promise<ActionErgebnis<PlanungDTO>> {
  if (!idSchema.safeParse(schichtId).success) return { ok: false, fehler: UNGUELTIG };
  return aendere(planId, (id) => loescheSchicht(getDb(), id, schichtId));
}

// ── Einteilung ─────────────────────────────────────────────────────────────

const einteilungSchema = z.object({ schichtId: idSchema, quelle: quelleSchema, helferId: idSchema, ausSchichtId: idSchema.optional() });

/** Zuteilen; mit `ausSchichtId` umsetzen (aus der alten Schicht heraus). */
export async function zuteilenAction(planId: string, einteilung: unknown): Promise<ActionErgebnis<PlanungDTO>> {
  const e = einteilungSchema.safeParse(einteilung);
  if (!e.success) return { ok: false, fehler: UNGUELTIG };
  const { schichtId, quelle, helferId, ausSchichtId } = e.data;
  return aendere(planId, (id) => teileZu(getDb(), id, schichtId, quelle, helferId, quelle === "stamm" ? stammKennungen() : new Set(), ausSchichtId));
}

export async function austragenAction(planId: string, einteilung: unknown): Promise<ActionErgebnis<PlanungDTO>> {
  const e = einteilungSchema.safeParse(einteilung);
  if (!e.success) return { ok: false, fehler: UNGUELTIG };
  return aendere(planId, (id) => tragAus(getDb(), id, e.data.schichtId, e.data.quelle, e.data.helferId));
}

// ── Temporäre Helfer ───────────────────────────────────────────────────────

export async function tempHelferSpeichernAction(planId: string, helferId: string | null, eingabe: unknown): Promise<ActionErgebnis<PlanungDTO>> {
  if (helferId !== null && !idSchema.safeParse(helferId).success) return { ok: false, fehler: UNGUELTIG };
  const e = felder(tempHelferEingabe, eingabe);
  if (!e.ok) return e;
  return aendere(planId, (id) => { speichereTempHelfer(getDb(), id, helferId, e.wert); });
}

export async function tempHelferLoeschenAction(planId: string, helferId: string): Promise<ActionErgebnis<PlanungDTO>> {
  if (!idSchema.safeParse(helferId).success) return { ok: false, fehler: UNGUELTIG };
  return aendere(planId, (id) => loescheTempHelfer(getDb(), id, helferId));
}
