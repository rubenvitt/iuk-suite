/**
 * Der Vertrag ueber die Auswahl in der URL (Spec 1 §4.3.3,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3466-3488`).
 *
 * ⛔ EIN Parameter `geraete`, KOMMAGETRENNT (`/ausleihen?geraete=abc,def`) — nicht der
 * wiederholte Parameter. Drei Gruende, alle in Spec:3472-3475: die RSC-Seite hat einen Typ
 * statt drei Faellen; die URL bleibt kurz genug fuer einen QR-Code auf einem Aufsteller;
 * und die Reihenfolge ist stabil, was den Vergleich in `router.replace` billig macht.
 *
 * ⚠️ NEXT LIEFERT TROTZDEM `string | string[] | undefined`. Der Alt-Kiosk loest dieselbe
 * Zweideutigkeit im Client auf (`radio-inventar/apps/frontend/src/routes/loan.tsx:12-31`,
 * dort ueber `z.union([z.string(), z.array(z.string())])`). `auswahlLesen` nimmt alle drei
 * Formen und wirft bei keiner — eine handgeschriebene URL darf kein HTTP 500 sein.
 *
 * ⛔ KEIN `"use client"`. Gelesen von der RSC-Seite (A19, Plan
 * `docs/superpowers/plans/2026-08-22-radio-modul-plan3-zugang-ausleihe.md:5067`) UND von
 * der Insel, die mit `auswahlSchreiben` ihr `router.replace` baut (A18). Falle 6,
 * durchgesetzt von `src/app/m/radio/riegel.test.ts:909-962`.
 *
 * ⛔ WAS HIER NICHT GEPRUEFT WIRD: ob eine Kennung zu einem Geraet gehoert, das es gibt und
 * das frei ist. Ungueltige Kennungen werden SERVERSEITIG aussortiert und der Verlust wird
 * ANGEZEIGT, nicht verschluckt (Spec:3486-3488) — das baut A19.
 */

/**
 * Der Deckel: hoechstens zwanzig Geraete in einem Vorgang.
 *
 * ⛔ NEU GEGENUEBER DEM BESTAND, und der Anlass ist gemessen: heute gibt es keinen Deckel,
 * und 200 Kennungen in der URL waeren 200 einzelne POSTs
 * (`radio-inventar/apps/frontend/src/components/features/ConfirmLoanButton.tsx:55`,
 * Spec:3482-3484).
 *
 * ⛔ DER SICHTBARE SATZ DAZU STEHT NICHT HIER, SONDERN AUF DER FLAECHE VON A19 (Plan
 * `docs/superpowers/plans/2026-08-22-radio-modul-plan3-zugang-ausleihe.md:5089`). ⚠️ AUFLAGE:
 * A19 setzt die Zahl aus DIESER Konstante in den Satz ein und schreibt keine zweite 20 —
 * zwei Zahlen fuer denselben Deckel laufen beim ersten Aendern auseinander, und die
 * Oberflaeche nennte dann eine Grenze, die nicht gilt.
 *
 * ⛔ UND DER DECKEL SCHNEIDET STILL — DAS SICHTBARMACHEN GEHOERT A19, NICHT DIESER DATEI.
 * `auswahlLesen` liefert nur die gekappte Liste; an ihr ist „genau zwanzig gewaehlt" nicht
 * von „fuenfundzwanzig uebergeben und fuenf abgeschnitten" zu unterscheiden. Spec:3482-3483
 * verlangt aber, dass die Flaeche es SAGT. ⚠️ AUFLAGE AN A19: wer den Satz zeigt, braucht
 * die Erkennung — und holt sie sich NICHT ueber ein zweites Auslesen des rohen Parameters
 * (das waere der zweite Normalisierungsort, den `normalisiereIds` unten gerade vermeidet),
 * sondern ueber ein zusaetzliches Rueckgabefeld hier, mit eigenem Testfall und eigener
 * Sonde. Diese Aufgabe baut es NICHT auf Vorrat: ein Feld ohne Leser waere eine Zusage ohne
 * Nachweis.
 *
 * ⛔ UND SIE GEHOERT NICHT IN `_lib/grenzen.ts`: die Datei fuehrt ausschliesslich Zahlen,
 * die ueber eine Umgebungsvariable konfigurierbar sind (`_lib/grenzen.ts:2-3`). Der
 * Deckel ist eine Zusage der Oberflaeche, keine Betriebsgroesse.
 */
export const AUSWAHL_MAX = 20;

/**
 * Der Name des Suchparameters, 1:1 aus Spec:3472. ⛔ NICHT `deviceIds` — so heisst er im
 * Alt-Kiosk (`radio-inventar/apps/frontend/src/routes/loan.tsx:13`), und die Suite baut die
 * Bezeichner deutsch. Er steht als Wert, damit A18 (die Insel) und A19 (die Seite) beide
 * von hier lesen und die URL an beiden Enden dieselbe ist.
 */
export const AUSWAHL_PARAMETER = "geraete";

/**
 * Die EINE Normalisierung, die beide Richtungen benutzen.
 *
 * ⛔ SIE STEHT GENAU EINMAL, UND DAS IST DER ZWECK. Haetten `auswahlLesen` und
 * `auswahlSchreiben` je eigene Deckel- und Entdopplungszeilen, waere jede von ihnen
 * einzeln entfernbar, ohne dass ein Test rot wird — der Deckel bliebe „geprüft", waere
 * aber auf einem der beiden Wege weg. Aus demselben Grund sind beide Funktionen unten
 * duenn: sie tun nichts, was hier nicht steht.
 *
 * Vier Schritte: an Kommas trennen (ein Aufrufer darf auch schon getrennte Werte
 * uebergeben), Rand abschneiden, Leereintraege verwerfen, entdoppeln unter Beibehaltung der
 * ERSTEN Nennung, deckeln.
 */
function normalisiereIds(rohe: readonly string[]): string[] {
  const gesehen = new Set<string>();
  for (const roh of rohe) {
    for (const teil of roh.split(",")) {
      const id = teil.trim();
      if (id) gesehen.add(id);
    }
  }
  return [...gesehen].slice(0, AUSWAHL_MAX);
}

/**
 * Der Wert aus `searchParams.geraete` als Liste — entdoppelt, in der Reihenfolge der URL,
 * hoechstens `AUSWAHL_MAX` lang.
 *
 * ⛔ SIE WIRFT NIE. Der Wert ist Nutzereingabe; ein Wurf machte aus einer handgetippten URL
 * einen HTTP 500 auf der Ausleihseite — dieselbe Bauformregel, die Spec:2093-2098 fuer
 * `normalisiereCode` aufschreibt.
 */
export function auswahlLesen(rohwert: string | string[] | undefined): string[] {
  if (rohwert === undefined) return [];
  return normalisiereIds(Array.isArray(rohwert) ? rohwert : [rohwert]);
}

/**
 * Die Liste als Wert fuer `?geraete=` — die Umkehrung von `auswahlLesen`.
 *
 * ⛔ HIER WIRD NICHT SORTIERT. „Stabile Reihenfolge" (Spec:3474-3475) heisst: derselbe
 * Auswahlstand ergibt immer dieselbe Zeichenkette, damit `router.replace` sie billig
 * vergleichen kann — nicht: alphabetisch. Ein `sort()` hier verwuerfe die Reihenfolge, in
 * der der Mensch die Geraete angetippt hat, und die Bestaetigungsseite von A19 listete sie
 * in einer anderen Ordnung als die Uebersicht sie gezeigt hat.
 *
 * Eine leere Auswahl ergibt die leere Zeichenkette; der Aufrufer entfernt den Parameter
 * dann ganz, statt `?geraete=` in die URL zu schreiben.
 */
export function auswahlSchreiben(ids: string[]): string {
  return normalisiereIds(ids).join(",");
}
