"use client";

/*
 * DIE AUFLOESUNG SCHLUESSEL → KOMPONENTE. Gegenstueck zu `NavIkonName` in
 * types.ts, und der Grund fuer die Trennung steht dort: types.ts wird von
 * Server Components gelesen und darf keinen Zeichen-Wert kennen.
 *
 * DIESE DATEI IST CLIENT, weil SuiteNav es ist. Sie liegt bewusst NEBEN
 * `core/shell/icons.ts` und nicht darin: jene Map bedient den Modulwechsler
 * und traegt einen eigenen Test. Beide loesen auf dieselbe Quelle auf
 * (`core/ikonen`, Icons8); getrennt sind nur die Schluessel: Registry-Icons
 * hier, Navigationsnamen dort.
 */
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";
import type { NavIkonName } from "./types";

export const NAV_IKONEN: Record<NavIkonName, Icons8Name> = {
  uebersicht: "apps",
  artikel: "package",
  verfall: "calendar-expired",
  fahrzeuge: "truck",
  vorlagen: "layout",
  checks: "checked-checkbox",
  bz: "heart-pulse",
  sauerstoff: "wind",
  geraete: "cube",
  bestellung: "shopping-cart",
  inventur: "clipboard",
  journal: "history",
  tokens: "key",
  etiketten: "qr-code",
  import: "upload",
  // Drei Zeichen fuer die Verwaltung des Moduls `radio` (Spec:4218-4221). Sie stehen in
  // dieser Map UND in der Union `NavIkonName` — `Record<NavIkonName, Icons8Name>` erzwingt
  // beide Haelften typseitig, ein Union-Mitglied ohne Eintrag hier ist ein typecheck-Fehler.
  ausleihen: "swap",
  update: "refresh",
  versionen: "numbered-list",
  // Drei Zeichen fuer die Verwaltung des Moduls `uav` (Drohnentraining) — die
  // Begruendung, warum es neue sind und keine geliehenen, steht an der Union in
  // `types.ts`. `PiDrone` steht fuer den Weg zurueck in die Trainingsansicht, also
  // fuer das Modul selbst, nicht fuer eine Verwaltungsflaeche.
  teilnehmer: "people",
  katalog: "checklist",
  training: "drone",
  lagerorte: "lockers",
  // DRK-305 — Begruendung an der Union in `types.ts`.
  entnahme: "receive",
  // DRK-313 — die Spiegelung von `entnahme`; Begruendung ebenfalls dort.
  auffuellen: "give",
  pruefen: "edit-note",
  // DRK-312 — Begruendung an der Union in `types.ts`.
  ortsetiketten: "marker",
  // DRK-314 — Begruendung an der Union in `types.ts`. Der Pfeil nach unten in
  // die Schale ist die Bewegung, die die Box beschreibt: sie NIMMT AUF.
  entnahmebox: "inbox",
  // DRK-471 — Begründung an der Union in `types.ts`.
  stammdaten: "address-book",
  einstellungen: "settings",
  reader: "open-book",
  // DRK-471 (Stufe 5) — Begründung an der Union in `types.ts`. Der Rechnerturm trägt das
  // physische Gerät der Einsatzstelle, nicht seine Daten.
  rechner: "computer",
};

/**
 * Ein unbekannter Schluessel rendert NICHTS und wirft nicht: die Navigation
 * darf an einem Tippfehler nicht ausfallen. Ein fehlendes Zeichen ist ein
 * Schoenheitsfehler, eine leere Seite waere ein Ausfall.
 */
export function NavIkone({ name }: { name?: NavIkonName }) {
  if (!name) return null;
  const zeichen = NAV_IKONEN[name];
  if (!zeichen) return null;
  return <Icons8Ikone name={zeichen} groesse={16} />;
}
