"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { fahrzeugEingabe, legeFahrzeugAn, loescheFahrzeug, QUELLEN, sicher } from "../_lib/fahrzeuge";
import { konfigurationEingabe, speichereKonfiguration, type KonfigurationDTO } from "../_lib/konfiguration";
import { beendeMeldung, legeMeldungAn, meldungEingabe, type MeldungDTO } from "../_lib/meldungen";
import { aendereKategorie, kategorieEingabe, legeKategorieAn, loescheKategorie, type KategorieDTO } from "../_lib/kategorien";
import { aendereObjekt, lagekarteEingabe, legeObjektAn, loescheObjekt, schalteObjekt } from "../_lib/lagekarte";
import { legeLinkAn, linkAdresse, widerrufeLink } from "../_lib/links";
import { onlineAdresse } from "../_lib/online";
import { legeZugangAn, widerrufeZugang } from "../_lib/schluessel";
import { setzeStandort, standortEingabe } from "../_lib/standort";
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
export async function meldungAnlegenAction(eingabe: unknown): Promise<ActionErgebnis<{ meldung: MeldungDTO; wartet: boolean }>> {
  const viewer = await requireLagemonitorAktion();
  const e = meldungEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = legeMeldungAn(getDb(), e.data, anzeigeName(viewer));
    if (!r.ok) return { ok: false, fehler: r.fehler };
    neuLaden();
    return { ok: true, wert: { meldung: r.meldung, wartet: r.wartet } };
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

/** Stellt ein Fahrzeug auf die Karte aller Monitore; seine Position kommt mit der nächsten Abholung seines Zugangs. */
export async function fahrzeugAnlegenAction(eingabe: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  const e = fahrzeugEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = legeFahrzeugAn(getDb(), e.data, anzeigeName(viewer));
    if (!r.ok) return r;
    neuLaden();
    return { ok: true };
  });
}

/** Nimmt ein Fahrzeug von der Karte; seine letzte Position ist damit gelöscht. */
export async function fahrzeugEntfernenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekanntes Fahrzeug." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!loescheFahrzeug(getDb(), id)) return { ok: false, fehler: "Dieses Fahrzeug steht schon nicht mehr auf der Karte." };
    neuLaden();
    return { ok: true };
  });
}

/** Setzt den Standort eines Monitors: GPS eines Fahrzeugs oder ein fester Ort. Der Monitor holt ihn mit der nächsten Abholung. */
export async function standortSetzenAction(eingabe: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  const e = standortEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = setzeStandort(getDb(), e.data);
    if (!r.ok) return r;
    neuLaden();
    return { ok: true };
  });
}

const objektId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 64;

/** Legt einen Punkt oder eine Fläche auf der Lagekarte an; alle Monitore holen es mit der nächsten Abholung. */
export async function lagekarteAnlegenAction(eingabe: unknown): Promise<ActionErgebnis<{ id: string }>> {
  const viewer = await requireLagemonitorAktion();
  const e = lagekarteEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = legeObjektAn(getDb(), e.data, anzeigeName(viewer));
    if (!r.ok) return r;
    neuLaden();
    return { ok: true, wert: { id: r.id } };
  });
}

export async function lagekarteAendernAction(id: unknown, eingabe: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (!objektId(id)) return { ok: false, fehler: "Unbekanntes Objekt." };
  const e = lagekarteEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = aendereObjekt(getDb(), id, e.data, anzeigeName(viewer));
    if (!r.ok) return r;
    neuLaden();
    return { ok: true };
  });
}

/** Schaltet ein Objekt auf der Karte ein oder aus, ohne es zu löschen. */
export async function lagekarteSchaltenAction(id: unknown, aufKarte: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (!objektId(id) || typeof aufKarte !== "boolean") return { ok: false, fehler: "Unbekanntes Objekt." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!schalteObjekt(getDb(), id, aufKarte, anzeigeName(viewer))) return { ok: false, fehler: "Dieses Objekt gibt es nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}

export async function lagekarteLoeschenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (!objektId(id)) return { ok: false, fehler: "Unbekanntes Objekt." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!loescheObjekt(getDb(), id)) return { ok: false, fehler: "Dieses Objekt gibt es nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}

/** Das Zeichen zur Auswahl im Formular, damit die Karte es gleich zeigt; `null`, wenn kommplan es nicht kennt. */
export async function lagekarteZeichenAction(schluessel: unknown): Promise<string | null> {
  await requireLagemonitorAktion();
  if (typeof schluessel !== "string" || schluessel.length === 0 || schluessel.length > 80) return null;
  return sicher(() => QUELLEN.svg([schluessel]), {})[schluessel] ?? null;
}
