import { zeitFormat } from "@/core/zeit";
import type { LagemonitorDb } from "../_db/client";
import { anzeige, kartenobjekt, zugang } from "../_db/schema";
import { konfigurationEingabe, speichereKonfiguration, VORGABE } from "./konfiguration";
import { legeObjektAn } from "./lagekarte";
import { lagekarteEingabe, type LagekarteEingabe } from "./lagekarteRegeln";
import { offeneMeldungen, legeMeldungAn, meldungEingabe } from "./meldungen";
import { legeZugangAn } from "./schluessel";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag lagemonitor). Idempotent und
 * additiv: Anzeige, Zugang, eine Meldung und die Lagekarte werden je für sich nur angelegt, wenn noch keine/keiner
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
  if (offeneMeldungen(db).length > 0) {
    zeilen.push("lagemonitor: Meldung läuft, nicht geändert");
  } else {
    const uhrzeit = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(Date.now() + 45 * 60_000);
    legeMeldungAn(db, meldungEingabe.parse({ text: "Nächste Lagebesprechung im FüKw", uhrzeit, kategorieId: "besprechung" }), "Demodaten");
    zeilen.push("lagemonitor: Meldung „Nächste Lagebesprechung“ angelegt (läuft 24 Stunden)");
  }
  if (db.select({ id: kartenobjekt.id }).from(kartenobjekt).limit(1).get()) {
    zeilen.push("lagemonitor: Lagekarte vorhanden, nicht geändert");
  } else {
    for (const o of LAGEKARTE_DEMO) {
      const r = legeObjektAn(db, lagekarteEingabe.parse(o), "Demodaten");
      zeilen.push(r.ok ? `lagemonitor: Lagekarte „${o.name}“ angelegt` : `lagemonitor: Lagekarte „${o.name}“ nicht angelegt (${r.fehler})`);
    }
  }
  return zeilen;
}

/** Erfundene Orte rund um Uelzen; die Zeichen stammen aus dem kommplan-Katalog. */
const LAGEKARTE_DEMO: LagekarteEingabe[] = [
  { art: "punkt", name: "Wache Nord", zeichen: "rezept:F.3.15", breite: 52.9782, laenge: 10.5531 },
  { art: "punkt", name: "Sammelraum Hafen", zeichen: "rezept:F.3.7", breite: 52.9601, laenge: 10.5869 },
  {
    art: "flaeche",
    name: "Bereitstellungsraum Süd",
    farbe: "ocker",
    ring: [[10.5512, 52.9478], [10.5671, 52.9483], [10.5702, 52.9415], [10.5585, 52.9381], [10.5486, 52.9420]],
  },
  {
    art: "flaeche",
    name: "Abschnitt Ost",
    farbe: "tuerkis",
    aufKarte: false,
    ring: [[10.5900, 52.9750], [10.6150, 52.9740], [10.6170, 52.9580], [10.5920, 52.9590]],
  },
];
