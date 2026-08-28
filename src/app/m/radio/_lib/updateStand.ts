// src/app/m/radio/_lib/updateStand.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): `UpdateStand` ist ein WERT,
// den Server Components und Lesepfade lesen; eine Direktive machte daraus eine Modulreferenz.
// Der Scan, der das fuer `_lib/` und `_db/` modulweit durchsetzt, steht in
// `src/app/m/radio/riegel.test.ts:909-962`.

/**
 * DER UPDATE-STAND EINES GERAETS — EINE RECHNUNG, NICHT ZWEI (Entscheidung E-V8,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:673-704`).
 *
 * Der Alt-Bestand rechnet ihn ZWEIMAL: als SQL-Ausdruck in `listDevices`
 * (`radio-admin/server/src/repos/deviceRepo.ts:153-156`) und als Funktion
 * `computeUpdateStatus` (`radio-admin/shared/src/update-status.ts:3-12`), die von vier
 * Stellen gerufen wird. Der SQL-Kommentar sagt selbst, dass er den anderen spiegeln muss
 * (`deviceRepo.ts:149-150`: „SQL expression mirroring computeUpdateStatus(device, target)").
 * Diese Datei ist die EINE Wahrheit der Suite.
 *
 * ⛔ DIE RECHNUNG BLEIBT TROTZDEM AUCH IN SQL, und das ist keine Doppelung aus Bequemlichkeit:
 * der Stand ist ein FILTER (`deviceRepo.ts:189`) und ein SORTIERSCHLUESSEL (`:199`) der
 * paginierten Geraeteliste. Wer ihn erst nach `LIMIT`/`OFFSET` in JavaScript rechnet, filtert
 * und sortiert die falsche Seite. Aufgabe V6 baut den SQL-Ausdruck und traegt den
 * Kopplungsfall, der beide Ergebnisse gegeneinander haelt
 * (`.superpowers/sdd/planteil4/briefs/V5.md:73`).
 */
export type UpdateStand = "aktuell" | "veraltet" | "unbekannt";

/**
 * Die drei Zweige, 1:1 aus `radio-admin/server/src/repos/deviceRepo.ts:153-156` und
 * zeichengleich zur geteilten Funktion `radio-admin/shared/src/update-status.ts:7-11`.
 *
 * ⛔ DER DRITTE ZWEIG IST DER, DEN EIN NACHBAU FALSCH MACHT. Ist KEINE Zielversion gesetzt,
 * faellt jede nicht-leere Version auf „veraltet" — nicht auf „unbekannt". Der Alt-Kommentar
 * schreibt es aus (`deviceRepo.ts:151-152`, woertlich): „When target is null the 'aktuell'
 * branch can never match, so non-null versions fall through to 'veraltet' — matching the
 * shared fn exactly."
 *
 * ⛔ DER VERGLEICH IST `=== null` UND NICHT EINE FALSCHHEITSPRUEFUNG
 * (`update-status.ts:7`): eine erfasste leere Zeichenkette ist ein GESETZTER Wert. Ein
 * `if (!softwareVersion)` faltete sie still in den ersten Zweig, waere typkorrekt und
 * lint-sauber, und die Uebersicht zaehlte sie unter „unbekannt" statt unter „veraltet".
 *
 * ⛔ UND „aktuell" HAENGT AUSSCHLIESSLICH AN DER ZIEL-MARKE, NIE AM ANLEGEDATUM
 * (`KOPF.md:698-700`): `insertSoftwareVersionIfNew` legt eine neu gesehene Version OBEN in
 * der Anzeigeordnung ab (`radio-admin/server/src/repos/softwareVersionRepo.ts:29-30`, `:39`),
 * macht sie aber NIE zum Ziel. Woher die Marke kommt, entscheidet `zielVersion`
 * (`_lib/lesepfade/versionen.ts`) — diese Funktion bekommt sie gereicht und leitet nichts ab.
 */
export function berechneUpdateStand(
  softwareVersion: string | null,
  zielVersion: string | null,
): UpdateStand {
  if (softwareVersion === null) return "unbekannt";
  if (zielVersion !== null && softwareVersion === zielVersion) return "aktuell";
  return "veraltet";
}
