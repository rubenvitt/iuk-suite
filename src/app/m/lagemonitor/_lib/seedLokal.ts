import type { LagemonitorDb } from "../_db/client";
import { anzeige } from "../_db/schema";
import { konfigurationEingabe, speichereKonfiguration, VORGABE } from "./konfiguration";
import { legeZugangAn } from "./schluessel";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag lagemonitor). Idempotent: steht
 * schon eine Anzeige, bleibt alles, wie es ist. Der Schlüssel des Demo-Zugangs steht nur in der
 * Ausgabe, damit ein lokal laufender Lagemonitor ihn in seine `.env` übernehmen kann.
 */
export async function seedLokalLagemonitor(db: LagemonitorDb): Promise<string[]> {
  if (db.select({ id: anzeige.id }).from(anzeige).limit(1).get()) return ["lagemonitor: Anzeige vorhanden, nichts geändert"];
  speichereKonfiguration(db, konfigurationEingabe.parse({ ...VORGABE, warnschwelle: "Moderate" }), "Demodaten");
  const { schluessel } = legeZugangAn(db, "FüKw Uelzen (Demo)", "Demodaten");
  return [`lagemonitor: Anzeige für Uelzen und ein Zugang angelegt (LAGEMONITOR_SUITE_TOKEN=${schluessel})`];
}
