/**
 * Landeziel eines eingelösten Zugangs-Codes. Ein Code führt entweder direkt zu einem Fahrzeug
 * (Fahrzeug-Check, vorausgewählt) oder zu einem Material im Handlager (Artikel-Detail). Ohne Ziel
 * landet der Helfer auf der allgemeinen Artikel-Liste.
 *
 * Rückgabe ist ein lokaler Pfad (startet mit "/") und ist damit kompatibel mit sanitizeReturnTo.
 *
 * ZEICHENGLEICH aus `lagerbuch/src/lib/auth/tokenZiel.ts` — nur der Ablageort
 * wechselt (§3.1). Der erste Aufrufer entsteht in Teil 4 (`t/[code]/route.ts`,
 * §7.2.3); bis dahin ist die Datei bewusst ohne Konsument.
 *
 * ⚠️ DIE PFADE TRAGEN DIE AEUSSERE FORM (`/helfer`, `/a/<id>`), nicht die innere
 * (`/m/lagerbuch/helfer`). Sie landen in einem `Location`-Kopf bzw. in einem
 * `redirect()`, also beim Browser — und der kennt nur den Modul-Host.
 */
export function tokenZielPfad(zielTyp: string | null | undefined, zielId: string | null | undefined): string {
  if (zielTyp === "artikel" && zielId) return `/a/${zielId}`;
  const fahrzeug = fahrzeugBindungAus(zielTyp, zielId);
  if (fahrzeug) return `/helfer/check?fz=${fahrzeug}`;
  return "/helfer";
}

/**
 * DIE FAHRZEUGBINDUNG EINES KAERTCHENS — DRK-302.
 *
 * Gibt die Fahrzeug-Id zurueck, auf die ein Kaertchen zeigt, sonst `null`.
 * `tokenZielPfad` baut seinen Fahrzeug-Zweig ueber DIESE Funktion, und das ist
 * der Punkt: Landung und Begrenzung beantworten dieselbe Frage, koennen also
 * konstruktiv nicht auseinanderlaufen. Ein zweites `zielTyp === "fahrzeug" &&
 * zielId` an der Check-Seite waere eine zweite Wahrheit — und die faellt erst
 * auf, wenn jemand eine der beiden erweitert (dieselbe Begruendung, aus der
 * `SperrGrund` in `helferZugang.ts` geteilt wird).
 *
 * ⚠️ SIE IST EINE ANZEIGE-ENTSCHEIDUNG, KEIN RIEGEL. DRK-302 grenzt den
 * EINSTIEG nach dem Scan auf sein Fahrzeug ein; das Ticket haelt ausdruecklich
 * fest, dass Fahrzeugfilterung „nicht automatisch eine neue Berechtigungsregel"
 * ist. Die Durchsetzung gegen eine selbst gebaute Anfrage waere der Riegel in
 * `_actions/check.ts` (Ansatzpunkt 2, offene Betreiberfrage 5) — der bleibt
 * unangetastet, weil er zur physischen Verteilung der Etiketten passen muss und
 * die ist unbeantwortet.
 *
 * ⚠️ NICHT `tokens.scope_lagerort_id`. Die Spalte ist eine TOTE Spalte
 * (`_db/schema.ts`): kein Produktionspfad schreibt sie, die Token-Verwaltung
 * pflegt `zielTyp`/`zielId`. Eine Begrenzung ueber `scope_lagerort_id` waere
 * heute fuer JEDES Kaertchen leer — und damit wirkungslos, ohne dass ein Tor
 * etwas meldet.
 *
 * BEIDE HALBFORMEN WERDEN GEPRUEFT. `zielTyp` und `zielId` sind je fuer sich
 * nullbar; ein `zielTyp: "fahrzeug"` ohne `zielId` ergaebe sonst eine Bindung an
 * die leere Zeichenkette, und die Check-Seite zeigte fuer ein solches Kaertchen
 * gar kein Fahrzeug mehr.
 */
export function fahrzeugBindungAus(
  zielTyp: string | null | undefined,
  zielId: string | null | undefined,
): string | null {
  return zielTyp === "fahrzeug" && zielId ? zielId : null;
}
