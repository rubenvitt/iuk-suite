import type { KeyboardEvent } from "react";

/**
 * `Enter` IM DATUMS-, MONATS- ODER ZEITFELD UEBERNIMMT DIE EINGABE — UND SENDET NICHT DAS FORMULAR
 * AB. Gehoert als `onKeyDown` an jeden antd-`DatePicker`/`TimePicker`, der in einem `<form>` mit
 * Absendeknopf steht.
 *
 * `@rc-component/picker` uebernimmt eine getippte Eingabe bei `Enter` (`Selector/Input.js`s
 * `onSharedKeyDown` ruft `onSubmit()`), ruft danach diesen Handler und ruft `preventDefault()`
 * SELBST NICHT. In einem `<form>` bleibt damit die implizite Absendung des Browsers stehen: der
 * Tastendruck, der das Datum uebernimmt, betaetigt im selben Zug den ersten Absendeknopf.
 *
 * DAS IST NICHT NUR EIN SCHOENHEITSFEHLER. In `aufgaben` (`ZuweisenInline.tsx`) IST jeder
 * Absendeknopf eine Person („der Klick auf den Namen ist das Absenden"): ein `Enter` im
 * Zeitvorschlag verteilte die Aufgabe an die ERSTE Person der Liste. Im `lagerbuch` buchte ein
 * `Enter` im Verfallsmonat den Zugang, bevor jemand „Zugang buchen" gedrueckt hatte (DRK-483) —
 * gemessen gegen den gebauten Stand mit dem getippten Monat, also ohne Datenfehler, aber mit
 * Bestandswirkung aus einem Tastendruck, der „Monat uebernehmen" meinte.
 *
 * DIE REIHENFOLGE MACHT ES MOEGLICH: rc-pickers eigene Uebernahme laeuft VOR diesem Handler. Wir
 * unterdruecken also nur die Folge des Tastendrucks, nicht seine Wirkung im Feld. Mit unterdrueckt
 * ist rc-pickers „`Enter` oeffnet das geschlossene Panel" (`useInputProps.js` fragt
 * `event.defaultPrevented`) — das zweite `Enter` nach der Uebernahme tut also nichts, statt das
 * Panel wieder aufzuklappen.
 *
 * Bewusst OHNE `"use client"`: eine reine Funktion, die jede Client-Insel importiert (Falle 6).
 */
export function enterUebernimmtNurDasFeld(ereignis: KeyboardEvent<HTMLElement>): void {
  if (ereignis.key === "Enter") ereignis.preventDefault();
}
