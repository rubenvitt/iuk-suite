import { eq } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { einstellungen } from "@/app/m/portal/_db/schema";
import {
  STANDARD_ZEITZONE,
  istGueltigeZeitzone,
  setzeAktiveZeitzone,
  waehlbareZeitzonen,
} from "@/core/zeit";

const ANSPRECHPARTNER = "ansprechpartner";

/** `null`, wenn nichts gepflegt ist — der Leerzustand zeigt dann nur die Erklärung. */
export async function leseAnsprechpartner(): Promise<string | null> {
  const db = getDb();
  const zeilen = await db
    .select()
    .from(einstellungen)
    .where(eq(einstellungen.schluessel, ANSPRECHPARTNER))
    .limit(1);
  return zeilen[0]?.wert.trim() || null;
}

export async function setzeAnsprechpartner(wert: string): Promise<void> {
  const db = getDb();
  await db
    .insert(einstellungen)
    .values({ schluessel: ANSPRECHPARTNER, wert })
    .onConflictDoUpdate({ target: einstellungen.schluessel, set: { wert } });
}

const ZEITZONE = "zeitzone";

/**
 * Die gepflegte Anzeigezone der Suite (DRK-469), sonst `STANDARD_ZEITZONE`.
 * Eine Zone, die `Intl` nicht (mehr) kennt, fällt ebenfalls auf den Standard
 * zurück: ein Boot soll an einem veralteten Zonennamen nicht scheitern.
 * Synchron, weil der Boot sie vor dem ersten Request setzt (`core/bootstrap.ts`).
 */
export function leseZeitzone(): string {
  const zeile = getDb()
    .select()
    .from(einstellungen)
    .where(eq(einstellungen.schluessel, ZEITZONE))
    .get();
  const wert = zeile?.wert.trim();
  return wert && istGueltigeZeitzone(wert) ? wert : STANDARD_ZEITZONE;
}

/**
 * Speichert die Zone und setzt sie sofort für diesen Prozess (`core/zeit`).
 * Nur Zonen aus `waehlbareZeitzonen()`: die Auswahl der Verwaltung bietet
 * nichts anderes an, alles andere ist ein manipuliertes Formular.
 */
export async function setzeZeitzone(wert: string): Promise<void> {
  if (!waehlbareZeitzonen().includes(wert)) throw new Error(`Unbekannte Zeitzone: ${wert}`);
  const db = getDb();
  await db
    .insert(einstellungen)
    .values({ schluessel: ZEITZONE, wert })
    .onConflictDoUpdate({ target: einstellungen.schluessel, set: { wert } });
  setzeAktiveZeitzone(wert);
}
