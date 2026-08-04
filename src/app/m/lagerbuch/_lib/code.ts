/**
 * Kanonische Form eines Zugangs-Codes: 6 Ziffern mit Bindestrich nach der
 * dritten (Erzeugerform, `lagerbuch/src/actions/tokens.ts:15`).
 *
 * Die Suche laeuft auf Gleichheit gegen `tokens.code`, deshalb wird die EINGABE
 * auf die Erzeugerform gebracht und nicht die Spalte aufgeweicht. Damit kann die
 * Normalisierung nur Treffer HINZUFUEGEN, nie einen bestehenden verlieren —
 * genau deshalb ist sie sicher.
 *
 * WARUM DAS KEINE BEQUEMLICHKEIT IST, sondern die billigste Massnahme gegen
 * einen geteilten Fehlversuchs-Eimer (§7.5.3, Falle 24): `123456` findet heute
 * `123-456` nicht, und alle Helferinnen hinter demselben Uplink teilen sich
 * fuenf Fehlversuche pro Minute. Eine Bereitschaft, die zu Schichtbeginn von
 * Hand eintippt, sperrt sich selbst aus — mit RICHTIGEN Codes.
 *
 * Der `[^0-9A-Z]`-Filter ist bewusst weiter als sechs Ziffern: sollte der
 * Betreiber je alphanumerische Codes ausgeben, bleibt die Funktion richtig,
 * statt still zu verstuemmeln.
 *
 * SIE WIRFT NIE. Der Validator ist die Gleichheitssuche gegen `tokens.code`;
 * ein Wurf hier machte aus einem Tippfehler einen 500 im Route Handler.
 *
 * Zusammen mit `inputMode="numeric"`, `maxlength="7"` und `pattern` am Feld
 * (§7.2.4) ist das die vollstaendige Abhilfe.
 */
export function normalisiereCode(roh: string): string {
  const nur = roh.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^\d{6}$/.test(nur) ? `${nur.slice(0, 3)}-${nur.slice(3)}` : nur;
}
