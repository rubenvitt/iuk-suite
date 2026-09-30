import { baue } from "./bau";
import type { Beispiel } from "./index";

/**
 * Nachbau „Fernmeldeskizze" auf Stabsebene: KatSL links über Draht, Leitstelle rechts über Funk,
 * darunter der Stabsbus (DMO). Die Vorlage lässt den Bus offen; zwei Einsatzabschnitte füllen ihn.
 */
export const FERNMELDESKIZZE_STAB: Beispiel = {
  id: "vorlage-fernmeldeskizze-stab",
  titel: "Fernmeldeskizze",
  typ: "fernmeldeskizze", anlass: null, datum: null, istVorlage: true,
  stand: "2026-09-30T09:56:00.000Z", bearbeiter: "Kat-Stab",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [
      { id: "standleitung", art: "draht", bezeichnung: "Standleitung" },
      { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
      { id: "stabsfunk", art: "dmo", bezeichnung: "Stabsfunk DMO" },
    ],
    stellen: [
      { id: "stab", titel: "Stab", zeichen: "zusatz:stab" },
      { id: "katsl", titel: "PD", zeichen: "rezept:D.1.2", eltern: "stab", lage: "links", verbindung: "standleitung" },
      { id: "lts", titel: "Leitstelle", eltern: "stab", lage: "rechts", verbindung: "r-ue-1" },
      { id: "ea-nord", titel: "Einsatzabschnitt Nord", zeichen: "zusatz:eal", eltern: "stab", verbindung: "stabsfunk" },
      { id: "ea-sued", titel: "Einsatzabschnitt Süd", zeichen: "zusatz:eal", eltern: "stab", verbindung: "stabsfunk" },
    ],
  }),
};
