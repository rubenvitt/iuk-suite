/**
 * DER VERTRAG ZWISCHEN DER INSEL `VerwaltungsZaehlung` UND IHREN REITERN.
 *
 * Die Insel besitzt den Zählstand (`ZaehlZustand`, abgelegt über `useEntwurf`);
 * jeder Reiter bekommt ihn lesend und ändert ihn nur über `aendere` — eine
 * Funktion vom alten auf den neuen Stand, nie ein Setzen von außen. So bleibt
 * der Entwurf die eine Quelle, aus der Reiterzähler, Leiste, Sperrgründe und
 * Nutzlast (`_lib/verwaltungscheck.ts`) rechnen.
 *
 * Nur Typen, keine Direktive: Reiter und Insel importieren sie gleichermaßen.
 */
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { ZaehlZustand } from "../../../../../_lib/verwaltungscheck";

export type Aendere = (f: (z: ZaehlZustand) => ZaehlZustand) => void;

export type ReiterProps = {
  daten: VerwaltungscheckDaten;
  zustand: ZaehlZustand;
  aendere: Aendere;
  /** Ein Abschluss liegt (wird gesendet oder wartet auf den nächsten Versuch): nichts ist bedienbar. */
  gesperrt: boolean;
};
