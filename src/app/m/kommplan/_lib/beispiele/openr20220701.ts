import { baue } from "./bau";
import { LTS_KONTAKTE } from "./einsatz20260222";
import type { Beispiel } from "./index";

/**
 * Nachbau „Kommunikationsplan OpenR 01.07.2022". Unter EA 1 hängen „DMO 608" und „R_UE_2", unter
 * EA 2 „DMO 609" und „R_UE_2", unter EA 3 und EA 4 „R_UE_2": Kanäle, die der Abschnitt für seine
 * Fahrzeuge BENUTZT, ohne Gegenstelle — als `kanaele` (Abweichung 12), nicht als Reserve. Reserve
 * ist allein UE_K_1, das in der Vorlage lose steht.
 */
export const OPENR_20220701: Beispiel = {
  id: "beispiel-openr-2022-07-01",
  titel: "Kommunikationsplan OpenR 01.07.2022",
  typ: "kommunikationsplan", anlass: "OpenR", datum: "2022-07-01", istVorlage: false,
  stand: "2022-06-28T10:00:00.000Z", bearbeiter: "KBL DRK Kreisverband Uelzen e. V.",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [
      { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
      { id: "bos-res-09", art: "tmo", bezeichnung: "BOS_NI_RES_09" },
      { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" },
      { id: "r-ue-3", art: "tmo", bezeichnung: "R_UE_3" },
      { id: "ue-k-1", art: "tmo", bezeichnung: "UE_K_1" },
      { id: "dmo-608", art: "dmo", bezeichnung: "DMO 608" },
      { id: "dmo-609", art: "dmo", bezeichnung: "DMO 609" },
    ],
    stellen: [
      { id: "lts", titel: "Leitstelle Uelzen", kontakte: LTS_KONTAKTE },
      { id: "fuekw", titel: "FüKW", eltern: "lts", verbindung: "r-ue-1",
        kontakte: { digitalfunk: "RK UE 40-12-1", telefon: "0580 4999 9790", email: "elw@drk-uelzen.de" } },
      { id: "el", titel: "Einsatzleiter", zeichen: "rezept:D.1.4", leiter: "Max Mustermann", eltern: "fuekw", lage: "links", verbindung: "bos-res-09",
        kontakte: { digitalfunk: "RK UE 97-03", telefon: "0581 0000000", mobil: "0170 0000000", email: "max.mustermann@example.org" },
        einheiten: ["KdoW 40-10-1"] },
      { id: "ea1", titel: "EA 1 Behandlungsplatz", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["dmo-608", "r-ue-2"], kontakte: { digitalfunk: "RK UE 40-05-1" },
        einheiten: [["WLF", "40-66-1 AB MANV"], "GW-San 40-96-1", "MTW 40-17-1", ["AB", "Alles"], ["AB", "Sanitätsstation"], "KdoW 40-10-2"] },
      { id: "ea2", titel: "EA 2 Bühne", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["dmo-609", "r-ue-2"], kontakte: { funkrufname: "Lüneburg", digitalfunk: "RK LG 45-11-1" },
        einheiten: ["ELW RK LG 45-11-1", ["GW Betreuung", "RK LG 45-74-10"], "MTW RK LG 45-17-12"] },
      { id: "ea3", titel: "EA 3 Verpflegung", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["r-ue-2"], kontakte: { digitalfunk: "RK UE 40-05-2" },
        einheiten: [["GW Verpflegung", "40-74-1"], ["GW Betreuung", "40-74-2"], "MTW 44-17-1", ["Foodtruck", ""], ["Kühlanhänger", ""]] },
      { id: "ea4", titel: "EA 4 Logistik & Technik", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["r-ue-2"], kontakte: { digitalfunk: "RK UE 40-05-3" },
        einheiten: ["MTW 40-17-2", ["NEA", "60 KVA"], ["Teleskoplader", ""]] },
      { id: "rettungsmittel", titel: "Rettungsmittel", zeichen: "zusatz:ea", eltern: "fuekw", verbindung: "r-ue-2",
        einheiten: ["NEF 41-82-2", "RTW 40-83-2", "RTW 40-83-3", "RTW 40-83-4", "RTW 40-83-5", "RTW 40-83-6"] },
      { id: "fussstreife", titel: "Fußstreife", zeichen: "zusatz:ea", eltern: "fuekw", verbindung: "r-ue-3",
        einheiten: [
          ["Fußstreife", "1 (EA 1)"], ["Fußstreife", "2 (EA 1)"], ["Fußstreife", "3 (EA 1)"],
          ["Fußstreife", "4 (EA 2) Lüneburg"], ["Fußstreife", "5 (EA 2) Lüneburg"],
        ] },
    ],
  }),
};
