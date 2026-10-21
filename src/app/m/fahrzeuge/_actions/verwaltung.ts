"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { listeFahrzeuge, NichtGefunden, SchonVergeben, setzeAktiv, speichereFahrzeug, type FahrzeugDTO } from "../_lib/daten";
import { fahrzeugEingabe } from "../_lib/eingabe";
import { entscheidungenSchema, wendeErstimportAn, zugeordneteSchluessel, type Erstimportergebnis } from "../_lib/erstimport/anwenden";
import { planeErstimport } from "../_lib/erstimport/plan";
import { leseKandidaten } from "../_lib/erstimport/quellen";
import { anzeigeName, requireFahrzeugeVerwaltenAktion } from "../_lib/zugang";

/** Nach jedem Schreiben: alle Seiten des Moduls mit neuem Bestand. */
function neuLaden(): void {
  revalidatePath("/m/fahrzeuge", "layout");
}

/** Die erwartbaren Fehler werden zum Satz am Feld bzw. oben im Formular; alles andere wirft weiter. */
function alsErgebnis<T>(schreiben: () => T): ActionErgebnis<T> {
  try {
    const wert = schreiben();
    neuLaden();
    return { ok: true, wert } as ActionErgebnis<T>;
  } catch (e) {
    if (e instanceof SchonVergeben) return { ok: false, fehler: e.message, feldFehler: { [e.feld]: e.message } };
    if (e instanceof NichtGefunden) return { ok: false, fehler: e.message };
    throw e;
  }
}

const idSchema = z.string().min(1).max(64);

/** Anlegen (`id === null`) oder ändern. */
export async function fahrzeugSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<FahrzeugDTO>> {
  const viewer = await requireFahrzeugeVerwaltenAktion();
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fehler: "Unbekanntes Fahrzeug." };
  const e = fahrzeugEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => alsErgebnis(() => speichereFahrzeug(getDb(), id, e.data)));
}

/** Aktivieren oder deaktivieren. Gelöscht wird nie: andere Apps verweisen auf die Kennung. */
export async function aktivSetzenAction(id: string, aktiv: boolean): Promise<ActionErgebnis> {
  const viewer = await requireFahrzeugeVerwaltenAktion();
  if (!idSchema.safeParse(id).success || typeof aktiv !== "boolean") return { ok: false, fehler: "Unbekanntes Fahrzeug." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = alsErgebnis(() => setzeAktiv(getDb(), id, aktiv));
    return r.ok ? { ok: true } : r;
  });
}

/**
 * Wendet den Erstimport an. Der Plan wird hier NEU gebaut (die Apps können sich seit dem Seitenaufruf
 * geändert haben); die Entscheidungen beziehen sich auf die Schlüssel der Vorschläge.
 */
export async function erstimportAction(eingabe: unknown): Promise<ActionErgebnis<Erstimportergebnis>> {
  const viewer = await requireFahrzeugeVerwaltenAktion();
  const e = entscheidungenSchema.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Die Auswahl ist unvollständig. Bitte die Seite neu laden." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const { kandidaten, fehler } = leseKandidaten();
    if (fehler.length > 0) return { ok: false, fehler: `Nicht lesbar: ${fehler.join(", ")}. Bitte später noch einmal versuchen.` };
    const db = getDb();
    return alsErgebnis(() => wendeErstimportAn(db, planeErstimport(kandidaten, listeFahrzeuge(db), zugeordneteSchluessel(db)), e.data, anzeigeName(viewer)));
  });
}
