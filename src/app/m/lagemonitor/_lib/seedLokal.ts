import type { LagemonitorDb } from "../_db/client";
import { anzeige, zugang } from "../_db/schema";
import { konfigurationEingabe, speichereKonfiguration, VORGABE } from "./konfiguration";
import { legeZugangAn } from "./schluessel";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag lagemonitor). Idempotent und
 * additiv: Anzeige und Zugang werden je für sich nur angelegt, wenn noch keine/keiner da ist; Vorhandenes
 * bleibt, wie es ist. Der Schlüssel des Demo-Zugangs steht nur in der Ausgabe, damit ein lokal laufender
 * Lagemonitor ihn in seine `.env` übernehmen kann.
 */
export async function seedLokalLagemonitor(db: LagemonitorDb): Promise<string[]> {
  const zeilen: string[] = [];
  if (db.select({ id: anzeige.id }).from(anzeige).limit(1).get()) {
    zeilen.push("lagemonitor: Anzeige vorhanden, nicht geändert");
  } else {
    speichereKonfiguration(db, konfigurationEingabe.parse({ ...VORGABE, warnschwelle: "Moderate" }), "Demodaten");
    zeilen.push("lagemonitor: Anzeige für Uelzen angelegt");
  }
  if (db.select({ id: zugang.id }).from(zugang).limit(1).get()) {
    zeilen.push("lagemonitor: Zugang vorhanden, nicht geändert");
  } else {
    const { schluessel } = legeZugangAn(db, "FüKw Uelzen (Demo)", "Demodaten");
    zeilen.push(`lagemonitor: Zugang angelegt (LAGEMONITOR_SUITE_TOKEN=${schluessel})`);
  }
  return zeilen;
}
