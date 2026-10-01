import type { KommplanDb } from "../_db/client";
import type { DruckseiteDaten } from "../_ui/druck/Druckseite";
import { kopfFuerZeichnung } from "./briefkopf";
import { teileAuf } from "./layout/papier";
import type { Papierformat } from "./layout/typen";
import type { LesbarerPlan } from "./plaene";
import { rahmenFuer } from "./rahmen";
import { symboleFuer } from "./zeichen/zeichen";

/**
 * DIE DATEN EINER DRUCKSEITE (Umsetzungsplan Phase 5, Entscheidung 13) — nur Server (liest das Rezept-Generat).
 * Gleich für die internen und die Token-Druckrouten; was sich unterscheidet (QR-Ziel, SVG-Export), kommt als Auftrag.
 */
export interface DruckAuftrag { format: Papierformat }

export async function druckseitenDaten(db: KommplanDb, plan: LesbarerPlan, auftrag: DruckAuftrag): Promise<DruckseiteDaten> {
  const inhalt = plan.inhalt;
  const rahmen = rahmenFuer({
    titel: plan.titel, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
    aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: inhalt?.optionen.vermerkVsNfD ?? false, kopf: kopfFuerZeichnung(db),
  });
  return {
    format: auftrag.format,
    blaetter: inhalt ? teileAuf(inhalt, auftrag.format) : null,
    rahmen,
    symbole: inhalt ? symboleFuer(inhalt) : {},
  };
}
