/**
 * Wie die Verwaltung die Freitextspalte `devices.status` liest, wenn sie fragt, ob ein Gerät
 * raus darf (IDA-383). Die Wörter folgen der Wortliste der Suite (Zustände eines Geräts:
 * einsatzbereit, nicht einsatzbereit, ausgemustert).
 *
 * ⚠️ NICHT DIE KIOSK-SICHT. `geraeteZustandAus` (`_lib/status.ts`) faltet für die Ausleihe auf
 * vier Zustände; dies hier sortiert die Rohspalte der Verwaltung in drei Gruppen. Die Spalte ist
 * Freitext ohne Schemagrenze (`STATUS_OPTIONEN`, `_lib/geraeteFelder.ts`), also zählt jeder
 * unbekannte Wert als „nicht einsatzbereit": wer etwas anderes als „einsatzbereit" einträgt,
 * meint fast immer, dass etwas fehlt.
 *
 * Leer und „Ausgeliehen" bzw. `ON_LOAN` (Altwerte aus dem Bestand) zählen als einsatzbereit — den
 * Leihstand trägt die Tabelle `loans`, nicht diese Spalte.
 *
 * Seit IDA-397 entscheidet diese Einteilung auch die Ausleihe: `geraeteZustandAus` sperrt alles,
 * was hier nicht einsatzbereit ist, und die Ausleihe blendet Ausgemustertes aus.
 */
export type Einsatzbereitschaft = "einsatzbereit" | "nicht-einsatzbereit" | "ausgemustert";

function normal(roh: string | null | undefined): string {
  return (roh ?? "").trim().toLowerCase();
}

export function einsatzbereitschaftAus(roh: string | null | undefined): Einsatzbereitschaft {
  const wert = normal(roh);
  if (wert === "" || wert === "einsatzbereit" || wert === "ausgeliehen" || wert === "on_loan") return "einsatzbereit";
  if (wert === "ausgemustert") return "ausgemustert";
  return "nicht-einsatzbereit";
}

/** Der Text auf dem Bildschirm: der gepflegte Wert, sonst „einsatzbereit". */
export function statusText(roh: string | null | undefined): string {
  const wert = (roh ?? "").trim();
  return wert === "" ? "einsatzbereit" : wert;
}

/**
 * Der `Tag`-Ton je Gruppe. Kein Rot (Falle 3): „nicht einsatzbereit" ist eine Warnung, kein
 * Fehler; `undefined` ist antds grauer Vorgabeton.
 */
export const BEREITSCHAFT_TON: Record<Einsatzbereitschaft, "success" | "warning" | undefined> = {
  einsatzbereit: "success",
  "nicht-einsatzbereit": "warning",
  ausgemustert: undefined,
};
