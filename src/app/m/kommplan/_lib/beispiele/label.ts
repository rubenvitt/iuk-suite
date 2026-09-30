import { baue } from "./bau";
import { LTS_KONTAKTE } from "./einsatz20260222";
import type { Beispiel } from "./index";

/** Nachbau „Kommunikationsplan Label" — die Vorlage, aus der Tagespläne entstehen. */
export const LABEL: Beispiel = {
  id: "vorlage-kommunikationsplan-label",
  titel: "Kommunikationsplan Label",
  typ: "kommunikationsplan", anlass: "Label", datum: null, istVorlage: true,
  stand: "2026-09-01T08:00:00.000Z", bearbeiter: "DRK Kreisverband Uelzen e. V. · Der Kreisbereitschaftsleiter",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [{ id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" }, { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" }],
    stellen: [
      { id: "lts", titel: "Leitstelle Uelzen", kontakte: LTS_KONTAKTE },
      { id: "el", titel: "Einsatzleiter", leiter: "Max Mustermann", zeichen: "rezept:D.1.4", eltern: "lts", verbindung: "r-ue-1" },
      { id: "patientenablage", titel: "Patientenablage", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2" },
      { id: "transport", titel: "Transportorganisation", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2" },
      { id: "bereitstellungsraum", titel: "Bereitstellungsraum", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        hervorheben: true, kontakte: { digitalfunk: "RK UE 40-92-1" } },
    ],
  }),
};
