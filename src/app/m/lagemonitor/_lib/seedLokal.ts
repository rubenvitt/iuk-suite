import { zeitFormat } from "@/core/zeit";
import type { LagemonitorDb } from "../_db/client";
import { anzeige, zugang } from "../_db/schema";
import { konfigurationEingabe, speichereKonfiguration, VORGABE } from "./konfiguration";
import { aktiveMeldungen, legeMeldungAn, meldungEingabe } from "./meldungen";
import { legeZugangAn } from "./schluessel";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag lagemonitor). Idempotent und
 * additiv: Anzeige, Zugang und eine Meldung werden je für sich nur angelegt, wenn noch keine/keiner
 * da ist; Vorhandenes bleibt, wie es ist. Der Schlüssel des Demo-Zugangs steht nur in der Ausgabe, damit ein lokal laufender
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
  if (aktiveMeldungen(db).length > 0) {
    zeilen.push("lagemonitor: Meldung läuft, nicht geändert");
  } else {
    const uhrzeit = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(Date.now() + 45 * 60_000);
    legeMeldungAn(db, meldungEingabe.parse({ text: "Nächste Lagebesprechung im FüKw", uhrzeit, kategorieId: "besprechung" }), "Demodaten");
    zeilen.push("lagemonitor: Meldung „Nächste Lagebesprechung“ angelegt (läuft 24 Stunden)");
  }
  return zeilen;
}
