"use client";

/*
 * DIE AUFLOESUNG SCHLUESSEL → KOMPONENTE. Gegenstueck zu `NavIkonName` in
 * types.ts, und der Grund fuer die Trennung steht dort: types.ts wird von
 * Server Components gelesen und darf keinen Zeichen-Wert kennen.
 *
 * DIESE DATEI IST CLIENT, weil SuiteNav es ist. Sie liegt bewusst NEBEN
 * `core/shell/icons.ts` und nicht darin: jene Map bedient den Modulwechsler
 * mit @ant-design/icons und traegt einen eigenen, repo-weiten Riegel
 * (icons.test.ts). Beides zu vermengen brauchte ein Modul, das beide Quellen
 * gleichzeitig will — das gibt es heute nicht.
 */
import type { IconType } from "react-icons/lib";
import {
  PiSquaresFour, PiPackage, PiCalendarX, PiTruck, PiLayout, PiCheckSquare, PiHeartbeat,
  PiWind, PiCube, PiShoppingCart, PiClipboardText, PiClockCounterClockwise, PiKey,
  PiQrCode, PiUploadSimple, PiArrowsLeftRight, PiArrowsClockwise, PiListNumbers,
} from "react-icons/pi";
import type { NavIkonName } from "./types";

export const NAV_IKONEN: Record<NavIkonName, IconType> = {
  uebersicht: PiSquaresFour,
  artikel: PiPackage,
  verfall: PiCalendarX,
  fahrzeuge: PiTruck,
  vorlagen: PiLayout,
  checks: PiCheckSquare,
  bz: PiHeartbeat,
  sauerstoff: PiWind,
  geraete: PiCube,
  bestellung: PiShoppingCart,
  inventur: PiClipboardText,
  journal: PiClockCounterClockwise,
  tokens: PiKey,
  etiketten: PiQrCode,
  import: PiUploadSimple,
  // Drei Zeichen fuer die Verwaltung des Moduls `radio` (Spec:4218-4221). Sie stehen in
  // dieser Map UND in der Union `NavIkonName` — `Record<NavIkonName, IconType>` erzwingt
  // beide Haelften typseitig, ein Union-Mitglied ohne Eintrag hier ist ein typecheck-Fehler.
  ausleihen: PiArrowsLeftRight,
  update: PiArrowsClockwise,
  versionen: PiListNumbers,
};

/**
 * Ein unbekannter Schluessel rendert NICHTS und wirft nicht: die Navigation
 * darf an einem Tippfehler nicht ausfallen. Ein fehlendes Zeichen ist ein
 * Schoenheitsfehler, eine leere Seite waere ein Ausfall.
 */
export function NavIkone({ name }: { name?: NavIkonName }) {
  if (!name) return null;
  const Zeichen = NAV_IKONEN[name];
  if (!Zeichen) return null;
  return <Zeichen size={16} aria-hidden focusable="false" style={{ flex: "none" }} />;
}
