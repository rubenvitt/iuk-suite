/**
 * Kanonische Form eines Zugangs-Codes. Seit DRK-442 sind es ZWEI: die lange
 * Form (28 Zeichen Crockford-Base32 in Vierergruppen, `_lib/tokenForm.ts`) und
 * die alte (6 Ziffern mit Bindestrich nach der dritten, Erzeugerform
 * `lagerbuch/src/actions/tokens.ts:15`), die bis zum Neudruck gilt.
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
 * Der `[^0-9A-Z]`-Filter ist bewusst weiter als beide Alphabete: er entfernt
 * Bindestriche und Leerzeichen jeder Art, verstuemmelt aber keinen fremden Wert
 * — ein Altbestand mit Buchstaben bliebe auffindbar.
 *
 * SIE WIRFT NIE. Der Validator ist die Gleichheitssuche gegen `tokens.code`;
 * ein Wurf hier machte aus einem Tippfehler einen 500 im Route Handler.
 *
 * Zusammen mit `CODEFELD_MUSTER` und `CODEFELD_LAENGE` am Feld (§7.2.4,
 * `_lib/tokenForm.ts`) ist das die vollstaendige Abhilfe.
 */
import { TOKEN_ALPHABET, TOKEN_GRUPPE, TOKEN_ZEICHEN } from "./tokenForm";

/**
 * ⚠️ DIE ZURUECKBILDUNG VON O, I UND L GILT NUR FUER GENAU 28 ZEICHEN. Das
 * Funkmodul bildet jede Eingabe zurueck; hier wuerde das einen Altbestand mit
 * einem `O` im Code unauffindbar machen. Die Laenge aendert sich durch die
 * Zurueckbildung nicht, die Entscheidung ist also eindeutig.
 */
export function normalisiereCode(roh: string): string {
  const nur = roh.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (nur.length === TOKEN_ZEICHEN) return gruppiereCode(nur.replace(/[IL]/g, "1").replace(/O/g, "0"));
  return /^\d{6}$/.test(nur) ? `${nur.slice(0, 3)}-${nur.slice(3)}` : nur;
}

/**
 * Setzt eine bindestrichfreie Zeichenkette in Gruppen zu `TOKEN_GRUPPE`. EIN
 * Helfer fuer Erzeuger und Normalisierung — zwei Gestalten liessen die
 * Gleichheitssuche einen frisch gezogenen Code nicht wiederfinden. Der
 * Bindestrich ist TEIL DES GESPEICHERTEN WERTS (§4.7), nicht der Anzeige.
 */
export function gruppiereCode(zeichen: string): string {
  const gruppen: string[] = [];
  for (let i = 0; i < zeichen.length; i += TOKEN_GRUPPE) gruppen.push(zeichen.slice(i, i + TOKEN_GRUPPE));
  return gruppen.join("-");
}

/**
 * IST DAS EIN CODE IN DER LANGEN FORM? — Praedikat auf die KANONISCHE Form,
 * also auf das Ergebnis von `normalisiereCode`, nicht auf die rohe Eingabe.
 *
 * Zwei Leser, eine Frage: die Schranke (`gateSchranke.ts`) laesst eine solche
 * Eingabe nie an der modulweiten Sperre scheitern, und die Verwaltung markiert
 * jeden aktiven Code, der sie NICHT hat, als „alte Form" (Neudruck noetig).
 *
 * ⚠️ SIE PRUEFT DAS ALPHABET, NICHT NUR DIE LAENGE. `normalisiereCode` laesst
 * ein `U` stehen; 28 Zeichen mit einem `U` sind kein Code dieser Form und
 * duerfen an der Sperre nicht vorbei — sonst waere die Ausnahme ein Weg, Muell
 * ungebremst in die Datenbank zu schicken, der nie ein Treffer sein kann.
 */
export function istLangerCode(wert: string): boolean {
  const ohneTrenner = wert.split("-").join("");
  if (ohneTrenner.length !== TOKEN_ZEICHEN) return false;
  for (const z of ohneTrenner) if (!TOKEN_ALPHABET.includes(z)) return false;
  return wert === gruppiereCode(ohneTrenner);
}
