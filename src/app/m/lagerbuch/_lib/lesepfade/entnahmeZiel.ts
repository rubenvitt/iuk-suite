/**
 * DAS GEMERKTE ENTNAHMEZIEL — DRK-300. Kein "use client", kein Icon-Import.
 *
 * Die Wahl liegt in einem Cookie und gilt für den ganzen Kärtchen-Zugang; das
 * Fahrzeug dahinter liegt in der Datenbank und kann sich in derselben Zeit
 * ändern. Hier kommen beide zusammen.
 */
import { eq } from "drizzle-orm";
import { lagerorte } from "../../_db/schema";
import { zielAusWert, type ZielAnzeige } from "../entnahmeZiel";
import { istAktivesFahrzeug } from "./fahrzeuge";
import type { Leser } from "./bestand";

/**
 * ⚠️ EIN UNTAUGLICHES ZIEL WIRD `null`, NICHT `{ art: "verbrauch" }`.
 *
 * Der Unterschied ist die ganze Zusage des Tickets. Ein stillgelegtes oder
 * gelöschtes Fahrzeug macht aus der Wahl wieder eine offene Entscheidung: der
 * Buchen-Knopf sperrt, die Person wählt neu. Ein Rückfall auf Verbrauch wäre
 * der stille Ausgang — der Knopf bliebe bedienbar, die Buchung ginge durch,
 * und das Material läge trotzdem im Fahrzeug.
 *
 * Die Verbrauchswahl fragt die Datenbank GAR NICHT: sie hat kein Gegenstück
 * dort, und ein Lookup „zur Sicherheit" wäre eine Abfrage, die nie etwas
 * findet und deren leeres Ergebnis irgendwann jemand als Fehler liest.
 *
 * ⚠️ `tokenId` IST PFLICHT, nicht Beiwerk: die Wahl gehört ihrem Kärtchen, und
 * `zielAusWert` verwirft die einer fremden Schicht (Review-Befund P1 zu
 * PR #140). Auf einem geteilten Telefon buchte die nächste Person sonst auf das
 * Fahrzeug der vorigen, ohne je gewählt zu haben.
 */
export function gemerktesZiel(
  db: Leser,
  cookieWert: string | undefined | null,
  tokenId: string,
): ZielAnzeige | null {
  const ziel = zielAusWert(cookieWert, tokenId);
  if (!ziel) return null;
  if (ziel.art === "verbrauch") return ziel;
  if (!istAktivesFahrzeug(db, ziel.lagerortId)) return null;

  const zeile = db.select().from(lagerorte).where(eq(lagerorte.id, ziel.lagerortId)).get();
  // Der Name ist, was am Regal gelesen wird; Art und Kennung stehen seit
  // DRK-309 daneben — Begruendung am Typ `ZielAnzeige`.
  return {
    art: "fahrzeug", lagerortId: ziel.lagerortId, name: zeile!.name,
    kennung: zeile!.kennung, einheitenart: zeile!.einheitenart,
  };
}
