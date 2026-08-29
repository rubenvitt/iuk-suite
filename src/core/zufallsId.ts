/**
 * `crypto.randomUUID` existiert nur im Secure Context (HTTPS oder `localhost`
 * wörtlich, NICHT jede Adresse, die per DNS darauf auflöst). Im Einsatz laufen
 * mehrere Module dieser Suite auch über `http` auf einer LAN-IP oder einer
 * `*.localtest.me`-Adresse — dort fehlt die Funktion, und ein direkter Aufruf
 * risse die Seite mit einem TypeError ab, statt einen Eintrag anzulegen.
 *
 * Hierher gehoben (Regel für `src/core`: nur was ein zweites, heute
 * belegbares Modul braucht), weil `uav` (`_ui/teilnehmer/useFortschritt.ts`,
 * gemessen per `e2e/uav.spec.ts`s Offline-Check: `Uncaught TypeError:
 * crypto.randomUUID is not a function`) denselben Bedarf hat wie `qr`
 * (ursprünglich `_lib/history.ts`, das jetzt von hier importiert). Beide sind
 * offline-fähige Einsatz-PWAs mit identischer Anforderung: ein eindeutiger
 * Schlüssel, kein Sicherheitsmerkmal.
 *
 * Der Fallback ist bewusst UUID-v4-förmig (RFC 4122, per `Math.random()` statt
 * eines CSPRNG — unbedenklich, weil die IDs keine Sicherheitseigenschaft
 * tragen) und nicht nur "eindeutig": ein Verbraucher darf am Format des
 * Rückgabewerts nicht unterscheiden können, ob `crypto.randomUUID` verfügbar
 * war oder nicht.
 */
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (zeichen) => {
    const zufall = Math.floor(Math.random() * 16);
    const wert = zeichen === "x" ? zufall : (zufall & 0x3) | 0x8;
    return wert.toString(16);
  });
}
