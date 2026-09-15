/**
 * DRK-337 — DER ORT EINER ZAEHLUNG, als reine Werte und Funktionen.
 *
 * Kein "use client" (Falle 6): die Seite ist eine Server Component und liest
 * `ZAEHLORT_ALLE` sowie `zaehlOrtLabel`; das Formular und die Action lesen
 * dieselben Werte. Kein Icon-Import (Falle 7).
 *
 * WARUM EIN LAUF GENAU EINEN ORT ZAEHLT (Betreiberentscheidung, ClickUp
 * DRK-337): die Erwartungszahl jeder Position bezieht sich auf den gewaehlten
 * Ort. Zaehlte ein Lauf mehrere Orte, waere „erwartet 12" wieder eine Summe
 * ueber Orte — genau das Problem des Tickets, nur eine Ebene tiefer. Wer drei
 * Schraenke zaehlt, macht drei Laeufe; der Verlauf liest sich dann als
 * „Schrank 1", „Schrank 2", „GF-Schrank".
 */
import { HANDLAGER_ID } from "./konstanten";

/**
 * Der Wert der Auswahl und des URL-Parameters fuer „ganzer Handlager" — das
 * Verhalten vor DRK-337 und weiterhin die Vorgabe.
 *
 * ⚠️ NICHT `HANDLAGER_ID`, UND DAS IST DER GANZE UNTERSCHIED: die Wurzel ist
 * selbst ein waehlbarer Ort („noch keinem Schrank zugeordnet"). Beide auf
 * denselben Wert zu legen hiesse, dass eine Zaehlung der Wurzel still den
 * Bestand aller Schraenke miterwartet.
 */
export const ZAEHLORT_ALLE = "alle";

/**
 * Die Wurzel als Zaehlort. Der Name des Lagerorts („Handlager") waere hier
 * IRREFUEHREND: er stuende fuer denselben Bereich wie „ganzer Handlager", und
 * im Verlauf liesse sich beides nicht mehr auseinanderhalten.
 */
export const ZAEHLORT_WURZEL_LABEL = "Nicht zugeordnet";

/** Ein waehlbarer Zaehlort — `id` ist `ZAEHLORT_ALLE`, `HANDLAGER_ID` oder ein Schrank. */
export type ZaehlOrt = { id: string; label: string };

/**
 * Die Beschriftung eines Zaehlorts — EINE Quelle fuer Auswahl, Seitentext und
 * den append-only Verlauf. Zwei Schreibweisen desselben Orts liessen den
 * Verlauf anders klingen als die Auswahl, aus der er entstanden ist.
 */
export function zaehlOrtLabel(ortId: string | null, name: string | undefined): string {
  if (ortId === null || ortId === ZAEHLORT_ALLE) return "Ganzer Handlager";
  if (ortId === HANDLAGER_ID) return ZAEHLORT_WURZEL_LABEL;
  return name ?? ortId;
}

/**
 * Der URL-Parameter → die Ortskennung der Datenbank. `null` heisst „ganzer
 * Handlager"; ein unbekannter Wert wird NICHT hier abgewiesen, sondern von
 * `zaehlBereich` (`lesepfade/orte.ts`), das als einziges weiss, welche Orte es
 * gibt.
 */
export function zaehlOrtAus(roh: string | undefined): string | null {
  const wert = roh?.trim();
  return !wert || wert === ZAEHLORT_ALLE ? null : wert;
}

/** Der Ortsteil des Zaehlhinweises auf der Seite — „Gezählt wird …". */
export function zaehlOrtBeschreibung(ortId: string | null, name: string | undefined): string {
  if (ortId === null) return "Gezählt wird der Bestand im gesamten Handlager, über alle Schränke hinweg.";
  if (ortId === HANDLAGER_ID) {
    return "Gezählt wird, was im Handlager noch keinem Schrank zugeordnet ist — Schrankbestand bleibt außen vor.";
  }
  return `Gezählt wird der Bestand in ${name ?? ortId}. Erwartungszahlen und Korrekturen gelten nur für diesen Schrank.`;
}
