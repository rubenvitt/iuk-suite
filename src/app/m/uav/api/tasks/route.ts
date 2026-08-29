import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { alleTasks } from "../../_lib/queries";

export const dynamic = "force-dynamic";

/**
 * DER AUFGABENKATALOG — UND ER IST SEIT DEM 2026-08-29 OHNE ANMELDUNG LESBAR.
 *
 * Hier stand: `identitaetAus(req, db)`, und `kind === "anon"` bekam 401. Das ist
 * eine ausdrückliche Betreiberentscheidung, kein aufgeweichter Riegel — der
 * Wortlaut: „Auf einem geteilten Tablet soll man den Aufgabenkatalog auch ohne
 * jeden Code durchblättern können — nur lesen, nichts erfassen. Zum Eintragen
 * einer Durchführung braucht es dann weiterhin einen Code."
 *
 * WAS DIESE ZEILE FREIGIBT, ist der Trainingsinhalt: Titel, Schritte, Lernziel,
 * Hinweise, Bild. Keine personenbezogene Angabe. Teilnehmende, Codes und
 * Fortschritt bleiben unverändert gesperrt — `/api/progress`, `/api/sync`,
 * `/api/me` und alles unter `/api/admin/` sind unangetastet.
 *
 * ⛔ `hostAbweisung(req)` BLEIBT DIE ERSTE ANWEISUNG. Ohne sie wäre der Katalog
 * auf JEDEM Suite-Host lesbar, der auf denselben Container terminiert — die
 * Freigabe gilt für den Modul-Host, nicht für die Suite.
 *
 * ⛔ `alleTasks(db, false)` BLEIBT MIT `false`: anonym gibt es nur die AKTIVEN
 * Aufgaben. Eine deaktivierte Aufgabe ist eine Entscheidung der Verwaltung und
 * geht sonst niemanden etwas an; der Verwaltungszweig liest an anderer Stelle
 * mit `true`.
 *
 * Ohne diese Änderung bliebe die anonyme Ansicht leer: `useKatalog` verschluckt
 * einen Fehler bewusst und behält den (dann leeren) Cache — der Bildschirm
 * sähe kaputt aus, nicht gesperrt.
 */
export async function GET(req: Request) {
  const abweisung = hostAbweisung(req);
  if (abweisung) return abweisung;
  return NextResponse.json(alleTasks(getDb(), false));
}
