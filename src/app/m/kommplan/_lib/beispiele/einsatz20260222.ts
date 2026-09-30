import { baue } from "./bau";
import type { Beispiel } from "./index";

/** Nachbau „Kommunikationsplan Einsatz 22.02.2026" (Excel-Vorlage, Blatt „Einsatz"). */
const LTS_KONTAKTE = {
  digitalfunk: "Leitstelle", telefon: "0581 / 82 266", mobil: "0581 / 19222", fax: "0581 / 82 284", email: "fel@landkreis-uelzen.de",
};
export { LTS_KONTAKTE };

export const EINSATZ_20260222: Beispiel = {
  id: "beispiel-einsatz-2026-02-22",
  titel: "Kommunikationsplan Einsatz 22.02.2026",
  typ: "kommunikationsplan", anlass: "Einsatz", datum: "2026-02-22", istVorlage: false,
  stand: "2026-02-16T09:00:00.000Z", bearbeiter: "BL BVS",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [
      { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
      { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" },
      { id: "r-ue-3", art: "tmo", bezeichnung: "R_UE_3" },
      { id: "k-ue-2", art: "tmo", bezeichnung: "K_UE_2" },
    ],
    stellen: [
      { id: "lts", titel: "Leitstelle Uelzen", kontakte: LTS_KONTAKTE },
      { id: "el", titel: "Einsatzleitung", zeichen: "rezept:D.1.4", eltern: "lts", verbindung: "r-ue-1",
        kontakte: { digitalfunk: "RK UE 40-00 Wache", telefon: "0581 9032293" } },
      { id: "ea1", titel: "EA 1 Notunterkunft 1. HEG", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        kontakte: { digitalfunk: "RK UE 40-05-1", telefon: "EA NuK 1." },
        einheiten: ["MTW RK UE 40-17-3", "MTW RK UE 40-17-1", ["Foodtruck", ""], ["GW-Ver", "RK UE 40-74-1"], "RTW RK UE 40-83-3", ["NEA", "60 KVA"]] },
      { id: "ea2", titel: "EA 2 Notunterkunft 2. Sternschule", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        kontakte: { digitalfunk: "RK LG", telefon: "EA NuK 2." },
        einheiten: ["MTW RK UE 40-17-2", "RTW RK UE 40-83-4", ["Kühlanhänger", ""]] },
      { id: "ea3", titel: "EA 3 Evakuierung Rosenmauer", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        kontakte: { digitalfunk: "RK UE 40-12-1", telefon: "40-12-1" } },
      { id: "ea5", titel: "EA 5 Transport", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-3",
        kontakte: { digitalfunk: "RK UE 40-00" },
        einheiten: [
          "RTW RK UE 40-83-5", "RTW RK UE 40-83-6", "KTW RK UE 40-92-1", "KTW RK UE 40-92-2", "KTW RK UE 41-92-8",
          "KTW RK UE 41-92-9", "KTW RK UE 41-92-10", "KTW RK UE 41-92-11", "KTW RK UE 41-92-12",
        ] },
    ],
  }),
};
