import type { IconType } from "react-icons/lib";
import {
  PiArrowLeft, PiArrowRight, PiCalendar, PiCaretDown, PiCaretRight, PiCaretUp,
  PiCheck, PiClock, PiFileText, PiImage, PiPlus, PiRepeat, PiUser, PiWarning, PiX,
} from "react-icons/pi";

/*
 * DIE EINE ZEICHENQUELLE DES MODULS — Vorbild `lagerbuch/_ui/ikonen.tsx`, das
 * dasselbe Problem zuerst geloest hat; sein Kopfkommentar traegt die volle
 * Begruendung, hier nur die fuer `aufgaben` geltenden Kernsaetze.
 *
 * DIE UNION `IkonName` IST DIE AUTORITAET, Phosphor (`react-icons/pi`) loest
 * auf. `ikonen.test.tsx` prueft jeden literal benutzten Namen gegen sie.
 *
 * KEIN "use client". Diese Datei exportiert den TYP `IkonName`, und der
 * wandert als DATENFELD durch Server Components (z. B. eine Aufgabenzeile,
 * die ihr Zeichen serverseitig aus dem Status ableitet). Wer hier "use
 * client" ergaenzt, macht aus Falle 7 die Falle 6: HTTP 200 mit leerer Map
 * und still falschem Bild — genau das ist `core/shell/icons.ts` bis zum
 * 2026-08-01 passiert.
 *
 * `@ant-design/icons` KOMMT NICHT VOR. Der nackte Spezifizierer ergibt in
 * einer Server Component HTTP 500 beim IMPORT, nicht beim Rendern, und
 * `"use client"` behebt das nicht, sondern macht es still. `react-icons/pi`
 * ist gemessen unbedenklich — Beleg ist das Lagerbuch-Modul.
 *
 * JEDES ZEICHEN IST `aria-hidden` (Bedeutung traegt immer der Text daneben,
 * Spec §9.1) und traegt `data-zeichen="<name>"` ins DOM: Tests pruefen „hier
 * steht das Warnzeichen", ohne an SVG-Pfaddaten zu kleben, die ein
 * Phosphor-Update still aendern kann.
 *
 * NUR 15 NAMEN, nicht Phosphors ganzes Alphabet: jeder deckt eine Stelle aus
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

/** Ein Phosphor-Zeichen je Name. */
export const ZEICHEN: Record<IkonName, IconType> = {
  warnung: PiWarning,
  uhr: PiClock,
  kalender: PiCalendar,
  person: PiUser,
  haken: PiCheck,
  kreuz: PiX,
  "nachweis-bild": PiImage,
  "nachweis-text": PiFileText,
  routine: PiRepeat,
  "rang-hoch": PiCaretUp,
  "rang-runter": PiCaretDown,
  "pfeil-links": PiArrowLeft,
  "pfeil-rechts": PiArrowRight,
  plus: PiPlus,
  "chevron-rechts": PiCaretRight,
};

/**
 * `aria-hidden`, `focusable` und `flex:none` stehen HIER und nicht an jeder
 * Aufrufstelle: react-icons setzt keines davon von selbst, und eine Regel,
 * die an vielen Stellen wiederholt werden muesste, wird an einer davon
 * vergessen.
 */
export function Ikone({ name, groesse = 16 }: { name: IkonName; groesse?: number }) {
  const Zeichen = ZEICHEN[name];
  return (
    <Zeichen size={groesse} aria-hidden focusable="false" data-zeichen={name} style={{ flex: "none" }} />
  );
}
