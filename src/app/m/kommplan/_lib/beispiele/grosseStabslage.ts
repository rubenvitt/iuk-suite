import type { Verbindung } from "../plan/schema";
import { baue, type StelleEingabe } from "./bau";
import type { Beispiel } from "./index";

/**
 * Eine große Stab-Lage (Kat-Fall, Spec A4): Stab mit KatSL und Leitstelle, TEL, vier
 * Einsatzabschnittsleitungen mit 6, 8, 10 und 12 Abschnitten (Kamm ab 7) und je 2–8 Fahrzeugen.
 * Deterministisch erzeugt — dieselbe Lage in jedem Lauf. Auf A4 muss sie aufteilen.
 */
function erzeuge(): Beispiel["inhalt"] {
  const verbindungen: Verbindung[] = [
    { id: "standleitung", art: "draht", bezeichnung: "Standleitung" },
    { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
    { id: "stabsfunk", art: "dmo", bezeichnung: "Stabsfunk DMO" },
    ...[2, 3, 4, 5].map((n) => ({ id: `r-ue-${n}`, art: "tmo" as const, bezeichnung: `R_UE_${n}` })),
    ...[1, 2, 3, 4].map((n) => ({ id: `dmo-${600 + n}`, art: "dmo" as const, bezeichnung: `DMO ${600 + n}` })),
    { id: "k-ue-2", art: "tmo", bezeichnung: "K_UE_2" },
  ];
  const stellen: StelleEingabe[] = [
    { id: "stab", titel: "Stab", zeichen: "zusatz:stab", kontakte: { telefon: "0581 / 82-0", fax: "0581 / 82-1" } },
    { id: "katsl", titel: "Katastrophenschutzleitung", zeichen: "rezept:D.1.2", eltern: "stab", lage: "links", verbindung: "standleitung" },
    { id: "lts", titel: "Leitstelle Uelzen", eltern: "stab", lage: "rechts", verbindung: "r-ue-1" },
    { id: "tel", titel: "Technische Einsatzleitung", zeichen: "rezept:D.1.7", eltern: "stab", verbindung: "stabsfunk",
      kontakte: { funkrufname: "TEL Uelzen", digitalfunk: "RK UE 40-12-1" } },
  ];
  for (let a = 1; a <= 4; a++) {
    stellen.push({ id: `eal-${a}`, titel: `Einsatzabschnitt ${a}`, zeichen: "zusatz:eal", eltern: "tel", verbindung: `r-ue-${a + 1}`,
      kontakte: { digitalfunk: `RK UE 40-0${a}-1` } });
    for (let e = 1; e <= 4 + 2 * a; e++) {
      const anzahl = 2 + ((a * 7 + e * 3) % 7);
      stellen.push({
        id: `ea-${a}-${e}`, titel: `EA ${a}.${e}`, zeichen: "zusatz:ea", eltern: `eal-${a}`, verbindung: `dmo-${600 + a}`,
        kontakte: { digitalfunk: `RK UE 4${a}-${10 + e}-1` },
        einheiten: Array.from({ length: anzahl }, (_, i) => `${i % 2 === 0 ? "RTW" : "KTW"} RK UE 4${a}-8${e % 10}-${i + 1}`),
      });
    }
  }
  return baue({ verbindungen, stellen });
}

export const GROSSE_STABSLAGE: Beispiel = {
  id: "beispiel-grosse-stabslage",
  titel: "Fernmeldeskizze Kat-Fall (Beispiel)",
  typ: "fernmeldeskizze", anlass: "Übung Kat-Fall", datum: "2026-09-12", istVorlage: false,
  stand: "2026-09-12T07:30:00.000Z", bearbeiter: "Kat-Stab S 6",
  inhalt: erzeuge(),
};
