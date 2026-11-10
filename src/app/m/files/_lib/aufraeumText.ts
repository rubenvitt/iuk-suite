import type { Aufraeumzahlen } from "./aufraeumen";
import { byteTextBinaer } from "./bytetext";

function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

/**
 * DER SATZ DER RUECKFRAGE VOR „Jetzt aufräumen" (IDA-388), aus den Zahlen des
 * Trockenlaufs. Nur was geloescht wuerde, steht drin — eine Aufzaehlung mit
 * „0 Abgaben" liest sich wie eine Warnung, die keine ist. `null` heisst: es gibt
 * nichts zu loeschen.
 *
 * Verwaiste Ablagen stehen NICHT drin: der Lauf meldet sie nur, er loescht sie
 * nicht (`_lib/aufraeumen.ts`).
 */
export function aufraeumSatz(zahlen: Aufraeumzahlen): string | null {
  const teile: string[] = [];
  if (zahlen.sharesGeloescht > 0) {
    teile.push(anzahl(zahlen.sharesGeloescht, "abgelaufene Freigabe", "abgelaufene Freigaben"));
  }
  if (zahlen.dateienGeloescht > 0) {
    teile.push(
      `${anzahl(zahlen.dateienGeloescht, "Datei", "Dateien")} (${byteTextBinaer(zahlen.bytesGeloescht)})`,
    );
  }
  if (zahlen.inboxGeloescht > 0) {
    teile.push(anzahl(zahlen.inboxGeloescht, "Abgabe im Posteingang", "Abgaben im Posteingang"));
  }
  if (zahlen.logzeilenGeloescht > 0) {
    teile.push(
      anzahl(zahlen.logzeilenGeloescht, "Eintrag im Zugriffsprotokoll", "Einträge im Zugriffsprotokoll"),
    );
  }
  if (teile.length === 0) return null;
  const liste =
    teile.length === 1 ? teile[0] : `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
  return `Löscht ${liste}.`;
}
