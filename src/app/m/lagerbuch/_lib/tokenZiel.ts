/**
 * Landeziel eines eingelösten Zugangs-Codes. Ein Code führt entweder direkt zu einem Fahrzeug
 * (Fahrzeug-Check, vorausgewählt) oder zu einem Material im Handlager (Artikel-Detail). Ohne Ziel
 * landet der Helfer auf der allgemeinen Artikel-Liste.
 *
 * Rückgabe ist ein lokaler Pfad (startet mit "/") und ist damit kompatibel mit sanitizeReturnTo.
 *
 * Übernommen aus `lagerbuch/src/lib/auth/tokenZiel.ts` (§3.1). Der erste Aufrufer
 * entstand in Teil 4 (`t/[code]/route.ts`, §7.2.3).
 *
 * ⚠️ DIE PFADE TRAGEN DIE AEUSSERE FORM (`/helfer`, `/a/<id>`), nicht die innere
 * (`/m/lagerbuch/helfer`). Sie landen in einem `Location`-Kopf bzw. in einem
 * `redirect()`, also beim Browser — und der kennt nur den Modul-Host.
 *
 * ⚠️ DIE ZUSAGE „ZEICHENGLEICH MIT DER ALT-ANWENDUNG" IST AUFGEHOBEN — DRK-394.
 * Sie stimmte schon seit DRK-302 nicht mehr (der Fahrzeugzweig laeuft ueber
 * `fahrzeugBindungAus`, und die Alt-Fassung kennt diesen zweiten Export nicht).
 * An ihre Stelle tritt die Zusage, die der Cutover tatsaechlich braucht und die
 * sich pruefen laesst: GLEICHE AUSGABE FUER JEDE ID, DIE DIE ALT-ANWENDUNG
 * ERZEUGEN KONNTE. Dort entsteht jede Artikel- und Fahrzeug-Id ueber `nanoid()`
 * (Alphabet `A-Za-z0-9_-`), der Handlager heisst `handlager` — und auf diesem
 * Alphabet ist die Kodierung die Identitaet. `tokenZiel.test.ts` haelt das fest.
 *
 * ⚠️ WARUM UEBERHAUPT KODIERT: `lagerorte.id` und `artikel.id` sind KEIN
 * nanoid-Vertrag, die Spalten nehmen jeden Text. Roh eingesetzt wird aus
 * `rtw#1` ein Fragment (der Server sieht alles ab `#` nicht), aus `a&x=1` ein
 * zweiter Parameter — und beides STILL: die Seite rendert klaglos, es fehlt
 * nur, was hinter dem Trennzeichen stand. Kein Tor sieht das.
 */
export function tokenZielPfad(zielTyp: string | null | undefined, zielId: string | null | undefined): string {
  if (zielTyp === "artikel" && zielId) return `/a/${encodeURIComponent(zielId)}`;
  const fahrzeug = fahrzeugBindungAus(zielTyp, zielId);
  if (fahrzeug) return `/helfer/check?${new URLSearchParams({ fz: fahrzeug })}`;
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
