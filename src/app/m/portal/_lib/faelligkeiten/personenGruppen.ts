/**
 * DIE GRUPPEN DER ABONNENTEN FÜR DEN WÖCHENTLICHEN PUSH — aus Pocket ID, nicht aus einer Sitzung
 * (IDA-297). Der Takt läuft ohne Anfrage, also ohne JWT; und ein Gruppenstand vom letzten Besuch
 * schickte jemandem, dem das Modulrecht entzogen wurde, noch wochenlang dessen Fristen.
 *
 * `null` als Ergebnis heißt: kein Verzeichnis eingerichtet (lokal, e2e) — dann gilt der Stand vom
 * letzten Besuch der Seite. Ein Verzeichnis, das gerade nicht antwortet, WIRFT: der Takt versucht es
 * beim nächsten Schritt wieder, statt nach einem veralteten Stand zu senden.
 *
 * In der Liste: Person gesperrt oder in Pocket ID gelöscht → `null`, sie bekommt nichts.
 *
 * Kein `"use client"` (Falle 6).
 */
import { ladeRechte, type RechteDaten } from "@/app/m/portal/_lib/rechte";

export type GruppenJePerson = ReadonlyMap<string, readonly string[] | null>;

export async function personenGruppen(laden: () => Promise<RechteDaten> = () => ladeRechte()): Promise<GruppenJePerson | null> {
  const daten = await laden();
  if (daten.status === "unconfigured") return null;
  if (daten.status === "error") throw new Error("Pocket ID nicht erreichbar");
  const namen = new Map(daten.gruppen.map((g) => [g.id, g.name]));
  return new Map(daten.personen.map((p) => [
    p.id,
    p.gesperrt ? null : p.gruppenIds.map((id) => namen.get(id)).filter((n): n is string => n !== undefined),
  ]));
}
