import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";

/*
 * DIE EINE ZEICHENQUELLE DES MODULS — Vorbild `lagerbuch/_ui/ikonen.tsx`, das
 * dasselbe Problem zuerst geloest hat; sein Kopfkommentar traegt die volle
 * Begruendung, hier nur die fuer `aufgaben` geltenden Kernsaetze.
 *
 * DIE UNION `IkonName` IST DIE AUTORITAET, Icons8 (`core/ikonen`) loest
 * auf. `ikonen.test.tsx` prueft jeden literal benutzten Namen gegen sie.
 *
 * KEIN "use client". Diese Datei exportiert den TYP `IkonName`, und der
 * wandert als DATENFELD durch Server Components (z. B. eine Aufgabenzeile,
 * die ihr Zeichen serverseitig aus dem Status ableitet). Wer hier "use
 * client" ergaenzt, macht aus Falle 7 die Falle 6: HTTP 200 mit leerer Map
 * und still falschem Bild — genau das ist `core/shell/icons.ts` bis zum
 * 2026-08-01 passiert.
 *
 * KEIN ICON-PAKET. `Icons8Ikone` ist eine reine Funktion auf ein `<svg>`
 * ohne Context und ohne Direktive, sicher in Server Components; Falle 7
 * (`@ant-design/icons` wirft dort schon beim IMPORT) ist mit dem Paket
 * gegangen, `core/ikonen/ikonen.test.ts` haelt die Tuer zu.
 *
 * JEDES ZEICHEN IST `aria-hidden` (Bedeutung traegt immer der Text daneben,
 * Spec §9.1) und traegt `data-zeichen="<name>"` ins DOM: Tests pruefen „hier
 * steht das Warnzeichen", ohne an SVG-Pfaddaten zu kleben, die ein
 * Icons8-Update still aendern kann.
 *
 * NUR 15 NAMEN, nicht der ganze Icons8-Katalog: jeder deckt eine Stelle aus
 * Spec §8 ab (Faelligkeit/Warnung, Uhrzeit, Kalender, Person, erledigt,
 * zurueckgewiesen, Bild- und Textnachweis, Routine, Rang auf/ab,
 * Wochenwaehler vor/zurueck, Anlegen, der Kachel-Chevron). Wer spaeter ein
 * Zeichen braucht, das die Union nicht fuehrt, ergaenzt HIER.
 */
export type IkonName =
  | "warnung"
  | "uhr"
  | "kalender"
  | "person"
  | "haken"
  | "kreuz"
  | "nachweis-bild"
  | "nachweis-text"
  | "routine"
  | "rang-hoch"
  | "rang-runter"
  | "pfeil-links"
  | "pfeil-rechts"
  | "plus"
  | "chevron-rechts";

/** Ein Icons8-Zeichen je Name. */
export const ZEICHEN: Record<IkonName, Icons8Name> = {
  warnung: "warning",
  uhr: "clock",
  kalender: "calendar",
  person: "user",
  haken: "checkmark",
  kreuz: "close",
  "nachweis-bild": "image",
  "nachweis-text": "document",
  routine: "repeat",
  "rang-hoch": "chevron-up",
  "rang-runter": "chevron-down",
  "pfeil-links": "arrow-left",
  "pfeil-rechts": "arrow-right",
  plus: "plus",
  "chevron-rechts": "chevron-right",
};

/**
 * `aria-hidden`, `focusable` und `flex:none` stehen HIER und nicht an jeder
 * Aufrufstelle (`Icons8Ikone` setzt sie), und eine Regel,
 * die an vielen Stellen wiederholt werden muesste, wird an einer davon
 * vergessen.
 */
export function Ikone({ name, groesse = 16 }: { name: IkonName; groesse?: number }) {
  return <Icons8Ikone name={ZEICHEN[name]} groesse={groesse} data-zeichen={name} />;
}
