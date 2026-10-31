"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { konfigurationEingabe, speichereKonfiguration, type KonfigurationDTO } from "../_lib/konfiguration";
import { beendeMeldung, legeMeldungAn, meldungEingabe, type MeldungDTO } from "../_lib/meldungen";
import { aendereKategorie, kategorieEingabe, legeKategorieAn, loescheKategorie, type KategorieDTO } from "../_lib/kategorien";
import { legeLinkAn, linkAdresse, widerrufeLink } from "../_lib/links";
import { onlineAdresse } from "../_lib/online";
import { legeZugangAn, widerrufeZugang } from "../_lib/schluessel";
import { anzeigeName, requireLagemonitorAktion } from "../_lib/zugang";

function neuLaden(): void {
  revalidatePath("/m/lagemonitor", "layout");
}

/** Speichert die Anzeige. Der Lagemonitor holt sie spätestens nach einer Minute ab. */
export async function anzeigeSpeichernAction(eingabe: unknown): Promise<ActionErgebnis<KonfigurationDTO>> {
  const viewer = await requireLagemonitorAktion();
  const e = konfigurationEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const wert = speichereKonfiguration(getDb(), e.data, anzeigeName(viewer));
    neuLaden();
    return { ok: true, wert };
  });
}

const bezeichnungSchema = z.string().trim().min(1, "Bitte eine Bezeichnung angeben, etwa „FüKw Uelzen“.").max(60, "Höchstens 60 Zeichen.");

/** Legt einen Schlüssel an. Er steht nur in dieser Antwort; gespeichert ist allein sein Hash. */
export async function zugangAnlegenAction(bezeichnung: unknown): Promise<ActionErgebnis<{ schluessel: string }>> {
  const viewer = await requireLagemonitorAktion();
  const b = bezeichnungSchema.safeParse(bezeichnung);
  if (!b.success) return { ok: false, fehler: b.error.issues[0].message, feldFehler: { bezeichnung: b.error.issues[0].message } };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const { schluessel } = legeZugangAn(getDb(), b.data, anzeigeName(viewer));
    neuLaden();
    return { ok: true, wert: { schluessel } };
  });
}

export async function zugangWiderrufenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannter Zugang." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!widerrufeZugang(getDb(), id)) return { ok: false, fehler: "Diesen Zugang gibt es nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}

const linkBezeichnungSchema = z.string().trim().min(1, "Bitte eine Bezeichnung angeben, etwa „Rechner Wache“.").max(60, "Höchstens 60 Zeichen.");

/** Legt einen Link für den Online-Monitor an. Der Link steht nur in dieser Antwort. */
export async function linkAnlegenAction(bezeichnung: unknown): Promise<ActionErgebnis<{ adresse: string }>> {
  const viewer = await requireLagemonitorAktion();
  const basis = onlineAdresse();
  if (!basis) return { ok: false, fehler: "Für den Online-Monitor ist keine Adresse eingetragen." };
  const b = linkBezeichnungSchema.safeParse(bezeichnung);
  if (!b.success) return { ok: false, fehler: b.error.issues[0].message, feldFehler: { bezeichnung: b.error.issues[0].message } };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const { schluessel } = legeLinkAn(getDb(), b.data, anzeigeName(viewer));
    neuLaden();
    return { ok: true, wert: { adresse: linkAdresse(basis, schluessel) } };
  });
}

export async function linkWiderrufenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannter Link." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!widerrufeLink(getDb(), id)) return { ok: false, fehler: "Diesen Link gibt es nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}

/** Legt eine Meldung fürs Band an. Ohne Ablauf geht es nicht; die Vorgabe sind 24 Stunden. */
export async function meldungAnlegenAction(eingabe: unknown): Promise<ActionErgebnis<MeldungDTO>> {
  const viewer = await requireLagemonitorAktion();
  const e = meldungEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = legeMeldungAn(getDb(), e.data, anzeigeName(viewer));
    if (!r.ok) return { ok: false, fehler: r.fehler };
    neuLaden();
    return { ok: true, wert: r.meldung };
  });
}

/** Nimmt eine Meldung sofort vom Monitor (spätestens nach der nächsten Abholung). */
export async function meldungBeendenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannte Meldung." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!beendeMeldung(getDb(), id)) return { ok: false, fehler: "Diese Meldung läuft schon nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}

/** Legt eine Meldekategorie an; sie steht sofort beim Anlegen einer Meldung zur Wahl. */
export async function kategorieAnlegenAction(eingabe: unknown): Promise<ActionErgebnis<KategorieDTO>> {
  const viewer = await requireLagemonitorAktion();
  const e = kategorieEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = legeKategorieAn(getDb(), e.data);
    if (!r.ok) return { ok: false, fehler: r.fehler };
    neuLaden();
    return { ok: true, wert: r.kategorie };
  });
}

/** Ändert eine Kategorie; laufende Meldungen mit ihr ändern sich am Monitor mit. */
export async function kategorieAendernAction(id: unknown, eingabe: unknown): Promise<ActionErgebnis<KategorieDTO>> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannte Kategorie." };
  const e = kategorieEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = aendereKategorie(getDb(), id, e.data);
    if (!r.ok) return { ok: false, fehler: r.fehler };
    neuLaden();
    return { ok: true, wert: r.kategorie };
  });
}

/** Löscht eine Kategorie. Laufende Meldungen mit ihr bleiben stehen, ohne Kategorie. */
export async function kategorieLoeschenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannte Kategorie." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!loescheKategorie(getDb(), id)) return { ok: false, fehler: "Diese Kategorie gibt es nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}
