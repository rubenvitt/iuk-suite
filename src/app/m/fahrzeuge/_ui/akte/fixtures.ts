/**
 * Akten für die Komponententests (IDA-299), nach dem Vertrag in `_lib/akte/typen.ts`. Der Stand ist von
 * Hand gesetzt, nicht gerechnet: geprüft wird die Oberfläche, nicht die Fristrechnung (die hat
 * `_lib/akte/regeln.test.ts`). Nur für Tests gedacht.
 */
import type { FahrzeugDTO } from "../../_lib/daten";
import type { AkteDTO, AkteMitStand, PruefStand, PruefungDTO, ReifensatzDTO, Stufe, TechnikDTO } from "../../_lib/akte/typen";

export const HEUTE = "2026-11-12";

export const LEERE_TECHNIK: TechnikDTO = {
  modell: null, baujahr: null, laengeCm: null, breiteCm: null, hoeheCm: null, zggKg: null, leerKg: null,
  staerke: null, sitze: null, tragen: null, fuehrerschein: null, besonderheiten: [],
};

export function fahrzeug(teil: Partial<FahrzeugDTO> = {}): FahrzeugDTO {
  return {
    id: "fz-rtw", art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 1101",
    standort: "Uelzen", bemerkung: null, aktiv: true, aktualisiertAm: "2026-11-01T08:00:00.000Z", ...teil,
  };
}

export function pruefung(teil: Partial<PruefungDTO> = {}): PruefungDTO {
  return { id: "p-hu", art: "HU", name: "HU (TÜV)", monate: 24, kmAbstand: null, zuletzt: "2024-11-05", zuletztKm: null, vonHand: null, bemerkung: "", ...teil };
}

export function pruefStand(p: PruefungDTO, stufe: Stufe, text: string, teil: Partial<PruefStand> = {}): PruefStand {
  return { pruefung: p, stufe, text, faelligAm: "2026-11-05", kmGrenze: null, kmRest: null, ...teil };
}

const WINTER: ReifensatzDTO = { id: "s-winter", art: "Winter", dot: "3822", lager: "Fahrzeughalle Uelzen, Regal 2" };
const SOMMER: ReifensatzDTO = { id: "s-sommer", art: "Sommer", dot: "1423", lager: "Fahrzeughalle Uelzen, Regal 2" };

/** Ein RTW mit überfälliger HU, Service nach Kilometern, zwei Reifensätzen und vollständiger Technik. */
export function volleAkte(): AkteMitStand {
  const hu = pruefung();
  const service = pruefung({ id: "p-service", art: "Service", name: "Inspektion", monate: 12, kmAbstand: 20000, zuletzt: "2026-06-15", zuletztKm: 133140 });
  const loescher = pruefung({ id: "p-loescher", art: "Weitere", name: "Feuerlöscher", zuletzt: "2026-04-26" });
  const akte: AkteDTO = {
    fahrzeug: fahrzeug(),
    technik: {
      modell: "Mercedes Sprinter 519", baujahr: 2016, laengeCm: 695, breiteCm: 230, hoeheCm: 285, zggKg: 5000, leerKg: 4120,
      staerke: [0, 1, 1], sitze: 4, tragen: 1, fuehrerschein: "C1", besonderheiten: ["Sondersignal", "Landstrom"],
    },
    km: 152340, kmAm: "2026-11-10", aufgezogen: "Winter", reifensaetze: [WINTER, SOMMER], pruefungen: [hu, service, loescher],
  };
  const huStand = pruefStand(hu, "ueberfaellig", "seit 7 Tagen fällig");
  return {
    akte,
    stand: {
      pruefungen: [
        huStand,
        pruefStand(service, "bald", "noch 800 km", { faelligAm: "2027-06-15", kmGrenze: 153140, kmRest: 800 }),
        pruefStand(loescher, "ok", "bis 04/2028", { faelligAm: "2028-04-26" }),
      ],
      reifen: {
        satz: WINTER, alterJahre: 4,
        alter: { stufe: "ok", text: "DOT 3822, 4 Jahre", kurz: "Winter drauf" },
        saison: { stufe: "ok", text: "Winterreifen drauf", kurz: "Winter drauf" },
        stufe: "ok",
      },
      stufe: "ueberfaellig",
      naechster: huStand,
    },
  };
}

/** Ein Fahrzeug, bei dem alles in Ordnung ist — an einem zweiten Standort. */
export function ruhigeAkte(): AkteMitStand {
  const uvv = pruefung({ id: "p-uvv-mtf", art: "UVV", name: "UVV-Prüfung", monate: 12, zuletzt: "2026-09-13" });
  const stand = pruefStand(uvv, "ok", "bis 09/2027", { faelligAm: "2027-09-13" });
  return {
    akte: {
      fahrzeug: fahrzeug({ id: "fz-mtf", typ: "MTF", funkrufname: "Rotkreuz Bad Bevensen 12-19-1", funkkenner: "12-19-1", kennzeichen: "UE-RK 1401", standort: "Bad Bevensen" }),
      technik: LEERE_TECHNIK, km: 63410, kmAm: "2026-11-03", aufgezogen: null, reifensaetze: [], pruefungen: [uvv],
    },
    stand: { pruefungen: [stand], reifen: null, stufe: "ok", naechster: stand },
  };
}

/** Frisch angelegt: nichts erfasst. */
export function leereAkte(teil: Partial<FahrzeugDTO> = {}): AkteMitStand {
  return {
    akte: { fahrzeug: fahrzeug({ id: "fz-neu", ...teil }), technik: LEERE_TECHNIK, km: null, kmAm: null, aufgezogen: null, reifensaetze: [], pruefungen: [] },
    stand: { pruefungen: [], reifen: null, stufe: "ok", naechster: null },
  };
}
